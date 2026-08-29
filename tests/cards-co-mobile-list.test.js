/* 폰 기업 상세 카드 목록 — 명함 목록(renderList)과 같은 .row/.rowmain 결로 그린다.
   ⚠ PC 표(coListHtml)는 안 건드린다 — 이 함수는 완전히 새 것이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadBlock(list){
  const at = source.indexOf('function renderCoMobileList');
  /* ⚠ renderCoMobileList 바로 뒤는 렌더 분기·IIFE·</script><script> 경계를 지나야
     다음 function 선언(newSalt)이 나온다 — '\nfunction ' 로 다음 함수를 찾으면
     그 사이의 HTML까지 통째로 삼켜 vm이 깨진다. cards-co-mobile-tab.test.js 가
     쓰는 대로 이 함수 자신의 닫는 중괄호(줄 맨 앞 '}')에서 바로 끊는다. */
  const end = source.indexOf('\n}', at) + 2;
  assert.ok(at > 0 && end > at + 2, 'renderCoMobileList 를 찾지 못했습니다');
  const calls = { html:'', groupBtnHtml:'' };
  const ctx = {
    esc: s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    state: { coSel:{}, selMode:false, coTag:'', coFolder:'' },
    _coFolders: {},
    /* 나눠 보기(2026-08-15) — 폰 목록도 «잘린 쪽»을 그린다. 여기서는 한 쪽에 다 담는다 */
    coPage: () => { const l = list; return { rows:l, total:l.length, page:0, pages:1,
                    size:200, from:l.length?1:0, to:l.length }; },
    coPagerHtml: () => '',
    coVisible: () => list,
    coTagsOf: o => Object.keys(o.tags||{}),
    /* 2026-08-29 — 폰 목록도 「목록의 모양이 바뀌었나」를 보고 맨 위로 올려 준다.
       여기서는 그리는 내용만 보므로 대역으로 둔다(자리 옮기기 자체는
       cards-co-scroll-keep.test.js 가 따로 지킨다). */
    coListShapeKey: () => 'shape',
    _coScrollShape: '',
    window: { scrollTo: () => { calls.top = true; } },
    $: id => {
      if(id==='list') return { set innerHTML(v){ calls.html=v; }, get innerHTML(){ return calls.html; } };
      if(id==='groupBtn') return { set innerHTML(v){ calls.groupBtnHtml=v; }, get innerHTML(){ return calls.groupBtnHtml; } };
      if(id==='listwrap') return { scrollTop: 0 };
      return null;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  return ctx;
}

test('회사가 없으면 안내문구를 보여준다', () => {
  const c = loadBlock([]);
  c.renderCoMobileList();
  assert.match(c._calls.html, /찾지 못했습니다|없습니다/);
});

test('회사마다 상호·유형·사업자번호·담당을 카드로 그린다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'312-81-49225', erp:{ type:'자문', main:'김보람' }, folder:'', cards:[], docs:0, tags:{} }]);
  c.renderCoMobileList();
  assert.match(c._calls.html, /class="row"/);
  assert.match(c._calls.html, /대명크라샤/);
  assert.match(c._calls.html, /자문/);
  assert.match(c._calls.html, /312-81-49225/);
  assert.match(c._calls.html, /김보람/);
});

test('폴더에 든 회사는 카드에 폴더 이름이 보인다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'f1', cards:[], docs:0, tags:{} }]);
  c._coFolders = { f1:{ id:'f1', name:'현장클리닉' } };
  c.renderCoMobileList();
  assert.match(c._calls.html, /현장클리닉/);
});

test('카드를 누르면 pickCo(key) 를 부른다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.renderCoMobileList();
  assert.match(c._calls.html, /onclick="pickCo\('k1'\)"/);
});

test('선택 모드일 때는 체크 표시를 그리고, 누르면 coToggle 을 부른다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.state.selMode = true;
  c.renderCoMobileList();
  assert.match(c._calls.html, /onclick="coToggle\('k1'\)"/);
  assert.doesNotMatch(c._calls.html, /onclick="pickCo\('k1'\)"/, '선택 모드에서 누르면 상세가 아니라 선택이 되어야 합니다');
});

