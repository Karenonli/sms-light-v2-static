// email.js — Сервис отправки email через SMTP с премиум HTML-шаблонами
// По умолчанию использует Ethereal (тестовый SMTP, письма видны на ethereal.email)
// Для продакшена укажите SMTP в .env файле

const nodemailer = require('nodemailer');

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
let _smtpFailed = false;

async function getTransporter(forceRecreate) {
  if (_transporter && !forceRecreate) return _transporter;

  const config = getTransportConfig();
  if (config && !_smtpFailed) {
    _transporter = nodemailer.createTransport(config);
    return _transporter;
  }

  if (_smtpFailed) {
    console.log('→ SMTP ранее не работал, используем Ethereal');
  }

  // Dev-режим или fallback: создаём Ethereal аккаунт
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
    // Последний шанс — попробовать создать транспорт из конфига как есть
    if (config) {
      _transporter = nodemailer.createTransport(config);
    } else {
      throw new Error('Нет ни SMTP, ни Ethereal. Email недоступен.');
    }
  }

  return _transporter;
}

function markSmtpFailed() {
  _smtpFailed = true;
  _transporter = null;
}

// Флаг: был ли использован fallback (Ethereum / вывод в консоль)
function isUsingFallback() {
  return _smtpFailed || !getTransportConfig();
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
    ? `<tr><td style="padding:0 0 32px;text-align:center;">
        <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:14px;padding:24px 20px;display:inline-block;min-width:200px;">
          <div style="font-size:13px;color:#6b7280;font-family:'Inter',Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">${opt.codeLabel || 'Код подтверждения'}</div>
          <div style="font-size:40px;font-weight:800;color:#10b981;font-family:'Courier New',Courier,monospace;letter-spacing:10px;line-height:1.2;">${opt.code}</div>
        </div>
       </td></tr>`
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
            <td style="background:#141414;border:1px solid #1f1f1f;border-radius:20px;padding:44px 40px;">

              <!-- Decorative top line -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="width:40px;height:3px;background:#10b981;border-radius:2px;display:block;"></td>
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

    // Таймаут 10 секунд на проверку SMTP
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Таймаут подключения (10s)')), 10000)
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
      console.error('  → Будет использован Ethereal (тестовый режим)');
    } else {
      console.error('✖ SMTP: Ethereal недоступен:', err.message);
    }
    _transporter = null; // сброс, чтобы при следующем вызове создался Ethereal
    markSmtpFailed();
    return false;
  }
}

// ===== Отправка =====
async function sendEmail(to, subject, html) {
  const alreadyFallingBack = _smtpFailed;
  try {
    const transporter = await getTransporter();

    // Timeout 15s for sending
    const sendPromise = transporter.sendMail({
      from: process.env.SMTP_FROM || '"SMS Light" <noreply@sms-light.ru>',
      to, subject, html,
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

    // If we were using real SMTP (not already fallback), try Ethereal once
    if (getTransportConfig() && !alreadyFallingBack) {
      markSmtpFailed();
      console.log('>> Switching to Ethereal fallback...');
      try {
        const transporter = await getTransporter(true);
        const fallbackInfo = await transporter.sendMail({
          from: '"SMS Light" <noreply@sms-light.ru>',
          to, subject, html,
        });
        console.log(`>> Email (Ethereal) sent to ${to}: ${nodemailer.getTestMessageUrl(fallbackInfo)}`);
        return fallbackInfo;
      } catch (e2) {
        console.error('>> Ethereal also failed:', e2.message);
        throw e2;
      }
    }

    // All transports failed — сообщаем об ошибке
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
  markSmtpFailed,
  isUsingFallback,
  templates: {
    verification: verificationEmail,
    reset: resetEmail,
    welcome: welcomeEmail,
  },
};
