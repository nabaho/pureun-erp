/* 뉴스레터에 «첨부를 진짜로 붙인다» — 대표 결정 2026-09-06
   ═══════════════════════════════════════════════════════════════════════════
   「370-6 으로 보낸다. 다른곳으로는 안보낸다. 첨부도 붙인다.」

   그때까지는 편지에 「내려받기」 단추만 있었다. 파일을 «붙여서» 보내라고 정하셨다 —
   받는 분이 눌러 들어가지 않고 메일함에서 바로 열 수 있게.

   ★ 실제로 재 본 크기 (2026-09-06, 받아 둔 11개 합계 38.8MB)
       13.6MB  27년 적용 최저임금 … 현장의견 청취 결과보고.pdf
       10.1MB  2026 하반기 주요업종 일자리전망 연구보고서.pdf
     한 통 한도는 18MB — «다 붙일 수는 없다».
   ★ 그리고 이 편지는 114곳에 간다. 8MB 를 붙이면 900MB 가 나간다.

   ⚠ 이 검사가 지키는 것
     ① 한도를 넘으면 «안 붙이고 말한다» — 조용히 자르면 「붙임」을 찾다가 못 찾는다
     ② 크기를 모르는 것은 «안 붙인다» — 재 보지 않고 붙이면 한도를 조용히 넘는다
     ③ 같은 파일을 두 번 안 붙인다
     ④ 꺼내도 되는 «자리»만 꺼낸다 — 자리만 바꿔 남의 파일을 빼낼 수 없다
     ⑤ ★★ 보낸 뒤 «치우는 것»에 노무사회 자료를 넣지 않는다 — 넣으면 한 번 보내는
        순간 원본이 사라지고 편지 속 내려받기도 404 가 된다
     ⑥ 예약 발송기가 창고를 열 수 있다 — 없으면 첨부가 조용히 빠진다
     ⑦ 보내기 전에 «몇 MB 가 몇 곳에» 가는지 말한다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 주석걷기, 함수몸 } = require('./helpers/strip-comments.js');

const 뿌리 = path.join(__dirname, '..');
const C = require('../js/pu-news-core.js');
const MD = require('../functions/mail-deliver.js');
const MB = require('../functions/mail-bulk.js');
const 화면 = 주석걷기(fs.readFileSync(path.join(뿌리, 'pu-news.html'), 'utf8'));
const 서버 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'index.js'), 'utf8'));
const 배달 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'mail-deliver.js'), 'utf8'));

/* 실제로 창고에 들어 있는 모양 그대로 */
function 자료(이름, 크기, 자리) {
  return { 갈래: '자료', 제목: 이름, 파일이름: 이름, 파일크기: 크기, 파일자리: 자리 };
}
const 작은 = 자료('지역별고용조사.pdf', 2622137, 'ilabor/4150/지역별고용조사.pdf');
const 큰   = 자료('최저임금 현장의견.pdf', 13666191, 'ilabor/4151/최저임금.pdf');
const 더큰 = 자료('일자리전망 연구보고서.pdf', 10106861, 'ilabor/4152/일자리전망.pdf');

/* ═══ ① ② 한도 ═══════════════════════════════════════════════════════ */

test('★ 한 통 한도를 넘으면 «안 붙이고 말한다» — 조용히 자르지 않는다', () => {
  const r = C.첨부모으기({ policy: [큰, 더큰] });      /* 13.6 + 10.1 = 23.7MB */
  assert.equal(r.파일들.length, 1, '★ 한도를 넘겨 붙였다 — 메일이 통째로 거절된다');
  assert.equal(r.넘친것.length, 1, '★ 못 붙인 것을 안 알린다');
  assert.ok(r.합계 <= r.한도, '★ 합계가 한도를 넘었다');
});

test('★ 한 개가 한도보다 커도 «나머지는 붙는다»', () => {
  const 아주큰 = 자료('거대.pdf', 30 * 1024 * 1024, 'ilabor/9/거대.pdf');
  const r = C.첨부모으기({ policy: [아주큰, 작은] });
  assert.deepEqual(r.파일들.map(x => x.name), ['지역별고용조사.pdf'],
    '★ 큰 것 하나 때문에 작은 것까지 빠졌다');
  assert.equal(r.넘친것[0].이름, '거대.pdf');
});

