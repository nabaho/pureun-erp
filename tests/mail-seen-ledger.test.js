'use strict';
/* 처리한 메일을 「읽음」이 아니라 **따로 적어** 기억한다 (대표 결정 2026-08-23)
   실행: node --test tests/*.test.js

   무엇이 문제였나: 서버가 **안 읽은 메일만** 봤다(seen:false). 그래서
   **대표가 다음메일에서 그 메일을 열어 보면 급여데이터함에 영영 안 들어왔다.**
   메일이 오면 무슨 내용인지 확인하려고 여는 것이 당연한데, 그 순간 자료가 사라졌다.

   뿌리 문제는 「읽음」을 **처리 표시로 쓴 것**이다. 사람이 읽는 것과 서버가 처리한
   것은 다른 일인데 한 칸을 같이 썼다.

   고침: 메일마다 있는 고유 번호(Message-ID)를 서버가 적어 둔다.
     · 대표가 읽든 안 읽든 새 자료가 들어온다
     · 같은 메일을 두 번 담지 않는다
     · **읽음 표시를 서버가 건드리지 않는다** — 대표의 읽음/안읽음은 대표 것이다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MR = require(path.join(R, 'functions', 'mail-receive.js'));
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ══════ 메일 고유 번호 ══════ */

test('★ 메일 고유 번호(Message-ID)를 열쇠로 쓸 수 있게 다듬는다', () => {
  const k = MR.mailKey('<CAF=abc123$xyz@mail.daum.net>');
  assert.ok(k);
  // 실시간DB 열쇠에 못 쓰는 글자가 남으면 그 자리에 아예 못 쓴다
  assert.equal(/[.$#[\]/]/.test(k), false, '못 쓰는 글자가 남았습니다: ' + k);
});

test('같은 메일이면 같은 번호가 나온다', () => {
  const a = MR.mailKey('<abc@daum.net>');
  const b = MR.mailKey('<abc@daum.net>');
  assert.equal(a, b);
});

test('다른 메일이면 다른 번호가 나온다', () => {
  assert.notEqual(MR.mailKey('<a@daum.net>'), MR.mailKey('<b@daum.net>'));
});

test('앞뒤 꺾쇠와 빈칸은 무시한다 — 서버마다 붙이는 꼴이 다르다', () => {
  assert.equal(MR.mailKey('  <abc@daum.net>  '), MR.mailKey('abc@daum.net'));
});

test('★ 고유 번호가 없는 메일도 열쇠를 만든다 — 없다고 매번 다시 담으면 안 된다', () => {
  /* Message-ID 를 안 붙이는 메일도 있다. 그때는 보낸이·제목·시각으로 만든다 —
     같은 메일이면 같은 값이 나와야 두 번 안 담는다. */
  const a = MR.mailKey('', { from: 'a@b.com', subject: '8월 자료', date: 1700000000000 });
  const b = MR.mailKey('', { from: 'a@b.com', subject: '8월 자료', date: 1700000000000 });
  assert.ok(a);
  assert.equal(a, b);
});

test('고유 번호가 없고 보낸이·제목도 다르면 다른 열쇠다', () => {
  const a = MR.mailKey('', { from: 'a@b.com', subject: '8월', date: 1 });
  const b = MR.mailKey('', { from: 'c@d.com', subject: '8월', date: 1 });
  assert.notEqual(a, b);
});

test('아무것도 없으면 빈 값이다 — 억지로 만들지 않는다', () => {
  assert.equal(MR.mailKey('', {}), '');
  assert.equal(MR.mailKey('', null), '');
  assert.equal(MR.mailKey(null, null), '');
});

test('열쇠가 너무 길어지지 않는다 — 실시간DB 열쇠에는 한도가 있다', () => {
  const k = MR.mailKey('<' + 'x'.repeat(500) + '@daum.net>');
  assert.ok(k.length <= 200, '열쇠가 너무 깁니다: ' + k.length);
});

/* ══════ 서버 배선 ══════ */

test('★ 안 읽은 것만 보지 않는다 — 대표가 읽어도 자료가 들어와야 한다', () => {
  const i = FN.indexOf('async function runPaydataMailOnce');
  const body = FN.slice(i, FN.indexOf('exports.receivePaydataMail'));
  assert.equal(/\{ seen: false \}/.test(body), false,
    '★ 안 읽은 메일만 보고 있습니다 — 대표가 열어 본 메일은 영영 안 들어옵니다');
});

test('★ 이미 처리한 메일은 건너뛴다', () => {
  const i = FN.indexOf('async function runPaydataMailOnce');
  const body = FN.slice(i, FN.indexOf('exports.receivePaydataMail'));
  assert.match(body, /mailKey\(/, '메일 고유 번호를 안 만듭니다');
  assert.match(body, /doneKeys|seenLedger|처리한/, '처리한 목록을 안 봅니다');
});

test('★ 처리했다는 것을 적어 둔다 — 안 적으면 회차마다 다시 담는다', () => {
  /* 적는 일은 도우미(payMailMarkDone)가 하고 본체가 그것을 부른다 —
     자리는 갈라 두고, 부르는지와 적는 자리가 있는지를 따로 본다. */
  const i = FN.indexOf('async function runPaydataMailOnce');
  const body = FN.slice(i, FN.indexOf('exports.receivePaydataMail'));
  assert.match(body, /payMailMarkDone\(/, '처리했다고 적지 않습니다');
  assert.match(FN, /"\/mailseen\/"/, '처리 목록을 적는 자리가 없습니다');
});

test('★ 읽음 표시를 서버가 건드리지 않는다 (대표 결정)', () => {
  /* 대표의 읽음·안읽음은 대표 것이다. 새 메일 표시(공)가 그대로 보여야
     놓치지 않는다. */
  assert.equal(/markSeen\(/.test(FN), false,
    '★ 서버가 아직 읽음 표시를 건드립니다 — 대표의 읽음 상태를 뒤집습니다');
  assert.equal(/messageFlagsAdd/.test(FN), false, '★ 깃발을 아직 붙입니다');
});

test('★ 처리 목록이 끝없이 쌓이지 않는다', () => {
  /* 메일은 해마다 수천 통이다. 다 적어 두면 회차마다 그 전부를 읽는다(요금).
     걷어내는 일은 payMailMarkDone 이 적을 때 함께 한다 — 따로 도는 일을
     만들지 않는다(안 도는 청소는 없는 청소다). */
  const i = FN.indexOf('async function payMailMarkDone');
  assert.ok(i > 0, 'payMailMarkDone 이 없습니다');
  const body = FN.slice(i, i + 1800);
  assert.match(body, /MAIL_DONE_KEEP/, '수 한도가 없습니다');
  assert.match(body, /MAIL_DONE_DAYS/, '기간 한도가 없습니다');
  assert.match(body, /= null;/, '걷어내는(null) 곳이 없습니다');
});
