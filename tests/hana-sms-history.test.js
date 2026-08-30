'use strict';
/* 지난 문자 가져오기 — 대표 지시 2026-08-29
     「이미 문자로 온 거 연결되어서 확인할 수 없나, 최근 1개월 이내 문자기록」

   왜 필요했나: 이 앱은 «알림»을 엿듣는다. 알림은 지나가면 사라지므로 앱을 깔기
   전에 온 문자는 아무리 기다려도 오지 않는다. 문자함에는 남아 있으니 거기서 끌어온다.

   ★ 이 검사가 지키는 것 — 「길이 둘로 갈라지지 않는다」
     2026-08-29 에 폰과 서버가 서로 다른 규칙을 갖는 바람에 카드 문자가 통째로
     버려졌다. 문자함 길을 새로 내면서 같은 사고를 반복할 자리가 셋 생겼다:
     ① 거르개를 여기 또 적기  ② 다리(post)를 또 만들기  ③ 대기함 자리를 따로 두기.
     셋 다 막는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { phoneAccepts, REAL } = require('./phone-filter.js');

const R = path.join(__dirname, '..');
const APP = path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main');
const read = (p) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n');

const MANIFEST = read(path.join(APP, 'AndroidManifest.xml'));
const J = (name) => read(path.join(APP, 'java', 'kr', 'pureun', 'hanabridge', name));
const READER = J('SmsHistoryReader.java');
const MAIN = J('MainActivity.java');
const SERVER = read(path.join(R, 'functions', 'index.js'));

/* ⚠ 주석을 걷어내고 본다. 안 걷으면 «주석에 적어 둔 옛 문구»를 코드로 착각한다 —
     이 검사를 처음 돌렸을 때 실제로 둘이 그렇게 잘못 걸렸다.
     「예전에는 …라고 적혀 있었다」라는 설명이 그대로 걸린 것이다. */
function bare(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}
const MAIN_CODE = bare(MAIN);
const READER_CODE = bare(READER);

/* ingest 갈래만 잘라 본다 — 파일 전체를 보면 붙여넣기 쪽 글자에 속는다.
   ⚠ 주석을 걷고 돌려준다. 안 걷었더니 「어디서 왔는지 남긴다」 검사가
     제 주석에 적힌 「지난 문자」를 보고 통과했다 — 코드를 지워도 안 물었다
     (일부러 되돌려 보고 잡았다). */
function ingestBranch() {
  const from = SERVER.indexOf('if (action === "ingest") {');
  const to = SERVER.indexOf('if (action === "ingestPaste") {');
  assert.ok(from > 0 && to > from, 'ingest 갈래를 못 찾았습니다');
  return bare(SERVER.slice(from, to));
}

/* ══════ ① 문자함을 읽을 수 있어야 한다 ══════ */

test('★ 문자함 읽기 권한을 밝힌다 — 없으면 지난 문자를 아예 못 본다', () => {
  assert.match(MANIFEST, /android\.permission\.READ_SMS/,
    'READ_SMS 가 없으면 문자함 읽기가 그 자리에서 막힙니다');
});

test('★ 화면의 보안 안내가 «참»이어야 한다 — 읽으면서 안 읽는다고 적지 않는다', () => {
  /* ⚠ 예전 안내는 「문자 읽기 권한은 사용하지 않습니다」였다. 권한을 더하면서
       그 줄을 안 고치면 화면이 거짓말을 한다 — 안 하느니만 못하다. */
  const notReading = /문자\s*읽기\s*권한은\s*사용하지\s*않습니다/;
  assert.ok(!notReading.test(MAIN_CODE),
    '★ 문자함을 읽으면서 「읽지 않습니다」라고 적혀 있습니다');
  assert.match(MAIN_CODE, /지난 문자 가져오기/,
    '언제 문자를 읽는지 안내에 없으면 사람이 놀랍니다');
});

