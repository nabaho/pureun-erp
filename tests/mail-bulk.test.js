/* 여러 곳에 「한 통씩」 보내기 — 나눠 담는 층 (functions/mail-bulk.js)
   실행: node --test tests/*.test.js

   대표 지시 2026-08-15: 300곳 미만에 한 번에 보내기.

   여기서 못 박는 것은 **한꺼번에 쏟지 않는 것**이다. 다음메일은 대량 발송용
   계정이 아니라 몰아 보내면 막힌다. 계정이 막히면 평소 자료 발송까지 멈춘다 —
   그게 가장 나쁜 결과다. 그래서 간격·상한·중복 걸러내기를 여기서 지킨다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../functions/mail-bulk.js');

const T = (email, name, company) => ({ email, name, company });

/* ── 받는 곳 다듬기 ── */

test('주소가 없거나 형식이 틀린 곳은 걸러낸다', () => {
  const r = B.cleanTargets([T('a@x.kr','가','가사'), T('','나','나사'), T('엉망','다','다사')]);
  assert.equal(r.ok.length, 1);
  assert.equal(r.bad, 2);
});

test('★ 같은 주소가 겹치면 한 번만 보낸다', () => {
  /* 안 걸러내면 한 곳이 같은 메일을 두 통 받는다. */
  const r = B.cleanTargets([T('a@x.kr','가','가사'), T('A@X.KR','가','가사')]);
  assert.equal(r.ok.length, 1);
  assert.equal(r.dup, 1);
  assert.equal(r.ok[0].email, 'a@x.kr', '대소문자를 맞춰 견준다');
});

test('이름·회사가 길어도 잘라서 담는다', () => {
  const r = B.cleanTargets([T('a@x.kr', 'ㄱ'.repeat(200), 'ㄴ'.repeat(300))]);
  assert.ok(r.ok[0].name.length <= 60);
  assert.ok(r.ok[0].company.length <= 120);
});

test('목록이 없거나 이상해도 터지지 않는다', () => {
  assert.equal(B.cleanTargets(null).ok.length, 0);
  assert.equal(B.cleanTargets([null, 3, 'a@x.kr']).ok.length, 0);
});

/* ── 간격 ── */

test('★ 간격을 0 이나 음수로 넣어도 한꺼번에 안 쏟는다', () => {
  /* 이 빗장이 없으면 300통이 동시에 나가 계정이 막힌다. */
  assert.equal(B.spacingMs(0), B.DEFAULT_SPACING_SEC * 1000);
  assert.equal(B.spacingMs(-100), B.DEFAULT_SPACING_SEC * 1000);
  assert.equal(B.spacingMs('엉망'), B.DEFAULT_SPACING_SEC * 1000);
  assert.ok(B.spacingMs(1) >= B.MIN_SPACING_SEC * 1000, '너무 짧은 간격도 최소치로 올린다');
});

test('간격은 정한 범위 안에서만', () => {
  assert.equal(B.spacingMs(30), 30000);
  assert.equal(B.spacingMs(99999), B.MAX_SPACING_SEC * 1000);
});

/* ── 걸기 전 검사 ── */

test('보낼 곳이 없으면 안 건다', () => {
  const r = B.validateBulk({ to: [], subject: '제목', body: '본문' });
  assert.equal(r.ok, false);
  assert.match(r.error, /주소가 없습니다/);
});

test('★ 한 번에 걸 수 있는 곳 수에 상한이 있다', () => {
  /* 실수로 6천 곳을 걸면 계정이 막힌다. */
  const many = Array.from({length: B.MAX_BULK + 1}, (_, i) => T('u' + i + '@x.kr', '사람' + i, '회사'));
  const r = B.validateBulk({ to: many, subject: '제목', body: '본문' });
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(B.MAX_BULK + '곳까지'));
});

test('제목이나 본문이 비면 안 건다 — 빈 편지가 300곳에 간다', () => {
  const base = { to: [T('a@x.kr','가','가사')] };
  assert.equal(B.validateBulk(Object.assign({}, base, { subject:'', body:'본문' })).ok, false);
  assert.equal(B.validateBulk(Object.assign({}, base, { subject:'제목', body:'  ' })).ok, false);
});

test('제목의 줄바꿈은 지운다 — 헤더를 끼워 넣는 길이 된다', () => {
  const r = B.validateBulk({ to:[T('a@x.kr','가','가사')], subject:'제목\nBcc: 나쁜곳@x.kr', body:'본문' });
  assert.ok(!/\n/.test(r.subject));
});

test('자료는 10개까지만 붙인다', () => {
  const r = B.validateBulk({ to:[T('a@x.kr','가','가사')], subject:'제', body:'본',
    matIds: Array.from({length:20},(_,i)=>'m'+i) });
  assert.equal(r.matIds.length, 10);
});

