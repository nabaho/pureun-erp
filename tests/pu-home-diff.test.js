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

/* --- 검토 지적 3건: 동명이인 오판 / 홈페이지 글번호 중복 / 한 글자 이름 오탐 --- */

test('동명이인이면(퇴사자·재직자 각 1명) 재직자를 퇴사자로 몰지 않는다 — toRemove 안 뜨고 reason 에 동명이인 표시', () => {
  const ours = [{ key: '500', name: '김노무', position1: '', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '500', name: '김노무', position1: '', position2: '공인노무사', careers: [] }];
  const staff = [
    { name: '김노무', isNomusa: true, joinedAt: '2010-01-01', leftAt: '2026-07-01' }, // 퇴사자 — 배열에서 먼저 옴
    { name: '김노무', isNomusa: true, joinedAt: '2024-01-01', leftAt: '' } // 재직자
  ];
  const r = D.memberStatus(ours, live, staff, TODAY);
  assert.notEqual(r[0].status, 'toRemove');
  assert.match(r[0].reason, /동명이인/);
});

test('동명이인이 배열에서 어느 순서로 오든 결과가 같다', () => {
  const ours = [{ key: '500', name: '김노무', position1: '', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '500', name: '김노무', position1: '', position2: '공인노무사', careers: [] }];
  const 퇴사자 = { name: '김노무', isNomusa: true, joinedAt: '2010-01-01', leftAt: '2026-07-01' };
  const 재직자2 = { name: '김노무', isNomusa: true, joinedAt: '2024-01-01', leftAt: '' };
  const rA = D.memberStatus(ours, live, [퇴사자, 재직자2], TODAY);
  const rB = D.memberStatus(ours, live, [재직자2, 퇴사자], TODAY);
  assert.deepEqual(plain(rA), plain(rB));
});

test('이름이 하나뿐일 때는 지금처럼 toRemove 가 정상 동작한다 (동명이인 처리로 기존 동작이 깨지지 않았는지 확인)', () => {
  const ours = [{ key: '999', name: '퇴사자', position1: '', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '999', name: '퇴사자', position1: '', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '퇴사자', isNomusa: true, joinedAt: '2020-01-01', leftAt: '2026-07-31' }];
  assert.equal(D.memberStatus(ours, live, staff, TODAY)[0].status, 'toRemove');
});

test('홈페이지에 같은 글 번호가 두 번 나와도 liveOnly 는 한 번만 뜬다', () => {
  const live = [
    { srl: '888', name: '모르는사람A', position1: '', position2: '', careers: [] },
    { srl: '888', name: '모르는사람B', position1: '', position2: '', careers: [] }
  ];
  const r = D.memberStatus([], live, [], TODAY);
  const liveOnlyRows = r.filter(function (x) { return x.status === 'liveOnly'; });
  assert.equal(liveOnlyRows.length, 1);
});

test('홈페이지 글 번호가 겹치고 우리 자료에도 있으면 먼저 것을 기준으로 대조한다 — 나중 것이 말없이 덮지 않는다', () => {
  const ours = [{ key: '700', name: '첫번째', position1: '', position2: '', careers: [] }];
  const live = [
    { srl: '700', name: '첫번째', position1: '', position2: '', careers: [] },
    { srl: '700', name: '다른내용', position1: '바뀜', position2: '', careers: [] }
  ];
  const r = D.memberStatus(ours, live, [], TODAY);
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'same');
});

test('겹친 글 번호를 알 수 있다', () => {
  const live = [
    { srl: '888', name: 'A', position1: '', position2: '', careers: [] },
    { srl: '888', name: 'B', position1: '', position2: '', careers: [] },
    { srl: '999', name: 'C', position1: '', position2: '', careers: [] }
  ];
  assert.deepEqual(plain(D.duplicateLiveKeys(live)), ['888']);
});

test("nameLeftovers('이', ...) 는 한 글자 이름이라 훑지 않고 빈 결과를 낸다", () => {
  const pages = [{ path: 'greeting', text: '이것은 이상한 이야기 이렇게' }];
  assert.deepEqual(plain(D.nameLeftovers('이', pages)), []);
});

test("nameLeftovers('권형하', ...) 는 두 글자 이상이라 지금처럼 정상 동작한다", () => {
  const pages = [
    { path: 'greeting', text: '인사말입니다 대표 공인노무사 권형하' },
    { path: 'work4', text: '산재보상 안내' }
  ];
  assert.deepEqual(plain(D.nameLeftovers('권형하', pages)), [{ path: 'greeting', count: 1 }]);
});

/* ── 여기부터 검토 지적(Critical 1 · Important 3) 을 고친 뒤 붙인 검사 ──
   ① 새 구성원의 RTDB 열쇠는 'new-1755300000000' 같은 모양이라 홈페이지 글 번호와
      절대 안 맞는다. 열쇠로 짝지으면 사람이 글 번호를 적어 넣어도 영영
      「새로 올릴 것」으로 남고, 같은 사람이 liveOnly 로 한 줄 더 뜬다.
   ② 공개 명부(user_dir)에는 퇴사일 칸이 없다. 날짜가 없다고 퇴사를 못 본 척하면
      「내릴 것」이 경고 한 줄 없이 영영 안 붙는다. */

