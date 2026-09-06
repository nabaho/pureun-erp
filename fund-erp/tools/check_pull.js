/* 근복지원금 신청액 «당겨오기» — 어디서 온 값인가.

   신청액은 지어낼 값이 아니다. 실제 제출본을 맞춰 보면
     참여사 출연금 + 지자체 출연금 = 신청액
   으로 딱 맞는다(코드 주석의 검증 사례: 272,800,000 + 409,200,000 = 682,000,000).

   한도·점수 화면이 같은 셈을 이미 하지만, 거기까지 가서 [이 금액]·[저장]을 눌러야 했다.
   신청·정산에서 바로 당긴다.

   ⚠ 한도를 넘으면 한도로 자른다 — 넘겨 신청하면 배제되거나 깎인다.
   ⚠ 칸에 «넣어 주기만» 한다. 저장은 사람이 누른다.

   실행: node fund-erp/tools/check_pull.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
function gV(n){const i=src.indexOf('var '+n+'=');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('=',i);k<src.length;k++){const c=src[k];
    if(c==='{'||c==='[')d++;else if(c==='}'||c===']'){d--;if(!d)return src.slice(i,src.indexOf(';',k)+1);}}}
global.num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g,'')); return isFinite(n) ? n : '' };
global.S = { fundId:'X', year:2026, sites:{}, sy:{} };
global.funds = {};
let bad0 = 0;
['SUB_RULE','SUB_BAND','SUB_BAND_LBL','SUB_FIELDS'].forEach(n => { try { (0,eval)(gV(n)) } catch(e) {} });
['subRule','subTier','_subP1','_subP2a','_subP2b','_subP3','_subP3avg','_subP4',
 'subsidyCalc','_subPlanAgg','_subPrevPerWorker','_subPullAmt'].forEach(n => {
  try { (0,eval)(gF(n)) } catch(e) { console.error('  ✗ 못 실음: ' + n + ' — ' + e.message); bad0++; } });

let bad = bad0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };

/* ── 검증 사례 — 참여사 272,800,000 + 지자체 409,200,000 = 682,000,000 ── */
const 참여사 = 272800000, 지자체 = 409200000;
/* 한도는 «근로자 수»로도 걸린다 — 규모를 실제 사례에 맞춰야 682,000,000 이 그대로 나온다 */
S.sites = { s1:{ name:'가', company_size:40, status:'' }, s2:{ name:'나', company_size:60, status:'' } };
S.sy = { s1:{ contrib: 참여사 / 2 }, s2:{ contrib: 참여사 / 2 } };
const f = { _id:'X', fund_type:'공동',
  years:{ 2026:{ subsidy:{ gov_contrib: 지자체, req_type:'3', qual_score:18 } } } };
funds.X = f;

console.log('■ 당겨온 값');
const r = _subPullAmt(f);
console.log('   ' + (r.amt || 0).toLocaleString() + '원  ·  ' + r.why);
/* 설명글만 보면 «더했다고 적어 놓고 안 더한» 것을 못 잡는다 — 금액으로 못 박는다 */
ok('참여사 출연금을 다 더한다', /272,800,000/.test(r.why), r.why);
ok('지자체 출연금도 더한다', /409,200,000/.test(r.why), r.why);
ok('둘을 더한 값이다 (설명이 아니라 «금액»으로)', r.amt === 참여사 + 지자체, r.amt);
ok('어디서 왔는지 말해 준다', r.why.indexOf('참여사 출연금') === 0, r.why);
/* 한도에 걸리면 잘린 값이 나온다 — 자른 것도 말해 줘야 한다 */
/* ⚠ 자르지 않는다. 실제 제출본은 한도를 넘겨 낸 것으로 보인다 —
   유형3 한도는 6억인데 이 사례의 신청액은 6억 8,200만원이다.
   조용히 줄이면 «실제로 낸 금액»과 다른 값을 넣게 된다. 넘는다고 알리기만 한다. */
ok('검증 사례 682,000,000원이 그대로 나온다', r.amt === 682000000, r.amt);
ok('한도를 넘으면 그렇다고 알린다', /한도 .*넘습니다/.test(r.why), r.why);

/* ── 한도를 넘는 해 ── 넘겨 신청하면 배제되거나 깎이므로 «한도»를 준다 ── */
console.log('\n■ 출연금이 한도를 넘을 때');
S.sy = { s1:{ contrib: 5000000000 }, s2:{ contrib: 5000000000 } };
funds.X = { _id:'X', fund_type:'공동', years:{ 2026:{ subsidy:{ req_type:'1', qual_score:18 } } } };
const rc = _subPullAmt(funds.X);
console.log('   ' + (rc.amt || 0).toLocaleString() + '원  ·  ' + rc.why);
ok('그래도 출연금 총액을 준다 (조용히 안 줄인다)', rc.amt === 10000000000, rc.amt);
ok('한도를 넘는다고 알린다', /한도 .*넘습니다 — 확인하세요/.test(rc.why), rc.why);

console.log('\n■ 당길 것이 없을 때');
S.sy = {}; funds.X = { _id:'X', fund_type:'공동', years:{ 2026:{ subsidy:{} } } };
S.sites = { s1:{ name:'가', company_size:40, status:'' } };
const r0 = _subPullAmt(funds.X);
ok('출연금이 없으면 0 을 준다', r0.amt === 0, r0.amt);
ok('그때는 설명도 비운다', r0.why === '', r0.why);

console.log('\n■ 문 닫은 사업장');
S.sy = { s1:{ contrib:1000000 }, s2:{ contrib:9000000 } };
S.sites = { s1:{ company_size:10, status:'' }, s2:{ company_size:10, status:'closed' } };
funds.X = { _id:'X', fund_type:'공동', years:{ 2026:{ subsidy:{} } } };
const r1 = _subPullAmt(funds.X);
ok('문 닫은 곳 출연금은 안 센다', /^참여사 출연금 1,000,000원/.test(r1.why), r1.why);

console.log('\n■ 배선');
ok('신청액 칸에만 단추가 붙는다', src.includes("c[0]==='request_amount'&&_pull.amt"));
ok('저장은 사람이 누른다', src.includes('[저장]을 눌러야 남습니다'));
/* ⚠ 이 저장소의 작업본은 CRLF 로 풀린다 — 줄바꿈을 \n 으로만 찾으면 «있는데도» 안 잡힌다 */
ok('출연금을 미리 읽는다', /syLoad\(\);\s*var _pull=_subPullAmt\(f\);/.test(src));
ok('없으면 어디에 넣으라고 알려 준다', src.includes('참여사업장 › 연도별 기록에 그 해 출연금을'));

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (신청액을 출연금에서 당겨온다)');
process.exit(bad ? 1 : 0);
