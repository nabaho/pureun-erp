'use strict';
/* 🩺 하얀 카드 — 서류가 «사진도 글자도» 없이 비어 있던 것 (대표 보고 2026-08-31)

   "사진이 모두 안 나오는데 이 부분 어떻게 개선할 수 없나"

   ■ 불러오기 문제가 아니었다
   2026-08-16 에 서류 칸을 「종이 카드」로 뒤집으면서 사진을 **26px 띠**로 줄였다.
   까닭은 「작은 미리보기로는 어차피 안 읽히니 그 자리를 제목에 주자」였다.
   그런데 **제목은 판독이 끝나야 생긴다.** 방금 올린 서류는 제목도 업체도 없어서
   사진도 글자도 없는 **통째로 하얀 칸**이 됐다(대표 화면 8월 30일 5장).

   ■ 고친 규칙 (대표 결정 2026-08-31, 안 ㉮)
   글자가 **하나라도 있으면** 종이 카드, **둘 다 없으면** 사진을 꽉 채운다.
   판독이 끝나 제목이 생기면 저절로 카드로 바뀐다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

test('★★ 글자가 «하나도 없으면» 종이 카드로 안 간다 — 그때가 하얀 칸이다', () => {
  const fn = cutFn(app, 'function renderGrid(');
  assert.match(fn, /const l1 = tt \|\| capTxt;/, '★ 보여 줄 글자를 안 셉니다');
  assert.match(fn, /if \(it\.meta\.kind === 'doc' && l1\)/,
    '★★ 글자가 없어도 종이 카드로 갑니다 — 사진도 글자도 없는 하얀 칸이 됩니다');
});

test('★★ 글자가 없을 때 가는 길에는 «사진이 꽉 찬다»', () => {
  const fn = cutFn(app, 'function renderGrid(');
  /* else 쪽(일반 칸)은 그림을 그대로 싣는다 — 서류도 그 길로 간다 */
  const el = fn.slice(fn.indexOf("if (it.meta.kind === 'doc' && l1)"));
  const other = el.slice(el.indexOf('} else {'));
  assert.match(other, /html \+= '<div class="cell'/, '★ 일반 칸으로 안 갑니다');
  assert.match(other, /\bimg \+ tag\b/, '★★ 그 길에 그림이 안 실리면 여전히 하얗습니다');
});

test('★ 어느 쪽으로 가든 「서류」 딱지는 붙는다 — 무엇인지는 늘 알아야 한다', () => {
  const fn = cutFn(app, 'function renderGrid(');
  const el = fn.slice(fn.indexOf("if (it.meta.kind === 'doc' && l1)"));
  const other = el.slice(el.indexOf('} else {'));
  assert.match(other, /\+ tag \+/, '★ 일반 칸으로 갈 때 딱지가 빠집니다');
});

test('★★ 26px 띠는 «글자가 있는 카드»에만 남는다 — 그 카드는 글자가 주인공이다', () => {
  assert.match(app, /#grid \.cell\.doc \.strip\{height:26px/,
    '띠 규칙이 사라졌습니다 — 글자 있는 서류 카드는 그대로 두기로 했습니다');
});

/* ══════ 옛 자리 읽기 — 사람마다 한 번씩 묻던 것 ══════ */

test('★★ 옛 자리는 «한 해에 한 번만» 읽는다 — 모두 한 곳인데 아홉 번 읽고 있었다', () => {
  const fn = cutFn(store, 'function listYear(');
  assert.match(fn, /legacyYear\(year\)/,
    '★★ 사람마다 옛 자리를 또 읽습니다 — 「전체 근로자」면 같은 것을 아홉 번 받습니다');
  assert.ok(fn.indexOf("legacyRoot('items')") < 0, '★ 읽는 자리가 두 곳이면 한쪽만 고쳐집니다');

  const memo = cutFn(store, 'function legacyYear(');
  assert.match(memo, /_legacyYear\[k\]/, '★ 들고 있지 않으면 매번 다시 묻습니다');
  assert.match(memo, /catch\(function \(\) \{ return \{\}; \}\)/,
    '★★ 옛 자리를 못 읽는다고 목록 전체가 실패하면 안 됩니다');
});

test('★ 옛 자리를 «지우지는 않는다» — 남은 사진이 있으면 사라져 보인다', () => {
  const memo = cutFn(store, 'function legacyYear(');
  assert.match(memo, /legacyRoot\('items'\)/,
    '★★ 옛 자리를 아예 안 읽으면, 남아 있는 옛 사진이 통째로 사라져 보입니다\n' +
    '  (2026-08-03 에 실제로 겪은 사고입니다)');
});
