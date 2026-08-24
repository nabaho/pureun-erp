/* 별지 제15호 운영상황보고서 산출 회귀
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·금액 금지. 여기 자료는 전부 가짜다.
 *
 * 실제 제출본과 대조해 얻은 규칙 두 가지를 여기서 지킨다:
 *  ① ㉑ 금융회사 예입은 '현금 잔액'이 아니라 **기본재산 운용 내역**이다(㉘ 합계 = ⑳).
 *  ② 기금은 사업자등록번호가 없다 — 고유번호로 계산서를 받는다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

function load() {
  const box = {};
  new Function([
    grabDecl('ACCT_CHART'), grabDecl('PURPOSE_ACCTS'), grabDecl('OPEN_ACCT'),
    grabDecl('RESERVE_ACCTS'), grabDecl('F15_ROWS'), grabDecl('BF_KINDS'),
    'var funds={}, S={fundId:"F1", year:2025};',
    'function num(v){ if(v==null) return 0; var n=parseFloat(String(v).replace(/[^0-9.\\-]/g,"")); return isNaN(n)?0:n; }',
    grabFn('acctType'), grabFn('isDrAcct'), grabFn('_openingOf'),
    grabFn('_splitsOf'), grabFn('expandSplits'), grabFn('journalOf'), grabFn('acctMoves'),
    grabFn('openingMoves'), grabFn('computeFin'), grabFn('guessBfKind'), grabFn('_k1000'),
    // ㉚ 는 그 해 «현금» 출연금을 상한으로 삼는다 — 그 값을 세는 함수도 함께 들여온다
    grabFn('_txnDone'), grabFn('_splitSum'), grabFn('_contribOf'),
    grabFn('_openAssets'), grabFn('bfMovesOf'), grabFn('buildF15'),
    'this.buildF15=buildF15; this.guessBfKind=guessBfKind; this._k1000=_k1000;',
    'this.F15_ROWS=F15_ROWS; this.BF_KINDS=BF_KINDS;',
    'this.setFund=function(id,o){ funds[id]=o; };'
  ].join('\n')).call(box);
  return box;
}

/* 가짜 기금 — 출연 3건(사업주 1 / 사업주 외 2), 복지비 1건, 운영비 1건, 이자 1건 */
const TXNS = [
  { _id: 'a1', date: '2025-06-10', memo: '사업주 출연금', deposit: 248400000, debit: '현금성자산', credit: '기본재산', approved: true },
  { _id: 'a2', date: '2025-07-15', memo: '○○도청 지원금 출연', deposit: 372600000, debit: '현금성자산', credit: '기본재산', approved: true },
  { _id: 'a3', date: '2025-08-20', memo: '근로복지공단 지원금', deposit: 465750000, debit: '현금성자산', credit: '기본재산', approved: true },
  { _id: 'a4', date: '2025-11-30', memo: '복지포인트 지급', withdraw: 496800000, debit: '기타복지비', credit: '현금성자산', approved: true },
  { _id: 'a5', date: '2025-12-05', memo: '기금 운영 지급수수료', withdraw: 32868000, debit: '지급수수료', credit: '현금성자산', approved: true },
  { _id: 'a6', date: '2025-12-28', memo: '보통예금 이자', deposit: 156000, debit: '현금성자산', credit: '이자수익', approved: true }
];
const SITES = [
  { name: '가사', company_size: 300 }, { name: '나사', company_size: 221 },
  { name: '다사', company_size: 100 }, { name: '라협력', company_size: 40, partner: true }
];
const WELF = [
  { category: '기타복지비', spent: 496800000, beneficiaries: 621 },
  { category: '대부사업', spent: 0, beneficiaries: 0 }
];
function build(rep) {
  const box = load();
  box.setFund('F1', {
    name: '가짜공동근로복지기금', fund_type: '공동',
    inka_no: '제 0000-2025-1 호', reg_date: '2025-05-23', phone: '000-000-0000',
    address: '○○도 ○○시 ○○로 1', chairman: '홍길동',
    years: { 2025: { opening: {} } }
  });
  return { box, R: box.buildF15(TXNS, 'F1', 2025, rep || { use_ratio: '80', biz_type: '제조업' }, SITES, WELF) };
}

