'use strict';
// 이름 골라 보기 · 열람 기록 · 휴가 대리 — 저장 층. 실행: node --test tests/*.test.js
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
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1', name: '권형하' });
  return S;
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
  let seq = 0;
  return {
    _tree: tree,
    ref(p) {
      if (p === undefined) {
        return { update(map) { Object.keys(map).forEach(k => setAtPath(tree, k, map[k])); return Promise.resolve(); } };
      }
      return {
        once() { return Promise.resolve({ val: () => getAtPath(tree, p) }); },
        push() { return { key: 'f' + (++seq) }; }
      };
    }
  };
}

/* ══════ 이름 고르개 명단 ══════ */

test('★ 로그인하면 명단에 내 이름이 적힌다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db });
  return S.touchOwner('권형하').then(() => {
    const rec = getAtPath(db._tree, S.ownerPath('U1'));
    assert.equal(rec.name, '권형하');
    assert.ok(rec.lastAt > 0);
  });
});

test('명단은 전 직원이 읽는다 — 관리자로 안 좁힌다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, isAdmin: false });
  return S.touchOwner('권형하').then(() => S.listOwners()).then(list => {
    assert.equal(Object.keys(list).length, 1, '관리자가 아니라고 안 읽히면 안 됩니다');
  });
});

test('공개 명부에서 이름을 찾는다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db });
  setAtPath(db._tree, 'data/user_dir', [{ sid: 'p-001', name: '권형하' }]);
  return S.lookupName('p001@pureun.kr').then(name => assert.equal(name, '권형하'));
});

test('★ 공개 명부에 없으면 조용히 빈 이름을 준다 — 로그인을 막지 않는다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db });
  return S.lookupName('없는사람@pureun.kr').then(name => assert.equal(name, ''));
});

test('★ 로그인 마무리(signIn)가 이름을 찾고 명단에 남긴다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1' });
  setAtPath(db._tree, 'data/user_dir', [{ sid: 'p-001', name: '권형하' }]);
  return S.signIn('p001@pureun.kr', 'p001@pureun.kr').then(name => {
    assert.equal(name, '권형하');
    assert.equal(getAtPath(db._tree, S.ownerPath('U1')).name, '권형하');
  });
});

/* ══════ 열람 기록 ══════ */

test('★ 사유 없이는 기록되지 않는다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.logAccess({ targetUid: 'U2', reason: '' }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /사유/)
  );
});

test('대상이 없으면 기록하지 않는다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.logAccess({ targetUid: '', reason: '급여 문의 확인' }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /누구/)
  );
});

test('사유를 적으면 기록이 남는다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1', name: '권형하' });
  return S.logAccess({ targetUid: 'U2', targetName: '박은비', reason: '급여 문의 확인' }).then(id => {
    const rec = getAtPath(db._tree, S.accessLogPath(id));
    assert.equal(rec.byUid, 'U1');
    assert.equal(rec.targetUid, 'U2');
    assert.equal(rec.reason, '급여 문의 확인');
    assert.ok(rec.at > 0);
  });
});

/* ══════ 휴가 대리 ══════ */

test('★ 자리를 맡긴다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1' });
  const now = Date.now();
  return S.setDeputy('U2', '박은비', now, now + 7 * 86400000).then(() => {
    const rec = getAtPath(db._tree, S.deputyBoxPath() + '/U2');
    assert.equal(rec.name, '박은비');
    assert.equal(rec.to, now + 7 * 86400000);
  });
});

test('★ 끝나는 날이 시작일보다 앞이면 막는다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti(), uid: 'U1' });
  const now = Date.now();
  return S.setDeputy('U2', '박은비', now, now - 1000).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /뒤여야/)
  );
});

test('맡길 사람이 없으면 막는다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti(), uid: 'U1' });
  return S.setDeputy('', '', 1, 2).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /사람/)
  );
});

test('★ 기간 중에도 바로 거둔다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1' });
  const now = Date.now();
  return S.setDeputy('U2', '박은비', now, now + 7 * 86400000)
    .then(() => S.revokeDeputy('U2'))
    .then(() => {
      assert.equal(getAtPath(db._tree, S.deputyBoxPath() + '/U2'), undefined);
    });
});

test('내가 맡긴 사람 목록을 읽는다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1' });
  return S.setDeputy('U2', '박은비', Date.now(), Date.now() + 1000)
    .then(() => S.listMyDeputies())
    .then(list => assert.equal(Object.keys(list).length, 1));
});

test('★ 지금이 기간 안이면 유효한 대리다 — 콘솔 규칙과 같은 조건', () => {
  const S = loadStore();
  const now = 1000000;
  assert.equal(S.isActiveDeputy({ to: now + 1 }, now), true);
  assert.equal(S.isActiveDeputy({ to: now }, now), true);   // >= — 규칙과 같은 경계
  assert.equal(S.isActiveDeputy({ to: now - 1 }, now), false);
  assert.equal(S.isActiveDeputy(null, now), false);
  assert.equal(S.isActiveDeputy({}, now), false);
});
