'use strict';
/* ══════ 상호 칸도 «한 줄»이다 (대표 화면 2026-08-31 「이부분도 데이터 정렬 좀 해달라」) ══════
   대표 화면(「아직 안 담음 8곳」): 줄 넷은 42px, 줄 넷은 57px 이었다.
   상호 뒤에 붙는 서식 딱지(사업자등록증·신청기업 정보·컨설턴트·컨설팅신청 상세…)가
   두 줄로 접히면서 그 줄만 키가 커졌고, 상호가 위아래로 어긋나 보였다.

   ■ 왜 여기만 남아 있었나
     8월 30~31일에 표의 다른 칸은 모두 한 줄로 못 박았다 —
     폴더(.fd) · 사업자번호(.bz) · 담당(.mgr) · 유형(.ty) · 가진 것(.bits).
     상호 칸(.conm)만 «이름»에만 nowrap 이 걸려 있고 칸 자체에는 없었다.
     그래서 이름은 한 줄인데 그 «뒤에 붙는 딱지»가 다음 줄로 넘어갔다.

   ■ 어떻게 했나
     ① 칸을 한 줄로 못 박는다
     ② 딱지는 «하나만» 보이고 나머지는 「+2」로 접는다 (담당 칸의 부담당 +N 과 같은 방식)
     ③ 접은 것은 말풍선에 온전히 남는다 — 자른 채 아무 말이 없으면 알 길이 없다

   ★ 여기서 못 박는 것
     ① 상호 칸이 한 줄이다
     ② 딱지 하나 + 「+N」 — 다 늘어놓지 않는다
     ③ 접은 것이 말풍선에 «온전히» 남는다
     ④ 딱지 하나짜리는 「+N」을 안 붙인다
     ⑤ 딱지 자체도 안 접힌다 — 긴 이름은 …로 자른다
     ⑥ 꺾쇠를 그대로 안 내보낸다
   실행: node --test tests/cards-co-name-cell.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 딱지를 그리는 대목을 «떼어 돌린다» — 글자만 찾으면 지워도 통과한다 */
