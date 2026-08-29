/* AI 지우개 — 「결과가 시원찮다」를 만드는 두 자리 (2026-08-29 이어 만들기)

   STATUS 2026-08-29 [남은 것]: "실사진으로 한두 장 해 보고 결과가 시원찮으면
   보내는 조각 크기(PAD_RATIO·MAX_EDGE)와 물음(PROMPT)을 맞춘다."

   실사진을 부르기 전에 «셈만으로 알 수 있는 것» 둘을 먼저 쟀다. 둘 다 확실하다.

   ① **모델이 보는 조각이 너무 작았다.**
      둘레를 «비율»로만 떠서, 작은 것을 지울 때 조각이 통째로 100~260px 이 된다.
      벽시계 하나(120×120)를 지우려는데 모델에게 보이는 그림이 264×264 —
      **메울 배경이 무엇인지 알 길이 없다.** 넓게 떠도 어차피 긴 변을 줄여 보내므로
      **보내는 크기는 한도(768px) 안 그대로**다.
        벽시계 264×264 → 512×512 · 작은 이름표 132×96 → 512×512
        모서리에 있는 것 160×161 → 512×512

   ② **되붙일 때 «둘레까지» 통째로 덮었다.**
      줄여 보낸 조각을 다시 늘려 붙이므로, 덮은 자리가 통째로 흐려진다.
      그 자리가 지운 네모의 **다섯 배 안팎**이었다 — 그 흐린 네모가 곧 자국이다.
        벽시계 4.8배 → 1.3배 · 이름표 8.8배 → 2.1배 · 큰 간판 5.4배 → 1.4배

   ⚠ 둘레를 넓게 뜨는 것은 모델에게 «보여 주기» 위한 것이지 **되붙이기 위한 것이 아니다.**
     이 검사가 그 둘을 갈라 놓는다 — 다시 하나로 합치면 자국이 도로 커진다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

function client() {
  const ctx = { document: {}, Math: Math, Number: Number, String: String, Promise: Promise, Error: Error };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-photo-edit.js'), 'utf8'), ctx);
  return ctx.PuPhotoEdit;
}
const C = client();

/* ── ① 모델이 볼 배경 ── */

test('★★ 작은 것을 지울 때도 «배경이 보일 만큼» 넓게 뜬다', () => {
  /* 벽시계 하나 — 대표가 실제로 지우려던 것이다(STATUS 2026-08-29) */
  const s = C.cropSpec({ x: .52, y: .10, w: .06, h: .08 }, 2000, 1500);
  assert.ok(Math.min(s.sw, s.sh) >= 512,
    '★★ 조각이 ' + s.sw + '×' + s.sh + ' 입니다 — 모델이 메울 배경을 못 봅니다');
  /* 아주 작은 네모는 더 심했다 */
  const t = C.cropSpec({ x: .30, y: .70, w: .03, h: .016 }, 2000, 1500);
  assert.ok(Math.min(t.sw, t.sh) >= 512,
    '★★ 60×24px 짜리를 지울 때 조각이 ' + t.sw + '×' + t.sh + ' 입니다');
});

test('★ 넓게 떠도 «보내는 양»은 한도 안이다 — 넓히기가 요금을 올리면 안 된다', () => {
  [[.52, .10, .06, .08], [.30, .70, .03, .016], [0, 0, .05, .067]].forEach(function (b) {
    const s = C.cropSpec({ x: b[0], y: b[1], w: b[2], h: b[3] }, 2000, 1500);
    assert.ok(Math.max(s.outW, s.outH) <= 1024,
      /* 검사고정-허용: 1024px 은 값이 아니라 규칙이다 — 기존 검사와 같은 잣대다 */
      '★ 넓히면서 보내는 크기까지 커졌습니다 (' + s.outW + '×' + s.outH + ')');
  });
});

test('★★ 모서리에 있는 것도 반쪽이 되지 않는다 — 그때가 제일 어렵다', () => {
  /* 왼쪽 위 구석. 가운데를 붙잡고 펴면 한쪽이 잘리므로 «모자란 만큼 반대쪽»에서 받아 온다. */
  const s = C.cropSpec({ x: 0, y: 0, w: .05, h: .067 }, 2000, 1500);
  assert.equal(s.sx, 0);
  assert.equal(s.sy, 0);
  assert.ok(s.sw >= 512 && s.sh >= 512,
    '★★ 구석에서 조각이 ' + s.sw + '×' + s.sh + ' 로 줄었습니다');
  /* 오른쪽 아래 구석도 사진 밖으로 안 넘친다 */
  const e = C.cropSpec({ x: .95, y: .93, w: .05, h: .067 }, 2000, 1500);
  assert.ok(e.sx + e.sw <= 2000 && e.sy + e.sh <= 1500, '★ 사진 밖으로 넘칩니다');
  assert.ok(e.sw >= 512 && e.sh >= 512);
});

test('★ 사진보다 크게 뜨지 않는다 — 작은 사진에서 그 자리에서 멎으면 안 된다', () => {
  const s = C.cropSpec({ x: .4, y: .4, w: .1, h: .1 }, 400, 300);
  assert.ok(s, '작은 사진에서 아무것도 못 만들었습니다');
  assert.ok(s.sw <= 400 && s.sh <= 300, '★ 사진보다 크게 떴습니다');
  assert.equal(s.sh, 300, '작은 사진에서는 있는 만큼 다 봅니다');
});

