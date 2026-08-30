'use strict';
/* 📏 담는 크기와 «AI 에게 보내는 크기»는 다른 물건이다 (대표 결정 2026-08-30)

   대표 지적: 「근무표처럼 칸이 촘촘한 표가 흐리다」 → 서류 담는 크기 2000 → 2600px.

   ■ 여기서 조용히 새는 돈
   AI 는 그림을 **768px 조각으로 나눠 세어** 값을 매긴다. A4 를 2000px 로 보내면
   6조각, 2600px 로 보내면 12조각이다 — **판독 한 번 값이 두 배**가 된다.
   담는 크기를 올리면서 이 상한을 안 두면, 요금이 «조용히» 두 배가 된다.
   화면에는 아무 표시가 없고, 다음 달 청구서에서야 드러난다.

   ■ 그래서
   담는 것은 크게(사람이 확대해서 읽는다), **보내는 것은 2000px 로 끊는다**
   (지금까지 잘 읽히던 크기다 — 판독 품질은 그대로다).

   ■ 가장 위험한 자리
   ① **보내는 자리가 둘이다**(read · readPairsWith). 한쪽만 줄이면 그쪽만 싸진다.
   ② **못 줄인다고 판독이 막히면 안 된다** — 그때는 그대로 보낸다.
   ③ 작은 것을 **키우면 안 된다** — 없던 글자가 생기지 않고 값만 는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

const SEND = Number((/var AI_SEND_EDGE = (\d+);/.exec(js) || [])[1]);
const KEEP = Number((/maxEdge: (\d+), quality: [\d.]+, thumbEdge: \d+ \}\s*:/.exec(store) || [])[1]);

/* ══════ ① 두 크기의 관계 ══════ */

test('★★ 보내는 크기가 담는 크기보다 «작거나 같다» — 크면 상한을 놀리는 것이다', () => {
  assert.ok(SEND, '보낼 크기 상한(AI_SEND_EDGE)이 없습니다');
  assert.ok(KEEP, '담는 크기(uploadSpec)를 못 찾았습니다');
  assert.ok(SEND <= KEEP,
    '★ 보내는 크기 ' + SEND + 'px 이 담는 크기 ' + KEEP + 'px 보다 큽니다 — 없는 화소를 보냅니다');
});

test('★★ 담는 크기를 올려도 «보내는 크기는 안 따라 오른다» — 여기가 요금이다', () => {
  /* 검사고정-허용: **2000px** 은 값이 아니라 규칙이다. AI 가 768px 조각으로 세므로
     A4 기준 2000px 은 6조각, 이보다 크면 12조각이 되어 판독 한 번 값이 두 배가 된다.
     담는 크기(2600)와 «따로» 못박아야, 담는 크기를 올릴 때 요금이 조용히 안 따라온다. */
  assert.equal(SEND, 2000,
    '★★ 보낼 크기가 2000px 이 아닙니다 — 판독 요금이 조각 수만큼 곱절이 됩니다');
  assert.ok(KEEP > SEND,
    '★ 담는 크기가 보내는 크기와 같아졌습니다 — 그러면 이 상한을 둘 까닭이 없습니다');
});

/* ══════ ② 보내는 자리가 «모두» 지난다 ══════ */

