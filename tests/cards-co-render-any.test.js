/* renderCoAny() — 폴더·태그를 저장한 뒤 지금 보고 있는 화면(PC 표 또는 폰 카드 목록)만
   정확히 다시 그린다. 최종 전체 리뷰(2026-08-14)가 잡았던 "가회사 이력이 나회사 칸에
   써지는" 것과 같은 종류의 사고 — "PC 화면인데 폰 함수가 돌거나, 그 반대" — 를 막는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadRenderAny(isPc){
  const at = source.indexOf('function renderCoAny');
  const end = source.indexOf('\n}', at) + 2;
  const calls = { mobile:0, pc:0 };
  const ctx = {
    state: { view:'list' },
    document: { body: { classList: { contains: c => c==='pc' && !!isPc } } },
    renderCoMobileList: () => calls.mobile++,
    renderPC: () => calls.pc++
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  return ctx;
}

test('폰에서 기업 상세를 보고 있으면 renderCoMobileList 만 부른다', () => {
  const c = loadRenderAny(false);
  c.state.view = 'co';
  c.renderCoAny();
  assert.equal(c._calls.mobile, 1);
  assert.equal(c._calls.pc, 0);
});

test('PC에서 기업 상세를 보고 있으면 renderPC 만 부른다', () => {
  const c = loadRenderAny(true);
  c.state.view = 'co';
  c.renderCoAny();
  assert.equal(c._calls.mobile, 0);
  assert.equal(c._calls.pc, 1);
});

test('기업 상세 화면이 아니면 아무 것도 안 부른다 (폰·PC 둘 다)', () => {
  [false, true].forEach(isPc=>{
    const c = loadRenderAny(isPc);
    c.state.view = 'list';
    c.renderCoAny();
    assert.equal(c._calls.mobile, 0);
    assert.equal(c._calls.pc, 0);
  });
});

test('PC/폰 판별은 render() 와 같은 방법(body.pc)을 쓴다', () => {
  const at = source.indexOf('function renderCoAny');
  const fn = source.slice(at, source.indexOf('\n}', at));
  assert.match(fn, /document\.body\.classList\.contains\('pc'\)/,
    '판별이 두 가지가 되면 한쪽만 고쳤을 때 어긋난다 — render() 와 같은 방법을 써야 한다');
});

/* 자료가 바뀌는 자리 — 옆줄의 폴더·탭 개수까지 함께 움직여야 하므로 renderCoAny() 다.
   ⚠ 고르기만 바뀌는 coToggle·coSelAll 은 여기 없다. 최종 전체 리뷰(2026-08-16) M1 이
     그 둘을 PC 회귀로 잡았다 — 체크 하나 누를 때마다 renderPC()->renderPCSide() 로
     옆줄이 통째로 다시 그려져 스크롤이 튀고 coList() 가 한 번 더 돌았다. 그 둘은 아래
     별도 목록에서 「목록만 다시 그린다」로 더 좁게 못 박는다(약화가 아니라 이동이다). */
const SITES = [
  { fn: 'pickCoTag', desc: '태그 고르기' },
  { fn: 'hideCoTag', desc: '태그 숨기기' },
  { fn: 'deleteCoFolder', desc: '폴더 삭제' },
  { fn: 'toggleCoErpOnly', desc: '거래처만 보기' },
  { fn: 'coMoveSelTo', desc: '폴더 이동' },
  { fn: 'coApplyTag', desc: '태그 담기' },
  { fn: 'coImportFolderFromType', desc: '이알피 가져오기' },
];

for (const { fn, desc } of SITES){
  test(`${fn}(${desc}) 은 renderPC 를 직접 안 부르고 renderCoAny 를 부른다`, () => {
    const at = source.indexOf(`function ${fn}(`);
    assert.ok(at > 0, `${fn} 을 찾지 못했습니다`);
    const end = source.indexOf('\nfunction ', at + 10);
    const body = source.slice(at, end);
    assert.doesNotMatch(body, /\brenderPC\(\)/, `${fn} 이 아직 renderPC() 를 직접 부릅니다`);
    assert.doesNotMatch(body, /\brenderCoPage\(\)/, `${fn} 이 아직 renderCoPage() 를 직접 부릅니다`);
    assert.match(body, /\brenderCoAny\(\)/, `${fn} 이 renderCoAny() 를 불러야 합니다`);
  });
}

