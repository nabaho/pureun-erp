/* 명함첩 — 「모두 고르기」를 목록 맨 위 ☐ 로 옮기고, 안내 띠를 없앤다.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-15:
     "모두 고르기는 ㅁ 박스 상단에 전체 선택할 수 있게해라 보낸때 왠쪽에 넣어라"

   예전에는 목록 위에 「☐ 모두 고르기 · ☐ 를 눌러 고르세요」 안내 띠가 **늘** 떠 있어
   한 줄을 통째로 잡아먹었다. 이제 고른 것이 없으면 띠가 아예 없고, 전체 고르기는
   표 머리 ☐(보낸 때 왼쪽)에 있다. 여기서 못 박는 것은 **모양**이 아니라 **뜻**이다:
     · 고른 것이 없으면 띠를 그리지 않는다 (자리를 안 뺏는다)
     · 그래도 전체 고르기 길은 늘 있다 (머리 ☐)
     · 머리 ☐ 는 지금 상태를 그대로 비춘다 (다 골랐으면 켜져 있다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 화면 쪽 함수라 순수 로직 토막에 없다 — 필요한 함수만 떼어내고 나머지는 흉내낸다. */
function load(sel){
  const i = src.indexOf('function pickBar(');
  const j = src.indexOf('function pickRedraw(');
  assert.ok(i >= 0 && j > i, '고르기 화면 토막을 못 찾음');
  const ctx = { console, Object, Array, String, Number, JSON, Set };
  /* 고른 것: { id: true } 꼴 */
  ctx.pickOf = () => sel;
  ctx.pickList = (s, ids) => ids.filter(id => s[id]);
  ctx.pickAllOn = (s, ids) => ids.length > 0 && ids.every(id => s[id]);
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

/* ══════ 고른 것이 없을 때 ══════ */

test('아무것도 안 골랐으면 띠를 그리지 않는다 — 한 줄을 통째로 아낀다', () => {
  const C = load({});
  assert.equal(C.pickBar('sent', ['a', 'b', 'c'], '<button>지우기</button>'), '');
});

test('띠가 없어도 전체 고르기 길은 남아 있다 (표 머리 ☐)', () => {
  const C = load({});
  const th = C.pickHeadBox('sent', ['a', 'b']);
  assert.ok(/<th\b/.test(th), '표 머리 칸이어야 한다');
  assert.ok(/type="checkbox"/.test(th), '☐ 가 있어야 한다');
  assert.ok(th.includes('pickToggleAll'), '누르면 전부 고르기가 걸려야 한다');
});

/* ══════ 표 머리 ☐ 는 지금 상태를 비춘다 ══════ */

test('다 골라 두면 머리 ☐ 가 켜져 있다', () => {
  const C = load({ a: true, b: true });
  assert.ok(C.pickHeadBox('sent', ['a', 'b']).includes('checked'));
});

test('하나라도 안 골랐으면 머리 ☐ 는 꺼져 있다', () => {
  const C = load({ a: true });
  assert.ok(!C.pickHeadBox('sent', ['a', 'b']).includes('checked'));
});

test('목록이 비면 머리 ☐ 는 꺼져 있다 — 없는 것을 「다 골랐다」고 하면 안 된다', () => {
  const C = load({});
  assert.ok(!C.pickHeadBox('sent', []).includes('checked'));
});

/* ══════ 고른 것이 있을 때 ══════ */

test('고르면 몇 개인지와 할 일 단추가 나온다', () => {
  const C = load({ a: true, c: true });
  const bar = C.pickBar('sent', ['a', 'b', 'c'], '<button class="pkdel">기록 지우기</button>');
  assert.ok(bar.includes('2'), '고른 개수를 알려줘야 한다');
  assert.ok(bar.includes('기록 지우기'), '할 일 단추가 그대로 들어가야 한다');
  assert.ok(bar.includes('pickCancel'), '고르기 취소 길이 있어야 한다');
});

test('안 보이는 것은 개수에 넣지 않는다 — 딸려 지워지면 안 된다', () => {
  /* 찾기말을 바꿔 화면에서 사라진 'z' 가 골라진 채 남아 있어도 세지 않는다. */
  const C = load({ a: true, z: true });
  const bar = C.pickBar('sent', ['a', 'b'], '');
  assert.ok(bar.includes('1'), '보이는 1개만 세야 한다');
  assert.ok(!bar.includes('2개'), '안 보이는 것까지 세면 안 된다');
});

/* ══════ 카드로 늘어선 목록(자료함) ══════ */

test('표가 아닌 목록에도 「모두 고르기」 ☐ 한 줄이 있다', () => {
  const C = load({});
  const line = C.pickHeadLine('mat', ['m1', 'm2']);
  assert.ok(/type="checkbox"/.test(line), '☐ 가 있어야 한다');
  assert.ok(line.includes('pickToggleAll'), '누르면 전부 고르기가 걸려야 한다');
  assert.ok(!/<th\b/.test(line), '표가 아니므로 <th> 를 쓰면 안 된다');
});

test('자료가 하나도 없으면 「모두 고르기」 줄도 없다', () => {
  const C = load({});
  assert.equal(C.pickHeadLine('mat', []), '');
});

test('자료를 다 골라 두면 그 줄의 ☐ 도 켜져 있다', () => {
  const C = load({ m1: true, m2: true });
  assert.ok(C.pickHeadLine('mat', ['m1', 'm2']).includes('checked'));
});

/* ══════ 화면에 실제로 걸려 있는가 ══════ */

test('보낸 메일·예약 메일 표의 머리에 전체 고르기 ☐ 가 걸려 있다', () => {
  /* 함수만 있고 아무도 안 부르면 화면에는 안 나온다. */
  /* 2026-08-23 대표 지시로 보낸 메일만 ☐ 를 거뒀다 — 번호만 남는다 */
  assert.ok(!src.includes("pickHeadBox('sent'"), '보낸 메일에는 ☐ 가 없어야 한다');
  assert.ok(src.includes("pickHeadBox('sched'"), '예약 메일 표에 걸려 있어야 한다');
  assert.ok(src.includes("pickHeadLine('mat'"), '자료함 목록에 걸려 있어야 한다');
});

test('빈 <th class="pk"></th> 는 더 이상 남아 있지 않다 — 자리만 차지하던 칸', () => {
  assert.ok(!src.includes('<th class="pk"></th>'), '빈 머리 칸이 남아 있으면 ☐ 가 안 보인다');
});

/* ══════ 줄 사이 좁히기 ══════ */

test('보낸/예약 메일 표는 줄을 좁힌 모양(tight)을 쓴다', () => {
  assert.ok(src.includes('table.sbox.tight td'), '좁힌 줄 규칙이 있어야 한다');
  assert.ok(src.includes('class="sbox tight"'), '표에 실제로 붙어 있어야 한다');
});

test('좁힌 줄이 원래 줄보다 실제로 좁다', () => {
  /* 「좁혔다」고 이름만 붙이고 값이 그대로면 아무 뜻이 없다. */
  const num = (re) => {
    const m = src.match(re);
    assert.ok(m, '규칙을 못 찾음: ' + re);
    return parseFloat(m[1]);
  };
  const base  = num(/table\.sbox td\{padding:(\d+(?:\.\d+)?)px/);
  const tight = num(/table\.sbox\.tight td\{padding:(\d+(?:\.\d+)?)px/);
  assert.ok(tight < base, `좁힌 줄(${tight}px)이 원래(${base}px)보다 좁아야 한다`);
});

/* ══════ 머리줄 한 줄로 ══════ */

test('보낸 메일 머리줄은 제목·개수·찾기·단추가 한 줄이다', () => {
  /* 예전에는 제목 줄과 찾기 줄이 따로 있어 두 줄을 먹었다. */
  const i = src.indexOf('📤 보낸 메일</b>');
  assert.ok(i > 0, '보낸 메일 머리줄을 못 찾음');
  const head = src.slice(src.lastIndexOf('<div class="mboxbar">', i), i + 1400);
  assert.ok(head.includes('받는사람·제목·자료 이름으로 찾기'), '찾기 칸이 같은 줄에 있어야 한다');
  assert.ok(head.includes('내가 보낸 것'), '내가 보낸 것 단추가 같은 줄에 있어야 한다');
  assert.ok(head.includes('✏️ 새 메일'), '새 메일 단추가 같은 줄에 있어야 한다');
});
