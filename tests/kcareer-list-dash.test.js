/* 경력관리 — 목록 «줄 안»의 「-」는 빈 자리다 (대표 지시 2026-09-06 「니가 고쳐라」)

   ■ 무엇이 문제였나 (대표 화면 실측 2026-09-06)
     이력서 2쪽 학력 표의 첫 줄이 이렇게 생겼다:
         [년  월 ~  년  월 | 고등학교 | - | ---- | -]
     「----」(넉 자)는 자리표로 인정되는데 「-」(한 자)는 아니어서, 목록 구역이
     «머리줄 다음에서 끊겼다». 그 결과:
         학력 표 → end:1, blank:0     ← 화면의 「학력 표 · 빈 0줄」
     학력 칸들이 목록이 아니라 «낱개 자리 14개»로 흩어졌고, 낱개라 짐작할 열쇠가
     없어 전부 「— 비워 둠 —」이 되었다. 그래서 「내 정보로 채우기」가
     「채운 칸이 없습니다」로 끝났다 — 대표가 「계속 실패한다」고 하신 것이 이것이다.

   ■ ⚠ 그런데 「-」를 그냥 자리표로 만들면 안 된다
     낱개 칸의 「-」는 «해당없음»이라는 대답이다(2026-09-06 다른 작업에서 일부러 막아 둔 것).
     그것을 덮으면 사람이 적어 둔 답이 조용히 사라진다.
     그래서 «목록 줄 안»에서만 빈 것으로 본다. 두 뜻을 X.isRowBlank 하나가 가른다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/kcareer-formmap.js');
const X = require('../js/kcareer-hwpxfill.js');
const H = require('../hwpx_gen.js');

function tbl(rows) { return H.tablePara(rows, H.cols(rows[0].map(() => 1 / rows[0].length))); }
const 학력표 = tbl([
  ['기 간', '학 교 명', '전 공', '소재지', '학 위'],
  ['년  월 ~  년  월', '고등학교', '-', '----', '-'],
  ['년  월 ~  년  월', '대학교', '', '', ''],
  ['년  월 ~  년  월', '대학원', '', '', '']
]);
const data = { fields: {}, edu: [
  { period: '1990.03~1993.02', school: '천안고등학교', major: '', degree: '졸업' },
  { period: '1993.03~1997.02', school: '영남대학교', major: '법학', degree: '학사' }
] };

test('★★ 목록 줄의 「-」 때문에 구역이 끊기지 않는다', () => {
  const m = M.scan(학력표);
  assert.equal(m.lists.length, 1);
  assert.equal(m.lists[0].kind, 'edu');
  assert.equal(m.lists[0].blank, 3, '★ 여기가 0 이면 화면에 「빈 0줄」이 뜹니다');
  assert.equal(m.slots.length, 0, '★ 낱개로 흩어지면 「채운 칸이 없습니다」가 됩니다');
});

test('★★ 낱개 칸의 「-」는 여전히 «해당없음»이다 — 덮으면 안 된다', () => {
  /* ⚠ 이 빗장을 풀지 말 것. 사람이 「없음」이라고 적어 둔 답이 조용히 사라진다. */
  assert.equal(X.isPlaceholder('-'), false);
  assert.equal(X.isPlaceholder('－'), false);
  /* 넉 자짜리 밑줄·붙임표는 예전부터 자리표다 */
  assert.equal(X.isPlaceholder('----'), true);
});

test('★★ 목록 줄 판정은 «한 곳»에서 — 두 곳에 두면 어긋난다', () => {
  /* 칸 지도(formmap)와 채움(hwpxfill)이 서로 다르게 보면
     「지도엔 빈 줄인데 안 채워지는」 어긋남이 생긴다. */
  assert.equal(typeof X.isRowBlank, 'function', 'hwpxfill 이 자를 내놓아야 합니다');
  assert.equal(X.isRowBlank('-'), true);
  assert.equal(X.isRowBlank('----'), true);
  assert.equal(X.isRowBlank(''), true);
  assert.equal(X.isRowBlank('년  월 ~  년  월'), true);
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'js', 'kcareer-formmap.js'), 'utf8');
  assert.match(src, /X\.isRowBlank/, '★ formmap 이 같은 자를 써야 합니다');
});

test('★★ 뜻 있는 값이 든 줄은 «빈 줄»이 아니다 — 남의 값을 덮으면 안 된다', () => {
  assert.equal(X.isRowBlank('영남대학교'), false);
  assert.equal(X.isRowBlank('1999 ~ 2003'), false);
  const m = M.scan(tbl([
    ['기 간', '학 교 명', '전 공', '학 위'],
    ['1993.03~1997.02', '영남대학교', '법학', '학사'],
    ['', '', '', '']
  ]));
  assert.equal(m.lists[0].blank, 0, '★ 이미 적힌 줄을 빈 줄로 세면 덮어씁니다');
});

test('★★ 끝까지 — 「이대로 채우기」 길로 값이 실제로 들어간다', () => {
  const m = M.guess(M.scan(학력표), data);
  const lists = {}; m.lists.forEach((l) => { lists[l.id] = l.guess; });
  const r = M.apply(학력표, { picks: {}, lists: lists, data: data });
  assert.deepEqual(r.failed, []);
  ['천안고등학교', '영남대학교', '법학', '졸업', '학사'].forEach((w) =>
    assert.ok(r.xml.indexOf(w) >= 0, w + ' 이 안 들어갔습니다'));
});

test('★★ 값이 없는 칸의 「-」는 그대로 둔다 — 고등학교에는 전공이 없다', () => {
  const m = M.guess(M.scan(학력표), data);
  const lists = {}; m.lists.forEach((l) => { lists[l.id] = l.guess; });
  const r = M.apply(학력표, { picks: {}, lists: lists, data: data });
  assert.match(r.xml, /<hp:t[^>]*>-<\/hp:t>/, '★ 「해당없음」이 지워지면 안 됩니다');
});

test('★★ 문서 뼈대를 부수지 않는다', () => {
  const m = M.guess(M.scan(학력표), data);
  const lists = {}; m.lists.forEach((l) => { lists[l.id] = l.guess; });
  const r = M.apply(학력표, { picks: {}, lists: lists, data: data });
  ['<hp:tc', '</hp:tc>', '<hp:tr', '<hp:t>', '</hp:t>'].forEach((tag) =>
    assert.equal(r.xml.split(tag).length - 1, 학력표.split(tag).length - 1,
      tag + ' 개수가 달라졌습니다'));
});
