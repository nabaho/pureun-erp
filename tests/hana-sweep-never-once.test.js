'use strict';
/* 훑기가 «한 번도» 안 돈 폰 — 그리고 절전은 폰에게 물어본다 (2026-08-31)

   2026-08-31 아침. 다시 연결한 뒤 26분을 지켜봤는데 15분 훑기가 «한 번도»
   안 돌았다. 앱도 권한도 멀쩡했다. 절전이 잡고 있었다.

   그런데 두 가지가 걸렸다 —

   ① 화면이 그 상태를 못 알아봤다.
      「돌다가 멈춘」 폰을 잡는 갈래는 있었지만, «한 번도 안 돈» 폰은
      lastSweepAt 이 아예 없어 그 갈래를 그냥 지나쳤다. 그래서 화면은
      엉뚱하게 「앱이 지워졌나」를 물었다 — 앱은 멀쩡히 깔려 있었다.

   ② 절전이 풀렸는지를 «사람에게» 물었다.
      두 번 물었고 두 번 다 답을 못 받았다. 폰이 이미 아는 것이었다.
      사람에게 물어야 할 것과 기계에게 물어야 할 것을 헷갈린 것이다.

   이 검사가 못 박는 것 —
     ① 폰이 「절전이 풀렸나」를 손누름·훑기 «둘 다»에서 보낸다
     ② 서버는 옛 판이 안 보낸 그 칸을 «거짓»이 아니라 «모름»으로 둔다
     ③ 화면에 «한 번도 안 돈» 갈래가 있고, «돌다 멈춘» 갈래보다 뒤에 온다
     ④ 그 갈래가 절전 상태에 따라 «어디를 볼지»를 갈라 말한다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const JAVA = path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 먼저 걷는다 — 설명글이 검사를 통과시키면 안 된다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const main = bare(read(path.join(JAVA, 'MainActivity.java')));
const sweep = bare(read(path.join(JAVA, 'HanaSweepWorker.java')));
const fn = bare(read(path.join(R, 'functions', 'index.js')));
const erp = bare(read(path.join(R, 'pu-erp.html')));

/* ══════ ① 폰이 «직접» 말한다 ══════ */

test('★★ 절전 상태를 «사람이 아니라 폰»에게 묻는다 — 두 길 모두에서 보낸다', () => {
  assert.match(main, /ping\.put\("batteryFree", batteryFree\(\)\)/,
    '★★ 손으로 누를 때 절전 상태를 안 보내면, 또 사람에게 물어야 합니다');
  assert.match(sweep, /ping\.put\("batteryFree", batteryFree\(context\)\)/,
    '★ 훑기에서도 보내야 «한 번 돌고 다시 재워지는» 폰을 알아봅니다');
  /* 훑개도 스스로 물어볼 줄 알아야 한다 — 화면(MainActivity)에만 있으면 못 쓴다 */
  const at = sweep.indexOf('static boolean batteryFree(');
  assert.ok(at > 0, '★ 훑개가 절전 상태를 물어볼 길이 없습니다');
  const body = sweep.slice(at, sweep.indexOf('\n    }', at));
  assert.match(body, /isIgnoringBatteryOptimizations/, '★ 실제로 안 물어보고 있습니다');
  assert.match(body, /catch[\s\S]{0,160}return true;/,
    '★ 못 물어본 것을 「절전 켜짐」으로 읽으면, 멀쩡한 폰에 없는 고장을 씌웁니다');
});

/* ══════ ② 서버는 「모름」을 지킨다 ══════ */

test('★★ 서버는 옛 판이 «안 보낸» 절전 상태를 「거짓」으로 치지 않는다', () => {
  const at = fn.indexOf('if (action === "sweepPing")');
  assert.ok(at > 0, 'sweepPing 갈래를 못 찾았습니다');
  const body = fn.slice(at, fn.indexOf('if (action === "pairStatus")', at));
  assert.match(body, /typeof body\.batteryFree === "boolean"/,
    '★★ 안 보낸 것을 거짓으로 적으면, 옛 판 폰이 모두 「절전 켜짐」이 됩니다');
  assert.match(body, /sweepBatteryFree/, '★ 받아 놓고 안 적으면 화면은 여전히 모릅니다');

  const st = fn.slice(fn.indexOf('if (action === "pairStatus")'),
    fn.indexOf('if (action === "pairReset")'));
  assert.match(st,
    /sweepBatteryFree: typeof d\.sweepBatteryFree === "boolean" \? d\.sweepBatteryFree : null/,
    '★★ 여기서 Boolean() 으로 뭉개면 «모름»이 «절전 켜짐»이 됩니다 — 화면이 거짓말합니다');
});

