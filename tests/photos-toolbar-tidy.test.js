'use strict';
/* 도구줄 정리 — 대표 지시 2026-08-28
   "여기에 불필요한 부분 없나. 중복이나 검토 후 정리해달라." → 목업 승인(㉮ 맨 앞으로)

   ■ 무엇이 중복이었나
   25장을 고르면 「25장 내려받기」·「25장 판독」·「25장을 한 문서로」·「25장 삭제」에
   숫자가 되풀이되고, 그 옆에 또 「25장 골랐습니다」가 있었다 — 눈이 같은 숫자를
   여섯 번 읽었다. 그리고 그 장수가 **맨 뒤**에 있어 읽는 차례가 거꾸로였다.

   ■ 규칙 하나로 정리한다
     · **고른 수와 다를 때만** 숫자를 적는다
     · 고른 장수는 **맨 앞**에 한 번만
     · 판독의 🔍 는 찾기 칸의 🔍 와 겹쳐 🔎 로

   ■ 안 건드린 것 — 단추를 지우지 않았다. 하는 일도 안 바뀌었다. 적히는 말만 바뀐다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ══════ ① 규칙 자체 ══════ */

function cntOf() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function cnt('), ctx);
  return ctx.cnt;
}

test('★ 고른 수와 «같으면» 숫자를 안 적는다 — 같은 숫자를 여섯 번 읽게 하지 않는다', () => {
  const cnt = cntOf();
  assert.equal(cnt(25, 25), '', '★ 고른 수와 같은데 또 적으면 중복입니다');
  assert.equal(cnt(0, 0), '');
});

test('★ 다르면 «그 숫자»를 적는다 — 그것이 진짜 정보다', () => {
  const cnt = cntOf();
  assert.equal(cnt(1, 25), '1장 ', '★ 25장 중 1장이라는 사실이 사라지면 안 됩니다');
  assert.equal(cnt(3, 25), '3장 ');
  assert.equal(cnt(0, 25), '0장 ');
});

/* ══════ ② 도구줄이 그 규칙을 «실제로» 쓴다 ══════ */

/* 화면 함수를 그대로 떠와서 돌린다 — 「cnt 라는 낱말이 있나」로는 무엇이 적히는지 못 잡는다 */
function bar(over) {
  const el = {};
  /* 장수 딱지는 «꾸밈을 붙였다 떼고»(classList) 속을 통째로 갈아 끼운다(innerHTML) —
     시늉 칸에도 그 둘이 있어야 실제로 무엇이 적히는지 볼 수 있다(2026-08-30) */
  const mk = (id) => (el[id] = el[id] || {
    style: {}, textContent: '', innerHTML: '', disabled: false, title: '',
    classList: { _on: {},
      toggle: function (c, on) { if (on) this._on[c] = 1; else delete this._on[c]; },
      add: function (c) { this._on[c] = 1; }, remove: function (c) { delete this._on[c]; } }
  });
  const o = over || {};
  const sel = new Set(o.sel || ['a', 'b', 'c']);
  const ctx = Object.assign({
    Object, Array, Set, String, Date, Number,
    selected: sel,
    shownItems: function () { return (o.shown || ['a', 'b', 'c']).map(id => ({ id: id })); },
    gridItems: [],
    needOnly: false, oldOnly: false, gridQ: '', reading: false, sending: false,
    gridYear: String(new Date().getFullYear()),
    viewingOther: function () { return false; },
    mayTouch: function () { return true; },
    canSend: function () { return !!o.sendAll; },
    worthRetry: function () { return o.readable !== false; },
    needsCheck: function () { return !!o.needAll; },
    renderNeedBox() {}, renderOldBox() {}, renderBackBar() {}, renderUidCard() {},
    renderPhMenuBtn() {}, renderPhNeedBtn() {}, renderGotCard() {}, renderOwnerSelLabel() {},
    /* 2026-08-30: 도구줄이 «왼쪽 칸 고르기»가 열려 있는지 본다 */
    _sharePick: null, closeSharePick() {},
    /* 2026-08-29: 내 사진에 공유받은 것이 섞인다 — 칩·거르기가 이 셋을 쓴다 */
    isSharedItem() { return false; }, sharedByName() { return ''; }, sharedOnly: false,
    ALL_OWNERS: '__all__', gridOwner: null, renderPayNote() {},
    $: mk
  }, o.ctx || {});
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function cnt(') + '\n' +
    cutFn(app, 'function idsOf(') + '\n' +
    cutFn(app, 'function shownCount(') + '\n' +
    cutFn(app, 'function readableSel(') + '\n' +
    /* 👥 공유 칸은 도구줄이 부른다(2026-08-29 에 왼쪽 대시보드로 옮겼다).
       시늉이 아니라 **진짜를 함께 띄운다** — 시늉으로 두면 도구줄이 그것을 안 불러도 통과한다. */
    cutFn(app, 'function renderShareCard(') + '\n' +
    cutFn(app, 'function renderGridBar('), ctx);
  ctx.renderGridBar();
  return el;
}

