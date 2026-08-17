'use strict';
/* 민감 서류(계약서·근태표)의 원본 주소를 남기지 않는다 — 보안 3건 계획 2단계
   (대표 지시 2026-08-17 「1부터 순서대로」)

   ■ 무엇이 문제였나 (실제 자료로 확인)

   사진 정보에 창고 토큰 주소가 그대로 적혀 있었다:
     만료 없음 · 로그인 불필요 · **공유를 풀어도 열린다**
   근로계약서에는 주민번호가 있다. 주소가 한 번 밖으로 나가면 되돌릴 수 없다.

   ■ 이 검사가 못 박는 것

   ⚠ 「fullUrl 을 안 적는다」는 **글자로는 확인이 안 된다** — 지우는 줄이 있어도
     다른 갈래(판독·손수 분류·사진 돌리기)에서 되살아나면 뜻이 없다.
     그래서 저장 층을 **가짜 DB 위에 올려 실제로 돌려** 무엇이 쓰였는지 본다.

   ⚠ 토큰 주소를 **전면 폐지하는 것이 아니다.** 회의사진 46장이 회색 칸이 된
     403 사태(2026-08-17)가 되풀이되면 안 된다 — 민감하지 않은 것은 그대로 둔다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const PV = require(path.join(R, 'functions', 'photo-view.js'));

/* ── 저장 층을 가짜 세상에 올린다 ── */
function loadStore(opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  const ctx = {
    console, Promise, JSON, Math, Date, String, Number, Array, Object, Error, Boolean,
    setTimeout, clearTimeout, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.fetch = opts.fetch || function () { return Promise.reject(new Error('네트워크 없음')); };
  ctx.FileReader = function () {
    this.readAsDataURL = function () { const s = this; setTimeout(function () { s.onload && s.onload(); }, 0); };
    this.result = 'data:image/jpeg;base64,RkFLRQ==';
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.PuPhotoStore;
}

/* 아주 얇은 가짜 실시간DB — 무엇이 쓰였는지 그대로 모은다 */
function fakeDb(tree) {
  const writes = [];
  const get = function (p) {
    return String(p).split('/').filter(Boolean).reduce(function (o, k) {
      return (o && typeof o === 'object') ? o[k] : undefined;
    }, tree);
  };
  return {
    writes: writes,
    ref: function (p) {
      return {
        once: function () { return Promise.resolve({ val: function () { const v = get(p); return v === undefined ? null : v; } }); },
        update: function (u) { writes.push(u); return Promise.resolve(); }
      };
    }
  };
}

const CONTRACT = { kind: 'contract', fields: {} };
const MEETING = { kind: 'meeting', fields: {} };

/* ══════ ① 판독이 계약서로 가리면 그 자리에서 원본 주소를 지운다 ══════ */
test('판독 결과를 쓸 때', async (t) => {
  await t.test('★ 계약서로 가리면 원본 주소를 지운다', async () => {
    const tree = { puphotos: { u: { me: { items: { 2026: { p1: { kind: 'doc', fullUrl: 'https://old' } } } } } } };
    const db = fakeDb(tree);
    const S = loadStore();
    S.init({ db: db, uid: 'me' });
    await S.saveRead('2026', 'p1', CONTRACT);
    assert.equal(db.writes.length, 1);
    const w = db.writes[0];
    assert.equal(w['puphotos/u/me/items/2026/p1/fullUrl'], null,
      '원본 주소가 남았습니다 — 만료도 로그인도 없는 링크라 공유를 풀어도 열립니다.');
    assert.deepEqual(w['puphotos/u/me/items/2026/p1/read'], CONTRACT);
  });

  await t.test('★ 근태표도 지운다', async () => {
    const tree = { puphotos: { u: { me: { items: { 2026: { p1: { fullUrl: 'https://old' } } } } } } };
    const db = fakeDb(tree);
    const S = loadStore();
    S.init({ db: db, uid: 'me' });
    await S.saveRead('2026', 'p1', { kind: 'timesheet' });
    assert.equal(db.writes[0]['puphotos/u/me/items/2026/p1/fullUrl'], null);
  });

  await t.test('★ 회의사진은 «그대로 둔다» — 403 사태를 되풀이하지 않는다', async () => {
    const tree = { puphotos: { u: { me: { items: { 2026: { p1: { fullUrl: 'https://keep' } } } } } } };
    const db = fakeDb(tree);
    const S = loadStore();
    S.init({ db: db, uid: 'me' });
    await S.saveRead('2026', 'p1', MEETING);
    assert.equal('puphotos/u/me/items/2026/p1/fullUrl' in db.writes[0], false,
      '민감하지 않은 사진의 주소를 지웠습니다 — 남의 회의사진이 회색 칸이 됩니다.');
  });

  await t.test('★ 미리보기 주소는 «건드리지 않는다» — 격자가 느려진다', async () => {
    const tree = { puphotos: { u: { me: { items: { 2026: { p1: { fullUrl: 'https://f', thumbUrl: 'https://t' } } } } } } };
    const db = fakeDb(tree);
    const S = loadStore();
    S.init({ db: db, uid: 'me' });
    await S.saveRead('2026', 'p1', CONTRACT);
    assert.equal('puphotos/u/me/items/2026/p1/thumbUrl' in db.writes[0], false,
      '240px 미리보기로는 글씨를 못 읽습니다. 그것까지 서버로 돌리면 격자가 통째로 느려집니다.');
  });

  await t.test('★ 손수 「계약서」로 옮겨도 지운다', async () => {
    /* saveRead 한 곳만 고치면, 사람이 직접 옮긴 사진의 주소는 그대로 남는다 —
       손으로 옮기는 쪽이 오히려 정확한 분류다. */
    const db = fakeDb({});
    const S = loadStore();
    S.init({ db: db, uid: 'me' });
    await S.setPrimaryKind('2026', 'p1', CONTRACT, null);
    assert.equal(db.writes[0]['puphotos/u/me/items/2026/p1/fullUrl'], null,
      '손수 분류로 옮긴 계약서의 주소가 남았습니다.');
  });
});

/* ══════ ② 사진을 돌려도 주소가 되살아나지 않는다 ══════ */
test('★ 사진을 돌려도 원본 주소가 되살아나지 않는다', async () => {
  /* 이 갈래를 빠뜨리면 한 번 돌리는 것만으로 지워 둔 주소가 다시 적힌다 —
     판독 때 지운 것이 조용히 무효가 된다. */
  const tree = { puphotos: { u: { me: { items: { 2026: { p1: { read: CONTRACT } } } } } } };
  const db = fakeDb(tree);
  /* 돌리기는 올린 뒤 «되읽어» 확인한다 — 그 되읽기가 fetch 를 쓴다.
     막아 두면 창고 갈래가 통째로 실패해 실시간DB 로 물러나고, 검사가 헛돈다. */
  const S = loadStore({
    fetch: function () {
      return Promise.resolve({ ok: true, status: 200, blob: function () { return Promise.resolve({}); } });
    }
  });
  const uploaded = [];
  S.init({
    db: db, uid: 'me', mode: 'storage',
    storage: {
      ref: function (p) {
        return {
          putString: function () { uploaded.push(p); return Promise.resolve(); },
          getDownloadURL: function () { return Promise.resolve('https://token/' + p); },
          delete: function () { return Promise.resolve(); }
        };
      }
    }
  });
  await S.replaceImage('2026', 'p1', 'data:image/jpeg;base64,QQ==', 'data:image/jpeg;base64,QQ==');
  const w = db.writes[db.writes.length - 1];
  assert.equal(w['puphotos/u/me/items/2026/p1/fullUrl'], null,
    '돌리기가 원본 주소를 다시 적었습니다 — 지운 것이 무효가 됩니다.');
  assert.match(String(w['puphotos/u/me/items/2026/p1/thumbUrl']), /^https:\/\/token\//,
    '미리보기 주소는 그대로 적혀야 합니다(격자 속도).');
});

/* ══════ ③ 원본이 없으면 서버에 청한다 ══════ */
test('원본 받아오기', async (t) => {
  await t.test('★ 창고에 없으면 서버에 청한다 (남의 계약서를 볼 길)', async () => {
    /* 창고 규칙은 「자기 사진만」이라 관리자·공유받은 사람은 403 이다.
       이 갈래가 없으면 계약서가 「원본이 없습니다」로 보인다. */
    const calls = [];
    const S = loadStore({
      fetch: function (url, init) {
        calls.push({ url: url, init: init, body: JSON.parse(init.body) });
        return Promise.resolve({
          ok: true, status: 200,
          json: function () { return Promise.resolve({ ok: true, dataUrl: 'data:image/jpeg;base64,WQ==' }); }
        });
      }
    });
    S.init({
      db: fakeDb({}), uid: 'me',
      auth: { currentUser: { getIdToken: function () { return Promise.resolve('토큰'); } } }
    });
    const out = await S.loadFull('2026', 'p1', 'other');
    assert.equal(out, 'data:image/jpeg;base64,WQ==', '서버에서 원본을 못 받았습니다: ' + out);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /cloudfunctions\.net\/photoView$/, '우리 서버가 아닙니다: ' + calls[0].url);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer 토큰',
      '로그인 증명을 안 붙이면 서버가 401 로 막아 「안 보인다」로만 보입니다.');
    assert.deepEqual(calls[0].body, { owner: 'other', year: '2026', id: 'p1' });
  });

  await t.test('★ 적힌 주소가 있으면 서버를 «부르지 않는다» — 요금·속도', async () => {
    let called = 0;
    const tree = { puphotos: { u: { me: { items: { 2026: { p1: { fullUrl: 'https://kept/x' } } } } } } };
    const S = loadStore({
      fetch: function (u) {
        called++;
        if (String(u).indexOf('photoView') >= 0) throw new Error('서버를 불렀습니다');
        return Promise.resolve({ ok: true, blob: function () { return Promise.resolve({}); } });
      }
    });
    S.init({ db: fakeDb(tree), uid: 'me', auth: { currentUser: { getIdToken: function () { return Promise.resolve('t'); } } } });
    await S.loadFull('2026', 'p1');
    assert.ok(called >= 1, '적힌 주소를 안 썼습니다.');
  });

  await t.test('★ 로그인 증명이 없으면 서버를 부르지 않는다', async () => {
    let hit = 0;
    const S = loadStore({ fetch: function () { hit++; return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); } });
    S.init({ db: fakeDb({}), uid: 'me', auth: { currentUser: null } });
    const out = await S.loadFull('2026', 'p1', 'other');
    assert.equal(hit, 0, '증명 없이 서버를 불렀습니다 — 401 만 받고 원인을 못 짚습니다.');
    assert.equal(out, '');
  });

  await t.test('★ 「민감 서류가 아니다」(400)는 조용히 물러난다', async () => {
    /* 부르는 쪽이 헛짚은 것이다 — 사람에게 알릴 일이 아니다. */
    const S = loadStore({
      fetch: function () {
        return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ ok: false, error: '민감 서류가 아닙니다' }); } });
      }
    });
    S.init({ db: fakeDb({}), uid: 'me', auth: { currentUser: { getIdToken: function () { return Promise.resolve('t'); } } } });
    assert.equal(await S.loadFull('2026', 'p1', 'other'), '');
  });

  await t.test('★ 권한 없음(403)·없는 파일(404)은 «말해 준다»', async () => {
    for (const s of [403, 404, 502]) {
      const S = loadStore({
        fetch: function () {
          return Promise.resolve({ ok: false, status: s, json: function () { return Promise.resolve({ ok: false, error: '까닭 ' + s }); } });
        }
      });
      S.init({ db: fakeDb({}), uid: 'me', auth: { currentUser: { getIdToken: function () { return Promise.resolve('t'); } } } });
      const e = await S.loadFull('2026', 'p1', 'other').then(function () { return null; }, function (x) { return x; });
      assert.ok(e, s + ' 인데 조용히 넘어갔습니다 — 왜 안 보이는지 알 수 없습니다.');
      assert.equal(e.status, s, '상태 숫자가 사라졌습니다(' + s + ' → ' + e.status + ')');
    }
  });
});

