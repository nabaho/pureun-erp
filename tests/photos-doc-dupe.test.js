'use strict';
/* 겹치는 근로자 서류 — «붙일 때 물어본다» (대표 결정 2026-09-03, 안 ㉯)

   ■ 무엇이 막혀 있었나
   서류를 가리는 열쇠가 «서류»가 아니라 **사진 한 장**(wkDocKey = 해_사진번호)이다.
   그래서 「이미 붙어 있으면 다시 안 쓴다」는 막이가 **같은 사진을 두 번 보낼 때만**
   걸리고, 같은 신분증을 다시 찍은 것은 그냥 지나가 「신분증 2」로 쌓였다.

   ■ 왜 ㉰(자동으로 옛것 치우기)를 안 골랐나
   사람을 가리는 열쇠가 「이름 + 회사」다. 판독이 이름을 한 글자 잘못 읽거나
   동명이인이면 **남의 신분증을 덮어쓴다.** 명함은 다시 찍으면 그만이지만
   신분증은 근로자에게 다시 달라고 해야 한다 — 되돌리는 값이 전혀 다르다.

   실행: node --test tests/photos-doc-dupe.test.js */
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
const store = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const cards = stripComments(fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8'));

/* 순수 판정만 떼어 실제로 돌린다 — 글자만 보면 「부르긴 하는데 값이 틀린」 것을 못 잡는다 */
function load() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cutFn(store, 'function wkSameKind(') +
    '\n;this.wkSameKind = wkSameKind;', ctx);
  return ctx;
}
const M = load();

/* ══════ ① 겹침을 «서류 갈래»로 본다 — 사진 한 장이 아니라 ══════ */

test('★★ 같은 갈래가 이미 있으면 «다른 사진»이라도 겹침이다', () => {
  const cur = { docs: {
    '2026_aaa': { kind: 'idcard', at: 100 },
    '2026_bbb': { kind: 'consent', at: 200 }
  } };
  const hit = M.wkSameKind(cur, 'idcard', '2026_zzz');
  assert.equal(hit.length, 1,
    '★★ 갈래로 안 보면 같은 신분증을 다시 찍은 것이 그냥 지나가 「신분증 2」로 쌓입니다.');
  assert.equal(hit[0].dk, '2026_aaa');
});

test('★ 자기 자신은 겹침이 아니다 — 같은 사진을 다시 보낼 때 헛물음이 뜬다', () => {
  const cur = { docs: { '2026_aaa': { kind: 'idcard', at: 100 } } };
  assert.equal(M.wkSameKind(cur, 'idcard', '2026_aaa').length, 0);
});

test('★ 갈래가 다르면 겹침이 아니다 — 신분증과 동의서는 둘 다 있어야 한다', () => {
  const cur = { docs: { '2026_aaa': { kind: 'consent', at: 100 } } };
  assert.equal(M.wkSameKind(cur, 'idcard', '2026_zzz').length, 0);
});

test('★ 가장 «최근 것»이 앞에 온다 — 견줄 것은 바로 앞엣것이다', () => {
  const cur = { docs: {
    'a': { kind: 'idcard', at: 100 }, 'b': { kind: 'idcard', at: 300 },
    'c': { kind: 'idcard', at: 200 }
  } };
  /* ⚠ vm 안에서 만든 배열은 «다른 실체»라 값이 같아도 deepEqual 이 실패한다 —
     JSON 을 거쳐 견준다(이 저장소에서 여러 번 밟은 자리다). */
  const got = JSON.parse(JSON.stringify(
    M.wkSameKind(cur, 'idcard', 'z').map(function (x) { return x.dk; })));
  assert.deepEqual(got, ['b', 'c', 'a']);
});

/* ══════ ② 자동으로 안 지운다 — 사람이 고른다 ══════ */

test('★★ 겹치면 «보내지 않고» 물음을 남긴다 — 조용히 덮어쓰지 않는다', () => {
  const fn = stripComments(cutFn(raw, 'function sendWorker('));
  /* ⚠ 「findWorkerDupes 가 어딘가 적혀 있나」만 보면 if (false) 로 죽여도 안 걸린다
     (돌연변이가 살아남아 드러났다) — 그것이 «지나는 길인지»를 본다. */
  assert.match(fn, /if \(!force && PuDocFile\.findWorkerDupes\)/,
    '★★ 겹침을 안 보고 보내면 같은 신분증이 두 장 쌓입니다.');
  assert.match(fn, /read\.dupWk = /,
    '★★ 물음을 안 남기면 「분명 보냈는데 근로자 정보함에 없다」가 됩니다 — 조용한 실패입니다.');
  assert.ok(!/dropWorkerDocs/.test(fn),
    '★★ 보내는 길에서 옛 서류를 지우면 그것이 곧 ㉰(자동)입니다.\n' +
    '  이름을 한 글자 잘못 읽으면 **남의 신분증을 덮어씁니다.**');
});

