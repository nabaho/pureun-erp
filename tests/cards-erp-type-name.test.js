/* 명함첩 — 이알피 사업 유형을 이름으로 보여주기.
   실행: node --test tests/*.test.js

   대표 보고 2026-08-15: 「새 폴더 만들기 → 이알피에서 가져오기」에 사업 이름 대신
   `consulting-mp0w1084` 같은 **코드가 그대로** 나온다.

   까닭은 자료가 없어서가 아니라 **껍데기를 안 벗겨서**였다.
   이알피 코드표(`data/biz_cons_types`)는 `{v:[...], u:갱신시각}` 으로 싸여 오는데,
   명함첩만 그것을 그대로 Object.values 해서 `[[유형들], 갱신시각]` 을 만들었다.
   그러니 코드로 찾으면 늘 못 찾고 코드를 그대로 내보였다.
   다른 앱(gov-consulting·kcareer)은 이미 벗기고 있었다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 이알피 코드표 읽기 — 순수 로직 (테스트 대상) ══════ */';
  const b = '/* ══════ 이알피 코드표 읽기 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

const TYPES = [
  { code:'consulting-mp0w1084', name:'산업일자리 컨설팅' },
  { code:'consulting-mp0wogrl', name:'중장년 컨설팅' }
];

/* ── 껍데기 벗기기 ── */

test('★ {v, u} 로 싸여 와도 유형 목록을 그대로 꺼낸다', () => {
  /* 이것을 못 벗기면 화면에 이름 대신 코드가 나온다 — 이번 보고의 원인. */
  const C = load();
  same(C.erpUnwrapList({ v: TYPES, u: 1755 }), TYPES);
});

test('안 싸여 온 배열도 그대로 쓴다', () => {
  const C = load();
  same(C.erpUnwrapList(TYPES), TYPES);
});

test('객체(열쇠→값)로 와도 배열로 만든다', () => {
  const C = load();
  same(C.erpUnwrapList({ a: TYPES[0], b: TYPES[1] }), TYPES);
});

test('{v: 객체} 처럼 싸인 객체도 벗기고 배열로', () => {
  const C = load();
  same(C.erpUnwrapList({ v: { a: TYPES[0] }, u: 1 }), [TYPES[0]]);
});

test('없거나 빈 값이어도 터지지 않는다', () => {
  const C = load();
  same(C.erpUnwrapList(null), []);
  same(C.erpUnwrapList(undefined), []);
  same(C.erpUnwrapList({}), []);
  same(C.erpUnwrapList({ v: null }), []);
});

test('빈 자리(null)는 걸러낸다 — 지워진 유형이 목록에 구멍으로 남는다', () => {
  const C = load();
  same(C.erpUnwrapList({ v: [TYPES[0], null, TYPES[1]] }), TYPES);
});

/* ── 코드가 어디 적혀 있나 ── */

test('새 자료는 typeCodes 에, 옛 자료는 typeCode 에 적혀 있다 — 둘 다 읽는다', () => {
  /* 한쪽만 보면 그 자료들이 화면에서 「(이름 없음)」이 된다. */
  const C = load();
  assert.equal(C.erpTypeCodeOf({ typeCodes:{ consulting:'A' } }, 'consulting'), 'A');
  assert.equal(C.erpTypeCodeOf({ typeCode:'B' }, 'consulting'), 'B');
  assert.equal(C.erpTypeCodeOf({ typeCodes:{ consulting:'A' }, typeCode:'B' }, 'consulting'), 'A',
    '새 자리가 있으면 그쪽이 먼저다');
});

test('사건은 사건 자리를 본다', () => {
  const C = load();
  assert.equal(C.erpTypeCodeOf({ typeCodes:{ case:'C', consulting:'A' } }, 'case'), 'C');
});

test('코드가 없으면 빈 글자', () => {
  const C = load();
  assert.equal(C.erpTypeCodeOf({}, 'consulting'), '');
  assert.equal(C.erpTypeCodeOf(null, 'consulting'), '');
});

/* ── 코드 → 이름 ── */

