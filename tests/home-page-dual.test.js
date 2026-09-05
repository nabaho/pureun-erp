'use strict';
/* 좌우 두 칸 — 왼쪽 홈페이지 화면, 오른쪽 고치는 칸 (대표 지시 2026-09-03 「듀얼화면 붙여라」)
 *   승인 목업: docs/mockups/home-page-dual.html
 *   대표 지적: 「설명하면 판단이 너무어렵다 … 한화면 보면서 직접 고치면된다」
 *
 * ★ 이 검사가 지키는 것 — 조용히 어긋나면 가장 나쁜 것들
 *   ① 왼쪽의 표와 오른쪽의 칸이 «같은 번호»로 짝지어진다
 *      (어긋나면 왼쪽을 눌렀는데 오른쪽의 «다른 줄»이 켜진다 — 그러고도 오류는 없다)
 *   ② 표를 다는 일이 글을 «안 바꾼다» (표가 홈페이지에 박히면 안 된다)
 *   ③ 왼쪽은 «틀(iframe)» 안이다 (홈페이지 꾸밈이 푸른토탈 화면으로 새면 안 된다)
 *   ④ 길을 «진짜 주소»로 돌린다 (안 돌리면 민무늬 맨 글이 된다)
 *   ⑤ 쪽의 «제 스크립트»는 안 넣는다 (슬라이드가 돌면 짝지은 글자가 움직인다)
 *
 * 실행: node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const ctx = { window: undefined, console: { warn() {}, log() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-parse.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-fill.js'), 'utf8'), ctx);
const F = ctx.PuHomeFill, P = ctx.PuHomeParse;
const 화면 = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

/* ══════ ① 표와 칸이 «같은 번호»로 짝지어진다 ══════ */

test('★★★ 왼쪽 표의 번호가 오른쪽 칸의 차례와 «똑같다»', () => {
  /* 어긋나면 왼쪽을 눌렀을 때 «다른 줄»이 켜지고, 고치면 «엉뚱한 자리»가 바뀐다.
     오류는 하나도 안 난다 — 그래서 여기를 검사가 잡아야 한다. */
  const body = '<p>가나다</p><div><b>같은 줄</b></div><p>같은 줄</p><p>라마바</p>';
  const runs = F.fixableRuns(body);
  const 표달린것 = F.markRuns(body);
  const 표 = [...표달린것.matchAll(/<span class="pu-run" data-i="(\d+)">([\s\S]*?)<\/span>/g)];
  assert.equal(표.length, runs.length,
    '★★★ 표의 수(' + 표.length + ')와 칸의 수(' + runs.length + ')가 다르다');
  표.forEach((m, k) => {
    assert.equal(Number(m[1]), k, '★★★ 번호가 차례와 어긋났다: ' + m[1] + ' ≠ ' + k);
    assert.equal(m[2].trim(), runs[k].text,
      '★★★ ' + k + '번 표의 글이 그 칸의 글과 다르다: 「' + m[2].trim()
      + '」 ≠ 「' + runs[k].text + '」');
  });
});

test('★★ 똑같은 줄이 여럿이어도 «자리마다» 다른 번호를 받는다', () => {
  const body = '<p>천안본사</p><p>서산지사</p><p>천안본사</p>';
  const 표 = [...F.markRuns(body).matchAll(/data-i="(\d+)">([^<]*)</g)];
  const 본사 = 표.filter(m => m[2].trim() === '천안본사').map(m => m[1]);
  assert.equal(본사.length, 2, '★ 두 자리를 다 못 찾았다');
  assert.notEqual(본사[0], 본사[1],
    '★★ 두 자리가 같은 번호다 — 하나를 고치면 둘 다 켜진다');
});

/* ══════ ② 표는 글을 «안 바꾼다» ══════ */

test('★★★ 표를 달아도 «글자»는 한 자도 안 바뀐다 — 표가 홈페이지에 박히면 안 된다', () => {
  const body = '<p>  가나다  </p><div class="x">라마 &amp; 바사</div>';
  const 표달린것 = F.markRuns(body);
  /* 표를 걷어내면 원본과 «똑같아야» 한다 */
  const 걷은것 = 표달린것.replace(/<span class="pu-run" data-i="\d+">/g, '').replace(/<\/span>/g, '');
  assert.equal(걷은것, body, '★★★ 표를 걷었는데 원본과 다르다 — 글을 건드렸다');
  /* 앞뒤 빈칸은 표 «밖»에 남아야 한다 — 안에 넣으면 고칠 때 빈칸까지 지워진다 */
  assert.match(표달린것, /<p>  <span class="pu-run" data-i="0">가나다<\/span>  <\/p>/,
    '★★ 앞뒤 빈칸을 표 안에 넣었다: ' + 표달린것);
});

