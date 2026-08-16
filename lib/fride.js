// lib/fride.js — платёжная система Fride (https://fride.io, https://docs.fride.io)
// Без сторонних библиотек: прямой доступ к API через fetch (Node 18+/Vercel).
//
// Переменные окружения (задаются на Vercel и в локальном .env):
//   FRIDE_MERCHANT_ID    — идентификатор мерчанта (uuid, в настройках мерчанта)
//   FRIDE_API_KEY        — API-ключ с доступом к созданию заказов (не ключ сотрудника!)
//   FRIDE_WEBHOOK_SECRET — секрет для проверки подписи вебхука и редиректа
//                          («Настроить Webhook и секрет» в личном кабинете Fride)
//   FRIDE_API_BASE       — необязательно, по умолчанию https://api.fride.io

const crypto = require('crypto');

const API_BASE = process.env.FRIDE_API_BASE || 'https://api.fride.io';

function merchantId() { return process.env.FRIDE_MERCHANT_ID || ''; }
function apiKey() { return process.env.FRIDE_API_KEY || ''; }
function webhookSecret() { return process.env.FRIDE_WEBHOOK_SECRET || ''; }

// Fride подключён, только если заданы все три ключевые переменные.
function isConfigured() {
  return !!(merchantId() && apiKey() && webhookSecret());
}

// ===== HTTP-запрос к API Fride =====
async function request(method, path, body) {
  const key = apiKey();
  if (!key) throw new Error('FRIDE_API_KEY не задан');

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['X-Api-Key'] = key;

  const res = await fetch(API_BASE + path, {
    method: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* не-JSON ответ */ }

  if (!res.ok) {
    const err = new Error((data && data.error) || ('Fride HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ===== Создание инвойса =====
// Возвращает { id, amount, currency, url, expired_at, is_created }.
// url — ссылка на форму оплаты, на неё редиректим покупателя.
async function createInvoice(params) {
  const body = {
    merchant_id: merchantId(),
    order_id: String(params.orderId),
    amount: params.amount,
    currency: params.currency || 'RUB',
  };
  if (params.comment) body.comment = String(params.comment).slice(0, 512);
  if (params.expire) body.expire = params.expire;
  if (params.customFields && Object.keys(params.customFields).length) body.custom_fields = params.customFields;
  if (params.email) body.email = params.email;
  if (params.telegramId) body.telegram_id_client = params.telegramId;
  if (params.service) body.service = params.service;
  if (params.successUrl) body.success_url = params.successUrl;
  if (params.failUrl) body.fail_url = params.failUrl;

  return request('POST', '/invoices/create', body);
}

// ===== Информация о заказе =====
// Нужен либо invoice_id, либо order_id (или оба).
async function getInvoiceInfo(opts) {
  const qs = new URLSearchParams({ merchant_id: merchantId() });
  if (opts.invoiceId) qs.set('invoice_id', opts.invoiceId);
  if (opts.orderId) qs.set('order_id', String(opts.orderId));
  return request('GET', '/invoice/getInfo?' + qs.toString());
}

// ===== Канонический JSON для подписи =====
// Ключи отсортированы лексикографически, компактные разделители, unicode НЕ
// экранируется — соответствует официальному PHP-примеру Fride
// (JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES после ksort).
// Python-пример использует sort_keys=True + separators=(',',':') — то же самое.
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(function(k) { return JSON.stringify(k) + ':' + canonicalJson(value[k]); }).join(',') + '}';
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ===== Проверка подписи вебхука =====
// Заголовок X-Signature: HMAC-SHA256(канонический JSON тела, webhook_secret).
// rawBody — исходное тело запроса (Buffer или строка), как пришло от Fride.
function verifyWebhookSignature(rawBody, headerSignature) {
  const secret = webhookSecret();
  if (!secret || !rawBody || !headerSignature) return false;

  let parsed = null;
  try {
    parsed = JSON.parse(rawBody.toString ? rawBody.toString('utf8') : rawBody);
  } catch (e) {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;

  const canonical = canonicalJson(parsed);
  const calc = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return safeEqual(calc, headerSignature);
}

// ===== Проверка подписи редиректа (success/fail URL) =====
// Подписываемая строка (через ':'):
//   invoice_id:order_id:amount:currency:merchant_id[:значения custom_fields по ключам]
// ВАЖНО: редирект не используется для зачисления средств (это делает вебхук) —
// проверка нужна только чтобы убедиться, что URL подлинный.
function verifyRedirectSignature(query) {
  const secret = webhookSecret();
  if (!secret) return false;
  if (!query || !query.signature) return false;

  const parts = [
    query.invoice_id,
    query.order_id,
    query.amount,
    query.currency,
    query.merchant_id,
  ];
  if (query.custom_fields && typeof query.custom_fields === 'object') {
    Object.keys(query.custom_fields).sort().forEach(function(k) {
      parts.push(String(query.custom_fields[k]));
    });
  }
  const calc = crypto.createHmac('sha256', secret).update(parts.join(':')).digest('hex');
  return safeEqual(calc, query.signature);
}

module.exports = {
  API_BASE,
  isConfigured,
  merchantId,
  apiKey,
  webhookSecret,
  createInvoice,
  getInvoiceInfo,
  verifyWebhookSignature,
  verifyRedirectSignature,
};
