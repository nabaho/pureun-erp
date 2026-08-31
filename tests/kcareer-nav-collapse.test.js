'use strict';
/* 경력관리 옆줄 «접기» — 되살린 것을 지킨다 (대표 지시 2026-08-30 「되살림」)

   ■ 왜 이 검사가 있나
   접기는 예전에 있었는데 «조용히 죽어 있었다» — 꾸밈(CSS)만 남고 그것을 쓰는 코드가
   사라져, 접은 상태를 담는 칸(nav_state)에 **쓰는 사람도 읽는 사람도 없었다.**
   `const st=navState()` 를 받아 놓고 한 번도 안 쓰는 채로 오래 있었다.
   구문오류도 없고 검사도 다 통과하니 아무도 몰랐다.

   ■ 그래서 «글자»가 아니라 «움직임»을 본다
   가짜 화면(DOM 흉내)에 **진짜 buildNav 를 태워** 그린 것을 센다.
   글자만 찾으면 「함수는 있는데 아무 일도 안 한다」를 못 잡는다 — 그게 이번 병이었다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { stripComments } = require('./strip-comments');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 글자로 보는 검사는 «주석을 걷고» 본다. 안 걷었더니 「initNavDrag 를 다시 건다」가
   부르는 줄을 지워도 통과했다 — 바로 위 주석에 그 이름이 적혀 있었기 때문이다.
   ⚠ 손으로 지우지 말 것(마크업의 accept="image/별표" 를 주석 시작으로 읽는다) — 공용 걷개를 쓴다. */
const bare = stripComments(source);

/* ── 아주 작은 DOM 흉내 — buildNav 가 실제로 쓰는 것만 ── */
function 만들기(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), children: [], parentElement: null,
    dataset: {}, style: {}, _cls: new Set(), _text: '', _html: '', title: '', draggable: false,
    onclick: null, addEventListener() { }, appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    insertBefore(c) { el.children.push(c); return c; },
    get className() { return [...el._cls].join(' '); },
    set className(v) { el._cls = new Set(String(v || '').split(/\s+/).filter(Boolean)); },
    classList: {
      add(...c) { c.forEach(x => el._cls.add(x)); }, remove(...c) { c.forEach(x => el._cls.delete(x)); },
      contains(c) { return el._cls.has(c); }, toggle(c, on) { on ? el._cls.add(c) : el._cls.delete(c); }
    },
    get textContent() { return el._text || el.children.map(c => c.textContent).join(''); },
    set textContent(v) { el._text = String(v); el.children = []; },
    get innerHTML() { return el._html; },
    set innerHTML(v) {
      el._html = String(v); el.children = [];
      /* 옆줄에서 innerHTML 로 만드는 것은 «한 겹 span» 뿐이다(화살표·이름·별) */
      for (const m of String(v).matchAll(/<span class="([^"]*)">([^<]*)<\/span>/g)) {
        const s = 만들기('span'); s.className = m[1]; if (m[2]) s.textContent = m[2]; el.appendChild(s);
      }
    },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const 모두 = []; (function 훑기(n) { n.children.forEach(c => { 모두.push(c); 훑기(c); }); })(el);
      /* 쓰는 고르개가 몇 안 된다 — 그것만 안다 */
      const cls = (sel.match(/\.([\w-]+)/g) || []).map(s => s.slice(1));
      const 태그속성 = /\[data-g\]/.test(sel);
      return 모두.filter(n => cls.every(c => n._cls.has(c)) && (!태그속성 || n.dataset.g !== undefined));
    }
  };
  return el;
}

