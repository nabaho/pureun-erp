/* 상세 패널을 열면 화면이 굳던 것 + 「가진 것」 한 줄 (대표 보고 2026-08-27)
   "가진것을 2중으로 할 필요는 없어보인다. 한줄로 만들 수 없나?
    기업상세 갑자기 화면 멈췄다 확인해달라. 아래 데이터보게 안내려간다."

   ★ 굳은 까닭 — 상세 패널의 «투명한 덮개»가 화면 전체를 덮고 있었다.
     휠은 커서 아래 «보이는» 것이 아니라 «맞은 칸»의 조상만 굴린다. 덮개는 안 구르므로
     아무 일도 안 일어난다. 패널이 창 오른쪽 끝에 열려 눈에 안 띄면 까닭 없이 굳은 것으로
     보인다(대표 창이 화면 왼쪽으로 조금 넘어가 있어 패널이 안 보였다).
     실제로 재 봤다: pointer-events 를 되돌리면 목록 한가운데에서 «덮개가 잡힌다».
   ★ 고친 길 — 덮개는 아무것도 막지 않게(pointer-events:none) 두고,
     바깥 누르기는 문서 전체에 걸린 손잡이가 «듣기만» 한다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}

/* ── 덮개가 아무것도 막지 않는다 ── */

test('★ 덮개가 마우스를 «안» 잡는다 — 이것이 화면을 굳게 했다', () => {
  const at = HTML.indexOf('<div id="pcDetailOverlay"');
  assert.ok(at > 0, '덮개를 못 찾았다');
  const tag = HTML.slice(at, HTML.indexOf('>', at) + 1);
  assert.match(tag, /pointer-events:none/, '덮개가 커서를 잡으면 휠이 막힌다');
});

test('★ 덮개에 onclick 을 걸지 않는다 — 걸면 커서를 잡아야 한다', () => {
  const at = HTML.indexOf('<div id="pcDetailOverlay"');
  const tag = HTML.slice(at, HTML.indexOf('>', at) + 1);
  assert.ok(tag.indexOf('onclick') < 0,
    'onclick 을 걸면 pointer-events 를 살려야 하고, 그러면 휠이 다시 막힌다');
});

test('덮개는 여전히 있다 — 모양(z-index·자리)은 건드리지 않았다', () => {
  const at = HTML.indexOf('<div id="pcDetailOverlay"');
  const tag = HTML.slice(at, HTML.indexOf('>', at) + 1);
  assert.match(tag, /position:fixed/);
  assert.match(tag, /z-index:9/);
});

/* ── 바깥 누르기는 «듣기만» 한다 ── */

function outsideBody(){ return slice('function coOutsideDown(e){', 'document.addEventListener'); }

test('★ 바깥 누르기 손잡이가 아무것도 막지 않는다 — 막으면 줄 누르기·끌기가 죽는다', () => {
  assert.ok(!/preventDefault|stopPropagation|stopImmediate/.test(outsideBody()),
    '막으면 줄을 눌러도 아무 일이 안 일어난다');
});

test('패널 «안»을 누르면 안 닫는다 — 패널 단추가 죽는다', () => {
  assert.match(outsideBody(), /p\.contains\(e\.target\)\) return;/);
});

test('★ 패널이 안 열려 있으면 아무 일도 안 한다 — 손잡이가 늘 달려 있으니 이것이 유일한 문지기다', () => {
  assert.match(outsideBody(), /classList\.contains\('open'\)\) return;/);
});

/* ★ 켜고 끄기를 없앤 까닭
   처음에는 열 때 걸고 닫을 때 떼는 coOutsideOn(on) 을 두었다. 두 가지가 나빴다 —
   ① 떼기를 한 군데서 빠뜨리면 닫힌 뒤에도 계속 듣는다(패널이 둘이라 자리가 둘이었다)
   ② 여는 함수를 떠서 돌리는 검사 다섯이 모두 «대역»을 넣어야 했고, 대역을 넣은 검사는
      그 자리를 더 이상 못 본다.
   한 번만 달고 위 문지기에게 맡기면 둘 다 사라진다. */

test('★ 손잡이를 «한 번만» 단다 — 열 때마다 달면 겹쳐 쌓인다', () => {
  assert.strictEqual(HTML.split("addEventListener('mousedown', coOutsideDown").length - 1, 1,
    '두 번 달면 한 번 누를 때 두 번 닫는다');
});

