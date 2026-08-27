/* 기업 상세 2단계 — 서류를 사업·사건에 «이름 대조»로 붙인다 (대표 지시 2026-08-26)
   "그때 당시 처리했던 계약서 및 사업신청 등을 자동으로 구분 정리하고 화면으로 관리"

   ★ 근거는 이름 대조 «하나»뿐이다. 날짜 추정은 4단계 — 틀릴 수 있는 근거를 먼저 켜면
     잘못 붙은 계약서를 아무도 못 찾는다.
   ★ 서버에 아무것도 쓰지 않는다. 그릴 때마다 맞춰 보는 셈이다.
   ⚠ 규칙은 일부러 깐깐하다. 안 붙는 것은 「아직 안 붙은 서류」에 남아 눈에 보이지만,
     엉뚱한 사업에 붙은 계약서는 아무도 못 찾는다 — 놓치는 쪽이 낫다. */

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
  const ctx = { console, Object, Array, String, Number, Set };
  vm.createContext(ctx);
  /* ⚠ const 는 vm 컨텍스트에 안 붙는다 — var 로 바꿔 싣는다 */
  const code = slice('const CASE_TOK_STOP = new Set([', '/* 사업 한 줄 아래에 붙은 서류들')
    .replace(/^const /, 'var ').replace(/\nconst /g, '\nvar ');
  new vm.Script(code).runInContext(ctx);
  return ctx;
}

const CASES = [
  { name: '일터혁신 상생컨설팅' },
  { name: '통합기술보호지원단' },
  { name: '부당해고 구제신청' },
  { name: '사내근로복지기금 설립' },
];

/* ── 붙는다 ── */

test('★ 사업 이름이 서류 제목에 들면 그 사업에 붙는다', () => {
  const { docCaseMatch } = load();
  const m = docCaseMatch('일터혁신 참여신청서', CASES);
  assert.ok(m, '안 붙었다');
  assert.strictEqual(m.i, 0);
  assert.strictEqual(m.word, '일터혁신', '근거 낱말을 남겨야 한다');
  assert.strictEqual(m.why, '이름');
});

test('긴 사업 이름도 그대로 붙는다', () => {
  const { docCaseMatch } = load();
  assert.strictEqual(docCaseMatch('통합기술보호지원단 신청기업 정보', CASES).i, 1);
  assert.strictEqual(docCaseMatch('통합기술보호지원단 업태 종목 내역', CASES).i, 1);
});

test('사건·기금도 같은 규칙으로 붙는다', () => {
  const { docCaseMatch } = load();
  assert.strictEqual(docCaseMatch('부당해고 구제신청 이유서', CASES).i, 2);
  assert.strictEqual(docCaseMatch('사내근로복지기금 정관', CASES).i, 3);
});

test('사업 이름의 «일부»만 들어도 붙는다 — 세 글자 이상일 때', () => {
  const { docCaseMatch } = load();
  const m = docCaseMatch('일터혁신 상생컨설팅 결과보고서', CASES);
  assert.strictEqual(m.i, 0);
});

/* ── 안 붙는다 (이쪽이 더 중요하다) ── */

test('★ 사업 이름이 없는 계약서는 «안 붙인다» — 3단계에서 사람이 고른다', () => {
  const { docCaseMatch } = load();
  ['자문계약서', '수임약정서', '용역계약서'].forEach(nm => {
    assert.strictEqual(docCaseMatch(nm, CASES), null, nm + ' 이 붙었다 — 근거가 없는데 붙이면 안 된다');
  });
});

test('★ 회사 자체 서류는 안 붙인다 — 어느 사업 것도 아니다', () => {
  const { docCaseMatch } = load();
  ['사업자등록증', '고유번호증', '중소기업확인서'].forEach(nm => {
    assert.strictEqual(docCaseMatch(nm, CASES), null, nm + ' 이 붙었다');
  });
});

test('★ 뜻 없는 낱말로는 안 붙인다 — 「신청서」·「지원」이 다 걸리면 없는 것만 못하다', () => {
  const { docCaseMatch } = load();
  ['참여신청서', '지원 신청서', '사업 계획서', '기업 정보', '제출 서류'].forEach(nm => {
    assert.strictEqual(docCaseMatch(nm, CASES), null, nm + ' 이 붙었다');
  });
});

test('★ 두 사업이 같은 무게로 걸리면 «안 붙인다» — 모르면 모른다고 둔다', () => {
  const { docCaseMatch } = load();
  const two = [{ name: '일터혁신 컨설팅' }, { name: '일터혁신 후속과제' }];
  assert.strictEqual(docCaseMatch('일터혁신 참여신청서', two), null);
});

