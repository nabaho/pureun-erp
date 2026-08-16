'use strict';
/* 홈페이지 화면 읽어내기.
   표본은 2026-08-16 에 받아둔 백업이다 — 고정된 파일이라 개수를 단정해도 된다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const BK = path.join(R, 'docs', 'homepage-backup', '2026-08-16');

function load() {
  const ctx = { window: undefined, globalThis: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-parse.js'), 'utf8'), ctx);
  return ctx.globalThis.PuHomeParse;
}
const P = load();
const people = fs.readFileSync(path.join(BK, 'people.html'), 'utf8');

test('구성원을 모두 읽어낸다', () => {
  const list = P.parseMembers(people);
  assert.equal(list.length, 9);
  // list 는 vm 컨텍스트(다른 realm)에서 만들어진 배열이라 그대로 deepEqual 하면
  // (assert/strict 에서는 deepEqual === deepStrictEqual) 값이 같아도 realm 이 달라
  // 실패한다. 전개(spread)로 이 realm 의 배열로 옮겨 비교한다 — 값·순서·엄격함은 그대로다.
  assert.deepEqual([...list.map(m => m.srl)],
    ['190', '193', '195', '197', '203', '281', '304', '320', '322']);
});

test('이름과 직책을 나눠 읽는다', () => {
  const m = P.parseMembers(people).find(x => x.srl === '190');
  assert.equal(m.name, '권형하');
  assert.equal(m.position1, '대표');
  assert.equal(m.position2, '공인노무사');
});

test('직책이 하나뿐인 사람도 읽는다', () => {
  const m = P.parseMembers(people).find(x => x.srl === '193');
  assert.equal(m.name, '박성수');
  assert.equal(m.position1, '');
  assert.equal(m.position2, '공인노무사');
});

test('경력사항을 줄 목록으로 읽고 겹공백을 정리한다', () => {
  const m = P.parseMembers(people).find(x => x.srl === '190');
  assert.equal(m.careers[0], '現 푸른노무법인대표');
  assert.ok(m.careers.length > 10);
  assert.ok(m.careers.every(line => !/<|>/.test(line)), '태그가 남아 있으면 안 된다');
  assert.ok(m.careers.every(line => line === line.trim() && !/\s{2}/.test(line)));
});

test('쪽 본문을 글자로 읽어낸다', () => {
  const work1 = fs.readFileSync(path.join(BK, 'work1.html'), 'utf8');
  const text = P.parsePageText(work1);
  assert.match(text, /법률자문/);
  assert.ok(!/<div/.test(text), '태그가 남아 있으면 안 된다');
  assert.ok(!/메뉴 건너뛰기/.test(text), '머리말·메뉴는 빠져야 한다');
});
