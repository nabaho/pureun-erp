/* 명함첩 — 옛 명함에 박힌 썸네일을 밖으로 빼내기.
   실행: node --test tests/cards-thumb-migrate.test.js

   대표 기기 2026-08-16: 기업정보함을 열 때마다 pucards/items 를 통째로 4.92MB 받는데
   그 절반인 2.48MB 가 썸네일이었다. Store.put 은 이미 썸네일을 items 밖(thumbs/)으로
   빼고 있고, 그 변경 뒤로 한 번도 저장된 적 없는 옛 명함만 아직 안에 품고 있다.

   ★ 여기서 못 박는 것 — 이 중 하나라도 깨지면 회사의 진짜 명함 사진이 사라진다
     ① 그림을 새 자리에 넣는 것과 옛 자리를 비우는 것이 **같은 묶음**에 들어간다
        (같은 update() = 둘 다 되거나 둘 다 안 된다. 그림이 없는 중간 상태가 없다)
     ② `items/<id>` 를 통째로 쓰는 경로가 하나도 없다 (남이 고친 이름을 되돌린다)
     ③ 빈 문자열 썸네일('' = 사진 없음)은 건드리지 않는다
     ④ 뒷면은 thumbs/<id>_b 로 간다
     ⑤ 창고(root)가 다르면 다른 묶음으로 간다
     ⑥ 한 묶음이 정해 둔 장수를 안 넘는다
     ⑦ 대표가 아니면 아무 것도 안 쓴다
   설계: docs/superpowers/specs/2026-08-16-썸네일-빼내기-design.md */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* 줄바꿈을 하나로 맞춘다 — 파일은 CRLF 라 '\n' 로 찾으면 안 걸린다 */
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 이름 붙은 시작·끝 표시로만 자른다 — 글자 수로 자르면 옆 코드가 자랄 때 조용히 어긋난다 */
function cut(from, to){
  const i = src.indexOf(from); assert.ok(i >= 0, '못 찾음: ' + from);
  const j = src.indexOf(to, i); assert.ok(j > i, '끝을 못 찾음: ' + to);
  return src.slice(i, j);
}

/* 순수 함수 세 개(_inlineThumbVal 포함)를 한 덩어리로 돌린다.
   ⚠ 한 번의 runInContext 안에서 돌려야 한다 — 맨 위 const 는 컨텍스트 속성이 되지
     않지만, 같은 덩어리 안의 function 들은 그 const 를 그대로 본다. */
function load(extra){
  const ctx = Object.assign({
    console, Object, Array, String, Number, Math, JSON, RegExp
  }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(cut('const _inlineThumbVal', 'const THUMB_MIG_CHUNK'), ctx);
  return ctx;
}

const shared = () => 'pucards';
/* 앞면 그림이 든 옛 명함 n장 */
const mk = (n, from) => Array.from({ length: n }, (_, i) => ({
  id: 'c' + ((from || 0) + i), name: '홍길동', thumb: 'data:image/jpeg;base64,AAA' + i
}));

/* ══════ ① 세기 ══════ */

test('값이 있는 것만 센다 — 빈 문자열·없는 칸은 안 센다', () => {
  const C = load();
  const r = C.countInlineThumbs({
    a: { id:'a', thumb:'xxx' },      /* ① 값 있음 → 옮길 대상 */
    b: { id:'b', thumb:'' },         /* ② 사진 없음 → 건드리지 않는다 */
    c: { id:'c' },                   /* ③ 이미 옮겨짐 */
    d: { id:'d', thumb2:'yyyy' }     /* 뒷면만 있는 것도 대상 */
  });
  assert.equal(r.n, 2);
  assert.equal(r.bytes, 3 + 4);
});

test('앞뒤 둘 다 있어도 명함은 한 장으로 세고 크기는 합친다', () => {
  const C = load();
  const r = C.countInlineThumbs({ a: { id:'a', thumb:'12345', thumb2:'678' } });
  assert.equal(r.n, 1);
  assert.equal(r.bytes, 8);
});

test('세기만 한다 — 목록을 건드리지 않는다', () => {
  const C = load();
  const items = { a: { id:'a', thumb:'xxx' } };
  C.countInlineThumbs(items);
  assert.equal(items.a.thumb, 'xxx');
});

test('빈 목록·없는 목록에도 안 깨진다', () => {
  const C = load();
  assert.equal(C.countInlineThumbs({}).n, 0);
  assert.equal(C.countInlineThumbs(null).n, 0);
  assert.equal(C.countInlineThumbs([{ id:'a', thumb:'xx' }]).n, 1);
});

/* ══════ ② 안전 속성 — 넣기와 비우기가 같은 묶음 ══════ */

test('★ 그림 넣기와 옛 자리 비우기가 같은 묶음에 들어간다', () => {
  /* 이것이 이 기능의 목숨줄이다. 둘이 다른 묶음으로 갈리면 사이에서 끊겼을 때
     그림이 어디에도 없는 명함이 생긴다 — 회사의 진짜 명함 사진이다. */
  const C = load();
  const plan = C.thumbMigrationPlan(mk(120), shared, 50);
  assert.ok(plan.length > 1, '여러 묶음으로 나뉘는 상황에서 확인해야 뜻이 있다');
  plan.forEach((upd, bi) => {
    const put = [], clr = [];
    Object.keys(upd).forEach(k => {
      let m;
      if ((m = /\/thumbs\/(.+)$/.exec(k))) put.push(m[1]);
      else if ((m = /\/items\/([^/]+)\/thumb$/.exec(k))) clr.push(m[1]);
      else if ((m = /\/items\/([^/]+)\/thumb2$/.exec(k))) clr.push(m[1] + '_b');
    });
    assert.deepEqual(put.slice().sort(), clr.slice().sort(),
      `${bi}번째 묶음에서 넣기와 비우기가 갈렸다 — 중간에 끊기면 그림이 사라진다`);
  });
});

test('★ 앞뒤 그림 한 장도 넣기·비우기가 통째로 한 묶음이다', () => {
  const C = load();
  const plan = C.thumbMigrationPlan({ a:{ id:'a', thumb:'F', thumb2:'B' } }, shared, 50);
  assert.equal(plan.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(plan[0])), {
    'pucards/thumbs/a':        'F',
    'pucards/items/a/thumb':   null,
    'pucards/thumbs/a_b':      'B',
    'pucards/items/a/thumb2':  null
  });
});