const 새열쇠 = 'new-1755300000000';

test('★ 새 구성원이 글 번호를 적으면 그 번호로 짝지어진다 — 두 줄로 뜨지 않는다', () => {
  const ours = [{ key: 새열쇠, srl: '999', name: '신입 노무사',
                  position1: '', position2: '공인노무사', careers: ['現 가'] }];
  const live = [{ srl: '999', name: '신입 노무사',
                  position1: '', position2: '공인노무사', careers: ['現 가'] }];
  const r = plain(D.memberStatus(ours, live, [], TODAY));
  assert.equal(r.length, 1, '같은 사람이 두 줄로 떴습니다');
  assert.equal(r[0].status, 'same', "글 번호로 짝지었으면 'same' 이어야 합니다");
  assert.equal(r[0].key, 새열쇠, '돌려주는 열쇠는 RTDB 열쇠여야 편집·저장이 된다');
  assert.ok(!r.some(x => x.status === 'liveOnly'), '「홈페이지에만」 유령 줄이 남았습니다');
});

test('★ 글 번호로 짝지은 새 구성원도 내용이 다르면 「안 올라감」이 된다', () => {
  const ours = [{ key: 새열쇠, srl: '999', name: '신입 노무사',
                  position1: '', position2: '공인노무사', careers: ['現 가', '現 나'] }];
  const live = [{ srl: '999', name: '신입 노무사',
                  position1: '', position2: '공인노무사', careers: ['現 가'] }];
  const r = plain(D.memberStatus(ours, live, [], TODAY));
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'pending');
  assert.equal(r[0].key, 새열쇠);
});

test('★ 글 번호가 아직 없는 진짜 새 사람은 지금처럼 「새로 올릴 것」이다', () => {
  const ours = [{ key: 새열쇠, srl: '', name: '신입 노무사',
                  position1: '', position2: '공인노무사', careers: [] }];
  const r = plain(D.memberStatus(ours, [{ srl: '190', name: '권형하', careers: [] }], [], TODAY));
  const mine = r.filter(x => x.key === 새열쇠);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, 'toAdd');
});

test('★ 글 번호를 적은 새 구성원에게도 「내릴 것(퇴사)」 판정이 붙는다', () => {
  const ours = [{ key: 새열쇠, srl: '999', name: '나간사람',
                  position1: '', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '999', name: '나간사람', position1: '', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '나간사람', leftAt: '2026-07-31' }];
  const r = plain(D.memberStatus(ours, live, staff, TODAY));
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'toRemove');
  assert.equal(r[0].key, 새열쇠);
});

test('글 번호가 없으면 예전처럼 RTDB 열쇠로 짝짓는다 (기존 자료가 안 깨진다)', () => {
  const ours = [{ key: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  const live = [{ srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  assert.equal(D.memberStatus(ours, live, [재직], TODAY)[0].status, 'same');
});

test('글 번호 칸에 앞뒤 공백이 섞여 있어도 짝지어진다', () => {
  const ours = [{ key: 새열쇠, srl: ' 999 ', name: '신입 노무사', position1: '', position2: '', careers: [] }];
  const live = [{ srl: '999', name: '신입 노무사', position1: '', position2: '', careers: [] }];
  const r = plain(D.memberStatus(ours, live, [], TODAY));
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'same');
});

test('★ 퇴사일이 없어도 명부에 「퇴사」 표시가 있으면 「내릴 것」이 붙는다', () => {
  /* 공개 명부(data/user_dir)에는 퇴사일이 없고 status 만 있다 — pu-erp 의 퇴사 처리가
     status 를 'retired' 로 쓴다. 날짜가 없다고 넘어가면 딱지가 영영 안 붙는다. */
  const ours = [{ key: '190', name: '나간사람', position1: '', position2: '', careers: [] }];
  const live = [{ srl: '190', name: '나간사람', position1: '', position2: '', careers: [] }];
  const staff = [{ name: '나간사람', leftAt: '', left: true }];
  const r = plain(D.memberStatus(ours, live, staff, TODAY));
  assert.equal(r[0].status, 'toRemove');
  assert.match(r[0].reason, /퇴사/, '왜 내려야 하는지 사유가 없습니다');
});

test('퇴사 표시가 없는 재직자는 그대로 둔다', () => {
  const ours = [{ key: '190', name: '권형하', position1: '', position2: '', careers: [] }];
  const live = [{ srl: '190', name: '권형하', position1: '', position2: '', careers: [] }];
  const staff = [{ name: '권형하', leftAt: '', left: false }];
  assert.equal(D.memberStatus(ours, live, staff, TODAY)[0].status, 'same');
});

test('퇴사일이 «아직 안 온» 사람은 내리지 않는다 (표시만으로 앞지르지 않는다)', () => {
  const ours = [{ key: '190', name: '예정자', position1: '', position2: '', careers: [] }];
  const live = [{ srl: '190', name: '예정자', position1: '', position2: '', careers: [] }];
  const staff = [{ name: '예정자', leftAt: '2026-12-31', left: true }];
  assert.equal(D.memberStatus(ours, live, staff, TODAY)[0].status, 'same');
});
