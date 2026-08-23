// 현장클리닉 묶음 입금 · 이름 기억 · 계약 이관 안내 · 후보 한 줄 표시
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

// ── 실제 함수를 떼어내 돌려본다 ──
function grab(name){
  const m = src.match(new RegExp('\\nfunction ' + name + '\\s*\\([^)]*\\)\\s*\\{'));
  if(!m) throw new Error('못 찾음: ' + name);
  let depth = 0;
  for(let j = m.index + m[0].length - 1; j < src.length; j++){
    if(src[j] === '{') depth++;
    else if(src[j] === '}'){ depth--; if(depth === 0) return src.slice(m.index + 1, j + 1); }
  }
  throw new Error('닫는 괄호 못 찾음: ' + name);
}
const need = ['erpNormName','erpIsClinicPayer','erpIsClinicItem'];
const sandbox = {};
new Function('exports', 'window',
  "var ERP_CLINIC_PAYERS = ['비즈사업','한국생산성본부','생산성본부'];\n"
  + need.map(grab).join('\n')
  + '\nObject.assign(exports,{erpIsClinicPayer, erpIsClinicItem});'
)(sandbox, {});
const { erpIsClinicPayer, erpIsClinicItem } = sandbox;

console.log('\n[🏥 현장클리닉 묶음 입금자 — 비즈사업비·한국생산성본부]');
eq('비즈사업비3건', erpIsClinicPayer('비즈사업비3건'), true);
eq('비즈사업비 (숫자 없이)', erpIsClinicPayer('비즈사업비'), true);
eq('한국생산성본부', erpIsClinicPayer('한국생산성본부'), true);
eq('생산성본부 (앞말 없이)', erpIsClinicPayer('생산성본부'), true);
eq('(주)이피아 는 아니다', erpIsClinicPayer('(주)이피아'), false);
eq('노동권익과 는 아니다', erpIsClinicPayer('노동권익과'), false);
eq('빈 적요', erpIsClinicPayer(''), false);

console.log('\n[현장클리닉 건 가려내기]');
eq('유형코드 cons-clinic', erpIsClinicItem({item:{typeCode:'cons-clinic'}}), true);
eq('다른 컨설팅 유형은 아니다', erpIsClinicItem({item:{typeCode:'cons-techguard'}}), false);
eq('사건은 아니다', erpIsClinicItem({item:{typeCode:'case-dismissal'}}), false);
eq('유형 이름이 현장클리닉', erpIsClinicItem({item:{typeName:'현장클리닉'}}), true);
eq('줄임말 현클', erpIsClinicItem({item:{typeName:'현클 3차'}}), true);
eq('빈 항목', erpIsClinicItem({}), false);
eq('null 이어도 안 터진다', erpIsClinicItem(null), false);

console.log('\n[갈래가 바뀌는가 — 비즈사업비면 이름 대신 현장클리닉으로 고른다]');
{
  // 화면의 갈래 규칙을 그대로 옮긴다
  function split(memo, sugs){
    const clinic = erpIsClinicPayer(memo);
    const hit = [], other = [];
    sugs.forEach(s => {
      const okk = clinic ? erpIsClinicItem(s.cand) : ((s.nameScore||0) >= 60);
      if(okk) hit.push(s); else other.push(s);
    });
    return { clinic, hit, other };
  }
  const sugs = [
    { cand:{ companyName:'청아미즈산부인과', item:{typeCode:'cons-clinic'} },   nameScore:0 },
    { cand:{ companyName:'(주)토탈방재',     item:{typeCode:'cons-clinic'} },   nameScore:0 },
    { cand:{ companyName:'바다림영어조합법인', item:{typeCode:'cons-clinic'} }, nameScore:0 },
    { cand:{ companyName:'충남사회서비스원',  item:{typeCode:'case-other'} },   nameScore:0 },
    { cand:{ companyName:'중원대학교',       item:{typeCode:'case-other'} },    nameScore:0 },
  ];
  const r = split('비즈사업비3건', sugs);
  eq('비즈사업비면 현장클리닉 모드', r.clinic, true);
  eq('현장클리닉 3곳이 먼저 보인다', r.hit.map(s => s.cand.companyName),
     ['청아미즈산부인과','(주)토탈방재','바다림영어조합법인']);
  eq('나머지 2건은 접힌다', r.other.length, 2);

  // 예전 규칙(이름 점수)이었다면 하나도 못 찾았다
  const old = sugs.filter(s => (s.nameScore||0) >= 60);
  eq('이름 점수로는 하나도 못 찾았다 (그래서 필요했다)', old.length, 0);

  // 일반 적요는 예전대로 이름으로 고른다
  const r2 = split('(주)이피아', [
    { cand:{ companyName:'이피아', item:{typeCode:'cons-hr'} }, nameScore:100 },
    { cand:{ companyName:'맥스텍', item:{typeCode:'cons-clinic'} }, nameScore:0 },
  ]);
  eq('일반 적요는 현장클리닉 모드가 아니다', r2.clinic, false);
  eq('이름 맞는 것만 먼저', r2.hit.map(s => s.cand.companyName), ['이피아']);
}

