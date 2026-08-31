/* 편지 쓰기 화면의 «안내 글자» (대표 지시 2026-08-31)
   「제목에 내용 없애고, 참조는 연한 글씨로 해라」

   ★ 왜 — 안내 글자(placeholder)가 브라우저 기본 회색이라 «적어 넣은 글자»와 너무
     닮았다. 그래서 빈 칸인데도 이미 적힌 것처럼 보였다. 제목 칸에는 그 위에
     긴 문장까지 들어 있어, 편지를 쓸 때마다 제목이 채워져 있는 것처럼 보였다.

   지키는 것.
   ① 제목 칸에는 안내 글자가 «없다»
   ② 안내 글자는 «연하다» — 왼쪽 이름표보다 연해야 뜻이 있다
   ③ [문구] 길은 «그대로 있다» — 안내만 뺀 것이지 기능을 뺀 것이 아니다
   ④ 다른 칸(참조·받는사람)의 안내 글자는 «남는다» — 무엇을 적는 곳인지 알아야 한다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const css = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
/* 주석을 걷은 몸통 — 「그렇게 하지 말라」고 적어 둔 주석이 검사를 통과시키면 안 된다 */
const code = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\$\{\/\*[\s\S]*?\*\/''\}/g, ' ');

test('★★ 제목 칸에 안내 글자가 «없다»', () => {
  const m = code.match(/id="cpSubj"[^>]*>/g) || [];
  assert.ok(m.length, '제목 칸을 찾지 못했습니다');
  m.forEach(tag => assert.ok(!/placeholder=/.test(tag),
    '제목 칸에 안내 글자가 남아 있습니다: ' + tag));
});

test('★★ 그 긴 문장이 화면 어디에도 «안 남아 있다»', () => {
  assert.ok(code.indexOf('제목을 적으세요') < 0,
    '「제목을 적으세요…」가 아직 화면에 있습니다');
});

test('★★ [문구] 길은 «그대로 있다» — 안내만 뺀 것이지 기능을 뺀 것이 아니다', () => {
  /* 제목까지 채워 주는 그 단추가 사라지면, 안내를 뺀 것이 아니라 길을 없앤 것이 된다. */
  assert.match(code, /📝 문구|openPhraseBox|matPhrase|cpPhrase/,
    '[문구] 단추가 사라졌습니다 — 제목을 채우는 길이 없어집니다');
});

test('★★ 안내 글자가 «연하다» — 적어 넣은 글자와 닮으면 빈 칸인 줄 모른다', () => {
  const m = css.match(/#pcMail \.cprow input::placeholder\{([^}]*)\}/);
  assert.ok(m, '안내 글자 색 규칙이 없습니다 — 브라우저 기본 회색이 그대로 나옵니다');
  assert.match(m[1], /color:\s*#[0-9a-f]{6}/i, '색을 안 정했습니다');
  /* ⚠ opacity 를 안 되돌리면 파이어폭스가 제 값(0.54)을 얹어 더 흐려진다 */
  assert.match(m[1], /opacity:\s*1/, 'opacity 를 안 되돌렸습니다 — 브라우저마다 다르게 보입니다');
});

test('★★ 이름표보다 «연하다» — 같으면 연하게 한 뜻이 없다', () => {
  const ph = (css.match(/#pcMail \.cprow input::placeholder\{[^}]*color:\s*(#[0-9a-f]{6})/i) || [])[1];
  const key = (css.match(/#pcMail \.cpk\{[^}]*color:\s*(#[0-9a-f]{6})/i) || [])[1];
  const val = (css.match(/#pcMail \.cprow input\{[^}]*color:\s*(#[0-9a-f]{6})/i) || [])[1];
  assert.ok(ph && key && val, '세 색을 다 찾지 못했습니다');
  const lum = (h) => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  assert.ok(lum(ph) > lum(key), '안내 글자(' + ph + ')가 이름표(' + key + ')보다 안 연합니다');
  assert.ok(lum(ph) > lum(val), '안내 글자(' + ph + ')가 적어 넣은 글자(' + val + ')보다 안 연합니다');
});

test('★ 참조·받는사람의 안내 글자는 «남는다» — 무엇을 적는 곳인지 알아야 한다', () => {
  /* ⚠ 이 칸들은 «두 곳»에 있다(팝업 길과 본문 쓰기 화면). 「하나라도 있으면 통과」로
       보면 한쪽만 떼어 내도 그냥 지나간다 — 이빨 확인에서 실제로 지나갔다.
       그래서 나온 것을 «모두» 세어 하나하나 본다. */
  [['cpCc', '참조'], ['cpTo', '받는사람']].forEach(([id, nm]) => {
    const tags = code.match(new RegExp('id="' + id + '"[^>]*>', 'g')) || [];
    assert.ok(tags.length >= 2, nm + ' 칸이 ' + tags.length + '곳뿐입니다 — 두 곳이어야 합니다');
    tags.forEach(t => assert.ok(/placeholder="[^"]+"/.test(t),
      nm + ' 칸 하나에서 안내가 사라졌습니다: ' + t));
  });
});
