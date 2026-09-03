'use strict';
/* 설정 카드 채우기 — 사람이 정한 값이 기계에 안 지워진다
   실행: node --test tests/payroll-card-edit.test.js · 목업 docs/mockups/payroll-card-edit.html

   ⚠ 왜 이 검사가 생겼나: 설정 카드 화면은 **읽기만** 됐다. 46곳 중 26곳이
     급여일이 빈 채였는데 화면에서 채울 데가 없어, 카드를 다시 만들어 올리는
     길밖에 없었다(개발자 PC 에서만 된다).
     채울 수 있게 하면서 **어디에 담느냐**가 진짜 문제였다 — site_cards 는
     「JSON 가져와 서버 저장」이 배열을 통째로 덮어쓰는 자리라, 거기에 적으면
     다음에 카드를 올릴 때 사람이 채운 값이 **조용히 사라진다.** */
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

/* cards = 기계가 만든 카드, edit = 사람이 채운 값. */
function box(cards, edit) {
  const store = { site_cards: cards, site_card_edit: edit || {} };
  const ctx = {
    dbGet: function (k, d) { return store[k] != null ? store[k] : d; },
    dbSet: function (k, v) { store[k] = v; },
    _store: store
  };
  vm.createContext(ctx);
  vm.runInContext([
    cut('realPayday'), cut('lmap'), cut('cardEdits'), cut('cardView'),
    cut('cardsView'), cut('paydayOf'), cut('dueDayOf')
  ].join('\n'), ctx);
  return ctx;
}

const CARD = { 사업장: '천성가축약품', 담당자: '주민정', 급여일: '미확인(사람 지정 필요)', 산정기간: '1일~말일' };

test('★ 기계가 못 찾은 급여일을 사람이 채우면 그 값이 쓰인다', () => {
  const c = box([CARD], { '천성가축약품': { 급여일: '매월 10일' } });
  assert.equal(c.paydayOf('천성가축약품'), '매월 10일');
});

test('★ 카드를 다시 올려도 사람이 채운 값은 안 지워진다', () => {
  const edit = { '천성가축약품': { 급여일: '매월 10일' } };
  /* 카드를 통째로 새로 만들어 덮어쓴 상황 — 급여일은 여전히 「미확인」이다. */
  const fresh = [{ 사업장: '천성가축약품', 담당자: '박은비', 급여일: '미확인(사람 지정 필요)' }];
  const c = box(fresh, edit);
  assert.equal(c.paydayOf('천성가축약품'), '매월 10일',
    '★ 카드를 다시 올리자 사람이 채운 급여일이 사라졌습니다');
  /* 담당자처럼 기계가 아는 값은 새것을 따른다 — 사람이 안 건드린 칸이다. */
  assert.equal(c.cardsView()[0].담당자, '박은비');
});

test('★ 비우면 비워진다 — 잘못 넣은 것을 되돌릴 길이 있다', () => {
  const c = box([{ 사업장: '천성', 급여일: '매월 5일' }], { '천성': { 급여일: '' } });
  assert.equal(c.paydayOf('천성'), '',
    '★ 「비우기」가 먹지 않으면 틀린 급여일이 명세서에 계속 찍힙니다');
});

test('빈 글자도 사람의 답이다 — 카드 값으로 되돌아가지 않는다', () => {
  const c = box([{ 사업장: '천성', 급여일: '매월 5일' }], { '천성': { 급여일: '' } });
  assert.equal(c.cardsView()[0].급여일, '');
});

test('사람이 안 건드린 칸은 카드 값을 그대로 쓴다', () => {
  const c = box([CARD], { '천성가축약품': { 급여일: '매월 10일' } });
  assert.equal(c.cardsView()[0].산정기간, '1일~말일');
});

test('★ 사람이 정한 값인지 화면이 구별할 수 있다', () => {
  const c = box([CARD], { '천성가축약품': { 급여일: '매월 10일' } });
  const v = c.cardsView()[0];
  assert.equal(v.급여일_사람, true, '★ 파란 점을 찍을 근거가 없습니다');
  assert.equal(v.산정기간_사람, false);
});

test('★ 사람이 「미확인」을 다시 적어도 명세서에 안 나간다', () => {
  const c = box([CARD], { '천성가축약품': { 급여일: '미확인 — 나중에' } });
  assert.equal(c.paydayOf('천성가축약품'), '',
    '★ 사람이 적은 「미확인」이 지급일 자리로 새 나갑니다');
});

test('편집만 있고 카드에 없는 사업장은 목록에 지어내지 않는다', () => {
  const c = box([CARD], { '없는곳': { 급여일: '매월 1일' } });
  assert.equal(c.cardsView().length, 1);
  assert.equal(c.cardsView()[0].사업장, '천성가축약품');
});

