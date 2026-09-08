'use strict';
/* 공용 칸을 지금 규칙으로 다시 갈라 보내기 (대표 요청 2026-08-25) — 실행: node --test tests/*.test.js

   왜: 배달은 메일을 **받을 때 한 번만** 한다. 그래서 업체관리에 주소를 나중에
   넣어도 이미 공용 칸에 떨어진 것은 영원히 그대로였다.
   실제로 52건이 「업체관리에 없는 주소」로 쌓여 있었다(51건이 그 까닭).

   ⚠ 이 일은 서버만 할 수 있다 — 화면에서는 남의 자리에 못 쓴다(콘솔 규칙).
   ⚠ 예전 줄에는 mailFrom 칸이 없다. note 의 「메일 <주소> · <제목>」에서 되찾는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MR = require(path.join(R, 'functions', 'mail-receive.js'));
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ══════ note 에서 보낸이 되찾기 ══════ */

test('★ note 에서 보낸이와 제목을 되찾는다 — 실제로 쌓인 줄의 모양이다', () => {
  const g = MR.mailFromNote('메일 cust01@hanmail.net · 정일마헤시요청자료입니다.');
  assert.equal(g.from, 'cust01@hanmail.net');
  assert.equal(g.subject, '정일마헤시요청자료입니다.');
});

test('제목이 없는 줄도 보낸이는 되찾는다', () => {
  assert.equal(MR.mailFromNote('메일 cust08@daum.net').from, 'cust08@daum.net');
});

test('제목에 「·」이 들어 있어도 보낸이를 안 잘라 먹는다', () => {
  const g = MR.mailFromNote('메일 a@b.kr · 8월 급여 · 본점 · 지점');
  assert.equal(g.from, 'a@b.kr');
  assert.equal(g.subject, '8월 급여 · 본점 · 지점');
});

test('모양이 다른 글은 빈칸을 준다 — 억지로 읽으면 엉뚱한 주소가 나온다', () => {
  assert.equal(MR.mailFromNote('사람이 손으로 적은 메모').from, '');
  assert.equal(MR.mailFromNote('').from, '');
  assert.equal(MR.mailFromNote(null).from, '');
});

/* ══════ 다시 갈라 보기 ══════ */

const COS = { v: {
  a: { id: 'co_a', name: '가나글로벌아산공장', managerMain: 'A-001', primaryContactEmail: 'cust22@ganaglobal.com' },
  b: { id: 'co_b', name: '정일제지', managerMain: 'A-002', taxEmail: 'cust01@hanmail.net' }
} };
const OWNERS = {
  uid1: { email: 'a001@pureun.kr', name: '주민정' },
  uid2: { email: 'a002@pureun.kr', name: '신욱임' }
};
const idx = () => MR.buildCompanyIndex(COS);
const one = (rec) => MR.regroupOne(rec, idx(), OWNERS, MR.coList(COS));

test('★ 주소를 넣은 뒤 다시 갈라 보면 임자에게 간다 — 이것이 이 일의 목적이다', () => {
  const r = one({
    filename: '26.07월_급여_본점_예정.xlsx',
    note: '메일 cust22@ganaglobal.com · 7월 급여 자료',
    why: '업체관리에 없는 주소'
  });
  assert.equal(r.shared, false);
  assert.equal(r.seat, 'uid1');
  assert.equal(r.tag.companyId, 'co_a');
});

test('★ 새 칸(mailFrom)이 있으면 그것을 먼저 본다 — 글을 되짚지 않는다', () => {
  const r = one({ filename: 'a.xlsx', mailFrom: 'cust01@hanmail.net', mailSubject: '자료', note: '엉뚱한 글' });
  assert.equal(r.seat, 'uid2');
});

test('★ 두 자리 해도 귀속월로 읽는다 — 「26.07월」이 실제로 오는 모양이다', () => {
  const r = one({
    filename: '26.07월_급여_본점_예정.xlsx',
    note: '메일 cust22@ganaglobal.com · 7월 급여'
  });
  assert.equal(r.tag.month, '2026-07');
  /* ⚠ 종류는 일부러 비운다. 「급여」라는 말만으로 급여대장이라고 하면
     「8월급여수정 요청」 같은 메일까지 대장으로 잡힌다 — 사람이 고른다. */
  assert.equal(r.tag.kind, '');
});

test('해로 볼 수 없는 숫자는 달로 읽지 않는다 — 「1.5월분」이 2001년이 되면 안 된다', () => {
  assert.equal(MR.tagFor({ filename: '제1.5월분 자료.xlsx' }, null).month, '');
});

test('★ 서버와 화면이 같은 규칙을 쓴다 — 다르면 같은 파일이 다른 달로 잡힌다', () => {
  const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
  assert.match(html, /\[2-3\]\\d\)\[\.\\-_\]/, '화면 쪽 guessTag 에 같은 규칙이 없습니다');
});

test('★ 아직 주소가 없는 것은 그대로 공용 칸에 남는다 — 아무 데나 보내지 않는다', () => {
  const r = one({ filename: 'a.pdf', note: '메일 nobody@nowhere.kr · 안녕하세요' });
  assert.equal(r.shared, true);
  assert.equal(r.seat, '');
  assert.equal(r.why, '업체관리에 없는 주소');
});

