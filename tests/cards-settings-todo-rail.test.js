/* 🔔 지금 손볼 것 — 환경설정 맨 위 띠 (대표 결정 2026-09-05 「나」= 목업 ㉯)

   ■ 왜 만들었나
   서른 개 단추 가운데 «할 일»은 정리 탭의 여덟뿐인데, 그 탭을 눌러야만 숫자가 보였다.
   대표 화면에는 이미 105묶음·66건·14장·41건이 쌓여 있었는데, 환경설정을 열었을 때
   첫 화면(데이터)에서는 아무것도 안 보였다 — 가장 중요한 숫자가 가장 깊이 숨어 있었다.

   ★ 못 박는 것
     ① 숫자가 «있는 것만» 띠에 오른다 — 「이상 없음」까지 올리면 띠가 배경이 된다
     ② 할 일이 없으면 «그렇게 말한다» — 띠가 그냥 사라지면 고장인지 알 수 없다
     ③ 탭을 옮길 때마다 다시 안 센다 · 정리한 «뒤»에는 반드시 다시 센다
     ④ 하나가 터져도 나머지는 센다
     ⑤ 띠에서 «지우지 않는다» — 정리 탭까지만 데려간다

     node --test tests/cards-settings-todo-rail.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
function decls(selector) {
  const i = SRC.indexOf('\n' + selector + '{');
  assert.ok(i > 0, selector + ' 규칙을 못 찾았다');
  const body = SRC.slice(i + selector.length + 2, SRC.indexOf('}', i));
  const out = {};
  body.split(';').forEach(d => { const k = d.indexOf(':'); if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim(); });
  return out;
}

/* 알맹이를 통째로 떠서 «돌린다» — 셈만 손으로 쥐여준다 */
const N = (v) => ({ length: v });
function load(counts, extra) {
  const c = Object.assign({ dup: 0, sim: 0, empty: 0, moji: 0, mixed: 0, name: 0, rules: 0, trash: 0 }, counts || {});
  const trash = {};
  for (let i = 0; i < c.trash; i++) trash['t' + i] = {};
  const ctx = Object.assign({
    console,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c2 => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c2])),
    state: { tab: 'card', trash: trash, setSub: '' },
    /* ⚠ setSub 는 이 토막 «밖»에 있다(21592줄). 흉내만 내되 «무엇을 달라고 했는지»를
         받아 적는다 — 검사가 보는 것은 todoGo 가 고른 이름이다. */
    setSub: v => { ctx._sub = v; ctx.state.setSub = v || ''; ctx.renderSettingsPage(); },
    renderSettingsPage: () => { ctx._drew = (ctx._drew || 0) + 1; },
    findDupGroups: () => { ctx._ran = (ctx._ran || 0) + 1; return N(c.dup); },
    findSimilarGroups: () => N(c.sim),
    emptyTargets: () => N(c.empty),
    mojibakeTargets: () => N(c.moji),
    mixedFixList: () => N(c.mixed),
    nameFixList: () => N(c.name),
    classifyPlan: () => ({ targetN: c.rules })
  }, extra || {});
  vm.createContext(ctx);
  const a = SRC.indexOf('let _todoMemo = null;');
  /* ⚠ 2026-09-05: 탭을 없애며 「const SET_TABS=[」 가 사라졌다 — 다음 덩이의 머리로 자른다 */
  const b = SRC.indexOf('/* ══════ ⚙️ 환경설정 — 탭을 없애고');
  assert.ok(a > 0 && b > a, '알맹이를 못 찾았다');
  /* ⚠ 최상위 let/const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔 실어야 꺼내 본다 */
  vm.runInContext(SRC.slice(a, b).replace(/\nlet /g, '\nvar ').replace(/\nconst /g, '\nvar '), ctx);
  return ctx;
}

/* ── ① 숫자가 있는 것만 ── */

test('★★ 숫자가 «있는 것만» 띠에 오른다 — 「이상 없음」까지 올리면 띠가 배경이 된다', () => {
  const c = load({ sim: 105, name: 66, rules: 14, trash: 41 });
  const rows = c.todoList();
  assert.equal(rows.length, 4, '이상 없는 넷이 섞였다: ' + rows.map(r => r.label).join(','));
  assert.equal(rows.map(r => r.label).join(','), '유사 후보,이름 칸에 회사명,규칙으로 한 번에 분류,휴지통');
  assert.equal(rows.map(r => r.n).join(','), '105,66,14,41');
});

