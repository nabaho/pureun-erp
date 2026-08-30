'use strict';
/* ══════ 「고른 것 한꺼번에」가 «한 장씩» 쓰던 것 (점검 D1, 2026-08-30) ══════
   2026-08-16 에 명함을 한 장씩 저장하다 5,000건 오류를 냈다. 그 뒤 «자동» 분류는
   「모아서 한 번」(autoFolderFlush)으로 고쳤는데, «손으로 하는» 한꺼번에 작업은
   일곱 가지가 그대로 한 장씩이었다.

   Store.put 한 번은 서버 자리를 여럿 건드린다(items·idx, 사진이 있으면 thumbs 도).
   100장을 고르면 200번 넘게 오간다.

   ★ 여기서 못 박는 것
     ① 고친 «칸만» 쓴다 — 명함을 통째로 되쓰면 남이 그 사이 고친 것을 덮는다
     ② 창고(공용/개인)마다 갈라 쓴다 — 개인 명함을 공용 자리에 쓰면 안 된다
     ③ 한 통이 너무 커지지 않게 나눈다
     ④ 언제 고쳤는지(updatedAt)를 함께 남긴다
     ⑤ 색인에 드는 칸을 이걸로 고치지 않는다 — 색인이 낡은 채로 남는다 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function ctx(roots) {
  const b = {
    Store: { _rootOf: id => (roots && roots[id]) || 'pucards' },
    Date: { now: () => 1700000000000 }
  };
  vm.createContext(b);
  vm.runInContext(fn('bulkPatchPlan'), b);
  return b;
}
const plan = (b, items, keys, chunk) => JSON.parse(JSON.stringify(vm.runInContext(
  'bulkPatchPlan(__i, __k, ' + (chunk || 200) + ')',
  Object.assign(b, { __i: items, __k: keys }))));

/* ── ① 고친 칸만 쓴다 ────────────────────────────────────────────── */
test('★ 고친 «칸만» 쓴다 — 명함을 통째로 되쓰지 않는다', () => {
  const b = ctx();
  const p = plan(b, [{ id: 'c1', owner: '박재원', name: '홍길동', memo: '긴 메모' }], ['owner']);
  assert.equal(p.length, 1);
  const keys = Object.keys(p[0]).sort();
  assert.deepEqual(keys, ['pucards/items/c1/owner', 'pucards/items/c1/updatedAt'],
    '★ 이름·메모까지 되쓴다 — 남이 그 사이 고친 것을 덮는다');
  assert.equal(p[0]['pucards/items/c1/owner'], '박재원');
});

test('여러 칸도 함께 쓴다', () => {
  const b = ctx();
  const p = plan(b, [{ id: 'c1', group: 'g1', vtabs: ['t1'] }], ['group', 'vtabs']);
  assert.equal(p[0]['pucards/items/c1/group'], 'g1');
  assert.deepEqual(p[0]['pucards/items/c1/vtabs'], ['t1']);
});

test('★ 언제 고쳤는지를 함께 남긴다', () => {
  const b = ctx();
  const p = plan(b, [{ id: 'c1', owner: 'x' }], ['owner']);
  assert.equal(p[0]['pucards/items/c1/updatedAt'], 1700000000000,
    '★ 갱신시각이 없으면 어느 쪽이 최신인지 가릴 수 없다');
});

test('빈 값도 «쓴다» — 담당을 떼는 것이 지우는 것이다', () => {
  const b = ctx();
  const p = plan(b, [{ id: 'c1', owner: '' }], ['owner']);
  assert.equal(p[0]['pucards/items/c1/owner'], '',
    '빈 값을 건너뛰면 담당을 뗄 수가 없다');
});

/* ── ② 창고마다 갈라 쓴다 ───────────────────────────────────────── */
test('★ 개인 명함은 개인 창고 자리에 쓴다', () => {
  const b = ctx({ c2: 'pucards_private/u1' });
  const p = plan(b, [{ id: 'c1', owner: 'a' }, { id: 'c2', owner: 'b' }], ['owner']);
  const all = Object.assign({}, ...p);
  assert.equal(all['pucards/items/c1/owner'], 'a');
  assert.equal(all['pucards_private/u1/items/c2/owner'], 'b',
    '★ 개인 명함을 공용 자리에 쓴다 — 남이 못 읽는 자리로 간 것을 도로 꺼낸다');
  assert.equal(all['pucards/items/c2/owner'], undefined);
});

/* ── ③ 한 통이 너무 커지지 않게 ────────────────────────────────── */
test('★ 한 통에 몰아넣지 않고 나눈다', () => {
  const b = ctx();
  const items = Array.from({ length: 250 }, (_, i) => ({ id: 'c' + i, owner: 'x' }));
  const p = plan(b, items, ['owner'], 100);
  assert.equal(p.length, 3, '★ 250장을 한 통에 넣으면 그 한 번이 너무 무겁다');
  assert.equal(Object.keys(p[0]).length, 200, '한 장당 두 칸(값+갱신시각)');
});

test('빈 목록이면 보낼 통이 없다', () => {
  const b = ctx();
  assert.equal(plan(b, [], ['owner']).length, 0);
  assert.equal(plan(b, null, ['owner']).length, 0);
});

test('id 없는 것은 건너뛴다', () => {
  const b = ctx();
  const p = plan(b, [{ owner: 'x' }, { id: 'c1', owner: 'y' }], ['owner']);
  assert.equal(Object.keys(p[0] || {}).length, 2, 'id 없는 것까지 쓰려 한다');
});

/* ── ④ 부르는 쪽이 한 장씩 안 쓴다 ─────────────────────────────── */
const CALLERS = [
  ['selNoMail', '수신거부로 표시'],
  ['onGroupChoice', '폴더 고르기'],
  ['moveSelTo', '폴더로 옮기기'],
  ['selPickOwner', '담당자 지정'],
  ['moveCardsHere', '폴더에 끌어다 놓기'],
  ['selRemoveFromTab', '탭에서 빼기']
];
CALLERS.forEach(([name, what]) => {
  test('★ ' + what + '(' + name + ')가 한 장씩 쓰지 않는다', () => {
    const src = bare(fn(name));
    assert.ok(!/Store\.put\(/.test(src),
      '★ 한 장씩 Store.put 을 부른다 — 100장이면 서버를 200번 넘게 오간다 (2026-08-16)');
    assert.ok(/bulkPatchFlush\(|autoFolderFlush\(/.test(src),
      '모아서 보내는 길을 안 쓴다');
  });
});

/* ── ⑤ 색인에 드는 칸은 이걸로 안 고친다 ───────────────────────── */
test('★ 색인에 드는 칸을 이 길로 고치지 않는다', () => {
  /* idxRecord 가 담는 칸을 이 길로 고치면 색인이 낡은 채로 남아,
     푸른이알피·업무관리 검색이 옛 값을 보여 준다. */
  const idx = bare(fn('idxRecord'));
  const inIdx = [...idx.matchAll(/put\('[a-z]+',\s*it\.([A-Za-z]+)/g)].map(m => m[1]);
  assert.ok(inIdx.length >= 8, '색인 칸을 못 읽었다 (' + inIdx.length + '개)');
  CALLERS.forEach(([name]) => {
    const src = bare(fn(name));
    const m = src.match(/bulkPatchFlush\([^,]+,\s*\[([^\]]*)\]/);
    if (!m) return;
    m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean).forEach(k => {
      assert.ok(inIdx.indexOf(k) < 0,
        '★ ' + name + ' 이 색인 칸 「' + k + '」을 모아쓰기로 고친다 — 색인이 낡는다');
    });
  });
});