test('★★ 채우는 길은 «표 없는» 글을 쓴다 — 표가 홈페이지로 나가지 않는다', () => {
  /* markRuns 는 «보여 주기용»이다. 채우는 것은 applyLineEdits 하나뿐이어야 한다. */
  const body = '<p>가나다</p>';
  const out = F.applyLineEdits(body, [{ before: '가나다', after: '라마바' }]);
  assert.ok(out.html.indexOf('pu-run') < 0,
    '★★★ 홈페이지에 채울 글에 표가 섞였다: ' + out.html);
  assert.equal(out.html, '<p>라마바</p>');
});

/* ══════ ③④⑤ 왼쪽 화면을 짓는 규칙 ══════ */

function 틀짓기() {
  /* pageFrameDoc 을 화면에서 꺼내 «실제로» 돌린다 */
  const i = 화면.search(/\nfunction pageFrameDoc\(/);
  assert.ok(i > 0, '★★ pageFrameDoc 을 못 찾았다 — 왼쪽 화면을 짓는 자리가 없다');
  let j = 화면.indexOf('\nfunction ', i + 5);
  const src = 화면.slice(i, j < 0 ? 화면.length : j);
  const 상 = {
    App: { pageHtml: { work1: 쪽본 } },
    PuHomeExport: { ORIGIN: 'https://example.kr' },
    PuHomeFill: F, PuHomeParse: P,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    console: { warn() {} }
  };
  vm.createContext(상);
  vm.runInContext(src + '\n_out = pageFrameDoc("work1");', 상);
  return 상._out;
}

/* 실물과 같은 결의 쪽 하나 — 본문 표시(bh_page_widget_inner)와 발치가 있다 */
const 쪽본 = '<html><head>'
  + '<link rel="stylesheet" href="../files/a.css">'
  + '<style>.x{color:red}</style>'
  + '<script src="../files/b.js"></script>'
  + '</head><body><header>머리띠 글</header>'
  + '<div class="bh_page_widget_inner"><p>본문 가나다</p>'
  + '<script>var 나쁜것=1;</script>'
  + '<p>본문 라마바</p></div>'
  + '<footer>발치 글</footer></body></html>';

test('★★★ 왼쪽 화면에 «꾸밈»이 붙는다 — 안 붙으면 민무늬 맨 글이 된다', () => {
  const doc = 틀짓기();
  assert.ok(doc.indexOf('rel="stylesheet"') > 0, '★★★ 꾸밈(css)을 안 가져왔다');
  assert.ok(doc.indexOf('.x{color:red}') > 0, '★★ 쪽 안에 적힌 꾸밈을 안 가져왔다');
});

test('★★★ 길을 «진짜 주소»로 돌린다 — ../files 가 아무 데도 안 붙는다', () => {
  const doc = 틀짓기();
  const m = /<base href="([^"]+)"/.exec(doc);
  assert.ok(m, '★★★ 밑주소(base)가 없다 — 꾸밈도 사진도 하나도 안 붙는다');
  assert.equal(m[1], 'https://example.kr/work1/',
    '★★ 밑주소가 그 쪽을 안 가리킨다: ' + m[1]);
});

test('★★★ 쪽의 «제 스크립트»는 안 넣는다 — 돌면 짝지은 글자가 움직인다', () => {
  const doc = 틀짓기();
  assert.ok(doc.indexOf('나쁜것') < 0, '★★★ 본문 안 스크립트가 딸려 들어갔다');
  assert.ok(doc.indexOf('files/b.js') < 0, '★★★ 머리의 스크립트가 딸려 들어갔다');
});

test('★★ 왼쪽에는 «고칠 수 있는 자리»만 넣는다 — 못 고치는 글을 보여 주지 않는다', () => {
  const doc = 틀짓기();
  assert.ok(doc.indexOf('본문 가나다') > 0, '★★ 본문을 안 넣었다');
  assert.ok(doc.indexOf('머리띠 글') < 0,
    '★★ 머리띠를 넣었다 — 여기서 못 고치는 글이라 「왜 안 눌리지」가 된다');
  assert.ok(doc.indexOf('발치 글') < 0, '★★ 발치를 넣었다');
  /* 넣은 본문에는 표가 달려 있어야 한다 */
  assert.match(doc, /class="pu-run" data-i="0"/, '★★★ 왼쪽에 표가 안 달렸다');
});

