/* 기금 회계장부 엔진 회귀 — 분개 → 계정별원장 → 시산표 → 재무제표
 *
 * fund.html 은 단일 파일이라 함수를 import 할 수 없다. 그래서 원문에서 함수 본문을
 * 그대로 오려 new Function 으로 올려 **실제 코드**를 돌린다(사본을 만들지 않는다).
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개 배포된다(https://nabaho.github.io/pureunall/…).
 *    실제 기금명·금액을 쓰지 말 것 — 여기 자료는 전부 가짜다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let depth = 0, started = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { depth++; started = true; }
    else if (SRC[j] === '}') { depth--; if (started && !depth) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
/* 상수 선언을 통째로 오려 온다. 정규식으로 한 줄만 집으면 다른 세션이 줄바꿈을
   추가하는 순간 조용히 깨지므로(2026-08-15 실제로 ACCT_CHART 가 여러 줄이 됐다),
   여는 괄호와 짝이 맞는 닫는 괄호까지 센다. */
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  const open = SRC.indexOf(SRC[SRC.indexOf('=', i) + 1], SRC.indexOf('=', i) + 1);
  let depth = 0, started = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ']') { depth--; if (started && !depth) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

/* 장부 함수들을 한 상자에 올린다 */
function loadLedger() {
  const box = {};
  new Function([
    /* ⚠ 계정 이름표를 하나라도 빠뜨리면 ReferenceError 로 통째로 멎는다
       (ADMIN_ACCTS 가 결산 셈에 들어왔는데 여기 안 넣어 두어 깨졌다, 2026-08-25) */
    grabDecl('ACCT_CHART'), grabDecl('PURPOSE_ACCTS'), grabDecl('OPEN_ACCT'),
    grabDecl('ADMIN_ACCTS'),
    grabDecl('RESERVE_ACCTS'),
    'var funds={}, S={fundId:"F1", year:2025};',
    'function num(v){ if(v==null) return 0; var n=parseFloat(String(v).replace(/[^0-9.\\-]/g,"")); return isNaN(n)?0:n; }',
    /* journalOf 는 복합분개(_splitsOf/expandSplits)를 거쳐 간다 — 딸린 함수도 같이 올린다.
       fund.html 이 자라면서 의존이 늘 수 있으므로, 없으면 여기서 바로 알려 준다. */
    grabFn('acctType'), grabFn('isDrAcct'), grabFn('_openingOf'),
    grabFn('_splitsOf'), grabFn('expandSplits'),
    grabFn('journalOf'), grabFn('acctMoves'), grabFn('openingMoves'),
    grabFn('tbRowsOf'), grabFn('computeFin'),
    'this.funds=funds; this.S=S;',
    'this.isDrAcct=isDrAcct; this.journalOf=journalOf; this.acctMoves=acctMoves;',
    'this.openingMoves=openingMoves; this.tbRowsOf=tbRowsOf; this.computeFin=computeFin;',
    'this.setFund=function(id,o){ funds[id]=o; };'
  ].join('\n')).call(box);
  return box;
}

/* 가짜 기금 한 곳의 1년치 — 전기이월은 대차가 맞아야 한다(자산 510만 = 기본재산 500만 + 이월 10만) */
const OPENING = { cash: 5100000, basic: 5000000, retained: 100000 };
const TXNS = [
  { _id: 't1', date: '2025-03-10', memo: '사업주 출연금', deposit: 40000000, debit: '현금성자산', credit: '기본재산', approved: true },
  { _id: 't2', date: '2025-04-20', memo: '○○도청 지원금', deposit: 20000000, debit: '현금성자산', credit: '기본재산', approved: true },
  { _id: 't3', date: '2025-06-30', memo: '장학금 지급', withdraw: 6000000, debit: '장학금', credit: '현금성자산', approved: true },
  { _id: 't4', date: '2025-08-01', memo: '경조금', withdraw: 2500000, debit: '경조사비', credit: '현금성자산', approved: true },
  { _id: 't5', date: '2025-11-11', memo: '이체수수료', withdraw: 220000, debit: '지급수수료', credit: '현금성자산', approved: true },
  { _id: 't6', date: '2025-12-28', memo: '보통예금 이자', deposit: 412000, debit: '현금성자산', credit: '이자수익', approved: true },
  { _id: 't7', date: '2025-12-29', memo: '아직 승인 안 함', withdraw: 500000, debit: '경조사비', credit: '현금성자산', approved: false },
  { _id: 't8', date: '2025-12-30', memo: '계정 미지정', withdraw: 700000, approved: true }
];
function ready() {
  const box = loadLedger();
  box.setFund('F1', { name: '가짜공동근로복지기금', years: { 2025: { opening: OPENING }, 2024: { opening: {} } } });
  return box;
}

test('분개장은 승인되고 계정이 지정된 거래만 담는다', () => {
  const jr = ready().journalOf(TXNS);
  assert.equal(jr.length, 6, '미승인·계정미지정 2건은 빠져야 한다');
  assert.ok(!jr.some(e => e.id === 't7'), '미승인 거래가 새어 들어왔다');
  assert.ok(!jr.some(e => e.id === 't8'), '계정 미지정 거래가 새어 들어왔다');
  for (let i = 1; i < jr.length; i++) assert.ok(jr[i - 1].date <= jr[i].date, '일자순이 아니다');
});

test('계정 성격이 차변/대변 방향을 정한다', () => {
  const b = ready();
  assert.equal(b.isDrAcct('현금성자산'), true, '자산은 차변');
  assert.equal(b.isDrAcct('경조사비'), true, '비용은 차변');
  assert.equal(b.isDrAcct('기본재산'), false, '자본은 대변');
  assert.equal(b.isDrAcct('이자수익'), false, '수익은 대변');
  assert.equal(b.isDrAcct('고유목적사업준비금1'), false, '부채는 대변');
  assert.equal(b.isDrAcct('듣도보도못한계정'), true, '모르는 계정은 비용(차변)으로 본다');
});

test('전기이월이 계정별 차·대로 환산된다', () => {
  const om = ready().openingMoves(OPENING);
  assert.equal(om['현금성자산'].d, 5100000);
  assert.equal(om['현금성자산'].c, 0);
  assert.equal(om['기본재산'].c, 5000000);
  assert.equal(om['이월잉여금'].c, 100000);
  assert.ok(!('정기예금' in ready().openingMoves({ savings: 0 })), '0 인 항목은 만들지 않는다');
});

test('계정별 발생액이 분개와 일치한다', () => {
  const b = ready(), mv = b.acctMoves(b.journalOf(TXNS));
  assert.equal(mv['현금성자산'].d, 60412000, '입금 = 출연 6,000만 + 이자 41.2만');
  assert.equal(mv['현금성자산'].c, 8720000, '출금 = 600만 + 250만 + 22만');
  assert.equal(mv['기본재산'].c, 60000000);
  assert.equal(mv['장학금'].d, 6000000);
  assert.equal(mv['이자수익'].c, 412000);
});

test('합계잔액시산표는 차·대가 반드시 맞는다', () => {
  const rows = ready().tbRowsOf(TXNS, 'F1', 2025);
  const t = rows.reduce((a, r) => ({
    sumD: a.sumD + r.sumD, sumC: a.sumC + r.sumC, balD: a.balD + r.balD, balC: a.balC + r.balC
  }), { sumD: 0, sumC: 0, balD: 0, balC: 0 });
  assert.equal(t.sumD, t.sumC, '차변합계 ≠ 대변합계');
  assert.equal(t.balD, t.balC, '차변잔액 ≠ 대변잔액');
  const cash = rows.find(r => r.name === '현금성자산');
  assert.equal(cash.sumD, 65512000, '전기이월이 합계에 포함되어야 한다');
  assert.equal(cash.balD, 56792000, '현금 잔액 = 이월 + 입금 − 출금');
  assert.ok(rows.every(r => !(r.balD > 0 && r.balC > 0)), '한 계정이 차·대 잔액을 동시에 가질 수 없다');
  const order = { 자산: 1, 부채: 2, 자본: 3, 수익: 4, 비용: 5 };
  for (let i = 1; i < rows.length; i++) {
    assert.ok(order[rows[i - 1].type] <= order[rows[i].type], '자산→부채→자본→수익→비용 순이 아니다');
  }
});

test('재무제표가 대차 일치하고, 연도별로 따로 계산된다', () => {
  const b = ready();
  const cur = b.computeFin(TXNS, 'F1', 2025);
  assert.equal(cur.balanced, true, '대차가 맞지 않는다: ' + cur.totalAssets + ' vs ' + cur.totalLiabEq);
  assert.equal(cur.cash, 56792000);
  assert.equal(cur.basic, 65000000, '기본재산 = 이월 500만 + 출연 6,000만');
  assert.equal(cur.purpose, 8500000, '목적사업비 = 장학 600만 + 경조 250만');
  assert.equal(cur.admin, 220000);
  /* ⚠ 2026-09-02: interest 는 «없앴다» — 수익 계정 셋(이자수익·잡수익·준비금환입)을
     묶은 값이라 이자수익도 사업수익도 아니었다. 그 값은 bizRev 로 옮겨졌다
     (fund.html computeFin 의 그 자리 주석에 까닭이 적혀 있다). 검사고정-허용:
     412,000원은 위 TXNS 표본에서 나오는 «규칙»이다(이자 40만 + 잡수익 1만2천). */
  assert.equal(cur.bizRev, 412000);
  assert.equal(cur.interest, undefined,
    'interest 가 되살아났다 — 그 값은 이자수익도 사업수익도 아니라 없앤 것이다');
  assert.equal(cur.net, 412000 - 8500000 - 220000);

  const prev = b.computeFin([], 'F1', 2024);
  assert.equal(prev.totalAssets, 0, '자료 없는 연도는 0');
  assert.equal(prev.appr, 0);
  assert.equal(cur.opening.cash, 5100000, '연도별로 다른 전기이월을 읽어야 한다');
  assert.ok(!prev.opening.cash, '2024 년에는 전기이월이 없다');
});

test('전기이월이 안 맞으면 숨기지 않고 대차 불일치로 드러낸다', () => {
  const box = loadLedger();
  box.setFund('F1', { years: { 2025: { opening: { cash: 3000000, basic: 5000000 } } } });   // 일부러 200만 어긋남
  const fin = box.computeFin(TXNS, 'F1', 2025);
  assert.equal(fin.balanced, false, '어긋난 이월을 조용히 맞춰 버리면 안 된다');
});

test('장부 화면 배선 — 하위 탭과 경합 가드가 살아 있다', () => {
  assert.match(SRC, /var CLOSE_SUBS=\[\['txn'/, '회계 하위 탭 정의가 없다');
  ['journal', 'ledger', 'monthly', 'tb', 'fin', 'years', 'f15'].forEach(k => {
    assert.ok(SRC.includes("['" + k + "',"), '하위 탭 누락: ' + k);
  });
  assert.match(SRC, /if\(S\.txnsPrevFor===key\) return;/, '전기 로딩 중복 호출 가드가 없다');
  assert.match(SRC, /if\(S\.txnsPrevFor!==key\) return;/, '전기 응답 경합 가드가 없다');
  assert.match(SRC, /function computeFin\(arr,fid,yr\)/, 'computeFin 이 연도 파라미터를 받지 않는다');
});
