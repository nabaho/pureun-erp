'use strict';
// 파일 올리기 — 실행: node --test tests/*.test.js
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

test('확장자를 파일 이름에서 뽑고 없으면 종류에서 짐작한다', () => {
  const S = loadStore();
  assert.equal(S.extOf('근태표.XLSX', ''), 'xlsx');
  assert.equal(S.extOf('계약서.pdf', ''), 'pdf');
  assert.equal(S.extOf('사진', 'image/jpeg'), 'jpg');
  assert.equal(S.extOf('무엇', ''), 'bin');
});

test('★ 엑셀·PDF·사진·한글 파일을 모두 받는다', () => {
  const S = loadStore();
  // 사진첩은 이미지만 담긴다. 급여자료는 엑셀·PDF·한글이 섞여 있어 이게 핵심이다.
  assert.equal(S.acceptFile({ name: 'a.xlsx', size: 1000, type: '' }).ok, true);
  assert.equal(S.acceptFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' }).ok, true);
  assert.equal(S.acceptFile({ name: 'a.jpg', size: 1000, type: 'image/jpeg' }).ok, true);
  assert.equal(S.acceptFile({ name: 'a.hwp', size: 1000, type: '' }).ok, true);
});

test('★ 너무 큰 파일과 빈 파일은 알리고 막는다', () => {
  const S = loadStore();
  // 조용히 실패하면 「올렸다」고 생각하고 원본을 지운다.
  const big = S.acceptFile({ name: 'a.pdf', size: S.UPLOAD_MAX + 1, type: '' });
  assert.equal(big.ok, false);
  assert.match(big.why, /큽니다/);   // "너무 큽니다" — 한글 음절이라 '크' 만으로는 안 걸린다
  const zero = S.acceptFile({ name: 'a.pdf', size: 0, type: '' });
  assert.equal(zero.ok, false);
});

test('경계값 — 정확히 상한이면 받고 한 바이트 넘으면 막는다', () => {
  const S = loadStore();
  assert.equal(S.acceptFile({ name: 'a.pdf', size: S.UPLOAD_MAX, type: '' }).ok, true);
  assert.equal(S.acceptFile({ name: 'a.pdf', size: S.UPLOAD_MAX + 1, type: '' }).ok, false);
});

test('★ 실행 파일은 받지 않는다', () => {
  const S = loadStore();
  assert.equal(S.acceptFile({ name: 'a.exe', size: 10, type: '' }).ok, false);
  assert.equal(S.acceptFile({ name: 'a.js', size: 10, type: '' }).ok, false);
  assert.equal(S.acceptFile({ name: 'a.html', size: 10, type: '' }).ok, false);
});

test('파일이 아예 없으면 알린다', () => {
  const S = loadStore();
  assert.equal(S.acceptFile(null).ok, false);
  assert.equal(S.acceptFile(undefined).ok, false);
});

test('★ 창고에 올린 뒤에 정보를 쓴다 — 순서가 뒤집히면 유령 자료가 남는다', () => {
  const S = loadStore();
  const order = [];
  const fakeRef = {
    put: () => { order.push('창고'); return Promise.resolve({}); },
    getDownloadURL: () => Promise.resolve('https://x/y')
  };
  S.init({
    uid: 'U1',
    storage: { ref: () => fakeRef },
    db: { ref: () => ({ update: () => { order.push('정보'); return Promise.resolve(); } }) }
  });
  return S.saveFile({ name: 'a.pdf', size: 10, type: 'application/pdf' }, { at: 1 })
    .then(() => { assert.deepEqual(order, ['창고', '정보']); });
});

test('★ 받을 수 없는 파일은 창고를 부르지 않는다', () => {
  const S = loadStore();
  let called = false;
  S.init({
    uid: 'U1',
    storage: { ref: () => { called = true; return { put: () => Promise.resolve({}) }; } },
    db: { ref: () => ({ update: () => Promise.resolve() }) }
  });
  return S.saveFile({ name: 'a.exe', size: 10, type: '' }, {}).then(
    () => { throw new Error('거절해야 합니다'); },
    () => { assert.equal(called, false, '거부할 파일인데 창고를 불렀습니다'); }
  );
});

test('올린 자료는 대기 칸에 담긴다 — 사업장·귀속월을 아직 모른다', () => {
  const S = loadStore();
  let written = null;
  S.init({
    uid: 'U1',
    storage: { ref: () => ({ put: () => Promise.resolve({}) }) },
    db: { ref: () => ({ update: (u) => { written = u; return Promise.resolve(); } }) }
  });
  return S.saveFile({ name: '근태표.jpg', size: 10, type: 'image/jpeg' }, { at: 5 }).then(id => {
    const rec = written[S.pendingPath(id)];
    assert.ok(rec, '대기 칸 자리에 안 담겼습니다');
    assert.equal(rec.filename, '근태표.jpg');
    assert.equal(rec.companyId, '');
    assert.equal(rec.month, '');
  });
});

test('찍은 것과 올린 것을 from 값으로 구분한다', () => {
  const S = loadStore();
  let written = null;
  S.init({
    uid: 'U1',
    storage: { ref: () => ({ put: () => Promise.resolve({}) }) },
    db: { ref: () => ({ update: (u) => { written = u; return Promise.resolve(); } }) }
  });
  return S.saveFile({ name: 'a.jpg', size: 10, type: 'image/jpeg' }, { at: 1, from: 'camera' }).then(id => {
    assert.equal(written[S.pendingPath(id)].from, 'camera');
  });
});
