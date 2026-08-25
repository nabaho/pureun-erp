'use strict';
/* 한 주소가 여러 사업장에 걸릴 때 (대표 요청 2026-08-24) — 실행: node --test tests/*.test.js

   회계사무소가 여러 사업장 자료를 **한 주소로** 보낸다.
   정담회계법인 cpabong@naver.com 이 업체관리 7곳에 걸려 있고, 그 7곳의 담당은
   박은비·신욱임·주민정 **세 사람**이다.

   ⚠ 예전 규칙은 「먼저 적힌 업체가 이긴다」였다 — 아무 한 곳을 골라 버리니,
   담당이 다른 사람이면 **남의 자료가 조용히 엉뚱한 사람 칸으로** 갔다.

   지금 차례:
     ① 폴더가 사람을 가리키면 그것이 이긴다(사람이 손으로 옮긴 것)
     ② 주소가 한 곳만 가리키면 그 업체
     ③ 여러 곳에 걸리면 **제목·파일 이름에서** 사업장을 찾아 좁힌다
     ④ 그래도 못 좁혔는데 걸린 곳들의 담당이 **한 사람**이면 그 사람 칸으로
        (사업장은 본인이 고른다)
     ⑤ 담당이 여럿이면 공용 칸 — 까닭을 적는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MR = require(path.join(R, 'functions', 'mail-receive.js'));

/* 세무 주소 tax@jd.kr 이 세 곳에 걸려 있다 — 담당은 A-001 둘, A-002 하나 */
const COS = { v: {
  a: { id: 'co_a', name: '가람떡집', managerMain: 'A-001', taxEmail: 'tax@jd.kr' },
  b: { id: 'co_b', name: '늘봄반찬(모종점)', managerMain: 'A-001', taxEmail: 'tax@jd.kr' },
  c: { id: 'co_c', name: '유원에프앤비', managerMain: 'A-002', taxEmail: 'tax@jd.kr' },
  d: { id: 'co_d', name: '경보엔지니어링', managerMain: 'A-001', email: 'hr@kb.kr' },
  e: { id: 'co_e', name: '두끼', managerMain: 'A-002', email: 'x@dk.kr' },
  f: { id: 'co_f', name: '한세세무', managerMain: 'A-001', taxEmail: 'only@hs.kr' },
  g: { id: 'co_g', name: '평해식품', managerMain: 'A-001', taxEmail: 'only@hs.kr' }
} };
const OWNERS = {
  uid1: { email: 'a001@pureun.kr', name: '박은비' },
  uid2: { email: 'a002@pureun.kr', name: '신욱임' }
};

const idx = () => MR.buildCompanyIndex(COS);
const route = (o, box) => MR.routeFor(o, idx(), OWNERS, box, MR.coList(COS));

/* ══════ 주소 지도 ══════ */

test('★ 한 주소에 걸린 업체를 다 담는다 — 먼저 적힌 것이 이기면 남의 칸으로 간다', () => {
  const list = MR.companiesFor('tax@jd.kr', idx());
  assert.equal(list.length, 3);
  assert.equal(list.map(c => c.id).sort().join(','), 'co_a,co_b,co_c');
});

test('★ 여러 곳에 걸린 주소는 업체를 골라 주지 않는다', () => {
  assert.equal(MR.companyFor('tax@jd.kr', idx()), null, '한 곳을 골라 버렸습니다');
});

test('한 곳만 가리키는 주소는 그대로 그 업체다', () => {
  assert.equal(MR.companyFor('hr@kb.kr', idx()).id, 'co_d');
});

test('같은 업체에 같은 주소가 두 번 적혀도 한 번으로 센다', () => {
  const one = { v: { z: { id: 'co_z', name: '어디', email: 'q@q.kr', taxEmail: 'q@q.kr' } } };
  assert.equal(MR.companiesFor('q@q.kr', MR.buildCompanyIndex(one)).length, 1);
});

/* ══════ 글에서 사업장 찾기 ══════ */

test('★ 제목에 사업장 이름이 있으면 그것으로 좁힌다', () => {
  const r = route({ from: 'tax@jd.kr', subject: '가람떡집 8월 급여대장', filename: 'a.xlsx' });
  assert.equal(r.shared, false);
  assert.equal(r.tag.companyId, 'co_a');
  assert.equal(r.seat, 'uid1');
});

test('★ 파일 이름에 있어도 찾는다 — 제목은 「자료 송부」뿐인 메일이 많다', () => {
  const r = route({ from: 'tax@jd.kr', subject: '자료 송부', filename: '유원에프앤비 근태.xlsx' });
  assert.equal(r.tag.companyId, 'co_c');
  assert.equal(r.seat, 'uid2', '담당이 다른 사람인데 앞 업체로 갔습니다');
});

test('★ ㈜ · 빈칸이 달라도 찾는다', () => {
  const r = route({ from: 'tax@jd.kr', subject: '㈜ 유원 에프앤비 급여', filename: '' });
  assert.equal(r.tag.companyId, 'co_c');
});

