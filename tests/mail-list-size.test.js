'use strict';
/* 목록 줄 크기 — 대표께서 목업에서 고르신 「다음메일 느낌」 (2026-08-30)
   "메일함을 다음과 같은 글자크기 줄간격등으로 해달라."

   ★ 왜 목업을 거쳤나 — 화면 «사진»만 보고는 못 맞춘다. 사진마다 확대 비율이 달라서
     재어 나온 숫자를 그대로 쓰면 틀린다. 그래서 대표께 다음메일 창과 나란히 놓고
     «같아 보일 때»를 고르시게 했다 (docs/mockups/mail-list-size.html).

   ★ 여기서 못 박는 것
     ① 대표께서 고르신 값 그대로다 — 14px · 40px · 보낸이 160px
     ② 줄 안의 «크기 차례»가 지켜진다 — 본문 > 날짜 > 폴더 딱지
        (하나만 키우면 차례가 어그러져 오히려 읽기 나빠진다)
     ③ 줄 높이가 글자를 담는다 — 너무 좁지도, 헐렁하지도 않게
     ④ 날짜 칸이 «연도까지 붙은 날짜»를 담는다 (25.11.03 09:47)
     ⑤ 좁은 화면(폰) 보낸이 칸도 «함께» 늘었다 — 한쪽만 고치면 폰에서 더 잘린다

   ⚠ ①은 값을 그대로 박는다. 「검사고정-허용」 — 이 값 자체가 대표의 «결정»이라,
     누가 슬쩍 되돌리면 그것이 곧 결정을 뒤집는 것이다. 바꾸려면 대표께 다시 여쭙는다.
     나머지(②③④⑤)는 값이 아니라 «규칙»을 본다 — 다음에 크기를 또 고쳐도 안 깨진다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');   /* ⚠ 주석을 걷고 본다 — 설명이 검사를 통과시키면 안 된다 */

/* 규칙 한 덩이를 글자로 집는다 */
function rule(sel) {
  const i = src.indexOf('\n' + sel + '{');
  assert.ok(i > 0, sel + ' 규칙을 찾지 못했습니다');
  return src.slice(i, src.indexOf('}', i) + 1);
}
function num(sel, prop) {
  const m = rule(sel).match(new RegExp(prop + ':\\s*([\\d.]+)px'));
  assert.ok(m, sel + ' 에 ' + prop + ' 이 없습니다');
  return parseFloat(m[1]);
}

/* ══════ ① 대표께서 고르신 값 ══════ */
test('★★ 대표께서 고르신 「다음메일 느낌」 값 그대로다', () => {
  assert.equal(num('.dm-row', 'font-size'), 14,      /* 검사고정-허용 — 대표 결정(2026-08-30 목업) */
    '★ 줄 글자 크기가 바뀌었습니다 — 대표께서 목업에서 고르신 값입니다(14px). 바꾸려면 다시 여쭙니다');
  assert.equal(num('.dm-row', 'height'), 40,         /* 검사고정-허용 — 같은 결정 */
    '★ 줄 높이가 바뀌었습니다 — 대표께서 고르신 값입니다(40px)');
  assert.equal(num('.dm-row .who', 'width'), 160,    /* 검사고정-허용 — 같은 결정 */
    '★ 보낸이 칸 폭이 바뀌었습니다 — 대표께서 고르신 값입니다(160px)');
});

/* ══════ ② 줄 안의 크기 차례 ══════ */
test('★★ 줄 안의 크기 차례 — 본문 > 날짜 > 폴더 딱지', () => {
  const body = num('.dm-row', 'font-size');
  const date = num('.dm-row .at', 'font-size');
  const box  = num('.dm-row .box', 'font-size');
  assert.ok(date < body, '★ 날짜가 본문만큼 큽니다 (' + date + ' vs ' + body + ') — 곁다리가 앞으로 나옵니다');
  assert.ok(box < date,  '★ 폴더 딱지가 날짜만큼 큽니다 (' + box + ' vs ' + date + ')');
  assert.ok(body - box <= 4,
    '★ 폴더 딱지가 본문보다 너무 작습니다 (' + box + ' vs ' + body + ') — 안 읽힙니다');
});

test('★ 곁다리 글자도 «함께» 올렸다 — 하나만 키우면 차례가 어그러진다', () => {
  /* 예전 값(본문 13 / 날짜 12.5 / 딱지 11 / 미리보기 12)에서 본문만 올리면
     날짜·딱지가 상대적으로 작아져 줄이 헐거워 보인다. */
  const body = num('.dm-row', 'font-size');
  for (const [sel, name] of [['.dm-row .at', '날짜'], ['.dm-row .box', '폴더 딱지'],
                             ['.dm-row .pre', '미리보기'], ['.dm-row .st', '별표']]) {
    const n = num(sel, 'font-size');
    assert.ok(n >= body - 2.5 && n <= body + 2,
      '★ ' + name + '(' + n + 'px)가 본문(' + body + 'px)과 너무 벌어졌습니다');
  }
});

/* ══════ ③ 줄 높이 ══════ */
test('★ 줄 높이가 글자를 담는다 — 좁으면 잘리고, 헐렁하면 한 화면에 몇 통 못 본다', () => {
  const h = num('.dm-row', 'height'), f = num('.dm-row', 'font-size');
  assert.ok(h >= f + 16, '★ 줄이 글자에 비해 좁습니다 (높이 ' + h + ' / 글자 ' + f + ')');
  assert.ok(h <= f * 3.2, '★ 줄이 헐렁합니다 (높이 ' + h + ' / 글자 ' + f + ') — 한 화면에 몇 통 못 봅니다');
});

/* ══════ ④ 날짜 칸 ══════ */
test('★★ 날짜 칸이 «연도까지 붙은 날짜»를 담는다 (25.11.03 09:47)', () => {
  const w = num('.dm-row .at', 'width'), f = num('.dm-row .at', 'font-size');
  /* 「25.11.03 09:47」 = 14글자. 숫자·점은 대체로 글자 크기의 0.55배쯤을 먹는다. */
  assert.ok(w >= f * 7.5,
    '★ 날짜 칸이 좁습니다 (칸 ' + w + 'px / 글자 ' + f + 'px) — 오래된 메일의 날짜가 잘립니다');
});

/* ══════ ⑤ 좁은 화면 ══════ */
test('★★ 좁은 화면(폰) 보낸이 칸도 «함께» 늘었다 — 한쪽만 고치면 폰에서 더 잘린다', () => {
  const wide = num('.dm-row .who', 'width');
  /* ⚠ 같은 조건(max-width:760px)의 덩이가 «여럿»이다 — 첫째만 보면 못 찾는다.
     보낸이 칸을 담은 덩이를 골라서 본다. */
  let narrow = 0;
  for (let i = src.indexOf('@media(max-width:760px){'); i >= 0;
       i = src.indexOf('@media(max-width:760px){', i + 1)) {
    const blk = src.slice(i, src.indexOf('\n}', i) + 2);
    const nm = blk.match(/\.dm-row \.who\{width:\s*([\d.]+)px\}/);
    if (nm) { narrow = parseFloat(nm[1]); break; }
  }
  assert.ok(narrow > 0, '★ 좁은 화면의 보낸이 칸 규칙이 없습니다');
  assert.ok(narrow < wide, '★ 좁은 화면이 넓은 화면보다 넓습니다 (' + narrow + ' vs ' + wide + ')');
  assert.ok(narrow / wide >= 0.55,
    '★ 폰에서 보낸이 칸이 너무 좁습니다 (' + narrow + '/' + wide + ') — 이름이 두 글자만 보입니다');
});
