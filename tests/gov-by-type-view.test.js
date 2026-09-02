/* 정부컨설팅 — 「개인별로 보는데 사업별로도」 + 「이관했는데 안 보인다」
 * (대표 지시 2026-09-02)
 *
 * ★ 「안 보인다」의 까닭은 «사업장 자동 동기화가 없어서»가 절반이고,
 *   나머지 절반은 알림 코드의 구멍이었다 — 「하루 한 번」 잠금이 함수 맨 앞에 있어
 *   그날 창을 한 번 띄운 뒤로는 «세는 일»조차 안 돌았다. 알림 줄도 안 남았다.
 *
 * 여기서 못 박는 것은 «지금 값»이 아니라 규칙이다 (CLAUDE.md).
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
const ok = (n, c, m) => test(n, () => assert.ok(c, m || n));

/* ═══ ① 「하루 한 번」이 «세는 일»을 막지 않는다 ═══ */

test('★★★ 「하루 한 번」 잠금이 세는 일 «뒤»에 온다 — 알림 줄이 남아야 한다', () => {
  const fn = grab('checkErpNewOnLogin');
  const count = fn.indexOf('_erpAskRows=erpMyPending');
  /* ⚠ 2026-09-02 — 「erpAskedToday()」를 «글자 그대로» 찾고 있었다. 잠금이 밀린 목록을
     받도록(erpAskedToday(_erpAskRows)) 고치자 그 자리에서 깨졌다 — 고친 쪽이 맞는데도.
     지켜야 할 것은 «어떻게 부르나»가 아니라 「잠금이 세는 일 뒤에 온다」는 차례다. */
  const guard = fn.indexOf('erpAskedToday(');
  const badge = fn.indexOf('renderNotifBadge()');
  assert.ok(count > 0 && guard > 0 && badge > 0, 'checkErpNewOnLogin 모양이 달라졌다');
  assert.ok(guard > count,
    '「하루 한 번」 잠금이 세는 일보다 «앞»에 있다 — 그날 창을 한 번 띄우면\n'
    + '  그 뒤 새로고침마다 가져올 건이 0으로 보이고 알림 줄도 안 남는다\n'
    + '  (2026-09-02 「에이치비 이관했는데 안 보인다」의 까닭이 이것이었다)');
  assert.ok(guard > badge, '뱃지를 다시 그리기 전에 되돌아간다 — 숫자가 안 바뀐다');
});

/* 「하루 한 번」이 어떤 모양으로 불리는지는 tests/gov-erp-ask-again.test.js 가 본다.
   여기서는 «그 얼개가 아직 있는가»만 본다 — 부름 모양을 글자로 박으면 고칠 때마다 깨진다. */
