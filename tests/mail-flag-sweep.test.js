'use strict';
/* 다음메일에서 읽은 것이 푸른 메일함에도 오게 (대표 보고 2026-08-30)
   "안읽금이 매칭이 안된다 엉망이다. 그리고 다음에서 읽음이면 푸른메일도 같이
    동기화 되어야 하는데 따로 논다."

   ★ 왜 따로 놀았나 — 우리는 [lo … hi] 사이를 «다시 읽지 않는다»(pickToFetch).
     한 번 가져온 줄의 r(읽음)·g(중요)·w(답장함)은 그때 찍힌 그대로 굳는다.
     한편 옆줄·머리의 「안읽음」 수는 STATUS 가 주는 값이라 늘 최신이다 —
     그래서 두 수가 어긋나 「엉망」으로 보였다.
     ⚠ 실측 2026-08-30: 받은메일함은 다음이 «안읽음 0» 이라는데 우리 줄에는 34통이
       안읽음이었다. 전체로 다음 28 vs 우리 80 — 52통이 어긋나 있었다.

   ★ 여기서 못 박는 것
     ① 표시를 다시 훑는 걸음이 «있다»
     ② 훑을 때는 «표시만» 받는다 — envelope·bodyStructure 를 다시 받으면 비싸다
     ③ 회차마다 훑지 않는다 — «안읽음 수가 바뀌었을 때»가 신호다 (+ 하루 그물)
     ④ «바뀐 줄만» 적는다 — 400줄을 늘 덮어쓰면 요금도, 화면 다시 그리기도 헛되다
     ⑤ 아직 안 가져온 줄은 «건드리지 않는다» — 표시만 있는 빈 줄을 만들면 안 된다
     ⑥ 읽음(r)뿐 아니라 중요(g)·답장함(w)도 함께 맞춘다
     ⑦ 시간·개수 울타리 안에서 한다 — 한 폴더가 회차를 다 먹으면 안 된다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'functions', 'mail-sync.js'), 'utf8')
  .replace(/\r\n/g, '\n');
/* ⚠ 주석을 걷고 본다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
const MB = require(path.join(ROOT, 'functions', 'mail-box.js'));

/* 훑는 덩이만 잘라 본다 */
function sweepBlock() {
  const i = src.indexOf('const unseenNow');
  assert.ok(i > 0, '★ 표시를 다시 훑는 걸음이 아예 없습니다');
  return src.slice(i, i + 2200);
}

