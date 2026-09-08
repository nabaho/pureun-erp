'use strict';
/* 급여 폴더에 온 것은 다 받는다 (대표 결정 2026-08-23) — 실행: node --test tests/*.test.js

   무엇이 문제였나: 2026-08-23 로그에서 폴더는 제대로 찾았는데(`boxes: [2.급여+사무대행]`)
   그 안의 새 메일 2통이 **모르는 주소라 건너뛰어졌다**(unknown: 2 · took: 0).
   cust12@naver.com·cust16@naver.com 이 업체관리에 없었기 때문이다.

   대표 결정: **그 폴더는 대표가 규칙으로 손수 갈라 둔 곳**이니 그 안의 것은 이미
   「급여 자료」로 분류된 것이다 — 주소를 안 보고 다 받는다.
   받은메일함(INBOX)은 광고까지 들어오므로 **거기서 온 것만** 아는 주소를 가린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MR = require(path.join(R, 'functions', 'mail-receive.js'));
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ══════ 어느 폴더에서 온 것을 믿나 ══════ */

test('★ 급여 폴더는 주소를 안 가린다 — 대표가 손수 갈라 둔 곳이다', () => {
  assert.equal(MR.trustBox('2.급여+사무대행'), true);
  assert.equal(MR.trustBox('10.급여자료'), true);
});

test('★ 받은메일함은 가린다 — 광고까지 들어온다', () => {
  assert.equal(MR.trustBox('INBOX'), false);
  assert.equal(MR.trustBox('inbox'), false, '대소문자로 빠져나가면 안 됩니다');
});

test('폴더 이름이 없으면 안 믿는다 — 모르면 가리는 쪽이 안전하다', () => {
  assert.equal(MR.trustBox(''), false);
  assert.equal(MR.trustBox(null), false);
  assert.equal(MR.trustBox(undefined), false);
});

test('이름에 「급여」가 없는 폴더도 안 믿는다', () => {
  // scanInbox 처럼 나중에 다른 폴더를 보게 되어도 함부로 믿지 않는다
  assert.equal(MR.trustBox('1.자문사답변'), false);
  assert.equal(MR.trustBox('6.공공기관'), false);
});

/* ══════ 서버가 그대로 쓰나 ══════ */

test('★ 서버가 폴더를 보고 주소 검사를 건너뛴다', () => {
  const i = FN.indexOf('async function runPaydataMailOnce');
  const body = FN.slice(i, FN.indexOf('exports.receivePaydataMail'));
  assert.match(body, /trustBox\(/, '폴더를 믿는지 안 봅니다');
  /* 검사를 아예 없애면 안 된다 — 받은메일함을 보게 켰을 때 광고까지 담긴다. */
  assert.match(body, /isKnownSender\(/, '아는 주소 검사가 통째로 없어졌습니다');
});

test('★ 건너뛴 것과 믿고 받은 것을 로그에서 갈라 볼 수 있다', () => {
  const i = FN.indexOf('async function runPaydataMailOnce');
  const body = FN.slice(i, FN.indexOf('exports.receivePaydataMail'));
  // 왜 0건인지 로그만 보고 알 수 있어야 한다 — 이번에 그것 때문에 이틀을 헤맸다
  assert.match(body, /unknown/);
});

test('아는 주소 명단 만들기는 그대로 있다 — 받은메일함을 볼 때 쓴다', () => {
  assert.equal(typeof MR.buildKnownList, 'function');
  assert.equal(typeof MR.isKnownSender, 'function');
});
