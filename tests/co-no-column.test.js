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

/* ⚠★ 2026-09-05 에 이 검사가 뒤집혔다. 처음에는 「몸통만 그린다」를 못 박았는데,
   대표가 「자문·급여·노조·기금 등의 고유이름도 들어가는 게 좋겠다」로 되돌렸다.
   옆 유형 칸과 겹친다는 것이 내 근거였지만, 유형은 «감출 수 있는» 칸이고
   번호는 전화·메일로 들고 나가 부르는 이름이다 — 번호만으로는 뜻이 없다.
   ★ 뜻을 지우자고 다시 권하지 말 것. 같은 지적을 두 번 받은 자리다. */
test('★★ 표에 머리까지 그린다 — 「자문-10193」 꼴 (번호만 적으면 뜻이 없다)', () => {
  const cells = numberCells();
  assert.ok(cells.length >= 2, '번호 칸을 두 표에서 찾지 못했습니다 (' + cells.length + '개)');
  cells.forEach((cell, i) => {
    /* 그리는 «내용»(마지막 } , 뒤)이 머리까지 붙은 꼴이어야 한다 */
    const shown = cell.slice(cell.lastIndexOf('},') + 2);
    assert.ok(/formatCompanyNumber\(co\)/.test(shown),
      (i + 1) + '번째 번호 칸이 머리 없이 몸통만 그립니다 — 번호만 보면 무슨 업무인지 알 수 없습니다');
  });
});

test('말풍선에도 온번호가 남는다', () => {
  const cells = numberCells();
  cells.forEach((cell, i) => {
    assert.ok(/title:\(window\.PuOntology && PuOntology\.formatCompanyNumber\(co\)\)/.test(cell),
      (i + 1) + '번째 번호 칸 말풍선에 온번호가 없습니다');
  });
});

/* 대표 2026-09-05: 「번호와 업체명 사이 너무 불필요하게 넓다」 —
   폭을 안 잡으면 표가 남는 자리를 이 칸에 몰아준다. */
test('★ 번호 칸은 내용만큼만 차지한다 (폭을 잡아 둔다)', () => {
  ["key:'a1n'", "key:'h1n'"].forEach((k) => {
    const at = bare.indexOf(k);
    assert.ok(at > 0, k + '(번호 머리글)을 찾지 못했습니다');
    const seg = bare.slice(at, at + 200);
    assert.match(seg, /width\s*:\s*'\d+px'/,
      k + ' 에 폭이 없습니다 — 번호와 업체명 사이가 허옇게 벌어집니다');
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
