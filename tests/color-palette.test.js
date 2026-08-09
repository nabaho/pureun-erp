/* 색 팔레트 — 5계열 27색 + 흰·검만 쓴다 (대표 승인 A안, 2026-08-09)
   ★ 162가지 색이 11,160군데 쓰여 화면이 어지러웠다. 회색만 세 벌이었고
     주황·보라·청록·남색·분홍이 뜻 없이 섞여 있었다.
   규칙: 색은 뜻이 있을 때만 — 회색=바탕·글, 파랑=동작·정보, 초록=성공·입금,
        노랑=주의·확인, 빨강=위험·출금.
   ※ 이 검사가 막으면: 새 색을 만들지 말고 아래 팔레트에서 골라 쓰세요. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

const PALETTE = [
  // 회색 — 바탕과 글 (7단계)
  '#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#1e293b',
  // 파랑 — 누르는 것·정보
  '#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e40af',
  // 초록 — 성공·입금
  '#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#166534',
  // 노랑 — 주의·확인
  '#fffbeb', '#fde68a', '#fbbf24', '#d97706', '#854d0e',
  // 빨강 — 위험·출금
  '#fef2f2', '#fecaca', '#f87171', '#dc2626', '#991b1b',
  '#ffffff', '#000000'
];
const allow = {};
PALETTE.forEach(c => allow[c] = 1);

/* ① 6자리 색 — 전부 팔레트 안이어야 한다 */
const used = {};
[...src.matchAll(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g)].forEach(m => {
  const k = m[0].toLowerCase();
  used[k] = (used[k] || 0) + 1;
});
const strays = Object.keys(used).filter(c => !allow[c]);
t('팔레트 밖의 색이 없다' + (strays.length ? (' — ' + strays.slice(0, 8).map(c => c + '(' + used[c] + ')').join(' ')) : ''),
  strays.length, 0);
t('고유 색이 29가지를 넘지 않는다', Object.keys(used).length <= 29, true);

/* ② 3자리 색 — 흰·검만 */
const used3 = {};
[...src.matchAll(/#[0-9a-fA-F]{3}(?![0-9a-fA-F])/g)].forEach(m => { used3[m[0].toLowerCase()] = 1; });
const strays3 = Object.keys(used3).filter(c => c !== '#fff' && c !== '#000');
t('3자리 색은 흰·검뿐이다' + (strays3.length ? (' — ' + strays3.join(' ')) : ''), strays3.length, 0);

/* ③ 종류 배지 — A안 배정 */
const BADGE = src.slice(src.indexOf('var STORE_BADGE = {'), src.indexOf('function storeBadge('));
t('사건 = 노랑', /cases:\s*\{label:'사건',\s*bg:'#fffbeb', fg:'#854d0e'/.test(BADGE), true);
t('컨설팅 = 파랑(진)', /consultings:\s*\{label:'컨설팅', bg:'#eff6ff', fg:'#2563eb'/.test(BADGE), true);
t('기금 = 초록', /funds:\s*\{label:'기금',\s*bg:'#f0fdf4', fg:'#16a34a'/.test(BADGE), true);
t('기타 = 회색 (컨설팅 파랑과 안 겹치게)', /other_projects: \{label:'기타',\s*bg:'#f8fafc', fg:'#475569'/.test(BADGE), true);
t('자문료 = 파랑(연)', /companies:\s*\{label:'자문료', bg:'#eff6ff', fg:'#1e40af'/.test(BADGE), true);

/* ④ 신호등 뜻이 유지된다 — 확정=초록, 주의=노랑, 위험=빨강 */
t('확정 단추는 초록', /background:'#16a34a',color:'#fff'[\s\S]{0,120}?'확정'/.test(src), true);
t('입금 금액은 초록', /fontWeight:700,color:'#16a34a',fontSize:'12px'/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
