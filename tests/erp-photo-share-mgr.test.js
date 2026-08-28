'use strict';
/* 업무 담당자에게 사진을 열어 준다 — 대표 지시 2026-08-28

   "사진첩의 사진의 경우 푸른이알피에서 주담당 부담당으로 업무처리하는 경우
    공동으로 사진을 보고 공유할 수 있게 해달라."

   ■ 무엇이 막혀 있었나
   사진첩은 **사람별로 갈려** 있다. 찍은 사람 자리에 담기고, 남이 보려면 주인이
   「같이 볼 사람」에 넣어 줘야 한다. 그래서 부담당이 계약을 열어도 주담당이 붙인
   계약서 사진은 「원본을 열 수 없습니다 — 내가 올린 사진만 볼 수 있습니다」였다.

   ■ 대표 결정 (2026-08-28)
     ① 담당에서 **빠진 사람의 공유는 그대로 둔다** → 더하기만 한다
     ② 계약·사건·컨설팅·기금 **넷 다** → 담당 칸 모양이 같으니 함수 하나로

   ■ 지켜야 하는 것
     · 더하기만 한다(손으로 넣은 공유가 저장 한 번에 끊기면 안 된다)
     · **주인 자리**에 쓴다(남이 올린 계약서가 대부분이다)
     · 못 열어 줬으면 **말해 준다**(조용히 넘기면 「저장은 됐는데 저쪽은 못 본다」)
     · 저장을 되돌리지 않는다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

/* ⚠ vm 안에서 만든 배열은 바깥 배열과 «생김새는 같아도 다른 것»이라 deepEqual 이
   운다(realm 이 다르다). 값만 견준다. */
const same = function (a, b, m) { assert.equal(JSON.stringify(a), JSON.stringify(b), m); };

const R = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ══════ ① 저장 층 — 더하기만, 주인 자리에 ══════ */

function loadStore(uid) {
  const ctx = { Object, String, Date, Promise, Error, console: { warn() {} } };
  ctx.deps = { db: null, uid: uid || 'ME' };
  ctx._u = null;
  ctx.deps.db = {
    ref: function () {
      return { update: function (u) { ctx._u = u; return Promise.resolve(); } };
    }
  };
  ctx.metaPath = function (year, id, owner) {
    return 'puphotos/u/' + (owner || ctx.deps.uid) + '/items/' + year + '/' + id;
  };
  ctx.sharedToPath = function (who, id) { return 'puphotos/sharedTo/' + who + '/' + id; };
  vm.createContext(ctx);
  vm.runInContext(cutFn(store, 'function addShare('), ctx);
  return ctx;
}

test('★ 남의 사진이면 «주인 자리»에 쓴다 — 내 자리에 쓰면 아무 일도 안 일어난다', async () => {
  const c = loadStore('ME');
  const added = await c.addShare('2026', 'p1', ['U2', 'U3'], 'OWNER', '푸른이알피 계약 — 야성건설');
  same(added, ['U2', 'U3']);
  assert.equal(c._u['puphotos/u/OWNER/items/2026/p1/shareWith/U2'], true);
  assert.equal(c._u['puphotos/u/OWNER/items/2026/p1/shareWith/U3'], true);
  assert.ok(!Object.keys(c._u).some(function (k) { return k.indexOf('/u/ME/') >= 0; }),
    '★ 내 자리에 썼습니다 — 남의 사진은 그러면 안 열립니다');
});

test('★ 받는 사람 자리에도 적는다 — 한쪽만 적으면 「나와 공유된 사진」에 안 뜬다', () => {
  const c = loadStore('ME');
  return c.addShare('2026', 'p1', ['U2'], 'OWNER', '계약').then(function () {
    const r = c._u['puphotos/sharedTo/U2/p1'];
    assert.ok(r, '★ 받는 사람 자리가 비었습니다');
    assert.equal(r.owner, 'OWNER', '★ 주인을 «내»가 아니라 사진 주인으로 적어야 합니다');
    assert.equal(r.year, '2026');
  });
});

test('★ 더하기만 한다 — 손으로 넣은 공유가 저장 한 번에 끊기면 안 된다 (대표 결정)', () => {
  const c = loadStore('ME');
  return c.addShare('2026', 'p1', ['U2'], 'OWNER', '계약').then(function () {
    const nulls = Object.keys(c._u).filter(function (k) { return c._u[k] === null; });
    same(nulls, [],
      '★ 무언가를 지우고 있습니다 — 담당에서 빠진 사람은 그대로 두기로 했습니다');
  });
});

test('★ 왜 열렸는지 남긴다 — 손으로 넣은 사람과 갈라야 ✕ 를 망설이지 않는다', () => {
  const c = loadStore('ME');
  return c.addShare('2026', 'p1', ['U2'], 'OWNER', '푸른이알피 계약 — 야성건설').then(function () {
    assert.equal(c._u['puphotos/u/OWNER/items/2026/p1/shareBy/U2'], '푸른이알피 계약 — 야성건설');
  });
});