test('★ 두 글자 이름은 안 찾는다 — 아무 글에나 걸린다', () => {
  /* 「두끼」가 「두끼로 두 끼를」 같은 말에 걸리면 엉뚱한 곳으로 간다 */
  assert.equal(MR.coFromText('두끼 자료 보냅니다', MR.coList(COS)), null);
});

test('★ 두 업체가 같은 길이로 걸리면 아무도 안 고른다', () => {
  const two = [{ id: 'x', name: '가나다' }, { id: 'y', name: '라마바' }];
  assert.equal(MR.coFromText('가나다 라마바 자료', two), null);
});

test('긴 이름이 이긴다 — 「늘봄반찬」과 「늘봄반찬(모종점)」이 다 있을 때', () => {
  const two = [{ id: 'p', name: '늘봄반찬' }, { id: 'q', name: '늘봄반찬(모종점)' }];
  assert.equal(MR.coFromText('늘봄반찬(모종점) 8월', two).id, 'q');
});

/* ══════ 못 좁혔을 때 ══════ */

test('★ 못 좁혔는데 담당이 한 사람이면 그 사람 칸으로 — 사업장은 본인이 고른다', () => {
  const r = route({ from: 'only@hs.kr', subject: '자료 보냅니다', filename: 'a.xlsx' });
  assert.equal(r.shared, false);
  assert.equal(r.seat, 'uid1');
  assert.equal(r.tag.companyId, '', '사업장을 함부로 정하면 안 됩니다');
  assert.match(r.why, /담당이 한 사람/, '왜 그 칸으로 갔는지 적어야 합니다');
});

test('★ 담당이 여럿이면 공용 칸 — 까닭을 적는다', () => {
  const r = route({ from: 'tax@jd.kr', subject: '자료 보냅니다', filename: 'a.xlsx' });
  assert.equal(r.shared, true);
  assert.equal(r.seat, '');
  assert.match(r.why, /담당이 다른 여러 사업장/);
});

test('★ 모르는 주소여도 제목에 사업장이 있으면 임자에게 간다 — 여태 통째로 공용 칸이었다', () => {
  const r = route({ from: 'nobody@nowhere.kr', subject: '경보엔지니어링 8월 근태', filename: '' });
  assert.equal(r.shared, false);
  assert.equal(r.tag.companyId, 'co_d');
  assert.match(r.why, /제목에서 사업장을 찾음/);
});

test('모르는 주소에 사업장도 안 적혀 있으면 예전처럼 공용 칸이다', () => {
  const r = route({ from: 'nobody@nowhere.kr', subject: '안녕하세요', filename: 'a.pdf' });
  assert.equal(r.shared, true);
  assert.equal(r.why, '업체관리에 없는 주소');
});

/* ══════ 차례 ══════ */

test('★ 폴더가 사람을 가리키면 그것이 이긴다 — 사람이 손으로 옮긴 것이다', () => {
  const r = route({ from: 'tax@jd.kr', subject: '자료', filename: 'a.xlsx' }, '급여-신욱임');
  assert.equal(r.seat, 'uid2');
  assert.equal(r.byBox, true);
  assert.equal(r.shared, false);
});

test('폴더로 갔어도 제목에서 사업장은 찾아 둔다 — 사람이 다시 고르지 않게', () => {
  const r = route({ from: 'tax@jd.kr', subject: '가람떡집 8월', filename: '' }, '급여-신욱임');
  assert.equal(r.byBox, true);
  assert.equal(r.tag.companyId, 'co_a');
});

test('주담당이 아직 급여데이터함에 안 들어왔으면 공용 칸이다 — 아무도 안 여는 자리에 두면 안 된다', () => {
  const cos = { v: { z: { id: 'co_z', name: '아무개상사', managerMain: 'A-099', email: 'z@z.kr' } } };
  const r = MR.routeFor({ from: 'z@z.kr', subject: '', filename: 'a.xlsx' },
    MR.buildCompanyIndex(cos), OWNERS, '', MR.coList(cos));
  assert.equal(r.shared, true);
  assert.match(r.why, /주담당이 아직/);
});

/* ══════ 서버 배선 ══════ */

test('★ 서버가 업체 배열을 함께 담아 둔다 — 메일마다 다시 읽으면 요금이 된다', () => {
  const fs = require('node:fs');
  const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');
  assert.match(FN, /cos: MR\.coList\(cos\)/);
  /* 메일 한 통을 담는 곳은 둘이다 — 첨부와 본문. 둘 다 넘겨야 한다.
     ⚠ 「다시 갈라 보내기」도 같은 것을 쓰므로 자리 수로 세지 않는다. */
  const calls = FN.match(/mail\.box, payMailKnownCache\.cos\)/g) || [];
  assert.equal(calls.length, 2, '첨부와 본문 두 곳에 다 넘겨야 합니다');
});
