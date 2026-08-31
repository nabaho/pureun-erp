'use strict';
/* 「눌렀다」는 것을 «반드시» 서버에 알린다 — 2026-08-31 아침에 여기서 막혔다

   대표가 폰에서 「지난 문자 가져오기」를 눌렀다. 서버 기록은 꿈쩍도 안 했다.
   찾을 것이 없거나 문자함을 못 열면, 앱이 화면에만 적고 «그냥 되돌아갔다».
   서버는 아무것도 못 들었다 — 판 번호도, 권한 상태도, 「사람이 눌렀다」는 것도.

   하필 그때가 가장 궁금한 때다. 아무 일도 안 일어나는 폰을 앞에 두고
   「그 앱이 새것이긴 한가」조차 물어볼 수 없었다.

   ⚠ 그렇다고 «훑기가 돌았다»(lastSweepAt)로 찍으면 안 된다. 그것은
     「폰이 스스로 15분마다 돈다」는 뜻이라, 절전에 재워져 한 번도 안 도는 폰이
     화면에서 멀쩡해 보이게 된다 — 절전을 영영 못 짚는다.

   이 검사가 못 박는 것 —
     ① 되돌아가는 «모든» 갈래가 서버에 알린다 (못 읽음·0통·잘 가져옴)
     ② 알릴 때 「사람이 눌렀다」(byHand)를 밝힌다
     ③ 서버는 byHand 면 lastSweepAt 을 «안» 찍는다
     ④ 서버는 byHand 면 「지난 문자를 끌어왔다」로는 남긴다 (0통이어도)

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 먼저 걷는다 — 설명글이 검사를 통과시키면 안 된다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const main = bare(read(path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge', 'MainActivity.java')));
const fn = bare(read(path.join(R, 'functions', 'index.js')));

/* importHistory 한 덩이만 떼어 낸다 */
function importBody() {
  const at = main.indexOf('private void importHistory(');
  assert.ok(at > 0, 'importHistory 를 찾지 못했습니다');
  let d = 0; const from = main.indexOf('{', at);
  for (let k = from; k < main.length; k++) {
    if (main[k] === '{') d++;
    else if (main[k] === '}') { d--; if (d === 0) return main.slice(at, k + 1); }
  }
  throw new Error('importHistory 의 끝을 못 찾았습니다');
}

test('★★ 되돌아가는 «모든» 갈래가 서버에 알린다 — 조용히 돌아가면 아무도 모른다', () => {
  /* ⚠ 맨 앞 「두 번 눌림 막이」(if (importing) return;)는 빼고 본다 —
       그것은 아무 일도 안 하고 되돌아가는 것이라 서버에 알릴 것이 없다.
       일이 «시작된 뒤»(executor) 부터가 알려야 할 자리다. */
  const whole = importBody();
  const from = whole.indexOf('executor.execute(');
  assert.ok(from > 0, '일하는 자리를 못 찾았습니다');
  const body = whole.slice(from);
  /* 되돌아가는 자리(return)마다 그 «앞»에 알림이 있어야 한다.
     ⚠ 갈래 개수를 박지 않는다 — 늘어나도 안 깨진다. 보는 것은
       «return 앞에 tellServer 가 있는가» 뿐이다. */
  const parts = body.split(/\breturn;/);
  parts.slice(0, -1).forEach(function (chunk, i) {
    assert.match(chunk, /tellServer\(/,
      '★★ ' + (i + 1) + '번째 되돌아가는 갈래가 서버에 아무 말도 안 합니다 — '
      + '대표가 눌러도 서버 기록이 꿈쩍 안 합니다');
  });
  /* 잘 가져온 끝에서도 알린다 — 전부 중복이면 판 번호가 이 한 줄로만 올라간다 */
  assert.ok((body.match(/tellServer\(/g) || []).length >= 4,
    '★ 알리는 자리가 모자랍니다 — 되돌아가는 갈래 셋과 잘 끝난 자리 하나가 있어야 합니다');
});

test('★★ 알릴 때 「사람이 눌렀다」를 밝힌다 — 안 밝히면 훑기가 돈 것으로 찍힌다', () => {
  const at = main.indexOf('private void tellServer(');
  assert.ok(at > 0, 'tellServer 를 찾지 못했습니다');
  const body = main.slice(at, main.indexOf('\n    }', at));
  assert.match(body, /ping\.put\("byHand", true\)/,
    '★★ 사람이 누른 것을 안 밝히면, 절전에 재워진 폰이 «스스로 도는» 것으로 보입니다');
  assert.match(body, /ping\.put\("canReadSms"/, '★ 권한 상태를 안 보내면 왜 0통인지 모릅니다');
  assert.match(body, /ping\.put\("readOk"/, '★ 「끝까지 읽었나」를 안 보내면 0통이 «모름»과 같아집니다');
  /* 알리기가 실패해도 가져오기를 막지 않는다 */
  assert.match(body, /catch/,
    '★★ 알리기 하나가 실패했다고 지난 문자 가져오기가 통째로 막히면, 고치려다 더 나빠집니다');
});

test('★★ 서버는 «사람이 누른 것»으로 lastSweepAt 을 찍지 않는다', () => {
  const at = fn.indexOf('if (action === "sweepPing")');
  assert.ok(at > 0, 'sweepPing 갈래를 못 찾았습니다');
  const body = fn.slice(at, fn.indexOf('if (action === "pairStatus")', at));
  assert.match(body, /byHand\s*=\s*body\.byHand === true/,
    '★★ 손으로 누른 것을 안 가르면, 절전에 재워진 폰이 화면에서 멀쩡해 보입니다');
  assert.match(body, /byHand \? \{\} : \{ lastSweepAt/,
    '★★ 사람이 누른 것으로 「스스로 훑었다」를 찍고 있습니다 — 절전을 영영 못 짚습니다');
  assert.match(body, /byHand \? \{ lastHistoryAt/,
    '★ 0통이어도 「눌렀다」는 남겨야 화면이 「눌러 주세요」를 그만합니다');
  /* 판 번호·권한은 손으로 눌렀어도 그대로 참이라 함께 적힌다 */
  assert.match(body, /appVersion:/, '★ 판 번호는 어느 길로 왔든 참입니다');
});

test('★ 폰 앱 판 번호는 세 자리가 «같다»', () => {
  const v = (s, re) => { const m = s.match(re); return m && m[1]; };
  const A = path.join(R, 'android', 'hana-sms-bridge', 'app');
  const a = v(read(path.join(A, 'build.gradle.kts')), /versionName\s*=\s*"([\d.]+)"/);
  const b = v(read(path.join(A, 'src', 'main', 'java', 'kr', 'pureun', 'hanabridge',
    'BridgeConfig.java')), /APP_VERSION\s*=\s*"([\d.]+)"/);
  const c = v(read(path.join(R, 'pu-erp.html')), /HANA_APK_VER\s*=\s*'([\d.]+)'/);
  assert.equal(b, a, '★ BridgeConfig 판 번호가 build.gradle.kts 와 다릅니다');
  assert.equal(c, a, '★ 화면이 알리는 판 번호가 앱과 다릅니다');
});
