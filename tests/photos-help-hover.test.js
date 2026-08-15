/* 안내는 마우스를 올리면 그 자리에서 펼쳐진다 — 대표 지시 2026-08-10
   "팝업말고 셀위에 마우스위에 오리면 설명하는 내용 나오게 해라."

   팝업은 화면을 덮고, 읽고 나면 또 닫아야 한다. 한 줄 안내를 보자고 두 번
   누르는 셈이었다. 마우스를 올리면 바로 보이고 떼면 사라진다.

   ⚠ 팝업 자체는 없애지 않는다 — 폰에는 마우스가 없다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('★ 마우스를 올리면 안내가 펼쳐진다', () => {
  const css = app.match(/@media \(hover:hover\)\{[^}]*\.tipwrap[^}]*\}[^}]*\}/);
  assert.ok(css, '마우스를 올렸을 때 펴는 규칙이 없습니다.');
  assert.ok(/\.tipwrap:hover \.tip/.test(css[0]), '올려도 펴지지 않습니다.');
  assert.ok(/display:block/.test(css[0]), '펴는 것이 아니라 다른 일을 합니다.');
});

test('★ 폰에서는 펴지지 않는다 — 눌러서 여는 팝업 그대로', () => {
  /* 폰은 손가락이 닿는 순간 hover 로 잡힌다. 안내가 눌린 것처럼 뜨고
     떼도 안 사라져, 그 아래 것을 가린 채 남는다. */
  const at = app.indexOf('.tipwrap:hover .tip');
  assert.ok(at > 0, '펴는 규칙을 찾지 못했습니다.');
  const before = app.slice(Math.max(0, at - 200), at);
  assert.ok(/@media \(hover:hover\)/.test(before),
    'hover 되는 기기로 가두지 않으면 폰에서 안내가 눌러붙습니다.');
});

test('★ 팝업으로 가는 길은 남아 있다', () => {
  /* 폰에는 마우스가 없다 — 팝업까지 걷어내면 안내를 볼 길이 아예 사라진다. */
  assert.ok(/onclick="openUpHelp\(\)"/.test(app), '눌러서 여는 길이 없어졌습니다.');
  assert.ok(/function openUpHelp\(\)/.test(app), 'openUpHelp 가 없어졌습니다.');
});

test('★ 안내 글은 한 곳에서만 만든다', () => {
  /* 두 곳에 적으면 하나만 고쳐 놓고 다른 하나가 옛말을 하게 된다. */
  assert.ok(/function upHelpHtml\(\)/.test(app), '안내 글을 만드는 곳이 하나가 아닙니다.');
  const pop = app.match(/function openUpHelp\(\)[\s\S]*?\n\}/);
  assert.ok(pop && /upHelpHtml\(\)/.test(pop[0]), '팝업이 제 글을 따로 적고 있습니다.');
  const fill = app.match(/function fillUpTip\(\)[\s\S]*?\n\}/);
  assert.ok(fill && /upHelpHtml\(\)/.test(fill[0]), '툴팁이 제 글을 따로 적고 있습니다.');
});

test('★ 안내를 실제로 채운다 — 안 채우면 빈 칸이 뜬다', () => {
  assert.ok(/id="upTip"/.test(app), '안내가 들어앉을 자리가 없습니다.');
  const call = app.match(/fillUpTip\(\);/g) || [];
  assert.ok(call.length >= 1, '채우는 곳이 없으면 마우스를 올려도 빈 칸만 뜹니다.');
  assert.ok(/loadFolders\(\);\s*\r?\n\s*fillUpTip\(\);/.test(app),
    '로그인 뒤에 채워야 합니다 — 장수 상한이 저장 층에서 옵니다.');
});

test('안내가 대시보드 밖으로 나가 잘리지 않는다', () => {
  /* #side 가 overflow-y:auto 라 밖으로 나가면 잘린다 */
  const css = app.match(/\.tipwrap \.tip\{[^}]*\}/);
  assert.ok(css, '.tipwrap .tip 규칙이 없습니다.');
  assert.ok(/right:0/.test(css[0]), '오른쪽 끝에 안 맞추면 대시보드 밖으로 넘칩니다.');
  const w = css[0].match(/width:(\d+)px/);
  assert.ok(w && Number(w[1]) <= 236,
    '대시보드 안(264px - 여백 28px)에 안 들어가면 잘려서 못 읽습니다.');
});
