'use strict';
/* 담당자 명단을 업체관리에서 뽑는다 — 실행: node --test tests/*.test.js
   2026-08-17 대표: "각 담당자를 대시보드에 넣고 사업장도 우선 배정해달라".
   지금은 paydata/owners(한 번이라도 로그인한 사람)에서 뽑아 대부분이 안 보인다.
   급여 업체의 주·부담당(사번)을 모아 세우고, 공개 명부에서 이름을 찾는다.
   설계서: docs/superpowers/specs/2026-08-17-급여데이터함-2중대시보드-design.md §3 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function loadStore() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

/* 업체관리가 쓰는 칸 그대로 — 사번은 p-001 꼴, 이메일은 p001@pureun.kr */
const COS = [
  { id: 'c1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
  { id: 'c2', name: '이비', managerMain: 'p-001', managerSubs: ['p-002'] },
  { id: 'c3', name: '남광건설', managerMain: 'p-002', managerSubs: [] },
  { id: 'c4', name: '신흥기업', managerMain: '', managerSubs: [] }        // 담당 없음
];
const DIR = [
  { sid: 'p-001', name: '김대표' },
  { sid: 'p-002', name: '박노무' }
];
/* paydata/owners — 한 번이라도 급여데이터함에 들어온 사람만 있다 */
const OWNERS = { U1: { name: '김대표', email: 'p001@pureun.kr', lastAt: 1 } };

test('★ 로그인한 적 없는 담당자도 명단에 선다', () => {
  const S = loadStore();
  const r = S.managerRoster(COS, DIR, OWNERS);
  // 박노무는 급여데이터함에 들어온 적이 없다 — 그래도 나와야 한다
  assert.equal(r.people.map(p => p.name).sort().join(','), '김대표,박노무');
});

test('★ 주담당·부담당 모두 그 사람 업체로 센다', () => {
  const S = loadStore();
  const r = S.managerRoster(COS, DIR, OWNERS);
  const by = {}; r.people.forEach(p => { by[p.name] = p; });
  assert.equal(by['김대표'].companies.map(c => c.id).join(','), 'c1,c2');
  assert.equal(by['박노무'].companies.map(c => c.id).join(','), 'c2,c3');   // c2 는 부담당
});

test('★ 들어온 적 있는 사람에게는 uid 가 붙고, 없는 사람은 away 다', () => {
  const S = loadStore();
  const r = S.managerRoster(COS, DIR, OWNERS);
  const by = {}; r.people.forEach(p => { by[p.name] = p; });
  assert.equal(by['김대표'].uid, 'U1');
  assert.equal(by['김대표'].away, false);
  assert.equal(by['박노무'].uid, '');       // 자리를 열 수 없다
  assert.equal(by['박노무'].away, true);
});

test('★ 담당자가 없는 업체는 따로 모은다', () => {
  const S = loadStore();
  const r = S.managerRoster(COS, DIR, OWNERS);
  assert.equal(r.unassigned.map(c => c.name).join(','), '신흥기업');
});

test('★ 공개 명부를 못 읽어도 담당자가 사라지지 않는다', () => {
  const S = loadStore();
  // 명부 하나 못 읽었다고 담당자가 통째로 없어지면, 업체까지 같이 사라진다.
  // 급여데이터함에 들어온 적 있는 사람은 그쪽에 적힌 이름을, 나머지는 사번으로라도 세운다.
  const r = S.managerRoster(COS, null, OWNERS);
  const got = r.people.map(p => p.name).sort();
  assert.equal(r.people.length, 2);
  assert.ok(got.indexOf('김대표') >= 0, '들어온 적 있는 사람은 그 이름을 쓴다');
  assert.ok(got.indexOf('p-002') >= 0, '이름을 못 찾으면 사번으로라도 선다');
});

test('명부가 객체 꼴이어도 읽는다', () => {
  const S = loadStore();
  // data/user_dir 는 배열일 때도 {키:값} 일 때도 있다(readRoster 가 둘 다 받는다)
  const r = S.managerRoster(COS, { a: DIR[0], b: DIR[1] }, OWNERS);
  assert.equal(r.people.map(p => p.name).sort().join(','), '김대표,박노무');
});

test('사번이 같은 사람을 두 번 세우지 않는다', () => {
  const S = loadStore();
  const cos = [
    { id: 'c1', name: '가', managerMain: 'p-001', managerSubs: ['p-001'] },
    { id: 'c2', name: '나', managerMain: 'p-001', managerSubs: [] }
  ];
  const r = S.managerRoster(cos, DIR, OWNERS);
  assert.equal(r.people.length, 1);
  assert.equal(r.people[0].companies.length, 2);   // 한 업체가 두 번 들어가도 안 된다
});

test('이름 가나다순으로 세운다', () => {
  const S = loadStore();
  const cos = [
    { id: 'c1', name: '가', managerMain: 'p-002', managerSubs: [] },
    { id: 'c2', name: '나', managerMain: 'p-001', managerSubs: [] }
  ];
  const r = S.managerRoster(cos, DIR, OWNERS);
  assert.equal(r.people.map(p => p.name).join(','), '김대표,박노무');
});

test('자료가 없어도 터지지 않는다', () => {
  const S = loadStore();
  const r = S.managerRoster(null, null, null);
  assert.equal(r.people.length, 0);
  assert.equal(r.unassigned.length, 0);
});

/* ══════ 담당자 칸에 사번이 아닌 값 (대표 지시 2026-08-17) ══════
   업체관리 주담당에 「김보람(박은비)」 가 글자로 적힌 업체가 13곳 있었다.
   사번이 아니면 이메일을 만들 수 없어 어느 계정과도 이어지지 못하는데, 화면에는
   그냥 「아직 안 들어옴」으로 보였다 — 아무리 기다려도 안 풀리는 것을 기다리게 된다. */
test('★ 사번이 아닌 담당자를 「안 들어옴」과 갈라 표시한다', () => {
  const S = loadStore();
  const r = S.managerRoster([
    { id: 'co_1', name: '가나', managerMain: 'A-001', managerSubs: [] },
    { id: 'co_2', name: '다라', managerMain: '김보람(박은비)', managerSubs: [] }
  ], null, {});
  const byName = {};
  r.people.forEach(p => { byName[p.sid] = p; });
  assert.equal(byName['A-001'].badSid, false, '멀쩡한 사번을 잘못됐다고 하면 안 됩니다');
  assert.equal(byName['김보람(박은비)'].badSid, true, '★ 사번이 아닌 것을 못 짚었습니다');
});

test('사번 꼴 몇 가지를 다 받아 준다 — 멀쩡한 것을 빨갛게 칠하면 안 된다', () => {
  const S = loadStore();
  const cos = ['A-001', 'P-002', 'T-005', 'a001', 'A001'].map((sid, i) =>
    ({ id: 'c' + i, name: '가' + i, managerMain: sid, managerSubs: [] }));
  const r = S.managerRoster(cos, null, {});
  r.people.forEach(p => assert.equal(p.badSid, false, p.sid + ' 를 잘못됐다고 봤습니다'));
});

test('사번이 잘못돼도 그 업체가 목록에서 사라지지는 않는다', () => {
  const S = loadStore();
  const r = S.managerRoster([
    { id: 'co_2', name: '다라', managerMain: '김보람(박은비)', managerSubs: [] }
  ], null, {});
  const p = r.people[0];
  assert.equal(p.companies.length, 1, '담당자 칸이 잘못됐다고 업체까지 숨기면 안 됩니다');
  assert.equal(r.unassigned.length, 0, '담당이 적혀는 있으니 「담당 없음」이 아닙니다');
});
