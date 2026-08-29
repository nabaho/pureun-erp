/* 그은 자리와 네모가 «같은 자리»에 있어야 한다
   (대표 보고 2026-08-29: "마우스의 위치와 박스가 생성되는 위치가 다르다 완전히 이상하다")

   ■ 무엇이 어긋났나 — 브라우저에서 실제로 재 본 값
     네모 그리는 칸(#maskWrap)  1384×744
     긋기가 재는 칸(#maskImg)   1384×**1038**
     → 세로로 147px 밀리고 배율이 **1.395배** 어긋난다.
       사진이 칸보다 294px 커서 위아래가 **잘려 나가기까지** 했다.

   ■ 왜
     긋기 층(js/pu-rrn-mask-ui.js)은 **사진**을 재고(getBoundingClientRect),
     그어 놓은 네모와 미리보기는 **칸**을 기준으로 %로 그린다. 둘이 한 자리가
     아니면 어긋난다. 그런데 사진에 걸어 둔 `max-height:100%` 의 100% 는
     **어미 칸의 높이**를 뜻하는데 그 칸의 높이가 auto 였다 —
     **정해지지 않은 높이의 100% 는 없는 것으로 친다.** 높이 제한이 통째로 사라졌다.

   ■ 고침 셋 (셋이 함께 있어야 뜻이 있다)
     ① 칸에 «정해진 높이»(height:100%) — 그래야 100% 가 뜻을 갖는다
     ② 칸에 «사진의 본디 비»(maskFitWrap) — 그래야 칸이 사진보다 넓거나 좁아지지 않는다
     ③ 사진은 칸을 «그대로 채운다»(width/height 100%) — max- 로 다시 재면 ①의 병이 되돌아온다

   ■ 고친 뒤 재 본 값 (진짜 파일의 규칙·짜임을 그대로 떠서)
     큰 사진 가로 2000×1500 : 칸 992×744 = 사진 992×744  어긋남 0,0 · 배율 1.000
     큰 사진 세로 1500×2000 : 칸 558×744 = 사진 558×744  어긋남 0,0 · 배율 1.000

   ⚠ 옆 칸(작은 판)은 «건드리지 않았다» — 거기는 맞게 돌고 있다(440×330 = 440×330).
     비를 박으면 52vh 한도와 부딪쳐 오히려 어긋난다. 고장 안 난 것은 안 건드린다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 규칙 한 덩이를 떠 온다 — 주석은 걷고 본다 */
function ruleOf(sel) {
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf(sel + '{');
  assert.ok(at >= 0, sel + ' 규칙이 없어졌습니다');
  return css.slice(at + sel.length + 1, css.indexOf('}', at));
}

/* ── ① 칸에 정해진 높이 ── */

test('★★ 큰 판에 «정해진 높이»가 있다 — 없으면 사진의 100% 가 조용히 사라진다', () => {
  const r = ruleOf('#viewerEdit .maskwrap.big');
  assert.match(r, /(^|;)height:100%/,
    '★★ 칸 높이가 auto 입니다 — 사진의 max-height:100% 가 «없는 것»이 되어\n' +
    '  사진이 칸보다 커지고, 그은 자리와 네모가 1.4배 어긋납니다(2026-08-29 그 사고).');
});

/* ── ③ 사진은 칸을 그대로 채운다 ── */

test('★★ 사진이 칸을 «그대로» 채운다 — 다시 재는 순간 어긋남이 돌아온다', () => {
  const r = ruleOf('#viewerEdit .maskwrap.big img');
  assert.match(r, /(^|;)width:100%/, '★★ 사진 너비가 칸과 다를 수 있습니다');
  assert.match(r, /(^|;)height:100%/, '★★ 사진 높이가 칸과 다를 수 있습니다');
  /* 여기가 핵심이다 — 되돌리기 쉬운 자리라 못을 박는다 */
  assert.ok(!/max-height:\s*\d+%/.test(r),
    '★★ 백분율 max-height 가 돌아왔습니다 — 어미 높이가 정해지지 않으면 없는 것이 되고,\n' +
    '  그것이 2026-08-29 「마우스와 박스 위치가 다르다」의 원인이었습니다.');
  assert.ok(!/max-width:\s*\d+%/.test(r), '★★ 백분율 max-width 도 같은 병입니다');
  assert.match(r, /object-fit:contain/, '넘치거나 찌그러지지 않게 합니다');
});

/* ── ② 칸에 사진의 본디 비 ── */

