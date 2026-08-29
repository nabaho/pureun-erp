/* 사진 편집 — «붓으로 칠한 것»을 다룬다 (대표 지시 2026-08-29)

   "이 세가지 기능 없애고 자유롭게 편집할 수 있게 기능 만들어달라" · 「둘 다」
   (① 붓으로 칠해서 지우기  ② 여러 군데를 한꺼번에)

   ■ 왜 따로 뺐나
   여태 편집은 **주민번호 가리기 화면을 제목만 바꿔** 쓰고 있었다. 그래서 도구가
   「까맣게·모자이크·흐리게」(가리는 결)였고, 네모밖에 못 그었다. 대표가 여러 번
   「편집을 갈라 달라」고 하신 것이 이것이다. 이제 편집은 **제 층**을 갖는다.

   ■ 이 층이 하는 일 — 셋
   ① 칠한 자취(stroke)를 담는다. **비율(0~1)로** 담으므로 창을 줄이거나 폰을 돌려도
      자리가 안 틀어진다(가리기 층과 같은 규칙).
   ② 칠한 것을 «덩어리»로 묶는다 — 떨어져 있는 두 곳을 칠했으면 두 군데다.
      **덩어리마다 한 번씩** AI 를 부르므로, 이 셈이 곧 요금의 갯수다.
   ③ 아주 작은 얼룩은 버린다 — 손이 미끄러져 찍힌 점 하나에 요금을 물리면 안 된다.

   ⚠ 캔버스를 안 쓴다. 순수한 셈이라 노드에서 그대로 돌려 볼 수 있어야 한다. */
