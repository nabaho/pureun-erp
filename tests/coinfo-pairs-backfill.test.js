'use strict';
/* 이미 보낸 서류에 «적힌 것»을 뒤늦게 채운다 (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   2026-08-28 부터 사진첩이 보낸 서류에는 docs/{서류}/pairs 가 담긴다.
   그런데 «그 전에 보낸 서류»에는 없다 — 대표 화면 기준 400장 남짓.

   ■ 왜 다시 판독하지 «않는가»
     판독은 AI 호출이고 그것이 그대로 요금이다. 그런데 판독 결과는 이미 사진에
     남아 있다(사진 항목의 meta.read.fields). 그 자리를 읽어 옮기기만 하면 «0원»이다.

   ■ 왜 사진첩에서 도는가
     사진은 puphotos/u/{uid} 에, 기업정보는 pucards/coInfo 에 있다 — 뿌리가 다르다.
     사진첩은 제 사진을 이미 손에 들고 있으므로, 거기서 돌리면 사진 쪽 읽기가 0이다.

   ■ 무엇을 조심하나
     ⚠ «이미 보낸 서류»에만 채운다. 안 보낸 사진까지 쓰면 기업정보함에 없던 서류가
       생긴다 — 그것도 이름·날짜 없이 pairs 만 든 껍데기로.
     ⚠ 이미 pairs 가 있으면 안 건드린다. 다시 쓰면 그만큼 요금이고 얻는 것이 없다.
     ⚠ 회사마다 «한 번» 읽고 «한 번» 쓴다. 서류 한 장마다 오가면 400번이 800번이 된다.
     ⚠ 자르는 규칙은 보낼 때와 «같은 것»을 쓴다 — 두 벌이면 한쪽만 고쳐진다.

   ★ 여기서 못 박는 것
     ① 이미 보낸 서류에만 채운다
     ② 이미 있으면 안 건드린다
     ③ 회사마다 한 번 읽고 한 번 쓴다
     ④ 보낼 때와 같은 자르기 규칙
     ⑤ 무엇을 했는지 세어서 돌려준다
     ⑥ 한 회사가 실패해도 나머지는 계속한다
   실행: node --test tests/coinfo-pairs-backfill.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-file.js'), 'utf8');

/* 파일 전체를 돌린다 — 모듈이 global 에 스스로를 붙인다 */
function load(coInfo, opt){
  const reads = [], writes = [];
  const o = opt || {};
  const g = { console, setTimeout, Promise, Object, String, Number, Array, Math, JSON, Date };
  const ctx = { window: g, globalThis: g, self: g, console, setTimeout,
    Promise, Object, String, Number, Array, Math, JSON, Date, Error };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext('var window = this; var self = this;', ctx);
  vm.runInContext(src, ctx);
  const db = { ref: function (p) { return {
    once: function () {
      reads.push(p);
      if (o.readFails && o.readFails[p]) return Promise.reject(new Error('읽기 실패'));
      const parts = p.split('/');            /* pucards/coInfo/{key}/docs */
      const key = parts[2];
      return Promise.resolve({ val: function () { return (coInfo[key] || {}).docs || null; } });
    },
    update: function (v) {
      writes.push({ path: p, val: v });
      if (o.writeFails && o.writeFails[p]) return Promise.reject(new Error('쓰기 실패'));
      return Promise.resolve();
    }
  }; } };
  ctx.PuDocFile.init({ db: db });
  return { api: ctx.PuDocFile, reads: reads, writes: writes };
}

const P = (k, v) => ({ k: k, v: v });
const item = (bizno, year, id, pairs) => ({
  fields: { bizno: bizno, docName: '서식', pairs: pairs },
  photo: { year: year, id: id, owner: 'kwon' }
});

/* ══════ ① 이미 보낸 서류에만 ══════ */

