'use strict';
/* 명세서 지급일 — 「모르는 것」을 글자로 찍지 않는다
   실행: node --test tests/payroll-payday-unknown.test.js

   ⚠ 왜 이 검사가 생겼나: 설정카드 생성기가 급여일을 못 찾은 곳에
     「미확인(사람 지정 필요)」이라는 **글자**를 넣는다(46곳 중 26곳).
     사람 보라고 넣은 표시인데 글자라서 `if(c.급여일)` 을 그냥 통과했다.
     그대로 올렸으면 그 26곳 임금명세서의 **지급일 자리에 그 문구가 찍혀
     근로자에게 나갔다** — 근로기준법 제48조제2항 필수 기재란이다.
     빈칸이면 화면이 '-' 로 보여 주므로, 모르면 비우는 것이 맞다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'payroll-os.html'), 'utf8');

function cut(name) {
  const m = SRC.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* 카드 목록을 갈아 끼우며 부를 수 있게, dbGet 만 가짜로 준다.
   ⚠ paydayOf 는 사람이 채운 값을 겹쳐 보므로(cardsView) 그 길도 함께 싣는다 —
     안 실으면 여기서만 터지고, 실제 화면과 다른 것을 재게 된다.
     사람이 채운 값 자체는 tests/payroll-card-edit.test.js 가 본다. */
function box(cards) {
  const store = { site_cards: cards, site_card_edit: {} };
  const ctx = { cards: cards, dbGet: function (k, d) { return store[k] != null ? store[k] : d; } };
  vm.createContext(ctx);
  vm.runInContext([
    cut('realPayday'), cut('lmap'), cut('cardEdits'), cut('cardView'),
    cut('cardsView'), cut('paydayOf'), cut('dueDayOf')
  ].join('\n'), ctx);
  return ctx;
}

test('★ 급여일을 모르는 곳은 지급일이 빈칸이다 — 「미확인」 글자가 안 찍힌다', () => {
  const c = box([{ 사업장: '천성', 급여일: '미확인(사람 지정 필요)' }]);
  const got = c.paydayOf('천성');
  assert.equal(got, '',
    '★ 지급일 자리에 「' + got + '」 가 찍힙니다 — 명세서로 근로자에게 나갑니다');
});

test('아는 급여일은 그대로 쓴다', () => {
  const c = box([{ 사업장: '화담원 서산점', 급여일: '매월 10일' }]);
  assert.equal(c.paydayOf('화담원 서산점'), '매월 10일');
});

test('말일도 살아 있다 — 「미확인」만 걸러야지 다 걸러선 안 된다', () => {
  const c = box([{ 사업장: '늘봄반찬 3곳', 급여일: '말일' }]);
  assert.equal(c.paydayOf('늘봄반찬 3곳'), '말일');
  assert.equal(c.dueDayOf({ 급여일: '말일' }), 'last');
});

test('★ 「미확인」에서 날짜 숫자를 주워 오지 않는다', () => {
  const c = box([]);
  assert.equal(c.dueDayOf({ 급여일: '미확인(사람 지정 필요)' }), null,
    '★ 안 정해진 급여일에서 마감일을 지어냈습니다');
  /* 글자에 숫자가 섞여도 마찬가지다 — 생성기 문구가 언제 바뀔지 모른다. */
  assert.equal(c.dueDayOf({ 급여일: '미확인 25일치 확인요' }), null,
    '★ 「미확인」 이 붙었는데도 숫자를 집었습니다');
});

test('카드가 아예 없어도 터지지 않는다 — 빈칸이면 화면이 - 로 보여 준다', () => {
  const c = box([]);
  assert.equal(c.paydayOf('아무곳'), '');
});

/* 값이 갈리면 «하나로 못 정한다» — 옛 규칙을 그대로 지킨다.
   「미확인」을 걸러 낸 탓에 남은 하나가 뽑히는 일도 있어선 안 된다... 가 아니라,
   오히려 그것이 맞다: 안 정해진 것은 값이 아니므로 세지 않는다. */
test('아는 값 하나 + 모르는 값이면, 아는 값을 쓴다', () => {
  const c = box([
    { 사업장: '천성', 급여일: '매월 15일' },
    { 사업장: '천성가축약품', 급여일: '미확인(사람 지정 필요)' }
  ]);
  /* 「천성」은 「천성가축약품」에 부분일치로 둘 다 걸린다(paydayOf 의 옛 규칙).
     모르는 쪽은 안 세므로 아는 값 하나가 남는다. */
  assert.equal(c.paydayOf('천성'), '매월 15일');
});

test('아는 값이 둘로 갈리면 못 정한다고 본다', () => {
  const c = box([
    { 사업장: '천성', 급여일: '매월 15일' },
    { 사업장: '천성가축약품', 급여일: '매월 25일' }
  ]);
  assert.equal(c.paydayOf('천성'), '',
    '값이 갈리는데 하나를 골라 찍으면 절반은 틀린 명세서가 됩니다');
});
