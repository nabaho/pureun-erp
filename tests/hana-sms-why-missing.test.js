/* 「방금 하나은행에서 문자 왔는데 왜 연동되어 체크 안 되나」 (대표 물음 2026-08-24)

   문자 하나가 거래내역에 닿기까지 «문이 넷» 이다.
     ① 휴대폰 앱이 붙어 있나        (연결번호로 한 번 맺는다)
     ② 알림 접근이 켜져 있나         (꺼지면 앱이 문자를 못 본다)
     ③ 휴대폰 거르개를 지나나        (HanaMessageFilter)
     ④ 서버 거르개를 지나나          (parseHanaMessage)
   넷 중 어디서 막혀도 화면은 «똑같이» 조용했다 — 그래서 물어볼 데가 없었다.

   ★ 실제로 ③④ 가 어긋나 있었다. 휴대폰은 「하나 」로 시작하는 문자를 보내는데
     서버는 「하나은행」이라는 글자를 요구해서 통째로 버렸다. 실제 하나은행 입출금
     문자는 「하나 08/24 08:09」처럼 은행 이름을 줄여 보낸다.
     휴대폰은 보내고 서버는 조용히 버리니, 대기함은 영원히 비어 있었다.

   이 검사가 못 박는 것 —
     ① 휴대폰이 보내는 것은 서버도 받는다 (두 거르개가 갈라지지 않게)
     ② 통장 적요에는 «이름»만 남는다 (업체 맞추기가 이 글로 이뤄진다)
     ③ 돈의 방향은 먼저 나온 말을 따른다 (출금 문자 속 「입금계좌」에 안 속게)
     ④ 걸러진 까닭이 남는다 — 원문은 안 남긴다
     ⑤ 화면이 «붙어 있나»를 말해 준다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HM = require('../functions/hana-message');
const fn = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const filter = fs.readFileSync(path.join(ROOT, 'android', 'hana-sms-bridge', 'app', 'src',
  'main', 'java', 'kr', 'pureun', 'hanabridge', 'HanaMessageFilter.java'), 'utf8');

const NOW = new Date('2026-08-24T09:00:00+09:00');

test('★ 휴대폰이 「하나 문자」로 보는 것은 서버도 받는다 — 두 거르개가 갈라지면 대기함이 빈다', () => {
  /* ⚠ 예전에는 자바 소스의 «낱말 목록»(value.contains("…"))을 긁어 왔다.
       2026-08-29 에 그 목록을 정규식 하나로 바꾸자 이 검사가 0개를 읽고 깨졌다 —
       뜻은 그대로인데 «모양»을 못 박고 있었던 것이다.
       더 나쁜 것: 낱말만 보다 보니 «실제 카드 문자 모양»(하나9950 승인)을 한 번도
       시험하지 않아, 폰이 카드 문자를 통째로 버리는 것을 여태 못 잡았다.
       이제 «실제 문자»를 넣어, 폰이 보내는 것은 서버도 받는지 본다. */
  const { phoneAccepts } = require('./phone-filter');
  const REAL_MSGS = [
    '[Web발신] 하나9950 승인 권*하 26,000원 일시불 08/24 08:09 스시리두정',
    '하나9950 승인취소 26,000원 08/24 09:02 스시리',
    '[Web발신] 하나카드 승인 권*하 26,000원 일시불 08/24 08:09 스시리두정',
    '[Web발신] 하나은행 08/24 08:09 입금 165,000원 주식회사주원테 잔액 53,709,193원',
    '[Web발신] 하나 08/24 08:09 입금 165,000원 주식회사주원테 잔액 53,709,193원',
    '[Web발신] KEB하나 08/24 08:09 입금 165,000원 주식회사주원테 잔액 53,709,193원',
  ];
  let sent = 0;
  REAL_MSGS.forEach(function (text) {
    if (!phoneAccepts(text)) return;      /* 폰이 안 보내면 서버 몫이 아니다 */
    sent++;
    const got = HM.parseHanaMessage(text, { now: NOW });
    assert.ok(got.ok || got.reason === 'card_cancel_review_required',
      '★ 휴대폰은 보내는데 서버가 버립니다(' + got.reason + ') — 대기함에 영영 안 들어옵니다.\n   ' + text);
  });
  assert.ok(sent >= 4, '휴대폰이 실제 문자를 너무 많이 버립니다 — 보낸 것 ' + sent + '/' + REAL_MSGS.length);
});

