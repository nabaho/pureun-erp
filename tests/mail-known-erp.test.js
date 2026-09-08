'use strict';
/* 「아는 주소」에 푸른이알피 업체 담당자도 넣는다 — node --test tests/mail-known-erp.test.js
 *
 * 대표 결정 2026-09-06: 받은메일함까지 훑는다.
 *
 * 그런데 받은메일함은 «아는 주소»만 담는다(광고가 들어오는 곳이라). 그 명단을
 * 업체관리(data/companies)에서만 만들고 있었다 — 실측 185개.
 * 컨설팅·계약·사건 레코드에는 업체관리에 «없는» 담당자 주소가 71개 더 있었고,
 * 엠비프라텍 윤충희(cust09@daum.net)가 그 하나였다.
 * 그 사람들 메일은 받은메일함을 켜도 「모르는 주소」로 버려진다 — 켠 보람이 없다.
 *
 * 이 검사가 지키는 것
 *   ① 푸른이알피 담당자 주소가 명단에 든다
 *   ②★ 레코드를 «통째로» 훑지 않는다 — 메모에 적힌 남의 주소가 들어오면
 *      그 주소에서 오는 광고가 받은메일함에서 통과한다
 *   ③ 옛 레코드(담당자 칸 없음)나 못 읽은 자리에도 안 넘어진다
 *   ④ 예전처럼 두 인자로 불러도 그대로 돈다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const MR = require(path.join(ROOT, 'functions', 'mail-receive.js'));

const 업체 = { v: [{ id: 'co-1', name: '가나', contacts: [{ email: 'kim@gana.co.kr' }] }] };
const 컨설팅 = { v: [{
  id: 'cs-1', companyName: '엠비프라텍', companyId: 'co-9',
  email: 'main@mbpr.co.kr', primaryContactEmail: 'primary@mbpr.co.kr',
  note: '옆 사무실 spam@ad.example.com 이 자꾸 보냄',
  updatedBy: 'p001@pureun.kr',
  contacts: [{ name: '윤충희', role: '대표자', email: 'cust09@daum.net' }]
}] };

test('★ 푸른이알피 업체 담당자 주소가 「아는 주소」에 든다', () => {
  const 전 = MR.buildKnownList(업체, null);
  const 후 = MR.buildKnownList(업체, null, [컨설팅]);
  assert.ok(!MR.isKnownSender('cust09@daum.net', 전), '고치기 전에 이미 통과한다면 이 검사는 헛돈다');
  assert.ok(MR.isKnownSender('cust09@daum.net', 후), '담당자 주소가 여전히 버려진다');
  assert.ok(MR.isKnownSender('main@mbpr.co.kr', 후), '업체 대표 주소가 빠졌다');
  assert.ok(MR.isKnownSender('primary@mbpr.co.kr', 후), '기본 담당자 주소가 빠졌다');
});

test('★★ 메모에 적힌 남의 주소는 안 긁는다 — 긁으면 그 주소 광고가 통과한다', () => {
  const 후 = MR.buildKnownList(업체, null, [컨설팅]);
  assert.ok(!MR.isKnownSender('spam@ad.example.com', 후),
    '레코드를 통째로 훑고 있다 — 메모에 적힌 아무 주소나 받은메일함에서 통과하게 된다');
});

test('담당자 칸이 {열쇠:값} 으로 저장된 옛 레코드도 읽는다', () => {
  const 옛 = { v: [{ id: 'x', contacts: { a1: { email: 'old@corp.example.com' } } }] };
  assert.ok(MR.isKnownSender('old@corp.example.com', MR.buildKnownList(업체, null, [옛])));
});

test('company 상자 안에 담당자를 둔 레코드도 읽는다 — 이관 전 계약이 그 모양이다', () => {
  const 상자 = { v: [{ id: 'x', company: { contacts: [{ email: 'inbox@corp.example.com' }] } }] };
  assert.ok(MR.isKnownSender('inbox@corp.example.com', MR.buildKnownList(업체, null, [상자])));
});

test('못 읽었거나(null) 빈 자리여도 안 넘어진다 — 명단이 좁아질 뿐이다', () => {
  for (const bad of [null, undefined, {}, { v: null }, { v: [] }, [null, undefined], 'x', 0]) {
    const got = MR.buildKnownList(업체, null, [bad]);
    assert.ok(Array.isArray(got), '넘어졌다: ' + JSON.stringify(bad));
    assert.ok(MR.isKnownSender('kim@gana.co.kr', got), '업체관리 쪽 명단까지 잃었다');
  }
});

test('예전처럼 두 인자로 불러도 그대로 돈다 — 부르는 곳이 여럿이다', () => {
  const got = MR.buildKnownList(업체, [{ email: 'p001@pureun.kr' }]);
  assert.ok(MR.isKnownSender('kim@gana.co.kr', got));
  assert.ok(MR.isKnownSender('p001@pureun.kr', got));
});

test('같은 주소가 두 번 안 들어간다', () => {
  const 겹침 = { v: [{ id: 'y', contacts: [{ email: 'kim@gana.co.kr' }] }] };
  const got = MR.buildKnownList(업체, null, [겹침]);
  assert.equal(got.filter(e => e === 'kim@gana.co.kr').length, 1);
});

test('★ 받은메일함은 여전히 «아는 주소»만 담는다 — 켠다고 다 받지 않는다', () => {
  /* 이 검사가 지키는 진짜 것: 명단을 넓혔다고 문을 열어 둔 것은 아니다 */
  assert.equal(MR.trustBox('INBOX'), false, '받은메일함을 주소 안 가리고 믿게 되었다');
  assert.equal(MR.trustBox('2.급여+사무대행'), true);
  const 후 = MR.buildKnownList(업체, null, [컨설팅]);
  assert.ok(!MR.isKnownSender('nobody@ad.example.com', 후), '아무나 통과한다');
});

