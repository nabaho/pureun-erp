'use strict';
/* 📂 작성 중 보관함은 «원본»도 담는다 (대표 제보 2026-09-06)
   ─────────────────────────────────────────────────────────────
   대표 화면에 이렇게 적혀 있었다:

       기관명 : 푸른노무법인 푸른노무법인 푸른노무법인 부서명 : 직위 : 대표

   ■ 까닭 (코드를 따라가 확인)
     채우기·되돌려 넣기는 «언제나 원본에서 새로 짓는다» — 두 번 눌러도 값이
     겹치지 않게 하려고 그렇게 만들었다(rhFillByMap·rhComposeBytes 의 _rhBase||_rhDoc).
     그런데 작성 중 보관함이 담는 것은 _rhDoc(= 이미 채워진 문서)뿐이었다.
     새로고침 뒤 「↩ 이어서 하기」로 열면 원본이 없어(_rhBase=null) 바탕이
     «채워진 문서»로 떨어지고, 겹치기를 막던 그 장치가 조용히 풀렸다.
     한 번 누르면 하나, 두 번이면 둘, 세 번이면 셋이 적힌다.

   여기서 못 박는 것은 «값»이 아니라 «규칙»이다:
     ① 담을 때 원본도 함께 담는다
     ② 원본은 바뀌지 않으므로 «한 번만» 담는다(30초마다 수 MB 를 다시 쓰지 않는다)
     ③ 이어서 열면 원본을 되살린다 — 그러면 바탕이 다시 «원본»이 된다
     ④ mountEditor 가 그 원본을 덮지 못하게 막는다
     ⑤ 원본이 없는 «옛 자리»는 조용히 넘기지 않고 겹칠 수 있다고 말한다
     ⑥ 사본도 원본을 데려간다

   ⚠ 글자만 찾는 검사로는 이 규칙을 못 지킨다 — 실제로 담고·열어 보고
     «바탕이 무엇이 되었나»를 확인한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripComments } = require('./strip-comments');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'kcareer.html'), 'utf8');
const CODE = stripComments(SRC);

function cutFn(src, decl) {
  const head = src.indexOf(decl);
  assert.notEqual(head, -1, decl + ' 을 찾지 못했습니다 — 이름이 바뀌었나요?');
  let i = src.indexOf('{', head + decl.length), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(head, i + 1);
}

const 원본바이트 = new Uint8Array([80, 75, 3, 4, 1, 1, 1, 1]);   /* 처음 올린 서식 */
const 채운바이트 = new Uint8Array([80, 75, 3, 4, 9, 9, 9, 9, 9]); /* 값이 들어간 문서 */
const b64 = (u8) => Buffer.from(u8).toString('base64');

