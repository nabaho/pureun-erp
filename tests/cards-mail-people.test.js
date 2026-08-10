/* 받는사람 자동 찾기 — 명함 6천 장에서 사람을 골라 주는 층.
   틀리면 엉뚱한 사람에게 자료가 나간다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ── 받는사람 자동 찾기 ──';
  const b = '/* ── 보낸 기록 ──';
  const i = src.indexOf(a), j = src.indexOf(b, i);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON, Math, RegExp,
    /* 파일 위쪽에 있는 것과 같은 정의 — 소문자로 다듬고 공백을 지운다 */
    normEmail: v => String(v||'').trim().toLowerCase() };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

/* ⚠ vm 안에서 만든 배열은 바깥과 다른 Array.prototype 을 쓴다.
   deepStrictEqual 은 그것까지 견주므로 값이 같아도 틀렸다고 한다. JSON 으로 맞춘다. */
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

const PEOPLE = {
  a:{id:'a', name:'권형하', company:'한국공인노무사회', email:'370-6@hanmail.net'},
  b:{id:'b', name:'강태민', company:'주식회사 에스에이피', email:'tm.kang@sacfurnace.com'},
  c:{id:'c', name:'강기령', company:'', email:''},
  d:{id:'d', name:'박민서', company:'주식회사 에스에이씨', email:'ms.park@sacfurnace.com'}
};

test('이름으로 찾는다', () => {
  const c = load();
  same(c.findPeople(PEOPLE,'권형하',8).map(x=>x.id), ['a']);
});

test('회사로도 찾는다', () => {
  const c = load();
  same(c.findPeople(PEOPLE,'에스에이피',8).map(x=>x.id), ['b']);
});

test('이메일로도 찾는다', () => {
  const c = load();
  same(c.findPeople(PEOPLE,'sacfurnace',8).map(x=>x.id).sort(), ['b','d']);
});

test('띄어쓰기는 무시한다 — 「주식회사 에스에이피」를 붙여 쳐도 찾는다', () => {
  const c = load();
  same(c.findPeople(PEOPLE,'주식회사에스에이피',8).map(x=>x.id), ['b']);
});

test('이메일 없는 사람도 보여 준다 — 안 보이면 명함첩에 없는 줄 안다', () => {
  const c = load();
  const ids = c.findPeople(PEOPLE,'강',8).map(x=>x.id);
  assert.ok(ids.includes('c'), '이메일 없는 강기령도 나와야 한다');
});

test('이메일 있는 사람이 먼저 나온다 — 골라도 못 보내는 사람이 위에 있으면 안 된다', () => {
  const c = load();
  const ids = c.findPeople(PEOPLE,'강',8).map(x=>x.id);
  assert.equal(ids[0], 'b', '이메일 있는 강태민이 먼저');
  assert.equal(ids[ids.length-1], 'c', '이메일 없는 강기령이 뒤');
});

test('빈 말로는 아무도 안 찾는다 — 6천 장이 통째로 쏟아지면 안 된다', () => {
  const c = load();
  same(c.findPeople(PEOPLE,'',8), []);
  same(c.findPeople(PEOPLE,'   ',8), []);
});

test('몇 명까지만 보여 준다', () => {
  const c = load();
  const many = {};
  for(let i=0;i<50;i++) many['k'+i] = {id:'k'+i, name:'김사람'+i, email:'k'+i+'@b.com'};
  assert.equal(c.findPeople(many,'김사람',8).length, 8);
});

test('없는 사람을 찾으면 빈 목록', () => {
  const c = load();
  same(c.findPeople(PEOPLE,'없는이름',8), []);
  same(c.findPeople(null,'권',8), []);
});

/* ── 적어 넣은 글에서 주소 뽑기 ── */

test('「홍길동 <a@b.com>」처럼 적어도 주소를 알아본다', () => {
  const c = load();
  assert.equal(c.pickEmail('홍길동 <hong@example.com>'), 'hong@example.com');
  assert.equal(c.pickEmail('  hong@example.com  '), 'hong@example.com');
  assert.equal(c.pickEmail(''), '');
});
