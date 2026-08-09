/* 편지 쓰기 — 보내기 전에 막아야 하는 것.
   서버도 같은 것을 다시 보지만, 여기서 걸러야 사람이 기다린 뒤에 실패를 알지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ── 편지 쓰기 ──';
  const b = '/* ── 보낸 기록 ──';
  const i = src.indexOf(a), j = src.indexOf(b, i);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON, Math, RegExp };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  ctx.read = e => vm.runInContext(e, ctx);
  return ctx;
}

const OK = { to:'hong@example.com', subject:'제목', body:'본문', bytes:0 };

test('첨부 크기는 고른 자료를 모두 더한다', () => {
  const c = load();
  const meta = { a:{size:1000}, b:{size:2500}, c:{size:9} };
  assert.equal(c.attachTotal(['a','b'], meta), 3500);
  assert.equal(c.attachTotal([], meta), 0);
  assert.equal(c.attachTotal(['없는것'], meta), 0, '지워진 자료는 0 으로 센다');
  assert.equal(c.attachTotal(null, null), 0);
});

test('받는 사람이 없으면 못 보낸다', () => {
  const c = load();
  const r = c.composeCheck({ ...OK, to:'   ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /받는 사람/);
});

test('주소 형식이 아니면 못 보낸다', () => {
  const c = load();
  assert.equal(c.composeCheck({ ...OK, to:'홍길동' }).ok, false);
  assert.equal(c.composeCheck({ ...OK, to:'hong@example' }).ok, false, '점 뒤 도메인이 없다');
  assert.equal(c.composeCheck({ ...OK, to:'hong@example.com' }).ok, true);
});

test('여러 명이면 첫 주소로 형식을 본다 — 나머지는 서버가 다시 본다', () => {
  const c = load();
  assert.equal(c.composeCheck({ ...OK, to:'hong@example.com, kim@example.com' }).ok, true);
  assert.equal(c.composeCheck({ ...OK, to:'틀림, kim@example.com' }).ok, false);
});

test('제목이나 본문이 비면 못 보낸다 — 빈 편지가 고객에게 간다', () => {
  const c = load();
  assert.equal(c.composeCheck({ ...OK, subject:'  ' }).ok, false);
  assert.equal(c.composeCheck({ ...OK, body:'\n ' }).ok, false);
});

test('첨부가 너무 크면 **보내기 전에** 막는다', () => {
  const c = load();
  const max = c.read('MAIL_MAX_BYTES');
  const r = c.composeCheck({ ...OK, bytes: max + 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /첨부가 너무 큽니다/);
  assert.match(r.error, /MB/, '얼마나 큰지 사람이 알아볼 수 있게 적어야 한다');
  assert.equal(c.composeCheck({ ...OK, bytes: max }).ok, true, '딱 맞으면 보낸다');
});

test('서버가 자르는 크기와 같은 값을 쓴다 — 다르면 여기서 통과하고 서버에서 막힌다', () => {
  const c = load();
  const here = c.read('MAIL_MAX_BYTES');
  const there = require('../functions/mail-send.js').MAX_TOTAL_BYTES;
  assert.equal(here, there);
});

test('용량을 사람이 읽는 말로 적는다', () => {
  const c = load();
  assert.equal(c.fmtMB(1024*1024), '1.0MB');
  assert.equal(c.fmtMB(0), '0.0MB');
  assert.equal(c.fmtMB(null), '0.0MB');
});
