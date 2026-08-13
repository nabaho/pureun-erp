'use strict';
// 창고 파일 → data URL 변환 — 실행: node --test tests/*.test.js
//   사진첩은 사진을 실시간DB 블롭으로 두어 이 변환이 필요 없었다.
//   급여데이터함은 Storage 를 쓰므로 AI 판독기(base64 inline_data)에 실으려면
//   내려받기 주소를 한 번 더 fetch 해서 base64 로 바꿔야 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const sandbox = { window: {}, console, Buffer };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-paydata-store.js' }).runInContext(sandbox);
  return sandbox.window.PuPaydataStore;
}

function fakeStorage(urlOf) {
  return { ref: (p) => ({ getDownloadURL: () => Promise.resolve(urlOf ? urlOf(p) : ('https://x/' + p)) }) };
}

test('★ 창고 파일을 받아 data URL 로 바꾼다', async () => {
  const S = loadStore();
  const seen = [];
  const buf = Buffer.from('hello');
  S.init({
    storage: fakeStorage(),
    fetch: (url) => { seen.push(url); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) }); }
  });
  const out = await S.fileToDataUrl('u/U1/items/202608/a1', 'image/jpeg');
  assert.equal(out, 'data:image/jpeg;base64,' + buf.toString('base64'));
  assert.equal(seen.length, 1);
  assert.equal(seen[0], 'https://x/u/U1/items/202608/a1');
});

test('mime 을 안 주면 기본값을 쓴다', async () => {
  const S = loadStore();
  const buf = Buffer.from('x');
  S.init({
    storage: fakeStorage(),
    fetch: () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) })
  });
  const out = await S.fileToDataUrl('u/U1/items/202608/a1');
  assert.match(out, /^data:application\/octet-stream;base64,/);
});

test('창고가 연결되지 않았으면 알리고 거절한다', async () => {
  const S = loadStore();
  S.init({ fetch: () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) });
  return S.fileToDataUrl('u/U1/items/202608/a1').then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /창고/)
  );
});

test('fetch 를 쓸 수 없으면 알리고 거절한다', async () => {
  const S = loadStore();
  const sandbox2 = { window: {}, console, Buffer };
  sandbox2.globalThis = sandbox2;
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  vm.createContext(sandbox2);
  new vm.Script(src, { filename: 'store2.js' }).runInContext(sandbox2);
  const S2 = sandbox2.window.PuPaydataStore;
  S2.init({ storage: fakeStorage() });
  return S2.fileToDataUrl('u/U1/items/202608/a1').then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /파일/)
  );
});

test('내려받는 도중 실패하면 예외를 남긴다', async () => {
  const S = loadStore();
  S.init({ storage: fakeStorage(), fetch: () => Promise.resolve({ ok: false }) });
  return S.fileToDataUrl('u/U1/items/202608/a1').then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.ok(e.message)
  );
});

test('파일 자리가 없으면 알리고 거절한다', async () => {
  const S = loadStore();
  S.init({ storage: fakeStorage(), fetch: () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) });
  return S.fileToDataUrl('').then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /자리/)
  );
});