test('★ 이미 보낸 서류에 「적힌 것」이 채워진다', () => {
  const co = { '1348605772': { docs: { '2026_p1': { name:'서식', id:'p1' } } } };
  const { api, writes } = load(co);
  return api.backfillPairs([ item('134-86-05772', '2026', 'p1', [P('신청 사유','설비 교체')]) ])
    .then(r => {
      assert.equal(r.filled, 1);
      assert.equal(writes.length, 1);
      /* vm 안에서 만든 객체라 원형이 달라 deepEqual 이 그대로는 실패한다 — JSON 을 거친다 */
      assert.deepEqual(JSON.parse(JSON.stringify(writes[0].val['docs/2026_p1/pairs'])),
        [P('신청 사유','설비 교체')]);
    });
});

test('★ 기업정보함에 «없는» 서류는 안 만든다 — 이름·날짜 없는 껍데기가 생긴다', () => {
  const co = { '1348605772': { docs: { '2026_p1': { name:'서식' } } } };
  const { api, writes } = load(co);
  return api.backfillPairs([ item('134-86-05772', '2026', 'p9', [P('가','나')]) ])
    .then(r => {
      assert.equal(r.filled, 0);
      assert.equal(writes.length, 0, '★ 안 보낸 사진까지 쓰면 없던 서류가 생긴다');
      assert.equal(r.notSent, 1, '건너뛴 까닭을 세어야 왜 안 됐는지 안다');
    });
});

test('회사가 아예 기업정보함에 없으면 건너뛴다', () => {
  const { api, writes } = load({});
  return api.backfillPairs([ item('134-86-05772', '2026', 'p1', [P('가','나')]) ])
    .then(r => { assert.equal(r.filled, 0); assert.equal(writes.length, 0); });
});

/* ══════ ② 이미 있으면 안 건드린다 ══════ */

test('★ 이미 「적힌 것」이 있으면 다시 안 쓴다 — 다시 쓰면 그만큼 요금이다', () => {
  const co = { '1348605772': { docs: { '2026_p1': { name:'서식', pairs:[P('옛','것')] } } } };
  const { api, writes } = load(co);
  return api.backfillPairs([ item('134-86-05772', '2026', 'p1', [P('새','것')]) ])
    .then(r => {
      assert.equal(r.filled, 0);
      assert.equal(writes.length, 0);
      assert.equal(r.already, 1);
    });
});

test('담을 것이 없는 사진은 건너뛴다', () => {
  const co = { '1348605772': { docs: { '2026_p1': { name:'서식' } } } };
  const { api, writes } = load(co);
  return api.backfillPairs([ item('134-86-05772', '2026', 'p1', []),
                             item('134-86-05772', '2026', 'p1', null) ])
    .then(() => assert.equal(writes.length, 0));
});

test('사업자번호를 못 읽은 사진은 건너뛴다 — 어느 회사인지 모른다', () => {
  const { api, writes } = load({});
  return api.backfillPairs([ item('', '2026', 'p1', [P('가','나')]) ])
    .then(r => { assert.equal(writes.length, 0); assert.equal(r.noKey, 1); });
});

/* ══════ ③ 회사마다 한 번 읽고 한 번 쓴다 ══════ */

test('★ 한 회사에 서류가 여럿이어도 «한 번» 읽고 «한 번» 쓴다', () => {
  const co = { '1348605772': { docs: {
    '2026_p1': { name:'가' }, '2026_p2': { name:'나' }, '2026_p3': { name:'다' } } } };
  const { api, reads, writes } = load(co);
  return api.backfillPairs([
    item('134-86-05772', '2026', 'p1', [P('a','1')]),
    item('134-86-05772', '2026', 'p2', [P('b','2')]),
    item('134-86-05772', '2026', 'p3', [P('c','3')])
  ]).then(r => {
    assert.equal(r.filled, 3);
    assert.equal(reads.length, 1, '★ 서류마다 읽으면 400장이 400번 오간다');
    assert.equal(writes.length, 1, '★ 서류마다 쓰면 그만큼 요금이다');
    assert.equal(Object.keys(writes[0].val).length, 3);
  });
});

test('회사가 여럿이면 회사 수만큼만 오간다', () => {
  const co = { '1348605772': { docs: { '2026_p1': { name:'가' } } },
               '5058600987': { docs: { '2026_p2': { name:'나' } } } };
  const { api, reads, writes } = load(co);
  return api.backfillPairs([
    item('134-86-05772', '2026', 'p1', [P('a','1')]),
    item('505-86-00987', '2026', 'p2', [P('b','2')])
  ]).then(() => {
    assert.equal(reads.length, 2);
    assert.equal(writes.length, 2);
  });
});

