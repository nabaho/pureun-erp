/* 여러 화면이 함께 쓰는 .js 는 ?v= 를 달고 부른다
   (대표 제보 2026-08-23 「왜 안 없어지나」 — 고쳤는데 화면이 안 바뀌던 일)

   ★ 무슨 일이 있었나
     pu-health.js 를 고쳐 배포했는데 화면은 그대로였다. 18개 화면이 모두
     `<script src="js/pu-health.js">` 처럼 «?v= 없이» 부르고 있어, 브라우저가
     캐시에 둔 옛 파일을 계속 썼다.
     scripts/check-cache-version.js 가 이런 실수를 잡아 주지만, 그 검사는
     «?v= 가 이미 붙어 있는» 참조만 본다 — 처음부터 안 붙인 파일은 통째로
     눈 밖이었다. 그래서 이 검사가 «붙어 있는지» 를 따로 지킨다.

   ★ 지키려는 것: 공용 .js 는 어느 화면에서 부르든 ?v= 가 붙어 있다.
     번호가 몇인지는 안 본다(그건 check-cache-version.js 몫). */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 여러 화면이 함께 쓰는 파일들 — 한 곳을 고치면 여러 화면이 함께 바뀐다.
   이런 파일일수록 캐시에 묻히면 「어디는 되고 어디는 안 되는」 상태가 된다. */
const SHARED = ['pu-health.js'];

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

function htmlFiles(dir, out){
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e){
    if(e.name === 'node_modules' || e.name === '.git') return;
    var p = path.join(dir, e.name);
    if(e.isDirectory()) htmlFiles(p, out);
    else if(e.name.endsWith('.html')) out.push(p);
  });
  return out;
}

const pages = htmlFiles(ROOT);
console.log('\n[공용 .js 는 ?v= 를 달고 부른다] — html ' + pages.length + '개를 훑는다');

SHARED.forEach(function(js){
  /* src="js/파일.js" 또는 src="../js/파일.js" 로 부르면서 ?v= 가 없는 곳 */
  const bare = new RegExp('src="(?:\\.\\./)?js/' + js.replace('.', '\\.') + '"', 'g');
  const bad = [];
  pages.forEach(function(p){
    const s = fs.readFileSync(p, 'utf8');
    if(bare.test(s)) bad.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    bare.lastIndex = 0;
  });
  ok('★ ' + js + ' 를 ?v= 없이 부르는 화면이 없다', bad.length === 0,
     bad.length ? ('붙여 주세요 — 안 붙이면 고쳐도 옛 파일이 그대로 쓰입니다:\n      ' + bad.join('\n      ')) : '');

  // 한 군데라도 실제로 부르고 있어야 이 검사가 뜻을 갖는다(파일명이 바뀌면 알려 준다)
  const withV = new RegExp('src="(?:\\.\\./)?js/' + js.replace('.', '\\.') + '\\?v=\\d+"');
  const used = pages.some(function(p){ return withV.test(fs.readFileSync(p, 'utf8')); });
  ok(js + ' 를 부르는 화면이 실제로 있다 (이름이 바뀌면 알려 준다)', used);
});

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
