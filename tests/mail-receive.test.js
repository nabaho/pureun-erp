/* 급여자료 메일 자동수신 — 담기 전에 막아야 하는 것들.
   이 층이 뚫리면 모르는 곳에서 온 첨부·서명 로고·실행파일이 대기 칸에 쌓여
   급여데이터함이 못 쓰게 된다. 실제 메일함에는 붙지 않는다(순수 값 검사). */
const test = require('node:test');
const assert = require('node:assert/strict');
const MR = require('../functions/mail-receive.js');

/* ── 보낸 사람 가려내기 ── */

test('「이름 <주소>」에서 주소만 꺼낸다', () => {
  assert.equal(MR.senderOf('홍길동 <Hong@Example.com>'), 'hong@example.com');
  assert.equal(MR.senderOf('hong@example.com'), 'hong@example.com');
  assert.equal(MR.senderOf('"권, 형하" <a@b.co.kr>'), 'a@b.co.kr');
});

test('주소를 못 알아보면 빈 문자열 — 모르는 사람으로 다룬다', () => {
  assert.equal(MR.senderOf('알 수 없음'), '');
  assert.equal(MR.senderOf(''), '');
  assert.equal(MR.senderOf(null), '');
});

/* ── 아는 주소 명단 ──
   대표 결정 2026-08-14: 아는 주소에서 온 것만 받는다. */

test('★ 업체관리 어느 칸에 있든 메일 주소를 찾아낸다', () => {
  /* ⚠ 칸 이름을 못 박지 않는 것이 요점이다 — 이름이 바뀐 날 조용히
     아무도 통과 못 하는 사고를 막는다. */
  const companies = {
    c1: { 업체명: '화담원', 담당자이메일: 'boss@hwadam.co.kr' },
    c2: { 업체명: '이비', email: 'staff@ebi.com' },
    c3: { 업체명: '참살이', 메모: '문의는 help@chamsari.kr 로' }
  };
  const known = MR.buildKnownList(companies, null);
  assert.ok(known.indexOf('boss@hwadam.co.kr') >= 0);
  assert.ok(known.indexOf('staff@ebi.com') >= 0);
  assert.ok(known.indexOf('help@chamsari.kr') >= 0);
});

test('직원은 사번을 이메일로 바꿔 넣는다 — 포털과 같은 규칙', () => {
  assert.equal(MR.sidToEmail('p-001'), 'p001@pureun.kr');
  const known = MR.buildKnownList(null, [{ sid: 'p-001', name: '권형하' }]);
  assert.ok(known.indexOf('p001@pureun.kr') >= 0);
});

test('직원 명부가 배열이든 번호 맵이든 읽는다', () => {
  const asMap = MR.buildKnownList(null, { a: { sid: 'p-002' }, b: { email: 'x@y.com' } });
  assert.ok(asMap.indexOf('p002@pureun.kr') >= 0);
  assert.ok(asMap.indexOf('x@y.com') >= 0);
});

test('{v:...} 로 한 겹 싸여 있어도 벗겨서 읽는다', () => {
  const known = MR.buildKnownList({ v: { c1: { email: 'a@b.com' } } }, { v: [{ sid: 'p-003' }] });
  assert.ok(known.indexOf('a@b.com') >= 0);
  assert.ok(known.indexOf('p003@pureun.kr') >= 0);
});

test('중복은 하나로', () => {
  const known = MR.buildKnownList({ c1: { email: 'A@B.com' }, c2: { email: 'a@b.com' } }, null);
  assert.equal(known.filter(e => e === 'a@b.com').length, 1);
});

test('★ 명단에 없는 주소는 통과하지 못한다', () => {
  const known = MR.buildKnownList({ c1: { email: 'boss@hwadam.co.kr' } }, null);
  assert.equal(MR.isKnownSender('boss@hwadam.co.kr', known), true);
  assert.equal(MR.isKnownSender('BOSS@Hwadam.co.kr', known), true, '대소문자는 같은 주소다');
  assert.equal(MR.isKnownSender('spam@nowhere.com', known), false);
  assert.equal(MR.isKnownSender('', known), false);
});

test('명단이 비어 있으면 아무도 통과하지 못한다 — 열어 두지 않는다', () => {
  assert.equal(MR.isKnownSender('a@b.com', []), false);
  assert.equal(MR.isKnownSender('a@b.com', null), false);
});

test('자료가 없어도 터지지 않는다', () => {
  assert.equal(MR.buildKnownList(null, null).length, 0);
  assert.equal(MR.buildKnownList('이상한 것', 42).length, 0);
});

/* ── 첨부 거르기 ── */

test('보통 첨부는 담는다', () => {
  assert.equal(MR.okAttachment({ filename: '근태표.jpg', size: 200000 }).ok, true);
  assert.equal(MR.okAttachment({ filename: '급여대장.xlsx', size: 50000 }).ok, true);
  assert.equal(MR.okAttachment({ filename: '계약서.pdf', size: 900000 }).ok, true);
});

test('★ 서명에 박힌 로고는 담지 않는다 — 대기 칸이 로고로 찬다', () => {
  const r = MR.okAttachment({ filename: 'logo.png', size: 4000, contentDisposition: 'inline', cid: 'x@y' });
  assert.equal(r.ok, false);
  assert.match(r.why, /서명|본문/);
});

