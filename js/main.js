// main.js — глобальные скрипты (бургер, scroll-reveal, уведомления)
(function() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  function ready() {
    // Burger menu toggle
    var burger = document.getElementById('burger');
    var nav = document.getElementById('nav');
    if (burger && nav) {
      burger.addEventListener('click', function() {
        nav.classList.toggle('nav--open');
      });
      document.addEventListener('click', function(e) {
        if (!nav.contains(e.target) && !burger.contains(e.target)) {
          nav.classList.remove('nav--open');
        }
      });
    }

    // Scroll-triggered reveal
    initScrollReveal();

    // Admin notifications (если вошли как админ)
    initNotifications();
  }

  function initScrollReveal() {
    if (!window.IntersectionObserver) return;
    var targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          var items = entry.target.querySelectorAll('.reveal-item');
          items.forEach(function(item, i) {
            setTimeout(function() { item.classList.add('visible'); }, i * 60);
          });
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(function(el) { observer.observe(el); });
  }

  // ============================
  // Notification system (admin)
  // ============================
  var NOTIFY_KEY = 'sms_notify_state';
  var notifyTimer = null;

  function getNotifyState() {
    try { return JSON.parse(localStorage.getItem(NOTIFY_KEY)) || {}; }
    catch(e) { return {}; }
  }

  function saveNotifyState(state) {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(state));
  }

  function initNotifications() {
    if (typeof Auth === 'undefined' || typeof Data === 'undefined') return;
    Auth.refreshSession();
    var session = Auth.getSession();
    if (!session || !session.is_admin) return;

    // Создаём контейнер для тостов
    if (!document.getElementById('toastContainer')) {
      var container = document.createElement('div');
      container.className = 'toast-container';
      container.id = 'toastContainer';
      document.body.appendChild(container);
    }

    // При первом запуске — запоминаем текущие счётчики, но не уведомляем
    var state = getNotifyState();
    var adminId = session.id;
    if (!state[adminId]) {
      state[adminId] = {
        users: Auth.getUsers().length,
        purchases: Data.getAllPurchases().length
      };
      saveNotifyState(state);
    }

    // Поллинг каждые 6 секунд
    if (notifyTimer) clearInterval(notifyTimer);
    notifyTimer = setInterval(checkNotifications, 6000);
  }

  function checkNotifications() {
    var session = Auth.getSession();
    if (!session || !session.is_admin) return;

    var state = getNotifyState();
    var adminId = session.id;
    if (!state[adminId]) return;

    var s = state[adminId];
    var users = Auth.getUsers();
    var purchases = Data.getAllPurchases();

    // Новые пользователи
    if (users.length > s.users) {
      var newCount = users.length - s.users;
      var lastUser = users[users.length - 1];
      var title = 'Новый пользователь';
      var text = esc(lastUser.name) + ' (' + esc(lastUser.email) + ')';
      showToast('👤', title, text, newCount);
      s.users = users.length;
    }

    // Новые покупки
    if (purchases.length > s.purchases) {
      var newPurchases = purchases.length - s.purchases;
      if (purchases.length > 0) {
        var lastP = purchases[0];
        var title2 = 'Новая покупка';
        var text2 = lastP.serviceName + ' (' + lastP.country + ') — ' + lastP.price + ' ' + lastP.currency;
        showToast('🛒', title2, text2, newPurchases);
      }
      s.purchases = purchases.length;
    }

    // Новые чат-сообщения (непрочитанные)
    var unread = Data.getUnreadCount(session.id);
    var prevUnread = s.unread || 0;
    if (unread > prevUnread) {
      var diff = unread - prevUnread;
      showToast('💬', 'Новое сообщение', diff + ' непрочитанных в чатах', diff > 1 ? diff : 0);
      s.unread = unread;
    }
    if (!s.unread) s.unread = unread;

    saveNotifyState(state);
  }

  function showToast(icon, title, text, extra) {
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast';

    var titleHtml = title;
    if (extra > 1) {
      titleHtml = title + ' <span style="font-weight:400;color:#888;font-size:12px">(+' + (extra - 1) + ' ещё)</span>';
    }

    toast.innerHTML =
      '<div class="toast__icon">' + icon + '</div>' +
      '<div class="toast__body">' +
        '<div class="toast__title">' + titleHtml + '</div>' +
        '<div class="toast__text">' + text + '</div>' +
      '</div>';

    container.appendChild(toast);

    requestAnimationFrame(function() {
      toast.classList.add('visible');
    });

    setTimeout(function() {
      toast.classList.remove('visible');
      setTimeout(function() { toast.remove(); }, 300);
    }, 5000);
  }

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

})();
