'use strict';
/* 메일을 담당자 칸으로 저절로 (대표 승낙 2026-08-21) — 실행: node --test tests/*.test.js

   여태: 메일로 온 자료는 **공용 칸**(paydata/pending_shared)에 쌓이고, 누군가
   「메일로 온 것」 화면에서 「내가 맡기」를 눌러야 자기 대기 칸으로 내려왔다.
   아무도 안 누르면 영영 그대로였다. 화면에는 이미 누가 맡을 사람인지(업체관리
   주담당) 적혀 있었는데, 그리로 **보내주지는** 않았다.

   이제: 보낸 주소 → 업체 → 그 업체 주담당 → **그 사람 대기 칸에 바로** 넣는다.
   ⚠ 못 찾으면(업체를 모르거나 주담당이 아직 이 함에 안 들어온 사람) 지금처럼
   공용 칸에 남긴다 — 자료가 사이로 사라지는 일은 없어야 한다(대표 결정). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MR = require(path.join(__dirname, '..', 'functions', 'mail-receive.js'));

/* 업체관리가 실제로 쓰는 모양 — {v: 목록} 이고 목록은 배열이거나 번호 맵이다 */
const COMPANIES = {
  v: [
    { id: 'co_1', name: '텃골영농조합법인(용인)', email: 'texas@daum.net',
      typeCode: '급여', status: 'active', managerMain: 'p-001', managerSubs: [] },
    { id: 'co_2', name: '팔천식품', email: 'palchun@naver.com',
      typeCode: '급여', status: 'active', managerMain: 'p-002', managerSubs: ['p-001'] },
    { id: 'co_3', name: '㈜주원테크', email: 'juwon@gmail.com',
      typeCode: '급여', status: 'active', managerMain: 'p-009', managerSubs: [] },
    { id: 'co_4', name: '담당없는곳', email: 'noman@daum.net',
      typeCode: '급여', status: 'active', managerMain: '', managerSubs: [] }
  ]
};
/* paydata/owners — 한 번이라도 급여데이터함에 들어온 사람만 있다.
   p-009(박한별)은 아직 안 들어왔다 → 자리가 없다. */
const OWNERS = {
  U1: { name: '최기운', email: 'p001@pureun.kr' },
  U2: { name: '신욱임', email: 'p002@pureun.kr' }
};

/* ══════ 주소 → 업체 ══════ */

test('★ 보낸 주소로 업체를 찾는다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  assert.equal(MR.companyFor('texas@daum.net', idx).id, 'co_1');
  assert.equal(MR.companyFor('PALCHUN@NAVER.COM', idx).id, 'co_2', '대소문자로 어긋나면 안 됩니다');
});

test('메일 머리글 꼴(이름 <주소>)로도 찾는다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  assert.equal(MR.companyFor('텃골 담당자 <texas@daum.net>', idx).id, 'co_1');
});

test('모르는 주소는 못 찾는다고 한다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  assert.equal(MR.companyFor('unknown@daum.net', idx), null);
  assert.equal(MR.companyFor('', idx), null);
});

test('업체 목록이 번호 맵이어도 읽는다', () => {
  // 푸른이알피는 배열일 때도 {키:값} 일 때도 있다
  const idx = MR.buildCompanyIndex({ v: { a: COMPANIES.v[0], b: COMPANIES.v[1] } });
  assert.equal(MR.companyFor('texas@daum.net', idx).id, 'co_1');
});

test('자료가 없어도 터지지 않는다', () => {
  assert.equal(MR.companyFor('a@b.com', MR.buildCompanyIndex(null)), null);
});

/* ══════ 업체 → 사람 자리 ══════ */

test('★ 주담당의 자리(uid)를 찾는다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const co = MR.companyFor('texas@daum.net', idx);
  assert.equal(MR.seatFor(co, OWNERS), 'U1');
});

test('★ 아직 급여데이터함에 안 들어온 담당자는 자리가 없다 — 공용 칸으로 남긴다', () => {
  /* 그 사람 자리에 넣으면 아무도 못 본다(그 자리는 아직 아무도 안 연다).
     공용 칸에 남겨 두면 전원에게 보이고 아무나 맡는다. */
  const idx = MR.buildCompanyIndex(COMPANIES);
  const co = MR.companyFor('juwon@gmail.com', idx);
  assert.equal(MR.seatFor(co, OWNERS), '');
});

