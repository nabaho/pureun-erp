'use strict';
/* 저장한 값 고치기·지우기 (대표 승낙 2026-08-21, 목업 안 A + 안 C)
   실행: node --test tests/*.test.js

   무엇이 문제였나: 판독 패널에서 **저장하기 전에만** 고치고 지울 수 있었다.
   한 번 저장하면 값 표에서는 손댈 수 없었다 — 칸을 눌러도 원본 사진만 열렸다.
   1↔7·4↔9 같은 필체 오독이 한 칸 섞이면 그 숫자가 그대로 더존까지 간다.

   안 A = 칸 하나를 원본 옆에서 고치거나 지운다.
   안 C = 서류 하나가 만든 값을 통째로 걷는다(판독 취소).
   ⚠ 어느 쪽도 **원본 사진·파일은 지우지 않는다.** 값만 걷는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

/* 실시간DB 흉내 — 경로 트리 하나에 담고 update/once 를 받는다 */
function fakeDb(tree) {
  const store = JSON.parse(JSON.stringify(tree || {}));
  function get(p) {
    const parts = String(p).split('/').filter(Boolean);
    let cur = store;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[parts[i]];
    }
    return cur === undefined ? null : cur;
  }
  function set(p, v) {
    const parts = String(p).split('/').filter(Boolean);
    let cur = store;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    if (v === null) delete cur[leaf]; else cur[leaf] = v;
  }
  return {
    _store: store, get: get,
    ref(p) {
      if (p === undefined) {
        return { update(map) { Object.keys(map).forEach(k => set(k, map[k])); return Promise.resolve(); } };
      }
      return {
        once() { return Promise.resolve({ val: () => get(p) }); },
        update(map) { Object.keys(map).forEach(k => set(p + '/' + k, map[k])); return Promise.resolve(); }
      };
    }
  };
}

const SLOT = '202608';

/* 값 두 줄 — 근태표(s1)가 만든 김철수, 임금대장(s2)이 만든 김철수 */
function seed() {
  return {
    paydata: { u: { U1: { values: { 202608: {
      r1: { sourceId: 's1', companyId: 'co_1', companyName: '화담원', month: SLOT,
        name: '김철수', pairs: [{ item: '근무일수', value: '27' }, { item: '연장', value: '12' }],
        confirmed: true, by: 'U1', at: 100 },
      r2: { sourceId: 's2', companyId: 'co_1', companyName: '화담원', month: SLOT,
        name: '이영희', pairs: [{ item: '기본급', value: '2400000' }],
        confirmed: false, by: 'U1', at: 200 }
    } } },
    arrivals: { co_1: { 202608: { vals: 2 } } } } }
  };
}

function loadStore(db) {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1', name: '권형하', db: db });
  return S;
}

function rows(db) { return db.get('paydata/u/U1/values/202608') || {}; }

/* ══════ 안 A — 한 칸 고치기 ══════ */

test('★ 값 한 칸을 고친다 — 그 칸만 바뀐다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.editValueCell({ slot: SLOT, rowId: 'r1', item: '근무일수', value: '22', at: 999 })
    .then(() => {
      const p = rows(db).r1.pairs;
      assert.equal(p.length, 2, '항목 수가 바뀌면 안 됩니다');
      assert.equal(p[0].value, '22');
      assert.equal(p[1].value, '12', '옆 칸이 휩쓸려 바뀌었습니다');
    });
});

test('★ 고치면 확인된 값이 된다 — 노란 칠을 걷는다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  // 사람이 원본을 옆에 놓고 고친 것이므로 그것이 곧 확인이다
  return S.editValueCell({ slot: SLOT, rowId: 'r2', item: '기본급', value: '2500000', at: 999 })
    .then(() => assert.equal(rows(db).r2.confirmed, true));
});

test('★ 고친 시각이 새것이 된다 — 다른 서류 값에 다시 덮이면 안 된다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  /* 값 표는 at 오름차순으로 나중 값이 이긴다. 사람이 고친 값이 옛 시각으로 남으면
     같은 항목을 가진 다른 서류 값에 그대로 덮인다 — 고친 것이 화면에서 사라진다. */
  return S.editValueCell({ slot: SLOT, rowId: 'r1', item: '근무일수', value: '22', at: 999 })
    .then(() => assert.equal(rows(db).r1.at, 999));
});

