// 밀린 자문료를 한 번에 받는 경우 — 코엘이엔지 220,000 × 3개월 = 660,000
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}
function eq(name, got, want){
  const good = JSON.stringify(got) === JSON.stringify(want);
  if(good){ pass++; console.log('  PASS ' + name + '  (' + JSON.stringify(got) + ')'); }
  else { fail++; console.log('  FAIL ' + name + '  받음 ' + JSON.stringify(got) + ' · 기대 ' + JSON.stringify(want)); }
}

// ── 화면의 셈을 그대로 옮겨 돌려본다 ──
const ADV_BACK = 3;
function ymBack(ym, n){
  let y = parseInt(ym.slice(0,4),10), m = parseInt(ym.slice(5,7),10) - n;
  while(m <= 0){ m += 12; y -= 1; }
  return y + '-' + ('0'+m).slice(-2);
}
function advPending(companies, incomes, stmtMonths){
  const paidAmt = {};
  incomes.forEach(i => {
    if(i && i.kind === '자문료' && i.companyName && i.date){
      const k = i.companyName + '|' + (i.advisoryYm || String(i.date).slice(0,7));
      paidAmt[k] = (paidAmt[k]||0) + (parseInt(i.amount,10)||0);
    }
  });
  let lastYm = '2026-06';
  if(stmtMonths.length){ const s=stmtMonths.slice().sort(); lastYm = s[s.length-1]; }
  const ymList = [];
  for(let i=0;i<ADV_BACK;i++) ymList.push(ymBack(lastYm, i));
  const out = [];
  companies.forEach(co => {
    const fee = parseInt(co.monthlyAdvisoryFee,10)||0;
    if(fee<=0) return;
    const pd = co.taxInvoicePaymentDay;
    if(pd==='선납'||pd==='건별'||pd==='분기별') return;
    const start = String(co.contractStartDate||'').slice(0,7);
    ymList.forEach(ym => {
      if(start && ym < start) return;
      const got = paidAmt[co.name+'|'+ym] || 0;
      if(got >= fee) return;
      out.push({ ym, expect: fee-got, paidAmount: got, late: ym !== lastYm, company: co.name });
    });
  });
  return out;
}

console.log('\n[달 거슬러 올라가기]');
eq('6월에서 0달 전', ymBack('2026-06',0), '2026-06');
eq('6월에서 2달 전', ymBack('2026-06',2), '2026-04');
eq('해를 넘긴다 (2월에서 3달 전)', ymBack('2026-02',3), '2025-11');
eq('1월에서 1달 전', ymBack('2026-01',1), '2025-12');

console.log('\n[코엘이엔지 — 3개월 밀렸다가 660,000 한 번에]');
{
  const co = [{ name:'주식회사코엘이엔지', monthlyAdvisoryFee:220000 }];
  const p = advPending(co, [], ['2026-06']);
  eq('안 걷힌 세 달이 모두 후보로 뜬다', p.map(x=>x.ym), ['2026-06','2026-05','2026-04']);
  eq('달마다 220,000 씩', p.map(x=>x.expect), [220000,220000,220000]);
  eq('세 달 합이 입금액과 맞는다', p.reduce((a,x)=>a+x.expect,0), 660000);
  eq('지난 달 것은 「밀림」 으로 표시', p.map(x=>x.late), [false,true,true]);
}

console.log('\n[한 달만 밀린 경우]');
{
  const co = [{ name:'가나상사', monthlyAdvisoryFee:220000 }];
  const inc = [
    {kind:'자문료',companyName:'가나상사',date:'2026-04-25',amount:220000,advisoryYm:'2026-04'},
    {kind:'자문료',companyName:'가나상사',date:'2026-05-25',amount:220000,advisoryYm:'2026-05'},
  ];
  const p = advPending(co, inc, ['2026-06']);
  eq('안 낸 6월만 남는다', p.map(x=>x.ym), ['2026-06']);
  eq('그 달은 밀린 게 아니다', p[0].late, false);
}

