'use strict';
/* 사업장 하나로 오간 것을 한 줄기로 (대표 목표 2026-08-30)
   실행: node --test tests/*.test.js

   대표: 「푸른메일함에 직원의 거래처와 관련된 사업장의 메일을 동기화해서 연결…
         추후에 그 사업장과 관련된 카카오톡과 문자 등의 정보도 당겨오게」

   ⚠ 갈래(source)를 **밖에서 넣는다.** 문자·카톡이 생기면 갈래 한 줄만 더하면
     되고 화면은 안 고친다 — 화면이 갈래마다 갈라져 있으면 갈래가 늘 때마다
     화면을 고치게 된다.
   ⚠ 사본을 만들지 않는다. 있는 자리를 읽어 한 줄기로 세울 뿐이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require(path.join(__dirname, '..', 'js', 'pu-co-thread.js'));
const T = globalThis.PuCoThread;

const CO = {
  id: 'c1', name: '㈜정일제지',
  contacts: [{ name: '임남용', email: 'cust12@naver.com', isPrimary: true }],
  taxEmail: 'cust01@hanmail.net'
};

/* ══════ 어느 사업장 것인가 ══════ */

test('★ 줄에 사업장 번호가 적혀 있으면 그것이 가장 확실하다', () => {
  assert.equal(T.matchRow({ companyId: 'c1' }, CO, {}), 'id');
});

test('★ 오간 주소가 그 사업장 주소면 그 사업장 것이다', () => {
  const a = T.addrsOf(CO);
  assert.equal(T.matchRow({ from: '임남용 <cust12@naver.com>' }, CO, a), 'addr');
  assert.equal(T.matchRow({ to: 'CUST12@NAVER.COM' }, CO, a), 'addr');
});

test('★ 세무사무실 주소도 그 사업장 것으로 본다', () => {
  assert.equal(T.matchRow({ from: 'cust01@hanmail.net' }, CO, T.addrsOf(CO)), 'addr');
});

test('★ 제목에 이름이 있으면 짐작으로 본다 — 짐작이라고 적어 둔다', () => {
  assert.equal(T.matchRow({ subject: '주식회사 정일제지 8월 급여' }, CO, {}), 'text');
});

test('★ 짧은 이름은 제목으로 안 찾는다 — 아무 데나 걸린다', () => {
  const co = { id: 'x', name: '두끼' };
  assert.equal(T.matchRow({ subject: '두끼 자료' }, co, {}), '');
});

test('아무것도 안 맞으면 빈손', () => {
  assert.equal(T.matchRow({ from: 'nobody@x.kr', subject: '안녕' }, CO, T.addrsOf(CO)), '');
  assert.equal(T.matchRow(null, CO, {}), '');
  assert.equal(T.matchRow({}, null, {}), '');
});

/* ══════ 한 줄기 ══════ */

const MAILLOG = {
  m1: { at: 3000, from: '임남용 <cust12@naver.com>', subject: '8월 급여자료',
    preview: '보내드립니다', companyId: 'c1', atts: 2, took: 2, seatName: '신욱임' },
  m2: { at: 1000, from: 'nobody@x.kr', subject: '광고입니다', preview: '', companyId: '' },
  m3: { at: 5000, from: 'x@y.kr', subject: '정일제지 퇴직금 문의', preview: '문의드립니다' }
};
const SENT = {
  s1: { at: 4000, to: 'cust12@naver.com', subject: 'RE: 8월 급여자료',
    body: '확인했습니다', ids: ['f1'] }
};

test('★ 받은 것과 보낸 것이 한 줄기로 선다 — 늦은 것이 위로', () => {
  const rows = T.thread(CO, [T.fromMailLog(MAILLOG), T.fromSentBox(SENT)]);
  assert.equal(rows.map(r => r.id).join(','), 'm3,s1,m1');
});

test('★ 남의 사업장 것은 안 들어온다', () => {
  const rows = T.thread(CO, [T.fromMailLog(MAILLOG)]);
  assert.equal(rows.some(r => r.id === 'm2'), false);
});

test('★ 갈래 이름표가 붙는다 — 화면이 받은·보낸을 갈라 보여 준다', () => {
  const rows = T.thread(CO, [T.fromMailLog(MAILLOG), T.fromSentBox(SENT)]);
  assert.equal(rows.filter(r => r.id === 's1')[0].key, 'out');
  assert.equal(rows.filter(r => r.id === 'm1')[0].key, 'in');
});

test('★ 짐작만 걸러 볼 수 있다 — 틀릴 수 있는 것을 빼고 본다', () => {
  const rows = T.thread(CO, [T.fromMailLog(MAILLOG)], { sureOnly: true });
  assert.equal(rows.some(r => r.id === 'm3'), false, '짐작이 섞였습니다');
  assert.equal(rows.some(r => r.id === 'm1'), true);
});

test('셈이 갈래별로 맞고 짐작을 따로 센다', () => {
  const c = T.counts(T.thread(CO, [T.fromMailLog(MAILLOG), T.fromSentBox(SENT)]));
  assert.equal(c.all, 3);
  assert.equal(c.in, 2);
  assert.equal(c.out, 1);
  assert.equal(c.guess, 1);
});

test('시각이 없는 줄은 안 세운다 — 반쯤 적힌 것이 줄기를 어지럽힌다', () => {
  const rows = T.thread(CO, [T.fromMailLog({ bad: { companyId: 'c1', subject: '시각 없음' } })]);
  assert.equal(rows.length, 0);
});

