/* 푸른 메일 — 서명 명함을 «보고» 고른다 (대표 지시 2026-08-30)
   「명함의 경우 명함 화면 나오게 해라 — 내가 보내는 것 명함 보고 보낼 수 있어야 한다」

   ★ 이름·회사 «글자»만 있어서 어느 명함이 나가는지 알 수 없었다. 같은 이름의 옛
     명함이 여러 장 있다 — 고르고 나서야 그림을 본다.

   지키는 것.
   ① 고르는 목록에 «명함 그림 자리»가 있다
   ② 그림은 «보일 때» 받아 온다 — 40장을 한꺼번에 받으면 창 열 때마다 몇 MB 다
   ③ 받아 오는 길을 «새로 짓지 않는다»(thumbFill) — 두 벌이면 한쪽만 고쳐진다
   ④ 창을 열 때도, 글자를 칠 때도 채운다
   ⑤ 사진이 없는 명함은 «첫 글자»가 그대로 남는다 — 빈 네모가 되면 안 된다
   ⑥ 아래 줄(예약 발송·Editor)이 화면 «아래»에 붙는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

function fn(name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i > 0, name + ' 을 찾지 못했습니다');
  const j = src.indexOf('\nfunction ', i + 10);
  return src.slice(i, j > i ? j : i + 3000);
}

/* ══════ ① 그림 자리 ══════ */

test('★★ 고르는 목록에 «명함 그림 자리»가 있다', () => {
  const b = fn('mySignListHtml');
  assert.ok(/class="msth thumb"/.test(b), '그림 자리가 없습니다 — 이름 글자만 보입니다');
  assert.ok(/data-th="\$\{esc\(it\.id\)\}"/.test(b),
    '어느 명함의 그림인지 안 적혀 있습니다 — 채울 수가 없습니다');
});

test('★★ 사진이 없는 명함은 «첫 글자»가 남는다 — 빈 네모가 되면 안 된다', () => {
  const b = fn('mySignListHtml');
  assert.ok(/slice\(0,\s*1\)/.test(b), '사진이 없을 때 넣을 것이 없습니다');
});

test('★ 이미 손에 든 그림은 «곧바로» 그린다 — 있는데 또 받아 오면 헛일이다', () => {
  const b = fn('mySignListHtml');
  assert.ok(/it\.thumb \?/.test(b), '손에 든 그림을 안 씁니다');
});

/* ══════ ②③④ 받아 오는 길 ══════ */

test('★★ 받아 오는 길을 «새로 짓지 않는다» — 이미 있는 thumbFill 을 쓴다', () => {
  const b = fn('msFillThumbs');
  assert.ok(/thumbFill/.test(b), '그림 받아 오는 길을 따로 지었습니다 — 두 벌이 됩니다');
  assert.ok(!/getThumb/.test(b), '여기서 직접 받아 옵니다 — thumbFill 을 지나야 합니다');
});

test('★★ 그림은 «보일 때» 받아 온다 — 목록을 그리면서 40장을 받으면 안 된다', () => {
  const b = fn('mySignListHtml');
  assert.ok(!/getThumb/.test(b), '목록을 그리면서 그림을 받아 옵니다');
  assert.ok(!/await/.test(b), '목록을 그리면서 기다립니다 — 창이 늦게 뜹니다');
});

test('★★ 창을 열 때도, 글자를 칠 때도 채운다 — 한쪽만 하면 반은 빈 네모다', () => {
  assert.ok(/msFillThumbs\(\)/.test(fn('openMySign')), '창을 열 때 안 채웁니다');
  assert.ok(/msFillThumbs\(\)/.test(fn('msType')), '글자를 칠 때 안 채웁니다');
});

test('★ 그림 자리에 «크기»가 정해져 있다 — 없으면 채워질 때 줄이 뛴다', () => {
  const m = css.match(/\.msth\{([^}]*)\}/);
  assert.ok(m, '그림 자리 규칙(.msth)이 없습니다');
  assert.match(m[1], /width:\s*\d+px/, '너비가 없습니다');
  assert.match(m[1], /height:\s*\d+px/, '높이가 없습니다 — 그림이 오면 줄이 뜁니다');
  assert.match(m[1], /overflow:\s*hidden/, '넘치는 그림을 안 자릅니다');
});

