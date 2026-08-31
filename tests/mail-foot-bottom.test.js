/* 「예약 발송 · Editor/HTML/TEXT」 줄이 «화면 가장 아래»까지 (대표 지시 2026-08-31)
   「예약발송 밑줄 등 라인을 화면 가장 아래까지 내려라」

   ★ 왜 안 내려갔나 — 붙박이(position:sticky)는 «넘칠 때»만 일한다.
     편지가 짧으면 넘치지 않으니 이 줄은 본문 바로 밑에 서고, 그 아래로 흰 자리가
     남는다. 2026-08-30 에 붙박이를 넣고 「됐다」고 했는데, 그때는 긴 편지로만 봤다.
     짧은 편지에서는 그대로였다 — 대표 화면이 정확히 그 모습이었다.

   ★ 그래서 «두 가지»가 함께 있어야 한다.
     ① 짧을 때 — 세로 flex 가 바닥으로 민다(margin-top:auto)
     ② 길 때  — 붙박이가 붙든다(position:sticky)
     하나만 두면 한쪽이 깨진다. 이 검사는 «둘 다» 있는지를 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const css = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
const rule = (sel) => {
  const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  return m ? m[1] : null;
};

/* ══════ ① 짧을 때 — 바닥으로 «민다» ══════ */

test('★★ 짧은 편지에서도 바닥까지 내려간다 — 미는 힘(margin-top:auto)이 있다', () => {
  const r = rule('#pcMail .edfoot') || '';
  const all = (css.match(/#pcMail \.edfoot\{[^}]*\}/g) || []).join(' ');
  assert.match(all, /margin-top:\s*auto/,
    '미는 힘이 없습니다 — 짧은 편지에서는 본문 바로 밑에 서고 아래가 빕니다');
  assert.ok(r !== null, '#pcMail .edfoot 규칙이 없습니다');
});

test('★★ 밀 자리를 만드는 둘이 «함께» 있다 — 하나만 있으면 안 밀린다', () => {
  const wrap = rule('#pcMail .mwrap');
  const main = rule('#pcMail .mmain');
  assert.ok(wrap, '.mwrap 이 스크롤 칸 높이를 안 채웁니다 — 밀 자리가 없습니다');
  assert.match(wrap, /min-height:\s*100%/,
    '.mwrap 이 높이를 안 채웁니다(min-height:100%): ' + wrap);
  assert.ok(main, '.mmain 규칙이 없습니다');
  assert.match(main, /display:\s*flex/, '.mmain 이 세로 flex 가 아니라 margin-top:auto 가 안 먹습니다');
  assert.match(main, /flex-direction:\s*column/,
    '.mmain 이 «가로» flex 입니다 — 줄 차례가 통째로 어긋납니다: ' + main);
});

/* ══════ ② 길 때 — 붙박이가 «붙든다» ══════ */

test('★★ 긴 편지에서는 붙박이가 붙든다 — 미는 힘만으로는 스크롤할 때 사라진다', () => {
  const all = (css.match(/#pcMail \.edfoot\{[^}]*\}/g) || []).join(' ');
  assert.match(all, /position:\s*sticky/, '붙박이가 사라졌습니다 — 길게 쓰면 아래 줄이 안 보입니다');
  assert.match(all, /bottom:/, '«아래»에 안 붙습니다');
  assert.ok(!/(^|;|\s)top:/.test(all), '위에 붙습니다 — 아래여야 합니다');
  assert.match(all, /background:/, '바탕이 없습니다 — 본문이 비쳐 글자가 겹칩니다');
  assert.match(all, /z-index:\s*[1-9]/, 'z-index 가 없습니다 — 본문이 덮습니다');
});

test('★★ 아래 여백을 «한 곳»에서만 정한다 — 두 곳에 적으면 바닥에서 뜬다', () => {
  /* 2026-08-30 에 실제로 그랬다 — 여백이 40px 라 bottom:0 으로 붙이면 40px 떴다. */
  assert.match(css, /#pcMail\{--mailPadBottom:\s*\d+px/, '아래 여백에 이름이 없습니다');
  const all = (css.match(/#pcMail \.edfoot\{[^}]*\}/g) || []).join(' ');
  assert.match(all, /var\(--mailPadBottom/, '붙박이가 그 이름을 안 씁니다');
});

/* ══════ 안 깨뜨리기 ══════ */

test('★★ 폰은 «안» 건드린다 — 좁은 화면에서 붙이면 쓸 자리가 줄어든다', () => {
  assert.ok(!/^\.edfoot\{[^}]*position:\s*sticky/m.test(css),
    '#pcMail 밖에도 붙박이 규칙이 있습니다 — 폰에서도 붙습니다');
  assert.ok(!/^\.mmain\{[^}]*flex-direction:\s*column/m.test(css),
    '#pcMail 밖에서도 .mmain 을 세로 flex 로 바꿉니다 — 폰 화면이 어긋납니다');
});

test('★ 위는 위에 · 아래는 아래에 — 본문만 그 사이를 흐른다', () => {
  const top = rule('#pcMail .cphead');
  assert.ok(top, '머리칸 붙박이 규칙이 없습니다');
  assert.match(top, /top:\s*0/, '머리칸이 위에 안 붙습니다');
  const body = rule('#pcMail .cpbody');
  if (body) assert.ok(!/position:\s*sticky/.test(body),
    '본문까지 붙었습니다 — 그러면 쓸 자리가 없어집니다');
});
