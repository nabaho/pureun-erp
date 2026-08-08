// 거래내역 ⚡ 자동확정 / 📋 확인 후 확정 — 두 갈래가 제대로 갈리는지
// 관문(6중)과 성과급 저장, 입금관리 인수인계 통로가 붙어 있는지 본다.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}

console.log('\n[관문 — 여섯 가지를 모두 넘어야 자동확정]');

ok('autoConfirmGate 가 있다', /function autoConfirmGate\s*\(row,\s*pItem,\s*sug\)/.test(src));

// 관문을 이루는 각 조건이 실제로 걸려 있는지
ok('① ② ③ 은 erpAutoTidyOk 에 맡긴다 (신뢰도 90↑ · 금액 정확일치 · 학습 3회↑)',
   /autoConfirmGate[\s\S]{0,1400}?erpAutoTidyOk\(sug,\s*memo,\s*row\.amount\)/.test(src));
ok('④ 주담당이 없으면 자동으로 안 넘어간다',
   /autoConfirmGate[\s\S]{0,1600}?managerMain\|\|it\.manager\)\)\s*return\s*\{ok:false,\s*why:'주담당 없음'\}/.test(src));
ok('⑤ 부가세가 안 적혀 있으면 자동으로 안 넘어간다',
   /autoConfirmGate[\s\S]{0,1800}?why:'부가세 미지정'/.test(src));
ok('⑥ 마감된 달은 자동으로 안 넘어간다',
   /autoConfirmGate[\s\S]{0,600}?isIncomeLocked\(ym\)\)\s*return\s*\{ok:false/.test(src));

ok('원천징수(3.3%·8.8%) 는 사람이 고르게 창으로 보낸다',
   /wht33'\s*\|\|\s*vatF===.wht88'\)\s*return\s*\{ok:false,\s*why:'원천징수 건'\}/.test(src));
ok('자문료는 관문을 안 탄다 (자문료 일괄확인이 맡는다)',
   /autoConfirmGate[\s\S]{0,300}?kind==='advisory'\)\s*return\s*\{ok:false[^}]*adv:true\}/.test(src));

console.log('\n[성과급 — 자동확정한 건도 성과가 붙는다]');

// 이게 빠지면 자동확정분이 「성과 미반영」에 쌓인다 — 이 기능의 핵심
ok('saveIncome 이 opts.withPerf 일 때 성과를 나눈다',
   /opts\.withPerf\s*&&\s*!isAdv[\s\S]{0,700}?calcPerfShares\(/.test(src));
ok('부가세 포함이면 1\/11 뺀 금액이 성과 기준',
   /opts\.vatIncluded\)\s*_ded\s*=\s*\{vatIncluded:true\}[\s\S]{0,200}?calcDeductions\(row\.amount,\s*_ded\)\.perfBaseAmount/.test(src));
ok('계산한 성과를 실제로 저장한다 (perfShares:[] 로 비우지 않는다)',
   /perfShares:_perfShares,\s*confirmedAt/.test(src));
ok('자동확정한 건은 표시가 남는다 (나중에 되돌릴 때 구분)',
   /autoConfirmed:\s*opts\.withPerf\s*\?\s*true/.test(src));

// 미리보기 성과액과 실제 저장액이 어긋나면 안 된다
ok('미리보기 성과액도 같은 셈을 쓴다',
   /_pendPerfEst[\s\S]{0,800}?_vatF===true\)\s*_base\s*=\s*calcDeductions\(_base,\s*\{vatIncluded:true\}\)\.perfBaseAmount/.test(src));

console.log('\n[인수인계 — 거래내역에서 입금관리 입금확정 창으로]');

ok('넘길 줄을 sessionStorage 에 세운다', /sessionStorage\.setItem\(HANDOFF_KEY/.test(src));
ok('넘긴 뒤 입금관리로 화면을 옮긴다', /window\.navigateTo\('fin\/income'\)/.test(src));
ok('입금관리 목록에 없는 종류(계약·컨설팅비)는 안 넘긴다',
   /HANDOFF_STORES\s*=\s*\{cases:1,\s*consultings:1,\s*funds:1,\s*other_projects:1\}/.test(src));
ok('계약금은 이름이 달라 맞춰서 넘긴다 (contractFee → contract)',
   /HANDOFF_KIND\s*=\s*\{[^}]*contractFee:'contract'/.test(src));
ok('확정 뒤 통장 행을 찍으려고 행 모양을 함께 넘긴다',
   /row:\{date:x\.row\.date\|\|'',\s*amount:x\.row\.amount\|\|0/.test(src));

console.log('\n[입금관리 — 넘어온 줄을 받는다]');

ok('켜질 때 줄을 읽고 지운다 (뒤로 왔다 갔다 해도 다시 안 열린다)',
   /sessionStorage\.getItem\('ledger_confirm_queue'\)[\s\S]{0,120}?removeItem\('ledger_confirm_queue'\)/.test(src));
ok('통장 금액·날짜를 미리 채워 창을 연다',
   /setConfirmModal\(\{p:hit,\s*date:\(q\.row&&q\.row\.date\)\|\|todayYMD\(\)[\s\S]{0,200}?actualAmt:\(q\.row&&q\.row\.amount\)/.test(src));
ok('이미 확정된 건이면 건너뛰고 다음으로',
   /미입금 목록에 없습니다[\s\S]{0,120}?advanceLedgerQueue\(rest\)/.test(src));
ok('확정하면 통장 행에 처리됨을 찍는다',
   /_fromLedger\s*&&\s*_fromLedger\.row\)\s*\{[\s\S]{0,160}?erpMarkBankRowProcessed\(_fromLedger\.row,\s*'income'/.test(src));
ok('확정하면 다음 건을 이어서 연다',
   /if\(_fromLedger\)\s*advanceLedgerQueue\(ledgerQ\)/.test(src));
ok('한 건만 건너뛸 수도 있다', /'건너뛰기 →'/.test(src));

console.log('\n[화면 — 어느 쪽으로 갈지 미리 보인다]');

ok('행마다 ⚡ 또는 📋 배지가 붙는다',
   /'⚡ 자동확정 가능'/.test(src) && /'📋 확인 필요 · '\+g\.why/.test(src));
ok('체크한 것만 세어 버튼에 붙인다',
   /chkAuto\s*=\s*chkKeys\.filter\(function\(k\)\{\s*return gateOf\[k\]\.ok;/.test(src));
ok('넘길 수 없는 종류는 📋 버튼 수에서 뺀다',
   /chkNeed\s*=\s*chkKeys\.filter\([\s\S]{0,120}?canHandoff\(gateOf\[k\]\.pItem\)/.test(src));
ok('직접 고른 건은 관문을 안 재고 창으로 보낸다',
   /why:_mid\?'직접 고른 건':'추천 없음'/.test(src));
ok('자동확정 전에 무엇이 확정되는지 보여준다',
   /⚡ 자동확정 '\+chkAuto\.length\+'건\\n\\n'\+lines/.test(src));

console.log('\n[안전장치]');

ok('자동확정도 되돌릴 수 있다 (확정 이력이 그대로 있다)', /setConfHistOpen\(true\)/.test(src));
ok('자동확정한 건도 적요를 학습한다', /erpLearnPayerAlias\(r\.memo\|\|r\.note\|\|'',\s*g\.pItem\)/.test(src));
ok('자동확정한 통장 행은 처리됨으로 찍힌다', /erpMarkBankRowProcessed\(r,'income','⚡ '/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