test('보낸이를 못 읽은 줄도 터지지 않고 공용 칸에 남는다', () => {
  const r = one({ filename: 'a.pdf', note: '사람이 적은 메모' });
  assert.equal(r.shared, true);
});

/* ══════ 서버 배선 ══════ */

test('★ 다시 갈라 보내는 함수가 있다', () => {
  assert.match(FN, /exports\.regroupPaydataShared/);
});

test('★ 총괄관리자만 — 남의 자리로 자료를 옮기는 일이다', () => {
  const i = FN.indexOf('exports.regroupPaydataShared');
  const body = FN.slice(i, i + 3600);
  assert.match(body, /isAdmin !== true/, '아무나 할 수 있으면 안 됩니다');
  assert.match(body, /requireStaff/);
});

test('★ 업체 주소를 새로 읽는다 — 6시간 캐시를 쓰면 방금 넣은 주소가 안 보인다', () => {
  const i = FN.indexOf('exports.regroupPaydataShared');
  const body = FN.slice(i, i + 3600);
  assert.match(body, /payMailKnownCache\.at = 0/, '캐시를 안 비우면 아무것도 안 갈립니다');
  assert.match(body, /payMailKnownList\(db\)/);
});

test('★ 옮긴 것은 공용 칸에서 뺀다 — 두 곳에 있으면 두 번 처리된다', () => {
  const i = FN.indexOf('exports.regroupPaydataShared');
  const body = FN.slice(i, i + 3600);
  assert.match(body, /"\/pending_shared\/" \+ id\] = null/);
  assert.match(body, /"\/u\/" \+ r\.seat \+ "\/pending\/" \+ id\]/);
});

test('★ 못 갈린 것은 까닭을 지금 것으로 고쳐 둔다 — 무엇을 손봐야 하는지 보여야 한다', () => {
  const i = FN.indexOf('exports.regroupPaydataShared');
  const body = FN.slice(i, i + 3600);
  assert.match(body, /\/why"\] = String\(r\.why/);
});

test('★ 공용 칸 줄에 보낸이를 칸으로도 남긴다 — 다음부터는 글을 되짚지 않는다', () => {
  const r = MR.sharedPendingRecord({
    filename: 'a.xlsx', mailFrom: 'a@b.kr', mailSubject: '8월 급여', why: '테스트'
  });
  assert.equal(r.mailFrom, 'a@b.kr');
  assert.equal(r.mailSubject, '8월 급여');
  assert.match(r.note, /메일 a@b\.kr/, '글도 그대로 둬야 한다 — 화면이 그것을 읽는다');
});

test('아주 긴 제목은 칸에 자른다', () => {
  const r = MR.sharedPendingRecord({ mailSubject: '가'.repeat(500) });
  assert.ok(r.mailSubject.length <= 200);
});

/* ══════ 화면 배선 ══════ */

const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

test('★ 「메일로 온 것」 화면에 다시 갈라 보내기 단추가 있다', () => {
  assert.match(HTML, /다시 갈라 보내기/);
  assert.match(HTML, /onclick="regroupShared\(\)"/);
});

test('★ 총괄관리자에게만 보인다 — 남의 자리로 자료를 옮기는 일이다', () => {
  /* 단추 자리에서 거슬러 올라가 조건을 본다 — 위에 붙인 설명글이 길다 */
  const i = HTML.indexOf('onclick="regroupShared()"');
  assert.ok(i > 0, '단추를 찾을 수 없습니다');
  const near = HTML.slice(Math.max(0, i - 700), i);
  assert.match(near, /S\.amAdmin\(\)/);
});

test('★ 누르기 전에 묻는다 — 자료가 남의 칸으로 옮겨 간다', () => {
  const m = HTML.match(/function regroupShared\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'regroupShared 를 찾을 수 없습니다');
  assert.match(m[0], /confirm\(/);
  assert.match(m[0], /if \(App\.regrouping\) return;/, '두 번 눌림을 막아야 합니다');
});

test('★ 끝나면 몇 건이 누구에게 갔는지 알려 준다', () => {
  const m = HTML.match(/function regroupShared\(\)[\s\S]*?\n\}/);
  assert.match(m[0], /r\.seats/, '누구에게 갔는지 안 알려 줍니다');
  assert.match(m[0], /r\.whys/, '남은 것의 까닭을 안 알려 줍니다');
});

test('★ 자리층이 서버 함수를 부른다', () => {
  assert.match(STORE, /regroupPaydataShared/);
  assert.match(STORE, /regroupShared: regroupShared/, '밖으로 안 내놓았습니다');
});

test('★ 부르는 손질을 한 곳에 모았다 — 두 곳이면 한쪽만 고치게 된다', () => {
  assert.match(STORE, /function callFn\(/);
  assert.match(STORE, /getIdToken/);
});

test('★ 자리층을 고쳤으니 부르는 화면의 ?v= 를 올렸다', () => {
  const m = HTML.match(/pu-paydata-store\.js\?v=(\d+)/);
  assert.ok(m, '?v= 가 없습니다');
  assert.ok(Number(m[1]) >= 4, '안 올리면 고쳐도 배포에 안 실립니다: v=' + m[1]);
});

