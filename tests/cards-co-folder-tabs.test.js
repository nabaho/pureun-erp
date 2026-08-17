/* 기업 상세 — 옆줄을 명함과 같은 모양으로 + 폴더 안의 탭.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-16
     "명함 대시보드와 같이 기업상세 대시보드도 같은 형태로 만들어라"
     "전체 이후에 폴더 생성으로 정리할 수있게 거래처만 처럼 고정되면 안된다"
     "폴더 안에 메인에 탭을 만들 수 있도록 해달라"

   ★ 무엇을 바꿨나
     「거래처만」이 폴더 자리에 붙박이로 끼어 있어, 새 폴더를 만들어도 늘 그 아래로
     밀렸다. 폴더가 아닌데 폴더인 척 서 있던 것이다. 「보기」 칸으로 올려 폴더 자리를
     비웠다. 폴더를 누르면 그 아래에 그 폴더의 ＃탭이 펼쳐진다.

   ★ 여기서 못 박는 것
     ① 탭은 폴더에 딸린다 — 폴더마다 같은 이름 탭이 있어도 서로 안 섞인다
     ② 숫자는 그 폴더 «안»의 회사만 센다
     ③ 담기는 모아서 보낸다 (한 곳씩이면 4,138번 — 2026-08-16 폭주의 교훈)
     ④ 탭을 지워도 회사는 안 지워진다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function load(){
  const a = '/* ══════ 폴더 안의 탭 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 폴더 안의 탭 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0 && j > i, '표식을 못찾음');
  const ctx = { console, Object, Array, String, Number, Math };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

const co = (key, folder, ftabs) => ({ key: key, folder: folder || '',
  extra: ftabs ? { ftabs: ftabs } : {} });

/* 탭 «줄»을 실제로 그려 본다 — 소스에 글자가 있나가 아니라 무엇이 나오는가를 본다.
   순수 로직(coFTabList·coFTabCounts)을 흉내 내지 않고 진짜 본문과 함께 돌린다. */
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
function loadTabsHtml(over){
  const o = over || {};
  const a = '/* ══════ 폴더 안의 탭 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 폴더 안의 탭 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0 && j > i, '표식을 못찾음');
  const r = src.indexOf('function renderCoFTabsHtml');
  const rEnd = src.indexOf('\nfunction pickCoFTab', r);
  assert.ok(r > 0 && rEnd > r, 'renderCoFTabsHtml 을 찾지 못했습니다 — ＃탭 줄이 사라졌다');
  const state = Object.assign({ view:'co', coFolder:'', coFTab:'', isAdmin:true }, o.state || {});
  const ctx = { console, Object, Array, String, Number, Math, esc, state,
    _coFolders: o.coFolders || {}, coList: () => o.cos || [] };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j) + '\n' + src.slice(r, rEnd), ctx);
  return ctx;
}
/* 폴더 하나 + 탭 둘, 회사 셋(하나는 폴더 밖) */
const TABS_FIXTURE = {
  coFolders: { f1: { id:'f1', name:'현장클리닉',
                     tabs: { t1:{ name:'1차', order:1 }, t2:{ name:"오'늘", order:2 } } } },
  cos: [ co('a','f1',{ t1:true }), co('b','f1',{ t1:true, t2:true }), co('c','') ]
};

/* ══════ ① 탭은 폴더에 딸린다 ══════ */

test('폴더에 만들어 둔 탭을 만든 차례대로 준다', () => {
  const C = load();
  const f = { tabs: { t2: { name: '나중', order: 200 }, t1: { name: '먼저', order: 100 } } };
  assert.deepEqual(C.coFTabList(f).map(t => t.id), ['t1', 't2']);
});

test('차례가 같으면 이름순 — 자리가 들쭉날쭉하면 안 된다', () => {
  const C = load();
  const f = { tabs: { b: { name: '나', order: 1 }, a: { name: '가', order: 1 } } };
  assert.deepEqual(C.coFTabList(f).map(t => t.name), ['가', '나']);
});

test('탭이 없거나 폴더가 없어도 터지지 않는다', () => {
  const C = load();
  assert.equal(C.coFTabList(null).length, 0);
  assert.equal(C.coFTabList({}).length, 0);
  assert.equal(C.coFTabList({ tabs: {} }).length, 0);
});

test('이름이 빠진 탭도 목록에서 사라지지 않는다 — 지울 길이 있어야 한다', () => {
  const C = load();
  const got = C.coFTabList({ tabs: { t1: {} } });
  assert.equal(got.length, 1);
  assert.equal(got[0].name, '이름 없음');
});

