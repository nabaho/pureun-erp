/* 상호 칸 — 이름과 서식 딱지가 «자리를 나눠 갖는다» (대표 화면 2026-09-03)
   「상호옆에 사업자등록증등 정리된것도 열정리좀 해라」

   무엇이 잘못돼 있었나: 이름이 칸을 통째로 먹어(max-width:100%) 뒤의 딱지가 칸 밖으로
   밀려났다. 밀려난 딱지는 … 도 없이 싹둑 잘리고(「통합 기술보」), 「+2」는 「+」만 남았다.
   「+」 한 글자는 «아무 말도 못 한다» — 몇 개가 접혔는지조차 알 수 없다.

     node --test tests/cards-co-name-tag-col.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

/* 짧은 이름표를 떠서 «돌린다» */
function load() {
  const a = SRC.indexOf('const CO_TAG_SHORT = [');
  assert.ok(a > 0, 'CO_TAG_SHORT 를 못 찾았다');
  const end = SRC.indexOf('\n}', SRC.indexOf('function coTagShort(t){', a)) + 2;
  assert.ok(end > a, 'coTagShort 의 끝을 못 찾았다');
  const ctx = { console };
  /* ⚠ 최상위 const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔 실어야 꺼내 본다 */
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(a, end).replace(/^const /, 'var '), ctx);
  return ctx;
}

/* 상호 칸을 그리는 «그 자리»를 떼어 돌린다 (cards-co-name-cell 과 같은 방식) */
function tagCell(tags) {
  const at = SRC.indexOf('const tags = coTagsOf(o);');
  /* ⚠ 끝을 「</td>」로 찾지 말 것 — 칸 안에 상자(<div>)가 들어가면 그 글자가 밀린다 */
  const end = SRC.indexOf('})()}', at);
  assert.ok(at > 0 && end > at, '딱지를 그리는 대목을 못 찾았다');
  const ctx = {
    console,
    coTagsOf: () => tags,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  };
  vm.createContext(ctx);
  const a = SRC.indexOf('const CO_TAG_SHORT = [');
  const sEnd = SRC.indexOf('\n}', SRC.indexOf('function coTagShort(t){', a)) + 2;
  vm.runInContext(SRC.slice(a, sEnd).replace(/^const /, 'var '), ctx);
  vm.runInContext('function draw(o){ ' + SRC.slice(at, end) + ' }', ctx);
  return vm.runInContext('draw({})', ctx);
}

/* 규칙 한 덩이를 원문에서 꺼내 «선언»으로 갈라 본다 (있다/없다가 아니라 값을 본다) */
function decls(selector) {
  const i = SRC.indexOf('\n' + selector + '{');
  assert.ok(i > 0, selector + ' 규칙을 못 찾았다');
  const body = SRC.slice(i + selector.length + 2, SRC.indexOf('}', i));
  const out = {};
  body.split(';').forEach(d => {
    const k = d.indexOf(':');
    if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim();
  });
  return out;
}

/* ── 짧은 이름표 ── */

test('★ 사업자등록증은 어느 꼴로 와도 「등록증」이다', () => {
  const c = load();
  assert.equal(c.coTagShort('사업자등록증'), '등록증');
  assert.equal(c.coTagShort('사업자등록증명'), '등록증');
  assert.equal(c.coTagShort('사업자등록증명원'), '등록증',
    '이름이 «정확히 같은지»로 재면 이 셋 가운데 하나만 짧아진다');
});

test('고유번호증 · 업태 종목 내역도 짧게', () => {
  const c = load();
  assert.equal(c.coTagShort('고유번호증'), '고유번호');
  assert.equal(c.coTagShort('업태 종목 내역'), '업태·종목');
  assert.equal(c.coTagShort('종목 및 업태'), '업태·종목', '차례가 바뀌어도 같은 것이다');
});

