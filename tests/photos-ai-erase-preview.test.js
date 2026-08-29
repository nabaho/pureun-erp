/* AI 지우개 — 지운 결과를 «저장 전에» 보여 준다
   (대표 승인 목업 2026-08-29 docs/mockups/ai-erase-preview.html, 「진행」)

   ■ 왜 만들었나
   예전에는 「✨ AI 로 지우기」를 누르면 **곧바로 원본을 덮어썼다.** 결과가 시원찮아도
   되돌릴 수 없으니, **실사진으로 시험해 보는 것 자체가 사진 한 장을 거는 일**이었다.
   남은 일이 「해 보고 시원찮으면 맞추기」인데 해 볼 수가 없는 셈이었다.

   ■ 대표 승인
     ㉮ 버리면 그냥 버린다(「한 번 더」는 안 만든다 — 다시 부르는 것이 곧 요금이다)
     ㉮ 저장 뒤 되돌리기는 안 만든다(저장 전에 보시므로 필요가 줄고, 원본을 한 벌 더
        두면 창고가 두 배가 된다)

   ■ 이 검사가 지키는 것 — 넷 다 «조용히» 어긋나는 것들이다
     ① 저장을 누르기 전에는 **사진이 한 글자도 안 바뀐다**
     ② 버리면 **원래 그림으로 돌아온다** (그은 네모는 남는다 — 까맣게로 요금 없이 끝내게)
     ③ 저장이 실패해도 **지운 그림을 잃지 않는다** (요금을 치른 결과다)
     ④ 창을 닫거나 다른 사진으로 가면 **들고 있던 결과를 비운다**
        — 안 비우면 **앞 사진의 지운 그림이 다음 사진에 얹혀 저장된다** */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 화면을 통째로 띄우지 않고 이 걸음만 떠서 «실제로» 돌린다 */
function load(over) {
  const el = {};
  const saved = [];
  const said = [];
  const ctx = {
    console: { warn: function () {} },
    viewerId: 'p1',
    photoMask: { status: 'ready', purpose: 'edit', url: 'ORIG',
      boxes: [{ x: .5, y: .1, w: .05, h: .05 }], style: 'black' },
    gridItems: [{ id: 'p1', full: 'ORIG', thumb: 'ORIG_T', meta: {} }],
    PuRrnMaskUi: { blank: function () { return { status: 'idle', boxes: [] }; } },
    PuPhotoStore: {
      replaceImage: function (y, id, full, thumb) { saved.push({ id: id, full: full, thumb: thumb }); return Promise.resolve(); },
      markEdited: function () { return Promise.resolve(); }
    },
    PuPhotoEdit: {
      buildCrop: function () { return { spec: { sx: 0, sy: 0, sw: 300, sh: 200 }, dataUrl: 'CUT' }; },
      callEdit: function () { return Promise.resolve('PATCH'); },
      pasteBack: function () { return 'ERASED'; }
    },
    firebase: { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('T'); } } }; } },
    window: {}, document: { querySelector: function () { return null; } },
    $: function (id) { return el[id] || (el[id] = { src: '', style: {}, innerHTML: '', classList: { toggle: function () {}, contains: function () { return false; } } }); },
    blockedIfOther: function () { return false; },
    photoYearOf: function () { return 2026; }, photoOwner: function () { return ''; },
    shrinkDataUrl: function (s) { return Promise.resolve(s + '_T'); },
    loadImg: function () { return Promise.resolve({ naturalWidth: 300, naturalHeight: 200 }); },
    toast: function (m) { said.push(m); }, alert: function (m) { said.push(m); },
    confirm: function () { return true; },
    maskItem: function () { return ctx.gridItems[0]; },
    renderReadPanel: function () {}, renderViewerEdit: function () {}, renderGrid: function () {},
    esc: function (s) { return String(s); },
    Object: Object, Date: Date, Promise: Promise, Error: Error, Math: Math
  };
  ctx.window.PuPhotoEdit = ctx.PuPhotoEdit;
  ctx.window.fetch = function () { return Promise.resolve({}); };
  ctx.globalThis = ctx;
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  vm.runInContext(
    cutFn(APP, 'async function photoEditAi(') + '\n' +
    cutFn(APP, 'async function photoAiKeep(') + '\n' +
    cutFn(APP, 'function photoAiDrop(') + '\n' +
    /* 「지금 결과를 보고 있는가」를 세 함수가 «한 곳»에서 묻는다 — 저마다 재면
       한 곳이 꼭 어긋난다. 그래서 그 한 곳도 함께 넣고 돌린다. */
    cutFn(APP, 'function aiOn(') + '\n' +
    cutFn(APP, 'function aiPeek(') + '\n' +
    cutFn(APP, 'function maskBoxesHtml(') + '\n' +
    cutFn(APP, 'function maskPanelHtml('), ctx);
  ctx._saved = saved; ctx._said = said; ctx._el = el;
  return ctx;
}

/* ── ① 저장 전에는 사진이 안 바뀐다 ── */

