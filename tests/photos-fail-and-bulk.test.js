'use strict';
/* 판독이 안 될 때 · 체크를 한꺼번에 여러 개 (대표 승인 목업 2026-08-24)
   docs/mockups/photos-fail-and-bulk.html

   ■ ① 판독 실패
     실패 까닭이 여러 가지인데 딱지는 거의 다 「판독 실패 — 다시 판독」 하나였다.
     그래서 **다시 눌러도 소용없는 실패**에도 계속 누르게 됐다 — 누를 때마다 원본
     830KB 를 내려받고 AI 를 부른 뒤 같은 실패를 다시 본다.

   ■ ② 여러 개 고르기
     쓸어서 고르기(2026-08-10)와 날짜 ✓, 「전부 확인 처리」는 이미 있었다. 빠진 것은
     **Shift+누르기 범위**, **고른 것만 확인했음**, **보이는 것 전부 고르기** 셋이다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');
/* 색은 «값»이 아니라 «뜻»으로 본다 — 팔레트를 정리해도 안 깨지게 */
const P = require('./lib-palette.js');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const readjs = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

/* ══════ ① 판독 실패 — 갈래·조언·셈 ══════ */

const F = (function () {
  const c = { Object, Array, String, Number, Boolean, Math, RegExp };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext([
    app.match(/^const READ_FAIL_RULES = \[[\s\S]*?\n\];$/m)[0],
    app.match(/^const FAIL_GIVEUP = \d+;$/m)[0],
    cutFn(app, 'function readFailKind('),
    cutFn(app, 'function worthRetry('),
    cutFn(app, 'function readFailAdvice('),
    cutFn(app, 'function failCountOf('),
    'globalThis._GIVEUP = FAIL_GIVEUP;'
  ].join('\n'), c);
  return c;
})();

const err = (m, n) => ({ kind: 'other', fields: {}, error: m, fails: n });

test('★ 다시 눌러 볼 값이 있는 실패와 없는 실패를 가른다', () => {
  /* 뜻 있는 것 */
  ['AI가 잠시 바쁩니다 — 잠시 뒤 「다시 판독」을 눌러 주세요.',
   'AI가 응답하지 않습니다 (오류 503)',
   'AI가 알아볼 수 없는 답을 보냈습니다'].forEach(m => {
    assert.equal(F.readFailKind(err(m)), 'busy', m);
    assert.equal(F.worthRetry(err(m)), true, m);
  });
  /* 헛수고 */
  assert.equal(F.readFailKind(err('사진 본문을 불러오지 못했습니다')), 'reup');
  assert.equal(F.readFailKind(err('사진을 읽을 수 없습니다')), 'reup');
  assert.equal(F.readFailKind(err('AI 키가 없습니다 — 포털 설정에서 등록해 주세요')), 'admin');
  assert.equal(F.readFailKind(err('쓸 수 있는 AI 모델이 없습니다')), 'admin');
  assert.equal(F.readFailKind(err('판독 준비가 되지 않았습니다')), 'admin');
  assert.equal(F.readFailKind(err('로그인을 확인해 주세요')), 'login');
  ['사진 본문을 불러오지 못했습니다', 'AI 키가 없습니다', '로그인을 확인해 주세요'].forEach(m => {
    assert.equal(F.worthRetry(err(m)), false,
      '★ 「' + m + '」은 다시 눌러도 같은 답입니다 — 원본 830KB 를 헛되이 내려받습니다');
  });
});

test('★ 429 안내문에 「하루 사용량」이 섞여 있어도 바쁨으로 다룬다 — 짐작이지 단정이 아니다', () => {
  const m = 'AI가 잠시 바쁩니다 — 잠시 뒤 「다시 판독」을 눌러 주세요.' +
            '\n계속 같으면 AI 키의 하루 사용량을 다 썼을 수 있습니다.';
  assert.equal(F.readFailKind(err(m)), 'busy');
  assert.equal(F.worthRetry(err(m)), true, '★ 한 번은 해 봐야 합니다 — 몇 번 실패했는지 세는 것이 그 몫입니다');
});

