#!/usr/bin/env node
/* fund.html 무결성·규격 검사 — 커밋 전에 돌린다.
 *   node fund-erp/tools/check_fund.js
 *
 * 왜 필요한가 (2026-07-30 실제 장애):
 *   정규식 문자 클래스에 이스케이프가 아닌 **날제어문자(NUL)** 가 파일에 박혀,
 *   브라우저가 인라인 스크립트를 통째로 거부해 앱의 모든 함수가 undefined가 됐다.
 *   `node --check`는 이것을 통과시킨다. 브라우저와 같은 기준으로 보려면
 *   스크립트 본문을 new Function()으로 파싱해야 한다 — 그게 이 검사의 핵심이다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', '..', 'fund.html');
const src = fs.readFileSync(FILE, 'utf8');

let fail = 0, n = 0;
function ok(label, cond, extra) {
  n++;
  if (!cond) fail++;
  console.log((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '  → ' + (extra || '')));
}

// ── ① 인라인 스크립트를 브라우저와 같은 기준으로 파싱 ──
const blocks = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok('인라인 <script> 블록을 찾음', blocks.length > 0, '0개');
blocks.forEach((b, i) => {
  let err = null;
  try { new Function(b); } catch (e) { err = e.message; }
  ok('스크립트 ' + (i + 1) + ' 파싱(브라우저 기준)', !err, err);
});

// ── ② 허용 외 제어문자 (탭·개행만 허용) ──
const strays = [];
for (let i = 0; i < src.length; i++) {
  const c = src.charCodeAt(i);
  if (c === 9 || c === 10 || c === 13) continue;
  if (c < 32 || c === 0x7f || c === 0x2028 || c === 0x2029) {
    strays.push({ line: src.slice(0, i).split('\n').length, code: '0x' + c.toString(16) });
  }
}
ok('허용 외 제어문자 없음', strays.length === 0,
  strays.slice(0, 5).map(s => '줄 ' + s.line + ' ' + s.code).join(', '));

// ── ③ 별지 제15호 — 2025-10-01 개정 서식 규격 ──
const f15 = src.slice(src.indexOf('var F15_ROWS='), src.indexOf('var F15_ROWS=') + 900);
ok('복지사업비 번호가 57로 시작(개정 서식)', /\[57,'주택구입/.test(f15), f15.slice(0, 80));
ok('복지사업비 번호가 66으로 끝', /\[66,'그 밖의 복지비/.test(f15));
ok('법령 인용: 시행령 제55조의6ㆍ제63조제1항', src.includes('제55조의6ㆍ제63조제1항'));
ok('법령 인용: 시행규칙 제30조', src.includes('시행규칙 제30조'));
ok('수신처를 관할 노동청에서 채움', src.includes('function _f15to'));
ok('제출 전 기금·연도 확인 가드', src.includes('function _f15Ready'));
ok('인쇄 @page A4 세로 12mm', src.includes("@page{size:A4 portrait;margin:12mm}"));
ok('쪽별 행 높이(1쪽 9.2mm / 2쪽 6.2mm)',
  src.includes("['.pg1 th','height:9.2mm']") && src.includes("['.pg2 td','height:6.2mm']"));

// ── ④ 서식 A4 조판기 ──
/* 서식 31종 중 15종은 원본(.hwp·.xlsx)을 브라우저에 등록해야 나온다.
   등록 전에 열면 한 줄짜리 「준비 중」만 뜨던 것을 길잡이로 바꿨다 —
   무엇을 해야 하는지·어디로 가야 하는지가 없으면 «아직 안 만든 기능»으로 읽혀 사람이 기다린다. */
ok('원본 미등록 서식이 길잡이를 준다', src.includes('원본 파일을 등록해야')
  && src.includes('서식 원본 등록하러 가기')
  && !src.includes(">준비 중인 서식입니다.</p>'"));