ok('★★ 창은 여전히 하루 한 번만 띄운다 — 매번 띄우면 닫기만 하게 된다',
  /markErpAsked\(/.test(grab('checkErpNewOnLogin'))
  && /erpAskedToday\(/.test(grab('checkErpNewOnLogin')),
  '하루 한 번 얼개가 사라졌다');

/* ═══ ② 사업별로 묶어 보기 ═══ */

ok('★★ 묶는 기준을 고를 수 있다 — 담당자별 · 사업별',
  /data-gb="att"/.test(CODE) && /data-gb="type"/.test(CODE),
  '묶기 단추가 없다 — 사업별로 볼 길이 없다');

ok('★★ 고른 기준이 다음에도 살아 있다',
  /lsSet\('p_dashGroupBy'/.test(CODE) && /p_dashGroupBy/.test(CODE),
  '기준을 안 담아 둔다 — 새로고침하면 되돌아간다');

test('★★★ 사업별로 묶으면 «그 사업 줄만» 보인다', () => {
  /* 한 사업장이 종류를 둘 가지면, 「일터혁신」 묶음의 카드에 현장클리닉 줄이
     함께 보이면 안 된다 — 그러면 묶은 뜻이 없어진다. */
  /* 이 함수는 곁일을 여럿 부른다. 여기서 재는 것은 «어느 줄이 나오나»뿐이라
     값은 아무래도 되지만, 없으면 터져서 검사가 헛돈다.
     ⚠ 하나씩 채우면 소스가 곁일을 하나 더 부르는 순간 또 헛돈다 —
       모르는 이름은 무해한 함수로 받는다. */
  const known = {
    getScheds: () => [], getFieldState: () => false, nextRound: () => 1,
    getTypes: () => [], escAttr: (x) => String(x == null ? '' : x),
    String, Number, Math, Array, Object, JSON, Boolean, Date, RegExp, isNaN,
  };
  const ctx = vm.createContext(new Proxy(known, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : () => ''),
  }));
  vm.runInContext(grab('renderDashTypeRows'), ctx);
  const types = [
    { id: 't1', name: '일터혁신', color: '#2563eb', active: true },
    { id: 't3', name: '현장클리닉', color: '#16a34a', active: true },
  ];
  const co = { id: 'c1', name: '어떤회사', types: ['t1', 't3'] };
  const all = ctx.renderDashTypeRows(co, types, false);
  assert.ok(all.includes('일터혁신') && all.includes('현장클리닉'),
    '기준 없이 부르면 종류를 다 그려야 한다(지금까지 하던 대로)');
  const only = ctx.renderDashTypeRows(co, types, false, 't1');
  assert.ok(only.includes('일터혁신'), '고른 사업 줄이 없다');
  assert.ok(!only.includes('현장클리닉'),
    '고른 사업만 봐야 하는데 다른 사업 줄까지 보인다 — 묶은 뜻이 없어진다');
});

ok('★★ 묶음이 «그 사업»을 카드에 넘긴다',
  /cardHtml\(it\s*,\s*g\.onlyTid\)/.test(CODE),
  '묶음이 사업을 안 넘긴다 — 카드가 종류를 다 그린다');

ok('★★★ 카드가 그 사업을 «줄 그리개까지» 넘긴다 — 중간에서 끊기면 아무 뜻이 없다',
  /rows\s*=\s*renderDashTypeRows\(co,\s*types,\s*showEnded,\s*onlyTid\)/.test(CODE),
  '묶음 → 카드까지는 넘기는데 카드 → 줄 그리개에서 끊긴다 (사업별인데 종류가 다 보인다)\n'
  + '  ⚠ 「어딘가에 그 글자가 있다」로 세지 말 것 — 함수 «정의»가 부름을 대신 통과시킨다');

ok('★ 사업별 묶음은 «그 사업을 가진 사업장»만 담는다',
  /activeIds\|\|\[\]\)\.includes\(t\.id\)/.test(CODE),
  '사업장을 사업으로 안 가른다');

ok('★★ 묶음 이름에 개수를 «두 번» 안 적는다',
  !/title:\(t\.fullName\|\|t\.name\)\+'　'\+items\.length/.test(CODE),
  '묶음 머리가 오른쪽에 개수를 이미 붙인다 — 이름에도 넣으면 「6곳 … 6곳」이 된다');

/* ═══ ③ 사업 고르개 — 옆줄과 달력 둘 다 ═══ */

ok('★★ 옆줄이 사업으로 걸러진다',
  /\(c\.types\|\|\[\]\)\.includes\(typeF\)/.test(CODE),
  '옆줄에 사업 고르개가 안 걸린다');

test('★★★ 달력은 담당자와 사업을 «함께» 본다 — 「또는」이면 뜻이 달라진다', () => {
  const fn = bare(grab('getFilteredScheds'));
  assert.ok(/S\.typeFilter/.test(fn), '달력이 사업으로 안 걸러진다');
  /* 두 조건이 각각 sc 를 좁혀야 한다(AND). 한 줄에 || 로 묶으면
     「내가 맡은 일터혁신만」을 볼 수가 없다. */
  const lines = fn.split('\n').filter(l => /sc=sc\.filter/.test(l));
  assert.ok(lines.length >= 2, '거르는 줄이 하나뿐이다 — 두 고르개가 함께 걸리지 않는다');
  assert.ok(!lines.some(l => /attFilter/.test(l) && /typeFilter/.test(l)),
    '담당자와 사업을 한 줄에서 묶었다 — 「또는」이 되면 둘을 겹쳐 볼 수가 없다');
});

ok('★ 달력 머리줄에 사업 고르개가 있다',
  /id="typeFilter"/.test(CODE),
  '달력에서 사업으로 걸러 볼 길이 없다');

