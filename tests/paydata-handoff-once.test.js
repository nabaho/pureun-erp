'use strict';
/* 「급여관리에 알리기」를 두 번 눌러도 알림은 한 줄 — 실행: node --test tests/*.test.js

   2026-08-17에 적어 둔 구멍: 단추를 두 번 누르면 수신 기록이 둘 남았다.
   급여관리 담당자는 「최근 수신 기록」에서 같은 사업장·같은 달이 두 번 뜨는 것을
   보고 자료가 두 벌 온 줄로 읽는다.

   고치는 방식 두 겹:
     ① 수신함 열쇠를 사업장·달로 **정해진 값**으로 만든다 — 두 번 써도 같은 자리에
        덮어써져 줄이 안 늘어난다(콘솔 규칙을 새로 안 만들어도 된다).
     ② 화면에서 넘기는 동안 단추를 잠근다 — 두 번 눌리는 것 자체를 막는다.
   넘긴 **사실**은 handoff_log 에 매번 남는다 — 그건 기록이라 지워선 안 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

/* 다중 경로 update 를 그대로 받아 적는 가짜 DB */
function fakeDb() {
  const writes = [];
  const tree = {};
  return {
    writes: writes, tree: tree,
    ref(p) {
      if (p === undefined) {
        return {
          update(map) {
            writes.push(map);
            Object.keys(map).forEach(k => { tree[k] = map[k]; });
            return Promise.resolve();
          }
        };
      }
      return { once: () => Promise.resolve({ val: () => null }) };
    }
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

const JOB = { companyId: 'co_1', companyName: '화담원', month: '2026-08', rowCount: 12, at: 1000 };

/* ══════ ① 수신함 열쇠 ══════ */

test('★ 두 번 넘겨도 수신함 줄이 하나다', () => {
  const db = fakeDb();
  const S = loadStore(db);
  return S.handoffToPayroll(JOB)
    .then(() => S.handoffToPayroll(Object.assign({}, JOB, { at: 2000, rowCount: 15 })))
    .then(() => {
      const inbox = Object.keys(db.tree).filter(k => k.indexOf('payroll_os/inbox/') === 0);
      assert.equal(inbox.length, 1, '같은 사업장·같은 달이 두 줄이면 두 벌 온 줄로 읽습니다');
    });
});

test('★ 다시 넘기면 줄 수와 시각이 새것으로 바뀐다', () => {
  const db = fakeDb();
  const S = loadStore(db);
  return S.handoffToPayroll(JOB)
    .then(() => S.handoffToPayroll(Object.assign({}, JOB, { at: 2000, rowCount: 15 })))
    .then(() => {
      const key = Object.keys(db.tree).filter(k => k.indexOf('payroll_os/inbox/') === 0)[0];
      assert.equal(db.tree[key].ts, 2000, '덮어쓸 때 시각이 안 바뀌면 낡은 알림으로 보입니다');
      assert.equal(db.tree[key].사업장, '화담원');
      assert.equal(db.tree[key].월, '2026-08');
    });
});

test('★ 다른 달은 따로 선다 — 8월 알림이 7월을 덮으면 안 된다', () => {
  const db = fakeDb();
  const S = loadStore(db);
  return S.handoffToPayroll(JOB)
    .then(() => S.handoffToPayroll(Object.assign({}, JOB, { month: '2026-07' })))
    .then(() => {
      const inbox = Object.keys(db.tree).filter(k => k.indexOf('payroll_os/inbox/') === 0);
      assert.equal(inbox.length, 2);
    });
});

test('★ 다른 사업장도 따로 선다', () => {
  const db = fakeDb();
  const S = loadStore(db);
  return S.handoffToPayroll(JOB)
    .then(() => S.handoffToPayroll(Object.assign({}, JOB, { companyId: 'co_2', companyName: '이비' })))
    .then(() => {
      const inbox = Object.keys(db.tree).filter(k => k.indexOf('payroll_os/inbox/') === 0);
      assert.equal(inbox.length, 2);
    });
});

test('★ 넘긴 사실은 매번 남는다 — 그건 기록이다', () => {
  const db = fakeDb();
  const S = loadStore(db);
  return S.handoffToPayroll(JOB)
    .then(() => S.handoffToPayroll(Object.assign({}, JOB, { at: 2000 })))
    .then(() => {
      const log = Object.keys(db.tree).filter(k => k.indexOf('handoff_log') >= 0);
      assert.equal(log.length, 2, '누가 언제 넘겼는지가 덮어써지면 기록이 아닙니다');
    });
});

test('열쇠에 실시간DB가 싫어하는 글자를 안 쓴다', () => {
  const db = fakeDb();
  const S = loadStore(db);
  // . $ # [ ] / 가 들어가면 그 자리에 아예 못 쓴다
  return S.handoffToPayroll(Object.assign({}, JOB, { companyId: 'co.1$x[y]' })).then(() => {
    const key = Object.keys(db.tree).filter(k => k.indexOf('payroll_os/inbox/') === 0)[0];
    const leaf = key.slice('payroll_os/inbox/'.length);
    assert.equal(/[.$#[\]/]/.test(leaf), false, '열쇠에 못 쓰는 글자가 들어 있습니다: ' + leaf);
  });
});

/* ══════ ② 화면에서 두 번 눌리는 것 막기 ══════ */

function loadScreen(opts) {
  opts = opts || {};
  const calls = { alerts: [], confirms: [] };
  const db = fakeDb();
  const sandbox = {
    window: {}, console, Date,
    document: { getElementById: () => null },
    alert: m => calls.alerts.push(m),
    confirm: m => { calls.confirms.push(m); return true; },
    db: db
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  function cut(name) {
    const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수를 찾을 수 없습니다');
    return m[0];
  }
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1", name:"권형하", db: db, isFin: true});',
    'const App = { companyId:"co_1", companyName:"화담원", month:"2026-08", values:null,'
      + ' handoffBusy:false, render: function(){} };',
    /* 값은 서버에서 새로 읽는다 — 여기서는 가짜로 열두 줄을 준다 */
    'function fetchValues(){ return Promise.resolve({ v1: { name:"김철수",'
      + ' pairs:[{item:"근무일수",value:"22"}], at:1 } }); }',
    cut('valueGridModel'), cut('handoffMonth'),
    'window.App = App; window.handoffMonth = handoffMonth;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return { W: sandbox.window, calls: calls, db: db };
}

test('★ 넘기는 중에 또 누르면 두 번째는 아무 일도 안 한다', () => {
  const { W, calls } = loadScreen();
  const first = W.handoffMonth();
  const second = W.handoffMonth();          // 아직 첫 번째가 끝나기 전
  return Promise.all([first, second]).then(() => {
    assert.equal(calls.confirms.length, 1, '물음이 두 번 뜨면 두 번 넘어갑니다');
  });
});

test('★ 넘기고 나면 다시 누를 수 있다 — 잠금이 안 풀리면 영영 못 넘긴다', () => {
  const { W } = loadScreen();
  return W.handoffMonth().then(() => {
    assert.equal(W.App.handoffBusy, false, '잠금이 남아 있으면 새로고침해야 넘길 수 있습니다');
  });
});

test('★ 단추에 잠금이 걸려 있다는 것이 화면에도 보인다', () => {
  // 눌렀는데 아무 반응이 없으면 고장으로 보인다
  assert.match(HTML, /handoffBusy/, '화면이 잠금 상태를 모릅니다');
});