test('★★ «뒤에서 도는 판독»은 묻지 않는다 — 스물여덟 번 묻고 아무도 못 본다', () => {
  assert.match(app, /sendWorker\(sibs\[0\]\.id, year, sibs\[0\], \{ auto: true \}\)/,
    '★★ 자동 판독이 창을 띄우면 사람이 화면 앞에 없을 때 스물여덟 번 묻습니다.');
  const fn = stripComments(cutFn(raw, 'function sendWorker('));
  assert.match(fn, /if \(!auto\) toast\(/,
    '★ 손으로 누른 때는 왜 안 갔는지 그 자리에서 말해 줘야 합니다.');
});

test('★ 겹침을 «못 물어봤다고» 보내는 일까지 막지는 않는다', () => {
  const fn = stripComments(cutFn(raw, 'function sendWorker('));
  const cat = fn.slice(fn.indexOf('.catch('));
  assert.match(cat, /force: true/,
    '★ 겹침 확인이 실패했다고 안 보내면, 못 보내는 것이 겹치는 것보다 나빠집니다.');
});

/* ══════ ③ 고를 것이 셋이다 ══════ */

test('★★ 「둘 다 두기」가 있다 — 주소가 바뀐 등본은 옛것도 근거가 된다', () => {
  assert.match(app, /function dupKeepBoth\(/,
    '★★ 「바꾸기」만 두면 기계가 「옛것은 필요없다」고 정하는 셈입니다.\n' +
    '  그때 어디 살았는지가 사건에서 다툼거리가 되는 일이 있습니다.');
  assert.match(app, /function dupReplace\(/, '★ 바꾸는 길이 없습니다');
  assert.match(app, /function dupSkip\(/, '★ 그냥 안 보내는 길이 없습니다');
});

test('★★ 바꾸기는 옛 사진을 «휴지통»으로 — 스스로 한 일은 되돌릴 수 있어야 한다', () => {
  const fn = stripComments(cutFn(raw, 'function dupReplace('));
  assert.match(fn, /deletePhoto\(/, '★★ 휴지통을 안 거치면 되돌릴 길이 없습니다');
  assert.match(fn, /photoOwner\(ph\.id\)/,
    '★ 주인을 안 넘기면 내 자리에 대고 지우는 시늉만 하고 조용히 끝납니다.');
  assert.match(fn, /isMinePhoto\(ph\.id\)/,
    '★★ 남의 사진을 말없이 치우면 그 사람은 왜 없어졌는지 알 길이 없습니다.');
  assert.match(fn, /confirm\(/, '★ 되돌리기 어려운 일은 한 번 묻습니다');
});

test('★ 「보내지 않기」는 사진을 «안 지운다» — 물음에 답했다고 사진까지 없애면 안 된다', () => {
  const fn = stripComments(cutFn(raw, 'function dupSkip('));
  assert.ok(!/deletePhoto/.test(fn),
    '★ 잘못 눌렀을 때 잃는 것이 너무 큽니다 — 지울지는 사람이 따로 정합니다.');
  assert.match(fn, /dupSkip = /, '★ 답한 표시가 없으면 다음 판독에 또 묻습니다');
});

/* ══════ ④ 답하기 전에는 «할 일»로 남는다 ══════ */

test('★★ 물음이 남아 있으면 「확인 필요」다 — 「확인했음」으로는 못 치운다', () => {
  const fn = stripComments(cutFn(raw, 'function checkWhy('));
  const i = fn.indexOf('r.dupWk');
  const j = fn.indexOf('if (r.ack) return');
  assert.ok(i > 0, '★★ 겹침이 할 일에 안 잡히면 그 사진은 영영 안 갑니다.');
  assert.ok(i < j,
    '★★ ack 뒤에 두면 「확인했음」으로 ⚠ 만 사라지고 사진은 안 갑니다 —\n' +
    '  임금 확인에서 이미 배운 자리입니다. 치울 길은 셋 다 열려 있습니다.');
});

test('★ 물음이 떠 있는 동안에는 «보내기 단추»를 안 낸다 — 누르면 같은 물음이 또 뜬다', () => {
  const i = app.indexOf("box += '<p class=\"sent\">✓ 근로자 정보함에 넣었습니다");
  assert.ok(i > 0, '근로자 정보함 사슬을 못 찾았습니다');
  const chain = app.slice(i, i + 900);
  const a = chain.indexOf('} else if (read.dupWk) {');
  const b = chain.indexOf('canSendWorker(read)');
  /* ⚠ indexOf 는 없으면 -1 이다 — 「a < b」만 보면 갈래를 통째로 없애도 통과한다
     (돌연변이가 살아남아 드러났다). 있는지부터 본다. */
  assert.ok(a > 0, '★★ 겹침 물음 갈래가 없습니다 — 물으면서 보내기 단추도 함께 냅니다');
  assert.ok(b > 0 && a < b,
    '★ 겹침 물음보다 보내기 단추가 먼저면 고를 것이 넷이 되고,\n' +
    '  그 단추를 누르면 같은 물음이 또 뜹니다.');
});

/* ══════ ④-2 답한 «뒤»에는 할 일이 아니다 (2026-09-03 검토에서 찾은 구멍) ══════

   ★ 위 ④는 「답하기 «전»에 할 일로 남는가」만 보았다. 그래서 **답한 뒤**가 비어 있었고,
     실제로 「보내지 않기」를 고르면 ⚠ 가 「👷 아직 안 보냄」으로 도로 살아났다.
     그런데 사진 판에는 「겹치는 서류라 안 보냈습니다」만 있고 **보내기 단추가 없다** —
     판은 「끝났다」는데 목록은 「아직 할 일」이라, 가리키는 단추가 없는 ⚠ 가 됐다.

   ⚠ 글자로 보지 «않는다» — 판정을 **실제로 돌린다.** 이 구멍이 글자 검사(위 ④)를
     그대로 통과했던 것이 그 까닭이다. */

function loadWhy() {
  /* 이 물음에 닿는 길에 있는 것만 진짜로 싣는다 — 앞줄들은 이 표본에서 안 걸린다 */
  const grab = re => {
    const m = raw.match(re);
    assert.ok(m, '못 찾음: ' + re);
    return m[0].replace('const ', 'var ');
  };
  const ctx = { Number, Math, String, RegExp, Object, Array, Boolean, Date };
  vm.createContext(ctx);
  vm.runInContext([
    'var CARD_KINDS = {}, CO_KINDS = {}, KEEP_ONLY = {};',
    'function readAnyField() { return true; }',
    'function tooSmall() { return 0; }',
    'function smallCheckedOk() { return true; }',
    'function coFilledOk() { return true; }',
    'function coTodo() { return false; }',
    'function readFailAdvice() { return "판독 실패"; }',
    'function chatTodo() { return false; }',
    'function formTodo() { return false; }',
    'function canSendCoInfo() { return false; }',
    'function wageNeedsOk() { return false; }',
    grab(/^const WORKER_KINDS = \{[^}]*\};/m),
    /* ⚠ 한 줄짜리다 — 여러 줄 꼴로 찾으면 수백 줄을 통째로 삼킨다 */
    grab(/^const FIX_KEYS = \[[^\r\n]*\];/m),
    cutFn(raw, 'function readFields('),
    cutFn(raw, 'function canSendWorker('),
    cutFn(raw, 'function workerWhyNot('),
    cutFn(raw, 'function checkWhy('),
    cutFn(raw, 'function needsCheck(')
  ].join('\n'), ctx);
  return ctx;
}
const W = loadWhy();
const wkPhoto = extra => ({ meta: { w: 2600, h: 1800, read: Object.assign(
  { kind: 'idcard', auto: false, fields: { name: '김철수', company: '해찬솔에프쓰리' } }, extra) } });

test('★★★ 「보내지 않기」를 고른 뒤에는 «할 일이 아니다» — 가리키는 단추가 없는 ⚠ 가 된다', () => {
  const it = wkPhoto({ dupSkip: { at: 1, by: '권형하' } });
  assert.equal(W.checkWhy(it), '',
    '★★★ 답했는데 ⚠ 가 「👷 아직 안 보냄 — 보내기」로 되살아납니다.\n' +
    '  그런데 사진 판에는 그 단추가 없습니다(renderReadPanel 의 read.dupSkip 줄) —\n' +
    '  누를 것이 없는 할 일이라 「확인했음」 말고는 치울 길이 없어집니다.\n' +
    '  ⚠ 판정이 두 곳으로 갈린 것이 까닭입니다: 판은 아는데 이 줄이 몰랐습니다.');
  assert.equal(W.needsCheck(it), false);
});

test('★★ 답하기 «전»에는 그대로 할 일이다 — 위 고침이 물음까지 삼키면 안 된다', () => {
  const asking = wkPhoto({ dupWk: { at: 1, key: 'k', older: [{ dk: 'x' }] } });
  assert.match(W.checkWhy(asking), /겹치는 서류/,
    '★★ 물어보는 중인 것까지 치우면 그 사진은 영영 안 갑니다');
  assert.equal(W.checkWhy(wkPhoto({})), '👷 근로자 정보함에 아직 안 보냄 — 보내기',
    '★★ 겹치지도 않은 새 서류까지 조용해지면 아무도 안 보냅니다');
});

test('★ 「둘 다 두기」로 보내진 것은 깨끗하다 — 셋 다 치울 길이 열려 있어야 한다', () => {
  assert.equal(W.checkWhy(wkPhoto({ dupKept: { at: 1 }, filedWk: { at: 2, n: 1 } })), '');
});

test('★★★ 목록과 사진 판이 «같은 말»을 한다 — 갈리면 가리키는 단추가 없는 ⚠ 가 된다', () => {
  /* ⚠ 이 버그의 뿌리가 바로 이것이다 — 판은 「안 보냈습니다」로 끝내는데
     목록만 「아직 안 보냄 — 보내기」라고 했다. 둘을 함께 못박는다. */
  const i = app.indexOf("box += '<p class=\"sent\">✓ 근로자 정보함에 넣었습니다");
  assert.ok(i > 0, '근로자 정보함 사슬을 못 찾았습니다');
  const chain = app.slice(i, i + 1200);
  const s = chain.indexOf('} else if (read.dupSkip) {');
  const b = chain.indexOf('canSendWorker(read)');
  assert.ok(s > 0,
    '★★★ 판에 「보내지 않기」 갈래가 없으면 보내기 단추가 다시 나오고,\n' +
    '  누르면 같은 물음이 또 뜹니다 — 목록은 조용한데 판만 시끄러워집니다.');
  assert.ok(b > 0 && s < b,
    '★★★ 보내기 단추가 먼저면 「보내지 않기」로 답한 사진에 그 단추가 도로 나옵니다.');
});

/* ══════ ⑤ 「장」과 「건」을 가른다 ══════ */

test('★★ 근로자 정보함이 「신분증 2장」이라 적는다 — 「2」로는 두 건인지 모른다', () => {
  const fn = stripComments(cutFn(cards, 'function wkDocsSummary('));
  assert.match(fn, /\+ '장'/,
    '★★ 청구는 갈래당 «한 건»입니다(업체 × 근로자 × 서류종류 = 1건).\n' +
    '  같은 신분증을 두 번 찍었다고 두 건이 되면 청구 근거가\n' +
    '  「종이를 몇 장 찍었나」가 됩니다.');
});

test('★ 이미 쌓인 겹침은 «한자리에» 모아 보여 준다 — 물어보는 화면으로는 못 걷는다', () => {
  assert.match(cards, /function wkDupeKinds\(/, '★ 겹친 것을 세는 자리가 없습니다');
  assert.match(cards, /function wkDupeNote\(/, '★ 알려 주는 자리가 없습니다');
  assert.match(cards, /\$\{wkDupeNote\(p\)\}/,
    '★ 세어 놓고 안 그리면 아무 데도 안 나옵니다');
  const fn = stripComments(cutFn(cards, 'function wkDupeNote('));
  assert.match(fn, /재발급본/,
    '★ 「잘못됐다」고 하면 안 됩니다 — 재발급본일 수도 있습니다.');
  assert.ok(!/삭제|지웁니다/.test(fn),
    '★ 여기서 지우지 않습니다 — 어느 것이 맞는지는 원본을 봐야 압니다.');
});

/* ══════ ⑥ 저장 층은 «찾기만» 한다 ══════ */

test('★★ 겹침을 찾는 층이 스스로 지우지 않는다 — 무엇을 할지는 사람이 정한다', () => {
  const fn = stripComments(cutFn(store, 'function findWorkerDupes('));
  assert.ok(!/update\(|remove\(|set\(/.test(fn),
    '★★ 찾는 김에 지우면, 화면이 묻기도 전에 남의 신분증이 사라질 수 있습니다.');
});

test('★ 옛 서류를 걷는 것과 «사진을 치우는 것»은 자리가 다르다', () => {
  const fn = stripComments(cutFn(store, 'function dropWorkerDocs('));
  assert.ok(!/deletePhoto|puphotos/.test(fn),
    '★ 저장 층이 남의 사진첩에 손대기 시작하면 어디서 지워졌는지 아무도 못 짚습니다.');
  assert.match(fn, /docs\/' \+ dk\] = null/, '★ 걷는 일 자체를 안 합니다');
});
