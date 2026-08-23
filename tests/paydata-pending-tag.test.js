'use strict';
/* 대기 칸 줄에 이미 적혀 있는 이름표를 화면이 쓴다 — 실행: node --test tests/*.test.js

   2026-08-21에 찾은 구멍: `pendTagOf` 는 사업장·귀속월·종류를 **늘 파일 이름에서
   다시 짐작**했다. 그래서 서버가 「이 자료는 텃골영농조합법인 2026-08 근태」라고
   적어 보내도 화면은 그것을 버리고 파일 이름만 봤다 — IMG_2841.jpg 면 세 칸이
   다 빈칸이 됐다.
   메일을 담당자 칸으로 저절로 보내는 일(대표 승낙 2026-08-21)의 절반이 여기다.

   차례: 사람이 고친 것 > 줄에 적힌 것 > 파일 이름 짐작. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function load(appState) {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  function cut(name) {
    const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수를 찾을 수 없습니다');
    return m[0];
  }
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      companies: [
        { id: 'co_1', name: '텃골영농조합법인(용인)' },
        { id: 'co_2', name: '팔천식품' }
      ],
      pendTag: {}
    }, appState)) + ';',
    cut('guessTag'), cut('pendTagOf'), cut('setPendTag'),
    'window.App = App; window.pendTagOf = pendTagOf; window.setPendTag = setPendTag;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* 서버가 갈라 보낸 줄 — 이름표가 이미 채워져 있다 */
const ROUTED = {
  filename: 'IMG_2841.jpg', from: 'mail', routed: true,
  companyId: 'co_2', companyName: '팔천식품', month: '2026-08', kind: 'attend',
  note: '메일 palchun@naver.com · 8월 자료'
};

test('★ 줄에 적힌 사업장을 쓴다 — 파일 이름으로 다시 짐작하지 않는다', () => {
  const W = load();
  const g = W.pendTagOf('p1', ROUTED);
  assert.equal(g.companyId, 'co_2', '서버가 적어 보낸 사업장이 버려졌습니다');
  assert.equal(g.month, '2026-08');
  assert.equal(g.kind, 'attend');
});

test('★ 사람이 고친 것이 줄에 적힌 것을 이긴다', () => {
  const W = load();
  W.setPendTag('p1', 'companyId', 'co_1');
  assert.equal(W.pendTagOf('p1', ROUTED).companyId, 'co_1');
  assert.equal(W.pendTagOf('p1', ROUTED).month, '2026-08', '안 고친 칸은 그대로여야 합니다');
});

test('★ 줄에 안 적힌 칸은 파일 이름으로 짐작한다', () => {
  const W = load();
  // 서버가 사업장만 알아냈을 때 — 월·종류는 파일 이름에서 캔다
  const half = { filename: '2026년 8월 근태표.xlsx', companyId: 'co_2', companyName: '팔천식품',
    month: '', kind: '', from: 'mail' };
  const g = W.pendTagOf('p1', half);
  assert.equal(g.companyId, 'co_2');
  assert.equal(g.month, '2026-08');
  assert.equal(g.kind, 'attend');
});

test('사람이 일부러 비운 칸은 짐작으로 되돌아가지 않는다', () => {
  const W = load();
  /* 잘못 붙은 사업장을 지우고 다시 고르려는 중이다. 여기서 짐작값이 되살아나면
     지운 것이 계속 되돌아와 못 고친다(2026-08-15에 같은 일로 고쳤던 자리다). */
  W.setPendTag('p1', 'companyId', '');
  assert.equal(W.pendTagOf('p1', ROUTED).companyId, '');
});

test('예전처럼 이름표 없이 올린 줄은 그대로 짐작한다', () => {
  const W = load();
  const g = W.pendTagOf('p1', { filename: '팔천식품_2026-08_근태.jpg', from: 'upload' });
  assert.equal(g.companyId, 'co_2');
  assert.equal(g.month, '2026-08');
  assert.equal(g.kind, 'attend');
});

test('줄 자체가 없어도 터지지 않는다', () => {
  const W = load();
  const g = W.pendTagOf('p1', null);
  assert.equal(g.companyId, '');
  assert.equal(g.month, '');
});

/* ══════ 화면 표시 ══════ */

test('★ 메일로 저절로 내려온 줄임을 알려 준다', () => {
  // 어디서 왔는지 모르면 「내가 안 올린 것이 왜 있나」가 된다
  assert.match(HTML, /routed/, '저절로 내려온 줄을 갈라 보지 않습니다');
});
