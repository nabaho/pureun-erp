/* 발간자료·판례가 «화면과 서버에 이어져» 있는지
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-09-05: 「시스템을 자동으로 찾아오고 데이터를 다운받아서
   확인할 수 있게 만들어라.」

   ★ 판단(functions/news-docs.js · news-prec.js)은 따로 검사한다
     (tests/newsletter-docs.test.js). 여기서 보는 것은 «이어져 있나»다 —
     서버가 담는 자리와 화면이 읽는 자리가 같은가, 자동으로 도는 것이 있는가,
     내려받아 크기를 재는가.

   ⚠ 이 종류가 제일 조용히 깨진다. 판단은 멀쩡한데 «아무도 안 불러서»
     화면에 영영 안 나오는 것 — 2026-09-03 에 대표자 규칙이 그랬다.

   ⚠ 글자로 보는 검사는 «주석을 걷고» 본다. 안 걷으면 잘 쓴 주석이 검사를 통과시킨다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { stripComments } = require('./strip-comments');

const ROOT = path.join(__dirname, '..');
const 읽기 = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const news = stripComments(읽기('pu-news.html'));
const idx = stripComments(읽기('functions/index.js'));
const tpl = stripComments(읽기('js/pu-news-tpl.js'));
const core = stripComments(읽기('js/pu-news-core.js'));

/* ══════ ① 서버가 «자동으로» 찾아온다 ══════ */

