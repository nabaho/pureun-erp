'use strict';
/* 2중 대시보드 계산 — 실행: node --test tests/*.test.js
   대표 결정 2026-08-17: 목업 4안 + 2안(보기 칸 + 담당자 진행률) + 접기.
   설계서: docs/superpowers/specs/2026-08-17-급여데이터함-2중대시보드-design.md
   화면 그리기와 계산을 갈라 두고, 계산 함수는 HTML 에서 잘라 **실제로 돌린다**. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function load() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  function cut(name) {
    const m = HTML.match(new RegExp('function ' + name + '[\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수를 찾을 수 없습니다');
    return m[0];
  }
  new vm.Script('const S = window.PuPaydataStore; S.init({uid:"U1"});\n'
    + cut('companyDocCount') + '\n' + cut('coArrivedAt') + '\n'
    + cut('sideViewModel') + '\n' + cut('sideListModel')
    + '\nwindow.M = { sideViewModel: sideViewModel, sideListModel: sideListModel };',
    { filename: 'model.js' }).runInContext(sandbox);
  return sandbox.window.M;
}

const DAY = 86400000;
const NOW = 10 * DAY + 3600000;                 // 열흘째 오전 한 시
const TODAY0 = 10 * DAY;                        // 오늘 0시(목업 시계 기준)

/* 급여 업체 다섯 곳 — 나(p-001) 셋, 박노무(p-002) 하나, 담당 없음 하나 */
const COS = [
  { id: 'c1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
  { id: 'c2', name: '이비', managerMain: 'p-001', managerSubs: [] },
  { id: 'c3', name: '대한기공', managerMain: 'p-001', managerSubs: [] },
  { id: 'c4', name: '남광건설', managerMain: 'p-002', managerSubs: [] },
  { id: 'c5', name: '신흥기업', managerMain: '', managerSubs: [] }
];
const DIR = [{ sid: 'p-001', name: '김대표' }, { sid: 'p-002', name: '박노무' }];
const OWNERS = { U1: { name: '김대표', email: 'p001@pureun.kr' } };

/* 도착 칸 — c1 은 어제, c2 는 오늘. c3·c4·c5 는 아직 안 왔다 */
const ARR = {
  c1: { 202608: { attend: { a: NOW - 2 * DAY }, last: NOW - 2 * DAY } },
  c2: { 202608: { attend: { b: TODAY0 + 1000 }, ledger: { c: TODAY0 + 2000 }, last: TODAY0 + 2000 } }
};

function ctx(isAdmin) {
  return {
    companies: COS, dir: DIR, owners: OWNERS, arrivals: ARR, shares: {},
    myEmail: 'p001@pureun.kr', myUid: 'U1', month: '2026-08',
    now: NOW, todayStart: TODAY0, isAdmin: !!isAdmin
  };
}

/* ══════ 첫 칸 — 보기 목록 ══════ */

test('★ 담당자에게는 「내 일」 보기만 나온다', () => {
  const M = load();
  const v = M.sideViewModel(ctx(false));
  assert.equal(v.views.map(x => x.key).join(','), 'mine,late,today,shared');
  assert.equal(v.people.length, 0, '담당자에게는 남의 명단을 세우지 않는다');
});

test('★ 관리자에게만 전체 보기와 담당자 명단이 붙는다', () => {
  const M = load();
  const v = M.sideViewModel(ctx(true));
  assert.equal(v.views.map(x => x.key).join(','), 'mine,late,today,shared,all,alllate,noman');
  assert.equal(v.people.length, 2);
});

test('★ 「내 담당」은 내 업체 수, 「아직 안 온 곳」은 그중 0장인 곳', () => {
  const M = load();
  const by = {}; M.sideViewModel(ctx(false)).views.forEach(x => { by[x.key] = x; });
  assert.equal(by.mine.n, 3);        // c1 c2 c3
  assert.equal(by.late.n, 1);        // c3 만 아직
});

test('★ 「오늘 들어온 것」은 오늘 0시 뒤에 온 것만 센다', () => {
  const M = load();
  const by = {}; M.sideViewModel(ctx(false)).views.forEach(x => { by[x.key] = x; });
  // c1 은 어제 왔다 — 오늘 칸에 들면 어제 처리한 것을 또 붙든다
  assert.equal(by.today.n, 1);
});

test('★ 관리자 전체 수는 담당 없는 업체까지 센다', () => {
  const M = load();
  const by = {}; M.sideViewModel(ctx(true)).views.forEach(x => { by[x.key] = x; });
  assert.equal(by.all.n, 5);
  assert.equal(by.alllate.n, 3);     // c3 c4 c5
  assert.equal(by.noman.n, 1);       // c5
});

/* ══════ 첫 칸 — 담당자 진행률(안 2) ══════ */

test('★ 담당자마다 도착/전체와 남은 수가 나온다', () => {
  const M = load();
  const by = {}; M.sideViewModel(ctx(true)).people.forEach(p => { by[p.name] = p; });
  assert.equal(by['김대표'].total, 3);
  assert.equal(by['김대표'].done, 2);        // c1 c2
  assert.equal(by['김대표'].left, 1);
  assert.equal(by['박노무'].done, 0);
  assert.equal(by['박노무'].left, 1);
});

test('★ 진행률은 0~100 사이 정수다 (막대 너비로 바로 쓴다)', () => {
  const M = load();
  const by = {}; M.sideViewModel(ctx(true)).people.forEach(p => { by[p.name] = p; });
  assert.equal(by['김대표'].pct, 67);
  assert.equal(by['박노무'].pct, 0);
});

test('담당 업체가 0곳이어도 나누기로 터지지 않는다', () => {
  const M = load();
  const c = ctx(true);
  c.companies = [{ id: 'c9', name: '가', managerMain: 'p-003', managerSubs: [] }];
  c.dir = [{ sid: 'p-003', name: '최주임' }];
  const p = M.sideViewModel(c).people[0];
  assert.equal(p.pct, 0);
});

test('★ 급여데이터함에 안 들어온 담당자는 away 로 표시된다', () => {
  const M = load();
  const by = {}; M.sideViewModel(ctx(true)).people.forEach(p => { by[p.name] = p; });
  assert.equal(by['박노무'].away, true);
  assert.equal(by['김대표'].away, false);
});

/* ══════ 둘째 칸 — 사업장 목록 ══════ */

test('★ 「내 담당」 목록은 내 업체만, 자료 온 곳이 먼저다', () => {
  const M = load();
  const out = M.sideListModel('mine', ctx(false), { q: '', filter: 'all', order: [] });
  assert.equal(out.rows.length, 3);
  assert.equal(out.rows[0].arrived, true);
  assert.equal(out.rows[2].arrived, false);   // 아직 안 온 c3 이 끝
});

test('★ 내가 정해 둔 순서가 「내 담당」에서는 이긴다', () => {
  const M = load();
  // 순서를 바꿔 놓았으면 도착 여부보다 사람이 정한 순서가 먼저다 — 안 그러면
  // 애써 끌어 놓은 자리가 자료 하나 들어올 때마다 흐트러진다
  const out = M.sideListModel('mine', ctx(false), { q: '', filter: 'all', order: ['c3', 'c1', 'c2'] });
  assert.equal(out.rows.map(r => r.id).join(','), 'c3,c1,c2');
  assert.equal(out.canOrder, true);
});

test('★ 남의 목록·전체 목록에서는 순서를 못 바꾼다', () => {
  const M = load();
  const out = M.sideListModel('all', ctx(true), { q: '', filter: 'all', order: [] });
  assert.equal(out.canOrder, false);
  assert.equal(out.showOwner, true, '전체 목록에는 담당자 이름이 붙어야 누구 것인지 안다');
});

test('★ 「아직 안 온 곳」 보기는 미도착만 담는다', () => {
  const M = load();
  const out = M.sideListModel('late', ctx(false), { q: '', filter: 'all', order: [] });
  assert.equal(out.rows.map(r => r.id).join(','), 'c3');
});

test('★ 「담당 없음」 보기는 주·부담당이 비어 있는 급여 업체만 담는다', () => {
  const M = load();
  const out = M.sideListModel('noman', ctx(true), { q: '', filter: 'all', order: [] });
  assert.equal(out.rows.map(r => r.name).join(','), '신흥기업');
});

test('★ 상태 칩이 목록을 거른다', () => {
  const M = load();
  const c = ctx(true);
  assert.equal(M.sideListModel('all', c, { q: '', filter: 'no', order: [] }).rows.length, 3);
  assert.equal(M.sideListModel('all', c, { q: '', filter: 'yes', order: [] }).rows.length, 2);
});

test('★ 사업장 이름으로 찾는다', () => {
  const M = load();
  const out = M.sideListModel('all', ctx(true), { q: '화담', filter: 'all', order: [] });
  assert.equal(out.rows.map(r => r.name).join(','), '화담원');
});

test('★ 전체 목록에서는 담당자 이름으로도 찾힌다 (대표 결정: 사람·업체 둘 다)', () => {
  const M = load();
  const out = M.sideListModel('all', ctx(true), { q: '박노무', filter: 'all', order: [] });
  assert.equal(out.rows.map(r => r.name).join(','), '남광건설');
});

test('찾는 글자의 앞뒤 빈칸과 대소문자는 무시한다', () => {
  const M = load();
  const out = M.sideListModel('all', ctx(true), { q: '  화담  ', filter: 'all', order: [] });
  assert.equal(out.rows.length, 1);
});

test('★ 한 담당자의 목록을 볼 수 있다 (관리자가 사람 줄을 눌렀을 때)', () => {
  const M = load();
  const out = M.sideListModel('p:p-002', ctx(true), { q: '', filter: 'all', order: [] });
  assert.equal(out.rows.map(r => r.name).join(','), '남광건설');
  assert.equal(out.title.indexOf('박노무') >= 0, true);
});

test('★ 공유받음은 최근 받은 것이 위로 온다', () => {
  const M = load();
  const c = ctx(false);
  c.shares = {
    s1: { companyId: 'c1', companyName: '화담원', byName: '민미애', tags: ['확인 부탁드립니다'], at: 100 },
    s2: { companyId: 'c4', companyName: '남광건설', byName: '박노무', tags: ['급여 반영 요청'], at: 900 }
  };
  const out = M.sideListModel('shared', c, { q: '', filter: 'all', order: [] });
  assert.equal(out.isShared, true);
  assert.equal(out.rows.map(r => r.name).join(','), '남광건설,화담원');
  assert.equal(out.rows[0].shareId, 's2', '열쇠(공유 번호)가 있어야 눌러서 연다');
  assert.equal(out.rows[0].tags.join(','), '급여 반영 요청');
});

test('공유받은 것이 없으면 빈 목록이다', () => {
  const M = load();
  assert.equal(M.sideListModel('shared', ctx(false), { q: '', filter: 'all', order: [] }).rows.length, 0);
});

test('★ 담당자가 남의 목록을 억지로 열어도 자기 것만 나온다', () => {
  const M = load();
  // 관리자가 아닌 사람에게 전체·남의 보기를 주지 않는다. 화면에 단추가 없어도
  // 주소·상태가 남아 있을 수 있으니 계산 층에서 한 번 더 막는다.
  const out = M.sideListModel('all', ctx(false), { q: '', filter: 'all', order: [] });
  assert.equal(out.rows.length, 3);
  assert.equal(out.view, 'mine');
});

test('자료가 없어도 터지지 않는다', () => {
  const M = load();
  const c = { companies: null, dir: null, owners: null, arrivals: null, shares: null,
    myEmail: '', myUid: '', month: '2026-08', now: NOW, todayStart: TODAY0, isAdmin: true };
  assert.equal(M.sideListModel('all', c, { q: '', filter: 'all', order: [] }).rows.length, 0);
  assert.equal(M.sideViewModel(c).people.length, 0);
});

/* ══════ 배선 ══════ */

test('★ 화면에 두 칸이 다 있다', () => {
  assert.match(HTML, /id="viewbar"/, '첫 칸(보기·담당자)이 없다');
  assert.match(HTML, /id="colist"/, '둘째 칸(사업장 목록)이 없다');
});

test('★ 둘째 칸 찾기 칸에 id 가 붙어 있다 (커서 지키기)', () => {
  /* focusSnapshot 은 **id 가 있는 칸만** 되찾는다. id 를 안 붙이면 한 글자 치고
     커서가 빠진다 — 이미 네 곳에서 겪은 일이다. */
  assert.match(HTML, /id="colFind"/, '찾기 칸에 id 가 없으면 커서를 못 지킨다');
});

test('★ 담당자 명단을 업체관리에서 뽑아 온다', () => {
  assert.match(HTML, /S\.listUserDir\(/, '공개 명부를 안 읽으면 이름이 사번으로 뜬다');
  assert.match(HTML, /S\.managerRoster\(/, 'owners(로그인한 사람)에서 뽑으면 대부분이 안 보인다');
});
