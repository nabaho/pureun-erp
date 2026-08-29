'use strict';
/* ✨ AI 지우개 (대표 지시 2026-08-29 「지우개 모두 만들어라」)

   ■ 이 파일의 절반은 «요금»이다
   대표 지시가 「편집기능에 최소 비용이 들게」였다. 그림을 만드는 모델은 판독보다
   비싸고, 한 번 부르는 것이 곧 돈이다. 그래서 지키는 것:
     ① **자른 조각만** 보낸다. 사진 전체(2000×1500)를 보내면 같은 일에 몇 배가 든다.
     ② 크기 자물쇠는 **서버에 있다.** 브라우저가 잘못 만들어 통째로 보내도 막힌다 —
        자물쇠가 브라우저에만 있으면 그것은 자물쇠가 아니다.
     ③ **한 번에 한 군데.** 여러 군데면 조각이 커진다.
     ④ **다시 시도하지 않는다.** 조용히 두 번 부르면 사람이 모르는 새 두 배가 나간다.
     ⑤ 부르기 전에 **묻는다.**

   ■ 나머지 절반은 «증빙»이다
   사진첩은 정부사업·컨설팅 증빙 사진이 많다.
     · **물음은 서버가 정한다** — 부르는 쪽이 글을 못 보낸다. 「없던 것을 만들어 넣는」
       데 쓰이면 안 된다.
     · **자국을 남긴다**(meta.edited) — 눈에 안 보이는 고침이라 기록이 없으면
       「이 사진 손댔나」에 아무도 답할 수 없다.
     · 조각만 받아 **그 자리만** 덮는다 — 나머지 화소는 원본 그대로다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const PE = require(path.join(R, 'functions', 'photo-edit.js'));

/* 브라우저 계산 층을 노드에서 그대로 돌린다 */
function client() {
  const ctx = { window: {}, Math, Number, String, JSON, Promise, Error, RegExp };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-photo-edit.js'), 'utf8'), ctx);
  return ctx.window.PuPhotoEdit || ctx.PuPhotoEdit;
}
const C = client();

/* ══════ ① 자르기 — 요금이 여기서 갈린다 ══════ */

test('★★ 사진 전체가 아니라 «지울 자리 둘레»만 자른다 — 이것이 요금의 전부다', () => {
  const s = C.cropSpec({ x: 0.5, y: 0.5, w: 0.05, h: 0.04 }, 2000, 1500);
  assert.ok(s.sw < 2000 * 0.5, '★ 조각이 사진의 절반을 넘으면 통째로 보내는 것과 다를 바 없습니다');
  assert.ok(s.sw > 0.05 * 2000, '메울 배경을 모델이 봐야 하므로 네모보다는 넓어야 합니다');
});

test('★★ 긴 변을 줄여 보낸다 — 큰 조각은 그대로 요금이다', () => {
  const s = C.cropSpec({ x: 0, y: 0, w: 1, h: 1 }, 4000, 3000);
  /* 검사고정-허용: **1024px** 은 값이 아니라 규칙이다 — 이보다 크게 보내면 한 번 부르는
     값이 몇 배가 된다(대표 지시 「최소 비용」). 상수(MAX_EDGE)로 견주면 그 상수를
     키우는 순간 검사도 함께 커져 **아무것도 안 지킨다.** 숫자로 못박는다. */
  assert.ok(Math.max(s.outW, s.outH) <= 1024,
    '★ 줄이지 않으면 4000px 짜리가 그대로 나갑니다 (지금 ' + s.outW + '×' + s.outH + ')');
  assert.ok(C.MAX_EDGE <= 1024, '★ 보낼 크기 한도가 1024px 를 넘었습니다 — 요금이 몇 배가 됩니다');
});

test('★ 작은 조각을 «키우지는» 않는다 — 없던 그림이 생기지 않고 보낼 양만 는다', () => {
  const s = C.cropSpec({ x: 0.4, y: 0.4, w: 0.02, h: 0.02 }, 400, 300);
  assert.equal(s.scale, 1);
  assert.ok(s.outW <= s.sw);
});