test('★ 모르는 서식은 «건드리지 않는다» — 글자 수로 자르면 짧은 이름까지 상한다', () => {
  const c = load();
  assert.equal(c.coTagShort('통합 기술보호지원사업 확인서'), '통합 기술보호지원사업 확인서',
    '자르는 것은 CSS 가 픽셀로 한다 — 글꼴에 따라 어긋나지 않는다');
  assert.equal(c.coTagShort('컨설팅신청 상세'), '컨설팅신청 상세');
  assert.equal(c.coTagShort(''), '');
  assert.equal(c.coTagShort(null), '');
  assert.equal(c.coTagShort('  사업자등록증  '), '등록증', '앞뒤 빈칸에 안 속는다');
});

/* ── 상호 칸에 그리는 것 ── */

test('★ 화면에는 짧게, 말풍선에는 «온전히»', () => {
  const html = tagCell(['사업자등록증']);
  assert.match(html, />등록증</, '화면에는 짧은 이름');
  assert.match(html, /title="사업자등록증"/, '온전한 이름을 물어볼 자리가 있어야 한다');
});

test('★ 딱지는 하나만 보이고 나머지는 「+N」으로 접는다 — 접은 것도 말풍선에 남는다', () => {
  const html = tagCell(['사업자등록증', '고유번호증', '컨설팅신청 상세']);
  assert.match(html, />등록증</);
  assert.match(html, />\+2</, '몇 개가 접혔는지 말해야 한다');
  assert.match(html, /title="고유번호증 · 컨설팅신청 상세"/, '접은 것을 볼 길이 있어야 한다');
  assert.equal(html.split('class="tg"').length - 1, 1, '딱지를 다 늘어놓으면 칸이 두 줄로 접힌다');
});

test('딱지가 하나뿐이면 「+0」을 안 붙인다 · 없으면 아무것도 안 그린다', () => {
  assert.doesNotMatch(tagCell(['고유번호증']), /\+/);
  assert.equal(tagCell([]), '');
});

/* ── 칸 안에서 자리를 나눠 갖는다 ── */

test('★ 이름이 칸을 통째로 먹지 않는다 — 먹으면 딱지가 칸 밖으로 밀려난다', () => {
  const nm = decls('.cotbl .conm .nm');
  assert.notEqual(nm['max-width'], '100%',
    '이름에 max-width:100% 를 주면 딱지가 설 자리가 없다 — 이것이 바로 그 고장이었다');
  assert.equal(nm['flex'], '0 1 auto', '모자라면 이름이 줄어들 수 있어야 한다');
  assert.equal(nm['min-width'], '0', 'min-width:0 이 없으면 flex 안에서 안 줄어든다');
  assert.equal(nm['text-overflow'], 'ellipsis', '자를 때는 … 로 자른다');
});

test('★ 딱지가 «먼저» 줄어든다 — 상호가 이겨야 한다', () => {
  /* 브라우저에서 재 보고 고친 자리(2026-09-03). 둘 다 똑같이 줄이면 긴 이름 쪽이
     더 많이 깎여 「주식회사 에이…」가 됐다 — 상호는 이 표에서 가장 중요한 값이다.
     딱지를 훨씬 빨리 줄이되(12배) 바닥을 두어, 딱지가 아주 사라지지는 않게 한다. */
  const tg = decls('.cotbl .conm .tg');
  const nm = decls('.cotbl .conm .nm');
  const shrink = v => Number(String(v || '').trim().split(/\s+/)[1] || 0);
  assert.ok(shrink(tg['flex']) > shrink(nm['flex']) * 2,
    '딱지가 이름보다 훨씬 빨리 줄어야 상호가 남는다');
  assert.ok(parseInt(tg['min-width'], 10) > 0,
    '바닥이 없으면 딱지가 0px 까지 줄어 통째로 사라진다');
  assert.ok(parseInt(tg['min-width'], 10) <= 56,
    '바닥이 너무 넓으면 짧은 딱지(등록증)가 괜히 넓어져 이름을 먹는다');
});

