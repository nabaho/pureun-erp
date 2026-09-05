'use strict';
/* 업체관리 「번호」(고유번호) 칸 — 짧게 · 없으면 저절로 감춤 · 끄고 켤 수 있음
   (대표 지시 2026-09-05: 「너무 많이 화면에 나온다 불필요하게 너무 길다」)

   ■ 무엇이 문제였나
     업체 373곳 «전부» 고유번호가 없어 이 칸은 373줄 내내 「—」만 나왔다.
     알려 주는 것 없이 폭만 먹는데, 감추기 등록부에서도 이 칸만 빠져 있어
     «끌 방법이 아예 없었다».

   ■ 세 가지를 못 박는다 (값이 아니라 규칙)
     ① 표에는 «몸통만» 그린다 — 머리(자문·급여)는 바로 오른쪽 유형 칸이 이미 보여 준다.
        ⚠ 번호 설계를 되돌리는 것이 아니다. 머리는 말풍선에 남고 자료·서류는 그대로다
          (대표는 「뜻이 보여야 한다」고 했지, 표에 두 번 쓰라고 한 적은 없다).
     ② 번호가 한 곳도 없으면 칸을 저절로 감춘다 — 주는 날 저절로 다시 나온다.
     ③ 칸을 «지우지» 않고 CSS 로만 감춘다 — 지우면 뒤 칸 자리번호가 밀려
        감추기가 엉뚱한 칸을 감춘다(2026-09-05 에 실제로 났던 버그). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = stripComments(src);

/* 번호 칸을 그리는 자리 — 두 표(전체·사무대행)에 같은 꼴로 있다 */
function numberCells() {
  const out = [];
  const re = /h\('td',\s*\{[^]{0,400}?title:\(window\.PuOntology[^]*?\}\s*,\s*([^]*?)\),/g;
  let m;
  while ((m = re.exec(bare))) out.push(m[0]);
  return out;
}

test('★★ 표에는 몸통만 그린다 — 머리까지 쓰면 유형 칸과 같은 말이 두 번 나온다', () => {
  const cells = numberCells();
  assert.ok(cells.length >= 2, '번호 칸을 두 표에서 찾지 못했습니다 (' + cells.length + '개)');
  cells.forEach((cell, i) => {
    assert.ok(/companyNumberBody\(co\)/.test(cell),
      (i + 1) + '번째 번호 칸이 몸통(companyNumberBody)을 안 그립니다');
    /* 그리는 «내용»에 머리가 붙으면 안 된다. formatCompanyNumber 는 말풍선(title)에만 허용. */
    const shown = cell.slice(cell.lastIndexOf('},') + 2);
    assert.ok(!/formatCompanyNumber/.test(shown),
      (i + 1) + '번째 번호 칸이 화면에 머리까지 그립니다 — 오른쪽 유형 칸과 겹칩니다');
  });
});

test('머리는 사라지지 않는다 — 말풍선에는 「자문-10001」 꼴이 그대로 남는다', () => {
  const cells = numberCells();
  cells.forEach((cell, i) => {
    assert.ok(/title:\(window\.PuOntology && PuOntology\.formatCompanyNumber\(co\)\)/.test(cell),
      (i + 1) + '번째 번호 칸 말풍선에 머리가 없습니다 — 뜻을 볼 길이 사라집니다');
  });
});

test('★★ 번호가 한 곳도 없으면 칸을 저절로 감춘다', () => {
  assert.match(bare, /var coAnyNo = [^\n]*companyNumberBody\(c\)/,
    '「번호가 하나라도 있나」를 세는 곳이 없습니다');
  assert.match(bare, /if\(!coAnyNo[^\n]*coHideIdx\.push\(CO_NO_COL_IDX\)/,
    '번호가 없을 때 번호 칸을 감추는 줄이 없습니다');
});

test('★★ 감추기는 칸을 지우지 않고 CSS 로만 한다 (자리번호가 밀리면 엉뚱한 칸이 감춰진다)', () => {
  const at = bare.indexOf('var coHideCss');
  assert.ok(at > 0, 'coHideCss 를 찾지 못했습니다');
  const seg = bare.slice(at, at + 400);
  assert.match(seg, /nth-child\('\+idx\+'\)/, '감추기가 nth-child CSS 가 아닙니다');
  /* 머리글 배열에서 번호 칸이 «조건부로» 빠지면 안 된다 — 늘 그려져 있어야 자리번호가 안 밀린다 */
  ["key:'a1n'", "key:'h1n'"].forEach((k) => {
    const i = bare.indexOf(k);
    assert.ok(i > 0, k + '(번호 머리글)을 찾지 못했습니다');
    const before = bare.slice(Math.max(0, i - 120), i);
    assert.ok(!/coAnyNo\s*&&\s*$/.test(before.trim()),
      k + ' 가 조건부로 그려집니다 — 칸이 빠지면 뒤 칸 자리번호가 한 칸씩 밀립니다');
  });
});

test('번호 칸도 끄고 켤 수 있다 — 두 등록부 모두에 있고 「간단히」에서 접힌다', () => {
  ['CO_COLS_FULL', 'CO_COLS_SUB'].forEach((name) => {
    const at = bare.indexOf('var ' + name + ' = [');
    assert.ok(at > 0, name + ' 를 찾지 못했습니다');
    const seg = bare.slice(at, bare.indexOf('];', at));
    const m = /\{k:'[a-z]_puNo',label:'번호',idx:(\d+),d:true\}/.exec(seg);
    assert.ok(m, name + ' 에 번호 칸 등록이 없습니다 — 등록이 없으면 끌 방법이 없습니다');
    assert.strictEqual(+m[1], 3, name + ' 의 번호 칸 자리번호가 3이 아닙니다');
  });
});
