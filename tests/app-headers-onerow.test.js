const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* 폰(≤520·700px)에서 머리줄이 낱말 가운데서 잘려 두 줄씩 나던 것을 한 줄로 못 박는다.
   ⚠ 값(픽셀·글자크기)이 아니라 «규칙» 을 본다 — 촘촘함을 더 다듬어도 안 깨지게. */

function phoneBlock(css, marker) {
  const at = css.indexOf(marker);
  assert.ok(at >= 0, marker + ' 표시를 찾지 못했습니다.');
  const open = css.indexOf('{', css.indexOf('@media', at));
  let depth = 0, i = open;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(at, i + 1);
}

test('급여관리 머리줄은 폰에서 줄바꿈하지 않고 이름은 …으로 줄인다', () => {
  const b = phoneBlock(read('payroll-os.html'), '/* 머리줄은 한 줄로');
  assert.match(b, /header\{[^}]*flex-wrap:\s*nowrap/,
    '★ flex-wrap:wrap 이면 「급여관리」와 이름이 두 줄로 갈라집니다.');
  assert.match(b, /#whoami\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(b, /#whoami\{[^}]*min-width:\s*0/,
    'min-width:0 이 없으면 flex 칸이 줄지 않아 머리줄이 화면을 밀어냅니다.');
});

test('급여관리 저장 알림은 폰에서 점만 남기되 «실패»는 글씨까지 되살린다', () => {
  const b = phoneBlock(read('payroll-os.html'), '/* 머리줄은 한 줄로');
  assert.match(b, /\.save-state\{[^}]*font-size:\s*0/);
  assert.match(b, /\.save-state\.failed\{[^}]*font-size:\s*(?!0)/,
    '★ 저장 «실패» 까지 점으로만 알리면 놓칩니다.');
  /* 점은 ::before 라 textContent 를 바꿔도 살아남는다 — setSaveState 가 글씨만 바꾼다. */
  assert.match(read('payroll-os.html'), /\.save-state::before\{[^}]*border-radius:\s*50%/);
});

test('급여데이터함 머리줄은 한 줄이고 이름 자리를 위해 곁다리 단추는 그림쇠만 남긴다', () => {
  const html = read('pu-paydata.html');
  const b = phoneBlock(html, '/* 폰 머리줄 — 한 줄로');
  assert.match(b, /header\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(b, /\.who\{[^}]*overflow-x:\s*auto/,
    '단추 묶음이 옆으로 밀리지 않으면 이름이 잘립니다.');
  assert.match(b, /#btnStaff[^{]*\{[^}]*font-size:\s*0/);
  assert.match(b, /#btnStaff::before\{content:'[^']+'/,
    '★ 글씨만 접고 그림쇠를 안 살리면 빈 단추가 됩니다.');
  assert.match(b, /#btnDeputy::before\{content:'[^']+'/);
  /* 글씨를 접은 단추는 읽어 주는 이름이 남아 있어야 한다. */
  assert.match(html, /id="btnStaff"[^>]*aria-label=/);
  assert.match(html, /id="btnDeputy"[^>]*aria-label=/);
});

test('취업규칙 머리줄 도구는 폰에서 쌓지 않고 옆으로 민다', () => {
  const html = read('rules.html');
  const b = phoneBlock(html, '/* 폰에서는 두 줄만 쓴다');
  /* 2단 격자로 쌓던 것이 머리줄을 200px 넘게 키웠다 — 격자로 되돌아가면 걸린다. */
  assert.doesNotMatch(b, /\.toolbar\{[^}]*display:\s*grid/,
    '★ 도구를 격자로 쌓으면 머리줄이 다시 화면 1/4을 먹습니다.');
  assert.match(b, /\.toolbar\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(b, /\.toolbar\{[^}]*overflow-x:\s*auto/);
  assert.match(b, /\.toolbar\{[^}]*min-width:\s*0/,
    '앞서 겪은 좌우 넘침 되풀이 — nowrap 줄에는 min-width:0 이 함께 있어야 합니다.');
  assert.match(b, /\.hdr-nav\{[^}]*overflow-x:\s*auto/);
});

test('취업규칙 바로가기 묶음은 PC 에서 «없는 셈»이라 PC 짜임이 그대로다', () => {
  const html = read('rules.html');
  assert.match(html, /header \.hdr-nav\{display:contents\}/,
    'display:contents 여야 PC 에서 감싼 것이 짜임에 끼어들지 않습니다.');
  const hdr = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
  assert.match(hdr, /<span class="hdr-nav">/);
  assert.ok(hdr.indexOf('href="enter.html">← 포털로</a></span>') > 0,
    '바로가기 묶음이 「← 포털로」까지 감싸야 한 줄 띠가 됩니다.');
});
