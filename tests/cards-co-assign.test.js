/* 목록에서 회사를 골라 폴더로 옮기거나 탭에 담는다 — 이미 있는 명함 폴더 이동
   그림(#folderDlg, .movefolder)을 그대로 쓴다. 탭은 손으로 새 이름을 적으면
   그 자리에서 새로 생긴다 — 사진첩이 자동으로 만드는 것과 같은 자리(tags)를 쓴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* coCleanTagName 은 순수 함수라 실제로 돌려서 증명한다 */
function loadCoCleanTagName(){
  const at = source.indexOf('function coCleanTagName');
  assert.ok(at > 0, 'coCleanTagName 을 찾지 못했습니다');
  const end = source.indexOf('\n}', at) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  return ctx.coCleanTagName;
}

test('탭 이름에서 실시간DB 가 못 쓰는 글자를 뺀다', () => {
  const fn = loadCoCleanTagName();
  assert.equal(fn('2026. 기술/경영 [혁신] #지원'), '2026 기술 경영 혁신 지원');
});

test('앞뒤 공백을 지운다', () => {
  const fn = loadCoCleanTagName();
  assert.equal(fn('  2026 통합기술보호지원반  '), '2026 통합기술보호지원반');
});

test('빈 이름은 빈 문자열', () => {
  const fn = loadCoCleanTagName();
  assert.equal(fn('   '), '');
  assert.equal(fn(undefined), '');
});

/* 실제 Firebase 쓰기까지 실행해 본다 — coMoveSelTo·coApplyTag 가 만드는
   update 꾸러미가 정확한지는 실제로 돌려야 증명된다(js/pu-doc-file.js 검사와 같은 방식).
   ⚠ _norm 도 실제 소스에서 그대로 잘라온다 — coMoveSelTo 가 옛 이름 열쇠를 계산할 때
     쓰는 것과 검사가 기대하는 계산이 다른 데서 나오면, 화면 코드가 바뀌어도 검사는
     자기 사본만 보고 계속 통과하는 예전 실수(tests/cards-co-tag-hide.test.js 의
     computeShownTags 사고)를 반복한다. */
function loadAssignBlock(){
  const normAt = source.indexOf('const _norm = s =>');
  assert.ok(normAt > 0, '_norm 정의를 찾지 못했습니다');
  const normEnd = source.indexOf('\n', normAt);
  const cleanAt = source.indexOf('function coCleanTagName');
  const cleanEnd = source.indexOf('\n}', cleanAt) + 2;
  const at = source.indexOf('function coMoveToFolder');
  assert.ok(at > 0, 'coMoveToFolder 를 찾지 못했습니다');
  const end = source.indexOf('\nfunction ', source.indexOf('function coApplyTag', at) + 10);
  const code = source.slice(normAt, normEnd) + '\n' + source.slice(cleanAt, cleanEnd) + '\n' + source.slice(at, end);

  const writes = [];
  /* Task 6 — coMoveSelTo/coApplyTag 는 이제 renderPC()/renderCoPage() 를 직접 안 부르고
     renderCoAny() 하나만 거친다(PC/폰 어느 쪽을 보고 있어도 맞게 다시 그리려고). renderPC·
     renderCoPage 스텁은 "직접 불리면 안 된다"는 것을 잡아내려고 그대로 남겨 둔다. */
  const calls = { rendered: 0, pcRendered: 0, anyRendered: 0 };
  const ctx = {
    state: { view:'co', coSel: {} },
    _coFolders: {},
    coList: () => [],   /* 검사마다 필요하면 ctx.coList 를 다시 준다 */
    esc: s => String(s),
    toast: () => {},
    confirm: () => true,
    $: id => ({ innerHTML:'', value:'', classList:{ add(){}, remove(){} } }),
    folderDlgBg: { classList: { add(){}, remove(){} } },
    Store: { db: { ref: p => ({ update: v => { writes.push({ path:p, val:v }); return Promise.resolve(); } }) } },
    DB_ROOT: 'pucards',
    renderCoPage: () => { calls.rendered++; },
    renderPC: () => { calls.pcRendered++; },
    renderCoAny: () => { calls.anyRendered++; }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._writes = writes;
  ctx._calls = calls;
  return ctx;
}

test('고른 회사를 폴더로 옮기면 그 회사들의 folder 값만 바뀐다', async () => {
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1, 'b':1 };
  c._coFolders = { f1:{id:'f1',name:'컨설팅 신청'} };
  await c.coMoveSelTo('f1');
  const w = c._writes[0];
  assert.equal(w.val['coInfo/a/folder'], 'f1');
  assert.equal(w.val['coInfo/b/folder'], 'f1');
  assert.equal(Object.keys(w.val).length, 2, '고르지 않은 회사까지 건드리면 안 된다');
});

