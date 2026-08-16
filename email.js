// email.js — Сервис отправки email через SMTP с премиум HTML-шаблонами
// По умолчанию использует Ethereal (тестовый SMTP, письма видны на ethereal.email)
// Для продакшена укажите SMTP в .env файле

const nodemailer = require('nodemailer');
const tls = require('tls');
const net = require('net');

// ===== Raw SMTP transport (обход бага nodemailer v9 + Node.js v24 TLS) =====
class RawSMTPTransport {
  constructor(config) {
    this.config = config;
  }
  async verify() {
    const socket = await this._connect();
    socket.destroy();
  }
  async sendMail(mail) {
    const socket = await this._connect();
    try {
      const from = (mail.from || '').replace(/.*<(.*)>.*/, '$1').replace(/"/g, '');
      const toList = Array.isArray(mail.to) ? mail.to : [mail.to];
      const addrs = toList.map(t => (typeof t === 'string' ? t : t.address || t).replace(/.*<(.*)>.*/, '$1').replace(/"/g, ''));
      await this._cmd(socket, `MAIL FROM:<${from}>`);
      for (const addr of addrs) {
        await this._cmd(socket, `RCPT TO:<${addr}>`);
      }
      await this._cmd(socket, 'DATA');
      const boundary = '----=_Part_' + Date.now();
      const headerLines = [
        `From: ${mail.from}`,
        `To: ${Array.isArray(mail.to) ? mail.to.join(', ') : mail.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(mail.subject || '').toString('base64')}?=`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        'X-Auto-Response-Suppress: All',
        'Precedence: bulk',
        '',
      ];
      for (const line of headerLines) {
        socket.write(line + '\r\n');
      }
      // Text part
      socket.write(`--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`);
      socket.write(Buffer.from(mail.text || '').toString('base64') + '\r\n');
      // HTML part
      socket.write(`--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n`);
      socket.write((mail.html || '') + '\r\n');
      // Close
      socket.write(`--${boundary}--\r\n.\r\n`);
      const resp = await this._waitForLine(socket);
      return { messageId: `<${Date.now()}.raw@sms-light>` };
    } finally {
      socket.destroy();
    }
  }
  _connect() {
    return new Promise((resolve, reject) => {
      const cfg = this.config;
      const timer = setTimeout(() => reject(new Error('Raw SMTP timeout')), 20000);
      const sock = tls.connect({ host: cfg.host, port: cfg.port, rejectUnauthorized: false, minVersion: 'TLSv1.2' }, async () => {
        try {
          clearTimeout(timer);
          // Wait for greeting
          await this._readLine(sock);
          // EHLO
          await this._cmd(sock, `EHLO ${cfg.host}`);
          // AUTH LOGIN
          await this._cmd(sock, 'AUTH LOGIN');
          await this._cmd(sock, Buffer.from(cfg.auth.user).toString('base64'));
          await this._cmd(sock, Buffer.from(cfg.auth.pass).toString('base64'));
          resolve(sock);
        } catch (e) {
          sock.destroy();
          reject(e);
        }
      });
      sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
  }
  _readLine(socket) {
    return new Promise((resolve) => {
      const handler = (data) => {
        socket.removeListener('data', handler);
        resolve(data.toString());
      };
      socket.on('data', handler);
    });
  }
  _cmd(socket, cmd) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`SMTP cmd timeout: ${cmd}`)), 15000);
      const handler = (data) => {
        const s = data.toString();
        clearTimeout(timer);
        socket.removeListener('data', handler);
        if (/^[23]\d\d/.test(s)) {
          resolve(s);
        } else {
          reject(new Error(`SMTP ${cmd} failed: ${s.trim()}`));
        }
      };
      socket.on('data', handler);
      socket.write(cmd + '\r\n');
    });
  }
  _waitForLine(socket) {
    return new Promise((resolve) => {
      const handler = (data) => {
        socket.removeListener('data', handler);
        resolve(data.toString());
      };
      socket.on('data', handler);
    });
  }
  close() {}
}

