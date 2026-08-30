'use strict';
/* 「못 읽었다」와 「없다」는 다른 말이다 — 코덱스 지적 2026-08-30

   폰이 문자함을 훑다가 튕기면 예전에는 «0건»이 올라왔다.
   화면은 그 0을 그대로 믿고 「폰 문자함에 하나 문자가 없습니다」라고 단정했다.
   그 한마디를 읽은 사람은 은행 쪽을 뒤지러 간다 — 정작 고칠 곳은 폰인데.
   「모른다」를 「없다」로 바꿔 말하는 것은, 사람을 엉뚱한 데로 보내는 일이다.

   같은 자리에서 하나 더: 지난 문자를 300통에서 «조용히» 끊고
   「300통을 살펴봤습니다」라고만 알렸다. 남은 것을 아무도 몰랐다.

   이 검사가 못 박는 것 —
     ① 문자함 읽기는 «못 읽었다»로 시작해, 끝까지 갔을 때만 «봤다»가 된다
     ② 상한에 닿으면 «닿았다»고 남긴다 — 상한 자체도 300 같은 낮은 수가 아니다
     ③ 폰이 서버에 「끝까지 읽었나」를 함께 보낸다
     ④ 서버는 옛 판이 안 보낸 그 칸을 «거짓»이 아니라 «모름»으로 둔다
     ⑤ 화면은 «끝까지 읽었을 때만» 「없습니다」라고 단정한다
     ⑥ 앱 화면도 「못 읽음」을 「못 찾음」보다 «먼저» 가른다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const JAVA = path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/* ⚠ 주석을 먼저 걷는다. 안 걷으면 «왜 이렇게 했는지» 적어 둔 설명글이
     검사를 통과시킨다 — 2026-08-30 하루에 세 번 그렇게 헛통과했다. */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const reader = bare(read(path.join(JAVA, 'SmsHistoryReader.java')));
const sweep = bare(read(path.join(JAVA, 'HanaSweepWorker.java')));
const main = bare(read(path.join(JAVA, 'MainActivity.java')));
const fn = bare(read(path.join(R, 'functions', 'index.js')));
const erp = bare(read(path.join(R, 'pu-erp.html')));

/* ══════ ① 문자함 읽기는 「못 읽었다」로 시작한다 ══════ */

test('★★ 읽기는 «못 읽었다»로 시작해 끝까지 갔을 때만 «봤다»가 된다', () => {
  const at = reader.indexOf('static List<Item> recent(');
  assert.ok(at > 0, 'recent 를 찾지 못했습니다');
  const body = reader.slice(at, reader.indexOf('\n    }', at));

  const iInit = body.indexOf('lastFailed = true');
  const iClear = body.indexOf('lastFailed = false');
  assert.ok(iInit > 0,
    '★★ «못 읽었다»로 시작하지 않으면, 중간에 튕긴 것이 0건으로 보고됩니다');
  assert.ok(iClear > iInit,
    '★★ «봤다»로 바꾸는 자리가 시작보다 앞이면 아무것도 안 지킵니다');

  /* 훑는 고리보다 «뒤»에서 풀어야 한다 — 고리 안에서 풀면 첫 줄만 읽고 튕겨도 «봤다»가 된다 */
  assert.ok(iClear > body.indexOf('moveToNext()'),
    '★★ 고리를 다 돌기 «전»에 «봤다»로 바꾸면, 도중에 튕긴 것을 못 가립니다');
});

test('★ 못 읽으면(cursor 없음) «봤다»로 넘어가지 않는다', () => {
  const at = reader.indexOf('static List<Item> recent(');
  const body = reader.slice(at, reader.indexOf('\n    }', at));
  const iNull = body.indexOf('cursor == null');
  const iClear = body.indexOf('lastFailed = false');
  assert.ok(iNull > 0 && iNull < iClear,
    '★ 문자함을 아예 못 연 갈래가 «봤다» 뒤에 있으면 뜻이 없습니다');
});

/* ══════ ② 상한에 닿으면 「닿았다」고 남긴다 ══════ */

test('★★ 상한은 300 같은 낮은 수가 아니다 — 30일치가 조용히 잘렸다', () => {
  const m = reader.match(/MAX_MESSAGES\s*=\s*(\d+)/);
  assert.ok(m, 'MAX_MESSAGES 를 찾지 못했습니다');
  /* 값 자체가 규칙이 아니라 «너무 낮지 않은가»가 규칙이다.
     사업장 카드·통장 문자가 하루 열 통이면 30일에 300통을 넘는다. */
  assert.ok(Number(m[1]) >= 1000,
    '★★ 상한 ' + m[1] + '통은 30일치를 담기에 모자랍니다 — 오래된 거래가 조용히 잘립니다');
});

test('★★ 상한에 닿으면 «닿았다»를 남긴다 — 조용히 끊으면 남은 것을 아무도 모른다', () => {
  const at = reader.indexOf('static List<Item> recent(');
  const body = reader.slice(at, reader.indexOf('\n    }', at));
  assert.match(body, /MAX_MESSAGES[\s\S]{0,80}lastCapped\s*=\s*true/,
    '★★ 상한에 닿는 자리에서 표를 안 남기면, 잘린 사실이 어디에도 안 남습니다');
});

/* ══════ ③④ 폰이 보내고, 서버가 「모름」을 지킨다 ══════ */

test('★★ 폰이 서버에 «끝까지 읽었나»를 함께 보낸다', () => {
  assert.match(sweep, /readOk\s*=\s*found != null && !SmsHistoryReader\.lastFailed/,
    '★★ 읽기 성공 여부를 안 세면 보낼 것도 없습니다');
  assert.match(sweep, /ping\.put\("readOk", readOk\)/,
    '★★ 세어 놓고 안 보내면 서버는 여전히 0건만 봅니다');
  assert.match(sweep, /ping\.put\("capped", capped\)/,
    '★ 잘렸다는 표도 보내야 화면이 짚어 줍니다');
});

