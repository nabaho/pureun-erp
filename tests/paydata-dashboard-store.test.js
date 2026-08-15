'use strict';
// 사람별 대시보드 저장 층 — 내 업체 순서 · 업체 공유. 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-paydata-store.js' }).runInContext(sandbox);
  return sandbox.window.PuPaydataStore;
}

function setAtPath(root, p, value) {
  const parts = p.split('/').filter(Boolean);
  if (value === null) {
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') return;
      cur = cur[parts[i]];
    }
    delete cur[parts[parts.length - 1]];
    return;
  }
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function getAtPath(root, p) {
  const parts = p.split('/').filter(Boolean);
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}
function fakeDbMulti() {
  const tree = {};
  return {
    _tree: tree,
    ref(p) {
      if (p === undefined) {
        return { update(map) { Object.keys(map).forEach(k => setAtPath(tree, k, map[k])); return Promise.resolve(); } };
      }
      return { once() { return Promise.resolve({ val: () => getAtPath(tree, p) }); } };
    }
  };
}

/* ══════ 내 업체 순서 ══════ */

test('★ 저장한 순서대로 늘어선다', () => {
  const S = loadStore();
  const list = [{ id: 'co_1' }, { id: 'co_2' }, { id: 'co_3' }];
  const out = S.applyOrder(list, ['co_3', 'co_1', 'co_2']);
  assert.deepEqual(out.map(c => c.id), ['co_3', 'co_1', 'co_2']);
});

test('순서에 없는 업체(새로 맡은 것)는 원래 자리 그대로 뒤에 붙는다', () => {
  const S = loadStore();
  const list = [{ id: 'co_1' }, { id: 'co_2' }, { id: 'co_3' }];
  const out = S.applyOrder(list, ['co_2']);
  assert.deepEqual(out.map(c => c.id), ['co_2', 'co_1', 'co_3']);
});

test('순서를 아예 안 저장했으면(빈 배열·null) 원래 차례 그대로다', () => {
  const S = loadStore();
  const list = [{ id: 'co_1' }, { id: 'co_2' }];
  assert.deepEqual(S.applyOrder(list, []).map(c => c.id), ['co_1', 'co_2']);
  assert.deepEqual(S.applyOrder(list, null).map(c => c.id), ['co_1', 'co_2']);
});

test('업체 목록이 없어도 터지지 않는다', () => {
  // vm 안에서 만든 빈 배열은 밖의 []와 다른 종류라 deepEqual 이 튕긴다 — length 로 견준다.
  const S = loadStore();
  assert.equal(S.applyOrder(null, ['co_1']).length, 0);
});

test('★ 내 업체 순서를 저장한다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1' });
  return S.saveMyCompanyOrder(['co_3', 'co_1']).then(() => {
    assert.deepEqual(getAtPath(db._tree, S.myOrderPath('U1')), ['co_3', 'co_1']);
  });
});

test('로그인하지 않았으면 순서를 저장하지 않는다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.saveMyCompanyOrder(['co_1']).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /로그인/)
  );
});

/* ══════ 업체 공유 ══════ */

test('★ 업체를 공유하면 받는 사람 칸에 적힌다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1', name: '권형하' });
  return S.shareCompany({
    targetUid: 'U2', companyId: 'co_5', companyName: '참살이',
    tags: ['확인 부탁드립니다', '서명·날인 필요'], at: 1000
  }).then(id => {
    const rec = getAtPath(db._tree, S.sharePath('U2', id));
    assert.equal(rec.companyId, 'co_5');
    assert.equal(rec.companyName, '참살이');
    assert.equal(rec.byUid, 'U1');
    assert.equal(rec.byName, '권형하');
    assert.deepEqual(rec.tags, ['확인 부탁드립니다', '서명·날인 필요']);
    assert.equal(rec.at, 1000);
  });
});

test('공유할 사람이 없으면 거절한다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti(), uid: 'U1' });
  return S.shareCompany({ companyId: 'co_5', tags: ['참고만 하세요'] }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /사람/)
  );
});

test('사업장을 모르면 거절한다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti(), uid: 'U1' });
  return S.shareCompany({ targetUid: 'U2', tags: ['참고만 하세요'] }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /사업장/)
  );
});

test('★ 공유사항을 하나도 안 고르면 거절한다 — 왜 왔는지 모르면 안 된다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti(), uid: 'U1' });
  return S.shareCompany({ targetUid: 'U2', companyId: 'co_5', tags: [] }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /공유사항/)
  );
});

test('빈 문자열·null 태그는 걸러내고, 남은 것이 있으면 성공한다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1' });
  return S.shareCompany({ targetUid: 'U2', companyId: 'co_5', tags: ['', null, '참고만 하세요'] })
    .then(id => {
      const rec = getAtPath(db._tree, S.sharePath('U2', id));
      assert.deepEqual(rec.tags, ['참고만 하세요']);
    });
});

test('★ 받는 사람은 자기에게 온 공유 목록을 읽는다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1', name: '권형하' });
  return S.shareCompany({ targetUid: 'U2', companyId: 'co_5', companyName: '참살이', tags: ['참고만 하세요'] })
    .then(() => S.listShares('U2'))
    .then(list => { assert.equal(Object.keys(list).length, 1); });
});

test('아직 아무도 공유하지 않았으면 빈 목록이다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.listShares('U2').then(list => assert.equal(Object.keys(list).length, 0));
});

test('실시간DB가 없으면 알리고 거절한다', () => {
  const S = loadStore();
  return S.shareCompany({ targetUid: 'U2', companyId: 'co_5', tags: ['참고만 하세요'] }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /실시간DB/)
  );
});
