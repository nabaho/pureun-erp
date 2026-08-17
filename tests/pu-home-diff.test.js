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

/* ══════ 최종 검토 4 — 퇴사자 글을 내린 «바로 다음 확인»에서 딱지가 뒤집히지 않는다 ══════
   앱이 시킨 대로 홈페이지에서 비공개 처리하면 그 사람은 onLive 가 아니게 된다.
   퇴사 여부를 안 보면 !onLive 가 그대로 「새로 올릴 것」이 되어, 정상 흐름의 마지막
   걸음에서 화면이 정확히 반대(다시 올려라)를 가리킨다. 왼쪽 빨간 점도 영영 남는다. */

/* ══════ 2차 설계 — 「홈페이지에 남기기」 예외 (§4-가) ══════
   지사장은 고용관계가 아니어서 급여 명부에 퇴사로 찍혀 있거나 아예 없다.
   급여 명부에 없다는 것이 지사장을 그만뒀다는 뜻은 아니다 — 장한돌 세종지사장이
   실제로 이 경우다(명부상 2023-12-31 퇴사, 홈페이지에는 여전히 「세종지사장」). */

test('★ keepOnSite 가 있으면 명부상 퇴사자라도 toRemove 를 달지 않고 내용 대조 결과를 쓴다', () => {
  const ours = [{ key: '999', srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                  careers: [], keepOnSite: { at: '2026-08-17', by: '관리자', why: '지사장은 고용관계 아님' } }];
  const live = [{ srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '장한돌', leftAt: '2023-12-31' }]; // 명부상 퇴사
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'same', 'toRemove 가 아니라 내용 대조 결과(same)를 써야 한다');
  assert.match(r.reason, /남기기|keepOnSite|예외/, '왜 딱지를 안 달았는지 사유가 없다');
  assert.match(r.reason, /지사장은 고용관계 아님/, '남긴 사유 원문이 reason 에 담겨야 한다');
});

test('★ keepOnSite 가 있어도 내용이 다르면 pending 이다 — 예외가 대조 자체를 막지 않는다', () => {
  const ours = [{ key: '999', srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                  careers: ['現 가', '現 나'], keepOnSite: { at: '2026-08-17', by: '관리자', why: '지사장' } }];
  const live = [{ srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: ['現 가'] }];
  const staff = [{ name: '장한돌', leftAt: '2023-12-31' }];
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'pending');
  assert.match(r.reason, /내용이 다름/);
  assert.match(r.reason, /지사장/);
});

test('keepOnSite 가 없으면 지금처럼 퇴사 판정이 toRemove 로 그대로 붙는다 (예외를 풀면 다시 판정받는다)', () => {
  const ours = [{ key: '999', srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '장한돌', leftAt: '2023-12-31' }];
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'toRemove');
});

/* 사유 없는 예외는 거절한다 — keepOnSite 가 객체이기만 하면(사유가 비어 있어도)
   퇴사 딱지를 떼 주던 자리(pu-home-diff.js:keepOnSiteReason). 설계(§4)는 「사유를
   반드시 적게 한다」고 못 박았다 — 왜 남겼는지 알 수 없는 예외는 위험하다. 화면은
   사유를 강제해 입력하지만, 부품(memberStatus)이 안 막으면 화면을 거치지 않고
   {}/[] 를 직접 써 넣었을 때 조용히 뚫린다. */
test('★ keepOnSite:{} 처럼 사유(why)가 없으면 예외로 보지 않고 toRemove 를 그대로 붙인다', () => {
  const ours = [{ key: '999', srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                  careers: [], keepOnSite: {} }];
  const live = [{ srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '장한돌', leftAt: '2023-12-31' }];
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'toRemove', '사유 없는 keepOnSite:{} 는 예외가 아니다');
});

test('★ keepOnSite:[] (빈 배열)도 사유가 없으므로 예외로 보지 않는다', () => {
  const ours = [{ key: '999', srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                  careers: [], keepOnSite: [] }];
  const live = [{ srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '장한돌', leftAt: '2023-12-31' }];
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'toRemove', '사유 없는 keepOnSite:[] 는 예외가 아니다');
});

