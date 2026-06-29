require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Crear directorios necesarios
const dirs = ['data', 'servers'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Inicializar archivos de datos
if (!fs.existsSync('data/users.json')) {
    fs.writeFileSync('data/users.json', '[]');
}

// Rutas
const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/server');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/admin', adminRoutes);

// Rutas de páginas
const pages = ['login', 'register', 'forgot-password', 'reset-password', 'verify', 'dashboard', 'panel', 'admin', 'dashboard-hiden', 'panel-hiden'];
pages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', `${page}.html`));
    });
});

// Ruta principal redirige al nuevo dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard-hiden');
});

// WebSocket para consola en tiempo real
const { getProcessManager } = require('./services/processManager');
const pm = getProcessManager();

// Almacenar conexiones WebSocket por servidor
const wsConnections = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const serverId = url.searchParams.get('serverId');
    const token = url.searchParams.get('token');
    
    if (!serverId) {
        ws.close(1008, 'Server ID required');
        return;
    }
    
    // Verificar token JWT
    const jwt = require('jsonwebtoken');
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Agregar a conexiones
        if (!wsConnections.has(serverId)) {
            wsConnections.set(serverId, new Set());
        }
        wsConnections.get(serverId).add(ws);
        
        console.log(`[WS] Cliente conectado al servidor: ${serverId}`);
        
        // Enviar historial de consola
        const history = pm.getConsoleHistory(serverId);
        if (history.length > 0) {
            ws.send(JSON.stringify({ type: 'history', data: history }));
        }
        
        ws.on('close', () => {
            wsConnections.get(serverId)?.delete(ws);
            console.log(`[WS] Cliente desconectado del servidor: ${serverId}`);
        });
        
        // Manejar comandos desde la consola web
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'command') {
                    pm.sendCommand(serverId, data.command);
                }
            } catch (e) {}
        });
        
    } catch (err) {
        ws.close(1008, 'Invalid token');
    }
});

// Función para enviar output a todos los clientes conectados a un servidor
global.broadcastToServer = (serverId, message) => {
    const clients = wsConnections.get(serverId);
    if (clients) {
        const data = JSON.stringify(message);
        clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });
    }
};

// Ruta 404
app.use((req, res) => {
    res.redirect('/');
});

const PORT = process.env.PORT || 24606;
server.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     🚀 DvWilkerOFC HOST v2.0           ║');
    console.log('║     Panel de Hosting Premium           ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  🌐 URL: ${process.env.BASE_URL}`);
    console.log(`║  🔌 Puerto: ${PORT}`);
    console.log(`║  📡 WebSocket: Activo`);
    console.log('╚════════════════════════════════════════╝');
    console.log('✅ Servidor listo para recibir conexiones');
});
