/* 주민번호 가림 — **긋기·사본 만들기** 층 (급여데이터함·사진첩이 함께 쓴다)

   ■ 왜 공용으로 뺐나 (대표 결정 2026-08-17 「안 1」)

   가림 화면은 급여데이터함에 먼저 만들어져 잘 돌고 있었다. 사진첩에도 필요해졌는데,
   **복사하면 두 벌이 된다.** 이 저장소에서 「두 벌이 되어 한쪽만 고쳐진다」는 사고가
   여러 번 있었고, 가림은 **틀리면 주민번호가 그대로 나가는** 기능이라 특히 위험하다.

   ■ 무엇을 뺐고 무엇을 안 뺐나

   뺀 것   : 긋기(손가락·마우스) · 사각형 담기 · 되돌리기 · **가린 사본 만들기**
             — 틀리면 사람이 다치는 «계산»이다.
   안 뺀 것: 화면 모양(HTML·CSS) — 두 앱의 판이 서로 다르게 생겼다.
             억지로 합치면 한쪽 CSS 를 다른 앱에 밀어 넣게 되고, 잘 돌던 화면이 깨진다.

   그래서 **부르는 이름과 요소 id 를 맞춘다** — 두 앱 모두 `maskWrap`·`maskImg`·
   `maskPreview` 를 쓰고, 손잡이 이름(maskDown…)도 같다. 겉모습만 각자 그린다.

   ■ 붙이는 법

     PuRrnMaskUi.init({ state: function(){ return App.maskState; },
                        render: function(){ App.render(); } });
     window.maskDown = PuRrnMaskUi.down;   // 화면 HTML 이 inline 으로 부른다
     …

   ⚠ 사각형은 픽셀이 아니라 **비율(0~1)** 로 담는다 — 폰을 돌리거나 창을 줄이면
     보이는 크기가 달라진다(계산은 js/pu-rrn-mask.js). */
