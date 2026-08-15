/* 기업정보 폴더 — 명함·사업자와 같은 손놀림으로 손으로 만들고 회사를 담는다.
   ⚠ 회사는 폴더 하나에만 든다(명함 폴더와 같은 규칙). 여러 사업에 걸치는 것은
     탭이 맡는다 — 둘을 한 가지로 만들면 「이 회사가 왜 여기 있지」가 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('폴더 저장소 함수가 있다', () => {
  assert.match(source, /let _coFolders = \{\}/);
  assert.match(source, /function loadCoFolders/);
  assert.match(source, /function putCoFolder/);
  assert.match(source, /DB_ROOT\+'\/coFolders'/);
});

test('만들기·이름바꾸기·지우기가 있다', () => {
  assert.match(source, /function openCoFolderDialog/);
  assert.match(source, /function confirmNewCoFolder/);
  assert.match(source, /function renameCoFolder/);
  assert.match(source, /function deleteCoFolder/);
});

test('옆줄에 폴더 목록과 ＋가 있다', () => {
  const at = source.indexOf("if(state.view==='co'){");
  const fn = source.slice(at, at + 1400);
  assert.match(fn, /onclick="openCoFolderDialog\(\)"/, '＋ 를 못 찾았다');
  assert.match(fn, /_coFolders/, '옆줄이 폴더 목록을 안 그린다');
  /* 정규식 리터럴로 쓰면 tests-no-local-path 검사의 "따옴표+글자+콜론+슬래시"
     경로 탐지 규칙을 오검출로 건드린다(윈도우 드라이브 문자와 글자 모양이 같아서다).
     new RegExp(문자열)로 같은 뜻을 그 검사를 피해서 쓴다. */
  assert.match(fn, new RegExp("pickCoFolder\\('f:"), "폴더를 눌러 고르는 길이 없다");
});

test('회사 상세에 폴더 이름을 보여준다', () => {
  const at = source.indexOf('function coDetailPanelHtml');
  const fn = source.slice(at, source.indexOf('\n}', at));
  assert.match(fn, /_coFolders\[o\.folder\]/);
});

