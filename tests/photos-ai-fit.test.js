/* AI 지우기 — 「흐리게 나왔다」를 «숫자로» 재고, 돈 쓰기 전에 말한다
   (대표 지시 2026-08-30 「1번부터 순서대로」)

   ■ 남아 있던 일이 무엇이었나
   STATUS 에 「실사진으로 해 보고 시원찮으면 조각 크기(MAX_EDGE·MIN_CROP)를 맞춘다」가
   여러 날 남아 있었다. 그런데 **시원찮은지를 잴 눈금이 없었다.** 눈대중으로만 말하면
   조율값을 어느 쪽으로 얼마나 옮길지 영영 못 정한다.

   ■ 무엇을 재나 — 「원본 1픽셀을 조각 몇 픽셀이 그렸나」
   되붙일 때 조각에서 (bw/sw × 돌아온너비) 만큼을 떠서 원본 bw 픽셀에 그린다.
   그러니 배수 = **돌아온너비 ÷ 자른너비(sw)**.
     1.0 이상 → 줄여 붙인다. 또렷하다.
     1.0 미만 → 늘려 붙인다. **그 자리가 흐려진다** — 그것이 「시원찮다」의 정체다.

   ■ 브라우저에서 실제 크기로 재 본 것(돌아온 것 1024 가정)
     폰 사진 4032×3024 — 칠한 넓이가 짧은 변의 **12%** 를 넘으면 흐려진다
     줄여 담은 2000×1500 — **24%** 를 넘으면 흐려진다
     팩스 tif 1656×2271 — **24%** 를 넘으면 흐려진다
   ★ 여기서 나온 결론: **조각을 크게 보낸다고 안 흐려진다.** 배수는 돌아온 크기 ÷
     자른 크기라, 우리가 보내는 크기(MAX_EDGE)와 상관이 없다. 답은 «나눠서 칠하기»다.

   ■ 그래서 이 검사가 지키는 것 셋
     ① 재는 셈이 맞다 (돌아온것 ÷ 자른것)
     ② 여러 군데면 **가장 나쁜 것**을 남긴다 — 한 군데만 흐려도 사진은 흐리다
     ③ **요금을 치르기 전에** 말한다 — 흐린 것을 치른 뒤에 아는 것은 늦다 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const CODE = stripComments(APP);

/* 계산 층을 진짜로 싣는다 */
function lib() {
  const ctx = { window: {}, Math: Math, Number: Number, String: String, Promise: Promise,
    Error: Error, JSON: JSON };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-photo-edit.js'), 'utf8'), ctx);
  return ctx.window.PuPhotoEdit || ctx.PuPhotoEdit;
}

/* ── ① 재는 셈 ── */

test('★★ 「원본 1픽셀당 조각 몇 픽셀」을 잰다 — 이 숫자가 곧 또렷함이다', () => {
  const E = lib();
  const spec = { sw: 512, sh: 512, outW: 512, outH: 512 };
  const f = E.fitOf(spec, { naturalWidth: 1024, naturalHeight: 1024 });
  assert.equal(f.per, 2, '★★ 1024 를 512 에 붙이면 2배입니다');
  /* ⚠ **보낸 크기(outW)가 아니라 자른 크기(sw)** 로 나눈다 — 되붙는 곳이 원본이라서다.
     outW 로 재면 크게 칠해도 늘 1.0 근처가 나와 «흐린 것을 못 잡는다». */
  const big = E.fitOf({ sw: 2048, sh: 2048, outW: 768, outH: 768 },
    { naturalWidth: 1024, naturalHeight: 1024 });
  assert.equal(big.per, 0.5,
    '★★ 보낸 크기로 재고 있습니다 — 넓게 칠한 것이 흐린 줄을 모르게 됩니다');
  /* ⚠ **너비끼리** 견준다. 세로로 긴 조각에서 높이로 재면 실제보다 또렷하다고 나온다
     (돌연변이에서 살아남던 자리다 — 정사각으로만 시험하면 안 갈린다). */
  const tall = E.fitOf({ sw: 512, sh: 1024, outW: 384, outH: 768 },
    { naturalWidth: 512, naturalHeight: 1024 });
  assert.equal(tall.per, 1,
    '★★ 너비가 아니라 높이로 재고 있습니다 — 세로로 긴 자리에서 거짓말을 합니다');
});

