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
ok('통장 파서가 거래상대방 열을 읽음', /보낸분\|받는분\|상대계좌\|입금자\|송금인\|거래처/.test(src));

// ── ⑨ 준비금 자동 환입 (결산 확정 시) ──
ok('reserveReclaim 존재', src.includes('function reserveReclaim'));
ok('환입 분개 생성기 존재', src.includes('function _reclaimEntry'));
ok('환입 분개는 대체분개(nocash)', /nocash:1/.test(src));
// 대체분개는 현금이 아니므로 amount로 금액을 읽어야 한다 — 안 읽으면 금액 0으로 무시된다
ok('journalOf가 amount를 읽음', src.includes('amount:num(x.amount)||num(x.deposit)'));
ok('computeFin이 amount를 읽음', src.includes('var amt=num(x.amount)||num(x.deposit)'));
ok('결산 확정이 환입을 자동 기록', src.includes('var rc=reserveReclaim(arr,fid,yr)'));
// 분개와 확정이 따로 저장되면 하나만 성공했을 때 장부가 어긋난다 → 한 번의 update로
ok('환입 분개와 확정을 한 번에 저장', /up\['txns\/'\+fid\+'\/'\+yr\+'\/'\+id\]=e;/.test(src)
  && /up\['closing\/'\+fid\+'\/'\+yr\+'\/locked'\]=true;/.test(src));
ok('거래 목록에 대체분개 표시', src.includes('x.nocash&&num(x.amount)'));

console.log('\n' + (fail ? 'FAILURES ' + fail + ' / ' + n : 'ALL PASS (' + n + '건)'));
process.exit(fail ? 1 : 0);
