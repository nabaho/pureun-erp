/* 자동 판독이 원본을 되풀이해 내려받지 않게 (비용 조사 2026-08-13)

   판독 한 장은 실시간DB 에서 **원본(수 MB)**을 내려받는다. 판독기 판 번호를
   올리면 읽어 둔 사진이 **전부** 다시 읽을 것이 되는데, 예전에는 그것을 안 읽은
   사진과 똑같이 한 번에 20장씩 처리했다. 직원 다섯이 하루 몇 번씩 열면 같은
   사진을 되풀이해 내려받아 GB 단위가 된다(8/1~8/11 실시간DB 내려받기 ₩28,833).

   ⚠ 이 검사가 지키는 두 가지
     ① 판 번호 올림이 **한 번에 몇 장으로** 묶이는가 (돈)
     ② 그래도 **안 읽은 사진은 그대로 다 읽히는가** (일이 밀리면 안 된다) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const m = app.match(new RegExp('^(?:async )?function ' + name + '\\([\\s\\S]*?\\r?\\n\\}', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0];
}
function constOf(name) {
  const m = app.match(new RegExp('^const ' + name + ' = [^\\n]*;', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0].replace('const ', 'var ');
}

function load(items) {
  const queued = [];
  const note = { style: {}, textContent: '' };
  const ctx = {
    Math, Object, String, Number,
    /* ⚠ 2026-08-24: 판 번호가 둘로 갈렸다. 다시 읽기는 «물음 판»을 보므로 그것도
       줘야 한다 — 안 주면 `rv < undefined` 가 늘 거짓이 되어 **다시 읽을 것이
       하나도 없다**고 나오고, 이 파일의 검사가 통째로 운다(그렇게 한 번 걸렸다).
       이 파일의 표본이 rv 7(옛 판)·8(최신)이므로 물음 판도 8 로 둔다. */
    PuDocRead: { READ_VERSION: 8, PROMPT_VERSION: 8 },
    gridItems: items || [],
    /* ⚠ 2026-08-29: 「내 사진」에 공유받은 사진이 섞이면서, 자동 판독은 **손댈 수 있는
       사진만** 읽는다. 판독은 읽고 «쓰는» 일이라 남의 사진은 결과를 못 쓰고 한도만 나간다.
       여기서는 전부 내 것으로 둔다 — 한도 셈이 이 파일의 주제다. */
    mayTouch: function () { return true; },
    queuePhotoRead: function (id) { queued.push(id); },
    $: function (id) { return id === 'autoNote' ? note : null; },
    _queued: queued, _note: note
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    constOf('AUTO_READ_MAX'), constOf('AUTO_RESTALE_MAX'),
    app.match(/^const RESTALE_SKIP = \{[^\n]*\};/m)[0].replace('const ', 'var '),
    /* ⚠ 2026-08-24: staleRead 가 «물음 판»을 보게 되면서 readPromptVer 를 함께
       쓴다(옛 기록에는 pv 가 없어 rv 를 대신 본다). 안 넣으면 그 자리에서 멎어
       이 파일의 검사가 통째로 운다. */
    fnOf('readPromptVer'),
    /* ⚠ 2026-08-27: 「모으는 중」 판정을 collectingNow 한 곳으로 모았다. 안 넣으면
       두 판정이 그 자리에서 멎어 이 파일의 검사가 통째로 운다. */
    fnOf('collectingNow'),
    /* ⚠ 2026-08-31: 실패한 판독도 «자동으로» 다시 건다(직원 보고 「OCR 안 읽히는 게 많다」).
       그 판단(worthRetry)과 딸린 것들을 **원본 그대로** 넣는다 — 대역을 만들면
       화면과 다른 규칙을 보게 된다. */
    constOf('AUTO_RETRY_MAX'), constOf('FAIL_GIVEUP'),
    app.match(/^const READ_FAIL_RULES = \[[\s\S]*?^\];/m)[0].replace('const ', 'var '),
    fnOf('readFailKind'), fnOf('worthRetry'), fnOf('failedRead'),
    /* ⚠ 2026-09-07 — 자동 판독 앞에 **문지기**가 붙었다(사진은 구글로 안 보낸다).
       세 목록 모두 그것을 지나므로 여기서도 **원본 그대로** 실어야 한다 —
       대역을 만들면 「막았다고 믿는데 실제로는 새는」 것을 못 본다.
       ⚠ 이 파일의 표본에는 upAt 이 없다(옛 사진과 같은 모양) — 그래서 「한 뭉치로
         묶여 붙잡히는」 일이 없고, 이 파일의 주제(한도 셈)가 그대로 재진다. */
    'var readQuotaOut = false; var readAskSaid = "";',
    'var _bszSrc = null, _bszN = -1, _bsz = null;',
    constOf('READ_ASK_MIN'),
    fnOf('batchSizes'), fnOf('upBatchKey'), fnOf('readHoldOf'), fnOf('readSkipWhy'),
    'function renderReadAsk() {}',
    fnOf('neverRead'), fnOf('staleRead'), fnOf('autoReadPending'),
    /* ⚠ 2026-09-08 — 판독이 «누를 때만»으로 바뀌었다(대표 지시). autoReadPending 은
       이제 «세기만» 하고, 실제로 거는 것은 readWaitRun 이다. 이 파일이 재는 것은
       «한도 셈»이라 규칙(안 읽은 것 먼저·20장·3장·문서마다 한 번)은 그대로다 —
       겨눔만 누르는 쪽으로 옮겼다. 대역을 만들지 «않는다»(화면과 다른 규칙을 보게 된다). */
    fnOf('readWaitOf'), fnOf('readWaitRun'), 'function renderGrid() {}'
  ].join('\n'), ctx);
  return ctx;
}

