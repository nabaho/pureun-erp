'use strict';
/* 마감된 달의 급여가 «뒤에서 조용히» 바뀌지 않는다 (2026-09-03)

   ■ 무엇이 문제였나
   성과급은 급여를 만들 때 얼려 두는 값이 아니다 — 명세서를 열 때마다 그 달
   finance_income 을 다시 훑어 셈한다(calcPay → calcPerfBonus). 그래서
   이미 마감·지급한 달의 입금을 새로 확정하거나 고치면 통장으로 나간 명세서가
   뒤늦게 달라진다. 실자료에서 2026-06 건 하나가 2026-07 에 만들어져 있었다.

   ■ 무엇을 못 박나 — «값»이 아니라 «규칙»이다
     ① 마감된 달로 떨어지는 성과급은 «다음 열린 달» 에 붙는다 (막지 않고 비켜 담는다)
     ② 되돌린 건은 급여에 안 센다 — 다만 마감월에서 이미 나간 몫은 그 달에 남긴다
     ③ 급여(calcPerfBonus)와 대시보드(erpPerfBreakdown)가 «같은 거르개»를 쓴다
     ④ 확정하는 자리가 여럿이어도 성과급이 붙은 건은 한 문(erpUpsertIncome)을 지난다
   달·금액을 글자로 박지 않는다. 잠금 목록은 검사 안에서 만들어 넣는다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const APP = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const bare = stripComments(src);

/* 실제 함수들을 그대로 떼어 와 돌린다 — 이름만 보는 검사는 «안 부르는 함수»도 통과시킨다 */
function realm(opts) {
  const o = opts || {};
  const locked = o.locked || [];
  const store = { finance_income: o.income || [] };
  const ctx = {
    Math, JSON, Date, parseInt, parseFloat, String, Number, Object, Array, isNaN, console,
    _toasts: [],
    _saved: [],
    showToast(m) { ctx._toasts.push(String(m)); },
    todayYMD: () => o.today || '2026-09-03',
    dbGet: (k, d) => (store[k] === undefined ? d : store[k]),
    dbSet: (k, v) => { store[k] = v; return true; },
    dbUpsert: (k, rec) => { ctx._saved.push(rec); store[k] = (store[k] || []).concat([rec]); return true; },
    dbUpsertMany: (k, recs) => {
      if (o.saveFails) return false;
      recs.forEach((r) => ctx._saved.push(r));
      store[k] = (store[k] || []).concat(recs);
      return true;
    },
    dbPatch: (k, id, patch) => {
      store[k] = (store[k] || []).map((x) => (x && x.id === id ? Object.assign({}, x, patch) : x));
      return true;
    },
    getActiveUsers: () => o.users || [],
    CURRENT_USER: { sid: 'P-9', name: '검사' },
    window: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const need = [
    'function isPayrollLocked(', 'function erpPerfMonthOf(', 'function erpPerfCounts(',
    'function erpNextOpenYM(', 'function erpPerfYMFor(', 'function erpPerfLockInfo(',
    'function erpLockNoticeFor(', 'function erpUpsertIncome(', 'function erpRoutePerfDelta(',
    'function _perfAdjustRec(', 'function calcPerfBonus(', 'function erpPerfBreakdown(',
    'function erpUndoIncome(',
  ];
  vm.runInContext(need.map((d) => cutFn(src, d)).join('\n'), ctx);
  vm.runInContext('this.locked = ' + JSON.stringify(locked) + ';', ctx);
  store.locked_payroll_months = locked;
  ctx._store = store;
  return ctx;
}

test('① 마감된 달로 떨어지는 성과급은 다음 «열린» 달로 비켜 담는다', () => {
  const c = realm({ locked: ['2026-09', '2026-10'], today: '2026-09-03' });
  // 잠긴 달을 잇달아 건너뛴다 — 잠금이 늘어도 검사가 안 깨진다
  assert.strictEqual(c.erpNextOpenYM('2026-09'), '2026-11');
  // 지난 달로 되돌아가지 않는다 (지난 달에 붙이면 또 마감된 명세서를 건드린다)
  assert.strictEqual(c.erpNextOpenYM('2026-05'), '2026-11');
  assert.strictEqual(c.erpPerfYMFor('2026-09-20'), '2026-11');
  // 안 잠긴 달은 비킬 것이 없다 — 빈 글자여야 옛 자료에 perfYM 이 안 붙는다
  assert.strictEqual(c.erpPerfYMFor('2026-11-02'), '');
});

test('① 성과급이 붙은 확정만 문에서 도장을 받는다 (빈 건은 그대로)', () => {
  const c = realm({ locked: ['2026-09'], today: '2026-09-03' });
  const withPerf = { id: 'a', date: '2026-09-10', perfShares: [{ sid: 'P-1', amount: 100 }] };
  const noPerf = { id: 'b', date: '2026-09-10', perfShares: [] };
  c.erpUpsertIncome(withPerf);
  c.erpUpsertIncome(noPerf);
  assert.ok(withPerf.perfYM && withPerf.perfYM !== '2026-09',
    '마감월에 성과급이 붙은 건은 다른 달로 비켜야 한다');
  assert.strictEqual(noPerf.perfYM, undefined, '성과급이 없으면 도장을 찍을 이유가 없다');
  assert.ok(c._toasts.some((t) => t.indexOf(withPerf.perfYM) >= 0),
    '어디로 갔는지 화면에 말해야 한다 — 조용히 옮기면 아무도 모른다');
});

test('② 급여는 date 가 아니라 «성과급이 붙을 달» 로 센다', () => {
  const rows = [
    { id: 'x', date: '2026-09-10', amount: 1000, perfYM: '2026-11',
      perfShares: [{ sid: 'P-1', amount: 50000 }] },
    { id: 'y', date: '2026-11-05', amount: 1000, perfShares: [{ sid: 'P-1', amount: 7000 }] },
  ];
  const c = realm({ locked: ['2026-09'], income: rows, users: [{ sid: 'P-1', name: '아무개' }] });
  assert.strictEqual(c.calcPerfBonus('P-1', '2026-09').total, 0, '마감월에는 안 붙는다');
  assert.strictEqual(c.calcPerfBonus('P-1', '2026-11').total, 57000, '열린 달에 함께 붙는다');
  // 대시보드도 «같은» 답을 내야 한다 — 거르개가 갈라지면 화면마다 성과급이 달라진다
  assert.strictEqual(c.erpPerfBreakdown('P-1', '2026-11').total,
    c.calcPerfBonus('P-1', '2026-11').total);
});

test('② 되돌린 건은 급여에서 빠진다 — 마감월에서 이미 나간 몫만 남는다', () => {
  const rows = [
    { id: 'u1', date: '2026-11-02', amount: 1000, undoneDate: 'x',
      perfShares: [{ sid: 'P-1', amount: 30000 }] },
    { id: 'u2', date: '2026-11-03', amount: 1000, undoneDate: 'x', perfSettled: true,
      perfShares: [{ sid: 'P-1', amount: 40000 }] },
  ];
  const c = realm({ income: rows, users: [{ sid: 'P-1', name: '아무개' }] });
  assert.strictEqual(c.calcPerfBonus('P-1', '2026-11').total, 40000,
    '되돌린 건은 빠지되, 이미 지급된 것으로 표시한 건은 그 달에 남는다');
  assert.strictEqual(c.erpPerfBreakdown('P-1', '2026-11').total, 40000, '대시보드도 같은 답');
});

test('③ 마감월을 되돌리면 그 달은 그대로 두고 차액이 다음 열린 달로 간다', () => {
  const fi = { id: 'z', date: '2026-09-10', amount: 1000, companyName: '어느 업체',
    perfShares: [{ sid: 'P-1', name: '갑', amount: 30000 },
                 { sid: 'P-2', name: '을', amount: 20000 }] };
  const c = realm({ locked: ['2026-09'], income: [fi], today: '2026-09-20' });
  assert.strictEqual(c.erpUndoIncome(fi), true);
  const after = c._store.finance_income.find((x) => x.id === 'z');
  assert.strictEqual(after.perfSettled, true, '마감월 몫은 이미 나갔다는 표시가 남아야 한다');
  const adj = c._saved.filter((r) => r.sourceKind === 'perf-adjust');
  assert.strictEqual(adj.length, 2, '사람 수만큼 조정이 생겨야 한다');
  assert.strictEqual(new Set(adj.map((r) => r.id)).size, 2,
    '같은 밀리초에 만들어도 열쇠가 겹치면 안 된다 — 겹치면 한 건만 남는다');
  const sum = adj.reduce((t, r) => t + r.perfShares.reduce((s, p) => s + p.amount, 0), 0);
  assert.strictEqual(sum, -50000, '되돌린 만큼 «마이너스» 로 넘어가야 한다');
  adj.forEach((r) => assert.notStrictEqual(r.date.slice(0, 7), '2026-09',
    '조정이 다시 마감된 달로 가면 아무것도 못 고친다'));
});

test('③ 조정을 못 넘기면 되돌리지도 않는다 (반만 처리하면 장부가 어긋난다)', () => {
  const fi = { id: 'z', date: '2026-09-10', amount: 1000,
    perfShares: [{ sid: 'P-1', name: '갑', amount: 30000 }] };
  const c = realm({ locked: ['2026-09'], income: [fi], saveFails: true });
  assert.strictEqual(c.erpUndoIncome(fi), false);
  const after = c._store.finance_income.find((x) => x.id === 'z');
  assert.ok(!after.undoneDate, '넘기지 못했으면 되돌림 표시도 남기면 안 된다');
});

test('③ 안 잠긴 달은 옛날 그대로 — 조정 없이 그냥 되돌린다', () => {
  const fi = { id: 'z', date: '2026-11-10', amount: 1000,
    perfShares: [{ sid: 'P-1', name: '갑', amount: 30000 }] };
  const c = realm({ income: [fi] });
  assert.strictEqual(c.erpUndoIncome(fi), true);
  assert.strictEqual(c._saved.filter((r) => r.sourceKind === 'perf-adjust').length, 0);
  const after = c._store.finance_income.find((x) => x.id === 'z');
  assert.ok(after.undoneDate && !after.perfSettled);
});

test('② 「지난 실적」으로 올린 옛 자료는 실적에는 세고 급여에는 안 붙인다', () => {
  /* 2023~2024 인센티브처럼 날짜가 깨진 채 올라온 자료를 바로잡을 때 —
     날짜를 고쳐도 그 달 급여는 이미 끝났으니 명세서가 뒤늦게 달라지면 안 된다.
     그렇다고 실적에서까지 지우면 고친 뜻이 없다. 두 답이 갈리는 «유일한» 자리다. */
  const rows = [
    { id: 'h1', date: '2023-05-10', amount: 1000, perfHistorical: true,
      perfShares: [{ sid: 'P-1', amount: 500000 }] },
    { id: 'n1', date: '2023-05-11', amount: 1000,
      perfShares: [{ sid: 'P-1', amount: 7000 }] },
  ];
  const c = realm({ income: rows, users: [{ sid: 'P-1', name: '아무개' }] });
  assert.strictEqual(c.calcPerfBonus('P-1', '2023-05').total, 7000,
    '급여에는 옛 실적이 붙으면 안 된다 — 그 달 명세서는 이미 나갔다');
  assert.strictEqual(c.erpPerfBreakdown('P-1', '2023-05').total, 507000,
    '실적에는 세야 한다 — 날짜를 바로잡은 뜻이 거기 있다');
});

test('④ 마감된 달을 손대기 전에 «어디로 가는지» 를 먼저 말한다', () => {
  const c = realm({ locked: ['2026-09'], today: '2026-09-03' });
  const notice = c.erpLockNoticeFor({ date: '2026-09-10' });
  assert.ok(notice, '마감월이면 확인 글에 안내가 붙어야 한다');
  assert.ok(notice.indexOf('2026-09') >= 0 && notice.indexOf(c.erpNextOpenYM('2026-09')) >= 0,
    '어느 달이 잠겼고 어느 달로 가는지 둘 다 있어야 한다');
  assert.strictEqual(c.erpLockNoticeFor({ date: '2026-11-10' }), '',
    '안 잠긴 달까지 겁주지 않는다');
});

test('④ 확정하는 자리들이 «한 문» 을 지난다', () => {
  const gate = (bare.match(/erpUpsertIncome\(/g) || []).length;
  assert.ok(gate >= 5, '확정 자리가 문을 안 지나면 그 자리만 몰래 마감월을 건드린다 (' + gate + ')');
  /* 되돌리기·성과 수정·수동값은 잠금을 «본다» — 함수 안에서 확인한다 */
  assert.ok(/erpPerfLockInfo\(/.test(cutFn(bare, 'function erpUndoIncome(')),
    '되돌리기가 잠금을 안 보면 마감된 명세서가 줄어든다');
  assert.ok(/_perfEditAllowed\(/.test(cutFn(bare, 'function applyPerfOverride(')),
    '건별 수동값이 잠금을 안 보면 마감된 명세서가 달라진다');
  assert.ok(/_perfEditAllowed\(/.test(cutFn(bare, 'function revertPerfOverride(')));
  assert.ok(/isPayrollLocked\(/.test(cutFn(bare, 'function addPerfAdjust(')),
    '마감된 달에 조정을 새로 얹으면 이미 나간 명세서가 달라진다');
});

test('④ 두 계산기가 거르개를 «같은 함수» 로 쓴다', () => {
  ['function calcPerfBonus(', 'function erpPerfBreakdown('].forEach((d) => {
    const fn = cutFn(bare, d);
    assert.ok(/erpPerfCounts\(/.test(fn), d + ' 가 공용 거르개를 안 쓴다');
    assert.ok(/erpPerfMonthOf\(/.test(fn), d + ' 가 성과급 붙을 달을 안 본다');
  });
});
