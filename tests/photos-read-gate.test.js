'use strict';
/* 「단순 사진은 구글 판독에 안 들어가는게 좋은데」 (대표 지시 2026-09-07)

   ■ 무엇이 잘못돼 있었나 — 사람이 이미 말해 준 것을 버렸다
   사진첩은 「서류인지 사진인지는 AI 가 가린다」로 만들어져 있어서, 가리려면 **먼저 한 번
   읽어야** 했다. 그래서 현장 사진도 예외 없이 한 번은 구글로 가고 그 한 번이 하루 몫을 먹었다.
   그런데 물어볼 필요가 없었다 —
     · 카메라에 「📷 일반사진 / ▣ 명함·서류」가 있는데 **고른 값이 저장될 때 버려졌다**
       (올리는 길 여섯 곳이 전부 'doc' 으로 못 박아 넘겼다).
     · 저장 칸에 kind(doc/photo)가 있는데 **읽는 쪽이 그 칸을 아예 안 봤다**
       ('photo' 로 적힌 59장까지 판독을 다 받았고, 그중 57장은 정말 사진이었다).

   ■ 실측 (운영 사진 844장, 2026-09-07)
     · 9월 판독 166번 가운데 **124번(75%)이 사진**
     · 그날 한 뭉치 164장에 **서류가 한 장도 없이** 하루 몫을 다 썼고, 뒤에 올린 서류가 못 읽혔다
     · 한 장씩 올라온 뭉치 556개에는 서류가 471장 / 열 장 넘는 뭉치 9개에는 서류가 1장

   ■ 못 박는 규칙 다섯
     ① 문지기는 **한 곳**이다 — 자동 대기열 세 목록과 올린 직후 길이 모두 지난다
     ② 사람이 말한 것을 **버리지 않는다** — 카메라에서 고른 갈래가 저장까지 간다
     ③ 열 장 넘는 뭉치는 **묻고, 답할 때까지 안 읽는다**(스캔 문서는 묻지 않는다)
     ④ 한도에 걸리면 **그 자리에서 멈춘다** — 남은 것이 한 장씩 두드리지 않게
     ⑤ 「판독 안 함」은 AI 판정과 **다른 말**로 적는다 — 안 읽은 것을 읽은 척하지 않는다

   실행: node --test tests/photos-read-gate.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const app = stripComments(raw);
const srvRaw = fs.readFileSync(path.join(R, 'functions', 'doc-read.js'), 'utf8');
const srv = stripComments(srvRaw);

/* ══════ ① 문지기는 «한 곳»이다 ══════ */

test('★★ 자동 대기열 «세 목록 모두»가 문지기를 지난다 — 한 곳이 빠지면 그리로 다 샌다', () => {
  const fn = stripComments(cutFn(raw, 'function autoReadPending('));
  assert.match(fn, /const gate = function \(it\) \{ return !readSkipWhy\(it\); \};/,
    '★ 문지기를 부르는 자리가 없습니다');
  const n = (fn.match(/\.filter\(gate\)/g) || []).length;
  assert.equal(n, 3,
    '★★ 문지기가 ' + n + '곳에 걸려 있습니다 — 안 읽은 것·실패한 것·다시 읽을 것 셋이라야 합니다.\n' +
    '  한 목록만 막으면 사진이 다른 목록으로 새어 나갑니다. 실제로 「사진」으로 적힌\n' +
    '  59장이 그렇게 판독을 다 받았습니다.');
});

test('★★ 올린 직후 길도 같은 문지기를 지난다 — 여기가 열려 있으면 막은 뜻이 없다', () => {
  const fn = stripComments(cutFn(raw, 'function queueRead('));
  assert.match(fn, /readSkipWhy\(\{ meta: job\.meta \}\)/,
    '★★ 올라오는 즉시 판독으로 갑니다 — 자동 대기열만 막아 두면\n' +
    '  막힌 것처럼 보이고 실제로는 새로 올린 것이 전부 나갑니다.');
  assert.match(fn, /readQuotaOut/, '★ 한도가 없을 때도 올린 것을 걸고 있습니다');
});

