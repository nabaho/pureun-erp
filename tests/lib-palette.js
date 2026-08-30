/* 색을 «값»이 아니라 «뜻»으로 보는 자 (2026-08-30)
 *
 * 검사가 `#a50e0e` 같은 «지금 값»을 박아 두면, 팔레트를 정리하는 것만으로
 * 열 개가 한꺼번에 깨진다(실제로 그랬다 — CLAUDE.md 「검사를 쓰는 규칙」).
 * 지켜야 할 것은 「그 색이 빨간가 · 짙은가 · 밝은가」다.
 *
 * ⚠ 검사 파일이 아니다(`*.test.js` 가 아니라서 러너가 안 집는다).
 */
const PALETTE = {
  gray:  ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#1e293b'],
  blue:  ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e40af'],
  green: ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#166534'],
  amber: ['#fffbeb', '#fde68a', '#fbbf24', '#d97706', '#854d0e'],
  red:   ['#fef2f2', '#fecaca', '#f87171', '#dc2626', '#991b1b'],
};

function norm(h) {
  h = String(h || '').toLowerCase();
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h.slice(0, 7);
}
/* 사람 눈에 보이는 밝기(WCAG 상대휘도) — 0(검정) ~ 1(흰색) */
function lum(h) {
  h = norm(h);
  const c = [1, 3, 5].map(i => {
    let v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const isFamily = (fam) => (h) => PALETTE[fam].includes(norm(h));
const isRed = isFamily('red');
const isBlue = isFamily('blue');
const isGreen = isFamily('green');
const isAmber = isFamily('amber');
const isGray = (h) => PALETTE.gray.includes(norm(h)) || norm(h) === '#ffffff' || norm(h) === '#000000';

const isDark = (h) => lum(h) < 0.12;    // 흰 글자가 읽히는 짙은 색
const isLight = (h) => lum(h) > 0.70;   // 검은 글자가 읽히는 밝은 바탕

/* 한 CSS 규칙 덩이(`{...}`)에서 색을 다 꺼낸다 */
function colorsIn(rule) {
  return [...String(rule || '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map(m => m[0]).filter(h => [4, 7, 9].includes(h.length)).map(norm);
}
/* 어떤 속성의 색 (background:… color:… border-color:…)
   ⚠ 그냥 `color:` 를 찾으면 «border-color:» 안의 color 가 먼저 걸린다 —
     실제로 그래서 「글자가 짙지 않다」는 엉뚱한 소리가 나왔다. 앞을 끊어 준다. */
function colorOf(rule, prop) {
  const m = String(rule || '').match(
    new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*(#[0-9a-fA-F]{3,8})\\b'));
  return m ? norm(m[1]) : null;
}
/* 두 색이 사람 눈에 갈라지는가 — 「고른 것이 짙게 보인다」 같은 규칙에 쓴다 */
function contrast(a, b) {
  const A = lum(a), B = lum(b);
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
}

module.exports = {
  PALETTE, norm, lum, colorsIn, colorOf, contrast,
  isRed, isBlue, isGreen, isAmber, isGray, isDark, isLight,
};
