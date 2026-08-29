/* 출금 카테고리·카드 칸·거르기 (대표 지시 2026-08-29)
 *
 * 대표: 「카테고리를 좀더 다양화 할 수 없을까?」
 *       「필터링 기능」
 *       「카드 적요아래 하나카드승인문자와 번호는 별도로 카드 항목에 모두 넣고,
 *         2줄 아래 하나카드 등은 삭제하고 그 내용을 카드로 옮기라는 것이다」
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ── ① 카테고리는 «설정과 한 목록» ── */
test('★★ 거래내역이 손으로 적은 목록을 «안 쓴다»', () => {
  const src = bare(ERP);
  assert.ok(/var EXP_CATS = \(function\(\)\{/.test(src),
    '★ 카테고리를 손으로 적어 두면 설정에서 늘려도 거래내역에서는 못 고른다');
  assert.ok(src.indexOf("getExpenseCats === 'function'") >= 0,
    '★★ 설정의 목록(getExpenseCats)을 안 쓴다 — 길이 둘이면 한쪽만 늘어난다');
  /* 옛 열세 줄짜리 손목록이 되살아나면 잡는다 */
  assert.ok(!/var EXP_CATS = \[\s*\{code:'exp-rent'/.test(src),
    '★ 손으로 적은 목록이 되살아났다');
});

test('★★ 못 읽어도 «빈 목록»이 되지 않는다', () => {
  const src = bare(ERP);
  const at = src.indexOf('var EXP_CATS = (function(){');
  const seg = src.slice(at, at + 700);
  assert.ok(/catch\(e\)\{ return EXPENSE_CAT_SEED\.slice\(\); \}/.test(seg),
    '★ 카테고리가 비면 아무것도 고를 수 없어 화면이 통째로 멈춘 것처럼 보인다');
  assert.ok(/return cs\.length \? cs : EXPENSE_CAT_SEED\.slice\(\);/.test(seg),
    '★ 설정이 빈 목록이면 고를 것이 하나도 없다');
});

test('★ 숨김 표가 달린 카테고리는 «안 보인다»', () => {
  const src = bare(ERP);
  assert.ok(/c\.hidden !== true/.test(src), '★ 숨기라고 한 것까지 목록에 나온다');
});

test('★★ 설정 목록이 «거래내역 옛 목록보다 넓다» (다양화가 실제로 되는가)', () => {
  /* 시드를 실제로 읽어 센다 — 「썼다」는 글자만 보면 늘어났는지 알 수 없다. */
  const at = ERP.indexOf('var EXPENSE_CAT_SEED = [');
  assert.ok(at > 0, '시드 목록을 못 찾았다');
  const seg = ERP.slice(at, ERP.indexOf('\n];', at));
  const codes = (seg.match(/code:'exp-[a-z-]+'/g) || []);
  assert.ok(codes.length >= 18,
    '★ 설정 목록이 ' + codes.length + '개뿐이다 — 옛 손목록(13개)과 별 차이가 없다');
});

/* ── ② 카드 칸으로 옮기기 ── */
test('★★ 카드 줄의 «둘째 줄»을 적요 아래에 안 그린다', () => {
  const src = bare(ERP);
  assert.ok(/\(row\.src!=='card'\) && row\.note && h\('div'/.test(src),
    '★ 적요 아래에 「하나카드 승인 문자 · ****9950」이 그대로 남는다 — 가게 이름을 가린다');
});

test('★ 통장 줄의 둘째 줄은 «그대로 둔다»', () => {
  const src = bare(ERP);
  /* 통장 note 에는 계좌번호가 있고, 그것은 카드 칸에 없다 — 지우면 사라진다. */
  assert.ok(/row\.src!=='card'/.test(src),
    '★ 통장 줄까지 지우면 계좌번호가 어디에도 안 남는다');
});

test('★★ 카드 칸이 «번호와 승인/취소»를 함께 보여 준다', () => {
  const src = bare(ERP);
  assert.ok(/isC \? '취소' : '승인'/.test(src),
    '★ 승인인지 취소인지 카드 칸에서 알 수 없다 — 적요에서 지웠으니 여기 있어야 한다');
  assert.ok(/var isC = !!row\.cancel;/.test(src), '취소 표를 안 본다');
});

/* ── ③ 거르기 ── */
test('★★ 적요·카테고리로 «거를 수 있다»', () => {
  const src = bare(ERP);
  assert.ok(/if\(expQ\)\{/.test(src), '★ 적요로 못 거른다');
  assert.ok(/expCatF === '__none'/.test(src),
    "★★ 「아직 안 고른 것만」이 없다 — 98건에서 남은 것을 찾는 것이 바로 그 일이다");
});

test('★★ 세는 것은 «거르기 전»으로 센다', () => {
  const src = bare(ERP);
  const at = src.indexOf('var expCardCnt = (function(){');
  const seg = src.slice(at, at + 300);
  assert.ok(/expList\.forEach/.test(seg),
    '★ 거른 뒤에 세면 「9950 52건」이 걸러진 수로 줄어 몇 건이 남았는지 알 수 없다');
});

test('★ 거르기를 «풀 수 있다»', () => {
  const src = bare(ERP);
  assert.ok(src.indexOf('거르기 해제') >= 0,
    '★ 걸어 놓고 못 풀면, 왜 줄이 안 보이는지 모른 채 헤맨다');
});

test('★ 거르는 줄은 «머리 칸이 아니다» (th 로 세면 칸 수가 어긋난다)', () => {
  const src = bare(ERP);
  const at = src.indexOf('h(\'tr\',{style:{background:\'#f8fafc\'}},');
  assert.ok(at > 0, '거르는 줄을 못 찾았다');
  const seg = src.slice(at, at + 1800);
  assert.ok(seg.indexOf("h('th',") < 0,
    '★ 거르는 줄을 th 로 그리면 「머리 칸 수 == 더보기 colSpan」 검사가 어긋난다');
});

/* ══ 좁게·얇게 (대표 지시 2026-08-29: 「한줄로 해라」·「이거 왜 이렇게 있나」) ══ */
test('★★ 카드 칸은 «한 줄»이다 (번호와 승인이 나란히)', () => {
  const src = bare(ERP);
  const at = src.indexOf("var isC = !!row.cancel;");
  assert.ok(at > 0, '카드 칸을 못 찾았다');
  const seg = src.slice(at, at + 700);
  assert.ok(/display:'flex',alignItems:'center'/.test(seg),
    '★ 두 줄로 쌓으면 카드 칸만 줄 높이를 밀어 올려 표가 성글어 보인다');
  assert.ok(seg.indexOf("h('div',{style:{marginTop:'2px'") < 0,
    '★ 아직 아래로 내려 그린다');
});

test('★★ 거르는 줄은 «얇다» — 손잡이가 폭을 다 먹지 않는다', () => {
  const src = bare(ERP);
  const at = src.indexOf("var fTd = Object.assign({}, tdS, { padding:'2px 6px' });");
  assert.ok(at > 0, '★ 거르는 줄이 아직 굵다 — 칸 여백을 안 줄였다');
  const seg = src.slice(at, at + 1400);
  assert.ok(/width:'150px'/.test(seg),
    "★ 찾기 칸이 폭 100% 다 — 굵은 띠가 표 위에 얹힌다");
  assert.ok(!/width:'100%',fontSize:'11px'/.test(seg),
    '★ 아직 폭을 100% 로 늘린다');
  assert.ok(/colSpan:4/.test(seg),
    '★ 빈 칸 넷을 따로 그린다 — 한 칸으로 묶으면 줄이 얇아진다');
});
