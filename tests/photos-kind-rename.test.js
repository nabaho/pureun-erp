/* 사진첩 분류 이름 고치기.
   ⚠ 핵심: 사진은 **이름이 아니라 번호(id)** 로 분류를 가리킨다. 그래서 이름만 갈면 되고
     그 분류에 든 사진은 한 장도 안 움직인다. 이 성질이 깨지면 이름을 고치는 순간
     사진들이 분류에서 떨어져 나간다 — 그래서 검사로 못박아 둔다.
   저장소를 진짜 Firebase 없이 돌리려고 가짜 db 를 만들어 넣는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-store.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 저장소에서 renameCustomKind 와 그것이 쓰는 것만 떼어 돌린다.
   ⚠ isAdmin 기본값은 true 다(대표 지시 2026-08-15로 총괄 관리자 전용이 됨) —
     그래야 아래 옛 검사들이 「관리자가 아니라 막힘」이 아니라 원래 보려던
     이름 검사·중복 검사를 계속 본다. 권한 자체를 보는 검사는 따로 둔다. */
function loadRename(kinds, isAdmin){
  const i = src.indexOf('function renameCustomKind');
  const j = src.indexOf('function addCustomKind');
  assert.ok(i > 0 && j > i, 'renameCustomKind 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    Promise, Object, String, Date,
    deps: { db: {}, isAdmin: isAdmin !== false },
    customKindsPath: () => 'puphotos/customKinds',
    listCustomKinds: () => Promise.resolve(JSON.parse(JSON.stringify(kinds))),
    _writes: writes
  };
  ctx.deps.db.ref = p => ({ update: v => { writes.push({ path:p, val:v }); return Promise.resolve(); } });
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}
const K = () => ({
  k1: { name: '자문등계약서', createdAt: 1 },
  k2: { name: '근태표',       createdAt: 2 }
});

test('이름을 고치면 그 분류의 name 만 바뀐다', async () => {
  const c = loadRename(K());
  const r = await c.renameCustomKind('k1', '자문계약서');
  assert.equal(r.changed, true);
  assert.equal(c._writes.length, 1);
  assert.equal(c._writes[0].path, 'puphotos/customKinds/k1');
  assert.equal(c._writes[0].val.name, '자문계약서');
});

test('사진이 가리키는 번호(id)는 건드리지 않는다', async () => {
  /* 사진은 custom:k1 로 가리킨다. 이름을 고쳐도 k1 은 그대로여야 사진이 안 떨어진다 */
  const c = loadRename(K());
  await c.renameCustomKind('k1', '아주 다른 이름');
  const w = c._writes[0];
  assert.match(w.path, /\/k1$/, '고친 자리가 k1 이 아니면 사진이 분류에서 떨어진다');
  assert.equal(w.val.id, undefined, 'id 를 새로 쓰면 안 된다');
  assert.equal(w.val.createdAt, undefined, '만든 때를 덮으면 안 된다');
});

test('앞뒤 공백은 지운다', async () => {
  const c = loadRename(K());
  await c.renameCustomKind('k1', '  자문계약서  ');
  assert.equal(c._writes[0].val.name, '자문계약서');
});

test('다른 분류와 이름이 겹치면 막는다', async () => {
  /* 같은 이름이 둘이면 어느 쪽에 넣었는지 사람이 못 가린다 */
  const c = loadRename(K());
  await assert.rejects(() => c.renameCustomKind('k1', '근태표'), /이미 있는 분류/);
  assert.equal(c._writes.length, 0, '막았으면 아무것도 쓰면 안 된다');
});

test('남의 이름과 대소문자·공백만 달라도 겹친 것으로 막는다', async () => {
  const c = loadRename({ k1:{name:'자문등계약서'}, k2:{name:'ABC'} });
  await assert.rejects(() => c.renameCustomKind('k1', ' abc '), /이미 있는 분류/);
});

test('제 이름의 대소문자만 고치는 것은 막지 않는다', async () => {
  /* 「ABC」를 「abc」로 바로잡는 것은 겹치는 게 아니라 그냥 고치는 것이다.
     남의 것과만 견줘야 한다 — 자기 자신과 견주면 대소문자를 영영 못 고친다. */
  const c = loadRename({ k1:{name:'ABC'}, k2:{name:'근태표'} });
  const r = await c.renameCustomKind('k1', 'abc');
  assert.equal(r.changed, true);
  assert.equal(c._writes[0].val.name, 'abc');
});

test('자기 이름 그대로 두면 쓰지 않는다', async () => {
  const c = loadRename(K());
  const r = await c.renameCustomKind('k1', '자문등계약서');
  assert.equal(r.changed, false);
  assert.equal(c._writes.length, 0, '안 바뀌었는데 쓰면 헛일이다');
});

test('빈 이름은 막는다', async () => {
  const c = loadRename(K());
  await assert.rejects(() => c.renameCustomKind('k1', '   '), /입력해 주세요/);
});

test('이미 지워진 분류는 막는다', async () => {
  const c = loadRename(K());
  await assert.rejects(() => c.renameCustomKind('없는번호', '새이름'), /지워진 분류/);
});