/* ══════ ② 숫자는 그 폴더 안의 회사만 ══════ */

test('폴더 안의 회사만 센다 — 밖에 있는 회사의 옛 탭 표시는 안 센다', () => {
  const C = load();
  const list = [
    co('a', 'f1', { t1: true }),
    co('b', 'f1', { t1: true }),
    co('c', 'f2', { t1: true }),      /* 다른 폴더 — 세면 안 된다 */
    co('d', '',   { t1: true })       /* 폴더 밖 — 세면 안 된다 */
  ];
  const cnt = C.coFTabCounts(list, 'f1');
  assert.equal(cnt.all, 2);
  assert.equal(cnt.byTab.t1, 2);
});

test('탭에 안 담긴 회사도 「＃ 전체」에는 들어간다', () => {
  const C = load();
  const cnt = C.coFTabCounts([co('a', 'f1', { t1: true }), co('b', 'f1')], 'f1');
  assert.equal(cnt.all, 2);
  assert.equal(cnt.byTab.t1, 1);
});

test('한 회사가 탭 여러 개에 담길 수 있다', () => {
  const C = load();
  const cnt = C.coFTabCounts([co('a', 'f1', { t1: true, t2: true })], 'f1');
  assert.equal(cnt.byTab.t1, 1);
  assert.equal(cnt.byTab.t2, 1);
});

test('빈 목록에서도 0 을 준다 — 없는 값이 아니라 0 이어야 화면이 안 깨진다', () => {
  const C = load();
  const cnt = C.coFTabCounts([], 'f1');
  assert.equal(cnt.all, 0);
  assert.deepEqual(Object.keys(cnt.byTab), []);
  assert.equal(C.coFTabCounts(null, 'f1').all, 0);
});

/* ══════ ③ 담기는 모아서 ══════ */

test('4,138곳을 400곳씩 묶으면 11통', () => {
  const C = load();
  const keys = Array.from({ length: 4138 }, (_, i) => 'k' + i);
  assert.equal(C.coFTabPlan(keys, 't1', true, 400).length, 11);
});

test('담으면 true, 빼면 null — 빈 글자를 넣으면 값이 남는다', () => {
  const C = load();
  assert.equal(C.coFTabPlan(['a'], 't1', true, 400)[0]['coInfo/a/ftabs/t1'], true);
  assert.equal(C.coFTabPlan(['a'], 't1', false, 400)[0]['coInfo/a/ftabs/t1'], null);
});

test('폴더(folder) 칸은 건드리지 않는다 — 탭에 담는다고 폴더가 바뀌면 안 된다', () => {
  const C = load();
  const upd = C.coFTabPlan(['a'], 't1', true, 400)[0];
  Object.keys(upd).forEach(k => assert.ok(k.indexOf('/ftabs/') > 0, '엉뚱한 칸을 쓴다: ' + k));
});

test('탭을 안 고르면 한 통도 안 보낸다 — 어디에 담을지 모르는 채로 쓰면 안 된다', () => {
  const C = load();
  assert.equal(C.coFTabPlan(['a', 'b'], '', true, 400).length, 0);
  assert.equal(C.coFTabPlan(['a'], null, true, 400).length, 0);
});

test('고른 것이 없거나 묶음 크기가 헛값이어도 터지지 않는다', () => {
  const C = load();
  assert.equal(C.coFTabPlan([], 't1', true, 400).length, 0);
  assert.equal(C.coFTabPlan(null, 't1', true, 400).length, 0);
  assert.ok(C.coFTabPlan(['a', 'b'], 't1', true, 0).length >= 1);
});

/* ══════ ④ 화면에 걸린 방식 ══════ */

/* 2026-08-16 오전·저녁 지시로 「거래처만」의 자리를 두 번 옮겼고, 2026-08-17 에
   대표가 그것을 **없애라**고 하셨다 — "거래처만 삭제해라. 내가 새로 폴더 만들어서
   관리하겠다". 그래서 「어디에 있어야 하는가」를 지키던 두 검사를 지우고,
   그 자리에 «폴더 목록이 붙박이 줄에 밀리지 않는다»만 남긴다 —
   오전 지시의 알맹이(새 폴더가 아래로 밀리면 안 된다)는 여전히 지켜야 한다. */
