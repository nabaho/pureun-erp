'use strict';
/* 회차 번호 — 한 해에 두 번 개정한 사업장이 서로를 덮어쓰면 안 된다

   설계서 §8: 같은 연도 두 건은 자동으로 합치지 않고 2022 / 2022-2 로 두고
   사람이 판단한다. 자동 병합은 되돌리기가 어렵다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

test('★ 그 해가 비어 있으면 연도 그대로', () => {
  assert.equal(CB.revIdOf(2022, []), '2022');
  assert.equal(CB.revIdOf('2022', ['2019', '2025']), '2022');
});

test('★ 이미 있으면 -2, 또 있으면 -3', () => {
  assert.equal(CB.revIdOf(2022, ['2022']), '2022-2');
  assert.equal(CB.revIdOf(2022, ['2022', '2022-2']), '2022-3');
  assert.equal(CB.revIdOf(2022, ['2022', '2022-2', '2022-3']), '2022-4');
});

test('중간이 비어 있어도 빈자리를 메우지 않는다 — 번호는 뒤로만 간다', () => {
  assert.equal(CB.revIdOf(2022, ['2022', '2022-3']), '2022-4',
    '2022-2 를 되쓰면 지운 회차의 파일과 뒤섞일 수 있습니다');
});

test('다른 연도는 서로 간섭하지 않는다', () => {
  assert.equal(CB.revIdOf(2023, ['2022', '2022-2']), '2023');
});

test('연도가 없으면 「연도미상」으로 둔다 — 조용히 올해로 바꾸지 않는다', () => {
  assert.equal(CB.revIdOf('', []), '연도미상');
  assert.equal(CB.revIdOf(null, ['연도미상']), '연도미상-2');
});

test('목록이 없어도 터지지 않는다', () => {
  assert.equal(CB.revIdOf(2022, null), '2022');
  assert.equal(CB.revIdOf(2022, undefined), '2022');
});
