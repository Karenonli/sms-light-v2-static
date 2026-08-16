 // server.js — Express API сервер
// Работает как standalone (node server.js) так и на Vercel (serverless)
// [refresh] SMTP 587 STARTTLS

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { sendEmail, generateCode, verifyConnection, isUsingFallback, templates } = require('./email');
require('dotenv').config();

// ===== Database =====
const { db, getPool, initDb } = require('./lib/db');

// ===== Telegram-бот (мини-маркет) =====
const tgBot = require('./lib/tg-bot');

// ===== Платёжная система Fride =====
const fride = require('./lib/fride');

// ===== SMS-агрегатор (автовыдача виртуальных номеров) =====
const sms = require('./lib/sms');

// Inline-кнопка «Админка» для уведомлений в чат администратора
function tgAdminKeyboard() {
  return [[{ text: '🧑‍💻 Админка', url: tgBot.SITE_BASE + '/admin' }]];
}

// ===== Администраторы =====
const ADMIN_EMAILS = ['justxirrez@inbox.ru', 'mikoto_11@list.ru'];

// ===== Dev-режим =====
// На Vercel код подтверждения никогда не отдаётся в ответах — только реальная
// отправка письма на почту. dev_code/email_failed возвращаются лишь при локальном
// запуске (node server.js), чтобы можно было продолжить без рабочего SMTP.
const IS_DEV = !process.env.VERCEL && process.env.NODE_ENV !== 'production';

// ===== App =====
const app = express();

// На Vercel TLS завершается на Edge, внутри функции запрос приходит по HTTP.
// Без этого Express считает соединение небезопасным и не отправляет Secure-куки сессии.
app.set('trust proxy', 1);

// Вебхук Fride: подпись считается по ИСХОДНОМУ телу запроса, поэтому для этого
// пути подключаем raw-парсер ДО express.json (он отдаёт req.body как Buffer).
app.use('/api/fride/webhook', express.raw({ type: '*/*' }));

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

