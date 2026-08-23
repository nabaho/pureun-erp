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

  /* ── 단추 색은 «아는 것»만 말한다 (대표 제보 2026-08-23) ──
     「장애알림 없는데 왜 빨간색 왼쪽아래 경고인가」.
     전에는 관리자면 무조건 빨갛게 띄웠다 — 처리할 알림이 0건이어도 늘 빨갰다.
     늘 켜져 있는 빨간불은 아무것도 알려 주지 못한다. 진짜 장애가 생겨도
     달라지는 것이 없어 «구별이 안 된다» — 이 저장소가 이미 겪은 실수다
     (금액 경고를 상시등으로 만들었다가 아무도 안 보게 된 일).
     그래서 평소에는 조용한 회색 단추로 두고, «열어 본 수»가 1건이라도 있을 때만
     빨갛게 켠다. 색이 뜻을 갖는다.
     ⚠ 여기서 미리 세어 두지는 않는다 — 그러려면 장애 이력 전체(지금 191건·156KB)를
       띄울 때마다 내려받아야 한다. 그 값을 싸게 알려면 «열린 건수»만 담는 작은 자리가
       따로 있어야 하고, 그건 규칙(콘솔)에 새 경로를 여는 일이라 대표 확인이 필요하다. */
  var HEALTH_QUIET = 'position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483646;border:1px solid #cbd5e1;border-radius:999px;padding:8px 13px;background:#fff;color:#475569;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 3px 12px #0002;cursor:pointer;opacity:.85;';
  var HEALTH_ALARM = 'position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483646;border:0;border-radius:999px;padding:10px 14px;background:#b42318;color:#fff;font:800 12px/1.2 system-ui,sans-serif;box-shadow:0 6px 22px #0003;cursor:pointer;';

  /* 아는 열린 건수. null = 아직 안 열어 봐서 «모른다»(모를 때는 조용히 둔다). */
  var knownOpen = null;
  /* 총괄관리자로 확인됐는가 — 이 값이 참일 때만 단추가 뜬다.
     예전에는 monitorAdmin 이 직접 hidden 을 만졌는데, 그러면 「0건이라 감췄다」를
     곧바로 되돌려 버린다. 판단은 paintAdminBadge 한 곳으로 모은다. */
  var isAdminUser = false;

  function paintAdminBadge(badge) {
    if (!badge) return;
    /* ★ 장애가 없으면 «아무것도 안 띄운다» (대표 지시 2026-08-23)
       「장애가 없을 경우 필요없다 … 이 문구 없애달라」.
       세어 보니 0건이면 「장애 알림 없음」이라고 적어 두었는데, 그 줄이 하루 종일
       화면 구석을 차지한다. 없다는 말을 늘 하고 있을 까닭이 없다 — 치운다.
       ⚠ 「모름」과 「0건」은 다르다. 아직 안 세어 봤을 때(null)는 조용한 단추를
         남긴다 — 그것마저 감추면 눌러서 확인할 길이 사라진다. */
    /* 보이고 감추는 판단은 «여기 한 곳»에서만 한다. 두 곳에서 하면 서로 되돌린다
       — monitorAdmin 이 hidden=false 로 덮어써 0건인데도 다시 뜨는 식이다. */
    if (!isAdminUser || knownOpen === 0) { badge.hidden = true; return; }
    badge.hidden = false;
    if (knownOpen === null) {
      badge.style.cssText = HEALTH_QUIET;
      badge.textContent = '장애 알림';
      badge.title = '눌러서 처리할 장애 알림이 있는지 봅니다';
    } else {
      badge.style.cssText = HEALTH_ALARM;
      badge.textContent = '⚠ 장애 알림 ' + knownOpen;
      badge.title = '처리할 장애 알림이 ' + knownOpen + '건 있습니다';
    }
  }

  function ensureAdminBadge(app) {
    var badge = window.document.getElementById('pu-health-admin-badge');
    if (!badge) {
      badge = window.document.createElement('button');
      badge.id = 'pu-health-admin-badge';
      badge.type = 'button';
      badge.hidden = true;
      badge.onclick = function () { showAdminPanel(app); };
      window.document.body.appendChild(badge);
    }
    paintAdminBadge(badge);
    return badge;
  }

  /* 장애 이력은 오래될수록 커진다. 관리자 탭마다 전체 루트를 실시간 구독하면
     오류 한 건이 생길 때마다 과거 이력까지 다시 내려온다. 평소에는 읽지 않고,
     총괄관리자가 단추를 눌렀을 때 한 번만 최근 미처리 목록을 가져온다. */
  function showAdminPanel(app) {
    var badge = ensureAdminBadge(app);
    badge.disabled = true;
    badge.textContent = '장애 알림 불러오는 중…';
    app.database().ref('systemAlerts').once('value').then(function (alertsSnapshot) {
      adminAlerts = flattenAlerts(alertsSnapshot.val());
      knownOpen = adminAlerts.length;      // 이제 «안다» — 색이 뜻을 갖는다
      renderAdminPanel(app);
    }).catch(function () {
      /* 못 읽었으면 «모르는 것»이지 «없는 것»이 아니다 — 0 으로 적어 두면
         진짜 장애가 있어도 조용해진다. 모름(null)으로 되돌린다. */
      knownOpen = null;
      window.alert('장애 알림을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }).then(function () {
      badge.disabled = false;
      paintAdminBadge(badge);
    });
  }

  function renderAdminPanel(app) {
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
          adminAlerts = adminAlerts.filter(function (x) { return !(x.uid === item.uid && x.id === item.id); });
          left -= 1;
          /* 처리한 만큼 단추도 함께 내린다 — 창을 닫고 나서 빨간불만 남으면
             「처리했는데 왜 아직 빨갛나」가 된다(건의함 배지에서 겪은 것과 같은 일). */
          knownOpen = left;
          paintAdminBadge(window.document.getElementById('pu-health-admin-badge'));
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
      isAdminUser = true;
      ensureAdminBadge(app);   // 보임·색·글자는 모두 paintAdminBadge 가 정한다
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
