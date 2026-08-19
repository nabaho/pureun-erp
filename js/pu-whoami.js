/* ══════════════════════════════════════════════════════════════
   푸른 통합시스템 — 「지금 로그인한 사람」을 한 곳에서 알아낸다
   2026-08-16 (대표 지시)

   대표 지시: "모든 프로그램 상단 우측에 로그인한 본인의 이름이 나오게 해라.
              현재 권형하로 로그인했는데 기금통합운영은 최기운으로 되어 있다."

   ── 왜 그랬나 ────────────────────────────────────────────────
   포털이 기금관리·업무관리에만 주소로 이름을 넘기고 있었다:
       fund.html?sso=1&user=최기운&role=사무장
   그 두 앱은 「주소에 user 가 있으면 그걸 믿고 명부를 안 봤다」.
   ★ 주소는 «누른 순간의 사진» 이다. 사람이 바뀌어도 주소는 안 바뀌고,
     새로고침하면 그 사진이 다시 그려진다 — 영원히 앞사람 이름이 뜬다.

   ★ 누구인지를 «두 곳» 에서 알아내면 언젠가 어긋난다.
     그래서 주소로 넘기던 것을 없애고, 여기 한 곳에서만 알아낸다.
     (덤: 직원 이름이 주소창·방문기록·공유 링크에 안 남는다.)

   ── 어떻게 알아내나 ──────────────────────────────────────────
   로그인 이메일(p001@pureun.kr) → 직원 명부에서 그 사번(P001)을 찾아 이름·직책.
   명부는 data/user_dir 을 먼저 보고, 없으면 data/user_accounts 를 본다.

   ── 쓰는 법 ──────────────────────────────────────────────────
     <script src="js/pu-whoami.js?v=1"></script>
   ① 자리를 정해 주고 싶으면:  PuWhoami.mount('#내자리')
   ② 안 정해 주면 «오른쪽 위» 에 저절로 붙는다 (pu-appbar 와 같은 요령)
   ③ 값만 쓰고 싶으면:        PuWhoami.onChange(function(me){ … })

   ⚠ 로그인 화면(enter.html)과 공개 화면(전자서명·공유보기)에는 넣지 않는다.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var me = null;                 // { sid, name, title, role, email }
  var listeners = [];
  var slot = null;               // 앱이 정해 준 자리
  var suppress = false;          // 「우리가 이미 그린다」 — 표를 두 번 띄우지 않게
  var autoBadge = null;          // 자리를 안 정해 줬을 때 스스로 붙인 표
  var started = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 이메일 → 사번. p001@pureun.kr → P001
     (포털 enter.html 의 puEmailToSid 와 «같은 규칙» 이어야 한다 — 다르면 사람이 안 찾아진다) */
  function emailToSid(email) {
    var m = String(email || '').toLowerCase().match(/^([a-z]+)(\d+)@/);
    return m ? (m[1].toUpperCase() + m[2]) : '';
  }

  /* 명부 자료는 {v:[…]} 로 싸여 오기도 하고 객체표로 오기도 한다 — 배열로 편다 */
  function toList(raw) {
    var list = (raw && raw.v !== undefined) ? raw.v : raw;
    if (list && !Array.isArray(list) && typeof list === 'object') {
      list = Object.keys(list).map(function (k) { return list[k]; });
    }
    return Array.isArray(list) ? list : null;
  }

  /* 사번을 견줄 때는 «모양»을 맞춘다 — 명부에 P-001 로 적힌 곳과 P001 로 적힌 곳이
     섞여 있다. 글자 그대로 견주면 한쪽이 안 잡혀 이름이 빈 채로 남고, 그러면
     화면에는 이메일이 그대로 뜬다(대표 보고 2026-08-17: 「p001@pureun.kr」이 보인다). */
  function normSid(v) { return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function pick(list, sid) {
    if (!list || !sid) return null;
    var want = normSid(sid);
    var all = list.filter(function (x) { return x && normSid(x.sid) === want; });
    // 겹치면 재직인 사람을 먼저 — 그래도 겹치면 첫 사람 (포털과 같은 규칙)
    var act = all.filter(function (x) { return (x.status || 'active') === 'active'; });
    return act[0] || all[0] || null;
  }

  function db() {
    try { return global.firebase && global.firebase.database && global.firebase.database(); }
    catch (e) { return null; }
  }

  function read(path) {
    var d = db();
    if (!d) return Promise.resolve(null);
    return d.ref(path).once('value').then(function (s) { return toList(s.val()); })
      .catch(function () { return null; });
  }

  function set(next) {
    var was = me ? me.sid : '';
    me = next;
    if ((next ? next.sid : '') === was && next && was) { draw(); return; }
    draw();
    listeners.forEach(function (fn) { try { fn(me); } catch (e) { } });
  }

  function resolve(user) {
    if (!user || !user.email) { set(null); return; }
    var email = String(user.email || '');
    var sid = emailToSid(email);
    // 이메일만으로도 «무언가» 는 바로 보여 준다 — 빈 자리가 뜨는 것보다 낫다
    set({ sid: sid, name: '', title: '', role: '', email: email });
    read('data/user_dir')
      .then(function (l) { return l || read('data/user_accounts'); })
      .then(function (l) {
        var u = pick(l, sid);
        set({ sid: sid, email: email,
          name: (u && u.name) || '', title: (u && (u.title || '')) || '',
          role: (u && (u.role || '')) || '' });
      })
      .catch(function () { });
  }

  /* 그리는 글자 — 대표 결정(2026-08-16): 이름 · 직책 · 사번.
     ★ 사번까지 있어야 남의 계정으로 들어갔을 때 그 자리에서 알아챈다
       (동명이인·잘못 로그인). 포털 머리와 같은 모양이다. */
  function text() {
    if (!me) return '';
    /* 이름을 아직 못 찾았어도 «이메일 통째»는 보이지 않는다 — 화면 위에서
       「p001@pureun.kr」은 읽을 거리도 아니고 자리만 넓게 먹는다(대표 지시).
       사번이 이미 뒤에 붙으므로 앞부분만으로 충분하다. */
    var nm = me.name || String(me.email || '').split('@')[0] || '';
    var ti = me.title || me.role || '';
    var sd = me.sid ? me.sid.replace(/^([A-Z]+)(\d+)$/, '$1-$2') : '';
    return nm + (ti ? ' ' + ti : '') + (sd ? ' · ' + sd : '');
  }

  function ensureAutoBadge() {
    if (slot || suppress) return null;           // 앱이 자리를 줬거나 「우리가 그린다」고 했으면 안 만든다
    if (autoBadge && global.document.body.contains(autoBadge)) return autoBadge;
    var d = global.document;
    autoBadge = d.createElement('div');
    autoBadge.id = 'puWhoamiBadge';
    autoBadge.style.cssText = 'position:fixed;top:8px;right:12px;z-index:2147483000;'
      + 'background:#fff;border:1px solid #e2e8f0;border-radius:99px;padding:4px 12px;'
      + 'font:600 11.5px -apple-system,"Malgun Gothic",sans-serif;color:#475569;'
      + 'box-shadow:0 2px 8px rgba(30,41,59,.08);white-space:nowrap;pointer-events:none;';
    d.body.appendChild(autoBadge);
    return autoBadge;
  }

  function draw() {
    var t = text();
    try {
      if (slot) { slot.innerHTML = t ? ('<b style="color:#1e293b">' + esc(t) + '</b>') : ''; return; }
      var b = ensureAutoBadge();
      if (!b) return;
      b.textContent = t;
      b.style.display = t ? '' : 'none';
    } catch (e) { }
  }

  function start() {
    if (started) return false;
    started = true;
    try {
      var a = global.firebase && global.firebase.auth && global.firebase.auth();
      if (a && a.onAuthStateChanged) a.onAuthStateChanged(resolve);
    } catch (e) { }
    return true;
  }

  global.PuWhoami = {
    start: start,
    /* 자리를 정해 준다. 이미 이름 자리가 있는 앱이 쓴다.
       mount(false) = 「우리가 이미 그리니 표를 띄우지 말라」 (두 번 뜨는 것을 막는다) */
    mount: function (sel) {
      if (sel === false) { suppress = true; slot = null; }
      else {
        suppress = false;
        try { slot = (typeof sel === 'string') ? global.document.querySelector(sel) : sel; }
        catch (e) { slot = null; }
      }
      if (autoBadge && (slot || suppress)) { try { autoBadge.remove(); } catch (e) { } autoBadge = null; }
      draw();
      return !!slot;
    },
    get: function () { return me; },
    onChange: function (fn) { if (typeof fn === 'function') { listeners.push(fn); if (me) { try { fn(me); } catch (e) { } } } },
    // 검사용
    _emailToSid: emailToSid,
    _toList: toList,
    _pick: pick,
    _normSid: normSid,
    _text: function (v) { var old = me; me = v; var t = text(); me = old; return t; },
    _resolve: resolve
  };

  // 파이어베이스는 앱마다 늦게 준비된다 — 준비될 때까지 몇 번 두드린다
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    try {
      if (global.firebase && global.firebase.auth && global.firebase.auth().onAuthStateChanged) {
        clearInterval(iv); start();
      }
    } catch (e) { }
    if (tries > 60) clearInterval(iv);
  }, 500);
})(typeof window !== 'undefined' ? window : globalThis);
