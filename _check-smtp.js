// Временный диагностический скрипт: проверка SMTP (не входит в проект)
require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  };
  console.log('SMTP host  :', config.host, ':' + config.port, 'secure=' + config.secure);
  console.log('SMTP user  :', config.auth.user);
  console.log('SMTP pass  :', config.auth.pass ? '***(' + config.auth.pass.length + ' chars)***' : '(пусто!)');
  console.log('SMTP from  :', process.env.SMTP_FROM || '(не задан)');

  const transporter = nodemailer.createTransport(config);

  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout 10s')), 10000));
    await Promise.race([transporter.verify(), timeout]);
    console.log('\nVERIFY: OK — авторизация на SMTP прошла');
  } catch (e) {
    console.error('\nVERIFY FAIL:', e.message);
    if (e.response) console.error('Response:', String(e.response).slice(0, 500));
    process.exit(1);
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"SMS Light" <noreply@sms-light.ru>',
      to: process.env.SMTP_USER,
      subject: 'SMS Light — тест SMTP ' + Date.now(),
      text: 'Тестовое письмо для проверки доставки кодов. ' + new Date().toISOString(),
    });
    console.log('SEND OK: messageId =', info.messageId);
    console.log('Проверьте входящие ' + process.env.SMTP_USER + ' (включая Спам).');
  } catch (e) {
    console.error('SEND FAIL:', e.message);
    if (e.response) console.error('Response:', String(e.response).slice(0, 500));
    process.exit(1);
  }
})();
