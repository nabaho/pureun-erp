/* 출금관리 머리 영역 정리 + 거래내역 출금 연동 (2026-08-16 대표 지시)
   "캡쳐1을 좀 더 깔끔하게 정리하고 중복되는 부분 삭제 · 거래내역 출금도 자동 연동 · 캡쳐3 콤팩트하게"
   ★ 기능은 하나도 안 없앤다 — 중복만 없애고 자리를 옮긴다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function cut(from, to) {
  const s = SRC.indexOf(from);
  assert.ok(s > 0, '코드를 찾지 못했다: ' + from);
  const e = SRC.indexOf(to, s);
  assert.ok(e > s, '끝을 찾지 못했다: ' + to);
  return SRC.slice(s, e);
}
// 주석을 걷어낸 «코드만» — 글자를 셀 때 제 설명에 걸리지 않게 한다
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── 「어디서 온 출금인가」를 실제로 돌려 본다 ── */
const FN = cut('function erpExpenseFrom(', 'if(typeof window');
const ctx = { String: String };
vm.createContext(ctx);
vm.runInContext(FN, ctx);
const from = ctx.erpExpenseFrom;

test('거래내역에서 온 것을 찾는다', () => {
  assert.strictEqual(from({ src: 'ledger' }), 'ledger');
});

test('옛 기록도 찾는다 — 자료를 고쳐 쓰지 않는다', () => {
  /* 표(src)가 생기기 전 기록에는 비고 머리글자밖에 없다.
     지난 것까지 보이게 하려고 그것도 알아본다. */
  assert.strictEqual(from({ note: '[하나은행] 4월 관리비' }), 'ledger');
  assert.strictEqual(from({ note: '[하나카드] 주유' }), 'ledger');
});

test('손으로 넣은 건에는 안 붙인다', () => {
  assert.strictEqual(from({ payee: '○○빌딩', note: '4월 월세' }), '');
  assert.strictEqual(from({}), '');
  assert.strictEqual(from(null), '');
});

test('비고 «가운데» 에 있는 글자에는 안 속는다', () => {
  /* 사람이 적은 메모에 그 낱말이 들어갈 수 있다 — 머리글자일 때만 본다 */
  assert.strictEqual(from({ note: '작년에 [하나은행] 에서 옮김' }), '');
});

test('거래내역이 출금을 저장할 때 표를 남긴다', () => {
  const se = cut('function saveExpense(row, cat){', '\n  }');
  assert.strictEqual(/src:'ledger'/.test(se), true);
});

