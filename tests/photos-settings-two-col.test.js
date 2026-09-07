/* 사진첩 설정 — 넓은 화면에서 좌우로 나눈다 (대표 지시 2026-09-07)
   「아래로 모두 내려오게 할 필요없다 좌우에 적정하게 설정관련 내용 배분해라」

   ■ 무엇이 문제였나
   `#viewSettings .card` 에 `max-width:560px` 이 걸려, 1,900px 화면에서도 560px 한 줄로만
   쌓였다 — 오른쪽 3분의 2가 늘 비어 있고 스크롤만 길었다.

   ★ 못 박는 것
     ① 자리를 «이름»으로 정한다(#setUse·#setKeep·#setBackup). nth-child 로 두면 카드가
        하나 늘거나 차례가 바뀔 때 조용히 어긋나고, 그때 화면은 멀쩡해 보이고 빈 칸만 남는다.
     ② 가장 긴 카드(보유기간)가 오른쪽 한 칸을 통째로 쓴다 — 거꾸로면 왼쪽에 큰 구멍이 남는다.
     ③ 좁은 창·폰에서는 «예전 그대로» 한 줄이다.
     ④ 묶음 폭을 560×2+틈 으로 묶는다 — 카드를 늘리면 한 줄이 너무 길어 읽기 나쁘다.

     node --test tests/photos-settings-two-col.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8').split('\r\n').join('\n');

/* 규칙 한 덩이를 «선언»으로 갈라 본다 — 있다/없다가 아니라 값을 본다 */
function decls(sel) {
  const i = SRC.indexOf('\n' + sel + '{');
  assert.ok(i > 0, sel + ' 규칙을 못 찾았다');
  const body = SRC.slice(i + sel.length + 2, SRC.indexOf('}', i));
  const out = {};
  body.split(';').forEach(d => { const k = d.indexOf(':'); if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim(); });
  return out;
}
/* @media 한 덩이를 떠 온다 */
function media(q) {
  const i = SRC.indexOf('@media (' + q + '){');
  assert.ok(i > 0, '@media ' + q + ' 를 못 찾았다');
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail('@media 의 끝을 못 찾았다');
}

/* ── 마크업 ── */

test('★★ 카드 셋에 «이름»이 붙어 있고 한 칸(#setCards) 안에 있다', () => {
  ['setCards', 'setUse', 'setKeep', 'setBackup'].forEach(id =>
    assert.ok(SRC.indexOf('id="' + id + '"') > 0, '★ #' + id + ' 이 없다'));
  const a = SRC.indexOf('<div id="setCards">');
  const b = SRC.indexOf('</div><!-- /#setCards -->');
  assert.ok(a > 0 && b > a, '★ #setCards 를 열고 닫은 자리를 못 찾았다');
  const seg = SRC.slice(a, b);
  ['setUse', 'setKeep', 'setBackup'].forEach(id =>
    assert.ok(seg.indexOf('id="' + id + '"') > 0, '★ #' + id + ' 이 #setCards 밖에 있다'));
  /* 할 일 줄과 문제 해결 도구는 «밖»이다 — 띠는 늘 맨 위 전폭, 도구는 접혀 있다.
     ⚠ 「밖에 있다」만 보면 안 된다 — 아예 «없어도» 밖이다(2026-09-07 고장넣기에서
       실제로 샜다). 있는지와 «어디에» 있는지를 둘 다 본다. */
  const todo = SRC.indexOf('<div id="setTodo"');
  assert.ok(todo > 0, '★ 할 일 줄이 아예 없다');
  assert.ok(todo < a, '★ 할 일 줄이 카드 묶음보다 «아래»에 있다 — 띠는 맨 위여야 한다');
  assert.ok(seg.indexOf('id="setTodo"') < 0, '★ 할 일 줄이 두 칸 안으로 들어갔다');
  const tools = SRC.indexOf('<details id="setTools"');
  assert.ok(tools > b, '★ 문제 해결 도구가 카드 묶음 «위»에 있거나 없다');
  assert.ok(seg.indexOf('id="setTools"') < 0, '★ 문제 해결 도구가 두 칸 안으로 들어갔다');
});

/* ── 자리 ── */