test('★ 휴대폰이 «실제 카드 문자» 를 버리지 않는다 (2026-08-29 에 여기서 끊겨 있었다)', () => {
  /* 카드는 「하나9950 승인 …」 처럼 하나+숫자로 온다. 폰 거르개가 「하나카드」 같은
     낱말만 보면 이 꼴을 통째로 버리고, 서버는 아무것도 못 듣는다 —
     화면에는 「연결 뒤 문자 0건」 으로만 보여 어디가 막혔는지 알 길이 없었다. */
  const { phoneAccepts, REAL } = require('./phone-filter');
  assert.ok(phoneAccepts(REAL.카드승인), '카드 승인 문자를 폰이 버린다');
  assert.ok(phoneAccepts(REAL.카드취소), '카드 취소 문자를 폰이 버린다');
  assert.ok(!phoneAccepts(REAL.인증번호), '인증번호가 든 문자를 폰이 내보낸다');
  assert.ok(!phoneAccepts(REAL.남의은행), '하나가 아닌 문자를 폰이 내보낸다');
});

test('★ 은행 이름을 줄여 보내는 실제 형식을 받는다 — 이것이 안 되던 바로 그 문자다', () => {
  const got = HM.parseHanaMessage(
    '[Web발신] 하나 08/24 08:09 352-910123-45678 입금 165,000원 주식회사주원테 잔액 53,709,193원',
    { now: NOW });
  assert.equal(got.ok, true, '★ ' + got.reason);
  assert.equal(got.transaction.src, 'bank');
  assert.equal(got.transaction.type, 'income');
  assert.equal(got.transaction.amount, 165000);
});

test('★ 통장 적요에는 «이름»만 남는다 — 업체 맞추기가 이 글로 이뤄진다', () => {
  /* 「적요 주식회사주원테」처럼 이름표가 붙으면 업체 이름과 안 맞아 손으로 찾아야 한다. */
  const got = HM.parseHanaMessage(
    '[Web발신] 하나은행 입금 165,000원 08/24 08:09 적요 주식회사주원테 잔액 53,709,193원',
    { now: NOW });
  const memo = got.transaction.memo;
  assert.equal(memo, '주식회사주원테', '★ 적요에 곁가지가 남았습니다: «' + memo + '»');
  /* ⚠ 낱말 조각으로 찾으면 안 된다 — 「주원테」 안에 «원» 이 들어 있다.
     회사 이름 안에 우연히 들어간 글자를 곁가지로 오해하는 검사는 스스로 깨진다.
     여기서 볼 것은 «이름표와 숫자가 남았는가» 다. */
  ['적요', '잔액', '입금 ', '출금 '].forEach(function (junk) {
    assert.ok(memo.indexOf(junk) < 0, '★ 적요에 «' + junk + '» 이 남아 있습니다: ' + memo);
  });
  assert.doesNotMatch(memo, /\d/, '★ 적요에 숫자가 남았습니다(계좌·금액·잔액): ' + memo);
});

test('★ 계좌번호는 적요가 아니다', () => {
  const got = HM.parseHanaMessage(
    '[Web발신] 하나 08/24 08:09 352-910123-45678 입금 165,000원 주식회사주원테 잔액 53,709,193원',
    { now: NOW });
  assert.equal(got.transaction.memo, '주식회사주원테');
});

test('★ 돈의 방향은 «먼저 나온 말»을 따른다 — 출금 문자 속 「입금계좌」에 안 속게', () => {
  /* 이것을 틀리면 나간 돈이 들어온 돈으로 잡힌다 — 표만 틀리는 것이 아니라 회계가 어긋난다. */
  const out = HM.parseHanaMessage(
    '[Web발신] 하나은행 출금 500,000원 08/24 09:00 입금계좌 352-910123-45678 홍길동 잔액 100원',
    { now: NOW });
  assert.equal(out.transaction.type, 'expense', '★ 출금 문자를 입금으로 읽었습니다.');
  assert.equal(HM.bankDirection('하나 입금 100원 출금계좌'), 'income');
});

test('잔액을 읽어 둔다 — 빠진 줄을 찾을 때 잔액이 이어지는지가 가장 빠른 길이다', () => {
  const got = HM.parseHanaMessage(
    '[Web발신] 하나은행 입금 165,000원 08/24 08:09 주원테 잔액 53,709,193원', { now: NOW });
  assert.equal(got.transaction.balance, 53709193);
  assert.equal(got.transaction.amount, 165000, '★ 잔액을 거래금액으로 읽으면 안 됩니다.');
});