/* ── 머리 영역 ── */
const EXP = cut('function FinanceExpense(){', 'function LastMonthCopyModal(');
const EXPCODE = EXP.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('도구줄이 월 네비와 같은 줄에 있다 — 세 줄을 두 줄로', () => {
  /* MonthKpiHeader 의 extra 자리에 넣어야 월 네비와 한 줄이 된다 */
  assert.strictEqual(/kpiOwnRow:\s*true/.test(EXPCODE), true, 'KPI 를 아랫줄로 내리지 않았다');
  assert.strictEqual(/extra:\s*h\('div'/.test(EXPCODE), true, '도구줄을 월 네비 줄에 안 넣었다');
});

test('검색이 도구줄 안에 있다', () => {
  /* 지점 줄이 사라져 갈 곳이 없다 — 도구줄 오른쪽 끝에 둔다 */
  const ex = EXPCODE.slice(EXPCODE.indexOf('extra:'), EXPCODE.indexOf('kpis:'));
  assert.strictEqual(/지급처·비고 검색/.test(ex), true);
});

test('「정기」 단추를 도구줄에서 뺐다 — KPI 카드와 중복이었다', () => {
  const ex = EXPCODE.slice(EXPCODE.indexOf('extra:'), EXPCODE.indexOf('kpis:'));
  assert.strictEqual(/'🔁 정기'/.test(ex), false, '도구줄에 정기 단추가 남아 있다');
});

test('KPI 「정기」는 눌리고, 눌리는 줄 알 수 있다', () => {
  /* ★ 눌리는 줄 모르면 기능을 잃는 것이다 — 이 저장소에서 다섯 번 겪었다 */
  const k = EXPCODE.slice(EXPCODE.indexOf("label:'🔁 정기'"), EXPCODE.indexOf("label:'🔁 정기'") + 300);
  assert.strictEqual(/onClick:function\(\)\{setShowRecurring\(true\);\}/.test(k), true);
  assert.strictEqual(/눌러서/.test(k), true, '눌리는 것임을 안 알려 준다');
});

test('들여오는 길이 한 입구로 모였다', () => {
  const ex = EXPCODE.slice(EXPCODE.indexOf('extra:'), EXPCODE.indexOf('kpis:'));
  // 도구줄에 「일괄」·「카드엑셀」 단추가 따로 없다
  assert.strictEqual(/'📋 일괄'/.test(ex), false, '일괄 단추가 도구줄에 남아 있다');
  assert.strictEqual(/'💳 카드엑셀'/.test(ex), false, '카드엑셀 단추가 도구줄에 남아 있다');
  // 대신 메뉴 안에서 셋을 다 연다 — 기능을 없앤 것이 아니다
  assert.strictEqual(/setShowImport\(true\)/.test(ex), true, '거래내역 길이 사라졌다');
  assert.strictEqual(/setShowBulk\(true\)/.test(ex), true, '붙여넣기 길이 사라졌다');
  assert.strictEqual(/setShowCardImport\(true\)/.test(ex), true, '카드엑셀 길이 사라졌다');
});

test('자주 쓰는 단추는 그대로 있다', () => {
  /* 대표가 「네 묶음 모두 자주 쓴다」고 하셨다 — 감추면 안 된다 */
  const ex = EXPCODE.slice(EXPCODE.indexOf('extra:'), EXPCODE.indexOf('kpis:'));
  ['출금 추가', '가져오기', '지난달', '예산', '수수료', 'CSV', '마감'].forEach(function (w) {
    assert.strictEqual(ex.indexOf(w) >= 0, true, w + ' 가 사라졌다');
  });
});

test('지점 줄은 자료가 있는 지점이 둘 이상일 때만 나온다', () => {
  /* 서산 0·공통 0 이면 「전체 25건」과 「천안 25건」이 같은 숫자를 두 번 적는다 */
  assert.strictEqual(/Object\.keys\(_kinds\)\.length < 2/.test(EXPCODE), true);
});

/* ── 거래내역을 출금 탭으로 ── */
test('출금관리에서 여는 거래내역은 출금 탭이다', () => {
  const im = EXPCODE.slice(EXPCODE.indexOf('showImport && h(ImportLedgerModal'), EXPCODE.indexOf('showImport && h(ImportLedgerModal') + 200);
  assert.strictEqual(/initialTab:'exp'/.test(im), true);
});

test('창이 그 값을 거래내역에 넘긴다', () => {
  const md = cut('function ImportLedgerModal(props){', '\n}');
  assert.strictEqual(/h\(FinanceLedger, \{ initialTab:props\.initialTab/.test(md), true);
});

test('기억된 탭을 덮어쓰지 않는다', () => {
  /* ★ 덮어쓰면 다음에 거래내역을 직접 열 때까지 바뀐 채로 남는다.
     이번 창에서만 통하는 덮개를 두고, 사람이 탭을 누르면 걷는다. */
  const lg = cut("var ldTabS=usePersistedState('ledger_tab','inc');", 'var upAtS');
  assert.strictEqual(/ldOvS\[0\] \|\| ldTabS\[0\]/.test(lg), true, '덮개가 없다');
  assert.strictEqual(/function setLdTab\(v\)\{ ldOvS\[1\]\(''\);/.test(lg), true, '탭을 눌러도 덮개가 안 걷힌다');
});

/* ── 목록 딱지 ── */
test('목록에 「거래내역」 딱지가 붙는다', () => {
  assert.strictEqual(/erpExpenseFrom\(it\) === 'ledger'/.test(EXPCODE), true);
  assert.strictEqual(/'🏦 거래내역'/.test(EXPCODE), true);
});

/* ── 다른 화면을 안 건드린다 ── */
test('MonthKpiHeader 의 새 옵션은 기본값이 지금과 같다', () => {
  /* ★ 이 부품은 여러 화면이 함께 쓴다 — 옵션을 안 주면 예전 그대로여야 한다 */
  const mk = cut('function MonthKpiHeader(props){', 'function Sidebar(props){');
  assert.strictEqual(/!props\.kpiOwnRow &&/.test(mk), true, '기본값이 바뀌었다');
  const others = (CODE.match(/h\(MonthKpiHeader, \{/g) || []).length;
  const optedIn = (CODE.match(/kpiOwnRow:\s*true/g) || []).length;
  assert.ok(others > optedIn, '모든 화면이 새 옵션을 켜 버렸다 (' + optedIn + '/' + others + ')');
});
