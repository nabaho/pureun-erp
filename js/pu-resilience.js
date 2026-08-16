/*
 * Pureunall common resilience runtime
 * - Retries transient Firebase writes.
 * - Keeps a durable recovery queue when the network is unavailable.
 * - Replays queued writes after reconnect/authentication.
 *
 * This file intentionally wraps only idempotent set/update/remove calls.
 * Transactions and presence/lock records keep their original semantics.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PUResilience = api;
})(typeof window !== 'undefined' ? window : null, function (window) {
  'use strict';

  var STORAGE_PREFIX = 'pu_recovery_queue_v1:';
  var MAX_QUEUE_ITEMS = 200;
  var MAX_ITEM_AGE = 7 * 24 * 60 * 60 * 1000;
  var RETRY_DELAYS = [600, 1600];
  /* 다시 보내기를 몇 번까지 할 것인가.
     ⚠ 이 숫자가 없으면 «영영 낫지 않는» 저장 하나가 연결될 때마다, 로그인할 때마다,
       인터넷이 붙을 때마다 다시 나간다. 서버는 그때마다 오류를 돌려주고, 그 오류가
       'internal' 로 분류돼(isTransientError) 또 다시 보내진다. 7일 동안 끝나지 않는
       되풀이가 되어 콘솔이 오류로 뒤덮이고 화면이 계속 멈춘다(대표 화면 2026-08-16,
       기업 상세에서 오류 1,000건 넘게 쏟아짐).
     ⚠ 그렇다고 «지우지는» 않는다. 대표가 저장한 것을 우리가 조용히 버리면 안 된다.
       더 안 보내고 한쪽에 세워 둔 뒤(parked) 사람에게 알린다. */
  var MAX_REPLAY_ATTEMPTS = 5;
  var EXCLUDED_SEGMENTS = ['.info', 'activeWriter', 'presence', 'connections'];
  var installed = false;
  var replaying = false;
  var rawMethods = {};
  var badgeTimer = null;

  function errorCode(error) {
    return String(error && (error.code || error.message) || '').toLowerCase();
  }

  function isTransientError(error) {
    var code = errorCode(error);
    if (!code) return true;
    return code.indexOf('network') >= 0 || code.indexOf('disconnect') >= 0 ||
      code.indexOf('unavailable') >= 0 || code.indexOf('timeout') >= 0 ||
      code.indexOf('internal') >= 0 || code.indexOf('fetch') >= 0;
  }

  function isExcludedPath(path) {
    var parts = String(path || '').split('/').filter(Boolean);
    return parts.some(function (part) { return EXCLUDED_SEGMENTS.indexOf(part) >= 0; });
  }

  function referencePath(ref) {
    try {
      var parsed = new URL(ref.toString());
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    } catch (_) {
      var parts = [];
      var cursor = ref;
      while (cursor && cursor.key != null) {
        parts.unshift(cursor.key);
        cursor = cursor.parent;
      }
      return parts.join('/');
    }
  }

  function currentContext(ref) {
    var app = ref && ref.database && ref.database.app;
    var project = app && app.options && (app.options.projectId || app.options.databaseURL) || 'default';
    var user = app && app.auth && app.auth().currentUser;
    return { project: String(project), uid: user && user.uid || '' };
  }

  function storageKey(project) {
    return STORAGE_PREFIX + String(project || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  function readQueue(project) {
    if (!window || !window.localStorage) return [];
    try {
      var parsed = JSON.parse(window.localStorage.getItem(storageKey(project)) || '[]');
      var now = Date.now();
      return Array.isArray(parsed) ? parsed.filter(function (item) {
        return item && item.path && item.method && now - Number(item.createdAt || 0) < MAX_ITEM_AGE;
      }) : [];
    } catch (_) { return []; }
  }

  function writeQueue(project, queue) {
    if (!window || !window.localStorage) throw new Error('복구 저장소를 사용할 수 없습니다.');
    window.localStorage.setItem(storageKey(project), JSON.stringify(queue));
  }

  function queueWrite(ref, method, value) {
    var context = currentContext(ref);
    var path = referencePath(ref);
    if (!path || isExcludedPath(path)) throw new Error('이 연결 정보는 자동 복구 대상이 아닙니다.');
    var queue = readQueue(context.project);
    if (queue.length >= MAX_QUEUE_ITEMS) throw new Error('복구 대기 항목이 너무 많습니다. 관리자에게 문의해 주세요.');
    var item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      project: context.project,
      uid: context.uid,
      path: path,
      method: method,
      value: value,
      createdAt: Date.now(),
      attempts: 0
    };
    queue.push(item);
    writeQueue(context.project, queue);
    return { item: item, pending: queue.length };
  }

  function emit(state, detail) {
    if (!window) return;
    var payload = Object.assign({ state: state, at: Date.now() }, detail || {});
    try { window.dispatchEvent(new CustomEvent('pu:save-state', { detail: payload })); } catch (_) {}
    updateBadge(payload);
  }

  function updateBadge(detail) {
    if (!window || !window.document) return;
    var id = 'pu-resilience-badge';
    var badge = window.document.getElementById(id);
    var visible = detail.state === 'retrying' || detail.state === 'queued' ||
      detail.state === 'failed' || detail.state === 'recovered';
    if (!visible) return;
    if (!badge) {
      badge = window.document.createElement('div');
      badge.id = id;
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      badge.style.cssText = 'position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;max-width:min(360px,calc(100vw - 24px));padding:9px 13px;border-radius:999px;background:#17365f;color:#fff;font:700 12px/1.35 system-ui,sans-serif;box-shadow:0 6px 22px #0003;';
      window.document.body.appendChild(badge);
    }
    var labels = {
      retrying: '연결이 불안정해 저장을 다시 시도하고 있습니다…',
      queued: '오프라인 저장 완료 · 연결되면 자동 복구합니다',
      failed: '저장 복구 실패 · 관리자 확인이 필요합니다',
      recovered: '연결 복구 · 대기 중인 저장을 반영했습니다'
    };
    badge.textContent = detail.message || labels[detail.state] || '저장 상태 확인 중';
    badge.style.background = detail.state === 'failed' ? '#b42318' : detail.state === 'recovered' ? '#18794e' : '#17365f';
    badge.hidden = false;
    if (badgeTimer) window.clearTimeout(badgeTimer);
    if (detail.state === 'recovered') badgeTimer = window.setTimeout(function () { badge.hidden = true; }, 4500);
  }

  function wait(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  /* ── 저장이 어디로 몇 번 나갔는지 세기 ──
     2026-08-16: 명함첩 콘솔에 서버 오류가 1ms 간격으로 5,000건 넘게 쌓였다. 코드를 읽어
     서는 «무엇이» 그 많은 메시지를 보내는지 못 짚었다. 짐작으로 고치면 엉뚱한 곳을
     건드린다. 그래서 나가는 저장을 «길목»에서 세어 둔다 — 여기가 유일한 길목이다.
     칸 이름(밑 두 마디)까지만 센다. 명함 번호까지 세면 6,616 가지가 되어 못 읽는다. */
  var writeCensus = {};
  function censusKey(path) {
    var parts = String(path || '').split('/').filter(Boolean).slice(0, 2);
    return parts.join('/') || '(뿌리)';
  }
  function countWrite(path, method) {
    var k = censusKey(path) + ' · ' + method;
    writeCensus[k] = (writeCensus[k] || 0) + 1;
  }

  /* ── 실패 폭주 감지 ──
     2026-08-16: 저장 수만 건이 한꺼번에 실패하자, 건마다 두 번씩 «다시 시도»가 붙어
     실패가 세 배로 불었다. 다시 시도는 «가끔 한 건» 실패할 때 뜻이 있다 — 방금
     실패가 수십 건이면 지금 또 보내 봐야 같이 실패할 뿐, 서버만 더 두들긴다.
     최근 10초의 실패를 세어, 폭주 중이면 다시 시도를 건너뛰고 바로 대기줄로 보낸다. */
  var FAIL_BURST_WINDOW_MS = 10000;
  var FAIL_BURST_LIMIT = 30;
  var recentFails = [];
  function noteFail(now) {
    recentFails.push(now);
    if (recentFails.length > FAIL_BURST_LIMIT * 2) recentFails.splice(0, FAIL_BURST_LIMIT);
  }
  function inFailBurst(now) {
    var cut = now - FAIL_BURST_WINDOW_MS, n = 0;
    for (var i = recentFails.length - 1; i >= 0 && recentFails[i] >= cut; i--) n++;
    return n >= FAIL_BURST_LIMIT;
  }

  function callWithRetry(ref, method, args) {
    var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    var value = method === 'remove' ? null : args[0];
    var attempt = 0;
    try { countWrite(referencePath(ref), method); } catch (_) {}

    function finishOk(result) { if (callback) callback(null); return result; }
    function finishError(error) { if (callback) callback(error); throw error; }
    function run() {
      return Promise.resolve().then(function () {
        return rawMethods[method].apply(ref, args);
      }).catch(function (error) {
        if (!isTransientError(error) || isExcludedPath(referencePath(ref))) return finishError(error);
        var nowTs = Date.now();
        noteFail(nowTs);
        if (inFailBurst(nowTs)) attempt = RETRY_DELAYS.length;   /* 폭주 중 — 바로 대기줄로 */
        if (attempt < RETRY_DELAYS.length && window.navigator.onLine !== false) {
          var delay = RETRY_DELAYS[attempt++];
          emit('retrying', { method: method, path: referencePath(ref), attempt: attempt });
          return wait(delay).then(run);
        }
        try {
          var queued = queueWrite(ref, method, value);
          emit('queued', { pending: queued.pending, path: queued.item.path });
          return undefined;
        } catch (queueError) {
          emit('failed', { error: String(queueError && queueError.message || queueError) });
          return finishError(error);
        }
      });
    }
    emit('saving', { method: method, path: referencePath(ref) });
    return run().then(function (result) {
      emit('saved', { method: method, path: referencePath(ref) });
      return finishOk(result);
    });
  }

  function availableApps() {
    try { return window.firebase.apps || []; } catch (_) { return []; }
  }

  /* ── 다시 보내기 사이 최소 간격 ──
     2026-08-16: 대기줄 다시 보내기는 «연결될 때마다» 나갔다. 서버가 폭주 때문에
     연결을 끊으면 SDK 가 몇 초 만에 다시 붙고 → 또 보내고 → 또 끊기고 — 이 고리가
     몇 시간 동안 초당 7건씩 오류를 만들었다(대표 콘솔, ErrorId 로 셈).
     연결이 아무리 자주 오르내려도 다시 보내기는 30초에 한 번이면 충분하다 —
     밀린 저장은 어차피 순서대로 나가고, 30초 늦는 것은 아무도 못 느낀다. */
  var REPLAY_MIN_GAP_MS = 30000;
  var lastReplayAt = 0;

  function replayQueue(app) {
    if (replaying || !app || !app.database) return Promise.resolve(false);
    var nowTs = Date.now();
    if (nowTs - lastReplayAt < REPLAY_MIN_GAP_MS) return Promise.resolve(false);
    lastReplayAt = nowTs;
    var context = { project: String(app.options && (app.options.projectId || app.options.databaseURL) || 'default'), uid: app.auth && app.auth().currentUser && app.auth().currentUser.uid || '' };
    var queue = readQueue(context.project).filter(function (item) { return !item.parked; });
    if (!queue.length) return Promise.resolve(false);
    replaying = true;
    var restored = 0;
    var parked = 0;
    var chain = Promise.resolve();
    queue.slice().forEach(function (item) {
      chain = chain.then(function () {
        if (item.uid && item.uid !== context.uid) return;
        var ref = app.database().ref(item.path);
        var args = item.method === 'remove' ? [] : [item.value];
        return Promise.resolve().then(function () {
          return rawMethods[item.method].apply(ref, args);
        }).then(function () {
          var latest = readQueue(context.project).filter(function (queued) { return queued.id !== item.id; });
          writeQueue(context.project, latest);
          restored++;
        }).catch(function (error) {
          /* ⚠ 몇 번 해 봤는지 «반드시» 적어 둔다. 예전에는 attempts 를 0으로 넣어 두고
             아무도 올리지 않아, 낫지 않는 저장 하나가 연결될 때마다 영원히 다시 나갔다. */
          var latest = readQueue(context.project);
          var hit = null;
          for (var i = 0; i < latest.length; i++) if (latest[i].id === item.id) { hit = latest[i]; break; }
          if (hit) {
            hit.attempts = Number(hit.attempts || 0) + 1;
            hit.lastError = errorCode(error).slice(0, 120);
            hit.lastTriedAt = Date.now();
            if (hit.attempts >= MAX_REPLAY_ATTEMPTS) { hit.parked = true; parked++; }
            try { writeQueue(context.project, latest); } catch (_) {}
          }
          if (!isTransientError(error)) emit('failed', { error: errorCode(error), path: item.path });
          throw error;
        });
      });
    });
    chain = chain.catch(function (error) {
      if (parked) emit('failed', {
        message: '저장 ' + parked + '건을 여러 번 시도했지만 서버가 거부했습니다 · 관리자 확인이 필요합니다'
      });
      throw error;
    });
    return chain.then(function () {
      if (restored) emit('recovered', { restored: restored, pending: readQueue(context.project).length });
      return restored > 0;
    }).catch(function () { return false; }).then(function (result) { replaying = false; return result; }, function (error) { replaying = false; throw error; });
  }

  function replayAll() {
    return availableApps().reduce(function (promise, app) {
      return promise.then(function () { return replayQueue(app); });
    }, Promise.resolve());
  }

  /* ══════ 연결이 자꾸 끊기면 사람에게 알린다 ══════
     2026-08-16: 백업이 «서버가 받아 줄 수 없는 크기»의 쓰기를 한 번 보내면, 그 뒤로는
     파이어베이스 라이브러리가 그것을 «스스로» 다시 보낸다 — 연결이 끊길 때마다.
     우리 코드가 부르는 것이 아니라 라이브러리 안에서 일어나므로 «우리가 멈출 수 없다».
     그 창을 새로 열기 전에는 끝나지 않는다(대표 콘솔에서 접속번호 ClientId 가 계속
     바뀐 것이 그 증거다 — 끊기고 붙기를 되풀이했다).
     고칠 수 없다면 «알려는 줘야 한다». 조용히 두면 종일 요금만 나간다. */
  var FLAP_WINDOW_MS = 2 * 60 * 1000;
  var FLAP_LIMIT = 5;                 /* 2분에 5번이면 정상적인 끊김이 아니다 */
  var reconnects = [];
  function noteReconnect(now) {
    reconnects.push(now);
    if (reconnects.length > FLAP_LIMIT * 4) reconnects.splice(0, reconnects.length - FLAP_LIMIT * 2);
  }
  function isFlapping(now, window, limit) {
    var cut = now - window, n = 0;
    for (var i = reconnects.length - 1; i >= 0 && reconnects[i] >= cut; i--) n++;
    return n >= limit;
  }
  function showReloadBanner() {
    if (!window.document || !window.document.body) return;
    if (window.document.getElementById('pu-reload-banner')) return;   /* 한 번만 */
    var box = window.document.createElement('div');
    box.id = 'pu-reload-banner';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));' +
      'transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 20px);' +
      'display:flex;align-items:center;gap:10px;background:#b42318;color:#fff;' +
      'border-radius:12px;padding:11px 14px;box-shadow:0 10px 30px rgba(20,10,10,.28);' +
      'font:700 13px/1.45 system-ui,-apple-system,sans-serif';
    box.innerHTML = '<span>서버 연결이 자꾸 끊기고 있습니다 · <b>이 창을 새로 열어야 멈춥니다</b></span>';
    var go = window.document.createElement('button');
    go.type = 'button';
    go.textContent = '새로고침';
    go.style.cssText = 'flex:none;border:0;border-radius:9px;padding:7px 13px;background:#fff;' +
      'color:#b42318;font:800 12.5px/1.2 system-ui,sans-serif;cursor:pointer';
    go.onclick = function () { window.location.reload(); };
    var no = window.document.createElement('button');
    no.type = 'button';
    no.textContent = '✕';
    no.title = '닫기';
    no.style.cssText = 'flex:none;border:0;background:none;color:#ffd9d5;font-size:15px;cursor:pointer';
    no.onclick = function () { box.remove(); };
    box.appendChild(go); box.appendChild(no);
    window.document.body.appendChild(box);
  }

  function bindApp(app) {
    if (!app || app.__puResilienceBound) return;
    app.__puResilienceBound = true;
    try {
      if (app.auth) app.auth().onAuthStateChanged(function (user) { if (user) replayQueue(app); });
      app.database().ref('.info/connected').on('value', function (snapshot) {
        if (snapshot.val() !== true) return;
        var now = Date.now();
        noteReconnect(now);
        if (isFlapping(now, FLAP_WINDOW_MS, FLAP_LIMIT)) showReloadBanner();
        replayQueue(app);
      });
    } catch (_) {}
  }

  function install() {
    if (installed || !window || !window.firebase || !window.firebase.database || !window.firebase.database.Reference) return false;
    var proto = window.firebase.database.Reference.prototype;
    ['set', 'update', 'remove'].forEach(function (method) {
      if (typeof proto[method] !== 'function') return;
      rawMethods[method] = proto[method];
      proto[method] = function () { return callWithRetry(this, method, Array.prototype.slice.call(arguments)); };
    });
    installed = true;
    availableApps().forEach(bindApp);
    var originalInitialize = window.firebase.initializeApp;
    if (typeof originalInitialize === 'function' && !originalInitialize.__puResilienceWrapped) {
      var wrappedInitialize = function () {
        var app = originalInitialize.apply(window.firebase, arguments);
        bindApp(app);
        return app;
      };
      wrappedInitialize.__puResilienceWrapped = true;
      window.firebase.initializeApp = wrappedInitialize;
    }
    window.addEventListener('online', replayAll);
    return true;
  }

  var api = {
    install: install,
    replay: replayAll,
    isTransientError: isTransientError,
    isExcludedPath: isExcludedPath,
    referencePath: referencePath,
    /* 지금 밀려 있는 저장이 몇 건인지 — 화면이 멈출 때 원인을 짚으려면 이게 보여야 한다.
       parked 는 「여러 번 해 봤지만 서버가 거부한 것」이다. 지우지 않고 세워만 뒀다. */
    stats: function (project) {
      var q = readQueue(project);
      var parked = q.filter(function (x) { return x.parked; });
      /* 많이 나간 칸부터 — 어디가 폭주하는지 한눈에 보이게 */
      var busiest = Object.keys(writeCensus)
        .map(function (k) { return { where: k, n: writeCensus[k] }; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
      var total = busiest.reduce(function (s, x) { return s + x.n; }, 0);
      return {
        pending: q.length - parked.length,
        parked: parked.length,
        writes: Object.keys(writeCensus).reduce(function (s, k) { return s + writeCensus[k]; }, 0),
        busiest: busiest,
        busiestTotal: total,
        worst: parked.slice(0, 3).map(function (x) {
          return { path: x.path, method: x.method, attempts: x.attempts, error: x.lastError || '' };
        })
      };
    },
    /* 세던 것을 0으로 — 「지금부터 5초 동안」을 재려면 필요하다 */
    resetCensus: function () { writeCensus = {}; },
    MAX_REPLAY_ATTEMPTS: MAX_REPLAY_ATTEMPTS,
    _isFlapping: isFlapping,
    _noteReconnect: noteReconnect,
    _flap: { window: FLAP_WINDOW_MS, limit: FLAP_LIMIT },
    _readQueue: readQueue
  };
  if (window && window.document) install();
  return api;
});
