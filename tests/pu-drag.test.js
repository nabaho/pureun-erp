'use strict';
// js/pu-drag.js 단위 검사 — 실행: node --test tests/*.test.js
//
// 앱 사이로 사진·명함을 끌어다 놓는 공용 규약. 여기서는 가짜 dataTransfer 만 쓴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDrag() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-drag.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-drag.js' }).runInContext(sandbox);
  return sandbox.window.PuDrag;
}

// 브라우저 dataTransfer 흉내 — 종류별로 값을 담는다.
function fakeDT() {
  const bag = {};
  return {
    types: [],
    effectAllowed: '',
    dropEffect: '',
    setData(t, v) { bag[t] = String(v); if (this.types.indexOf(t) < 0) this.types.push(t); },
    getData(t) { return bag[t] || ''; },
    setDragImage() { this.imaged = true; }
  };
}

const REF = { app: 'pu-photos', kind: 'photo', year: '2026', owner: 'U1', id: 'p1', name: '현장사진.jpg' };

test('끌어놓기 층이 window에 붙는다', () => {
  assert.ok(loadDrag(), 'window.PuDrag 가 없습니다');
});

test('사진을 끌면 표만 담는다 — 사진 자체를 담지 않는다', () => {
  // base64 를 dataTransfer 로 넘기면 크기 제한에 걸리고 창을 넘길 때 깨진다.
  // 받는 쪽이 이 표로 사진을 직접 가져온다.
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, REF);
  const raw = dt.getData('text/plain');
  assert.ok(raw.length < 500, '담은 값이 너무 큽니다 — 사진을 넣었습니까? ' + raw.length);
  assert.ok(raw.indexOf('data:image') < 0, '사진 자체가 담겼습니다');
  assert.ok(raw.indexOf('p1') >= 0);
});

test('우리 것임을 알아볼 수 있게 두 가지로 담는다', () => {
  // dragover 중에는 값을 읽을 수 없고 **종류 목록만** 볼 수 있다(브라우저 규칙).
  // 그래서 우리 전용 종류를 하나 넣어 둔다. 창을 넘길 때 그 종류가 사라지는
  // 브라우저도 있어 text/plain 에도 같은 값을 담는다.
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, REF);
  assert.ok(dt.types.indexOf('text/plain') >= 0, 'text/plain 이 없습니다');
  assert.ok(dt.types.indexOf(D.TYPE) >= 0, '전용 종류가 없습니다');
  assert.equal(dt.getData(D.TYPE), dt.getData('text/plain'), '두 곳의 값이 다릅니다');
});

test('읽기 — 우리가 담은 것을 그대로 돌려준다', () => {
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, REF);
  const got = D.read(dt);
  assert.ok(got, '읽지 못했습니다');
  assert.equal(got.id, 'p1');
  assert.equal(got.owner, 'U1');
  assert.equal(got.year, '2026');
  assert.equal(got.app, 'pu-photos');
});

test('읽기 — 전용 종류가 사라져도 text/plain 으로 읽어낸다', () => {
  // 창을 넘길 때 전용 종류가 사라지는 브라우저가 있다. 그래도 동작해야 한다.
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, REF);
  const only = fakeDT();
  only.setData('text/plain', dt.getData('text/plain'));
  assert.equal(D.read(only).id, 'p1');
});

test('읽기 — 우리 것이 아니면 null (엉뚱한 것을 받지 않는다)', () => {
  const D = loadDrag();
  const a = fakeDT(); a.setData('text/plain', '그냥 글자');
  assert.equal(D.read(a), null);
  const b = fakeDT(); b.setData('text/plain', 'pureun-drag:v1:{망가진');
  assert.equal(D.read(b), null);
  const c = fakeDT();
  assert.equal(D.read(c), null);
  assert.equal(D.read(null), null);
});

test('읽기 — 사진 번호가 없으면 받지 않는다', () => {
  // 번호가 없으면 가져올 수 없다. 빈 것을 받아 빈 칸을 만들면 안 된다.
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, { app: 'pu-photos', kind: 'photo', year: '2026', owner: 'U1' });
  assert.equal(D.read(dt), null);
});

test('끌고 오는 중에는 종류만 보고 우리 것인지 가린다', () => {
  const D = loadDrag();
  const mine = fakeDT();
  D.set(mine, REF);
  assert.equal(D.maybeOurs(mine), true);
  // 전용 종류가 없어도 글자를 끌고 오는 것이면 일단 받아 본다(놓을 때 다시 가린다)
  const textOnly = fakeDT(); textOnly.setData('text/plain', '무언가');
  assert.equal(D.maybeOurs(textOnly), true);
  // 파일을 끌고 오는 것은 우리 규약이 아니다 — 각 앱의 파일 받기가 처리한다
  const files = fakeDT(); files.types.push('Files');
  assert.equal(D.maybeOurs(files), false);
  assert.equal(D.maybeOurs(null), false);
});

test('끄는 쪽 효과는 복사다 — 원본을 옮기지 않는다', () => {
  // 사진첩 사진은 그대로 남고, 받는 앱이 사본을 갖는다(설계서 원칙).
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, REF);
  assert.equal(dt.effectAllowed, 'copy');
});

test('명함도 같은 규약으로 넘긴다', () => {
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, { app: 'pu-cards', kind: 'card', id: 'c1', name: '홍길동' });
  const got = D.read(dt);
  assert.equal(got.kind, 'card');
  assert.equal(got.app, 'pu-cards');
  assert.equal(got.id, 'c1');
});

test('사람이 읽을 이름이 함께 간다 — 무엇을 놓았는지 알려주려고', () => {
  const D = loadDrag();
  const dt = fakeDT();
  D.set(dt, REF);
  assert.equal(D.read(dt).name, '현장사진.jpg');
  assert.match(D.label(D.read(dt)), /현장사진/);
  // 이름이 없어도 무엇인지는 말해준다
  const dt2 = fakeDT();
  D.set(dt2, { app: 'pu-photos', kind: 'photo', year: '2026', owner: 'U1', id: 'x' });
  assert.ok(D.label(D.read(dt2)).length > 0);
});
