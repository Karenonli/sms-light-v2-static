// auth.js — клиентская авторизация (гибрид: сервер API + localStorage)
// Для обратной совместимости с localStorage-кодом (profile.js, data.js, admin.html)

(function() {
  var SESSION_KEY = 'sms_session';

  window.Auth = {
    // ===== Users (админка: с сервера) =====
    getUsers: function() {
      // Синхронное fallback: если нет сессии, возвращаем пустой массив
      // Админка вызывает перезагрузку через loadUsers() — async
      return [];
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
      // Сервер автоматически создаёт mikoto_11@list.ru при старте
    },

    // ===== Navbar =====
    updateNav: function() {
      this.refreshSession();
      var session = this.getSession();
      var container = document.getElementById('navAuth');
      if (!container) return;

      if (session) {
        var safeName = (session.nickname || session.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // Desktop dropdown in header actions
        var menuEl = document.getElementById('userMenu');
        if (menuEl) {
          var ddHtml = '<div class="user-dropdown" id="userDropdown">' +
            '<button class="user-dropdown__trigger" onclick="Auth.toggleDropdown(event)">' +
              '<span class="user-dropdown__avatar">👤</span>' +
              '<span class="user-dropdown__name">' + safeName + '</span>' +
              '<span class="user-dropdown__arrow">▼</span>' +
            '</button>' +
            '<div class="user-dropdown__menu" id="userDropdownMenu">' +
              '<div class="user-dropdown__header">' + safeName + '</div>';
          if (session.is_admin) {
            ddHtml += '<a href="admin.html" class="user-dropdown__item">⚙ Админка</a>';
          }
          ddHtml += '<div class="user-dropdown__item" onclick="Profile.toggleDrawer()">📋 Личный кабинет</div>' +
              '<div class="user-dropdown__divider"></div>' +
              '<div class="user-dropdown__item user-dropdown__item--danger" onclick="Auth.logout()">🚪 Выйти</div>' +
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
