/* 명함첩 — 종료·해지된 거래처 배지 문구.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-11: "사업자 등록증에 담당 아래에 퇴사가 아닌 계약해지로 표시해달라."

   이 배지는 **업체**의 상태(업체관리에서 종료·해지·폐업)를 말한다. 그런데 명함 줄에
   「퇴사」라고 적으면 **그 사람이 회사를 나간 것**으로 읽힌다 — 전혀 다른 말이다.
   대표가 쓰는 말(폴더 이름도 「계약해지」)에 맞춘다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('종료·해지 거래처 배지는 「계약해지」로 적는다', () => {
  assert.match(app, />🚪 계약해지</, '배지 문구가 「계약해지」가 아닙니다');
  assert.ok(!/>🚪 퇴사</.test(app), '「퇴사」 배지가 남아 있습니다 — 사람이 나간 것으로 읽힙니다');
});

test('배지 설명에 무엇을 보고 붙인 것인지 남긴다', () => {
  /* 「계약해지」만 적으면 폐업한 업체도 해지로 읽힌다 — 설명에 셋을 다 적어 둔다. */
  const i = app.indexOf('🚪 계약해지');
  const around = app.slice(Math.max(0, i - 400), i);
  assert.match(around, /종료·해지·폐업/, '무엇을 보고 붙인 배지인지 설명이 없습니다');
});

test('「업체퇴사」 폴더 이름은 건드리지 않는다', () => {
  /* ⚠ 이 이름으로 만들어진 폴더가 이미 실제로 있고 그 안에 명함이 들어 있다.
     코드에서 이름을 바꾸면 앱이 없는 폴더를 찾아 **새 빈 폴더를 만들고**,
     기존 폴더의 명함은 주인 없이 남는다. 배지 문구만 바꾸는 것과 다른 일이다. */
  assert.match(app, /'업체퇴사'/, '폴더 이름이 바뀌었습니다 — 기존 폴더의 명함이 떨어집니다');
});
