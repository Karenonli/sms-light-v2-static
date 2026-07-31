// server.js — Express API сервер
// Работает как standalone (node server.js) так и на Vercel (serverless)

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { sendEmail, generateCode, verifyConnection, isUsingFallback, templates } = require('./email');
require('dotenv').config();

// ===== Database =====
const { db, getPool, initDb } = require('./lib/db');

// ===== Администраторы =====
const ADMIN_EMAILS = ['justxirrez@inbox.ru', 'mikoto_11@list.ru'];

// ===== App =====
const app = express();

// На Vercel TLS завершается на Edge, внутри функции запрос приходит по HTTP.
// Без этого Express считает соединение небезопасным и не отправляет Secure-куки сессии.
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== Session (PostgreSQL) =====
const pgSession = require('connect-pg-simple')(session);
app.use(session({
  store: new pgSession({
    pool: getPool(),
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'sms-light-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

// ===== DB init guard (срабатывает на первый API-запрос при cold start) =====
app.use('/api', async (req, res, next) => {
  try {
    await initDb();
  } catch (e) {
    console.error('✖ DB init failed:', e.message);
  }
  next();
});

// ===== Auth middleware =====
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  next();
}

// ===== Static files (только для локальной разработки) =====
if (!process.env.VERCEL) {
  app.use(express.static(__dirname));
}

// Красивые URL без .html (локально — через Express, на Vercel — через vercel.json)
if (!process.env.VERCEL) {
  app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
  app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
  app.get('/forgot', (req, res) => res.sendFile(path.join(__dirname, 'forgot-password.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
}

// ========================================================================
//  API: Аутентификация
// ========================================================================

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, nickname, email, password } = req.body;

    if (!name || !email || !password) {
      return res.json({ error: 'Заполните все поля' });
    }
    if (password.length < 6) {
      return res.json({ error: 'Пароль должен быть минимум 6 символов' });
    }
    if (name.length < 2) {
      return res.json({ error: 'Имя должно быть минимум 2 символа' });
    }

    const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      return res.json({ error: 'Этот email уже зарегистрирован' });
    }

    const hash = await bcrypt.hash(password, 10);
    const code = generateCode(6);
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase()) ? 1 : 0;

    await db.run(
      'INSERT INTO users (name, nickname, email, password, is_admin, verification_code, email_verified) VALUES ($1, $2, $3, $4, $5, $6, 0)',
      [name, nickname || name, email, hash, isAdmin, code]
    );

    try {
      await sendEmail(email, 'Подтверждение регистрации — SMS Light', templates.verification(code));
      console.log(`→ Код подтверждения для ${email}: ${code}`);
      res.json({
        ok: true,
        message: 'Код подтверждения отправлен на ваш email',
        ...(isUsingFallback() ? { dev_code: code } : {}),
      });
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
      console.log(`→ [ВНИМАНИЕ] Код для ${email}: ${code} (письмо не отправлено — SMTP недоступен)`);
      res.json({
        ok: true,
        email_failed: true,
        message: '⚠️ Не удалось отправить письмо с кодом. Но вы можете использовать код ниже для подтверждения.',
        dev_code: code,
      });
    }
  } catch (err) {
    console.error('Register error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Подтверждение email
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.json({ error: 'Введите email и код подтверждения' });
    }

    const user = await db.get('SELECT id, verification_code, email_verified FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.json({ error: 'Пользователь не найден' });
    }
    if (user.email_verified) {
      return res.json({ ok: true, already_verified: true });
    }
    if (user.verification_code !== code) {
      return res.json({ error: 'Неверный код подтверждения' });
    }

    await db.run('UPDATE users SET email_verified = 1, verification_code = NULL WHERE email = $1', [email]);

    const userData = await db.get('SELECT id, name, email, is_admin FROM users WHERE id = $1', [user.id]);
    if (userData) {
      sendEmail(userData.email, 'Добро пожаловать — SMS Light', templates.welcome(userData.name))
        .catch(err => console.error('Welcome email failed:', err.message));
    }

    req.session.userId = userData.id;
    req.session.isAdmin = userData.is_admin === 1;

    res.json({
      ok: true,
      is_admin: userData.is_admin === 1,
      user: { id: userData.id, name: userData.name, email: userData.email, is_admin: userData.is_admin },
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ error: 'Введите email и пароль' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.json({ error: 'Неверный email или пароль' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.json({ error: 'Неверный email или пароль' });
    }

    if (!user.email_verified) {
      return res.json({
        error: 'Подтвердите email. Проверьте почту или запросите новый код.',
        needs_verification: true,
        email: user.email,
      });
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;

    res.json({ ok: true, is_admin: user.is_admin === 1 });
  } catch (err) {
    console.error('Login error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Повторная отправка кода
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ error: 'Введите email' });

    const user = await db.get('SELECT id, email_verified FROM users WHERE email = $1', [email]);
    if (!user) return res.json({ error: 'Пользователь не найден' });
    if (user.email_verified) return res.json({ ok: true, already_verified: true });

    const code = generateCode(6);
    await db.run('UPDATE users SET verification_code = $1 WHERE id = $2', [code, user.id]);

    try {
      await sendEmail(email, 'Подтверждение регистрации — SMS Light', templates.verification(code));
      console.log(`→ Новый код подтверждения для ${email}: ${code}`);
      res.json({
        ok: true,
        ...(isUsingFallback() ? { dev_code: code } : {}),
      });
    } catch (emailErr) {
      console.error('Resend email failed:', emailErr.message);
      console.log(`→ [ВНИМАНИЕ] Новый код для ${email}: ${code} (письмо не отправлено)`);
      res.json({
        ok: true,
        email_failed: true,
        message: '⚠️ Не удалось отправить письмо. Используйте код: ' + code,
        dev_code: code,
      });
    }
  } catch (err) {
    console.error('Resend error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Забыли пароль — отправить код
app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ error: 'Введите email' });

    const user = await db.get('SELECT id, email_verified FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.json({ ok: true, message: 'Если аккаунт существует, код отправлен на email' });
    }

    const code = generateCode(6);
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.run('UPDATE users SET reset_code = $1, reset_code_expires = $2 WHERE id = $3', [code, expires, user.id]);

    try {
      await sendEmail(email, 'Восстановление пароля — SMS Light', templates.reset(code));
      console.log(`→ Код восстановления для ${email}: ${code}`);
      res.json({
        ok: true,
        message: 'Код восстановления отправлен на ваш email',
        ...(isUsingFallback() ? { dev_code: code } : {}),
      });
    } catch (emailErr) {
      console.error('Forgot email failed:', emailErr.message);
      console.log(`→ [ВНИМАНИЕ] Код восстановления для ${email}: ${code} (письмо не отправлено)`);
      res.json({
        ok: true,
        email_failed: true,
        message: '⚠️ Не удалось отправить письмо. Код восстановления: ' + code,
        dev_code: code,
      });
    }
  } catch (err) {
    console.error('Forgot error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Сброс пароля
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.json({ error: 'Заполните все поля' });
    }
    if (password.length < 6) {
      return res.json({ error: 'Пароль должен быть минимум 6 символов' });
    }

    const user = await db.get('SELECT id, reset_code, reset_code_expires FROM users WHERE email = $1', [email]);
    if (!user) return res.json({ error: 'Пользователь не найден' });
    if (!user.reset_code) return res.json({ error: 'Код не был запрошен' });
    if (user.reset_code !== code) return res.json({ error: 'Неверный код восстановления' });

    const expires = new Date(user.reset_code_expires).getTime();
    if (Date.now() > expires) return res.json({ error: 'Код истёк. Запросите новый.' });

    const hash = await bcrypt.hash(password, 10);
    await db.run('UPDATE users SET password = $1, reset_code = NULL, reset_code_expires = NULL WHERE id = $2', [hash, user.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Reset error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Выход
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Проверка сессии
app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ authed: false });
  }
  const user = await db.get('SELECT id, name, nickname, email, is_admin, email_verified, created_at FROM users WHERE id = $1', [req.session.userId]);
  if (!user) {
    req.session.destroy();
    return res.json({ authed: false });
  }
  res.json({ authed: true, ...user });
});

// ========================================================================
//  API: Админка
// ========================================================================

// Список пользователей
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await db.all('SELECT id, name, nickname, email, is_admin, email_verified, created_at FROM users ORDER BY created_at DESC');
  res.json({ users });
});

// Удаление пользователя
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.json({ error: 'Неверный ID' });
  if (id === req.session.userId) return res.json({ error: 'Нельзя удалить самого себя' });

  const user = await db.get('SELECT id, is_admin FROM users WHERE id = $1', [id]);
  if (!user) return res.json({ error: 'Пользователь не найден' });
  if (user.is_admin) return res.json({ error: 'Нельзя удалить администратора' });

  await db.run('DELETE FROM users WHERE id = $1', [id]);
  res.json({ ok: true });
});

