/* 사람 색은 «푸른이알피가 정하고 정부컨설팅은 읽기만» 한다 (대표 지시 2026-08-30 ③㉮)
 *
 * 두 곳에서 정하면 언젠가 어긋나고, 그때 어느 쪽이 맞는지 아무도 모른다.
 * 여기서 못 박는 것은 «색값»이 아니라 «누가 정하는가 · 어떻게 이어지는가»다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bare = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const GOV_SRC = R('gov-consulting.html');
const GOV = bare(GOV_SRC);
const ERP = bare(R('pu-erp.html'));

const ok = (name, cond, msg) => test(name, () => assert.ok(cond, msg || name));

/* ───────── 올리는 쪽(푸른이알피) ───────── */

ok('★★ 푸른이알피가 정한 색을 «공용 자리»에 올린다',
   /dbSet\('staff_colors'/.test(ERP),
   '색이 그 PC 브라우저에만 남는다 — 다른 PC·다른 앱에서는 순번 색으로 돌아간다');

ok('★★ «다 푼 색»을 올린다 — 읽는 쪽이 순번 규칙을 흉내 내지 않게',
   /staffColorMap\[u\.sid\]\s*=\s*customColors\[u\.sid\]\s*\|\|\s*STAFF_COLORS\[/.test(ERP),
   '손수 고른 색과 순번 색을 합쳐 올리지 않는다 — 직원이 드나들면 두 앱의 차례가 어긋난다');

ok('★ 사번(sid)을 열쇠로 올린다 — 이름은 흔들린다',
   /staffColorMap\[u\.sid\]/.test(ERP),
   '이름을 열쇠로 쓰면 동명이인·개명에 색이 흔들린다');

ok('★ 같으면 안 쓴다 — 그리기마다 쓰면 쓰기가 폭주한다',
   /JSON\.stringify\(was\)\s*===\s*JSON\.stringify\(staffColorMap\)/.test(ERP),
   '바뀐 게 없어도 매번 올린다 — 화면을 그릴 때마다 부르는 자리다');

/* ───────── 읽는 쪽(정부컨설팅) ───────── */

ok('★★★ 정부컨설팅은 «읽기만» 한다 — 색을 스스로 정하지 않는다',
   !/(_fbDB|firebase)[^\n]*ref\(\s*ERP_COLOR_NODE[^\n]*\)\.(set|update|push)\(/.test(GOV),
   '정부컨설팅이 공용 색표에 쓴다 — 정하는 곳이 둘이 되면 언젠가 어긋난다');

ok('★★ 사번으로 맞춘다',
   /_erpColors\[s\.erpSid\]/.test(GOV),
   '이름으로 맞추면 동명이인·개명에 흔들린다');

ok('★★ 못 읽어도 화면은 돈다 — 이 앱이 들고 있던 색으로 떨어진다',
   /\|\|\s*s\.color\s*\|\|/.test(GOV),
   '클라우드가 없으면 색이 비어 화면이 회색으로 무너진다');

test('★★★ 색 구독을 «클라우드가 붙은 자리»에서 부른다 — 시계에 안 맡긴다', () => {
  /* 2026-08-30: 처음에는 시작할 때 setTimeout 2초였다. 그때 아직 안 붙어 있으면
     그냥 되돌아가고 «다시는 시도하지 않아» 느린 연결에서는 색이 영영 안 왔다.
     ⚠ 「어딘가에서 부른다」가 아니라 «회차·사진 이력과 같은 자리»인지 본다 —
       그 자리가 「붙은 뒤 한 번」이 보장되는 유일한 곳이다. */
  assert.ok(!/setTimeout\(\s*subscribeErpColors/.test(GOV),
    '아직 시계로 부른다 — 클라우드가 늦게 붙으면 색이 영영 안 온다');
  const i = GOV.indexOf('subscribeRoundLog();');
  const j = GOV.indexOf('subscribePhotoLog();');
  const k = GOV.indexOf('subscribeErpColors();');
  assert.ok(i > 0 && j > 0 && k > 0, '구독 셋 중 부르는 곳이 없는 것이 있다');
  assert.ok(Math.abs(k - j) < 400 && Math.abs(j - i) < 400,
    '색 구독이 다른 구독 둘과 다른 자리에 있다 — 붙은 뒤 한 번이 보장되지 않는다');
});

ok('★ 통째로 받지 않는다 — 색표는 한 자리만 본다',
   /ERP_COLOR_NODE\s*\+\s*'\/v'/.test(GOV),
   '기록 전체를 받으면 쌓일수록 요금이 는다');

/* ───────── 셈을 실제로 돌린다 ───────── */

function grab(src, n) {
  const i = src.indexOf('function ' + n + '(');
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; st = true; }
    else if (c === '}') { d--; if (st && !d) return src.slice(i, j + 1); }
  }
}
function colorCtx(erpColors) {
  const ctx = { _erpColors: erpColors };
  vm.createContext(ctx);
  vm.runInContext(grab(GOV_SRC, 'staffColor'), ctx);
  return ctx;
}

test('★★★ 푸른이알피 색이 이 앱 색을 «이긴다»', () => {
  const c = colorCtx({ '2301': '#2563eb' });
  assert.strictEqual(c.staffColor({ erpSid: '2301', color: '#e67e22' }), '#2563eb',
    '이 앱 색이 이긴다 — 두 화면의 같은 사람이 다른 색으로 보인다');
});

test('★★ 사번이 안 이어진 사람은 이 앱 색으로 — 회색으로 사라지지 않는다', () => {
  const c = colorCtx({ '2301': '#2563eb' });
  assert.strictEqual(c.staffColor({ erpSid: '', color: '#e67e22' }), '#e67e22');
  assert.strictEqual(c.staffColor({ erpSid: '9999', color: '#e67e22' }), '#e67e22',
    '푸른이알피에 색이 없는 사람이 이 앱 색까지 잃는다');
});

test('★ 색표가 통째로 비어 있어도 안 무너진다 — 지금이 바로 그 상태다', () => {
  /* data/staff_colors 는 2026-08-30 현재 비어 있다(관리자가 법인대시보드를
     한 번 열어야 올라간다). 그동안에도 화면은 돌아야 한다. */
  const c = colorCtx({});
  assert.strictEqual(c.staffColor({ erpSid: '2301', color: '#e67e22' }), '#e67e22');
  assert.ok(c.staffColor(null), '사람이 없을 때 빈 색을 준다 — 바탕이 깨진다');
});
