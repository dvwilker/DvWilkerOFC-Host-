const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { getProcessManager } = require('../services/processManager');

const USERS_FILE = path.join(__dirname, '../data/users.json');
const pm = getProcessManager();

// Middleware de autenticación
function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
}

// Funciones helper
function getUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getUserById(id) {
    const users = getUsers();
    return users.find(u => u.id === id);
}

// Límites de planes
const PLAN_LIMITS = {
    free: { servers: 1, ram: 1024, storage: 800 },
    premium: { servers: 1, ram: 2048, storage: 2048 }
};

// LISTAR SERVIDORES DEL USUARIO
router.get('/list', authMiddleware, (req, res) => {
    try {
        const user = getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const serversWithStatus = (user.servers || []).map(server => {
            const info = pm.getServerInfo(server.id);
            return { ...server, ...info };
        });

        res.json({ servers: serversWithStatus, plan: user.plan, limits: PLAN_LIMITS[user.plan] });

    } catch (error) {
        res.status(500).json({ error: 'Error al listar servidores' });
    }
});

// CREAR SERVIDOR (CLONAR REPO)
router.post('/create', authMiddleware, async (req, res) => {
    try {
        const { name, repoUrl, mainFile = 'index.js' } = req.body;
        
        if (!name || !repoUrl) {
            return res.status(400).json({ error: 'Nombre y URL del repositorio son requeridos' });
        }

        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === req.user.id);
        const user = users[userIndex];

        if (!user.servers) user.servers = [];

        // Verificar límite de servidores
        const limits = PLAN_LIMITS[user.plan];
        if (user.servers.length >= limits.servers) {
            return res.status(400).json({ error: `Tu plan ${user.plan} solo permite ${limits.servers} servidor(es)` });
        }

        const serverId = uuidv4();
        const serverPath = path.join(__dirname, '../servers', user.id, serverId);

        // Crear directorio
        fs.mkdirSync(serverPath, { recursive: true });

        res.json({ success: true, message: 'Clonando repositorio...', serverId });

        // Clonar repo en background
        const git = simpleGit();
        
        try {
            await git.clone(repoUrl, serverPath);
            
            // Instalar dependencias si existe package.json
            const packagePath = path.join(serverPath, 'package.json');
            if (fs.existsSync(packagePath)) {
                const { execSync } = require('child_process');
                try {
                    execSync('npm install', { cwd: serverPath, timeout: 120000 });
                } catch (e) {
                    console.log('npm install warning:', e.message);
                }
            }

            // Guardar servidor en usuario
            const newServer = {
                id: serverId,
                name,
                repoUrl,
                mainFile,
                path: serverPath,
                createdAt: new Date().toISOString(),
                status: 'offline'
            };

            user.servers.push(newServer);
            saveUsers(users);

            // Notificar via WebSocket
            if (global.broadcastToServer) {
                global.broadcastToServer(serverId, { 
                    type: 'system', 
                    data: { text: '✅ Repositorio clonado y dependencias instaladas', time: new Date().toISOString() }
                });
            }

        } catch (gitError) {
            // Limpiar directorio si falla
            fs.rmSync(serverPath, { recursive: true, force: true });
            console.error('Error clonando:', gitError);
        }

    } catch (error) {
        console.error('Error creando servidor:', error);
        res.status(500).json({ error: 'Error al crear servidor' });
    }
});

// OBTENER INFO DE UN SERVIDOR
router.get('/:serverId', authMiddleware, async (req, res) => {
    try {
        const { serverId } = req.params;
        const user = getUserById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const server = (user.servers || []).find(s => s.id === serverId);
        if (!server) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const info = pm.getServerInfo(serverId);
        const stats = await pm.getStats(serverId);

        res.json({ 
            ...server, 
            ...info,
            stats,
            limits: PLAN_LIMITS[user.plan]
        });

    } catch (error) {
        res.status(500).json({ error: 'Error al obtener servidor' });
    }
});

