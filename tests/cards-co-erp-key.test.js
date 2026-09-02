'use strict';
/* 🔗 회사 열쇠 — 이알피 업체를 «한 번 확정»해 두면 안 끊긴다 (대표 지시 2026-09-02)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     기업정보함은 이알피 업체 열쇠를 저장하지 않고, 회사를 열 때마다 «상호를 다듬어»
     맞췄다. 표기가 어긋나면 조용히 끊긴다 — 2026-08-30 점검에서 표본 열셋 중 여덟이
     그랬다(「(유)대성」 vs 「유한회사 대성」). 담당·계약상태·🚪 가 남의 것이 붙거나 사라졌다.

   ■ 통합 온톨로지가 여기서 막혀 있었다
     docs/푸른통합온톨로지-2단계.md — 업체명이 유일하게 맞을 때만 신뢰도 0.85,
     companyId 가 맞으면 1.0. 기업정보함에 그 id 가 없으니 1.0 이 안 나왔다.

   ■ 여기서 못 박는 것
     ① 사람이 «확정»한 열쇠는 번호도 이름도 이기지 못한다
     ② 확정한 회사는 상호로 «다시 맞추지 않는다» — 되돌아가면 확정한 뜻이 없다
     ③ 확정해 둔 업체가 사라졌으면 «그렇다고 말한다»(조용히 이름 맞추기로 안 간다)
     ④ 열쇠 표(byId)는 «그 업체 하나»를 가리킨다 — 이름이 겹쳐도, 정보가 비어도
     ⑤ 이알피 원장에는 한 글자도 안 쓴다
     ⑥ 풀 수 있다 — 못 풀면 잘못 박은 것을 되돌릴 길이 없다

   실행: node --test tests/cards-co-erp-key.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

/* ── ErpMatch 를 진짜로 띄운다 ── */
function erpCtx() {
  const m = SRC.match(/const ErpMatch = \{[\s\S]*?\n\};/);
  assert.ok(m, 'ErpMatch 를 찾지 못했습니다');
  const ctx = { console, Object, Array, String, Number, Boolean, Math, Set, JSON, Promise };
  vm.createContext(ctx);
  /* ⚠ const 는 렉시컬이라 컨텍스트 객체에 안 붙는다 — 밖에서 ctx.ErpMatch 로 못 잡는다.
     var 로 바꿔 띄운다(값·규칙은 한 글자도 안 바뀐다). */
  vm.runInContext(m[0].replace('const ErpMatch =', 'var ErpMatch ='), ctx);
  return ctx;
}

/* 업체관리 자료를 «훑는 대목»을 그대로 돌린다.
   ⚠ 줄 글자를 통째로 박지 않는다 — 선언이 하나 늘어도 안 깨지게 앞부분만 본다
     (2026-09-02 에 그것으로 검사 넷이 깨졌다). */
function scanErp(cos) {
  const a = SRC.indexOf('      const byBiz={}, byName={}');
  const b = SRC.indexOf('      ErpMatch.byBiz=byBiz;');
  assert.ok(a > 0 && b > a, '업체 훑는 자리를 찾지 못했습니다');
  const ctx = erpCtx();
  ctx.cos = cos;
  ctx.nameBySid = {};
  vm.runInContext('var nameBySid = {};\n' + SRC.slice(a, b)
    + '\nthis.__byBiz = byBiz; this.__byName = byName; this.__byId = byId;', ctx);
  return { byBiz: ctx.__byBiz, byName: ctx.__byName, byId: ctx.__byId, E: ctx.ErpMatch };
}
const CO = (o) => Object.assign({ id: '', name: '', bizNo: '', status: 'active',
  managerMain: '', managerSubs: [], contacts: [], typeCode: '' }, o);

/* ══════════ ④ 열쇠 표는 «그 업체 하나»를 가리킨다 ══════════ */

test('★★★ 다듬은 이름이 겹치는 업체 둘이 있어도 열쇠는 «각자»를 가리킨다', () => {
  /* 이 저장소가 실제로 당한 사고다 — 「주식회사 행복한단홍갈비」와 「행복한 단홍갈비」는
     다듬으면 이름이 같아진다. 이름 표(byName)는 하나만 담으므로, 열쇠를 그 표에서
     되찾으면 «진» 쪽이 남의 기록을 가리킨다. */
  const r = scanErp([
    CO({ id: 'co-A', name: '주식회사 행복한단홍갈비', bizNo: '213-87-03415', typeCode: '자문' }),
    CO({ id: 'co-B', name: '행복한 단홍갈비', bizNo: '726-33-00338', typeCode: '급여' })
  ]);
  assert.ok(r.byId['co-A'], 'co-A 가 열쇠 표에 없습니다');
  assert.ok(r.byId['co-B'], 'co-B 가 열쇠 표에 없습니다');
  assert.equal(r.byId['co-A'].type, '자문');
  assert.equal(r.byId['co-B'].type, '급여',
    '★★★ 이름이 겹친 업체가 남의 기록을 가리킵니다 — 담당·종료가 남의 것이 붙습니다');
});