/* ══════ ④ 서버 — 누가 볼 수 있는가 ══════ */
test('서버 문지기', async (t) => {
  const item = { read: { kind: 'contract' }, shareWith: { friend: true } };

  await t.test('★ 주인·관리자·공유받은 사람만 본다', () => {
    assert.equal(PV.canSee({ viewerUid: 'me', owner: 'me', role: {}, item: item }).ok, true, '주인이 막혔습니다');
    assert.equal(PV.canSee({ viewerUid: 'boss', owner: 'me', role: { isAdmin: true }, item: item }).ok, true, '관리자가 막혔습니다');
    assert.equal(PV.canSee({ viewerUid: 'friend', owner: 'me', role: {}, item: item }).ok, true, '공유받은 사람이 막혔습니다');
  });

  await t.test('★ 남은 못 본다', () => {
    const r = PV.canSee({ viewerUid: 'stranger', owner: 'me', role: {}, item: item });
    assert.equal(r.ok, false, '아무나 남의 계약서를 봅니다.');
    assert.equal(r.status, 403);
  });

  await t.test('★ 공유를 풀면 «곧바로» 막힌다 — 이 고침의 존재 이유', () => {
    /* 예전에는 주소를 이미 받은 사람이 공유를 풀어도 계속 열었다. */
    const off = { read: { kind: 'contract' }, shareWith: {} };
    assert.equal(PV.canSee({ viewerUid: 'friend', owner: 'me', role: {}, item: off }).ok, false);
  });

  await t.test('★ shareWith 값이 true 가 아니면 안 열어 준다', () => {
    /* 지운 자리에 남는 빈 값·문자열을 「있다」로 읽으면 안 된다. */
    [false, 0, '', null, 'yes', 1].forEach(function (v) {
      const w = { read: { kind: 'contract' }, shareWith: { friend: v } };
      const ok = PV.canSee({ viewerUid: 'friend', owner: 'me', role: {}, item: w }).ok;
      assert.equal(ok, v === true, 'shareWith=' + JSON.stringify(v) + ' 인데 판정이 ' + ok);
    });
  });

  await t.test('★ 민감하지 않은 사진은 서버가 다루지 않는다 — 격자 속도·요금', () => {
    const r = PV.decide({ read: { kind: 'meeting' } });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400, '회의사진까지 서버를 거치면 격자가 통째로 느려집니다.');
  });

  await t.test('★ 판독 전 사진도 서버가 안 다룬다', () => {
    /* 판독 전에 민감으로 보면 회의사진 수백 장이 죄다 서버를 거친다. */
    assert.equal(PV.decide({ kind: 'doc' }).ok, false);
  });

  await t.test('★ 지워진 사진은 404', () => {
    assert.equal(PV.decide(null).status, 404);
  });
});

