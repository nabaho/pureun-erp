'use strict';
/* 폴더·탭을 끌어 순서 바꾸기 — 순서 계산은 순수 함수 하나에 모은다.
   네 목록(명함폴더·기업상세폴더·메인탭·폴더안탭)이 같은 계산을 쓰므로
   여기가 틀리면 네 곳이 함께 틀린다. 그래서 경계를 촘촘히 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 화면을 모르는 «순수 계산» 층만 떼어 온다 — reorderList 와, 앞/뒤를 정하는 ordIsAfter.
   경계는 글자수가 아니라 다음 함수 이름(ordSiblings)이다 — 고정 길이로 자르면
   가운데에 한 줄만 늘어도 소리 없이 걸려 넘어진다. */
function loadReorder(){
  const at = source.indexOf('function reorderList(');
  const end = source.indexOf('\nfunction ordSiblings', at);
  assert.ok(at > 0 && end > at, 'reorderList~ordSiblings 사이를 찾지 못했습니다');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  return ctx;
}
const L = ['a','b','c','d'].map((id,i)=>({ id, order:i+1 }));
/* vm 안에서 만든 객체는 realm 이 달라 deepEqual 이 실패한다 — JSON 왕복으로 맞춘다
   (이 저장소의 다른 검사들과 같은 방식). */
const plain = v => JSON.parse(JSON.stringify(v));

test('위에 있던 것을 아래로 옮긴다 (a 를 c 앞으로)', () => {
  const c = loadReorder();
  const out = plain(c.reorderList(L, 'a', 'c'));
  /* 결과 순서는 b, a, c, d — 바뀐 것만 돌려준다 */
  const byId = {}; out.forEach(x=>{ byId[x.id]=x.order; });
  assert.equal(byId.b, 1);
  assert.equal(byId.a, 2);
  assert.ok(!('c' in byId) || byId.c === 3);
  assert.ok(out.every(x=>x.order>=1 && x.order<=4));
});

test('아래에 있던 것을 위로 옮긴다 (d 를 b 앞으로)', () => {
  const c = loadReorder();
  const out = plain(c.reorderList(L, 'd', 'b'));
  const byId = {}; out.forEach(x=>{ byId[x.id]=x.order; });
  assert.equal(byId.d, 2);
  assert.equal(byId.b, 3);
});

test('제자리에 놓으면 아무 것도 안 바꾼다', () => {
  const c = loadReorder();
  assert.deepEqual(plain(c.reorderList(L, 'b', 'b')), []);
});

test('목록에 없는 것을 주면 아무 것도 안 바꾼다', () => {
  const c = loadReorder();
  assert.deepEqual(plain(c.reorderList(L, 'zzz', 'b')), []);
  assert.deepEqual(plain(c.reorderList(L, 'b', 'zzz')), []);
});

test('한 개짜리 목록은 아무 것도 안 바꾼다', () => {
  const c = loadReorder();
  assert.deepEqual(plain(c.reorderList([{id:'a',order:1}], 'a', 'a')), []);
});

test('order 가 아예 없던 목록도 1..n 으로 매겨 준다', () => {
  /* 지금 폴더는 만들 때 order:Date.now() 를 받아 값이 제각각이다 */
  const c = loadReorder();
  const raw = [{id:'a'},{id:'b',order:1755300000000},{id:'c'}];
  const out = plain(c.reorderList(raw, 'c', 'a'));
  const orders = out.map(x=>x.order).sort((x,y)=>x-y);
  assert.ok(orders.every(n=>Number.isInteger(n) && n>=1 && n<=3), '1..n 정수여야 한다: '+JSON.stringify(out));
});

test('바뀌지 않은 항목은 돌려주지 않는다 (쓸데없는 저장을 안 만든다)', () => {
  const c = loadReorder();
  const already = [{id:'a',order:1},{id:'b',order:2},{id:'c',order:3}];
  const out = plain(c.reorderList(already, 'a', 'b'));
  /* a 를 b 앞에 놓으면 지금과 같은 자리다 — 바뀐 것이 없어야 한다 */
  assert.deepEqual(out, []);
});

/* ── 앞에 꽂기 / 뒤에 꽂기 ──
   ⚠ 늘 앞에만 꽂던 시절에는 **맨 끝자리에 놓을 길이 아예 없었다**. 명함 폴더는 ⋮ 메뉴의
     「⬇ 아래로」로 돌아갈 수 있었지만 기업 상세 폴더·메인 탭·＃탭에는 그 메뉴가 없다.
     설계서가 요구한 「맨 끝으로」가 바로 이 자리다. */
