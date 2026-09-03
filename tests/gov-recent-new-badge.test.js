/* 「최근 등록된 사업은 다르게 표시해 최근 등록되었음을 알 수 있게」 (대표 2026-09-03)
 *
 * 정한 것: ㉮ 빨간 NEW 딱지 · 3일 · 날짜로만 사라짐
 *
 * ★ 가장 위험한 자리 — 등록한 날은 여태 «아무 데도 안 담겨 있지 않았다».
 *   날짜 없는 것을 「새것」으로 세면 이미 있는 21곳이 전부 붉어진다.
 *   그러면 딱지가 아무 뜻도 없어진다.
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
const STYLE = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

function grab(n) {
  const i = SRC.search(new RegExp('(?:async\\s+)?function ' + n + '\\('));
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; st = true; }
    else if (SRC[j] === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}
/* 「며칠」은 소스에서 읽는다 — 3 을 여기 박으면 대표가 7 로 바꿀 때 이 검사가 깨진다 */
const NEW_DAYS = +(CODE.match(/const NEW_DAYS\s*=\s*(\d+)/) || [])[1];

/* 셈을 실제로 돌린다 */
function world(today) {
  const ctx = {
    todayStr: () => today,
    Date, Math, Number, isNaN, String, Array, Object,
  };
  vm.createContext(ctx);
  vm.runInContext([CODE.match(/const NEW_DAYS\s*=\s*\d+;/)[0],
    grab('daysSince'), grab('coIsNew'), grab('stampNewCo'), grab('stampNewType')].join('\n'), ctx);
  return ctx;
}
const TODAY = '2026-09-03';
/* 오늘로부터 n 일 «전» 날짜 */
const ago = (n) => new Date(Date.UTC(2026, 8, 3) - n * 86400000).toISOString().slice(0, 10);

/* ══ 무엇이 「최근」인가 ═══════════════════════════════════════ */

test('★★★ 등록한 날이 «없으면» 새것이 아니다 — 이미 있는 21곳이 전부 붉어지면 안 된다', () => {
  const w = world(TODAY);
  assert.strictEqual(w.coIsNew({ id: 'c1', types: ['t1'] }), false,
    '날짜 없는 옛 사업장이 NEW 로 뜬다 — 딱지가 아무 뜻도 없어진다');
});

test('★★★ 오늘 넣은 것은 새것이다', () => {
  const w = world(TODAY);
  assert.strictEqual(w.coIsNew({ createdAt: TODAY, types: ['t1'] }), true);
});

test('★★ 정한 날수 «안»이면 새것 — 하루 전', () => {
  const w = world(TODAY);
  assert.strictEqual(w.coIsNew({ createdAt: ago(1), types: ['t1'] }), true);
});

test('★★★ 정한 날수가 «되면» 사라진다 — 경계', () => {
  const w = world(TODAY);
  assert.strictEqual(w.coIsNew({ createdAt: ago(NEW_DAYS - 1), types: ['t1'] }), true,
    '아직 안쪽인데 벌써 사라진다');
  assert.strictEqual(w.coIsNew({ createdAt: ago(NEW_DAYS), types: ['t1'] }), false,
    '정한 날이 지났는데 아직 붙어 있다 — 늘 떠 있으면 눈에 안 들어온다');
});

test('★★ 아주 오래된 것은 당연히 아니다', () => {
  const w = world(TODAY);
  assert.strictEqual(w.coIsNew({ createdAt: '2026-01-01', types: ['t1'] }), false);
});

test('★ 알아볼 수 없는 날짜는 «옛것»으로 본다 — 새것 쪽으로 기울면 안 된다', () => {
  const w = world(TODAY);
  assert.strictEqual(w.coIsNew({ createdAt: '어제', types: ['t1'] }), false);
  assert.strictEqual(w.coIsNew({ createdAt: '', types: ['t1'] }), false);
});

/* ══ 사업장은 오래됐는데 «사업»이 새로 붙은 경우 ═════════════ */

test('★★★ 오래된 곳에 사업이 새로 붙어도 새것이다 — 그것도 「최근 등록된 사업」이다', () => {
  const w = world(TODAY);
  const co = { createdAt: '2026-01-01', types: ['t1', 't2'], typeAddedAt: { t2: ago(1) } };
  assert.strictEqual(w.coIsNew(co), true,
    '사업장 날짜만 본다 — 있는 곳에 컨설팅이 붙는 것을 통째로 놓친다');
});

test('★★ 붙은 사업이 «끝났으면» 안 센다', () => {
  const w = world(TODAY);
  const co = { createdAt: '2026-01-01', types: ['t1', 't2'], typeAddedAt: { t2: ago(1) }, endedTypes: { t2: ago(0) } };
  assert.strictEqual(w.coIsNew(co), false, '끝낸 사업으로 NEW 가 뜬다');
});

test('★★ 사업이 오래 전에 붙었으면 안 센다', () => {
  const w = world(TODAY);
  const co = { createdAt: '2026-01-01', types: ['t1'], typeAddedAt: { t1: '2026-02-01' } };
  assert.strictEqual(w.coIsNew(co), false);
});

