'use strict';
/* ══════ 계약이 끝난 사업장을 어떻게 다루나 (대표 보고 2026-08-31) ══════
   대표 화면: 사업자등록증 「자문 60」 안에 «계약이 끝난» 사업장이 섞여 있다.
   그리고 「이알피에서 계약종료·사무관리종료로 정리한 곳은 폴더도 저절로 정리됐으면」.

   ■ 조사해서 안 것 — 자동 정리 코드는 «이미 있었다». 폴더 이름을 못 알아본 것이다
     ErpMatch.autoFolder 는 이알피가 종료로 표시한 명함·등록증을 종료 폴더로 옮긴다.
     그런데 갈 곳을 «이름»으로 찾았다 — 이름이 「업체퇴사」인 폴더.
     대표님 것은 「5.계약해지」다. 앞 번호를 떼도 «계약해지»라 못 알아보고,
     계약이 끝날 때마다 「업체퇴사」라는 폴더를 새로 만들어 그리로 보냈다 —
     종료 업체가 «두 폴더»로 갈린다.
     ⚠ 2026-08-29 에 손으로 누르는 도구(erpClosedFolderOf)는 이 잣대로 고쳤는데
       «자동» 쪽은 그대로 남아 있었다. 같은 결함을 반만 고쳤던 것이다.

   ■ 두 번째 — 유형 탭은 «지금 일하는가»를 안 본다
     이알피에서 계약을 종료해도 유형(자문)은 그대로 남는다. 유형은 「무슨 일을 하던
     곳인가」이지 「지금 일하는가」가 아니기 때문이다. 그 둘을 한 탭에 담으면
     자문 몇 곳과 «지금» 일하는지를 이 화면에서 셀 수가 없다.

   ★ 여기서 못 박는 것
     ① 자동 정리가 대표님 종료 폴더를 알아본다 — 같은 뜻의 폴더를 또 만들지 않는다
     ② 이알피에서 계약을 «되살리면» 폴더도 돌아온다 — 들어가는 길만 있으면 안 된다
     ③ 손으로 옮긴 것은 «안 건드린다» — 앱이 넣어 둔 것만 앱이 옮긴다
     ④ 유형 탭은 «지금 일하는 곳»만 센다
     ⑤ 끝난 곳을 볼 자리(🚪 해지)가 «함께» 생긴다 — 빼기만 하면 자료를 잃은 것과 같다
     ⑥ 「전체」는 아무것도 안 숨긴다
   실행: node --test tests/cards-closed-auto-tidy.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = SRC.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = SRC.indexOf('\n  ' + name + '(');           /* 객체 안의 메서드 */
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했다');
}
const _canon = s => String(s || '').replace(/^\s*\d+\s*[.)\-]?\s*/, '').replace(/\s/g, '');

/* ══════ ①②③ 자동 폴더 정리를 «돌려» 본다 ══════ */