// ===== SMTP конфигурация =====
let transportConfig = null;

function getTransportConfig() {
  if (transportConfig) return transportConfig;

  if (process.env.SMTP_HOST) {
    transportConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      },
      family: 4,
      connectionTimeout: 20000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    };
  }
  return transportConfig;
}

// ===== Создание транспорта =====
let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const config = getTransportConfig();
  if (config) {
    // Use raw TLS transport (works with Node.js v24 where nodemailer hangs)
    if (config.port === 465 && config.secure) {
      _transporter = new RawSMTPTransport(config);
    } else {
      _transporter = nodemailer.createTransport(config);
    }
    return _transporter;
  }

  // SMTP не настроен — Ethereal (тестовый SMTP для локальной разработки).
  // На Vercel без SMTP отправлять письма нечем, поэтому сразу ошибка.
  if (process.env.VERCEL) {
    throw new Error('SMTP не настроен на Vercel. Укажите SMTP_* переменные.');
  }

  // Локальная разработка: создаём Ethereal аккаунт
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.log('→ Email: Ethereal аккаунт создан');
    console.log(`→ Email: https://ethereal.email/login`);
    console.log(`→ Email: user=${testAccount.user} pass=${testAccount.pass}`);

    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  } catch (err) {
    console.error('✖ Email: не удалось создать Ethereal аккаунт:', err.message);
    throw new Error('Нет ни SMTP, ни Ethereal. Email недоступен.');
  }

  return _transporter;
}

// Флаг: используется ли Ethereal (тестовый режим) вместо реального SMTP.
// Верно только когда SMTP вообще не настроен — то есть локальная разработка.
function isUsingFallback() {
  return !getTransportConfig();
}

// ===== SVG-иконки (base64-free, inline) =====

const STAR_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="#10b981" style="display:block;margin:0 auto;"><polygon points="12,0 15,10 24,12 15,14 12,24 9,14 0,12 9,10"/></svg>`;

const MAIL_ICON = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto;">
  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
</svg>`;

const LOCK_ICON = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto;">
  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
</svg>`;

const CHECK_ICON = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto;">
  <circle cx="12" cy="12" r="10"/>
  <polyline points="16 8 10 16 7 13"/>
</svg>`;

// ===== Премиум HTML-шаблоны =====

