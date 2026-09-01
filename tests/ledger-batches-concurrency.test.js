'use strict';
/* 거래내역 묶음 동시접속 근본 방어.
   - 서버 1 / 로컬 17이면 전체 set 이 아니라 빠진 16개 경로만 복구
   - 사람이 지운 id(삭제표시)는 복구하지 않음
   - 삭제표시는 null 이 아니라 tombstone 으로 남아 오래된 PC의 부활을 막음 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function between(a, b) {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert.ok(i >= 0 && j > i, '검사할 코드 조각을 찾을 수 없습니다: ' + a);
  return app.slice(i, j);
}

test('★ 서버에서 빠진 로컬 묶음만 id별로 복구한다 — 서버 전체 덮어쓰기 금지', async () => {
  const updates = [];
  const local = [];
  for (let i = 0; i < 17; i++) local.push({ id: 'b' + i, rows: [{ date: '2026-01-01' }] });
  const sandbox = {
    Promise, Object, Array, String, Date, Math, console: { warn() {} },
    KEY: 'pureun_v6_',
    _fbLocalArr() { return local.slice(); },
    localStorage: { setItem() {} }, showToast() {},
    fbDb: { ref() { return { update(u) { updates.push(u); return Promise.resolve(); } }; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(between('function _fbRepairLedgerBatches(', '\n/* ── 건별 지우기'), sandbox);

  const n = await sandbox._fbRepairLedgerBatches({ b0: local[0] });
  assert.equal(n, 16);
  assert.equal(updates.length, 1, '복구 요청은 원자적 update 한 번이어야 합니다');
  assert.equal(Object.keys(updates[0]).filter(k => /\/v\//.test(k)).length, 16);
  assert.equal(Object.prototype.hasOwnProperty.call(updates[0], 'data/ledger_batches'), false,
    '★ 전체 노드 set/update 는 동료 묶음을 덮을 수 있습니다');
  assert.equal(updates[0]['data/ledger_batches/v/b0'], undefined, '서버에 있는 묶음까지 다시 썼습니다');
});

test('★ 삭제표시가 있는 id는 오래된 로컬에 남아 있어도 되살리지 않는다', async () => {
  const updates = [];
  const sandbox = {
    Promise, Object, Array, String, Date, Math, console: { warn() {} }, KEY: 'pureun_v6_',
    _fbLocalArr() { return [{ id: 'gone', rows: [{}] }, { id: 'lost', rows: [{}] }]; },
    localStorage: { setItem() {} }, showToast() {},
    fbDb: { ref() { return { update(u) { updates.push(u); return Promise.resolve(); } }; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(between('function _fbRepairLedgerBatches(', '\n/* ── 건별 지우기'), sandbox);
  const n = await sandbox._fbRepairLedgerBatches({ gone: { id: 'gone', _deleted: true } });
  assert.equal(n, 1);
  assert.equal(updates[0]['data/ledger_batches/v/gone'], undefined);
  assert.ok(updates[0]['data/ledger_batches/v/lost']);
});

test('★ 거래내역 삭제는 null이 아니라 삭제표시를 서버에 남긴다', () => {
  let sent = null;
  const sandbox = {
    Date: { now: () => 1234 }, Object, String,
    KEY: 'pureun_v6_', localStorage: { getItem: () => '0', setItem() {} },
    getSessionSid: () => 'P001',
    fbDb: { ref() { return { update(u) { sent = u; return { catch() {} }; } }; } },
    fbSyncFail() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(between('function _recServerWrite(', '\nfunction _recCanDirect('), sandbox);
  sandbox._recServerWrite('ledger_batches', { old: null });
  assert.deepEqual(JSON.parse(JSON.stringify(sent['data/ledger_batches/v/old'])),
    { id: 'old', _deleted: true, deletedAt: 1234, deletedBy: 'P001' });
  assert.equal(sent['data/ledger_batches/u'], 1234);
});

test('★ 거래내역은 서버형식 표식 전에도 직접 묶음 경로를 쓴다', () => {
  const src = between('function _recCanDirect(', '// ── 한 건을 저장할 때');
  const sandbox = {
    fbDb: {}, fbShouldSync: () => true, _fbSynced: true, _fbObjForm: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  assert.equal(sandbox._recCanDirect('ledger_batches'), true);
  assert.equal(sandbox._recCanDirect('unknown'), false);
});
