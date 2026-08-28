'use strict';
/* 기업정보함(기업정보함) → 업체관리 담당자 메일 (대표 요청 2026-08-27)
   실행: node --test tests/*.test.js

   대표: 「푸른 이알피와 기업정보함을 연결해서 노무사와 직원의 담당사업장의
         직원의 이메일 등을 연결시켜 달라」

   기업정보함에 명함 6,636장이 있고 4,387장에 메일이 있다. 실제로 훑어 보니
   급여 사업장과 이어지는 것이 **27곳 / 새 주소 30개**였다.

   ⚠ 두 사업장에 걸리는 명함은 **아무 데도 안 넣는다** — 한쪽을 골라 넣으면
     남의 업체에 엉뚱한 사람이 붙는다.
   ⚠ 이미 적힌 담당자를 덮지 않는다. 대표 담당자 자리도 빼앗지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require(path.join(__dirname, '..', 'js', 'pu-co-cards.js'));
const P = globalThis.PuCoCards;

/* ══════ 명함에서 캐기 ══════ */

test('★ 칸 이름을 못 박지 않고 주소를 캔다 — 기업정보함 칸 이름이 시기마다 달랐다', () => {
  assert.deepEqual(P.cardEmails({ email: 'a@b.kr' }), ['a@b.kr']);
  assert.deepEqual(P.cardEmails({ 이메일: 'a@b.kr' }), ['a@b.kr']);
  assert.deepEqual(P.cardEmails({ memo: '연락은 a@b.kr 로 주세요' }), ['a@b.kr']);
});

test('한 장에 주소가 여러 개면 다 캔다 — 대표와 경리가 같이 적힌 명함이 있다', () => {
  const got = P.cardEmails({ email: 'a@b.kr', memo: '경리 c@d.kr' });
  assert.equal(got.length, 2);
});

test('같은 주소가 두 칸에 적혀 있으면 한 번만', () => {
  assert.equal(P.cardEmails({ email: 'A@B.kr', memo: 'a@b.kr' }).length, 1);
});

test('★ 사진 번호·열쇠는 훑지 않는다 — 긴 글자라 헛일이고 주소가 들 일도 없다', () => {
  assert.deepEqual(P.cardEmails({ photoId: 'x@y.kr', id: 'p@q.kr', _k: 'r@s.kr' }), []);
});

test('주소가 없으면 빈손 — 자료가 없어도 안 터진다', () => {
  assert.deepEqual(P.cardEmails({ company: '가나' }), []);
  assert.deepEqual(P.cardEmails(null), []);
});

test('사업자번호는 앞 10자리만 본다 — 종사업장 꼬리가 붙어 온다', () => {
  assert.equal(P.cardBizNo({ bizno: '314-86-59404' }), '3148659404');
  assert.equal(P.cardBizNo({ bizno: '314-86-59404-0' }), '3148659404');
  assert.equal(P.cardBizNo({ bizno: '12-345' }), '');
});

/* ══════ 맞추기 ══════ */

const COS = [
  { id: 'c1', name: '㈜영도', bizNo: '111-11-11111', managerMain: 'A-003' },
  { id: 'c2', name: '효마을푸드스토리(양지요양원)', bizNo: '', managerMain: 'A-005' },
  { id: 'c3', name: '평해식품', bizNo: '333-33-33333', managerMain: 'A-002' },
  { id: 'c4', name: '쌍둥이상사(가)', bizNo: '', managerMain: 'A-001' },
  { id: 'c5', name: '쌍둥이상사(나)', bizNo: '', managerMain: 'A-004' }
];
const idx = () => P.indexCompanies(COS);

test('★ 사업자번호가 가장 확실하다 — 이름이 달라도 같은 곳이다', () => {
  const hit = P.matchOne({ company: '전혀 다른 이름', bizno: '111-11-11111', email: 'a@b.kr' }, idx());
  assert.equal(hit.co.id, 'c1');
  assert.equal(hit.how, 'biz');
});

test('★ 번호가 없으면 이름으로 — ㈜·빈칸은 무시한다', () => {
  const hit = P.matchOne({ company: '주식회사 영도', email: 'a@b.kr' }, idx());
  assert.equal(hit.co.id, 'c1');
  assert.equal(hit.how, 'name');
});

test('★ 이름 앞머리로도 본다 — 명함은 「효마을 푸드스토리」라고만 적혀 있다', () => {
  const hit = P.matchOne({ company: '효마을 푸드스토리', email: 'a@b.kr' }, idx());
  assert.equal(hit.co.id, 'c2');
  assert.equal(hit.how, 'stem');
});

