/* 기업 상세 — 선택 삭제 + 개수 보기 (대표 지시 2026-08-26)
   "데이터가 삭제가 필요한데 이부분은 어디에도 반영이 되지 않았다
    선택시 삭제 어떻게 해야하는지 확인 해달라."
   "기업상세 캡쳐2 아래 캡쳐3 과 같이 개수 볼 수 있게 똑같이 만들어달라"

   ★ 회사는 저장된 기록이 아니다 — 명함과 등록증을 모아 만드는 화면이다.
     그래서 「이 회사를 지운다」는 «명함 N장 + 등록증 M장을 지운다» 는 뜻이다.
     확인 창에 그 장수를 적지 않으면, 3곳을 지운다고 생각하고 70장을 지운다.
   ★ 폴더·탭·서식 정보(coInfo)는 남긴다(대표 결정) — 되살리면 그대로 돌아온다.
   ★ 「전체」에서는 도구줄이 통째로 비어 있었다 — 폴더를 골라야만 나오게 되어 있어
     개수 고르기·종료·번호없음·정보부족 넷이 다 사라졌다. 탭 칩만 폴더에 딸린다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

/* 순수 로직만 떠서 돌린다. ⚠ 길이를 못 박아 자르지 않는다 — 표식 사이를 벤다. */
function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}
function run(code, seed) {
  const ctx = Object.assign({}, seed || {});
  vm.createContext(ctx);
  new vm.Script(code).runInContext(ctx);
  return ctx;
}

const DEL = () => run(slice('function coDelPlan(', 'const CO_DEL_CHUNK'));

/* ── 무엇이 몇 장 지워지는가 ── */

test('고른 회사의 명함과 등록증을 «모두» 모은다', () => {
  const { coDelPlan } = DEL();
  const p = coDelPlan([
    { key: 'a', cards: [{ id: 'c1' }, { id: 'c2' }], bizs: [{ id: 'b1' }] },
    { key: 'b', cards: [{ id: 'c3' }], bizs: [] },
  ]);
  assert.strictEqual(p.n, 2, '회사 수');
  assert.strictEqual(p.cards.length, 3, '명함 3장');
  assert.strictEqual(p.bizs.length, 1, '등록증 1장');
  assert.strictEqual(p.total, 4);
  assert.strictEqual(p.ids.length, 4);
});

test('회사 표에 등록증 원본을 담는다 — 세기만 하면 지울 수가 없다', () => {
  /* ⚠ coDelPlan 은 넘겨받은 것만 센다. «담는 쪽»이 비면 조용히 0장이 되어
       등록증이 안 지워진 채 「지웠습니다」가 뜬다. 그 자리를 못 박는다. */
  const build = slice('function coListBuild(){', '/* ⚠ 사업자번호가 없는 회사는');
  assert.ok(/cards:\[\],\s*bizs:\[\]/.test(build), '회사 한 줄에 등록증 칸이 있어야 한다');
  assert.ok(build.includes('o.bizs.push(it);'), '등록증 원본을 담아야 지울 수 있다');
  const at = build.indexOf('o.docs++;');
  assert.ok(at > 0 && build.indexOf('o.bizs.push(it);') > at, '등록증을 세는 자리에서 함께 담는다');
});

test('등록증을 빠뜨리지 않는다 — 담은 것을 모두 지울 목록에 넣는다', () => {
  const { coDelPlan } = DEL();
  const p = coDelPlan([{ key: 'a', cards: [], bizs: [{ id: 'b1' }, { id: 'b2' }] }]);
  assert.strictEqual(p.total, 2);
  /* ⚠ deepStrictEqual 은 쓰지 않는다 — vm 안에서 만든 배열은 «다른 세상»의 Array 라
       모양이 같아도 틀렸다고 한다. 이어 붙여 견준다. */
  assert.strictEqual(p.ids.join(','), 'b1,b2');
});

test('id 없는 것은 넘긴다 — 없는 자리를 지우러 가지 않는다', () => {
  const { coDelPlan } = DEL();
  const p = coDelPlan([{ key: 'a', cards: [{ id: '' }, null, { id: 'c1' }], bizs: [undefined] }]);
  assert.strictEqual(p.total, 1);
});

test('빈 고르기·없는 고르기에도 안 넘어진다', () => {
  const { coDelPlan } = DEL();
  assert.strictEqual(coDelPlan([]).total, 0);
  assert.strictEqual(coDelPlan(null).total, 0);
  assert.strictEqual(coDelPlan([{ key: 'a' }]).total, 0, 'cards/bizs 가 없어도');
});

/* ── 확인 창이 「장수」를 말한다 ── */

