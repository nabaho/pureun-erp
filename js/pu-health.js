/* Pureunall shared fault detection and administrator notification runtime. */
(function (window) {
  'use strict';
  if (!window || !window.document || window.PUHealth) return;

  var STORE_KEY = 'pu_health_pending_v1';
  var DEDUPE_KEY = 'pu_health_dedupe_v1';
  var MAX_PENDING = 30;
  var DEDUPE_MS = 10 * 60 * 1000;
  var boundApps = [];
  var flushing = false;
  var adminAlerts = [];

  function safeText(value, max) {
    return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').slice(0, max || 700);
  }

  function readJson(key, fallback) {
    try { return JSON.parse(window.localStorage.getItem(key) || '') || fallback; } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  function fingerprint(kind, message, page) {
    var text = kind + '|' + message + '|' + page;
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }

  function enqueue(kind, error, extra) {
    extra = extra || {};
    var message = safeText(error && (error.message || error.reason) || error || '알 수 없는 오류');
    var page = window.location.pathname.split('/').pop() || 'enter.html';
    var id = fingerprint(kind, message, page);
    var dedupe = readJson(DEDUPE_KEY, {});
    if (dedupe[id] && Date.now() - dedupe[id] < DEDUPE_MS) return false;
    dedupe[id] = Date.now();
    Object.keys(dedupe).forEach(function (key) { if (Date.now() - dedupe[key] > 24 * 60 * 60 * 1000) delete dedupe[key]; });
    writeJson(DEDUPE_KEY, dedupe);

    var pending = readJson(STORE_KEY, []);
    pending.push({
      localId: Date.now().toString(36) + id,
      kind: safeText(kind, 40),
      message: message,
      detail: safeText(extra.detail || error && error.stack || '', 900),
      page: safeText(page, 100),
      createdAt: Date.now(),
      status: 'new'
    });
    writeJson(STORE_KEY, pending.slice(-MAX_PENDING));
    flush();
    return true;
  }

  function activeApp() {
    for (var i = 0; i < boundApps.length; i++) {
      try { if (boundApps[i].auth().currentUser) return boundApps[i]; } catch (_) {}
    }
    return null;
  }

  function flush() {
    if (flushing || window.navigator.onLine === false) return Promise.resolve(false);
    var app = activeApp();
    if (!app) return Promise.resolve(false);
    var user = app.auth().currentUser;
    var pending = readJson(STORE_KEY, []);
    if (!pending.length) return Promise.resolve(false);
    flushing = true;
    var chain = Promise.resolve();
    pending.slice().forEach(function (event) {
      chain = chain.then(function () {
        var record = Object.assign({}, event, { uid: user.uid, email: safeText(user.email, 150) });
        delete record.localId;
        return app.database().ref('systemAlerts/' + user.uid + '/' + event.localId).set(record).then(function () {
          var latest = readJson(STORE_KEY, []).filter(function (item) { return item.localId !== event.localId; });
          writeJson(STORE_KEY, latest);
        });
      });
    });
    return chain.then(function () { flushing = false; return true; }, function () { flushing = false; return false; });
  }

  function flattenAlerts(value) {
    var list = [];
    Object.keys(value || {}).forEach(function (uid) {
      Object.keys(value[uid] || {}).forEach(function (id) {
        var item = value[uid][id] || {};
        if (item.status === 'new') list.push(Object.assign({ uid: uid, id: id }, item));
      });
    });
    return list.sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
  }

  function ensureAdminBadge(app) {
    var badge = window.document.getElementById('pu-health-admin-badge');
    if (!badge) {
      badge = window.document.createElement('button');
      badge.id = 'pu-health-admin-badge';
      badge.type = 'button';
      badge.hidden = true;
      badge.style.cssText = 'position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483646;border:0;border-radius:999px;padding:10px 14px;background:#b42318;color:#fff;font:800 12px/1.2 system-ui,sans-serif;box-shadow:0 6px 22px #0003;cursor:pointer;';
      badge.onclick = function () { showAdminPanel(app); };
      window.document.body.appendChild(badge);
    }
    return badge;
  }

  function showAdminPanel(app) {
    var old = window.document.getElementById('pu-health-panel');
    if (old) old.remove();
    var panel = window.document.createElement('div');
    panel.id = 'pu-health-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f172acc;padding:20px;display:grid;place-items:center;font-family:system-ui,sans-serif;';
    var box = window.document.createElement('div');
    box.style.cssText = 'width:min(680px,100%);max-height:min(720px,90vh);overflow:auto;background:#fff;border-radius:16px;padding:18px;color:#172033;box-shadow:0 20px 60px #0005;';
    var title = window.document.createElement('div');
    title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:17px;margin-bottom:12px;';
    title.innerHTML = '<span></span><button type="button" aria-label="닫기" style="border:0;background:#eef2f7;border-radius:8px;padding:6px 10px;cursor:pointer">닫기</button>';
    var titleText = title.querySelector('span');
    title.querySelector('button').onclick = function () { panel.remove(); };
    box.appendChild(title);
    if (!adminAlerts.length) {
      var empty = window.document.createElement('p'); empty.textContent = '처리할 장애 알림이 없습니다.'; box.appendChild(empty);
    }
    // 창에 실제로 그려 넣은 줄 수 — 마지막 한 줄을 처리하면 «닫기»만 남은 빈 창을 남기지 않는다.
    // adminAlerts 는 서버 청취기가 뒤늦게 갱신하므로 세어서 쓸 수 없다.
    var shown = adminAlerts.slice(0, 30);
    var left = shown.length;
    titleText.textContent = '시스템 장애 알림 (' + adminAlerts.length + ')';
    shown.forEach(function (item) {
      var row = window.document.createElement('div');
      row.style.cssText = 'border:1px solid #dce3ec;border-radius:10px;padding:11px;margin:8px 0;font-size:12px;line-height:1.5;';
      var when = new Date(Number(item.createdAt || 0)).toLocaleString('ko-KR');
      row.innerHTML = '<b>' + escapeHtml(item.page) + '</b> · ' + escapeHtml(item.kind) + '<br>' + escapeHtml(item.message) + '<br><small>' + escapeHtml(when) + ' · ' + escapeHtml(item.email || item.uid) + '</small> ';
      var resolve = window.document.createElement('button');
      resolve.type = 'button'; resolve.textContent = '처리 완료';
      resolve.style.cssText = 'float:right;border:0;border-radius:7px;background:#17365f;color:#fff;padding:5px 9px;cursor:pointer;';
      resolve.onclick = function () {
        resolve.disabled = true;
        app.database().ref('systemAlerts/' + item.uid + '/' + item.id).update({ status: 'resolved', resolvedAt: Date.now(), resolvedBy: app.auth().currentUser.uid }).then(function () {
          row.remove();
          left -= 1;
          if (left <= 0) { panel.remove(); return; }   // 다 처리했으면 창도 함께 닫는다
          titleText.textContent = '시스템 장애 알림 (' + left + ')';
        }).catch(function () {
          // 못 지웠으면 다시 누를 수 있어야 한다 — 영영 잠긴 단추를 남기지 않는다
          resolve.disabled = false;
          resolve.textContent = '처리 실패 — 다시';
        });
      };
      row.appendChild(resolve); box.appendChild(row);
    });
    panel.onclick = function (event) { if (event.target === panel) panel.remove(); };
    panel.appendChild(box); window.document.body.appendChild(panel);
  }

  function escapeHtml(value) {
    var div = window.document.createElement('div'); div.textContent = String(value || ''); return div.innerHTML;
  }

  function monitorAdmin(app, user) {
    app.database().ref('uid_roles/' + user.uid).once('value').then(function (snapshot) {
      var role = snapshot.val() || {};
      if (!role.isAdmin) return;
      var badge = ensureAdminBadge(app);
      app.database().ref('systemAlerts').on('value', function (alertsSnapshot) {
        adminAlerts = flattenAlerts(alertsSnapshot.val());
        badge.hidden = adminAlerts.length === 0;
        badge.textContent = '장애 알림 ' + adminAlerts.length + '건';
        window.document.title = adminAlerts.length ? '⚠ ' + window.document.title.replace(/^⚠\s*/, '') : window.document.title.replace(/^⚠\s*/, '');
      });
    }).catch(function () {});
  }

  function bindApp(app) {
    if (!app || boundApps.indexOf(app) >= 0 || !app.auth || !app.database) return;
    boundApps.push(app);
    app.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      flush();
      monitorAdmin(app, user);
    });
  }

  function install() {
    if (!window.firebase) return false;
    (window.firebase.apps || []).forEach(bindApp);
    var original = window.firebase.initializeApp;
    if (typeof original === 'function' && !original.__puHealthWrapped) {
      var wrapped = function () { var app = original.apply(window.firebase, arguments); bindApp(app); return app; };
      wrapped.__puHealthWrapped = true;
      window.firebase.initializeApp = wrapped;
    }
    window.addEventListener('error', function (event) { enqueue('javascript', event.error || event.message, { detail: event.filename + ':' + event.lineno }); });
    window.addEventListener('unhandledrejection', function (event) { enqueue('promise', event.reason); });
    window.addEventListener('pu:save-state', function (event) { if (event.detail && event.detail.state === 'failed') enqueue('save', event.detail.error || '저장 자동복구 실패', event.detail); });
    window.addEventListener('online', flush);
    return true;
  }

  window.PUHealth = { install: install, report: enqueue, flush: flush, _flattenAlerts: flattenAlerts };
  install();
})(typeof window !== 'undefined' ? window : null);
