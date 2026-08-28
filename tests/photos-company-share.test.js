'use strict';
/* 「승진텍라인 사진만」 업체 담당자와 공유 — 대표 지시 2026-08-28

   "승진텍라인 주담당 부담당 같이 되어 있는데 부담당과 같이 공유하려면 사진첩에서
    어떻게 하는게 공유가 될까. 승진텍라인 사진만 공유하고 싶다. 자동으로 어떻게?"

   ■ 막혀 있던 것 둘
     ① **회의·현장 사진에는 업체가 안 적혀 있다.** 찾기는 사진에 적힌 업체로 찾으므로
        「승진텍라인」을 쳐도 서류만 나오고 방문 사진은 안 걸린다.
     ② **공유가 한 장씩이었다.** 「같이 볼 사람」은 크게 보기 안에만 있었다.

   ■ 대표 결정: 이미 올라와 있는 사진은 **㉮ 그대로 둔다** — 훑어서 한꺼번에 걸지 않는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

/* vm 안에서 만든 배열은 바깥 것과 다른 것이라 deepEqual 이 운다 — 값만 견준다 */
const same = function (a, b, m) { assert.equal(JSON.stringify(a), JSON.stringify(b), m); };

const R = path.join(__dirname, '..');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

/* ══════ ① 업체를 «이름»으로 찾는다 ══════ */

function coCtx(companies) {
  const ctx = { Object, String, Array, Promise, Error, console: { warn() {} } };
  ctx.ERP_CO = 'data/companies';
  ctx.deps = { db: { ref: function () {
    return { once: function () { return Promise.resolve({ val: function () { return companies; } }); } };
  } } };
  vm.createContext(ctx);
  vm.runInContext(cutFn(docFile, 'function eachCompany(') + '\n' +
    cutFn(docFile, 'function coNameKey(') + '\n' +
    cutFn(docFile, 'function findCompanyByName(') + '\n' +
    cutFn(docFile, 'function companyMgrSids('), ctx);
  return ctx;
}

test('★ 표기가 달라도 같은 업체로 잡는다 — 사람이 치는 꼴은 제각각이다', () => {
  const c = coCtx(null);
  const k = c.coNameKey('승진텍라인');
  ['(주)승진텍라인', '승진텍 라인', '주식회사 승진텍라인', '승진텍라인㈜', ' 승진텍라인 ']
    .forEach(function (v) {
      assert.equal(c.coNameKey(v), k, '★ 「' + v + '」이 다른 업체로 잡힙니다');
    });
  assert.notEqual(c.coNameKey('승진텍'), k, '다른 이름까지 같게 보면 안 됩니다');
});

test('★ 이름으로 그 업체를 찾는다', async () => {
  const c = coCtx([{ id: 'c1', name: '가야엔지니어링' }, { id: 'c2', name: '(주)승진텍라인' }]);
  const hit = await c.findCompanyByName('승진텍라인');
  assert.ok(hit, '★ 못 찾으면 담당자를 알 수 없습니다');
  assert.equal(hit.rec.id, 'c2');
});

test('★ 같은 이름이 둘이면 «아무것도 안 한다» — 남의 업체 담당자에게 열리면 안 된다', async () => {
  const c = coCtx([{ id: 'c1', name: '승진텍라인' }, { id: 'c2', name: '(주)승진텍라인' }]);
  assert.equal(await c.findCompanyByName('승진텍라인'), null,
    '★ 둘 중 하나를 골라 버리면 엉뚱한 업체 담당자에게 사진이 열립니다');
});

test('없는 업체·빈 이름은 조용히 빈손', async () => {
  const c = coCtx([{ id: 'c1', name: '가야엔지니어링' }]);
  assert.equal(await c.findCompanyByName('승진텍라인'), null);
  assert.equal(await c.findCompanyByName(''), null);
  assert.equal(await c.findCompanyByName(null), null);
});