/* ── 담을 것 만들기 ── */

const V = () => B.validateBulk({
  to: [T('a@x.kr','김철수','가나상사'), T('b@x.kr','박영희','다라산업')],
  subject: '[푸른] {회사} 담당자님께', body: '{회사} {이름} 님, 안녕하세요.',
  matIds: ['m1'], spacingSec: 15,
});

test('★ 받는 곳마다 한 통씩, 이름·회사가 그 곳 것으로 바뀐다', () => {
  const q = B.buildQueue(V(), 1000, 'p001@pureun.kr', 'batch1');
  assert.equal(q.length, 2);
  assert.equal(q[0].payload.to, 'a@x.kr');
  assert.equal(q[0].payload.subject, '[푸른] 가나상사 담당자님께');
  assert.equal(q[0].payload.body, '가나상사 김철수 님, 안녕하세요.');
  assert.equal(q[1].payload.subject, '[푸른] 다라산업 담당자님께');
});

test('★ 한 통에 한 곳만 — 서로의 주소가 안 보인다', () => {
  const q = B.buildQueue(V(), 1000, 'p001@pureun.kr', 'b1');
  q.forEach(row => {
    assert.ok(!/[,;]/.test(row.payload.to), '한 통에 여러 주소가 들어 있습니다');
    assert.ok(!row.payload.cc && !row.payload.bcc, '참조가 붙어 있습니다');
  });
});

test('★ 통마다 시간을 벌린다 — 한꺼번에 안 나간다', () => {
  const q = B.buildQueue(V(), 1000, 'p001@pureun.kr', 'b1');
  assert.equal(q[1].at - q[0].at, 15000);
});

test('첫 통도 곧바로 보내지 않는다 — 「아차」 할 틈을 남긴다', () => {
  const q = B.buildQueue(V(), 1000, 'p001@pureun.kr', 'b1');
  assert.ok(q[0].at > 1000, '첫 통이 지금 당장 나갑니다');
});

test('누가 걸었는지 통마다 적어 둔다 — 보낼 때는 사람이 없다', () => {
  const q = B.buildQueue(V(), 1000, 'p001@pureun.kr', 'b1');
  q.forEach(row => assert.equal(row.by, 'p001@pureun.kr'));
});

test('한 묶음인 것과 몇 번째인지 적어 둔다 — 화면이 진행을 보여줄 수 있게', () => {
  const q = B.buildQueue(V(), 1000, 'p001@pureun.kr', 'b7');
  assert.equal(q[0].bulk, 'b7');
  assert.deepEqual([q[0].bulkNo, q[0].bulkOf], [1, 2]);
  assert.deepEqual([q[1].bulkNo, q[1].bulkOf], [2, 2]);
});

test('모두 「기다리는 중」으로 담긴다 — 예약 발송기가 집어 갈 표시', () => {
  const q = B.buildQueue(V(), 1000, 'p001@pureun.kr', 'b1');
  q.forEach(row => assert.equal(row.state, 'waiting'));
});

/* ── 글자 바꿔 넣기 ── */

test('값이 없는 자리는 빈칸으로 지운다 — 「{회사}」가 그대로 나가면 안 된다', () => {
  assert.equal(B.fill('{회사} {이름} 님', { 이름:'김철수' }), ' 김철수 님');
});

test('바꿀 것이 없으면 그대로', () => {
  assert.equal(B.fill('안녕하세요', {}), '안녕하세요');
  assert.equal(B.fill(null, {}), '');
});

test('한글·영문 이름표를 모두 알아본다', () => {
  assert.equal(B.fill('{company}/{회사}', { 회사:'가나', company:'가나' }), '가나/가나');
});

/* ── 얼마나 걸리는지 ── */

/* ⚠ 2026-09-02 여기가 «세 배» 틀려 있었다. 예약 간격(15초)을 곧 발송 속도로 여겼는데,
     간격은 «언제 차례가 되는가»만 정하고 실제로 빼 가는 것은 예약 발송기다.
     2026-08-15 에 지을 때는 발송기가 5분마다 20통(시간당 240통)이라 15초 간격과 값이
     같았고 그래서 참이었다. 2026-08-23 f315f813 이 비용을 줄이려 15분마다로 바꾸면서
     시간당 80통이 되었는데 여기는 안 따라왔다. 300곳이면 화면은 「1시간 15분」이라
     해 놓고 실제로는 3시간 45분이 걸렸다.
     ★ 그리고 «이 검사가 그 틀린 값을 못 박고 있었다» — 그래서 아무도 못 봤다. */