test('★ 「+N」과 짚음표는 «절대 안 줄인다» — 줄면 「+」만 남아 아무 말도 못 한다', () => {
  const fixed = decls('.cotbl .conm .tgx,.cotbl .conm .mgq,.cotbl .conm .mgw,.cotbl .conm .miss');
  assert.equal(fixed['flex'], 'none');
});

test('★ 한 줄로 늘어놓되 빈칸을 되돌린다 — flex 는 공백 글자를 자리로 안 친다', () => {
  const box = decls('.cotbl .conm .nmbox,.cotbl .cotg .tgbox');
  assert.equal(box['display'], 'flex');
  assert.equal(box['align-items'], 'center', '딱지와 이름의 세로 가운데가 맞아야 한다');
  assert.ok(box['gap'], '빈칸이 없으면 이름과 짚음표가 맞붙는다');
  assert.equal(box['min-width'], '0', '상자가 안 줄면 안이 아무리 줄어도 소용없다');
  const cell = decls('.cotbl .conm');
  assert.equal(cell['white-space'], 'nowrap', '상호 칸은 «한 줄»이다 — 접히면 그 줄만 키가 커진다');
});

test('★★ flex 를 «<td> 에 직접» 주지 않는다 — 그 칸이 표에서 빠져나가 열이 밀린다', () => {
  /* 2026-09-03 실측: td 에 display:flex 를 주니 상호와 서식이 «같은 자리»(x=93·251px)에
     겹치고, 폴더가 서식의 90px 을, 유형이 폴더의 164px 을 가져갔다. 표가 통째로 밀린다.
     ⚠ 이것은 «내가 그날 아침에 낸 고장»이다(#903). 되돌리지 말 것. */
  ['.cotbl .conm', '.cotbl .cotg'].forEach(sel => {
    const d = decls(sel);
    assert.notEqual(d['display'], 'flex', '★ ' + sel + ' 이 <td> 인데 flex 다 — 열이 밀린다');
  });
  /* 상자는 칸 «안»에 있어야 한다 */
  const at = SRC.indexOf('<td class="conm">');
  assert.match(SRC.slice(at, at + 60), /<td class="conm"><div class="nmbox">/);
  const bt = SRC.indexOf('<td class="cotg">');
  assert.match(SRC.slice(bt, bt + 60), /<td class="cotg"><div class="tgbox">/);
});

/* ── 서식은 «제 열»에 (대표 지시 2026-09-03) ────────────────────────
   「기업이름 옆에 통하 고유번호 등 이부분을 별도로 분리좀 해라 그래야 판단한다」
   상호 칸 «안»에 있으면 이름 길이마다 딱지 자리가 달라 세로로 훑을 수가 없다.
   폴더를 제 열로 뺐을 때(2026-08-30)와 같은 결이다. */

test('★ 딱지가 상호 칸 «밖»에 있다 — 안에 있으면 줄마다 자리가 달라 못 훑는다', () => {
  const at = SRC.indexOf('<td class="conm">');
  const cell = SRC.slice(at, SRC.indexOf('</td>', at));
  assert.ok(!/class="tg"/.test(cell), '★ 딱지가 아직 상호 칸 안에 있다');
  assert.ok(!/coTagShort/.test(cell), '★ 상호 칸이 아직 딱지를 그린다');
});

test('★ 딱지에 «제 칸»이 있다 — 딱지가 없어도 칸은 둔다(줄이 밀리지 않게)', () => {
  const at = SRC.indexOf('<td class="cotg">');
  assert.ok(at > 0, '★ 서식 칸이 없다');
  assert.equal(SRC.split('<td class="cotg">').length - 1, 1, '칸이 둘이면 하나는 늘 빈다');
  /* 딱지가 없을 때도 «빈 칸»이 나온다 — 안이 비었을 뿐 칸은 그대로다 */
  assert.equal(tagCell([]), '', '빈 칸의 «안»은 비어 있다');
  const cell = SRC.slice(at, SRC.indexOf('</td>', at));
  assert.ok(!/if\(!tags\.length\) return;/.test(cell), '칸 자체를 빼면 줄마다 칸 수가 달라진다');
});

