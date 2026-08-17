'use strict';
/* 홈페이지 읽기 — 허용된 쪽만 읽는다.
   함수가 아무 주소나 읽어주면 남의 서버를 대신 두드리는 통로가 된다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { homepageUrl, ORIGIN, BLOCKED } = require('../functions/homepage-fetch');

test('허용된 쪽은 완성된 주소를 돌려준다', () => {
  assert.equal(homepageUrl('people'),
    'https://xn--o80bs5mdnbm0bf80anms.kr/people');
  assert.equal(homepageUrl('work5a'),
    'https://xn--o80bs5mdnbm0bf80anms.kr/work5a');
});

test('앞의 빗금은 붙어 있어도 된다', () => {
  assert.equal(homepageUrl('/greeting'),
    'https://xn--o80bs5mdnbm0bf80anms.kr/greeting');
});

test('목록에 없는 쪽은 거절한다', () => {
  assert.equal(homepageUrl('admin'), null);
  assert.equal(homepageUrl('index.php?act=dispMemberLoginForm'), null);
});

test('다른 서버로 새 나가지 않는다', () => {
  assert.equal(homepageUrl('https://example.com/people'), null);
  assert.equal(homepageUrl('//example.com'), null);
  assert.equal(homepageUrl('../../etc/passwd'), null);
});

/* ══════ 2차 설계 §3 — 관리 대상 목록을 «자료»로 옮긴다 ══════
   쪽 목록이 이 파일에 박혀 있으면 홈페이지에 쪽을 새로 만들 때마다 함수를 다시 배포해야 한다.
   그래서 «목록»이 아니라 «이름 규칙»으로 가린다. 다만 이름 규칙만으로는 관리자 주소가
   통과해 버리므로 금지 목록으로 따로 막는다. */

test('★ 목록에 없던 새 쪽도 이름 규칙을 지키면 읽을 수 있다 — 함수를 다시 배포하지 않는다', () => {
  assert.equal(homepageUrl('work6'), ORIGIN + '/work6');
  assert.equal(homepageUrl('work_2026'), ORIGIN + '/work_2026');
  assert.equal(homepageUrl('/work6'), ORIGIN + '/work6');
  assert.equal(homepageUrl('a'.repeat(30)), ORIGIN + '/' + 'a'.repeat(30));
});

test('★ 이름 규칙(영문 소문자·숫자·밑줄 30자)을 벗어나면 거절한다', () => {
  ['', ' ', 'Work6', 'work 6', 'work-6', 'work.6', 'work6/', 'work6?x=1', 'work6#a',
    '한글쪽', 'a'.repeat(31), 'work6%2f', 'work%206', 'people/../admin']
    .forEach(bad => assert.equal(homepageUrl(bad), null, '「' + bad + '」 을 받아 주면 안 된다'));
});

test('★ 관리자 주소는 이름 규칙을 통과해도 «막는다»', () => {
  assert.equal(homepageUrl('admin'), null);
  assert.equal(homepageUrl('/admin'), null);
  assert.ok(Array.isArray(BLOCKED) && BLOCKED.length > 0, '금지 목록이 비어 있으면 막는 뜻이 없다');
  assert.ok(BLOCKED.indexOf('admin') >= 0, '관리자 주소가 금지 목록에 없다');
  BLOCKED.forEach(name => assert.equal(homepageUrl(name), null,
    '금지 목록에 적힌 「' + name + '」 이 통과했다'));
});

test('글자가 아닌 것을 넣어도 터지지 않고 거절한다', () => {
  [null, undefined, 0, {}, [], true].forEach(bad => assert.equal(homepageUrl(bad), null));
});