test('업체 목록이 배열이든 객체든 다 훑는다 — 푸른이알피가 옮겨 가는 중이다', async () => {
  const asObj = coCtx({ k1: { id: 'c1', name: '승진텍라인' } });
  assert.ok(await asObj.findCompanyByName('승진텍라인'));
  const wrapped = coCtx({ v: [{ id: 'c1', name: '승진텍라인' }] });
  assert.ok(await wrapped.findCompanyByName('승진텍라인'), '★ v 로 감싼 꼴을 못 읽습니다');
});

test('★ 주담당·부담당을 다 준다 — 부담당이 빠지면 이 기능의 뜻이 없다', () => {
  const c = coCtx(null);
  same(c.companyMgrSids({ managerMain: 's1', managerSubs: ['s2', 's3'] }), ['s1', 's2', 's3']);
  same(c.companyMgrSids({ managerMain: 's1', managerSubs: ['s1'] }), ['s1'], '두 번 넣지 않는다');
  same(c.companyMgrSids({ managerSubs: ['s2'] }), ['s2'], '주담당이 없어도 부담당은 준다');
  same(c.companyMgrSids(null), []);
  same(c.companyMgrSids({}), []);
});

/* ══════ ② 사진이 어느 업체 것인가 ══════ */

function photoCtx(items) {
  const ctx = { Object, String, Array, console: { warn() {} } };
  ctx.gridItems = items || [];
  vm.createContext(ctx);
  vm.runInContext(cutFn(photos, 'function coNameOf(') + '\n' +
    cutFn(photos, 'function oneCoOf('), ctx);
  return ctx;
}

test('★ 사람이 적은 업체가 먼저, 없으면 판독이 읽은 상호', () => {
  const c = photoCtx([]);
  assert.equal(c.coNameOf({ meta: { company: '승진텍라인' } }), '승진텍라인');
  assert.equal(c.coNameOf({ meta: { read: { fields: { company: '가야엔지니어링' } } } }),
    '가야엔지니어링', '★ 서류는 판독이 읽은 상호로 저절로 걸려야 합니다');
  assert.equal(c.coNameOf({ meta: { company: '손으로', read: { fields: { company: '판독' } } } }),
    '손으로', '사람이 적은 것이 판독보다 먼저다');
  assert.equal(c.coNameOf({ meta: {} }), '', '회의사진은 업체가 없다');
  assert.equal(c.coNameOf(null), '');
});

test('★ 고른 것이 여러 업체면 «섞였다»고 본다 — 엉뚱한 담당자에게 열리면 안 된다', () => {
  const c = photoCtx([
    { id: 'a', meta: { company: '승진텍라인' } },
    { id: 'b', meta: { company: '승진텍라인' } },
    { id: 'c', meta: { company: '가야엔지니어링' } },
    { id: 'd', meta: {} }
  ]);
  assert.equal(c.oneCoOf(['a', 'b']), '승진텍라인');
  assert.equal(c.oneCoOf(['a', 'd']), '승진텍라인', '업체가 없는 사진은 셈에서 빠진다');
  assert.equal(c.oneCoOf(['a', 'c']), '', '★ 섞였는데 한 업체로 보면 남의 담당자에게 열립니다');
  assert.equal(c.oneCoOf(['d']), '');
  assert.equal(c.oneCoOf([]), '');
});

/* ══════ ③ 자동 공유 ══════ */

function autoCtx(over) {
  const calls = { toast: [], share: [] };
  const o = over || {};
  const ctx = {
    Object, String, Array, Promise, console: { warn() {} },
    gridItems: o.items || [],
    ownerNames: { U2: '이몽룡', U3: '성춘향' },
    toast: function (m) { calls.toast.push(m); },
    photoYearOf: function () { return '2026'; },
    photoOwner: function () { return 'OWNER'; },
    PuPhotoStore: {
      myUid: function () { return 'ME'; },
      addShare: function (year, id, uids, owner, why) {
        calls.share.push({ id: id, uids: uids, owner: owner, why: why });
        return o.fail ? Promise.reject(new Error('PERMISSION_DENIED')) : Promise.resolve(uids);
      }
    },
    _calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(photos, 'function autoShareByCo('), ctx);
  ctx.coMgrsFor = function () { return Promise.resolve(o.mgrs === undefined ? { co: {}, sids: ['s1'], uids: ['U2'], noAcct: [] } : o.mgrs); };
  return ctx;
}
const tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