test('머리부는 기금 정보와 참여사업장에서 나온다', () => {
  const { R } = build();
  assert.equal(R.head.name, '가짜공동근로복지기금');
  assert.equal(R.head.inka, '제 0000-2025-1 호');
  assert.equal(R.head.ceo, '홍길동');
  assert.equal(R.head.biz, '제조업', '입력한 업종이 우선한다');
  assert.equal(R.head.workers, 621, '⑨ 근로자 수 = 협력 제외 3사 합');
  assert.equal(R.head.partner, 40, '⑩ 협력업체 근로자 수는 따로 센다');
  assert.equal(R.head.type, '공동');
});

test('기본재산 변동은 적요로 사업주/사업주 외를 가른다', () => {
  const { box, R } = build();
  const K = box._k1000;
  assert.equal(K(R.bf.employer), 248400, '⑬ 사업주 출연');
  assert.equal(K(R.bf.other), 838350, '⑮ 사업주 외의 자 출연(도청+공단)');
  assert.equal(box.guessBfKind({ memo: '○○도청 지원금 출연', credit: '기본재산' }), 'other');
  assert.equal(box.guessBfKind({ memo: '근로복지공단 지원금', credit: '기본재산' }), 'other');
  assert.equal(box.guessBfKind({ memo: '사업주 출연금', credit: '기본재산' }), 'employer');
  assert.equal(box.guessBfKind({ memo: '무엇이든', debit: '기본재산' }), 'use', '기본재산 차변은 ⑰ 사용');
  assert.equal(R.bfEnd, R.bfOpen + R.bfInc - R.bfDec, '⑳ = ⑫ + 증 − 감');
  assert.equal(R.bfList.length, 3, '기본재산이 걸린 분개만 잡는다');
});

test('사람이 고친 구분이 자동 추정을 이긴다', () => {
  const { box } = build();
  const R2 = box.buildF15(TXNS, 'F1', 2025, { bf: { a2: 'employer' } }, SITES, WELF);
  assert.equal(box._k1000(R2.bf.employer), 248400 + 372600);
});

test('㉑ 금융회사 예입은 현금 잔액이 아니라 기본재산 운용 내역이다', () => {
  const { box, R } = build();
  assert.equal(R.run.loan, 0, '이 표본에는 대부금이 없다 — 아래 두 줄의 전제');
  assert.equal(R.run.total, R.bfEnd, '대부가 없으면 ㉘ 합계 = ⑳ 기본재산 총액');
  assert.equal(R.run.deposit, R.bfEnd, '㉑ = 기본재산 − 운용상품');

  /* 대부가 있으면 구조가 드러난다 — 확정 제출본에서
       ㉑ 예입 674,108천(= ⑳) + ㉗ 근로자 대부 239,720천 = ㉘ 합계 913,828천
     대부금은 예입에서 빼지 않고 따로 더한다. 빌려준 돈은 기본재산을 헐어 나간 것이 아니라
     그 자체가 기금 자산이기 때문이다. */
  const withLoan = TXNS.concat([
    { _id: 'a8', date: '2025-11-30', memo: '근로자 대부', withdraw: 50000000, amount: 50000000,
      debit: '근로자대부금', credit: '현금성자산', approved: true }
  ]);
  const RL = box.buildF15(withLoan, 'F1', 2025, {}, SITES, WELF);
  assert.equal(RL.run.loan, 50000000);
  assert.equal(RL.run.deposit, RL.bfEnd, '대부는 예입을 줄이지 않는다');
  assert.equal(RL.run.total, RL.bfEnd + 50000000, '㉘ = ⑳ + 대부금');

  const R2 = box.buildF15(TXNS, 'F1', 2025, { run_trust: '100000000' }, SITES, WELF);
  assert.equal(R2.run.trust, 100000000);
  assert.equal(R2.run.deposit, R2.bfEnd - 100000000, '신탁으로 뺀 만큼 예입이 줄어야 한다');
  assert.equal(R2.run.total, R2.bfEnd, '합계는 그대로 기본재산');

  const R3 = box.buildF15(TXNS, 'F1', 2025, { run_etc: '99999999999' }, SITES, WELF);
  assert.equal(R3.run.deposit, 0, '운용수단 합이 기본재산을 넘어도 음수가 되면 안 된다');
});