test('★ 예약 간격이 아니라 «발송기가 빼 가는 속도»로 셈한다', () => {
  /* 간격을 아무리 좁혀도 발송기보다 빨리 나갈 수는 없다. */
  assert.equal(B.etaText(300, 15000), '약 3시간 45분', '300곳 — 발송기 속도를 안 봤습니다');
  assert.equal(B.etaText(88, 15000), '약 1시간 15분', '88곳');
  assert.equal(B.etaText(B.MAX_BULK, 15000), '약 5시간', '상한 400곳');
});

test('★ 간격이 발송기보다 느리면 그때는 간격이 셈을 정한다', () => {
  /* 둘 가운데 «늦은 쪽»이 답이다. 한쪽만 보면 또 어긋난다. */
  assert.equal(B.etaText(20, 600000), '약 3시간 20분', '10분 간격 20곳 — 간격을 안 봤습니다');
});

test('한 통이라도 발송기를 한 바퀴 기다린다', () => {
  /* 발송기가 15분마다 도니 「약 1분」이라 해 놓으면 그것도 거짓이다. */
  assert.equal(B.etaText(1, 15000), '약 15분');
});

test('언제 다 나가는지 사람 말로 알려 준다', () => {
  assert.equal(B.etaText(21, 15000), '약 30분', '한 바퀴를 넘으면 두 바퀴를 기다린다');
  assert.match(B.etaText(300, 15000), /^약 \d+시간( \d+분)?$/, '한 시간이 넘으면 시간·분으로');
});

/* ── 보내는 주소 고르기 ─────────────────────────────────────────────── */

/* 대표 지시 2026-09-03: 「뉴스레터 발송시에는 푸른노무법인 메일 370-6@hanmail.net
     주소로 송부되어야 한다. 이부분 명확하게 해야한다」

   ★ 원본 뉴스레터가 실제로 그 주소에서 나갔다(보낸메일함 실측 2026-09-02).
     hanmail.net 과 daum.net 은 «같은 사서함»이다 — 다음 별칭.

   ⚠ 그런데 보내는 주소는 자료 발송·예약 발송이 «함께 쓰는 한 곳»이다
     (pucards/config/matMail/from). 거기를 바꾸면 평소 자료 발송까지 흔들린다.
     그래서 뉴스레터만 따로 쓰게 한다.

   ⚠ 화면이 «아무 주소나» 넣게 두면 안 된다 — 남의 이름으로 보내는 길이 된다.
     그래서 서버가 조인다: 앞부분(사서함 이름)이 로그인 계정과 «같아야» 하고,
     도메인은 daum.net / hanmail.net 둘만 — 그 둘이 같은 사서함이기 때문이다. */
test('★ 같은 사서함의 별칭이면 허용한다 — hanmail 로 보낼 수 있다', () => {
  assert.equal(B.보내는주소고르기('370-6@hanmail.net', '370-6@daum.net'), '370-6@hanmail.net');
  assert.equal(B.보내는주소고르기('370-6@daum.net', '370-6@daum.net'), '370-6@daum.net');
  assert.equal(B.보내는주소고르기('370-6@HANMAIL.NET', '370-6@daum.net'), '370-6@hanmail.net',
    '대소문자를 맞춰 준다');
});

test('★ 사서함 이름이 다르면 «거절하고» 계정 주소로 보낸다 — 남의 이름을 못 쓴다', () => {
  assert.equal(B.보내는주소고르기('someone@hanmail.net', '370-6@daum.net'), '370-6@daum.net');
  assert.equal(B.보내는주소고르기('370-6@gmail.com', '370-6@daum.net'), '370-6@daum.net',
    '같은 사서함이 아닌 도메인은 안 된다');
  assert.equal(B.보내는주소고르기('엉망', '370-6@daum.net'), '370-6@daum.net');
});

test('비어 있으면 계정 주소를 그대로 쓴다 — 예전처럼 돈다', () => {
  assert.equal(B.보내는주소고르기('', '370-6@daum.net'), '370-6@daum.net');
  assert.equal(B.보내는주소고르기(null, '370-6@daum.net'), '370-6@daum.net');
  assert.equal(B.보내는주소고르기(undefined, ''), '');
});

test('★ 원하는 보내는 주소를 «통마다» 지니고 간다', () => {
  /* sendBulkMail 은 예약만 걸고, 실제 발송은 15분 뒤 sendScheduledMail 이 한다.
     그때는 「이 통이 뉴스레터였다」는 것을 알 길이 통 안뿐이다.
     ⚠ 조이기(보내는주소고르기)는 «보낼 때» 서버가 한다 — 여기서는 소망만 담는다.
       화면이 담은 값을 그대로 믿고 보내면 남의 이름으로 보내는 길이 된다. */
  const v = B.validateBulk({
    to: [T('a@x.kr', '가', '가사')], subject: '제', body: '본',
    from: '370-6@hanmail.net'
  });
  assert.equal(v.ok, true);
  assert.equal(v.fromWish, '370-6@hanmail.net');
  const q = B.buildQueue(v, 0, 'me@x.kr', 'b1');
  assert.equal(q[0].fromWish, '370-6@hanmail.net', '통에 안 실렸습니다');
});

