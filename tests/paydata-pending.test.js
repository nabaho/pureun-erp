'use strict';
// 미정 대기 칸 → 사업장 서랍 — 실행: node --test tests/*.test.js
//   대기 칸이 없으면 들어올 곳이 없는 자료가 세 가지 있다(메일 자동수신·사진첩에서
//   보낸 한 장·현장에서 급히 찍은 것). 그 칸에서 서랍으로 내려보내는 층을 못 박는다.
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

test('사업장·귀속월을 모르면 대기 칸 자료가 된다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: '근태표.jpg', at: 1000 });
  assert.equal(rec.companyId, '');
  assert.equal(rec.month, '');
  assert.equal(rec.filename, '근태표.jpg');
  assert.equal(rec.by, 'U1');
});

test('★ 서랍으로 내려보내면 대기 칸에서 지워지고 자료가 생긴다 — 한 번에', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: '근태표.jpg', at: 1000, file: 'pu_paydata/U1/pending/p1.jpg' });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', companyName: '화담원', month: '2026-08', kind: 'attend', at: 2000 });
  const keys = Object.keys(up);

  // 자료가 생겼다
  assert.ok(up['paydata/u/U1/items/202608/p1'], '서랍에 자료가 안 생겼습니다');
  assert.equal(up['paydata/u/U1/items/202608/p1'].companyId, 'co_7');
  assert.equal(up['paydata/u/U1/items/202608/p1'].kind, 'attend');
  // 대기 칸에서 지워졌다
  assert.equal(up['paydata/u/U1/pending/p1'], null);
  // 둘이 같은 묶음에 있다 — 따로 쓰면 한쪽만 들어가 자료가 사라지거나 겹친다
  assert.ok(keys.indexOf('paydata/u/U1/items/202608/p1') >= 0 && keys.indexOf('paydata/u/U1/pending/p1') >= 0);
});

test('★ 상위 노드를 통째로 덮는 자리가 묶음에 없다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: 'a.jpg', at: 1 });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: 'attend', at: 2 });
  Object.keys(up).forEach(k => {
    // 'paydata/u/U1/items' 처럼 얕은 자리에 쓰면 그 아래 남의 자료가 통째로 날아간다.
    assert.ok(k.split('/').length >= 5, '너무 얕은 자리에 씁니다: ' + k);
  });
});

test('근로계약서는 월을 넘겨도 keep 칸으로 내려간다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: '계약서.pdf', at: 1 });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: 'contract', at: 2 });
  assert.ok(up['paydata/u/U1/items/keep/p1'], 'keep 칸으로 안 갔습니다');
});

test('★ 계약서는 월이 비어도 내려간다', () => {
  const S = loadStore();
  // 계약서는 월별 자료가 아니다. 월을 요구하면 채울 수 없는 것을 채우라고 하는 셈이다.
  const rec = S.pendingRecord({ filename: '계약서.pdf', at: 1 });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '', kind: 'contract', at: 2 });
  assert.ok(up['paydata/u/U1/items/keep/p1']);
});

test('사업장이나 종류가 비면 내려보내지 않고 알린다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: 'a.jpg', at: 1 });
  assert.throws(() => S.drawerUpdate('p1', rec, { companyId: '', month: '2026-08', kind: 'attend' }), /사업장/);
  assert.throws(() => S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '', kind: 'attend' }), /귀속월/);
  assert.throws(() => S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: '' }), /종류/);
});

test('★ 내려보낼 때 파일 자리가 바뀌지 않는다', () => {
  const S = loadStore();
  // 창고 파일을 옮기면 옮기는 중에 끊기면 자료를 잃는다. 정보만 바꾸고 파일은 그 자리에 둔다.
  const rec = S.pendingRecord({ filename: 'a.jpg', at: 1, file: 'pu_paydata/U1/pending/p1.jpg' });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: 'attend', at: 2 });
  assert.equal(up['paydata/u/U1/items/202608/p1'].file, 'pu_paydata/U1/pending/p1.jpg');
});

test('★ 누가 담고 누가 내려보냈는지 남는다', () => {
  const S = loadStore();
  // 휴가 대리로 남이 손댄 자료를 나중에 구분할 수 있어야 한다(2차).
  const rec = S.pendingRecord({ filename: 'a.jpg', at: 1, by: 'U9' });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: 'attend', at: 2 });
  const item = up['paydata/u/U1/items/202608/p1'];
  assert.equal(item.by, 'U9', '담은 사람이 바뀌었습니다');
  assert.equal(item.filedBy, 'U1', '내려보낸 사람이 안 남았습니다');
});

test('3일 넘게 묵은 대기 자료를 가려낸다', () => {
  const S = loadStore();
  const day = 86400000;
  const now = 10 * day;
  assert.equal(S.isStalePending({ at: now - 2 * day }, now), false);
  assert.equal(S.isStalePending({ at: now - 4 * day }, now), true);
  // 시각이 없으면 오래된 것으로 본다 — 안 보이면 영원히 남는다.
  assert.equal(S.isStalePending({}, now), true);
  assert.equal(S.PENDING_STALE_DAYS, 3);
});

test('공용 대기 칸에서 집으면 내 자리로 오고 집은 사람이 남는다', () => {
  const S = loadStore();
  const rec = { filename: '메일첨부.xlsx', at: 1000, by: '', from: 'mail' };
  const up = S.claimShared('s1', rec);
  assert.ok(up['paydata/u/U1/pending/s1'], '내 대기 칸으로 안 왔습니다');
  assert.equal(up['paydata/u/U1/pending/s1'].by, 'U1');
  assert.equal(up['paydata/u/U1/pending/s1'].claimedBy, 'U1');
  assert.equal(up['paydata/pending_shared/s1'], null);
});

test('★ 자료 번호가 없으면 아무것도 만들지 않는다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: 'a.jpg', at: 1 });
  // 번호가 빈칸이면 'paydata/u/U1/items/202608/' 로 끝나 그 칸을 통째로 덮는다.
  assert.throws(() => S.drawerUpdate('', rec, { companyId: 'co_7', month: '2026-08', kind: 'attend' }), /번호/);
  assert.throws(() => S.claimShared('', rec), /번호/);
});