test('★★ 지운 뒤에도 «저장을 누르기 전»에는 사진이 그대로다', async () => {
  const c = load();
  await c.photoEditAi();
  assert.deepEqual(c._saved, [], '★★ 아직 안 고르셨는데 벌써 저장했습니다 — 되돌릴 수 없습니다');
  assert.equal(c.gridItems[0].full, 'ORIG', '★★ 격자의 사진이 벌써 바뀌었습니다');
  assert.ok(c.photoMask.ai && c.photoMask.ai.full === 'ERASED', '지운 그림을 안 들고 있습니다');
  assert.equal(c.photoMask.ai.before, 'ORIG', '★ 고치기 전 그림을 안 들고 있으면 되돌려 볼 수 없습니다');
  assert.equal(c.photoMask.url, 'ERASED', '큰 사진에 결과가 안 보입니다');
});

test('★★ 결과를 볼 때는 그은 네모를 안 그린다 — 지운 자리를 덮으면 볼 수가 없다', () => {
  const c = load();
  c.photoMask.ai = { id: 'p1', full: 'ERASED', before: 'ORIG' };
  assert.equal(c.maskBoxesHtml(c.photoMask), '',
    '★★ 지운 자리 위에 네모를 다시 그립니다 — 보시라고 만든 걸음인데 볼 수가 없습니다');
  /* 평소에는 그린다 */
  c.photoMask.ai = null;
  assert.match(c.maskBoxesHtml(c.photoMask), /maskbox/, '평소에 네모가 안 그려집니다');
});

test('★ 고를 것만 보여 준다 — 긋기 도구가 함께 있으면 무엇을 누를지 흐려진다', () => {
  const c = load();
  c.photoMask.ai = { id: 'p1', full: 'ERASED', before: 'ORIG' };
  const p = c.maskPanelHtml();
  ['이대로 저장', '버리기', '고치기 전 보기'].forEach(function (t) {
    assert.ok(p.indexOf(t) >= 0, '★ 「' + t + '」 단추가 없습니다');
  });
  assert.ok(p.indexOf('요금은 <b>이미 들었습니다</b>') >= 0,
    '★ 「버리면 아깝다」로 기울지 않게 요금이 이미 든 사실을 적어야 합니다');
  assert.ok(p.indexOf('모자이크') < 0, '★ 결 고르개까지 함께 뜹니다 — 지금 하실 일은 하나입니다');
});

test('★ 눌러서 «고치기 전»을 본다 — 무엇이 달라졌는지는 나란히 봐야 안다', () => {
  const c = load();
  c.photoMask.ai = { id: 'p1', full: 'ERASED', before: 'ORIG' };
  c.aiPeek(true);
  assert.equal(c._el.maskImg.src, 'ORIG');
  c.aiPeek(false);
  assert.equal(c._el.maskImg.src, 'ERASED', '★ 떼도 옛 그림이 남으면 무엇을 저장하는지 모릅니다');
  /* 끌다가 단추 밖에서 떼는 길도 있어야 한다 */
  const btn = APP.match(/onpointerdown="aiPeek\(true\)"[\s\S]{0,160}?>/)[0];
  assert.match(btn, /onpointerleave="aiPeek\(false\)"/,
    '★ 단추 밖에서 떼면 옛 그림이 그대로 남습니다');
});

/* ── ② 버리기 ── */

test('★★ 버리면 사진을 한 글자도 안 건드린다', async () => {
  const c = load();
  await c.photoEditAi();
  c.photoAiDrop();
  assert.deepEqual(c._saved, [], '★★ 버렸는데 저장했습니다');
  assert.equal(c.gridItems[0].full, 'ORIG');
  assert.equal(c.photoMask.url, 'ORIG', '★★ 큰 사진이 지운 그림인 채로 남았습니다');
  assert.equal(c.photoMask.ai, null, '들고 있던 결과를 안 비웠습니다');
});

test('★ 버려도 그은 네모는 남는다 — 「까맣게」로 요금 없이 끝내실 수 있게', async () => {
  const c = load();
  await c.photoEditAi();
  c.photoAiDrop();
  assert.equal((c.photoMask.boxes || []).length, 1,
    '★ 네모까지 지우면 처음부터 다시 그어야 합니다');
});

test('★★ 「한 번 더」를 안 만든다 — 다시 부르는 것이 곧 요금이다 (대표 승인 ㉮)', () => {
  const c = load();
  c.photoMask.ai = { id: 'p1', full: 'ERASED', before: 'ORIG' };
  const p = c.maskPanelHtml();
  assert.ok(p.indexOf('photoEditAi(') < 0,
    '★★ 결과 화면에 다시 부르는 단추가 있습니다 — 누를 때마다 요금이 또 듭니다');
});

test('★★ 결과를 보고 있는 동안에는 또 안 부른다', async () => {
  let calls = 0;
  const c = load();
  c.PuPhotoEdit.callEdit = function () { calls++; return Promise.resolve('PATCH'); };
  c.window.PuPhotoEdit = c.PuPhotoEdit;
  await c.photoEditAi();
  await c.photoEditAi();
  assert.equal(calls, 1, '★★ 두 번 불렀습니다 — 그대로 두 배가 나갑니다');
});

