/* 같은 이름의 사업장이 여럿일 때 «어느 쪽»에 잇는가 (대표 확인 2026-09-03)
 *
 * ★ 무엇이 잘못돼 있었나 — 실측:
 *   일정관리에 「티앤에스」가 둘인데 기술보호울타리는 «둘째»에 들어와 있었다.
 *   첫 것만 보던 짝짓기가 이미 하고 있는 사업을 「또 넣어라」로 내밀었고,
 *   그대로 눌렀으면 같은 회사·같은 사업이 «두 줄»이 된다.
 *   (2026-09-03 실측: 사업장 36곳 중 이름이 겹치는 곳이 8건, 이알피 번호는 3곳만 있었다)
 *
 * 못 박는 것은 «지금 값»이 아니라 규칙이다 (CLAUDE.md).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');
const LINES = SRC.split(/\r?\n/);
const bare = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const CODE = bare(SRC);

function grab(n) {
  const i = SRC.search(new RegExp('(?:async\\s+)?function ' + n + '\\('));
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; st = true; }
    else if (SRC[j] === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}
function grabLine(p) {
  const l = LINES.find((x) => x.trim().startsWith(p));
  assert.ok(l, p + ' 을(를) 못 찾았다');
  return l;
}

const ctx = { Math, String, Array, Object };
vm.createContext(ctx);
vm.runInContext([grabLine('const CO_CORP_RE='), grabLine('const _en='),
  grab('coKey'), grab('coKeyLoose'), grab('findCoForErp')].join('\n'), ctx);

/* 사업장 하나 — types/endedTypes/active 로 「살아 있나」가 갈린다 */
const CO = (id, name, o) => Object.assign({ id, name, types: [], endedTypes: {}, active: true }, o || {});
const find = (cos, erpId, name, tid) => ctx.findCoForErp(cos, erpId, name, tid).co;

/* ══ 이알피 번호가 있으면 그것이 먼저다 ═════════════════════════ */

test('★★ 이알피 번호가 맞으면 이름을 안 본다', () => {
  const cos = [CO('a', '다른이름', { erpId: 'E1' }), CO('b', '티앤에스')];
  assert.strictEqual(find(cos, 'E1', '티앤에스', 't4').id, 'a',
    '번호가 있는데 이름으로 간다 — 상호가 바뀌면 끊긴다');
});

test('★ 지운 사업장은 안 고른다', () => {
  const cos = [CO('a', '티앤에스', { deleted: true }), CO('b', '티앤에스')];
  assert.strictEqual(find(cos, 'E1', '티앤에스', 't4').id, 'b');
});

/* ══ 같은 이름이 여럿일 때 ═════════════════════════════════════ */

test('★★★ 그 사업을 «이미 하고 있는» 쪽을 고른다 — 이것이 티앤에스에서 틀렸던 자리', () => {
  /* 첫 것에는 없고 둘째에 기술보호(t4)가 있다. 첫 것을 집으면
     이미 있는 사업을 「또 넣어라」로 내밀고, 누르면 두 줄이 된다. */
  /* ⚠ 저쪽도 «도는 사업»을 갖게 둔다 — 안 그러면 「도는 쪽을 고른다」 규칙이
       대신 답을 맞혀, 이 규칙을 빼도 검사가 통과한다(2026-09-03 되막기에서 걸렸다). */
  const cos = [
    CO('first', '티앤에스', { types: ['t1'] }),
    CO('right', '티앤에스', { types: ['t4'] }),
  ];
  assert.strictEqual(find(cos, 'E9', '티앤에스㈜', 't4').id, 'right',
    '첫 것을 집는다 — 같은 회사·같은 사업이 두 줄이 된다');
});

test('★★★ 그 사업이 «안 끝난» 쪽을 고른다', () => {
  /* ⚠ 끝난 쪽에도 «다른 도는 사업»을 하나 준다 — 안 그러면 「도는 쪽을 고른다」가
       대신 맞혀서 이 규칙을 빼도 통과한다. */
  const cos = [
    CO('ended', '별표수세미', { types: ['t4', 't1'], endedTypes: { t4: '2026-07-31' } }),
    CO('live', '별표수세미', { types: ['t4'] }),
  ];
  assert.strictEqual(find(cos, 'E9', '별표수세미', 't4').id, 'live',
    '끝난 쪽에 붙는다 — 새 회차가 종료된 사업에 들어간다');
});

