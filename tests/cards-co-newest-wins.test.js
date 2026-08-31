/* 기업 상세 — 「최근에 올린 것이 기준」 (대표 지시 2026-08-31)
   「기업상세는 원칙적으로 최근에 업로드 된 정보 기준으로 되게 해라」

   ■ 여태는 «먼저 만난 것»이 이겼다
     coListBuild 의 take() 는 «빈 칸만» 채우므로 먼저 온 자료가 이긴다. 그런데 자료를
     도는 순서는 저장소 열쇠 순 — 아무 뜻이 없다. 그래서 회사가 이사하고 새 등록증을
     올려도 기업 상세에는 «옛 주소»가 그대로 남을 수 있었다.

   ■ 이제 «최근 것»부터 돈다 — 빈 칸을 최근 자료가 먼저 채운다.
     ⚠ 갈래끼리의 차례(등록증 → 명함 → 이알피)는 그대로다. 등록증이 법적 원본이고
       명함 번호는 그 회사가 스스로 박아 준 것이라, 최근이라고 등록증을 덮게 하지 않는다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

/* ⚠ 길이를 못 박아 자르지 않는다 — 표식 사이를 벤다 */
function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}
/* 도우미 둘은 coListBuild «안»에 있다 — 검사들이 그 함수만 떠서 돌리기 때문이다.
   그래서 여기서도 함수 안에서 꺼내 쓴다(밖으로 빼면 서른한 개가 깨진다). */
function sorter() {
  const body = slice('function _coStamp(', '/* 상호 → 사업자번호 열쇠');
  const ctx = { Number, isFinite, Object, Array, String };
  vm.createContext(ctx);
  new vm.Script(body + '\n;this._coStamp=_coStamp; this._coNewestFirst=_coNewestFirst;')
    .runInContext(ctx);
  return ctx;
}

/* ── 무엇을 「최근」으로 보는가 ── */

test('★ 올린 시각(createdAt)으로 최근을 가린다', () => {
  const { _coNewestFirst } = sorter();
  const got = _coNewestFirst([
    { id: '옛', createdAt: 100 }, { id: '새', createdAt: 300 }, { id: '중간', createdAt: 200 }
  ]).map((x) => x.id);
  assert.deepStrictEqual(got, ['새', '중간', '옛']);
});

test('★ 손으로 «고친» 시각도 본다 — 고친 값이 옛 등록증에 밀리면 안 된다', () => {
  const { _coNewestFirst } = sorter();
  const got = _coNewestFirst([
    { id: '나중에고침', createdAt: 100, updatedAt: 900 },
    { id: '올린건새것', createdAt: 300 }
  ]).map((x) => x.id);
  assert.deepStrictEqual(got, ['나중에고침', '올린건새것']);
});

test('★ 시각이 없는 옛 자료는 «맨 뒤»로 — 없는 것이 최근일 수는 없다', () => {
  const { _coNewestFirst } = sorter();
  const got = _coNewestFirst([{ id: '시각없음' }, { id: '있음', createdAt: 5 }]).map((x) => x.id);
  assert.deepStrictEqual(got, ['있음', '시각없음']);
});

test('★ 시각이 같으면 «원래 순서»를 지킨다 — 흔들리면 값이 저절로 바뀌는 것처럼 보인다', () => {
  const { _coNewestFirst } = sorter();
  const rows = [{ id: 'ㄱ', createdAt: 7 }, { id: 'ㄴ', createdAt: 7 }, { id: 'ㄷ', createdAt: 7 }];
  assert.deepStrictEqual(_coNewestFirst(rows).map((x) => x.id), ['ㄱ', 'ㄴ', 'ㄷ']);
  /* 여러 번 돌려도 같아야 한다 */
  assert.deepStrictEqual(_coNewestFirst(rows).map((x) => x.id), ['ㄱ', 'ㄴ', 'ㄷ']);
});

test('★ 원본 배열을 «그 자리에서» 뒤집지 않는다 — 다른 화면의 순서가 함께 바뀐다', () => {
  const { _coNewestFirst } = sorter();
  const rows = [{ id: 'ㄱ', createdAt: 1 }, { id: 'ㄴ', createdAt: 9 }];
  _coNewestFirst(rows);
  assert.deepStrictEqual(rows.map((x) => x.id), ['ㄱ', 'ㄴ'], '원본은 그대로여야 합니다');
});

test('빈 목록·이상한 값에도 터지지 않는다 — 실자료에는 빈 칸이 흔하다', () => {
  const { _coNewestFirst, _coStamp } = sorter();
  assert.deepStrictEqual(_coNewestFirst([]), []);
  assert.strictEqual(_coStamp(null), 0);
  assert.strictEqual(_coStamp({}), 0);
  assert.strictEqual(_coStamp({ createdAt: 'x' }), 0, '숫자가 아니면 0 이라야 정렬이 안 깨집니다');
});

/* ── 병합이 실제로 그 순서를 쓰는가 ── */

test('★★ 등록증을 도는 자리가 «최근 것부터»다', () => {
  const line = slice('/* ① 사업자등록증', 'o.docs++');
  assert.ok(/_coNewestFirst\(Object\.values\(allItems\(\)\)\.filter\(it=>it\.kind==='biz'\)\)/.test(line),
    '등록증 목록을 최근 순으로 돌려야 새 등록증이 옛것을 이깁니다');
});

test('★★ 명함을 도는 자리도 «최근 것부터»다', () => {
  const line = slice("/* ② 명함", 'o.cards.push(it)');
  assert.ok(/_coNewestFirst\(Object\.values\(allItems\(\)\)\.filter\(it=>it\.kind!=='biz'/.test(line),
    '명함도 최근 순이어야 합니다');
});

test('빈 칸만 채우는 규칙은 그대로다 — 최근 것이 이기는 근거가 이것이다', () => {
  const take = slice('const take = (k, src, from)', 'return o;');
  assert.ok(/if\(src\[f\] && !o\[f\]\)/.test(take),
    '빈 칸만 채우기 + 최근 순 돌기 = 최근 것이 이긴다');
});

test('갈래 차례(등록증 → 명함 → 이알피)는 «그대로» 둔다', () => {
  const body = slice('function coListBuild(', 'const erpBy = ErpMatch.matchAll');
  const iBiz = body.indexOf("kind==='biz'");
  const iCard = body.indexOf("kind!=='biz'");
  assert.ok(iBiz > 0 && iCard > iBiz, '등록증을 명함보다 먼저 돌아야 합니다');
  /* 이알피는 맨 나중 — matchAll 이 그 뒤에 온다는 것이 이 slice 로 이미 확인된다 */
});
