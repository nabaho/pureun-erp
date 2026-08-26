/* 사진첩 저장 층을 «다른 앱»이 세울 때 열쇠를 넘기는가 (2026-08-26)

   ── 무슨 일이 있었나 ──
   2026-08-17 보안 조치로 계약서·근태기록부·급여명세는 사진 정보에 **원본 주소를
   안 남긴다.** 그 서류를 보려면 서버(photoView)에 로그인 증명을 내밀어야 한다.
   사진첩은 그 열쇠(auth)를 저장 층에 넘겼는데, **푸른이알피·근로복지기금·
   정부사업일정 셋은 안 넘겼다.** 그래서 계약서 21장·근태기록부 10장이
   그 세 앱에서 한 장도 안 열렸다 — 그런데 **오류도 안 났다.** 저장 층이
   조용히 빈 글자를 돌려주므로, 화면에는 「불러오는 중…」이 영영 떠 있었다.

   ── 이 검사가 지키는 것 ──
   ① 저장 층 자체 : 열쇠가 없으면 민감 서류가 «빈손»이 된다(그 사실을 못 박는다).
   ② 부르는 쪽   : 사진을 읽는 앱은 모두 열쇠를 넘긴다.
   ⚠ ②를 글자 대조로만 두지 않는다 — init 을 «실제로» 불러 넘어온 값을 본다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'pu-photo-store.js'), 'utf8');

/* ── ① 저장 층 — 열쇠가 없으면 민감 서류는 빈손이다 ── */

function loadStore(over) {
  const ctx = Object.assign({
    console, Promise, Object, Array, JSON, String, Number, Math, Date, Set, Map,
    RegExp, Error, isFinite, parseInt, parseFloat, setTimeout, clearTimeout
  }, over || {});
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(STORE, ctx);
  return ctx;
}

/* 창고 방식으로 담긴 «계약서» 한 장 — 민감 서류라 fullUrl 이 없다 */
const TREE = {
  puphotos: {
    u: {
      U1: {
        items: { 2026: { p1: { loc: 'storage', thumbUrl: 'https://x/t.jpg', read: { kind: 'contract' } } } },
        blobs: {}, thumbs: {}
      }
    }
  }
};

function fakeDb(tree) {
  return {
    ref(p) {
      return {
        once() {
          const v = String(p).split('/').reduce(function (a, k) { return (a == null ? null : a[k]); }, tree);
          return Promise.resolve({ val: function () { return v === undefined ? null : v; } });
        },
        update() { return Promise.resolve(); }
      };
    }
  };
}

/* 창고는 「자기 사진만」이라, 주인이 아니면 막힌다. 서버는 잘 돈다고 둔다. */
function rig() {
  let asked = 0;
  const fetch = function () {
    asked++;
    return Promise.resolve({
      ok: true, status: 200,
      json: function () { return Promise.resolve({ ok: true, dataUrl: 'data:image/jpeg;base64,AAAA' }); }
    });
  };
  return { fetch: fetch, asked: function () { return asked; } };
}

test('★ 열쇠가 없으면 계약서 원본이 «빈손»으로 돌아온다 — 오류조차 안 난다', async () => {
  const r = rig();
  const ctx = loadStore({ fetch: r.fetch });
  ctx.PuPhotoStore.init({ db: fakeDb(TREE), uid: 'U1' });      // 열쇠 없음 (옛 푸른이알피)
  const got = await ctx.PuPhotoStore.loadFull('2026', 'p1');
  assert.equal(got, '', '이 검사의 전제가 깨졌습니다 — 열쇠 없이도 열린다면 아래 검사들은 뜻이 없습니다');
  assert.equal(r.asked(), 0, '열쇠도 없이 서버를 불렀습니다');
});

test('★ 열쇠를 넘기면 서버를 거쳐 계약서가 열린다', async () => {
  const r = rig();
  const ctx = loadStore({ fetch: r.fetch });
  ctx.PuPhotoStore.init({
    db: fakeDb(TREE), uid: 'U1',
    auth: { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } }
  });
  const got = await ctx.PuPhotoStore.loadFull('2026', 'p1');
  assert.match(got, /^data:image\//, '열쇠를 넘겼는데도 계약서가 안 열립니다');
  assert.equal(r.asked(), 1, '서버를 안 불렀습니다 — 민감 서류는 이 길밖에 없습니다');
});

test('민감 서류 목록은 서버 쪽과 같아야 한다', () => {
  const srv = fs.readFileSync(path.join(ROOT, 'functions', 'photo-view.js'), 'utf8');
  const ctx = loadStore({});
  const mine = Object.keys(ctx.PuPhotoStore.SENSITIVE_KINDS).sort();
  const m = srv.match(/SENSITIVE_KINDS\s*=\s*\{([^}]*)\}/);
  assert.ok(m, '서버 쪽 민감 서류 목록을 못 찾았습니다');
  const theirs = (m[1].match(/[a-z]+\s*:/g) || []).map(function (s) { return s.replace(/\s*:/, ''); }).sort();
  assert.deepEqual(mine, theirs,
    '화면과 서버의 민감 서류 목록이 어긋났습니다 — 한쪽만 민감하다고 여기면 그 서류가 통째로 안 열립니다');
});

