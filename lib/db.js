// db.js — PostgreSQL database helper (Neon)
// Работает как с Vercel Serverless, так и локально

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool = null;
let initPromise = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL не задан. Укажите строку подключения к PostgreSQL.');
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('neon') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    });
  }
  return pool;
}

// Удобная обёртка: db.get(), db.all(), db.run(), db.exec()
const db = {
  async get(sql, params = []) {
    const result = await getPool().query(sql, params);
    return result.rows[0] || null;
  },
  async all(sql, params = []) {
    const result = await getPool().query(sql, params);
    return result.rows;
  },
  async run(sql, params = []) {
    const result = await getPool().query(sql, params);
    return { changes: result.rowCount };
  },
  async exec(sql) {
    await getPool().query(sql);
  },
};

// Инициализация схемы БД и администратора
async function initDb() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Пользователи
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT DEFAULT '',
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        email_verified INTEGER NOT NULL DEFAULT 0,
        verification_code TEXT,
        reset_code TEXT,
        reset_code_expires TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Сообщения чата
    await db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGINT PRIMARY KEY,
        sender_id INTEGER NOT NULL,
        sender_name TEXT NOT NULL,
        receiver_id INTEGER NOT NULL,
        receiver_name TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Заказы (покупки) — синхронизируются с localStorage клиента.
    // id — клиентский (Date.now()+rand), как у сообщений. Статус заказа
    // (pending/completed/rejected) меняет админ или сам покупатель (отмена).
    await db.exec(`
      CREATE TABLE IF NOT EXISTS purchases (
        id BIGINT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        service_type TEXT NOT NULL DEFAULT 'virtual',
        service_name TEXT NOT NULL,
        country TEXT DEFAULT '',
        price INTEGER NOT NULL DEFAULT 0,
        currency TEXT DEFAULT 'RUB',
        phone_number TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL
      )
    `);

    // Отзывы покупателей. Один отзыв на одну покупку (UNIQUE purchase_id) —
    // повторный POST обновляет существующий отзыв. rating 1–5.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        rating INTEGER NOT NULL,
        service TEXT NOT NULL,
        text TEXT NOT NULL,
        purchase_id BIGINT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Администраторы по умолчанию (создаём, а существующие — повышаем)
    const ADMIN_EMAILS = ['justxirrez@inbox.ru', 'mikoto_11@list.ru'];
    for (const adminEmail of ADMIN_EMAILS) {
      const existing = await db.get('SELECT id, is_admin FROM users WHERE email = $1', [adminEmail]);
      if (!existing) {
        const hash = await bcrypt.hash('WWEW7771', 10);
        await db.run(
          'INSERT INTO users (name, nickname, email, password, is_admin, email_verified) VALUES ($1, $2, $3, $4, 1, 1)',
          ['Mikoto', 'Mikoto', adminEmail, hash]
        );
        console.log(`→ Администратор создан: ${adminEmail}`);
      } else if (existing.is_admin !== 1) {
        const hash = await bcrypt.hash('WWEW7771', 10);
        await db.run(
          'UPDATE users SET is_admin = 1, password = $2, email_verified = 1 WHERE id = $1',
          [existing.id, hash]
        );
        console.log(`→ Администратор повышен: ${adminEmail}`);
      } else {
        console.log(`→ Администратор уже есть: ${adminEmail}`);
      }
    }
  })();

  return initPromise;
}

module.exports = { db, getPool, initDb };