test('★ 업체를 달면 그 업체 담당자에게 «고른 전부»가 열린다', async () => {
  const c = autoCtx({});
  await c.autoShareByCo(['p1', 'p2', 'p3'], '승진텍라인');
  assert.equal(c._calls.share.length, 3, '★ 한 장만 열었습니다');
  same(c._calls.share[0].uids, ['U2']);
  assert.equal(c._calls.share[0].owner, 'OWNER', '★ 주인 자리에 써야 남의 사진도 열립니다');
  assert.equal(c._calls.share[0].why, '승진텍라인 담당', '★ 왜 열렸는지 안 남기면 손으로 넣은 것과 안 갈립니다');
  assert.match(c._calls.toast.join(' '), /이몽룡/, '누구에게 열었는지 말해야 합니다');
});

test('업체를 못 찾으면 아무 일도 안 한다 — 애매하면 안 여는 것이 맞다', async () => {
  const c = autoCtx({ mgrs: null });
  await c.autoShareByCo(['p1'], '없는업체');
  assert.equal(c._calls.share.length, 0);
});

test('★ 담당자가 로그인한 적 없으면 «그 사실을 말해 준다»', async () => {
  const c = autoCtx({ mgrs: { co: {}, sids: ['s1'], uids: [], noAcct: ['s1'] } });
  await c.autoShareByCo(['p1'], '승진텍라인');
  assert.equal(c._calls.share.length, 0);
  assert.match(c._calls.toast.join(' '), /로그인/, '★ 조용히 넘기면 「왜 저 사람만 못 보지」가 됩니다');
});

test('나 자신은 빼고 연다 — 내 사진에 내 이름이 뜨면 안 된다', async () => {
  const c = autoCtx({ mgrs: { co: {}, sids: ['s1'], uids: ['ME'], noAcct: [] } });
  await c.autoShareByCo(['p1'], '승진텍라인');
  assert.equal(c._calls.share.length, 0);
});

test('★ 권한이 없어 다 막히면 그 사실을 말한다 — 조용히 넘기면 못 본 줄 모른다', async () => {
  const c = autoCtx({ fail: true });
  await c.autoShareByCo(['p1'], '승진텍라인');
  assert.match(c._calls.toast.join(' '), /내가 올린 사진/, '★ 왜 안 됐는지 안 말합니다');
});

test('업체가 없거나 고른 것이 없으면 대조표를 읽지 않는다 — 헛되이 돈이 나간다', async () => {
  const c = autoCtx({});
  await c.autoShareByCo([], '승진텍라인');
  await c.autoShareByCo(['p1'], '');
  assert.equal(c._calls.share.length, 0);
});

/* ══════ ④ 배선 ══════ */

test('★ 도구줄에 두 단추가 있고, 고른 것이 있을 때만 보인다', () => {
  assert.match(photos, /id="coBtn"[^>]*onclick="openSetCo\(\)"/, '★ 업체 지정 단추가 없습니다');
  assert.match(photos, /id="shareBtn"[^>]*onclick="openShareMany\(\)"/, '★ 공유 단추가 없습니다');
  const bar = cutFn(photos, 'function renderGridBar(');
  /* ⚠ 「'coBtn', 'shareBtn'」만 찾으면 안 된다 — 아래 «남의 사진 숨기기» 줄에도 같은
     글자가 있어, 보여 주는 줄에서 빠져도 그쪽이 검사를 통과시킨다(2026-08-28 되돌림에서
     실제로 새어 나갔다). **그 줄**을 통째로 못박는다. */
  assert.match(bar, /'selCancel', 'tagBtn',\s*'coBtn', 'shareBtn'\]\.forEach/,
    '★ 고른 것이 있을 때 안 나옵니다');
});

