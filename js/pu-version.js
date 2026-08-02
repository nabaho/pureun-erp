/* Pureunall deployed-version watcher. Applies verified releases automatically while idle. */
(function (window) {
  'use strict';
  if (!window || !window.document || window.PUVersion) return;
  var CHECK_MS = 5 * 60 * 1000;
  var SESSION_KEY = 'pu_loaded_release_v1';
  var NOTICE_KEY = 'pu_updated_notice_v1';
  var IDLE_MS = 30 * 1000;
  var checking = false;
  var pendingVersion = null;
  var applyTimer = null;
  var lastActivity = Date.now();
  var saveBlocked = false;

  function versionUrl() {
    var script = Array.prototype.slice.call(window.document.scripts).find(function (item) { return /(?:^|\/)pu-version\.js(?:\?|$)/.test(item.src || ''); });
    return new URL('../version.json', script && script.src || window.location.href).toString();
  }

  function showUpdatedNotice() {
    var shouldShow = false;
    try {
      shouldShow = window.sessionStorage.getItem(NOTICE_KEY) === '1';
      if (shouldShow) window.sessionStorage.removeItem(NOTICE_KEY);
    } catch (_) {}
    if (!shouldShow) return;
    function mount() {
      if (!window.document.body) return;
      var notice = window.document.createElement('div');
      notice.id = 'pu-version-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = '새 버전으로 업데이트되었습니다';
      notice.style.cssText = 'position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 24px);box-sizing:border-box;padding:10px 15px;border-radius:999px;background:#18794e;color:#fff;box-shadow:0 8px 28px #0004;font:800 13px/1.3 system-ui,sans-serif;white-space:nowrap;';
      window.document.body.appendChild(notice);
      window.setTimeout(function () { if (notice.parentNode) notice.parentNode.removeChild(notice); }, 1000);
    }
    if (window.document.readyState === 'loading') window.document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  function applyWhenIdle() {
    if (!pendingVersion) return;
    if (saveBlocked || Date.now() - lastActivity < IDLE_MS) {
      applyTimer = window.setTimeout(applyWhenIdle, 5000);
      return;
    }
    var version = pendingVersion;
    pendingVersion = null;
    try {
      window.sessionStorage.setItem(SESSION_KEY, version.sha);
      window.sessionStorage.setItem(NOTICE_KEY, '1');
    } catch (_) {}
    var url = new URL(window.location.href);
    url.searchParams.set('v', version.shortSha || String(version.sha).slice(0, 8));
    window.location.replace(url.toString());
  }

  function scheduleApply(version) {
    pendingVersion = version;
    if (applyTimer) window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyWhenIdle, 1000);
  }

  function check() {
    if (checking) return Promise.resolve(false);
    checking = true;
    return window.fetch(versionUrl() + '?t=' + Date.now(), { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('version unavailable');
      return response.json();
    }).then(function (version) {
      if (!version || !version.sha) return false;
      var loaded = '';
      try { loaded = window.sessionStorage.getItem(SESSION_KEY) || ''; } catch (_) {}
      if (!loaded) {
        try { window.sessionStorage.setItem(SESSION_KEY, version.sha); } catch (_) {}
        return false;
      }
      if (loaded !== version.sha) { scheduleApply(version); return true; }
      return false;
    }).catch(function () { return false; }).then(function (result) { checking = false; return result; });
  }

  ['pointerdown', 'keydown', 'input'].forEach(function (name) {
    window.addEventListener(name, function () { lastActivity = Date.now(); }, { passive: true });
  });
  window.addEventListener('pu:save-state', function (event) {
    var state = event.detail && event.detail.state;
    saveBlocked = state === 'saving' || state === 'retrying' || state === 'queued';
    if (!saveBlocked && pendingVersion) scheduleApply(pendingVersion);
  });

  window.PUVersion = { check: check, _url: versionUrl };
  showUpdatedNotice();
  check();
  window.setInterval(check, CHECK_MS);
  window.addEventListener('focus', check);
})(typeof window !== 'undefined' ? window : null);