function emailTemplate(title, iconSvg, heading, bodyHtml, extraOpts) {
  const opt = extraOpts || {};
  const btnHtml = opt.btnText && opt.btnUrl
    ? `<tr><td style="padding:0 0 32px;text-align:center;">
        <a href="${opt.btnUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:'Inter',Arial,Helvetica,sans-serif;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
          ${opt.btnText}
        </a>
       </td></tr>`
    : '';

  const codeBlock = opt.code
    ? (function() {
        // Код как 6 отдельных ячеек (как поля ввода на странице регистрации)
        const digits = String(opt.code).split('');
        const cells = digits.map(d =>
          `<td style="padding:0 4px;">
             <div style="width:46px;height:58px;background:#0d0d0d;border:1.5px solid rgba(16,185,129,0.35);border-radius:12px;text-align:center;line-height:58px;font-size:28px;font-weight:800;color:#34d399;font-family:'Courier New',Courier,monospace;box-shadow:0 0 14px rgba(16,185,129,0.12);">
               ${d}
             </div>
           </td>`
        ).join('');
        return `<tr><td style="padding:4px 0 28px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;font-family:'Inter',Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:16px;">${opt.codeLabel || 'Код подтверждения'}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>${cells}</tr>
          </table>
          <div style="margin-top:16px;font-size:12px;color:#6b7280;font-family:'Inter',Arial,Helvetica,sans-serif;">
            Не получается ввести по цифрам — вставьте целиком:
            <span style="color:#10b981;font-family:'Courier New',Courier,monospace;font-weight:700;letter-spacing:2px;">${opt.code}</span>
          </div>
        </td></tr>`;
      })()
    : '';

  const noteHtml = opt.note
    ? `<tr><td style="padding:0 0 24px;text-align:center;">
        <p style="font-size:13px;color:#6b7280;font-family:'Inter',Arial,Helvetica,sans-serif;margin:0;line-height:1.6;">${opt.note}</p>
       </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#060606;font-family:'Inter',Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060606;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

          <!-- Header: Logo -->
          <tr>
            <td style="text-align:center;padding-bottom:36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    ${STAR_ICON}
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-family:'Inter',Arial,Helvetica,sans-serif;">
                      SMS<span style="color:#10b981;">Light</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#141414;border:1px solid #1f1f1f;border-radius:20px;padding:44px 40px;box-shadow:0 24px 64px rgba(0,0,0,0.45), 0 0 48px rgba(16,185,129,0.09);">

              <!-- Decorative top line -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 32px;width:64px;">
                <tr>
                  <td style="height:3px;background:#10b981;border-radius:2px;font-size:0;line-height:0;box-shadow:0 0 8px rgba(16,185,129,0.6);">&nbsp;</td>
                </tr>
              </table>

              <!-- Icon -->
              <tr>
                <td style="padding:0 0 20px;text-align:center;">
                  ${iconSvg}
                </td>
              </tr>

              <!-- Heading -->
              <tr>
                <td style="padding:0 0 12px;text-align:center;">
                  <h1 style="font-size:22px;font-weight:700;color:#e8e8e8;margin:0;font-family:'Inter',Arial,Helvetica,sans-serif;letter-spacing:-0.3px;">
                    ${heading}
                  </h1>
                </td>
              </tr>

              <!-- Body text -->
              <tr>
                <td style="padding:0 0 ${opt.code || (opt.btnText && opt.btnUrl) ? '24px' : '8px'};text-align:center;">
                  <p style="font-size:15px;color:#9ca3af;margin:0;line-height:1.7;font-family:'Inter',Arial,Helvetica,sans-serif;">
                    ${bodyHtml}
                  </p>
                </td>
              </tr>

              <!-- Code block -->
              ${codeBlock}

              <!-- Button -->
              ${btnHtml}

              <!-- Note -->
              ${noteHtml}

              <!-- Divider -->
              <tr>
                <td style="padding:0 0 24px;">
                  <div style="height:1px;background:#222;width:100%;"></div>
                </td>
              </tr>

              <!-- Footer inside card -->
              <tr>
                <td style="text-align:center;">
                  <p style="font-size:12px;color:#555;margin:0;line-height:1.6;font-family:'Inter',Arial,Helvetica,sans-serif;">
                    SMS Light — виртуальные номера для регистрации<br>
                    в Telegram, WhatsApp и 200+ сервисах
                  </p>
                </td>
              </tr>

            </td>
          </tr>

          <!-- Bottom footer -->
          <tr>
            <td style="text-align:center;padding-top:24px;">
              <p style="font-size:12px;color:#444;margin:0 0 4px;font-family:'Inter',Arial,Helvetica,sans-serif;">
                Это автоматическое письмо, отвечать на него не нужно.
              </p>
              <p style="font-size:12px;color:#444;margin:0;font-family:'Inter',Arial,Helvetica,sans-serif;">
                &copy; ${new Date().getFullYear()} SMS Light. Все права защищены.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Шаблон: код подтверждения email
function verificationEmail(code) {
  return emailTemplate(
    'Подтверждение email — SMS Light',
    MAIL_ICON,
    'Подтверждение email',
    'Спасибо за регистрацию в SMS Light!<br>Для завершения создания аккаунта используйте код ниже.',
    {
      code: code,
      codeLabel: 'Код подтверждения',
      note: 'Код действителен в течение 15 минут. Если вы не регистрировались на SMS Light, просто проигнорируйте это письмо.'
    }
  );
}

// Шаблон: восстановление пароля
function resetEmail(code) {
  return emailTemplate(
    'Восстановление пароля — SMS Light',
    LOCK_ICON,
    'Восстановление пароля',
    'Мы получили запрос на восстановление пароля.<br>Введите код ниже, чтобы задать новый пароль для вашего аккаунта.',
    {
      code: code,
      codeLabel: 'Код восстановления',
      note: 'Код действителен в течение 15 минут. Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.'
    }
  );
}

// Шаблон: приветственное письмо после подтверждения
function welcomeEmail(name) {
  const safeName = name.replace(/[<>]/g, '');
  return emailTemplate(
    'Добро пожаловать — SMS Light',
    CHECK_ICON,
    `Добро пожаловать, ${safeName}!`,
    'Ваш email успешно подтверждён.<br>Теперь вы можете покупать виртуальные номера для регистрации в Telegram, WhatsApp и 200+ других сервисах.',
    {
      btnText: 'Начать покупки',
      btnUrl: 'https://sms-light.ru',
      note: 'Если у вас возникнут вопросы, просто ответьте на это письмо — мы обязательно поможем.'
    }
  );
}

// ===== Проверка SMTP соединения =====
async function verifyConnection() {
  try {
    const transporter = await getTransporter();

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Таймаут подключения (20s)')), 20000)
    );
    await Promise.race([transporter.verify(), timeout]);

    const config = getTransportConfig();
    if (config) {
      console.log(`→ SMTP: соединение с ${config.host}:${config.port} установлено`);
    } else {
      console.log('→ SMTP: нет конфигурации, используется Ethereal (тестовый режим)');
    }
    return true;
  } catch (err) {
    const config = getTransportConfig();
    if (config) {
      console.error(`✖ SMTP: не удалось подключиться к ${config.host}:${config.port}`);
      console.error(`  Причина: ${err.message}`);
    } else {
      console.error('✖ SMTP: Ethereal недоступен:', err.message);
    }
    _transporter = null;
    return false;
  }
}

// Простая HTML→text конвертация для текстовой версии письма.
// Некоторые почтовые фильтры ниже ранжируют HTML-only письма (выше риск спама).
function htmlToText(html) {
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ===== Отправка =====
async function sendEmail(to, subject, html) {
  try {
    const transporter = await getTransporter();

    const mailObj = {
      from: process.env.SMTP_FROM || '"SMS Light" <noreply@sms-light.ru>',
      to, subject, html,
      text: htmlToText(html),
    };

    // Timeout 20s for sending
    const sendPromise = transporter.sendMail(mailObj);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout (20s)')), 20000)
    );
    const info = await Promise.race([sendPromise, timeout]);

    const infoMsgId = info && info.messageId ? info.messageId : '(raw)';
    console.log(`>> Email sent to ${to}: messageId=${infoMsgId}`);
    return info;
  } catch (err) {
    console.error('>> Email error:', err.message);

    // Классифицируем ошибку: получатель не существует (550 invalid mailbox / user
    // not found). Форма регистрации использует это, чтобы ясно сказать пользователю,
    // что адрес введён неверно, вместо нейтрального «проверьте email».
    const response = String(err.response || '') + ' ' + String(err.message || '');
    if (/invalid mailbox|user not found|does not exist|no such user|mailbox .*unavailable|recipient .*unavailable/i.test(response)) {
      err.invalidRecipient = true;
    }

    // Сбрасываем транспорт, чтобы следующая отправка создала свежее
    // SMTP-соединение. Это важно для serverless (Vercel): один сбой не должен
    // «навсегда» переводить тёплый инстанс на Ethereal — каждое следующее
    // письмо снова попробует реальный SMTP.
    _transporter = null;

    console.log(`>> [SMTP FAIL] Email to ${to} failed: ${err.message}`);
    throw err;
  }
}
function generateCode(length) {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = {
  sendEmail,
  generateCode,
  verifyConnection,
  isUsingFallback,
  templates: {
    verification: verificationEmail,
    reset: resetEmail,
    welcome: welcomeEmail,
  },
};