test('무게가 다르면 «더 긴 근거»를 고른다', () => {
  const { docCaseMatch } = load();
  const two = [{ name: '기술보호 컨설팅' }, { name: '통합기술보호지원단' }];
  const m = docCaseMatch('통합기술보호지원단 신청서', two);
  assert.strictEqual(m.i, 1);
  assert.strictEqual(m.word, '통합기술보호지원단');
});

test('두 글자 낱말이 겹쳐도 안 붙인다 — 우연히 겹치는 자리다', () => {
  const { docCaseMatch } = load();
  assert.strictEqual(docCaseMatch('노사 협의', [{ name: '노사 관계 진단' }]), null);
});

test('빈 이름·없는 사업에 안 넘어진다', () => {
  const { docCaseMatch, caseNameHit } = load();
  assert.strictEqual(docCaseMatch('', CASES), null);
  assert.strictEqual(docCaseMatch(null, CASES), null);
  assert.strictEqual(docCaseMatch('일터혁신 신청서', []), null);
  assert.strictEqual(docCaseMatch('일터혁신 신청서', null), null);
  assert.strictEqual(caseNameHit(null, null), '');
  assert.strictEqual(docCaseMatch('일터혁신', [null, { name: '' }]), null);
});

/* ── 낱말 뽑기 ── */

test('괄호·가름표는 띄어쓰기로 본다', () => {
  const { caseTokens } = load();
  const t = caseTokens('일터혁신(상생)·컨설팅 [3회차]');
  assert.ok(t.indexOf('일터혁신') >= 0);
  assert.ok(t.indexOf('상생') >= 0);
});

test('한 글자는 버린다 — 근거가 될 수 없다', () => {
  const { caseTokens } = load();
  assert.strictEqual(caseTokens('가 나 다').length, 0);
});

test('뜻 없는 낱말 목록은 «코드가 아니라 목록»이다 — 겪을 때마다 늘린다', () => {
  const body = slice('const CASE_TOK_STOP = new Set([', 'function caseTokens(');
  ['신청서', '계약서', '지원', '기업', '정보', '현황'].forEach(w => {
    assert.ok(body.indexOf("'" + w + "'") >= 0, w + ' 가 목록에 없다');
  });
});

/* ── 회사 하나를 나눈다 ── */

test('붙은 것과 안 붙은 것으로 나눈다 — 어느 쪽도 사라지지 않는다', () => {
  const { docCasePlan } = load();
  const docs = [
    { name: '일터혁신 참여신청서' },
    { name: '통합기술보호지원단 신청기업 정보' },
    { name: '자문계약서' },
    { name: '사업자등록증' },
  ];
  const p = docCasePlan(docs, CASES);
  assert.strictEqual((p.byCase[0] || []).length, 1);
  assert.strictEqual((p.byCase[1] || []).length, 1);
  assert.strictEqual(p.left.length, 2, '안 붙은 것이 남아야 한다');
  /* 하나도 잃지 않는다 */
  const attached = Object.keys(p.byCase).reduce((a, k) => a + p.byCase[k].length, 0);
  assert.strictEqual(attached + p.left.length, docs.length, '서류가 사라졌다');
});

test('한 사업에 여러 서류가 붙는다', () => {
  const { docCasePlan } = load();
  const p = docCasePlan([
    { name: '통합기술보호지원단 신청기업 정보' },
    { name: '통합기술보호지원단 업태 종목 내역' },
  ], CASES);
  assert.strictEqual(p.byCase[1].length, 2);
});

test('빈 서류 목록·망가진 것에 안 넘어진다', () => {
  const { docCasePlan } = load();
  assert.strictEqual(docCasePlan([], CASES).left.length, 0);
  assert.strictEqual(docCasePlan(null, CASES).left.length, 0);
  assert.strictEqual(docCasePlan([null, {}], CASES).left.length, 1, 'null 은 버리고 {} 는 남긴다');
});

/* ── 화면 ── */

