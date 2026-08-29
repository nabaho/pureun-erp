/* 상단바가 «두꺼워지지 않는다» (대표 보고 2026-08-29)
   「검은색 줄 전체가 아래로 내려왔다 올라갔다 한다」

   ★ 무엇이 문제였나 — 자리가 모자라면 탭 단추의 **글자가 두 줄로 접혔다.**
     그러면 단추가 커지고 그만큼 검은 줄이 두꺼워진다
     (실측: 1536px 에서 38px → 57px · 1200px 에서 109px).
     그런데 상단바 내용의 «폭»은 시시각각 바뀐다 — 저장 표시(저장 중…/저장 완료/
     기기 내 저장/다른 창 편집 중)·알림 숫자·남은시간 배지.
     그때마다 접혔다 펴졌다 하니 줄 전체가 아래위로 움직였다.

   ★ 규칙: **세로로 늘리지 않는다. 모자라면 가로로 넘긴다.** */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');

/* 미디어 규칙 한 덩이를 통째로 꺼낸다 */
function mediaBlock(cond) {
  const at = SRC.indexOf('@media' + cond);
  assert.ok(at > 0, '규칙을 찾지 못했다: @media' + cond);
  let i = SRC.indexOf('{', at), depth = 0, end = i;
  for (; end < SRC.length; end++) {
    if (SRC[end] === '{') depth++;
    else if (SRC[end] === '}') { depth--; if (!depth) break; }
  }
  return SRC.slice(i, end + 1);
}

test('넓은 화면에서 상단바 글자가 «두 줄로 접히지» 않는다', () => {
  const b = mediaBlock('(min-width:769px)');
  assert.ok(/\.hdr-tab[^{]*\{[^}]*white-space:\s*nowrap/.test(b) || /white-space:\s*nowrap/.test(b),
    '글자가 접히면 단추가 커지고 그만큼 줄이 두꺼워진다');
  assert.ok(/\.hdr>\*\{[^}]*flex-shrink:\s*0/.test(b),
    '단추가 찌그러지면 그 안의 글자가 접힌다 — 안 찌그러지게 해야 한다');
});

test('모자라면 «가로로» 넘긴다 — 세로로 늘리지 않는다', () => {
  const b = mediaBlock('(min-width:769px)');
  assert.ok(/\.hdr\{[^}]*flex-wrap:\s*nowrap/.test(b), '넓은 화면에서 줄이 접히면 두꺼워진다');
  assert.ok(/\.hdr\{[^}]*overflow-x:\s*auto/.test(b), '넘친 것이 갈 곳이 없다');
});

test('스크롤막대를 감춘다 — 생겼다 사라지면 그 두께만큼 또 움직인다', () => {
  const b = mediaBlock('(min-width:769px)');
  assert.ok(/scrollbar-width:\s*none/.test(b) && /::-webkit-scrollbar\{[^}]*display:\s*none/.test(b),
    '막대가 나타났다 사라지면 약 15px 씩 줄이 움직인다');
});

test('자리가 모자란 폭에서는 덜 쓰는 것을 «⋯ 안»으로 넣는다', () => {
  const b = mediaBlock('(min-width:769px) and (max-width:1599px)');
  assert.ok(/\.hdr-extra\{[^}]*display:\s*none/.test(b), '덜 쓰는 단추를 안 접는다');
  assert.ok(/\.hdr-more\{[^}]*display:\s*inline-flex/.test(b), '⋯ 단추가 안 나온다 — 접어 놓고 꺼낼 길이 없다');
  assert.ok(/\.hdr-r\.x-on \.hdr-extra\{[^}]*display:\s*flex/.test(b), '⋯ 를 눌러도 안 펴진다');
});

test('폰(768px 이하)은 «일부러» 여러 줄로 접는 것을 그대로 둔다', () => {
  const m = mediaBlock(' (max-width:768px)');
  assert.ok(/\.hdr\{[^}]*flex-wrap:\s*wrap/.test(m),
    '폰에서 한 줄로 밀어붙이면 단추가 화면 밖으로 나간다');
  /* 넓은 화면용 규칙이 폰까지 덮으면 안 된다 — 시작을 769 로 못 박는다 */
  assert.ok(SRC.indexOf('@media(min-width:769px)') > 0,
    '넓은 화면용 규칙의 시작 폭이 폰과 겹친다');
});

test('«세로로 늘리는» 규칙을 넓은 화면에 다시 넣지 않았다', () => {
  const b = mediaBlock('(min-width:769px)');
  assert.ok(!/\.hdr\{[^}]*flex-wrap:\s*wrap/.test(b), '넓은 화면에서 다시 접게 해 두었다');
  assert.ok(!/\.hdr\{[^}]*height:\s*auto/.test(b), '높이를 내용에 맡기면 다시 두꺼워진다');
});
