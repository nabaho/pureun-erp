'use strict';
// 넘버링 + ㅁ 체크 — 실행: node --test tests/*.test.js
//   대표 지시(2026-08-10 명함첩, 2026-08-13 급여데이터함에도 적용) — "넘버링 넣고 ㅁ 로
//   체크해서 골라 처리할 수 있게 항상 해 달라." 명함첩(pu-cards.html)과 같은 설계다.
//   이 함에 목록이 늘어날 때도(대기 칸·서랍) 여기 못 박은 pick* 함수를 그대로 쓴다.
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

/* pick* 순수 함수만 뽑아 돌린다 — App·DOM 이 없어도 검사할 수 있다. */
function loadPick() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    cut('pickOn'), cut('pickToggle'), cut('pickSetAll'),
    cut('pickList'), cut('pickAllOn'), cut('pickPrune')
  ].join('\n'), { filename: 'pick.js' }).runInContext(sandbox);
  return sandbox;
}

test('처음 누르면 켜지고 다시 누르면 꺼진다', () => {
  const P = loadPick();
  let sel = P.pickToggle({}, 'a');
  assert.equal(P.pickOn(sel, 'a'), true);
  sel = P.pickToggle(sel, 'a');
  assert.equal(P.pickOn(sel, 'a'), false);
});

test('모두 고르기 — 걸러 놓은 것만 걸린다', () => {
  const P = loadPick();
  const sel = P.pickSetAll({}, ['a', 'b'], true);
  assert.equal(P.pickOn(sel, 'a'), true);
  assert.equal(P.pickOn(sel, 'b'), true);
  assert.equal(P.pickOn(sel, 'c'), false, '목록에 없는 것까지 켜지면 안 됩니다');
});

test('실제로 손댈 번호는 지금 목록에 있는 것만', () => {
  const P = loadPick();
  const sel = P.pickSetAll({}, ['a', 'b', 'c'], true);
  // 'c'가 지금 화면엔 없다고 치면(ids 에서 뺀다) 걸러진다.
  assert.deepEqual(P.pickList(sel, ['a', 'b']).sort(), ['a', 'b']);
});

test('★ 목록에서 사라진 번호는 buries — 개수가 틀어지지 않는다', () => {
  const P = loadPick();
  const sel = P.pickSetAll({}, ['a', 'b', 'c'], true);
  // 'c' 가 골라진 채로 화면이 다시 그려졌는데 이제 목록에 없다(기준 월을 바꿨다 등).
  const pruned = P.pickPrune(sel, ['a', 'b']);
  assert.equal(P.pickOn(pruned, 'c'), false, '사라진 번호가 안 버려집니다 — 개수가 틀립니다');
  assert.equal(Object.keys(pruned).length, 2);
});

test('보이는 것이 다 켜져야 「모두 고르기」가 켜진 것으로 본다', () => {
  const P = loadPick();
  assert.equal(P.pickAllOn(P.pickSetAll({}, ['a', 'b'], true), ['a', 'b']), true);
  assert.equal(P.pickAllOn(P.pickToggle(P.pickSetAll({}, ['a', 'b'], true), 'a'), ['a', 'b']), false);
  assert.equal(P.pickAllOn({}, []), false, '빈 목록은 「모두 고름」이 아니다');
});

/* ══════ 사업장 목록 화면 — 실제 렌더링 ══════ */
function loadScreen() {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = { month:"2026-08", pick:{}, companies:[], pending:{}, arrivals:{} };',
    cut('esc'), cut('thisMonth'),
    cut('pickOn'), cut('pickToggle'), cut('pickSetAll'), cut('pickList'),
    cut('pickAllOn'), cut('pickPrune'), cut('pickOf'), cut('pickPut'),
    cut('companyDocCount'), cut('sitesModel'), cut('pickBar'), cut('screenSites'),
    'window.App = App; window.screenSites = screenSites;'
  ].join('\n'), { filename: 'screen.js' }).runInContext(sandbox);
  return sandbox;
}

const COMPANIES = [{ id: 'co_1', name: '화담원' }, { id: 'co_2', name: '이비' }];
const ARRIVALS = { co_1: { 202608: { attend: { a: 1 }, last: 1 } } };

