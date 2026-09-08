'use strict';
/* 앱바를 «상자 안에서 실제로 돌려» 보는 부품 (2026-09-08)
 *
 * ★ 왜 부품으로 빼나 — appbar-admin-only 가 같은 상자를 만들어 쓰고 있었다.
 *   창 열기(goApp)까지 재려니 `window.open` 을 갈아 끼워야 해서, 상자 만드는 일을
 *   한 곳으로 모았다. 두 벌로 두면 한쪽만 고쳐진다.
 *
 * ⚠ 검사 파일이 아니다(`*.test.js` 가 아니라서 러너가 안 집는다).
 * ⚠ 앱바는 IIFE 끝에서 window 를 그대로 받는다 — 상자에 «진짜 window 노릇»을 할
 *   것을 준다. 안 주면 그 자리에서 멎어 검사가 통째로 운다.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

function load(opts) {
  const o = opts || {};
  const store = {};
  const el = () => ({
    style: {}, setAttribute() { }, appendChild() { },
    addEventListener() { }, remove() { }, textContent: '', classList: { add() { }, remove() { } }
  });
  const win = {};
  /* role 을 null 로 주면 «신원 부품을 아직 안 실은 화면»이 된다 */
  if (o.role !== null) win.PuWhoami = { get: () => ({ role: o.role }), onChange() { } };

  /* 창 열기·주소 옮기기를 «가로챈다» — 검사가 진짜 창을 띄우면 안 된다 */
  let opener = function () { return { focus() { } }; };
  const nav = [];
  win.open = function (u, n) { return opener(u, n); };
  win.location = { get href() { return 'about:blank'; }, set href(v) { nav.push(v); } };
  win.focus = function () { };

  const ctx = {
    window: win,
    document: {
      createElement: el, querySelector: () => null,
      body: { appendChild() { } }, addEventListener() { }
    },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    setInterval: () => 0, clearInterval() { }, setTimeout: () => 0
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-appbar.js'), 'utf8'), ctx);

  const B = win.PuAppBar;
  /* 검사가 갈아 끼울 수 있게 손잡이를 내준다 — 앱바 자체는 안 건드린다 */
  B.__setOpen = function (fn) { opener = fn; };
  B.__nav = nav;
  return B;
}

module.exports = { load: load };
