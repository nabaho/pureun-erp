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
  const end = SRC.indexOf('})()}</td>', at);
  assert.ok(end > at, '그 대목의 끝을 찾지 못했다');
  const ctx = { console, Object, String, Array,
    coTagsOf: () => tags,
    /* ⚠ 그냥 넘기는 대역을 쓰면 「꺾쇠를 안 내보낸다」가 늘 통과한다 — 진짜처럼 만든다 */
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
  vm.createContext(ctx);
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

/* ── ②③④ 딱지 접기 ───────────────────────────────────────────── */

test('★ 딱지가 여럿이면 «하나만» 보이고 나머지는 수로 접는다', () => {
  const h = tagHtml(['사업자등록증', '컨설턴트', '컨설팅신청 상세']);
  assert.ok(h.indexOf('사업자등록증') > 0, '첫 딱지는 보여야 한다');
  assert.ok(h.indexOf('+2') > 0, '★ 나머지를 「+2」로 접지 않았다 — 칸이 다시 접힌다');
  assert.ok(h.indexOf('컨설턴트') > h.indexOf('title='),
    '★ 나머지 이름이 딱지로 그대로 나왔다 — 말풍선에만 있어야 한다');
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
