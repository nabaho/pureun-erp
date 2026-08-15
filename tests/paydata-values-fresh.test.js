'use strict';
/* 값은 「이 사업장 이 달」 것이다 — 화면이 들고 있는 값이 언제 남의 것이 되는가.
   실행: node --test tests/*.test.js

   App.values 는 「이 달 값 보기」에 들어갈 때만 채워진다. 업체를 바꿔 들어오거나
   기준 월을 바꾸거나 남의 자리로 옮기는 길에는 아무도 비우지 않았다 — 그래서
   앞 사업장 근로자 이름이 이 사업장 제목 밑에 그대로 떴고, 그 화면에서 엑셀로
   내려받으면 이 사업장 이름을 단 파일에 남의 이름이 담겼다. */
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

/* App.go 는 함수 선언이 아니라 App 객체의 method 라 cut() 으로 못 잘라 온다 —
   객체 하나로 다시 감싸 실제 코드 그대로 돌린다(글자 찾기가 아니라 실행이다). */
function cutGo() {
  /* ⚠ 저장소가 CRLF 다 — 줄 끝을 \n 하나로 못 박으면 아무것도 안 걸린다. */
  const m = html.match(/\n {2}go\(screen, o\) \{[\s\S]*?\n {2}\},/);
  assert.ok(m, 'App.go 를 찾을 수 없습니다');
  return m[0].replace(/,\s*$/, '');
}

function loadApp(appState, extra) {
  const calls = { ensured: [] };
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  sandbox.__calls = calls;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      screen: 'sites', companyId: 'co_1', companyName: '화담원', month: '2026-08',
      kind: 'attend', query: '', folderPick: 'all', values: {}, pick: {},
      viewingUid: '', viewingName: '', viewingDeputy: false
    }, appState)) + ';',
    'App.render = function(){ __calls.ensured.push("render"); };',
    'const __go = {' + cutGo() + '};',
    'App.go = __go.go;',
    'function ensureDrawerData(){ __calls.ensured.push("drawer"); }',
    'function ensureFolders(){ __calls.ensured.push("folders"); }',
    'function ensureTrash(){ __calls.ensured.push("trash"); }',
    'function ensureValues(){ __calls.ensured.push("values"); }',
    'function ensureDeputies(){} function loadDeputyScreen(){}',
    cut('esc'), cut('valueGridModel'), cut('screenValues'),
    cut('changeMonth'), cut('resetOwnerCaches'),
    'window.App = App; window.screenValues = screenValues;',
    'window.changeMonth = changeMonth; window.resetOwnerCaches = resetOwnerCaches;',
    (extra || []).join('\n')
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return { W: sandbox.window, calls };
}

const 화담원값 = {
  v1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1', at: 1,
        pairs: [{ item: '유급일수', value: '22일' }] }
};

/* ══════ 언제 버리는가 ══════ */

test('★ 다른 사업장으로 들어가면 앞 사업장 값을 버린다', () => {
  const { W } = loadApp({ companyId: 'co_1', values: 화담원값 });
  W.App.go('drawer', { companyId: 'co_2', companyName: '푸른상사', kind: 'attend', query: '' });
  assert.equal(W.App.values, null,
    '앞 사업장(화담원) 값이 그대로 남았습니다 — 이 사업장 제목 밑에 남의 근로자 이름이 뜹니다');
});

test('같은 사업장으로 다시 들어가면 굳이 버리지 않는다 — 다시 읽는 값이다', () => {
  const { W } = loadApp({ companyId: 'co_1', values: 화담원값 });
  W.App.go('drawer', { companyId: 'co_1', companyName: '화담원', kind: 'ledger', query: '' });
  assert.notEqual(W.App.values, null);
});

test('★ 기준 월을 바꾸면 값을 버린다 — 지난달 값이 이 달 것으로 남는다', () => {
  const { W } = loadApp({ month: '2026-08', values: 화담원값 });
  W.changeMonth('2026-07');
  assert.equal(W.App.values, null, '기준 월만 바꿔도 들고 있던 값은 지난달 것입니다');
  assert.equal(W.App.month, '2026-07');
});

test('★ 자리를 옮기면 값을 버린다 — 자리마다 값 칸이 따로다', () => {
  const { W } = loadApp({ values: 화담원값 });
  W.resetOwnerCaches();
  assert.equal(W.App.values, null,
    '방금 보던 자리의 근로자 이름이 새 자리 값 표에 그대로 남습니다');
});

/* ══════ 아직 안 읽었다 ≠ 값이 없다 ══════ */

test('★ 아직 안 읽었으면 표도 「없습니다」도 아닌 「불러오는 중」이다', () => {
  const { W } = loadApp({ values: null });
  const h = W.screenValues();
  assert.match(h, /불러오는 중/);
  assert.equal(/아직 정리된 값이 없습니다/.test(h), false,
    '안 읽은 것을 「값이 없습니다」로 단정하면 안 됩니다');
});

test('★ 불러오는 중에는 내려받기·복사 단추를 주지 않는다 — 앞 사업장 줄이 남의 이름으로 나간다', () => {
  const { W } = loadApp({ values: null });
  const h = W.screenValues();
  assert.equal(/valuesCsv\(\)/.test(h), false, '아직 읽지도 않은 값을 이 사업장 이름으로 내려받게 됩니다');
  assert.equal(/valuesCopy\(\)/.test(h), false);
});

test('읽었는데 비었으면 그때는 「값이 없습니다」다', () => {
  const { W } = loadApp({ values: {} });
  assert.match(W.screenValues(), /아직 정리된 값이 없습니다/);
});
