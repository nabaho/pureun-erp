'use strict';
/* 여럿이 한 업체를 맡을 때 (대표 지시 2026-08-17 「동시에 다섯 이상 접속한다.
   각각 자기 사업장을 관리해야 한다.」)
   실행: node --test tests/*.test.js · 목업 docs/mockups/paydata-cowork.html

   ⚠ 실제로 있던 일: 담기는 늘 자기 자리인데 서랍은 자기 자리만 보여, 부담당이
   그 업체를 열면 주담당이 담아 둔 것이 안 보였다 — 목록 줄에는 「3장」인데 서랍은
   「0건」. 그 사람은 「아직 안 왔구나」 하고 업체에 다시 달라고 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

/* 화담원은 김보람(주담당)·박은비(부담당)가 함께 맡는다. 이비는 김보람만. */
const COS = [
  { id: 'co_1', name: '화담원', typeCode: '급여', managerMain: 'a-001', managerSubs: ['a-002'] },
  { id: 'co_2', name: '이비', typeCode: '급여', managerMain: 'a-001', managerSubs: [] }
];
const DIR = [{ sid: 'a-001', name: '김보람' }, { sid: 'a-002', name: '박은비' }];
const OWNERS = {
  U1: { name: '김보람', email: 'a001@pureun.kr' },
  U2: { name: '박은비', email: 'a002@pureun.kr' }
};

function load(app, uid) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"' + (uid || 'U2') + '"});',
    'const App = ' + JSON.stringify(Object.assign({
      companyId: 'co_1', companies: COS, dir: DIR, owners: OWNERS,
      viewingUid: '', viewingDeputy: false
    }, app)) + ';',
    cut('seatNow'), cut('canWrite'), cut('drawerSeats'), cut('byName'), cut('canEditRow'),
    'window.App = App; window.S = S; window.drawerSeats = drawerSeats;',
    'window.byName = byName; window.canEditRow = canEditRow; window.canWrite = canWrite;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* ══════ 어느 자리들을 모아 읽나 ══════ */

test('★ 함께 맡은 업체는 두 사람 자리를 모아 읽는다', () => {
  const W = load({}, 'U2');                       // 박은비로 로그인
  const seats = W.drawerSeats();
  assert.ok(seats.indexOf('U2') >= 0, '내 자리가 빠졌습니다');
  assert.ok(seats.indexOf('U1') >= 0, '★ 주담당 자리를 안 읽으면 「3장인데 0건」이 그대로입니다');
});

test('★ 내 자리가 맨 앞이다 — 번호가 겹쳐도 내 것이 안 가려진다', () => {
  assert.equal(load({}, 'U2').drawerSeats()[0], 'U2');
});

test('혼자 맡은 업체는 내 자리 하나뿐이다', () => {
  const seats = load({ companyId: 'co_2' }, 'U1').drawerSeats();
  assert.equal(JSON.stringify(seats), JSON.stringify(['U1']));
});

/* 아직 이 함에 안 들어온 담당자는 자리 자체가 없다 — 읽을 것이 없다. */
test('아직 안 들어온 담당자는 빠진다', () => {
  const W = load({ owners: { U1: OWNERS.U1 } }, 'U1');   // 박은비는 명단에 없다
  assert.equal(JSON.stringify(W.drawerSeats()), JSON.stringify(['U1']));
});

/* 남의 자리를 통째로 보는 중에는 그 자리가 기준이다 — 안 그러면 「신욱임 자리」라
   적어 놓고 내 자료가 섞여 보인다. */
test('★ 남의 자리를 보는 중에는 그 자리가 맨 앞이다', () => {
  const W = load({ viewingUid: 'U1' }, 'U2');
  assert.equal(W.drawerSeats()[0], 'U1');
});

/* ══════ 고칠 수 있는 것과 없는 것 ══════ */

/* ⚠ 남의 자리 자료는 파이어베이스 규칙이 쓰기를 막는다 — 단추를 그대로 두면
   눌러도 실패만 한다. */
test('★ 내가 담은 것만 고칠 수 있다', () => {
  const W = load({}, 'U2');
  assert.equal(W.canEditRow({ _by: 'U2' }), true, '내 것을 못 고치면 일이 안 됩니다');
  assert.equal(W.canEditRow({ _by: 'U1' }), false, '★ 남의 자리에 쓰면 규칙이 거절합니다');
  assert.equal(W.canEditRow({}), true, '자리 표시가 없는 옛 자료는 내 것으로 봅니다');
});

test('★ 남의 자리를 보는 중에는 아무것도 못 고친다', () => {
  const W = load({ viewingUid: 'U1' }, 'U2');
  assert.equal(W.canWrite(), false);
  assert.equal(W.canEditRow({ _by: 'U1' }), false, '보기 전용 자리인데 고쳐집니다');
});

test('대리로 맡은 자리에서는 그 자리 것을 고칠 수 있다', () => {
  const W = load({ viewingUid: 'U1', viewingDeputy: true }, 'U2');
  assert.equal(W.canEditRow({ _by: 'U1' }), true, '맡긴 일을 못 하면 대리가 무의미합니다');
  assert.equal(W.canEditRow({ _by: 'U2' }), false, '지금 자리는 U1 입니다');
});

test('자리 번호를 사람 이름으로 바꾼다 — 모르면 「다른 담당자」', () => {
  const W = load({}, 'U2');
  assert.equal(W.byName('U1'), '김보람');
  assert.equal(W.byName('U9'), '다른 담당자', '알 수 없는 번호를 그대로 보이면 안 됩니다');
  assert.equal(W.byName(''), '');
});

