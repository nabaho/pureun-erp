'use strict';
/* 🛠 바로잡기 — 잘못 들어온 돈·잘못 지정된 담당자 (2026-09-03 대표 지시 ⓑ)

   ■ 무엇이 문제였나
   고치는 길은 이미 있었다 — 업체 바꾸기 · 담당/성과 · 되돌리기 세 단추.
   그런데 ① 세 갈래로 흩어져 있어 고치러 온 사람이 자기 경우를 못 골랐고,
   ② 「왜 고쳤나」가 어디에도 안 남았고,
   ③ 남은 기록(editHistory)조차 «볼 화면이 없었고»,
   ④ 급여 성과팝업의 「건별 수동값」은 아예 기록을 안 남겼고,
   ⑤ 「내 성과급이 이상한데」를 발견하는 성과관리에서 원천으로 가는 길이 없었다.

   ■ 무엇을 못 박나 — «값»이 아니라 «규칙»이다
     ① 확정 이력의 한 들머리에서 네 갈래를 모두 연다
     ② 사유는 이력에 남고, 이력은 그 자리에서 보인다
     ③ 고치는 두 길(재무 담당·성과 / 급여 수동값)이 «같은» 이력에 쌓인다
     ④ 성과관리에서 원천으로 건너가는 쪽지는 «오래되면» 안 듣는다
   창 크기·색·글자는 박지 않는다. */

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

/* 바로잡기 창은 컴포넌트 «안» 이라 cutFn 이 못 쓴다 — 창의 시작과 끝으로 오려 낸다.
   화면 전체를 뒤지면 다른 창의 글자에 걸려 통과해 버린다. */
function fixWindow(text) {
  const a = text.indexOf('fixPop && (function(){');
  assert.ok(a > 0, '바로잡기 창을 찾지 못했습니다');
  const b = text.indexOf('movePop && (function(){', a);
  assert.ok(b > a, '바로잡기 창의 끝(업체 바꾸기 창)을 찾지 못했습니다');
  return text.slice(a, b);
}
const WIN = fixWindow(bare);

function realm(opts) {
  const o = opts || {};
  const store = { finance_income: o.income || [], locked_payroll_months: o.locked || [] };
  const ctx = {
    Math, JSON, Date, parseInt, parseFloat, String, Number, Object, Array, console,
    _toasts: [],
    showToast(m) { ctx._toasts.push(String(m)); },
    todayYMD: () => o.today || '2026-09-03',
    dbGet: (k, d) => (store[k] === undefined ? d : store[k]),
    dbSet: (k, v) => { store[k] = v; return true; },
    dbPatch: (k, id, patch) => {
      store[k] = (store[k] || []).map((x) => (x && x.id === id ? Object.assign({}, x, patch) : x));
      return true;
    },
    CURRENT_USER: { sid: 'P-9', name: '검사' },
    window: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const need = [
    'function isPayrollLocked(', 'function erpPerfMonthOf(', 'function erpNextOpenYM(',
    'function erpPerfLockInfo(', 'function erpIncomeLog(', 'function erpIncomeLogText(',
    'function _perfShareMatch(', 'function _perfAmountOf(', 'function _perfEditAllowed(',
    'function applyPerfOverride(', 'function revertPerfOverride(',
  ];
  vm.runInContext(need.map((d) => cutFn(src, d)).join('\n'), ctx);
  ctx._store = store;
  return ctx;
}

test('① 「왜 고쳤나」가 이력에 남는다 — 무엇이 바뀌었는지는 자료가, 왜는 사람만 안다', () => {
  const c = realm({ income: [{ id: 'a', date: '2026-09-01' }] });
  assert.strictEqual(c.erpIncomeLog('a', '업체를 옮김', null, null, '담당 인계'), true);
  const got = c._store.finance_income[0].editHistory;
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].why, '담당 인계');
  assert.strictEqual(got[0].what, '업체를 옮김');
  assert.ok(got[0].by && got[0].date, '누가·언제가 없으면 이력이 아니다');
  // 사유를 안 적어도 기록 자체는 남아야 한다
  c.erpIncomeLog('a', '되돌림');
  assert.strictEqual(c._store.finance_income[0].editHistory.length, 2);
});