const fresh = function (id) { return { id: id, meta: {} }; };
const stale = function (id, kind) { return { id: id, meta: { read: { kind: kind || 'card', rv: 7 } } }; };
const done = function (id) { return { id: id, meta: { read: { kind: 'card', rv: 8 } } }; };

test('★ 판 번호가 올라 다시 읽는 것은 한 번에 몇 장뿐이다', () => {
  const list = [];
  for (let i = 0; i < 50; i++) list.push(stale('s' + i));
  const c = load(list);
  c.readWaitRun();
  assert.equal(c._queued.length, 3,
    '★ 다시 읽기를 20장씩 하면 원본 수십 MB 를 열 때마다 내려받습니다: ' + c._queued.length);
  assert.match(c._note.textContent, /남은 47장/, '남은 장수를 안 알리면 「왜 저건 안 됐지」가 됩니다');
});

test('★ 안 읽은 사진은 그대로 20장까지 읽는다 — 일이 밀리면 안 된다', () => {
  const list = [];
  for (let i = 0; i < 30; i++) list.push(fresh('f' + i));
  const c = load(list);
  c.readWaitRun();
  assert.equal(c._queued.length, 20, '새로 올린 사진까지 줄이면 「올렸는데 판독이 안 된다」가 됩니다');
});

test('★ 안 읽은 것이 먼저다 — 새로 올린 사진이 뒤로 밀리면 안 된다', () => {
  const list = [];
  for (let i = 0; i < 25; i++) list.push(stale('s' + i));
  list.push(fresh('NEW'));
  const c = load(list);
  c.readWaitRun();
  assert.ok(c._queued.indexOf('NEW') >= 0, '★ 방금 올린 사진이 다시 읽기에 밀려 안 읽힙니다');
  assert.equal(c._queued[0], 'NEW', '안 읽은 것이 앞에 서야 합니다');
  assert.equal(c._queued.length, 1 + 3);
});

test('★ 회의사진·급여서류는 판 번호가 올라도 다시 안 읽는다', () => {
  /* 담는 것이 한 줄뿐이라 다시 읽어도 새로 나올 것이 없다.
     그런데 원본 내려받기 값은 똑같이 든다. */
  const c = load([stale('m1', 'meeting'), stale('p1', 'payslip'), stale('c1', 'card')]);
  c.readWaitRun();
  assert.deepEqual(c._queued, ['c1'], '★ 나올 것 없는 사진을 다시 읽고 있습니다');
});

test('★ 「기타서류(other)」는 반드시 다시 읽는다 — 판 번호의 존재 이유다', () => {
  /* 종류를 못 가려 굳은 사진을 되살리는 것이 판 번호를 올리는 까닭이다
     (2026-08-06: 회의사진 0장인데 기타서류에 6장이 앉아 있었다) */
  const c = load([stale('o1', 'other')]);
  c.readWaitRun();
  assert.deepEqual(c._queued, ['o1'], '★ other 를 건너뛰면 잘못 굳은 사진이 영영 안 풀립니다');
  assert.ok(!/other/.test(app.match(/^const RESTALE_SKIP = \{[^\n]*\};/m)[0]),
    '★ 건너뛸 종류에 other 가 들어갔습니다');
});

