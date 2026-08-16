'use strict';
/* 홈페이지에 붙여넣을 글자 만들기.
   지금 홈페이지는 줄바꿈이 <br /> 로 나오므로 기본은 줄바꿈만이다.
   줄이 붙어버리는 경우를 대비해 감싸는 방식도 고를 수 있게 둔다.
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
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-export.js'), 'utf8'), ctx);
  return ctx.globalThis.PuHomeExport;
}
const E = load();

test('기본은 줄바꿈으로만 잇는다', () => {
  const t = E.careersText(['現 가', '前 나']);
  assert.equal(t, '現 가\n前 나');
});

test('감싸기를 고르면 줄마다 감싼다', () => {
  const t = E.careersText(['現 가', '前 나'], 'div');
  assert.equal(t, '<div>現 가</div>\n<div>前 나</div>');
});

test('빈 줄은 버린다', () => {
  assert.equal(E.careersText(['現 가', '', '  ', '前 나']), '現 가\n前 나');
});

test('찌꺼기 태그는 넣지 않는다', () => {
  const t = E.careersText(['<div>現 가', '前 나']);
  assert.ok(!/</.test(t), '들어온 태그를 그대로 흘려보내면 안 된다');
});

test('구성원 편집 주소를 만든다', () => {
  assert.equal(E.editUrl('member', '190'),
    'https://xn--o80bs5mdnbm0bf80anms.kr/index.php?mid=people_board&act=dispBoardWrite&document_srl=190');
});

test('쪽 편집은 홈페이지 관리자 화면으로 보낸다', () => {
  assert.match(E.editUrl('page', 'work1'), /^https:\/\/xn--o80bs5mdnbm0bf80anms\.kr\/admin/);
});
