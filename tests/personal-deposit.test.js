/* 계약의 「개인입금」 → 입금확정의 「개인수익」 자동 체크 (2026-08-11 대표 지시)
   "컨설팅 계약에서 부가세 포함의 경우 법인에 입금이지만 개인입금인 경우가 있다.
    이럴 경우 개인입금에 체크표시하게 해달라. 그리고 개인입금의 경우 입금관리에서
    개인수익에 체크표시되게 해달라. 그리고 성과급만 반영할 수 있게 하겠다.
    개인수익에 대해서는 클릭된 경우 마우스가 올라갈 경우 볼 수 있게 해달라.
    불필요하게 팝업창이 길게 내려온다."

   ★ 개인입금은 «계약 하나에 하나» 다(대표 확인). 계약금은 법인, 잔금은 개인으로
     들어오는 일은 없다고 보아 종류별로 나누지 않는다.
   ★ 이미 맺어 둔 계약은 건드리지 않는다 — 짐작해서 켜면 법인 매출이 조용히 빠진다. */
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
vm.runInContext(src.slice(src.indexOf('function erpInitDeductions(item, vatType){'),
                          src.indexOf('function calcDeductions(amount, ded){')), ctx);

console.log('\n[① 계약에 개인입금이면 개인수익으로 열린다]');
t('★ 개인수익이 미리 켜진다', ctx.erpInitDeductions({ personalDeposit:true }, 'separate').personalRevenue, true);
/* 개인 계좌로 들어온 돈은 법인 매출이 아니라 부가세 신고 대상이 아니다.
   ★ 부가세 포함 계약이어도 부가세 공제를 켜지 않는다 — 대표가 말한 바로 그 경우다. */
t('★ 부가세 포함 계약이어도 개인수익이 이긴다',
  ctx.erpInitDeductions({ personalDeposit:true }, 'inclusive').personalRevenue, true);
t('★ 그때 부가세 공제는 켜지 않는다',
  ctx.erpInitDeductions({ personalDeposit:true }, 'inclusive').vatIncluded, false);

console.log('\n[② 개인입금이 아니면 예전 그대로다 — 애먼 계약을 건드리면 안 된다]');
t('부가세 포함이면 부가세 공제', ctx.erpInitDeductions({}, 'inclusive'), { vatIncluded:true });
t('부가세 별도면 아무것도 안 켠다', ctx.erpInitDeductions({}, 'separate'), {});
t('알 수 없으면 아무것도 안 켠다', ctx.erpInitDeductions({}, ''), {});
t('계약 자체가 없으면 아무것도 안 켠다', ctx.erpInitDeductions(null, 'separate'), {});
/* ★ 옛 계약에는 이 칸이 아예 없다(undefined). 그때 켜지면 법인 매출이 조용히 빠진다 */
t('★ 옛 계약(칸 없음)은 개인수익을 안 켠다',
  ctx.erpInitDeductions({ companyName:'후암석재' }, 'inclusive'), { vatIncluded:true });
t('개인입금을 껐으면 안 켠다', ctx.erpInitDeductions({ personalDeposit:false }, 'inclusive'), { vatIncluded:true });

console.log('\n[③ 두 입구 모두 같은 규칙을 쓴다]');
t('입금관리 목록의 「입금확정」', /deductions:erpInitDeductions\(p\.item, getVatType\(p\)\)/.test(src), true);
t('거래내역에서 넘어온 건', /deductions: erpInitDeductions\(hit\.item, getVatType\(hit\)\)/.test(src), true);
t('★ 부가세만 보고 열던 옛 코드가 사라졌다',
  /getVatType\((p|hit)\) *===? *'inclusive' *\? *\{ *vatIncluded:true *\} *: *\{\}/.test(src), false);

console.log('\n[④ 계약 화면 — 계약 하나에 하나]');
const PD = src.slice(src.indexOf('function personalDepositBlock(){'),
                     src.indexOf('function personalDepositBlock(){') + 2200);
t('계약 단위 칸이다 (종류별이 아니다)', /f\.personalDeposit/.test(PD), true);
t('켜고 끌 수 있다', /personalDeposit: e\.target\.checked/.test(PD), true);
t('무엇인지 이름으로 말한다', /'👤 개인입금 \(법인 아닌 개인 계좌\)'/.test(PD), true);
/* data-tip(.erp-tip, css/pu-erp.css)은 실제로 잘 뜨지만 white-space:normal 이라 줄바꿈을 못 살린다.
   이 안내는 \n 으로 나뉜 여러 줄 문구라 title 이 맞는 선택이다. */