/* 문지기를 실제로 돌린다 — 글자만 보면 「부르긴 하는데 답이 틀린」 것을 못 잡는다 */
function loadGate(items, said) {
  const ctx = { Object, Array, String, gridItems: items || [] };
  const min = (raw.match(/const READ_ASK_MIN = (\d+);/) || [])[1];
  assert.ok(min, '★ READ_ASK_MIN 을 못 찾았습니다');
  ctx.__min = Number(min);
  vm.createContext(ctx);
  vm.runInContext(
    'var _bszSrc = null, _bszN = -1, _bsz = null;' +
    'var readAskSaid = ' + JSON.stringify(said || '') + ';' +
    'var READ_ASK_MIN = __min;' +
    cutFn(raw, 'function batchSizes(') + '\n' +
    cutFn(raw, 'function upBatchKey(') + '\n' +
    cutFn(raw, 'function readHoldOf(') + '\n' +
    cutFn(raw, 'function readSkipWhy(') + '\n' +
    ';this.readSkipWhy = readSkipWhy; this.readHoldOf = readHoldOf; this.MIN = READ_ASK_MIN;', ctx);
  return ctx;
}
/* 「한 사람이 한 번에 n장」인 뭉치를 만든다 */
function batch(n, extra) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: 'p' + i, meta: Object.assign({ by: 'u1', upAt: 100, kind: 'doc' }, extra || {}) });
  }
  return out;
}

test('★★ 사람이 「그냥 사진」이라고 한 것은 판독에 «안» 보낸다', () => {
  const g = loadGate([{ id: 'a', meta: { by: 'u1', upAt: 1, kind: 'photo' } }]);
  assert.equal(g.readSkipWhy({ meta: { by: 'u1', upAt: 1, kind: 'photo' } }), 'pic',
    '★★ 사람이 이미 말해 준 것을 무시하고 있습니다 — 그것이 이 고침의 전부입니다.');
  assert.equal(g.readSkipWhy({ meta: { by: 'u1', upAt: 1, kind: 'doc' } }), '',
    '★ 서류라고 한 것은 읽어야 합니다');
});

test('★★ 이미 «사진»으로 읽힌 것은 다시 안 읽는다 — 그러나 「모름」은 다시 읽는다', () => {
  const g = loadGate([]);
  assert.equal(g.readSkipWhy({ meta: { read: { kind: 'meeting' } } }), 'pic',
    '★ 회의·현장으로 읽힌 것을 또 읽으면 같은 답에 요금만 듭니다');
  assert.equal(g.readSkipWhy({ meta: { read: { kind: 'other' } } }), '',
    '★★ 「종류를 모름(other)」까지 막으면 안 됩니다 — 굳은 사진을 되살리는 것이\n' +
    '  판 번호(PROMPT_VERSION)의 존재 이유입니다(RESTALE_SKIP 옆 설명과 같은 규칙).');
  assert.equal(g.readSkipWhy({ meta: { read: { kind: 'meeting', error: '잠시 바쁩니다' } } }), '',
    '★ 실패한 기록은 갈래를 믿을 수 없습니다 — 막으면 안 됩니다');
});

test('★★ 열 장 넘는 뭉치는 «묻는 중»이라 안 읽는다 — 작은 뭉치는 지금처럼 읽는다', () => {
  const big = loadGate(batch(30));
  assert.equal(big.readSkipWhy(batch(1)[0]), 'hold',
    '★★ 큰 뭉치를 그냥 읽으면 오늘 같은 일이 그대로 되풀이됩니다(164장 · 서류 0장).');
  const few = loadGate(batch(3));
  assert.equal(few.readSkipWhy(batch(1)[0]), '',
    '★★ 서류는 거의 다 한두 장씩 옵니다 — 그것까지 물으면 「올렸는데 판독이 안 된다」가 됩니다.');
  assert.ok(big.MIN >= 5 && big.MIN <= 19,
    '★ 문턱이 ' + big.MIN + '장입니다. 5~19장 사이여야 합니다 — 실측 근거: 열 장 넘는 뭉치\n' +
    '  아홉 개에 서류는 1장뿐이었고, 한 장씩 온 뭉치 556개에는 서류가 471장이었습니다.\n' +
    '  (검사고정-허용: 이 범위가 «규칙»이다 — 20 이상이면 사진 뭉치가 새고, 5 미만이면\n' +
    '   서류 두세 장 올릴 때마다 묻게 된다)');
});

test('★★ 여러 쪽 스캔·글자 있는 파일은 뭉치가 커도 «묻지 않는다» — 그것은 서류다', () => {
  const g = loadGate(batch(30));
  assert.equal(g.readHoldOf({ meta: { by: 'u1', upAt: 100, doc: { group: 'g1' } } }), false,
    '★★ 30쪽 계약서를 올릴 때마다 물으면 그것이 곧 고장으로 읽힙니다.');
  assert.equal(g.readHoldOf({ meta: { by: 'u1', upAt: 100, hasText: 1 } }), false,
    '★ 글자가 들어 있는 파일(PDF·한글)은 서류입니다');
  assert.equal(g.readHoldOf({ meta: { by: 'u1', upAt: 100, read: { kind: 'card' } } }), false,
    '★ 이미 읽은 것에는 물을 것이 없습니다');
});