/* ══════ ⑥ 화면이 두 칸을 실제로 그린다 ══════ */

test('★★ 왼쪽은 «틀(iframe)» 안이다 — 홈페이지 꾸밈이 이 화면으로 새면 안 된다', () => {
  /* ⚠ 창을 넉넉히 잡는다 — 4,000자로 잘랐더니 줄을 그리는 자리까지 못 가서
     고쳐 놓고도 「짝 번호를 안 달았다」로 빨간불이 났다. */
  const i = 화면.indexOf('function pageLinesHtml');
  const j = 화면.indexOf('\nfunction ', i + 5);
  const s = 화면.slice(i, j < 0 ? i + 9000 : j);
  assert.match(s, /<iframe id="pgFrame"/, '★★★ 왼쪽 화면을 틀에 안 넣었다');
  assert.match(s, /srcdoc="/, '★ 틀에 내용을 안 넣었다');
  assert.match(s, /sandbox="/,
    '★★ 틀에 울타리(sandbox)가 없다 — 남의 쪽이 이 화면을 휘저을 수 있다');
  assert.match(s, /class="dual/, '★ 두 칸 그릇이 없다');
});

test('★★ 오른쪽 칸과 왼쪽 표를 «같은 번호»로 잇는다', () => {
  /* ⚠ 창을 넉넉히 잡는다 — 4,000자로 잘랐더니 줄을 그리는 자리까지 못 가서
     고쳐 놓고도 「짝 번호를 안 달았다」로 빨간불이 났다. */
  const i = 화면.indexOf('function pageLinesHtml');
  const j = 화면.indexOf('\nfunction ', i + 5);
  const s = 화면.slice(i, j < 0 ? i + 9000 : j);
  /* ⚠ 「어디든 data-i 가 있나」로 보면 안 된다 — 줄(div)에만 있어도 통과한다.
     정작 손이 가는 것은 «칸(input)»이다. 칸에서 떼어 봐도 검사가 통과했다(되돌림으로 잡았다). */
  assert.match(s, /<input class="t"[\s\S]{0,140}?data-i="' \+ i \+ '"/,
    '★★★ 오른쪽 «칸»에 짝 번호를 안 달았다 — 왼쪽을 눌러도 그 칸을 못 찾는다');
  assert.match(s, /onfocus="pageRunFocus\(' \+ i \+ '\)"|onfocus="pageRunFocus\(/,
    '★★ 칸에 들어가도 왼쪽이 안 켜진다');
  assert.match(s, /,this\.value,' \+ i \+ '\)/,
    '★★★ 고칠 때 짝 번호를 안 넘긴다 — 왼쪽이 무엇을 바꿔야 할지 모른다');
  assert.match(화면, /function pageRunFocus\(/, '★★ 켜는 부품이 없다');

  /* 고치면 왼쪽이 함께 바뀌는가 — 그것이 「보면서 고친다」의 핵심이다.
     ⚠ 창을 «그 함수 안»으로 묶는다 — 넉넉히 자르면 다음 함수의 글자가 걸려
       고쳐 놓고도 통과한다(되돌림으로 잡았다). */
  const k = 화면.indexOf('function pageRunEdit');
  const k2 = 화면.indexOf('\nfunction ', k + 5);
  const e = 화면.slice(k, k2 < 0 ? 화면.length : k2);
  assert.match(e, /pu-run\[data-i=/, '★★★ 고쳐도 왼쪽 화면이 안 바뀐다');
  /* ⚠ 「.textContent = 가 있나」로 보면 안 된다 — 같은 함수 안에서 단추 이름도
     그렇게 바꾼다. 그 줄만 남겨 두면 왼쪽이 안 바뀌는데도 통과한다(되돌림으로 잡았다).
     «왼쪽에서 찾아 둔 그 표»에 글을 넣는지 콕 집어 본다. */
  assert.match(e, /\bm\.textContent\s*=/,
    '★★★ 왼쪽 표의 글자를 안 갈아 끼운다 — 보면서 고치는 뜻이 사라진다');
  assert.match(e, /\bm\.classList\.toggle\(['"]pu-ch['"]/,
    '★★ 고친 자리에 표시가 안 남는다 — 무엇을 건드렸는지 왼쪽에서 알 수 없다');
});
