/* 「이 돈, 통장에 이미 들어와 있나」 — 미입금 대기에서 확정 «전에» 보이게
   (2026-08-13 대표 지시) 63건을 하나씩 열어 보지 않고도
   몇 건이 이미 들어와 있는지 알 수 있어야 한다.
   통장 자료는 서버에 함께 있으므로(ledger_batches) 입금관리에서도 그대로 읽는다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}
const ctx = { console, Math, Object, JSON, parseInt, parseFloat, String, Date, isFinite, Array };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if(a < 0 || b < 0) throw new Error('소스에서 못 찾음: ' + from);
  return src.slice(a, b);
};
// 이름·금액 맞대기는 소스의 진짜 함수로 (거래내역 자동매칭과 같은 기준이어야 한다)
vm.runInContext(grab('function erpNormName(', '\nfunction erpCleanMemo'), ctx);
vm.runInContext(grab('function erpCleanMemo(', '\n// ── 입금자 별칭 학습'), ctx);
vm.runInContext(grab('function erpMatchScore(', '\nfunction erpMatchTxnToPending'), ctx);
vm.runInContext(grab('function erpExpectAmount(fee, taxType, paidAmt){', '\n/* ══════════ 「이 돈, 통장에 이미'), ctx);
vm.runInContext(grab('function erpBankHitIndex(rows){', "\nif(typeof window !== 'undefined'){\n  window.erpUnpaidParts"), ctx);

console.log('\n■ 통장에 들어올 예상 금액');
t('부가세 별도 — 공급가 ×1.1', ctx.erpExpectAmount(1000000, false, 0), 1100000);
t('부가세 포함 — 그대로', ctx.erpExpectAmount(1100000, true, 0), 1100000);
t('원천징수 3.3% — ×0.967', ctx.erpExpectAmount(1000000, 'wht33', 0), 967000);
t('이미 받은 만큼 뺀다', ctx.erpExpectAmount(1000000, true, 400000), 600000);
t('다 받았으면 0', ctx.erpExpectAmount(1000000, true, 1000000), 0);
t('더 받았어도 음수는 안 만든다', ctx.erpExpectAmount(1000000, true, 1500000), 0);

// ── 실화면 값으로 (김보람 제보 캡쳐 + 미입금 대기 캡쳐) ──
const BANK = [
  { _k:'r1', src:'bank', date:'2026-01-28', memo:'이현아',               amount:1000000 },
  { _k:'r2', src:'bank', date:'2026-01-29', memo:'(자)천안청화공사',      amount:1100000 },
  { _k:'r3', src:'bank', date:'2026-01-20', memo:'계룡시청소년상담복지', amount:300000  },
  { _k:'r4', src:'bank', date:'2026-01-31', memo:'엠비프라텍',           amount:1100000 },
  { _k:'r5', src:'bank', date:'2026-02-02', memo:'더빌이체3572',         amount:1408000 }
];
const idx = ctx.erpBankHitIndex(BANK);
const hit = (name, amount, used) =>
  ctx.erpBankHitFor({ companyName:name, amount:amount, item:{}, kind:'balance' }, idx, used || {});

console.log('\n■ 이름 + 금액이 모두 맞아야 내준다');
t('이름·금액 모두 맞음', (hit('웅천새마을금고', 1100000) || {}).row === undefined ? null : true, null);
t('이름이 맞으면 찾는다 — (자)천안청화공사',
  ((hit('(자)천안청화공사', 1100000) || {}).row || {})._k, 'r2');
t('금액도 딱 맞으면 exact', (hit('(자)천안청화공사', 1100000) || {}).state, 'exact');
// ★ 이게 핵심 — 금액만 같은 줄을 내주면 매달 같은 금액을 내는 곳에 엉뚱하게 붙는다
t('금액만 같고 이름이 다르면 안 내준다', hit('전혀다른회사', 1100000), null);
t('이름은 같은데 금액이 크게 다르면 안 내준다', hit('(자)천안청화공사', 5000000), null);

console.log('\n■ 모자람·넘침을 가른다');
t('30,000 모자람 — state', (hit('엠비프라텍', 1130000) || {}).state, 'short');
t('30,000 모자람 — 차이', (hit('엠비프라텍', 1130000) || {}).diff, -30000);
t('넘치면 over', (hit('엠비프라텍', 1090000) || {}).state, 'over');

console.log('\n■ 한 통장 줄이 두 건에 붙지 않는다');
t('이미 다른 건이 쓴 줄은 건너뛴다', hit('(자)천안청화공사', 1100000, { r2:1 }), null);
// 금액이 딱 맞는 쪽이 먼저 가져간다 — 나중 건이 채 가면 앞 건이 「안 들어옴」 이 된다
const all = ctx.erpBankHitsForAll([
  { key:'A', companyName:'엠비프라텍', amount:1090000, item:{}, kind:'balance' },   // 넘침
  { key:'B', companyName:'엠비프라텍', amount:1100000, item:{}, kind:'balance' }    // 딱 맞음
], BANK);
t('딱 맞는 B 가 그 줄을 가져간다', (all.B && all.B.row._k), 'r4');
t('넘치는 A 는 못 가져간다', all.A === undefined || all.A === null, true);

console.log('\n■ 통장 줄 읽어오기 — 이미 쓴 줄은 뺀다');
t('erpBankIncomeRows 가 처리된 줄을 뺀다',
  /var pk = erpBankRowKey\(row\);\n\s*if\(pk && pst\[pk\]\) return;/.test(src), true);
t('출금 줄은 안 본다', /if\(!x \|\| x\.type === 'expense'\) return;/.test(src), true);
t('서버에 함께 있는 묶음을 읽는다', /erpBatchRows\(dbGet\(LEDGER_BATCH_KEY, \[\]\) \|\| \[\]\)/.test(src), true);

console.log('\n■ 화면 — 확정 «전에» 보이는가');
t('미입금 대기에 「통장」 칸이 있다', /'💰 통장 ↕'/.test(src), true);
t('머리에 「통장에 들어온 것 (N)」 을 센다', /'💰 통장에 들어온 것 \(' \+ n \+ '\)'/.test(src), true);
t('통장에 들어온 줄은 확정 단추가 초록', /background:hit\?'#16a34a':'#1e40af'/.test(src), true);
t('그 단추를 누르면 통장 날짜로 창이 열린다', /if\(hit\)\{ openFromBank\(p, hit\); return; \}/.test(src), true);
// 문구는 바뀔 수 있다 — 지켜야 할 것은 「근거(날짜·금액·적요)를 보여주는가」 이다
t('확정창이 어디서 가져온 날짜인지 밝힌다',
  /confirmModal\.bankRow[\s\S]{0,600}?통장에서 가져온 날짜입니다[\s\S]{0,400}?적요/.test(src), true);
t('못 찾았으면 오늘이라고 밝힌다', /통장에서 못 찾았습니다[\s\S]{0,40}오늘 날짜/.test(src), true);
t('날짜 칸이 통장에서 왔으면 초록으로 물든다',
  /confirmModal\.bankRow \? \{borderColor:'#bbf7d0',background:'#f0fdf4'/.test(src), true);
t('부분입금이 목록에 보인다', /'◐ '\+p\.paidSoFar\.toLocaleString\(\)\+' 받음 · '/.test(src), true);

console.log('\n■ 두 번 확정되지 않게');
t('통장 줄로 확정하면 «처리됨» 을 찍는다',
  /var _usedRow = \(_fromLedger && _fromLedger\.row\) \|\| \(confirmModal && confirmModal\.bankRow\) \|\| null;[\s\S]{0,200}?erpMarkBankRowProcessed\(_usedRow, 'income'/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
