/* 명함을 리멤버로도 보내기 (대표 지시 2026-08-27, 승인 목업 docs/mockups/card-to-remember.html)

   "폰에서 사진찍고 자동으로 리멤버로 보내기 만들어 달라.
    리멤버에 다시 올리는 버튼 누르고 싶지 않다."

   ⚠ 웹은 다른 앱을 골라 파일을 밀어넣을 수 없다(브라우저가 막았다). 없앨 수 있는 것은
     «따로 누르는 단추»다 — 저장을 누르면 보내기 목록이 저절로 뜬다.

   ★ 이 검사가 지키는 것 셋. 셋 다 «조용히» 어긋나는 것들이다:
     ① **저장이 먼저다.** 보내기를 기다렸다가 올리면, 대표님이 리멤버로 넘어간 뒤에
        올리기가 시작돼 **사진이 사진첩에 안 담길 수 있다.**
     ② **누른 그 순간에 불러야 한다.** 브라우저는 「사람이 방금 누름」이 살아 있을 때만
        보내기 창을 띄운다. 올리기를 기다린 뒤에 부르면 조용히 거절당한다.
     ③ **켠 것을 기억해야 한다.** 매번 켜야 하면 그것이 곧 「단추 누르기」다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ── ③ 켠 것을 기억한다 ── */

test('★ 한 번 켜면 다음부터 그대로다 — 매번 켜야 하면 그것이 단추 누르기다', () => {
  const ctx = { localStorage: (function () {
    const m = {};
    return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } };
  })() };
  ctx.$ = function () { return null; };
  vm.createContext(ctx);
  vm.runInContext(APP.match(/const CARD_SHARE_LS = '[^']*';/)[0] + '\n' +
    cutFn(APP, 'function cardShareToPref(') + '\n' +
    cutFn(APP, 'function setCardShareToPref('), ctx);
  assert.equal(ctx.cardShareToPref(), false, '★ 처음부터 켜져 있으면 안 됩니다 — 남의 앱으로 사진이 나갑니다');
  ctx.setCardShareToPref(true);
  assert.equal(ctx.cardShareToPref(), true, '★ 켠 것이 안 남습니다 — 찍을 때마다 다시 켜야 합니다');
  ctx.setCardShareToPref(false);
  assert.equal(ctx.cardShareToPref(), false);
});

/* ── 승인한 세 가지 ── */

test('★ 흐리거나 작게 찍힌 장은 빼고 보낸다 — 잘못 읽으면 고치는 게 더 일이다', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function cardSharePick('), ctx);
  const out = ctx.cardSharePick([
    { id: 'a' }, { id: 'b', small: true }, { id: 'c', blurry: true }, { id: 'd' }
  ]);
  assert.equal(out.map(function (s) { return s.id; }).join(','), 'a,d');
  assert.equal(ctx.cardSharePick([]).length, 0);
  assert.equal(ctx.cardSharePick(null).length, 0, '아무것도 없을 때 그 자리에서 멎으면 저장까지 멈춥니다');
});

test('★ 앞·뒷면을 갈라내지 않는다 — 리멤버도 앞뒤를 받는다 (대표 승인 ㉮)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function cardSharePick('), ctx);
  const out = ctx.cardSharePick([{ id: 'front', pairWith: -1 }, { id: 'back', pairWith: 0 }]);
  assert.equal(out.length, 2, '★ 뒷면을 버리면 리멤버에 앞면만 들어갑니다');
});

test('★ 명함·서류일 때만 보낸다 — 계약서·근태를 리멤버로 보낼 일은 없다', () => {
  const fn = cutFn(APP, 'function shareCardsOut(');
  assert.match(fn, /if \(!frameOn\(\) \|\| !cardShareToPref\(\) \|\| !canShareFiles\(\)\) return;/,
    '★ 갈래·설정·폰 셋 중 하나라도 안 보면 엉뚱한 것이 남의 앱으로 나갑니다');
});

/* ── ① 저장이 먼저다 ── */