test('막던 것은 그대로 막는다 — 인증번호·카드 취소·남의 은행', () => {
  /* 문을 넓혔으니 «넓어지면 안 되는 쪽»을 함께 못 박는다. */
  assert.equal(HM.parseHanaMessage('하나 08/24 08:09 인증번호 123456 입금 10,000원', { now: NOW }).reason,
    'security_message');
  /* ⚠ 2026-08-26 다시 겨눔 — 취소는 이제 «들어온다»(대기함). 대신 cancel 표가 붙어
     스스로 확정되지 않는다. 여기서 막을 것은 「모르는 사이에 처리되는 것」이지 「들어오는 것」이 아니다. */
  const _c = HM.parseHanaMessage('하나9950 승인취소 26,000원 08/23 09:02 스시리', { now: NOW });
  assert.equal(_c.ok, true, '취소를 아직 버리고 있다');
  assert.equal(_c.transaction.cancel, true, '취소 표가 없어 저절로 확정된다');
  assert.equal(HM.parseHanaMessage('[Web발신] 국민은행 입금 10,000원 08/24 09:00 홍길동', { now: NOW }).reason,
    'not_hana_transaction');
  /* 「하나」가 이름 속에 든 남의 문자까지 삼키면 안 된다 */
  assert.equal(HM.parseHanaMessage('[Web발신] 신한은행 입금 10,000원 08/24 09:00 하나로마트', { now: NOW }).reason,
    'not_hana_transaction');
});

test('★ 걸러진 «까닭»은 남기고 «원문»은 안 남긴다', () => {
  /* 까닭이 안 남으면 「문자는 왔는데 ERP에 없다」를 아무도 설명할 수 없다.
     원문을 남기면 지켜야 할 것이 하나 늘어난다 — 남길 이유가 없다. */
  assert.match(fn, /hanaNoteSkip\(linked, parsed\.reason\)/,
    '★ 걸러진 까닭을 안 적으면 왜 안 들어왔는지 물어볼 데가 없습니다.');
  assert.match(fn, /lastSkip/);
  const at = fn.indexOf('async function hanaNoteSkip(');
  assert.ok(at > 0, 'hanaNoteSkip 을 찾지 못했습니다');
  const body = fn.slice(at, fn.indexOf('\n}', at));
  assert.doesNotMatch(body, /body\.text|body\.title|rawText/,
    '★ 걸러진 문자 원문을 저장하면 안 됩니다 — 까닭만 적습니다.');
  /* 잘 들어온 뒤에는 걸러짐 표시를 지운다 — 안 지우면 옛 까닭이 계속 붙어 있다 */
  assert.match(fn, /lastOkAt: Date\.now\(\), lastSkip: null/);
  assert.match(fn, /lastSkip: \(d\.lastSkip && d\.lastSkip\.reason\)/,
    '★ pairStatus 가 안 돌려주면 화면에서 볼 수가 없습니다.');
});

test('★ 화면이 «휴대폰이 붙어 있나»를 말해 준다', () => {
  /* 이 표시가 없어서, 연결이 끊겨도 문자가 걸러져도 화면이 똑같아 보였다. */
  assert.match(erp, /hanaSmsCall\('pairStatus'\)/, '★ 상태를 안 물어보면 알 길이 없습니다.');
  assert.match(erp, /hanaStatChip\(\)/, '★ 물어보고 안 보여 주면 뜻이 없습니다.');
  assert.match(erp, /휴대폰 미연결/, '★ 「연결 안 됨」을 말해 주는 것이 이 표시의 알맹이입니다.');
  assert.match(erp, /마지막 문자 걸러짐/, '★ 걸러진 것도 말해 줘야 합니다 — 연결됐는데 안 들어오는 경우다.');
  /* 「없다」와 «모른다»를 갈라 적는다 — 세 곳에서 갈라야 한다.
     ① 아직 안 물어봤다  ② 물어봤는데 대답을 못 받았다  ③ 서버가 그 칸을 아직 안 보낸다.
     ③ 을 「한 건도 안 왔다」로 적으면, 실은 걸러진 것일 수도 있는데 화면이 그 사실을 덮는다.
     (2026-08-24 실제로 이렇게 보였다 — 서버는 옛 것인데 화면은 「받은 문자 없음」이라 단언했다) */
  assert.match(erp, /연결 상태 모름/);
  assert.match(erp, /typeof d\.lastOkAt === 'undefined'/,
    '★ 서버가 안 보낸 칸을 «0» 으로 읽으면 「문자가 한 건도 안 왔다」고 거짓말을 합니다.');
  /* ⚠ 못 박는 것은 «칸에 적힌 글자» 가 아니라 «무엇을 하면 되는지 알려 주는가» 다.
     글자를 박아 두면 말을 다듬는 것만으로 검사가 깨진다(실제로 한 번 깨졌다). */
  assert.match(erp, /firebase deploy --only functions/,
    '★ 「모른다」고만 하고 무엇을 하면 되는지 안 적으면 거기서 길이 끊깁니다.');
  assert.match(erp, /if\(!hanaStat\) return null;/,
    '★ 물어보기 «전»에 무엇이든 그리면 그것이 거짓말이 됩니다.');
  /* 까닭은 사람 말로 — 영어 코드만 보여 주면 물어볼 곳이 없다 */
  assert.match(erp, /HANA_SKIP_KO/);
  ['not_hana_transaction', 'security_message', 'unsupported_message_app'].forEach(function (r) {
    assert.ok(erp.indexOf(r + ':') > 0, '★ ' + r + ' 의 우리말이 없습니다.');
  });
});

