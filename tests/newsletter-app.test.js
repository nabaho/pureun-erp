/* 뉴스레터 관리 — 화면과 «둘레»가 어긋나지 않는지
   ═══════════════════════════════════════════════════════════════════════════
   ★ 이 검사는 「글자가 있나」가 아니라 «어긋남»을 본다.
     포털 타일과 앱바가 다른 잣대를 갖거나, 화면이 판단을 스스로 다시 만들거나,
     새 발송기를 만들거나 — 이런 것들은 눈에 안 띄면서 나중에 크게 아프다.

   ⚠ 글자로 보는 검사는 «주석을 걷고» 본다. 안 걷으면 잘 쓴 주석이 검사를 통과시킨다.
     손으로 지우지 말 것 — 공용 걷개를 쓴다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { stripComments } = require('./strip-comments');

const ROOT = path.join(__dirname, '..');
const 읽기 = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const news = stripComments(읽기('pu-news.html'));
const enter = stripComments(읽기('enter.html'));
const appbar = stripComments(읽기('js/pu-appbar.js'));

/* ══════ ① 문이 둘이면 잣대가 «같아야» 한다 ══════ */

function 타일(글, 열쇠) {
  const re = new RegExp("\\{[^{}]*key:\\s*'" + 열쇠 + "'[^{}]*\\}");
  const m = re.exec(글);
  return m ? m[0] : '';
}

test('포털에도 앱바에도 뉴스레터 타일이 있다', () => {
  assert.ok(타일(enter, 'news'), 'enter.html 에 뉴스레터 타일이 없다');
  assert.ok(타일(appbar, 'news'), 'pu-appbar.js 에 뉴스레터 타일이 없다');
});

test('둘 다 pu-news.html 을 가리킨다', () => {
  assert.ok(/pu-news\.html/.test(타일(enter, 'news')));
  assert.ok(/pu-news\.html/.test(타일(appbar, 'news')));
});

test('★ 포털과 앱바의 «관리자 전용» 잣대가 같다', () => {
  /* 한쪽만 보이면 «눌러도 막히는 문»이 된다 — 직원이 왜 안 되는지 알 수 없다.
     경력관리·홈페이지 관리가 이미 그렇게 맞춰져 있다. */
  const e = /adminOnly/.test(타일(enter, 'news'));
  const a = /adminOnly/.test(타일(appbar, 'news'));
  assert.equal(e, a, '포털=' + e + ' 앱바=' + a + ' — 두 문의 잣대가 다르다');
  assert.equal(e, true, '법인 이름으로 밖에 나가는 편지라 총괄관리자 전용이어야 한다');
});

test('뉴스레터는 내외관리 줄에 선다', () => {
  assert.ok(/row:\s*'inout'/.test(타일(enter, 'news')),
    '대표 지시가 「푸른내외관리에」였다');
});

/* ══════ ② 화면이 판단을 «다시 만들지» 않는다 ══════ */

