// email.js — Сервис отправки email через SMTP с премиум HTML-шаблонами
// По умолчанию использует Ethereal (тестовый SMTP, письма видны на ethereal.email)
// Для продакшена укажите SMTP в .env файле

const nodemailer = require('nodemailer');
const tls = require('tls');
const net = require('net');

// ===== Raw SMTP transport (обход бага nodemailer v9 + Node.js TLS) =====
class RawSMTPTransport {
  constructor(options) {
    this.host = options.host || 'localhost';
    this.port = options.port || 465;
    this.secure = options.secure !== false;
    this.auth = options.auth || null;
    this.name = 'RawSMTP';
  }

  async verify() {
    const conn = await this._connect();
    try {
      await this._banner(conn);
      await this._cmd(conn, 'EHLO ' + this.host);
      if (this.auth && this.auth.user && this.auth.pass) {
        await this._cmd(conn, 'AUTH PLAIN ' + Buffer.from('\0' + this.auth.user + '\0' + this.auth.pass).toString('base64'));
      }
      return true;
    } finally {
      try { await this._cmd(conn, 'QUIT'); } catch (_) {}
      this._close(conn);
    }
  }

  async sendMail(mail) {
    const conn = await this._connect();
    const fromAddr = typeof mail.from === 'string' ? mail.from.replace(/.*<([^>]+)>.*/, '$1') : String(mail.from || '');
    const toAddrs = Array.isArray(mail.to) ? mail.to : [mail.to];

    try {
      await this._banner(conn);
      await this._cmd(conn, 'EHLO ' + this.host);

      if (this.auth && this.auth.user && this.auth.pass) {
        await this._cmd(conn, 'AUTH PLAIN ' + Buffer.from('\0' + this.auth.user + '\0' + this.auth.pass).toString('base64'));
      }

      await this._cmd(conn, 'MAIL FROM:<' + fromAddr + '>');
      for (const addr of toAddrs) {
        const rcpt = typeof addr === 'string' ? addr.replace(/.*<([^>]+)>.*/, '$1') : String(addr);
        await this._cmd(conn, 'RCPT TO:<' + rcpt + '>');
      }
      await this._cmd(conn, 'DATA');

      const headerLines = [];
      if (mail.from) headerLines.push('From: ' + (typeof mail.from === 'string' ? mail.from : String(mail.from)));
      if (mail.to) {
        const toStr = Array.isArray(mail.to) ? mail.to.join(', ') : String(mail.to);
        headerLines.push('To: ' + toStr);
      }
      if (mail.cc) headerLines.push('Cc: ' + mail.cc);
      if (mail.subject) headerLines.push('Subject: ' + mail.subject);
      if (mail.headers) {
        for (const [k, v] of Object.entries(mail.headers)) {
          headerLines.push(k + ': ' + v);
        }
      }

      const html = mail.html || '';
      const text = mail.text || '';
      const boundary = '----=_Part_' + Date.now();
      var body;

      if (mail.text && mail.html) {
        headerLines.push('MIME-Version: 1.0');
        headerLines.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
        body = '\r\n--' + boundary + '\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + text + '\r\n\r\n--' + boundary + '\r\nContent-Type: text/html; charset=utf-8\r\n\r\n' + html + '\r\n\r\n--' + boundary + '--';
      } else if (mail.html) {
        headerLines.push('MIME-Version: 1.0');
        headerLines.push('Content-Type: text/html; charset=utf-8');
        body = '\r\n' + html;
      } else {
        body = '\r\n' + (text || '');
      }

      const fullMessage = headerLines.join('\r\n') + body;
      await this._write(conn, fullMessage);
      await this._cmd(conn, '.');

      const messageId = (mail.headers && mail.headers['Message-ID'])
        || ('<' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@' + this.host + '>');

      return { messageId, accepted: toAddrs, rejected: [] };
    } finally {
      try { await this._cmd(conn, 'QUIT'); } catch (_) {}
      this._close(conn);
    }
  }

  _connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

      const opts = {
        host: this.host,
        port: this.port,
        rejectUnauthorized: false,
        servername: this.host,
      };

      const onConnect = () => {
        conn.setTimeout(0);
        settle(resolve, conn);
      };

      const onTimeout = () => {
        conn.destroy();
        settle(reject, new Error('RawSMTP: connect timeout (' + this.host + ':' + this.port + ')'));
      };

      const onError = (err) => {
        conn.destroy();
        settle(reject, err);
      };

      var conn;
      if (this.secure) {
        conn = tls.connect(opts, onConnect);
      } else {
        conn = net.connect({ host: this.host, port: this.port }, onConnect);
      }
      conn.setTimeout(15000, onTimeout);
      conn.on('error', onError);
    });
  }

  _banner(conn) {
    return this._readLine(conn);
  }

  _cmd(conn, command) {
    return new Promise((resolve, reject) => {
      let done = false;
      let buf = '';

      const onData = (chunk) => {
        if (done) return;
        buf += chunk.toString();
        const lines = buf.split('\r\n');
        for (const line of lines) {
          if (line.length >= 4 && /^\d{3}[ ]/.test(line)) {
            done = true;
            conn.removeListener('data', onData);
            const code = parseInt(line.substring(0, 3));
            if (code >= 200 && code < 400) {
              resolve(line);
            } else {
              reject(new Error('SMTP ' + command.split(' ')[0] + ': ' + line));
            }
            return;
          }
        }
      };

      conn.on('data', onData);
      conn.write(command + '\r\n');

      setTimeout(() => {
        if (!done) {
          done = true;
          conn.removeListener('data', onData);
          reject(new Error('SMTP ' + command.split(' ')[0] + ': timeout'));
        }
      }, 30000);
    });
  }

  _readLine(conn) {
    return new Promise((resolve, reject) => {
      let done = false;
      let buf = '';
      const onData = (chunk) => {
        if (done) return;
        buf += chunk.toString();
        const lines = buf.split('\r\n');
        for (const line of lines) {
          if (line.length >= 4 && /^\d{3}[ ]/.test(line)) {
            done = true;
            conn.removeListener('data', onData);
            resolve(line);
            return;
          }
        }
      };
      conn.on('data', onData);
      setTimeout(() => {
        if (!done) {
          done = true;
          conn.removeListener('data', onData);
          reject(new Error('SMTP: banner timeout'));
        }
      }, 10000);
    });
  }

  _write(conn, data) {
    return new Promise((resolve, reject) => {
      conn.write(data, 'utf8', (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  _close(conn) {
    if (!conn || conn.destroyed) return;
    try { conn.end(); } catch (_) {}
    setTimeout(() => { try { conn.destroy(); } catch (_) {} }, 3000);
  }
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
      }
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
    // RawSMTPTransport обходит баг nodemailer v9 + Node.js v24 TLS.
    // На Vercel (Node.js 18/20) nodemailer работает нормально — используем его.
    const useRaw = !process.env.VERCEL && (config.port === 465 || config.secure);
    if (useRaw) {
      console.log('→ SMTP: используем RawSMTPTransport (Node.js ' + process.versions.node + ', порт ' + config.port + ')');
      _transporter = new RawSMTPTransport(config);
    } else {
      if (config.port === 465 || config.secure) {
        console.log('→ SMTP: используем nodemailer (Vercel, порт ' + config.port + ')');
      }
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

    // Таймаут 5 секунд на проверку SMTP
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Таймаут подключения (5s)')), 5000)
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
      console.error('  Если вы используете Mail.ru/inbox.ru — нужен пароль приложения (app password),');
      console.error('  а не обычный пароль от почты. Создайте его в настройках Mail.ru → Безопасность →');
      console.error('  Пароли для внешних приложений.');
    } else {
      console.error('✖ SMTP: Ethereal недоступен:', err.message);
    }
    _transporter = null; // сброс, чтобы следующая попытка создала свежее соединение
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

    // Timeout 15s for sending
    const sendPromise = transporter.sendMail({
      from: process.env.SMTP_FROM || '"SMS Light" <noreply@sms-light.ru>',
      to, subject, html,
      // Текстовая версия + заголовки повышают доставляемость
      text: htmlToText(html),
      headers: {
        'X-Auto-Response-Suppress': 'All',
        'Precedence': 'bulk',
      },
    });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout (15s)')), 15000)
    );
    const info = await Promise.race([sendPromise, timeout]);

    // Ethereal: show preview URL
    if (!transportConfig) {
      console.log(`>> Email sent to ${to}: ${nodemailer.getTestMessageUrl(info)}`);
    } else {
      console.log(`>> Email sent to ${to}: messageId=${info.messageId}`);
    }

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
