'use strict';
/* 푸른노무법인 경력관리 — 서식 「원본 위에 겹쳐 쓰기」
   (브라우저 window.KcareerOverlay / Node module.exports 겸용, DOM 미사용 — 셈만 한다)

   왜 만드나: 받은 한글 서식을 HTML 표로 «흉내 내면» 서식마다 새로 깨진다.
   실측(2026-08-29 대표 서식) — 「현 주 소」가 두 줄로 쪼개지고, 「사진부착(3.5cm×4.5cm)」이
   한 글자씩 세로로 서고, 「인적사항」 세로 라벨이 표 선 위에 겹쳤다. 하나씩 고칠 문제가 아니다.

   그래서 뒤집는다 — «원본 그림은 그대로 두고, 그 위에 입력칸만 겹친다».
   엔진이 그린 A4 가 곧 서식이므로 깨질 구석이 없다.

   ── 어느 입력칸이 어느 «칸»인가 ──
   엔진의 getPageTextLayout 은 글자 조각마다 x·y·w·h 를 주지만 «어느 표 칸인지»는 말해 주지 않는다.
   그래서 두 번 잰다:
     ① 표식판 — 칸마다 «다른 표식»을 심어 그린 뒤, 표식이 떨어진 자리로 «누가 어디인지» 안다
     ② 원본판 — 표식 없이 그린 뒤, 그 자리의 빈 칸 조각에서 «칸의 진짜 크기»를 얻는다
   짐작으로 순서를 맞추지 않는다 — 한 칸만 어긋나도 값이 엉뚱한 자리에 박힌다. */