test('없는 항목을 고치라고 하면 거절한다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.editValueCell({ slot: SLOT, rowId: 'r1', item: '없는항목', value: '1' })
    .then(() => { throw new Error('거절하지 않았습니다'); }, e => assert.match(e.message, /찾을 수 없/));
});

test('이미 지워진 줄을 고치라고 하면 거절한다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.editValueCell({ slot: SLOT, rowId: 'r없음', item: '근무일수', value: '1' })
    .then(() => { throw new Error('거절하지 않았습니다'); }, e => assert.match(e.message, /찾을 수 없/));
});

/* ══════ 안 A — 한 칸 지우기 ══════ */

test('★ 값 한 칸만 지운다 — 같은 줄의 다른 항목은 남는다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.deleteValueCell({ slot: SLOT, rowId: 'r1', item: '근무일수', companyId: 'co_1' })
    .then(res => {
      assert.equal(res.rowGone, false);
      const p = rows(db).r1.pairs;
      assert.equal(p.length, 1);
      assert.equal(p[0].item, '연장');
    });
});

test('★ 마지막 항목을 지우면 그 줄 자체가 없어진다 — 빈 줄이 남으면 안 된다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.deleteValueCell({ slot: SLOT, rowId: 'r2', item: '기본급', companyId: 'co_1' })
    .then(res => {
      assert.equal(res.rowGone, true);
      assert.equal(rows(db).r2, undefined);
    });
});

test('★ 지운 뒤 사업장 목록의 「표 N명」이 함께 줄어든다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  // 이 수를 안 고치면 값이 다 없어져도 목록은 「표 2명」이라 우긴다
  return S.deleteValueCell({ slot: SLOT, rowId: 'r2', item: '기본급', companyId: 'co_1' })
    .then(() => assert.equal(db.get('paydata/arrivals/co_1/202608/vals'), 1));
});

/* ══════ 안 C — 서류 단위 판독 취소 ══════ */

test('★ 서류 하나가 만든 값을 통째로 걷는다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.deleteValuesBySource({ slot: SLOT, sourceId: 's1', companyId: 'co_1' })
    .then(n => {
      assert.equal(n, 1, '지운 줄 수를 돌려줘야 사람에게 알릴 수 있습니다');
      assert.equal(rows(db).r1, undefined);
      assert.ok(rows(db).r2, '다른 서류가 만든 값까지 걷으면 안 됩니다');
    });
});

test('★ 판독 취소 뒤에도 「표 N명」이 맞다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.deleteValuesBySource({ slot: SLOT, sourceId: 's1', companyId: 'co_1' })
    .then(() => assert.equal(db.get('paydata/arrivals/co_1/202608/vals'), 1));
});

test('★ 다른 사업장 값은 건드리지 않는다', () => {
  const t = seed();
  t.paydata.u.U1.values['202608'].r9 = { sourceId: 's1', companyId: 'co_2', companyName: '이비',
    month: SLOT, name: '박민수', pairs: [{ item: '근무일수', value: '20' }], at: 300 };
  const db = fakeDb(t);
  const S = loadStore(db);
  /* 값 칸은 그 달 **전체 사업장**이 한 자리에 있다. 출처 번호만 보고 걷으면
     우연히 같은 번호를 쓴 남의 사업장 값까지 사라진다. */
  return S.deleteValuesBySource({ slot: SLOT, sourceId: 's1', companyId: 'co_1' })
    .then(() => assert.ok(rows(db).r9, '다른 사업장 값이 함께 지워졌습니다'));
});

test('걷을 것이 없으면 0을 돌려주고 아무것도 안 건드린다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.deleteValuesBySource({ slot: SLOT, sourceId: 's없음', companyId: 'co_1' })
    .then(n => {
      assert.equal(n, 0);
      assert.equal(Object.keys(rows(db)).length, 2);
    });
});

test('무엇을 지울지 안 주면 거절한다 — 통째로 날아가면 되돌릴 수 없다', () => {
  const db = fakeDb(seed());
  const S = loadStore(db);
  return S.deleteValuesBySource({ slot: SLOT, sourceId: '', companyId: 'co_1' })
    .then(() => { throw new Error('거절하지 않았습니다'); }, e => assert.ok(e));
});

/* ══════ 화면 계산 ══════ */