/* ══════ ⑤ 서버 — 요청 검사와 경로 ══════ */
test('서버 요청 검사', async (t) => {
  await t.test('★ 경로를 타고 오르지 못한다', () => {
    /* owner·id 는 창고 경로에 그대로 쓰인다 — 막지 않으면 남의 자리·바깥 자리를
       가리키게 만들 수 있다. */
    ['../other', 'a/b', 'a.b', 'x#y', 'p[0]', 'a$b', '', null].forEach(function (bad) {
      assert.equal(PV.validate({ owner: bad, year: '2026', id: 'p1' }).ok, false,
        'owner=' + JSON.stringify(bad) + ' 를 받아 줬습니다');
      assert.equal(PV.validate({ owner: 'me', year: '2026', id: bad }).ok, false,
        'id=' + JSON.stringify(bad) + ' 를 받아 줬습니다');
    });
  });

  await t.test('★ 연도는 네 자리만', () => {
    ['20260', '26', '../2026', 'abcd', ''].forEach(function (y) {
      assert.equal(PV.validate({ owner: 'me', year: y, id: 'p1' }).ok, false, 'year=' + y);
    });
    assert.equal(PV.validate({ owner: 'me', year: 2026, id: 'p1' }).year, '2026', '숫자 연도도 받아야 합니다');
  });

  await t.test('★ 창고 경로가 화면과 «똑같다»', () => {
    /* 어긋나면 서버가 없는 파일을 찾아 「원본이 없습니다」만 돌려준다.
       화면(js/pu-photo-store.js 의 filePath)을 실제로 돌려 견준다. */
    const S = loadStore();
    S.init({ db: fakeDb({}), uid: 'me' });
    const mine = S.filePath ? S.filePath('2026', 'p1', 'full', 'other') : null;
    const src = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
    const expected = mine || (function () {
      /* filePath 를 안 내보내면 원본 글자에서 규칙을 확인한다 */
      assert.match(src, /BUCKET_ROOT \+ '\/u\/' \+ who \+ '\/' \+ \(kind === 'thumb' \? 'thumbs' : 'blobs'\)/);
      return 'pu_photos/u/other/blobs/2026/p1.jpg';
    })();
    assert.equal(PV.storagePath('other', '2026', 'p1', 'full'), expected,
      '서버와 화면의 창고 경로가 다릅니다.');
  });

  await t.test('★ 민감 목록이 화면과 «같다»', () => {
    const src = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
    const m = src.match(/var SENSITIVE_KINDS = \{([^}]*)\}/);
    assert.ok(m, '화면 쪽 민감 목록을 찾지 못했습니다');
    const front = m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean).sort();
    assert.deepEqual(front, Object.keys(PV.SENSITIVE_KINDS).sort(),
      '두 벌이 되면 한쪽만 고쳐집니다 — 화면은 안 적는데 서버는 「민감 아니다」로 막습니다.');
  });
});

