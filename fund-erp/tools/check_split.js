/* 분할 분개 — 통장 한 줄에 성격이 다른 지출이 섞였을 때, 표마다 제대로 갈라지나.

   ⚠ 이것이 조용히 틀렸던 적이 있다. 조각은 첫 것만 통장 금액을 지니고 나머지엔
     nocash 표가 붙는데, 현금흐름표·수입지출명세서가 그것을 걸러 내면서
     첫 조각에 통장 한 줄이 통째로 몰렸다(경조사비 100,500 · 수수료 0).
     «합계»는 맞아서 기말현금 대조로는 드러나지 않았다 — 계정별로 봐야 보인다.

   실행: node fund-erp/tools/check_split.js

   원래 뜻:
   현금흐름표·수입지출명세서에 제대로 갈라지는지 본다.
   실제 사례: 송금 100,500원 = 목적사업비 100,000 + 지급수수료 500 */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
function gV(n){const i=src.indexOf('var '+n+'=');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('=',i);k<src.length;k++){const c=src[k];
    if(c==='{'||c==='[')d++;else if(c==='}'||c===']'){d--;if(!d)return src.slice(i,src.indexOf(';',k)+1);}}}
global.num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g,'')); return isFinite(n) ? n : '' };
global.S = { fundId: 'X', year: 2026 };
global.funds = { X: { fund_type: '공동', years: { 2026: { opening: {}, reserve_auto: false } } } };
(0, eval)(['ACCT_CHART','PURPOSE_ACCTS','ADMIN_ACCTS','OPEN_ACCT','RESERVE_ACCTS',
  'CF_INVEST','CF_FINANCE','IE_TREE'].map(gV).join('\n') + '\n'
  + ['_openingOf','_splitsOf','_splitSum','_txnDone','expandSplits','journalOf','acctMoves',
     'computeFin','_contribOf','_reserveRate','_rsvSwapOf','_rsvRoles','_reserveAcct',
     'reserveAdjust','_reserveEntry','_reserveEntries','_openAssets','_retLabel','_retVal',
     'stmtBS','stmtIS','cashMoves','cashFlowRows','ieRows'].map(gF).join('\n'));

const T = [
  { _id:'T1', date:'2026-03-02', approved:true, deposit:10000000, withdraw:0,
    memo:'출연금', debit:'현금성자산', credit:'기본재산' },
  /* 통장 한 줄 100,500 을 둘로 쪼갠 것 — 은행이 준 줄은 하나다 */
  { _id:'T2', date:'2026-07-10', approved:true, deposit:0, withdraw:100500, memo:'경조사+수수료',
    debit:'경조사비', credit:'현금성자산',
    splits:[{acct:'경조사비',amount:100000},{acct:'지급수수료',amount:500}] },
];

let bad = 0;
const chk = (n, got, want) => {
  const ok = Math.round(got||0) === Math.round(want||0);
  if (!ok) bad++;
  console.log('  ' + (ok?'·':'✗') + ' ' + n.padEnd(30)
    + String(Math.round(got||0)).padStart(10) + (ok?'':'   기대 ' + want));
};

const fin = computeFin(T, 'X', 2026);
console.log('■ 장부(computeFin) — 여기는 맞나');
chk('목적사업비(경조사비)', fin.tb['경조사비'] ? fin.tb['경조사비'].bal_d : 0, 100000);
chk('일반관리비(지급수수료)', fin.tb['지급수수료'] ? fin.tb['지급수수료'].bal_d : 0, 500);
chk('현금', fin.cash, 10000000 - 100500);

console.log('\n■ 현금 움직임(cashMoves) — 갈라지나');
const mv = cashMoves(T);
chk('경조사비 출금', (mv.by['경조사비']||{}).out, 100000);
chk('지급수수료 출금', (mv.by['지급수수료']||{}).out, 500);
chk('현금 유출 합계', mv.Out, 100500);

console.log('\n■ 수입지출명세서');
const ie = ieRows(T, 'X', 2026);
const row = l => { const r = ie.rows.find(x => x.lbl === l); return r ? r.cur : 0; };
chk('경조사비', row('경조사비'), 100000);
chk('지급수수료', row('지급수수료'), 500);
chk('차기이월금 = 현금', ie.end, fin.cash);

console.log('\n■ 현금흐름표');
const cf = cashFlowRows(T, 'X', 2026);
chk('기말 현금 = 재무상태표 현금', cf.end, fin.cash);

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (분할 분개가 계정별로 갈라짐)');
process.exit(bad ? 1 : 0);
