/* 목록 아래 개수 — 쪽이 하나여도 보여 준다 (대표 지시 2026-08-26)
   "삭제 된다 그런데 여전히 개수보기 왜 아래에 안나오나"

   ★ 까닭은 하나였다: pagerHtml 이 pages<=1 이면 «빈 값»을 돌려줬다.
     기업 상세에서 개수를 「전체」로 두면 4,143곳이 한 쪽이 되어 21쪽이 1쪽이 된다.
     그 순간 목록 아래에서 개수가 통째로 사라졌다 — 몇 곳인지 알 길이 없었다.
     이제 옮길 쪽이 없을 때 «단추만» 뺀다. 개수는 늘 남는다.
   ★ 위(도구줄)에는 개수 «고르기»만, 아래에는 «몇 곳 중 몇 번째». 사업자와 같은 모양이다.
     같은 글귀를 위아래 두 곳에 두면 4,143곳을 두 번 거르게 된다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}
/* pageSlice 는 pageStep·pageCount·pageClamp 를 쓴다 — 그 앞부터 통째로 뜬다 */
function load() {
  const ctx = { console, Object, Array, String, Number, Math };
  vm.createContext(ctx);
  new vm.Script(slice('const PAGE_SIZES', 'function favFirst(')).runInContext(ctx);
  new vm.Script(slice('/* ⚠ 쪽이 «하나»여도 개수는 보여 준다', 'function listGoPage(')).runInContext(ctx);
  return ctx;
}
const rows = n => Array.from({ length: n }, (_, i) => i);
const txt = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* ── 여러 쪽일 때는 그대로 ── */

test('여러 쪽이면 개수·쪽수·단추가 다 나온다', () => {
  const { pagerHtml, pageSlice } = load();
  const h = pagerHtml(pageSlice(rows(4143), 0, 200), '곳', 'coGoPage');
  assert.match(txt(h), /1–200 \/ 4,143곳 \(1\/21쪽\)/);
  assert.match(h, /◀ 이전/);
  assert.match(h, /다음 ▶/);
});

test('첫 쪽에서 「이전」이 꺼져 있다', () => {
  const { pagerHtml, pageSlice } = load();
  const h = pagerHtml(pageSlice(rows(4143), 0, 200), '곳', 'coGoPage');
  const before = h.slice(0, h.indexOf('◀ 이전'));
  assert.match(before, /disabled/, '첫 쪽에서 이전을 누를 수 있으면 안 된다');
});

test('마지막 쪽 범위와 「다음」 꺼짐', () => {
  const { pagerHtml, pageSlice } = load();
  const h = pagerHtml(pageSlice(rows(4143), 20, 200), '곳', 'coGoPage');
  assert.match(txt(h), /4,001–4,143 \/ 4,143곳 \(21\/21쪽\)/);
  const after = h.slice(h.indexOf('4,143곳'));
  assert.match(after, /disabled/, '마지막 쪽에서 다음을 누를 수 있으면 안 된다');
});

/* ── ★ 쪽이 하나일 때 — 여기가 「아래에 안 나온다」던 자리 ── */

test('★ 개수를 「전체」로 둬도 아래에 개수가 나온다', () => {
  const { pagerHtml, pageSlice } = load();
  const h = pagerHtml(pageSlice(rows(4143), 0, 999999), '곳', 'coGoPage');
  assert.notStrictEqual(h, '', '이것이 빈 값이어서 아래에 아무것도 안 나왔다');
  assert.match(txt(h), /1–4,143 \/ 4,143곳/);
});

test('★ 한 쪽에 다 들어가도 개수가 나온다', () => {
  const { pagerHtml, pageSlice } = load();
  assert.match(txt(pagerHtml(pageSlice(rows(200), 0, 200), '곳', 'coGoPage')), /1–200 \/ 200곳/);
  assert.match(txt(pagerHtml(pageSlice(rows(1), 0, 200), '곳', 'coGoPage')), /1–1 \/ 1곳/);
});

test('옮길 쪽이 없으면 「1/1쪽」을 안 적는다 — 읽을 값이 없는 글자다', () => {
  const { pagerHtml, pageSlice } = load();
  const h = pagerHtml(pageSlice(rows(200), 0, 200), '곳', 'coGoPage');
  assert.ok(h.indexOf('쪽)') < 0, '1/1쪽 은 아무것도 알려 주지 않는다');
});

test('옮길 쪽이 없으면 단추를 아예 안 만든다 — 눌러도 안 되는 단추를 두지 않는다', () => {
  const { pagerHtml, pageSlice } = load();
  const h = pagerHtml(pageSlice(rows(200), 0, 200), '곳', 'coGoPage');
  assert.ok(h.indexOf('button') < 0);
  assert.ok(h.indexOf('coGoPage') < 0, '누를 곳이 없어야 한다');
});

test('빈 목록에는 아무것도 안 보인다 — 「0–0 / 0곳」을 겹쳐 보이지 않는다', () => {
  const { pagerHtml, pageSlice } = load();
  assert.strictEqual(pagerHtml(pageSlice([], 0, 200), '곳', 'coGoPage'), '');
});

/* ── 명함·사업자도 같은 셈을 쓴다 ── */

test('명함 목록도 한 쪽뿐일 때 개수가 나온다 — 한 벌을 같이 쓴다', () => {
  const { pagerHtml, pageSlice } = load();
  assert.match(txt(pagerHtml(pageSlice(rows(80), 0, 100), '장', 'listGoPage')), /1–80 \/ 80장/);
});