console.log('\n[🔖 이름 기억 — 고르면 그 자리에서 배운다]');
/* ★ 산 코드는 pickFor 다 — 표와 확인창 두 곳이 함께 쓰라고 밖으로 뺀 함수.
   예전에는 같은 일을 하는 죽은 사본(pickSug)을 보고 있었다. 죽은 쪽을 지키면
   진짜 쓰이는 쪽이 깨져도 초록불이 뜬다 — 2026-08-23 에 사본을 걷어내며 옮겼다.
   띄어쓰기는 안 본다: 코드를 옮기면 들여쓰기가 바뀌는데 그때마다 깨질 까닭이 없다. */
ok('후보를 고를 때 배운다', /function pickFor\(row, pid\)\{[\s\S]{0,700}?erpLearnPayerAlias\(\s*_m\s*,\s*_c\s*\)/.test(src));
ok('같은 후보를 다시 눌러도 두 번 세지 않는다', /inMatch\[row\._k\]\s*===\s*pid\s*\) return;/.test(src));
ok('무엇을 기억했는지 알려준다', /🔖 기억함 — 다음부터 「'\s*\+\s*_m\s*\+\s*'」 은 '\s*\+\s*_c\.companyName/.test(src));
ok('★ 그 함수를 화면이 실제로 부른다 (죽은 사본을 지키지 않는다)',
  (src.match(/[{;]\s*pickFor\(row, /g) || []).length >= 2);

console.log('\n[📄 계약 단계 입금 — 이관 먼저]');
ok('계약 안내 함수가 있다', /function erpContractHint\(txn\)/.test(src));
ok('이관·취소·마감된 계약은 빼고 본다',
   /status === 'cancelled' \|\| ct\.status === 'transferred' \|\| ct\.status === 'closed'/.test(src));
ok('이름이 확실할 때만 알린다 (85점↑)', /if\(sc >= 85 && \(!best \|\| sc > best\.score\)\)/.test(src));
// 이 계산은 erpBuildSug 로 옮겨 담겼다(추천 다시쓰기). 뜻은 그대로 — 후보가 없을 때만 본다.
ok('맞는 후보가 없을 때만 본다', /if\(!_sg\.length\) out\.ctHint\[row\._k\] = erpContractHint/.test(src));
// 업체 이름은 옆 칸에 따로 서므로 현황 칸에는 사실만 짧게 적는다
ok('화면에 안내가 뜬다', /📄 아직 이관 안 된 계약/.test(src));
ok('업체 이름은 업체 칸에 선다', /\(_ct \? _ct\.companyName : '—'\)/.test(src));
ok('계약관리로 바로 갈 수 있다', /window\.navigateTo\('biz\/contract'\)/.test(src));

/* (2026-08-09) 후보를 «줄마다 목록으로» 늘어놓던 것을 그만뒀다.
   줄맞춤을 아무리 해도 한 입금이 화면 반쪽을 먹었고, 열두 건이 떠도 고를 근거가 없었다.
   이제 입금 한 건이 한 줄이고, 고를 것이 있을 때만 그 줄을 펼친다.
   칸 너비를 못 박는 검사는 두지 않는다 — 모양이 조금만 바뀌어도 배포가 막힌다. */
console.log('\n[입금 한 건이 한 줄]');
// (2026-08-09) 업체와 항목을 각자 칸으로 나눴다 — 한 칸에 몰면 세로로 비교가 안 된다
ok('업체는 제 칸에 홀로 있다', /_grp\.length \? _grp\[0\]\.company/.test(src));
ok('항목은 같은 말을 반복하지 않는다', /erpKindLabel\(_grp\[0\]\)/.test(src));
ok('밀린 달 수를 줄 안에서 알려 준다', /'달 밀림'/.test(src));
ok('넘치거나 모자란 금액을 줄에서 보여준다', /\(_st\.diff>0\?'\+':''\)\+_st\.diff\.toLocaleString\(\)/.test(src));
ok('판단이 필요한 줄만 펼친다', /if\(_st\.state==='check'\)\{ setOpenRow\(_open\?'':row\._k\); return; \}/.test(src));
ok('펼친 줄은 하나뿐이다', /setOpenRow\(_open\?'':row\._k\)/.test(src));
ok('고를 것이 여럿이면 라디오로 고른다', /h\('input',\{type:'radio',name:'g'\+row\._k/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
