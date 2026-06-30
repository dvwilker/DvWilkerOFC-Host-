const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendVerificationEmail = async (email, token) => {
  const verifyUrl = `${process.env.BASE_URL}/api/auth/verify/${token}`;
  
  await transporter.sendMail({
    from: `"WABot Hosting" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '✅ Verifica tu cuenta - WABot Hosting',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">🤖 WABot Hosting</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">¡Bienvenido!</h2>
          <p style="color: #666; font-size: 16px;">Gracias por registrarte. Para activar tu cuenta, haz clic en el botón:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="background: #25D366; color: white; padding: 15px 40px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Verificar mi cuenta</a>
          </div>
          <p style="color: #999; font-size: 14px;">Si no creaste esta cuenta, ignora este correo.</p>
        </div>
      </div>
    `
  });
};

const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.BASE_URL}/reset-password.html?token=${token}`;
  
  await transporter.sendMail({
    from: `"WABot Hosting" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🔑 Recuperar contraseña - WABot Hosting',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">🔐 Recuperar Contraseña</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">¿Olvidaste tu contraseña?</h2>
          <p style="color: #666; font-size: 16px;">No te preocupes, haz clic en el botón para crear una nueva:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Restablecer contraseña</a>
          </div>
          <p style="color: #999; font-size: 14px;">Este enlace expira en 1 hora. Si no solicitaste esto, ignora el correo.</p>
        </div>
      </div>
    `
  });
};

module.exports = { transporter, sendVerificationEmail, sendPasswordResetEmail };
