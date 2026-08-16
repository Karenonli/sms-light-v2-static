// lib/sms.js — SMS-агрегаторы: покупка виртуальных номеров и получение кодов
// Без сторонних библиотек: прямой доступ к API через fetch (Node 18+/Vercel).
//
// Поддерживаемые провайдеры (переменная окружения SMS_PROVIDER):
//   smsactivate — https://sms-activate.org (закрыт в декабре 2025, legacy)
//   5sim        — https://5sim.net (основной, современный REST API)
//   onlinesim   — https://onlinesim.io (резервный, простой GET API)
//
// Переменные окружения:
//   SMS_PROVIDER             — основной провайдер (по умолчанию smsactivate)
//   SMS_API_KEY              — API-ключ основного провайдера
//   SMS_OPERATOR             — только для 5sim: оператор (по умолчанию 'any')
//   SMS_COUNTRY_DEFAULT      — страна по умолчанию для основного провайдера:
//                              для smsactivate — число country_id (0 = Россия),
//                              для 5sim — код страны ('russia'),
//                              для onlinesim — не используется (коды E.164 свои)
//   SMS_BACKUP_PROVIDER      — резервный провайдер (smsactivate | 5sim | onlinesim).
//                              Если задан вместе с SMS_BACKUP_API_KEY, при ошибке
//                              покупки у основного автоматически пробуем резервного.
//   SMS_BACKUP_API_KEY       — API-ключ резервного провайдера
//   SMS_BACKUP_COUNTRY_DEFAULT — страна по умолчанию для резервного провайдера
//   SMS_ACTIVATE_BASE        — необязательно, базовый URL sms-activate
//   SMS_FIVE_SIM_BASE        — необязательно, базовый URL 5sim
//   ONLINESIM_BASE           — необязательно, базовый URL onlinesim
//
// Если ни у основного, ни у резервного провайдера не задан ключ —
// isConfigured() === false, и сервис работает как раньше:
// номер выдаёт администратор вручную в админ-панели.
//
// Идентификаторы активаций (purchases.activation_id):
//   act:123456   — активация sms-activate
//   sim:123456   — активация 5sim
//   ols:123456   — активация onlinesim (tzid)
//   pool:12      — номер из собственного пула (обрабатывается в server.js)
//   без префикса — активация старого формата, относится к основному провайдеру.

const ACTIVATE_BASE = process.env.SMS_ACTIVATE_BASE || 'https://sms-activate.org';
const FIVE_SIM_BASE = process.env.SMS_FIVE_SIM_BASE || 'https://5sim.net';
const ONLINESIM_BASE = process.env.ONLINESIM_BASE || 'https://onlinesim.io';

const PRIMARY_PROVIDER = (process.env.SMS_PROVIDER || 'smsactivate').toLowerCase();
const PRIMARY_API_KEY = process.env.SMS_API_KEY || '';
const BACKUP_PROVIDER = (process.env.SMS_BACKUP_PROVIDER || '').toLowerCase();
const BACKUP_API_KEY = process.env.SMS_BACKUP_API_KEY || '';
const OPERATOR = process.env.SMS_OPERATOR || 'any';
const DEFAULT_COUNTRY = process.env.SMS_COUNTRY_DEFAULT || '';
const BACKUP_COUNTRY = process.env.SMS_BACKUP_COUNTRY_DEFAULT || '';

function isConfigured() {
  return !!(PRIMARY_API_KEY || (BACKUP_PROVIDER && BACKUP_API_KEY));
}

// Ключ для конкретного провайдера: резервного — из резервной переменной,
// иначе из основной. Провайдер без своего ключа не участвует в покупке.
function apiKeyFor(provider) {
  if (provider === BACKUP_PROVIDER && BACKUP_PROVIDER !== PRIMARY_PROVIDER) return BACKUP_API_KEY;
  return PRIMARY_API_KEY;
}

