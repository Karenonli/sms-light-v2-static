// Временный диагностический скрипт: SMTP mail.ru с env (не входит в проект)
require('dotenv').config();
const nodemailer = require('nodemailer');
const net = require('net');

const confs = [
  { name: '465 SSL (mail.ru)', host: 'smtp.mail.ru', port: 465, secure: true },
  { name: '587 STARTTLS (mail.ru)', host: 'smtp.mail.ru', port: 587, secure: false },
];

function raceTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' — таймаут ' + ms + 'мс')), ms)),
  ]);
}

(async () => {
  console.log('user:', process.env.SMTP_USER, '| pass len:', (process.env.SMTP_PASS || '').length);

  // 0) Сырой TCP-диалог: баннер сервера за какое время
  for (const c of confs) {
    console.log('\n=== TCP raw: ' + c.name + ' ===');
    await new Promise((resolve) => {
      const t = Date.now();
      const sock = net.connect({ host: c.host, port: c.port }, () => {
        console.log('connected in', Date.now() - t, 'ms');
        sock.setTimeout(15000);
      });
      sock.on('data', (d) => { console.log('server says:', String(d).trim().slice(0, 200)); sock.end(); });
      sock.on('timeout', () => { console.log('raw socket TIMEOUT after', Date.now() - t, 'ms'); sock.destroy(); });
      sock.on('error', (e) => { console.log('raw error:', e.message); });
      sock.on('close', () => resolve());
    });
  }

  // 1) nodemailer verify с общим таймаутом
  for (const c of confs) {
    console.log('\n=== nodemailer: ' + c.name + ' ===');
    const tr = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 20000,
    });
    try {
      await raceTimeout(tr.verify(), 30000, 'verify');
      console.log('VERIFY OK');
    } catch (e) {
      console.error('FAIL:', e.message, e.code ? '| code=' + e.code : '', e.responseCode ? '| respCode=' + e.responseCode : '');
    } finally {
      tr.close();
    }
  }
})();