/* ══════ ③④ 화면이 «한 번도 안 돈» 폰을 알아본다 ══════ */

test('★★ «한 번도 안 돈» 폰을 알아본다 — 예전엔 「앱이 지워졌나」를 물었다', () => {
  const at = erp.indexOf('function hanaStatChip(');
  assert.ok(at > 0, 'hanaStatChip 을 찾지 못했습니다');
  const body = erp.slice(at, erp.indexOf('\n}', erp.indexOf('연결 뒤 문자 0건', at)));

  const iNever = body.indexOf('!d.lastSweepAt && d.pairedAt');
  const iStopped = body.indexOf('sweepAgo > 0 && !sweepAlive');
  const iGhost = body.indexOf('연결 뒤 문자 0건');
  assert.ok(iNever > 0,
    '★★ «한 번도 안 돈» 갈래가 없으면, 그 폰은 「앱이 지워졌나」로 잘못 읽힙니다');
  assert.ok(iStopped > 0 && iNever > iStopped,
    '★ «돌다 멈춘» 갈래보다 앞에 두면 그쪽이 영영 안 닿습니다');
  assert.ok(iNever < iGhost,
    '★★ 「연결 뒤 문자 0건」이 먼저 잡아채면, 절전 문제가 앱 문제로 둔갑합니다');
});

test('★★ 절전 상태에 따라 «어디를 볼지»를 갈라 말한다', () => {
  const at = erp.indexOf('!d.lastSweepAt && d.pairedAt');
  assert.ok(at > 0);
  const chip = erp.slice(at, at + 1600);
  /* 셋을 갈라야 한다 — 절전 켜짐 · 절전 풀렸는데도 안 돎 · 모름(옛 판) */
  assert.match(chip, /d\.sweepBatteryFree === false/,
    '★★ 절전이 잡고 있는데 그 말을 안 하면, 사람은 앱을 다시 깔러 갑니다');
  assert.match(chip, /d\.sweepBatteryFree === true/,
    '★★ 절전 예외를 «이미 했는데도» 안 도는 경우를 안 가르면, 같은 것을 또 누르게 됩니다');
  /* 모를 때는 단정하지 않는다 — 없는 고장을 씌우게 된다 */
  assert.match(chip, /옛 판/,
    '★ 폰이 못 알려 줄 때 아무 말이나 하면, 멀쩡한 폰에 없는 고장을 씌웁니다');
  /* 알림 길은 따로 산다는 것을 알려야 «급한 일»과 «아닌 일»을 가른다 */
  assert.match(chip, /알림 길은 이것과 따로/,
    '★ 새 문자가 그대로 들어온다는 것을 안 적으면, 안 급한 일에 놀랍니다');
});

test('★ 폰 앱 판 번호는 세 자리가 «같다»', () => {
  const v = (s, re) => { const m = s.match(re); return m && m[1]; };
  const A = path.join(R, 'android', 'hana-sms-bridge', 'app');
  const a = v(read(path.join(A, 'build.gradle.kts')), /versionName\s*=\s*"([\d.]+)"/);
  const b = v(read(path.join(JAVA, 'BridgeConfig.java')), /APP_VERSION\s*=\s*"([\d.]+)"/);
  const c = v(read(path.join(R, 'pu-erp.html')), /HANA_APK_VER\s*=\s*'([\d.]+)'/);
  assert.equal(b, a, '★ BridgeConfig 판 번호가 build.gradle.kts 와 다릅니다');
  assert.equal(c, a, '★ 화면이 알리는 판 번호가 앱과 다릅니다');
});
