/* 업체 홈페이지 찾기 서버 함수 — 네이버 두 갈래의 «차례»와 «조건» (2026-09-03)
 *
 * ■ 지키려는 규칙
 *   ① 지역(업체) 검색을 먼저 부른다 — 주소·홈페이지가 칸으로 와서 판정이 정확하다.
 *   ② 웹문서 검색은 ①이 못 찾았을 때만 부른다 — 하루 25,000건 무료 한도를 아낀다.
 *   ③ 열쇠는 비밀값(secrets)으로만 읽고, 없으면 «설정이 안 됐다»고 분명히 말한다.
 *   ④ 구글 Custom Search 로 되돌아가지 않는다 — 신규 고객에게 닫혀 있어 403 만 난다.
 *
 * 값(어떤 URL·어떤 문구)이 아니라 «차례와 조건»을 본다 — 문구가 바뀌어도 안 깨진다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { cutFn } = require('./cut-fn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
/* runWith({…}) 의 중괄호가 먼저 나와서 함수 머리부터 자르면 거기서 끊긴다 —
   머리(runWith 까지)와 몸(onRequest 의 함수 본문)을 따로 잘라 이어 붙인다. */
const start = SRC.indexOf('exports.findCompanyWebsite');
assert.ok(start >= 0, 'findCompanyWebsite 가 없다');
const tail = SRC.slice(start);
const head = tail.slice(0, tail.indexOf('.https.onRequest'));
const body = cutFn(tail, '.https.onRequest(async (req, res) =>');
const fn = head + body;

test('★ 지역 검색을 먼저, 웹문서 검색은 그 뒤에 부른다', () => {
  const iLocal = fn.indexOf('naverSearch("local"');
  const iWeb = fn.indexOf('naverSearch("webkr"');
  assert.ok(iLocal >= 0, '지역 검색 호출이 없다');
  assert.ok(iWeb >= 0, '웹문서 검색 호출이 없다');
  assert.ok(iLocal < iWeb, '웹문서를 지역보다 먼저 부르면 정확한 쪽(주소 칸)을 버리고 덜 정확한 쪽으로 판정한다');
});

test('★★ 웹문서 검색은 지역 검색이 못 찾았을 때만 부른다 (무료 한도 아끼기)', () => {
  const iIf = fn.indexOf('if (!matched)');
  const iWeb = fn.indexOf('naverSearch("webkr"');
  assert.ok(iIf >= 0 && iIf < iWeb, '조건 없이 늘 두 번 부르면 한도를 두 배로 쓴다');
  const between = fn.slice(iIf, iWeb);
  assert.ok(!/naverSearch\("local"/.test(between), '조건 안에 지역 검색이 들어가 있으면 차례가 뒤집힌 것이다');
});

test('열쇠 둘은 비밀값으로 선언하고, 없으면 설정 안 됨을 말한다', () => {
  assert.match(fn, /secrets:\s*\[[^\]]*NAVER_SEARCH_CLIENT_ID[^\]]*NAVER_SEARCH_CLIENT_SECRET[^\]]*\]/);
  assert.match(fn, /설정되지 않았습니다/);
});

test('★ 구글 Custom Search 로 되돌아가지 않는다', () => {
  assert.ok(!/customsearch|GOOGLE_SEARCH/.test(fn), '구글 Custom Search JSON API 는 신규 고객에게 닫혀 있어 403 만 난다');
});
