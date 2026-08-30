/* 폰이 «스스로» 문자함을 훑는가 (2026-08-30)
 *
 * ■ 무슨 일이 있었나
 *   2026-08-29 밤에 폰을 연결했는데, 하루가 지나도록 서버는 폰에게서
 *   «살아 있는 문자»를 한 통도 못 받았다 — lastOkAt 이 아예 비어 있었다.
 *   지난 문자 가져오기는 됐으니 열쇠도 그물도 멀쩡했다. 알림만 안 왔다.
 *   대표: 「문자 여전히 안들어온다」.
 *
 * ★ 알림은 끊어질 구석이 너무 많다 — 앱 재설치(권한 꺼짐)·절전·방해금지.
 *   그중 하나만 걸려도 사람 눈에는 「그냥 안 들어온다」로만 보인다.
 *   그래서 15분마다 문자함을 스스로 줍는 길을 하나 더 냈다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = path.join(__dirname, '..');
const A = path.join(R, 'android/hana-sms-bridge/app/src/main/java/kr/pureun/hanabridge');
const SWEEP = fs.readFileSync(path.join(A, 'HanaSweepWorker.java'), 'utf8');
const MAIN = fs.readFileSync(path.join(A, 'MainActivity.java'), 'utf8');
const LISTENER = fs.readFileSync(path.join(A, 'HanaNotificationListener.java'), 'utf8');
const GRADLE = fs.readFileSync(path.join(R, 'android/hana-sms-bridge/app/build.gradle.kts'), 'utf8');
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ⚠ 주석은 규칙이 아니다 — 잘 쓴 주석이 검사를 통과시키면 안 된다. */
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const SW = bare(SWEEP);
const MA = bare(MAIN);
const SV = bare(FN);

