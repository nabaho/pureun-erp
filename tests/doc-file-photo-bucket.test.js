/* 사진첩 → 기업정보함으로 보낸 «원본»은 창고에 담는다 (2026-08-26)

   ── 무슨 일이 있었나 ──
   기업정보함은 2026-08-09 에 원본을 창고(Storage)로 옮겼다 — 명함 4,400장 약 1.7GB 가
   실시간DB 무료 한도(1GB)를 이것 하나로 넘겨 데이터베이스가 멈출 뻔했기 때문이다.
   그런데 **사진첩을 거쳐 들어오는 길만 옛 방식**으로 남아, 한 장에 약 700KB 씩
   실시간DB 로 도로 쌓이고 있었다. 2026-08-26 실측 — pucards/photos 에 417장 · 약 284MB.

   ── 이 검사가 지키는 것 ──
   ① 창고에 올라갔으면 실시간DB 에는 **안 담는다**(그래야 줄어든다).
   ② 창고가 막히면 **옛 자리에 담는다** — 사진을 잃느니 자리를 먹는 것이 낫다.
   ③ 창고 이름을 여기서 정한다 — 부르는 화면마다 기본 창고가 달라
      firebase.storage() 를 그냥 쓰면 엉뚱한 창고에 올라간다.
   ④ 레코드·검색목록은 어느 쪽이든 **한 번의 update** 로 쓴다(2026-07 실데이터 사고). */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');