const orderMap = out => { const m={}; out.forEach(x=>{ m[x.id]=x.order; }); return m; };

test('★ 맨 앞의 것을 맨 끝으로 옮긴다 (a 를 d «뒤»로) — 설계서가 요구한 자리', () => {
  const c = loadReorder();
  const m = orderMap(plain(c.reorderList(L, 'a', 'd', true)));
  assert.equal(m.b, 1);
  assert.equal(m.c, 2);
  assert.equal(m.d, 3);
  assert.equal(m.a, 4, '뒤에 꽂기가 없으면 맨 끝자리에 영영 못 놓는다');
});

test('같은 목표라도 앞/뒤에 따라 자리가 달라진다 (a→d 앞 vs 뒤)', () => {
  const c = loadReorder();
  const before = orderMap(plain(c.reorderList(L, 'a', 'd', false)));
  const after  = orderMap(plain(c.reorderList(L, 'a', 'd', true)));
  assert.equal(before.a, 3, '앞에 꽂으면 d 바로 앞자리다');
  assert.equal(after.a, 4, '뒤에 꽂으면 d 다음 — 맨 끝이다');
});

test('맨 끝의 것을 맨 앞으로 옮긴다 (d 를 a «앞»으로)', () => {
  const c = loadReorder();
  const m = orderMap(plain(c.reorderList(L, 'd', 'a', false)));
  assert.equal(m.d, 1);
  assert.equal(m.a, 2);
});

test('가운데 것을 그 다음 것 «뒤»로 한 칸 내린다 (b→c 뒤)', () => {
  const c = loadReorder();
  const m = orderMap(plain(c.reorderList(L, 'b', 'c', true)));
  assert.equal(m.c, 2);
  assert.equal(m.b, 3);
});

test('after 를 안 주면 예전처럼 «앞»에 꽂는다 (부르는 곳이 빠뜨려도 안 튄다)', () => {
  const c = loadReorder();
  assert.deepEqual(plain(c.reorderList(L, 'a', 'c')), plain(c.reorderList(L, 'a', 'c', false)));
});

/* ── 앞/뒤를 «어떻게» 정하는가 — 옆줄 폴더(세로)는 아래 절반, 윗줄 탭 칩(가로)은
   오른쪽 절반이 뒤다.
   ⚠ 2026-08-17: ＃탭(coftab)이 옆줄에서 윗줄 탭 칩으로 옮겨 가며 «축이 바뀌었다».
     축을 안 따라 옮기면 가로로 늘어선 칩을 위/아래로 재게 되어, 눈에 보이는
     세로선(#pcErpTabs .ord-dragover)과 실제로 놓이는 자리가 어긋난다. ── */
const RECT = { left:100, top:200, width:200, height:40 };

test('★ 세로 목록(옆줄 폴더)은 아래 절반에 놓으면 뒤, 위 절반이면 앞이다', () => {
  const c = loadReorder();
  assert.equal(c.ordIsAfter('group',    RECT, 150, 205), false, '위 절반은 앞');
  assert.equal(c.ordIsAfter('group',    RECT, 150, 235), true,  '아래 절반은 뒤');
  assert.equal(c.ordIsAfter('cofolder', RECT, 150, 235), true);
});

test('★ 가로 목록(윗줄 탭 칩)은 오른쪽 절반에 놓으면 뒤다 — 축이 다르다', () => {
  const c = loadReorder();
  assert.equal(c.ordIsAfter('view', RECT, 110, 220), false, '왼쪽 절반은 앞');
  assert.equal(c.ordIsAfter('view', RECT, 290, 220), true,  '오른쪽 절반은 뒤');
  /* 기업 상세의 ＃탭도 같은 윗줄에 있으므로 같은 축이어야 한다 */
  assert.equal(c.ordIsAfter('coftab', RECT, 110, 220), false, '＃탭 왼쪽 절반은 앞');
  assert.equal(c.ordIsAfter('coftab', RECT, 290, 220), true,  '＃탭 오른쪽 절반은 뒤');
  /* 같은 좌표라도 세로 목록이면 축이 달라 답이 다르다 — 갈래로 축을 정한다는 뜻 */
  assert.equal(c.ordIsAfter('group', RECT, 290, 220), false);
});

test('한가운데는 앞으로 친다 — 경계에서 답이 흔들리지 않는다', () => {
  const c = loadReorder();
  assert.equal(c.ordIsAfter('group', RECT, 150, 220), false);
  assert.equal(c.ordIsAfter('view',  RECT, 200, 220), false);
});

