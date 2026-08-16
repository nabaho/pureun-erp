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

  /* 실제로 갈아끼우는 부분 — 기다렸다 하는 길(applyWhenIdle)과 사람이 눌러서
     바로 하는 길(applyNow)이 함께 쓴다. 한 곳에 둬야 한쪽만 고치는 일이 없다. */
  function doApply(version) {
    try {
      window.sessionStorage.setItem(SESSION_KEY, version.sha);
      window.sessionStorage.setItem(NOTICE_KEY, '1');
    } catch (_) {}
    var url = new URL(window.location.href);
    url.searchParams.set('v', version.shortSha || String(version.sha).slice(0, 8));
    window.location.replace(url.toString());
  }

  function applyWhenIdle() {
    if (!pendingVersion) return;
    if (saveBlocked || Date.now() - lastActivity < IDLE_MS) {
      applyTimer = window.setTimeout(applyWhenIdle, 5000);
      return;
    }
    var version = pendingVersion;
    pendingVersion = null;
    doApply(version);
  }

  /* 사람이 「새로보기」를 눌렀을 때 — 손을 놓기를 기다리지 않고 곧바로 간다.
     ⚠ 저장 중일 때만은 예외다. 저장이 끝나기 전에 새로 열면 쓰던 것이 날아간다.
        그때는 예약만 해 두고(원래 길이 이어받는다) 거짓을 돌려준다. */
  function applyNow() {
    if (!pendingVersion || saveBlocked) return false;
    var version = pendingVersion;
    pendingVersion = null;
    doApply(version);
    return true;
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
  /* ── 어떤 저장 상태가 갈아타기를 막는가 ──
     2026-08-16 교착: 저장 오류가 폭주하면 「다시 시도·대기줄」 신호가 쉼 없이 이어져
     saveBlocked 가 «영원히» 켜진 채였다 — 그래서 옛 탭이 몇 시간째 새 버전으로 못
     갈아탔고, 그 새 버전이 바로 폭주를 고치는 코드였다. 서로 물고 있는 교착이다.
     ⚠ 'queued'(대기줄에 넣음)는 막지 않는다 — 대기줄은 localStorage 에 있어 화면을
       새로 열어도 «그대로 남아 다시 나간다». 막을 이유가 애초에 없었다.
     ⚠ 'saving'/'retrying' 도 3분 넘게 이어지면 놓아 준다 — 3분째 안 끝난 저장은
       앞으로도 안 끝난다. 실패하면 어차피 대기줄로 가고, 대기줄은 살아남는다. */
  var BLOCK_MAX_MS = 3 * 60 * 1000;
  var blockedSince = 0;
  function isBlockingState(state) { return state === 'saving' || state === 'retrying'; }
  function blockedTooLong(since, now, max) { return !!since && (now - since) >= max; }
  window.addEventListener('pu:save-state', function (event) {
    var state = event.detail && event.detail.state;
    var wantBlock = isBlockingState(state);
    if (wantBlock && blockedTooLong(blockedSince, Date.now(), BLOCK_MAX_MS)) wantBlock = false;
    if (wantBlock && !blockedSince) blockedSince = Date.now();
    if (!wantBlock) blockedSince = 0;
    saveBlocked = wantBlock;
    if (!saveBlocked && pendingVersion) scheduleApply(pendingVersion);
  });

  /* ══════ 「새로보기」 단추 (대표 지시 2026-08-09) ══════
     자동 갈아끼우기는 원래 있었지만 **대표님이 그걸 알 수도, 재촉할 수도 없었다.**
     "업데이트 된 거 확인할 수 있게" 라는 말씀이 그 뜻이다. 보이게만 만든다.

     ⚠ 앱마다 만들지 않고 여기 한 곳에 둔다 — 이 파일을 사진첩·명함첩·이알피·
        업무관리·기금이 모두 싣는다. 한 번 넣으면 전부에 붙는다.
     ⚠ 자리: 오른쪽 아래인데 **조금 위(96px)** 다. 그 아래는 이미 붐빈다 —
        명함첩 ＋ 단추, 포털 📷 단추가 바닥에 붙어 있다. */
  var fab = null, fabState = '', pressTimer = null, longFired = false;

  function shortOf(sha) { return String(sha || '').slice(0, 8); }
  function loadedSha() {
    try { return window.sessionStorage.getItem(SESSION_KEY) || ''; } catch (_) { return ''; }
  }

  function setFab(state, text) {
    if (!fab) return;
    fabState = state;
    var color = state === 'has' ? '#1e40af' : (state === 'busy' ? '#64748b' : '#15803d');
    var bg = state === 'has' ? '#1e40af' : 'rgba(255,255,255,.94)';
    var fg = state === 'has' ? '#fff' : '#475569';
    fab.style.background = bg;
    fab.style.color = fg;
    fab.style.borderColor = state === 'has' ? '#1e40af' : 'rgba(10,20,60,.16)';
    fab.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;flex:none;background:' +
      (state === 'has' ? '#fde047' : color) + '"></span><span>' + text + '</span>';
  }

  function onPress() {
    if (longFired) { longFired = false; return; }
    if (fabState === 'busy') return;
    setFab('busy', '확인 중…');
    check().then(function (hasNew) {
      if (hasNew) {
        setFab('has', '새 버전 · 여는 중');
        if (!applyNow()) setFab('has', '저장 끝나면 바로');   // 저장 중이면 기다린다
        return;
      }
      setFab('ok', '최신입니다');
      window.setTimeout(function () { if (fabState === 'ok') setFab('ok', '최신'); }, 1600);
    }).catch(function () {
      setFab('ok', '확인 실패');
      window.setTimeout(function () { if (fabState === 'ok') setFab('ok', '최신'); }, 1600);
    });
  }

  /* 길게 누르면 지금 버전을 보여 준다 — 문제 생겼을 때 알려주시기 좋게 */
  function onLong() {
    longFired = true;
    var sha = shortOf(loadedSha());
    setFab(fabState === 'has' ? 'has' : 'ok', sha ? '지금 ' + sha : '버전 모름');
    window.setTimeout(function () { if (!pendingVersion) setFab('ok', '최신'); else setFab('has', '새 버전 있음'); }, 2500);
  }

  function mountFab() {
    if (fab || !window.document.body) return;
    fab = window.document.createElement('button');
    fab.id = 'pu-version-fab';
    fab.type = 'button';
    fab.title = '새로보기 — 눌러서 최신인지 확인 (길게 누르면 지금 버전)';
    fab.setAttribute('aria-label', '새로보기');
    fab.style.cssText = 'position:fixed;right:14px;bottom:96px;z-index:2147483000;' +
      'display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(10,20,60,.16);' +
      'border-radius:999px;padding:6px 12px;font:800 11.5px/1.3 system-ui,-apple-system,sans-serif;' +
      'cursor:pointer;box-shadow:0 3px 10px rgba(20,30,80,.14);backdrop-filter:blur(8px);' +
      '-webkit-backdrop-filter:blur(8px);white-space:nowrap;';
    fab.addEventListener('click', onPress);
    fab.addEventListener('pointerdown', function () {
      longFired = false;
      pressTimer = window.setTimeout(onLong, 550);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) {
      fab.addEventListener(n, function () { if (pressTimer) { window.clearTimeout(pressTimer); pressTimer = null; } });
    });
    fab.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.document.body.appendChild(fab);
    setFab('ok', '최신');
  }

  function mountWhenReady() {
    if (window.document.readyState === 'loading') {
      window.document.addEventListener('DOMContentLoaded', mountFab, { once: true });
    } else mountFab();
  }

  window.PUVersion = { check: check, applyNow: applyNow, _url: versionUrl };
  showUpdatedNotice();
  mountWhenReady();
  /* 저절로 새 버전을 찾았을 때도 단추가 알려 준다 — 누르지 않아도 눈에 띈다 */
  check().then(function (hasNew) { if (hasNew) setFab('has', '새 버전 있음 · 누르기'); });
  /* 뒤에서 도는 확인도 단추에 반영한다 — 안 그러면 「최신」이라고 적힌 채
     저절로 새 버전이 잡혀 화면이 바뀌어 버린다(무슨 일인지 알 수 없다). */
  function bgCheck() {
    return check().then(function (hasNew) {
      if (hasNew && fabState !== 'busy') setFab('has', '새 버전 있음 · 누르기');
      return hasNew;
    });
  }
  window.setInterval(bgCheck, CHECK_MS);
  window.addEventListener('focus', bgCheck);
})(typeof window !== 'undefined' ? window : null);