test('★ 발간자료·판례를 «날마다 저절로» 모은다 — 사람이 안 눌러도', () => {
  assert.ok(idx.indexOf('exports.dailyDocsCollect') >= 0,
    '★ 자동으로 모으는 것이 없다 — 대표 지시의 「자동으로 찾아오고」가 빠졌다');
  const i = idx.indexOf('exports.dailyDocsCollect');
  const seg = idx.slice(i, i + 700);
  assert.ok(/\.pubsub\.schedule\(["']every day/.test(seg), '날마다 도는 것이 아니다');
  assert.ok(/timeZone\(["']Asia\/Seoul["']\)/.test(seg), '서울 시각이 아니다');
});

test('★ 뉴스 모으기와 «같은 시각»에 안 돈다 — 둘 다 느려진다', () => {
  const 뉴 = /schedule\(["']every day (\d\d:\d\d)["']\)/.exec(
    idx.slice(idx.indexOf('exports.dailyNewsCollect'), idx.indexOf('exports.dailyNewsCollect') + 700));
  const 자 = /schedule\(["']every day (\d\d:\d\d)["']\)/.exec(
    idx.slice(idx.indexOf('exports.dailyDocsCollect'), idx.indexOf('exports.dailyDocsCollect') + 700));
  assert.ok(뉴 && 자, '두 시각을 못 읽었다');
  assert.notStrictEqual(뉴[1], 자[1], '두 모으기가 같은 시각에 돈다');
});

test('★ 첨부를 «실제로 내려받아» 크기를 잰다 — 「다운받아서 확인할 수 있게」', () => {
  assert.ok(idx.indexOf('async function 파일받아보기') >= 0, '내려받는 자리가 없다');
  const i = idx.indexOf('async function 파일받아보기');
  const seg = idx.slice(i, i + 2200);
  assert.ok(/것\.파일크기 = buf\.length/.test(seg), '받아 놓고 크기를 안 잰다');
  assert.ok(/getStorage\(\)\.bucket\(\)/.test(seg), '우리 사본을 안 둔다');
  assert.ok(/자료최대바이트/.test(seg), '크기 상한이 없다 — 큰 파일에 함수가 터진다');
});

test('★ 사본 주소는 «만료되지 않는» 토큰 방식이다', () => {
  /* ⚠ 서명 URL(getSignedUrl)은 만료된다. 사진에서 그것 때문에 옛것이 일제히
       안 보인 적이 있다(tests/photos-url-retry.test.js). 자료도 같은 잣대다. */
  const i = idx.indexOf('async function 파일받아보기');
  const seg = idx.slice(i, i + 2200);
  assert.ok(/firebaseStorageDownloadTokens/.test(seg), '토큰 방식이 아니다');
  assert.ok(!/getSignedUrl/.test(seg), '★ 서명 URL 은 만료된다 — 몇 달 뒤 사본이 안 열린다');
});

test('★ 못 받아도 자료를 «버리지 않는다» — 기관 서버가 잠깐 느릴 수 있다', () => {
  const i = idx.indexOf('async function 파일받아보기');
  const seg = idx.slice(i, i + 2400);
  assert.ok(/catch \(e\)/.test(seg), '실패를 안 받아 낸다');
  assert.ok(/것\.확인 = "못받음"/.test(seg), '못 받은 것을 표시하지 않는다');
  assert.ok(/return 것;/.test(seg), '실패하면 자료까지 잃는다');
});

test('「지금 가져오기」는 총괄관리자만 — 남의 서버를 여러 번 두드리는 일이다', () => {
  const i = idx.indexOf('exports.newsDocsPull');
  assert.ok(i >= 0, 'newsDocsPull 이 없다');
  const seg = idx.slice(i, i + 1600);
  assert.ok(/requireStaff\(req\)/.test(seg), '로그인 확인이 없다');
  assert.ok(/권\.isAdmin !== true/.test(seg), '총괄관리자 확인이 없다');
});

test('★ 스케줄과 「지금 가져오기」가 «같은 몸통»을 쓴다 — 두 벌이면 한쪽만 낡는다', () => {
  const 부름 = (idx.match(/자료판례모아담기\(/g) || []).length;
  assert.ok(부름 >= 3, '모아담기를 한 곳에서만 쓴다 — 두 문이 갈렸을 수 있다');
});

test('★★ 자료를 «샘마다» 가져온다 — 한 샘이 다 채우지 못하게', () => {
  /* ⚠ 셋을 한 통에 넣고 자르면 값어치 높은 샘이 밀려난다 — 보도자료가 날마다
       열 건씩 올라오니 그것만으로 다 채워질 수 있다. */
  const i = idx.indexOf('async function 자료거리모으기(');
  assert.ok(i > 0, '자료거리모으기 를 못 찾음');
  const seg = idx.slice(i, i + 2200);
  /* ⚠ 「자료부품.샘들 이 어딘가 있다」로는 모자란다 — 몫을 셈하는 줄
       (몇 / 자료부품.샘들.length)에 걸려, 한 샘만 읽게 바꿔도 통과했다.
       «고리 자체»를 본다. */
  assert.ok(seg.indexOf('for (const S of 자료부품.샘들)') >= 0,
    '★★ 샘 목록을 돌지 않는다 — 한 곳만 읽는다');
  assert.ok(seg.indexOf('목록제목: m.제목') >= 0,
    '★ 목록 제목을 안 넘긴다 — KLI 가 「국내노동동향」으로만 나간다');
  assert.ok(seg.indexOf('m.일련번호, S') >= 0, '샘을 상세 읽개에 안 넘긴다');
});

test('★★ 행정해석을 «모으고 담는다» — 꼭지 이름에 있는데 비어 있던 그것', () => {
  assert.ok(idx.indexOf('async function 해석거리모으기(') >= 0,
    '★★ 행정해석을 모으는 자리가 없다');
  assert.ok(idx.indexOf('해석거리모으기(O.해석몇') >= 0,
    '★★ 모으개가 있어도 «아무도 안 부른다» — 판단이 멀쩡해도 안 부르면 헛것이다');
});

test('★ 판례와 해석을 «한 자리»에 담는다 — 꼭지가 하나이므로', () => {
  /* 자리를 갈라 두면 화면이 두 곳을 읽어야 한다. 모양도 같다(갈래: 판례). */
  const i = idx.indexOf('async function 해석거리모으기(');
  const j = idx.indexOf('판.concat(해)');
  assert.ok(i > 0 && j > 0, '★ 판례와 해석을 합치는 자리가 없다');
  assert.ok(idx.indexOf('"homepage/newsPrec"') >= 0, '담는 자리가 없다');
});

test('★ 해석을 못 모아도 판례는 담는다 — 한 문이 막혀도 나머지는 간다', () => {
  const i = idx.indexOf('const 판 = await 판례거리모으기(');
  assert.ok(i > 0, '판례 모으기 부름을 못 찾음');
  const seg = idx.slice(i, i + 500);
  assert.ok(/try \{ 해 = await 해석거리모으기/.test(seg),
    '★ 해석 모으기를 감싸지 않았다 — 법제처가 한 번 느리면 판례까지 잃는다');
});

test('★ 한 샘이 죽어도 나머지 샘은 가져온다', () => {
  const i = idx.indexOf('async function 자료거리모으기(');
  const seg = idx.slice(i, i + 2200);
  const 감쌈 = (seg.match(/catch \(e\)/g) || []).length;
  assert.ok(감쌈 >= 2, '★ 샘 하나가 죽으면 나머지도 못 가져온다 (catch " + 감쌈 + "군데)');
});

/* ══════ ② 화면이 «서버가 담은 자리»를 읽는다 ══════ */

test('★ 화면이 읽는 자리와 서버가 담는 자리가 «같다»', () => {
  ['homepage/newsDocs', 'homepage/newsPrec'].forEach((자리) => {
    assert.ok(idx.indexOf('"' + 자리 + '"') >= 0, '서버가 ' + 자리 + ' 에 안 담는다');
    assert.ok(news.indexOf("'" + 자리 + "/모음'") >= 0, '화면이 ' + 자리 + ' 를 안 읽는다');
  });
});

test('★ 「이 주차로 채우기」가 자료·판례를 «함께» 넘긴다', () => {
  const i = news.indexOf('function 자동담기(');
  assert.ok(i > 0, '자동담기 를 못 찾음');
  const fn = news.slice(i, i + 1600);
  assert.ok(/자료:\s*자료/.test(fn), '자료를 안 넘긴다');
  assert.ok(/판례:\s*판례/.test(fn), '판례를 안 넘긴다');
  assert.ok(/법령:/.test(fn), '법령 자리를 없앴다 — 자료가 없는 주에 꼭지가 통째로 빈다');
});

test('★★ 채우기가 이미 담긴 것을 «갈아 끼우지» 않는다', () => {
  /* ⚠ 2026-09-06 대표 화면: 노무사회 자료 넷을 골라 담으신 뒤 채우기를 누르면
       그 넷이 «말없이» 사라졌다. d.안 을 통째로 갈아 끼우고 있었고 묻지도 않았다.
     ★ 합치는 규칙 자체는 Core 가 지킨다(tests/newsletter-docs.test.js).
       여기서 보는 것은 «화면이 그것을 부르는가»다 — 판단이 멀쩡해도 안 부르면 헛것이다. */
  const i = news.indexOf('function 자동담기(');
  assert.ok(i > 0, '자동담기 를 못 찾음');
  const fn = news.slice(i, i + 2000);
  assert.ok(fn.indexOf('Core.합쳐담기(d.안,') >= 0,
    '★ 이미 담긴 것을 안 넘긴다 — 갈아 끼우고 있다');
  assert.ok(fn.indexOf('d.안 = Core.자동으로담기(') < 0, '★ 아직 통째로 갈아 끼운다');
});

test('채우기가 «지킨 것과 더한 것»을 갈라 말한다', () => {
  /* 「몇 건 담았다」만 말하면 이미 있던 것까지 센 숫자라, 새로 온 것이 없어도
     담긴 것처럼 들린다. */
  const i = news.indexOf('function 자동담기(');
  const fn = news.slice(i, i + 2200);
  assert.ok(fn.indexOf('이미 담긴') >= 0, '지킨 것을 안 말한다');
});

test('★★ 이미 담긴 노무사회 칸을 «올려 주는 길»이 화면에 이어져 있다', () => {
  /* ⚠ Core 에 올리개가 있어도 «아무도 안 부르면» 대표 화면은 영영 점 찍힌 줄이다.
       2026-09-06 에 실제로 그 상태였다. */
  assert.ok(news.indexOf('Core.노무사회칸올리기(') >= 0, '★ 화면이 올리개를 안 부른다');
  assert.ok(news.indexOf('async function 노무사회칸올림(') >= 0, '올리는 자리가 없다');
});

test('★ 노무사회 창고를 «시작할 때» 읽는다 — 서랍을 안 열어도 올라가게', () => {
  /* 예전에는 그 서랍을 열 때만 읽었다. 그러면 서랍을 안 여시는 한 영영 안 올라간다. */
  const i = news.indexOf('render();');
  assert.ok(i > 0, 'render 부름을 못 찾음');
  assert.ok(/노무사회읽기\(\);/.test(news), '시작할 때 노무사회 창고를 안 읽는다');
  const j = news.indexOf('async function 노무사회읽기(');
  /* ⚠ 창을 넓게 잡으면 바로 뒤의 «함수 정의»까지 삼켜 부름이 없어도 통과한다 —
     되돌려 보고서야 알았다. 함수 끝(닫는 중괄호 줄)까지만 본다. */
  const 끝 = news.indexOf(String.fromCharCode(10) + '}', j);
  const fn = news.slice(j, 끝 > j ? 끝 : j + 900);
  assert.ok(fn.indexOf('await 노무사회칸올림()') >= 0, '읽고 나서 올리지 않는다');
});

test('★ 「지워지고 새로 채워집니다」라던 안내가 «사실과 맞는다»', () => {
  /* ⚠ 2026-09-06 에 채우기를 합치기로 바꾸고도 안내는 옛말 그대로였다 —
       화면이 거짓말을 하면 대표께서 누르기를 망설이신다. */
  assert.ok(news.indexOf('지워지고 새로 채워집니다') < 0, '★ 옛 안내가 남아 있다 — 이제 안 지운다');
  assert.ok(news.indexOf('그대로 두고') >= 0, '무엇을 지키는지 안 말한다');
});

test('★★★ 시험 발송도 «진짜와 똑같이» 나간다 — 추적 열쇠와 링크 목록', () => {
  /* ⚠⚠ 2026-09-06 대표께서 받으신 시험 편지에서 「내려받기」를 누르니 포털 대문이 떴다.
       상태줄: newsClick?i=2026-09-w1&e={추적열쇠}&n=1
       ① {추적열쇠} 는 대량 발송기가 통마다 바꿔 넣는 자리인데, 시험은 그 길을 안 지나
          «글자 그대로» 나갔다.
       ② newsClick 은 회차에 적어 둔 링크 목록에서 번호로 목적지를 찾는데,
          시험 발송이 그 목록을 안 적어 모든 링크가 「모르는 번호」가 되었다.
     ★ 시험이 진짜와 다르면 시험이 아니다 — 대표께서 「되는구나」 하고 진짜를 보내신다. */
  const i = news.indexOf('async function 시험발송(');
  assert.ok(i > 0, '시험발송 을 못 찾음');
  const 끝 = news.indexOf(String.fromCharCode(10) + '}', i);
  const fn = news.slice(i, 끝 > i ? 끝 : i + 3000);
  /* ⚠ 「{추적열쇠} 가 어딘가 있다」로는 모자란다 — 바꾸지 않고 그대로 둬도 통과한다.
       «바꾸는 식» 자체를 본다. */
  assert.ok(fn.indexOf(".split('{추적열쇠}').join(열쇠)") >= 0,
    '★★ 추적 열쇠를 안 바꾼다 — 받는 편지에 {추적열쇠} 가 글자 그대로 나간다');
  assert.ok(fn.indexOf('Core.주소열쇠(받을곳)') >= 0,
    '★ 열쇠를 서버와 «같은 잣대»로 짓지 않는다');
  /* ⚠ 정규식으로 적지 않는다 — 백슬래시가 도구를 지나며 반으로 줄어 \s 가 s 가 된다.
       이 파일에서만 벌써 세 번 걸렸다. 찾을 것이 낱말이면 글자로 찾는다. */
  assert.ok(fn.indexOf('링크들: 편.링크들') >= 0,
    '★★ 링크 목록을 회차에 안 적는다 — 내려받기를 눌러도 대문으로 튕긴다');
  /* ⚠ 감싸면 진짜 발송과 «다른 주소»가 된다 — 대량 발송기는 날것으로 끼워 넣는다 */
  assert.ok(fn.indexOf('encodeURIComponent(열쇠)') < 0,
    '★ 시험만 열쇠를 감싼다 — 진짜와 다른 주소로 나간다');
});

test('★★★ 「채우기」는 «누를 때마다» 담는다 — 첫 값이 이미 auto 다', () => {
  /* ⚠⚠ 2026-09-06 에 이것 때문에 «빈 뉴스레터가 시험 발송까지 갔다».
       App 의 첫 값이 길:'auto' 라, 이 단추는 화면을 열자마자 이미 눌린 꼴이다.
       거기에 「이미 그 칸이면 건너뛴다」를 두었더니 눌러도 «늘» 건너뛰었다 —
       그런데 칸에는 「담았습니다」라고 적혀 있어 담긴 줄 아셨고,
       주간노동뉴스 0건 · 판례 0건인 채로 시험 메일이 나갔다.
     ★ 합쳐 담기라 두 번 눌러도 늘지 않고 지워지지도 않는다. 매번 담아도 된다. */
  assert.ok(/길:\s*'auto'/.test(news),
    '첫 값이 auto 가 아니게 되었다 — 이 검사의 전제를 다시 보십시오');
  const i = news.indexOf('function 길바꾸기(');
  assert.ok(i > 0, '길바꾸기 를 못 찾음');
  const 끝 = news.indexOf(String.fromCharCode(10) + '}', i);
  const fn = news.slice(i, 끝 > i ? 끝 : i + 800);
  assert.ok(!/처음/.test(fn),
    '★★★ 「처음일 때만」 관문이 돌아왔다 — 첫 값이 auto 라 단추가 한 번도 안 먹는다');
  assert.ok(fn.indexOf('자동담기()') >= 0, '★ 단추가 담지 않는다');
});

test('★★ 담기 칸이 «담았다고 단정하지» 않는다 — 안 담겼는데 담긴 줄 알면 빈 편지가 나간다', () => {
  /* 무슨 일이 일어났는지는 알림(toast)이 말한다. 칸에는 «규칙»만 적는다. */
  assert.ok(news.indexOf('<b>담았습니다.</b>') < 0,
    '★★ 칸이 「담았습니다」라고 단정한다 — 2026-09-06 에 이 글이 거짓이었다');
  assert.ok(news.indexOf('누르면 담습니다') >= 0, '무엇을 하는 단추인지 안 말한다');
});

test('★★ 「채우기」 단추를 누르면 «정말 채워진다» — 칸만 열지 않는다', () => {
  /* ⚠ 2026-09-06 대표 화면: 「⟳ 이 주치로 채우기 60건」을 누르고 담긴 줄 아셨는데,
       그 단추는 칸만 열었다. 안쪽의 「지금 채우기」를 한 번 더 눌러야 담겼고,
       서버에는 news 0 인 채로 남아 있었다. 「채우기」라 적혀 있으면 채워야 한다.
     ★ 합쳐 담기라 눌러도 담긴 것이 사라지지 않으니 바로 담아도 된다. */
  const i = news.indexOf('function 길바꾸기(');
  assert.ok(i > 0, '길바꾸기 를 못 찾음');
  const 끝 = news.indexOf(String.fromCharCode(10) + '}', i);
  const fn = news.slice(i, 끝 > i ? 끝 : i + 700);
  assert.ok(fn.indexOf('자동담기()') >= 0, '★ 단추가 칸만 열고 안 담는다');
  /* ⚠ 여기 「처음일 때만 담는다」를 요구하는 줄이 있었다 — 그것이 곧 다음 버그였다.
       App 의 첫 값이 길:'auto' 라 그 관문은 «늘» 걸려, 단추가 한 번도 안 먹었다.
       위의 ★★★ 검사가 그 자리를 대신 지킨다. */
});

test('★ 찬 꼭지는 «이름으로» 말한다 — 숫자만 말하면 왜 안 담겼는지 모른다', () => {
  const i = news.indexOf('function 자동담기(');
  const fn = news.slice(i, i + 2600);
  assert.ok(fn.indexOf('이미 차 있어') >= 0, '찬 꼭지를 안 말한다');
  assert.ok(fn.indexOf('✕ 로 빼고 다시') >= 0, '어떻게 하면 되는지 안 알려 준다');
});

test('★ 노무사회 자료를 «자료»로 담는 길이 Core 에 있다', () => {
  const i = core.indexOf('function 노무사회줄(');
  assert.ok(i > 0, '노무사회줄 을 못 찾음');
  const fn = core.slice(i, i + 1800);
  assert.ok(fn.indexOf('자료다듬기(') >= 0,
    '★ 첨부가 있어도 기사로 담는다 — 표지도 내려받기도 안 나온다');
  assert.ok(fn.indexOf('x.첨부') >= 0, '첨부를 안 본다');
});

test('★ 화면이 «판단을 스스로 다시 만들지 않는다» — Core 를 부른다', () => {
  const i = news.indexOf('function 자동담기(');
  const fn = news.slice(i, i + 1600);
  assert.ok(/Core\.자동으로담기\(/.test(fn), '화면이 제 나름대로 담고 있다');
});

test('★ 자료 줄에 «목차와 내려받을 파일»이 보인다 — 제목만으로는 판단이 안 된다', () => {
  const i = news.indexOf('function 곁줄(');
  assert.ok(i > 0, '곁줄 이 없다');
  const fn = news.slice(i, i + 1600);
  assert.ok(/파일 열어 보기/.test(fn), '파일을 열 손잡이가 없다 — 「다운받아서 확인」이 안 된다');
  assert.ok(/목차 없음/.test(fn), '목차가 비었을 때 말해 주지 않는다');
  assert.ok(/목차고치기/.test(fn), '목차를 채울 길이 없다');
});

test('목차는 «사람이» 채운다 — 기계가 지어내면 책에 없는 차례가 나간다', () => {
  const i = news.indexOf('function 목차고치기(');
  assert.ok(i > 0, '목차고치기 가 없다');
  const fn = news.slice(i, i + 900);
  assert.ok(/prompt\(/.test(fn), '사람에게 묻지 않는다');
  assert.ok(/slice\(0\s*,\s*4\)/.test(fn), '넉 줄 상한이 없다 — 편지 칸이 넘친다');
});

test('「지금 가져오기」 단추가 화면에 있고, 서버 이름이 맞다', () => {
  assert.ok(news.indexOf('newsDocsPull') >= 0, '화면이 newsDocsPull 을 안 부른다');
  assert.ok(news.indexOf('자료가져오기(') >= 0, '단추가 없다');
});

/* ══════════════════════════════════════════════════════════════════════════
   ②-2 자리 — «갇히는 것»이 없어야 한다
   ══════════════════════════════════════════════════════════════════════════
   대표 화면 2026-09-06: 「화면아래 잘렸는데 내려가서 확인할 방법도 없다」
   재 보니 얼린 그릇(901px) 안에 왼쪽 칸이 1195px 로 부풀어 308px 이 갇혀 있었다.
   ⚠ 눈으로는 「그냥 잘린 것」으로만 보인다 — 규칙으로 못 박지 않으면 또 돌아온다. */

test('★★ 얼린 화면에서 두 칸이 «줄 높이에 맞춰 늘어난다»', () => {
  /* .cols 의 기본은 align-items:start — 칸이 제 내용만큼 커져 그릇 밖으로 넘친다.
     그 상태에서는 .colL 이 제 키를 다 쓴 줄 알아 구름막대도 안 내준다. */
  const i = news.indexOf('.wrap.now>.cols{');
  assert.ok(i > 0, '.wrap.now>.cols 규칙을 못 찾음');
  const 규칙 = news.slice(i, news.indexOf('}', i));
  assert.ok(규칙.indexOf('align-items:stretch') >= 0,
    '★★ 칸이 늘어나지 않는다 — 넘친 만큼이 overflow:hidden 안에 갇힌다');
  assert.ok(규칙.indexOf('min-height:0') >= 0, 'flex 자식이 안 줄어든다');
});

test('★★ 고른 꼭지 하나가 «남은 자리를 다 쓴다» — 넘치면 그 안에서 구른다', () => {
  /* ⚠ 2026-09-08 에 꼭지가 «탭»이 되었다(대표 지시). 그 전에는 두 줄이 자리를
       반씩 나눠 가졌고, 격자의 1fr 이 minmax(auto,1fr) 이라 아랫줄이 창 밖으로
       밀려나는 탈이 있었다 — 그 규칙(minmax(0,1fr))은 이제 «둘 곳이 없다».
     ★★ 지키는 규칙은 그때와 같다: «칸이 줄어들 수 있고, 넘친 것을 볼 길이 있는가».
       - 탭줄은 높이가 일정하니 얼려도 된다
       - 칸 하나가 flex:1 로 남은 자리를 다 쓴다
       - min-height:0 이 없으면 flex 자식은 «안 줄어든다» — 그러면 도로 밀려난다
       - 넘친 것은 칸 «안»에서 구른다 */
  const i = news.indexOf('.colL>.jarpanel{');
  assert.ok(i > 0, '★ 고른 꼭지 칸이 남은 자리를 쓰는 규칙이 없다');
  const 규칙 = news.slice(i, news.indexOf('}', i));
  assert.ok(/flex:\s*1/.test(규칙), '★ 칸이 남은 자리를 안 채운다');
  assert.ok(/min-height:\s*0/.test(규칙),
    '★★ min-height:0 이 없다 — flex 자식이 안 줄어들어 넘친 만큼이 창 밖으로 밀려난다');
  const j = news.indexOf('.jarpanel>.jarbody{');
  assert.ok(j > 0, '.jarpanel>.jarbody 규칙을 못 찾음');
  const 몸 = news.slice(j, news.indexOf('}', j));
  assert.ok(/overflow-y:\s*auto/.test(몸), '★ 넘친 것을 볼 길이 없다 — 잘려서 안 보인다');
  assert.ok(/min-height:\s*0/.test(몸), '★ 구르는 칸이 안 줄어든다');
  /* 탭줄은 얼려야 한다 — 함께 구르면 어느 꼭지를 보고 있는지 잃는다 */
  const k = news.indexOf('.colL>.jartabs{');
  assert.ok(k > 0 && /flex:\s*0/.test(news.slice(k, news.indexOf('}', k))),
    '★ 탭줄이 함께 구른다 — 훑는 동안 어느 꼭지인지 잃는다');
});

test('★ 회차 줄이 «왼쪽 칸 안»에 있다 — 오른쪽 편지가 그만큼 위로 올라온다', () => {
  /* 대표 지시 2026-09-06 「캡쳐3 행의 중간을 잘라서 오른쪽은 비우고
     오른쪽 뉴스레터를 끌어올려서 더위로 화면을 채워라」 */
  const i = news.indexOf('function 이번회차화면(');
  assert.ok(i > 0, '이번회차화면 을 못 찾음');
  const 칸 = news.slice(i, i + 3000);
  const c = 칸.indexOf('class="colL"'), h = 칸.indexOf('class="hdbar"');
  assert.ok(c > 0 && h > c, '★ 회차 줄이 아직 두 칸 «바깥»에 있다 — 편지가 그만큼 눌린다');
});

test('★ 얼리기 규칙이 회차 줄을 «손자로도» 잡는다', () => {
  /* ⚠ 「>」 를 안 빼면 이 규칙이 통째로 안 걸려 줄이 도로 두꺼워진다. */
  assert.ok(news.indexOf('.wrap.now .hdbar{') >= 0, '바로자식(>)으로 남아 있다');
});

test('ⓘ 손잡이는 «한 곳»에만 있다 — 두 벌이면 한쪽만 낡는다', () => {
  /* ⚠ 화면 딴 곳에 «같은 이름의 목록»(const 도움 = [ … ])이 있다 — 그것까지 세면 안 된다.
     ⓘ 손잡이는 «글 하나를 받아 span 을 내놓는» 것이다. 받는 자리(글)까지 본다. */
  const n = (news.match(/(?:function 도움\(글\)|const 도움 = \(글\))/g) || []).length;
  assert.equal(n, 1, 'ⓘ 손잡이가 ' + n + '군데 있다 — 한 곳으로 모으십시오');
});

/* ══════ ③ 편지에 그려지는 자리 ══════ */

test('★ 자료 칸과 판례 칸이 «편지 짓는 층»에 있다', () => {
  ['function 자료칸(', 'function 판례칸(', 'function 자료카드(', 'function 표지칸(']
    .forEach((f) => assert.ok(tpl.indexOf(f) >= 0, f + ' 이 없다'));
});

test('★ 크기 셈을 «두 벌로» 두지 않는다 — 화면과 편지가 다른 자를 쓰면 안 된다', () => {
  assert.ok(/Core\.크기글\(/.test(tpl), '편지가 제 나름대로 크기를 센다');
  assert.ok(news.indexOf('Core.크기글') >= 0, '화면이 제 나름대로 크기를 센다');
});
