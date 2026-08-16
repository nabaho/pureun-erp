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