/* 대표 지시 2026-08-29 — 「공유버튼은 누구사진아래 대시보드로」.
   ⚠ 「renderShareCard(n, touch) 라는 글자가 있나」로는 못 잡는다 —
     `0 && renderShareCard(n, touch)` 로 막아도 통과한다(되돌림에서 실제로 새어 나갔다).
     **돌려서** 그 칸이 진짜로 그려졌는지 본다. */
test('★★ 도구줄이 왼쪽 공유 칸을 «실제로» 그린다 — 안 그리면 공유할 길이 사라진다', () => {
  const el = bar({});                       // 세 장 고른 상태
  assert.equal(el.shareCard.style.display, 'block',
    '★ 도구줄에서 뺐으므로, 이 칸을 안 그리면 공유 단추가 화면 어디에도 없습니다');
  assert.match(el.shareSideBtn.textContent, /3장/, '몇 장에 걸리는지 적어야 합니다');
});

test('★ 고른 것이 없거나 남의 사진이면 공유 칸이 안 뜬다 — 도구줄과 같은 기준', () => {
  assert.equal(bar({ sel: [] }).shareCard.style.display, 'none',
    '★ 고른 것이 없는데 떠 있으면 눌러도 아무 일이 없습니다');
  assert.equal(bar({ ctx: { mayTouch: function () { return false; } } }).shareCard.style.display, 'none',
    '★ 손댈 수 없는 사진에 뜨면 눌러도 막힙니다');
});

test('★ 세 장을 골랐으면 내려받기·삭제·묶기에 숫자가 «없다»', () => {
  const el = bar({});
  assert.equal(el.dlBtn.textContent, '⬇ 내려받기', '★ 고른 수를 되풀이하고 있습니다');
  assert.equal(el.delBtn.textContent, '🗑 삭제', '★ 고른 수를 되풀이하고 있습니다');
  assert.equal(el.mergeBtn.textContent, '📎 한 문서로', '★ 고른 수를 되풀이하고 있습니다');
});

test('★ 고른 장수는 «맨 앞»에 한 번만 적힌다', () => {
  const el = bar({});
  /* ⚠ 2026-08-30 부터 장수와 «푸는 ✕» 가 한 딱지다 — 글씨만 보면 안 된다 */
  assert.match(el.gridCount.innerHTML, /3장 고름/);
  /* 마크업에서도 앞에 있어야 한다 — 뒤에 있으면 읽는 차례가 거꾸로다 */
  const barHtml = app.slice(app.indexOf('<div id="gridBar">'), app.indexOf('id="sortSeg"'));
  assert.ok(barHtml.indexOf('id="gridCount"') < barHtml.indexOf('id="dlBtn"'),
    '★ 고른 장수가 단추들 뒤에 있습니다 — 무엇을 할지 먼저 보고 몇 장인지 나중에 압니다');
  assert.ok(barHtml.indexOf('id="selAllBtn"') < barHtml.indexOf('id="gridCount"'),
    '「☑ 전부」는 고르기의 시작이라 그보다는 뒤여야 합니다');
});

test('★ 판독이 «다른 수»면 그 숫자를 적는다 — 스무 장 골랐는데 열둘만 뜻이 있을 때', () => {
  /* 세 장 중 하나만 다시 걸어 볼 값이 있다 */
  const el = bar({ ctx: { worthRetry: function (it) { return it && it.id === 'a'; } },
                   sel: ['a', 'b', 'c'] });
  assert.match(el.readSelBtn.textContent, /^🔎 /, '★ 찾기 칸과 같은 🔍 를 쓰고 있습니다');
  assert.ok(/\d+장/.test(el.readSelBtn.textContent),
    '★ 고른 수와 다른데 숫자를 안 적으면 「왜 다 안 되지」가 됩니다: ' + el.readSelBtn.textContent);
});

test('★ 판독이 «고른 수와 같으면» 숫자를 뺀다', () => {
  const el = bar({});
  assert.equal(el.readSelBtn.textContent, '🔎 판독');
});

test('★ 확인했음은 «고른 것 중 확인이 필요한 수»라 대개 다르다 — 그때는 적는다', () => {
  const el = bar({ ctx: { needsCheck: function (it) { return it && it.id === 'a'; } } });
  assert.equal(el.ackSelBtn.textContent, '✓ 1장 확인했음',
    '★ 25장 중 1장이라는 사실이 사라지면 안 됩니다');
  const all = bar({ needAll: true });
  assert.equal(all.ackSelBtn.textContent, '✓ 확인했음', '전부면 숫자를 뺀다');
});

/* ⚠ 2026-08-30 에 이 자리의 판단이 «바뀌었다» — 대표 지시
   「여기 셀 중에서 중복되고 불필요한 부분이 있으면 정리해달라. 판단해라」
   08-28 에는 「보이는 수를 지우면 몇 장인지 모른다」고 두었다. 그런데 실제 화면을
   보니 그 숫자가 **바로 위 칸(전체사진 387)에 이미 적혀 있었다.** 걸러 보는 중에는
   옆의 「찾은 사진 N장」이 또 말한다 — 한 줄 안에서 셋이 같은 말을 하고 있었다.
   → 단추는 「전부 고른다 / 푼다」만 말한다. 숫자는 마우스를 올리면 나온다. */