function loadModel() {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  function cut(name) {
    const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수를 찾을 수 없습니다');
    return m[0];
  }
  new vm.Script('const S = window.PuPaydataStore; S.init({uid:"U1"});\n'
    + cut('valueGridModel') + '\n' + cut('valueSourceRows')
    + '\nwindow.M = { valueGridModel: valueGridModel, valueSourceRows: valueSourceRows };',
    { filename: 'model.js' }).runInContext(sandbox);
  return sandbox.window.M;
}

const BOX = seed().paydata.u.U1.values['202608'];

test('★ 칸마다 어느 줄에서 왔는지가 붙는다 — 없으면 고칠 줄을 못 찾는다', () => {
  const M = loadModel();
  const g = M.valueGridModel(BOX);
  const 철수 = g.people.filter(p => p.name === '김철수')[0];
  assert.equal(철수.cells['근무일수'].rowId, 'r1');
  assert.equal(철수.cells['근무일수'].item, '근무일수');
});

test('★ 같은 항목이 두 서류에 있으면 나중 값의 줄을 가리킨다', () => {
  const M = loadModel();
  /* 값 표는 나중 값을 보여 준다 — 고치기도 **보이는 그 값**의 줄이어야 한다.
     안 그러면 22 를 고쳤는데 화면에는 27 이 그대로 남는다. */
  const box = {
    a: { sourceId: 's1', name: '김철수', pairs: [{ item: '근무일수', value: '27' }], at: 100 },
    b: { sourceId: 's2', name: '김철수', pairs: [{ item: '근무일수', value: '22' }], at: 200 }
  };
  const cell = M.valueGridModel(box).people[0].cells['근무일수'];
  assert.equal(cell.value, '22');
  assert.equal(cell.rowId, 'b');
});

test('★ 서류별로 몇 사람·몇 칸을 만들었는지 모은다 (판독 취소 목록)', () => {
  const M = loadModel();
  const out = M.valueSourceRows(BOX);
  const by = {}; out.forEach(r => { by[r.sourceId] = r; });
  assert.equal(by.s1.cells, 2);      // 근무일수·연장
  assert.equal(by.s1.people, 1);
  assert.equal(by.s1.confirmed, true);
  assert.equal(by.s2.confirmed, false);
});

test('서류 목록은 최근 판독한 것이 위로 온다', () => {
  const M = loadModel();
  assert.equal(M.valueSourceRows(BOX).map(r => r.sourceId).join(','), 's2,s1');
});

test('출처가 없는 줄도 한 자리에 모은다 — 숨기면 지울 길이 없다', () => {
  const M = loadModel();
  const out = M.valueSourceRows({ x: { name: '김철수', pairs: [{ item: '근무일수', value: '1' }], at: 1 } });
  assert.equal(out.length, 1);
  assert.equal(out[0].sourceId, '');
});

test('자료가 없어도 터지지 않는다', () => {
  const M = loadModel();
  assert.equal(M.valueSourceRows(null).length, 0);
});

/* ══════ 배선 ══════ */

test('★ 값 표의 칸이 고치기로 이어진다 — 원본만 열던 자리다', () => {
  assert.match(HTML, /openValueFix\(/, '칸을 눌러도 고칠 길이 없습니다');
});

test('★ 판독 취소 단추가 값 표에 있다', () => {
  assert.match(HTML, /cancelValueSource\(/, '서류 단위로 걷을 길이 없습니다');
});

test('★ 원본은 지우지 않는다 — 값만 걷는다고 사람에게 말한다', () => {
  // 「지움」이라는 말만 보면 사진까지 지우는 줄 알고 아무도 못 누른다
  assert.match(HTML, /원본[^<]*(그대로|지워지지)/);
});

test('★ 뷰어를 닫으면 고치기도 함께 접힌다', () => {
  /* 안 접으면 그 상태가 남아, 다음에 아무 원본을 열었을 때 엉뚱한 값의
     고치기 패널이 옆에 붙는다. */
  const i = HTML.indexOf('function closeViewer');
  assert.ok(i > 0, 'closeViewer 를 찾을 수 없습니다');
  const body = HTML.slice(i, i + 200);
  assert.ok(body.indexOf('valueFix = null') > 0, '뷰어를 닫아도 고치기 상태가 남습니다');
});
