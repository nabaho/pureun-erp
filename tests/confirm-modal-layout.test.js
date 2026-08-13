/* 입금확정 창 — 한 줄씩 · 담당자 눈에 띄게 · 성과급 미리보기
   (2026-08-13 대표 지시)
     ① 창이 세로로 13줄까지 늘어져 아래가 잘렸다
     ② 주담당·부담당이 오른쪽 위 회색 잔글씨라 눈에 안 띄었다
     ③ 성과급이 «누구에게 얼마·몇 %» 인지 확정 전에 안 보였다
        — 「분할」 을 체크했을 때만 나와서, 주담당 100% 인 흔한 경우엔 아무것도 없었다 */
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
// 확정창 부분만 떼어 본다 — 다른 화면의 비슷한 낱말에 속지 않게
const a = src.indexOf('function whoName(sid){');
const b = src.indexOf("h('div', { className:'modal-f' }", a);
const MODAL = (a >= 0 && b >= 0) ? src.slice(a, b) : '';
t('확정창 조각을 찾았다', MODAL.length > 2000, true);

console.log('\n■ ① 한 줄씩 — 창이 짧아졌는가');
t('창이 600px 로 넓어졌다', /className:'modal', style:\{width:'600px',maxWidth:'96vw'\}/.test(MODAL), true);
t('업체·종류를 제목으로 올렸다', /'💰 입금확정 — ' \+ \(it\.companyName\|\|'-'\)/.test(MODAL), true);
t('업체·종류를 본문에서 두 줄로 되풀이하지 않는다',
  /h\('strong', null, '업체: '\)/.test(MODAL), false);
