'use strict';
// js/pu-photo-queue.js 단위 검사 — 실행: node --test tests/*.test.js
// 업로드 대기열: 사진을 먼저 기기(IndexedDB)에 담고, 올라간 뒤에만 지운다.
// 여기서는 가짜 idb·가짜 타이머·가짜 저장 함수만 쓴다 — 실서버에 절대 안 붙는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadQueue() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-queue.js'), 'utf8');
  const sandbox = { window: {}, console, setTimeout };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-photo-queue.js' }).runInContext(sandbox);
  return sandbox.window.PuPhotoQueue;
}

// 기기 저장 흉내 — Map 하나.
function fakeIdb(pre) {
  const m = new Map();
  (pre || []).forEach(j => m.set(j.id, j));
  const calls = { put: [], del: [] };
  return {
    m, calls,
    all() { return Promise.resolve([...m.values()]); },
    put(j) { calls.put.push(j.id); m.set(j.id, j); return Promise.resolve(); },
    del(id) { calls.del.push(id); m.delete(id); return Promise.resolve(); }
  };
}

// 타이머 흉내 — 부르지 않고 모아 둔다. fire(i)로 손으로 울린다.
function fakeTimer() {
  const list = [];
  const fn = (cb, ms) => { list.push({ cb, ms }); };
  fn.list = list;
  fn.fire = i => list[i].cb();
  return fn;
}

// 대기열이 프라미스 사슬을 다 타도록 마이크로태스크를 여러 번 비운다.
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test('성공하면 기기에서 지운다 — 순서는 반드시 저장 성공 뒤', async () => {
  const Q = loadQueue();
  const idb = fakeIdb();
  const saved = [];
  const q = Q.create({ save: j => { saved.push(j.id); return Promise.resolve(); }, idb });
  await q.enqueue({ id: 'a', full: 'x' });
  await settle();
  assert.deepEqual(saved, ['a']);
  assert.equal(idb.m.size, 0, '올라간 사진이 기기에 남아 있습니다');
  assert.equal(q.jobs[0].state, 'done');
  // 담기(put)가 지우기(del)보다 먼저였는지 — 반대면 실패한 사진이 사라진다.
  assert.deepEqual(idb.calls.put, ['a']);
  assert.deepEqual(idb.calls.del, ['a']);
});

test('실패하면 기기에 남고, 5초 뒤 다시 시도한다', async () => {
  const Q = loadQueue();
  const idb = fakeIdb();
  const timer = fakeTimer();
  let tries = 0;
  const q = Q.create({
    save: () => { tries++; return tries === 1 ? Promise.reject(new Error('신호 없음')) : Promise.resolve(); },
    idb, setTimeout: timer
  });
  await q.enqueue({ id: 'a' });
  await settle();
  assert.equal(q.jobs[0].state, 'retry');
  assert.equal(idb.m.size, 1, '실패한 사진이 기기에서 사라졌습니다');
  assert.equal(idb.calls.del.length, 0, '실패했는데 지우기를 시도했습니다');
  assert.equal(timer.list[0].ms, 5000);
  timer.fire(0);
  await settle();
  assert.equal(q.jobs[0].state, 'done');
  assert.equal(idb.m.size, 0);
});

test('실패가 거듭되면 점점 길게 기다린다 (5초 → 10초 → 20초)', async () => {
  const Q = loadQueue();
  const timer = fakeTimer();
  let tries = 0;
  const q = Q.create({
    save: () => { tries++; return tries <= 3 ? Promise.reject(new Error('신호 없음')) : Promise.resolve(); },
    idb: fakeIdb(), setTimeout: timer
  });
  await q.enqueue({ id: 'a' });
  await settle();
  timer.fire(0); await settle();
  timer.fire(1); await settle();
  timer.fire(2); await settle();
  assert.deepEqual(timer.list.map(t => t.ms), [5000, 10000, 20000]);
  assert.equal(q.jobs[0].state, 'done');
});

test('앱을 다시 열면 기기에 남은 사진을 이어서 올린다', async () => {
  const Q = loadQueue();
  const idb = fakeIdb([{ id: 'old1', tries: 2 }, { id: 'old2' }]);
  const saved = [];
  const q = Q.create({ save: j => { saved.push(j.id); return Promise.resolve(); }, idb });
  await q.resume();
  await settle();
  assert.deepEqual(saved.sort(), ['old1', 'old2']);
  assert.equal(idb.m.size, 0);
});

test('한 번에 하나씩, 넣은 순서대로 올린다', async () => {
  const Q = loadQueue();
  const order = [];
  let running = 0, maxRunning = 0;
  const q = Q.create({
    save: j => {
      running++; maxRunning = Math.max(maxRunning, running); order.push(j.id);
      return new Promise(res => setImmediate(() => { running--; res(); }));
    },
    idb: fakeIdb()
  });
  await q.enqueue({ id: '1' });
  await q.enqueue({ id: '2' });
  await q.enqueue({ id: '3' });
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(order, ['1', '2', '3']);
  assert.equal(maxRunning, 1, '동시에 여러 장을 올렸습니다 — 폰 회선에서 서로를 굶깁니다');
});

test('retryNow — 신호가 돌아오면 기다리지 않고 바로 다시 시도한다', async () => {
  const Q = loadQueue();
  const timer = fakeTimer();
  let tries = 0;
  const q = Q.create({
    save: () => { tries++; return tries === 1 ? Promise.reject(new Error('신호 없음')) : Promise.resolve(); },
    idb: fakeIdb(), setTimeout: timer
  });
  await q.enqueue({ id: 'a' });
  await settle();
  assert.equal(q.jobs[0].state, 'retry');
  q.retryNow(); // online 이벤트가 부른다
  await settle();
  assert.equal(q.jobs[0].state, 'done');
  // 나중에 예약된 타이머가 울려도 이미 끝난 일을 다시 올리지 않는다.
  timer.fire(0);
  await settle();
  assert.equal(tries, 2);
});

test('상태가 바뀔 때마다 onChange로 알려준다', async () => {
  const Q = loadQueue();
  const states = [];
  const q = Q.create({
    save: () => Promise.resolve(),
    idb: fakeIdb(),
    onChange: list => states.push(list.map(j => j.state).join(','))
  });
  await q.enqueue({ id: 'a' });
  await settle();
  assert.ok(states.includes('wait') || states.includes('up'), '올리기 전 상태가 안 왔습니다: ' + JSON.stringify(states));
  assert.equal(states[states.length - 1], 'done');
});