(function (global) {
  'use strict';

  /* 덩어리를 찾을 때 쓰는 «성긴 판»의 긴 변. 사진 크기와 무관하게 이 판 위에서 센다.
     ⚠ 너무 촘촘하면 폰에서 느리고, 너무 성기면 가까운 두 곳이 하나로 붙는다. */
  var GRID = 192;
  /* 이보다 작은 얼룩은 «칠한 것»으로 안 본다 (성긴 판의 칸 수) —
     손이 미끄러져 찍힌 점 하나에 요금을 물리지 않는다. */
  var MIN_CELLS = 4;
  /* 덩어리끼리 이만큼(성긴 판 칸)보다 가까우면 하나로 묶는다 — 따로 부르면
     두 번 요금인데, 어차피 한 조각 안에 들어오는 거리다. */
  var JOIN_CELLS = 6;

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* 칠한 자취 하나 = { pts: [{x,y}…], r: 붓 반지름(짧은 변 기준 비율) }
     ⚠ 점 하나만 찍은 것도 자취다(톡 눌러 지우는 일이 많다). */
  function rasterize(strokes, gw, gh, aspect) {
    var g = new Uint8Array(gw * gh);
    (strokes || []).forEach(function (s) {
      var pts = (s && s.pts) || [];
      if (!pts.length) return;
      /* 붓 반지름은 «짧은 변» 기준 비율이다 — 가로세로로 같은 굵기가 되게
         칸 수로 바꿀 때 각각 제 변으로 곱한다. */
      var rx = Math.max(1, (s.r || 0) * (aspect >= 1 ? gh : gw) / (aspect >= 1 ? 1 : 1));
      var ry = rx;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        stamp(g, gw, gh, clamp01(p.x) * (gw - 1), clamp01(p.y) * (gh - 1), rx, ry);
        /* 점 사이를 이어 준다 — 빨리 그으면 점이 띄엄띄엄 찍힌다 */
        if (i) line(g, gw, gh, pts[i - 1], p, rx, ry);
      }
    });
    return g;
  }

  function stamp(g, gw, gh, cx, cy, rx, ry) {
    var x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(gw - 1, Math.ceil(cx + rx));
    var y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(gh - 1, Math.ceil(cy + ry));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) g[y * gw + x] = 1;
      }
    }
  }

  function line(g, gw, gh, a, b, rx, ry) {
    var ax = clamp01(a.x) * (gw - 1), ay = clamp01(a.y) * (gh - 1);
    var bx = clamp01(b.x) * (gw - 1), by = clamp01(b.y) * (gh - 1);
    var n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
    for (var i = 1; i < n; i++) {
      stamp(g, gw, gh, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, rx, ry);
    }
  }

  /* 이어진 칸끼리 묶어 «덩어리»의 테두리를 낸다(4방향). */
  function label(g, gw, gh) {
    var seen = new Uint8Array(gw * gh);
    var out = [];
    var stack = [];
    for (var i = 0; i < g.length; i++) {
      if (!g[i] || seen[i]) continue;
      var minx = gw, miny = gh, maxx = -1, maxy = -1, n = 0;
      stack.length = 0; stack.push(i); seen[i] = 1;
      while (stack.length) {
        var k = stack.pop();
        var x = k % gw, y = (k - x) / gw;
        n++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && g[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
        if (x < gw - 1 && g[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
        if (y > 0 && g[k - gw] && !seen[k - gw]) { seen[k - gw] = 1; stack.push(k - gw); }
        if (y < gh - 1 && g[k + gw] && !seen[k + gw]) { seen[k + gw] = 1; stack.push(k + gw); }
      }
      out.push({ minx: minx, miny: miny, maxx: maxx, maxy: maxy, n: n });
    }
    return out;
  }

  /* 가까운 덩어리끼리 묶는다 — 따로 부르면 두 번 요금인데 어차피 한 조각에 든다.
     ⚠ 묶고 나면 **다시 처음부터** 본다. 한 번만 훑으면 A-B 를 묶은 뒤 그 커진 것이
       C 와 가까워진 것을 놓친다. */
  function join(boxes, gap) {
    var b = boxes.slice();
    var again = true;
    while (again) {
      again = false;
      for (var i = 0; i < b.length && !again; i++) {
        for (var j = i + 1; j < b.length; j++) {
          if (!near(b[i], b[j], gap)) continue;
          b[i] = {
            minx: Math.min(b[i].minx, b[j].minx), miny: Math.min(b[i].miny, b[j].miny),
            maxx: Math.max(b[i].maxx, b[j].maxx), maxy: Math.max(b[i].maxy, b[j].maxy),
            n: b[i].n + b[j].n
          };
          b.splice(j, 1);
          again = true;
          break;
        }
      }
    }
    return b;
  }

  function near(a, c, gap) {
    var dx = Math.max(0, Math.max(a.minx - c.maxx, c.minx - a.maxx));
    var dy = Math.max(0, Math.max(a.miny - c.maxy, c.miny - a.maxy));
    return dx <= gap && dy <= gap;
  }

  /* ── 칠한 것 → 지울 «군데»들 ──
     돌려주는 것은 **비율 네모**(0~1)라 그대로 자르기 층(PuPhotoEdit.cropSpec)에 넘긴다.
     ⚠ 몇 군데인지가 곧 «요금 몇 번»이다. 그래서 이 셈을 화면이 그대로 보여 준다. */
  function areas(strokes, imgW, imgH, opts) {
    opts = opts || {};
    var aspect = (imgW && imgH) ? imgW / imgH : 1;
    var gw = aspect >= 1 ? GRID : Math.max(8, Math.round(GRID * aspect));
    var gh = aspect >= 1 ? Math.max(8, Math.round(GRID / aspect)) : GRID;
    var g = rasterize(strokes, gw, gh, aspect);
    var min = opts.minCells === undefined ? MIN_CELLS : opts.minCells;
    var gap = opts.joinCells === undefined ? JOIN_CELLS : opts.joinCells;
    var big = label(g, gw, gh).filter(function (b) { return b.n >= min; });
    return join(big, gap)
      .map(function (b) {
        return {
          x: b.minx / gw, y: b.miny / gh,
          w: (b.maxx - b.minx + 1) / gw, h: (b.maxy - b.miny + 1) / gh,
          cells: b.n
        };
      })
      /* 위에서 아래로, 왼쪽에서 오른쪽으로 — 사람이 센 차례와 같게 */
      .sort(function (p, q) { return (p.y - q.y) || (p.x - q.x); });
  }

  global.PuPhotoPaint = {
    GRID: GRID, MIN_CELLS: MIN_CELLS, JOIN_CELLS: JOIN_CELLS,
    rasterize: rasterize, label: label, join: join, areas: areas
  };
})(typeof window !== 'undefined' ? window : globalThis);
