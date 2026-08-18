'use strict';
/* 저장할 때 「칸 전체」 대신 「바뀐 건만」 올린다 — 요금 조사 2026-08-18, 2단계
   계획서: docs/superpowers/plans/2026-08-18-이알피-건별동기화.md

   ■ 왜

   콘솔 실측: 스토리지 782MB · **다운로드 189.19GB/18일**.
   저장할 때마다 `data/{칸}` 을 통째로 올렸다(트랜잭션도 통째로 읽고 통째로 쓴다).
   그러면 서버가 「이 칸이 통째로 바뀌었다」고 보아, **건별로 구독하는 사람에게도
   바뀐 건이 다 간다** — 1단계(읽기)만으로는 값이 안 주는 까닭이 이것이다.

   ■ 이 검사가 보는 것

   경로 묶음을 **실제로 만들어** 무엇이 담기는지 본다. 「글자가 있나」로는
   `data/{칸}` 이 섞여 들어가도 못 잡는다 — 그 한 줄이 고침 전체를 무효로 만든다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const { cutFn } = require('./cut-fn');
const app = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1'); }

/* 건별 갈래 «안쪽»만 잘라 낸다.
   ⚠ 고정 폭으로 자르면 갈래를 넘어 바로 뒤 트랜잭션까지 삼킨다 — 그러면
     「이 갈래에 트랜잭션이 있다」고 잘못 판정한다(실제로 그렇게 한 번 틀렸다).
     갈래를 닫는 `return true;` 에서 끊는다. */
function recArm(src, at) {
  const end = src.indexOf('return true;', at);
  assert.ok(end > at, '건별 갈래의 끝을 찾지 못했습니다');
  return src.slice(at, end + 'return true;'.length);
}

/* 경로 만들기와 차이 계산기를 그대로 떠다 실제로 돌린다 */
function load() {
  const ctx = { console, Object, Array, JSON, String, Number };
  vm.createContext(ctx);
  vm.runInContext(
    cutFn(app, 'function erpObjIsMap(') + '\n' +
    cutFn(app, 'function erpObjDiff(') + '\n' +
    cutFn(app, 'function _fbRecordUpdate('), ctx);
  return ctx;
}

test('바뀐 건만 경로로 편다', async (t) => {
  const C = load();

  await t.test('★ 고친 건 하나면 그 건 하나만 올린다', () => {
    const diff = C.erpObjDiff({ a: { id: 'a', n: 1 }, b: { id: 'b', n: 2 } },
      { a: { id: 'a', n: 1 }, b: { id: 'b', n: 99 } });
    const u = C._fbRecordUpdate('contracts', diff, 555);
    assert.deepEqual(Object.keys(u).sort(), ['data/contracts/u', 'data/contracts/v/b'],
      '★ 안 건드린 건까지 올리면 서버가 칸 전체를 내려보냅니다: ' + Object.keys(u).join(', '));
    assert.deepEqual(u['data/contracts/v/b'], { id: 'b', n: 99 });
  });

  await t.test('★ 「칸 자체」는 절대 안 담는다 — 담으면 고친 뜻이 통째로 사라진다', () => {
    const diff = C.erpObjDiff({ a: { id: 'a' } }, { a: { id: 'a', n: 1 }, z: { id: 'z' } });
    const u = C._fbRecordUpdate('contracts', diff, 1);
    Object.keys(u).forEach(function (p) {
      assert.notEqual(p, 'data/contracts', '★ 칸 통째 경로가 섞였습니다');
      assert.ok(p === 'data/contracts/u' || p.indexOf('data/contracts/v/') === 0,
        '엉뚱한 자리에 씁니다: ' + p);
    });
  });

  await t.test('★ 지운 건은 null 로 — 안 그러면 남의 화면에 계속 보인다', () => {
    const diff = C.erpObjDiff({ a: { id: 'a' }, b: { id: 'b' } }, { a: { id: 'a' } });
    const u = C._fbRecordUpdate('contracts', diff, 1);
    assert.equal(u['data/contracts/v/b'], null);
  });

  await t.test('★ 칸 시각을 «같은 묶음»에 담는다 — 따로 쓰면 아무도 못 받는다', () => {
    /* 실시간DB 의 update 는 한 묶음이 통째로 되거나 통째로 안 된다.
       따로 쓰면 그 사이에 끊겼을 때 「자료는 바뀌었는데 시각은 옛 것」이 되어
       다른 기기의 감시자가 영영 못 알아챈다. */
    const u = C._fbRecordUpdate('contracts', C.erpObjDiff({}, { a: { id: 'a' } }), 777);
    assert.equal(u['data/contracts/u'], 777, '칸 시각이 빠졌습니다');
  });

  await t.test('바뀐 것이 없어도 시각은 올린다 — 부르는 쪽이 이미 걸러 준다', () => {
    const u = C._fbRecordUpdate('contracts', { set: {}, del: [] }, 5);
    assert.deepEqual(Object.keys(u), ['data/contracts/u']);
  });

  await t.test('이상한 값이 와도 안 터진다', () => {
    assert.deepEqual(Object.keys(C._fbRecordUpdate('contracts', null, 5)), ['data/contracts/u']);
  });

  await t.test('★ 여러 건을 고치면 그 건들만 — 나머지는 안 건드린다', () => {
    const prev = {}, next = {};
    for (let i = 0; i < 100; i++) { prev['r' + i] = { id: 'r' + i, n: 1 }; next['r' + i] = { id: 'r' + i, n: 1 }; }
    next.r7 = { id: 'r7', n: 2 };
    next.r42 = { id: 'r42', n: 2 };
    const u = C._fbRecordUpdate('contracts', C.erpObjDiff(prev, next), 1);
    assert.equal(Object.keys(u).length, 3, '100건 중 2건만 고쳤는데 ' + (Object.keys(u).length - 1) + '건을 올립니다');
  });
});