test('★ 계획 전체에서 「넣기만 있고 비우기가 없는」 명함이 하나도 없다', () => {
  const C = load();
  const items = mk(7).concat([{ id:'z', thumb2:'BB' }]);
  const seen = {};
  C.thumbMigrationPlan(items, shared, 3).forEach(upd => {
    Object.keys(upd).forEach(k => {
      let m;
      if ((m = /\/thumbs\/(.+)$/.exec(k))) (seen[m[1]] = seen[m[1]] || {}).put = 1;
      else if ((m = /\/items\/([^/]+)\/thumb$/.exec(k))) (seen[m[1]] = seen[m[1]] || {}).clr = 1;
      else if ((m = /\/items\/([^/]+)\/thumb2$/.exec(k))) (seen[m[1] + '_b'] = seen[m[1] + '_b'] || {}).clr = 1;
    });
  });
  assert.equal(Object.keys(seen).length, 8);
  Object.keys(seen).forEach(id => {
    assert.ok(seen[id].put, id + ' 는 옛 자리만 비우고 새 자리에 안 넣는다 — 그림이 사라진다');
    assert.ok(seen[id].clr, id + ' 는 새 자리에 넣기만 하고 옛 자리를 안 비운다');
  });
});

test('비우는 값은 정확히 null 이다 — 빈 문자열로 지우면 「사진 없음」이 되어버린다', () => {
  const C = load();
  const upd = C.thumbMigrationPlan(mk(1), shared, 50)[0];
  assert.equal(upd['pucards/items/c0/thumb'], null);
  assert.ok(!('' === upd['pucards/items/c0/thumb']));
});

/* ══════ ③ items 를 통째로 쓰지 않는다 ══════ */

test('★ items/<id> 를 통째로 쓰는 경로가 하나도 없다', () => {
  /* 통째 쓰기는 그 사이 남이 고친 이름·전화를 되돌린다(2026-08-11 실제 사고). */
  const C = load();
  const items = mk(60).concat([{ id:'z', thumb:'A', thumb2:'B' }]);
  C.thumbMigrationPlan(items, shared, 50).forEach(upd => {
    Object.keys(upd).forEach(k => {
      assert.ok(!/\/items\/[^/]+$/.test(k), '명함을 통째로 쓴다: ' + k);
      const tail = k.split('/items/')[1];
      if (tail) assert.ok(/^[^/]+\/(thumb|thumb2)$/.test(tail), '썸네일 칸 말고 다른 칸을 건드린다: ' + k);
    });
  });
});