/* ══════ ⑥ 아래 줄 붙박이 ══════ */

test('★★ 아래 줄이 화면 «아래»에 붙는다 (대표 지시 2026-08-30)', () => {
  const m = css.match(/#pcMail \.edfoot\{([^}]*)\}/);
  assert.ok(m, '아래 줄 붙박이 규칙이 없습니다');
  assert.match(m[1], /position:\s*sticky/, '붙는 규칙이 없습니다');
  /* ⚠ 값을 글자로 박지 않는다 — 아래 여백만큼 내려 붙이느라 calc() 가 들어 있다.
       지킬 것은 「아래에 붙는가」이지 «0 이냐»가 아니다. */
  assert.match(m[1], /bottom:/, '«아래»에 붙지 않습니다');
  assert.ok(!/(^|;)\s*top:/.test(m[1]), '위에 붙습니다 — 아래여야 합니다');
  assert.match(m[1], /background:/, '바탕이 없습니다 — 본문이 비쳐 글자가 겹칩니다');
  assert.match(m[1], /border-top:/, '위 테두리가 없습니다 — 본문과 붙어 경계가 안 보입니다');
  assert.match(m[1], /z-index:\s*[1-9]/, 'z-index 가 없습니다 — 본문이 덮습니다');
});

test('★ 아래 줄 붙박이는 «PC 에서만» — 폰은 화면이 좁아 쓸 자리가 줄어든다', () => {
  assert.ok(!/^\.edfoot\{[^}]*position:\s*sticky/m.test(css),
    '#pcMail 밖에도 붙박이 규칙이 있습니다 — 폰에서도 붙습니다');
});

test('★★ 위는 위에 · 아래는 아래에 — 본문만 그 사이를 흐른다', () => {
  const top = css.match(/#pcMail \.cphead\{([^}]*)\}/);
  const bot = css.match(/#pcMail \.edfoot\{([^}]*)\}/);
  assert.ok(top && bot, '위·아래 붙박이 규칙이 둘 다 있어야 합니다');
  assert.match(top[1], /top:\s*0/, '머리칸이 위에 안 붙습니다');
  assert.match(bot[1], /bottom:/, '아래 줄이 아래에 안 붙습니다');
  assert.ok(!/(^|;)\s*top:/.test(bot[1]), '아래 줄이 위에 붙습니다');
  /* 본문은 둘 사이 — 어느 쪽에도 안 붙어야 한다 */
  const body = css.match(/#pcMail \.cpbody\{([^}]*)\}/);
  if(body) assert.ok(!/position:\s*sticky/.test(body[1]),
    '본문까지 붙었습니다 — 그러면 쓸 자리가 없어집니다');
});

test('★★ 아래 여백을 «한 곳»에서만 정한다 — 두 곳에 적으면 붙박이가 바닥에서 뜬다', () => {
  /* ⚠ 실제로 그랬다(2026-08-30, 브라우저로 재어 잡음) — #pcMail 의 아래 여백이 40px 라
       bottom:0 으로 붙이면 화면 바닥에서 «40px 떠» 흰 띠가 남았다. 여백을 이름으로
       두고(--mailPadBottom) 붙박이가 그 값을 그대로 되쓴다. 숫자를 두 곳에 적으면
       한쪽만 고쳐져 다시 뜬다. */
  assert.match(css, /#pcMail\{--mailPadBottom:\s*\d+px/,
    '아래 여백에 이름이 없습니다');
  const bot = css.match(/#pcMail \.edfoot\{([^}]*)\}/);
  assert.match(bot[1], /var\(--mailPadBottom/,
    '붙박이가 그 이름을 안 씁니다 — 숫자를 따로 적으면 언젠가 어긋납니다');
  /* 메일 화면 쪽 여백도 같은 이름을 써야 한다 */
  const mm = css.match(/#pcRoot\.mailmode #pcMail\{([^}]*)\}/);
  assert.ok(mm, '메일 화면 여백 규칙이 없습니다');
  assert.match(mm[1], /var\(--mailPadBottom/,
    '메일 화면만 숫자를 따로 적습니다 — 거기가 실제로 쓰이는 자리입니다');
});
