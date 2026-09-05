'use strict';
/* 「자꾸 안 합쳐진다」 · 「0장 보냈습니다 / 1장은 못 보냈습니다」 (대표 보고 2026-09-05)

   ■ 뿌리가 하나다 — «화면의 것»으로 «사진의 자리»를 두드렸다
   사진첩은 사람별·해별로 갈려 있다. 그래서 photoOwner·photoYearOf 가 있고,
   그 주석에 「해도 주인도 «사진의 성질»이지 화면의 성질이 아니다」라고 못 박혀 있다.
   그런데 묶기·풀기·떼어내기·보내기가 gridYear·gridOwner 를 그대로 쓰고 있었다.
     · 「전체 근로자」로 보는 중이면 gridOwner 는 '__all__' 이다 —
       puphotos/u/__all__ 이라는 **없는 자리**를 두드려 조용히 아무 일도 안 난다.
       화면에서는 묶인 것처럼 보이다가 새로고침하면 도로 풀려 있다.
     · 여러 사람·여러 해에 걸친 것을 고르면 첫 장의 주인·화면의 해로 다 써서
       나머지는 엉뚱한 자리에 적힌다.

   ■ 그리고 «기준이 둘»이었다 — 세 번째다
   고르는 쪽은 canSend, 보내는 쪽은 canSendCards(= canSend && !뒷면).
   뒷면이 섞이면 여기서는 「보낼 것」으로 세고 보내는 함수는 아무 말 없이 되돌아간다 —
   그 장은 filed 도 filedError 도 없어 「사진을 열어 까닭을 봐 주세요」라고 해 놓고
   **열어도 까닭이 없다.**

   실행: node --test tests/photos-merge-send-place.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const app = stripComments(raw);

/* ══════ ① 자리를 «사진»에서 얻는다 ══════ */

