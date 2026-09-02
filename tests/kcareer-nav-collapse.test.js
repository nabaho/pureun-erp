'use strict';
/* 경력관리 옆줄 «상위 대시보드 + 하위 목록» (대표 승인 2026-09-01 「이대로」)

   ⚠ 이 파일은 예전에 «접기»를 지키던 검사였다. 2026-09-01 에 옆줄이 기업정보함처럼
     바뀌면서 접기가 «없어졌다» — 늘 한 그룹의 하위만 보여 접을 것이 없다.
     그래서 규칙을 새로 썼다(지우지 않았다). 지켜야 할 것은 그대로다:
     ① 옆줄이 하위 목록을 그린다 ② 고른 것을 담고 읽는다 ③ 환경설정이 맨 밑이다
     ④ 옆줄과 탭줄이 같은 차례를 쓴다 ⑤ 다시 그릴 때 끌기를 다시 건다
     ⑥ 「지금 어디」가 사라지지 않는다

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
  const 담긴것 = { nav_group: 옵션.picked === undefined ? '' : 옵션.picked, favs: '[]' };
  const 통 = Object.assign({ wiccok: [], cert: [], edu: [], consult: [], case: [] }, 옵션.stores || {});
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
    get: k => 통[k] || [],
    CAREER_CFG: {
      a1: { store: 'wiccok', filter: r => r.t !== '표창' },
      a2: { store: 'wiccok', filter: r => r.t === '표창' },
      b1: { store: 'cert' }
    },
    PU_SYNC_STORES: ['consult', 'case'],
    _isExternal: r => !!(r && r.agency),
    nav_to(id) { ctx._갔다 = id; },
    /* buildNav 끝에서 부르는 «곁다리»들 — 이 검사는 옆줄 그리기만 본다 */
    syncGroupUI() { }, renderNavAddList() { }, applyPerfAccess() { }, initNavDrag() { }
  };
  vm.createContext(ctx);
  /* 필요한 함수만 떼어 태운다 — 파일 전체를 돌리면 파이어베이스까지 붙는다 */
  for (const 이름 of ['navState', 'setNavState', 'favState', 'mkItem', 'navItemsOf',
    'navPicked', 'navPick', 'navCount', 'navGroupCount', 'buildNav', 'initGroupDrag']) {
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

const 상위 = nav => nav.querySelectorAll('.g-title').filter(n => n._cls.has('top'));
const 이름of = b => b.querySelector('.gname').textContent;
const 건수of = b => b.querySelector('.gcnt').textContent;
const 하위 = nav => nav.querySelectorAll('.g-items')
  .reduce((a, c) => a.concat(c.querySelectorAll('.nav-item')), []);

/* ══════ ① 상위 대시보드를 그린다 ══════ */
test('★★ 상위를 «큰 단추»로 그린다 — 그룹마다 하나씩', () => {
  const { nav } = 태우기();
  assert.deepEqual(상위(nav).map(이름of), ['가그룹', '나그룹'], '★ 상위 단추가 안 그려집니다');
  assert.equal(그룹덩이(nav).filter(b => b.querySelector('.g-title.top')).length, 2,
    '★ .nav-group[data-g] 짜임을 지켜야 initGroupDrag 가 순서를 바꿉니다');
});

test('★★ 「고른 것」의 하위만 그린다 — 넷을 다 펴면 열여섯 줄이 겹친다', () => {
  const { nav } = 태우기({ picked: '가그룹' });
  assert.deepEqual(하위(nav).map(n => n.querySelector('.lbl').textContent), ['가하나', '가둘'],
    '★ 고른 그룹의 하위만 나와야 합니다');
});

test('★ 하위가 하나뿐이면 줄을 «안 그린다» — 상위 단추가 이미 그 화면이다', () => {
  const { nav } = 태우기({ picked: '나그룹' });
  assert.equal(하위(nav).length, 0, '★ 한 줄짜리 하위는 군더더기입니다');
  assert.equal(nav.querySelectorAll('.nav-sec').length, 0, '★ 머리글도 안 그려야 합니다');
});

test('어느 상위 «안»인지 적는다 — 안 적으면 무슨 목록인지 모른다', () => {
  const { nav } = 태우기({ picked: '가그룹' });
  assert.equal(nav.querySelector('.nav-sec').textContent, '가그룹 안에서');
});

/* ══════ ② 고른 것을 담고 읽는다 ══════ */
test('★★ 담아 둔 «고른 상위»를 읽어 그 하위를 편다', () => {
  const { nav } = 태우기({ picked: '나그룹' });
  assert.ok(상위(nav).find(b => 이름of(b) === '나그룹')._cls.has('gsel'), '★ 고른 표시를 안 답니다');
  assert.ok(!상위(nav).find(b => 이름of(b) === '가그룹')._cls.has('gsel'));
});

test('★★ 상위를 누르면 담긴다 — 담는 사람이 없으면 새로고침에 사라진다', () => {
  const { ctx, 담긴것 } = 태우기();
  ctx.navPick('나그룹');
  assert.equal(담긴것.nav_group, '나그룹', '★ 고른 것을 안 담습니다');
});

test('★ 담긴 것이 없거나 이상하면 «첫 그룹»으로 — 빈 옆줄을 보이지 않는다', () => {
  assert.equal(태우기({ picked: '' }).ctx.navPicked(), '가그룹');
  assert.equal(태우기({ picked: '없는그룹' }).ctx.navPicked(), '가그룹',
    '★ 지워진 그룹이 담겨 있을 수 있습니다');
});

test('★★ 상위를 누르면 그 그룹의 «첫 화면»으로 간다 (대표 결정 — 한 번 클릭)', () => {
  const { ctx } = 태우기();
  ctx.navPick('가그룹', true);
  assert.equal(ctx._갔다, 'page-a1', '★ 눌러도 화면이 안 열리면 두 번 눌러야 합니다');
});

test('그냥 담기만 할 때는 화면을 «안» 옮긴다 — 옆줄이 화면을 멋대로 바꾸면 안 된다', () => {
  const { ctx } = 태우기();
  ctx.navPick('가그룹');
  assert.equal(ctx._갔다, undefined);
});

/* ══════ ③ 건수 ══════ */
test('★★ 상위·하위에 «건수»가 붙는다 — 열어 봐야 아는 것이 문제였다', () => {
  const { nav } = 태우기({
    picked: '가그룹',
    stores: { wiccok: [{ t: '위촉장' }, { t: '위촉장' }, { t: '표창' }], cert: [{}, {}] }
  });
  assert.deepEqual(하위(nav).map(n => (n.querySelector('.ncnt') || {}).textContent), ['2', '1'],
    '★ 한 통을 나눠 쓰는 화면(위촉장·표창)은 거르개로 갈라 세야 합니다');
  assert.equal(건수of(상위(nav).find(b => 이름of(b) === '가그룹')), '3', '★ 상위는 하위의 합입니다');
});

test('★ 통이 없는 화면은 «숫자를 안 그린다» — 0 을 그리면 「비었다」로 읽힌다', () => {
  const { ctx } = 태우기();
  assert.equal(ctx.navCount('page-없는것'), null, '★ 모르는 화면에 0 을 그리면 안 됩니다');
  /* 하위가 «다» 통 없음이면 상위 숫자도 비어야 한다 (이력서관리가 실제로 그렇다) */
  ctx.NAV.push({ g: '통없는그룹', items: [['page-x1', '엑스'], ['page-x2', '와이']] });
  assert.equal(ctx.navGroupCount('통없는그룹'), null);
  assert.equal(ctx.navGroupCount('가그룹'), 0, '★ 통이 있으면 비어도 0 이라고 말해야 합니다');
});

test('★ 외부기관 실적은 «수행기관이 적힌 것»만 센다 — 담긴 통이 없는 화면이다', () => {
  const { ctx } = 태우기({ stores: { consult: [{ agency: '충남' }, {}], case: [{ agency: '서산' }] } });
  assert.equal(ctx.navCount('page-puagency'), 2);
});

/* ══════ ④ 환경설정은 맨 밑 ══════ */
test('★ 환경설정이 «맨 밑»이다', () => {
  const { footer } = 태우기();
  const 순서 = footer.children.map(c => c.className);
  assert.ok(순서[순서.length - 1].includes('nav-item'), '★ 환경설정이 맨 밑이 아닙니다');
});

test('★ 「⇕ 모두 접기」는 없앴다 — 늘 한 그룹만 보여 접을 것이 없다', () => {
  const { nav, footer } = 태우기();
  assert.equal(nav.querySelectorAll('.nav-allfold').length
             + footer.querySelectorAll('.nav-allfold').length, 0);
  assert.ok(!/function toggleAllGroups|function toggleGroup/.test(bare),
    '★ 쓰지 않는 접기 코드가 남아 있습니다');
});

/* ══════ ⑤ 차례를 «한 곳»에서 매긴다 ══════ */
test('★★ 옆줄 트리와 위쪽 탭줄이 «같은 차례»를 쓴다 — 따로 매기면 셋째가 서로 다르다', () => {
  assert.match(bare.slice(bare.indexOf('\nfunction renderGroupTabs(')), /navItemsOf\(/,
    '★ 탭줄이 차례를 따로 매깁니다');
  assert.match(bare.slice(bare.indexOf('\nfunction buildNav(')), /navItemsOf\(/,
    '★ 옆줄이 차례를 따로 매깁니다');
});

/* ══════ ⑥ 옆줄을 다시 그리면 끌기도 다시 건다 ══════ */
test('★★ 옆줄을 새로 그릴 때마다 끌어 옮기기를 다시 건다', () => {
  const i = bare.indexOf('\nfunction buildNav(');
  const fn = bare.slice(i, bare.indexOf('\nfunction ', i + 20));
  assert.match(fn, /initGroupDrag/, '★ 상위 순서 끌기를 다시 안 겁니다');
  assert.match(fn, /initNavDrag/, '★ 하위 순서 끌기를 다시 안 겁니다');
});

/* ══════ ⑦ 「지금 어디」가 사라지지 않는다 ══════ */
test('★★ 켜진 상위는 «펼친 것»으로 칠한다 — 화면의 그룹으로 칠하면 홈에서 넷 다 꺼진다', () => {
  /* 실측 2026-09-01: 홈(그룹 없음)에서 상위가 하나도 안 켜져 무엇을 펼쳤는지 안 보였다 */
  const fn = bare.slice(bare.indexOf('\nfunction syncGroupUI('));
  assert.match(fn.slice(0, 1400), /navPicked\(\)[\s\S]{0,240}gsel/,
    '★ 켜진 상위를 «펼친 것»으로 칠해야 합니다');
  assert.match(bare, /\.g-title\.top\.gsel\{/, '★ 그 표시의 꾸밈이 없습니다');
});

test('★★ 다른 그룹 화면으로 가면 «펼친 상위»가 따라온다 — 즐겨찾기·검색으로 건너뛸 때', () => {
  const fn = bare.slice(bare.indexOf('\nfunction syncGroupUI('));
  assert.match(fn.slice(0, 900), /navPicked\(\)!==grp/, '★ 엉뚱한 그룹을 펼친 채로 남습니다');
  assert.match(fn.slice(0, 900), /buildNav\(\)/);
});

test('★★ 옆줄을 다시 그려도 «지금 이 화면» 표시가 남는다', () => {
  const s = bare.slice(bare.indexOf('\nfunction syncGroupUI('));
  assert.match(s.slice(0, 1700), /nav-item[\s\S]{0,140}toggle\('active'/);
  const i = bare.indexOf('\nfunction nav_to(');
  const nt = bare.slice(i, bare.indexOf('\nfunction ', i + 20));
  assert.ok(!/toggle\('active', n\.dataset\.id/.test(nt),
    '★ 표시를 두 곳에서 답니다 — 옆줄을 다시 그리면 한쪽만 맞습니다');
});