/* ══════ ⑥ 옛 사진 훑기 — 세고, 시켜야 지운다 ══════ */
test('옛 사진 훑기', async (t) => {
  const tree = {
    u: {
      a: {
        items: {
          2026: {
            p1: { read: { kind: 'contract' }, fullUrl: 'https://x' },   // 대상
            p2: { read: { kind: 'meeting' }, fullUrl: 'https://y' },    // 민감 아님
            p3: { read: { kind: 'timesheet' } },                        // 주소 없음
            p4: { kind: 'doc', fullUrl: 'https://z' }                   // 판독 전
          }
        }
      },
      b: { items: { 2025: { q1: { read: { kind: 'payslip' }, fullUrl: 'https://w' } } } }
    }
  };

  await t.test('★ 주소가 적힌 민감 서류만 찾는다', () => {
    const hits = PV.sweep(tree);
    assert.deepEqual(hits.map(function (h) { return h.id; }).sort(), ['p1', 'q1'],
      '찾은 것: ' + JSON.stringify(hits));
  });

  await t.test('★ fullUrl 만 지운다 — 미리보기는 남긴다', () => {
    const u = PV.clearPaths(PV.sweep(tree), 'puphotos');
    assert.deepEqual(Object.keys(u).sort(), [
      'puphotos/u/a/items/2026/p1/fullUrl',
      'puphotos/u/b/items/2025/q1/fullUrl'
    ]);
    Object.keys(u).forEach(function (k) {
      assert.equal(u[k], null);
      assert.doesNotMatch(k, /thumbUrl/, '미리보기까지 지우면 격자가 통째로 느려집니다.');
    });
  });

  await t.test('★ 빈 창고에서도 안 터진다', () => {
    assert.deepEqual(PV.sweep({}), []);
    assert.deepEqual(PV.sweep(null), []);
    assert.deepEqual(PV.clearPaths([], 'puphotos'), {});
  });
});