/* ── 폰: 되풀이해 도는가 ── */
test('★★ 훑기는 «되풀이해서» 돈다 — 한 번 도는 일이 아니다', () => {
  assert.ok(/new PeriodicWorkRequest\.Builder\(/.test(SW),
    '★★ 한 번짜리 일로 걸면 처음 한 번 돌고 끝난다 — 알림이 막힌 폰은 그대로다');
  assert.ok(/enqueueUniquePeriodicWork\(/.test(SW),
    '★ 이름 없이 걸면 앱을 열 때마다 훑기가 하나씩 늘어난다');
});

test('★★ 앱을 다시 열어도 시계를 «되감지 않는다»', () => {
  assert.ok(/ExistingPeriodicWorkPolicy\.KEEP/.test(SW),
    '★★ REPLACE 로 두면 앱을 열 때마다 15분이 처음부터 다시 가서 영영 안 돈다');
});

test('★ 인터넷이 있을 때만 돈다', () => {
  assert.ok(/setRequiredNetworkType\(NetworkType\.CONNECTED\)/.test(SW),
    '★ 끊긴 채로 깨우면 실패만 쌓고 배터리를 쓴다');
});

/* ── 폰: 「살아 있다」를 반드시 알리는가 ── */
test('★★ 찾은 것이 «없어도» 서버에 알린다', () => {
  const at = SW.indexOf('"sweepPing"');
  assert.ok(at > 0,
    '★★ 살아 있다는 알림이 없으면, 서버는 「폰이 죽은 것」과 「문자가 없는 것」을 못 가른다');
  /* ⚠ 「찾은 것이 있을 때만」 울타리 안에 들어가 있으면 안 된다. */
  const before = SW.slice(0, at);
  const depth = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
  assert.ok(depth <= 3,
    '★★ 알림이 「찾은 것이 있을 때」 울타리 안에 갇혔다 — 조용한 폰은 영영 조용하다 (깊이 ' + depth + ')');

  /* ⚠★ 울타리만 보면 «중간에 돌아서는 것»을 못 잡는다.
     if (sent == 0) return; 한 줄이면 깊이는 그대로인데 조용한 폰은 영영 조용하다 —
     그것이 바로 2026-08-30 에 하루를 잃은 그 모습이다.
     그래서 문자함을 훑는 대목과 알림 사이에 «돌아서는 자리»가 없어야 한다. */
  const readAt = SW.indexOf('boolean canRead =');
  assert.ok(readAt > 0 && readAt < at, '★ 문자함을 훑는 대목을 못 찾음');
  const between = SW.slice(readAt, at);
  assert.ok(!/\breturn\b/.test(between),
    '★★ 문자함을 훑고 나서 알림 전에 «돌아서는 자리»가 생겼다 — '
    + '찾은 것이 없는 폰은 영영 살아 있다고 못 알린다');
});

test('★★ 문자함을 «못 읽어도» 알린다 — 그래야 권한을 짚어 준다', () => {
  assert.ok(/put\("action", "sweepPing"\)/.test(SW), '★ 알림을 안 보낸다');
  assert.ok(/"canReadSms"/.test(SW),
    '★★ 권한이 없다는 것을 안 알리면, 훑기가 도는데도 아무것도 안 들어오는 까닭을 아무도 모른다');
});

/* ── 폰: 연결과 함께 살고 죽는가 ── */
test('★★ 연결을 지우면 훑기도 «멈춘다»', () => {
  assert.ok(/HanaSweepWorker\.cancel\(this\)/.test(MA),
    '★★ 안 멈추면 연결을 지운 폰이 15분마다 남의 서버를 두드린다');
  assert.ok(/if \(!SecureStore\.connected\(context\)\) \{\s*cancel\(context\);/.test(SW),
    '★ 연결이 끊긴 채로 깨어나도 스스로 멈춰야 한다');
});

test('★ 연결하면 «곧바로» 걸고, 앱을 열 때도 걸어 둔다', () => {
  const hits = MA.split('HanaSweepWorker.schedule(this)').length - 1;
  assert.ok(hits >= 2, '★ 연결 직후와 앱 열 때 둘 다에서 걸어야 한다 (지금 ' + hits + '곳)');
  assert.ok(/if \(SecureStore\.connected\(this\)\) HanaSweepWorker\.schedule\(this\)/.test(MA),
    '★ 연결 안 된 폰에까지 걸면 보낼 곳도 없이 15분마다 깨어난다');
});

/* ── 폰: 알림 길을 «대신하지» 않는다 ── */
test('★★ 알림 길은 그대로 남는다 — 훑기는 «놓친 것을 줍는» 길이다', () => {
  const LS = bare(LISTENER);
  assert.ok(/onNotificationPosted/.test(LS) && /WorkManager\.getInstance\(this\)\.enqueue\(request\)/.test(LS),
    '★★ 훑기를 넣으면서 알림 길을 지우면, 즉시 오던 것이 15분 늦어진다');
});

/* ── 폰: 판이 올라갔는가 ── */
test('★ 앱 판 번호가 올라갔다 — 안 올리면 폰이 새것을 안 받는다', () => {
  const code = /versionCode = (\d+)/.exec(GRADLE);
  assert.ok(code && Number(code[1]) >= 5, '★ versionCode 를 안 올리면 설치가 거부된다');
});

/* ── 서버: 훑어 온 것을 받는가 ── */
test('★★ 서버가 «훑어 온 것»을 받는다', () => {
  assert.ok(/const fromSweep = String\(body\.source \|\| ""\) === "sweep";/.test(SV),
    '★ 훑기를 아예 모른다');
});

/* ⚠★ 2026-08-30 에 규칙을 바꿨다. 처음에는 「문자함에서 읽은 것은 꾸러미 검사를
     건너뛴다」고만 했는데, 하나 «앱 푸시»로 오는 입금이 여전히 400 으로 되돌아갔다.
     문자함에도 없고(문자가 아니니) 알림에서도 버려져 두 길 모두에서 사라진 것이다.
     이제 꾸러미로 «미리» 막지 않는다 — 막이는 parseHanaMessage 하나로 충분하다. */
test('★★ 꾸러미 이름으로 «미리» 막지 않는다 — 앱 푸시 입금이 사라진다', () => {
  assert.ok(!/reason: "unsupported_message_app"/.test(SV),
    '★★ 꾸러미로 되돌려보내면 하나원큐 앱 푸시로 오는 입금이 통째로 사라진다');
  assert.ok(/lastPkg: packageName\.slice\(0, 64\)/.test(SV),
    '★★ 어디서 왔는지를 안 적으면, 나중에 좁힐 때 또 짐작으로 좁히게 된다');
  /* 막이가 «사라진 것은 아니다» — 내용 검사는 그대로 있어야 한다.
     ⚠ 파일 전체에서 찾으면 안 된다 — 붙여넣기 길(ingestPaste)에도 같은 부름이 있어,
       정작 이 자리에서 파서를 빼도 «다른 자리 것»에 걸려 통과한다.
       실제로 그렇게 통과했다. 반드시 «이 가지 안»에서 본다. */
  const ing = cutBranch(SV, 'if (action === "ingest") {');
  assert.ok(/const parsed = HanaMessage\.parseHanaMessage\(/.test(ing)
    && /if \(!parsed\.ok\) \{/.test(ing),
    '★★ 꾸러미 검사를 풀면서 내용 검사까지 풀면 아무 알림이나 들어온다');
});

/* 중괄호로 «그 가지만» 자른다.
   ⚠ 고정 폭으로 자르면 창이 옆 가지(else)까지 넘어가, 거기 있는 lastOkAt 을
     이 가지의 것으로 잘못 읽는다 — 실제로 그렇게 헛다리를 짚었다. */
function cutBranch(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}

test('★★ 훑기가 lastOkAt 을 «찍지 않는다» — 알림이 도는 것과 다른 말이다', () => {
  /* ⚠ 부르는 «모양»(칸 개수)을 박지 않는다 — 2026-08-30 에 판 번호 한 칸을
       더 넘기자 이 줄을 포함해 넷이 한꺼번에 깨졌다. 기능은 멀쩡했다. */
  const stamp = cutBranch(SV, 'const hanaStampAlive = async (');
  assert.ok(/if \(how === "sweep"\) \{ patch\.lastSweepAt = at;/.test(stamp),
    '★ 훑기가 돌았다는 것을 안 적는다');
  assert.ok(/else if \(how === "history"\) patch\.lastHistoryAt = at;/.test(stamp),
    '★ 지난 문자를 끌어온 것을 안 적는다');
  /* lastOkAt 은 «알림으로 온 것»에만 — else 가지에만 있어야 한다 */
  assert.ok(/else \{ patch\.lastOkAt = at;/.test(stamp),
    '★★ 훑기·지난문자가 lastOkAt 을 찍으면, 알림이 죽은 채로 「멀쩡함」이 되어 왜 늦는지 영영 모른다');
  assert.strictEqual((stamp.match(/lastOkAt/g) || []).length, 1,
    '★★ lastOkAt 이 두 갈래 이상에 있다 — 알림이 도는지를 더는 알 수 없게 된다');
});

/* ══ 중복이어도 「폰이 말을 걸었다」를 남기는가 (2026-08-30) ══
   ⚠★ 이것이 없어서 대표가 두 번이나 헛되이 앱을 다시 깔았다.
      「지난 문자 가져오기」로 110건을 올렸는데 전부 이미 담은 것이라
      중복으로 되돌아갔고, 서버에 자국이 하나도 안 남았다.
      화면은 그대로 「연결 뒤 문자 0건 — 앱이 지워졌거나…」라고 했다.
      폰은 멀쩡히 말을 걸고 있었는데 화면이 «거짓말»을 한 것이다. */
test('★★ 중복이어도 «폰이 말을 걸었다»는 남긴다', () => {
  const sameRaw = cutBranch(SV, 'if (sameRaw && sameRaw.exists()) {');
  assert.ok(/await hanaStampAlive\(linked, howCame[,)]/.test(sameRaw),
    '★★ 중복만 잔뜩 온 날, 화면이 「문자 0건」이라 거짓말하고 사람이 앱을 다시 깐다');
  const existing = cutBranch(SV, 'if (existing.exists()) {');
  assert.ok(/await hanaStampAlive\(linked, howCame[,)]/.test(existing),
    '★★ 같은 열쇠로 또 온 것도 마찬가지다');
});

test('★★ 걸러진 것도 «말은 걸었다»로 남긴다', () => {
  assert.ok(/await hanaNoteSkip\(linked, parsed\.reason\);\s*await hanaDeviceRef\(linked\)\.update\(\{ lastTalkAt: Date\.now\(\) \}\)/.test(SV),
    '★★ 걸러졌다고 「말을 건 사실」까지 지우면, 폰이 살아 있는데도 죽은 것으로 보인다');
});

test('★★ 폰이 «판 번호»와 «문자함에서 본 것»을 알린다', () => {
  const ping = cutBranch(SV, 'if (action === "sweepPing") {');
  assert.ok(/appVersion: String\(body\.appVersion \|\| ""\)/.test(ping),
    '★★ 판 번호가 없으면 「새 앱을 깔긴 하신 건가」를 물어볼 수조차 없다');
  assert.ok(/sweepFound: Number\(body\.foundCount \|\| 0\)/.test(ping),
    '★★ 폰이 몇 건을 봤는지 모르면, 「폰이 못 보낸 것」과 「폰에 아예 없는 것」을 못 가른다');
  assert.ok(/put\("appVersion", BridgeConfig\.APP_VERSION\)/.test(SW), '★ 폰이 판 번호를 안 보낸다');
  assert.ok(/put\("foundCount", foundCount\)/.test(SW), '★ 폰이 찾은 개수를 안 보낸다');
});

test('★ 판 번호가 «세 곳에서 같다» — 폰이 거짓 판을 알리면 엉뚱한 데를 뒤진다', () => {
  const gradle = /versionName = "([\d.]+)"/.exec(GRADLE);
  const cfg = /APP_VERSION = "([\d.]+)"/.exec(
    fs.readFileSync(path.join(A, 'BridgeConfig.java'), 'utf8'));
  assert.ok(gradle && cfg, '★ 판 번호를 못 찾음');
  assert.strictEqual(cfg[1], gradle[1],
    '★★ 앱이 알리는 판(' + cfg[1] + ')과 실제 판(' + gradle[1] + ')이 다르다');
});

test('★★ 「살아 있다」 알림을 서버가 받는다', () => {
  const block = cutBranch(SV, 'if (action === "sweepPing") {');
  assert.ok(/requireHanaDevice\(req, body\)/.test(block),
    '★★ 열쇠를 안 보면 아무나 남의 기기를 살아 있다고 찍을 수 있다');
  assert.ok(/lastSweepAt: Date\.now\(\)/.test(block), '★ 시각을 안 적는다');
  assert.ok(/sweepCanReadSms: body\.canReadSms === true/.test(block),
    '★ 문자함을 못 읽는 상태를 안 적는다 — 훑기가 도는데 왜 비는지 못 짚는다');
});

test('★ 화면이 볼 수 있게 «내보낸다»', () => {
  const block = cutBranch(SV, 'if (action === "pairStatus") {');
  assert.ok(/lastSweepAt: Number\(d\.lastSweepAt \|\| 0\)/.test(block),
    '★ 적어만 두고 안 내보내면 화면은 여전히 아무것도 모른다');
  assert.ok(/sweepCanReadSms: d\.sweepCanReadSms === true/.test(block),
    '★ 권한 상태도 내보내야 화면이 짚어 준다');
});
