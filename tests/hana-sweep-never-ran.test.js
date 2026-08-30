'use strict';
/* 훑기가 «한 번도» 안 돈다 — 절전이 재웠다 (2026-08-30 실제로 겪음)

   20:42 에 폰을 연결했다. 연결도 됐고, 문자 읽기 권한도 줬고, 「지난 문자
   가져오기」도 돌았다. 그런데 두 시간 가까이 15분 훑기가 «단 한 번도» 안 돌았다.
   서버 기록에 lastSweepAt 이 아예 없었다.

   까닭은 절전이다. 훑기는 WorkManager 로 도는데, 절전이 켜져 있으면 안드로이드가
   그것을 무기한 미룬다. 앱도 권한도 멀쩡한데 아무 일도 안 일어난다.

   그때 앱 화면은 「● 다 됐습니다」라고 적고 있었다 — 그 말이 거짓이었다.

   같은 자리에서 하나 더: 판 번호(appVersion)를 «훑기만» 보냈다. 훑기가 안 도는
   폰은 판 번호를 영영 안 보낸다. 그래서 「새 앱을 깔긴 하신 건가」를 물어볼
   수조차 없었다 — 정작 그 물음이 가장 급한 상황에서.

   이 검사가 못 박는 것 —
     ① 절전 예외를 «한 번 눌러» 끝낼 수 있다 (설정 앱을 헤매게 하지 않는다)
     ② 절전이 켜져 있으면 「다 됐습니다」라고 «하지 않는다»
     ③ 판 번호는 «모든» 말에 실린다 — 훑기 하나에 기대지 않는다
     ④ 서버는 어느 길로 왔든 그 판 번호를 적는다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const JAVA = path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 먼저 걷는다 — 안 걷으면 «왜 이렇게 했는지» 적어 둔 설명글이 검사를 통과시킨다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const main = bare(read(path.join(JAVA, 'MainActivity.java')));
const upload = bare(read(path.join(JAVA, 'HanaUploadWorker.java')));
const manifest = read(path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'AndroidManifest.xml')).replace(/<!--[\s\S]*?-->/g, ' ');
const fn = bare(read(path.join(R, 'functions', 'index.js')));

/* ══════ ① 절전 예외를 «한 번 눌러» 끝낸다 ══════ */

test('★★ 절전 예외 권한이 있다 — 없으면 설정 앱을 헤매게 되고, 그러면 아무도 안 한다', () => {
  assert.match(manifest, /REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/,
    '★★ 권한이 없으면 「허용하시겠습니까」 창을 띄울 수 없습니다');
  /* ⚠ 문자 받기(RECEIVE_SMS)는 «절대» 넣지 않는다. 읽기(READ_SMS)만 쓴다. */
  assert.doesNotMatch(manifest, /RECEIVE_SMS/,
    '★★ 문자를 «받는» 권한은 넣지 않기로 했습니다 — 읽기만 씁니다');
});

test('★★ 한 번 눌러 끝난다 — 창이 안 뜨는 폰은 설정으로 데려다준다', () => {
  const at = main.indexOf('private void askBattery(');
  assert.ok(at > 0, '★ 절전 예외를 켜는 자리가 없습니다');
  const body = main.slice(at, main.indexOf('\n    }', at));
  assert.match(body, /ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/,
    '★★ 바로 묻는 창을 안 띄우면 설정 앱을 헤매게 됩니다');
  assert.match(body, /package:/,
    '★★ 어느 앱인지 안 붙이면 창이 「이 앱」을 모릅니다');
  assert.match(body, /ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS/,
    '★ 창이 안 뜨는 폰이 있습니다 — 그때 아무 일도 안 일어나면 길이 끊깁니다');
});

/* ══════ ② 절전이 켜져 있으면 「다 됐습니다」라고 하지 않는다 ══════ */

test('★★ 절전이 켜져 있으면 «다 됐다»고 말하지 않는다 — 그 말이 거짓이었다', () => {
  const at = main.indexOf('private void refresh(');
  assert.ok(at > 0, 'refresh 를 찾지 못했습니다');
  const body = main.slice(at, main.indexOf('\n    }', main.indexOf('show(history, true);', at)));

  const iBat = body.indexOf('batteryFree()');
  const iDone = body.indexOf('다 됐습니다');
  assert.ok(iBat > 0, '★★ 절전을 아예 안 봅니다 — 훑기가 안 도는 것을 영영 모릅니다');
  assert.ok(iBat < iDone,
    '★★ 「다 됐습니다」가 절전 확인보다 먼저입니다 — 안 되는데 다 됐다고 말합니다');
});

