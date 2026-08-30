/* 기업정보함 — 여러 곳에 한 통씩 보내기(화면 쪽).
   실행: node --test tests/*.test.js

   대표 지시 2026-08-15: 300곳 미만에 한 번에 보내기 + ①시험 발송 ②수신거부.

   여기서 못 박는 것은 **계정이 막히지 않는 것**과 **잘못 보내지 않는 것**이다.
   다음메일은 대량 발송용이 아니라 몰아 보내면 막히고, 막히면 평소 자료 발송까지
   멈춘다. 그리고 한 번 나간 메일은 되돌릴 수 없다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const bulk = require('../functions/mail-bulk.js');

function load(){
  const a = '/* ══════ 여러 곳에 한 통씩 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 여러 곳에 한 통씩 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0 && j > i, '표식을 찾지 못했습니다');
  const ctx = { console, Object, Array, String, Number, JSON, Math, isFinite };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

/* ── 얼마나 걸리는지 ── */

test('★ 화면과 서버가 같은 셈으로 시간을 말한다', () => {
  /* 화면이 「22분」이라 해 놓고 실제가 다르면 아무도 못 믿는다. */
  const C = load();
  [1, 10, 88, 300].forEach(n => {
    assert.equal(C.bulkEta(n, 15), bulk.etaText(n, 15000), n + '곳에서 화면과 서버가 다릅니다');
  });
});

test('한 시간이 넘으면 시간·분으로 말한다', () => {
  const C = load();
  assert.equal(C.bulkEta(300, 15), '약 1시간 15분');
});

/* ── 보내기 전에 보여줄 숫자 ── */

test('★ 보낼 곳·빠지는 곳·걸리는 시간을 모두 보여준다', () => {
  /* 되돌릴 수 없는 일이라 숫자를 다 보고 누르게 한다. */
  const C = load();
  const rows = C.bulkSummary({ ready:88, noEmail:4, blocked:1, dup:0 }, 15, ['자문계약서']);
  const txt = rows.map(r => r.k + ' ' + r.v).join(' | ');
  assert.match(txt, /보낼 곳 88곳/);
  assert.match(txt, /이메일 없음 4/);
  assert.match(txt, /수신거부 1/);
  assert.match(txt, /걸리는 시간 약 22분/);
  assert.match(txt, /자문계약서/);
});

test('빠지는 곳이 없으면 그 줄을 안 만든다', () => {
  const C = load();
  const rows = C.bulkSummary({ ready:10, noEmail:0, blocked:0, dup:0 }, 15, []);
  assert.ok(!rows.some(r => r.k === '빠지는 곳'));
});

test('간격도 함께 적는다 — 왜 오래 걸리는지 알 수 있게', () => {
  const C = load();
  const rows = C.bulkSummary({ ready:5 }, 15, []);
  assert.match(rows.find(r=>r.k==='걸리는 시간').v, /15초에 한 통씩/);
});

/* ── ① 시험 발송 ── */

test('★ 시험 발송은 주소만 나로 바꾸고 글자는 그대로 둔다', () => {
  /* 글자까지 바꾸면 무엇이 나갈지 시험한 뜻이 없다. */
  const C = load();
  const one = C.bulkTestOne([{ email:'a@x.kr', name:'김철수', company:'가나상사', title:'대리' }], 'me@pureun.kr');
  assert.equal(one.to, 'me@pureun.kr', '내 주소로 안 갑니다');
  assert.equal(one.company, '가나상사', '회사 이름이 바뀌었습니다 — 시험한 뜻이 없습니다');
  assert.equal(one.name, '김철수');
});

test('보낼 곳이나 내 주소가 없으면 시험도 안 한다', () => {
  const C = load();
  assert.equal(C.bulkTestOne([], 'me@pureun.kr'), null);
  assert.equal(C.bulkTestOne([{ email:'a@x.kr' }], ''), null);
});

/* ── 화면이 이 층을 쓰는지 ── */

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = src.indexOf('\n}', i);
  return src.slice(i, j + 2);
}

