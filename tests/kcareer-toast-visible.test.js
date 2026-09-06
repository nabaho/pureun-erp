'use strict';
/* 알림(토스트)이 «아래쪽 탭 바에 가려» 읽히지 않던 것 (대표 제보 2026-09-06)
   「아래쪽에 팝업 글자가 나오는데 뭔지 안보인다 계속 이상하다 정확하게 고쳐라」

   ■ 재 보니 두 가지가 «겹쳐» 있었다 — 하나만 고치면 여전히 이상해 보인다
     ① 겹침 차례가 아래였다 : #_toast z-index:50  <  #groupTabs z-index:60
        → 바가 알림 «위에» 그려져 글자가 잘렸다
     ② 자리가 바 «안»이었다 : 알림 bottom:24px, 바 높이 47~56px
        → 차례를 올려도 바 위에 겹쳐 떴다

   ■ 이 검사가 지키는 것
   값(24px·56px)이 아니라 «규칙»을 본다 —
     · 알림이 바보다 «위»에 그려지는가(겹침 차례)
     · 바가 있는 화면에서 알림이 바 «높이만큼» 물러나는가
   자리 숫자를 못 박지 않는다. 바 높이는 화면 폭에 따라 달라지고,
   이미 --gtabH 로 재 두고 있다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');

/* CSS 한 덩이를 꺼낸다 */
function 규칙(sel) {
  const i = src.indexOf(sel + '{');
  if (i < 0) return '';
  return src.slice(i, src.indexOf('}', i) + 1);
}
function 차례(sel) {
  const m = /z-index:\s*(\d+)/.exec(규칙(sel));
  return m ? Number(m[1]) : null;
}

test('아래쪽 탭 바가 있고, 그 높이를 재 두고 있다', () => {
  assert.ok(규칙('#groupTabs'), '#groupTabs 를 못 찾았다 — 이 검사부터 고칠 것');
  assert.match(src, /--gtabH/, '바 높이를 재 두지 않으면 알림을 얼마나 띄울지 알 수 없다');
  assert.match(src, /has-gtabs/, '바가 있는 화면인지 가리는 표가 있어야 한다');
});

test('★★ 알림이 아래쪽 탭 바보다 «위»에 그려진다', () => {
  const t = 차례('#_toast'), g = 차례('#groupTabs');
  assert.ok(t != null, '#_toast 의 겹침 차례를 못 찾았다');
  assert.ok(g != null, '#groupTabs 의 겹침 차례를 못 찾았다');
  assert.ok(t > g,
    '알림(' + t + ')이 바(' + g + ')보다 아래에 그려진다 — 바가 알림 위를 덮어\n' +
    '    글자가 잘리고 무슨 말인지 못 읽는다(대표 제보 2026-09-06).');
});

test('★★ 바가 있는 화면에서는 알림이 «바 높이만큼» 물러난다', () => {
  /* 차례만 올리면 바 위에 «겹쳐» 뜬다 — 자리도 옮겨야 한다 */
  const re = /body\.has-gtabs\s+#_toast\s*\{[^}]*bottom:\s*calc\([^)]*--gtabH[^)]*\)/;
  assert.ok(re.test(src),
    '바가 있을 때 알림이 물러나지 않는다 — 바 위에 겹쳐 뜬다.\n' +
    '    ⚠ 픽셀 값을 박지 말 것. 바 높이는 --gtabH 로 이미 재 두고 있다.');
});

test('되살리기 알림도 같은 다툼을 겪지 않는다', () => {
  const u = 차례('#kcUndo'), g = 차례('#groupTabs');
  assert.ok(u != null && u > g,
    '되살리기 알림(' + u + ')이 바(' + g + ')보다 아래다 — 눌러야 하는 단추가 가린다');
  assert.match(src, /body\.has-gtabs\s+#kcUndo\s*\{[^}]*--gtabH/,
    '되살리기 알림도 바가 있으면 물러나야 한다');
});

test('알림이 «한 줄에 다 못 담는 글»도 보여 준다', () => {
  /* 안내가 길어지면 한 줄로 흘러 화면 밖으로 나간다 — 폭을 묶고 줄을 넘긴다.
     실제로 「⚠ 1건은 읽었지만 이 화면에 담지 못했습니다 — …(page=work)」처럼 길다. */
  const r = 규칙('#_toast');
  assert.match(r, /max-width/, '폭을 안 묶으면 긴 안내가 화면 밖으로 나간다');
  assert.ok(!/white-space:\s*nowrap/.test(r),
    '한 줄로 못 박으면 긴 안내가 잘린다');
});
