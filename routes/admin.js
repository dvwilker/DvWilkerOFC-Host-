const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../data/users.json');

// Middleware de autenticación admin
function adminMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const users = getUsers();
        const user = users.find(u => u.id === decoded.id);
        
        if (!user || !user.isAdmin) {
            return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
}

function getUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// OBTENER TODOS LOS USUARIOS (solo admin)
router.get('/users', adminMiddleware, (req, res) => {
    try {
        const users = getUsers();
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            plan: u.plan,
            coins: u.coins || 0,
            isAdmin: u.isAdmin || false,
            verified: u.verified,
            servers: u.servers ? u.servers.length : 0,
            createdAt: u.createdAt
        }));
        res.json({ users: safeUsers });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// AÑADIR COINS A UN USUARIO
router.post('/add-coins', adminMiddleware, (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Usuario y cantidad válida requeridos' });
        }
        
        const users = getUsers();
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        if (!user.coins) user.coins = 0;
        user.coins += parseInt(amount);
        
        saveUsers(users);
        
        res.json({ 
            success: true, 
            message: `Se añadieron ${amount} coins a ${user.username}`,
            newBalance: user.coins
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al añadir coins' });
    }
});

// ELIMINAR CUENTA
router.delete('/delete-user/:userId', adminMiddleware, (req, res) => {
    try {
        const { userId } = req.params;
        
        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const user = users[userIndex];
        
        // No permitir borrar al admin principal
        if (user.email === 'developer.wilker.ofc@gmail.com') {
            return res.status(403).json({ error: 'No se puede eliminar al administrador principal' });
        }
        
        // Eliminar carpeta de servidores del usuario
        const userServerDir = path.join(__dirname, '../servers', userId);
        if (fs.existsSync(userServerDir)) {
            fs.rmSync(userServerDir, { recursive: true, force: true });
        }
        
        users.splice(userIndex, 1);
        saveUsers(users);
        
        res.json({ success: true, message: `Usuario ${user.username} eliminado` });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

// CAMBIAR PLAN DE USUARIO
router.patch('/change-plan', adminMiddleware, (req, res) => {
    try {
        const { userId, plan } = req.body;
        
        if (!userId || !plan || !['free', 'premium'].includes(plan)) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }
        
        const users = getUsers();
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        user.plan = plan;
        saveUsers(users);
        
        res.json({ 
            success: true, 
            message: `Plan de ${user.username} cambiado a ${plan}`,
            newPlan: plan
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al cambiar plan' });
    }
});

// VERIFICAR SI EL USUARIO ES ADMIN
router.get('/check', adminMiddleware, (req, res) => {
    res.json({ isAdmin: true });
});

module.exports = router;