test('폴더 없음으로 옮기면 folder 를 비운다', async () => {
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1 };
  await c.coMoveSelTo('');
  assert.equal(c._writes[0].val['coInfo/a/folder'], null);
});

test('옮긴 뒤 고른 것을 비운다 — 다음 조작에 그대로 남으면 실수로 또 옮긴다', async () => {
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1 };
  await c.coMoveSelTo('f1');
  /* c.state.coSel 은 vm 컨텍스트 안에서 만든 객체라 원형(prototype)이 달라 deepEqual 이
     그대로는 실패한다(tests/cards-co-key-migration.test.js 와 같은 결) — JSON 을 거쳐
     원형을 지우고 견준다. */
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.coSel)), {});
});

test('탭에 담으면 고른 회사마다 그 탭 자리에 true 를 쓴다', async () => {
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1, 'b':1 };
  await c.coApplyTag('2026 통합기술보호지원반');
  const w = c._writes[0];
  assert.equal(w.val['coInfo/a/tags/2026 통합기술보호지원반'], true);
  assert.equal(w.val['coInfo/b/tags/2026 통합기술보호지원반'], true);
});

test('탭 이름을 만들면서 못 쓰는 글자를 뺀다', async () => {
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1 };
  await c.coApplyTag('2026. 기술/경영 [혁신]');
  const key = Object.keys(c._writes[0].val)[0];
  assert.equal(key, 'coInfo/a/tags/2026 기술 경영 혁신');
});

test('빈 탭 이름은 아무것도 쓰지 않는다', async () => {
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1 };
  await c.coApplyTag('   ');
  assert.equal(c._writes.length, 0);
});

test('회사를 하나도 안 고르면 아무 일도 안 한다', () => {
  const c = loadAssignBlock();
  c.state.coSel = {};
  c.coMoveToFolder();
  c.coAssignTag();
  assert.equal(c._writes.length, 0);
});

test('옮기기 전에 고른 수를 보여준다 — 모르고 몇백 곳을 옮기면 안 된다', () => {
  /* 확인창을 따로 띄우지 않는다 — 이미 있는 명함 폴더 이동(selPickGroup/moveSelTo)과
     같은 결로, 숫자가 박힌 제목 자체가 확인 화면이고 폴더를 누르는 것이 확정이다. */
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1, 'b':1, 'c':1 };
  let shown = '';
  /* value 는 안 쓰지만 innerHTML 은 값과 겉함수(getter/setter)를 한 객체에 같이
     두면 안 된다 — 자바스크립트가 어느 쪽을 따를지 애매해진다. getter/setter 만 둔다. */
  c.$ = id => ({ classList:{ add(){}, remove(){} },
    set innerHTML(v){ shown = v; }, get innerHTML(){ return shown; } });
  c.coMoveToFolder();
  assert.match(shown, /3곳을 옮길 폴더/);
});

/* 최종 전체 리뷰 2026-08-14 — 아래부터 리뷰가 찾은 것을 증명하는 검사 */

test('coMoveSelTo 는 성공하면 renderCoPage·renderPC 를 직접 안 부르고 renderCoAny 를 부른다', async () => {
  /* 옆줄 폴더 개수가 이 조작으로 바뀌므로 renderCoPage 만 부르면 옆줄 숫자가
     안 바뀐 채로 남는다(loadCoFolders 가 renderPC 를 부르는 것과 같은 이유).
     Task 6부터는 renderPC() 를 직접 부르지 않고, PC/폰 어느 쪽인지 renderCoAny() 가
     가려서 다시 그린다(tests/cards-co-render-any.test.js 가 그 분기 자체를 검사한다). */
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1 };
  await c.coMoveSelTo('f1');
  assert.equal(c._calls.anyRendered, 1);
  assert.equal(c._calls.pcRendered, 0, 'renderPC() 를 직접 부르면 안 된다 — renderCoAny() 를 거쳐야 한다');
  assert.equal(c._calls.rendered, 0);
});

