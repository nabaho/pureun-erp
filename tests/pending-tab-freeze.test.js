/* 입금관리 ▸ 미입금 대기 — 안내띠·검색줄·표 머리글 틀고정
   (2026-08-14 대표 지시) 목록을 스크롤해도 위 안내·검색·표 머리글이 화면에 그대로 남게 한다.

   두 줄을 따로 sticky 걸면 서로 겹치지 않게 자로 재야 한다 — 그래서
   «감싸는 칸 하나» 에만 sticky 를 걸고, 표는 «제 몸 안에서만» 구르는 상자로 만들어
   그 안의 머리글이 0을 기준으로 붙게 한다. 두 sticky 가 서로 자리를 안 다투는 요령이다. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}
// IncomePendingTab 조각만 떼어 본다 — 다음 최상위 함수 앞까지
// 인자 목록까지 못 박지 않는다 — props 를 받게 되면 그 자리에서 깨진다 (2026-08-16 에 그랬다)
const a = src.indexOf('function IncomePendingTab(');
const b = src.indexOf('\nfunction FinanceExpense(){', a);
const F = (a >= 0 && b >= 0) ? src.slice(a, b) : '';
t('IncomePendingTab 조각을 찾았다', F.length > 3000, true);

console.log('\n■ 안내띠 + 검색줄이 한 덩어리로 묶여 있다');
// 「감싸는 칸」 을 먼저 도려낸 뒤, 그 «안에서만» 안내띠·검색줄을 찾는다 —
// 이 함수는 휴지통 팝업 등 무관한 모달을 여럿 품고 있어 넉넉한 문자 폭으로는 못 가른다.
const wrapStart = F.indexOf("position:'sticky', top:0, zIndex:5, background:'#fff'");
t('감싸는 sticky 칸이 있다', wrapStart >= 0, true);
// 검색줄 끝의 ')),' (닫는 표식, 다른 곳엔 없는 코드) 로 감싸는 칸의 끝을 찾는다
const wrapEnd = F.indexOf("h(PageSizeSelector, { pageSize:pendPageSize, setPageSize:setPendPageSize, setPage:pendPg.setPage })\n    ))", wrapStart);
const WRAP = (wrapStart >= 0 && wrapEnd >= 0) ? F.slice(wrapStart, wrapEnd) : '';
t('감싸는 칸의 끝(검색줄 뒤 닫는 괄호)도 찾았다', WRAP.length > 500, true);
t('안내띠(⏳)가 그 칸 안에 있다', WRAP.indexOf('⏳ 입금 도착') >= 0, true);
t('검색줄(🔍)도 같은 칸 안에 있다', WRAP.indexOf('🔍 업체·번호·담당') >= 0, true);
// WRAP 자신의 sticky 선언 1개는 있어야 정상 — 그 «안쪽» 에는 더 없어야 한다
// (안내띠·검색줄에 따로 걸면 자리다툼이 난다)
t('감싸는 칸 자신에만 sticky, 안쪽엔 더 없다 (자리다툼 방지)',
  (WRAP.match(/position:'sticky'/g) || []).length, 1);

console.log('\n■ 표는 제 몸 안에서만 구른다');
/* ⚠ 높이 «숫자» 를 글자 그대로 박아 두지 않는다 — 2026-08-16 에 창 바닥까지 채우도록
   재서 정하는 방식으로 바뀌면서 이 검사가 깨졌다. 여기서 지킬 것은 「제 몸 안에서 구른다」,
   즉 overflow:auto 와 «높이 한도가 있다» 는 것뿐이다. 얼마인지는 이 검사가 볼 일이 아니다. */
t('표를 감싼 칸이 overflow:auto + 높이 한도를 가진다',
  /overflow:'auto', background:'#fff',\n\s*maxHeight:/.test(F), true);
t('overflow:hidden 으로 되돌아가지 않았다 (그러면 sticky 가 아무 일도 못 한다)',
  /overflow:'hidden',background:'#fff'\}\} \},\n\s*h\('table'/.test(F), false);
t('표 머리글이 그 상자 기준 0 에 붙는다',
  /h\('thead', \{ style:\{position:'sticky',top:0,zIndex:2\} \}/.test(F), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