test('★ 앱 화면도 «0건»과 «못 읽음»을 갈라 말한다', () => {
  /* 서버로 보내는 것과 별개로, 폰 화면 글이 「문자를 지우셨나」로 몰면
     사람은 멀쩡한 문자함을 뒤진다. */
  const iFailed = main.indexOf('SmsHistoryReader.lastFailed');
  const iEmpty = main.indexOf('found.isEmpty()');
  assert.ok(iFailed > 0, '★ 앱 화면이 «못 읽음»을 아예 안 가릅니다');
  assert.ok(iFailed < iEmpty,
    '★★ «못 읽음»을 «못 찾음» 뒤에 두면, 못 읽은 것이 「문자가 없다」로 먼저 나갑니다');
  assert.match(main, /SmsHistoryReader\.lastCapped/,
    '★ 잘렸는데 안 알리면 남은 문자를 아무도 안 가져옵니다');
});

test('★★ 서버는 옛 판이 «안 보낸» 칸을 「거짓」이 아니라 「모름」으로 둔다', () => {
  const at = fn.indexOf('if (action === "sweepPing")');
  assert.ok(at > 0, 'sweepPing 갈래를 못 찾았습니다');
  const body = fn.slice(at, fn.indexOf('if (action === "pairStatus")', at));
  assert.match(body, /typeof body\.readOk === "boolean"/,
    '★★ 안 보낸 것을 «거짓»으로 적으면, 옛 판 폰이 모두 「문자함 못 읽음」이 됩니다');
  assert.match(body, /sweepReadOk/,
    '★ 받아 놓고 안 적으면 화면은 여전히 모릅니다');
});

test('★ pairStatus 가 «모름»을 모름 그대로 돌려준다', () => {
  const at = fn.indexOf('if (action === "pairStatus")');
  const body = fn.slice(at, fn.indexOf('if (action === "pairReset")', at));
  assert.match(body, /sweepReadOk:\s*typeof d\.sweepReadOk === "boolean" \? d\.sweepReadOk : null/,
    '★★ 여기서 Number()·Boolean() 로 뭉개면 «모름»이 «거짓»이 됩니다 — 화면이 거짓말을 합니다');
});

/* ══════ ⑤ 화면은 「끝까지 읽었을 때만」 단정한다 ══════ */

test('★★ 「폰 문자함에 하나 문자가 없습니다」는 «끝까지 읽었을 때만» 말한다', () => {
  const at = erp.indexOf('function hanaStatChip(');
  assert.ok(at > 0, 'hanaStatChip 을 찾지 못했습니다');
  const body = erp.slice(at, erp.indexOf('\n}', erp.indexOf('sweepAlive', at)));

  const iRead = body.indexOf('d.sweepReadOk === false');
  const iNone = body.indexOf('d.sweepFound === 0');
  assert.ok(iRead > 0,
    '★★ «못 읽었다» 갈래가 없으면, 조회 실패가 그대로 「문자가 없다」로 나갑니다');
  assert.ok(iRead < iNone,
    '★★ «못 읽었다»를 «0건» 뒤에 두면 영영 안 닿습니다 — 0건이 먼저 잡아챕니다');

  /* 단정하는 말은 «끝까지 읽었을 때만» 나가야 한다 */
  assert.match(body.slice(iNone), /d\.sweepReadOk === true[\s\S]{0,200}\?/,
    '★★ 읽기 성공을 안 따지고 「없습니다」라고 하면, 못 읽은 것을 없다고 단정합니다');
});

test('★ 「못 읽음」은 은행이 아니라 폰을 가리킨다', () => {
  /* ⚠ 못 박는 것은 «문장»이 아니라 «어디를 보라고 하는가» 다.
     말을 다듬었다고 검사가 깨지면 다음 사람이 검사를 지우게 된다. */
  const at = erp.indexOf('d.sweepReadOk === false');
  assert.ok(at > 0);
  const chip = erp.slice(at, at + 900);
  assert.match(chip, /세어 보지도 못한/,
    '★ 「없는 것이 아니라 못 센 것」이라고 짚지 않으면, 사람은 은행 쪽을 뒤집니다');
  assert.doesNotMatch(chip.split('true)')[0], /은행 문자 쪽을 봐야/,
    '★ 못 읽은 것을 은행 탓으로 돌리면 안 됩니다');
});

/* ══════ 판 번호 ══════ */

test('★ 폰 앱 판 번호는 세 자리가 «같다»', () => {
  /* 한 곳만 올리면 폰이 거짓 판 번호를 보내고, 그것을 믿고 엉뚱한 데를 뒤진다. */
  const gradle = read(path.join(R, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts'));
  const cfg = read(path.join(JAVA, 'BridgeConfig.java'));
  const v = (s, re) => { const m = s.match(re); return m && m[1]; };
  const a = v(gradle, /versionName\s*=\s*"([\d.]+)"/);
  const b = v(cfg, /APP_VERSION\s*=\s*"([\d.]+)"/);
  const c = v(read(path.join(R, 'pu-erp.html')), /HANA_APK_VER\s*=\s*'([\d.]+)'/);
  assert.equal(b, a, '★ BridgeConfig 판 번호가 build.gradle.kts 와 다릅니다');
  assert.equal(c, a, '★ 화면이 알리는 판 번호가 앱과 다릅니다 — 「받았는데 옛것」이 됩니다');
});
