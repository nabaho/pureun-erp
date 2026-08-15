/* 사진첩 — 같이 볼 사람 (대표 지시 2026-08-08)
   사진은 사람별 자리에 갈려 있고 **서버가** 남의 자리를 막는다. 그래서 공유는
   「화면에 보여 주기」가 아니라 「규칙이 열어 주기」다.
     ① 사진 옆    …/items/{해}/{id}/shareWith/{받는사람}  → 그 한 장만 읽게 열린다
     ② 받는 사람  puphotos/sharedTo/{받는사람}/{id}        → 목록을 훑을 길
   ①만 있으면 남의 자리를 못 훑어서 공유받은 사진이 있는지조차 알 수 없다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(R, 'docs', 'firebase-rules-현재적용본.json'), 'utf8')).rules;

function fnFrom(name, ctx) {
  const m = store.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다.');
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  return ctx[name];
}
const plain = (o) => JSON.parse(JSON.stringify(o));

function ctxFor(wrote) {
  return {
    Object, Promise, Date, String,
    metaPath: (y, id) => 'm/' + y + '/' + id,
    sharedToPath: (uid, id) => 's/' + uid + (id ? '/' + id : ''),
    deps: { uid: 'me', db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } }
  };
}

/* ── 두 곳에 함께 적는가 ── */
test('★ 사진 옆과 받는 사람 자리에 함께 적는다', async () => {
  const wrote = [];
  const setShare = fnFrom('setShare', ctxFor(wrote));
  await setShare('2026', 'p1', ['u2'], []);
  assert.equal(wrote.length, 1, '한 묶음이어야 합니다 — 나눠서 하다 끊기면 반쪽이 남습니다.');
  const u = plain(wrote[0]);
  assert.equal(u['m/2026/p1/shareWith/u2'], true, '사진 옆 표시가 없으면 규칙이 안 열어 줍니다.');
  assert.equal(u['s/u2/p1'].owner, 'me');
  assert.equal(u['s/u2/p1'].year, '2026', '어느 해에 있는지 없으면 받는 사람이 못 찾습니다.');
});

test('★ 뺀 사람은 두 곳에서 다 지운다', async () => {
  const wrote = [];
  const setShare = fnFrom('setShare', ctxFor(wrote));
  await setShare('2026', 'p1', ['u2'], ['u2', 'u3']);
  const u = plain(wrote[0]);
  assert.equal(u['m/2026/p1/shareWith/u3'], null);
  assert.equal(u['s/u3/p1'], null, '한 곳만 지우면 목록에 유령이 남습니다.');
  assert.equal(u['m/2026/p1/shareWith/u2'], true, '남긴 사람은 그대로여야 합니다.');
});

test('나 자신은 공유 대상이 아니다', async () => {
  const wrote = [];
  const setShare = fnFrom('setShare', ctxFor(wrote));
  await setShare('2026', 'p1', ['me', 'u2'], []);
  const keys = Object.keys(plain(wrote[0]));
  assert.ok(!keys.some(k => k.indexOf('/me') >= 0), '내 사진을 나에게 공유할 이유가 없습니다.');
});

test('바뀐 것이 없으면 아무것도 안 쓴다', async () => {
  const wrote = [];
  const setShare = fnFrom('setShare', ctxFor(wrote));
  await setShare('2026', 'p1', [], []);
  assert.equal(wrote.length, 0);
});

/* ── 받은 목록 ── */
test('★ 한 장을 못 읽어도 나머지는 보인다', async () => {
  const idx = { a: { owner: 'u2', year: '2026' }, b: { owner: 'u3', year: '2025' }, c: {} };
  const ctx = {
    Object, Promise, String,
    metaPath: (y, id, owner) => owner + '/' + y + '/' + id,
    sharedToPath: () => 'idx',
    readOnce: (p) => {
      if (p === 'idx') return Promise.resolve(idx);
      if (p === 'u2/2026/a') return Promise.resolve({ takenAt: 1 });
      return Promise.reject(new Error('권한 없음'));   // b 는 공유가 풀렸다
    },
    deps: { uid: 'me', db: {} }
  };
  const listSharedToMe = fnFrom('listSharedToMe', ctx);
  const out = plain(await listSharedToMe());
  assert.deepEqual(Object.keys(out), ['a'], '못 읽은 한 장 때문에 목록이 통째로 비면 안 됩니다.');
  assert.equal(out.a.__ownerUid, 'u2', '누구 사진인지 붙어 있어야 합니다.');
  assert.equal(out.a.__sharedYear, '2026');
});

test('원본이 지워졌으면 목록에서 뺀다', async () => {
  const ctx = {
    Object, Promise, String,
    metaPath: () => 'x', sharedToPath: () => 'idx',
    readOnce: (p) => Promise.resolve(p === 'idx' ? { a: { owner: 'u2', year: '2026' } } : null),
    deps: { uid: 'me', db: {} }
  };
  const out = plain(await fnFrom('listSharedToMe', ctx)());
  assert.deepEqual(out, {}, '원본이 없는 유령이 남으면 열리지 않는 사진이 쌓입니다.');
});

