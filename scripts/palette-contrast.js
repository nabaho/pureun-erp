#!/usr/bin/env node
/* 색을 옮긴 뒤 «글자가 덜 읽히게» 된 자리를 찾는다 (대표 지시 2026-08-30)
 * ═══════════════════════════════════════════════════════════════════════════
 * 팔레트로 옮기는 일은 밝기를 조금씩 흔든다. 대개는 괜찮지만, 「연한 바탕 + 진한
 * 글자」 짝에서 둘이 서로 가까워지면 글자가 묻힌다 — 그리고 그것은 «옮긴 사람»만
 * 모른다. 옮기기 전후를 재어 나빠진 자리만 집어낸다.
 *
 * ⚠ <style> 안만 본다. 파일 전체에서 {…} 를 찾으면 자바스크립트 덩이가 규칙으로
 *   잡혀 상관없는 바탕·글자가 짝이 된다(2026-08-30 에 실제로 그랬다).
 *
 * 쓰기:  node scripts/palette-contrast.js <옮기기전파일> <옮긴뒤파일>
 *        git show origin/main:파일 > /tmp/before.html  처럼 만들어 넘긴다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'tests', 'lib-palette.js'));

const AA = 4.5;      // 사람이 읽을 만한 최소 (WCAG AA 본문)
const AA_BIG = 3.0;  // 큰 글자·테두리는 이만큼

/* <style> 덩이 안의 규칙만 꺼낸다 */
function rules(src) {
  const out = [];
  const styles = src.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  styles.forEach(block => {
    const css = block.replace(/<style[^>]*>/, '').replace(/<\/style>$/, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    let m;
    const re = /([^{}]+)\{([^{}]*)\}/g;
    while ((m = re.exec(css))) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      const body = m[2];
      const bg = P.colorOf(body, 'background') || P.colorOf(body, 'background-color');
      const fg = P.colorOf(body, 'color');
      if (bg && fg) out.push({ sel, bg, fg });
    }
  });
  return out;
}

function report(beforeFile, afterFile) {
  const A = rules(fs.readFileSync(beforeFile, 'utf8'));
  const B = rules(fs.readFileSync(afterFile, 'utf8'));
  const byS = new Map();
  A.forEach(r => { if (!byS.has(r.sel)) byS.set(r.sel, r); });

  const worse = [], stillBad = [], fixed = [];
  B.forEach(r => {
    const a = byS.get(r.sel);
    const now = P.contrast(r.bg, r.fg);
    if (!a) { if (now < AA_BIG) stillBad.push({ sel: r.sel, now, was: null, r }); return; }
    const was = P.contrast(a.bg, a.fg);
    /* 나빠졌고, 그래서 «읽을 만한 선» 밑으로 내려간 자리만 든다 —
       6.0 → 5.2 처럼 아직 넉넉한 것까지 들면 진짜 문제가 묻힌다. */
    if (now < was - 0.05 && now < AA) worse.push({ sel: r.sel, was, now, a, r });
    else if (now < AA_BIG && was < AA_BIG) stillBad.push({ sel: r.sel, now, was, r });
    else if (was < AA_BIG && now >= AA_BIG) fixed.push({ sel: r.sel, was, now });
  });

  console.log('규칙 ' + B.length + '개(바탕·글자 짝이 있는 것)를 쟀습니다.\n');
  if (worse.length) {
    console.log('★ 내가 «나쁘게 만든» 자리 ' + worse.length + '곳 — 되살려야 합니다');
    worse.forEach(w => console.log('  ' + w.sel.slice(0, 60).padEnd(62)
      + w.was.toFixed(2) + ' → ' + w.now.toFixed(2)
      + '   ' + w.a.bg + '/' + w.a.fg + ' → ' + w.r.bg + '/' + w.r.fg));
  } else {
    console.log('✔ 내가 나쁘게 만든 자리 없음');
  }
  if (fixed.length) {
    console.log('\n덤으로 나아진 자리 ' + fixed.length + '곳');
    fixed.slice(0, 8).forEach(f => console.log('  ' + f.sel.slice(0, 50).padEnd(52)
      + f.was.toFixed(2) + ' → ' + f.now.toFixed(2)));
  }
  if (stillBad.length) {
    console.log('\n(원래부터 안 읽히던 자리 ' + stillBad.length + '곳 — 이번 일과 별개)');
    stillBad.slice(0, 8).forEach(s => console.log('  ' + s.sel.slice(0, 50).padEnd(52)
      + s.now.toFixed(2)));
  }
  return worse.length;
}

const [b, a] = process.argv.slice(2);
if (!b || !a) {
  console.error('쓰기: node scripts/palette-contrast.js <옮기기전> <옮긴뒤>');
  process.exit(2);
}
process.exit(report(b, a) ? 1 : 0);
