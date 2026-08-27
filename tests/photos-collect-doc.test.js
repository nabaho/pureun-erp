/* 연속 캡처를 한 문서로 모아 한 번에 읽기 (대표 지시 2026-08-13)
   "만약 캡처를 1개가 아닌 2개 3개를 연속으로 하고 합쳐서 하나로 읽기 기능을
    만들고 싶은데 그러려면 어떻게 해야 하나"

   ⚠ 이 기능의 전부는 **모으는 동안 판독을 붙잡아 두는 것**이다. 그 한 줄이
     빠지면 장마다 반쪽짜리로 읽히고 AI를 네 번 부른다(무료 등급 분당 10번이라
     그 세 번이 다른 서류 판독까지 밀어낸다).
   ⚠ 가장 나쁜 상태는 **collecting 인 채로 남는 것**이다 — 자동 판독이 건너뛰므로
     아무도 안 읽어 주는 사진이 되고, 사람은 올렸다고 믿는다. */
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

/* ── 판독을 붙잡아 두는가 (핵심) ── */

test('★ 모으는 중인 장은 올라와도 판독을 안 건다', () => {
  const fn = fnOf('onQueueChange');
  /* ⚠ 2026-08-27: 조건을 collectingNow 한 곳으로 모았다. 「모으는 중이면 안 건다」는
     그대로다 — 못 박는 것은 조건의 «모양»이 아니라 그 판정을 쓴다는 사실이다. */
  assert.match(fn, /if \(!collectingNow\(j\)\) \{/,
    '★ 이 줄이 없으면 장마다 따로 읽혀 모으기가 아무 뜻이 없습니다');
  /* 실제로 돌려 본다 — 모으는 중이면 queueRead 가 안 불려야 한다 */
  const run = function (doc) {
    const called = [];
    const ctx = {
      Date, setTimeout: function () {},
      upJobs: [], portalCameraToken: null, portalCameraReturning: false,
      UP_HIDE_MS: 3000,
      addToGrid: function () {},
      docJobs: function (j) { return [j]; },
      queueRead: function (j) { called.push(j.id); },
      renderUp: function () {}
    };
    vm.createContext(ctx);
    vm.runInContext(fnOf('collectingNow') + '\n' + fnOf('onQueueChange'), ctx);
    ctx.onQueueChange([{ id: 'p1', state: 'done', meta: { doc: doc } }]);
    return called;
  };
  assert.deepEqual(run({ group: 'g', page: 1, collecting: true }), [],
    '★ 모으는 중인데 읽었습니다 — 헛읽기가 그대로 납니다');
  assert.deepEqual(run(null), ['p1'], '평소에는 읽어야 합니다');
  assert.deepEqual(run({ group: 'g', page: 1, total: 1, taken: 1 }), ['p1'],
    '다 모은 문서는 읽어야 합니다');
});

/* ⚠⚠ 2026-08-27 다시 겨눔 — 이 검사는 **needsRead** 를 보고 있었는데 그 함수는
   **아무도 안 불렀다.** 화면이 쓰는 것은 neverRead·staleRead 둘이다(상한이 달라
   따로 쓴다). 그래서 「모으는 중인 장은 자동 판독이 안 집어간다」를 지키고 있다고
   믿었지만, 실제로는 **staleRead 에 그 가드가 없어서 집어가고 있었다** —
   이미 읽어 둔 사진 여러 장을 한 문서로 묶을 때(카톡으로 한 장씩 온 계약서)
   묶는 중인 장이 다시 읽기 차례에 들어갔다. 막으려던 바로 그 헛읽기다.
   → 살아 있는 두 함수를 **각각** 본다. */
test('★ 다음에 열 때 자동 판독도 건너뛴다 — 두 길 모두', () => {
  const ctx = { PuDocRead: { READ_VERSION: 8, PROMPT_VERSION: 9 }, Object };
  vm.createContext(ctx);
  vm.runInContext(app.match(/^const RESTALE_SKIP = \{[^\n]*\};/m)[0].replace('const ', 'var ') + '\n' +
    fnOf('collectingNow') + '\n' + fnOf('readPromptVer') + '\n' +
    fnOf('neverRead') + '\n' + fnOf('staleRead'), ctx);

  /* ① 아직 안 읽은 장 */
  assert.equal(ctx.neverRead({ meta: { doc: { collecting: true } } }), false,
    '★ 모으는 중인 장을 자동 판독이 집어갑니다');
  assert.equal(ctx.neverRead({ meta: {} }), true, '안 읽은 사진은 읽어야 합니다');
  assert.equal(ctx.neverRead({ meta: { doc: { group: 'g', total: 3 } } }), true,
    '다 모은 문서는 읽어야 합니다');

  /* ② 이미 읽었는데 «다시 읽을 때가 된» 장 — 여기 가드가 없어서 새어 나갔다 */
  const oldRead = { kind: 'card', pv: 1 };     // 물음 판이 낮다 → 그냥 두면 다시 읽는다
  assert.equal(ctx.staleRead({ meta: { read: oldRead } }), true,
    '(전제) 이 장은 원래 다시 읽을 차례다');
  assert.equal(ctx.staleRead({ meta: { read: oldRead, doc: { collecting: true } } }), false,
    '★ 모으는 중인 장이 «다시 읽기» 차례에 들어갑니다 — 낱장으로 또 읽힙니다');
});

test('★ 「모으는 중」 판정은 한 곳뿐이다 — 흩어지면 한 곳이 꼭 빠진다', () => {
  /* 종전에는 세 곳에 흩어져 있었고, 그중 하나는 죽은 함수였다.
     죽은 쪽에 가드가 있어서 «덮여 있는 것처럼» 보인 것이 이 사고의 뿌리다. */
  /* 주석은 세지 않는다 — 설명 글에 낱말이 나오는 것까지 잡으면 고칠 수 없는 검사가
     되고, 그러면 다음 사람이 검사를 지운다. 판정 함수 자신도 뺀다. */
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(fnOf('collectingNow'), '');
  const n = (code.match(/doc\.collecting\b/g) || []).length;
  assert.equal(n, 0, '★ collecting 을 직접 보는 코드가 ' + n + '곳 남았습니다 — collectingNow 로 모아 주세요');
  assert.match(fnOf('neverRead'), /collectingNow\(it\)/, 'neverRead 가 공용 판정을 안 씁니다');
  assert.match(fnOf('staleRead'), /collectingNow\(it\)/, '★ staleRead 가 공용 판정을 안 씁니다');
});

test('죽은 판정(needsRead)은 없어졌다 — 지키는 시늉만 하는 검사를 다시 만들지 않는다', () => {
  assert.ok(!/function needsRead\s*\(/.test(app),
    '★ 아무도 안 부르는 판정이 되살아났습니다 — 검사가 그것을 지키면 헛것을 지킵니다');
});

/* ── 다 넣었을 때 ── */

function collectCtx(over) {
  const calls = { setDocs: [], read: [], toast: [], alert: [], prompt: [], confirm: [] };
  const ctx = Object.assign({
    Date, Object, Array, String, Number,
    gridItems: [
      { id: 'a', meta: { doc: { group: 'g1', page: 1, collecting: true } } },
      { id: 'b', meta: { doc: { group: 'g1', page: 2, collecting: true } } },
      { id: 'c', meta: { doc: { group: 'g1', page: 3, collecting: true } } }
    ],
    collectDoc: { group: 'g1', year: '2026', n: 3, ids: ['a', 'b', 'c'] },
    COLLECT_MAX: 10,
    PuPhotoStore: {
      newId: function () { return 'gNEW'; },
      yearOf: function () { return '2026'; },
      photoYear: function () { return '2026'; },
      setDocs: function (year, ups) {
        calls.setDocs.push({ year: year, ups: ups });
        return { then: function (ok) { ok(); return { catch: function () {} }; } };
      }
    },
    queuePhotoRead: function (id) { calls.read.push(id); },
    renderCollectBar: function () {},
    renderGrid: function () {},
    viewingOther: function () { return false; },
    viewingOnlyOther: function () { return false; },
    closePhSheet: function () {},
    toast: function (m) { calls.toast.push(m); },
    alert: function (m) { calls.alert.push(m); },
    prompt: function () { return calls.prompt.shift(); },
    confirm: function () { return calls.confirm.shift(); },
    $: function () { return null; },
    _calls: calls
  });
  vm.createContext(ctx);
  /* ⚠ 2026-08-27: resumeCollectIfAny 가 collectingNow 를 쓴다 — 안 넣으면 멎는다 */
  vm.runInContext(fnOf('collectingNow') + '\n' +
    fnOf('applyCollected') + '\n' + fnOf('finishCollect') + '\n' +
    fnOf('cancelCollect') + '\n' + fnOf('resumeCollectIfAny'), ctx);
  return ctx;
}

test('★ 다 넣으면 쪽 번호를 매기고 한 번만 읽는다', () => {
  const c = collectCtx();
  c._calls.prompt.push('가야 신청서');
  c.finishCollect();
  const u = c._calls.setDocs[0];
  assert.equal(u.year, '2026', '올린 해에 써야 합니다 — 보고 있던 해가 아닙니다');
  assert.deepEqual(u.ups.map(function (x) { return x.id + ':' + x.doc.page; }), ['a:1', 'b:2', 'c:3'],
    '넣은 차례가 쪽 차례입니다');
  assert.equal(u.ups[0].doc.total, 3);
  assert.equal(u.ups[0].doc.taken, 3, 'taken 이 없으면 올릴 때 몇 장을 기다릴지 모릅니다');
  assert.equal(u.ups[0].doc.name, '가야 신청서');
  assert.ok(!u.ups[0].doc.collecting, '★ collecting 이 남으면 영영 안 읽힙니다');
  assert.deepEqual(c._calls.read, ['a'], '★ 문서 통째로 한 번만 읽어야 합니다');
});

test('★ 1장뿐이면 묶지 않는다 — 「1쪽짜리 문서」는 뜻이 없다', () => {
  const c = collectCtx();
  c.collectDoc = { group: 'g1', year: '2026', n: 1, ids: ['a'] };
  c.finishCollect();
  assert.equal(c._calls.prompt.length, 0, '이름을 물을 일이 아닙니다');
  assert.equal(c._calls.setDocs[0].ups[0].doc, null, '묶음을 풀어야 합니다');
  assert.deepEqual(c._calls.read, ['a'], '그래도 읽어야 합니다');
});

test('★ 이름을 안 적고 취소하면 모으기가 그대로 이어진다', () => {
  const c = collectCtx();
  c._calls.prompt.push('');           // 취소
  c.finishCollect();
  assert.equal(c._calls.setDocs.length, 0, '아무것도 쓰면 안 됩니다');
  assert.ok(c.collectDoc, '★ 모으기를 끝내 버리면 넣은 3장이 collecting 인 채로 남습니다');
});

test('★ 취소해도 사진은 안 지우고, 각각 읽는다', () => {
  const c = collectCtx();
  c._calls.confirm.push(true);
  c.cancelCollect();
  const u = c._calls.setDocs[0];
  assert.deepEqual(u.ups.map(function (x) { return x.doc; }), [null, null, null],
    '묶음만 풀어야 합니다');
  assert.deepEqual(c._calls.read, ['a', 'b', 'c'],
    '★ 안 읽으면 취소한 3장이 영영 안 읽힙니다');
  // 지우는 길이 아예 없어야 한다
  assert.ok(!/deletePhoto|deleteSelected/.test(fnOf('cancelCollect')),
    '★ 취소가 사진을 지우면 올린 것을 잃습니다');
});

test('취소를 되물어 「아니오」면 그대로 이어진다', () => {
  const c = collectCtx();
  c._calls.confirm.push(false);
  c.cancelCollect();
  assert.equal(c._calls.setDocs.length, 0);
  assert.ok(c.collectDoc);
});

test('★ 모으다 창을 닫았으면 다음에 물어본다', () => {
  const c = collectCtx();
  c.collectDoc = null;
  /* ⚠ 목록에 **뒤섞여** 들어온 상태로 둔다 — 실시간DB 는 번호순으로 돌려주므로
     넣은 차례와 다르게 온다. 쪽 번호로 다시 세우지 않으면 차례가 뒤집힌다. */
  c.gridItems = [c.gridItems[2], c.gridItems[0], c.gridItems[1]];
  c._calls.confirm.push(true);        // 이어서 넣기
  c.resumeCollectIfAny();
  assert.ok(c.collectDoc, '★ 안 이으면 아무도 안 읽어 주는 사진이 됩니다');
  assert.deepEqual(c.collectDoc.ids, ['a', 'b', 'c'],
    '★ 쪽 번호로 다시 세워야 합니다 — 목록 차례를 그대로 쓰면 쪽이 뒤집힙니다');
  assert.equal(c._calls.setDocs.length, 0, '이어서 넣기인데 묶음을 건드렸습니다');

  const c2 = collectCtx();
  c2.collectDoc = null;
  c2._calls.confirm.push(false);      // 따로 읽기
  c2.resumeCollectIfAny();
  assert.deepEqual(c2._calls.setDocs[0].ups.map(function (x) { return x.doc; }), [null, null, null]);
  assert.deepEqual(c2._calls.read, ['a', 'b', 'c']);
});

test('모으던 것이 없으면 아무것도 안 묻는다', () => {
  const c = collectCtx();
  c.collectDoc = null;
  c.gridItems = [{ id: 'z', meta: {} }];
  c.resumeCollectIfAny();
  assert.equal(c._calls.setDocs.length, 0);
  assert.equal(c.collectDoc, null);
});

test('★ 남의 사진 화면에서는 안 건드린다', () => {
  const c = collectCtx();
  c.collectDoc = null;
  c.viewingOther = function () { return true; };
  /* ⚠ confirm 에 「이어서 넣기」를 넣어 둔다. 안 넣으면 가드를 없애도
     묻고 → 아니오 → 묶음 풀기로 흘러 collectDoc 이 도로 null 이 되어
     「안 건드렸다」로 잘못 읽힌다(실제로 그렇게 안 잡혔다). */
  c._calls.confirm.push(true);
  c.resumeCollectIfAny();
  assert.equal(c.collectDoc, null, '남의 사진을 내 문서로 묶으면 안 됩니다');
  assert.equal(c._calls.setDocs.length, 0, '남의 사진 묶음을 고쳤습니다');
});

test('★ 화면을 열 때 실제로 모으다 만 문서를 챙긴다', () => {
  /* 함수만 있고 안 부르면 collecting 인 사진이 영영 묻힌다 —
     자동 판독이 건너뛰므로 아무도 안 읽어 준다. */
  const m = app.match(/function loadGrid\([\s\S]*?\n\}/);
  assert.ok(m, 'loadGrid 를 찾을 수 없습니다');
  assert.match(m[0], /resumeCollectIfAny\(\);/, '★ 안 부르면 모으다 만 사진이 묻힙니다');
  assert.ok(m[0].indexOf('resumeCollectIfAny()') < m[0].indexOf('autoReadPending()'),
    '자동 판독보다 먼저 챙겨야 합니다');
});

/* ── 올릴 때 붙이기 ── */

test('★ 모으는 중이면 올릴 때 그 문서에 붙인다', () => {
  const fn = fnOf('addFiles');
  assert.match(fn, /if \(collectDoc && isDoc && !meta\.doc\) \{/);
  assert.match(fn, /group: collectDoc\.group, collecting: true/);
  assert.match(fn, /collectDoc\.ids\.push\(id\);/);
  /* ⚠ PDF 에서 갈라진 쪽(이미 meta.doc 이 있다)을 덮으면 그 스캔의 쪽 차례가
     통째로 뒤엉킨다 — !meta.doc 조건이 그것을 막는다 */
  assert.ok(fn.indexOf('if (f.__pdfDoc) meta.doc = f.__pdfDoc;') < fn.indexOf('if (collectDoc && isDoc && !meta.doc)'),
    '★ PDF 쪽보다 먼저 붙으면 스캔 묶음을 덮어씁니다');
  // 사진(isDoc=false)에는 안 붙는다 — 회의 사진이 문서에 딸려 들어가면 안 된다
  assert.match(fn, /collectDoc && isDoc/);
});

test('★ 상한을 넘은 장은 조용히 자르지 않고 말해 준다', () => {
  const fn = fnOf('addFiles');
  assert.match(fn, /if \(collectDoc\.n < COLLECT_MAX\) \{/, '상한이 없으면 뒤쪽이 통째로 잘립니다');
  assert.match(fn, /overCollect\+\+;/);
  assert.match(fn, /이 문서에 안 들어갔습니다/, '★ 조용히 빠지면 그 장이 안 읽힌 채 남습니다');
  assert.match(fn, /사진은 모두 올라갔습니다/, '사진까지 잃은 줄 알면 안 됩니다');
  /* ⚠ 숫자를 못 박지 않는다. 2026-08-24 에 10 → 50 으로 올렸는데(판독을 덩이로
     나눠 읽게 되어 「AI 가 뒤쪽을 못 본다」는 까닭이 없어졌다) 이 줄이 숫자를
     박아 두어 멀쩡한 고침에서 울었다. 지킬 것은 「상한이 있다」이다. */
  const cm = app.match(/^const COLLECT_MAX = (\d+);$/m);
  assert.ok(cm, 'COLLECT_MAX 를 찾지 못했습니다');
  assert.ok(Number(cm[1]) > 0, '상한이 0 이면 한 장도 못 모읍니다');
});

/* ── 나중에 묶는 길도 곧바로 읽는다 (지금까지 빠져 있던 것) ── */

test('★ 「📎 한 문서로 묶기」도 묶으면 곧바로 다시 읽는다', () => {
  const fn = fnOf('mergeSelectedDoc');
  assert.match(fn, /queuePhotoRead\(items\[0\]\.id\);/,
    '★ 말만 하고 안 읽으면 장마다 따로 읽은 반쪽짜리 결과가 그대로 남습니다');
  // 쪽마다 나누기는 원래부터 곧바로 읽고 있었다 — 한쪽만 되어 있던 것을 맞춘 것이다
  assert.match(fnOf('splitDocPages'), /queuePhotoRead\(id\);/);
});

/* ── 화면 ── */

test('★ 모으는 중인 것이 눈에 띈다 — 켜 둔 줄 모르면 딴 서류가 딸려 들어간다', () => {
  assert.match(app, /id="collectBar"/);
  assert.match(app, /id="collectN"/);
  assert.match(app, /넣는 동안에는 안 읽습니다/);
  const fn = fnOf('renderCollectBar');
  assert.match(fn, /bar\.style\.display = collectDoc \? 'flex' : 'none';/);
  assert.match(fn, /\$\('collectN'\)\.textContent = collectDoc\.n \+ '장'/,
    '몇 장 넣었는지 안 보이면 다 넣었는지 알 수 없습니다');
  assert.match(fn, /b\.style\.display = collectDoc \? 'none' : '';/,
    '모으는 중에 시작 단추가 남으면 눌러도 아무 일이 없는 헛단추가 됩니다');
});

test('★ PC 와 폰 양쪽에 시작 단추가 있다', () => {
  assert.match(app, /id="collectBtn" onclick="startCollect\(\)"/, 'PC 단추가 없습니다');
  assert.match(app, /id="phCollectBtn" onclick="startCollect\(\)"/,
    '폰에도 두기로 했습니다(대표 선택) — 현장에서 서류를 나눠 찍는 경우가 많습니다');
  assert.match(app, /onclick="finishCollect\(\)"/);
  assert.match(app, /onclick="cancelCollect\(\)"/);
});

test('두 번 눌러도 모으던 것이 날아가지 않는다', () => {
  const c = collectCtx();
  vm.runInContext(fnOf('startCollect'), c);
  const before = c.collectDoc.group;
  c.startCollect();
  assert.equal(c.collectDoc.group, before,
    '★ 새로 시작해 버리면 넣어 둔 3장이 collecting 인 채로 버려집니다');
});
