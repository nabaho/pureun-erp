/* 막아 둔 그림이 «깨진 그림»으로 보이던 것 (대표 지시 2026-09-05)
   「자료도 제대로 안 나온다」

   ★ 뿌리 — 바깥에서 오는 그림은 일부러 막는다(부르는 순간 보낸 쪽이 언제 열었는지
     알게 되므로). 그런데 막는 방법이 «src 를 지우는» 것이었다. src 없는 <img> 는
     브라우저가 «찢어진 그림표 + alt 글자»로 그린다 — 본문 한가운데 고장 난 네모가
     남는다(대표 화면의 「한국시장조○위원회」 네모가 그것이다).
   ★ 그래서 투명한 1×1 을 넣어 «조용한 빈 자리»로 만든다. 막았다는 말은 위의
     「🖼 … 막았습니다」 줄이 이미 하고 있다.

   지키는 것.
   ① 막은 그림에도 src 가 «있다» — 없으면 깨진 그림표가 뜬다
   ② 넣는 것은 «바깥을 안 부르는» 그림이어야 한다 — 그렇지 않으면 막은 뜻이 없다
   ③ 진짜 주소는 그대로 들고 있다 — 「그림 보기」로 풀 수 있어야 한다
   ④ 막았다는 셈은 그대로 센다 — 안 세면 안내줄이 안 뜬다
   ⑤ 빈 자리에 옅은 테두리만 준다 — 자리는 보이되 시끄럽지 않게 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
/* 그림을 막는 대목만 잘라 본다 — 파일 전체에서 찾으면 딴 자리의 src 가 걸린다.
   ⚠ 그냥 'data-hold' 로 찾으면 «CSS 규칙»이 먼저 걸린다(처음에 그래서 헛돌았다).
     자리를 잡는 자리는 setAttribute 쪽이다. */
const at = bare.indexOf("setAttribute('data-hold'");
if (at < 0) throw new Error('그림을 막는 자리를 못 찾았습니다');
const hold = bare.slice(Math.max(0, at - 700), at + 300);

test('★★ 막은 그림에도 src 가 «있다» — 없으면 깨진 그림표가 본문 한가운데 남는다', () => {
  assert.match(hold, /setAttribute\('src',\s*MB_IMG_BLANK\)/,
    'src 를 비운 채로 둡니다 — 브라우저가 찢어진 그림표와 alt 글자를 그립니다');
  const i = hold.indexOf("setAttribute('src', MB_IMG_BLANK)");
  const j = hold.indexOf("setAttribute('data-hold'");
  assert.ok(i > 0 && j > i, '막았다고 표시만 하고 자리를 안 채웁니다');
});

test('★★ 넣는 그림이 «바깥을 안 부른다» — 부르면 막은 뜻이 없다', () => {
  const m = bare.match(/const MB_IMG_BLANK\s*=\s*'([^']+)'/);
  assert.ok(m, '빈 그림을 정해 둔 자리가 없습니다');
  const v = m[1];
  assert.match(v, /^data:image\/(gif|png);base64,/,
    '빈 자리에 넣는 것이 «바깥 주소»입니다 — 그것을 부르면 언제 열었는지가 새 나갑니다: ' + v);
  /* 진짜로 그림인가 — 글자만 그럴듯하게 적어 두면 그것도 깨진 그림이 된다 */
  const b64 = v.slice(v.indexOf(',') + 1);
  const buf = Buffer.from(b64, 'base64');
  assert.ok(buf.length > 20, '그림이라기엔 너무 짧습니다(' + buf.length + '바이트)');
  assert.equal(buf.slice(0, 3).toString('latin1'), 'GIF', 'GIF 머리글이 아닙니다 — 안 그려집니다');
  assert.ok(buf.length < 200, '빈 자리 하나에 ' + buf.length + '바이트를 씁니다 — 1×1 이면 충분합니다');
});

test('★★ 진짜 주소는 «그대로 들고 있다» — 「그림 보기」로 풀 수 있어야 한다', () => {
  assert.match(hold, /setAttribute\('data-src',\s*safe\)/,
    '막으면서 진짜 주소를 버립니다 — 「그림 보기」를 눌러도 아무 일이 없습니다');
  assert.match(bare, /function mbShowImg\(/, '푸는 자리가 없습니다');
});

test('★★ 막았다는 셈을 그대로 센다 — 안 세면 안내줄이 아예 안 뜬다', () => {
  assert.match(hold, /_mbImgHold\+\+/, '막은 수를 안 셉니다');
  assert.match(bare, /막았습니다/, '막았다는 안내가 없습니다');
});

test('★ 빈 자리에 «옅은 테두리»만 준다 — 자리는 보이되 시끄럽지 않게', () => {
  const css = bare.match(/img\[data-hold\][^}]*\}/);
  assert.ok(css, '막은 그림 자리를 꾸미는 규칙이 없습니다');
  assert.match(css[0], /dashed/, '실선 테두리는 «내용»처럼 읽힙니다');
  assert.ok(!/display:\s*none/.test(css[0]),
    '아예 감춥니다 — 그러면 본문 칸이 무너져 글줄이 어긋납니다');
});
