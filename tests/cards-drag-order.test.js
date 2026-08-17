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

function loadReorder(){
  const at = source.indexOf('function reorderList(');
  assert.ok(at > 0, 'reorderList 를 찾지 못했습니다');
  const end = source.indexOf('\n}', at) + 2;
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

/* ── 저장 층 ── 네 목록이 같은 저장을 쓴다.
   ⚠ 여기서 지키는 두 가지가 이 기능의 안전선이다.
     ① order 칸만 보낸다 — 레코드를 통째로 set 하면 그 사이 남이 고친 이름이 되돌아간다
     ② 한 번의 update() 로 묶는다 — 하나씩 보내다 끊기면 순서가 반쯤 섞인다 */
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