test('폴더 목록 뒤에 붙박이 줄이 끼어들지 않는다 — 새 폴더가 밀리지 않게', () => {
  const i = src.indexOf("if(state.view==='co'){");
  const side = src.slice(i, src.indexOf('$(\'pcSide\').innerHTML = h; return;', i));
  const allAt    = side.indexOf("pickCoFolder('')");
  const folderAt = side.indexOf('>폴더');
  const foldersLoopAt = side.indexOf('folders.forEach');
  assert.ok(allAt >= 0, '「전체」가 없다');
  /* ⚠ 2026-08-18: 사업자 옆줄과 차례를 맞췄다 — 「폴더 ＋」 머리가 먼저고 그 다음이
     「전체」다(예전엔 거꾸로였다). 이 검사의 알맹이는 «폴더 목록이 밀리지 않는가» 이지
     둘 중 어느 것이 위인가가 아니다 — 그래서 차례만 바꿔 담는다. */
  assert.ok(allAt > folderAt, '「전체」가 「폴더」 칸보다 위에 있다 — 사업자와 어긋난다');
  assert.ok(foldersLoopAt > allAt, '폴더 목록이 「전체」보다 앞에 있다');
  /* 폴더 다음에 오는 것은 서식에서 저절로 생기는 「서류 탭」뿐이다 */
  assert.ok(side.indexOf('coviewsep') < 0, '없앤 가름줄(.coviewsep)이 되살아났다');
  assert.doesNotMatch(src, /\.coviewsep\{/, '.coviewsep 모양이 아직 남아 있다');
});

/* ══════ ⑤ 탭은 «윗줄»에 — 명함·사업자와 같은 자리 ══════
   대표 지시 2026-08-17: "이거 뭐냐 갑자기 왜 폴더 아래 이렇게 나왔나.
   탭생성은 명함이나 사업자와 같이 나와야 되는데."
   2026-08-16 에는 고른 폴더 «아래»(옆줄)에 탭을 펼쳤다. 같은 앱에서 탭이 두 모양으로
   갈라져 있던 것이라, 명함과 같은 윗줄 칩(#pcErpTabs)으로 옮겼다.
   아래 검사들은 그때 옆줄을 지키던 검사를 «옮겨 온» 것이다 — 지키는 알맹이
   (＃ 전체·폴더의 탭 목록·만드는 길·⋮ 메뉴)는 그대로다. */

test('★ 탭 줄에 「＃ 전체」 · 폴더의 탭 · 「＋ 탭 만들기」가 이 차례로 나온다', () => {
  const c = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'f1' } }));
  const h = c.renderCoFTabsHtml();
  const allAt = h.indexOf('＃ 전체');
  const t1At  = h.indexOf('1차');
  const t2At  = h.indexOf('오&#39;늘');
  const addAt = h.indexOf('＋ 탭 만들기');
  assert.ok(allAt >= 0, '폴더 전체로 돌아갈 길이 없다');
  assert.ok(t1At > allAt && t2At > t1At, '폴더의 탭이 「＃ 전체」 뒤에 차례대로 안 나온다');
  assert.ok(addAt > t2At, '탭 만드는 길이 맨 뒤에 없다');
  assert.match(h, /onclick="pickCoFTab\(''\)"/, '「＃ 전체」가 탭을 못 푼다');
  assert.match(h, /onclick="pickCoFTab\('t1'\)"/, '탭을 못 고른다');
  assert.match(h, /onclick="newCoFTab\('f1'\)"/, '탭을 만들 수 없다');
});

test('★ 탭마다 그 폴더 안의 회사 수가 함께 나온다', () => {
  const c = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'f1' } }));
  const h = c.renderCoFTabsHtml();
  /* 폴더 안 2곳(a·b), t1 에 2곳, t2 에 1곳 — 폴더 밖 c 는 안 센다 */
  assert.match(h, /＃ 전체[\s\S]*?<b[^>]*>2<\/b>/, '「＃ 전체」 숫자가 틀리다');
  assert.match(h, /1차[\s\S]*?<b[^>]*>2<\/b>/, 't1 숫자가 틀리다');
  assert.match(h, /오&#39;늘[\s\S]*?<b[^>]*>1<\/b>/, 't2 숫자가 틀리다');
});

test('★ ⋮ 이름변경·삭제 메뉴가 탭마다 그대로 닿는다', () => {
  const c = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'f1' } }));
  const h = c.renderCoFTabsHtml();
  assert.match(h, /openCoFTabMenu\(event,'f1','t1'\)/, '⋮ 메뉴가 사라졌다 — 이름변경·삭제 길이 없다');
  assert.match(h, /openCoFTabMenu\(event,'f1','t2'\)/);
  assert.ok(h.indexOf('⋮') >= 0, '⋮ 표시가 없다');
});

