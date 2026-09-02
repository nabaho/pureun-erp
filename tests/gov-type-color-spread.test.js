/* 사업 색 다시 고르기 (대표 지시 2026-09-02 「색이 비슷해서 구분을 못하겠다」 → 「색다시」)
 *
 * ★ 무엇이 문제였나 — 아홉 색 가운데 서로 못 가르는 짝이 여덟이었다.
 *   주황이 셋, 회색이 둘. 가장 가까운 두 색의 거리가 36뿐이라 묶음 머리를 칠해도 헷갈렸다.
 *
 * 여기서 못 박는 것은 «어떤 색이 나오나»가 아니라 규칙이다 (CLAUDE.md):
 *   ① 서로 넉넉히 갈린다   ② 닮은 이름끼리는 특히 갈린다
 *   ③ 익숙함을 함부로 안 깨뜨린다   ④ 묻고 나서만 쓴다
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
/* 소스에서 그대로 꺼내 돌린다 — 베껴 적으면 소스가 바뀌어도 검사는 통과한다 */
const g11 = SRC.match(/const GCAL11=\[[\s\S]*?\]\];/);
assert.ok(g11, 'GCAL11 색표를 못 찾았다');
const ctx = { Math, Object, String, Array, Set, JSON };
vm.createContext(ctx);
vm.runInContext([g11[0], grab('_colRgb'), grab('colorGap'),
  grab('_kinPairs'), grab('spreadTypeColors')].join('\n'), ctx);

const minGap = (l) => {
  let m = 999;
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) m = Math.min(m, ctx.colorGap(l[i], l[j]));
  return m;
};

/* 실제로 헷갈리던 그 아홉 — 주황 셋, 회색 둘 */
const REAL = [
  { id: 't3', fullName: '현장클리닉', color: '#3b82f6' },
  { id: 'o1', fullName: '충남,충북중기청근무', color: '#f39c12' },
  { id: 't1', fullName: '일터혁신 컨설팅', color: '#ff6b35' },
  { id: 'n1', fullName: '산업일자리전환컨설팅(구조혁신)', color: '#7f8c8d' },
  { id: 't2', fullName: '산업일자리전환컨설팅(충남경제)', color: '#a882ff' },
  { id: 't4', fullName: '기술보호울타리', color: '#2a9d8f' },
  { id: 't6', fullName: '씨앗컨설팅', color: '#e94560' },
  { id: 't7', fullName: '인사노무컨설팅', color: '#666880' },
  { id: 'j1', fullName: '통상변화대응기술경영혁신지원컨설팅', color: '#e67e22' },
];

test('★★★ 서로 «넉넉히» 갈린다 — 이것이 이 기능의 전부다', () => {
  const before = minGap(REAL.map(t => t.color));
  const after = minGap(ctx.spreadTypeColors(REAL));
  assert.ok(before < 40, '전제가 무너졌다 — 지금 색이 이미 갈려 있다면 이 기능이 필요 없다');
  assert.ok(after >= 80,
    '가장 가까운 두 색이 ' + after + ' 밖에 안 갈린다(지금 ' + before + ') — 여전히 못 가른다');
});

test('★★ 같은 색을 두 사업에 주지 않는다', () => {
  const out = ctx.spreadTypeColors(REAL);
  assert.strictEqual(new Set(out).size, REAL.length,
    '색이 겹쳤다 — 겹치면 두 사업이 아주 같아 보인다');
});

test('★★★ 「닮은 이름」끼리는 특히 갈린다 — 제일 갈라야 할 짝이다', () => {
  /* 「산업일자리전환컨설팅(구조혁신)」과 「…(충남경제)」는 사람이 늘 함께 부른다.
     그 둘이 닮은 색을 받으면 정작 필요한 구분이 안 된다 —
     ⚠ 이 잣대를 안 넣었을 때 실제로 그 둘이 가장 닮은 두 색을 받았다. */
  const out = ctx.spreadTypeColors(REAL);
  const i = REAL.findIndex(t => /구조혁신/.test(t.fullName));
  const j = REAL.findIndex(t => /충남경제/.test(t.fullName));
  const gap = ctx.colorGap(out[i], out[j]);
  assert.ok(gap >= 150, '닮은 이름끼리 ' + gap + ' 밖에 안 갈린다 — 이 둘이 가장 중요하다');
});

