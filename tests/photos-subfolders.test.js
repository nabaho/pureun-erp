/* 하위폴더 · ⋯ 차림표 · ⓘ 팝업 — 대표 지시 2026-08-10
   "폴더 만드는 기능과 삭제 기능 만들어주고 만든폴더 안에 하위폴더도 만들 수 있게 해줘.
    캡쳐3의 내용은 팝업으로 해주고 전체적으로 대시보드 정리 좀해줘"

   ⚠ 하위폴더는 **한 단계까지**다(대표 승인 목업) — 좁은 칸에서 계속 파고들면
      「어디 뒀더라」가 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const html = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function loadStore(uid) {
  const writes = {}, reads = {};
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

test('★ 하위폴더를 만든다 — 어버이를 적어 둔다', async () => {
  const { S, writes } = loadStore('me1');
  const r = await S.addFolder('현장사진', 'top1');
  const key = Object.keys(writes)[0];
  assert.equal(writes[key].parent, 'top1', '어버이를 안 적으면 맨 위 폴더가 됩니다.');
  assert.equal(r.parent, 'top1');
});

test('★ 하위폴더 밑에는 또 못 만든다 — 한 단계 위로 붙인다', async () => {
  const { S, reads, writes } = loadStore('me1');
  reads['puphotos/u/me1/folders'] = { top1: { name: '㈜가야' }, kid1: { name: '현장', parent: 'top1' } };
  const r = await S.addFolder('8월', 'kid1');
  assert.equal(r.parent, 'top1', '좁은 칸에서 계속 파고들면 어디 뒀는지 모르게 됩니다.');
  const key = Object.keys(writes).find(k => k.indexOf('/folders/') > 0);
  assert.equal(writes[key].parent, 'top1');
});

test('같은 이름도 어버이가 다르면 따로 만든다', async () => {
  const { S, reads } = loadStore('me1');
  reads['puphotos/u/me1/folders'] = { a: { name: '현장사진', parent: 'top1' } };
  const r = await S.addFolder('현장사진', 'top2');
  assert.equal(r.created, true, '㈜가야 밑과 8월교육 밑의 현장사진은 다른 것입니다.');
});

test('같은 어버이 안에서는 같은 이름을 또 안 만든다', async () => {
  const { S, reads } = loadStore('me1');
  reads['puphotos/u/me1/folders'] = { a: { name: '현장사진', parent: 'top1' } };
  const r = await S.addFolder(' 현장사진 ', 'top1');
  assert.equal(r.created, false);
  assert.equal(r.id, 'a');
});

test('★ 어버이를 지우면 하위폴더도 함께 지운다 (고아 방지)', async () => {
  const { S, reads, writes } = loadStore('me1');
  reads['puphotos/u/me1/folders'] = {
    top1: { name: '㈜가야' }, k1: { name: '현장', parent: 'top1' }, k2: { name: '서류', parent: 'top1' },
    other: { name: '8월 교육' }
  };
  await S.deleteFolder('top1');
  assert.equal(writes['puphotos/u/me1/folders/top1'], null);
  assert.equal(writes['puphotos/u/me1/folders/k1'], null, '어버이만 지우면 하위폴더가 고아가 됩니다.');
  assert.equal(writes['puphotos/u/me1/folders/k2'], null);
  assert.ok(!('puphotos/u/me1/folders/other' in writes), '남의 폴더까지 지우면 안 됩니다.');
});

test('★ 사진을 어버이로 올린다 (사라지지 않게)', async () => {
  const { S, writes } = loadStore('me1');
  await S.moveFolderPhotos('2026', ['p1', 'p2'], 'top1');
  assert.equal(writes['puphotos/u/me1/items/2026/p1/folder'], 'top1');
  assert.equal(writes['puphotos/u/me1/items/2026/p2/folder'], 'top1');
  await S.moveFolderPhotos('2026', ['p3'], null);
  assert.equal(writes['puphotos/u/me1/items/2026/p3/folder'], null, '맨 위 폴더면 전체로 갑니다.');
});

/* ── 화면 ── */
test('★ 상위를 고르면 하위까지 함께 보인다', () => {
  const m = html.match(/function shownItemsFresh\(\)[\s\S]*?\n\}/);
  assert.ok(/FOLDERS\[g\] && FOLDERS\[g\]\.parent === folderPick/.test(m[0]),
    '나눠 놓고도 한눈에 볼 수 있어야 합니다(대표 승인 목업).');
});

test('★ ⋯ 차림표에 만들기·이름 바꾸기·지우기가 다 있다', () => {
  const m = html.match(/function folderMenu\(ev, fid\)[\s\S]*?\n\}/);
  assert.ok(m, 'folderMenu 가 없습니다.');
  assert.ok(/renameFolderAsk/.test(m[0]), '이름 바꾸기가 없습니다.');
  assert.ok(/newFolder\(/.test(m[0]), '하위폴더 만들기가 없습니다.');
  assert.ok(/removeFolderAsk/.test(m[0]),
    '이름을 비워 지우는 손짓은 알아채기 어려웠습니다 — 지우기가 차림표에 있어야 합니다.');
});

test('하위폴더에는 「하위폴더 만들기」를 안 보여 준다', () => {
  const m = html.match(/function folderMenu\(ev, fid\)[\s\S]*?\n\}/);
  assert.ok(/f\.parent \? '' :/.test(m[0]), '한 단계까지인데 만들기를 보여 주면 헷갈립니다.');
});

test('차림표는 눌러서 닫히고, 새로 열 때 겹치지 않는다', () => {
  const m = html.match(/function folderMenu\(ev, fid\)[\s\S]*?\n\}/);
  assert.ok(/closeFolderMenu\(\);/.test(m[0]), '열 때 이전 것을 안 닫으면 겹칩니다.');
  assert.ok(/addEventListener\('click', closeFolderMenu, \{ once: true \}\)/.test(m[0]),
    '바깥을 눌러도 안 닫히면 화면에 남습니다.');
});

test('★ 올리기 안내는 ⓘ 팝업으로 옮겼다', () => {
  assert.ok(/onclick="openUpHelp\(\)"/.test(html), 'ⓘ 단추가 없습니다.');
  assert.ok(/function openUpHelp\(\)/.test(html), '팝업을 여는 길이 없습니다.');
  assert.ok(!/class="dochint"/.test(html), '늘 자리를 먹던 안내가 남아 있습니다.');
  assert.ok(!/id="dropHint"/.test(html), '끌어다 놓기 안내도 팝업으로 갔어야 합니다.');
});

test('★ 없앤 안내 칸을 아무도 안 부른다 (하얀 화면 되풀이 방지)', () => {
  for (const gone of ['maxHint', 'maxHintS', 'dropHint']) {
    assert.ok(!new RegExp("\\$\\('" + gone + "'\\)").test(html),
      '없앤 칸을 부르고 있습니다: ' + gone + ' — 맨 위에서 나는 오류 하나에 화면이 통째로 빕니다.');
  }
});
