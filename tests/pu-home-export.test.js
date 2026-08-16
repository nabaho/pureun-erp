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

/* ── 여기부터 검토 지적 고친 뒤 추가한 검사 ── */

test('한글 꺾쇠는 태그가 아니라 사람이 쓴 글자이므로 살아남는다', () => {
  const t = E.careersText(['현 (주)가나 <노무담당> 자문']);
  assert.equal(t, '현 (주)가나 <노무담당> 자문');
});

test('이름 없는 꺾쇠(부등호처럼 쓰인 것)도 살아남는다', () => {
  const t = E.careersText(['가 < 나, 다 > 라']);
  assert.equal(t, '가 < 나, 다 > 라');
});

test('진짜 찌꺼기 태그(div)는 여전히 걷힌다', () => {
  const t = E.careersText(['<div>現 가']);
  assert.ok(!/</.test(t), '<div> 는 진짜 태그이므로 걷혀야 한다');
});

test('닫는 태그·자체닫힘 태그·속성 있는 태그도 걷힌다', () => {
  assert.equal(E.careersText(['가나다</a>']), '가나다');
  assert.equal(E.careersText(['가나다<br />마바사']), '가나다마바사');
  assert.equal(E.careersText(['가나다<span class="x">마바사</span>']), '가나다마바사');
});

test('riskyLines 는 다듬은 뒤에도 꺾쇠가 남은 줄만 집어낸다', () => {
  const risky = E.riskyLines(['현 (주)가나 <노무담당> 자문', '<div>깨끗한 줄', '평범한 줄']);
  assert.deepEqual([...risky], ['현 (주)가나 <노무담당> 자문']);
});

test('riskyLines 는 멀쩡한 줄만 있으면 빈 배열을 돌려준다', () => {
  const risky = E.riskyLines(['<div>現 가', '前 나']);
  assert.deepEqual([...risky], []);
});

test('careersText 에 배열이 아니라 글자 하나가 와도 한 줄로 받아준다', () => {
  assert.equal(E.careersText('현 가'), '현 가');
});

test('editUrl 은 글 번호가 비어 있으면 null 을 돌려준다', () => {
  assert.equal(E.editUrl('member', ''), null);
  assert.equal(E.editUrl('member', null), null);
  assert.equal(E.editUrl('member', undefined), null);
});

test('editUrl 은 모르는 kind 면 null 을 돌려준다', () => {
  assert.equal(E.editUrl('없는kind', 'x'), null);
});

/* ── 여기부터 "영문자로 시작하면 태그" 판별이 틀렸음을 고친 뒤 추가한 검사 ──
   노무·인사 경력 표기에는 영문 약어를 꺾쇠로 감싸는 표기(<PM>, <HR> 등)가
   흔하다. 태그 이름이 영문자로 시작한다고 진짜 태그로 보면 이런 글자가
   통째로 사라진다. 실제 HTML 태그 이름 목록에 있는 것만 태그로 봐야 한다. */

test('영문 약어를 꺾쇠로 감싼 경력 표기는 태그가 아니므로 살아남는다', () => {
  assert.equal(E.careersText(['평가 <A등급> 우수']), '평가 <A등급> 우수');
  assert.equal(E.careersText(['현 <Team Leader> 역할']), '현 <Team Leader> 역할');
  assert.equal(E.careersText(['현 <PM> 직책 수행']), '현 <PM> 직책 수행');
  assert.equal(E.careersText(['현 <HR> 팀 근무']), '현 <HR> 팀 근무');
  assert.equal(E.careersText(['현 <노무담당> 자문']), '현 <노무담당> 자문');
});

test('알려진 이름의 진짜 HTML 태그는 대소문자 가리지 않고 걷힌다', () => {
  assert.equal(E.careersText(['<div>現 가']), '現 가');
  assert.equal(E.careersText(['가나다</div>마바사']), '가나다마바사');
  assert.equal(E.careersText(['가나다<br />마바사']), '가나다마바사');
  assert.equal(E.careersText(['<DIV>現 가</DIV>']), '現 가');
  assert.equal(E.careersText(['가나다<span class="x">마바사</span>']), '가나다마바사');
  assert.equal(E.careersText(['가나다</a>마바사']), '가나다마바사');
});

test('속성값 안의 > 때문에 태그가 중간에서 끊기지 않는다', () => {
  const t = E.careersText(['가나다<span data-y="1 > 2">라마바']);
  assert.equal(t, '가나다라마바');
  assert.ok(!/[<>]/.test(t), '속성값의 >가 찌꺼기로 남으면 안 된다');
});

test('riskyLines 는 살아남은 <PM> 같은 줄을 집어내고, 태그만 있던 줄은 안 집어낸다', () => {
  const risky = E.riskyLines(['현 <PM> 직책 수행', '<div>現 가', '평범한 줄']);
  assert.deepEqual([...risky], ['현 <PM> 직책 수행']);
});