test('★ 돌아온 것이 없으면 «없다»고 한다 — 0 이나 1 로 꾸며 대지 않는다', () => {
  const E = lib();
  assert.equal(E.fitOf({ sw: 512, sh: 512 }, null), null);
  assert.equal(E.fitOf({ sw: 512, sh: 512 }, { naturalWidth: 0, naturalHeight: 0 }), null);
  assert.equal(E.fitOf(null, { naturalWidth: 512 }), null);
});

test('★★ 실제 사진 크기로 «언제부터» 흐려지는지가 지금 값과 맞는다', () => {
  /* ⚠ 이 숫자를 못 박는 것이 아니라 **관계**를 못 박는다 — 넓게 칠할수록 나빠지고,
     어느 지점부터는 1.0 아래로 떨어진다. 조율값을 바꾸면 지점이 옮겨질 뿐이다. */
  const E = lib();
  const per = function (w, h, side) {
    const box = { x: 0.5 - side / 2, y: 0.5 - side / 2, w: side, h: side };
    const s = E.cropSpec(box, w, h);
    return s ? E.fitOf(s, { naturalWidth: 1024, naturalHeight: 1024 }).per : null;
  };
  /* 좁게 칠하면 또렷하다 */
  assert.ok(per(4032, 3024, 0.03) >= 1.5, '★ 좁게 칠했는데도 흐립니다');
  /* 넓게 칠하면 흐려진다 */
  assert.ok(per(4032, 3024, 0.35) < 1, '★★ 넓게 칠해도 안 흐리다고 잽니다 — 셈이 틀렸습니다');
  /* 넓힐수록 «단조롭게» 나빠진다 — 중간에 좋아지면 셈이 어긋난 것이다 */
  const seq = [0.05, 0.10, 0.20, 0.35, 0.60].map(function (s) { return per(4032, 3024, s); });
  for (let i = 1; i < seq.length; i++) {
    assert.ok(seq[i] <= seq[i - 1],
      '★★ 넓게 칠했는데 더 또렷해집니다 — 셈이 어긋났습니다: ' + seq.join(' → '));
  }
});

/* ── ② 여러 군데면 가장 나쁜 것 ── */

test('★★ 여러 군데면 «가장 나쁜 것»을 남긴다 — 한 군데만 흐려도 사진은 흐리다', () => {
  const fn = cutFn(APP, 'async function edRun(');
  assert.match(fn, /if \(f && \(!fit \|\| f\.per < fit\.per\)\) fit = f/,
    '★★ 마지막 것으로 덮어씁니다 — 앞에서 흐렸던 것이 사라집니다');
  assert.match(fn, /want: did, fit: fit/, '★ 잰 것을 결과에 안 싣습니다');
});

test('★★ 잰 것을 «기록에도» 남긴다 — 창을 닫으면 답이 사라진다', () => {
  const fn = cutFn(APP, 'async function edKeep(');
  assert.match(fn, /fit: photoEd\.done\.fit \|\| null/,
    '★★ 화면에서만 보여 주면, 창을 닫는 순간 조율의 근거가 없어집니다');
});

test('★ 또렷할 때와 흐릴 때 «말이 다르다» — 늘 같은 말이면 아무도 안 읽는다', () => {
  const fn = cutFn(APP, 'function edFitNote(');
  assert.match(fn, /const soft = f\.per < 1/, '★ 흐린지 안 가립니다');
  assert.match(fn, /흐릴 수 있습니다/, '★ 흐릴 때 말이 없습니다');
  assert.match(fn, /나눠서 칠하면/, '★★ 어떻게 하라는 것인지 안 말합니다');
  assert.match(fn, /요금은 군데 수만큼으로 같습니다/,
    '★ 나누면 요금이 더 드는 줄 아시면 안 나눕니다');
  assert.match(fn, /^\s*if \(!f \|\| !f\.per\) return '';/m, '★ 잰 것이 없을 때 빈 칸을 그립니다');
  /* 결과 화면이 실제로 그 줄을 부른다 */
  assert.match(cutFn(APP, 'function edPanelHtml('), /edFitNote\(e\.done\.fit\)/,
    '★★ 만들어 놓고 화면에 안 냅니다');
});