/* 담고·열어 보는 세상 — 파일 저장소를 손에 들고 «무엇이 담겼나»를 본다 */
function 세상(store) {
  const 담긴것 = {}, 담은순서 = [], 알림 = [];
  const ctx = {
    console, JSON, String, Number, Array, Object, Error, Date, Math, RegExp, Boolean,
    Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Promise,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); },
    document: { getElementById: () => null, querySelector: () => null },
    toast: (m) => { 알림.push(String(m)); },
    escapeHtml: (x) => String(x == null ? '' : x),
    _jsAttr: (x) => String(x == null ? '' : x),
    get: (k) => (store[k] || []).slice(),
    set: (k, a) => { store[k] = a.slice(); },
    saveFileUnified: (id, f) => { 담긴것[id] = f; 담은순서.push(id); return id; },
    getFileAsync: async (id) => 담긴것[id] || null,
    deleteFile: (id) => { delete 담긴것[id]; },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    /* 화면·알림은 화면 일이다 — 여기서는 부르기만 하고 넘긴다 */
    rhDraftCheck: () => {}, rhDraftDraw: () => {}, rhDraftPanelClose: () => {},
    rhDraftNow: async () => {},
    /* mountEditor 가 도는 «동안» 바탕이 지켜지는지 보려고 그 순간을 적어 둔다 */
    mountEditor: async function () { ctx._올릴때KeepBase = ctx._rhKeepBase; },
    _rhVals: {}, _rhPicks: {}, _rhListPlan: null, _rhMap: null, _rhDoc: null,
    _rhSideId: (id) => id + '@side',
    _store: store, _담긴것: 담긴것, _담은순서: 담은순서, _알림: 알림
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('var RH_DRAFTS="rh_drafts"; var RH_DRAFT_MAX=10;'
    + ' var _rhDraftId=null; var _rhDraftSeq=0;'
    + ' var _rhBase=null; var _rhBaseSaved=""; var _rhKeepBase=false;', ctx);
  vm.runInContext('var abToB64=' + String(function (buf) {
    let bin = '', b = new Uint8Array(buf), ch = 0x8000;
    for (let i = 0; i < b.length; i += ch) bin += String.fromCharCode.apply(null, b.subarray(i, i + ch));
    return btoa(bin);
  }) + ';', ctx);
  vm.runInContext('var b64ToAb=' + String(function (s) {
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }) + ';', ctx);
  ['function rhDraftAll(', 'function rhDraftPut(', 'function rhDraftFind(',
   'function rhDraftNewId(', 'function rhDraftCells(', 'function _rhBaseId(',
   'function rhBaseSave(', 'async function rhBaseLoad(', 'function rhSideSave(',
   'async function rhSideLoad(', 'function rhDraftSave(', 'async function rhDraftResume(',
   'async function rhDraftCopy(']
    .forEach((d) => vm.runInContext(cutFn(CODE, d), ctx));
  return ctx;
}

/* 「양식을 올려 값을 채운 뒤」의 상태를 만든다 */
function 채운상태(ctx) {
  vm.runInContext('_rhBase={name:"양식.hwpx",ext:"hwpx",bytes:new Uint8Array([80,75,3,4,1,1,1,1])};'
    + '_rhDoc={name:"양식_채움.hwpx",ext:"hwpx",bytes:new Uint8Array([80,75,3,4,9,9,9,9,9])};'
    + '_rhVals={t0r0c1:"권형하"}; _rhPicks={t0r0c1:"name"};', ctx);
}

/* ══════ ① 담을 때 원본도 함께 ══════ */
test('★★ 담으면 «원본»도 함께 담긴다 — 이것이 없으면 이어서 열 때 값이 겹친다', () => {
  const ctx = 세상({});
  채운상태(ctx);
  vm.runInContext('rhDraftSave()', ctx);
  const id = vm.runInContext('_rhDraftId', ctx);
  assert.ok(id, '자리 번호가 안 잡혔습니다');

  const 문서 = ctx._담긴것[id];
  assert.ok(문서, '문서가 안 담겼습니다');
  assert.equal(문서.base64, b64(채운바이트), '담긴 문서가 «채운 것»이 아닙니다');

  const 원본 = ctx._담긴것[id + '@base'];
  assert.ok(원본, '★ 원본이 안 담겼습니다 — 이어서 열면 채우기가 겹쳐 적힙니다');
  assert.equal(원본.base64, b64(원본바이트),
    '★ 담긴 것이 «원본»이 아닙니다 — 채워진 문서를 담으면 고친 것이 없습니다');
  assert.notEqual(원본.base64, 문서.base64, '원본과 채운 문서가 같습니다');
});

test('★ 색인이 «원본이 있다»고 적는다 — 없는데 있다고 하면 목록이 거짓말을 한다', () => {
  const ctx = 세상({});
  채운상태(ctx);
  vm.runInContext('rhDraftSave()', ctx);
  assert.equal(ctx._store.rh_drafts[0].hasBase, true, '원본이 있는데 없다고 적혔습니다');

  /* 원본이 없는 경우(옛 자리·예비 길) — 있다고 적으면 안 된다 */
  const ctx2 = 세상({});
  vm.runInContext('_rhDoc={name:"가.hwpx",ext:"hwpx",bytes:new Uint8Array([1,2,3])}; rhDraftSave()', ctx2);
  assert.ok(!ctx2._store.rh_drafts[0].hasBase, '원본이 없는데 있다고 적혔습니다');
  assert.ok(!ctx2._담긴것[vm.runInContext('_rhDraftId', ctx2) + '@base'],
    '원본이 없는데 무언가를 원본이라고 담았습니다');
});