test('독촉 마감도 사람이 채운 급여일을 따른다', () => {
  const c = box([CARD], { '천성가축약품': { 급여일: '말일' } });
  const v = c.cardsView()[0];
  assert.equal(c.dueDayOf(v), 'last',
    '카드에서 채워도 수신함이 옛 값으로 남으면 독촉이 엉뚱한 날에 뜹니다');
});

/* ══════ 담는 자리가 갈려 있는가 ══════ */

test('★ 사람 값을 site_cards 가 아닌 딴 자리에 담는다', () => {
  const save = cut('saveCardEdit');
  assert.match(save, /dbSet\('site_card_edit'/,
    '★ 사람이 채운 값을 site_cards 에 적으면 카드를 다시 올릴 때 사라집니다');
  assert.equal(/dbSet\('site_cards'/.test(save), false,
    '★ 카드 원본에 덮어쓰고 있습니다');
});

test('첫 화면에서 그 자리도 함께 읽는다 — 새로고침하면 사라지지 않게', () => {
  assert.match(SRC, /ref\(ROOT\+'\/site_card_edit'\)/, '서버에서 안 읽어 옵니다');
  assert.match(SRC, /cache\.site_card_edit\s*=/, '읽어 온 것을 안 담습니다');
});

test('★ 누가 언제 정했는지 남긴다', () => {
  const save = cut('saveCardEdit');
  assert.match(save, /row\.by\s*=/, '누가 정했는지 안 남깁니다');
  assert.match(save, /row\.at\s*=/, '언제 정했는지 안 남깁니다');
});

test('★ 「비우기」 단추가 화면에 있다', () => {
  const d = cut('drawCardEdit');
  assert.match(d, /saveCardEdit\(true\)/, '★ 되돌릴 단추가 없습니다');
  assert.match(d, /saveCardEdit\(false\)/, '저장 단추가 없습니다');
});

test('빈 칸은 채우라고 보이고, 찬 칸은 고칠 수 있다', () => {
  const f = cut('cardField');
  assert.match(f, /openCardEdit/, '누를 데가 없습니다');
  assert.match(f, /채우기/, '빈 칸에 채우라는 말이 없습니다');
});

/* ⚠ esc() 는 따옴표를 «떼어 낸다». 손잡이에 이름을 심으면 「오'브라이언」이
   「오브라이언」으로 저장돼, 화면에는 안 보이는 엉뚱한 자리에 값이 들어간다.
   pu-cards.html 에서 같은 종류의 사고가 있었다. */
test('★ 손잡이에 사업장 이름을 심지 않는다 — 따옴표 든 이름이 딴 자리에 저장된다', () => {
  const f = cut('cardField');
  assert.equal(/openCardEdit\(\\?'\s*\+\s*esc/.test(f), false,
    '★ 이름을 손잡이에 심고 있습니다 — 번호로 가리키세요');
  assert.match(f, /openCardEdit\('\s*\+\s*i\s*\+\s*'/,
    '번호로 가리키지 않습니다');
});

test('★ 따옴표·꺾쇠가 든 이름도 원래 이름 그대로 집힌다', () => {
  const odd = "오'브라이언 <코리아>";
  const c = box([{ 사업장: odd, 담당자: '주민정' }], {});
  vm.runInContext(cut('openCardEdit') + '\nfunction drawCardEdit(){}\nvar cardEditOn=null;', c);
  c.openCardEdit(0, '급여일');
  assert.equal(c.cardEditOn.site, odd,
    '★ 이름이 깎여서 엉뚱한 자리에 저장됩니다');
});

/* ══════ 계산에 안 닿는다 ══════ */

test('★ 단수처리는 고치게 두지 않는다 — 지금 계산에 안 쓰이므로', () => {
  const s = cut('screenCards');
  assert.equal(/openCardEdit\([^)]*단수처리/.test(s), false,
    '★ 채워도 계산이 안 바뀌는 칸을 고치게 두면 거짓말이 됩니다');
  const save = cut('saveCardEdit');
  assert.equal(/단수처리/.test(save), false, '★ 단수처리를 담고 있습니다');
});

test('★ 사람이 채운 값이 계산 규칙(policyFor)으로 새지 않는다', () => {
  const p = cut('policyFor');
  assert.equal(/site_card_edit|cardEdits|cardView/.test(p), false,
    '★ 급여일 채우기가 연차·수당 반올림까지 바꾸고 있습니다 — 대표 판단이 먼저입니다');
});