test('★ 두 사업장에 걸리면 아무 데도 안 넣는다 — 남의 업체에 엉뚱한 사람이 붙는다', () => {
  assert.equal(P.matchOne({ company: '쌍둥이상사', email: 'a@b.kr' }, idx()), null);
});

test('아무 데도 안 맞으면 빈손', () => {
  assert.equal(P.matchOne({ company: '없는회사', email: 'a@b.kr' }, idx()), null);
});

/* ══════ 무엇을 넣을지 ══════ */

test('★ 업체관리에 이미 있는 주소는 다시 안 넣는다', () => {
  const cos = [{ id: 'c1', name: '㈜영도', primaryContactEmail: 'a@b.kr', managerMain: 'A-003' }];
  const r = P.plan([{ company: '㈜영도', email: 'a@b.kr' }], cos);
  assert.equal(r.mails, 0);
});

test('★ contacts 에 든 주소도 「이미 있는 것」으로 본다 — 딸림값만 보면 두 번 넣는다', () => {
  const cos = [{ id: 'c1', name: '㈜영도', managerMain: 'A-003',
    contacts: [{ name: '엄나영', email: 'a@b.kr', isPrimary: true }] }];
  assert.equal(P.plan([{ company: '㈜영도', email: 'A@B.KR' }], cos).mails, 0);
});

test('★ 명함 두 장에 같은 주소가 있어도 한 번만 넣는다', () => {
  const r = P.plan([
    { company: '㈜영도', email: 'x@y.kr' },
    { company: '주식회사 영도', email: 'X@Y.KR' }
  ], COS);
  assert.equal(r.mails, 1);
});

test('★ 담당자별로 묶어 세운다 — 자기 사업장만 확인하면 된다', () => {
  const r = P.plan([
    { company: '평해식품', bizno: '333-33-33333', email: 'p@n.kr' },
    { company: '㈜영도', bizno: '111-11-11111', email: 'y@n.kr' }
  ], COS);
  assert.equal(r.items.map(x => x.co.managerMain).join(','), 'A-002,A-003');
});

test('셈이 맞는다 — 사업장 수와 주소 수', () => {
  const r = P.plan([
    { company: '㈜영도', email: 'a@n.kr', memo: '경리 b@n.kr' },
    { company: '평해식품', email: 'c@n.kr' }
  ], COS);
  assert.equal(r.sites, 2);
  assert.equal(r.mails, 3);
});

test('★ 두 곳에 걸려 못 고른 명함 수를 알려 준다 — 조용히 버리면 안 된다', () => {
  const r = P.plan([{ company: '쌍둥이상사', email: 'a@n.kr' }], COS);
  assert.equal(r.ambig, 1);
  assert.equal(r.mails, 0);
});

test('★ 공용 칸이 몇 건 풀리는지 센다 — 「해서 뭐가 좋아지나」다', () => {
  const r = P.plan([{ company: '㈜영도', email: 'y@n.kr' }], COS,
    { stuck: { 'y@n.kr': 3 } });
  assert.equal(r.stuck, 3);
});

/* ══════ 쓰기 ══════ */

test('★ 이미 적힌 담당자를 덮지 않는다 — 아래에 붙인다', () => {
  const co = { id: 'c1', name: '㈜영도',
    contacts: [{ name: '기존', position: '실장', phone: '010-1', email: 'old@n.kr', isPrimary: true }] };
  const r = P.patchFor(co, [{ email: 'new@n.kr', name: '엄나영' }]);
  assert.equal(r.patch.contacts.length, 2);
  assert.equal(r.patch.contacts[0].position, '실장', '직책을 지웠습니다');
  assert.equal(r.added, 1);
});

test('★ 대표 담당자 자리를 빼앗지 않는다', () => {
  const co = { id: 'c1', name: '㈜영도',
    contacts: [{ name: '진짜대표', email: 'real@n.kr', isPrimary: true }] };
  const r = P.patchFor(co, [{ email: 'new@n.kr', name: '새사람' }]);
  assert.equal(r.patch.primaryContactName, '진짜대표');
});

test('아무도 없던 업체는 명함에서 온 사람이 대표가 된다', () => {
  const r = P.patchFor({ id: 'c1', name: '㈜영도' }, [{ email: 'a@n.kr', name: '엄나영' }]);
  assert.equal(r.patch.primaryContactName, '엄나영');
  assert.equal(r.patch.primaryContactEmail, 'a@n.kr');
});

