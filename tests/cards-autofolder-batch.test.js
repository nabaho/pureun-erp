/* 명함첩 — 자동 폴더 배정이 명함 한 장마다 따로 저장하던 것.
   실행: node --test tests/*.test.js

   대표 화면 2026-08-16: 기업 상세에서 파이어베이스 오류가 1ms 간격으로 5,045건.
   그 규모가 어디서 나오는지 세어 보면 —
     Store.put(it) 한 번 = 서버로 가는 메시지 «세 개» (items 1 + 공유색인 idx·bykey 2)
     명함 6,270 + 사업자 346 = 6,616장 → 최대 19,848개
     그것도 화면을 열 때 한 번, 4초 뒤 또 한 번.
   저장이 실패하면 erpAutoFoldered 표시가 서버에 안 남아 «다음 접속에서 또» 전부 나간다.
   끝나지 않는 폭주다.

   ★ 여기서 못 박는 것
     ① 명함이 몇 장이든 보내는 통 수는 「장수 ÷ 한 통 크기」로 묶인다
     ② 개인 폴더 명함은 창고가 달라 따로 담는다 (섞으면 통째로 거부된다)
     ③ 바꾸는 칸만 담는다 — 공유 색인(idx·bykey)은 건드리지 않는다
     ④ 바뀐 것이 없으면 한 통도 안 보낸다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* 줄바꿈을 하나로 맞춘다 — 파일은 CRLF 라 '\n' 로 찾으면 안 걸린다 */
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function load(){
  const i = src.indexOf('  flushPlan(list, rootOf, chunk){');
  assert.ok(i >= 0, 'flushPlan 을 못찾음');
  const j = src.indexOf('\n  }\n};', i);
  assert.ok(j > i, 'flushPlan 끝을 못찾음');
  const ctx = { console, Object, Array, String, Number, Math };
  vm.createContext(ctx);
  vm.runInContext('const ErpMatch = {\n' + src.slice(i, j) + '\n  }\n};\nthis.flushPlan = ErpMatch.flushPlan;', ctx);
  return ctx;
}

const cards = (n, from) => Array.from({ length: n }, (_, i) => ({
  id: 'c' + ((from || 0) + i), group: 'g1', updatedAt: 1000, erpAutoFoldered: 1
}));
const shared = () => 'pucards';

/* ══════ ① 통 수가 장수에 비례해 늘지 않는다 ══════ */

test('6,616장을 400장씩 묶으면 17통이다 — 예전엔 19,848개였다', () => {
  const C = load();
  const plan = C.flushPlan(cards(6616), shared, 400);
  assert.equal(plan.length, 17);
});

test('한 통에 담긴 명함이 정해 둔 수를 넘지 않는다', () => {
  /* 한 통이 너무 크면 서버가 통째로 되돌려 보내고, 어느 한 장 때문인지도 모르게 된다. */
  const C = load();
  C.flushPlan(cards(6616), shared, 400).forEach(upd => {
    const ids = new Set(Object.keys(upd).map(k => k.split('/')[2]));
    assert.ok(ids.size <= 400, '한 통에 ' + ids.size + '장이 담겼다');
  });
});

test('딱 나누어떨어져도 빈 통을 만들지 않는다', () => {
  const C = load();
  assert.equal(C.flushPlan(cards(800), shared, 400).length, 2);
  assert.equal(C.flushPlan(cards(801), shared, 400).length, 3);
});

test('바뀐 것이 없으면 한 통도 안 보낸다', () => {
  const C = load();
  assert.equal(C.flushPlan([], shared, 400).length, 0);
  assert.equal(C.flushPlan(null, shared, 400).length, 0);
});

/* ══════ ② 창고가 다르면 따로 담는다 ══════ */

test('개인 폴더 명함은 다른 통에 담긴다 — 섞으면 통째로 거부된다', () => {
  const C = load();
  const list = cards(3).concat(cards(2, 100));
  const rootOf = id => (Number(id.slice(1)) >= 100) ? 'pucards/priv/u1' : 'pucards';
  const plan = C.flushPlan(list, rootOf, 400);
  assert.equal(plan.length, 2, '창고가 둘이면 통도 둘이어야 한다');
  plan.forEach(upd => {
    const roots = new Set(Object.keys(upd).map(k => k.replace(/\/items\/.*$/, '')));
    assert.equal(roots.size, 1, '한 통에 창고가 섞였다');
  });
});

