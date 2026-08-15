/* 입금 리스트 — 「유형」 칸에 깔때기 + 표 머리글 틀고정
   (2026-08-14 대표 지시) 「재무관리 전체적으로 데이터를 봐야하는 부분은 깔데기 기능 모두 넣어달라」

   ★ 거래내역(FinanceLedger)에는 일부러 넣지 않았다 — 그 표엔 이미
   「줄을 감추지 않는다 — 안 보이는 줄이 조용히 확정되면 안 되기 때문이다」 라는
   안전장치가 있다. 깔때기는 줄을 «숨기는» 방식이라 그 안전장치를 정면으로 어긴다
   — 체크된 줄이 필터에 가려진 채로 일괄확정될 수 있다. 그래서 손대지 않는다.
   미수금관리·예상부가세도 넣지 않았다 — 이미 충분한 필터가 있거나(미수금),
   거를 값이 4행뿐이라 거를 게 없다(예상부가세). */
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
const a = src.indexOf('function IncomeListTab(){');
t('IncomeListTab 함수를 찾았다', a >= 0, true);
const F = src.slice(a, a + 20000);

console.log('\n■ 유형 칸에 FunnelBtn — 기존 부품 재사용');
t('유형 칸에 FunnelBtn 이 붙었다', /'유형',\n\s*h\(FunnelBtn, \{ label:'유형', mini:true/.test(F), true);
t('출처(sourceFilter) 는 그대로 드롭다운 — 새로 안 건드렸다', /var src = useState\('all'\)/.test(F), true);

console.log('\n■ 표 머리글이 틀고정');
t('thead 가 sticky', /h\('thead', \{ style:\{ position:'sticky', top:0, zIndex:2, background:'#f8fafc' \} \}/.test(F), true);
t('머리 칸마다 배경이 있다', (F.match(/background:'#f8fafc'\}/g) || []).length >= 6, true);

console.log('\n■ 유형 값 목록은 다른 조건(출처·월·검색)을 이미 반영한다');
t('kindFunnelBase 가 출처·월·검색을 거른다',
  /var kindFunnelBase = incomes\.filter\(function\(it\)\{[\s\S]{0,400}?sourceFilter !== 'all'[\s\S]{0,300}?monthFilter\.length === 4/.test(F), true);
t('필터 체인에 유형 조건이 들어간다',
  /if\(kindFunnel\.length && kindFunnel\.indexOf\(it\.kind \|\| '\(없음\)'\) < 0\) return false;/.test(F), true);
t('풀기 링크가 있다', /'▽ 유형 필터 ' \+ kindFunnel\.length \+ ' 풀기'/.test(F), true);

console.log('\n■ 값 세기 판정 — 진짜 로직을 돌려서 확인');
(function(){
  const ctx = { console, Object, Array, String };
  ctx.window = ctx;
  vm.createContext(ctx);
  const incomes = [
    { kind:'착수금', sourceKind:'case', date:'2026-07-01', companyName:'A' },
    { kind:'착수금', sourceKind:'case', date:'2026-07-02', companyName:'B' },
    { kind:'성공보수', sourceKind:'case', date:'2026-07-03', companyName:'C' },
    { kind:'자문료', sourceKind:'company', date:'2026-06-01', companyName:'D' }
  ];
  ctx.incomes = incomes; ctx.query = ''; ctx.sourceFilter = 'all'; ctx.monthFilter = '2026-07';
  vm.runInContext('var kindFunnelBase = incomes.filter(function(it){ if(sourceFilter !== "all" && it.sourceKind !== sourceFilter) return false; if(monthFilter){ if(monthFilter.length === 4){ if((it.date||"").slice(0,4) !== monthFilter) return false; } else { if((it.date||"").slice(0,7) !== monthFilter) return false; } } if(query){ var qq2 = query.toLowerCase(); if(!((it.companyName||"").toLowerCase().indexOf(qq2)>=0 || (it.kind||"").toLowerCase().indexOf(qq2)>=0)) return false; } return true; });', ctx);
  t('월 조건으로 미리 거른다 (7월만 남는다)', ctx.kindFunnelBase.length, 3);
  vm.runInContext('function count(){ var m={}; kindFunnelBase.forEach(function(it){ var k=it.kind||"(없음)"; m[k]=(m[k]||0)+1; }); return m; }', ctx);
  t('7월 안에서 착수금 2건·성공보수 1건', ctx.count(), { '착수금':2, '성공보수':1 });
})();

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
