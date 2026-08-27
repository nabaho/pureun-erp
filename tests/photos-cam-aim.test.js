/* 촬영 화면 다듬기 (대표 지시 2026-08-27, 승인 목업 안 1)

   "2 꺽쇠 없이 가운데 중앙에 o 모양으로 처리하게 해달라
    그리고 찍힘사진 확인하려는데 안된다 여러장 찍어야 할경우 여러장 모두 볼 수 있게
    해야하는데 그게 안된다. 캡쳐3 표시가 필요하나 아니면 자동으로 정리하게 해달라
    불필요하게 있는것 같다."

   세 가지다.
   ① 꺽쇠 → 가운데 동그라미. ⚠ 여기가 이 검사의 심장이다: **자르는 자리를 건드리면 안 된다.**
      camShoot 은 #camFrame 의 화면 자리를 그대로 읽어 자른다. 「안 보이게」만 해야 하고
      옮기거나 줄이면 엉뚱한 데가 잘린다 — 그런데 그건 찍어 보기 전엔 아무도 모른다.
   ② 왼쪽 아래 사진을 눌러 **찍은 것 전부** 보게 한다(예전엔 마지막 한 장뿐, 눌러도 무반응).
   ③ 윗줄 장수 표시는 평소엔 치우고, **상한이 가까울 때만** 남긴다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ── ① 자르는 자리는 그대로, 보이는 것만 바뀐다 ── */