test('회차 이름을 화면에서 다시 짓지 않는다', () => {
  /* 「N주차」를 화면이 스스로 만들면 부품(pu-news-core)과 답이 갈라진다 */
  assert.ok(!/주차['"]/.test(news.replace(/PuNewsCore|Core\./g, '')),
    '화면이 회차 이름을 스스로 만들고 있다');
  assert.ok(/Core\.회차\(|Core\.이번회차\(/.test(news), '부품에게 회차를 묻지 않는다');
});

test('편지 서식을 화면에서 짜지 않는다 — 짓는 층이 따로 있다', () => {
  assert.ok(/Tpl\.편지짓기\(/.test(news), '편지 짓는 층을 안 부른다');
  /* 미리보기·화면 꾸밈에 쓰는 표는 있어도 되지만, «편지»를 화면에서 짜면 안 된다 */
  assert.ok(!/WEEKLY NEWS LETTER/.test(news),
    '배너 글자가 화면 안에 박혀 있다 — 목업과 편지와 화면, 세 곳이 갈라진다');
});

test('보내기 전에 부품에게 «보내도 되나»를 묻는다', () => {
  assert.ok(/Core\.보낼수있나\(/.test(news));
});

test('명단 거르기를 화면에서 다시 만들지 않는다', () => {
  assert.ok(/Core\.명단다듬기\(/.test(news));
  assert.ok(!/noMail\s*\|\|\s*.*seen/.test(news), '화면이 스스로 거르고 있다');
});

/* ══════ ③ 새 발송기를 만들지 않는다 ══════ */

test('★ 이미 도는 발송기(sendBulkMail)에 건다 — 새 발송기를 만들지 않는다', () => {
  /* 발송기가 둘이면 같은 메일이 두 번 나갈 위험이 생기고,
     한꺼번에 쏟아 다음메일 계정이 막히면 «평소 자료 발송까지» 멈춘다. */
  assert.ok(/sendBulkMail/.test(news), 'sendBulkMail 을 안 쓴다');
  assert.ok(!/nodemailer|smtp|createTransport/i.test(news), '화면이 스스로 보내려 한다');
});

test('한꺼번에 쏟지 않는다 — 통 사이 간격을 준다', () => {
  const m = /spacingSec:\s*(?:BULK_GAP_SEC|(\d+))/.exec(news);
  assert.ok(m, '간격을 안 준다 — 서버 기본값에만 기대면 화면이 0 을 보낼 수도 있다');
  assert.ok(/BULK_GAP_SEC\s*=\s*\d+/.test(news));
});

/* ══════ ④ 캐시 번호 ══════ */

test('부품을 부를 때 캐시 번호가 붙어 있다', () => {
  /* ⚠ .js 를 고치고 ?v= 를 안 올리면 배포에 반영이 안 된다 — 실제로 서식 수정이 통째로 묻혔다 */
  ['pu-news-core.js', 'pu-news-tpl.js'].forEach((f) => {
    const re = new RegExp('js/' + f.replace('.', '\\.') + '\\?v=\\d+');
    assert.ok(re.test(news), f + ' 에 캐시 번호(?v=숫자)가 없다');
  });
});

/* ══════ ⑤ 파이어베이스 규칙 ══════ */

test('규칙 만들개가 newsletter 자리를 낸다', () => {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'make-firebase-rules.js')], { encoding: 'utf8', maxBuffer: 1e8 });
  const r = JSON.parse(out).rules || JSON.parse(out);
  assert.ok(r.newsletter, 'newsletter 자리가 규칙에 없다 — 화면이 아무것도 못 읽는다');
  assert.ok(/isAdmin/.test(r.newsletter['.read']), '명단·초안을 아무나 읽는다');
  assert.ok(/isAdmin/.test(r.newsletter['.write']), '법인 이름으로 나갈 초안을 아무나 고친다');
});

test('규칙은 화면의 잣대와 «같다»', () => {
  /* 화면은 관리자만 열고, 규칙도 관리자만 읽게 — 둘이 어긋나면
     화면은 열리는데 아무것도 안 보이거나(빈 화면), 반대로 막아 놓고 자료는 열려 있다. */
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'make-firebase-rules.js')], { encoding: 'utf8', maxBuffer: 1e8 });
  const r = JSON.parse(out).rules || JSON.parse(out);
  assert.equal(r.newsletter['.read'], r.homepage['.read'],
    '홈페이지 관리와 같은 잣대로 두기로 했다(둘 다 총괄관리자)');
});

/* ══════ ⑥ 지키기로 한 것 ══════ */

