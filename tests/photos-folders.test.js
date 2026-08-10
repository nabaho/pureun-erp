/* 내 폴더 — 대표 지시 2026-08-09
   "개인마다 사진들을 종류별로 업무별로 분류해야할 경우가 있다.
    개인별로 폴더 만들어서 사진을 분류하는 기능을 만들수 있나"
   "폴더는 나만 수정하는것이다. 회의사진처럼 같이 공유하는 부분은 공유로 하면된다"

   분류 탭과 **다른 축**이다 — 분류는 「무엇인가」(명함·회의사진), 폴더는
   「어느 일인가」(㈜가야 실태조사). 그래서 한 사진이 둘 다에 든다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const html = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ── 저장 층 ── */
function loadStore(uid) {
  const writes = {};
  const reads = {};
  const ref = (p) => ({
    once: () => Promise.resolve({ val: () => (p in reads ? reads[p] : null) }),
    push: () => ({ key: 'newfold1' }),
    update: (u) => { Object.assign(writes, u); return Promise.resolve(); }
  });
  const db = { ref: (p) => (p === undefined ? ref('') : ref(p)) };
  const ctx = { window: {}, module: { exports: {} }, console };
  vm.createContext(ctx);
  vm.runInContext(store, ctx);
  const S = ctx.window.PuPhotoStore;
  S.init({ db, uid: uid || 'me1', name: '권형하' });
  return { S, writes, reads };
}

test('★ 폴더는 내 자리 안에 들어간다 (규칙을 새로 안 짜도 된다)', async () => {
  const { S, writes } = loadStore('me1');
  await S.addFolder('㈜가야 실태조사');
  const keys = Object.keys(writes);
  assert.ok(keys.length, '아무것도 안 썼습니다.');
  assert.ok(keys.every(k => k.indexOf('puphotos/u/me1/') === 0),
    '내 자리 밖에 쓰면 「본인과 관리자만」 규칙이 안 걸립니다: ' + keys.join(','));
  assert.ok(keys[0].indexOf('/folders/') > 0, '폴더 자리가 아닙니다: ' + keys[0]);
});

test('★ 같은 이름을 또 만들지 않는다', async () => {
  const { S, reads } = loadStore('me1');
  reads['puphotos/u/me1/folders'] = { f1: { name: '8월 교육' } };
  const r = await S.addFolder('  8월 교육  ');   // 앞뒤 공백만 다르다
  assert.equal(r.created, false, '둘이 생기면 어느 쪽에 넣었는지 헷갈립니다.');
  assert.equal(r.id, 'f1');
});

test('이름이 비면 만들지 않는다', async () => {
  const { S } = loadStore('me1');
  await assert.rejects(() => S.addFolder('   '));
});

test('★ 폴더를 지워도 사진은 안 지운다', async () => {
  const { S, writes } = loadStore('me1');
  await S.deleteFolder('f1');
  const keys = Object.keys(writes);
  assert.deepEqual(keys, ['puphotos/u/me1/folders/f1'],
    '폴더 이름표만 지워야 합니다 — 사진까지 건드리면 큰일입니다.');
  assert.equal(writes[keys[0]], null);
});

test('★ 사진을 폴더에 넣고 뺀다', async () => {
  const { S, writes } = loadStore('me1');
  await S.setFolder('2026', 'p1', 'f1');
  assert.equal(writes['puphotos/u/me1/items/2026/p1/folder'], 'f1');
  await S.setFolder('2026', 'p1', null);
  assert.equal(writes['puphotos/u/me1/items/2026/p1/folder'], null, '뺄 길이 있어야 합니다.');
});

test('폴더는 분류(customKind)와 다른 칸에 붙는다', async () => {
  const { S, writes } = loadStore('me1');
  await S.setFolder('2026', 'p1', 'f1');
  await S.setCustomKind('2026', 'p1', 'k1');
  assert.equal(writes['puphotos/u/me1/items/2026/p1/folder'], 'f1');
  assert.equal(writes['puphotos/u/me1/items/2026/p1/customKind'], 'k1');
  /* 같은 칸을 쓰면 하나가 다른 하나를 덮는다 — 「회의사진이면서 ○○건」이 깨진다 */
});

/* ── 화면 ── */
test('★ 남의 사진을 볼 때는 폴더 칸을 숨긴다', () => {
  const m = html.match(/function renderFolders\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderFolders 가 없습니다.');
  assert.ok(/if \(viewingOther\(\)\) \{ wrap\.style\.display = 'none'; return; \}/.test(m[0]),
    '남의 정리 방식을 내 화면에 늘어놓으면 안 됩니다.');
  const l = html.match(/function loadFolders\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(viewingOther\(\)\)/.test(l[0]), '남의 폴더를 읽으려 들면 규칙이 막습니다.');
});

test('★ 폴더와 분류 탭이 함께 걸린다 (다른 축)', () => {
  const m = html.match(/function shownItems\(\)[\s\S]*?\n\}/);
  assert.ok(/folderPick !== 'all'/.test(m[0]), '폴더로 좁혀 보는 길이 없습니다.');
  assert.ok(/kindTab !== 'all'/.test(m[0]), '분류 탭 거르기가 사라졌습니다.');
  const f = m[0].indexOf('folderPick'), k = m[0].indexOf('kindTab');
  assert.ok(f > 0 && k > 0, '둘 다 있어야 합니다 — 하나만 남으면 다른 축이 사라집니다.');
});

test('★ 지워진 폴더를 보고 있었으면 「전체」로 돌아간다', () => {
  const m = html.match(/function loadFolders\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(folderPick !== 'all' && !FOLDERS\[folderPick\]\) folderPick = 'all'/.test(m[0]),
    '없는 폴더를 보고 있으면 사진이 하나도 없는 빈 화면이 됩니다.');
});

test('폴더에 끌어다 놓을 수 있다 — 「전체」에 놓으면 뺀다', () => {
  const m = html.match(/\$\('foldList'\)\.addEventListener\('drop'[\s\S]*?\n\}\);/);
  assert.ok(m, '끌어다 놓기가 없습니다.');
  assert.ok(/moveToFolder\(ids, fid === 'all' \? null : fid\)/.test(m[0]),
    '「전체」에 놓으면 폴더에서 빠져야 합니다 — 되돌리는 길이 있어야 합니다.');
});

test('★ 남의 사진은 폴더에 넣지 못한다', () => {
  const m = html.match(/function moveToFolder\(ids, fid\)[\s\S]*?\n\}/);
  assert.ok(/if \(viewingOther\(\)\) return;/.test(m[0]),
    '남의 사진을 내 폴더에 넣으면 그 사람 자리에 쓰게 됩니다.');
});

test('지울 때 사진은 안 지워진다고 알려 준다', () => {
  const m = html.match(/function editFolder\(fid\)[\s\S]*?\n\}/);
  assert.ok(/지워지지 않고/.test(m[0]),
    '폴더를 지우면 사진도 사라지는 줄 알고 못 지우십니다.');
});
