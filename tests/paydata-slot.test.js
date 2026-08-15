'use strict';
// 서랍 칸 읽기 · 보유기간 · 창고 내려받기 주소 — 실행: node --test tests/*.test.js
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
  S.init({ uid: 'U1' });
  return S;
}

test('한 칸의 자리는 사업장을 가리지 않는다 — 화면이 companyId 로 거른다', () => {
  const S = loadStore();
  assert.equal(S.slotPath('202608'), 'paydata/u/U1/items/202608');
  assert.equal(S.slotPath(S.KEEP), 'paydata/u/U1/items/keep');
});

test('★ 귀속월 자료는 그 달 말일부터 3년을 센다', () => {
  const S = loadStore();
  const now = new Date(2029, 8, 1).getTime();   // 2029-09-01
  // 2026년 8월 자료 — 말일(8/31 23:59:59)부터 3년이면 2029-08-31 23:59:59.
  assert.equal(S.isExpired({ month: '202608', filedAt: 1 }, now), true);
  assert.equal(S.isExpired({ month: '202609', filedAt: 1 }, now), false);
});

test('★ keep 자료(근로계약서)는 담은 날부터 3년을 센다 — 귀속월이 없다', () => {
  const S = loadStore();
  const day = 86400000;
  const filedAt = 1000;
  const justUnder = filedAt + 3 * 365 * day - day;
  const justOver = filedAt + 3 * 365 * day + day;
  assert.equal(S.isExpired({ month: S.KEEP, filedAt: filedAt }, justUnder), false);
  assert.equal(S.isExpired({ month: S.KEEP, filedAt: filedAt }, justOver), true);
});

test('시각을 모르면 지난 것으로 보지 않는다 — 잘못된 경고를 띄우지 않는다', () => {
  const S = loadStore();
  assert.equal(S.isExpired({ month: '202608' }, Date.now()), false);
  assert.equal(S.isExpired(null, Date.now()), false);
});

test('창고 연결이 없으면 다운로드 주소를 알리고 거절한다', () => {
  const S = loadStore();
  S.init({ storage: null });
  return S.fileDownloadUrl('pu_paydata/U1/202608/a.pdf').then(
    () => { throw new Error('거절해야 하는데 성공했습니다'); },
    (e) => { assert.match(e.message, /창고/); }
  );
});

test('★ 파일 자리가 비어 있으면 창고를 부르지 않고 바로 알린다', () => {
  const S = loadStore();
  let called = false;
  S.init({ storage: { ref: () => { called = true; return { getDownloadURL: () => Promise.resolve('x') }; } } });
  return S.fileDownloadUrl('').then(
    () => { throw new Error('거절해야 합니다'); },
    (e) => { assert.match(e.message, /자리/); assert.equal(called, false, '빈 자리인데 창고를 불렀습니다'); }
  );
});

test('창고가 있으면 그 경로로 물어본다', () => {
  const S = loadStore();
  let asked = '';
  S.init({ storage: { ref: (p) => { asked = p; return { getDownloadURL: () => Promise.resolve('https://x/y') }; } } });
  return S.fileDownloadUrl('pu_paydata/U1/202608/a.pdf').then((url) => {
    assert.equal(asked, 'pu_paydata/U1/202608/a.pdf');
    assert.equal(url, 'https://x/y');
  });
});
