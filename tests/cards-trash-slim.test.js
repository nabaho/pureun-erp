/* 기업정보함 휴지통 — 원본 사진을 기록에 넣지 않는다 (비용 조사 2026-08-13)

   8/1~8/11 청구서: 실시간DB 내려받기 ₩28,833 (전체 ₩31,045 의 93%).
   휴지통(`pucards/trash`)은 `.on('value')` 로 **통째로 구독**하는 자리인데
   그 안에 지운 명함의 **원본 사진이 base64 로** 들어 있었다. 그래서 기업정보함을
   열 때마다 30일치 원본을 전부 내려받았다.

   ⚠ 이 검사가 지키는 것은 두 가지다.
     ① 휴지통 기록에 원본이 안 들어간다 (돈)
     ② 그래도 **복원하면 사진이 돌아온다** (사진을 잃지 않는다)
   ②가 깨지면 돈은 아꼈는데 사진을 잃는다 — 훨씬 나쁜 고장이다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* Store 의 메서드 하나를 떼어 진짜로 돌린다 — 글자만 보면 「안 넣는다」를 증명 못 한다 */
function method(name, head) {
  const re = new RegExp('(?:async )?' + name + '\\(' + (head || '') + '\\)\\{[\\s\\S]*?\\n  \\},');
  const m = html.match(re);
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0].replace(/,$/, '');
}

function store(over) {
  const calls = { set: [], remove: [], putPhoto: [], delPhoto: [], delThumb: [], update: [] };
  const ref = function (p) {
    return {
      set: function (v) { calls.set.push({ path: p, val: v }); return Promise.resolve(); },
      remove: function () { calls.remove.push(p); return Promise.resolve(); },
      update: function (v) { calls.update.push({ path: p, val: v }); return Promise.resolve(); },
      once: function () { return Promise.resolve({ val: function () { return over && over.rec; } }); }
    };
  };
  const src = '({ mode:"firebase", db:{ ref: __ref }, ' +
    'getThumb: function(id){ return Promise.resolve("data:thumb:"+id); }, ' +
    'putPhoto: function(id,d){ __calls.putPhoto.push(id); return Promise.resolve(); }, ' +
    'delPhoto: function(id){ __calls.delPhoto.push(id); }, ' +
    'delThumb: function(id){ __calls.delThumb.push(id); }, ' +
    'put: function(it){ __calls.put = it; }, ' +
    method('del', 'id') + ',\n' + method('hardDel', 'id') + ',\n' + method('restore', 'id') + ' })';
  const ctx = {
    __ref: ref, __calls: calls, Date, Object, JSON, Promise,
    DB_ROOT: 'pucards',
    privRoot: function () { return 'pucards_private'; },
    state: { items: { c1: { id: 'c1', name: '홍길동', thumb: '' } }, priv: null, trash: {} },
    removeIdx: function () {},
    render: function () {},
    localStorage: { getItem: function () { return null; }, setItem: function () {} }
  };
  vm.createContext(ctx);
  const s = vm.runInContext(src, ctx);
  s._calls = calls;
  s._ctx = ctx;
  return s;
}

test('★ 휴지통 기록에 원본 사진을 안 넣는다 — 이것이 돈이 새던 자리다', async () => {
  const s = store();
  await s.del('c1');
  assert.equal(s._calls.set.length, 1);
  const rec = s._calls.set[0].val;
  assert.equal(s._calls.set[0].path, 'pucards/trash/c1');
  assert.equal(rec._photo, undefined, '★ 원본이 들어갔습니다 — 열 때마다 30일치를 내려받습니다');
  assert.equal(rec._photo2, undefined);
  assert.ok(rec._deletedAt > 0, '언제 지웠는지는 있어야 30일 뒤 정리가 됩니다');
  // 썸네일(20KB)은 목록 그림용이라 남긴다 — 원본(수 MB)과 성격이 다르다
  assert.equal(rec.thumb, 'data:thumb:c1');
});

test('★ 지울 때 사진을 안 지운다 — 지우면 복원해도 빈 사진이 온다', async () => {
  const s = store();
  await s.del('c1');
  assert.deepEqual(s._calls.delPhoto, [], '★ 사진을 지웠습니다 — 휴지통에서 못 되살립니다');
  assert.deepEqual(s._calls.delThumb, []);
  assert.deepEqual(s._calls.remove, ['pucards/items/c1'], '목록에서는 빠져야 합니다');
});

test('★ 영구삭제 때 사진까지 지운다 — 안 지우면 창고에 영영 남는다', () => {
  const s = store();
  s.hardDel('c1');
  assert.deepEqual(s._calls.delPhoto, ['c1', 'c1_b'],
    '★ 삭제 때 안 지우기로 했으므로 여기서 안 지우면 아무도 안 지웁니다');
  assert.deepEqual(s._calls.delThumb, ['c1', 'c1_b']);
  assert.deepEqual(s._calls.remove, ['pucards/trash/c1']);
});

