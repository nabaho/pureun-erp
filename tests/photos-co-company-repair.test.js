'use strict';
/* 「두 장 합친」 서식의 회사 이음매를 스스로 다시 확인한다 (대표 지시 2026-08-31)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시
     「앞으로는 두장 합친 사진인경우 이부분을 다시 확인하고 자동으로 수정 변경해라」
     (배경: PR #785 이후로 «새로» 보내는 서식은 회사 이름을 달고 명함이 된다.
      그런데 그 전에 손으로 만들었거나 다른 사정으로 회사가 안 붙은 채 이미 있는
      명함은 저절로 안 고쳐진다 — 실제로 「가나김산업」의 담당자 「홍길동」 명함이
      회사 칸이 빈 채 남아 있었다.)

   ■ 어떻게 했나 — 기존 「업체가 나중에 생기면 스스로 맞춰 본다」(coWaiting/coSweep,
     대표 결정 2026-08-23)와 «같은 결»이다. «다 됐다고 끝내지 않고, 사진첩을 열 때마다
     아직 안 본 것이 있으면 다시 본다».
     ① js/pu-doc-file.js — repairCardCompanyMany: 명함의 회사 칸을 되짚어 채운다
     ② pu-photos.html — coCompanyWaiting: 다시 볼 후보를 고른다
     ③ pu-photos.html — coCompanySweep: 후보를 채우고 «다시 안 본다» 표를 남긴다

   ★ 여기서 못 박는 것
     ① 빈 회사 칸만 채운다 — 이미 있는 값은 안 건드린다(gap-fill)
     ② 카드가 지워졌으면 조용히 넘어간다
     ③ 채울 것이 없으면 실시간DB 에 쓰지 않는다(비용)
     ④ 후보는 «두 장 이상 합친» 서식만이다 — 한 장짜리는 애초에 이 문제가 없다
     ⑤ 이미 «한 번 확인한» 것은 다시 안 본다 — 매번 열 때마다 되풀이하면 비용이 는다
     ⑥ 남의 사진은 손대지 않는다(mayTouch)
     ⑦ 한 판(세션)에 한 번만 돈다
   실행: node --test tests/photos-co-company-repair.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const FILE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ══════════════════ ① repairCardCompanyMany — js/pu-doc-file.js ══════════════════ */

function rigFile(tree) {
  const updates = [];
  const db = {
    ref: function (p) {
      return {
        once: function () {
          const v = Object.prototype.hasOwnProperty.call(tree, p) ? tree[p] : null;
          return Promise.resolve({ val: function () { return v; } });
        },
        update: function (u) { updates.push(u); return Promise.resolve(); }
      };
    }
  };
  const ctx = { console, Promise, Object, Array, String, Number };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(FILE_SRC, ctx);
  ctx.PuDocFile.init({ db: db });
  return { F: ctx.PuDocFile, updates: updates };
}

test('★ 빈 회사 칸을 채운다', async () => {
  const { F, updates } = rigFile({ 'pucards/items/C1': { kind: 'card', name: '홍길동', company: '' } });
  const out = await F.repairCardCompanyMany([{ id: 'C1', company: '가나김산업' }]);
  assert.equal(out[0].patched, true);
  assert.equal(updates[0]['pucards/items/C1/company'], '가나김산업');
});

test('★ 이미 있는 회사 값은 건드리지 않는다 — 사람이 넣어 둔 것을 지우면 안 된다', async () => {
  const { F, updates } = rigFile({ 'pucards/items/C1': { kind: 'card', name: '홍길동', company: '옛회사' } });
  const out = await F.repairCardCompanyMany([{ id: 'C1', company: '가나김산업' }]);
  assert.equal(out[0].patched, false);
  assert.equal(updates.length, 0, '★ 이미 값이 있는데 썼다 — 요금도 들고 사람 값을 지울 위험도 있다');
});

test('카드가 이미 지워졌으면 조용히 넘어간다', async () => {
  const { F, updates } = rigFile({});
  const out = await F.repairCardCompanyMany([{ id: 'GONE', company: '가나김산업' }]);
  assert.equal(out[0].patched, false);
  assert.equal(updates.length, 0);
});

test('★ 채울 것이 하나도 없으면 실시간DB 에 «쓰지 않는다»', async () => {
  const { F, updates } = rigFile({ 'pucards/items/C1': { kind: 'card', company: '이미있음' } });
  await F.repairCardCompanyMany([{ id: 'C1', company: '가나김산업' }]);
  assert.equal(updates.length, 0, '★ 쓸 것이 없는데 update 를 불렀다 — 헛돈이 나간다');
});

test('여럿을 한 번에 처리하고 채운 것만 쓴다', async () => {
  const { F, updates } = rigFile({
    'pucards/items/C1': { kind: 'card', company: '' },
    'pucards/items/C2': { kind: 'card', company: '이미있음' }
  });
  const out = await F.repairCardCompanyMany([
    { id: 'C1', company: '가나김산업' }, { id: 'C2', company: '다른회사' }
  ]);
  assert.equal(out[0].patched, true);
  assert.equal(out[1].patched, false);
  assert.equal(updates.length, 1, '★ 한 번의 update 로 모은다 — 카드마다 따로 쓰면 요금이 는다');
  assert.equal(Object.keys(updates[0]).length, 1);
});

/* ══════════════════ ②③ coCompanyWaiting · coCompanySweep — pu-photos.html ══════════════════ */