test('★ 주담당이 안 적힌 업체도 자리가 없다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const co = MR.companyFor('noman@daum.net', idx);
  assert.equal(MR.seatFor(co, OWNERS), '');
});

test('부담당 자리로 보내지 않는다 — 주담당 한 사람만', () => {
  // 둘에게 다 보내면 같은 자료가 두 벌 되고, 부담당에게만 보내면 주담당이 모른다
  const idx = MR.buildCompanyIndex(COMPANIES);
  const co = MR.companyFor('palchun@naver.com', idx);
  assert.equal(MR.seatFor(co, OWNERS), 'U2');
});

test('업체를 못 찾았으면 자리도 없다', () => {
  assert.equal(MR.seatFor(null, OWNERS), '');
});

/* ══════ 이름표 짐작 — 사업장·귀속월·종류 ══════ */

test('★ 주소로 찾은 사업장이 채워진다 — 파일 이름을 못 알아봐도', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const t = MR.tagFor({ filename: 'IMG_2841.jpg', subject: '' },
    MR.companyFor('palchun@naver.com', idx));
  assert.equal(t.companyId, 'co_2');
  assert.equal(t.companyName, '팔천식품');
  assert.equal(t.month, '', '알 수 없는 달을 억지로 채우면 안 됩니다');
  assert.equal(t.kind, '', '알 수 없는 종류를 억지로 채우면 안 됩니다');
});

test('★ 파일 이름에서 귀속월과 종류를 읽는다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const t = MR.tagFor({ filename: '2026년 8월 근태표.xlsx', subject: '' },
    MR.companyFor('texas@daum.net', idx));
  assert.equal(t.month, '2026-08');
  assert.equal(t.kind, 'attend');
});

test('★ 메일 제목에서도 읽는다 — 파일 이름이 밋밋할 때', () => {
  /* 고객사는 「8월 급여자료 보냅니다」로 제목을 쓰고 파일은 scan001.pdf 로 보낸다.
     제목을 안 읽으면 세 칸이 다 빈칸이 된다. */
  const idx = MR.buildCompanyIndex(COMPANIES);
  const t = MR.tagFor({ filename: 'scan001.pdf', subject: '2026-08 급여대장 보냅니다' },
    MR.companyFor('texas@daum.net', idx));
  assert.equal(t.month, '2026-08');
  assert.equal(t.kind, 'ledger');
});

test('종류 낱말을 급여데이터함과 같게 가른다', () => {
  const g = (fn) => MR.tagFor({ filename: fn, subject: '' }, null).kind;
  assert.equal(g('근로계약서.pdf'), 'contract');
  assert.equal(g('출근부.xlsx'), 'attend');
  assert.equal(g('임금대장.xlsx'), 'ledger');
  assert.equal(g('급여명세서.pdf'), 'output');
  assert.equal(g('그냥파일.zip'), '');
});

test('12월을 넘는 수는 달로 안 읽는다', () => {
  assert.equal(MR.tagFor({ filename: '2026-13 자료.pdf', subject: '' }, null).month, '');
});

test('짧은 연도 꼴도 읽는다', () => {
  assert.equal(MR.tagFor({ filename: '25년 07월 근태.xlsx', subject: '' }, null).month, '2025-07');
});

/* ══════ 어디에 넣을지 ══════ */

test('★ 임자를 찾으면 그 사람 대기 칸 자리를 알려 준다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const r = MR.routeFor({ from: 'texas@daum.net', filename: '2026년 8월 근태표.xlsx', subject: '' },
    idx, OWNERS);
  assert.equal(r.seat, 'U1');
  assert.equal(r.shared, false);
  assert.equal(r.tag.companyId, 'co_1');
  assert.equal(r.tag.kind, 'attend');
  assert.equal(r.why, '');
});

