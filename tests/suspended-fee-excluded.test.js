'use strict';
/* 「계약 중단」 업체는 월 자문료 계산에서 뺀다   2026-09-08

   대표 지시: 「월자문료계산에서 중단사업장 금액은 제외시키기」

   ■ 무엇이 문제였나
   업체 창의 「⏸ 계약 중단」 칸은 스스로 «청구·세금계산서 발행 중단» 이라고 적어 둔다.
   그런데 중단해도 status 는 그대로 'active' 라, 셈하는 자리들이 전부 못 보고 있었다.
   실측(업체 374곳): 중단 2곳 — 코디스(2026-06-18) 150,000 · 신석개발산업㈜(2025-06-01) 200,000.
   35만원이 업체관리 「💰 월 자문료」에 계속 얹혀 있었고, 자문료관리는 그 달칸을
   미납으로 그렸으며, 일괄 생성은 «받을 일 없는 입금»을 만들 수 있었다.

   ■ 이 검사가 지키는 것
     ① 중단일이 «지난» 달은 뺀다
     ② 중단일이 «든» 달까지는 받는다 (이미 받은 입금이 갈 곳을 잃으면 안 된다)
     ③ 중단일이 없으면 이번 달부터만 뺀다 (모를 때는 덜 지운다)
     ④ 세는 자리들이 «같은 눈»으로 본다 — 한 자리만 고치면 화면마다 금액이 갈린다 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { test } = require('node:test');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = stripComments(src);

/* 진짜 함수를 그대로 실어 돌린다 — 흉내낸 사본은 본체가 바뀌어도 계속 통과한다 */
function realm(nowYm) {
  const ctx = { console: console, window: {}, todayYM: () => nowYm };
  vm.createContext(ctx);
  vm.runInContext(cutFn(src, 'function erpFeeStopped('), ctx);
  return ctx;
}
const stopped = (co, ym, now) =>
  vm.runInContext('erpFeeStopped(' + JSON.stringify(co) + ',' + JSON.stringify(ym) + ')',
                  realm(now || '2026-09'));

/* 실제로 중단돼 있던 두 곳 */
const CODIS = { name: '코디스', status: 'active', suspended: true, suspendedAt: '2026-06-18', monthlyAdvisoryFee: 150000 };
const SINSEOK = { name: '신석개발산업㈜', status: 'active', suspended: true, suspendedAt: '2025-06-01', monthlyAdvisoryFee: 200000 };
const LIVE = { name: '송림산업', status: 'active', monthlyAdvisoryFee: 132000 };

test('① 중단일이 지난 달은 «안 받는다»', function () {
  assert.equal(stopped(CODIS, '2026-09'), true, '★ 중단한 업체가 아직 세어지고 있습니다');
  assert.equal(stopped(CODIS, '2026-07'), true, '중단 다음 달부터 바로 빠져야 합니다');
  assert.equal(stopped(SINSEOK, '2026-09'), true);
});

test('② ★ 중단일이 «든» 달까지는 받는다 — 지난 장부를 흔들지 않는다', function () {
  assert.equal(stopped(CODIS, '2026-06'), false, '★ 중단한 그 달까지 지우면 이미 받은 입금이 갈 곳을 잃습니다');
  assert.equal(stopped(CODIS, '2026-01'), false, '★ 중단 훨씬 전 달까지 지우고 있습니다');
  assert.equal(stopped(SINSEOK, '2025-05'), false);
});

test('③ 중단 안 한 업체는 손대지 않는다', function () {
  assert.equal(stopped(LIVE, '2026-09'), false);
  assert.equal(stopped({ suspended: false, suspendedAt: '2020-01-01' }, '2026-09'), false,
    '★ 중단을 풀었는데도 빼고 있습니다');
  assert.equal(stopped(null, '2026-09'), false, '빈 값에도 안 터집니다');
});

test('④ 중단일이 «없으면» 이번 달부터만 뺀다 — 모를 때는 덜 지운다', function () {
  const noDate = { suspended: true, suspendedAt: '', monthlyAdvisoryFee: 100000 };
  assert.equal(stopped(noDate, '2026-10', '2026-09'), true, '★ 언제부터인지 몰라도 앞으로는 안 받습니다');
  assert.equal(stopped(noDate, '2026-09', '2026-09'), false, '이번 달까지는 받은 것으로 둡니다');
  assert.equal(stopped(noDate, '2026-03', '2026-09'), false,
    '★ 중단일을 모르는데 옛 달까지 지웠습니다 — 지난 장부가 흔들립니다');
});

test('⑤ 달을 안 주면 «지금»으로 본다', function () {
  assert.equal(stopped(CODIS, null, '2026-09'), true);
  assert.equal(stopped(CODIS, null, '2026-05'), false, '중단 전 시점에서는 받고 있었다');
});

/* ── 세는 자리들이 이 눈으로 보는가 ─────────────────────────────────────── */

