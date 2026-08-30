/* 정부컨설팅 — 「이 사업만 쉬는 날에도」 규칙과 공휴일 표시 (2026-08-30 대표 지시)
 *
 * 대표 지시: 「능률협회·충남경제진흥원 구조혁신컨설팅은 일요일을 제외한 나머지
 *            공휴일에도 일정을 넣을 수 있다」 + 「토요일도 함께 열어라」
 *            + 「공휴일은 좀 다르게 표시나게 해라」
 *
 * 여기서 못 박는 것은 «지금 값»이 아니라 «규칙»이다 (CLAUDE.md).
 *  - 어떤 사업이 켜져 있는지는 안 본다 — 대표가 켜고 끄는 것이다
 *  - 색·글자크기는 안 본다 — 「알약이 아니다」만 본다
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

/* 주석을 걷어낸 알맹이. 잘 쓴 주석이 검사를 통과시키는 일을 막는다
   (CLAUDE.md · 예전에 HTML 주석과 줄 주석 둘 다에 당했다). */
function bare(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, ' ')     // HTML 주석
    .replace(/\/\*[\s\S]*?\*\//g, ' ')    // 덩이 주석
    .replace(/^\s*\/\/.*$/gm, ' ');       // 줄 주석
}
const CODE = bare(SRC);

const ok = (name, cond, msg) => test(name, () => assert.ok(cond, msg || name));

/* ───────── 셈을 실제로 돌린다 ───────── */

/* 소스에서 함수를 그대로 꺼내 온다 — 베껴 적으면 소스가 바뀌어도 검사는 통과한다 */
function grab(fnName) {
  const i = SRC.indexOf('function ' + fnName + '(');
  assert.ok(i >= 0, fnName + ' 을(를) 소스에서 못 찾았다');
  let depth = 0, started = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return SRC.slice(i, j + 1); }
  }
  throw new Error(fnName + ' 의 끝을 못 찾았다');
}

function makeCtx({ types, env, holidays }) {
  const ctx = {
    getTypes: () => types,
    getEnv: () => env,
    getHoliday: (ds) => holidays[ds] || null,
    Date,
  };
  vm.createContext(ctx);
  vm.runInContext(grab('isBlocked') + '\n' + grab('dayOpenForAny'), ctx);
  return ctx;
}

/* 달력에 실제로 있는 모양의 사업들 — 이름은 뜻이 없다, 규칙만 본다 */
const OPEN = { id: 'open', name: '쉬는날에도', active: true, dayRule: 'exceptSun' };
const PLAIN = { id: 'plain', name: '보통', active: true, dayRule: '' };
const HOLIDAYS = {
  '2026-08-15': '광복절',   // 토요일
  '2026-08-17': '대체공휴일', // 월요일
  '2026-06-06': '현충일',   // 토요일
  '2026-10-04': '추석연휴',  // 일요일 ← 공휴일이면서 일요일
};
/* 전체 설정은 «닫힌» 쪽으로 둔다 — 사업별 규칙이 정말로 «덮는지» 보려면
   전체가 열려 있으면 안 된다(열려 있으면 무엇 덕에 통과했는지 모른다) */
const SHUT = { allowHoliday: false, allowWeekend: false };