// Список провайдеров в порядке попытки покупки: основной, затем резервный.
function providerCandidates() {
  const list = [];
  if (PRIMARY_API_KEY) list.push({ provider: PRIMARY_PROVIDER, apiKey: PRIMARY_API_KEY });
  if (BACKUP_PROVIDER && BACKUP_PROVIDER !== PRIMARY_PROVIDER && BACKUP_API_KEY) {
    list.push({ provider: BACKUP_PROVIDER, apiKey: BACKUP_API_KEY });
  }
  return list;
}

// Провайдер активации по её id (разбор префикса). Старый формат — основной.
function providerOf(activationId) {
  const id = String(activationId);
  if (id.indexOf('act:') === 0) return 'smsactivate';
  if (id.indexOf('sim:') === 0) return '5sim';
  if (id.indexOf('ols:') === 0) return 'onlinesim';
  return PRIMARY_PROVIDER;
}

function rawId(activationId) {
  return String(activationId).replace(/^(act|sim|ols):/, '');
}

function tagId(provider, id) {
  if (provider === '5sim') return 'sim:' + id;
  if (provider === 'onlinesim') return 'ols:' + id;
  return 'act:' + id;
}

function provider() {
  return PRIMARY_PROVIDER;
}

// ========================================================================
//  Маппинг сервисов каталога → id провайдера
// ========================================================================
// Ключи — id из js/data.js (SERVICES). Если сервиса нет в маппинге провайдера,
// покупка у него не выполняется (покупать «наугад» нельзя). Если сервиса нет
// ни у одного провайдера — заказ переходит в ручную выдачу администратору
// (см. resolveService ниже). Дополняйте маппинг под свои продажи.

// sms-activate: коды сервисов (https://sms-activate.org/ru/api2)
const ACTIVATE_SERVICES = {
  telegram: 'tg',
  'telegram-premium': 'tg',
  whatsapp: 'wa',
  viber: 'vi',
  discord: 'ds',
  signal: 'sg',
  skype: 'sk',
  icq: 'icq',
  instagram: 'ig',
  facebook: 'fb',
  'x-twitter': 'tw',
  tiktok: 'tt',
  snapchat: 'sc',
  linkedin: 'li',
  vk: 'vk',
  mamba: 'mamba',
  badoo: 'badoo',
  mailru: 'mm',
  google: 'go',
  microsoft: 'mt',
  apple: 'ap',
  chatgpt: 'chatgpt',
  openai: 'chatgpt',
  yahoo: 'yh',
  rambler: 'rb',
  protonmail: 'proton',
  binance: 'bn',
  bybit: 'bybit',
  okx: 'okx',
  huobi: 'hb',
  coinbase: 'cb',
  kraken: 'kr',
  gateio: 'ga',
  kucoin: 'kc',
  mexc: 'mexc',
  whitebit: 'whitebit',
  sberbank: 'sber',
  tinkoff: 'tinkoff',
  qiwi: 'qiwi',
  yoomoney: 'yandex',
  webmoney: 'wm',
  paypal: 'pp',
  wise: 'wise',
  revolut: 'revolut',
  netflix: 'nf',
  spotify: 'sp',
  twitch: 'twitch',
  youtube: 'yt',
  steam: 'st',
  'epic-games': 'ep',
  xbox: 'xb',
  playstation: 'ps',
  riot: 'riot',
  booking: 'bk',
  uber: 'ub',
  bolt: 'bolt',
  avito: 'av',
  olx: 'olx',
  aliexpress: 'ali',
  ebay: 'eb',
  tinder: 'tinder',
  'free-fire': 'freefire',
};

