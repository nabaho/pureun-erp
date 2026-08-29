/* 로그아웃 화면 — 푸른 통합 안의 모든 프로그램이 같은 화면을 쓴다 (대표 지시 2026-08-28)

   ★ 무슨 일이 있었나
     로그인이 풀렸을 때 나오는 화면이 17개 중 «2개만» 제대로였다.
     나머지는 흰 바탕에 「로그인이 필요합니다」 한 줄이거나 아예 아무것도 없었다.
     같은 회사 시스템으로 보이지 않았고, 어디를 눌러야 돌아가는지도 화면마다 달랐다.

   ★ 지키려는 것
     ① 공용 화면(js/pu-gate.js)이 있고, 프로그램마다 제 이름을 넣어 부른다
     ② 옛 「맨 글자」 화면으로 되돌아가지 않는다
     ③ 통합 포털에는 넣지 않는다 — 거기가 로그인하는 곳이다
     ④ 고객·근로자가 여는 화면에도 넣지 않는다 — 그분들에겐 우리 계정이 없다
     ⑤ 공용 파일이 «부르는 화면의 CSS 초기화»에 기대지 않는다
        (실제로 재 보니 초기화가 없는 화면에서 카드가 360 이 아니라 408 이 됐다)
     ⑥ 부르는 화면은 그 파일을 실제로 싣는다 (안 실으면 그 자리에서 죽는다) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const gate = fs.readFileSync(path.join(ROOT, 'js', 'pu-gate.js'), 'utf8').split('\r\n').join('\n');

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

/* 공용 화면을 쓰기로 한 프로그램들 */
const USERS = ['fund.html', 'fund-poc.html', 'pu-home.html', 'pu-paydata.html', 'work.html'];
/* 넣으면 «안 되는» 화면 */
const NEVER = {
  'enter.html': '통합 포털 — 여기가 로그인하는 곳이다',
  'sign.html': '고객이 여는 화면 — 우리 포털 계정이 없다',
  'ieum-view.html': '근로자가 여는 화면 — 우리 포털 계정이 없다'
};

console.log('[① 공용 화면이 있다]');
ok('PuGate.show / hide 가 있다', /show: function \(opts\)/.test(gate) && /hide: function \(\)/.test(gate));
ok('포털로 가는 단추가 있다', /포털에서 로그인 →/.test(gate));
ok('프로그램 이름을 넣을 수 있다', /opts\.name/.test(gate) && /opts\.desc/.test(gate));
ok('이름을 안 주면 화면 제목에서 가져온다', /d\.title/.test(gate),
   '이름을 빠뜨려도 「푸른노무법인」 만 덩그러니 뜨지 않게');
ok('넣는 글자를 막는다', /replace\(\/"\/g, '&quot;'\)/.test(gate),
   '프로그램 이름에 따옴표가 들어가면 카드가 깨진다');

console.log('\n[⑤ 부르는 화면의 CSS 에 기대지 않는다]');
ok('box-sizing 을 스스로 못 박는다', /box-sizing:border-box/.test(gate),
   '안 박으면 초기화 없는 화면에서 카드가 360 이 아니라 408 이 된다 — 재 보고 잡았다');
ok('글꼴도 스스로 정한다', /font-family:"Noto Sans KR"/.test(gate));
ok('맨 위에 뜬다', /z-index:2147483600/.test(gate),
   '다른 창 밑에 깔리면 안 보인다');
ok('처음 뜨는 splash 를 치운다', /pu-boot-splash/.test(gate),
   '겹치면 둘 다 안 보인다');

console.log('\n[⑥ 부르는 화면이 실제로 싣는다]');
USERS.forEach(function (f) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(f.padEnd(18) + ' 공용 파일을 싣는다', /<script src="js\/pu-gate\.js/.test(s),
     '안 실으면 PuGate 가 없어 그 자리에서 죽는다');
  ok(f.padEnd(18) + ' 공용 화면을 부른다', /PuGate\.show\(/.test(s));
});

console.log('\n[② 옛 「맨 글자」 화면이 안 남아 있다]');
USERS.forEach(function (f) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(f.padEnd(18) + ' 옛 화면이 없다',
     !/<div class="gate"><h2>로그인이 필요합니다<\/h2>/.test(s) &&
     !/\$\('gate'\)\.textContent = '포털\(enter\.html\)에서 로그인해 주세요\.'/.test(s),
     '한 화면이라도 남으면 거기만 다른 화면이 뜬다');
});

console.log('\n[③④ 넣으면 안 되는 화면]');
Object.keys(NEVER).forEach(function (f) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  ok(f.padEnd(18) + ' 에는 안 넣는다', s.indexOf('PuGate.show(') < 0, NEVER[f]);
});

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
