/* 자료 메일 자동 발송 — 실제로 쏘기 전에 막아야 하는 것들.
   이 층이 뚫리면 회사 메일 계정이 공개 발송기가 되거나,
   '보냈다'고 나오고 실제로는 아무 데도 안 간다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const MS = require('../functions/mail-send.js');

const OK = { to:'a@b.com', subject:'제목', body:'본문' };

/* ── 받는 주소 ── */

test('쓸 만한 주소만 통과시킨다', () => {
  assert.equal(MS.isEmail('hong@example.com'), true);
  assert.equal(MS.isEmail('hong@example'), false, '점 뒤 도메인이 없다');
  assert.equal(MS.isEmail('hong example@a.com'), false, '빈칸이 들어 있다');
  assert.equal(MS.isEmail(''), false);
  assert.equal(MS.isEmail(null), false);
});

test('쉼표·세미콜론으로 여러 명, 중복은 하나로', () => {
  assert.deepEqual(MS.parseRecipients('a@b.com, c@d.com; a@b.com'), ['a@b.com','c@d.com']);
  assert.deepEqual(MS.parseRecipients(['a@b.com','틀린주소']), ['a@b.com']);
  assert.deepEqual(MS.parseRecipients(''), []);
});

test('받는 사람이 없으면 보내지 않는다', () => {
  const r = MS.validateSend({ to:'', subject:'제목', body:'본문' });
  assert.equal(r.ok, false);
  assert.match(r.error, /받는 사람/);
});

test('한 번에 너무 많은 곳으로 보내지 못한다 — 계정이 공개 발송기가 된다', () => {
  const many = Array.from({length: MS.MAX_TO + 1}, (_,i)=>`u${i}@b.com`).join(',');
  const r = MS.validateSend({ to:many, subject:'제목', body:'본문' });
  assert.equal(r.ok, false);
  assert.match(r.error, /받는 사람은/);
});

test('참조에 받는 사람이 또 들어 있으면 뺀다 — 같은 사람에게 두 통 간다', () => {
  const r = MS.validateSend({ ...OK, cc:'a@b.com, z@b.com' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.cc, ['z@b.com']);
});

/* ── 제목·본문 ── */

test('제목의 줄바꿈을 없앤다 — 남기면 몰래 다른 곳으로도 보낼 수 있다', () => {
  const r = MS.validateSend({ ...OK, subject:'제목\nBcc: 몰래@나쁜곳.com' });
  assert.equal(r.ok, true);
  assert.ok(!r.subject.includes('\n'), '줄바꿈이 남으면 안 된다');
  assert.equal(r.subject, '제목 Bcc: 몰래@나쁜곳.com');
});

test('제목이 너무 길면 자른다', () => {
  const r = MS.validateSend({ ...OK, subject:'가'.repeat(500) });
  assert.equal(r.subject.length, MS.MAX_SUBJECT);
});

test('제목이나 본문이 비면 보내지 않는다 — 빈 껍데기가 고객에게 간다', () => {
  assert.equal(MS.validateSend({ ...OK, subject:'   ' }).ok, false);
  assert.equal(MS.validateSend({ ...OK, body:'  \n ' }).ok, false);
});

/* ── 첨부 ── */

test('base64 실제 크기를 잰다 — 글자 수로 재면 3분의 1을 더 크게 본다', () => {
  /* 'AAAA' → 3바이트, 'AAA=' → 2바이트, 'AA==' → 1바이트 */
  assert.equal(MS.dataUrlBytes('data:x;base64,AAAA'), 3);
  assert.equal(MS.dataUrlBytes('data:x;base64,AAA='), 2);
  assert.equal(MS.dataUrlBytes('data:x;base64,AA=='), 1);
  assert.equal(MS.dataUrlBytes(''), 0);
  assert.equal(MS.dataUrlBytes('쉼표없음'), 0);
});

test('파일 내용이 없으면 첨부를 만들지 않는다', () => {
  assert.equal(MS.toAttachment({name:'제안서'}, ''), null);
  assert.equal(MS.toAttachment({name:'제안서'}, 'data:x;base64,'), null);
  assert.equal(MS.toAttachment({name:'제안서'}, null), null);
});

test('파일 이름에서 위험한 글자를 없앤다 — 받는 쪽에서 안 열린다', () => {
  const a = MS.toAttachment({fileName:'제안/서:2026\n.pdf'}, 'data:x;base64,AAAA');
  assert.equal(a.filename, '제안_서_2026_.pdf');
});

test('파일 이름이 없으면 자료 이름을 쓴다', () => {
  assert.equal(MS.toAttachment({name:'회사소개서'}, 'data:x;base64,AAAA').filename, '회사소개서');
  assert.equal(MS.toAttachment({}, 'data:x;base64,AAAA').filename, '자료.dat');
});

test('첨부는 **합계**로 막는다 — 한 개씩만 보면 큰 것 여러 개가 통과한다', () => {
  const half = Math.ceil(MS.MAX_TOTAL_BYTES * 0.6);
  const r = MS.validateSend({ ...OK, attachments:[{bytes:half},{bytes:half}] });
  assert.equal(r.ok, false);
  assert.match(r.error, /첨부가 너무 큽니다/);
});

test('크기가 넉넉하면 통과하고 합계를 함께 돌려준다', () => {
  const r = MS.validateSend({ ...OK, attachments:[{bytes:1000},{bytes:2000}] });
  assert.equal(r.ok, true);
  assert.equal(r.bytes, 3000);
  assert.equal(r.attachments.length, 2);
});

/* ── 보낸 기록 ── */

test('서버가 남기는 기록에 자동 발송 표시가 붙는다 — 손으로 보낸 것과 구분', () => {
  const r = MS.sentLogRec({ at:5, by:'me@x.com', to:['a@b.com','c@d.com'], names:['제안서'] });
  assert.equal(r.auto, true);
  assert.equal(r.to, 'a@b.com, c@d.com');
  assert.deepEqual(r.names, ['제안서']);
  assert.equal(r.at, 5);
});

test('기록의 빈 자료 이름은 걸러낸다', () => {
  const r = MS.sentLogRec({ at:1, names:['제안서','',null] });
  assert.deepEqual(r.names, ['제안서']);
  assert.equal(r.set, '');
});

/* ── 숨은참조 ── */

test('숨은참조에 받는사람·참조와 겹치는 주소는 뺀다 — 같은 사람에게 두 통 간다', () => {
  const r = MS.validateSend({ ...OK, cc:'c@d.com', bcc:'a@b.com, c@d.com, z@z.com' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.bcc, ['z@z.com']);
});

test('숨은참조도 개수를 막는다', () => {
  const many = Array.from({length: MS.MAX_TO + 1}, (_,i)=>`b${i}@x.com`).join(',');
  const r = MS.validateSend({ ...OK, bcc:many });
  assert.equal(r.ok, false);
  assert.match(r.error, /숨은참조/);
});

test('숨은참조가 없으면 빈 목록', () => {
  const r = MS.validateSend({ ...OK });
  assert.deepEqual(r.bcc, []);
});
