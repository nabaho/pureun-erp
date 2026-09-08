/* 판독 한도 — 「누를 때만」과 「누가 얼마나 썼나」 (대표 지시·물음 2026-09-08)
 *
 *   「문서일 경우 문서는 자동판독 눌러야 된다는 표시 좀 해 달라」
 *
 * ★★ 이 검사가 지키는 것 셋:
 *   ① 저절로 «걸지 않는다» — 하루 몫을 태우던 것이 바로 그것이었다
 *   ② 그러면서 «표시»가 있다 — 없으면 이 바꿈은 그냥 「판독 고장」이다
 *   ③ 사람이 누르는 길은 «하나도» 막지 않는다
 *
 * ⚠ 값을 박지 않는다. 값 자체가 규칙인 것만 까닭과 함께 박는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { stripComments } = require('./strip-comments.js');
const { cutFn } = require('./cut-fn.js');

const ROOT = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');
const APP = stripComments(RAW);
const DR = require(path.join(ROOT, 'functions', 'doc-read.js'));
const READER = stripComments(fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-read.js'), 'utf8'));
const IDX = stripComments(fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8'));
const STORE = stripComments(fs.readFileSync(path.join(ROOT, 'js', 'pu-photo-store.js'), 'utf8'));

/* ══════ ① 저절로 걸지 않는다 ══════════════════════════════════════ */