// INICIAR SERVIDOR
router.post('/:serverId/start', authMiddleware, async (req, res) => {
    try {
        const { serverId } = req.params;
        const user = getUserById(req.user.id);
        const server = (user.servers || []).find(s => s.id === serverId);

        if (!server) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        await pm.start(serverId, server.path, server.mainFile);
        res.json({ success: true, message: 'Servidor iniciado' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DETENER SERVIDOR
router.post('/:serverId/stop', authMiddleware, async (req, res) => {
    try {
        const { serverId } = req.params;
        await pm.stop(serverId);
        res.json({ success: true, message: 'Servidor detenido' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// REINICIAR SERVIDOR
router.post('/:serverId/restart', authMiddleware, async (req, res) => {
    try {
        const { serverId } = req.params;
        const user = getUserById(req.user.id);
        const server = (user.servers || []).find(s => s.id === serverId);

        if (!server) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        await pm.restart(serverId);
        res.json({ success: true, message: 'Servidor reiniciado' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// KILL FORZADO
router.post('/:serverId/kill', authMiddleware, async (req, res) => {
    try {
        const { serverId } = req.params;
        await pm.kill(serverId);
        res.json({ success: true, message: 'Proceso terminado' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// OBTENER ESTADÍSTICAS
router.get('/:serverId/stats', authMiddleware, async (req, res) => {
    try {
        const { serverId } = req.params;
        const stats = await pm.getStats(serverId);
        res.json(stats);

    } catch (error) {
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// LISTAR ARCHIVOS
router.get('/:serverId/files', authMiddleware, (req, res) => {
    try {
        const { serverId } = req.params;
        const { path: subPath = '' } = req.query;
        
        const user = getUserById(req.user.id);
        const server = (user.servers || []).find(s => s.id === serverId);

        if (!server) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const fullPath = path.join(server.path, subPath);
        
        // Seguridad: verificar que no salga del directorio del servidor
        if (!fullPath.startsWith(server.path)) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Directorio no encontrado' });
        }

        const items = fs.readdirSync(fullPath, { withFileTypes: true });
        const files = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(subPath, item.name)
        }));

        res.json({ files, currentPath: subPath });

    } catch (error) {
        res.status(500).json({ error: 'Error al listar archivos' });
    }
});

// LEER ARCHIVO
router.get('/:serverId/file', authMiddleware, (req, res) => {
    try {
        const { serverId } = req.params;
        const { path: filePath } = req.query;
        
        const user = getUserById(req.user.id);
        const server = (user.servers || []).find(s => s.id === serverId);

        if (!server) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const fullPath = path.join(server.path, filePath);
        
        if (!fullPath.startsWith(server.path)) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        res.json({ content, path: filePath });

    } catch (error) {
        res.status(500).json({ error: 'Error al leer archivo' });
    }
});

// GUARDAR ARCHIVO
router.put('/:serverId/file', authMiddleware, (req, res) => {
    try {
        const { serverId } = req.params;
        const { path: filePath, content } = req.body;
        
        const user = getUserById(req.user.id);
        const server = (user.servers || []).find(s => s.id === serverId);

        if (!server) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const fullPath = path.join(server.path, filePath);
        
        if (!fullPath.startsWith(server.path)) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        fs.writeFileSync(fullPath, content);
        res.json({ success: true, message: 'Archivo guardado' });

    } catch (error) {
        res.status(500).json({ error: 'Error al guardar archivo' });
    }
});

// ELIMINAR SERVIDOR
router.delete('/:serverId', authMiddleware, async (req, res) => {
    try {
        const { serverId } = req.params;
        
        // Detener si está corriendo
        try {
            await pm.kill(serverId);
        } catch (e) {}

        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === req.user.id);
        const user = users[userIndex];

        const serverIndex = (user.servers || []).findIndex(s => s.id === serverId);
        if (serverIndex === -1) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const server = user.servers[serverIndex];

        // Eliminar archivos
        if (fs.existsSync(server.path)) {
            fs.rmSync(server.path, { recursive: true, force: true });
        }

        // Eliminar de la lista
        user.servers.splice(serverIndex, 1);
        saveUsers(users);

        res.json({ success: true, message: 'Servidor eliminado' });

    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar servidor' });
    }
});

// CAMBIAR ARCHIVO PRINCIPAL
router.patch('/:serverId/main-file', authMiddleware, (req, res) => {
    try {
        const { serverId } = req.params;
        const { mainFile } = req.body;

        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === req.user.id);
        const user = users[userIndex];

        const server = (user.servers || []).find(s => s.id === serverId);
        if (!server) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        server.mainFile = mainFile;
        saveUsers(users);

        res.json({ success: true, message: 'Archivo principal actualizado' });

    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

module.exports = router;
