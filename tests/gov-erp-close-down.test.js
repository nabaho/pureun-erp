/* 「푸른이알피 컨설팅관리에서 종료를 누르면 일정관리에서도 자동 종료」 (대표 2026-09-03)
 *
 * ★ 원칙 — «더하기만» 한다.
 *   이알피에서 다시 열어도 일정관리 종료를 되살리지 않는다. 부담당 거울과 같다(2026-08-31).
 *   되살리면 사람이 일정관리에서 직접 끝낸 것이 이알피 재개 한 번에 조용히 돌아온다.
 *
 * ⚠ 이알피 「종료」는 status:'closed' + closedAt(+endDate) 을 적고 closedDate 는 «안 적는다».
 *   closedDate 만 보면 이 기능은 아무것도 안 한다.
 *
 * 못 박는 것은 «지금 값»이 아니라 규칙이다 (CLAUDE.md).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');
const LINES = SRC.split(/\r?\n/);
const bare = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const CODE = bare(SRC);

function grab(n) {
  const i = SRC.search(new RegExp('(?:async\\s+)?function ' + n + '\\('));
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; st = true; }
    else if (SRC[j] === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}
/* 한 줄짜리 const 는 소스에서 떠 온다 — 여기 베껴 쓰면 소스와 조용히 어긋난다 */
function grabLine(prefix) {
  const l = LINES.find((x) => x.trim().startsWith(prefix));
  assert.ok(l, prefix + ' 을(를) 못 찾았다');
  return l;
}

const TODAY = '2026-09-03';
/* 셈을 실제로 돌린다 */
function world(cons, cos, map) {
  const ctx = {
    ERP: { loaded: true, consultings: cons, types: [] },
    getErpTypeMap: () => map || { CODE1: 't1' },
    getCos: () => cos,
    setCos: () => { ctx.__saved = (ctx.__saved || 0) + 1; },
    toast: (m) => { ctx.__toast = m; },
    renderDash: () => {}, renderCal: () => {},
    todayStr: () => TODAY,
    String, Array, Object, JSON,
  };
  vm.createContext(ctx);
  vm.runInContext([
    grabLine('const CO_CORP_RE='), grabLine('const _en='),
    grab('coKey'), grab('coKeyLoose'), grab('findCoForErp'),
    grab('erpConsCode'), grab('erpClosedOn'), grab('erpSyncClosedDown'),
  ].join('\n'), ctx);
  return ctx;
}
const CO = (o) => Object.assign({ id: 'c1', name: '해담솔', types: ['t1'], endedTypes: {} }, o);
/* 이알피가 실제로 적는 모습 — status + closedAt + endDate, closedDate 는 없다 */
const CLOSED = (o) => Object.assign({
  id: 'e1', companyName: '해담솔', typeCode: 'CODE1',
  status: 'closed', closedAt: '2026-08-13', endDate: '2026-08-13',
}, o);
const OPEN = (o) => Object.assign({ id: 'e1', companyName: '해담솔', typeCode: 'CODE1', status: 'progress' }, o);

/* ══ 끝났나 안 끝났나 ═══════════════════════════════════════════ */

test('★★★ 이알피가 closedDate 없이 «status+closedAt» 만 적어도 끝난 것으로 본다', () => {
  /* 이게 이알피 「종료」 단추의 실제 모습이다.
     closedDate 만 보면 이 기능은 한 건도 못 닫는다. */
  const w = world([], []);
  assert.ok(w.erpClosedOn({ status: 'closed', closedAt: '2026-08-13' }),
    'closedDate 가 없다고 안 끝난 것으로 본다 — 종료 단추가 아무 일도 안 하게 된다');
});

test('★★ 안 끝난 건은 빈 값', () => {
  const w = world([], []);
  assert.strictEqual(w.erpClosedOn(OPEN()), '');
  assert.strictEqual(w.erpClosedOn(null), '');
});

test('★★ 종료일은 endDate 를 먼저 본다 — 사람이 고른 날이 우선이다', () => {
  const w = world([], []);
  assert.strictEqual(w.erpClosedOn({ status: 'closed', endDate: '2026-08-13', closedAt: '2026-09-01' }), '2026-08-13');
});

