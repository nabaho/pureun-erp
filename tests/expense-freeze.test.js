/* 출금관리 — 다섯 줄을 세 줄로 + 틀고정
   (2026-08-14 대표 지시) 도구줄·통계·지점·검색이 따로 네 줄을 차지해 아래로 밀렸다.
   지점 필터와 검색을 한 줄로 합치고, 도구줄+통계+지점·검색을 한 덩어리로 감싸 sticky 를 건다
   — IncomePendingTab 과 같은 요령(감싸는 칸 하나에만 sticky). */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}
const a = src.indexOf('function FinanceExpense(){');
t('FinanceExpense 함수를 찾았다', a >= 0, true);

console.log('\n■ 도구줄+통계+지점·검색이 한 덩어리로 묶여 sticky');
const wrapStart = src.indexOf("position:'sticky', top:0, zIndex:5, background:'#fff'", a);
t('감싸는 sticky 칸이 있다', wrapStart >= 0 && wrapStart - a < 20000, true);   // FinanceExpense 함수 안 (계산 로직 다음, render 시작부)
const wrapEnd = src.indexOf('도구줄+지점·검색 sticky 덩어리 닫음', wrapStart);
t('닫는 표식을 찾았다', wrapEnd > wrapStart, true);
const WRAP = (wrapStart >= 0 && wrapEnd > wrapStart) ? src.slice(wrapStart, wrapEnd) : '';
t('도구줄(CSV 단추)이 그 안에 있다', WRAP.indexOf('⬇ CSV') >= 0, true);
t('통계(MonthKpiHeader)도 그 안에 있다', WRAP.indexOf('h(MonthKpiHeader,') >= 0, true);
t('지점 필터도 그 안에 있다', WRAP.indexOf('천안 본사') >= 0, true);
t('검색창도 그 안에 있다', WRAP.indexOf('지급처·비고 검색') >= 0, true);
t('감싸는 칸 자신에만 sticky, 안쪽엔 더 없다 (자리다툼 방지)',
  (WRAP.match(/position:'sticky'/g) || []).length, 1);
// 카테고리 카드·거래 목록은 이 sticky 덩어리 «밖» 이어야 한다 — 안에 넣으면 화면 대부분이 고정돼 못 움직인다
t('카테고리 카드 그리드는 sticky 덩어리 밖에 있다', WRAP.indexOf('catCards.map') < 0, true);

console.log('\n■ 지점 필터 + 검색이 한 줄로 합쳐졌는가');
const p1 = WRAP.indexOf('🏢'), p2 = WRAP.indexOf('지급처·비고 검색');
t('지점 필터 다음에 검색창이 이어진다 (검색이 별도 줄로 안 빠졌다)',
  p1 >= 0 && p2 > p1 && (p2 - p1) < 1400, true);
t('검색창이 폭 100% 짜리 독립 줄이 아니다 (flex 로 지점 옆에 붙는다)',
  /flex:'1 1 160px'/.test(WRAP), true);
// 지점 필터를 감싸는 flex 줄이 «하나» 뿐이어야 한다 — 둘이면 다시 따로 두 줄로 갈린 것이다
t('지점 필터를 담는 flex 줄이 하나뿐이다',
  (WRAP.match(/display:'flex', gap:'6px', marginBottom:'10px'/g) || []).length, 1);

console.log('\n■ 카테고리 카드·거래 목록은 그대로 살아 있다 (건드리지 않았다)');
const F2 = src.slice(a, a + 40000);
t('카테고리 카드 그리드 로직이 남아 있다', /var catCards = Object\.keys\(summary\)/.test(F2), true);
t('법인카드 서브그룹 로직이 남아 있다', /if\(catFilter === 'exp-card'\)\{/.test(F2), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
