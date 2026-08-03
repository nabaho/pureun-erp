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
const titleLine = (src.split(/\r?\n/).find(l => l.startsWith('var FM_TITLE=')) || '');
['합의서', '확인서', '승낙서', '서약서', '신청서', '회의록', '정관', '필요서류', '목록표'].forEach(w => {
  ok('제목 어휘 «' + w + '»', titleLine.includes(w), titleLine.slice(0, 90));
});

// ── ⑤ 지원금 — 연도별 1인당 한도(시행계획으로 확인한 값) ──
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

// ── ⑧ 회계 계정 체계 (청신공동 2025 실결산 검증에서 확인된 필수 계정) ──
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
ok('통장 파서가 거래상대방 열을 읽음', /보낸분\|받는분\|상대계좌\|입금자\|송금인\|거래처\|업체/.test(src));
// 통장을 못 받고 손으로 적은 지출대장만 오는 기금이 있다(플러스동반성장 2024: 56건)
ok('머리글의 공백을 지우고 맞춤', src.includes("var v=String(cells[c]||'').replace(/\\s+/g,'');"));
ok('대장 머리글(세부내역) 인식', src.includes('/적요|내용|내역|의뢰인|기재|가맹점/.test(v)'));
// 적요가 'BZ뱅크'처럼 수단만 적힌 통장이 있다 — 실제 상대방이 든 설명 열을 버리면 출연금을 못 잡는다
ok('남는 설명 열을 성격 힌트로 모음', src.includes('if(col.memo==null)col.memo=c; else if(col.kind.indexOf(c)<0)col.kind.push(c); }'));
ok('예금주명 열도 힌트(계좌번호는 제외)', src.includes('/구분|종류|기록사항|메모|비고|예금주/.test(v)&&!/계좌번호|통화|화폐/.test(v)'));
ok('사업장명 대조에 힌트 포함', src.includes("var mzz=strip(m+' '+String(kind||''));"));
// 은행이 상대방 이름을 잘라 적는다 — 잘린 쪽이 사업장명의 앞부분이면 같은 회사로 본다
ok('전각 괄호도 지움', src.includes('（주）|（유）|주식회사|유한회사'));
ok('잘려 적힌 회사명도 인식', src.includes('if(nm.indexOf(toks[q])===0)')
  && src.includes(".map(strip).filter(function(t){ return t.length>=4; });"));
ok('엑셀 미국식 m/d/yy 인식', src.includes("m=t.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2})$/);"));
ok('빈 일자는 위 일자를 이음', src.includes("if(/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) lastDate=date; else if(!date) date=lastDate;"));

// ── ⑨ 준비금 자동 조정 (결산 확정 시, 양방향) ──
// 비용>수익이면 환입(청신공동 2025), 수익>비용이면 전입(안전공사공동 2022). 한쪽만 처리하면 순이익이 0이 안 된다.
ok('reserveAdjust 존재', src.includes('function reserveAdjust'));
ok('조정 분개 생성기 존재', src.includes('function _reserveEntry'));
ok('환입·전입 양방향', /r\.kind='환입'/.test(src) && /r\.kind='전입'/.test(src));
// 준비금2를 만드는 분개가 없으면 출연금을 그 해에 쓰는 공동기금은 순이익 0을 만들 수 없다
ok('당기 출연금 집계', src.includes('function _contribOf'));
// 증권·부동산 현물출연을 한도에 넣으면 기본재산이 붕괴한다(배경공동 2022: 증권 72.6억 현물출연)
ok('한도 기준은 현금 출연금만', src.includes('if(x.nocash) return;                                  // 현물출연·대체분개는 제외')
  && src.includes("if(!amt&&(x.debit==='현금성자산'||x.debit==='정기예금')) amt=num(x.amount)||0;"));
ok('사용한도 비율(공동 90/사내 50)', /function _reserveRate\(fid\)\{ return \(\(funds\[fid\]\|\|\{\}\)\.fund_type==='사내'\)\?0\.5:0\.9; \}/.test(src));
ok('준비금2 설정 분개(기본재산 차변)', /if\(kind==='설정'\)/.test(src) && /debit:'기본재산', credit:acct/.test(src));
ok('한도 초과분은 기본재산 사용으로 구분', /if\(kind==='기본재산사용'\)/.test(src));
// 실무 결산서는 사용한도 전액을 설정하고 쓰지 않은 잔액을 준비금2로 남긴다
// (가치를만들어가는사람들 2024·일원공동 2024 모두 출연금 × 90% 전액)
ok('설정은 사용한도 전액', src.includes('r.setup=Math.max(0,cap);')
  && src.includes('r.overBasic=Math.max(0,r.need-avail-r.setup);'));