test('★★★ 화면을 열 때 «저절로» 판독에 걸지 않는다 — 하루 몫을 태우던 것이 이것이었다', () => {
  const fn = stripComments(cutFn(RAW, 'function autoReadPending('));
  assert.ok(fn, 'autoReadPending 이 없습니다');
  assert.ok(!/queuePhotoRead\(/.test(fn),
    '★★★ 세는 함수가 아직 «직접 걸고» 있습니다 — 서류는 한 장씩 오므로 '
    + '올리는 족족 저절로 읽혀 평소 업무가 그대로 하루 몫을 태웁니다.');
});

test('★★ 거는 일은 «누를 때» 부르는 자리 하나에 모였다', () => {
  const run = stripComments(cutFn(RAW, 'function readWaitRun('));
  assert.ok(run, '★ 눌러서 거는 자리(readWaitRun)가 없습니다');
  assert.match(run, /queuePhotoRead\(/, '★ 눌러도 아무것도 안 걸립니다');
  /* ⚠ 상한을 버리면 안 된다 — 400장을 한 번에 걸면 그 한 번으로 하루 몫이 사라진다 */
  assert.match(run, /autoReadPending\(\)/,
    '★★ 거는 쪽이 상한·차례 규칙(안 읽은 것 먼저·20장·문서마다 한 번)을 다시 짜고 있습니다 '
    + '— 두 벌이 되면 한쪽만 고쳐집니다.');
  /* ⚠ 상한에 걸려 남은 것을 «조용히 버리지» 않는다 — 안 알리면 그것이 곧
     「올렸는데 판독이 안 된다」다(이 저장소가 가장 여러 번 밟은 자리). */
  assert.match(run, /남은/, '★★ 상한에 걸려 남은 것을 조용히 버립니다');
  assert.match(run, /p\.rest/, '★ 「남은」이라 말만 하고 몇 장인지 안 셉니다');
});

test('★ 한 장만 누르는 길도 있다 — 「이 한 장이 급하다」가 안 되면 20장을 다 걸게 된다', () => {
  const one = stripComments(cutFn(RAW, 'function readWaitOne('));
  assert.ok(one, '★ 한 장만 읽는 자리가 없습니다');
  assert.match(one, /queuePhotoRead\(/, '한 장 단추가 아무것도 안 겁니다');
  /* ⚠ 그릴 때와 누를 때 사이에 화면이 바뀔 수 있다 — 문지기를 «다시» 본다 */
  assert.match(one, /readWaitOf\(/,
    '★★ 문지기를 다시 안 봅니다 — 그린 뒤 한도에 걸렸어도 그대로 걸어 몫을 더 태웁니다');
});

/* ══════ ② 표시가 있다 ═══════════════════════════════════════════ */

test('★★★ 칸에 «눌러야 한다»는 딱지가 붙는다 — 대표 지시의 본문이다', () => {
  assert.match(APP, /판독 필요/,
    '★★★ 저절로 읽지 않게만 해 놓고 «표시»를 안 붙였습니다 — 그러면 이 바꿈은 '
    + '「판독이 고장 났다」로 읽히고, 서류가 조용히 안 읽힌 채 남습니다.');
  assert.match(APP, /class="tag wait"/, '★ 딱지에 제 갈래가 없습니다(색으로 못 가립니다)');
});

test('★★ 딱지가 «실제로 쓰인다» — 만들어 놓고 안 쓰면 그대로 통과한다', () => {
  const 딱지줄 = (APP.match(/const tag = [^;]*holdTag[^;]*;/) || [''])[0];
  assert.ok(딱지줄, '★ 격자 칸의 딱지를 고르는 줄이 없습니다');
  assert.match(딱지줄, /waitTag/,
    '★★ 「판독 필요」 딱지를 만들어 놓고 칸에 «안 씁니다» — 딱지줄: ' + 딱지줄);
  /* ⚠ 「보류」가 이겨야 한다 — 보류인 장은 «답할» 차례이지 «누를» 차례가 아니다 */
  assert.ok(딱지줄.indexOf('holdTag') < 딱지줄.indexOf('waitTag'),
    '★★ 「판독 필요」가 「보류」를 이깁니다 — 아직 물음에 답도 안 한 장을 누르라고 합니다');
});

test('★★ 칸의 [🔤 판독] 단추가 «딱지와 같은 판정»을 쓴다 — 따로 세면 어긋난다', () => {
  const 단추 = (APP.match(/const rdgo = [^;]*;/) || [''])[0];
  assert.ok(단추, '★ 칸에 한 장 판독 단추가 없습니다');
  assert.match(단추, /waitTag/,
    '★★ 단추가 딱지와 다른 셈을 합니다 — 딱지는 있는데 단추가 없거나 그 반대가 됩니다');
  /* 실제로 칸에 그려지는가 — 만들어 놓고 안 붙이면 그대로 통과한다 */
  assert.ok((APP.match(/\+ rdgo \+/g) || []).length >= 2,
    '★★ 단추를 만들어 놓고 칸에 «안 붙였습니다» — 서류 칸과 사진 칸 둘 다에 붙어야 합니다');
});

test('★★ 단추를 눌러도 «칸이 열리지 않는다» — 사진이 화면을 덮으면 딱지가 사라지는 것을 못 본다', () => {
  const i = APP.indexOf("$('grid').addEventListener('click'");
  assert.ok(i > 0, '격자 누르기 자리가 없습니다');
  const 몸 = APP.slice(i, i + 1400);
  const 판독 = 몸.indexOf('data-rdgo'), 고르기 = 몸.indexOf(".ck");
  assert.ok(판독 > 0, '★ 한 장 판독 단추를 안 받습니다 — 눌러도 아무 일이 없습니다');
  assert.ok(판독 < 고르기,
    '★★ 판독 단추를 열기·고르기보다 «뒤»에서 봅니다 — 함께 열려 버립니다');
  assert.match(몸.slice(판독 - 200, 판독 + 300), /stopPropagation/,
    '★ 사건이 칸으로 번지는 것을 안 막습니다');
});

test('★★ 띠가 «몇 장 기다리는지» 센다 — 안 세면 안 읽힌 것을 한 달 뒤에 안다', () => {
  const fn = stripComments(cutFn(RAW, 'function renderReadAsk('));
  assert.ok(fn, 'renderReadAsk 가 없습니다');
  assert.match(fn, /readWaitOf/, '★ 띠가 기다리는 것을 안 봅니다');
  assert.match(fn, /readWaitRun\(\)/, '★ 띠에 한 번에 거는 단추가 없습니다');
  /* ⚠ 「보류」 물음이 이겨야 한다 — 둘을 함께 띄우면 무엇을 먼저 눌러야 할지 모른다 */
  assert.ok(fn.indexOf('readQuotaOut') < fn.indexOf('readHoldIds'),
    '★★ 한도가 이겨야 합니다 — 「서류입니다」라고 답해도 오늘은 못 읽습니다');
  assert.ok(fn.indexOf('readHoldIds') < fn.indexOf('readWaitOf'),
    '★★ 「보류」 물음이 기다림 띠를 이겨야 합니다');
});

/* ══════ ③ 사람이 누르는 길은 막지 않는다 ═════════════════════════ */

test('★★★ 한도에 걸렸으면 «눌러도 같은 답»이라 딱지를 안 붙인다 — 헛클릭이 몫을 더 태운다', () => {
  const fn = stripComments(cutFn(RAW, 'function readWaitOf('));
  assert.ok(fn, 'readWaitOf 가 없습니다');
  assert.match(fn, /readQuotaOut/,
    '★★ 오늘 몫이 없는데 「판독 필요」라고 적습니다 — 누를수록 몫을 더 태웁니다');
  assert.match(fn, /mayTouch\(/,
    '★★ 남의 사진에 단추를 붙입니다 — 눌러도 서버가 막아 헛일이고 몫만 나갑니다');
  assert.match(fn, /readSkipWhy\(/,
    '★ 「그냥 사진」이라 한 것·「보류」 중인 것에도 단추가 붙습니다');
});

test('★ 이미 줄에 있는 것에는 안 붙는다 — 두 번 걸면 몫이 두 배다', () => {
  const fn = stripComments(cutFn(RAW, 'function readWaitOf('));
  assert.match(fn, /_queuedRead/, '★ 이미 걸린 것에 또 단추가 붙습니다');
});

test('★★ 한도 띠가 «사람이 누르는 길은 열려 있다»고 말한다 — 급한 서류 한 장이 있다', () => {
  assert.match(APP, /사람이 누르는 길은 막지 않습니다/,
    '★★ 「오늘은 아무것도 못 한다」로 읽힙니다 — 급한 서류 한 장을 손으로 읽는 길은 열려 있습니다');
});

/* ══════ ⑤ 누가 얼마나 썼나 ═══════════════════════════════════════ */

test('★★ 앱 이름은 «아는 것만» 받는다 — 실시간DB 열쇠에 못 쓰는 글자가 있다', () => {
  DR.APPS.forEach(function (a) { assert.equal(DR.appOf(a), a, a + ' 를 못 알아봅니다'); });
  assert.equal(DR.appOf('아무거나'), 'other', '모르는 이름을 그대로 씁니다');
  assert.equal(DR.appOf(''), 'other');
  assert.equal(DR.appOf(null), 'other', '없는 값에서 넘어집니다');
  /* ⚠⚠ 실시간DB 열쇠에 . # $ / [ ] 가 들어가면 그 자리가 «통째로» 안 써진다 */
  assert.equal(DR.appOf('a/b'), 'other', '★★ 열쇠에 / 가 들어갑니다 — 층이 갈라집니다');
  assert.equal(DR.appOf('a.b'), 'other', '★★ 열쇠에 . 이 들어갑니다');
  assert.equal(DR.appOf('$x'), 'other');
  assert.equal(DR.appOf('PHOTOS'), 'photos', '큰 글자로 오면 못 알아봅니다');
});

test('★★ 셈은 «한국 날짜»로 센다 — UTC 로 세면 아침 9시 전이 어제로 들어간다', () => {
  /* 검사고정-허용: 한국은 UTC+9 가 «규칙»이다.
     2026-09-08 00:30 KST = 2026-09-07 15:30 UTC — UTC 로 세면 어제 칸에 들어간다. */
  const kst0030 = Date.UTC(2026, 8, 7, 15, 30);
  assert.equal(DR.ymdKST(kst0030), '2026-09-08',
    '★★ 자정 넘어 올린 것이 «어제» 칸에 들어갑니다 — 오늘 얼마 썼는지가 틀립니다');
  const kst2330 = Date.UTC(2026, 8, 8, 14, 30);   // 2026-09-08 23:30 KST
  assert.equal(DR.ymdKST(kst2330), '2026-09-08');
});

test('★★ 「부른 수」와 「한도에 막힌 수」를 «가른다» — 합치면 아껴 쓴 날과 걸린 날이 같아 보인다', () => {
  const n = DR.tallyPaths('photos', '2026-09-08', 'n');
  const q = DR.tallyPaths('photos', '2026-09-08', 'quota');
  assert.notDeepEqual(n, q, '★ 두 셈이 같은 자리에 쌓입니다');
  n.forEach(function (p) { assert.match(p, /\/n$/, '부른 수의 자리가 아닙니다: ' + p); });
  q.forEach(function (p) { assert.match(p, /\/quota$/, '막힌 수의 자리가 아닙니다: ' + p); });
});

test('★★ 앱별과 «합계»를 함께 센다 — 합계가 없으면 「오늘 몇 번」을 못 말한다', () => {
  const p = DR.tallyPaths('photos', '2026-09-08', 'n');
  assert.equal(p.length, 2, '★ 세는 자리가 둘(앱별·합계)이 아닙니다');
  assert.ok(p.some(function (x) { return x.indexOf('/photos/') > 0; }), '앱별 자리가 없습니다');
  assert.ok(p.some(function (x) { return x.indexOf('_all') > 0; }), '합계 자리가 없습니다');
  /* 앱이 달라지면 앱별 자리«만» 달라진다 — 합계는 같은 자리에 모여야 한다 */
  const q = DR.tallyPaths('kcareer', '2026-09-08', 'n');
  assert.notEqual(p[0], q[0], '앱이 달라도 같은 자리에 쌓입니다');
  assert.equal(p[1], q[1], '★★ 합계가 앱마다 따로 쌓입니다 — 「오늘 몇 번」이 안 나옵니다');
});

test('★★★ 앱 이름을 «부르는 쪽마다» 적게 하지 않는다 — 여섯 군데 중 한 곳만 빠져도 셈이 틀린다', () => {
  assert.match(READER, /function appName\(/, '★ 앱 이름을 스스로 알아내는 자리가 없습니다');
  assert.match(READER, /location/,
    '★★★ 화면 파일 이름에서 안 알아냅니다 — 부르는 곳마다 적게 하면 한 곳은 반드시 빠지고, '
    + '그 앱은 셈에서 사라져 「사진첩이 다 썼다」는 틀린 답이 나옵니다');
  assert.match(READER, /app:\s*appName\(\)/, '★ 앱 이름을 서버로 안 보냅니다');
});

test('★ 사람에게 보일 이름표는 «이름을 정하는 곳»에 있다 — 두 곳이면 한쪽만 고쳐진다', () => {
  /* ⚠ 그냥 /APP_KO/ 로 보면 «이름만 바꿔도» 통과한다(APP_KO_GONE 이 걸렸다).
     실제로 «내보내는지»를 본다 — 화면은 내보낸 것만 받아 쓸 수 있다. */
  assert.match(READER, /var APP_KO\s*=\s*\{/, '★ 이름표 표가 없습니다');
  assert.match(READER, /APP_KO:\s*APP_KO/,
    '★ 이름표를 안 내보냅니다 — 화면이 못 받아 「other 12번」처럼 뜹니다');
  /* ⚠ 사진첩 화면에 다른 앱 이름을 글자로 적으면 「다른 앱의 루트를 건드리지 않는다」가
     걸린다(그 검사가 옳다). 그래서 화면은 이름표를 «받아» 쓴다. */
  assert.match(APP, /PuDocRead.*APP_KO/,
    '★ 화면이 이름표를 스스로 들고 있습니다 — 앱이 늘 때 한쪽만 고쳐집니다');
});

test('★★★ 셈을 적다 실패해도 «판독은 계속된다» — 세는 일 때문에 못 읽으면 훨씬 큰 손해다', () => {
  const fn = stripComments(cutFn(IDX, 'async function bumpReadTally('));
  assert.ok(fn, 'bumpReadTally 가 없습니다');
  /* ⚠ /catch/ 만 보면 «큰 조각을 잘랐을 때» 다른 catch 가 대신 통과시킨다.
     그래서 «이 함수가 스스로 삼킨다»는 증거 — 그 자리에 적어 둔 말 — 을 본다. */
  assert.match(fn, /catch\s*\(/,
    '★★★ 셈을 적다 터지면 판독이 함께 멎습니다 — 숫자 하나 때문에 서류를 못 읽습니다');
  assert.match(fn, /판독은 계속/,
    '★★★ 삼키면서 «왜 삼키는지»를 안 적었습니다 — 다음 사람이 catch 를 걷어 냅니다 '
    + '(2026-09-03 뉴스레터 셈이 조용히 안 쌓인 것을 아무도 몰랐던 까닭입니다)');
  /* ⚠⚠ 2026-09-03 뉴스레터 열람 셈이 «바로 이 자리»에서 매번 터졌다 —
     이 파일에 admin 변수가 없는데 admin.database.ServerValue 를 썼고, catch 가
     조용히 삼켜 「기록만 안 남았다」. 같은 함정을 다시 밟지 않게 못 박는다. */
  assert.ok(!/\badmin\.database\b/.test(fn),
    '★★★ 이 파일에는 admin 변수가 «없습니다» — admin.database.ServerValue 는 매번 터지고 '
    + 'catch 가 조용히 삼켜 셈이 하나도 안 쌓입니다(2026-09-03 뉴스레터에서 이미 겪었습니다)');
  assert.match(fn, /transaction\(/, '★ 거래로 안 올리면 넷이 같은 때 부를 때 어긋납니다');
});

test('★ 성공·실패 «둘 다» 센다 — 성공만 세면 한도에 걸린 날이 「조용한 날」로 보인다', () => {
  const i = IDX.indexOf('DR.callGemini(fetch, key, v.parts, null, v.cfg)');
  assert.ok(i > 0, '판독을 부르는 자리를 못 찾았습니다');
  const 몸 = IDX.slice(i, i + 700);
  assert.match(몸, /bumpReadTally\(/, '★ 부른 뒤 세지 않습니다');
  const 셈 = 몸.indexOf('bumpReadTally('), 되돌림 = 몸.indexOf('if (!r.ok)');
  assert.ok(셈 > 0 && 셈 < 되돌림,
    '★★ 실패하면 «세기 전에» 돌아갑니다 — 한도로 막힌 날이 셈에 안 남습니다');
  assert.match(몸, /dailyQuotaGone/, '★ 「막힌 것」과 「그냥 부른 것」을 안 가립니다');
});

test('★★ 화면이 실시간DB를 «직접» 안 만진다 — 읽기도 저장 층을 지난다', () => {
  assert.match(STORE, /function readTally\(/, '★ 저장 층에 셈 읽기가 없습니다');
  assert.match(APP, /PuPhotoStore\.readTally\(/, '★ 화면이 셈을 스스로 읽습니다');
  assert.ok(!APP.includes("db.ref('ai_read_tally"),
    '★★ 화면이 db.ref 로 직접 읽습니다 — 상위 노드 set 같은 사고 길이 다시 열립니다');
});

/* ══════ 모델 — 몫은 모델마다 따로다 ══════════════════════════════ */

test('★ 쓸 모델이 여럿이다 — 몫은 모델마다 따로라 목록 길이가 곧 하루치다', () => {
  assert.ok(DR.MODELS.length >= 3,
    '★ 모델이 ' + DR.MODELS.length + '개뿐입니다 — 둘 다 떨어지면 자정까지 끝입니다');
  assert.equal(new Set(DR.MODELS).size, DR.MODELS.length,
    '★ 같은 모델이 두 번 들어 있습니다 — 늘어난 것처럼 보이지만 몫은 그대로입니다');
});

test('★★ 브라우저와 서버가 «같은 모델 목록»을 본다 — 어긋나면 한쪽만 늘어난다', () => {
  const m = READER.match(/var MODELS = \[([^\]]*)\]/);
  assert.ok(m, '브라우저 쪽 모델 목록이 없습니다');
  const 브라우저 = m[1].split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); })
    .filter(Boolean);
  assert.deepEqual(브라우저, DR.MODELS,
    '★★ 두 목록이 어긋났습니다 — 옛길(직접 부르기)로 도는 화면은 늘어난 몫을 못 씁니다');
});

/* ══════ 서버 규칙 ═════════════════════════════════════════════════ */

const RULES = JSON.parse(cp.execFileSync('node',
  [path.join(ROOT, 'scripts', 'make-firebase-rules.js')], { encoding: 'utf8' })).rules;

test('★★★ 셈은 «아무도 못 쓴다» — 브라우저가 숫자를 부풀려 꾸미지 못하게', () => {
  const t = RULES.ai_read_tally;
  assert.ok(t, '★ 셈 자리에 규칙이 없습니다 — 서버가 적어도 화면이 못 읽습니다');
  assert.equal(t['.write'], false,
    '★★★ 브라우저가 셈을 쓸 수 있습니다 — 「사진첩이 다 썼다」를 꾸며 낼 수 있습니다');
  assert.ok(t['.read'], '★ 아무도 못 읽으면 세어 둔 뜻이 없습니다');
});

test('★ 숫자만 받는다 — 사진·글·이름이 새어 들어갈 자리가 없다', () => {
  const c = RULES.ai_read_tally.$ymd.$app;
  ['n', 'quota'].forEach(function (k) {
    assert.match(c[k]['.validate'], /isNumber/, '★ ' + k + ' 에 글자가 들어갑니다');
  });
  assert.equal(c.$other['.validate'], false,
    '★★ 모르는 칸이 그냥 들어옵니다 — 셈 자리에 사람 이름이 쌓일 수 있습니다');
});