test('★★ 「전부」 단추가 «숫자를 짊어지지 않는다» — 같은 수가 바로 위 칸에 이미 있다', () => {
  const el = bar({ sel: ['a'], shown: ['a', 'b', 'c', 'd'] });
  assert.equal(el.selAllBtn.textContent, '☑ 전부',
    '★★ 단추에 장수가 돌아왔습니다 — 위 칸(전체사진 N)과 같은 말입니다');
  /* ⚠ 다만 **잃지는 않는다** — 「전부」가 몇 장인지는 얹으면 나와야 한다 */
  assert.match(el.selAllBtn.title, /4장/,
    '★ 숫자를 아예 버렸습니다 — 「전부」가 몇 장인지 알 길이 있어야 합니다');
});

test('★★ 다 골랐으면 같은 자리에서 푼다 — 단추 둘을 나란히 두지 않는다', () => {
  const el = bar({ sel: ['a', 'b'], shown: ['a', 'b'] });
  assert.equal(el.selAllBtn.textContent, '☐ 전부 풀기');
});

/* ══════ ③ 안 건드린 것 ══════ */

test('★ 단추를 하나도 «없애지» 않았다 — 접거나 숨기지도 않았다', () => {
  /* ⚠ 「👥 공유」는 2026-08-29 에 도구줄에서 **왼쪽 대시보드(누구 사진 아래)로 옮겼다**
     — 대표 지시다. 없앤 것이 아니라 자리를 바꾼 것이라 여기서는 빠지고,
     photos-company-share 가 「누구 사진 아래에 있는가」로 이어서 지킨다. */
  ['selAllBtn', 'ackSelBtn', 'dlBtn', 'cpBtn', 'coBtn', 'tagBtn',
   'readSelBtn', 'sendSelBtn', 'mergeBtn', 'delBtn'].forEach(function (id) {
    assert.ok(app.indexOf('id="' + id + '"') > 0, '★ ' + id + ' 가 없어졌습니다');
  });
  assert.ok(app.indexOf('id="shareSideBtn"') > 0,
    '★ 공유 단추가 아예 없어졌습니다 — 옮긴 것이지 없앤 것이 아닙니다');
  assert.ok(!/더보기|⋯/.test(app.slice(app.indexOf('<div id="gridBar">'),
    app.indexOf('id="sortSeg"'))), '★ 접어 두면 있는 기능을 못 찾습니다');
});

/* ══════ ④ 「취소」를 걷었다 — 하지만 «하던 일»은 안 없앴다 (2026-08-30) ══════
   장수(「1장 고름」)와 취소가 **단추 다섯 개를 사이에 두고** 떨어져 있었다.
   같은 하나를 두 자리에서 말한 셈이라, 장수 딱지 안으로 ✕ 를 넣어 합쳤다.
   ⚠ 이 검사가 지키는 것은 「단추가 있는가」가 아니라 **「푸는 길이 있는가」**다 —
     ✕ 를 지워도, 딱지를 안 만들어도 여기서 걸린다. */
test('★★ 고른 것을 푸는 길이 «장수 바로 옆»에 있다', () => {
  const el = bar({ sel: ['a'] });
  assert.match(el.gridCount.innerHTML, /1장 고름/, '★ 장수를 안 적습니다');
  assert.match(el.gridCount.innerHTML, /onclick="clearSel\(\)"/,
    '★★ 고른 것을 푸는 길이 없어졌습니다 — 25장을 골라 두면 되돌릴 수가 없습니다');
  assert.ok(el.gridCount.classList._on.pick,
    '★ 딱지 꾸밈이 안 붙어 예사 글씨와 안 갈립니다');
  /* 아무것도 안 골랐을 때는 딱지가 아니다 — 빈 딱지가 자리를 먹으면 안 된다 */
  const none = bar({ sel: [] });
  assert.ok(!none.gridCount.classList._on.pick);
  assert.equal(none.gridCount.textContent, '',
    '★ 예사 때 또 적으면 바로 위 칸(전체사진 N)과 같은 말이 됩니다');
});

test('★★ 「취소」 단추를 다시 만들지 않았다 — 두 자리가 되면 한쪽만 고쳐진다', () => {
  assert.ok(app.indexOf('id="selCancel"') < 0,
    '★★ 취소 단추가 돌아왔습니다 — 푸는 길은 장수 딱지의 ✕ 하나입니다');
});

test('「📋 첫 장 복사」는 그대로 — 여러 장일 때 첫 장만이라는 것을 이름이 말한다', () => {
  const many = bar({ sel: ['a', 'b'] });
  assert.equal(many.cpBtn.textContent, '📋 첫 장 복사');
  const one = bar({ sel: ['a'], shown: ['a'] });
  assert.equal(one.cpBtn.textContent, '📋 복사');
});