/* ㉚ 은 '출연금 × 한도비율'이 아니다.
   협의회가 한도보다 적게 정한 해에는 그 값이 틀린다 — 실제 제출본에서 ⑰ = ㉚ 이었다.
   그 해 기본재산에서 준비금2로 옮긴 금액(=⑰ 기본재산 사용)이 곧 그 해 쓰기로 정한 재원이다. */
test('㉚ 은 그 해 기본재산 사용액(⑰)과 같다 — 출연금×비율이 아니다', () => {
  const { box } = build();
  const withUse = TXNS.concat([
    { _id: 'a7', date: '2025-12-31', memo: '준비금2 전입', withdraw: 0, amount: 300000000,
      debit: '기본재산', credit: '고유목적사업준비금2', approved: true }
  ]);
  const R = box.buildF15(withUse, 'F1', 2025, {}, SITES, WELF);
  assert.ok(R.bf.use > 0, '기본재산 차변이 ⑰ 사용으로 잡혀야 한다');
  assert.equal(R.src.contrib, R.bf.use, '㉚ = ⑰ 기본재산 사용액');
  assert.notEqual(R.src.contrib, Math.round((R.bf.employer + R.bf.other) * 0.5),
    '출연금 × 50% 로 잡으면 안 된다');

  /* ⑱ 분할은 딴 기금으로 재산이 넘어간 것이지 이 기금이 쓰기로 정한 재원이 아니다.
     감소액(⑰+⑱)으로 잡으면 분할한 해에 ㉚ 가 그만큼 부푼다. */
  const R2 = box.buildF15(withUse, 'F1', 2025, { bf: { a7: 'split' } }, SITES, WELF);
  assert.ok(R2.bf.split > 0 && R2.bf.use === 0, '분할로 표시하면 ⑱ 로 간다');
  assert.equal(R2.src.contrib, 0, '㉚ 에 ⑱ 분할이 섞이면 안 된다');
  assert.equal(R2.bfDec, R2.bf.split, '⑱ 은 그대로 기본재산 감소이긴 하다');

  /* ⑰ 중에서도 «그 해 현금으로 들어온 출연금»까지만 ㉚ 다.
     쌓아 둔 기본재산에서 꺼내 쓴 몫은 ㉞ 이월금(전기말 자산총계)에 이미 들어 있어
     또 더하면 같은 돈을 두 번 센다 — 재원 ㉟ 이 그 해 있던 돈보다 커진다. */
  const big = TXNS.concat([
    { _id: 'a9', date: '2025-12-31', memo: '준비금2 전입', withdraw: 0, amount: 9000000000,
      debit: '기본재산', credit: '고유목적사업준비금2', approved: true }
  ]);
  const R3 = box.buildF15(big, 'F1', 2025, {}, SITES, WELF);
  assert.equal(R3.bf.use, 9000000000, '⑰ 은 실제 기본재산 사용액 그대로다');
  assert.equal(R3.src.contrib, R3.cashIn, '㉚ 는 그 해 현금출연을 넘지 않는다');
  assert.ok(R3.src.contrib < R3.bf.use, '넘는 몫은 ㉚ 에 들어가지 않는다');
  assert.equal(R3.srcOver, 0, '상한 덕분에 재원이 그 해 있던 돈을 안 넘는다');

  // ㉜ 를 사람이 채워 이월금 안의 돈을 또 적으면 — 앱이 고치지 않고 «넘쳤다»고 알린다
  const base = box.buildF15(TXNS, 'F1', 2025, {}, SITES, WELF);
  assert.equal(base.srcOver, 0, '평소에는 넘치지 않는다');
  const R4 = box.buildF15(TXNS, 'F1', 2025, { src_basic_range: '9000000000' }, SITES, WELF);
  assert.equal(R4.srcCap, base.srcCap, '사람이 적은 값은 천장을 바꾸지 않는다');
  assert.equal(R4.src.total, base.src.total + 9000000000, '적은 만큼 재원에 그대로 더해진다');
  assert.ok(R4.srcOver > 0, '넘쳤다는 것을 알아챈다');
  assert.equal(R4.srcOver, R4.src.total - R4.srcCap, '넘친 금액 = 재원 − 천장');
});