function 태우기(옵션) {
  옵션 = 옵션 || {};
  const 담긴것 = { nav_state: 옵션.navState === undefined ? '{}' : 옵션.navState, favs: '[]' };
  const nav = 만들기('div'), footer = 만들기('div');
  const ctx = {
    console, Object, Array, String, JSON, Math, Set, RegExp,
    document: {
      getElementById(id) { return id === 'nav' ? nav : id === 'navFooter' ? footer : null; },
      createElement: 만들기,
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    NS: 'kc_', LS: { get: k => 담긴것[k.slice(3)], set: (k, v) => { 담긴것[k.slice(3)] = v; } },
    _safe(fn) { try { fn(); } catch (e) { } },
    navSyncPush() { },
    getGroupOrder: () => [],
    getNavOrder: () => [],
    NAV: [
      { g: '가그룹', items: [['page-a1', '가하나'], ['page-a2', '가둘']] },
      { g: '나그룹', items: [['page-b1', '나하나']] },
      { g: null, items: [['page-settings', '환경설정']] }
    ],
    navInfo: id => ({ label: id, grp: null }),
    /* buildNav 끝에서 부르는 «곁다리»들 — 이 검사는 옆줄 그리기만 본다 */
    syncGroupUI() { }, renderNavAddList() { }, applyPerfAccess() { }, initNavDrag() { }
  };
  vm.createContext(ctx);
  /* 필요한 함수만 떼어 태운다 — 파일 전체를 돌리면 파이어베이스까지 붙는다 */
  for (const 이름 of ['navState', 'setNavState', 'favState', 'mkItem', 'navItemsOf',
    'toggleGroup', 'toggleAllGroups', 'buildNav', 'initGroupDrag']) {
    const i = source.indexOf('\nfunction ' + 이름 + '(');
    assert.ok(i > 0, 이름 + ' 를 찾지 못했습니다');
    const j = source.indexOf('\n}', i);
    vm.runInContext(source.slice(i, j + 2), ctx);
  }
  ctx.buildNav();
  return { ctx, nav, footer, 담긴것 };
}

const 그룹덩이 = nav => nav.querySelectorAll('.nav-group').filter(n => n.dataset.g);
const 보이는화면 = nav => nav.querySelectorAll('.g-items').reduce(
  (n, c) => n + (c.style.display === 'none' ? 0 : c.querySelectorAll('.nav-item').length), 0);

/* ══════ ① 옆줄이 «화면 목록»을 그린다 ══════ */
test('★★ 옆줄이 그룹 아래에 화면 목록을 그린다 — 안 그리면 접을 것이 없다', () => {
  const { nav } = 태우기();
  assert.equal(그룹덩이(nav).length, 2, '★ 그룹 덩이를 안 만듭니다');
  assert.equal(보이는화면(nav), 3, '★ 화면 목록이 안 나옵니다 — 옆줄이 그룹 이름만 보여 줍니다');
});

/* ══════ ② 접힘 표시를 «읽는다» ══════ */
test('★★ 담아 둔 접힘 표시를 읽어 그 그룹을 접어 그린다', () => {
  const { nav } = 태우기({ navState: '{"가그룹":true}' });
  const 가 = 그룹덩이(nav).find(b => b.dataset.g === '가그룹');
  assert.ok(가.querySelector('.g-title').classList.contains('collapsed'), '★ 접힘 표시를 안 답니다');
  assert.equal(보이는화면(nav), 1, '★ 접었는데 그 그룹 화면이 그대로 보입니다');
});

test('★★ 접혀 있어도 .g-items 칸은 만든다 — 끌어 옮기기가 짝으로 찾는다', () => {
  const { nav } = 태우기({ navState: '{"가그룹":true,"나그룹":true}' });
  assert.equal(nav.querySelectorAll('.g-items').length, 2,
    '★ 접힌 그룹의 칸을 안 만들면 그 그룹만 순서 바꾸기가 조용히 죽습니다');
});

/* ══════ ③ 접힘 표시를 «쓴다» ══════ */
test('★★ 그룹을 접으면 그 사실이 담긴다 — 담는 사람이 없으면 새로고침에 사라진다', () => {
  const { ctx, 담긴것 } = 태우기();
  ctx.toggleGroup('가그룹');
  assert.deepEqual(JSON.parse(담긴것.nav_state), { 가그룹: true }, '★ 접은 것을 안 담습니다');
  ctx.toggleGroup('가그룹');
  assert.deepEqual(JSON.parse(담긴것.nav_state), {}, '★ 편 뒤에도 접힘 표시가 남습니다');
});

test('★ 뜻을 뒤집지 않는다 — «담긴 것 = 접힌 것»', () => {
  /* 예전 기기에 담긴 값이 그대로 넘어온다(기기끼리 맞춰지는 칸이다).
     뜻을 뒤집으면 다른 PC 에서 접어 둔 것이 «펴진 것»으로 읽힌다. */
  const { nav } = 태우기({ navState: '{"나그룹":true}' });
  const 나 = 그룹덩이(nav).find(b => b.dataset.g === '나그룹');
  assert.ok(나.querySelector('.g-title').classList.contains('collapsed'));
  const 가 = 그룹덩이(nav).find(b => b.dataset.g === '가그룹');
  assert.ok(!가.querySelector('.g-title').classList.contains('collapsed'), '★ 안 담긴 그룹까지 접혔습니다');
});

/* ══════ ④ 모두 접기 / 펴기 ══════ */
test('★★ 「모두 접기」는 다 접고, 다 접혀 있으면 «다 편다»', () => {
  const { ctx, 담긴것 } = 태우기();
  ctx.toggleAllGroups();
  assert.deepEqual(JSON.parse(담긴것.nav_state), { 가그룹: true, 나그룹: true }, '★ 모두 안 접힙니다');
  ctx.toggleAllGroups();
  assert.deepEqual(JSON.parse(담긴것.nav_state), {}, '★ 다 접힌 뒤에 눌러도 안 펴집니다 — 되돌릴 길이 없습니다');
});

test('★ 하나만 펴져 있어도 「모두 접기」다 — 눌렀는데 반대로 열리면 안 된다', () => {
  const { ctx, 담긴것 } = 태우기({ navState: '{"가그룹":true}' });
  ctx.toggleAllGroups();
  assert.deepEqual(JSON.parse(담긴것.nav_state), { 가그룹: true, 나그룹: true });
});

test('★ 「모두 접기」 단추가 옆줄 아래에 있고, 환경설정이 «맨 밑»이다', () => {
  const { footer } = 태우기();
  const 순서 = footer.children.map(c => c.className);
  assert.ok(순서[0].includes('nav-allfold'), '★ 「모두 접기」 단추가 없습니다');
  assert.ok(순서[순서.length - 1].includes('nav-item'), '★ 환경설정이 맨 밑이 아닙니다');
});

/* ══════ ⑤ 차례를 «한 곳»에서 매긴다 ══════ */
test('★★ 옆줄 트리와 위쪽 탭줄이 «같은 차례»를 쓴다 — 따로 매기면 셋째가 서로 다르다', () => {
  assert.match(bare.slice(bare.indexOf('\nfunction renderGroupTabs(')), /navItemsOf\(/,
    '★ 탭줄이 차례를 따로 매깁니다');
  assert.match(bare.slice(bare.indexOf('\nfunction buildNav(')), /navItemsOf\(/,
    '★ 옆줄이 차례를 따로 매깁니다');
});

/* ══════ ⑥ 옆줄을 다시 그리면 끌기도 다시 건다 ══════ */
test('★★ 옆줄을 새로 그릴 때마다 끌어 옮기기를 다시 건다 — 한 번 접으면 죽던 자리', () => {
  /* ⚠ 끝을 «다음 함수 이름»으로 잡지 말 것 — 그 이름이 죽어 지워지면 검사가 조용히
     엉뚱한 데까지 읽는다(처음에 selectGroup 을 이름표로 썼다가 겪었다).
     그냥 «다음 함수가 시작하는 곳»까지 읽는다. */
  const i = bare.indexOf('\nfunction buildNav(');
  const fn = bare.slice(i, bare.indexOf('\nfunction ', i + 20));
  assert.match(fn, /initGroupDrag/, '★ 그룹 끌기를 다시 안 겁니다');
  assert.match(fn, /initNavDrag/, '★ 화면 끌기를 다시 안 겁니다 — 접었다 펴면 순서를 못 바꿉니다');
});

/* ══════ ⑦ 「지금 어디」가 사라지지 않는다 ══════ */
test('★★ 접어 둔 채로도 «지금 그룹»이 표시된다 — 안 그러면 길을 잃는다', () => {
  const fn = bare.slice(bare.indexOf('\nfunction syncGroupUI('));
  assert.match(fn.slice(0, 400), /g-title\[data-g\][\s\S]{0,120}gsel/,
    '★ 그룹 제목에 «지금 어디» 표시를 안 답니다');
  assert.match(bare, /\.nav-group>\.g-title\.gsel\{/, '★ 그 표시의 꾸밈이 없습니다');
});

test('★★ 접었다 펴도 «지금 이 화면» 표시가 옆줄에 남는다', () => {
  /* ⚠ 실제로 겪은 것: 표시를 nav_to 안에서만 달았더니, 그룹을 접었다 펴서 옆줄을
       다시 그리면 새로 만든 줄에는 표시가 없어 «보고 있는 화면이 옆줄에서 사라졌다».
       다는 곳은 syncGroupUI 한 곳이어야 한다 — buildNav 도 그것을 부른다. */
  const s = bare.slice(bare.indexOf('\nfunction syncGroupUI('));
  assert.match(s.slice(0, 900), /nav-item[\s\S]{0,120}toggle\('active'/,
    '★ 옆줄을 다시 그리면 「지금 이 화면」 표시가 사라집니다');
  const i = bare.indexOf('\nfunction nav_to(');
  const nt = bare.slice(i, bare.indexOf('\nfunction ', i + 20));
  assert.ok(!/toggle\('active', n\.dataset\.id/.test(nt),
    '★ 표시를 두 곳에서 답니다 — 옆줄을 다시 그리면 한쪽만 맞습니다');
});

test('★ 화면을 옮겼다고 접어 둔 그룹이 «저절로 펴지지» 않는다', () => {
  const fn = bare.slice(bare.indexOf('\nfunction syncGroupUI('), bare.indexOf('\nfunction nav_to('));
  assert.ok(!/setNavState|toggleGroup/.test(fn),
    '★ 화면만 옮겨도 접힘이 풀립니다 — 그러면 「모두 접기」가 곧바로 헛일이 됩니다');
});
