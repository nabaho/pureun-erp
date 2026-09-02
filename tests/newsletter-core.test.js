/* 뉴스레터 — 판단하는 층(js/pu-news-core.js)이 지키는 «규칙»
   ═══════════════════════════════════════════════════════════════════════════
   ★ 이 검사는 「지금 값」이 아니라 «규칙»을 본다 (CLAUDE.md 의 검사 규칙).
     다만 회차 이름만은 값이 곧 규칙이다 — 받으신 넉 장에 실제로 붙어 있던
     이름이라, 이것이 틀리면 거래처가 「지난주 것을 또 받았다」고 여긴다.
     그래서 그 넷만 «검사고정-허용»으로 못 박는다. */

const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/pu-news-core.js');

/* ══════ ① 회차 이름 ══════ */

test('회차 이름 — 받으신 넉 장으로 잰 규칙 그대로', () => {
  /* 검사고정-허용: 이 넷은 «실제로 나간 메일 제목»이다(2026-08-09/17/23/30 발송분).
     규칙을 고쳐 이 넷 가운데 하나라도 틀리면, 거래처가 받는 회차 번호가 어긋난다. */
  assert.equal(C.회차('2026-08-09').이름, '2026년 08월 2주차');
  assert.equal(C.회차('2026-08-17').이름, '2026년 08월 3주차');
  assert.equal(C.회차('2026-08-23').이름, '2026년 08월 4주차');
  assert.equal(C.회차('2026-08-30').이름, '2026년 08월 5주차');
});

test('월요일 아침에 보내도 «지난 한 주»가 이름이다', () => {
  /* 8/31(월) 아침에 나가는 것은 9월 1주차가 아니라 8월 5주차다 —
     담긴 것이 8/24~8/30 한 주치이기 때문이다. */
  const r = C.회차('2026-08-31');
  assert.equal(r.이름, '2026년 08월 5주차');
  assert.equal(r.기간시작, '2026-08-24');
  assert.equal(r.기간끝, '2026-08-30');
});

test('기간은 언제나 월요일부터 일요일까지 이레', () => {
  ['2026-01-05', '2026-03-17', '2026-09-02', '2026-12-31'].forEach((d) => {
    const r = C.회차(d);
    const s = new Date(r.기간시작 + 'T00:00:00Z');
    const e = new Date(r.기간끝 + 'T00:00:00Z');
    assert.equal(s.getUTCDay(), 1, d + ' 의 기간 첫날이 월요일이 아니다: ' + r.기간시작);
    assert.equal(e.getUTCDay(), 0, d + ' 의 기간 끝날이 일요일이 아니다: ' + r.기간끝);
    assert.equal((e - s) / 86400000, 6, d + ' 의 기간이 이레가 아니다');
  });
});

