/* 폴더 이름 적는 칸을 그 자리에 — 대표 지시 2026-08-10
   "폴더만들기 팝업을 멀리 두지말고 폴더만들기 바로옆에 팝업으로 해달라"

   브라우저 prompt 는 화면 한가운데 뜬다. 누른 자리(왼쪽 칸 맨 아래)와 묻는 자리가
   멀어서 눈이 따라가야 했다. 이제 폴더 줄 자리에서 바로 적는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('★ 폴더 이름을 브라우저 창(prompt)으로 묻지 않는다', () => {
  for (const fn of ['newFolder', 'renameFolderAsk']) {
    const m = html.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, fn + ' 를 찾지 못했습니다.');
    assert.ok(!/prompt\(/.test(m[0]),
      fn + ' 이 아직 화면 한가운데 창을 띄웁니다 — 누른 자리와 묻는 자리가 멉니다.');
    assert.ok(/foldOpen\(/.test(m[0]), fn + ' 이 그 자리 칸을 열지 않습니다.');
  }
});

test('★ 칸이 열리는 자리가 셋 다 제자리다', () => {
  const m = html.match(/function renderFolders\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderFolders 를 찾지 못했습니다.');
  /* 새 폴더 → 「＋ 폴더 만들기」 자리 / 이름 바꾸기 → 그 폴더 줄 / 하위폴더 → 어버이 바로 밑 */
  assert.ok(/foldEdit\.mode === 'new'[\s\S]{0,80}editRow\(false\)/.test(m[0]),
    '새 폴더 칸이 「＋ 폴더 만들기」 자리에 안 열립니다.');
  assert.ok(/foldEdit\.mode === 'rename' && foldEdit\.fid === fid/.test(m[0]),
    '이름 바꾸기 칸이 그 폴더 줄에 안 열립니다.');
  assert.ok(/foldEdit\.mode === 'sub' && foldEdit\.fid === fid/.test(m[0]),
    '하위폴더 칸이 어버이 바로 밑에 안 열립니다.');
});

test('열리면 곧바로 적을 수 있다 (커서가 가 있다)', () => {
  const m = html.match(/function renderFolders\(\)[\s\S]*?\n\}/);
  assert.ok(/inp\.focus\(\)/.test(m[0]), '커서가 안 가면 한 번 더 눌러야 합니다.');
  assert.ok(/inp\.select\(\)/.test(m[0]), '이름 바꿀 때 옛 이름이 골라져 있어야 지우기 쉽습니다.');
});

test('★ Enter 로 끝내고 Esc 로 접는다', () => {
  const m = html.match(/function foldKey\(e\)[\s\S]*?\n\}/);
  assert.ok(m, 'foldKey 를 찾지 못했습니다.');
  assert.ok(/e\.key === 'Enter'[\s\S]{0,60}foldSubmit\(\)/.test(m[0]), 'Enter 로 못 끝냅니다.');
  assert.ok(/e\.key === 'Escape'[\s\S]{0,60}foldCancel\(\)/.test(m[0]), 'Esc 로 못 접습니다.');
});

test('★ 이름을 비우면 그냥 접는다 — 지우기가 아니다', () => {
  const m = html.match(/function foldSubmit\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'foldSubmit 을 찾지 못했습니다.');
  assert.ok(/if \(!name\) \{ foldCancel\(\); return; \}/.test(m[0]),
    '이름을 비웠다고 폴더가 지워지면, 예전의 알아채기 어려운 손짓이 되살아납니다.');
  assert.ok(!/deleteFolder/.test(m[0]), '적는 칸에서 지우면 안 됩니다 — 지우기는 ⋯ 차림표에 있습니다.');
});

test('세 갈래가 각각 맞는 일을 한다', () => {
  const m = html.match(/function foldSubmit\(\)[\s\S]*?\n\}/);
  assert.ok(/mode === 'rename'[\s\S]{0,120}renameFolder\(fid, name\)/.test(m[0]), '이름 바꾸기가 어긋납니다.');
  assert.ok(/addFolder\(name, mode === 'sub' \? fid : null\)/.test(m[0]),
    '하위폴더면 어버이를, 새 폴더면 없음을 넘겨야 합니다.');
});

/* ── 실제로 돌려 본다 ── */
test('★ 갈래마다 어느 자리에 열릴지 정해진다', () => {
  const src = [
    html.match(/let foldEdit = \{[^\n]*\n/)[0],
    html.match(/function foldOpen\(mode, fid, value, hint\)[\s\S]*?\n\}/)[0],
    html.match(/function foldCancel\(\)[^\n]*\n/)[0]
  ].join('\n').replace(/renderFolders\(\);/g, 'drew++;');
  const ctx = { drew: 0 };
  vm.createContext(ctx);
  vm.runInContext(src.replace(/^let /gm, 'var '), ctx);
  const open = vm.runInContext('foldOpen', ctx);
  open('sub', 'top1', '', '이름');
  /* ⚠ vm 안에서 만든 객체는 겉모습이 같아도 deepEqual 이 통과하지 못한다(다른 realm).
     펼쳐서 견준다 — 이 검사에서 볼 것은 값이지 어디서 만들어졌는가가 아니다. */
  assert.deepEqual({ ...vm.runInContext('foldEdit', ctx) },
    { mode: 'sub', fid: 'top1', value: '', hint: '이름' });
  vm.runInContext('foldCancel', ctx)();
  assert.equal(vm.runInContext('foldEdit.mode', ctx), '', '접으면 칸이 사라져야 합니다.');
  assert.ok(ctx.drew >= 2, '열고 접을 때마다 다시 그려야 화면에 반영됩니다.');
});