(function (global) {
  'use strict';

  var deps = {
    state: function () { return null; },
    render: function () { },
    doc: null
  };

  function init(o) {
    o = o || {};
    if (o.state) deps.state = o.state;
    if (o.render) deps.render = o.render;
    deps.doc = o.doc || (typeof global.document !== 'undefined' ? global.document : null);
  }

  function st() { return deps.state(); }

  /* ⚠ `global.document` 만 보면 안 된다. 브라우저에서는 window.document 지만,
     검사(node:vm)에서는 document 가 **바깥 이름**으로만 있고 window 에는 없다.
     맨 이름으로도 찾아 두 세상에서 똑같이 돌게 한다 — 안 그러면 화면에서는 되는데
     검사에서만 조용히 아무것도 안 하는(=검사가 헛도는) 상태가 된다. */
  function docOf() {
    if (deps.doc) return deps.doc;
    if (global && global.document) return global.document;
    if (typeof document !== 'undefined') return document;
    return null;
  }
  function el(id) {
    var d = docOf();
    return d ? d.getElementById(id) : null;
  }
  /* 계산 층도 같은 까닭으로 두 곳을 본다. */
  function calc() {
    if (global && global.PuRrnMask) return global.PuRrnMask;
    if (typeof PuRrnMask !== 'undefined') return PuRrnMask;
    throw new Error('가림 계산 층(js/pu-rrn-mask.js)이 실려 있지 않습니다');
  }

  /* ── 긋기 ──
     ⚠ 움직이는 동안 다시 그리면 안 된다. 다시 그리면 지금 손이 얹혀 있는 요소가
       통째로 새로 만들어져 **드래그가 끊긴다.** 그래서 움직이는 동안에는 미리
       보이는 칸 하나만 손보고, 손을 뗄 때 한 번 다시 그린다. */
  var drag = null;

  /* 사진이 **화면에 보이는 크기** — 원본 크기가 아니다. 비율로 바꾸는 데 쓴다. */
  function viewRect() {
    var img = el('maskImg');
    return img ? img.getBoundingClientRect() : null;
  }

  function down(ev) {
    var r = viewRect();
    if (!r) return;
    ev.preventDefault();
    /* ⚠ 마지막으로 움직인 자리(x1·y1)를 따로 기억한다. 브라우저가 도중에 끊으면
       (pointercancel) 그 순간 좌표는 시작점 언저리로 돌아와 있어, 그것만 믿으면
       사람이 분명히 그은 사각형이 「너무 작다」며 버려진다 — 그래서 아무 칸도
       안 생겼다(대표 지적 2026-08-16). */
    var x0 = ev.clientX - r.left, y0 = ev.clientY - r.top;
    drag = { x0: x0, y0: y0, x1: x0, y1: y0, moved: false };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (_) { /* 손가락 못 잡아도 그리기는 된다 */ }
    showPreview(x0, y0, x0, y0);
  }

  function move(ev) {
    if (!drag) return;
    var r = viewRect();
    if (!r) return;
    ev.preventDefault();
    drag.x1 = ev.clientX - r.left;
    drag.y1 = ev.clientY - r.top;
    drag.moved = true;
    showPreview(drag.x0, drag.y0, drag.x1, drag.y1);
  }

  /* 손을 뗐다 — 뗀 자리가 가장 정확하다. */
  function up(ev) {
    var r = viewRect();
    if (!r || !drag) { finish(null, null); return; }
    finish(ev.clientX - r.left, ev.clientY - r.top);
  }

  /* 브라우저가 끊었다 — 그 순간 좌표는 못 믿으니 **마지막으로 움직인 자리**를 쓴다.
     막는 장치(draggable="false")가 실패해도 사람이 그은 것은 이 길로 남는다. */
  function cancelDrag() {
    var d = drag;
    finish(d && d.moved ? d.x1 : null, d && d.moved ? d.y1 : null);
  }

  function finish(x1, y1) {
    var d = drag;
    drag = null;
    hidePreview();
    if (!d) return;
    var r = viewRect();
    if (!r) return;
    if (x1 == null || y1 == null) return;   // 움직인 적이 없다 — 그냥 누르기만 했다
    var box = calc().rectFromDrag(d.x0, d.y0, x1, y1, r.width, r.height);
    if (!box) return;                       // 점만 찍은 것은 사각형이 아니다
    box.by = 'me';
    var s = st();
    if (!s) return;
    s.boxes.push(box);
    deps.render();
  }

  function showPreview(x0, y0, x1, y1) {
    var e = el('maskPreview');
    var r = viewRect();
    if (!e || !r) return;
    var left = Math.min(x0, x1), top = Math.min(y0, y1);
    e.style.display = '';
    e.style.left = (left / r.width * 100) + '%';
    e.style.top = (top / r.height * 100) + '%';
    e.style.width = (Math.abs(x1 - x0) / r.width * 100) + '%';
    e.style.height = (Math.abs(y1 - y0) / r.height * 100) + '%';
  }

  function hidePreview() {
    var e = el('maskPreview');
    if (e) e.style.display = 'none';
  }

  /* 기계가 칠한 것도 지울 수 있다 — 잘못 잡는 일이 실제로 있다(계좌번호 등). */
  function delBox(i) { var s = st(); if (!s) return; s.boxes.splice(i, 1); deps.render(); }
  function undo() { var s = st(); if (!s) return; s.boxes.pop(); deps.render(); }
  function clear() { var s = st(); if (!s) return; s.boxes = []; deps.render(); }

  /* ── 판독기로 넘길 사진을 만든다 ──
     ⚠ **이 함수가 가림의 전부다.** 가린 곳이 없으면 원본을 그대로 돌려준다 —
       가릴 것이 없다고 사람이 보고 누른 것이므로.
     ⚠ 못 만들었으면 **던진다.** 조용히 원본을 돌려주면, 가리려던 것을 못 가린 채
       내보내게 된다 — 이 기능이 막으려던 바로 그 일이다. */
  function maskedDataUrl() {
    var s = st();
    if (!s) throw new Error('가림 상태가 없습니다');
    if (!s.boxes || !s.boxes.length) return s.url;
    return calc().maskToDataUrl(el('maskImg'), s.boxes);
  }

  /* 상태 첫값 — 두 앱이 같은 모양을 쓰게 한 곳에서 만든다.
     ⚠ 넘긴 뒤 반드시 비운다. 안 비우면 **다음 서류에 앞 사진의 사각형이 남는다.** */
  function blank() { return { status: 'idle', url: '', boxes: [], err: '', autoNote: '' }; }

  global.PuRrnMaskUi = {
    init: init,
    down: down, move: move, up: up, cancelDrag: cancelDrag,
    delBox: delBox, undo: undo, clear: clear,
    maskedDataUrl: maskedDataUrl,
    blank: blank,
    _viewRect: viewRect
  };
})(typeof window !== 'undefined' ? window : globalThis);
