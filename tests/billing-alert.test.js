'use strict';
/* 파이어베이스 사용액 알림 — 서버가 쪽지를 읽어 담는 부분
   대표 보고 2026-08-15: "결제한 금액 잔여량을 실시간으로 볼 수 있나, 화면에 넣을 수 있나."

   여기서 지키는 것은 두 가지다.
     ① 못 알아보는 쪽지는 버린다 — 반쪽짜리를 담으면 화면에 ₩0 이 뜨고,
        ₩0 은 「안 썼다」로 읽혀서 없는 것보다 나쁘다.
     ② 늦게 온 옛 쪽지가 최신 금액을 되돌리지 못한다 — Pub/Sub 은 순서를
        지켜 주지 않는다. 되돌아가면 화면에서 금액이 줄어든 것처럼 보이고
        아무도 그게 틀렸다는 걸 모른다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const BA = require('../functions/billing-alert');

// 구글 클라우드 예산이 실제로 쏘는 쪽지 모양 그대로.
function msg(over) {
  return Object.assign({
    budgetDisplayName: 'pu-total',
    costAmount: 18400,
    costIntervalStart: '2026-08-01T00:00:00Z',
    budgetAmount: 50000,
    budgetAmountType: 'SPECIFIED_AMOUNT',
    currencyCode: 'KRW',
  }, over || {});
}
const AUG = Date.parse('2026-08-01T00:00:00Z');
const SEP = Date.parse('2026-09-01T00:00:00Z');

test('쪽지 읽기', async (t) => {
  await t.test('평범한 쪽지 한 통', () => {
    const r = BA.parseAlert(msg());
    assert.equal(r.ok, true);
    assert.equal(r.key, 'total');
    assert.equal(r.row.cost, 18400);
    assert.equal(r.row.budget, 50000);
    assert.equal(r.row.intervalStart, AUG);
  });

  await t.test('서비스별 예산은 제 자리로 갈린다 — 쪼개 보여 주는 근거', () => {
    assert.equal(BA.parseAlert(msg({ budgetDisplayName: 'pu-storage' })).key, 'storage');
    assert.equal(BA.parseAlert(msg({ budgetDisplayName: 'pu-database' })).key, 'database');
    assert.equal(BA.parseAlert(msg({ budgetDisplayName: 'pu-functions' })).key, 'functions');
  });

  await t.test('모르는 이름의 예산은 담지 않는다', () => {
    // 이 자리를 열어 두면 남이 만든 예산이 우리 화면 금액을 덮어쓴다.
    assert.equal(BA.parseAlert(msg({ budgetDisplayName: '누가만든예산' })).ok, false);
    assert.equal(BA.parseAlert(msg({ budgetDisplayName: '' })).ok, false);
  });

  await t.test('금액이 없는 쪽지는 버린다 — ₩0 으로 담으면 안 된다', () => {
    assert.equal(BA.parseAlert(msg({ costAmount: undefined })).ok, false);
    assert.equal(BA.parseAlert(msg({ costAmount: '얼마' })).ok, false);
    assert.equal(BA.parseAlert(msg({ costAmount: -5 })).ok, false);
    // ⚠ null 을 따로 못 박는다 — Number(null) 은 0 이라, 무심코 쓰면 여기만 빠져나가
    //    「금액 없음」이 ₩0 으로 담긴다.
    assert.equal(BA.parseAlert(msg({ costAmount: null })).ok, false);
    assert.equal(BA.parseAlert(msg({ costAmount: '' })).ok, false);
  });

  await t.test('진짜 0원은 담는다 — 달이 막 바뀌면 0 이 맞다', () => {
    const r = BA.parseAlert(msg({ costAmount: 0 }));
    assert.equal(r.ok, true);
    assert.equal(r.row.cost, 0);
  });

  await t.test('집계 시작일이 없으면 버린다 — 어느 달 것인지 모르면 순서를 못 가린다', () => {
    assert.equal(BA.parseAlert(msg({ costIntervalStart: undefined })).ok, false);
    assert.equal(BA.parseAlert(msg({ costIntervalStart: '언제였더라' })).ok, false);
  });

  await t.test('눈금(예산액)이 없으면 null — 0 이 아니다', () => {
    // 대표 결정: 첫 달은 실제 사용액을 모르니 눈금 없이 금액만 본다.
    // 0 으로 담으면 화면이 「0원짜리 예산을 다 썼다」로 그린다.
    assert.equal(BA.parseAlert(msg({ budgetAmount: undefined })).row.budget, null);
    assert.equal(BA.parseAlert(msg({ budgetAmount: 0 })).row.budget, null);
  });

  await t.test('임계값을 안 넘겼으면 null — 0 이 아니다', () => {
    assert.equal(BA.parseAlert(msg()).row.threshold, null);
    assert.equal(BA.parseAlert(msg({ alertThresholdExceeded: 0.5 })).row.threshold, 0.5);
  });

  await t.test('쪽지가 아예 아니면 버린다', () => {
    assert.equal(BA.parseAlert(null).ok, false);
    assert.equal(BA.parseAlert('문자열').ok, false);
  });
});

test('늦게 온 쪽지가 금액을 되돌리지 못한다', async (t) => {
  const now = { cost: 18400, intervalStart: AUG };

  await t.test('처음이면 담는다', () => {
    assert.equal(BA.shouldApply(null, { cost: 100, intervalStart: AUG }), true);
  });

  await t.test('같은 달에 금액이 늘었으면 담는다', () => {
    assert.equal(BA.shouldApply(now, { cost: 19000, intervalStart: AUG }), true);
  });

  await t.test('같은 달에 금액이 줄었으면 버린다 — 늦게 온 옛 쪽지다', () => {
    // 한 달 안에서 쓴 돈은 줄지 않는다. 줄었다면 순서가 뒤집힌 것이다.
    assert.equal(BA.shouldApply(now, { cost: 12000, intervalStart: AUG }), false);
  });

  await t.test('같은 쪽지가 두 번 와도 그대로 둔다', () => {
    assert.equal(BA.shouldApply(now, { cost: 18400, intervalStart: AUG }), false);
  });

  await t.test('달이 바뀌면 금액이 줄어도 담는다 — 9월은 0 부터 다시 센다', () => {
    // 이 갈래가 없으면 9월 내내 8월 금액이 남아 새 달 금액이 영영 안 올라간다.
    assert.equal(BA.shouldApply(now, { cost: 300, intervalStart: SEP }), true);
  });

  await t.test('지난달 쪽지가 이제 도착하면 버린다', () => {
    const sep = { cost: 300, intervalStart: SEP };
    assert.equal(BA.shouldApply(sep, { cost: 18400, intervalStart: AUG }), false);
  });

  await t.test('담긴 값이 망가져 있으면 새 쪽지로 덮는다 — 못 믿을 값을 지킬 이유가 없다', () => {
    assert.equal(BA.shouldApply({ cost: 5 }, { cost: 1, intervalStart: AUG }), true);
    assert.equal(BA.shouldApply({ intervalStart: AUG }, { cost: 1, intervalStart: AUG }), true);
  });
});