test('본문에 박혔어도 cid 가 없으면 진짜 첨부로 본다', () => {
  assert.equal(MR.okAttachment({ filename: '표.png', size: 40000, contentDisposition: 'inline' }).ok, true);
});

test('★ 실행파일·스크립트는 담지 않는다', () => {
  ['a.exe', 'a.js', 'a.bat', 'a.cmd', 'a.sh', 'a.vbs', 'a.jar', 'a.html'].forEach(n => {
    const r = MR.okAttachment({ filename: n, size: 1000 });
    assert.equal(r.ok, false, n + ' 가 통과했습니다');
    assert.ok(r.why, '왜 안 되는지가 없습니다');
  });
});

test('확장자 대문자도 막는다', () => {
  assert.equal(MR.okAttachment({ filename: '나쁜것.EXE', size: 1000 }).ok, false);
});

test('★ 창고 상한을 서버도 똑같이 지킨다', () => {
  assert.equal(MR.okAttachment({ filename: 'a.jpg', size: MR.UPLOAD_MAX }).ok, true);
  const r = MR.okAttachment({ filename: 'a.jpg', size: MR.UPLOAD_MAX + 1 });
  assert.equal(r.ok, false);
  assert.match(r.why, /큽니다/);
});

test('이름 없거나 빈 파일은 담지 않는다', () => {
  assert.equal(MR.okAttachment({ filename: '', size: 100 }).ok, false);
  assert.equal(MR.okAttachment({ filename: 'a.jpg', size: 0 }).ok, false);
  assert.equal(MR.okAttachment({}).ok, false);
  assert.equal(MR.okAttachment(null).ok, false);
});

test('확장자 읽기', () => {
  assert.equal(MR.extOf('근태표.jpg'), 'jpg');
  assert.equal(MR.extOf('가.나.다.PDF'), 'pdf');
  assert.equal(MR.extOf('확장자없음'), '');
  assert.equal(MR.extOf('끝에점.'), '');
  assert.equal(MR.extOf(null), '');
});

/* ── 대기 칸에 담길 한 줄 ── */

test('★ 앱이 아는 칸만 쓴다 — 집어갈 때 사라지지 않게', () => {
  const rec = MR.sharedPendingRecord({
    filename: '근태표.jpg', file: 'pu_paydata/_mail/202608/x.jpg',
    mime: 'image/jpeg', bytes: 1234, at: 1000,
    mailFrom: 'boss@hwadam.co.kr', mailSubject: '8월 근태 보냅니다'
  });
  assert.equal(rec.filename, '근태표.jpg');
  assert.equal(rec.bytes, 1234);
  assert.equal(rec.from, 'mail', '어디서 왔는지가 남아야 합니다');
  assert.equal(rec.by, '', '서버가 담은 것이지 사람이 담은 것이 아닙니다');
  assert.equal(rec.companyId, '', '사업장·귀속월은 사람이 대기 칸에서 고릅니다');
  assert.equal(rec.month, '');
});

test('★ 보낸사람·제목은 note 에 남긴다 — 따로 칸을 만들면 집어갈 때 사라진다', () => {
  const rec = MR.sharedPendingRecord({
    filename: 'a.jpg', mailFrom: 'boss@hwadam.co.kr', mailSubject: '8월 근태'
  });
  assert.match(rec.note, /boss@hwadam\.co\.kr/);
  assert.match(rec.note, /8월 근태/);
});

test('제목의 줄바꿈을 없앤다', () => {
  const rec = MR.sharedPendingRecord({ filename: 'a.jpg', mailFrom: 'a@b.com', mailSubject: '가\n나\r다' });
  assert.equal(/[\r\n]/.test(rec.note), false);
});

test('제목이 아주 길어도 잘라 담는다', () => {
  const rec = MR.sharedPendingRecord({ filename: 'a.jpg', mailFrom: 'a@b.com', mailSubject: '가'.repeat(1000) });
  assert.ok(rec.note.length <= 300);
});

test('아무것도 안 줘도 터지지 않는다', () => {
  const rec = MR.sharedPendingRecord();
  assert.equal(rec.filename, '');
  assert.equal(rec.from, 'mail');
});

/* ── 화면 층과 값이 어긋나지 않는가 ──
   한쪽만 고치면 메일로는 들어오는데 손으로는 못 올리는 일이 생긴다. */
test('★ 상한·금지 확장자가 화면 층과 같다', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const max = store.match(/var UPLOAD_MAX = ([\d *]+);/);
  assert.ok(max, '화면 층에서 UPLOAD_MAX 를 찾지 못했습니다');
  assert.equal(eval(max[1]), MR.UPLOAD_MAX, '상한이 화면과 다릅니다');
  const bad = store.match(/var BAD_EXT = \[([^\]]*)\]/);
  assert.ok(bad, '화면 층에서 BAD_EXT 를 찾지 못했습니다');
  const list = bad[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepEqual(list.slice().sort(), MR.BAD_EXT.slice().sort(), '금지 확장자가 화면과 다릅니다');
});
