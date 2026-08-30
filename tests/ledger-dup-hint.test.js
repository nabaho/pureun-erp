'use strict';
/* 같은 결제가 두 줄이 됐을 때 «보여» 준다 — 2026-08-29

   하나카드는 두 길로 들어온다: 휴대폰 문자, 그리고 홈페이지 이용내역 엑셀.
   둘이 같은 결제를 다르게 적는다 — 문자 「스시리두정」 · 엑셀 「스시리두정점」.
   그러면 중복막이(날짜|금액|가맹점)를 빠져나가 같은 결제가 두 줄이 된다.

   ★★ 왜 «합치지» 않는가 — 이 검사의 절반이 그것을 못 박는다
     가맹점을 빼고 날짜+금액으로만 걸러 합치면 깔끔해 보인다. 그런데 같은 날
     같은 금액의 «다른 가게»가 있고 문자가 그중 하나를 놓쳤을 때, 줄 차례에 따라
     엉뚱한 가게 이름으로 합쳐지고 «진짜 한 건이 사라진다».
     장부에서 한 건이 조용히 사라지는 것은 두 줄이 보이는 것보다 훨씬 나쁘다.
     그래서 표만 달고 고르는 것은 사람이 한다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const { cutFn } = require('./cut-fn.js');

const sandbox = {
  window: {},
  /* 화면의 것과 «가깝게» 흉내 낸다: 소문자·공백 제거 정도.
     여기서 실제 erpCleanMemo 를 쓰면 이 검사가 그 함수까지 함께 시험하게 되어,
     엉뚱한 곳을 고쳐도 여기가 깨진다. 지킬 것은 「짚는 규칙」이다. */
  erpNormName: (s) => String(s || '').replace(/\s+/g, '').toLowerCase(),
  erpCleanMemo: (s) => String(s || ''),
};
vm.createContext(sandbox);
vm.runInContext(
  cutFn(app, 'function erpBankRowKey(') + '\n' +
  cutFn(app, 'function erpDupHintPair(') + '\n' +
  cutFn(app, 'function erpMarkDupHints(') + '\n' +
  cutFn(app, 'function erpBankMergeDraft(') + '\n' +
  'var BANK_DRAFT_MAX = 4000;\n' +
  'this.merge = erpBankMergeDraft; this.mark = erpMarkDupHints; this.pair = erpDupHintPair;', sandbox);
const { merge, mark, pair } = sandbox;

const C = (o) => Object.assign(
  { _k: '0', type: 'expense', src: 'card', date: '2026-08-18', amount: 26000, memo: '' }, o);
/* ⚠ 글로 견준다. 덩어리(vm) 안에서 만든 배열은 바깥 배열과 «다른 종류»라
     deepStrictEqual 이 눈에 똑같은 [] 를 두고도 다르다고 한다 — 실제로 걸렸다.
     이 저장소의 다른 검사에도 같은 사고가 적혀 있다. */
const hints = (rows) => rows.filter((r) => r.dupHint).map((r) => r.memo).sort().join(',');

/* ══════ ① 짚어야 하는 것 ══════ */

test('★ 문자와 이용내역이 같은 가게를 다르게 적은 두 줄을 짚는다', () => {
  const m = merge([], [
    C({ _k: 'a', memo: '스시리두정' }),      // 휴대폰 문자
    C({ _k: 'b', memo: '스시리두정점' }),    // 이용내역 엑셀
  ]);
  assert.equal(m.rows.length, 2, '★ 둘이 합쳐졌습니다 — 합치면 안 됩니다');
  assert.equal(hints(m.rows), '스시리두정,스시리두정점',
    '★ 같은 결제로 보이는 두 줄에 표가 없습니다 — 사람이 알아챌 길이 없습니다');
});

test('★ 이미 쌓인 줄과 새로 올린 줄 사이에서도 짚는다 (실제로 이렇게 들어온다)', () => {
  const had = merge([], [C({ _k: 'a', memo: '스시리두정' })]).rows;   // 문자가 먼저
  const m = merge(had, [C({ _k: 'b', memo: '스시리두정점' })]);        // 나중에 엑셀
  assert.equal(m.rows.length, 2);
  assert.equal(m.rows.filter((r) => r.dupHint).length, 2, '★ 표가 안 달립니다');
});

/* ══════ ② 짚지 «말아야» 하는 것 ══════ */

test('★ 같은 날 같은 금액이라도 다른 가게면 안 짚는다 — 헛표가 잦으면 아무도 안 본다', () => {
  const m = merge([], [
    C({ _k: 'a', memo: '스타벅스강남' }),
    C({ _k: 'b', memo: '스타벅스역삼' }),
  ]);
  assert.equal(m.rows.length, 2);
  assert.equal(hints(m.rows), '', '★ 다른 가게에 「같은 결제」 표가 붙었습니다');
});