/* ── ② 되붙이는 자리 ── */

test('★★ 되붙이는 자리는 «지운 네모 둘레»뿐이다 — 조각 전체를 덮으면 자국이 다섯 배가 된다', () => {
  const box = { x: .52, y: .10, w: .06, h: .08 };
  const s = C.cropSpec(box, 2000, 1500);
  const boxArea = (box.w * 2000) * (box.h * 1500);
  const backArea = s.bw * s.bh;
  const cropArea = s.sw * s.sh;
  assert.ok(backArea < cropArea / 2,
    '★★ 조각(' + s.sw + '×' + s.sh + ') 만큼을 통째로 덮고 있습니다 — 그 넓이가 다 흐려집니다');
  assert.ok(backArea / boxArea < 2,
    '★★ 지운 네모의 ' + (backArea / boxArea).toFixed(1) + '배를 덮습니다');
  /* 그래도 네모는 **다 덮어야** 한다 — 안 덮으면 지운 자리가 도로 나타난다 */
  assert.ok(s.bx <= s.sx + s.mx && s.by <= s.sy + s.my,
    '★★ 지울 네모의 왼쪽·위가 안 덮입니다 — 지운 것이 도로 보입니다');
  assert.ok(s.bx + s.bw >= s.sx + s.mx + s.mw && s.by + s.bh >= s.sy + s.my + s.mh,
    '★★ 지울 네모의 오른쪽·아래가 안 덮입니다');
});

test('★ 되붙이는 자리는 조각 «안»에 있다 — 밖이면 없는 화소를 붙인다', () => {
  [[0, 0, .05, .067], [.95, .93, .05, .067], [.4, .4, .2, .2]].forEach(function (b) {
    const s = C.cropSpec({ x: b[0], y: b[1], w: b[2], h: b[3] }, 2000, 1500);
    assert.ok(s.bx >= s.sx && s.by >= s.sy, '★ 되붙일 자리가 조각보다 앞에 있습니다');
    assert.ok(s.bx + s.bw <= s.sx + s.sw && s.by + s.bh <= s.sy + s.sh,
      '★ 되붙일 자리가 조각 밖으로 넘칩니다');
  });
});

/* pasteBack 을 실제로 돌려 «어디를 어디에» 그리는지 본다 */
function canvasSpy(log) {
  return function (w, h) {
    return {
      width: w, height: h,
      getContext: function () {
        return {
          drawImage: function () { log.push(['draw'].concat([].slice.call(arguments, 1))); },
          fillRect: function () {}, set fillStyle(v) {}
        };
      },
      toDataURL: function () { return 'data:image/jpeg;base64,OUT'; }
    };
  };
}
const fakeImg = function (w, h) { return { naturalWidth: w, naturalHeight: h }; };

test('★★ 실제로 그려 본다 — 조각의 «그 부분»을 사진의 «그 자리»에 놓는다', () => {
  const s = C.cropSpec({ x: .52, y: .10, w: .06, h: .08 }, 2000, 1500);
  const log = [];
  /* 모델이 보낸 크기가 보낸 크기와 «다를» 때도 자리가 맞아야 한다 — 비율로 옮긴다 */
  C.pasteBack(fakeImg(2000, 1500), s, fakeImg(1024, 1024), { makeCanvas: canvasSpy(log) });
  const draws = log.filter(function (x) { return x[0] === 'draw'; });
  assert.equal(draws.length, 2, '원본 한 번 + 조각 한 번이어야 합니다');
  const p = draws[1];
  const src = p.slice(1, 5), dst = p.slice(5);
  assert.deepEqual(dst, [s.bx, s.by, s.bw, s.bh],
    '★★ 놓는 자리가 되붙일 자리와 다릅니다 — 엉뚱한 데가 덮입니다');
  /* 떠 오는 자리는 조각(1024×1024) 안이어야 한다 */
  assert.ok(src[0] >= 0 && src[1] >= 0, '★ 조각 밖에서 떠 옵니다');
  assert.ok(src[0] + src[2] <= 1024 && src[1] + src[3] <= 1024,
    '★★ 조각 밖에서 떠 옵니다 — 빈 화소가 붙어 그 자리가 비칩니다');
  /* 비율이 맞는가 — 되붙일 자리가 조각의 몇 분의 몇인가 */
  const wantW = s.bw / s.sw * 1024;
  assert.ok(Math.abs(src[2] - wantW) <= 2,
    '★★ 크기 비가 안 맞습니다 — 지운 자리가 밀리거나 늘어납니다 (' + src[2] + ' vs ' + Math.round(wantW) + ')');
});

test('옛 사진(되붙일 자리가 없는 것)은 조각 전체를 덮는다 — 그 자리에서 멎지 않는다', () => {
  const log = [];
  C.pasteBack(fakeImg(2000, 1500), { sx: 100, sy: 80, sw: 300, sh: 200, outW: 300, outH: 200 },
    fakeImg(300, 200), { makeCanvas: canvasSpy(log) });
  const p = log.filter(function (x) { return x[0] === 'draw'; })[1];
  assert.deepEqual(p.slice(5), [100, 80, 300, 200]);
});
