/* Pureunall deployed-version watcher. Shows a reload banner when a newer verified release exists. */
(function (window) {
  'use strict';
  if (!window || !window.document || window.PUVersion) return;
  var CHECK_MS = 5 * 60 * 1000;
  var SESSION_KEY = 'pu_loaded_release_v1';
  var checking = false;

  function versionUrl() {
    var script = Array.prototype.slice.call(window.document.scripts).find(function (item) { return /(?:^|\/)pu-version\.js(?:\?|$)/.test(item.src || ''); });
    return new URL('../version.json', script && script.src || window.location.href).toString();
  }

  function show(version) {
    var banner = window.document.getElementById('pu-version-banner');
    if (!banner) {
      banner = window.document.createElement('div');
      banner.id = 'pu-version-banner';
      banner.setAttribute('role', 'status');
      banner.style.cssText = 'position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;width:min(560px,calc(100vw - 20px));box-sizing:border-box;padding:11px 13px;border-radius:12px;background:#17365f;color:#fff;box-shadow:0 10px 30px #0004;display:flex;gap:10px;align-items:center;font:700 13px/1.35 system-ui,sans-serif;';
      banner.innerHTML = '<span style="flex:1">새 버전이 준비되었습니다. 저장을 마친 뒤 업데이트하세요.</span><button type="button" style="border:0;border-radius:8px;background:#fff;color:#17365f;padding:7px 10px;font-weight:900;cursor:pointer">업데이트</button><button type="button" aria-label="나중에" style="border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer">×</button>';
      banner.querySelectorAll('button')[1].onclick = function () { banner.hidden = true; };
      window.document.body.appendChild(banner);
    }
    banner.hidden = false;
    banner.querySelector('button').onclick = function () {
      try { window.sessionStorage.setItem(SESSION_KEY, version.sha); } catch (_) {}
      var url = new URL(window.location.href);
      url.searchParams.set('v', version.shortSha || String(version.sha).slice(0, 8));
      window.location.replace(url.toString());
    };
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
      if (loaded !== version.sha) { show(version); return true; }
      return false;
    }).catch(function () { return false; }).then(function (result) { checking = false; return result; });
  }

  window.PUVersion = { check: check, _url: versionUrl };
  check();
  window.setInterval(check, CHECK_MS);
  window.addEventListener('focus', check);
})(typeof window !== 'undefined' ? window : null);
