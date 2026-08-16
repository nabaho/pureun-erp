'use strict';
/* 주민등록번호 가림 — 계산 검사. 실행: node --test tests/*.test.js
   설계서: docs/superpowers/specs/2026-08-15-주민번호-가림-design.md
   ⚠ 여기가 틀리면 **엉뚱한 자리가 덮이고 주민번호는 그대로 남는다.**
     화면은 사진을 줄여 보여 주므로 화면 좌표를 그대로 쓰면 안 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-rrn-mask.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-rrn-mask.js' }).runInContext(sandbox);
  return sandbox.window.PuRrnMask;
}

test('★ 화면에서 그은 사각형이 비율로 담긴다 — 창 크기가 바뀌어도 같은 자리를 가리킨다', () => {
  const M = load();
  const b = M.rectFromDrag(100, 50, 300, 150, 400, 200);
  assert.equal(b.x, 0.25);
  assert.equal(b.y, 0.25);
  assert.equal(b.w, 0.5);
  assert.equal(b.h, 0.5);
});

test('거꾸로 그어도(오른쪽 아래 → 왼쪽 위) 같은 사각형이 된다', () => {
  const M = load();
  const a = M.rectFromDrag(100, 50, 300, 150, 400, 200);
  const b = M.rectFromDrag(300, 150, 100, 50, 400, 200);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('★ 화면 밖으로 끌고 나가도 사진 안으로 잘린다', () => {
  const M = load();
  const b = M.rectFromDrag(-50, -50, 500, 400, 400, 200);
  assert.equal(b.x, 0);
  assert.equal(b.y, 0);
  assert.equal(b.w, 1);
  assert.equal(b.h, 1);
});

test('★ 점만 찍은 것은 사각형이 아니다 — 「3군데 가림」이 거짓말이 되면 안 된다', () => {
  const M = load();
  assert.equal(M.rectFromDrag(100, 50, 100, 50, 400, 200), null);
  assert.equal(M.rectFromDrag(100, 50, 101, 51, 400, 200), null);
});

test('화면 크기를 모르면 사각형을 만들지 않는다', () => {
  const M = load();
  assert.equal(M.rectFromDrag(0, 0, 10, 10, 0, 200), null);
});

test('★ 비율 사각형이 원본 픽셀로 바뀐다 — 화면 크기가 아니라 원본 크기로 칠해야 한다', () => {
  const M = load();
  const p = M.toPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 4000, 2000);
  assert.equal(JSON.stringify(p), JSON.stringify({ x: 1000, y: 1000, w: 2000, h: 500 }));
});

test('사진 밖으로 넘치는 사각형은 사진 안에서 끝난다', () => {
  const M = load();
  const p = M.toPixels({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 1000, 1000);
  assert.equal(p.x + p.w, 1000);
  assert.equal(p.y + p.h, 1000);
});

/* 캔버스를 가짜로 세워 **무엇을 어디에 칠했는지** 본다.
   진짜 캔버스는 node 에 없고, 있어도 픽셀을 하나하나 보는 검사는 느리고 잘 깨진다. */
function fakeCanvas() {
  const calls = { drew: null, fills: [], style: null, out: null };
  const ctx = {
    drawImage(img, x, y, w, h) { calls.drew = { x, y, w, h }; },
    fillRect(x, y, w, h) { calls.fills.push({ x, y, w, h }); },
    set fillStyle(v) { calls.style = v; },
    get fillStyle() { return calls.style; }
  };
  const make = (w, h) => ({
    width: w, height: h,
    getContext: () => ctx,
    toDataURL: (type, q) => { calls.out = { type, q }; return 'data:image/jpeg;base64,ZZZ'; }
  });
  return { calls, make };
}

const IMG = { naturalWidth: 2000, naturalHeight: 1000 };

test('★ 원본 크기 그대로 그린다 — 화면 크기로 그리면 가린 자리가 어긋난다', () => {
  const M = load();
  const { calls, make } = fakeCanvas();
  M.maskToDataUrl(IMG, [], { makeCanvas: make });
  assert.equal(JSON.stringify(calls.drew), JSON.stringify({ x: 0, y: 0, w: 2000, h: 1000 }));
});

test('★ 사각형 자리를 까맣게 칠한다', () => {
  const M = load();
  const { calls, make } = fakeCanvas();
  M.maskToDataUrl(IMG, [{ x: 0.5, y: 0.25, w: 0.25, h: 0.5 }], { makeCanvas: make });
  assert.equal(calls.style, '#000', '반투명하게 덮으면 밑이 비쳐 읽힙니다');
  assert.equal(calls.fills.length, 1);
  assert.equal(JSON.stringify(calls.fills[0]), JSON.stringify({ x: 1000, y: 250, w: 500, h: 500 }));
});

test('사각형 여러 개를 다 칠한다', () => {
  const M = load();
  const { calls, make } = fakeCanvas();
  M.maskToDataUrl(IMG, [
    { x: 0, y: 0, w: 0.1, h: 0.1 },
    { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }
  ], { makeCanvas: make });
  assert.equal(calls.fills.length, 2);
});

test('넓이가 0인 사각형은 칠하지 않는다', () => {
  const M = load();
  const { calls, make } = fakeCanvas();
  M.maskToDataUrl(IMG, [{ x: 0.5, y: 0.5, w: 0, h: 0.5 }], { makeCanvas: make });
  assert.equal(calls.fills.length, 0);
});

test('JPEG 로 뽑는다 — 사진이라 PNG 면 쓸데없이 크다', () => {
  const M = load();
  const { calls, make } = fakeCanvas();
  const out = M.maskToDataUrl(IMG, [], { makeCanvas: make });
  assert.equal(calls.out.type, 'image/jpeg');
  assert.match(out, /^data:image\/jpeg;base64,/);
});

test('★ 사진 크기를 모르면 조용히 넘기지 않고 알린다 — 안 가려진 사진이 나가면 안 된다', () => {
  const M = load();
  const { make } = fakeCanvas();
  assert.throws(() => M.maskToDataUrl({ naturalWidth: 0, naturalHeight: 0 }, [], { makeCanvas: make }),
    /크기/);
});
