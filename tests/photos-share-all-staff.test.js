/* 공유자 목록에 «사진첩을 안 연 직원»이 없었다 (건의 2026-09-07 김동현 노무사)

   ── 무슨 일이 있었나 ──
   「공유자 목록에 김혜민 노무사님이 없습니다」
   고장이 아니라 **명단이 틀린 자리**였다. 고를 사람을 `puphotos/owners` 에서
   가져왔는데, 그 자리는 «사진을 올린 적 있는 사람»만 들어간다.
   그런데 이 단추가 하려는 일은 «아직 안 본 사람에게 열어 주기»다 —
   **열지 않았기 때문에 열어 줄 수 없는**, 뒤집힌 문이었다.

   화면 주석은 「골라 줄 uid 자체가 없기 때문이다」라고 적어 두었다.
   그 전제가 틀렸다 — 로그인한 사람은 모두 `uid_roles` 에 있고, 이름은
   공개 명부 `data/user_dir` 에 있다. 둘 다 이미 전 직원이 읽는 자리다.

   ── 이 검사가 지키는 것 ──
   ① 저장 층 listStaff : 사진첩을 안 연 재직 직원도 나온다 / 퇴직자는 안 나온다
   ② 화면            : 그 명단을 실제로 «가져다 쓴다»
   ⚠ 값이 아니라 **규칙**을 본다 — 사람 수·이름을 못 박지 않는다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'pu-photo-store.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');

function loadStore() {
  const ctx = {
    console, Promise, Object, Array, JSON, String, Number, Math, Date, Set, Map,
    RegExp, Error, isFinite, parseInt, parseFloat, setTimeout, clearTimeout
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(STORE, ctx);
  return ctx;
}

/* 읽기가 «막힌» 자리는 규칙처럼 거절한다 — 조용히 빈손을 주면 검사가 헛돈다 */
function fakeDb(tree, denied) {
  const no = denied || {};
  return {
    ref(p) {
      return {
        once() {
          if (no[p]) return Promise.reject(new Error('permission_denied'));
          const v = String(p).split('/').reduce(function (a, k) {
            return (a == null ? null : a[k]);
          }, tree);
          return Promise.resolve({ val: function () { return v === undefined ? null : v; } });
        },
        update() { return Promise.resolve(); },
        set() { return Promise.resolve(); }
      };
    }
  };
}

/* 사진첩을 «한 번도 안 연» 노무사가 한 명 있다 — 이 건의의 그 사람 자리다 */
const TREE = {
  uid_roles: {
    U1: { sid: 'P-001', status: 'active', updatedAt: 100 },
    U2: { sid: 'P-002', status: 'active', updatedAt: 100 },   // 사진첩을 안 열었다
    U9: { sid: 'P-009', status: 'left',   updatedAt: 100 },   // 퇴직자
    UX: { role: 'staff', updatedAt: 100 }                     // 사번이 없다
  },
  data: {
    user_dir: { v: [
      { sid: 'P-001', name: '권형하' },
      { sid: 'p-002', name: '김혜민' },                        // 사번 대소문자·붙임표가 다르다
      { sid: 'P-009', name: '퇴직자' }
    ] }
  },
  puphotos: { owners: { U1: { name: '권형하', lastAt: 1 } } }
};

test('★ 사진첩을 한 번도 안 연 재직 직원도 명단에 있다', async () => {
  const ctx = loadStore();
  ctx.PuPhotoStore.init({ db: fakeDb(TREE), uid: 'U1' });
  const staff = await ctx.PuPhotoStore.listStaff();
  assert.ok(staff.U2, '사진첩을 안 연 직원이 빠졌습니다 — 이 건의가 바로 그 자리입니다');
  assert.equal(staff.U2.name, '김혜민', '사번 표기가 달라 이름을 못 붙였습니다');
});

test('owners 에만 기대지 않는다 — 명단이 owners 보다 넓다', async () => {
  const ctx = loadStore();
  ctx.PuPhotoStore.init({ db: fakeDb(TREE), uid: 'U1' });
  const owners = await ctx.PuPhotoStore.listOwners();
  const staff = await ctx.PuPhotoStore.listStaff();
  assert.ok(Object.keys(staff).length > Object.keys(owners).length,
    '직원 명단이 owners 보다 넓지 않습니다 — 넓히려고 만든 길입니다');
});

