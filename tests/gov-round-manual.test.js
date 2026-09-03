/* 「수동으로도 회차 조정이 가능하도록」 (건의함 · 김동현 2026-09-03)
 *
 * ★ 왜 칸만 열어 주면 안 되나 —
 *   회차는 저장된 값이지만, 날짜를 옮길 때마다 그 사업의 일정을 통째로
 *   «날짜순 1·2·3…» 으로 다시 매긴다. 그래서 손으로 고친 숫자가
 *   다음 재정렬에 «조용히 지워진다». 「손으로 정했다」는 표시가 함께 있어야 한다.
 *
 * 대표 결정(2026-09-03): 겹침·빈 번호는 «막지 않고 보이게» 한다 —
 *   막아 버리면 달리 풀 길이 없어 사람이 우회한다. 최대 회차만 막는다.
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
const HTML = SRC.replace(/<!--[\s\S]*?-->/g, ' ');
const STYLE = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

function grab(n) {
  const i = SRC.search(new RegExp('(?:async\\s+)?function ' + n + '\\('));
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; st = true; }
    else if (SRC[j] === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}

/* 셈을 실제로 돌린다 */
function world(scheds, opt) {
  opt = opt || {};
  const ctx = {
    getScheds: () => scheds,
    setScheds: (v) => { ctx.__saved = (ctx.__saved || 0) + 1; },
    isPrePhaseType: (tid) => (opt.preTypes || []).indexOf(tid) >= 0,
    Math, Number, Set, String, Array, Object,
  };
  vm.createContext(ctx);
  vm.runInContext([grab('schedPhase'), grab('roundIsFixed'), grab('roundPeers'),
    grab('roundIssues'), grab('reorderRounds'), grab('unfixAllRounds')].join('\n'), ctx);
  return ctx;
}
/* 일정 하나 */
const S1 = (id, date, round, fixed, phase) => {
  const o = { id, date, round, coId: 'c1', typeId: 't1' };
  if (fixed) o.roundFixed = true;
  if (phase) o.phase = phase;
  return o;
};
/* vm 안에서 만든 배열은 원형이 달라 deepStrictEqual 이 걸린다 — 걷어서 본다 */
const A = (x) => Array.from(x || []);
const rounds = (list) => list.map((s) => s.id + ':' + s.round).join(' ');

/* ══ 재정렬이 「손으로 정한 것」을 지키는가 ═════════════════════ */

test('★★ 아무것도 안 정했으면 지금처럼 날짜순 1·2·3', () => {
  const sc = [S1('c', '2026-03-01', 9), S1('a', '2026-01-10', 9), S1('b', '2026-02-14', 9)];
  const w = world(sc);
  w.reorderRounds('c1', 't1');
  assert.strictEqual(rounds(sc), 'c:3 a:1 b:2');
});

test('★★★ 손으로 정한 회차는 «날짜순 재정렬에 안 지워진다» — 이것이 건의의 핵심', () => {
  /* 고치기 전에는 여기서 c 가 3회로 덮여 손으로 정한 뜻이 사라졌다. */
  const sc = [S1('a', '2026-01-10', 0), S1('b', '2026-02-14', 0), S1('c', '2026-03-01', 1, true)];
  const w = world(sc);
  w.reorderRounds('c1', 't1');
  assert.strictEqual(sc[2].round, 1, '손으로 정한 회차가 날짜순으로 덮였다');
});

test('★★★ 나머지는 고정된 번호를 «비켜» 날짜순으로 채운다', () => {
  const sc = [S1('a', '2026-01-10', 0), S1('b', '2026-02-14', 0),
    S1('c', '2026-03-01', 1, true), S1('d', '2026-04-20', 0)];
  const w = world(sc);
  w.reorderRounds('c1', 't1');
  assert.strictEqual(rounds(sc), 'a:2 b:3 c:1 d:4',
    '고정된 1회를 비켜 가지 않는다 — 같은 번호가 둘이 된다');
});

test('★★ 고정이 여럿이어도 비켜 간다', () => {
  const sc = [S1('a', '2026-01-10', 0), S1('b', '2026-02-14', 0),
    S1('x', '2026-03-01', 1, true), S1('y', '2026-04-20', 3, true)];
  const w = world(sc);
  w.reorderRounds('c1', 't1');
  assert.strictEqual(rounds(sc), 'a:2 b:4 x:1 y:3');
});

test('★★ 사전진단·본컨설팅은 «따로» 센다', () => {
  const sc = [S1('p1', '2026-01-10', 0, false, 'pre'), S1('p2', '2026-02-01', 0, false, 'pre'),
    S1('m1', '2026-03-01', 0, false, 'main'), S1('m2', '2026-04-01', 2, true, 'main')];
  const w = world(sc, { preTypes: ['t1'] });
  w.reorderRounds('c1', 't1');
  assert.strictEqual(rounds(sc), 'p1:1 p2:2 m1:1 m2:2',
    '단계를 섞어 센다 — 사전진단 번호가 본컨설팅에 밀린다');
});

