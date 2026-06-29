const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const USERS_FILE = path.join(__dirname, '../data/users.json');

// Configurar transporter de email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Funciones helper
function getUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// REGISTRO
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        const users = getUsers();
        
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'El nombre de usuario ya existe' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = uuidv4();
        
        const newUser = {
            id: uuidv4(),
            username,
            email,
            password: hashedPassword,
            verified: false,
            verificationToken,
            plan: 'free',
            coins: 0,
            isAdmin: false,
            servers: [],
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveUsers(users);

        // Crear carpeta del usuario para sus servidores
        const userServerDir = path.join(__dirname, '../servers', newUser.id);
        if (!fs.existsSync(userServerDir)) {
            fs.mkdirSync(userServerDir, { recursive: true });
        }

        // Enviar email de verificación
        const verifyUrl = `${process.env.BASE_URL}/verify?token=${verificationToken}`;
        
        await transporter.sendMail({
            from: `"DvWilkerOFC HOST" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🚀 Verifica tu cuenta - DvWilkerOFC HOST',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; border-radius: 15px;">
                    <h1 style="color: #00d4ff; text-align: center;">🚀 DvWilkerOFC HOST</h1>
                    <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; margin: 20px 0;">
                        <h2 style="color: #fff;">¡Hola ${username}!</h2>
                        <p style="color: #ccc; font-size: 16px;">Gracias por registrarte. Haz clic en el botón para verificar tu cuenta:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${verifyUrl}" style="background: linear-gradient(135deg, #00d4ff, #0099cc); color: #fff; padding: 15px 40px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">✅ Verificar mi cuenta</a>
                        </div>
                        <p style="color: #888; font-size: 12px;">Si no creaste esta cuenta, ignora este correo.</p>
                    </div>
                </div>
            `
        });

        res.json({ success: true, message: 'Registro exitoso. Revisa tu correo para verificar tu cuenta.' });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// VERIFICAR EMAIL
router.get('/verify', (req, res) => {
    try {
        const { token } = req.query;
        const users = getUsers();
        const user = users.find(u => u.verificationToken === token);

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                error: 'Token inválido o ya utilizado' 
            });
        }

        user.verified = true;
        user.verificationToken = null;
        saveUsers(users);

        res.json({ 
            success: true, 
            message: 'Cuenta verificada exitosamente' 
        });

    } catch (error) {
        console.error('Error en verificación:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error en el servidor' 
        });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = getUsers();
        const user = users.find(u => u.email === email);

        if (!user) {
            return res.status(400).json({ error: 'Credenciales inválidas' });
        }

        if (!user.verified) {
            return res.status(400).json({ error: 'Debes verificar tu correo primero' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                plan: user.plan,
                coins: user.coins || 0,
                isAdmin: user.isAdmin || false,
                servers: user.servers
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const users = getUsers();
        const user = users.find(u => u.email === email);

        if (!user) {
            return res.json({ success: true, message: 'Si el correo existe, recibirás instrucciones.' });
        }

        const resetToken = uuidv4();
        user.resetToken = resetToken;
        user.resetExpires = Date.now() + 3600000; // 1 hora
        saveUsers(users);

        const resetUrl = `${process.env.BASE_URL}/reset-password?token=${resetToken}`;

        await transporter.sendMail({
            from: `"DvWilkerOFC HOST" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🔐 Recuperar contraseña - DvWilkerOFC HOST',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; border-radius: 15px;">
                    <h1 style="color: #00d4ff; text-align: center;">🔐 Recuperar Contraseña</h1>
                    <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; margin: 20px 0;">
                        <h2 style="color: #fff;">Hola ${user.username},</h2>
                        <p style="color: #ccc; font-size: 16px;">Recibimos una solicitud para restablecer tu contraseña:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetUrl}" style="background: linear-gradient(135deg, #ff6b6b, #ee5a5a); color: #fff; padding: 15px 40px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">🔑 Restablecer Contraseña</a>
                        </div>
                        <p style="color: #888; font-size: 12px;">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este correo.</p>
                    </div>
                </div>
            `
        });

        res.json({ success: true, message: 'Si el correo existe, recibirás instrucciones.' });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// RESTABLECER CONTRASEÑA
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        const users = getUsers();
        const user = users.find(u => u.resetToken === token && u.resetExpires > Date.now());

        if (!user) {
            return res.status(400).json({ error: 'Token inválido o expirado' });
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetToken = null;
        user.resetExpires = null;
        saveUsers(users);

        res.json({ success: true, message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// OBTENER USUARIO ACTUAL
router.get('/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const users = getUsers();
        const user = users.find(u => u.id === decoded.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            plan: user.plan,
            coins: user.coins || 0,
            isAdmin: user.isAdmin || false,
            servers: user.servers || []
        });

    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
});

module.exports = router;