test('확인 창에 명함·등록증 장수를 적는다 — 회사 수만 적으면 안 된다', () => {
  const { coDelPlan, coDelAskText } = DEL();
  const t = coDelAskText(coDelPlan([
    { cards: [{ id: 1 }, { id: 2 }, { id: 3 }], bizs: [{ id: 4 }] },
    { cards: [{ id: 5 }], bizs: [] },
  ]));
  assert.match(t, /2곳/, '회사 수');
  assert.match(t, /명함 4장/, '명함 장수');
  assert.match(t, /사업자등록증 1장/, '등록증 장수');
});

test('확인 창이 「되살릴 수 있다」와 「30일」을 말한다', () => {
  const { coDelAskText } = DEL();
  const t = coDelAskText({ n: 1, cards: ['a'], bizs: [], total: 1 });
  assert.match(t, /30일/);
  assert.match(t, /되살릴/);
  assert.match(t, /전 직원/, '나만 안 보이는 게 아니라는 것을 알려야 한다');
});

test('폴더·탭·서식은 안 지운다고 확인 창에 적는다', () => {
  const { coDelAskText } = DEL();
  const t = coDelAskText({ n: 1, cards: ['a'], bizs: [], total: 1 });
  assert.match(t, /폴더·탭·서식 정보는 지우지 않습니다/);
});

test('없는 쪽은 글귀에 안 적는다 — 「등록증 0장」을 보여 주지 않는다', () => {
  const { coDelAskText } = DEL();
  const t = coDelAskText({ n: 1, cards: ['a'], bizs: [], total: 1 });
  assert.match(t, /명함 1장/);
  assert.ok(!/등록증/.test(t.split('지워지는 것')[1].split('\n')[0]), '등록증 0장을 적으면 안 된다');
});

test('천 단위에 쉼표를 넣는다 — 1234장이 얼마인지 한눈에 보여야 한다', () => {
  const { coDelAskText } = DEL();
  const cards = Array.from({ length: 1234 }, (_, i) => 'c' + i);
  assert.match(coDelAskText({ n: 12, cards: cards, bizs: [], total: 1234 }), /명함 1,234장/);
});

/* ── 삭제가 «명함과 같은 길»을 탄다 ── */

