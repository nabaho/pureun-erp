/* 보낸 결과 — 나갔나 · 열람 · 반송/자동회신 (대표 지시 2026-09-03)
   ═══════════════════════════════════════════════════════════════════════════
   「수신확인과 안읽음등을 모두 확인해야한다.
     푸른메일함에 연결해서 모두 찾아서 확인할 수 있어야한다」

   ★★ 왜 이제 만들었나 — 셋 다 «이미 쌓이고 있었는데 아무 데도 안 보였다».
     열람은 newsletter/opens 에, 나갔나는 대기열에, 반송은 푸른메일함에
     들어와 있었는데 그것을 읽는 화면이 한 곳도 없었다(2026-09-05 전수 확인).
     모으기만 하고 안 보여 주면 없는 것과 같다.

   ★ 이 검사가 지키는 규칙
     ① 「대기열에 없다」만으로 «나갔다»고 하지 않는다 — 걸 때 찍은 보냄표가 갈라 준다.
        (안 나간 것을 나갔다고 하면 대표가 그 곳에 다시 안 보낸다)
     ② 열람은 «나간 것» 가운데 센다 — 분모가 커지면 열람률이 낮게 보이고
        그 숫자로 명단을 자르게 된다.
     ③ 주소열쇠는 서버와 «같은 규칙»이어야 한다 — 어긋나면 열람이 한 건도 안 붙는다.
     ④ 못 맞춘 반송은 «세어서 알린다» — 조용히 버리면 이 기능을 아무도 안 믿는다. */

const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/pu-news-core.js');

/* ═══ ③ 주소열쇠 — 서버와 같은 규칙인가 ═══════════════════════════════ */

test('★ 주소열쇠가 서버(news-track.js)와 «같은 규칙»이다', () => {
  const NT = require('../functions/news-track.js');
  ['A.b@Pureun.KR', 'a#b@x.com', 'a[1]@y.co.kr', '  Mixed@CASE.com  '].forEach((a) => {
    assert.equal(C.주소열쇠(a), NT.주소열쇠(a),
      '★ 화면과 서버의 주소열쇠가 다르다 — 열람이 한 건도 안 붙는다: ' + a);
  });
});

