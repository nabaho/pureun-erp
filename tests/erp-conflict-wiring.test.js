'use strict';
// pu-erp.html 이 동시 편집 판단 층을 제대로 물고 있는지 정적 검사 — node --test tests/*.test.js
//
// 왜 정적으로 보나: pu-erp.html 은 한 파일 7만 줄이라 실행 검사가 어렵다. 대신
// "다시 베껴 넣기"·"그물 없애기"처럼 되돌아가기 쉬운 실수를 여기서 막는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

/* pu-erp.html 은 한 파일 7만 줄이라 통째로 실행할 수 없다. 동시 편집에 관한
   토막만 떼어 가짜 저장소·가짜 물음창과 함께 돌린다 — 정적 검사로는 알 수 없는
   "물어보고 나서 어떻게 되는가"를 실제로 본다. */
function loadWiring(opts) {
  opts = opts || {};
  const from = app.indexOf('// ============ 동시 편집 —');
  const to = app.indexOf('function _recLocalSave');
  assert.ok(from > 0 && to > from, '동시 편집 토막을 찾을 수 없습니다');
  const src = fs.readFileSync(path.join(root, 'js', 'pu-conflict.js'), 'utf8') +
    '\nvar CO_FIELD_LABEL = { phone:"전화", ceo:"대표자", address:"주소" };\n' +
    app.slice(from, to);
  const said = [];
  /* ⚠ window 를 딴 그릇으로 두면 안 된다. 브라우저에서는 window 가 곧 전역이라
     앱이 PuConflict 를 그냥 이름으로 부른다 — 딴 그릇이면 여기서만 안 보인다. */
  const sandbox = {
    console: { warn() {}, log() {} },
    CURRENT_USER: { name: opts.myName || '권형하' },
    dbGet(k) { return (opts.store && opts.store[k]) || []; },
    showToast(m) { said.push(m); },
    popConfirm(m) { said.push(m); return Promise.resolve(!!opts.answerYes); },
    getSessionSid() { return 'p001'; }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'erp-conflict.js' }).runInContext(sandbox);
  sandbox.said = said;
  return sandbox;
}

const T1 = new Date(2026, 7, 4, 10, 0).getTime();
const T2 = new Date(2026, 7, 4, 10, 30).getTime();

test('겹쳤으면 물어보고, 취소하면 저장을 멈춘다', async () => {
  const w = loadWiring({
    answerYes: false,
    store: { companies: [{ id: 'c1', updatedAt: T2, updatedBy: '김노무', phone: '041-9' }] }
  });
  const go = await w.erpGuardEdit('companies', { id: 'c1', updatedAt: T1, phone: '041-1' });
  assert.equal(go, false, '취소했는데 저장으로 넘어갑니다');
  assert.equal(w.said.length, 1, '물어보지 않았습니다');
  assert.match(w.said[0], /김노무/);
  assert.match(w.said[0], /업체/, '무엇을 고치는 중인지 말하지 않습니다');
  assert.match(w.said[0], /전화/, '칸 이름표가 비어 있습니다 (업체 이름표를 못 읽었습니다)');
});

test('확인하면 저장으로 넘어간다', async () => {
  const w = loadWiring({
    answerYes: true,
    store: { companies: [{ id: 'c1', updatedAt: T2, updatedBy: '김노무' }] }
  });
  assert.equal(await w.erpGuardEdit('companies', { id: 'c1', updatedAt: T1 }), true);
});

test('겹치지 않았으면 아무것도 묻지 않는다', async () => {
  const w = loadWiring({ store: { companies: [{ id: 'c1', updatedAt: T1 }] } });
  assert.equal(await w.erpGuardEdit('companies', { id: 'c1', updatedAt: T1 }), true);
  assert.deepEqual([...w.said], []);
});

