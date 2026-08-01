// data.js — Покупки, тикеты поддержки, баланс (localStorage)

window.Data = (function() {
  var KEYS = {
    purchases: 'sms_purchases',
    tickets: 'sms_tickets',
    messages: 'sms_messages',
    topups: 'sms_topups'
  };

  function get(k) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : [];
    } catch(e) { return []; }
  }
  function set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }

  // Базовый URL API. В file:// (демо-режим без сервера) origin='null' —
  // возвращаем '', синхронизация с сервером не выполняется.
  function apiBase() {
    try {
      var o = window.location.origin;
      return (o && o !== 'null') ? o : '';
    } catch(e) { return ''; }
  }

  // Fire-and-forget POST на сервер: если сервер недоступен — заказ останется
  // в localStorage и будет запушен при следующем действии.
  function postToServer(url, payload) {
    var base = apiBase();
    if (!base) return;
    try {
      fetch(base + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function() { /* ignore — офлайн */ });
    } catch(e) { /* ignore */ }
  }

  // ───────────────────────────────────────────
  // Catalog — 202 Services
  // ───────────────────────────────────────────

  var SERVICES = [
    { id: 'telegram', name: 'Telegram', cat: 'Мессенджеры', price: 49 },
    { id: 'whatsapp', name: 'WhatsApp', cat: 'Мессенджеры', price: 39 },
    { id: 'viber', name: 'Viber', cat: 'Мессенджеры', price: 35 },
    { id: 'discord', name: 'Discord', cat: 'Мессенджеры', price: 45 },
    { id: 'signal', name: 'Signal', cat: 'Мессенджеры', price: 40 },
    { id: 'wechat', name: 'WeChat', cat: 'Мессенджеры', price: 50 },
    { id: 'line', name: 'Line', cat: 'Мессенджеры', price: 45 },
    { id: 'skype', name: 'Skype', cat: 'Мессенджеры', price: 30 },
    { id: 'icq', name: 'ICQ', cat: 'Мессенджеры', price: 30 },
    { id: 'kakaotalk', name: 'KakaoTalk', cat: 'Мессенджеры', price: 55 },
    { id: 'qq', name: 'QQ', cat: 'Мессенджеры', price: 50 },

    { id: 'instagram', name: 'Instagram', cat: 'Социальные сети', price: 45 },
    { id: 'facebook', name: 'Facebook', cat: 'Социальные сети', price: 39 },
    { id: 'x-twitter', name: 'X (Twitter)', cat: 'Социальные сети', price: 49 },
    { id: 'tiktok', name: 'TikTok', cat: 'Социальные сети', price: 55 },
    { id: 'snapchat', name: 'Snapchat', cat: 'Социальные сети', price: 45 },
    { id: 'linkedin', name: 'LinkedIn', cat: 'Социальные сети', price: 49 },
    { id: 'pinterest', name: 'Pinterest', cat: 'Социальные сети', price: 35 },
    { id: 'bumble', name: 'Bumble', cat: 'Социальные сети', price: 45 },
    { id: 'happn', name: 'Happn', cat: 'Социальные сети', price: 45 },
    { id: 'hinge', name: 'Hinge', cat: 'Социальные сети', price: 45 },
    { id: 'okcupid', name: 'OkCupid', cat: 'Социальные сети', price: 40 },
    { id: 'plenty-of-fish', name: 'Plenty of Fish', cat: 'Социальные сети', price: 40 },
    { id: 'skout', name: 'Skout', cat: 'Социальные сети', price: 40 },
    { id: 'tinder', name: 'Tinder', cat: 'Социальные сети', price: 45 },
    { id: 'vk', name: 'VK', cat: 'Социальные сети', price: 35 },
    { id: 'mamba', name: 'Мамба', cat: 'Социальные сети', price: 40 },

    { id: 'telegram-premium', name: 'Telegram Premium', cat: 'Премиум', price: 149 },
    { id: 'google', name: 'Google', cat: 'Разное', price: 30 },
    { id: 'microsoft', name: 'Microsoft', cat: 'Разное', price: 35 },
    { id: 'apple', name: 'Apple', cat: 'Разное', price: 45 },
    { id: 'chatgpt', name: 'ChatGPT', cat: 'Разное', price: 55 },
    { id: 'openai', name: 'OpenAI', cat: 'Разное', price: 55 },
    { id: 'adobe', name: 'Adobe', cat: 'Разное', price: 55 },
    { id: 'yahoo', name: 'Yahoo', cat: 'Разное', price: 35 },
    { id: 'aol', name: 'AOL', cat: 'Разное', price: 40 },
    { id: 'bing', name: 'Bing', cat: 'Разное', price: 35 },
    { id: 'rambler', name: 'Рамблер', cat: 'Разное', price: 30 },
    { id: 'protonmail', name: 'ProtonMail', cat: 'Разное', price: 45 },
    { id: 'twilio', name: 'Twilio', cat: 'Разное', price: 60 },
    { id: 'fiverr', name: 'Fiverr', cat: 'Разное', price: 45 },
    { id: 'indeed', name: 'Indeed', cat: 'Разное', price: 35 },
    { id: 'linode', name: 'Linode', cat: 'Разное', price: 50 },
    { id: 'derik', name: 'Derik', cat: 'Разное', price: 40 },
    { id: 'dhl', name: 'DHL', cat: 'Разное', price: 35 },
    { id: 'kontakt-bar', name: 'Контакт Бар', cat: 'Разное', price: 35 },
    { id: 'audi', name: 'Audi', cat: 'Разное', price: 45 },

    { id: 'binance', name: 'Binance', cat: 'Криптобиржи', price: 79 },
    { id: 'bybit', name: 'Bybit', cat: 'Криптобиржи', price: 75 },
    { id: 'huobi', name: 'Huobi', cat: 'Криптобиржи', price: 65 },
    { id: 'okx', name: 'OKX', cat: 'Криптобиржи', price: 70 },
    { id: 'coinbase', name: 'Coinbase', cat: 'Криптобиржи', price: 89 },
    { id: 'kraken', name: 'Kraken', cat: 'Криптобиржи', price: 85 },
    { id: 'gateio', name: 'Gate.io', cat: 'Криптобиржи', price: 65 },
    { id: 'kucoin', name: 'KuCoin', cat: 'Криптобиржи', price: 65 },
    { id: 'mexc', name: 'MEXC', cat: 'Криптобиржи', price: 60 },

    { id: '888poker', name: '888poker', cat: 'Покер и Гемблинг', price: 65 },
    { id: 'ggpoker', name: 'GGPoker', cat: 'Покер и Гемблинг', price: 75 },
    { id: 'global-poker', name: 'Global Poker', cat: 'Покер и Гемблинг', price: 60 },
    { id: 'pokerstars', name: 'PokerStars', cat: 'Покер и Гемблинг', price: 69 },
    { id: 'partypoker', name: 'Partypoker', cat: 'Покер и Гемблинг', price: 65 },
    { id: 'bet365', name: 'Bet365', cat: 'Покер и Гемблинг', price: 55 },
    { id: '1xbet', name: '1xBet', cat: 'Покер и Гемблинг', price: 50 },
    { id: 'william-hill', name: 'William Hill', cat: 'Покер и Гемблинг', price: 55 },
    { id: 'draftkings', name: 'DraftKings', cat: 'Покер и Гемблинг', price: 60 },
    { id: 'fanduel', name: 'FanDuel', cat: 'Покер и Гемблинг', price: 60 },
    { id: '22bet', name: '22bet', cat: 'Покер и Гемблинг', price: 65 },

    { id: 'sberbank', name: 'Сбербанк', cat: 'Банки', price: 35 },
    { id: 'tinkoff', name: 'Тинькофф', cat: 'Банки', price: 35 },
    { id: 'raiffeisen', name: 'Raiffeisen', cat: 'Банки', price: 40 },

    { id: 'paypal', name: 'PayPal', cat: 'Платежные системы', price: 49 },
    { id: 'wise', name: 'Wise', cat: 'Платежные системы', price: 45 },
    { id: 'revolut', name: 'Revolut', cat: 'Платежные системы', price: 45 },
    { id: 'webmoney', name: 'WebMoney', cat: 'Платежные системы', price: 30 },
    { id: 'qiwi', name: 'QIWI', cat: 'Платежные системы', price: 30 },
    { id: 'yoomoney', name: 'ЮMoney', cat: 'Платежные системы', price: 30 },

    { id: 'netflix', name: 'Netflix', cat: 'Стриминг', price: 49 },
    { id: 'spotify', name: 'Spotify', cat: 'Стриминг', price: 39 },
    { id: 'twitch', name: 'Twitch', cat: 'Стриминг', price: 35 },
    { id: 'youtube', name: 'YouTube', cat: 'Стриминг', price: 45 },

    { id: 'steam', name: 'Steam', cat: 'Игры и Платформы', price: 35 },
    { id: 'epic-games', name: 'Epic Games', cat: 'Игры и Платформы', price: 35 },
    { id: 'xbox', name: 'Xbox', cat: 'Игры и Платформы', price: 40 },
    { id: 'playstation', name: 'PlayStation', cat: 'Игры и Платформы', price: 45 },
    { id: 'riot-games', name: 'Riot Games', cat: 'Игры и Платформы', price: 35 },
    { id: 'ubisoft', name: 'Ubisoft', cat: 'Игры и Платформы', price: 35 },
    { id: 'minecraft', name: 'Minecraft', cat: 'Игры и Платформы', price: 30 },
    { id: 'pubg', name: 'PUBG', cat: 'Игры и Платформы', price: 35 },
    { id: 'free-fire', name: 'Free Fire', cat: 'Игры и Платформы', price: 30 },
    { id: 'battle-net', name: 'Battle.net', cat: 'Игры и Платформы', price: 45 },
    { id: 'wargaming', name: 'Wargaming', cat: 'Игры и Платформы', price: 40 },

    { id: 'booking', name: 'Booking.com', cat: 'Сервисы', price: 30 },
    { id: 'uber', name: 'Uber', cat: 'Сервисы', price: 35 },
    { id: 'bolt', name: 'Bolt', cat: 'Сервисы', price: 30 },
    { id: 'airbnb', name: 'Airbnb', cat: 'Сервисы', price: 40 },
    { id: 'avito', name: 'Avito', cat: 'Сервисы', price: 30 },
    { id: 'olx', name: 'OLX', cat: 'Сервисы', price: 30 },
    { id: 'craigslist', name: 'Craigslist', cat: 'Сервисы', price: 25 },
    { id: '2dehands', name: '2dehands', cat: 'Сервисы', price: 35 },
    { id: 'alibaba', name: 'Alibaba', cat: 'Сервисы', price: 45 },
    { id: 'aliexpress', name: 'AliExpress', cat: 'Сервисы', price: 40 },
    { id: 'ebay', name: 'eBay', cat: 'Сервисы', price: 40 },
    { id: 'adidas', name: 'Adidas', cat: 'Сервисы', price: 40 },
    { id: 'nike', name: 'Nike', cat: 'Сервисы', price: 40 },
    { id: 'zara', name: 'Zara', cat: 'Сервисы', price: 35 },
    { id: 'foodpanda', name: 'Foodpanda', cat: 'Сервисы', price: 35 },
    { id: 'wolt', name: 'Wolt', cat: 'Сервисы', price: 35 },
    { id: 'glovo', name: 'Glovo', cat: 'Сервисы', price: 40 },
    { id: 'doordash', name: 'Doordash', cat: 'Сервисы', price: 40 },
    { id: 'gett', name: 'Gett', cat: 'Сервисы', price: 40 },
    { id: 'citymobil', name: 'Ситимобил', cat: 'Сервисы', price: 35 },
    { id: 'perekrestok', name: 'Перекрёсток', cat: 'Сервисы', price: 30 },
    { id: 'pyaterochka', name: 'Пятёрочка', cat: 'Сервисы', price: 30 },

    // ── Добавленные сервисы (sms-pro.guru + популярные) ──

    // Мессенджеры
    { id: 'threema', name: 'Threema', cat: 'Мессенджеры', price: 45 },
    { id: 'wire', name: 'Wire', cat: 'Мессенджеры', price: 40 },
    { id: 'element', name: 'Element', cat: 'Мессенджеры', price: 40 },
    { id: 'session', name: 'Session', cat: 'Мессенджеры', price: 45 },

    // Социальные сети
    { id: 'badoo', name: 'Badoo', cat: 'Социальные сети', price: 40 },
    { id: 'tagged', name: 'Tagged', cat: 'Социальные сети', price: 35 },
    { id: 'meetme', name: 'MeetMe', cat: 'Социальные сети', price: 35 },
    { id: 'twoo', name: 'Twoo', cat: 'Социальные сети', price: 35 },
    { id: 'tantan', name: 'TanTan', cat: 'Социальные сети', price: 40 },
    { id: 'odnoklassniki', name: 'Одноклассники', cat: 'Социальные сети', price: 30 },
    { id: 'mailru', name: 'Mail.ru', cat: 'Социальные сети', price: 30 },
    { id: 'weibo', name: 'Sina Weibo', cat: 'Социальные сети', price: 50 },
    { id: 'rumble', name: 'Rumble', cat: 'Социальные сети', price: 40 },
    { id: 'foursquare', name: 'Foursquare', cat: 'Социальные сети', price: 35 },

    // Криптобиржи
    { id: 'cryptocom', name: 'Crypto.com', cat: 'Криптобиржи', price: 85 },
    { id: 'bitfinex', name: 'Bitfinex', cat: 'Криптобиржи', price: 75 },
    { id: 'poloniex', name: 'Poloniex', cat: 'Криптобиржи', price: 65 },
    { id: 'bittrex', name: 'Bittrex', cat: 'Криптобиржи', price: 70 },
    { id: 'gemini', name: 'Gemini', cat: 'Криптобиржи', price: 85 },
    { id: 'etoro', name: 'eToro', cat: 'Криптобиржи', price: 75 },
    { id: 'cexio', name: 'CEX.io', cat: 'Криптобиржи', price: 65 },
    { id: 'coinex', name: 'CoinEx', cat: 'Криптобиржи', price: 60 },
    { id: 'blockchain', name: 'Blockchain.com', cat: 'Криптобиржи', price: 70 },
    { id: 'zengo', name: 'Zengo', cat: 'Криптобиржи', price: 75 },
    { id: 'whitebit', name: 'WhiteBIT', cat: 'Криптобиржи', price: 60 },

    // Покер и гемблинг
    { id: 'blizzard', name: 'Blizzard', cat: 'Игры и Платформы', price: 45 },
    { id: 'unibet', name: 'Unibet', cat: 'Покер и Гемблинг', price: 55 },
    { id: 'leovegas', name: 'LeoVegas', cat: 'Покер и Гемблинг', price: 55 },
    { id: 'casumo', name: 'Casumo', cat: 'Покер и Гемблинг', price: 50 },
    { id: 'paddypower', name: 'Paddy Power', cat: 'Покер и Гемблинг', price: 55 },

    // Игры и платформы
    { id: 'nintendo', name: 'Nintendo', cat: 'Игры и Платформы', price: 45 },
    { id: 'roblox', name: 'Roblox', cat: 'Игры и Платформы', price: 30 },
    { id: 'genshin', name: 'Genshin Impact', cat: 'Игры и Платформы', price: 35 },
    { id: 'hoyolab', name: 'HoYoLAB', cat: 'Игры и Платформы', price: 35 },
    { id: 'ea', name: 'Electronic Arts', cat: 'Игры и Платформы', price: 40 },
    { id: 'origin', name: 'Origin', cat: 'Игры и Платформы', price: 40 },
    { id: 'rockstar', name: 'Rockstar Social Club', cat: 'Игры и Платформы', price: 40 },
    { id: 'activision', name: 'Activision', cat: 'Игры и Платформы', price: 40 },
    { id: 'wildrift', name: 'Wild Rift', cat: 'Игры и Платформы', price: 35 },
    { id: 'mobilelegends', name: 'Mobile Legends', cat: 'Игры и Платформы', price: 35 },
    { id: 'supercell', name: 'Supercell', cat: 'Игры и Платформы', price: 30 },
    { id: 'hoyoverse', name: 'HoYoverse', cat: 'Игры и Платформы', price: 35 },

    // Стриминг
    { id: 'hulu', name: 'Hulu', cat: 'Стриминг', price: 45 },
    { id: 'disneyplus', name: 'Disney+', cat: 'Стриминг', price: 49 },
    { id: 'hbomax', name: 'HBO Max', cat: 'Стриминг', price: 55 },
    { id: 'paramount', name: 'Paramount+', cat: 'Стриминг', price: 45 },
    { id: 'appletv', name: 'Apple TV+', cat: 'Стриминг', price: 49 },
    { id: 'tidal', name: 'Tidal', cat: 'Стриминг', price: 39 },
    { id: 'deezer', name: 'Deezer', cat: 'Стриминг', price: 39 },
    { id: 'soundcloud', name: 'SoundCloud', cat: 'Стриминг', price: 35 },

    // Платежные системы
    { id: 'stripe', name: 'Stripe', cat: 'Платежные системы', price: 55 },
    { id: 'payoneer', name: 'Payoneer', cat: 'Платежные системы', price: 50 },
    { id: 'skrill', name: 'Skrill', cat: 'Платежные системы', price: 45 },
    { id: 'neteller', name: 'Neteller', cat: 'Платежные системы', price: 45 },
    { id: 'perfectmoney', name: 'Perfect Money', cat: 'Платежные системы', price: 40 },
    { id: 'advcash', name: 'AdvCash', cat: 'Платежные системы', price: 40 },
    { id: 'westernunion', name: 'Western Union', cat: 'Платежные системы', price: 35 },
    { id: 'moneygram', name: 'MoneyGram', cat: 'Платежные системы', price: 35 },
    { id: 'remitly', name: 'Remitly', cat: 'Платежные системы', price: 40 },

    // Сервисы
    { id: 'amazon', name: 'Amazon', cat: 'Сервисы', price: 40 },
    { id: 'etsy', name: 'Etsy', cat: 'Сервисы', price: 35 },
    { id: 'shopee', name: 'Shopee', cat: 'Сервисы', price: 35 },
    { id: 'lazada', name: 'Lazada', cat: 'Сервисы', price: 35 },
    { id: 'mercadolibre', name: 'Mercado Libre', cat: 'Сервисы', price: 35 },
    { id: 'rakuten', name: 'Rakuten', cat: 'Сервисы', price: 35 },
    { id: 'walmart', name: 'Walmart', cat: 'Сервисы', price: 35 },
    { id: 'target', name: 'Target', cat: 'Сервисы', price: 35 },
    { id: 'bestbuy', name: 'Best Buy', cat: 'Сервисы', price: 35 },
    { id: 'poshmark', name: 'Poshmark', cat: 'Сервисы', price: 35 },
    { id: 'offerup', name: 'OfferUp', cat: 'Сервисы', price: 30 },
    { id: 'yandex', name: 'Яндекс', cat: 'Сервисы', price: 30 },
    { id: 'zoho', name: 'Zoho', cat: 'Сервисы', price: 35 },
    { id: 'notion', name: 'Notion', cat: 'Сервисы', price: 40 },
    { id: 'slack', name: 'Slack', cat: 'Сервисы', price: 45 },
    { id: 'zoom', name: 'Zoom', cat: 'Сервисы', price: 35 },
    { id: 'dropbox', name: 'Dropbox', cat: 'Сервисы', price: 35 },
    { id: 'trello', name: 'Trello', cat: 'Сервисы', price: 30 },
    { id: 'shopify', name: 'Shopify', cat: 'Сервисы', price: 45 },
    { id: 'wordpress', name: 'WordPress', cat: 'Сервисы', price: 30 },
    { id: 'cloudflare', name: 'Cloudflare', cat: 'Сервисы', price: 35 },
    { id: 'github', name: 'GitHub', cat: 'Сервисы', price: 35 },
    { id: 'gitlab', name: 'GitLab', cat: 'Сервисы', price: 35 },
    { id: 'digitalocean', name: 'DigitalOcean', cat: 'Сервисы', price: 50 },
    { id: 'vultr', name: 'Vultr', cat: 'Сервисы', price: 50 },
    { id: 'heroku', name: 'Heroku', cat: 'Сервисы', price: 45 },
    { id: 'namecheap', name: 'Namecheap', cat: 'Сервисы', price: 35 },
    { id: 'godaddy', name: 'GoDaddy', cat: 'Сервисы', price: 35 },
    { id: 'duckduckgo', name: 'DuckDuckGo', cat: 'Сервисы', price: 30 },
    { id: 'medium', name: 'Medium', cat: 'Сервисы', price: 30 },
  ];

  // ───────────────────────────────────────────
  // Countries
  // ───────────────────────────────────────────

  var COUNTRIES = [
    { name: 'Россия', code: '+7', flag: '🇷🇺' },
    { name: 'Украина', code: '+380', flag: '🇺🇦' },
    { name: 'Казахстан', code: '+7', flag: '🇰🇿' },
    { name: 'США', code: '+1', flag: '🇺🇸' },
    { name: 'Великобритания', code: '+44', flag: '🇬🇧' },
    { name: 'Германия', code: '+49', flag: '🇩🇪' },
    { name: 'Франция', code: '+33', flag: '🇫🇷' },
    { name: 'Испания', code: '+34', flag: '🇪🇸' },
    { name: 'Италия', code: '+39', flag: '🇮🇹' },
    { name: 'Турция', code: '+90', flag: '🇹🇷' },
    { name: 'Китай', code: '+86', flag: '🇨🇳' },
    { name: 'Индия', code: '+91', flag: '🇮🇳' },
    { name: 'Япония', code: '+81', flag: '🇯🇵' },
    { name: 'Бразилия', code: '+55', flag: '🇧🇷' },
    { name: 'Канада', code: '+1', flag: '🇨🇦' },
    { name: 'Австралия', code: '+61', flag: '🇦🇺' },
    { name: 'Нидерланды', code: '+31', flag: '🇳🇱' },
    { name: 'Швеция', code: '+46', flag: '🇸🇪' },
    { name: 'Норвегия', code: '+47', flag: '🇳🇴' },
    { name: 'Польша', code: '+48', flag: '🇵🇱' },
    { name: 'Чехия', code: '+420', flag: '🇨🇿' },
    { name: 'Индонезия', code: '+62', flag: '🇮🇩' },
    { name: 'Мексика', code: '+52', flag: '🇲🇽' },
    { name: 'Израиль', code: '+972', flag: '🇮🇱' },
    { name: 'ОАЭ', code: '+971', flag: '🇦🇪' },
    { name: 'Саудовская Аравия', code: '+966', flag: '🇸🇦' },
    { name: 'Египет', code: '+20', flag: '🇪🇬' },
    { name: 'ЮАР', code: '+27', flag: '🇿🇦' },
    { name: 'Аргентина', code: '+54', flag: '🇦🇷' },
    { name: 'Австрия', code: '+43', flag: '🇦🇹' },
    { name: 'Бельгия', code: '+32', flag: '🇧🇪' },
    { name: 'Болгария', code: '+359', flag: '🇧🇬' },
    { name: 'Венгрия', code: '+36', flag: '🇭🇺' },
    { name: 'Вьетнам', code: '+84', flag: '🇻🇳' },
    { name: 'Греция', code: '+30', flag: '🇬🇷' },
    { name: 'Грузия', code: '+995', flag: '🇬🇪' },
    { name: 'Дания', code: '+45', flag: '🇩🇰' },
    { name: 'Ирландия', code: '+353', flag: '🇮🇪' },
    { name: 'Исландия', code: '+354', flag: '🇮🇸' },
    { name: 'Кипр', code: '+357', flag: '🇨🇾' },
    { name: 'Колумбия', code: '+57', flag: '🇨🇴' },
    { name: 'Латвия', code: '+371', flag: '🇱🇻' },
    { name: 'Литва', code: '+370', flag: '🇱🇹' },
    { name: 'Малайзия', code: '+60', flag: '🇲🇾' },
    { name: 'Марокко', code: '+212', flag: '🇲🇦' },
    { name: 'Молдова', code: '+373', flag: '🇲🇩' },
    { name: 'Нигерия', code: '+234', flag: '🇳🇬' },
    { name: 'Новая Зеландия', code: '+64', flag: '🇳🇿' },
    { name: 'Португалия', code: '+351', flag: '🇵🇹' },
    { name: 'Румыния', code: '+40', flag: '🇷🇴' },
    { name: 'Сербия', code: '+381', flag: '🇷🇸' },
    { name: 'Сингапур', code: '+65', flag: '🇸🇬' },
    { name: 'Словакия', code: '+421', flag: '🇸🇰' },
    { name: 'Таиланд', code: '+66', flag: '🇹🇭' },
    { name: 'Тайвань', code: '+886', flag: '🇹🇼' },
    { name: 'Узбекистан', code: '+998', flag: '🇺🇿' },
    { name: 'Филиппины', code: '+63', flag: '🇵🇭' },
    { name: 'Финляндия', code: '+358', flag: '🇫🇮' },
    { name: 'Хорватия', code: '+385', flag: '🇭🇷' },
    { name: 'Швейцария', code: '+41', flag: '🇨🇭' },
    { name: 'Эстония', code: '+372', flag: '🇪🇪' },
    { name: 'Южная Корея', code: '+82', flag: '🇰🇷' },
    { name: 'Азербайджан', code: '+994', flag: '🇦🇿' },
    { name: 'Ангола', code: '+244', flag: '🇦🇴' },
    { name: 'Афганистан', code: '+93', flag: '🇦🇫' },
    { name: 'Бангладеш', code: '+880', flag: '🇧🇩' },
    { name: 'Бенин', code: '+229', flag: '🇧🇯' },
    { name: 'Боливия', code: '+591', flag: '🇧🇴' },
    { name: 'Босния и Герцеговина', code: '+387', flag: '🇧🇦' },
    { name: 'Буркина-Фасо', code: '+226', flag: '🇧🇫' },
    { name: 'Бурунди', code: '+257', flag: '🇧🇮' },
    { name: 'Бутан', code: '+975', flag: '🇧🇹' },
    { name: 'Габон', code: '+241', flag: '🇬🇦' },
    { name: 'Гаити', code: '+509', flag: '🇭🇹' },
    { name: 'Гамбия', code: '+220', flag: '🇬🇲' },
    { name: 'Гана', code: '+233', flag: '🇬🇭' },
    { name: 'Гвинея', code: '+224', flag: '🇬🇳' },
    { name: 'Гвинея-Бисау', code: '+245', flag: '🇬🇼' },
    { name: 'Гондурас', code: '+504', flag: '🇭🇳' },
    { name: 'Гонконг', code: '+852', flag: '🇭🇰' },
    { name: 'Замбия', code: '+260', flag: '🇿🇲' },
    { name: 'Ирак', code: '+964', flag: '🇮🇶' },
    { name: 'Иран', code: '+98', flag: '🇮🇷' },
    { name: 'Йемен', code: '+967', flag: '🇾🇪' },
    { name: 'Камбоджа', code: '+855', flag: '🇰🇭' },
    { name: 'Камерун', code: '+237', flag: '🇨🇲' },
    { name: 'Кения', code: '+254', flag: '🇰🇪' },
    { name: 'Киргизия', code: '+996', flag: '🇰🇬' },
    { name: 'Конго', code: '+242', flag: '🇨🇬' },
    { name: 'Кот-д\'Ивуар', code: '+225', flag: '🇨🇮' },
    { name: 'Лаос', code: '+856', flag: '🇱🇦' },
    { name: 'Либерия', code: '+231', flag: '🇱🇷' },
    { name: 'Ливан', code: '+961', flag: '🇱🇧' },
    { name: 'Мавритания', code: '+222', flag: '🇲🇷' },
    { name: 'Малави', code: '+265', flag: '🇲🇼' },
    { name: 'Мали', code: '+223', flag: '🇲🇱' },
    { name: 'Мозамбик', code: '+258', flag: '🇲🇿' },
    { name: 'Монголия', code: '+976', flag: '🇲🇳' },
    { name: 'Мьянма', code: '+95', flag: '🇲🇲' },
    { name: 'Непал', code: '+977', flag: '🇳🇵' },
    { name: 'Никарагуа', code: '+505', flag: '🇳🇮' },
    { name: 'Пакистан', code: '+92', flag: '🇵🇰' },
    { name: 'Панама', code: '+507', flag: '🇵🇦' },
    { name: 'Перу', code: '+51', flag: '🇵🇪' },
    { name: 'Сальвадор', code: '+503', flag: '🇸🇻' },
    { name: 'Северная Македония', code: '+389', flag: '🇲🇰' },
    { name: 'Сенегал', code: '+221', flag: '🇸🇳' },
    { name: 'Сирия', code: '+963', flag: '🇸🇾' },
    { name: 'Словения', code: '+386', flag: '🇸🇮' },
    { name: 'Судан', code: '+249', flag: '🇸🇩' },
    { name: 'Сьерра-Леоне', code: '+232', flag: '🇸🇱' },
    { name: 'Таджикистан', code: '+992', flag: '🇹🇯' },
    { name: 'Тунис', code: '+216', flag: '🇹🇳' },
    { name: 'Уганда', code: '+256', flag: '🇺🇬' },
    { name: 'Чад', code: '+235', flag: '🇹🇩' },
    { name: 'Чили', code: '+56', flag: '🇨🇱' },
    { name: 'Шри-Ланка', code: '+94', flag: '🇱🇰' },
    { name: 'Эквадор', code: '+593', flag: '🇪🇨' },
    { name: 'Эфиопия', code: '+251', flag: '🇪🇹' },
    { name: 'Албания', code: '+355', flag: '🇦🇱' },
    { name: 'Алжир', code: '+213', flag: '🇩🇿' },
    { name: 'Андорра', code: '+376', flag: '🇦🇩' },
    { name: 'Ангилья', code: '+1', flag: '🇦🇮' },
    { name: 'Антигуа и Барбуда', code: '+1', flag: '🇦🇬' },
    { name: 'Аруба', code: '+297', flag: '🇦🇼' },
    { name: 'Багамские Острова', code: '+1', flag: '🇧🇸' },
    { name: 'Барбадос', code: '+1', flag: '🇧🇧' },
    { name: 'Беларусь', code: '+375', flag: '🇧🇾' },
    { name: 'Белиз', code: '+501', flag: '🇧🇿' },
    { name: 'Бермуды', code: '+1', flag: '🇧🇲' },
    { name: 'Ботсвана', code: '+267', flag: '🇧🇼' },
    { name: 'Британские Виргинские о-ва', code: '+1', flag: '🇻🇬' },
    { name: 'Бруней', code: '+673', flag: '🇧🇳' },
    { name: 'Вануату', code: '+678', flag: '🇻🇺' },
    { name: 'Ватикан', code: '+379', flag: '🇻🇦' },
    { name: 'Венесуэла', code: '+58', flag: '🇻🇪' },
    { name: 'Восточный Тимор', code: '+670', flag: '🇹🇱' },
    { name: 'Гайана', code: '+592', flag: '🇬🇾' },
    { name: 'Гваделупа', code: '+590', flag: '🇬🇵' },
    { name: 'Гватемала', code: '+502', flag: '🇬🇹' },
    { name: 'Гернси', code: '+44', flag: '🇬🇬' },
    { name: 'Гибралтар', code: '+350', flag: '🇬🇮' },
    { name: 'Гренландия', code: '+299', flag: '🇬🇱' },
    { name: 'Гренада', code: '+1', flag: '🇬🇩' },
    { name: 'Джерси', code: '+44', flag: '🇯🇪' },
    { name: 'Джибути', code: '+253', flag: '🇩🇯' },
    { name: 'Доминика', code: '+1', flag: '🇩🇲' },
    { name: 'Доминиканская Республика', code: '+1', flag: '🇩🇴' },
    { name: 'Зимбабве', code: '+263', flag: '🇿🇼' },
    { name: 'Каймановы острова', code: '+1', flag: '🇰🇾' },
    { name: 'Коморы', code: '+269', flag: '🇰🇲' },
    { name: 'Коста-Рика', code: '+506', flag: '🇨🇷' },
    { name: 'Куба', code: '+53', flag: '🇨🇺' },
    { name: 'Кюрасао', code: '+599', flag: '🇨🇼' },
    { name: 'Лесото', code: '+266', flag: '🇱🇸' },
    { name: 'Либерия', code: '+231', flag: '🇱🇷' },
    { name: 'Ливия', code: '+218', flag: '🇱🇾' },
    { name: 'Лихтенштейн', code: '+423', flag: '🇱🇮' },
    { name: 'Люксембург', code: '+352', flag: '🇱🇺' },
    { name: 'Маврикий', code: '+230', flag: '🇲🇺' },
    { name: 'Мадагаскар', code: '+261', flag: '🇲🇬' },
    { name: 'Макао', code: '+853', flag: '🇲🇴' },
    { name: 'Мальдивы', code: '+960', flag: '🇲🇻' },
    { name: 'Мальта', code: '+356', flag: '🇲🇹' },
    { name: 'Мартиника', code: '+596', flag: '🇲🇶' },
    { name: 'Монако', code: '+377', flag: '🇲🇨' },
    { name: 'Монтсеррат', code: '+1', flag: '🇲🇸' },
    { name: 'Намибия', code: '+264', flag: '🇳🇦' },
    { name: 'Новая Каледония', code: '+687', flag: '🇳🇨' },
    { name: 'Остров Мэн', code: '+44', flag: '🇮🇲' },
    { name: 'Папуа — Новая Гвинея', code: '+675', flag: '🇵🇬' },
    { name: 'Парагвай', code: '+595', flag: '🇵🇾' },
    { name: 'Пуэрто-Рико', code: '+1', flag: '🇵🇷' },
    { name: 'Реюньон', code: '+262', flag: '🇷🇪' },
    { name: 'Руанда', code: '+250', flag: '🇷🇼' },
    { name: 'Сан-Марино', code: '+378', flag: '🇸🇲' },
    { name: 'Сан-Томе и Принсипи', code: '+239', flag: '🇸🇹' },
    { name: 'Сейшельские Острова', code: '+248', flag: '🇸🇨' },
    { name: 'Сен-Мартен', code: '+590', flag: '🇸🇽' },
    { name: 'Сент-Винсент и Гренадины', code: '+1', flag: '🇻🇨' },
    { name: 'Сент-Китс и Невис', code: '+1', flag: '🇰🇳' },
    { name: 'Сент-Люсия', code: '+1', flag: '🇱🇨' },
    { name: 'Сомали', code: '+252', flag: '🇸🇴' },
    { name: 'Суринам', code: '+597', flag: '🇸🇷' },
    { name: 'Танзания', code: '+255', flag: '🇹🇿' },
    { name: 'Тёркс и Кайкос', code: '+1', flag: '🇹🇨' },
    { name: 'Того', code: '+228', flag: '🇹🇬' },
    { name: 'Тринидад и Тобаго', code: '+1', flag: '🇹🇹' },
    { name: 'Уругвай', code: '+598', flag: '🇺🇾' },
    { name: 'Фарерские острова', code: '+298', flag: '🇫🇴' },
    { name: 'Французская Гвиана', code: '+594', flag: '🇬🇫' },
    { name: 'Французская Полинезия', code: '+689', flag: '🇵🇫' },
    { name: 'Черногория', code: '+382', flag: '🇲🇪' },
    { name: 'Экваториальная Гвинея', code: '+240', flag: '🇬🇶' },
    { name: 'Эритрея', code: '+291', flag: '🇪🇷' },
    { name: 'Эсватини', code: '+268', flag: '🇸🇿' },
    { name: 'Южный Судан', code: '+211', flag: '🇸🇸' },
    { name: 'Ямайка', code: '+1', flag: '🇯🇲' },
  ];

  // Country name → ISO 3166-1 alpha-2 (для флагов-картинок)
  var COUNTRY_ISO = {
    'Россия':'ru','Украина':'ua','Казахстан':'kz','США':'us','Великобритания':'gb',
    'Германия':'de','Франция':'fr','Испания':'es','Италия':'it','Турция':'tr',
    'Китай':'cn','Индия':'in','Япония':'jp','Бразилия':'br','Канада':'ca',
    'Австралия':'au','Нидерланды':'nl','Швеция':'se','Норвегия':'no','Польша':'pl',
    'Чехия':'cz','Индонезия':'id','Мексика':'mx','Израиль':'il','ОАЭ':'ae',
    'Саудовская Аравия':'sa','Египет':'eg','ЮАР':'za','Аргентина':'ar','Австрия':'at',
    'Бельгия':'be','Болгария':'bg','Венгрия':'hu','Вьетнам':'vn','Греция':'gr',
    'Грузия':'ge','Дания':'dk','Ирландия':'ie','Исландия':'is','Кипр':'cy',
    'Колумбия':'co','Латвия':'lv','Литва':'lt','Малайзия':'my','Марокко':'ma',
    'Молдова':'md','Нигерия':'ng','Новая Зеландия':'nz','Португалия':'pt',
    'Румыния':'ro','Сербия':'rs','Сингапур':'sg','Словакия':'sk','Таиланд':'th',
    'Тайвань':'tw','Узбекистан':'uz','Филиппины':'ph','Финляндия':'fi',
    'Хорватия':'hr','Швейцария':'ch','Эстония':'ee','Южная Корея':'kr',
    'Азербайджан':'az','Ангола':'ao','Афганистан':'af','Бангладеш':'bd',
    'Бенин':'bj','Боливия':'bo','Босния и Герцеговина':'ba','Буркина-Фасо':'bf',
    'Бурунди':'bi','Бутан':'bt','Габон':'ga','Гаити':'ht','Гамбия':'gm',
    'Гана':'gh','Гвинея':'gn','Гвинея-Бисау':'gw','Гондурас':'hn','Гонконг':'hk',
    'Замбия':'zm','Ирак':'iq','Иран':'ir','Йемен':'ye','Камбоджа':'kh',
    'Камерун':'cm','Кения':'ke','Киргизия':'kg','Конго':'cg',
    'Кот-д\'Ивуар':'ci','Лаос':'la','Либерия':'lr','Ливан':'lb','Мавритания':'mr',
    'Малави':'mw','Мали':'ml','Мозамбик':'mz','Монголия':'mn','Мьянма':'mm',
    'Непал':'np','Никарагуа':'ni','Пакистан':'pk','Панама':'pa','Перу':'pe',
    'Сальвадор':'sv','Северная Македония':'mk','Сенегал':'sn','Сирия':'sy',
    'Словения':'si','Судан':'sd','Сьерра-Леоне':'sl','Таджикистан':'tj',
    'Тунис':'tn','Уганда':'ug','Чад':'td','Чили':'cl','Шри-Ланка':'lk',
    'Эквадор':'ec','Эфиопия':'et',
    'Албания':'al','Алжир':'dz','Андорра':'ad','Ангилья':'ai',
    'Антигуа и Барбуда':'ag','Аруба':'aw','Багамские Острова':'bs',
    'Барбадос':'bb','Беларусь':'by','Белиз':'bz','Бермуды':'bm',
    'Ботсвана':'bw','Британские Виргинские о-ва':'vg','Бруней':'bn',
    'Вануату':'vu','Ватикан':'va','Венесуэла':'ve','Восточный Тимор':'tl',
    'Гайана':'gy','Гваделупа':'gp','Гватемала':'gt','Гернси':'gg',
    'Гибралтар':'gi','Гренландия':'gl','Гренада':'gd','Джерси':'je',
    'Джибути':'dj','Доминика':'dm','Доминиканская Республика':'do',
    'Зимбабве':'zw','Каймановы острова':'ky','Коморы':'km',
    'Коста-Рика':'cr','Куба':'cu','Кюрасао':'cw','Лесото':'ls',
    'Ливия':'ly','Лихтенштейн':'li','Люксембург':'lu','Маврикий':'mu',
    'Мадагаскар':'mg','Макао':'mo','Мальдивы':'mv','Мальта':'mt',
    'Мартиника':'mq','Монако':'mc','Монтсеррат':'ms','Намибия':'na',
    'Новая Каледония':'nc','Остров Мэн':'im','Папуа — Новая Гвинея':'pg',
    'Парагвай':'py','Пуэрто-Рико':'pr','Реюньон':'re','Руанда':'rw',
    'Сан-Марино':'sm','Сан-Томе и Принсипи':'st','Сейшельские Острова':'sc',
    'Сен-Мартен':'sx','Сент-Винсент и Гренадины':'vc','Сент-Китс и Невис':'kn',
    'Сент-Люсия':'lc','Сомали':'so','Суринам':'sr','Танзания':'tz',
    'Тёркс и Кайкос':'tc','Того':'tg','Тринидад и Тобаго':'tt',
    'Уругвай':'uy','Фарерские острова':'fo','Французская Гвиана':'gf',
    'Французская Полинезия':'pf','Черногория':'me','Экваториальная Гвинея':'gq',
    'Эритрея':'er','Эсватини':'sz','Южный Судан':'ss','Ямайка':'jm'
  };

  var TELEGRAM_TYPES = [
    { id: 'ready', name: 'Готовые номера Telegram' },
    { id: 'physical', name: 'Физ. номера' },
    { id: 'aged', name: 'Номера с отлежкой' }
  ];

  // ───────────────────────────────────────────
  // 173 отзыва
  // ───────────────────────────────────────────

  var REVIEWS = [
    { author: 'aurora', rating: 5, service: 'Telegram', text: 'Всё быстро и чётко. Номер пришёл через 10 секунд после оплаты.', date: 'Июль 2026' },
    { author: 'nebula', rating: 5, service: 'Telegram', text: 'Пользуюсь уже месяц — сервис работает стабильно. Рекомендую для регистрации.', date: 'Июнь 2026' },
    { author: 'cascade', rating: 4, service: 'WhatsApp', text: 'Есть вопросы — поддержка ответила быстро. Номером остался доволен.', date: 'Май 2026' },
    { author: 'horizon', rating: 5, service: 'Instagram', text: 'Номер получила мгновенно, всё работает. Очень удобно для анонимной регистрации.', date: 'Июль 2026' },
    { author: 'phantom', rating: 5, service: 'Binance', text: 'Лучший сервис из тех что пробовал. Номер для биржи пришёл за минуту.', date: 'Июнь 2026' },

    { author: 'enigma', rating: 4, service: 'Telegram', text: 'Качественные номера, ни одной проблемы за 2 недели использования.', date: 'Май 2026' },
    { author: 'paradox', rating: 5, service: 'Google', text: 'Гугл аккаунты регистрируются отлично. Номера не блокируются.', date: 'Июль 2026' },
    { author: 'chimera', rating: 5, service: 'WhatsApp', text: 'Давно искала надёжный сервис для WhatsApp. Этот полностью устраивает.', date: 'Апрель 2026' },
    { author: 'ephemeral', rating: 4, service: 'TikTok', text: 'Для TikTok номера подходят идеально. Цены адекватные, всё быстро.', date: 'Июнь 2026' },
    { author: 'liminal', rating: 5, service: 'Binance', text: 'Пользуюсь постоянно для верификации на биржах. Ни разу не подвели.', date: 'Март 2026' },

    { author: 'serendipity', rating: 5, service: 'Telegram', text: 'Отличный сервис! Номер пришёл моментально. Буду заказывать ещё.', date: 'Июль 2026' },
    { author: 'reverie', rating: 4, service: 'Facebook', text: 'Фейсбук принял номер без проблем. Спасибо за быструю поддержку.', date: 'Май 2026' },
    { author: 'mirage', rating: 5, service: 'Instagram', text: 'Инстаграм регистрация прошла успешно. Очень довольна сервисом.', date: 'Июнь 2026' },
    { author: 'nomad', rating: 5, service: 'Steam', text: 'Для Steam отлично подходит. Цена смешная, а польза огромная.', date: 'Апрель 2026' },
    { author: 'oracle', rating: 4, service: 'Discord', text: 'Дискорд номера работают. Единственное — бывает очередь, но это редко.', date: 'Март 2026' },

    { author: 'petrichor', rating: 5, service: 'Telegram', text: 'Заказываю второй раз. Качество стабильное, рекомендую всем.', date: 'Февраль 2026' },
    { author: 'fernweh', rating: 5, service: 'Binance', text: 'Самый надёжный сервис для криптобирж. Проверено на Binance и Bybit.', date: 'Январь 2026' },
    { author: 'zephyr', rating: 5, service: 'WhatsApp', text: 'Мужу посоветовала, тоже пользуется. Отличный сервис для бизнеса.', date: 'Июнь 2026' },
    { author: 'briar', rating: 4, service: 'Signal', text: 'Сигнал принял номер. Всё работает, но хотелось бы больше стран.', date: 'Май 2026' },
    { author: 'solstice', rating: 5, service: 'TikTok', text: 'Второй раз заказываю для тиктока. Номера приходят молниеносно.', date: 'Апрель 2026' },

    { author: 'equinox', rating: 5, service: 'Google', text: 'Google Voice верификация прошла на ура. Буду пользоваться дальше.', date: 'Март 2026' },
    { author: 'twilight', rating: 4, service: 'Telegram', text: 'В целом отлично. Бывает что номера уже заняты, но заменяют быстро.', date: 'Февраль 2026' },
    { author: 'ember', rating: 5, service: 'Bybit', text: 'Для торговли на Bybit — идеальное решение. Номер живёт долго.', date: 'Январь 2026' },
    { author: 'frost', rating: 5, service: 'Telegram Premium', text: 'Купила номер для Telegram Premium. Работает отлично, спасибо!', date: 'Июль 2026' },
    { author: 'driftwood', rating: 5, service: 'WhatsApp', text: 'Лучший смс-сервис на рынке. Цены низкие, качество высокое.', date: 'Июнь 2026' },

    { author: 'wildfire', rating: 4, service: 'Snapchat', text: 'Снэпчат принял всё хорошо. Буду заказывать ещё для других сервисов.', date: 'Май 2026' },
    { author: 'snowfall', rating: 5, service: 'Telegram', text: 'Подруга посоветовала. Не пожалела ни разу. Моментальная выдача номера.', date: 'Апрель 2026' },
    { author: 'thunder', rating: 5, service: 'Binance', text: 'Уже 5 раз заказывал. Никогда не подводили. Лучшее соотношение цена-качество.', date: 'Март 2026' },
    { author: 'cosmic_dust', rating: 4, service: 'WhatsApp Business', text: 'Для бизнеса самое то. Номер приняли, все настройки прошли.', date: 'Февраль 2026' },
    { author: 'velvet_sky', rating: 5, service: 'OKX', text: 'OKX биржа приняла номер. Операция заняла меньше минуты. Рекомендую.', date: 'Июль 2026' },

    { author: 'amber_light', rating: 5, service: 'Telegram', text: 'Номер пришёл за 5 секунд. Телеграм верификацию прошёл без проблем.', date: 'Июнь 2026' },
    { author: 'crimson_tide', rating: 5, service: 'Instagram', text: 'Очень удобно когда не хочешь светить свой номер. Всё работает.', date: 'Май 2026' },
    { author: 'shadow_fox', rating: 4, service: 'PokerStars', text: 'Покер старс принял номер, играю без проблем. Советую.', date: 'Апрель 2026' },
    { author: 'broken_compass', rating: 5, service: 'TikTok', text: 'Тикток регистрация прошла быстро. Номер принимает с первого раза.', date: 'Март 2026' },
    { author: 'silent_echo', rating: 5, service: 'Binance', text: 'Бинанс верификация — огонь! Номер пришёл, всё подтвердил.', date: 'Февраль 2026' },

    { author: 'faded_memories', rating: 5, service: 'Telegram', text: 'Номер живет уже 3 недели, всё отлично. Рекомендую!', date: 'Январь 2026' },
    { author: 'lost_horizon', rating: 4, service: 'Bybit', text: 'Байбит верилку прошёл. Оперативно и без проблем.', date: 'Декабрь 2025' },
    { author: 'wild_flower', rating: 5, service: 'WhatsApp', text: 'Муж удивился когда я сказала что номер не мой. Работает отлично!', date: 'Ноябрь 2025' },
    { author: 'dark_lullaby', rating: 5, service: 'Google', text: 'Гугл верификация — идеально. Не приходится вводить свой реальный номер.', date: 'Октябрь 2025' },
    { author: 'paper_crane', rating: 4, service: 'Steam', text: 'Стим принял. Трейды проходят. Главное что номер не привязывается навсегда.', date: 'Сентябрь 2025' },

    { author: 'glass_animals', rating: 5, service: 'Telegram', text: 'Третий раз заказываю. Пользуюсь для разных аккаунтов. Лучший сервис!', date: 'Август 2025' },
    { author: 'salt_water', rating: 5, service: 'Facebook', text: 'Фейсбук регистрация — без проблем. Номер принял сразу.', date: 'Июль 2025' },
    { author: 'midnight_city', rating: 4, service: 'Signal', text: 'Сигнал смс пришло быстро. Анонимность обеспечена.', date: 'Июнь 2025' },
    { author: 'neon_rain', rating: 5, service: 'Discord', text: 'Дискорд верификация прошла. Теперь могу сидеть в любых серверах.', date: 'Май 2025' },
    { author: 'electric_dreams', rating: 5, service: 'Instagram', text: 'Инстаграм регистрация с этим сервисом — сказка! Спасибо большое.', date: 'Апрель 2025' },

    { author: 'retro_future', rating: 4, service: 'MEXC', text: 'MEXC биржа приняла. Верификация за 2 минуты.', date: 'Март 2025' },
    { author: 'ghost_town', rating: 5, service: 'Telegram', text: 'Получила номер мгновенно. Телеграм зарегистрировала без проблем.', date: 'Февраль 2025' },
    { author: 'space_cowboy', rating: 5, service: 'OKX', text: 'ОКХ верификация — быстро. Номер работал как надо.', date: 'Январь 2025' },
    { author: 'lunar_tide', rating: 5, service: 'WhatsApp', text: 'Ватсап бизнес настроила. Клиенты довольны, всё официально.', date: 'Декабрь 2024' },
    { author: 'solar_wind', rating: 5, service: 'Telegram Premium', text: 'Telegram Premium купил через них. Номер работает, всё супер.', date: 'Ноябрь 2024' },

    { author: 'cosmic_girl', rating: 4, service: 'Tinder', text: 'Тиндер верификация пройдена. Больше никаких ограничений.', date: 'Октябрь 2024' },
    { author: 'velvet_revolver', rating: 5, service: 'Telegram', text: 'Советую всем кто хочет сохранить приватность. Качество на высоте.', date: 'Сентябрь 2024' },
    { author: 'autumn_leaf', rating: 5, service: 'Coinbase', text: 'Coinbase — одна из строгих бирж, номер приняли без проблем.', date: 'Август 2024' },
    { author: 'insomnia', rating: 4, service: 'Instagram', text: 'Инстаграм регистрацию прошла. Потом ещё и в фейсбук зарегалась.', date: 'Июль 2024' },
    { author: 'caffeine', rating: 5, service: 'Discord', text: 'Дискорд подтвердил за минуту. Отличный сервис для геймеров.', date: 'Июнь 2024' },

    { author: 'void_walker', rating: 5, service: 'Telegram', text: 'Уже постоянный клиент. Ни разу не подвели. Очень надёжно.', date: 'Май 2024' },
    { author: 'star_gazer', rating: 4, service: 'Binance', text: 'Бинанс норм. Единственное просят селфи иногда, но это уже биржа.', date: 'Апрель 2024' },
    { author: 'moon_child', rating: 5, service: 'WhatsApp', text: 'Быстро и качественно. Оплатила, получила номер, всё настроила.', date: 'Март 2024' },
    { author: 'day_dreamer', rating: 5, service: 'Bybit', text: 'Байбит без проблем. Номер живет долго, успеваю всё подтвердить.', date: 'Февраль 2024' },
    { author: 'night_owl', rating: 5, service: 'Telegram', text: 'Очень понравилось. Скорость выдачи номера поражает. Спасибо!', date: 'Январь 2024' },

    { author: 'lone_wolf', rating: 4, service: 'TikTok', text: 'Тикток принял код. Номер работал стабильно.', date: 'Декабрь 2023' },
    { author: 'free_spirit', rating: 5, service: 'Instagram', text: 'Анонимность — наше всё! Инстаграм зарегала, сижу спокойно.', date: 'Ноябрь 2023' },
    { author: 'wild_heart', rating: 5, service: 'Binance', text: 'Профессиональный сервис. Для крипты лучшее решение.', date: 'Октябрь 2023' },
    { author: 'wanderlust', rating: 5, service: 'Telegram', text: 'Номер пришёл за 3 секунды! Я в шоке от скорости.', date: 'Сентябрь 2023' },
    { author: 'nomad_soul', rating: 4, service: 'Steam', text: 'Стим верификация норм. Для смены региона тоже подходит.', date: 'Август 2023' },

    { author: 'ocean_eyes', rating: 5, service: 'Telegram Premium', text: 'Купила премиум номер. Работает идеально, спасибо команде!', date: 'Июль 2023' },
    { author: 'storm_chaser', rating: 5, service: 'Google', text: 'Гугл верификация пройдена. Номер работает со всеми сервисами.', date: 'Июнь 2023' },
    { author: 'fire_breather', rating: 5, service: 'WhatsApp', text: 'Ватсап верификация за 5 минут. Очень довольна!', date: 'Май 2023' },
    { author: 'vex', rating: 4, service: 'Discord', text: 'Дискорд подтвердил. Сижу на серверах, всё ок.', date: 'Апрель 2023' },
    { author: 'flux', rating: 5, service: 'Telegram', text: 'Моментальная выдача! Буду рекомендовать друзьям.', date: 'Март 2023' },

    { author: 'void', rating: 5, service: 'Binance', text: 'Верификация на бинанс прошла успешно. Продолжаю пользоваться.', date: 'Февраль 2023' },
    { author: 'neon', rating: 4, service: 'Instagram', text: 'Регистрация быстрая. Номер не заблокировали.', date: 'Январь 2023' },
    { author: 'dusk', rating: 5, service: 'Bybit', text: 'Bybit принял смс. Верификация уровня 1 пройдена.', date: 'Декабрь 2022' },
    { author: 'wisp', rating: 5, service: 'Telegram', text: 'Очень быстро и удобно. Номер пришёл практически мгновенно!', date: 'Ноябрь 2022' },
    { author: 'kode', rating: 5, service: 'TikTok', text: 'Тикток прошел. Номер принял с первого раза. Молодцы!', date: 'Окторябрь 2022' },

    { author: 'nimbus', rating: 4, service: 'Snapchat', text: 'Снэпчат работает. Верификация быстрая.', date: 'Сентябрь 2022' },
    { author: 'vortex', rating: 5, service: 'Telegram Premium', text: 'Telegram Premium регистрация прошла отлично. Рекомендую!', date: 'Август 2022' },
    { author: 'toxin', rating: 5, service: 'OKX', text: 'OKX верификация — номер приняли. Вывод средств доступен.', date: 'Июль 2022' },
    { author: 'helix', rating: 5, service: 'WhatsApp', text: 'Ватсап бизнес настроила, номер активен. Клиенты пишут.', date: 'Июнь 2022' },
    { author: 'vertex', rating: 4, service: 'Tinder', text: 'Тиндер верификация. Теперь без ограничений свайпаю.', date: 'Май 2022' },

    { author: 'null_pointer', rating: 5, service: 'Telegram', text: 'Пользуюсь часто. Сервис проверенный, рекомендую.', date: 'Апрель 2022' },
    { author: 'runtime_error', rating: 5, service: 'Google', text: 'Гугл смс пришло моментально. Качество 10/10.', date: 'Март 2022' },
    { author: 'cache_miss', rating: 5, service: 'Instagram', text: 'Очень понравился сервис. Всё четко и по делу.', date: 'Февраль 2022' },
    { author: 'infinite_loop', rating: 4, service: 'Discord', text: 'Дискорд норм. Быстро и без геморроя.', date: 'Январь 2022' },
    { author: 'syntax_error', rating: 5, service: 'Telegram', text: 'В пятый раз заказываю. Качество не падает!', date: 'Декабрь 2021' },

    { author: 'bit_flip', rating: 5, service: 'Binance', text: 'Бинанс уровень 2 прошел. Сервис работает отлично.', date: 'Ноябрь 2021' },
    { author: 'memory_leak', rating: 4, service: 'WhatsApp', text: 'Ватсап работает. Подтверждение пришло быстро.', date: 'Октябрь 2021' },
    { author: 'kernel_panic', rating: 5, service: 'Bybit', text: 'Bybit норм. Верификация уровня 1 пройдена.', date: 'Сентябрь 2021' },
    { author: 'deadlock', rating: 5, service: 'Telegram', text: 'Моментальная выдача! Очень рада что нашла этот сервис.', date: 'Август 2021' },
    { author: 'race_condition', rating: 5, service: 'Coinbase', text: 'Coinbase — одна из самых строгих бирж. Номер приняли.', date: 'Июль 2021' },

    { author: 'taco_tuesday', rating: 4, service: 'TikTok', text: 'Тикток код пришёл. Всё работает.', date: 'Июнь 2021' },
    { author: 'sushi_roll', rating: 5, service: 'Telegram Premium', text: 'Premium номер получил. Сервис на высоте!', date: 'Май 2021' },
    { author: 'pixel_pancake', rating: 5, service: 'Instagram', text: 'Инстаграм зарегистрировала. Номер рабочий, спасибо!', date: 'Апрель 2021' },
    { author: 'noodle_king', rating: 4, service: 'Steam', text: 'Стим верификация пройдена. Можно менять регион.', date: 'Март 2021' },
    { author: 'honey_bunny', rating: 5, service: 'Telegram', text: 'Очень довольна. Быстро, надёжно, дёшево.', date: 'Февраль 2021' },

    { author: 'sugar_spice', rating: 5, service: 'Binance', text: 'Бинанс верификация — 10/10. Номер приняли за минуту.', date: 'Январь 2021' },
    { author: 'cosmic_cookie', rating: 5, service: 'WhatsApp', text: 'Номер работает отлично. Верификация прошла быстро.', date: 'Декабрь 2020' },
    { author: 'lunar_muffin', rating: 4, service: 'Discord', text: 'Дискорд норм. Всё как надо.', date: 'Ноябрь 2020' },
    { author: 'echo_404', rating: 5, service: 'Telegram', text: 'Очень круто! Номер получила за секунды.', date: 'Окторябрь 2020' },
    { author: 'static_404', rating: 5, service: 'OKX', text: 'OKX верификация пройдена. Можно торговать.', date: 'Сентябрь 2020' },

    { author: 'cipher_42', rating: 4, service: 'Facebook', text: 'Фейсбук принял. Регистрация прошла за минуту.', date: 'Август 2020' },
    { author: 'omega_7', rating: 5, service: 'Binance', text: 'Крипта рулит! Бинанс верификация — быстро.', date: 'Июль 2020' },
    { author: 'cosmos_9', rating: 5, service: 'Telegram', text: 'Заказываю не первый раз. Всё всегда на высшем уровне.', date: 'Июнь 2020' },
    { author: 'player_1', rating: 4, service: 'Signal', text: 'Сигнал принял смс. Работает.', date: 'Май 2020' },
    { author: 'user_404', rating: 5, service: 'Instagram', text: 'Спасибо за отличный сервис! Всё работает идеально.', date: 'Апрель 2020' },

    { author: 'zero_day', rating: 5, service: 'Telegram Premium', text: 'Telegram Premium — наконец-то получил. Спасибо!', date: 'Март 2020' },
    { author: 'glitch_77', rating: 5, service: 'Bybit', text: 'Bybit принял. Торгую спокойно.', date: 'Февраль 2020' },
    { author: 'ping_me_42', rating: 4, service: 'TikTok', text: 'Тикток регистрация. Всё быстро.', date: 'Январь 2020' },
    { author: 'moonflower', rating: 5, service: 'Discord', text: 'Дискорд фулл. Номер работает.', date: 'Декабрь 2019' },
    { author: 'thunderstruck', rating: 5, service: 'Telegram', text: 'Лучший сервис для анонимной регистрации. Советую!', date: 'Ноябрь 2019' },

    { author: 'glass_trees', rating: 4, service: 'Steam', text: 'Стим принял. Трейды проходят.', date: 'Окторябрь 2019' },
    { author: 'water_sign', rating: 5, service: 'WhatsApp', text: 'Работает отлично! Верификация прошла быстро.', date: 'Сентябрь 2019' },
    { author: 'fire_escape', rating: 5, service: 'Binance', text: 'Купил номер для бинанса. Всё ок.', date: 'Август 2019' },
    { author: 'parallel_lines', rating: 5, service: 'Telegram', text: 'Уже не первый раз. Довольна как слон!', date: 'Июль 2019' },
    { author: 'lost_signals', rating: 4, service: 'Tinder', text: 'Тиндер верификация работает. Лимиты сняты.', date: 'Июнь 2019' },

    { author: 'broken_satellite', rating: 5, service: 'Instagram', text: 'Инстаграм регистрация — 5 секунд. Спасибо!', date: 'Май 2019' },
    { author: 'radio_static', rating: 5, service: 'Google', text: 'Гугл принял. Верификация прошла.', date: 'Апрель 2019' },
    { author: 'white_noise', rating: 4, service: 'Snapchat', text: 'Снэпчат работает. Принял номер.', date: 'Март 2019' },
    { author: 'polaroid', rating: 5, service: 'Telegram', text: 'Классный сервис, всем советую! Моментальная выдача.', date: 'Февраль 2019' },
    { author: 'typewriter', rating: 5, service: 'WhatsApp Business', text: 'Для бизнеса лучшее решение. Рекомендую!', date: 'Январь 2019' },

    { author: 'vinyl_dreams', rating: 5, service: 'OKX', text: 'OKX верификация уровня 2 пройдена. Лимиты сняты.', date: 'Декабрь 2018' },
    { author: 'cassette', rating: 5, service: 'Telegram', text: 'Очень довольна! Номер получила мгновенно.', date: 'Ноябрь 2018' },
    { author: 'boombox', rating: 4, service: 'Discord', text: 'Дискорд верификация. Всё быстро и понятно.', date: 'Окторябрь 2018' },
    { author: 'discoball', rating: 5, service: 'Telegram Premium', text: 'Premium — работает. Рекомендую этот сервис!', date: 'Сентябрь 2018' },
    { author: 'rollerblades', rating: 5, service: 'Binance', text: 'Бинанс верификация. Ребята молодцы!', date: 'Август 2018' },

    { author: 'skatepark', rating: 4, service: 'Instagram', text: 'Номер приняли. Инстаграм регистрация успешна.', date: 'Июль 2018' },
    { author: 'treetop', rating: 5, service: 'Telegram', text: 'Уже постоянный клиент. Качество топ!', date: 'Июнь 2018' },
    { author: 'firefly', rating: 5, service: 'WhatsApp', text: 'Настраивала бизнес аккаунт. Номер приняли.', date: 'Май 2018' },
    { author: 'blurryface', rating: 5, service: 'Bybit', text: 'Bybit верификация пройдена. Торгую.', date: 'Апрель 2018' },
    { author: 'starlight', rating: 4, service: 'TikTok', text: 'Тикток код пришел. Быстро, спасибо.', date: 'Март 2018' },

    { author: 'gaslight', rating: 5, service: 'Telegram', text: 'Номер пришёл, всё работает. Спасибо большое!', date: 'Февраль 2018' },
    { author: 'moonlight', rating: 5, service: 'Binance', text: 'Бинанс верификация — номер приняли. Всё ок.', date: 'Январь 2018' },
    { author: 'sunlight', rating: 4, service: 'Discord', text: 'Дискорд норм. Всё работает, номер активен.', date: 'Декабрь 2017' },
    { author: 'candlewick', rating: 5, service: 'Telegram', text: 'Моментально! Очень крутой сервис, спасибо!', date: 'Ноябрь 2017' },
    { author: 'kindling', rating: 5, service: 'Instagram', text: 'Регистрация за 10 секунд. Счастью нет предела!', date: 'Окторябрь 2017' },

    { author: 'bonfire', rating: 4, service: 'Google', text: 'Гугл верификация пройдена. Номер работает.', date: 'Сентябрь 2017' },
    { author: 'campfire', rating: 5, service: 'Telegram Premium', text: 'Telegram Premium — долго хотела. Наконец получила!', date: 'Август 2017' },
    { author: 'dragonfly', rating: 5, service: 'WhatsApp', text: 'Номер приняли. Верификация прошла быстро.', date: 'Июль 2017' },
    { author: 'butterfly', rating: 4, service: 'Tinder', text: 'Тиндер верификация. Больше никаких ограничений.', date: 'Июнь 2017' },
    { author: 'damselfly', rating: 5, service: 'Binance', text: 'Бинанс — лучший сервис по смс-активации. Молодцы!', date: 'Май 2017' },

    { author: 'melancholy', rating: 5, service: 'Telegram', text: 'Номер пришёл за 3 секунды! Рекомендую всем!', date: 'Апрель 2017' },
    { author: 'nostalgia', rating: 5, service: 'Bybit', text: 'Bybit регистрация. Спокойно прошел верификацию.', date: 'Март 2017' },
    { author: 'euphoria', rating: 4, service: 'Signal', text: 'Сигнал работает. Номер приняли сразу.', date: 'Февраль 2017' },
    { author: 'tranquility', rating: 5, service: 'Telegram', text: 'Отличный сервис. Всё на высшем уровне!', date: 'Январь 2017' },
    { author: 'chaos_theory', rating: 5, service: 'Instagram', text: 'Очень довольна. Буду заказывать ещё!', date: 'Декабрь 2016' },

    { author: 'gravity', rating: 4, service: 'Steam', text: 'Стим принял номер. Играю.', date: 'Ноябрь 2016' },
    { author: 'friction', rating: 5, service: 'Telegram', text: 'Заказывала для мамы. Она в восторге!', date: 'Окторябрь 2016' },
    { author: 'momentum', rating: 5, service: 'Discord', text: 'Дискорд норм. Рекомендую!', date: 'Сентябрь 2016' },
    { author: 'velocity', rating: 5, service: 'WhatsApp', text: 'Ватсап подтверждение пришло. Спасибо!', date: 'Август 2016' },
    { author: 'frequency', rating: 4, service: 'Facebook', text: 'Фейсбук норм. Принял номер.', date: 'Июль 2016' },

    { author: 'amplitude', rating: 5, service: 'Telegram Premium', text: 'Купила Premium номер. Работает как часы!', date: 'Июнь 2016' },
    { author: 'wavelength', rating: 5, service: 'Binance', text: 'Бинанс прошел. Номер живет долго.', date: 'Май 2016' },
    { author: 'oscillation', rating: 5, service: 'Telegram', text: 'Сервис огонь! Номер пришёл за секунду.', date: 'Апрель 2016' },
    { author: 'resonance', rating: 4, service: 'Google', text: 'Гугл верификация прошла.', date: 'Март 2016' },
    { author: 'dissonance', rating: 5, service: 'Telegram', text: 'Всё работает. Пятый раз заказываю.', date: 'Февраль 2016' },

    { author: 'supernova', rating: 5, service: 'Telegram', text: 'Полностью анонимно. Номер пришёл. Доволен.', date: 'Январь 2016' },
    { author: 'blackhole', rating: 5, service: 'Instagram', text: 'Инстаграм зарегала. Спасибо, помогли!', date: 'Декабрь 2015' },
    { author: 'quasar', rating: 4, service: 'WhatsApp', text: 'Ватсап принял. Номером пользуюсь.', date: 'Ноябрь 2015' },
    { author: 'pulsar', rating: 5, service: 'Telegram', text: 'Быстро и качественно. Всем советую!', date: 'Окторябрь 2015' },
    { author: 'asteroid', rating: 5, service: 'Binance', text: 'Binance норм. Номер пришёл быстро.', date: 'Сентябрь 2015' },

    { author: 'comet', rating: 5, service: 'Telegram', text: 'Сервис на 5+. Номер получила сразу.', date: 'Август 2015' },
    { author: 'meteor', rating: 4, service: 'Discord', text: 'Дискорд работает.', date: 'Июль 2015' },
    { author: 'eclipse', rating: 5, service: 'Telegram Premium', text: 'Premium купила. Очень довольна!', date: 'Июнь 2015' },
    { author: 'solarium', rating: 5, service: 'Bybit', text: 'Bybit верификация. Быстро и четко.', date: 'Май 2015' },
    { author: 'lunarium', rating: 4, service: 'Instagram', text: 'Инстаграм регистрация прошла отлично.', date: 'Апрель 2015' },

    { author: 'astral', rating: 5, service: 'Telegram', text: 'Номер пришёл моментально. Работает отлично.', date: 'Март 2015' },
    { author: 'etheral', rating: 5, service: 'WhatsApp', text: 'Ватсап верификация пройдена. Всё супер!', date: 'Февраль 2015' },
    { author: 'celestial', rating: 5, service: 'Facebook', text: 'Фейсбук регистрация. Номер приняли сразу.', date: 'Январь 2015' },
    { author: 'terra', rating: 4, service: 'Telegram', text: 'Хороший сервис. Номер получил быстро.', date: 'Декабрь 2014' },
    { author: 'aqua', rating: 5, service: 'Telegram', text: 'Всё работает, номера качественные. Рекомендую!', date: 'Ноябрь 2014' },
    { author: 'ignis', rating: 5, service: 'Binance', text: 'Номер для бинанса пришёл за 5 секунд. Верификацию прошёл моментально. Лучший сервис!', date: 'Октябрь 2026' },
    { author: 'ventus', rating: 5, service: 'Telegram', text: 'Пользуюсь этим сервисом постоянно. Номера всегда свежие, поддержка отвечает быстро.', date: 'Сентябрь 2026' },
    { author: 'glacier', rating: 5, service: 'Instagram', text: 'Номер пришёл мгновенно, инстаграм принял без проблем. Очень удобно для создания второго аккаунта.', date: 'Август 2026' },
  ];

  return {
    // ========== Purchases ==========
    getPurchases: function(userId) {
      return get(KEYS.purchases).filter(function(p) { return p.userId === userId; })
        .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    getAllPurchases: function() {
      return get(KEYS.purchases).sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    createPurchase: function(userId, serviceType, serviceName, country, price, currency) {
      var all = get(KEYS.purchases);
      var p = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        userId: userId,
        serviceType: serviceType,
        serviceName: serviceName,
        country: country,
        phoneNumber: '',
        price: price || 0,
        currency: currency || 'RUB',
        status: 'pending',
        created_at: new Date().toISOString()
      };
      all.push(p);
      set(KEYS.purchases, all);
      postToServer('/api/purchases', p);
      return p;
    },
    updatePurchase: function(id, updates) {
      var all = get(KEYS.purchases);
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          for (var k in updates) { if (updates.hasOwnProperty(k)) all[i][k] = updates[k]; }
          break;
        }
      }
      set(KEYS.purchases, all);
      // Синхронизируем с сервером только поля, которые меняет сервер
      var sync = { id: id };
      if (updates && updates.phoneNumber !== undefined) sync.phoneNumber = updates.phoneNumber;
      if (updates && updates.status !== undefined) sync.status = updates.status;
      postToServer('/api/purchases/update', sync);
    },
    // Объединить серверный список заказов с локальным (snake→camel, по id).
    // Сервер авторитетен для статуса и номера: клиентские изменения уже запушены.
    mergeServerPurchases: function(serverList) {
      if (!serverList || serverList.length === 0) return;
      var all = get(KEYS.purchases);
      var byId = {};
      for (var i = 0; i < all.length; i++) byId[all[i].id] = all[i];
      var changed = false;
      for (var j = 0; j < serverList.length; j++) {
        var sp = serverList[j];
        if (!sp || !sp.id) continue;
        // pg отдаёт BIGINT (id/userId) строками — приводим к числам, чтобы
        // строгие сравнения id === / userId === работали с локальными данными.
        var p = {
          id: Number(sp.id),
          userId: Number(sp.userId !== undefined ? sp.userId : sp.user_id),
          serviceType: sp.serviceType !== undefined ? sp.serviceType : sp.service_type,
          serviceName: sp.serviceName !== undefined ? sp.serviceName : sp.service_name,
          country: sp.country,
          price: Number(sp.price),
          currency: sp.currency,
          phoneNumber: sp.phoneNumber !== undefined ? sp.phoneNumber : (sp.phone_number || ''),
          status: sp.status || 'pending',
          created_at: sp.created_at
        };
        var existing = byId[p.id];
        if (!existing) {
          all.push(p);
          byId[p.id] = p;
          changed = true;
        } else if (existing.status !== p.status || existing.phoneNumber !== p.phoneNumber) {
          existing.status = p.status;
          existing.phoneNumber = p.phoneNumber;
          changed = true;
        }
      }
      if (changed) {
        all.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        set(KEYS.purchases, all);
      }
    },

    // ========== Chat Messages ==========
    sendMessage: function(senderId, senderName, receiverId, receiverName, text) {
      var all = get(KEYS.messages);
      all.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        senderId: senderId,
        senderName: senderName,
        receiverId: receiverId,
        receiverName: receiverName,
        text: text,
        created_at: new Date().toISOString(),
        read: false
      });
      set(KEYS.messages, all);
    },
    getConversation: function(userId, otherUserId) {
      return get(KEYS.messages).filter(function(m) {
        return (m.senderId === userId && m.receiverId === otherUserId) ||
               (m.senderId === otherUserId && m.receiverId === userId);
      }).sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    },
    // ========== Единый канонический администратор (SMS Light) ==========
    // Весь чат (покупатель + админка) опирается на ОДНОГО админа —
    // первого в списке с is_admin. Иначе покупатель пишет админу id=1,
    // а админ (залогиненный под id=6) отвечает с id=6 — и никто никого не видит.
    getAdminId: function() {
      var users = (typeof window.Auth !== 'undefined' && window.Auth.getUsers) ? window.Auth.getUsers() : [];
      for (var i = 0; i < users.length; i++) {
        if (users[i] && (users[i].is_admin === 1 || users[i].is_admin === true)) return users[i].id;
      }
      // Список ещё не загрузился (sms_users пуст) — берём канонический id из кэша.
      // НИКОГДА не возвращаем session.id админа: иначе покупатель и админ пишут в разные пары.
      try {
        var cached = parseInt(localStorage.getItem('sms_admin_id'), 10);
        if (!isNaN(cached) && cached > 0) return cached;
      } catch(e) {}
      return null;
    },
    // Сохранить канонический id админа (первый is_admin в списке) в кэш.
    // Вызывается из Auth.syncUsers() и admin.html loadUsers() — чтобы getAdminId()
    // работал даже до загрузки полного списка пользователей.
    cacheAdminId: function(users) {
      if (!users) return null;
      for (var i = 0; i < users.length; i++) {
        if (users[i] && (users[i].is_admin === 1 || users[i].is_admin === true)) {
          try { localStorage.setItem('sms_admin_id', String(users[i].id)); } catch(e) {}
          return users[i].id;
        }
      }
      return null;
    },
    getAdminName: function() {
      return 'SMS Light';
    },
    // Автоответчик: не «тупой автомат», а имитация живого человека —
    // индикатор «печатает…» + задержка 2–4 секунды.
    scheduleAutoReply: function(userId, userName, adminId, adminName) {
      if (!userId || !adminId) return;
      // Админ уже отвечал в этой переписке — не спамим
      var conv = this.getConversation(userId, adminId);
      for (var i = 0; i < conv.length; i++) {
        if (conv[i].senderId === adminId) return;
      }
      // Показываем «SMS Light печатает…» в открытом чате (если он открыт)
      if (typeof window.showAdminTyping === 'function') window.showAdminTyping(userId, adminId);
      setTimeout(function() {
        if (typeof window.hideAdminTyping === 'function') window.hideAdminTyping(userId, adminId);
        Data.sendMessage(
          adminId, adminName,
          userId, userName,
          'Здравствуйте! Ваш заказ будет выполнен через 30 сек - 5 минут. Ожидайте'
        );
        if (typeof window.refreshActiveChat === 'function') window.refreshActiveChat(userId, adminId);
      }, 2200 + Math.random() * 1800);
    },

    getAllConversations: function() {
      var all = get(KEYS.messages);
      var allUsers = get('sms_users');
      // Если localStorage ещё пуст — пробуем in-memory кэш Auth (серверный список)
      if (!allUsers || allUsers.length === 0) {
        if (typeof window.Auth !== 'undefined' && window.Auth.getUsers) {
          allUsers = window.Auth.getUsers();
        }
      }
      var adminId = null;
      for (var i = 0; i < allUsers.length; i++) {
        if (allUsers[i].is_admin === 1 || allUsers[i].is_admin === true) { adminId = allUsers[i].id; break; }
      }
      if (!adminId) return [];

      var userIds = {};
      all.forEach(function(m) {
        var otherId = (m.senderId === adminId) ? m.receiverId : m.senderId;
        if (otherId !== adminId) userIds[otherId] = true;
      });

      var result = [];
      for (var uid in userIds) {
        if (!userIds.hasOwnProperty(uid)) continue;
        var conv = this.getConversation(adminId, parseInt(uid));
        if (conv.length > 0) {
          var lastMsg = conv[conv.length - 1];
          var user = null;
          for (var j = 0; j < allUsers.length; j++) {
            if (allUsers[j].id === parseInt(uid)) { user = allUsers[j]; break; }
          }
          var unread = 0;
          for (var k = 0; k < conv.length; k++) {
            if (conv[k].receiverId === adminId && !conv[k].read) unread++;
          }
          result.push({
            otherUserId: parseInt(uid),
            otherUserName: user ? user.name : 'Пользователь',
            otherUserEmail: user ? user.email : '',
            lastMessage: lastMsg,
            unread: unread,
            messages: conv
          });
        }
      }
      // Дополняем покупателями, у которых есть заказы, но ещё нет переписки:
      // админ видит их в списке чатов и может написать номер/SMS первым.
      var purchases = get(KEYS.purchases);
      var lastPurchaseTime = {};
      for (var pi = 0; pi < purchases.length; pi++) {
        var pur = purchases[pi];
        if (!pur || !pur.userId) continue;
        var pid = parseInt(pur.userId);
        if (isNaN(pid)) continue;
        var pt = new Date(pur.created_at).getTime();
        if (!lastPurchaseTime[pid] || pt > lastPurchaseTime[pid]) lastPurchaseTime[pid] = pt;
      }
      for (var buid in lastPurchaseTime) {
        if (!lastPurchaseTime.hasOwnProperty(buid)) continue;
        var buyerId = parseInt(buid);
        if (buyerId === adminId || userIds[buyerId]) continue; // админ или уже в переписке
        var buyer = null;
        for (var bj = 0; bj < allUsers.length; bj++) {
          if (allUsers[bj].id === buyerId) { buyer = allUsers[bj]; break; }
        }
        if (buyer && (buyer.is_admin === 1 || buyer.is_admin === true)) continue;
        userIds[buyerId] = true;
        result.push({
          otherUserId: buyerId,
          otherUserName: buyer ? buyer.name : 'Пользователь',
          otherUserEmail: buyer ? buyer.email : '',
          lastMessage: null,
          unread: 0,
          messages: [],
          lastPurchaseTime: lastPurchaseTime[buyerId]
        });
      }

      // Сортировка: чаты с перепиской — по последнему сообщению,
      // без переписки — по дате последнего заказа.
      result.sort(function(a, b) {
        var ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : (a.lastPurchaseTime || 0);
        var tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : (b.lastPurchaseTime || 0);
        return tb - ta;
      });
      return result;
    },
    markConversationRead: function(userId, otherUserId) {
      var all = get(KEYS.messages);
      var changed = false;
      for (var i = 0; i < all.length; i++) {
        if (all[i].receiverId === userId && all[i].senderId === otherUserId && !all[i].read) {
          all[i].read = true;
          changed = true;
        }
      }
      if (changed) set(KEYS.messages, all);
    },
    getUnreadCount: function(userId) {
      return get(KEYS.messages).filter(function(m) { return m.receiverId === userId && !m.read; }).length;
    },

    // ========== Balance & Top-ups ==========
    getBalance: function(userId) {
      var topups = get(KEYS.topups);
      var totalTopups = 0;
      for (var i = 0; i < topups.length; i++) {
        if (topups[i].userId === userId) totalTopups += topups[i].amount;
      }
      var purchases = get(KEYS.purchases);
      var totalPurchases = 0;
      for (var j = 0; j < purchases.length; j++) {
        if (purchases[j].userId === userId) totalPurchases += (purchases[j].price || 0);
      }
      return totalTopups - totalPurchases;
    },
    topUp: function(userId, amount) {
      var all = get(KEYS.topups);
      all.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        userId: userId,
        amount: amount,
        created_at: new Date().toISOString()
      });
      set(KEYS.topups, all);
    },

    // ========== Support Tickets ==========
    createTicket: function(userId, userName, email, subject, message) {
      var all = get(KEYS.tickets);
      all.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        userId: userId,
        userName: userName,
        email: email,
        subject: subject,
        message: message,
        status: 'open',
        created_at: new Date().toISOString()
      });
      set(KEYS.tickets, all);
    },
    getTickets: function() {
      return get(KEYS.tickets).sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    getAllTickets: function() {
      return get(KEYS.tickets).sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    replyToTicket: function(ticketId, reply, adminId, adminName) {
      var all = get(KEYS.tickets);
      var ticket = null;
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === ticketId) {
          all[i].status = 'closed';
          all[i].reply = reply;
          all[i].replied_at = new Date().toISOString();
          ticket = all[i];
          break;
        }
      }
      set(KEYS.tickets, all);

      // Также отправляем ответ как сообщение в чат, чтобы покупатель его видел
      if (ticket && adminId && adminName) {
        var users = get('sms_users');
        var userName = ticket.userName || 'Пользователь';
        this.sendMessage(adminId, adminName, ticket.userId, userName, reply);
      }
    },

    // ========== Services Catalog ==========
    getServices: function(category) {
      if (category) return SERVICES.filter(function(s) { return s.cat === category; });
      return SERVICES;
    },
    getService: function(id) {
      for (var i = 0; i < SERVICES.length; i++) {
        if (SERVICES[i].id === id) return SERVICES[i];
      }
      return null;
    },
    getCategories: function() {
      var cats = {};
      SERVICES.forEach(function(s) { cats[s.cat] = true; });
      return Object.keys(cats);
    },
    getCountries: function() { return COUNTRIES.slice(); },
    getTelegramTypes: function() { return TELEGRAM_TYPES.slice(); },
    getCountryFlag: function(name) {
      for (var i = 0; i < COUNTRIES.length; i++) {
        if (COUNTRIES[i].name === name) return COUNTRIES[i].flag;
      }
      return '🌍';
    },
    getCountryIso: function(name) {
      return COUNTRY_ISO[name] || '';
    },
    getReviews: function(limit) {
      if (limit) return REVIEWS.slice(0, limit);
      return REVIEWS.slice();
    }
  };
})();
