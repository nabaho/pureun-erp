/* Vision 판독 대리인 — 열쇠는 서버가 든다 (대표 물음 2026-09-08 「무료 OCR 이 더 있나」)
 *
 * ★★★ 이 검사가 지키는 것 가운데 하나는 «되살아나지 않게 막는 것»이다.
 *   `pu-erp.html` 에는 Vision 열쇠를 «공용 DB(data/vision_api_key)»에 담는 칸이 있었다.
 *   그 자리는 재직 직원 누구나 읽는다 — 넣는 순간 새어 나가고 요금은 회사에 붙는다.
 *   enter.html 이 스스로 「유료 키는 여기 두지 않습니다」라고 적어 두고도 남아 있었다.
 *   ⚠ 2026-09-08 확인 결과 아직 아무 열쇠도 안 들어 있었다 — 넣기 전에 닫았다.
 *
 * 지키는 것:
 *   ① 브라우저가 Vision 을 «직접» 부르지 않는다 (열쇠가 브라우저에 없다)
 *   ② 열쇠가 오류 글에 섞여 나가지 않는다
 *   ③ 로그인한 사람만 부른다 — 아니면 우리 열쇠가 공개 판독기가 된다
 *   ④ 몫을 Gemini 와 «갈라» 센다 (하루 몫 ↔ 달마다 1,000장)
 *   ⑤ 열쇠가 없을 때 «고장»이 아니라 「아직 없다」로 말한다 (물러설 길이 있다)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { stripComments } = require('./strip-comments.js');
const { cutFn } = require('./cut-fn.js');

const ROOT = path.join(__dirname, '..');
const VR = require(path.join(ROOT, 'functions', 'vision-read.js'));
const DR = require(path.join(ROOT, 'functions', 'doc-read.js'));
const IDX = stripComments(fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8'));
const ERP_RAW = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const ERP = stripComments(ERP_RAW);
const READER = stripComments(fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-read.js'), 'utf8'));

/* ══════ ① 열쇠가 브라우저에 없다 ═══════════════════════════════════ */

test('★★★ 브라우저가 Vision 을 «직접» 부르지 않는다 — 그러면 열쇠가 브라우저에 있다는 뜻이다', () => {
  assert.ok(!/vision\.googleapis\.com/.test(ERP),
    '★★★ 화면이 Vision 을 직접 부릅니다 — 열쇠가 브라우저에 있어야 하고, 그것은 새어 나갑니다');
  assert.ok(!/vision\.googleapis\.com/.test(READER),
    '★★★ 공용 판독기가 Vision 을 직접 부릅니다');
});

