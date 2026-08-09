// 나눠담기 창 — 체크하기 전에 어떤 건인지·담당자·금액이 보여야 한다
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

// 나눠담기 모달 부분만 잘라서 본다 (다른 화면의 비슷한 코드에 속지 않게)
const mStart = src.indexOf('// ── 나눠담기 모달 (2-2 좌우 대조) ──');
const mEnd   = src.indexOf('// ── 1-1 입금 상세 팝업', mStart);
const modal  = (mStart >= 0 && mEnd > mStart) ? src.slice(mStart, mEnd) : '';

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

console.log('\n[모달을 찾았나]');
ok('나눠담기 모달 코드를 잘라냈다', modal.length > 2000, '길이 ' + modal.length);

console.log('\n[체크하기 «전에» 보여야 할 것 — 한 줄에 다 있다]');
ok('종류 배지 (사건·컨설팅·기금·기타)', /var _bd=storeBadge\(p\.store\)/.test(modal));
/* (2026-08-09) 업체명이 비어 보여 어느 회사 건인지 확인이 안 됐다(대표 지적).
   기록마다 이름이 든 칸이 달라 차례로 물러나 찾고(erpWhoOf), 그래도 없으면 «빨갛게» 알린다 —
   회색으로 두면 그냥 빈 칸으로 보고 지나친다. 건명(erpTitleOf)도 옆 칸에 함께 적는다. */
ok('업체명', /_who \|\| h\('span',\{style:\{color:'#dc2626'/.test(modal));
ok('업체명을 여러 칸에서 찾는다', /var _who=erpWhoOf\(p\);/.test(modal));
ok('건명도 함께 보여준다', /var _title=erpTitleOf\(p\);/.test(modal));
ok('항목 (착수·잔금·성공보수 등)', /width:'82px',color:'#64748b'\}\)\},p\.label\|\|''/.test(modal));
ok('관리번호', /var _no=\(p\.item&&\(p\.item\.caseNo\|\|p\.item\.no\)\)\|\|''/.test(modal));
ok('담당자', /width:'48px',color:'#475569',fontWeight:600\}\)\},_staff\|\|'-'/.test(modal));
ok('예상입금 금액', /fontWeight:700,color:'#16a34a'\}\)\},ea\.toLocaleString\(\)/.test(modal));
ok('입금과의 차이', /_dd===0\?'입금과 일치':\(_dd>0\?'\+':''\)\+_dd\.toLocaleString\(\)/.test(modal));
/* 금액만으로는 «그 사람에게 몇 %로 얼마가 갔는지» 확인할 수 없다(대표 지적) —
   이름과 요율을 함께 적고, 마우스를 올리면 사람별로 다 보인다. */