test('내가 방금 고친 것이면 나에게 묻지 않는다', async () => {
  const w = loadWiring({
    myName: '권형하',
    store: { companies: [{ id: 'c1', updatedAt: T2, updatedBy: '권형하' }] }
  });
  assert.equal(await w.erpGuardEdit('companies', { id: 'c1', updatedAt: T1 }), true);
  assert.deepEqual([...w.said], []);
});

test('없는 자료를 고치는 것이면(새로 만들기) 묻지 않는다', async () => {
  const w = loadWiring({ store: { companies: [] } });
  assert.equal(await w.erpGuardEdit('companies', { id: 'new1', updatedAt: T1 }), true);
  assert.deepEqual([...w.said], []);
});

test('물어본 뒤에는 그물이 또 알리지 않는다', async () => {
  const w = loadWiring({
    answerYes: true,
    store: { companies: [{ id: 'c1', updatedAt: T2, updatedBy: '김노무' }] }
  });
  const mine = { id: 'c1', updatedAt: T1 };
  await w.erpGuardEdit('companies', mine);
  const n = w.said.length;
  w._conflictNet('companies', mine, { id: 'c1', updatedAt: T2, updatedBy: '김노무' });
  assert.equal(w.said.length, n, '같은 일로 두 번 놀라게 합니다');
});

test('묻지 않은 경로는 덮어썼다고 알린다 — 조용히 사라지지 않는다', () => {
  const w = loadWiring({});
  w._conflictNet('cases', { id: 'x1', updatedAt: T1 }, { id: 'x1', updatedAt: T2, updatedBy: '김노무' });
  assert.equal(w.said.length, 1, '아무 말 없이 덮었습니다');
  assert.match(w.said[0], /덮어썼습니다/);
  assert.match(w.said[0], /사건/);
});

test('여러 건이 겹쳐도 알림은 한 번, 건수는 말해 준다', () => {
  const w = loadWiring({});
  w._conflictTell('companies', { who: '김노무', at: T2, diff: ['전화'] }, 4);
  assert.equal(w.said.length, 1);
  assert.match(w.said[0], /외 3건/);
});

test('무엇인지 모르는 자료도 사람 말로 부른다', () => {
  const w = loadWiring({});
  assert.equal(w.conflictWhat('companies'), '업체');
  assert.equal(w.conflictWhat('duck_soup'), '자료', '영문 키를 사람에게 보여줍니다');
});

function fnBody(name) {
  const m = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 본문을 찾을 수 없습니다');
  return m[0];
}

test('판단 층을 불러온다', () => {
  assert.match(app, /<script src="js\/pu-conflict\.js"><\/script>/);
});

test('판단은 공용 층에만 있다 — 화면에 베껴 넣지 않는다', () => {
  // 화면마다 베끼면 한 곳만 고쳐지고 나머지는 뒤처진다(그래서 계약관리만 경고가 있었다).
  assert.ok(!/latest\.updatedAt > origUpdatedAt/.test(app),
    '계약관리에 옛 판단이 그대로 남아 있습니다');
  const inline = app.match(/동시 편집 충돌\\n\\n/g);
  assert.equal(inline, null, '화면에 문구를 직접 박아 놓았습니다 — 공용 층에서 받아야 합니다');
});