test('★ 크기를 «모르는» 것은 안 붙인다 — 재 보지 않고 붙이면 한도를 넘긴다', () => {
  const 모름 = 자료('크기없음.pdf', 0, 'ilabor/9/크기없음.pdf');
  const r = C.첨부모으기({ policy: [모름] });
  assert.equal(r.파일들.length, 0, '★ 크기를 모르는 채로 붙였다');
  assert.equal(r.넘친것.length, 1, '★ 빠뜨렸다는 말도 안 한다');
});

test('한도는 다음메일 한 통 한도와 «같다»', () => {
  /* 검사고정-허용: 18MB 는 다음메일이 정한 값이라 «규칙»이다.
     우리가 더 크게 잡으면 메일 서버가 통째로 거절한다. */
  assert.equal(C.첨부한도, 18 * 1024 * 1024);
});

/* ═══ ③ 두 번 안 붙이기 ═════════════════════════════════════════════ */

test('★ 같은 파일을 두 번 안 붙인다 — 두 꼭지에 담겨 있어도', () => {
  const r = C.첨부모으기({ policy: [작은], case: [작은] });
  assert.equal(r.파일들.length, 1, '★ 같은 파일이 두 번 붙는다');
});

test('첨부가 없는 줄(기사)은 그냥 지나간다', () => {
  const 기사 = { 갈래: '기사', 제목: '가', 링크: 'https://x' };
  const r = C.첨부모으기({ news: [기사], policy: [작은] });
  assert.equal(r.파일들.length, 1);
  assert.equal(r.넘친것.length, 0, '★ 첨부가 없는 것을 「못 붙였다」고 센다');
});

test('노무사회 자료가 «창고 자리»를 들고 온다 — 없으면 붙일 수가 없다', () => {
  const 줄 = C.노무사회줄({ sid: '4150', 제목: '가', 기관: '고용노동부', 날짜: '2026-08-20',
    주소: 'http://ilabor/x',
    첨부: [{ 이름: 'a.pdf', 주소: 'https://storage/a', 크기: 2622137, 자리: 'ilabor/4150/a.pdf' }] });
  assert.equal(줄.갈래, '자료');
  assert.equal(줄.파일자리, 'ilabor/4150/a.pdf', '★ 창고 자리를 버렸다 — 주소로는 서버가 못 꺼낸다');
  assert.equal(C.첨부모으기({ policy: [줄] }).파일들.length, 1);
});

/* ═══ ④ 꺼내도 되는 자리인가 ═══════════════════════════════════════ */

test('★ 노무사회 자료 자리는 «꺼낼 수 있다»', () => {
  const r = MD.첨부자리허용('ilabor/4150/a.pdf', '');
  assert.ok(r, '★ 서버가 받아 둔 자료를 못 꺼낸다 — 첨부가 통째로 빠진다');
});

test('★ 내 자리(mailout)는 «제 것»만 꺼낸다', () => {
  assert.ok(MD.첨부자리허용('pucards/mailout/u1/a.pdf', 'u1'));
  assert.equal(MD.첨부자리허용('pucards/mailout/u2/a.pdf', 'u1'), null,
    '★ 남의 자리를 꺼낸다 — 자리만 바꾸면 남의 파일이 첨부로 나간다');
});

test('★ 그 밖의 자리는 «거절한다»', () => {
  ['puphotos/u/x/a.jpg', 'ilabor/../x/a.pdf', 'ilabor/abc/a.pdf', '', null,
   'pucards/materials/x', 'ilabor/4150/깊은/자리.pdf'].forEach(function (p) {
    assert.equal(MD.첨부자리허용(p, 'u1'), null, '★ 꺼내면 안 되는 자리를 열었다: ' + p);
  });
});

/* ═══ ⑤ ★★ 보낸 뒤 «치우는 것»에 자료를 넣지 않는다 ═══════════════ */

test('★★ 노무사회 자료를 «보낸 뒤 지우지» 않는다 — 원본이 사라진다', () => {
  /* 이 자리는 보낸 뒤 파일을 «삭제»한다(sweepMailOut). 내 PC 에서 올린 임시
     파일만 치워야 한다. 자료를 넣으면 한 번 보내는 순간 원본이 사라지고,
     편지 속 「내려받기」도 받는 분 손에서 404 가 된다. */
  const 몸 = 함수몸(배달, 'collectAttachments');
  assert.ok(몸, 'collectAttachments 를 못 찾았다');
  const i = 몸.indexOf('used.push(');
  assert.ok(i > 0, '치울 것을 담는 자리가 없다');
  const 앞 = 몸.slice(Math.max(0, i - 200), i);
  assert.ok(/CARDS_BUCKET/.test(앞),
    '★ 어느 창고에서 온 것이든 치운다 — 노무사회 자료 원본이 지워진다');
});

