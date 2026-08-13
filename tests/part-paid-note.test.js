/* 목록에서 「일부만 받았다」 가 보여야 한다
   (2026-08-13 대표 지시) 다 받으면 「✓ 입금일」 이 뜨는데 일부만 받으면 아무 표시가 없었다.
   그래서 55만 받고도 사건·컨설팅 목록에는 110만이 통째로 미수인 것처럼 보였다.
   기납입을 보려면 입금확정 창을 열어야만 했다. */
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
const ctx = { console, Math, Object, JSON, parseInt, parseFloat, String };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return src.slice(i, j); };
vm.runInContext(grab('function erpPaidSoFar(item, kindLabel, legacyAmt){', '\n// 거래내역 후보 종류'), ctx);
vm.runInContext(grab('function erpPartPaidNote(item, splitLabel, legacyKey, fee){', "\nif(typeof window !== 'undefined') window.erpPartPaidNote"), ctx);
const note = ctx.erpPartPaidNote;

console.log('\n■ 일부만 받았을 때만 적는다');
t('절반 받음', note({ contractPaidAmount:550000 }, '계약금', 'contractPaidAmount', 1100000).text,
  '◐ 550,000 받음 · 550,000 남음');
t('하나도 안 받았으면 안 적는다', note({}, '계약금', 'contractPaidAmount', 1100000), null);
t('다 받았으면 안 적는다 — 그때는 ✓ 입금일이 뜬다',
  note({ contractPaidAmount:1100000 }, '계약금', 'contractPaidAmount', 1100000), null);
t('더 받았어도 안 적는다', note({ contractPaidAmount:1200000 }, '계약금', 'contractPaidAmount', 1100000), null);
t('약정액이 0이면 안 적는다', note({ contractPaidAmount:100 }, '계약금', 'contractPaidAmount', 0), null);
t('빈 자료도 안 터진다', note(null, '계약금', 'contractPaidAmount', 100), null);

console.log('\n■ 분할기록과 누계 중 큰 쪽을 본다 (두 화면에서 나눠 받아도 맞는다)');
t('분할기록만', note({ splitPayments:[{ kind:'잔금', amount:300000 }] }, '잔금', 'balancePaidAmount', 900000).paid, 300000);
t('누계만', note({ balancePaidAmount:400000 }, '잔금', 'balancePaidAmount', 900000).paid, 400000);
t('둘 다면 큰 쪽',
  note({ balancePaidAmount:400000, splitPayments:[{ kind:'잔금', amount:700000 }] }, '잔금', 'balancePaidAmount', 900000).paid, 700000);
t('다른 종류의 분할기록은 안 센다',
  note({ splitPayments:[{ kind:'계약금', amount:300000 }] }, '잔금', 'balancePaidAmount', 900000), null);
t('남은 돈도 함께', note({ balancePaidAmount:270000 }, '잔금', 'balancePaidAmount', 300000).left, 30000);

console.log('\n■ 네 자리 모두 붙었는가');
const spots = [
  ['사건 착수금',   /erpPartPaidNote\(c, '착수금', 'retainerPaidAmount', c\.retainerFee\)/],
  ['사건 성공보수', /erpPartPaidNote\(c, '성공보수', 'successPaidAmount', caseSuccessFeeAmount\(c\)\)/],
  ['컨설팅 계약금', /erpPartPaidNote\(it, '계약금', 'contractPaidAmount', it\.contractFee\)/],
  ['컨설팅 잔금',   /erpPartPaidNote\(it, '잔금', 'balancePaidAmount', it\.balanceFee\)/]
];
spots.forEach(function(s){ t(s[0], s[1].test(src), true); });
// 성공보수는 % 사건이 있다 — raw successFee 를 쓰면 「15원 중 0원 받음」 이 된다
t('성공보수는 실금액(caseSuccessFeeAmount)으로 잰다',
  /erpPartPaidNote\(c, '성공보수', 'successPaidAmount', c\.successFee\)/.test(src), false);
// 다 받은 줄에 두 표시가 겹치면 안 된다
t('다 받은 줄에는 안 붙인다 (✓ 와 겹치지 않게)',
  (src.match(/!retainerPaid && canSeeAmount\(c\) && \(function\(\)\{/g) || []).length, 1);
t('컨설팅도 마찬가지',
  (src.match(/canSeeAmount\(it\) && !it\.(contract|balance)Paid && \(function\(\)\{/g) || []).length, 2);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