test('★ 모르는 실패는 한 번은 해 본다 — 「알 수 없음」으로 막아 두면 멀쩡한 것도 못 읽는다', () => {
  assert.equal(F.readFailKind(err('무슨 일인지 모를 오류')), 'other');
  assert.equal(F.worthRetry(err('무슨 일인지 모를 오류')), true);
});

test('실패가 아니면 늘 다시 걸 수 있다', () => {
  assert.equal(F.worthRetry({ kind: 'bizreg', fields: {} }), true);
  assert.equal(F.worthRetry(null), true, '아직 안 읽은 사진은 당연히 읽어야 합니다');
  assert.equal(F.readFailKind({ kind: 'bizreg' }), '');
});

test('★ 세 번 실패하면 자동으로 더 걸지 않는다 — 그 이상은 눌러도 같은 답이다', () => {
  assert.equal(F._GIVEUP, 3);
  assert.equal(F.worthRetry(err('AI가 잠시 바쁩니다', 2)), true, '두 번까지는 해 봅니다');
  assert.equal(F.worthRetry(err('AI가 잠시 바쁩니다', 3)), false,
    '★ 세 번 같은 실패면 멈춰야 합니다 — 열 때마다 원본을 내려받습니다');
  assert.equal(F.worthRetry(err('AI가 잠시 바쁩니다', 9)), false);
});

test('★ 딱지는 까닭이 아니라 «무엇을 해야 하나»로 적는다', () => {
  assert.match(F.readFailAdvice(err('사진 본문을 불러오지 못했습니다')), /다시 올려/);
  assert.match(F.readFailAdvice(err('AI 키가 없습니다')), /총괄관리자/);
  assert.match(F.readFailAdvice(err('로그인을 확인해 주세요')), /새로고침/);
  assert.match(F.readFailAdvice(err('AI가 잠시 바쁩니다')), /다시 판독/);
});

test('★ 두 번째부터는 몇 번째인지 적는다 — 처음인지 아닌지 알아야 판단이 된다', () => {
  assert.ok(F.readFailAdvice(err('AI가 잠시 바쁩니다', 1)).indexOf('번째') < 0, '한 번째는 안 적습니다');
  assert.match(F.readFailAdvice(err('AI가 잠시 바쁩니다', 2)), /2번째/);
  assert.match(F.readFailAdvice(err('AI가 잠시 바쁩니다', 3)), /3번 실패 — 손으로/);
});

test('★ 「손으로 적어 주세요」는 다시 걸 값이 있었던 실패에만 — 원본이 없으면 올리는 것이 답이다', () => {
  assert.match(F.readFailAdvice(err('사진 본문을 불러오지 못했습니다', 5)), /다시 올려/,
    '★ 「손으로 적어 주세요」라고 하면 사진을 다시 올리면 된다는 사실이 묻힙니다');
  assert.match(F.readFailAdvice(err('AI 키가 없습니다', 5)), /총괄관리자/);
});

test('★ 실패 셈은 앞 기록에 이어 센다 — 늘 1 이면 세는 뜻이 없다', () => {
  assert.equal(F.failCountOf(null, err('바쁩니다')), 1);
  assert.equal(F.failCountOf(err('바쁩니다', 1), err('바쁩니다')), 2);
  assert.equal(F.failCountOf(err('바쁩니다', 2), err('바쁩니다')), 3);
});

test('★ 성공하면 셈이 0 이다 — 안 지우면 한 번 걸린 사진이 영원히 「세 번 실패」로 남는다', () => {
  assert.equal(F.failCountOf(err('바쁩니다', 2), { kind: 'bizreg', fields: {} }), 0);
});

