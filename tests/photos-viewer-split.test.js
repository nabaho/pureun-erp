/* 크게 보기 — 가운데 손잡이로 좌우 폭 바꾸기 + 단추를 한 줄에
   대표 지시(2026-08-13): "중간에 창을 마우스로 좌우 조절 할 수 있게 해달라.
   캡쳐2 한 줄에 모든 셀 넣어달라."

   ⚠ 여기서 가장 위험한 것은 **판이나 사진이 사라지는 폭**이다. 끝까지 끌어
     한쪽이 0 이 되면 되돌릴 길이 화면에 없다(손잡이도 같이 사라진다). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
/* 색은 «값»이 아니라 «뜻»으로 본다 — 팔레트를 정리해도 안 깨지게 */
const P = require('./lib-palette.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const m = app.match(new RegExp('^(?:async )?function ' + name + '\\([\\s\\S]*?\\r?\\n\\}', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0];
}

/* splitStart 를 실제로 돌린다 — 마우스를 끌어 보고 어떤 폭이 나오는지 본다 */
function dragTo(x, boxLeft, boxWidth) {
  const moves = [];
  const saved = [];
  const el = {
    style: {},
    innerHTML: '<div class="box">x</div>',
    classList: { toggle: function () {}, remove: function () {}, add: function () {} }
  };
  const viewer = { classList: { add: function () {}, remove: function () {} } };
  const body = { getBoundingClientRect: function () { return { left: boxLeft, width: boxWidth }; } };
  const sp = { style: {} };
  const ctx = {
    Number, Math, String,
    splitW: 0, SPLIT_MIN: 260, SPLIT_KEEP: 320, SPLIT_LS: 'k',
    localStorage: { setItem: function (k, v) { saved.push(v); }, removeItem: function () {} },
    document: {
      addEventListener: function (t, fn) { moves.push([t, fn]); },
      removeEventListener: function () {}
    },
    toast: function () {},
    $: function (id) {
      return id === 'readPanel' ? el : id === 'viewer' ? viewer
        : id === 'viewerBody' ? body : id === 'viewerSplit' ? sp : null;
    },
    _el: el, _saved: saved
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf('applySplit') + '\n' + fnOf('splitStart') + '\n' + fnOf('splitReset'), ctx);
  ctx.splitStart({ preventDefault: function () {} });
  const move = moves.find(function (m) { return m[0] === 'mousemove'; })[1];
  const up = moves.find(function (m) { return m[0] === 'mouseup'; })[1];
  move({ clientX: x });
  up();
  return ctx;
}

test('★ 끈 자리만큼 판이 넓어진다', () => {
  const c = dragTo(700, 100, 1400);   // 왼쪽 끝에서 600px
  assert.equal(c.splitW, 600);
  assert.equal(c._el.style.flex, '0 0 600px', '실제 폭이 안 입혀졌습니다');
});

test('★ 판을 없앨 만큼 좁히지 못한다 — 되돌릴 길이 사라진다', () => {
  const c = dragTo(120, 100, 1400);   // 20px 까지 끌었다
  assert.equal(c.splitW, 260, '★ 판이 사라지면 손잡이도 함께 사라져 못 되돌립니다');
});

test('★ 사진을 없앨 만큼 넓히지 못한다 — 대조할 원본이 사라진다', () => {
  const c = dragTo(1500, 100, 1400);  // 오른쪽 끝까지
  assert.equal(c.splitW, 1400 - 320, '사진 쪽에 320px 은 남겨야 합니다');
});

test('창이 아주 좁아도 판은 남긴다', () => {
  /* 폭이 400px 뿐이면 「사진 320 을 남긴다」와 「판 260 을 준다」가 부딪힌다.
     그때는 판을 살린다 — 판이 0 이 되면 손잡이가 사라져 되돌릴 수 없다. */
  const c = dragTo(1000, 0, 400);
  assert.equal(c.splitW, 260);
});

test('★ 놓았을 때 기억한다 — 서류를 넘길 때마다 되돌아가면 끈 뜻이 없다', () => {
  const c = dragTo(700, 100, 1400);
  assert.deepEqual(c._saved, ['600'], '★ 안 적으면 다음 서류에서 도로 440px 입니다');
});