test('★★ 사진 밖으로 안 넘친다 — 넘긴 채로 그리면 «검은 빈 자리»를 배경으로 여긴다', () => {
  const s = C.cropSpec({ x: 0, y: 0, w: 0.1, h: 0.1 }, 1000, 800);
  assert.equal(s.sx, 0); assert.equal(s.sy, 0);
  const e = C.cropSpec({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, 1000, 800);
  assert.ok(e.sx + e.sw <= 1000);
  assert.ok(e.sy + e.sh <= 800);
});

test('★ 점만 찍은 것은 자를 것이 없다', () => {
  assert.equal(C.cropSpec({ x: .5, y: .5, w: 0, h: 0 }, 1000, 800), null);
});

/* ══════ ② 지울 자리를 «색으로» 표시한다 ══════ */

function fakeImg(w, h) { return { naturalWidth: w, naturalHeight: h }; }
function canvasSpy(log) {
  return function (w, h) {
    const ctx = {
      fillStyle: '',
      fillRect: function (x, y, ww, hh) { log.push(['fill', ctx.fillStyle, x, y, ww, hh]); },
      drawImage: function () { log.push(['draw'].concat(Array.prototype.slice.call(arguments, 1))); }
    };
    return { width: w, height: h, getContext: function () { return ctx; },
      toDataURL: function () { return 'data:image/jpeg;base64,CUT'; } };
  };
}

test('★★ 지울 자리를 «마젠타»로 덮어 보낸다 — 좌표를 글로 알려 주면 모델이 빗나간다', () => {
  const log = [];
  const out = C.buildCrop(fakeImg(2000, 1500), { x: .5, y: .5, w: .05, h: .04 },
    { makeCanvas: canvasSpy(log) });
  const fill = log.find(function (x) { return x[0] === 'fill'; });
  assert.ok(fill, '★ 표시를 안 하면 모델이 어디를 지울지 모릅니다');
  assert.equal(fill[1], C.MARK);
  assert.equal(out.dataUrl.indexOf('data:image/jpeg'), 0);
});

test('★★ 브라우저와 서버가 «같은 색»을 쓴다 — 다르면 아무것도 안 지워진다', () => {
  assert.equal(C.MARK, PE.MARK_COLOR);
  assert.ok(PE.PROMPT.indexOf(PE.MARK_COLOR) >= 0, '물음에 그 색이 안 적혀 있습니다');
});

test('★ 표시는 «줄인 뒤»에 칠한다 — 줄이기 전에 칠하면 가장자리가 흐려져 안 잡힌다', () => {
  const log = [];
  C.buildCrop(fakeImg(2000, 1500), { x: .5, y: .5, w: .05, h: .04 }, { makeCanvas: canvasSpy(log) });
  const di = log.findIndex(function (x) { return x[0] === 'draw'; });
  const fi = log.findIndex(function (x) { return x[0] === 'fill'; });
  assert.ok(di >= 0 && fi > di, '★ 칠하기가 그리기보다 먼저면 줄이면서 뭉개집니다');
});

/* ══════ ③ 제자리에 붙인다 — 나머지는 원본 그대로 ══════ */

test('★★ 사진 전체를 다시 받지 않고 «그 자리만» 덮는다 — 나머지 화소가 바뀌면 손댄 사진이다', () => {
  const log = [];
  C.pasteBack(fakeImg(2000, 1500), { sx: 100, sy: 80, sw: 300, sh: 200, outW: 300, outH: 200 },
    fakeImg(300, 200), { makeCanvas: canvasSpy(log) });
  const draws = log.filter(function (x) { return x[0] === 'draw'; });
  assert.equal(draws.length, 2, '원본 한 번 + 조각 한 번이어야 합니다');
  const patch = draws[1];
  /* 마지막 네 값이 «놓을 자리»다 — 자른 그 자리여야 한다 */
  assert.deepEqual(patch.slice(5), [100, 80, 300, 200],
    '★ 엉뚱한 자리에 붙이면 사진이 어긋납니다');
});

/* ══════ ④ 서버 자물쇠 — 브라우저를 믿지 않는다 ══════ */

test('★★ 조각이 크면 «부르기 전에» 막는다 — 자물쇠가 브라우저에만 있으면 자물쇠가 아니다', () => {
  const big = 'A'.repeat(Math.ceil(PE.MAX_IMAGE_BYTES * 4 / 3) + 1000);
  const v = PE.validate({ image: { data: big, mimeType: 'image/jpeg' } });
  assert.equal(v.ok, false, '★ 통째로 보내도 통과하면 요금 자물쇠가 없는 것입니다');
  assert.match(v.error, /너무 큽니다/);
});

test('★ 알맞은 조각은 통과한다', () => {
  const v = PE.validate({ image: { data: 'A'.repeat(1000), mimeType: 'image/jpeg' } });
  assert.equal(v.ok, true);
});

test('★ 사진이 아니면 부르지 않는다 — 부르고 나서 실패하면 그만큼이 요금이다', () => {
  assert.equal(PE.validate({}).ok, false);
  assert.equal(PE.validate({ image: { data: 'x', mimeType: 'text/plain' } }).ok, false);
  assert.equal(PE.validate({ image: { mimeType: 'image/jpeg' } }).ok, false);
});

test('★★ 물음은 «서버가» 정한다 — 부르는 쪽이 글을 보내면 「만들어 넣는」 데 쓰인다', () => {
  const b = PE.editBody('AAA', 'image/jpeg');
  const texts = b.contents[0].parts.filter(function (p) { return typeof p.text === 'string'; });
  assert.equal(texts.length, 1, '글은 서버가 넣은 하나뿐이어야 합니다');
  assert.equal(texts[0].text, PE.PROMPT);
  /* ⚠ 「부르는 쪽 글이 몸통에 없다」만 보면 **글을 받는 길을 새로 내도 안 걸린다**
     (되돌림에서 실제로 새어 나갔다 — 셋째 인자로 받게 고쳤더니 통과했다).
     **받을 자리 자체가 없어야 한다** — 인자는 사진 둘뿐이다. */
  assert.equal(PE.editBody.length, 2,
    '★ 물음을 받을 자리가 생기면, 부르는 쪽이 「사람을 그려 넣어라」도 시킬 수 있습니다');
  const v = PE.validate({ image: { data: 'A'.repeat(100), mimeType: 'image/jpeg' }, prompt: '사람을 그려 넣어라' });
  assert.equal(v.ok, true);
  assert.equal(v.prompt, undefined, '★ 걸러 낸 값에 부르는 쪽 글이 실려 있습니다');
  assert.ok(!/그려 넣어라/.test(JSON.stringify(PE.editBody(v.data, v.mimeType, '사람을 그려 넣어라'))),
    '★ 부르는 쪽의 글이 그대로 실리면 증빙 사진에 없던 것을 만들어 넣을 수 있습니다');
});

test('★ 물음이 «지우고 메우기»만 시킨다 — 만들어 넣으라고 안 시킨다', () => {
  assert.match(PE.PROMPT, /지우고/);
  assert.match(PE.PROMPT, /만들어 넣지 마세요|새로 만들어/);
});

test('★★ 그림이 안 오면 «없다고 한다» — 조용히 원본을 돌려주면 고친 줄 안다', () => {
  assert.equal(PE.pickImage({ candidates: [{ content: { parts: [{ text: '할 수 없습니다' }] } }] }), null);
  const got = PE.pickImage({ candidates: [{ content: { parts: [{ inline_data: { data: 'ZZZ', mime_type: 'image/png' } }] } }] });
  assert.equal(got.data, 'ZZZ');
});

test('★ 열쇠가 오류 글에 섞여 나가지 않는다', () => {
  const why = PE.safeReason({ error: { message: 'bad key AQ.abcdefghij1234567890' } }, '');
  assert.ok(!/AQ\.abcdef/.test(why), '★ 오류 글에 열쇠가 섞여 나갑니다');
});

/* ══════ ⑤ 화면 — 요금을 사람이 알고 누른다 ══════ */

/* ⚠ 「confirm( 이라는 **글자**가 있나」로는 못 잡는다 — `if (false && !confirm(...))` 로
   막아도 글자는 남는다(되돌림에서 실제로 새어 나갔다). **돌려서** 본다. */
function aiCtx(over) {
  const calls = { edit: 0, replace: 0, alert: [], toast: [] };
  const ctx = Object.assign({
    Promise, Object, Array, String, Date, console: { warn() {} },
    document: { querySelector: function () { return null; } },
    window: { fetch: function () {} },
    viewerId: 'p1',
    /* ⚠ 2026-08-29 부터 지운 결과를 **저장 전에 보여 준다**(대표 승인 목업
       ai-erase-preview.html). 그래서 photoEditAi 는 «보여 주는» 데까지고,
       저장은 photoAiKeep 이 맡는다 — 둘 다 넣고 돌린다.
       저장 전에 아무것도 안 바뀌는지는 tests/photos-ai-erase-preview.test.js 가 본다. */
    aiPreview: null,
    renderViewerEdit: function () {},
    photoMask: { status: 'ready', purpose: 'edit', url: 'ORIG', boxes: [{ x: .4, y: .4, w: .1, h: .1 }] },
    gridItems: [{ id: 'p1', meta: {} }],
    blockedIfOther: function () { return false; },
    confirm: function () { return true; },
    alert: function (m) { calls.alert.push(m); },
    toast: function (m) { calls.toast.push(m); },
    photoYearOf: function () { return '2026'; },
    photoOwner: function () { return 'OWNER'; },
    shrinkDataUrl: function () { return Promise.resolve('THUMB'); },
    loadImg: function () { return Promise.resolve({ naturalWidth: 300, naturalHeight: 200 }); },
    renderReadPanel: function () {}, renderGrid: function () {}, maskItem: function () { return null; },
    $: function (id) { return id === 'maskImg' ? { naturalWidth: 2000, naturalHeight: 1500 } : null; },
    firebase: { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('T'); } } }; } },
    PuRrnMaskUi: { blank: function () { return { status: 'idle', boxes: [] }; } },
    PuPhotoStore: {
      replaceImage: function () { calls.replace++; return Promise.resolve(); },
      markEdited: function () { return Promise.resolve(); }
    },
    _calls: calls
  }, over || {});
  ctx.PuPhotoEdit = Object.assign({
    buildCrop: function () { return { spec: { sx: 0, sy: 0, sw: 300, sh: 200, outW: 300, outH: 200 }, dataUrl: 'data:image/jpeg;base64,CUT' }; },
    callEdit: function () { calls.edit++; return Promise.resolve('data:image/png;base64,OUT'); },
    pasteBack: function () { return 'FULL'; }
  }, (over && over._edit) || {});
  ctx.window.PuPhotoEdit = ctx.PuPhotoEdit;
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function aiOn(') + '\n' +
    cutFn(app, 'async function photoEditAi(') + '\n' +
    cutFn(app, 'async function photoAiKeep('), ctx);
  /* 「지우고 저장까지」 한 번에 — 예전 photoEditAi 가 하던 일 전부다 */
  ctx.eraseAndKeep = async function () {
    await ctx.photoEditAi();
    if (ctx.photoMask && ctx.photoMask.ai) await ctx.photoAiKeep();
  };
  return ctx;
}

