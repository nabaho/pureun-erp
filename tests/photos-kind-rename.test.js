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

/* 저장소에서 renameCustomKind 와 그것이 쓰는 것만 떼어 돌린다 */
function loadRename(kinds){
  const i = src.indexOf('function renameCustomKind');
  const j = src.indexOf('function addCustomKind');
  assert.ok(i > 0 && j > i, 'renameCustomKind 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    Promise, Object, String, Date,
    deps: { db: {} },
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

test('화면: 직접 만든 분류에만 ✎ 가 붙는다', () => {
  /* 고정 분류(명함·사업자등록증)는 코드가 정한 이름이라 못 고친다 */
  assert.match(html, /const pen = \(!t && kindTab === k\)/);
  assert.match(html, /openRenameKind\(/);
});

test('화면: ✎ 를 눌러도 분류가 바뀌지 않는다', () => {
  /* stopPropagation 이 없으면 탭째 눌려 분류가 바뀐 뒤 창이 뜬다 */
  const at = html.indexOf('const pen = (!t && kindTab === k)');
  assert.match(html.slice(at, at + 400), /event\.stopPropagation\(\)/);
});

test('화면: 사진은 그대로라고 알려준다', () => {
  /* 이름을 고치면 사진이 사라질까 봐 안 누르게 된다 */
  assert.match(html, /이 분류에 들어 있는 사진은 그대로 있습니다/);
});
