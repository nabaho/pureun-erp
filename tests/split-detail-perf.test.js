/* 나눠담기 팝업 — 「누구 건인가·어떤 건인가·성과 몇 %」 + 달력 담당자 색 완화
   ★ 팝업에서 업체명이 비어 보여 어느 회사 건인지 확인이 안 됐다(대표 지적).
   ★ 성과급이 금액만 있어 «그 사람에게 몇 %로 얼마가 갔는지» 확인할 수 없었다.
   ★ 법인 대시보드 달력이 담당자 색으로 칸을 꽉 채워 원색 덩어리로 보였다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ══════ ① 누구 건인가 · 어떤 건인가 ══════ */
const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('function erpWhoOf(p){', '\nif(typeof window !== \'undefined\'){ window.erpWhoOf'), ctx);

t('업체명이 있으면 그대로', ctx.erpWhoOf({companyName:'노리시스템'}), '노리시스템');
t('기록 쪽 이름으로 물러난다', ctx.erpWhoOf({item:{companyName:'㈜한엘'}}), '㈜한엘');
t('의뢰인 이름도 본다', ctx.erpWhoOf({item:{clientName:'김민수'}}), '김민수');
t('사업 이름도 본다', ctx.erpWhoOf({item:{name:'용천새마을금고'}}), '용천새마을금고');
t('★ 대시(-)는 이름이 아니다', ctx.erpWhoOf({companyName:'-'}), '');
t('공백만 있으면 비었다고 본다', ctx.erpWhoOf({companyName:'   '}), '');
t('아무것도 없으면 빈 값', ctx.erpWhoOf({item:{}}), '');
t('빈 값도 안 터진다', ctx.erpWhoOf(null), '');

t('건명을 찾는다', ctx.erpTitleOf({item:{caseName:'부당해고 구제신청'}}), '부당해고 구제신청');
t('컨설팅 이름도 본다', ctx.erpTitleOf({item:{consultingName:'일터혁신'}}), '일터혁신');
t('업체명과 같으면 두 번 안 적는다',
  ctx.erpTitleOf({companyName:'대성물류', item:{title:'대성물류'}}), '');
t('건명이 없으면 빈 값', ctx.erpTitleOf({item:{}}), '');
t('빈 값도 안 터진다', ctx.erpTitleOf(null), '');

const MODAL = slice('// ── 나눠담기 모달 (2-2 좌우 대조) ──', '// ── 4-1 확정 이력');
t('팝업이 이름 찾기를 쓴다', /var _who=erpWhoOf\(p\);/.test(MODAL), true);
t('팝업이 건명을 쓴다', /var _title=erpTitleOf\(p\);/.test(MODAL), true);
t('이름이 없으면 빨갛게 알린다', /'⚠ 업체명 없음'/.test(MODAL), true);
t('회색으로 흘려보내지 않는다', /color:'#cbd5e1',fontWeight:400\}\},'\(업체명 없음\)'/.test(MODAL), false);
t('건명 칸이 따로 있다', /width:'140px',color:'#475569'\}\),title:_title\|\|''\},_title\|\|''\)/.test(MODAL), true);
t('마우스를 올리면 전체 이름이 보인다', /title:_who\|\|''/.test(MODAL), true);

/* ══════ ② 성과급 — 누가 몇 %로 얼마 ══════ */
t('요율을 보여준다', /\(ps\.pct!==undefined&&ps\.pct!==null\)\?\(ps\.pct\+'%'\):'-'/.test(MODAL), true);
t('나눠 갖는 몫도 보여준다', /'몫 '\+ps\.sharePct\+'%'/.test(MODAL), true);
t('몫이 100%면 굳이 안 적는다', /ps\.sharePct!==100/.test(MODAL), true);
t('성과 기준액을 보여준다', /'기준 '\+\(\(_perf\[0\]&&_perf\[0\]\.baseAmount\)\|\|p\.amount\|\|0\)\.toLocaleString\(\)/.test(MODAL), true);
t('한 줄에서도 이름과 %를 보여준다',
  /\(ps\.name\|\|ps\.sid\)\+' '\+\(\(ps\.pct!==undefined&&ps\.pct!==null\)\?ps\.pct\+'%':''\)/.test(MODAL), true);
t('마우스를 올리면 사람별로 다 보인다', /' → '\+\(ps\.amount\|\|0\)\.toLocaleString\(\)\+'원'/.test(MODAL), true);
t('금액만 적던 옛 표시가 없다',
  /_pt>0\?\('성과 '\+_pt\.toLocaleString\(\)\):''/.test(MODAL), false);

/* ══════ ③ 달력 담당자 색 완화 ══════ */
const tctx = { console, Object, JSON, String, Math };
vm.createContext(tctx);
vm.runInContext(slice('var ERP_TINT = {', '\nif(typeof window !== \'undefined\'){ window.erpTint'), tctx);

t('진한 파랑 → 연한 파랑 바탕', tctx.erpTint('#2563eb'), '#eff6ff');
t('진한 파랑 → 진한 글', tctx.erpInk('#2563eb'), '#1e40af');
t('빨강도 짝이 있다', tctx.erpTint('#dc2626'), '#fef2f2');
t('초록도 짝이 있다', tctx.erpInk('#16a34a'), '#166534');
// 커스텀 색은 대문자로 저장될 수 있다 — 못 찾으면 온 화면이 회색으로 물러난다
t('대문자로 와도 찾는다 (바탕)', tctx.erpTint('#DC2626'), '#fef2f2');
t('대문자로 와도 찾는다 (글)', tctx.erpInk('#DC2626'), '#991b1b');
t('표에 없는 색은 회색으로 물러난다', tctx.erpTint('#123456'), '#f8fafc');
t('표에 없는 색의 글도 회색', tctx.erpInk('#123456'), '#475569');
t('빈 값도 안 터진다', tctx.erpTint(null), '#f8fafc');

const CAL = slice("evs.slice(0, 3).map(function(e, k){", "evs.length > 3 &&");
t('달력이 연한 바탕을 쓴다', /background:erpTint\(e\.color\)/.test(CAL), true);
t('색은 왼쪽 막대로만', /borderLeft:'3px solid '\+e\.color/.test(CAL), true);
t('글은 진한 쪽으로', /color:erpInk\(e\.color\)/.test(CAL), true);
t('칸을 원색으로 채우지 않는다', /background:e\.color, borderRadius:'8px'/.test(CAL), false);
t('흰 글씨를 쓰지 않는다', /color:'#fff', fontWeight:600/.test(CAL), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
