// lib/tg-bot.js — Telegram-интеграция (мини-маркет)
// Без сторонних библиотек: прямой доступ к Bot API через fetch (Node 18+/Vercel).
//
// Переменные окружения (задаются на Vercel):
//   TELEGRAM_BOT_TOKEN      — токен бота от @BotFather (обязательно для работы бота)
//   TELEGRAM_WEBHOOK_SECRET — секрет заголовка X-Telegram-Bot-Api-Secret-Token (по желанию)
//   ADMIN_TG_CHAT_ID        — id чата администратора для уведомлений о заказах (по желанию)
//   SITE_BASE_URL           — публичный адрес сайта (по умолчанию продакшен Vercel)

const crypto = require('crypto');

const SITE_BASE = process.env.SITE_BASE_URL || 'https://sms-light-v2-static.vercel.app';
const SUPPORT_USERNAME = 'REXNCER';

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

// Прямой вызов Bot API
function api(method, payload) {
  const token = getToken();
  if (!token) return Promise.resolve({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан' });
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
    .then(function(r) { return r.json(); })
    .then(function(json) {
      if (!json.ok) {
        console.error('TG error', method, json.description);
        return { ok: false, error: json.description || 'Telegram API error' };
      }
      return { ok: true, result: json.result };
    })
    .catch(function(err) { return { ok: false, error: err.message }; });
}

// ===== Проверка initData из Telegram Web App =====
// initData — строка вида: query_id=...&user={...}&auth_date=...&hash=...
// Подпись: hash = HMAC-SHA256(data_check_string, secret_key),
// где secret_key = HMAC-SHA256(bot_token, "WebAppData").
function validateInitData(initData) {
  try {
    const token = getToken();
    if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN не задан' };
    if (!initData) return { ok: false, error: 'Нет initData' };

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { ok: false, error: 'Нет hash' };
    params.delete('hash');

    // data_check_string: отсортированные по ключу «key=value», разделитель \n
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map(function(k) { return k + '=' + params.get(k); }).join('\n');

    const secretKey = crypto.createHmac('sha256', token).update('WebAppData').digest();
    const calcHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const expected = Buffer.from(hash, 'hex');
    const actual = Buffer.from(calcHash, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) {
      return { ok: false, error: 'Неверная подпись initData' };
    }

    // Свежесть auth_date (не старше суток)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (!authDate || Date.now() / 1000 - authDate > 86400) {
      return { ok: false, error: 'initData устарел' };
    }

    let user = null;
    const userRaw = params.get('user');
    if (userRaw) {
      try { user = JSON.parse(userRaw); } catch (e) { user = null; }
    }
    return { ok: true, user: user || {} };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ===== Детерминированный аккаунт для пользователя Telegram =====
// Email вида tg<id>@telegram.local — без миграций БД, покупки и чаты работают
// как у обычных пользователей сайта.
function emailForTgUser(user) {
  return 'tg' + user.id + '@telegram.local';
}

// ===== Обработка входящих апдейтов (вебхук) =====
async function handleUpdate(update) {
  if (!update || !update.message) return;
  const msg = update.message;
  const chatId = msg.chat && msg.chat.id;
  const text = (msg.text || '').trim();
  const from = msg.from || {};
  if (!chatId) return;

  if (text === '/start') {
    await api('sendMessage', {
      chat_id: chatId,
      text: 'Добро пожаловать в SMS Light! 🛍️\n\n'
        + 'Виртуальные номера для регистрации в сервисах — прямо здесь, в Telegram.\n\n'
        + '⬇️ Нажмите кнопку, чтобы открыть мини-маркет:',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Открыть мини-маркет', web_app: { url: SITE_BASE + '/shop' } }],
          [{ text: '🧑‍💻 Поддержка', url: 'https://t.me/' + SUPPORT_USERNAME }],
        ],
      },
    });

    // Подсказка администратору: как включить уведомления о заказах
    if (from.username && String(from.username).toLowerCase() === SUPPORT_USERNAME.toLowerCase()) {
      await api('sendMessage', {
        chat_id: chatId,
        text: '👋 Привет, админ! Чтобы получать уведомления о новых заказах прямо в этот чат, '
          + 'задайте на Vercel переменную окружения:\n\n'
          + '  ADMIN_TG_CHAT_ID = ' + chatId + '\n\n'
          + 'и перезапустите деплой (или нажмите «Перезапустить» в Vercel).',
      });
    }
    return;
  }

  if (text) {
    await api('sendMessage', {
      chat_id: chatId,
      text: 'Все покупки — в мини-маркете 👇',
      reply_markup: {
        inline_keyboard: [[{ text: '🛍️ Открыть мини-маркет', web_app: { url: SITE_BASE + '/shop' } }]],
      },
    });
  }
}

// ===== Регистрация вебхука =====
async function registerWebhook() {
  const token = getToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN не задан' };
  const payload = {
    url: SITE_BASE + '/api/tg/webhook',
    allowed_updates: ['message'],
    drop_pending_updates: true,
  };
  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
  }
  return api('setWebhook', payload);
}

async function getMe() {
  return api('getMe', {});
}

async function getWebhookInfo() {
  return api('getWebhookInfo', {});
}

// ===== Уведомление администратору о заказе =====
async function notifyAdmin(text) {
  const chatId = process.env.ADMIN_TG_CHAT_ID;
  if (!chatId) return { ok: false, error: 'ADMIN_TG_CHAT_ID не задан' };
  return api('sendMessage', { chat_id: chatId, text });
}

// ===== Человекочитаемый статус заказа =====
function statusText(status) {
  const map = {
    pending: '🟡 Ожидает подтверждения',
    completed: '✅ Выполнен',
    rejected: '🔴 Отменён',
  };
  return map[status] || status || '';
}

module.exports = {
  getToken,
  api,
  validateInitData,
  emailForTgUser,
  handleUpdate,
  registerWebhook,
  getMe,
  getWebhookInfo,
  notifyAdmin,
  statusText,
  SITE_BASE,
  SUPPORT_USERNAME,
};