// Тестовая отправка email
app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    const adminUser = await db.get('SELECT email FROM users WHERE id = $1', [req.session.userId]);
    const recipient = to || adminUser?.email;
    if (!recipient) return res.json({ error: 'Нет email для отправки' });

    const testCode = generateCode(6);
    await sendEmail(recipient, 'Тестовое письмо — SMS Light', templates.verification(testCode));
    console.log(`→ Тестовое письмо отправлено на ${recipient}, код: ${testCode}`);

    res.json({ ok: true, message: 'Тестовое письмо отправлено на ' + recipient });
  } catch (err) {
    console.error('Test email error:', err.message);
    res.json({ error: 'Ошибка отправки: ' + err.message });
  }
});

// Статус SMTP
app.get('/api/admin/smtp-status', requireAdmin, async (req, res) => {
  try {
    const ok = await verifyConnection();
    res.json({ ok });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ========================================================================
//  API: Сообщения чата
// ========================================================================

// Отправка сообщения
app.post('/api/messages/send', async (req, res) => {
  try {
    const { id, senderId, senderName, receiverId, receiverName, text, created_at, read } = req.body;
    if (!senderId || !receiverId || !text) {
      return res.json({ error: 'Не все поля заполнены' });
    }
    const msgId = id || Date.now() + Math.floor(Math.random() * 1000);
    await db.run(
      `INSERT INTO messages (id, sender_id, sender_name, receiver_id, receiver_name, text, created_at, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [msgId, senderId, senderName, receiverId, receiverName, text, created_at || new Date().toISOString(), read ? 1 : 0]
    );
    res.json({ ok: true, id: msgId });
  } catch (err) {
    console.error('Send message error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Получить все сообщения
app.get('/api/messages/all', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM messages ORDER BY created_at ASC');
    const messages = rows.map(m => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      receiverId: m.receiver_id,
      receiverName: m.receiver_name,
      text: m.text,
      created_at: m.created_at,
      read: !!m.is_read,
    }));
    res.json({ messages });
  } catch (err) {
    console.error('Get messages error:', err);
    res.json({ messages: [] });
  }
});

// Отметить прочитанным
app.post('/api/messages/read', async (req, res) => {
  try {
    const { userId, otherUserId } = req.body;
    if (!userId || !otherUserId) return res.json({ error: 'Не все поля заполнены' });
    await db.run(
      'UPDATE messages SET is_read = 1 WHERE receiver_id = $1 AND sender_id = $2 AND is_read = 0',
      [userId, otherUserId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ========================================================================
//  Экспорт + запуск
// ========================================================================

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    console.log(`→ Сервер запущен: http://localhost:${PORT}`);
    console.log(`→ Регистрация: http://localhost:${PORT}/register`);
    console.log(`→ Вход: http://localhost:${PORT}/login`);
    console.log(`→ Админ-панель: http://localhost:${PORT}/admin`);

    // Проверка SMTP
    await initDb();
    console.log('');
    console.log('→ Проверка SMTP...');
    const smtpOk = await verifyConnection();
    if (smtpOk) {
      console.log('✓ Email-сервис готов к работе');
    } else {
      console.log('⚠ Email-сервис работает через Ethereal (тестовый режим)');
    }
    console.log('');
  });
}