// Сохранение сессии как Promise (для async-роутов)
function saveSession(req) {
  return new Promise(function(resolve, reject) {
    req.session.save(function(err) { return err ? reject(err) : resolve(); });
  });
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
  app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'shop.html')));
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

    const existing = await db.get('SELECT id, email_verified FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing) {
      // Email подтверждён — это дубликат, пусть войдёт.
      if (existing.email_verified) {
        return res.json({ error: 'Этот email уже зарегистрирован. Войдите в аккаунт.' });
      }
      // Email зарегистрирован, но не подтверждён (код потерян/не пришёл/истёк).
      // Вместо тупика «уже зарегистрирован» генерируем и отправляем новый код.
      const code = generateCode(6);
      await db.run('UPDATE users SET verification_code = $1 WHERE id = $2', [code, existing.id]);
      try {
        await sendEmail(email, 'Подтверждение регистрации — SMS Light', templates.verification(code));
        console.log(`→ Повторный код подтверждения для ${email}: ${code}`);
        return res.json({
          ok: true,
          message: 'Код подтверждения отправлен на ваш email. Проверьте также папку «Спам».',
          ...(IS_DEV && isUsingFallback() ? { dev_code: code } : {}),
        });
      } catch (emailErr) {
        console.error('Failed to re-send verification email:', emailErr.message);
        console.log(`→ [ВНИМАНИЕ] Повторный код для ${email}: ${code} (письмо не отправлено)`);
        if (emailErr.invalidRecipient) {
          console.log(`→ Почтовый ящик не существует: ${email}`);
          return res.json({ error: 'Такого почтового ящика не существует. Проверьте правильность email.' });
        }
        if (IS_DEV && isUsingFallback()) {
          return res.json({
            ok: true,
            email_failed: true,
            message: '⚠️ Не удалось отправить письмо с кодом. Но вы можете использовать код ниже для подтверждения.',
            dev_code: code,
          });
        }
        return res.json({
          ok: true,
          message: 'Код подтверждения запрошен. Если письмо не пришло в течение пары минут, проверьте правильность email и нажмите «Отправить снова».',
        });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const code = generateCode(6);
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase()) ? 1 : 0;

    await db.run(
      'INSERT INTO users (name, nickname, email, password, is_admin, verification_code, email_verified) VALUES ($1, $2, $3, $4, $5, $6, 0)',
      [name, nickname || name, email, hash, isAdmin, code]
    );

    // Telegram-уведомление админу о новой регистрации (не для админ-аккаунтов).
    // Await обязателен: на Vercel после res функция замораживается, фоновая отправка не уйдёт.
    if (process.env.ADMIN_TG_CHAT_ID && !isAdmin) {
      try {
        await tgBot.notifyAdmin(
          '👤 Новый пользователь\nИмя: ' + name + '\nEmail: ' + email,
          tgAdminKeyboard()
        );
      } catch (err) {
        console.error('TG notifyAdmin (register) error:', err);
      }
    }

    try {
      await sendEmail(email, 'Подтверждение регистрации — SMS Light', templates.verification(code));
      console.log(`→ Код подтверждения для ${email}: ${code}`);
      res.json({
        ok: true,
        message: 'Код подтверждения отправлен на ваш email. Проверьте также папку «Спам».',
        ...(IS_DEV && isUsingFallback() ? { dev_code: code } : {}),
      });
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
      console.log(`→ [ВНИМАНИЕ] Код для ${email}: ${code} (письмо не отправлено — SMTP недоступен)`);
      // Почтовый ящик не существует (550) — говорим пользователю прямо, чтобы он
      // исправил адрес, а не ждал письмо в несуществующий ящик.
      if (emailErr.invalidRecipient) {
        console.log(`→ Почтовый ящик не существует: ${email}`);
        return res.json({ error: 'Такого почтового ящика не существует. Проверьте правильность email.' });
      }
      // Код в ответе отдаём ТОЛЬКО когда SMTP не настроен вовсе (Ethereal, локальная
      // разработка). Если SMTP настроен, но не работает — нейтральное сообщение без кода.
      if (IS_DEV && isUsingFallback()) {
        // Локальная разработка без SMTP: показываем код в интерфейсе, чтобы можно
        // было продолжить регистрацию на Ethereal.
        res.json({
          ok: true,
          email_failed: true,
          message: '⚠️ Не удалось отправить письмо с кодом. Но вы можете использовать код ниже для подтверждения.',
          dev_code: code,
        });
      } else {
        // Продакшен: код в ответе не раскрываем. Пользователь увидит нейтральное
        // сообщение и сможет повторить отправку через «Отправить снова».
        res.json({
          ok: true,
          message: 'Код подтверждения запрошен. Если письмо не пришло в течение пары минут, проверьте правильность email и нажмите «Отправить снова».',
        });
      }
    }
  } catch (err) {
    console.error('Register error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Регистрация по username: пользователь вводит username + пароль (2 раза) и
// необязательную почту. Почта НЕ проверяется кодом — она нужна только для
// восстановления через «Забыли пароль?». Аккаунт сохраняется за username+паролем.
app.post('/api/auth/register-username', async (req, res) => {
  try {
    const { nickname, password, email } = req.body || {};
    const uname = String(nickname || '').trim().replace(/^@/, '');
    const pw = String(password || '');
    const emailClean = String(email || '').trim().toLowerCase();

    if (!uname) return res.json({ error: 'Введите username' });
    if (uname.length < 3) return res.json({ error: 'Username должен быть минимум 3 символа' });
    if (!/^[A-Za-z0-9_.-]+$/.test(uname)) {
      return res.json({ error: 'Username может содержать только латинские буквы, цифры, точки, подчёркивания и дефисы' });
    }
    if (pw.length < 6) return res.json({ error: 'Пароль должен быть минимум 6 символов' });
    if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.json({ error: 'Введите корректный email' });
    }

    const taken = await db.get('SELECT id FROM users WHERE LOWER(nickname) = $1', [uname.toLowerCase()]);
    if (taken) return res.json({ error: 'Этот username уже занят. Выберите другой.' });

    if (emailClean) {
      const clash = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [emailClean]);
      if (clash) return res.json({ error: 'Этот email уже зарегистрирован. Войдите через него.' });
    }

    const hash = await bcrypt.hash(pw, 10);
    const isAdmin = ADMIN_EMAILS.includes(emailClean) ? 1 : 0;
    // email NOT NULL UNIQUE: без указанной почты подставляем недостижимый
    // плейсхолдер на базе username (username уникален) — восстановление по нему
    // невозможно, что и ожидается для аккаунтов без email.
    const finalEmail = emailClean || (uname.toLowerCase() + '@username.local');

    await db.run(
      'INSERT INTO users (name, nickname, email, password, is_admin, email_verified, created_at) VALUES ($1, $2, $3, $4, $5, 1, $6)',
      [uname, uname, finalEmail, hash, isAdmin, new Date().toISOString()]
    );
    const saved = await db.get('SELECT id, name, nickname, email, is_admin FROM users WHERE LOWER(nickname) = $1', [uname.toLowerCase()]);
    if (!saved) return res.json({ error: 'Ошибка сервера' });

    // Telegram-уведомление админу (await обязателен на Vercel).
    if (process.env.ADMIN_TG_CHAT_ID && !isAdmin) {
      try {
        await tgBot.notifyAdmin(
          '👤 Новый пользователь (по username)\nUsername: @' + uname
          + (emailClean ? '\nEmail: ' + emailClean : ''),
          tgAdminKeyboard()
        );
      } catch (err) {
        console.error('TG notifyAdmin (register-username) error:', err);
      }
    }

    req.session.userId = saved.id;
    req.session.isAdmin = saved.is_admin === 1;
    await saveSession(req);

    res.json({
      ok: true,
      registered: true,
      is_admin: saved.is_admin === 1,
      user: { id: saved.id, name: saved.name, nickname: saved.nickname, email: saved.email, is_admin: saved.is_admin },
    });
  } catch (err) {
    console.error('Register-username error:', err);
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

// Вход. login — это email ИЛИ username (регистрация по username):
// ищем по email либо по nickname без учёта регистра.
app.post('/api/auth/login', async (req, res) => {
  try {
    const login = String(req.body.login || req.body.email || '').trim().replace(/^@/, '');
    const { password } = req.body;

    if (!login || !password) {
      return res.json({ error: 'Введите логин и пароль' });
    }

    const user = await db.get('SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($1)', [login]);
    if (!user) {
      return res.json({ error: 'Неверный логин или пароль' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.json({ error: 'Неверный логин или пароль' });
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
        ...(IS_DEV && isUsingFallback() ? { dev_code: code } : {}),
      });
    } catch (emailErr) {
      console.error('Resend email failed:', emailErr.message);
      console.log(`→ [ВНИМАНИЕ] Новый код для ${email}: ${code} (письмо не отправлено)`);
      if (IS_DEV && isUsingFallback()) {
        res.json({
          ok: true,
          email_failed: true,
          message: '⚠️ Не удалось отправить письмо. Используйте код: ' + code,
          dev_code: code,
        });
      } else {
        res.json({
          ok: true,
          message: 'Не удалось отправить письмо. Проверьте правильность email и попробуйте ещё раз.',
        });
      }
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
    // Убираем @ в начале — пользователь может ввести @username как в логине
    const input = String(email || '').trim().replace(/^@/, '');
    if (!input) return res.json({ error: 'Введите email или username' });

    // Ищем и по email, и по username (регистрация по username): LOWER делает
    // поиск нечувствительным к регистру. Код восстановления уходит на email
    // аккаунта — даже если пользователь ввёл свой username.
    const user = await db.get('SELECT id, email, tg_id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($1)', [input]);
    if (!user) {
      return res.json({ ok: true, message: 'Если аккаунт существует, код отправлен на email или в Telegram' });
    }

    const code = generateCode(6);
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.run('UPDATE users SET reset_code = $1, reset_code_expires = $2 WHERE id = $3', [code, expires, user.id]);

    const tgId = user.tg_id;
    if (tgId) {
      // Код восстановления отправляем в Telegram-чат пользователя (предпочитительнее email)
      const tgRes = await tgBot.api('sendMessage', {
        chat_id: tgId,
        text: '🔐 Код восстановления пароля — SMS Light\n\n'
          + 'Ваш код: <b>' + code + '</b>\n\n'
          + 'Он действителен 15 минут.',
        parse_mode: 'HTML',
      });
      if (tgRes.ok) {
        console.log(`→ Код восстановления для ${input} (tg_id: ${tgId}): ${code}`);
      } else {
        console.error('Forgot TG send failed, falling back to email:', tgRes.error);
      }
      res.json({
        ok: true,
        message: 'Код восстановления отправлен в ваш Telegram-чат. Откройте диалог с ботом @' + tgBot.SUPPORT_USERNAME + '.',
        ...(IS_DEV && isUsingFallback() ? { dev_code: code } : {}),
      });
    } else {
      // Пользователь не привязал Telegram — fallback на email
      try {
        await sendEmail(user.email, 'Восстановление пароля — SMS Light', templates.reset(code));
        console.log(`→ Код восстановления для ${input} (email: ${user.email}): ${code}`);
        res.json({
          ok: true,
          message: 'Код восстановления отправлен на ваш email. Проверьте также папку «Спам».',
          ...(IS_DEV && isUsingFallback() ? { dev_code: code } : {}),
        });
      } catch (emailErr) {
        console.error('Forgot email failed:', emailErr.message);
        console.log(`→ [ВНИМАНИЕ] Код восстановления для ${input}: ${code} (письмо не отправлено)`);
        if (IS_DEV && isUsingFallback()) {
          res.json({
            ok: true,
            email_failed: true,
            message: '⚠️ Не удалось отправить письмо. Код восстановления: ' + code,
            dev_code: code,
          });
        } else {
          res.json({
            ok: true,
            message: 'Код восстановления запрошен. Если письмо не пришло в течение пары минут, проверьте правильность email и попробуйте ещё раз.',
          });
        }
      }
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
    const input = String(email || '').trim().replace(/^@/, '');
    if (!input || !code || !password) {
      return res.json({ error: 'Заполните все поля' });
    }
    if (password.length < 6) {
      return res.json({ error: 'Пароль должен быть минимум 6 символов' });
    }

    const user = await db.get('SELECT id, reset_code, reset_code_expires FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($1)', [input]);
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

// Публичный список пользователей для чата (id/имя/админ — без email)
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, nickname, is_admin FROM users ORDER BY id ASC');
    res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    res.json({ users: [] });
  }
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

// Статистика для админки.
// Все периоды («сегодня», «7 дней», «30 дней») считаются по календарным дням
// в московском времени (Europe/Moscow), чтобы «сегодня» у администратора
// совпадало с его календарным днём. Раньше «сегодня» было последними 24 часами —
// из-за этого цифры на вкладке казались непонятными.
// created_at в users — TIMESTAMP (UTC), в purchases/messages — TEXT ISO UTC.
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const TZ = 'Europe/Moscow';
    const DAYS = 35;
    // Московская дата «сейчас» (DATE). Сравниваем её с датами в той же TZ,
    // поэтому session TimeZone на Neon не влияет на результат.
    const mskToday = `(NOW() AT TIME ZONE '${TZ}')::date`;
    const uDay = `(created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')::date`;
    const pDay = `(created_at::timestamptz AT TIME ZONE '${TZ}')::date`;

    // Дневные серии (последние DAYS дней) — для графиков
    const usersDailyRaw = await db.all(
      `SELECT to_char(${uDay}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
       FROM users WHERE ${uDay} >= (${mskToday} - INTERVAL '${DAYS - 1} days')::date
       GROUP BY 1 ORDER BY 1`
    );
    const purchasesDailyRaw = await db.all(
      `SELECT to_char(${pDay}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
       FROM purchases
       WHERE created_at IS NOT NULL AND created_at <> ''
         AND ${pDay} >= (${mskToday} - INTERVAL '${DAYS - 1} days')::date
       GROUP BY 1 ORDER BY 1`
    );
    const messagesDailyRaw = await db.all(
      `SELECT to_char(${pDay}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
       FROM messages
       WHERE created_at IS NOT NULL AND created_at <> ''
         AND ${pDay} >= (${mskToday} - INTERVAL '${DAYS - 1} days')::date
       GROUP BY 1 ORDER BY 1`
    );

    // Агрегаты за периоды. Выручка = сумма цен выполненных заказов (status='completed').
    const rows = await Promise.all([
      // Пользователи: всего / сегодня / вчера / 7 дней / 30 дней
      db.get(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${uDay} = ${mskToday})::int AS today,
        COUNT(*) FILTER (WHERE ${uDay} = ${mskToday} - 1)::int AS yesterday,
        COUNT(*) FILTER (WHERE ${uDay} >= (${mskToday} - INTERVAL '6 days')::date)::int AS week,
        COUNT(*) FILTER (WHERE ${uDay} >= (${mskToday} - INTERVAL '29 days')::date)::int AS month
        FROM users`),
      // Заказы + выручка
      db.get(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${pDay} = ${mskToday})::int AS today,
        COUNT(*) FILTER (WHERE ${pDay} = ${mskToday} - 1)::int AS yesterday,
        COUNT(*) FILTER (WHERE ${pDay} >= (${mskToday} - INTERVAL '6 days')::date)::int AS week,
        COUNT(*) FILTER (WHERE ${pDay} >= (${mskToday} - INTERVAL '29 days')::date)::int AS month,
        COALESCE(SUM(price) FILTER (WHERE status = 'completed' AND ${pDay} = ${mskToday}), 0)::int AS revenueToday,
        COALESCE(SUM(price) FILTER (WHERE status = 'completed' AND ${pDay} = ${mskToday} - 1), 0)::int AS revenueYesterday,
        COALESCE(SUM(price) FILTER (WHERE status = 'completed' AND ${pDay} >= (${mskToday} - INTERVAL '6 days')::date), 0)::int AS revenueWeek,
        COALESCE(SUM(price) FILTER (WHERE status = 'completed' AND ${pDay} >= (${mskToday} - INTERVAL '29 days')::date), 0)::int AS revenueMonth,
        COALESCE(SUM(price) FILTER (WHERE status = 'completed'), 0)::int AS revenueTotal
        FROM purchases
        WHERE created_at IS NOT NULL AND created_at <> ''`),
      // Сообщения
      db.get(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${pDay} = ${mskToday})::int AS today,
        COUNT(*) FILTER (WHERE ${pDay} = ${mskToday} - 1)::int AS yesterday,
        COUNT(*) FILTER (WHERE ${pDay} >= (${mskToday} - INTERVAL '6 days')::date)::int AS week,
        COUNT(*) FILTER (WHERE ${pDay} >= (${mskToday} - INTERVAL '29 days')::date)::int AS month
        FROM messages
        WHERE created_at IS NOT NULL AND created_at <> ''`),
      // Покупатели и активные пользователи за 30 дней (без админов)
      db.get(`SELECT
        (SELECT COUNT(DISTINCT user_id)::int FROM purchases
         WHERE created_at IS NOT NULL AND created_at <> ''
           AND ${pDay} >= (${mskToday} - INTERVAL '29 days')::date
           AND user_id NOT IN (SELECT id FROM users WHERE is_admin = 1)) AS buyers30,
        (SELECT COUNT(*)::int FROM (
           SELECT user_id FROM purchases
           WHERE created_at IS NOT NULL AND created_at <> ''
             AND ${pDay} >= (${mskToday} - INTERVAL '29 days')::date
             AND user_id NOT IN (SELECT id FROM users WHERE is_admin = 1)
           UNION
           SELECT sender_id FROM messages
           WHERE created_at IS NOT NULL AND created_at <> ''
             AND ${pDay} >= (${mskToday} - INTERVAL '29 days')::date
             AND sender_id NOT IN (SELECT id FROM users WHERE is_admin = 1)
         ) AS act) AS activeUsers30`),
      // Статусы заказов за 30 дней
      db.all(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(price), 0)::int AS revenue
        FROM purchases
        WHERE created_at IS NOT NULL AND created_at <> ''
          AND ${pDay} >= (${mskToday} - INTERVAL '29 days')::date
        GROUP BY status ORDER BY count DESC`),
      // Статусы заказов за всё время
      db.all(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(price), 0)::int AS revenue
        FROM purchases
        WHERE created_at IS NOT NULL AND created_at <> ''
        GROUP BY status ORDER BY count DESC`),
    ]);

    // Топ сервисов: число заказов + выручка с выполненных
    const topServices = await db.all(
      `SELECT service_name AS name,
              COUNT(*)::int AS count,
              COALESCE(SUM(price) FILTER (WHERE status = 'completed'), 0)::int AS revenue
       FROM purchases
       GROUP BY service_name ORDER BY count DESC, name ASC LIMIT 8`
    );
    // Последние регистрации
    const recent = await db.all(
      `SELECT id, name, email, created_at FROM users ORDER BY created_at DESC LIMIT 8`
    );
    // Последние заказы (с именем покупателя)
    const recentPurchases = await db.all(
      `SELECT p.id, p.service_name, p.price, p.currency, p.status, p.created_at,
              u.name, u.email
       FROM purchases p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.created_at IS NOT NULL AND p.created_at <> ''
       ORDER BY p.created_at DESC LIMIT 8`
    );

    const U = rows[0] || {}, P = rows[1] || {}, M = rows[2] || {}, A = rows[3] || {};
    res.json({
      ok: true,
      totals: {
        users: U.total, usersToday: U.today, usersYesterday: U.yesterday,
        usersWeek: U.week, usersMonth: U.month,
        purchases: P.total, purchasesToday: P.today, purchasesYesterday: P.yesterday,
        purchasesWeek: P.week, purchasesMonth: P.month,
        revenueToday: P.revenueToday, revenueYesterday: P.revenueYesterday,
        revenueWeek: P.revenueWeek, revenueMonth: P.revenueMonth, revenueTotal: P.revenueTotal,
        messages: M.total, messagesToday: M.today, messagesYesterday: M.yesterday,
        messagesWeek: M.week, messagesMonth: M.month,
        buyers30: A.buyers30, activeUsers30: A.activeUsers30,
      },
      statusMonth: rows[4],
      statusTotal: rows[5],
      usersDaily: usersDailyRaw,
      purchasesDaily: purchasesDailyRaw,
      messagesDaily: messagesDailyRaw,
      topServices,
      recent,
      recentPurchases,
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.json({ error: 'Ошибка загрузки статистики' });
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

    // Telegram-уведомление админу, когда покупатель пишет в чат.
    // Пропускаем служебные «🛒 Заказ: …» (о них уже уведомляет /api/purchases),
    // автоответы и сообщения от самих админов.
    if (process.env.ADMIN_TG_CHAT_ID && String(text).indexOf('🛒') !== 0) {
      try {
        const senderU = await db.get('SELECT is_admin, name FROM users WHERE id = $1', [senderId]);
        const receiverU = await db.get('SELECT is_admin FROM users WHERE id = $1', [receiverId]);
        if (receiverU && receiverU.is_admin && senderU && !senderU.is_admin) {
          await tgBot.notifyAdmin(
            '💬 Новое сообщение от ' + (senderU.name || senderId) + '\n' + String(text).slice(0, 300),
            tgAdminKeyboard()
          );
        }
      } catch (err) {
        console.error('TG notifyAdmin (message) error:', err);
      }
    }

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
//  API: Заказы (покупки)
// ========================================================================

// Приведение строки БД к клиентскому виду (snake_case → camelCase)
function mapPurchase(m) {
  return {
    id: m.id,
    userId: m.user_id,
    serviceType: m.service_type,
    serviceName: m.service_name,
    country: m.country,
    price: m.price,
    currency: m.currency,
    phoneNumber: m.phone_number,
    status: m.status,
    activationId: m.activation_id || '',
    code: m.code || '',
    created_at: m.created_at,
  };
}

// Попытаться выдать номер автоматически после подтверждения оплаты
// (вебхук Fride или админ перевёл заказ в «Оплачен»). Номер не выдаём повторно,
// если он уже есть. Возвращает { ok } или { ok:false, reason } — в последнем
// случае номер выдаёт администратор вручную.
//
// Источники номеров (по приоритету):
//   1) Собственный пул постоянных номеров (SMS_POOL_ENABLED=true) — номер из
//      number_pool, SMS-код придёт на вебхук /api/sms/webhook.
//   2) SMS-агрегатор (sms-activate / 5sim) — аренда номера через API.
async function tryAutoIssue(purId) {
  let pur;
  try { pur = await db.get('SELECT * FROM purchases WHERE id = $1', [String(purId)]); }
  catch (e) { return { ok: false, reason: 'db-error' }; }
  if (!pur) return { ok: false, reason: 'not-found' };
  if (pur.phone_number) return { ok: false, reason: 'already-issued' };

  // 1) Свой пул вечных номеров
  if (process.env.SMS_POOL_ENABLED === 'true') {
    try {
      const free = await db.get(`SELECT * FROM number_pool WHERE status = 'available' ORDER BY id ASC LIMIT 1`);
      if (!free) return { ok: false, reason: 'pool-empty' };
      await db.run(
        'UPDATE purchases SET phone_number = $1, activation_id = $2 WHERE id = $3',
        [free.phone, 'pool:' + free.id, pur.id]
      );
      await db.run(
        'UPDATE number_pool SET status = $1, purchase_id = $2 WHERE id = $3',
        ['issued', pur.id, free.id]
      );
      return { ok: true, phone: free.phone, fromPool: true };
    } catch (err) {
      console.error('tryAutoIssue (pool) error (order ' + pur.id + '):', err.message);
      return { ok: false, reason: 'pool-error' };
    }
  }

  // 2) SMS-агрегатор
  if (!sms.isConfigured()) return { ok: false, reason: 'sms-not-configured' };

  try {
    const res = await sms.buyNumber({ serviceId: pur.service_type, serviceName: pur.service_name, country: pur.country });
    await db.run(
      'UPDATE purchases SET phone_number = $1, activation_id = $2 WHERE id = $3',
      [res.phone, String(res.id), pur.id]
    );
    return { ok: true, phone: res.phone };
  } catch (err) {
    console.error('tryAutoIssue error (order ' + pur.id + '):', err.message);
    return { ok: false, reason: err.message };
  }
}

// Создать заказ (аутентифицированный пользователь).
// id передаётся клиентский (Date.now()+rand) — как у сообщений чата,
// чтобы локальная покупка и серверная имели один id без конфликтов.
app.post('/api/purchases', requireAuth, async (req, res) => {
  try {
    const { id, serviceType, serviceName, country, price, currency, created_at } = req.body;
    if (!serviceName) return res.json({ error: 'Не указан сервис' });
    const purId = id || (Date.now() + Math.floor(Math.random() * 1000));
    await db.run(
      `INSERT INTO purchases (id, user_id, service_type, service_name, country, price, currency, phone_number, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '', 'pending', $8)
       ON CONFLICT (id) DO NOTHING`,
      [purId, req.session.userId, serviceType || 'virtual', serviceName, country || '', price || 0, currency || 'RUB', created_at || new Date().toISOString()]
    );

    // Telegram-уведомление администратору о новом заказе (если задан ADMIN_TG_CHAT_ID).
    // Await обязателен: на Vercel после res.json() функция замораживается, и
    // фоновая отправка не успела бы уйти. Ошибка уведомления не роняет заказ.
    if (process.env.ADMIN_TG_CHAT_ID) {
      try {
        await tgBot.notifyAdmin(
          '🛍️ Новый заказ №' + purId + '\n'
          + 'Сервис: ' + serviceName + '\n'
          + 'Страна: ' + (country || '—') + '\n'
          + 'Цена: ' + (price || 0) + ' ' + (currency || 'RUB') + '\n'
          + 'Статус: ' + tgBot.statusText('pending')
        );
      } catch (err) {
        console.error('TG notifyAdmin error:', err);
      }
    }

    res.json({ ok: true, id: purId });
  } catch (err) {
    console.error('Create purchase error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Мои заказы
app.get('/api/purchases', requireAuth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM purchases WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
    res.json({ purchases: rows.map(mapPurchase) });
  } catch (err) {
    console.error('Get purchases error:', err);
    res.json({ purchases: [] });
  }
});

// Все заказы (админ)
app.get('/api/purchases/all', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM purchases ORDER BY created_at DESC');
    res.json({ purchases: rows.map(mapPurchase) });
  } catch (err) {
    console.error('Get all purchases error:', err);
    res.json({ purchases: [] });
  }
});

// Обновить заказ (номер, статус).
// Владелец (покупатель) может только отменить свой заказ (status=rejected).
// Админ может выдать номер и поставить любой статус, в т.ч. «завершён».
app.post('/api/purchases/update', requireAuth, async (req, res) => {
  try {
    const { id, phoneNumber, status } = req.body;
    if (!id) return res.json({ error: 'Неверный ID заказа' });

    const pur = await db.get('SELECT * FROM purchases WHERE id = $1', [id]);
    if (!pur) return res.json({ error: 'Заказ не найден' });

    const isOwner = pur.user_id === req.session.userId;
    if (!isOwner && !req.session.isAdmin) {
      return res.json({ error: 'Нет доступа к этому заказу' });
    }

    const sets = [];
    const params = [];
    if (phoneNumber !== undefined) {
      if (!req.session.isAdmin) return res.json({ error: 'Номер может указывать только администратор' });
      sets.push(`phone_number = $${sets.length + 1}`);
      params.push(String(phoneNumber));
    }
    if (status !== undefined) {
      const allowed = ['pending', 'paid', 'completed', 'rejected'];
      if (!allowed.includes(status)) return res.json({ error: 'Неверный статус' });
      if (!req.session.isAdmin && status !== 'rejected') {
        return res.json({ error: 'Покупатель может только отменить заказ' });
      }
      // Отменить можно только неоплаченный заказ — после оплаты средства
      // возвращаются через поддержку/Fride, а не отменой в один клик.
      if (!req.session.isAdmin && status === 'rejected' && pur.status !== 'pending') {
        return res.json({ error: 'Оплаченный заказ отменить нельзя — обратитесь в поддержку' });
      }
      sets.push(`status = $${sets.length + 1}`);
      params.push(status);
    }

    if (sets.length > 0) {
      params.push(id);
      await db.run(`UPDATE purchases SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }

    // Админ подтвердил оплату (ручной флоу) — пытаемся выдать номер автоматически,
    // если настроен свой пул или SMS-агрегатор, и номера ещё нет.
    if (status === 'paid' && phoneNumber === undefined
        && (process.env.SMS_POOL_ENABLED === 'true' || sms.isConfigured())) {
      try {
        const auto = await tryAutoIssue(id);
        if (auto.ok && process.env.ADMIN_TG_CHAT_ID) {
          await tgBot.notifyAdmin(
            (auto.fromPool ? '📦 Номер выдан из пула — заказ №' : '🤖 Номер выдан автоматически — заказ №') + id + '\n'
            + 'Сервис: ' + pur.service_name + '\n'
            + 'Номер: ' + auto.phone,
            tgAdminKeyboard()
          );
        } else if (!auto.ok && auto.reason !== 'sms-not-configured' && process.env.ADMIN_TG_CHAT_ID) {
          const msg = auto.reason === 'pool-empty'
            ? '⚠️ Пул номеров пуст — заказ №' + id + '. Добавьте номера или выдайте вручную.'
            : '⚠️ Автовыдача не удалась — заказ №' + id + ' (' + auto.reason + '). Выдайте номер вручную.';
          await tgBot.notifyAdmin(msg, tgAdminKeyboard());
        }
      } catch (err) {
        console.error('Auto-issue (update purchase) error:', err);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Update purchase error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Удалить заказ (админ) — для чистки ошибочных записей
app.delete('/api/purchases/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ error: 'Неверный ID' });
    await db.run('DELETE FROM purchases WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete purchase error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ========================================================================
//  API: Оплата через Fride
// ========================================================================

// Создать онлайн-заказ с оплатой Fride (аутентифицированный пользователь).
// Сначала создаём инвойс в Fride (order_id = id будущего заказа в БД),
// и только после успеха Fride пишем заказ в purchases со статусом pending.
// Возвращаем url платёжной формы, куда уходит покупатель.
app.post('/api/fride/create', requireAuth, async (req, res) => {
  try {
    if (!fride.isConfigured()) {
      // Fride ещё не настроен — клиент уходит в ручной флоу (перевод на поддержку).
      return res.json({ ok: false, error: 'Оплата через Fride не настроена', manual: true });
    }

    const { serviceType, serviceName, country, price, currency } = req.body;
    if (!serviceName) return res.json({ error: 'Не указан сервис' });
    const amount = Math.round(Number(price) * 100) / 100;
    if (!isFinite(amount) || amount <= 0) return res.json({ error: 'Неверная сумма' });

    const purId = Date.now() + Math.floor(Math.random() * 1000);

    // telegram_id_client нужен, только если мерчант связан с Telegram-ботами.
    let telegramId = null;
    try {
      const row = await db.get('SELECT tg_id FROM users WHERE id = $1', [req.session.userId]);
      if (row && row.tg_id) telegramId = Number(row.tg_id);
    } catch (e) { /* не критично */ }

    const siteBase = process.env.SITE_BASE_URL || tgBot.SITE_BASE;
    const inv = await fride.createInvoice({
      orderId: purId,
      amount: amount,
      currency: currency || 'RUB',
      comment: serviceName + (country ? ', ' + country : ''),
      customFields: { user_id: String(req.session.userId) },
      telegramId: telegramId,
      successUrl: siteBase + '/shop?paid=1&order=' + purId,
      failUrl: siteBase + '/shop?pay=fail&order=' + purId,
    });

    await db.run(
      `INSERT INTO purchases (id, user_id, service_type, service_name, country, price, currency, phone_number, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '', 'pending', $8)
       ON CONFLICT (id) DO NOTHING`,
      [purId, req.session.userId, serviceType || 'virtual', serviceName, country || '', amount, currency || 'RUB', new Date().toISOString()]
    );

    res.json({ ok: true, id: purId, url: inv.url });
  } catch (err) {
    console.error('Fride create error:', err);
    // Ошибка Fride (например, требуется telegram_id_client) — не роняем заказ,
    // клиент уходит на ручную оплату.
    res.json({ ok: false, error: err.message, manual: true });
  }
});

// Вебхук Fride: уведомление об оплате/возврате. Подпись проверяется по
// ИСХОДНОМУ телу (req.body — Buffer из-за express.raw для этого пути).
app.post('/api/fride/webhook', async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const signature = req.get('X-Signature') || '';

  if (!fride.verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ error: 'Неверная подпись' });
  }

  let data = null;
  try { data = JSON.parse(raw); } catch (e) { /* fallthrough */ }
  if (!data || !data.order_id) {
    return res.status(400).json({ error: 'Нет order_id' });
  }

  try {
    const pur = await db.get('SELECT * FROM purchases WHERE id = $1', [String(data.order_id)]);
    if (pur) {
      if ((data.status === 'paid' || data.status === 'hold') && pur.status === 'pending') {
        // Оплачен. Пытаемся выдать номер автоматически через SMS-агрегатор;
        // если он не настроен или покупка не удалась — номер выдаст админ.
        await db.run(`UPDATE purchases SET status = 'paid' WHERE id = $1`, [pur.id]);
        const auto = await tryAutoIssue(pur.id);
        if (process.env.ADMIN_TG_CHAT_ID) {
          try {
            let msg;
            if (auto.ok) {
              msg = (auto.fromPool ? '📦 Номер выдан из пула' : '🤖 Номер выдан автоматически') + ' — заказ №' + pur.id + '\n'
                + 'Сервис: ' + pur.service_name + '\n'
                + 'Страна: ' + (pur.country || '—') + '\n'
                + 'Номер: ' + auto.phone + '\n'
                + 'Статус: 🟢 Оплачен — покупатель получает SMS-код';
            } else if (auto.reason === 'sms-not-configured') {
              msg = '💳 Оплата получена — заказ №' + pur.id + '\n'
                + 'Сервис: ' + pur.service_name + '\n'
                + 'Страна: ' + (pur.country || '—') + '\n'
                + 'Сумма: ' + pur.price + ' ' + pur.currency + '\n'
                + 'Статус: 🟢 Оплачен — выдайте номер';
            } else if (auto.reason === 'pool-empty') {
              msg = '💳 Оплата получена — заказ №' + pur.id + '\n'
                + 'Сервис: ' + pur.service_name + '\n'
                + 'Страна: ' + (pur.country || '—') + '\n'
                + '⚠️ Пул номеров пуст — добавьте номера или выдайте вручную';
            } else {
              msg = '💳 Оплата получена — заказ №' + pur.id + '\n'
                + 'Сервис: ' + pur.service_name + '\n'
                + 'Страна: ' + (pur.country || '—') + '\n'
                + '⚠️ Автовыдача не удалась (' + auto.reason + ')\n'
                + 'Выдайте номер вручную';
            }
            await tgBot.notifyAdmin(msg, tgAdminKeyboard());
          } catch (err) {
            console.error('TG notifyAdmin (fride webhook) error:', err);
          }
        }
      } else if (data.status === 'refund' && pur.status === 'paid') {
        // Возврат после оплаты — заказ снова отменён.
        await db.run(`UPDATE purchases SET status = 'rejected' WHERE id = $1`, [pur.id]);
        // Если номер был выдан из собственного пула — вернуть его в пул.
        if (pur.activation_id && pur.activation_id.indexOf('pool:') === 0) {
          const pid = parseInt(pur.activation_id.slice(5));
          if (!isNaN(pid)) {
            await db.run(`UPDATE number_pool SET status = 'available', purchase_id = NULL WHERE id = $1`, [pid]);
          }
        }
        if (process.env.ADMIN_TG_CHAT_ID) {
          try {
            await tgBot.notifyAdmin(
              '↩️ Возврат оплаты — заказ №' + pur.id + '\n'
              + 'Сервис: ' + pur.service_name + ' · Статус: 🔴 Отменён',
              tgAdminKeyboard()
            );
          } catch (err) {
            console.error('TG notifyAdmin (refund) error:', err);
          }
        }
      }
    }
    // 200 сразу — Fride не должен переотправлять вебхук.
    res.json({ ok: true });
  } catch (err) {
    console.error('Fride webhook error:', err);
    res.json({ ok: false, error: 'Ошибка сервера' });
  }
});

// ========================================================================
//  API: SMS-код (автовыданный номер)
// ========================================================================

// Получить SMS-код для оплаченного заказа с автовыданным номером (владелец).
// При успехе заказ становится «Завершён» и код сохраняется в БД.
app.post('/api/sms/code', requireAuth, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.json({ error: 'Не указан заказ' });

    const pur = await db.get('SELECT * FROM purchases WHERE id = $1', [String(id)]);
    if (!pur) return res.json({ error: 'Заказ не найден' });
    if (pur.user_id !== req.session.userId && !req.session.isAdmin) {
      return res.json({ error: 'Нет доступа' });
    }
    if (pur.status !== 'paid') return res.json({ error: 'Заказ не в статусе «Оплачен»' });
    if (!pur.activation_id) return res.json({ error: 'Номер выдан вручную — код сообщит администратор' });
    if (pur.code) return res.json({ ok: true, code: pur.code, cached: true });

    // Номер из собственного пула: SMS-код придёт на вебхук /api/sms/webhook,
    // а не через агрегатор. Возвращаем «ждём», клиент обновит заказ позже.
    if (pur.activation_id.indexOf('pool:') === 0) {
      return res.json({ ok: true, waiting: true });
    }

    const r = await sms.getCode(pur.activation_id);
    if (r.status === 'ok' && r.code) {
      await db.run(`UPDATE purchases SET status = 'completed', code = $1 WHERE id = $2`, [r.code, pur.id]);
      return res.json({ ok: true, code: r.code });
    }
    if (r.status === 'wait_code') return res.json({ ok: true, waiting: true });
    if (r.status === 'cancel' || r.status === 'timeout') {
      return res.json({ ok: false, error: 'Активация завершена или истекла — обратитесь в поддержку', expired: true });
    }
    return res.json({ ok: false, error: r.error || 'Код пока не получен' });
  } catch (err) {
    console.error('SMS code error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Отменить активацию (владелец): номер возвращается агрегатору, заказ закрывается.
// Средства за заказ возвращаются через поддержку.
app.post('/api/sms/cancel', requireAuth, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.json({ error: 'Не указан заказ' });

    const pur = await db.get('SELECT * FROM purchases WHERE id = $1', [String(id)]);
    if (!pur) return res.json({ error: 'Заказ не найден' });
    if (pur.user_id !== req.session.userId && !req.session.isAdmin) {
      return res.json({ error: 'Нет доступа' });
    }
    if (pur.status === 'completed' || pur.status === 'rejected') {
      return res.json({ error: 'Заказ уже закрыт' });
    }
    if (!pur.activation_id) return res.json({ error: 'Нечего отменять' });

    if (pur.activation_id.indexOf('pool:') === 0) {
      // Номер из собственного пула — возвращаем его в пул для следующего покупателя.
      const pid = parseInt(pur.activation_id.slice(5));
      if (!isNaN(pid)) {
        await db.run(`UPDATE number_pool SET status = 'available', purchase_id = NULL WHERE id = $1`, [pid]);
      }
    } else {
      try { await sms.cancel(pur.activation_id); }
      catch (e) { console.error('SMS cancel error:', e.message); }
    }

    await db.run(`UPDATE purchases SET status = 'rejected' WHERE id = $1`, [pur.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('SMS cancel error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ========================================================================
//  API: Собственный пул постоянных номеров
// ========================================================================

// Вебхук SMS-провайдера (Telnum/Virtnum и т.п.): на постоянный номер из пула
// пришло SMS. Находим заказ, которому выдан номер, извлекаем код из текста и
// завершаем заказ — клиент видит код без участия админа. Эндпоинт защищён
// секретом SMS_WEBHOOK_TOKEN (в заголовке X-SMS-Webhook-Token или в теле).
app.all('/api/sms/webhook', async (req, res) => {
  try {
    const secret = process.env.SMS_WEBHOOK_TOKEN;
    if (!secret) return res.status(400).json({ error: 'Вебхук не настроен: задайте SMS_WEBHOOK_TOKEN' });

    // Секрет принимаем тремя способами: заголовок (Asterisk-мост и классика),
    // поле в теле (JSON/форма) или query-параметр (переадресация TelNum/Virtnum —
    // они умеют только URL: .../api/sms/webhook?token=...&to=...&text=...).
    const body = req.body || {};
    const q = req.query || {};
    const headerToken = req.get('X-SMS-Webhook-Token') || req.get('X-Webhook-Secret') || '';
    const bodyToken = body.secret || body.token || '';
    const queryToken = q.token || q.secret || '';
    if (headerToken !== secret && bodyToken !== secret && queryToken !== secret) {
      return res.status(401).json({ error: 'Неверный секрет' });
    }

    // Номер и текст SMS — у разных провайдеров разные имена полей
    // (тело JSON/формы + query-параметры для URL-вебхуков).
    const phoneRaw = String(body.phone || body.to || body.number || body.phone_number || body.destination || body.sender
      || q.phone || q.to || q.number || q.phone_number || q.destination || q.sender || '');
    const text = String(body.text || body.message || body.body || body.sms_text || body.msg || body.content
      || q.text || q.message || q.body || q.msg || q.content || '');
    if (!phoneRaw || !text) return res.json({ ok: false, error: 'Не хватает полей (phone/text)' });

    const norm = phoneRaw.replace(/[^\d]/g, '');
    if (norm.length < 7) return res.json({ ok: false, error: 'Некорректный номер' });

    // Ищем выданный номер пула по совпадению цифр (формат у провайдера может
    // отличаться от того, как админ загрузил номер).
    const issued = await db.all(`SELECT * FROM number_pool WHERE status = 'issued'`);
    let match = null;
    for (const n of issued) {
      const nn = String(n.phone).replace(/[^\d]/g, '');
      if (nn === norm || nn.endsWith(norm) || norm.endsWith(nn)) { match = n; break; }
    }
    if (!match || !match.purchase_id) return res.json({ ok: false, error: 'Номер не найден в пуле' });

    const pur = await db.get('SELECT * FROM purchases WHERE id = $1', [match.purchase_id]);
    if (!pur || pur.code) return res.json({ ok: false, error: 'Заказ не найден или уже завершён' });

    // Из текста SMS берём первое число из 4–8 цифр — это и есть код.
    const m = text.match(/\d{4,8}/);
    const code = m ? m[0] : text.trim();

    await db.run(`UPDATE purchases SET status = 'completed', code = $1 WHERE id = $2`, [code, pur.id]);

    if (process.env.ADMIN_TG_CHAT_ID) {
      try {
        await tgBot.notifyAdmin(
          '📩 SMS получено — заказ №' + pur.id + ' завершён\n'
          + 'Сервис: ' + pur.service_name + '\n'
          + 'Номер: ' + pur.phone_number + '\n'
          + 'Код: ' + code
        );
      } catch (err) { console.error('TG notifyAdmin (sms webhook) error:', err); }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('SMS webhook error:', err);
    res.json({ ok: false, error: 'Ошибка сервера' });
  }
});

// Статус SMS-вебхука и готовая ссылка переадресации для TelNum/Virtnum (админ)
app.get('/api/sms/status', requireAdmin, async (req, res) => {
  const siteBase = process.env.SITE_BASE_URL || tgBot.SITE_BASE;
  const token = process.env.SMS_WEBHOOK_TOKEN || '';
  const webhookUrl = siteBase + '/api/sms/webhook';
  res.json({
    ok: true,
    poolEnabled: process.env.SMS_POOL_ENABLED === 'true',
    webhookUrl: webhookUrl,
    tokenSet: !!token,
    // TelNum/Virtnum умеют только URL: токен и поля передаём query-параметрами.
    // Переменные вебхука сервиса маппятся: номер получателя -> to, текст -> text.
    telnumUrl: token
      ? webhookUrl + '?token=' + encodeURIComponent(token) + '&to=%TO%&text=%MESSAGE%'
      : null,
  });
});

// Список номеров пула (админ)
app.get('/api/pool/numbers', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM number_pool ORDER BY id DESC');
    res.json({ numbers: rows });
  } catch (err) {
    console.error('Pool list error:', err);
    res.json({ numbers: [] });
  }
});

// Добавить номера в пул (админ). phones — строка (через пробел/запятую) или массив.
app.post('/api/pool/numbers', requireAdmin, async (req, res) => {
  try {
    const { phones, country } = req.body || {};
    const list = (Array.isArray(phones) ? phones : String(phones || '').split(/[\s,;]+/))
      .map(function(s) { return String(s).trim(); })
      .filter(Boolean);
    if (list.length === 0) return res.json({ error: 'Укажите хотя бы один номер' });

    let added = 0, skipped = 0;
    for (const raw of list) {
      const phone = String(raw).trim();
      if (phone.replace(/[^\d]/g, '').length < 7) { skipped++; continue; }
      try {
        const r = await db.run(
          `INSERT INTO number_pool (phone, country, status) VALUES ($1, $2, 'available')
           ON CONFLICT (phone) DO NOTHING`,
          [phone, country || '']
        );
        if (r.changes > 0) added++; else skipped++; // changes=0 — такой номер уже есть
      } catch (e) { skipped++; }
    }
    res.json({ ok: true, added: added, skipped: skipped });
  } catch (err) {
    console.error('Pool add error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Удалить номер из пула (админ)
app.delete('/api/pool/numbers/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ error: 'Неверный ID' });
    await db.run('DELETE FROM number_pool WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Pool delete error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Вернуть номер в пул (админ): освобождает заказ, номер снова доступен
app.post('/api/pool/numbers/:id/release', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ error: 'Неверный ID' });
    const num = await db.get('SELECT * FROM number_pool WHERE id = $1', [id]);
    if (!num) return res.json({ error: 'Номер не найден' });
    if (num.purchase_id) {
      await db.run(
        `UPDATE purchases SET status = 'rejected' WHERE id = $1 AND status != 'completed'`,
        [num.purchase_id]
      );
    }
    await db.run(`UPDATE number_pool SET status = 'available', purchase_id = NULL WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Pool release error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ========================================================================
//  API: Отзывы
// ========================================================================

const REVIEW_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

// Дата отзыва в том же формате, что у статичных отзывов: «Июль 2026»
function formatReviewDate(ts) {
  try {
    const d = new Date(ts);
    return REVIEW_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  } catch (e) {
    return '';
  }
}

function mapReview(r) {
  return {
    id: r.id,
    author: r.author,
    rating: r.rating,
    service: r.service,
    text: r.text,
    date: formatReviewDate(r.created_at),
  };
}

// Публичный список отзывов (свежие сверху)
app.get('/api/reviews', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM reviews ORDER BY created_at DESC');
    res.json({ reviews: rows.map(mapReview) });
  } catch (err) {
    console.error('Get reviews error:', err);
    res.json({ reviews: [] });
  }
});

// Мои отзывы (для личного кабинета — чтобы знать, на какую покупку уже оставлен отзыв)
app.get('/api/reviews/mine', requireAuth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM reviews WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
    res.json({
      reviews: rows.map(r => Object.assign(mapReview(r), { purchaseId: Number(r.purchase_id) })),
    });
  } catch (err) {
    console.error('Get my reviews error:', err);
    res.json({ reviews: [] });
  }
});

// Оставить/изменить отзыв. Только на завершённую покупку, один отзыв на покупку.
app.post('/api/reviews', requireAuth, async (req, res) => {
  try {
    const { purchaseId, rating, service, text } = req.body;
    const purId = Number(purchaseId);
    if (!purId) return res.json({ error: 'Не указан заказ' });

    const r = Math.round(Number(rating));
    if (!r || r < 1 || r > 5) return res.json({ error: 'Поставьте оценку от 1 до 5' });

    const t = String(text || '').trim();
    if (t.length < 5) return res.json({ error: 'Отзыв слишком короткий' });
    if (t.length > 500) return res.json({ error: 'Отзыв слишком длинный (максимум 500 символов)' });

    const pur = await db.get('SELECT * FROM purchases WHERE id = $1', [purId]);
    if (!pur) return res.json({ error: 'Заказ не найден' });
    if (pur.user_id !== req.session.userId) return res.json({ error: 'Нет доступа к этому заказу' });
    if (pur.status !== 'completed') return res.json({ error: 'Отзыв можно оставить только после завершения заказа' });

    const user = await db.get('SELECT name FROM users WHERE id = $1', [req.session.userId]);
    const author = (user && user.name) || 'Покупатель';

    await db.run(
      `INSERT INTO reviews (user_id, author, rating, service, text, purchase_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (purchase_id) DO UPDATE SET rating = $3, service = $4, text = $5`,
      [req.session.userId, author, r, String(service || pur.service_name), t, purId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Create review error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Удалить отзыв (админ) — модерация
app.delete('/api/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ error: 'Неверный ID' });
    await db.run('DELETE FROM reviews WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete review error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ========================================================================
//  API: Telegram-бот (мини-маркет)
// ========================================================================

// Вебхук Telegram. ВАЖНО: апдейт обрабатываем ДО ответа. На Vercel после
// res.end() функция «замораживается», и фоновый ответ бота не успел бы уйти —
// Telegram получал 200, снимал апдейт, но sendMessage так и не отправлялся.
app.post('/api/tg/webhook', async (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    console.error('TG webhook: неверный secret token');
    res.status(200).end();
    return;
  }
  try {
    await tgBot.handleUpdate(req.body);
  } catch (err) {
    console.error('TG handleUpdate error:', err);
  }
  res.status(200).end();
});

// Вход из Telegram Mini App: по подписанному initData создаём/входим
// в детерминированный аккаунт tg<id>@telegram.local.
app.post('/api/tg/auth', async (req, res) => {
  try {
    const initData = req.body && req.body.initData;
    const v = tgBot.validateInitData(initData);
    if (!v.ok) return res.status(401).json({ error: v.error });

    const tgUser = v.user || {};
    const tgId = tgUser.id;
    const email = tgBot.emailForTgUser(tgUser);
    const name = ((tgUser.first_name || '') + (tgUser.last_name ? ' ' + tgUser.last_name : '')).trim() || 'Telegram';
    const nickname = tgUser.username || '';

    // Ищем и по tg_id, и по детерминированному email: tg_id неизменен при смене
    // username, поэтому аккаунт одного и того же человека не задваивается.
    let user = await db.get('SELECT * FROM users WHERE tg_id = $1 OR email = $2', [tgId, email]);
    if (!user) {
      // Пароль пустой — вход только через Telegram (подпись initData уже проверена)
      await db.run(
        "INSERT INTO users (email, name, nickname, password, email_verified, is_admin, tg_id, created_at) VALUES ($1, $2, $3, '', 1, 0, $4, $5)",
        [email, name, nickname, tgId, new Date().toISOString()]
      );
      user = await db.get('SELECT * FROM users WHERE tg_id = $1', [tgId]);

      // Telegram-уведомление админу о новом посетителе мини-маркета (только при создании).
      if (process.env.ADMIN_TG_CHAT_ID) {
        try {
          await tgBot.notifyAdmin(
            '👤 Новый пользователь Telegram-маркета\nИмя: ' + name
            + (nickname ? '\nUsername: @' + nickname : ''),
            tgAdminKeyboard()
          );
        } catch (err) {
          console.error('TG notifyAdmin (tg auth) error:', err);
        }
      }
    } else {
      await db.run('UPDATE users SET name = $1, nickname = $2, tg_id = $3 WHERE id = $4', [name, nickname, tgId, user.id]);
    }

    req.session.userId = user.id;
    req.session.isAdmin = !!user.is_admin;
    await saveSession(req);

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        nickname: user.nickname || '',
        email: user.email,
        is_admin: !!user.is_admin,
      },
    });
  } catch (err) {
    console.error('TG auth error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ===== Регистрация через Telegram Login Widget =====
// Пользователь выбирает «Через Telegram»: виджет присылает authResult, мы сохраняем
// его неизменяемый Telegram ID (tg_id) и пароль — аккаунт переживает смену @username.
// Email необязателен и вводится БЕЗ подтверждения кодом: он нужен только для
// восстановления через «Забыли пароль?».
app.post('/api/auth/tg-register', async (req, res) => {
  try {
    const { authResult, password, email } = req.body || {};
    const v = tgBot.validateLoginWidget(authResult);
    if (!v.ok) return res.json({ error: v.error });
    const tgUser = v.user;
    const tgId = tgUser.id;

    if (!password || String(password).length < 6) {
      return res.json({ error: 'Пароль должен быть минимум 6 символов' });
    }
    const emailClean = String(email || '').trim().toLowerCase();
    if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.json({ error: 'Введите корректный email' });
    }

    const fallbackEmail = tgBot.emailForTgUser({ id: tgId });
    const hash = await bcrypt.hash(password, 10);

    let user = await db.get('SELECT id, email, password, name, is_admin FROM users WHERE tg_id = $1', [tgId]);
    if (!user) user = await db.get('SELECT id, email, password, name, is_admin FROM users WHERE email = $1', [fallbackEmail]);

    // Уже полноценный аккаунт (с паролем) — пусть входит через «Войти через Telegram».
    if (user && user.password) {
      return res.json({ error: 'Этот Telegram уже зарегистрирован. Войдите через «Войти через Telegram».' });
    }

    // Email занят другим аккаунтом — привязывать нельзя.
    if (emailClean) {
      const clash = await db.get('SELECT id FROM users WHERE email = $1 AND id <> $2', [emailClean, user ? user.id : -1]);
      if (clash) return res.json({ error: 'Этот email уже зарегистрирован. Войдите через него.' });
    }

    let saved;
    if (user) {
      // Доводим до конца регистрацию посетителя мини-маркета (был tg<id>@telegram.local без пароля).
      await db.run(
        'UPDATE users SET tg_id = $1, password = $2, email = COALESCE(NULLIF($3, \'\'), email), email_verified = 1 WHERE id = $4',
        [tgId, hash, emailClean, user.id]
      );
      saved = await db.get('SELECT id, name, email, is_admin FROM users WHERE id = $1', [user.id]);
    } else {
      const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() || ('Telegram ' + tgId);
      const nickname = tgUser.username || '';
      const insertEmail = emailClean || fallbackEmail;
      await db.run(
        'INSERT INTO users (name, nickname, email, password, is_admin, email_verified, tg_id, created_at) VALUES ($1, $2, $3, $4, 0, 1, $5, $6)',
        [name, nickname, insertEmail, hash, tgId, new Date().toISOString()]
      );
      saved = await db.get('SELECT id, name, email, is_admin FROM users WHERE tg_id = $1', [tgId]);

      // Telegram-уведомление админу о новой регистрации. Await обязателен (Vercel).
      if (process.env.ADMIN_TG_CHAT_ID) {
        try {
          await tgBot.notifyAdmin(
            '👤 Новый пользователь (Telegram-регистрация)\nИмя: ' + name
            + (nickname ? '\nUsername: @' + nickname : '')
            + (emailClean ? '\nEmail: ' + emailClean : ''),
            tgAdminKeyboard()
          );
        } catch (err) {
          console.error('TG notifyAdmin (tg-register) error:', err);
        }
      }
    }

    req.session.userId = saved.id;
    req.session.isAdmin = saved.is_admin === 1;
    await saveSession(req);

    res.json({
      ok: true,
      registered: true,
      user: { id: saved.id, name: saved.name, email: saved.email, is_admin: !!saved.is_admin },
    });
  } catch (err) {
    console.error('TG register error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Вход через Telegram Login Widget
app.post('/api/auth/tg-login', async (req, res) => {
  try {
    const { authResult } = req.body || {};
    const v = tgBot.validateLoginWidget(authResult);
    if (!v.ok) return res.json({ error: v.error });
    const tgUser = v.user;
    const tgId = tgUser.id;

    const user = await db.get(
      'SELECT id, name, email, is_admin, email_verified FROM users WHERE tg_id = $1 OR email = $2',
      [tgId, tgBot.emailForTgUser({ id: tgId })]
    );
    if (!user) {
      return res.json({ error: 'Аккаунт не найден. Сначала зарегистрируйтесь через Telegram.', not_found: true });
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;
    await saveSession(req);

    res.json({ ok: true, is_admin: user.is_admin === 1, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
  } catch (err) {
    console.error('TG login error:', err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// Статус Telegram-интеграции (админ)
app.get('/api/tg/status', requireAdmin, async (req, res) => {
  try {
    const token = tgBot.getToken();
    if (!token) return res.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан' });

    const me = await tgBot.getMe();
    const webhook = await tgBot.getWebhookInfo();

    res.json({
      ok: true,
      tokenSet: true,
      bot: me.ok ? me.result : null,
      botError: me.ok ? null : me.error,
      webhook: webhook.ok ? {
        url: webhook.result.url,
        pendingUpdateCount: webhook.result.pending_update_count || 0,
        lastError: webhook.result.last_error_message || null,
      } : null,
      webhookError: webhook.ok ? null : webhook.error,
      adminChatSet: !!process.env.ADMIN_TG_CHAT_ID,
      adminChatId: process.env.ADMIN_TG_CHAT_ID || null,
      siteBase: tgBot.SITE_BASE,
      webhookUrl: tgBot.SITE_BASE + '/api/tg/webhook',
    });
  } catch (err) {
    console.error('TG status error:', err);
    res.json({ ok: false, error: err.message });
  }
});

// Зарегистрировать вебхук (админ)
app.post('/api/tg/register-webhook', requireAdmin, async (req, res) => {
  const r = await tgBot.registerWebhook();
  res.json(r);
});

// Тестовое уведомление в Telegram-чат администратора (админ)
app.post('/api/tg/test-notify', requireAdmin, async (req, res) => {
  const r = await tgBot.notifyAdmin('✅ Тестовое уведомление из SMS Light. Канал Telegram работает!');
  res.json(r);
});

// ===== Global error handler (всегда отдаёт JSON, не HTML) =====
app.use((err, req, res, _next) => {
  console.error('✖ Unhandled error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: err.message || 'Внутренняя ошибка сервера' });
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
