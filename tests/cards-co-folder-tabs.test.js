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
  assert.ok(folderAt > allAt, '「폴더」 칸이 「전체」보다 위에 있다');
  assert.ok(foldersLoopAt > folderAt, '폴더 목록이 「폴더」 칸보다 앞에 있다');
  /* 폴더 다음에 오는 것은 서식에서 저절로 생기는 「서류 탭」뿐이다 */
  assert.ok(side.indexOf('coviewsep') < 0, '없앤 가름줄(.coviewsep)이 되살아났다');
  assert.doesNotMatch(src, /\.coviewsep\{/, '.coviewsep 모양이 아직 남아 있다');
});

test('폴더를 고르면 그 폴더의 탭만 펼쳐진다', () => {
  const i = src.indexOf("if(state.view==='co'){");
  const side = src.slice(i, src.indexOf('$(\'pcSide\').innerHTML = h; return;', i));
  assert.match(side, /if\(!on\) return;/, '안 고른 폴더의 탭까지 그린다');
  assert.match(side, /coFTabList\(f\)/, '탭을 안 그린다');
  assert.match(side, /＋ 이 폴더에 탭 만들기/, '탭 만드는 길이 없다');
  assert.match(side, /＃ 전체/, '폴더 전체로 돌아갈 길이 없다');
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
