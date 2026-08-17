/* 「지문 로그인이 안 나온다」 — 없던 게 아니라 «네이버 앱 안» 이라 안 됐다 (2026-08-15)

   ★ 대표 화면(스크린샷)에 네이버 앱 내부 브라우저 표시가 있었다.
     네이버·카카오톡 앱 «안» 브라우저에는 지문 기능(WebAuthn)이 아예 없다.
   ★ 그런데 우리는 단추를 «조용히 감췄다» — 그러면 「이 앱에서만 안 된다」가 아니라
     「기능이 없다」로 보인다. 안 보이는 까닭을 말해 주지 않으면 없는 것과 같다.
   고침: 왜 안 되는지 적고, 크롬으로 다시 여는 길을 준다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CLI = fs.readFileSync(path.join(ROOT, 'js', 'pu-passkey.js'), 'utf8').replace(/\r\n/g, '\n');
const PORTAL = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

function mk(ua, extra){
  const c = Object.assign({
    navigator: { userAgent: ua },
    location: { href: 'https://nabaho.github.io/pureunall/enter.html' }
  }, extra || {});
  c.window = c;
  vm.createContext(c);
  vm.runInContext(CLI.replace("typeof window !== 'undefined' ? window : globalThis", 'this'), c);
  return c;
}

console.log('\n[① 앱 «안» 브라우저를 가려낸다]');
t('★ 네이버 앱', mk('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile NAVER(inapp; search; 1000; 12.0.0)').PuPasskey.inApp(), true);
t('★ 카카오톡', mk('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile KAKAOTALK 10.0.0').PuPasskey.inApp(), true);
t('안드로이드 앱 속 화면(wv)', mk('Mozilla/5.0 (Linux; Android 13; wv) Chrome/120 Mobile Safari/537.36').PuPasskey.inApp(), true);
t('인스타그램', mk('Mozilla/5.0 (iPhone) Instagram 300.0').PuPasskey.inApp(), true);
t('라인', mk('Mozilla/5.0 (iPhone) Line/13.0.0').PuPasskey.inApp(), true);

console.log('\n[② 멀쩡한 브라우저를 앱 안이라고 하면 안 된다 — 헛안내가 뜬다]');
t('★ 그냥 크롬', mk('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36').PuPasskey.inApp(), false);
t('★ 아이폰 사파리', mk('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1').PuPasskey.inApp(), false);
t('PC 크롬', mk('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120 Safari/537.36').PuPasskey.inApp(), false);
t('삼성 브라우저', mk('Mozilla/5.0 (Linux; Android 13) SamsungBrowser/23.0 Chrome/115 Mobile Safari/537.36').PuPasskey.inApp(), false);

console.log('\n[③ 크롬으로 다시 여는 길]');
/* 안드로이드는 바로 넘어간다 */
const and = mk('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile NAVER(inapp)');
t('★ 안드로이드는 크롬으로 넘긴다', and.PuPasskey.openInChrome(), 'chrome');
t('★ 넘길 주소가 크롬을 콕 집는다', /^intent:\/\/nabaho\.github\.io\/pureunall\/enter\.html#Intent;scheme=https;package=com\.android\.chrome;end$/.test(and.location.href), true);
/* 아이폰은 그 길이 없다 — 주소를 복사해 준다 */
let copied = '';
const ios = mk('Mozilla/5.0 (iPhone) Instagram 300.0', {
  navigator: { userAgent:'Mozilla/5.0 (iPhone) Instagram 300.0',
               clipboard: { writeText: function(s){ copied = s; } } }
});
t('★ 아이폰은 주소를 복사해 준다', ios.PuPasskey.openInChrome(), 'copied');
t('복사한 주소', copied, 'https://nabaho.github.io/pureunall/enter.html');
/* 복사도 막힌 브라우저가 있다 — 그때는 주소를 글로 보여 준다 */
t('★ 복사도 막히면 그렇게 알린다',
  mk('Mozilla/5.0 (iPhone) Instagram 300.0').PuPasskey.openInChrome(), 'manual');

/* ⚠ [④][⑤] 화면 갈래 검사를 걷어냈다 (2026-08-16 대표 지시).
     대표: "우선 크롬으로 하는 건 중단해 달라. 추후에 다른 직원들과 논의하여 정리한다."
     앱 안 브라우저에서 「크롬에서 열기」를 권하던 갈래가 «결정으로» 사라졌다 —
     코드가 틀려서가 아니라 정책이 바뀌어서다.

   ★ 여기 남은 것은 «부품» 검사다 — inApp() 판별과 openInChrome() 은 그대로 살아 있다.
     다시 켤 때 새로 만들 필요가 없다.
   ★ 지금의 화면 규칙(휴대폰에서만 뜬다)은 tests/passkey-phone-only.test.js 가 지킨다.
     거기서는 코드 «모양» 을 못 박지 않고 함수를 실제로 돌려 어느 기기에서 뜨는지 본다. */
console.log('\n[④ 다시 켤 때 쓸 부품은 남겨 둔다]');
t('크롬으로 여는 부품이 살아 있다',
  typeof mk('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile NAVER(inapp)').PuPasskey.openInChrome, 'function');

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