test('★★ 고르개 둘 다 다음에도 살아 있다', () => {
  /* ⚠ 「어딘가에 lsSet('p_dashType') 이 있다」로 세면 안 된다 — 없어진 사업을
     되돌릴 때 쓰는 lsSet('p_dashType','') 이 대신 통과시킨다(실제로 그랬다).
     «고른 것을 담는» 자리인지, 손잡이 안을 보고 판단한다. */
  for (const [what, re] of [
    ['옆줄 사업 고르개', /S\.dashType=e\.target\.value;\s*lsSet\('p_dashType',\s*S\.dashType\)/],
    ['달력 사업 고르개', /S\.typeFilter=e\.target\.value;\s*lsSet\('p_typeFilter',\s*S\.typeFilter\)/],
  ]) {
    assert.ok(re.test(CODE), what + ' 가 고른 것을 안 담아 둔다 — 새로고침하면 되돌아간다');
  }
});

/* ═══ ④ 없어진 사업이 골라져 있으면 되돌린다 ═══ */

ok('★★★ 없어진 사업이 골라져 있으면 «전체»로 되돌린다',
  /if\(S\.dashType&&!tIds\.includes\(S\.dashType\)\)/.test(CODE)
  && /if\(S\.typeFilter&&!tIds\.includes\(S\.typeFilter\)\)/.test(CODE),
  '지운 사업이 골라진 채로 남으면 목록이 통째로 비고, 사람은 왜 빈지 모른다');

ok('★ 고르개에는 «쓰는» 사업만 담는다',
  /_tAct=getTypes\(\)\.filter\(t=>t\.active!==false\)/.test(CODE),
  '비활성 사업까지 고르개에 담긴다');

/* ═══ ⑤ 사람이 「지금 걸러져 있다」를 알 수 있어야 한다 ═══ */

ok('★★ 사업 고르개나 사업별 묶기가 켜지면 ⚙ 에 표가 뜬다',
  /has-filter[\s\S]{0,120}S\.dashGroupBy==='type'/.test(CODE),
  '걸러 놓은 것을 잊으면 「왜 이것만 보이지」가 된다');

/* ═══ ⑥ 사업별 묶음은 «색으로» 갈린다 (대표 지시 2026-09-02) ═══ */

test('★★★ 사업별 묶음 머리를 «그 사업 색»으로 칠한다', () => {
  /* 처음에 사업별 묶기를 지으면서 이것을 빠뜨렸다 — 묶음이 다 같은 회색 띠라
     이름을 읽기 전에는 어느 사업인지 알 수가 없었다. */
  assert.ok(/g\.onlyTid\?types\.find\(t=>t\.id===g\.onlyTid\)/.test(CODE),
    '묶음이 «어느 사업인지»를 안 찾는다 — 칠할 색이 없다');
  assert.ok(/border-left:5px solid \$\{gt\.color\}/.test(CODE),
    '왼쪽에 그 사업 색 띠가 없다 — 연한 바탕만으로는 회색 계열끼리 안 갈린다');
  /* ⚠ 계산만 하고 «붙이지 않으면» 화면은 그대로다. 실제로 그렇게 새어 나갔다 —
       색을 다 구해 놓고 머리줄에 style 을 안 넣으면 검사가 통과하면서 아무 일도 안 한다. */
  assert.ok(/<div class="dash-section-h" \$\{hs\}>/.test(CODE),
    '구한 색을 묶음 머리에 «안 붙인다» — 계산만 하고 화면은 그대로다');
});

test('★★ 바탕은 «연한 짝»으로 만든다 — 진한 색을 깔면 글자가 묻힌다', () => {
  assert.ok(/gcalTint\(gt\.color\)/.test(CODE),
    '색을 그대로 바탕에 깐다 — 그 위의 글자가 안 읽힌다');
  assert.ok(/background:\$\{tn\.bg\};color:\$\{tn\.fg\}/.test(CODE),
    '바탕만 바꾸고 글자색을 안 맞춘다 — 짝으로 써야 읽힌다');
});

test('★★ 담당자별로 묶을 때는 안 칠한다 — 칠할 사업이 없다', () => {
  /* onlyTid 가 없으면(담당자별·마감주의 묶음) 색을 찾지 않는다.
     안 그러면 undefined.color 로 터진다. */
  assert.ok(/const gt=g\.onlyTid\?/.test(CODE),
    '사업이 없는 묶음에서도 색을 찾는다 — 터진다');
});