test('★★ 담당·유형이 비어 있는 업체도 열쇠 표에는 «있다»', () => {
  /* byBiz·byName 은 빈 업체를 일부러 안 담는다(빈 기록이 붙으면 배지가 헛나온다).
     그 걸러내기가 열쇠 표까지 먹으면, 확정해 둔 연결이 「없어졌습니다」로 뜬다. */
  const r = scanErp([CO({ id: 'co-Z', name: '이름만 있는 곳' })]);
  assert.ok(r.byId['co-Z'], '★★ 정보가 빈 업체가 열쇠 표에서 빠졌습니다');
  assert.ok(!r.byName[r.E._norm('이름만 있는 곳')],
    '★ 빈 업체가 이름 표에 담기면 담당 배지가 헛나옵니다 — 그 걸러내기는 그대로여야 합니다');
});

test('★ 열쇠가 없는 업체는 표에 안 담긴다 — 가리킬 것이 없다', () => {
  const r = scanErp([CO({ id: '', name: '열쇠 없는 곳', typeCode: '자문' })]);
  assert.deepEqual(Object.keys(r.byId), []);
});

/* ══════════ ①②③ 확정한 열쇠가 이긴다 ══════════ */

function matched(cos, list) {
  const r = scanErp(cos);
  r.E.byBiz = r.byBiz; r.E.byName = r.byName; r.E.byId = r.byId; r.E.ready = true;
  return { out: r.E.matchAll(list), E: r.E };
}

test('★★★ 확정한 열쇠가 «상호»를 이긴다', () => {
  const cos = [CO({ id: 'co-1', name: '대성', bizNo: '', typeCode: '자문' }),
               CO({ id: 'co-2', name: '대성기업개발', bizNo: '', typeCode: '급여' })];
  /* 상호로는 「대성」에 붙지만, 사람이 co-2 로 확정해 두었다 */
  const { out } = matched(cos, [{ key: 'k1', name: '대성', bizno: '', erpCoId: 'co-2' }]);
  assert.equal(out.k1.type, '급여',
    '★★★ 사람이 확정한 것을 상호가 이겼습니다 — 확정해도 아무 일이 안 일어납니다');
});

test('★★★ 확정한 열쇠가 «사업자번호»도 이긴다', () => {
  const cos = [CO({ id: 'co-1', name: '가나', bizNo: '111-11-11111', typeCode: '자문' }),
               CO({ id: 'co-2', name: '다라', bizNo: '222-22-22222', typeCode: '급여' })];
  const { out } = matched(cos, [{ key: 'k1', name: '가나', bizno: '111-11-11111', erpCoId: 'co-2' }]);
  assert.equal(out.k1.type, '급여',
    '★★★ 번호가 확정을 이겼습니다 — 번호를 옮겨 적다 틀린 경우를 사람이 못 고칩니다');
});

test('★★★ 확정한 회사는 상호로 «다시 맞추지 않는다» — 없어졌으면 빈손이다', () => {
  /* 확정해 둔 업체가 이알피에서 사라졌을 때, 조용히 이름 맞추기로 되돌아가면
     사람은 아직 확정된 줄 안다. 그러면 잘못된 연결이 영구가 된다. */
  const cos = [CO({ id: 'co-1', name: '대성', bizNo: '', typeCode: '자문' })];
  const { out } = matched(cos, [{ key: 'k1', name: '대성', bizno: '', erpCoId: 'co-사라짐' }]);
  assert.equal(out.k1, undefined,
    '★★★ 확정해 둔 업체가 없는데 상호로 다시 붙였습니다 — 화면이 「없어졌습니다」를 못 말합니다');
});