// 5sim: названия продуктов (https://5sim.net/ru/docs) — почти совпадают с каталогом
const FIVE_SIM_SERVICES = {
  telegram: 'telegram',
  'telegram-premium': 'telegram',
  whatsapp: 'whatsapp',
  viber: 'viber',
  discord: 'discord',
  signal: 'signal',
  skype: 'skype',
  icq: 'icq',
  instagram: 'instagram',
  facebook: 'facebook',
  'x-twitter': 'twitter',
  tiktok: 'tiktok',
  snapchat: 'snapchat',
  linkedin: 'linkedin',
  vk: 'vk',
  mamba: 'mamba',
  badoo: 'badoo',
  mailru: 'mailru',
  google: 'google',
  microsoft: 'microsoft',
  apple: 'apple',
  chatgpt: 'chatgpt',
  openai: 'chatgpt',
  yahoo: 'yahoo',
  rambler: 'rambler',
  protonmail: 'protonmail',
  binance: 'binance',
  bybit: 'bybit',
  okx: 'okx',
  huobi: 'huobi',
  coinbase: 'coinbase',
  kraken: 'kraken',
  gateio: 'gateio',
  kucoin: 'kucoin',
  mexc: 'mexc',
  whitebit: 'whitebit',
  sberbank: 'sber',
  tinkoff: 'tinkoff',
  qiwi: 'qiwi',
  yoomoney: 'yandex',
  webmoney: 'webmoney',
  paypal: 'paypal',
  wise: 'wise',
  revolut: 'revolut',
  netflix: 'netflix',
  spotify: 'spotify',
  twitch: 'twitch',
  youtube: 'youtube',
  steam: 'steam',
  'epic-games': 'epicgames',
  xbox: 'xbox',
  playstation: 'playstation',
  riot: 'riotgames',
  booking: 'booking',
  uber: 'uber',
  bolt: 'bolt',
  avito: 'avito',
  olx: 'olx',
  aliexpress: 'aliexpress',
  ebay: 'ebay',
  amazon: 'amazon',
  tinder: 'tinder',
  'free-fire': 'freefire',
};

// onlinesim: коды сервисов (slug из getTariffs.php / getNum.php).
// Большинство названий каталога совпадают со slug'ами onlinesim (telegram,
// whatsapp, instagram, facebook, google...), поэтому здесь только исключения,
// остальные подбираются динамически из getTariffs по совпадению имени.
const ONLINESIM_SERVICES = {
  vk: 'vkcom',
};

// Синонимы: имя каталога → ожидаемое имя/название у onlinesim, если они не
// совпадают дословно (используются при динамическом поиске сервиса).
const ONLINESIM_SYNONYMS = {
  'telegram-premium': 'telegram',
  'x-twitter': 'twitter',
  'epic-games': 'epicgames',
  'free-fire': 'freefire',
  riot: 'riotgames',
  chatgpt: 'openai',
  openai: 'openai',
  protonmail: 'protonmail',
  sberbank: 'sber',
  yoomoney: 'yandex',
  mailru: 'mail',
  avito: 'avito',
  olx: 'olx',
  aliexpress: 'aliexpress',
  tinkoff: 'tinkoff',
};

// ========================================================================
//  Маппинг стран каталога → id/код провайдера
// ========================================================================
// sms-activate: числовые country_id из официального списка
const ACTIVATE_COUNTRIES = {
  'Россия': 0,
  'Украина': 1,
  'Казахстан': 2,
  'Китай': 3,
  'Филиппины': 4,
  'Мьянма': 5,
  'Индонезия': 6,
  'Малайзия': 7,
  'Кения': 8,
  'Танзания': 9,
  'Вьетнам': 10,
  'Киргизия': 11,
  'США': 12,
  'Израиль': 13,
  'Гонконг': 14,
  'Польша': 15,
  'Великобритания': 16,
  'Нигерия': 19,
  'Египет': 21,
  'Индия': 22,
  'Ирландия': 23,
  'Камбоджа': 24,
  'Сербия': 29,
  'ЮАР': 31,
  'Румыния': 32,
  'Колумбия': 33,
  'Эстония': 34,
  'Азербайджан': 35,
  'Канада': 36,
  'Марокко': 37,
  'Гана': 38,
  'Аргентина': 39,
  'Узбекистан': 40,
  'Камерун': 41,
  'Германия': 43,
  'Литва': 44,
  'Хорватия': 45,
  'Швеция': 46,
  'Нидерланды': 48,
  'Латвия': 49,
  'Австрия': 50,
  'Беларусь': 51,
  'Таиланд': 52,
  'Саудовская Аравия': 53,
  'Мексика': 54,
  'Тайвань': 55,
  'Испания': 56,
  'Иран': 57,
  'Алжир': 58,
  'Словения': 59,
  'Бангладеш': 60,
  'Сенегал': 61,
  'Турция': 62,
  'Чехия': 63,
  'Шри-Ланка': 64,
  'Перу': 65,
  'Пакистан': 66,
  'Новая Зеландия': 67,
  'Бразилия': 69,
  'Португалия': 70,
  'Греция': 71,
  'Ангола': 72,
  'Уганда': 73,
  'Южная Корея': 74,
};

