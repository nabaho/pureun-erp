'use strict';
/* 담당자 연락처가 둘 이상일 때 — 규칙 (js/pu-contact.js)   2026-09-08

   대표 지시: 「담당자 핸드폰 번호나 명함이 2개씩 있는 경우가 가끔 있다 …
   어느 것이 메인인지 체크 표시가 필요한데」 · 「기업정보함도 연락처와 이메일
   두 개와 선택이 동기화 되어 연결되도록 해라」

   ■ 이 검사가 지키는 것
     ① 메인은 «자리»다 — phone·email 이 늘 메인. 체크 플래그를 쓰지 않는다
     ② ★ 는 «맞바꿈»이다 — 값을 하나도 잃지 않는다
     ③ 겹친 값은 하나로 본다 (010-1111-2222 = 01011112222 · 대소문자 다른 이메일)
     ④ 메인 자리가 비면 곁칸 첫 값이 올라온다 — «메인 없는 사람»을 안 만든다
     ⑤ 명함에서 온 값은 «덮지 않고» 곁칸에 붙는다 — 사람이 골라 둔 메인을 안 바꾼다
     ⑥ 값이 하나인 사람은 곁칸 칸 자체가 «안 생긴다» (191명 중 대부분)
     ⑦ 기업정보함 색인과 오간다 (m/e ↔ mm/em) */

const assert = require('assert');
const { test } = require('node:test');
const path = require('path');
const P = require(path.join(__dirname, '..', 'js', 'pu-contact.js'));

test('① 값이 하나면 지금과 «한 글자도» 다르지 않다 — 곁칸이 안 생긴다', function () {
  const one = P.apply({ name: '박지윤' }, 'phone', [{ v: '010-1200-0001' }]);
  assert.equal(one.phone, '010-1200-0001');
  assert.ok(!('phoneMore' in one), '★ 값이 하나인데 곁칸 칸을 만들고 있습니다');
  assert.ok(!('phoneLabel' in one), '이름표가 없으면 칸도 없어야 합니다');
  assert.equal(one.name, '박지윤', '다른 칸을 건드리지 않습니다');
});

test('② 메인은 «자리»다 — 첫 줄이 곧 phone', function () {
  const r = P.apply({}, 'phone', [{ v: '010-1111-2222', label: '업무' }, { v: '010-3333-4444', label: '개인' }]);
  assert.equal(r.phone, '010-1111-2222');
  assert.equal(r.phoneLabel, '업무');
  assert.deepEqual(JSON.parse(JSON.stringify(r.phoneMore)), [{ v: '010-3333-4444', label: '개인' }]);
  /* 「어느 것이 메인인가」를 따로 적지 않는다 — 그래야 어긋날 수가 없다 */
  assert.ok(!JSON.stringify(r).includes('primary'), '★ 메인을 플래그로 적고 있습니다');
});

test('③ ★ 는 맞바꿈이다 — 값을 하나도 안 잃는다', function () {
  const a = { phone: '010-1111-2222', phoneLabel: '업무', phoneMore: [{ v: '010-3333-4444', label: '개인' }] };
  const b = P.promote(a, 'phone', 1);
  assert.equal(b.phone, '010-3333-4444', '★ 고른 값이 메인이 안 됐습니다');
  assert.equal(b.phoneLabel, '개인', '이름표도 함께 올라와야 합니다');
  assert.deepEqual(JSON.parse(JSON.stringify(b.phoneMore)), [{ v: '010-1111-2222', label: '업무' }],
    '★ 원래 메인이 사라졌습니다');
  /* 두 번 누르면 제자리 — 되돌리기가 같은 동작이다 */
  const c = P.promote(b, 'phone', 1);
  assert.equal(c.phone, a.phone);
  assert.equal(c.phoneLabel, a.phoneLabel);
});

test('④ 겹친 값은 하나로 본다 — 꼴이 달라도', function () {
  const r = P.apply({}, 'phone', [{ v: '010-1111-2222' }, { v: '01011112222' }, { v: '010-3333-4444' }]);
  assert.equal(P.values(r, 'phone').length, 2, '★ 같은 번호가 두 줄로 남았습니다');
  const e = P.apply({}, 'email', [{ v: 'A@B.com' }, { v: 'a@b.com' }]);
  assert.equal(P.values(e, 'email').length, 1, '★ 대소문자만 다른 이메일이 두 줄입니다');
  /* ★ 숫자가 없는 값끼리는 글자로 견준다 — 「내선」과 「미정」이 같아지면 안 된다.
     숫자만 뽑아 견주면 둘 다 빈 글자가 되어 둘째가 말없이 사라졌다(2026-09-08). */
  const t = P.apply({}, 'phone', [{ v: '내선' }, { v: '미정' }]);
  assert.equal(P.values(t, 'phone').length, 2, '★ 숫자 없는 값 둘을 같다고 보고 있습니다');
  assert.equal(P.values(P.apply({}, 'phone', [{ v: '내선' }, { v: '내선' }]), 'phone').length, 1,
    '똑같은 글자는 하나로 봅니다');
});