test('이름·전화 같은 다른 칸은 계획에 아예 안 들어간다', () => {
  const C = load();
  const upd = C.thumbMigrationPlan({ a:{ id:'a', name:'홍길동', mobile:'010', thumb:'F' } }, shared, 50)[0];
  const blob = JSON.stringify(JSON.parse(JSON.stringify(upd)));
  assert.ok(blob.indexOf('홍길동') < 0, '이름이 실렸다');
  assert.ok(blob.indexOf('010') < 0, '전화가 실렸다');
});

/* ══════ ④ 건드리면 안 되는 것 ══════ */

test('빈 문자열 썸네일은 계획에 안 들어간다 — 「사진 없음」 표시다', () => {
  const C = load();
  assert.equal(C.thumbMigrationPlan({ a:{ id:'a', thumb:'' } }, shared, 50).length, 0);
  assert.equal(C.thumbMigrationPlan({ a:{ id:'a', thumb:'', thumb2:'' } }, shared, 50).length, 0);
});

test('앞면은 비었고 뒷면만 있으면 뒷면만 옮긴다 — 앞면의 「사진 없음」은 그대로 둔다', () => {
  const C = load();
  const upd = C.thumbMigrationPlan({ a:{ id:'a', thumb:'', thumb2:'B' } }, shared, 50)[0];
  assert.deepEqual(JSON.parse(JSON.stringify(upd)), {
    'pucards/thumbs/a_b':     'B',
    'pucards/items/a/thumb2': null
  });
});

test('이미 옮긴 명함(칸 자체가 없음)은 계획에 안 들어간다', () => {
  const C = load();
  assert.equal(C.thumbMigrationPlan({ a:{ id:'a', name:'홍길동' } }, shared, 50).length, 0);
});

test('id 가 없거나 그림이 글자가 아니면 조용히 건너뛴다', () => {
  const C = load();
  const plan = C.thumbMigrationPlan(
    [null, { thumb:'A' }, { id:'x', thumb:{} }, { id:'y', thumb:1 }, { id:'ok', thumb:'A' }], shared, 50);
  assert.equal(plan.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(plan[0]))).sort(),
    ['pucards/items/ok/thumb', 'pucards/thumbs/ok']);
});

/* ══════ ⑤ 뒷면 자리 ══════ */

test('뒷면은 thumbs/<id>_b 로 간다', () => {
  const C = load();
  const upd = C.thumbMigrationPlan({ a:{ id:'a', thumb2:'B' } }, shared, 50)[0];
  assert.ok('pucards/thumbs/a_b' in upd, '뒷면이 앞면 자리를 덮어쓰면 앞면 그림이 사라진다');
  assert.ok(!('pucards/thumbs/a' in upd));
});

/* ══════ ⑥ 창고(root) ══════ */

test('창고가 다르면 다른 묶음으로 간다 — 한 update() 에 섞으면 통째로 거부된다', () => {
  const C = load();
  const rootOf = id => id === 'c1' ? 'pucards_private/u1' : 'pucards';
  const plan = C.thumbMigrationPlan(mk(3), rootOf, 50);
  assert.equal(plan.length, 2);
  plan.forEach(upd => {
    const roots = new Set(Object.keys(upd).map(k => k.split('/')[0]));
    assert.equal(roots.size, 1, '한 묶음에 창고가 섞였다');
  });
});

test('개인 창고 명함이 공용 자리에 절대 안 실린다', () => {
  const C = load();
  const rootOf = id => id === 'c0' ? 'pucards_private/u1' : 'pucards';
  C.thumbMigrationPlan(mk(3), rootOf, 50).forEach(upd => {
    Object.keys(upd).forEach(k => {
      if (k.indexOf('/c0') >= 0) assert.ok(k.indexOf('pucards_private/u1/') === 0, 'c0 가 공용 자리에 실렸다: ' + k);
    });
  });
});

test('창고를 모르면(빈 값) 아예 계획에서 뺀다 — 뿌리 없는 경로로 쓰면 안 된다', () => {
  const C = load();
  const plan = C.thumbMigrationPlan(mk(2), id => id === 'c0' ? '' : 'pucards', 50);
  assert.equal(plan.length, 1);
  Object.keys(plan[0]).forEach(k => assert.ok(k.indexOf('pucards/') === 0, '뿌리 없는 경로: ' + k));
});

/* ══════ ⑦ 묶음 크기 ══════ */

test('한 묶음에 담긴 명함이 50장을 안 넘는다', () => {
  const C = load();
  const plan = C.thumbMigrationPlan(mk(324), shared, 50);
  assert.equal(plan.length, 7);
  plan.forEach(upd => {
    const ids = new Set(Object.keys(upd).map(k => k.replace(/_b$/, '').split('/')[2]));
    assert.ok(ids.size <= 50, '한 묶음에 ' + ids.size + '장이 담겼다');
  });
});

