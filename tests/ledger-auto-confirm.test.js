// 거래내역 확정 — 한 번 누르면 어디까지 연쇄되는가
// (2026-08-09) 확정 갈래 넷(⚡자동확정·📋확인 후 확정·고신뢰·자동정리)을 하나로 합쳤다.
//   갈래마다 저장하는 내용이 조금씩 달라 «어느 단추로 확정했느냐» 에 따라 결과가 달랐고,
//   무엇을 눌러야 하는지 사람이 알 수 없었다. 여기서는 «합친 뒤에도 잃은 것이 없는지» 를 고정한다.
//   성과급 분배·부가세 기준·되돌리기·학습·지문은 그대로 살아 있어야 한다.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, hint) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}

console.log('\n[확정은 한 갈래 — 무엇을 누를지 고민할 것이 없다]');

ok('확정 대상은 줄 상태로 정한다 (관문을 따로 재지 않는다)',
   /erpRowState\(row,\s*grp,\s*\{\s*held:held\s*\}\)/.test(src));
ok('초록인 줄만 확정 대상에 담는다',
   /st\.state === 'ready'[\s\S]{0,200}?readyRows\.push/.test(src));
ok('업체가 여럿이면 담지 않는다 (골라야 한다)',
   /st\.state === 'ready' && grp\.length === 1/.test(src));
