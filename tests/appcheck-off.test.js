/* App Check — 켜는 화면과 안 켜는 화면이 갈려 있으면 안 된다 (대표 지시 2026-08-28 「걷어냄」)

   ★ 무슨 일이 있었나
     직원용 16화면 가운데 11곳만 App Check 를 켜고 5곳(포털 포함)은 안 켜고 있었다.
     그런데 «안 켠 화면도 멀쩡히 돌아간다» — 콘솔에서 강제(enforce)가 꺼져 있다는 뜻이다.
     즉 켜 둔 11곳도 지키는 것 없이 reCAPTCHA 실패만 만들고 있었다.
     푸른이알피는 2026-08-08 에 「20~30초짜리 실패만 두 번」이라며 이미 껐고,
     기업정보함도 뒤따라 껐다 — 그 방식으로 나머지도 통일한다.

   ★ 지키려는 것
     ① 켜는 화면이 하나도 없다 (반쯤 켜 둔 상태로 되돌아가지 않는다)
     ② 끄는 방식이 «한 가지» 다 — FB_APPCHECK_ON 이라는 같은 스위치
     ③ 스위치가 «쓰이기 전에» 선언돼 있다 (없으면 그 화면이 그 자리에서 죽는다)
     ④ 왜 껐는지·어떻게 되돌리는지가 적혀 있다 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

const users = [];
files.forEach(function (f) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  if (s.indexOf('firebase.appCheck().activate(') < 0) return;
  users.push({ f: f, s: s });
});

ok('App Check 를 쓰는 화면을 찾았다', users.length >= 9, '찾은 수: ' + users.length);

console.log('\n[① 막지 않고 켜는 곳이 없다]');
/* 막는 방법이 둘이다 — 바로 앞에 붙이거나(FB_APPCHECK_ON && …),
   바깥 if 로 감싸거나(if(FB_APPCHECK_ON && …){ … activate … }).
   둘 다 옳다. 그러니 «켜는 자리마다 그 앞에 스위치가 있는가» 로 본다. */
const ungated = [];
users.forEach(function (u) {
  let i = -1;
  while ((i = u.s.indexOf('firebase.appCheck().activate(', i + 1)) >= 0) {
    const before = u.s.slice(Math.max(0, i - 220), i);
    if (before.indexOf('FB_APPCHECK_ON') < 0) ungated.push(u.f + ':' + i);
  }
});
ok('★ 스위치 없이 켜는 자리가 없다', ungated.length === 0, ungated.join(', '));

console.log('\n[② 끄는 방식이 한 가지다]');
users.forEach(function (u) {
  ok(u.f.padEnd(20) + ' 스위치가 꺼져 있다', /FB_APPCHECK_ON\s*=\s*false/.test(u.s),
     'true 로 되돌리려면 콘솔에서 강제를 먼저 켜야 한다');
});

console.log('\n[③ 스위치가 쓰이기 전에 선언돼 있다]');
users.forEach(function (u) {
  const decl = u.s.search(/(?:var|const|let)\s+FB_APPCHECK_ON\s*=/);
  const use = u.s.indexOf('firebase.appCheck().activate(');
  ok(u.f.padEnd(20) + ' 선언이 먼저 온다', decl >= 0 && (use < 0 || decl < use),
     '선언 ' + decl + ' · 쓰임 ' + use + ' — 뒤에 있으면 그 화면이 그 자리에서 죽는다');
});

console.log('\n[④ 왜 껐는지가 적혀 있다]');
const noted = users.filter(function (u) { return /강제|enforce/.test(u.s); });
ok('되돌리는 법이 적힌 화면이 대부분이다', noted.length >= users.length - 1,
   '적힌 곳 ' + noted.length + ' / ' + users.length + ' — 다음 사람이 왜 껐는지 알아야 한다');

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