function runAutoFolder(groups, items, erpByKey){
  const put = [], madeGroups = [];
  const ctx = { console, Object, String, Number, Array, Set, Date,
    _canon: _canon,
    uid: (function(){ let n = 0; return () => 'new' + (++n); })(),
    ERP_TYPES: ['자문','급여','노조','기금','사무대행'],
    state: { groups: groups, items: items },
    Store: { putGroup: g => { madeGroups.push(g); }, delGroup: () => {} },
    toast: () => {}, render: () => {},
    /* ⚠ 진짜 코드는 «맨 이름»으로 부른다(autoFolderFlush) — ErpMatch 에 달아 두면
       대역이 한 번도 안 불려, 「모아서 저장했나」가 늘 0 이 된다. */
    autoFolderFlush: list => { list.forEach(it => put.push(it)); },
    ErpMatch: { ready: true, match: it => erpByKey[it.id] || null } };
  vm.createContext(ctx);
  /* 잣대는 공용에 있다 — 대역이 아니라 «진짜»를 실어야 같은 답이 나온다 */
  vm.runInContext(fnBody('closedFolderName'), ctx);
  /* ⚠ 2026-08-31: 같은 뜻의 폴더가 둘일 때 «쓰이는 쪽»을 고르는 잣대가 갈라져 나왔다.
     대역이 아니라 진짜를 함께 싣는다 — 대역을 넣으면 그 고름이 틀려도 모른다. */
  vm.runInContext(fnBody('pickBusiestGroup'), ctx);
  vm.runInContext(fnBody('erpClosedFolderOf'), ctx);
  /* 새 폴더 «이름»을 짓는 잣대도 진짜를 싣는다 — 안 실으면 자동 정리가 조용히
     멈춘다(밖의 try 가 삼킨다). 2026-08-31 에 실제로 그렇게 헛돌았다. */
  vm.runInContext(fnBody('newClosedFolderName'), ctx);
  vm.runInContext('ErpMatch.autoFolder = function()' + fnBody('autoFolder').replace(/^[\s\S]*?\(\)\s*\{/, '{'), ctx);
  ctx.ErpMatch.autoFolder();
  return { moved: put, madeGroups: madeGroups, groups: ctx.state.groups };
}
const G = (id, name, kind) => ({ id, name, kind: kind || 'biz' });
const 대표폴더 = () => ({
  g1: G('g1', '1. 업체관리', 'biz'),
  g2: G('g2', '5.계약해지', 'biz')
});
const 끝난업체 = { type:'자문', left:true };
const 사는업체 = { type:'자문', left:false };

test('★ 계약이 끝나면 대표님의 「5.계약해지」로 간다 — 같은 뜻의 폴더를 또 만들지 않는다', () => {
  const items = { a: { id:'a', kind:'biz', group:'g1', erpAutoFoldered:1 } };
  const r = runAutoFolder(대표폴더(), items, { a: 끝난업체 });
  assert.equal(items.a.group, 'g2',
    '★ 「5.계약해지」로 안 갔다 — 이알피에서 종료해도 폴더가 안 정리되던 그 자리다');
  assert.equal(r.madeGroups.length, 0,
    '★ 폴더를 새로 만들었다 — 종료 업체가 「5.계약해지」와 「업체퇴사」 두 곳으로 갈린다: '
    + r.madeGroups.map(g => g.name).join(', '));
  assert.equal(r.moved.length, 1, '옮긴 것을 모아서 한 번에 저장해야 한다');
});

test('「업체종료 및 퇴사」처럼 다르게 적어도 알아본다', () => {
  const gs = { g1: G('g1', '1. 업체관리', 'biz'), g2: G('g2', '2.업체종료 및 퇴사', 'biz') };
  const items = { a: { id:'a', kind:'biz', group:'g1', erpAutoFoldered:1 } };
  const r = runAutoFolder(gs, items, { a: 끝난업체 });
  assert.equal(items.a.group, 'g2');
  assert.equal(r.madeGroups.length, 0);
});

test('★ 이알피에서 계약을 «되살리면» 폴더도 돌아온다 — 들어가는 길만 있으면 안 된다', () => {
  const items = { a: { id:'a', kind:'biz', group:'g2', erpAutoFoldered:1 } };
  runAutoFolder(대표폴더(), items, { a: 사는업체 });
  assert.equal(items.a.group, 'g1',
    '★ 종료 폴더에 영영 갇힌다 — 계약을 되살려도 명함이 안 돌아온다');
});

test('★ 손으로 옮긴 것은 «안 건드린다» — 앱이 넣어 둔 것만 앱이 옮긴다', () => {
  /* erpAutoFoldered 가 없다 = 사람이 골라 넣은 것이다 */
  const items = { a: { id:'a', kind:'biz', group:'g1' } };
  const r = runAutoFolder(대표폴더(), items, { a: 끝난업체 });
  assert.equal(items.a.group, 'g1',
    '★ 대표님이 일부러 그 폴더에 둔 것을 앱이 도로 끌어간다');
  assert.equal(r.moved.length, 0, '건드리지 않았으면 저장도 없어야 한다');
});

test('자동 폴더 «밖»으로 빼 둔 것도 안 건드린다', () => {
  const gs = Object.assign(대표폴더(), { g9: G('g9', '3.공공기관', 'biz') });
  const items = { a: { id:'a', kind:'biz', group:'g9', erpAutoFoldered:1 } };
  runAutoFolder(gs, items, { a: 끝난업체 });
  assert.equal(items.a.group, 'g9',
    '★ 자동 폴더가 아닌 곳으로 옮겨 둔 것은 그대로 둔다');
});

test('폴더가 없는 새 등록증은 이알피 상태에 맞는 폴더로 들어간다', () => {
  const items = { a: { id:'a', kind:'biz', group:'' }, b: { id:'b', kind:'biz', group:'' } };
  runAutoFolder(대표폴더(), items, { a: 끝난업체, b: 사는업체 });
  assert.equal(items.a.group, 'g2');
  assert.equal(items.b.group, 'g1');
  assert.equal(items.a.erpAutoFoldered, 1, '앱이 넣었다는 표시를 남겨야 나중에 존중할 수 있다');
});

test('★ 명함과 사업자를 «가른다» — 이름이 같아도 섞이면 안 된다', () => {
  const gs = { g1: G('g1','1. 업체관리','biz'), g2: G('g2','5.계약해지','biz'),
               c2: G('c2','5.계약해지','card') };
  const items = { a: { id:'a', kind:'biz', group:'', }, c: { id:'c', kind:'card', group:'' } };
  runAutoFolder(gs, items, { a: 끝난업체, c: 끝난업체 });
  assert.equal(items.a.group, 'g2');
  assert.equal(items.c.group, 'c2', '★ 명함이 사업자 폴더로 들어갔다');
});

test('종료 폴더가 «하나도 없으면» 그때만 만든다', () => {
  const gs = { g1: G('g1', '1. 업체관리', 'biz') };
  const items = { a: { id:'a', kind:'biz', group:'g1', erpAutoFoldered:1 } };
  const r = runAutoFolder(gs, items, { a: 끝난업체 });
  assert.equal(r.madeGroups.length, 1, '갈 곳이 없으면 만들어야 한다');
  assert.equal(r.madeGroups[0].kind, 'biz');
});

/* ══════ ⑦ 새 종료 폴더의 «이름» (대표 결정 2026-08-31 「앱이 이름을 따라 짓게」) ══════
   「5.계약해지」는 사업자 쪽 폴더다. 명함 쪽에 종료 폴더가 없으면 앱이 하나 만드는데,
   그 이름이 「업체퇴사」면 같은 뜻인데 이름이 둘로 갈린다 — 어느 폴더를 말하는지
   매번 다시 물어야 한다. 반대쪽에 이미 있는 이름을 그대로 따른다. */

test('★ 명함용 종료 폴더를 만들 때 «사업자 쪽 이름»을 그대로 따른다', () => {
  const gs = { g1: G('g1','1. 업체관리','biz'), g2: G('g2','5.계약해지','biz'),
               c1: G('c1','1. 업체관리','card') };
  const items = { c: { id:'c', kind:'card', group:'c1', erpAutoFoldered:1 } };
  const r = runAutoFolder(gs, items, { c: 끝난업체 });
  assert.equal(r.madeGroups.length, 1, '명함용 종료 폴더를 만들어야 한다');
  assert.equal(r.madeGroups[0].name, '5.계약해지',
    '★ 「업체퇴사」로 만들었다 — 같은 뜻인데 이름이 둘로 갈린다');
  assert.equal(r.madeGroups[0].kind, 'card');
  assert.equal(items.c.group, r.madeGroups[0].id);
});

test('대표님이 이름을 바꾸면 다음에 만들어지는 것도 따라간다', () => {
  const gs = { g2: G('g2','9. 계약종료 사업장','biz'), c1: G('c1','1. 업체관리','card') };
  const items = { c: { id:'c', kind:'card', group:'c1', erpAutoFoldered:1 } };
  const r = runAutoFolder(gs, items, { c: 끝난업체 });
  assert.equal(r.madeGroups[0].name, '9. 계약종료 사업장');
});

test('반대쪽에도 없으면 그때만 예전 이름(업체퇴사)을 쓴다', () => {
  const gs = { c1: G('c1','1. 업체관리','card') };
  const items = { c: { id:'c', kind:'card', group:'c1', erpAutoFoldered:1 } };
  const r = runAutoFolder(gs, items, { c: 끝난업체 });
  assert.equal(r.madeGroups[0].name, '업체퇴사');
});

test('★ 손으로 누르는 정리 도구도 «같은 이름 규칙»을 쓴다 — 두 길이 달라지면 안 된다', () => {
  const tidy = fnBody('openErpClosedTidy');
  assert.match(tidy, /newClosedFolderName\(/,
    '★ 정리 도구가 제 이름을 따로 갖고 있다 — 자동 쪽과 다른 폴더를 만든다');
  assert.ok(tidy.indexOf("name:'업체퇴사'") < 0, '이름을 글자로 박아 두면 안 된다');
});

/* ══════ ⑧ 같은 뜻인데 «비어 있는» 폴더 (대표 결정 2026-08-31 「빈 쪽을 자동으로 치운다」) ══════
   대표 화면에 「1. 업체관리 88」과 「업체관리 0」이 함께 있었다. 앱이 새 등록증을
   넣을 때 어느 쪽을 고를지 정해져 있지 않아, 나중에 88 과 0 으로 갈린다. */

test('★ 같은 뜻인데 비어 있는 폴더는 치운다 — 안 그러면 88 과 0 으로 갈린다', () => {
  const gs = { g1: G('g1','1. 업체관리','biz'), g0: G('g0','업체관리','biz') };
  const items = { a: { id:'a', kind:'biz', group:'g1' } };
  const r = runAutoFolder(gs, items, { a: 사는업체 });
  assert.ok(!r.groups.g0, '★ 빈 중복 폴더가 남았다 — 새 등록증이 어디로 갈지 흔들린다');
  assert.ok(r.groups.g1, '★ 항목이 든 쪽을 지웠다');
});

test('★ 항목이 «하나라도» 들어 있으면 절대 안 지운다 — 지우면 그 안의 것이 미아가 된다', () => {
  const gs = { g1: G('g1','1. 업체관리','biz'), g0: G('g0','업체관리','biz') };
  const items = { a: { id:'a', kind:'biz', group:'g1' }, b: { id:'b', kind:'biz', group:'g0' } };
  const r = runAutoFolder(gs, items, { a: 사는업체 });
  assert.ok(r.groups.g0 && r.groups.g1, '★ 둘 다 쓰이고 있으면 그대로 둔다');
});

test('둘 다 비어 있으면 아무것도 안 지운다 — 하나는 남아야 갈 곳이 있다', () => {
  const gs = { g1: G('g1','1. 업체관리','biz'), g0: G('g0','업체관리','biz'),
               z: G('z','5.계약해지','biz') };
  const items = { a: { id:'a', kind:'biz', group:'z' } };
  const r = runAutoFolder(gs, items, { a: 끝난업체 });
  assert.ok(r.groups.g0 && r.groups.g1);
});

test('★ 「업체퇴사 0」과 「5.계약해지 30」도 같은 뜻으로 본다 — 갈린 것을 합친다', () => {
  const gs = { g2: G('g2','5.계약해지','biz'), gx: G('gx','업체퇴사','biz'),
               g1: G('g1','1. 업체관리','biz') };
  const items = { a: { id:'a', kind:'biz', group:'g2' } };
  const r = runAutoFolder(gs, items, { a: 끝난업체 });
  assert.ok(!r.groups.gx,
    '★ 이름만 다른 빈 종료 폴더가 남았다 — 종료 업체가 두 곳으로 갈린 채로 있다');
  assert.ok(r.groups.g2);
});

test('뜻이 «다른» 빈 폴더는 안 건드린다 — 대표님이 만들어 둔 자리다', () => {
  const gs = { g1: G('g1','1. 업체관리','biz'), a: G('a','2. 기타 사업장','biz'),
               b: G('b','3.공공기관','biz'), c: G('c','우리법인','biz') };
  const items = { x: { id:'x', kind:'biz', group:'g1' } };
  const r = runAutoFolder(gs, items, { x: 사는업체 });
  ['a','b','c'].forEach(k => assert.ok(r.groups[k],
    '★ 비었다고 「' + gs[k].name + '」을 지웠다 — 대표님이 쓰려고 만들어 둔 폴더다'));
});

test('잠긴 폴더·아래 폴더가 있는 폴더는 안 건드린다', () => {
  const locked = Object.assign(G('g0','업체관리','biz'), { locked:1 });
  const parent = G('p','업체관리','biz');
  const kid = Object.assign(G('k','아래','biz'), { parent:'p' });
  const gs = { g1: G('g1','1. 업체관리','biz'), g0: locked, p: parent, k: kid };
  const items = { a: { id:'a', kind:'biz', group:'g1' } };
  const r = runAutoFolder(gs, items, { a: 사는업체 });
  assert.ok(r.groups.g0, '★ 잠긴 폴더를 지웠다');
  assert.ok(r.groups.p, '★ 아래에 폴더를 둔 것을 지웠다 — 아래 것이 미아가 된다');
});

test('명함용과 사업자용은 «따로» 센다 — 이름이 같아도 다른 폴더다', () => {
  const gs = { g1: G('g1','업체관리','biz'), c1: G('c1','업체관리','card') };
  const items = { a: { id:'a', kind:'biz', group:'g1' } };
  const r = runAutoFolder(gs, items, { a: 사는업체 });
  assert.ok(r.groups.c1, '★ 사업자 쪽이 쓰인다고 명함 쪽 폴더를 지웠다');
});

test('★ 같은 뜻의 폴더가 둘이면 «쓰이는 쪽»을 고른다 — 늘 같은 답이라야 한다', () => {
  const ctx = { console, Object, String, Array,
    state: { items: { a:{ group:'few' }, b:{ group:'many' }, c:{ group:'many' } } } };
  vm.createContext(ctx);
  vm.runInContext(fnBody('pickBusiestGroup'), ctx);
  const list = [{ id:'few', order:1 }, { id:'many', order:9 }];
  assert.equal(ctx.pickBusiestGroup(list).id, 'many',
    '★ 담긴 것이 적은 쪽을 골랐다 — 새 등록증이 빈 폴더로 흩어진다');
  assert.equal(ctx.pickBusiestGroup(list.slice().reverse()).id, 'many',
    '★ 차례가 바뀌면 답도 바뀐다 — 그것이 88 과 0 으로 갈리던 까닭이다');
  assert.equal(ctx.pickBusiestGroup([]), null);
  assert.equal(ctx.pickBusiestGroup(null), null);
});

/* ══════ ④⑤⑥ 유형 탭 ══════ */

function keep(state, it, erp){
  const li = fnBody('listItems');
  const a = li.indexOf('/* ERP 연결 필터');
  const b = li.indexOf('if (state.erpMgr', a);
  assert.ok(a > 0 && b > a, 'ERP 거르개 대목을 찾지 못했다');
  const ctx = { console, Object, String, Array,
    ErpMatch: { match: () => erp || null, mgrs: () => [] },
    state: state };
  vm.createContext(ctx);
  vm.runInContext('var ok = function(it){ ' + li.slice(a, b) + ' return true; };', ctx);
  ctx.IT = it;
  return vm.runInContext('ok(IT)', ctx);
}
const 등록증 = { id:'x', kind:'biz' };

test('★ 「자문」 탭이 계약 끝난 곳을 «안 센다» — 대표 화면의 그 60이다', () => {
  assert.equal(keep({ erpFilter:'자문' }, 등록증, { type:'자문', left:false }), true);
  assert.equal(keep({ erpFilter:'자문' }, 등록증, { type:'자문', left:true }), false,
    '★ 유형은 「무슨 일을 하던 곳인가」이지 「지금 일하는가」가 아니다 — '
    + '둘을 한 탭에 담으면 자문 몇 곳과 지금 일하는지를 셀 수가 없다');
});

test('★ 「🚪 해지」 탭에서 끝난 곳을 «볼 수 있다» — 빼기만 하면 자료를 잃은 것과 같다', () => {
  assert.equal(keep({ erpFilter:'closed' }, 등록증, { type:'자문', left:true }), true);
  assert.equal(keep({ erpFilter:'closed' }, 등록증, { type:'자문', left:false }), false);
  assert.equal(keep({ erpFilter:'closed' }, 등록증, null), false,
    '업체관리에 «없는» 곳은 해지가 아니다 — 정보가 없을 뿐이다');
});

test('★ 「전체」는 아무것도 안 숨긴다', () => {
  assert.equal(keep({ erpFilter:'' }, 등록증, { type:'자문', left:true }), true,
    '★ 전체에서까지 빼면 그 등록증을 찾을 길이 사라진다');
  /* ⚠ 위는 «ERP 거르개 대목»만 떼어 본 것이라, 목록 다른 자리에서 몰래 빼는 것은
     못 잡는다(2026-08-31 고장넣기에서 드러났다). 그래서 원문에서도 못 박는다 —
     「끝났으니 뺀다」는 판단은 목록 전체에서 «유형 탭 안» 한 곳뿐이어야 한다. */
  /* ⚠ 글자를 그대로 세지 «않는다». 「m.left」로만 찾으면 칸 이름을 바꿔 넣은 고장이
     그냥 통과한다(2026-08-31 고장넣기에서 실제로 샜다 — _m0.left 로 넣었다).
     ⚠ 「끝난 것만 남긴다」(!(m && m.left))는 🚪 해지 탭의 «제 일»이라 세지 않는다.
       여기서 막는 것은 «끝났으니 뺀다»는 판단이 탭 밖으로 새는 것이다. */
  const li = fnBody('listItems');
  const bar = li.indexOf('/* ERP 연결 필터');
  assert.ok(bar > 0, 'ERP 거르개 대목을 찾지 못했다');
  const 밖 = [...li.slice(0, bar).matchAll(/\.left[^;\n]{0,24}return false/g)];
  assert.equal(밖.length, 0,
    '★ 「끝났으니 뺀다」가 ERP 탭 «밖»에도 있다 — 그러면 「전체」에서도 조용히 빠져 '
    + '등록증을 찾을 길이 사라진다: ' + 밖.map(h => h[0]).join(' / '));
  /* 🚪 해지 탭의 「끝난 것만 남긴다」를 먼저 지워 두고 센다 — 그것은 제 일이다 */
  const 블록 = li.slice(bar).replace(/!\([^)]*\.left\)\)/g, '«해지탭»');
  const 안 = [...블록.matchAll(/\.left[^;\n]{0,24}return false/g)];
  assert.equal(안.length, 1,
    '★ 유형 탭 안에서 «끝났으니 뺀다»가 ' + 안.length + '곳이다 — 한 곳이어야 한다: '
    + 안.map(h => h[0]).join(' / '));
  const typeAt = 블록.indexOf("(m.type||'')!==state.erpFilter");
  assert.ok(typeAt > 0 && 안[0].index > typeAt,
    '★ 유형을 견주기 «전»에 뺀다 — 그러면 어느 탭에서든 빠진다');
});