// 왼쪽 메뉴의 서식 항목과 같은 손짓이어야 한다 — 한쪽만 고치면 화면이 갈라진다
{
  const NAV = "S.formsCtx=\\'library\\';S.formsHost=null;S._sideKind=null;go(\\'forms\\')";
  const n = src.split(NAV).length - 1;
  ok('서식 화면으로 가는 손짓이 메뉴와 같다', n >= 2, '같은 손짓 ' + n + '군데(메뉴 + 안내 단추)');
}
// 원본은 이 브라우저에만 둔다 — 저장소·서버에 올리지 않는다는 것을 사람에게 알린다
ok('원본이 브라우저에만 있다는 것을 알린다', src.includes('이 브라우저에만 보관됩니다'));
ok('조판기 존재', src.includes('function typesetForm'));
ok('조판 클래스 CSS(화면)', src.includes('.fmtitle{text-align:center'));
ok('조판 클래스 CSS(인쇄)', (src.match(/\.fmtitle\{text-align:center/g) || []).length >= 2);
ok('쪽 나눌 때 colgroup 이어붙임', src.includes(":scope > colgroup"));
/* 쪽 나누기 안전장치(guard)에 걸려 멈추면 queue 에 남은 마디가 그대로 버려졌다 —
   긴 서식의 뒷부분이 말없이 사라진다. 브라우저에서 guard 를 5로 낮춰 재 보니
   문단 40개 중 36개가 없어졌고, 아래 보완을 넣으면 하나도 안 사라진다.
   조판이 덜 되는 것(넘침 배지)이 글이 사라지는 것보다 낫다. */
ok('안전장치에 걸려도 내용을 안 버린다',
  src.includes('    if(queue.length){') && src.includes('      queue.forEach(function(nd){ body.appendChild(nd); });')
  && src.includes('      queue.length=0;'));
const titleLine = (src.split(/\r?\n/).find(l => l.startsWith('var FM_TITLE=')) || '');
['합의서', '확인서', '승낙서', '서약서', '신청서', '회의록', '정관', '필요서류', '목록표'].forEach(w => {
  ok('제목 어휘 «' + w + '»', titleLine.includes(w), titleLine.slice(0, 90));
});

// ── ⑤ 지원금 — 연도별 1인당 한도(시행계획으로 확인한 값) ──
/* ══ 결산서 워크북에도 음수가 나오면 안 된다 ══
   화면 재무제표는 _retLabel/_retVal 로 이름을 바꿔 양수로 적는데 워크북 세 곳만 원값을 썼다.
   결손금 이월 기금(실제 사례 있음)은 **제출 서류에 음수가 찍혔다**. */
/* 이름 바꾸기는 이제 «한 벌 모델»(stmtRE·stmtBS) 이 맡는다 — 화면과 워크북이 함께 지킨다.
   종전에는 화면만 고치고 워크북 세 곳이 원값을 써서 제출 서류에 음수가 찍혔다. */
ok('처분계산서도 당기 기준 부호로 적는다',
  src.includes('var sgn=isLoss?-1:1, sgnOp=(op<0?-1:1), sgnNet=((num(fin.net)||0)<0?-1:1);')
  && src.includes("add(isLoss?'1. 처분전결손금':'1. 처분전이익잉여금',sgn*_r,sgn*_rP")
  && src.includes("add(isLoss?'4. 차기이월결손금':'4. 차기이월이익잉여금',sgn*_r,sgn*_rP"));
ok('처분계산서에 원값(음수)을 안 쓴다',
  !/add\('1\. 처분전이익잉여금',fin\.retained/.test(src) && !/add\('4\. 차기이월이익잉여금',fin\.retained/.test(src));
ok('당기순손실도 이름을 바꾼다',
  src.includes("add((fin.net<0?'2) 당기순손실':'2) 당기순이익'),sgnNet*(num(fin.net)||0),sgnNet*(num(prv.net)||0)"));
/* 전기 칸에 따로 _retVal 을 씌우면 부호가 반대인 해에 값이 뒤집힌다 — 아예 못 쓰게 막는다 */
ok('비교 칸에 _retVal 을 따로 씌우지 않는다',
  !/_retVal\((?:prv\.retained|opP|prv\.net)\)/.test(src));
/* 당기는 이름을 바꿔 양수로, 전기는 «부호 그대로» — 전기에도 _retVal 을 씌우면
   당기 결손·전기 잉여인 해에 전기 잉여가 결손금 칸에 양수로 앉는다.
   값이 맞는지는 check_notes.js 가 실제로 표를 만들어 본다. */
ok('재무상태표 결손금은 당기 기준 부호로 적는다',
  src.includes('var sgn=isLoss?-1:1;')
  && src.includes("add(isLoss?'Ⅱ. 결손금':'Ⅱ. 이익잉여금',sgn*(num(fin.retained)||0),sgn*(num(prv.retained)||0)")
  && !src.includes('_retVal(prv.retained)'));

/* ══ 재무제표 3종을 «제출 양식 그대로» ══
   짜임새는 실제 제출본(2025 결산서)에서 그대로 옮겼다. 화면과 워크북이 각자 줄을 짜면
   서로 달라진다 — 실제로 재무상태표가 화면 7줄·워크북 12줄로 갈라져 있었다. */
ok('재무제표 3종이 한 벌 모델에서 나온다',
  ['function stmtBS(', 'function stmtIS(', 'function stmtRE('].every(f => src.includes(f)));
ok('화면이 그 모델을 쓴다', src.includes('stmtBS(cur,prv)') && src.includes('stmtIS(cur,prv,cur.tb,prv.tb)')
  && src.includes('stmtRE(cur,prv)'));
ok('워크북도 같은 모델을 쓴다', src.includes('_xlStmt(stmtBS(fin,prv))')
  && src.includes('_xlStmt(stmtIS(fin,prv,fin.tb,prv.tb))') && src.includes('stmtRE(fin,prv).forEach('));
// 재무상태표 — 제출본의 층(유동/비유동 · 당좌 · 준비금1·2 · 자본금 · 이익잉여금)
ok('재무상태표가 유동·비유동으로 갈린다', src.includes("add('Ⅰ. 유동자산'") && src.includes("add('Ⅱ. 비유동자산'")
  && src.includes("add('Ⅰ. 유동부채'") && src.includes("add('Ⅱ. 비유동부채'"));
ok('당좌자산·투자자산 층이 있다', src.includes("add('가. 당좌자산'") && src.includes("add('1. 투자자산'"));
/* 준비금은 근거 법령이 달라 제출본이 두 줄로 적는다 — 합계 한 줄로 뭉치면 안 된다 */
ok('준비금1·2를 갈라 적는다', src.includes("add('1) 고유목적사업준비금1',fin.res1")
  && src.includes("add('2) 고유목적사업준비금2',fin.res2"));
ok('자본금·이익잉여금 층이 있다', src.includes("add('Ⅰ. 자본금'") && src.includes("add('1. 기본재산'"));
// 손익계산서 — 제출본의 열 단계
ok('손익계산서가 열 단계다',
  ['1. 사업수익', '2. 고유목적사업비용', '3. 사업총이익', '4. 일반관리비', '5. 사업이익',
   '6. 사업외수익', '7. 사업외비용', '8. 법인세차감전순이익', '9. 법인세등', '10. 당기순이익']
    .every(t => src.includes("add('" + t + "'")));
/* 준비금 환입·전입이 6·7 단계로 가야 한다 — 종전에는 「기타비용」에 뭉뚱그려 단계가 없었다 */
ok('사업외수익은 준비금 환입', src.includes('var nonopRev=revenue-bizRev, nonopExp=otherExp;'));
ok('사업외수익을 준비금1·2로 가른다', src.includes("if(x.credit!=='고유목적사업준비금환입') return;")
  && src.includes('if(x.debit===RESERVE_ACCTS[0]) rev1+=amt;'));
ok('법인세등은 9번 칸으로', src.includes("else if(n==='법인세등') tax+=s;")
  && src.includes('var net=revenue-purpose-admin-otherExp-tax,'));
/* 단계가 안 맞물리면 어딘가에서 분류가 새고 있다 — 조용히 두면 제출본이 틀어진다 */
ok('단계가 맞물리는지 스스로 본다', src.includes('function stmtChk(') && src.includes('stmtChk(cur)')
  && src.includes('손익 단계 어긋남'));
// 실제로 쓴 계정만 줄을 세운다 — 안 쓴 계정까지 0 으로 늘어놓으면 열여섯 줄이 된다
ok('목적사업비는 값이 있는 계정만', src.includes('if(!v&&!p) return;') && src.includes('_sub(PURPOSE_ACCTS);'));
/* 세부 항목은 가·나·다… 로 이어 붙인다 — 전부 「가.」면 제출본과 달라 보인다 */
ok('세부 항목 번호가 이어진다', src.includes("var _GA='가나다라마바사아자차카타파하';")
  && src.includes("add((_GA.charAt(k)||'·')+'. '+a,v,p,1); k++;"));

/* ══ 현금흐름표 · 수입지출명세서 ══ 이카운트 비영리회계에도, 공익법인 결산에도 들어가는 표다.
   둘 다 없었다 — 재무제표만으로는 «돈이 어디로 갔는지»를 못 보여 준다. */
ok('현금흐름표가 있다', src.includes('function cashFlowRows(') && src.includes('function cashFlowView('));
ok('수입지출명세서가 있다', src.includes('function ieRows(') && src.includes('function ieView('));
ok('두 표가 결산 탭에 있다', src.includes("['cf','현금흐름표'],['ie','수입지출명세서']")
  && src.includes("case 'cf':      return cashFlowView(arr);") && src.includes("case 'ie':      return ieView(arr);"));
/* ⚠ 현금이 오가지 않는 분개(준비금 설정·환입·전입)를 빼야 한다 —
   넣으면 흐름 합계가 통장 잔액과 어긋나고, 기말 현금이 재무상태표와 달라진다. */
ok('현금 안 움직인 분개를 뺀다', /function cashMoves\([\s\S]{0,1400}?if\(x\.nocash\) return;/.test(src));
/* ⚠ 쪼갠 조각은 첫 것만 통장 금액을 지니고 나머지엔 nocash 표가 붙는다.
   그래서 «조각을 먼저» 보지 않으면 둘째부터 통째로 빠지고 첫 조각에 전액이 몰린다.
   실제로 그랬다 — 100,500 을 100,000+500 으로 쪼갰더니 «100,500 · 0» 으로 찍혔다.
   합계는 맞아서 기말현금 대조로는 안 드러났다. */
ok('쪼갠 조각을 먼저 본다', /if\(x\._split\){[\s\S]{0,400}?if\(x\.nocash\) return;/.test(src)
  && src.includes('var oth=x._splitDep?x.credit:x.debit;')
  && src.includes('o._splitDep=isDep?1:0;'));
ok('활동 셋으로 가른다', src.includes("add('Ⅰ. 영업활동으로 인한 현금흐름'")
  && src.includes("add('Ⅱ. 투자활동으로 인한 현금흐름'") && src.includes("add('Ⅲ. 재무활동으로 인한 현금흐름'"));
// 대부금·예금·증권은 투자활동이다 — 영업활동에 섞으면 «본디 활동»이 부풀어 보인다
ok('투자활동 계정이 정해져 있다', /var CF_INVEST=\[[^\]]*'근로자대부금'[^\]]*'정기예금'[^\]]*'매도가능증권'/.test(src));
/* 재무활동을 0 으로 굳혀 두면, 차입금을 적었을 때 영업활동에 조용히 섞인다 */
ok('빌린 돈은 재무활동으로 간다', /var CF_FINANCE=\[[^\]]*'단기차입금'[^\]]*'장기차입금'/.test(src)
  && src.includes("add('Ⅲ. 재무활동으로 인한 현금흐름',fiIn-fiOut,0,true);")
  && src.includes('var net=(opIn-opOut)+(invIn-invOut)+(fiIn-fiOut);'));
// 「2. 유출」 밑에 또 «( )» 를 붙이면 겹쳐 보인다
ok('유출 항목에 군더더기 표시가 없다', src.includes('forEach(function(k){ add(k,m[k],2); });'));
/* 기말 현금이 재무상태표와 다르면 어느 한쪽이 틀린 것이다 — 조용히 두면 안 된다 */
ok('기말 현금을 재무상태표와 맞대 본다', src.includes('var gap=Math.round(cf.end)-Math.round(fin.cash);')
  && src.includes('재무상태표 현금과'));
// 비영리는 관-항-목으로 적는다(이카운트 비영리회계와 같은 짜임새)
ok('수입지출을 관·항·목으로 적는다', src.includes('var IE_TREE=[')
  && src.includes("{gwan:'수입'") && src.includes("{gwan:'지출'")
  && src.includes("{h:'출연금수입'") && src.includes("{h:'고유목적사업비'"));

/* 모델은 숫자만 돌려줘야 한다 — 이름표에 서식을 박으면 엑셀·검사에서 못 쓴다 */
ok('수입지출 모델이 서식을 안 박는다', src.includes("add('【'+g.gwan+'】',gSum,0,true);"));
/* ══ 주석 ══ 공익법인회계기준이 요구하는 마지막 한 장. 없었다. */
ok('주석이 있다', src.includes('function stmtNotes(') && src.includes('function notesView(')
  && src.includes('function notesChk(') && src.includes('function notesText('));
ok('주석이 결산 탭에 있다', src.includes("['notes','주석']")
  && src.includes("case 'notes':   return notesView(arr);") && src.includes("'close.notes':{t:'주석'"));
// 일곱 갈래 — 공익법인회계기준이 요구하는 것들
ok('주석 일곱 갈래가 다 있다', ['1. 기금의 개요','2. 중요한 회계처리 방침','3. 고유목적사업준비금의 변동',
  '4. 기본재산의 변동','5. 근로자대부금','6. 고유목적사업 집행 내역','7. 우발부채 및 약정사항']
  .every(function(h){ return src.indexOf("sec('"+h) >= 0; }));
/* ⚠ 주석은 대외 제출물이다. 빈 칸을 앱이 그럴듯하게 채우면 그대로 관청에 나간다 —
   「—」로 두고, 무엇이 비었는지만 알려 준다. */
ok('빈 칸을 지어내지 않는다', /var dash=function\(v\)\{ v=\(v==null\?'':String\(v\)\).trim\(\); return v\|\|'—'; \};/.test(src)
  && src.includes("N[0].lines.forEach(function(l){ if(l[1]==='—') miss.push(l[0]); });")
  && src.includes('비어 있는 항목 '));
// 「없음」이라 단정하면 그것이 곧 허위 기재다 — 앱은 장부 밖의 일을 모른다
ok('우발부채를 없다고 단정하지 않는다', src.includes('장부에 잡힌 것은 없다. 그 밖의 사항은 확인이 필요하다.'));
/* 기본재산은 들어오기만 하지 않는다 — 준비금2 설정 때 여기서 빠져나간다.
   그 줄을 빠뜨리면 기초+출연 ≠ 기말 이 된다(X공동 2025: 7,200,000). */
/* 기본재산 차변을 다 합쳤다가 「준비금2 설정」이라 적던 것을 고침 — 맞바꿈 기금은
   설정이 준비금1로 나가고, 준비금과 무관한 감소까지 설정액으로 둔갑했다.
   값이 맞는지는 check_notes.js 가 실제로 주석을 만들어 본다. */
ok('기본재산 감소를 대변 계정별로 갈라 적는다',
  src.includes("if(RESERVE_ACCTS.indexOf(x.credit)>=0) outByAcct[x.credit]=(outByAcct[x.credit]||0)+amt;")
  && src.includes("if(outByAcct[a]) s4.rows.push([a+' 설정',-Math.round(outByAcct[a]),null]);")
  && src.includes("if(outEtc) s4.rows.push(['그 밖의 감소',-Math.round(outEtc),null]);"));
/* 준비금 설정·전입·환입은 어느 «번호»가 아니라 어느 «역할»이냐로 간다 —
   번호로 못 박으면 맞바꿈 기금에서 설정은 준비금1로 나가고 환입은 준비금2에서 빠져
   준비금2가 음수가 된다. 대차·당기순이익은 맞아서 화면으론 멀쩡해 보인다. */
ok('준비금 설정·전입·환입이 역할을 따른다',
  src.includes('bal[_roles.carry]=(bal[_roles.carry]||0)+want;')
  && src.includes('r.parts=[{acct:_roles.carry,amount:net}]; r.acct=_roles.carry;')
  && src.includes('[_roles.interest,_roles.carry].forEach(function(a){ if(rest<=0) return;'));
// 주석 스스로 맞물림을 본다 — 어긋나면 화면이 알려 준다
/* 전입은 준비금이 «대변», 환입은 «차변»에 선다. 뒤집어 놓아도 두 금액이 같은 해에는
   숫자로 안 드러난다 — 그래서 방향 자체를 못 박는다. */
ok('전입은 대변·환입은 차변', src.includes("if(x.credit===RESERVE_ACCTS[0]) in1+=amt; else if(x.credit===RESERVE_ACCTS[1]) in2+=amt;")
  && src.includes("if(x.debit===RESERVE_ACCTS[0]) out1+=amt; else if(x.debit===RESERVE_ACCTS[1]) out2+=amt;"));
ok('주석이 스스로 맞물림을 본다', src.includes("e.push('준비금1 기말잔액')")
  && src.includes("e.push('준비금2 기말잔액')") && src.includes("e.push('기본재산 기말')")
  && src.includes("e.push('대부금 기말')")
  && src.includes('준비금 변동이 안 맞물립니다'));
// 화면에 그린 글자를 그대로 복사한다 — 다시 계산하면 화면과 다른 것이 복사될 수 있다
ok('화면에 그린 글자를 복사한다', src.includes('_notesTxt=notesText(N);')
  && src.includes("if(!_notesTxt){ toast('주석을 먼저 열어 주세요','warn'); return; }")
  && src.includes('document.execCommand(' + "'copy'" + ')'));
/* 화면에만 있고 결산서(엑셀)에 없으면 반쪽이다 — 사람이 관청에 내는 건 엑셀 쪽이다 */
ok('결산서 엑셀에 새 표 셋이 있다', src.includes("wb.addWorksheet('1-4 현금흐름표')")
  && src.includes("wb.addWorksheet('1-5 수입지출명세서')") && src.includes("wb.addWorksheet('1-6 주석')"));
ok('엑셀도 화면과 같은 모델을 쓴다', /wb\.addWorksheet\('1-4 현금흐름표'\)[\s\S]{0,600}?cashFlowRows\(arr,fid,yr\)/.test(src)
  && /wb\.addWorksheet\('1-5 수입지출명세서'\)[\s\S]{0,600}?ieRows\(arr,fid,yr\)/.test(src)
  && /wb\.addWorksheet\('1-6 주석'\)[\s\S]{0,600}?stmtNotes\(arr,fin,prv,fid,yr\)/.test(src));
/* 어긋난 것을 엑셀에서 조용히 넘기면 그대로 제출된다 */
ok('엑셀에도 어긋남을 적는다', src.includes('※ 기말 현금이 재무상태표의 현금')
  && src.includes("_xlRow(s,rw++,['※ 맞물리지 않는 곳: '+_ne.join(', ')],{bold:true});"));
// 시트 이름 오타 「이익잃여금」 — 결산서에 그대로 찍혔다
ok('이익잉여금 오타가 없다', !src.includes('이익잃여금'));
/* ══ 계정코드 ══ 통상 방식: 1 자산 · 2 부채 · 3 자본 · 4 수익 · 5 비용 */
ok('계정코드가 있다', src.includes('var ACCT_CODE={') && src.includes('function acctCode(')
  && src.includes('function acctTableRows(') && src.includes('function acctCodeChk('));
ok('계정과목표가 결산 탭에 있다', src.includes("['accts','계정과목표']")
  && src.includes("case 'accts':   return acctTableView();") && src.includes("'close.accts':{t:'계정과목표'"));
{
  /* ACCT_CHART 와 ACCT_CODE 가 «짝이 맞아야» 한다 — 한쪽만 늘리면 조용히 빈칸이 된다.
     앞자리는 구분과 같아야 한다(비용을 2xx 로 적으면 부채로 읽힌다). */
  const chart = (src.match(/var ACCT_CHART=\{([\s\S]*?)\};/) || [])[1] || '';
  const codes = (src.match(/var ACCT_CODE=\{([\s\S]*?)\};/) || [])[1] || '';
  const nm = t => [...t.matchAll(/'([^']+)':/g)].map(m => m[1]);
  const A = nm(chart), C = nm(codes);
  ok('계정과목과 번호가 짝이 맞는다', A.length === C.length && A.every(x => C.includes(x)));
  const HEAD = {자산:1, 부채:2, 자본:3, 수익:4, 비용:5};
  const typeOf = {}; [...chart.matchAll(/'([^']+)':'([^']+)'/g)].forEach(m => typeOf[m[1]] = m[2]);
  const pair = [...codes.matchAll(/'([^']+)':(\d+)/g)];
  ok('번호 앞자리가 구분과 맞는다', pair.every(m => Math.floor(+m[2] / 100) === HEAD[typeOf[m[1]]]));
  ok('번호가 겹치지 않는다', new Set(pair.map(m => m[2])).size === pair.length);
}
/* 표가 분류를 «따로 적으면» 계정을 옮겼을 때 표만 옛말이 된다 —
   실제로 쓰는 목록을 그대로 읽어야 한다 */
ok('계정과목표가 실제 목록을 읽는다', src.includes('PURPOSE_ACCTS.indexOf(n)>=0)?')
  && src.includes('ADMIN_ACCTS.indexOf(n)>=0)?') && src.includes('RESERVE_ACCTS.indexOf(n)>=0)?')
  && src.includes('CF_INVEST.indexOf(n)>=0) flow=') && src.includes('IE_TREE.forEach(function(g){ g.hang.forEach'));
/* 준비금 분개는 _reserveEntry 가 늘 nocash 로 만든다 — 현금흐름표에 아예 안 나온다.
   「영업활동」이라 적으면 통장이 움직이는 것처럼 읽힌다. */
ok('준비금을 현금 안 움직임으로 적는다', src.includes("flow='현금 안 움직임'")
  && src.includes("if(n==='현금성자산') flow='현금 그 자체';"));
// 번호가 화면·엑셀에 실제로 보여야 쓸모가 있다
ok('번호가 시산표·원장·엑셀에 보인다', src.includes(">'+acctCode(r.name)+'<")
  && src.includes("var c=acctCode(n);") && src.includes("(acctCode(t.name)?acctCode(t.name)+' ':'')+t.name")
  && src.includes("wb.addWorksheet('1-7 계정과목표')"));
// 어긋난 것을 조용히 넘기면 그대로 제출된다
ok('계정코드 어긋남을 알린다', src.includes("  if(e.length) h+='<p class=\"warn\"")
  && src.includes("if(_ce.length){ rw++; _xlRow(s,rw++,['※ 어긋난 곳: '+_ce.join(' · ')],{bold:true}); }"));
ok('두 표에 도움말이 있다', src.includes("'close.cf':{t:'현금흐름표'") && src.includes("'close.ie':{t:'수입지출명세서'"));

/* ══ 회계법인 결산본(U사내 2019)에서 드러난 것 ══ */
// 미지급비용·선납세금 계정이 없어 아예 적을 수가 없었다
ok('회계법인이 쓰는 계정이 있다', /'선납세금':'자산'/.test(src)
  && /'미지급비용':'부채'/.test(src) && /'미지급금':'부채'/.test(src) && /'예수금':'부채'/.test(src));
// 이월할 자리가 없으면 연말에 그 잔액이 사라진다
ok('선납세금·미지급비용을 이월한다', /prepaid:'선납세금',payable:'미지급비용'/.test(src));
/* 유동부채를 0 으로 굳혀 두면 미지급비용이 비유동부채로 잘못 찍히고,
   그 밑의 준비금 명세와 합계가 어긋난다 */
ok('유동부채와 비유동부채를 가른다', src.includes('var ncL=fin.res1+fin.res2, pNcL=prv.res1+prv.res2;')
  && src.includes('var curL=fin.liab-ncL, pCurL=prv.liab-pNcL;')
  && !/var curL=0, ncL=fin\.liab;/.test(src));

/* ══ 두 표가 한 곳에서 센다 ══ 따로 세면 조용히 어긋난다 */
ok('현금 움직임을 한 곳에서 센다', src.includes('function cashMoves(arr){')
  && /function cashFlowRows\([\s\S]{0,300}?var mv=cashMoves\(arr\);/.test(src)
  && /function ieRows\([\s\S]{0,300}?var mv=cashMoves\(arr\), by=mv\.by;/.test(src));
/* 목록에 없는 계정을 안 받으면, 돈이 오갔는데도 명세서에서 사라진다
   (U사내의 선납세금·미지급비용·대부금 회수가 그랬다) */
ok('안 잡힌 계정을 기타로 받는다', /\{h:'기타수입',\s*rest:true\}/.test(src)
  && /\{h:'기타지출',\s*rest:true\}/.test(src)
  && src.includes('if(claimed[a]) return;'));
/* 이월금이 «전기말 자산총계»면 잔고와 흐름을 섞는 셈이라 재무상태표와 어긋난다 */
/* 「기타」칸이 다 받아 주므로 합계는 안 틀리지만, 항을 지우면 이름표가 뭉개진다.
   관-항-목의 «항»은 비영리 결산서가 정해 둔 이름이라 그대로 있어야 한다. */
ok('수입·지출의 항이 다 있다', ['이월금','출연금수입','사업수익','대부금회수','예금·증권 해지','기타수입',
  '고유목적사업비','일반관리비','대부금지급','예금·증권 예치','기타지출']
  .every(function(h){ return src.indexOf("{h:'"+h+"'")>=0; }));
ok('이월금은 전기말 현금', /var carry=num\(op\.cash\)\|\|0;/.test(src)
  && src.includes("add('차기이월금 (수입 − 지출)',totIn-totOut,0,true);"));
/* 결손금은 «수입»이 아니다 — 수입에 음수로 넣으면 수입 합계가 그만큼 줄어 예산이 작아 보인다 */
ok('예산편성안 이월금은 잉여일 때만', src.includes('var _carry=Math.max(0,fin.retained), _loss=Math.max(0,-fin.retained);')
  && src.includes("_xlRow(s,rw++,['수입 — 이월금',_carry,null,null]);")
  && src.includes('fin.bizRev+R.bf.employer+R.bf.other+_carry'));
ok('이월결손금은 따로 적어 눈에 보이게', src.includes('전기 이월결손금 — 잉여가 생기면 먼저 보전'));
/* 모르는 해에 2025년 규칙을 그대로 돌려주면, 2027년 화면에도 「접수: 상반기 3.4.~4.18.」 이
   사실처럼 뜬다 — 그대로 믿고 접수 시기를 놓친다. 가장 가까운 해로 셈하되 «미확인»이라고 말한다. */
ok('모르는 해는 미확인이라고 말한다', !src.includes("return SUB_RULE[String(y)]||SUB_RULE['2025'];")
  && src.includes("apply_period:k+'년 시행계획 미확인")
  && src.includes('if(Math.abs(v-n)<Math.abs(near-n)) near=v;'));
ok('2025년 1인당 한도 930,000', /'2025':\{ per_worker:930000/.test(src));
ok('2024년 1인당 한도 930,000', /'2024':\{ per_worker:930000/.test(src));
ok('2022년 1인당 한도 888,000', /'2022':\{ per_worker:888000/.test(src));
ok('구간 한도 유형1 2/5/10/20억',
  src.includes("'1':[200000000,500000000,1000000000,2000000000]"));
ok('구간 한도 유형3(지자체) 2/4/6억',
  src.includes("'3':[200000000,400000000,600000000]"));
ok('지자체 출연금 필드 반영', src.includes('gov_contrib'));
ok('제출서류 11종 정의', src.includes('var SUB_REQ_DOCS'));
ok('참여사별 3종(중소기업확인서·등기부·사업자등록증)',
  src.includes("['sme','중소기업확인서']") && src.includes("['reg','등기부등본']") && src.includes("['bizno','사업자등록증']"));

// ── ⑥ 연결 끊김을 '데이터 없음'과 구분 ──
ok('오프라인 배너', src.includes('function offlineBanner'));
ok('서버 값 받은 뒤에만 «기금이 없습니다»', src.includes('!S._fundsSynced'));

// ── ⑦ 관할 노동청 매핑(직제 관할구역) ──
/* 「충남 충남 논산시 …」처럼 시도가 두 번 든 주소가 실제 자료에 13%(563곳 중 71곳) 있었다 —
   사람이 목록을 옮겨 적을 때 시도 칸과 주소 칸을 겹쳐 쓰면 이렇게 되고, 그만큼 관할이 통째로 안 잡혔다.
   자료를 고치는 게 아니라 읽는 쪽이 견디게 한다(같은 실수는 계속 들어온다). 고친 뒤 71곳 → 1곳(남은 1곳은 「논산기」 오타). */
ok('시도가 두 번 든 주소를 견딘다', src.includes("var dup=/^(\\S+)\\s+(\\S+)\\s/.exec(a);")
  && src.includes('_sd(dup[1])===_sd(dup[2])')
  && src.includes('a=a.slice(dup[1].length+1).trim();'));
// 둘 다 «아는 시도 이름»일 때만 지운다 — 안 그러면 「서울 서초구 …」의 첫 낱말을 지울 수 있다
ok('아는 시도일 때만 중복을 지운다',
  src.includes('known.indexOf(dup[1])>=0 && known.indexOf(dup[2])>=0'));
/* ── 기금 현황: 묶음을 사이드바 하위 트리로 ── (대표 지시)
   유형(지역·공동·사내)과 상태(설립중·종료·삭제)를 본문 탭줄에 함께 늘어놓아
   축이 다른 둘이 한 층으로 보였다. 사이드바로 옮기고 본문 세 줄을 두 줄로 줄였다. */
ok('묶음 정의가 한 곳에 있다', src.includes('var HOME_GROUPS=[')
  && ['지역공동', '개별공동', '사내', 'setup', 'past', 'trash'].every(k => new RegExp("\\['" + k + "',").test(src)));
ok('「지난 기금」이 아니라 「종료기금」', src.includes("['past','🗂 종료기금']") && !src.includes("🗂 지난 기금"));
/* 사이드바와 본문이 «같은 함수»에서 나와야 한다 — 따로 세면 16 vs 15 처럼 어긋나고
   어느 쪽이 맞는지 알 수 없다 */
ok('묶음 나누기는 homeBuckets 한 곳', src.includes('function homeBuckets(')
  && src.includes('function renderNav(') && /renderNav\(\);/.test(src));
ok('본문 묶음 탭줄은 없앴다', src.includes("var tabbar='';   // 묶음 고르기는 사이드바로 옮겼다"));
/* 전체 백업은 메뉴가 아니라 «도구»다 — 사이드바에 두면 기금 현황·청구 관리와 같은 층으로
   보여 「어느 화면으로 가는 것인가」 하고 누르게 된다. 실제로는 파일 내려받기다.
   상단 ⚙〈백업·복구〉로 옮겼다. 창이 정말 열리는지는 check_backup.js 가 그려서 본다. */
ok('전체 백업이 사이드바 메뉴에 없다', !/id=['"]nav-backup['"]/.test(src));

/* 장부를 읽어 채우던 서식 둘을 «변환본 위»로 옮겼다.
   변환본에 남의 값이 박혀 있었고, 걷어내기는 숫자만 지우므로 한글로 적힌 것은 남았다 —
   출연확인서의 「오백만원」, 체크리스트의 「65명」·「서비스」·착안사항 「해당/비해당」.
   값이 맞는지는 check_forms.js 가 실제로 그려서 본다. */
ok('출연확인서를 변환본 위에서 채운다', src.includes("if(kind==='sub_contrib') fillContribDoc(d,f,sites);"));
ok('체크리스트를 변환본 위에서 채운다', src.includes("if(kind==='sub_checklist') fillChecklistDoc(d,f,sites);"));
/* 둘 다 «박힌 값을 바꾸는» 방식이라 걷어내기보다 반드시 먼저 돌아야 한다 —
   나중에 돌면 이미 밑줄로 바뀐 뒤라 바꿀 것을 못 찾는다(지원신청서가 그랬다). */
ok('둘 다 stripBaked 보다 먼저 돈다',
  src.indexOf('fillContribDoc(d,f,sites)') < src.indexOf('stripBaked(d);')
  && src.indexOf('fillChecklistDoc(d,f,sites)') < src.indexOf('stripBaked(d);'));
/* 착안사항(특수관계인·분할 여부)은 서류를 보고 «사람이» 판단할 일이다.
   업종도 기금 자료에 없는 칸이다 — 없는 것을 지어내면 확인 없이 그대로 공단에 나간다. */
ok('업종을 지어내지 않는다', src.includes("'업종':          '',"));
/* pdf.js 는 건네받은 버퍼를 워커로 «넘겨준다» — 원본이 그 자리에서 무효가 된다.
   스캔 PDF 는 글자층이 없어 두 번 읽어야 하는데(글자 찾기 → OCR),
   같은 버퍼를 다시 쓰다 「An ArrayBuffer is detached」로 터졌다.
   고유번호증·등기부처럼 스캔으로만 오는 서류는 한 번도 판독되지 않았다.
   실제로 터지는지는 check_pdfbuf.js 가 pdf.js 를 흉내 내 본다. */
ok('pdf.js 에는 사본을 준다', src.includes('function _pdfCopy(buf){')
  && (src.match(/data:_pdfCopy\(buf\)/g)||[]).length===2
  && !/data:buf\}/.test(src));
/* 걷어내기는 오랫동안 «숫자»만 봤다 — 그래서 변환본에 딸려 온 남의 값 중 한글로 적힌 것과
   「N명」이 그대로 인쇄됐다(contrib 「오백만원정」· bizplan 「일천만원」· sub_welfare_plan 「65명」).
   ⚠ 서식 «안내문»은 건드리면 안 된다 — 「위원이 4명 이상일 경우」는 서식의 일부다.
     금액과 같이 「미만·이상」이 붙으면 둔다. 값이 맞는지는 check_forms.js 가 그려서 본다. */
ok('한글로 적은 금액도 걷어낸다',
  src.includes('s=s.replace(/[일이삼사오육칠팔구십][가-힣]{0,4}[백천만억]원(?:정)?'));
ok('사람 수도 걷어낸다', src.includes('s=s.replace(/[0-9]+(\\s*)명(\\s*(?:미만|이상))?/g,'));
ok('안내문의 「N명 이상」은 남긴다', src.includes("function(m,sp,cmp){ return cmp?m:BAKE_BLANK+(sp||'')+'명'; });"));
ok('상단 ⚙ 가 백업·복구를 연다', src.includes('id="toolsbtn" onclick="showBackup()"'));
/* 파일로 통째로 되돌리는 길은 «일부러» 두지 않았다 — 잘못 누르면 전 기금이 한 번에 날아간다.
   다만 실수로 지운 기금은 삭제 보관함에서 되살아난다. 그 길을 함께 알려 주어야
   「되돌릴 방법이 아예 없다」고 읽히지 않는다. */
/* ⚠ 여기에 「되돌리기는 없다」고 적어 두었다가 틀린 것으로 드러났다 —
     공용 부품 js/pu-backup.js 가 매일 떠서 30시점을 보관하고 되돌린다.
     창이 그 길을 알려 주는지 본다. 없는 척하면 사람이 있는 기능을 못 쓴다. */
ok('시점 복원이 어디 있는지 알려 준다',
  src.includes('왼쪽 아래 [백업·복구]</b> 단추에 있습니다')
  && src.includes('최근 30개 시점'));
ok('둘이 하는 일이 다르다고 말해 준다',
  src.includes('서버 안에</b> 두는 것이라') && src.includes('서버 밖으로</b> '));
ok('실수로 지운 기금을 되살리는 길을 알려 준다', src.includes('삭제 보관함</b>에서 <b>↩ 복원'));
/* 뜻은 「고른 묶음 기준으로 센다」이다 — 앞에 조건이 붙어도(미완비 묶음 등) 상관없다.
   글자를 통째로 맞추면 다른 사람이 묶음을 늘릴 때마다 «멀쩡한데» 빨개진다. */
ok('머리줄은 고른 묶음만 말한다', /var curInc=[^;]*_curList\.filter\(/.test(src)
  && !src.includes("'<h1>기금 현황</h1><span class=\"stat\">운영 '"));
// 빈 묶음을 사이드바에 남기면 누를 것도 없는 줄이 자리만 차지한다(묶음이 늘어도 뜻은 같다)
ok('빈 설립중·종료·삭제는 사이드바에서 숨긴다',
  /if\(!n && \(g\[0\]==='setup'\|\|g\[0\]==='trash'\|\|g\[0\]==='past'[^)]*\)\) return '';/.test(src));
ok('[기금 현황]을 누르면 첫 하위로 (대표 선택 ②-나)',
  /function goHome\(\)\{[\s\S]{0,240}?S\.homeTab='지역공동';[\s\S]{0,240}?go\('home'\);/.test(src));
/* ── 하위 묶음 접기·펴기 ── (대표 지시)
   접어 두면 다음에 열 때도 접혀 있어야 하고, 접힌 채로도 «어느 묶음을 보는지» 알 수 있어야 한다. */
ok('접힘 상태를 이 브라우저에 적어 둔다', src.includes("var NAVSUB_LS='fund_navsub_open_v1';")
  && src.includes('function navSubOpen(') && src.includes('function toggleNavSub('));
/* 접었는데 다음에 열면 다시 펴져 있으면 «접기»가 아니다 — 토글이 실제로 «뒤집어» 저장하는지 본다.
   ⚠ 함수 이름으로 범위를 잡으면 안 된다 — 바로 아래 goHome 에도 setItem 이 있어
      그것을 보고 통과해 버린다(변이시험에서 새어 나갔다). */
ok('접기를 누르면 그 상태를 저장한다',
  src.includes("localStorage.setItem(NAVSUB_LS, navSubOpen()?'0':'1');"));
ok('화살표가 접힘에 따라 바뀐다', src.includes("cx.textContent=open?'▾':'▸';")
  && src.includes("host.className=open?'':'hid';"));
ok('접혀 있으면 고른 묶음 이름을 머리줄에 덧붙인다',
  src.includes("hc.textContent=(!open&&lbl?lbl+' · ':'')"));
ok('[기금 현황]을 누르면 접힌 것을 펴 준다',
  /function goHome\(\)\{[\s\S]{0,240}?if\(!navSubOpen\(\)\)/.test(src));
ok('화살표를 눌러도 화면 이동은 안 된다(누름 전파 차단)',
  src.includes('onclick="event.stopPropagation();toggleNavSub()"'));

/* ── 분류(지역) ── 「지역」 칸 하나가 곧 분류다. */
ok('분류 목록은 실제 값에서 뽑는다', src.includes('function regionsOf(')
  && src.includes('function regSelect(') && src.includes('function setRegionQuick('));
ok('새 분류를 그 자리에서 만들 수 있다', src.includes("<option value=\"__new\">＋ 새 분류…</option>")
  && src.includes("if(val==='__new')"));
/* 분류를 바꾸면 지역기금↔공동기금으로 «옮겨 간다» — 모르고 옮기면 목록에서 사라진 줄 안다 */
ok('옮겨 가면 어디로 갔는지 알린다', src.includes('before=grp(f)') && src.includes('after=grp(funds[fid])')
  && src.includes("toast(before!==after ?"));
ok('사내기금에는 분류를 안 붙인다', src.includes("(f.fund_type==='사내'?'<span class=\"muted\">—</span>':regSelect(f))"));
/* 유형이 섞인 목록(종료기금·설립중)에서 머리와 몸통 칸 수가 어긋나면 값이 옆으로 밀린다 */
ok('분류 칸 유무는 표가 한 번에 정한다', src.includes('var showReg=list.some(')
  && src.includes('fundRow(f,i+1,mode,showReg)') && src.includes('function fundRow(f,no,mode,showReg)'));

ok('지역기금을 분류로 한 겹 더 나눈다', src.includes("if(S.homeTab==='지역공동' && S.homeView==='basic'){")
  && src.includes("S.homeReg=") && src.includes("_chip('','전체',(G['지역공동']||[]).length)"));
/* 고르는 곳(칩)과 나누는 곳(본문)이 각자 세면 「충남 12」인데 표는 11줄 같은 어긋남이 난다 */
ok('칩과 본문이 같은 나눔(_rs·_rk)을 쓴다', src.includes('if(_rs && _rk.length>1 && cur.length){')
  && src.includes('_rs[r].filter(function(f){ return cur.indexOf(f)>=0; })'));
// 분류가 하나뿐이면 칩이 「전체 16 · 충남 16」으로 같은 말을 두 번 한다
ok('분류가 하나뿐이면 칩을 안 그린다', src.includes('if(_rk.length>1){') && src.includes("} else S.homeReg='';"));

/* ── 머리줄 한 줄 · 부드러운 알약 ── (대표 지시) */
ok('보기 전환이 제 줄을 만들지 않는다',
  /function homeViewBar\(\)\{[\s\S]{0,400}?return '<div class="segbar">/.test(src));
ok('이름·개수·보기·분류가 한 줄에', src.includes("+_bar+homeViewBar()")
  && src.includes("+(regBar?_bar+regBar:'')"));
ok('분류 상자를 따로 만들지 않는다', !src.includes('<div class="panel" style="padding:8px 12px"><div class="segbar"'));
/* 채운 파랑 → 옅은 바탕 위 흰 알약. 옛 규칙이 남아 있으면 새 것을 덮는다 */
ok('알약형 세그먼트', src.includes('.segbar{display:inline-flex;gap:2px;border-radius:999px')
  && src.includes('.segbar .seg.on{background:#fff;color:var(--acc2)'));
ok('옛 채운-파랑 규칙은 지웠다', !/^\s*\.seg\.on\{background:var\(--acc\)/m.test(src)
  && !src.includes('.seg-old{'));
/* 한 줄에 많이 담으므로 좁아지면 접혀야 한다 — 980px 에서 화면 밖으로 넘치던 것을 브라우저로 봤다.
   .row 는 넓은 화면에서 flex-wrap 이 없고 .search 는 min-width 220px 이라 안 줄어든다. */
ok('좁아지면 머리줄이 접힌다', src.includes('style="gap:8px;flex-wrap:wrap"'));
ok('검색칸이 줄어들 수 있다', src.includes('style="min-width:150px;max-width:260px;flex:1 1 150px"'));
/* ⚠ 끌리는 단위가 «감싸는 상자»로 바뀌었다 — 선택자를 안 고치면 기금 현황만 목록에서 빠져
   순서 저장이 조용히 어긋난다(브라우저에서 실제로 끌어 확인했다). */
ok('순서 저장이 감싸는 상자를 센다', src.includes("var NAV_SEL=':scope > [data-nav]';")
  && src.includes('l.querySelectorAll(NAV_SEL)'));
ok('옛 저장분(nav-home)을 새 이름으로 옮겨 준다',
  src.includes("if(id==='nav-home') id='nav-home-wrap';"));
ok('하위 묶음은 끌리지 않는다 (대표 지시 ④)',
  src.includes("if(e.target.closest&&e.target.closest('#navsub')) return;")
  && src.includes("e.target.closest('#navlist > [data-nav]')"));

/* 관할 세 가지는 «같은 소재지»에서 나온다 — 함수도 단추도 하나로 합쳤다.
   다시 셋으로 갈라지면 같은 42개 주소를 세 번 훑고 세 번 확인하게 된다. */
ok('관할 일괄은 하나로 합쳐져 있다', src.includes('var BULK_OFFICES=[')
  && src.includes('function bulkOffices(') && src.includes('function applyBulkOffices('));
ok('노동청·세무서·등기소를 한 표에서 본다',
  ["key:'labor_office'", "key:'tax_office'", "key:'registry_office'"].every(k => src.includes(k)));
ok('옛 세 벌은 남지 않았다',
  !/function bulkRegistry\(/.test(src) && !/function bulkTax\(/.test(src) && !/function bulkLabor\(/.test(src));
ok('단추도 하나뿐', (src.match(/bulkOffices\(\)/g) || []).length >= 2
  && !src.includes('bulkRegistry()') && !src.includes('bulkTax()') && !src.includes('bulkLabor()'));
// 줄마다 제 칸에 넣어야 한다 — 한 칸에 몰아넣으면 세무서 값이 노동청 칸에 들어간다
ok('적용기가 줄마다 제 칸에 넣는다', src.includes('var fld=function(p){ return field||p.key; };')
  && src.includes("updates[p.id+'/'+fld(p)]=p.office;"));
/* 추정값이 «사람이 확인해 넣은 값»을 덮으면 안 된다 — 그러면 조용히 틀린 관서가 서식에 나간다.
   미리보기 때 한 번, 적용 직전에 서버 값으로 또 한 번 — 두 겹 다 있어야 한다. */
ok('이미 든 값은 미리보기에서 빠진다', src.includes("if(String(f[o.key]||'').trim()) return;"));
ok('적용 직전에도 다시 확인한다', src.includes("if(String(c[fld(p)]||'').trim()){ skip++; return; }"));
// 소재지가 없으면 추정 자체가 불가능하다 — 몇 개가 그래서 빠졌는지 사람에게 알려야 한다
ok('소재지 없는 기금을 세어 알린다', src.includes("if(!(f.address||'').trim()){ noAddr++; return; }")
  && src.includes('소재지가 없어 제외'));
ok('도움말도 하나로', src.includes("'bulk.office':{t:'관할 기관 일괄 추정'")
  && !src.includes("'bulk.reg':") && !src.includes("'bulk.tax':") && !src.includes("'bulk.labor':"));
/* 죽은 코드 — 되살아나면 다시 «부르는 곳 없는 짐»이 된다 */
ok('단추를 뗀 「푸른이알피 업체 연결」 코드는 지웠다',
  ['function pickCompany(', 'function renderCoList(', 'function chooseCompany(',
   'function companyToSite(', 'function loadCompanies('].every(n => !src.includes(n)));
ok('설립중 목록 모달·CLOSE_SHEETS·SITE_PARTNER_FIELD 도 지웠다',
  !src.includes('function showSetupFunds(') && !src.includes('function openSetup(')
  && !src.includes('var CLOSE_SHEETS=') && !src.includes('var SITE_PARTNER_FIELD='));
// 임원 명부에 저장 단추를 또 두지 않는다 — 한 화면에 같은 일을 하는 단추가 둘이면 망설이게 된다
ok('기금 정보 화면의 저장 단추는 하나', (src.match(/onclick="saveInfo\(\)"/g) || []).length === 1);

ok('서산지청 승격 반영(서산시)', src.includes("'충남 서산시':'대전지방고용노동청 서산지청'"));
ok('예산군은 천안지청', src.includes("'충남 예산군':'대전지방고용노동청 천안지청'"));
ok('보령지청에 서산 없음',
  !/'충남 서산시':'대전지방고용노동청 보령지청'/.test(src));
/* 대구·경북 — 고용노동부 관할관서찾기(대구/경북)로 확인해 넣었다.
   이 값은 인가신청서 수신처(「○○지방고용노동청(○○지청)장 귀하」)로 그대로 나간다. */
ok('대구 달서구·달성군은 대구서부지청', src.includes("'대구 달서구':'대구지방고용노동청 대구서부지청'")
  && src.includes("'대구 달성군':'대구지방고용노동청 대구서부지청'"));
/* 칠곡군은 **석적읍 중리 국가산단만 구미지청**이고 나머지는 서부지청이다.
   지도는 시·군·구 단위라 읍·면을 못 가르므로 서부지청으로 두고, 그 단서를 주석에 남긴다. */
ok('칠곡군은 대구서부지청(석적 국가산단 단서 포함)',
  src.includes("'경북 칠곡군':'대구지방고용노동청 대구서부지청'")
  && src.includes('석적읍 중리 국가산업단지만 구미지청'));
ok('구미지청은 구미·김천', src.includes("'경북 구미시':'대구지방고용노동청 구미지청'")
  && src.includes("'경북 김천시':'대구지방고용노동청 구미지청'"));
ok('안동지청은 안동·예천·의성·청송·영양', ['안동시', '예천군', '의성군', '청송군', '영양군']
  .every(g => src.includes("'경북 " + g + "':'대구지방고용노동청 안동지청'")));
ok('포항지청은 포항·경주·영덕·울릉·울진', ['포항시', '경주시', '영덕군', '울릉군', '울진군']
  .every(g => src.includes("'경북 " + g + "':'대구지방고용노동청 포항지청'")));
/* 경남(부산지방고용노동청) — 관할관서찾기 「부산/경남」으로 확인해 넣었다.
   하동공동기금이 여기 있어, 이 칸이 비면 [🏤 노동청 일괄]이 그 기금을 «매핑 없음»으로 제친다. */
ok('진주지청은 진주·사천·산청·하동·남해', ['진주시', '사천시', '산청군', '하동군', '남해군']
  .every(g => src.includes("'경남 " + g + "':'부산지방고용노동청 진주지청'")));
ok('창원지청은 창원·함안·의령·창녕', ['창원시', '함안군', '의령군', '창녕군']
  .every(g => src.includes("'경남 " + g + "':'부산지방고용노동청 창원지청'")));
ok('양산지청은 김해·밀양·양산', ['김해시', '밀양시', '양산시']
  .every(g => src.includes("'경남 " + g + "':'부산지방고용노동청 양산지청'")));
ok('통영지청은 통영·고성·거제', ['통영시', '고성군', '거제시']
  .every(g => src.includes("'경남 " + g + "':'부산지방고용노동청 통영지청'")));
/* 거창·함양·합천은 공식 안내에 안 나왔다. 지어 넣으면 인가신청서 수신처가 틀리므로
   «없는 채로» 두어야 한다 — 누가 나중에 짐작으로 채우는 것을 여기서 막는다. */
ok('안 확인된 거창·함양·합천은 넣지 않았다',
  ['거창군', '함양군', '합천군'].every(g => !src.includes("'경남 " + g + "':'부산")));
/* 등기소 이름 — 등기사항전부증명서가 밝힌 그대로여야 한다. 등기 신청서 수신처로 나간다.
   홍성지원은 「등기과」가 아니라 **등기계**임을 서류 세 장이 일러 준다. */
ok('홍성군은 홍성지원 등기계(등기과 아님)',
  src.includes("'충남 홍성군':'대전지방법원 홍성지원 등기계'")
  && !src.includes("'충남 홍성군':'대전지방법원 홍성지원 등기과'"));
ok('보령시는 보령등기소', src.includes("'충남 보령시':'대전지방법원 보령등기소'"));
ok('서천군은 장항등기소', src.includes("'충남 서천군':'대전지방법원 장항등기소'"));
/* 세무서 — 고유번호증을 낸 관서와 같아야 한다. 당진시가 서산이 아니라 «예산»세무서인 것이
   눈에 안 띄는 함정이라 못 박아 둔다(충남 8호 고유번호증: 예산세무서장). */
ok('당진시는 예산세무서', src.includes("'충남 당진시':'예산세무서'"));
/* ── 지원금 평가표(2025년 개정) ── 배점은 예상 수령액으로 이어진다.
   화면 배선까지 봐야 한다 — 셈만 고치고 화면이 옛 글을 그대로 띄우면 사람이 속는다. */
ok('2025·2026년은 2025년판 배점', /'2025':\{[^}]*rubric:'2025'/.test(src) && /'2026':\{[^}]*rubric:'2025'/.test(src));
ok('2024년 이전은 옛 배점 그대로', /'2024':\{[^}]*rubric:'2024'/.test(src) && /'2023':\{[^}]*rubric:'2024'/.test(src));
ok('③ 평균 근로자수 함수(30·50·80·100명)', src.includes('function _subP3avg(v){ return v<30?5:v<50?4:v<80?3:v<100?2:1; }'));
ok('① 가중치를 배점판으로 가른다', src.includes('var w1=r25?3:5;'));
ok('정성 상한을 배점판으로 가른다', src.includes('var qualMax=r25?40:30;')
  && src.includes('Math.min(qualMax,num(o.qual)||0)'));
ok('2025년판은 ②-2를 안 본다', /var p2b=r25\?5:\(nSite>=10\?_subP2b/.test(src));
ok('2025년판 ③은 평균 근로자수로 셈한다', src.includes('var p3=r25?_subP3avg(avgEmp):_subP3('));
// 화면: 배지·정성 상한 라벨·③ 입력칸 감추기·안내문이 모두 배점판을 따라야 한다
ok('배지가 배점판 이름을 띄운다', src.includes(">'+c.rubric+'년 평가표 배점<"));
ok('정성 입력 라벨이 상한을 따라간다', src.includes("정성평가(사업계획 '+c.qualMax+'점)"));
ok('2025년판에는 ③ 입력칸을 아예 안 그린다', src.includes("+(c.rubric==='2025' ? ''")
  && src.includes("③ 1인당 이미 지원받은 금액(원)"));
ok('안 그린 ③ 칸을 0으로 덮어쓰지 않는다', src.includes("if($('sp-prev')) obj.prev_per_worker=v.prev;")
  && !/var obj=\{ req_type:v\.type, qual_score:v\.qual, prev_per_worker/.test(src));
ok('도움말이 옛 「2024년 평가표 기준」 경고를 더는 띄우지 않는다',
  !src.includes('이 배점은 <b>2024년 평가표</b> 기준입니다'));

/* ── 임원 명부 · 감사보고서 · 협의회 회의록 ──
   정관 제16조(결산→감사 의견→협의회 승인)와 제25조(감사 노·사 각 1인)를 서류로 옮긴 것.
   명부가 비면 이름 없는 서류가 나가므로, 넣는 길과 알리는 길을 함께 못 박는다. */
ok('임원 직위 다섯 가지(이사장·노사 이사·노사 감사)',
  ['이사장', '사용자측 이사', '근로자측 이사', '사용자측 감사', '근로자측 감사']
    .every(r => src.includes("'" + r + "'")) && src.includes('var OFFICER_ROLES='));
ok('감사를 노·사로 갈라 읽는다', /_auditorsOf/.test(src)
  && src.includes("side:/사용자/.test(r)?'사용자측':/근로자/.test(r)?'근로자측':''"));
// 명부를 넣는 길이 실제로 있어야 한다 — 종전에는 읽기만 하고 쓰는 곳이 없어 42개 기금이 모두 비어 있었다
ok('명부 입력 화면이 있다', src.includes('function officerPanel(') && src.includes('function addOfficerRow(')
  && src.includes('function _readOfficers('));
ok('명부가 기금 정보와 함께 저장된다', src.includes('officerPanel(f)')
  && src.includes('if(offs) patch.officers=offs.length?offs:null;'));
// 다른 화면에서 저장할 때 명부를 통째로 날리지 않아야 한다
ok('표가 없으면 명부를 건드리지 않는다', /var offs=_readOfficers\(\);/.test(src)
  && src.includes("var b=$('off-rows'); if(!b) return null;"));
ok('명부가 비면 화면이 그렇게 알린다', src.includes('감사보고서·회의록에 이름이 안 들어갑니다'));

ok('서식 목록에 감사보고서·결산 회의록이 있다',
  src.includes("['ops_audit','감사보고서(결산·감사별 각 1장)']")
  && src.includes("['ops_minutes_close','협의회 회의록(결산 승인·별지 제13호)']"));
/* 감사는 «각자» 쓴다 — 함께 서명하는 「본인 등은」이 남아 있으면 안 된다 */
// 서류 «본문»만 본다 — 왜 그렇게 했는지 적은 주석에도 「본인 등은」이 나오기 때문이다
ok('감사보고서는 「본인은」으로 쓴다', src.includes('본인은 <b>')
  && !src.includes('본인 등은 <b>'));
ok('감사보고서를 감사 수만큼 낸다', /auds\.map\(function\(a,i\)\{/.test(src)
  && src.includes("return \"<div class='a4'>\"+(i===0?head:'')+_auditSheet(f,a,fy)+\"</div>\";"));
/* paginateDoc 은 최상위 .a4 가 있으면 그 «밖»의 마디를 버린다 — 머리말이 첫 장 안에 들어가야 한다 */
ok('머리말을 첫 장 안에 넣는다(조판이 버리지 않게)', src.includes("(i===0?head:'')")
  && src.includes('그 밖의 마디는 버려진다'));
ok('감사가 없으면 명부를 채우라고 안내', src.includes('임원 명부에 <b>감사</b>가 없습니다'));
ok('감사 의견 두 갈래', src.includes('var AUDIT_OP=') && src.includes("'적정':") && src.includes("'지적':")
  && src.includes('function _setAuditOp('));
ok('의견을 한꺼번에 바꾼다(장이 여럿이라 클래스로)', src.includes("querySelectorAll('.audit-op')")
  && src.includes("<p class='audit-op'>"));
/* 첫해 감사는 «인가일부터» — 1월 1일로 적으면 법인이 없던 기간까지 감사한 것이 된다 */
ok('설립한 해는 인가일부터 감사', src.includes('if(ik && ik.slice(0,4)===String(y) && ik>s) s=ik;'));
ok('회의록은 별지 제13호', src.includes('[별지 제13호서식]') && src.includes('제1호 의안 : "+yrC+"년 회계결산 및 감사보고 건'));
ok('회의록이 정관 제16조를 근거로 든다', src.includes('감사의 의견을 첨부</b>하여 상정'));
/* 확정 전 숫자를 회의록에 박으면 나중에 승인받은 숫자와 서류가 어긋난다 */
ok('확정한 해만 결산 수치를 넣는다', src.includes('if(!c.locked||fin.f15_rest==null)')
  && src.includes('확정 전 숫자는 넣지 않습니다'));
ok('서식에 없는 표임을 밝힌다', src.includes('별지 제13호 서식에는 없는 표입니다'));
ok('임원 명부 도움말', src.includes("'officers':{t:'임원 명부'"));
/* 명부는 «줄의 묶음»이라 글자로 다루면 [object Object] 가 저장돼 통째로 망가진다.
   등기부에서 옮긴 명부를 한 번에 넣을 수 있어야 서류가 이름을 갖는다. */
ok('가져오기가 임원 명부를 받는다', /var IMP_FIELDS=\[[^\]]*'officers'/.test(src)
  && src.includes('var _IMP_LIST={officers:1};'));
ok('명부는 배열로 다룬다(String 으로 뭉개지 않는다)', src.includes('if(_IMP_LIST[f]){')
  && src.includes('if(!Array.isArray(v)||!v.length) return;')
  && src.includes('set[f]=v; names.push(f'));
ok('이미 든 명부는 덮지 않는다', src.includes('if(curL.length&&!over) return;'));

/* ── 화면: 붙여 둔 기금 머리(3줄) · 좁은 드롭존 · 참여사업장 하위 탭 ── */
ok('기금 머리를 상태줄 아래에 붙인다',
  src.includes('#fundhead{position:sticky;top:var(--topbar-h,48px)'));
ok('이름·식별번호가 한 줄(.fhead)', src.includes('var idline=\'<div class="fhead">')
  && src.includes('class="fid"'));
ok('머리와 탭을 한 덩이로 감싼다', src.includes("'<div id=\"fundhead\">'+idline+tabbar+'</div>'"));
/* 상태줄 높이를 한 번만 재면 첫 그림 때 값이 굳어 틈이 벌어진다(89 vs 53, 실제로 봤다) */
ok('상태줄 높이를 계속 따라간다', src.includes('function _syncTopbarH(')
  && src.includes('new ResizeObserver(function(){ _syncTopbarH(); })')
  && src.includes('requestAnimationFrame(function(){ _syncTopbarH(1); })'));
ok('창 크기·글꼴 로드에도 다시 잰다', /addEventListener\('resize',function\(\)\{ _syncTopbarH\(\); \}\)/.test(src)
  && /addEventListener\('load',function\(\)\{ _syncTopbarH\(\); \}\)/.test(src));
/* 식별번호는 줄바꿈 대신 옆으로 — 줄이 늘면 붙여 둔 머리가 화면을 잡아먹는다 */
ok('식별번호는 옆으로 넘긴다(줄바꿈 아님)', /\.fhead \.fid\{[^}]*white-space:nowrap/.test(src)
  && /\.fhead \.fid\{[^}]*overflow-x:auto/.test(src));

ok('좁은 드롭존이 따로 있다', src.includes('function dropZoneSlim('));
ok('참여사업장은 좁은 드롭존을 쓴다', src.includes("dropZoneSlim('dz-sites'"));
ok('좁은 드롭존도 같은 처리기를 쓴다(끌어놓기·클릭이 살아 있다)',
  /function dropZoneSlim\([\s\S]{0,700}?dzOver\(event,1\)[\s\S]{0,400}?dzDrop\(event/.test(src)
  && /function dropZoneSlim\([\s\S]{0,900}?dzPick\(/.test(src));

// onclick 안의 따옴표는 소스에서 \' 로 escape 돼 있다 — 그대로 찾으면 헛돈다
ok('참여사업장이 명부·연도별 하위 탭으로 갈린다', /goSiteTab\(\\?'list\\?'\)/.test(src)
  && /goSiteTab\(\\?'years\\?'\)/.test(src) && src.includes('function goSiteTab('));
ok('하위 탭 이동도 미저장 입력을 지킨다', /function goSiteTab\(t\)\{ _leaveGuard\(\)/.test(src));
// 두 표를 위아래로 함께 그리던 옛 함수가 남아 있으면 다시 두 번 그려진다
ok('옛 sitesYearPanel 은 남지 않았다', !src.includes('sitesYearPanel'));
ok('연도별은 속살만 그린다(상자 이중 아님)', src.includes('function sitesYearBody(')
  && !/function sitesYearBody\(arr\)\{[\s\S]{0,200}?return '<div class="panel">/.test(src));
/* 고른 하위 탭이 «실제로» 화면을 가르는지 — 조건을 굳혀 두면 탭만 있고 늘 같은 표가 나온다 */
ok('고른 하위 탭이 표를 가른다', src.includes("var isYr=(S.siteTab==='years');")
  && src.includes('+(isYr ? sitesYearBody(arr)'));
/* 두 표는 «같은 배열·같은 차례»를 받아 (i+1) 로 센다 — 따로 세면 명부 7번과 연도별 7번이 달라진다.
   ⚠ 반드시 sitesYearBody «안»에서 찾아야 한다. 명부(sitesTab)에 글자가 똑같은 줄이 있어서
      파일 전체에서 찾으면 명부를 보고 통과해 버린다(변이시험 3건이 그렇게 새어 나갔다). */
{
  const i0 = src.indexOf('function sitesYearBody(');
  const yb = i0 < 0 ? '' : src.slice(i0, src.indexOf('\n}', i0));
  ok('연도별 기록 함수를 찾았다', !!yb);
  ok('연도별 기록에도 번호가 있다', /arr\.map\(function\(s,i\)\{/.test(yb)
    && yb.includes('<td class="no">\'+(i+1)+\'</td>')
    && yb.includes('<th class="no">번호</th><th>사업장</th>'));
  // 번호 칸이 늘었으니 합계 줄도 맞춰야 숫자가 한 칸씩 밀리지 않는다
  ok('연도별 합계 줄이 번호 칸만큼 맞춰졌다', yb.includes('<td colspan="2">합계</td>'));
}

ok('홍성군은 홍성세무서', src.includes("'충남 홍성군':'홍성세무서'"));
ok('보령시는 보령세무서', src.includes("'충남 보령시':'보령세무서'"));

// ── ⑧ 회계 계정 체계 (A공동 2025 실결산 검증에서 확인된 필수 계정) ──
ok('세금과공과 계정', src.includes("'세금과공과':'비용'"));
ok('격려금 계정', src.includes("'격려금':'비용'"));
ok('고유목적사업준비금환입 계정(수익)', src.includes("'고유목적사업준비금환입':'수익'"));
/* ══ 서식 자동 채움 ══ 라벨 옆 칸에 기금 데이터를 넣는 자리.
   설립인가신청서 기준으로 넓혔다(값 6개 → 16곳). */
ok('대표자는 명부의 이사장 줄에서 온다', src.includes('function _boss(f){')
  && src.includes("return /이사장/.test(x.role||'');"));
// 임원 명부에 생년월일·직책이 없으면 위원 칸을 손으로 쳐야 한다
/* 주민등록번호(rrn)는 2026-09-07 에 더했다 — 등기·세무 서식 다섯이 전체 번호를 묻는다.
   ⚠ 예전엔 읽는 목록을 «글자 그대로» 붙들어, 칸을 하나 더하자 뜻은 그대로인데 검사가 깨졌다 — 칸마다 본다. */
ok('임원 명부가 생년월일·직책·주민등록번호·주소를 담는다', src.includes("class=\"off-birth\"") && src.includes("class=\"off-rrn\"")
  && src.includes("class=\"off-title\"") && src.includes("class=\"off-addr\"")
  && /\['birth','title','rrn','addr'\]\.forEach/.test(src));
/* 반복 줄(근로자측 3줄·사용자측 3줄)은 «라벨 다음 칸» 방식으로 못 채운다 */
ok('위원 격자를 따로 채운다', src.includes('function fillCommittee(root,f){')
  && src.includes("['근로자측','사용자측'].forEach"));
/* 위원 격자를 «먼저» 채우고 표를 남겨야, 뒤이은 라벨 채우기가 덮어쓰지 않는다.
   「생년월일」·「직책」 라벨이 대표자란에도 있어서 실제로 덮어썼다. */
ok('위원 격자를 먼저 채우고 표를 남긴다', /stripBaked\(d\);[\s\S]{0,200}?fillCommittee\(d,f\);/.test(src)
  && src.includes("tr.setAttribute('data-cm','1');")
  && src.includes("if(tr.getAttribute('data-cm')) return;"));
{
  /* ⚠ 이것이 핵심이다. 사람에 관한 값(대표자 이름·생일·주소·직책)은 «어느 칸 아래인지»를
     걸어야 한다. 안 걸었더니 「주소」가 등록면허세 신고서(납세자 주소)와
     임대차계약서(임대인·임차인 주소)에까지 대표자 개인 주소로 들어갔다. */
  const i0 = src.indexOf('var FORM_FILL=['), i1 = src.indexOf('];', i0);
  const blk = src.slice(i0, i1);
  const rows = [...blk.matchAll(/\[(\/[^\/]+\/),\s*function\(f\)\{return ([^;]+);\}(,\s*\/[^\/]+\/)?\]/g)];
  ok('채움 규칙을 읽었다 (' + rows.length + '개)', rows.length >= 12);
  const bare = rows.filter(m => /_boss\(f\)/.test(m[2]) && !m[3]);
  ok('사람에 관한 값은 칸이 걸려 있다' + (bare.length ? ' — ' + bare.map(m => m[1]).join(', ') : ''),
    bare.length === 0);
  ok('칸 걸기를 실제로 본다', src.includes('if(FORM_FILL[k][2] && !FORM_FILL[k][2].test(sect)) break;'));
}
// 분사무소의 「소재지」에 본사 주소를 넣으면 안 된다
ok('분사무소는 건너뛴다', src.includes("if(/분사무소/.test(sect)) return;")
  && src.includes("var sp=parseInt(cells[0].getAttribute('rowspan')||'1',10);"));
/* 이 서식은 라벨과 적는 자리가 «한 칸»이다(명칭 칸이 colspan 13) —
   옆 빈 칸만 찾으면 아무것도 안 채워진다 */
ok('한 칸짜리 서식은 라벨 뒤에 이어 적는다', src.includes("s.className='fv'; s.textContent=v;")
  && /\.fv\{margin-left:14px;font-weight:600\}/.test(src));
// 신청 날짜·신청인은 정해져 있다 — 손으로 칠 까닭이 없다
ok('신청 날짜와 신청인을 채운다', /\^20\\s\*년\\s\*월\\s\*일\$/.test(src)
  && /\/\^신청인\\s\*대표\$\/\.test\(t\)/.test(src));

{
  /* ⚠ 같은 이름의 함수를 둘 두면 «뒤엣것이 이긴다» — 오류도 안 난다.
     실제로 그랬다: 서식 손질용으로 fillSubsidy 를 새로 썼는데 엑셀 채우기에 이미 있어서,
     브라우저에서는 엑셀 함수가 불렸다(그래서 서식은 안 채워지고 엑셀은 깨졌다).
     이 검사가 없으면 다음에도 조용히 되풀이된다. */
  const names = [...src.matchAll(/^function\s+([_a-zA-Z][\w$]*)\s*\(/gm)].map(m => m[1]);
  const seen = {}, dup = [];
  names.forEach(n => { if (seen[n]) { if (dup.indexOf(n) < 0) dup.push(n); } else seen[n] = 1; });
  ok('같은 이름의 함수가 둘 있지 않다' + (dup.length ? ' — ' + dup.join(', ') : ''), dup.length === 0);
}
/* ══ 사업계획서 손익예산 ══
   서식의 열 단계는 손익계산서와 같은 짜임새라, 예산만 있으면 나머지는 셈으로 나온다.
   제출본과 대조해 칸 하나까지 같은 것을 확인했다. */
ok('사업계획서를 예산으로 채운다', src.includes('function bizplanRows(f,yr){')
  && src.includes('function fillBizplanDoc(root,f){')
  && src.includes("if(kind==='bizplan') fillBizplanDoc(d,f);"));
/* ⚠ 이것은 «계획»이다 — 실적(computeFin)을 넣으면 내년 계획 자리에 올해 실적이 들어간다.
   예산이 비면 «비운 채로» 둔다. */
ok('예산이 없으면 안 채운다', src.includes('if(!_hasBudget(S.fundId,yr)) return null;')
  && src.slice(src.indexOf('function bizplanRows'), src.indexOf('function fillBizplanDoc')).indexOf('computeFin') < 0);
/* 목적사업 회계와 기금관리 회계가 «따로» 0 으로 맞물린다(제출본이 그렇게 짜여 있다) */
ok('두 회계가 따로 맞물린다', src.includes('var pNonopExp=spare, pNonopRev=spare-pOp;')
  && src.includes('var fNonopExp=interest;'));
/* ⚠ 이 서식은 «천원» 단위다 — 원으로 적으면 천 배로 부풀어 보인다 */
ok('천원 단위로 적는다', src.includes('var n=Math.round((v||0)/1000);'));
// 음수는 △ 로 적는 것이 이 서식의 관례다
ok('음수를 △ 로 적는다', src.includes("return (n<0?'△':'')+Math.abs(n).toLocaleString();"));
// 예비비는 예산의 「그 밖의 비용」이다
ok('예비비를 그 밖의 비용에서 가져온다', src.includes("spare=g('exp_etc')"));

/* ⚠ 차례가 어긋나면 조용히 빈다 — 실제로 그랬다.
   지원신청서는 «박힌 값을 우리 값으로 바꾸는» 방식이라 걷어내기보다 먼저 돌아야 한다.
   나중에 돌리면 이미 밑줄로 바뀐 뒤라 바꿀 것을 못 찾고, 금액·신청일이 통째로 비었다.
   문자열이 있는지만 보는 검사는 이것을 못 잡았다. 차례를 못 박는다. */
ok('지원신청서를 걷어내기보다 먼저 채운다',
  src.indexOf("if(kind==='subsidy') fillSubsidyDoc(d,f);") < src.indexOf('  stripBaked(d);')
  && src.indexOf("if(kind==='subsidy') fillSubsidyDoc(d,f);") > 0);
// 채운 칸에 표를 남겨야 걷어내기가 도로 지우지 않는다
ok('채운 칸을 걷어내기가 건너뛴다', src.includes("td.setAttribute('data-kept','1');")
  && src.includes("if(td.getAttribute('data-kept')) return;")
  && src.includes("if(el.getAttribute&&el.getAttribute('data-kept')) continue;"));
/* ⚠ 확정 스냅샷은 자산총계를 «assets» 로 담는다(computeFin 의 totalAssets 가 아니다).
   그것을 몰라 추정재무상태표가 실데이터로는 한 번도 안 채워졌다 —
   지어낸 시험자료로만 통과했다. */
ok('스냅샷의 assets 를 읽는다', src.includes('function _bizFinOf(){')
  && src.includes('var assets=(f.assets!=null)?f.assets:f.totalAssets;')
  && src.includes('if(f.res1==null||f.res2==null||f.secu==null) return null;'));
ok('스냅샷이 증권·준비금을 담는다', src.includes('secu:fin.secu, res1:fin.res1, res2:fin.res2,'));
// 예산이 있나 하는 잣대는 «한 곳»에서 — 두 벌이면 서로 어긋난다
ok('예산 있나를 한 곳에서 본다', src.includes('function _hasBudget(fid,yr){')
  && src.includes('var BUDGET_KEYS=[')
  && (src.match(/_hasBudget\(S\.fundId,yr\)/g)||[]).length===2);

/* ══ 추정재무상태표 ══ 올해 기말에 내년 계획을 얹는다 */
ok('추정재무상태표를 셈한다', src.includes('function bizplanBS(f,yr,fin){')
  && src.includes('var BIZ_BS_ROWS=['));
// 예비비도 «쓸 돈»으로 보아 현금에서 뺀다 — 안 빼면 그만큼 대차가 어긋난다
ok('예비비를 현금에서 뺀다', src.includes('var cash=fin.cash+contrib+interest-pur-adm-spare;'));
// 올해 기말이 없으면 바탕이 없다 — 0 을 바탕으로 삼으면 «올해 재산이 0» 이라 적는 셈이다
ok('확정 결산이 없으면 안 채운다', src.includes('var fin=_bizFinOf();') && src.includes('if(!fin) return;'));
/* 회계 가름은 기금마다 다르다(제출본도 한쪽을 비웠다) — 「계」만 적는다 */
ok('계 칸만 적는다', src.includes('blanks[2].textContent=W(BIZ_BS_ROWS[i][1](P));'));
// 계획이 재원보다 크면 추정 잔액이 음수가 된다 — 조용히 인쇄하면 안 된다
ok('재원이 모자라면 알린다', src.includes('추정 잔액이 음수입니다'));

/* ══ 협의회 위원 명부 ══ 임원 명부에서 측별로 채운다 */
ok('위원 명부를 임원 명부에서 채운다', src.includes('function fillRoster(root,f){')
  && src.includes("if(kind==='reg_roster') fillRoster(d,f);"));
// 「소재지 : ＿＿＿」처럼 라벨과 값이 한 글줄에 붙은 곳은 표 칸 방식으로 못 닿는다
ok('한 글줄짜리 라벨도 채운다', src.includes("el.textContent=m[1]+' : '+v;"));

/* ══ 박혀 있는 «남의 값» 걷어내기 ══
   변환한 원본 .hwp 가 어느 기금이 실제로 낸 서류라, 서식 19종에 금액·날짜가 남아 있었다.
   지급신청서에는 남의 «계좌번호»까지 있었다. 그대로 인쇄하면 남의 숫자를 제출한다. */
ok('남의 값을 걷어낸다', src.includes('function stripBaked(root){')
  && src.includes('function _bakeText(s){') && src.includes('stripBaked(d);'));
// 걷어내기가 «가장 먼저» 돌아야, 걷어낸 자리가 곧 채울 자리가 된다
ok('걷어낸 뒤에 채운다', /stripBaked\(d\);[\s\S]{0,200}?fillCommittee\(d,f\);/.test(src));
/* ⚠ 다 지우면 서식이 망가진다 — 이것들은 «서식의 일부»다 */
ok('법령 개정일은 남긴다', src.includes("return /개정|시행|신설|제정|전문개정/.test(pre) ? m : pre+BAKE_BLANK;"));
/* 구간(미만·이상)은 «윗줄», 금액은 «아랫줄»에 따로 있는 요율표가 있다 —
   제도도입 비용 청구내역서의 수당 200·300·400·470만원이 통째로 지워지던 것. */
ok('윗줄이 구간이면 아랫줄 요율도 남긴다', src.includes('function _isRateRow(tr){')
  && src.includes("if(SPAN.test(up.textContent||'')){ near=true; break; }")
  && src.includes("if(_isRateRow(tr)) tr.setAttribute('data-rate','1');"));
/* 「미만·이상」이라는 «낱말»만 보면 안 된다 — 지원신청서의 「둘 이상의 기업이 …출연」 때문에
   그 아래 금액 줄이 요율표로 보여, 남의 금액 10,000,000원이 걷어내기를 통째로 비껴갔다.
   구간은 «금액 뒤에» 붙는다 — 앞에 숫자가 있어야 구간으로 본다. */
ok('구간은 «금액 뒤»의 미만·이상만 본다',
  src.includes('var SPAN=/[0-9][0-9,\\s]*(?:만원|천원|원)?\\s*(?:미만|이상)/;'));
/* 다만 스스로 적는 줄(청구액)과, 저 아래 남의 실적은 그대로 비워야 한다 */
ok('요율표 안에서도 청구·신청 줄은 비운다', src.includes("!/청구|신청|지급|수령|합계|^계$/.test(lbl)"));
ok('요율 남기기는 «바로 위 두 줄»만 본다', src.includes('for(var k=0;k<2&&up;k++,up=up.previousElementSibling)'));
ok('요율 구간은 남긴다', src.includes('if(cmp) return m;') && src.includes('미만|이상'));
ok('용지 규격은 남긴다', src.includes('㎜|㎡|g') && src.includes('// 용지 규격'));
/* 사업계획서는 쉼표 없는 예산 수치(56·560)가 칸마다 흩어져 있어, 글자 걷어내기만으로는
   남의 예산이 그대로 남는다. 칸 안에 여러 줄이 든 곳이 있어 «글자 마디»마다 본다. */
ok('숫자만 든 마디도 지운다', src.includes("if(BARE.test(s)) n.nodeValue='';")
  && src.includes('if(n.nodeType===3) kids.push(n);'));
// 줄의 첫 칸은 연번이다 — 지우면 표가 무너진다
ok('연번은 안 건드린다', src.includes('if(ci===0) return;'));

/* ══ 지원신청서(별지 제1호의2) ══ */
/* 적는 자리가 «비어» 있지 않은 서식이 있다 — 지원신청서는 ＿＿＿＿ 로 줄을 그어 둔다.
   빈 칸만 찾으면 그런 자리는 영영 안 채워지고, 값이 라벨 칸에 잘못 붙는다. */
ok('밑줄 자리표시를 빈 칸으로 본다', src.includes('function _isBlankCell(t){')
  && src.includes('if(nx && _isBlankCell(nx.textContent)){ nx.textContent=v; }'));
/* 옆 칸에 이미 값이 있으면 손대면 안 된다 — 원본이 {{FUND}} 로 채워 둔 칸에
   또 적어서 기금 이름이 두 번 찍혔다 */
ok('이미 값이 든 칸은 안 건드린다', src.includes('function _isLabelCell(t){')
  && src.includes('else if(!nx || _isLabelCell(nx.textContent)){'));
ok('지원신청서를 따로 채운다', src.includes('function fillSubsidyDoc(root,f){')
  && src.includes("if(kind==='subsidy') fillSubsidyDoc(d,f);"));
/* ⚠ 이 변환본에는 «남의 실제 값»이 박혀 있었다(금액 10,000,000원·신청일 2020-05-13·
   복지사업 종류 체크). 그대로 인쇄하면 남의 숫자를 제출한다. */
ok('박힌 남의 금액을 걷어낸다',
  src.includes('td.textContent=/지원신청/.test(lab) ? won(su.request_amount)'));
ok('박힌 남의 날짜를 오늘로',
  src.includes("td.textContent=n.getFullYear()+'년 '+(n.getMonth()+1)+'월 '+n.getDate()+'일';"));
/* 복지사업 종류·지원받은 사실은 기금마다 다르다. 「둘 이상의 기업이 공동근로복지기금에
   출연」은 공동기금이면 늘 그러하므로 그대로 둔다. */
ok('기금마다 다른 체크를 지운다', src.includes("공동근로복지기금에") && src.includes("t0.indexOf('■')")
  && src.includes("td.innerHTML=td.innerHTML.replace(/■/g,'□');"));
ok('서명란에 이름을 넣는다', src.includes("td.textContent=nm+' (서명 또는 인)'"));
/* 지원신청서에는 신청인 말고도 «대기업·도급업체»와 «수급업체» 칸이 있다 —
   안 걸면 그 칸에 기금 주소·전화가 들어간다. */
ok('소재지·전화에 칸이 걸려 있다',
  src.includes("return f.address;}, /신청인|기금법인|^$/]") && src.includes("return f.phone;}, /신청인/]"));

/* ══ 서식 단추는 «그 서식으로» 가야 한다 ══
   갈 곳을 «누른 서식»이 아니라 «화면의 단계»(S.dbPhase)로 정하고 있었다.
   그래서 지원금 제출서류의 [서식]을 눌러도 ①인가가 열려, 거기서 다시 찾아야 했다. */
ok('서식이 사는 단계를 목록에서 찾는다', src.includes('var DOC_PHASE=[')
  && src.includes('function phaseOfDoc(kind,prefer){')
  && /S\.formPhase=phaseOfDoc\(kind,prefer\)/.test(src));
// 한 서식을 여러 단계에 «일부러» 두기도 한다 — 그때는 있던 자리에서 열려야 한다
ok('있던 자리를 먼저 본다', src.includes('if(prefer&&hit.indexOf(prefer)>=0) return prefer;'));
/* 2026-09-06: 제출서류는 이제 «화면을 안 떠난다» — 오른쪽 판에서 바로 채운다.
   전에는 서식 자료실로 옮기면서 «있던 자리(subsidy)»를 넘겨 줘야 했다.
   옮기지 않으니 넘겨 줄 자리도 없다 — 지킬 뜻은 «딴 화면으로 안 나간다»가 됐다.
   오른쪽 판이 정말 뜨는지는 check_subside.js 가 본다. */
ok('제출서류에서 딴 화면으로 안 나간다',
  src.includes('onclick="subDocForm(') && /function subDocForm\(kind\)\{/.test(src));
{
  /* 지원금 제출서류의 서식은 모두 ⑤지원금 목록에 있어야 한다 —
     없으면 눌렀을 때 딴 단계가 열려 «다시 찾는» 그 일이 되풀이된다. */
  const g = n => { const i = src.indexOf('var ' + n + '='); let d = 0;
    for (let k = src.indexOf('=', i); k < src.length; k++) { const c = src[k];
      if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (!d) return src.slice(i, src.indexOf(';', k) + 1); } } };
  // 간접 eval 은 전역에서 돈다 — 값을 «돌려받아» 쓴다(바깥 지역변수는 안 보인다)
  const SUB = (0, eval)(g('DOC_SUB') + ';DOC_SUB');
  const REQ = (0, eval)(g('SUB_REQ_DOCS') + ';SUB_REQ_DOCS');
  const inSub = new Set(SUB.map(d => d[0]));
  const miss = REQ.filter(d => d.form && !inSub.has(d.form)).map(d => d.n);
  ok('지원금 제출서류의 서식이 모두 ⑤지원금에 있다' + (miss.length ? ' — ' + miss.join(', ') : ''),
    miss.length === 0);
}
/* 자동분개는 «위에서부터 첫 번째로 맞는 규칙»을 쓴다.
   그래서 앞선 규칙이 이미 채가는 낱말을 뒤에 또 적으면 그 낱말은 한 번도 안 닿는다.
   적어 둔 사람은 닿는 줄 알고, 주석도 그렇게 적힌다 — 실제로 둘이 그랬다
   (근로복지시설비 «체육관» ← 체육문화비 «체육», 기타복지비 «명절선물» ← 기념품비 «명절선물»).
   여기서 다시 생기지 못하게 막는다. */
{
  const i0 = src.indexOf('var ACCT_RULES=['), i1 = src.indexOf('];', i0);
  const blk = src.slice(i0, i1);
  const rules = [...blk.matchAll(/\{kw:\[([^\]]*)\],dir:'([^']+)',d:'([^']+)'/g)]
    .map(m => ({ kw: m[1].split(',').map(x => x.replace(/'/g, '').trim()).filter(Boolean),
                 dir: m[2], d: m[3] }));
  ok('자동분개 규칙을 읽었다', rules.length >= 15);
  const dead = [];
  ['출금', '입금'].forEach(dir => {
    const o = rules.filter(r => r.dir === dir);
    o.forEach((r, i) => r.kw.forEach(k => {
      for (let j = 0; j < i; j++) {
        const h = o[j].kw.find(p => k.includes(p));
        if (h) { dead.push(r.d + ' «' + k + '» ← ' + o[j].d + ' «' + h + '»'); return; }
      }
    }));
  });
  ok('닿을 수 없는 낱말이 없다' + (dead.length ? ' — ' + dead.join(' · ') : ''), dead.length === 0);
}
/* 수선·보수는 목적사업비(근로복지시설비)다 — 일반관리비가 아니다.
   실무에 반대 사례가 있어(R공동 2020: 수선비 5,060,000 을 일반관리비로 제출)
   누가 «고쳐» 놓기 쉽다. 대표 판단 2026-08-26 으로 여기 못 박는다. */
{
  const rule = (src.match(/\{kw:\[[^\]]*'보수'[^\]]*\][^}]*\}/) || [''])[0];
  ok('수선·보수가 근로복지시설비로 간다', /'수선'/.test(rule) && /d:'근로복지시설비'/.test(rule));
  ok('수선비가 일반관리비에 없다',
    !/var ADMIN_ACCTS=\[[^\]]*수선/.test(src) && !/\{kw:\[[^\]]*'수선'[^\]]*\][^}]*d:'(지급수수료|사무용품비|기타관리비|세금과공과)'/.test(src));
  // 근로복지시설비는 목적사업비 목록에 있어야 «2.고유목적사업비용» 줄로 간다
  ok('근로복지시설비가 목적사업비다', /var PURPOSE_ACCTS=\[[^\]]*'근로복지시설비'/.test(src));
}
ok('세금과공과를 관리비로 집계', /var ADMIN_ACCTS=\[[^\]]*'세금과공과'/.test(src));
/* 일반관리비 목록이 세 벌이었다 — 계정을 하나 더하면 사업이익과 명세가 조용히 어긋났다.
   한 곳에 두고 손익계산서·수입지출명세서·computeFin 이 함께 본다. */
ok('일반관리비 목록이 한 벌', src.includes('  _sub(ADMIN_ACCTS);')
  && src.includes("accts:ADMIN_ACCTS.concat(['법인세등'])")
  && src.includes('  var ADMIN=ADMIN_ACCTS;')
  && (src.match(/'지급수수료','사무용품비','기타관리비','세금과공과'/g)||[]).length===1);
{
  const pa = (src.match(/var PURPOSE_ACCTS=\[(.*?)\];/) || [])[1] || '';
  const wc = (src.match(/var WELF_CATS=\[(.*?)\];/) || [])[1] || '';
  const P = pa.split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const W = wc.split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const miss = P.filter(x => !W.includes(x));
  const extra = W.filter(x => !P.includes(x) && x !== '대부사업');
  // 목적사업비 계정과 목적사업 분류는 1:1이어야 한다 — 어긋나면 지출은 잡히는데 수혜자 수를 넣을 칸이 없다
  ok('목적사업비 계정 ↔ 목적사업 분류 1:1', miss.length === 0 && extra.length === 0,
    '계정만: ' + miss.join(',') + ' / 분류만: ' + extra.join(','));
}
ok('별지15호 66번에 격려금 매핑', /\[66,'그 밖의 복지비',\['격려금'/.test(src));
// 69.잔액 = 재원(㉟) − 복지사업비 소계 − 운영비. 대부금 항을 넣으면 이월된 해에 부풀고
// 상환이 있는 해에는 줄어든다(상환은 대부금이 현금으로 자리만 바꾸는 것이라 잔액을 안 바꾼다).
ok('별지15호 69번 잔액 산식', src.includes('var rest=src.total-(subAmt+admin);'));
ok('별지15호 69번 잔액에 대부금 항이 없다', !src.includes('(run.loan+src.total)-(subAmt+loanAmt+admin)'));
// ㉙은 이자·잡수익만(준비금 환입 제외), ㉚은 그 해 준비금2 설정액, ㉞는 전기말 자산총계
ok('별지15호 ㉙ 기금운용 수익금은 사업수익만', src.includes('src={income:fin.bizRev,')
  && src.includes("if(n!=='고유목적사업준비금환입') bizRev+=-s;"));
/* ㉚는 ⑰ 중에서도 «그 해 현금으로 들어온 출연금»까지다.
   ⑱ 분할을 넣으면 딴 기금에 넘어간 몫이, 상한이 없으면 쌓아 둔 기본재산에서 꺼낸 몫이
   재원에 섞인다. 뒤엣것은 ㉞ 이월금(전기말 자산총계)에 이미 들어 있어 두 번 세게 된다. */
ok('별지15호 ㉚는 그 해 현금출연 한도 안의 ⑰', src.includes('):Math.min(bf.use,cashIn),')
  && src.includes('var cashIn=_contribOf(arr);'));
ok('별지15호 ㉚에 ⑱ 분할이 섞이지 않는다', !src.includes('(num(rep.src_contrib)||0):bfDec,'));
ok('별지15호 ㉚에 상한이 있다', !/\):bf\.use,/.test(src));
/* 확정 스냅샷에 별지15호 재원·잔액을 담는다 — 산식이 나중에 고쳐져도 «낸 값»이 남는다.
   담아 두지 않으면 이미 제출한 해를 다시 인쇄할 때 숫자가 달라져도 알 수 없다. */
['f15_src_income', 'f15_src_contrib', 'f15_src_carry', 'f15_src_total',
 'f15_sub_amt', 'f15_admin', 'f15_rest', 'f15_total'].forEach(function (k) {
  ok('확정 스냅샷에 ' + k, new RegExp(k + ':\\s*R\\.').test(src));
});
ok('확정한 해가 달라지면 화면이 알린다', src.includes('function f15Drift')
  && src.includes('var dr=f15Drift(R);') && src.includes('확정한 때와 숫자가 달라졌습니다'));
// 예전에 확정한 해에는 이 칸들이 없다 — 없으면 «모른다»가 맞고 헛경보를 내면 안 된다
ok('예전 스냅샷에는 헛경보를 안 낸다', src.includes('if(!_isLocked()||!snap||snap.f15_rest==null) return [];'));
// 잔액이 0 으로 확정된 해도 있다 — falsy 로 보면 그 해를 통째로 못 본다
ok('잔액 0 으로 확정된 해를 삼키지 않는다', !/snap\.f15_rest\)\s*return \[\]/.test(src)
  && !src.includes('!snap.f15_rest) return []'));
// ㉛·㉜·㉝ 는 사람이 적는 칸이라 이월금 안의 돈을 다시 적을 수 있다 — 앱이 고치지 않고 알린다
ok('별지15호 재원이 그 해 있던 돈을 넘으면 붙잡는다',
  src.includes('var srcCap=_openAssets(op)+cashIn+fin.bizRev;')
  && src.includes('var srcOver=Math.max(0,src.total-srcCap);')
  && src.includes("+(R.srcOver>0?'<tr>") && src.includes('그 해 있던 돈보다'));
// 잔액이 음수 = 재원보다 많이 썼다 = 기본재산을 헐어 썼다. 대부사업 말고는 못 하는 일이라 붙잡는다
// R.rest<0 는 숫자를 빨갛게 하는 자리에도 있다 — 경고 줄만 떼어내도 통과하지 않게 여는 <tr> 까지 본다
ok('별지15호 잔액이 음수면 화면이 붙잡는다',
  src.includes("+(R.rest<0?'<tr>") && src.includes('잔액이 음수입니다'));
ok('별지15호 음수 잔액은 숫자도 빨갛게', src.includes("+(R.rest<0?';color:var(--danger)"));
// ㉚·㉞ 는 비워 두면 자동. 수기 칸이 화면에 있어야 협의회가 다르게 정한 해를 적을 수 있다
ok('별지15호 ㉚·㉞ 수기 입력칸이 화면에 있다',
  // 이름만 있고 화면 문자열에 이어 붙지 않으면 칸이 안 보인다 — 앞의 '+' 까지 본다
  src.includes("+ip('src_contrib',") && src.includes("+ip('src_carry',"));
// 재원 칸은 원 단위로 더해진다 — 라벨이 '천원'이면 1000배 틀리게 적힌다
['src_cap_excess', 'src_basic_range', 'src_support', 'src_carry', 'src_contrib'].forEach(function (k) {
  var i = src.indexOf("ip('" + k + "'");
  ok('별지15호 ' + k + ' 라벨 단위는 원', i > 0 && !/\(천원\)/.test(src.slice(i, i + 90)));
});
ok('별지15호 ㉞ 이월금은 전기말 자산총계', src.includes('function _openAssets')
  && src.includes('(num(rep.src_carry)||0):_openAssets(op)'));
// 준비금 전입액은 사업외비용이라 68번 '기금 운영비'에 넣으면 안 된다
ok('별지15호 68번에서 준비금 전입액 제외', src.includes('var admin=fin.admin+fin.otherExp-(fin.resvExp||0);')
  && src.includes("if(n==='고유목적사업준비금전입액') resvExp+=s;"));
ok('별지15호 70번 합계는 소계+대부+운영비+잔액', src.includes('total:subAmt+loanAmt+admin+rest,'));
/* 수혜자수는 통장으로 검산할 수 없다 — 목적사업 탭에 적었는데 어느 항목에도 안 실리면
   (분류를 안 골랐거나 서식에 없는 이름) 소계에서 조용히 빠지고, 그 소계가 제출본에 들어간다. */
ok('어느 항목에도 안 실리는 수혜자를 센다', src.includes('var benefLost=0, benefLostCats=[];')
  && src.includes("benefLost+=benef[c]; benefLostCats.push((c||'(분류 없음)')+' '+benef[c]+'명');"));
ok('못 실은 수혜자를 화면이 붙잡는다', src.includes("+(R.benefLost>0?'<tr>")
  && src.includes('어느 항목에도 실리지 않았습니다'));
/* 대부 실행액은 별지15호가 목적사업 탭에서, 재무제표가 장부에서 가져온다 —
   어긋나면 두 서류가 서로 다른 말을 한다(실제 제출본 사례 있음). */
ok('대부 실행액을 장부와 맞대 본다', src.includes("var loanBook=Math.round((mv['근로자대부금']||{}).d||0);")
  && src.includes('var loanMismatch=(loanAmt>0||loanBook>0)&&Math.round(loanAmt)!==loanBook;'));
ok('대부 실행액 어긋남을 화면이 붙잡는다', src.includes("+(R.loanMismatch?'<tr>")
  && src.includes('대부 실행액이 장부와 다릅니다'));
ok('통장 파서가 거래상대방 열을 읽음', /보낸분\|받는분\|상대계좌\|입금자\|송금인\|거래처\|업체/.test(src));
/* 사람이 적은 지출대장은 «입금» 칸이 아예 없다 — 입·출 두 칸을 모두 요구하면 파일 전체가
   null 로 떨어져 화면에는 「읽을 수 없는 파일」만 뜬다. 일자·적요까지 있을 때만 인정한다. */
ok('한쪽 칸만 있는 장부도 읽는다',
  src.includes("if((col.dep!=null||col.wd!=null)&&col.date!=null&&col.memo!=null){ hi=i3; break; }"));
/* 엑셀 셀 서식이 yy-mm-dd 이면 '24-01-03' 그대로 온다 — 못 읽으면 일자가 그 꼴로 남아
   연도 거르기·중복검사 열쇠·분개장 정렬이 모두 어긋난다. 달이 12를 넘으면 넘겨짚지 않는다. */
ok('두 자리 연도 날짜를 읽는다', src.includes("m=t.match(/^(\\d{2})[-.](\\d{1,2})[-.](\\d{1,2})$/);")
  && src.includes('if(m&&+m[2]>=1&&+m[2]<=12&&+m[3]>=1&&+m[3]<=31)'));
// 통장을 못 받고 손으로 적은 지출대장만 오는 기금이 있다(D공동 2024: 56건)
ok('머리글의 공백을 지우고 맞춤', src.includes("var v=String(cells[c]||'').replace(/\\s+/g,'');"));
ok('대장 머리글(세부내역) 인식', src.includes('/적요|내용|내역|의뢰인|기재|가맹점/.test(v)'));
// 적요가 'BZ뱅크'처럼 수단만 적힌 통장이 있다 — 실제 상대방이 든 설명 열을 버리면 출연금을 못 잡는다
ok('남는 설명 열을 성격 힌트로 모음', src.includes('if(col.memo==null)col.memo=c; else if(col.kind.indexOf(c)<0)col.kind.push(c); }'));
ok('예금주명 열도 힌트(계좌번호는 제외)', src.includes('/구분|종류|기록사항|메모|비고|예금주|입금인/.test(v)&&!/계좌번호|통화|화폐/.test(v)'));
ok('사업장명 대조에 힌트 포함', src.includes("var mzz=strip(m+' '+String(kind||''));"));
// 은행이 상대방 이름을 잘라 적는다 — 잘린 쪽이 사업장명의 앞부분이면 같은 회사로 본다
ok('전각 괄호도 지움', src.includes('（주）|（유）|주식회사|유한회사'));
ok('잘려 적힌 회사명도 인식', src.includes('if(nm.indexOf(toks[q])===0)')
  && src.includes("var toks=all.filter(function(t){ return t.length>=4; });"));
/* 사업장명이 **더 긴 낱말의 앞부분**일 때는 그 사업장이 아니다.
   붙여 놓은 글자열에서 찾기만 하던 때는 「에이이피렌탈 환불」이 '(주)에이이피' 로,
   「가치평가수수료」가 '가치' 로 잡혔다 — 출연금으로 잘못 잡히면 기본재산이 부풀고
   준비금2 한도·별지15호 ⑬⑳㉚ 가 함께 틀어진다. */
ok('이름 뒤에 한글이 이어지면 다른 낱말로 본다', src.includes('var glued=function(nm){')
  && src.includes('return !(nx&&/[가-힣]/.test(nx));')
  && src.includes('if(nm.length>=4&&glued(nm))'));
// 짧은 상호도 «토막 하나»로 오면 잡아야 한다 — 아예 못 쓰게 되면 안 된다
ok('토막이 이름과 같으면 길이와 무관하게 잡는다', src.includes("if(all.indexOf(nm)>=0) return {d:'현금성자산',c:'기본재산'};"));
ok('붙여 찾기를 그냥 쓰지 않는다', !src.includes("if(mzz.indexOf(nm)>=0) return {d:'현금성자산',c:'기본재산'};"));
ok('엑셀 미국식 m/d/yy 인식', src.includes("m=t.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2})$/);"));
ok('빈 일자는 위 일자를 이음', src.includes("if(/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) lastDate=date; else if(!date) date=lastDate;"));

// ── ⑨ 준비금 자동 조정 (결산 확정 시, 양방향) ──
// 비용>수익이면 환입(A공동 2025), 수익>비용이면 전입(C공동 2022). 한쪽만 처리하면 순이익이 0이 안 된다.
ok('reserveAdjust 존재', src.includes('function reserveAdjust'));
ok('조정 분개 생성기 존재', src.includes('function _reserveEntry'));
ok('환입·전입 양방향', /r\.kind='환입'/.test(src) && /r\.kind='전입'/.test(src));
// 준비금2를 만드는 분개가 없으면 출연금을 그 해에 쓰는 공동기금은 순이익 0을 만들 수 없다
ok('당기 출연금 집계', src.includes('function _contribOf'));
// 증권·부동산 현물출연을 한도에 넣으면 기본재산이 붕괴한다(B공동 2022: 증권 72.6억 현물출연)
ok('한도 기준은 현금 출연금만', src.includes('if(x.nocash) return;                                  // 현물출연·대체분개는 제외')
  && src.includes("if(!amt&&(x.debit==='현금성자산'||x.debit==='정기예금')) amt=num(x.amount)||0;"));
ok('사용한도 비율(공동 90/사내 50)', /function _reserveRate\(fid\)\{ return \(\(funds\[fid\]\|\|\{\}\)\.fund_type==='사내'\)\?0\.5:0\.9; \}/.test(src));
ok('준비금2 설정 분개(기본재산 차변)', /if\(kind==='설정'\)/.test(src) && /debit:'기본재산', credit:acct/.test(src));
// 기본재산은 대부사업에만 쓸 수 있다 — 복지사업에는 사용한도를 넘겨 쓸 수 없으므로
// 모자라는 만큼은 손실금으로 남아 다음 회계연도로 이월된다(근로복지공단 실무 6.2)
ok('기본재산 초과 사용을 하지 않음', !/기본재산사용/.test(src)
  && src.includes('r.deficit=Math.max(0,r.need-r.amount);'));
ok('재원 부족을 확정 창에서 알림', src.includes('if(rc.deficit>0) msg+=')
  && src.includes('기본재산은 대부사업에만 쓸 수 있어'));
// 재무제표에 음수를 쓰지 않는다 — 손실은 '이월결손금'으로 이름을 바꿔 양수로 적는다
ok('결손금 표시 헬퍼', src.includes('function _retLabel') && src.includes('function _retVal')
  && src.includes("return (num(v)||0)<0?'이월결손금':'이월잉여금';"));
ok('재무상태표·결산서·별지·전기대비에 결손금 적용',
  (src.match(/_retLabel\(/g)||[]).length>=4 && (src.match(/_retVal\(/g)||[]).length>=1);
// 전기이월 칸을 늘릴 때 재무제표 집계에서 빠지는 일이 있었다(자산 1억 사라짐) → OPEN_ACCT에서 파생
ok('재무제표가 전기이월을 OPEN_ACCT에서 파생', src.includes('var _opDone={cash:1,savings:1,loan:1,secu:1,basic:1,retained:1,reserve:1,reserve2:1};')
  && src.includes('otherAsset+=opAssetEtc; liab+=opLiabEtc; otherEquity+=opEquityEtc;'));
// 환입은 준비금 차변이라 당기 발생분만 보면 전기이월로 덮인 정상 결산도 음수로 보인다
ok('음수 검사가 전기이월 준비금을 봄', src.includes("var b=Math.round((v?(v.credit-v.debit):0)+(num(i===0?op.reserve:op.reserve2)||0));"));
ok('음수 항목 검사와 경고', src.includes('function finNegatives')
  && src.includes('⚠️ 음수 항목 ') && src.includes('⚠️ 재무제표에 음수 항목이 있습니다'));
// 실무 결산서는 사용한도 전액을 설정하고 쓰지 않은 잔액을 준비금2로 남긴다
// (K공동 2024·E공동 2024 모두 출연금 × 90% 전액)
// 법은 한도를 '범위'로 정한다 — 그 안에서 얼마를 설정할지는 협의회 결정 사항이다
// (F공동 2024는 한도 929,554,369원 중 412,000,000원만 설정했다)
// 설정은 순이익 방향과 무관하다 — 전입하는 해에도 그 해 출연금의 사용한도만큼 재원을 만든다
// (C공동 2022: 전입 3,249원인 해에 설정 63,003,960원. 환입 분기에만 두면 기본재산이 6,300만원 어긋난다)
ok('설정은 순이익 방향과 무관', src.includes('var want=r.setupManual?_man:Math.max(0,cap);')
  && src.includes('if(want>0){ r.setup=want;')
  && src.includes('if(want>0){ r.setup=want;'));
ok('설정액은 협의회 지정값 우선, 비우면 한도 전액',
  src.includes('var want=r.setupManual?_man:Math.max(0,cap);')
  && src.includes("var _man=num(((funds[fid]||{}).years||{})[yr]&&((funds[fid]||{}).years||{})[yr].reserve_setup);")
  && src.includes("r.setupManual=(_man!==''&&_man>=0);"));
ok('설정액 입력칸과 저장', src.includes("<input id=\"op-rsvset\"")
  && src.includes("up['funds/'+_fid+'/years/'+_yr+'/reserve_setup']=(rsv===''?null:(num(rsv)||0));")
  && src.includes('function _rsvSetOf'));
ok('환입을 계정별 잔액 안에서 배분', src.includes('r.parts.push({acct:a,amount:take})'));
ok('조정 분개 묶음 생성기', src.includes('function _reserveEntries'));
/* 설정은 기본재산을 준비금2로 **옮기는** 일이라 있는 것보다 많이 옮길 수 없다.
   설정액 칸에 0 하나만 더 적어도 기본재산이 −8.99억이 되어 재무상태표·별지15호 ⑳·
   재산변동상황보고서가 통째로 어긋난다(재무제표에 음수가 나오면 안 된다).
   조용히 줄이지 않고 «얼마를 못 옮겼는지»를 확정할 때 알린다. */
ok('설정액은 기본재산 잔액까지만', src.includes('var _bfAvail=Math.max(0,Math.round(fin.basic));')
  && src.includes('if(want>_bfAvail){ r.setupCut=want-_bfAvail; want=_bfAvail; }'));
ok('못 옮긴 설정액을 남긴다', src.includes('r.setupWant=want; r.setupCut=0;'));
ok('확정할 때 잘라 낸 설정액을 알린다', src.includes('if(rc.setupCut>0)')
  && src.includes('설정하지 못했습니다'));
// 자동조정 꺼짐 갈래도 같은 칸을 지녀야 화면이 갈라지지 않는다
ok('자동조정 꺼짐 갈래도 setupWant·setupCut 을 지닌다', src.includes('setupWant:0, setupCut:0,'));
/* ══ 준비금 1·2 번호는 공식 서식이 정해 둔 것 ══
   근로복지공단 「설립인가신청서 양식」 2.사업계획서 각주:
     * 고유목적사업준비금1은 법인세법 제29조에 의한 준비금임(이자)
     * 고유목적사업준비금2는 근로복지기본법 제62조2항에 의한 준비금임(이월)
   확정 제출본 11건도 모두 이 배치이고, 손에 있는 결산서 어디에도 반대는 없었다.
   reserve_swap 은 «기금마다 다르다»가 아니라, **과거 제출본이 서식과 반대로 적혀 있어**
   전기 대비를 맞추려 재현해야 할 때만 쓰는 예외 장치다.
   환입/전입은 «잔액이 있는 쪽»을 골라 따라갔지만
   **이자 왕복은 언제나 준비금1, 설정은 언제나 준비금2** 로 못 박혀 있어,
   반대로 쓰는 기금에서는 이월분과 설정분이 두 계정으로 갈려 재무상태표 두 줄이 다 어긋났다. */
ok('준비금 배치를 기금별로 정한다', src.includes('function _rsvSwapOf(fid){ return !!((funds[fid]||{}).reserve_swap); }')
  && src.includes('function _rsvRoles(fid){')
  && src.includes('return { interest:RESERVE_ACCTS[sw?1:0], carry:RESERVE_ACCTS[sw?0:1] };'));
ok('자동 분개가 배치를 따른다',
  src.includes('var out=[], R1=rc.acctInterest||RESERVE_ACCTS[0], R2=rc.acctCarry||RESERVE_ACCTS[1];'));
ok('조정 결과가 배치를 담는다', src.includes('acctInterest:_roles.interest, acctCarry:_roles.carry, swap:_rsvSwapOf(fid),'));
// 적요에 번호를 박아 두면 배치를 바꾼 기금에서 «준비금2 설정»이라 적히고 준비금1로 간다
ok('설정 적요가 실제 계정 이름을 쓴다', src.includes("memo:acct+' 설정(출연금 사용한도 내)'")
  && !src.includes("memo:'고유목적사업준비금2 설정(출연금 사용한도 내)'"));
ok('배치를 화면에서 고를 수 있다', src.includes('id="op-rsvswap"')
  && src.includes("up['funds/'+_fid+'/reserve_swap']=(rwOn?true:null);"));
// 배치는 «기금» 단위다 — 세무대리인 방식이 해마다 바뀌지 않는다
ok('배치는 연도가 아니라 기금 단위로 저장', !src.includes("years/'+_yr+'/reserve_swap"));
/* ══ 분할 조각의 금액 ══
   expandSplits 는 조각 2번째부터 nocash:1 을 붙인다 — 뜻은 «통장 금액은 첫 조각에 있다»인데,
   출연금·이자를 세는 쪽이 그것을 «현금이 안 오간 현물출연»으로 읽어 통째로 버렸다.
   반대로 첫 조각은 deposit 이 통장 한 줄 전체라 다른 조각 몫까지 딸려 왔다.
   («출연금 5천만 + 이자 1천원» 한 줄에서 출연금이 50,001,000 으로 세졌고, 순서를 바꾸면 0 이 됐다.)
   이 값은 준비금2 설정 한도와 별지15호 ㉚ 상한에 그대로 쓰여 돈에 직접 닿는다. */
ok('조각임을 따로 표시한다', src.includes('o._split=1; o._nocashSrc=x.nocash?1:0;'));
ok('출연금은 조각의 amount 를 쓴다', src.includes("if(x._split){ if(!x._nocashSrc) s+=num(x.amount)||0; return; }"));
ok('현금 이자도 조각의 amount 를 쓴다', src.includes("if(x._split){ if(!x._nocashSrc) itc+=num(x.amount)||0; return; }"));
// 현물출연을 쪼갠 조각은 여전히 «현금 아님» — 원래 줄의 nocash 를 조각이 물려받아 가른다
ok('현물출연 조각은 현금 출연금에서 빠진다', src.includes('_nocashSrc'));
/* 현금이 안 오간 줄은 쪼개지 않는다 — 방향을 알 수 없어 고정 쪽을 credit 으로 잡으면
   차·대변이 같아져 금액이 통째로 사라진다(현물출연 72.6억 → 기본재산 0). */
ok('현금 없는 줄은 쪼개지 않는다',
  src.includes("if(!((num(x.deposit)||0)+(num(x.withdraw)||0))){ out.push(x); return; }"));
ok('쪼개는 창도 금액 0을 막는다', src.includes("if(!total){ toast('금액이 없는 거래는 쪼갤 수 없습니다','warn'); return; }"));
// 0원 조각은 아예 조각이 되지 않는다 — 이 걸러내기가 없으면 빈 줄이 분개로 들어간다
ok('조각은 계정과 금액이 있어야 조각이다',
  src.includes("return s&&s.acct&&(num(s.amount)||0)>0; });"));
// 검증한 열한 기금 모두 준비금1(법인세법 제29조)을 '현금 이자수익만큼 전입 후 환입'으로 적었다
// 순이익·대차에는 영향이 없지만 손익계산서의 사업외수익·비용에 나타나야 제출본과 맞는다
ok('준비금1 전입액을 이자수익만큼 자동 생성',
  src.includes("if(!x.approved||x.credit!=='이자수익') return;")
  && src.includes('interestCash:Math.round(itc)')
  && src.includes("out.push({id:'rsv1set'+yr, e:_reserveEntry(yr,'전입',it,R1)});")
  && src.includes("out.push({id:'rsv1in'+yr, e:_reserveEntry(yr,'환입',it,R1)});"));
ok('전입액 계정(사업외비용)', src.includes("'고유목적사업준비금전입액':'비용'"));
ok('잔액 있는 준비금 계정을 고름', src.includes('function _reserveAcct'));
ok('환입은 준비금 재원 상한', src.includes('r.amount=Math.max(0,Math.min(r.need,avail));'));
ok('조정 분개는 대체분개(nocash)', /nocash:1/.test(src));
// 대체분개는 현금이 아니므로 amount로 금액을 읽어야 한다 — 안 읽으면 금액 0으로 무시된다
ok('journalOf가 amount를 읽음', src.includes('amount:num(x.amount)||num(x.deposit)'));
ok('computeFin이 amount를 읽음', src.includes('var amt=num(x.amount)||num(x.deposit)'));
ok('결산 확정이 조정을 자동 기록', src.includes('var rc=reserveAdjust(arr,fid,yr)'));
// 분개와 확정이 따로 저장되면 하나만 성공했을 때 장부가 어긋난다 → 한 번의 update로
ok('조정 분개와 확정을 한 번에 저장', /up\['txns\/'\+fid\+'\/'\+yr\+'\/'\+id\]=e;/.test(src)
  && /up\['closing\/'\+fid\+'\/'\+yr\+'\/locked'\]=true;/.test(src)
  && src.includes('var ents=_reserveEntries(yr,rc);'));
ok('거래 목록에 대체분개 표시', src.includes('x.nocash&&num(x.amount)'));

// ── ⑨-2 통장 여러 시트 ──
// 은행이 월별 시트로 나눠 주면 첫 시트만 읽고 나머지 달을 통째로 잃는다(C공동 2022: 2,007,649원 누락)
ok('전 시트를 합쳐 읽음', src.includes('txns=(txns||[]).concat(got)'));
ok('시트가 겹치면 잔액까지 같은 것만 중복 제거', src.includes("+'|'+x.balance"));
ok('여러 시트면 확인창에 내역 표시', src.includes('sheets.length>1'));
// ── ⑩ 계좌 간 이체 자동매칭 ──
ok('통장 파서가 계좌번호를 읽음', /계좌\\s\*번호/.test(src) || src.includes('계좌\\s*번호'));
ok('거래에 계좌번호 보존', src.includes("acct:(x.acct||'')"));
ok('findTransfers 존재', src.includes('function findTransfers'));
ok('applyTransfers 존재', src.includes('function applyTransfers'));
ok('이체 자동매칭 버튼', src.includes('onclick="autoMatchTransfers()"'));
// 계좌가 다르면 확실, 계좌번호가 없는 옛 자료는 추정으로 남겨 사람이 확인해야 한다
ok('확실/추정 구분', src.includes("kind='sure'") && src.includes("kind='guess'"));
ok('가져오기 직후 확실한 것만 자동 상계', /findTransfers\(list\)\.filter\(function\(pr\)\{ return pr\.kind==='sure'/.test(src));
// 상계는 현금↔현금 — 재무제표 영향 0이면서 통장 입·출금 합계는 그대로 남아야 한다
ok('상계는 현금성자산 ↔ 현금성자산', /up\[b\+'debit'\]='현금성자산'; up\[b\+'credit'\]='현금성자산';/.test(src));
ok('거래 목록에 이체 칩', src.includes('x.xfer?'));
ok('이미 처리된 이체는 다시 잡지 않음', src.includes('return !x.xfer;'));

// ── ⑪ 분개 학습(거래처 기억) ──
ok('_learnKey 존재', src.includes('function _learnKey'));
ok('학습 저장·조회·삭제', src.includes('function learnAcct') && src.includes('function loadLearned')
  && src.includes('function forgetAcct'));
ok('학습 관리 화면', src.includes('function learnedPanel') && src.includes('onclick="learnedPanel()"'));
// 일반 적요('인터넷출금이체')를 배우면 모든 거래가 그 계정으로 오분류된다
ok('일반 적요는 학습 제외 목록에', /var LEARN_SKIP=\[[^\]]*'인터넷출금이체'/.test(src));
ok('학습이 일반 규칙보다 우선', src.includes("if(lr&&lr.d&&lr.c) return {d:lr.d,c:lr.c,learned:true};"));
// 입금·출금은 성격이 달라 방향별로 따로 기억해야 한다
ok('방향별로 기억(i_/o_)', src.includes("return (isDep?'i_':'o_')+head;"));
ok('승인할 때만 학습', src.includes('learnAcct(x.memo'));
ok('이체 상계는 학습하지 않음', src.includes('!x.xfer&&!_splitsOf(x).length) learnAcct'));
ok('이체 행은 차·대 같아도 승인 가능', src.includes('x.debit===x.credit&&!x.xfer){'));

// ── ⑫ H사내 2025 실결산에서 확인된 것 ──
// 기본재산을 증권으로 운용하는 기금이 있다(26억). 계정·전기이월 칸이 없으면 대차가 그만큼 어긋난다
ok('매도가능증권 계정', src.includes("'매도가능증권':'자산'"));
// 칸만 늘리고 저장 목록을 안 고쳐 매도가능증권 전기이월이 저장되지 않았다 → OPEN_ACCT에서 파생
ok('전기이월 저장 목록을 OPEN_ACCT에서 뽑음',
  src.includes("var o={}; Object.keys(OPEN_ACCT).forEach(function(k){var el=$('op-'+k);"));
// 준비금은 1·2를 갈라 이월해야 한다(C공동 2024는 준비금2로 42,245,952원 이월)
// 세무회계법인이 비영리조직회계기준으로 결산하는 기금이 있다(I공동·J공동)
ok('비영리조직회계기준 계정', src.includes("'미수수익':'자산','미수금':'자산','단기금융상품':'자산','특정현금과예금':'자산'")
  && src.includes("'손실대비특별적립금':'자본'"));
ok('그 계정들의 전기이월 칸', src.includes("accrued:'미수수익',recv:'미수금',stfund:'단기금융상품',spcash:'특정현금과예금'"));
/* 전기이월 칸을 손으로 나열하면 계정을 늘릴 때 빠진다 — 저장은 opening 마디를 통째로 바꿔 쓰므로
   화면에 칸이 없는 열쇠는 **저장할 때 값이 지워진다**. 그리는 쪽도 저장하는 쪽과 같은 표를 쓴다. */
/* 뜻은 「칸을 계정표(OPEN_ACCT)를 돌며 그린다」이다. 격자 모양(grid/gridw)은 자유다 —
   손으로 나열하면 계정을 늘릴 때 칸이 빠지고, 저장이 opening 을 통째로 덮어 이미 든 값이 지워진다. */
ok('전기이월 칸을 계정표에서 뽑아 그린다',
  /<div class="grid\w*"[^>]*>'\+Object\.keys\(OPEN_ACCT\)\.map\(function\(k\)\{/.test(src)
  && src.includes("return oi(k, OPEN_ACCT[k]+(_n?"));
ok('전기이월 칸을 손으로 나열하지 않는다', !/\+oi\('\w+','/.test(src));
ok('저장도 같은 표에서 뽑는다',
  src.includes("Object.keys(OPEN_ACCT).forEach(function(k){var el=$('op-'+k);if(el)o[k]=num(el.value)||0;});"));
// 그런 기금은 당기운영이익이 0이 아니다(I공동 2025: 66,048원) → 자동조정을 끈다
ok('준비금 자동조정 끄기', src.includes('.reserve_auto===false)')
  && src.includes('function _rsvAutoOf')
  && src.includes("up['funds/'+_fid+'/years/'+_yr+'/reserve_auto']=(raOn?null:false);"));
// 번호만으로는 어느 준비금인지 알 수 없다 — 근거 법령을 이름 옆에 붙이고 재무상태표도 두 줄로 나눈다
ok('준비금1·2를 갈라 계산해 내보냄', src.includes('var res1=-sg(RESERVE_ACCTS[0])+(num(opening.reserve)||0);')
  && src.includes('var res2=-sg(RESERVE_ACCTS[1])+(num(opening.reserve2)||0);')
  && src.includes('liab:liab,res1:res1,res2:res2,'));
ok('재무상태표에 근거를 붙여 두 줄로', src.includes('법인세법 §29 · 이자')
  && src.includes('근로복지기본법 §62② · 이월')
  && src.includes("won(f.res1)") && src.includes("won(f.res2)"));
ok('전기이월 준비금1·2 분리', src.includes("reserve:'고유목적사업준비금1',reserve2:'고유목적사업준비금2'")
  && src.includes('liab+=(num(opening.reserve)||0)+(num(opening.reserve2)||0);')
  && src.includes('bal[RESERVE_ACCTS[1]]+=Math.round(num(op.reserve2)||0);'));
// 두 준비금은 이름만으로는 무엇이 담기는지 알기 어렵다 — 칸 옆에 근거를 곁들인다
// 곁말도 배치를 따라야 한다 — 반대로 쓰는 기금에 「1 = 이자」라고 적히면 그대로 잘못 넣는다
ok('준비금 칸의 근거가 배치를 따른다', src.includes('function _openNote(fid){')
  && src.includes("return _rsvSwapOf(fid)?{reserve:B, reserve2:A}:{reserve:A, reserve2:B};")
  && src.includes('var _n=_openNote(S.fundId)[k];'));
ok('전기이월에 매도가능증권 칸', src.includes("secu:'매도가능증권'"));
ok('자산총계에 증권 합산', src.includes('cash+savings+loan+secu'));
// 대부금은 기본재산을 헐어 나간 것이 아니라 그 자체가 자산이다 — 예입에서 빼지 않고 따로 더한다
// (F공동 2024 제출본: ㉑ 674,108천 + ㉗ 239,720천 = ㉘ 913,828천)
ok('별지15호 ㉘ 합계에 대부금을 더함', src.includes('run.total=run.deposit+invested+run.loan;')
  && src.includes('var invested=run.trust+run.secu+run.own+run.reit+run.etc;'));
ok('별지15호 ㉓ 유가증권을 장부에서', src.includes('num(rep.run_secu)||fin.secu'));
ok('복리후생 계정(목적사업비)', src.includes("'복리후생':'비용'"));
// 건강검진·기념품은 결산서마다 별 항목으로 세운다(F공동·K공동·D공동 세 기금)
ok('의료비·기념품비 계정', src.includes("'의료비':'비용','기념품비':'비용'")
  && src.includes("'격려금','복리후생','의료비','기념품비','경조사비',")
  && src.includes("var WELF_CATS=['격려금','복리후생','의료비','기념품비',"));
ok('별지15호 66번에 의료비·기념품비',
  src.includes("[66,'그 밖의 복지비',['격려금','복리후생','의료비','기념품비','경조사비','기타복지비']]"));
ok('건강검진·기념품 자동분개 규칙', src.includes("'건강검진','건강건진','종합검진'")
  && src.includes("'기념품','명절선물','설선물','추석선물','장기근속'"));
ok('잡수익 계정', src.includes("'잡수익':'수익'"));
// 1원·10원은 같은 날 같은 금액이 우연히 겹친다 — 소액을 이체로 자동 상계하면 장부가 틀어진다
ok('이체 자동상계 최소금액', /var XFER_MIN=\d+;/.test(src) && src.includes('amt>=XFER_MIN'));
// 통장을 엑셀로 못 받는 은행이 있다(새마을금고는 PDF만) — 직접 입력이 없으면 회계를 시작조차 못 한다
ok('거래 직접 추가', src.includes('function addTxnForm') && src.includes('function addTxnSave')
  && src.includes('onclick="addTxnForm()"'));
ok('직접 입력 거래 표시', src.includes('x.manual?'));
ok('머리글에 계좌번호가 없으면 파일명에서', src.includes("String(file.name||'').match"));

// ── ⑮ 익년도 추정재무제표 — 제출본은 목적사업회계·기금관리회계·계 세 열로 적는다 ──
// (근로복지공단 실무 6.1 회계 구분. 앱은 '실적 | 추정' 두 열뿐이어서 서식과 달랐다)
ok('추정재무제표에 회계 구분 세 열',
  src.includes("var _cols=['과목',yr+'년 실적(참고)','목적사업회계','기금관리회계','계'];")
  && src.includes("var _sum=function(r){ return {formula:'D'+r+'+E'+r}; };"));
ok('추정재무상태표에 증권·준비금1·2 줄', src.includes("['매도가능증권',fin.secu],")
  && src.includes("['고유목적사업준비금1',fin.res1],['고유목적사업준비금2',fin.res2],"));
ok('회계 구분 기준을 시트에 적어 둠', src.includes('기금관리 회계 = 기본재산·정기예금·매도가능증권·근로자대부금·이자수익')
  && src.includes('목적사업 회계 = 현금및현금성자산·고유목적사업준비금·이월잉여금·목적사업비·일반관리비'));
// 적요가 'BZ뱅크'처럼 수단 이름뿐인 은행은 계좌가 달라도 중복검사 키가 겹친다
// (F공동 2024: 두 계좌를 따로 가져오면 3건 23,934,000원이 버려졌다)
ok('키가 겹치면 계좌·잔액으로 같은 거래인지 확인',
  src.includes("if(String(cur.acct||'')===String(x.acct||'')&&String(cur.balance||'')===String(x.balance||'')){ dup=true; break; }")
  && src.includes("n++; key=hkey(base+'|'+n);"));

// ── ⑭ 분할 분개 (L공동 2024: 송금 100,500 = 생활지원금 100,000 + 이체수수료 500) ──
ok('분할 전개기 존재', src.includes('function expandSplits'));
ok('분할 판정 헬퍼', src.includes('function _splitsOf') && src.includes('function _splitSum')
  && src.includes('function _txnDone'));
// 은행이 준 줄은 하나다 — 첫 조각만 입·출금 금액을 지녀야 통장 잔액 대사가 유지된다
ok('첫 조각만 통장 금액을 지님', src.includes('if(i>0){ o.deposit=0; o.withdraw=0; o.nocash=1; }'));
ok('장부가 전개된 배열을 씀',
  src.includes('return expandSplits(arr).filter(function(x){return x.approved&&x.debit&&x.credit;})')
  && src.includes('var appr=expandSplits(arr).filter(function(x){return x.approved&&x.debit&&x.credit;});')
  && src.includes('var s=0; expandSplits(arr).forEach(function(x){'));
ok('미분류·승인 판정에 분할 반영', src.includes('arr.filter(function(x){return !_txnDone(x);}).length')
  && src.includes('if(x&&!_txnDone(x)){'));
ok('분할은 거래처 학습에서 제외', src.includes('!x.xfer&&!_splitsOf(x).length) learnAcct'));
// 합계가 거래금액과 다르면 저장을 막는다 — 안 막으면 대차가 조용히 어긋난다
ok('조각 합계 불일치는 저장 거부', src.includes('if(sum!==total){'));
ok('쪼개기 화면·해제', src.includes('function splitForm') && src.includes('function splitSave')
  && src.includes('function splitClear'));
ok('목록에 가위 단추', src.includes('onclick=\"splitForm('));

// ── ⑬ 통장 파서·자동분개 (K공동 2024 실결산 검증) ──
// 합계 행: 하나·기업·우리 모두 'No' 다음 칸(= 일자 칸)에 '합   계'를 적는다. 적요만 보면 놓친다.
// (K공동 A통장의 합계 행 한 줄이 거래로 들어와 출금이 119,510,650원 부풀었다)
ok('합계 행을 일자 칸에서도 걸러냄', src.includes("var dcell=col.date!=null?String(row[col.date]||'').trim():'';")
  && /test\(dcell\)\) continue;/.test(src));
ok('일자 칸에 숫자가 없으면 거래 아님', src.includes('if(dcell&&!/\\d/.test(dcell)) continue;'));
// 적요의 띄어쓰기는 제각각인데 키워드는 붙여 써 두었다 — '근로자의 날 기념품'이 새어나갔다
ok('자동분개가 적요 공백을 무시', src.includes("var mz=(m+' '+String(kind||'')).replace(/\\s+/g,'');"));
ok('성과금·성과급 키워드', src.includes("'격려금','격려','포상','상여','성과금','성과급'"));
// 예금이자 원천징수·학교 송금·경기장 예매는 모든 기금 통장에 찍히는데 규칙에 없었다
ok('이자소득 원천징수 세목', src.includes("'세금','공과금','공과','법인세','소득세','원천세'"));
ok('학교·산학협력단 = 장학금', src.includes("'교육비','대학교','대학원','산학협력단','장학재단','사이버대'"));
ok('경기장·예매처 = 체육문화비', src.includes("'야구장','경기장','티켓','공연','콘서트','관람'"));
// 결산·등기 용역비, 시설·비품, 명절선물은 어느 기금에나 나오는데 규칙에 없었다
ok('전문가 용역비 = 지급수수료', src.includes("'노무법인','회계법인','세무법인','법무법인','세무사','법무사','변호사','등기'"));
ok('시설·비품 = 근로복지시설비', src.includes("'공사','설치','보수','수선','비품','냉난방','정수기','사물함','세탁기','청소기','게시판','신발장'"));
/* 「명절선물」은 위 기념품비가 먼저 채가서 여기까지 안 닿는다 — 그래서 뺐다.
   「선물세트」만 여기로 온다. */
ok('선물세트·작업복 = 그 밖의 복지비', src.includes("'선물세트','유니폼','작업복','피복'"));
// 하나·기업은행은 예금이자 행의 적요를 비우고 성격을 '구분' 칸에만 적는다(이자 8건이 미분류였다)
// F공동은 대부금 지출의 성격('09월사내대출')을 '입금인코드' 칸에만 적었다
ok('입금인코드 칸도 힌트', src.includes('/구분|종류|기록사항|메모|비고|예금주|입금인/.test(v)'));
ok('리조트·회식 규칙', src.includes("'리조트','펜션','수련원','워터파크'")
  && src.includes("'회식','주스','도시락','생수','과일'"));
ok('성격 열을 여러 개 읽음(구분·거래기록사항·이체메모·예금주명)',
  src.includes('if(/구분|종류|기록사항|메모|비고|예금주|입금인/.test(v)')
  && src.includes('col.kind.indexOf(c)<0)col.kind.push(c);')
  && src.includes('function find(cells){col.kind=[];'));
// 농협은 순번 칸의 머리글이 '구분'이라 1·2·3…이 거래성격으로 읽혔다
ok('숫자만인 값은 성격으로 보지 않음', src.includes('!/^[\\d,.\\s]+$/.test(t)'));
ok('거래마다 kind를 담음', src.includes('kind:kind});'));
ok('가져오기가 kind를 넘기고 보관', src.includes('proposeAcct(x.memo,x.deposit>0,_snames,x.kind)')
  && src.includes("kind:(x.kind||'')"));
// 공동기금 최대 유입인 출연금은 적요에 '출연' 없이 회사명만 찍힌다((주)수영로지콘·청원건설)
ok('참여사업장명 입금을 출연금으로', src.includes('function _siteNames')
  && src.includes('if(isDep&&sites&&sites.length){')
  && src.includes("return {d:'현금성자산',c:'기본재산'};"));

// ── 푸른사진첩 연동 — 원본은 사진첩에 두고 기금은 참조만 갖는다 ──
// 이 배선은 조용히 끊기기 쉽다: 부르는 이름이 사진첩 쪽에서 바뀌면 화면에는 아무 표시 없이 안 열린다.
{
  const ps = fs.existsSync(path.join(__dirname, '..', '..', 'js', 'pu-photo-store.js'))
    ? fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'pu-photo-store.js'), 'utf8') : '';
  ok('사진첩 저장층 파일이 있다', ps.length > 0);
  const called = [...src.matchAll(/PuPhotoStore\.(\w+)/g)].map(m => m[1]);
  [...new Set(called)].forEach(fn => {
    ok('사진첩이 «' + fn + '» 를 실제로 내보낸다', new RegExp('^\\s*' + fn + ':\\s*' + fn + ',', 'm').test(ps));
  });
  ok('이미지를 RTDB로 복사하지 않는다(참조만)', src.includes('참조만 저장(이미지는 복사하지 않음)'));
}
// 참여사업장 제출서류 3종 — 체크만 있고 실물이 어디 있는지 알 수 없던 것을 사진첩과 이었다
ok('사업장 서류: 사진첩 참조 읽기', src.includes('function _subScanOf'));
ok('사업장 서류: 참조와 체크를 한 번에 쓴다', src.includes('function saveSiteScanRef')
  && src.includes("up['scan/site/'+sid+'/'+kind]=o; up['site/'+sid+'/'+kind]=1;"));
// 참조 자리는 체크 자리와 같은 마디 — 화면 열 때 읽기가 늘지 않는다
ok('사업장 서류: 참조가 subsidy_chk 안에 산다', src.includes("NS+'/subsidy_chk/'+fid+'/'+yr+'/scan/site/'"));
// 열 전체 켜기·노동청 일괄은 site/·fund/ 만 건드려야 한다 — scan 을 쓸면 사진 연결이 사라진다
ok('열 전체 켜기가 참조를 건드리지 않는다', src.includes("fbDb.ref(_subChkPath()+'/site').update(up)"));
ok('사업장 서류: 보기·해제', src.includes('function openSiteScan') && src.includes('function unlinkSiteScan'));
ok('사업장 서류는 판독하지 않고 연결만', src.includes('if(_pick.sid){'));
/* 지킬 뜻은 «열 때의 기금·해를 담아 두고, 저장할 때 그것을 쓴다»는 것이다.
   예전에는 그 한 줄을 통째로 «글자»로 붙들었는데, 근로자대표 재직증명서 갈래가 붙어
   줄이 갈라지자 뜻은 그대로인데 검사가 깨졌다.
   ⚠ 그렇다고 파일 «전체»에서 찾으면 안 된다 — _pick 을 세우는 자리가 둘이라,
     openAlbumPick 이 해를 안 담아도 다른 쪽 글자에 걸려 조용히 통과한다.
     실제로 그렇게 헛돌았다. 그 함수 «안에서» 본다. */
function _fnSrc(name){
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
}
const _apick = _fnSrc('openAlbumPick');
ok('고르는 사이 연도가 바뀌어도 그 해에 저장',
  /_pick=\{[\s\S]*?fid:S\.fundId/.test(_apick)
  && /_pick=\{[\s\S]*?yr:S\.year/.test(_apick)
  && src.includes('saveSiteScanRef(fid,_pick.yr,_pick.sid,kind,')
  && src.includes('saveShelfScanRef(fid,_pick.yr,_pick.shelf,'));
ok('체크표 칸에 사진첩 단추', src.includes('var sr=_subScanOf(s._id,c[0]);')
  && src.includes('openSiteScan(') && src.includes("openAlbumPick(\\''"));
ok('서류 이름표에 사업장 3종', /sme:'중소기업확인서',reg:'등기부등본',bizno:'사업자등록증'/.test(src));
// 지원금 서류함 — 사진첩에서 담으면 참조만 남는다(앱 창고에 사본을 만들지 않는다)
// 함수만 있고 단추가 화면에 안 걸리면 쓸 수 없다 — 배선까지 본다
ok('서류함: 사진첩에서 담기', src.includes('function openSubDocPick') && src.includes('function saveShelfScanRef')
  && src.includes('onclick="openSubDocPick()"'));
ok('서류함: 참조로 담고 사본을 안 만든다', src.includes("rec={kind:kind,name:_shelfName(kind,meta),ref:")
  && !/saveShelfScanRef[\s\S]{0,400}fbStore\.ref\(/.test(src));
ok('서류함: 사진첩 것은 창으로, 앱 보관은 링크로', src.includes('function openShelfScan')
  && src.includes("openShelfScan(\\'") && src.includes('<a href="\'+esc(x.url'));
// «🖼 사진첩» 만 보면 담기 단추 글씨에도 걸린다 — 표의 딱지인지 닫는 태그까지 본다
ok('서류함: 어디에 있는지 표에 보인다', src.includes('🖼 사진첩</span>') && src.includes('📎 앱 보관</span>'));
// 사진첩에서 담는 길은 Storage 가 없어도 된다 — 없다고 서류함을 통째로 감추면 담긴 것도 못 본다
ok('서류함: Storage 없이도 표와 사진첩 단추가 보인다',
  !src.includes("? '<div class=\"msg warn\">파일 보관은 Firebase Storage가 필요합니다.</div>'")
  && src.includes("+(fbStore?'<button onclick=\"uploadSubDoc()\""));
// 참조 기록에는 path 가 없다 — 창고 지우기를 타면 안 되고, 사진첩 원본도 지우면 안 된다
ok('서류함: 참조는 창고 삭제를 안 탄다', src.includes('if(fbStore&&d.path){'));
ok('서류함: 참조 지울 때 사진첩은 그대로라고 알린다', src.includes('사진첩의 사진은 그대로 남습니다.\\n'));
/* 표의 onclick 에 기록 id 를 그대로 끼워 넣는다 — id 에 따옴표가 섞이면 단추가 깨진다.
   subsidy_docs 에 쓰는 곳이 .push() 뿐이어야 id 가 푸시 키(영숫자·_·-)로만 나온다. */
{
  // ref(...) 바로 뒤에 오는 첫 낱말만 본다. push/remove/once 말고 set·update 가 오면
  // 사람이 정한 키가 들어올 수 있고, 그러면 표의 onclick 이 깨질 여지가 생긴다.
  const first = [...src.matchAll(/fbDb\.ref\(NS\+'\/subsidy_docs\/'[^;\n]*?\)\.(\w+)\(/g)].map(m => m[1]);
  const pushed = first.filter(x => x === 'push').length;
  const bad = first.filter(x => x !== 'push' && x !== 'remove' && x !== 'once');
  ok('서류함: 기록은 .push() 로만 만든다(id 가 푸시 키)', pushed >= 2 && bad.length === 0,
    '첫 호출 ' + first.join(',') + ' / 어긋남 ' + bad.join(','));
}
// 원본을 그리는 코드가 두 벌이면 한쪽만 고쳐져 화면마다 다르게 동작한다
// ⚠ 2026-08-27 — 부르는 이름이 loadFull → loadFullDetail 로 바뀌었다(빈손일 때
//    «까닭»까지 받는다). 이름을 못 박지 말고 «한 곳인가»만 본다.
ok('원본 그리기는 한 곳(_loadScanInto)', src.includes('function _loadScanInto')
  && (src.match(/PuPhotoStore\.loadFull(?:Detail)?\(String\(r\.year\)/g) || []).length === 1);
// 빈손일 때 «왜인지»를 말한다 — 「원본을 찾지 못했습니다」만으로는 손 쓸 데가 없다
ok('원본이 빈손이면 까닭을 함께 적는다', /loadFullDetail\(String\(r\.year\)/.test(src)
  && /got\.why/.test(src));

console.log('\n' + (fail ? 'FAILURES ' + fail + ' / ' + n : 'ALL PASS (' + n + '건)'));
process.exit(fail ? 1 : 0);