test('셈은 한 벌뿐이다 — 기업 상세와 명함이 같은 pagerHtml 을 부른다', () => {
  assert.ok(HTML.includes("pagerHtml(info, '곳', 'coGoPage')"), '기업 상세');
  assert.ok(HTML.includes("pagerHtml(info, '장', 'listGoPage')"), '명함');
  assert.strictEqual(HTML.split('function pagerHtml(').length - 1, 1, '두 벌로 두면 한쪽만 고쳐진다');
});

/* ── 위아래 자리 ── */

test('개수 글귀는 «아래»에만 — 도구줄에는 개수 고르기만 둔다', () => {
  const tools = slice('function coToolsHtml(){', 'function pickCoFTab(');
  assert.ok(tools.includes('coSizeSelHtml(state.coPageSize)'), '위에는 개수 고르기');
  assert.ok(!/coPagerHtml\(/.test(tools),
    '위에도 개수를 적으면 같은 글귀가 두 곳에 나오고 4,143곳을 두 번 거른다');
});

test('쪽넘김이 «안 구르는 바닥»에 있다 — 화면에 붙어 늘 보인다', () => {
  /* ⚠ 2026-08-26 두 번째 지적: 「데이터 가장 아래」가 아니라 «화면에 고정»이어야 한다.
       표 안에 두면 200줄을 다 내려가야 보인다 — 4,143곳에서는 사실상 못 본다.
       사업자의 #pcTableWrap(구름) + #pcPager(안 구름)와 같은 꼴로 갈랐다. */
  const rp = slice('function renderCoPage(){', 'function coListHtml(info){');
  assert.match(rp, /class="cobody"/, '구르는 칸이 있어야 한다');
  assert.match(rp, /class="cofoot"/, '안 구르는 바닥이 있어야 한다');
  assert.match(rp, /coPagerHtml\(info\)/, '바닥에 쪽넘김이 있어야 한다');
  /* ⚠ 차례는 «그리는 글자»로 본다 — 위 주석에도 .cobody·.cofoot 이 적혀 있어,
       그냥 indexOf 로 재면 순서를 바꿔도 주석이 먼저 잡혀 통과한다(되돌림이 찾아냈다). */
  const bodyAt = rp.indexOf('class="cobody"'), footAt = rp.indexOf('class="cofoot"');
  assert.ok(bodyAt > 0 && footAt > bodyAt, '바닥이 표보다 뒤에 와야 아래에 앉는다');
  /* 반을 안 붙이면 위 규칙이 하나도 안 걸려 옛 모습으로 돌아간다 */
  assert.match(rp, /classList\.add\('cosplit'\)/, '반(.cosplit)을 붙여야 규칙이 걸린다');
  /* 표 «안»에는 없어야 한다 — 두 곳에 두면 두 번 나온다 */
  const co = slice('function coListHtml(info){', 'function coDetailPanelHtml');
  assert.ok(!/coPagerHtml\(/.test(co), '표 안에 남아 있으면 함께 굴러가 숨는다');
});

test('바닥이 구르는 칸 «밖»이다 — CSS 로 못 박는다', () => {
  assert.match(HTML, /#pcCo\.cosplit\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/,
    '#pcCo 가 구르면 바닥이 함께 밀려 나간다');
  assert.match(HTML, /#pcCo\.cosplit>\.cobody\{[^}]*flex:1 1 auto[^}]*min-height:0[^}]*overflow:auto/,
    '표 칸이 스스로 굴러야 한다 (min-height:0 없으면 안 줄어든다)');
  assert.match(HTML, /#pcCo\.cosplit>\.cofoot\{[^}]*flex:none/,
    '바닥이 늘어나면 목록을 먹는다');
});

test('사업자도 같은 꼴이다 — 흉내가 아니라 같은 구조', () => {
  assert.match(HTML, /#pcTableWrap\{flex:1;overflow:auto/, '사업자는 표 칸만 구른다');
  assert.ok(HTML.indexOf('<div id="pcPager"') > HTML.indexOf('<div id="pcTableWrap">'),
    '사업자의 쪽넘김은 구르는 칸 밖에 형제로 있다');
});

test('고른 줄 도구줄이 마지막 줄을 덮지 않는다 — 흐름 안의 마지막 자리', () => {
  /* 쪽넘김은 이제 구르는 칸 «밖»이라 애초에 덮일 수가 없다.
     남은 것은 표의 마지막 줄이다 — 도구줄이 표 뒤에 와야 그 위에 내려앉는다. */
  const co = slice('function coListHtml(info){', 'function coDetailPanelHtml');
  const tbl = co.indexOf('</tbody></table>');
  const bar = co.lastIndexOf('${selbar}');
  assert.ok(tbl > 0 && bar > tbl, '도구줄이 표보다 앞에 오면 마지막 줄을 덮는다');
});

/* ── 삭제 단추 모양이 도구줄 «안»으로 한정돼 있다 ── */

test('삭제 단추 모양이 도구줄 안으로 한정돼 있다', () => {
  /* ⚠ .coselbar 없이 .codel 만 두면 다른 화면의 같은 이름까지 물든다.
       실제로 선택자 중간에 주석이 끼어들어 .coclear 가 밖으로 새 있었다. */
  assert.ok(HTML.includes('.coselbar .codel{'), '도구줄 안으로 한정해야 한다');
  assert.ok(HTML.includes('.coselbar .coclear{'), '.coclear 도 한정돼 있어야 한다');
  assert.ok(!/^\.codel\{/m.test(HTML), '밖으로 새는 .codel 이 있으면 안 된다');
  assert.ok(!/^\.coclear\{/m.test(HTML), '밖으로 새는 .coclear 가 있으면 안 된다');
});
