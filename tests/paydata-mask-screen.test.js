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
/* ⚠ 2026-08-17 — 긋기·사본 만들기가 **공용 층(js/pu-rrn-mask-ui.js)으로 옮겨 갔다**
   (사진첩도 같은 가림이 필요해졌는데, 복사하면 두 벌이 되어 한쪽만 고쳐진다).
   그래서 여기서는 **어디서 불러오는지만** 바꿨다 — 아래 판정들은 한 글자도 안 건드렸다.
   급여데이터함이 그 층을 제대로 이어 붙였는지는 맨 아래 「공용 층 배선」이 따로 본다. */
function loadDrag(maskState) {
  const els = {
    maskImg: { getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }) },
    maskPreview: { style: {} }
  };
  const sandbox = { window: {}, console, document: { getElementById: id => els[id] || null }, Math };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ['pu-rrn-mask.js', 'pu-rrn-mask-ui.js'].forEach(function (f) {
    new vm.Script(fs.readFileSync(path.join(R, 'js', f), 'utf8'), { filename: f }).runInContext(sandbox);
  });
  new vm.Script([
    /* 공용 층은 window 에 붙는다(화면과 같다) — 여기서 꺼내 쓴다 */
    'const PuRrnMaskUi = window.PuRrnMaskUi;',
    'const App = ' + JSON.stringify({
      maskState: Object.assign({ status: 'ready', url: 'data:x', boxes: [], err: '', autoNote: '' }, maskState)
    }) + ';',
    'App.render = function(){ __renders += 1; };',
    'var __renders = 0;',
    /* 화면이 붙이는 것과 **같은 방식**으로 붙인다 — 여기만 다르게 붙이면
       화면에서 안 도는 것을 검사가 못 잡는다. */
    'PuRrnMaskUi.init({ state: function(){ return App.maskState; }, render: function(){ App.render(); } });',
    'window.App = App;',
    'window.maskDown = PuRrnMaskUi.down; window.maskMove = PuRrnMaskUi.move; window.maskUp = PuRrnMaskUi.up;',
    'window.maskCancelDrag = PuRrnMaskUi.cancelDrag; window.maskDelBox = PuRrnMaskUi.delBox;',
    'window.maskUndo = PuRrnMaskUi.undo; window.maskClear = PuRrnMaskUi.clear;',
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
    window: {}, console, Math,
    document: { getElementById: id => els[id] || null },
    alert: () => {},
    /* 가림 계산은 여기서 가짜로 둔다 — 이 검사가 보는 것은 «무엇이 판독기로 가는가»다 */
    PuRrnMask: {
      maskToDataUrl: (img, bs) => { got.masked = bs.slice(); return 'data:image/jpeg;base64,MASKED'; }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  /* 사본 만들기도 공용 층으로 옮겨 갔다(2026-08-17) — 화면과 같은 방식으로 붙인다 */
  new vm.Script(fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask-ui.js'), 'utf8'),
    { filename: 'pu-rrn-mask-ui.js' }).runInContext(sandbox);
  new vm.Script([
    'const $ = id => document.getElementById(id);',
    'const PuRrnMaskUi = window.PuRrnMaskUi;',
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
    'PuRrnMaskUi.init({ state: function(){ return App.maskState; }, render: function(){ App.render(); } });',
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

/* ══════ 그어도 칸이 안 생기던 것 (대표 지적 2026-08-16) ══════
   가림 화면에서 사진 위를 그어도 파란 칸이 안 생겼다. 화면은 뜨고 「가릴 것 없음 —
   그대로 판독」은 되는데 긋기만 안 됐다.

   ⚠ 가장 그럴듯한 까닭: **브라우저가 사진을 「끌어다 놓기」로 가로챈다.**
   사진 위에서 누른 채 끌면 데스크톱 브라우저는 사진을 드래그앤드롭하려 들고,
   그 순간 포인터 흐름을 **취소**한다(pointercancel). 취소 시점의 좌표는 시작점
   언저리라, 그것만 믿고 사각형을 만들면 너무 작아 버려진다 — 아무 칸도 안 남는다.
   `pointerdown` 에서 preventDefault() 를 불러도 `dragstart` 는 막히지 않는다.

   그래서 두 겹으로 막는다: ①사진을 아예 못 끌게 한다 ②끊겨도 **마지막으로
   움직인 자리**로 사각형을 만든다(막는 데 실패해도 사람이 그은 것은 남는다). */

test('★ 사진을 브라우저가 끌어다 놓지 못하게 막는다 — 이것이 긋기를 가로챈다', () => {
  const W = loadPanel({ status: 'ready', url: 'data:image/jpeg;base64,AAA' });
  const h = W.maskPanelHtml();
  assert.match(h, /<img id="maskImg"[^>]*draggable="false"/, '사진을 끌 수 있으면 긋기가 가로채입니다');
  assert.match(h, /ondragstart="return false"/, '끌기 시작 자체를 막아야 합니다');
  assert.match(html, /\.maskwrap img\{[^}]*user-drag:none/, '사파리·크롬은 CSS 로도 막아야 확실합니다');
});

test('★ 끌다 끊겨도(pointercancel) 그은 사각형이 남는다', () => {
  const { W } = loadDrag();
  W.maskDown(ev(200, 100));
  W.maskMove(ev(300, 150));
  /* 브라우저가 끊는다 — 그 순간 좌표는 시작점 언저리로 돌아와 있다. */
  W.maskCancelDrag();
  const b = W.App.maskState.boxes[0];
  assert.ok(b, '★ 끊겼다고 사람이 그은 사각형을 버리면 안 됩니다');
  assert.equal(b.w, 0.25, '마지막으로 움직인 자리까지가 사각형입니다');
  assert.equal(b.h, 0.25);
  assert.equal(b.by, 'me');
});

test('끊겼는데 움직인 적이 없으면 아무 일도 없다 — 그냥 누르기만 한 것이다', () => {
  const { W } = loadDrag();
  W.maskDown(ev(200, 100));
  W.maskCancelDrag();
  assert.equal(W.App.maskState.boxes.length, 0);
});

test('손을 뗀 자리가 마지막으로 움직인 자리보다 정확하다 — 뗀 좌표를 쓴다', () => {
  const { W } = loadDrag();
  W.maskDown(ev(200, 100));
  W.maskMove(ev(250, 120));
  W.maskUp(ev(300, 150));          // 마지막 움직임보다 더 간 자리에서 뗐다
  const b = W.App.maskState.boxes[0];
  assert.equal(b.w, 0.25, '뗀 자리까지 그려져야 합니다');
});

test('★ 끊기 처리는 화면에도 이어져 있다', () => {
  assert.match(html, /onpointercancel="maskCancelDrag\(\)"/,
    '끊김을 안 받으면 그 드래그는 통째로 사라집니다');
});
