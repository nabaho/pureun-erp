/* 폰에서 기업 상세 폴더/태그를 고르는 바텀시트 — 명함 탭의 그룹 선택(openGroupSheet)과
   같은 모양(.mhead/.sheetbtn)으로 맞춘다. 고른 뒤에는 기존 pickCoFolder(k) 를 그대로 부른다
   — 여기서 화면을 다시 그리는 로직을 새로 안 만든다(대표 승인 설계 4번). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('groupBtn 은 이제 openTopSheet 을 부른다', () => {
  const at = source.indexOf('id="groupBtn"');
  const end = source.indexOf('\n', at);
  assert.match(source.slice(at, end), /onclick="openTopSheet\(\)"/);
});

/* ⚠ 자르는 끝을 renderSubbar 바로 앞으로 잡는다. renderList 까지 넓게 자르면 그 사이의
   진짜 openGroupSheet 정의가 함께 딸려 들어와, 아래에서 쥐여준 openGroupSheet 스텁을
   덮어써 버린다(그러면 state.items·canSeeGroup 을 찾다 ReferenceError 가 난다).
   그래서 openTopSheet·openCoFolderSheet 두 함수는 반드시 renderSubbar 바로 앞에
   나란히 둔다 — Step 5 가 그 자리에 넣는다. */
function loadBlock(){
  const at = source.indexOf('function openTopSheet');
  const end = source.indexOf('\nfunction renderSubbar', at);
  assert.ok(at > 0 && end > at, 'openTopSheet~renderSubbar 사이를 찾지 못했습니다');
  const calls = { html:'', opened:false, groupSheetCalled:false };
  const ctx = {
    esc: s => String(s ?? ''),
    state: { view:'list', coFolder:'', coTag:'', coErpOnly:false },
    _coFolders: {},
    coList: () => [],
    coTagList: () => [],
    openGroupSheet: () => { calls.groupSheetCalled = true; },
    openCoFolderDialog: () => { calls.dialogOpened = true; },
    $: id => {
      if(id==='groupSheetM' || id==='folderSheetM') return { set innerHTML(v){ calls.html=v; }, get innerHTML(){ return calls.html; } };
      if(id==='groupSheetBg' || id==='folderSheetBg') return { classList: { add(){ calls.opened=true; }, remove(){ calls.opened=false; } } };
      return null;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  return ctx;
}

test('명함·사업자 화면이면 openTopSheet 이 기존 openGroupSheet 을 그대로 부른다', () => {
  const c = loadBlock();
  c.state.view = 'list';
  c.openTopSheet();
  assert.ok(c._calls.groupSheetCalled, '명함 화면에서는 기존 그룹 시트를 그대로 써야 합니다');
});

test('기업 상세 화면이면 openCoFolderSheet 이 전체·거래처만·폴더·태그를 나열한다', () => {
  const c = loadBlock();
  c.state.view = 'co';
  c._coFolders = { f1:{ id:'f1', name:'현장클리닉' } };
  c.coList = () => [{ key:'k1' }];
  c.coTagList = () => [{ t:'일터상생혁신', n:2 }];
  c.openTopSheet();
  assert.match(c._calls.html, /전체/);
  assert.match(c._calls.html, /거래처만/);
  assert.match(c._calls.html, /현장클리닉/);
  assert.match(c._calls.html, /일터상생혁신/);
  assert.ok(c._calls.opened);
});

test('폴더를 고르면 pickCoFolder(\'f:id\') 를 부르는 onclick 이 있다', () => {
  const c = loadBlock();
  c.state.view = 'co';
  c._coFolders = { f1:{ id:'f1', name:'현장클리닉' } };
  c.openCoFolderSheet();
  assert.match(c._calls.html, /onclick="[^"]*pickCoFolder\('f:f1'\)/);
});

test('시트 안에 새 폴더 만들기·이알피 가져오기로 가는 길이 있다', () => {
  const c = loadBlock();
  c.openCoFolderSheet();
  assert.match(c._calls.html, /openCoFolderDialog\(\)/);
});

/* ── 폴더·태그 이름에 작은따옴표가 있어도 onclick 인자가 깨지지 않는다 ──
   coTagList()·_coFolders 는 사람이 손으로 지은 이름을 그대로 담고 있어(예: "Papa John's"),
   이스케이프 없이 onclick="...pickCoFolder('t:이름')" 에 그대로 박으면 어트리뷰트 파싱
   중간에 인자가 조기 종료된다(cards-co-mobile-list.test.js 의 같은 함정, 대비 처방은
   esc() 앞에서 먼저 \\' 로 이스케이프하는 것 — pu-cards.html ~7792·~10083 과 같은 결). */
test('폴더 이름에 작은따옴표가 있어도 onclick 인자가 깨지지 않는다', () => {
  const c = loadBlock();
  c.state.view = 'co';
  c._coFolders = { f1:{ id:'f1', name:"Papa John's" } };
  c.openCoFolderSheet();
  assert.match(c._calls.html, /onclick="[^"]*pickCoFolder\('f:f1'\)/);
});

test('태그 이름에 작은따옴표가 있어도 onclick 인자가 깨지지 않는다', () => {
  const c = loadBlock();
  c.state.view = 'co';
  c.coList = () => [{ key:'k1' }];
  c.coTagList = () => [{ t:"Papa John's", n:1 }];
  c.openCoFolderSheet();
  assert.match(c._calls.html, /onclick="[^"]*pickCoFolder\('t:Papa John\\'s'\)/);
  assert.doesNotMatch(c._calls.html, /onclick="[^"]*pickCoFolder\('t:Papa John's'\)/);
});
