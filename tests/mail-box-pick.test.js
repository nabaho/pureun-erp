'use strict';
/* 어느 메일 폴더를 볼지 고른다 (대표 결정 2026-08-23) — 실행: node --test tests/*.test.js

   무엇이 문제였나: 서버가 「급여자료」라는 **이름 하나만** 찾았다. 그런데 다음메일에는
   이미 「2.급여+사무대행」 폴더가 있었다 — 이름이 달라 못 찾고, 로그에 열흘 넘게
   「폴더가 없습니다. 다음메일에서 만들어 주세요」만 남겼다.
   폴더를 새로 만들 일이 아니라, 있는 폴더를 찾게 할 일이었다.

   대표 결정: 이름에 「급여」가 든 폴더를 저절로 찾고, 필요할 때 받은메일함 전부도
   볼 수 있게 스위치를 둔다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MR = require(path.join(__dirname, '..', 'functions', 'mail-receive.js'));

/* IMAP 이 돌려주는 폴더 목록 모양 — path 가 실제로 열 이름이다 */
const BOXES = [
  { path: 'INBOX', name: 'INBOX' },
  { path: '1.자문사답변', name: '1.자문사답변' },
  { path: '2.급여+사무대행', name: '2.급여+사무대행' },
  { path: '3.컨설팅(정부지원)', name: '3.컨설팅(정부지원)' },
  { path: '6.공공기관', name: '6.공공기관' },
  { path: 'Sent Messages', name: 'Sent Messages' }
];

/* ══════ 기본 — 이름에 「급여」가 든 폴더 ══════ */

test('★ 이름에 「급여」가 든 폴더를 찾는다 — 이름이 정확히 안 같아도', () => {
  assert.deepEqual(MR.pickMailboxes(BOXES, {}), ['2.급여+사무대행']);
});

test('★ 급여 폴더가 여럿이면 다 본다 — 하나만 골라 나머지를 놓치면 안 된다', () => {
  const boxes = BOXES.concat([{ path: '10.급여자료(옛)', name: '10.급여자료(옛)' }]);
  const got = MR.pickMailboxes(boxes, {});
  assert.equal(got.length, 2);
  assert.ok(got.indexOf('2.급여+사무대행') >= 0);
  assert.ok(got.indexOf('10.급여자료(옛)') >= 0);
});

test('보낸메일함·임시보관함은 안 본다 — 우리가 보낸 것을 되받으면 안 된다', () => {
  const boxes = [
    { path: '보낸메일함', name: '보낸메일함' },
    { path: 'Sent', name: 'Sent' },
    { path: 'Drafts', name: 'Drafts' },
    { path: '2.급여+사무대행', name: '2.급여+사무대행' }
  ];
  assert.deepEqual(MR.pickMailboxes(boxes, {}), ['2.급여+사무대행']);
});

test('휴지통·스팸은 안 본다', () => {
  const boxes = [
    { path: '휴지통', name: '휴지통' },
    { path: 'Trash', name: 'Trash' },
    { path: 'Junk', name: 'Junk' },
    { path: '스팸메일함', name: '스팸메일함' },
    { path: '2.급여자료', name: '2.급여자료' }
  ];
  assert.deepEqual(MR.pickMailboxes(boxes, {}), ['2.급여자료']);
});

/* ══════ 이름을 못 박아 줬을 때 ══════ */

test('★ 폴더 이름을 지정하면 그것만 본다', () => {
  assert.deepEqual(MR.pickMailboxes(BOXES, { folder: '6.공공기관' }), ['6.공공기관']);
});

test('지정한 이름이 없으면 못 찾았다고 한다 — 엉뚱한 폴더를 열지 않는다', () => {
  assert.deepEqual(MR.pickMailboxes(BOXES, { folder: '없는폴더' }), []);
});

/* ══════ 받은메일함 전부 보기 (대표 요청 2026-08-23) ══════ */

test('★ 스위치를 켜면 받은메일함도 함께 본다', () => {
  const got = MR.pickMailboxes(BOXES, { scanInbox: true });
  assert.equal(got[0], '2.급여+사무대행', '급여 폴더가 먼저다 — 확실한 것부터 본다');
  assert.ok(got.indexOf('INBOX') >= 0);
});

test('스위치를 껐으면 받은메일함은 안 본다', () => {
  assert.equal(MR.pickMailboxes(BOXES, { scanInbox: false }).indexOf('INBOX'), -1);
});

test('급여 폴더가 없고 스위치만 켜져 있으면 받은메일함만 본다', () => {
  const boxes = [{ path: 'INBOX', name: 'INBOX' }, { path: '1.자문사답변', name: '1.자문사답변' }];
  assert.deepEqual(MR.pickMailboxes(boxes, { scanInbox: true }), ['INBOX']);
});

test('같은 폴더를 두 번 보지 않는다', () => {
  const boxes = [{ path: 'INBOX', name: 'INBOX' }];
  assert.deepEqual(MR.pickMailboxes(boxes, { folder: 'INBOX', scanInbox: true }), ['INBOX']);
});

/* ══════ 아무것도 못 찾았을 때 ══════ */

test('★ 급여 폴더도 없고 스위치도 꺼져 있으면 빈 목록이다', () => {
  // 이때 서버가 폴더 목록을 로그에 남겨야 사람이 이름을 알 수 있다
  const boxes = [{ path: 'INBOX', name: 'INBOX' }, { path: '1.자문사답변', name: '1.자문사답변' }];
  assert.deepEqual(MR.pickMailboxes(boxes, {}), []);
});

test('폴더 목록 자체가 없어도 터지지 않는다', () => {
  assert.deepEqual(MR.pickMailboxes(null, {}), []);
  assert.deepEqual(MR.pickMailboxes([], { scanInbox: true }), []);
  assert.deepEqual(MR.pickMailboxes(BOXES, null), ['2.급여+사무대행']);
});

test('path 가 없는 줄은 건너뛴다', () => {
  const boxes = [{ name: '급여없는path' }, { path: '2.급여자료', name: '2.급여자료' }];
  assert.deepEqual(MR.pickMailboxes(boxes, {}), ['2.급여자료']);
});

/* ══════ 설정 읽기 ══════ */

test('★ 설정이 없으면 기본값으로 돈다 — 아무것도 안 해도 굴러가야 한다', () => {
  const c = MR.mailConfOf(null);
  assert.equal(c.scanInbox, false);
  assert.equal(c.folder, '');
});

test('설정에 적힌 대로 읽는다', () => {
  const c = MR.mailConfOf({ scanInbox: true, folder: '2.급여+사무대행' });
  assert.equal(c.scanInbox, true);
  assert.equal(c.folder, '2.급여+사무대행');
});

test('이상한 값이 들어와도 안전한 쪽으로 읽는다', () => {
  // 받은메일함 전부 보기는 **켜는 쪽이 위험**하다 — 참이라고 확실할 때만 켠다
  assert.equal(MR.mailConfOf({ scanInbox: 'yes' }).scanInbox, false);
  assert.equal(MR.mailConfOf({ scanInbox: 1 }).scanInbox, false);
  assert.equal(MR.mailConfOf({ folder: 123 }).folder, '');
});
