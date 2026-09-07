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

const 반 = '(?:minmax\\(0,\\s*1fr\\)|1fr)';

test('★ 좌우가 5:5 다 — 오른쪽이 420px 로 묶여 있지 않다', () => {
  /* ⚠ 글자 꼴을 박지 않는다 — minmax(0,1fr) 도 «반씩»이다(오히려 그쪽이 옳은 꼴이다).
     2026-09-06 에 이 검사가 1fr 만 알아보아, 자리를 바로잡은 고침에서 울었다. */
  assert.ok(new RegExp('\\.cols\\{[^}]*grid-template-columns:\\s*' + 반 + '\\s+' + 반).test(news),
    '5:5 가 아닙니다');
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
  /* ⚠ 이 검사는 «1600px» 이라는 지금 값을 글자로 박고 있었다.
       대표 지시 2026-09-03 「온 화면을 다 사용해라. 좌우 여백 필요없다」로
       그 값을 없애자 기능이 나아졌는데 검사가 깨졌다 —
       CLAUDE.md 의 「지금 값이 아니라 규칙을 못 박는다」에 어긋난 검사였다.
     ★ 규칙으로 다시 조준한다: 본문이 «좁혀져 있지 않은가». */
  const m = /\.wrap\{([^}]*)\}/.exec(news);
  assert.ok(m, '.wrap 규칙을 못 찾았다');
  const 폭 = /max-width:\s*([^;}]+)/.exec(m[1]);
  assert.ok(폭, '.wrap 에 max-width 가 아예 없다면 그것도 «넓다»는 뜻이니 괜찮다');
  assert.ok(/none|100%|unset|initial/.test(폭[1]),
    '★ 본문이 아직 좁혀져 있다 (max-width:' + 폭[1].trim() + ') — '
    + '대표 지시는 「온 화면을 다 사용해라. 좌우 여백 필요없다」였다');
});