test('퇴직자는 안 나온다 — 사진을 열어 주면 안 되는 사람이다', async () => {
  const ctx = loadStore();
  ctx.PuPhotoStore.init({ db: fakeDb(TREE), uid: 'U1' });
  const staff = await ctx.PuPhotoStore.listStaff();
  assert.equal(staff.U9, undefined, '퇴직한 사람이 공유 대상으로 나옵니다');
});

test('사번이 없는 계정은 안 나온다 — 누구인지 말할 수 없다', async () => {
  const ctx = loadStore();
  ctx.PuPhotoStore.init({ db: fakeDb(TREE), uid: 'U1' });
  const staff = await ctx.PuPhotoStore.listStaff();
  assert.equal(staff.UX, undefined, '사번 없는 계정이 사람인 척 목록에 섰습니다');
});

test('한 사람이 계정을 여럿이면 «가장 최근» 것 하나만 선다', async () => {
  const tree = JSON.parse(JSON.stringify(TREE));
  tree.uid_roles.U2b = { sid: 'P-002', status: 'active', updatedAt: 999 };
  const ctx = loadStore();
  ctx.PuPhotoStore.init({ db: fakeDb(tree), uid: 'U1' });
  const staff = await ctx.PuPhotoStore.listStaff();
  assert.ok(staff.U2b, '최근 계정이 안 섰습니다');
  assert.equal(staff.U2, undefined, '같은 사람이 두 번 섰습니다 — 어느 쪽을 골라야 할지 알 수 없습니다');
});

test('이름 명부를 못 읽어도 사람은 나온다 — 그때는 사번으로 적는다', async () => {
  const ctx = loadStore();
  ctx.PuPhotoStore.init({ db: fakeDb(TREE, { 'data/user_dir': 1 }), uid: 'U1' });
  const staff = await ctx.PuPhotoStore.listStaff();
  assert.ok(staff.U2, '이름을 못 읽었다고 사람까지 사라졌습니다');
  assert.ok(staff.U2.sid, '이름도 사번도 없으면 화면이 uid 를 그대로 냅니다');
});

test('uid_roles 를 통째로 못 읽어도 사진첩은 안 넘어진다', async () => {
  const ctx = loadStore();
  ctx.PuPhotoStore.init({ db: fakeDb(TREE, { uid_roles: 1 }), uid: 'U1' });
  const staff = await ctx.PuPhotoStore.listStaff();
  assert.deepEqual(Object.keys(staff), [], '막혔을 때 빈손이 아니라 다른 것을 돌려줍니다');
});

/* ── ② 화면 — 그 명단을 실제로 가져다 쓰는가 ── */

test('★ 사진첩 화면이 직원 명단을 실제로 부른다', () => {
  assert.match(HTML, /PuPhotoStore\.listStaff\s*\(/,
    '저장 층에만 길을 내고 화면은 옛 명단을 그대로 씁니다 — 건의는 화면에서 보입니다');
});

test('명단을 부르는 곳이 owners 를 채우는 곳마다 있다', () => {
  const owners = (HTML.match(/PuPhotoStore\.listOwners\s*\(/g) || []).length;
  const merge = (HTML.match(/mergeStaffNames/g) || []).length;
  assert.ok(owners >= 1, '이 검사의 전제가 깨졌습니다 — owners 를 읽는 곳이 없습니다');
  assert.ok(merge >= owners + 1,
    'owners 를 읽는 자리 가운데 직원 명단을 안 넓히는 곳이 남아 있습니다 ' +
    '(관리자 화면과 직원 화면이 갈려 있어, 한쪽만 고치면 다른 쪽에서 이 건의가 되풀이됩니다)');
});

test('「사진첩을 열어야 고를 수 있다」는 옛 안내가 남아 있지 않다', () => {
  assert.ok(!/사진첩에 한 번이라도 들어온 분만/.test(HTML),
    '이제 사실이 아닌 안내입니다 — 틀린 안내는 없느니만 못합니다(읽은 사람이 안심하고 틀립니다)');
  assert.match(HTML, /한 번이라도 로그인한 재직 직원만/,
    '고를 사람이 없을 때 «무엇을 하면 되는지»가 사라졌습니다');
});