function rigPhotos(o) {
  o = o || {};
  const saved = [];
  const patched = o.patched || {};
  const ctx = {
    console, Promise, Object, Array, String, Number, Boolean, Date, JSON,
    gridItems: o.items || [],
    gridYear: '2026',
    viewerId: null,
    mayTouch: o.mayTouch || function () { return true; },
    docPages: o.docPages || function (id) {
      const it = (o.items || []).find(function (x) { return x.id === id; });
      return it && it._pageCount ? new Array(it._pageCount).fill(it) : [it];
    },
    photoOwner: function () { return 'me'; },
    /* 2026-09-05: 저장 층에 «사진의 해»를 넘기게 되었다 — 안 주면 그 자리에서 멎는다 */
    photoYearOf: function () { return '2026'; },
    renderGrid: function () {}, renderGridBar: function () {}, renderReadPanel: function () {},
    toast: function () {},
    PuPhotoStore: {
      saveRead: function (year, id, read) { saved.push({ id: id, read: read }); return Promise.resolve(); }
    },
    PuDocFile: {
      repairCardCompanyMany: function (list) {
        return Promise.resolve(list.map(function (x) {
          return { id: x.id, patched: !!patched[x.id] };
        }));
      }
    }
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    'let _coCompanySweptOnce = false;\n'
    + cutFn(APP, 'function coCompanyWaiting(') + '\n' + cutFn(APP, 'function coCompanySweep('), ctx);
  return { ctx: ctx, saved: saved };
}

const formItem = (o) => Object.assign({
  id: 'p1', meta: { read: { kind: 'form', filed: { id: 'C1' }, fields: { company: '가나김산업' } } },
  _pageCount: 2
}, o || {});

test('★ 「두 장 합친」 서식이면서 이미 명함으로 갔고 회사 값이 있으면 후보다', () => {
  const { ctx } = rigPhotos({ items: [formItem()] });
  const w = ctx.coCompanyWaiting();
  assert.equal(w.length, 1);
  assert.equal(w[0].id, 'p1');
});

test('★ 한 장짜리는 후보가 아니다 — 애초에 이 문제가 없다', () => {
  const { ctx } = rigPhotos({ items: [formItem({ _pageCount: 1 })] });
  assert.equal(ctx.coCompanyWaiting().length, 0);
});

test('아직 명함으로 안 갔으면(filed 없음) 후보가 아니다', () => {
  const it = formItem();
  it.meta.read.filed = null;
  const { ctx } = rigPhotos({ items: [it] });
  assert.equal(ctx.coCompanyWaiting().length, 0);
});

test('채울 회사 값 자체가 없으면 후보가 아니다', () => {
  const it = formItem();
  it.meta.read.fields.company = '';
  const { ctx } = rigPhotos({ items: [it] });
  assert.equal(ctx.coCompanyWaiting().length, 0);
});

test('★ 이미 한 번 확인한 것은 다시 안 본다 — 매번 되풀이하면 비용이 는다', () => {
  const it = formItem();
  it.meta.read.coCheck = { at: 1, patched: false };
  const { ctx } = rigPhotos({ items: [it] });
  assert.equal(ctx.coCompanyWaiting().length, 0);
});

test('★ 남의 사진은 후보가 아니다', () => {
  const { ctx } = rigPhotos({ items: [formItem()], mayTouch: () => false });
  assert.equal(ctx.coCompanyWaiting().length, 0);
});

test('서식이 아니면(사업자등록증 등) 후보가 아니다 — 이번 구멍은 서식에만 있었다', () => {
  const it = formItem();
  it.meta.read.kind = 'bizreg';
  const { ctx } = rigPhotos({ items: [it] });
  assert.equal(ctx.coCompanyWaiting().length, 0);
});

test('★★ 채우고 나면 「확인했다」 표를 남긴다 — 다음에 또 안 본다', async () => {
  const { ctx, saved } = rigPhotos({ items: [formItem()], patched: { C1: true } });
  const n = await ctx.coCompanySweep();
  assert.equal(n, 1);
  assert.equal(saved.length, 1);
  assert.ok(saved[0].read.coCheck, '★★ coCheck 표가 없으면 다음에 열 때 또 같은 카드를 씁니다');
  assert.equal(saved[0].read.coCheck.patched, true);
});

test('회사가 이미 있어 못 채웠어도 「확인했다」 표는 남긴다 — 안 그러면 매번 다시 본다', async () => {
  const { ctx, saved } = rigPhotos({ items: [formItem()], patched: {} });
  const n = await ctx.coCompanySweep();
  assert.equal(n, 0, '실제로 채운 것이 없으면 셈에도 안 넣는다');
  assert.equal(saved.length, 1, '★ 그래도 확인했다는 표는 남겨야 한다');
  assert.equal(saved[0].read.coCheck.patched, false);
});

/* ⚠ formItem() 하나로 두 번 부르면, 첫 번째 판정이 남긴 coCheck 표 «자체»가 두 번째를
   막아 버려 «한 판 잠금»(_coCompanySweptOnce)이 없어도 이 검사가 속아 통과했다
   (검수 2026-08-31). coCompanyWaiting 을 아예 «늘 후보를 내놓게» 바꿔치기해서,
   두 번째 부름을 막는 것이 정말 그 잠금 하나뿐인지를 본다. */
test('★ 한 판에 한 번만 돈다 — coCheck 표가 아니라 «잠금» 때문이어야 한다', async () => {
  const rig = rigPhotos({ items: [formItem()], patched: { C1: true } });
  rig.ctx.coCompanyWaiting = function () { return [formItem()]; };   // 늘 새 후보
  let calls = 0;
  const origRepair = rig.ctx.PuDocFile.repairCardCompanyMany;
  rig.ctx.PuDocFile.repairCardCompanyMany = function (list) { calls++; return origRepair(list); };
  await rig.ctx.coCompanySweep();
  await rig.ctx.coCompanySweep();
  assert.equal(calls, 1, '★ 후보가 매번 있어도 두 번째 부름은 아무 일도 안 해야 한다 — 잠금이 그 일을 한다');
});
