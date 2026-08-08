'use strict';
// 거래내역 입금 추천 다시쓰기 — node --test tests/erp-ledger-suggest.test.js
//
// 왜: 통장 행마다 미입금 후보 전체를 훑는 계산(506행 × 수백건)이 화면 부품
// 본문에 있었다. 그 부품에는 useState 가 36개라 체크박스 하나만 눌러도 통째로
// 다시 돌았고, 대표님 PC 에서 24초 멈춤으로 나타났다.
//
// ⚠ 여기는 «입금 확정에 쓰이는 추천» 을 만드는 자리다. 지문이 덜 촘촘하면
//   낡은 후보가 남아 엉뚱한 건에 확정될 수 있다. 그래서 «후보를 바꿀 수 있는
//   것» 은 하나하나 지문이 달라지는지 값으로 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function load(hooks) {
  const from = app.indexOf('function erpSugSig(');
  const to = app.indexOf('function FinanceLedger(){');
  assert.ok(from > 0 && to > from, '추천 다시쓰기 토막을 찾을 수 없습니다');
  const calls = { match: 0 };
  const sandbox = Object.assign({
    console: { warn() {}, log() {} },
    // 비싼 것 하나만 세고, 나머지는 값싼 조회라 흉내만 낸다
    erpMatchTxnToPending(txn, pending) { calls.match++; return pending.map(p => ({ cand: p, level: 'high', score: 95 })); },
    erpIsCmsMemo: () => false,
    erpAlreadyConfirmed: () => [],
    erpContractHint: () => null,
    erpInvoiceSuggest: () => []
  }, hooks || {});
  vm.createContext(sandbox);
  vm.runInContext(app.slice(from, to), sandbox);
  return { sandbox, calls };
}

const ROW = (k, amt, memo) => ({ _k: k, date: '2026-07-15', amount: amt, memo: memo || '가나다' });
const PEND = (id, amt) => ({ id, expect: amt });

/* ── 지문: 후보를 바꿀 수 있는 것은 빠짐없이 ── */
test('아무것도 안 바뀌면 지문이 같다', () => {
  const { sandbox: s } = load();
  const a = s.erpSugSig([ROW('r1', 1000)], [PEND('p1', 1000)], 'inc', true);
  const b = s.erpSugSig([ROW('r1', 1000)], [PEND('p1', 1000)], 'inc', true);
  assert.equal(a, b);
});

test('통장 행의 금액이 바뀌면 지문이 달라진다', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([ROW('r1', 1000)], [PEND('p1', 1000)], 'inc', true),
    s.erpSugSig([ROW('r1', 2000)], [PEND('p1', 1000)], 'inc', true));
});

test('적요가 바뀌면 지문이 달라진다 (적요로 업체를 찾는다)', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([ROW('r1', 1000, '가나다')], [], 'inc', true),
    s.erpSugSig([ROW('r1', 1000, '가나다라')], [], 'inc', true));
});

test('행이 처리됨으로 바뀌면 지문이 달라진다', () => {
  const { sandbox: s } = load();
  const r = ROW('r1', 1000); const r2 = Object.assign({}, r, { _dup: true });
  assert.notEqual(s.erpSugSig([r], [], 'inc', true), s.erpSugSig([r2], [], 'inc', true));
});

test('미입금 건이 확정돼 사라지면 지문이 달라진다 (가장 중요)', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([ROW('r1', 1000)], [PEND('p1', 1000), PEND('p2', 2000)], 'inc', true),
    s.erpSugSig([ROW('r1', 1000)], [PEND('p1', 1000)], 'inc', true));
});

test('미입금 건이 같은 개수로 «다른 건» 이 되어도 지문이 달라진다', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([], [PEND('p1', 1000)], 'inc', true),
    s.erpSugSig([], [PEND('p22', 1000)], 'inc', true));
});

test('미입금 금액이 바뀌면 지문이 달라진다', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([], [PEND('p1', 1000)], 'inc', true),
    s.erpSugSig([], [PEND('p1', 1100)], 'inc', true));
});

test('행 순서가 바뀌면 지문이 달라진다 (구르는 셈이라 순서를 탄다)', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([ROW('r1', 1000), ROW('r22', 2000)], [], 'inc', true),
    s.erpSugSig([ROW('r22', 2000), ROW('r1', 1000)], [], 'inc', true));
});

test('탭이 바뀌면 지문이 달라진다', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([ROW('r1', 1000)], [], 'inc', true),
    s.erpSugSig([ROW('r1', 1000)], [], 'out', true));
});

test('계산서 색인이 늦게 준비돼도 지문이 달라진다 (그때 다시 계산해야 한다)', () => {
  const { sandbox: s } = load();
  assert.notEqual(
    s.erpSugSig([ROW('r1', 1000)], [], 'inc', false),
    s.erpSugSig([ROW('r1', 1000)], [], 'inc', true));
});

/* ── 계산 본체 ── */
test('처리된 행은 추천을 계산하지 않는다 (계산 절약)', () => {
  const { sandbox: s, calls } = load();
  const out = s.erpBuildSug([ROW('r1', 1000), Object.assign(ROW('r2', 2000), { _dup: true })], [PEND('p1', 1000)]);
  assert.equal(calls.match, 1, '처리된 행은 훑지 않는다');
  assert.ok(out.incSug.r1, '안 처리된 행은 후보가 있다');
  assert.equal(out.incSug.r2, undefined);
});