test('★★ 언제 올라온 것인지 모르는 옛 사진은 «묻지 않는다» — 한 뭉치로 묶이면 안 된다', () => {
  const old = [];
  for (let i = 0; i < 20; i++) old.push({ id: 'o' + i, meta: { by: 'u1', kind: 'doc' } });
  const g = loadGate(old);
  assert.equal(g.readHoldOf(old[0]), false,
    '★★ upAt 이 없는 옛 사진 50장이 운영에 있습니다. 없는 것을 0 으로 세면 서로 남남인\n' +
    '  사진들이 한 뭉치로 묶여 통째로 붙잡히고, 띠에 「50장」이 떠도 사람은 무슨\n' +
    '  50장인지 알 수가 없습니다.');
});

test('★ 「서류입니다」라고 답하면 그 뒤로는 안 묻는다', () => {
  const g = loadGate(batch(30), 'doc');
  assert.equal(g.readSkipWhy(batch(1)[0]), '',
    '★ 답을 했는데도 계속 붙잡아 두면 판독이 영영 안 됩니다');
});

test('★ 뭉치는 «누가·언제»로 갈린다 — 남이 같은 날 올린 것과 섞이지 않는다', () => {
  const mine = batch(6);
  const other = batch(6, { by: 'u2' });
  const g = loadGate(mine.concat(other));
  assert.equal(g.readSkipWhy(mine[0]), '',
    '★★ 뭉치를 사람 구분 없이 세면, 직원 둘이 각자 여섯 장을 올린 날\n' +
    '  열두 장짜리 한 뭉치로 잘못 세어 둘 다 붙잡습니다.');
});

/* ══════ ② 답을 저장하는 방식 — 꾸민 판독 결과로 남기지 않는다 ══════ */

