/* 미리보기·튕김·규칙 — 2026-09-05 대표 화면에서 나온 탈 셋
   ═══════════════════════════════════════════════════════════════════════════
   ① 「자료를 읽지 못했습니다 — permission_denied at /ilabor/items」
      서버(ilaborPull)가 관리자 SDK 로 담기만 하던 자리라 규칙이 «아예 없었다».
      기본 거절에 걸려, 받아 둔 자료 10건을 화면이 하나도 못 읽었다.

   ② 미리보기 안에서 링크를 누르면 «미리보기가 통째로 날아갔다».
      srcdoc 안의 <a> 는 그 창을 그대로 떠난다 — 대표께서 실제로 그렇게 하셨고
      돌아올 길이 없어 미리보기가 사라졌다.

   ③ 그렇게 눌렀을 때 깃허브의 «영어 404» 가 떴다.
      추적 링크가 모르는 번호면 기본 주소로 튕기는데, 그 자리(/pureunall/)에는
      index 파일이 없다. ⚠ 받는 분이 눌러도 같은 일이 난다 — 우리 편지를 열고
      링크를 눌렀는데 영어 404 를 보는 것이다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 주석걷기, 함수몸 } = require('./helpers/strip-comments.js');

const 뿌리 = path.join(__dirname, '..');
const 화면 = 주석걷기(fs.readFileSync(path.join(뿌리, 'pu-news.html'), 'utf8'));
const 서버 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'index.js'), 'utf8'));
const 서식 = 주석걷기(fs.readFileSync(path.join(뿌리, 'js', 'pu-news-tpl.js'), 'utf8'));

/* 미리보기를 그리는 «자리»를 소스에서 찾아낸다 — 이름을 손으로 적어 두지 않는다.
   ⚠ 2026-09-08 에 자리가 하나 없어졌다(오른쪽 칸이 「핵심만」 요약이 되고 전문은
     팝업으로 옮겼다). 이름을 박아 둔 검사는 그때 「함수가 없다」로 울었는데,
     정작 지켜야 할 규칙은 멀쩡했다 — 그러면 다음 사람이 검사를 «지울 것»으로 여긴다.
   ★ srcdoc 을 쓰는 함수가 곧 미리보기 자리다. 자리가 늘어도 줄어도 이 잣대는 옳다. */
