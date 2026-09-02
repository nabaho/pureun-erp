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
