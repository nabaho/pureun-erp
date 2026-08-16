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

const SITES = [
  { fn: 'pickCoTag', desc: '태그 고르기' },
  { fn: 'hideCoTag', desc: '태그 숨기기' },
  { fn: 'deleteCoFolder', desc: '폴더 삭제' },
  { fn: 'toggleCoErpOnly', desc: '거래처만 보기' },
  { fn: 'coToggle', desc: '체크 토글' },
  { fn: 'coMoveSelTo', desc: '폴더 이동' },
  { fn: 'coApplyTag', desc: '태그 담기' },
  { fn: 'coSelAll', desc: '전체 선택' },
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