/* ── ③ 요금을 치르기 «전에» ── */

test('★★ 흐릴 것 같으면 «누르기 전에» 말한다 — 치른 뒤에 아는 것은 늦다', () => {
  const fn = cutFn(APP, 'async function edRun(');
  const askAt = fn.indexOf('confirm(');
  const softAt = fn.indexOf('edSoftAreas(');
  assert.ok(softAt > 0 && softAt < askAt,
    '★★ 물어본 «뒤»에 재고 있습니다 — 그때는 이미 요금이 나갑니다');
  assert.match(fn, /흐리게\*\* 나올 수 있습니다/, '★ 미리 하는 말에 「흐리다」가 없습니다');
  assert.match(fn, /나눠서 칠하시면 또렷해집니다/, '★★ 어떻게 하라는 것인지 안 말합니다');
  /* ⚠ 만들어 놓고 **묻는 말에 안 넣으면** 아무 데도 안 나온다
     (돌연변이에서 살아남던 자리다 — 글자만 있고 쓰이지 않았다). */
  assert.match(fn, /softLine/, '★★ 미리 하는 말을 만들어 놓고 안 씁니다');
  const ask = fn.slice(fn.indexOf('confirm('), fn.indexOf('계속할까요'));
  assert.match(ask, /softLine/, '★★ 묻는 말에 그 줄이 안 들어갑니다');
  /* 흐리지 않으면 «아무 말도 안 한다» — 늘 뜨면 아무도 안 읽는다 */
  assert.match(fn, /soft\.length\s*\?/, '★ 흐릴 때만 말하는 갈래가 없습니다');
});