test('딱 나누어떨어져도 빈 묶음을 만들지 않는다', () => {
  const C = load();
  assert.equal(C.thumbMigrationPlan(mk(100), shared, 50).length, 2);
  assert.equal(C.thumbMigrationPlan(mk(101), shared, 50).length, 3);
});

test('옮길 것이 없으면 한 묶음도 안 보낸다', () => {
  const C = load();
  assert.equal(C.thumbMigrationPlan({}, shared, 50).length, 0);
  assert.equal(C.thumbMigrationPlan(null, shared, 50).length, 0);
});

test('묶음 크기를 이상하게 줘도 0장짜리 묶음으로 굳지 않는다', () => {
  const C = load();
  assert.equal(C.thumbMigrationPlan(mk(3), shared, 0).length, 3);
  assert.equal(C.thumbMigrationPlan(mk(3), shared).length, 3);
});

test('창고를 함수 대신 글자로 줘도 된다', () => {
  const C = load();
  const upd = C.thumbMigrationPlan(mk(1), 'pucards', 50)[0];
  assert.ok('pucards/thumbs/c0' in upd);
});

/* ══════ ⑧ 옮긴 것을 화면에 반영 ══════ */

function loadApply(){
  const Store = { thumbCache:{} };
  const state = { items:{}, priv:{ items:{} } };
  return load({ Store, state });
}

test('옮긴 그림을 thumbCache 에 넣는다 — 방금 옮긴 것을 다시 받으러 가지 않게', () => {
  const C = loadApply();
  C.state.items.a = { id:'a', thumb:'F', thumb2:'B' };
  const upd = C.thumbMigrationPlan(C.state.items, shared, 50)[0];
  const n = C.applyThumbMigration(upd);
  assert.equal(n, 1, '옮긴 장수를 돌려준다');
  assert.equal(C.Store.thumbCache.a, 'F');
  assert.equal(C.Store.thumbCache.a_b, 'B');
});

test('화면 쪽 it.thumb 도 떼어 ①→③ 으로 맞춘다 (thumbCache 로 그대로 보인다)', () => {
  const C = loadApply();
  C.state.items.a = { id:'a', name:'홍', thumb:'F' };
  C.applyThumbMigration(C.thumbMigrationPlan(C.state.items, shared, 50)[0]);
  assert.ok(!('thumb' in C.state.items.a), '옛 자리가 화면 쪽에 남아 있다');
  assert.equal(C.state.items.a.name, '홍', '다른 칸을 건드렸다');
  assert.equal(C.Store.thumbCache.a, 'F');
});

test('개인 창고 명함도 화면 쪽에 반영한다', () => {
  const C = loadApply();
  C.state.priv.items.p1 = { id:'p1', thumb:'F' };
  C.applyThumbMigration(C.thumbMigrationPlan(C.state.priv.items, () => 'pucards_private/u1', 50)[0]);
  assert.ok(!('thumb' in C.state.priv.items.p1));
  assert.equal(C.Store.thumbCache.p1, 'F');
});

test('옮기지 않은 「사진 없음」 명함의 빈 칸은 그대로 둔다', () => {
  const C = loadApply();
  C.state.items.a = { id:'a', thumb:'', thumb2:'B' };
  C.applyThumbMigration(C.thumbMigrationPlan(C.state.items, shared, 50)[0]);
  assert.equal(C.state.items.a.thumb, '', '「사진 없음」 표시가 지워지면 화면이 매번 받으러 간다');
  assert.ok(!('thumb2' in C.state.items.a));
});

/* ══════ ⑨ 실제로 보내는 쪽 ══════ */

function loadRunner(over){
  const calls = [];
  const o = over || {};
  const ctx = load();
  const state = Object.assign({ isAdmin:true, items:{}, priv:{ items:{} } }, o.state || {});
  const Store = {
    mode: ('mode' in o) ? o.mode : 'firebase',
    thumbCache: {},
    _rootOf: () => 'pucards',
    db: { ref: () => ({ update: upd => { calls.push(upd); return (o.fail && o.fail(calls.length)) ? Promise.reject(new Error('권한 없음')) : Promise.resolve(); } }) }
  };
  const toasts = [];
  let asked = null;
  Object.assign(ctx, {
    state, Store, calls, toasts,
    toast: (t) => toasts.push(String(t)),
    confirm: (m) => { asked = String(m); return ('yes' in o) ? o.yes : true; },
    allItems: () => state.items,
    render: () => {},
    Promise, setTimeout,
    asked: () => asked
  });
  vm.runInContext(cut('const THUMB_MIG_CHUNK', '/* ── 유틸 ── */'), ctx);
  ctx.askedMsg = () => asked;
  return ctx;
}