test('★ 조용히 도는 것은 조용히 실패한다', () => {
  /* 거래내역을 열면 문자를 자동으로 한 번 가져온다. 재무 담당이 아닌 사람은
     여기서 403 이 나는데, 그때마다 붉은 알림이 떴다 — 자기가 뭘 잘못한 줄 안다. */
  const at = erp.indexOf('async function importHanaSms(silent){');
  assert.ok(at > 0, 'importHanaSms 를 찾지 못했습니다');
  const body = erp.slice(at, erp.indexOf('\n  /* 거래내역 화면을 열면', at));
  assert.match(body, /if\(!silent\) showToast\('❌ 거래문자를 가져오지 못했습니다/,
    '★ 조용한 실행이 시끄럽게 실패하면, 아무 상관 없는 사람이 놀랍니다.');
});

test('★ 연결 창이 «앱을 어디서 받는지»부터 알려 준다', () => {
  /* 2026-08-24 대표: 「못찾겠다 그리고 푸른하나문자도」.
     창은 8자리 번호만 크게 띄우고 「휴대폰 앱에서…」로 시작했다 — 앱이 이미
     깔려 있다고 친 것이다. 앱이 없으면 그 번호는 아무 데도 넣을 수 없다.
     ★ 못 박는 것은 문장이 아니라 «네 가지가 창 안에 있는가» 다.
       ① 앱 이름 ② 받는 곳 ③ 알림 접근을 «앱 안에서» 켠다 ④ 절전이 앱을 재운다 */
  const at = erp.indexOf("'📱 권형하 휴대폰 연결'");
  assert.ok(at > 0, '연결 창을 찾지 못했습니다');
  const win = erp.slice(at, at + 3000);
  assert.match(win, /푸른 하나문자 연결/, '★ 앱 이름이 없으면 무엇을 찾을지 모릅니다.');
  assert.match(win, /build-hana-sms-bridge/,
    '★ 받는 곳이 없으면 앱이 없는 사람은 여기서 길이 끊깁니다.');
  assert.match(win, /알림 접근 허용/);
  assert.match(win, /절전/, '★ 절전이 앱을 재운다는 것을 안 적으면 연결하고도 문자가 안 옵니다.');
});

test('★ 「연결됨」이 «앱이 폰에 있다»는 뜻으로 읽히지 않게 한다', () => {
  /* 앱을 지우거나 다시 깔아도 서버의 연결 기록은 그대로 남는다. 그래서 앱이 없는
     휴대폰인데도 화면은 「연결됨」이라고 적었다(2026-08-24 대표 화면).
     ★ 언제 맺은 연결인지를 함께 적어야 「어제 시험 삼아 맺은 것」임을 알아본다.
     ★ 맺은 지 한참인데 한 건도 없으면 «볼 곳 셋»을 일러 준다 — 단정하지는 않는다.
       (그냥 거래가 없었을 수도 있다) */
  assert.match(erp, /d\.pairedAt \? \(' · ' \+ when\(d\.pairedAt\)/,
    '★ 언제 맺은 연결인지 없으면 옛 기록과 지금 것을 가릴 수 없습니다.');
  assert.match(erp, /연결 뒤 문자 0건/);
  assert.match(erp, /앱이 지워졌다/);
  assert.match(erp, /그냥 거래가 없었을 수도 있습니다/,
    '★ 단정하면 거래가 뜸한 달에 없는 고장을 쫓게 됩니다.');
});