/* ⚠ 「<thead><tr>」로 찾으면 «예약함 표»가 먼저 걸린다 — 회사 표에서 시작해야 한다 */
function coTableHead() {
  const at = SRC.indexOf('<table class="cotbl">', SRC.indexOf('function coListHtml('));
  assert.ok(at > 0, '회사 표를 못 찾았다');
  return SRC.slice(at, SRC.indexOf('</thead>', at));
}

test('★ 열 이름표와 폭의 개수가 같다 — 하나만 어긋나도 표가 통째로 밀린다', () => {
  const co = coTableHead();
  /* ⚠ 주석에도 「마지막 <col> 이…」처럼 글자가 들어 있다 — «묶음 안»만 센다.
     ⚠ <colgroup>·<thead> 가 <col>·<th> 로 걸리지 않게 뒤 글자까지 본다. */
  const cg = co.slice(co.indexOf('<colgroup>'), co.indexOf('</colgroup>'));
  const th = co.slice(co.indexOf('<thead>'), co.length);
  const cols = (cg.match(/<col(?![a-z])/g) || []).length;
  const ths = (th.match(/<th(?![a-z])/g) || []).length;
  assert.equal(cols, ths, '★ 폭(' + cols + ')과 이름표(' + ths + ')의 개수가 다르다');
  assert.ok(cols >= 10, '칸이 열은 되어야 한다 — 세는 자리가 틀렸다: ' + cols);
  assert.ok(/>서식\$\{coArrow\('tag'\)\}<\/th>/.test(co), '서식 이름표가 없다');
});

test('★ 서식으로 정렬하면 같은 서식끼리 모인다 — «보이는 이름»으로 선다', () => {
  const i = SRC.indexOf('const CO_SORT = {');
  const seg = SRC.slice(i, SRC.indexOf('\n};', i));
  assert.match(seg, /tag:\s+o => coTagShort\(/,
    '★ 화면에는 「등록증」인데 차례는 「사업자등록증」으로 서면 같은 딱지가 떨어져 앉는다');
  assert.match(coTableHead(), /coSortBy\('tag'\)/, '눌러서 정렬할 길이 없다');
});

test('★ 서식 칸도 «한 줄»이고 「+N」은 안 줄인다', () => {
  const cell = decls('.cotbl .cotg');
  assert.equal(cell['white-space'], 'nowrap', '접히면 그 줄만 키가 커진다');
  assert.equal(decls('.cotbl .cotg .tg')['min-width'], '0', '딱지가 줄어야 칸 밖으로 안 나간다');
  assert.equal(decls('.cotbl .cotg .tgx')['flex'], 'none', '「+」 한 글자는 아무 말도 못 한다');
});

/* ── 두 화면이 같은 것을 쓴다 ── */

test('★ 폰 목록도 같은 짧은 이름을 쓴다 — 한쪽만 고치면 폰에서만 길어진다', () => {
  const i = SRC.indexOf('...tags.map(t=>');
  assert.ok(i > 0, '폰 목록의 딱지 자리를 못 찾았다');
  const line = SRC.slice(i, SRC.indexOf('\n', i));
  assert.match(line, /coTagShort\(t\)/, '폰만 옛 이름을 쓰면 두 화면이 다른 말을 한다');
  assert.match(line, /title="\$\{esc\(t\)\}"/, '폰에서도 온전한 이름을 물어볼 수 있어야 한다');
});

test('짧은 이름표는 «한 벌»뿐이다 — 두 벌이면 한쪽만 고쳐진다', () => {
  assert.equal(SRC.split('function coTagShort(').length - 1, 1);
  assert.equal(SRC.split('const CO_TAG_SHORT').length - 1, 1);
});