test('★ 대표님 화면 그대로 그린다 — 숫자와 낱말이 붙는다', () => {
  const c = load({ sim: 105, name: 66, rules: 14, trash: 41 });
  const h = c.todoRailHtml();
  assert.match(h, /105묶음/);
  assert.match(h, /66건/);
  assert.match(h, /14장/);
  assert.match(h, /41건/);
  assert.match(h, /지금 손볼 것 <span>4가지<\/span>/);
});

test('★ 사업자 탭에서는 명함에만 있는 갈래를 «안 센다»', () => {
  const c = load({ sim: 105, moji: 7 }, { state: { tab: 'biz', trash: {}, setSub: '' } });
  assert.equal(c.todoList().length, 0, '★ 사업자 탭에 명함용 셈이 올라왔다');
});

/* ── ② 없으면 없다고 말한다 ── */

test('★★ 할 일이 없으면 «그렇게 말한다» — 띠가 그냥 사라지면 고장인지 알 수 없다', () => {
  const c = load({});
  assert.equal(c.todoList().length, 0);
  const h = c.todoRailHtml();
  assert.match(h, /지금 손볼 것이 없습니다/);
  assert.ok(h.indexOf('todorail') < 0, '할 일이 없는데 노란 띠가 남았다');
});

/* ── ③ 세는 값을 아낀다 ── */

test('★★ 탭을 옮길 때마다 다시 «안» 센다 — 한 번 세고 기억한다', () => {
  const c = load({ sim: 3 });
  c.todoList(); c.todoList(); c.todoRailHtml();
  assert.equal(c._ran, 1, '★ ' + c._ran + '번 셌다 — 탭을 누를 때마다 명함 6,306장을 훑는다');
});

test('★★ 정리한 «뒤»에는 다시 센다 — 안 그러면 방금 치운 것이 그대로 떠 있다', () => {
  const c = load({ sim: 3 });
  c.todoList();
  c.todoBust();
  c.todoList();
  assert.equal(c._ran, 2);
  /* 버리는 자리가 «정리하는 모든 길»에 걸려 있어야 한다 — _refresh 한 곳이면 된다 */
  assert.match(bare(fnBody('_refresh')), /todoBust\(\)/,
    '★ 정리 뒤에 안 버리면 띠가 거짓말을 한다');
});

/* ── ④ 하나가 터져도 ── */

test('★★ 하나가 터져도 나머지는 센다 — 띠가 통째로 사라지면 할 일이 없는 줄 안다', () => {
  const c = load({ name: 66, trash: 41 }, {
    findSimilarGroups: () => { throw new Error('일부러 터뜨림'); }
  });
  const rows = c.todoList();
  assert.equal(rows.map(r => r.label).join(','), '이름 칸에 회사명,휴지통');
});

/* ── ⑤ 띠에서 지우지 않는다 ── */