test('★★ 「아니오」를 누르면 «부르지도 않는다» — 부르는 순간이 곧 요금이다', async () => {
  const c = aiCtx({ confirm: function () { return false; } });
  await c.photoEditAi();
  assert.equal(c._calls.edit, 0, '★ 안 묻고 부르면 잘못 눌러도 그대로 요금입니다');
  assert.equal(c._calls.replace, 0);
});

test('★★ 못 받으면 «사진을 안 바꾼다» — 조용히 넘어가면 지운 줄 안다', async () => {
  const c = aiCtx({ _edit: { callEdit: function () { return Promise.reject(new Error('한도 초과')); } } });
  await c.photoEditAi();
  assert.equal(c._calls.replace, 0, '★ 못 받았는데 저장하면 원본만 잃습니다');
  assert.match(c._calls.alert.join(' '), /원본은 그대로입니다/);
});

test('★★ AI 가 준 사진을 «못 읽으면» 저장하지 않는다 — 깨진 그림으로 원본을 덮으면 끝이다', async () => {
  const c = aiCtx({ loadImg: function () { return Promise.reject(new Error('사진을 읽지 못했습니다')); } });
  await c.photoEditAi();
  assert.equal(c._calls.replace, 0,
    '★ 못 읽은 것을 그대로 붙여 저장하면 되돌릴 수 없습니다');
  assert.match(c._calls.alert.join(' '), /원본은 그대로입니다/);
});

