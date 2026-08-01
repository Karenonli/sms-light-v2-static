// auth.js — клиентская авторизация (гибрид: сервер API + localStorage)
// Для обратной совместимости с localStorage-кодом (profile.js, data.js, admin.html)

(function() {
  var SESSION_KEY = 'sms_session';

  window.Auth = {
    // ===== Users (админка: с сервера) =====
    _usersCache: null,
    getUsers: function() {
      // Сначала in-memory кэш, затем localStorage (заполняется syncUsers)
      if (this._usersCache) return this._usersCache;
      try {
        var arr = JSON.parse(localStorage.getItem('sms_users')) || [];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && typeof arr[i].is_admin === 'boolean') arr[i].is_admin = arr[i].is_admin ? 1 : 0;
        }
        return arr;
      }
      catch(e) { return []; }
    },
    // Загрузка списка пользователей с сервера (для чата). В демо-режиме file:// — локальные пользователи.
    syncUsers: function() {
      var self = this;
      return fetch('/api/users')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var users = data.users || [];
          self._usersCache = users;
          try { localStorage.setItem('sms_users', JSON.stringify(users)); } catch(e) {}
          if (typeof window.Data !== 'undefined' && window.Data.cacheAdminId) {
            window.Data.cacheAdminId(users);
          }
          return users;
        })
        .catch(function() {
          // file:// или офлайн — берём локальных пользователей демо-режима
          var local = [];
          try {
            var map = JSON.parse(localStorage.getItem(self.LOCAL_USERS_KEY)) || {};
            for (var k in map) {
              if (!map.hasOwnProperty(k)) continue;
              var u = map[k];
              u.id = parseInt(u.id);
              if (isNaN(u.id)) continue;
              local.push({ id: u.id, name: u.name, nickname: u.nickname || '', is_admin: u.is_admin ? 1 : 0 });
            }
          } catch(e) {}
          if (local.length) {
            self._usersCache = local;
            try { localStorage.setItem('sms_users', JSON.stringify(local)); } catch(e2) {}
            if (typeof window.Data !== 'undefined' && window.Data.cacheAdminId) {
              window.Data.cacheAdminId(local);
            }
          }
          return local;
        });
    },

    // ===== Session =====
    getSession: function() {
      try {
        var s = localStorage.getItem(SESSION_KEY);
        return s ? JSON.parse(s) : null;
      } catch(e) { return null; }
    },

    setSession: function(user) {
      if (!user) return;
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: user.id,
        name: user.name,
        nickname: user.nickname || '',
        email: user.email,
        is_admin: user.is_admin
      }));
    },

    clearSession: function() {
      localStorage.removeItem(SESSION_KEY);
    },

    // ===== Локальный демо-режим (file://) =====
    // Когда страница открыта через file://, fetch('/api/*') не работает.
    // Тогда регистрация/вход работают на localStorage — сайт остаётся «живым».
    LOCAL_USERS_KEY: 'sms_local_users',
    LOCAL_CODES_KEY: 'sms_local_codes',

    isLocalMode: function() {
      return location.protocol === 'file:';
    },

    getLocalUsers: function() {
      try { return JSON.parse(localStorage.getItem(this.LOCAL_USERS_KEY)) || {}; }
      catch(e) { return {}; }
    },
    setLocalUsers: function(users) {
      try { localStorage.setItem(this.LOCAL_USERS_KEY, JSON.stringify(users)); } catch(e) {}
    },
    getLocalCodes: function() {
      try { return JSON.parse(localStorage.getItem(this.LOCAL_CODES_KEY)) || {}; }
      catch(e) { return {}; }
    },
    setLocalCodes: function(codes) {
      try { localStorage.setItem(this.LOCAL_CODES_KEY, JSON.stringify(codes)); } catch(e) {}
    },
    _genCode: function() {
      var s = '';
      for (var i = 0; i < 6; i++) s += Math.floor(Math.random() * 10);
      return s;
    },

    _isAdminEmail: function(email) {
      var e = (email || '').trim().toLowerCase();
      return ['justxirrez@inbox.ru', 'mikoto_11@list.ru'].indexOf(e) !== -1;
    },

    localRegister: function(name, email, password) {
      var users = this.getLocalUsers();
      email = (email || '').trim().toLowerCase();
      if (users[email]) return { error: 'Пользователь с таким email уже существует' };
      var user = {
        id: Date.now(),
        name: name,
        nickname: '',
        email: email,
        password: password,
        is_admin: this._isAdminEmail(email),
        verified: false,
        created_at: new Date().toISOString()
      };
      users[email] = user;
      this.setLocalUsers(users);
      var code = this._genCode();
      var codes = this.getLocalCodes();
      codes[email] = code;
      this.setLocalCodes(codes);
      return { ok: true, dev_code: code };
    },

    localVerify: function(email, code) {
      email = (email || '').trim().toLowerCase();
      var codes = this.getLocalCodes();
      if (!codes[email] || codes[email] !== (code || '').trim()) {
        return { error: 'Неверный код подтверждения' };
      }
      delete codes[email];
      this.setLocalCodes(codes);
      var users = this.getLocalUsers();
      var u = users[email];
      if (!u) return { error: 'Пользователь не найден' };
      u.verified = true;
      this.setLocalUsers(users);
      var user = { id: u.id, name: u.name, nickname: u.nickname || '', email: u.email, is_admin: !!u.is_admin || this._isAdminEmail(u.email) };
      this.setSession(user);
      return { ok: true, user: user };
    },

    localLogin: function(email, password) {
      email = (email || '').trim().toLowerCase();
      var users = this.getLocalUsers();
      var u = users[email];
      if (!u || u.password !== password) return { error: 'Неверный email или пароль' };
      if (!u.verified) {
        var res = { error: 'Email не подтверждён', needs_verification: true, email: u.email };
        var codes = this.getLocalCodes();
        if (codes[u.email]) res.dev_code = codes[u.email];
        return res;
      }
      var user = { id: u.id, name: u.name, nickname: u.nickname || '', email: u.email, is_admin: !!u.is_admin || this._isAdminEmail(u.email) };
      this.setSession(user);
      return { ok: true, user: user };
    },

    localForgot: function(email) {
      email = (email || '').trim().toLowerCase();
      var users = this.getLocalUsers();
      var u = users[email];
      if (!u) return { error: 'Пользователь с таким email не найден' };
      var code = this._genCode();
      var codes = this.getLocalCodes();
      codes[email] = code;
      this.setLocalCodes(codes);
      return { ok: true, dev_code: code };
    },

    localReset: function(email, code, password) {
      email = (email || '').trim().toLowerCase();
      var codes = this.getLocalCodes();
      if (!codes[email] || codes[email] !== (code || '').trim()) {
        return { error: 'Неверный код' };
      }
      delete codes[email];
      this.setLocalCodes(codes);
      var users = this.getLocalUsers();
      var u = users[email];
      if (!u) return { error: 'Пользователь не найден' };
      u.password = password;
      this.setLocalUsers(users);
      return { ok: true };
    },

    // ===== Register (сервер) =====
    register: function(name, email, password) {
      // Устаревший синхронный метод — теперь используйте fetch('/api/auth/register')
      // Возвращаем заглушку для обратной совместимости
      return { error: 'Используйте новую форму регистрации' };
    },

    // ===== Login (сервер) =====
    login: function(email, password) {
      // Устаревший синхронный метод — теперь используйте fetch('/api/auth/login')
      return { error: 'Используйте новую форму входа' };
    },

    // ===== Logout (сервер) =====
    logout: function() {
      var self = this;
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(function() {})
        .finally(function() {
          self.clearSession();
          location.reload();
        });
    },

    // ===== Refresh session from server =====
    refreshSession: function() {
      // Проверяем сессию на сервере
      var self = this;
      fetch('/api/auth/me')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.authed) {
            self.setSession(data);
          } else {
            self.clearSession();
          }
        })
        .catch(function() {});
      return this.getSession();
    },

    // ===== Admin: delete user (сервер) =====
    deleteUser: function(id) {
      // Раньше был синхронный — теперь возвращаем промис
      return fetch('/api/admin/users/' + id, { method: 'DELETE' })
        .then(function(r) { return r.json(); });
    },

    // ===== Seed admins (больше не нужно — сервер сам создаёт) =====
    seedAdmin: function() {
      // Админы: justxirrez@inbox.ru и mikoto_11@list.ru — создаются/повышаются в initDb (server) и localRegister (file://)
    },

    // ===== Navbar =====
    updateNav: function() {
      this.refreshSession();
      var session = this.getSession();
      var container = document.getElementById('navAuth');
      if (!container) return;

      if (session) {
        var safeName = (session.nickname || session.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var safeEmail = (session.email || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var initial = (safeName || '?').charAt(0).toUpperCase();

        // Desktop dropdown in header actions
        var menuEl = document.getElementById('userMenu');
        if (menuEl) {
          var ddHtml = '<div class="user-dropdown" id="userDropdown">' +
            '<button class="user-dropdown__trigger" onclick="Auth.toggleDropdown(event)">' +
              '<span class="user-dropdown__avatar">' + initial + '</span>' +
              '<span class="user-dropdown__name">' + safeName + '</span>' +
              '<svg class="user-dropdown__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
            '</button>' +
            '<div class="user-dropdown__menu" id="userDropdownMenu">' +
              '<div class="user-dropdown__header">' +
                '<span class="user-dropdown__header-avatar">' + initial + '</span>' +
                '<span class="user-dropdown__header-meta">' +
                  '<span class="user-dropdown__header-name">' + safeName + '</span>' +
                  '<span class="user-dropdown__header-email">' + safeEmail + '</span>' +
                '</span>' +
              '</div>' +
              '<div class="user-dropdown__divider"></div>';
          if (session.is_admin) {
            ddHtml += '<a href="admin.html" class="user-dropdown__item">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
                '<span>Админка</span></a>';
          }
          ddHtml += '<div class="user-dropdown__item" onclick="Profile.toggleDrawer()">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>' +
                '<span>Личный кабинет</span></div>' +
              '<div class="user-dropdown__divider"></div>' +
              '<div class="user-dropdown__item user-dropdown__item--danger" onclick="Auth.logout()">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>' +
                '<span>Выйти</span></div>' +
            '</div>' +
          '</div>';
          menuEl.innerHTML = ddHtml;
        }

        // Mobile nav (совпадает с брейкпоинтом бургера в style.css)
        var isMobile = window.innerWidth <= 1024;
        var html = '';
        if (isMobile) {
          if (session.is_admin) {
            html += '<a href="admin.html" class="nav__link nav__link--admin" id="navAdminLink">Админка</a>';
          }
          html += '<span class="nav__user">' + safeName + '</span>';
          html += '<button class="btn btn--sm" onclick="Auth.logout()">Выйти</button>';
        }
        container.innerHTML = html;
      } else {
        var menuEl = document.getElementById('userMenu');
        if (menuEl) menuEl.innerHTML = '';
      }
    },

    // ===== User dropdown toggle =====
    toggleDropdown: function(e) {
      if (e) e.stopPropagation();
      var dd = document.getElementById('userDropdown');
      if (dd) dd.classList.toggle('open');
    },

    closeDropdown: function() {
      var dd = document.getElementById('userDropdown');
      if (dd) dd.classList.remove('open');
    },

    // ===== Theme =====
    THEME_KEY: 'sms_theme',
    getTheme: function() {
      return localStorage.getItem(this.THEME_KEY) || 'dark';
    },
    setTheme: function(theme) {
      localStorage.setItem(this.THEME_KEY, theme);
      document.documentElement.setAttribute('data-theme', theme);
    },
    toggleTheme: function() {
      var current = this.getTheme();
      this.setTheme(current === 'dark' ? 'light' : 'dark');
    },
    applyTheme: function() {
      var theme = this.getTheme();
      document.documentElement.setAttribute('data-theme', theme);
    }
  };

  // Apply saved theme
  Auth.applyTheme();

  // On DOM ready
  function onReady() {
    Auth.updateNav();
    document.addEventListener('click', function(e) {
      var dd = document.getElementById('userDropdown');
      if (dd && dd.classList.contains('open')) {
        var trigger = dd.querySelector('.user-dropdown__trigger');
        if (trigger && !trigger.contains(e.target)) {
          Auth.closeDropdown();
        }
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
