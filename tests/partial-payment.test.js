// 부분입금 — 110만원 중 55만원, 자문료 20만원 중 15만원
// 두 화면(거래내역·입금관리)이 같은 잔액을 보는지, 자문료 잔금이 살아남는지 본다.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

// ── 실제 함수를 떼어내 돌려본다 ──
function grab(name){
  const m = src.match(new RegExp('\\nfunction ' + name + '\\s*\\([^)]*\\)\\s*\\{'));
  if(!m) throw new Error('못 찾음: ' + name);
  let depth = 0;
  for(let j = m.index + m[0].length - 1; j < src.length; j++){
    if(src[j] === '{') depth++;
    else if(src[j] === '}'){ depth--; if(depth === 0) return src.slice(m.index + 1, j + 1); }
  }
  throw new Error('닫는 괄호 못 찾음: ' + name);
}
const sandbox = {};
new Function('exports', 'window',
  grab('erpPaidSoFar') + '\nexports.erpPaidSoFar = erpPaidSoFar;'
)(sandbox, {});
const { erpPaidSoFar } = sandbox;

// _expect 는 FinanceLedger 안의 내부 함수 — 본문을 그대로 옮겨 쓴다
function _expect(fee, taxType, paidAmt){
  var total = taxType === 'wht33' ? Math.round(fee * 0.967) : taxType ? fee : Math.round(fee * 1.1);
  var remain = total - (paidAmt || 0);
  return remain > 0 ? remain : 0;
}

let pass = 0, fail = 0;
function eq(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if(ok){ pass++; console.log('  PASS ' + name + '  (' + JSON.stringify(got) + ')'); }
  else { fail++; console.log('  FAIL ' + name + '  받음 ' + JSON.stringify(got) + ' · 기대 ' + JSON.stringify(want)); }
}

console.log('\n[받은 돈 세기 — 두 곳에 나뉜 기록을 합쳐 본다]');
eq('옛 기록만 있을 때 (누계만)', erpPaidSoFar({}, '착수금', 550000), 550000);
eq('분할기록만 있을 때 (입금관리에서만 받음)',
   erpPaidSoFar({splitPayments:[{kind:'착수금',amount:550000}]}, '착수금', 0), 550000);
eq('양쪽에 같이 적힌 뒤 (거래내역이 둘 다 적는다)',
   erpPaidSoFar({splitPayments:[{kind:'착수금',amount:550000}]}, '착수금', 550000), 550000);
eq('섞어 받은 뒤 — 통장 55만 + 입금관리 55만',
   erpPaidSoFar({splitPayments:[{kind:'착수금',amount:550000},{kind:'착수금',amount:550000}]}, '착수금', 550000),
   1100000);
eq('다른 종류는 안 센다',
   erpPaidSoFar({splitPayments:[{kind:'잔금',amount:900000}]}, '착수금', 0), 0);
eq('기록이 없으면 0', erpPaidSoFar({}, '착수금', 0), 0);
eq('splitPayments 가 없어도 안 터진다', erpPaidSoFar(null, '착수금', 0), 0);

console.log('\n[110만원 중 55만원만 들어온 경우 — 나머지가 미수로 남는가]');
{
  // 약정 1,100,000 (부가세 포함) · 55만원 입금
  const it = { retainerFee:1100000, contractFeeVatIncluded:true,
               splitPayments:[{kind:'착수금',amount:550000}], retainerPaidAmount:550000 };
  const paid = erpPaidSoFar(it, '착수금', it.retainerPaidAmount);
  eq('받은 돈 55만원으로 센다', paid, 550000);
  eq('다음 후보는 남은 55만원짜리', _expect(it.retainerFee, it.contractFeeVatIncluded, paid), 550000);

  // 미수금관리가 빼는 셈
  const remain = it.retainerFee - paid;
  eq('미수금은 55만원 (약정 110만원이 아니다)', remain, 550000);
}

console.log('\n[통장에서 절반, 입금관리에서 절반 — 예전에 어긋나던 경우]');
{
  // 거래내역에서 55만 (양쪽에 적힘) → 입금관리에서 55만 (분할기록 추가 + 누계 갱신)
  const afterLedger = { retainerFee:1100000, contractFeeVatIncluded:true,
                        splitPayments:[{kind:'착수금',amount:550000}], retainerPaidAmount:550000 };
  const prevPaid = erpPaidSoFar(afterLedger, '착수금', afterLedger.retainerPaidAmount);
  eq('입금관리가 통장에서 받은 55만원을 본다', prevPaid, 550000);
  eq('입금관리가 보는 잔액도 55만원', afterLedger.retainerFee - prevPaid, 550000);

  const afterBoth = { retainerFee:1100000, contractFeeVatIncluded:true,
                      splitPayments:[{kind:'착수금',amount:550000},{kind:'착수금',amount:550000}],
                      retainerPaidAmount:1100000 };
  const total = erpPaidSoFar(afterBoth, '착수금', afterBoth.retainerPaidAmount);
  eq('둘을 합치면 110만원 — 완납', total, 1100000);
  eq('남은 미수금 0원', Math.max(0, afterBoth.retainerFee - total), 0);
  eq('거래내역에도 후보가 안 뜬다', _expect(afterBoth.retainerFee, true, total), 0);
}

