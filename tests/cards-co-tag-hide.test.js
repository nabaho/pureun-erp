/* 탭은 지우지 않는다 — 숨기기만 둔다. 지우면 어느 회사가 그 사업이었는지 잃는다
   (설계서 2026-08-13, "안 하기로 한 것: 탭 지우기").
   ⚠ 이 검사는 실제로 함수를 돌려서 증명한다(대표 지시 2026-08-14) — cards-co-col-filter.test.js,
     cards-co-folders.test.js 와 같은 방식. "소스에 이런 글자가 있나"만 보는 검사는 폴더 과제
     때 부족하다는 지적을 받았다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('탭 지우기 함수가 없다 — 숨기기만 있다', () => {
  assert.doesNotMatch(source, /function deleteCoTag/, '탭을 지우는 함수를 만들면 안 된다');
  assert.match(source, /function hideCoTag/);
  assert.match(source, /function unhideCoTag/);
});

test('숨김 저장소가 있다', () => {
  assert.match(source, /let _coTagHidden = \{\}/);
  assert.match(source, /function loadCoTagHidden/);
  assert.match(source, /DB_ROOT\+'\/coTagHidden'/);
});

/* hideCoTag·unhideCoTag·toggleCoShowHidden·loadCoTagHidden 을 실제로 돌려서 증명한다.
   cards-co-folders.test.js 의 loadCoFoldersBlock 과 같은 방식 — Store.db.ref().update()
   호출을 가로채 실제 쓰기값을 본다. */
