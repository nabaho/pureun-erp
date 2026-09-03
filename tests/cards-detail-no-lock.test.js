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
  /* ⚠ 2026-08-30 에 flex → grid 로 바꿨다(대표 지시 「가진것 열 정리하고 순서도 정리해라」).
     flex 로 «이어 붙이면» 앞엣것이 없는 줄은 뒤엣것이 당겨져 세로로 안 맞는다.
     여기서 볼 것은 «한 줄인가»이지 어느 배치 방식인가가 아니다 — 자리가 셋으로
     못 박혀 있으면(줄 수가 하나로 정해지면) 접힐 길이 없다. */
  const bits = HTML.match(/\.corow \.bits\{([^}]*)\}/);
  assert.ok(bits, '.corow .bits 규칙을 찾지 못했다');
  const cols = bits[1].match(/grid-template-columns:([^;]+)/);
  assert.ok(cols, '★ 자리를 못 박지 않았다 — 이어 붙이면 줄마다 어긋난다');
  assert.equal(cols[1].trim().split(/\s+/).length, 3,
    '★ 자리가 셋이 아니다 — 명함·등록증·빠진 것이 각자 제 자리에 서야 한다');
  assert.ok(!/grid-template-rows|wrap/.test(bits[1]),
    '★ 줄을 늘리면 한 화면에 보이는 회사가 절반이 된다');
});

test('딱지 하나하나는 안 접힌다', () => {
  assert.match(HTML, /\.corow \.bits i\{[^}]*white-space:nowrap/);
  assert.match(HTML, /\.corow \.bits>span\{[^}]*white-space:nowrap/,
    '자리 안에서 글이 접히면 줄 높이가 들쭉날쭉해진다');
});

test('★ 없는 것도 «자리를 지킨다» — 빼면 뒤엣것이 앞으로 당겨진다', () => {
  /* 이것이 대표님이 본 화면 그대로다(2026-08-30): 명함이 없는 줄만 「등록증 1」이
     맨 앞으로 당겨져, 눈으로 세로로 훑을 수가 없었다. */
  const td = slice('<td class="bits"', '</td>');
  const spans = td.match(/<span>/g) || [];
  assert.equal(spans.length, 3,
    '★ 자리가 ' + spans.length + '개다 — 셋이 «늘» 있어야 줄마다 같은 x 에 선다');
  assert.ok(!/\$\{[^}]*\?[^}]*<span>/.test(td),
    '★ 자리 자체를 조건으로 만들면 없는 줄에서 자리가 사라진다');
});

test('빠진 것 딱지만 줄어든다 — 개수는 온전히 보여야 한다', () => {
  /* ⚠ grid 로 바뀐 뒤로 «줄어들고 말고»는 자리 폭이 정한다: 앞 둘은 못 박은 px 이고
     빠진 것만 minmax(0,1fr) 로 남는 폭을 먹는다. flex 값을 찾던 옛 검사는 그대로면
     늘 실패한다 — 지키려던 뜻(붉은 딱지만 접힌다)을 지금 방식으로 다시 적는다. */
  const cols = HTML.match(/\.corow \.bits\{[^}]*grid-template-columns:([^;}]+)/)[1].trim().split(/\s+/);
  assert.match(cols[0], /^\d+px$/, '★ 명함 자리가 못 박혀 있지 않다 — 수가 늘면 뒤가 밀린다');
  assert.match(cols[1], /^\d+px$/, '★ 등록증 자리가 못 박혀 있지 않다');
  assert.match(cols[2], /minmax\(0,\s*1fr\)/,
    '★ 빠진 것이 남는 폭을 안 먹는다 — minmax 의 0 이 빠지면 넘쳐서 옆 칸을 민다');
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
  /* ⚠ 2026-08-30: missTxt 에서 ' 없음' 두 글자를 뺐다. 그 두 글자가 딱지 폭을 24px 먹어
     정작 어느 칸이 빠졌는지가 잘렸다(「대표번…」). 이제 딱지는 ✕ 로, 말풍선은 「없음」으로
     말하되 «가리키는 값은 하나»다 — 그 하나임을 여기서 지킨다. */
  assert.match(bitsDecl(), /coMissing\(o\)/, '빠진 것은 화면과 같은 함수로 센다');
  assert.match(bitsDecl(), /care && missTxt \? missTxt \+ ' 없음' : ''/,
    '말풍선도 같은 missTxt 를 쓴다');
  assert.match(bitsTd(), /missTxt \? miss\('✕ ' \+ missTxt\)/, '딱지도 같은 missTxt 를 쓴다');
  /* ⚠ 선언 «한 줄»만 본다. 덩이째 보면 아래 bitsAll 의 「없음」이 걸려 늘 실패한다. */
  const decl = bitsDecl().split('\n').find(l => l.indexOf('const missTxt') >= 0);
  assert.ok(decl, 'missTxt 선언을 찾지 못했다');
  assert.ok(decl.indexOf('없음') < 0,
    "★ missTxt 안에 '없음'을 도로 넣었다 — 딱지 폭을 먹어 칸 이름이 잘린다: " + decl.trim());
});