/* ── M1: 고르기만 바뀌는 두 자리는 «목록만» 다시 그린다 ── */
const SEL_ONLY_SITES = [
  { fn: 'coToggle', desc: '체크 토글' },
  { fn: 'coSelAll', desc: '전체 선택' },
];
for (const { fn, desc } of SEL_ONLY_SITES){
  test(`★ ${fn}(${desc}) 은 옆줄까지 다시 그리지 않는다 — renderCoListOnly 만 부른다`, () => {
    const at = source.indexOf(`function ${fn}(`);
    assert.ok(at > 0, `${fn} 을 찾지 못했습니다`);
    const end = source.indexOf('\n}', at) + 2;
    const body = source.slice(at, end);
    assert.doesNotMatch(body, /\brenderPC\(\)/, `${fn} 이 renderPC() 를 부르면 옆줄이 통째로 다시 그려집니다`);
    assert.doesNotMatch(body, /\brenderCoAny\(\)/,
      `${fn} 은 고르기만 바꾼다 — renderCoAny() 는 PC 에서 renderPC() 로 가 옆줄까지 다시 그립니다(스크롤이 튑니다)`);
    assert.match(body, /\brenderCoListOnly\(\)/, `${fn} 이 renderCoListOnly() 를 불러야 합니다`);
  });
}

/* renderCoListOnly 자체를 실제로 돌려 본다 — PC 면 표(renderCoPage)만, 폰이면 카드
   목록(renderCoMobileList)만. 소스 정규식만으로는 «옆줄을 안 그린다» 를 증명 못 한다. */
function loadListOnly(isPc){
  const at = source.indexOf('function renderCoListOnly');
  const end = source.indexOf('\n}', at) + 2;
  assert.ok(at > 0 && end > at + 2, 'renderCoListOnly 를 찾지 못했습니다');
  const calls = { mobile:0, coPage:0, pc:0 };
  const ctx = {
    state: { view:'co' },
    document: { body: { classList: { contains: c => c==='pc' && !!isPc } } },
    renderCoMobileList: () => calls.mobile++,
    renderCoPage: () => calls.coPage++,
    renderPC: () => calls.pc++
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  return ctx;
}

test('★ renderCoListOnly — PC 면 renderCoPage 만 부르고 renderPC(옆줄)는 안 부른다', () => {
  const c = loadListOnly(true);
  c.renderCoListOnly();
  assert.equal(c._calls.coPage, 1);
  assert.equal(c._calls.pc, 0, 'renderPC 를 부르면 옆줄이 통째로 다시 그려집니다');
  assert.equal(c._calls.mobile, 0);
});

test('★ renderCoListOnly — 폰이면 renderCoMobileList 만 부른다', () => {
  const c = loadListOnly(false);
  c.renderCoListOnly();
  assert.equal(c._calls.mobile, 1);
  assert.equal(c._calls.coPage, 0);
  assert.equal(c._calls.pc, 0);
});

test('renderCoListOnly — 기업 상세 화면이 아니면 아무 것도 안 부른다', () => {
  [false, true].forEach(isPc=>{
    const c = loadListOnly(isPc);
    c.state.view = 'list';
    c.renderCoListOnly();
    assert.equal(c._calls.mobile, 0);
    assert.equal(c._calls.coPage, 0);
    assert.equal(c._calls.pc, 0);
  });
});

test('_coInfo/_coTagHidden/_coFolders 구독 콜백도 renderCoAny 를 쓴다', () => {
  /* 2026-08-16: 실시간으로 들어오는 자리는 renderCoSoon() 을 쓴다 — 몰아친 것을 한
     프레임에 한 번으로 묶기 위해서다. 묶어 주는 그 함수가 부르는 것은 renderCoAny()
     하나이므로 「PC냐 폰이냐를 한 곳에서만 판별한다」는 이 검사의 뜻은 그대로다. */
  ['coInfo','coTagHidden','coFolders'].forEach(k=>{
    const at = source.indexOf(`DB_ROOT+'/${k}'`);
    assert.ok(at > 0, `${k} 구독을 찾지 못했습니다`);
    const end = source.indexOf('\n', at);
    const line = source.slice(at, end);
    assert.match(line, /renderCoSoon\(\)/, `${k} 구독 콜백이 renderCoSoon() 을 불러야 합니다`);
    assert.doesNotMatch(line, /renderPC\(\)|renderCoPage\(\)|renderCoMobileList\(\)/,
      `${k} 구독 콜백이 화면을 직접 골라 그리면 안 됩니다`);
  });
  /* 묶어 주는 함수는 renderCoAny() 하나만 부른다 */
  const at = source.indexOf('const renderCoSoon');
  assert.ok(at > 0, 'renderCoSoon 을 찾지 못했습니다');
  assert.match(source.slice(at, at + 200), /renderCoAny\(\)/);
});