test('★★ 띠는 «데려가기만» 한다 — 지우는 일을 띠에서 바로 실행하지 않는다', () => {
  const rail = bare(fnBody('todoRailHtml'));
  assert.ok(!/cleanEmpty\(|openMojibakeCleanup\(|Store\.(del|hardDel)/.test(rail),
    '★ 띠에서 바로 지운다 — 띠는 한눈에 보라고 만든 자리다');
  assert.match(rail, /todoGo\('/, '누르면 갈 곳이 없다');
});

test('★ 누르면 «그 화면»을 편다 — 눌러 들어간 것과 같은 자리다', () => {
  const c = load({ sim: 3, trash: 2 });
  c.todoGo('similar');
  assert.equal(c._sub, 'similar', '★ 유사 후보를 눌렀는데 딴 화면을 열었다');
  assert.equal(c.state.setSub, 'similar');
  assert.equal(c._drew, 1, '다시 그리지 않으면 아무 일도 안 일어난 것처럼 보인다');
});

test('★★ 지우는 일(빈 명함·깨진 글자)은 «정리 센터까지만» 데려간다', () => {
  const c = load({ empty: 5, moji: 3 });
  const rows = c.todoList();
  assert.equal(rows.map(r => r.label).join(','), '빈 명함,깨진 글자');
  rows.forEach(r => assert.equal(r.sub, '', r.label + ' 에 제 화면이 생겼다'));
  /* ⚠ 여기가 2026-09-05 에 «구멍»이었다 — 탭이 있던 때는 setTab('clean') 이 받아 줬는데,
       탭을 없애며 setSub(sub||'') 로 두었더니 빈 이름이 목록으로 돌아와 아무 일도
       안 일어난 것처럼 보였다. 제 화면이 없으면 정리 센터로 데려간다. */
  rows.forEach(r => { c._sub = null; c.todoGo(r.sub);
    assert.equal(c._sub, 'clean', '★ ' + r.label + ' 을 눌렀더니 제자리에 머문다'); });
});

/* ── 화면에 붙은 자리 ── */

test('★★ 띠가 «맨 위»에 있다 — 통계 칩보다도 위다', () => {
  /* ⚠ 탭이 없어졌으니 «글자 차례»가 아니라 «붙이는 식»을 본다 — 화면을 짜는 한 줄이다.
       body 는 위에서 미리 만들어 두므로 글자로만 재면 늘 띠보다 앞선다. */
  const page = fnBody('renderSettingsPage');
  /* ⚠ 「el.innerHTML = head」 는 «두 곳»이다 — 앞은 하위 화면(그것만 그린다),
       뒤가 한 화면이다. 앞을 잡으면 늘 어긋난다. */
  const at = page.lastIndexOf('el.innerHTML = head');
  assert.ok(at > 0, '★ 화면을 짜는 자리를 못 찾았다');
  const 짜기 = page.slice(at);
  const rail = 짜기.indexOf('todoRailHtml()');
  const stat = 짜기.indexOf('<div class="setstat">');
  const body = 짜기.indexOf('+ body');
  assert.ok(rail > 0, '★ 띠를 화면에 안 붙였다');
  assert.ok(rail < stat && stat < body, '★ 띠가 통계 칩·본문보다 아래에 있다');
});

test('★★ 「휴지통」은 «한 곳»에만 — 총계 칩에서 뺐다', () => {
  const page = fnBody('renderSettingsPage');
  const s0 = page.lastIndexOf('<div class="setstat">');
  const stat = page.slice(s0, page.indexOf('</div>', s0));
  assert.ok(stat.indexOf("'휴지통'") < 0,
    '★ 같은 숫자가 두 곳에 있으면 어느 쪽이 참인지 헷갈린다');
  assert.match(fnBody('todoAll'), /state\.trash/, '휴지통이 띠에도 없다');
  assert.equal(load({ trash: 41 }).todoList().map(r => r.label).join(','), '휴지통',
    '★ 휴지통 41건이 띠에 안 오른다');
});

test('★★ 띠는 «조건 없이» 붙는다 — 탭이 돌아와도(2026-09-07) 늘 맨 위다', () => {
  /* ⚠ 2026-09-07: 탭이 돌아왔다(대표 지시 「탭방식으로」). 2026-09-05 에 탭을
       없애며 이 검사가 「탭이 되살아났다」를 잡고 있었는데, 그 전제가 뒤집혔다.
     ★ 그래도 «띠가 늘 맨 위»라는 것은 그대로다(대표 결정 「나」) — 탭이 있든
       없든 안 눌러도 밀린 것이 보여야 한다. 그 한 가지만 남겨 지킨다.
     ⚠ 탭 «자리»와 배지는 tests/cards-settings-tabs.test.js 가 본다 —
       여기서 또 보면 탭 얼개가 바뀔 때 두 곳이 함께 빨개진다. */
  const page = fnBody('renderSettingsPage');
  const 짜기 = page.slice(page.lastIndexOf('el.innerHTML = head'));
  assert.match(짜기, /\+ todoRailHtml\(\)/, '★ 띠를 조건 없이 붙이지 않는다');
  assert.ok(짜기.indexOf('? todoRailHtml()') < 0, '★ 띠가 조건에 걸려 있다');
  /* 띠가 탭 줄보다 «앞»이다 — 탭 밑으로 들어가면 탭을 눌러야 보인다 */
  const 띠 = 짜기.indexOf('todoRailHtml()'), 탭 = 짜기.indexOf('+ tabs');
  assert.ok(띠 > 0 && 탭 > 띠, '★ 띠가 탭 줄보다 아래에 있다');
});

test('★ 띠와 배지는 «할 일이 있을 때만» 눈에 띈다 — 빛깔로 말한다', () => {
  const rail = decls('.todorail');
  assert.equal(rail['background'], '#fffbeb', '띠 바탕이 팔레트의 노란 계열이 아니다');
  assert.equal(decls('.setbtn .sdesc.todo')['color'], '#d97706');
  assert.equal(decls('.todorail .setbtn')['background'], '#ffffff',
    '띠 안의 단추가 띠와 같은 색이면 단추로 안 보인다');
});