test('① 이력이 한 건에 끝없이 쌓이지 않는다', () => {
  const c = realm({ income: [{ id: 'a' }] });
  for (let i = 0; i < 40; i++) c.erpIncomeLog('a', '고침 ' + i);
  const got = c._store.finance_income[0].editHistory;
  assert.ok(got.length <= 30, '이력이 무한히 쌓이면 기록 하나가 자료를 삼킨다 (' + got.length + ')');
  assert.strictEqual(got[got.length - 1].what, '고침 39', '가장 최근 것이 남아야 한다');
});

test('① 옛 이력(what 이 없는 것)도 사람이 읽는 글로 나온다', () => {
  const c = realm({});
  const old = { before: { shares: [{ amount: 330000 }] }, after: { shares: [{ amount: 0 }] } };
  const txt = c.erpIncomeLogText(old);
  assert.ok(/330,000/.test(txt) && /0/.test(txt), '옛 자료가 「고침」 한 글자로 뭉개지면 안 된다');
  assert.strictEqual(c.erpIncomeLogText({ what: '되돌림' }), '되돌림');
});

test('② 급여 성과팝업의 수동값도 «같은» 이력에 쌓인다 (전에는 아무것도 안 남았다)', () => {
  const rows = [{ id: 'x', date: '2026-11-02',
    perfShares: [{ sid: 'P-1', name: '갑', amount: 100000 }] }];
  const c = realm({ income: rows });
  assert.strictEqual(c.applyPerfOverride('x', 'P-1', '갑', 70000, '계산 착오'), true);
  let h = c._store.finance_income[0].editHistory;
  assert.strictEqual(h.length, 1, '수동값을 넣었으면 이력이 남아야 한다');
  assert.strictEqual(h[0].before, 100000, '얼마에서');
  assert.strictEqual(h[0].after, 70000, '얼마로');
  assert.strictEqual(h[0].why, '계산 착오');

  assert.strictEqual(c.revertPerfOverride('x', 'P-1', '갑', '되돌림'), true);
  h = c._store.finance_income[0].editHistory;
  assert.strictEqual(h.length, 2, '자동값 복귀도 남아야 한다');
  assert.strictEqual(h[1].before, 70000);
  assert.strictEqual(h[1].after, 100000, '보존해 둔 자동값으로 돌아간다');
});

test('② 마감된 달이면 손대지 않고, 이력도 남기지 않는다', () => {
  const rows = [{ id: 'x', date: '2026-09-02',
    perfShares: [{ sid: 'P-1', name: '갑', amount: 100000 }] }];
  const c = realm({ income: rows, locked: ['2026-09'] });
  assert.strictEqual(c.applyPerfOverride('x', 'P-1', '갑', 70000, '착오'), false);
  assert.ok(!c._store.finance_income[0].editHistory,
    '막았는데 이력만 남으면 「고쳤다」고 잘못 읽힌다');
  assert.strictEqual(c._store.finance_income[0].perfShares[0].amount, 100000);
});

