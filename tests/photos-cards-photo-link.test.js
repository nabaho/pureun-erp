'use strict';
/* 명함 ↔ 사진첩 원본을 잇는 고리 — 대표 검토 2026-08-27

   ■ 무엇이 반쪽이었나
   사진첩은 사람별·해별로 갈려 있어 **해·번호·주인 셋이 다 있어야** 사진을 찾는다.
   그런데 명함을 보낼 때는 **번호 하나만** 넘겼다. 넘길 값(year·owner)은 바로 그 줄
   위에서 원판을 받을 때 쓰고 있었는데도 안 넘겼다.
   그래서 기업정보함은 사진 번호를 적어 두고도 **원본을 열 수 없었고**, 명함 상세에는
   사진첩으로 건너가는 길이 아예 없었다.

   ⚠ 기업 상세(coInfo) 쪽은 처음부터 셋을 다 넘기고 있었다 — 칸마다 「📷 원본 보기」가
     되는 까닭이 그것이다. **같은 다리에서 한쪽만 반쪽이었다.**

   ■ 이 검사가 지키는 것
     ① 사진첩이 셋을 다 넘긴다
     ② 등록 층이 새로 만들 때도, 빈 칸을 채울 때도 **셋을 한 벌로** 적는다
     ③ 명함 상세가 그 셋으로 사진첩을 연다 — 하나라도 없으면 단추를 안 낸다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');

/* ══════ ① 사진첩이 셋을 다 넘긴다 ══════ */

test('★ 사진첩이 명함을 보낼 때 해·번호·주인을 «셋 다» 넘긴다', () => {
  const fn = cutFn(photos, 'function sendCards(');
  assert.ok(fn, 'sendCards 를 찾지 못했습니다');
  const call = fn.slice(fn.indexOf('PuDocFile.sendToCards('));
  assert.match(call, /photoId: id,/, '★ 사진 번호를 안 넘깁니다');
  assert.match(call, /photoYear:/, '★ 해를 안 넘기면 기업정보함이 원본을 못 엽니다');
  assert.match(call, /photoOwner:/, '★ 주인을 안 넘기면 남의 사진은 영영 못 엽니다');
});

test('넘기는 해·주인이 «원판을 받을 때 쓴 그 값»이다 — 딴 값이면 엉뚱한 자리를 가리킨다', () => {
  const fn = cutFn(photos, 'function sendCards(');
  /* 위에서 loadFull(year, id, owner) 로 원판을 받는다. 같은 짝이라야 한다. */
  assert.match(fn, /PuPhotoStore\.loadFull\(year, id, owner\)/);
  const call = fn.slice(fn.indexOf('PuDocFile.sendToCards('));
  assert.match(call, /photoYear: String\(year \|\| ''\)/);
  assert.match(call, /photoOwner: owner \|\| ''/);
});

/* ══════ ② 등록 층이 셋을 한 벌로 적는다 ══════ */

test('★ 새 명함을 만들 때 셋을 한 벌로 적는다', () => {
  const fn = cutFn(docFile, 'function createOne(');
  assert.ok(fn, 'createOne 을 찾지 못했습니다');
  ['photoId', 'photoYear', 'photoOwner'].forEach(function (k) {
    assert.ok(fn.indexOf(k + ':') > 0, '★ ' + k + ' 를 안 적습니다 — 고리가 반쪽이 됩니다');
  });
});

test('★ 이미 있는 명함에 사진을 채울 때도 셋을 한 벌로 적는다 — 여기만 빠지기 쉽다', () => {
  const fn = cutFn(docFile, 'function fillOne(');
  assert.ok(fn, 'fillOne 을 찾지 못했습니다');
  ['photoId', 'photoYear', 'photoOwner'].forEach(function (k) {
    assert.ok(fn.indexOf("'/" + k + "'") > 0,
      '★ ' + k + ' 를 안 적습니다 — 「이미 있던 명함」만 원본이 안 열립니다');
  });
});

/* 실제로 돌려 본다 — 「낱말이 있나」로는 무엇이 적히는지 못 잡는다 */
function runCreate(o) {
  const written = {};
  const ctx = {
    Object, String, Date, Promise, console: { warn() {} },
    CARDS_ROOT: 'pu_cards', BYKEY: 'bykey',
    deps: { db: { ref: function (p) {
      return p === undefined
        ? { update: function (u) { Object.assign(written, u); return Promise.resolve(); } }
        : { push: function () { return { key: 'NEW1' }; } };
    } } },
    putPhoto: function () { return Promise.resolve(true); },
    idxOf: function () { return {}; },
    byKeyName: function () { return ''; },
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(docFile, 'function createOne('), ctx);
  return ctx.createOne(o, {}, 'card').then(function () { return written; });
}

