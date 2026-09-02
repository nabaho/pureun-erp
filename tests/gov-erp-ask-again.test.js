/* 「이관했는데 왜 일정관리에 안 나오나」 — 세 번 들은 물음 (대표 2026-09-02)
 *
 * ★ 까닭이 셋이었다
 *   ① 사업장은 자동 동기화가 없다 — 사람이 「사업장 가져오기」를 눌러야 한다(설계)
 *   ② 알림의 「하루 한 번」 잠금이 함수 맨 앞에 있어 세는 일조차 안 돌았다(어제 고침)
 *   ③ ★ 그래도 «오늘 이미 창을 닫았으면» 그 뒤 이관된 건은 «내일까지» 안 보였다.
 *      이관은 하루에 여러 번 일어난다. ← 이 파일이 지키는 것
 *
 * 못 박는 것은 «지금 값»이 아니라 규칙이다 (CLAUDE.md).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');
const bare = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const CODE = bare(SRC);

function grab(n) {
  const i = SRC.indexOf('function ' + n + '(');
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; st = true; }
    else if (c === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}

/* 셈을 실제로 돌린다 — 가짜 localStorage 를 끼운다 */
function world(today) {
  const store = {};
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    lsSet: (k, v) => { store[k] = String(v); },
    myId: () => 'a1',
    todayStr: () => today,
    String, Array, Object,
  };
  vm.createContext(ctx);
  vm.runInContext([grab('erpAskDayKey'), grab('erpAskSig'),
    grab('erpAskedToday'), grab('markErpAsked')].join('\n'), ctx);
  return ctx;
}
const R = (...ids) => ids.map(id => ({ erpId: id, name: id }));

test('★★ 같은 목록으로는 하루 한 번만 묻는다 — 매번 띄우면 닫기만 하게 된다', () => {
  const w = world('2026-09-02');
  const rows = R('c1', 'c2');
  assert.strictEqual(w.erpAskedToday(rows), false, '아직 안 물었는데 물었다고 한다');
  w.markErpAsked(rows);
  assert.strictEqual(w.erpAskedToday(rows), true, '같은 목록인데 또 묻는다');
});

test('★★★ «새 건이 생기면» 오늘이라도 다시 묻는다 — 이것이 이번에 고친 것', () => {
  /* 대표가 오늘 아침 창을 닫았고, 낮에 에이치비씨솔루션이 이관됐다.
     예전에는 내일까지 아무 말도 안 했다 — 「이관했는데 왜 안 나오나」의 까닭. */
  const w = world('2026-09-02');
  w.markErpAsked(R('c1'));
  assert.strictEqual(w.erpAskedToday(R('c1', 'c2')), false,
    '새로 이관된 건이 있는데도 안 묻는다 — 내일까지 모르고 지나간다');
});

test('★★ 하나가 «빠져도» 다시 묻는다 — 남은 것을 놓치지 않는다', () => {
  /* 둘 중 하나만 가져왔으면 남은 하나는 여전히 밀려 있다. */
  const w = world('2026-09-02');
  w.markErpAsked(R('c1', 'c2'));
  assert.strictEqual(w.erpAskedToday(R('c2')), false, '남은 것이 있는데 안 묻는다');
});

test('★★ 날이 바뀌면 다시 묻는다', () => {
  const w = world('2026-09-02');
  w.markErpAsked(R('c1'));
  const w2 = world('2026-09-03');
  w2.localStorage.setItem('p_erpAskDay_a1', w.localStorage.getItem('p_erpAskDay_a1'));
  assert.strictEqual(w2.erpAskedToday(R('c1')), false, '날이 바뀌었는데 안 묻는다');
});

test('★ 차례가 달라도 같은 목록으로 본다 — 괜히 다시 묻지 않는다', () => {
  const w = world('2026-09-02');
  w.markErpAsked(R('c1', 'c2'));
  assert.strictEqual(w.erpAskedToday(R('c2', 'c1')), true,
    '순서만 바뀌었는데 다시 묻는다 — 목록이 흔들릴 때마다 창이 뜬다');
});

test('★ 사람마다 따로 센다 — 한 PC 를 여럿이 쓴다', () => {
  assert.ok(/'p_erpAskDay_'\+\(myId\(\)\|\|'x'\)/.test(CODE),
    '한 사람이 닫으면 다른 사람에게도 안 뜬다');
});

test('★ 옛 기록(날짜만 담긴 것)도 읽는다 — 어제 것으로 오늘 터지지 않게', () => {
  /* 고치기 전에는 날짜만 담았다. 그 값이 그대로 남아 있어도 돌아야 한다. */
  const w = world('2026-09-02');
  w.localStorage.setItem('p_erpAskDay_a1', '2026-09-02');
  assert.strictEqual(w.erpAskedToday(undefined), true, '옛 부름이 안 돈다');
  assert.strictEqual(w.erpAskedToday(R('c1')), false,
    '옛 기록에는 목록이 없다 — 무엇이 밀렸는지 모르니 한 번은 물어야 한다');
});

/* ── 부르는 곳이 맞아야 뜻이 있다 ── */

test('★★★ 잠금·표시가 «밀린 목록»을 함께 본다', () => {
  const fn = grab('checkErpNewOnLogin');
  assert.ok(/erpAskedToday\(_erpAskRows\)/.test(fn),
    '잠금이 목록을 안 본다 — 새 건이 생겨도 오늘은 안 묻는다(고치기 전 모습)');
  assert.ok(/markErpAsked\(_erpAskRows\)/.test(fn),
    '무엇으로 물었는지 안 담는다 — 다음에 견줄 것이 없다');
});

test('★★ 세는 일이 잠금보다 «먼저»다 — 알림 줄은 늘 남아야 한다', () => {
  /* 어제 고친 것이 되돌아가지 않게 여기서도 지킨다. */
  const fn = grab('checkErpNewOnLogin');
  assert.ok(fn.indexOf('_erpAskRows=erpMyPending') < fn.indexOf('erpAskedToday('),
    '잠금이 세는 일보다 앞에 있다 — 창을 닫으면 알림 줄도 사라진다');
});