test('⑤ 메인 자리가 비면 곁칸 첫 값이 올라온다 — 메인 없는 사람을 안 만든다', function () {
  const r = { phone: '', phoneMore: [{ v: '010-9999-0000' }] };
  const v = P.values(r, 'phone');
  assert.equal(v.length, 1);
  assert.equal(v[0].v, '010-9999-0000');
  assert.equal(v[0].main, true, '★ 아무도 메인이 아닙니다');
  assert.equal(P.normalize(r).phone, '010-9999-0000', '★ 저장할 때 메인 칸이 비어 있습니다');
});

test('⑥ 명함에서 온 값은 «덮지 않고» 붙는다 — 골라 둔 메인이 안 바뀐다', function () {
  const a = { phone: '010-1111-2222' };
  const b = P.mergeIn(a, 'phone', '010-3333-4444', '명함');
  assert.equal(b.phone, '010-1111-2222', '★ 명함이 메인을 덮었습니다');
  assert.equal(P.values(b, 'phone').length, 2);
  /* 같은 번호가 또 오면 줄이 안 는다 */
  assert.equal(P.values(P.mergeIn(b, 'phone', '01011112222'), 'phone').length, 2);
  /* 비어 있던 사람에게는 그것이 메인이 된다 */
  assert.equal(P.mergeIn({}, 'phone', '010-5555-6666').phone, '010-5555-6666');
});

test('⑦ 기업정보함 색인과 오간다 (m/e ↔ mm/em)', function () {
  const rec = { phone: '010-1111-2222', phoneMore: [{ v: '010-3333-4444', label: '개인' }],
                email: 'a@b.com', emailMore: [{ v: 'c@d.com' }] };
  /* 색인으로 — 이름표가 없으면 «글자 하나»로 짧게 담는다(색인은 수천 줄이다) */
  assert.deepEqual(JSON.parse(JSON.stringify(P.moreToCard(rec, 'phone'))), [{ v: '010-3333-4444', l: '개인' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(P.moreToCard(rec, 'email'))), ['c@d.com']);
  /* 색인에서 — 두 꼴을 모두 읽는다 */
  assert.deepEqual(JSON.parse(JSON.stringify(P.cardToMore({ mm: [{ v: '010-7777-8888', l: '집' }] }, 'phone'))),
    [{ v: '010-7777-8888', label: '집' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(P.cardToMore({ em: ['x@y.com'] }, 'email'))),
    [{ v: 'x@y.com', label: '' }]);
  assert.deepEqual(P.cardToMore({}, 'phone'), [], '없으면 빈 목록');
});

test('⑧ 한 사람의 값 수에 끝이 있다 — 붙여넣기 사고로 화면이 안 무너진다', function () {
  const many = []; for (let i = 0; i < 40; i++) many.push({ v: '010-0000-' + (1000 + i) });
  const r = P.apply({}, 'phone', many);
  /* ⚠ values() 로만 세면 안 된다 — 그쪽도 잘라 내므로 «저장되는 값»이 넘쳐도 통과한다.
     되돌림 검사에서 실제로 빠져나갔다. 저장된 칸을 직접 센다. */
  assert.equal((r.phoneMore || []).length, P.MAX - 1,
    '★ 저장되는 곁칸이 ' + (r.phoneMore || []).length + '개입니다 — 끝이 없습니다');
  assert.equal(P.values(r, 'phone').length, P.MAX);
  assert.ok(P.MAX >= 3 && P.MAX <= 10, '끝은 있되 너무 좁지 않아야 합니다');
});

test('⑨ 빈 값·이상한 값에도 안 터진다', function () {
  assert.deepEqual(P.values(null, 'phone'), []);
  assert.deepEqual(P.values({}, 'phone'), []);
  assert.deepEqual(P.values({ phone: '  ' }, 'phone'), []);
  assert.deepEqual(P.values({ phone: 'x', phoneMore: 'not-an-array' }, 'phone').map(x => x.v), ['x']);
  assert.deepEqual(P.values({ phone: 'a' }, 'fax'), [], '모르는 종류는 빈 목록');
  assert.equal(P.promote({}, 'phone', 5).phone, undefined);
  assert.equal(P.remove({ phone: 'a' }, 'phone', 9).phone, 'a', '없는 줄을 지워도 그대로');
});

test('⑩ 지우기 — 메인을 지우면 다음이 올라온다', function () {
  const a = { phone: '010-1111-2222', phoneMore: [{ v: '010-3333-4444' }] };
  const b = P.remove(a, 'phone', 0);
  assert.equal(b.phone, '010-3333-4444');
  assert.ok(!('phoneMore' in b), '★ 하나만 남았는데 곁칸이 남아 있습니다');
});