test('★ 실제로 적어 보면 세 칸이 다 들어간다', async () => {
  const w = await runCreate({ photoId: 'p9', photoYear: '2026', photoOwner: 'uid-A' });
  const rec = w['pu_cards/items/NEW1'];
  assert.ok(rec, '레코드를 안 썼습니다');
  assert.equal(rec.photoId, 'p9');
  assert.equal(rec.photoYear, '2026', '★ 해가 비면 원본을 못 엽니다');
  assert.equal(rec.photoOwner, 'uid-A', '★ 주인이 비면 남의 사진을 못 엽니다');
  assert.equal(rec.source, 'pu-photos', '어디서 왔는지도 남아야 한다');
});

test('사진첩에서 온 것이 아니면 빈 값이라도 꼴이 흐트러지지 않는다', async () => {
  const w = await runCreate({});
  const rec = w['pu_cards/items/NEW1'];
  assert.equal(rec.photoId, '');
  assert.equal(rec.photoYear, '');
  assert.equal(rec.photoOwner, '');
});

/* ══════ ③ 명함 상세가 그 셋으로 사진첩을 연다 ══════ */

function btn(it) {
  const ctx = { esc: function (s) { return String(s == null ? '' : s); } };
  vm.createContext(ctx);
  vm.runInContext(cutFn(cards, 'function photoBackBtn('), ctx);
  return ctx.photoBackBtn(it);
}

test('★ 셋이 다 있으면 「사진첩 원본」 단추가 나온다', () => {
  const h = btn({ photoId: 'p9', photoYear: '2026', photoOwner: 'uid-A' });
  assert.ok(h, '★ 명함에서 원본으로 건너갈 길이 없습니다');
  assert.match(h, /openCoDoc\('2026','p9','uid-A'\)/,
    '★ 기업 상세가 쓰는 그 길(openCoDoc)을 그대로 써야 합니다 — 두 벌이면 한쪽만 고쳐집니다');
});

test('★ 하나라도 없으면 단추를 «안» 낸다 — 눌러도 안 열리면 고장으로 읽힌다', () => {
  assert.equal(btn({ photoId: 'p9', photoYear: '2026' }), '', '주인이 없는데 냈습니다');
  assert.equal(btn({ photoId: 'p9', photoOwner: 'u' }), '', '해가 없는데 냈습니다');
  assert.equal(btn({ photoYear: '2026', photoOwner: 'u' }), '', '번호가 없는데 냈습니다');
  assert.equal(btn({}), '', '옛 명함(고리 없음)에 냈습니다');
  assert.equal(btn(null), '', '★ 빈 것에서 넘어지면 명함 창이 통째로 안 열립니다');
});

test('★ 화면 셋이 모두 그 단추를 부른다 — 한 곳만 빠지면 「어떤 건 되고 어떤 건 안 된다」', () => {
  const n = (cards.match(/photoBackBtn\(it\)/g) || []).length;
  assert.ok(n >= 3, '★ 부르는 곳이 ' + n + '곳입니다 (PC 상세·폰 명함·폰 사업자등록증)');
  assert.ok(/function openCoDoc\(/.test(cards), 'openCoDoc 이 없습니다');
});

test('여는 길은 사진첩이 실제로 받는 꼴이다 — 주소만 만들고 안 받으면 빈 화면이다', () => {
  const fn = cutFn(cards, 'function openCoDoc(');
  assert.match(fn, /'photo=' \+ encodeURIComponent\(id\)/);
  assert.match(fn, /&year=/);
  assert.match(fn, /&owner=/);
  /* 사진첩 쪽에서 그 셋을 실제로 읽는지 — 주소에서 뽑는 자리(readAskedPhoto)와
     그것으로 화면을 맞추는 자리(goPhotoIfAsked)를 나눠 본다. */
  const read = cutFn(photos, 'function readAskedPhoto(');
  assert.ok(read, '주소에서 뽑는 자리를 찾지 못했습니다');
  ['photo', 'year', 'owner'].forEach(function (k) {
    assert.ok(read.indexOf("'" + k + "'") > 0, '★ 사진첩이 ' + k + ' 를 안 읽습니다');
  });
  const go = cutFn(photos, 'function goPhotoIfAsked(');
  assert.ok(go, '사진첩이 받는 자리를 찾지 못했습니다');
  assert.match(go, /gridYear = String\(_askedPhoto\.year\)/, '★ 해를 안 맞추면 그 해 목록이 안 옵니다');
  assert.match(go, /_askedPhoto\.owner/, '★ 주인을 안 맞추면 남이 올린 서류는 아무리 찾아도 없습니다');
});
