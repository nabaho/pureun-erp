'use strict';
/* 읽는 화면 — 위·아래로 넘기고, 본문을 담아 둔다 (대표 지시 2026-08-30)
   "캡쳐3은 메일을 보고 뒤로가야되는데 벡 할 수 있는방법이 없다.
    그리고 속도가 너무 늦다 새창열고 메일 열어보고 뒤로가고 다시 다른 메일을
    열어보려고 하는데 너무 속도가 늦다."

   ★ 왜 늦었나 — 메일을 열 때마다 서버가 «다음메일에 새로 접속하고 로그인»한다
     (functions/mail-sync.js 의 withFolder). 그 왕복이 통마다 되풀이됐고,
     방금 본 메일을 다시 열어도 마찬가지였다.

   ★ 여기서 못 박는 것
     ① 한 번 받은 본문은 «담아 둔다» — 다시 열면 서버를 안 부른다
     ② 담는 데 «한도»가 있다 — 통수와 크기. 없으면 창이 죽는다
     ③ 미리 받기는 «peek» 으로 부른다 — 안 그러면 열어 보지도 않은 메일이 읽음이 된다
     ④ 서버는 peek 일 때 «아무것도 안 건드린다» (다음메일의 읽음 표시도, DB 도)
     ⑤ 위·아래는 «거른 전부»에서 센다 — 100통 상한에서 세면 101번째로 못 넘어간다
     ⑥ 돌아갈 «목록» 단추가 있다 — 이것이 없다는 말씀이 이 일의 시작이다
     ⑦ 오가는 길(목록·위·아래)은 «오른쪽», 이 메일에 하는 일은 «왼쪽» (다음메일과 같다)

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 걷고 본다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
const srv = fs.readFileSync(path.join(ROOT, 'functions', 'mail-sync.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

function fnBody(name, from) {
  const s = from || src;
  const i = s.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return s.slice(i, s.indexOf('\n}', i) + 2);
}

/* ══════ ① 담아 둔다 ══════ */
test('★★ 한 번 받은 본문은 담아 둔다 — 다시 열 때 «서버를 안 부른다»', () => {
  const fn = fnBody('mbFetchBody');
  const iHit = fn.indexOf('mbBodyGet(');
  const iFetch = fn.indexOf('fetch(');
  assert.ok(iHit > 0, '★ 담아 둔 것을 찾아보지 않습니다');
  assert.ok(iFetch > iHit,
    '★ 담아 둔 것을 보기 «전에» 서버를 부릅니다 — 담아 두는 뜻이 없습니다');
  assert.match(fn.slice(iHit, iFetch), /return\s+Promise\.resolve/,
    '★ 담아 둔 것이 있어도 그냥 지나갑니다');
});

