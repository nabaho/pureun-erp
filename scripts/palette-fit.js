#!/usr/bin/env node
/* 색을 푸른이알피 27색 팔레트로 맞춘다 (대표 지시 2026-08-30 「색을 많이 줄여 단순화해라」)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-30 에 네 앱(정부컨설팅·경력관리·업무관리·기업정보함)을 손으로 옮겼다.
 * 남은 열세 앱에 같은 일을 또 해야 해서, 그때 쓴 규칙을 연장으로 남긴다.
 *
 * ■ 옮기는 규칙은 둘뿐이다
 *   ① 색기운을 안 바꾼다  (보라→파랑 · 청록→초록 · 분홍→빨강 · 주황→노랑)
 *   ② 밝기 차례를 지킨다  — 안 지키면 「연한 바탕 + 진한 글자」가 뒤집혀 글자가 묻힌다
 *
 * ⚠ 채도만 보면 안 된다. HSL 의 S 는 밝기로 나누기 때문에 아주 밝거나 어두운 색에서
 *   부풀려진다 — #e4e8f0(거의 흰 회색)이 S=0.29 로 나와 「파랑」으로 갔다.
 *
 * ⚠ «벌어진 정도»(가장 센 칸 − 가장 약한 칸)로도 못 가린다. 2026-08-30 에 그것으로
 *   재 봤더니 회청색 #a3adbd(26)·짙은 남색 #101828(24)이 색으로 잡혀 파랑으로 갔고,
 *   정작 팔레트 회색 #94a3b8 은 36 이라 더 «색»으로 보였다 — 잣대가 뒤집혀 있었다.
 *   그래서 «회색축에서 얼마나 떨어졌나»(RGB 세 칸이 평균에서 벌어진 거리)로 잰다.
 *   열두 색으로 맞춰 보니 이것만 다 갈랐다: 회청·짙은남색·따뜻한흰색은 회색,
 *   진짜 연파랑 #b6c6ee(40.8)부터 색이다.
 *
 * ⚠ #fab 은 색이 아니라 id 이름일 수 있다(f·a·b 가 다 hex 글자). 바꿨으면 그 화면이
 *   통째로 깨진다 — 파일에 있는 id·선택자·주소를 먼저 걷어 내고 그 이름은 안 건드린다.
 * ⚠ #fff 를 #ffffff 로 펴지 않는다 — 뜻은 그대로면서 수백 군데가 흔들리고,
 *   글자로 견주는 코드(b.style.color === '#fff')가 조용히 깨진다.
 *
 * 쓰기:  node scripts/palette-fit.js <파일> [--write] [--keep=#aaa,#bbb]
 *        --write 없이 부르면 «무엇이 어디로 가는지»만 보여 주고 파일은 안 고친다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'tests', 'lib-palette.js'));

/* ── 색 읽기 ─────────────────────────────────────────────────────── */
function rgb(h) {
  h = P.norm(h);
  return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
}
/* 회색축에서 떨어진 거리 — 이것이 「색인가 회색인가」의 잣대다 */
const GREY_MAX = 35;
function greyDist(h) {
  const c = rgb(h);
  const m = (c[0] + c[1] + c[2]) / 3;
  return Math.sqrt(c.reduce((a, v) => a + (v - m) * (v - m), 0));
}
/* 색기운(0~360). 회색이면 null */
function hueOf(h) {
  const [r, g, b] = rgb(h);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (greyDist(h) < GREY_MAX) return null;
  if (!d) return null;
  let deg;
  if (mx === r) deg = 60 * (((g - b) / d) % 6);
  else if (mx === g) deg = 60 * ((b - r) / d + 2);
  else deg = 60 * ((r - g) / d + 4);
  return (deg + 360) % 360;
}
/* 색기운 → 팔레트 집안. ① 색기운을 안 바꾼다는 규칙이 여기 들어 있다
   ⚠ 초록·파랑 경계를 195 로 둔다. 170 으로 뒀더니 청록 #0f766e(175도)이 «파랑»으로
     갔다 — 「청록→초록」이라는 규칙을 연장이 스스로 어겼다(2026-08-30). */
function familyOf(h) {
  const deg = hueOf(h);
  if (deg === null) return 'gray';
  if (deg < 20 || deg >= 320) return 'red';     // 빨강 · 분홍
  if (deg < 70) return 'amber';                 // 주황 · 노랑
  if (deg < 195) return 'green';                // 초록 · 청록
  return 'blue';                                // 하늘 · 파랑 · 남색 · 보라
}
/* 아주 밝은 «물든 흰색»은 회색으로 밀지 않는다.
   ⚠ 회색축 가까이 있어도, 그 위에 같은 계열 «진한 글자»가 얹히는 자리가 많다.
     회색으로 밀면 글자와 가까워져 대비가 떨어진다 — rules.html 에서 실제로
     연하늘 바탕(#e0f2fe)이 회색이 되며 5.17 → 4.19 로 내려앉았다.
     그 계열의 «가장 밝은 칸»으로 보내면 뜻도 대비도 지킨다. */