test('★ 총괄 관리자가 아니면 이름을 못 고친다', async () => {
  /* 분류 이름표는 전 직원 공용이라, 아무나 고칠 수 있으면 오타 분류가 쌓여도
     못 막는다(대표 지시 2026-08-15). */
  const c = loadRename(K(), false);
  await assert.rejects(() => c.renameCustomKind('k1', '새이름'), /총괄 관리자/);
  assert.equal(c._writes.length, 0, '★ 막았는데 썼습니다');
});

test('화면: 직접 만든 분류에만 ✎ 가 붙는다', () => {
  /* 고정 분류(명함·사업자등록증)는 코드가 정한 이름이라 못 고친다 */
  assert.match(html, /const pen = \(!t && kindTab === k && PuPhotoStore\.amAdmin\(\)\)/);
  assert.match(html, /openRenameKind\(/);
});

test('★ 화면: 총괄 관리자가 아니면 ✎ 도 「+ 분류 추가」도 안 보인다', () => {
  /* 대표 지시 2026-08-15 — 지금은 직원 누구나 공용 분류를 마음대로 바꿀·지울
     수 있어, 오타 분류가 쌓이거나 누가 지워도 못 막는다. */
  assert.match(html, /const pen = \(!t && kindTab === k && PuPhotoStore\.amAdmin\(\)\)/);
  assert.match(html, /PuPhotoStore\.amAdmin\(\)\s*\n?\s*\?\s*'<button class="add"/);
});

test('화면: ✎ 를 눌러도 분류가 바뀌지 않는다', () => {
  /* stopPropagation 이 없으면 탭째 눌려 분류가 바뀐 뒤 창이 뜬다 */
  const at = html.indexOf('const pen = (!t && kindTab === k && PuPhotoStore.amAdmin())');
  assert.match(html.slice(at, at + 400), /event\.stopPropagation\(\)/);
});

test('화면: 사진은 그대로라고 알려준다', () => {
  /* 이름을 고치면 사진이 사라질까 봐 안 누르게 된다 */
  assert.match(html, /이름을 고쳐도 사진은 그대로 있습니다/);
});

/* ══════ 분류 지우기 (대표 지시 2026-08-13) ══════
   "분류 한 것에 이름을 변경하거나 삭제할 수 있게 해달라"
   ⚠ 가장 위험한 것: 분류를 지웠는데 **사진까지 사라지는 것**. 그래서
     저장 층이 이름표 칸 하나만 만지는지를 못박는다. */

function loadDelete(isAdmin) {
  const i = src.indexOf('function deleteCustomKind');
  const j = src.indexOf('function addCustomKind');
  assert.ok(i > 0 && j > i, 'deleteCustomKind 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    Promise, Object, String, Date,
    deps: { db: {}, isAdmin: isAdmin !== false },
    customKindsPath: () => 'puphotos/customKinds',
    _writes: writes
  };
  ctx.deps.db.ref = () => ({ update: v => { writes.push(v); return Promise.resolve(); } });
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

test('★ 총괄 관리자가 아니면 분류를 못 지운다', async () => {
  const c = loadDelete(false);
  await assert.rejects(() => c.deleteCustomKind('k1'), /총괄 관리자/);
  assert.equal(c._writes.length, 0, '★ 막았는데 썼습니다');
});

test('★ 분류를 지워도 사진 자리는 한 곳도 안 건드린다', async () => {
  const c = loadDelete();
  await c.deleteCustomKind('k1');
  assert.equal(c._writes.length, 1, '한 번의 update 로 끝나야 한다');
  const u = c._writes[0];
  assert.deepEqual(Object.keys(u), ['puphotos/customKinds/k1']);
  assert.equal(u['puphotos/customKinds/k1'], null);
  // 사진 자리(items/blobs/thumbs)를 건드리면 사진이 사라진다
  assert.ok(!Object.keys(u).some(k => /items|blobs|thumbs/.test(k)),
    '★ 사진 자리를 건드렸습니다 — 분류를 지우면 사진까지 사라집니다');
});

test('어떤 분류인지 모르면 아무것도 안 지운다', async () => {
  const c = loadDelete();
  await assert.rejects(() => c.deleteCustomKind(''), /알 수 없습니다/);
  await assert.rejects(() => c.deleteCustomKind(null), /알 수 없습니다/);
  assert.equal(c._writes.length, 0,
    '★ 번호가 없으면 윗자리(customKinds 통째)를 가리켜 분류가 전부 날아갑니다');
});

test('화면: 지우기는 「분류 고치기」 창 안에 있다', () => {
  /* ✎ 로 들어온 사람이 「없애는 건 어디서 하지」를 다시 찾게 하지 않는다 */
  assert.match(html, /id="kindPopupDel"/);
  const at = html.indexOf('function openRenameKind(');
  assert.match(html.slice(at, at + 1600), /showKindDelBtn\(function \(\) \{ askDeleteKind\(/);
});

test('★ 화면: 지우기 단추는 쓰는 창에서만 뜬다', () => {
  /* 한 창을 여러 일에 돌려 쓴다 — 안 끄면 「새 분류 만들기」 창에도 남아
     무엇을 지우는지 모르는 단추가 생긴다 */
  assert.match(html, /style="display:none"[^>]*>지우기|id="kindPopupDel" style="display:none"/);
  const at = html.indexOf('function closeKindPopup(');
  assert.match(html.slice(at, at + 400), /showKindDelBtn\(null\)/,
    '창을 닫을 때 지우기를 안 끕니다');
});

test('★ 화면: 지우기 전에 되돌릴 수 없다는 것과 사진은 남는다는 것을 함께 말한다', () => {
  const at = html.indexOf('function askDeleteKind(');
  assert.ok(at > 0, 'askDeleteKind 가 없습니다');
  const fn = html.slice(at, at + 1800);
  assert.match(fn, /confirm\(/, '묻지 않고 지우면 안 됩니다');
  assert.match(fn, /지워지지 않습니다/, '사진이 남는다는 말이 없으면 무서워서 못 누릅니다');
  assert.match(fn, /되살릴 수 없습니다/, '되돌릴 수 없다는 말을 안 하면 가볍게 누릅니다');
  assert.match(fn, /다른 사람 화면에서도 사라집니다/, '공용이라는 말이 없습니다');
  // 장수를 넣어 「몇 장짜리 분류를 지우는지」 알려야 한다
  assert.match(fn, /'장은 지워지지 않습니다/);
});

test('★ 화면: 묻는 말에 「아니오」면 아무것도 안 지운다', () => {
  const at = html.indexOf('function askDeleteKind(');
  const fn = html.slice(at, at + 1800);
  assert.match(fn, /if \(!confirm\(msg\)\) return;/,
    '★ 물어만 보고 그대로 지우면 물어본 뜻이 없습니다');
  const del = fn.indexOf('deleteCustomKind');
  const ask = fn.indexOf('if (!confirm(msg)) return;');
  assert.ok(ask > 0 && del > ask, '★ 묻기 전에 지웁니다');
});

test('보고 있던 분류를 지우면 전체사진으로 돌아간다', () => {
  const at = html.indexOf('function askDeleteKind(');
  const fn = html.slice(at, at + 1800);
  assert.match(fn, /if \(kindTab === customTabKey\(id\)\) pickKind\('all'\);/,
    '없는 분류를 보며 빈 화면에 남겨 두면 안 됩니다');
});

test('창에 몇 장짜리 분류인지·누가 만들었는지 적는다', () => {
  /* 분류 이름표는 전 직원 공용이다 — 내가 지우면 남의 화면에서도 사라진다 */
  const at = html.indexOf('function openRenameKind(');
  const fn = html.slice(at, at + 1600);
  assert.match(fn, /tabCounts\(\)\[customTabKey\(id\)\]/, '든 사진 장수를 안 셉니다');
  assert.match(fn, /createdBy/, '누가 만든 분류인지 안 적습니다');
});

/* ══════ 분류 관리는 총괄 관리자만 (대표 지시 2026-08-15) ══════
   "분류추가에 변경삭제를 총괄관리자는 할 수 있게해달라" — 단추를 감춰도
   함수를 직접 불러 우회할 수 있으므로, 화면 함수 자체도 막아야 한다.
   ⚠ 사진에 분류를 「지정」하는 addCustomKind 는 다르다 — 판독 중 새 분류를
     즉석에서 만드는 것은 전 직원이 계속할 수 있어야 한다(submitAssignKind). */
test('★ 화면: openAddKind 는 함수 안에서도 관리자 여부를 본다', () => {
  const at = html.indexOf('function openAddKind(');
  assert.ok(at > 0, 'openAddKind 를 찾지 못했습니다');
  const fn = html.slice(at, at + 300);
  assert.match(fn, /if \(!PuPhotoStore\.amAdmin\(\)\)/,
    '★ 단추만 감추면 콘솔에서 바로 불러 우회할 수 있습니다');
});

test('★ 화면: openRenameKind 도 함수 안에서 관리자 여부를 본다', () => {
  const at = html.indexOf('function openRenameKind(');
  assert.ok(at > 0, 'openRenameKind 를 찾지 못했습니다');
  const fn = html.slice(at, at + 300);
  assert.match(fn, /if \(!PuPhotoStore\.amAdmin\(\)\)/,
    '★ 단추만 감추면 콘솔에서 바로 불러 우회할 수 있습니다 — 이름 고치기·지우기가 함께 뚫립니다');
});

test('★ addCustomKind 는 관리자 여부를 안 따진다 — 사진에 분류를 지정할 때도 쓴다', () => {
  /* submitAssignKind() 가 "+ 새 분류 만들기" 를 고르면 이 함수를 그대로 부른다.
     여기를 막으면 판독 화면에서 즉석으로 분류 만드는 길이 전 직원 앞에서 막힌다. */
  const i = src.indexOf('function addCustomKind');
  const j = src.indexOf('/* ══════ 내 폴더');
  assert.ok(i > 0 && j > i, 'addCustomKind 를 찾지 못했습니다');
  const fn = src.slice(i, j);
  assert.ok(!/isAdmin/.test(fn), '★ addCustomKind 가 관리자만 되게 막혀 있습니다');
});