test('자료가 없어도 안 터진다', () => {
  assert.equal(T.thread(CO, null).length, 0);
  assert.equal(T.thread(null, [T.fromMailLog(MAILLOG)]).length, 0);
  assert.equal(T.counts(null).all, 0);
});

/* ══════ 주소를 나눠 쓰는 곳 (2026-09-02 실제 자료에서 드러남) ══════

   받은 메일 72줄 가운데 33줄이 «여러 사업장»에 한꺼번에 붙었다. 한 사장이
   여러 사업장을 하면서 메일 주소를 하나만 쓰기 때문이다 —
   「프랫안경원 입사자 근로계약서」 한 통이 안경원 네 곳 모두에 걸렸다.

   제목이 한 곳을 집어 말하면 그곳 것이다. 서버(mail-receive.companyOf)가
   자료를 나눌 때 이미 그렇게 하는데, 화면이 달리 보면 «자료는 A 로 갔는데
   목록에는 네 곳에 다 보이는» 어긋남이 생긴다. */

const GROUP = [
  { id: 'g1', name: '프랫안경원', primaryContactEmail: 'boss@optic.kr' },
  { id: 'g2', name: '서독안경원', primaryContactEmail: 'boss@optic.kr' },
  { id: 'g3', name: '아이데코안경원', primaryContactEmail: 'boss@optic.kr' }
];
const GROUP_MAIL = { k1: { at: 100, from: 'boss@optic.kr', subject: '프랫안경원 입사자 근로계약서' } };

test('★ 주소를 나눠 쓰는데 제목이 한 곳을 집으면 그곳만 본다', () => {
  const src = [T.fromMailLog(GROUP_MAIL)];
  const n = GROUP.map(co => T.thread(co, src, { all: GROUP }).length);
  assert.equal(n.join(','), '1,0,0', '한 통이 여러 곳에 걸립니다');
});

test('★ 제목이 아무 곳도 안 집으면 다 남긴다 — 함부로 지우면 아예 안 보인다', () => {
  const src = [T.fromMailLog({ k2: { at: 100, from: 'boss@optic.kr', subject: '8월 급여자료' } })];
  const n = GROUP.map(co => T.thread(co, src, { all: GROUP }).length);
  assert.equal(n.join(','), '1,1,1');
});

test('★ 제목이 둘을 집으면 다 남긴다 — 어느 쪽인지 모른다', () => {
  const src = [T.fromMailLog({ k3: { at: 100, from: 'boss@optic.kr', subject: '프랫안경원·서독안경원 급여' } })];
  const n = GROUP.map(co => T.thread(co, src, { all: GROUP }).length);
  assert.equal(n.join(','), '1,1,0');
});

test('업체 명단을 안 주면 좁히지 않는다 — 예전처럼 돈다', () => {
  const src = [T.fromMailLog(GROUP_MAIL)];
  assert.equal(GROUP.map(co => T.thread(co, src).length).join(','), '1,1,1');
});

test('★ 줄에 사업장 번호가 적혀 있으면 좁히기가 그것을 못 뒤집는다', () => {
  /* 서버가 이미 「이 사업장 것」이라고 적어 둔 것이 가장 확실하다 */
  const src = [T.fromMailLog({ k4: { at: 100, from: 'boss@optic.kr',
    subject: '프랫안경원 근로계약서', companyId: 'g2' } })];
  assert.equal(T.thread(GROUP[1], src, { all: GROUP }).length, 1, '서버가 적은 것을 지웠습니다');
});

/* ══════ 갈래를 밖에서 넣는다 ══════ */

test('★ 새 갈래를 더해도 줄기·셈이 그대로 돈다 — 문자·카톡이 이 길로 온다', () => {
  /* 나중에 생길 문자 갈래를 흉내 낸다. thread() 를 **손대지 않고** 더해진다. */
  const sms = { key: 'sms', label: '문자', rows: [
    { id: 't1', at: 6000, who: '010-1234-5678', text: '정일제지 근태 보냈습니다',
      companyId: 'c1' }
  ] };
  const rows = T.thread(CO, [T.fromMailLog(MAILLOG), T.fromSentBox(SENT), sms]);
  assert.equal(rows[0].id, 't1', '늦은 것이 위로 안 옵니다');
  assert.equal(rows[0].key, 'sms');
  assert.equal(T.counts(rows).sms, 1);
});

test('★ 아직 없는 갈래를 적어 둔다 — 다음 사람이 어디에 붙일지 안다', () => {
  assert.deepEqual(T.PLANNED, ['sms', 'kakao']);
});

/* ══════ 자리 이름을 한 곳에만 ══════ */

test('★ 받은 메일 줄을 표준 모양으로 바꾼다', () => {
  const s = T.fromMailLog(MAILLOG);
  assert.equal(s.key, 'in');
  const r = s.rows.filter(x => x.id === 'm1')[0];
  assert.equal(r.subject, '8월 급여자료');
  assert.equal(r.atts, 2);
  assert.equal(r.meta.took, 2);
  assert.equal(r.meta.seatName, '신욱임');
});

test('★ 보낸 메일 줄도 같은 모양으로 — 화면이 갈라 다룰 일이 없어야 한다', () => {
  const r = T.fromSentBox(SENT).rows[0];
  assert.equal(r.to, 'cust12@naver.com');
  assert.equal(r.subject, 'RE: 8월 급여자료');
  assert.equal(r.atts, 1, '붙인 자료 수를 안 셉니다');
});
