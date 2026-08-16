/* 사건 성공보수 — % 모드 실금액 계산과 부가세포함 배선 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

function slice(a, b) {
  const i = html.indexOf(a); if (i < 0) throw new Error('못찾음:' + a);
  const j = html.indexOf(b, i); if (j < 0) throw new Error('끝 못찾음:' + b);
  return html.slice(i, j);
}
const ctx = { console, Math, Object, JSON, parseInt, parseFloat, window: {} };
vm.createContext(ctx);
vm.runInContext(slice('// 사건 성공보수의', 'function CaseEditModal(props){'), ctx);
const amt = ctx.caseSuccessFeeAmount;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, a, b) { ok(name + '  (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b), 'want ' + JSON.stringify(b)); }

/* ── 실화면 값: 15% × 33,721,575 = 5,058,236 ── */
eq('캡쳐 그대로', amt({ successFeeType: 'percent', successFee: 15, judgmentAmount: 33721575 }), 5058236);

/* ── % 모드 ── */
eq('요율 10%', amt({ successFeeType: 'percent', successFee: 10, judgmentAmount: 1000000 }), 100000);
eq('소수 요율 7.5%', amt({ successFeeType: 'percent', successFee: 7.5, judgmentAmount: 1000000 }), 75000);
eq('내림 (올려 받지 않는다)', amt({ successFeeType: 'percent', successFee: 15, judgmentAmount: 1001 }), 150);
eq('승소금액 미입력 → 0', amt({ successFeeType: 'percent', successFee: 15, judgmentAmount: 0 }), 0);
eq('승소금액 없음 → 0', amt({ successFeeType: 'percent', successFee: 15 }), 0);
eq('요율 0 → 0', amt({ successFeeType: 'percent', successFee: 0, judgmentAmount: 1000000 }), 0);
eq('문자 승소금액도 처리', amt({ successFeeType: 'percent', successFee: 15, judgmentAmount: '1000000' }), 150000);

/* ── 원 모드 (기존 동작이 안 바뀌어야 한다) ── */
eq('원 모드', amt({ successFeeType: 'amount', successFee: 3000000 }), 3000000);
eq('successFeeType 없는 옛 데이터', amt({ successFee: 3000000 }), 3000000);
eq('원 모드는 승소금액을 무시', amt({ successFeeType: 'amount', successFee: 3000000, judgmentAmount: 99999999 }), 3000000);
eq('원 모드 0', amt({ successFeeType: 'amount', successFee: 0 }), 0);

/* ── 방어 ── */
eq('null', amt(null), 0);
eq('빈 객체', amt({}), 0);

/* ── 미입금 판단이 helper 를 쓰는가 (15원 버그 재발 방지) ──
   2026-08-13 부터 입금관리·거래내역이 erpUnpaidParts 한 곳에서만 판단한다.
   낱말을 못 박지 말고 «실제로 돌려» 확인한다 — 어디로 옮겨 가도 뜻은 지켜진다. */
vm.runInContext('function erpPaidSoFar(item, kindLabel, legacy){ return parseInt(legacy,10)||0; }', ctx);
// erpUnpaidParts 가 「여기까지로 닫은 것」 판정을 함께 쓰므로 둘 다 담는다 (2026-08-16)
vm.runInContext(slice('function erpClosedUnpaid(it, splitLabel){', "if(typeof window !== 'undefined'){"), ctx);
const parts = ctx.erpUnpaidParts;
const suc = it => (parts(it).filter(p => p.kind === 'success')[0] || null);

ok('미입금 판단이 % 요율을 실금액으로 편다 — 15가 15원이 되지 않는다',
  suc({ successFeeType: 'percent', successFee: 15, judgmentAmount: 33721575 }).fee === 5058236);
ok('원 모드는 그대로', suc({ successFeeType: 'amount', successFee: 3000000 }).fee === 3000000);
ok('금액 0이면 대기에 안 올린다',
  suc({ successFeeType: 'percent', successFee: 15, judgmentAmount: 0 }) === null);
ok('이미 받았으면 안 올린다 (날짜)', suc({ successFee: 100, successPaidDate: '2026-01-02' }) === null);
ok('이미 받았으면 안 올린다 (표시)', suc({ successFee: 100, successPaid: true }) === null);

/* ── 표시 지점이 모두 helper 를 쓰는가 ── */
const uses = (html.match(/caseSuccessFeeAmount\(/g) || []).length;
ok('helper 호출이 4곳 이상 (정의 1 + 모달·목록·합계·대기)', uses >= 5, '실제 ' + uses + '회');
ok('직접 계산한 잔재가 없다',
  !/judgmentAmount\s*\|\|\s*0\)\s*\*\s*\(/.test(html) && !/\* \(c\.successFee\|\|0\) \/ 100/.test(html));

/* ── % 모드에 부가세포함 체크박스가 있는가 (요청 사항) ── */
const pctBlock = slice("f.successFeeType==='percent'", "              : h('div', { style:{ display:'flex', gap:'6px', alignItems:'center' } },");
ok('% 분기에 부가세포함 체크박스', /checked:!!f\.balanceFeeVatIncluded/.test(pctBlock));
ok('% 분기 체크박스가 원 모드와 같은 필드를 쓴다', /balanceFeeVatIncluded:e\.target\.checked/.test(pctBlock));
ok('% 분기에 부가세포함 글자', pctBlock.indexOf('🧾 부가세포함') >= 0);
ok('% 분기에 공급가 안내', /공급가 /.test(pctBlock));
ok('% 분기에 승소금액 미입력 경고', pctBlock.indexOf('승소금액을 넣어야 입금관리에 뜹니다') >= 0);

/* 원 모드 체크박스는 그대로 (하나 더 생기지 않았는지) */
const caseModal = slice('function CaseEditModal(props){', 'function CaseManagement(props){');
const boxes = (caseModal.match(/checked:!!f\.balanceFeeVatIncluded/g) || []).length;
ok('사건 모달에 성공보수 부가세 체크박스가 정확히 2개 (원·%)', boxes === 2, '실제 ' + boxes + '개');
ok('착수금 체크박스는 그대로', /checked:!!f\.contractFeeVatIncluded/.test(caseModal));

/* ── 입금확정이 이 필드를 읽는가 (체크가 실제로 효과가 있는지) ── */
ok('성공보수 부가세 판정이 balanceFeeVatIncluded 를 본다',
  /kind === 'balance' \|\| kind === 'success'\)[\s\S]{0,120}balanceFeeVatIncluded/.test(html));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
