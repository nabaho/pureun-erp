/* 메일함 설정을 «두 칸»으로 편다 (대표 지시 2026-08-31 · 목업 ㉮ 승인)
   "환경설정 정렬 좀 해라. 아래로 길게 내려오는 판단 어렵다"

   ★ 까닭 — .msec 에 max-width:820px 가 박혀 있어, 두 배 넓은 화면에서도 오른쪽
     절반이 통째로 비고 다섯 갈래가 한 줄로만 쌓였다. 끝까지 내려야 무엇이 있는지 알았다.

   지키는 것.
   ① 다섯 갈래가 «한 격자» 안에 있다 — 하나라도 밖에 있으면 그 갈래만 따로 논다
   ② 갈래를 «숨기지 않는다» — 접기·탭으로 짧게 만들면 「무엇이 있더라」를 눌러 다녀야 한다
   ③ 창이 좁으면 «저절로 한 줄»로 돌아간다(auto-fit) — 못 박으면 폰에서 글자가 뭉갠다
   ④ 칸 폭이 왼쪽 이름표(150px)보다 넉넉하다 — 좁으면 값이 이름표 밑으로 접힌다
   ⑤ ⑤번 갈래는 넓게 눕는다 — 「열기 ↗」 한 줄짜리 여섯이라 좁은 칸에선 오히려 길어진다
   ⑥ 열고 닫은 <div> 짝이 맞는다 — 격자를 씌우다 하나 흘리면 화면이 통째로 어긋난다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const css = app.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 진짜로 그려 본다 */
