'use strict';
// 판독 패널 — 원본 옆 절반. 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

/* ⚠ 잘라 온 함수가 쓰는 **상수**도 함께 넣어야 한다 — 안 넣으면
   ReferenceError 로 터진다(2026-08-14 SHARE_TAG_OPTIONS 에서 같은 일을 겪었다). */
const WAGE_FLAG = html.match(/const WAGE_READ_ON = (?:true|false);/);
assert.ok(WAGE_FLAG, 'WAGE_READ_ON 상수를 찾을 수 없습니다');

function loadApp(appState) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      kind: 'attend', viewerId: 'a1', viewingUid: '',
      readState: { status: 'idle', rows: [], err: '' }
    }, appState)) + ';',
    WAGE_FLAG[0],
    cut('esc'), cut('canWrite'), cut('readPanelHtml'),
    'window.App = App; window.readPanelHtml = readPanelHtml;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 판독 층을 불러온다', () => {
  assert.match(html, /<script src="js\/pu-doc-read\.js">/);
  assert.match(html, /PuDocRead\.init\(/, '키를 어디서 얻는지 판독 층에 알려야 합니다');
});

test('★ 아직 안 읽었으면 「판독하기」 단추가 있다', () => {
  const W = loadApp({ kind: 'attend' });
  const h = W.readPanelHtml();
  assert.match(h, /판독하기/);
  assert.match(h, /doRead\(\)/);
});

test('★ 근로계약서·우리 산출물 탭에는 판독 단추가 없다', () => {
  ['contract', 'output'].forEach(k => {
    const h = loadApp({ kind: k }).readPanelHtml();
    assert.equal(/doRead\(\)/.test(h), false, k + ' 에 판독 단추가 보입니다');
  });
});

test('★ 남의 자리에서는 판독 단추가 없다 — 남의 값을 만들면 안 된다', () => {
  const h = loadApp({ kind: 'attend', viewingUid: 'U2', viewingDeputy: false }).readPanelHtml();
  assert.equal(/doRead\(\)/.test(h), false);
});

test('읽는 중이면 그렇다고 말한다', () => {
  const h = loadApp({ readState: { status: 'reading', rows: [], err: '' } }).readPanelHtml();
  assert.match(h, /읽는 중/);
  assert.equal(/doRead\(\)/.test(h), false, '읽는 중에 또 누르면 두 번 나갑니다');
});

test('실패하면 까닭을 보여주고 다시 누를 수 있다', () => {
  const h = loadApp({ readState: { status: 'err', rows: [], err: 'AI 키가 없습니다' } }).readPanelHtml();
  assert.match(h, /AI 키가 없습니다/);
  assert.match(h, /doRead\(\)/);
});

test('★ 급여대장 판독은 아직 꺼져 있다 — 처리위탁 근거 정리 전', () => {
  // 설계서 9장. 켤 때 이 검사를 함께 고친다.
  assert.match(html, /const WAGE_READ_ON = false/);
  const h = loadApp({ kind: 'ledger' }).readPanelHtml();
  assert.equal(/doRead\(\)/.test(h), false, '아직 켜면 안 됩니다');
  assert.match(h, /준비 중/);
});

test('★ 넓은 판은 판독하는 서류일 때만 — 명함처럼 좁은 것까지 반으로 가르지 않는다', () => {
  const rv = html.match(/function renderViewer\(\)[\s\S]*?\n\}/)[0];
  assert.match(rv, /readPanelHtml\(\)/, '함수만 있고 안 부르면 화면에 아무것도 없습니다');
  assert.match(html, /#readPanel\{[^}]*flex:0 0 50%/, '절반을 쓰는 꾸밈이 없습니다');
});

test('★ 확대(zoom) CSS는 실제로 zoom 클래스가 붙는 요소를 겨냥한다 — 딴 데를 겨냥하면 눌러도 조용히 안 커진다', () => {
  const rv = html.match(/function renderViewer\(\)[\s\S]*?\n\}/)[0];
  const toggle = rv.match(/const (\w+) = \$\('(\w+)'\);[\s\S]*?\1\.classList\.toggle\('zoom'/);
  assert.ok(toggle, 'renderViewer 안에서 zoom 클래스를 토글하는 요소를 찾을 수 없습니다');
  const zoomTargetId = toggle[2];

  const cssRule = html.match(/#(\w+)\.zoom\{/);
  assert.ok(cssRule, '.zoom CSS 규칙을 찾을 수 없습니다');

  assert.equal(cssRule[1], zoomTargetId,
    'zoom 클래스는 #' + zoomTargetId + ' 에 붙는데 CSS는 #' + cssRule[1] +
    ' 을 겨냥합니다 — 사진을 눌러도 확대되지 않습니다');
});