test('★★ 여는 자리가 그 «담아 둔 길»을 쓴다 — 따로 부르면 담아 둔 보람이 없다', () => {
  const fn = fnBody('mbOpenMsg');
  assert.match(fn, /mbFetchBody\(/, '★ mbOpenMsg 가 담아 두는 길을 안 씁니다');
  assert.ok(fn.indexOf("fetch(MB_FN+'readMailMessage'") < 0,
    '★ mbOpenMsg 가 아직 서버를 직접 부릅니다 — 담아 둔 것을 지나칩니다');
});

test('★ 담아 둔 것이 있으면 «기다림 표시 없이» 바로 펼친다', () => {
  const fn = fnBody('mbOpenMsg');
  const i = fn.indexOf('mbBodyGet(');
  assert.ok(i > 0, '★ 여는 자리에서 담아 둔 것을 안 봅니다');
  assert.match(fn.slice(i, i + 300), /loading:\s*false/,
    '★ 담아 뒀는데도 「본문을 가져오고 있습니다」가 뜹니다');
});

/* ══════ ② 한도 ══════ */
test('★★ 담는 데 한도가 있다 — 통수와 크기 둘 다', () => {
  const fn = fnBody('mbBodyPut');
  assert.match(fn, /MB_BODY_MAX/, '★ 큰 본문을 그대로 담습니다 — 창이 죽습니다');
  assert.match(fn, /MB_BODY_KEEP/, '★ 담는 통수에 한도가 없습니다');
  assert.match(fn, /while|shift\(\)|splice\(/,
    '★ 넘쳐도 안 버립니다 — 한도를 적어 두기만 하고 지키지 않습니다');
  for (const k of ['MB_BODY_KEEP', 'MB_BODY_MAX']) {
    const m = src.match(new RegExp('const\\s+' + k + '\\s*=\\s*(\\d+)'));
    assert.ok(m && Number(m[1]) > 0, k + ' 이 숫자가 아닙니다');
  }
});

/* ══════ ③④ 미리 받기는 읽음을 안 건드린다 ══════ */
test('★★ 미리 받기는 «peek» 으로 부른다 — 안 그러면 안 읽은 메일이 읽음이 된다', () => {
  const fn = fnBody('mbPrefetchNear');
  assert.match(fn, /mbFetchBody\([^)]*,\s*true\s*\)/,
    '★ 미리 받기가 peek 없이 부릅니다 — 열어 보지도 않은 메일이 읽음으로 바뀝니다');
});

test('★ peek 이 실제로 서버까지 실려 간다 — 앱에서만 이름 붙이면 소용없다', () => {
  assert.match(fnBody('mbFetchBody'), /peek/,
    '★ 보내는 몸통에 peek 가 없습니다');
});

test('★★ 서버는 peek 일 때 «아무것도 안 건드린다» — 다음메일 읽음도, 우리 DB 도', () => {
  const i = srv.indexOf('readMailMessage: F');
  assert.ok(i > 0, 'readMailMessage 를 찾지 못했습니다');
  const blk = srv.slice(i, i + 4000);
  assert.match(blk, /const peek\s*=/, '★ 서버가 peek 를 안 읽습니다');
  const iSeen = blk.indexOf('messageFlagsAdd');
  const iGuard = blk.indexOf('if (!peek)');
  assert.ok(iGuard > 0 && iGuard < iSeen,
    '★ 읽음 표시가 peek 울타리 «밖»에 있습니다 — 미리 받기가 읽음으로 바꿉니다');
  /* 우리 DB 의 읽음 표시(/r)도 같은 울타리 안이어야 한다 */
  const iDb = blk.indexOf("/r'");
  assert.ok(iDb > iGuard, '★ DB 읽음 표시가 울타리 밖입니다');
  const close = blk.indexOf('\n          }', iGuard);
  assert.ok(close > iDb, '★ 울타리가 DB 표시 «앞»에서 닫힙니다');
});

test('★ 보통 열기는 예전처럼 읽음으로 바꾼다 — peek 을 넣다가 이것을 잃으면 안 된다', () => {
  const i = srv.indexOf('readMailMessage: F');
  const blk = srv.slice(i, i + 4000);
  assert.match(blk, /messageFlagsAdd\(uid/, '★ 다음메일 읽음 표시가 사라졌습니다');
  assert.match(blk, /\/r'\)\s*\.set\(1\)|\/r'\)\.set\(1\)/, '★ 목록 쪽 읽음 표시가 사라졌습니다');
});

/* ══════ ⑤ 위·아래는 거른 전부에서 ══════ */
test('★★ 위·아래는 «거른 전부»에서 센다 — 100통 상한에서 세면 101번째로 못 넘어간다', () => {
  const fn = fnBody('mbNeighbor');
  assert.match(fn, /mbMatchedRows\(\)/,
    '★ 세는 자리가 틀렸습니다 — 그리는 줄(mbVisibleRows)에서 세면 101번째에서 막힙니다');
  assert.ok(fn.indexOf('mbVisibleRows') < 0, '★ 아직 그리는 줄에서 셉니다');
});

test('★ 끝에서는 넘어가지 않는다 — 없는 통을 열면 빈 화면이 된다', () => {
  const fn = fnBody('mbNeighbor');
  assert.match(fn, /j\s*>=\s*0/, '★ 첫 통 위로 넘어갑니다');
  assert.match(fn, /j\s*<\s*rows\.length/, '★ 마지막 통 아래로 넘어갑니다');
  assert.match(fnBody('mbStep'), /if\(!n\)/, '★ 없는 통으로 넘기려 합니다');
});

/* ══════ ⑥⑦ 오가는 길 ══════ */
test('★★ 돌아갈 «목록» 단추가 있다 — 이것이 없다는 말씀이 이 일의 시작이다', () => {
  const fn = fnBody('mbReadHtml') || '';
  const blk = src.indexOf('class="rtop"') > 0
    ? src.slice(src.indexOf('class="rtop"'), src.indexOf('class="rtop"') + 3000) : fn;
  assert.match(blk, /onclick="mbBack\(\)"/, '★ 목록으로 돌아갈 단추가 없습니다');
  assert.match(blk, /class="rbtn list"/,
    '★ 돌아가는 단추가 다른 단추와 똑같이 생겼습니다 — 안 보인다는 말씀이 있었습니다');
});

test('★★ 위·아래 단추가 있다 — 목록을 거치지 않는 길이 속도의 핵심이다', () => {
  const i = src.indexOf('class="rtop"');
  const blk = src.slice(i, i + 3000);
  assert.match(blk, /onclick="mbStep\(-1\)"/, '★ 「위」 단추가 없습니다');
  assert.match(blk, /onclick="mbStep\(1\)"/, '★ 「아래」 단추가 없습니다');
  assert.match(blk, /disabled/, '★ 끝에서도 눌리는 단추입니다 — 눌러도 아무 일이 안 납니다');
});

test('★ 오가는 길은 «오른쪽», 이 메일에 하는 일은 «왼쪽» (다음메일과 같은 자리)', () => {
  const i = src.indexOf('class="rtop"');
  const blk = src.slice(i, i + 3000);
  const iLft = blk.indexOf('class="lft"'), iRgt = blk.indexOf('class="rgt"');
  assert.ok(iLft > 0 && iRgt > iLft, '★ 왼쪽·오른쪽 묶음이 없습니다');
  const lft = blk.slice(iLft, iRgt), rgt = blk.slice(iRgt);
  assert.match(lft, /mbReply\(false\)/, '★ 답장이 왼쪽에 없습니다');
  assert.match(lft, /mbTrashOne\(/, '★ 삭제가 왼쪽에 없습니다');
  assert.match(rgt, /mbBack\(\)/, '★ 목록이 오른쪽에 없습니다');
  assert.match(rgt, /mbStep\(/, '★ 위·아래가 오른쪽에 없습니다');
  assert.ok(rgt.indexOf('mbReply(') < 0, '★ 답장이 오른쪽에도 있습니다 — 두 벌이 됩니다');
});

test('★ Esc 로도 나갈 수 있다 — 손이 자판에 있을 때 단추를 찾지 않게', () => {
  assert.match(src, /Escape[\s\S]{0,120}mbBack\(\)/,
    '★ Esc 로 목록에 못 돌아갑니다');
});