test('권한은 «누를 때» 묻는다 — 앱을 열자마자 물으면 까닭을 모른 채 거절한다', () => {
  const at = MAIN.indexOf('requestPermissions(');
  assert.ok(at > 0, '권한을 물어보지 않습니다');
  const inOnCreate = MAIN.slice(MAIN.indexOf('protected void onCreate'), MAIN.indexOf('protected void onResume'));
  assert.ok(!/requestPermissions\(/.test(inOnCreate),
    '★ 앱을 열자마자 권한 창이 뜹니다 — 한 번 거절하면 되돌리기가 번거롭습니다');
});

test('거절해도 앱은 그대로 돈다 — 알림 길은 이 권한과 상관이 없다', () => {
  assert.match(MAIN_CODE, /새로 오는 문자는 그대로 보냅니다/,
    '거절했을 때 「그래도 새 문자는 온다」를 안 알려 줍니다');
});

/* ══════ ② 거르개를 두 벌로 만들지 않는다 (이번 사고의 뿌리) ══════ */

test('★★ 문자함 길도 «같은» 거르개를 쓴다 — 여기 또 적으면 두 길이 갈라진다', () => {
  assert.match(READER_CODE, /HanaMessageFilter\.isTransaction\(/,
    '★ 문자함 길이 제 잣대를 따로 씁니다');
  /* 규칙을 베껴 적은 흔적이 있으면 안 된다 */
  assert.ok(!/하나\s*카드|하나은행|Pattern\.compile/.test(READER_CODE),
    '★ SmsHistoryReader 안에 「하나」 규칙이 또 적혀 있습니다 — ' +
    '2026-08-29 에 폰과 서버가 갈라져 카드 문자를 통째로 버린 사고가 이것이었습니다');
});

test('★ 다리도 하나만 쓴다 — 올리는 길을 또 만들면 한쪽만 고쳐진다', () => {
  assert.match(MAIN_CODE, /HanaUploadWorker\.post\(/,
    '지난 문자를 보낼 때 기존 다리를 안 씁니다');
  assert.ok(!/HttpURLConnection|new URL\(/.test(MAIN_CODE),
    '★ MainActivity 가 서버로 가는 길을 따로 냈습니다');
});

test('★ 서버도 «같은» 해석기·대기함·중복막이를 쓴다', () => {
  const b = ingestBranch();
  assert.match(b, /HanaMessage\.parseHanaMessage\(/, '해석기가 갈라졌습니다');
  assert.match(b, /inbox\/\$\{linked\.uid\}\/\$\{tx\.id\}/, '대기함 자리가 갈라졌습니다');
  assert.match(b, /duplicate: true/, '중복막이가 없습니다');
});

/* ══════ ③ 지난 문자를 「폰이 살아 있다」로 읽지 않는다 ══════ */

test('★★ 지난 문자를 넣어도 lastOkAt 을 찍지 않는다 — 진짜 끊김을 가린다', () => {
  /* ⚠ 2026-08-30: 자국 찍기가 «한 자리»(hanaStampAlive)로 모였다.
     중복으로 되돌아갈 때도 자국을 남겨야 했는데, 세 군데에 흩어져 있으면
     한 군데만 고치고 나머지를 잊는다 — 실제로 그래서 화면이
     「연결 뒤 문자 0건」이라 거짓말했다.
     ⚠ 못 박을 것은 모양이 아니라 «lastOkAt 이 알림으로 온 것에만 찍히는가» 다. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const i = src.indexOf('const hanaStampAlive = async (linked, how) => {');
  assert.ok(i > 0, '자국 찍는 자리를 못 찾았습니다');
  let d = 0, end = -1;
  for (let k = src.indexOf('{', i + 40); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { end = k + 1; break; } }
  }
  /* ⚠ 주석을 «먼저 걷는다» — 이 함수의 주석에도 lastOkAt 이 적혀 있어서,
     걷지 않으면 「두 갈래에 있다」로 잘못 센다. 잘 쓴 주석이 검사를 깨뜨리면
     다음 사람은 주석을 지우게 된다. */
  const stamp = src.slice(i, end).replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(stamp, /else \{ patch\.lastOkAt = at;/,
    '★ 지난 문자를 끌어와도 「폰이 살아 있다」로 찍힙니다 — ' +
    '알림이 막힌 채 「멀쩡함」이 되어 진짜 끊김을 영영 못 알아챕니다');
  assert.strictEqual((stamp.match(/lastOkAt/g) || []).length, 1,
    '★★ lastOkAt 이 두 갈래 이상에 있습니다 — 알림이 도는지를 더는 알 수 없습니다');
  assert.match(stamp, /else if \(how === "history"\) patch\.lastHistoryAt = at;/,
    '★ 지난 문자를 넣고도 아무 자국을 안 남기면 화면이 영영 「누르세요」를 되풀이합니다');
});

test('어디서 왔는지 남는다 — 받은 때가 쓴 때보다 한참 뒤인 줄을 설명할 수 있어야 한다', () => {
  assert.match(ingestBranch(), /지난 문자/,
    '지난 문자로 들어온 것을 사람이 가릴 수 없습니다');
});

/* ══════ ④ 문자함을 통째로 훑지 않는다 ══════ */

test('★ 기간을 반드시 건다 — 조건 없이 읽으면 몇 해치를 전부 훑는다', () => {
  assert.match(READER_CODE, /Telephony\.Sms\.DATE \+ " >= \?"/,
    '★ 기간 조건이 없습니다 — 문자함 전체를 읽습니다');
  assert.match(READER_CODE, /MAX_MESSAGES/, '통수 상한이 없습니다');
});

test('기간 셈이 맞다 — 30일은 30일이어야 한다', () => {
  const m = READER.match(/static long cutoffFor\(int days, long now\)\s*\{\s*return ([^;]+);/);
  assert.ok(m, 'cutoffFor 를 못 찾았습니다');
  /* 자바 식을 그대로 계산해 본다 */
  const expr = m[1].replace(/\(long\)\s*/g, '').replace(/L/g, '');
  const cutoffFor = new Function('days', 'now', 'return ' + expr + ';');
  const now = 1756400000000;
  assert.equal(cutoffFor(30, now), now - 30 * 86400000, '30일 셈이 어긋납니다');
  assert.ok(cutoffFor(30, now) < now, '기준시각이 미래입니다');
});

test('최근 것부터 본다 — 상한에 걸려 잘릴 때 «옛 것»이 남으면 안 된다', () => {
  assert.match(READER_CODE, /Telephony\.Sms\.DATE \+ " DESC"/,
    '★ 오래된 것부터 읽으면 상한에 걸렸을 때 정작 최근 것이 빠집니다');
});

/* ══════ ⑤ 진짜 문자로 끝까지 시험한다 ══════ */

test('★ 실제 하나카드 문자가 문자함 길을 통과한다', () => {
  assert.equal(phoneAccepts(REAL.카드승인), true, '카드 승인이 걸러집니다');
  assert.equal(phoneAccepts(REAL.카드취소), true, '카드 취소가 걸러집니다');
  assert.equal(phoneAccepts(REAL.은행입금), true, '은행 입금이 걸러집니다');
});

test('★ 인증번호와 남의 카드사는 문자함 길에서도 안 나간다', () => {
  assert.equal(phoneAccepts(REAL.인증번호), false, '★ 인증번호가 서버로 나갑니다');
  assert.equal(phoneAccepts(REAL.남의은행), false, '하나가 아닌 문자가 나갑니다');
});

test('문자 원문을 앱에 남기지 않는다 — 읽어서 넘기고 버린다', () => {
  assert.ok(!/SharedPreferences|openFileOutput|FileWriter/.test(READER_CODE),
    '★ 읽은 문자를 폰에 적어 두고 있습니다');
});