test('coApplyTag 는 성공하면 renderCoPage·renderPC 를 직접 안 부르고 renderCoAny 를 부른다', async () => {
  const c = loadAssignBlock();
  c.state.coSel = { 'a':1 };
  await c.coApplyTag('2026 통합기술보호지원반');
  assert.equal(c._calls.anyRendered, 1);
  assert.equal(c._calls.pcRendered, 0, 'renderPC() 를 직접 부르면 안 된다 — renderCoAny() 를 거쳐야 한다');
  assert.equal(c._calls.rendered, 0);
});

test('coMoveSelTo 는 쓰기가 실패하면 안내만 하고 고른 것·창을 그대로 둔다', async () => {
  const c = loadAssignBlock();
  c.Store = { db: { ref: () => ({ update: () => Promise.reject(new Error('권한 없음')) }) } };
  const toasts = [];
  c.toast = msg => toasts.push(msg);
  c.state.coSel = { 'a':1 };
  await c.coMoveSelTo('f1');
  assert.match(toasts[0], /옮기기 실패/);
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.coSel)), { a:1 }, '실패했으면 고른 것을 지우면 안 된다');
  assert.equal(c._calls.pcRendered, 0, '실패했으면 다시 그리면 안 된다');
});

test('coApplyTag 는 쓰기가 실패하면 안내만 하고 고른 것을 그대로 둔다', async () => {
  const c = loadAssignBlock();
  c.Store = { db: { ref: () => ({ update: () => Promise.reject(new Error('권한 없음')) }) } };
  const toasts = [];
  c.toast = msg => toasts.push(msg);
  c.state.coSel = { 'a':1 };
  await c.coApplyTag('2026 통합기술보호지원반');
  assert.match(toasts[0], /담기 실패/);
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.coSel)), { a:1 });
});

test('coMoveSelTo 는 회사 열쇠가 사업자번호로 바뀐 뒤에도 옛 이름 열쇠의 folder 를 같이 비운다', async () => {
  /* 다라기업이 이름 열쇠(n다라기업)로 폴더에 있다가 사업자번호를 얻어 열쇠가
     3128100003 으로 바뀐 경우 — coEffectiveExtra 가 cur.folder(null) 대신
     old.folder 를 다시 끌어와 옮기기가 안 먹힌 것처럼 보이던 버그(최종 전체 리뷰
     2026-08-14). 새 열쇠만 비우면 이 버그가 되살아난다. */
  const c = loadAssignBlock();
  c.coList = () => [{ key:'3128100003', name:'다라기업' }];
  c.state.coSel = { '3128100003': 1 };
  await c.coMoveSelTo('');
  const w = c._writes[0].val;
  assert.equal(w['coInfo/3128100003/folder'], null);
  assert.equal(w['coInfo/n다라기업/folder'], null, '옛 이름 열쇠도 같이 비워야 한다');
});

test('coMoveSelTo 는 지금 열쇠가 이미 이름 열쇠면 옛 열쇠를 따로 안 만든다', async () => {
  /* ⚠ nameKey!==k 가드를 지우면 자기 자신(n다라기업)에 두 번 쓰게 되어(먼저 'f1',
     바로 뒤 null) 키 개수는 그대로 1개라 안 잡힌다 — 실제로 옮긴 값(f1)이 남았는지도
     같이 봐야 한다(최종 전체 리뷰 재검토 2026-08-14, 뮤테이션으로 확인). */
  const c = loadAssignBlock();
  c.coList = () => [{ key:'n다라기업', name:'다라기업' }];
  c.state.coSel = { 'n다라기업': 1 };
  await c.coMoveSelTo('f1');
  const w = c._writes[0].val;
  assert.equal(Object.keys(w).length, 1, '자기 자신 말고 옛 열쇠를 또 만들면 안 된다');
  assert.equal(w['coInfo/n다라기업/folder'], 'f1', '자기 자신에 옛 열쇠 지우기를 덧써서 null 로 되돌리면 안 된다');
});

test('화면: 선택 도구줄이 목록 위에 있다', () => {
  const at = source.indexOf('function coListHtml');
  const fn = source.slice(at, source.indexOf('function coDocsHtml', at));
  assert.match(fn, /class="coselbar"/);
  assert.match(fn, /onclick="coMoveToFolder\(\)"/);
  assert.match(fn, /onclick="coAssignTag\(\)"/);
});