test('열쇠는 늘어놓으면 차례가 맞는다 — 자리에 담기는 이름이다', () => {
  const a = C.회차('2026-08-09').열쇠;
  const b = C.회차('2026-08-16').열쇠;
  const c = C.회차('2026-09-06').열쇠;
  assert.ok(a < b, a + ' 가 ' + b + ' 보다 앞서야 한다');
  assert.ok(b < c, b + ' 가 ' + c + ' 보다 앞서야 한다');
  assert.ok(!/[.#$/[\]]/.test(a), '파이어베이스가 못 쓰는 글자가 열쇠에 있다: ' + a);
});

test('«지금 손볼 회차»는 아직 안 보낸 가장 이른 것이다', () => {
  const 수요일 = '2026-09-02';
  /* 아무것도 안 보냈으면 — 오늘 보내면 될 그 회차 */
  assert.equal(C.이번회차(수요일, {}).이름, '2026년 08월 5주차');
  /* 그것을 이미 보냈으면 — 다음 것으로 넘어간다.
     ★ 이 줄이 이 검사의 이빨이다. 「오늘 보내면 몇 주차」만 보면
       수요일에 열었을 때 이미 보낸 지난주 것이 열린다. */
  const 보냄 = {}; 보냄[C.회차(수요일).열쇠] = 1;
  assert.equal(C.이번회차(수요일, 보냄).이름, '2026년 09월 1주차');
});

test('회차가 다 보내진 것처럼 보여도 끝없이 돌지 않는다', () => {
  const 보냄 = new Proxy({}, { get: () => 1, has: () => true });
  const r = C.이번회차('2026-09-02', 보냄);
  assert.ok(r && r.이름, '끝없이 돌면 화면이 멈춘 것과 같다');
});

/* ══════ ② 꼭지 ══════ */

test('꼭지는 넷이고, 우리 글 꼭지가 «하나» 있다', () => {
  assert.equal(C.꼭지들.length, 4);
  const 우리 = C.꼭지들.filter((g) => g.갈래 === '우리글');
  assert.equal(우리.length, 1, '우리가 쓰는 칸이 없으면 우리 뉴스레터가 아니다');
  const best = C.꼭지들.filter((g) => g.best);
  assert.equal(best.length, 1, 'Best 딱지는 하나뿐이다');
  assert.equal(C.꼭지들[0].best, true, 'Best 는 첫 꼭지에 붙는다');
});

test('꼭지는 옛 이름으로도 찾힌다 — 이름이 바뀌어도 지난 회차를 잃지 않는다', () => {
  assert.equal(C.꼭지찾기('주간노동뉴스').키, 'news');
  assert.equal(C.꼭지찾기('주간 노동뉴스').키, 'news');
  assert.equal(C.꼭지찾기('인사노무관리').키, 'hr');
  assert.equal(C.꼭지찾기('없는꼭지'), null);
});

test('판례 말이 정책 말보다 먼저다', () => {
  /* 「대법원, 고용노동부 지침 위법 판결」에는 둘 다 들어 있다 — 그것은 판례다 */
  assert.equal(C.어느꼭지('대법원, 고용노동부 지침 위법 판결'), 'case');
  assert.equal(C.어느꼭지('고용노동부, 지원금 확대 발표'), 'policy');
  assert.equal(C.어느꼭지('올여름 건설현장 이야기'), 'news');
});

/* ══════ ③ 길 ① 자동으로 담기 ══════ */

function 모음(...arr) {
  const o = {};
  arr.forEach((x, i) => { o['k' + i] = x; });
  return o;
}

test('지난 한 주치만 담는다 — 기간 밖은 안 담는다', () => {
  const R = C.회차('2026-08-31');           /* 8/24 ~ 8/30 */
  const 안 = C.자동으로담기(모음(
    { 제목: '이번 주 노동 이야기', 링크: 'https://a/1', 모은날: '2026-08-26' },
    { 제목: '지지난 주 이야기',   링크: 'https://a/2', 모은날: '2026-08-10' },
    { 제목: '아직 안 온 주 얘기', 링크: 'https://a/3', 모은날: '2026-09-03' }
  ), [], R);
  const 다 = [].concat(안.news, 안.policy, 안.case).map((x) => x.제목);
  assert.ok(다.includes('이번 주 노동 이야기'));
  assert.ok(!다.includes('지지난 주 이야기'), '기간 밖 기사가 실렸다');
  assert.ok(!다.includes('아직 안 온 주 얘기'));
});

test('같은 링크는 한 번만 — 여러 날 RSS 에 남아 있다', () => {
  const R = C.회차('2026-08-31');
  const 안 = C.자동으로담기(모음(
    { 제목: '같은 기사', 링크: 'https://a/1', 모은날: '2026-08-26' },
    { 제목: '같은 기사', 링크: 'https://a/1', 모은날: '2026-08-27' }
  ), [], R);
  const 다 = [].concat(안.news, 안.policy, 안.case);
  assert.equal(다.length, 1);
});

test('법령이 정책 꼭지의 «맨 앞»을 잡는다', () => {
  const R = C.회차('2026-08-31');
  const 안 = C.자동으로담기(
    모음({ 제목: '고용노동부 제도 개선 발표', 링크: 'https://a/1', 모은날: '2026-08-26' }),
    [{ 이름: '근로기준법 시행령', 구분: '대통령령', 공포일: '20260826' }],
    R
  );
  assert.equal(안.policy[0].갈래, '법령',
    '법령이 기사에 밀리면 원문까지 실을 수 있는 유일한 것이 뒤로 간다');
});

test('꼭지마다 한도가 있다 — 넘치면 뉴스레터가 아니라 목록이 된다', () => {
  const R = C.회차('2026-08-31');
  const 많이 = {};
  for (let i = 0; i < 40; i++) {
    많이['k' + i] = { 제목: '노동 이야기 ' + i, 링크: 'https://a/' + i, 모은날: '2026-08-26' };
  }
  const 안 = C.자동으로담기(많이, [], R);
  const 한도 = C.꼭지들.find((g) => g.키 === 'news').몇개;
  assert.ok(안.news.length <= 한도, '한도를 넘겼다: ' + 안.news.length);
});

test('우리 글은 «자동으로 안 짓는다»', () => {
  const R = C.회차('2026-08-31');
  const 안 = C.자동으로담기(모음(
    { 제목: '노동 이야기', 링크: 'https://a/1', 모은날: '2026-08-26' }
  ), [], R);
  assert.deepEqual(안.hr, [], '노무법인이 할 말을 기계가 지어내면 안 된다');
});

/* ══════ ④ 길 ② 붙여넣어 옮겨 담기 ══════ */

test('붙여넣은 뉴스레터에서 제목·링크를 꼭지째로 뽑는다', () => {
  const 붙임 = `
    <table><tr><td><h3>주간노동뉴스</h3></td></tr>
    <tr><td><a href="https://n.kr/a">유급 난임치료휴가 2일에서 4일로</a></td></tr>
    <tr><td><a href="https://n.kr/b">마트배송 기사 표준계약서 마련</a></td></tr>
    <tr><td><h3>판례·재결례</h3></td></tr>
    <tr><td><a href="https://n.kr/c">대법 퇴직금 분할 약정 무효 판결</a></td></tr>
    </table>`;
  const r = C.붙여넣기읽기(붙임);
  assert.equal(r.꼭지로갈랐나, true);
  assert.equal(r.안.news.length, 2);
  assert.equal(r.안.case.length, 1);
  assert.equal(r.안.news[0].링크, 'https://n.kr/a');
});

test('수신거부·그림 링크와 「더보기」는 안 담는다', () => {
  const 붙임 = `<div><h3>주간노동뉴스</h3>
    <a href="https://n.kr/unsubscribe?id=3">수신거부를 원하시면 여기를</a>
    <a href="https://n.kr/banner.png">배너 그림입니다 여기</a>
    <a href="https://n.kr/x">더보기</a>
    <a href="https://n.kr/ok">쓸모 있는 진짜 기사 제목</a></div>`;
  const r = C.붙여넣기읽기(붙임);
  const 다 = r.안.news.map((x) => x.링크);
  assert.deepEqual(다, ['https://n.kr/ok']);
});

test('차림표 글자는 «담지 않고» 꼭지만 바꾼다', () => {
  /* 원본 뉴스레터의 꼭지 차림표는 링크로 되어 있다. 그것을 기사로 담으면
     꼭지 이름 넷이 기사 목록에 섞여 나간다. */
  const 붙임 = `<a href="https://n.kr/#s1">주간노동뉴스</a>
                <a href="https://n.kr/real">진짜 기사 제목입니다</a>`;
  const r = C.붙여넣기읽기(붙임);
  const 다 = [].concat(r.안.news, r.안.policy, r.안.case).map((x) => x.제목);
  assert.ok(!다.includes('주간노동뉴스'), '차림표가 기사로 담겼다');
  assert.ok(다.includes('진짜 기사 제목입니다'));
});

test('그냥 글자를 붙여넣어도 읽는다 — 서식만 받으면 「아무것도 안 나온다」가 된다', () => {
  const 붙임 = '주간노동뉴스\n· 유급 난임치료휴가 2일에서 4일로\n· 마트배송 표준계약서 마련\n판례·재결례\n1. 대법 퇴직금 분할 약정 무효';
  const r = C.붙여넣기읽기(붙임);
  assert.equal(r.안.news.length, 2, JSON.stringify(r.안));
  assert.equal(r.안.case.length, 1);
  assert.equal(r.안.news[0].제목, '유급 난임치료휴가 2일에서 4일로', '앞머리 「·」를 떼야 한다');
});

test('빈 것을 붙여넣으면 조용히 빈손 — 터지지 않는다', () => {
  ['', '   ', null, undefined].forEach((v) => {
    const r = C.붙여넣기읽기(v);
    assert.equal(r.찾은수, 0);
  });
});

/* ══════ ⑤ 받는 명단 ══════ */

test('수신거부·주소없음·겹침을 «세어서» 돌려준다', () => {
  const r = C.명단다듬기([
    { email: 'A@x.com', name: '가' },
    { email: 'a@x.com', name: '가 또' },          /* 겹침 — 대소문자만 다르다 */
    { email: '주소아님', name: '나' },
    { email: 'b@x.com', name: '다', noMail: true },
    { email: 'c@x.com', name: '라' }
  ], { 'd@x.com': 1 });
  assert.equal(r.셈.보낼곳, 2);
  assert.equal(r.셈.겹침, 1);
  assert.equal(r.셈.주소없음, 1);
  assert.equal(r.셈.수신거부, 1);
});

test('막은 주소 목록(config/mailBlock)도 함께 본다', () => {
  /* 기업정보함은 열쇠에 못 쓰는 글자를 _ 로 바꿔 담는다 — 두 꼴을 다 본다 */
  const r = C.명단다듬기([{ email: 'x@y.com' }], { 'x@y_com': 1 });
  assert.equal(r.셈.수신거부, 1, '기업정보함에서 막은 주소가 뉴스레터로 새 나갔다');
});

/* ══════ ⑥ 법 — 명단 범위가 (광고) 표기를 «저절로» 켠다 ══════ */

test('명단을 넓히면 (광고) 표기가 저절로 켜진다', () => {
  assert.equal(C.광고표기필요한가('자문중'), false);
  assert.equal(C.광고표기필요한가('자문끝'), true);
  assert.equal(C.광고표기필요한가('명함전부'), true);

  const R = C.회차('2026-08-30');
  assert.ok(!/^\(광고\)/.test(C.제목짓기(R, '자문중')));
  assert.ok(/^\(광고\) /.test(C.제목짓기(R, '명함전부')),
    '명함 전부로 넓혔는데 (광고) 가 안 붙으면 정보통신망법 50조에 걸린다');
});

test('모르는 범위는 «안전한 쪽»으로 — (광고) 를 붙인다', () => {
  assert.equal(C.광고표기필요한가(''), true);
  assert.equal(C.광고표기필요한가(undefined), true);
});

/* ══════ ⑦ 보내기 전에 막을 것 ══════ */

test('빈 뉴스레터는 못 보낸다', () => {
  const r = C.보낼수있나({ 안: { news: [], policy: [], case: [], hr: [] } }, { 보낼곳: 10 });
  assert.equal(r.ok, false);
});

test('받는 곳이 없으면 못 보낸다', () => {
  const r = C.보낼수있나({ 안: { news: [{ 제목: 'ㄱ' }] } }, { 보낼곳: 0 });
  assert.equal(r.ok, false);
});

test('이미 보낸 회차는 두 번 못 보낸다', () => {
  const 자료 = { 안: { news: [{ 제목: 'ㄱ' }] }, 상태: '발송' };
  assert.equal(C.보낼수있나(자료, { 보낼곳: 10 }).ok, false);
});

test('실을 것과 받을 곳이 있으면 보낼 수 있다', () => {
  const r = C.보낼수있나({ 안: { news: [{ 제목: 'ㄱ' }] }, 상태: '초안' }, { 보낼곳: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.실린것, 1);
});

test('우리 글만 있어도 «실린 것»으로 센다', () => {
  const r = C.보낼수있나({ 안: {}, 우리글: '이번 주 안내 말씀입니다' }, { 보낼곳: 3 });
  assert.equal(r.ok, true);
});