test('주인 자신·빈 값·중복은 걸러 낸다', async () => {
  const c = loadStore('ME');
  const added = await c.addShare('2026', 'p1', ['OWNER', '', null, 'U2', 'U2'], 'OWNER', '계약');
  same(added, ['U2'], '★ 주인을 넣으면 「같이 볼 사람」에 자기 이름이 뜹니다');
});

test('넣을 사람이 없으면 아무것도 안 쓴다 — 헛되이 두드리지 않는다', async () => {
  const c = loadStore('ME');
  const added = await c.addShare('2026', 'p1', [], 'OWNER', '계약');
  same(added, []);
  assert.equal(c._u, null, '★ 빈 쓰기를 보냈습니다');
});

test('사진을 모르면 거절한다 — 엉뚱한 자리에 쓰지 않는다', async () => {
  const c = loadStore('ME');
  await assert.rejects(function () { return c.addShare('', 'p1', ['U2'], 'OWNER', 'x'); });
  await assert.rejects(function () { return c.addShare('2026', '', ['U2'], 'OWNER', 'x'); });
});

test('★ 공유를 풀면 «왜 열렸는지»도 함께 지운다 — 안 지우면 다음에 잘못 적힌다', () => {
  const set = cutFn(store, 'function setShare(');
  assert.match(set, /shareBy\/' \+ who\] = null/,
    '★ 뺀 사람의 설명이 남아, 나중에 손으로 넣어도 「계약 담당」으로 보입니다');
});

/* ══════ ② 푸른이알피 — 사번을 계정으로 바꿔 담당자에게 ══════ */

function loadErp(map) {
  const calls = { toast: [], share: [] };
  const ctx = {
    Object, String, Date, Promise, console: { warn() {} },
    showToast: function (m, d) { calls.toast.push([m, d]); },
    userName: function (sid) { return '사원' + sid; },
    fbDb: { ref: function () { return { once: function () { return Promise.resolve({ val: function () { return null; } }); } }; } },
    PuPhotoStore: {
      addShare: function (year, id, uids, owner, why) {
        calls.share.push({ year: year, id: id, uids: uids, owner: owner, why: why });
        return Promise.resolve(uids);
      }
    },
    _calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(erp, 'function erpMgrSids(') + '\n' +
    cutFn(erp, 'function erpSharePhotoWithMgrs('), ctx);
  /* 사번→계정 대조표는 미리 채워 둔 것으로 바꿔 끼운다 */
  ctx.erpUidBySid = function () { return Promise.resolve(map || {}); };
  return ctx;
}

const PH = { id: 'p1', year: '2026', owner: 'OWNER', ownerName: '권형하' };

test('★ 주담당과 부담당 «전부»에게 연다 — 부담당이 계약을 열어도 못 보던 것', async () => {
  const c = loadErp({ s1: 'U1', s2: 'U2', s3: 'U3' });
  c.erpSharePhotoWithMgrs(PH, { managerMain: 's1', managerSubs: ['s2', 's3'] }, '계약 — 야성건설');
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.equal(c._calls.share.length, 1);
  same(c._calls.share[0].uids, ['U1', 'U2', 'U3']);
  assert.equal(c._calls.share[0].owner, 'OWNER', '★ 주인을 안 넘기면 내 자리에 씁니다');
  assert.equal(c._calls.share[0].why, '계약 — 야성건설');
});

test('주담당이 부담당에도 들어 있으면 한 번만 — 같은 사람을 두 번 넣지 않는다', () => {
  const c = loadErp({ s1: 'U1' });
  same(c.erpMgrSids({ managerMain: 's1', managerSubs: ['s1'] }), ['s1']);
});

test('담당이 없으면 아무 일도 안 한다 — 헛되이 대조표를 읽지 않는다', async () => {
  const c = loadErp({ s1: 'U1' });
  c.erpSharePhotoWithMgrs(PH, { managerMain: '', managerSubs: [] }, 'x');
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.equal(c._calls.share.length, 0);
});

test('★ 한 번도 로그인 안 한 사람은 «그 사실을 말해 준다» — 조용히 빠뜨리면 못 찾는다', async () => {
  const c = loadErp({ s1: 'U1' });          // s2 는 계정이 없다
  c.erpSharePhotoWithMgrs(PH, { managerMain: 's1', managerSubs: ['s2'] }, '계약');
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  const said = c._calls.toast.map(function (t) { return t[0]; }).join(' | ');
  assert.match(said, /사원s2/, '★ 누가 못 봤는지 이름을 안 말합니다');
  assert.match(said, /로그인/, '★ 왜 못 열었는지 안 말합니다');
});