// 5sim: коды стран (нижний регистр, слитно)
const FIVE_SIM_COUNTRIES = {
  'Россия': 'russia',
  'Украина': 'ukraine',
  'Казахстан': 'kazakhstan',
  'США': 'usa',
  'Великобритания': 'unitedkingdom',
  'Германия': 'germany',
  'Франция': 'france',
  'Испания': 'spain',
  'Италия': 'italy',
  'Турция': 'turkey',
  'Китай': 'china',
  'Индия': 'india',
  'Япония': 'japan',
  'Бразилия': 'brazil',
  'Канада': 'canada',
  'Австралия': 'australia',
  'Нидерланды': 'netherlands',
  'Швеция': 'sweden',
  'Норвегия': 'norway',
  'Польша': 'poland',
  'Чехия': 'czech',
  'Индонезия': 'indonesia',
  'Мексика': 'mexico',
  'Израиль': 'israel',
  'ОАЭ': 'uae',
  'Саудовская Аравия': 'saudiarabia',
  'Египет': 'egypt',
  'ЮАР': 'southafrica',
  'Аргентина': 'argentina',
  'Австрия': 'austria',
  'Бельгия': 'belgium',
  'Болгария': 'bulgaria',
  'Венгрия': 'hungary',
  'Вьетнам': 'vietnam',
  'Греция': 'greece',
  'Грузия': 'georgia',
  'Дания': 'denmark',
  'Ирландия': 'ireland',
  'Исландия': 'iceland',
  'Кипр': 'cyprus',
  'Колумбия': 'colombia',
  'Латвия': 'latvia',
  'Литва': 'lithuania',
  'Малайзия': 'malaysia',
  'Марокко': 'morocco',
  'Молдова': 'moldova',
  'Нигерия': 'nigeria',
  'Новая Зеландия': 'newzealand',
  'Португалия': 'portugal',
  'Румыния': 'romania',
  'Сербия': 'serbia',
  'Сингапур': 'singapore',
  'Словакия': 'slovakia',
  'Таиланд': 'thailand',
  'Тайвань': 'taiwan',
  'Узбекистан': 'uzbekistan',
  'Филиппины': 'philippines',
  'Финляндия': 'finland',
  'Хорватия': 'croatia',
  'Швейцария': 'switzerland',
  'Эстония': 'estonia',
  'Южная Корея': 'southkorea',
  'Азербайджан': 'azerbaijan',
  'Беларусь': 'belarus',
  'Бангладеш': 'bangladesh',
  'Чили': 'chile',
  'Перу': 'peru',
  'Пакистан': 'pakistan',
  'Алжир': 'algeria',
  'Тунис': 'tunisia',
  'Кения': 'kenya',
  'Гана': 'ghana',
  'Камерун': 'cameroon',
  'Шри-Ланка': 'srilanka',
};