test('업체관리 연결·미연결 거르개는 그대로다', () => {
  assert.equal(keep({ erpFilter:'linked' }, 등록증, { type:'자문', left:true }), true,
    '「연결만」은 끝난 곳도 연결된 곳이다');
  assert.equal(keep({ erpFilter:'none' }, 등록증, { type:'자문', left:false }), false);
  assert.equal(keep({ erpFilter:'none' }, 등록증, null), true);
});

test('★ 「🚪 해지」 탭을 심는 자리가 있다 — 만들어 놓고 안 심으면 켤 길이 없다', () => {
  /* 2026-08-30 의 교훈: 켜는 길이 없는 거르개는 코드만 남는다 */
  assert.match(SRC, /function seedClosedTab\(/, '★ 탭을 심는 자리가 없다');
  assert.match(SRC, /erpFilter:'closed'/, '심는 탭이 이 거르개를 걸어야 한다');
  assert.match(SRC, /seedClosedTab, \d+\)/, '★ 심는 함수를 아무도 안 부른다 — 탭이 안 생긴다');
  /* 유형 탭 씨앗과 «다른 열쇠»여야 한다 — 같으면 지운 탭들이 통째로 되살아난다 */
  const a = SRC.match(/localStorage\.getItem\('pucards_erptabs_v1'\)/);
  const b = SRC.match(/localStorage\.getItem\('pucards_closedtab_v1'\)/);
  assert.ok(a && b, '씨앗 열쇠가 따로 있어야 한다');
});

test('★ 화면이 「closed」라는 «영어 코드»를 사람에게 안 보여 준다', () => {
  const at = SRC.indexOf('const ERP_FILTER_LABEL');
  assert.ok(at > 0, '★ 이름표가 없다 — 조건 띠에 「closed」라고 뜬다');
  const decl = SRC.slice(at, SRC.indexOf('};', at));
  assert.match(decl, /closed:/, 'closed 의 이름표가 있어야 한다');
  assert.match(fnBody('narrowLabel'), /ERP_FILTER_LABEL\[state\.erpFilter\]/,
    '★ 좁힘 설명이 이름표를 안 쓴다');
});
