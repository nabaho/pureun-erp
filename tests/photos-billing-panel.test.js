'use strict';
/* 사용액 자세히 보기 판 — 대표 지시 2026-08-16
   "사진첩에서도 전체 내역등을 모두 볼 수 있게 해달라."

   ⚠ 종전에는 쪼갠 값·월말 예상액을 **말풍선(title)** 에만 담았다.
     그런데 사진첩은 폰에서 제일 많이 쓰는 화면이고, **폰에는 올릴 마우스가 없다** —
     정작 볼 사람이 못 보는 자리였다. 눌러서 여는 판으로 옮긴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ⚠ 주석을 걷어내고 본다 — 안 그러면 주석에 적힌 낱말을 보고 통과한다(두 번 걸렸다). */
function slice(from, n) {
  const i = app.indexOf(from);
  if (i < 0) return '';
  return app.slice(i, i + n).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');
}

test('눌러서 연다 — 폰에서도 볼 수 있게', async (t) => {
  await t.test('딱지를 누르면 열린다', () => {
    assert.match(app, /id="billTop"[^>]*onclick="toggleBillBox\(\)"/,
      '딱지를 눌러도 안 열리면 폰에서는 볼 방법이 없습니다.');
  });

  await t.test('누를 수 있게 생겼다', () => {
    assert.match(app, /#top \.bill\{[^}]*cursor:pointer/,
      '누를 수 있는 것처럼 안 보이면 아무도 안 누릅니다.');
  });

  await t.test('바깥을 눌러도 닫힌다', () => {
    /* 닫는 길이 ✕ 하나뿐이면 폰에서 판이 걸린 것처럼 느껴진다. */
    assert.match(app, /id="billBack" onclick="closeBillBox\(\)"/, '뒤 덮개가 없습니다.');
  });

  await t.test('자리를 숫자로 박지 않고 잰다', () => {
    /* 상단바 높이가 기기마다 다르다(노치·안전영역). 박아 두면 어딘가에서 어긋난다. */
    const fn = slice('function toggleBillBox(', 900);
    assert.match(fn, /getBoundingClientRect\(\)/, '딱지 자리를 재지 않고 박아 두었습니다.');
  });
});

test('무엇이 적히는가', async (t) => {
  const fn = slice('function renderBillBox(', 2600);

  await t.test('쪼갠 항목을 모두 적는다', () => {
    assert.match(fn, /s\.parts\.map/, '항목별 내역이 없으면 「전체 내역」이 아닙니다.');
  });

  await t.test('언제 기준인지 늘 적는다', () => {
    /* 언제 것인지 모르는 금액이 이 화면에서 제일 위험하다.
       ⚠ 그냥 `s.ago` 를 찾으면 안 된다 — 아래 「갱신이 없습니다」 경고에도 같은 값이
         쓰여, 늘 보이는 기준 시각 줄을 통째로 지워도 통과했다(살아남은 뮤테이션).
         경고는 **끊겼을 때만** 나오므로, 평소에도 보이는 줄을 따로 못 박는다. */
    assert.match(fn, /s\.ago[\s\S]{0,20}기준/, '평소에 기준 시각이 안 보입니다.');
  });

  await t.test('오래된 값이면 대놓고 알린다', () => {
    assert.match(fn, /s\.stale \?/, '갱신이 끊겨도 조용하면 옛 값이 최신인 척 남습니다.');
  });

  await t.test('월말 예상액은 참고용이라고 적는다', () => {
    /* 달 앞부분에 몰려 쓴 달에는 크게 부풀려진다 — 실제로 8월이 그랬다. */
    assert.match(fn, /참고용/, '참고용이라고 안 적으면 확정 예상액으로 읽힙니다.');
  });

  await t.test('「남은 금액」이 없다는 것을 화면이 말해 준다', () => {
    /* 대표님이 "무료 비용은 언제까지이고 얼마나 남았나" 물으셨다.
       Blaze 는 후불이라 남은 돈이라는 숫자가 없다 — 화면이 답하게 둔다. */
    /* ⚠ 그냥 「남은 금액」이라는 낱말을 찾으면 안 된다 — 바로 아래 문장
       「무료 사용량을 빼고 **남은 금액**」에도 같은 낱말이 있어, 정작 이 안내를
       통째로 지워도 통과했다(실제로 살아남은 뮤테이션이다). 문장으로 못 박는다. */
    assert.match(fn, /「남은 금액」은 없습니다/, '안 적으면 같은 질문이 되풀이됩니다.');
    assert.match(fn, /다음 달에 청구/, '후불이라는 것을 안 알려 줍니다.');
  });

  await t.test('무료 사용량을 뺀 값이라고 적는다', () => {
    assert.match(fn, /무료 사용량/, '무료분이 이미 빠진 값이라는 것을 안 알려 줍니다.');
  });

  await t.test('어림수라고 적는다', () => {
    assert.match(fn, /어림수/, '확정 청구액으로 읽힙니다.');
  });

  await t.test('값이 없으면 아무것도 안 그린다', () => {
    assert.match(fn, /!s\.has\)[^;]*innerHTML = ''/,
      '값이 없을 때 빈 판을 띄우면 고장인지 준비 중인지 알 수 없습니다.');
  });
});

test('열려 있는 동안 값이 바뀌면 따라 바뀐다', () => {
  /* 판을 열어 둔 채 새 금액이 오면, 딱지만 바뀌고 판은 옛 값을 보여 주게 된다. */
  const fn = slice('function paintBillingTop(', 2000);
  assert.match(fn, /billBox[\s\S]{0,80}?renderBillBox\(s\)/,
    '열려 있는 판을 다시 그리지 않으면 옛 값이 남습니다.');
});
