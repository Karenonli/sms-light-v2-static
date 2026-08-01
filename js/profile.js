// profile.js — Личный кабинет (боковой drawer)

window.Profile = (function() {
  var drawerEl = null;
  var overlayEl = null;
  var isOpen = false;
  var session = null;
  var currentSection = 'telegram';
  var chatPollTimer = null;

  // Все страны — динамически из Data
  function getAllCountries() {
    if (typeof Data !== 'undefined' && Data.getCountries) {
      return Data.getCountries();
    }
    return [];
  }

  // ========== Создание DOM ==========
  function createDrawer() {
    if (document.getElementById('profileDrawer')) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'profileOverlay';
    overlayEl.className = 'profile-overlay';
    overlayEl.addEventListener('click', closeDrawer);

    drawerEl = document.createElement('div');
    drawerEl.id = 'profileDrawer';
    drawerEl.className = 'profile-drawer';

    drawerEl.innerHTML =
      '<div class="profile-drawer__header">' +
        '<span class="profile-drawer__title">Личный кабинет</span>' +
        '<button class="profile-drawer__close" id="profileClose" aria-label="Закрыть">✕</button>' +
      '</div>' +
      '<div class="profile-drawer__body" id="profileBody">' +
        '<div class="profile-section active" id="profileSec-telegram"></div>' +
        '<div class="profile-section" id="profileSec-virtual"></div>' +
        '<div class="profile-section" id="profileSec-support"></div>' +
        '<div class="profile-section" id="profileSec-balance"></div>' +
      '</div>' +
      '<div class="profile-drawer__tabs">' +
        '<button class="profile-tab active" data-section="telegram">📱 Telegram</button>' +
        '<button class="profile-tab" data-section="virtual">🌐 Виртуальные</button>' +
        '<button class="profile-tab" data-section="support">Чат</button>' +
        '<button class="profile-tab" data-section="balance">Баланс</button>' +
      '</div>';

    document.body.appendChild(overlayEl);
    document.body.appendChild(drawerEl);

    // Tab switching
    drawerEl.querySelectorAll('.profile-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        switchSection(this.dataset.section);
      });
    });

    document.getElementById('profileClose').addEventListener('click', closeDrawer);
  }

  function switchSection(name) {
    currentSection = name;
    drawerEl.querySelectorAll('.profile-tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.section === name);
    });
    drawerEl.querySelectorAll('.profile-section').forEach(function(s) {
      s.classList.toggle('active', s.id === 'profileSec-' + name);
    });
    renderSection(name);
  }

  function openDrawer() {
    session = Auth.getSession();
    if (!session) return;
    isOpen = true;
    createDrawer();
    overlayEl.classList.add('visible');
    drawerEl.classList.add('open');
    document.body.style.overflow = 'hidden';
    switchSection(currentSection);
    startChatPoll();
  }

  function closeDrawer() {
    isOpen = false;
    if (overlayEl) overlayEl.classList.remove('visible');
    if (drawerEl) drawerEl.classList.remove('open');
    document.body.style.overflow = '';
    stopChatPoll();
  }

  function toggleDrawer() {
    if (isOpen) { closeDrawer(); }
    else { openDrawer(); }
  }

  // ========== Рендер секций ==========
  function renderSection(name) {
    if (!session) return;
    switch (name) {
      case 'telegram': renderTelegram(); break;
      case 'virtual': renderVirtual(); break;
      case 'support': renderChat(); break;
      case 'balance': renderBalance(); break;
    }
  }

  // --- Telegram Numbers ---
  function renderTelegram() {
    var el = document.getElementById('profileSec-telegram');
    if (!el) return;
    var purchases = Data.getPurchases(session.id).filter(function(p) { return p.serviceType === 'telegram'; });

    var html = '<div class="profile-section__header"><h3>📱 Номера Telegram</h3></div>';

    html += '<div class="profile-purchases">';
    if (purchases.length === 0) {
      html += '<div class="profile-empty">У вас пока нет заказов Telegram</div>';
    } else {
      purchases.forEach(function(p) {
        html += renderPurchaseCard(p);
      });
    }
    html += '</div>';

    html += '<button class="btn btn--full" onclick="Profile.openOrderModal(\'telegram\')" style="margin-top:16px">+ Заказать номер Telegram</button>';
    el.innerHTML = html;
  }

  // --- Virtual Numbers ---
  function renderVirtual() {
    var el = document.getElementById('profileSec-virtual');
    if (!el) return;
    var purchases = Data.getPurchases(session.id).filter(function(p) { return p.serviceType === 'virtual'; });

    var html = '<div class="profile-section__header"><h3>🌐 Виртуальные номера</h3></div>';

    html += '<div class="profile-purchases">';
    if (purchases.length === 0) {
      html += '<div class="profile-empty">У вас пока нет заказов виртуальных номеров</div>';
    } else {
      purchases.forEach(function(p) {
        html += renderPurchaseCard(p);
      });
    }
    html += '</div>';

    html += '<button class="btn btn--full" onclick="Profile.openOrderModal(\'virtual\')" style="margin-top:16px">+ Заказать виртуальный номер</button>';
    el.innerHTML = html;
  }

  function renderPurchaseCard(p) {
    var statusClass = 'status-' + p.status;
    var statusText = p.status === 'completed' ? 'Завершён' : p.status === 'rejected' ? 'Отклонён' : 'Ожидает';
    var date = new Date(p.created_at).toLocaleString('ru-RU', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    var phoneHtml = p.phoneNumber ? '<span class="purchase__phone">' + p.phoneNumber + '</span>' : '<span class="purchase__phone purchase__phone--empty">—</span>';
    var countryFlag = (typeof Data !== 'undefined' ? Data.getCountryFlag(p.country) : '🌍') + ' ';

    return '<div class="purchase-card ' + statusClass + '">' +
      '<div class="purchase__top">' +
        '<span class="purchase__service">' + esc(p.serviceName) + '</span>' +
        '<span class="purchase__status ' + statusClass + '">' + statusText + '</span>' +
      '</div>' +
      '<div class="purchase__details">' +
        '<span>' + countryFlag + esc(p.country) + '</span>' +
        '<span>' + phoneHtml + '</span>' +
        '<span>' + p.price + ' ' + p.currency + '</span>' +
      '</div>' +
      '<div class="purchase__date">' + date + '</div>' +
    '</div>';
  }

  // ========== Order Modal ==========
  function openOrderModal(type) {
    session = Auth.getSession();
    if (!session) { alert('Необходимо авторизоваться'); return; }

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var modal = document.createElement('div');
    modal.className = 'modal';

    var title = type === 'telegram' ? 'Номер Telegram' : 'Виртуальный номер';
    var services = type === 'telegram'
      ? [{ name: 'Telegram', price: 49 }]
      : [
          { name: 'WhatsApp', price: 39 },
          { name: 'Binance', price: 79 },
          { name: 'Instagram', price: 49 },
          { name: 'TikTok', price: 55 },
          { name: 'Google', price: 45 },
          { name: 'Facebook', price: 39 }
        ];

    var countries = getAllCountries();
    var countryOptions = countries.map(function(c) {
      return '<option value="' + c.name + '">' + c.flag + ' ' + c.name + ' (' + c.code + ')</option>';
    }).join('');

    var serviceOptions = services.map(function(s) {
      return '<option value="' + s.name + '" data-price="' + s.price + '">' + s.name + ' — ' + s.price + ' ₽</option>';
    }).join('');

    modal.innerHTML =
      '<div class="modal__header">' +
        '<h3>Заказать ' + title + '</h3>' +
        '<button class="modal__close" id="modalClose">✕</button>' +
      '</div>' +
      '<div class="modal__body">' +
        '<div class="form-group">' +
          '<label>Сервис</label>' +
          '<select id="modalService" class="form-input">' + serviceOptions + '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Страна</label>' +
          '<select id="modalCountry" class="form-input">' + countryOptions + '</select>' +
        '</div>' +
        '<div class="modal__price">' +
          '<span>Стоимость: </span>' +
          '<strong id="modalPrice">' + services[0].price + ' ₽</strong>' +
        '</div>' +
      '</div>' +
      '<div class="modal__footer">' +
        '<button class="btn btn--outline" id="modalCancel">Отмена</button>' +
        '<button class="btn" id="modalConfirm">Заказать</button>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    overlay.classList.add('visible');
    modal.classList.add('open');

    var serviceSelect = document.getElementById('modalService');
    if (serviceSelect) {
      serviceSelect.addEventListener('change', function() {
        var opt = this.options[this.selectedIndex];
        var price = opt ? opt.dataset.price : services[0].price;
        document.getElementById('modalPrice').textContent = price + ' ₽';
      });
    }

    function closeModal() {
      overlay.classList.remove('visible');
      modal.classList.remove('open');
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }, 300);
    }

    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    document.getElementById('modalConfirm').addEventListener('click', function() {
      var service = document.getElementById('modalService').value;
      var country = document.getElementById('modalCountry').value;
      var price = parseInt(document.getElementById('modalPrice').textContent);
      Data.createPurchase(session.id, type, service, country, price, 'RUB');
      closeModal();
      renderSection(type);
    });
  }

  // --- Chat Section ---
  function renderChat() {
    var el = document.getElementById('profileSec-support');
    if (!el || !session) return;

    // Администратор видит список чатов с пользователями
    if (session.is_admin) {
      renderAdminChatList(el);
      return;
    }

    var adminId = getAdminId();
    if (!adminId) {
      el.innerHTML = '<div class="profile-section__header"><h3>Чат с администратором</h3></div>' +
        '<div class="profile-empty">Нет администратора. Дождитесь регистрации администратора.</div>';
      return;
    }

    var messages = Data.getConversation(session.id, adminId);
    Data.markConversationRead(session.id, adminId);
    if (typeof ChatServer !== 'undefined') ChatServer.markRead(session.id, adminId);

    var html = '<div class="profile-section__header"><h3>Чат с администратором</h3>' +
      '<span class="profile-online">● В сети</span></div>';

    html += '<div class="chat-messages" id="chatMessages">';
    if (messages.length === 0) {
      html += '<div class="chat-empty">Напишите администратору. Он ответит в ближайшее время.</div>';
    } else {
      messages.forEach(function(m) {
        var isMine = m.senderId === session.id;
        html += '<div class="chat-msg ' + (isMine ? 'chat-msg--mine' : 'chat-msg--admin') + '">' +
          '<div class="chat-msg__text">' + esc(m.text) + '</div>' +
          '<div class="chat-msg__time">' + formatTime(m.created_at) + '</div>' +
        '</div>';
      });
    }
    html += '<div class="chat-typing" id="chatTyping" style="display:none">' +
      '<span class="chat-typing__dots"><i></i><i></i><i></i></span>' +
      '<span class="chat-typing__text">SMS Light печатает…</span>' +
    '</div></div>';

    html += '<div class="chat-input">' +
      '<input type="text" id="chatInput" class="form-input" placeholder="Напишите сообщение..." autocomplete="off">' +
      '<button class="btn" id="chatSendBtn">Отправить</button>' +
    '</div>';

    el.innerHTML = html;

    // Scroll to bottom
    var msgsEl = document.getElementById('chatMessages');
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    // Send on button click
    document.getElementById('chatSendBtn').addEventListener('click', function() {
      sendChatMessage(session.id, adminId);
    });

    // Send on Enter
    document.getElementById('chatInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage(session.id, adminId);
      }
    });

    document.getElementById('chatInput').focus();
  }

  function sendChatMessage(userId, adminId) {
    var input = document.getElementById('chatInput');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';

    var users = Auth.getUsers();
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) user = users[i];
    }
    if (!user) return;

    Data.sendMessage(userId, user.name, adminId, Data.getAdminName(), text);
    renderChat();
    maybeAutoReply(userId, user.name, adminId, Data.getAdminName());
  }

  // Автоответчик: задержка 2–4 сек + индикатор «SMS Light печатает…» (логика в Data.scheduleAutoReply)
  function maybeAutoReply(userId, userName, adminId, adminName) {
    if (typeof Data === 'undefined' || !Data.scheduleAutoReply) return;
    Data.scheduleAutoReply(userId, userName, adminId, adminName);
  }

  function getAdminId() {
    return (typeof Data !== 'undefined' && Data.getAdminId) ? Data.getAdminId() : null;
  }

  // ===== Индикатор «SMS Light печатает…» (вызывается из Data.scheduleAutoReply) =====
  window.showAdminTyping = function() {
    var d = document.getElementById('chatTyping');
    if (d) d.style.display = 'flex';
    var o = document.getElementById('chatOverlayTyping');
    if (o) o.innerHTML = '<span class="chat-typing__dots"><i></i><i></i><i></i></span><span class="chat-typing__text">SMS Light печатает…</span>';
  };
  window.hideAdminTyping = function() {
    var d = document.getElementById('chatTyping');
    if (d) d.style.display = 'none';
    var o = document.getElementById('chatOverlayTyping');
    if (o) o.innerHTML = '';
  };
  window.refreshActiveChat = function(userId, adminId) {
    if (document.getElementById('chatInput')) renderChat();
    if (document.getElementById('chatOverlayInputField')) renderOverlayMessages(userId, adminId);
  };

  // --- Admin Chat List (в профиле администратора) ---
  function renderAdminChatList(el) {
    var conversations = Data.getAllConversations();
    var html = '<div class="profile-section__header"><h3>Чаты с пользователями</h3></div>';

    if (!conversations || conversations.length === 0) {
      html += '<div class="profile-empty">Нет активных чатов.<br>Пользователи напишут вам после регистрации.</div>';
      el.innerHTML = html;
      return;
    }

    html += '<div class="admin-chat-list">';
    for (var i = 0; i < conversations.length; i++) {
      var c = conversations[i];
      var initial = (c.otherUserName || '?')[0].toUpperCase();
      var preview = c.lastMessage ? c.lastMessage.text : '';
      if (!preview) {
        var pur = Data.getPurchases(c.otherUserId);
        if (pur.length > 0) {
          var lp = pur[0];
          preview = (lp.serviceName || 'Заказ') + (lp.country ? ' · ' + lp.country : '');
        } else {
          preview = 'Нет сообщений';
        }
      }
      var unreadBadge = c.unread > 0
        ? '<span class="admin-chat-badge">' + c.unread + '</span>'
        : '';
      html += '<div class="admin-chat-item" onclick="Profile.openAdminChat(' + c.otherUserId + ')">' +
        '<div class="admin-chat-avatar">' + initial + '</div>' +
        '<div class="admin-chat-info">' +
          '<div class="admin-chat-name">' + esc(c.otherUserName || 'Пользователь') + '</div>' +
          '<div class="admin-chat-preview">' + esc(preview.length > 30 ? preview.slice(0, 30) + '…' : preview) + '</div>' +
        '</div>' +
        unreadBadge +
      '</div>';
    }
    html += '</div>';

    el.innerHTML = html;
  }

  function startChatPoll() {
    stopChatPoll();
    chatPollTimer = setInterval(function() {
      if (!isOpen || currentSection !== 'support') return;
      if (!session) return;

      if (session.is_admin) {
        renderChat();
      } else {
        var adminId = getAdminId();
        if (!adminId) return;
        var messages = Data.getConversation(session.id, adminId);
        var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        if (lastMsg && lastMsg.senderId !== session.id) {
          renderChat();
        }
      }
    }, 2000);
  }

  function stopChatPoll() {
    if (chatPollTimer) {
      clearInterval(chatPollTimer);
      chatPollTimer = null;
    }
  }

  // --- Balance ---
  function renderBalance() {
    var el = document.getElementById('profileSec-balance');
    if (!el) return;
    var balance = Data.getBalance(session.id);
    var purchases = Data.getPurchases(session.id);

    var html = '<div class="profile-section__header"><h3>Баланс</h3></div>';

    // Balance card
    html += '<div class="balance-card">' +
      '<div class="balance-card__label">Текущий баланс</div>' +
      '<div class="balance-card__amount">' + balance.toFixed(2) + ' ₽</div>' +
    '</div>';

    // Top up
    html += '<form id="topupForm" onsubmit="Profile.topUp(event)" class="topup-form">' +
      '<div class="form-group">' +
        '<label>Пополнить баланс</label>' +
        '<div class="topup-input-row">' +
          '<input type="number" id="topupAmount" class="form-input" placeholder="Сумма" min="1" required style="flex:1">' +
          '<button type="submit" class="btn">Пополнить</button>' +
        '</div>' +
      '</div>' +
    '</form>';

    // Purchase history
    html += '<div class="profile-section__subheader">Последние покупки</div>';
    if (purchases.length === 0) {
      html += '<div class="profile-empty">Покупок пока нет</div>';
    } else {
      html += '<div class="purchase-history">';
      purchases.forEach(function(p) {
        var date = new Date(p.created_at).toLocaleString('ru-RU', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
        var statusTxt = p.status === 'completed' ? 'Завершён' : p.status === 'rejected' ? 'Отклонён' : 'Ожидает';
        html += '<div class="purchase-history__row">' +
          '<div class="ph__info">' +
            '<span class="ph__name">' + esc(p.serviceName) + '</span>' +
            '<span class="ph__meta">' + (typeof Data !== 'undefined' ? Data.getCountryFlag(p.country) : '🌍') + ' ' + esc(p.country) + (p.phoneNumber ? ' · ' + p.phoneNumber : '') + '</span>' +
          '</div>' +
          '<div class="ph__right">' +
            '<span class="ph__price">' + p.price + ' ' + p.currency + '</span>' +
            '<span class="ph__status ' + 'status-' + p.status + '">' + statusTxt + '</span>' +
          '</div>' +
          '<div class="ph__date">' + date + '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
  }

  // ========== Actions ==========

  // Order number (called from button)
  function orderNumber(type) {
    openOrderModal(type);
  }

  // Submit support ticket
  function submitTicket(e) {
    e.preventDefault();
    session = Auth.getSession();
    if (!session) { alert('Необходимо авторизоваться'); return; }

    var subject = document.getElementById('supportSubject').value.trim();
    var message = document.getElementById('supportMessage').value.trim();
    if (!subject || !message) { alert('Заполните все поля'); return; }

    Data.createTicket(session.id, session.name, session.email, subject, message);

    // Также отправляем сообщение в чат, чтобы админ его увидел
    var adminId = getAdminId();
    if (adminId) {
      var users = Auth.getUsers();
      var admin = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].id === adminId) { admin = users[i]; break; }
      }
      if (admin) {
        Data.sendMessage(session.id, session.name, adminId, admin.name, subject + ': ' + message);
      }
    }

    renderSection('support');
  }

  // Top up balance
  function topUp(e) {
    e.preventDefault();
    session = Auth.getSession();
    if (!session) return;

    var amount = parseFloat(document.getElementById('topupAmount').value);
    if (isNaN(amount) || amount <= 0) { alert('Введите корректную сумму'); return; }

    Data.topUp(session.id, amount);
    renderSection('balance');
  }

  // ========== Init ==========
  function init() {
  }

  // Utility
  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function formatTime(iso) {
    var d = new Date(iso);
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    var opts = isToday
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleString('ru-RU', opts);
  }

  function openChat() {
    // Если чат уже открыт — закрываем
    if (_chatOverlayEl) {
      closeChatOverlay();
      return;
    }

    session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    // Администратор — показывает список пользователей
    if (session.is_admin) {
      openAdminChatSelector();
      return;
    }

    // Открываем чат с администратором (с загрузкой списка пользователей при необходимости)
    var adminId = getAdminId();
    if (adminId) {
      var users = Auth.getUsers();
      var admin = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].id === adminId) { admin = users[i]; break; }
      }
      if (admin) {
        showChatOverlay(Data.getAdminName(), session.id, adminId, false);
        return;
      }
    }
    // Список пользователей ещё не загружен — подгружаем и повторяем
    Auth.syncUsers().then(function() {
      var adminId2 = getAdminId();
      if (!adminId2) {
        showChatOverlay('Нет администратора', null, null, true);
        return;
      }
      var users2 = Auth.getUsers();
      var admin2 = null;
      for (var i = 0; i < users2.length; i++) {
        if (users2[i].id === adminId2) { admin2 = users2[i]; break; }
      }
      if (!admin2) {
        showChatOverlay('Нет администратора', null, null, true);
        return;
      }
      showChatOverlay(Data.getAdminName(), session.id, adminId2, false);
    });
  }

  // ========== Full-Screen Chat Overlay ==========
  var _chatOverlayEl = null;
  var _chatPollOverlay = null;

  function showChatOverlay(adminName, userId, adminId, isNoAdmin) {
    closeChatOverlay();

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'chat-overlay-backdrop';
    backdrop.id = 'chatOverlayBackdrop';
    backdrop.addEventListener('click', closeChatOverlay);
    document.body.appendChild(backdrop);
    backdrop._keydown = function(e) { if (e.key === 'Escape') closeChatOverlay(); };
    document.addEventListener('keydown', backdrop._keydown);

    var overlay = document.createElement('div');
    overlay.className = 'chat-overlay';
    overlay.id = 'chatOverlay';
    overlay.innerHTML =
      '<div class="chat-overlay__header">' +
        '<div class="chat-overlay__header-left">' +
          '<button class="chat-overlay__back" id="chatOverlayBack">‹</button>' +
          '<div class="chat-overlay__avatar">' + (isNoAdmin ? '?' : 'A') + '</div>' +
          '<div class="chat-overlay__info">' +
            '<h2>' + esc(adminName || 'Администратор') + '</h2>' +
            '<span style="color:#10b981">' + (isNoAdmin ? 'Нет в сети' : '● В сети') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="chat-overlay__badge">Чат поддержки</div>' +
      '</div>' +
      '<div class="chat-overlay__purchases" id="chatOverlayPurchases"></div>' +
      '<div class="chat-overlay__messages" id="chatOverlayMessages">' +
        '<div class="chat-empty">' + (isNoAdmin ? 'Нет администратора. Дождитесь регистрации.' : 'Загрузка...') + '</div>' +
      '</div>' +
      '<div class="chat-overlay__typing" id="chatOverlayTyping"></div>' +
      '<div class="chat-overlay__input" id="chatOverlayInput"' + (isNoAdmin ? ' style="display:none"' : '') + '>' +
        '<input type="text" id="chatOverlayInputField" placeholder="Напишите сообщение..." autocomplete="off">' +
        '<button class="chat-overlay__send" id="chatOverlaySendBtn">Отправить</button>' +
      '</div>';

    document.body.appendChild(overlay);
    _chatOverlayEl = overlay;

    document.getElementById('chatOverlayBack').addEventListener('click', closeChatOverlay);
    document.getElementById('chatOverlaySendBtn').addEventListener('click', function() {
      sendOverlayMessage(userId, adminId);
    });
    document.getElementById('chatOverlayInputField').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); sendOverlayMessage(userId, adminId); }
    });

    if (!isNoAdmin) {
      renderOverlayPurchases(userId);
      renderOverlayMessages(userId, adminId);
      document.getElementById('chatOverlayInputField').focus();
      startOverlayPoll(userId, adminId);
    }

  }
  function closeChatOverlay() {
    if (_chatPollOverlay) {
      clearInterval(_chatPollOverlay);
      _chatPollOverlay = null;
    }
    var backdrop = document.getElementById('chatOverlayBackdrop');
    if (backdrop) {
      if (backdrop._keydown) document.removeEventListener('keydown', backdrop._keydown);
      backdrop.remove();
    }
    if (_chatOverlayEl) {
      _chatOverlayEl.remove();
      _chatOverlayEl = null;
    }
  }

  // ========== Admin Chat Overlay (админ → пользователь) ==========
  function openAdminChatSelector() {
    closeChatOverlay();

    var backdrop = document.createElement('div');
    backdrop.className = 'chat-overlay-backdrop';
    backdrop.id = 'chatOverlayBackdrop';
    backdrop.addEventListener('click', closeChatOverlay);
    document.body.appendChild(backdrop);
    backdrop._keydown = function(e) { if (e.key === 'Escape') closeChatOverlay(); };
    document.addEventListener('keydown', backdrop._keydown);

    var conversations = Data.getAllConversations();
    var listHtml = '<div style="flex:1;overflow-y:auto;padding:8px 0">';
    if (!conversations || conversations.length === 0) {
      listHtml = '<div style="flex:1;overflow-y:auto;padding:8px 0"><div class="chat-empty" style="padding:60px 20px">Нет активных чатов.<br>Пользователи напишут вам после регистрации.</div></div>';
    } else {
      for (var i = 0; i < conversations.length; i++) {
        var c = conversations[i];
        var initial = (c.otherUserName || '?')[0].toUpperCase();
        var preview = c.lastMessage ? c.lastMessage.text : '';
        if (!preview) {
          var pur = Data.getPurchases(c.otherUserId);
          if (pur.length > 0) {
            var lp = pur[0];
            preview = (lp.serviceName || 'Заказ') + (lp.country ? ' · ' + lp.country : '');
          } else {
            preview = 'Нет сообщений';
          }
        }
        var unreadBadge = c.unread > 0
          ? '<span class="chat-list__unread" style="display:inline-flex;margin-left:auto">' + c.unread + '</span>'
          : '';
        listHtml += '<div class="admin-chat-item" onclick="Profile.openAdminChat(' + c.otherUserId + ')" style="border-bottom:1px solid var(--card-border,#222)">' +
          '<div class="admin-chat-avatar">' + initial + '</div>' +
          '<div class="admin-chat-info">' +
            '<div class="admin-chat-name">' + esc(c.otherUserName || 'Пользователь') + '</div>' +
            '<div class="admin-chat-preview">' + esc(preview.length > 40 ? preview.slice(0, 40) + '…' : preview) + '</div>' +
          '</div>' +
          unreadBadge +
        '</div>';
      }
    }
    listHtml += '</div>';

    var overlay = document.createElement('div');
    overlay.className = 'chat-overlay';
    overlay.id = 'chatOverlay';
    overlay.innerHTML =
      '<div class="chat-overlay__header">' +
        '<div class="chat-overlay__header-left">' +
          '<button class="chat-overlay__back" id="chatOverlayBack">‹</button>' +
          '<div class="chat-overlay__avatar" style="background:#10b981">A</div>' +
          '<div class="chat-overlay__info">' +
            '<h2>Чаты с пользователями</h2>' +
            '<span>Выберите пользователя</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      listHtml;

    document.body.appendChild(overlay);
    _chatOverlayEl = overlay;

    document.getElementById('chatOverlayBack').addEventListener('click', closeChatOverlay);
  }

  function openAdminChat(userId) {
    var users = Auth.getUsers();
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) { user = users[i]; break; }
    }
    if (!user) return;

    closeChatOverlay();

    // Канонический id админа (первый is_admin). НЕ fallback на session.id —
    // иначе админ (залогиненный под id=6) пишет в пару (6↔X), а покупатель ждёт в (1↔X).
    var adminId = (typeof Data !== 'undefined' && Data.getAdminId) ? Data.getAdminId() : null;
    var userName = user.name || 'Пользователь';
    var avatarLetter = userName[0].toUpperCase();

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'chat-overlay-backdrop';
    backdrop.id = 'chatOverlayBackdrop';
    backdrop.addEventListener('click', closeChatOverlay);
    document.body.appendChild(backdrop);
    backdrop._keydown = function(e) { if (e.key === 'Escape') closeChatOverlay(); };
    document.addEventListener('keydown', backdrop._keydown);

    // Purchases
    var purchases = Data.getPurchases(userId);
    var purchasesHtml = '';
    var labels = { pending: '⏳ Ожидает', completed: '✅ Завершён', rejected: '❌ Отклонён' };
    if (purchases.length > 0) {
      purchasesHtml = '<div class="chat-overlay__purchases" id="adminOverlayPurchases">';
      for (var pi = 0; pi < Math.min(purchases.length, 6); pi++) {
        var p = purchases[pi];
        var flagHtml = (typeof Data !== 'undefined' ? Data.getCountryFlag(p.country) : '') || '🌍';
        purchasesHtml += '<div class="chat-purchase-chip">' +
          '<span class="chat-purchase-chip__service">' + esc(p.serviceName) + '</span>' +
          '<span>' + flagHtml + ' ' + esc(p.country) + '</span>' +
          (p.phoneNumber ? '<span class="chat-purchase-chip__phone">📞 ' + esc(p.phoneNumber) + '</span>' : '') +
          '<span class="chat-purchase-chip__price">' + p.price + ' ₽</span>' +
          '<span class="chat-purchase-chip__status ' + p.status + '">' + (labels[p.status] || p.status) + '</span>' +
        '</div>';
      }
      purchasesHtml += '</div>';
    }

    // Messages
    var messages = Data.getConversation(adminId, userId);
    Data.markConversationRead(adminId, userId);
    if (typeof ChatServer !== 'undefined') ChatServer.markRead(adminId, userId);

    var msgsHtml = '';
    if (messages.length === 0) {
      msgsHtml = '<div class="chat-empty">Напишите пользователю первым</div>';
    } else {
      var lastDate = null;
      for (var mi = 0; mi < messages.length; mi++) {
        var msg = messages[mi];
        var msgDate = new Date(msg.created_at).toLocaleDateString('ru-RU');
        if (msgDate !== lastDate) {
          msgsHtml += '<div class="chat-overlay__date-divider">' + msgDate + '</div>';
          lastDate = msgDate;
        }
        var isAdminMsg = msg.senderId === adminId;
        msgsHtml += '<div class="chat-overlay__msg ' + (isAdminMsg ? 'chat-overlay__msg--mine' : 'chat-overlay__msg--admin') + '">' +
          '<div class="chat-overlay__msg-text">' + esc(msg.text) + '</div>' +
          '<div class="chat-overlay__msg-time">' + formatTime(msg.created_at) + '</div>' +
        '</div>';
      }
    }

    var overlay = document.createElement('div');
    overlay.className = 'chat-overlay';
    overlay.id = 'chatOverlay';
    overlay.innerHTML =
      '<div class="chat-overlay__header">' +
        '<div class="chat-overlay__header-left">' +
          '<button class="chat-overlay__back" id="chatOverlayBack">‹</button>' +
          '<div class="chat-overlay__avatar">' + avatarLetter + '</div>' +
          '<div class="chat-overlay__info">' +
            '<h2>' + esc(userName) + '</h2>' +
            '<span>Пользователь</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      purchasesHtml +
      '<div class="chat-overlay__messages" id="chatOverlayMessages">' + msgsHtml + '</div>' +
      '<div class="chat-overlay__input">' +
        '<input type="text" id="chatAdminInputField" placeholder="Напишите сообщение..." autocomplete="off">' +
        '<button class="chat-overlay__send" id="chatAdminSendBtn">Отправить</button>' +
      '</div>';

    document.body.appendChild(overlay);
    _chatOverlayEl = overlay;

    document.getElementById('chatOverlayBack').addEventListener('click', closeChatOverlay);
    document.getElementById('chatAdminSendBtn').addEventListener('click', function() {
      sendAdminToUserMessage(adminId, userId);
    });
    document.getElementById('chatAdminInputField').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); sendAdminToUserMessage(adminId, userId); }
    });
    document.getElementById('chatAdminInputField').focus();

    var msgsContainer = document.getElementById('chatOverlayMessages');
    if (msgsContainer) msgsContainer.scrollTop = msgsContainer.scrollHeight;

    startAdminToUserPoll(adminId, userId);
  }

  function sendAdminToUserMessage(adminId, userId) {
    var input = document.getElementById('chatAdminInputField');
    var text = input.value.trim();
    if (!text || !adminId || !userId) return;
    input.value = '';

    var users = Auth.getUsers();
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) user = users[i];
    }
    if (!user) return;

    Data.sendMessage(adminId, Data.getAdminName(), userId, user.name, text);

    var msgsEl = document.getElementById('chatOverlayMessages');
    var messages = Data.getConversation(adminId, userId);
    var html = '';
    for (var mi = 0; mi < messages.length; mi++) {
      var msg = messages[mi];
      var isAdminMsg = msg.senderId === adminId;
      html += '<div class="chat-overlay__msg ' + (isAdminMsg ? 'chat-overlay__msg--mine' : 'chat-overlay__msg--admin') + '">' +
        '<div class="chat-overlay__msg-text">' + esc(msg.text) + '</div>' +
        '<div class="chat-overlay__msg-time">' + formatTime(msg.created_at) + '</div>' +
      '</div>';
    }
    msgsEl.innerHTML = html;
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function startAdminToUserPoll(adminId, userId) {
    if (_chatPollOverlay) clearInterval(_chatPollOverlay);
    _chatPollOverlay = setInterval(function() {
      if (!_chatOverlayEl) { clearInterval(_chatPollOverlay); _chatPollOverlay = null; return; }
      var messages = Data.getConversation(adminId, userId);
      var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      if (lastMsg && lastMsg.senderId !== adminId) {
        var msgsEl = document.getElementById('chatOverlayMessages');
        if (!msgsEl) return;
        var html = '';
        for (var mi = 0; mi < messages.length; mi++) {
          var msg = messages[mi];
          var isAdminMsg = msg.senderId === adminId;
          html += '<div class="chat-overlay__msg ' + (isAdminMsg ? 'chat-overlay__msg--mine' : 'chat-overlay__msg--admin') + '">' +
            '<div class="chat-overlay__msg-text">' + esc(msg.text) + '</div>' +
            '<div class="chat-overlay__msg-time">' + formatTime(msg.created_at) + '</div>' +
          '</div>';
        }
        msgsEl.innerHTML = html;
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }
      Data.markConversationRead(adminId, userId);
      if (typeof ChatServer !== 'undefined') ChatServer.markRead(adminId, userId);
    }, 2000);
  }

  function renderOverlayPurchases(userId) {
    var el = document.getElementById('chatOverlayPurchases');
    if (!el) return;
    var purchases = Data.getPurchases(userId);
    if (purchases.length === 0) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    var html = '';
    var labels = { pending: '⏳ Ожидает', completed: '✅ Завершён', rejected: '❌ Отклонён' };
    for (var i = 0; i < Math.min(purchases.length, 6); i++) {
      var p = purchases[i];
      var flagHtml = (typeof Data !== 'undefined' ? Data.getCountryFlag(p.country) : '') || '🌍';
      html += '<div class="chat-purchase-chip">' +
        '<span class="chat-purchase-chip__service">' + esc(p.serviceName) + '</span>' +
        '<span>' + flagHtml + ' ' + esc(p.country) + '</span>' +
        (p.phoneNumber ? '<span class="chat-purchase-chip__phone">📞 ' + esc(p.phoneNumber) + '</span>' : '') +
        '<span class="chat-purchase-chip__price">' + p.price + ' ₽</span>' +
        '<span class="chat-purchase-chip__status ' + p.status + '">' + (labels[p.status] || p.status) + '</span>' +
      '</div>';
    }
    el.innerHTML = html;
  }

  function renderOverlayMessages(userId, adminId) {
    var el = document.getElementById('chatOverlayMessages');
    if (!el) return;

    var messages = Data.getConversation(userId, adminId);
    Data.markConversationRead(userId, adminId);
    if (typeof ChatServer !== 'undefined') ChatServer.markRead(userId, adminId);

    if (messages.length === 0) {
      el.innerHTML = '<div class="chat-empty">Напишите администратору. Он ответит в ближайшее время.</div>';
      return;
    }

    var html = '';
    var lastDate = null;
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var msgDate = new Date(m.created_at).toLocaleDateString('ru-RU');
      if (msgDate !== lastDate) {
        if (i > 0) html += '<div class="chat-overlay__date-divider">' + msgDate + '</div>';
        else html += '<div class="chat-overlay__date-divider">' + msgDate + '</div>';
        lastDate = msgDate;
      }
      var isMine = m.senderId === userId;
      html += '<div class="chat-overlay__msg ' + (isMine ? 'chat-overlay__msg--mine' : 'chat-overlay__msg--admin') + '">' +
        '<div class="chat-overlay__msg-text">' + esc(m.text) + '</div>' +
        '<div class="chat-overlay__msg-time">' + formatTime(m.created_at) + '</div>' +
      '</div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  function sendOverlayMessage(userId, adminId) {
    var input = document.getElementById('chatOverlayInputField');
    var text = input.value.trim();
    if (!text || !userId || !adminId) return;
    input.value = '';

    var users = Auth.getUsers();
    var user = null, admin = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) user = users[i];
      if (users[i].id === adminId) admin = users[i];
    }
    if (!user || !admin) return;

    Data.sendMessage(userId, user.name, adminId, Data.getAdminName(), text);
    renderOverlayMessages(userId, adminId);
    renderOverlayPurchases(userId);
    maybeAutoReply(userId, user.name, adminId, Data.getAdminName());
  }

  function startOverlayPoll(userId, adminId) {
    if (_chatPollOverlay) clearInterval(_chatPollOverlay);
    _chatPollOverlay = setInterval(function() {
      if (!_chatOverlayEl) { clearInterval(_chatPollOverlay); _chatPollOverlay = null; return; }
      var messages = Data.getConversation(userId, adminId);
      var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      if (lastMsg && lastMsg.senderId !== userId) {
        renderOverlayMessages(userId, adminId);
        renderOverlayPurchases(userId);
      }
      Data.markConversationRead(userId, adminId);
      if (typeof ChatServer !== 'undefined') ChatServer.markRead(userId, adminId);
    }, 2000);
  }

  // Public API
  return {
    init: init,
    toggleDrawer: toggleDrawer,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    openChat: openChat,
    closeChatOverlay: closeChatOverlay,
    openAdminChat: openAdminChat,
    orderNumber: orderNumber,
    openOrderModal: openOrderModal,
    submitTicket: submitTicket,
    topUp: topUp,
    getAdminId: getAdminId,
  };
})();

// Init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { Profile.init(); });
} else {
  Profile.init();
}