/* 실시간DB·창고를 가짜로 두고 **실제로 돌린다** */
function rig(o) {
  o = o || {};
  const put = [];        // 창고에 올린 것
  const updates = [];    // 실시간DB 에 쓴 것
  const bucketOf = [];   // 어느 창고를 골랐나
  const storage = {
    ref: function (p) {
      return {
        putString: function (data, kind) {
          put.push({ path: p, kind: kind, len: String(data).length });
          return o.putFails ? Promise.reject(new Error('막힘')) : Promise.resolve();
        }
      };
    }
  };
  /* 이미 있는 명함을 흉내 낼 때는 **기업정보함이 실제로 읽는 세 자리**를 채운다:
     번호 열쇠(bykey) → 검색목록(idx) → 레코드(items). 하나라도 어긋나면
     「없는 명함」으로 읽혀 이 검사가 엉뚱한 길을 본다. */
  const tree = {};
  if (o.existing) {
    tree['pucards/config/bykeyAt'] = 1750000000000;
    tree['pucards/bykey/c01011112222'] = 'OLD1';
    tree['pucards/idx/OLD1'] = { k: 'card', m: '010-1111-2222', n: '홍길동' };
    tree['pucards/items/OLD1'] = o.existing;
  }
  const db = {
    ref: function (p) {
      return {
        push: function () { return { key: 'NEWID' }; },
        once: function () {
          const v = Object.prototype.hasOwnProperty.call(tree, p) ? tree[p] : null;
          return Promise.resolve({ val: function () { return v; } });
        },
        update: function (u) { updates.push(u); return Promise.resolve(); }
      };
    }
  };
  const ctx = {
    console, Promise, Object, Array, JSON, String, Number, Math, Date, RegExp, Error,
    setTimeout, clearTimeout,
    firebase: o.noFirebase ? undefined : {
      app: function () {
        return { storage: function (b) { bucketOf.push(b); if (o.noBucket) throw new Error('창고 없음'); return storage; } };
      }
    }
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  /* 판독 층은 **진짜를 싣는다** — 판독 결과 → 기업정보함 칸 이름 변환표가 거기 있다.
     가짜로 흉내 내면 변환표가 바뀌어도 이 검사가 모른다. */
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8'), ctx);
  vm.runInContext(SRC, ctx);
  ctx.PuDocFile.init({ db: db });
  return { F: ctx.PuDocFile, put: put, updates: updates, bucketOf: bucketOf };
}

const CARD = {
  kind: 'card', byName: '권형하', photoId: 'ph1', takenAt: 1750000000000,
  thumb: 'data:image/jpeg;base64,THUMB',
  full: 'data:image/jpeg;base64,' + 'F'.repeat(900),
  fields: { name: '홍길동', company: '가나상사', mobile: '010-1111-2222' }
};

function photoKeys(u) {
  return Object.keys(u).filter(function (k) { return /^pucards\/photos\//.test(k); });
}

test('★ 새 명함 — 원본은 창고로, 실시간DB 에는 안 담는다', async () => {
  const r = rig();
  const out = await r.F.sendToCards(CARD);
  assert.ok(out && out.created, '새로 안 넣었습니다: ' + JSON.stringify(out));
  assert.equal(r.put.length >= 1, true, '★ 창고에 안 올렸습니다');
  assert.equal(r.put[0].path, 'pucards/photos/NEWID', '엉뚱한 자리에 올렸습니다: ' + r.put[0].path);
  assert.equal(r.put[0].kind, 'data_url');
  assert.equal(r.updates.length, 1, '★ 한 번의 update 로 써야 합니다(' + r.updates.length + '번)');
  assert.deepEqual(photoKeys(r.updates[0]), [],
    '★ 창고에 올려 놓고 실시간DB 에도 담았습니다 — 이러면 하나도 안 줄어듭니다');
  /* 레코드·검색목록은 그대로 있어야 한다 */
  assert.ok(r.updates[0]['pucards/items/NEWID'], '명함 레코드가 없습니다');
  assert.ok(r.updates[0]['pucards/idx/NEWID'], '검색목록이 없습니다');
});

test('★ 창고가 막히면 옛 자리에 담는다 — 사진을 잃느니 자리를 먹는 것이 낫다', async () => {
  const r = rig({ putFails: true });
  const out = await r.F.sendToCards(CARD);
  assert.ok(out && out.created, '창고가 막혔다고 명함 등록을 통째로 물렀습니다');
  assert.deepEqual(photoKeys(r.updates[0]), ['pucards/photos/NEWID'],
    '★ 창고도 막히고 옛 자리에도 안 담았습니다 — 사진이 사라집니다');
  assert.equal(r.updates[0]['pucards/photos/NEWID'], CARD.full);
});

test('창고 꾸러미가 아예 없어도 명함은 들어간다', async () => {
  const r = rig({ noFirebase: true });
  const out = await r.F.sendToCards(CARD);
  assert.ok(out && out.created);
  assert.deepEqual(photoKeys(r.updates[0]), ['pucards/photos/NEWID']);
});

test('창고를 못 열어도(규칙·미생성) 명함은 들어간다', async () => {
  const r = rig({ noBucket: true });
  const out = await r.F.sendToCards(CARD);
  assert.ok(out && out.created);
  assert.deepEqual(photoKeys(r.updates[0]), ['pucards/photos/NEWID']);
});

test('★ 기업정보함 창고를 콕 집어 고른다 — 화면마다 기본 창고가 다르다', async () => {
  /* 사진첩의 기본 창고는 pureun-erp-hrphotos 다. 그냥 firebase.storage() 를 쓰면
     명함 원본이 사진 창고에 올라가고, 기업정보함은 그것을 영영 못 읽는다. */
  const r = rig();
  await r.F.sendToCards(CARD);
  assert.ok(r.bucketOf.length, '★ 창고를 골라 열지 않았습니다 — 기본 창고로 갑니다');
  assert.match(r.bucketOf[0], /pureun-erp-photos/,
    '★ 기업정보함 창고가 아닙니다: ' + r.bucketOf[0]);
  const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
  const m = cards.match(/storageBucket:\s*'([^']+)'/);
  assert.ok(m, '기업정보함 화면의 창고 설정을 못 찾았습니다');
  assert.equal(r.bucketOf[0].replace(/^gs:\/\//, ''), m[1],
    '★ 기업정보함 화면이 보는 창고와 다릅니다 — 올려도 그 화면에서는 안 보입니다');
});

test('뒷면도 창고로 — 앞면만 옮기면 뒷면이 계속 쌓인다', async () => {
  const r = rig();
  await r.F.sendToCards(Object.assign({}, CARD, {
    thumb2: 'data:image/jpeg;base64,T2', full2: 'data:image/jpeg;base64,BACK'
  }));
  const paths = r.put.map(function (p) { return p.path; });
  assert.ok(paths.indexOf('pucards/photos/NEWID_b') >= 0, '뒷면을 창고에 안 올렸습니다: ' + paths.join(', '));
  assert.deepEqual(photoKeys(r.updates[0]), []);
});

test('★ 이미 있는 명함에 첫 사진을 채울 때도 창고로 간다', async () => {
  /* 이 길이 빠지면 「빈 칸 채우기」로 들어오는 사진만 실시간DB 에 계속 쌓인다. */
  const r = rig({ existing: { id: 'OLD1', kind: 'card', name: '홍길동', thumb: '' } });
  const out = await r.F.sendToCards(CARD);
  assert.equal(out.created, false, '이미 있는 명함으로 안 봤습니다');
  assert.ok(out.filled.indexOf('사진') >= 0, '사진을 안 채웠습니다: ' + out.filled.join(','));
  assert.equal(r.put.length, 1, '★ 창고에 안 올렸습니다');
  assert.equal(r.put[0].path, 'pucards/photos/OLD1');
  assert.deepEqual(photoKeys(r.updates[0]), [],
    '★ 창고에 올려 놓고 실시간DB 에도 담았습니다');
});

test('사진이 이미 있는 명함이면 원본을 덮지 않는다 — 창고도 안 건드린다', async () => {
  const r = rig({ existing: { id: 'OLD1', kind: 'card', name: '홍길동', thumb: 'data:image/jpeg;base64,OLD' } });
  await r.F.sendToCards(CARD);
  assert.equal(r.put.length, 0, '원래 사진이 있는데 새 사진을 올렸습니다 — 원본이 더 나을 수 있습니다');
});

test('★ 판독기를 싣는 화면들의 ?v= 를 함께 올렸다', () => {
  /* .js 를 고치고 ?v= 를 안 올리면 브라우저가 옛 파일을 계속 쓴다 —
     고친 것이 통째로 묻힌다(다른 화면에서 실제로 당했다). */
  const seen = fs.readdirSync(R).filter(function (f) { return /\.html$/.test(f); })
    .map(function (f) { return { f: f, v: (fs.readFileSync(path.join(R, f), 'utf8')
      .match(/js\/pu-doc-file\.js\?v=(\d+)/) || [])[1] }; })
    .filter(function (x) { return x.v; });
  assert.ok(seen.length >= 2, '등록 층을 싣는 화면을 ' + seen.length + '개만 찾았습니다');
  seen.forEach(function (x) {
    assert.equal(x.v, seen[0].v,
      '★ 화면마다 ?v= 가 다릅니다(' + seen.map(function (s) { return s.f + '=' + s.v; }).join(', ') + ')');
  });
});