function 미리보기자리들() {
  const 이름들 = [];
  const 재 = /function\s+([가-힣A-Za-z_$][\w$가-힣]*)\s*\(/g;
  let m;
  while ((m = 재.exec(화면))) {
    const 몸 = 함수몸(화면, m[1]);
    if (몸 && /srcdoc/.test(몸) && 이름들.indexOf(m[1]) < 0) 이름들.push(m[1]);
  }
  return 이름들;
}

/* ═══ ① 받아 둔 자료를 «읽을 수 있는가» ═══════════════════════════════ */

test('★ ilabor 자리에 규칙이 있다 — 없으면 받아 놓고 아무도 못 읽는다', () => {
  const 만들개 = fs.readFileSync(path.join(뿌리, 'scripts', 'make-firebase-rules.js'), 'utf8');
  assert.ok(/rules\.ilabor\s*=/.test(만들개), '★ ilabor 규칙이 만들개에 없다');
});

test('★ 규칙이 «읽기만» 연다 — 화면이 원본을 지우면 다시 받을 수 없다', () => {
  const out = require('node:child_process')
    .execSync('node scripts/make-firebase-rules.js', { cwd: 뿌리 }).toString();
  const j = JSON.parse(out);
  const r = j.rules && j.rules.ilabor;
  assert.ok(r, '★ 만들어진 규칙에 ilabor 가 없다');
  assert.ok(/isAdmin/.test(String(r['.read'])), '★ 아무나 읽는다 — 남의 회원 계정으로 받아 온 자료다');
  assert.equal(r['.write'], false, '★ 화면이 쓸 수 있다 — 원본을 지울 수 있는 길이 열린다');
});

/* ═══ ② 미리보기에서 링크를 눌러도 미리보기가 살아 있다 ═══════════════ */

test('★ 미리보기 안의 링크는 «새 창»으로 연다 — 미리보기가 날아가면 안 된다', () => {
  /* srcdoc 안의 <a> 는 기본으로 그 창을 떠난다. 떠나면 돌아올 길이 없다. */
  /* ⚠ 이름을 손으로 적어 두지 않는다 — 2026-09-08 에 미리보기 자리가 «하나 없어졌다»
       (오른쪽 칸이 「핵심만」 요약이 되고 전문은 팝업으로 옮겼다). 이름을 박아 두면
       그때 검사가 「함수가 없다」로 울지만, 정작 규칙은 멀쩡하다.
     ★ 그래서 «srcdoc 을 쓰는 자리를 소스에서 찾아» 전부 본다. 자리가 늘어도 줄어도
       이 검사는 그대로 옳다. */
  const 자리 = 미리보기자리들();
  assert.ok(자리.length >= 1, '★ 미리보기를 그리는 자리가 하나도 없다');
  자리.forEach(function (이름) {
    const 몸 = 함수몸(화면, 이름);
    assert.ok(/base target="_blank"/.test(몸),
      '★ ' + 이름 + ' — 링크를 누르면 미리보기가 통째로 날아간다');
  });
});

test('★ «진짜 편지»에는 base 를 넣지 않는다 — 메일 프로그램이 알아서 연다', () => {
  assert.ok(!/<base/i.test(서식),
    '★ 편지에 base 가 들어갔다 — 받는 프로그램에 따라 엉뚱하게 굴 수 있다');
});

/* ═══ ③ 모르는 번호로 튕길 때 404 가 아니다 ═══════════════════════════ */

test('★ 튕겨 보내는 자리에 «문이 있다» — 404 로 보내지 않는다', () => {
  const m = /res\.redirect\(302,[^)]*\)/.exec(서버);
  assert.ok(m, '★ 튕겨 보내는 자리를 못 찾았다');
  const 줄 = m[0];
  assert.ok(!/pureunall\/"\s*\)/.test(줄),
    '★ index 파일이 없는 자리로 보낸다 — 깃허브의 영어 404 가 뜬다');
  assert.ok(/\.html/.test(줄), '★ 실제 쪽으로 보내지 않는다');
});

test('★ 그 자리에 «정말로 파일이 있다» — 주소만 바꾸고 파일이 없으면 같은 일이다', () => {
  const m = /res\.redirect\(302,[^)]*\|\|\s*"([^"]+)"/.exec(서버);
  assert.ok(m, '★ 기본 주소를 못 찾았다');
  const 파일 = String(m[1]).split('/').pop();
  assert.ok(파일 && /\.html$/.test(파일), '★ 기본 주소가 파일이 아니다: ' + m[1]);
  assert.ok(fs.existsSync(path.join(뿌리, 파일)),
    '★ 보내는 자리에 그 파일이 없다 — 또 404 다: ' + 파일);
});

/* ═══ ④ 서랍 한 줄이 «가로로» 읽힌다 ═══════════════════════════════════
   2026-09-05 대표 화면 — 자료 제목이 「고/년/일/경/험/…」 한 글자씩 세로로 쌓였다.
   ⚠ 까닭: 꼭지 고르개(select)에 「판례·재결례·행정해석」 같은 긴 글이 들어 있어
     제 속내 너비가 크게 잡혔다. 줄이 넘치자 min-width:0 인 제목 칸이 «0 까지»
     짜부라져 한 글자 폭이 됐다 — 제목은 멀쩡한데 볼 수가 없었다. */

const 붙인화면 = 화면.replace(/\s*\n\s*/g, '');

test('★ 제목 칸이 «0 까지» 짜부라지지 않는다 — 한 글자씩 세로로 쌓였다', () => {
  assert.ok(/\.ilrow \.t\{[^}]*min-width:\s*\d+px/.test(붙인화면),
    '★ 제목 칸에 바닥이 없다 — 옆 칸이 넓으면 다시 세로로 쌓인다');
  assert.ok(!/\.ilrow \.t\{[^}]*min-width:\s*0/.test(붙인화면),
    '★ 제목 칸 바닥이 0 이다');
});

