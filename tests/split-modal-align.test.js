/* 나눠담기 팝업 — 줄칸 정렬 · 종류 필터 · 더빌이면 나이스빌 명세
   ★ 세금·성과 칸이 없는 줄에서 뒤 칸이 앞으로 밀려 위아래 금액이 어긋났다(대표 지적).
   ★ 사건·컨설팅·기금이 한 목록에 섞여 종류로 좁힐 수 없었다.
   ★ 더빌이체 입금은 명세(나이스빌)가 어느 업체들 몫인지 알고 있는데 팝업에서 안 보였다. */
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

const MODAL = src.slice(src.indexOf('// ── 나눠담기 모달 (2-2 좌우 대조) ──'),
                        src.indexOf('// ── 4-1 확정 이력'));
t('모달 구역을 찾았다', MODAL.length > 1000, true);

/* ══════ ① 줄칸 정렬 — 칸은 비어도 자리를 지킨다 ══════ */
t('세금 칸이 비어도 자리를 지킨다',
  /h\('span',\{style:Object\.assign\(\{\},_cw,\{width:'46px',padding:'0 4px',border:'1px solid transparent'\}\)\},''\)/.test(MODAL), true);
t('성과 칸이 비어도 자리를 지킨다',
  // 성과 칸에 이름·요율이 들어가 118px 로 넓혔다 — 비어도 자리는 그대로 지킨다
  /width:'118px',textAlign:'right',fontSize:'9\.5px',[\s\S]{0,500}?_pt>0 \? \(_perf\.map/.test(MODAL), true);
// 정렬 검사는 «목록 줄» 구역만 본다 — 다른 팝업의 요약 배지는 표가 아니라 조건부가 맞다
const POOL = MODAL.slice(MODAL.indexOf('// ── 한 줄 요약'), MODAL.indexOf("'약정 수수료'"));
t('조건부로 사라지는 성과 칸이 없다', /_pt>0 && h\('span'/.test(POOL), false);
t('조건부로 사라지는 세금 칸이 없다', /_tax && h\('span'/.test(POOL), false);
// 금액·차액 칸 너비가 정해져 있어 세로로 선다
t('금액 칸 너비 고정', /width:'78px',textAlign:'right',\s*\n\s*fontVariantNumeric/.test(MODAL), true);
t('차액 칸 너비 고정', /width:'70px',textAlign:'right',fontSize:'9\.5px'/.test(MODAL), true);

/* ══════ ② 종류 필터 ══════ */
t('종류 필터 상태가 있다', /var spKind=spKindS\[0\]/.test(src), true);
t('필터가 목록을 거른다', /if\(spKind && p\.store!==spKind\) return false;/.test(MODAL), true);
t('담아 둔 건은 필터와 상관없이 보인다',
  MODAL.indexOf('if(spSel[p.id]!==undefined) return true;') < MODAL.indexOf('if(spKind && p.store!==spKind)'), true);
t('전체 칩이 있다', /'전체'\)/.test(MODAL), true);
t('실제 있는 종류만 칩으로 만든다', /pending\.forEach\(function\(p\)\{ if\(p && p\.store && !_seen\[p\.store\]\)/.test(MODAL), true);
t('칩이 종류 색을 그대로 쓴다', /background:on\?b\.fg:b\.bg,color:on\?'#fff':b\.fg/.test(MODAL), true);
t('같은 칩을 다시 누르면 풀린다', /setSpKind\(on\?'':k\)/.test(MODAL), true);
t('닫으면 필터도 초기화된다', /setSpQ\(''\);setSpKind\(''\);\}/.test(MODAL), true);

/* ══════ ③ 더빌이체 → 나이스빌 명세 ══════ */
t('더빌 적요인지 본다', /rowsIn\.some\(function\(r\)\{ return erpIsCmsMemo\(r\.memo\|\|r\.note\|\|''\); \}\)/.test(MODAL), true);
t('명세를 날짜·금액으로 찾는다', /erpCmsLedgerForDeposit\(rowsIn\[_hi\]\.date, rowsIn\[_hi\]\.amount\)/.test(MODAL), true);
t('명세가 없으면 없다고 말한다', /나이스빌 명세를 못 찾았습니다/.test(MODAL), true);
t('회원명을 ERP 업체로 풀어 보여준다', /erpNicebillMatchCo\(_idx, r\.name, r\.bizNo\)/.test(MODAL), true);
t('연결 안 된 회원은 표시가 붙는다', /'ERP 업체와 연결 안 됨'/.test(MODAL), true);
t('합계와 수수료를 보여준다', /'합계'\+\(_fee\?\(' · 수수료 '\+_fee\.toLocaleString\(\)\):''\)/.test(MODAL), true);
t('명세대로 처리하는 길이 있다', /closeModal\(\); setCmsRow\(_r0\);/.test(MODAL), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