test('★★ 익숙함을 함부로 안 깨뜨린다 — 안 헷갈리던 색은 계열을 지킨다', () => {
  /* 파랑이던 현장클리닉이 빨강이 되면 하루아침에 남의 화면이 된다.
     ⚠ 「갈리기만 하면 된다」로 짜면 실제로 그렇게 된다 — 잣대에 «멈추는 자리»가
       있어야 한다(닮은 짝 150, 전체 85에서 멈춘다). */
  const out = ctx.spreadTypeColors(REAL);
  const hue = (h) => { const [r, g, b] = ctx._colRgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 24) return 'gray';
    let H = 0; if (mx === r) H = ((g - b) / (mx - mn)) % 6; else if (mx === g) H = (b - r) / (mx - mn) + 2; else H = (r - g) / (mx - mn) + 4;
    H *= 60; if (H < 0) H += 360;
    return H < 45 ? 'red' : H < 70 ? 'amber' : H < 175 ? 'green' : H < 265 ? 'blue' : 'purple'; };
  /* 원래 서로 안 헷갈리던 셋 — 계열이 그대로여야 한다 */
  for (const nm of ['현장클리닉', '기술보호울타리', '일터혁신']) {
    const k = REAL.findIndex(t => t.fullName.startsWith(nm));
    assert.strictEqual(hue(out[k]), hue(REAL[k].color),
      nm + ' 의 색기운이 바뀌었다 (' + REAL[k].color + ' → ' + out[k] + ') — 안 헷갈리던 색이다');
  }
});

test('★ 사업이 둘이어도, 색표보다 많아도 터지지 않는다', () => {
  assert.strictEqual(ctx.spreadTypeColors([]).length, 0);
  const two = ctx.spreadTypeColors(REAL.slice(0, 2));
  assert.strictEqual(new Set(two).size, 2);
  const many = ctx.spreadTypeColors(
    Array.from({ length: 14 }, (_, i) => ({ id: 'x' + i, fullName: '사업' + i, color: '#888888' })));
  assert.strictEqual(many.length, 14, '색표(11)보다 많아도 개수는 맞아야 한다');
  assert.ok(many.every(Boolean), '빈 색이 나왔다 — 화면이 깨진다');
});

/* ═══ 묻고 나서만 쓴다 ═══ */

test('★★★ 묻지 않고 색을 바꾸지 않는다 — 색은 대표 자료다', () => {
  const fn = grab('openTypeColorSpread');
  const ask = fn.indexOf('showConfirm');
  const write = fn.indexOf('setTypes(');
  assert.ok(ask > 0, '물어보는 창이 없다 — 누르는 순간 색이 다 바뀐다');
  assert.ok(write > ask, '묻기 전에 저장한다 — 되돌릴 수가 없다');
});

test('★★ 무엇이 어떻게 바뀌는지 «보여 준다»', () => {
  const fn = grab('openTypeColorSpread');
  assert.ok(/\$\{t\.color\}/.test(fn) && /\$\{next\[i\]\}/.test(fn),
    '지금 색과 바뀔 색을 나란히 안 보여 준다 — 눌러 보고서야 알게 된다');
  assert.ok(/now/.test(fn) && /aft/.test(fn),
    '얼마나 나아지는지 숫자로 안 보여 준다');
});

test('★ 비활성 사업은 안 건드린다', () => {
  const fn = grab('openTypeColorSpread');
  assert.ok(/filter\(t=>t\.active!==false\)/.test(fn),
    '안 쓰는 사업까지 색을 바꾼다 — 색표를 헛되게 먹는다');
  assert.ok(/all\.map\(t=>m\[t\.id\]\?/.test(fn),
    '비활성 사업이 저장에서 빠진다 — 되살리면 색이 사라져 있다');
});

test('★ 누를 손잡이가 있다', () => {
  assert.ok(/id="setSpreadColorBtn"/.test(CODE), '단추가 화면에 없다');
  assert.ok(/setSpreadColorBtn'\)\.onclick=openTypeColorSpread/.test(CODE),
    '단추에 아무 일도 안 걸려 있다');
});
