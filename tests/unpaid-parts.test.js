/* 「이 건에서 아직 안 받은 것」 — 두 화면이 같은 답을 본다
   (2026-08-13 대표 지적) 입금관리 «미입금 대기» 와 거래내역 «후보» 가 따로 판단해 어긋났다.
   실데이터로 재 보니 5건이 한쪽에만 있었다. 까닭은 셋:
     ① 다 받았나 — 입금관리는 «날짜» 만, 거래내역은 «표시+날짜» 를 봤다
     ② 접은 건 — 거래내역은 종료·영구보관을 뺐고 입금관리는 남겼다
        (사무관리에서 접었어도 못 받은 돈은 그대로다 → 입금관리 쪽이 옳다)
     ③ 성공보수 — 거래내역은 successFee 를 그대로 써서 % 사건이 「15원」 이 됐다
   이제 erpUnpaidParts 한 곳에서만 판단한다. */
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

const ctx = { console:console, Math:Math, Object:Object, JSON:JSON, parseInt:parseInt, parseFloat:parseFloat, String:String };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if(a < 0 || b < 0) throw new Error('소스에서 못 찾음: ' + from);
  return src.slice(a, b);
};
vm.runInContext(grab('function erpPaidSoFar(item, kindLabel, legacyAmt){', '\n// 거래내역 후보 종류'), ctx);
vm.runInContext(grab('function caseSuccessFeeAmount(c){', '\nwindow.caseSuccessFeeAmount'), ctx);
/* erpUnpaidParts 가 「여기까지로 닫은 것」 판정(erpClosedUnpaid)을 함께 쓰므로 둘 다 담는다.
   (2026-08-16 — 판정은 한 함수에만 두고 미입금 대기·거래내역·미수금관리가 그것만 본다) */
vm.runInContext(grab('function erpClosedUnpaid(it, splitLabel){', "\nif(typeof window !== 'undefined'){\n  window.erpUnpaidParts"), ctx);
const parts = ctx.erpUnpaidParts;
const tag = ctx.erpItemClosedTag;
const kinds = it => parts(it).map(p => p.kind);
const one = (it, k) => parts(it).filter(p => p.kind === k)[0] || null;

console.log('\n■ 안 받은 것만 골라낸다');
t('아무것도 없으면 빈 목록', parts({}), []);
t('null 도 안 터진다', parts(null), []);
t('지운 건은 안 올린다', parts({ _deleted:true, contractFee:100 }), []);
t('착수금·성공보수', kinds({ retainerFee:100, successFee:200 }), ['retainer', 'success']);
t('계약금·잔금', kinds({ contractFee:100, balanceFee:200 }), ['contractFee', 'balance']);
t('금액 0은 안 올린다', kinds({ retainerFee:0, contractFee:100 }), ['contractFee']);
t('옛 한 칸짜리 컨설팅비', kinds({ consultingFee:500 }), ['legacy']);

console.log('\n■ ① 다 받았나 — 표시든 날짜든 하나면 받은 것');
t('날짜가 찍혔으면 뺀다', kinds({ retainerFee:100, retainerPaidDate:'2026-01-02' }), []);
// 이 줄이 곧 입금관리가 놓치던 것 — 전에는 날짜만 봐서 표시만 찍힌 건이 계속 남았다
t('표시만 찍혔어도 뺀다', kinds({ retainerFee:100, retainerPaid:true }), []);
t('둘 다 찍혀도 뺀다', kinds({ retainerFee:100, retainerPaid:true, retainerPaidDate:'2026-01-02' }), []);
t('둘 다 없으면 남긴다', kinds({ retainerFee:100 }), ['retainer']);
t('잔금도 같은 규칙', kinds({ balanceFee:100, balancePaid:true }), []);
t('옛 컨설팅비도 같은 규칙', kinds({ consultingFee:100, paidDate:'2026-01-02' }), []);
t('한쪽만 받아도 나머지는 남는다',
  kinds({ contractFee:100, contractPaid:true, balanceFee:200 }), ['balance']);

