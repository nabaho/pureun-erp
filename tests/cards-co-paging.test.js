/* 명함첩 기업 상세 — 거래처 목록을 「몇 개씩」 나눠 보기.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-15: "거래처 4000개 한꺼번에 보면 멈춘다. 명함 사업자 똑같이
   개수 보기로 고쳐달라."

   명함·사업자 표는 예전부터 나눠 그리고 있었다(state.pageSize/state.page). 기업 상세만
   4,138곳을 통째로 그려 화면 조각이 57,818개가 됐고, 네모 하나 누를 때마다(coToggle)
   그것을 처음부터 다시 만들어 1초씩 멈췄다.

   여기서 못 박는 것은 **자르는 규칙**이다. 가장 무서운 것은 두 가지다:
     ① 쪽이 범위를 벗어나 빈 화면이 되는 것 (21쪽을 보다 거르개를 켜면 3쪽뿐이다)
     ② 200곳만 보이는데 4,138곳이 조용히 골라져 「폴더로 옮기기」에 딸려 가는 것 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 기업 상세 나눠 보기 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 기업 상세 나눠 보기 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, Math, JSON };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j) + '\nthis.__SIZES = CO_PAGE_SIZES; this.__DEF = CO_PAGE_DEFAULT;', ctx);
  return ctx;
}

const mk = n => Array.from({ length: n }, (_, i) => ({ key: 'k' + i, name: '회사' + i }));

/* ══════ 몇 개씩 ══════ */

test('기본은 200곳씩', () => {
  const C = load();
  assert.equal(C.__DEF, 200);
  assert.equal(C.coPageSizeOk(undefined), 200);
});

test('아는 값만 받는다 — 저장된 값이 깨져도 목록이 사라지면 안 된다', () => {
  const C = load();
  assert.equal(C.coPageSizeOk(100), 100);
  assert.equal(C.coPageSizeOk('500'), 500);
  assert.equal(C.coPageSizeOk('전체'), 200, '모르는 글자는 기본으로');
  assert.equal(C.coPageSizeOk(0), 200, '0 이면 한 줄도 안 보인다');
  assert.equal(C.coPageSizeOk(-5), 200);
  assert.equal(C.coPageSizeOk(7), 200, '목록에 없는 숫자는 기본으로');
});

test("'all' 은 전체로 받아 준다 — 명함 표의 옛 표기와 같다", () => {
  const C = load();
  assert.equal(C.coPageSizeOk('all'), 999999);
});

/* ══════ 쪽수 세기 ══════ */

test('딱 나누어떨어져도 빈 쪽을 만들지 않는다', () => {
  const C = load();
  assert.equal(C.coPageCount(400, 200), 2);
  assert.equal(C.coPageCount(401, 200), 3);
});

test('회사가 하나도 없어도 1쪽이다 — 0쪽이면 「0/0쪽」이라 적힌다', () => {
  const C = load();
  assert.equal(C.coPageCount(0, 200), 1);
});

test('4,138곳을 200개씩이면 21쪽', () => {
  const C = load();
  assert.equal(C.coPageCount(4138, 200), 21);
});

/* ══════ 쪽 번호를 범위 안으로 ══════ */

test('21쪽을 보다 목록이 3쪽으로 줄면 마지막 쪽으로 당긴다 — 빈 화면이 되면 안 된다', () => {
  const C = load();
  assert.equal(C.coPageClamp(20, 500, 200), 2);
});

test('음수·이상한 값은 첫 쪽으로', () => {
  const C = load();
  assert.equal(C.coPageClamp(-3, 4138, 200), 0);
  assert.equal(C.coPageClamp(null, 4138, 200), 0);
  assert.equal(C.coPageClamp('두쪽', 4138, 200), 0);
});

/* ══════ 잘라 주기 ══════ */

test('첫 쪽은 1–200번째', () => {
  const C = load();
  const r = C.coPageSlice(mk(4138), 0, 200);
  assert.equal(r.rows.length, 200);
  assert.equal(r.from, 1);
  assert.equal(r.to, 200);
  assert.equal(r.page, 0);
  assert.equal(r.pages, 21);
  assert.equal(r.total, 4138, '전체 개수는 자른 뒤에도 그대로여야 한다');
});

test('마지막 쪽은 남은 것만 — 없는 것을 채워 넣지 않는다', () => {
  const C = load();
  const r = C.coPageSlice(mk(4138), 20, 200);
  assert.equal(r.rows.length, 138);
  assert.equal(r.from, 4001);
  assert.equal(r.to, 4138);
});

test('넘겨도 이어진다 — 1쪽 끝 다음이 2쪽 처음이다', () => {
  /* 자르는 자리가 하나만 어긋나도 회사 한 곳이 어느 쪽에서도 안 보이게 된다. */
  const C = load();
  const list = mk(4138);
  const p1 = C.coPageSlice(list, 0, 200);
  const p2 = C.coPageSlice(list, 1, 200);
  assert.equal(p1.rows[p1.rows.length - 1].key, 'k199');
  assert.equal(p2.rows[0].key, 'k200');
  assert.equal(p2.from, 201);
});

test('모든 쪽을 이으면 원래 목록 그대로 — 빠지거나 겹치는 회사가 없다', () => {
  const C = load();
  const list = mk(4138);
  let got = [];
  for (let p = 0; p < C.coPageCount(4138, 200); p++) got = got.concat(C.coPageSlice(list, p, 200).rows);
  assert.equal(got.length, 4138);
  assert.deepEqual(got.map(o => o.key), list.map(o => o.key));
});