test('말풍선에 명함·등록증·빠진 것이 다 담긴다', () => {
  const d = bitsDecl();
  assert.match(d, /'명함 ' \+ o\.cards\.length/, '명함 수');
  assert.match(d, /'등록증 ' \+ o\.docs/, '등록증 수');
  /* 우리가 일하는 회사가 아니면 붉게 안 짚는다 — 화면 규칙과 같아야 한다 */
  assert.match(d, /care \? '등록증 없음' : ''/, '등록증 없음도 care 안에서만');
});

test('표가 좌우로 넘치지 않는다 — 다만 «남는 폭»을 굳이 아끼지도 않는다', () => {
  const co = slice('return `${coOrphanBarHtml()}<table class="cotbl">', '<thead><tr>');
  const w = (co.match(/width:(\d+)px/g) || []).map(x => Number(x.match(/\d+/)[0]));
  /* ⚠ 예전에는 합을 «868 그대로»로 못 박았다. 그런데 재 보니 1700px 화면에서 표
     오른쪽에 **791px 이 빈 채로** 남아 있었다 — 마지막 <col> 이 남는 폭을 다 먹는다.
     그 규칙이 아끼라고 시킨 폭은 «아무도 안 쓰는 폭»이었고, 그 바람에 폴더 칸이
     95px 로 묶여 「2. 계약해지사업장」이 「2. …」로 잘렸다(검수 2026-08-30).
     지켜야 하는 것은 «좁은 창에서 좌우로 안 넘치는 것» 하나다.
     검사고정-허용 1010: 가장 좁은 실사용 화면 1280 에서 옆줄 240 을 뺀 1040 보다 작다
       — 이 값이 «규칙»이다(지금 합이 얼마인가가 아니다).
     ⚠ 2026-08-31 에 960 → 1010 으로 올렸다(대표 화면 「열 정리해줘」). 960 은 진짜
       한계가 아니라 그 아래 여유였는데, 그 사이 칸이 아홉으로 늘고 «모든 칸이 실측
       최소에 닿았다» — 유형 머리글이 두 줄로 접히고, 상호에서 딱지가 잘리며 「+2」가
       사라지고 있었다. 더 아낄 곳이 없어 여유를 30px 로 줄였다.
     ⚠⚠ 2026-09-03 에 1010 → 1100 으로 올렸다. **대표께 물어보고 정한 것**이다
       (「기업이름 옆에 통하 고유번호 등 이부분을 별도로 분리좀 해라 그래야 판단한다」).
       서식을 제 열로 빼려면 90px 이 필요한데, 재 보니 «줄일 수 있는 칸이 없었다» —
       상호 252(이름 212+⚠+여백) · 폴더 164(161이 최소) · 사업자번호 126 · 가진 것 214 ·
       유형 80(머리글) · 담당 88 이 모두 실측 최소였다. 세 갈래(표를 넓힌다 / 가진 것을
       줄인다 / 상호를 줄인다)를 대표께 보여 드리고 «표를 넓힌다»를 고르셨다.
       → 이제 1280 화면 + 옆줄 240 이면 좌우로 조금 넘친다. 그것을 «알고» 고른 것이다.
     ★ 더 올리지 말 것. 올리려면 먼저 «어느 칸을 줄일 수 있나»를 재 보고, 줄일 곳이
       없으면 대표께 물어볼 것 — 이 값은 사람이 정하는 값이지 코드가 정할 값이 아니다. */
  const sum = w.reduce((a, b) => a + b, 0);
  assert.ok(sum <= 1100,
    '칸 폭 합이 1100 을 넘었다 — 좁은 창에서 좌우로 넘친다: ' + w.join('+') + '=' + sum);
  /* ⚠ 칸마다의 폭은 «못 박지 않는다» (2026-08-30). 여기 215·255 를 적어 두었더니
     폴더를 제 칸으로 빼면서(대표 지시 「열 정리해라」) 폭을 나눠 준 것만으로 깨졌다 —
     이 검사가 지키려던 것은 «표가 넓어지지 않는 것»이지 어느 칸이 몇 px 인가가 아니다.
     같은 뜻을 cards-co-info 의 「폭 숫자를 못 박지 않는다」 주석이 이미 적어 두었다.
     대신 상호가 «가장 넓은 글자 칸»으로 남아 있는지만 본다 — 이름이 잘리면 못 읽는다. */
  const 글자칸 = w.slice(2);                    /* 체크·번호 칸은 뺀다 */
  assert.strictEqual(Math.max(...글자칸), w[2],
    '상호가 가장 넓은 칸이 아니다 — 회사 이름이 잘려 못 읽는다: ' + w.join('+'));
});
