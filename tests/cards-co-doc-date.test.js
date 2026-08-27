/* 기업 상세 4단계 — 날짜로 맞춰 본다 + 추측을 «물릴» 수 있게 (대표 지시 2026-08-26)

   ★ 왜 맨 마지막인가 — 가장 약한 근거다. 서류 날짜는 «사진첩에 올린 때»이고
     서류에 적힌 날짜가 아니다. 계약서를 몇 달 뒤에 찍어 올리는 일이 흔하다.
     그래서 앞의 셋(지정·기억·이름)이 다 실패했을 때만 본다.
   ★ 걸리는 사업이 «딱 하나»일 때만 붙인다. 둘이면 반은 틀린다.
   ★ 4단계부터 «어떤 근거로 붙은 것이든» 뗄 수 있다.
     3단계까지는 지정·기억만 뗄 수 있어, 이름·날짜로 틀리게 붙은 것을 물릴 길이
     없었다 — 떼도 다음에 같은 근거로 또 붙었다. 「안 붙임」 표시로 막는다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}
function load() {
  const ctx = { console, Object, Array, String, Number, Set, Date };
  vm.createContext(ctx);
  const code = slice('const CASE_TOK_STOP = new Set([', '/* 사업 한 줄 아래에 붙은 서류들')
    .replace(/^const /, 'var ').replace(/\nconst /g, '\nvar ');
  new vm.Script(code).runInContext(ctx);
  return ctx;
}
const D = (y, m, d) => Date.UTC(y, m - 1, d, 12);

const CASES = [
  { kind: 'consulting', name: '일터혁신 상생컨설팅', no: 'C1', year: '2026', from: '03-01', to: '06-30' },
  { kind: 'case', name: '부당해고 구제신청', no: 'K1', year: '2025', from: '09-10', to: '11-20' },
  { kind: 'fund', name: '사내근로복지기금 설립', no: 'F1', year: '2024', from: '', to: '' },
];

/* ── 사업 기간 ── */

test('시작·끝이 있으면 그 사이다', () => {
  const { caseWindow } = load();
  const w = caseWindow(CASES[0]);
  assert.ok(w[0] <= D(2026, 3, 1) && w[1] >= D(2026, 6, 30));
  assert.ok(w[0] > D(2026, 2, 28), '3월 1일 앞은 아니다');
});

test('끝이 비면 그 해 끝까지 — 진행중이라는 뜻이다', () => {
  const { caseWindow } = load();
  const w = caseWindow({ year: '2026', from: '05-01', to: '' });
  assert.ok(w[1] >= D(2026, 12, 31));
  assert.ok(w[1] < D(2027, 1, 1), '이듬해로 넘기면 안 된다');
});

test('둘 다 비면 그 해 전체다', () => {
  const { caseWindow } = load();
  const w = caseWindow(CASES[2]);
  assert.ok(w[0] <= D(2024, 1, 1) && w[1] >= D(2024, 12, 31));
});

test('★ 끝이 시작보다 앞이면 «해를 넘긴» 사업이다 (11월~2월)', () => {
  const { caseWindow } = load();
  const w = caseWindow({ year: '2026', from: '11-01', to: '02-28' });
  assert.ok(w[1] > D(2027, 1, 1), '이듬해까지 이어져야 한다');
  assert.ok(w[1] < D(2027, 3, 1));
});

test('해를 모르면 기간도 모른다 — 없는 것을 짐작하지 않는다', () => {
  const { caseWindow } = load();
  assert.strictEqual(caseWindow({ year: '', from: '03-01', to: '06-30' }), null);
  assert.strictEqual(caseWindow(null), null);
  assert.strictEqual(caseWindow({}), null);
});

test('망가진 월-일에 안 넘어진다 — 그 해 전체로 본다', () => {
  const { caseWindow } = load();
  const w = caseWindow({ year: '2026', from: '3월', to: 'xx' });
  assert.ok(w && w[0] <= D(2026, 1, 1) && w[1] >= D(2026, 12, 31));
});

/* ── 날짜로 맞추기 ── */

test('★ 기간 안에 들면 그 사업으로 — 걸리는 것이 하나일 때', () => {
  const { docDateHit } = load();
  assert.strictEqual(docDateHit(D(2026, 4, 15), CASES).i, 0);
  assert.strictEqual(docDateHit(D(2025, 10, 1), CASES).i, 1);
  assert.strictEqual(docDateHit(D(2024, 7, 7), CASES).i, 2);
  assert.strictEqual(docDateHit(D(2026, 4, 15), CASES).why, '날짜');
});