test('치우는 곳은 임시 파일 창고 하나뿐이다', () => {
  const 몸 = 함수몸(배달, 'sweepMailOut');
  assert.ok(/CARDS_BUCKET/.test(몸), '★ 치우는 창고가 바뀌었다');
});

/* ═══ ⑥ 예약 발송기가 창고를 열 수 있는가 ═══════════════════════════ */

test('★ 예약 발송기가 «창고를 열 길»을 들고 간다 — 없으면 첨부가 조용히 빠진다', () => {
  const i = 서버.indexOf('exports.sendScheduledMail');
  assert.ok(i > 0, 'sendScheduledMail 을 못 찾았다');
  const 몸 = 서버.slice(i, i + 4000);
  assert.ok(/deps:\s*\{\s*getStorage/.test(몸),
    '★ 창고를 열 길이 없다 — collectAttachments 가 첨부를 통째로 건너뛴다');
});

test('★ 대기열이 첨부 자리를 «통마다» 들고 간다', () => {
  const v = MB.validateBulk({ to: [{ email: 'a@b.com', name: '가' }], subject: '제', body: '본',
    files: [{ path: 'ilabor/4150/a.pdf', name: 'a.pdf' }] });
  assert.ok(v.ok, v.error);
  assert.equal(v.files.length, 1, '★ 받을 때 첨부를 버린다');
  const q = MB.buildQueue(v, 0, 'me', 'B1');
  assert.equal(q[0].payload.files.length, 1,
    '★ 통에 안 실린다 — 예약 발송기가 한 통씩 꺼내 보내므로 첨부가 빠진다');
});

/* ═══ ⑦ 보내기 전에 말하는가 ═══════════════════════════════════════ */

test('★ 보내기 전에 «몇 MB 가 몇 곳에» 가는지 말한다', () => {
  const 셈 = 함수몸(화면, '첨부셈');
  assert.ok(셈, '첨부셈 함수가 없다');
  assert.ok(/Core\.첨부모으기\(/.test(셈), '★ 판단을 Core 로 안 한다');
  assert.ok(/크기글\(r\.합계 \* n\)/.test(셈),
    '★ 「한 통 크기 × 곳수」를 안 보여 준다 — 900MB 가 나가는 줄 모르고 누른다');
  assert.ok(/넘친것/.test(셈), '★ 못 붙는 것을 안 말한다');

  const 진짜 = 함수몸(화면, '진짜보내기');
  assert.ok(/첨부셈\(r\.ok\.length\)/.test(진짜), '★ 곳수를 안 넘긴다');
  assert.ok(/files:\s*첨\.파일들/.test(진짜), '★ 첨부를 실어 보내지 않는다');
  const i = 진짜.indexOf('첨.말'), j = 진짜.indexOf('confirm(');
  assert.ok(i > 0 && j >= 0 && i > j, '★ 물음 «안»에 첨부 이야기가 없다');
});

test('★ 시험 발송도 «첨부를 그대로» 붙인다 — 다른 것을 보면 시험이 아니다', () => {
  const 시험 = 함수몸(화면, '시험발송');
  assert.ok(/files:\s*첨\.파일들/.test(시험), '★ 시험에는 첨부가 안 붙는다');
});

/* ═══ 보내는 주소 — 대표 결정 ═══════════════════════════════════════ */

test('★ 뉴스레터는 «370-6» 에서 나간다 (대표 결정 2026-09-06)', () => {
  /* 「370-6 으로 보낸다. 다른곳으로는 안보낸다.」
     ⚠ fairrunlabor.com 으로 옮기는 길이 코드에 있지만(우체국 층), 뉴스레터는
       옮기지 않기로 정해졌다. 첫 값을 바꾸지 말 것. */
  assert.ok(/기본보내는주소 = '370-6@hanmail\.net'/.test(화면),
    '★ 뉴스레터 보내는 주소가 바뀌었다 — 대표께서 370-6 으로 정하셨다');
});