console.log('\n[다 낸 업체는 후보가 없다]');
{
  const co = [{ name:'다라산업', monthlyAdvisoryFee:165000 }];
  const inc = ['2026-04','2026-05','2026-06'].map(ym =>
    ({kind:'자문료',companyName:'다라산업',date:ym+'-25',amount:165000,advisoryYm:ym}));
  eq('후보 없음', advPending(co, inc, ['2026-06']).length, 0);
}

console.log('\n[부분입금과 함께 — 한 달은 덜 내고 한 달은 아예 안 냄]');
{
  const co = [{ name:'마바테크', monthlyAdvisoryFee:200000 }];
  const inc = [
    {kind:'자문료',companyName:'마바테크',date:'2026-04-25',amount:200000,advisoryYm:'2026-04'},
    {kind:'자문료',companyName:'마바테크',date:'2026-05-25',amount:150000,advisoryYm:'2026-05'},
  ];
  const p = advPending(co, inc, ['2026-06']);
  eq('6월 전액 + 5월 잔금', p.map(x=>[x.ym,x.expect]), [['2026-06',200000],['2026-05',50000]]);
  eq('덜 낸 달은 받은 금액이 남아 있다', p.find(x=>x.ym==='2026-05').paidAmount, 150000);
  eq('둘을 합치면 250,000', p.reduce((a,x)=>a+x.expect,0), 250000);
}

console.log('\n[계약 시작 전 달은 만들지 않는다]');
{
  const co = [{ name:'신규업체', monthlyAdvisoryFee:110000, contractStartDate:'2026-05-01' }];
  const p = advPending(co, [], ['2026-06']);
  eq('5월·6월만 (4월은 계약 전)', p.map(x=>x.ym), ['2026-06','2026-05']);
}

console.log('\n[선납·건별·분기별은 매달 걷지 않는다]');
['선납','건별','분기별'].forEach(pd => {
  const co = [{ name:'예외업체', monthlyAdvisoryFee:300000, taxInvoicePaymentDay:pd }];
  eq(pd + ' 은 후보 없음', advPending(co, [], ['2026-06']).length, 0);
});

console.log('\n[후보가 너무 불어나지 않게]');
{
  const co = Array.from({length:30}, (_,i) => ({ name:'업체'+i, monthlyAdvisoryFee:200000 }));
  const p = advPending(co, [], ['2026-06']);
  eq('30개 업체 × 3개월 = 90건 (3개월로 못 박음)', p.length, 90);
  ok('6개월이었다면 180건이 됐을 것', 30*6 === 180);
}

console.log('\n[코드에 제대로 붙었는지]');
ok('3개월로 못 박았다', /var ADV_BACK = 3;/.test(src));
ok('명세서의 가장 늦은 달부터 본다', /lastYm = ds\[ds\.length-1\];/.test(src));
ok('달 거슬러 올라가는 함수가 있다', /function _ymBack\(ym, n\)\{/.test(src));
ok('해를 넘겨도 맞게 센다', /while\(m <= 0\)\{ m \+= 12; y -= 1; \}/.test(src));
ok('계약 시작 전 달은 뺀다', /if\(start && ym < start\) return;/.test(src));
ok('밀린 달을 표시한다', /var late = \(ym !== lastYm\);/.test(src));
ok('이름표에 「밀림」 이 붙는다', /\(late\?' 밀림':''\)/.test(src));
ok('왜 뜬 건지 설명이 붙는다', /'지난 달 것이 아직 안 걷혔습니다'/.test(src));
ok('밀린 달은 색으로도 구분된다', /color:s\.cand\.late\?'#b45309':'#64748b'/.test(src));

console.log('\n[합계 후보 — 한 번에 낸 것을 찾아 준다]');
ok('같은 업체 자문료가 2건 넘으면 합계를 찾는다', /function _advArrears\(row\)\{/.test(src));
ok('적요와 이름이 맞는 것만 센다', /if\(\(sg\[i\]\.nameScore\|\|0\) < 60\) continue;/.test(src));
ok('다른 업체는 섞지 않는다', /else if\(cn !== nm\) continue;/.test(src));
ok('두 건 이상이어야 한다', /return n >= 2;/.test(src));
ok('화이트리스트가 아니어도 찾는다',
   /erpComboAllowed\(row\.memo\|\|row\.note\|\|''\) \|\| _advArrears\(row\)/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