/* ── 글로 가리는 것의 짝: 판독 층 문구가 바뀌면 여기서 큰 소리가 난다 ── */
test('★ 판독 층이 실제로 내는 문구가 모두 «알 수 있는» 갈래로 걸린다', () => {
  /* 갈래를 글로 가리므로, 판독 층의 문구를 고치면 이 화면도 함께 고쳐야 한다.
     그것을 잊으면 조용히 「알 수 없음」이 되어 헛수고 막기가 통째로 풀린다. */
  const musts = [
    ['AI 키가 없습니다', 'admin'],
    ['쓸 수 있는 AI 모델이 없습니다', 'admin'],
    ['판독 준비가 되지 않았습니다', 'admin'],
    ['로그인을 확인해 주세요', 'login'],
    ['사진을 읽을 수 없습니다', 'reup'],
    ['읽을 글자가 없습니다', 'reup'],
    ['AI가 잠시 바쁩니다', 'busy'],
    ['AI가 응답하지 않습니다', 'busy'],
    ['AI가 알아볼 수 없는 답을 보냈습니다', 'busy']
  ];
  musts.forEach(([txt, kind]) => {
    assert.ok(readjs.indexOf(txt) >= 0,
      '★ 판독 층에 「' + txt + '」 가 없습니다 — 문구가 바뀌었으면 READ_FAIL_RULES 도 고쳐야 합니다');
    assert.equal(F.readFailKind(err(txt)), kind, txt);
  });
});

/* ── 화면·배선 ── */

test('★ 딱지가 그 조언을 그대로 쓴다 — 두 벌로 두면 한쪽만 고쳐진다', () => {
  const fn = cutFn(app, 'function checkWhy(');
  assert.match(fn, /if \(r\.error\) return readFailAdvice\(r\);/,
    '★ 딱지에 옛 문구를 박아 두면 갈래를 늘려도 화면은 그대로입니다');
});

