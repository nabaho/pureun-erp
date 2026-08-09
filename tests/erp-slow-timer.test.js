'use strict';
// 느린 타이머 이름표가 제대로 씌워지는지 — node --test tests/erp-slow-timer.test.js
//
// 이 토막은 앱 코드보다 먼저 돌아 setInterval/setTimeout 에 껍질을 씌운다.
// 잘못 씌우면 타이머가 통째로 죽어 앱이 멈추므로, 통과·인수·id 를 실제로 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function load(nowSeq) {
  const from = app.indexOf('/* 느린 타이머 이름표');
  const to = app.indexOf('// fb_data_changed 디바운스');
  assert.ok(from > 0 && to > from, '느린 타이머 토막을 찾을 수 없습니다');

  const warns = [], si = [], st = [];
  let i = 0;
  const sandbox = {
    console: { warn(...a) { warns.push(a.join(' ')); }, log() {} },
    performance: { now: () => (nowSeq ? nowSeq[i++] : 0) },
    Date: { now: () => 1000000 },
    setInterval(fn, ms, ...rest) { si.push({ fn, ms, rest }); return 'IV' + si.length; },
    setTimeout(fn, ms, ...rest) { st.push({ fn, ms, rest }); return 'TO' + st.length; }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(app.slice(from, to), sandbox);
  return { sandbox, warns, si, st };
}

test('타이머 id 를 그대로 돌려준다 (clearInterval 이 살아 있어야 한다)', () => {
  const t = load();
  assert.equal(t.sandbox.setInterval(() => {}, 30000), 'IV1');
  assert.equal(t.sandbox.setTimeout(() => {}, 5000), 'TO1');
});

test('원래 함수가 그대로 불린다 — 인수와 this 까지', () => {
  const t = load([0, 1]);
  let got = null;
  t.sandbox.setInterval(function (a, b) { got = [this && this.tag, a, b]; }, 10, 'x', 'y');
  const reg = t.si[0];
  assert.deepEqual(reg.rest, ['x', 'y'], '뒤 인수가 그대로 넘어가야 한다');
  reg.fn.call({ tag: 'me' }, 'x', 'y');
  assert.deepEqual(got, ['me', 'x', 'y']);
});

test('돌려주는 값을 삼키지 않는다', () => {
  const t = load([0, 1]);
  t.sandbox.setTimeout(() => 42, 10);
  assert.equal(t.st[0].fn(), 42);
});

test('오래 걸리면 이름표를 찍는다', () => {
  const t = load([0, 850]);
  t.sandbox.setInterval(function heartbeat() { }, 30000);
  t.si[0].fn();
  assert.equal(t.warns.length, 1);
  assert.match(t.warns[0], /느린 setInterval\(30000ms 주기\)/);
  assert.match(t.warns[0], /850ms 걸림/);
  assert.match(t.warns[0], /heartbeat/, '어느 함수인지 본문이 함께 나와야 한다');
});

test('빠르면 아무것도 안 찍는다 (평소에 시끄럽지 않게)', () => {
  const t = load([0, 30]);
  t.sandbox.setInterval(() => {}, 30000);
  t.si[0].fn();
  assert.equal(t.warns.length, 0);
});

test('같은 타이머가 30초마다 계속 찍히지 않는다 (5초에 하나)', () => {
  const t = load([0, 900, 0, 900]);
  t.sandbox.setInterval(function beat() {}, 30000);
  t.si[0].fn();
  t.si[0].fn();
  assert.equal(t.warns.length, 1, '같은 본문은 5초 안에 한 번만');
});

test('함수가 아닌 것(문자열 타이머)은 건드리지 않는다', () => {
  const t = load();
  t.sandbox.setTimeout('doThing()', 10);
  assert.equal(t.st[0].fn, 'doThing()');
});

test('안에서 터져도 원래대로 위로 던진다 (오류를 삼키지 않는다)', () => {
  const t = load([0, 5]);
  t.sandbox.setInterval(() => { throw new Error('펑'); }, 10);
  assert.throws(() => t.si[0].fn(), /펑/);
});

test('앱 코드보다 먼저 놓여 있다 (나중이면 이미 등록된 타이머를 못 잡는다)', () => {
  const hook = app.indexOf('/* 느린 타이머 이름표');
  const firstInterval = app.indexOf('setInterval(checkSelfStatus, 30000)');
  assert.ok(hook > 0 && firstInterval > hook, '이름표가 첫 타이머 등록보다 앞에 있어야 한다');
});