console.log('\n[자문료 20만원 중 15만원 — 5만원이 살아남는가]');
{
  // addAdvisoryPending 의 셈을 그대로 옮겨 본다
  function advPending(incomes, coName, fee, ym){
    const paidAmt = {};
    incomes.forEach(i => {
      if(i && i.kind === '자문료' && i.companyName && i.date){
        const k = i.companyName + '|' + (i.advisoryYm || String(i.date).slice(0,7));
        paidAmt[k] = (paidAmt[k] || 0) + (parseInt(i.amount,10) || 0);
      }
    });
    const got = paidAmt[coName + '|' + ym] || 0;
    if(got >= fee) return null;
    return { expect: fee - got, paidAmount: got };
  }

  const ym = '2026-07';
  eq('아직 안 받았으면 20만원 후보',
     advPending([], '가나상사', 200000, ym), { expect:200000, paidAmount:0 });

  const after15 = [{kind:'자문료', companyName:'가나상사', date:'2026-07-25', amount:150000, advisoryYm:'2026-07'}];
  eq('15만원 받으면 5만원 후보가 남는다',
     advPending(after15, '가나상사', 200000, ym), { expect:50000, paidAmount:150000 });

  // 잔금 5만원이 8월에 들어와도 «받을 달» 인 7월로 친다
  const afterRest = after15.concat([
    {kind:'자문료', companyName:'가나상사', date:'2026-08-10', amount:50000, advisoryYm:'2026-07'}]);
  eq('8월에 받은 잔금도 7월로 세어 후보가 사라진다', advPending(afterRest, '가나상사', 200000, ym), null);
  eq('그래도 8월 자문료는 따로 남아 있다',
     advPending(afterRest, '가나상사', 200000, '2026-08'), { expect:200000, paidAmount:0 });

  // 더 받은 경우
  const over = [{kind:'자문료', companyName:'가나상사', date:'2026-07-25', amount:250000, advisoryYm:'2026-07'}];
  eq('더 받았으면 후보 없음', advPending(over, '가나상사', 200000, ym), null);

  // advisoryYm 이 없는 옛 기록은 날짜로 센다
  const legacy = [{kind:'자문료', companyName:'가나상사', date:'2026-07-25', amount:150000}];
  eq('옛 기록(advisoryYm 없음)도 날짜로 세어 5만원이 남는다',
     advPending(legacy, '가나상사', 200000, ym), { expect:50000, paidAmount:150000 });
}

console.log('\n[코드에 제대로 붙었는지]');
function has(name, re){ if(re.test(src)){ pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } }
has('거래내역이 분할기록에도 적는다', /_sp\.splitPayments\s*=\s*\(_it\.splitPayments\|\|\[\]\)\.concat/);
has('입금관리가 누계 칸도 맞춘다', /srcPatch\[_legacyField\]\s*=\s*_prevPaid\s*\+\s*payAmt/);
has('입금관리 잔액이 erpPaidSoFar 를 쓴다', /var _prevPaid = erpPaidSoFar\(p\.item, _kindLabel/);
has('거래내역 후보가 erpPaidSoFar 를 쓴다', /_pdR=erpPaidSoFar\(it,'착수금'/);
has('미수금관리가 받은 돈을 뺀다', /function _remain\(item, fee, kindLabel, legacyField\)/);
has('미수금 배지도 같은 셈', /function _left\(item, fee, kindLabel, legacyField\)/);
has('자문료를 금액으로 센다', /paidAmt\[_k\] = \(paidAmt\[_k\] \|\| 0\) \+ \(parseInt\(i\.amount, 10\) \|\| 0\)/);
has('자문료 잔금은 받을 달로 기록', /advisoryYm: isAdv \? \(pItem\.ym \|\| String\(paidDate\)\.slice\(0,7\)\)/);
has('업체 월 표가 부분입금을 가려낸다', /function paidInfo\(name, month, fee\)/);
has('부분입금 달은 ◐ 로 보인다', /pInf\.partial[\s\S]{0,400}?'◐'/);
has('부분입금 달은 색으로도 구분된다', /pInf\.partial \? '#fffbeb'/);
has('◐ 에 얼마 받고 얼마 남았는지 붙는다', /약정 '\+pInf\.fee\.toLocaleString\(\)\+'원 중 '\+pInf\.got\.toLocaleString\(\)\+'원 받음/);
has('약정을 채우면 일부입금을 골랐어도 완납', /_done = !partial \|\| \(_totalExp > 0 && _after >= _totalExp - 1100\)/);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