/* ── ③ 저장 ── */

test('★★ 저장을 누르면 그때 저장한다 — 미리보기도 «고친 사진»에서 다시 만든다', async () => {
  const c = load();
  await c.photoEditAi();
  await c.photoAiKeep();
  assert.equal(c._saved.length, 1);
  assert.equal(c._saved[0].full, 'ERASED');
  assert.equal(c._saved[0].thumb, 'ERASED_T',
    '★★ 옛 미리보기를 두면 격자에서는 고치기 전 그림이 계속 보입니다');
  assert.equal(c.gridItems[0].full, 'ERASED');
  assert.equal(c.gridItems[0].thumb, 'ERASED_T',
    '★★ 화면에 들고 있는 미리보기가 옛것이면 격자에서 고치기 전 그림이 계속 보입니다');
  assert.equal(c.gridItems[0].meta.edited.how, 'ai', '★ 「손댐」 자국이 안 남았습니다');
  /* 편집 상태를 통째로 새로 만들므로 들고 있던 결과도 함께 사라진다 */
  assert.ok(!c.photoMask.ai, '저장한 뒤에도 들고 있으면 다음 사진에 얹힙니다');
});

test('★★ 저장이 실패하면 «지운 그림을 잃지 않는다» — 요금을 치른 결과다', async () => {
  const c = load({ PuPhotoStore: {
    replaceImage: function () { return Promise.reject(new Error('네트워크')); },
    markEdited: function () { return Promise.resolve(); } } });
  await c.photoEditAi();
  await c.photoAiKeep();
  assert.ok(c.photoMask.ai && c.photoMask.ai.full === 'ERASED',
    '★★ 저장에 실패했다고 지운 그림을 버리면 요금을 다시 치러야 합니다');
  assert.ok(c._said.some(function (m) { return /저장하지 못했습니다/.test(m); }),
    '★★ 조용히 넘어가면 저장된 줄 아십니다');
  assert.ok(c._said.some(function (m) { return /그대로 있습니다/.test(m); }),
    '★ 「다시 누르면 된다」를 안 알리면 창을 닫아 잃으십니다');
});

/* ── ④ 나갈 때 비운다 ── */

test('★★ 나갈 때 «비우는 일을 따로 안 해도» 비워진다 — 편집 상태 안에 담았다', () => {
  /* ★ 여기가 이 걸음에서 가장 값진 자리다.
     처음에는 결과를 **따로 전역**(aiPreview)으로 두었다. 그러니 창을 닫을 때·편집을
     새로 열 때·그만둘 때·저장한 뒤 — **네 곳에서 저마다 비워** 줘야 했고,
     그 중 한 곳이 빠지면 **앞 사진의 지운 그림이 다음 사진에 얹혀 저장된다.**
     이 저장소가 「짝이 맞아야 하는 두 곳 중 한쪽만 고쳐졌다」로 여러 번 데인 그 모양이다.
     편집 상태(photoMask) 안에 담으니 비우는 일이 **아예 없어졌다.** */
  assert.ok(APP.indexOf('let aiPreview') < 0 && APP.indexOf('aiPreview = null') < 0,
    '★★ 결과를 따로 전역에 두었습니다 — 비우는 곳을 네 군데 지켜야 하고, 언젠가 하나가 빠집니다');
  /* 편집 상태를 새로 만드는 곳들이 그대로 이것까지 비운다 */
  ['function closeViewer(', 'function photoMaskCancel(', 'function startPhotoMask(']
    .forEach(function (name) {
      assert.match(cutFn(APP, name), /PuRrnMaskUi\.blank\(\)/,
        '★★ ' + name + ' 이 편집 상태를 새로 안 만듭니다 — 앞 사진의 지운 그림이 얹힙니다');
    });
  assert.match(cutFn(APP, 'async function photoAiKeep('), /photoMask = PuRrnMaskUi\.blank\(\)/,
    '★★ 저장한 뒤에 편집 상태를 안 비웁니다');
});

test('★★ 결과를 보는 동안에는 «가려서 저장»으로 새지 않는다', () => {
  /* photoMask.url 이 지운 그림이라, 이 길로 저장하면 아직 안 고르신 것이 저장된다 */
  const fn = cutFn(APP, 'async function photoEditSave(');
  assert.match(fn, /if \(photoMask\.ai\) return;/,
    '★★ 결과를 보는 중에 「가려서 저장」이 먹으면 안 고르신 그림이 저장됩니다');
});

test('★ 결과를 보는 동안에는 더 못 긋는다 — 그은 네모가 보낸 조각과 상관없어진다', () => {
  const fn = cutFn(APP, 'function renderViewerEdit(');
  assert.match(fn, /ms\.ai.*pointerEvents = 'none'/s,
    '★ 결과 위에 새로 그을 수 있으면 무엇이 반영된 것인지 알 수 없게 됩니다');
});
