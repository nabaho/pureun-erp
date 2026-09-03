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

   ■ 다시 좁혔다 — 카드는 «제목이 있을 때»만 (김동현 제보 2026-09-03)
   "일괄 선택하여 담당자 지정 시 사진이 깨지게 되며"
   업체 이름을 한 번에 달자 그 순간 스물여덟 장이 모두 26px 띠로 쪼그라들었다.
   ⚠ 카드가 사진을 접는 근거는 「제목이 작은 미리보기보다 많이 알려 준다」였다.
     **업체 이름은 그 근거가 못 된다** — 무슨 서류인지 하나도 안 알려 주면서
     사진만 가린다. 「글자가 하나라도」는 그래서 너무 넓은 그물이었다.

   ⚠ 이 검사는 **조건문을 글자 그대로 박아 두고 있었다**(`&& l1`). 그래서 규칙을
     좁히자 기능이 멀쩡한데도 깨졌다 — CLAUDE.md 가 경계하는 그 모양이다.
     이제 «조건이 무엇을 보는가»를 본다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

/* 카드로 갈라지는 그 줄 — 조건식만 떼어 온다(글자 그대로 박지 않으려고) */
function cardBranch() {
  const fn = cutFn(app, 'function renderGrid(');
  /* ⚠ 조건식 안에 괄호가 들어 있다(docTitle(it)) — [^)]* 로 끊으면 못 찾는다 */
  const m = fn.match(/if \(it\.meta\.kind === 'doc' && (.+?)\) \{/);
  assert.ok(m, '★ 서류를 카드로 가르는 줄을 못 찾았습니다');
  return { fn: fn, cond: m[1], at: fn.indexOf(m[0]) };
}

test('★★ 카드로 뒤집는 것은 «제목이 있을 때»만 — 업체 이름은 사진을 가릴 근거가 못 된다', () => {
  const b = cardBranch();
  assert.match(b.cond, /docTitle\(it\)/,
    '★★ 조건이 제목을 안 봅니다.\n' +
    '  업체 이름만 달아도 카드로 뒤집히면, 업체를 한 번에 지정하는 순간\n' +
    '  고른 사진이 통째로 26px 띠가 됩니다 — 김동현 제보 2026-09-03 이 그것입니다.');
  assert.ok(!/\btt\b/.test(b.cond),
    '★ tt 로 물으면 «제목순으로 볼 때»는 tt 가 일부러 비어 있어\n' +
    '  그 화면에서만 카드가 통째로 사라집니다. docTitle(it) 로 물어야 합니다.');
});

test('★★ 카드로 안 가는 길에는 «사진이 꽉 찬다» — 그러지 않으면 하얀 칸이다', () => {
  const b = cardBranch();
  const other = b.fn.slice(b.at).slice(b.fn.slice(b.at).indexOf('} else {'));
  assert.match(other, /html \+= '<div class="cell'/, '★ 일반 칸으로 안 갑니다');
  assert.match(other, /\bimg \+ tag\b/, '★★ 그 길에 그림이 안 실리면 여전히 하얗습니다');
});

test('★ 어느 쪽으로 가든 「서류」 딱지는 붙는다 — 무엇인지는 늘 알아야 한다', () => {
  const b = cardBranch();
  const other = b.fn.slice(b.at).slice(b.fn.slice(b.at).indexOf('} else {'));
  assert.match(other, /\+ tag \+/, '★ 일반 칸으로 갈 때 딱지가 빠집니다');
});

test('★ 업체·설명은 사진을 가리지 않고 «밑줄 칩»으로 그대로 뜬다', () => {
  const b = cardBranch();
  const other = b.fn.slice(b.at).slice(b.fn.slice(b.at).indexOf('} else {'));
  assert.match(other, /\bcap\b/,
    '★ 카드로 안 가면서 업체까지 안 그리면, 업체를 달아 둔 것이 칸에서 사라집니다.');
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
