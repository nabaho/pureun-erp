'use strict';
/* 메일 폴더 설정 — 실행: node --test tests/*.test.js

   대표 결정 2026-08-23: 이름에 「급여」가 든 폴더를 기본으로 보고, **필요할 때
   받은메일함 전부**도 볼 수 있게 스위치를 둔다. 그리고 서버가 마지막에 언제·어느
   폴더를 봤는지 화면에서 확인할 수 있어야 한다 — 없으면 자료가 안 들어올 때
   사람이 볼 데가 서버 로그뿐이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function fakeDb() {
  const tree = {};
  return {
    tree: tree,
    ref(p) {
      if (p === undefined) {
        return { update(map) { Object.keys(map).forEach(k => { tree[k] = map[k]; }); return Promise.resolve(); } };
      }
      return { once: () => Promise.resolve({ val: () => tree[p] || null }) };
    }
  };
}

function loadStore(db, opts) {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init(Object.assign({ uid: 'U1', name: '권형하', db: db }, opts || {}));
  return S;
}

/* ══════ 저장 층 ══════ */

test('★ 받은메일함 전부 보기를 켠다', () => {
  const db = fakeDb();
  const S = loadStore(db, { isAdmin: true });
  return S.setMailScanInbox(true).then(() => {
    const k = Object.keys(db.tree).filter(x => x.indexOf('mailconf') >= 0)[0];
    assert.ok(k, '설정을 적은 자리가 없습니다');
    assert.equal(db.tree[k], true);
  });
});

test('★ 껐다 켰다 한다', () => {
  const db = fakeDb();
  const S = loadStore(db, { isAdmin: true });
  return S.setMailScanInbox(false).then(() => {
    const k = Object.keys(db.tree).filter(x => x.indexOf('mailconf') >= 0)[0];
    assert.equal(db.tree[k], false);
  });
});

test('★ 관리자가 아니면 못 바꾼다 — 자문·산재 메일까지 열리는 스위치다', () => {
  const db = fakeDb();
  const S = loadStore(db, { isAdmin: false });
  return S.setMailScanInbox(true).then(
    () => { throw new Error('막지 않았습니다'); },
    e => assert.match(e.message, /총괄관리자|관리자/));
});

test('설정을 못 읽어도 빈 것으로 돌려준다 — 화면이 안 막혀야 한다', () => {
  const db = { ref: () => ({ once: () => Promise.reject(new Error('permission_denied')) }) };
  const S = loadStore(db);
  // vm 안에서 만든 객체는 deepEqual 로 못 견준다 — 빈 것인지만 본다
  return S.listMailConf().then(v => assert.equal(Object.keys(v).length, 0));
});

test('마지막 확인 기록을 읽는다', () => {
  const db = fakeDb();
  const S = loadStore(db, { isAdmin: true });
  db.tree[S.mailConfPath()] = { scanInbox: true, lastScan: { at: 5, boxes: ['2.급여'], looked: 3 } };
  return S.listMailConf().then(v => {
    assert.equal(v.scanInbox, true);
    assert.equal(v.lastScan.boxes[0], '2.급여');
  });
});

/* ══════ 화면 ══════ */

function loadScreen(app, opts) {
  opts = opts || {};
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  function cut(name) {
    const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수를 찾을 수 없습니다');
    return m[0];
  }
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1", isAdmin: ' + (opts.isAdmin ? 'true' : 'false') + '});',
    'const App = ' + JSON.stringify(Object.assign({ mailConf: null }, app)) + ';',
    'App.render = function(){};',
    cut('esc'), cut('fmtWhen'), cut('mailScanHtml'),
    'window.App = App; window.mailScanHtml = mailScanHtml;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 마지막에 어느 폴더를 봤는지 보여 준다', () => {
  const now = Date.now();
  const W = loadScreen({ mailConf: { lastScan: { at: now, boxes: ['2.급여+사무대행'], looked: 3 } } });
  const h = W.mailScanHtml();
  assert.match(h, /2\.급여\+사무대행/);
  assert.match(h, /3/);
});

test('★ 아직 한 번도 안 봤으면 그렇다고 말한다 — 빈 줄로 두면 고장으로 보인다', () => {
  const W = loadScreen({ mailConf: {} });
  assert.match(W.mailScanHtml(), /아직|없습니다/);
});

test('★ 관리자에게만 받은메일함 스위치가 보인다', () => {
  const off = loadScreen({ mailConf: {} }, { isAdmin: false }).mailScanHtml();
  const on = loadScreen({ mailConf: {} }, { isAdmin: true }).mailScanHtml();
  assert.equal(/toggleMailScan/.test(off), false, '담당자에게 이 스위치를 주면 안 됩니다');
  assert.match(on, /toggleMailScan/);
});

test('★ 스위치가 켜져 있으면 켜졌다고 보인다', () => {
  const h = loadScreen({ mailConf: { scanInbox: true } }, { isAdmin: true }).mailScanHtml();
  assert.match(h, /받은메일함/);
  assert.match(h, /켜짐|끄기/);
});

test('설정을 아직 안 읽었으면 아무것도 그리지 않는다', () => {
  assert.equal(loadScreen({ mailConf: null }, { isAdmin: true }).mailScanHtml(), '');
});

/* ══════ 배선 ══════ */

test('★ 메일함 화면이 설정을 읽어 온다', () => {
  assert.match(HTML, /listMailConf\(/, '설정을 안 읽으면 마지막 확인을 못 보여 줍니다');
});

test('★ 스위치를 누르면 저장한다', () => {
  assert.match(HTML, /setMailScanInbox\(/);
});
