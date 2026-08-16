'use strict';
/* 사진첩 상단바에 이번 달 사용액 — 대표 지시 2026-08-16
   "사진첩 오른쪽 상단에 금액표시 같이 해달라. 그래야 동시 확인이 된다."

   ⚠ 사진첩은 **전 직원이 쓰는 화면**이다. 푸른ERP(관리자만 들어가는 곳)와 달라서,
     회사 지출액이 아무 눈에나 띄지 않게 하는 것이 이 기능의 첫째 조건이다.
   ⚠ 숫자 판단은 js/pu-billing.js 한 곳에서만 한다 — 화면마다 따로 계산하면
     두 벌이 되고 한쪽만 고쳐진다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ⚠ 주석을 걷어내고 본다. 안 그러면 **주석에 적힌 낱말**을 보고 통과한다 —
   실제로 「어림수라고 적는가」 검사가 바로 위 주석의 '어림수' 글자를 읽고 통과해,
   말풍선에서 그 문구를 지워도 안 잡혔다. */
function slice(from, n) {
  const i = app.indexOf(from);
  if (i < 0) return '';
  return app.slice(i, i + n)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/[^\n]*/gm, ' ');
}

test('관리자에게만 붙는다', async (t) => {
  await t.test('관리자일 때만 시작한다', () => {
    /* 전 직원이 쓰는 화면이다 — 조건 없이 시작하면 회사 지출액이 모두에게 보인다. */
    const at = app.indexOf('if (me.isAdmin) {');
    assert.ok(at > 0, '관리자 갈림길을 찾지 못했습니다.');
    assert.match(app.slice(at, at + 400), /startBillingTop\(\)/,
      '관리자 갈래 안에서 시작하지 않으면 전 직원에게 보입니다.');
  });

  await t.test('관리자 갈래 밖에서는 안 부른다', () => {
    const calls = (app.match(/startBillingTop\(\)/g) || []).length;
    assert.equal(calls, 2, '부르는 곳은 정의 한 번 + 관리자 갈래 한 번, 딱 둘이어야 합니다.');
  });

  await t.test('규칙에 막히면 조용히 감춘다', () => {
    /* ⚠ 실패 콜백을 빠뜨리면 콘솔에 빨간 오류만 남고 화면은 영영 빈 채로 있는다. */
    const fn = slice('function startBillingTop(', 1400);
    assert.match(fn, /watch\(db, paintBillingTop, function \(\) \{ el\.hidden = true; \}\)/,
      '읽기가 막혔을 때 감추는 갈래가 없습니다.');
  });

  await t.test('화면이 실시간DB를 직접 만지지 않는다', () => {
    /* ⚠ 2026-07 실데이터 사고 뒤로 화면의 `db.ref(` 는 통째로 막혀 있다.
       읽기라고 예외를 두면 그 자리가 다시 열린다 — 공용 층의 watch 를 거친다. */
    const fn = slice('function startBillingTop(', 1400);
    assert.equal(/db\.ref\(/.test(fn), false, '화면이 db.ref 를 직접 부르고 있습니다.');
    assert.match(fn, /PuBilling\.watch\(/, '공용 층을 거치지 않습니다.');
  });
});

test('숫자 판단을 화면이 따로 하지 않는다', async (t) => {
  await t.test('공용 저장 층을 싣는다', () => {
    assert.match(app, /<script src="js\/pu-billing\.js(\?v=\d+)?"><\/script>/);
  });

  await t.test('요약은 pu-billing.js 가 한다', () => {
    const fn = slice('function paintBillingTop(', 1800);
    assert.match(fn, /B\.summarize\(/, '요약을 여기서 다시 만들면 두 벌이 됩니다.');
    // 비율·눈금 계산을 여기서 시작하면 푸른ERP 와 어긋난다.
    assert.equal(/\/\s*(s\.)?budget/.test(fn), false, '비율 계산은 pu-billing.js 몫입니다.');
  });
});

test('없는 값과 오래된 값을 구분해 보여 준다', async (t) => {
  const fn = slice('function paintBillingTop(', 1800);

  await t.test('값이 없으면 아예 안 그린다', () => {
    /* 「₩—」를 띄우면 준비 중인지 고장인지 알 수 없는 자리가 하나 늘 뿐이다. */
    assert.match(fn, /if \(!s\.has\) \{ el\.hidden = true; return; \}/,
      '값이 없을 때 감추지 않으면 빈 딱지가 늘 붙어 있습니다.');
  });

  await t.test('오래된 값은 표가 난다', () => {
    /* 옛 금액이 최신인 척 앉아 있는 것이 이 화면에서 제일 나쁜 상태다. */
    assert.match(fn, /s\.stale \? ' stale' : ''/, '오래된 값을 티 내지 않습니다.');
    assert.match(app, /#top \.bill\.stale\{opacity:[^}]*\}/, '흐리게 하는 모양이 없습니다.');
  });

  await t.test('어림수라고 말풍선에 적는다', () => {
    /* 안 적으면 확정 청구액으로 읽히고, 월말에 안 맞으면 못 믿게 된다. */
    assert.match(fn, /어림수/, '어림수라는 말이 어디에도 없습니다.');
  });

  await t.test('쪼갠 값과 월말 예상액은 말풍선에 담는다', () => {
    /* 상단바는 폰에서 이미 빠듯하다 — 전부 펴면 제목이 밀린다. */
    assert.match(fn, /el\.title\s*=/, '말풍선이 없으면 총액 말고는 볼 길이 없습니다.');
    assert.match(fn, /s\.parts\.map/, '쪼갠 값이 말풍선에 안 들어갑니다.');
  });
});