ok('성과급 미리보기', /_pt>0 \? \(_perf\.map/.test(modal));
ok('성과 요율을 보여준다', /ps\.pct\+'%'/.test(modal));
// 칸이 비어도 자리를 지키게 조건부(&&)를 삼항(?:)으로 바꿨다 — 정렬 때문
ok('부가세 표시', /_tax \? h\('span'/.test(modal));

console.log('\n[한 줄로 줄맞춤]');
// 성과 칸은 이름·요율이 들어가 118px 로, 건명 칸(140px)이 새로 붙었다
['38px','140px','82px','108px','48px','46px','78px','70px','118px'].forEach(function(w){
  ok('칸 너비 ' + w, new RegExp("width:'" + w + "'").test(modal));
});
ok('업체명만 늘어난다', /flex:'1 1 90px'/.test(modal));
ok('줄바꿈 없이 한 줄', /whiteSpace:'nowrap',cursor:'pointer'/.test(modal));
ok('줄 아무 데나 눌러도 담긴다', /onClick:function\(\)\{\s*var nm=Object\.assign\(\{\},spSel\);\s*if\(on\) delete nm\[p\.id\]; else nm\[p\.id\]=ea;/.test(modal));

console.log('\n[찾기·정렬]');
ok('검색 상자가 있다', /placeholder:'업체·번호·담당으로 찾기'/.test(modal));
ok('업체·항목·번호·담당으로 찾는다',
   /\(p\.companyName\|\|''\)\+' '\+\(p\.label\|\|''\)\+' '[\s\S]{0,120}?\+_pendStaff\(p\)/.test(modal));
ok('이미 담은 건은 검색해도 계속 보인다', /if\(spSel\[p\.id\]!==undefined\) return true;/.test(modal));
ok('금액이 가까운 순으로 올린다', /return da-db;/.test(modal));
ok('현장클리닉 묶음이면 클리닉을 먼저', /if\(_clinic\)\{[\s\S]{0,220}?if\(ca!==cb\) return ca-cb;/.test(modal));
ok('현장클리닉일 때 머리말이 바뀐다', /🏥 현장클리닉을 먼저 보여줍니다/.test(modal));
ok('찾는 게 없으면 알려준다', /'찾는 건이 없습니다'/.test(modal));

console.log('\n[담은 뒤 상세 — 한 줄과 겹치지 않게]');
ok('약정 수수료를 보여준다', /'약정 수수료'/.test(modal));
ok('이미 받은 돈이 있으면 보여준다 (부분입금)', /'이미 받음'/.test(modal));
ok('배분 금액을 고칠 수 있다', /'배분 금액:'/.test(modal));
ok('겹치던 「사업」 줄은 뺐다', !/h\('span',\{style:\{color:'#64748b'\}\},'사업'\)/.test(modal));
ok('겹치던 「예상입금」 줄은 뺐다', !/h\('span',\{style:\{color:'#64748b'\}\},'예상입금'\)/.test(modal));
ok('겹치던 「담당」 줄은 뺐다', !/h\('span',\{style:\{color:'#64748b'\}\},'담당'\)/.test(modal));

console.log('\n[검색어 뒷정리]');
ok('창을 닫으면 검색어·종류 필터를 지운다', /function closeModal\(\)\{[\s\S]{0,140}?setSpQ\(''\);setSpKind\(''\);\}/.test(modal));
ok('창을 열 때도 검색어를 지운다', /setSpSel\(init\); setSpGap\(''\); setSpQ\(''\);/.test(src));

console.log('\n[정렬 규칙을 실제로 돌려본다]');
{
  const isClinic = it => !!(it && it.item && it.item.typeCode === 'cons-clinic');
  function sortList(list, rowAmt, clinic){
    return list.slice().sort(function(a,b){
      if(clinic){
        const ca = isClinic(a)?0:1, cb = isClinic(b)?0:1;
        if(ca!==cb) return ca-cb;
      }
      return Math.abs((a.expect||a.amount)-rowAmt) - Math.abs((b.expect||b.amount)-rowAmt);
    });
  }
  // 차이가 겹치지 않게 잡는다 — 겹치면 무엇이 먼저인지 우연에 맡기게 된다
  const list = [
    { companyName:'충남사회서비스원', amount:3300000, item:{typeCode:'case-other'} },   // 차이 150,000
    { companyName:'청아미즈산부인과', amount:1100000, item:{typeCode:'cons-clinic'} },  // 차이 2,050,000
    { companyName:'중원대학교',      amount:3100000, item:{typeCode:'case-other'} },   // 차이  50,000
    { companyName:'(주)토탈방재',     amount:1050000, item:{typeCode:'cons-clinic'} },  // 차이 2,100,000
  ];
  eq('일반 입금이면 금액 가까운 순',
     sortList(list, 3150000, false).map(x=>x.companyName),
     ['중원대학교','충남사회서비스원','청아미즈산부인과','(주)토탈방재']);
  eq('비즈사업비면 현장클리닉이 먼저, 그 안에서 금액 가까운 순',
     sortList(list, 3150000, true).map(x=>x.companyName),
     ['청아미즈산부인과','(주)토탈방재','중원대학교','충남사회서비스원']);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