/* ══════ ⑦ 배선 ══════ */
test('배선', async (t) => {
  const html = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
  const idx = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

  await t.test('★ 사진첩이 로그인 증명을 저장 층에 넘긴다', () => {
    assert.match(html, /PuPhotoStore\.init\(\{[^}]*auth: firebase\.auth\(\)/,
      'auth 를 안 넘기면 «남의» 계약서가 「원본이 없습니다」로 보입니다.');
  });

  await t.test('★ 서버가 «사진 창고»를 본다 — 기본 창고가 아니다', () => {
    assert.match(idx, /bucket\(PHOTO_BUCKET\)\.file\(PV\.storagePath/,
      '창고 이름을 안 적으면 엉뚱한 창고를 보고 「원본이 없습니다」만 돌려줍니다.');
    assert.match(idx, /const PHOTO_BUCKET = "pureun-erp-hrphotos"/);
    /* 이름이 두 곳에 적히면 한쪽만 고쳐진다 */
    assert.equal((idx.match(/"pureun-erp-hrphotos"/g) || []).length, 1,
      '창고 이름이 두 곳에 적혀 있습니다.');
  });

  await t.test('★ 훑기는 총괄관리자만', () => {
    const at = idx.indexOf('exports.photoSensitiveSweep');
    assert.ok(at > 0, 'photoSensitiveSweep 를 찾지 못했습니다');
    assert.match(idx.slice(at, at + 1200), /requirePhotoAdmin\(req\)/,
      '아무나 부르면 남의 계약서 주소를 통째로 지울 수 있습니다.');
  });

  await t.test('★ 훑기는 시키지 않으면 지우지 않는다 (기본은 세기만)', () => {
    const at = idx.indexOf('exports.photoSensitiveSweep');
    const fn = idx.slice(at, at + 2000);
    assert.match(fn, /mode !== "clear"/,
      '몇 장인지 모르고 지우면, 안 보이게 됐을 때 무엇이 얼마나 영향받았는지도 알 수 없습니다.');
  });

  await t.test('★ 보기 함수도 로그인을 확인한다', () => {
    const at = idx.indexOf('exports.photoView');
    assert.ok(at > 0);
    assert.match(idx.slice(at, at + 900), /requireReader\(req\)/,
      '확인이 없으면 우리 서버가 남의 계약서를 나눠 주는 창구가 됩니다.');
  });
});
