'use strict';
/* 📂 작성 중 보관함 (대표 승인 2026-09-06 「목업대로 · 이 PC 안에서만 · 완성본도 남긴다」)
   ─────────────────────────────────────────────────────────────
   대표 제보: 「이력서 등 여러 개를 동시에 작성해야 할 때가 있다. 임시보관함을 만들어
   계속 이어서 할 수 있게, 임시저장이 아니라도 자동으로 저장되게」

   ■ 전에는 (실측)
     자동저장은 30초마다 이미 돌았다. 그런데 담기는 자리가 «한 자리»(rh_draft 고정)여서
     새 양식을 올리면 앞서 하던 이력서를 통째로 덮어썼다. 담는 것도 문서뿐이라
     이어서 열면 입력판에 친 값과 칸 짝 지정이 사라졌다.
     게다가 색인만 클라우드로 오가고 파일은 안 가서, 폰에서 열면 「찾을 수 없습니다」가
     뜨고 그 자리에서 딱지를 지워 PC 에 남은 파일까지 못 꺼내게 됐다.

   여기서 못 박는 것은 «값»이 아니라 «규칙»이다:
     ① 새 양식은 «새 자리»에 담는다 — 앞서 하던 것을 덮지 않는다
     ② 색인은 이 기기에만 둔다 — 색인만 오가면 남의 기기에서 작업을 잃는다
     ③ 친 값은 색인(localStorage)에 담지 않는다 — 주민번호가 클라우드로 나간다
     ④ 파일이 없으면 «지우지 않는다» — 옛 코드가 여기서 작업을 잃었다
     ⑤ 완성본을 내면 지우지 말고 「지난 작성」으로 내린다
     ⑥ 버리기는 휴지통으로 — 바로 지우지 않는다 */
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