// onlinesim: страны — телефонные коды E.164 (без '+'). API onlinesim принимает
// именно код страны, а не slug.
const ONLINESIM_COUNTRIES = {
  'Россия': 7,
  'Казахстан': 7,
  'Украина': 380,
  'Беларусь': 375,
  'США': 1,
  'Канада': 1,
  'Китай': 86,
  'Индия': 91,
  'Индонезия': 62,
  'Малайзия': 60,
  'Филиппины': 63,
  'Вьетнам': 84,
  'Таиланд': 66,
  'Япония': 81,
  'Южная Корея': 82,
  'Тайвань': 886,
  'Польша': 48,
  'Великобритания': 44,
  'Германия': 49,
  'Франция': 33,
  'Испания': 34,
  'Италия': 39,
  'Нидерланды': 31,
  'Бельгия': 32,
  'Австрия': 43,
  'Швейцария': 41,
  'Швеция': 46,
  'Норвегия': 47,
  'Дания': 45,
  'Финляндия': 358,
  'Ирландия': 353,
  'Исландия': 354,
  'Греция': 30,
  'Португалия': 351,
  'Чехия': 420,
  'Словакия': 421,
  'Венгрия': 36,
  'Румыния': 40,
  'Болгария': 359,
  'Сербия': 381,
  'Хорватия': 385,
  'Словения': 386,
  'Литва': 370,
  'Латвия': 371,
  'Эстония': 372,
  'Молдова': 373,
  'Грузия': 995,
  'Азербайджан': 994,
  'Армения': 374,
  'Узбекистан': 998,
  'Турция': 90,
  'Израиль': 972,
  'ОАЭ': 971,
  'Саудовская Аравия': 966,
  'Египет': 20,
  'Марокко': 212,
  'Тунис': 216,
  'Алжир': 213,
  'Нигерия': 234,
  'Гана': 233,
  'Кения': 254,
  'Танзания': 255,
  'Уганда': 256,
  'Камерун': 237,
  'Сенегал': 221,
  'Ангола': 244,
  'ЮАР': 27,
  'Мексика': 52,
  'Бразилия': 55,
  'Аргентина': 54,
  'Колумбия': 57,
  'Чили': 56,
  'Перу': 51,
  'Австралия': 61,
  'Новая Зеландия': 64,
  'Сингапур': 65,
  'Бангладеш': 880,
  'Пакистан': 92,
  'Шри-Ланка': 94,
  'Иран': 98,
  'Киргизия': 996,
  'Мьянма': 95,
  'Камбоджа': 855,
};

// Имя страны из каталога → код конкретного провайдера. Неизвестные страны →
// страна по умолчанию (своя у резервного провайдера, иначе общая), иначе
// Россия. Ошибкой не падает: покупка с другой страной лучше, чем срыв заказа.
function resolveCountry(provider, countryName) {
  if (provider === 'onlinesim') {
    const c = (countryName && ONLINESIM_COUNTRIES[countryName]) || undefined;
    return c !== undefined ? String(c) : '7';
  }
  const map = provider === '5sim' ? FIVE_SIM_COUNTRIES : ACTIVATE_COUNTRIES;
  const v = (countryName && map[countryName]) || undefined;
  if (v !== undefined) return v;
  const def = (BACKUP_PROVIDER && provider === BACKUP_PROVIDER && provider !== PRIMARY_PROVIDER)
    ? BACKUP_COUNTRY
    : DEFAULT_COUNTRY;
  if (def) return def;
  return provider === '5sim' ? 'russia' : 0;
}

// Сервис каталога → сервис конкретного провайдера (статический маппинг).
// Если маппинга нет — null (для onlinesim есть ещё динамический резолв ниже).
function resolveService(provider, catalogId) {
  if (provider === 'onlinesim') return ONLINESIM_SERVICES[catalogId] || null;
  const map = provider === '5sim' ? FIVE_SIM_SERVICES : ACTIVATE_SERVICES;
  return map[catalogId] || null;
}

// ========================================================================
//  HTTP-хелперы
// ========================================================================

