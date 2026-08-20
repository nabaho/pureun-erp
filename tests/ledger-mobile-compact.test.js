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

test('★ 폰에서는 «접는다» — 늘 보이는 것은 탭·확정·⚙ 도구뿐', () => {
  /* 세 번 고쳐 여기까지 왔다.
     ① 여백만 줄이니 폭이 좁아질수록 도로 나빠졌다.
     ② 옆으로 밀게 하니 높이는 고정됐지만, 칸이 스물 남짓이라 「거기 뭐가 있는지
        아는 사람」에게만 쓸 만한 화면이 됐다(대표 지적 "좌우로 너무 길다").
     ③ 그래서 접는다. 폰에서 이 화면으로 하는 일은 «줄을 보고 확정하는 것»이고,
        엑셀 올리기는 PC 에서 한다. */
  const b = phoneBlock();
  assert.match(b, /\.ld-up:not\(\.on\)\{ display:none !important; \}/,
    '★ 올리기 판은 접어 둔다 — 폰으로 통장 엑셀을 받을 일이 없다.');
  ['ld-bar-nav','ld-bar-mon','ld-bar-prog','ld-bar-pct','ld-bar-amt','ld-bar-auto'].forEach(function(c){
    assert.match(b, new RegExp('\\.ld-bar:not\\(\\.on\\) \\.' + c), c + ' 가 접히지 않습니다.');
  });
  /* ★ 늘 보여야 하는 것 — 접으면 폰에서 할 일 자체를 못 한다 */
  ['ld-tab', 'ld-bar-go'].forEach(function(c){
    assert.doesNotMatch(b, new RegExp('\\.ld-bar:not\\(\\.on\\) \\.' + c + '[^,{]*[,{][^}]*display:none'),
      '★ ' + c + ' 를 접으면 폰에서 목록을 고르거나 확정할 수가 없습니다.');
  });
});

test('★ 「접는다」는 «없앤다»가 아니다 — ⚙ 한 번이면 다 나오고, 편 상태는 기억한다', () => {
  const b = phoneBlock();
  assert.match(b, /\.ld-tools-btn\{ display:inline-block/, '폰에 ⚙ 단추가 없으면 펼 길이 없습니다.');
  assert.match(erp, /className:'ld-tools-btn'/);
  assert.match(erp, /usePersistedState\('ledger_tools_open'/,
    '★ 기억하지 않으면 화면을 옮길 때마다 다시 펴야 합니다.');
  assert.match(erp, /className:'ld-up' \+ \(ldTools \? ' on' : ''\)/);
  assert.match(erp, /className:'ld-bar' \+ \(ldTools \? ' on' : ''\)/);
  /* 펴면 «밀지» 말고 늘어놓는다 — 일부러 편 것이니 찾기 쉬워야 한다 */
  assert.match(b, /\.ld-up\.on\{[^}]*flex-wrap:wrap !important/);
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
