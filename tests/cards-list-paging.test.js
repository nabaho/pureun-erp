/* 기업정보함 — 긴 목록을 「몇 개씩」 나눠 보기 (명함 목록 · 명함 표 · 기업 상세가 한 벌을 쓴다)
   실행: node --test tests/*.test.js

   대표 지시 2026-08-15: "거래처 4000개 한꺼번에 보면 멈춘다. 명함 사업자 똑같이
   개수 보기로 고쳐달라."
   대표 지시 2026-08-16: "명함 느린지 확인" → 폰 명함 목록도 통째로 그리고 있었다.

   재 본 값(2026-08-16)
     거래처 4,138곳 통째: 57,818조각·980ms → 200곳씩 2,833조각·34ms
     명함  6,270장 통째: 37,625조각·226ms → 100장씩   600조각·  8ms
   둘 다 네모 하나 누를 때마다 그 값을 다시 물었다.

   여기서 못 박는 것은 **자르는 규칙**이다. 무서운 것은 셋:
     ① 쪽이 범위를 벗어나 빈 화면이 되는 것 (21쪽을 보다 거르개를 켜면 3쪽뿐이다)
     ② 자르는 자리가 어긋나 어느 쪽에서도 안 보이는 줄이 생기는 것
     ③ 잘라 그리는 것을 잊고 다시 통째로 그리게 되는 것 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 목록 나눠 보기 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 목록 나눠 보기 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, Math, JSON };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j) + '\nthis.__SIZES = PAGE_SIZES; this.__LISTDEF = LIST_PAGE_DEFAULT;', ctx);
  /* 기업 상세는 같은 셈을 쓰되 기본만 200이다 */
  ctx.coSizeOk = v => ctx.pageSizeOk(v, 200);
  return ctx;
}

const mk = n => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, name: '줄' + i }));

/* ══════ 몇 개씩 ══════ */

test('명함 기본은 100장씩, 기업 상세 기본은 200곳씩', () => {
  const C = load();
  assert.equal(C.__LISTDEF, 100);
  assert.equal(C.pageSizeOk(undefined, C.__LISTDEF), 100);
  assert.equal(C.coSizeOk(undefined), 200);
});

test('아는 값만 받는다 — 저장된 값이 깨져도 목록이 통째로 사라지면 안 된다', () => {
  const C = load();
  assert.equal(C.pageSizeOk(300, 100), 300);
  assert.equal(C.pageSizeOk('500', 100), 500);
  assert.equal(C.pageSizeOk('전체', 100), 100, '모르는 글자는 기본으로');
  assert.equal(C.pageSizeOk(0, 100), 100, '0 이면 한 줄도 안 보인다');
  assert.equal(C.pageSizeOk(-5, 100), 100);
  assert.equal(C.pageSizeOk(7, 100), 100, '목록에 없는 숫자는 기본으로');
});

test("'all' 은 전체로 받아 준다 — 명함 표가 예전부터 쓰던 표기다", () => {
  const C = load();
  assert.equal(C.pageSizeOk('all', 100), 999999);
});

test('기본값 자리에 헛값이 와도 100으로 버틴다', () => {
  const C = load();
  assert.equal(C.pageSizeOk('모름', 7), 100);
});

/* ══════ 쪽수 세기 ══════ */

test('딱 나누어떨어져도 빈 쪽을 만들지 않는다', () => {
  const C = load();
  assert.equal(C.pageCount(400, 200), 2);
  assert.equal(C.pageCount(401, 200), 3);
});

test('하나도 없어도 1쪽이다 — 0쪽이면 「0/0쪽」이라 적힌다', () => {
  const C = load();
  assert.equal(C.pageCount(0, 200), 1);
});

test('4,138곳을 200개씩이면 21쪽, 명함 6,270장을 100장씩이면 63쪽', () => {
  const C = load();
  assert.equal(C.pageCount(4138, 200), 21);
  assert.equal(C.pageCount(6270, 100), 63);
});

test('개수가 헛값이어도 쪽수를 0으로 나누지 않는다', () => {
  const C = load();
  assert.equal(C.pageCount(500, 0), 5, '기본 100으로 되돌려 센다');
  assert.ok(Number.isFinite(C.pageCount(500, -1)));
});

/* ══════ 쪽 번호를 범위 안으로 ══════ */

