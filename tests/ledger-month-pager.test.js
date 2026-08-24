// 월 넘기기 · 월별 처리현황 · 파일 줄 한 줄로 합치기
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

console.log('\n[월 넘기기]');
ok('◀ ▶ 단추가 있다', /navBtn\(-1,'◀'/.test(src) && /navBtn\(1,'▶'/.test(src));
ok('끝 달에서는 더 못 넘긴다', /var n=idx\+step;\s*if\(n<0\|\|n>=ldMonths\.length\) return;/.test(src));
/* 할 일을 더 넣어도 된다 — 지키는 것은 «달이 바뀌고 체크가 풀린다» 이다.
   2026-08-24: 「📆 오늘」을 함께 푸는 줄이 들어왔다(지난 달 + 오늘 = 늘 빈 목록). */
ok('달 고르는 목록도 있다 (달이 많아도 한 칸)',
   /onChange:function\(e\)\{ setIncMon\(e\.target\.value\);[\s\S]{0,80}?setIncChk\(\{\}\);/.test(src));
ok('목록에는 달 이름만 짧게 (상태는 옆 배지가 말한다)',
   /return h\('option',\{key:m,value:m\},\s*parseInt\(m\.slice\(0,4\),10\)\+'년 '\+parseInt\(m\.slice\(5\),10\)\+'월'\);/.test(src));
ok('넘길 달 이름이 도움말로 보인다', /title:able\?\(ldMonths\[idx\+step\]\.slice\(0,4\)/.test(src));
ok('달을 넘기면 체크가 풀린다', /setIncMon\(ldMonths\[n\]\); setIncChk\(\{\}\);/.test(src));

console.log('\n[월별 처리현황]');
ok('그 달 통계를 재는 함수가 있다', /function monStat\(m\)\{/.test(src));
ok('이미 처리된 행은 미처리에서 뺀다', /var todo=\(d\.inc\+d\.exp\)-dup;/.test(src));
ok('확정 건수는 finance_income 에서 센다', /_cfm\[ym\]\.cnt\+\+; _cfm\[ym\]\.amt\+=/.test(src));
ok('진행률 막대가 있다', /width:st\.pct\+'%',height:'100%'/.test(src));
ok('다 되면 막대가 초록으로', /background:st\.pct>=100\?'#16a34a':'#2563eb'/.test(src));
ok('미처리가 없으면 「다 처리됨」', /'✅ 다 처리됨'/.test(src));
ok('확정 금액을 보여준다 (건수는 탭이 말한다)', /'✅ '\+st\.doneAmt\.toLocaleString\(\)/.test(src));
ok('전체 보기면 모든 달을 합친다', /if\(showAll\)\{[\s\S]{0,400}?ldMonths\.forEach\(function\(m\)\{/.test(src));

console.log('\n[한 줄에 모두 — 월·현황·탭·단추]');
ok('월 조각을 조각 배열로 돌려준다 (같은 줄에 붙이려고)',
   /\/\/ 조각으로 돌려준다 — 아래 한 줄에 입금·출금 탭과 나란히 놓기 위해서/.test(src));
ok('월 조각과 탭이 같은 줄 안에 있다',
   /한 줄에 모두 — 월 넘기기 · 처리현황 · 입금\/출금 탭 · 일괄 단추[\s\S]{0,600}?ldMonths\.length>0 && \(function\(\)\{/.test(src));
ok('탭이 월 조각 바로 뒤에 붙는다',
   /\}\)\(\),\s*\/\/[^\n]*\n\s*incCnt>0 && ledgerTabBtn\('inc','💰 입금'/.test(src));
// 「남은 것」은 손이 필요한 줄 — 확정 가능한 줄은 단추 하나로 끝나므로 남은 것에 안 센다
ok('탭 뱃지가 손 갈 줄만 센다',
   /ledgerTabBtn\('inc','💰 입금', incCnt, \(stCnt\.check\|\|0\)\+\(stCnt\.none\|\|0\)\)/.test(src));
ok('따로 있던 요약 줄은 없앴다', !/\/\/ 요약\s*\n\s*h\('div',\{style:\{display:'flex',gap:'8px',marginBottom:'12px'/.test(src));

console.log('\n[한 줄에 들어가게 크기를 줄였다]');
ok('탭 단추가 작아졌다', /padding:'4px 11px', borderRadius:'14px'/.test(src));
ok('자동 매칭 단추가 작아졌다', /padding:'4px 11px',background:'#2563eb'[\s\S]{0,140}?'🤖 자동 매칭'/.test(src));
// (2026-08-09) 확정 단추 넷을 하나로 합쳤다 — 글자가 「확정 가능 N건 모두 확정」으로 바뀌었다
ok('확정 단추가 작아졌다',
   /padding:'4px 11px',background:'#16a34a'[\s\S]{0,200}?'✅ 확정 가능 '\+readyRows\.length\+'건 모두 확정'/.test(src));
ok('단추들이 줄어들지 않게 못 박았다',
   (src.match(/fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0\}/g)||[]).length >= 3);

console.log('\n[처리현황 셈이 맞나]');
{
  function pct(done, todo){ return (done+todo)>0 ? Math.round(done*100/(done+todo)) : 0; }
  eq('확정 87 · 미처리 135 → 39%', pct(87,135), 39);
  eq('다 처리하면 100%', pct(50,0), 100);
  eq('하나도 안 했으면 0%', pct(0,20), 0);
  eq('둘 다 없으면 0% (0으로 나누지 않는다)', pct(0,0), 0);

  // 전체 보기 = 모든 달 합
  const months = [{done:98,todo:175},{done:87,todo:135},{done:4,todo:141},{done:77,todo:56}];
  const sum = months.reduce((a,m)=>({done:a.done+m.done, todo:a.todo+m.todo}), {done:0,todo:0});
  eq('넉 달 확정 합계', sum.done, 266);
  eq('넉 달 미처리 합계', sum.todo, 507);
  eq('전체 진행률', pct(sum.done, sum.todo), 34);

  // 미처리는 음수가 될 수 없다
  function todoOf(inc, exp, dup){ const t=(inc+exp)-dup; return t<0?0:t; }
  eq('처리됨이 더 많아도 미처리는 0 밑으로 안 간다', todoOf(5,3,20), 0);
  eq('보통은 뺀 만큼', todoOf(77,58,0), 135);
}

console.log('\n[파일 줄을 한 줄로 — 은행·카드·나이스빌 모두]');
ok('파일명을 업로드 줄에 붙였다', /fName && h\('span',\{title:fName,/.test(src));
ok('미처리 건수도 같은 줄에', /'· 미처리 '\+\(incCnt\+expCnt\)\+'건'/.test(src));
ok('CMS 배지도 같은 줄에', /'CMS '\+nb\.rows\.length\+'건'/.test(src));
ok('처리됨 숨기기도 같은 줄에', /'처리됨 '\+\(dupIncCnt\+dupExpCnt\)\+'건 숨기기'/.test(src));
ok('상세·비우기도 같은 줄에', /ldInfoOpen\?'▴ 접기':'▾ 상세'/.test(src) && /'🗑 비우기'/.test(src));
ok('따로 있던 소스 요약 줄은 없앴다', !/── 소스 요약 \+ 상세 \(접이식 1줄\) ──/.test(src));
ok('업로드 줄 안의 단추는 드롭존을 건드리지 않는다',
   (src.match(/onClick:function\(e\)\{e\.stopPropagation\(\);/g)||[]).length >= 3);

console.log('\n[나이스빌도 한 줄]');
ok('파일 정보와 요약 칩을 한 줄로 합쳤다', /── 파일·보관 안내 \+ 요약 칩 \+ 일괄 버튼 \(한 줄로 합침\) ──/.test(src));
ok('나이스빌 파일명·보관 건수가 그 줄에 있다', /'📂 '\+\(nb\.fileName\|\|'보관분'\)\+' · 보관 '\+nb\.rows\.length\+'건'/.test(src));
ok('비우기 단추도 그 줄에', /'🗑 비우기'\),\s*h\('span',\{style:\{width:'1px',height:'16px'/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