test('화면이 관리자를 «못 읽었을 때» 열지 않는다', () => {
  /* 못 읽은 것을 권한 있음으로 치면 막는 뜻이 없다 */
  const m = /\.catch\([^)]*\)\s*=>\s*\{[^}]*App\.isAdmin\s*=\s*false/.test(news)
         || /catch\([\s\S]{0,120}?App\.isAdmin\s*=\s*false/.test(news);
  assert.ok(m, '권한 읽기가 실패했을 때 isAdmin 을 false 로 안 내린다');
  assert.ok(/if\s*\(\s*!App\.isAdmin\s*\)\s*\{\s*잠그기/.test(news), '관리자가 아니면 잠가야 한다');
});

test('이미 보낸 회차를 두 번 보내지 않는다 — 상태를 자리에 적는다', () => {
  assert.ok(/상태\s*:\s*'발송'/.test(news), '보낸 뒤 상태를 안 적으면 두 번 보낸다');
});

/* ══════ ⑦ 걸리는 시간을 화면이 스스로 셈하지 않는다 ══════ */

/* ⚠ 2026-09-02 — 화면이 `곳수 × 15초 ÷ 60` 으로 제 셈을 하고 있었다. 실제로 빼 가는
     것은 예약 발송기(15분마다 20통)라서 300곳이면 「약 75분」이라 해 놓고 3시간 45분이
     걸렸다. 대표께서 그 숫자를 보고 «되돌릴 수 없는» 보내기를 누르신다.
     판단은 Core 한 자리에서만 — 화면이 다시 만들면 또 어긋난다. */

test('★ 걸리는 시간은 Core 에 물어본다 — 화면이 제 셈을 하지 않는다', () => {
  assert.ok(/Core\.보낼시간\(/.test(news), 'Core.보낼시간 을 안 씁니다');
  assert.ok(
    !/\*\s*BULK_GAP_SEC\s*\)\s*\/\s*60/.test(news),
    '화면이 아직 제 셈을 하고 있습니다 (곳수 × 간격 ÷ 60)'
  );
});

test('★ 확인창에 걸리는 시간이 들어간다 — 보고 누르셔야 한다', () => {
  const i = news.indexOf('async function 진짜보내기(');
  assert.ok(i >= 0, '진짜보내기 를 찾을 수 없습니다');
  const fn = news.slice(i, i + 2200);
  assert.ok(/confirm\(/.test(fn), '묻지 않고 수백 곳에 보냅니다');
  assert.ok(/다 나가는 데/.test(fn), '얼마나 걸리는지 안 보여주고 묻습니다');
  assert.ok(/Core\.보낼시간\(/.test(fn), '확인창 숫자를 Core 에 안 물어봅니다');
});

/* ══════ ⑧ 넓은 화면 배치 — 얼린 머리 + 좌우 5:5 ══════ */

/* 대표 지시 2026-09-02: 「상단은 틀고정해주고 좌측에 채울것과 우측에 나갈 모습
     크게 5:5로 화면 나눠서 정리할 수 있나」

   ⚠ 이 배치는 «넓은 화면에서만» 돈다. 여기서 못 박는 것은 예쁨이 아니라 두 가지
     «못 쓰게 되는 길»이다 —
     ① 얼리기를 미디어쿼리 밖에 두면 휴대폰에서 쪽이 아예 안 구른다(아무것도 못 본다).
     ② 껍데기를 「이번 회차」 밖에도 걸면 지난 회차·받는 명단·설정이 스크롤을 잃는다
        (그 탭들에는 5:5 칸이 없어 flex:1 을 받을 자식이 없다). */

/* @media(min-width:981px){ … } 한 덩이를 «중괄호를 세어» 뽑는다.
   ⚠ 주석으로 표식을 달면 안 된다 — 위 stripComments 가 걷어 가서 검사가 영영 통과 못 한다. */
function 껍데기CSS() {
  const key = '@media(min-width:981px){';
  const a = news.indexOf(key);
  assert.ok(a >= 0, '넓은 화면 껍데기(@media(min-width:981px))를 찾지 못했습니다');
  let i = a + key.length, 깊이 = 1;
  while (i < news.length && 깊이 > 0) {
    if (news[i] === '{') 깊이++;
    else if (news[i] === '}') 깊이--;
    i++;
  }
  assert.equal(깊이, 0, '껍데기 중괄호가 안 닫혔습니다');
  return news.slice(a, i);
}

test('★ 얼리기는 넓은 화면에서만 — 휴대폰에서 쪽이 안 구르면 아무것도 못 본다', () => {
  const 껍 = 껍데기CSS();
  assert.ok(/@media\(min-width:981px\)/.test(껍), '넓은 화면 조건이 없습니다');
  assert.ok(/html,body\{[^}]*overflow:hidden/.test(껍), '쪽을 안 구르게 하는 줄이 없습니다');

  /* 껍데기 «밖»에 body 얼리기가 있으면 휴대폰이 죽는다 */
  const 밖 = news.replace(껍, '');
  assert.ok(!/html,body\{[^}]*overflow:hidden/.test(밖),
    'html,body 얼리기가 껍데기 밖에 있습니다 — 휴대폰에서 쪽이 안 구릅니다');
});

test('★ 5:5 껍데기는 「이번 회차」 탭에만 — 다른 탭이 스크롤을 잃는다', () => {
  const 껍 = 껍데기CSS();
  /* 다른 탭도 «구를 자리»는 있어야 한다 — .wrap 자체가 구른다 */
  assert.ok(/#shell>\.wrap\{[^}]*overflow-y:auto/.test(껍),
    '탭 공통으로 구를 자리가 없습니다 — 받는 명단이 길면 잘립니다');
  /* 5:5 쪽 규칙은 .now 로 좁혀져 있어야 한다 */
  assert.ok(/\.wrap\.now/.test(껍), '5:5 규칙이 이번 회차로 좁혀져 있지 않습니다');
  /* 그 표를 붙이는 곳이 실제로 있어야 한다 */
  assert.ok(/classList\.toggle\('now'/.test(news) || /classList\.toggle\("now"/.test(news),
    'render 가 #main 에 now 표를 안 붙입니다');
});

test('★ 좌우가 5:5 다 — 오른쪽이 420px 로 묶여 있지 않다', () => {
  assert.ok(/\.cols\{[^}]*grid-template-columns:1fr 1fr/.test(news), '5:5 가 아닙니다');
  assert.ok(!/grid-template-columns:1fr 420px/.test(news), '오른쪽이 아직 420px 로 묶여 있습니다');
});

test('★ 두 칸이 따로 구른다 — 왼쪽에서 담아 내려도 나갈 모습은 제자리', () => {
  const 껍 = 껍데기CSS();
  assert.ok(/\.colL\{[^}]*overflow-y:auto/.test(껍), '왼쪽 칸이 따로 구르지 않습니다');
  assert.ok(/class="colL"/.test(news), '왼쪽 칸에 colL 이 안 붙어 있습니다');
  assert.ok(/\.pv \.paper\{[^}]*max-height:none/.test(껍),
    '나갈 모습이 70vh 로 잘려 화면 높이를 못 채웁니다');
});

test('좁은 화면은 위아래로 쌓인다 — 지금 하던 대로', () => {
  assert.ok(/@media\(max-width:980px\)\{\.cols\{grid-template-columns:1fr\}\}/.test(news),
    '좁은 화면에서 한 줄로 쌓는 규칙이 사라졌습니다');
});

test('★ 낮은 화면에는 안전판이 있다 — 얼린 머리가 화면을 다 먹으면 안 된다', () => {
  /* 넓지만 «낮은» 창(노트북에 브라우저 도구를 열면 이렇게 된다)에서는 얼린 머리가
     화면을 거의 다 먹고 두 칸이 0 으로 짜부라진다. 그때는 얼리기를 끄고 예전처럼 구른다. */
  assert.ok(/@media\(min-width:981px\) and \(max-height:\d+px\)/.test(news),
    '낮은 화면에서 얼리기를 끄는 안전판이 없습니다');
});

test('본문 폭을 넓혔다 — 5:5 로만 나누면 각 칸이 오히려 좁아진다', () => {
  assert.ok(/\.wrap\{max-width:1600px/.test(news), '폭이 아직 좁습니다');
});

test('★ 얼린 자리에는 «높이가 변하는 것»을 두지 않는다', () => {
  /* 얼리는 자리는 앱바·탭·회차 머리줄·못보냄 알림·길 고르기(석 장) 까지다 — 모두 높이가 일정하다.
     ②붙여넣기·③전달을 고르면 textarea 와 긴 경고가 붙는데, 그것이 얼린 자리에 있으면
     화면을 먹어 «두 칸이 0 으로 짜부라진다». 그래서 길 칸은 왼쪽(구르는 칸) 안에 둔다.
     ⚠ 이것은 예쁨이 아니라 «못 쓰게 되는 길»이다. */
  const L = news.indexOf('class="colL"');
  const C = news.indexOf('<div class="cols">');
  assert.ok(L > 0 && C > 0, 'colL 이나 cols 를 찾지 못했습니다');
  assert.ok(L > C, 'colL 이 cols 안에 없습니다');

  const 왼쪽 = news.slice(L, news.indexOf('class="pv"', L));
  ['pasteBox', 'fwdBox', '자동담기()', 'class="ways"', '아직 못 보냅니다'].forEach(function (표) {
    assert.ok(왼쪽.indexOf(표) >= 0,
      표 + ' 가 왼쪽 구르는 칸 밖에 있습니다 — 얼린 자리에서 두 칸을 짜부라뜨립니다');
  });

  /* 얼린 자리에는 «회차 머리줄만» 남는다 — 거기 것은 높이가 늘 같다.
     길 고르기 석 장·못보냄 알림·붙여넣기 칸은 골라 놓기에 따라 높이가 달라진다. */
  const H = news.indexOf('class="hdbar"');
  const 얼린자리 = news.slice(H, C);
  assert.ok(!/class="ways"/.test(얼린자리), '길 고르기가 얼린 자리에 있습니다');
  assert.ok(!/아직 못 보냅니다/.test(얼린자리), '못보냄 알림이 얼린 자리에 있습니다');
  assert.ok(!/<textarea/.test(얼린자리), '글 적는 칸이 얼린 자리에 있습니다');
});
