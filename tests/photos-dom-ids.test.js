/* 사진첩 — 스크립트가 부르는 칸이 화면에 실제로 있는가
   ══════════════════════════════════════════════════════
   2026-08-08 실제 사고: 안내를 한 줄로 합치면서 `maxHint` 칸을 지웠는데
   `$('maxHint').textContent = …` 줄을 안 지웠다. 그 줄은 **화면을 그리기 전
   맨 위에서** 돌아서, null 오류 한 번에 **그 아래 전부가 안 돌았다.**
   대표님 화면이 제목줄만 남고 하얗게 비었다.

   이 앱은 빌드가 없어 이런 어긋남을 아무도 안 잡아 준다. 여기서 잡는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 화면에 적힌 id 들 */
const inMarkup = new Set();
for (const m of html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)) inMarkup.add(m[1]);
/* 스크립트가 만들어 넣는 것도 있다 — 문자열로 조립하는 id 까지 모은다 */
for (const m of html.matchAll(/id="?'\s*\+|id=\\?"([A-Za-z0-9_-]+)\\?"/g)) {
  if (m[1]) inMarkup.add(m[1]);
}
for (const m of html.matchAll(/\bid='([A-Za-z0-9_-]+)'/g)) inMarkup.add(m[1]);

/* $('...') 로 곧바로 .어떤것 을 만지는 곳 — 없으면 그 자리에서 터진다.
   `const x = $('id'); if (!x) return;` 처럼 **받아서 확인하는** 곳은 안전하므로 뺀다. */
const risky = [];
for (const m of html.matchAll(/\$\('([A-Za-z0-9_-]+)'\)\s*\./g)) {
  if (!inMarkup.has(m[1])) risky.push(m[1]);
}

test('★ 스크립트가 부르는 칸이 화면에 다 있다 (없으면 앱이 통째로 멈춘다)', () => {
  assert.deepEqual([...new Set(risky)], [],
    '화면에 없는 칸을 부르고 있습니다: ' + [...new Set(risky)].join(', ') +
    '\n맨 위에서 나는 오류 한 번에 그 아래가 전부 안 돌아 화면이 하얗게 빕니다.');
});

/* 지운 칸의 이름이 어디에도 안 남아 있는지 — 주석까지 훑지는 않고 코드만 본다 */
test('없앤 칸(maxHint)을 아무도 안 부른다', () => {
  /* ⚠ 2026-08-10 — maxHintS 마저 ⓘ 팝업으로 옮겨 화면에서 사라졌다.
     둘 다 이제 「없앤 칸」이다. 부르면 그때 그 하얀 화면이 되풀이된다.
     (팝업은 열 때 그 자리에서 글을 만들므로 미리 만들어 둔 칸이 필요 없다) */
  for (const gone of ['maxHint', 'maxHintS']) {
    assert.ok(!new RegExp("\\$\\('" + gone + "'\\)").test(html),
      '없앤 칸을 부르고 있습니다: ' + gone + ' — 이것을 부르면 앱이 멈춥니다.');
  }
});

/* 이 검사가 헛돌지 않는다는 확인 — 실제로 있는 칸은 걸리지 않아야 한다 */
test('검사가 헛돌지 않는다', () => {
  assert.ok(inMarkup.has('grid') && inMarkup.has('side') && inMarkup.has('backBar'),
    '화면 id 를 못 모으고 있으면 이 검사는 아무것도 안 잡습니다.');
  assert.ok(inMarkup.size > 40, '모은 id 가 ' + inMarkup.size + '개뿐입니다 — 훑기가 깨졌습니다.');
});
