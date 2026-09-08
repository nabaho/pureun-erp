/* 같은 프로그램은 «한 창»만 — 대표 지시 2026-09-08
 *
 *   「기업정보함에서 보기 클릭하면 새롭게 기업정보함 창이 열린다.
 *     항상 푸른통합시스템의 모든 창은 2개가 열리지 않고 하나만 열리게 해라
 *     기존과 같이」
 *
 * ★★ `window.open(주소, '_blank')` 는 «누를 때마다 새 탭»이다. 서류를 댓 개만 훑어도
 *   기업정보함 탭이 그만큼 쌓이고, 나중에 어느 것이 무엇인지도 모르고 하나씩 닫아야
 *   한다. 2026-08-27 에 사진첩 하나만 그렇게 고쳐 달라 하셨던 것이 되풀이됐다 —
 *   그때 «그 자리만» 고쳤기 때문이다. 그래서 이번엔 규칙을 기계로 지킨다.
 *
 * ⚠ 이 검사가 막는 것은 «앱끼리 여는 창»뿐이다. 인쇄·미리보기용 빈 창이나
 *   바깥 주소(국세청·구글)는 그대로 둔다 — 그것까지 막으면 검사가 엉뚱한 데서 걸려
 *   신뢰를 잃는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments.js');
const { cutFn } = require('./cut-fn.js');

const ROOT = path.join(__dirname, '..');
const BAR_RAW = fs.readFileSync(path.join(ROOT, 'js', 'pu-appbar.js'), 'utf8');
const BAR = stripComments(BAR_RAW);

/* 푸른통합의 화면들 — 이 이름으로 창을 열면 «앱끼리 여는 것»이다 */
const APP_PAGES = ['pu-photos', 'pu-cards', 'pu-erp', 'pu-paydata', 'rules',
  'kcareer', 'work', 'fund', 'gov-consulting', 'enter'];
/* 검사할 앱 파일들 */
const APP_FILES = ['pu-photos.html', 'pu-cards.html', 'pu-erp.html', 'pu-paydata.html',
  'rules.html', 'kcareer.html', 'work.html', 'fund.html', 'gov-consulting.html'];

/* ══════ 공용 층이 그 일을 한다 ══════════════════════════════════════ */

