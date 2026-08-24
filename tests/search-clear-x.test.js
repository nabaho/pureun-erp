/* 검색창에는 「지우기 ⓧ」 가 있다 (대표 지시 2026-08-23, A안)

   ★ 무슨 일이 있었나
     검색창 33개 가운데 28개는 지우기 단추가 아예 없었다. 긴 검색어를 지우려면
     글자를 하나씩 다 지워야 했다. 있던 5개도 모양이 갈려 있었다
     (× 와 ✕, span 과 button, 오른쪽 5px 와 6px).

   ★ 고른 방법 (A안)
     입력칸을 type="search" 로 두면 브라우저가 «칸 안쪽에» 지우기 단추를 그려 준다.
     우리가 자리를 잡지 않으므로 줄이 밀릴 일이 없고, 값이 비면 저절로 사라진다.
     모양만 css/pu-erp.css 에서 우리 회색으로 맞춘다.
     ⚠ B안(우리가 직접 그리기)은 24곳 가운데 22곳에 «감쌀 상자» 를 새로 만들어야 해서
       접었다 — 자리를 새로 잡는 곳마다 줄이 밀릴 여지가 생긴다.

   ★ 지키려는 것
     ① 검색창이면 빠짐없이 type="search" 다 (새로 만든 것도 잡는다)
     ② 손으로 그린 지우기 ✕ 를 다시 만들지 않는다 (두 개가 뜬다)
     ③ 모양 규칙이 css 에 있고, 그 css 를 ?v= 를 달고 부른다 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(ROOT, 'css', 'pu-erp.css'), 'utf8').replace(/\r\n/g, '\n');
const L = html.split('\n');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

/* 검색창인지는 «안내 문구»로 가린다 — 이름을 하나씩 적어 두면 새 검색창이 눈 밖이 된다 */
const SEARCHY = /검색|찾기|찾을|Ctrl\+K/;

/* h('input' … ) 하나를 통째로 떠 온다 (따옴표 안의 괄호는 안 센다) */
function inputAt(from){
  let depth = 0, i = html.indexOf('(', from);
  const open = i;
  for(; i < html.length; i++){
    const c = html[i];
    if(c === '(') depth++;
    else if(c === ')'){ depth--; if(depth === 0) return html.slice(open, i + 1); }
    else if(c === "'" || c === '"'){
      const q = c; i++;
      while(i < html.length && html[i] !== q){ if(html[i] === '\\') i++; i++; }
    }
  }
  return '';
}

const boxes = [];
let cur = 0;
while(true){
  const p = html.indexOf("h('input'", cur);
  if(p < 0) break;
  const el = inputAt(p);
  const ph = el.match(/placeholder:\s*'([^']*)'/);
  if(ph && SEARCHY.test(ph[1])){
    boxes.push({ ph: ph[1], search: /type:\s*'search'/.test(el), line: html.slice(0, p).split('\n').length });
  }
  cur = p + Math.max(9, el.length);
}

console.log('\n[① 검색창은 빠짐없이 type="search"]');
ok('검색창을 실제로 찾았다 (찾는 규칙이 바뀌면 알려 준다)', boxes.length >= 30,
   '찾은 개수: ' + boxes.length);
const missing = boxes.filter(b => !b.search);
ok('★ 모든 검색창이 type="search" 다 — ' + boxes.length + '개', missing.length === 0,
   missing.length ? ('빠진 곳:\n      ' + missing.map(b => '줄 ' + b.line + '  ' + b.ph).join('\n      ')) : '');

console.log('\n[② 손으로 그린 ✕ 를 다시 만들지 않는다]');
/* 브라우저가 칸 «안»에 그려 주므로, 우리가 또 그리면 X 가 두 개 뜬다 */
const dupes = [];
L.forEach(function(l, i){
  const m = l.match(/placeholder:'([^']*)'/);
  if(!m || !SEARCHY.test(m[1])) return;
  const near = L.slice(Math.max(0, i - 6), i + 10).join('\n');
  if(/onClick:\s*function\(\)\s*\{\s*set[A-Za-z]*\(''\)/.test(near) && /,\s*'(×|✕)'\)/.test(near)){
    dupes.push('줄 ' + (i + 1) + '  ' + m[1]);
  }
});
ok('★ 검색창 옆에 손으로 그린 지우기 X 가 없다', dupes.length === 0,
   dupes.length ? ('X 가 두 개 뜹니다:\n      ' + dupes.join('\n      ')) : '');

console.log('\n[③ 모양은 css 한 곳에서]');
ok('★ 지우기 단추 모양 규칙이 있다', /::-webkit-search-cancel-button/.test(css));
ok('브라우저 기본 모양을 끄고 우리 그림을 쓴다',
   /::-webkit-search-cancel-button\s*\{[\s\S]{0,400}?appearance:\s*none/.test(css)
   && /::-webkit-search-cancel-button\s*\{[\s\S]{0,400}?background:[^;]*svg/.test(css));
/* 폰에서 15px 은 손가락으로 누르기 어렵다 — 크기만 키운다(값은 안 못 박는다) */
ok('손가락으로 누르는 화면에서는 더 크게',
   /@media \(pointer:\s*coarse\)[\s\S]{0,300}?search-cancel-button/.test(css));

console.log('\n[④ 고치면 화면에 반영된다]');
/* css 도 js 와 똑같다 — ?v= 를 안 달면 브라우저가 옛 파일을 계속 쓴다.
   실제로 js 에서 겪었다(2026-08-23, pu-health.js). */
ok('★ css 를 ?v= 를 달고 부른다', /href="css\/pu-erp\.css\?v=\d+"/.test(html),
   '안 달면 모양을 고쳐도 브라우저가 옛 css 를 씁니다');

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