test('★★ 「그냥 사진」 답은 «사람이 그랬다»고 적는다 — AI 판정으로 꾸미지 않는다', () => {
  const fn = stripComments(cutFn(raw, 'async function readAskPics('));
  assert.match(fn, /noRead: true/,
    '★★ noRead 없이 kind 만 적으면, 나중에 「AI 가 회의사진이라고 했다」로 읽힙니다 —\n' +
    '  읽지도 않은 것을 읽은 척하는 기록입니다.');
  assert.match(fn, /사람이 「그냥 사진」이라고 했습니다/, '★ 누가 그랬는지 남기지 않습니다');
  assert.match(fn, /kind: 'meeting'/,
    '★ 갈래를 안 적으면 탭·딱지·다시 읽기 네 곳이 저마다 옛길로 갑니다');
  /* ⚠ 「confirm 이 있다」로 보면 **안 된다** — `if (false && confirm(...))` 로 바꿔도
     통과한다(이빨 확인에서 살아남아 드러났다). **아니라고 하면 되돌아가는지**를 본다. */
  assert.match(fn, /if \(!confirm\([\s\S]{0,200}\) return;/,
    '★★ 되돌릴 수 있어도 한 번은 묻고, «아니오»면 되돌아가야 합니다 — 서류가 섞여 있으면\n' +
    '  그 서류가 스스로 안 읽히고, 모르고 지나가면 한 달 뒤에야 압니다.');
});

test('★★ 「판독 안 함」 딱지가 AI 판정과 «갈라져» 있다', () => {
  const fn = stripComments(cutFn(raw, 'function readLabel('));
  assert.match(fn, /read\.noRead/,
    '★★ 안 읽은 것을 「회의·현장 사진」으로 적으면 다시 읽을 생각을 못 합니다 —\n' +
    '  명함을 사진으로 올렸다가 회의사진으로 읽힌 일이 실제로 있었습니다(2026-08-03).');
  const i = fn.indexOf('read.noRead'), j = fn.indexOf("READ_LABEL[read.kind]");
  assert.ok(i > 0 && i < j, '★ 갈래 딱지가 먼저 이겨 「판독 안 함」이 안 보입니다');
});

/* ══════ ③ 한도에 걸리면 멈춘다 ══════ */

test('★★ 한도에 걸리면 자동 줄을 «비운다» — 남은 것이 한 장씩 두드리지 않게', () => {
  const fn = stripComments(cutFn(raw, 'function pumpRead('));
  assert.match(fn, /if \(readQuotaOut\)/, '★★ 걸린 뒤에도 남은 사진이 계속 판독을 부릅니다');
  /* ⚠ 「_queuedRead = false 가 어딘가에 있다」로 보면 **안 된다** — pumpRead 는
     한 장을 읽고 나서도 그 표를 내린다. 그래서 한도 갈래에서 그 줄을 빼도 검사가
     통과했다(이빨 확인에서 살아남아 드러났다). **비우는 그 줄 안에서** 본다. */
  const i = fn.indexOf('readQ.splice(0)');
  assert.ok(i > 0, '★ 줄을 비우지 않으면 한 장씩 차례로 다 두드립니다');
  assert.match(fn.slice(i, i + 120), /_queuedRead = false/,
    '★★ 비우면서 표를 안 내리면, 한도가 풀린 뒤에도 그 사진들은 「이미 줄에 있다」로\n' +
    '  남아 **영영 다시 못 걸립니다.**');
});

test('★★ 한도를 알아채는 곳이 «판독 결과를 만드는 두 길 모두»에 있다', () => {
  const a = stripComments(cutFn(raw, 'function startRead('));
  const b = stripComments(cutFn(raw, 'function readPhoto('));
  assert.match(a, /readQuotaWatch\(read\)/, '★ 올릴 때 읽는 길이 한도를 안 봅니다');
  assert.match(b, /readQuotaWatch\(read\)/,
    '★★ 다시 읽는 길이 한도를 안 보면, 그 길로 백 번 두드리는 것이 그대로 남습니다.');
  const w = stripComments(cutFn(raw, 'function readQuotaWatch('));
  assert.match(w, /readFailKind\(read\) === 'quota'/, '★ 무엇으로 가리는지가 없습니다');
  assert.match(w, /!read\.error && readQuotaOut/,
    '★★ 한 장이라도 읽히면 다시 열어야 합니다 — 안 열면 「새로고침해야 판독이 된다」가 됩니다.');
});

test('★★ 사람이 «직접 누르는» 길은 막지 않는다 — 급한 서류 한 장이 있다', () => {
  const again = stripComments(cutFn(raw, 'function readAgain('));
  const sel = stripComments(cutFn(raw, 'function readSelected('));
  assert.ok(!/readQuotaOut/.test(again),
    '★★ 「다시 판독」까지 막으면 「왜 아무것도 안 되나」가 됩니다.\n' +
    '  막는 것이 아니라 «자동으로» 헛돈을 안 쓰는 것입니다.');
  assert.ok(!/readSkipWhy/.test(again) && !/readSkipWhy/.test(sel),
    '★★ 사람이 누른 길에 문지기를 걸면, 「사진」으로 적힌 것을 되돌릴 방법이 없어집니다.');
});

test('★★ 하루 몫이 없는 429 는 «기다리지 않는다» — 한 장에 여섯 번을 두드렸다', () => {
  assert.match(srv, /function dailyQuotaGone\(/, '★ 서버가 두 가지 429 를 안 가릅니다');
  assert.match(srv, /!\(status === 429 && dailyQuotaGone\(why\)\)/,
    '★★ 「분당 너무 빨리」와 「하루 몫을 다 썼다」를 똑같이 세 번씩 다시 부르면\n' +
    '  한 장마다 모델 둘 × 세 번 = 여섯 번입니다.');
  const g = require(path.join(R, 'functions', 'doc-read.js')).dailyQuotaGone;
  assert.equal(g('Quota exceeded for metric: generate_content_free_tier_requests'), true);
  assert.equal(g('GenerateRequestsPerDayPerProjectPerModel'), true);
  assert.equal(g('Resource has been exhausted (per minute)'), false,
    '★★ 분당 한도를 하루 몫으로 잘못 읽으면 «기다리면 될 것»을 포기합니다.');
  assert.equal(g(''), false, '★ 까닭이 없으면 기다리는 쪽입니다');
});

/* ══════ ④ 사람이 고른 갈래를 버리지 않는다 ══════ */

test('★★ 카메라에서 고른 갈래가 «저장까지» 간다 — 여태 여기서 버려졌다', () => {
  const up = stripComments(cutFn(raw, 'async function camUpload('));
  assert.match(up, /metaKind: camUpKind/,
    '★★ 카메라에 「📷 일반사진 / ▣ 명함·서류」가 있는데 고른 값이 여기서 버려졌습니다 —\n' +
    '  무엇을 고르든 「서류」로 적혀 전부 구글로 갔습니다.');
  assert.match(up, /addFiles\(files, true,/,
    '★★ isDoc 은 **true 로 둔다** — 그것이 정하는 것은 «화질»입니다(2560px).\n' +
    '  사진으로 담아 1600px 로 줄이면, 뒤에 「서류였다」고 눌러도 글자를 못 읽습니다.');
  const add = stripComments(cutFn(raw, 'async function addFiles('));
  assert.match(add, /const upKind = \(opts && opts\.metaKind === 'photo'\) \? 'photo' :/,
    '★ 갈래와 화질을 가르는 자리가 없습니다');
  const n = (add.match(/kind: upKind,/g) || []).length;
  assert.equal(n, 2,
    '★★ 갈래를 적는 곳이 둘(사진 정보·올리기 대기열)인데 ' + n + '곳만 씁니다 —\n' +
    '  갈라지면 화면과 저장이 서로 다른 말을 합니다.');
  assert.ok(!/kind: isDoc \? 'doc' : 'photo'/.test(add), '★ 옛 길이 남아 있습니다');
});

test('★ 찍은 것 고르기 화면이 «고른 쪽을 보여 준다» — 둘 다 흐리면 아무도 안 고른다', () => {
  assert.match(app, /function setCamUpKind\(/, '★ 고르는 함수가 없습니다');
  const s = stripComments(cutFn(raw, 'function setCamUpKind('));
  assert.match(s, /camKindDoc/, '★ 단추에 켠 표시를 안 합니다');
  assert.match(s, /camKindPic/, '★ 단추에 켠 표시를 안 합니다');
  const o = stripComments(cutFn(raw, 'function openCamReview('));
  assert.match(o, /setCamUpKind\(camCaptureMode === 'document' \? 'doc' : 'photo'\)/,
    '★★ 위에서 고른 촬영 방식을 안 받아 오면 **두 자리에서 따로 묻는** 셈입니다 —\n' +
    '  「명함·서류」로 찍고 또 「서류」를 눌러야 하면 그것이 곧 안 누르는 이유가 됩니다.');
});

/* ══════ ⑤ 멈춘 것이 «눈에 보인다» ══════ */

test('★★ 판독을 멈춘 자리는 반드시 화면에 보인다 — 조용히 멈추면 그것이 고장이다', () => {
  assert.match(app, /id="readAskBar"/, '★ 묻는 띠가 없습니다');
  const r = stripComments(cutFn(raw, 'function renderReadAsk('));
  assert.match(r, /readAskDocs\(\)/, '★ 「서류입니다」 단추가 없습니다');
  assert.match(r, /readAskPics\(\)/, '★ 「그냥 사진입니다」 단추가 없습니다');
  assert.match(r, /대답할 때까지 이 사진들은 판독에 안 갑니다/,
    '★★ 「지금 안 읽고 있다」를 말하지 않으면 「올렸는데 판독이 안 된다」가 됩니다 —\n' +
    '  이 저장소가 가장 여러 번 밟은 자리입니다.');
  const i = r.indexOf('readQuotaOut'), j = r.indexOf('readHoldIds');
  assert.ok(i > 0 && i < j,
    '★★ 한도가 «이겨야» 합니다 — 「서류입니다」라고 답해도 오늘은 못 읽습니다.\n' +
    '  물어 놓고 못 하는 것이 안 묻는 것보다 나쁩니다.');
  /* ⚠ 「보류 딱지가 소스에 있다」로 보면 **안 된다** — 딱지를 만들어 놓고 «안 쓰면»
     그대로 통과한다(이빨 확인에서 살아남아 드러났다).
     지금 이 칸에 대해 할 말은 「서류다」가 아니라 「아직 안 읽었고 답을 기다린다」이므로
     **보류가 서류 딱지를 이겨야** 한다 — 이기는지를 본다. */
  assert.match(app, /class="tag hold"/, '★ 칸에 보류 딱지가 없습니다');
  assert.match(app, /const tag = holdTag \|\| \(hasTag/,
    '★★ 보류 딱지를 만들어 놓고 서류 딱지에 밀리면, 판독에 안 보낸 칸이 «다 읽은 서류»와\n' +
    '  똑같이 보입니다 — 그러면 왜 안 읽혔는지 알 길이 없습니다.');
});

test('★ 자동 판독을 훑을 때마다 띠를 다시 그린다 — 답한 뒤 그대로 남으면 안 된다', () => {
  const fn = stripComments(cutFn(raw, 'function autoReadPending('));
  assert.match(fn, /renderReadAsk\(\)/, '★ 띠가 새로 그려지지 않습니다');
});
