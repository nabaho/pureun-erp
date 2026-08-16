/* 손익계산서 — 세 줄을 한 줄로 + 틀고정
   (2026-08-14 대표 지시) 연도이동·통계칸·탭이 세 줄이라 목록이 그만큼 아래로 밀렸다.
   통계칸을 알약으로 줄여 한 줄에 담고, 그 줄을 감싸 sticky 를 건다.
   월별·카테고리별 표는 제 몸 안에서만 구르는 상자로 만들어 머리글이 그 안에서 붙는다. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}
const a = src.indexOf('function FinancePnL(){');
t('FinancePnL 함수를 찾았다', a >= 0, true);

console.log('\n■ 연도이동+통계+탭이 한 줄로 묶여 sticky');
const wrapStart = src.indexOf("position:'sticky',top:0,zIndex:5,background:'#fff'", a);
t('감싸는 sticky 칸이 있다', wrapStart >= 0 && wrapStart - a < 20000, true);
const wrapEnd = src.indexOf('연도·KPI·탭 sticky 덩어리 닫음', wrapStart);
t('닫는 표식을 찾았다', wrapEnd > wrapStart, true);
const WRAP = (wrapStart >= 0 && wrapEnd > wrapStart) ? src.slice(wrapStart, wrapEnd) : '';
t('연도 이동(◀▶)이 그 안에 있다', WRAP.indexOf('yearPrev') >= 0 && WRAP.indexOf('yearNext') >= 0, true);
t('세 KPI(매출·지출·순이익)가 알약으로 그 안에 있다',
  WRAP.indexOf('💵 매출 ') >= 0 && WRAP.indexOf('💸 지출 ') >= 0 && WRAP.indexOf('📈 순이익 ') >= 0, true);
t('KPI 가 세 칸 그리드로 돌아가지 않았다 (알약 한 줄)',
  /gridTemplateColumns:'repeat\(3,1fr\)'/.test(WRAP), false);
t('탭(월별손익 등)도 같은 줄 안에 있다', WRAP.indexOf('월별 손익') >= 0, true);
t('CSV 단추도 같은 줄 안에 있다', WRAP.indexOf('⬇ CSV') >= 0, true);
t('감싸는 칸 자신에만 sticky, 안쪽엔 더 없다 (자리다툼 방지)',
  (WRAP.match(/position:'sticky'/g) || []).length, 1);

console.log('\n■ 월별·카테고리별 표가 제 몸 안에서만 구른다');
const F = src.slice(a, a + 45000);
/* ⚠ 높이 «숫자» 를 글자 그대로 박아 두지 않는다 — 2026-08-16 에 창 바닥까지 채우도록
   공용 도우미로 바뀌면서 이 검사가 깨졌다. 여기서 지킬 것은 「제 몸 안에서 구른다」,
   즉 overflow:auto 와 높이 한도가 «있다» 는 것뿐이다. 얼마인지는 이 검사가 볼 일이 아니다. */
t('월별 손익 표 상자가 overflow:auto + 높이 한도',
  /viewMode==='month' \? h\('div',\s*\{\s*ref:[A-Za-z_$][\w$]*\.ref,style:\{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'auto',maxHeight:\(/.test(F), true);
t('월별 손익 머리글이 sticky', /viewMode==='month'[\s\S]{0,400}?h\('thead',\{style:\{position:'sticky',top:0,zIndex:2\}\}/.test(F), true);
t('카테고리별 지출 표 상자도 overflow:auto + 높이 한도',
  /viewMode==='category' \? h\('div',\s*\{\s*ref:[A-Za-z_$][\w$]*\.ref,style:\{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'auto',maxHeight:\(/.test(F), true);
t('카테고리별 지출 머리글도 sticky', /viewMode==='category'[\s\S]{0,400}?h\('thead',\{style:\{position:'sticky',top:0,zIndex:2\}\}/.test(F), true);

console.log('\n■ 분석 차트·표 안 계산은 그대로 살아 있다 (건드리지 않았다)');
t('바 차트 로직이 남아 있다', /var maxVal = Math\.max\.apply\(null, monthlyData\.map/.test(F), true);
t('카테고리 순위 합계 로직이 남아 있다', /h\('td',\{colSpan:2,style:\{padding:'5px 7px',fontWeight:800\}\},'합계'\)/.test(F), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