/* ── 지울 때 뒷정리 ── */
test('★ 사진을 지우면 같이 보던 사람 목록에서도 뺀다', () => {
  /* 2026-08-13 창고 저장으로 deletePhoto 는 分기만 하고, 실제 지우기는
     deleteStorageMeta(창고 사진)·deleteRtdbBody(옛 방식) 두 갈래로 나뉘었다 —
     뒷정리는 두 갈래 모두에 있어야 어느 쪽으로 지워도 유령이 안 남는다. */
  const m = store.match(/function deletePhoto[\s\S]*?function deleteRtdbBody[\s\S]*?\n  \}/);
  assert.ok(/meta && meta\.shareWith/.test(m[0]) && /sharedToPath\(who, id\)\] = null/.test(m[0]),
    '안 빼면 원본이 없는 유령이 「나와 공유된 사진」을 채웁니다.');
});

/* ── 규칙 ── */
test('★ 받는 사람이 그 한 장만 읽는다 (목록은 못 읽는다)', () => {
  const u = rules.puphotos.u['$uid'];
  assert.ok(u.items && u.items['$year'] && u.items['$year']['$id'], '사진 한 장 규칙이 없습니다.');
  const r = u.items['$year']['$id']['.read'];
  assert.ok(/shareWith'\)\.child\(auth\.uid\)\.exists\(\)/.test(r),
    '공유 표시를 보고 열어 줘야 합니다.');
  /* 부모(items·년) 에는 새 .read 를 달지 않는다 — 달면 남의 사진이 통째로 열린다 */
  assert.ok(!u.items['.read'] && !u.items['$year']['.read'],
    '★ 위쪽에 읽기를 열면 남의 사진이 전부 보입니다.');
});

test('★ 사진 본문·미리보기도 같은 조건으로 열린다', () => {
  const u = rules.puphotos.u['$uid'];
  ['blobs', 'thumbs'].forEach(function (k) {
    const r = (((u[k] || {})['$year'] || {})['$id'] || {})['.read'];
    assert.ok(r, k + ' 규칙이 없습니다 — 정보만 읽히고 사진은 안 보입니다.');
    assert.ok(/items'\)\.child\(\$year\)\.child\(\$id\)\.child\('shareWith'\)/.test(r),
      k + ' 가 사진 옆 공유 표시를 봐야 합니다.');
  });
});

test('★ 받는 사람 목록은 본인과 관리자만 읽는다', () => {
  const st = rules.puphotos.sharedTo;
  assert.ok(st && st['$uid'], 'sharedTo 규칙이 없습니다.');
  const r = st['$uid']['.read'];
  assert.ok(/auth\.uid === \$uid/.test(r) && /isAdmin/.test(r));
});

test('★ 공유는 올린 사람만 걸고, 받는 사람도 뺄 수 있다', () => {
  const w = rules.puphotos.sharedTo['$uid']['$pid']['.write'];
  assert.ok(/newData\.child\('owner'\)\.val\(\) === auth\.uid/.test(w),
    '남이 남의 사진을 나에게 공유하게 두면 안 됩니다.');
  assert.ok(/auth\.uid === \$uid/.test(w), '받은 사람이 스스로 뺄 수 있어야 합니다.');
  const v = rules.puphotos.sharedTo['$uid']['$pid']['.validate'];
  assert.ok(/owner/.test(v) && /year/.test(v), '어느 해 누구 사진인지 없으면 못 찾습니다.');
});

/* ── 화면 ── */
test('★ 공유받은 사진은 고치거나 지울 수 없다', () => {
  assert.ok(/const SHARED_OWNER = '__shared__'/.test(html));
  /* viewingOther() 가 gridOwner 로 판정하므로 공유 모드도 자동으로 잠긴다 */
  const v = html.match(/function viewingOther\(\)[\s\S]*?\n\}/);
  assert.ok(/gridOwner !== PuPhotoStore\.myUid\(\)/.test(v[0]),
    '공유 모드에서도 올리기·지우기가 잠겨야 합니다.');
  const s = html.match(/async function setShareTo\(uids\)[\s\S]*?\n\}/);
  assert.ok(/viewingOther\(\)/.test(s[0]), '남의 사진을 내가 공유할 수는 없습니다.');
});

test('공유받은 사진에는 자동 판독을 안 돌린다', () => {
  const m = html.match(/function loadGrid\(\)[\s\S]*?\n\}/);
  assert.ok(/gridOwner !== SHARED_OWNER[\s\S]{0,40}autoReadPending/.test(m[0]),
    '남의 사진을 자동으로 건드리면 안 됩니다.');
});

test('★ 관리자가 아니어도 「나와 공유된 사진」을 볼 수 있다', () => {
  const m = html.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/);
  assert.ok(/!PuPhotoStore\.amAdmin\(\)[\s\S]{0,260}SHARED_OWNER/.test(m[0]),
    '관리자만 쓰는 기능이 아닙니다 — 직원끼리 주고받는 것이 목적입니다.');
});

test('규칙이 아직 없으면 무엇이 문제인지 말해 준다', () => {
  const s = html.match(/async function setShareTo\(uids\)[\s\S]*?\n\}/);
  assert.ok(/permission\|denied/.test(s[0]) && /규칙/.test(s[0]),
    '조용히 실패하면 대표님이 원인을 못 짚습니다(건의함 때 겪었습니다).');
});
