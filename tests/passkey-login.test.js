/* 지문·간편 로그인(패스키) (2026-08-15 대표 지시 — 도메인은 나바호로 확정)

   ★ 지문·얼굴은 «휴대폰 안에서만» 확인된다. 우리 서버로 오는 것은 지문이 아니라
     「이 기기가 맞다」는 서명뿐이다 — 우리는 지문을 저장하지도 보지도 못한다.
   ★ 그 서명이 진짜인지는 «서버가» 따진다. 화면이 「맞다고 했어요」를 믿으면
     누구나 그 말만 흉내내어 남의 계정으로 들어온다.

   이 검사는 «로그인 문» 을 지키는 규칙이 그대로 있는지를 못 박는다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRV = fs.readFileSync(path.join(ROOT, 'functions', 'passkey.js'), 'utf8').replace(/\r\n/g, '\n');
const CLI = fs.readFileSync(path.join(ROOT, 'js', 'pu-passkey.js'), 'utf8').replace(/\r\n/g, '\n');
const PORTAL = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

console.log('\n[① 주소가 한 곳으로 맞아 있다 — 어긋나면 등록한 지문이 통째로 무효가 된다]');
t('★ 서버가 보는 주소', /const RP_ID = "nabaho\.github\.io";/.test(SRV), true);
t('★ 서버가 받아 주는 출처', /const ORIGIN = "https:\/\/nabaho\.github\.io";/.test(SRV), true);
t('서버 리전(서울)', /const REGION = "asia-northeast3";/.test(SRV), true);
t('★ 화면이 부르는 주소가 그 리전과 같다', /https:\/\/asia-northeast3-pureun-erp\.cloudfunctions\.net/.test(CLI), true);
t('다섯 창구 모두 그 리전에 둔다', (SRV.match(/functions\.region\(REGION\)\.https\.onRequest/g) || []).length, 5);

console.log('\n[② 남의 말을 그대로 믿지 않는다]');
t('★ 도전값은 서버가 만들어 서버에 둔다', /await putChallenge\("reg", sid, options\.challenge\)/.test(SRV), true);
t('★ 로그인 도전값도 마찬가지', /await putChallenge\("login", sid, options\.challenge\)/.test(SRV), true);
/* ★ 한 번 쓴 도전값을 또 쓰게 두면, 가로챈 값으로 다시 들어올 수 있다 */
t('★ 꺼내면서 지운다 (한 번 쓴 값은 다시 못 쓴다)', /const snap = await ref\.once\("value"\);\n  const v = snap\.val\(\);\n  await ref\.remove\(\);/.test(SRV), true);
t('★ 오래된 도전값은 거절한다', /if \(Date\.now\(\) - \(v\.at \|\| 0\) > CHALLENGE_TTL_MS\) return null;/.test(SRV), true);
/* ★ 등록용 도전값으로 로그인을 통과시키면 안 된다 — 열쇠를 용도로 나눈다 */
t('★ 등록용과 로그인용 도전값을 갈라 둔다', /pathSafe\(kind \+ ":" \+ who\)/.test(SRV), true);