/* ══════ 화면 ══════ */

test('★ 남이 담은 줄에 누가 담았는지 붙는다', () => {
  const d = cut('screenDrawer');
  assert.match(d, /class="bywho"/, '누가 담았는지 없으면 남의 자료가 왜 여기 있는지 모릅니다');
  assert.match(d, /canEditRow\(r\)/, '고칠 수 있는 줄과 없는 줄을 안 가릅니다');
});

/* ⚠ 안 보이면 「왜 나만 안 되지」가 아니라 「이 화면이 고장났나」가 된다. */
test('★ 못 고치는 줄에서도 단추를 숨기지 않고 연하게 둔다', () => {
  const d = cut('screenDrawer');
  assert.match(d, /class="offacts"/, '단추를 통째로 숨기면 고장난 줄 압니다');
  assert.match(d, /여기서는 못 고칩니다/, '까닭이 없으면 알려도 소용없습니다');
});

test('★ 함께 맡은 업체라고 알려 준다', () => {
  const d = cut('screenDrawer');
  assert.match(d, /함께 맡은 업체/, '안 알리면 남의 이름이 붙은 줄을 보고 놀랍니다');
});

/* ══════ 한꺼번에 할 때 ══════ */

/* ⚠ 한 묶음에 남의 자리를 섞으면 규칙이 **통째로** 거절해 내 것까지 안 된다. */
test('★ 여럿을 한꺼번에 옮길 때 남의 것은 빼고 내 것만 한다', () => {
  ['bulkSetFolder', 'bulkDrawerTrash'].forEach(fn => {
    const s = cut(fn);
    assert.match(s, /canEditRow\(findRow\(id\)\)/, fn + ' 이 남의 것을 걸러내지 않습니다');
    assert.match(s, /skipped/, fn + ' 이 몇 건을 뺐는지 안 말합니다');
  });
});

test('★ 한 건 버리기도 남의 것이면 까닭을 말한다 — 조용히 아무 일도 안 하지 않는다', () => {
  const s = cut('toTrash');
  assert.match(s, /canEditRow\(rec\)/);
  assert.match(s, /alert\(/, '조용히 넘어가면 왜 안 되는지 모릅니다');
});

/* ══════ 저장 층 ══════ */

function loadStore(boxes) {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({
    uid: 'U2',
    db: { ref: p => ({ once: () => {
      const uid = String(p).split('/')[2];
      const v = (boxes || {})[uid];
      if (v === 'fail') return Promise.reject(new Error('못 읽었습니다'));
      return Promise.resolve({ val: () => v || null });
    } }) }
  });
  return S;
}

test('★ 두 자리 것이 한 목록으로 합쳐지고 줄마다 자리가 붙는다', async () => {
  const S = loadStore({
    U1: { x1: { companyId: 'co_1', kind: 'attend', filename: '김보람것.jpg' } },
    U2: { x2: { companyId: 'co_1', kind: 'attend', filename: '내것.jpg' } }
  });
  const box = await S.listSlotMany('202608', ['U2', 'U1']);
  assert.equal(Object.keys(box).length, 2);
  assert.equal(box.x1._by, 'U1');
  assert.equal(box.x2._by, 'U2');
});

/* ⚠ 한 사람 것이 안 읽힌다고 서랍이 통째로 비면 자료가 사라진 것으로 읽힌다. */
test('★ 한 자리를 못 읽어도 나머지는 보여 준다', async () => {
  const S = loadStore({ U1: 'fail', U2: { x2: { companyId: 'co_1', kind: 'attend' } } });
  const box = await S.listSlotMany('202608', ['U2', 'U1']);
  assert.equal(Object.keys(box).length, 1, '한 자리가 막히면 서랍이 통째로 빕니다');
  assert.equal(box.x2._by, 'U2');
});

/* 번호가 겹쳐도 **조용히 한 건이 사라지는 일**은 없어야 한다. */
test('★ 자료 번호가 겹쳐도 한 건도 안 사라진다', async () => {
  const S = loadStore({
    U2: { same: { companyId: 'co_1', kind: 'attend', filename: '내것.jpg' } },
    U1: { same: { companyId: 'co_1', kind: 'attend', filename: '남의것.jpg' } }
  });
  const box = await S.listSlotMany('202608', ['U2', 'U1']);
  assert.equal(Object.keys(box).length, 2, '★ 한 건이 조용히 덮였습니다');
  assert.equal(box.same._by, 'U2', '앞에 둔 내 자리가 원래 번호를 지킵니다');
});

test('같은 자리를 두 번 줘도 한 번만 읽는다', async () => {
  const S = loadStore({ U2: { x2: { companyId: 'co_1', kind: 'attend' } } });
  const box = await S.listSlotMany('202608', ['U2', 'U2']);
  assert.equal(Object.keys(box).length, 1);
});

/* ══════ 안 건드린 것 ══════ */

/* 담기는 늘 자기 자리다 — 남의 자리에 쓰는 길을 만들면 「내 자리는 나만 쓴다」가
   통째로 헐거워지고, 파이어베이스 규칙도 고쳐야 한다. */
test('★ 담기는 여전히 자기 자리로만 간다', () => {
  assert.match(cut('dropFiles'), /App\.viewingUid/, '담는 자리가 바뀌었습니다');
  assert.equal(/listSlotMany/.test(cut('dropFiles')), false, '담기와 읽기를 섞으면 안 됩니다');
});
