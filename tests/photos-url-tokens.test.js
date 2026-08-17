'use strict';
/* 사진 보기 주소(토큰 URL) — 창고 규칙 403 의 근본 수리 (2026-08-17)

   창고(Storage) 규칙은 실시간DB(uid_roles)를 읽을 수 없어 「자기 사진만」으로
   잠겨 있다. 그래서 관리자가 남의 사진을, 직원이 공유받은 사진을 보면 창고가
   403 으로 거부했다 — 대표 화면에서 남의 회의사진 46장이 전부 회색 칸이었고
   콘솔에 403 이 832건, 크게 보기에서는 남의 사진이 「원본이 없습니다」로 둔갑했다.

   수리: 주소(토큰 URL)는 규칙과 무관하게 열린다. 그래서
   ① 올릴 때 주소를 정보에 함께 적고(savePhoto·replaceImage)
   ② 읽을 때 적어 둔 주소를 먼저 쓰고(loadFull·loadThumb)
   ③ 이미 옮겨진 옛 사진은 서버 도구가 주소를 채운다(tokenize 통과).
   = 정보(실시간DB)를 읽을 수 있는 사람이 곧 사진도 볼 수 있다 — 실시간DB
   시절과 같은 접근 범위다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

/* ══════ ① 서버 도구 — 순수 모듈을 실제로 돌려서 확인한다 ══════ */
const MIG = require(path.join(R, 'functions', 'photos-migrate.js'));

function fakeServer(items, files) {
  const calls = { writeUrls: [], writeMigrated: [], uploads: [], tokens: [] };
  const db = {
    listOwners: () => Promise.resolve(['U1']),
    listYears: () => Promise.resolve(['2026']),
    listYear: () => Promise.resolve(items),
    readItem: (u, y, id) => Promise.resolve(items[id] && items[id]._body || null),
    writeMigrated: (u, y, id) => { calls.writeMigrated.push(id); return Promise.resolve(); },
    writeUrls: (u, y, id, urls) => { calls.writeUrls.push({ id, urls }); return Promise.resolve(); }
  };
  const bucket = {
    upload: (p) => { calls.uploads.push(p); return Promise.resolve(); },
    exists: () => Promise.resolve(true),
    downloadUrl: (p) => {
      calls.tokens.push(p);
      if (files && files[p] === false) return Promise.resolve(null);   // 창고에 없는 파일
      return Promise.resolve('https://tok/' + p);
    }
  };
  return { db, bucket, calls };
}