test('★★ 보내기를 «기다리지» 않는다 — 기다리면 사진이 사진첩에 안 담길 수 있다', () => {
  const fn = cutFn(APP, 'async function camUpload(');
  assert.match(fn, /\n  shareCardsOut\(picked\);/,
    '★ 보내기를 아예 안 부릅니다');
  assert.ok(!/await shareCardsOut/.test(fn),
    '★★ 기다리고 있습니다 — 대표님이 리멤버로 넘어간 뒤에 올리기가 시작돼\n' +
    '  사진이 사진첩에 안 담길 수 있습니다. 저장이 먼저입니다.');
  /* 보내는 쪽도 스스로 기다리면 안 된다 */
  const out = cutFn(APP, 'function shareCardsOut(');
  assert.ok(out.indexOf('await ') < 0, '★★ 보내는 쪽이 기다리면 부른 쪽이 함께 멈춥니다');
  /* ⚠ cutFn 은 'function' 부터 떠 오므로 앞에 붙은 async 를 못 본다 — 원문에서 본다.
     지금은 async 만으로 동작이 깨지진 않지만, 그 안에 await 한 줄이 들어오는 순간
     저장이 보내기를 기다리게 된다. 문을 아예 잠가 둔다. */
  assert.ok(APP.indexOf('async function shareCardsOut') < 0,
    '★★ 기다릴 수 있게 열어 두었습니다 — 여기에 await 이 한 줄 들면 저장이 멈춥니다');
  assert.match(APP, /\n *function shareCardsOut\(/);
});

/* ── ② 누른 그 순간에 부른다 ── */

test('★★ 아무것도 기다리기 «전에» 부른다 — 늦으면 브라우저가 조용히 거절한다', () => {
  const fn = cutFn(APP, 'async function camUpload(');
  const callAt = fn.indexOf('shareCardsOut(picked);');
  const firstAwait = fn.indexOf('await ');
  assert.ok(callAt > 0 && firstAwait > 0);
  assert.ok(callAt < firstAwait,
    '★★ 기다린 뒤에 부릅니다 — 「사람이 방금 누름」이 꺼져 보내기 창이 안 뜹니다.\n' +
    '  아무 말도 안 뜨므로 보낸 줄 아시게 됩니다.');
});

/* ── 스위치 ── */

test('★ 폰이 못 받으면 스위치를 아예 안 보여 준다 — 켰는데 아무 일도 없으면 안 된다', () => {
  const fn = cutFn(APP, 'function applyFrameUI(');
  assert.match(fn, /rmb\.style\.display = \(on && canShareFiles\(\)\) \? 'inline-flex' : 'none'/,
    '★ 못 보내는 폰에서도 스위치가 뜹니다');
  assert.match(fn, /box\.checked = cardShareToPref\(\)/,
    '★ 켜 둔 것이 화면에 안 비칩니다 — 꺼진 줄 알고 또 켜게 됩니다');
});

test('★ 스위치가 실제로 화면에 있고, 켜면 값이 남는다', () => {
  assert.match(APP, /<span id="camRmbWrap">/, '스위치 자리가 없습니다');
  assert.match(APP, /id="camRmb" onchange="setCardShareToPref\(this\.checked\)"/,
    '★ 스위치를 만들어 놓고 값을 안 적습니다');
  assert.match(APP, /#camRmbWrap\{[^}]*display:none/,
    '기본은 숨김이어야 합니다 — 일반사진 모드에서 뜨면 헛말입니다');
});

test('★ 못 보낸 것을 «말한다» — 조용히 넘어가면 보낸 줄 아신다', () => {
  const fn = cutFn(APP, 'function shareCardsOut(');
  assert.match(fn, /흐리거나 작게 찍힌 장뿐이라/, '★ 한 장도 안 보냈는데 아무 말이 없습니다');
  assert.match(fn, /사진첩에는 담[깁았]/, '★ 「사진첩에는 담긴다」를 안 알리면 다시 찍으십니다');
  assert.match(fn, /e\.name === 'AbortError'/, '창을 그냥 닫은 것은 잘못이 아닙니다');
  assert.match(fn, /리멤버로 보내지 못했습니다/, '실패를 조용히 넘기면 안 됩니다');
  assert.match(fn, /흐린 ' \+ skipped \+ '장 제외/, '몇 장을 뺐는지 안 알려 줍니다');
});