test('⑥ ★ 업체관리 「💰 월 자문료」가 중단을 뺀다 — 대표가 짚은 그 칸', function () {
  /* ⚠ 바로 뒤의 suspendedFee 도 erpFeeStopped 를 부른다 — 거기까지 읽으면
     합계에서 걷기를 통째로 빼도 검사가 통과한다. 합계 «한 덩이»만 잘라 본다. */
  const from = bare.indexOf('var totalAdvisoryFee');
  const to = bare.indexOf('var suspendedFee');
  assert.ok(from > 0 && to > from, '합계 자리를 못 찾았습니다');
  const v = bare.slice(from, to);
  assert.match(v, /erpFeeStopped\(c,\s*selYM\)/,
    '★ 합계가 중단 업체를 그대로 더하고 있습니다');
});

test('⑦ ★ 얼마를 뺐는지 말해 준다 — 말없이 줄면 고장으로 보인다', function () {
  assert.match(bare, /suspendedFee\s*=[\s\S]{0,200}erpFeeStopped\(/, '뺀 금액을 따로 셈해야 합니다');
  assert.match(bare, /sub:\s*suspendedFee\s*>\s*0/, '★ 뺀 금액이 화면 어디에도 안 나옵니다');
});

test('⑧ ★ 자문료관리도 «같은 눈»으로 본다 — 화면마다 금액이 갈리면 안 된다', function () {
  const off = cutFn(src, 'function feeMonthOff(');
  assert.match(stripComments('<script>' + off + '</script>'), /isAfterSuspend\(/,
    '★ 자문료관리의 「그 달 없음」 판정이 중단을 안 봅니다');
  const after = stripComments('<script>' + cutFn(src, 'function isAfterSuspend(') + '</script>');
  assert.match(after, /erpFeeStopped\(/, '★ 규칙을 따로 베껴 두면 한쪽만 고쳐집니다');
});

test('⑨ ★ 「받을 일 없는 입금」을 만들지 않는다 — 일괄 단추 전부', function () {
  /* 달을 한꺼번에 확정하는 길이 다섯이다. 하나라도 빠지면 그 길로 유령 입금이 생긴다 */
  [['toggleMonthAll', 'month'], ['toggleRow', 'm'], ['registerCMS', 'cmsMonth'],
   ['autoGenerate', 'nowMonth'], ['autoGenerateYear', 'm']].forEach(function (pair) {
    const body = stripComments('<script>' + cutFn(src, 'function ' + pair[0] + '(') + '</script>');
    assert.match(body, new RegExp('feeMonthOff\\(co\\s*,\\s*' + pair[1] + '\\)'),
      '★ ' + pair[0] + ' 이 중단·계약전 달에도 입금을 만듭니다');
  });
});

test('⑩ ★ 자문료관리 합계(월·연)도 뺀다', function () {
  const v = bare.slice(bare.indexOf('var totalFee=SOURCE_LIST'), bare.indexOf('var cmsCount='));
  assert.ok(v.length > 50, 'totalFee 자리를 못 찾았습니다');
  assert.ok(!/isBeforeContract\(/.test(v),
    '★ 합계가 아직 계약시작일만 보고 있습니다 — 중단은 못 봅니다');
  assert.equal((v.match(/feeMonthOff\(/g) || []).length, 3,
    '★ 월 합계·이번달 대상·연 합계 셋 다 같은 눈으로 봐야 합니다');
});

test('⑪ ★ 이미 입금이 적힌 달은 지우지 않는다 — 중단 뒤 들어온 밀린 돈이 있다', function () {
  assert.match(bare, /if\(afterSuspend\s*&&\s*!paid\)\{/,
    '★ 중단 뒤 달을 무조건 비우면 그 달 입금이 화면에서 사라집니다');
});

test('⑫ ★ 점검·미입금 후보도 중단을 뺀다', function () {
  const rec = bare.slice(bare.indexOf('var advThisMonth'), bare.indexOf('var byCat'));
  assert.equal((rec.match(/erpFeeStopped\(co,\s*thisYM\)/g) || []).length, 2,
    '★ 「자문료미생성」·「자문료합계」 둘 다 중단 업체를 걸고 있습니다');
  const adv = stripComments('<script>' + cutFn(src, 'function addAdvisoryPending(') + '</script>');
  assert.match(adv, /erpFeeStopped\(co,\s*ym\)/,
    '★ 돈줄맞추기가 중단 업체를 매달 미입금으로 올립니다');
});

test('⑬ ★ 재무 대시보드 「계약 기준 참고치」도 뺀다', function () {
  const v = bare.slice(bare.indexOf('var contractFix'), bare.indexOf('var contractFix') + 400);
  assert.match(v, /erpFeeStopped\(c\)/, '★ 참고치가 업체관리 화면과 다른 금액을 보여 줍니다');
});