/* ══════ ② 원본은 «한 번만» 담는다 ══════ */
test('★★ 원본은 «한 번만» 담는다 — 30초마다 수 MB 를 다시 쓰면 안 된다', () => {
  const ctx = 세상({});
  채운상태(ctx);
  vm.runInContext('rhDraftSave(); rhDraftSave(); rhDraftSave();', ctx);
  const id = vm.runInContext('_rhDraftId', ctx);
  const 원본쓴횟수 = ctx._담은순서.filter((x) => x === id + '@base').length;
  assert.equal(원본쓴횟수, 1, '원본을 ' + 원본쓴횟수 + '번 담았습니다 — 원본은 바뀌지 않습니다');
  /* ⚠ 그래도 «문서»는 매번 담겨야 한다 — 그것이 자동저장이다 */
  assert.equal(ctx._담은순서.filter((x) => x === id).length, 3, '문서 자동저장이 멈췄습니다');
});

test('★ 새 서식을 올리면 그 원본을 «다시» 담는다 — 표시가 남으면 새 원본을 안 담는다', () => {
  const ctx = 세상({});
  채운상태(ctx);
  vm.runInContext('rhDraftSave()', ctx);
  /* 새 양식을 올린 것과 같은 상태: 자리도 원본도 바뀐다(_rhBaseSaved 를 놓는다) */
  vm.runInContext('_rhDraftId=null; _rhBaseSaved="";'
    + '_rhBase={name:"다른양식.hwpx",ext:"hwpx",bytes:new Uint8Array([80,75,3,4,7,7])};'
    + '_rhDoc={name:"다른양식.hwpx",ext:"hwpx",bytes:new Uint8Array([80,75,3,4,7,7])};'
    + 'rhDraftSave();', ctx);
  const 새id = vm.runInContext('_rhDraftId', ctx);
  assert.ok(ctx._담긴것[새id + '@base'], '새 자리의 원본이 안 담겼습니다');
  assert.equal(ctx._담긴것[새id + '@base'].base64, b64(new Uint8Array([80, 75, 3, 4, 7, 7])),
    '옛 원본이 그대로 담겼습니다');
  /* 앱에서도 «새 서식이 오면 표시를 놓는»지 확인한다 */
  assert.match(CODE, /if\(!_rhKeepBase\)\{[\s\S]{0,200}_rhBaseSaved=''/,
    '★ 새 서식이 올라올 때 담아 둔 표시를 놓지 않습니다 — 새 원본을 담지 못합니다');
});

/* ══════ ③ 이어서 열면 바탕이 다시 «원본» ══════ */
test('★★★ 이어서 열면 바탕이 다시 «원본»이 된다 — 이것이 겹쳐 적힘을 막는 자리다', async () => {
  /* 새로고침한 뒤와 같은 세상: _rhBase 가 비어 있다 */
  const id = 'rh_draft_x';
  const ctx = 세상({ rh_drafts: [{ id: id, name: '양식_채움.hwpx', ext: 'hwpx', at: 1,
                                   done: false, hasBase: true }] });
  ctx._담긴것[id] = { id: id, name: '양식_채움.hwpx', ext: 'hwpx', base64: b64(채운바이트) };
  ctx._담긴것[id + '@base'] = { id: id + '@base', name: '양식.hwpx', ext: 'hwpx', base64: b64(원본바이트) };
  ctx._담긴것[id + '@side'] = { id: id + '@side', name: 'side.json', ext: 'json',
    base64: Buffer.from(JSON.stringify({ vals: { t0r0c1: '권형하' }, picks: {}, listPlan: null }),
      'utf8').toString('base64') };

  await vm.runInContext('rhDraftResume("' + id + '")', ctx);

  assert.ok(ctx._rhBase, '★ 원본을 되살리지 않았습니다 — 채우기가 겹쳐 적힙니다');
  assert.equal(Buffer.from(ctx._rhBase.bytes).toString('base64'), b64(원본바이트),
    '★ 되살린 것이 원본이 아닙니다');

  /* ★ 이것이 결론이다 — 채우기·되돌려 넣기가 쓰는 바탕(_rhBase||_rhDoc)이 «원본»이어야 한다 */
  const 바탕 = vm.runInContext('(_rhBase||_rhDoc)', ctx);
  assert.equal(Buffer.from(바탕.bytes).toString('base64'), b64(원본바이트),
    '★★ 바탕이 «채워진 문서»입니다 — 채우기를 누른 만큼 값이 겹쳐 적힙니다');

  /* 화면에 보여 주는 문서는 그대로 «채운 것»이다 — 사람이 보던 것이 사라지면 안 된다 */
  assert.equal(Buffer.from(ctx._rhDoc.bytes).toString('base64'), b64(채운바이트),
    '화면 문서가 원본으로 바뀌었습니다 — 채운 내용이 사라져 보입니다');
  /* 친 값도 이어져야 한다 */
  assert.equal(ctx._rhVals.t0r0c1, '권형하', '친 값이 안 이어졌습니다');
});

test('★★ 채우기·되돌려 넣기가 실제로 그 바탕을 쓴다 — 되살려도 안 쓰면 뜻이 없다', () => {
  assert.match(cutFn(CODE, 'async function rhFillByMap('), /var 바탕=_rhBase\|\|_rhDoc;/,
    '채우기가 원본을 바탕으로 쓰지 않습니다');
  assert.match(cutFn(CODE, 'async function rhComposeBytes('), /var base=_rhBase\|\|_rhDoc;/,
    '되돌려 넣기가 원본을 바탕으로 쓰지 않습니다');
});

/* ══════ ④ mountEditor 가 되살린 원본을 덮지 못하게 ══════ */
test('★★ 이어서 열 때 mountEditor 가 «되살린 원본»을 덮지 못한다', async () => {
  const id = 'rh_draft_y';
  const ctx = 세상({ rh_drafts: [{ id: id, name: '가.hwpx', ext: 'hwpx', at: 1, done: false, hasBase: true }] });
  ctx._담긴것[id] = { id: id, name: '가.hwpx', ext: 'hwpx', base64: b64(채운바이트) };
  ctx._담긴것[id + '@base'] = { id: id + '@base', name: '가.hwpx', ext: 'hwpx', base64: b64(원본바이트) };
  await vm.runInContext('rhDraftResume("' + id + '")', ctx);
  assert.equal(ctx._올릴때KeepBase, true,
    '★ mountEditor 가 도는 동안 바탕이 열려 있었습니다 — 되살린 원본·친 값을 덮습니다');
  /* ⚠ 끝난 뒤에는 반드시 닫혀야 한다 — 열린 채 남으면 «다음 양식»이 바탕을 못 잡는다 */
  assert.equal(ctx._rhKeepBase, false, '★ 막아 둔 것을 안 풀었습니다 — 다음 양식이 바탕을 못 잡습니다');
});

/* ══════ ⑤ 원본이 없는 «옛 자리» ══════ */
test('★★ 원본이 없으면 «조용히 넘기지 않는다» — 말없이 겹치면 틀린 서류가 나간다', async () => {
  const id = 'rh_draft_z';
  const ctx = 세상({ rh_drafts: [{ id: id, name: '옛것.hwpx', ext: 'hwpx', at: 1, done: false }] });
  ctx._담긴것[id] = { id: id, name: '옛것.hwpx', ext: 'hwpx', base64: b64(채운바이트) };
  await vm.runInContext('rhDraftResume("' + id + '")', ctx);
  assert.equal(ctx._rhBase, null, '원본이 없는데 무언가를 원본이라고 잡았습니다');
  const 말 = ctx._알림.join(' / ');
  assert.match(말, /원본/, '원본이 없다는 말을 안 했습니다: ' + 말);
  assert.match(말, /겹/, '겹칠 수 있다는 말을 안 했습니다: ' + 말);
  /* ⚠ 그렇다고 열기를 «막지는» 않는다 — 하던 작업을 못 꺼내면 더 나쁘다 */
  assert.equal(ctx._rhDoc && ctx._rhDoc.name, '옛것.hwpx', '원본이 없다고 열기를 막았습니다');
  /* ⚠ 목록도 건드리지 않는다 */
  assert.equal(ctx._store.rh_drafts.length, 1, '원본이 없다고 자리를 지웠습니다');
});

test('★ 목록이 «원본 없음»을 밝힌다 — 모르면 눌러 보고 나서야 겹친 것을 안다', () => {
  const draw = cutFn(CODE, 'function rhDraftDraw(');
  assert.match(draw, /hasBase/, '목록이 원본 있는지를 보지 않습니다');
  assert.match(draw, /원본 없음/, '「원본 없음」을 밝히지 않습니다');
});

/* ══════ ⑥ 사본 ══════ */
test('★★ ⧉ 사본도 «원본»을 데려간다 — 안 데려가면 사본에서 값이 겹친다', async () => {
  const id = 'rh_draft_c';
  const ctx = 세상({ rh_drafts: [{ id: id, name: '가.hwpx', ext: 'hwpx', at: 1,
                                   done: false, hasBase: true, cells: { done: 1, total: 5 } }] });
  ctx._담긴것[id] = { id: id, name: '가.hwpx', ext: 'hwpx', size: 9, base64: b64(채운바이트) };
  ctx._담긴것[id + '@base'] = { id: id + '@base', name: '가.hwpx', ext: 'hwpx', size: 8, base64: b64(원본바이트) };
  await vm.runInContext('rhDraftCopy("' + id + '")', ctx);

  const 새 = ctx._store.rh_drafts.filter((d) => d.id !== id)[0];
  assert.ok(새, '사본 자리가 안 생겼습니다');
  assert.equal(새.hasBase, true, '★ 사본에 원본이 없다고 적혔습니다');
  const 새원본 = ctx._담긴것[새.id + '@base'];
  assert.ok(새원본, '★ 사본의 원본이 안 담겼습니다 — 사본에서 채우면 값이 겹칩니다');
  assert.equal(새원본.base64, b64(원본바이트), '사본의 원본이 «채운 문서»입니다');
  /* 옛 자리의 원본은 그대로 있어야 한다 — 옮기는 것이 아니라 «복사»다 */
  assert.ok(ctx._담긴것[id + '@base'], '원본을 옮겨 버려 옛 자리가 빈손이 됐습니다');
});

test('원본이 없는 자리를 사본 뜨면 «없다»고 적는다 — 있다고 적으면 목록이 거짓말을 한다', async () => {
  const id = 'rh_draft_d';
  const ctx = 세상({ rh_drafts: [{ id: id, name: '옛것.hwpx', ext: 'hwpx', at: 1, done: false }] });
  ctx._담긴것[id] = { id: id, name: '옛것.hwpx', ext: 'hwpx', size: 9, base64: b64(채운바이트) };
  await vm.runInContext('rhDraftCopy("' + id + '")', ctx);
  const 새 = ctx._store.rh_drafts.filter((d) => d.id !== id)[0];
  assert.ok(새, '사본 자리가 안 생겼습니다');
  assert.ok(!새.hasBase, '원본이 없는데 있다고 적혔습니다');
});

/* ══════ 원본을 «색인»에 담지 않는다 ══════ */
test('★ 원본을 색인(localStorage)에 담지 않는다 — 색인은 클라우드로 나간다', () => {
  const save = cutFn(CODE, 'function rhBaseSave(');
  assert.match(save, /saveFileUnified\(/, '원본이 파일 저장소로 가지 않습니다');
  assert.doesNotMatch(save, /LS\.set|set\(RH_DRAFTS/, '원본이 색인으로 새고 있습니다');
  /* 색인에 담긴 것은 「있다/없다」 하나뿐이어야 한다 */
  const ctx = 세상({});
  채운상태(ctx);
  vm.runInContext('rhDraftSave()', ctx);
  const 색인 = JSON.stringify(ctx._store.rh_drafts[0]);
  assert.equal(색인.indexOf(b64(원본바이트).slice(0, 6)), -1, '색인에 원본 바이트가 들어갔습니다');
  assert.equal(색인.indexOf('권형하'), -1, '색인에 친 값이 들어갔습니다');
});