test('★ 복원해도 사진이 돌아온다 — 새 기록', async () => {
  /* 사진이 있던 자리에 그대로 있으므로 되돌릴 것이 없다.
     ⚠ 여기서 hardDel 을 부르면 방금 살린 사진을 도로 지운다. */
  const s = store({ rec: { id: 'c1', name: '홍길동', _deletedAt: 1 } });
  await s.restore('c1');
  assert.equal(s._calls.put.name, '홍길동');
  assert.equal(s._calls.put._deletedAt, undefined, '지운 표시가 남으면 안 됩니다');
  assert.deepEqual(s._calls.delPhoto, [],
    '★ 복원하면서 사진을 지웠습니다 — 살린 명함이 빈 사진이 됩니다');
  assert.deepEqual(s._calls.remove, ['pucards/trash/c1'], '휴지통 기록만 없애야 합니다');
});

test('★ 옛 기록(_photo 가 든 것)도 복원하면 사진이 돌아온다', async () => {
  /* 8/13 이전에 지운 명함은 그때 창고 사진을 함께 지웠다 —
     `_photo` 가 그 명함의 **유일한** 사진이다. 이 길을 없애면 사진을 잃는다. */
  const s = store({ rec: { id: 'c1', name: '홍길동', _deletedAt: 1, _photo: 'data:old', _photo2: 'data:old2' } });
  await s.restore('c1');
  assert.deepEqual(s._calls.putPhoto, ['c1', 'c1_b'], '★ 옛 기록의 사진을 안 되돌렸습니다');
  assert.equal(s._calls.put._photo, undefined, '명함 정보에 사진이 섞여 들어갔습니다');
});

/* ── 옛 기록 슬림화 ── */

function slim(trash, opts) {
  const calls = { putPhoto: [], update: [] };
  const src = html.match(/async function slimTrashPhotos\(\)\{[\s\S]*?\n\}/);
  assert.ok(src, 'slimTrashPhotos 를 찾을 수 없습니다');
  const ctx = {
    Object, Promise, console: { log: function () {}, warn: function () {} },
    DB_ROOT: 'pucards',
    state: { trash: trash },
    Store: {
      mode: (opts && opts.mode) || 'firebase',
      putPhoto: function (id, d) {
        calls.putPhoto.push(id);
        return (opts && opts.failPut) ? Promise.reject(new Error('창고 막힘')) : Promise.resolve();
      },
      db: { ref: function (p) { return { update: function (v) { calls.update.push({ path: p, val: v }); return Promise.resolve(); } }; } }
    },
    _calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext(src[0], ctx);
  return ctx.slimTrashPhotos().then(function () { return calls; });
}

test('★ 옛 기록의 원본을 창고로 되돌린 뒤에 뺀다', async () => {
  const c = await slim({ a: { id: 'a', _photo: 'data:1', _photo2: 'data:2' }, b: { id: 'b' } });
  assert.deepEqual(c.putPhoto, ['a', 'a_b'], '창고로 안 옮겼습니다');
  assert.equal(c.update.length, 1);
  assert.equal(c.update[0].path, 'pucards/trash/a');
  assert.deepEqual(c.update[0].val, { _photo: null, _photo2: null });
});

test('★ 창고로 못 옮기면 안 뺀다 — 빼면 사진을 잃는다', async () => {
  const c = await slim({ a: { id: 'a', _photo: 'data:1' } }, { failPut: true });
  assert.deepEqual(c.update, [],
    '★ 못 옮겼는데 빼면 그 명함의 유일한 사진이 사라집니다');
});

test('뺄 것이 없으면 아무것도 안 한다 — 한 번 지나가면 끝이다', async () => {
  const c = await slim({ a: { id: 'a', name: '홍길동' } });
  assert.deepEqual(c.putPhoto, []);
  assert.deepEqual(c.update, []);
});

test('데모(로컬) 모드에서는 안 건드린다', async () => {
  const c = await slim({ a: { id: 'a', _photo: 'data:1' } }, { mode: 'local' });
  assert.deepEqual(c.putPhoto, []);
});

test('★ 앱을 열 때 실제로 슬림화가 걸린다', () => {
  /* 함수만 있고 안 부르면 옛 기록이 영영 남아 매번 내려받는다 */
  const fn = html.match(/function purgeTrash\(\)\{[\s\S]*?\n\}/);
  assert.ok(fn, 'purgeTrash 를 찾을 수 없습니다');
  assert.match(fn[0], /slimTrashPhotos\(\);/, '★ 안 부르면 옛 기록이 그대로 남습니다');
});