test('★ 판독 결과에 실패 셈을 남긴다 — 올릴 때 읽는 길과 다시 읽는 길 둘 다', () => {
  ['function startRead(', 'function readPhoto('].forEach(d => {
    const fn = cutFn(app, d);
    assert.match(fn, /const fc = failCountOf\(/, d + ' 가 실패를 세지 않습니다');
    assert.match(fn, /if \(fc\) read\.fails = fc;/, d + ' 가 셈을 안 남깁니다');
  });
});

test('★ 사람이 「다시 판독」을 누르면 셈을 0 으로 되돌린다 — 막는 것이 아니다', () => {
  const fn = cutFn(app, 'function readAgain(');
  assert.match(fn, /read: Object\.assign\(\{\}, cur\.meta\.read, \{ fails: 0 \}\)/,
    '★ 안 지우면 세 번 실패한 사진은 사진을 돌려 다시 올려도 영영 「손으로」로 굳습니다');
  /* 지우는 것이 판독보다 «먼저»여야 한다 — 뒤에 지우면 새 결과가 덮인다 */
  assert.ok(fn.indexOf('fails: 0') < fn.indexOf('readPhoto(id)'),
    '★ 판독을 먼저 걸면 새 결과를 쓴 뒤에 셈을 지워 늘 0 이 됩니다');
});

test('★ 「N장 판독」은 다시 걸 값이 있는 것만 센다 — 스무 장 골랐는데 열둘이면 20은 거짓이다', () => {
  const bar = cutFn(app, 'function renderGridBar(');
  assert.match(bar, /const rn = readableSel\(\)\.length;/);
  /* ⚠ 2026-08-28 다시 겨눔 — 도구줄에서 «고른 수와 같은 숫자»를 걷어냈다(cnt).
     25장을 고르면 내려받기·판독·삭제·묶기가 다 25장이라 그 숫자가 여섯 번 되풀이됐다.
     지킬 것은 그대로다: **다른 수일 때는 그 수를 적는다.** */
  assert.match(bar, /'🔎 ' \+ cnt\(rn, n\) \+ '판독'/, '★ 고른 수를 그대로 적고 있습니다');
  assert.match(bar, /장은 다시 판독해도 같은 결과라 뺐습니다/, '왜 적은지 안 알려 줍니다');
});

test('★ 뺀 것이 있으면 왜 뺐는지 말한다 — 조용히 빼면 고장으로 읽힌다', () => {
  const fn = cutFn(app, 'function readSelected(');
  assert.match(fn, /const ids = readableSel\(\);/);
  assert.match(fn, /const skipped = all\.length - ids\.length;/);
  /* ⚠ 「alert( 이 있나」만 보면 `if (false) alert(...)` 로 되돌려도 통과한다(실제로 그랬다).
     **조건까지** 본다 — 뺀 것이 있을 때 말하는가. */
  assert.match(fn, /if \(!ids\.length\) \{\s*\r?\n\s*if \(skipped\) alert\(/,
    '하나도 없을 때 아무 말이 없습니다');
  assert.match(fn, /if \(skipped\) toast\(/, '일부를 뺐을 때 아무 말이 없습니다');
  assert.match(fn, /다시 판독」을 눌러 주세요/, '★ 그래도 해 볼 길을 안 알려 줍니다');
});

/* ══════ ② 여러 개 고르기 ══════ */

const B = (function () {
  const c = {
    Object, Array, String, Number, Boolean, Math, Set, Promise, JSON, Date,
    alert() {}, confirm() { return c._yes !== false; },
    toast(m) { c._toast.push(m); },
    _toast: [], _rendered: 0,
    renderGrid() { c._rendered++; }, renderGridBar() {}, renderNeedBox() {},
    blockedIfOther() { return false; },
    photoYearOf: () => '2026', photoOwner: () => 'u1',
    PuPhotoStore: { myName: () => '박은비',
      saveRead(y, id, read) { c._saved.push({ id: id, read: read }); return Promise.resolve(); } },
    _saved: [],
    $: id => (c._els[id] || (c._els[id] = { style: {}, textContent: '', disabled: false })),
    _els: {},
    document: { querySelector: () => null }
  };
  c.selected = new Set();
  c.gridItems = [];
  c.shownItems = () => c._shown;
  c._shown = [];
  c.needsCheck = it => !!(it && it.meta && it.meta.need);
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext([
    cutFn(app, 'function idsOf('),
    'function clearSel(){ selected.clear(); renderGridBar(); renderGrid(); }',
    cutFn(app, 'function toggleOne('),
    'var pickAnchor = null;',
    cutFn(app, 'function pickRange('),
    cutFn(app, 'function selectAllShown('),
    cutFn(app, 'function ackSelected(')
  ].join('\n'), c);
  return c;
})();

function setup(items) {
  B.selected.clear();
  B._shown = items;
  B.gridItems = items;
  B._saved = []; B._toast = []; B._rendered = 0;
  B.pickAnchor = null;
  B._els = {};
  return items;
}
const one = (id, opt) => Object.assign({ id: id, meta: { need: false } }, opt || {});
const doc = (id, pages) => ({ id: id, _pages: pages, meta: { need: false } });
const pick = () => Array.from(B.selected).sort();

test('★ Shift+누르기 — 기준 칸부터 여기까지 «보이는 차례»로 전부', () => {
  setup(['a', 'b', 'c', 'd', 'e'].map(x => one(x)));
  B.toggleOne('b');
  B.pickRange('d');
  assert.deepEqual(pick(), ['b', 'c', 'd'],
    '★ 사이가 안 골라지면 Shift 를 쓴 뜻이 없습니다');
});

test('★ 거꾸로 눌러도 된다 — 뒤에서 앞으로', () => {
  setup(['a', 'b', 'c', 'd'].map(x => one(x)));
  B.toggleOne('d');
  B.pickRange('b');
  assert.deepEqual(pick(), ['b', 'c', 'd']);
});

test('★ 기준은 그대로 둔다 — 이어서 범위를 늘렸다 줄일 수 있어야 한다', () => {
  setup(['a', 'b', 'c', 'd', 'e'].map(x => one(x)));
  B.toggleOne('b');
  B.pickRange('c');
  B.pickRange('e');
  assert.equal(B.pickAnchor, 'b', '★ 기준이 옮겨 가면 범위를 늘릴 수 없습니다');
  assert.deepEqual(pick(), ['b', 'c', 'd', 'e']);
});

test('★ 범위는 더하기만 한다 — Shift 를 놓친 순간 골라 둔 것이 날아가면 안 된다', () => {
  setup(['a', 'b', 'c', 'd'].map(x => one(x)));
  B.selected.add('a');
  B.toggleOne('c');
  B.pickRange('d');
  assert.ok(B.selected.has('a'), '★ 먼저 골라 둔 것을 버렸습니다');
});

test('★ 접힌 문서는 쪽 전부가 함께 — 한 칸이 여섯 쪽을 대신한다', () => {
  setup([one('a'), doc('p1', ['p1', 'p2', 'p3']), one('z')]);
  B.toggleOne('a');
  B.pickRange('z');
  assert.deepEqual(pick(), ['a', 'p1', 'p2', 'p3', 'z'],
    '★ 대표 쪽만 골라 「5장 삭제」라고 하면 사진을 잃습니다');
});

test('★ 기준이 화면에 없으면 한 장으로 다룬다 — 안 보이는 사진이 조용히 골라지면 안 된다', () => {
  setup(['a', 'b', 'c'].map(x => one(x)));
  B.pickAnchor = '화면에없는것';
  B.pickRange('c');
  assert.deepEqual(pick(), ['c']);
});

test('기준이 없으면(처음이면) 한 장으로', () => {
  setup(['a', 'b'].map(x => one(x)));
  B.pickRange('b');
  assert.deepEqual(pick(), ['b']);
});

test('★ 그냥 누르면 기준이 그 칸으로 옮겨진다 — 그래야 다음 Shift 가 맞는다', () => {
  setup(['a', 'b', 'c'].map(x => one(x)));
  B.toggleOne('a');
  assert.equal(B.pickAnchor, 'a');
  B.toggleOne('c');
  assert.equal(B.pickAnchor, 'c');
});

test('★ 「전부」는 보이는 것만 — 걸러 놓은 밖의 사진을 담으면 「N장 삭제」가 거짓이 된다', () => {
  const shown = ['a', 'b'].map(x => one(x));
  setup(shown);
  B.gridItems = shown.concat([one('밖에있는것')]);
  B.selectAllShown();
  assert.deepEqual(pick(), ['a', 'b'], '★ 화면에 없는 사진이 골라졌습니다');
});

test('★ 「전부」를 다시 누르면 푼다 — 단추 하나로 둘 다', () => {
  setup(['a', 'b', 'c'].map(x => one(x)));
  B.selectAllShown();
  assert.equal(B.selected.size, 3);
  B.selectAllShown();
  assert.equal(B.selected.size, 0, '★ 다시 눌러도 안 풀리면 「취소」를 따로 찾아야 합니다');
});

test('「전부」도 접힌 문서의 쪽을 다 담는다', () => {
  setup([one('a'), doc('p1', ['p1', 'p2'])]);
  B.selectAllShown();
  assert.deepEqual(pick(), ['a', 'p1', 'p2']);
});

/* ── 고른 것만 확인했음 ── */

test('★ 고른 것 가운데 «확인이 필요한» 것만 치운다', async () => {
  setup([one('a', { meta: { need: true, read: { kind: 'form' } } }),
         one('b', { meta: { need: false, read: { kind: 'card' } } }),
         one('c', { meta: { need: true, read: { kind: 'form' } } })]);
  B.selected.add('a'); B.selected.add('b'); B.selected.add('c');
  B.ackSelected();
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(B._saved.map(x => x.id).sort(), ['a', 'c'],
    '★ 확인이 필요하지 않은 사진에까지 확인 표시를 남기면 안 됩니다');
  assert.ok(B._saved[0].read.ack && B._saved[0].read.ack.at, '확인 표시를 안 남겼습니다');
  assert.equal(B._saved[0].read.ack.by, '박은비', '누가 확인했는지 안 남깁니다');
});

test('★ 접힌 문서는 쪽마다 저장한다 — 대표 쪽만 치우면 나머지가 할 일에 남는다', async () => {
  setup([Object.assign(doc('p1', ['p1', 'p2', 'p3']), { meta: { need: true, read: { kind: 'form' } } })]);
  B.selected.add('p1');
  B.ackSelected();
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(B._saved.map(x => x.id).sort(), ['p1', 'p2', 'p3'],
    '★ 「3쪽 확인했음」이라 해 놓고 1쪽만 치웁니다');
});

test('★ 읽어 둔 값을 지우지 않는다 — 확인 표시만 얹는다', async () => {
  setup([one('a', { meta: { need: true, read: { kind: 'form', fields: { company: '가나' } } } })]);
  B.selected.add('a');
  B.ackSelected();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(B._saved[0].read.kind, 'form');
  assert.equal(B._saved[0].read.fields.company, '가나', '★ 읽어 둔 값이 날아갔습니다');
});

test('★ 묻고 나서 한다 — 잘못 치우면 한 장씩 찾아 들어가야 한다', async () => {
  setup([one('a', { meta: { need: true, read: { kind: 'form' } } })]);
  B.selected.add('a');
  B._yes = false;                       /* 「취소」를 누른 셈 */
  B.ackSelected();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(B._saved.length, 0, '★ 묻지 않고 치웠거나, 취소를 무시했습니다');
  B._yes = true;
});

test('고를 것이 없으면 무엇을 해야 하는지 말한다', () => {
  setup([one('a', { meta: { need: false } })]);
  B.ackSelected();
  assert.match(B._toast.join('/'), /골라 주세요/);
  B._toast = [];
  B.selected.add('a');
  B.ackSelected();
  assert.match(B._toast.join('/'), /확인이 필요한 사진이 없습니다/,
    '골랐는데 아무 일이 없으면 고장으로 읽힙니다');
});

/* ── 배선 ── */

test('★ Shift+누르기가 체크 동그라미와 사진 몸통 «둘 다»에서 된다', () => {
  const i = app.indexOf("$('grid').addEventListener('click'");
  assert.ok(i > 0, '격자 누르기 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 1400);
  assert.match(seg, /if \(ev\.shiftKey && pickAnchor\) pickRange\(id\);\s*\r?\n\s*else toggleOne\(id\);/,
    '동그라미에서 Shift 가 안 걸립니다');
  assert.match(seg, /if \(ev\.shiftKey && pickAnchor\) \{ pickRange\(id\); return; \}/,
    '★ 사진 몸통을 Shift 로 누르면 크게 보기가 열려 Shift 를 누른 뜻이 사라집니다');
});

test('★ 「☑ 전부」는 고른 것이 없어도 보인다 — 고르기의 시작이다', () => {
  const bar = cutFn(app, 'function renderGridBar(');
  assert.ok(!/'selAllBtn'[^\n]*\bn \?/.test(bar), '고른 것이 있을 때만 보이면 쓸 수가 없습니다');
  assert.match(bar, /\$\('selAllBtn'\)\.style\.display = shown \? 'inline-block' : 'none';/,
    '★ 보여 줄 사진이 있으면 늘 보여야 합니다');
  assert.match(bar, /allOn \? '☐ 전부 풀기'/, '다 골랐을 때 푸는 말로 바뀌지 않습니다');
  /* 고른 것에 쓰는 단추 목록에는 안 들어간다 — 들어가면 위 규칙과 부딪힌다 */
  const list = bar.match(/\['dlBtn'[^\]]*\]/)[0];
  assert.ok(list.indexOf('selAllBtn') < 0, '★ 고른 것이 있을 때만 나오는 목록에 들어갔습니다');
});

test('★ 「✓ N장 확인했음」은 확인이 필요한 것만 센다 — 20장 골랐는데 셋이면 20은 거짓이다', () => {
  const bar = cutFn(app, 'function renderGridBar(');
  assert.match(bar, /selected\.has\(it\.id\) && needsCheck\(it\)/, '★ 고른 수를 그대로 적고 있습니다');
  assert.match(bar, /\$\('ackSelBtn'\)\.style\.display = ackN \? 'inline-block' : 'none';/,
    '치울 것이 없는데 단추를 띄우면 눌러도 아무 일이 없습니다');
  /* ⚠ 2026-08-28 다시 겨눔 — 도구줄에서 «고른 수와 같은 숫자»를 걷어냈다(cnt).
     25장을 고르면 내려받기·판독·삭제·묶기가 다 25장이라 그 숫자가 여섯 번 되풀이됐다.
     지킬 것은 그대로다: **다른 수일 때는 그 수를 적는다.** */
  assert.match(bar, /'✓ ' \+ cnt\(ackN, n\) \+ '확인했음'/);
});

test('★ 고르는 법을 화면에 적어 둔다 — 쓸어서 고르기는 있었는데 아무 말이 없었다', () => {
  assert.match(app, /id="pickTip"/, '안내 줄이 없습니다');
  const i = app.indexOf('id="pickTip"');
  const seg = app.slice(i, i + 500);
  ['Shift', '끌면', '동그라미'].forEach(w =>
    assert.ok(seg.indexOf(w) >= 0, w + ' 를 안 알려 줍니다'));
  /* 폰에서는 Shift·끌기가 안 켜진다 — 안 되는 것을 알려 주면 안 된다.
     ⚠ 2026-08-26 부터 안내는 한 줄을 늘 먹는 대신 ? (#pickHelp) 안으로 들어갔다.
       어느 칸이 그 말을 담고 있든 **폰에서 안 보이는 것**만 지킨다. */
  const wrap = app.match(/<span id="(pickHelp)"[\s\S]{0,600}?id="pickTip"/);
  const hideId = wrap ? wrap[1] : 'pickTip';
  assert.match(app, new RegExp('@media \\(max-width:760px\\)\\{ #' + hideId + '\\{display:none\\}'),
    '★ 폰에서 안 되는 방법을 알려 주고 있습니다');
});

/* ── 판독 실패만 보기 ── */

test('★ 「판독 실패만」은 확인필요 «안에서만» 걸린다', () => {
  const fn = cutFn(app, 'function shownItemsFresh(');
  assert.match(fn, /if \(needOnly && failOnly\) list = list\.filter/,
    '★ 확인필요 밖에서 걸면 띠에 적힌 말과 어긋나 무엇을 보는지 알 수 없습니다');
  assert.match(fn, /it\.meta\.read && it\.meta\.read\.error/);
});

test('★ 확인필요를 나가면 「판독 실패만」도 함께 꺼진다', () => {
  assert.match(cutFn(app, 'function toggleNeed('), /failOnly = false;/,
    '★ 안 끄면 다시 들어올 때 왜 세 장만 보이는지 알 수 없습니다');
  assert.match(cutFn(app, 'function clearAllFilters('), /failOnly = false;/);
  /* needOnly 를 끄는 자리마다 함께 껐는지 — 한 곳만 놓쳐도 같은 병이다 */
  const bad = [];
  app.split('\n').forEach(function (l, i) {
    if (!/needOnly = false/.test(l)) return;
    if (/^\s*let /.test(l)) return;
    if (/failOnly/.test(l)) return;
    /* 바로 다음 줄에 있어도 된다 */
    const next = app.split('\n')[i + 1] || '';
    if (/failOnly = false/.test(next)) return;
    bad.push((i + 1) + ': ' + l.trim());
  });
  assert.deepEqual(bad, [], '★ 여기서 needOnly 만 끄고 failOnly 를 안 끕니다:\n' + bad.join('\n'));
});

test('★ 실패가 하나도 없으면 칩을 아예 안 만든다 — 0장 나오는 단추는 고장으로 읽힌다', () => {
  const fn = cutFn(app, 'function renderBackBar(');
  assert.match(fn, /needOnly && \(fails \|\| failOnly\)/,
    '★ 실패 0장인데 칩이 뜨면 눌러도 빈 화면만 나옵니다');
  assert.match(fn, /failOnly \? '✕ 판독 실패만 '/, '켜졌을 때 끄는 길이 안 보입니다');
  assert.match(fn, /toggleFailOnly\(\)/);
});

test('칩 글자색을 정해 둔다 — 띠의 파란 글자를 물려받으면 켜졌는지 알 수 없다', () => {
  /* ⚠ 색값을 박지 않는다 — 규칙은 「빨간 계열로 물려받지 않고 제 색을 갖는가」다 */
  const chip = (app.match(/#backWhere \.failchip\{[^}]*color:(#[0-9a-fA-F]{3,8})/) || [])[1];
  assert.ok(chip, '★ 칩 글자색을 안 정해 두면 띠의 파란 글자를 물려받습니다');
  assert.ok(P.isRed(chip), '★ 실패 칩이 빨간 계열이 아닙니다: ' + chip);
  assert.match(app, /#backWhere \.failchip\.on\{/);
});

/* ── 구글 판독 한도(quota) ─ 2026-09-07 대표 제보 ──────────────────────
   사진첩에 이 영어가 그대로 떴다:
     「You exceeded your current quota … Quota exceeded for metric:
      generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 500」
   ★ 이 갈래가 없어서 'other' 로 떨어졌고, other 는 자동 재시도 대상이다 —
     한도에 걸린 사진을 자동으로 다시 걸었다. 걸 때마다 한도를 «더» 먹는다. */

test('★★ 구글이 보낸 한도 초과(영어 원문)를 알아본다', () => {
  const 원문 = 'You exceeded your current quota, please check your plan and billing details. '
    + 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 500';
  assert.strictEqual(F.readFailKind({ error: 원문 }), 'quota',
    '한글 문구로만 견주면 구글 원문을 못 알아봅니다');
});

test('★★ 한도에 걸린 것은 «자동으로» 다시 걸지 않는다 — 걸 때마다 더 먹는다', () => {
  const 원문 = 'Quota exceeded for metric: generate_content_free_tier_requests';
  assert.strictEqual(F.worthRetry({ error: 원문 }), false);
  /* 바쁜 것은 그대로 다시 건다 — 조금 뒤면 되기 때문이다 */
  assert.strictEqual(F.worthRetry({ error: 'AI가 잠시 바쁩니다' }), true);
});

test('★ 한도 안내는 «몇 번 실패했나»에 안 흔들린다 — 열 번 걸려도 할 말이 같다', () => {
  const r = { error: 'RESOURCE_EXHAUSTED', fails: 9 };
  const 말 = F.readFailAdvice(r);
  assert.ok(말.indexOf('한도') >= 0, '한도라고 말해야 합니다: ' + 말);
  assert.ok(말.indexOf('손으로 적어') < 0,
    '★ 「9번 실패 — 손으로 적어 주세요」로 새면 안 됩니다 — 한도는 손으로 적을 일이 아닙니다');
});

test('⚠ 우리가 만든 한글 429 안내문은 여전히 «바쁨»이다 — 그건 짐작이지 단정이 아니다', () => {
  const 우리말 = 'AI가 잠시 바쁩니다 — AI 키의 하루 사용량을 다 썼을 수 있습니다';
  assert.strictEqual(F.readFailKind({ error: 우리말 }), 'busy',
    '짐작을 단정으로 올리면 조금 뒤면 될 것을 「오늘은 끝」이라고 말하게 됩니다');
});

test('★ 실패 원문을 «덮지 않되» 그 위에 무슨 뜻인지 한 줄을 얹는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
  const at = src.indexOf("const cause = read.error");
  assert.ok(at > 0, '실패 원문을 그리는 자리를 못 찾았습니다');
  const 둘레 = src.slice(at, at + 400);
  assert.ok(/readFailAdvice\(read\)/.test(둘레),
    '★ 영어 원문만 있으면 무엇을 해야 할지 알 수 없습니다 — 우리 말 한 줄이 위에 있어야 합니다');
  assert.ok(/esc\(read\.error\)/.test(둘레),
    '⚠ 원문은 그대로 남아야 합니다 — 덮었다가 원인을 잘못 짚은 적이 있습니다(모델 종료 사고)');
});
