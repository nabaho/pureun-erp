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
ok('워크북 처분계산서도 이름을 바꿔 양수로', src.includes("_rl?'Ⅰ. 미처리결손금':'Ⅰ. 미처분이익잉여금'")
  && src.includes("_rl?'Ⅲ. 차기이월결손금':'Ⅲ. 차기이월이익잉여금'"));
ok('워크북 처분계산서에 원값을 안 쓴다',
  !src.includes("['Ⅰ. 미처분이익잉여금',fin.retained,prv.retained]")
  && !src.includes("['Ⅲ. 차기이월이익잉여금',fin.retained,prv.retained]"));
ok('당기순손실도 이름을 바꾼다', src.includes("(fin.net<0?'  2) 당기순손실':'  2) 당기순이익')"));
/* 결손금은 «수입»이 아니다 — 수입에 음수로 넣으면 수입 합계가 그만큼 줄어 예산이 작아 보인다 */
ok('예산편성안 이월금은 잉여일 때만', src.includes('var _carry=Math.max(0,fin.retained), _loss=Math.max(0,-fin.retained);')
  && src.includes("_xlRow(s,rw++,['수입 — 이월금',_carry,null,null]);")
  && src.includes('fin.interest+R.bf.employer+R.bf.other+_carry'));
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
ok('서산지청 승격 반영(서산시)', src.includes("'충남 서산시':'대전지방고용노동청 서산지청'"));
ok('예산군은 천안지청', src.includes("'충남 예산군':'대전지방고용노동청 천안지청'"));
ok('보령지청에 서산 없음',
  !/'충남 서산시':'대전지방고용노동청 보령지청'/.test(src));

// ── ⑧ 회계 계정 체계 (A공동 2025 실결산 검증에서 확인된 필수 계정) ──
ok('세금과공과 계정', src.includes("'세금과공과':'비용'"));
ok('격려금 계정', src.includes("'격려금':'비용'"));
ok('고유목적사업준비금환입 계정(수익)', src.includes("'고유목적사업준비금환입':'수익'"));
ok('세금과공과를 관리비로 집계', /var ADMIN=\[[^\]]*'세금과공과'/.test(src));
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
  (src.match(/_retLabel\(/g)||[]).length>=4 && (src.match(/_retVal\(/g)||[]).length>=5);
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
/* ══ 준비금 1·2 배치는 기금마다 다르다 ══
   어느 번호가 «이자»(법인세법 제29조)이고 어느 번호가 «이월»(근로복지기본법 제62조제2항)인지는
   그 기금 결산서를 만든 쪽이 정한다. 환입/전입은 «잔액이 있는 쪽»을 골라 따라갔지만
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
ok('전기이월 칸을 계정표에서 뽑아 그린다',
  src.includes("+'<div class=\"grid\" style=\"max-width:760px\">'+Object.keys(OPEN_ACCT).map(function(k){")
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
ok('시설·비품 = 근로복지시설비', src.includes("'공사','설치','보수','비품','냉난방','정수기','사물함','세탁기','청소기','게시판','신발장'"));
ok('명절선물·작업복 = 그 밖의 복지비', src.includes("'선물세트','명절선물','유니폼','작업복','피복'"));
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
ok('고르는 사이 연도가 바뀌어도 그 해에 저장', src.includes("fid:S.fundId,sid:sid||'',yr:S.year")
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
ok('원본 그리기는 한 곳(_loadScanInto)', src.includes('function _loadScanInto')
  && (src.match(/PuPhotoStore\.loadFull\(String\(r\.year\)/g) || []).length === 1);

console.log('\n' + (fail ? 'FAILURES ' + fail + ' / ' + n : 'ALL PASS (' + n + '건)'));
process.exit(fail ? 1 : 0);