test('★ 탭 이름은 onclick 에 안 들어간다 — 따옴표가 든 이름이 코드를 깨면 안 된다', () => {
  const c = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'f1' } }));
  const h = c.renderCoFTabsHtml();
  /* 이름은 글자로만 나오고, 누르는 곳에는 id 만 넘어간다 */
  assert.ok(h.indexOf("오'늘") < 0, '이름이 그대로(안 감싸고) 나온다');
  assert.match(h, /오&#39;늘/, '이름이 아예 안 보인다');
});

test('★ 폴더를 안 골랐으면 칩이 하나도 없다 — 탭은 폴더에 딸린다', () => {
  const c = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'' } }));
  assert.equal(c.renderCoFTabsHtml(), '', '폴더 없이도 탭 칩이 나온다');
  /* 없는 폴더를 가리키고 있어도 터지지 않는다 */
  const c2 = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'없는폴더' } }));
  assert.equal(c2.renderCoFTabsHtml(), '');
});

test('★ 고른 탭·「＃ 전체」가 켜진 것으로 보인다', () => {
  const off = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'f1' } })).renderCoFTabsHtml();
  const on  = loadTabsHtml(Object.assign({}, TABS_FIXTURE, { state:{ coFolder:'f1', coFTab:'t1' } })).renderCoFTabsHtml();
  assert.notEqual(off, on, '탭을 골라도 칩 모양이 그대로다 — 어느 탭을 보고 있는지 모른다');
  assert.match(on, /#1d4ed8/, '고른 탭이 짙게 안 칠해진다');
});

test('★ 옆줄에는 탭이 더 이상 없다 — 옆줄은 폴더만 있는 곳이다', () => {
  const i = src.indexOf("if(state.view==='co'){");
  const side = src.slice(i, src.indexOf('$(\'pcSide\').innerHTML = h; return;', i));
  assert.ok(side.indexOf('coFTabList(f)') < 0, '옆줄이 아직 탭 목록을 그린다');
  assert.ok(side.indexOf('＋ 이 폴더에 탭 만들기') < 0, '옆줄에 탭 만들기가 남아 있다');
  assert.ok(side.indexOf("pickCoFTab(") < 0, '옆줄에 탭을 고르는 줄이 남아 있다');
  assert.ok(side.indexOf('coftabadd') < 0, '옆줄에 탭 만들기 줄 모양이 남아 있다');
});

test('★ 탭 줄은 명함·사업자와 «같은 칸(#pcErpTabs)»에 그려진다', () => {
  const i = src.indexOf('function renderErpTabs(){');
  const fn = src.slice(i, src.indexOf('\n}', i));
  assert.match(fn, /\$\('pcErpTabs'\)/, '탭 줄이 명함과 다른 칸에 그려진다');
  assert.match(fn, /state\.view==='co' \? renderCoFTabsHtml\(\)/,
    '기업 상세에서 폴더 탭을 안 그린다');
  assert.match(fn, /renderMyTabsHtml\(\)/, '명함·사업자 탭 줄이 사라졌다');
});