test('★ 보내기 전에 반드시 묻는다', () => {
  const fn = fnBody('bulkSendAll');
  assert.match(fn, /confirm\(/, '묻지 않고 수백 곳에 보냅니다');
  assert.match(fn, /bulkSummary\(/, '숫자를 안 보여주고 묻습니다');
  assert.match(fn, /막습니다/, '왜 천천히 나가는지 안 알려 줍니다');
});

test('★ 보통 보내기와 길이 갈린다 — 묶음이면 다른 곳으로 간다', () => {
  /* 안 갈라 두면 300곳 주소가 한 통의 받는사람 칸에 들어가 서버가 막는다(5명 상한). */
  assert.match(fnBody('sendCompose'), /if\(c\.bulk\) return bulkSendAll\(\)/);
});

test('묶음일 때는 받는사람 칸 대신 몇 곳인지 보여주고, 풀 길을 둔다', () => {
  assert.match(src, /class="cpbulk"/, '몇 곳인지 안 보입니다');
  assert.match(src, /function bulkCancel\(/, '잘못 들어왔을 때 나갈 길이 없습니다');
  assert.match(src, /cpbulkoff/, '묶음 풀기 단추가 없습니다');
});

test('묶음일 때 시험 발송 단추가 나온다', () => {
  assert.match(src, /onclick="bulkTestSend\(\)"/, '시험 발송을 할 수 없습니다');
  assert.match(fnBody('bulkTestSend'), /confirm\(/, '시험도 묻고 보낸다');
  assert.match(fnBody('bulkTestSend'), /실제 기업에는 나가지 않습니다/, '기업에 나가는 줄 알 수 있습니다');
});

test('간격은 화면과 서버가 같은 값을 쓴다', () => {
  assert.match(src, /const BULK_GAP_SEC = 15/);
  assert.equal(bulk.DEFAULT_SPACING_SEC, 15, '서버 기본 간격과 다릅니다');
});

test('보낼 곳은 이메일 없음·수신거부·중복을 걸러낸 것만', () => {
  /* selMailPick 이 mailTargets 를 거치므로 잠긴 폴더 명함도 안 섞인다. */
  assert.match(fnBody('bulkMailStart'), /selMailPick\(\)/, '거르지 않고 보냅니다');
});

/* ── ② 수신거부 ── */

/* ⚠ 2026-08-30 「물어보고 켜기」로 정리하면서 «묻는 자리»(toggleNoMail)와
     «적는 자리»(nmSet)를 갈랐고, 묻는 방법도 브라우저 confirm 에서 가운데 창(puAsk)으로
     바뀌었다. 지키는 규칙은 그대로다 — 표시를 달고, 저장하고, «묻고» 켠다.
     그래서 둘을 «함께» 본다. 자세한 것은 tests/cards-nomail-ask.test.js. */
test('★ 명함에서 수신거부를 켜고 끌 수 있다', () => {
  const fn = fnBody('toggleNoMail') + fnBody('nmSet');
  assert.match(fn, /it\.noMail/, '수신거부 표시를 안 답니다');
  assert.match(fn, /Store\.put\(it\)/, '저장을 안 합니다');
  assert.match(fn, /puAsk\(|confirm\(/, '묻지 않고 켭니다');
  assert.match(src, /onclick="toggleNoMail\('\$\{id\}'\)"/, '명함 상세에 단추가 없습니다');
});

test('수신거부한 명함은 단체 발송에서 빠진다', () => {
  /* mailTargets 가 it.noMail 과 주소 목록을 둘 다 본다 — 어느 쪽으로 넣어도 빠진다. */
  assert.match(fnBody('mailTargets'), /it\.noMail \|\| B\[emailKey\(e\)\]/);
});

test('고른 명함을 한꺼번에 수신거부로 표시할 수 있다', () => {
  assert.match(fnBody('selNoMail'), /puAsk\(|confirm\(/, '묻지 않고 켭니다');
  assert.match(src, /onclick="closeFolderMenu\(\);selNoMail\(\)"/, '⋯ 메뉴에 없습니다');
});

test('⋯ 메뉴에 「한 통씩 보내기」가 있고, 예전 방식과 이름이 갈린다', () => {
  assert.match(src, /푸른메일로 한 통씩 보내기/);
  assert.match(src, /내 메일앱으로 열기/, '예전 방식과 헷갈립니다');
});
