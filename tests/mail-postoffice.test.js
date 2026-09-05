/* 보내는 주소를 보고 «어느 우체국»으로 가는가 — 대표 지시 2026-09-05
   ═══════════════════════════════════════════════════════════════════════════
   「fairrunlabor.com 이것으로 모두 진행하자 … 뉴스레터」

   지금까지 메일 나가는 길은 다음메일 하나뿐이었다. 뉴스레터를 푸른 도메인으로
   보내려면 다음으로는 안 된다 — 다음은 «자기 손님 주소»로만 보내 준다.

   왜 Resend 가 아닌가: 무료가 하루 100통인데 받는 곳이 114 곳이라 한 회차가
   다 안 나간다(유료 월 $20). 구글 워크스페이스는 이미 쓰고 계시고 하루 2,000통이다.

   ★ 이 검사가 지키는 것
     ① 푸른 도메인은 «구글»로, 그 밖은 «다음»으로 — 지금 돌고 있는 자료 발송이
        조용히 길을 잃으면 안 된다
     ② 구글은 아이디가 «주소 전체»여야 한다 (앞부분만 주면 535)
     ③ 구글은 틀린 아이디로 여러 번 두드리면 «계정을 잠근다» — 한 번만 두드린다
     ④ 앱 비밀번호의 «띄어쓰기»를 걷는다 (구글이 띄어서 보여 준다)
     ⑤ 열쇠가 없을 때 «어느 열쇠»가 없는지 말한다
     ⑥ 받는 길(IMAP)은 다음메일 그대로 — 여기 손대면 급여자료 수신이 멎는다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.join(__dirname, '..');
const MD = require(path.join(뿌리, 'functions', 'mail-deliver.js'));

/* ═══ ① 어느 우체국인가 ═══════════════════════════════════════════════ */

test('★ 푸른 도메인은 «구글»로 간다', () => {
  assert.equal(MD.우체국고르기('fairrun01@fairrunlabor.com').이름, '구글');
  assert.equal(MD.우체국고르기('newsletter@fairrunlabor.com').이름, '구글');
  assert.equal(MD.우체국고르기('푸른노무법인 <fairrun01@fairrunlabor.com>').이름, '구글',
    '★ 「이름 <주소>」 꼴을 못 알아본다 — 실제로 이 꼴로 넘어온다');
});

test('★ 지금 돌고 있는 다음메일은 «그대로» 다음으로 간다', () => {
  /* 자료 발송이 이 길로 매일 돈다. 여기가 어긋나면 조용히 멎는다. */
  ['370-6@daum.net', '370-6@hanmail.net', '아무개@kakao.com'].forEach((a) => {
    assert.equal(MD.우체국고르기(a).이름, '다음', a + ' 가 다음으로 안 간다');
  });
});

test('★ 모르는 도메인은 «다음»으로 둔다 — 길을 잃지 않게', () => {
  assert.equal(MD.우체국고르기('someone@example.com').이름, '다음');
  assert.equal(MD.우체국고르기('').이름, '다음');
  assert.equal(MD.우체국고르기(null).이름, '다음');
});

test('도메인만 떼어 내는 것이 맞다', () => {
  assert.equal(MD.도메인만('a@B.CoM'), 'b.com', '대소문자를 가린다');
  assert.equal(MD.도메인만('푸른 <a@b.com>'), 'b.com');
  assert.equal(MD.도메인만('주소아님'), '');
});

/* ═══ ② ③ 구글 아이디 ═══════════════════════════════════════════════ */

test('★ 구글 아이디는 «주소 전체»다 — 앞부분만 주면 535 다', () => {
  const ids = MD.loginIds('fairrun01@fairrunlabor.com', 'envId무시');
  assert.deepEqual(ids, ['fairrun01@fairrunlabor.com']);
});

test('★ 구글은 «한 번만» 두드린다 — 여러 번이면 계정이 잠긴다', () => {
  const ids = MD.loginIds('푸른노무법인 <fairrun01@fairrunlabor.com>', '370-6');
  assert.equal(ids.length, 1, '★ 아이디를 여럿 돌려 본다 — 구글이 계정을 잠근다');
  assert.equal(ids[0], 'fairrun01@fairrunlabor.com', '★ 「이름 <주소>」에서 주소만 떼지 못했다');
});