test('★ 기업 상세에서 탭 줄을 숨기지 않는다 — 숨기면 탭이 갈 곳이 없다', () => {
  /* 여기가 이 화면의 안전선이다. #pcErpTabs 는 #pcHead «안»에 있어, 둘 중 하나만
     숨겨도 대표가 지적한 그 상태(탭이 안 보임)로 되돌아간다. */
  const i = src.indexOf('function renderPC(){');
  const fn = src.slice(i, src.indexOf('\n}', i));
  const m = fn.match(/\[([^\]]*)\]\.forEach\(id=>\{/);
  assert.ok(m, 'renderPC 의 «숨기는 목록»을 찾지 못했습니다');
  assert.ok(m[1].indexOf('pcErpTabs') < 0,
    '기업 상세에서 탭 줄(#pcErpTabs)을 숨긴다 — 옮겨 온 탭이 화면에서 사라진다');
  assert.ok(m[1].indexOf('pcHead') < 0,
    '머리줄(#pcHead)을 통째로 숨긴다 — 그 안에 든 탭 줄까지 함께 사라진다');
  /* 폴더를 안 골랐을 때만 머리줄을 접는다 — 빈 띠를 남기지 않으려는 것 */
  assert.match(fn, /isCo && !state\.coFolder/, '폴더를 안 골랐을 때 빈 띠가 남는다');
  assert.match(fn, /classList\.toggle\('cohead', isCo\)/,
    '기업 상세에서 명함 목록의 제목·보기도구를 안 접는다');
  assert.match(fn, /if\(isCo\)\{ renderErpTabs\(\)/, '기업 상세에서 탭 줄을 안 그린다');
});

test('★ 「.cohead」 는 제목·보기도구만 접는다 — 탭 줄은 남긴다', () => {
  const i = src.indexOf('#pcHead.cohead');
  assert.ok(i > 0, '.cohead 모양이 없다');
  const rule = src.slice(i, src.indexOf('}', i));
  assert.ok(rule.indexOf('pcErpTabs') < 0, '.cohead 가 탭 줄까지 숨긴다');
  assert.match(rule, /h2/);
  assert.match(rule, /#pcTools/);
});

test('탭이 없을 때의 안내가 «윗줄»을 가리킨다 — 옆줄에는 만들 길이 없다', () => {
  const i = src.indexOf('function coAssignFTab(');
  const fn = src.slice(i, src.indexOf('\n}', i));
  assert.match(fn, /이 폴더에 탭이 없습니다/);
  assert.ok(fn.indexOf('이 폴더에 탭 만들기') < 0,
    '없어진 옆줄 「＋ 이 폴더에 탭 만들기」를 가리킨다');
  assert.match(fn, /위쪽 탭 줄의 「＋ 탭 만들기」/, '지금 화면에 있는 이름·자리로 안 알려 준다');
  /* 폴더를 안 골랐다는 안내는 그대로 «왼쪽»이다 — 폴더는 아직 옆줄에 있다 */
  assert.match(fn, /먼저 왼쪽에서 폴더를 고르세요/);
});

test('폴더가 하나도 없으면 만들라고 안내한다 — 빈 칸만 보이면 안 된다', () => {
  const i = src.indexOf("if(state.view==='co'){");
  const side = src.slice(i, src.indexOf('$(\'pcSide\').innerHTML = h; return;', i));
  assert.match(side, /if\(!folders\.length\)/);
});

test('폴더를 바꾸면 그 안에서 고른 탭이 풀린다 — 빈 목록이 되면 안 된다', () => {
  const i = src.indexOf('function pickCoFolder(k){');
  const fn = src.slice(i, i + 700);
  assert.match(fn, /state\.coFTab=''/);
});

test('목록 거르기가 폴더 안 탭을 본다', () => {
  const i = src.indexOf('function coFilteredList(');
  const fn = src.slice(i, src.indexOf('function coVisible(', i));
  assert.match(fn, /state\.coFolder && state\.coFTab/, '폴더 없이 탭만으로 거르면 안 된다');
  assert.match(fn, /coFTabsOf\(o\)/);
});

test('탭을 지워도 회사는 안 지운다', () => {
  const i = src.indexOf('function deleteCoFTab(');
  const fn = src.slice(i, src.indexOf('function coAssignFTab(', i));
  assert.match(fn, /회사는 그대로 남습니다/, '무엇이 지워지는지 안 알려 준다');
  assert.match(fn, /coFolders\/\$\{folderId\}\/tabs\/\$\{tabId\}`\)\.remove\(\)/);
  assert.ok(!/coInfo/.test(fn), '회사 쪽 자료까지 건드린다');
});

test('「폴더·탭 비우기」가 폴더 안 탭도 함께 뗀다', () => {
  const i = src.indexOf('function coClearPlan(');
  const fn = src.slice(i, src.indexOf('/* ══════ 고른 회사의 폴더·탭 비우기 — 화면', i));
  assert.match(fn, /\/ftabs'\] = null/, '폴더 탭이 남아 반쯤 비워진다');
});

test('막대의 두 단추 이름이 서로 다른 것을 가리킨다', () => {
  assert.ok(src.includes('🏷 서류 탭에 담기'), '서류 탭인지 폴더 탭인지 알 수 없다');
  assert.ok(src.includes('＃ 탭에 담기'), '폴더 탭에 담는 길이 없다');
  /* 폴더를 안 고르면 폴더 탭 담기는 안 보인다 — 눌러도 안 되는 단추를 보이면 안 된다.
     ⚠ 함수 «정의»가 아니라 «단추»를 봐야 한다 — indexOf 는 정의를 먼저 만난다. */
  const i = src.indexOf('onclick="coAssignFTab()"');
  assert.ok(i > 0, '단추가 없다');
  assert.ok(src.slice(Math.max(0, i - 200), i).includes('state.coFolder'), '폴더와 상관없이 늘 보인다');
});
