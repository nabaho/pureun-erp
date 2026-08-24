'use strict';
/* 서버가 본 메일을 목록으로 적어 둔다 (대표 결정 2026-08-24) — 실행: node --test tests/*.test.js

   왜: 푸른 메일에는 **보내는 쪽만** 있었다(쓰기·보낸·예약·자료함). 받은 메일은
   급여데이터함 안에서만, 그것도 **자료로 담긴 것만** 보였다. 그래서 문의 메일처럼
   자료가 안 되는 것은 앱에서 통째로 안 보였고, 「보냈다는데 왜 안 보이나」를
   메일 쪽에서 확인할 길이 없었다.

   ⚠ **사본을 만드는 것이 아니다.** 답장·삭제·읽음은 여전히 다음메일이 진짜다.
   여기 적는 것은 「서버가 무엇을 보고 무엇을 담았나」는 **기록**이다 —
   그래서 본문 전문을 넣지 않는다(미리보기 몇 줄만). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MR = require(path.join(R, 'functions', 'mail-receive.js'));
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ══════ 목록 한 줄 ══════ */

test('★ 보낸이·제목·시각·폴더가 담긴다', () => {
  const r = MR.mailLogRecord({
    from: '정담회계법인 <acct@jd.kr>', subject: 'RE: 8월 급여대장 송부',
    box: '2.급여+사무대행', at: 1700000000000, atts: 2
  });
  assert.match(r.from, /acct@jd\.kr/);
  assert.equal(r.subject, 'RE: 8월 급여대장 송부');
  assert.equal(r.box, '2.급여+사무대행');
  assert.equal(r.at, 1700000000000);
  assert.equal(r.atts, 2);
});

test('★ 본문 미리보기는 몇 줄만 — 전문을 넣으면 목록만 읽어도 무겁다', () => {
  const long = '가나다'.repeat(500);
  const r = MR.mailLogRecord({ from: 'a@b.com', subject: 'x', body: long });
  assert.ok(r.preview.length <= 200, '미리보기가 너무 깁니다: ' + r.preview.length);
  assert.ok(long.indexOf(r.preview.slice(0, 20)) >= 0, '본문 앞부분이어야 합니다');
});

test('미리보기의 줄바꿈은 한 칸으로 눌러 담는다 — 목록은 한 줄로 보인다', () => {
  const r = MR.mailLogRecord({ from: 'a@b.com', subject: 'x', body: '김철수 22\n이영희 21\n\n박민수 19' });
  assert.equal(/[\r\n]/.test(r.preview), false, '줄바꿈이 남았습니다');
  assert.match(r.preview, /김철수 22 이영희 21/);
});

test('★ 몇 건을 담았고 누구 칸으로 갔는지 적는다 — 이 화면의 핵심이다', () => {
  const r = MR.mailLogRecord({
    from: 'a@b.com', subject: 'x', took: 2, seatName: '최기운', shared: false
  });
  assert.equal(r.took, 2);
  assert.equal(r.seatName, '최기운');
  assert.equal(r.shared, false);
});

test('★ 임자를 못 찾았으면 그 까닭이 남는다', () => {
  const r = MR.mailLogRecord({
    from: 'a@b.com', subject: 'x', took: 1, shared: true, why: '업체관리에 없는 주소'
  });
  assert.equal(r.shared, true);
  assert.equal(r.why, '업체관리에 없는 주소');
});

test('★ 자료로 안 담긴 메일도 목록에는 남는다 — 문의 메일이 통째로 안 보이던 것이 문제였다', () => {
  const r = MR.mailLogRecord({
    from: 'a@b.com', subject: '퇴직연금 문의', took: 0, why: '숫자가 없어 값으로 만들 것이 없습니다'
  });
  assert.equal(r.took, 0);
  assert.match(r.why, /숫자가 없어/);
});

test('없는 값은 빈칸·0 으로 둔다 — 억지로 만들지 않는다', () => {
  const r = MR.mailLogRecord({});
  assert.equal(r.from, '');
  assert.equal(r.subject, '');
  assert.equal(r.preview, '');
  assert.equal(r.took, 0);
  assert.equal(r.atts, 0);
  assert.equal(r.shared, false);
});

test('아주 긴 제목은 자른다 — 목록 한 줄에 들어가야 한다', () => {
  const r = MR.mailLogRecord({ subject: '가'.repeat(500) });
  assert.ok(r.subject.length <= 200, '제목이 너무 깁니다: ' + r.subject.length);
});

/* ══════ 서버 배선 ══════ */

test('★ 서버가 본 메일마다 목록을 적는다', () => {
  const i = FN.indexOf('async function runPaydataMailOnce');
  const body = FN.slice(i, FN.indexOf('exports.receivePaydataMail'));
  assert.match(body, /mailLogRecord\(/, '목록을 안 적습니다');
  assert.match(FN, /"\/maillog\/"/, '목록을 적는 자리가 없습니다');
});

test('★ 목록도 끝없이 쌓이지 않는다', () => {
  /* 처리 목록(mailseen)과 같은 원칙 — 적을 때 함께 걷어낸다.
     따로 도는 청소는 안 도는 청소다. */
  const i = FN.indexOf('async function payMailWriteLog');
  assert.ok(i > 0, 'payMailWriteLog 가 없습니다');
  const body = FN.slice(i, i + 1800);
  assert.match(body, /MAIL_LOG_KEEP/, '수 한도가 없습니다');
  assert.match(body, /= null;/, '걷어내는 곳이 없습니다');
});

test('★ 목록을 못 적어도 자료 담기는 끝난다 — 기록 때문에 자료가 막히면 안 된다', () => {
  const i = FN.indexOf('async function payMailWriteLog');
  const body = FN.slice(i, i + 1800);
  assert.match(body, /catch/, '못 적었을 때 넘어가는 길이 없습니다');
});