const someCards = n => { const m = {}; mk(n).forEach(it => { m[it.id] = it; }); return m; };

test('★ 대표가 아니면 아무 것도 안 쓴다', async () => {
  const C = loadRunner({ state:{ isAdmin:false, items:someCards(3), priv:{ items:{} } } });
  const r = await C.migrateInlineThumbs();
  assert.equal(r, null);
  assert.equal(C.calls.length, 0, '대표가 아닌데 서버에 썼다');
  assert.match(C.toasts.join(' '), /대표만/);
});

test('클라우드가 아니면 안내만 하고 아무 것도 안 한다', async () => {
  const C = loadRunner({ mode:'local', state:{ isAdmin:true, items:someCards(3), priv:{ items:{} } } });
  assert.equal(await C.migrateInlineThumbs(), null);
  assert.equal(C.calls.length, 0);
});

test('먼저 세어서 확인을 받는다 — 취소하면 한 글자도 안 쓴다', async () => {
  const C = loadRunner({ yes:false, state:{ isAdmin:true, items:someCards(3), priv:{ items:{} } } });
  assert.equal(await C.migrateInlineThumbs(), null);
  assert.equal(C.calls.length, 0, '확인 전에 썼다');
  assert.match(C.askedMsg(), /3장/);
});

test('옮길 것이 없으면 확인도 안 묻고 끝난다', async () => {
  const C = loadRunner({ state:{ isAdmin:true, items:{ a:{ id:'a', thumb:'' } }, priv:{ items:{} } } });
  assert.equal(await C.migrateInlineThumbs(), null);
  assert.equal(C.calls.length, 0);
  assert.equal(C.askedMsg(), null);
});

test('50장씩 묶어 보낸다 — 한 장씩 보내면 서버가 막힌다', async () => {
  const C = loadRunner({ state:{ isAdmin:true, items:someCards(120), priv:{ items:{} } } });
  const r = await C.migrateInlineThumbs();
  assert.equal(C.calls.length, 3, '보낸 통 수');
  assert.equal(r.done, 120);
  assert.equal(r.stopped, false);
});

test('묶음 하나가 실패하면 거기서 멈추고 몇 장까지 했는지 알린다', async () => {
  const C = loadRunner({ fail: n => n === 2, state:{ isAdmin:true, items:someCards(120), priv:{ items:{} } } });
  const r = await C.migrateInlineThumbs();
  assert.equal(r.stopped, true);
  assert.equal(r.done, 50, '실패한 묶음은 통째로 안 된 것이므로 50장까지다');
  assert.equal(C.calls.length, 2, '실패 뒤에도 계속 보냈다');
  assert.match(C.toasts.join(' '), /멈췄습니다/);
});

/* ══════ ⑩ 화면에 걸려 있는가 ══════ */

test('보내는 길은 한 곳뿐이고, 한 장씩 보내는 옛 길을 안 쓴다', () => {
  const fn = cut('async function migrateInlineThumbs()', '\n/* ── 유틸 ── */');
  assert.ok(fn.includes('Store.db.ref().update('), '한 번의 update() 로 안 보낸다');
  assert.ok(!/putThumb\(/.test(fn), '한 장씩 putThumb 로 보내면 원자적이지 않다');
  assert.ok(!/delThumb\(/.test(fn), '따로 지우면 그림이 사라지는 중간 상태가 생긴다');
  assert.ok(!/Store\.put\(/.test(fn), '명함을 통째로 저장하면 남의 수정을 되돌린다');
  assert.ok(fn.includes('thumbMigrationPlan('), '계획 함수를 안 쓴다');
});

test('환경설정에 대표 전용 단추가 걸려 있다', () => {
  const i = src.indexOf("btn('migrateInlineThumbs()'");
  assert.ok(i > 0, '환경설정에 단추가 없다');
  const around = src.slice(src.lastIndexOf('state.isAdmin ?', i), i);
  assert.ok(around.length < 400 && around.indexOf('state.isAdmin ?') === 0, '대표 전용 자리 밖에 있다');
});

test('저절로 돌지 않는다 — 부르는 곳은 대표가 누르는 단추뿐이다', () => {
  const hits = src.split('migrateInlineThumbs()').length - 1;
  /* 정의 1 + 단추 1 + (테스트가 찾는) 없음 */
  assert.equal(hits, 2, '어딘가에서 저절로 부르고 있다 (' + hits + '곳)');
});