test('★★★ 자리를 «이름»으로 정한다 — nth-child 로 두면 조용히 어긋난다', () => {
  const m = media('min-width:1200px');
  assert.match(m, /#setUse\{grid-column:1;grid-row:1\}/, '★ 담긴 양의 자리가 없다');
  assert.match(m, /#setBackup\{grid-column:1;grid-row:2\}/, '★ 연말 백업의 자리가 없다');
  assert.match(m, /#setKeep\{grid-column:2;grid-row:1 \/ span 2\}/,
    '★ 보유기간이 오른쪽 한 칸을 통째로 쓰지 않는다');
  assert.ok(!/nth-child|nth-of-type/.test(m),
    '★ 차례로 자리를 정한다 — 카드가 하나 늘면 조용히 어긋난다');
});

test('★★ 가장 «긴» 카드가 오른쪽을 통째로 쓴다 — 거꾸로면 왼쪽에 구멍이 남는다', () => {
  /* 카드 길이를 글자 수로 견준다 — 보유기간이 가장 길어야 한다 */
  const cut = id => {
    const i = SRC.indexOf('id="' + id + '"');
    assert.ok(i > 0, id);
    let d = 0;
    for (let k = SRC.indexOf('>', i); k < SRC.length; k++) {
      if (SRC.startsWith('<div', k)) d++;
      else if (SRC.startsWith('</div>', k)) { d--; if (!d) return SRC.slice(i, k); }
    }
    assert.fail(id + ' 의 끝을 못 찾았다');
  };
  const keep = cut('setKeep').length, use = cut('setUse').length, bk = cut('setBackup').length;
  assert.ok(keep > use && keep > bk,
    '★ 보유기간이 가장 긴 카드가 아니다 (보유기간 ' + keep + ' · 담긴양 ' + use + ' · 백업 ' + bk + ')'
    + ' — 자리 배분을 다시 정해야 한다');
  /* 그 «가장 긴 것»이 두 줄을 차지하는 쪽이다 */
  assert.match(media('min-width:1200px'), /#setKeep\{[^}]*span 2/,
    '★ 가장 긴 카드가 두 줄을 안 쓴다');
});

/* ── 폭 ── */

test('★★ 묶음 폭을 «560×2 + 틈» 으로 묶는다 — 늘리면 한 줄이 너무 길어 읽기 나쁘다', () => {
  const one = parseInt(decls('#viewSettings .card')['max-width'], 10);
  assert.equal(one, 560, '★ 카드 한 장의 폭이 560px 이 아니다 — 아래 셈이 틀어진다');
  const m = media('min-width:1200px');
  const gap = Number((m.match(/column-gap:(\d+)px/) || [])[1]);
  const wrap = Number((m.match(/#setCards\{[^}]*max-width:(\d+)px/) || [])[1]);
  assert.ok(gap > 0 && wrap > 0, '★ 틈이나 묶음 폭을 못 찾았다');
  assert.equal(wrap, one * 2 + gap,
    '★ 묶음 폭이 560×2+' + gap + ' 이 아니다 (' + wrap + ') — 한쪽이 남거나 넘친다');
  /* 카드가 제 칸을 채우게 풀어 준다 — 안 풀면 560px 에 묶여 오른쪽이 빈다 */
  assert.match(m, /#setCards > \.card\{max-width:none\}/,
    '★ 카드가 제 칸을 안 채운다 — 칸은 넓은데 카드가 560px 에 묶인다');
  /* 갈리는 문턱이 묶음 폭보다 넓어야 한다 — 좌우 여백이 든다 */
  const th = Number((m.match(/@media \(min-width:(\d+)px\)/) || [])[1]);
  assert.ok(th > wrap, '★ 두 칸으로 갈리는 문턱(' + th + ')이 묶음 폭(' + wrap + ')보다 좁다');
});

test('★★ 좁은 창·폰에서는 «예전 그대로» 한 줄이다', () => {
  /* 두 칸으로 만드는 규칙이 @media «안»에만 있어야 한다 */
  const m = media('min-width:1200px');
  const 밖 = SRC.split(m).join('');
  assert.ok(밖.indexOf('#setCards{display:grid') < 0,
    '★ 두 칸 규칙이 @media 밖에 있다 — 폰에서도 두 칸이 된다');
  assert.ok(밖.indexOf('#setUse{grid-column') < 0, '★ 자리 규칙이 @media 밖에 있다');
});

test('★ 할 일 줄과 문제 해결 도구도 같은 폭에 맞춘다 — 혼자 넓으면 줄이 안 맞는다', () => {
  const m = media('min-width:1200px');
  const wrap = Number((m.match(/#setCards\{[^}]*max-width:(\d+)px/) || [])[1]);
  const d = decls('#setTodo,#setTools');
  assert.equal(parseInt(d['max-width'], 10), wrap,
    '★ 할 일 줄·도구의 폭이 카드 묶음과 다르다');
});