test('★★ 그 사업이 어디에도 없으면 «아직 도는» 쪽을 고른다', () => {
  const cos = [
    CO('dead', '별표수세미', { types: ['t1'], endedTypes: { t1: '2026-07-31' } }),
    CO('alive', '별표수세미', { types: ['t1'] }),
  ];
  assert.strictEqual(find(cos, 'E9', '별표수세미', 't4').id, 'alive',
    '다 끝난 껍데기 사업장에 새 사업을 붙인다');
});

test('★★ 쉬는 사업장보다 도는 사업장을 고른다', () => {
  const cos = [CO('rest', '세화전자', { active: false }), CO('work', '세화전자')];
  assert.strictEqual(find(cos, 'E9', '세화전자', 't4').id, 'work');
});

test('★★★ 다 같으면 «먼저 있던 것»이 이긴다 — 뒤죽박죽 바뀌면 안 된다', () => {
  /* 점수가 같을 때 차례가 흔들리면 부를 때마다 다른 사업장에 붙는다. */
  const cos = [CO('one', '이케이', { types: ['t1'] }), CO('two', '이케이', { types: ['t1'] })];
  assert.strictEqual(find(cos, 'E9', '이케이', 't4').id, 'one');
  assert.strictEqual(find(cos, 'E9', '이케이', 't4').id, 'one', '부를 때마다 답이 바뀐다');
});

test('★★ 종류를 «안 넘기면» 예전처럼 첫 것 — 옛 부름을 깨지 않는다', () => {
  const cos = [CO('first', '티앤에스', { types: ['t1'] }), CO('second', '티앤에스', { types: ['t4'] })];
  assert.strictEqual(find(cos, 'E9', '티앤에스').id, 'first');
});

test('★ 하나뿐이면 그대로 고른다', () => {
  const cos = [CO('only', '남양인텍')];
  assert.strictEqual(find(cos, 'E9', '남양인텍', 't4').id, 'only');
});

test('★★ 법인격을 떼고 맞춘다 — 「(주)별표수세미」와 「별표수세미」는 한 곳이다', () => {
  const cos = [CO('a', '별표수세미', { types: ['t4'] })];
  assert.strictEqual(find(cos, 'E9', '(주)별표수세미', 't4').id, 'a');
  assert.strictEqual(find(cos, 'E9', '티앤에스㈜', 't4'), null,
    '엉뚱한 회사에 붙는다');
});

/* ══ 부르는 자리가 종류를 넘기는가 ═════════════════════════════ */

test('★★★ 가져오기 계획이 «종류를 넘긴다» — 안 넘기면 위의 고르기가 안 돈다', () => {
  const fn = bare(grab('erpBuildPlan'));
  assert.ok(/findCoForErp\(cos,c\.id,nm,govType\)/.test(fn.replace(/\s+/g, '')),
    '가져오기 계획이 종류를 안 넘긴다 — 중복 중 첫 것에 붙는다');
});

test('★★★ 실제로 «넣을 때»도 종류를 넘긴다 — 계획과 다르면 엉뚱한 곳에 들어간다', () => {
  const i = CODE.indexOf('findCoForErp(cos,r.erpId,r.name');
  assert.ok(i >= 0, '넣는 자리를 못 찾았다');
  assert.ok(/findCoForErp\(cos,r\.erpId,r\.name,r\.govType\)/.test(CODE.replace(/\s+/g, '')),
    '넣을 때 종류를 안 넘긴다 — 창에는 「이미 있음」인데 다른 곳에 들어간다');
});

test('★★ 종료 내리기도 종류를 넘긴다', () => {
  const fn = bare(grab('erpSyncClosedDown'));
  assert.ok(/,tid\)\.co/.test(fn.replace(/\s+/g, '')),
    '종료가 같은 이름의 «엉뚱한» 사업장에 찍힌다');
});

test('★ 사업장별 짝짓기는 이음표를 «한 번만» 읽는다 — 컨설팅 수만큼 다시 풀면 느리다', () => {
  const fn = bare(grab('erpConsByCo'));
  assert.ok(fn.indexOf('const tmap=getErpTypeMap()') < fn.indexOf('ERP.consultings.forEach'),
    '되풀이 안에서 이음표를 다시 읽는다');
});