test('새 삭제 길을 만들지 않는다 — Store.del 을 그대로 쓴다', () => {
  const body = slice('async function coDelSel(){', 'const CO_CLEAR_CHUNK');
  assert.ok(body.includes('Store.del(id)'), '휴지통·검색목록을 두 벌로 챙기면 안 된다');
  assert.ok(!/trash\//.test(body), '휴지통 경로를 여기서 직접 만지면 안 된다');
  assert.ok(!/removeIdx|bykey|\/idx\//.test(body), '검색목록도 Store.del 이 맡는다');
});

test('폴더·탭·서식(coInfo)은 건드리지 않는다', () => {
  const body = slice('async function coDelSel(){', 'const CO_CLEAR_CHUNK');
  assert.ok(!/coInfo/.test(body), '되살려도 폴더·탭이 안 돌아오게 만들면 안 된다');
});

test('명함과 같은 기준(100장)에서 「삭제」를 손으로 치게 한다', () => {
  const body = slice('async function coDelSel(){', 'const CO_CLEAR_CHUNK');
  assert.ok(body.includes('plan.total > DEL_TYPE_MIN'), '명함과 같은 상수를 쓴다');
  assert.ok(body.includes("!=='삭제'"), '입력이 다르면 지우지 않는다');
  /* ⚠ 회사 수가 아니라 장수로 센다 — 20곳이 300장일 수 있다 */
  assert.ok(!/keys\.length > DEL_TYPE_MIN|plan\.n > DEL_TYPE_MIN/.test(body),
    '회사 수로 세면 300장을 묻지도 않고 지운다');
});

test('한꺼번에 다 던지지 않고 나눠 보낸다', () => {
  const body = slice('async function coDelSel(){', 'const CO_CLEAR_CHUNK');
  assert.ok(body.includes('CO_DEL_CHUNK'), '한 건씩 수천 번이 2026-08 오류 폭주였다');
  assert.match(HTML, /const CO_DEL_CHUNK = \d+;/);
  /* ⚠ 상수를 «쓰는 척»만 하면 안 된다 — 걸음 크기가 CO_DEL_CHUNK 여야 한다.
       걸음을 전체 길이로 바꿔 한꺼번에 던지는 되돌림이 이 검사를 그냥 지나갔다. */
  assert.match(body, /for\(let i=0;i<plan\.ids\.length;i\+=CO_DEL_CHUNK\)/,
    '걸음 크기가 CO_DEL_CHUNK 가 아니면 한꺼번에 던지는 것과 같다');
  assert.match(body, /plan\.ids\.slice\(i, i\+CO_DEL_CHUNK\)/, '자르는 크기도 같아야 한다');
});

test('한 장이 실패해도 나머지를 이어서 지운다', () => {
  const body = slice('async function coDelSel(){', 'const CO_CLEAR_CHUNK');
  assert.match(body, /Store\.del\(id\)\.catch\(/, '한 장 때문에 멈추면 안 된다');
});

test('지운 뒤 고른 것을 풀고 표를 다시 뽑는다', () => {
  const body = slice('async function coDelSel(){', 'const CO_CLEAR_CHUNK');
  assert.ok(body.includes('state.coSel = {}'), '지운 회사가 골라진 채 남으면 안 된다');
  assert.ok(body.includes('coListBust()'), '표를 다시 뽑지 않으면 지운 회사가 그대로 보인다');
});

test('고른 것이 없으면 아무 일도 안 한다', () => {
  const body = slice('async function coDelSel(){', 'const CO_CLEAR_CHUNK');
  assert.match(body, /if\(!keys\.length\) return toast/);
  assert.match(body, /if\(!plan\.total\) return toast/, '지울 장이 없을 때도 막아야 한다');
});

/* ── 단추 ── */

test('삭제 단추가 「선택 해제」 옆이 아니라 줄 맨 끝에 있다', () => {
  const bar = slice('${nSel}곳 선택', 'codraghint');
  const clear = bar.indexOf('선택 해제');
  const del = bar.indexOf('coDelSel()');
  assert.ok(del > 0, '삭제 단추가 있어야 한다');
  assert.ok(del > clear, '선택 해제 옆에 두면 손이 미끄러진다');
});

test('삭제 단추가 「명함·등록증이 지워진다」고 딱지에 적는다', () => {
  assert.match(HTML, /title="고른 회사의 명함·사업자등록증을 휴지통으로 보냅니다/);
});

test('삭제 단추가 다른 단추와 다르게 보인다', () => {
  assert.ok(HTML.includes('.codel{'), '같은 회색이면 손이 미끄러진다');
  assert.match(HTML, /\.codel\{[^}]*#a50e0e/);
});

/* ── 개수 보기 ── */

test('폴더를 안 골라도 도구줄이 나온다 — 「전체」에서 통째로 비어 있던 것', () => {
  const body = slice('function renderCoFTabsHtml(){', 'function coFTabChipsHtml(');
  assert.ok(!/if\(!f\) return ''/.test(body), '폴더가 없다고 도구까지 없애면 안 된다');
  assert.ok(body.includes('coToolsHtml()'), '도구는 늘 나와야 한다');
  assert.ok(body.includes("f ? coFTabChipsHtml(f) : ''"), '탭 칩만 폴더에 딸린다');
});

test('개수 고르기가 도구줄 오른쪽 끝에 있다', () => {
  /* ⚠ 2026-08-26: 처음에는 「1–200 / 4,143곳」도 여기에 붙였다가 뺐다. 대표 지시는
       「아래에」였고, 위아래 두 곳에 같은 글귀를 두면 4,143곳을 두 번 거른다.
       아래 쪽넘김은 cards-pager-always-count 가 따로 못 박는다. */
  const body = slice('function coToolsHtml(){', 'function pickCoFTab(');
  assert.ok(body.includes('coSizeSelHtml(state.coPageSize)'), '개수 고르기');
  assert.match(body, /margin-left:auto/, '오른쪽 끝');
});

test('줄을 새로 만들지 않는다 — 2026-08-24 에 없앤 그 줄을 되살리지 않는다', () => {
  /* 표 위에 따로 그리는 줄이 생기면 「화면 중간에 이상하다」가 다시 나온다 */
  const co = slice('function coListHtml(info){', 'function coDetailPanelHtml');
  assert.ok(co.indexOf('<table class="cotbl"') > 0, '표를 못 찾았다');
  /* 2026-08-26: 쪽넘김은 표 «밖»(renderCoPage 의 .cofoot)으로 옮겼다 — 화면에 붙어야
     하기 때문이다. 표 위에 줄을 새로 만들지 않았다는 뜻은 그대로다. */
  assert.ok(!/copgbar/.test(co), '2026-08-24 에 없앤 줄이 되살아났다');
});

/* ── 아끼기는 «안 넣었다» ── */

test('거른 결과를 기억하지 않는다 — 아끼는 값보다 조용한 어긋남이 무섭다', () => {
  /* 도구줄에 개수를 적으면서 coVisible() 이 두 번 불린다. 기억으로 아끼려다
     되돌렸다: 도구줄은 이미 세 번 거르고, 2026-08-13 의 멈춤은 표 조립이었고,
     열쇠에 입력 하나를 빠뜨리면 「찾아 쳤는데 목록이 그대로」가 된다.
     ⚠ 다시 넣고 싶으면 이 검사를 지우는 대신 «왜 이번엔 안전한지»를 먼저 적어라. */
  const body = slice('function coVisible(){', '/* ══════ 기업 상세 나눠 보기');
  assert.ok(!/_coVisMemo|_coListGen/.test(body), '기억하기를 넣었다면 까닭을 남겨야 한다');
  assert.match(body, /return coSorted\(coFilteredList\(null\)\);/);
  assert.ok(!/_coListGen/.test(HTML), '쓰는 곳이 없는 세대 counter 를 남기지 않는다');
});
