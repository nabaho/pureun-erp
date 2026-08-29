/* 거래내역 상단 정리 — 안 ㉮ (대표 결정 2026-08-29 「가」)
 *
 * 대표: 「반드시 없어도 되는 내용은 팝업으로 정리하고 깔끔하게 처리했으면 좋겠는데」
 *
 * 세어 보니 첫 줄이 나오기 전에 손잡이가 32개였다.
 * 그중 스물이 «가끔 쓰는 연장»인데 화면의 100%를 차지하고 있었다.
 * ★ 접는 것은 «연장»뿐이다 — 어디를 보는가(탭)와 지금 할 일은 늘 남는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const CSS = fs.readFileSync(path.join(R, 'css', 'pu-erp.css'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
/* CSS 는 주석만 걷는다 (// 는 CSS 주석이 아니다 — url(//…) 을 깎으면 안 된다) */
const C = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
const E = bare(ERP);

/* 그 자리가 «@media 안»인가 — 중괄호 깊이로 본다.
   ⚠ @media 개수를 세는 것으로는 안 된다. 앞쪽에 다 닫힌 @media 가 있으면
     밖에 있는 규칙도 「안에 있다」로 세어져, 지킴이를 떼어 내도 통과한다. */
function depthAt(css, at) {
  const head = css.slice(0, at);
  return (head.match(/\{/g) || []).length - (head.match(/\}/g) || []).length;
}

test('★★ ⚙ 도구가 «모든 화면»에서 보인다', () => {
  assert.ok(/\.ld-tools-btn\{\s*display:inline-block;\s*\}/.test(C),
    '★ ⚙ 가 폰에서만 나오면, 넓은 화면에서는 연장 스무 개가 늘 떠 있다 (대표가 센 것이 그것이다)');
  /* 폰 전용 구간에 display:none 이 남아 있으면 위 규칙을 덮어쓴다 */
  assert.ok(!/\.ld-tools-btn\{\s*display:none/.test(C),
    '★ ⚙ 를 숨기는 규칙이 아직 남아 있다');
});

test('★★ 연장 줄은 «닫혀 있으면 안 그린다» — 화면 폭과 상관없이', () => {
  const at = C.indexOf('.ld-up:not(.on){ display:none !important; }');
  assert.ok(at > 0, '★ 연장 줄을 접는 규칙이 없다');
  /* @media 안에 들어 있으면 그 폭에서만 접힌다 — 밖에 있어야 늘 접힌다 */
  assert.strictEqual(depthAt(C, at), 0,
    '★★ 접는 규칙이 아직 @media 안에 있다 — 폰에서만 접히고 대표 화면은 그대로다');
});

test('★★ 탭(은행·카드·CMS)은 «서랍 밖»에 있다 — 접어도 안 사라진다', () => {
  const upAt = E.indexOf("className:'ld-up'");
  assert.ok(upAt > 0, '연장 줄을 못 찾았다');
  const radioAt = E.indexOf("name:'ledgerType'");
  assert.ok(radioAt > 0, '탭 라디오를 못 찾았다');
  assert.ok(radioAt < upAt,
    '★★ 탭이 서랍 «안»에 있다 — 서랍을 접으면 은행·카드를 오갈 수가 없다');
});

test('★★ 「입금 확인」·연결 표가 «한 벌»이다', () => {
  assert.strictEqual((E.match(/🔔 입금 확인 /g) || []).length, 1,
    '★ 두 군데에 그리면 서랍을 열었을 때 같은 것이 두 개 보인다');
  /* ⚠ 함수 «정의»(function hanaStatChip())까지 세면 안 된다 — 부르는 곳만 센다. */
  assert.strictEqual((E.match(/(?<!function )hanaStatChip\(\)/g) || []).length, 1,
    '★ 연결 표가 두 벌이다');
});

test('★★ 할 일 칩은 «있을 때만» 나온다', () => {
  assert.ok(/hanaAlerts\.length>0 && _meNow\(\)\.isAdmin && h\('button'/.test(E),
    '★★ 늘 떠 있으면 아무 뜻이 없다 — 떠 있다는 것 자체가 「볼 것이 있다」여야 한다');
});

test('★★ 서랍은 «닫힌 채»로 시작한다', () => {
  assert.ok(/usePersistedState\('ledger_tools_open', false\)/.test(E),
    '★ 열린 채로 시작하면 정리한 뜻이 없다');
});

test('★ 늘 쓰는 것은 «접지 않는다» (기간·미처리·금액·주 단추)', () => {
  /* 폰 구간에서만 접는 것은 그대로 둔다 — 넓은 화면에서까지 접으면
     화면을 열 때마다 ⚙ 를 눌러야 한다. */
  const at = C.indexOf('.ld-bar:not(.on) .ld-bar-todo');
  assert.ok(at > 0, '접는 규칙을 못 찾았다');
  assert.ok(depthAt(C, at) > 0,
    '★★ 미처리·금액까지 늘 접으면, 화면을 열 때마다 ⚙ 를 눌러야 볼 수 있다');
});