test('다음메일은 예전처럼 «여러 아이디»를 돌려 본다', () => {
  /* 다음은 「370-6」으로도 「370-6@daum.net」으로도 되는 계정이 있어 둘 다 해 왔다.
     그 짜임을 구글 때문에 망가뜨리면 안 된다. */
  /* ⚠ envId 를 «주지 않고» 본다. envId 를 주면 그것 하나만으로도 개수가 차서,
       정작 「앞부분으로도 해 보는가」가 사라져도 검사가 통과한다. */
  const ids = MD.loginIds('370-6@daum.net');
  assert.ok(ids.indexOf('370-6') >= 0, '★ 앞부분(370-6)으로 해 보는 길이 사라졌다');
  assert.ok(ids.indexOf('370-6@daum.net') >= 0, '★ 주소 전체로 해 보는 길이 사라졌다');
  /* envId 가 있으면 그것이 «맨 앞»이다 — 설정이 뒤로 밀리면 안 된다 */
  assert.equal(MD.loginIds('370-6@daum.net', 'envId')[0], 'envId');
});

/* ═══ ④ 앱 비밀번호 다듬기 ═══════════════════════════════════════════ */

test('★ 구글 앱 비밀번호의 «띄어쓰기»를 걷는다', () => {
  /* 구글은 abcd efgh ijkl mnop 처럼 띄어서 보여 준다.
     그대로 붙여넣으면 535 가 나는데, 사람은 「비밀번호가 틀렸나」만 의심한다. */
  const 구글 = MD.우체국고르기('a@fairrunlabor.com');
  assert.equal(구글.열쇠다듬기('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.equal(구글.열쇠다듬기(' abcd\tefgh\n'), 'abcdefgh');
});

test('다음메일 열쇠는 «건드리지 않는다»', () => {
  /* 다음 앱 비밀번호에 띄어쓰기가 들어 있을 수 있다 — 걷으면 오히려 틀려진다 */
  const 다음 = MD.우체국고르기('a@daum.net');
  assert.equal(다음.열쇠다듬기('a b c'), 'a b c');
});

/* ═══ ⑤ 열쇠 이름·안내 ═══════════════════════════════════════════════ */

test('★ 우체국마다 «다른 열쇠»를 본다', () => {
  assert.equal(MD.우체국고르기('a@fairrunlabor.com').열쇠이름, 'GOOGLE_MAIL_PASSWORD');
  assert.equal(MD.우체국고르기('a@daum.net').열쇠이름, 'DAUM_MAIL_PASSWORD');
});

test('★ «자리만 잡아 둔 표»를 진짜 열쇠로 여기지 않는다', () => {
  /* 파이어베이스는 값이 없는 비밀값을 달고 함수를 못 올린다 — 선언만 해 두면
     그날부터 메일 함수 배포가 통째로 막힌다. 그래서 자리표를 넣어 두었다.
     ⚠ 그것을 진짜 열쇠로 여기면, 그 표로 로그인하려다 535 를 받고
       사람은 「비밀번호가 틀렸나」를 의심하며 엉뚱한 곳을 헤맨다. */
  assert.equal(typeof MD.아직안넣음, 'function', '★ 자리표를 알아보는 부품이 없다');
  assert.equal(MD.아직안넣음(MD.아직안넣은표), true);
  assert.equal(MD.아직안넣음(' ' + MD.아직안넣은표 + ' '), true, '앞뒤 공백에 속지 않는다');
  assert.equal(MD.아직안넣음('abcdefghijklmnop'), false, '★ 진짜 열쇠를 자리표로 여긴다');
  assert.equal(MD.아직안넣음(''), false);
  /* 그리고 실제로 «보내기 전에» 그것을 물어봐야 한다 */
  assert.ok(/if \(!pass \|\| 아직안넣음\(pass\)\)/.test(배달),
    '★ 자리표를 그대로 들고 로그인하러 간다');
});

test('★ 열쇠가 없을 때 «어느 열쇠»가 없는지 말한다', () => {
  /* 「메일 비밀번호가 없습니다」 한 줄만 주면 다음 열쇠를 다시 넣어 보다 시간을 버린다 */
  const 구글안내 = MD.우체국고르기('a@fairrunlabor.com').안내;
  assert.ok(/GOOGLE_MAIL_PASSWORD/.test(구글안내), '★ 구글 열쇠 이름을 안 말한다');
  assert.ok(/앱 비밀번호/.test(구글안내), '★ 어디서 만드는지를 안 말한다');
  const 다음안내 = MD.우체국고르기('a@daum.net').안내;
  assert.ok(/DAUM_MAIL_PASSWORD/.test(다음안내));
});

/* ═══ ⑥ 서버가 실제로 이 길을 쓰는가 ═══════════════════════════════ */

/* 주석을 걷고 본다 — 이 저장소 주석에 사연이 그대로 적혀 있다.
   ⚠ 걷는 부품은 tests/helpers 한 자리에 있다(베껴 두었다가 정규식 리터럴을
     몰라 검사 넷이 한꺼번에 이빨을 잃은 적이 있다, 2026-09-05). */
const { 주석걷기 } = require('./helpers/strip-comments.js');

const 서버 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'index.js'), 'utf8'));
const 배달 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'mail-deliver.js'), 'utf8'));

