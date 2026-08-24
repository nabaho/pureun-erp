/* data-tip 말풍선 툴팁이 실제로 뜨는 장치가 살아 있는지 고정한다.
   ★ 배경: 한때 "이 파일엔 data-tip 을 그리는 CSS 가 없다"는 잘못된 주석/테스트가
     있었다 — 실은 css/pu-erp.css 에 .erp-tip:hover::after{content:attr(data-tip)}
     규칙이 있고 브라우저에서 실제로 뜬다(확인됨). 문구가 아니라 «규칙(구조)»만 본다:
     ① CSS 에 erp-tip 호버 규칙이 있다, ② pu-erp.html 이 그 CSS 를 불러온다,
     ③ data-tip 속성을 쓰는 자리는 전부 erp-tip 클래스를 같이 쓴다(짝이 안 맞으면
       아무것도 안 뜬다). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'pu-erp.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('\n[① css/pu-erp.css 에 erp-tip 호버 → attr(data-tip) 규칙이 있다]');
// 정확한 값(색·크기 등)이 아니라 "이 구조"만 고정한다: 문구가 바뀌어도 이 테스트는 안 깨진다.
ok('.erp-tip:hover::after 규칙이 content:attr(data-tip) 를 그린다',
   /\.erp-tip:hover::after\s*\{[^}]*content\s*:\s*attr\(data-tip\)/.test(css));
ok('.erp-tip 에 position 이 있다 (풍선 절대배치 기준점)',
   /\.erp-tip\s*\{[^}]*position\s*:\s*relative/.test(css));

console.log('\n[② pu-erp.html 이 그 CSS 를 실제로 불러온다]');
/* ★ 캐시 번호(?v=)가 붙어도 통과해야 한다 — 붙이는 것이 «옳은 고침» 이다.
   (2026-08-23: css 에 ?v= 를 달자 이 검사가 깨졌다. 같은 실수를 js 에서도 했다) */
ok('css/pu-erp.css 를 불러온다 (캐시 번호가 붙어 있어도 된다)',
   /<link[^>]+href=["']css\/pu-erp\.css(\?v=\d+)?["'][^>]*>/.test(html));

console.log('\n[③ data-tip 을 쓰는 자리는 전부 erp-tip 클래스와 짝을 이룬다]');
/* 실제 속성 사용만 잡는다 — 'data-tip': 또는 data-tip: 처럼 콜론이 바로 따라와야
   진짜 속성이고, 설명하는 주석 문장(콜론 없이 "data-tip 은 ~다")은 걸리지 않는다. */
const attrRe = /'data-tip'\s*:|(?<!['"])\bdata-tip\s*:/g;
let m, sites = 0, unpaired = [];
while ((m = attrRe.exec(html))) {
  sites++;
  const winStart = Math.max(0, m.index - 400);
  const window = html.slice(winStart, m.index);
  if (window.indexOf('erp-tip') < 0) {
    const line = html.slice(0, m.index).split('\n').length;
    unpaired.push(line);
  }
}
ok('data-tip 속성 사용 자리를 찾았다 (0곳이면 탐지 정규식이 깨진 것)', sites > 0, sites + '곳');
ok('모든 data-tip 자리가 erp-tip 클래스와 짝을 이룬다',
   unpaired.length === 0, unpaired.length + '곳 짝이 안 맞음 (줄: ' + unpaired.join(', ') + ')');

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