test('openCoPage 가 폴더 목록도 불러온다', () => {
  const at = source.indexOf('function openCoPage');
  const fn = source.slice(at, at + 300);
  assert.match(fn, /loadCoFolders\(/);
});

/* 여기서부터는 putCoFolder·confirmNewCoFolder·renameCoFolder·deleteCoFolder·
   openCoFolderMenu·pickCoFolder 를 실제로 돌려서 증명한다.
   cards-co-col-filter.test.js 와 같은 방식 — 필요한 것만 손으로 쥐여준다.
   ⚠ "let _coFolders = {}" 선언 줄은 일부러 안 담는다 — vm 에서 top-level let 은
     컨텍스트 객체의 프로퍼티가 아니라 별도 렉시컬 환경에 들어가서, 밖에서
     ctx._coFolders 로 손을 못 댄다. 선언 줄을 빼고 state 처럼 ctx 프로퍼티로
     쥐여줘야 테스트마다 회사 데이터를 갈아 끼울 수 있다. */
function loadCoFoldersBlock(){
  const at = source.indexOf('function loadCoFolders');
  const end = source.indexOf('function toggleCoErpOnly', at);
  const calls = { updates: [], sets: [], toasts: [], menuHtml: '', menuOpen: false, rendered: false, pcRendered: false, anyRendered: false, closePcDetailCalls: 0 };
  const ctx = {};
  Object.assign(ctx, {
    DB_ROOT: 'pucards',
    _coFolders: {},
    _coInfo: {},
    state: { view: 'co', coFolder: '', coErpOnly: false, coTag: '', coPick: '', coSel: {} },
    Store: { mode: 'firebase', db: { ref: p => ({
      on: () => {},
      set: v => { calls.sets.push({ path: p, v }); return Promise.resolve(); },
      update: upd => { calls.updates.push({ path: p, upd }); return Promise.resolve(); }
    }) } },
    uid: () => 'uid_' + Math.random().toString(36).slice(2, 8),
    toast: msg => { calls.toasts.push(msg); },
    confirm: () => true,
    prompt: () => null,
    firebase: { auth: () => ({ currentUser: null }) },
    $: id => {
      if(id==='newCoFolderName') return ctx._nameInput || { value:'' };
      if(id==='folderDlgBg') return { classList: { add(){ calls.dlgOpen=true; }, remove(){ calls.dlgOpen=false; } } };
      if(id==='folderDlg') return { innerHTML:'' };
      if(id==='folderMenu') return { set innerHTML(v){ calls.menuHtml=v; }, get innerHTML(){ return calls.menuHtml; },
        style: { set display(v){ calls.menuOpen = (v==='block'); }, left:'', top:'' } };
      return null;
    },
    window: { innerWidth: 1200, innerHeight: 800 },
    document: { addEventListener: () => {} },
    setTimeout: f => f(),
    closeFolderMenu: () => {},
    closePcDetail: () => { calls.closePcDetailCalls++; ctx.state.coPick=''; },
    render: () => { calls.rendered = true; },
    renderPC: () => { calls.pcRendered = true; },
    renderCoAny: () => { calls.anyRendered = true; },
    localStorage: { setItem: () => {}, getItem: () => null }
  });
  const code = source.slice(at, end);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

test('deleteCoFolder 는 확인을 받은 뒤 그 폴더 회사만 folder 를 비우고 폴더도 지운다', async () => {
  const c = loadCoFoldersBlock();
  c._coFolders = { f1: { id:'f1', name:'컨설팅 신청' } };
  c._coInfo = {
    a: { folder:'f1' },
    b: { folder:'f2' },
    c: { folder:'f1' }
  };
  c.state.coFolder = 'f1';
  c.confirm = () => true;
  c.deleteCoFolder('f1');
  await Promise.resolve(); await Promise.resolve(); /* update() 뒤 .then() 이 뜨는 것을 기다린다 */

  assert.equal(c._calls.updates.length, 1, 'update 를 정확히 한 번 불러야 한다');
  const upd = c._calls.updates[0].upd;
  assert.equal(upd['coInfo/a/folder'], null);
  assert.equal(upd['coInfo/c/folder'], null);
  assert.equal(upd['coFolders/f1'], null);
  assert.equal('coInfo/b/folder' in upd, false, '다른 폴더(f2)에 있던 b 는 upd 에 끼면 안 된다');
  assert.equal(Object.keys(upd).length, 3, 'a·c 의 folder 와 coFolders/f1 말고 다른 키가 없어야 한다');
  assert.equal(c._calls.anyRendered, true, '지운 폴더를 보고 있었으면 다시 그려야 한다 — ' +
    '_coInfo/_coFolders 구독이 update() 가 로컬 반영되는 순간 먼저 불려 coFolder 를 비우기 ' +
    '전에 이미 그려질 수 있다(최종 전체 리뷰 2026-08-14). Task 6부터는 renderPC() 를 직접 ' +
    '안 부르고 renderCoAny() 하나로 PC/폰 어느 쪽인지 가려서 다시 그린다.');
  assert.equal(c._calls.pcRendered, false, 'renderPC() 를 직접 부르면 안 된다 — renderCoAny() 를 거쳐야 한다');
  assert.equal(c.state.coFolder, '', '지운 폴더를 보고 있었으면 선택을 되돌려야 한다');
});

test('deleteCoFolder 는 취소하면 아무 것도 안 지운다', () => {
  const c = loadCoFoldersBlock();
  c._coFolders = { f1: { id:'f1', name:'컨설팅 신청' } };
  c._coInfo = { a: { folder:'f1' } };
  c.confirm = () => false;
  c.deleteCoFolder('f1');
  assert.equal(c._calls.updates.length, 0, '취소했는데 write 가 나가면 안 된다');
});

test("pickCoFolder 는 폴더·거래처만·사업탭·전체가 서로 배타적이다", () => {
  const c = loadCoFoldersBlock();

  c.pickCoFolder('f:abc');
  assert.equal(c.state.coFolder, 'abc');
  assert.equal(c.state.coErpOnly, false);
  assert.equal(c.state.coTag, '');
  /* 최종 전체 리뷰 2026-08-14: 옆줄 폴더를 눌러 걸러도 열려 있던 상세 패널이 그대로
     남으면, 걸러진 목록엔 없는 회사를 계속 보여준다 — closePcDetail() 로 닫아야 한다. */
  assert.equal(c._calls.closePcDetailCalls, 1, 'closePcDetail 을 불러 패널도 닫아야 한다');

  c.pickCoFolder('erp');
  assert.equal(c.state.coErpOnly, true);
  assert.equal(c.state.coFolder, '', 'erp 를 고르면 폴더 선택은 풀려야 한다');
  assert.equal(c.state.coTag, '');

  c.pickCoFolder('t:지원사업');
  assert.equal(c.state.coTag, '지원사업');
  assert.equal(c.state.coErpOnly, false, '사업탭을 고르면 거래처만 선택은 풀려야 한다');
  assert.equal(c.state.coFolder, '');

  c.pickCoFolder('');
  assert.equal(c.state.coErpOnly, false);
  assert.equal(c.state.coFolder, '');
  assert.equal(c.state.coTag, '', '전체를 고르면 셋 다 풀려야 한다');
  assert.equal(c._calls.rendered, true);
});

test('confirmNewCoFolder 는 입력한 이름과 새로 만든 id 로 폴더를 만든다', () => {
  const c = loadCoFoldersBlock();
  c._nameInput = { value: '테스트 폴더' };
  c.confirmNewCoFolder();

  assert.equal(c._calls.sets.length, 1);
  const { path: p, v: folder } = c._calls.sets[0];
  assert.equal(folder.name, '테스트 폴더');
  assert.equal(typeof folder.id, 'string');
  assert.ok(folder.id.length > 0, 'id 가 비어 있으면 안 된다');
  assert.equal(p, 'pucards/coFolders/' + folder.id);
});

test('confirmNewCoFolder 는 이름이 비어 있으면 안 만들고 안내만 한다', () => {
  const c = loadCoFoldersBlock();
  c._nameInput = { value: '   ' };
  c.confirmNewCoFolder();
  assert.equal(c._calls.sets.length, 0, '빈 이름인데 폴더를 만들면 안 된다');
  assert.equal(c._calls.toasts.length, 1);
});

test('putCoFolder 는 클라우드 모드가 아니면 안 쓰고 안내만 한다', () => {
  const c = loadCoFoldersBlock();
  c.Store.mode = 'demo';
  c.putCoFolder({ id:'x', name:'x' });
  assert.equal(c._calls.sets.length, 0);
  assert.equal(c._calls.toasts.length, 1);
});

test('renameCoFolder 는 id 는 그대로 두고 이름만 바꿔 쓴다', () => {
  const c = loadCoFoldersBlock();
  c._coFolders = { f1: { id:'f1', name:'옛 이름', order:1, at:1, by:'a@b.com' } };
  c.prompt = () => '새 이름';
  c.renameCoFolder('f1');

  assert.equal(c._calls.sets.length, 1);
  const folder = c._calls.sets[0].v;
  assert.equal(folder.id, 'f1', 'id 가 바뀌면 안 된다');
  assert.equal(folder.name, '새 이름');
  assert.equal(folder.order, 1, '이름 말고 다른 값은 그대로 남아야 한다');
});

test('renameCoFolder 는 취소(null)하면 안 바꾼다', () => {
  const c = loadCoFoldersBlock();
  c._coFolders = { f1: { id:'f1', name:'옛 이름' } };
  c.prompt = () => null;
  c.renameCoFolder('f1');
  assert.equal(c._calls.sets.length, 0);
});

test('renameCoFolder 는 빈 이름(공백)이면 안 바꾼다', () => {
  const c = loadCoFoldersBlock();
  c._coFolders = { f1: { id:'f1', name:'옛 이름' } };
  c.prompt = () => '   ';
  c.renameCoFolder('f1');
  assert.equal(c._calls.sets.length, 0);
});

test('openCoFolderMenu 는 있는 폴더면 이름변경·삭제 메뉴를 채워 연다', () => {
  const c = loadCoFoldersBlock();
  c._coFolders = { f1: { id:'f1', name:'컨설팅 신청' } };
  c.openCoFolderMenu({ clientX:10, clientY:10 }, 'f1');
  assert.match(c._calls.menuHtml, /renameCoFolder\('f1'\)/);
  assert.match(c._calls.menuHtml, /deleteCoFolder\('f1'\)/);
  assert.equal(c._calls.menuOpen, true);
});

test('openCoFolderMenu 는 없는 폴더면 아무 것도 안 한다', () => {
  const c = loadCoFoldersBlock();
  c.openCoFolderMenu({ clientX:10, clientY:10 }, '없는id');
  assert.equal(c._calls.menuHtml, '');
  assert.equal(c._calls.menuOpen, false);
});

/* coFilteredList 의 폴더 거르기 한 줄도 실제로 돌려서 증명한다.
   type·mgr 깔때기는 cards-co-col-filter.test.js 가 이미 이 방식으로 돈다 —
   여기서는 state.coFolder 한 갈래만 본다. */
function loadFolderFilterOnly(items){
  const at = source.indexOf('function coFilteredList');
  const end = source.indexOf('\nfunction coVisible', at);
  const ctx = {
    state: { coQ:'', coErpOnly:false, coFolder:'', coTag:'', coColFilter:{} },
    coList: () => items.slice(),
    coTagsOf: () => []
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  return ctx;
}

test('coFilteredList 는 골라 둔 폴더로 거른다', () => {
  const items = [
    { name:'가', folder:'f1', erp:null, cards:[], docs:0 },
    { name:'나', folder:'f2', erp:null, cards:[], docs:0 },
    { name:'다', folder:'f1', erp:null, cards:[], docs:0 }
  ];
  const c = loadFolderFilterOnly(items);
  c.state.coFolder = 'f1';
  assert.deepEqual(c.coFilteredList(null).map(o=>o.name), ['가','다']);
  c.state.coFolder = '';
  assert.deepEqual(c.coFilteredList(null).map(o=>o.name), ['가','나','다'], '폴더를 안 골랐으면 안 걸러야 한다');
});