test('범위 밖 쪽을 달라고 해도 빈 화면이 아니라 마지막 쪽을 준다', () => {
  const C = load();
  const r = C.coPageSlice(mk(500), 99, 200);
  assert.equal(r.page, 2);
  assert.ok(r.rows.length > 0, '빈 화면이 되면 안 된다');
});

test('회사가 없으면 빈 목록이고 몇 번째 표기는 0', () => {
  const C = load();
  const r = C.coPageSlice([], 0, 200);
  assert.equal(r.rows.length, 0);
  assert.equal(r.total, 0);
  assert.equal(r.from, 0, '「1–0번째」라고 적히면 안 된다');
  assert.equal(r.pages, 1);
});

test('목록이 없거나 이상해도 터지지 않는다', () => {
  const C = load();
  assert.equal(C.coPageSlice(null, 0, 200).total, 0);
  assert.equal(C.coPageSlice(undefined, 3, 100).rows.length, 0);
});

test('「전체」를 고르면 한 쪽에 다 담긴다', () => {
  const C = load();
  const r = C.coPageSlice(mk(4138), 0, 999999);
  assert.equal(r.rows.length, 4138);
  assert.equal(r.pages, 1);
});

test('자른 쪽 수가 줄 수보다 많은 일은 없다 — 화면이 멈추는 원인', () => {
  /* 이 검사가 무너지면 4,138곳을 다시 통째로 그리게 된다. */
  const C = load();
  [50, 100, 200, 300, 500].forEach(size => {
    const r = C.coPageSlice(mk(4138), 0, size);
    assert.ok(r.rows.length <= size, size + '개씩인데 ' + r.rows.length + '줄을 그린다');
  });
});

/* ══════ 화면에 실제로 걸려 있는가 ══════ */

test('PC 표와 폰 목록이 모두 잘라 그린다', () => {
  /* 함수만 있고 아무도 안 부르면 예전처럼 통째로 그린다. */
  const cut = src.slice(src.indexOf('function coListHtml('));
  assert.ok(!/const list = coVisible\(\);[\s\S]{0,200}coListHtml/.test(src),
    'renderCoPage 가 아직 통째 목록을 넘긴다');
  assert.ok(src.includes('const info = coPage();'), 'PC 표가 쪽으로 잘라야 한다');
  assert.ok(cut.includes('coPagerHtml(info)'), '쪽 옮기기가 표 아래 있어야 한다');
  assert.ok(src.includes('coSizeSelHtml(info.size)'), '몇 개씩 고르는 칸이 있어야 한다');
});

test('번호는 쪽이 넘어가도 이어진다 — 2쪽 첫 줄이 다시 1번이면 안 된다', () => {
  const i = src.indexOf('function coListHtml(');
  const body = src.slice(i, src.indexOf('function coDocsHtml(', i));
  assert.ok(body.includes('${info.from + i}'), '번호를 쪽 시작 번호부터 매겨야 한다');
  assert.ok(!body.includes('<td class="num">${i+1}</td>'), '쪽마다 1번부터 다시 매기면 안 된다');
});

test('표 머리 네모는 지금 쪽만 고른다 — 안 보이는 회사가 딸려 가면 안 된다', () => {
  const i = src.indexOf('function coSelAll(');
  const body = src.slice(i, src.indexOf('\n}', i));
  assert.ok(body.includes('coPage()'), '지금 쪽을 봐야 한다');
  assert.ok(!/const list = coVisible\(\);/.test(body), '찾은 전체를 고르면 안 된다');
});

test('그래도 전체를 고를 길은 남아 있다', () => {
  assert.ok(src.includes('function coSelAllMatching('), '전체 고르기 함수가 있어야 한다');
  assert.ok(src.includes('coSelAllMatching()'), '막대에서 부를 수 있어야 한다');
});

test('거르개·정렬·찾기를 바꾸면 첫 쪽으로 돌아간다', () => {
  /* 21쪽을 보던 중 「거래처만」을 누르면 3쪽뿐이라 빈 화면이 된다. */
  const at = name => {
    const i = src.indexOf(name);
    assert.ok(i > 0, name + ' 을 못 찾음');
    return src.slice(i, i + 700);
  };
  assert.ok(at('function pickCoTag(').includes('state.coPage=0'), '탭을 바꿀 때');
  assert.ok(at('function toggleCoErpOnly(').includes('state.coPage=0'), '거래처만을 켤 때');
  assert.ok(at('function coSortBy(').includes('state.coPage=0'), '정렬을 바꿀 때');
  assert.ok(at('function pickCoFolder(').includes('state.coPage=0'), '폴더를 바꿀 때');
});

test('몇 개씩 볼지는 이 PC에 기억해 둔다', () => {
  assert.ok(src.includes("localStorage.setItem('pucards_co_pagesize'"), '고른 값을 적어 둬야 한다');
  assert.ok(src.includes("localStorage.getItem('pucards_co_pagesize')"), '다시 열 때 읽어야 한다');
  assert.ok(src.includes("coPageSizeOk(localStorage.getItem('pucards_co_pagesize'))"),
    '읽은 값도 아는 값인지 확인해야 한다');
});

test('「전체」를 고르면 느려진다고 한 번 알려 준다', () => {
  const i = src.indexOf('function coSetPageSize(');
  const body = src.slice(i, i + 800);
  assert.ok(body.includes('confirm('), '알림 없이 조용히 펼치면 왜 멈추는지 모른다');
  assert.ok(body.includes('999999'), '전체일 때만 물어야 한다');
});
