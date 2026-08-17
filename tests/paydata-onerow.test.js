'use strict';
/* 머리 한 줄 · 틀고정 · 달력 하나만 · 미래 달 막기 (대표 지시 2026-08-17)
   실행: node --test tests/*.test.js · 목업 docs/mockups/paydata-onerow.html */
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
    'const $ = id => document.getElementById(id);',
    'const App = ' + JSON.stringify(Object.assign({
      month: '2026-08', companyId: 'co_1', arrivals: {}, monthEdit: false, monthIds: []
    }, app)) + ';',
    'App.render = function(){};',
    cut('esc'), cut('jsq'), cut('thisMonth'),
    "const WEEKDAY = ['일','월','화','수','목','금','토'];",
    cut('todayLabel'),
    cut('monthShift'), cut('monthCount'), cut('monthAhead'), cut('monthStripHtml'),
    'window.App = App; window.monthAhead = monthAhead; window.todayLabel = todayLabel;',
    'window.monthStripHtml = monthStripHtml; window.monthCount = monthCount;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* ══════ ④ 미래 달로는 못 넘어간다 ══════ */

/* 실제로 이런 화면이 나왔다: 기준 월은 2026-08 이라 적혀 있는데 월 줄은 1월이
   켜져 있었다 — ▶ 를 다섯 번 눌러 2027년 1월까지 간 것이다. 미래 달에는 자료가
   있을 수 없는데 「지금 미래를 보고 있다」는 말이 어디에도 없어, 빈 것이 그 달
   탓인지 가릴 수가 없다. */
test('★ 이번 달에 닿으면 ▶ 가 안 눌린다', () => {
  const now = new Date();
  const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const W = load({ month: cur });
  assert.equal(W.monthAhead(), true);
  assert.match(W.monthStripHtml(), /<button class="btn sm" disabled/, '★ 미래 달로 넘어갑니다');
});

test('★ 지난달을 보고 있을 때는 ▶ 가 눌린다 — 돌아올 길은 열려 있어야 한다', () => {
  const now = new Date();
  const back = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const m = back.getFullYear() + '-' + String(back.getMonth() + 1).padStart(2, '0');
  const W = load({ month: m });
  assert.equal(W.monthAhead(), false);
  assert.equal(/disabled/.test(W.monthStripHtml()), false);
});

/* 「직접 적기」로 미래를 적는 것은 그대로 둔다 — 정말 필요할 때가 있고,
   그건 사람이 알고 하는 일이다. ▶ 를 막은 것은 **모르고 넘어가는 것**이다. */
test('먼 달로 가는 길(직접 적기)은 막지 않는다', () => {
  const now = new Date();
  const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  assert.match(load({ month: cur }).monthStripHtml(), /직접 적기/);
});

/* ══════ 오늘 표시 (대표 지시 2026-08-17) ══════ */

/* 근태는 요일로 세는 일이라 날짜만으로는 지금이 주 어디쯤인지 안 잡힌다. */
test('★ 오늘이 요일까지 보인다', () => {
  const W = load();
  assert.equal(W.todayLabel('2026-08-17T09:00:00'), '8월 17일 (월)');
  assert.equal(W.todayLabel('2026-01-03T09:00:00'), '1월 3일 (토)');
  assert.match(W.monthStripHtml(), /오늘 \d+월 \d+일 \([일월화수목금토]\)/, '월 줄에 오늘이 없습니다');
});

/* 한 칸만 보이니 3월까지 내려갔다가 ▶ 를 다섯 번 누를 일이 없어야 한다. */
test('★ 지난달을 보고 있으면 「오늘」이 돌아오는 길이 된다', () => {
  const now = new Date();
  const back = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const m = back.getFullYear() + '-' + String(back.getMonth() + 1).padStart(2, '0');
  assert.match(load({ month: m }).monthStripHtml(), /class="today back"[^>]*onclick/,
    '되돌아올 길이 없으면 ▶ 를 여러 번 눌러야 합니다');
});

test('이번 달을 보고 있을 때는 「오늘」이 그냥 표시다 — 누를 것이 없다', () => {
  const now = new Date();
  const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const h = load({ month: cur }).monthStripHtml();
  assert.match(h, /class="today"/);
  assert.equal(/class="today back"/.test(h), false);
});

/* ══════ ③ 달력은 하나만 ══════ */

/* 예전에는 첫 화면에 「기준 월 [2026-08] 예: 2026-08」 적는 칸이 따로 있었다 —
   같은 값을 두 가지 방식으로 만지니 어느 쪽이 진짜인지 헷갈린다. */