test('21쪽을 보다 목록이 3쪽으로 줄면 마지막 쪽으로 당긴다 — 빈 화면이 되면 안 된다', () => {
  const C = load();
  assert.equal(C.pageClamp(20, 500, 200), 2);
});

test('음수·이상한 값은 첫 쪽으로', () => {
  const C = load();
  assert.equal(C.pageClamp(-3, 4138, 200), 0);
  assert.equal(C.pageClamp(null, 4138, 200), 0);
  assert.equal(C.pageClamp('두쪽', 4138, 200), 0);
});

/* ══════ 잘라 주기 ══════ */

test('첫 쪽은 1–200번째', () => {
  const C = load();
  const r = C.pageSlice(mk(4138), 0, 200);
  assert.equal(r.rows.length, 200);
  assert.equal(r.from, 1);
  assert.equal(r.to, 200);
  assert.equal(r.page, 0);
  assert.equal(r.pages, 21);
  assert.equal(r.total, 4138, '전체 개수는 자른 뒤에도 그대로여야 한다');
});

test('마지막 쪽은 남은 것만 — 없는 것을 채워 넣지 않는다', () => {
  const C = load();
  const r = C.pageSlice(mk(4138), 20, 200);
  assert.equal(r.rows.length, 138);
  assert.equal(r.from, 4001);
  assert.equal(r.to, 4138);
});

test('넘겨도 이어진다 — 1쪽 끝 다음이 2쪽 처음이다', () => {
  /* 자르는 자리가 하나만 어긋나도 한 줄이 어느 쪽에서도 안 보이게 된다. */
  const C = load();
  const list = mk(4138);
  const p1 = C.pageSlice(list, 0, 200);
  const p2 = C.pageSlice(list, 1, 200);
  assert.equal(p1.rows[p1.rows.length - 1].id, 'k199');
  assert.equal(p2.rows[0].id, 'k200');
  assert.equal(p2.from, 201);
});

test('모든 쪽을 이으면 원래 목록 그대로 — 빠지거나 겹치는 줄이 없다', () => {
  const C = load();
  [[4138, 200], [6270, 100], [137, 50]].forEach(([n, size]) => {
    const list = mk(n);
    let got = [];
    for (let p = 0; p < C.pageCount(n, size); p++) got = got.concat(C.pageSlice(list, p, size).rows);
    assert.deepEqual(got.map(o => o.id), list.map(o => o.id), n + '개를 ' + size + '씩');
  });
});

test('범위 밖 쪽을 달라고 해도 빈 화면이 아니라 마지막 쪽을 준다', () => {
  const C = load();
  const r = C.pageSlice(mk(500), 99, 200);
  assert.equal(r.page, 2);
  assert.ok(r.rows.length > 0, '빈 화면이 되면 안 된다');
});

test('하나도 없으면 빈 목록이고 몇 번째 표기는 0', () => {
  const C = load();
  const r = C.pageSlice([], 0, 200);
  assert.equal(r.rows.length, 0);
  assert.equal(r.total, 0);
  assert.equal(r.from, 0, '「1–0번째」라고 적히면 안 된다');
  assert.equal(r.pages, 1);
});

test('목록이 없거나 이상해도 터지지 않는다', () => {
  const C = load();
  assert.equal(C.pageSlice(null, 0, 200).total, 0);
  assert.equal(C.pageSlice(undefined, 3, 100).rows.length, 0);
});

test('「전체」를 고르면 한 쪽에 다 담긴다', () => {
  const C = load();
  const r = C.pageSlice(mk(6270), 0, 999999);
  assert.equal(r.rows.length, 6270);
  assert.equal(r.pages, 1);
});

test('자른 쪽 수가 고른 개수보다 많은 일은 없다 — 화면이 멈추는 원인', () => {
  const C = load();
  [50, 100, 200, 300, 500].forEach(size => {
    const r = C.pageSlice(mk(6270), 0, size);
    assert.ok(r.rows.length <= size, size + '개씩인데 ' + r.rows.length + '줄을 그린다');
  });
});

/* ══════ ⭐ 즐겨찾기를 맨 앞으로 ══════ */

test('즐겨찾기가 먼저, 나머지는 원래 차례 그대로', () => {
  /* 잘라 그리려면 «자르기 전에» 차례가 정해져 있어야 한다. */
  const C = load();
  const items = [{ id: 'a' }, { id: 'b', fav: 1 }, { id: 'c' }, { id: 'd', fav: 1 }];
  assert.deepEqual(C.favFirst(items).map(o => o.id), ['b', 'd', 'a', 'c']);
});