/* ══ 겹침·빈 번호를 «보이게» 하는가 ════════════════════════════ */

test('★★★ 겹친 번호를 찾는다', () => {
  const sc = [S1('a', '2026-01-10', 2), S1('b', '2026-02-14', 2), S1('c', '2026-03-01', 1)];
  const w = world(sc);
  assert.deepStrictEqual(A(w.roundIssues('c1', 't1').dups), [2]);
});

test('★★★ 빈 번호를 찾는다 — 높은 번호로 고정하면 사이가 빈다', () => {
  const sc = [S1('a', '2026-01-10', 1), S1('b', '2026-02-14', 2), S1('c', '2026-03-01', 5, true)];
  const w = world(sc);
  assert.deepStrictEqual(A(w.roundIssues('c1', 't1').gaps), [3, 4]);
});

test('★★ 어긋난 데가 없으면 빈 목록', () => {
  const sc = [S1('a', '2026-01-10', 1), S1('b', '2026-02-14', 2), S1('c', '2026-03-01', 3)];
  const w = world(sc);
  const is = w.roundIssues('c1', 't1');
  assert.deepStrictEqual([A(is.dups), A(is.gaps)], [[], []]);
});

test('★★ 겹침·빈 번호를 «단계별로» 본다 — 섞으면 늘 어긋나 보인다', () => {
  /* 사전진단 1,2 + 본컨설팅 1,2 는 정상인데 통으로 보면 1·2 가 겹친다. */
  const sc = [S1('p1', '2026-01-10', 1, false, 'pre'), S1('p2', '2026-02-01', 2, false, 'pre'),
    S1('m1', '2026-03-01', 1, false, 'main'), S1('m2', '2026-04-01', 2, false, 'main')];
  const w = world(sc, { preTypes: ['t1'] });
  assert.deepStrictEqual(A(w.roundIssues('c1', 't1', 'pre').dups), [], '단계를 안 갈라 본다');
  assert.deepStrictEqual(A(w.roundIssues('c1', 't1', 'main').dups), []);
});

/* ══ 되돌리는 길이 있는가 ══════════════════════════════════════ */

test('★★★ 그 사업의 고정을 «한 번에» 풀 수 있다 — 어긋난 것을 푸는 길', () => {
  const sc = [S1('a', '2026-01-10', 0), S1('b', '2026-02-14', 5, true), S1('c', '2026-03-01', 1, true)];
  const w = world(sc);
  assert.strictEqual(w.unfixAllRounds('c1', 't1'), 2, '푼 건수를 안 센다');
  assert.strictEqual(rounds(sc), 'a:1 b:2 c:3', '풀고 나서 날짜순으로 안 되돌린다');
  assert.ok(!sc[1].roundFixed && !sc[2].roundFixed, '고정 표시가 남아 있다');
});

test('★★ 풀 것이 없으면 아무것도 안 한다 — 괜히 저장하지 않는다', () => {
  const sc = [S1('a', '2026-01-10', 1), S1('b', '2026-02-14', 2)];
  const w = world(sc);
  assert.strictEqual(w.unfixAllRounds('c1', 't1'), 0);
  assert.ok(!w.__saved, '바뀐 것도 없는데 저장한다');
});

test('★ 다른 사업장·사업은 안 건드린다', () => {
  const sc = [S1('a', '2026-01-10', 1, true)];
  sc.push({ id: 'z', date: '2026-01-11', round: 7, coId: 'c9', typeId: 't1', roundFixed: true });
  const w = world(sc);
  w.unfixAllRounds('c1', 't1');
  assert.strictEqual(sc[1].roundFixed, true, '남의 사업장 고정까지 푼다');
  assert.strictEqual(sc[1].round, 7);
});

/* ══ 화면에 붙어 있는가 ════════════════════════════════════════ */

test('★★★ 회차 칸을 «고칠 수 있다» — 잠겨 있으면 건의가 안 풀린다', () => {
  const i = HTML.indexOf('id="mEditRound"');
  assert.ok(i >= 0, '회차 칸을 못 찾았다');
  const tag = HTML.slice(HTML.lastIndexOf('<input', i), HTML.indexOf('>', i) + 1);
  assert.ok(!/readonly|disabled/.test(tag), '아직 못 고치게 잠겨 있다');
  assert.ok(/type="number"/.test(tag), '숫자 칸이 아니다 — 글자가 섞이면 셈이 깨진다');
});