test('날짜가 다르면 안 짚는다', () => {
  const m = merge([], [
    C({ _k: 'a', date: '2026-08-18', memo: '스시리두정' }),
    C({ _k: 'b', date: '2026-08-19', memo: '스시리두정점' }),
  ]);
  assert.equal(hints(m.rows), '');
});

test('금액이 다르면 안 짚는다', () => {
  const m = merge([], [
    C({ _k: 'a', amount: 26000, memo: '스시리두정' }),
    C({ _k: 'b', amount: 26500, memo: '스시리두정점' }),
  ]);
  assert.equal(hints(m.rows), '');
});

test('통장과 카드는 섞어 보지 않는다', () => {
  const m = merge([], [
    C({ _k: 'a', src: 'card', memo: '스시리두정' }),
    C({ _k: 'b', src: 'bank', type: 'expense', memo: '스시리두정점' }),
  ]);
  assert.equal(hints(m.rows), '');
});

test('한 글자만 겹치는 것은 안 짚는다 — 우연이 너무 잦다', () => {
  assert.equal(pair('가', '가나다'), false);
  assert.equal(pair('가나', '가나다'), true, '두 글자부터는 본다');
});

test('앞부분이 아니라 «중간»이 같은 것은 안 짚는다', () => {
  /* 「루나」와 「그랜드루나」는 다른 가게일 수 있다 — 앞부터 같아야 같은 이름의 변형이다 */
  assert.equal(pair('루나', '그랜드루나'), false);
  assert.equal(pair('루나', '루나커피'), true);
});

/* ══════ ③ 「합치지 않는다」를 못 박는다 ══════ */

test('★★ 표만 달고 «지우지 않는다» — 합치면 진짜 한 건이 사라질 수 있다', () => {
  /* 문자가 A 만 잡았고 이용내역에 A·B 가 있다. 가맹점을 빼고 합치면 줄 차례에 따라
     B 가 A 로 둔갑하고 B 가 사라진다. 그래서 세 줄이 그대로 남아야 한다. */
  const had = merge([], [C({ _k: 'a', memo: '커피가게' })]).rows;
  const m = merge(had, [
    C({ _k: 'b', memo: '커피가게앞점' }),
    C({ _k: 'c', memo: '분식집' }),
  ]);
  assert.equal(m.rows.length, 3,
    '★ 줄이 사라졌습니다 — 장부에서 한 건이 조용히 없어지는 것이 가장 나쁩니다');
  assert.equal(hints(m.rows), '커피가게,커피가게앞점');
});

test('★ 글자까지 똑같은 줄은 «예전대로» 하나로 걸러진다 — 표를 다는 것이 아니다', () => {
  const m = merge([], [C({ _k: 'a', memo: '같은가게' })]);
  const again = merge(m.rows, [C({ _k: 'b', memo: '같은가게' })]);
  assert.equal(again.rows.length, 1, '★ 완전히 같은 줄이 두 개가 됐습니다');
  assert.equal(again.dup, 1);
  assert.equal(hints(again.rows), '', '하나뿐인데 표가 붙었습니다');
});

test('세 줄이 얽혀도 모두 짚는다', () => {
  const m = merge([], [
    C({ _k: 'a', memo: '가게' }), C({ _k: 'b', memo: '가게점' }), C({ _k: 'c', memo: '가게본점' }),
  ]);
  assert.equal(m.rows.length, 3);
  assert.equal(m.rows.filter((r) => r.dupHint).length, 3);
});

/* ══════ ④ 표가 화면까지 간다 ══════ */

test('★ 표를 화면 줄로 «옮긴다» — 안 옮기면 만들고도 안 보인다', () => {
  /* 화면 줄은 칸을 하나하나 적어 만든다. 새 칸은 적어 주지 않으면 그대로 사라진다. */
  const rowsOf = cutFn(app, 'function _rowsOfBatches(');
  assert.match(rowsOf, /_hint:\s*x\.dupHint/, '★ 쌓인 자료에서 표가 사라집니다');
  assert.ok(/_hint:\s*x\.dupHint/.test(app.slice(app.indexOf('var _pst2 = erpBankProcessedStore();'),
    app.indexOf('var _pst2 = erpBankProcessedStore();') + 900)),
    '★ 방금 올린 파일에서 표가 사라집니다');
});

test('★ 화면이 그 표를 그린다 — 붙여 놓고 안 그리면 없는 것과 같다', () => {
  assert.match(app, /row\._hint && h\('div'/, '★ 표를 그리는 자리가 없습니다');
  assert.match(app, /같은 결제일 수 있음/, '★ 사람이 읽을 말이 없습니다');
});