test('★ 걸리는 사업이 둘이면 «안 붙인다» — 아무 쪽에 붙여도 반은 틀린다', () => {
  const { docDateHit } = load();
  const two = [
    { year: '2026', from: '03-01', to: '06-30' },
    { year: '2026', from: '04-01', to: '05-31' },
  ];
  assert.strictEqual(docDateHit(D(2026, 4, 15), two), null);
});

test('아무 사업에도 안 걸리면 안 붙인다', () => {
  const { docDateHit } = load();
  assert.strictEqual(docDateHit(D(2026, 8, 1), CASES), null);
  assert.strictEqual(docDateHit(D(2020, 1, 1), CASES), null);
});

test('날짜가 없으면 아예 맞춰 보지 않는다', () => {
  const { docDateHit } = load();
  assert.strictEqual(docDateHit(0, CASES), null);
  assert.strictEqual(docDateHit(null, CASES), null);
  assert.strictEqual(docDateHit(undefined, CASES), null);
  assert.strictEqual(docDateHit(D(2026, 4, 15), []), null);
  assert.strictEqual(docDateHit(D(2026, 4, 15), null), null);
  /* ⚠ 값으로만 재면 이 뜻이 안 지켜진다 — 지금 사업들은 1970년을 안 담으므로
       날짜가 0 이어도 «어쩌다» null 이 나온다. 「아예 맞춰 보지 않는다」는 것을
       코드에서 못 박는다(되돌림이 그냥 지나간 자리). */
  const body = slice('function docDateHit(at, cases){', 'function docCasePlan(');
  assert.match(body, /if\(!t\) return null;/, '날짜가 없으면 그 자리에서 되돌아가야 한다');
});

/* ── 근거 차례에서 «맨 마지막» ── */

test('★ 날짜는 이름 대조보다 «뒤»다 — 이름이 더 센 근거다', () => {
  const { docCasePlan } = load();
  /* 이름으로는 0번, 날짜로는 1번에 걸리는 서류 */
  const cases = [
    { kind: 'a', name: '일터혁신 컨설팅', no: 'A', year: '2020', from: '', to: '' },
    { kind: 'b', name: '다른 사업', no: 'B', year: '2026', from: '01-01', to: '12-31' },
  ];
  const p = docCasePlan([{ _k: 'd1', name: '일터혁신 참여신청서', at: D(2026, 5, 1) }], cases, {}, {});
  assert.strictEqual(p.byCase[0][0].why, '이름', '이름이 이겨야 한다');
});

test('이름으로 못 붙은 것을 날짜가 건진다', () => {
  const { docCasePlan } = load();
  const p = docCasePlan([{ _k: 'd1', name: '자문계약서', at: D(2026, 4, 15) }], CASES, {}, {});
  assert.strictEqual(p.byCase[0][0].why, '날짜');
});

test('지정·기억이 날짜보다 세다', () => {
  const { docCasePlan, caseKeyOf, docNameKey } = load();
  const pins = { d1: caseKeyOf(CASES[1]) };
  const p1 = docCasePlan([{ _k: 'd1', name: '자문계약서', at: D(2026, 4, 15) }], CASES, pins, {});
  assert.strictEqual(p1.byCase[1][0].why, '지정');
  const rules = {}; rules[docNameKey('자문계약서')] = caseKeyOf(CASES[2]);
  const p2 = docCasePlan([{ _k: 'd1', name: '자문계약서', at: D(2026, 4, 15) }], CASES, {}, rules);
  assert.strictEqual(p2.byCase[2][0].why, '기억');
});

/* ── 「안 붙임」 — 추측을 물린다 ── */

test('★ 「안 붙임」 표시가 있으면 어떤 근거도 다시 붙이지 않는다', () => {
  const { docCasePlan, CO_PIN_NONE } = load();
  const pins = { d1: CO_PIN_NONE };
  /* 이름으로도 날짜로도 붙을 서류인데 사람이 물렸다 */
  const p = docCasePlan(
    [{ _k: 'd1', name: '일터혁신 참여신청서', at: D(2026, 4, 15) }], CASES, pins, {});
  assert.strictEqual(Object.keys(p.byCase).length, 0, '다시 붙으면 안 된다');
  assert.strictEqual(p.left.length, 1, '「안 붙은 서류」로 남아야 한다');
});

test('「안 붙임」은 기억보다도 앞이다 — 사람이 마지막에 한 말이 이긴다', () => {
  const { docCasePlan, caseKeyOf, docNameKey, CO_PIN_NONE } = load();
  const rules = {}; rules[docNameKey('자문계약서')] = caseKeyOf(CASES[0]);
  const p = docCasePlan([{ _k: 'd1', name: '자문계약서' }], CASES, { d1: CO_PIN_NONE }, rules);
  assert.strictEqual(p.left.length, 1);
});