test('★ 사람이 정한 폭이 「절반(wide)」보다 우선한다', () => {
  /* 근태표를 열 때마다 내가 끌어 놓은 폭이 절반으로 튕기면 안 된다 */
  const fn = fnOf('renderReadPanel');
  assert.match(fn, /el\.classList\.toggle\('wide'[\s\S]{0,80}applySplit\(\);/,
    'wide 를 켠 뒤에 폭을 다시 입혀야 이깁니다');
  assert.match(fnOf('applySplit'), /if \(splitW > 0\) el\.style\.flex = '0 0 ' \+ splitW \+ 'px';/);
  assert.match(fnOf('applySplit'), /else el\.style\.flex = '';/,
    '안 정했으면 CSS(440px·절반)가 정한 대로여야 합니다');
});

test('★ 두 번 누르면 원래대로 — 되돌릴 길이 있어야 한다', () => {
  const c = dragTo(700, 100, 1400);
  c.splitReset();
  assert.equal(c.splitW, 0);
  assert.equal(c._el.style.flex, '', '★ 못 되돌리면 잘못 끈 폭에 갇힙니다');
  assert.match(app, /ondblclick="splitReset\(\)"/);
});

test('★ 판이 비면 손잡이도 감춘다 — 끌 것 없는 막대가 남으면 안 된다', () => {
  const c = dragTo(700, 100, 1400);
  assert.equal(c.$('viewerSplit').style.display, '');
  c._el.innerHTML = '';
  c.applySplit();
  assert.equal(c.$('viewerSplit').style.display, 'none');
});

test('★ 손잡이가 사진과 판 사이에 있다', () => {
  /* 판은 order:-1 로 왼쪽에 선다 — 손잡이가 판보다 **앞**에 있어야 그 사이에 놓인다 */
  const at = app.indexOf('id="viewerSplit"');
  assert.ok(at > 0, '손잡이가 없습니다');
  assert.ok(at > app.indexOf('id="viewerPic"'), '사진보다 앞에 있습니다');
  assert.ok(at < app.indexOf('id="readPanel"'), '★ 판보다 뒤에 있으면 바깥쪽 끝에 붙습니다');
  assert.match(app, /onmousedown="splitStart\(event\)"/);
  assert.match(app, /#viewerSplit\{[^}]*cursor:col-resize/, '끌 수 있다는 표시가 없습니다');
});

test('★ 폰에서는 손잡이가 없다 — 위아래로 쌓인 것은 좌우로 못 끈다', () => {
  assert.match(app, /@media \(max-width:899px\)\{ #viewerSplit\{display:none\} \}/);
});

test('끄는 동안 글자가 잡히지 않는다', () => {
  /* 잡히면 커서가 글자 선택으로 바뀌어 손잡이를 놓친다 */
  assert.match(app, /#viewer\.splitting\{user-select:none\}/);
  assert.match(fnOf('splitStart'), /classList\.add\('splitting'\)/);
  assert.match(fnOf('splitStart'), /classList\.remove\('splitting'\)/);
  // 놓으면 반드시 떼어 낸다 — 안 떼면 마우스를 움직일 때마다 폭이 계속 바뀐다
  const fn = fnOf('splitStart');
  assert.match(fn, /removeEventListener\('mousemove', move\)/);
  assert.match(fn, /removeEventListener\('mouseup', up\)/);
});

/* ── 단추를 한 줄에 ── */

test('★ 단추가 한 줄에 모두 들어간다', () => {
  assert.match(app, /#readPanel \.acts\{position:sticky;top:0;z-index:3;display:flex/,
    '★ 두 칸 격자면 공유·지우기가 한 줄씩 차지해 석 줄이 됩니다');
  assert.match(app, /#readPanel \.acts button\{flex:0 0 auto;/,
    '단추는 제 글 만큼만 차지해야 한 줄에 다 들어갑니다');
  /* ⚠ 2026-08-29 대표 지시로 도구줄이 **아이콘만**이 되었다("글자가 아니라 아이콘으로
     확인할 수 있게"). 예전에는 글이 긴 「다시 판독」이 남은 자리를 갖고 줄어들다가
     좁은 판에서 잘려 무엇인지 알 수 없었다. 이제 한 글자라 자리를 다투지 않는다.
     (실측: 단추 27~36px, 가장 붐비는 7개에 256px 로 260px 판에 들어간다) */
  assert.match(app, /#readPanel \.acts \.rd\{flex:0 0 auto\}/,
    '★ 아이콘 하나가 남은 자리를 다 먹으면 줄이 이상해집니다');
  assert.ok(!/#readPanel \.acts \.wide\{grid-column/.test(app),
    '한 줄 통으로 쓰던 규칙이 남아 있습니다');
});

test('★ 도구줄이 판 맨 위에 붙박여 있다 — 표가 길어도 늘 보인다', () => {
  /* 대표 지시 2026-08-13: "상단에 틀고정". 근태표·서식은 표가 길어
     아래에 두면 끝까지 스크롤해야 단추가 나왔다. */
  assert.match(app, /#readPanel \.acts\{position:sticky;top:0/);
  assert.match(app, /#readPanel \.acts\{[^}]*background:#fff/,
    '★ 배경이 비치면 아래 표 글자가 단추 뒤로 지나갑니다');
  const fn = fnOf('renderReadPanel');
  /* 판을 그리는 두 갈래(판독 전·후) 모두에서 **맨 위**여야 한다 */
  const a = fn.indexOf("actsRow('글자 판독하기'");
  const b = fn.indexOf("actsRow('다시 판독'");
  assert.ok(a > 0 && b > 0, '두 갈래에 모두 있어야 합니다');
  assert.ok(a < fn.indexOf('whenBox(it)'), '★ 판독 전 화면에서 도구줄이 아래에 있습니다');
  assert.ok(b < fn.indexOf("'<table>' + rows"), '★ 표보다 뒤에 있으면 스크롤해야 나옵니다');
});

test('★ 쪽 넘기기도 같은 줄에 들어간다', () => {
  const fn = fnOf('actsRow');
  assert.match(fn, /docNavBtns\(\)/, '쪽 넘기기가 딴 줄이면 한 줄이 아닙니다');
  const nav = fnOf('docNavBtns');
  assert.match(nav, /if \(pages\.length < 2\) return '';/,
    '홑장에 「1/1쪽」과 눌리지 않는 화살표를 두면 자리만 먹습니다');
  assert.match(nav, /class="pg"/);
  assert.match(nav, /class="pgn"/);
  // 본문 쪽 안내는 단추 없이 말만 한다(같은 일을 두 번 하지 않는다)
  assert.ok(!/openViewer/.test(fnOf('docNav')), '★ 쪽 넘기기 단추가 두 곳에 생겼습니다');
});

test('★ 「지우기」는 맨 끝에, 틈을 두고 놓는다', () => {
  /* 되돌릴 수 없는 단추다 — 한 줄에 붙어도 옆 단추와 손가락 거리를 준다 */
  const fn = fnOf('actsRow');
  const del = fn.indexOf('deleteOne()');
  ['downloadOne(viewerId)', 'readAgain()'].forEach(function (other) {
    assert.ok(fn.indexOf(other) < del, '★ 「' + other + '」보다 뒤에 있어야 합니다');
  });
  assert.match(app, /#readPanel \.acts \.rm\{[^}]*margin-left:5px/,
    '★ 틈이 없으면 「다시 판독」을 누르려다 지웁니다');
  /* ⚠ 색값을 박지 않는다 — 규칙은 「빨간 계열로 갈라지는가」다 */
  const rm = app.match(/#readPanel \.acts \.rm\{border-color:(#[0-9a-fA-F]{3,8});color:(#[0-9a-fA-F]{3,8})/);
  assert.ok(rm, '★ 지우기 단추의 색 규칙이 없어졌습니다');
  assert.ok(P.isRed(rm[1]) && P.isRed(rm[2]),
    '★ 빨강으로 안 갈라집니다: 테두리 ' + rm[1] + ' 글자 ' + rm[2]);
});

test('★ 아이콘만 남아도 무슨 단추인지 알 수 있다', () => {
  /* 한 줄에 다 넣으려면 아이콘만 남는다 — title 이 없으면 무슨 단추인지 모른다 */
  const fn = fnOf('actsRow');
  assert.match(fn, /title="내려받기"/);
  assert.match(fn, /title="공유·사진앱에 저장"/);
  assert.match(fn, /title="확인했음 — 할 일에서 치우기"/);
  /* 「지우기」→「삭제」 (대표 지시 2026-08-17) — 지킬 것은 «무슨 단추인지 알 수
     있는가»이지 낱말 하나가 아니다. tests/photos-need-bulk-ack.test.js 가 이름을 못박는다. */
  assert.match(fn, /title="이 사진 삭제"/);
  /* ⚠ 2026-08-29 부터 **모든** 단추가 아이콘이다 — 판독·가리고 판독·사진 편집까지.
     그래서 title 이 없는 단추가 하나라도 있으면 눌러 보기 전엔 알 수가 없다.
     자세한 것은 tests/photos-acts-icons.test.js. */
  assert.match(fn, /title="' \+ esc\(readBtn\) \+ ' — /, '★ 판독 단추의 설명이 없습니다');
  assert.match(fn, /title="🔒 가리고 판독 — /);
  assert.match(fn, /title="🖍 사진 편집 — /);
});

test('단추 글도 이스케이프한다 — 밖에서 온 말이 화면을 뚫지 않게', () => {
  /* readBtn 은 이제 title 에만 나간다(단추 안은 아이콘이다). 그 한 곳을 안 거르면
     거기로 뚫린다. 「두 곳 다」였던 시절의 검사를 지금 자리에 맞춰 다시 겨눴다. */
  const fn = fnOf('actsRow');
  assert.match(fn, /title="' \+ esc\(readBtn\) \+ '/, '★ 걸러야 할 한 곳을 안 거릅니다');
  assert.ok(fn.indexOf('+ readBtn +') < 0, '★ 안 거른 채로 나가는 자리가 있습니다');
});
