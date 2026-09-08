/* 번호 한 칸으로 찾기 (pucards/bykey)
   사진첩이 명함 한 장마다 검색목록 6천 줄을 통째로 내려받던 것을 없앤 층.
   지키는 것:
     1. 자리가 채워졌으면 **검색목록 전체를 읽지 않는다** (이게 전부의 이유다)
     2. 아직 안 채워졌으면 옛 방식으로 훑는다 (없다고 답해 또 만들면 안 된다)
     3. 찾아간 명함의 번호를 **다시 맞춰 본다** (옛 열쇠로 남의 명함에 붙지 않게) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(file, sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  return sandbox;
}

/* db 흉내 — 어느 경로를 **읽었는지**까지 기록한다. 이 층의 값은 '무엇을 안 읽는가'다. */
function fakeDb(tree) {
  const reads = [], written = {};
  function at(p) {
    return p.split('/').reduce(function (o, k) {
      return (o && typeof o === 'object') ? o[k] : undefined;
    }, tree);
  }
  const db = {
    reads: reads, written: written,
    ref: function (p) {
      if (p === undefined) {
        return { update: function (u) { Object.assign(written, u); return Promise.resolve(); } };
      }
      return {
        once: function () { reads.push(p); return Promise.resolve({ val: function () { return at(p); } }); },
        push: function () { return { key: 'newid1' }; },
        update: function (u) { Object.assign(written, u); return Promise.resolve(); }
      };
    }
  };
  return db;
}

function layer(tree) {
  const sandbox = { crypto: globalThis.crypto, TextEncoder, Buffer, console };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  load('js/pu-lockkey.js', sandbox);
  load('js/pu-doc-read.js', sandbox);
  load('js/pu-doc-file.js', sandbox);
  const db = fakeDb(tree);
  sandbox.PuDocFile.init({ db: db });
  return { F: sandbox.PuDocFile, db: db };
}

/* 검사마다 **새로 만든다.** 하나를 돌려쓰면 앞 검사가 고친 값이 뒤 검사로 새어
   'm 을 바꾸는' 검사 뒤의 검사들이 통째로 어긋난다(실제로 그렇게 한 번 속았다). */
function tree(extra) {
  return Object.assign({
    pucards: {
      config: { bykeyAt: 1700000000000 },
      bykey: { c01012000003: 'card1' },
      idx: { card1: { n: '홍길동', c: '가나상사', m: '010-1200-0003', k: 'card' } },
      items: { card1: { id: 'card1', kind: 'card', name: '홍길동', mobile: '010-1200-0003' } }
    }
  }, extra || {});
}

test('열쇠 자리가 채워졌으면 검색목록 전체를 읽지 않는다', async () => {
  const { F, db } = layer(tree());
  const hit = await F.findExisting('card', { mobile: '01012000003' });
  assert.equal(hit && hit.id, 'card1');
  assert.ok(!db.reads.includes('pucards/idx'),
    '검색목록을 통째로 읽었다 — 이 층이 있는 이유가 없어진다: ' + db.reads.join(', '));
});

test('열쇠 자리가 아직 안 채워졌으면 옛 방식으로 훑는다', async () => {
  const t = tree(); delete t.pucards.config.bykeyAt;
  const { F, db } = layer(t);
  const hit = await F.findExisting('card', { mobile: '01012000003' });
  assert.equal(hit && hit.id, 'card1', '못 찾으면 이미 있는 사람을 또 만든다');
  assert.ok(db.reads.includes('pucards/idx'), '옛 방식으로 훑어야 한다');
});

test('번호가 바뀐 명함의 옛 열쇠 — 못 찾은 것으로 친다 (남의 명함에 붙지 않게)', async () => {
  const t = tree();
  t.pucards.idx.card1.m = '010-9999-8888';       /* 명함은 새 번호로 바뀌었다 */
  const { F } = layer(t);
  const hit = await F.findExisting('card', { mobile: '01012000003' });
  assert.equal(hit, null);
});

test('지워진 명함의 옛 열쇠 — 못 찾은 것으로 친다', async () => {
  const t = tree(); delete t.pucards.idx.card1;
  const { F } = layer(t);
  assert.equal(await F.findExisting('card', { mobile: '01012000003' }), null);
});

test('종류가 다르면 다른 물건이다 — 사업자번호와 전화번호가 같아도', async () => {
  const t = tree();
  t.pucards.bykey.b1028024601 = 'card1';         /* 사업자번호 열쇠가 명함을 가리킨다 */
  const { F } = layer(t);
  assert.equal(await F.findExisting('bizreg', { bizno: '1028024601' }), null);
});

test('열쇠 이름 — 명함은 c, 사업자등록증은 b (열 자리끼리 한 칸을 다투지 않게)', () => {
  const { F } = layer(tree());
  assert.equal(F.byKeyName('card', { mobile: '010-1200-0003' }), 'c01012000003');
  assert.equal(F.byKeyName('bizreg', { bizno: '123-45-67890' }), 'b1234567890');
  assert.equal(F.byKeyName('card', { name: '홍길동' }), '', '번호가 없으면 열쇠도 없다');
});

test('새로 넣을 때 열쇠도 같이 쓴다 — 안 쓰면 다음에 또 새로 만든다', async () => {
  const t = tree(); t.pucards.bykey = {}; t.pucards.idx = {}; t.pucards.items = {};
  const { F, db } = layer(t);
  const res = await F.sendToCards({ kind: 'card', fields: { name: '김철수', mobile: '010-5555-6666' } });
  assert.equal(res.created, true);
  assert.equal(db.written['pucards/bykey/c01055556666'], 'newid1');
  assert.ok(db.written['pucards/items/newid1']);
  assert.ok(db.written['pucards/idx/newid1']);
});

test('이미 있는 명함이면 빈 칸만 채우고 새로 만들지 않는다 (한 칸 찾기에서도)', async () => {
  const t = tree();
  const { F, db } = layer(t);
  const res = await F.sendToCards({
    kind: 'card', fields: { name: '홍길동', mobile: '010-1200-0003', email: 'hong@example.com' }
  });
  assert.equal(res.created, false);
  assert.equal(res.dup, true);
  assert.equal(db.written['pucards/items/card1/email'], 'hong@example.com');
  assert.ok(!db.written['pucards/items/newid1'], '새로 만들면 안 된다');
});

test('개인 폴더 지문이 먼저다 — 열쇠 자리를 보기도 전에 막는다', async () => {
  const sandbox = { crypto: globalThis.crypto, TextEncoder, Buffer, console };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  load('js/pu-lockkey.js', sandbox);
  const fp = await sandbox.PuLockKey.fingerprint('01012000003');
  const t = tree(); t.pucards.lockkeys = {}; t.pucards.lockkeys[fp] = 1;
  const { F, db } = layer(t);
  const res = await F.sendToCards({ kind: 'card', fields: { name: '홍길동', mobile: '010-1200-0003' } });
  assert.equal(res.blocked, true);
  assert.deepEqual(db.written, {});
  assert.ok(!db.reads.includes('pucards/idx'));
});