test('★ 업체를 못 찾으면 공용 칸으로 보내고 까닭을 남긴다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const r = MR.routeFor({ from: 'unknown@daum.net', filename: 'a.pdf', subject: '' }, idx, OWNERS);
  assert.equal(r.shared, true);
  assert.equal(r.seat, '');
  // 까닭이 없으면 관리자가 왜 안 갈렸는지 알 수 없다
  assert.match(r.why, /업체/);
});

test('★ 담당자가 아직 안 들어왔으면 공용 칸으로 보내고 그렇다고 적는다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const r = MR.routeFor({ from: 'juwon@gmail.com', filename: 'a.pdf', subject: '' }, idx, OWNERS);
  assert.equal(r.shared, true);
  assert.match(r.why, /들어온|접속/);
  // 업체는 알았으니 그것만이라도 넘겨 준다 — 맡는 사람이 다시 고를 일이 없다
  assert.equal(r.tag.companyId, 'co_3');
});

test('★ 공용 칸으로 가도 알아낸 이름표는 함께 넘긴다', () => {
  const idx = MR.buildCompanyIndex(COMPANIES);
  const r = MR.routeFor({ from: 'noman@daum.net', filename: '2026-08 근태.xlsx', subject: '' },
    idx, OWNERS);
  assert.equal(r.shared, true);
  assert.equal(r.tag.month, '2026-08');
  assert.equal(r.tag.kind, 'attend');
});

/* ══════ 넣을 줄의 모양 ══════ */

test('★ 담당자 칸에 넣는 줄에 이름표가 채워져 있다', () => {
  const rec = MR.pendingRecordFor({
    filename: '근태.xlsx', file: 'pu_paydata/x/pending/m1.xlsx', mime: '', bytes: 10, at: 5,
    mailFrom: 'texas@daum.net', mailSubject: '8월 자료',
    tag: { companyId: 'co_1', companyName: '텃골', month: '2026-08', kind: 'attend' }
  });
  assert.equal(rec.companyId, 'co_1');
  assert.equal(rec.month, '2026-08');
  assert.equal(rec.kind, 'attend');
  assert.equal(rec.from, 'mail');
  assert.equal(rec.by, '', '서버가 담았다 — 사람이 담은 것으로 적으면 안 됩니다');
});

test('★ 서버가 보냈다는 표시가 남는다 — 사람이 맡은 것과 갈라 봐야 한다', () => {
  const rec = MR.pendingRecordFor({ filename: 'a.pdf', at: 1, mailFrom: 'x@y.com',
    tag: { companyId: 'co_1', companyName: '텃골', month: '', kind: '' } });
  assert.equal(rec.routed, true);
});

test('보낸이·제목이 그대로 남는다 — 나중에 누가 보냈는지 물을 수 있다', () => {
  const rec = MR.pendingRecordFor({ filename: 'a.pdf', at: 1,
    mailFrom: 'texas@daum.net', mailSubject: '8월 자료', tag: {} });
  assert.match(rec.note, /texas@daum\.net/);
  assert.match(rec.note, /8월 자료/);
});

test('이름표를 안 주면 빈칸으로 둔다 — 없는 값을 만들지 않는다', () => {
  const rec = MR.pendingRecordFor({ filename: 'a.pdf', at: 1, mailFrom: 'x@y.com' });
  assert.equal(rec.companyId, '');
  assert.equal(rec.month, '');
  assert.equal(rec.kind, '');
});

/* ══════ 공용 칸 줄에 까닭 ══════ */

test('★ 공용 칸 줄에 왜 못 갈랐는지 적는다', () => {
  const rec = MR.sharedPendingRecord({ filename: 'a.pdf', at: 1, mailFrom: 'x@y.com',
    why: '업체관리에 없는 주소', tag: { companyId: 'co_3', companyName: '㈜주원테크' } });
  assert.equal(rec.why, '업체관리에 없는 주소');
  assert.equal(rec.companyId, 'co_3', '알아낸 업체는 넘겨야 다시 고를 일이 없습니다');
});

test('예전처럼 까닭·이름표 없이 불러도 터지지 않는다', () => {
  const rec = MR.sharedPendingRecord({ filename: 'a.pdf', at: 1, mailFrom: 'x@y.com' });
  assert.equal(rec.companyId, '');
  assert.equal(rec.why, '');
});