test('★★ 창을 여는 일이 «공용 층 한 곳»에 있다 — 앱마다 적으면 한 곳은 다르게 적는다', () => {
  assert.match(BAR, /function goApp\(/, '★★ 공용 창 열기(goApp)가 없습니다');
  assert.match(BAR, /goApp:\s*goApp/, '★ 만들어 놓고 내보내지 않습니다 — 앱이 못 씁니다');
});

test('★★★ 창에 «이름»을 붙인다 — 그것이 「하나만」의 유일한 방법이다', () => {
  const fn = stripComments(cutFn(BAR_RAW, 'function goApp('));
  assert.ok(fn, 'goApp 이 없습니다');
  assert.match(fn, /global\.open\(u,\s*name\)/,
    '★★★ 이름 없이 엽니다 — 이름이 없으면 누를 때마다 새 탭이 쌓입니다');
  assert.ok(!/_blank/.test(fn), '★★★ 공용 층이 _blank 로 엽니다 — 고치려던 그 문제입니다');
});

test('★★ 이름을 «주소에서» 뽑는다 — 부르는 곳마다 적게 하면 한 곳은 반드시 다르다', () => {
  const B = require(path.join(ROOT, 'tests', 'lib-appbar-load.js'));
  const bar = B.load();
  assert.equal(bar.winNameOf('pu-cards.html?q=%EA%B0%80'), 'pu_pu_cards');
  assert.equal(bar.winNameOf('pu-photos.html?a=1&b=2'), 'pu_pu_photos');
  /* 같은 앱이면 «주소가 달라도 같은 이름» — 그래야 그 창을 다시 쓴다 */
  assert.equal(bar.winNameOf('pu-cards.html?q=1'), bar.winNameOf('pu-cards.html?q=2'),
    '★★★ 같은 앱인데 주소가 다르면 이름도 달라집니다 — 그러면 탭이 그대로 쌓입니다');
  /* 다른 앱이면 «다른 이름» — 한 창을 서로 빼앗으면 안 된다 */
  assert.notEqual(bar.winNameOf('pu-cards.html'), bar.winNameOf('pu-photos.html'),
    '★★ 다른 앱이 같은 창을 씁니다 — 기업정보함을 열면 사진첩이 사라집니다');
  /* 앱 이름을 못 뽑아도 «넘어지지 않는다» */
  assert.match(bar.winNameOf(''), /^pu_/);
  assert.match(bar.winNameOf(null), /^pu_/);
});

test('★★ 열려 있던 창을 «앞으로 끌어온다» — 안 하면 「아무 일도 안 일어난」 것처럼 보인다', () => {
  const fn = stripComments(cutFn(BAR_RAW, 'function goApp('));
  assert.match(fn, /\.focus\(\)/,
    '★★ 창을 앞으로 안 끌어옵니다 — 이미 열려 있으면 눌러도 반응이 없어 보입니다');
});

test('★★ 팝업이 막히면 «이 창»에서 간다 — 아무 일도 안 하면 반응 없는 화면이 된다', () => {
  const fn = stripComments(cutFn(BAR_RAW, 'function goApp('));
  assert.match(fn, /navTo\(/,
    '★★ 팝업이 막혔을 때 되돌아갈 길이 없습니다 — 눌러도 아무 일이 없습니다');
});

test('★ 하는 일이 다른 창은 «따로» 둘 수 있다 — 쓰던 편지가 딴 화면으로 바뀌면 안 된다', () => {
  const B = require(path.join(ROOT, 'tests', 'lib-appbar-load.js'));
  const bar = B.load();
  assert.notEqual(bar.winNameOf('pu-cards.html'), 'pu_mailwrite',
    '메일 쓰기 창과 명함 보기 창이 같은 이름입니다');
  /* purpose 를 주면 그 일 전용 이름이 되는지 — 실제로 돌려 본다 */
  const 본것 = [];
  bar.__setOpen(function (u, n) { 본것.push({ u: u, n: n }); return { focus: function () { } }; });
  bar.goApp('pu-cards.html?view=mail', 'mailwrite');
  bar.goApp('pu-cards.html?q=1');
  assert.equal(본것.length, 2);
  assert.equal(본것[0].n, 'pu_mailwrite', '★ 전용 이름이 안 붙었습니다');
  assert.notEqual(본것[1].n, 본것[0].n, '★★ 명함 보기가 메일 쓰기 창을 덮어씁니다');
});

/* ══════ 앱들이 그것을 «실제로» 쓰는가 ═════════════════════════════ */

/* 앱끼리 창을 여는 줄만 골라낸다 — 인쇄용 빈 창·바깥 주소는 제외한다.
 *
 * ★★ 막아야 할 것은 «window.open 자체»가 아니라 «이름 없이 여는 것»이다.
 *   이름이 없으면(= 새 탭) 누를 때마다 탭이 쌓인다. 이름이 있으면 브라우저가
 *   그 창을 다시 쓰므로 「하나만」이 지켜진다.
 * ⚠ 그래서 이름이 붙은 것은 통과시킨다 — 메일 쓰기가 그렇다. 그 자리는 팝업이
 *   막히면 «딴 화면»으로 되돌아가야 해서(명함 목록을 잃으면 안 된다) 공용 길과
 *   되돌림이 다르다. 억지로 합치면 그 되돌림이 사라진다.
 * ⚠ 주석을 먼저 걷는다(저장소 규칙) — 설명에 적힌 옛 코드가 걸리면 안 된다.
 */
function 이름없이여는줄(src) {
  const s = stripComments(src).replace(/^[ \t]*\/\/.*$/gm, '');
  const out = [];
  const re = /window\.open\(([^;]{0,180})/g;
  let m;
  while ((m = re.exec(s))) {
    const arg = m[1];
    if (!APP_PAGES.some(function (p) { return arg.indexOf(p + '.html') >= 0; })) continue;
    /* 이름이 붙었나 — 둘째 인자가 있고 그것이 '_blank' 가 아니면 붙은 것이다 */
    const 이름있나 = /,\s*[A-Za-z_$][\w$]*\s*\)/.test(arg)          // , MAIL_WIN)
      || /,\s*['"](?!_blank)[^'"]+['"]/.test(arg);                  // , 'puMailWrite'
    if (이름있나) continue;
    out.push(arg.replace(/\s+/g, ' ').slice(0, 110));
  }
  return out;
}

test('★★★ 앱끼리 창을 열 때 «이름 없이»(새 탭으로) 열지 않는다', () => {
  const 걸린것 = [];
  APP_FILES.forEach(function (f) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return;
    이름없이여는줄(fs.readFileSync(p, 'utf8')).forEach(function (l) {
      걸린것.push(f + ' : window.open(' + l);
    });
  });
  assert.deepEqual(걸린것, [],
    '★★★ 앱끼리 여는 창이 «이름 없이» 열립니다 — PuAppBar.goApp 을 쓰세요.\n'
    + '  이름이 없으면 누를 때마다 새 탭이라, 서류를 댓 개 훑으면 그만큼 탭이 쌓입니다\n'
    + '  (대표 지시 2026-09-08 「모든 창은 2개가 열리지 않고 하나만」).\n'
    + '  걸린 곳:\n   ' + 걸린것.join('\n   '));
});

test('★★ 이 검사에 «이빨»이 있다 — 이름 없이 여는 줄을 실제로 잡는다', () => {
  /* ⚠ 「지금은 걸린 것이 없다」만 보면, 판정이 통째로 헛돌아도 통과한다.
       그래서 «걸려야 하는 것»을 넣어 걸리는지 본다. */
  assert.deepEqual(이름없이여는줄("window.open('pu-cards.html?q=1', '_blank');").length, 1,
    '★★ 새 탭으로 여는 줄을 못 잡습니다 — 이 검사가 헛돕니다');
  assert.equal(이름없이여는줄("window.open('pu-cards.html?q=1');").length, 1,
    '★★ 둘째 인자가 아예 없는 것을 못 잡습니다 — 그것도 새 탭입니다');
  assert.equal(이름없이여는줄("window.open('pu-cards.html?q=1', MAIL_WIN);").length, 0,
    '★ 이름이 붙은 것을 걸고 있습니다 — 그것은 「하나만」을 이미 지킵니다');
  assert.equal(이름없이여는줄("window.open('', '_blank');").length, 0,
    '★ 인쇄용 빈 창을 걸고 있습니다 — 앱끼리 여는 창이 아닙니다');
  assert.equal(이름없이여는줄("window.open('https://www.google.com', '_blank');").length, 0,
    '★ 바깥 주소를 걸고 있습니다');
});

test('★★ 대표님이 짚으신 그 자리가 «실제로» 고쳐졌다 — 사진첩 → 기업정보함', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');
  const fn = stripComments(cutFn(src, 'function openFiledCard('));
  assert.ok(fn, 'openFiledCard 가 없습니다');
  assert.match(fn, /PuAppBar\.goApp\(/,
    '★★★ 「기업정보함에서 이 명함 보기」가 아직 새 탭을 엽니다 — 대표님이 짚으신 자리입니다');
  assert.ok(!/_blank/.test(fn), '★★★ _blank 가 남아 있습니다');
});

test('★ 앱마다 «창 이름을 따로 짓는» 상수를 안 만든다 — 그러면 두 창이 된다', () => {
  const 남은것 = [];
  APP_FILES.forEach(function (f) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return;
    const s = stripComments(fs.readFileSync(p, 'utf8'));
    /* 사진첩·기업정보함 같은 «우리 앱» 창에 이름을 따로 박아 두는 상수 */
    const m = s.match(/const\s+[A-Z_]*(?:DOC|CARD|PHOTO)[A-Z_]*_WIN\s*=/g);
    if (m) 남은것.push(f + ' : ' + m.join(', '));
  });
  assert.deepEqual(남은것, [],
    '★★ 앱이 창 이름을 따로 짓고 있습니다 — 공용 층이 주소에서 뽑게 맡기세요.\n   '
    + 남은것.join('\n   '));
});