function draw() {
  const ctx = {
    Object, String, Number, Array, JSON,
    MB_SIZES: [50, 100, 200, 500],
    MB_KEYS: [['C', '메일 쓰기'], ['Esc', '목록으로 돌아가기']],
    _mbCo: { 'a@b.c': 1 }, _mbNotCo: {}, _mbSeen: {},
    _mbProbe: null, _mbProbing: false,
    state: { isAdmin: true, mbSize: 100 },
    esc: s => String(s == null ? '' : s),
    matMailCfg: () => ({ from: '370-6@daum.net' }),
    mbBins: () => [], mbHidden: () => false,
    mbPreviewOn: () => false, mbPageSize: () => 100,
    mbNow: () => 'INBOX', mbProbeTell: () => '알아봅니다'
  };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function mailSetHtml('), ctx);
  return ctx.mailSetHtml();
}

const html = draw();

/* ══════ ①⑥ 얼개 ══════ */

test('★★ 다섯 갈래가 «한 격자» 안에 들어 있다', () => {
  const grids = (html.match(/class="msgrid"/g) || []).length;
  assert.equal(grids, 1, '격자가 ' + grids + '개입니다 — 하나여야 합니다');
  const i = html.indexOf('class="msgrid"');
  const secs = (html.match(/class="msec/g) || []).length;
  assert.ok(secs >= 5, '갈래가 ' + secs + '개뿐입니다');
  /* 격자가 «첫 갈래보다 앞»에 있어야 한다 — 뒤에 있으면 갈래들이 격자 밖이다 */
  assert.ok(i > 0 && i < html.indexOf('class="msec'),
    '격자가 갈래보다 뒤에 있습니다 — 갈래가 격자 밖으로 나가 한 줄로 쌓입니다');
});

test('★★ 열고 닫은 <div> 짝이 맞는다 — 하나만 흘려도 화면이 통째로 어긋난다', () => {
  const open = (html.match(/<div\b/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  assert.equal(open, close, '<div> ' + open + '개를 열고 ' + close + '개를 닫았습니다');
});

test('★★ ⑤번 갈래는 «넓게» 눕는다 — 「열기 ↗」 한 줄짜리 여섯이 좁은 칸에선 더 길어진다', () => {
  assert.match(html, /class="msec wide"/, '⑤번이 안 눕습니다');
  const m = css.match(/\.msec\.wide\{([^}]*)\}/);
  assert.ok(m, '넓게 눕히는 규칙이 없습니다');
  assert.match(m[1], /grid-column:\s*1\s*\/\s*-1/, '한 줄을 다 안 씁니다');
});

/* ══════ ②③④ 규칙 ══════ */

test('★★ 갈래를 «숨기지 않는다» — 접기·탭으로 짧게 만들면 눌러 다녀야 한다', () => {
  /* 다섯 갈래의 제목이 그려진 글 안에 «다» 있어야 한다 */
  ['① 보기', '② 보내기', '③ 푸른 분류', '④ 단축키', '⑤ 다음메일에서'].forEach(t =>
    assert.ok(html.indexOf(t) > 0, t + ' 갈래가 화면에 없습니다'));
  const m = css.match(/\.msec\{([^}]*)\}/);
  assert.ok(!/display:\s*none/.test(m[1]), '갈래를 숨기고 있습니다');
  /* ⚠ 규칙만 보면 안 된다 — 갈래 하나에 style="display:none" 을 붙이면 그대로 지나간다
       (이빨 확인 2026-08-31 에 실제로 지나갔다). «그려진 글»에서 숨김을 찾는다. */
  assert.ok(!/display:\s*none/.test(html), '갈래를 숨기고 있습니다: 그려진 글에 display:none 이 있습니다');
  assert.ok(!/\shidden(\s|=|>)/.test(html), '갈래를 hidden 으로 감췄습니다');
});

test('★★ 창이 좁으면 «저절로 한 줄»로 돌아간다 — 못 박으면 폰에서 글자가 뭉갠다', () => {
  const m = css.match(/\.msgrid\{([^}]*)\}/);
  assert.ok(m, '격자 규칙(.msgrid)이 없습니다');
  assert.match(m[1], /auto-fit/,
    '칸 수를 못 박았습니다 — 좁은 화면에서도 두 칸이라 글자가 뭉갭니다');
  assert.ok(!/repeat\(\s*2\s*,/.test(m[1]), '두 칸으로 못 박았습니다');
});

test('★★ 두 칸을 «넘지 않는다» — 안 묶으면 넓은 화면에서 석 줄·넉 줄까지 벌어진다', () => {
  /* ⚠ 실제로 그렇게 됐다(2026-08-31 그려 보고 잡음) — 대표님 화면 1,600px 남짓에
       390px 칸이면 넉 줄까지 벌어져 안내글이 잘게 접혔다. 「두 칸」이 약속이다. */
  const g = css.match(/\.msgrid\{([^}]*)\}/)[1];
  const cap = Number((g.match(/max-width:\s*(\d+)px/) || [])[1] || 0);
  assert.ok(cap > 0, '폭을 안 묶었습니다 — 넓은 화면에서 석 줄 넘게 벌어집니다');
  const min = Number(g.match(/minmax\(\s*(\d+)px/)[1]);
  assert.ok(cap < min * 3, '묶은 폭(' + cap + ')이 칸(' + min + ')의 세 배 이상이라 석 줄이 됩니다');
  assert.ok(cap >= min * 2, '묶은 폭(' + cap + ')이 좁아 두 칸이 안 됩니다');
});

test('★★ 칸이 왼쪽 이름표보다 넉넉하다 — 좁으면 값이 이름표 밑으로 접힌다', () => {
  const g = css.match(/\.msgrid\{([^}]*)\}/)[1];
  const mm = g.match(/minmax\(\s*(\d+)px/);
  assert.ok(mm, '칸의 가장 좁은 폭을 안 정했습니다');
  const lab = Number((css.match(/\.msrow \.mslab\{[^}]*width:\s*(\d+)px/) || [])[1] || 150);
  assert.ok(Number(mm[1]) >= lab * 2.4,
    '칸(' + mm[1] + 'px)이 이름표(' + lab + 'px)에 견주어 좁습니다 — 값이 두 줄로 접힙니다');
});

test('★★ 820px 대못을 뽑았다 — 그것이 오른쪽 절반을 비워 두던 까닭이다', () => {
  const m = css.match(/\.msec\{([^}]*)\}/);
  assert.ok(m, '.msec 규칙이 없습니다');
  assert.ok(!/max-width/.test(m[1]),
    '아직 폭이 못 박혀 있습니다 — 넓은 화면에서 오른쪽이 그대로 빕니다: ' + m[1]);
});

test('★ 갈래마다 테두리가 있다 — 어디까지가 한 갈래인지 눈에 들어와야 한다', () => {
  const m = css.match(/\.msec\{([^}]*)\}/)[1];
  assert.match(m, /border:/, '테두리가 없습니다 — 두 칸이 되면 갈래 경계가 사라집니다');
  assert.match(m, /border-radius:/, '모서리가 각져 옆 칸과 붙어 보입니다');
});

test('★ 카드 안 «마지막 줄»의 밑줄을 지운다 — 테두리와 겹쳐 두 줄로 보인다', () => {
  assert.match(css, /\.msec \.msrow:last-child\{[^}]*border-bottom:\s*none/,
    '마지막 줄 밑줄이 테두리와 겹칩니다');
});

/* ══════ 있던 것이 그대로 있나 ══════ */

test('★★ 옮기면서 «잃은 것이 없다» — 손잡이가 다 남아 있다', () => {
  ['mbSetPageSize', 'mbPreviewSet', 'openWhoPage', 'mbOldProbe', 'openMailPage',
   'mail.daum.net/setting/Imap'].forEach(k =>
    assert.ok(html.indexOf(k) > 0, k + ' 이(가) 사라졌습니다'));
  /* 다음메일로 가는 여섯 길 */
  const links = (html.match(/다음메일에서 열기/g) || []).length;
  assert.ok(links >= 6, '다음메일로 가는 길이 ' + links + '개뿐입니다');
});
