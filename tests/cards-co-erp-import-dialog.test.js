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

/* 최종 재검토 2026-08-14: _coErpImportCache 만 보고 다시 안 불러오게 막으면, 응답이
   오기 전에 탭을 눌렀다 뗐다 하면 조회를 중복해서 부르고, 늦게 온 응답이 "이름으로
   만들기" 탭으로 옮겨 타이핑 중인 화면을 조용히 덮어써 버렸다 — coErpFolderCandidates
   를 실제로는 비동기(콜백을 나중에 부름)로 흉내내 이 경쟁 상태를 증명한다. */
function loadDialogBlockAsync(){
  const at = source.indexOf('function openCoFolderDialog');
  assert.ok(at > 0, 'openCoFolderDialog 를 찾지 못했습니다');
  const end = source.indexOf('\nfunction confirmNewCoFolder', at);
  const code = source.slice(at, end);

  const calls = { dlgHtml:'', dlgOpen:false, candidateCalls:0 };
  let pendingCb = null;
  const ctx = {
    esc: s => String(s ?? ''),
    coErpFolderCandidates: cb => { calls.candidateCalls++; pendingCb = cb; },
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
  ctx._resolvePending = list => { const cb = pendingCb; pendingCb = null; cb(list); };
  return ctx;
}

test('탭을 여러 번 눌러도 응답이 오기 전엔 조회를 또 안 부른다', () => {
  const c = loadDialogBlockAsync();
  c.openCoFolderDialog();
  c.switchCoFolderDialogTab('erp');
  c.switchCoFolderDialogTab('name');
  c.switchCoFolderDialogTab('erp');
  assert.equal(c._calls.candidateCalls, 1, '응답이 오기 전에 또 조회를 부르면 안 된다');
});

test('응답이 늦게 와도 그 사이 다른 탭으로 옮겼으면 덮어쓰지 않는다', () => {
  const c = loadDialogBlockAsync();
  c.openCoFolderDialog();
  c.switchCoFolderDialogTab('erp');
  c.switchCoFolderDialogTab('name');
  c._resolvePending([{ label:'컨설팅·일터상생혁신', kind:'consulting', n:8, recs:[] }]);
  assert.match(c._calls.dlgHtml, /id="newCoFolderName"/, '이름 탭 화면이 그대로 남아 있어야 한다');
  assert.doesNotMatch(c._calls.dlgHtml, /일터상생혁신/, '늦게 온 이알피 응답이 이름 탭을 덮어쓰면 안 된다');
});

test('두 탭 모두 있다', () => {
  const at = source.indexOf('function openCoFolderDialog');
  const end = source.indexOf('\nfunction confirmNewCoFolder', at);
  const fn = source.slice(at, end);
  assert.match(fn, /switchCoFolderDialogTab\('name'\)/);
  assert.match(fn, /switchCoFolderDialogTab\('erp'\)/);
});
