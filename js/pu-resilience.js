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

  function callWithRetry(ref, method, args) {
    var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    var value = method === 'remove' ? null : args[0];
    var attempt = 0;

    function finishOk(result) { if (callback) callback(null); return result; }
    function finishError(error) { if (callback) callback(error); throw error; }
    function run() {
      return Promise.resolve().then(function () {
        return rawMethods[method].apply(ref, args);
      }).catch(function (error) {
        if (!isTransientError(error) || isExcludedPath(referencePath(ref))) return finishError(error);
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

  function replayQueue(app) {
    if (replaying || !app || !app.database) return Promise.resolve(false);
    var context = { project: String(app.options && (app.options.projectId || app.options.databaseURL) || 'default'), uid: app.auth && app.auth().currentUser && app.auth().currentUser.uid || '' };
    var queue = readQueue(context.project);
    if (!queue.length) return Promise.resolve(false);
    replaying = true;
    var restored = 0;
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
          if (!isTransientError(error)) emit('failed', { error: errorCode(error), path: item.path });
          throw error;
        });
      });
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

  function bindApp(app) {
    if (!app || app.__puResilienceBound) return;
    app.__puResilienceBound = true;
    try {
      if (app.auth) app.auth().onAuthStateChanged(function (user) { if (user) replayQueue(app); });
      app.database().ref('.info/connected').on('value', function (snapshot) { if (snapshot.val() === true) replayQueue(app); });
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
    _readQueue: readQueue
  };
  if (window && window.document) install();
  return api;
});