test('★ 못 물어봤으면 «된 것»으로 친다 — 알 수 없는 것으로 사람을 붙잡지 않는다', () => {
  const at = main.indexOf('private boolean batteryFree(');
  assert.ok(at > 0);
  const body = main.slice(at, main.indexOf('\n    }', at));
  assert.match(body, /catch[\s\S]{0,200}return true;/,
    '★ 못 물어본 것을 「절전 켜짐」으로 읽으면, 할 일 없는 사람에게 할 일을 만듭니다');
});

/* ══════ ③④ 판 번호는 모든 말에 실린다 ══════ */

test('★★ 판 번호를 «모든» 말에 싣는다 — 훑기 하나에 기대지 않는다', () => {
  /* 훑기가 안 도는 폰은 훑기로는 영영 판을 못 알린다. 그 폰이 바로
     「지금 어떤 판을 깔았나」가 가장 궁금한 폰이다. */
  const at = upload.indexOf('static JSONObject post(');
  assert.ok(at > 0, 'post 를 찾지 못했습니다');
  const head = upload.slice(at, at + 700);
  assert.match(head, /appVersion[\s\S]{0,60}BridgeConfig\.APP_VERSION/,
    '★★ 보내는 자리 한 곳에서 판 번호를 안 실으면, 훑기 없이는 판을 모릅니다');
  /* 이미 실어 보낸 것은 덮지 않는다 — 훑기가 제 것을 넣어 보낸다 */
  assert.match(head, /!body\.has\("appVersion"\)/,
    '★ 이미 적힌 판 번호를 덮어쓰면, 보내는 쪽이 무엇을 말하려 했는지 사라집니다');
  /* 판 번호 하나 때문에 «보내기»가 막히면 안 된다 */
  assert.match(head, /catch[\s\S]{0,120}HttpURLConnection|try \{[\s\S]{0,200}catch/,
    '★★ 판 번호를 못 넣었다고 문자 보내기가 막히면, 고치려다 더 나빠집니다');
});

test('★★ 서버는 «어느 길로 왔든» 판 번호를 적는다', () => {
  const at = fn.indexOf('const hanaStampAlive = async (');
  assert.ok(at > 0, 'hanaStampAlive 를 찾지 못했습니다');
  const body = fn.slice(at, fn.indexOf('\n      };', at));
  assert.match(body, /patch\.appVersion/,
    '★★ 받아 놓고 안 적으면 화면은 여전히 판을 모릅니다');
  /* 훑기 갈래 «밖»에 있어야 한다 — 안에 있으면 고친 뜻이 없다 */
  const iVer = body.indexOf('patch.appVersion');
  const iSweep = body.indexOf('if (how === "sweep")');
  assert.ok(iVer < iSweep,
    '★★ 판 번호 적기가 훑기 갈래 «안»에 있습니다 — 훑기 없이는 여전히 모릅니다');

  /* 부르는 자리가 실제로 넘겨줘야 한다 — 안 넘기면 위 코드는 늘 빈손이다 */
  ['howCame', '"sweep"', '"history"', '"notify"'].forEach(function (how) {
    assert.ok(fn.indexOf('hanaStampAlive(linked, ' + how + ', body.appVersion)') > 0,
      '★★ ' + how + ' 갈래가 판 번호를 안 넘깁니다 — 적을 것이 없습니다');
  });
});

test('★ 폰 앱 판 번호는 세 자리가 «같다»', () => {
  const v = (s, re) => { const m = s.match(re); return m && m[1]; };
  const a = v(read(path.join(R, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts')),
    /versionName\s*=\s*"([\d.]+)"/);
  const b = v(read(path.join(JAVA, 'BridgeConfig.java')), /APP_VERSION\s*=\s*"([\d.]+)"/);
  const c = v(read(path.join(R, 'pu-erp.html')), /HANA_APK_VER\s*=\s*'([\d.]+)'/);
  assert.equal(b, a, '★ BridgeConfig 판 번호가 build.gradle.kts 와 다릅니다');
  assert.equal(c, a, '★ 화면이 알리는 판 번호가 앱과 다릅니다 — 「받았는데 옛것」이 됩니다');
});