test('개인 명함이 공용 창고 자리에 절대 안 실린다', () => {
  /* 개인 폴더 명함이 공유 자리에 들어가면 다른 직원에게 보인다 — 되돌릴 수 없는 사고다. */
  const C = load();
  const rootOf = id => id === 'c0' ? 'pucards/priv/u1' : 'pucards';
  const plan = C.flushPlan(cards(3), rootOf, 400);
  plan.forEach(upd => Object.keys(upd).forEach(k => {
    if(k.indexOf('/items/c0/') >= 0) assert.ok(k.indexOf('pucards/priv/u1/') === 0, 'c0 가 공용 자리에 실렸다');
  }));
});

/* ══════ ③ 바꾸는 칸만 담는다 ══════ */

test('폴더·시각·자동배정 표시 세 칸만 담는다', () => {
  const C = load();
  const upd = C.flushPlan(cards(1), shared, 400)[0];
  const keys = Object.keys(upd).map(k => k.split('/').pop()).sort();
  assert.deepEqual(keys, ['erpAutoFoldered', 'group', 'updatedAt']);
});

test('공유 색인(idx·bykey)은 건드리지 않는다 — 안 바뀌는 것을 쓰면 메시지만 는다', () => {
  /* 색인에 담는 칸(idxRecord)에 폴더가 없고, 자동 폴더는 잠긴 폴더가 아니라서
     색인에 들어가고 빠지는 것이 바뀌지 않는다. */
  const C = load();
  C.flushPlan(cards(50), shared, 400).forEach(upd => {
    Object.keys(upd).forEach(k => {
      assert.ok(k.indexOf('/idx/') < 0, '공유 색인을 건드린다: ' + k);
      assert.ok(k.indexOf('/bykey/') < 0, '번호 열쇠를 건드린다: ' + k);
    });
  });
});

test('손으로 옮긴 것(자동배정 표시 없음)에는 그 표시를 붙이지 않는다', () => {
  const C = load();
  const upd = C.flushPlan([{ id:'c1', group:'g2', updatedAt:5 }], shared, 400)[0];
  assert.ok(!Object.keys(upd).some(k => k.endsWith('erpAutoFoldered')));
});

test('id 가 없는 것은 조용히 건너뛴다 — 엉뚱한 자리에 쓰면 안 된다', () => {
  const C = load();
  const plan = C.flushPlan([null, { group:'g1' }, { id:'c1', group:'g1', updatedAt:1 }], shared, 400);
  assert.equal(plan.length, 1);
  assert.equal(new Set(Object.keys(plan[0]).map(k => k.split('/')[2])).size, 1);
});

/* ══════ 화면에 실제로 걸려 있는가 ══════ */

test('자동 폴더 배정이 한 장씩 저장하지 않는다', () => {
  const i = src.indexOf('  autoFolder(){');
  const fn = src.slice(i, src.indexOf('\n  flushPlan(', i));
  /* 세미콜론까지 봐야 한다 — 설명글에도 옛 코드 이름이 적혀 있다 */
  assert.ok(!/Store\.put\(it\);/.test(fn), '아직 명함 한 장마다 따로 저장한다');
  assert.ok(fn.includes('autoFolderFlush(pend)'), '모아서 보내지 않는다');
});

test('보내는 곳은 한 곳뿐이다 — 두 길로 나가면 한쪽만 고치게 된다', () => {
  assert.ok(src.includes('function autoFolderFlush(list)'));
  assert.ok(src.includes('ErpMatch.autoFolderFlushImpl'));
});

test('저장이 실패하면 조용히 넘어가지 않고 남긴다', () => {
  const i = src.indexOf('ErpMatch.autoFolderFlushImpl');
  const fn = src.slice(i, i + 600);
  assert.match(fn, /catch\(/, '실패를 안 잡으면 왜 안 됐는지 영영 모른다');
});
