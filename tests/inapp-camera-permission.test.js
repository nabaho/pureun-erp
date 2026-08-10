/* 앱 안 브라우저에서 카메라 권한 창이 계속 뜨던 것
   (2026-08-10) 대표 제보: "카메라 누르면 계속 이 문구 나온다 안나오게 해라"
   — 「'nabaho.github.io'에서 카메라를 사용하려고 합니다. 허용하시겠습니까?」

   까닭: 네이버·카카오톡 안 브라우저는 카메라 허락을 «기억하지 않는다».
   그래서 화면 안 카메라(getUserMedia)를 쓰면 누를 때마다 그 창이 뜬다.
   ★ 그 창은 브라우저가 띄우는 것이라 우리가 없앨 수 없다 —
     «카메라 API 를 아예 안 부르는 것» 만이 답이다.
   폰 기본 카메라(<input capture>)는 허락을 묻지 않고, 앱 안 브라우저에서는 그림도 더 선명하다. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

const OPEN = src.slice(src.indexOf('async function openCam()'), src.indexOf('camTrack = camStream.getVideoTracks()'));

console.log('\n[① 앱 안 브라우저면 카메라 API 를 아예 안 부른다]');
t('openCam 구역을 잘라냈다', OPEN.length > 500, true);
t('★ 앱 안 브라우저면 곧바로 되돌아간다 (그 아래 getUserMedia 에 닿지 않는다)',
  /if \(inAppBrowser\(\)\) \{[\s\S]*?return;\n  \}/.test(OPEN), true);
/* 갈림길보다 «앞» 에서 막아야 뜻이 있다 — 뒤에 있으면 이미 권한 창이 뜬 뒤다 */
t('★ 막는 자리가 getUserMedia 보다 앞에 있다',
  OPEN.indexOf('if (inAppBrowser())') < OPEN.indexOf('getUserMedia'), true);
t('★ 빠른촬영만 빼놓지 않는다 (그 길로 들어오면 권한 창이 다시 뜬다)',
  /inAppBrowser\(\) && !camQuickMode/.test(src), false);

console.log('\n[② 폰 기본 카메라로 보낸다 — 허락을 묻지 않는 길]');
t('폰 카메라를 연다', /\$\('camInput'\)\.click\(\);/.test(OPEN), true);
t('그 칸은 폰 카메라를 부르는 칸이다',
  /id="camInput" accept="image\/\*" capture="environment"/.test(src), true);

console.log('\n[③ 안내는 한 번만 — 누를 때마다 뜨면 그것도 성가시다]');
t('한 번 알렸는지 기억한다', /let _inAppCamTold = false;/.test(src), true);
t('알린 뒤 표시를 세운다', /_inAppCamTold = true;/.test(src), true);
t('표시가 서 있으면 다시 안 알린다', /if \(!_inAppCamTold\) \{/.test(OPEN), true);

console.log('\n[④ 저절로 안 열렸을 때 누를 자리를 남긴다]');
/* 손가락으로 «지금 막» 누른 것이 아니면 브라우저가 파일 고르기를 무시한다.
   포털 카메라 단추로 들어오면 화면이 새로 뜬 뒤라 그 자격이 사라진다 —
   그때 아무 자리도 없으면 «아무 일도 안 일어난 것» 처럼 보인다. */
t('★ 물러설 화면을 그린다', /_inAppFallbackUI\(\);/.test(OPEN), true);
t('큰 단추가 있다', /id="camInAppGo"/.test(src), true);
t('그 단추가 폰 카메라를 연다', /getElementById\('camInAppGo'\)\.onclick = function \(\) \{ \$\('camInput'\)\.click\(\); \};/.test(src), true);
t('사진첩으로 돌아갈 길도 있다 (갇히면 안 된다)', /id="camInAppBack"/.test(src), true);
t('왜 폰 카메라를 쓰는지 적는다', /더 선명하고, 카메라 허락을 묻지 않습니다/.test(src), true);
t('사진을 받아 오면 스스로 사라진다', /inp\.addEventListener\('change', function \(\) \{[\s\S]{0,140}?camInAppBox[\s\S]{0,80}?display = 'none'/.test(src), true);
t('상자를 다시 만들지 않는다 (누를 때마다 쌓이면 안 된다)', /let box = document\.getElementById\('camInAppBox'\);\n  if \(!box\) \{/.test(src), true);

console.log('\n[⑤ 「화면이 DB 에 직접 쓰나」 검사를 무디게 만들지 않는다]');
/* 그 검사는 .remove( 라는 글자를 본다. 화면 상자를 지울 때 그 글자를 쓰면
   검사가 엉뚱한 곳에서 걸려, 결국 검사를 느슨하게 고치게 된다 — 그러면 진짜 사고를 못 막는다. */
t('★ 화면 상자는 지우지 않고 감춘다', /const b = document\.getElementById\('camInAppBox'\);\n      if \(b\) b\.style\.display = 'none';/.test(src), true);
t('돌아가기도 감추기로', /box\.style\.display = 'none';\n      if \(!camGoBack\(\)\)/.test(src), true);

console.log('\n[⑥ 앱 밖 브라우저는 그대로 — 연속촬영을 잃지 않는다]');
t('크롬·삼성인터넷에서는 화면 안 카메라를 연다', /navigator\.mediaDevices\.getUserMedia/.test(OPEN), true);
t('앱 안 브라우저 목록은 그대로 (네이버·카카오톡 등)',
  ['NAVER', 'KAKAOTALK', 'Instagram', 'FBAN', 'FBAV', 'Line'].every(function(n){ return src.indexOf(n) >= 0; }), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