test('③ 한 들머리에서 네 갈래를 모두 연다 — 내놓은 갈래는 «이어져» 있어야 한다', () => {
  /* ★ 「그 함수가 파일 안에 있나」를 보면 안 된다 — 갈래를 내놓고 잇는 줄만 지워도
     창은 멀쩡해 보이고 누르면 아무 일도 안 일어난다. 내놓은 갈래마다 받는 곳을 본다. */
  const cards = Array.from(WIN.matchAll(/\{ v:'(\w+)'/g), (m) => m[1]);
  assert.ok(cards.length >= 4, '갈래가 넷보다 적다 (' + cards.join(',') + ')');
  cards.forEach((v) => {
    assert.ok(WIN.indexOf("fixPop.pick === '" + v + "'") >= 0,
      '「' + v + '」 갈래를 내놓기만 하고 받는 곳이 없다 — 눌러도 아무 일이 없다');
  });
  ['setMovePop(', 'setEditPop(', 'erpUndoIncome(', 'markPartial('].forEach((g) => {
    assert.ok(WIN.indexOf(g) >= 0, '바로잡기 창이 ' + g + ' 갈래를 못 연다');
  });
  // 갈래를 고르기 «전» 에는 진행 단추가 안 눌린다 — 아무거나 눌러 일이 벌어지면 안 된다
  assert.ok(/disabled:\s*!\s*fixPop\.pick/.test(WIN), '고르기 전에도 눌리면 실수로 고쳐진다');
  // 자문료에는 성과급이 없다 — 담당 갈래를 내놓으면 안 된다
  assert.ok(/hide\s*:\s*isAdv/.test(WIN), '자문료에 담당·성과 갈래를 내놓으면 안 된다');
});

test('③ 창이 마감·사유·이력 셋을 «그 자리에서» 보여 준다', () => {
  assert.ok(/erpPerfLockInfo\(/.test(WIN), '마감된 달인지 먼저 알려야 한다');
  assert.ok(/setFixWhy\(/.test(WIN), '왜 고치는지를 받아야 한다');
  assert.ok(/editHistory/.test(WIN) && /erpIncomeLogText\(/.test(WIN),
    '적히기만 하고 볼 화면이 없던 이력을 여기서 보여야 한다');
});

test('③ 고른 갈래로 «사유를 들고» 간다 — 한 줄이라도 빠지면 안 된다', () => {
  /* 옮기기는 이력을 «두 곳»(옛 기록·새 기록)에 적는다. 한쪽만 사유를 실으면
     다른 쪽을 연 사람은 왜 옮겼는지 모른다 — 그래서 「하나라도 있나」가 아니라
     「전부 싣는가」를 본다. */
  const at = bare.indexOf('async function doMove(');
  assert.ok(at > 0, 'doMove 를 찾지 못했습니다');
  const move = bare.slice(at, at + 3000);
  const calls = (move.match(/erpIncomeLog\(/g) || []).length;
  const withWhy = (move.match(/erpIncomeLog\([^;]*fixWhy[^;]*\)/g) || []).length;
  assert.ok(calls >= 2, '옮길 때 양쪽 기록에 안 적는다 (' + calls + '곳)');
  assert.strictEqual(withWhy, calls, '옮길 때 사유를 안 싣는 이력이 있다');

  const sv = bare.indexOf('      function doSave(){');
  assert.ok(/fixWhy/.test(bare.slice(sv, sv + 2500)), '성과를 고칠 때 사유가 안 실린다');
});

test('④ 확정 이력 줄에서 한 단추로 들어간다', () => {
  const at = bare.indexOf("'🛠 바로잡기'");
  assert.ok(at > 0, '확정 이력 줄에 들머리가 없다');
  assert.ok(/openFix\(/.test(bare), '들머리가 창을 안 연다');
  // 방금 확정한 줄에서도 — 틀린 것을 알아채는 자리가 바로 거기다
  assert.ok(/lastAct\.kind===['"]confirm['"] && lastAct\.fid && h\('button'/.test(bare),
    '되돌리기 띠에 바로잡기 길이 없다');
});

test('④ 성과관리 → 원천으로 건너가는 쪽지는 오래되면 안 듣는다', () => {
  assert.ok(/__erpFixIncome = \{ id:d\.incomeId/.test(bare),
    '성과관리에서 원천 번호를 안 들고 간다');
  assert.ok(/onNavigate\(['"]fin\/ledger['"]\)/.test(bare), '건너갈 화면을 안 가리킨다');
  const eff = bare.slice(bare.indexOf('var msg = window.__erpFixIncome;'),
    bare.indexOf('var msg = window.__erpFixIncome;') + 700);
  assert.ok(/msg\.at/.test(eff) && /return;/.test(eff),
    '어제 눌러 둔 쪽지가 오늘 창을 열면 놀란다 — 시각을 봐야 한다');
  assert.ok(/window\.__erpFixIncome = null;/.test(eff),
    '쪽지를 안 지우면 화면을 열 때마다 창이 뜬다');
});