t('★ 도움말이 실제로 뜨는 방식(title)이다', /title:'법인 통장이 아니라 개인 계좌로/.test(PD), true);
// 여러 줄 문구라 data-tip 이 아니라 title 로 쓰였는지 속성으로 확인한다
t('★ 여러 줄 문구라 data-tip 이 아니라 title 을 썼다', /'data-tip':/.test(PD), false);
t('켜면 무슨 일이 생기는지 알려 준다', /입금확정 시 「개인수익」 자동 체크/.test(PD), true);
/* ★ 함수가 «있다» 만 보면 안 된다 — 만들어 놓고 화면에 안 붙이면 그대로 안 보인다.
   실제로 그려지는 자리(CMS 와 같은 박스 바닥)에 «불리고» 있는지를 본다. */
t('CMS 와 같은 자리(계약 전체 값)에 실제로 붙였다',
  /personalDepositBlock\(\)\n    \);\n  \}\n  function personalDepositBlock\(\)\{/.test(src), true);

console.log('\n[⑤ 이관해도 따라간다 — 안 넘기면 입금확정이 못 본다]');
/* 계약은 사건·컨설팅·기금·기타로 «옮겨진» 뒤에 입금이 잡힌다.
   옮길 때 칸을 빠뜨리면 계약에서 켠 것이 아무 소용이 없다. */
t('사건으로 이관', /personalDeposit: !!contract\.personalDeposit,   \/\/ 👤 개인입금 승계/.test(src), true);
t('컨설팅·기금·기타로 이관', /personalDeposit: !!contract\.personalDeposit, \/\/ 👤 개인입금 승계/.test(src), true);
t('★ 계약관리로 되돌아와도 꺼지지 않는다', /personalDeposit: !!item\.personalDeposit,     \/\/ 👤 개인입금 승계 \(역이관\)/.test(src), true);

console.log('\n[⑥ 왜 켜져 있는지 밝힌다 — 까닭 없이 켜져 있으면 잘못 켠 줄 알고 끈다]');
t('개인수익 옆에 까닭을 적는다', /!!\(it && it\.personalDeposit\) && h\('span'/.test(src), true);
t('무슨 까닭인지', /'· 계약에 개인입금'/.test(src), true);

console.log('\n[⑦ 긴 안내를 한 줄로 접었다 — 창이 길어지던 것]');
const _nStart = src.indexOf("var isPersonal = !!(ded.bizIncomeTax || ded.etcIncomeTax || ded.personalRevenue);");
const NOTE = src.slice(_nStart, _nStart + 2400);
t('한 줄 안내 구역을 잘라냈다', _nStart > 0, true);
t('한 줄 결론만 늘 보인다', /h\('span', \{ style:\{flex:1\} \}, line\)/.test(NOTE), true);
t('자세한 것은 마우스를 올렸을 때', /h\('span', \{ title:tip,/.test(NOTE), true);
t('올려 보라고 표시해 둔다', /'ⓘ 자세히'/.test(NOTE), true);
t('★ 늘 펼쳐져 있던 네 줄짜리 상자가 사라졌다', /'· 손익계산서·예상부가세에서 ', h\('b', null, '자동 제외'\), h\('br'\)/.test(src), false);
t('★ 늘 펼쳐져 있던 파란 상자도 사라졌다', /'✓ 확정 시 자동으로:', h\('br'\)/.test(src), false);
t('겹쳐 있던 개인소득 한 줄도 합쳤다', /'🏢 개인소득 — 법인 매출 미반영 \(손익계산서·예상부가세 자동 제외\)'/.test(src), false);
t('개인수익도 개인소득으로 함께 본다', /ded\.bizIncomeTax \|\| ded\.etcIncomeTax \|\| ded\.personalRevenue/.test(NOTE), true);
t('성과급을 반영하는지 한 줄에 적는다', /'성과급 반영' : '성과급 미반영'/.test(NOTE), true);

console.log('\n[⑧ 개인수익 성과급 조정도 세후 기준]');
/* 2026-08-11 확정: 성과 기준은 세금 뗀 뒤 남은 금액. 저장 로직과 화면이 어긋나면 안 된다. */
t('★ 세전 약정액으로 나누지 않는다', /var b = Math\.round\(_perfBase \* sp \/ 100\);/.test(src), true);
t('옛 세전 셈이 사라졌다', /var b = Math\.round\(confirmModal\.p\.amount \* sp \/ 100\);/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