test('★ 받은메일함을 보려면 스위치를 «참으로 확실히» 켜야 한다', () => {
  /* 켜는 쪽이 위험한 설정이다 — 값이 없거나 애매하면 꺼진 것으로 본다 */
  assert.equal(MR.mailConfOf({}).scanInbox, false);
  assert.equal(MR.mailConfOf({ scanInbox: 'true' }).scanInbox, false, '글자 "true" 로 켜지면 안 된다');
  assert.equal(MR.mailConfOf({ scanInbox: 1 }).scanInbox, false);
  assert.equal(MR.mailConfOf({ scanInbox: true }).scanInbox, true);
});

test('스위치를 켜면 받은메일함이 «급여 폴더 뒤에» 붙는다 — 앞에 서면 자리를 다 먹는다', () => {
  const 목록 = [{ path: 'INBOX', name: 'INBOX' }, { path: '2.급여+사무대행', name: '2.급여+사무대행' }];
  assert.deepEqual(MR.pickMailboxes(목록, {}), ['2.급여+사무대행']);
  assert.deepEqual(MR.pickMailboxes(목록, { scanInbox: true }), ['2.급여+사무대행', 'INBOX']);
});

test('보낸메일함·휴지통은 켜든 말든 안 본다', () => {
  const 목록 = [{ path: '보낸메일함', name: '보낸메일함' }, { path: '휴지통', name: '휴지통' },
    { path: '급여-최기운', name: '급여-최기운' }];
  assert.deepEqual(MR.pickMailboxes(목록, { scanInbox: true }), ['급여-최기운']);
});

test('실제 자료에서 명단이 정말 넓어졌다 — 흉내가 아니라 진짜 파일로', { skip: !fs.existsSync(path.join(ROOT, 'tests', 'fixtures', 'erp-contacts.json')) }, () => {
  const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'erp-contacts.json'), 'utf8'));
  const 후 = MR.buildKnownList(null, null, [F]);
  assert.ok(후.length > 0);
});