test('★★ 미리 재는 셈이 «나중에 재는 셈»과 같다 — 다르면 둘 중 하나가 거짓말이다', () => {
  const E = lib();
  const ctx = {
    Math: Math, Number: Number, String: String, isFinite: isFinite,
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    window: { PuPhotoEdit: E }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['function edBackPx(', 'function noteEdBackPx(', 'function edSoftAreas(']
    .forEach(function (n) { vm.runInContext(cutFn(APP, n), ctx); });
  /* ⚠ vm 안에서 const 로 선언하면 «바깥에서 안 보인다» — var 로 바꿔 넣는다 */
  vm.runInContext((APP.match(/const ED_BACK_PX_KEY[^\n]*/)[0] + '\n' +
    APP.match(/const ED_BACK_PX_GUESS[^\n]*/)[0]).replace(/\bconst /g, 'var '), ctx);

  const img = { naturalWidth: 4032, naturalHeight: 3024 };
  const wide = { x: 0.3, y: 0.3, w: 0.35, h: 0.35 };
  const tiny = { x: 0.48, y: 0.48, w: 0.03, h: 0.03 };
  const soft = ctx.edSoftAreas([wide, tiny], img);
  assert.equal(soft.length, 1, '★★ 넓은 것 하나만 흐려야 합니다: ' + JSON.stringify(soft));
  assert.equal(soft[0].i, 1, '★ 몇 번째가 흐린지 잘못 셉니다');

  /* 같은 자리를 «나중에 재는 셈»으로 재면 같은 값이 나와야 한다 */
  const spec = E.cropSpec(wide, 4032, 3024);
  const after = E.fitOf(spec, { naturalWidth: ctx.ED_BACK_PX_GUESS,
    naturalHeight: ctx.ED_BACK_PX_GUESS });
  assert.equal(soft[0].per, after.per,
    '★★ 미리 잰 값과 나중 값이 다릅니다 — 「흐리다」고 해 놓고 또렷하게 나오거나 그 반대입니다');
});

test('★★ 한 번 불러 봤으면 «짐작을 사실로» 바꾼다', () => {
  const E = lib();
  const mem = {};
  const ctx = {
    Math: Math, Number: Number, String: String, isFinite: isFinite,
    localStorage: {
      getItem: function (k) { return mem[k] === undefined ? null : mem[k]; },
      setItem: function (k, v) { mem[k] = String(v); }
    },
    window: { PuPhotoEdit: E }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['function edBackPx(', 'function noteEdBackPx('].forEach(function (n) {
    vm.runInContext(cutFn(APP, n), ctx);
  });
  /* ⚠ vm 안에서 const 로 선언하면 «바깥에서 안 보인다» — var 로 바꿔 넣는다 */
  vm.runInContext((APP.match(/const ED_BACK_PX_KEY[^\n]*/)[0] + '\n' +
    APP.match(/const ED_BACK_PX_GUESS[^\n]*/)[0]).replace(/\bconst /g, 'var '), ctx);

  assert.equal(ctx.edBackPx(), ctx.ED_BACK_PX_GUESS, '★ 처음에는 짐작으로 잽니다');
  ctx.noteEdBackPx({ back: '1536×1152' });
  assert.equal(ctx.edBackPx(), 1536, '★★ 진짜로 돌아온 크기를 안 씁니다 — 짐작이 그대로 남습니다');
  /* 터무니없는 값은 안 받는다 */
  ctx.noteEdBackPx({ back: '3×2' });
  assert.equal(ctx.edBackPx(), 1536, '★ 말 안 되는 값에 덮어씁니다');
  ctx.noteEdBackPx(null);
  assert.equal(ctx.edBackPx(), 1536);
  /* ⚠ 적어 두기만 하고 **부르는 곳이 없으면** 짐작이 영영 그대로다
     (돌연변이에서 살아남던 자리다 — 함수는 있는데 아무도 안 불렀다). */
  const run = cutFn(APP, 'async function edRun(');
  assert.match(run, /noteEdBackPx\(f\)/,
    '★★ 진짜로 돌아온 크기를 적어 두지 않습니다 — 다음에도 짐작으로 미리 알립니다');
  const at = run.indexOf('noteEdBackPx(f)');
  assert.ok(at > run.indexOf('fitOf(cut.spec, patch)'),
    '★ 재기도 전에 적습니다');
});

test('★ 기억 칸이 막혀 있어도 «지우기는 된다» — 사생활 모드', () => {
  const E = lib();
  const ctx = {
    Math: Math, Number: Number, String: String, isFinite: isFinite,
    localStorage: {
      getItem: function () { throw new Error('막힘'); },
      setItem: function () { throw new Error('막힘'); }
    },
    window: { PuPhotoEdit: E }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['function edBackPx(', 'function noteEdBackPx('].forEach(function (n) {
    vm.runInContext(cutFn(APP, n), ctx);
  });
  /* ⚠ vm 안에서 const 로 선언하면 «바깥에서 안 보인다» — var 로 바꿔 넣는다 */
  vm.runInContext((APP.match(/const ED_BACK_PX_KEY[^\n]*/)[0] + '\n' +
    APP.match(/const ED_BACK_PX_GUESS[^\n]*/)[0]).replace(/\bconst /g, 'var '), ctx);
  assert.equal(ctx.edBackPx(), ctx.ED_BACK_PX_GUESS, '★ 막히면 그 자리에서 터집니다');
  ctx.noteEdBackPx({ back: '1024×768' });   // 터지면 안 된다
});

/* ── 캐시 번호 ── */

test('★★ 편집 층을 고쳤으면 «캐시 번호»가 올라가 있다', () => {
  /* ⚠ 안 올리면 브라우저가 옛 파일을 그대로 써서, 고친 것이 배포돼도 안 보인다
     (저장소에서 실제로 겪은 사고다 — 서식 수정이 통째로 묻혔다). */
  const m = /js\/pu-photo-edit\.js\?v=(\d+)/.exec(APP);
  assert.ok(m, '★★ 캐시 번호가 아예 없습니다');
  assert.ok(Number(m[1]) >= 5,
    '★★ 편집 층에 fitOf 를 더했는데 캐시 번호가 ' + m[1] + ' 입니다 — 올려 주세요');
  assert.match(CODE, /fitOf/, '★ 화면이 fitOf 를 안 씁니다');
});
