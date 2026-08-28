/* 고유번호증 (대표 지시 2026-08-26)
   "고유번호증이 기업정보함에 입력이 안된다. 이부분 왜그런지 확인해달라.
    사업자등록증 고유번호증 모두 같은것이다.
    단 기업정보함에 고유번호증을 필터링 가능하게 해달라."

   ★ 「입력이 안된다」의 까닭 — 판독 지시문에 «고유번호증»이라는 말이 없었다.
     고유번호증은 제목도 다르고(사업자등록증이라는 낱말이 문서에 없다) 칸 이름도 다르다
     (상호→단체명, 사업자등록번호→고유번호). 그래서 판독기가 form(서식)으로 볼 여지가
     컸고, form 으로 떨어지면 사업자 목록에 아예 안 들어간다. 어떤 건 들어가고 어떤 건
     안 들어가는 상태였다.
   ★ 「같은 것」 — 갈래(kind=bizreg)도 열쇠(사업자번호)도 같이 쓴다. 새 갈래를 만들면
     같은 회사가 두 줄로 갈라진다. 가르는 것은 «서류이름» 하나뿐이다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');
const READ = fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-read.js'), 'utf8');

function slice(src, fromMark, toMark) {
  const a = src.indexOf(fromMark);
  const b = src.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return src.slice(a, b);
}
function load() {
  const ctx = { console, Object, Array, String, Number };
  vm.createContext(ctx);
  new vm.Script(slice(HTML, 'const UID_DOC_RE', 'function coFilteredList(')).runInContext(ctx);
  return ctx;
}

/* ── 판독기가 고유번호증을 알아본다 ── */

test('판독 지시문이 「고유번호증도 bizreg」라고 못 박는다', () => {
  assert.match(READ, /「고유번호증」/, '이 말이 없어서 form 으로 떨어졌다');
  assert.match(READ, /kind=bizreg 입니다/);
  const at = READ.indexOf('「고유번호증」');
  const near = READ.slice(at, at + 600);
  assert.match(near, /「고유번호」→bizno/, '번호를 사업자번호 자리에 담아야 회사 열쇠가 맞는다');
  assert.match(near, /「단체명」→company/, '상호 자리에 단체명을 담아야 회사 이름이 생긴다');
  assert.match(near, /「대표자 성명」→ceo/);
  assert.match(near, /「법인등록번호」→corpno/);
});

test('제목을 그대로 담으라고 한다 — 나중에 이것으로 골라 본다', () => {
  const at = READ.indexOf('「고유번호증」');
  assert.match(READ.slice(at, at + 700), /docName 에는 문서 제목 그대로/);
});

test('새 갈래를 만들지 않는다 — 사업자등록증과 같은 자리에 쌓인다', () => {
  /* 새 kind 를 만들면 같은 회사가 두 줄로 갈라지고 업체관리 연동도 끊긴다 */
  assert.match(READ, /var KINDS = \{[^}]*bizreg: 1/);
  assert.ok(!/uid:\s*1|corpid:\s*1/.test(READ), '고유번호증용 새 갈래를 만들면 안 된다');
  assert.match(READ, /var CARDS_KIND = \{ card: 'card', bizreg: 'biz' \};/,
    '기업정보함 갈래도 그대로여야 한다');
});

test('서류이름을 «항목»에도 담는다 — 없으면 한 장 단위로 가릴 수 없다', () => {
  const cards = slice(READ, 'bizreg: { company: \'company\'', '    erp: {');
  assert.match(cards, /docName: 'docName'/, '항목에 서류이름이 없으면 목록에서 가려낼 수 없다');
});

/* ── 「고유번호증인가」 판정 ── */

test('서류이름으로 알아본다 — 띄어쓰기가 있어도', () => {
  const { isUidDocName } = load();
  assert.strictEqual(isUidDocName('고유번호증'), true);
  assert.strictEqual(isUidDocName('고유 번호증'), true);
  assert.strictEqual(isUidDocName('고유번호증 (재발급)'), true);
});

test('사업자등록증은 아니다', () => {
  const { isUidDocName } = load();
  assert.strictEqual(isUidDocName('사업자등록증'), false);
  assert.strictEqual(isUidDocName('사업자등록증명원'), false);
  assert.strictEqual(isUidDocName(''), false);
  assert.strictEqual(isUidDocName(null), false);
  assert.strictEqual(isUidDocName(undefined), false);
});

test('붙어 있는 등록증 한 장으로 알아본다', () => {
  const { coIsUid } = load();
  assert.strictEqual(coIsUid({ bizs: [{ docName: '고유번호증' }] }), true);
  assert.strictEqual(coIsUid({ bizs: [{ docName: '사업자등록증' }] }), false);
});

test('여러 장 중 하나만 고유번호증이어도 잡는다', () => {
  const { coIsUid } = load();
  assert.strictEqual(coIsUid({ bizs: [{ docName: '사업자등록증' }, { docName: '고유번호증' }] }), true);
});

test('옛 자료도 건진다 — 항목에 서류이름이 없던 시절 것', () => {
  /* ⚠ 한 자리만 보면 옛 것이 통째로 빠진다. 갈래(tags)와 coInfo 의 서류이름도 본다. */
  const { coIsUid } = load();
  assert.strictEqual(coIsUid({ bizs: [], extra: { tags: { '고유번호증': true } } }), true,
    '서식이 만든 갈래로 건져야 한다');
  assert.strictEqual(coIsUid({ bizs: [], extra: { docName: '고유번호증' } }), true,
    'coInfo 에 적힌 서류이름으로 건져야 한다');
});