test('★ 받아서 «저장까지» 하면 원본과 미리보기를 함께 바꾼다 — 실제로 돌려 본다', async () => {
  const c = aiCtx();
  await c.eraseAndKeep();
  assert.equal(c._calls.edit, 1, '한 번만 불러야 합니다');
  assert.equal(c._calls.replace, 1);
  assert.match(c._calls.toast.join(' '), /자국/, '손댐 자국이 남는다고 말해 줘야 합니다');
});

test('★ 두 군데를 그어 두면 부르지 않는다 — 조각이 커져 요금이 오른다', async () => {
  const c = aiCtx({ photoMask: { status: 'ready', purpose: 'edit',
    boxes: [{ x: .1, y: .1, w: .1, h: .1 }, { x: .7, y: .7, w: .1, h: .1 }] } });
  await c.photoEditAi();
  assert.equal(c._calls.edit, 0);
  assert.match(c._calls.alert.join(' '), /한 군데/);
});

test('★ 요금이 든다고 «말하고» 묻는다', () => {
  const fn = cutFn(app, 'async function photoEditAi(');
  assert.match(fn, /요금이 듭니다/);
  /* ⚠ 2026-08-29 부터 「되돌릴 수 없습니다」가 아니다 — 결과를 **먼저 보여 주고**
     대표님이 저장할지 고르신다(승인 목업 ai-erase-preview.html).
     묻는 말과 실제로 하는 일이 어긋나면 그 말을 아무도 안 믿게 된다. */
  assert.match(fn, /먼저 보여 드립니다/,
    '★ 묻는 말이 실제와 어긋납니다 — 이제 곧바로 덮어쓰지 않습니다');
  assert.ok(fn.indexOf('되돌릴 수 없습니다') < 0,
    '★ 없어진 일(곧바로 덮어쓰기)을 아직 경고하고 있습니다');
});

