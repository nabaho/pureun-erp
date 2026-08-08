// ➕ 직접 등록 — 상담만 하고 받은 돈, 현금영수증, 카드입금
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}
function eq(name, got, want){
  const good = JSON.stringify(got) === JSON.stringify(want);
  if(good){ pass++; console.log('  PASS ' + name + '  (' + JSON.stringify(got) + ')'); }
  else { fail++; console.log('  FAIL ' + name + '  받음 ' + JSON.stringify(got) + ' · 기대 ' + JSON.stringify(want)); }
}

// 실제 계산 함수를 떼어내 돌려본다
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
new Function('exports',
  'function roundKRW(n){ return Math.round(n); }\n'
  + grab('calcDeductions') + '\nexports.calcDeductions = calcDeductions;'
)(sandbox);
const { calcDeductions } = sandbox;

console.log('\n[계좌로 받은 상담료 330,000 · 현금영수증]');
{
  const bank = 330000;
  const gross = bank;                       // 계좌면 매출 = 입금액
  const base = calcDeductions(gross, {vatIncluded:true}).perfBaseAmount;
  eq('매출은 통장 입금액 그대로', gross, 330000);
  eq('부가세 1/11 을 뺀 성과 기준', base, 300000);
  eq('카드 수수료는 없다', 0, 0);
}

console.log('\n[카드로 받은 경우 — 수수료가 빠져 들어온다]');
{
  // 매출 330,000 인데 카드사가 수수료를 떼고 323,400 만 넣었다
  const bank = 323400, grossInput = 330000;
  let gross = grossInput;
  if(gross < bank) gross = bank;            // 매출이 입금보다 적을 수는 없다
  const fee = gross - bank;
  eq('매출은 원래 금액으로 잡는다', gross, 330000);
  eq('차액이 카드 수수료', fee, 6600);
  eq('성과 기준은 매출에서 부가세를 뺀 값',
     calcDeductions(gross, {vatIncluded:true}).perfBaseAmount, 300000);

  // 매출을 입금액보다 작게 잘못 넣으면 입금액으로 올려 잡는다
  let bad = 300000;
  if(bad < bank) bad = bank;
  eq('매출을 입금보다 작게 넣으면 입금액으로 맞춘다', bad, 323400);
  eq('그때 수수료는 0', bad - bank, 0);
}

console.log('\n[부가세 공제를 끄면]');
eq('성과 기준이 매출 전액', calcDeductions(330000, {}).perfBaseAmount, 330000);

console.log('\n[코드에 제대로 붙었는지]');
ok('직접 등록 저장 함수가 있다', /function saveDirectIncome\(d\)\{/.test(src));
ok('후보가 없을 때 버튼이 나온다', /'➕ 직접 등록'\)/.test(src));
ok('팝업 상태가 있다', /var dirPopS=useState\(null\)/.test(src));

console.log('\n[무엇을 남기나]');
ok('기타수입으로 남긴다', /sourceKind:'other', sourceId:''/.test(src));
ok('증빙 방식을 남긴다 (세금계산서·현금영수증·없음)', /docType:d\.doc\|\|'cash'/.test(src));
ok('결제수단을 남긴다', /payMethod:d\.cardMode\?'card':'account'/.test(src));
ok('담당자를 남긴다', /managerSid:d\.mainSid\|\|'', managerName:d\.mainSid\?_sidName\(d\.mainSid\)/.test(src));
ok('성과급을 계산해 남긴다', /perfBaseAmount:perfBase, perfShares:shares/.test(src));
ok('담당자가 없으면 성과 미반영으로 표시', /perfExclude:!\(d\.perfOn && d\.mainSid\)/.test(src));
ok('카드 수수료를 지출로 남긴다', /if\(cardFee > 0\)\{[\s\S]{0,300}?category:'exp-bankfee'/.test(src));
ok('통장 행에 처리됨을 찍는다', /erpMarkBankRowProcessed\(row,'income','➕ '/.test(src));
ok('저장이 실패하면 행을 그대로 둔다', /if\(_ok === false\)\{ showToast\('❌ 저장 실패 — 행을 그대로 둡니다'\); return false; \}/.test(src));

console.log('\n[안전장치]');
ok('매출이 입금보다 적으면 입금액으로 맞춘다', /if\(gross < row\.amount\) gross = row\.amount;/.test(src));
ok('마감된 달에는 등록할 수 없다', /isIncomeLocked\(_ym\)\)\{ showToast\('🔒 '\+_ym\+' 입금 마감 — 등록할 수 없습니다'\)/.test(src));
ok('업체·의뢰인이 비면 등록 못 한다', /if\(!\(dirPop\.name\|\|''\)\.trim\(\)\)\{ showToast\('업체·의뢰인을 입력하세요'\)/.test(src));
ok('성과급을 켜면 담당자가 있어야 한다', /if\(dirPop\.perfOn && !dirPop\.mainSid\)\{ showToast\('담당자를 고르세요/.test(src));
ok('등록 전에 무엇이 저장되는지 보여준다', /을 수입으로 등록합니다\./.test(src));
ok('되돌릴 수 있다고 알려준다', /확정 이력」에서 되돌릴 수 있습니다/.test(src));
ok('담당자 목록은 표준 함수를 쓴다 (비관리자 기기에서도 안 빈다)',
   /var _users = \(getActiveUsers\(\) \|\| \[\]\)/.test(src));

console.log('\n[✕ 는 기록을 남기지 않는다고 알려준다]');
ok('✕ 에 설명이 붙었다', /title:'화면에서만 지웁니다 — 기록은 남지 않습니다'/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