test('★ 이미 옮겨진(loc=storage) 사진에 주소가 없으면 채운다 — 403 의 근본 수리', async () => {
  const { db, bucket, calls } = fakeServer({
    p1: { loc: 'storage' },                                        // 주소 없음 → 채워야 한다
    p2: { loc: 'storage', fullUrl: 'u', thumbUrl: 'u' }            // 이미 있음 → 손대지 않는다
  });
  const out = await MIG.migrateBatch(db, bucket, 30);
  assert.equal(out.linked, 1, '★ 주소를 안 채우면 관리자 화면의 남의 사진이 영영 회색입니다');
  assert.equal(out.skipped, 1, '이미 있는 것을 또 만들면 멱등이 아닙니다');
  assert.equal(calls.writeUrls.length, 1);
  assert.equal(calls.writeUrls[0].id, 'p1');
  assert.match(calls.writeUrls[0].urls.fullUrl, /^https:\/\/tok\//);
});

test('★ 새로 옮기는 사진도 주소를 바로 적는다', async () => {
  const { db, bucket, calls } = fakeServer({
    p3: { _body: { full: 'data:image/jpeg;base64,AAA', thumb: 'data:image/jpeg;base64,BBB' } }
  });
  const out = await MIG.migrateBatch(db, bucket, 30);
  assert.equal(out.moved, 1);
  assert.equal(calls.writeUrls.length, 1, '★ 옮기고 주소를 안 적으면 다음 통과까지 회색입니다');
  // 순서: 확인(writeMigrated) 뒤에 주소 — 주소 실패가 이사를 뒤집으면 안 된다
  assert.ok(calls.writeMigrated.length === 1);
});

test('미리보기 파일이 창고에 없어도 본문 주소만 적고 계속 간다', async () => {
  const files = {}; files[MIG.photoPath('U1', '2026', 'p4', 'thumbs')] = false;
  const { db, bucket, calls } = fakeServer({ p4: { loc: 'storage' } }, files);
  const out = await MIG.migrateBatch(db, bucket, 30);
  assert.equal(out.linked, 1);
  assert.equal(calls.writeUrls[0].urls.thumbUrl, null);
  assert.match(calls.writeUrls[0].urls.fullUrl, /^https/);
});

test('★ 주소 채우기도 한도에 든다 — 수백 장이 한 번에 돌면 서버 시간제한에 걸린다', async () => {
  const many = {};
  for (let i = 0; i < 40; i++) many['p' + i] = { loc: 'storage' };
  const { db, bucket } = fakeServer(many);
  const out = await MIG.migrateBatch(db, bucket, 10);
  assert.equal(out.linked, 10);
  assert.equal(out.done, false, '★ 다 못 했으면 다 못 했다고 해야 버튼을 다시 누릅니다');
});

test('둘 다 창고에 없는 유령은 건너뛴다 — 없는 주소를 지어내지 않는다', async () => {
  const files = {};
  files[MIG.photoPath('U1', '2026', 'p5', 'blobs')] = false;
  files[MIG.photoPath('U1', '2026', 'p5', 'thumbs')] = false;
  const { db, bucket, calls } = fakeServer({ p5: { loc: 'storage' } }, files);
  const out = await MIG.migrateBatch(db, bucket, 30);
  assert.equal(out.linked, 0);
  assert.equal(calls.writeUrls.length, 0);
});

/* ══════ ② 저장 층 — 올릴 때 적고, 읽을 때 먼저 쓴다 ══════ */

function loadStore(opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  const calls = { updates: [], urlFetch: [], sdkUrl: [] };
  const rt = opts.rtdb || {};
  const sandbox = {
    window: {}, console: { log() {}, warn() {} },
    Date, Promise, Object, String, Number, Math, JSON,
    FileReader: function () {
      const self = this;
      this.readAsDataURL = function () { setTimeout(function () { self.result = 'data:done'; self.onload(); }, 0); };
    },
    fetch(url) {
      calls.urlFetch.push(url);
      if (opts.deadUrl) return Promise.resolve({ ok: false, status: 403 });
      return Promise.resolve({ ok: true, blob: () => Promise.resolve({}) });
    },
    setTimeout, clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-photo-store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPhotoStore;
  S.init({
    uid: 'ME',
    db: {
      ref: (p) => ({
        update: (u) => { calls.updates.push(u); return Promise.resolve(); },
        once: () => Promise.resolve({ val: () => {
          // readOnce(경로) — 경로별 가짜 값
          for (const k in rt) if (p === undefined || p === k) return rt[k];
          return (p && Object.prototype.hasOwnProperty.call(rt, p)) ? rt[p] : null;
        } }),
        push: () => ({ key: 'NEW1' })
      })
    },
    storage: {
      ref: (p) => ({
        putString: () => Promise.resolve(),
        getDownloadURL: () => { calls.sdkUrl.push(p); return Promise.resolve('https://sdk/' + p); }
      })
    },
    mode: 'storage'
  });
  return { S, calls, sandbox };
}

test('★ 올릴 때 주소를 정보에 함께 적는다 — 남이 곧바로 볼 수 있게', async () => {
  const { S, calls } = loadStore();
  await S.savePhoto({ id: 'p1', full: 'data:image/jpeg;base64,AAA', thumb: 'data:image/jpeg;base64,BBB', meta: { upAt: 1, by: 'ME', kind: 'doc' } });
  const metaWrite = calls.updates.find(u => Object.keys(u).some(k => /items\/\d+\/p1$/.test(k)));
  assert.ok(metaWrite, '정보 쓰기를 찾지 못했습니다');
  const rec = metaWrite[Object.keys(metaWrite).find(k => /items\/\d+\/p1$/.test(k))];
  assert.match(String(rec.fullUrl), /^https:\/\/sdk\//, '★ 주소가 없으면 관리자·공유 화면에서 403 입니다');
  assert.match(String(rec.thumbUrl), /^https:\/\/sdk\//);
  assert.equal(rec.loc, 'storage');
});

test('주소받기가 실패해도 저장은 계속된다 — 사진을 잃는 것보다 낫다', async () => {
  const { S, calls } = loadStore();
  // getDownloadURL 만 실패시킨다
  S.init({ uid: 'ME',
    db: { ref: () => ({ update: (u) => { calls.updates.push(u); return Promise.resolve(); }, push: () => ({ key: 'N2' }) }) },
    storage: { ref: () => ({ putString: () => Promise.resolve(), getDownloadURL: () => Promise.reject(new Error('막힘')) }) },
    mode: 'storage' });
  await S.savePhoto({ id: 'p2', full: 'data:image/jpeg;base64,AAA', thumb: 'data:image/jpeg;base64,BBB', meta: { upAt: 1 } });
  const metaWrite = calls.updates.find(u => Object.keys(u).some(k => /items\/\d+\/p2$/.test(k)));
  assert.ok(metaWrite, '★ 주소 실패가 저장 자체를 뒤집었습니다');
  const rec = metaWrite[Object.keys(metaWrite).find(k => /items\/\d+\/p2$/.test(k))];
  assert.equal(rec.loc, 'storage');
  assert.ok(!rec.fullUrl, '실패했으면 없는 채로 둔다 — 서버 채우기가 나중에 채운다');
});

test('★ 읽을 때 적어 둔 주소를 먼저 쓴다 — 창고 규칙(403)을 안 거친다', async () => {
  const { S, calls } = loadStore({
    rtdb: { 'puphotos/u/ME/items/2026/p1/fullUrl': 'https://tok/full1' }
  });
  const got = await S.loadFull('2026', 'p1');
  assert.equal(got, 'data:done');
  assert.deepEqual(calls.urlFetch, ['https://tok/full1'], '★ 주소가 있는데 창고에 새로 청하면 남의 사진은 403 입니다');
  assert.equal(calls.sdkUrl.length, 0, '주소가 있으면 창고 문(getDownloadURL)을 두드릴 이유가 없습니다');
});

test('★ 죽은 주소면 지우고 옛 길로 물러난다 — 사진이 영영 안 보이면 안 된다', async () => {
  const { S, calls } = loadStore({
    deadUrl: true,
    rtdb: { 'puphotos/u/ME/items/2026/p1/fullUrl': 'https://tok/dead' }
  });
  await S.loadFull('2026', 'p1').catch(() => null);   // 옛 길(가짜 창고)로 간다
  const wiped = calls.updates.some(u =>
    Object.keys(u).some(k => /p1\/fullUrl$/.test(k)) &&
    u[Object.keys(u).find(k => /p1\/fullUrl$/.test(k))] === null);
  assert.ok(wiped, '★ 죽은 주소를 안 지우면 다음에도 같은 죽은 주소를 씁니다');
  assert.ok(calls.sdkUrl.length > 0, '옛 길(창고 직접)로 물러나야 주인 본인은 계속 봅니다');
});

/* ══════ ③ 배선 — 서버 응답·화면 표시·캐시 ══════ */

test('서버 응답과 화면이 「주소 채움」을 함께 말한다', () => {
  const idx = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');
  assert.match(idx, /linked: result\.linked/, '서버가 세고도 응답에 안 실으면 화면이 모릅니다');
  const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
  assert.match(app, /주소 채움/, '화면이 주소 채움 수를 안 보여 줍니다');
});

test('★ 저장 층을 고쳤으니 ?v= 을 올렸다 — 네 앱 전부', () => {
  for (const f of ['pu-photos.html', 'pu-erp.html', 'fund.html', 'gov-consulting.html']) {
    const html = fs.readFileSync(path.join(R, f), 'utf8');
    const m = html.match(/js\/pu-photo-store\.js\?v=(\d+)/);
    assert.ok(m, f + ' 에 ?v= 가 없습니다');
    assert.ok(Number(m[1]) >= 3, '★ ' + f + ' 의 ?v= 를 안 올려 수리가 캐시에 묻힙니다');
  }
});
