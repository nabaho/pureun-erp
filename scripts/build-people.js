/* 구성원 쪽을 «자료로» 그린다 — 명령줄에서.
   ═══════════════════════════════════════════════════════════════════════════
   그리는 «몸통»은 js/pu-site-people.js 에 있다. 화면(푸른ERP)도 같은 부품을 쓴다 —
   두 벌로 베껴 쓰면 화면에서 미리 본 것과 실제로 올라가는 것이 갈라진다.

   쓰는 법
     node scripts/build-people.js                 (지금 쪽에서 읽어 → 다시 그리기: 확인용)
     node scripts/build-people.js --data 사람.json (자료로 그리기)

   자료 모양: [{ srl, 이름, 직책1, 직책2, 사진, 경력: [...] }, …] */
'use strict';
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'site', 'people', 'index.html');
const box = {};
new Function('window', 'globalThis', fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-site-people.js'), 'utf8'))(box, box);
const P = box.PuSitePeople;

module.exports = P;

/* ── 손으로 돌릴 때 ── */
if (require.main === module) {
  const html = fs.readFileSync(PAGE, 'utf8');
  const i = process.argv.indexOf('--data');
  const 사람들 = i > 0 ? JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')) : P.사람읽기(html);
  const 새쪽 = P.쪽그리기(html, 사람들);
  fs.writeFileSync(PAGE, 새쪽, 'utf8');
  console.log('구성원 ' + 사람들.length + '명으로 다시 그렸습니다 → ' + PAGE);
  사람들.forEach(p => console.log('  · ' + p.이름 + (p.직책1 ? ' ' + p.직책1 : '')
    + ' · ' + p.직책2 + ' · 경력 ' + p.경력.length + '줄'));
}
