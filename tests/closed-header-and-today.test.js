/* ① 종료관리 머리를 2줄로 (대표 승인 라안)  ② 거래내역 「📆 오늘」

   ★ ① 무슨 일이 있었나
     머리가 6줄이었다. 그중 한 줄은 «바로 위 줄과 같은 말»이었다 —
     「2026년 34건」도 「전체 연도」 단추도 위에 이미 있었다.
     맨 아래 「2026년 128건」도 탭 이름·목록 쪽수와 겹쳤다.
     라안: 탭줄 «오른쪽 빈자리»에 검색·갯수를 얹고, 연도·월을 한 줄로 → 2줄.
     ⚠ 탭(갈래별 건수)은 늘 보여야 한다 — 그것을 지키느라 다른 안을 접었다.

   ★ ① 덤 — 「2026년 128건」은 사실과 달랐다
     종료된 업체 100곳 중 94곳에 종료일이 없다. 그것들은 연도를 골라도 목록에서
     안 빠진다(빠지면 찾을 길이 없어서다). 그래서 「2026년」 목록에 2026년이 아닌
     것이 섞였다. 숨기지 말고 「종료일 미상 N」으로 적고, 눌러서 그것만 보게 했다.

   ★ ② 거래내역 「📆 오늘」
     아침에 「오늘 뭐 들어왔나」를 보는 것이 가장 잦은데 달 전체(400건)에서 눈으로
     찾아야 했다. 오늘 것만 모아 본다. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

console.log('\n[① 종료관리 — 겹친 줄을 걷었다]');
/* 「종료 현황」 글자·「← 전체 연도」 줄·「(연도) N건」 줄 — 셋 다 위에 이미 있던 말이다.
   ⚠ 따옴표로 감싼 «화면에 그리는 글자»만 본다 — 왜 뺐는지 적어 둔 주석까지 잡으면
     설명을 남길 수가 없다. */
/* 따옴표로 감싼 것만 «화면에 그리는 글자»다. 위 주석은 「」 로 적어 두었으므로 안 걸린다 —
   그래야 왜 뺐는지 설명을 남길 수 있다. */
ok("★ 「📊 종료 현황」 딱지를 안 그린다", src.indexOf("'📊 종료 현황'") < 0);
ok("★ 「← 전체 연도」 줄이 없다 (바로 위에 「전체 연도」 단추가 있다)",
   src.indexOf("'← 전체 연도'") < 0);
ok("★ 「(연도) N건」 줄이 없다 (탭 이름과 목록 쪽수에 이미 있다)",
   !/\+ ' ' \+ curCount \+ '건'/.test(src));

console.log('\n[① 탭줄 오른쪽에 검색을 얹었다 — 라안의 핵심]');
/* 탭과 검색이 «같은 줄»에 있어야 한다. 탭줄이 검색을 감싸는 상자 안에 들어 있는지 본다. */
const page = src.slice(src.indexOf("return h('div', { className:'page' },"),
                       src.indexOf("activeTab === 'all'        && renderAll()"));
ok('종료관리 화면을 찾았다', page.length > 400);
ok('★ 검색·갯수가 탭과 같은 줄에 있다',
   /renderToolbar\(\)\s*\n\s*\),\s*\n\s*renderSummary\(\)/.test(page),
   '탭 상자 안에서 renderToolbar 가 닫혀야 «같은 줄»입니다');
ok('탭은 왼쪽에 남고 검색이 밀어내지 않는다',
   /flex:'1 1 auto', minWidth:0/.test(page) && /flex:'0 1 auto', minWidth:0/.test(src),
   '탭은 늘어나고(1 1) 검색은 줄어든다(0 1)');

console.log('\n[① 월 12칸이 연도와 같은 줄에]');
ok('★ 월 칸을 연도 줄 안에서 그린다', /yearFilter !== 'all' && monthGrid\(\)/.test(src));
ok('월 칸은 따로 함수로 (같은 줄에 들어갈 크기)', /function monthGrid\(\)/.test(src));
ok('12칸이 한 줄에 들어가게 「건」 글자를 뗐다',
   /monthGrid[\s\S]{0,1400}?fontFamily:'monospace', fontWeight:700 \} \}, cnt\)/.test(src),
   "cnt+'건' 이 아니라 cnt 만 그린다");

console.log('\n[① 종료일 미상 — 숨기지 않고 적는다]');
ok('★ 미상 건수를 센다', /var undatedCount = dbGet\('companies', \[\]\)/.test(src));
ok('★ 화면에 적는다', /'종료일 미상 ' \+ undatedCount/.test(src));
ok('★ 눌러서 그것만 볼 수 있다', /setUndatedOnly\(!undatedOnly\)/.test(src));
ok('0건이면 아예 안 그린다 (늘 켜진 등을 만들지 않는다)',
   /undatedCount > 0 && h\('button'/.test(src));
/* 미상만 볼 때는 «날짜 있는 것»을 빼야 한다 — 날짜칸이 둘인 업체도 함께 */
ok('★ 미상만 보기가 날짜 거르개에 걸려 있다', /if\(undatedOnly\) return !d;/.test(src));
ok('★ 업체는 날짜 칸이 둘이라 따로 본다', /if\(undatedOnly\) return !_cd;/.test(src));

console.log('\n[② 거래내역 「📆 오늘」]');
ok('★ 오늘 것만 거르는 코드가 있다',
   /if\(ldOnlyToday\)\{[\s\S]{0,260}?incList = incList\.filter/.test(src));
ok('★ 오늘 건수를 미리 센다 (눌러 보기 전에 알 수 있게)',
   /var ldTodayCnt = incAll\.filter/.test(src));
ok('★ 단추에 건수가 함께 적힌다', /'📆 오늘' \+ \(ldTodayCnt \? \(' ' \+ ldTodayCnt\)/.test(src));
ok('오늘 것이 없으면 안 눌린다', /if\(!ldTodayCnt\) return;/.test(src));
ok('오늘 것이 없으면 흐리게 둔다', /opacity: ldTodayCnt \? 1 : \.45/.test(src));
/* 지난 달을 보는 중에 「오늘」을 켜면 늘 빈 목록이 된다 — 켤 때 이 달로 데려온다 */
ok('★ 켤 때 이 달로 데려온다 (지난 달 + 오늘 = 빈 목록)',
   /if\(on\)\{ var _m = _ldToday\.slice\(0,7\); if\(_ldMonSet\[_m\]\) setIncMon\(_m\); \}/.test(src));
ok('★ 달을 손으로 바꾸면 「오늘」이 풀린다',
   /setIncMon\(e\.target\.value\); setIncChk\(\{\}\); setLdOnlyToday\(false\);/.test(src));
ok('「오늘」을 켜면 목록을 처음부터 다시 센다',
   /\[incMon, ldTab, hideDup, ldOnlyToday\]/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