function tintedWhite(h) {
  if (P.lum(h) < 0.75) return null;   // 연파랑 #dbe6fb(0.786)까지 든다
  const c = rgb(h);
  const m = (c[0] + c[1] + c[2]) / 3;
  const d = Math.sqrt(c.reduce((a, v) => a + (v - m) * (v - m), 0));
  /* ⚠ «눈에 띄게» 물든 것만 든다. 6 으로 뒀더니 거의 무채색인 #dfe4ef(11.6)·
     #eef2f7(6.3)까지 파랑으로 가서, 색을 줄이자는 일이 오히려 색을 더했다. */
  if (d < 15) return null;
  const [r, g, b] = c;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sp = mx - mn;
  if (!sp) return null;
  let deg;
  if (mx === r) deg = 60 * (((g - b) / sp) % 6);
  else if (mx === g) deg = 60 * ((b - r) / sp + 2);
  else deg = 60 * ((r - g) / sp + 4);
  deg = (deg + 360) % 360;
  const fam = deg < 20 || deg >= 320 ? 'red' : deg < 70 ? 'amber' : deg < 195 ? 'green' : 'blue';
  return P.PALETTE[fam][0];                     // 그 집안 가장 밝은 칸
}
/* 집안 안에서 «밝기가 가장 가까운» 칸. ② 밝기 차례를 지킨다 */
function fitIn(fam, h) {
  const want = P.lum(h);
  let best = null, gap = Infinity;
  P.PALETTE[fam].forEach(c => {
    const d = Math.abs(P.lum(c) - want);
    if (d < gap) { gap = d; best = c; }
  });
  return best;
}
function fit(h) {
  const n = P.norm(h);
  if (n === '#ffffff' || n === '#000000') return n;
  for (const fam of Object.keys(P.PALETTE)) if (P.PALETTE[fam].includes(n)) return n;
  const tw = tintedWhite(n);
  if (tw) return tw;
  return fitIn(familyOf(n), n);
}

/* ── id·선택자·주소로 쓰이는 이름은 색이 아니다 ──────────────────── */
function reservedNames(src) {
  const out = new Set();
  const add = re => { let m; while ((m = re.exec(src))) out.add(m[1].toLowerCase()); };
  add(/\bid\s*=\s*["']([A-Za-z0-9_-]+)["']/g);
  add(/getElementById\(\s*["']([A-Za-z0-9_-]+)["']/g);
  add(/querySelector(?:All)?\(\s*["']#([A-Za-z0-9_-]+)/g);
  add(/href\s*=\s*["']#([A-Za-z0-9_-]+)["']/g);
  /* ⚠ CSS 선택자(`#이름{`)까지 훑지 않는다. 그렇게 했더니 «진짜 색»을 이름으로
     착각해 지켜 버렸다 — #f97316·#eef3fb 처럼 글자로 시작하는 색이 «뒤에 빈칸이
     오는 자리»(그러데이션·여러 값)에서 선택자로 잡혔다(2026-08-30).
     id 는 위 네 자리(id=·getElementById·querySelector·href)에 반드시 나온다.
     안 나오는 id 는 아무도 안 쓰는 id 다. */
  return out;
}

/* ── 한 파일 옮기기 ─────────────────────────────────────────────── */
function run(file, opts) {
  const src = fs.readFileSync(file, 'utf8');
  const keep = new Set((opts.keep || []).map(P.norm));
  const reserved = reservedNames(src);
  const moved = new Map();     // 옛색 → 새색
  const counts = new Map();    // 옛색 → 몇 군데

  const out = src.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => {
    if (![4, 7, 9].includes(m.length)) return m;      // #rgba·이상한 길이는 안 건드린다
    const bare = m.slice(1).toLowerCase();
    if (reserved.has(bare)) return m;                 // ⚠ 색이 아니라 이름이다
    const n = P.norm(m);
    if (keep.has(n)) return m;                        // 일부러 남기기로 한 색
    const to = fit(n);
    counts.set(n, (counts.get(n) || 0) + 1);
    if (to === n) return m;
    /* ⚠ 짧은 꼴(#fff)은 짧은 채로 둔다 — 펴면 글자로 견주는 코드가 조용히 깨진다 */
    if (m.length === 4 && P.norm(m) === to) return m;
    moved.set(n, to);
    return m.length === 9 ? to + m.slice(7) : to;     // 투명도(마지막 두 글자)는 지킨다
  });

  const before = [...counts.keys()].length;
  const after = new Set([...counts.keys()].map(c => moved.get(c) || c)).size;
  return { src, out, moved, counts, before, after };
}

/* ── 부르기 ─────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) {
  console.error('쓰기: node scripts/palette-fit.js <파일> [--write] [--keep=#aaa,#bbb]');
  process.exit(2);
}
const write = args.includes('--write');
const keepArg = (args.find(a => a.startsWith('--keep=')) || '').slice(7);
const r = run(file, { keep: keepArg ? keepArg.split(',').filter(Boolean) : [] });

console.log(file + ' — 색 ' + r.before + '가지 → ' + r.after + '가지'
  + ' (옮길 색 ' + r.moved.size + '가지)');
[...r.moved.entries()]
  .sort((a, b) => (r.counts.get(b[0]) || 0) - (r.counts.get(a[0]) || 0))
  .forEach(([from, to]) => {
    console.log('  ' + from + ' → ' + to + '   ' + (r.counts.get(from) || 0) + '군데');
  });

if (write) {
  fs.writeFileSync(file, r.out);
  console.log('\n고쳤습니다.');
} else {
  console.log('\n(--write 를 붙이면 실제로 고칩니다)');
}