test('★ 업체마다 ㅁ 체크와 순번이 있다', () => {
  const sb = loadScreen();
  sb.window.App.companies = COMPANIES; sb.window.App.arrivals = ARRIVALS;
  const html2 = sb.window.screenSites.call(sb);
  assert.equal((html2.match(/type="checkbox"/g) || []).length >= 2, true, '체크박스가 업체 수만큼 없습니다');
  assert.match(html2, />1</, '첫 줄 순번이 없습니다');
  assert.match(html2, />2</, '둘째 줄 순번이 없습니다');
});

test('★ 업체명이 도착 표시보다 먼저 나온다 — 위치를 바꾼 것', () => {
  const sb = loadScreen();
  sb.window.App.companies = COMPANIES; sb.window.App.arrivals = ARRIVALS;
  const html2 = sb.window.screenSites.call(sb);
  const row = html2.slice(html2.indexOf('화담원') - 200, html2.indexOf('화담원') + 200);
  const nameAt = row.indexOf('화담원');
  const chipAt = row.indexOf('도착');
  assert.ok(nameAt >= 0 && chipAt >= 0, '업체명이나 도착 표시를 찾을 수 없습니다');
  assert.ok(nameAt < chipAt, '업체명이 도착 표시보다 뒤에 있습니다 — 위치가 안 바뀌었습니다');
});

test('★ 체크박스를 누르면 서랍으로 이동하지 않는다', () => {
  // 체크박스 줄에 event.stopPropagation() 이 있어야 한다 —
  // 없으면 체크만 하려다 서랍으로 넘어가 버린다.
  const sb = loadScreen();
  sb.window.App.companies = COMPANIES; sb.window.App.arrivals = ARRIVALS;
  const html2 = sb.window.screenSites.call(sb);
  assert.match(html2, /onclick="event\.stopPropagation\(\)"/);
});

test('「모두 고르기」줄이 업체 수를 보여준다', () => {
  const sb = loadScreen();
  sb.window.App.companies = COMPANIES; sb.window.App.arrivals = ARRIVALS;
  const html2 = sb.window.screenSites.call(sb);
  assert.match(html2, /모두 고르기 \(2\)/);
});

test('업체를 하나 고르면 골라진 개수가 화면에 보인다', () => {
  const sb = loadScreen();
  sb.window.App.companies = COMPANIES; sb.window.App.arrivals = ARRIVALS;
  sb.window.App.pick = { sites: { co_1: true } };
  const html2 = sb.window.screenSites.call(sb);
  assert.match(html2, /1개 골랐습니다/);
});

test('업체가 없으면 체크박스도 순번도 안 만든다', () => {
  const sb = loadScreen();
  sb.window.App.companies = []; sb.window.App.arrivals = {};
  const html2 = sb.window.screenSites.call(sb);
  assert.equal(/type="checkbox"/.test(html2), false);
});

/* ══════ 내 담당 업체 — 업체는 푸른이알피에서 당겨온다 ══════ */

test('★ 내 담당 업체 구역에 주담당 업체가 나온다', () => {
  const sb = loadScreen();
  sb.window.App.me = { email: 'p001@pureun.kr' };
  sb.window.App.companies = [
    { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
    { id: 'co_2', name: '이비', managerMain: 'p-002', managerSubs: [] }
  ];
  sb.window.App.arrivals = {};
  const html2 = sb.window.screenSites.call(sb);
  assert.match(html2, /내 담당 업체/);
  const before = html2.indexOf('내 담당 업체'), after = html2.indexOf('사업장 전체');
  const mineSection = html2.slice(before, after);
  assert.match(mineSection, /화담원/);
  assert.equal(/이비/.test(mineSection), false, '내 담당이 아닌 업체가 섞였습니다');
});

test('담당 업체가 없으면 빈 안내를 보여준다 — 구역 자체를 숨기지 않는다', () => {
  const sb = loadScreen();
  sb.window.App.me = { email: 'p099@pureun.kr' };
  sb.window.App.companies = [{ id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] }];
  sb.window.App.arrivals = {};
  const html2 = sb.window.screenSites.call(sb);
  assert.match(html2, /내 담당 업체/);
  assert.match(html2, /등록된 업체가 없습니다/);
});