/* ══════ ① 걸음이 있다 ══════ */
test('★★ 표시를 다시 훑는 걸음이 있다 — 없으면 다음에서 읽어도 영영 안 바뀐다', () => {
  const b = sweepBlock();
  assert.match(b, /client\.fetch\(/, '★ 다시 받아 오지 않습니다');
  assert.match(b, /db\.ref\(\)\.update\(/, '★ 받아 온 것을 안 적습니다');
});

/* ══════ ② 표시«만» 받는다 ══════ */
test('★★ 훑을 때는 «표시만» 받는다 — envelope 을 다시 받으면 400통이 비싸진다', () => {
  const b = sweepBlock();
  const i = b.indexOf('client.fetch(');
  const call = b.slice(i, b.indexOf(')', b.indexOf('{ uid: true', i)) + 1);
  assert.match(call, /flags:\s*true/, '★ 표시를 안 달라고 합니다');
  for (const k of ['envelope', 'bodyStructure', 'source', 'bodyParts']) {
    assert.ok(call.indexOf(k) < 0, '★ 훑는데 ' + k + ' 까지 받습니다 — 비쌉니다');
  }
});

/* ══════ ③ 신호를 보고 훑는다 ══════ */
test('★★ 회차마다 훑지 않는다 — «두 수가 다를 때»가 신호다', () => {
  const b = sweepBlock();
  assert.match(b, /p\.st\.unseen/, '★ 다음메일이 말하는 안읽음 수를 안 봅니다');
  assert.match(b, /p\.sync\.unread/, '★ 우리가 든 안읽음 수를 안 적어 둡니다 — 견줄 것이 없습니다');
  assert.match(b, /knownUnread\s*!==\s*unseenNow/,
    '★ 두 수를 곧바로 견주지 않습니다');
  /* 그물 — 중요·답장함만 바뀐 경우를 위해 하루에 한 번 */
  assert.match(b, /sweptAt/, '★ 언제 훑었는지 안 적어 둡니다');
  assert.match(b, /PRUNE_GAP_MS|GAP_MS/, '★ 하루 그물이 없습니다');
});

test('★★ 신호가 «지난번과 달라졌나»가 아니라 «두 수가 다른가»다', () => {
  /* ⚠ 이것이 핵심이다. 다음이 «이미 0» 인데 우리만 34통이 안읽음인 상황에서는
       다음 쪽 수가 더 안 줄어든다 — 「달라졌나」로는 영영 못 잡는다.
       실측 2026-08-30 이 바로 그 상황이었다. */
  const b = sweepBlock();
  assert.ok(b.indexOf('unseenAt') < 0,
    '★ 아직 「지난번 다음 쪽 수」와 견줍니다 — 다음이 0 이면 못 잡습니다');
});

test('★ 훑은 뒤에는 «다시 세어» 적어 둔다 — 안 적으면 매번 다시 훑는다(요금)', () => {
  const b = sweepBlock();
  const i = b.indexOf('update(');
  assert.ok(i > 0, '적는 자리를 못 찾았습니다');
  const after = b.slice(i);
  assert.match(after, /p\.sync\.unread\s*=/, '★ 맞춘 뒤의 안읽음 수를 안 적어 둡니다');
  assert.match(after, /sweptAt\s*=/, '★ 훑은 때를 안 적어 둡니다');
  /* 세는 자리가 «맞춘 뒤» 값을 봐야 한다 — 옛 값을 세면 늘 어긋난 것으로 남는다 */
  assert.match(after, /flags\[u\]/, '★ 맞추기 «전» 값으로 셉니다 — 영원히 다시 훑습니다');
});

/* ══════ ④⑤ 바뀐 줄만 ══════ */
test('★★ «바뀐 줄만» 적는다 — 400줄을 늘 덮어쓰면 화면이 까닭 없이 다시 그려진다', () => {
  const b = sweepBlock();
  assert.match(b, /Number\(row\[k\]\s*\|\|\s*0\)\s*!==/,
    '★ 지금 값과 견주지 않고 적습니다');
  assert.match(b, /if\s*\(moved\)/, '★ 바뀐 것이 없어도 적습니다');
});

test('★★ 아직 «안 가져온 줄»은 건드리지 않는다 — 표시만 있는 빈 줄이 생긴다', () => {
  const b = sweepBlock();
  assert.match(b, /const row = have\[u\];\s*if \(!row\) return;/,
    '★ 우리가 안 들고 있는 번호에도 표시를 적습니다 — 제목도 보낸이도 없는 줄이 생깁니다');
});

/* ══════ ⑥ 셋 다 ══════ */
test('★★ 읽음뿐 아니라 중요·답장함도 함께 맞춘다', () => {
  const b = sweepBlock();
  for (const [f, what] of [['Seen', '읽음'], ['Flagged', '중요'], ['Answered', '답장함']]) {
    assert.ok(b.indexOf(f) > 0, '★ ' + what + '(' + f + ')을 안 맞춥니다');
  }
  assert.match(b, /\['r', 'g', 'w'\]|\["r", "g", "w"\]/,
    '★ 세 가지를 함께 견주지 않습니다');
});

test('★ 표시를 읽는 규칙은 «처음 가져올 때»와 같은 것을 쓴다 — 두 벌이면 어긋난다', () => {
  const b = sweepBlock();
  assert.match(b, /MB\.hasFlag\(/, '★ 표시 읽는 규칙을 따로 만들었습니다');
  /* 그 규칙이 실제로 도는지 — 값으로 확인 */
  assert.equal(MB.hasFlag(['\\Seen'], '\\Seen'), true);
  assert.equal(MB.hasFlag(['\\Flagged'], '\\Seen'), false);
  assert.equal(MB.hasFlag([], '\\Seen'), false);
  assert.equal(MB.hasFlag(null, '\\Seen'), false);
});

/* ══════ ⑦ 울타리 ══════ */
test('★★ 시간·개수 울타리 안에서 한다 — 한 폴더가 회차를 다 먹으면 안 된다', () => {
  const b = sweepBlock();
  assert.match(b, /swept\s*<\s*\d/, '★ 한 회차에 몇 칸까지 훑을지 한도가 없습니다');
  assert.match(b, /nowMs\(\)\s*<\s*deadline/, '★ 시간 한도를 안 봅니다');
  assert.match(src, /let swept = 0;/, '★ 세는 값이 없습니다');
});

test('★ 훑다 실패해도 회차가 안 멈춘다 — 표시 하나 때문에 목록이 막히면 안 된다', () => {
  const b = sweepBlock();
  assert.match(b, /try \{/, '★ 감싸지 않았습니다');
  assert.match(b, /catch \(e\)/, '★ 실패를 안 받습니다 — 회차가 통째로 멈춥니다');
});

/* ══════ 다 가져온 칸에서만 ══════ */
test('★ 아직 «가져오는 중»인 칸은 안 훑는다 — 곧 제 값으로 덮인다', () => {
  const b = sweepBlock();
  assert.match(b, /p\.sync\.done/,
    '★ 아직 채우는 중인 칸까지 훑습니다 — 곧 덮일 것을 두 번 합니다');
});
