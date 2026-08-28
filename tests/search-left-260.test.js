/* 검색창 자리와 크기를 세 화면이 같이 지킨다 (대표 지시 2026-08-27)

   ★ 무슨 일이 있었나
     사무관리만 검색창이 «맨 오른쪽»에 있고 flex:1 이라 남는 자리를 다 차지했다.
     그래서 창 크기·탭 개수에 따라 폭이 제멋대로 달라졌고, 사건관리·컨설팅관리
     (둘 다 왼쪽 260px)와 섞어 쓰면 매번 눈이 검색칸을 다시 찾아야 했다.

   ★ 지키려는 것
     ① 사무관리 검색창이 「전체 활성」 «앞»에 온다
     ② 세 화면(사무·사건·컨설팅)의 검색창 폭이 260px 로 같다
     ③ 늘어나는 설정(flex:1)으로 되돌아가지 않는다
     ④ 검색창에 딸린 「N건」·「×」 는 함께 따라왔다 (옮기다 흘리기 쉽다) */
const fs = require('fs');
const path = require('path');
const { cutFn } = require('./cut-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').split('\r\n').join('\n');

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

const company = cutFn(src, 'function CompanyManagement');
const kase    = cutFn(src, 'function CaseManagement');
/* ⚠ ConsultingManagement 는 «껍데기»다(20줄). 실제 화면은 아래 공용 부품이고,
   컨설팅·기금·기타 세 화면이 이것 하나를 같이 쓴다 — 여기를 고치면 셋이 함께 바뀐다. */
const consult = cutFn(src, 'function ProjectManagementShared');

// ── ① 자리 ──
const iSearch = company.indexOf('업체명·번호·대표·주소·메모');
const iActive = company.indexOf('전체 활성 (');
ok('사무관리 검색창이 「전체 활성」 앞에 있다',
   iSearch > 0 && iActive > 0 && iSearch < iActive,
   '검색 ' + iSearch + ' · 전체활성 ' + iActive + ' (검색이 더 작아야 한다)');

// ── ② 세 화면이 같은 폭 ──
ok('사무관리 검색창이 260px 다',
   /width:'260px', flexShrink:0/.test(company),
   '늘어나는 칸이면 화면마다 폭이 달라진다');
ok('사건관리 검색창도 260px 다',
   /placeholder:'🔍 관리번호·의뢰인·사업자번호·비고 검색'[\s\S]{0,200}?width:'260px'/.test(kase),
   '한쪽만 바꾸면 다시 어긋난다');
ok('컨설팅·기금·기타(공용 부품) 검색창도 260px 다',
   /placeholder:'🔍 관리번호·업체명·사업자번호 검색'[\s\S]{0,200}?width:'260px'/.test(consult),
   '한쪽만 바꾸면 다시 어긋난다');

// ── ③ 옛 설정으로 못 돌아간다 ──
ok('늘어나는 설정(flex:1 · minWidth:180px)이 없다',
   !/alignItems:'center', flex:1, minWidth:'180px'/.test(company),
   '되살아나면 검색칸이 다시 남는 자리를 다 먹는다');
ok('「오른쪽, 넓게」 라는 옛 설명이 남아 있지 않다',
   company.indexOf('검색 (오른쪽, 넓게)') < 0,
   '설명과 실제가 어긋나면 다음 사람이 잘못 고친다');

// ── ④ 딸린 것들이 함께 왔다 ──
const box = company.slice(iSearch - 700, iSearch + 1800);
ok('「N건」 표시가 검색창에 붙어 있다',
   /filtered\.length \+ '건'/.test(box),
   '옮기다 흘리면 몇 건 걸렸는지 안 보인다');
ok('「×」 지우기 단추가 검색창에 붙어 있다',
   /검색어 지우기 \(Esc\)/.test(box),
   '옮기다 흘리면 한 글자씩 지워야 한다');
ok('Esc 로도 지워진다',
   /e\.key === 'Escape'/.test(box),
   '단추 설명에 Esc 라고 적어 두었다');

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