async function activateRequest(apiKey, action, params) {
  const qs = new URLSearchParams({ api_key: apiKey, action: action });
  for (const k in params) qs.set(k, params[k]);
  const res = await fetch(ACTIVATE_BASE + '/stubs/handler_api.php?' + qs.toString());
  return res.text();
}

async function fiveSimRequest(apiKey, method, path) {
  const res = await fetch(FIVE_SIM_BASE + '/v1' + path, {
    method: method,
    headers: {
      Authorization: 'Bearer ' + apiKey,
      Accept: 'application/json',
    },
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* не-JSON ответ */ }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error || data.detail)) || ('5sim HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ========================================================================
//  sms-activate: покупка номера
// ========================================================================
async function activateBuyNumber(serviceCode, countryCode, apiKey) {
  const params = { service: serviceCode };
  if (countryCode !== undefined && countryCode !== null && countryCode !== '') {
    params.country = String(countryCode);
  }
  const text = await activateRequest(apiKey, 'getNumber', params);
  // Успех: ACCESS_NUMBER:ID:ФОРМАТ_НОМЕРА
  if (text.indexOf('ACCESS_NUMBER:') === 0) {
    const parts = text.split(':');
    if (parts.length >= 3) return { id: parts[1], phone: parts[2] };
  }
  throw new Error('sms-activate: ' + text);
}

async function activateGetCode(apiKey, activationId) {
  const text = await activateRequest(apiKey, 'getStatus', { id: activationId });
  if (text.indexOf('STATUS_OK:') === 0) return { status: 'ok', code: text.split(':')[1] };
  if (text === 'STATUS_WAIT_CODE') return { status: 'wait_code' };
  if (text === 'STATUS_WAIT_RETRY') return { status: 'wait_code' };
  if (text === 'STATUS_CANCEL') return { status: 'cancel' };
  if (text === 'STATUS_TIMEOUT') return { status: 'timeout' };
  return { status: 'error', error: text };
}

async function activateCancel(apiKey, activationId) {
  return activateRequest(apiKey, 'setStatus', { id: activationId, status: 6 });
}

// ========================================================================
//  5sim: покупка номера
// ========================================================================
async function fiveSimBuyNumber(serviceCode, countryCode, apiKey) {
  const country = countryCode || 'russia';
  const data = await fiveSimRequest(apiKey, 'GET', '/user/buy/activation/' + country + '/' + OPERATOR + '/' + serviceCode);
  if (!data || !data.id || !data.phone) {
    throw new Error('5sim: не удалось получить номер' + (data && data.message ? ': ' + data.message : ''));
  }
  return { id: String(data.id), phone: data.phone };
}

async function fiveSimGetCode(apiKey, activationId) {
  const data = await fiveSimRequest(apiKey, 'GET', '/user/check/' + activationId);
  if (!data) return { status: 'error', error: '5sim: пустой ответ' };
  if (data.status === 'STATUS_OK') {
    const sms = (data.sms && data.sms.length) ? data.sms[data.sms.length - 1] : null;
    if (sms && sms.code) return { status: 'ok', code: String(sms.code) };
    return { status: 'wait_code' };
  }
  if (data.status === 'STATUS_WAIT_CODE') return { status: 'wait_code' };
  if (data.status === 'STATUS_CANCEL') return { status: 'cancel' };
  if (data.status === 'STATUS_TIMEOUT') return { status: 'timeout' };
  return { status: 'error', error: '5sim: ' + data.status };
}

async function fiveSimCancel(apiKey, activationId) {
  return fiveSimRequest(apiKey, 'GET', '/user/cancel/' + activationId);
}

// ========================================================================
//  onlinesim: покупка номера и получение кода
//  https://onlinesim.io — API: GET /api/<method>.php?apikey=...&lang=ru
//  Успех методов getNum/getTariffs/setOperationOk: { "response": "1", ... }.
//  Ошибка — { "response": "<КОД_ОШИБКИ>" } (или HTTP 456). getState возвращает
//  массив операций, где "response" — статус активации (TZ_*).
// ========================================================================

async function onlinesimRequest(apiKey, method, params) {
  const qs = new URLSearchParams({ apikey: apiKey, lang: 'ru' });
  for (const k in params) {
    const v = params[k];
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000); // не виснуть на резервном
  let res;
  try {
    res = await fetch(ONLINESIM_BASE + '/api/' + method + '.php?' + qs.toString(), { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* пустой или не-JSON ответ */ }
  if (!data) throw new Error('onlinesim: пустой ответ от ' + method + ' (HTTP ' + res.status + ')');
  return data;
}

async function onlinesimBuyNumber(serviceCode, countryCode, apiKey) {
  const params = { service: serviceCode, number: 1 };
  if (countryCode) params.country = String(countryCode);
  const data = await onlinesimRequest(apiKey, 'getNum', params);
  if (!data || String(data.response) !== '1') {
    throw new Error('onlinesim: ' + (data && data.response ? data.response : 'пустой ответ'));
  }
  if (!data.tzid) throw new Error('onlinesim: нет tzid в ответе getNum');
  return { id: String(data.tzid), phone: data.number ? String(data.number) : '' };
}

async function onlinesimGetCode(apiKey, activationId) {
  const data = await onlinesimRequest(apiKey, 'getState', {
    tzid: activationId,
    message_to_code: 1,
    msg_list: 1,
  });
  if (!Array.isArray(data) || !data.length) return { status: 'wait_code' };
  const item = data[0];
  const st = item.response;
  if (st === 'TZ_NUM_ANSWER') {
    // с message_to_code=1 код приходит в msg (или sms_code), уже в тексте
    const raw = item.sms_code !== undefined ? item.sms_code : item.msg;
    if (raw !== undefined && raw !== null && String(raw) !== '') {
      const code = String(raw).replace(/\D/g, '').slice(0, 8);
      if (code) return { status: 'ok', code };
    }
    return { status: 'wait_code' };
  }
  if (st === 'TZ_INPOOL' || st === 'TZ_NUM_WAIT' || st === 'TZ_NUM_ANSWER') return { status: 'wait_code' };
  if (st === 'TZ_OVER_EMPTY') return { status: 'timeout' };
  if (st === 'TZ_OVER_OK') return { status: 'cancel' };
  return { status: 'error', error: 'onlinesim: ' + st };
}

async function onlinesimCancel(apiKey, activationId) {
  await onlinesimRequest(apiKey, 'setOperationOk', { tzid: activationId });
  return { ok: true };
}

// Кэш списка сервисов onlinesim из getTariffs (страница популярных; для
// резервного провайдера достаточно). Нормализация slug'ов → поиск сервиса.
let onlinesimServiceCache = null;

function normalizeServiceName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function onlinesimServiceList(apiKey) {
  if (onlinesimServiceCache) return onlinesimServiceCache;
  const data = await onlinesimRequest(apiKey, 'getTariffs', {});
  const out = [];
  if (data && data.services && typeof data.services === 'object') {
    for (const key in data.services) {
      const s = data.services[key];
      if (s && s.slug) out.push({ slug: s.slug, name: s.service || '' });
    }
  }
  if (out.length) onlinesimServiceCache = out;
  return out;
}

// Сервис каталога → slug onlinesim. Сначала статический хинт, затем
// динамический поиск по списку из getTariffs (по slug или по имени сервиса).
async function onlinesimResolveService(apiKey, catalogId) {
  const hint = resolveService('onlinesim', catalogId);
  if (hint) return hint;
  const norm = normalizeServiceName(ONLINESIM_SYNONYMS[catalogId] || catalogId);
  let list;
  try {
    list = await onlinesimServiceList(apiKey);
  } catch (e) {
    return null; // список недоступен — сервис считаем ненастроенным
  }
  for (const s of list) {
    if (normalizeServiceName(s.slug) === norm || normalizeServiceName(s.name) === norm) {
      return s.slug;
    }
  }
  return null;
}

// ========================================================================
//  Публичный API
// ========================================================================

// Сервис каталога → сервис конкретного провайдера (асинхронный, для onlinesim
// делает динамический резолв по getTariffs). null — у провайдера сервиса нет.
async function resolveServiceAsync(provider, apiKey, catalogId) {
  if (provider === 'onlinesim') return onlinesimResolveService(apiKey, catalogId);
  return resolveService(provider, catalogId);
}

// Купить номер. Возвращает { id, phone, provider } (id — с префиксом
// act:/sim:/ols:, чтобы getCode/cancel знали, у кого спрашивать). Сначала
// пробуем основного провайдера, при его ошибке — резервного. Бросает
// ошибку, если:
//   — ни у одного провайдера нет ключа;
//   — сервис нет в маппинге ни одного провайдера (тогда номер выдаёт админ);
//   — все провайдеры вернули ошибку (нет баланса/номеров и т.п.).
async function buyNumber(opts) {
  const candidates = providerCandidates();
  if (!candidates.length) throw new Error('SMS_API_KEY не задан');

  let lastError = null;
  for (const cand of candidates) {
    let serviceCode;
    try {
      serviceCode = await resolveServiceAsync(cand.provider, cand.apiKey, opts.serviceId);
    } catch (e) {
      lastError = e;
      continue;
    }
    if (!serviceCode) {
      // У этого провайдера сервиса нет — пробуем следующего. Если других
      // нет, в конце цикла бросим понятную ошибку про настройку сервиса.
      lastError = new Error('Сервис «' + (opts.serviceId || opts.serviceName || '?')
        + '» не настроен у ' + cand.provider + ' — номер выдаст админ');
      continue;
    }
    const countryCode = resolveCountry(cand.provider, opts.country);
    try {
      const res = cand.provider === '5sim'
        ? await fiveSimBuyNumber(serviceCode, countryCode, cand.apiKey)
        : cand.provider === 'onlinesim'
          ? await onlinesimBuyNumber(serviceCode, countryCode, cand.apiKey)
          : await activateBuyNumber(serviceCode, countryCode, cand.apiKey);
      res.provider = cand.provider;
      res.id = tagId(cand.provider, res.id);
      return res;
    } catch (err) {
      // Ошибка покупки (нет номеров, недоступен, нет баланса) — пробуем
      // резервного. Запоминаем последнюю причину для понятного сообщения.
      lastError = err;
    }
  }
  throw lastError || new Error('Не удалось купить номер ни у одного провайдера');
}

// Получить статус активации / SMS-код.
async function getCode(activationId) {
  const provider = providerOf(activationId);
  const apiKey = apiKeyFor(provider);
  if (provider === '5sim') return fiveSimGetCode(apiKey, rawId(activationId));
  if (provider === 'onlinesim') return onlinesimGetCode(apiKey, rawId(activationId));
  return activateGetCode(apiKey, rawId(activationId));
}

// Отменить активацию (номер возвращается провайдеру).
async function cancel(activationId) {
  const provider = providerOf(activationId);
  const apiKey = apiKeyFor(provider);
  if (provider === '5sim') return fiveSimCancel(apiKey, rawId(activationId));
  if (provider === 'onlinesim') return onlinesimCancel(apiKey, rawId(activationId));
  return activateCancel(apiKey, rawId(activationId));
}

// Публичные обёртки для основного провайдера (обратная совместимость).
function resolveServiceLegacy(catalogId) {
  return resolveService(PRIMARY_PROVIDER, catalogId);
}

function resolveCountryLegacy(countryName) {
  return resolveCountry(PRIMARY_PROVIDER, countryName);
}

module.exports = {
  isConfigured,
  provider,
  buyNumber,
  getCode,
  cancel,
  resolveService: resolveServiceLegacy,
  resolveCountry: resolveCountryLegacy,
};