test('★★ 사진을 보내는 «모든» 자리가 줄이기를 지난다 — 한쪽만 줄이면 그쪽만 싸진다', () => {
  const senders = ['function read(', 'function readPairsWith('];
  senders.forEach(function (f) {
    const fn = cutFn(js, f);
    assert.match(fn, /shrinkAllForAi\(/,
      '★★ ' + f + ' 가 줄이지 않고 그대로 보냅니다');
    /* 줄인 «뒤»에 실어야 한다 — 먼저 실으면 줄인 것이 안 쓰인다 */
    assert.ok(fn.indexOf('shrinkAllForAi(') < fn.indexOf('inline_data'),
      '★★ ' + f + ' 가 줄이기 «전»에 그림을 싣습니다');
  });
  /* 새 길이 생겨도 걸리게 — inline_data 를 만드는 자리는 이 둘뿐이어야 한다 */
  assert.equal((js.match(/inline_data:/g) || []).length, senders.length,
    '★★ 사진을 싣는 자리가 늘었습니다 — 새 자리도 줄이기를 지나야 합니다');
});

/* ══════ ③ 줄이는 셈 ══════ */

function shrinker(over) {
  const drawn = [];
  const ctx = Object.assign({
    Promise: Promise, String: String, Math: Math, Array: Array,
    AI_SEND_EDGE: 2000,
    document: { createElement: function () {
      const c = { width: 0, height: 0,
        getContext: function () { return {
          imageSmoothingQuality: '',
          drawImage: function (im, x, y, w, h) { drawn.push({ w: w, h: h }); }
        }; },
        toDataURL: function () { return 'data:image/jpeg;base64,SMALL'; } };
      return c;
    } },
    _drawn: drawn
  }, over || {});
  /* 가짜 Image — src 를 넣으면 그 크기로 온다 */
  ctx.Image = function () {
    const self = this;
    Object.defineProperty(self, 'src', { set: function (v) {
      const m = /(\d+)x(\d+)/.exec(String(v));
      if (String(v).indexOf('BAD') >= 0) return setTimeout(function(){ self.onerror(); }, 0);
      self.naturalWidth = m ? Number(m[1]) : 0;
      self.naturalHeight = m ? Number(m[2]) : 0;
      setTimeout(function () { self.onload(); }, 0);
    } });
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(js, 'function shrinkForAi('), ctx);
  vm.runInContext(cutFn(js, 'function shrinkAllForAi('), ctx);
  return ctx;
}

test('★★ 큰 것은 «긴 변 2000» 으로 줄인다 — 비를 지킨다', async () => {
  const c = shrinker();
  const out = await c.shrinkForAi('data:image/jpeg;2600x1838,AAA');
  assert.equal(out, 'data:image/jpeg;base64,SMALL');
  assert.equal(c._drawn.length, 1);
  assert.equal(c._drawn[0].w, 2000, '★ 긴 변이 2000 이 아닙니다');
  assert.equal(c._drawn[0].h, Math.round(1838 * (2000 / 2600)),
    '★★ 비가 어긋나면 서류가 눌려 글자가 안 읽힙니다');
});

test('★★ 이미 작은 것은 «그대로 보낸다» — 키워 봐야 값만 는다', async () => {
  const c = shrinker();
  const src = 'data:image/jpeg;1200x900,AAA';
  assert.equal(await c.shrinkForAi(src), src);
  assert.equal(c._drawn.length, 0, '★★ 작은 것을 키웠습니다');
});

test('★ 딱 상한이면 그대로 — 괜히 한 번 더 굽지 않는다', async () => {
  const c = shrinker();
  const src = 'data:image/jpeg;2000x1400,AAA';
  assert.equal(await c.shrinkForAi(src), src);
  assert.equal(c._drawn.length, 0);
});

test('★★ 못 읽는 그림은 «그대로 보낸다» — 못 줄인다고 판독이 막히면 안 된다', async () => {
  const c = shrinker();
  const src = 'data:image/jpeg;BAD,AAA';
  assert.equal(await c.shrinkForAi(src), src);
});

test('★★ 줄이는 곳이 없는 데서도 «막히지 않는다» — 노드·오래된 웹뷰', async () => {
  const c = shrinker({ document: undefined });
  delete c.Image;
  vm.runInContext('var Image = undefined;', c);
  const src = 'data:image/jpeg;9000x9000,AAA';
  assert.equal(await c.shrinkForAi(src), src, '★★ 못 줄인다고 판독 자체가 막혔습니다');
});

test('★ 여러 장도 «모두» 줄인다 — 한 장만 줄이면 나머지가 그대로 나간다', async () => {
  const c = shrinker();
  const out = await c.shrinkAllForAi(['data:image/jpeg;2600x1838,A', 'data:image/jpeg;3000x2000,B']);
  assert.equal(out.length, 2);
  assert.equal(c._drawn.length, 2, '★★ 한 장만 줄었습니다');
});

test('★ 한 장을 넘겨도 «목록으로» 돌려준다 — 부르는 쪽이 둘로 갈리면 안 된다', async () => {
  const c = shrinker();
  const out = await c.shrinkAllForAi('data:image/jpeg;1200x900,A');
  assert.ok(Array.isArray(out) && out.length === 1);
});

/* ══════ ④ PDF 도 상한을 놀리지 않는다 ══════ */

test('★★ PDF 를 «담는 상한보다 크게» 그린다 — 작게 그리면 상한을 놀린다', () => {
  const scale = Number(/getViewport\(\{ scale: ([\d.]+) \}\)/.exec(app)[1]);
  const a4long = 842;   /* A4 긴 쪽(pt) */
  assert.ok(a4long * scale >= KEEP,
    '★★ A4 를 ' + Math.round(a4long * scale) + 'px 로 그리는데 담는 상한은 ' + KEEP + 'px 입니다 —\n' +
    '  없는 화소를 늘리는 셈이라 흐린 그림이 커질 뿐입니다');
});