test('★ 꼭지 넷을 «쌓지 않는다» — 둘째 꼭지가 첫 화면에 들어와야 한다', () => {
  /* 대표 지시 2026-09-03: 「고용·노동정책 등 아래의 내용은 전혀 안 보인다」
     ⚠ 까닭은 폭이 아니라 «쌓임»이었다 — 주간노동뉴스 8건이 끝나야 둘째 꼭지가 나와서,
       넓히기만 해서는 안 풀렸다. 격자로 나란히 놓아야 한다. */
  assert.match(news, /class="jars"/, '꼭지를 격자에 안 담았습니다');
  const m = /\.jars\{([^}]*)\}/.exec(news);
  assert.ok(m, '.jars 규칙이 없습니다');
  assert.match(m[1], /display:\s*grid/, '.jars 가 격자가 아닙니다');
  const 열 = /grid-template-columns:([^;]*)/.exec(m[1]);
  assert.ok(열 && (열[1].match(/1fr/g) || []).length >= 2,
    '★ 꼭지가 한 줄로 쌓입니다 — 둘째 꼭지부터 첫 화면에서 안 보입니다');
  assert.match(news, /@media\(max-width:\d+px\)\{\.jars\{grid-template-columns:1fr\}\}/,
    '좁은 화면에서 한 열로 돌아가는 규칙이 없습니다 — 폰에서 제목이 다 잘립니다');
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

/* ══════ ⑨ 보내는 주소 — 원본과 같은 곳에서 나가야 한다 ══════ */

/* 대표 지시 2026-09-03: 「뉴스레터 발송시에는 푸른노무법인 메일 370-6@hanmail.net
     주소로 송부되어야 한다. 이부분 명확하게 해야한다」

   ⚠ 보내는 주소는 자료 발송·예약 발송이 «함께 쓰는 한 곳»에 있다
     (pucards/config/matMail/from = 370-6@daum.net, 2026-09-03 실측).
     거기를 바꾸면 평소 자료 발송까지 흔들린다 — 그래서 뉴스레터만 달리 보낸다.
   ⚠ 조이는 것은 서버가 한다(mail-bulk 보내는주소고르기) — 사서함 이름이 계정과 같고
     도메인이 daum.net/hanmail.net 인 것만 통과한다. */

test('★ 보내는 주소를 «걸기() 한 곳»에서 붙인다 — 시험·본발송·전달이 다 같게', () => {
  /* 발송 길이 넷이다(시험발송·진짜보내기·전달시험·전달보내기).
     각자 붙이면 한 곳을 빠뜨려 «다른 주소로» 나간다. */
  const i = news.indexOf('async function 걸기(');
  assert.ok(i >= 0, '걸기() 를 찾을 수 없습니다');
  const fn = news.slice(i, i + 1200);
  assert.match(fn, /from:/, '걸기() 가 보내는 주소를 안 붙입니다');
  assert.match(fn, /보내는주소\(\)|설정\.보내는주소/, '설정의 보내는 주소를 안 읽습니다');
});

test('★ 기본 보내는 주소가 370-6@hanmail.net 이다 — 원본이 나갔던 그 주소', () => {
  assert.match(news, /370-6@hanmail\.net/,
    '기본 보내는 주소가 없습니다 — 설정이 비면 원본과 다른 주소로 나갑니다');
});

test('★ 설정에 보내는 주소 칸이 있다 — 화면에서 바꿀 수 있어야 한다', () => {
  assert.match(news, /id="cfgFrom"/, '보내는 주소 칸이 없습니다');
  assert.match(news, /보내는주소:\s*g\('cfgFrom'\)/, '저장할 때 안 읽습니다');
});

test('설정 화면이 컴팩트하게 묶여 있다 — 칸을 더 넣을 자리가 남게', () => {
  /* 대표 지시: 「설정을 좀더 컴팩트하게 정리하고 추가로 더 넣을 내용이 있을 수 있으니
     그부분도 반영해서 공간 정리 해라」
     대표 지시 2026-09-03: 「설정화면 간략하게 정리했으면 좋겠다. 빈줄 칸 너무 많다.」 → 안 「가」

     ⚠ 이 검사는 한때 «구현»(.grid2 · class="sect")을 글자로 못 박고 있었다.
       같은 지시를 더 밀고 나가(2열 → 3열, 구역 머리 없앰) 기능이 나아졌는데 검사가 깨졌다 —
       CLAUDE.md 의 「지금 값이 아니라 규칙을 못 박는다」에 어긋난 검사였다.
       그래서 «규칙»으로 다시 조준한다: 격자로 놓이는가 · 좁은 화면에서 접히는가. */
  const 설정 = /function 설정화면\(\)\{[\s\S]*?\n\}/.exec(news);
  assert.ok(설정, '설정화면 을 못 찾았다');
  /* ① 한 칸씩 아래로 쌓지 않고 «격자»로 놓는다
       ⚠ 「grid-template-columns 가 어디든 있나」로 보면 안 된다 — @media 안의 값에도
         걸려서, 넓은 화면 규칙을 display:block 으로 바꿔도 통과했다(2026-09-03 되돌림).
         설정이 «실제로 쓰는 그 칸»의 규칙을 짚는다. */
  const 반 = /<div class="pad ([a-z0-9]+)"/.exec(설정[0]);
  assert.ok(반, '설정 칸이 격자 이름을 안 씁니다 (class="pad …")');
  const 규칙 = new RegExp('\\.pad\\.' + 반[1] + '\\{([^}]*)\\}').exec(news);
  assert.ok(규칙, '.pad.' + 반[1] + ' 규칙이 없습니다');
  assert.match(규칙[1], /display:\s*grid/,
    '설정 칸이 격자가 아닙니다 — 한 칸씩 아래로 쌓이면 빈 자리가 생깁니다');
  const 열 = /grid-template-columns:([^;]*)/.exec(규칙[1]);
  assert.ok(열, '열을 정하지 않았습니다');
  assert.ok((열[1].match(/1fr/g) || []).length >= 2,
    '넓은 화면에서도 한 열입니다 — 옆에 빈 자리가 남습니다: ' + 열[1]);
  /* ② 좁은 화면에서 열이 «줄어든다» — 3열을 폰에 그대로 밀면 칸이 짜부라진다 */
  assert.match(news, /@media\(max-width:\d+px\)\{[\s\S]{0,200}grid-template-columns/,
    '좁은 화면에서 열을 줄이는 규칙이 없습니다');
});

test('★ 긴 안내를 «접기만» 하고 지우지 않았다', () => {
  /* 대표 지시는 「간략하게」였지 「없애라」가 아니었다.
     이 말들은 한 번은 읽어야 한다 — 지우면 나중에 왜 안 되는지 아무도 모른다. */
  ['같은 사서함', '우리 홈페이지에 올린 그림만', '사전 동의'].forEach((말) => {
    assert.ok(news.indexOf(말) >= 0, '안내가 사라졌다: 「' + 말 + '」');
  });
  assert.match(news, /class="tipwrap"/, '접어 둘 자리(ⓘ)가 없습니다');
});

test('★★ ⓘ 안내를 «폰에서도» 펼 수 있다', () => {
  /* 폰에는 마우스 올리기가 없다. hover 만 두면 폰에서는 안내를 «영영 못 본다» —
     접어 두고 펼 길이 없으면 그것은 지운 것과 같다. */
  const css = /\.tipwrap[^{]*\{[\s\S]*?\n\.tipwrap:hover[^{]*\{[^}]*\}/.exec(news)
    || /\.tipwrap:hover[^{]*\{[^}]*\}/.exec(news);
  assert.ok(css, 'ⓘ 펼치는 규칙을 못 찾았다');
  assert.match(news, /\.tipwrap:hover \.tip,\s*\.tipwrap:focus-within \.tip/,
    'hover 만 있습니다 — 폰에서 못 폅니다(focus-within 을 함께 둘 것)');
});

test('★ 받는 명단은 기업정보함을 «그때그때» 읽는다 — 사본을 두지 않는다', () => {
  /* 대표 지시 2026-09-03: 「매주 실시간으로 확인하고 싶다. 그리고 사업장계약종료 또는
     담당자 퇴사시에 더이상 보낼필요가 없을경우 어떻게 처리해야하는지」
     ★ 답은 사본을 안 만드는 것이다 — 붙여넣은 사본은 붙여넣은 날에 멈춘다. */
  assert.match(news, /ref\('data\/companies\/v'\)/,
    '기업정보함 자리를 안 읽습니다');
  assert.match(news, /Core\.사업장에서명단\(/,
    '명단을 사업장에서 만들지 않습니다');
  /* 사본을 «읽어 명단으로 쓰는» 길이 남아 있으면 두 곳이 어긋난다 */
  assert.ok(!/App\.명단\s*=\s*v\[\d\]\.val\(\)/.test(news),
    'newsletter/recipients 사본을 아직 명단으로 씁니다');
});

test('★ 주소가 없는 곳을 화면에 보여 준다 — 빠진 줄 모르면 영영 못 받는다', () => {
  assert.match(news, /주소없는곳/, '주소 없는 곳을 안 보여 줍니다');
});

test('★ 불러오는 차례와 v[] 번호가 맞는다 — 하나 끼우면 뒤가 다 밀린다', () => {
  /* ⚠ 2026-09-03 실제로 겪었다. Promise.all 가운데에 자리 하나를 끼우니
       App.브리핑 이 엉뚱한 자리(newsletter/blocked)를 읽어 «자동 담기가 죽는» 상태가
       되었다. 화면은 멀쩡해 보이는데 기사가 0건으로만 담긴다 — 눈으로는 못 잡는다. */
  const a = news.indexOf('Promise.all([');
  const b = news.indexOf(']).then(function(v){', a);
  assert.ok(a >= 0 && b > a, '불러오기를 찾을 수 없습니다');
  const 목록 = [...news.slice(a, b).matchAll(/db\.ref\(.([^.)]+).\)/g)].map((m) => m[1]);
  assert.ok(목록.length >= 5, '읽는 자리가 너무 적습니다');

  const 바람 = {
    '설정': 'newsletter/config',
    '회차들': 'newsletter/issues',
    '사업장들': 'data/companies/v',
    '브리핑': 'homepage/newsBrief/모음'
  };
  const 몸 = news.slice(b, b + 1200);
  /* ⚠ new RegExp 에 문자열로 짜지 말 것 — 이스케이프가 반으로 줄어 조용히 안 맞는다
       (2026-09-03에 실제로 그랬다). 정규식 리터럴만 쓴다. */
  function 몇번(이름) {
    const i = 몸.indexOf('App.' + 이름);
    if (i < 0) return null;
    const m = /=[^;]*?v\[(\d)\]/.exec(몸.slice(i, i + 90));
    return m ? Number(m[1]) : null;
  }
  Object.keys(바람).forEach(function (이름) {
    const n = 몇번(이름);
    assert.ok(n !== null, 'App.' + 이름 + ' 가 v[] 에서 안 옵니다');
    assert.equal(목록[n], 바람[이름],
      'App.' + 이름 + ' 가 v[' + n + '] = ' + 목록[n] + ' 를 읽습니다 — ' +
      바람[이름] + ' 여야 합니다');
  });
});

test('★ 연습은 「나에게 시험 발송」으로 — 연습 채우기가 그것을 «말한다»', () => {
  /* ⚠ 「N곳에 보내기」는 진짜 자문사 110곳으로 나간다. 연습이 거기로 가면 사고다.
     그래서 연습 채우기 확인창이 반드시 그 말을 해야 한다. */
  const i = news.indexOf('function 연습채우기');
  assert.ok(i >= 0, '연습채우기 를 찾을 수 없습니다');
  const fn = news.slice(i, i + 1400);
  assert.match(fn, /confirm\(/, '묻지 않고 담습니다');
  assert.match(fn, /나에게 시험 발송/, '연습을 어디로 보내야 하는지 안 말합니다');
  assert.match(fn, /진짜 자문사/, '「N곳에 보내기」가 위험하다고 안 말합니다');
});

test('★ 화면이 «이 회차에 드는» 건수를 말한다 — 전체 건수만 크게 적으면 오해한다', () => {
  /* 예전에는 「지금 모아 둔 기사 43건」이라 적어 놓고 채우면 0건이 담겼다.
     왜 아무 일도 안 일어나는지 화면이 말해 주지 않았다. */
  assert.match(news, /이 회차에 드는 기사/, '이 회차 건수를 안 보여 줍니다');
  assert.match(news, /Core\.모음셈\(/, '모음셈 을 안 씁니다');
  /* 옛 문구가 남아 있으면 또 오해한다 */
  assert.ok(!/지금 모아 둔 기사 <b>\$\{Object\.keys\(App\.브리핑\)\.length\}건<\/b>/.test(news),
    '오해를 부르던 옛 문구가 남아 있습니다');
});

test('★ 꼭지 제목을 «자르지 않는다» — 읽어야 빼고 말고를 정한다', () => {
  /* 대표 지시 2026-09-03: 「화면 잘린다 이부분 어떻게 해야하나」

     ⚠ 까닭 — .item .t 에 white-space:nowrap 이 걸려 제목을 한 줄로 강제하고 잘랐다.
       거기에 꼭지를 2×2 로 놓아 칸이 또 반이 되었다. 실제로 재 보면 1400px 창에서
       제목에 남는 폭이 165px — 한글 열 자쯤이다.
     ★ 제목은 «빼고 말고를 정하려고» 읽는 것이다. 자르면 그 일을 못 한다.
       줄을 넘겨야 한다. 줄이 늘어 길어지는 것은 왼쪽 칸이 구르니 괜찮다. */
  const i = news.indexOf('.item .t{');
  assert.ok(i >= 0, '.item .t 규칙을 찾을 수 없습니다');
  const 규칙 = news.slice(i, news.indexOf('}', i));
  assert.ok(!/white-space:\s*nowrap/.test(규칙),
    '제목이 아직 한 줄로 강제됩니다 — 긴 제목이 잘립니다');
  assert.ok(!/text-overflow:\s*ellipsis/.test(규칙),
    '제목을 아직 …으로 자릅니다');
  assert.match(규칙, /word-break:\s*keep-all/,
    '한글은 낱말째로 줄을 넘겨야 합니다 — 글자 가운데서 끊기면 읽기 어렵습니다');
});

test('★ 제목이 두 줄이 되어도 단추가 위에 붙어 있다', () => {
  /* 가운데 정렬이면 두 줄짜리 제목 옆에서 ▲▼✕ 가 가운데로 내려가 줄이 안 맞는다. */
  const i = news.indexOf('.item{');
  assert.ok(i >= 0, '.item 규칙을 찾을 수 없습니다');
  const 규칙 = news.slice(i, news.indexOf('}', i));
  assert.match(규칙, /align-items:\s*flex-start/,
    '단추가 가운데에 붙어 두 줄 제목과 줄이 안 맞습니다');
});

test('★ 받는 명단도 위를 얼린다 — 아래에 «구르는 칸»이 함께 있어야 한다', () => {
  /* 대표 지시 2026-09-03 「캡쳐1 틀고정」 — 110줄을 훑을 때 위가 사라지면
     지금 무슨 유형을 보고 있는지 · 몇 곳인지를 잃는다.
     ⚠ 얼리기만 걸고 «구르는 칸»을 안 두면 표가 통째로 잘린다. 둘은 짝이다. */
  const 껍 = 껍데기CSS();
  assert.match(껍, /\.wrap\.who/, '받는 명단 얼리기 규칙이 없습니다');
  assert.match(껍, /\.wrap\.who>\.whorest\{[^}]*overflow-y:auto/,
    '얼렸는데 구르는 칸이 없습니다 — 표가 잘립니다');
  assert.match(news, /class="whorest"/, '화면에 구르는 칸이 없습니다');
  assert.match(news, /classList\.toggle\('who'/, "render 가 who 표를 안 붙입니다");
});

test('★ 「이 명단은 지금 기업정보함을…」 안내를 지웠다 (대표 지시 「2 삭제」)', () => {
  assert.ok(!/이 명단은 «지금» 기업정보함을 읽은 것입니다/.test(news),
    '지우라고 하신 안내가 남아 있습니다');
});

test('★ 넘버링 왼쪽에 체크칸 · 전체 선택 · 고른 것만 처리 (대표 지시)', () => {
  /* 대표 지시 2026-09-03: 「넘버링 왼쪽 표시 체크가능하게 일괄 선택등 가능하게」
     ⚠ 110줄에서 몇 곳만 골라 처리하려면 체크칸이 있어야 한다. 지금은 한 줄씩
       「수신거부」를 눌러야 했다. */
  assert.match(news, /id="chkAll"/, '전체 선택 칸이 없습니다');
  assert.match(news, /class="chk"/, '줄마다 체크칸이 없습니다');
  assert.match(news, /function 전체선택/, '전체 선택을 다루는 곳이 없습니다');
  assert.match(news, /function 고른것/, '고른 것을 모으는 곳이 없습니다');
});

test('★ 고른 것이 없으면 «묻지도 않고» 멈춘다 — 빈 선택으로 110곳을 건드리면 사고다', () => {
  const i = news.indexOf('function 고른것수신거부');
  assert.ok(i >= 0, '고른것수신거부 가 없습니다');
  const fn = news.slice(i, i + 900);
  assert.match(fn, /고른것\(\)/, '고른 것을 안 읽습니다');
  assert.match(fn, /length/, '고른 것이 몇인지 안 봅니다');
  assert.match(fn, /confirm\(/, '묻지 않고 처리합니다');
});

test('★ 연락처가 «옆 열»에 있고 머리와 몸통의 열 수가 맞는다', () => {
  /* 대표 지시 2026-09-03: 「연락처를 아래에 두지말고 옆에두고 열을 일치시켜라」
     ⚠ 열 수가 어긋나면 표가 «한 칸씩 밀려» 담당자 자리에 전화가 들어간다.
       눈으로는 「왜 이상하지」 정도로만 보이고 무엇이 틀렸는지 모른다. */
  const i = news.indexOf('function 명단화면');
  assert.ok(i >= 0, '명단화면 을 찾을 수 없습니다');
  const 몸 = news.slice(i, news.indexOf('function ', i + 20));

  /* 머리의 <th> 수 */
  const 머리 = /<tr>\s*<th class="ck">[\s\S]*?<\/tr>/.exec(몸);
  assert.ok(머리, '표 머리를 찾을 수 없습니다');
  const th = (머리[0].match(/<th/g) || []).length;

  /* 줄의 <td> 수 — 문자열을 이어 붙여 만드니 '<td' 를 센다 */
  const 줄시작 = 몸.indexOf("return '<tr>'");
  assert.ok(줄시작 >= 0, '줄 만드는 곳을 찾을 수 없습니다');
  const 줄 = 몸.slice(줄시작, 몸.indexOf("'</tr>'", 줄시작));
  const td = (줄.match(/<td/g) || []).length;

  assert.equal(td, th, '머리 ' + th + '칸 · 줄 ' + td + '칸 — 표가 한 칸씩 밀립니다');

  /* 연락처가 «아래»가 아니라 «옆»인지 */
  assert.ok(!/사람칸\(/.test(몸), '연락처를 이름 아래에 붙이는 옛 방식이 남아 있습니다');
  assert.match(몸, /class="tel"/, '연락처 열이 없습니다');
  assert.match(news, /td\.tel\{[^}]*tabular-nums|td\.tel\{[^}]*tnum/,
    '전화 숫자 폭을 고정하지 않았습니다 — 열을 갈라도 세로로 어긋납니다');
});

test('★ 탭의 「받는 명단 N」은 «언제나 전체»다 — 유형 칩을 눌러도 안 바뀐다', () => {
  /* 대표 지시 2026-09-03: 「받는명단이 자문 급여 등 버튼을 누르면 받는명단의 숫자도
     바뀐다 이부분 수정해라」
     ⚠ 탭 숫자가 칩을 따라 바뀌면 «명단이 몇인지» 알 수 없다. 자문을 눌러 27 이 되면
       전체가 27 인 줄로 보인다(실제로는 114 다). 탭은 «늘 같은 것»을 말해야 한다.
     ★ 명단셈() 은 거르기 «전»을 d.전체 에 담아 둔다 — 탭은 그것을 써야 한다. */
  const i = news.indexOf("$('cWho')");
  assert.ok(i >= 0, '탭 숫자를 정하는 곳을 찾을 수 없습니다');
  const 줄 = news.slice(i, news.indexOf('\n', i));
  assert.match(줄, /전체/, '거르기 전 수(전체)를 쓰지 않습니다');
  assert.ok(!/셈\.보낼곳/.test(줄),
    '걸러낸 뒤의 수를 씁니다 — 칩을 누르면 탭 숫자가 따라 바뀝니다');
});

/* ══ 설정 탭을 «좌우 반반»으로 (대표 지시 2026-09-07) ═════════════════
   「뉴스레터 설정 화면은 정리해서 왼쪽절반에 넣고 자료 가지고 오는것은 오른쪽절반으로」
   대표 확인 「폰에서는 목업대로 그러나 피시에서는 좌우 화면으로」

   ⚠ 이 검사가 지키는 것은 «칸이 둘인가»와 «잃은 것이 없는가»다.
     자리를 옮기는 손질은 조용히 칸 하나를 떨어뜨리기 쉽다 — 화면은 멀쩡해 보인다. */

const 설정본 = (/function 설정화면\(\)\{[\s\S]*?\n\}/.exec(news) || [''])[0];

test('★★ 설정 탭이 «좌우 두 칸» — 왼쪽 설정 · 오른쪽 가져오기', () => {
  assert.ok(설정본, '설정화면 을 못 찾았다');
  assert.match(설정본, /<div class="cols">/,
    '★ 좌우로 나누는 껍데기가 없다 — 세 상자가 위아래로 쌓여 두 번 굴러야 다 보인다');
  const i설정 = 설정본.indexOf('뉴스레터 설정');
  const i자료 = 설정본.indexOf('발간자료·판례 지금 가져오기');
  const i노무 = 설정본.indexOf('공인노무사회 자료 가져오기');
  assert.ok(i설정 >= 0 && i자료 > i설정 && i노무 > i자료,
    '★ 설정이 왼쪽, 가져오기 둘이 오른쪽이라는 차례가 깨졌다');
});

test('★ 좌우 두 칸이 «폰에서는 위아래»가 된다', () => {
  const 규칙 = /\.cols\{([^}]*)\}/.exec(news);
  assert.ok(규칙, '.cols 규칙이 없다');
  assert.match(규칙[1], /display:\s*grid/, '★ 격자가 아니다');
  assert.ok((규칙[1].match(/1fr/g) || []).length >= 2,
    '★ 넓은 화면에서도 한 칸이다 — 피시에서 좌우로 안 나뉜다: ' + 규칙[1]);
  assert.match(news, /@media\(max-width:\d+px\)\{\.cols\{grid-template-columns:1fr\}/,
    '★ 폰에서 위아래로 안 접힌다 — 두 칸이 짜부라진다');
});

test('★★ 좌우로 나누면서 칸을 «하나도» 잃지 않았다', () => {
  ['cfgScope', 'cfgFrom', 'cfgReply', 'cfgTestTo', 'cfgName', 'cfgFoot', 'cfgTrack',
   'cfgCeo', 'cfgTel', 'cfgAddr', 'cfgLogo', 'cfgBanner', 'cfgNews'].forEach(function (id) {
    assert.ok(설정본.indexOf('id="' + id + '"') >= 0, '★ 설정 칸이 사라졌다: ' + id);
  });
});

test('★ 접은 넷은 «접은 것»이지 지운 것이 아니다', () => {
  const 접 = /<details class="fold">[\s\S]*?<\/details>/.exec(설정본);
  assert.ok(접, '★ 접는 칸이 없다');
  ['cfgLogo', 'cfgBanner', 'cfgNews', 'cfgTrack'].forEach(function (id) {
    assert.ok(접[0].indexOf('id="' + id + '"') >= 0,
      '★ ' + id + ' 이 접는 칸 밖에 있다 — 자리를 반 폭에 그대로 먹는다');
  });
  assert.match(접[0], /보이지 않는 그림 한 점/,
    '★ 접으면서 안내를 지웠다 — 접는 것과 지우는 것은 다르다');
});

test('★ 「보내는 때는 손으로」 안내가 «보내기 칸 곁»에 있다', () => {
  const i안내 = 설정본.indexOf('보내는 때');
  const i자료 = 설정본.indexOf('발간자료·판례 지금 가져오기');
  assert.ok(i안내 >= 0, '★ 안내가 사라졌다');
  assert.ok(i안내 < i자료,
    '★ 자료 상자 아래에 남아 있다 — 자료 가져오기와 상관없는 말이다');
});
