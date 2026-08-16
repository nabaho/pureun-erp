'use strict';
/* 가릴 곳 고르기 화면 — 실행: node --test tests/*.test.js
   설계서: docs/superpowers/specs/2026-08-15-주민번호-가림-design.md */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

function loadPanel(maskState) {
  const sandbox = { window: {}, console, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'const App = ' + JSON.stringify({
      maskState: Object.assign({ status: 'idle', url: '', boxes: [], err: '', autoNote: '' }, maskState)
    }) + ';',
    cut('esc'), cut('maskPanelHtml'),
    'window.App = App; window.maskPanelHtml = maskPanelHtml;'
  ].join('\n'), { filename: 'mask.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 가림 화면이 판독 패널 자리에 뜬다', () => {
  const W = loadPanel({ status: 'ready', url: 'data:image/jpeg;base64,AAA' });
  const h = W.maskPanelHtml();
  assert.match(h, /id="readPanel"/, '판독 패널 자리를 그대로 써야 폰에서도 위아래로 쌓입니다');
  assert.match(h, /가릴 곳 고르기/);
  assert.match(h, /id="maskImg"/, '가릴 사진이 안 보이면 어디를 칠할지 알 수 없습니다');
});

test('★ 「기계가 못 찾은 것이 있을 수 있습니다」가 늘 붙는다', () => {
  const W = loadPanel({ status: 'ready', url: 'data:image/jpeg;base64,AAA' });
  assert.match(W.maskPanelHtml(), /못 찾은 것이 있을 수 있습니다/);
});

test('★ 가린 곳이 없으면 단추가 「가릴 것 없음」이라고 말한다 — 건너뛰기는 두지 않는다', () => {
  const W = loadPanel({ status: 'ready', url: 'data:image/jpeg;base64,AAA' });
  const h = W.maskPanelHtml();
  assert.match(h, /가릴 것 없음 — 그대로 판독/);
  assert.equal(/건너뛰기/.test(h), false, '건너뛸 수 있으면 늘 건너뜁니다');
});

test('★ 가린 곳이 있으면 몇 군데인지 단추에 적힌다', () => {
  const W = loadPanel({ status: 'ready', url: 'data:image/jpeg;base64,AAA',
    boxes: [{ x: 0, y: 0, w: 0.2, h: 0.1, by: 'me' }, { x: 0.5, y: 0.5, w: 0.2, h: 0.1, by: 'me' }] });
  assert.match(W.maskPanelHtml(), /2군데 가리고 판독/);
});

test('★ 기계가 칠한 것과 사람이 칠한 것을 눈으로 가른다', () => {
  const W = loadPanel({ status: 'ready', url: 'data:image/jpeg;base64,AAA',
    boxes: [{ x: 0, y: 0, w: 0.2, h: 0.1, by: 'ai' }, { x: 0.5, y: 0.5, w: 0.2, h: 0.1, by: 'me' }] });
  const h = W.maskPanelHtml();
  assert.match(h, /maskbox ai/, '기계가 한 것을 가르지 않으면 「내 몫이 얼마나 남았나」를 모릅니다');
  assert.match(h, /maskbox me/);
});

test('★ 사진을 못 불러오면 까닭을 보여주고 판독으로 넘어가지 않는다', () => {
  const W = loadPanel({ status: 'err', err: '파일을 불러오지 못했습니다' });
  const h = W.maskPanelHtml();
  assert.match(h, /파일을 불러오지 못했습니다/);
  assert.equal(/maskConfirm\(/.test(h), false,
    '★ 못 불러왔는데 판독 단추가 있으면 안 가려진 채로 나갑니다');
});

test('★ 가림 계산 층이 실려 있다 — 판 번호와 함께', () => {
  assert.match(html, /<script src="js\/pu-rrn-mask\.js\?v=\d+">/,
    '?v= 가 없으면 브라우저 캐시에 묵은 옛 파일이 그대로 돕니다');
});

/* 드래그는 화면 요소가 있어야 재 볼 수 있다 — 사진이 보이는 크기를 알아야
   화면 좌표를 비율로 바꿀 수 있기 때문이다. */
function loadDrag(maskState) {
  const els = {
    maskImg: { getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }) },
    maskPreview: { style: {} }
  };
  const mask = fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask.js'), 'utf8');
  const sandbox = { window: {}, console, document: { getElementById: id => els[id] || null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(mask, { filename: 'pu-rrn-mask.js' }).runInContext(sandbox);
  new vm.Script([
    'const PuRrnMask = window.PuRrnMask;',
    'const $ = id => document.getElementById(id);',
    'const App = ' + JSON.stringify({
      maskState: Object.assign({ status: 'ready', url: 'data:x', boxes: [], err: '', autoNote: '' }, maskState)
    }) + ';',
    'App.render = function(){ __renders += 1; };',
    'var __renders = 0;',
    /* ⚠ 잘라 온 함수가 쓰는 **다른 함수와 변수**도 함께 넣어야 한다 —
       안 넣으면 ReferenceError 로 터진다(이 저장소에서 여러 번 겪었다). */
    'let maskDrag = null;',
    cut('maskViewRect'), cut('maskShowPreview'), cut('maskHidePreview'),
    cut('maskDown'), cut('maskMove'), cut('maskUp'),
    cut('maskDelBox'), cut('maskUndo'), cut('maskClear'),
    'window.App = App; window.maskDown = maskDown; window.maskMove = maskMove; window.maskUp = maskUp;',
    'window.maskDelBox = maskDelBox; window.maskUndo = maskUndo; window.maskClear = maskClear;',
    'window.__renders = function(){ return __renders; };'
  ].join('\n'), { filename: 'drag.js' }).runInContext(sandbox);
  return { W: sandbox.window, els };
}

const ev = (x, y) => ({ clientX: x, clientY: y, preventDefault() {}, pointerId: 1,
  currentTarget: { setPointerCapture() {}, releasePointerCapture() {} } });

test('★ 그으면 그 자리가 사각형으로 담긴다', () => {
  const { W } = loadDrag();
  W.maskDown(ev(200, 100));
  W.maskMove(ev(300, 150));
  W.maskUp(ev(300, 150));
  const b = W.App.maskState.boxes[0];
  assert.equal(b.x, 0.25);
  assert.equal(b.y, 0.25);
  assert.equal(b.w, 0.25);
  assert.equal(b.h, 0.25);
  assert.equal(b.by, 'me', '사람이 그은 것으로 표시돼야 기계 것과 갈립니다');
});

test('★ 긋는 동안에는 다시 그리지 않는다 — 다시 그리면 손가락이 떨어진다', () => {
  const { W } = loadDrag();
  W.maskDown(ev(200, 100));
  W.maskMove(ev(250, 120));
  W.maskMove(ev(300, 150));
  assert.equal(W.__renders(), 0, '움직이는 동안 다시 그리면 드래그가 끊깁니다');
  W.maskUp(ev(300, 150));
  assert.equal(W.__renders(), 1, '손을 떼면 한 번 다시 그려야 사각형이 남습니다');
});

test('긋는 동안 미리 보이는 칸이 따라온다', () => {
  const { W, els } = loadDrag();
  W.maskDown(ev(200, 100));
  W.maskMove(ev(300, 150));
  assert.equal(els.maskPreview.style.display, '');
  assert.equal(els.maskPreview.style.left, '25%');
  assert.equal(els.maskPreview.style.width, '25%');
});

test('점만 찍으면 아무 일도 없다', () => {
  const { W } = loadDrag();
  W.maskDown(ev(200, 100));
  W.maskUp(ev(200, 100));
  assert.equal(W.App.maskState.boxes.length, 0);
});

test('★ 사각형 하나를 지운다', () => {
  const { W } = loadDrag({ boxes: [
    { x: 0, y: 0, w: 0.2, h: 0.2, by: 'me' }, { x: 0.5, y: 0.5, w: 0.2, h: 0.2, by: 'ai' }] });
  W.maskDelBox(0);
  assert.equal(W.App.maskState.boxes.length, 1);
  assert.equal(W.App.maskState.boxes[0].by, 'ai');
});

test('★ 기계가 잘못 잡은 것도 지울 수 있다', () => {
  const { W } = loadDrag({ boxes: [{ x: 0, y: 0, w: 0.2, h: 0.2, by: 'ai' }] });
  W.maskDelBox(0);
  assert.equal(W.App.maskState.boxes.length, 0);
});

test('되돌리기는 마지막에 그은 것을 뺀다', () => {
  const { W } = loadDrag({ boxes: [
    { x: 0, y: 0, w: 0.2, h: 0.2, by: 'me' }, { x: 0.5, y: 0.5, w: 0.2, h: 0.2, by: 'me' }] });
  W.maskUndo();
  assert.equal(W.App.maskState.boxes.length, 1);
  assert.equal(W.App.maskState.boxes[0].x, 0);
});

test('다 지우기는 기계가 칠한 것까지 다 뺀다', () => {
  const { W } = loadDrag({ boxes: [
    { x: 0, y: 0, w: 0.2, h: 0.2, by: 'ai' }, { x: 0.5, y: 0.5, w: 0.2, h: 0.2, by: 'me' }] });
  W.maskClear();
  assert.equal(W.App.maskState.boxes.length, 0);
});

/* ══════ 새는 길이 없어야 한다 ══════
   가림을 거치지 않고 판독기가 불리는 길이 하나라도 있으면 이 기능은 없는 것과 같다. */
test('★ 판독기를 부르는 곳은 runRead 하나뿐이다', () => {
  const runRead = cut('runRead');
  ['read', 'readWageTable', 'readChangeNotice'].forEach(fn => {
    assert.ok(runRead.indexOf('PuDocRead.' + fn + '(') >= 0, 'runRead 가 ' + fn + ' 를 안 부릅니다');
  });
  const rest = html.replace(runRead, '');
  assert.equal(/PuDocRead\.(read|readWageTable|readChangeNotice)\(/.test(rest), false,
    '★ 가림을 거치지 않고 판독기를 부르는 길이 남아 있습니다');
});

test('★ runRead 를 부르는 곳은 maskConfirm 하나뿐이다', () => {
  const calls = html.match(/runRead\(/g) || [];
  assert.equal(calls.length, 2, 'runRead 는 정의 한 번 + maskConfirm 에서 한 번만 나와야 합니다');
  assert.match(cut('maskConfirm'), /runRead\(/);
});

test('★ 「판독하기」 단추는 가림 화면을 연다 — 곧바로 판독하지 않는다', () => {
  assert.match(html, /onclick="startMask\(\)"/, '단추가 가림 화면을 열지 않습니다');
  assert.equal(/onclick="doRead\(\)"/.test(html), false, '옛 단추가 남아 있습니다');
});

/* 가린 사본을 만들어 넘기는지, 원본을 그대로 넘기는지 실제로 본다. */
function loadConfirm(boxes) {
  const got = { masked: null };
  const els = {
    maskImg: { naturalWidth: 2000, naturalHeight: 1000,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }) }
  };
  const sandbox = {
    window: {}, console,
    document: { getElementById: id => els[id] || null },
    alert: () => {},
    PuRrnMask: {
      maskToDataUrl: (img, bs) => { got.masked = bs.slice(); return 'data:image/jpeg;base64,MASKED'; }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'const $ = id => document.getElementById(id);',
    'const PuRrnMask = globalThis.PuRrnMask;',
    'const S = { readKindFor: function(){ return "notice"; } };',
    'const App = ' + JSON.stringify({
      viewerId: 'a1',
      itemsMonth: { a1: { kind: 'etc', file: 'p/a1.jpg', mime: 'image/jpeg' } },
      itemsKeep: {},
      maskState: { status: 'ready', url: 'data:image/jpeg;base64,PLAIN', boxes: boxes || [], err: '', autoNote: '' }
    }) + ';',
    'App.render = function(){};',
    'function runRead(rk, dataUrl){ __got = dataUrl; }',
    'var __got = null;',
    cut('findRow'), cut('maskConfirm'),
    'window.App = App; window.maskConfirm = maskConfirm; window.__got = function(){ return __got; };'
  ].join('\n'), { filename: 'confirm.js' }).runInContext(sandbox);
  return { W: sandbox.window, got };
}

test('★ 가린 곳이 있으면 **가린 사본**을 판독기에 넘긴다', () => {
  const { W, got } = loadConfirm([{ x: 0.1, y: 0.1, w: 0.2, h: 0.1, by: 'me' }]);
  W.maskConfirm();
  assert.equal(W.__got(), 'data:image/jpeg;base64,MASKED', '★ 원본이 그대로 나갔습니다');
  assert.equal(got.masked.length, 1);
});

test('가린 곳이 없으면 원본을 그대로 넘긴다 — 쓸데없이 다시 뽑지 않는다', () => {
  const { W } = loadConfirm([]);
  W.maskConfirm();
  assert.equal(W.__got(), 'data:image/jpeg;base64,PLAIN');
});

test('★ 넘긴 뒤 가림 상태를 비운다 — 다음 서류에 앞 사진의 사각형이 남으면 안 된다', () => {
  const { W } = loadConfirm([{ x: 0.1, y: 0.1, w: 0.2, h: 0.1, by: 'me' }]);
  W.maskConfirm();
  assert.equal(W.App.maskState.status, 'idle');
  assert.equal(W.App.maskState.boxes.length, 0);
});