t('담당·약정이 한 줄', /h\('span', \{ style:keyS \}, '담당'\)[\s\S]{0,900}?'약정'/.test(MODAL), true);
t('입금일·통장 근거가 한 줄', /h\('span', \{ style:keyS \}, '입금일 \*'\)[\s\S]{0,1600}?통장에서 못 찾았습니다/.test(MODAL), true);
t('실제입금·완납·결제수단이 한 줄',
  /h\('span', \{ style:keyS \}, '실제입금'\)[\s\S]{0,3000}?payBtn\(cardMode, '카드'/.test(MODAL), true);
// 통장 근거가 좁은 칸에서 일곱 줄로 흘러내리던 것 — 한 줄로 자른다
t('통장 근거를 한 줄로 자른다', /whiteSpace:'nowrap',overflow:'hidden',\s*\n?\s*textOverflow:'ellipsis'/.test(MODAL), true);
t('통장 금액 차이는 실제입금 옆에서 알린다', /'◐ 통장보다 ' \+ Math\.abs\(bankGap\)/.test(MODAL), true);

console.log('\n■ ② 주담당·부담당이 눈에 띄는가');
t('파란 알약으로 그린다', /var chipMain = \{[\s\S]{0,220}?background:'#1e40af', color:'#fff'/.test(MODAL), true);
t('주담당 알약', /h\('span', \{ style:chipMain \}, '주 ' \+ whoName\(mainSid\)\)/.test(MODAL), true);
t('부담당 알약', /h\('span', \{ key:s, style:chipSub \}, '부 ' \+ whoName\(s\)\)/.test(MODAL), true);
t('주담당이 없으면 빨갛게 알린다', /'⚠ 주담당 미지정'/.test(MODAL), true);
t('오른쪽 위 회색 잔글씨를 없앴다', /h\('span', \{ style:\{color:'#94a3b8'\} \}, '주담당 '\)/.test(MODAL), false);
t('이름 찾기를 한 곳으로 모았다 (SID·이름 둘 다 받는다)',
  /function whoName\(sid\)\{[\s\S]{0,320}?byName \? byName\.name : sid/.test(MODAL), true);

console.log('\n■ ③ 성과급 미리보기 — 늘 보이는가');
t('분할을 안 켜도 보인다 (!split 일 때 그린다)',
  /!split && h\('div',[\s\S]{0,900}?'⭐ 성과급 — 확정하면 이렇게 나뉩니다'/.test(MODAL), true);
t('저장할 때 쓰는 calcPerfShares 로 셈한다 — 화면과 실제가 달라선 안 된다',
  /_sh = calcPerfShares\(_perfBase, mainSid, subSids,\s*\n?\s*confirmModal\.p\.store\.sourceKind, 100, \{ paidDate:confirmModal\.date \}\)/.test(MODAL), true);
t('이름·분할%·요율%·지급액을 적는다',
  /'이름'[\s\S]{0,200}?'분할'[\s\S]{0,120}?'요율'[\s\S]{0,120}?'지급액'/.test(MODAL), true);
t('총 성과급도 적는다', /'총 성과급'/.test(MODAL), true);
t('셈을 그대로 보여준다 (입금 − 차감 = 성과 기준)',
  /'입금 ' \+ _cmPay\.toLocaleString\(\)[\s\S]{0,260}?' = 성과 기준 ' \+ _perfBase/.test(MODAL), true);

console.log('\n■ 성과급을 못 나누는 경우를 숨기지 않는다');
t('자동 반영을 끄면 그렇다고 적는다', /성과급 자동 반영을 껐습니다/.test(MODAL), true);
t('개인수익이면 그렇다고 적는다', /👤 개인수익 — 성과 배분은 아래 개인수익 칸에서 정합니다/.test(MODAL), true);
t('주담당이 없으면 그렇다고 적는다', /⚠ 주담당이 지정되지 않아 성과급을 나눌 수 없습니다/.test(MODAL), true);
t('수습·퇴사로 0원이 된 사람은 까닭과 함께 남긴다',
  /s\.probation \|\| s\.retired \|\| s\.role === '주담당'/.test(MODAL), true);
t('수습 표시', /'수습 · 미지급'/.test(MODAL), true);
t('퇴사 표시', /'퇴사 · 미지급'/.test(MODAL), true);

console.log('\n■ 나누기 켜고 끄기');
t('미리보기 안에서 켠다', /'⚖️ 부담당과 나누기'\)/.test(MODAL), true);
t('분할표 안에서 끈다', /'⚖️ 부담당과 나누기 \(끄면 주담당 100%\)'/.test(MODAL), true);
t('부담당이 없으면 켜는 칸을 안 보여준다', /hasSubs && h\('label'/.test(MODAL), true);
t('켜면 분할표가 나온다', /split && h\('div', \{ style:\{padding:'12px',background:'#f8fafc'/.test(MODAL), true);

console.log('\n■ 미리보기 값이 저장 값과 같은 셈인가 (진짜 함수로 확인)');
(function(){
  const ctx = { console, Math, Object, JSON, parseInt, parseFloat, String, Array };
  ctx.window = ctx;
  vm.createContext(ctx);
  const cut = (x, y) => { const i = src.indexOf(x), j = src.indexOf(y, i); return src.slice(i, j); };
  vm.runInContext('function erpWithholdTax(a,k,r){return {total:Math.round(a*(k==="biz"?0.033:(r||8.8)/100))};}', ctx);
  vm.runInContext('function getMgrRates(){return {};} function dbGet(k,d){return k==="user_accounts"?[{sid:"P-001",name:"권형하"},{sid:"P-002",name:"김동현"}]:d;}', ctx);
  vm.runInContext('function getRateAt(sid,d){return sid==="P-001"?15:10;} function resolveBaseRate(sid){return getRateAt(sid);}', ctx);
  vm.runInContext(cut('function erpInitDeductions(item, vatType){', '\nfunction FeeDeductionPanel('), ctx);
  vm.runInContext(cut('function calcPerfShares(amount, mainSid, subSids, sourceKind, splitMainPct, opts){', '\nfunction genCaseNo('), ctx);

  // 정우신약 착수금 6,000,000 · 부가세 포함 → 성과 기준 5,454,545 · 주담당 15%
  const base = ctx.calcDeductions(6000000, { vatIncluded:true }).perfBaseAmount;
  t('성과 기준 (6,000,000 − 1/11)', base, 5454545);
  const sh = ctx.calcPerfShares(base, 'P-001', [], 'case', 100, { paidDate:'2026-07-02' });
  t('주담당 한 사람', sh.length, 1);
  t('요율 15%', sh[0].pct, 15);
  t('분할 100%', sh[0].sharePct, 100);
  t('지급액 = 5,454,545 × 15%', sh[0].amount, 818182);
})();

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