ok('단추가 그 목록을 그대로 쓴다 (따로 세지 않는다)',
   /readyRows\.forEach\(function\(r\)\{/.test(src));

console.log('\n[성과급 — 확정하면 성과가 함께 붙는다]');

// 이게 빠지면 확정분이 「성과 미반영」에 쌓인다 — 연쇄 처리의 핵심
ok('saveIncome 이 opts.withPerf 일 때 성과를 나눈다',
   /opts\.withPerf\s*&&\s*!isAdv[\s\S]{0,700}?calcPerfShares\(/.test(src));
/* 공제 첫 설정은 «입금관리 확정창과 같은 함수» 로 낸다 (2026-08-13).
   전에는 여기서 부가세 포함 여부만 따로 봐서, 계약에 「개인입금」이 표시돼 있어도
   거래내역에서 확정하면 법인 매출로 잡혔다 — 같은 건인데 화면마다 결과가 달랐다. */
ok('공제 첫 설정을 확정창과 같은 함수(erpInitDeductions)로 낸다',
   /_ded = erpInitDeductions\(_it, opts\.vatIncluded \? 'inclusive' : 'separate'\);/.test(src));
ok('그 공제로 성과 기준액을 낸다',
   /_perfBase = calcDeductions\(row\.amount, _ded\)\.perfBaseAmount;/.test(src));
ok('개인수익·원천징수분은 법인 매출이 아니라고 표를 남긴다',
   /isPersonalIncome: _isPersonal \|\| undefined/.test(src));

// ── 낱말이 아니라 «셈» 으로 — 소스의 진짜 두 함수를 꺼내 돌린다 ──
(function(){
  const vm = require('vm');
  const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return src.slice(i, j); };
  const ctx = { console, Math, Object, JSON, parseInt, parseFloat };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('function erpWithholdTax(a, k, r){ return { total: Math.round(a * (k === "biz" ? 0.033 : (r||8.8)/100)) }; }', ctx);
  vm.runInContext(cut('function erpInitDeductions(item, vatType){', '\nfunction CaseEditModal'), ctx);
  const base = (amt, item, vatIncluded) =>
    ctx.calcDeductions(amt, ctx.erpInitDeductions(item, vatIncluded ? 'inclusive' : 'separate')).perfBaseAmount;

  ok('부가세 포함이면 1/11 뺀 금액이 성과 기준  (1,100,000 → 1,000,000)',
     base(1100000, {}, true) === 1000000, '받음 ' + base(1100000, {}, true));
  ok('부가세 별도면 받은 금액 그대로', base(1000000, {}, false) === 1000000);
  ok('개인입금 계약은 부가세를 빼지 않는다 — 법인 매출이 아니다',
     base(1100000, { personalDeposit:true }, true) === 1100000, '받음 ' + base(1100000, { personalDeposit:true }, true));
  ok('개인입금 계약은 개인수익으로 표시된다',
     ctx.erpInitDeductions({ personalDeposit:true }, 'inclusive').personalRevenue === true);
})();
ok('계산한 성과를 실제로 저장한다 (perfShares:[] 로 비우지 않는다)',
   /perfShares:_perfShares,\s*confirmedAt/.test(src));
ok('확정한 건은 표시가 남는다 (나중에 되돌릴 때 구분)',
   /autoConfirmed:\s*opts\.withPerf\s*\?\s*true/.test(src));
ok('한 줄 확정도 성과를 나눈다', /function confirmRow[\s\S]{0,400}?withPerf:true/.test(src));
ok('여러 줄 확정도 성과를 나눈다', /readyRows\.forEach[\s\S]{0,300}?withPerf:true/.test(src));
ok('합계 후보 확정도 성과를 나눈다', /function confirmCombo[\s\S]{0,900}?withPerf:true/.test(src));
ok('과입금 확정도 성과를 나눈다', /function confirmOver[\s\S]{0,1400}?withPerf:true/.test(src));

// 미리보기 성과액과 실제 저장액이 어긋나면 안 된다
ok('미리보기 성과액도 같은 셈을 쓴다',
   /_pendPerfEst[\s\S]{0,800}?_vatF===true\)\s*_base\s*=\s*calcDeductions\(_base,\s*\{vatIncluded:true\}\)\.perfBaseAmount/.test(src));

console.log('\n[수수료 — 카드로 받으면 매출은 원금액, 차액은 지출]');

ok('카드·CMS 는 카드수수료 계정으로 적는다',
   /exp-cardfee.*:.*exp-bankfee|feeCat:\(r\.row\.src==='card'/.test(src));
ok('수수료 차감분이 지출로 기록된다', /if\(opts\.feeAmount > 0\)[\s\S]{0,300}?finance_expense/.test(src));

console.log('\n[안전장치 — 잃으면 안 되는 것]');

/* confirmRow 안을 볼 때는 «글자 수» 로 자르지 않는다 —
   줄을 한 줄만 더해도 창이 모자라 검사가 깨진다(실제로 깨졌다).
   함수 이름에서 다음 함수 이름까지를 잘라 그 안을 본다. */
const CONFIRM = src.slice(src.indexOf('function confirmRow(row, pItem, opts)'),
                          src.indexOf('async function confirmOver('));
ok('confirmRow 구역을 잘라냈다', CONFIRM.length > 300 && CONFIRM.length < 4000, '길이 ' + CONFIRM.length);
ok('확정을 되돌릴 수 있다 (확정 이력)', /setConfHistOpen\(true\)/.test(src));
ok('확정하면 적요를 학습한다', /erpLearnPayerAlias/.test(CONFIRM));
ok('확정한 통장 행은 처리됨으로 찍힌다', /erpMarkBankRowProcessed/.test(CONFIRM));
ok('확정 실패를 조용히 삼키지 않는다', /확정 실패/.test(CONFIRM));
ok('부분입금은 완납 표시를 안 찍는다 (남은 금액이 미수로 남는다)',
   /var partial = opts\.partial && !opts\.feeAmount/.test(src)
   && /if\(!partial\)\{ _sp\.paid=true/.test(src));
ok('부분입금을 화면에서 고를 수 있다', /confirmRow\(row,pItem,\{partial:true\}\)/.test(src));

console.log('\n[입금관리 — 스스로 여는 입금확정 창은 그대로 있다]');
// 거래내역에서 넘겨 주던 통로(sendToConfirm)는 없앴지만, 입금관리 자체의 확정 창은 남아 있어야 한다
ok('입금관리 확정 창이 살아 있다', /setConfirmModal\(/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