ok('환입을 계정별 잔액 안에서 배분', src.includes('r.parts.push({acct:a,amount:take})'));
ok('조정 분개 묶음 생성기', src.includes('function _reserveEntries'));
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
// 은행이 월별 시트로 나눠 주면 첫 시트만 읽고 나머지 달을 통째로 잃는다(안전공사 2022: 2,007,649원 누락)
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

// ── ⑫ 디와이사내 2025 실결산에서 확인된 것 ──
// 기본재산을 증권으로 운용하는 기금이 있다(26억). 계정·전기이월 칸이 없으면 대차가 그만큼 어긋난다
ok('매도가능증권 계정', src.includes("'매도가능증권':'자산'"));
// 칸만 늘리고 저장 목록을 안 고쳐 매도가능증권 전기이월이 저장되지 않았다 → OPEN_ACCT에서 파생
ok('전기이월 저장 목록을 OPEN_ACCT에서 뽑음',
  src.includes("var o={}; Object.keys(OPEN_ACCT).forEach(function(k){var el=$('op-'+k);"));
// 준비금은 1·2를 갈라 이월해야 한다(안전공사공동 2024는 준비금2로 42,245,952원 이월)
ok('전기이월 준비금1·2 분리', src.includes("reserve:'고유목적사업준비금1',reserve2:'고유목적사업준비금2'")
  && src.includes("oi('reserve2','고유목적사업준비금2')")
  && src.includes('liab+=(num(opening.reserve)||0)+(num(opening.reserve2)||0);')
  && src.includes('bal[RESERVE_ACCTS[1]]+=Math.round(num(op.reserve2)||0);'));
ok('전기이월에 매도가능증권 칸', src.includes("secu:'매도가능증권'") && src.includes("oi('secu','매도가능증권')"));
ok('자산총계에 증권 합산', src.includes('cash+savings+loan+secu'));
ok('별지15호 ㉓ 유가증권을 장부에서', src.includes('num(rep.run_secu)||fin.secu'));
ok('복리후생 계정(목적사업비)', src.includes("'복리후생':'비용'"));
ok('잡수익 계정', src.includes("'잡수익':'수익'"));
// 1원·10원은 같은 날 같은 금액이 우연히 겹친다 — 소액을 이체로 자동 상계하면 장부가 틀어진다
ok('이체 자동상계 최소금액', /var XFER_MIN=\d+;/.test(src) && src.includes('amt>=XFER_MIN'));
// 통장을 엑셀로 못 받는 은행이 있다(새마을금고는 PDF만) — 직접 입력이 없으면 회계를 시작조차 못 한다
ok('거래 직접 추가', src.includes('function addTxnForm') && src.includes('function addTxnSave')
  && src.includes('onclick="addTxnForm()"'));
ok('직접 입력 거래 표시', src.includes('x.manual?'));
ok('머리글에 계좌번호가 없으면 파일명에서', src.includes("String(file.name||'').match"));

// ── ⑭ 분할 분개 (이비공동 2024: 송금 100,500 = 생활지원금 100,000 + 이체수수료 500) ──
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

// ── ⑬ 통장 파서·자동분개 (가치를만들어가는사람들 2024 실결산 검증) ──
// 합계 행: 하나·기업·우리 모두 'No' 다음 칸(= 일자 칸)에 '합   계'를 적는다. 적요만 보면 놓친다.
// (가치 A통장의 합계 행 한 줄이 거래로 들어와 출금이 119,510,650원 부풀었다)
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
ok('전문가 용역비 = 지급수수료', src.includes("'노무법인','회계법인','세무법인','세무사','법무사','변호사','등기'"));
ok('시설·비품 = 근로복지시설비', src.includes("'공사','설치','보수','비품','냉난방','정수기','사물함','세탁기','청소기','게시판','신발장'"));
ok('명절선물·작업복 = 그 밖의 복지비', src.includes("'선물세트','명절선물','유니폼','작업복','피복'"));
// 하나·기업은행은 예금이자 행의 적요를 비우고 성격을 '구분' 칸에만 적는다(이자 8건이 미분류였다)
ok('성격 열을 여러 개 읽음(구분·거래기록사항·이체메모·예금주명)',
  src.includes('if(/구분|종류|기록사항|메모|비고|예금주/.test(v)')
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

console.log('\n' + (fail ? 'FAILURES ' + fail + ' / ' + n : 'ALL PASS (' + n + '건)'));
process.exit(fail ? 1 : 0);