test('★ 이름이 없는 명함도 주소만 넣는다 — 배달에는 주소만 있으면 된다', () => {
  const r = P.patchFor({ id: 'c1', name: '가' }, [{ email: 'a@n.kr', name: '' }]);
  assert.equal(r.added, 1);
  assert.equal(r.patch.contacts[0].email, 'a@n.kr');
});

test('★ 어디서 온 사람인지 적어 둔다 — 나중에 손으로 적은 것과 갈라야 한다', () => {
  const r = P.patchFor({ id: 'c1', name: '가' }, [{ email: 'a@n.kr', name: '나' }]);
  assert.equal(r.patch.contacts[0].position, '기업정보함');
});

test('넣을 것이 없으면 안 쓴다', () => {
  const co = { id: 'c1', name: '가', contacts: [{ email: 'a@n.kr', isPrimary: true }] };
  assert.equal(P.patchFor(co, [{ email: 'A@N.KR' }]).changed, false);
});

test('★ 안 고른 줄은 쓰지 않는다', () => {
  const items = P.plan([{ company: '㈜영도', email: 'y@n.kr' }], COS).items;
  assert.equal(P.writes(items, { 'c1|y@n.kr': false }).length, 0);
  assert.equal(P.writes(items, {}).length, 1);
});

test('자료가 없어도 안 터진다', () => {
  const r = P.plan(null, null);
  assert.equal(r.sites, 0);
  assert.equal(r.mails, 0);
  assert.deepEqual(P.writes(null, null), []);
});

/* ══════ 화면 배선 (pu-erp.html) ══════ */

const fs2 = require('node:fs');
const ERP = fs2.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

test('★ 업체관리에 「기업정보함에서 메일」 단추가 있다', () => {
  assert.match(ERP, /기업정보함에서 메일/);
  assert.match(ERP, /pullCardEmails/);
  assert.match(ERP, /js\/pu-co-cards\.js\?v=\d+/, '?v= 가 없으면 배포에 안 실립니다');
});

test('★ 누를 때 한 번만 읽는다 — 늘 받아 두면 그것이 요금이다', () => {
  const m = ERP.match(/function pullCardEmails\(\)[\s\S]*?\n  \}/);
  assert.ok(m, 'pullCardEmails 를 찾을 수 없습니다');
  assert.match(m[0], /once\('value'\)/, '한 번 읽기가 아닙니다');
  assert.equal(/\.on\(/.test(m[0]), false, '구독하면 늘 받아 옵니다');
});

test('★ 급여 업체만 훑는다 — 자문·사무대행까지 보면 엉뚱한 곳이 섞인다', () => {
  const m = ERP.match(/function pullCardEmails\(\)[\s\S]*?\n  \}/);
  assert.match(m[0], /typeCode\|\|''\) === '급여'|typeCode\s*\|\|\s*''\)\s*===\s*'급여'/);
  assert.match(m[0], /status\|\|''\) === 'active'|status\s*\|\|\s*''\)\s*===\s*'active'/);
});

test('★ 바로 쓰지 않는다 — 보여 주고 대표가 눌러야 쓴다', () => {
  const m = ERP.match(/function pullCardEmails\(\)[\s\S]*?\n  \}/);
  assert.match(m[0], /setPccPlan\(/);
  assert.equal(/coUpsertMany/.test(m[0]), false, '보여 주기 전에 써 버립니다');
});

test('★ 「넣기」를 눌렀을 때만 쓰고, 끈 줄은 뺀다', () => {
  const m = ERP.match(/function applyCardEmails\(\)[\s\S]*?\n  \}/);
  assert.ok(m, 'applyCardEmails 를 찾을 수 없습니다');
  assert.match(m[0], /coUpsertMany/);
  assert.match(m[0], /pccOff/, '끈 줄을 안 뺍니다');
});

test('★ 담당자별로 묶어 보여 준다 — 자기 사업장만 확인하면 된다', () => {
  assert.match(ERP, /managerMain \|\| ''\);\s*\r?\n\s*if\(sid !== last\)/,
    '담당자 이름 줄을 안 끼웁니다');
});

test('★ 어떻게 맞췄는지 보여 준다 — 근거 없이 넣으라면 못 믿는다', () => {
  assert.match(ERP, /사업자번호/);
  assert.match(ERP, /이름 앞머리/);
});

test('★ 두 곳에 걸려 못 고른 명함 수를 화면에 적는다 — 조용히 버리면 안 된다', () => {
  assert.match(ERP, /두 곳에 걸려 안 고른 명함/);
});