test('★ 켜고 끄는 손잡이가 남아 있지 않다 — 떼기를 빠뜨릴 자리를 없앴다', () => {
  assert.ok(HTML.indexOf('coOutsideOn') < 0,
    '켜고 끄기가 되살아나면 떼기를 빠뜨리는 길이 다시 열린다');
});

test('capture 로 듣는다 — 줄의 onclick 보다 먼저 닫아야 다른 회사로 바로 넘어간다', () => {
  assert.match(HTML, /addEventListener\('mousedown', coOutsideDown, true\)/);
});

/* ── 「가진 것」 한 줄 ── */

test('★ 「가진 것」이 한 줄이다 — 두 줄이면 한 화면에 보이는 회사가 절반이 된다', () => {
  assert.match(HTML, /\.corow \.bits\{[^}]*flex-wrap:nowrap/,
    'wrap 이면 딱지 셋이 두 줄로 접힌다');
  assert.match(HTML, /\.corow \.bits\{[^}]*overflow:hidden/, '넘치면 자른다');
});

test('딱지 하나하나는 안 접힌다', () => {
  assert.match(HTML, /\.corow \.bits i\{[^}]*white-space:nowrap/);
});

test('빠진 것 딱지만 줄어든다 — 개수 딱지는 온전히 보여야 한다', () => {
  assert.match(HTML, /\.corow \.bits i\{[^}]*flex:0 0 auto/, '개수는 안 줄어든다');
  assert.match(HTML, /\.corow \.bits i\.miss\{[^}]*flex:0 1 auto/, '빠진 것은 줄어든다');
  assert.match(HTML, /\.corow \.bits i\.miss\{[^}]*text-overflow:ellipsis/, '말줄임으로');
});

/* ★ 도우미를 안 두는 까닭
   처음에는 coBitsText(o, care) 를 따로 두었다. coListHtml 을 떠서 돌리는 검사 다섯이
   모두 대역을 넣어야 했고, 대역을 넣은 검사는 «화면과 같은 값인지»를 더 이상 못 본다.
   줄을 그리는 자리에서 한 값으로 만들면 두 벌이 될 자리가 아예 없다. */

const bitsDecl = () => slice('const missTxt =', 'return `');
const bitsTd = () => slice('<td class="bits"', '</td>');

test('★ 자른 것은 말풍선에 온전히 남는다 — 자른 채 아무 말이 없으면 알 길이 없다', () => {
  assert.match(bitsTd(), /title="\$\{esc\(bitsAll\)\}"/);
});

test('★ 말풍선과 딱지가 «한 값»에서 나온다 — 두 벌이면 한쪽만 고쳐진다', () => {
  assert.match(bitsDecl(), /coMissing\(o\)/, '빠진 것은 화면과 같은 함수로 센다');
  assert.match(bitsDecl(), /care \? missTxt : ''/, '말풍선도 같은 missTxt 를 쓴다');
  assert.match(bitsTd(), /missTxt \? miss\(missTxt\)/, '딱지도 같은 missTxt 를 쓴다');
});

test('말풍선에 명함·등록증·빠진 것이 다 담긴다', () => {
  const d = bitsDecl();
  assert.match(d, /'명함 ' \+ o\.cards\.length/, '명함 수');
  assert.match(d, /'등록증 ' \+ o\.docs/, '등록증 수');
  /* 우리가 일하는 회사가 아니면 붉게 안 짚는다 — 화면 규칙과 같아야 한다 */
  assert.match(d, /care \? '등록증 없음' : ''/, '등록증 없음도 care 안에서만');
});

test('표 폭이 늘지 않았다 — 「가진 것」을 넓힌 만큼 상호에서 덜어 왔다', () => {
  const co = slice('return `${coOrphanBarHtml()}<table class="cotbl">', '<thead><tr>');
  const w = (co.match(/width:(\d+)px/g) || []).map(x => Number(x.match(/\d+/)[0]));
  assert.strictEqual(w.reduce((a, b) => a + b, 0), 868,
    '칸 폭 합이 달라졌다 — 넓히면 좌우로 넘친다: ' + w.join('+'));
  assert.ok(co.indexOf('width:215px') > 0, '「가진 것」이 215px 여야 한다');
  assert.ok(co.indexOf('width:255px') > 0, '상호가 255px 여야 한다');
});
