'use strict';
/* 홈페이지 읽기 — 허용된 쪽만 읽는다.
   함수가 아무 주소나 읽어주면 남의 서버를 대신 두드리는 통로가 된다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { homepageUrl } = require('../functions/homepage-fetch');

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