/* ── ② 부르는 쪽 — 사진을 읽는 앱은 모두 열쇠를 넘긴다 ── */

/* 넘긴 «칸 이름»만 고른다 — 값은 앱마다 다른 이름이라 볼 것이 없다.
   ⚠ 겹칸({...}) 안쪽은 세지 않는다. 겉칸에 안 넘겼는데 안쪽에 auth 라는 말이
     들어 있으면 넘긴 줄로 잘못 읽는다. */
function topKeys(lit) {
  const keys = [];
  let depth = 0;
  for (let i = 0; i < lit.length; i++) {
    const c = lit[i];
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (c === "'" || c === '"') {                       // 글자 덩어리는 건너뛴다
      const q = c; i++;
      while (i < lit.length && lit[i] !== q) { if (lit[i] === '\\') i++; i++; }
      continue;
    }
    if (depth !== 1) continue;
    const m2 = /^([A-Za-z_$][\w$]*)\s*:/.exec(lit.slice(i));
    if (m2 && /[{,\s]/.test(lit[i - 1] || '{')) { keys.push(m2[1]); i += m2[0].length - 1; }
  }
  return keys;
}

/* 앱 파일에서 init 을 부르는 대목을 그대로 떠서 **무엇을 넘겼는지** 본다. */
function initArgsOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const calls = [];
  const re = /PuPhotoStore\.init\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    /* 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 벤다 — 길이를 못 박지 않는다 */
    let i = m.index + m[0].length - 1, depth = 0, end = -1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
    }
    assert.ok(end > 0, file + ' 의 init 인자를 못 읽었습니다');
    const lit = src.slice(m.index + m[0].length - 1, end + 1);
    calls.push({ keys: topKeys(lit), raw: lit });
  }
  return calls;
}

/* 사진을 «읽는» 앱들. 여기에 앱을 더할 때는 열쇠도 같이 넘겨야 한다. */
const READERS = ['pu-photos.html', 'pu-erp.html', 'fund.html', 'gov-consulting.html'];

READERS.forEach(function (file) {
  test('★ ' + file + ' 는 저장 층에 열쇠를 넘긴다', () => {
    const calls = initArgsOf(file);
    assert.ok(calls.length, file + ' 에서 저장 층을 세우는 곳을 못 찾았습니다');
    calls.forEach(function (c, i) {
      assert.ok(c.keys.indexOf('auth') >= 0,
        file + ' 의 ' + (i + 1) + '번째 연결이 열쇠(auth)를 안 넘깁니다 — ' +
        '계약서·근태기록부가 오류도 없이 빈손이 됩니다: ' + c.raw.replace(/\s+/g, ' ').slice(0, 90));
    });
  });
});

test('★ 정부사업일정은 저장 층을 «한 곳»에서만 세운다', () => {
  /* 전에는 네 군데에서 제각각 세웠고 그 가운데 셋이 열쇠를 빠뜨렸다.
     자리가 여럿이면 다음에 하나 더 늘 때 또 빠진다. */
  const calls = initArgsOf('gov-consulting.html');
  assert.equal(calls.length, 1,
    '저장 층을 세우는 자리가 ' + calls.length + '곳입니다 — photoStoreOn() 하나로 모아야 또 빠뜨리지 않습니다');
  const gov = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
  assert.match(gov, /function photoStoreOn\(\)/, '모아 세우는 함수가 없습니다');
  const uses = (gov.match(/photoStoreOn\(\)/g) || []).length;
  assert.ok(uses >= 5, '모아 세우는 함수를 쓰는 곳이 ' + uses + '군데뿐입니다 — 옛 자리가 남아 있습니다');
});

test('★ 푸른이알피는 원본이 «빈손»으로 와도 그 사실을 말한다', () => {
  /* 빈손으로 «성공»할 수 있다. 아무 말도 안 하면 「불러오는 중…」이 영영 떠 있어
     느린 것인지 고장인지 알 수가 없다 — 실제로 그렇게 떠 있었다. */
  const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
  const from = erp.indexOf('function ContractDocViewModal(');
  const to = erp.indexOf('function seg(', from);
  assert.ok(from > 0 && to > from, '계약서 보기 창을 못 찾았습니다');
  const body = erp.slice(from, to);
  assert.match(body, /if\s*\(u\)\s*setImgUrl\(u\);?\s*[\r\n]+\s*else\s+setImgErr\(/,
    '원본이 빈손일 때 아무 말도 안 합니다 — 「불러오는 중…」이 영영 떠 있게 됩니다');
});