test('★ keepOnSite.why 가 공백뿐이면 tidy 후 빈 사유이므로 예외로 보지 않는다', () => {
  const ours = [{ key: '999', srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                  careers: [], keepOnSite: { at: '2026-08-17', by: '관리자', why: '   ' } }];
  const live = [{ srl: '999', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '장한돌', leftAt: '2023-12-31' }];
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'toRemove', '공백뿐인 사유는 사유가 아니다');
});

/* ══════ 2차 설계 — 「명부에 없는 사람」 (§4-나) ══════
   조현범 대전지사장이 실제로 이 경우다: 급여 명부(32명)에 이름 자체가 없다.
   지금은 조용히 입·퇴사 판정을 안 한다 — 왜 경고가 없는지 사장님이 알 수 없다. */

test('★ 명부에 이름이 없으면(대전지사장 사례) 내용이 같아도 reason 에 「판단 못 함」을 남긴다', () => {
  const ours = [{ key: '888', srl: '888', name: '조현범', position1: '대전지사장', position2: '공인노무사', careers: [] }];
  const live = [{ srl: '888', name: '조현범', position1: '대전지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '권형하', leftAt: '' }]; // 명부는 있으나 조현범은 없음
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'same', '딱지 자체는 내용 대조 결과를 그대로 써야 한다');
  assert.match(r.reason, /명부에 없/, '명부에 없어 판단을 못 했다는 사유가 없다');
  assert.match(r.reason, /입.?퇴사/, '무엇을 못 했는지(입·퇴사 판단)가 사유에 없다');
});

test('★ 명부에 없는 사람도 내용이 다르면 pending 이고, 왜 판단을 못 했는지 사유가 함께 남는다', () => {
  const ours = [{ key: '888', srl: '888', name: '조현범', position1: '대전지사장', position2: '공인노무사', careers: ['現 가'] }];
  const live = [{ srl: '888', name: '조현범', position1: '', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '권형하', leftAt: '' }];
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'pending');
  assert.match(r.reason, /내용이 다름/);
  assert.match(r.reason, /명부에 없/);
});