test('★★ 「자동으로 되돌리기」 단추가 있다 — 잠그기만 하고 못 풀면 안 된다', () => {
  assert.ok(/onclick="unfixRound\(\)"/.test(HTML), '이 일정만 푸는 단추가 없다');
  assert.ok(/unfixRoundAll\(\)/.test(HTML) || /unfixRoundAll\(\)/.test(CODE),
    '사업 전체를 한 번에 푸는 길이 없다');
});

test('★★★ 저장할 때 «고정 표시»를 함께 찍는다 — 안 찍으면 다음 재정렬에 지워진다', () => {
  const fn = bare(grab('saveEdit'));
  /* ⚠ 「roundFixed=true」만 찾으면 «자리바꿈» 쪽 줄을 보고 통과한다 —
       고치는 그 일정에 찍는지를 본다. */
  assert.ok(/scheds\[idx\]\.roundFixed=true/.test(fn.replace(/\s+/g, '')),
    '고치는 일정에 고정 표시를 안 찍는다 — 다음 재정렬에 조용히 지워진다');
  assert.ok(/reorderRounds\(/.test(fn), '고친 뒤 다른 일정 번호를 안 맞춘다');
});

test('★★★ 최대 회차는 «막는다» (대표 결정) — 넘기면 마지막회 알림이 영영 안 뜬다', () => {
  const fn = bare(grab('saveEdit'));
  assert.ok(/cap>0&&rn>cap/.test(fn.replace(/\s+/g, '')), '최대 회차를 안 막는다');
  assert.ok(/PRE_ROUND_CAP/.test(fn), '사전진단 한도를 안 본다');
});

test('★★★ 겹치면 «막지 말고» 자리 바꾸기를 준다 (대표 지시)', () => {
  const fn = bare(grab('saveEdit'));
  /* ⚠ 글자만 찾으면 조건을 false 로 바꿔도 통과한다 — «겹칠 때» 묻는지를 본다 */
  assert.ok(/if\(swapWith\)\{showConfirm\(/.test(fn.replace(/\s+/g, '')),
    '겹쳐도 안 묻는다 — 남의 회차를 말없이 빼앗는다');
  assert.ok(/swapWith\)\{constj=/.test(fn.replace(/\s+/g, '')),
    '맞바꾸지 않는다 — 상대 회차가 그대로라 둘이 겹친 채 남는다');
  assert.ok(/roundIsFixed\(x\)/.test(fn.replace(/\s+/g, '')),
    '자동인 것까지 겹침으로 본다 — 재정렬이 알아서 비켜 주는데 괜히 묻는다');
});

test('★★ 어긋나면 «목록에서도» 보인다 — 창을 열어야만 알면 늦다', () => {
  const fn = bare(grab('renderDashTypeRows'));
  /* ⚠ 한 번만 찾으면 «단계 있는 줄»에만 남아도 통과한다 —
       보통 줄과 사전진단 줄 둘 다에 붙어야 한다. */
  const n = (fn.match(/roundIssueBadge\(/g) || []).length;
  assert.ok(n >= 2, '어긋남 표시가 ' + n + '곳뿐이다 — 두 갈래(보통·사전진단) 모두에 붙어야 한다');
  const badge = bare(grab('roundIssueBadge'));
  assert.ok(/겹침/.test(badge) && /빔/.test(badge), '무엇이 어긋났는지 안 알려 준다');
});

test('★★ 손으로 정한 회차도 «이력»에 남는다 — 정산·보고에 붙는 숫자다', () => {
  const fn = bare(grab('saveEdit'));
  assert.ok(/logRoundFix\(/.test(fn), '누가 언제 바꿨는지 안 남는다');
  const lg = bare(grab('logRoundFix'));
  assert.ok(/kind:'fix'/.test(lg.replace(/\s+/g, '')),
    '날짜 이동 기록과 안 나눈다 — 되돌리기가 엉뚱하게 날짜를 옮긴다');
});

test('★★★ 이력의 되돌리기가 «고정을 푼다» — 날짜를 옮기면 안 된다', () => {
  const fn = bare(grab('revertRoundChange'));
  const i = fn.indexOf("kind==='fix'");
  assert.ok(i >= 0, '손으로 정한 기록을 안 갈라 본다');
  const branch = fn.slice(i, i + 900);
  assert.ok(/delete scheds\[i\]\.roundFixed/.test(branch), '고정을 안 푼다');
  assert.ok(!/\.date=/.test(branch), '되돌리면서 날짜를 옮긴다 — 손으로 정한 것은 날짜와 무관하다');
});

test('★ 딱지 모양(CSS)이 있다', () => {
  assert.ok(/\.rnd-in\.fixed\s*\{/.test(STYLE), '고정된 칸이 안 달라 보인다');
  assert.ok(/\.rnd-warn\s*\{/.test(STYLE), '어긋남 알림 모양이 없다');
});