function fit() {
  const wrap = { classList: { contains: function (c) { return c === 'big'; } }, style: {} };
  const ctx = { $: function (id) { return id === 'maskWrap' ? wrap : null; } };
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function maskFitWrap('), ctx);
  return { fn: ctx.maskFitWrap, wrap: wrap };
}

test('★★ 사진의 본디 비를 칸에 박는다 — 칸이 사진보다 넓거나 좁아질 수 없게', () => {
  const f = fit();
  f.fn({ naturalWidth: 2000, naturalHeight: 1500 });
  assert.equal(f.wrap.style.aspectRatio, '2000 / 1500',
    '★★ 비를 안 박으면 칸이 사진과 다른 크기가 됩니다');
  f.fn({ naturalWidth: 1500, naturalHeight: 2000 });
  assert.equal(f.wrap.style.aspectRatio, '1500 / 2000', '세로 사진도 따라가야 합니다');
});

test('★ 옆 칸에는 안 건다 — 고장 안 난 것을 건드리면 거기가 어긋난다', () => {
  const wrap = { classList: { contains: function () { return false; } }, style: {} };
  const ctx = { $: function () { return wrap; } };
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function maskFitWrap('), ctx);
  ctx.maskFitWrap({ naturalWidth: 2000, naturalHeight: 1500 });
  assert.equal(wrap.style.aspectRatio, undefined,
    '★ 옆 칸(52vh 한도)에 비를 박으면 거기가 어긋납니다');
});

test('★ 크기를 모르면 아무것도 안 한다 — 0 을 박으면 칸이 사라진다', () => {
  const f = fit();
  f.fn({ naturalWidth: 0, naturalHeight: 0 });
  assert.equal(f.wrap.style.aspectRatio, undefined);
  f.fn(null);
  assert.equal(f.wrap.style.aspectRatio, undefined, '그 자리에서 멎으면 화면이 통째로 빕니다');
  /* 칸이 아직 없을 때도 멎지 않는다 */
  const ctx = { $: function () { return null; } };
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function maskFitWrap('), ctx);
  ctx.maskFitWrap({ naturalWidth: 100, naturalHeight: 50 });
});

test('★★ 사진을 다 불러오면 «실제로» 부른다 — 안 부르면 비가 영영 안 박힌다', () => {
  const fn = cutFn(APP, 'function maskWrapHtml(');
  assert.match(fn, /onload="maskFitWrap\(this\)"/,
    '★★ 비를 박는 함수를 만들어 놓고 부르지 않습니다 — 고친 것이 하나도 안 걸립니다');
  /* 옆 칸·큰 사진이 같은 짜임을 쓰므로 한 곳에만 붙이면 된다 */
  assert.equal((APP.match(/id="maskImg"/g) || []).length, 1,
    '★★ maskImg 가 둘이 되었습니다 — 긋기 층이 어느 쪽을 잡을지 모릅니다');
});

/* ── 어긋나면 어떻게 되는지, 셈으로 한 번 더 ── */

test('★★ 칸과 사진이 다르면 그은 자리가 어디로 가는지 — 그 셈을 남겨 둔다', () => {
  /* 긋기: 사진 기준 픽셀 → 사진 크기로 나눈 비율. 네모: 그 비율 × 칸 크기.
     둘이 다르면 이만큼 어긋난다. 실제로 겪은 값(1384×744 칸 · 1384×1038 사진). */
  const wrapH = 744, imgH = 1038, imgTop = -147;   // 칸 위쪽을 0 으로 본 사진의 위쪽
  function drawnAt(clickY) {
    const ratio = (clickY - imgTop) / imgH;        // 긋기 층이 셈하는 비율(사진 기준)
    return ratio * wrapH;                          // 네모가 그려지는 자리(칸 기준)
  }
  /* ⚠ **어긋남이 자리마다 다르고 «방향»까지 뒤집힌다** —
       위쪽을 누르면 아래로, 아래쪽을 누르면 위로 밀리고 가운데만 맞는다.
       그래서 「조금 밀린다」가 아니라 **「완전히 이상하다」**로 느껴진다.
       한 곳에서만 재고 「대충 맞네」로 넘기면 안 되는 까닭이다. */
  const off = [0, 200, 400, 600, 744].map(function (y) { return Math.round(drawnAt(y) - y); });
  assert.equal(off.join(','), '105,49,-8,-65,-105',
    '이 셈이 달라졌으면 위에 옮겨 적은 값이 틀린 것입니다');
  assert.ok(off[0] > 100 && off[4] < -100,
    '위아래 끝에서 100px 넘게, 그것도 **반대 방향**으로 밀린다 — 그것이 대표께서 보신 것입니다');
  /* 칸과 사진이 같으면 어디를 눌러도 그대로다 — 고친 뒤가 이 자리다 */
  [0, 200, 400, 600, 744].forEach(function (y) {
    assert.equal(Math.round((y / wrapH) * wrapH), y);
  });
});