test('처리된 행도 되찾을 수 있게 목록에는 넣는다', () => {
  const { sandbox: s } = load();
  const out = s.erpBuildSug([Object.assign(ROW('r2', 2000), { _dup: true })], []);
  assert.ok(out.incByK.r2, '자동 정리 미리보기가 행을 되찾는다');
});

test('맞는 후보가 없을 때만 계약 힌트를 본다', () => {
  let hint = 0;
  const { sandbox: s } = load({
    erpMatchTxnToPending: () => [],
    erpContractHint: () => { hint++; return { x: 1 }; }
  });
  s.erpBuildSug([ROW('r1', 1000)], []);
  assert.equal(hint, 1);

  let hint2 = 0;
  const t2 = load({ erpContractHint: () => { hint2++; return null; } });
  t2.sandbox.erpBuildSug([ROW('r1', 1000)], [PEND('p1', 1000)]);
  assert.equal(hint2, 0, '후보가 있으면 안 본다');
});

test('사용자가 고른 매칭(inMatch)은 계산에 넣지 않는다', () => {
  // 넣으면 클릭할 때마다 다시 계산해 고치는 뜻이 없어진다.
  // 자동정리 관문·계산서 미발급은 캐시 밖에서 매번 다시 본다.
  const src = app.slice(app.indexOf('function erpBuildSug('), app.indexOf('function FinanceLedger(){'));
  assert.ok(src.indexOf('inMatch') < 0, 'erpBuildSug 는 inMatch 를 몰라야 한다');
});

/* ── 화면에 제대로 물렸나 ── */
test('지문이 같으면 다시 계산하지 않는다', () => {
  const fl = app.slice(app.indexOf('function FinanceLedger(){'));
  assert.match(fl, /if\(_sugCache\.current\.sig !== _sugSig\)\{/);
  assert.match(fl, /var _sugCache = useRef\(/);
});

test('inMatch 를 쓰는 계산은 캐시 밖에 남아 매번 다시 본다', () => {
  const fl = app.slice(app.indexOf('function FinanceLedger(){'));
  const cheap = fl.slice(fl.indexOf('if(_sug) incAll.forEach'));
  assert.ok(cheap.indexOf('inMatch[row._k]') > 0, '자동정리 관문이 남아 있어야 한다');
  assert.ok(cheap.indexOf('autoTidyKeys.push') > 0);
  assert.ok(cheap.indexOf('invNone[row._k]=1') > 0);
  assert.ok(cheap.indexOf('erpMatchTxnToPending') < 0, '비싼 것은 여기 있으면 안 된다');
});

test('오래 걸리면 콘솔에 남긴다 (다시 계산이 잦은지 눈으로 본다)', () => {
  assert.match(app, /\[거래내역\] 추천 다시 계산 /);
});

test('출금 탭에서는 아예 계산하지 않는다', () => {
  const fl = app.slice(app.indexOf('function FinanceLedger(){'));
  assert.match(fl, /ldTabEff==='inc'\) \? erpSugSig\(/);
});

/* ── 실제로 덜 도는가 — 화면이 하는 일을 그대로 흉내 내 세어 본다 ──
   위 검사들은 «글자가 있나» 를 보지만, 정작 중요한 것은 «클릭해도 안 도는가» 다. */
function renderLoop(times, mutate) {
  const { sandbox: s, calls } = load();
  const cache = { sig: null, val: null };
  let incAll = [ROW('r1', 1000), ROW('r2', 2000), ROW('r3', 3000)];
  let pending = [PEND('p1', 1000), PEND('p2', 2000)];
  for (let i = 0; i < times; i++) {
    if (mutate) ({ incAll, pending } = mutate(i, incAll, pending));
    const sig = s.erpSugSig(incAll, pending, 'inc', true);
    if (cache.sig !== sig) { cache.sig = sig; cache.val = s.erpBuildSug(incAll, pending); }
  }
  return calls;
}

test('체크박스만 눌러대면(자료 그대로) 한 번만 계산한다', () => {
  const calls = renderLoop(20, null);
  assert.equal(calls.match, 3, '통장 3행 × 한 번 = 3. 20번 그려도 늘지 않는다');
});

test('예전에는 그릴 때마다 다시 돌았다 — 지금 몇 배 아끼는지', () => {
  const before = 3 * 20;              // 옛 방식: 20번 그리면 60번
  const after = renderLoop(20, null).match;
  assert.equal(after, 3);
  assert.ok(before / after === 20, '20번 그리는 동안 20배');
});

test('미입금 건이 확정되면 그때는 반드시 다시 계산한다', () => {
  const calls = renderLoop(6, (i, incAll, pending) => ({
    incAll,
    pending: i === 3 ? [PEND('p1', 1000)] : pending      // 4번째에 한 건 확정돼 사라짐
  }));
  assert.equal(calls.match, 6, '처음 3행 + 바뀐 뒤 3행 = 6 (낡은 후보를 남기지 않는다)');
});

test('통장 파일을 새로 올리면 다시 계산한다', () => {
  const calls = renderLoop(4, (i, incAll, pending) => ({
    incAll: i === 2 ? [ROW('n1', 500)] : incAll,
    pending
  }));
  assert.equal(calls.match, 3 + 1, '옛 3행 + 새 1행');
});
