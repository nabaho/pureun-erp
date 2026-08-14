/* 세금계산서 — 탭+통계+도구줄을 두 줄로 + 틀고정 + 표 머리 깔때기
   (2026-08-14 대표 지시) 탭·통계 3칸·도구줄·요약줄이 따로 네 줄을 차지했다.
   통계를 알약으로 줄여 탭 옆에 붙이고, 탭+통계+도구줄 전체를 감싸 sticky 를 건다.
   표 머리(구분·업체명·상태)에는 기존 FunnelBtn(엑셀 자동필터) 을 그대로 꽂는다
   — 계약관리·업체관리가 이미 쓰는 부품이라 새로 지어내지 않는다. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}
const a = src.indexOf('function FinanceInvoice(){');
t('FinanceInvoice 함수를 찾았다', a >= 0, true);

console.log('\n■ 탭+통계+도구줄이 한 덩어리로 묶여 sticky');
const wrapStart = src.indexOf("position:'sticky', top:0, zIndex:5, background:'#fff'", a);
t('감싸는 sticky 칸이 있다', wrapStart >= 0 && wrapStart - a < 60000, true);   // 엑셀 업로드 로직 등이 앞에 있어 render 시작부가 멀다
const wrapEnd = src.indexOf('탭·통계·도구줄 sticky 덩어리 닫음', wrapStart);
t('닫는 표식을 찾았다', wrapEnd > wrapStart, true);
const WRAP = (wrapStart >= 0 && wrapEnd > wrapStart) ? src.slice(wrapStart, wrapEnd) : '';
t('탭(발행관리 등)이 그 안에 있다', WRAP.indexOf('🧾 발행관리') >= 0, true);
t('통계 알약(renderIssueStats)도 그 안에 있다', WRAP.indexOf("tab === 'issue' && renderIssueStats()") >= 0, true);
t('도구줄(renderIssueToolbar)도 그 안에 있다', WRAP.indexOf("tab === 'issue' && renderIssueToolbar()") >= 0, true);
t('감싸는 칸 자신에만 sticky, 안쪽엔 더 없다 (자리다툼 방지)',
  (WRAP.match(/position:'sticky'/g) || []).length, 1);
t('통계가 3칸 그리드로 남아있지 않다 (알약으로 바뀌었다)',
  /gridTemplateColumns:'repeat\(3, 1fr\)', gap:'4px', marginBottom:'8px'/.test(src), false);

console.log('\n■ renderIssueStats — 세 알약');
const F = src.slice(a, a + 70000);
t('전체발행 알약', /'🧾 전체발행 ' \+ filtered\.length \+ '건'/.test(F), true);
t('공급가 알약', /'💰 공급가 ' \+ totalAmount\.toLocaleString\(\)/.test(F), true);
t('부가세 알약', /'📑 부가세 ' \+ totalVat\.toLocaleString\(\)/.test(F), true);

console.log('\n■ 표 머리 깔때기 — 기존 FunnelBtn 재사용 (새로 안 지어냈다)');
t('구분 칸에 FunnelBtn', /'구분',\n\s*h\(FunnelBtn, \{ label:'구분', mini:true/.test(F), true);
t('업체명 칸에 FunnelBtn', /'업체명',\n\s*h\(FunnelBtn, \{ label:'업체명', mini:true/.test(F), true);
t('상태 칸에 FunnelBtn', /'상태',\n\s*h\(FunnelBtn, \{ label:'상태', mini:true/.test(F), true);
t('표 머리글이 sticky', /h\('thead', \{ style:\{ position:'sticky', top:0, zIndex:2, background:'#f8fafc' \} \}/.test(F), true);
t('머리 칸마다 배경이 있다 (sticky 표는 칸마다 배경이 있어야 밑줄이 안 비친다)',
  (F.match(/background:'#f8fafc' \} \}, '/g) || []).length >= 10, true);

console.log('\n■ 걸러내기 판정 — 소스의 진짜 함수를 꺼내 돌린다');
(function(){
  const vm = require('vm');
  const cut = (from, to) => { const i = F.indexOf(from), j = F.indexOf(to, i); return F.slice(i, j); };
  const ctx = { console, Object, Array, String };
  ctx.window = ctx;
  vm.createContext(ctx);
  // invFItems·invFPass 는 클로저(invFunnel state)를 쓰므로, 상태를 흉내내는 최소 받침대로 감싼다
  vm.runInContext(`
    var invFunnel = {};
    function invFGet(k){ return invFunnel[k] || []; }
    ` + cut('function invFItems(axis, rowsBase){', '\n  var listRowsF ='), ctx);

  const rows = [
    { __hometax:false, companyName:'정우신약', status:'발행' },
    { __hometax:true,  companyName:'대운토건주식회사', status:'발행' },
    { __hometax:true,  companyName:'(주)신한오토텍', status:'발행' },
    { __hometax:false, companyName:'정우신약', status:'취소' }
  ];
  const kindItems = ctx.invFItems('kind', rows);
  t('구분 값 — 직접발행·홈택스 두 종류', kindItems.map(x => x.v).sort(), ['직접발행', '홈택스']);
  t('홈택스 개수', kindItems.find(x => x.v === '홈택스').n, 2);
  ctx.invFunnel = { kind:['홈택스'] };
  t('걸면 직접발행이 막힌다', ctx.invFPass(rows[0]), false);
  t('걸면 홈택스는 통과', ctx.invFPass(rows[1]), true);
  ctx.invFunnel = { company:['정우신약'] };
  t('업체명으로 걸러도 된다', rows.filter(r => ctx.invFPass(r)).length, 2);
  ctx.invFunnel = { status:['취소'] };
  t('상태로도 걸린다', rows.filter(r => ctx.invFPass(r)).length, 1);
  ctx.invFunnel = {};
  t('아무것도 안 걸면 전부 통과', rows.filter(r => ctx.invFPass(r)).length, 4);
  // 칸끼리는 «그리고» — 업체명+구분을 같이 걸면 둘 다 맞아야 한다
  ctx.invFunnel = { kind:['직접발행'], status:['취소'] };
  t('칸끼리는 그리고(AND) — 직접발행 이면서 취소인 것만', rows.filter(r => ctx.invFPass(r)).length, 1);
})();

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