/* ══════ ① 덮어쓰지 않는다 ══════ */
test('★ 새 양식을 올리면 «새 자리»에 담는다 — 이 한 줄이 덮어쓰기를 막는다', () => {
  const up = cutFn(CODE, 'async function importTemplateFile(');
  assert.match(up, /_rhDraftId\s*=\s*null/,
    '새 양식을 올릴 때 자리를 새로 잡지 않으면 앞서 하던 것을 덮어씁니다');
  assert.match(up, /rhDraftSave\(\)/, '올리는 순간 담겨야 합니다');
  const save = cutFn(CODE, 'function rhDraftSave(');
  assert.match(save, /if\(!_rhDraftId\)\s*_rhDraftId\s*=\s*rhDraftNewId\(\)/,
    '자리가 없을 때 새로 잡는 길이 없습니다');
  assert.doesNotMatch(save, /saveFileUnified\(RH_DRAFT\b/, '한 자리에 고정해 담고 있습니다');
});

test('★ 치우면 «지금 자리»를 놓는다 — 안 놓으면 다음 양식이 치운 자리를 덮는다', () => {
  assert.match(cutFn(CODE, 'async function rhCloseDoc('), /_rhDraftId\s*=\s*null/);
});

/* ══════ ② 색인은 이 기기에만 ══════ */
test('★ 색인을 클라우드에 올리지 않는다 — 색인만 오가면 남의 기기에서 작업을 잃는다', () => {
  const skip = CODE.slice(CODE.indexOf('var FB_SKIP='), CODE.indexOf('var FB_SKIP=') + 700);
  ['rh_drafts', 'rh_draft_meta', 'rh_draft_moved'].forEach((k) => {
    assert.ok(skip.indexOf("'" + k + "'") >= 0, k + ' 가 FB_SKIP 에 없습니다');
  });
});

test('★ 친 값을 색인에 담지 않는다 — 주민번호가 클라우드로 나간다', () => {
  const save = cutFn(CODE, 'function rhDraftSave(');
  assert.doesNotMatch(save, /LS\.set\([^)]*_rhVals/, '친 값을 localStorage 에 담고 있습니다');
  /* 친 값은 «문서와 같은 곳»(이 기기의 파일 저장소)에 담는다 */
  const side = cutFn(CODE, 'function rhSideSave(');
  assert.match(side, /saveFileUnified\(/, '친 값이 파일 저장소로 가지 않습니다');
  assert.doesNotMatch(side, /LS\.set/, '친 값이 localStorage 로 새고 있습니다');
  assert.match(side, /_rhVals/, '입력판에 친 값이 안 담깁니다');
  assert.match(side, /_rhPicks/, '칸 짝 지정이 안 담깁니다');
});

test('★ 담을 때 친 값이 «실제로» 함께 담긴다 — 부르는 줄만 보면 껍데기를 못 잡는다', () => {
  /* ⚠ 전에는 `rhSideSave(` 가 «있는지»만 봤다. 그래서 `if(0) rhSideSave(...)` 처럼
     불리지 않게 만들어도 검사가 통과했다(고장넣기에서 걸렸다).
     이제 실제로 담아 보고 «담긴 것»을 확인한다. */
  const ctx = 저장세상({});
  vm.runInContext('_rhDoc={name:"가.hwpx",ext:"hwpx",bytes:new Uint8Array([1,2,3])};'
    + '_rhVals={t0r0c1:"홍길동"}; _rhPicks={t0r0c1:"name"};', ctx);
  vm.runInContext('rhDraftSave()', ctx);
  const id = vm.runInContext('_rhDraftId', ctx);
  assert.ok(id, '자리 번호가 안 잡혔습니다');
  assert.ok(ctx._담긴것[id], '문서가 안 담겼습니다');
  const side = ctx._담긴것[id + '@side'];
  assert.ok(side, '친 값이 안 담겼습니다 — 이어서 열면 친 것이 사라집니다');
  const pack = JSON.parse(Buffer.from(side.base64, 'base64').toString('utf8'));
  assert.equal(pack.vals.t0r0c1, '홍길동', '친 값이 안 들어갔습니다');
  assert.equal(pack.picks.t0r0c1, 'name', '짝 지정이 안 들어갔습니다');
  /* 색인에는 이름·시각만 — 친 값이 새면 클라우드로 나간다 */
  const 색인 = ctx._store.rh_drafts[0];
  assert.equal(JSON.stringify(색인).indexOf('홍길동'), -1,
    '색인에 친 값이 들어갔습니다 — localStorage 는 클라우드로 올라갑니다');
});

test('★ 이어서 열면 친 값·짝 지정도 되살린다 — 「이어서」인데 안 이어지면 안 된다', () => {
  const r = cutFn(CODE, 'async function rhDraftResume(');
  assert.match(r, /rhSideLoad\(/, '친 값을 읽지 않습니다');
  assert.match(r, /_rhVals\s*=/, '친 값을 되살리지 않습니다');
  assert.match(r, /_rhPicks\s*=/, '짝 지정을 되살리지 않습니다');
  assert.match(r, /mountEditor\(/, '문서를 화면에 올리지 않습니다');
});

/* ══════ ③ 파일이 없을 때 ══════ */
test('★ 서식 파일이 없으면 목록을 «건드리지 않는다» — 옛 코드가 여기서 작업을 잃었다', () => {
  const r = cutFn(CODE, 'async function rhDraftResume(');
  const 없을때 = r.slice(r.indexOf('if(!f'), r.indexOf('if(!f') + 320);
  assert.doesNotMatch(없을때, /rhDraftPut|deleteFile|rhDraftDrop/,
    '파일이 없다고 목록·파일을 지우면, 파일이 다른 기기에 있을 때 꺼낼 길이 사라집니다');
  assert.match(없을때, /toast\(/, '무엇이 없는지 사람에게 말해야 합니다');
});

/* ══════ ④ 완성본·버리기 ══════ */
test('★ 완성본을 내면 지우지 말고 「지난 작성」으로 내린다', () => {
  const done = cutFn(CODE, 'function rhDraftDone(');
  assert.match(done, /done\s*=\s*true/, '지난 작성으로 내리지 않습니다');
  assert.doesNotMatch(done, /deleteFile|filter\(/, '자리를 지우고 있습니다 — 남기기로 정했습니다');
  assert.match(cutFn(CODE, 'async function confirmResumeSave('), /rhDraftDone\(\)/,
    '완성 저장이 「지난 작성」으로 내리지 않습니다');
});

test('★ 버리기는 휴지통으로 — 바로 지우면 되돌릴 수 없다', () => {
  const t = cutFn(CODE, 'function rhDraftTrash(');
  assert.match(t, /kcTrashPut\(/, '휴지통에 담지 않습니다');
  assert.doesNotMatch(t, /deleteFile\(/, '파일을 바로 지우고 있습니다');
  /* 되살리면 목록이 다시 그려져야 한다 — 안 그러면 되살렸는데 안 보인다 */
  assert.match(cutFn(CODE, 'function kcTrashRedraw('), /rh_drafts.*rhDraftCheck/s,
    '되살린 뒤 작성 중 목록을 다시 그리지 않습니다');
});

/* ══════ ⑤ 화면 ══════ */
test('★ 목록판은 접혀 있다 — 감추기 규칙이 없으면 늘 펼쳐진 채 나온다', () => {
  assert.match(SRC, /#rhDraftPanel\.hide\{display:none\}/,
    '이 파일에는 공용 .hide 규칙이 없다 — 제 것을 두어야 접힌다');
  assert.match(SRC, /id="rhDraftPanel"[^>]*class="hide"/, '처음에 접혀 있어야 합니다');
  assert.match(SRC, /onclick="rhDraftPanelToggle\(\)"/, '딱지를 눌러 열 수 없습니다');
});

test('★ 부르는 손잡이가 «실제로 있는 것»이다 — 없는 이름은 눌러도 아무 일이 없다', () => {
  assert.match(cutFn(CODE, 'function rhOpenTrash('), /nav_to\(/, '화면 이동은 nav_to 다');
  assert.doesNotMatch(CODE, /goPage\(|settingsTab\(/, '이 파일에 없는 이름을 부르고 있습니다');
  ['rhDraftPanelToggle', 'rhDraftDraw', 'rhDraftResume', 'rhDraftCopy', 'rhDraftTrash',
   'rhDraftDone', 'rhOpenTrash', 'rhDraftMigrate'].forEach((fn) => {
    assert.ok(CODE.indexOf('function ' + fn + '(') >= 0
           || CODE.indexOf('async function ' + fn + '(') >= 0, fn + ' 이 없습니다');
  });
});

test('화면에 들어올 때 «이사부터» 한다 — 옛 한 자리에 든 작업이 목록에 안 보이면 안 된다', () => {
  const at = CODE.indexOf("id==='page-resume-hub'");
  assert.notEqual(at, -1);
  const 줄 = CODE.slice(at, at + 320);
  assert.match(줄, /rhDraftMigrate\(\)/, '이사를 안 합니다 — 대표 PC 의 하던 작업이 사라집니다');
  assert.match(줄, /rhDraftCheck/, '목록을 세우지 않습니다');
  const mig = cutFn(CODE, 'async function rhDraftMigrate(');
  assert.match(mig, /rh_draft_moved/, '두 번 옮기면 사본이 생깁니다 — 한 번만 옮겨야 합니다');
});

/* ══════ ⑥ 실제로 돌려 본다 ══════ */
function 세상(store) {
  const 담긴것 = {};
  const ctx = {
    console, JSON, String, Number, Array, Object, Error, Date, Math, RegExp, parseInt,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); },
    document: { getElementById: () => null, querySelector: () => null },
    toast: () => {}, escapeHtml: (x) => String(x == null ? '' : x),
    _jsAttr: (x) => String(x == null ? '' : x),
    get: (k) => (store[k] || []).slice(),
    set: (k, a) => { store[k] = a.slice(); },
    saveFileUnified: (id, f) => { 담긴것[id] = f; return id; },
    deleteFile: (id) => { delete 담긴것[id]; },
    fileExists: (id) => !!담긴것[id],
    kcTrashDone: () => {},
    /* 목록 다시 그리기·알림은 화면 일이다 — 여기서는 부르기만 확인하고 넘긴다 */
    rhDraftCheck: () => {}, rhDraftDraw: () => {},
    LS: { get: () => null, set: () => {}, remove: () => {} },
    localStorage: { removeItem: () => {} },
    NS: 'cm3_', TRASH_STORE: 'trash', TRASH_DAYS: 30,
    _rhVals: {}, _rhPicks: {}, _rhListPlan: null, _rhMap: null, _rhDoc: null,
    _rhSideId: (id) => id + '@side',
    _store: store, _담긴것: 담긴것
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('var RH_DRAFTS="rh_drafts"; var RH_DRAFT_MAX=10; var _rhDraftId=null; var _rhDraftSeq=0;', ctx);
  vm.runInContext(cutFn(CODE, 'function kcTrashLabel('), ctx);
  vm.runInContext(cutFn(CODE, 'function kcTrashFileIds('), ctx);
  vm.runInContext(cutFn(CODE, 'function kcTrashList('), ctx);
  vm.runInContext(cutFn(CODE, 'function kcTrashPut('), ctx);
  ['function rhDraftAll(', 'function rhDraftPut(', 'function rhDraftFind(', 'function rhDraftNewId(',
   'function rhDraftCells(', 'function rhDraftDone(', 'function rhDraftTrash(', 'function _rhWhen(']
    .forEach((d) => vm.runInContext(cutFn(CODE, d), ctx));
  return ctx;
}

/* 담기까지 돌려 보는 세상 — 문서·친 값이 «실제로» 파일 저장소에 들어가는지 본다 */
function 저장세상(store) {
  const ctx = 세상(store);
  ctx.Uint8Array = Uint8Array; ctx.TextEncoder = TextEncoder; ctx.ArrayBuffer = ArrayBuffer;
  ctx.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  vm.runInContext('var abToB64=' + String(function (buf) {
    let bin = '', b = new Uint8Array(buf), ch = 0x8000;
    for (let i = 0; i < b.length; i += ch) bin += String.fromCharCode.apply(null, b.subarray(i, i + ch));
    return btoa(bin);
  }) + ';', ctx);
  /* ⚠ rhDraftSave 는 «원본»도 담는다(rhBaseSave) — 하네스에 없으면 그 줄에서 걸려
     친 값까지 안 담긴다. 스텁이 아니라 «진짜 함수»를 넣는다:
     _rhBase 가 비어 있으면 rhBaseSave 는 스스로 넘어가므로 여기 셈은 달라지지 않는다.
     (원본을 담는 규칙 자체는 tests/kcareer-draft-base.test.js 가 못 박는다.) */
  vm.runInContext('var _rhBase=null; var _rhBaseSaved="";', ctx);
  ['function _rhBaseId(', 'function rhBaseSave(', 'function rhSideSave(', 'function rhDraftSave(']
    .forEach((d) => vm.runInContext(cutFn(CODE, d), ctx));
  return ctx;
}

test('★ 자리 번호는 부를 때마다 다르다 — 같으면 서로 덮어쓴다', () => {
  /* ⚠ 무작위에 기대는 검사는 «이빨이 없다» — 200번 돌려 「다 다르다」를 보는 검사는
     옛 코드(시각+무작위 세 자리)에서도 대개 통과한다(겹칠 확률이 낮으니).
     그래서 시계와 주사위를 «멈춰 두고» 본다: 그래도 번호가 달라야 한다.
     달라지는 근거가 무작위가 아니라 «세는 것»이어야 한다는 뜻이다. */
  const ctx = 세상({});
  vm.runInContext('Date={now:function(){ return 1700000000000; }};'
    + 'Math={random:function(){ return 0.5; }};', ctx);
  const a = vm.runInContext('rhDraftNewId()', ctx);
  const b = vm.runInContext('rhDraftNewId()', ctx);
  assert.notEqual(a, b, '시계·주사위가 같으면 번호가 겹칩니다: ' + a);
  /* 이미 있는 번호를 피해 짓는다 — 이 저장소의 nextId·kcFreeId 와 같은 뜻이다 */
  assert.match(cutFn(CODE, 'function rhDraftNewId('), /rhDraftAll\(\)/,
    '이미 있는 번호를 안 봅니다 — 겹치면 두 자리가 서로 덮어씁니다');
});

test('★ 완성본을 내면 그 자리가 «남는다» — 목록에서 사라지면 안 된다', () => {
  const ctx = 세상({ rh_drafts: [{ id: 'rh_draft_a', name: '가.hwpx', at: 1, done: false },
                                 { id: 'rh_draft_b', name: '나.hwpx', at: 2, done: false }] });
  vm.runInContext('_rhDraftId="rh_draft_a"; rhDraftDone();', ctx);
  const arr = ctx._store.rh_drafts;
  assert.equal(arr.length, 2, '자리가 사라졌습니다');
  assert.equal(arr.filter((d) => d.id === 'rh_draft_a')[0].done, true, '지난 작성으로 안 내려갔습니다');
  assert.equal(arr.filter((d) => d.id === 'rh_draft_b')[0].done, false, '남의 자리를 건드렸습니다');
});

test('★ 버리면 휴지통에 남고 목록에서만 빠진다 — 파일은 아직 지우지 않는다', () => {
  const ctx = 세상({ rh_drafts: [{ id: 'rh_draft_a', name: '가.hwpx', at: 1, done: false },
                                 { id: 'rh_draft_b', name: '나.hwpx', at: 2, done: false }],
                     trash: [] });
  ctx._담긴것['rh_draft_a'] = { id: 'rh_draft_a' };
  vm.runInContext('rhDraftTrash("rh_draft_a")', ctx);
  assert.equal(ctx._store.rh_drafts.length, 1, '목록에서 안 빠졌습니다');
  assert.equal(ctx._store.rh_drafts[0].id, 'rh_draft_b', '남의 자리가 빠졌습니다');
  assert.equal(ctx._store.trash.length, 1, '휴지통에 안 담겼습니다');
  assert.equal(ctx._store.trash[0].store, 'rh_drafts', '되살릴 곳이 안 적혔습니다');
  assert.ok(ctx._담긴것['rh_draft_a'], '파일을 벌써 지웠습니다 — 완전삭제 때 지워야 합니다');
});

test('버린 자리가 «지금 하던 것»이면 자리 표시도 놓는다', () => {
  const ctx = 세상({ rh_drafts: [{ id: 'rh_draft_a', name: '가.hwpx', at: 1, done: false }], trash: [] });
  vm.runInContext('_rhDraftId="rh_draft_a"; rhDraftTrash("rh_draft_a")', ctx);
  assert.equal(vm.runInContext('_rhDraftId', ctx), null, '버린 자리를 아직 가리키고 있습니다');
});

test('「친 칸」은 실제로 친 것만 센다 — 빈 칸을 세면 다 한 것처럼 보인다', () => {
  const ctx = 세상({});
  vm.runInContext('_rhMap={slots:[1,2,3,4,5]}; _rhVals={a:"값",b:"",c:"값"};', ctx);
  const c = vm.runInContext('rhDraftCells()', ctx);
  assert.equal(c.done, 2, '빈 칸을 셌습니다');
  assert.equal(c.total, 5);
});

test('「마지막 담김」을 사람 말로 적는다 — 밀리초를 보여 주면 아무 뜻이 없다', () => {
  const ctx = 세상({});
  const 언제 = (ms) => vm.runInContext('_rhWhen(' + (Date.now() - ms) + ')', ctx);
  assert.equal(언제(5 * 1000), '방금');
  assert.match(언제(10 * 60 * 1000), /^10분 전$/);
  assert.match(언제(3 * 3600 * 1000), /^3시간 전$/);
  assert.match(언제(2 * 86400 * 1000), /^2일 전$/);
});

test('★ 자리 한도가 있다 — 서식 하나가 수 MB 라 무한히 쌓으면 저장공간이 찬다', () => {
  assert.match(CODE, /var RH_DRAFT_MAX\s*=\s*\d+/, '한도가 없습니다');
  const copy = cutFn(CODE, 'async function rhDraftCopy(');
  assert.match(copy, /RH_DRAFT_MAX/, '사본이 한도를 안 봅니다');
  /* ⚠ 한도를 넘으면 «알리고 멈춘다» — 오래된 것을 조용히 지우면 안 된다 */
  assert.doesNotMatch(copy, /deleteFile|pop\(\)|shift\(\)/, '자리가 차면 조용히 지우고 있습니다');
});

test('★ 다른 자리로 넘어갈 때 «지금 하던 것»을 먼저 담는다 — 넘어가다 잃으면 안 된다', () => {
  const r = cutFn(CODE, 'async function rhDraftResume(');
  assert.match(r, /rhDraftNow\(true\)/, '넘어가기 전에 담지 않습니다');
  /* 조용히 담을 수 있어야 한다 — 넘어갈 때마다 알림이 뜨면 시끄럽다 */
  assert.match(cutFn(CODE, 'async function rhDraftNow('), /quiet/, '조용히 담는 길이 없습니다');
});
