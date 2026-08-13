'use strict';
// 도착 칸 — 급여관리 수신함이 읽는 얇은 칸. 실행: node --test tests/*.test.js
//   급여자료는 사람별 자리에 담기므로, 도착 현황을 알려면 남의 자리를 다 열어야 한다.
//   그것이 권한 설계와 부딪히므로 「도착했다는 사실만」 따로 얇게 쓴다.
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

test('도착 칸은 자료를 담을 때 같은 묶음에서 함께 쓰인다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: '근태표.jpg', at: 1 });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: 'attend', at: 2000 });
  // 따로 쓰면 자료는 들어갔는데 도착 표시가 안 켜지는 어긋남이 생긴다.
  assert.equal(up['paydata/arrivals/co_7/202608/attend/p1'], 2000);
  assert.equal(up['paydata/arrivals/co_7/202608/last'], 2000);
});

test('★ 도착 칸에 본문·값·사람 정보가 들어가지 않는다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({
    filename: '근태표_홍길동_3200000.jpg', at: 1,
    file: 'pu_paydata/U1/pending/p1.jpg', by: 'U1'
  });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: 'attend', at: 2000 });
  Object.keys(up).forEach(k => {
    if (k.indexOf('paydata/arrivals/') !== 0) return;
    const v = up[k];
    // 도착 칸은 전 직원이 읽는다. 여기에 파일 이름이나 미리보기가 들어가면
    // 「도착 사실만」이라는 경계가 무너진다(근로자 성명이 파일 이름에 흔히 들어 있다).
    assert.equal(typeof v, 'number', k + ' 에 숫자가 아닌 것이 들어 있습니다: ' + JSON.stringify(v));
  });
});

test('근로계약서는 도착 칸을 keep 으로 적는다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: '계약서.pdf', at: 1 });
  const up = S.drawerUpdate('p1', rec, { companyId: 'co_7', month: '2026-08', kind: 'contract', at: 2000 });
  assert.equal(up['paydata/arrivals/co_7/keep/contract/p1'], 2000);
});

test('★ 도착 장수는 자리 수로 센다 — 더하기를 쓰지 않는다', () => {
  const S = loadStore();
  // 다중 경로 update 는 숫자를 못 늘린다(트랜잭션이 필요하다).
  // 자료마다 한 자리를 만들면 두 번 올려도 장수가 어긋나지 않는다.
  assert.equal(S.arrivalCount({ attend: { a: 1, b: 2 }, last: 2 }, 'attend'), 2);
  assert.equal(S.arrivalCount({ attend: { a: 1, a2: 1 }, last: 1 }, 'ledger'), 0);
  assert.equal(S.arrivalCount(null, 'attend'), 0);
  assert.equal(S.arrivalCount({ last: 1 }, 'attend'), 0);
});

test('★ 같은 자료를 두 번 담아도 장수가 늘지 않는다', () => {
  const S = loadStore();
  const rec = S.pendingRecord({ filename: '근태표.jpg', at: 1 });
  const tag = { companyId: 'co_7', month: '2026-08', kind: 'attend', at: 2000 };
  const a = S.drawerUpdate('p1', rec, tag);
  const b = S.drawerUpdate('p1', rec, Object.assign({}, tag, { at: 3000 }));
  // 같은 번호면 같은 자리에 덮인다 — 자리 수가 그대로다.
  const key = 'paydata/arrivals/co_7/202608/attend/p1';
  assert.ok(key in a && key in b);
  assert.equal(b[key], 3000, '마지막 시각으로 덮여야 합니다');
});

test('도착 칸 자리는 업체·귀속월까지만 가리킨다', () => {
  const S = loadStore();
  assert.equal(S.arrivalPath('co_7', '202608'), 'paydata/arrivals/co_7/202608');
  // 사람(uid)이 자리에 들어가면 누가 담았는지가 전 직원에게 보인다.
  assert.equal(S.arrivalPath('co_7', '202608').indexOf('U1'), -1);
});

test('업체나 종류를 모르면 도착 표시를 만들지 않는다', () => {
  const S = loadStore();
  // 빈 값으로 자리를 만들면 'paydata/arrivals//202608//p1' 같은 자리가 생긴다.
  assert.equal(Object.keys(S.arrivalMarks('', '202608', 'attend', 'p1', 1)).length, 0);
  assert.equal(Object.keys(S.arrivalMarks('co_7', '202608', '', 'p1', 1)).length, 0);
  assert.equal(Object.keys(S.arrivalMarks('co_7', '', 'attend', 'p1', 1)).length, 0);
  assert.equal(Object.keys(S.arrivalMarks('co_7', '202608', 'attend', '', 1)).length, 0);
});