test('㉚·㉞ 는 수기 입력값이 있으면 그것을 먼저 쓴다', () => {
  const { box } = build();
  const R = box.buildF15(TXNS, 'F1', 2025, { src_contrib: '412000000', src_carry: '1000' }, SITES, WELF);
  assert.equal(R.src.contrib, 412000000);
  assert.equal(R.src.carry, 1000);
  assert.equal(R.src.total,
    R.src.income + R.src.contrib + R.src.capExcess + R.src.basicRange + R.src.support + R.src.carry,
    '㉟ 합계 = 항목 합');
});

/* 항목 번호는 서식 개정에 따라 바뀌었다(㊾~58 → 57~66). 번호로 찾으면 그때마다 깨지므로
   **항목명**으로 찾는다. 번호는 '연속인지'만 본다. */
test('사업실적은 목적사업 계정 → 법정 항목으로 모인다', () => {
  const { box, R } = build();
  const K = box._k1000;
  const byLabel = l => R.items.find(x => x.label === l);
  assert.ok(R.items.length >= 10, '복지사업 항목이 열 개 이상이어야 한다');
  const etc = byLabel('그 밖의 복지비');
  assert.ok(etc, '그 밖의 복지비 항목이 없다');
  assert.equal(K(etc.amt), 496800, '기타복지비 집행액이 모여야 한다');
  assert.equal(etc.cnt, 621, '수혜자수는 목적사업·대부 탭에서 온다');
  assert.equal(R.subAmt, R.items.reduce((s, x) => s + x.amt, 0), '소계 = 항목 합');
  assert.equal(K(R.admin), 32868, '기금 운영비');
  assert.equal(R.total, R.subAmt + R.loanAmt + R.admin + R.rest, '합계 = 소계+대부+운영비+잔액');
  /* 69.잔액은 재원에서 사업비·운영비만 뺀다 — 대부금은 나가도 기금 자산으로 남는다.
     대부금 항을 넣으면 대부가 이월된 이듬해에 거래가 없어도 잔액이 부푼다. */
  assert.equal(R.rest, R.src.total - (R.subAmt + R.admin), '69.잔액 = ㉟ − 소계 − 운영비');

  const rows = box.F15_ROWS;
  const etcRow = rows.find(r => r[1] === '그 밖의 복지비');
  assert.ok(etcRow[2].includes('경조사비'), '경조사비는 그 밖의 복지비로 모인다');
  const sports = rows.find(r => r[1].indexOf('체육') === 0)[2];
  assert.ok(sports.includes('체육문화비') && sports.includes('동호회비'), '체육항목은 체육비+동호회비');
  for (let i = 1; i < rows.length; i++) {
    assert.equal(Number(rows[i][0]), Number(rows[i - 1][0]) + 1, '항목 번호가 연속이 아니다: ' + rows[i][0]);
  }
});

test('법정 10항목이 참조하는 계정은 모두 계정과목표에 있다', () => {
  const { box } = build();
  const chart = grabDecl('ACCT_CHART');
  box.F15_ROWS.forEach(r => r[2].forEach(a => {
    assert.ok(chart.includes("'" + a + "'"), '계정과목표에 없는 계정을 참조한다: ' + a + ' (' + r[0] + '번)');
  }));
});

test('천원 환산은 반올림', () => {
  const { box } = build();
  assert.equal(box._k1000(1500), 2);
  assert.equal(box._k1000(1499), 1);
  assert.equal(box._k1000(0), 0);
});

test('보고서 화면 배선 — 저장 경로와 인쇄 서식', () => {
  assert.match(SRC, /ref\(NS\+'\/closing\/'\+fid\+'\/'\+yr\+'\/report'\)/, '보조 입력 저장 경로가 없다');
  assert.match(SRC, /report\/bf\/'\+id\)\.set\(kind\)/, '기본재산 구분은 한 칸만 갱신해야 한다');
  assert.match(SRC, /@page\{size:A4 portrait/, '별지15호는 A4 세로');
  assert.ok(SRC.includes('제93조제1항제3호'), '법 근거 문구가 빠졌다');
  assert.ok(!SRC.includes('function openForm15('), '옛 9행 요약표가 남아 있다');
});