test('파이어베이스가 못 쓰는 글자를 밑줄로 바꾼다', () => {
  assert.equal(C.주소열쇠('a.b@c.com'), 'a_b@c_com');
  assert.ok(!/[.#$/[\]]/.test(C.주소열쇠('a.b#c$d/e[f]@g.com')));
});

/* ═══ ① 보낸 상태 ═══════════════════════════════════════════════════ */

test('★ 걸지도 않은 곳을 «나갔다»고 하지 않는다', () => {
  /* 대기열에 없는 것은 «나갔다»일 수도, «애초에 안 걸렸다»일 수도 있다.
     보냄표가 그 둘을 가른다. 안 가르면 안 받은 곳에 다시 안 보낸다. */
  assert.equal(C.보낸상태({ 보냄표: false, 나갔나: '모름' }), '안걺');
  assert.equal(C.보낸상태({}), '안걺');
  assert.equal(C.보낸상태(null), '안걺');
});

test('★ 걸었고 대기열에 없으면 «나감»이다 — 서버가 보낸 뒤 그 줄을 지운다', () => {
  assert.equal(C.보낸상태({ 보냄표: true, 나갔나: '모름' }), '나감');
});

test('아직 대기열에 있으면 «대기»다', () => {
  assert.equal(C.보낸상태({ 보냄표: true, 나갔나: 'waiting' }), '대기');
  assert.equal(C.보낸상태({ 보냄표: true, 나갔나: 'sending' }), '대기');
});

test('★ 탈이 난 것은 «실패»다 — 대기로 묻히면 영영 안 고친다', () => {
  assert.equal(C.보낸상태({ 보냄표: true, 나갔나: 'error' }), '실패');
  assert.equal(C.보낸상태({ 보냄표: true, 나갔나: 'waiting', 오류: '535 …' }), '실패',
    '★ 탈이 적혀 있는데 대기라고 한다');
});

/* ═══ 열람 붙이기 ═══════════════════════════════════════════════════ */

test('열람 표를 명단 줄에 붙인다', () => {
  const 줄들 = [{ email: 'a.b@c.com', name: '김' }, { email: 'z@z.com', name: '이' }];
  const 표 = {}; 표[C.주소열쇠('a.b@c.com')] = { 보냄: true, 열람: true, 열람수: 3, 열람첫때: 123 };
  const r = C.열람붙이기(줄들, 표);
  assert.equal(r[0].열람, true);
  assert.equal(r[0].열람수, 3);
  assert.equal(r[0].열람첫때, 123);
  assert.equal(r[0].보냄표, true);
  assert.equal(r[1].열람, false, '표에 없는 곳을 봤다고 하지 않는다');
  assert.equal(r[1].보냄표, false);
});

test('원래 줄을 «건드리지 않는다» — 명단은 다른 화면도 같이 쓴다', () => {
  const 줄들 = [{ email: 'a@b.com', name: '김' }];
  C.열람붙이기(줄들, {});
  assert.equal(줄들[0].열람, undefined, '★ 원본 명단에 값을 덮어썼다');
});

/* ═══ ② 결과 셈 ═══════════════════════════════════════════════════ */

test('★ 열람은 «나간 것» 가운데만 센다', () => {
  const s = C.결과셈([
    { 보냄표: true, 나갔나: '모름', 열람: true },      /* 나감 · 봄 */
    { 보냄표: true, 나갔나: 'waiting', 열람: true },   /* 대기인데 열람 표가 있다 */
    { 보냄표: false, 열람: true }                      /* 안 걸림 */
  ]);
  assert.equal(s.나감, 1);
  assert.equal(s.대기, 1);
  assert.equal(s.안걺, 1);
  assert.equal(s.열람, 1, '★ 안 나간 것의 열람까지 셌다 — 열람률이 부풀려진다');
});

test('반송·자동회신을 갈라서 센다', () => {
  const s = C.결과셈([
    { 보냄표: true, 나갔나: '모름', 메일함: { 갈래: '반송' } },
    { 보냄표: true, 나갔나: '모름', 메일함: { 갈래: '자동회신' } },
    { 보냄표: true, 나갔나: '모름', 메일함: null }
  ]);
  assert.equal(s.반송, 1);
  assert.equal(s.자동회신, 1);
  assert.equal(s.전체, 3);
});

test('빈 명단에도 안 죽는다', () => {
  const s = C.결과셈([]);
  assert.equal(s.전체, 0);
  assert.equal(s.나감, 0);
  assert.deepEqual(C.열람붙이기(null, null), []);
});

/* ═══ ④ 메일함에서 찾기 — 못 맞춘 것을 알리는가 ═══════════════════ */

test('★ 반송을 «명단 주소»에 붙인다', () => {
  const 명단 = [{ email: 'kim@corp.co.kr', name: '김' }];
  const 메일 = [{ e: 'mailer-daemon@daum.net', f: 'Mail Delivery',
                  s: 'Undelivered Mail Returned to Sender: kim@corp.co.kr', d: 2000 }];
  const r = C.메일함에서찾기(명단, 메일, 1000);
  assert.equal(r.붙임['kim@corp.co.kr'].갈래, '반송');
  assert.equal(r.못붙임.length, 0);
});

test('★ 자동회신은 «보낸이»로 붙는다', () => {
  const 명단 = [{ email: 'lee@corp.co.kr', name: '이' }];
  const 메일 = [{ e: 'lee@corp.co.kr', f: '이', s: '[자동응답] 부재중입니다', d: 2000 }];
  const r = C.메일함에서찾기(명단, 메일, 1000);
  assert.equal(r.붙임['lee@corp.co.kr'].갈래, '자동회신');
});

test('★ 보낸 «뒤»에 온 것만 본다 — 지난달 반송이 이번 회차에 붙으면 안 된다', () => {
  const 명단 = [{ email: 'kim@corp.co.kr', name: '김' }];
  const 메일 = [{ e: 'x@y.com', s: 'failure notice: kim@corp.co.kr', d: 500 }];
  const r = C.메일함에서찾기(명단, 메일, 1000);
  assert.equal(Object.keys(r.붙임).length, 0, '★ 보내기 전에 온 것을 붙였다');
});

test('★ 못 맞춘 것은 «세어서 알린다» — 조용히 버리면 아무도 안 믿는다', () => {
  const 명단 = [{ email: 'kim@corp.co.kr', name: '김' }];
  const 메일 = [{ e: 'postmaster@nowhere.com', s: 'Delivery Status Notification (Failure)', d: 2000 }];
  const r = C.메일함에서찾기(명단, 메일, 1000);
  assert.equal(Object.keys(r.붙임).length, 0);
  assert.equal(r.못붙임.length, 1, '★ 못 맞춘 반송을 조용히 버렸다');
  assert.equal(r.못붙임[0].갈래, '반송');
});

test('보통 편지는 반송으로도 자동회신으로도 보지 않는다', () => {
  const 명단 = [{ email: 'kim@corp.co.kr', name: '김' }];
  const 메일 = [{ e: 'kim@corp.co.kr', s: '자문 계약 관련 문의드립니다', d: 2000 }];
  const r = C.메일함에서찾기(명단, 메일, 1000);
  assert.equal(Object.keys(r.붙임).length, 0);
  assert.equal(r.못붙임.length, 0);
});
