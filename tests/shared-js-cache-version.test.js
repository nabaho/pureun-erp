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

/* ★ 이름을 하나씩 적어 두지 않는다 — js/ 에 새 파일이 생기면 또 눈 밖이 된다.
   «html 이 부르는 js/ 파일 전부» 를 훑어, ?v= 안 붙은 것을 잡는다.
   (처음에는 pu-health.js 하나만 적어 두었는데, 그러면 나머지 13개가 그대로
    빠져 있었다 — 실제로 pu-appbar.js 는 11개 화면에만 붙고 급여데이터함
    한 곳만 빠져, 그 화면만 옛 앱바를 쓰고 있었다.) */

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

/* 화면마다 js/ 를 어떻게 부르는지 모은다 — 붙은 것과 안 붙은 것을 함께 센다. */
const bare = [];              // ?v= 없이 부르는 곳
const vers = {};              // 파일 → 쓰이는 번호들
pages.forEach(function(p){
  const s = fs.readFileSync(p, 'utf8');
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  const re = /src="(?:\.\.\/)?js\/([\w.-]+\.js)(\?v=(\d+))?"/g;
  let m;
  while((m = re.exec(s))){
    if(m[2]){ (vers[m[1]] = vers[m[1]] || new Set()).add(m[3]); }
    else bare.push(rel + ' → ' + m[1]);
  }
});

ok('★ js/ 파일을 ?v= 없이 부르는 화면이 없다', bare.length === 0,
   bare.length
     ? ('붙여 주세요 — 안 붙이면 고쳐도 브라우저가 옛 파일을 그대로 씁니다:\n      '
        + bare.join('\n      '))
     : '');

/* ★ 한 파일이 화면마다 «다른 번호» 로 불리면, 그 화면들은 서로 다른 파일을 본다.
   실제로 pu-appbar.js 가 11개 화면에서 ?v=4, 한 화면에서는 번호 없이 불려
   그 화면만 옛 앱바를 쓰고 있었다(2026-08-23). 번호는 파일마다 하나여야 한다. */
const split = Object.keys(vers).filter(function(f){ return vers[f].size > 1; })
  .map(function(f){ return f + ' → ?v=' + Array.from(vers[f]).sort().join(', ?v='); });
ok('★ 같은 파일을 화면마다 다른 번호로 부르지 않는다', split.length === 0,
   split.length ? ('번호를 하나로 맞춰 주세요:\n      ' + split.join('\n      ')) : '');

// 훑을 것이 실제로 있어야 이 검사가 뜻을 갖는다(경로 규칙이 바뀌면 알려 준다)
ok('js/ 를 부르는 화면을 실제로 찾았다 (경로 규칙이 바뀌면 알려 준다)',
   Object.keys(vers).length > 0);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
