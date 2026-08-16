'use strict';
/* 홈페이지 대조와 딱지 판정.
   딱지를 잘못 달면 멀쩡한 것을 고치거나, 틀린 것을 그냥 두게 된다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
function load() {
  const ctx = { window: undefined, globalThis: {} };
  vm.createContext(ctx);
  ['pu-home-parse.js', 'pu-home-diff.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(R, 'js', f), 'utf8'), ctx);
  });
  return ctx.globalThis;
}
const G = load();
const D = G.PuHomeDiff;
const TODAY = '2026-08-16';

// vm 상자에서 나온 배열·객체는 다른 렐름 소속이라 deepEqual 로 못 견준다.
// JSON 으로 한 번 옮겨 이 렐름의 순수 객체로 바꾼 뒤 견준다.
function plain(v) { return JSON.parse(JSON.stringify(v)); }

const 재직 = { name: '권형하', isNomusa: true, joinedAt: '2020-01-01', leftAt: '' };

test('내용이 같으면 같음', () => {
  const ours = [{ key: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  const live = [{ srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  const r = D.memberStatus(ours, live, [재직], TODAY);
  assert.equal(r[0].status, 'same');
});

test('겹공백만 다른 것은 같음으로 본다', () => {
  const ours = [{ key: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現  가'] }];
  const live = [{ srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  assert.equal(D.memberStatus(ours, live, [재직], TODAY)[0].status, 'same');
});

test('우리가 고쳤는데 홈페이지가 그대로면 안 올라감', () => {
  const ours = [{ key: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가', '現 나'] }];
  const live = [{ srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  assert.equal(D.memberStatus(ours, live, [재직], TODAY)[0].status, 'pending');
});

test('홈페이지에 없는 사람은 새로 올릴 것', () => {
  const ours = [{ key: 'new1', name: '새노무사', position1: '', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '새노무사', isNomusa: true, joinedAt: '2026-08-01', leftAt: '' }];
  assert.equal(D.memberStatus(ours, [], staff, TODAY)[0].status, 'toAdd');
});

test('퇴사한 사람이 홈페이지에 남아 있으면 내릴 것', () => {
  const ours = [{ key: '999', name: '퇴사자', position1: '', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '999', name: '퇴사자', position1: '', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '퇴사자', isNomusa: true, joinedAt: '2020-01-01', leftAt: '2026-07-31' }];
  const r = D.memberStatus(ours, live, staff, TODAY);
  assert.equal(r[0].status, 'toRemove');
});

test('퇴사일이 아직 안 지났으면 내릴 것이 아니다', () => {
  const ours = [{ key: '999', name: '예정자', position1: '', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '999', name: '예정자', position1: '', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '예정자', isNomusa: true, joinedAt: '2020-01-01', leftAt: '2026-12-31' }];
  assert.notEqual(D.memberStatus(ours, live, staff, TODAY)[0].status, 'toRemove');
});

test('우리 자료에 없는데 홈페이지에만 있으면 홈페이지에만', () => {
  const live = [{ srl: '777', name: '모르는사람', position1: '', position2: '', careers: [] }];
  const r = D.memberStatus([], live, [], TODAY);
  assert.equal(r[0].status, 'liveOnly');
});

test('직원 명부를 못 읽어도 나머지 대조는 돌아간다', () => {
  const ours = [{ key: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  const live = [{ srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  assert.equal(D.memberStatus(ours, live, null, TODAY)[0].status, 'same');
});

test('읽어낸 구성원이 0명이면 믿지 않는다 — 사람이 사라진 게 아니라 구조가 바뀐 것이다', () => {
  assert.equal(D.isTrustworthy([]), false);
  assert.equal(D.isTrustworthy(null), false);
});

test('한 명이라도 읽혔으면 믿는다', () => {
  assert.equal(D.isTrustworthy([{ srl: '190', name: '권형하' }]), true);
});

test('쪽 본문이 같으면 같음', () => {
  const ours = { work1: { text: '자문서비스 법률자문' } };
  const live = { work1: '자문서비스  법률자문' };
  assert.deepEqual(plain(D.pageStatus(ours, live)), [{ path: 'work1', status: 'same' }]);
});

test('쪽 본문이 다르면 안 올라감', () => {
  const ours = { work1: { text: '자문서비스 법률자문 추가' } };
  const live = { work1: '자문서비스 법률자문' };
  assert.deepEqual(plain(D.pageStatus(ours, live)), [{ path: 'work1', status: 'pending' }]);
});

test('홈페이지를 못 읽은 쪽은 모름으로 둔다 — 안 올라감으로 잘못 몰지 않는다', () => {
  const ours = { work1: { text: '가' } };
  assert.deepEqual(plain(D.pageStatus(ours, {})), [{ path: 'work1', status: 'unknown' }]);
});

test('퇴사자 이름이 다른 쪽에 남아 있으면 찾아낸다', () => {
  const pages = [
    { path: 'greeting', text: '인사말입니다 대표 공인노무사 권형하' },
    { path: 'work4', text: '산재보상 안내' }
  ];
  assert.deepEqual(plain(D.nameLeftovers('권형하', pages)), [{ path: 'greeting', count: 1 }]);
});

test('이름이 없으면 조용하다', () => {
  assert.deepEqual(plain(D.nameLeftovers('없는사람', [{ path: 'greeting', text: '가나다' }])), []);
});
