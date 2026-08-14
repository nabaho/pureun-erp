'use strict';
// 4차 — 급여관리(payroll_os)로 이 달 값 넘기기. 실행: node --test tests/*.test.js
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

/* ══════ 권한 갈래 ══════ */

test('관리자면 넘길 수 있다', () => {
  const S = loadStore();
  S.init({ isAdmin: true, isFin: false });
  assert.equal(S.canHandoffPayroll(), true);
});

test('재무권한이면 넘길 수 있다', () => {
  const S = loadStore();
  S.init({ isAdmin: false, isFin: true });
  assert.equal(S.canHandoffPayroll(), true);
});

test('★ 둘 다 아니면 넘길 수 없다 — 단추를 감춰야 한다', () => {
  const S = loadStore();
  S.init({ isAdmin: false, isFin: false });
  assert.equal(S.canHandoffPayroll(), false);
});

/* ══════ 넘기기 ══════ */

test('★ 급여관리 수신함 자리에 그 모양대로 적힌다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1', name: '권형하', isAdmin: true });
  return S.handoffToPayroll({ companyId: 'co_1', companyName: '화담원', month: '2026-08', at: 1000 }).then(inboxId => {
    const rec = getAtPath(db._tree, S.payrollInboxPath(inboxId));
    assert.equal(rec.사업장, '화담원');
    assert.equal(rec.월, '2026-08');
    assert.equal(rec.상태, '대기');
    assert.equal(rec.출처, '급여데이터함');
    assert.equal(rec.ts, 1000);
    assert.ok(rec.filename, 'filename 이 없으면 수신함 목록에서 안 보입니다');
  });
});

test('★ handoff_log 에도 함께 남는다 — 사유 없이, 넘긴 사실만', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1', name: '권형하', isAdmin: true });
  return S.handoffToPayroll({ companyId: 'co_1', companyName: '화담원', month: '2026-08', at: 1000 }).then(() => {
    const logBox = getAtPath(db._tree, 'paydata/handoff_log');
    const ids = Object.keys(logBox || {});
    assert.equal(ids.length, 1);
    const rec = logBox[ids[0]];
    assert.equal(rec.companyId, 'co_1');
    assert.equal(rec.companyName, '화담원');
    assert.equal(rec.month, '2026-08');
    assert.equal(rec.byUid, 'U1');
    assert.equal(rec.byName, '권형하');
    assert.equal(rec.at, 1000);
  });
});

test('사업장을 모르면 거절한다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti(), uid: 'U1' });
  return S.handoffToPayroll({ month: '2026-08' }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /사업장/)
  );
});

test('귀속월을 모르면 거절한다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti(), uid: 'U1' });
  return S.handoffToPayroll({ companyName: '화담원' }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /귀속월/)
  );
});

test('실시간DB가 없으면 알리고 거절한다', () => {
  const S = loadStore();
  return S.handoffToPayroll({ companyName: '화담원', month: '2026-08' }).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /실시간DB/)
  );
});

test('종류 이름을 안 주면 기본 이름을 쓴다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db, uid: 'U1', name: '권형하' });
  return S.handoffToPayroll({ companyName: '화담원', month: '2026-08', at: 1 }).then(inboxId => {
    const rec = getAtPath(db._tree, S.payrollInboxPath(inboxId));
    assert.equal(rec.종류, '급여데이터함 값');
  });
});
