'use strict';
/* 「올리려는데 안 된다」의 까닭을 말해 준다 (대표 2026-08-17)
   실행: node --test tests/*.test.js
   실제로 있었던 일: 총괄관리자로 **남의 자리**를 보는 중에 카톡 파일을 끌어다
   놓았다. 아무 일도 안 일어났다 — 파일이 잘못됐나 앱이 고장 났나 알 길이 없었다. */
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

function load(app) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      screen: 'drawer', companyId: 'co_1', companyName: '유명육가공', month: '2026-08',
      kind: 'attend', viewingUid: '', viewingName: '', viewingDeputy: false
    }, app)) + ';',
    cut('esc'), cut('canWrite'), cut('dropTargetNow'), cut('dropHintHtml'),
    'window.App = App; window.canWrite = canWrite;',
    'window.dropTargetNow = dropTargetNow; window.dropHintHtml = dropHintHtml;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

const 남의자리 = { viewingUid: 'U9', viewingName: '신욱임', viewingDeputy: false };

/* ══════ 왜 안 됐나 ══════ */

/* ⚠ canWrite 로 dragenter/dragover 를 끊으면 preventDefault 를 못 걸고, 그러면
   브라우저가 **놓는 것 자체를 거부해** drop 도 안 불린다. 화면은 조용하고
   사람은 파일이 잘못된 줄 안다. 받아서 「담을 수 없다」고 말해야 한다. */
test('★ 남의 자리에서도 끌기를 받아 준다 — 안 받으면 아무 말도 못 한다', () => {
  const w = cut('dropWatch');
  const enter = w.slice(w.indexOf("'dragenter'"), w.indexOf("'dragover'"));
  const over = w.slice(w.indexOf("'dragover'"), w.indexOf("'dragleave'"));
  [['dragenter', enter], ['dragover', over]].forEach(([name, src]) => {
    assert.match(src, /preventDefault\(\)/, name + ' 가 끌기를 안 받습니다');
    assert.equal(/!canWrite\(\)/.test(src), false,
      '★ ' + name + ' 에서 끊으면 브라우저가 놓기를 거부해 조용히 실패합니다');
  });
});

test('★ 남의 자리에 놓으면 왜 안 되는지 말해 준다', () => {
  const d = cut('dropWatch');
  const drop = d.slice(d.indexOf("'drop'"));
  assert.match(drop, /!canWrite\(\)/, '남의 자리에 담기면 안 됩니다');
  assert.match(drop, /alert\(/, '★ 아무 말도 없으면 파일이 잘못된 줄 압니다');
  assert.match(drop, /내 자리로/, '어떻게 해야 되는지가 없으면 알려도 소용없습니다');
});

/* 놓기 **전에** 이미 알아야 한다 — 놓고 나서야 알면 헛수고를 한 뒤다. */
test('★ 끌고 들어오는 순간 이미 「담을 수 없다」고 뜬다', () => {
  const W = load(남의자리);
  assert.equal(W.canWrite(), false);
  const t = W.dropTargetNow();
  assert.equal(t.where, 'blocked');
  const hint = W.dropHintHtml(t);
  assert.match(hint.title, /담을 수 없/);
  assert.match(hint.sub, /신욱임/, '누구 자리인지 없으면 무엇을 눌러야 할지 모릅니다');
  assert.match(hint.sub, /내 자리로/, '풀 길을 적어야 합니다');
});

test('내 자리에서는 예전 그대로 담긴다', () => {
  const W = load();
  assert.equal(W.canWrite(), true);
  assert.equal(W.dropTargetNow().where, 'drawer');
});

/* 휴가 대리로 맡은 자리는 고칠 수 있다 — 막으면 맡긴 일을 못 한다. */
test('대리로 맡은 자리에는 담을 수 있다', () => {
  const W = load({ viewingUid: 'U9', viewingName: '신욱임', viewingDeputy: true });
  assert.equal(W.dropTargetNow().where, 'drawer');
});

/* ══════ 올리는 길이 눈에 보인다 ══════ */

/* 서랍에는 올리는 단추가 **없었다** — 끌어다 놓기만 되는데 그건 화면 어디에도
   안 적혀 있어 아는 사람만 쓰는 길이었다. */
test('★ 서랍에 올리기 단추가 있다 — 끌어다 놓기만 아는 사람만 쓴다', () => {
  const d = cut('screenDrawer');
  assert.match(d, /pickDrawerFiles\(\)/, '서랍에 올리기 단추가 없습니다');
  assert.match(d, /id="drawerPick"/, '고르개가 없습니다');
  assert.match(d, /canWrite\(\)\s*\n?\s*\?\s*'<button class="btn sm pri" onclick="pickDrawerFiles/,
    '남의 자리에서도 단추가 보이면 눌러도 안 되는 것을 보여 주는 셈입니다');
});

/* 두 길이 다르게 굴면 어느 쪽이 맞는지 알 수 없다. */
test('★ 단추로 고른 것과 끌어다 놓은 것이 같은 자리로 간다', () => {
  assert.match(cut('screenDrawer'), /onchange="dropFiles\(this\.files\)/,
    '단추가 놓기와 다른 길로 가면 결과가 갈립니다');
});

/* 같은 파일을 두 번 고르면 onchange 가 안 불린다 — 값을 비워야 다시 걸린다. */
test('같은 파일을 다시 골라도 걸린다', () => {
  // 소스 안에서는 따옴표가 \' 로 막혀 있다 — 값을 비우는지만 본다
  assert.match(cut('screenDrawer'), /this\.value=\\?'/, '두 번째로 같은 파일을 고르면 아무 일도 안 납니다');
});

/* ══════ 카톡 파일 ══════ */

/* 고르개에 안 적혀 있으면 그 파일은 **회색으로 눌리지도 않는다** — 사람은
   「이건 못 올리는 파일」이라고 읽는다. 실제로는 담긴다(BAD_EXT 에 없다). */
test('★ 카톡 대화(.txt)와 묶음(.zip)을 고를 수 있다', () => {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  assert.equal(S.acceptFile({ name: '카톡대화.txt', size: 5000, type: 'text/plain' }).ok, true,
    '저장 층이 받는데 화면이 막으면 안 됩니다');
  assert.equal(S.acceptFile({ name: '카톡.zip', size: 5000, type: '' }).ok, true);
  ['screenPending', 'screenDrawer'].forEach(fn => {
    const acc = (cut(fn).match(/accept="([^"]*\.xlsx[^"]*)"/) || [])[1];
    assert.ok(acc, fn + ' 에 받는 종류가 없습니다');
    ['.txt', '.zip'].forEach(e =>
      assert.ok(acc.split(',').indexOf(e) >= 0, fn + ' 에서 ' + e + ' 를 못 고릅니다: ' + acc));
  });
});

/* 위험한 것은 그대로 막는다 — 넓히다가 함께 열리면 안 된다. */
test('★ 실행파일은 여전히 막는다', () => {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  ['a.exe', 'a.js', 'a.bat', 'a.html'].forEach(n =>
    assert.equal(S.acceptFile({ name: n, size: 100 }).ok, false, n + ' 가 담깁니다'));
});