test('★ 명부에 없고 홈페이지에도 없으면 toAdd 이고, 「홈페이지에 없음」과 「명부에 없음」 사유가 함께 남는다', () => {
  const ours = [{ key: 'new-9', name: '조현범', position1: '대전지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '권형하', leftAt: '' }];
  const r = D.memberStatus(ours, [], staff, TODAY)[0];
  assert.equal(r.status, 'toAdd');
  assert.match(r.reason, /홈페이지에 없음/);
  assert.match(r.reason, /명부에 없/);
});

test('명부에 이름이 있으면(재직 1명) 지금처럼 「판단 못 함」 사유가 붙지 않는다', () => {
  const ours = [{ key: '190', srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  const live = [{ srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 가'] }];
  const r = D.memberStatus(ours, live, [재직], TODAY)[0];
  assert.equal(r.status, 'same');
  assert.doesNotMatch(r.reason || '', /명부에 없/);
});

test('★ 명부에도 없고 keepOnSite 도 있으면(조현범 실제 사례) 두 사유가 함께 남는다', () => {
  const ours = [{ key: '888', srl: '888', name: '조현범', position1: '대전지사장', position2: '공인노무사', careers: [],
                  keepOnSite: { at: '2026-08-17', by: '관리자', why: '대전지사장·고용관계 아님' } }];
  const live = [{ srl: '888', name: '조현범', position1: '대전지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '권형하', leftAt: '' }];
  const r = D.memberStatus(ours, live, staff, TODAY)[0];
  assert.equal(r.status, 'same');
  assert.match(r.reason, /명부에 없/);
  assert.match(r.reason, /대전지사장·고용관계 아님/);
});

test('★ 퇴사자를 홈페이지에서 내리고 나면 「다시 올려라」로 뒤집히지 않는다', () => {
  const ours = [{ key: '190', srl: '190', name: '나간사람', position1: '', position2: '', careers: [] }];
  const staff = [{ name: '나간사람', leftAt: '2026-07-31' }];
  const r = plain(D.memberStatus(ours, [{ srl: '999', name: '남은사람', careers: [] }], staff, TODAY));
  const mine = r.filter(x => x.key === '190')[0];
  assert.ok(mine, '퇴사자 줄이 사라졌습니다');
  assert.notEqual(mine.status, 'toAdd', '내린 사람을 다시 올리라고 시킵니다');
  assert.equal(mine.status, 'done', '할 일이 없는 상태로 판정해야 왼쪽 빨간 점이 사라집니다');
  assert.match(mine.reason, /퇴사/, '왜 할 일이 없는지 사유가 없습니다');
});

test('★ 퇴사 표시(날짜 없음)만 있는 사람도 홈페이지에서 내려갔으면 할 일이 없다', () => {
  const ours = [{ key: '190', srl: '190', name: '나간사람', position1: '', position2: '', careers: [] }];
  const staff = [{ name: '나간사람', leftAt: '', left: true }];
  const r = plain(D.memberStatus(ours, [{ srl: '999', name: '남은사람', careers: [] }], staff, TODAY));
  assert.equal(r.filter(x => x.key === '190')[0].status, 'done');
});

test('아직 퇴사하지 않은 사람이 홈페이지에 없으면 지금처럼 「새로 올릴 것」이다', () => {
  const ours = [{ key: 'new-1', srl: '', name: '신입', position1: '', position2: '', careers: [] }];
  const staff = [{ name: '신입', leftAt: '', left: false }];
  const r = plain(D.memberStatus(ours, [{ srl: '999', name: '남은사람', careers: [] }], staff, TODAY));
  assert.equal(r.filter(x => x.key === 'new-1')[0].status, 'toAdd');
});

test('★ 동명이인이면 홈페이지에 없어도 퇴사 판단을 보류하고 사유에 남긴다', () => {
  const ours = [{ key: '500', srl: '500', name: '김노무', position1: '', position2: '', careers: [] }];
  const staff = [
    { name: '김노무', leftAt: '2026-07-01' },
    { name: '김노무', leftAt: '' }
  ];
  const r = plain(D.memberStatus(ours, [{ srl: '999', name: '남은사람', careers: [] }], staff, TODAY));
  const mine = r.filter(x => x.key === '500')[0];
  assert.equal(mine.status, 'toAdd', '못 가리면 사람이 보게 두되 딱지는 지금대로 둔다');
  assert.match(mine.reason, /동명이인/, '왜 퇴사 판단을 못 했는지 안 적혀 있습니다');
});

/* ══════ 최종 검토 3 — «우리 자료» 쪽 글 번호 겹침 ══════
   duplicateLiveKeys 는 홈페이지 쪽만 본다. 우리 자료에서 두 사람이 같은 글 번호를 쓰면
   편집 주소가 남의 글을 가리키고, 시킨 대로 붙여넣으면 남의 경력이 덮인다. */

test('★ 우리 자료에서 두 사람이 같은 글 번호를 쓰면 찾아낸다', () => {
  const ours = [
    { key: '190', srl: '190', name: '권형하' },
    { key: 'new-1', srl: '190', name: '신입 노무사' },
    { key: '191', srl: '191', name: '다른사람' }
  ];
  const dup = plain(D.duplicateOurKeys(ours));
  assert.equal(dup.length, 1, '겹친 글 번호를 못 찾았습니다');
  assert.equal(dup[0].srl, '190');
  assert.deepEqual(dup[0].keys.slice().sort(), ['190', 'new-1']);
  assert.deepEqual(dup[0].names.slice().sort(), ['권형하', '신입 노무사'].sort());
});

test('글 번호가 빈 사람끼리는 겹친 것이 아니다', () => {
  const ours = [
    { key: 'new-1', srl: '', name: '가' },
    { key: 'new-2', srl: '', name: '나' },
    { key: 'new-3', name: '다' }
  ];
  assert.deepEqual(plain(D.duplicateOurKeys(ours)), []);
});

test('글 번호에 앞뒤 공백이 섞여도 같은 번호로 본다', () => {
  const ours = [
    { key: '190', srl: ' 190 ', name: '권형하' },
    { key: 'new-1', srl: '190', name: '신입' }
  ];
  const dup = plain(D.duplicateOurKeys(ours));
  assert.equal(dup.length, 1);
  assert.equal(dup[0].srl, '190');
});

test('겹치는 사람이 없으면 조용하다', () => {
  const ours = [{ key: '190', srl: '190', name: '권형하' }, { key: '191', srl: '191', name: '다른사람' }];
  assert.deepEqual(plain(D.duplicateOurKeys(ours)), []);
  assert.deepEqual(plain(D.duplicateOurKeys(null)), []);
});