test('보내는 주소를 안 주면 통에 아무것도 안 싣는다 — 예전처럼 계정 주소로 나간다', () => {
  const v = B.validateBulk({ to: [T('a@x.kr', '가', '가사')], subject: '제', body: '본' });
  assert.equal(v.fromWish, '');
  const q = B.buildQueue(v, 0, 'me@x.kr', 'b1');
  assert.ok(!q[0].fromWish, '빈 값을 실었습니다');
});

test('★ 통마다 «추적열쇠»를 채운다 — 안 채우면 모두가 같은 사람으로 찍힌다', () => {
  /* 편지 몸통은 한 번만 만들어지고 {추적열쇠} 가 그대로 들어 있다.
     보낼 때 통마다 그 사람 주소로 바뀌어야 «누가» 열었는지 알 수 있다. */
  const v = B.validateBulk({
    to: [T('a.b@x.kr', '가', '가사'), T('c@y.kr', '나', '나사')],
    subject: '제', body: '본',
    html: '<img src="https://fn/newsOpen?i=w1&e={추적열쇠}">'
  });
  const q = B.buildQueue(v, 0, 'me@x.kr', 'b1');
  assert.match(q[0].payload.html, /e=a_b@x_kr/, '첫 통에 그 사람 주소가 안 들어갔습니다');
  assert.match(q[1].payload.html, /e=c@y_kr/, '둘째 통이 다른 주소여야 합니다');
  assert.ok(!/\{추적열쇠\}/.test(q[0].payload.html), '바꿀 자리가 남았습니다');
});

test('★ 추적열쇠는 파이어베이스 열쇠에 쓸 수 있는 모양이다', () => {
  /* .#$/[] 가 들어가면 그 자리에 쓰다가 터진다. news-track 주소열쇠와 «같은 잣대»여야 한다. */
  const v = B.validateBulk({
    to: [T('A.B#C@x.kr', '가', '가사')], subject: '제', body: '본',
    html: '{추적열쇠}'
  });
  const q = B.buildQueue(v, 0, 'me@x.kr', 'b1');
  assert.equal(q[0].payload.html, 'a_b_c@x_kr');
});

test('★ 통에 채우는 추적열쇠와 서버가 세는 주소열쇠가 «같은 잣대»다', () => {
  /* 두 곳이 다르면 적는 자리와 세는 자리가 어긋나 «열람이 영영 0» 이 된다.
     화면은 멀쩡해 보이는데 미열람만 쌓인다 — 눈으로는 못 잡는다. */
  const NT = require('../functions/news-track.js');
  ['A.B#C@x.kr', 'a@x.co.kr', '  X$Y@z.kr  ', 'hong@abc.co.kr'].forEach(function (e) {
    const v = B.validateBulk({ to: [{ email: e, name: '가' }], subject: '제', body: '본',
                               html: '{추적열쇠}' });
    assert.equal(v.ok, true, e + ' 가 안 담겼습니다');
    const q = B.buildQueue(v, 0, 'me@x.kr', 'b1');
    assert.equal(q[0].payload.html, NT.주소열쇠(e),
      e + ' — 통과 서버가 다른 열쇠를 씁니다');
  });
});

test('★ 추적 그림 주소가 발송기를 «통과»한다 — 안 그러면 열람이 안 찍힌다', () => {
  /* 발송기는 남의 도메인 그림을 버린다(열람 추적이 새 나가는 것을 막는 규칙).
     우리 함수 주소를 허용 목록에 넣지 않으면 «우리 추적 그림도 함께 버려진다». */
  const MS = require('../functions/mail-send.js');
  const 밑 = 'https://asia-northeast3-pureun-erp.cloudfunctions.net';
  const html = '<img src="' + 밑 + '/newsOpen?i=w1&e=a@x_kr" width="1" height="1">';
  const 씻긴 = MS.sanitizeHtml(html);
  assert.match(씻긴, /newsOpen/, '발송기가 추적 그림을 버렸습니다 — 열람이 영영 안 찍힙니다');
});

test('★ 그래도 «남의» 도메인 그림은 계속 버린다 — 규칙을 열어 준 것이 아니다', () => {
  const MS = require('../functions/mail-send.js');
  ['https://evil.example.com/p.gif', 'https://tracker.kr/1x1.png']
    .forEach(function (u) {
      const 씻긴 = MS.sanitizeHtml('<img src="' + u + '">');
      assert.ok(씻긴.indexOf(u) < 0, '남의 그림이 통과했습니다: ' + u);
    });
});