test('★★ 묶기·풀기·떼어내기가 화면의 해·주인을 «안 쓴다»', () => {
  assert.ok(!/setDocs\(gridYear/.test(app),
    '★★ gridYear 로 쓰면 지난해 사진이나 「전체 근로자」로 보는 남의 사진이\n' +
    '  엉뚱한 해 자리에 적혀 영영 안 묶입니다.');
  assert.ok(!/setDocs\([^)]*gridOwner/.test(app),
    '★★ gridOwner 는 사람 아이디가 아닐 수 있습니다(__all__·__shared__).\n' +
    '  그대로 넘기면 puphotos/u/__all__ 이라는 «없는 자리»를 두드립니다 —\n' +
    '  조용히 아무 일도 안 나서, 새로고침하면 도로 풀려 있습니다.');
});

test('★★ 셋이 «한 함수»를 쓴다 — 세 벌로 두면 한 곳이 꼭 빠진다', () => {
  const n = (app.match(/setDocsByPhoto\(/g) || []).length;
  assert.ok(n >= 4,
    '★ 묶기·풀기·떼어내기 셋과 선언 하나 — 넷은 나와야 합니다(지금 ' + n + ').');
  assert.match(app, /function setDocsByPhoto\(/, '★ 공용 함수가 없습니다');
});

/* 순수 로직을 실제로 돌린다 — 글자만 보면 「부르긴 하는데 값이 틀린」 것을 못 잡는다 */
function loadPacker(place) {
  const ctx = { Object, Array, Promise, String, calls: [] };
  ctx.PuPhotoStore = {
    setDocs: function (year, ups, owner) {
      ctx.calls.push({ year: year, owner: owner === undefined ? '(내 자리)' : owner,
                       ids: ups.map(function (u) { return u.id; }) });
      return Promise.resolve();
    }
  };
  ctx.photoYearOf = function (id) { return place[id].year; };
  ctx.photoOwner = function (id) { return place[id].owner; };
  vm.createContext(ctx);
  vm.runInContext(cutFn(raw, 'function setDocsByPhoto(') +
    '\n;this.setDocsByPhoto = setDocsByPhoto;', ctx);
  return ctx;
}

test('★★ 해·주인이 다르면 «나눠서» 쓴다 — 한 번에 쓰면 한쪽이 엉뚱한 자리로 간다', async () => {
  const place = {
    a: { year: '2026', owner: 'u1' },
    b: { year: '2026', owner: 'u1' },
    c: { year: '2025', owner: 'u1' },   // 해가 다르다
    d: { year: '2026', owner: 'u2' }    // 주인이 다르다
  };
  const ctx = loadPacker(place);
  await ctx.setDocsByPhoto(['a', 'b', 'c', 'd'].map(function (id) { return { id: id, doc: {} }; }));
  const got = JSON.parse(JSON.stringify(ctx.calls));
  assert.equal(got.length, 3,
    '★★ 자리가 셋인데 ' + got.length + '번 썼습니다 — 한 번에 쓰면 나머지가 엉뚱한 자리로 갑니다.');
  const byKey = {};
  got.forEach(function (c) { byKey[c.year + '/' + c.owner] = c.ids.sort().join(','); });
  assert.equal(byKey['2026/u1'], 'a,b');
  assert.equal(byKey['2025/u1'], 'c');
  assert.equal(byKey['2026/u2'], 'd');
});

test('★ 주인을 모르면 «내 자리»로 — 없는 사람 자리를 만들지 않는다', async () => {
  const ctx = loadPacker({ a: { year: '2026', owner: '' } });
  await ctx.setDocsByPhoto([{ id: 'a', doc: {} }]);
  assert.equal(JSON.parse(JSON.stringify(ctx.calls))[0].owner, '(내 자리)',
    '★ 빈 주인을 그대로 넘기면 저장 층이 «없는 자리»를 만듭니다.');
});

test('★ 빈 목록이면 아무것도 안 쓴다 — 헛 요청은 요금만 든다', async () => {
  const ctx = loadPacker({});
  await ctx.setDocsByPhoto([]);
  assert.equal(ctx.calls.length, 0);
});

test('★ 보내기도 «사진의 해»로 부른다', () => {
  assert.ok(!/sendCards\([^)]*gridYear/.test(app),
    '★★ 화면의 해로 보내면 지난해 사진의 본문을 못 찾아 사진 없이 등록됩니다.');
  assert.match(app, /sendCards\(ids\[i\], photoYearOf\(ids\[i\]\), null\)/,
    '★ 모아 보내기가 사진의 해를 안 씁니다');
});

/* ══════ ② 기준이 하나다 ══════ */

test('★★ 고르는 쪽과 보내는 쪽이 «같은 함수»로 거른다 — 세 번째 같은 사고다', () => {
  const fn = stripComments(cutFn(raw, 'function sendSelected('));
  assert.match(fn, /canSendCards\(it, r\)/,
    '★★ canSend 로 고르면 «명함 뒷면»이 섞여 들어옵니다.\n' +
    '  보내는 함수는 canSendCards 로 막으므로 그 장은 아무 말 없이 되돌아가고,\n' +
    '  filed 도 filedError 도 안 남아 「열어서 까닭을 보라」고 해 놓고 까닭이 없습니다.\n' +
    '  (2026-08-05 지우기 · 2026-08-25 뒷면 단추 · 2026-08-28 공유 단추와 같은 모양)');
  assert.ok(!/return !!\(r && canSend\(r\)\);/.test(fn),
    '★★ 옛 기준(canSend)이 남아 있습니다.');
});

/* ══════ ③ 못 한 일을 «말한다» ══════ */

test('★★ 못 보낸 까닭을 알림에 적는다 — 알면서 「열어 보라」고만 하지 않는다', () => {
  const fn = stripComments(cutFn(raw, 'function sendSelected('));
  assert.match(fn, /filedError/,
    '★★ 까닭은 filedError 에 이미 담겨 있습니다. 그것을 안 보여 주면\n' +
    '  스무 장이 실패했을 때 스무 번 열어 봐야 합니다.');
  assert.ok(!/사진을 열어 까닭을 봐 주세요/.test(fn),
    '★ 「열어 보라」로 끝내는 옛 문구가 남아 있습니다.');
});

test('★ 까닭이 «없을» 때는 없다고 말한다 — 그런 자리는 고장이다', () => {
  const fn = stripComments(cutFn(raw, 'function sendSelected('));
  assert.match(fn, /까닭이 남지 않았습니다/,
    '★ 까닭이 안 남는 길이 생기면 사람은 열어 보고 아무것도 못 찾습니다 —\n' +
    '  그때는 «고장»이라고 말해야 알려 줄 수 있습니다.');
});

test('★ 같은 까닭은 한 번만 적는다 — 스무 장이 같은 이유면 스무 줄이 아니다', () => {
  const fn = stripComments(cutFn(raw, 'function sendSelected('));
  assert.match(fn, /why\.indexOf\(w\) === i/, '★ 같은 말을 여러 줄로 늘어놓습니다');
});

test('★★ 모아 둔 까닭이 «알림 글월에 실제로 들어간다»', () => {
  const fn = stripComments(cutFn(raw, 'function sendSelected('));
  /* ⚠ 「모으기만」 하고 안 보여 줘도 위 검사들은 다 통과한다(돌연변이가 살아남아
     드러났다) — 모은 것이 msg 로 «들어가는지»를 본다. */
  const i = fn.indexOf('msg += ');
  assert.ok(i > 0, '★ 알림 글월에 덧붙이는 자리가 없습니다');
  const tail = fn.slice(i, i + 400);
  assert.match(tail, /uniq/,
    '★★ 까닭을 모아 놓고 알림에는 안 싣습니다 — 「N장 못 보냈습니다」만 남아\n' +
    '  결국 스무 번 열어 봐야 하는 것은 그대로입니다.');
  assert.match(tail, /join\(/, '★ 여러 까닭을 한 글월로 잇지 않습니다');
});
