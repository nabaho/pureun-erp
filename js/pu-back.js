/* pu-back.js — 폰 «뒤로가기»가 한 걸음씩 물러선다 (대표 지시 2026-08-30)
   ------------------------------------------------------------------
   「모든 프로그램에서 스마트폰 가장 아래 뒤로가기 버튼을 누르면 … 직전에 눌렀던
     화면으로 가야 되는데 무조건 통합시스템 화면으로 돌아간다. 모든 프로그램이
     다 똑같다」

   왜 그랬나 — 우리 앱은 화면을 바꿔도 «브라우저 기록에 아무것도 안 남긴다».
   포털에서 들어온 걸음 하나뿐이라, 뒤로가기는 그 하나를 되밟아 통째로 나간다.
   창을 열 개 열어 놓았어도 마찬가지다. 사람이 한 시간 쌓아 둔 자리가 한 번에 날아간다.

   어떻게 고치나 — 층이 열릴 때마다 «빈 걸음»을 하나 심는다.
   뒤로가기는 그 빈 걸음을 먼저 밟고, 우리는 그때 맨 위 층을 닫는다.
   층이 하나도 없을 때에야 진짜로 앱을 나간다.

   쓰는 법 (창을 여는 쪽):
     var 손잡이 = PuBack.open('업체 상세', 닫는함수);
     ... 사람이 X 로 닫았으면:  PuBack.close(손잡이);

   ⚠ 닫는 함수는 «여러 번 불려도» 탈이 없어야 한다.
   ⚠ 걸음은 늘 «하나»만 심는다. 층마다 심으면 뒤로가기를 열 번 눌러야 나간다.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var 층 = [];          /* [{ id, name, close }] — 맨 뒤가 «맨 위» 다 */
  var 심었나 = false;   /* 빈 걸음을 심어 두었는가 */
  var 번호 = 0;
  var 돌아갈곳 = 'enter.html';

  function 심기() {
    if (심었나) return;
    try {
      history.pushState({ puBack: 1 }, '', location.href);
      심었나 = true;
    } catch (e) { /* 기록을 못 쓰는 곳이면 예전처럼 굴러간다 */ }
  }

  /* 층이 하나도 없을 때의 뒤로가기 = 진짜로 나간다.
     ⚠ 우리가 심은 걸음을 방금 밟았으므로 한 걸음 더 물러서야 «앱 밖» 이다.
     ⚠ 그런데 앱을 새 창으로 열었으면 물러설 곳이 없다 — 그때는 포털로 보낸다.
       (안 그러면 뒤로가기가 «아무 일도 안 하는» 단추가 된다) */
  function 나가기() {
    var 여기 = location.href;
    try { history.back(); } catch (e) {}
    setTimeout(function () {
      if (location.href === 여기) {
        try { location.replace(돌아갈곳); } catch (e) { location.href = 돌아갈곳; }
      }
    }, 400);
  }

  function onPop() {
    심었나 = false;                    /* 방금 그 걸음을 밟았다 */
    /* ⚠ 이 앱이 «제 화면 기록»을 따로 굴리는 곳이 있다(사진첩 크게보기·기금 화면·
       급여 화면·업무 갈래). 그쪽 손잡이가 먼저 돌고 나서 우리가 또 닫으면
       한 번 누르는데 «두 개»가 닫힌다. 그쪽이 처리했다고 알리면 우리는 비켜선다.
       ⚠ 그쪽 손잡이가 먼저 달려 있어야 한다 — 그래서 이 파일은 </body> 앞에 싣는다. */
    try {
      if (global.__puBackNav) { global.__puBackNav = false; 심기(); return; }
    } catch (e) {}
    var 맨위 = 층.pop();
    if (맨위) {
      try { 맨위.close(); } catch (e) { try { console.warn('[뒤로가기]', e); } catch (_) {} }
      심기();                          /* 파수꾼이 있으면 늘 다시 심는다 */
      return;
    }
    if (물어보기()) { 심기(); return; }  /* 옛 화면의 덮개를 하나 닫았다 — 앱에 남는다 */
    나가기();
  }

  /* 층을 열었다 — 닫는 법을 함께 준다. 되돌릴 손잡이를 돌려준다. */
  function open(name, close) {
    if (typeof close !== 'function') return null;
    var it = { id: ++번호, name: String(name || '창'), close: close };
    층.push(it);
    심기();
    return it.id;
  }

  /* 사람이 X·닫기로 닫았다 — 목록에서만 뺀다.
     ⚠ 여기서 history.back() 을 부르지 «않는다». 그러면 닫기 한 번에 두 걸음이
       물러서서, 창을 닫았을 뿐인데 앱이 통째로 나가 버린다. */
  function close(id) {
    if (id == null) return false;
    for (var i = 층.length - 1; i >= 0; i--) {
      if (층[i].id === id) { 층.splice(i, 1); return true; }
    }
    return false;
  }

  /* 지금 몇 층이나 열려 있나 (검사·디버깅용) */
  function depth() { return 층.length; }
  function top() { return 층.length ? 층[층.length - 1].name : ''; }

  /* 층이 하나도 없을 때 갈 곳 — 앱마다 다를 수 있다(기본은 포털) */
  function exitTo(url) { if (url) 돌아갈곳 = String(url); }

  /* ── 파수꾼 — 「맨 위 것을 닫고, 닫았으면 true」 한 함수만 주면 된다 ──
     옛 화면들은 창이 열린 것을 «알려 줄» 자리가 없다(그냥 style.display 를 바꾼다).
     그런 화면은 열릴 때가 아니라 «뒤로가기를 누른 그때» 물어보면 된다.
     ⚠ 나중에 등록한 것부터 묻는다 — 뒤에 얹힌 화면이 위에 있다. */
  var 파수꾼 = [];
  function guard(fn) {
    if (typeof fn !== 'function') return null;
    파수꾼.push(fn);
    심기();                    /* 물어볼 것이 생겼으니 걸음을 심어 둔다 */
    return fn;
  }
  function 물어보기() {
    for (var i = 파수꾼.length - 1; i >= 0; i--) {
      try { if (파수꾼[i]() === true) return true; } catch (e) {
        try { console.warn('[뒤로가기]', e); } catch (_) {}
      }
    }
    return false;
  }

  /* ── 화면에 떠 있는 «맨 위 덮개»를 그 창의 «제 닫기 단추»로 닫는다 ──
     ★ 왜 단추를 누르나 — 그 앱이 닫을 때 하는 일(고른 것 비우기·되돌리기·저장 묻기)을
       그대로 태우기 위해서다. display 만 감추면 다음에 열 때 지난 자취가 남는다.
     ⚠ 「저장」·「확인」 같은 단추는 절대 안 누른다. 뒤로가기는 «그만두기»이지 «하기»가 아니다. */
  var 닫기말 = ['닫기', '취소', '✕', '×', '✖', 'X', '뒤로'];

  function 보이나(el) {
    if (!el || el.hidden) return false;
    var st = null;
    try { st = getComputedStyle(el); } catch (e) { return false; }
    if (!st || st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function 층높이(el) {
    var z = 0;
    try { z = parseInt(getComputedStyle(el).zIndex, 10) || 0; } catch (e) {}
    return z;
  }
  function 닫기단추(box) {
    var 뻔한 = box.querySelector('[data-close],.close,.btn-close,.x,.modal-x');
    if (뻔한) return 뻔한;
    var 단추들 = box.querySelectorAll('button,a[role="button"],span[onclick]');
    for (var i = 0; i < 단추들.length; i++) {
      var t = (단추들[i].textContent || '').trim();
      var on = String(단추들[i].getAttribute('onclick') || '');
      if (닫기말.indexOf(t) >= 0) return 단추들[i];
      if (/close|닫기/i.test(on) && !/save|저장/i.test(on)) return 단추들[i];
    }
    return null;
  }
  /* ★ 덮개를 «이름»이 아니라 «생김새»로 찾는다.
     앱마다 클래스 이름이 다르고(.mb · .modalbg · .modal-ov · .fxbg …), 새 창이 생기면
     목록에 넣는 것을 잊는다 — 그러면 그 창에서만 뒤로가기가 앱을 나가 버린다.
     이름은 잊혀지지만 생김새는 안 변한다: «떠 있고(fixed·absolute) · 높이 얹혀 있고
     (z-index) · 화면을 꽤 덮고 · 제 닫기 단추를 가진 것».
     ⚠ 닫는 법이 없는 것은 «덮개로 안 본다» — 감추기만 하면 그 앱의 뒷정리가 안 돌아
       다음에 열 때 지난 자취가 남는다. 못 닫으면 차라리 앱을 나가는 것이 정직하다.
     ⚠ 머리줄·토스트를 거른다: 화면 위쪽에 붙은 얇은 띠, 화면의 15% 도 못 덮는 것. */
  function 덮개후보() {
    var 다 = [];
    try { 다 = Array.prototype.slice.call(document.body.querySelectorAll('*')); }
    catch (e) { return []; }
    var W = window.innerWidth || 1, H = window.innerHeight || 1;
    var 화면 = W * H;
    return 다.filter(function (el) {
      var st;
      try { st = getComputedStyle(el); } catch (e) { return false; }
      if (!st) return false;
      if (st.position !== 'fixed' && st.position !== 'absolute') return false;
      if ((parseInt(st.zIndex, 10) || 0) < 10) return false;
      if (!보이나(el)) return false;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if ((r.width * r.height) / 화면 < 0.15) return false;      /* 토스트·작은 알림 */
      if (r.top < H * 0.05 && r.height < H * 0.2) return false;  /* 붙박이 머리줄 */
      return !!닫기단추(el);
    });
  }

  function closeTopVisible(sel) {
    var 열린것;
    if (sel) {
      try { 열린것 = Array.prototype.slice.call(document.querySelectorAll(sel)).filter(보이나); }
      catch (e) { return false; }
    } else {
      열린것 = 덮개후보();
    }
    if (!열린것.length) return false;
    /* 맨 위 = 높이 얹힌 것, 같으면 «나중에 그려진» 것 */
    열린것.sort(function (a, b) {
      var d = 층높이(a) - 층높이(b);
      if (d) return d;
      return (a.compareDocumentPosition(b) & 4) ? -1 : 1;
    });
    var 맨위 = 열린것[열린것.length - 1];
    var 단추 = 닫기단추(맨위);
    if (단추) { try { 단추.click(); return true; } catch (e) {} }
    if (sel) {   /* 앱이 이름을 대 준 것은 닫는 법이 없어도 감춘다 */
      try { 맨위.style.display = 'none'; 맨위.classList.remove('open'); return true; } catch (e) {}
    }
    return false;
  }

  /* 이미 열려 있는 창을 «닫는 법만» 아는 화면용 —
     상태를 직접 안 들고 있는 옛 화면에서도 한 줄로 붙일 수 있다. */
  function once(name, close) { return open(name, close); }

  try { window.addEventListener('popstate', onPop); } catch (e) {}

  var api = { open: open, close: close, once: once, guard: guard, closeTopVisible: closeTopVisible,
              depth: depth, top: top, exitTo: exitTo, _pop: onPop };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PuBack = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