/* ══════ ④ 보낼 때와 같은 자르기 ══════ */

test('★ 자르는 규칙이 «보낼 때와 같다» — 두 벌이면 한쪽만 고쳐진다', () => {
  const many = [];
  for (let i = 0; i < 200; i++) many.push(P('항목' + i, '값' + i));
  const co = { '1348605772': { docs: { '2026_p1': { name:'서식' } } } };
  const { api, writes } = load(co);
  return api.backfillPairs([ item('134-86-05772', '2026', 'p1', many) ]).then(() => {
    const v = writes[0].val;
    assert.ok(v['docs/2026_p1/pairs'].length <= 60, '개수를 안 잘랐다');
    assert.ok(v['docs/2026_p1/pairsCut'] > 0, '자른 개수를 안 남겼다');
  });
});

test('값이 아주 길면 보낼 때와 같이 자른다', () => {
  const co = { '1348605772': { docs: { '2026_p1': { name:'서식' } } } };
  const { api, writes } = load(co);
  return api.backfillPairs([ item('134-86-05772', '2026', 'p1',
    [P('비고', 'ㄱ'.repeat(5000))]) ]).then(() => {
    assert.ok(writes[0].val['docs/2026_p1/pairs'][0].v.length <= 300);
  });
});

/* ══════ ⑤ 무엇을 했는지 돌려준다 ══════ */

test('★ 무엇을 했는지 세어서 돌려준다 — 안 세면 다 됐는지 알 수 없다', () => {
  const co = { '1348605772': { docs: {
    '2026_p1': { name:'가' }, '2026_p2': { name:'나', pairs:[P('있','음')] } } } };
  const { api } = load(co);
  return api.backfillPairs([
    item('134-86-05772', '2026', 'p1', [P('a','1')]),
    item('134-86-05772', '2026', 'p2', [P('b','2')]),
    item('134-86-05772', '2026', 'p9', [P('c','3')]),
    item('', '2026', 'p8', [P('d','4')])
  ]).then(r => {
    assert.equal(r.filled, 1);
    assert.equal(r.already, 1);
    assert.equal(r.notSent, 1);
    assert.equal(r.noKey, 1);
    assert.equal(r.coCount, 1);
  });
});

/* ══════ ⑥ 하나가 실패해도 나머지는 계속 ══════ */

test('★ 한 회사가 실패해도 나머지는 계속한다', () => {
  const co = { '1348605772': { docs: { '2026_p1': { name:'가' } } },
               '5058600987': { docs: { '2026_p2': { name:'나' } } } };
  const { api } = load(co, { writeFails: { 'pucards/coInfo/1348605772': 1 } });
  return api.backfillPairs([
    item('134-86-05772', '2026', 'p1', [P('a','1')]),
    item('505-86-00987', '2026', 'p2', [P('b','2')])
  ]).then(r => {
    assert.equal(r.failed, 1, '실패를 세야 다시 눌러 볼 줄 안다');
    assert.equal(r.filled, 1, '★ 한 회사에서 멈추면 나머지가 영영 안 채워진다');
  });
});

test('빈 목록·헛값을 줘도 터지지 않는다', () => {
  const { api } = load({});
  return api.backfillPairs([]).then(r => {
    assert.equal(r.filled, 0);
    return api.backfillPairs(null);
  }).then(r => assert.equal(r.filled, 0));
});

/* ══════ ⑦ 서버에 «새로 판독하지» 않는다 ══════ */

test('★ 다시 판독하지 않는다 — 판독은 AI 호출이고 그것이 그대로 요금이다', () => {
  const i = src.indexOf('function backfillPairs');
  const fn = src.slice(i, src.indexOf('\n  function ', i + 10));
  assert.equal(/PuAiCall|readDoc|fetch\(/.test(fn), false,
    '★ 판독 결과는 이미 사진에 있다 — 옮기기만 하면 0원이다');
});