test('★ 다시 읽기를 0 으로 막으면 안 된다 — 판독기를 고쳐도 안 고쳐진다', () => {
  assert.match(app, /const AUTO_RESTALE_MAX = [1-9]/,
    '★ 0 이면 옛 판으로 읽힌 사진이 영영 그대로입니다');
});

test('사람이 확인한 것은 안 뒤집는다', () => {
  const c = load([{ id: 'a', meta: { read: { kind: 'card', rv: 7, ack: true } } }]);
  c.readWaitRun();
  assert.deepEqual(c._queued, []);
});

test('다 읽은 사진은 안 건드린다', () => {
  const c = load([done('a'), done('b')]);
  c.readWaitRun();
  assert.deepEqual(c._queued, []);
  assert.equal(c._note.style.display, 'none', '할 일이 없으면 안내도 없어야 합니다');
});

/* ⚠ 2026-08-27 다시 겨눔 — 종전에는 «죽은» needsRead 로 확인해서, **이미 읽어 둔**
   장을 모으는 경우(카톡으로 한 장씩 온 계약서를 묶을 때)가 통째로 빠져 있었다.
   실제로 그 길에서는 staleRead 에 가드가 없어 낱장으로 또 읽히고 있었다.
   그래서 «대기열에 실제로 안 들어가는가»를 두 갈래로 다 본다. */
test('★ 모으는 중인 장은 아직 안 읽는다 — 안 읽은 장도, 이미 읽은 장도', () => {
  const c = load([
    { id: 'a', meta: { doc: { group: 'g', collecting: true } } },                 // 아직 안 읽음
    { id: 'b', meta: { doc: { group: 'g', collecting: true }, read: { kind: 'card', rv: 7 } } }  // 이미 읽음 = 다시 읽을 차례
  ]);
  c.readWaitRun();
  assert.deepEqual(c._queued, [],
    '★ 모으는 중인 장이 판독 대기열에 들어갔습니다 — 낱장으로 또 읽힙니다');
  assert.equal(c.neverRead({ meta: { doc: { collecting: true } } }), false);
  assert.equal(c.staleRead({ meta: { doc: { collecting: true }, read: { kind: 'card', rv: 7 } } }), false,
    '★ 다시 읽기 쪽에 가드가 없습니다 — 이것이 2026-08-27에 찾은 구멍입니다');
});

test('★ 여러 쪽 문서는 문서마다 한 번만 — 안 읽은 쪽·다시 읽을 쪽 둘 다', () => {
  /* 쪽마다 걸면 첫 쪽이 문서 전체를 읽어 답을 써 놓은 뒤에도 나머지 쪽이
     같은 문서를 또 읽는다 — 원본을 쪽수만큼 더 내려받는다. */
  const c = load([
    { id: 'p1', meta: { doc: { group: 'g1', page: 1 } } },
    { id: 'p2', meta: { doc: { group: 'g1', page: 2 } } },
    { id: 'q1', meta: { doc: { group: 'g2', page: 1 }, read: { kind: 'card', rv: 7 } } },
    { id: 'q2', meta: { doc: { group: 'g2', page: 2 }, read: { kind: 'card', rv: 7 } } }
  ]);
  c.readWaitRun();
  assert.deepEqual(c._queued, ['p1', 'q1'], '★ 같은 문서를 두 번 읽습니다');
});

/* ⚠ 종전 제목: 「needsRead 는 둘을 합친 것이다 — 다른 곳이 쓰는 판정이 어긋나면 안 된다」.
   그런데 **그 「다른 곳」이 없었다.** 아무도 안 부르는 함수였고, 화면은 둘을 따로 쓴다
   (상한이 20장·3장으로 다르기 때문이다). 2026-08-27 검토에서 걷어냈다.
   지켜야 할 것은 그대로다 — **두 판정이 각자 제 몫을 가른다.** */
test('★ 두 판정이 각자 제 몫을 가른다', () => {
  const c = load([]);
  assert.equal(c.neverRead(fresh('a')), true, '안 읽은 것은 neverRead 몫이다');
  assert.equal(c.staleRead(fresh('a')), false, '안 읽은 것을 staleRead 가 집으면 상한이 뒤섞인다');
  assert.equal(c.staleRead(stale('b')), true, '다시 읽을 것은 staleRead 몫이다');
  assert.equal(c.neverRead(stale('b')), false);
  assert.equal(c.staleRead(stale('c', 'meeting')), false, '나올 것 없는 종류는 다시 안 읽는다');
  assert.equal(c.staleRead(done('d')), false);
  assert.equal(c.neverRead(done('d')), false);
});
