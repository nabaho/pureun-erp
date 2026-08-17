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
/* ⚠ 본문 목록은 이제 **왼쪽에서 고른 보기**를 따른다(2026-08-17 대표 지적
   「분리된 느낌」). 그래서 시험도 보기를 정해 줘야 한다 — 기본은 「내 담당」이고,
   전체를 보려면 sideView:'all' + 관리자여야 한다(계산 층이 막는다). */
function loadScreen(opts) {
  opts = opts || {};
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1", name:"권형하"'
      + (opts.isAdmin === false ? '' : ', isAdmin: true') + '});',
    'const App = ' + JSON.stringify(Object.assign({
      month: '2026-08', pick: {}, companies: [], pending: {}, arrivals: {},
      me: { uid: 'U1', email: 'p001@pureun.kr' }, owners: {}, shares: {}, myOrder: [], dir: null,
      sideView: 'all', colFilter: 'all', colQuery: ''
    }, opts.app || {})) + ';',
    cut('esc'), cut('bannerHtml'), cut('jsq'), cut('thisMonth'), cut('coArrivedAt'),
    cut('pickOn'), cut('pickToggle'), cut('pickSetAll'), cut('pickList'),
    cut('pickAllOn'), cut('pickPrune'), cut('pickOf'), cut('pickPut'),
    cut('companyDocCount'), cut('sitesModel'), cut('sideCtx'), cut('guessTag'), cut('siteState'), cut('sideListModel'),
    cut('monthShift'), cut('monthCount'), cut('monthAhead'), "const WEEKDAY = ['일','월','화','수','목','금','토'];", cut('todayLabel'), cut('monthStripHtml'),
    cut('pickBar'), cut('mailBarHtml'), cut('screenSites'),
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
  const row = html2.slice(html2.indexOf('화담원') - 200, html2.indexOf('화담원') + 400);
  const nameAt = row.indexOf('화담원');
  /* 「도착/미도착」 둘이던 표시가 네 자리(미도착·대기·담김·표)로 갈렸다
     (대표 지시 2026-08-17) — 글자를 못 박지 않고 **그 자리 표시**를 찾는다. */
  const chipAt = row.indexOf('class="stpill');
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

/* 예전에는 본문 맨 위에 「내 담당 업체」 요약 구역이 따로 있고 그 아래에 전체
   목록이 또 있었다. 이제 본문 목록이 **왼쪽에서 고른 보기**를 그대로 따르므로,
   「내 담당」을 고르면 목록 자체가 내 담당이다 — 요약 구역은 중복이라 없앴다. */
test('★ 「내 담당」 보기에서는 목록이 곧 내 담당이다 — 남의 업체가 안 섞인다', () => {
  const sb = loadScreen({ app: { sideView: 'mine' } });
  sb.window.App.companies = [
    { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
    { id: 'co_2', name: '이비', managerMain: 'p-002', managerSubs: [] }
  ];
  sb.window.App.arrivals = {};
  const html2 = sb.window.screenSites.call(sb);
  assert.match(html2, /내 담당 사업장/, '무엇을 보고 있는지 제목이 말해 줘야 합니다');
  assert.match(html2, /화담원/);
  assert.equal(/이비/.test(html2), false, '내 담당이 아닌 업체가 섞였습니다');
});

/* 대표 지적 2026-08-17 「오른쪽 대시보드 사업장 이름과 본문 사업장 이름이
   일치해야 할 것 같다 · 분리된 느낌이다」 — 왼쪽 칸이 「김보람 담당 28곳」인데
   본문은 「전체 112곳」이라 이름도 번호도 달랐다. */
test('★ 본문 목록이 왼쪽에서 고른 보기를 그대로 따른다', () => {
  const cos = [
    { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
    { id: 'co_2', name: '이비', managerMain: 'p-002', managerSubs: [] }
  ];
  const all = loadScreen({ app: { sideView: 'all', companies: cos } });
  const hAll = all.window.screenSites.call(all);
  assert.match(hAll, /화담원/);
  assert.match(hAll, /이비/, '전체 보기인데 남의 업체가 빠졌습니다');

  const mine = loadScreen({ app: { sideView: 'mine', companies: cos } });
  const hMine = mine.window.screenSites.call(mine);
  assert.equal(/이비/.test(hMine), false, '보기를 바꿨는데 본문이 안 따라옵니다');
});

test('★ 왼쪽 칸에서 걸러 둔 것이 본문에도 걸린다 — 두 목록이 같아야 한다', () => {
  const sb = loadScreen({ app: { sideView: 'all', colQuery: '화담',
    companies: [
      { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
      { id: 'co_2', name: '이비', managerMain: 'p-002', managerSubs: [] }
    ] } });
  const h = sb.window.screenSites.call(sb);
  assert.match(h, /화담원/);
  assert.equal(/이비/.test(h), false, '왼쪽에서 찾아 걸렀는데 본문에는 다 나옵니다');
});

/* 같은 사업장이 왼쪽에서는 안 열리고 본문에서는 열리던 어긋남 — 본문이 곧장
   내 자리 서랍을 열어, 남의 담당 업체를 「0건」으로 보여 주었다. */
test('★ 본문에서도 왼쪽과 같은 길로 연다 — 내 자리 서랍을 몰래 열지 않는다', () => {
  const sb = loadScreen({ app: { sideView: 'all',
    companies: [{ id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] }] } });
  const h = sb.window.screenSites.call(sb);
  assert.match(h, /openColCompany\(/, '왼쪽과 다른 길로 열면 같은 사업장이 다르게 동작합니다');
});

/* 빈 것을 감추지 않는 것은 이 함의 원칙이다 — 숨기면 고장으로 보인다.
   다만 그 안내가 **큰 빈 칸**으로 화면 맨 위를 차지하면, 담당이 없는 사람에게는
   늘 그 상태라 자리만 먹는다(대표 지적 2026-08-17). 말은 그대로 하되 한 줄로 줄인다. */
/* 빈 것을 감추지 않는 것은 이 함의 원칙이다 — 숨기면 고장으로 보인다.
   다만 「왜 비었는가」를 갈라 말해야 한다. 명단을 못 읽은 것과, 내 담당이
   없는 것과, 찾다 못 찾은 것은 서로 다른 일이고 할 일도 다르다. */
test('담당 업체가 없으면 그렇다고 말하고, 어떻게 하면 채워지는지도 적는다', () => {
  const sb = loadScreen({ app: { sideView: 'mine', me: { uid: 'U1', email: 'p099@pureun.kr' },
    companies: [{ id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] }] } });
  const h = sb.window.screenSites.call(sb);
  assert.match(h, /내 담당 업체가 없습니다/, '없다는 것을 말해 줘야 고장으로 안 보입니다');
  assert.match(h, /업체관리에 주담당·부담당으로 등록하면/, '어떻게 해야 채워지는지도 적어야 합니다');
});

test('명단을 못 읽은 것과 「이 보기에 없는 것」을 갈라 말한다', () => {
  const none = loadScreen({ app: { sideView: 'mine', companies: [] } });
  assert.match(none.window.screenSites.call(none), /업체관리 명단을 읽지 못했습니다/);

  const nofind = loadScreen({ app: { sideView: 'all', colQuery: '없는이름',
    companies: [{ id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] }] } });
  assert.match(nofind.window.screenSites.call(nofind), /찾는 사업장이 없습니다/);
});

/* 대표 지적 2026-08-17 — 첫 화면에서 하려는 일은 「무슨 일이 있나 보기」인데
   그 자리에 이름만 112줄 있어 아무것도 안 보였다(목업 E안). */
test('★ 첫 화면 맨 위에 이 달 현황이 뜬다 — 몇 곳 중 몇 곳이 왔나', () => {
  const sb = loadScreen();
  sb.window.App.companies = [
    { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
    { id: 'co_2', name: '이비', managerMain: 'p-002', managerSubs: [] },
    { id: 'co_3', name: '보문사', managerMain: 'p-002', managerSubs: [] }
  ];
  sb.window.App.arrivals = { co_1: { 202608: { attend: { a: 1 }, last: 1 } } };
  const h = sb.window.screenSites.call(sb);
  /* 상자 셋이던 것을 한 줄 숫자로 접었다(대표 지시 2026-08-17 「KPI와 대시보드
     1줄로 정리」). 그래서 **생김새를 못 박지 않고** 「목록보다 먼저, 세 숫자가
     맞게」만 본다 — 몇 곳·온 곳·안 온 곳. */
  /* 현황이 이제 제목 **뒤**에 붙었다 — 제목 앞까지 잘라 보면 당연히 안 잡힌다. */
  const kpi = (h.match(/class="dkpi"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
  assert.ok(kpi, '현황이 없으면 112줄만 남습니다');
  /* 「온/안 온」 둘이던 것을 네 자리로 갈랐다(대표 지시 2026-08-17) —
     표까지 됨 · 담겼지만 판독 전 · 대기 칸에 걸림 · 아무것도 안 옴. */
  assert.equal(kpi.replace(/<[^>]*>/g, ''), '3곳 · 표 0 · 담김 1 · 대기 0 · 안 온 2',
    '현황을 잘못 셉니다: ' + kpi);
});

/* 왼쪽 칸과 **같은 수**를 세야 한다 — 두 곳이 다른 말을 하면 어느 쪽도 못 믿는다. */
test('★ 현황의 사업장 수가 아래 목록 줄 수와 같다', () => {
  const sb = loadScreen({ app: { sideView: 'all', companies: [
    { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
    { id: 'co_2', name: '이비', managerMain: 'p-002', managerSubs: [] }
  ] } });
  const h = sb.window.screenSites.call(sb);
  assert.match(h, /class="dkpi"[^>]*><b>2<\/b>곳/);
  assert.equal((h.match(/type="checkbox"/g) || []).length, 3, '「모두 고르기」 + 두 줄이어야 합니다');
});

/* 보기를 좁히면 현황도 그 보기 기준이어야 한다 — 김보람을 골랐는데 「112곳」이
   그대로 떠 있으면 무엇의 현황인지 알 수 없다. */
test('★ 보기를 좁히면 현황도 그 보기 기준으로 센다', () => {
  const sb = loadScreen({ app: { sideView: 'mine', companies: [
    { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
    { id: 'co_2', name: '이비', managerMain: 'p-002', managerSubs: [] }
  ] } });
  const h = sb.window.screenSites.call(sb);
  assert.match(h, /class="dkpi"[^>]*><b>1<\/b>곳/, '내 담당은 한 곳인데 전체 수를 셌습니다');
});