function loadTagHideBlock(){
  const at = source.indexOf('let _coTagHidden = {};');
  assert.ok(at > 0, '_coTagHidden 선언을 찾지 못했습니다');
  const end = source.indexOf('\nfunction ', source.indexOf('function toggleCoShowHidden', at) + 10);
  assert.ok(end > at, '이 블록의 끝을 찾지 못했습니다');
  /* "let _coTagHidden = {}" 선언 줄은 일부러 안 담는다 — vm 에서 top-level let 은
     컨텍스트 객체의 프로퍼티가 아니라 별도 렉시컬 환경에 들어가서, 밖에서
     ctx._coTagHidden 으로 손을 못 댄다. 선언을 빼고 state 처럼 ctx 프로퍼티로 쥐여준다. */
  const declEnd = source.indexOf('\n', at) + 1;
  const code = source.slice(declEnd, end);
  const calls = { updates: [], rendered: false, pcRendered: false, anyRendered: false };
  const ctx = {
    _coTagHidden: {},
    /* 2026-08-28: 옆줄에 「할 일」 칸이 붙었다 — 이 검사는 그 부분을 안 본다 */
    coFilterDefs: () => '',
    _coTagHiddenOn: false,
    state: { view:'co', coShowHidden:false, coTag:'' },
    Store: { mode:'firebase', db: { ref: p => ({
      on: () => {},
      update: upd => { calls.updates.push({ path:p, upd }); return Promise.resolve(); }
    }) } },
    DB_ROOT: 'pucards',
    toast: msg => { calls.toasts = calls.toasts||[]; calls.toasts.push(msg); },
    renderPC: () => { calls.pcRendered = true; },
    /* Task 6 — hideCoTag 는 renderPC() 를 직접 안 부르고 renderCoAny() 하나에 위임한다
       (PC/폰 어느 쪽인지는 renderCoAny() 가 가린다). toggleCoShowHidden 은 이 과제
       범위 밖이라 renderPC() 를 그대로 직접 부른다. */
    renderCoAny: () => { calls.anyRendered = true; }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

test('hideCoTag 는 그 탭을 숨김으로 표시한다 — 배정을 지우지 않는다', async () => {
  const c = loadTagHideBlock();
  c.hideCoTag('2026 통합기술보호지원반');
  await Promise.resolve();
  assert.equal(c._calls.updates.length, 1);
  const upd = c._calls.updates[0].upd;
  assert.equal(upd['coTagHidden/2026 통합기술보호지원반'], true);
  assert.equal(Object.keys(upd).length, 1, '다른 키를 건드리면 안 된다');
  assert.doesNotMatch(JSON.stringify(upd), /tags\//, '회사의 tags 배정 자체를 지우면 안 된다');
});

test('unhideCoTag 는 숨김 표시를 지운다', () => {
  const c = loadTagHideBlock();
  c.unhideCoTag('2026 통합기술보호지원반');
  const upd = c._calls.updates[0].upd;
  assert.equal(upd['coTagHidden/2026 통합기술보호지원반'], null);
});

/* 최종 전체 리뷰 2026-08-14: 지금 이 탭으로 걸러 보던 중에 그 탭을 숨기면, 옆줄엔
   아무 표시도 없이 목록만 계속 좁혀져 보인다 — 걸러 둔 탭도 같이 풀어야 한다. */
test('hideCoTag 는 지금 그 탭으로 거르고 있었으면 거르기를 푼다', async () => {
  const c = loadTagHideBlock();
  c.state.coTag = '2026 통합기술보호지원반';
  c.hideCoTag('2026 통합기술보호지원반');
  await Promise.resolve();
  assert.equal(c.state.coTag, '');
  assert.equal(c._calls.anyRendered, true);
  assert.equal(c._calls.pcRendered, false, 'renderPC() 를 직접 부르면 안 된다 — renderCoAny() 를 거쳐야 한다');
});

test('hideCoTag 는 다른 탭으로 거르고 있었으면 그 거르기를 안 건드린다', async () => {
  const c = loadTagHideBlock();
  c.state.coTag = '다른탭';
  c.hideCoTag('2026 통합기술보호지원반');
  await Promise.resolve();
  assert.equal(c.state.coTag, '다른탭');
});

test('hideCoTag 는 클라우드 모드가 아니면 안 쓰고 안내만 한다', () => {
  const c = loadTagHideBlock();
  c.Store.mode = 'demo';
  c.hideCoTag('2026 통합기술보호지원반');
  assert.equal(c._calls.updates.length, 0);
  assert.equal((c._calls.toasts||[]).length, 1);
});

test('toggleCoShowHidden 은 숨긴 것 보기를 뒤집고 다시 그린다', () => {
  const c = loadTagHideBlock();
  c.toggleCoShowHidden();
  assert.equal(c.state.coShowHidden, true);
  assert.equal(c._calls.pcRendered, true);
  c.toggleCoShowHidden();
  assert.equal(c.state.coShowHidden, false);
});

test('loadCoTagHidden 은 이미 켜져 있으면 다시 구독을 안 걸고 콜백만 부른다', () => {
  const c = loadTagHideBlock();
  c._coTagHiddenOn = true;
  let called = false;
  c.loadCoTagHidden(() => { called = true; });
  assert.equal(called, true);
});

test('loadCoTagHidden 은 클라우드 모드가 아니면 콜백만 부른다', () => {
  const c = loadTagHideBlock();
  c.Store.mode = 'demo';
  let called = false;
  c.loadCoTagHidden(() => { called = true; });
  assert.equal(called, true);
});

/* 옆줄 「사업별」 목록에서 숨긴 탭을 거르는 부분만 따로 잘라 실제로 돌린다.
   ⚠ 이 두 줄을 검사 파일 안에 손으로 다시 적으면 안 된다 — 화면 코드가 바뀌어도
     검사는 자기 사본만 보고 계속 통과해 회귀를 못 잡는다(실제로 한 번 이렇게 되어
     "!" 를 화면 코드에서 지워도 검사가 안 잡힌 적이 있다). 반드시 pu-cards.html 에서
     그 줄을 그대로 잘라와 돌린다. const 를 var 로만 바꾼다 — vm 최상위 const 는
     컨텍스트 프로퍼티로 안 붙어서 밖에서 못 읽는다(선언 방식만 바꾼 것, 로직은 그대로). */
function loadShownTagsCode(){
  const at = source.indexOf('const shown = tags.filter(');
  assert.ok(at > 0, 'shown 계산 줄을 찾지 못했습니다');
  const end = source.indexOf('\n', source.indexOf('const hiddenN = tags.filter(', at));
  assert.ok(end > at, 'hiddenN 계산 줄을 찾지 못했습니다');
  return source.slice(at, end).replace('const shown', 'var shown').replace('const hiddenN', 'var hiddenN');
}

function computeShownTags(tags, coTagHidden, showHidden){
  const ctx = { tags, _coTagHidden: coTagHidden, state: { coShowHidden: showHidden } };
  vm.createContext(ctx);
  vm.runInContext(loadShownTagsCode(), ctx);
  return { shown: ctx.shown, hiddenN: ctx.hiddenN };
}

test('사업별 목록은 숨긴 탭을 건너뛴다', () => {
  const tags = [{t:'가',n:1},{t:'나',n:2}];
  const r = computeShownTags(tags, {'나':true}, false);
  assert.deepEqual(r.shown.map(x=>x.t), ['가']);
  assert.equal(r.hiddenN, 1);
});

test('숨긴 것 보기를 켜면 숨긴 탭도 다시 보인다', () => {
  const tags = [{t:'가',n:1},{t:'나',n:2}];
  const r = computeShownTags(tags, {'나':true}, true);
  assert.deepEqual(r.shown.map(x=>x.t), ['가','나']);
  assert.equal(r.hiddenN, 1, '숨긴 개수는 보기를 켜도 그대로 세야 안내 문구가 맞다');
});

test('옆줄 사업별 목록에 숨기기·다시보기 아이콘이 있다', () => {
  const at = source.indexOf("if(state.view==='co'){");
  /* 예전엔 여기서 고정 글자수(4200자)만 잘라 봤다 — 옆줄에 「보기」 칸·폴더 안 탭·드래그
     속성이 붙을 때마다 덩어리가 길어져, 남은 여유가 161자까지 줄어 있었다. 같은 덫이
     cards-co-folders.test.js 에서 이미 한 번 터졌다. 이 덩어리의 진짜 끝은 글자수가
     아니라 `$('pcSide').innerHTML = h; return;` 이다 — 형제 검사들과 같은 경계를 쓴다.
     보는 «자리»만 바꾸고, 무엇을 확인하는지는 그대로 둔다. */
  /* ⚠ 끝 경계는 「옆줄을 갈아 끼우는 그 줄」이다 — 그 줄 «뒤»에 무엇이 더 붙는지는
   이 검사가 볼 일이 아니다. 예전에는 `= h; return;` 까지 글자 그대로 붙들어,
   2026-08-29 에 그 줄 뒤로 구르던 자리 되꽂기(pcSideRestoreTop)가 붙자 형제 검사
   다섯이 «기능이 멀쩡한데» 한꺼번에 깨졌다(CLAUDE.md 「지금 값이 아니라 규칙」). */
  const end = source.indexOf("$('pcSide').innerHTML", at);
  assert.ok(at > 0 && end > at, '기업 상세 옆줄 덩어리를 찾지 못했습니다');
  const fn = source.slice(at, end);
  assert.match(fn, /hideCoTag/);
  assert.match(fn, /unhideCoTag/);
  assert.match(fn, /state\.coShowHidden/);
});