test('★ 실제로 «고른 우체국»으로 붙는다 — 다음메일에 못 박혀 있지 않다', () => {
  assert.ok(/host:\s*우체국\.host/.test(배달), '★ 아직 한 우체국에 못 박혀 있다');
  assert.ok(/port:\s*우체국\.port/.test(배달));
});

test('★ 보낼 때 «주소에 맞는 열쇠»를 준다', () => {
  /* ⚠ 「mailPass(from)」 만 찾으면 «함수를 만드는 줄»(function mailPass(from))에
       걸려 통과한다 — 부르는 자리를 봐야 한다. 그래서 pass: 를 붙여 본다. */
  assert.ok(/pass:\s*mailPass\(from\)/.test(서버), '★ 「지금 보내기」가 주소를 안 보고 열쇠를 고른다');
  assert.ok(/pass:\s*mailPass\(이통from\)/.test(서버), '★ 「예약 발송」이 주소를 안 보고 열쇠를 고른다');
  /* 보내는 자리에서 «빈손으로» 부르는 곳이 남아 있으면 안 된다 */
  assert.ok(!/pass:\s*mailPass\(\)/.test(서버), '★ 아직 주소 없이 열쇠를 고르는 발송 자리가 있다');
});

test('★ 보내는 함수가 구글 열쇠를 «받도록» 선언돼 있다', () => {
  /* 선언 안 하면 파이어베이스가 열쇠를 안 넣어 준다 — 값이 있어도 빈 채로 돈다 */
  const 줄들 = 서버.split('\n');
  ['sendMaterialMail', 'sendScheduledMail'].forEach((이름) => {
    const i = 줄들.findIndex((l) => l.indexOf('exports.' + 이름) >= 0);
    assert.ok(i >= 0, 이름 + ' 함수가 없다');
    const 머리 = 줄들.slice(i, i + 6).join(' ');
    assert.ok(/GOOGLE_MAIL_PASSWORD/.test(머리), '★ ' + 이름 + ' 이 구글 열쇠를 안 받는다');
  });
});

test('★ 메일 «받는» 길은 다음메일 그대로다 — 손대면 급여자료 수신이 멎는다', () => {
  const 줄들 = 서버.split('\n');
  ['receivePaydataMail', 'pullPaydataMail'].forEach((이름) => {
    const i = 줄들.findIndex((l) => l.indexOf('exports.' + 이름) >= 0);
    assert.ok(i >= 0, 이름 + ' 함수가 없다');
    const 머리 = 줄들.slice(i, i + 6).join(' ');
    assert.ok(/DAUM_MAIL_PASSWORD/.test(머리), '★ ' + 이름 + ' 의 다음메일 열쇠가 사라졌다');
  });
  assert.ok(/const pass = mailPass\(\);/.test(서버),
    '★ 받는 길이 주소로 열쇠를 고르려 든다 — 받는 곳은 다음메일 하나다');
});