test('네모를 못 재면 앞에 꽂는다 (예전과 같은 몸짓 — 갑자기 엉뚱한 데로 안 간다)', () => {
  const c = loadReorder();
  assert.equal(c.ordIsAfter('group', null, 150, 235), false);
});

/* ── 저장 층 ── 네 목록이 같은 저장을 쓴다.
   ⚠ 여기서 지키는 두 가지가 이 기능의 안전선이다.
     ① order 칸만 보낸다 — 레코드를 통째로 set 하면 그 사이 남이 고친 이름이 되돌아간다
     ② 한 번의 update() 로 묶는다 — 하나씩 보내다 끊기면 순서가 반쯤 섞인다 */
/* ＃탭의 형제 차례는 화면에 그리는 coFTabList 를 «그대로» 쓴다 — 그래서 검사도
   흉내 낸 사본이 아니라 그 함수의 진짜 본문을 같은 상자에 넣어 돌린다.
   가짜로 대신하면 본문이 바뀌어도 검사가 눈치채지 못한다. */
function coFTabListSource(){
  const at = source.indexOf('function coFTabList(');
  assert.ok(at > 0, 'coFTabList 를 찾지 못했습니다');
  return source.slice(at, source.indexOf('\n}', at) + 2);
}

function loadSave(opts){
  opts = opts || {};
  const at = source.indexOf('function reorderList(');
  const end = source.indexOf('\nfunction onOrdDragStart', at);
  assert.ok(at > 0 && end > at, 'reorderList~onOrdDragStart 사이를 찾지 못했습니다');
  const updates = [], toasts = [];
  const ctx = {
    DB_ROOT: 'pucards',
    state: {
      isAdmin: opts.isAdmin !== false,
      groups: opts.groups || {},
      views:  opts.views  || {},
      priv:   { groups:{} },
      tab: 'card', group: 'all'
    },
    _coFolders: opts.coFolders || {},
    toast: m => toasts.push(m),
    render: () => {},
    Store: {
      mode: opts.mode || 'firebase',
      db: { ref: p => ({ update: v => { updates.push({ path:p, v }); return Promise.resolve(); } }) }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(coFTabListSource(), ctx);        /* ordSiblings('coftab') 가 이것을 쓴다 */
  vm.runInContext(source.slice(at, end), ctx);
  ctx._updates = updates; ctx._toasts = toasts;
  return ctx;
}

test('★ order 칸만 보낸다 — 레코드를 통째로 set 하지 않는다', async () => {
  const c = loadSave({ groups: {
    g1:{id:'g1', name:'가', order:1, kind:'card'},
    g2:{id:'g2', name:'나', order:2, kind:'card'},
    g3:{id:'g3', name:'다', order:3, kind:'card'}
  }});
  await c.saveOrder('group', 'g3', 'g1', '');
  assert.equal(c._updates.length, 1, '한 번의 update 로 묶어야 한다');
  const keys = Object.keys(c._updates[0].v);
  assert.ok(keys.length > 0, '아무 것도 안 보냈다');
  keys.forEach(k => assert.match(k, /\/order$/, 'order 가 아닌 칸을 보냈다: '+k));
  Object.values(c._updates[0].v).forEach(v =>
    assert.equal(typeof v, 'number', 'order 는 숫자여야 한다'));
});

test('★ 바뀐 것을 한 번의 update() 로 묶어 보낸다', async () => {
  const c = loadSave({ groups: {
    g1:{id:'g1', order:1, kind:'card'}, g2:{id:'g2', order:2, kind:'card'},
    g3:{id:'g3', order:3, kind:'card'}, g4:{id:'g4', order:4, kind:'card'}
  }});
  await c.saveOrder('group', 'g4', 'g1', '');
  assert.equal(c._updates.length, 1, '여러 번 나눠 보내면 중간에 끊길 때 순서가 섞인다');
  assert.equal(c._updates[0].path, 'pucards');
});

test('★ 대표가 아니면 아무 것도 안 쓴다 (화면 게이트를 넘겨도)', async () => {
  const c = loadSave({ isAdmin:false, groups: {
    g1:{id:'g1', order:1, kind:'card'}, g2:{id:'g2', order:2, kind:'card'}
  }});
  await c.saveOrder('group', 'g2', 'g1', '');
  assert.equal(c._updates.length, 0);
});

test('클라우드가 아니면 안내만 하고 안 쓴다', async () => {
  const c = loadSave({ mode:'local', groups: {
    g1:{id:'g1', order:1, kind:'card'}, g2:{id:'g2', order:2, kind:'card'}
  }});
  await c.saveOrder('group', 'g2', 'g1', '');
  assert.equal(c._updates.length, 0);
  assert.ok(c._toasts.length > 0, '왜 안 되는지 알려야 한다');
});

test('바꿀 것이 없으면 서버를 아예 안 부른다', async () => {
  const c = loadSave({ groups: {
    g1:{id:'g1', order:1, kind:'card'}, g2:{id:'g2', order:2, kind:'card'}
  }});
  await c.saveOrder('group', 'g1', 'g1', '');
  assert.equal(c._updates.length, 0);
});

test('명함 폴더는 같은 갈래(kind)끼리만 형제다 — 사업자 폴더가 섞이면 안 된다', async () => {
  const c = loadSave({ groups: {
    c1:{id:'c1', order:1, kind:'card'}, c2:{id:'c2', order:2, kind:'card'},
    b1:{id:'b1', order:1, kind:'biz'}
  }});
  await c.saveOrder('group', 'c2', 'c1', '');
  const keys = Object.keys(c._updates[0].v);
  assert.ok(!keys.some(k=>k.includes('b1')), '다른 갈래 폴더까지 번호를 다시 매겼다');
});

test('기업 상세 폴더는 coFolders 자리에 쓴다', async () => {
  const c = loadSave({ coFolders: {
    f1:{id:'f1', name:'가', order:1}, f2:{id:'f2', name:'나', order:2}
  }});
  await c.saveOrder('cofolder', 'f2', 'f1', '');
  Object.keys(c._updates[0].v).forEach(k => assert.match(k, /^coFolders\/[^/]+\/order$/, k));
});

test('폴더 안 ＃탭은 그 폴더 안 자리에 쓴다', async () => {
  const c = loadSave({ coFolders: {
    f1:{ id:'f1', name:'가', order:1, tabs:{ t1:{name:'하나',order:1}, t2:{name:'둘',order:2} } }
  }});
  await c.saveOrder('coftab', 't2', 't1', 'f1');
  Object.keys(c._updates[0].v).forEach(k =>
    assert.match(k, /^coFolders\/f1\/tabs\/[^/]+\/order$/, k));
});

test('★ ＃탭의 형제 차례가 «화면에 보이는 차례»와 같다 (order 가 같을 때 이름순)', async () => {
  /* 화면(coFTabList)은 order 가 같거나 비면 이름 가나다순으로 가른다. 예전에는 여기서
     order 만 보고 줄을 세워, 대표가 「가·나·다」로 보고 있는데 저장은 키가 꽂힌 차례로
     번호를 다시 매겼다 — 끌어 놓은 자리와 다른 자리로 튀는 셈이다. */
  const c = loadSave({ coFolders: {
    f1:{ id:'f1', name:'폴더', order:1,
         tabs:{ tA:{name:'다'}, tB:{name:'가'}, tC:{name:'나'} } }   /* order 가 아예 없다 */
  }});
  await c.saveOrder('coftab', 'tC', 'tB', 'f1');   /* 「나」를 「가」 앞으로 */
  const v = c._updates[0].v;
  /* 보이는 차례 [가,나,다] 에서 나를 가 앞으로 → [나,가,다] */
  assert.equal(v['coFolders/f1/tabs/tC/order'], 1, '나(tC)가 맨 앞이어야 한다');
  assert.equal(v['coFolders/f1/tabs/tB/order'], 2, '가(tB)가 둘째여야 한다');
  assert.equal(v['coFolders/f1/tabs/tA/order'], 3, '다(tA)가 셋째여야 한다');
});

test('메인 탭은 views 자리에 쓴다', async () => {
  const c = loadSave({ views: {
    v1:{id:'v1', order:1, kind:'card', scope:'all'},
    v2:{id:'v2', order:2, kind:'card', scope:'all'}
  }});
  await c.saveOrder('view', 'v2', 'v1', '');
  Object.keys(c._updates[0].v).forEach(k => assert.match(k, /^views\/[^/]+\/order$/, k));
});

test('저장이 실패하면 알리고 화면을 다시 그린다 (성공한 척 남지 않게)', async () => {
  const c = loadSave({ groups: {
    g1:{id:'g1', order:1, kind:'card'}, g2:{id:'g2', order:2, kind:'card'}
  }});
  let rendered = 0;
  c.render = () => { rendered++; };
  c.Store.db = { ref: () => ({ update: () => Promise.reject(new Error('그물 끊김')) }) };
  await c.saveOrder('group', 'g2', 'g1', '');
  assert.ok(c._toasts.some(m=>/실패/.test(m)), '실패를 알려야 한다');
  assert.ok(rendered > 0, '서버의 실제 순서로 되돌리려면 다시 그려야 한다');
});

/* ══ 손놀림 층 ══ 「보이는 선」과 「실제로 꽂히는 자리」가 어긋나지 않는지 본다.
   선은 아래에 그어 놓고 위에 꽂히면 대표는 자기가 뭘 한 건지 알 수 없다.
   경계는 글자수가 아니라 함수 이름이다 — reorderList 부터 onOrdDrop 의 끝까지. */
function loadHandlers(opts){
  opts = opts || {};
  const at   = source.indexOf('function reorderList(');
  const dAt  = source.indexOf('function onOrdDrop(', at);
  const end  = source.indexOf('\n}', dAt) + 2;
  assert.ok(at > 0 && dAt > at && end > dAt, 'reorderList~onOrdDrop 사이를 찾지 못했습니다');
  const updates = [], toasts = [];
  const ctx = {
    DB_ROOT: 'pucards',
    state: { isAdmin: opts.isAdmin !== false, groups: opts.groups || {},
             views: opts.views || {}, priv:{ groups:{} }, tab:'card', group:'all' },
    _coFolders: opts.coFolders || {},
    toast: m => toasts.push(m),
    render: () => {},
    document: { querySelectorAll: () => [] },
    Store: { mode:'firebase',
             db:{ ref: p => ({ update: v => { updates.push({ path:p, v }); return Promise.resolve(); } }) } }
  };
  vm.createContext(ctx);
  vm.runInContext(coFTabListSource(), ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._updates = updates; ctx._toasts = toasts;
  return ctx;
}
/* 화면 없이 줄 하나를 흉내 낸다 — 붙은 표시(class)와 네모(rect)만 있으면 된다 */
function fakeRow(rect){
  const on = new Set();
  return { _on: on, getBoundingClientRect: () => rect,
           classList: { add: c=>on.add(c), remove: c=>on.delete(c), contains: c=>on.has(c) } };
}
const fakeEvt = (row, x, y) => ({ currentTarget: row, clientX: x, clientY: y,
  preventDefault(){}, stopPropagation(){}, dataTransfer: {} });
/* 그 줄에 지금 그려진 선이 「뒤」인가 — 표시가 하나만 붙어 있어야 뜻이 분명하다 */
function markedAfter(row){
  const before = row._on.has('ord-dragover'), after = row._on.has('ord-dragover-after');
  assert.ok(before !== after, '선 표시가 둘 다 붙었거나 둘 다 없다: '+[...row._on].join(','));
  return after;
}

/* ⚠ 검사마다 «새로 만든다» — saveOrder 는 화면이 곧바로 바뀌도록 state 의 order 를
     제자리에서 고친다. 붙박이 객체를 돌려 쓰면 앞 검사가 바꿔 놓은 순서로 다음 검사가
     시작해, 통과·실패가 실행 차례에 따라 달라진다. */
const four = () => ({ g1:{id:'g1',order:1,kind:'card'}, g2:{id:'g2',order:2,kind:'card'},
                      g3:{id:'g3',order:3,kind:'card'}, g4:{id:'g4',order:4,kind:'card'} });
const threeViews = () => ({ v1:{id:'v1',order:1,kind:'card',scope:'all'},
                            v2:{id:'v2',order:2,kind:'card',scope:'all'},
                            v3:{id:'v3',order:3,kind:'card',scope:'all'} });
const ROW = { left:0, top:300, width:220, height:40 };   /* 세로 목록의 마지막 줄 */

test('★ 마지막 줄 «아래 절반»에 놓으면 맨 끝으로 간다 — ⋮ 메뉴 없이도 끝자리에 놓인다', async () => {
  const c = loadHandlers({ groups: four() });
  const drag = fakeRow(ROW), drop = fakeRow(ROW);
  c.onOrdDragStart(fakeEvt(drag, 0, 0), 'group', 'g1', '');
  c.onOrdDragOver(fakeEvt(drop, 100, 335));            /* 아래 절반 */
  assert.equal(markedAfter(drop), true, '아래 절반인데 「앞」 선을 그렸다');
  await c.onOrdDrop(fakeEvt(drop, 100, 335), 'group', 'g4', '');
  const v = c._updates[0].v;
  assert.equal(v['groups/g1/order'], 4, 'g1 이 맨 끝으로 안 갔다');
  assert.equal(v['groups/g4/order'], 3);
});

test('★ 같은 줄 «위 절반»에 놓으면 그 앞에 꽂힌다 — 선도 「앞」이다', async () => {
  const c = loadHandlers({ groups: four() });
  const drag = fakeRow(ROW), drop = fakeRow(ROW);
  c.onOrdDragStart(fakeEvt(drag, 0, 0), 'group', 'g1', '');
  c.onOrdDragOver(fakeEvt(drop, 100, 305));            /* 위 절반 */
  assert.equal(markedAfter(drop), false, '위 절반인데 「뒤」 선을 그렸다');
  await c.onOrdDrop(fakeEvt(drop, 100, 305), 'group', 'g4', '');
  const v = c._updates[0].v;
  assert.equal(v['groups/g1/order'], 3, 'g4 바로 앞자리여야 한다');
  assert.ok(!('groups/g4/order' in v), 'g4 는 그대로 4번이어야 한다');
});

test('★ 그려진 선과 실제로 꽂히는 자리가 늘 같다 (세로·가로, 위아래·좌우 네 경우)', async () => {
  const CHIP = { left:400, top:10, width:120, height:30 };
  const cases = [
    { kind:'group', opts:()=>({ groups:four() }),       rect:ROW,  drag:'g1', drop:'g4', x:100, y:335, last:4 },
    { kind:'group', opts:()=>({ groups:four() }),       rect:ROW,  drag:'g1', drop:'g4', x:100, y:305, last:3 },
    { kind:'view',  opts:()=>({ views:threeViews() }),  rect:CHIP, drag:'v1', drop:'v3', x:510, y:20,  last:3 },
    { kind:'view',  opts:()=>({ views:threeViews() }),  rect:CHIP, drag:'v1', drop:'v3', x:410, y:20,  last:2 }
  ];
  for(const t of cases){
    const c = loadHandlers(t.opts());
    const drag = fakeRow(t.rect), drop = fakeRow(t.rect);
    c.onOrdDragStart(fakeEvt(drag, 0, 0), t.kind, t.drag, '');
    c.onOrdDragOver(fakeEvt(drop, t.x, t.y));
    const shown = markedAfter(drop);
    await c.onOrdDrop(fakeEvt(drop, t.x, t.y), t.kind, t.drop, '');
    const root = t.kind==='group' ? 'groups/' : 'views/';
    const got = c._updates[0].v[root + t.drag + '/order'];
    assert.equal(got, t.last, `${t.kind} (${t.x},${t.y}) 에서 꽂힌 자리가 다르다`);
    /* 선이 「뒤」였으면 끌던 것이 목표보다 뒤에, 「앞」이었으면 앞에 있어야 한다 */
    const dropNow = c._updates[0].v[root + t.drop + '/order'];
    if(shown) assert.ok(dropNow === undefined || dropNow < got, '「뒤」 선을 그려 놓고 앞에 꽂았다');
    else      assert.ok(dropNow === undefined || dropNow > got, '「앞」 선을 그려 놓고 뒤에 꽂았다');
  }
});

test('선은 한쪽만 남는다 — 위아래를 오가도 반대쪽 선이 안 남는다', () => {
  const c = loadHandlers({ groups: four() });
  const drag = fakeRow(ROW), drop = fakeRow(ROW);
  c.onOrdDragStart(fakeEvt(drag, 0, 0), 'group', 'g1', '');
  c.onOrdDragOver(fakeEvt(drop, 100, 335));
  c.onOrdDragOver(fakeEvt(drop, 100, 305));
  assert.equal(markedAfter(drop), false);
  c.onOrdDragOver(fakeEvt(drop, 100, 335));
  assert.equal(markedAfter(drop), true);
  c.onOrdDragLeave(fakeEvt(drop, 100, 335));
  assert.equal(drop._on.size, 0, '줄에서 벗어나면 선이 모두 지워져야 한다');
});

test('명함을 끄는 중이면 순서 선을 안 그린다 (기존 명함→폴더 드롭을 안 건드린다)', () => {
  const c = loadHandlers({ groups: four() });
  const drop = fakeRow(ROW);
  c.onOrdDragOver(fakeEvt(drop, 100, 335));    /* _dragOrd 가 없다 = 명함 드래그 */
  assert.equal(drop._on.size, 0, '명함을 끄는데 순서 선이 그려졌다');
});
