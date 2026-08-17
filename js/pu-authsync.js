/* ══════════════════════════════════════════════════════════════
   푸른 통합시스템 — 로그아웃·사람 바뀜을 «모든 프로그램» 에 퍼뜨린다
   2026-08-16 (대표 지시)

   대표 보고: "최기운으로 로그아웃하고 권형하로 다시 로그인했는데
              특정 프로그램에서는 여전히 최기운이 로그인된 상태로 남아 있었다."

   ── 왜 그랬나 ────────────────────────────────────────────────
   프로그램 대부분은 파이어베이스 세션 하나를 같이 쓴다. 그런데 «푸른이알피» 만
   그 위에 제 세션(sessionStorage 의 pureun_v6_session_sid)을 따로 얹고 있었다.
   sessionStorage 는 «탭마다 따로» 라, 포털에서 로그아웃해도 그 탭은 아무것도 모른다.
   게다가 자동 로그인 열쇠(localStorage 의 pureun_v6_autologin_sid)는 로그아웃해도
   남아 있어, 새로 열어도 다시 «그 사람» 으로 들어갔다.

   ★ 남의 계정으로 남의 자료를 보게 되는 일이다. 화면 문제가 아니라 «권한» 문제다.

   ── 무엇을 하나 ──────────────────────────────────────────────
   ① 파이어베이스에 로그인한 사람이 «없어지면»(로그아웃) → 이 앱도 끊고 포털로 보낸다
   ② 로그인한 사람이 «바뀌면»(다른 사람) → 마찬가지로 끊는다
   ③ 다른 탭이 바꾼 것도 즉시 안다 (localStorage 의 pu_auth_uid 를 서로 본다)

   ★ 부팅 직후 잠깐 「없음」으로 오는 것을 로그아웃으로 오해하면 안 된다 —
     열자마자 튕겨 나가는 화면이 된다. 그래서 한 번 «기다렸다가» 다시 본다.

   ── 쓰는 법 (로그인이 필요한 앱에 한 줄) ─────────────────────
     <script src="js/pu-authsync.js?v=1"></script>
   ⚠ 로그인 화면(enter.html)과 공개 화면(전자서명·공유보기·카메라)에는 «넣지 않는다» —
     거기서 끊으면 로그인 자체를 못 하거나, 로그인 없이 보는 사람을 쫓아낸다.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* 모든 탭·모든 앱이 같은 값을 본다. sessionStorage 가 아니라 localStorage 여야 한다 —
     탭마다 따로면 옆 탭이 바뀐 것을 영영 모른다(이번 사고의 뿌리다). */
  var KEY = 'pu_auth_uid';

  /* 부팅 직후 「없음」을 기다려 보는 시간. 검사에서는 짧게 바꿔 쓴다. */
  var GRACE_MS = (typeof global.PU_AUTHSYNC_GRACE_MS === 'number') ? global.PU_AUTHSYNC_GRACE_MS : 2500;

  /* 푸른이알피가 파이어베이스와 «따로» 들고 있는 열쇠들.
     여기서 함께 지운다 — 앱이 등록을 잊어도 남의 세션이 살아남지 않게. */
  var SESSION_KEYS = ['pureun_v6_session_sid'];
  var LOCAL_KEYS   = ['pureun_v6_autologin_sid'];

  var kicked = false;
  var handlers = [];
  var started = false;

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { } }

  /* 「누구인가」 — 익명 로그인은 «사람이 아니다».
     ★ 정부사업일정(gov-consulting)은 아무도 없으면 스스로 익명 로그인을 한다.
       그걸 「다른 사람이 들어왔다」로 보면, 로그아웃한 사람이 그 앱을 열 때마다
       엉뚱하게 튕기고 다시 들어와도 또 튕기는 되돌이가 된다.
       익명은 「없음」과 같게 본다. */
  function uidOf(user) {
    if (!user) return '';
    if (user.isAnonymous) return '';
    return String(user.uid || '');
  }
  function curUid() {
    try {
      var a = global.firebase && global.firebase.auth && global.firebase.auth();
      return uidOf(a && a.currentUser);
    } catch (e) { return ''; }
  }

  function wipeLocalSession() {
    SESSION_KEYS.forEach(function (k) { try { sessionStorage.removeItem(k); } catch (e) { } });
    LOCAL_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { } });
  }

  /* 끊는다. 두 번 부르지 않는다 — 여러 신호가 겹쳐 와도 화면이 한 번만 넘어가게. */
  function kick(why) {
    if (kicked) return false;
    kicked = true;
    wipeLocalSession();
    handlers.forEach(function (fn) { try { fn(why); } catch (e) { } });
    /* 「남의 이름이 떠 있는 화면」을 한 순간도 보이지 않게 덮는다 */
    try {
      var ov = global.document.createElement('div');
      ov.id = 'puAuthKick';
      ov.style.cssText = 'position:fixed;inset:0;background:#f8fafc;z-index:2147483647;'
        + 'display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;'
        + 'font:600 14px -apple-system,"Malgun Gothic",sans-serif;color:#475569;';
      ov.textContent = (why === 'switched')
        ? '다른 사람이 로그인했습니다 — 로그인 화면으로 갑니다…'
        : '로그아웃되었습니다 — 로그인 화면으로 갑니다…';
      global.document.body.appendChild(ov);
    } catch (e) { }
    setTimeout(function () {
      try { global.location.replace('enter.html?v=' + Date.now()); }
      catch (e) { try { global.location.reload(); } catch (e2) { } }
    }, 400);
    return true;
  }

  /* 파이어베이스가 알려 주는 사람이 바뀔 때 */
  function onAuth(user) {
    var now = uidOf(user);          // 익명은 «없음» 으로 본다 (위 uidOf 주석 참고)
    var was = lsGet(KEY);

    if (now) {
      // 다른 사람으로 바뀌었다 — 이 화면은 앞사람 것이다
      if (was && was !== now) { kick('switched'); return; }
      lsSet(KEY, now);
      return;
    }

    /* 「없음」이 왔다. 부팅 직후에도 한 번 이렇게 오므로 곧바로 믿지 않는다 —
       믿으면 열자마자 로그인 화면으로 튕긴다. 잠깐 기다렸다가 다시 본다. */
    setTimeout(function () {
      if (curUid()) return;              // 그새 돌아왔다 — 부팅 중이었다
      lsSet(KEY, '');
      if (was) kick('signedout');        // 로그인해 있던 화면이었다면 끊는다
    }, GRACE_MS);
  }

  /* 다른 탭이 바꾼 것 — 파이어베이스 신호가 늦거나 막혀도 이걸로 안다 */
  function onStorage(ev) {
    if (!ev || ev.key !== KEY) return;
    var nv = ev.newValue || '';
    var mine = curUid();
    if (nv && mine && nv !== mine) { kick('switched'); return; }
    if (!nv && !mine && lsGet(KEY) === '') {
      setTimeout(function () { if (!curUid()) kick('signedout'); }, GRACE_MS);
    }
  }

  function start() {
    if (started) return false;
    started = true;
    try {
      var a = global.firebase && global.firebase.auth && global.firebase.auth();
      if (a && a.onAuthStateChanged) a.onAuthStateChanged(onAuth);
    } catch (e) { }
    try { global.addEventListener('storage', onStorage); } catch (e) { }
    return true;
  }

  global.PuAuthSync = {
    start: start,
    /* 앱이 제 뒷정리를 더 하고 싶을 때 (없어도 위 열쇠들은 지워진다) */
    onKick: function (fn) { if (typeof fn === 'function') handlers.push(fn); },
    // 검사용
    _onAuth: onAuth,
    _onStorage: onStorage,
    _kick: kick,
    _key: KEY,
    _wasKicked: function () { return kicked; }
  };

  /* 파이어베이스는 앱마다 늦게 준비된다 — 준비될 때까지 몇 번 두드린다.
     (앱이 직접 PuAuthSync.start() 를 불러도 된다. 두 번 불러도 한 번만 붙는다.) */
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    try {
      if (global.firebase && global.firebase.auth && global.firebase.auth().onAuthStateChanged) {
        clearInterval(iv); start();
      }
    } catch (e) { }
    if (tries > 60) clearInterval(iv);      // 30초까지만 (파이어베이스를 안 쓰는 화면)
  }, 500);
})(typeof window !== 'undefined' ? window : globalThis);
