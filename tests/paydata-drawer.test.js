'use strict';
// 사업장 서랍 — 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

function loadCalc() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    cut('drawerCounts'), cut('drawerModel'), cut('searchRows'),
    'window.drawerCounts = drawerCounts; window.drawerModel = drawerModel; window.searchRows = searchRows;'
  ].join('\n'), { filename: 'calc.js' }).runInContext(sandbox);
  return sandbox.window;
}

const ITEMS_MONTH = {
  a1: { companyId: 'co_1', kind: 'attend', month: '202608', filename: '근태.jpg', filedAt: 10 },
  a2: { companyId: 'co_1', kind: 'ledger', month: '202608', filename: '대장.xlsx', filedAt: 20 },
  a3: { companyId: 'co_2', kind: 'attend', month: '202608', filename: '남의업체.jpg', filedAt: 30 }
};
const ITEMS_KEEP = {
  k1: { companyId: 'co_1', kind: 'contract', month: 'keep', filename: '계약서1.pdf', filedAt: 5 },
  k2: { companyId: 'co_1', kind: 'contract', month: 'keep', filename: '계약서2.pdf', filedAt: 6 },
  k3: { companyId: 'co_2', kind: 'contract', month: 'keep', filename: '남의계약서.pdf', filedAt: 7 }
};

test('그 사업장 그 종류만 보인다', () => {
  const W = loadCalc();
  const out = W.drawerModel(ITEMS_KEEP, ITEMS_MONTH, 'co_1', 'attend', 0);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].filename, '근태.jpg');
});

test('★ 다른 사업장 자료가 섞이지 않는다', () => {
  const W = loadCalc();
  const out = W.drawerModel(ITEMS_KEEP, ITEMS_MONTH, 'co_1', 'attend', 0);
  assert.equal(out.rows.filter(r => r.companyId !== 'co_1').length, 0);
});

test('★ 근로계약서(keep) 탭을 고르면 keep 칸을 본다 — 월과 상관없다', () => {
  const W = loadCalc();
  const out = W.drawerModel(ITEMS_KEEP, ITEMS_MONTH, 'co_1', 'contract', 0);
  assert.equal(out.rows.length, 2);
  assert.ok(out.rows.every(r => r.month === 'keep'));
});

test('최근에 담은 것이 먼저 나온다', () => {
  const W = loadCalc();
  const out = W.drawerModel(ITEMS_KEEP, ITEMS_MONTH, 'co_1', 'attend', 0);
  const two = { x1: { companyId: 'co_1', kind: 'attend', month: '202608', filename: '먼저.jpg', filedAt: 10 },
    x2: { companyId: 'co_1', kind: 'attend', month: '202608', filename: '나중.jpg', filedAt: 99 } };
  assert.equal(W.drawerModel({}, two, 'co_1', 'attend', 0).rows[0].filename, '나중.jpg');
});

test('자료가 없으면 빈 목록을 준다 — 터지지 않는다', () => {
  // vm 안에서 만든 배열은 Array 프로토타입이 달라 deepStrictEqual 이 실패한다 — 길이로 견준다.
  const W = loadCalc();
  assert.equal(W.drawerModel(null, null, 'co_1', 'attend', 0).rows.length, 0);
  assert.equal(W.drawerModel({}, {}, 'co_1', 'attend', 0).rows.length, 0);
});

test('★ 3년 지난 것을 「지난 것」으로 가려낸다 — 지우지는 않는다', () => {
  const W = loadCalc();
  const old = { o1: { companyId: 'co_1', kind: 'attend', month: '202008', filename: '옛것.jpg', filedAt: 1 } };
  const out = W.drawerModel({}, old, 'co_1', 'attend', Date.now());
  assert.equal(out.rows.length, 1, '지난 것도 목록에 남아야 합니다 — 자동 삭제는 만들지 않는다');
  assert.equal(out.rows[0].expired, true);
});

test('★ 탭 장수는 keep 칸·이 달 칸을 합쳐서 센다', () => {
  const W = loadCalc();
  const counts = W.drawerCounts(ITEMS_KEEP, ITEMS_MONTH, 'co_1');
  assert.equal(counts.contract, 2, '근로계약서는 keep 칸에서 세야 합니다');
  assert.equal(counts.attend, 1);
  assert.equal(counts.ledger, 1);
  assert.equal(counts.output, 0);
});

test('탭 장수도 다른 사업장은 안 섞인다', () => {
  const W = loadCalc();
  const counts = W.drawerCounts(ITEMS_KEEP, ITEMS_MONTH, 'co_2');
  assert.equal(counts.contract, 1);
  assert.equal(counts.attend, 1);
});

test('★ 파일 이름으로 찾으면 좁혀진다', () => {
  const W = loadCalc();
  const rows = W.drawerModel(ITEMS_KEEP, ITEMS_MONTH, 'co_1', 'attend', 0).rows;
  assert.equal(W.searchRows(rows, '근태').length, 1);
  assert.equal(W.searchRows(rows, '없는말').length, 0);
  assert.equal(W.searchRows(rows, '').length, rows.length);
});

test('찾기는 대소문자를 가리지 않는다', () => {
  const W = loadCalc();
  const rows = [{ filename: 'Report.XLSX' }];
  assert.equal(W.searchRows(rows, 'report').length, 1);
});

/* ══════ 화면 배선 ══════ */
test('★ 서랍 화면에 틀고정 탭과 찾기 줄이 있다 — 사진첩과 같은 방식', () => {
  const m = html.match(/function screenDrawer[\s\S]*?\n\}/);
  assert.ok(m, 'screenDrawer 함수를 찾을 수 없습니다');
  assert.match(m[0], /id="tabsBar"/);
  assert.match(m[0], /id="findBar"/);
});

test('★ 서랍 화면에도 넘버링·ㅁ 체크가 있다', () => {
  const m = html.match(/function screenDrawer[\s\S]*?\n\}/);
  assert.match(m[0], /pickBar\('drawer'/);
  assert.match(m[0], /pkno/);
});

test('★ 자료를 누르면 확대 보기가 열린다', () => {
  const m = html.match(/function screenDrawer[\s\S]*?\n\}/);
  assert.match(m[0], /onclick="openViewer\(/);
});

test('★ 확대 보기는 파일 자리로 창고에 물어본다', () => {
  const m = html.match(/function openViewer[\s\S]*?\n\}/);
  assert.ok(m, 'openViewer 함수를 찾을 수 없습니다');
  assert.match(m[0], /S\.fileDownloadUrl/);
});

test('탭을 옮기면 대기 칸 처럼 사업장을 안 섞고 요청한다', () => {
  // ensureDrawerData 가 keep 칸은 한 번만, 달 칸은 달이 바뀔 때만 읽는다.
  const m = html.match(/function ensureDrawerData[\s\S]*?\n\}/);
  assert.ok(m, 'ensureDrawerData 함수를 찾을 수 없습니다');
  assert.match(m[0], /itemsMonthSlot/);
});
