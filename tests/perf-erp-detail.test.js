const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const work = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');
function grab(name) {
  const at = work.indexOf('function ' + name);
  assert.ok(at >= 0, name + ' 를 찾지 못했습니다.');
  const to = work.indexOf('\nfunction ', at + 5);
  return work.slice(at, to > at ? to : at + 4000);
}

test('성과급 줄은 푸른이알피 원본과 같은 열쇠로 업무를 찾는다', () => {
  /* 성과급 사본에는 어디서 온 돈인지가 이미 담겨 있고(source·sourceId),
     업무관리 항목도 같은 열쇠(ref.type|ref.id)로 이알피를 가리킨다 — 그대로 맞물린다. */
  assert.match(grab('pcWorkOf'), /x\.source\+'\|'\+String\(x\.sourceId\)/);
  assert.match(grab('pcWorkIndex'), /it\.ref\.type\+'\|'\+String\(it\.ref\.id\)/);
  /* ★ 못 찾아도 아무 일 없어야 한다 — 업무관리에 아직 안 들여온 건이 있다 */
  assert.match(grab('pcWorkOf'), /if\(!x \|\| !x\.source \|\| !x\.sourceId\) return null;/);
});

test('업무가 바뀌면 이은 색인을 다시 만든다', () => {
  /* 안 지우면 새로 들여온 업무가 성과급 줄에 영영 안 붙는다 */
  const at = work.indexOf("fbDb.ref(NS+'/items').on('value'");
  const fn = work.slice(at, at + 400);
  assert.match(fn, /_pcWorkIdx=null;/);
});

test('성과 «당사자»(주담당·부담당)를 함께 보여 준다', () => {
  const fn = grab('pcPeople');
  assert.match(fn, /mgr_main/);
  assert.match(fn, /mgr_subs/);
  assert.match(work, /함께한 사람/, '펼친 자리에 당사자 줄이 없습니다.');
});

test('접힌 줄은 한 줄로 — 갈래말은 펼친 자리로 내렸다', () => {
  const fn = grab('pcRowHTML');
  /* ★ 폰에서 「6/24 (주)비에스부여공장 · 기타용역비 잔금 · 개인」이 두 줄로 접히던 것이
     이 화면이 정신없던 첫째 까닭이었다(대표 지시 2026-08-20). */
  const head = fn.slice(fn.indexOf('pcToggleRow'), fn.indexOf('if(open)'));
  assert.match(head, /text-overflow:ellipsis;white-space:nowrap/,
    '★ 회사 이름이 접히면 줄이 두 줄이 됩니다.');
  assert.doesNotMatch(head, /it\.kind\|\|it\.source/,
    '★ 갈래말이 접힌 줄에 남아 있으면 다시 두 줄이 됩니다.');
  /* 역할(주/부/개인)은 한눈에 봐야 하므로 접힌 줄에 딱지로 남긴다 */
  assert.match(head, /esc\(it\.role\)/);
});

test('되풀이되는 안내는 한 번만 — 까닭은 그대로 둔다', () => {
  /* 「줄을 누르면 펼쳐집니다」를 달마다 적으면 같은 말이 넉 줄이 된다. */
  assert.match(grab('pcMonthHTML'), /e\._first\?' · 줄을 누르면/);
  assert.match(work, /e\._first=\(i===0\)/);
  /* ⚠ 「없는 달」의 까닭 둘은 줄이면서도 지우지 않는다 — 하나만 적으면 절반은 거짓말이다.
     (perf-my-months.test.js 가 그 규칙을 따로 지킨다) */
  const n = grab('pcNoneHTML');
  assert.match(n, /붙은 건이 없었거나/);
  assert.match(n, /안 내보냈습니다/);
});
