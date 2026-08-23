'use strict';
/* 메일 본문도 자료로 담는다 (대표 결정 2026-08-23) — 실행: node --test tests/*.test.js

   무엇이 문제였나: 서버가 **첨부만** 담고 본문(parsed.text)은 통째로 버렸다. 그래서
     · 첨부 없이 본문에 적어 보낸 메일(「이번달 김철수 22일」)은 **아예 안 들어왔다**
     · 카톡·문자를 메일로 전달한 것도 못 썼다
     · 「이 자료가 무슨 메일로 왔나」를 급여데이터함에서 볼 수 없었다

   담는 방식: 본문을 **창고에 .txt 로** 담는다. 그러면 원본 보존·뷰어·서랍·휴지통·
   보유기간이 손댈 것 없이 그대로 돈다(RTDB 얇은 칸에 긴 글을 넣지 않는다).
   대표 결정: **첨부 없는 메일**에만 본문 줄을 만든다 — 첨부까지 있는 메일마다
   줄을 하나 더 만들면 대기 칸이 두 배가 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MR = require(path.join(R, 'functions', 'mail-receive.js'));
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ══════ 본문 뽑기 ══════ */

test('★ 글자 본문을 그대로 쓴다', () => {
  const t = MR.bodyTextOf({ text: '이번달 김철수 22일 나왔습니다.\n연장 12시간입니다.' });
  assert.match(t, /김철수 22일/);
  assert.match(t, /연장 12시간/);
});

test('★ 글자 본문이 없으면 HTML 에서 태그를 걷어내고 쓴다', () => {
  const t = MR.bodyTextOf({ html: '<p>김철수 <b>22일</b></p><div>연장 12</div>' });
  assert.match(t, /김철수 22일/);
  assert.match(t, /연장 12/);
  assert.equal(/<[a-z]/i.test(t), false, '태그가 남아 있습니다');
});

test('글자 본문이 있으면 HTML 은 안 본다 — 두 벌이면 글자가 더 깨끗하다', () => {
  const t = MR.bodyTextOf({ text: '깨끗한 글자', html: '<p>지저분한 <span>태그</span></p>' });
  assert.equal(t, '깨끗한 글자');
});

test('★ HTML 의 줄바꿈·문단을 살린다 — 한 줄로 뭉치면 표를 못 읽는다', () => {
  const t = MR.bodyTextOf({ html: '김철수 22<br>이영희 21<br>박민수 19' });
  const lines = t.split('\n').filter(Boolean);
  assert.equal(lines.length, 3, '줄이 안 갈라졌습니다: ' + JSON.stringify(t));
});

test('HTML 특수문자를 되돌린다', () => {
  const t = MR.bodyTextOf({ html: '<p>&lt;급여&gt; &amp; 근태&nbsp;자료</p>' });
  assert.match(t, /<급여> & 근태 ?자료/);
});

test('★ 너무 긴 본문은 자르고 그렇다고 적는다', () => {
  const long = '가'.repeat(30000);
  const t = MR.bodyTextOf({ text: long });
  assert.ok(t.length < 30000, '안 잘랐습니다: ' + t.length);
  assert.match(t, /잘랐|줄임/, '잘랐다는 말이 없으면 사람이 다 담긴 줄 압니다');
});

test('빈 본문·없는 본문은 빈 글자다', () => {
  assert.equal(MR.bodyTextOf({}), '');
  assert.equal(MR.bodyTextOf(null), '');
  assert.equal(MR.bodyTextOf({ text: '   \n  ' }), '');
});

/* ══════ 담을 만한 본문인가 ══════ */

test('★ 인사말만 있는 본문은 안 담는다 — 대기 칸이 쓰레기로 찬다', () => {
  assert.equal(MR.okBody('감사합니다').ok, false);
  assert.equal(MR.okBody('네').ok, false);
  assert.equal(MR.okBody('').ok, false);
});

test('★ 사람 이름과 숫자가 있으면 담는다', () => {
  assert.equal(MR.okBody('이번달 김철수 22일 나왔습니다. 연장 12시간').ok, true);
});

test('숫자가 아예 없는 줄글은 안 담는다 — 값으로 만들 것이 없다', () => {
  /* 「자료 보내드립니다」 같은 인사말이 대부분이다. 숫자가 하나도 없으면
     값이 될 것이 없으니 대기 칸에 줄을 만들지 않는다. */
  assert.equal(MR.okBody('안녕하세요 자료 보내드립니다 확인 부탁드립니다').ok, false);
});

/* ══════ 본문 파일 이름 ══════ */

test('★ 파일 이름에 메일 제목을 쓴다 — 사람이 보는 이름이다', () => {
  const n = MR.bodyFilename('8월 근태자료입니다');
  assert.match(n, /8월 근태자료입니다/);
  assert.match(n, /\.txt$/);
});

test('제목이 없으면 「메일 본문」으로 둔다', () => {
  assert.match(MR.bodyFilename(''), /메일 본문/);
});

test('★ 파일 이름에 못 쓰는 글자를 걷어낸다', () => {
  const n = MR.bodyFilename('8/9월 자료: <급여> "확인"');
  assert.equal(/[\\/:*?"<>|]/.test(n), false, '창고에서 못 쓰는 글자가 남았습니다: ' + n);
});

test('아주 긴 제목은 자른다', () => {
  const n = MR.bodyFilename('가'.repeat(300));
  assert.ok(n.length <= 120, '이름이 너무 깁니다: ' + n.length);
});

/* ══════ 서버 배선 ══════ */

test('★ 첨부가 하나도 안 담긴 메일은 본문으로 한 줄 만든다', () => {
  const i = FN.indexOf('async function runPaydataMailOnce');
  const body = FN.slice(i, FN.indexOf('exports.receivePaydataMail'));
  assert.match(body, /bodyTextOf\(/, '본문을 안 씁니다');
  assert.match(body, /okBody\(/, '담을 만한 본문인지 안 가립니다');
  /* 첨부가 담겼으면 본문 줄을 또 만들지 않는다 — 대기 칸이 두 배가 된다 */
  assert.match(body, /payMailStoreBody\(/, '본문을 담는 곳이 없습니다');
});

test('★ 본문도 창고에 담는다 — RTDB 얇은 칸에 긴 글을 넣지 않는다', () => {
  const i = FN.indexOf('async function payMailStoreBody');
  assert.ok(i > 0, 'payMailStoreBody 가 없습니다');
  const body = FN.slice(i, i + 1600);
  assert.match(body, /bucket\.file\(/, '창고에 안 담습니다');
  assert.match(body, /text\/plain/, '글자 파일로 담아야 뷰어·판독이 그대로 돕니다');
});

test('★ 본문 줄도 담당자에게 갈라 보낸다 — 첨부와 같은 길', () => {
  const i = FN.indexOf('async function payMailStoreBody');
  const body = FN.slice(i, i + 1600);
  assert.match(body, /routeFor\(/, '본문 줄은 임자를 안 찾습니다');
});