/* ══════ 앱바 자신은 «같은 창»에서 옮긴다 — 「기존과 같이」 ══════════ */

test('★★ 앱바로 프로그램을 옮기면 «새 창을 안 띄운다» — 대표님이 「기존과 같이」라 하셨다', () => {
  const fn = stripComments(cutFn(BAR_RAW, 'function navTo('));
  assert.ok(fn, 'navTo 가 없습니다');
  assert.match(fn, /location\.href/, '★ 같은 창에서 옮기지 않습니다');
  assert.ok(!/window\.open|global\.open/.test(fn),
    '★★ 앱바가 새 창을 띄웁니다 — 「기존과 같이」가 무너집니다');
});

/* ══════ 판독 띠는 «한 줄»이다 (대표 지시 2026-09-08) ══════════════════
   「이부분 너무 쓸데없이 크게 나있다. 한줄로 정리」

   ⚠⚠ 내가 만든 자리다. 세 토막(제목·긴 설명·셈)을 다 넣고 접기를 켜 두었더니
     설명이 두 줄로 접히고, 셈이 제 줄을 차지하고, 밀려난 단추가 «화면 폭 전체»를
     먹는 파란 띠가 됐다 — 사진 한 줄이 안 보일 만큼. 저장소 규칙(「자리가 넓어도
     두 줄로 만들지 않는다」)을 내가 어긴 것이다. 그 자리를 기계로 못 박는다. */
