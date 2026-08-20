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

test('상태·이름과 사용액이 한 줄에 앉는다', () => {
  /* 전에는 각자 한 줄씩 써서 머리 카드가 네 줄이었다(대표 지시 2026-08-20
     "너무 많은 부분 차지"). 173px → 117px. */
  const b = phoneBlock();
  assert.match(b, /\.pbar \.pmeta\{order:1;flex:1 1 \d+%/);
  assert.match(b, /\.pbar #billChip\{order:2;flex:0 0 auto/);
  /* ★ flex:1 1 0 으로 두면 «맨 윗줄에 끼어» 이름이 「권형하 · …」로 잘린다 —
     제 줄로 내려가게 하려면 바닥 너비가 넉넉해야 한다(재어 보고 고쳤다). */
  assert.doesNotMatch(b, /\.pbar \.pmeta\{order:1;flex:1 1 0/,
    '★ 바닥 너비가 0 이면 이름 줄이 맨 윗줄로 끼어 들어가 잘립니다.');
  assert.match(b, /\.pbar \.pmeta\{[^}]*min-width:\d+px/);
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
