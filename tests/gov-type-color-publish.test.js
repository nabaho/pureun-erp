/* 사업(컨설팅 종류) 색 — «이 앱이 정하고 다른 앱이 읽는다» (대표 결정 2026-08-30 「㉮」)
 *
 * 사람 색과 방향이 반대다. 사람은 푸른이알피가 정하고 여기가 읽는데,
 * 사업 색은 푸른이알피에 «색 칸이 아예 없어»(agency·code·name·short·sortOrder)
 * 가져올 원본이 없다 — 그래서 여기가 원본이 된다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');
const CODE = SRC
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; st = true; }
    else if (c === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}

/* 진짜 함수를 돌린다 — 무엇을 어떤 열쇠로 올리는지 눈으로 확인 못 하니 셈으로 본다 */
function run({ map, types, ready = true }) {
  const writes = [];
  const ctx = {
    FB_READY: ready,
    _fbDB: { ref: (p) => ({ update: (v) => writes.push({ path: p, value: v }) }) },
    getErpTypeMap: () => map,
    getTypes: () => types,
    console: { warn() {} },
    Date: { now: () => 1 },
  };
  vm.createContext(ctx);
  vm.runInContext(
    "const CONS_COLOR_NODE='data/cons_type_colors';let _consColorSent='';\n"
    + grab('publishTypeColors'), ctx);
  return { ctx, writes, call: () => ctx.publishTypeColors() };
}

const TYPES = [
  { id: 'g1', name: '일터혁신', color: '#d97706' },
  { id: 'g2', name: '구조혁신', color: '#2563eb' },
  { id: 'g3', name: '안 이어진 것', color: '#16a34a' },
];
const MAP = { erpA: 'g1', erpB: 'g2' };   // 푸른이알피 코드 → 이 앱 종류

test('★★★ 푸른이알피 «코드»를 열쇠로 올린다 — 이 앱 id 로 올리면 읽는 쪽이 못 알아본다', () => {
  const r = run({ map: MAP, types: TYPES });
  r.call();
  assert.strictEqual(r.writes.length, 1, '한 번만 써야 한다');
  assert.strictEqual(r.writes[0].path, 'data/cons_type_colors');
  assert.deepStrictEqual(Object.keys(r.writes[0].value.v).sort().join(','), 'erpA,erpB');
  assert.strictEqual(r.writes[0].value.v.erpA, '#d97706');
  assert.strictEqual(r.writes[0].value.v.erpB, '#2563eb');
});

test('★★ 안 이어진 종류는 안 올린다 — 읽는 쪽이 알 길이 없는 열쇠다', () => {
  const r = run({ map: MAP, types: TYPES });
  r.call();
  assert.ok(!Object.values(r.writes[0].value.v).includes('#16a34a'),
    '이알피에 안 이어진 종류 색까지 올렸다');
});

test('★★★ 같으면 안 쓴다 — 종류를 저장할 때마다 부르는 자리다', () => {
  const r = run({ map: MAP, types: TYPES });
  r.call(); r.call(); r.call();
  assert.strictEqual(r.writes.length, 1, '바뀐 게 없는데 ' + r.writes.length + '번 썼다 — 쓰기가 폭주한다');
});

test('★★ 색이 바뀌면 다시 쓴다', () => {
  let types = TYPES.map(t => ({ ...t }));
  const writes = [];
  const ctx = {
    FB_READY: true,
    _fbDB: { ref: (p) => ({ update: (v) => writes.push(v) }) },
    getErpTypeMap: () => MAP,
    getTypes: () => types,
    console: { warn() {} }, Date: { now: () => 1 },
  };
  vm.createContext(ctx);
  vm.runInContext("const CONS_COLOR_NODE='data/cons_type_colors';let _consColorSent='';\n" + grab('publishTypeColors'), ctx);
  ctx.publishTypeColors();
  types[0].color = '#dc2626';
  ctx.publishTypeColors();
  assert.strictEqual(writes.length, 2, '색을 바꿨는데 안 올렸다');
  assert.strictEqual(writes[1].v.erpA, '#dc2626');
});

test('★★★ 아무것도 안 이어져 있으면 «안 쓴다» — 빈 표로 남의 색을 지우면 안 된다', () => {
  const r = run({ map: {}, types: TYPES });
  r.call();
  assert.strictEqual(r.writes.length, 0, '빈 표를 올려 이미 있던 색을 지웠다');
});

test('★ 클라우드가 안 붙었으면 조용히 넘어간다 — 터지지 않는다', () => {
  const r = run({ map: MAP, types: TYPES, ready: false });
  r.call();
  assert.strictEqual(r.writes.length, 0);
});

/* ── 부르는 곳이 있어야 뜻이 있다 ── */

const CALLS = [
  ['종류를 저장할 때', /function setTypes\([^)]*\)\{[^}]*publishTypeColors\(\);/],
  ['이알피 연결을 저장할 때', /function setErpTypeMap\([^)]*\)\{[^}]*publishTypeColors\(\);/],
  ['클라우드가 붙은 뒤 한 번', /subscribeErpColors\(\);[\s\S]{0,120}?publishTypeColors\(\);/],
];
for (const [what, re] of CALLS) {
  test('★★ ' + what + ' 올린다', () => {
    assert.ok(re.test(CODE), what + ' 에서 안 올린다 — 색을 고쳐도 다른 앱에 안 간다');
  });
}

test('★ 색을 두 곳에서 정하지 않는다 — 이 앱은 사람 색에는 «안 쓴다»', () => {
  /* 사업 색은 여기가 원본, 사람 색은 푸른이알피가 원본. 방향을 섞으면 언젠가 어긋난다. */
  assert.ok(!/ref\(\s*ERP_COLOR_NODE[^)]*\)\.(set|update|push)\(/.test(CODE),
    '사람 색표에 쓴다 — 정하는 곳이 둘이 된다');
});
