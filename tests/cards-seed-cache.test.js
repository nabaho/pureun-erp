/* 기업정보함 — 명함 씨앗(지난 스냅숏) 먼저 그리기 (대표 보고 2026-08-29 「기업정보함도 빨리」)

   명함 6,636장(2.5MB)은 살찐 칸이 없어 줄일 수 없다. 그래서 지난 로그인 때 담아 둔
   것을 «즉시» 그리고, 서버 것이 오는 대로 한 장씩 갈아 끼운다(watchCardMap 의 seed).

   여기서 지키는 것 넷.
   ① 씨앗을 주면 서버가 오기 «전에» 화면이 선다.
   ② 서버 것이 오면 씨앗을 «갈아 끼운다» — 옛 값이 새 값을 이기면 안 된다.
   ③ 그 사이 지워진 명함(씨앗에만 있는 것)은 첫 스트림이 끝날 때 걷는다 —
      안 걷으면 지운 명함이 유령으로 영영 남는다.
   ④ 씨앗이 없으면 예전과 똑같다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

/* 가짜 서버 — child_added 를 손으로 흘려 넣고, 시계도 손으로 돌린다.
   ⚠ setTimeout 을 즉시 돌리면 안 된다 — publish 마다 settled 가 울려
     «첫 스트림이 끝났다»(유령 걷기)가 스트림 중간에 잘못 돈다. */
function load(){
  const held = { paints: [], timers: {}, tid: 0, handlers: {} };
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, Promise,
    setTimeout: (fn)=>{ const id = ++held.tid; held.timers[id] = fn; return id; },
    clearTimeout: (id)=>{ delete held.timers[id]; },
  };
  vm.createContext(ctx);
  vm.runInContext(cut('function watchCardMap', '\nconst Store = {'), ctx);
  held.flush = ()=>{           /* 걸려 있는 시계를 모두 울린다(스트림이 잠잠해졌다) */
    const fns = Object.values(held.timers); held.timers = {};
    fns.forEach(f=>f());
  };
  held.ref = {
    on(ev, fn){ held.handlers[ev] = fn; },
    off(){}, limitToFirst(){ return { once: ()=>({ then: ()=>({ catch(){} }) }) }; }
  };
  held.add = (key, val)=>held.handlers['child_added']({ key, val: ()=>val });
  held.remove = (key)=>held.handlers['child_removed']({ key, val: ()=>null });
  return { ctx, held };
}
const CARD = n => ({ id: n, name: n, company: n + '상사' });

test('★ 씨앗을 주면 서버가 오기 «전에» 화면이 선다', () => {
  const { ctx, held } = load();
  ctx.watchCardMap(held.ref, m=>held.paints.push(Object.assign({}, m)), null, null,
    { a: CARD('가'), b: CARD('나') });
  assert.ok(held.paints.length >= 1, '씨앗을 줬는데 한 번도 안 그렸습니다');
  assert.deepEqual(Object.keys(held.paints[0]).sort(), ['a','b'],
    '씨앗이 화면에 안 섰습니다 — 2.5MB 를 다 받을 때까지 비어 있습니다');
});

test('★ 서버 것이 오면 씨앗을 갈아 끼운다 — 옛 값이 새 값을 이기면 안 된다', () => {
  const { ctx, held } = load();
  ctx.watchCardMap(held.ref, m=>held.paints.push(Object.assign({}, m)), null, null,
    { a: { id:'a', name:'옛이름' } });
  held.add('a', { id:'a', name:'새이름' });
  const last = held.paints[held.paints.length - 1];
  assert.equal(last.a.name, '새이름', '서버 것이 왔는데 씨앗(옛 판)이 그대로입니다');
});

test('★★ 그 사이 지워진 명함은 첫 스트림이 끝날 때 걷는다 — 유령이 영영 남는다', () => {
  const { ctx, held } = load();
  let settled = 0;
  ctx.watchCardMap(held.ref, m=>held.paints.push(Object.assign({}, m)), ()=>settled++, null,
    { a: CARD('가'), zombie: CARD('그사이지운것') });
  held.add('a', CARD('가'));            /* 서버에는 a 만 있다 */
  held.flush();                          /* 스트림이 잠잠해졌다 — 첫 settled */
  assert.ok(settled >= 1, '검사 밑그림이 틀렸습니다 — settled 가 안 울렸습니다');
  const last = held.paints[held.paints.length - 1];
  assert.ok(last.a, '살아 있는 명함까지 걷었습니다');
  assert.ok(!last.zombie,
    '지워진 명함이 유령으로 남았습니다 — 대표가 지운 것이 화면에 계속 보입니다');
});

test('첫 걷기 «뒤에» 지워진 것은 예전 길(child_removed)로 걷힌다', () => {
  const { ctx, held } = load();
  ctx.watchCardMap(held.ref, m=>held.paints.push(Object.assign({}, m)), null, null,
    { a: CARD('가') });
  held.add('a', CARD('가'));
  held.flush();
  held.remove('a');
  const last = held.paints[held.paints.length - 1];
  assert.ok(!last.a, '지운 명함이 남아 있습니다');
});

test('씨앗이 없으면 예전과 똑같다 — 씨앗 길이 본길을 건드리면 안 된다', () => {
  const { ctx, held } = load();
  let settled = 0;
  ctx.watchCardMap(held.ref, m=>held.paints.push(Object.assign({}, m)), ()=>settled++);
  assert.equal(held.paints.length, 0, '씨앗도 없는데 그렸습니다');
  held.add('a', CARD('가'));
  held.add('b', CARD('나'));
  held.flush();
  assert.equal(settled, 1);
  const last = held.paints[held.paints.length - 1];
  assert.deepEqual(Object.keys(last).sort(), ['a','b']);
});

/* ══════ 씨앗으로 그린 동안은 «저장을 막는다» ══════
   씨앗은 옛 판일 수 있다 — 그 위에 고쳐 쓰면 남이 그 사이 고친 것을 도로 덮는다. */
test('★ 최신본이 오기 전에는 저장이 막히고, 오면 풀린다', () => {
  /* Store.put 은 덩어리가 커서 통째로 못 돌린다 — 막는 «조건»이 사는 줄을 본다.
     조건이 지워지면 이 검사가 걸린다. */
  const guard = src.indexOf("_cardSeedUsed && !Store._itemsReady");
  assert.ok(guard > 0, '저장을 막는 조건이 없습니다');
  const put = src.indexOf('put(it){ it.updatedAt');
  assert.ok(put > 0 && guard > put && guard - put < 600,
    '막는 조건이 Store.put 안에 있지 않습니다');
  /* 풀리는 자리 — 최신본이 다 오면(_itemsReady) 표를 내린다 */
  assert.ok(/Store\._itemsReady=true; _cardSeedUsed=false;/.test(src),
    '최신본이 와도 저장 금지가 안 풀립니다 — 영영 저장을 못 합니다');
});
