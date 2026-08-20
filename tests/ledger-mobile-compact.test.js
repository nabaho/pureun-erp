const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'pu-erp.css'), 'utf8');

/* 거래내역 매칭 화면 — 폰에서 표가 나오기까지 520px(화면 하나)을 썼다.
   ⚠ 값이 아니라 «규칙» 을 본다 — 여백을 더 다듬어도 안 깨지게. */

function phoneBlock() {
  const at = css.indexOf('/* ══════ 거래내역 매칭 화면');
  assert.ok(at >= 0, '거래내역 매칭 폰 블록을 찾지 못했습니다.');
  const open = css.indexOf('{', css.indexOf('@media', at));
  let depth = 0, i = open;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(at, i + 1);
}

test('세 판에 css 가 잡을 손잡이가 달려 있다', () => {
  /* 안쪽 style= 로 그려지는 화면이라 손잡이가 없으면 css 가 아무것도 못 한다.
     손잡이가 빠지면 규칙은 그대로인데 화면만 조용히 예전으로 돌아간다. */
  ['ld-up', 'ld-bar', 'ld-sum'].forEach(function (c) {
    assert.match(erp, new RegExp("className:'" + c + "'"), c + ' 손잡이가 없습니다.');
  });
});

test('폰에서 끌어다 놓기 안내와 칸막이를 접는다', () => {
  const b = phoneBlock();
  assert.match(b, /\.ld-up-drophint\{[^}]*display:\s*none/,
    '★ 폰에는 끌어다 놓기가 없습니다 — 안내가 한 줄을 먹습니다.');
  assert.match(b, /\.ld-up-sep\{[^}]*display:\s*none/);
  /* 접는 것은 «폰에서 뜻이 없는 것» 뿐이다 — 파일 선택 단추는 접으면 안 된다.
     (폰에서 엑셀을 올리는 유일한 길이다.) */
  assert.doesNotMatch(b, /\.ld-up-file\{[^}]*display:\s*none/,
    '★ 파일 선택을 접으면 폰에서 자료를 올릴 길이 없어집니다.');
  assert.match(erp, /className:'ld-up-file'/);
});

test('달 띠는 옆으로 미는 한 줄이고, 목록 탭과 확정 단추가 앞에 온다', () => {
  /* 2026-08-20 「한 줄을 통째로 쓰는 큰 단추」에서 바뀌었다 — 여백만 줄이니 폭이
     좁아질수록(글자를 키우면 그렇다) 도로 여러 줄이 됐다. 줄바꿈을 없애면 폭과
     상관없이 높이가 고정이다. 그러면 «무엇이 먼저 보이느냐»가 곧 짜임이 된다. */
  const b = phoneBlock();
  assert.match(b, /\.ld-up,\.ld-bar\{[^}]*flex-wrap:nowrap !important/);
  assert.match(b, /\.ld-up,\.ld-bar\{[^}]*overflow-x:auto/);
  assert.match(b, /\.ld-up,\.ld-bar\{[^}]*min-width:0 !important/,
    '★ nowrap 인 줄에 min-width:0 이 없으면 쪽 자체가 좌우로 넓어집니다.');
  assert.match(b, /\.ld-up,\.ld-bar\{[^}]*max-width:100% !important/);
  /* ★ 앞으로 당기려면 «음수» 여야 한다 — 손대지 않은 칸이 order:0 이라
     order:1 로 두면 오히려 맨 뒤로 간다(실제로 그렇게 났다). */
  const tab = b.match(/\.ld-bar \.ld-tab\{[^}]*order:\s*(-?\d+)/);
  const go = b.match(/\.ld-bar \.ld-bar-go\{[^}]*order:\s*(-?\d+)/);
  assert.ok(tab && Number(tab[1]) < 0, '★ 목록 탭 order 가 음수가 아니면 맨 뒤로 갑니다.');
  assert.ok(go && Number(go[1]) < 0, '★ 확정 단추 order 가 음수가 아니면 맨 뒤로 갑니다.');
  assert.ok(Number(tab[1]) < Number(go[1]), '탭이 확정 단추보다 앞이어야 합니다.');
  assert.match(b, /\.ld-bar-gap\{[^}]*display:\s*none/,
    '빈칸이 남아 있으면 미는 줄에서 자리만 벌립니다.');
  /* 손잡이는 «확정 가능 N건 모두 확정» 단추에 붙어 있어야 한다 */
  const at = erp.indexOf("className:'ld-bar-go'");
  assert.ok(at > 0);
  assert.ok(erp.slice(at, at + 400).includes("'✅ 확정 가능 '+readyRows.length+'건 모두 확정'"),
    '★ ld-bar-go 가 확정 단추가 아닌 다른 단추에 붙었습니다.');
});

test('한 번 읽으면 그만인 안내는 폰에서 접되 칩 자체는 남는다', () => {
  const b = phoneBlock();
  assert.match(b, /\.ld-hint\{[^}]*display:\s*none/);
  /* 안내를 접어도 같은 말이 칩의 title 에 남아 있어야 한다 */
  assert.match(erp, /눌러서 이 갈래만 모아 보기/);
  /* 칩(확정 가능·확인 필요·후보 없음·이미 처리)은 접지 않는다 — 거르는 손잡이다 */
  assert.doesNotMatch(b, /\.ld-sum [^{]*button\{[^}]*display:\s*none/);
  /* ★ 요약 칩 줄만은 «옆으로 밀지» 않는다 — 넷을 한눈에 견주는 것이 이 줄의
     값어치라, 밀어서 하나씩 보게 하면 그 값어치가 사라진다. */
  assert.doesNotMatch(b, /\.ld-sum\{[^}]*flex-wrap:nowrap/,
    '★ 요약 칩을 밀어 보게 하면 네 갈래를 한눈에 견줄 수 없습니다.');
});

test('폰 규칙은 좁은 화면에만 걸고 PC 는 건드리지 않는다', () => {
  const b = phoneBlock();
  assert.match(b, /@media \(max-width:\s*\d+px\)/);
  const w = Number(b.match(/@media \(max-width:\s*(\d+)px\)/)[1]);
  assert.ok(w <= 768, '폰 규칙이 ' + w + 'px 까지 걸려 있어 PC 화면까지 줄입니다.');
});