test('★★ 켠 사업은 공휴일에 들어간다 — 전체 설정이 닫혀 있어도', () => {
  const c = makeCtx({ types: [OPEN, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.strictEqual(c.isBlocked('2026-08-17', 'open'), null, '대체공휴일(월)에 막혔다');
});

test('★★ 켠 사업은 토요일에도 들어간다 (대표 「토요일도 함께 열어라」)', () => {
  const c = makeCtx({ types: [OPEN, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.strictEqual(c.isBlocked('2026-08-22', 'open'), null, '평범한 토요일에 막혔다');
});

test('★★★ 일요일은 켜도 막힌다 — 이것이 대표가 「일요일을 제외한」이라 하신 대목', () => {
  const c = makeCtx({ types: [OPEN, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.ok(c.isBlocked('2026-08-23', 'open'), '평범한 일요일이 열렸다');
});

test('★★★ 공휴일이 일요일에 걸려도 막힌다 — 여기가 새는 자리다', () => {
  /* 추석연휴가 일요일이다. 「공휴일이면 연다」로만 짰으면 여기서 새어 나간다 */
  const c = makeCtx({ types: [OPEN, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.ok(c.isBlocked('2026-10-04', 'open'), '일요일 공휴일이 열렸다');
});

test('★ 안 켠 사업은 전체 설정을 그대로 따른다 — 지금 것이 안 바뀐다', () => {
  const shut = makeCtx({ types: [OPEN, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.ok(shut.isBlocked('2026-08-17', 'plain'), '전체가 닫혔는데 보통 사업이 공휴일에 들어갔다');
  const open = makeCtx({ types: [OPEN, PLAIN], env: { allowHoliday: true, allowWeekend: false }, holidays: HOLIDAYS });
  assert.strictEqual(open.isBlocked('2026-08-17', 'plain'), null, '전체를 열었는데 보통 사업이 막혔다');
});

test('★ 사업을 안 넘기면 전체 설정으로 판단한다 — 옛 부름도 안 터진다', () => {
  const c = makeCtx({ types: [OPEN, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.ok(c.isBlocked('2026-08-17'), '사업 없이 부를 때 공휴일이 열렸다');
  assert.strictEqual(c.isBlocked('2026-08-19'), null, '사업 없이 부를 때 평범한 수요일이 막혔다');
});

test('★★ 달력 칸은 «되는 사업이 하나라도 있으면» 열린다', () => {
  const c = makeCtx({ types: [OPEN, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.strictEqual(c.dayOpenForAny('2026-08-17'), true, '켠 사업이 있는데 공휴일 칸이 막혔다');
  assert.strictEqual(c.dayOpenForAny('2026-08-23'), false, '일요일 칸이 열렸다');
});

test('★★ 켠 사업이 하나도 없으면 공휴일 칸은 도로 막힌다', () => {
  const c = makeCtx({ types: [PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.strictEqual(c.dayOpenForAny('2026-08-17'), false, '켠 사업이 없는데 공휴일 칸이 열렸다');
});

test('★ 비활성 사업으로는 칸을 못 연다 — 안 쓰는 사업이 달력을 열어 두면 안 된다', () => {
  const c = makeCtx({ types: [{ ...OPEN, active: false }, PLAIN], env: SHUT, holidays: HOLIDAYS });
  assert.strictEqual(c.dayOpenForAny('2026-08-17'), false, '비활성 사업이 공휴일 칸을 열었다');
});

/* ───────── 새는 구멍 넷: 날짜만 보고 판단하면 안 된다 ───────── */

const CALLS = [
  ['새로 넣기',        /const blockMsg=isBlocked\(single\.selDate\s*,\s*single\.typeId\)/],
  ['여러 날 한꺼번에', /const blockMsg=isBlocked\(ds\s*,\s*single\.typeId\)/],
  ['끌어 옮기기',      /const blockMsg=isBlocked\(newDate\s*,\s*sc\.typeId\)/],
  ['끌어다 놓기',      /const blockMsg=isBlocked\(date\s*,\s*item\.typeId\)/],
];
for (const [what, re] of CALLS) {
  ok('★★ ' + what + ' 가 사업을 함께 넘긴다', re.test(CODE),
     what + ' 가 날짜만 보고 판단한다 — 사업별로 연 날이 여기로 새어 나간다');
}

ok('★★ 어디에서도 isBlocked 를 날짜 하나로만 부르지 않는다',
   !/isBlocked\(\s*[A-Za-z_$][\w$.]*\s*\)/.test(CODE.replace(/function isBlocked\([^)]*\)/, '')),
   '사업을 안 넘기는 부름이 남아 있다');

test('★★★ 끌어 옮길 때 «일정을 먼저 찾는다» — 안 그러면 사업을 모른다', () => {
  const fn = grab('moveChip');
  const findAt = fn.search(/findIndex\(/);
  const checkAt = fn.search(/isBlocked\(/);
  assert.ok(findAt >= 0 && checkAt >= 0, 'moveChip 모양이 달라졌다');
  assert.ok(findAt < checkAt,
    '일정을 찾기 전에 막아 버린다 — sc.typeId 가 undefined 라 사업 규칙이 조용히 무시된다');
});

/* ───────── 달력 칸이 옛 셈으로 되돌아가지 않게 ───────── */

ok('★★ 달력 칸이 «전체 설정만» 보고 막지 않는다',
   !/allowHoliday!==false\)\?false/.test(CODE),
   '옛 셈(공휴일이면 무조건 연다)이 남아 있다 — 사업별 규칙이 무시된다');

ok('★ 달력 칸은 dayOpenForAny 로 정한다',
   (CODE.match(/dayOpenForAny\(ds\)/g) || []).length >= 3,
   '달밖·이달 칸 세 곳이 모두 같은 잣대를 쓰지 않는다');

ok('★ 날짜 고르개는 그 사업 규칙 그대로 본다',
   /const blocked=!!isBlocked\(ds\s*,\s*single\.typeId\)/.test(CODE),
   '고르개가 사업을 알면서도 전체 설정으로 판단한다');

/* ───────── 사업별로 켜고 끌 수 있어야 한다 ───────── */

ok('★ 종류 표에서 「쉬는 날」을 켜고 끌 수 있다',
   /saveTypeField\('\$\{t\.id\}','dayRule',this\.checked\?'exceptSun':''\)/.test(CODE),
   '손잡이가 없으면 대표가 못 바꾼다 — 코드를 고쳐야 바뀌는 규칙이 된다');

ok('★ 규칙 칸에 처음 값이 있다 — 옛 자료에 없는 칸이라 undefined 가 샌다',
   /dayRule:''/.test(CODE),
   "getTypes 가 dayRule 기본값을 안 넣는다");

/* ───────── 공휴일 표시 — 「알약」이 아니어야 한다 ───────── */

test('★★ 공휴일 이름에 바탕색이 없다 — 일정 칩과 모양부터 갈라야 한다', () => {
  const m = CODE.match(/\.hol-name\{([^}]*)\}/);
  assert.ok(m, '.hol-name 규칙이 사라졌다');
  assert.ok(!/background/.test(m[1]),
    '공휴일이 다시 «채운 알약»이 됐다 — 일정 칩과 구별이 안 된다');
});

ok('★★ 공휴일 이름이 «날짜 줄»에 붙어 있다 — 칩 줄을 안 뺏는다',
   /<div class="mc-dl">.*\$\{holLabel\}/.test(CODE),
   '공휴일이 칩 자리로 돌아갔다 — 진짜 일정이 「+n건」으로 숨는다');

test('★ 공휴일 날짜가 빨갛다 — 이름과 한 덩어리로 읽히게', () => {
  /* 2026-08-30 팔레트로 줄이며 #d93025 가 #dc2626 이 됐다. 값이 아니라
     「빨간 계열인가」를 본다 — 안 그러면 색을 정리할 때마다 여기가 깨진다. */
  const P = require('./lib-palette.js');
  const rule = (CODE.match(/\.mc-date\.hol-c\{([^}]*)\}/) || [])[1] || '';
  const c = P.colorOf(rule, 'color');
  assert.ok(c, '공휴일 날짜 색이 사라졌다');
  assert.ok(P.isRed(c), '공휴일 날짜가 빨간 계열이 아니다: ' + c);
});