test('★ endDate 가 없으면 closedDate → closedAt 순', () => {
  const w = world([], []);
  assert.strictEqual(w.erpClosedOn({ status: 'closed', closedDate: '2026-07-01', closedAt: '2026-08-01' }), '2026-07-01');
  assert.strictEqual(w.erpClosedOn({ status: 'closed', closedAt: '2026-08-01T09:00:00.000Z' }), '2026-08-01');
});

test('★★ 날짜가 없거나 알아볼 수 없으면 «오늘»로 적는다 — 끝난 건 분명하다', () => {
  const w = world([], []);
  assert.strictEqual(w.erpClosedOn({ status: 'closed' }), TODAY);
  assert.strictEqual(w.erpClosedOn({ status: 'closed', closedAt: '작년' }), TODAY);
});

/* ══ 실제로 닫는가 ═════════════════════════════════════════════ */

test('★★★ 이알피에서 끝난 컨설팅을 일정관리에서도 끝낸다', () => {
  const cos = [CO()];
  const w = world([CLOSED()], cos);
  assert.strictEqual(w.erpSyncClosedDown(), 1);
  assert.strictEqual(cos[0].endedTypes.t1, '2026-08-13', '끝나지 않았다 — 다음 회차가 계속 밀려 나온다');
  assert.strictEqual(w.__saved, 1, '안 저장한다 — 새로고침하면 도로 열린다');
  assert.ok(/종료/.test(w.__toast || ''), '아무 말 없이 끝낸다 — 담당자가 놀란다');
});

test('★★ 안 끝난 건은 손대지 않는다', () => {
  const cos = [CO()];
  const w = world([OPEN()], cos);
  assert.strictEqual(w.erpSyncClosedDown(), 0);
  assert.deepStrictEqual(cos[0].endedTypes, {}, '도는 컨설팅을 끝내 버린다');
  assert.ok(!w.__saved, '바뀐 것도 없는데 저장한다');
});

test('★★★ 이미 끝나 있으면 «날짜를 안 덮는다»', () => {
  /* 사람이 일정관리에서 먼저 끝낸 날이 있으면 그 날이 맞다. */
  const cos = [CO({ endedTypes: { t1: '2026-07-31' } })];
  const w = world([CLOSED()], cos);
  assert.strictEqual(w.erpSyncClosedDown(), 0);
  assert.strictEqual(cos[0].endedTypes.t1, '2026-07-31', '사람이 적은 종료일을 이알피 날짜로 덮는다');
});

test('★★★ 두 번 돌려도 다시 저장하지 않는다 — 로그인마다 도는 함수다', () => {
  const cos = [CO()];
  const w = world([CLOSED()], cos);
  w.erpSyncClosedDown();
  const n = w.__saved;
  assert.strictEqual(w.erpSyncClosedDown(), 0);
  assert.strictEqual(w.__saved, n, '들어올 때마다 같은 값을 다시 쓴다 — 요금과 충돌이 늘어난다');
});

/* ══ 손대면 안 되는 것 ═════════════════════════════════════════ */

test('★★★ 종류가 «안 이어져 있으면» 손대지 않는다 — 어느 사업인지 모른다', () => {
  const cos = [CO()];
  const w = world([CLOSED({ typeCode: 'MOOSOSOK' })], cos, { CODE1: 't1' });
  assert.strictEqual(w.erpSyncClosedDown(), 0);
  assert.deepStrictEqual(cos[0].endedTypes, {}, '이어지지도 않은 종류로 아무 사업이나 끝낸다');
});

test('★★ 일정관리에 «없는» 곳은 손대지 않는다', () => {
  const cos = [CO({ name: '다른회사' })];
  const w = world([CLOSED()], cos);
  assert.strictEqual(w.erpSyncClosedDown(), 0);
});

test('★★ 그 사업장에 «그 종류가 없으면» 손대지 않는다', () => {
  const cos = [CO({ types: ['t9'] })];
  const w = world([CLOSED()], cos);
  assert.strictEqual(w.erpSyncClosedDown(), 0);
  assert.deepStrictEqual(cos[0].endedTypes, {}, '그 사업장이 하지도 않는 사업을 끝낸다');
});

