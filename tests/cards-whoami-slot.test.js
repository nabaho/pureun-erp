const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cards = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const whoami = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-whoami.js'), 'utf8');

test('기업정보함은 로그인한 사람 이름에 «자리»를 준다 — 떠 있는 표가 아니다', () => {
  /* ★ 자리를 안 주면 pu-whoami 가 position:fixed 로 화면 오른쪽 위에 붙어
     🔍·🚪·☰ 를 덮는다(대표 화면 2026-08-20 "겹쳐져서 뒤 화면 안 보인다"). */
  assert.match(whoami, /position:fixed;top:8px;right:12px/,
    '떠 있는 표는 자리를 안 줬을 때의 «되돌아갈 곳» 이다 — 사라지면 이 검사의 뜻이 바뀐다.');
  assert.match(cards, /<span id="pcWhoM"/, '폰 머리줄에 이름 자리가 없습니다.');
  assert.match(cards, /<span id="pcWho"/, 'PC 머리줄에 이름 자리가 없습니다.');
  assert.match(cards, /PuWhoami\.mount\('#pcWho'\)/);
  assert.match(cards, /PuWhoami\.mount\(false\)/,
    '폰은 «우리가 그린다» 고 일러 둬야 표가 두 번 뜨지 않습니다.');
});

test('폰 머리줄은 한 줄을 지키고, 줄어드는 것은 이름 하나뿐이다', () => {
  const bar = cards.match(/#appbar\{([^}]*)\}/)[1];
  assert.match(bar, /flex-wrap:\s*nowrap/,
    '★ 이름을 넣으면 「명함/첩」이 낱말 가운데서 갈라집니다.');
  const logo = cards.match(/#appbar \.logo\{([^}]*)\}/)[1];
  assert.match(logo, /white-space:\s*nowrap/);
  /* 이름만 …으로 줄어든다 — 나머지는 줄지 않는다 */
  assert.match(cards.match(/\.pcwho\{([^}]*)\}/)[1], /text-overflow:\s*ellipsis/);
});

test('폰에서 「실시간 공유」 딱지는 빛깔 알로 줄지만 뜻은 남는다', () => {
  /* 여덟 칸을 한 줄에 넣으려면 어딘가는 줄여야 한다. 이 딱지는 빛깔이 곧 뜻이라
     (초록=공유 중, 주황=데모) 글씨를 접어도 잃는 것이 없다 — 다만 «말» 은 남겨야 한다. */
  assert.match(cards, /#modeBadge\{font-size:0/);
  assert.match(cards, /modeBadge\.title\s*=/,
    '★ 글씨를 접었으면 말풍선에라도 남아야 합니다.');
  assert.match(cards, /전 직원 실시간 공유 중/);
});
