'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function snapshot(value) {
  return { val() { return value; } };
}

function loadStore() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'pu-photo-store.js' }).runInContext(sandbox);
  return sandbox.window.PuPhotoStore;
}

async function within(promise, milliseconds = 250) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('로그인이 보조 색인 쓰기를 기다렸습니다')), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('로그인은 권한과 이름을 동시에 읽고 owners 갱신 완료를 기다리지 않는다', async () => {
  const role = deferred();
  const roster = deferred();
  const ownerWrite = deferred();
  const reads = [];
  const updates = [];

  const db = {
    ref(dbPath) {
      return {
        once() {
          reads.push(dbPath);
          if (dbPath === 'uid_roles/U1/isAdmin') return role.promise;
          if (dbPath === 'data/user_dir') return roster.promise;
          return Promise.resolve(snapshot(null));
        },
        update(value) {
          updates.push(value);
          return ownerWrite.promise;
        }
      };
    }
  };

  const store = loadStore();
  store.init({ db });
  const signingIn = store.signIn('U1', 'p001@pureun.kr', '임시 이름');

  assert.deepEqual(
    reads,
    ['uid_roles/U1/isAdmin', 'data/user_dir'],
    '두 독립 조회가 첫 응답 전부터 모두 시작되어야 합니다'
  );

  roster.resolve(snapshot({ v: [{ sid: 'p-001', name: '홍길동' }] }));
  role.resolve(snapshot(true));

  const result = await within(signingIn);
  assert.deepEqual({ isAdmin: result.isAdmin, name: result.name }, { isAdmin: true, name: '홍길동' });
  assert.equal(updates.length, 1, 'owners 보조 색인 갱신은 시작되어야 합니다');
  assert.equal(updates[0]['puphotos/owners/U1'].name, '홍길동');

  // ownerWrite는 일부러 끝내지 않았다. 위 signIn이 이미 끝났다면 사진 열기를
  // 보조 색인 쓰기가 막지 않는다는 계약이 지켜진 것이다.
});

test('늦게 끝난 이전 로그인은 새 계정의 이름과 권한을 덮지 않는다', async () => {
  const roleA = deferred();
  const roleB = deferred();
  const rosterA = deferred();
  const rosterB = deferred();
  const rosterReads = [rosterA, rosterB];
  const updates = [];
  const db = {
    ref(dbPath) {
      return {
        once() {
          if (dbPath === 'uid_roles/A/isAdmin') return roleA.promise;
          if (dbPath === 'uid_roles/B/isAdmin') return roleB.promise;
          if (dbPath === 'data/user_dir') return rosterReads.shift().promise;
          return Promise.resolve(snapshot(null));
        },
        update(value) { updates.push(value); return Promise.resolve(); }
      };
    }
  };

  const store = loadStore();
  store.init({ db });
  const oldLogin = store.signIn('A', 'p001@pureun.kr', '이전 계정');
  const newLogin = store.signIn('B', 'p002@pureun.kr', '새 계정');

  rosterB.resolve(snapshot({ v: [{ sid: 'p-002', name: '새 사용자' }] }));
  roleB.resolve(snapshot(false));
  const current = await newLogin;
  assert.deepEqual({ uid: current.uid, name: current.name }, { uid: 'B', name: '새 사용자' });

  rosterA.resolve(snapshot({ v: [{ sid: 'p-001', name: '이전 사용자' }] }));
  roleA.resolve(snapshot(true));
  await assert.rejects(oldLogin, err => err && err.code === 'auth/stale-session');

  assert.equal(store.myUid(), 'B');
  assert.equal(store.myName(), '새 사용자');
  assert.equal(store.amAdmin(), false);
  assert.equal(updates.some(u => u['puphotos/owners/A']), false);
  assert.equal(updates.some(u => u['puphotos/owners/B']), true);
});

test('로그아웃은 진행 중인 로그인 응답을 무효화한다', async () => {
  const role = deferred();
  const roster = deferred();
  const updates = [];
  const db = {
    ref(dbPath) {
      return {
        once() {
          if (dbPath === 'uid_roles/A/isAdmin') return role.promise;
          if (dbPath === 'data/user_dir') return roster.promise;
          return Promise.resolve(snapshot(null));
        },
        update(value) { updates.push(value); return Promise.resolve(); }
      };
    }
  };
  const store = loadStore();
  store.init({ db });
  const oldLogin = store.signIn('A', 'p001@pureun.kr', '이전 계정');
  store.clearIdentity();
  role.resolve(snapshot(true));
  roster.resolve(snapshot({ v: [{ sid: 'p-001', name: '이전 사용자' }] }));
  await assert.rejects(oldLogin, err => err && err.code === 'auth/stale-session');
  assert.equal(store.myUid(), '');
  assert.equal(updates.length, 0);
});