test('물어보는 함수가 있고 판단을 공용 층에 맡긴다', () => {
  const g = fnBody('erpGuardEdit');
  assert.match(g, /PuConflict\.check\(/, '스스로 판단하고 있습니다');
  assert.match(g, /PuConflict\.message\(/, '문구를 스스로 만들고 있습니다');
  assert.match(g, /myName/, '내가 고친 것까지 경고하게 됩니다');
});

test('칸 이름표는 처음 쓸 때 만든다 — 미리 읽으면 업체 이름표가 비어 있다', () => {
  // 업체 이름표는 이 코드 아래에서 선언된다. 불러올 때 바로 읽으면 통째로 빠진다.
  const b = fnBody('conflictLabels');
  assert.match(b, /CO_FIELD_LABEL/, '업체 칸 이름표를 쓰지 않습니다');
  assert.ok(!/var CONFLICT_LABEL *= *\(function/.test(app),
    '불러오는 시점에 이름표를 만들고 있습니다');
});

test('그물은 저장 시각을 찍기 전에 본다', () => {
  // 시각을 찍은 뒤에는 '내가 읽어온 판'을 알 수 없어 겹침을 영원히 못 잡는다.
  const u = fnBody('dbUpsert');
  const net = u.indexOf('_conflictNet(');
  const stamp = u.indexOf('_recStamp(item)');
  assert.ok(net > 0, 'dbUpsert 에 그물이 없습니다');
  assert.ok(stamp > 0 && net < stamp, '시각을 찍은 뒤에 보고 있습니다 — 늘 겹침이 없다고 나옵니다');
});

test('일괄 저장에도 그물이 있고 알림은 한 번만', () => {
  const m = fnBody('dbUpsertMany');
  assert.match(m, /_conflictFind\(/, '일괄 저장에는 그물이 없습니다');
  assert.match(m, /hits\[0\], hits\.length/, '겹친 건마다 따로 알리면 아무도 안 읽습니다');
  const find = m.indexOf('_conflictFind(');
  const stamp = m.indexOf('_recStamp(it)');
  assert.ok(find < stamp, '시각을 찍은 뒤에 보고 있습니다');
});

test('물어본 건은 그물이 또 알리지 않는다', () => {
  const f = fnBody('_conflictFind');
  assert.match(f, /_conflictAsked/, '같은 일로 두 번 놀라게 합니다');
});

test('여러 사람이 함께 만지는 화면이 모두 물어본다', () => {
  // 계약만 물어보던 것이 이 작업의 출발점이다 — 다시 한 곳으로 줄어들면 안 된다.
  const want = ['contracts', 'companies', 'cases', 'finance_income', 'finance_expense', 'finance_invoice'];
  want.forEach(function (k) {
    assert.ok(app.indexOf("erpGuardEdit('" + k + "'") > 0, k + ' 화면이 묻지 않고 저장합니다');
  });
  // 컨설팅·기금·기타사업은 한 화면이 함께 쓴다 — 키를 그 화면에서 받는다
  assert.match(app, /erpGuardEdit\(props\.storageKey/, '컨설팅·기금·기타사업이 묻지 않고 저장합니다');
});

test('물어본 뒤 사람이 취소하면 저장하지 않는다', () => {
  // await 결과를 버리면 경고만 뜨고 그대로 저장된다 — 있으나 마나가 된다.
  const calls = (app.match(/erpGuardEdit\(/g) || []).length - 1;   // 선언 한 줄은 뺀다
  assert.ok(calls >= 7, '물어보는 곳이 너무 적습니다: ' + calls);
  const guarded = (app.match(/if\(!\(await erpGuardEdit\([^)]*\)\)\) return;/g) || []).length;
  assert.equal(guarded, calls,
    '결과를 보지 않고 넘어가는 곳이 있습니다 (' + guarded + '/' + calls + ')');
});

test('퇴직정산이 고친 때를 글자로 덮지 않는다', () => {
  // 글자로 덮으면 '내가 읽어온 판'이 사라져 겹침을 못 잡는다(저장 층이 곧 숫자로 다시 찍는다).
  // ※ 개인 자료(내 업무·진행률)는 자기 표시용으로 글자 시각을 쓴다 — 그쪽은 건드리지 않는다.
  const i = app.indexOf("dbUpsert('retirement_settlements'");
  assert.ok(i > 0, '퇴직정산 저장을 찾을 수 없습니다');
  const block = app.slice(Math.max(0, i - 900), i);
  assert.ok(!/updatedAt: *\(new Date\(\)\)\.toISOString\(\)/.test(block),
    '퇴직정산이 고친 때를 글자로 덮어쓰고 있습니다');
});
