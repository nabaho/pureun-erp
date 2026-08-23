/* 원천징수 — 기타소득 8.8% 가 반의반만 떼이던 것
   (2026-08-11) 대표 지적: "기타소득이 8.8%인데 수령금액이 이상하다".

   같은 셈이 세 곳에 흩어져 있었고 그중 입금확정만 틀렸다.
     · 급여관리(비정기)          지급액×40% → ×20% + 지방세  = 실효 8.8%   맞음
     · 확정이력 수정             지급액 ÷ 0.912 로 되짚음                  맞음
     · 입금확정(calcDeductions)  지급액×40% → ×8.8%          = 3.52%      틀림
   ★ 8.8% 에는 «필요경비 60%» 가 이미 들어 있다. 거기에 40% 를 또 곱해 반의반이 됐다.
     900,000원에서 79,200원이 아니라 31,680원만 뗐다(47,520원 덜 뗌). */
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

const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
// 세는 함수와 그것을 쓰는 calcDeductions 를 함께 들여온다
// 원단위 절사(10원 아래 버림)는 roundKRW 가 맡는다 — 흉내내지 말고 «진짜» 를 들여온다
vm.runInContext(grab('function roundKRW(amount, mode){', '\nfunction fmtAmt('), ctx);
vm.runInContext(grab('function erpWithholdTax(amount, kind, rate){', '\nfunction calcPerfShares('), ctx);

console.log('\n[① 기타소득 8.8% — 필요경비 60% 가 이미 들어 있는 실효세율]');
/* 법: 지급액×40%(소득금액) × 20%(소득세) + 지방세(소득세의 10%) = 지급액 × 8.8% */
const m = ctx.erpWithholdTax(900000, 'misc', 8.8);
t('소득금액 = 지급액의 40%', m.taxable, 360000);
t('소득세 = 소득금액의 20%', m.incomeTax, 72000);
t('지방소득세 = 소득세의 10%', m.localTax, 7200);
t('★ 차감 합계 = 지급액의 8.8% (전에는 31,680원이었다)', m.total, 79200);
t('★ 수령액', m.net, 820800);
t('실효세율이 8.8% 다', Math.round(m.total / 900000 * 1000) / 10, 8.8);

console.log('\n[② 기타소득 22% — 필요경비가 없는 경우 (사례금·위약금 등)]');
/* 여기서는 지급액 «전액» 이 소득금액이다 — 40% 를 곱하면 안 된다 */
const m22 = ctx.erpWithholdTax(900000, 'misc', 22);
t('소득금액 = 지급액 전액', m22.taxable, 900000);
t('차감 합계 = 지급액의 22%', m22.total, 198000);
t('수령액', m22.net, 702000);
t('8.8% 와 22% 는 서로 다른 값이다 (같으면 고를 뜻이 없다)', m.total === m22.total, false);

console.log('\n[③ 사업소득 3.3%]');
const b = ctx.erpWithholdTax(900000, 'biz');
t('소득세 3%', b.incomeTax, 27000);
t('지방소득세', b.localTax, 2700);
t('차감 합계 = 지급액의 3.3%', b.total, 29700);
t('수령액', b.net, 870300);

console.log('\n[④ 원 단위는 버린다 — 세금은 항목마다 원단위 절사]');
/* 급여관리가 이미 그렇게 하고 있었다. 반올림하면 두 화면의 값이 1원씩 어긋난다. */
const odd = ctx.erpWithholdTax(333333, 'misc', 8.8);
t('소득금액', odd.taxable, 133333);
t('소득세도 10원 단위로 버린다', odd.incomeTax, 26660);
t('지방세도 10원 단위로 버린다', odd.localTax, 2660);
t('합계', odd.total, 29320);
t('낸 세금 + 받은 돈 = 지급액 (한 푼도 새지 않는다)', odd.total + odd.net, 333333);

console.log('\n[⑤ 0원·빈 값에도 안 터진다]');
t('0원', ctx.erpWithholdTax(0, 'misc', 8.8), { taxable:0, incomeTax:0, localTax:0, total:0, net:0 });
t('빈 값', ctx.erpWithholdTax(null, 'misc', 8.8).total, 0);
t('음수는 0으로', ctx.erpWithholdTax(-500, 'biz').total, 0);
t('세율을 안 주면 8.8%', ctx.erpWithholdTax(900000, 'misc').total, 79200);