console.log('\n[③ 서명을 실제로 따져 본다]');
t('등록 서명 확인', /await verifyRegistrationResponse\(\{/.test(SRV), true);
t('로그인 서명 확인', /await verifyAuthenticationResponse\(\{/.test(SRV), true);
t('★ 우리 주소에서 온 것만 받는다', (SRV.match(/expectedOrigin: ORIGIN/g) || []).length, 2);
t('★ 우리 도메인 것만 받는다', (SRV.match(/expectedRPID: RP_ID/g) || []).length, 2);
/* ★ 본인 확인(지문·얼굴·잠금번호) 없이 통과시키면 「간편」이 아니라 「무방비」다 */
t('★ 본인 확인을 반드시 거치게 한다', (SRV.match(/requireUserVerification: true/g) || []).length, 2);
t('★ 만들 때부터 본인 확인을 요구한다', /userVerification: "required"/.test(SRV), true);

console.log('\n[④ 복제된 기기를 걸러 낸다]');
/* 서명 횟수는 앞으로만 간다. 뒤로 갔다면 복제본이다.
   다만 0 을 계속 보내는 기기가 있어 규격이 허용한다 — 그때는 이 검사를 건너뛴다. */
t('★ 횟수가 뒤로 가면 막는다', /if \(next > 0 && next <= \(hit\.counter \|\| 0\)\) \{/.test(SRV), true);
t('★ 통과하면 새 횟수를 적어 둔다', /\/counter"\)\.set\(next\)/.test(SRV), true);

console.log('\n[⑤ 남의 계정에 자기 지문을 붙이지 못한다]');
t('★ 등록은 이미 로그인한 사람만', (SRV.match(/const user = await requireUser\(req\);\n  if \(!user\) return bad\(res, 401,/g) || []).length, 3);
t('표(토큰)를 실제로 확인한다', /await getAuth\(\)\.verifyIdToken\(m\[1\]\)/.test(SRV), true);
t('★ 남의 기기 목록을 보거나 지우지 못한다', /if \(have\.length && !have\.every\(\(c\) => c\.uid === user\.uid\)\) return bad\(res, 403,/.test(SRV), true);
t('기기 수를 제한한다', /if \(have\.length >= MAX_DEVICES\)/.test(SRV), true);

console.log('\n[⑥ 사번이 있는지 없는지를 알려 주지 않는다]');
/* 「그런 사번 없음」과 「등록 안 됨」을 갈라 말하면, 남의 사번을 찾아내는 데 쓰인다 */
t('★ 한 가지 문구로만 답한다', /if \(!have\.length\) return bad\(res, 400, "이 사번으로 등록된 기기가 없습니다"\);/.test(SRV), true);

console.log('\n[⑦ 통과하면 그 사람 계정으로 들어갈 표를 준다]');
t('★ 표는 등록할 때 적어 둔 «그 계정» 으로만', /createCustomToken\(hit\.uid, \{ passkey: true, sid \}\)/.test(SRV), true);
/* ★ 데이터베이스 규칙이 「비밀번호로 들어온 사람」만 받으므로, 규칙에 passkey 조건을
   «더해» 주어야 자료가 열린다. 더하는 것이라 기존 로그인은 아무도 안 막힌다. */
t('왜 passkey 표시가 필요한지 적어 두었다', /규칙에 이 조건을 «더해»/.test(SRV), true);

console.log('\n[⑧ 화면은 심부름만 한다]');
t('안 되는 기기에는 단추를 안 보인다', /function supported\(\)/.test(CLI), true);
t('서버가 아니라고 하면 그대로 멈춘다', /if \(!j \|\| !j\.ok\) throw new Error/.test(CLI), true);
/* 브라우저는 바이트, 서버는 글자 — 오갈 때마다 바꿔 준다 */
const ctx = { atob:(s)=>Buffer.from(s,'base64').toString('binary'),
              btoa:(s)=>Buffer.from(s,'binary').toString('base64'),
              Uint8Array:Uint8Array, String:String };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(CLI.replace("typeof window !== 'undefined' ? window : globalThis", 'this'), ctx);
const P = ctx.PuPasskey;
t('★ 글자 → 바이트 → 글자가 그대로 돌아온다', P._bytesToB64u(P._b64uToBytes('abc-_123')), 'abc-_123');
t('★ 패딩 없는 글자도 읽는다', Array.from(P._b64uToBytes('AQID')), [1,2,3]);
t('바꾼 글자에 +/= 가 섞이지 않는다', /[+/=]/.test(P._bytesToB64u(new Uint8Array([251,255,254]))), false);

console.log('\n[⑨ 포털 화면 — 비밀번호 길은 그대로 둔다]');
t('판단 파일을 불러온다', /<script src="js\/pu-passkey\.js(\?v=\d+)?"><\/script>/.test(PORTAL), true);
t('로그인 화면에 단추가 있다', /id="pkBtn"/.test(PORTAL), true);
/* ★ 등록도 안 했는데 단추가 보이면 눌러 보고 나서야 안 된다는 걸 안다 */
t('★ 등록해 둔 기기에서만 보인다', /var ok = !!\(window\.PuPasskey && PuPasskey\.supported\(\)\) && !!pkSavedSid\(\);/.test(PORTAL), true);
t('통과하면 그 표로 들어간다', /auth\.signInWithCustomToken\(token\)/.test(PORTAL), true);
/* ★ 기기를 잃거나 바꿨을 때 들어올 길이 없으면 안 된다 */
t('★ 비밀번호 로그인이 그대로 있다', /auth\.signInWithEmailAndPassword\(email, pw\)/.test(PORTAL), true);
t('★ 스스로 취소한 것은 「실패」로 겁주지 않는다', /if\(\/NotAllowed\|취소\/i\.test\(m\)\) showErr\('취소되었습니다/.test(PORTAL), true);
t('등록 안내는 아직 등록 안 한 기기에서만', /row\.style\.display = \(can && !already && !later\) \? 'flex' : 'none';/.test(PORTAL), true);
/* ⚠ 처음에는 윗줄(로그아웃 옆) 작은 단추였는데 폰에서 «없는 것처럼» 보였다(대표 보고).
   안 보이는 기능은 없는 기능이다 — 본문 맨 위 한 줄로 옮겼다. */
t('★ 좁은 윗줄이 아니라 본문에 둔다', /id="pkRegRow"/.test(PORTAL), true);
t('★ 무엇인지 한 줄로 말해 준다', /한 번 등록하면 다음부터 비밀번호 없이 지문으로 들어옵니다/.test(PORTAL), true);
/* 매번 뜨면 성가시다 — 「나중에」를 누르면 다시 안 묻는다 */
t('나중에 고를 수 있다', /id="pkRegLater"/.test(PORTAL), true);
t('나중에를 기억한다', /localStorage\.setItem\(PK_LATER_KEY, sid\)/.test(PORTAL), true);
/* 단추만 감추면 빈 띠가 남는다 — 줄 전체를 감춘다 */
t('★ 등록하면 안내줄이 통째로 사라진다', /row\.style\.display = 'none';\n          alert\('등록했습니다/.test(PORTAL), true);
t('등록할 때 내 표를 함께 보낸다', /auth\.currentUser\.getIdToken\(\)/.test(PORTAL), true);
/* ⚠ 「지문」만 적으면 거짓말이다 — 휴대폰 설정에 따라 얼굴·잠금번호가 뜬다 */
t('★ 문구를 「지문·간편 로그인」으로 적었다', /🔒 지문·간편 로그인/.test(PORTAL), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