test('★ 기계가 추측한 것을 떼면 «안 붙임»을 남긴다 — 안 남기면 또 붙는다', () => {
  const { docDetachPlan, CO_PIN_NONE } = load();
  ['이름', '날짜'].forEach(why => {
    const u = docDetachPlan('co', 'd1', '자문계약서', why);
    assert.strictEqual(u['coInfo/co/docPin/d1'], CO_PIN_NONE, why + ' 을 떼면 표시를 남겨야 한다');
  });
});

test('사람이 붙인 것을 떼면 그냥 지운다 — 표시를 남길 이유가 없다', () => {
  const { docDetachPlan } = load();
  ['지정', '기억'].forEach(why => {
    const u = docDetachPlan('co', 'd1', '자문계약서', why);
    assert.strictEqual(u['coInfo/co/docPin/d1'], null);
  });
});

test('어느 쪽이든 «기억»은 함께 지운다 — 안 지우면 다시 붙는다', () => {
  const { docDetachPlan } = load();
  ['지정', '기억', '이름', '날짜'].forEach(why => {
    const u = docDetachPlan('co', 'd1', '자문계약서', why);
    assert.strictEqual(u['coInfo/co/docRule/자문계약서'], null, why);
  });
});

test('「안 붙임」 표시는 사업 열쇠와 «겹치지 않는» 값이다', () => {
  const { CO_PIN_NONE, caseKeyOf } = load();
  assert.strictEqual(CO_PIN_NONE, '-');
  /* 사업 열쇠는 늘 「갈래~…」 꼴이라 '-' 하나와 겹칠 수 없다 */
  assert.notStrictEqual(caseKeyOf(CASES[0]), CO_PIN_NONE);
  assert.ok(caseKeyOf(CASES[0]).indexOf('~') > 0);
});

/* ── 화면 ── */

test('★ 날짜로 붙은 것은 «확인해 달라»고 말한다', () => {
  const body = slice('const CO_WHY_TIP = {', 'function coCaseDocsHtml(hits){');
  assert.match(body, /'날짜':/, '날짜 근거의 까닭이 없다');
  assert.match(body, /맞춰 본/, '추측이라는 것을 말해야 한다');
  assert.match(body, /확인해 주세요/);
  assert.match(body, /서류에 적힌 날짜가 아니라 사진첩에 올린 날짜입니다/,
    '어떤 날짜인지 말해야 한다 — 이것을 모르면 왜 틀렸는지 모른다');
});

test('★ 날짜 딱지는 눈에 다르다 — 가장 약한 근거다', () => {
  assert.match(HTML, /\.codocchip\.w-날짜\{[^}]*border-style:dashed/,
    '점선으로 갈라 보여야 한다');
});

test('★ 어떤 근거로 붙은 것이든 뗄 수 있다', () => {
  const body = slice('function coCaseDocsHtml(hits){', '/* ══════ 3단계 — 끌어다 놓기');
  assert.ok(!/why === '지정' \|\| why === '기억'/.test(body),
    '3단계의 제한이 남아 있다 — 이름·날짜도 뗄 수 있어야 한다');
  assert.match(body, /coDocDetach\('\$\{esc\(d\._k\|\|''\)\}','\$\{esc\(why\)\}'\)/,
    '무슨 근거로 붙었는지 함께 넘겨야 한다');
});

test('물린 뒤 «다시 안 붙는다»고 말해 준다 — 안 말하면 몇 번을 누른다', () => {
  const body = slice('async function coDocDetach(docKey, why){', 'function coHistPaint(){');
  assert.match(body, /다시 붙이지 않습니다/);
  assert.match(body, /why === '이름' \|\| why === '날짜'/);
});

test('날짜 근거를 «맨 마지막»에 둔다 — 코드 차례로도 그렇다', () => {
  const body = slice('function docCasePlan(docs, cases, pins, rules){', '/* 끌어다 놓았을 때 쓸 자리');
  const none = body.indexOf('CO_PIN_NONE');
  const pin = body.indexOf("'지정'");
  const rule = body.indexOf("'기억'");
  const name = body.indexOf('docCaseMatch(d.name, cases)');
  const date = body.indexOf('docDateHit(d.at, cases)');
  assert.ok(none < pin && pin < rule && rule < name && name < date,
    '차례가 어긋났다 — 안붙임 → 지정 → 기억 → 이름 → 날짜 여야 한다');
});