test('★★ 여러 사업 가운데 «그 사업만» 끝낸다', () => {
  const cos = [CO({ types: ['t1', 't2'] })];
  const w = world([CLOSED()], cos);
  w.erpSyncClosedDown();
  assert.strictEqual(cos[0].endedTypes.t1, '2026-08-13');
  assert.ok(!cos[0].endedTypes.t2, '한 사업이 끝났다고 옆 사업까지 끝낸다');
});

test('★★★ «되살리지 않는다» — 이알피에서 다시 열어도 일정관리 종료는 그대로', () => {
  /* 대표 결정: 더하기만. 사람이 일정관리에서 끝낸 것이
     이알피 재개 한 번에 조용히 돌아오면 안 된다. */
  const cos = [CO({ endedTypes: { t1: '2026-07-31' } })];
  const w = world([OPEN()], cos);
  w.erpSyncClosedDown();
  assert.strictEqual(cos[0].endedTypes.t1, '2026-07-31', '이알피가 다시 열었다고 일정관리 종료를 지운다');
  const fn = bare(grab('erpSyncClosedDown'));
  assert.ok(!/delete .*endedTypes|endedTypes\[[^\]]+\]\s*=\s*(null|''|"")/.test(fn),
    '종료를 지우는 줄이 있다 — 거울은 더하기만 해야 한다');
});

test('★★ 다른 칸은 건드리지 않는다 — 종료 칸 하나만 쓴다', () => {
  const cos = [CO({ defAtt: 'a1', erpId: 'zzz', active: true })];
  const w = world([CLOSED()], cos);
  w.erpSyncClosedDown();
  assert.strictEqual(cos[0].defAtt, 'a1');
  assert.strictEqual(cos[0].erpId, 'zzz', '이알피 번호를 덮어쓴다');
  assert.strictEqual(cos[0].active, true);
});

test('★★ 이알피를 아직 못 읽었으면 아무것도 안 한다', () => {
  const cos = [CO()];
  const w = world([CLOSED()], cos);
  w.ERP.loaded = false;
  assert.strictEqual(w.erpSyncClosedDown(), 0);
  assert.deepStrictEqual(cos[0].endedTypes, {}, '덜 읽힌 판으로 끝낸다');
});

/* ══ 붙어 있어야 뜻이 있다 ═════════════════════════════════════ */

test('★★★ 이알피를 읽을 때마다 실제로 «불린다»', () => {
  const call = CODE.indexOf('erpSyncClosedDown();');
  assert.ok(call >= 0, '만들어만 두고 아무 데서도 안 부른다');
});

test('★★★ «옛 사본»으로는 안 돈다 — 부담당 맞춤과 같은 막 안에 있다', () => {
  /* 몇 달 전 사본으로 지금 도는 컨설팅을 끝내면 회차가 통째로 멈춘다.
     erpLoadAll 의 if(!ERP.stale) 블록 «안»에 있어야 한다. */
  const fn = grab('erpLoadAll');
  const guard = fn.indexOf('if(!ERP.stale)');
  const call = fn.indexOf('erpSyncClosedDown()');
  const elseAt = fn.indexOf('}else{', guard);
  assert.ok(guard >= 0, '옛 사본 막이 사라졌다');
  assert.ok(call > guard, '옛 사본 막보다 «앞»에서 부른다 — 몇 달 전 자료로 컨설팅을 끝낸다');
  assert.ok(elseAt < 0 || call < elseAt, '옛 사본 막 «밖»에서 부른다');
});

test('★★ 터져도 나머지를 막지 않는다 — 이알피 읽기 자체가 죽으면 안 된다', () => {
  const fn = grab('erpLoadAll');
  const i = fn.indexOf('erpSyncClosedDown()');
  const near = fn.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, '');
  assert.ok(/try\{erpSyncClosedDown\(\);\}catch/.test(near),
    '감싸지 않았다 — 여기서 터지면 이알피 맞추기가 통째로 멈춘다');
});
