/* 주석 걷는 부품이 «정말로» 걷는가
   ═══════════════════════════════════════════════════════════════════════════
   ★★ 이 검사가 왜 있나 — 2026-09-05 에 걷는 줄 알았는데 안 걷히고 있었다.
     검사 파일마다 베껴 둔 부품이 «정규식 리터럴»을 몰라서,
     `replace(/'/g, …)` 같은 줄을 만나면 그때부터 글자열 안이라 착각하고
     그 뒤의 주석을 하나도 못 걷었다.

     걷은 줄 알았으니 이빨이 있는 줄 알았고, 실제로는 «주석을 보고 통과하는»
     검사가 넷이었다. 그 뒤로는 코드에서 진짜 거르기를 빼도 검사가 통과했다.

   ⚠ 그래서 이 부품에는 «진짜 파일»로 하는 검사가 붙어야 한다.
     흉내 낸 짧은 글로만 보면 이 탈이 다시 지나간다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 주석걷기, 함수몸 } = require('./helpers/strip-comments.js');

test('여러 줄 주석과 한 줄 주석을 걷는다', () => {
  assert.ok(!/숨은말/.test(주석걷기('var a = 1; /* 숨은말 */ var b = 2;')));
  assert.ok(!/숨은말/.test(주석걷기('var a = 1; // 숨은말\nvar b = 2;')));
  assert.ok(/var b = 2/.test(주석걷기('var a = 1; /* x */ var b = 2;')));
});

test('글자열 안은 «건드리지 않는다»', () => {
  const r = 주석걷기("var a = '이것은 /* 주석이 아니다 */ 글자열';");
  assert.ok(/주석이 아니다/.test(r), '★ 글자열 속을 지웠다');
});

test('★ 정규식 안의 따옴표에 속지 않는다 — 여기가 예전에 틀린 자리다', () => {
  /* 정규식 안의 ' 를 글자열 시작으로 읽으면, 그 뒤 주석이 통째로 안 걷힌다 */
  const 글 = "var x = s.replace(/'/g, '_');\n/* 뒤에 오는 주석 */\nvar y = 1;";
  const r = 주석걷기(글);
  assert.ok(!/뒤에 오는 주석/.test(r), '★ 정규식 뒤의 주석을 못 걷었다');
  assert.ok(/var y = 1/.test(r));
});

test('정규식 대괄호 안의 빗금에 속지 않는다', () => {
  const 글 = "var x = s.replace(/[.#$/[\\]]/g, '_');\n/* 이 주석도 걷혀야 한다 */\nvar y = 1;";
  const r = 주석걷기(글);
  assert.ok(!/이 주석도/.test(r), '★ 대괄호 안 빗금을 정규식 끝으로 읽었다');
});

test('나눗셈을 정규식으로 읽지 않는다', () => {
  const r = 주석걷기('var a = b / c; var d = e / f;\n/* 주석 */\nvar g = 1;');
  assert.ok(/var d = e/.test(r), '★ 나눗셈을 정규식으로 읽어 코드를 삼켰다');
  assert.ok(!/주석/.test(r));
});

test('★★ «진짜 파일»에서 주석이 실제로 사라진다', () => {
  /* 흉내 낸 짧은 글로만 보면 이 탈이 다시 지나간다.
     그래서 이 저장소의 큰 파일들로 «실제로» 확인한다. */
  const 뿌리 = path.join(__dirname, '..');
  const 볼것 = [
    ['pu-news.html', '이 회차 것만이라 작다'],
    ['js/pu-news-core.js', '바깥을 두드리지 않는다'],
    ['functions/mail-deliver.js', '자기 손님 주소로만 보내 준다']
  ];
  볼것.forEach(function (한벌) {
    const 파일 = 한벌[0], 주석속말 = 한벌[1];
    const 원본 = fs.readFileSync(path.join(뿌리, 파일), 'utf8');
    assert.ok(원본.indexOf(주석속말) >= 0,
      파일 + ' 에 「' + 주석속말 + '」이 없다 — 검사부터 고칠 것');
    const 걷힌 = 주석걷기(원본);
    assert.ok(걷힌.indexOf(주석속말) < 0,
      '★ ' + 파일 + ' 의 주석이 안 걷혔다 — 검사가 주석을 보고 통과한다');
  });
});

test('★ 걷어도 «코드»는 남는다 — 너무 많이 지우면 그것도 탈이다', () => {
  const 뿌리 = path.join(__dirname, '..');
  const 원본 = fs.readFileSync(path.join(뿌리, 'js', 'pu-news-core.js'), 'utf8');
  const 걷힌 = 주석걷기(원본);
  ['function 열람붙이기', 'function 보낸상태', 'module.exports'].forEach(function (조각) {
    assert.ok(걷힌.indexOf(조각) >= 0, '★ 코드(' + 조각 + ')까지 지웠다');
  });
  assert.ok(걷힌.length > 원본.length * 0.3, '★ 너무 많이 지웠다');
});

test('함수 몸을 중괄호로 떼어 온다', () => {
  const s = 'function 가(){ if(1){ } return 2; }\nfunction 나(){ return 3; }';
  const 가 = 함수몸(s, '가');
  assert.ok(/return 2/.test(가));
  assert.ok(!/return 3/.test(가), '★ 다음 함수까지 물고 왔다');
  assert.equal(함수몸(s, '없는것'), null);
});