/* ══ 도장을 찍는가 ═══════════════════════════════════════════ */

test('★★ 도장은 오늘 날짜를 찍는다', () => {
  const w = world(TODAY);
  const co = w.stampNewCo({ id: 'c1', types: ['t1'] });
  assert.strictEqual(w.coIsNew(co), true, '찍자마자 새것이 아니다');
  w.stampNewType(co, 't9');
  assert.ok(co.typeAddedAt && co.typeAddedAt.t9, '사업 도장이 안 찍힌다');
});

test('★ 도장은 있던 것을 안 지운다', () => {
  const w = world(TODAY);
  const co = { id: 'c1', types: ['t1'], typeAddedAt: { t1: '2026-01-01' } };
  w.stampNewType(co, 't2');
  assert.strictEqual(co.typeAddedAt.t1, '2026-01-01', '옛 도장을 덮어써 버린다');
});

/* ══ 넣는 길이 «전부» 찍는가 — 하나라도 빠지면 그 길은 조용히 안 뜬다 ══ */

test('★★★ 사업장을 만드는 세 길이 모두 도장을 찍는다', () => {
  /* 손으로 추가 · 「푸른ERP 새 컨설팅」 창 · ERP 탭 가져오기 */
  const n = (CODE.match(/cos\.push\(stampNewCo\(/g) || []).length;
  const raw = (CODE.match(/cos\.push\(\{id:uid\(\),name/g) || []).length;
  assert.strictEqual(raw, 0,
    '도장 없이 사업장을 만드는 길이 ' + raw + '개 남았다 — 그 길로 들어온 것은 NEW 가 안 뜬다');
  assert.ok(n >= 3, '도장 찍는 길이 ' + n + '개뿐이다(셋이어야 한다)');
});

test('★★★ 있는 곳에 사업을 «붙이는» 길도 모두 도장을 찍는다', () => {
  const n = (CODE.match(/stampNewType\(/g) || []).length;
  /* 정의 1 + 도장 찍는 자리들 */
  assert.ok(n >= 4, '사업을 붙이는데 도장을 안 찍는 길이 남았다 (stampNewType ' + n + '곳)');
});

test('★★★ 수정 창은 «늘어난 것만» 찍는다 — 이름만 고쳐도 온 목록이 붉어지면 안 된다', () => {
  const fn = grab('saveCo') || CODE;
  const near = CODE.slice(CODE.indexOf('const _was='), CODE.indexOf('const _was=') + 260);
  assert.ok(/_was=cos\[idx\]\.types/.test(near), '고치기 «전»의 목록을 안 붙든다');
  assert.ok(/if\(!_was\.includes\(tid\)\)stampNewType/.test(near.replace(/\s+/g, '')),
    '늘어난 것만 가리지 않는다 — 이름만 고쳐도 그 사업장 전체가 NEW 가 된다');
});

/* ══ 화면에 실제로 붙는가 ═══════════════════════════════════ */

test('★★★ 카드 이름 옆에 딱지가 붙는다 — 셈이 맞아도 안 그리면 소용없다', () => {
  const i = CODE.indexOf('<span class="dcard-nm">');
  assert.ok(i >= 0, '카드 이름 자리를 못 찾았다');
  const near = CODE.slice(i, i + 260);
  assert.ok(/coIsNew\(co\)/.test(near), '딱지를 안 붙인다');
  assert.ok(/class="new-badge"/.test(near), 'NEW 딱지 모양이 안 붙는다');
});

test('★★ 딱지 모양(CSS)이 있다', () => {
  assert.ok(/\.new-badge\s*\{/.test(STYLE), '.new-badge 가 없다 — 글자만 덩그러니 나온다');
  assert.ok(/flex-shrink:0/.test(STYLE.slice(STYLE.indexOf('.new-badge'), STYLE.indexOf('.new-badge') + 300)),
    '좁은 칸에서 딱지가 눌려 찌그러진다');
});

test('★★ 왼쪽 색띠는 건드리지 않는다 — 「내 담당」·「기한 위험」 자리다', () => {
  assert.ok(/\.dcard\.is-mine\{[^}]*inset 3px/.test(STYLE.replace(/\s+/g, ' ')), '내 담당 띠가 사라졌다');
  assert.ok(/\.dcard\.is-risk\{[^}]*inset 3px/.test(STYLE.replace(/\s+/g, ' ')), '위험 띠가 사라졌다');
  const nb = STYLE.slice(STYLE.indexOf('.new-badge'), STYLE.indexOf('.new-badge') + 300);
  assert.ok(!/inset/.test(nb), 'NEW 가 왼쪽 띠를 쓴다 — 셋이 서로를 가린다');
});

test('★★ 사람마다 다르지 않다 — 날짜로만 사라진다(대표 선택)', () => {
  const fns = [grab('coIsNew'), grab('daysSince')].join('\n');
  assert.ok(!/localStorage|lsSet|myId\(/.test(fns),
    '누가 봤는지를 본다 — 「저 사람 화면엔 있는데 내 화면엔 없다」가 생긴다');
});