test('★ 달 고르는 데가 한 곳이다 — 첫 화면의 적는 칸을 없앴다', () => {
  const s = cut('screenSites').replace(/\/\*[\s\S]*?\*\//g, '');   // 설명글은 빼고 본다
  assert.equal(/App\.go\('sites',\{month:/.test(s), false, '★ 달 적는 칸이 아직 남아 있습니다');
  assert.match(s, /monthStripHtml\(\)/, '첫 화면도 같은 월 줄을 써야 합니다');
});

/* 첫 화면에는 「그 사업장」이 없다 — 지금 보고 있는 목록 전체를 센다.
   따로 세면 첫 칸 숫자와 월 줄이 또 다른 말을 한다. */
test('★ 첫 화면 월 줄은 지금 보고 있는 사업장들을 합쳐 센다', () => {
  const arrivals = {
    co_1: { 202606: { attend: { a: 1, b: 1 }, last: 1 } },
    co_2: { 202606: { ledger: { c: 1 }, last: 1 } },
    co_9: { 202606: { attend: { z: 1 }, last: 1 } }   // 지금 보기에 없는 곳
  };
  const W = load({ companyId: '', monthIds: ['co_1', 'co_2'], arrivals: arrivals });
  assert.equal(W.monthCount('', '2026-06'), 3, '보고 있는 두 곳만 더해야 합니다');
  assert.equal(W.monthCount('co_1', '2026-06'), 2, '서랍에서는 그 한 곳만 셉니다');
});

/* ══════ ①② 머리 한 줄 · 틀고정 ══════ */

test('★ 머리가 통째로 붙어 있다 — 굴려도 따라 올라가지 않는다', () => {
  assert.match(html, /\.stickhead\{[^}]*position:sticky/, '머리가 안 붙습니다');
  /* 투명하면 목록이 그 밑으로 비쳐 글씨를 덮는다 */
  assert.match(html, /\.stickhead\{[^}]*background:/, '바탕색이 없으면 글씨가 겹칩니다');
  ['screenSites', 'screenDrawer'].forEach(fn =>
    assert.match(cut(fn), /class="stickhead"/, fn + ' 에 붙는 머리가 없습니다'));
});

/* 상자 셋(사업장·자료 온 곳·아직 안 온 곳)이 각각 제 줄을 먹어, 제목·설명
   두 줄·기준 월 줄까지 여섯 줄이 지나야 자료가 시작했다. */
test('★ 첫 화면 현황이 한 줄로 접혔다 — 상자 셋이 사라졌다', () => {
  const s = cut('screenSites');
  assert.equal(/class="ovw"/.test(s), false, '★ 상자가 남아 있으면 줄이 안 줄어듭니다');
  assert.match(s, /class="dkpi"/, '숫자 한 줄이 없습니다');
  assert.match(s, /class="dhead"/, '이름·숫자·단추가 한 줄이 아닙니다');
});

/* ⚠ 줄인다고 **말을 없애지는 않는다** — 처음 쓰는 사람에게는 여전히 필요하다. */
test('★ 없앤 설명은 지운 것이 아니라 제목에 옮겨 두었다', () => {
  const s = cut('screenSites');
  assert.match(s, /class="dtitle" title="/, '제목에 설명이 안 붙었습니다');
  assert.match(s, /장수는 그 업체에 온 자료 전체입니다/, '설명이 사라졌습니다');
  assert.match(s, /왼쪽 목록이 빠릅니다/, '어디서 무엇을 하는지가 사라졌습니다');
});

/* 서랍은 자리 띠·이름·달·탭·폴더찾기로 다섯 줄이었다 — 탭과 폴더·찾기를
   한 줄에 모아 네 줄(내 자리면 세 줄)로 줄인다. */
test('★ 서랍에서 탭·폴더·찾기가 한 줄에 모였다', () => {
  const d = cut('screenDrawer');
  const bar = d.slice(d.indexOf('id="findBar"'), d.indexOf('.stickhead 끝'));
  assert.match(bar, /id="tabsBar"/, '탭이 찾기 줄과 따로 있습니다');
  assert.match(bar, /folderBar\(/, '폴더가 찾기 줄과 따로 있습니다');
});

/* 폴더가 많을 때 억지로 한 줄에 밀어 넣으면 폴더 이름이 잘려 못 고른다. */
test('폴더가 많으면 다음 줄로 넘어가게 둔다', () => {
  assert.match(html, /#tabsBar\{[^}]*flex-wrap:wrap/);
});

/* 자리 띠를 화면 함수 안으로 옮겼다 — render 가 또 붙이면 띠가 두 번 나온다. */
test('★ 자리 띠가 두 번 나오지 않는다', () => {
  const r = html.match(/render\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(r, /App\.screen === 'sites'\) \{ m\.innerHTML = screenSites\(\)/,
    '★ 사업장 목록에 띠가 두 번 붙습니다');
  assert.match(r, /App\.screen === 'drawer'\) \{ m\.innerHTML = screenDrawer\(\)/,
    '★ 서랍에 띠가 두 번 붙습니다');
  /* 나머지 화면은 예전 그대로 render 가 붙인다 — 안 그러면 남의 자리에서
     대기 칸·휴지통을 볼 때 누구 자리인지 사라진다. */
  assert.match(r, /screen === 'pending'\) \{ m\.innerHTML = banner \+/);
  assert.match(r, /screen === 'trash'\) \{ m\.innerHTML = banner \+/);
  ['screenSites', 'screenDrawer'].forEach(fn =>
    assert.match(cut(fn), /bannerHtml\(\)/, fn + ' 이 띠를 안 그립니다'));
});