console.log('\n■ ② 접은 건도 남긴다 — 돈은 아직 못 받았다');
t('종료된 건도 남긴다', kinds({ closedDate:'2026-03-01', balanceFee:900000 }), ['balance']);
t('영구보관된 건도 남긴다', kinds({ permanentArchived:true, balanceFee:900000 }), ['balance']);
t('종료는 표를 붙인다', tag({ closedDate:'2026-03-01' }).label, '종료');
t('영구보관도 표를 붙인다', tag({ permanentArchived:true }).label, '보관');
t('영구보관이 종료보다 앞선다', tag({ permanentArchived:true, closedDate:'2026-03-01' }).label, '보관');
t('멀쩡한 건에는 표가 없다', tag({ balanceFee:100 }), null);
t('null 도 안 터진다', tag(null), null);

console.log('\n■ ③ 성공보수 % — 15가 15원이 되지 않는다');
t('실화면 값 15% × 33,721,575',
  one({ successFeeType:'percent', successFee:15, judgmentAmount:33721575 }, 'success').fee, 5058236);
t('원 모드는 그대로', one({ successFeeType:'amount', successFee:3000000 }, 'success').fee, 3000000);
t('승소금액 미입력이면 안 올린다',
  one({ successFeeType:'percent', successFee:15, judgmentAmount:0 }, 'success'), null);

console.log('\n■ 이미 받은 돈 (부분입금)');
t('누계만 있는 옛 기록', one({ contractFee:1000, contractPaidAmount:400 }, 'contractFee').paid, 400);
t('분할기록', one({ contractFee:1000, splitPayments:[{ kind:'계약금', amount:300 }] }, 'contractFee').paid, 300);
t('둘 다 있으면 큰 쪽 — 두 화면에서 나눠 받아도 맞는다',
  one({ contractFee:1000, contractPaidAmount:400, splitPayments:[{ kind:'계약금', amount:700 }] }, 'contractFee').paid, 700);
t('다른 종류의 분할기록은 안 센다',
  one({ contractFee:1000, splitPayments:[{ kind:'잔금', amount:300 }] }, 'contractFee').paid, 0);
t('부분입금이어도 목록에는 남는다 — 잔액이 있으니까',
  kinds({ contractFee:1000, contractPaidAmount:400 }), ['contractFee']);

console.log('\n■ 세금 종류를 «날것 그대로» 실어 나른다');
t('계약금·착수금은 contractFeeVatIncluded',
  one({ retainerFee:100, contractFeeVatIncluded:true }, 'retainer').vatIncluded, true);
t('잔금·성공보수는 balanceFeeVatIncluded',
  one({ balanceFee:100, balanceFeeVatIncluded:true }, 'balance').vatIncluded, true);
t('안 붙었으면 false', one({ balanceFee:100 }, 'balance').vatIncluded, false);
/* ★ 이 칸에는 true/false 말고 'wht33'(원천징수 3.3%) 도 들어간다.
   참·거짓으로 뭉개면 예상 입금액이 ×0.967 이 아니라 그대로가 되어
   「금액 안 맞음」 으로 떨어진다 — 지금 실데이터에는 없지만 코드 길은 살아 있다. */
t('원천징수는 뭉개지 않는다', one({ balanceFee:100, balanceFeeVatIncluded:'wht33' }, 'balance').taxType, 'wht33');
t('원천징수는 부가세포함이 아니다', one({ balanceFee:100, balanceFeeVatIncluded:'wht33' }, 'balance').vatIncluded, false);
t('부가세포함은 taxType 도 true', one({ balanceFee:100, balanceFeeVatIncluded:true }, 'balance').taxType, true);
t('없으면 taxType 도 false', one({ balanceFee:100 }, 'balance').taxType, false);

console.log('\n■ 두 화면이 정말 이 함수를 쓰는가');
t('거래내역 후보가 쓴다',
  /erpUnpaidParts\(it\)\.forEach\(function\(u\)\{[\s\S]{0,500}?pending\.push\(/.test(src), true);
t('입금관리 미입금 대기가 쓴다',
  /function extractPending\(\)\{[\s\S]{0,900}?erpUnpaidParts\(it\)\.forEach/.test(src), true);
t('거래내역이 종료·영구보관을 더는 빼지 않는다',
  /filter\(function\(it\)\{return !it\.permanentArchived&&!it\.closedDate;\}\)/.test(src), false);
t('입금관리가 날짜만 보던 옛 판단이 없다', /var retainerDone = !!it\.retainerPaidDate;/.test(src), false);
t('두 곳 모두 접힘 표를 받는다',
  (src.match(/closedTag:\s*(tag|erpItemClosedTag\(it\))/g) || []).length >= 2, true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