(function (root) {

  /* 표식은 «서식에 나올 리 없는» 글자여야 한다. 사용자 영역(U+E000~)을 쓴다 —
     한글 서식에 이 글자가 들어 있을 일은 없다. */
  var MARK = '';

  function markOf(i) { return MARK + String.fromCharCode(0xE001 + i) + MARK; }

  /* 칸마다 다른 표식을 심을 «채움 계획»을 만든다.
     ⚠ 도장 자리(__stamp)는 뺀다 — 거기에 글자를 넣으면 안 된다. */
  function markPlan(slots) {
    var values = {}, marks = {};
    (slots || []).forEach(function (s, i) {
      if (s.guess === '__stamp') return;
      var m = markOf(i);
      values[s.id] = m;
      marks[m] = s.id;
    });
    return { values: values, marks: marks };
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /* 같은 줄인가 — 글자 높이의 절반쯤 어긋나는 것은 같은 줄로 본다 */
  function sameLine(a, b) { return Math.abs(num(a.y) - num(b.y)) <= Math.max(4, num(a.h) * 0.6); }

  /* ── 표식이 떨어진 자리 → 칸의 상자 ──
     probeRuns : 표식을 심고 그린 판의 글자 조각
     cleanRuns : 표식 없이 그린 판의 글자 조각
     colRight  : 본문 오른쪽 끝(칸을 못 찾았을 때의 한계선)
     돌려주는 것 = { 자리이름표: {x,y,w,h,page} } */
  /* overIds : «이미 글자가 든 칸»의 자리 이름표 모음.
     그 칸은 글자 «뒤»가 아니라 글자를 «덮는» 상자를 내야 한다 — 고쳐 쓰는 자리이기 때문이다. */
  function boxesFrom(probeRuns, cleanRuns, marks, colRight, overIds) {
    var out = {}, over = overIds || {};
    (probeRuns || []).forEach(function (r) {
      var txt = String(r.text || '');
      if (txt.indexOf(MARK) < 0) return;
      Object.keys(marks).forEach(function (m) {
        if (txt.indexOf(m) < 0) return;
        var id = marks[m];
        if (out[id]) return;                       /* 처음 나온 자리만 — 뒤엣것은 겹친 것이다 */
        out[id] = cellBox(r, cleanRuns, colRight, !!over[id]);
      });
    });
    return out;
  }

  /* 표식 조각 하나로 «칸의 상자»를 낸다.
     ① 원본판에서 같은 줄·같은 자리의 조각을 찾으면 그 크기가 곧 칸이다(빈 칸은 칸을 다 차지한다)
     ② 못 찾으면 표식 자리에서 시작해 «같은 줄의 다음 조각»까지, 그것도 없으면 본문 끝까지 */
  function cellBox(mark, cleanRuns, colRight, over) {
    var mx = num(mark.x), my = num(mark.y), mh = num(mark.h) || 16;
    var hit = null;
    (cleanRuns || []).forEach(function (c) {
      if (hit) return;
      if (!sameLine(c, mark)) return;
      var cx = num(c.x), cw = num(c.w);
      /* 표식이 그 조각 «안»에서 시작하는가 (조금 넘치는 것은 봐준다) */
      if (mx + 1 >= cx - 2 && mx <= cx + cw + 2 && cw > 8) hit = c;
    });
    if (hit && String(hit.text || '').trim() === '') {
      return { x: num(hit.x), y: num(hit.y), w: num(hit.w), h: num(hit.h) || mh };
    }
    /* ★ 이미 글자가 든 «값 칸» — 그 글자를 «덮는» 상자를 낸다(대표 지시 2026-09-05 「바로 수정」).
       ⚠ 아래 「안내글 뒤」 길로 가면 글자 «뒤»에 상자가 생겨, 고치려는 글자는 그대로 남고
         그 옆에 빈 칸만 뜬다 — 「직접 수정」이 되지 않는다.
       폭은 글자 폭이 아니라 «같은 줄의 다음 조각 앞»까지 — 고쳐 쓰면 길어질 수 있다. */
    if (hit && over) {
      var sx = num(hit.x), hw = num(hit.w);
      /* ⚠ 한 칸의 글자가 «여러 조각»으로 쪼개져 온다 — 글꼴·숫자에서 갈린다
         (실측 2026-09-05: 「충남 천안시 용곡4길 20」이 「충남 천안시 용곡」·「4」·「길 」·「20」).
         첫 조각만 덮으면 뒷글자가 상자 밖으로 삐져나온다(실측: 폭이 104px 밖에 안 나왔다).
         붙어 있는 조각은 «한 덩어리»로 잇고, 눈에 띄게 벌어지면 거기서 끊는다. */
      var line = (cleanRuns || []).filter(function (c) { return sameLine(c, mark) && num(c.x) + 1 >= sx; })
        .sort(function (a, b) { return num(a.x) - num(b.x); });
      var end = sx + hw, gapTol = (num(hit.h) || mh) * 1.2, beyond = Infinity;
      line.forEach(function (c) {
        var cx = num(c.x);
        if (cx <= end + gapTol) { end = Math.max(end, cx + num(c.w)); }   /* 붙어 있으면 한 덩어리 */
        else if (cx < beyond) { beyond = cx; }                            /* 벌어지면 남의 자리 */
      });
      /* 고쳐 쓰면 길어질 수 있으니 «남의 자리 앞»까지는 내어 준다 */
      var r2 = isFinite(beyond) ? beyond - 3 : (num(colRight) || end);
      return { x: sx, y: num(hit.y), w: Math.max(end - sx, r2 - sx), h: num(hit.h) || mh };
    }
    /* 안내글 뒤(「(한글)」)처럼 글자가 있는 칸 — 그 글자 뒤부터 다음 조각 앞까지 */
    var startX = hit ? (num(hit.x) + num(hit.w) + 3) : mx;
    var next = Infinity;
    (cleanRuns || []).forEach(function (c) {
      if (!sameLine(c, mark)) return;
      var cx = num(c.x);
      if (cx > startX + 2 && cx < next) next = cx;
    });
    var right = isFinite(next) ? next - 3 : (num(colRight) || (startX + 120));
    return { x: startX, y: my, w: Math.max(28, right - startX), h: mh };
  }

  /* 상자가 쓸 만한가 — 너무 좁거나 종이 밖이면 버린다(잘못 얹느니 안 얹는다) */
  function usable(b, pageW, pageH) {
    if (!b) return false;
    if (b.w < 16 || b.h < 6) return false;
    if (b.x < 0 || b.y < 0) return false;
    if (pageW && b.x + b.w > pageW + 4) return false;
    if (pageH && b.y > pageH) return false;
    return true;
  }

  var api = { MARK: MARK, markOf: markOf, markPlan: markPlan,
              boxesFrom: boxesFrom, cellBox: cellBox, usable: usable, sameLine: sameLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerOverlay = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
