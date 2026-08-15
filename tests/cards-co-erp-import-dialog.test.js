/* "새 폴더 만들기" 창에 "이름으로 만들기"·"이알피에서 가져오기" 두 갈래를 둔다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadDialogBlock(){
  const at = source.indexOf('function openCoFolderDialog');
  assert.ok(at > 0, 'openCoFolderDialog 를 찾지 못했습니다');
  const end = source.indexOf('\nfunction confirmNewCoFolder', at);
  const code = source.slice(at, end);

  const calls = { dlgHtml:'', dlgOpen:false };
  const ctx = {
    esc: s => String(s ?? ''),
    coErpFolderCandidates: cb => cb(ctx._erpList || []),
    coImportFolderFromType: () => {},
    $: id => {
      if(id==='folderDlg') return { set innerHTML(v){ calls.dlgHtml=v; }, get innerHTML(){ return calls.dlgHtml; } };
      if(id==='folderDlgBg') return { classList:{ add(){ calls.dlgOpen=true; }, remove(){ calls.dlgOpen=false; } } };
      if(id==='newCoFolderName') return { focus(){} };
      return null;
    },
    setTimeout: f => f()
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

test('처음 열면 이름으로 만들기 탭이 보인다', () => {
  const c = loadDialogBlock();
  c.openCoFolderDialog();
  assert.match(c._calls.dlgHtml, /id="newCoFolderName"/);
  assert.equal(c._calls.dlgOpen, true);
});

test('이알피에서 가져오기 탭으로 바꾸면 사업 유형 목록이 보인다', () => {
  const c = loadDialogBlock();
  c._erpList = [{ label:'컨설팅·일터상생혁신', kind:'consulting', n:8, recs:[] }];
  c.openCoFolderDialog();
  c.switchCoFolderDialogTab('erp');
  assert.match(c._calls.dlgHtml, /일터상생혁신/);
  assert.match(c._calls.dlgHtml, /8곳/);
});

test('두 탭 모두 있다', () => {
  const at = source.indexOf('function openCoFolderDialog');
  const end = source.indexOf('\nfunction confirmNewCoFolder', at);
  const fn = source.slice(at, end);
  assert.match(fn, /switchCoFolderDialogTab\('name'\)/);
  assert.match(fn, /switchCoFolderDialogTab\('erp'\)/);
});
