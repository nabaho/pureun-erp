'use strict';
/* 폴더·탭을 끌어 순서 바꾸기 — 순서 계산은 순수 함수 하나에 모은다.
   네 목록(명함폴더·기업상세폴더·메인탭·폴더안탭)이 같은 계산을 쓰므로
   여기가 틀리면 네 곳이 함께 틀린다. 그래서 경계를 촘촘히 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadReorder(){
  const at = source.indexOf('function reorderList(');
  assert.ok(at > 0, 'reorderList 를 찾지 못했습니다');
  const end = source.indexOf('\n}', at) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  return ctx;
}
const L = ['a','b','c','d'].map((id,i)=>({ id, order:i+1 }));
/* vm 안에서 만든 객체는 realm 이 달라 deepEqual 이 실패한다 — JSON 왕복으로 맞춘다
   (이 저장소의 다른 검사들과 같은 방식). */
const plain = v => JSON.parse(JSON.stringify(v));

test('위에 있던 것을 아래로 옮긴다 (a 를 c 앞으로)', () => {
  const c = loadReorder();
  const out = plain(c.reorderList(L, 'a', 'c'));
  /* 결과 순서는 b, a, c, d — 바뀐 것만 돌려준다 */
  const byId = {}; out.forEach(x=>{ byId[x.id]=x.order; });
  assert.equal(byId.b, 1);
  assert.equal(byId.a, 2);
  assert.ok(!('c' in byId) || byId.c === 3);
  assert.ok(out.every(x=>x.order>=1 && x.order<=4));
});

test('아래에 있던 것을 위로 옮긴다 (d 를 b 앞으로)', () => {
  const c = loadReorder();
  const out = plain(c.reorderList(L, 'd', 'b'));
  const byId = {}; out.forEach(x=>{ byId[x.id]=x.order; });
  assert.equal(byId.d, 2);
  assert.equal(byId.b, 3);
});

test('제자리에 놓으면 아무 것도 안 바꾼다', () => {
  const c = loadReorder();
  assert.deepEqual(plain(c.reorderList(L, 'b', 'b')), []);
});

test('목록에 없는 것을 주면 아무 것도 안 바꾼다', () => {
  const c = loadReorder();
  assert.deepEqual(plain(c.reorderList(L, 'zzz', 'b')), []);
  assert.deepEqual(plain(c.reorderList(L, 'b', 'zzz')), []);
});

test('한 개짜리 목록은 아무 것도 안 바꾼다', () => {
  const c = loadReorder();
  assert.deepEqual(plain(c.reorderList([{id:'a',order:1}], 'a', 'a')), []);
});

test('order 가 아예 없던 목록도 1..n 으로 매겨 준다', () => {
  /* 지금 폴더는 만들 때 order:Date.now() 를 받아 값이 제각각이다 */
  const c = loadReorder();
  const raw = [{id:'a'},{id:'b',order:1755300000000},{id:'c'}];
  const out = plain(c.reorderList(raw, 'c', 'a'));
  const orders = out.map(x=>x.order).sort((x,y)=>x-y);
  assert.ok(orders.every(n=>Number.isInteger(n) && n>=1 && n<=3), '1..n 정수여야 한다: '+JSON.stringify(out));
});

test('바뀌지 않은 항목은 돌려주지 않는다 (쓸데없는 저장을 안 만든다)', () => {
  const c = loadReorder();
  const already = [{id:'a',order:1},{id:'b',order:2},{id:'c',order:3}];
  const out = plain(c.reorderList(already, 'a', 'b'));
  /* a 를 b 앞에 놓으면 지금과 같은 자리다 — 바뀐 것이 없어야 한다 */
  assert.deepEqual(out, []);
});