const PHOTOS = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');

/* 꾸밈에서 그 칸의 규칙만 뽑는다 — 주석을 먼저 걷는다(저장소 규칙) */
function 꾸밈(sel) {
  const s = stripComments(PHOTOS);
  const i = s.indexOf(sel + '{');
  if (i < 0) return '';
  return s.slice(i, s.indexOf('}', i) + 1).replace(/\s+/g, ' ');
}

test('★★★ 판독 띠가 «접히지 않는다» — 접히면 단추가 밀려나 화면 폭을 먹는다', () => {
  const 띠 = 꾸밈('#readAskBar');
  assert.ok(띠, '판독 띠 꾸밈을 못 찾았습니다');
  assert.match(띠, /flex-wrap:\s*nowrap/,
    '★★★ 띠가 다시 접힙니다 — 설명이 두 줄이 되고 단추가 화면 폭 전체를 먹습니다\n'
    + '  (대표 지시 2026-09-08 「너무 쓸데없이 크게 나있다 · 한줄로 정리」)');
});

test('★★ 긴 설명은 «잘린다» — 자리가 넓어도 두 줄로 만들지 않는다', () => {
  const d = 꾸밈('#readAskBar .d');
  assert.ok(d, '설명 칸 꾸밈이 없습니다');
  assert.match(d, /white-space:\s*nowrap/, '★★ 설명이 두 줄로 접힙니다');
  assert.match(d, /text-overflow:\s*ellipsis/, '★ 넘치는 것을 … 로 자르지 않습니다');
  assert.match(d, /min-width:\s*0/,
    '★★ min-width:0 이 없으면 flex 칸이 «안 줄어들어» 단추를 밀어냅니다 — 그 한 줄이 핵심입니다');
});

test('★★ 셈이 «제 줄을 차지하지» 않는다 — 그것이 띠를 두 배로 만들었다', () => {
  const t = 꾸밈('#readAskBar .tly');
  assert.ok(t, '셈 꾸밈이 없습니다');
  assert.ok(!/flex:\s*1 1 100%/.test(t),
    '★★★ 셈이 줄 «전체»를 차지합니다 — 띠가 두 줄이 됩니다(그것을 고치라는 지시였습니다)');
  assert.match(t, /white-space:\s*nowrap/, '★ 셈이 접힙니다');
});

test('★★ 단추가 «줄어들지도 늘어나지도» 않는다 — 늘어나면 화면 폭을 먹는다', () => {
  const b = 꾸밈('#readAskBar button');
  assert.ok(b, '단추 꾸밈이 없습니다');
  assert.match(b, /flex:\s*0 0 auto/,
    '★★★ 단추가 늘어납니다 — 화면 폭을 먹는 파란 띠가 바로 그것이었습니다');
  assert.match(b, /white-space:\s*nowrap/, '★ 단추 글자가 접힙니다');
});

test('★★ 긴 까닭을 «title 로» 옮겼다 — 띠에 세워 두면 자리만 먹는다', () => {
  const fn = stripComments(cutFn(PHOTOS, 'function renderReadAsk('));
  assert.ok(fn, 'renderReadAsk 가 없습니다');
  /* 세 갈래(한도·기다림·보류) 모두 설명에 title 이 붙어야 한다 */
  const 설명칸 = fn.match(/<span class="d"[^>]*>/g) || [];
  assert.ok(설명칸.length >= 3, '설명 칸이 ' + 설명칸.length + '개뿐입니다(세 갈래여야 합니다)');
  설명칸.forEach(function (x) {
    assert.match(x, /title="/,
      '★★ 설명에 title 이 없습니다 — 잘린 글을 읽을 길이 없어집니다: ' + x);
  });
});

test('★ 띠에 남긴 말이 «지금 무슨 일인지»를 답한다 — 그 한 줄은 지운 것이 아니다', () => {
  const fn = stripComments(cutFn(PHOTOS, 'function renderReadAsk('));
  /* 이 저장소가 가장 여러 번 밟은 자리 — 「올렸는데 판독이 안 된다」 */
  assert.match(fn, /답할 때까지 판독에 안 갑니다/,
    '★★ 「지금 안 읽고 있다」를 띠에서 지웠습니다 — 짧게 만드느라 가장 중요한 말을 뺐습니다');
  assert.match(fn, /사진은 그대로 있습니다/,
    '★★ 한도에 걸린 사람이 가장 먼저 걱정하는 것(사진이 날아갔나)을 안 말합니다');
});