test('★ 확정이 없으면 예전 그대로 — 번호 먼저, 이름은 임자 없는 것만', () => {
  const cos = [CO({ id: 'co-1', name: '주식회사 행복한단홍갈비', bizNo: '213-87-03415', typeCode: '자문' })];
  const { out } = matched(cos, [
    { key: 'k1', name: '주식회사 행복한단홍갈비', bizno: '213-87-03415' },
    { key: 'k2', name: '행복한 단홍갈비', bizno: '726-33-00338' }
  ]);
  assert.equal(out.k1.type, '자문', '번호로 맞추는 길이 깨졌습니다');
  assert.equal(out.k2, undefined, '★ 임자 있는 기록을 이름으로 또 가져갔습니다');
});

test('★ 확정한 업체는 다른 회사가 이름으로 «가져갈 수 없다»', () => {
  const cos = [CO({ id: 'co-1', name: '대성', bizNo: '', typeCode: '자문' })];
  const { out } = matched(cos, [
    { key: 'k1', name: '딴이름', bizno: '', erpCoId: 'co-1' },
    { key: 'k2', name: '대성', bizno: '' }
  ]);
  assert.equal(out.k1.type, '자문');
  assert.equal(out.k2, undefined, '★ 한 업체가 두 회사에 겹쳐 붙었습니다');
});

test('★ 한 회사만 맞출 때(match)도 확정이 먼저다 — matchAll 과 같은 차례', () => {
  const cos = [CO({ id: 'co-1', name: '가나', bizNo: '111-11-11111', typeCode: '자문' }),
               CO({ id: 'co-2', name: '다라', bizNo: '222-22-22222', typeCode: '급여' })];
  const r = scanErp(cos);
  r.E.byBiz = r.byBiz; r.E.byName = r.byName; r.E.byId = r.byId; r.E.ready = true;
  assert.equal(r.E.match({ company: '가나', bizno: '111-11-11111', erpCoId: 'co-2' }).type, '급여',
    '★ 두 길이 다른 답을 내면 화면마다 다른 회사가 보입니다');
});

/* ══════════ 조립·화면 ══════════ */

function view() {
  const ctx = {
    console, Object, Array, String, Number, Boolean, Math, Date, JSON, RegExp,
    esc: v => String(v == null ? '' : v),
    fmtBizno: v => String(v || ''),
    state: { coPick: '' },
    toast: () => {},
    ErpMatch: { ready: true, byId: {}, companies: [],
      _norm: s => String(s || '').toLowerCase().replace(/[\s()]/g, ''),
      _digits: s => String(s || '').replace(/[^0-9]/g, '') }
  };
  vm.createContext(ctx);
  vm.runInContext([cutFn(SRC, 'function coErpPinOf('), cutFn(SRC, 'function coErpPinState('),
    cutFn(SRC, 'function coErpSearch('), cutFn(SRC, 'function coErpPinHtml(')].join('\n'), ctx);
  return ctx;
}

test('★ 확정 열쇠는 기업정보함 제 자리(extra)에서 읽는다', () => {
  const c = view();
  assert.equal(c.coErpPinOf({ extra: { erpCoId: 'co-9' } }), 'co-9');
  assert.equal(c.coErpPinOf({ extra: {} }), '');
  assert.equal(c.coErpPinOf(null), '');
});

test('★★ 확정해 둔 업체가 없어졌으면 «없어졌다»고 말한다', () => {
  const c = view();
  c.ErpMatch.byId = { 'co-1': { company: '가나' } };
  assert.equal(c.coErpPinState({ extra: { erpCoId: 'co-1' } }), 'pinned');
  assert.equal(c.coErpPinState({ extra: { erpCoId: 'co-없음' } }), 'dead',
    '★★ 죽은 열쇠를 확정된 것처럼 보이면 사람이 다시 고를 수 없습니다');
  assert.equal(c.coErpPinState({ extra: {} }), 'none');
});

test('★ 이알피를 아직 못 읽었으면 «없어졌다»고 하지 않는다', () => {
  const c = view();
  c.ErpMatch.ready = false;
  assert.equal(c.coErpPinState({ extra: { erpCoId: 'co-1' } }), 'wait',
    '★ 읽기 전에 「없어졌습니다」라고 하면 멀쩡한 확정을 사람이 풀어 버립니다');
});