test('★ 자르는 자리(#camFrame)는 그대로 둔다 — 옮기면 엉뚱한 데가 잘린다', () => {
  /* camShoot 이 이 칸의 화면 자리를 읽어 자른다. 「안 보이게」와 「없애기」는 다르다. */
  assert.match(cutFn(APP, 'async function camShoot('), /getBoundingClientRect\(\)/);
  assert.match(APP, /camFrame'\)\.getBoundingClientRect\(\)|camFrame"\)\.getBoundingClientRect\(\)/,
    '★ 자르는 자리를 어디서 읽는지 사라졌습니다');
  const css = APP.match(/#camFrame\{[^}]*\}/g) || [];
  assert.equal(css.length >= 1, true, '#camFrame 이 없어졌습니다 — 자를 자리가 사라집니다');
  assert.match(css[0], /left:27%;right:27%/, '★ 자리가 움직였습니다');
  assert.match(css[0], /aspect-ratio:1\.6\/1/, '★ 크기 비가 바뀌었습니다');
  /* display:none 을 칸 «자체»에 걸면 자리가 0 이 되어 자르기가 죽는다.
     ⚠ 뒤에 덧붙인 규칙이 앞을 덮을 수 있으므로 **모든** #camFrame 규칙을 본다. */
  const hidden = css.filter(function (c) { return /display:none/.test(c); });
  assert.deepEqual(hidden, [],
    '★ 칸을 통째로 감췄습니다 — 화면 자리가 0 이 되어 아무것도 못 자릅니다');
});

test('★ 꺽쇠는 걷고 가운데 동그라미로 바꾼다', () => {
  assert.match(APP, /#camFrame i\{display:none\}/, '꺽쇠가 아직 보입니다');
  const aim = APP.match(/#camAim\{[^}]*\}/);
  assert.ok(aim, '★ 가운데 조준 표시가 없습니다 — 어디에 맞출지 알 길이 없습니다');
  assert.match(aim[0], /border-radius:50%/, '동그라미가 아닙니다');
  assert.match(aim[0], /left:50%;top:50%/, '가운데가 아닙니다');
  assert.match(APP, /<div id="camAim"><\/div>/, '자리는 잡아 놓고 안 그렸습니다');
});

test('★ 찾았을 때와 못 찾았을 때가 눈에 갈린다', () => {
  assert.match(APP, /#camAim\.found\{[^}]*border-color:#34d399/, '찾아도 그대로면 언제 찍을지 모릅니다');
  assert.match(APP, /#camAim\.found::after\{content:'✓'/, '찾았다는 표가 없습니다');
  const fn = cutFn(APP, 'function applyFrameUI(');
  assert.match(fn, /aim\.className = on \? \(showFrame\(\) \? 'on found' : 'on'\) : ''/,
    '★ 표시를 만들어 놓고 갈아 끼우지 않습니다 — 늘 같은 모양으로 멈춥니다');
});

test('★ 명함·서류일 때만 뜬다 — 회의사진에 조준 표시는 시야만 가린다', () => {
  const fn = cutFn(APP, 'function applyFrameUI(');
  const at = fn.indexOf('aim.className');
  assert.ok(at > 0);
  assert.match(fn.slice(at, at + 90), /on \?/, '갈래를 안 가리고 늘 뜹니다');
});

test('★ 말도 같이 바뀐다 — 꺽쇠를 걷었는데 「네 귀퉁이에 맞추세요」면 헛말이다', () => {
  const fn = cutFn(APP, 'function setCamTip(');
  assert.match(fn, /명함을 찾았습니다/);
  assert.match(fn, /동그라미에 맞춰/, '★ 없어진 꺽쇠를 아직 가리킵니다');
  /* ⚠ 주석에 적힌 「꺽쇠가 없어졌으므로…」 같은 «설명»을 세지 않는다 —
     처음에 그것까지 세어 헛울렸다. 화면에 나가는 것은 push 하는 말뿐이다. */
  const said = (fn.match(/bits\.push\('([^']*)'\)/g) || []).join(' ');
  assert.ok(said.length > 0, 'setCamTip 이 아무 말도 안 합니다');
  assert.ok(said.indexOf('꺽쇠') < 0 && said.indexOf('네 귀퉁이') < 0,
    '★ 화면에 없어진 것을 가리키는 말이 남았습니다: ' + said);
});

/* ── ② 찍은 것 모두 보기 ── */

test('★ 왼쪽 아래 사진을 누르면 찍은 것 전부가 열린다', () => {
  const m = APP.match(/<img id="camLast"[\s\S]{0,240}?>/);
  assert.ok(m, 'camLast 가 없습니다');
  assert.match(m[0], /onclick="openCamReview\(\)"/,
    '★ 눌러도 아무 일이 없습니다 — 여러 장 찍으면 무엇이 흐린지 알 길이 없습니다');
  assert.match(APP, /function openCamReview\(/, '열 곳이 없습니다');
});

test('★ 여러 장이면 몇 장인지 보인다 — 한 장만 보이면 다 찍힌 줄 안다', () => {
  const fn = cutFn(APP, 'function renderCamStrip(');
  assert.match(fn, /more\.textContent = n \+ '장'/);
  assert.match(fn, /more\.style\.display = n > 1 \? 'block' : 'none'/,
    '한 장일 때도 「1장」이 붙으면 군더더기입니다');
  assert.match(fn, /last\.className = n > 1 \? 'many' : ''/, '겹쳐 쌓인 모양이 없습니다');
  assert.match(APP, /id="camMore"[^>]*onclick="openCamReview\(\)"/,
    '★ 장수 딱지를 눌러도 안 열립니다 — 사진보다 이 딱지가 더 큰 과녁입니다');
  assert.match(APP, /\.camSpacer img\.many\{/, '겹쳐 보이는 꾸밈이 없습니다');
});

test('★ 무엇이 문제인 장인지 칸에 적는다 — 못 가리면 고를 수가 없다', () => {
  const fn = cutFn(APP, 'function renderCamReview(');
  /* 실제로 돌려 본다 — 글자만 찾으면 늘 빈 딱지를 붙여도 안 잡힌다 */
  const ctx = { esc: function (s) { return String(s); } };
  ctx.camShots = [
    { url: 'a', sel: true, small: true, shortEdge: 480 },
    { url: 'b', sel: false, blurry: true },
    { url: 'c', sel: true }
  ];
  const grid = { innerHTML: '' };
  ctx.$ = function (id) { return id === 'camRevGrid' ? grid : { textContent: '', style: {}, disabled: false, classList: { toggle: function () {} } }; };
  vm.createContext(ctx);
  vm.runInContext(fn.replace(/^function/, 'globalThis.renderCamReview = function'), ctx);
  ctx.renderCamReview();
  const cells = grid.innerHTML.split('<div class="rc');
  assert.equal(cells.length, 4, '칸이 사진 수만큼 안 나옵니다');
  assert.match(cells[1], /작게 480px/, '★ 작게 찍힌 장에 딱지가 없습니다');
  assert.match(cells[2], /흐림/, '★ 흐린 장에 딱지가 없습니다');
  assert.ok(cells[3].indexOf('class="bad"') < 0, '★ 멀쩡한 장에도 딱지가 붙습니다 — 그러면 딱지를 안 믿습니다');
  /* 고른 표시(파랑)와 문제 딱지(주황)가 겹쳐 보이면 안 된다 */
  assert.match(APP, /#camRevGrid \.rc \.bad\{/, '딱지 꾸밈이 없습니다');
});

test('★ 찍을 때 그 표를 실제로 남긴다 — 안 남기면 딱지는 영영 안 붙는다', () => {
  /* 위 검사는 camShots 를 손으로 넣어 보므로, «찍는 쪽»이 안 적으면 못 잡는다.
     실제로 작다고 판정한 그 값(small)과 짧은 변을 그대로 들고 가야 한다. */
  const fn = cutFn(APP, 'async function camShoot(');
  assert.match(fn, /small: small, shortEdge: Math\.round\(Math\.min\(outW, outH\)\)/,
    '★ 작게 찍혔다는 것을 사진에 안 적습니다 — 나중에 가릴 길이 없습니다');
  assert.ok(fn.indexOf('shortEdge < CARD_MIN_SHORT') < fn.indexOf('small: small'),
    '★ 재기도 전에 적습니다');
});

/* ── ③ 윗줄 정리 ── */

test('★ 윗줄은 알릴 것이 있을 때만 뜬다 — 평소엔 비운다', () => {
  const fn = cutFn(APP, 'function renderCamStrip(');
  assert.match(fn, /cnt\.style\.display = near \? 'block' : 'none'/,
    '★ 평소에도 윗줄이 자리를 차지합니다');
  assert.ok(fn.indexOf("'아직 없음'") < 0, '★ 「아직 없음」은 알릴 것이 아닙니다');
  assert.ok(fn.indexOf("장 찍었습니다'") < 0,
    '★ 장수는 아래 딱지가 들고 있습니다 — 두 군데서 같은 말을 합니다');
});

test('★ 상한이 다가온다는 소식은 남긴다 — 그때 셔터가 안 먹는 까닭이다', () => {
  const fn = cutFn(APP, 'function renderCamStrip(');
  assert.match(fn, /max - n <= 5/, '★ 미리 안 알리면 갑자기 못 찍게 됩니다');
  assert.match(fn, /다 찼습니다/);
  assert.match(fn, /\$\('camShut'\)\.disabled = n >= max/);
});