test('즐겨찾기가 없거나 목록이 비어도 터지지 않는다', () => {
  const C = load();
  assert.deepEqual(C.favFirst([{ id: 'a' }]).map(o => o.id), ['a']);
  /* vm 밖과 안의 Array 는 서로 다른 것이라 빈 배열끼리도 deepEqual 이 안 된다 — 길이로 본다 */
  assert.equal(C.favFirst([]).length, 0);
  assert.equal(C.favFirst(null).length, 0);
});

test('즐겨찾기가 101장이면 1쪽은 전부 즐겨찾기다 — 차례가 쪽을 건너뛰지 않는다', () => {
  const C = load();
  const items = Array.from({ length: 300 }, (_, i) => ({ id: 'i' + i, fav: i < 101 ? 1 : 0 }));
  const p1 = C.pageSlice(C.favFirst(items), 0, 100);
  const p2 = C.pageSlice(C.favFirst(items), 1, 100);
  assert.ok(p1.rows.every(o => o.fav), '1쪽은 모두 즐겨찾기여야 한다');
  assert.ok(p2.rows[0].fav, '2쪽 첫 줄도 아직 즐겨찾기(101번째)여야 한다');
  assert.ok(!p2.rows[1].fav, '그 다음부터는 나머지');
});

/* ══════ 화면에 실제로 걸려 있는가 ══════ */

test('폰 명함 목록이 잘라 그린다 — 통째로 그리던 옛 코드가 사라졌다', () => {
  const i = src.indexOf('function renderList(){');
  const fn = src.slice(i, src.indexOf('\n/* ── 화면에 들어온 명함만', i));
  assert.ok(fn.includes('pageSlice('), '잘라 그려야 한다');
  assert.ok(fn.includes('favFirst('), '자르기 전에 차례를 정해야 한다');
  assert.ok(!/rest\.forEach\(/.test(fn), '즐겨찾기와 나머지를 따로 돌던 옛 코드가 남아 있다');
  assert.ok(fn.includes("pagerHtml(info, '장', 'listGoPage')"), '쪽 옮기기가 목록 끝에 있어야 한다');
});

test('명함 표와 폰 목록이 같은 쪽·같은 개수를 본다', () => {
  /* 따로 두면 폰에서 3쪽을 보다 PC로 가면 엉뚱한 쪽이 열린다. */
  const i = src.indexOf('function renderList(){');
  const fn = src.slice(i, src.indexOf('\n/* ── 화면에 들어온 명함만', i));
  assert.ok(fn.includes('state.page'), 'state.page 를 써야 한다');
  assert.ok(fn.includes('state.pageSize'), 'state.pageSize 를 써야 한다');
});

test('기업 상세도 같은 셈을 쓴다 — 자르는 코드가 두 벌이면 한쪽만 고쳐진다', () => {
  const i = src.indexOf('function coPage()');
  const fn = src.slice(i, i + 300);
  assert.ok(fn.includes('pageSlice('), '같은 자르기를 써야 한다');
  assert.ok(!src.includes('function coPageSlice('), '옛 전용 자르기가 남아 있다');
  assert.ok(!src.includes('function coPageCount('), '옛 전용 쪽수 세기가 남아 있다');
});

test('갈래·찾기·폴더를 바꾸면 첫 쪽으로 돌아간다', () => {
  /* 30쪽을 보다 사업자 탭(12장)으로 가면 그 쪽이 없어 빈 화면이 된다. */
  const at = name => {
    const i = src.indexOf(name);
    assert.ok(i > 0, name + ' 을 못 찾음');
    return src.slice(i, i + 500);
  };
  assert.ok(at('function setTab(tab){').includes('state.page=0'), '갈래를 바꿀 때');
  assert.ok(at('function onMobileSearchInput(').includes('state.page = 0'), '찾을 때');
  assert.ok(at('function onGroupChoice(').includes('state.page = 0'), '폴더를 고를 때');
});

test('쪽을 옮기면 맨 위로 올려 준다 — 새 쪽의 한가운데가 보이면 안 된다', () => {
  const i = src.indexOf('function listGoPage(');
  const fn = src.slice(i, i + 300);
  assert.ok(/scrollTo|scrollTop/.test(fn), '맨 위로 올리는 코드가 없다');
});