/* ══════ 배선 — 저장 경로가 실제로 이 길로 가는가 ══════ */
test('저장 배선', async (t) => {
  const src = code(app);

  await t.test('★ 건별 칸은 update 로 올린다 — 트랜잭션(통째)로 안 간다', () => {
    const at = src.indexOf('if(_fbIsRecordKey(k) && erpObjIsMap(prev)){');
    assert.ok(at > 0, '건별 올리기 갈래를 찾지 못했습니다');
    const arm = recArm(src, at);
    assert.match(arm, /_fbRecordUpdate\(k, _md, ts\)/, '경로 묶음을 안 만듭니다');
    assert.match(arm, /fbDb\.ref\(\)\.update\(_ru\)/, '경로별 update 로 안 올립니다');
    assert.ok(arm.indexOf('.transaction(') < 0, '★ 이 갈래에서 트랜잭션(통째)으로 갑니다');
  });

  await t.test('★ 갈래를 트랜잭션«앞»에 둔다 — 뒤에 두면 영영 안 탄다', () => {
    const guard = src.indexOf('if(_fbIsRecordKey(k) && erpObjIsMap(prev)){');
    const tx = src.indexOf("fbDb.ref('data/'+k).transaction(function(cur){", guard - 2000 > 0 ? guard - 2000 : 0);
    assert.ok(guard > 0 && tx > guard, '건별 갈래가 트랜잭션보다 뒤에 있습니다');
  });

  await t.test('★ 내 사본이 지도 모양일 때만 간다 — 모양이 다르면 자료가 어긋난다', () => {
    /* 트랜잭션이 하던 「서버가 다른 모양이면 안 만짐」 보호가 이 갈래에는 없다.
       그래서 들어가는 문턱을 좁게 잡는다. */
    assert.match(src, /if\(_fbIsRecordKey\(k\) && erpObjIsMap\(prev\)\)\{/);
  });

  await t.test('★ 실패하면 되돌리고 사람에게 말한다 — 조용히 삼키면 자료가 사라진 줄 모른다', () => {
    const at = src.indexOf('if(_fbIsRecordKey(k) && erpObjIsMap(prev)){');
    const arm = recArm(src, at);
    assert.match(arm, /_metaRollback\(\); _markPending\(\); fbSyncFail\(e\)/);
    assert.match(arm, /showToast\(/, '사람에게 아무 말도 안 합니다');
  });

  await t.test('★ 명단 밖 칸은 예전 그대로 트랜잭션 — «곧바로» 이어져야 한다', () => {
    /* ⚠ 「트랜잭션이라는 글자가 있나」로는 못 잡는다 — 앞에 `if(0)` 하나만 붙여도
       죽는데 글자는 그대로 남는다(뮤테이션에서 실제로 살아남았다).
       건별 갈래가 끝난 **바로 다음**에 트랜잭션이 오는지를 본다. */
    const at = src.indexOf('if(_fbIsRecordKey(k) && erpObjIsMap(prev)){');
    const armEnd = src.indexOf('return true;', at) + 'return true;'.length;
    const after = src.slice(armEnd).replace(/^[\s}]*/, '');
    assert.ok(after.indexOf("fbDb.ref('data/'+k).transaction(function(cur){") === 0,
      '★ 모양이 다른 칸이 갈 곳을 잃었습니다 — 그 칸들은 저장이 통째로 죽습니다.\n      다음에 온 것: ' + after.slice(0, 80));
  });
});