test('★★★ 열쇠를 «공용 DB»에 담는 길이 없다 — 그 자리는 직원 누구나 읽는다', () => {
  assert.ok(!/dbSet\(\s*['"]vision_api_key['"]/.test(ERP),
    '★★★ 열쇠를 공용 저장소에 담습니다 — 넣는 순간 직원 누구나 읽습니다');
  assert.ok(!/_readSyncKey\(\s*['"]vision_api_key['"]/.test(ERP),
    '★★★ 열쇠를 브라우저 저장소에서 읽습니다 — 그 길이 있으면 다시 담게 됩니다');
  assert.ok(!/function getVisionApiKey/.test(ERP),
    '★★★ 브라우저에서 열쇠를 꺼내는 함수가 되살아났습니다');
});

test('★★ 「어디서 넣나」를 화면이 알려 준다 — 칸만 없애면 다음 사람이 다시 만든다', () => {
  assert.match(ERP, /functions:secrets:set VISION_KEY/,
    '★★ 열쇠 칸을 없애 놓고 «어디에 넣는지»를 안 알려 줍니다 — 그러면 그 칸이 다시 생깁니다');
  assert.match(ERP, /서버가 들고 있습니다/, '★ 왜 못 넣는지를 안 말합니다');
});

test('★★★ 서버가 열쇠를 «브라우저로 돌려주지» 않는다', () => {
  const fn = stripComments(cutFn(fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8'),
    'function readVisionKey('));
  assert.ok(fn, 'readVisionKey 가 없습니다');
  /* 답으로 나가는 것은 글과 쪽수뿐이어야 한다 */
  const i = IDX.indexOf('exports.readVision');
  const 몸 = IDX.slice(i, i + 3000);
  const 답 = (몸.match(/res\.json\(\{[^}]*\}\)/g) || []).join(' ');
  assert.ok(!/key/i.test(답), '★★★ 답에 열쇠가 섞여 나갑니다: ' + 답);
  assert.match(답, /text/, '글을 안 돌려줍니다');
});

test('★ 열쇠는 «금고에서만» 온다 — 실시간DB 갈래를 새로 만들지 않았다', () => {
  const fn = stripComments(cutFn(fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8'),
    'function readVisionKey('));
  assert.match(fn, /process\.env\.VISION_KEY/, '금고에서 안 읽습니다');
  assert.ok(!/getDatabase|db\.ref/.test(fn),
    '★★ 실시간DB 에서 열쇠를 읽습니다 — 그 자리는 직원 누구나 읽습니다(Gemini 의 옛 실수입니다)');
});

test('★ 자리 채우개를 «없는 것»으로 본다 — 금고에 비밀이 있어야 배포되므로 먼저 자리만 만든다', () => {
  const fn = stripComments(cutFn(fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8'),
    'function readVisionKey('));
  assert.match(fn, /unset/, '★ 자리 채우개로 구글을 부르면 403 만 받습니다');
  assert.match(fn, /length < \d+/, '★ 너무 짧은 값을 열쇠로 씁니다');
});

/* ══════ ② 열쇠가 오류 글에 섞여 나가지 않는다 ═════════════════════ */

test('★★★ 오류 글에서 열쇠를 «지운다» — 그대로 찍히면 그것이 유출이다', () => {
  const key = 'AIzaSyEXAMPLEEXAMPLEEXAMPLEEXAMPLE12';
  const 글 = VR.safeReason({ error: { message: 'bad key ' + key + ' at url' } }, key);
  assert.ok(!글.includes(key), '★★★ 오류 글에 열쇠가 그대로 남았습니다: ' + 글);
  assert.match(글, /열쇠/, '지운 자리를 알려 주지 않습니다');

  /* ⚠⚠ AIza 로 시작하는 열쇠로만 재면 «넘겨준 열쇠를 지우는 줄»을 지워도 통과한다 —
       뒤에 있는 「열쇠꼴 글자 지우기」가 대신 잡아 주기 때문이다(되돌림에서 드러났다).
     ★ 그래서 «열쇠꼴이 아닌» 열쇠로도 잰다. 구글 AI 스튜디오 열쇠는 AQ. 로 시작하고,
       앞으로 모양이 또 바뀔 수도 있다 — 넘겨준 열쇠는 «모양과 무관하게» 지워야 한다. */
  const 딴모양 = 'AQ.zzzTOPSECRETzzzTOPSECRETzzz';
  const 글2 = VR.safeReason({ error: { message: 'x ' + 딴모양 + ' y' } }, 딴모양);
  assert.ok(!글2.includes(딴모양),
    '★★★ 넘겨준 열쇠를 «모양이 다르면» 안 지웁니다 — 열쇠 모양이 바뀌면 그대로 새어 나갑니다: ' + 글2);
});

test('★★ 열쇠를 «안 넘겨도» 열쇠꼴 글자를 지운다 — 구글이 딴 열쇠를 되돌려 줄 수도 있다', () => {
  const 글 = VR.safeReason({ error: { message: 'x AIzaSyOTHERKEYOTHERKEYOTHERKEY123 y' } }, null);
  assert.ok(!/AIzaSy/.test(글), '★★ 열쇠꼴 글자가 그대로 나갑니다: ' + 글);
});

test('오류 글이 없거나 모양이 다르면 조용히 빈 글', () => {
  assert.equal(VR.safeReason(null, 'k'), '');
  assert.equal(VR.safeReason({}, 'k'), '');
});

/* ══════ ③ 로그인한 사람만 ═══════════════════════════════════════ */

test('★★★ 로그인 확인을 «부르기 전에» 한다 — 아니면 우리 열쇠가 공개 판독기가 된다', () => {
  const i = IDX.indexOf('exports.readVision');
  assert.ok(i > 0, 'readVision 이 없습니다');
  const 몸 = IDX.slice(i, i + 3000);
  const 문지기 = 몸.indexOf('requireReader');
  const 부르기 = 몸.indexOf('VR.callVision');
  assert.ok(문지기 > 0, '★★★ 누가 부르는지 확인하지 않습니다');
  assert.ok(문지기 < 부르기, '★★★ 확인보다 «먼저» 구글을 부릅니다 — 요금이 그대로 나갑니다');
  const 열쇠읽기 = 몸.indexOf('readVisionKey');
  assert.ok(문지기 < 열쇠읽기, '★★ 확인보다 먼저 열쇠를 꺼냅니다');
});

test('★★ 화면도 로그인 없이는 «안 부른다» — 401 만 받고 사람은 까닭을 모른다', () => {
  const fn = stripComments(cutFn(ERP_RAW, 'function ocrWithGoogleVision('));
  assert.ok(fn, 'ocrWithGoogleVision 이 없습니다');
  assert.match(fn, /currentUser/, '★ 로그인 여부를 안 봅니다');
  /* ⚠ 「currentUser 라는 글자가 있나」로는 모자란다 — 값을 꺼내 놓고 «보지 않으면»
       그대로 통과한다(되돌림에서 드러났다). 없을 때 곧바로 돌아서는지를 본다. */
  assert.match(fn, /if\s*\(\s*!u\s*\)/,
    '★★ 로그인 값을 꺼내 놓고 «없을 때 돌아서지 않습니다» — 서버가 401 로 막을 뿐이고 '
    + '사람은 「판독이 안 된다」로만 봅니다');
  assert.match(fn, /getIdToken/, '★★ 로그인 증명을 안 보냅니다 — 서버가 401 로 막습니다');
  assert.match(fn, /Bearer/, '★ 증명을 머리글에 안 담습니다');
});

/* ══════ ④ 몫을 갈라 센다 ═════════════════════════════════════════ */

test('★★ Vision 셈이 Gemini 셈과 «딴 자리»다 — 몫이 다른 곳이다', () => {
  const n = DR.tallyPaths('erp', '2026-09-08', 'n');
  const v = DR.tallyPaths('erp', '2026-09-08', 'vision');
  assert.notDeepEqual(n, v, '★★ 한 자리에 쌓입니다 — 하루 몫과 달마다 몫이 섞입니다');
  v.forEach(function (p) { assert.match(p, /\/vision$/, 'Vision 자리가 아닙니다: ' + p); });
});

test('★ 모르는 갈래는 «부른 수»로 떨어진다 — 아무 이름이나 새 칸을 만들면 안 된다', () => {
  assert.deepEqual(DR.tallyPaths('erp', '2026-09-08', '아무거나'),
    DR.tallyPaths('erp', '2026-09-08', 'n'),
    '★ 모르는 갈래가 새 칸을 만듭니다 — 서버 규칙이 그것을 물립니다');
  assert.deepEqual(DR.TALLY_KINDS, ['n', 'quota', 'vision']);
});

test('★★ Vision 을 부른 뒤 «반드시» 센다 — 안 세면 달 몫이 얼마 남았는지 알 수 없다', () => {
  const i = IDX.indexOf('exports.readVision');
  const 몸 = IDX.slice(i, i + 3000);
  assert.match(몸, /bumpReadTally\([^)]*vision/,
    '★★ Vision 을 센 자리가 없습니다 — 달마다 1,000장 가운데 얼마 썼는지 모릅니다');
  const 셈 = 몸.indexOf('bumpReadTally('), 되돌림 = 몸.indexOf('if (!r.ok)');
  assert.ok(셈 > 0 && 셈 < 되돌림, '★★ 실패하면 «세기 전에» 돌아갑니다');
});

/* ══════ ⑤ 열쇠가 없을 때 ═════════════════════════════════════════ */

test('★★ 부를 자격이 없으면 «고장»이 아니라 그렇다고 말한다 — 물러설 길이 있다', () => {
  const i = IDX.indexOf('exports.readVision');
  const 몸 = IDX.slice(i, i + 3500);
  /* ⚠ 「503 이라는 글자가 있나」로는 모자랐다 — 이 조각 안 다른 곳에도 503 이 있어,
       답을 500 으로 바꿔도 통과했다(되돌림에서 드러났다). 그 줄 하나를 겨눈다. */
  assert.match(몸, /res\.status\(503\)/,
    '★★ 자격이 없을 때 «고장(5xx)»으로 말합니다 — 부르는 쪽이 물러설 길을 못 찾습니다');
  assert.match(몸, /자격을 얻지 못했습니다/,
    '★★ 「무엇이 안 됐는지」를 안 말합니다 — 고장으로 읽히면 원인을 엉뚱한 데서 찾습니다');
  assert.match(몸, /브라우저 판독으로 대신합니다/,
    '★★ 「대신 무엇이 되는지」를 안 말합니다');
});

/* ══════ ⑥ 열쇠 «없이» 부르는 것이 본길이다 (2026-09-08) ════════════ */

test('★★★ 열쇠가 없어도 «서버 신분증»으로 부른다 — 만들 열쇠도 넣을 열쇠도 없다', () => {
  const i = IDX.indexOf('exports.readVision');
  const 몸 = IDX.slice(i, i + 3500);
  assert.match(몸, /fetchSaToken/,
    '★★★ 열쇠가 없으면 그냥 포기합니다 — 서버에는 «자기 신분증»이 있어 열쇠가 필요 없습니다');
  /* 열쇠가 있으면 그것을 «먼저» 쓴다 — 신분증 길이 막히는 자리가 있을 수 있다 */
  const 열쇠 = 몸.indexOf('if (key) auth'), 신분증 = 몸.indexOf('fetchSaToken');
  assert.ok(열쇠 > 0 && 열쇠 < 신분증,
    '★★ 열쇠가 있어도 안 씁니다 — 신분증 길이 막히면 통째로 멎습니다');
});

test('★★ 신분증은 «머리글»로 간다 — 주소에 붙이면 기록·로그에 그대로 남는다', async () => {
  assert.equal(VR.visionUrl(''), 'https://vision.googleapis.com/v1/images:annotate',
    '★ 열쇠가 없는데 주소에 빈 열쇠를 붙입니다');
  /* ⚠ authOf·visionUrl 만 보면 «머리글을 실제로 붙이는지»를 못 본다 —
       그 줄을 지워도 통과했다(되돌림에서 드러났다). 그래서 «돌려 본다». */
  let 본것 = null;
  await VR.callVision(function (url, init) {
    본것 = { url: url, init: init };
    return Promise.resolve({ ok: true, status: 200,
      json: function () { return Promise.resolve({ responses: [{ fullTextAnnotation: { text: 'ㄱ' } }] }); } });
  }, { token: 'TKN' }, ['A'], []);
  assert.ok(본것, '부르지 않았습니다');
  assert.equal(본것.init.headers.Authorization, 'Bearer TKN',
    '★★ 신분증을 머리글에 안 붙였습니다 — 그러면 구글이 「누구냐」로 막습니다');
  assert.ok(!/key=/.test(본것.url),
    '★★ 신분증으로 부르면서 주소에 열쇠 자리를 남겼습니다: ' + 본것.url);
});

test('★★ 신분증과 열쇠를 «함께» 쓰지 않는다 — 둘이 섞이면 어느 것으로 불렸는지 모른다', () => {
  /* ⚠ 하나만 주고 재면 「둘 다 담는」 고침을 못 잡는다(되돌림에서 드러났다) —
       둘을 «함께» 주고 하나만 남는지 본다. */
  const a = VR.authOf({ token: 'TKN', key: 'KEY' });
  assert.equal(a.token, 'TKN', '신분증이 있으면 그것을 씁니다');
  assert.equal(a.key, '', '★★ 신분증이 있는데 열쇠도 함께 담았습니다 — 주소에 열쇠가 실려 나갑니다');
  const b = VR.authOf({ key: 'KEY' });
  assert.equal(b.key, 'KEY');
  assert.equal(b.token, '', '★ 열쇠뿐인데 신분증 자리를 채웠습니다');
});

test('★ 신분증을 «서버 안에서만» 얻는다 — 바깥에서는 부를 수 없는 자리다', () => {
  assert.match(VR.METADATA_TOKEN_URL, /^http:\/\/metadata\.google\.internal\//,
    '★★ 신분증을 딴 곳에서 얻습니다 — 그 자리는 서버 안에만 있어야 안전합니다');
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'vision-read.js'), 'utf8');
  assert.match(src, /Metadata-Flavor/,
    '★ 구글이 요구하는 머리글이 없습니다 — 그것이 없으면 신분증을 안 줍니다');
});

test('★★★ 「API 를 안 켰다」를 «가려내고 무엇을 누르면 되는지» 말한다', async () => {
  const r = await VR.callVision(가짜([{ ok: false, status: 403, json: { error: {
    message: 'Cloud Vision API has not been used in project 936817166182 before or it is disabled.'
  } } }]), { token: 'T' }, ['A'], [0]);
  assert.equal(r.ok, false);
  assert.equal(r.notEnabled, true, '★★★ 「안 켰다」를 못 가려냅니다 — 열쇠·권한·코드를 차례로 뒤지게 됩니다');
  assert.match(r.why, /켜져 있지 않습니다/, '★★ 사람 말로 안 바꿔 줍니다');
  assert.match(r.why, /console\.cloud\.google\.com/,
    '★★★ 「어디를 눌러야 하나」를 안 알려 줍니다 — 그 한 줄이 이 오류의 답입니다');
});

test('★ 켜기 주소가 우리 프로젝트를 가리킨다 — 딴 프로젝트를 켜면 아무 일도 안 된다', () => {
  assert.match(VR.ENABLE_URL, /vision\.googleapis\.com/, '엉뚱한 API 를 가리킵니다');
  assert.match(VR.ENABLE_URL, /project=pureun-erp/, '★★ 프로젝트를 안 짚어 줍니다');
});

test('★★ 그 밖의 실패는 «켜기 문제로 뭉개지 않는다» — 엉뚱한 안내가 가장 나쁘다', async () => {
  const r = await VR.callVision(가짜([{ ok: false, status: 403,
    json: { error: { message: 'Request had insufficient authentication scopes.' } } }]),
    { token: 'T' }, ['A'], [0]);
  assert.notEqual(r.notEnabled, true,
    '★★ 권한 문제를 「API 를 안 켰다」로 말합니다 — 켜 봐도 안 되고 원인은 딴 곳입니다');
  assert.match(r.why, /scopes/, '까닭을 안 넘깁니다');
});

test('★★★ Vision 셈은 «장 수»로 센다 — 요청 수로 세면 달 몫이 틀린다', () => {
  const i = IDX.indexOf('exports.readVision');
  const 몸 = IDX.slice(i, i + 3500);
  assert.match(몸, /bumpReadTally\(v\.app,\s*"vision",\s*r\.pages/,
    '★★★ 한 번에 1 만 더합니다 — Vision 은 «장 수»로 값을 받으므로, 여러 장 보낸 날의 '
    + '셈이 실제보다 적게 나오고 「1,000장 가운데 얼마 남았나」가 틀립니다');
  /* 실패는 안 센다 — 막힌 것은 몫을 안 먹는다 */
  assert.match(몸, /if \(r\.ok\) await bumpReadTally/,
    '★★ 실패한 부름까지 셉니다 — API 가 안 켜져 막힌 것은 몫을 먹지 않습니다');
});

test('★ 셈이 «몇을 더할지» 받는다 — 안 받으면 장 수를 셀 길이 없다', () => {
  const fn = stripComments(cutFn(fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8'),
    'async function bumpReadTally('));
  assert.ok(fn, 'bumpReadTally 가 없습니다');
  /* ⚠ 「howMany 라는 글자가 있나」로는 모자랐다 — 매개변수에서 빼도 몸통에 그 글자가
       남아 통과했다(그러면 값이 늘 1 이 되어 장 수를 못 센다). 받는 자리를 겨눈다. */
  assert.match(fn, /function bumpReadTally\(app,\s*kind,\s*howMany\)/,
    '★★ 몇을 더할지 «받지 않습니다» — 값이 늘 1 이 되어 여러 장 보낸 날의 셈이 틀립니다');
  assert.match(fn, /Math\.max\(1/, '★ 0 이나 음수를 그대로 더합니다 — 셈이 거꾸로 갑니다');
});

test('★★ 열쇠가 없어도 브라우저 판독(Tesseract)으로 «물러선다» — 그 길을 막지 않았다', () => {
  const fn = stripComments(cutFn(ERP_RAW, 'function ocrExtract('));
  assert.ok(fn, 'ocrExtract 가 없습니다');
  assert.match(fn, /ocrWithGoogleVision\(/, 'Vision 을 먼저 안 부릅니다');
  assert.match(fn, /ocrWithTesseract\(/,
    '★★ Vision 이 안 될 때 물러설 길이 없습니다 — 열쇠를 넣기 전에는 판독이 통째로 막힙니다');
  assert.match(fn, /catch\(/, '★★ 실패를 안 받아 냅니다 — 물러서지 못합니다');
});

/* ══════ 걸러 내기 — 부르기 전에 막는다 ═══════════════════════════ */

test('★★ 사진이 없으면 «부르기 전에» 돌려보낸다 — 부르는 만큼이 몫이다', () => {
  assert.equal(VR.validate(null).ok, false);
  assert.equal(VR.validate({}).ok, false);
  assert.equal(VR.validate({ images: [] }).ok, false);
  assert.equal(VR.validate({ images: [''] }).ok, false, '빈 글이 통과했습니다');
  assert.equal(VR.validate({ images: [123] }).ok, false, '사진이 아닌 것이 통과했습니다');
});

test('★★ 장 수에 상한이 있다 — 몫은 «장 수»로 센다(한 번에 많이 보내도 안 아낀다)', () => {
  const many = [];
  for (let i = 0; i <= VR.MAX_IMAGES; i++) many.push('AAAA');
  assert.equal(VR.validate({ images: many }).ok, false,
    '★★ 상한이 없습니다 — 백 장을 한 번에 걸면 달 몫이 그 한 번으로 사라집니다');
  assert.match(VR.validate({ images: many }).error, new RegExp(String(VR.MAX_IMAGES)),
    '몇 장까지인지 안 말합니다');
});

test('★ dataURL 로 와도 받는다 — 부르는 쪽마다 다르게 자르면 한 곳은 반드시 틀린다', () => {
  const r = VR.validate({ images: ['data:image/jpeg;base64,QUJD'] });
  assert.equal(r.ok, true);
  assert.equal(r.images[0], 'QUJD', '★ 머리글을 안 떼었습니다 — 구글이 못 읽습니다');
  const r2 = VR.validate({ images: ['QUJD'] });
  assert.equal(r2.images[0], 'QUJD', '★ 날 base64 를 잘랐습니다');
});

test('★ 몸통이 너무 크면 돌려보낸다', () => {
  const big = 'A'.repeat(VR.MAX_BODY_BYTES + 10);
  assert.equal(VR.validate({ images: [big] }).ok, false);
});

/* ══════ 무엇을 부르나 ════════════════════════════════════════════ */

test('★★ 서류용 판독(DOCUMENT_TEXT_DETECTION)을 쓴다 — 간판용으로 바꾸면 줄이 뒤섞인다', () => {
  const b = VR.visionBody(['AAA']);
  assert.equal(b.requests[0].features[0].type, 'DOCUMENT_TEXT_DETECTION',
    '★★ TEXT_DETECTION 은 간판·표지판용입니다 — 서류에서 줄 차례가 무너집니다');
  assert.deepEqual(b.requests[0].imageContext.languageHints, ['ko', 'en'],
    '★ 한국어 힌트가 없으면 한글이 크게 틀립니다');
});

test('★ 여러 장이면 요청도 여러 개다 — 한 장만 보내면 나머지가 조용히 빠진다', () => {
  const b = VR.visionBody(['A', 'B', 'C']);
  assert.equal(b.requests.length, 3);
});

test('★ 주소에 열쇠를 «감싸서» 넣는다 — 안 감싸면 특이한 글자에서 주소가 깨진다', () => {
  const u = VR.visionUrl('a b&c');
  assert.ok(!/a b&c/.test(u), '★ 열쇠를 그대로 이어 붙였습니다: ' + u);
  assert.match(u, /^https:\/\/vision\.googleapis\.com\//, '주소가 바뀌었습니다');
});

/* ══════ 글 꺼내기 ════════════════════════════════════════════════ */

test('★★ 빈 쪽은 «자리를 지운다» — 남기면 「몇 쪽에서 나온 글인가」가 어긋난다', () => {
  const t = VR.textOf({ responses: [
    { fullTextAnnotation: { text: '첫쪽' } },
    { },
    { fullTextAnnotation: { text: '셋쪽' } }
  ] });
  assert.equal(t.text, '첫쪽\n셋쪽');
  assert.equal(t.pages, 2, '★ 빈 쪽을 세었습니다');
  assert.equal(t.total, 3, '★ 보낸 장 수를 안 셉니다');
});

test('★ 오류가 든 쪽은 글로 세지 않는다', () => {
  const t = VR.textOf({ responses: [{ error: { message: 'x' }, fullTextAnnotation: { text: '쓰레기' } }] });
  assert.equal(t.pages, 0, '★ 오류인 쪽의 글을 담았습니다');
});

test('없는 답에서 넘어지지 않는다', () => {
  assert.equal(VR.textOf(null).text, '');
  assert.equal(VR.textOf({}).pages, 0);
});

/* ══════ 실제로 돌려 본다 — 가짜 fetch 를 끼워 ══════════════════════ */

function 가짜(답들) {
  let i = 0;
  return function () {
    const a = 답들[Math.min(i++, 답들.length - 1)];
    return Promise.resolve({
      ok: a.ok !== false, status: a.status || 200,
      json: function () { return Promise.resolve(a.json || {}); }
    });
  };
}

test('★★ 200 인데 «안에 오류»가 든 것을 「읽었다」로 넘기지 않는다 — 빈 글이 조용히 담긴다', async () => {
  const r = await VR.callVision(가짜([{ json: { responses: [{ error: { message: '못 읽음' } }] } }]),
    'k', ['A'], []);
  assert.equal(r.ok, false, '★★ 오류가 든 답을 성공으로 넘겼습니다 — 빈 글이 담깁니다');
});

test('★ 잘 읽으면 글을 돌려준다', async () => {
  const r = await VR.callVision(가짜([{ json: { responses: [{ fullTextAnnotation: { text: '사업자등록증' } }] } }]),
    'k', ['A'], []);
  assert.equal(r.ok, true);
  assert.equal(r.text, '사업자등록증');
  assert.equal(r.pages, 1);
});

test('★★ 잠깐 바쁜 것(429)은 «기다렸다 다시» — 한 번에 포기하면 헛일이다', async () => {
  const r = await VR.callVision(가짜([
    { ok: false, status: 429, json: { error: { message: '바쁨' } } },
    { json: { responses: [{ fullTextAnnotation: { text: '됐다' } }] } }
  ]), 'k', ['A'], [0]);
  assert.equal(r.ok, true, '★★ 잠깐 바쁜 것에 한 번 만에 포기했습니다');
  assert.equal(r.text, '됐다');
});

test('★ 열쇠 문제(403)는 기다려도 같다 — 그대로 올린다', async () => {
  const r = await VR.callVision(가짜([{ ok: false, status: 403, json: { error: { message: '권한 없음' } } }]),
    'k', ['A'], [0]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403, '★ 상태를 뭉갰습니다 — 부르는 쪽이 판단을 못 합니다');
  assert.match(r.why, /권한/, '까닭을 안 넘깁니다');
});

test('★ 그물이 끊겨도 넘어지지 않는다', async () => {
  const r = await VR.callVision(function () { return Promise.reject(new Error('끊김')); }, 'k', ['A'], []);
  assert.equal(r.ok, false);
  assert.match(r.why, /끊김/);
});

/* ══════ 서버 규칙 ════════════════════════════════════════════════ */

const RULES = JSON.parse(cp.execFileSync('node',
  [path.join(ROOT, 'scripts', 'make-firebase-rules.js')], { encoding: 'utf8' })).rules;

test('★★ 셈 자리에 vision 칸이 있다 — 없으면 서버가 그 셈을 물린다', () => {
  const c = RULES.ai_read_tally.$ymd.$app;
  assert.ok(c.vision, '★★ vision 칸이 없습니다 — 세려 해도 규칙이 막습니다');
  assert.match(c.vision['.validate'], /isNumber/, '★ 숫자만 받아야 합니다');
  assert.equal(c.$other['.validate'], false, '★ 모르는 칸이 그냥 들어옵니다');
});

test('★★★ 셈은 여전히 «아무도 못 쓴다» — 브라우저가 꾸며 낼 수 없다', () => {
  assert.equal(RULES.ai_read_tally['.write'], false,
    '★★★ 브라우저가 셈을 쓸 수 있게 열렸습니다');
});