test('아무것도 없으면 아니다 — 없는 것을 그렇다고 하지 않는다', () => {
  const { coIsUid } = load();
  assert.strictEqual(coIsUid({}), false);
  assert.strictEqual(coIsUid({ bizs: [], extra: { tags: {} } }), false);
  assert.strictEqual(coIsUid(null), false);
  assert.strictEqual(coIsUid({ bizs: [null, {}], extra: {} }), false);
});

test('다른 갈래가 섞여 있어도 고유번호증만 짚는다', () => {
  const { coIsUid } = load();
  assert.strictEqual(coIsUid({ bizs: [], extra: { tags: { '사업자등록증': true, '신청기업 정보': true } } }), false);
  assert.strictEqual(coIsUid({ bizs: [], extra: { tags: { '사업자등록증': true, '고유번호증': true } } }), true);
});

/* ── 기업 상세에서 골라 본다 ── */

test('기업 상세 거르기에 걸려 있다', () => {
  /* ⚠ 2026-08-27: 서명에 두 번째 인자(skipCares)가 붙었다 — 여는 괄호까지만 잡는다.
     서명을 통째로 못 박으면 인자 하나 늘 때마다 상관없는 검사가 깨진다. */
  const body = slice(HTML, 'function coFilteredList(skipCol', '/* 「🏢 거래처」·「🏢 전체」');
  assert.match(body, /if\(state\.coOnlyUid\) list = list\.filter\(coIsUid\);/);
});

/* ⚠ 2026-08-28 자리가 옮겨졌다 — 대표 지시로 탭 줄은 「거래관계 여부」만 나누고,
   할 일 넷(종료·번호없음·정보부족·고유번호증)은 옆줄(coTodoSideHtml)로 내렸다.
   기능은 그대로다. 0곳 숨김·켜고 끄기는 tests/cards-co-chips-two.test.js 가
   «그려서» 확인한다 — 여기서는 고유번호증 몫이 그 안에 들어 있는지만 본다. */
test('옆줄 「할 일」에 「고유번호증 N」이 있다', () => {
  const body = slice(HTML, 'function coTodoSideHtml(){', '\n}');
  assert.match(body, /coUidCount\(\)/, '몇 곳인지 세야 한다');
  assert.match(body, /coOnlyUid/, '눌러서 켜고 끈다');
  assert.match(body, /고유번호증/, '이름표가 없다');
});

test('탭 줄에는 도로 안 남아 있다 — 두 곳에서 같은 일을 하면 한쪽만 고쳐진다', () => {
  const body = slice(HTML, 'function coToolsHtml(){', 'function coTodoSideHtml(');
  assert.equal(body.indexOf('coUidCount'), -1, '탭 줄이 아직 고유번호증을 센다');
  assert.equal(body.indexOf('고유번호증'), -1, '탭 줄에 아직 단추가 있다');
});

test('개수는 폴더·검색을 그대로 두고 센다 — 종료 개수와 같은 결', () => {
  const body = slice(HTML, 'function coUidCount(){', 'function coFilteredList(');
  assert.match(body, /coFilteredList\(null\)\.filter\(coIsUid\)/);
});

test('state 에 칸이 있다 — 없으면 새로고침 때 undefined 로 새다', () => {
  assert.match(HTML, /coOnlyUid:false/);
});

/* ── 사업자 목록에서 골라 본다 ── */

test('사업자 목록에 「서류이름」 열이 있다', () => {
  const defs = slice(HTML, 'const COL_DEFS = {', 'function colHidden(');
  assert.match(defs, /\['docName','서류이름'\]/, '이 열이 없으면 한 장이 어느 쪽인지 모른다');
  /* 명함 쪽에는 넣지 않는다 — 명함에는 서류이름이 없다.
     ⚠ 주석을 먼저 뗀다. 열을 넣은 까닭이 card: 와 biz: 사이에 적혀 있어,
       그냥 자르면 «설명 글자»를 열로 읽는다(되돌림이 아니라 검사가 틀린 것이었다). */
  const bare = defs.replace(/\/\*[\s\S]*?\*\//g, '');
  const cardPart = bare.slice(bare.indexOf('card:'), bare.indexOf('biz:'));
  assert.ok(!/docName/.test(cardPart), '명함에는 없는 칸이다');
});

test('열 너비가 정해져 있다 — 없으면 칸이 찌그러진다', () => {
  assert.match(HTML, /biz:\s*\{[^}]*docName:'11%'/);
});

test('칸별 찾기로 걸린다 — 새 거르개를 만들지 않았다', () => {
  const body = slice(HTML, '/* 칸별 검색 필터 */', '/* 조건 필터: 전화있음');
  assert.match(body, /if \(f\.docName && !has\('docName', f\.docName\)\) return false;/);
  /* ⚠ 새 전역 조건(state.onlyUid)을 만들지 않았다는 것을 못 박는다 —
       만들면 저장된 탭·개수 세기·조건 풀기 여덟 곳을 다 따라 고쳐야 하고,
       하나만 놓치면 「탭을 눌렀는데 조건이 조용히 사라진다」가 된다. */
  assert.ok(!/state\.onlyUid/.test(HTML), '새 전역 조건을 만들면 여덟 곳을 따라가야 한다');
});