test('선택된 회사는 체크 표시가 켜진다', () => {
  const c = loadBlock([
    { key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} },
    { key:'k2', name:'미래산업', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }
  ]);
  c.state.selMode = true; c.state.coSel = { k1:1 };
  c.renderCoMobileList();
  /* 체크 표시가 '어딘가에' 있는지가 아니라, 선택된 k1(대명크라샤) 카드 자신에 붙었는지를
     확인한다 — 다른 회사(k2, 미래산업) 카드에 잘못 켜져도 통과해버리는 약한 검증을 막는다. */
  assert.match(c._calls.html, /<div class="selmark">✅<\/div>\s*<div class="rowmain"><div class="nm">대명크라샤<\/div>/,
    '선택된 k1 카드에 체크 표시(✅)가 붙어야 합니다');
  assert.match(c._calls.html, /<div class="selmark">⚪<\/div>\s*<div class="rowmain"><div class="nm">미래산업<\/div>/,
    '선택되지 않은 k2 카드는 빈 동그라미(⚪)여야 합니다');
});

test('회사 키에 작은따옴표가 있어도 onclick 인자가 깨지지 않는다 (pickCo·coToggle 모두)', () => {
  /* coKeyOf() 는 사업자번호가 없으면 'n'+_norm(name) 으로 대체 키를 만드는데, _norm 은
     작은따옴표를 걸러내지 않는다(예: Papa John's). esc() 는 ' 를 &#39; 로 바꾸지만
     그건 HTML 엔티티일 뿐 — onclick 어트리뷰트를 브라우저가 파싱할 때 그 엔티티가 다시
     ' 로 풀리고 나서야 JS 로 넘어가므로, \\' 로 먼저 이스케이프해두지 않으면 인자가
     조기 종료되어 탭해도 아무 일도 안 일어난다(무음 실패). */
  const list = [{ key:"nPapaJohn's", name:'파파존스', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }];

  const c1 = loadBlock(list);
  c1.renderCoMobileList();
  assert.match(c1._calls.html, /onclick="pickCo\('nPapaJohn\\&#39;s'\)"/,
    '작은따옴표가 백슬래시로 이스케이프된 채 pickCo 인자에 들어가야 합니다');
  assert.doesNotMatch(c1._calls.html, /onclick="pickCo\('nPapaJohn&#39;s'\)"/,
    '백슬래시 없이 그대로면 어트리뷰트 파싱 중 인자가 조기 종료됩니다');

  const c2 = loadBlock(list);
  c2.state.selMode = true;
  c2.renderCoMobileList();
  assert.match(c2._calls.html, /onclick="coToggle\('nPapaJohn\\&#39;s'\)"/,
    '작은따옴표가 백슬래시로 이스케이프된 채 coToggle 인자에 들어가야 합니다');
  assert.doesNotMatch(c2._calls.html, /onclick="coToggle\('nPapaJohn&#39;s'\)"/,
    '백슬래시 없이 그대로면 어트리뷰트 파싱 중 인자가 조기 종료됩니다');
});

/* render() 는 기업 상세 화면(state.view==='co')에서 renderSubbar() 를 건너뛰므로,
   옆줄의 groupBtn 라벨은 renderCoMobileList() 자신이 다시 써 줘야 한다 — 안 그러면
   명함 탭의 마지막 값(예: "전체 (6,271)")이 기업 상세 화면에서도 그대로 굳어 붙는다. */
test('groupBtn — 아무것도 안 골랐으면 "전체"와 지금 목록 개수를 보여준다', () => {
  const list = [
    { key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} },
    { key:'k2', name:'미래산업', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }
  ];
  const c = loadBlock(list);
  c.renderCoMobileList();
  assert.match(c._calls.groupBtnHtml, /^전체 \(2\)/);
});

/* 「거래처만」 이름표 검사는 지웠다 — 그 거르개 자체가 대표 지시 2026-08-17 로
   없어졌다("거래처만 삭제해라. 내가 새로 폴더 만들어서 관리하겠다").
   대신 옛 상태를 억지로 켜도 이름표가 그것을 따라가지 않는지를 본다. */
test('groupBtn — 없앤 「거래처만」 상태를 억지로 켜도 이름표가 안 바뀐다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.state.coErpOnly = true;                 /* 옛 기기에 남아 있을 수 있는 찌꺼기 */
  c.renderCoMobileList();
  assert.match(c._calls.groupBtnHtml, /^전체 \(1\)/, '없앤 거르개가 이름표에 되살아났다');
});

test('groupBtn — 태그를 골랐으면 그 태그 이름을 보여준다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.state.coTag = '일터상생혁신';
  c.renderCoMobileList();
  assert.match(c._calls.groupBtnHtml, /^일터상생혁신 \(1\)/);
});

test('groupBtn — 폴더를 골랐으면 그 폴더 이름을 보여준다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'f1', cards:[], docs:0, tags:{} }]);
  c._coFolders = { f1:{ id:'f1', name:'현장클리닉' } };
  c.state.coFolder = 'f1';
  c.renderCoMobileList();
  assert.match(c._calls.groupBtnHtml, /^현장클리닉 \(1\)/);
});
