'use strict';
/* 경력관리·홈페이지 관리는 총괄관리자만 본다 (대표 지시 2026-08-17)

   "경력관리 홈페이지관리는 관리자에게 화면이 보이게해라 흐리게도 안나오게 해야한다."

   ⚠ 흐리게 보여 주는 것도 안 된다 — 목록에서 «아예 빠져야» 한다.
   ⚠ 모를 때는 감춘다(닫는 쪽으로 실패). 아닌 사람에게 잠깐이라도 보이는 것보다,
     관리자에게 잠깐 늦게 보이는 편이 낫다 — 알아내는 즉시 다시 그린다.

   실행: node --test tests/*.test.js
   (이 환경의 node 는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob 으로.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const 관리자전용 = ['career', 'home'];   // 경력관리 · 홈페이지 관리

/* 앱바는 IIFE 끝에서 window 를 그대로 받는다 — 상자에 진짜 window 노릇을 할 것을 준다 */
function load(role) {
  const store = {};
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {},
                      addEventListener() {}, remove() {}, textContent: '' });
  const win = {};
  /* role === null 이면 신원 부품을 아직 안 실은 화면이다 */
  if (role !== null) win.PuWhoami = { get: () => ({ role: role }), onChange() {} };
  const ctx = {
    window: win,
    document: { createElement: el, querySelector: () => null,
                body: { appendChild() {} }, addEventListener() {} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-appbar.js'), 'utf8'), ctx);
  return win.PuAppBar;
}
const keysOf = B => [...B._ordered().map(a => a.key)];

test('관리자에게는 경력관리·홈페이지 관리가 보인다', () => {
  const k = keysOf(load('admin'));
  관리자전용.forEach(x => assert.ok(k.includes(x), x + ' 가 관리자에게 안 보입니다'));
});

test('★ 관리자가 아니면 목록에서 아예 빠진다 — 흐리게도 안 보인다', () => {
  const k = keysOf(load('member'));
  관리자전용.forEach(x => assert.ok(!k.includes(x), x + ' 가 일반 직원에게 보입니다'));
});

test('신원을 아직 모를 때는 감춘다 — 닫는 쪽으로 실패한다', () => {
  관리자전용.forEach(x => {
    assert.ok(!keysOf(load(null)).includes(x), '신원 부품이 없을 때 ' + x + ' 가 보입니다');
    assert.ok(!keysOf(load('')).includes(x), '역할을 모를 때 ' + x + ' 가 보입니다');
  });
});

test('다른 프로그램은 누구에게나 그대로 보인다 — 이번 변경이 넘치지 않았다', () => {
  const 일반 = keysOf(load('member'));
  ['erp', 'cards', 'photos', 'work'].forEach(x =>
    assert.ok(일반.includes(x), x + ' 가 일반 직원에게서 사라졌습니다'));
});

test('앱 목록 자체에는 두 앱이 그대로 있다 — 지운 것이 아니라 가린 것이다', () => {
  const all = load('member').APPS.map(a => a.key);
  관리자전용.forEach(x => assert.ok(all.includes(x), x + ' 가 목록에서 지워졌습니다'));
});

test('포털 타일도 관리자 전용으로 표시돼 있다', () => {
  const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
  const 줄 = k => enter.split(/\r?\n/).find(l => l.includes("key:'" + k + "'") && l.includes('url:'));
  관리자전용.forEach(k =>
    assert.match(줄(k) || '', /adminOnly\s*:\s*true/, k + ' 타일에 관리자 전용 표시가 없습니다'));
});

test('바로가기 목록도 같은 잣대를 쓴다 — 타일에서 감추고 여기서 새면 뜻이 없다', () => {
  const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
  const i = enter.indexOf('function accessibleApps');
  assert.ok(i > -1, 'accessibleApps 를 찾지 못했습니다');
  assert.match(enter.slice(i, i + 500), /adminOnly/,
    '바로가기 목록이 관리자 전용을 안 거릅니다');
});

test('홈페이지 관리 화면이 신원 부품을 앱바보다 «먼저» 싣는다', () => {
  const h = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');
  const w = h.indexOf('js/pu-whoami.js');
  const b = h.indexOf('js/pu-appbar.js');
  assert.ok(w > -1, '신원 부품을 안 싣습니다 — 앱바가 관리자인지 모릅니다');
  assert.ok(w < b, '신원 부품이 앱바보다 뒤에 실려 있습니다');
});
