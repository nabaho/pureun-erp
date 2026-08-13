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
  const calls = { updates: [], rendered: false, pcRendered: false };
  const ctx = {
    _coTagHidden: {},
    _coTagHiddenOn: false,
    state: { view:'co', coShowHidden:false },
    Store: { mode:'firebase', db: { ref: p => ({
      on: () => {},
      update: upd => { calls.updates.push({ path:p, upd }); }
    }) } },
    DB_ROOT: 'pucards',
    renderPC: () => { calls.pcRendered = true; }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

test('hideCoTag 는 그 탭을 숨김으로 표시한다 — 배정을 지우지 않는다', () => {
  const c = loadTagHideBlock();
  c.hideCoTag('2026 통합기술보호지원반');
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
   이 조각은 tags·_coTagHidden·state.coShowHidden 만 갖고 shown/hiddenN 을 계산하는
   순수 로직이라 작게 잘라내기 쉽다. */
function computeShownTags(tags, coTagHidden, showHidden){
  const ctx = { tags, _coTagHidden: coTagHidden, state: { coShowHidden: showHidden } };
  vm.createContext(ctx);
  vm.runInContext(`
    var shown = tags.filter(x=>state.coShowHidden || !_coTagHidden[x.t]);
    var hiddenN = tags.filter(x=>_coTagHidden[x.t]).length;
  `, ctx);
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
  const fn = source.slice(at, at + 1900);
  assert.match(fn, /hideCoTag/);
  assert.match(fn, /unhideCoTag/);
  assert.match(fn, /state\.coShowHidden/);
});
