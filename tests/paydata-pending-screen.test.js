'use strict';
// 대기 칸 화면 — 실행: node --test tests/*.test.js
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

function loadGuess() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script('const S = window.PuPaydataStore; S.init({uid:"U1"});\n' + cut('guessTag')
    + '\nwindow.guessTag = guessTag;', { filename: 'guess.js' }).runInContext(sandbox);
  return sandbox.window.guessTag;
}

const COMPANIES = [{ id: 'co_1', name: '(주)화담원' }, { id: 'co_2', name: '이비' }];

test('파일 이름에서 사업장을 짐작한다', () => {
  const g = loadGuess();
  assert.equal(g({ filename: '화담원 아산점_25년 07월_급여대장.xlsx' }, COMPANIES).companyId, 'co_1');
});

test('파일 이름에서 귀속월을 짐작한다', () => {
  const g = loadGuess();
  assert.equal(g({ filename: '화담원_2026-08_근태.jpg' }, COMPANIES).month, '2026-08');
  assert.equal(g({ filename: '화담원_25년 07월_급여대장.xlsx' }, COMPANIES).month, '2025-07');
  assert.equal(g({ filename: '근태표.jpg' }, COMPANIES).month, '');
});

test('파일 이름에서 종류를 짐작한다', () => {
  const g = loadGuess();
  assert.equal(g({ filename: '근태표.jpg' }, COMPANIES).kind, 'attend');
  assert.equal(g({ filename: '급여대장.xlsx' }, COMPANIES).kind, 'ledger');
  assert.equal(g({ filename: '근로계약서_홍길동.pdf' }, COMPANIES).kind, 'contract');
  assert.equal(g({ filename: '급여명세서.pdf' }, COMPANIES).kind, 'output');
  assert.equal(g({ filename: '무엇인지모름.jpg' }, COMPANIES).kind, 'etc');
});

test('★ 짐작이 안 되면 빈칸으로 두고 사람에게 넘긴다', () => {
  const g = loadGuess();
  // 아무거나 골라 넣으면 틀린 서랍에 들어가고 아무도 모른다.
  const t = g({ filename: 'IMG_0412.jpg' }, COMPANIES);
  assert.equal(t.companyId, '');
  assert.equal(t.month, '');
});

test('★ 화면에 짐작 함수가 실제로 배선돼 있다', () => {
  assert.ok(html.indexOf('guessTag(rec, App.companies)') >= 0, '화면이 짐작 함수를 안 씁니다');
});

test('★ 계약서는 월을 못 읽어도 서랍으로 내려보낼 수 있다', () => {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  const up = S.drawerUpdate('p1', S.pendingRecord({ filename: '계약서.pdf', at: 1 }),
    { companyId: 'co_1', month: '', kind: 'contract', at: 2 });
  assert.ok(up['paydata/u/U1/items/keep/p1']);
});

test('대기 칸 화면에도 넘버링·ㅁ 체크가 있다', () => {
  const m = html.match(/function screenPending[\s\S]*?\n\}/);
  assert.ok(m, 'screenPending 함수를 찾을 수 없습니다');
  assert.match(m[0], /pickBar\('pending'/);
  assert.match(m[0], /pkno/);
});

test('★ 자료가 하나도 없어도 파일 올리기 단추는 보인다', () => {
  // 예전에는 목록이 비면 화면 전체를 일찍 끝내 올리기 단추까지 함께 사라졌다 —
  // 처음 쓰는 사람은 올릴 방법 자체를 못 찾는다.
  const m = html.match(/function screenPending[\s\S]*?\n\}/);
  const beforeReturn = m[0].slice(0, m[0].indexOf('if (!ids.length)'));
  assert.match(beforeReturn, /pickFiles\(\)/);
  assert.match(beforeReturn, /id="filePick"/);
});

/* 목록을 통째로 못 박지 않는다 — 늘어난다(2026-08-17 카톡 .txt·.zip 이 빠져
   있어 고르개에서 회색으로 눌리지도 않았다). 「사진만 받는 것이 아니다」와
   「실제로 담기는 것은 다 고를 수 있다」만 본다. */
test('올리기 칸은 사진만 받지 않는다 — 담기는 것은 고르개에도 다 있다', () => {
  const m = html.match(/function screenPending[\s\S]*?\n\}/);
  const acc = (m[0].match(/accept="([^"]*\.xlsx[^"]*)"/) || [])[1];
  assert.ok(acc, '올리기 칸에 받는 종류가 안 적혀 있습니다');
  ['.xlsx', '.pdf', '.hwp', '.jpg', '.png', '.txt', '.zip'].forEach(e =>
    assert.ok(acc.split(',').indexOf(e) >= 0, e + ' 를 고를 수 없습니다: ' + acc));
});

test('★ 파일을 고르면 uploadFiles 로 이어진다', () => {
  const m = html.match(/function screenPending[\s\S]*?\n\}/);
  assert.match(m[0], /onchange="uploadFiles\(this\.files\)"/);
});

test('여러 장을 올리면 하나가 막혀도 나머지는 올라간다', () => {
  const m = html.match(/function uploadFiles[\s\S]*?\n\}/);
  assert.ok(m, 'uploadFiles 함수를 찾을 수 없습니다');
  assert.match(m[0], /\.catch\(/);
  assert.match(m[0], /Promise\.all/);
});
