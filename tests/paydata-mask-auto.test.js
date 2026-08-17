'use strict';
/* 기계가 주민번호 자리를 찾아 미리 칠해 준다 (2차, Task 7)
   실행: node --test tests/*.test.js
   설계서: docs/superpowers/specs/2026-08-15-주민번호-가림-design.md
   ⚠ 기계가 못 도는 것이 판독을 막는 이유가 되면 안 된다 — 막으면 사람들은
     스위치를 꺼 버리거나 다른 길로 돌아간다. */
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

function loadAuto(opts) {
  opts = opts || {};
  /* maskAutoFind 는 사진 크기를 알려고 new Image() 를 쓴다 — node 에는 없으니
     세워 준다. src 를 넣으면 곧바로 onload 를 부르는 시늉을 한다. */
  function FakeImage() {
    this.naturalWidth = 1000; this.naturalHeight = 1000;
    this.onload = null; this.onerror = null;
    Object.defineProperty(this, 'src', {
      set: function () { const f = this.onload; if (f) setTimeout(f, 0); }
    });
  }
  const sandbox = {
    window: {}, console, setTimeout, Image: FakeImage,
    document: { getElementById: () => null },
    PuRrnMask: { boxesFromWords: () => (opts.found || []) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'const $ = id => document.getElementById(id);',
    'const PuRrnMask = globalThis.PuRrnMask;',
    'const App = ' + JSON.stringify({
      viewerId: 'a1',
      maskState: { status: 'ready', url: 'data:x', boxes: opts.boxes || [], err: '', autoNote: '' }
    }) + ';',
    'App.render = function(){};',
    opts.fail
      ? 'function ocrWords(){ return Promise.reject(new Error("글자인식 도구를 받지 못했습니다")); }'
      : 'function ocrWords(){ return Promise.resolve([{text:"900101-1234567",x0:0,y0:0,x1:10,y1:10}]); }',
    cut('maskAutoFind'),
    'window.App = App; window.maskAutoFind = maskAutoFind;'
  ].join('\n'), { filename: 'auto.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 기계가 찾은 자리가 미리 칠해진다', async () => {
  const W = loadAuto({ found: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05, by: 'ai' }] });
  W.maskAutoFind('data:x', 'a1');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.maskState.boxes.length, 1);
  assert.equal(W.App.maskState.boxes[0].by, 'ai');
  assert.match(W.App.maskState.autoNote, /1곳/, '몇 곳을 찾았는지 말해 줘야 합니다');
});

test('★ 사람이 이미 칠한 것을 지우거나 덮지 않는다', async () => {
  const W = loadAuto({
    boxes: [{ x: 0.5, y: 0.5, w: 0.2, h: 0.1, by: 'me' }],
    found: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05, by: 'ai' }]
  });
  W.maskAutoFind('data:x', 'a1');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.maskState.boxes.length, 2);
  assert.ok(W.App.maskState.boxes.some(b => b.by === 'me'), '기다리는 동안 그은 것이 사라졌습니다');
});

test('★ 글자인식이 안 되면 조용히 넘어가고 판독은 그대로 된다', async () => {
  const W = loadAuto({ fail: true });
  W.maskAutoFind('data:x', 'a1');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.maskState.status, 'ready', '★ 기계가 못 돌았다고 판독을 막으면 안 됩니다');
  assert.match(W.App.maskState.autoNote, /직접 봐 주세요/);
});

/* 앞 사진의 자리가 이 사진에 얹히면 **엉뚱한 데가 가려지고 진짜 주민번호는
   그대로 나간다.** 가장 위험한 어긋남이다. */
test('★ 그 사이 다른 서류로 옮겨 갔으면 늦게 온 답을 버린다', async () => {
  const W = loadAuto({ found: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05, by: 'ai' }] });
  W.maskAutoFind('data:x', 'a1');
  W.App.viewerId = 'b2';                 // 다른 서류를 열었다
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.maskState.boxes.length, 0, '앞 사진의 사각형이 이 사진에 얹혔습니다');
});

test('★ 가림 화면을 열 때 기계 찾기를 함께 시작한다', () => {
  assert.match(cut('startMask'), /maskAutoFind\(/, '열어도 기계가 안 돌면 2차가 없는 것과 같습니다');
});

/* ⚠ 이것이 이 기능의 뿌리다 — 글자를 읽으려고 사진을 보내면 막으려던 것을
   그대로 하는 꼴이다. 받아 오는 것은 사진이 아니라 도구와 글자 사전이다. */
test('★ 사진은 밖으로 안 나간다 — 글자인식은 이 컴퓨터에서 돈다', () => {
  const src = cut('ocrWords');
  assert.equal(/fetch\(|XMLHttpRequest|FormData/.test(src), false,
    '★ 글자를 읽으려고 사진을 보내면 막으려던 것을 하는 꼴입니다');
});

/* ⚠ 미리 칠해 주면 사람이 「다 됐구나」 하고 넘긴다 — 그래서 「기계가 못 찾은
   것이 있을 수 있습니다」는 **기계가 몇 곳을 찾았든** 늘 떠 있어야 한다.
   기계 것은 빨간 칸, 사람 것은 파란 칸으로 갈라 둔다. */
test('★ 「기계가 못 찾은 것이 있을 수 있습니다」는 늘 떠 있다', () => {
  const src = html.match(/기계가 못 찾은 것이 있을 수 있습니다[\s\S]{0,120}/);
  assert.ok(src, '경고가 사라졌습니다');
  const around = html.slice(Math.max(0, html.indexOf(src[0]) - 400), html.indexOf(src[0]));
  assert.equal(/autoNote\s*\?[^]{0,80}$/.test(around), false,
    '★ 기계가 찾았을 때 경고를 감추면 사람이 눈으로 안 훑습니다');
});

test('★ 기계가 칠한 것과 사람이 칠한 것을 눈으로 가른다', () => {
  assert.match(html, /\.mbox\.ai|by === 'ai'|by=='ai'|b\.by === 'ai'/,
    '갈라 보이지 않으면 기계 것을 사람이 확인한 것으로 읽습니다');
});

/* 판독을 안 쓰는 사람이 10MB 를 미리 받을 이유가 없다. */
test('글자인식 도구는 처음 쓸 때 받는다', () => {
  const src = cut('loadOcr');
  assert.match(src, /window\.Tesseract/, '이미 받아 뒀으면 다시 안 받아야 합니다');
  assert.match(src, /ocrLoading/, '두 번 눌렀을 때 두 번 받으면 안 됩니다');
  assert.equal(/<script/.test(html.slice(0, html.indexOf('</head>')).match(/tesseract/i) || ''), false,
    '머리에 미리 실으면 판독을 안 쓰는 사람도 받습니다');
});