console.log('\n[⑥ 입금확정 화면이 그 값을 그대로 쓴다]');
/* 대표가 본 화면: 「입금액 900,000원 − 차감 31,680원 = 성과 기준 868,320원」 */
const d = ctx.calcDeductions(900000, { etcIncomeTax:true, etcIncomeTaxRate:8.8 });
t('★ 차감액 (전에는 31,680)', d.totalDeducted, 79200);
t('★ 성과 기준 (전에는 868,320)', d.perfBaseAmount, 820800);
t('기타소득세 칸에 담긴다', d.etcIncomeTaxAmount, 79200);
t('22% 도 맞다', ctx.calcDeductions(900000, { etcIncomeTax:true, etcIncomeTaxRate:22 }).totalDeducted, 198000);
t('사업소득 3.3%', ctx.calcDeductions(900000, { bizIncomeTax:true }).totalDeducted, 29700);
t('부가세 1/11 은 그대로', ctx.calcDeductions(900000, { vatIncluded:true }).totalDeducted, 81818);
t('아무것도 안 고르면 차감 없음', ctx.calcDeductions(900000, {}).perfBaseAmount, 900000);

console.log('\n[⑦ 셈은 한 곳에서만 — 흩어지면 또 어긋난다]');
t('입금확정이 스스로 세지 않는다',
  /etc = erpWithholdTax\(amount, 'misc', ded\.etcIncomeTaxRate \|\| 8\.8\)\.total;/.test(src), true);
t('사업소득도 같은 함수로', /biz = erpWithholdTax\(amount, 'biz'\)\.total;/.test(src), true);
t('급여관리도 같은 함수로', /var m = erpWithholdTax\(amount, 'misc', 8\.8\);/.test(src), true);
t('★ 옛 셈(40% 에 8.8% 를 또 곱하던 것)이 사라졌다',
  /taxBase = rate <= 10 \? roundKRW\(amount \* 0\.4\) : amount/.test(src), false);
t('급여관리가 따로 세던 줄도 사라졌다',
  /var taxable = amount \* 0\.4;\s*\n\s*var income = Math\.floor\(taxable \* 0\.20/.test(src), false);
t('다른 화면에서도 부를 수 있게 내놓는다', /window\.erpWithholdTax = erpWithholdTax;/.test(src), true);

console.log('\n[⑧ 화면에 적힌 설명과 셈이 어긋나지 않는다]');
/* 코드가 스스로 「필요경비 60%, 실효 8.8%」 라 적어 두고 다르게 세고 있었다 */
t('설명은 그대로 맞다', /필요경비 60%, 실효 8\.8%/.test(src), true);
t('8.8% 는 실효세율이라고 주석에 못 박는다', /필요경비 60% 를 이미 반영한/.test(src), true);


console.log('\n[⑨ 이미 확정한 건을 다시 재는 길]');
/* 고치기 «전» 에 확정한 건은 3.52% 만 떼인 채 저장돼 있다 —
   성과 기준이 부풀려졌으므로 어느 건인지 찾아볼 수 있어야 한다. */
t('다시 재는 도구가 있다', /function erpEtcTaxAudit\(\)\{/.test(src), true);
t('콘솔에서 부를 수 있다', /window\.erpEtcTaxAudit = erpEtcTaxAudit;/.test(src), true);
t('되돌린 건은 세지 않는다', /if\(!fi \|\| fi\.undoneDate\) return;/.test(src), true);
t('기타소득 건만 본다', /if\(!d\.etcIncomeTax\) return;/.test(src), true);
t('이미 맞는 건은 빼놓는다', /if\(had === right\) return;/.test(src), true);
t('★ 스스로 고치지 않는다 (이미 지급한 성과급과 어긋난다)',
  /dbUpsert|dbPatch|dbSet/.test(src.slice(src.indexOf('function erpEtcTaxAudit()'),
                                          src.indexOf('if(typeof window !== \'undefined\') window.erpEtcTaxAudit'))), false);
t('덜 뗀 합계를 알려 준다', /덜 뗀 세금 합계/.test(src), true);
console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