function tagHtml(tags){
  const at = SRC.indexOf('const tags = coTagsOf(o);');
  assert.ok(at > 0, '딱지를 그리는 대목을 찾지 못했다');
  /* ⚠ 끝을 「</td>」로 찾지 말 것 — 2026-09-03 에 칸 «안»에 상자(<div>)가 하나 들어가면서
     그 글자가 밀렸다. 토막의 끝은 IIFE 가 닫히는 자리다. */
  const end = SRC.indexOf('})()}', at);
  assert.ok(end > at, '그 대목의 끝을 찾지 못했다');
  const ctx = { console, Object, String, Array,
    coTagsOf: () => tags,
    /* ⚠ 그냥 넘기는 대역을 쓰면 「꺾쇠를 안 내보낸다」가 늘 통과한다 — 진짜처럼 만든다 */
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
  vm.createContext(ctx);
  /* 2026-09-03: 딱지가 «짧은 이름»으로 그려진다(대표 화면 「열정리좀 해라」).
     ⚠ 대역을 넣으면 짧게 만드는 자리가 통째로 죽어도 이 검사가 모른다 — «진짜»를 싣는다.
     ⚠ 최상위 const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔야 함수가 찾는다. */
  const sh = SRC.indexOf('const CO_TAG_SHORT = [');
  assert.ok(sh > 0, 'CO_TAG_SHORT 를 찾지 못했다');
  const shEnd = SRC.indexOf('\n}', SRC.indexOf('function coTagShort(t){', sh)) + 2;
  vm.runInContext(SRC.slice(sh, shEnd).replace(/^const /, 'var '), ctx);
  vm.runInContext('function draw(o){ ' + SRC.slice(at, end) + ' }', ctx);
  return vm.runInContext('draw({})', ctx);
}
const css = (sel) => {
  const m = SRC.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  assert.ok(m, sel + ' 규칙을 찾지 못했다');
  return m[1];
};

/* ── ① 한 줄 ──────────────────────────────────────────────────── */

test('★ 상호 칸이 «한 줄»이다 — 딱지가 접히면 그 줄만 키가 커진다', () => {
  const r = css('.cotbl .conm');
  assert.match(r, /white-space:nowrap/,
    '★ 칸이 접힌다 — 대표 화면에서 줄 키가 42px 과 57px 로 갈렸다');
  assert.match(r, /overflow:hidden/, '넘치면 잘라야 옆 칸을 안 민다');
});

test('★ 표의 «모든» 글자 칸이 한 줄이다 — 한 칸만 접혀도 그 줄이 어긋난다', () => {
  /* 상호 칸이 마지막으로 남아 있던 자리였다. 새 칸을 더할 때도 같이 봐야 한다. */
  [['.cotbl .conm','상호'], ['.corow .fd','폴더'], ['.cotbl .bz','사업자번호'],
   ['.cotbl .mgr','담당'], ['.corow .ty','유형'], ['.corow .bits i','가진 것']].forEach(([sel, ko])=>{
    assert.match(css(sel), /nowrap/, '★ ' + ko + ' 칸(' + sel + ')이 접힌다');
  });
});

test('줄 키를 못 박은 것도 그대로다', () => {
  assert.match(SRC, /\.cotbl tbody tr\{[^}]*height:\d+px/,
    '★ 줄 키가 풀리면 칸 하나가 접힐 때 다시 들쭉날쭉해진다');
});

/* ── 칸 폭 — «머리와 몸 가운데 큰 쪽»이 최소다 ──────────────────────────────
   2026-08-31 에 겪은 것: 유형 칸을 정할 때 «딱지»(자문 40 + 여백 24 = 64)만 재고
   «머리글»을 안 쟀다. 그런데 「유형」+정렬 화살표+깔때기(▽)는 80px 이 필요하다.
   그래서 68px 로 두었더니 머리글이 두 줄로 접혔다 — 몸은 맞는데 머리가 틀린 것이다.
   아래 숫자는 브라우저 실측이다. 이 값이 «규칙»이다(지금 폭이 얼마인가가 아니다). */
/* ⚠ 2026-09-03: 서식이 «제 열»로 나가면서 칸이 하나 늘었다 — 뒤 칸의 자리(i)가 하나씩
     밀린다. 상호의 최소도 바뀌었다: 이제 딱지가 안 들어오므로 «이름만» 재면 된다. */
const 최소 = [
  { i: 2, ko: '상호',       px: 236, why: '가장 긴 이름 「사회복지법인 아산성애원 좋은이웃」 212 + ⚠ + 여백 (몸)' },
  { i: 3, ko: '서식',       px: 90,  why: '「고유번호」 62 + 「+1」 22 + 여백 (몸)' },
  { i: 4, ko: '폴더',       px: 161, why: '「📁 통합기술보호지원단」 134 + 여백 27 (몸)' },
  { i: 5, ko: '유형',       px: 80,  why: '머리글 「유형」+화살표+깔때기 (머리 — 몸보다 크다)' },
  { i: 6, ko: '사업자번호', px: 126, why: '「134-86-05772」 102 + 여백 24 (몸)' },
  { i: 7, ko: '가진 것',    px: 214, why: '42+62+나머지 76 + 여백 24 (몸)' },
  { i: 8, ko: '담당',       px: 88,  why: '넉 자 이름 64 + 여백 24 (몸)' }
];
test('★ 모든 칸이 «실측 최소»만큼은 넓다 — 한 칸만 좁아도 그 줄이 접힌다', () => {
  const at = SRC.indexOf('<colgroup><col style="width:34px">');
  assert.ok(at > 0, '기업정보 표의 colgroup 을 찾지 못했다');
  const seg = SRC.slice(at, SRC.indexOf('</colgroup>', at));
  const w = (seg.match(/width:(\d+)px/g) || []).map(x => Number(x.match(/\d+/)[0]));
  최소.forEach(c => {
    assert.ok(w[c.i] >= c.px,
      '★ ' + c.ko + ' 칸이 ' + w[c.i] + 'px 다 — ' + c.px + 'px 이 필요하다: ' + c.why);
  });
});

test('★ 표 폭은 «사람이 정한 한도» 안에 있다 (2026-09-03 대표 결정: 1100)', () => {
  /* 예전에는 1040(1280 화면 − 옆줄 240)이 한도였다. 서식을 제 열로 빼려니 90px 이
     필요한데 «줄일 수 있는 칸이 하나도 없었다» — 위 최소들이 그것을 말한다.
     그래서 세 갈래를 대표께 보여 드리고 «표를 넓힌다»를 고르셨다(1094).
     ⚠ 이 값은 사람이 정하는 값이다. 코드가 저 혼자 올리면 안 된다 —
       올리기 전에 먼저 «어느 칸을 줄일 수 있나»를 재 볼 것. */
  const at = SRC.indexOf('<colgroup><col style="width:34px">');
  const seg = SRC.slice(at, SRC.indexOf('</colgroup>', at));
  const w = (seg.match(/width:(\d+)px/g) || []).map(x => Number(x.match(/\d+/)[0]));
  const sum = w.reduce((a, b) => a + b, 0);
  assert.ok(sum <= 1100,
    '★ 칸 폭 합이 ' + sum + ' 이다 — 1100 을 넘으면 좁은 창에서 좌우로 많이 넘친다');
});

/* ── ②③④ 딱지 접기 ───────────────────────────────────────────── */

test('★ 딱지가 여럿이면 «하나만» 보이고 나머지는 수로 접는다', () => {
  const h = tagHtml(['사업자등록증', '컨설턴트', '컨설팅신청 상세']);
  assert.ok(h.indexOf('사업자등록증') > 0, '첫 딱지는 보여야 한다');
  assert.ok(h.indexOf('+2') > 0, '★ 나머지를 「+2」로 접지 않았다 — 칸이 다시 접힌다');
  assert.ok(h.indexOf('컨설턴트') > h.indexOf('title='),
    '★ 나머지 이름이 딱지로 그대로 나왔다 — 말풍선에만 있어야 한다');
});

test('★ 보이는 딱지는 «짧은 이름»이다 — 긴 서식 이름이 상호를 밀어냈다 (2026-09-03)', () => {
  const h = tagHtml(['사업자등록증']);
  const 보이는것 = h.replace(/<[^>]*>/g, '');
  assert.equal(보이는것, '등록증', '화면에 나가는 글자: ' + 보이는것);
  assert.ok(h.indexOf('title="사업자등록증"') > 0, '온전한 이름은 말풍선에 남아야 한다');
});

test('★ 접은 것이 말풍선에 «온전히» 남는다 — 자른 채 아무 말이 없으면 알 길이 없다', () => {
  const h = tagHtml(['사업자등록증', '컨설턴트', '컨설팅신청 상세']);
  assert.ok(h.indexOf('컨설턴트 · 컨설팅신청 상세') > 0,
    '★ 접힌 딱지 이름이 어디에도 없다: ' + h);
});

test('딱지가 하나면 「+N」을 안 붙인다', () => {
  const h = tagHtml(['사업자등록증']);
  assert.ok(h.indexOf('사업자등록증') > 0);
  assert.ok(h.indexOf('+') < 0, '★ 하나뿐인데 「+0」이 붙었다: ' + h);
});

test('딱지가 없으면 아무것도 안 그린다 — 빈 딱지가 자리를 먹으면 안 된다', () => {
  assert.equal(tagHtml([]), '');
});

test('★ 꺾쇠를 그대로 안 내보낸다', () => {
  const h = tagHtml(['<b>가</b>', '<i>나</i>']);
  assert.ok(h.indexOf('<b>') < 0 && h.indexOf('<i>나') < 0,
    '★ 딱지 이름의 꺾쇠가 그대로 나갔다 — 화면이 깨진다: ' + h);
  assert.ok(h.indexOf('&lt;b&gt;') > 0, '다듬은 글자는 보여야 한다');
});

/* ── ⑤ 딱지 자체도 안 접힌다 ─────────────────────────────────── */

test('★ 긴 딱지 이름은 …로 자른다 — 안 자르면 칸을 넘어 옆을 민다', () => {
  /* 「통합 기술보호지원반 신청서」처럼 긴 이름이 실제로 있다 */
  const r = css('.corow .tg');
  assert.match(r, /white-space:nowrap/, '★ 딱지 안에서 글이 접힌다');
  assert.match(r, /text-overflow:ellipsis/, '★ 넘쳐도 안 자른다');
  assert.match(r, /max-width:\d+px/, '★ 폭을 안 막으면 긴 이름 하나가 칸을 다 먹는다');
  assert.match(r, /overflow:hidden/);
});

test('「+N」에도 말풍선이 붙는다 — 무엇이 접혔는지 물을 자리가 있어야 한다', () => {
  const h = tagHtml(['가', '나']);
  const m = h.match(/<span class="tgx"[^>]*>/);
  assert.ok(m, '「+N」 딱지를 찾지 못했다');
  assert.match(m[0], /title=/, '★ 눌러 볼 수도 물어볼 수도 없다');
});
