'use strict';
/* 담당자별 다음메일 폴더 (대표 결정 2026-08-23) — 실행: node --test tests/*.test.js

   왜 필요한가: 지금은 **업체관리 담당만 보고** 갈라 보낸다. 그래서 주소가 등록 안 된
   곳이나 담당을 바꿔야 할 건을 **사람이 바로잡을 길이 없다.**
   다음메일에 「급여-최기운」 같은 폴더를 만들어 메일을 옮기면 그 사람에게 간다 —
   손으로 정하는 수단이 생긴다.

   차례: **폴더가 사람을 가리키면 그것이 이긴다** > 업체관리 자동 배정.
   사람이 손으로 옮긴 것이 자동보다 뒤로 밀리면 옮긴 뜻이 없다.

   ⚠ 폴더는 **필요한 사람만** 만들면 된다. 자동으로 잘 가는 사람은 안 만들어도 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MR = require(path.join(R, 'functions', 'mail-receive.js'));
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* 급여 업체 셋 — 주담당이 각각 다르다 */
const COMPANIES = {
  v: [
    { id: 'c1', name: '화담원', email: 'hr@hwadam.kr',
      typeCode: '급여', status: 'active', managerMain: 'p-001', managerSubs: [] },
    { id: 'c2', name: '팔천식품', email: 'acct@palchun.kr',
      typeCode: '급여', status: 'active', managerMain: 'p-002', managerSubs: [] }
  ]
};
const OWNERS = {
  U1: { name: '최기운', email: 'p001@pureun.kr' },
  U2: { name: '신욱임', email: 'p002@pureun.kr' }
};

/* ══════ 폴더 이름에서 사람 찾기 ══════ */

test('★ 폴더 이름에 든 사람 이름으로 자리를 찾는다', () => {
  assert.equal(MR.seatFromBox('급여-최기운', OWNERS), 'U1');
  assert.equal(MR.seatFromBox('2.급여+사무대행/신욱임', OWNERS), 'U2');
});

test('★ 사람 이름이 없는 폴더면 빈 값이다 — 자동 배정에 맡긴다', () => {
  assert.equal(MR.seatFromBox('2.급여+사무대행', OWNERS), '');
  assert.equal(MR.seatFromBox('INBOX', OWNERS), '');
  assert.equal(MR.seatFromBox('', OWNERS), '');
  assert.equal(MR.seatFromBox(null, OWNERS), '');
});

test('사번으로 적어도 찾는다 — 이름이 겹칠 때 쓸 수 있어야 한다', () => {
  assert.equal(MR.seatFromBox('급여-p-001', OWNERS), 'U1');
  assert.equal(MR.seatFromBox('급여-P001', OWNERS), 'U1');
});

test('★ 이름이 두 사람과 걸리면 아무도 안 고른다 — 잘못 보내면 못 찾는다', () => {
  /* 「급여-최기운신욱임」처럼 둘 다 든 폴더는 사람이 실수한 것이다.
     한쪽을 골라 보내면 나머지 사람은 그 자료가 어디 갔는지 모른다. */
  assert.equal(MR.seatFromBox('급여-최기운신욱임', OWNERS), '');
});

test('명단이 없으면 빈 값이다', () => {
  assert.equal(MR.seatFromBox('급여-최기운', null), '');
  assert.equal(MR.seatFromBox('급여-최기운', {}), '');
});

/* ══════ 차례 — 폴더가 이긴다 ══════ */

test('★ 폴더가 사람을 가리키면 업체관리 담당을 이긴다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  /* 화담원(주담당 최기운=U1)에서 온 메일인데 신욱임 폴더에 있다 →
     사람이 손으로 옮긴 것이니 신욱임(U2)에게 간다. */
  const r = MR.routeFor({ from: 'hr@hwadam.kr', filename: 'a.xlsx', subject: '' },
    idx, OWNERS, '급여-신욱임');
  assert.equal(r.seat, 'U2');
  assert.equal(r.shared, false);
  assert.equal(r.byBox, true, '폴더로 정해진 것임을 알려야 합니다');
  // 업체는 그대로 알아낸다 — 사업장·월·종류는 채워져야 한다
  assert.equal(r.tag.companyId, 'c1');
});

test('★ 폴더에 사람이 없으면 업체관리 담당으로 간다 (지금까지와 같다)', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const r = MR.routeFor({ from: 'hr@hwadam.kr', filename: 'a.xlsx', subject: '' },
    idx, OWNERS, '2.급여+사무대행');
  assert.equal(r.seat, 'U1');
  assert.equal(r.byBox, false);
});

test('★ 업체를 몰라도 폴더로 사람이 정해지면 그 사람에게 간다', () => {
  /* 이것이 폴더를 만드는 가장 큰 값이다 — 업체관리에 주소가 없어도 사람이',
     폴더로 옮기면 자료가 임자에게 간다. */
  const idx = MR.buildCompanyIndex(COMPANIES);
  const r = MR.routeFor({ from: 'nobody@nowhere.kr', filename: 'a.xlsx', subject: '' },
    idx, OWNERS, '급여-최기운');
  assert.equal(r.seat, 'U1');
  assert.equal(r.shared, false);
  assert.equal(r.tag.companyId, '', '업체는 모르는 것이 맞다 — 사람이 고른다');
});

test('폴더를 안 주면 예전과 똑같이 돈다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const r = MR.routeFor({ from: 'acct@palchun.kr', filename: 'a.xlsx', subject: '' }, idx, OWNERS);
  assert.equal(r.seat, 'U2');
  assert.equal(r.byBox, false);
});

/* ══════ 서버 배선 ══════ */

test('★ 서버가 그 메일이 있던 폴더를 함께 넘긴다', () => {
  const i = FN.indexOf('async function payMailStoreOne');
  const body = FN.slice(i, i + 1800);
  assert.match(body, /routeFor\(/);
  assert.match(body, /mail\.box/, '어느 폴더에서 온 것인지 안 넘깁니다');
});

test('★ 본문 줄도 폴더를 함께 넘긴다 — 첨부와 같은 길이어야 한다', () => {
  const i = FN.indexOf('async function payMailStoreBody');
  const body = FN.slice(i, i + 1800);
  assert.match(body, /mail\.box/, '본문 줄만 폴더를 안 봅니다');
});

test('★ 폴더는 볼 목록에 든다 — 하위 폴더를 만들어도 서버가 본다', () => {
  /* 「급여-최기운」·「2.급여+사무대행/최기운」 둘 다 이름에 「급여」가 들어
     pickMailboxes 가 고른다. 안 그러면 폴더를 만들어도 서버가 안 본다. */
  const boxes = [
    { path: 'INBOX', name: 'INBOX' },
    { path: '급여-최기운', name: '급여-최기운' },
    { path: '2.급여+사무대행', name: '2.급여+사무대행' }
  ];
  const got = MR.pickMailboxes(boxes, {});
  assert.ok(got.indexOf('급여-최기운') >= 0, '사람 폴더를 안 봅니다');
  assert.ok(got.indexOf('2.급여+사무대행') >= 0);
});
