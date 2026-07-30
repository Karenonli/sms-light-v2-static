// chat-server.js — двухсторонняя синхронизация сообщений между localStorage и сервером
// Работает в паре с data.js: отправка в localStorage → синхронизация с сервером → получение на другом устройстве

window.ChatServer = (function() {
  var SYNC_INTERVAL = 3000;  // каждые 3 секунды
  var SERVER_URL = window.location.origin;
  var _timer = null;
  var _syncedIds = null;     // ленивая загрузка
  var _syncedIdsLoaded = false;

  // ===== ID трекер синхронизированных сообщений =====
  function getSyncedIds() {
    if (!_syncedIdsLoaded) {
      try { _syncedIds = JSON.parse(localStorage.getItem('sms_synced_ids')) || {}; }
      catch(e) { _syncedIds = {}; }
      _syncedIdsLoaded = true;
    }
    return _syncedIds;
  }

  function saveSyncedIds() {
    try { localStorage.setItem('sms_synced_ids', JSON.stringify(_syncedIds || {})); }
    catch(e) { /* ignore */ }
  }

  function markSynced(msgId) {
    getSyncedIds()[msgId] = true;
    saveSyncedIds();
  }

  function isSynced(msgId) {
    return !!getSyncedIds()[msgId];
  }

  // ===== localStorage helpers =====
  function getLocalMessages() {
    try { return JSON.parse(localStorage.getItem('sms_messages')) || []; }
    catch(e) { return []; }
  }

  function setLocalMessages(msgs) {
    localStorage.setItem('sms_messages', JSON.stringify(msgs));
  }

  // ===== Push: отправить на сервер все непереданные сообщения =====
  function pushUnsynced() {
    var msgs = getLocalMessages();
    var pending = [];
    for (var i = 0; i < msgs.length; i++) {
      if (!isSynced(msgs[i].id)) {
        pending.push(msgs[i]);
      }
    }
    if (pending.length === 0) return Promise.resolve();

    return Promise.all(pending.map(function(msg) {
      return fetch(SERVER_URL + '/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res.ok || res.error) {
          markSynced(msg.id);
        }
      })
      .catch(function() {
        // Сервер недоступен — попробуем в следующий раз
      });
    }));
  }

  // ===== Pull: получить новые сообщения с сервера =====
  function pullFromServer() {
    return fetch(SERVER_URL + '/api/messages/all')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.messages || data.messages.length === 0) return;

        var localMsgs = getLocalMessages();
        var existingIds = {};
        for (var i = 0; i < localMsgs.length; i++) {
          existingIds[localMsgs[i].id] = true;
        }

        var changed = false;
        for (var j = 0; j < data.messages.length; j++) {
          var m = data.messages[j];
          if (!existingIds[m.id]) {
            localMsgs.push(m);
            existingIds[m.id] = true;
            markSynced(m.id);
            changed = true;
          }
        }

        if (changed) {
          localMsgs.sort(function(a, b) {
            return new Date(a.created_at) - new Date(b.created_at);
          });
          setLocalMessages(localMsgs);
        }
      })
      .catch(function() {
        // Сервер недоступен — работаем офлайн
      });
  }

  // ===== Full sync: push → pull =====
  function fullSync() {
    return pushUnsynced().then(pullFromServer);
  }

  // ===== Start/stop =====
  function startSync() {
    if (_timer) return;
    fullSync();
    _timer = setInterval(fullSync, SYNC_INTERVAL);
  }

  function stopSync() {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
  }

  // ===== Принудительно отметить сообщения как прочитанные на сервере =====
  function markRead(userId, otherUserId) {
    return fetch(SERVER_URL + '/api/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId, otherUserId: otherUserId })
    }).catch(function() {});
  }

  return {
    startSync: startSync,
    stopSync: stopSync,
    fullSync: fullSync,
    markRead: markRead
  };
})();