test('★ 업체 찾기 — 상호 일부와 사업자번호로 찾고, 짧은 이름이 먼저다', () => {
  const c = view();
  const list = [{ id: 'a', name: '대성기업개발', bizNo: '111-11-11111' },
                { id: 'b', name: '대성', bizNo: '222-22-22222' },
                { id: 'c', name: '한서정공', bizNo: '333-33-33333' }];
  assert.deepEqual(Array.from(c.coErpSearch(list, '대성', 10).map(x => x.id)), ['b', 'a'],
    '★ 「대성」을 찾을 때 「대성」이 먼저 나와야 합니다');
  assert.deepEqual(Array.from(c.coErpSearch(list, '333', 10).map(x => x.id)), ['c']);
  assert.deepEqual(Array.from(c.coErpSearch(list, '', 10)), [], '빈 말로 전체를 쏟지 않습니다');
  assert.deepEqual(Array.from(c.coErpSearch(list, '없는이름', 10)), []);
});

test('★ 열쇠 없는 업체는 찾기에서도 안 나온다 — 확정할 수 없다', () => {
  const c = view();
  assert.deepEqual(Array.from(c.coErpSearch([{ id: '', name: '대성' }], '대성', 10)), []);
});

test('★★ 확정 전에는 «상호로 맞췄다»고 알리고 확정 단추를 준다', () => {
  const c = view();
  const h = c.coErpPinHtml({ key: 'k1', extra: {}, erp: { id: 'co-1', company: '가나' } });
  assert.match(h, /상호로/, '★★ 표기가 바뀌면 끊긴다는 것을 말하지 않습니다');
  assert.match(h, /coErpPin\('k1','co-1'\)/, '★★ 확정 단추가 없습니다');
});

test('★ 안 이어져 있으면 «고르기»만 준다', () => {
  const c = view();
  const h = c.coErpPinHtml({ key: 'k1', extra: {}, erp: null });
  assert.match(h, /안 이어져/);
  assert.match(h, /openCoErpPicker/);
  assert.doesNotMatch(h, /coErpPin\('k1','/, '붙은 것이 없는데 확정 단추를 주면 안 됩니다');
});

test('★★ 확정한 뒤에는 «풀기»가 있다 — 못 풀면 잘못 박은 것을 되돌릴 길이 없다', () => {
  const c = view();
  c.ErpMatch.byId = { 'co-1': { company: '가나' } };
  const h = c.coErpPinHtml({ key: 'k1', extra: { erpCoId: 'co-1' } });
  assert.match(h, /확정됨/);
  assert.match(h, /coErpUnpin\('k1'\)/, '★★ 푸는 길이 없습니다');
});

/* ══════════ ⑤ 이알피 원장에는 안 쓴다 ══════════ */

test('★★★ 확정·풀기가 이알피 원장에 «한 글자도» 안 쓴다', () => {
  ['coErpPin', 'coErpUnpin'].forEach(function (fn) {
    const src = cutFn(SRC, 'function ' + fn + '(');
    assert.match(src, /coInfo\/'\s*\+\s*k\s*\+\s*'\/erpCoId/,
      '★ ' + fn + ' 이 기업정보함 제 자리에 안 씁니다');
    assert.doesNotMatch(src, /data\/companies|data\/cases|data\/contracts/,
      '★★★ ' + fn + ' 이 푸른이알피 원장을 건드립니다 — 업체의 임자는 업체관리입니다');
  });
});

test('★ 확정 열쇠를 «맞추기 전»에 읽는다 — 뒤에 읽으면 확정해도 아무 일이 안 일어난다', () => {
  const build = cutFn(SRC, 'function coListBuild(');
  const pinAt = build.indexOf('ex0.erpCoId');
  const matchAt = build.indexOf('ErpMatch.matchAll(');
  assert.ok(pinAt > 0, '확정 열쇠를 읽는 자리가 없습니다');
  assert.ok(matchAt > pinAt,
    '★ 확정 열쇠를 맞추기 «뒤»에 읽습니다 — matchAll 이 그것을 못 봅니다');
});

test('★ 서식 칸(extra)을 두 번 읽지 않는다 — 4,158곳에서 두 배가 된다', () => {
  const build = cutFn(SRC, 'function coListBuild(');
  const n = (build.match(/coEffectiveExtra\(/g) || []).length;
  assert.equal(n, 1, '★ coEffectiveExtra 를 ' + n + '번 부릅니다 — 한 번 읽어 둘로 씁니다');
});

test('★ 기업 상세에 회사 열쇠 한 줄이 있다', () => {
  assert.match(SRC, /<div id="coErpPinBox">/, '★ 확정할 자리가 화면에 없습니다');
  assert.match(SRC, /id="coErpPickBg"/, '★ 업체 고르기 창 자리가 없습니다');
});