test('★★ 한 번에 «한 군데»만 — 여러 군데면 조각이 커져 요금이 오른다', () => {
  const fn = cutFn(app, 'async function photoEditAi(');
  assert.match(fn, /boxes\.length !== 1/, '★ 여러 군데를 한 번에 보내면 조각이 커집니다');
});

test('★★ 다시 시도하지 «않는다» — 조용히 두 번 부르면 두 배가 나간다', () => {
  /* ⚠ **주석을 걷어내고 본다.** 왜 안 되풀이하는지 적어 둔 설명까지 걸리면
     다음 사람이 그 설명을 지우게 된다 — 검사가 기록을 지우라고 시키는 꼴이다. */
  const cli = fs.readFileSync(path.join(R, 'js', 'pu-photo-edit.js'), 'utf8');
  const c = cutFn(cli, 'function callEdit(').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/for \(|while \(|retry/.test(c),
    '★ 브라우저가 되풀이해 부르면 사람이 모르는 새 요금이 곱절이 됩니다');
  /* 부르는 자리는 한 곳이어야 한다 */
  assert.equal((c.match(/fetchFn\(/g) || []).length, 1,
    '★ 부르는 자리가 둘이면 한 번 눌러 두 번 나갑니다');
});

test('★ 받는 것이 저장보다 «먼저»다 — 짜임으로도 못박아 둔다', () => {
  /* ⚠ 2026-08-29 부터 저장은 다른 함수(photoAiKeep)로 갈라졌다. 그래서 «순서»는
     함수 안이 아니라 **두 걸음 사이**에 있다 — 받는 쪽에는 저장이 아예 없어야 한다. */
  const fn = cutFn(app, 'async function photoEditAi(');
  assert.ok(fn.indexOf('PuPhotoEdit.callEdit') > 0, '받는 자리가 없어졌습니다');
  assert.ok(fn.indexOf('PuPhotoStore.replaceImage') < 0,
    '★ 받는 걸음에서 저장까지 합니다 — 대표님이 보고 고르실 틈이 없습니다');
  const keep = cutFn(app, 'async function photoAiKeep(');
  assert.match(keep, /PuPhotoStore\.replaceImage/, '저장하는 걸음이 없습니다');
});

test('★★ 「손댐」 자국을 남긴다 — 눈에 안 보이는 고침이라 기록이 없으면 답할 수 없다', () => {
  assert.match(cutFn(app, 'async function photoAiKeep('), /markEdited\(photoYearOf\(id\), id, 'ai', photoOwner\(id\)\)/,
    '★ 증빙 사진에 자국 없이 손대면 나중에 「이 사진 손댔나」에 아무도 답 못 합니다');
  const m = cutFn(store, 'function markEdited(');
  assert.match(m, /metaPath\(year, id, owner\) \+ '\/edited'/, '주인 자리에 적어야 남습니다');
});

test('★ 자국이 실패해도 «고친 것을 되돌리지 않는다» — 자국이 없을 뿐이다', () => {
  const fn = cutFn(app, 'async function photoAiKeep(');
  assert.match(fn, /markEdited\([\s\S]{0,120}\.catch\(/,
    '★ 여기서 터지면 다 된 고치기가 실패로 보입니다');
});

test('★★ 가리기(요금 0원)가 «먼저» 보이고, AI 는 요금이 든다고 적혀 있다', () => {
  const fn = cutFn(app, 'function maskPanelHtml(');
  assert.match(fn, /AI 로 지우기 \(요금 듦\)/, '★ 요금이 드는 단추에 그 말이 없으면 헛돈이 나갑니다');
  assert.ok(fn.indexOf('photoEditSave()') < fn.indexOf('photoEditAi()'),
    '★ 요금 없는 길이 먼저 보여야 합니다');
  assert.match(fn, /요금 없이/, '가려도 되는 일이라는 안내가 없습니다');
});

test('★ 남의 사진은 AI 로도 못 고친다', () => {
  assert.match(cutFn(app, 'async function photoEditAi('), /blockedIfOther\(id\)/);
});