test('★ 근거를 딱지에 적는다 — 조용히 붙이면 잘못 붙은 것을 못 찾는다', () => {
  /* 2026-08-26(3단계): 근거가 셋으로 늘어(지정·기억·이름) 딱지에 적는 값이
     h.word 에서 tag 로 넓어졌다. 「적는다」는 뜻은 그대로다. */
  const body = slice('function coCaseDocsHtml(hits){', '/* ══════ 3단계 — 끌어다 놓기');
  assert.match(body, /<i>\$\{esc\(tag\)\}<\/i>/, '근거를 보여 줘야 한다');
  assert.match(body, /CO_WHY_TIP/, '왜 붙었는지 말해야 한다');
  assert.match(HTML, /이 낱말이 사업 이름과 서류 제목에 함께 들어 있습니다/,
    '이름 대조의 까닭이 적혀 있어야 한다');
  assert.match(body, /openCoDoc\(/, '눌러서 원본을 볼 수 있어야 한다');
});

test('붙은 서류를 사업 줄 «바로 아래»에 놓는다', () => {
  const body = slice('function coHistPaint(){', 'box.innerHTML = `<div class="pdsec"');
  /* 2026-08-26(3단계): 사업 줄을 «받는 자리»로 감쌌다 — 차례는 그대로다 */
  const rowAt = body.indexOf('+ erpHistRowHtml(r, grouped);');
  const docAt = body.indexOf('list += coCaseDocsHtml(plan.byCase[r._i])');
  assert.ok(rowAt > 0 && docAt > rowAt, '사업 줄 뒤에 와야 한다');
  assert.match(body, /class=\"cohist-drop\"/, '받는 자리가 있어야 한다');
});

test('걸러 보거나 정렬을 바꿔도 붙임새가 따라온다 — 줄 번호가 아니라 기록으로 잇는다', () => {
  const body = slice('function coHistPaint(){', 'box.innerHTML = `<div class="pdsec"');
  assert.match(body, /all\.forEach\(function\s*\(r,\s*i\)\s*\{\s*r\._i = i;/, '자리표를 심어야 한다');
  assert.match(body, /plan\.byCase\[r\._i\]/, '자리표로 찾아야 한다');
});

test('★ 안 붙은 서류는 「아직 안 붙은 서류」에 남는다 — 조용히 사라지면 안 된다', () => {
  const body = slice('function coLeftDocsPaint(left, total){', 'function coDocsListHtml(');
  assert.match(body, /아직 안 붙은 서류/);
  assert.match(body, /coDocsListHtml\(left,/, '안 붙은 것만 그려야 한다');
  assert.match(body, /어느 사업·사건 것인지 이름으로는 알 수 없었습니다/, '왜 안 붙었는지 말해야 한다');
});

test('★ 같은 서류가 두 곳에 나오지 않는다 — 붙은 것은 목록에서 뺀다', () => {
  const body = slice('function coLeftDocsPaint(left, total){', 'function coDocsListHtml(');
  assert.ok(!/plan\.byCase|docsAll/.test(body), '붙은 것까지 여기 그리면 두 번 보인다');
  assert.match(body, /if\(!\(total\|\|0\)\)\{ box\.innerHTML = ''; return; \}/,
    '서류가 아예 없으면 칸을 비워야 한다');
});

test('사업 기록이 오기 «전»에는 서류 전부를 보여 준다', () => {
  const body = slice('function coDocsHtml(o){', 'function coLeftDocsPaint(');
  assert.match(body, /읽어 온 서류/, '처음에는 예전대로 전부');
  assert.match(body, /id="coDocsBox"/, '다시 그릴 자리가 있어야 한다');
});

/* ── 2단계도 쓰기가 없다 ── */

test('★ «맞춰 보는 셈»은 서버에 쓰지 않는다 — 쓰는 것은 사람이 끌어다 놓을 때만이다', () => {
  /* 2026-08-26(3단계): 기억을 남기려면 써야 한다. 다만 «자동으로 그리는 길»에는
     여전히 쓰기가 없다 — 그리기만 하다가 쓰면 화면을 열 때마다 쓰기가 나간다. */
  const body = slice('const CASE_TOK_STOP = new Set([', '/* ══════ 3단계 — 끌어다 놓기');
  assert.ok(!/Store\.|\.update\(|\.set\(|\.remove\(/.test(body),
    '붙임새를 셈하면서 쓰기가 나가면 안 된다');
  const paint = slice('function coHistPaint(){', 'box.innerHTML = `<div class="pdsec"');
  assert.ok(!/Store\.db|\.update\(|\.remove\(/.test(paint), '그리면서 쓰기가 나가면 안 된다');
});

test('날짜 추정은 아직 «안» 켰다 — 4단계다', () => {
  const body = slice('const CASE_TOK_STOP = new Set([', 'function coHistPaint(){');
  assert.ok(!/\.from|\.to\b|takenAt|기간 안/.test(body),
    '날짜로 붙이는 근거가 들어왔다 — 4단계에서 할 일이다');
});
