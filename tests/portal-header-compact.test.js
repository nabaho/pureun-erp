const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const enter = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

function phoneBlock() {
  const at = enter.indexOf('/* ── 머리 카드는 작을수록 좋다');
  assert.ok(at >= 0, '머리 카드 폰 블록을 찾지 못했습니다.');
  /* 이 규칙들이 든 @media 를 거슬러 찾는다 */
  const mq = enter.lastIndexOf('@media', at);
  const open = enter.indexOf('{', mq);
  let depth = 0, i = open;
  for (; i < enter.length; i++) {
    if (enter[i] === '{') depth++;
    else if (enter[i] === '}' && --depth === 0) break;
  }
  return enter.slice(mq, i + 1);
}

test('이름·사용액·바로가기가 «한 줄»에 앉는다', () => {
  /* 네 줄 → 두 줄(로고 줄 + 이 한 줄). 173px → 84px (대표 지시 2026-08-20
     "너무 많은 부분 차지" → "최대 1줄 가능할까"). */
  const b = phoneBlock();
  assert.match(b, /\.pbar \.pmeta\{order:1;flex:1 1 auto/);
  assert.match(b, /\.pbar #billChip\{order:2;flex:0 0 auto/);
  assert.match(b, /\.pbar #homeBar\{order:3;flex:0 1 auto/);
  /* ★ 640px 구간의 `.homebar{width:100%}` 가 살아 있어, width:auto 를 안 적으면
     바로가기가 제 줄을 통째로 차지한다(재어 보고 찾았다). */
  assert.match(b, /\.pbar #homeBar\{[^}]*width:auto/,
    '★ width:auto 가 없으면 바로가기가 다시 제 줄로 내려갑니다.');
  /* 줄어드는 차례 — 바로가기가 먼저 줄고 이름·사번은 끝까지 지킨다 */
  assert.match(b, /\.pbar #homeBar select\{flex:0 1 auto/);
  assert.match(b, /\.pbar \.pmeta\{[^}]*min-width:\d+px/);
});

test('한 줄로 몰면서 접은 것은 «다른 데 같은 말이 있는 것» 뿐이다', () => {
  const b = phoneBlock();
  /* 대표 지시 2026-08-20 「권형하와 아이디만 있으면 된다」 — 직책·역할을 접는다 */
  assert.match(b, /\.pbar \.pmeta \.un-role,\.pbar \.pmeta \.un-title\{display:none;\}/);
  assert.match(enter, /<span class="un-title">/, '직책을 감싸지 않으면 접을 수가 없습니다.');
  assert.match(b, /\.pbar #billChip \.lb,\.pbar #billChip \.ago\{display:none;\}/);
  assert.match(b, /\.pbar #homeBar \.hb-lb\{display:none;\}/);
  /* ★ 사번은 «절대» 접지 않는다 — P005·A005 처럼 숫자가 같은 사번이 있어,
     사번이 안 보이면 엉뚱한 계정으로 들어간 것을 알아챌 길이 없다(2026-08-10 고침). */
  assert.doesNotMatch(b, /#userName\{[^}]*display:none/,
    '★ 사번이 사라지면 남의 계정으로 들어간 것을 못 알아챕니다.');
  assert.match(enter, /mySid \? ' · ' \+ _e\(mySid\.toUpperCase\(\)\)/);
  /* 감춘 말은 «명부 값»과 섞이지 않게 감싸서 넣는다 */
  assert.match(enter, /<span class="un-role">/);
  assert.match(enter, /var _e = function\(v\)/, 'innerHTML 로 넣으면서 감싸지 않으면 위험합니다.');
});

test('사용액은 맨 윗줄(로그아웃 옆)로 올리지 않는다', () => {
  /* 거기서는 좁아 가려지고, 가려진 기능은 없는 기능이다
     — 지문 로그인 안내가 실제로 그렇게 사라졌던 적이 있다. */
  const b = phoneBlock();
  const m = b.match(/\.pbar #billChip\{order:(\d+)/);
  assert.ok(m && Number(m[1]) >= 2, '★ 사용액이 맨 윗줄로 올라가면 로그아웃에 가려집니다.');
});

test('연결 상태는 «잘 될 때만» 점으로 줄인다 — 끊기면 말이 그대로 나온다', () => {
  /* 「서버 연결됨」 여섯 글자가 이름 자리를 먹는데, 정작 읽어야 할 때는
     «끊겼을 때»다. 그때는 글자를 남긴다. */
  assert.match(enter, /<span class="cs-lb">' \+ label \+ '<\/span>/,
    '말을 감싸지 않으면 점만 남길 수가 없습니다.');
  const b = phoneBlock();
  assert.match(b, /\.connection-status\[data-state="online"\] \.cs-lb\{display:none;\}/);
  assert.doesNotMatch(b, /\.connection-status \.cs-lb\{display:none/,
    '★ 상태를 가리지 않고 무조건 감추면 「서버 연결 끊김」을 못 봅니다.');
});

test('PC 머리 카드는 그대로 한 줄이다', () => {
  /* 컴팩트는 폰 이야기다 — 넓은 화면은 한 줄에 다 들어간다. */
  assert.match(enter, /\.pbar\{display:flex;align-items:center;gap:13px/);
  assert.match(enter, /\.pbar #sgFab\{order:4;\}/, 'PC 에서 건의하기는 오른쪽 끝이다');
});