test('★ 남의 사진에는 두 단추를 안 내준다 — 눌러도 거절당할 단추는 고장으로 읽힌다', () => {
  const bar = cutFn(photos, 'function renderGridBar(');
  const i = bar.indexOf('viewingOther()');
  assert.ok(i > 0);
  assert.match(bar.slice(i, i + 260), /'tagBtn', 'coBtn', 'shareBtn'/,
    '★ 남의 사진에서도 업체 지정·공유가 보입니다');
});

test('★ 업체를 단 «그 순간» 자동 공유가 걸린다 — 만들고 안 부르면 아무것도 안 바뀐다', () => {
  const fn = cutFn(photos, 'function submitSetCo(');
  assert.ok(fn, 'submitSetCo 를 찾지 못했습니다');
  assert.match(fn, /autoShareByCo\(ids, name\)/, '★ 자동 공유를 안 부릅니다');
  assert.match(fn, /PuPhotoStore\.saveNote\(/, '업체를 저장하지 않습니다');
  /* 저장이 «된 뒤»라야 한다 — 안 달린 업체로 담당자를 찾으면 안 된다 */
  assert.ok(fn.indexOf('saveNote') < fn.indexOf('autoShareByCo'),
    '★ 업체를 달기 전에 공유하고 있습니다');
});

test('★ 공유 창은 그 업체 담당자를 «미리 골라» 둔다 — 누구인지 찾아 헤매지 않게', () => {
  const fn = cutFn(photos, 'function openShareMany(');
  assert.match(fn, /coMgrsFor\(coName\)/, '★ 담당자를 안 알아봅니다');
  assert.match(fn, /pre\.indexOf\(u\) >= 0 \? ' checked' : ''/, '★ 미리 체크하지 않습니다');
  assert.match(fn, /주담당/, '누가 주담당인지 안 보여 줍니다');
  assert.match(fn, /부담당/, '누가 부담당인지 안 보여 줍니다');
});

test('★ 손으로 고른 사람에게는 「담당」 표를 안 단다 — 무엇이 자동인지 갈려야 한다', () => {
  const fn = cutFn(photos, 'function submitShareMany(');
  assert.match(fn, /_shareManyPre\.indexOf\(u\) >= 0/, '자동으로 고른 사람을 안 가립니다');
  assert.match(fn, /_shareManyPre\.indexOf\(u\) < 0/, '손으로 고른 사람을 안 가립니다');
  /* 저장 층도 빈 까닭이면 표를 안 달아야 한다 */
  assert.match(cutFn(store, 'function addShare('), /\.trim\(\)\.slice\(0, 60\) \|\| null/,
    '★ 빈 까닭에도 표를 답니다 — 손으로 넣은 사람이 「업무」로 보입니다');
});

test('★ 사번→계정은 «저장 층»이 읽는다 — 화면이 실시간DB를 직접 만지면 안 된다', () => {
  /* ⚠ 처음에는 화면에서 직접 읽었다가 pu-photos-html 의 울타리 셋에 걸렸다
     (다른 앱 루트·화면의 직접 쓰기·권한 자리 읽기). 울타리가 옳았다. */
  const fn = cutFn(photos, 'function uidBySid(');
  assert.match(fn, /PuPhotoStore\.uidBySid\(\)/, '★ 화면이 실시간DB를 직접 읽고 있습니다');
  assert.ok(!/db\.ref\(/.test(fn), '★ 화면이 db 를 직접 만집니다');
  const st = cutFn(store, 'function uidBySid(');
  assert.match(st, /ref\('uid_roles'\)/, '★ 저장 층이 다른 자리를 보고 있습니다');
  assert.match(st, /t > best\[r\.sid\]\.t/, '계정이 여럿이면 가장 최근 것');
  assert.match(st, /if \(_uidBySid\) return Promise\.resolve\(_uidBySid\);/,
    '한 번 읽고 쥐고 있어야 합니다 — 스무 장이면 스무 번 읽습니다');
});

test('업체 이름은 찾기에도 걸린다 — 달아 놓고 못 찾으면 뜻이 없다', () => {
  assert.match(cutFn(photos, 'function hayOf('), /m\.company/,
    '★ 업체를 달아도 찾기에 안 걸립니다');
});