test('★ 아무도 계정이 없으면 열지 않고 말만 한다 — 빈 목록을 저장 층에 던지지 않는다', async () => {
  const c = loadErp({});
  c.erpSharePhotoWithMgrs(PH, { managerMain: 's9', managerSubs: [] }, '계약');
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.equal(c._calls.share.length, 0);
  assert.ok(c._calls.toast.length, '★ 조용히 넘어갔습니다');
});

test('★ 권한이 없어 거절당하면 «누가 무엇을 해야 하는지» 적어 준다', async () => {
  const c = loadErp({ s1: 'U1' });
  c.PuPhotoStore.addShare = function () { return Promise.reject(new Error('PERMISSION_DENIED')); };
  c.erpSharePhotoWithMgrs(PH, { managerMain: 's1', managerSubs: [] }, '계약');
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  const said = c._calls.toast.map(function (t) { return t[0]; }).join(' | ');
  assert.match(said, /권형하/, '★ 누가 열어 줘야 하는지 이름을 안 말합니다');
  assert.match(said, /같이 볼 사람/, '★ 무엇을 해야 하는지 안 말합니다');
});

test('사진이 없으면 아무 일도 안 한다', () => {
  const c = loadErp({ s1: 'U1' });
  c.erpSharePhotoWithMgrs(null, { managerMain: 's1' }, 'x');
  c.erpSharePhotoWithMgrs({ id: 'p1' }, { managerMain: 's1' }, 'x');   // 해가 없다
  assert.equal(c._calls.share.length, 0);
});

/* ══════ ③ 배선 ══════ */

test('★ 계약을 저장할 때 부른다 — 만들고 안 부르면 아무것도 안 바뀐다', () => {
  const i = erp.indexOf('var _sp = saveData && saveData.srcPhoto;');
  assert.ok(i > 0, '계약 저장 자리를 찾지 못했습니다');
  const seg = erp.slice(i, i + 1400);
  assert.match(seg, /erpSharePhotoWithMgrs\(_sp, saveData, _where\)/,
    '★ 담당자에게 여는 길을 안 부릅니다');
  /* 저장이 «된 뒤»라야 한다 — 「적용」만 누르고 그만둔 것을 공유하면 안 된다 */
  assert.ok(erp.indexOf('savedRef.value = true;') < i, '★ 저장 전에 공유하고 있습니다');
});

test('★ 「증빙으로 썼다」도 주인 자리에 남긴다 — 남의 사진이면 안 남던 것', () => {
  const i = erp.indexOf('var _sp = saveData && saveData.srcPhoto;');
  const seg = erp.slice(i, i + 1400);
  assert.match(seg, /markUsed\(_sp\.year, _sp\.id, _where, _sp\.owner \|\| ''\)/,
    '★ 주인을 안 넘기면 남이 올린 계약서는 1년 뒤 「지난 사진」으로 뜹니다');
});

test('★ 사번→계정 대조표는 한 곳뿐이다 — 두 벌이면 한쪽만 고쳐진다', () => {
  assert.match(cutFn(erp, 'function pcfLoadUidMap('), /return erpUidBySid\(\);/,
    '★ 성과확인이 대조표를 따로 읽고 있습니다');
  const n = (erp.match(/ref\('uid_roles'\)\.once/g) || []).length;
  assert.equal(n, 1, '★ uid_roles 를 읽는 자리가 ' + n + '곳입니다');
});

test('계정이 여럿이면 가장 최근 것을 쓴다', () => {
  assert.match(cutFn(erp, 'function erpUidBySid('), /t > best\[r\.sid\]\.t/);
});

/* ══════ ④ 사진첩 — 왜 열려 있는지 보인다 ══════ */

function why(meta, uid) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cutFn(photos, 'function shareWhy('), ctx);
  return ctx.shareWhy({ meta: meta }, uid);
}

test('★ 업무로 열린 사람에게는 표가 붙는다 — 손으로 넣은 사람과 갈라야 한다', () => {
  assert.equal(why({ shareBy: { U2: '푸른이알피 계약 — 야성건설' } }, 'U2'), '계약');
  assert.equal(why({ shareBy: {} }, 'U2'), '', '손으로 넣은 사람에게 표가 붙었습니다');
  assert.equal(why({}, 'U2'), '', '옛 공유(설명 없음)에서 넘어졌습니다');
  assert.equal(why(null, 'U2'), '');
});

test('★ 화면이 그 표를 실제로 그린다', () => {
  const box = cutFn(photos, 'function shareBox(');
  assert.match(box, /shareWhy\(it, uid\)/, '★ 표를 안 그립니다');
  assert.match(box, /class="auto"/, '표에 눈에 띄는 자리가 없습니다');
  assert.match(box, /업무 때문에/, '★ 왜 있는지 한 줄 설명이 없습니다');
  assert.match(photos, /\.sharebox \.sc \.auto\{/, '표 모양(CSS)이 없습니다');
});