test('★ 꼭지 고르개가 «줄어들 수 있다» — 안 줄면 제목을 밀어낸다', () => {
  assert.ok(/\.ilrow>select\{[^}]*max-width:\s*\d+px/.test(붙인화면),
    '★ 고르개에 너비 한도가 없다 — 긴 꼭지 이름이 줄을 통째로 밀어낸다');
  assert.ok(/\.ilrow>select\{[^}]*flex:\s*0 1/.test(붙인화면),
    '★ 고르개가 안 줄어든다');
});

test('★ 서랍 줄이 «제 이름표»를 달고 있다 — 안 달면 위 규칙이 안 걸린다', () => {
  const 서랍 = 함수몸(화면, '노무사회서랍');
  assert.ok(/class="item ilrow"/.test(서랍), '★ 줄에 ilrow 가 없다 — 고침이 안 걸린다');
});

/* ═══ ⑤ 미리보기에서 누른 것이 «셈에 안 쌓인다» ═══════════════════════ */

test('★ 미리보기는 «원문 링크 그대로» — 추적을 걸지 않는다', () => {
  const T = require('../js/pu-news-tpl.js');
  const C = require('../js/pu-news-core.js');
  /* ⚠ 2026-09-08 부터 기사는 «우리 말»이 있어야 편지에 나간다 — 없으면 편지가
       null 이 되어 이 검사가 재려던 «링크» 규칙이 헛돈다. */
  const d = { 회차: C.회차('2026-08-30'), 범위: '자문중',
    안: { news: [{ 갈래: '기사', 제목: '가', 우리말: '가 — 우리 정리',
                   링크: 'https://www.labortoday.co.kr/x', 언론사: '매일노동뉴스' }],
          policy: [], case: [], hr: [] } };
  const 설 = { 회사이름: '푸른노무법인', 추적밑주소: 'https://asia-northeast3-pureun-erp.cloudfunctions.net' };

  const 미리 = T.편지짓기(d, 설, { 미리보기: true });
  assert.ok(/labortoday\.co\.kr/.test(미리.서식),
    '★ 미리보기에도 추적 링크가 들어간다 — 눌러도 빈 포털로 튕기고, 셈이 부풀려진다');
  assert.ok(!/newsClick/.test(미리.서식), '★ 미리보기에 추적 링크가 남아 있다');

  /* ⚠ «진짜 보내는» 쪽은 그대로 추적이 걸려야 한다 — 안 걸리면 열람이 영영 빈칸이다 */
  const 진짜 = T.편지짓기(d, 설);
  assert.ok(/newsClick/.test(진짜.서식),
    '★ 진짜 편지에서 추적이 사라졌다 — 열람·클릭이 한 건도 안 쌓인다');
});

test('★ 화면이 «미리보기로» 짓는다 — 부품만 만들고 안 쓰면 그대로다', () => {
  /* ⚠ 자리 이름을 박지 않는다 — 위 검사와 같은 까닭이다(자리가 하나 없어졌다).
     ★★ 이렇게 «전부» 보게 넓히니 묻혀 있던 탈이 나왔다 (2026-09-08):
       지난 회차 미리보기 둘이 추적을 «걸어» 짓고 있었다. 그러면 지난 회차를 열어
       링크를 누를 때마다 «우리» 클릭이 그 회차 셈에 찍힌다 — 이미 보낸 회차의
       열람·클릭이 더럽혀지고, 대표께서 그 숫자로 「3회 미열람 제외」를 판단하신다. */
  const 자리 = 미리보기자리들();
  assert.ok(자리.length >= 1, '★ 미리보기를 그리는 자리가 하나도 없다');
  자리.forEach(function (이름) {
    const 몸 = 함수몸(화면, 이름);
    assert.ok(/미리보기:\s*true|\(true\)/.test(몸),
      '★ ' + 이름 + ' 이 미리보기로 안 짓는다 — 여기서 링크를 누르면 그 회차 셈이 더럽혀진다');
  });
  /* 보내는 두 곳은 «그냥» 지어야 한다 — 미리보기로 지으면 추적이 빠진다 */
  ['시험발송', '진짜보내기'].forEach(function (이름) {
    const 몸 = 함수몸(화면, 이름);
    assert.ok(/지금편지\(\)/.test(몸),
      '★ ' + 이름 + ' 이 미리보기로 짓는다 — 나간 편지에 추적이 안 들어간다');
  });
});