test('★ 코드를 사업 이름으로 바꾼다', () => {
  const C = load();
  assert.equal(C.erpTypeNameFrom(TYPES, 'consulting-mp0w1084'), '산업일자리 컨설팅');
});

test('코드표에 없는 코드는 코드를 그대로 보여준다 — 빈칸보다 낫다', () => {
  /* 빈칸으로 두면 「이름 없는 사업」이 여럿 생겨 어느 것이 어느 것인지 알 수 없다. */
  const C = load();
  assert.equal(C.erpTypeNameFrom(TYPES, 'consulting-없는코드'), 'consulting-없는코드');
});

test('이름이 비어 있는 유형도 코드를 보여준다', () => {
  const C = load();
  assert.equal(C.erpTypeNameFrom([{ code:'X', name:'' }], 'X'), 'X');
});

test('코드표를 아직 못 받았어도 터지지 않는다', () => {
  const C = load();
  assert.equal(C.erpTypeNameFrom(null, 'X'), 'X');
  assert.equal(C.erpTypeNameFrom([], 'X'), 'X');
  assert.equal(C.erpTypeNameFrom(TYPES, ''), '');
});

test('코드가 숫자로 저장돼 있어도 찾는다', () => {
  /* 이알피가 코드를 숫자로 넣은 자료가 섞여 있다 — 글자로 맞춰 본다. */
  const C = load();
  assert.equal(C.erpTypeNameFrom([{ code:12, name:'열두번' }], '12'), '열두번');
});

/* ── 화면이 이 층을 쓰는지 ── */

test('코드표를 읽을 때 껍데기를 벗긴다', () => {
  /* ⚠ 2026-08-24: 코드표가 사업마다 셋(컨설팅·기금·기타)이 되면서 읽는 자리를 손으로
     적지 않고 목록(ERP_HIST_KINDS)에서 만든다. 지킬 것은 「껍데기를 벗긴다」이지
     그 주소가 코드에 글자로 적혀 있는가가 아니다. */
  assert.match(src, /ERP_HIST_KINDS\.filter\(s=>s\.types\)\.map\(s=>'data\/'\+s\.types\)/,
    '코드표를 읽는 곳을 찾을 수 없습니다');
  assert.match(src, /_erpHistTypes\[s\.kind\] = erpUnwrapList\(/, '껍데기를 안 벗기고 있습니다');
  assert.match(src, /_erpConsTypes = _erpHistTypes\.consulting/,
    '옛 이름(_erpConsTypes)이 끊기면 그것을 쓰는 화면에서 코드가 그대로 나옵니다');
  assert.ok(!/_erpConsTypes = Array\.isArray\(ts\.val\(\)\)/.test(src),
    '옛 방식(껍데기를 안 벗기는 코드)이 남아 있습니다');
});

test('가져오기 목록과 이력 줄 모두 «제 사업의» 코드 자리를 본다', () => {
  /* 한쪽만 고치면 다른 화면에서 여전히 코드가 나온다.
     ⚠ 2026-08-24: 두 곳이 같은 도우미(erpHistName)를 쓰게 모았다 — 종전처럼 같은
       삼항식을 두 벌 적어 두면 사업을 하나 더할 때 한쪽만 고쳐진다. */
  assert.match(src, /function erpHistName\(rec, typesByKind\)/, '한 도우미로 모아야 합니다');
  /* 두 화면이 그 도우미에 «사업별 사전»을 넘기는지 본다 — 한 곳이라도 안 넘기면
     그 화면에서만 기금·기타사업이 「(이름 없음)」이 된다. */
  const n = (src.match(/erpHist(?:Name|Row)\((?:rec|r), _erpHistTypes\)/g) || []).length;
  assert.ok(n >= 2, '사업별 사전을 넘기는 곳이 ' + n + '곳뿐입니다 (가져오기·이력 둘 다 필요)');
  assert.ok(!/erpConsTypeName\(erpTypeCodeOf\(rec,'consulting'\)\)/.test(src),
    '옛 삼항식이 남아 있습니다 — 기금·기타사업이 「(이름 없음)」이 됩니다');
});
