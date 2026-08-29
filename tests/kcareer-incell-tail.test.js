/* 「기관명 : 부서명 : 직위 :」 — 직위가 늘 빠지던 것 (2026-08-29 실측)
   까닭: 라벨 뒤에 밑줄도 넉넉한 공백도 없이 «문자열이 끝난다».
   사이 공백이 좁으면 셋 다 빠졌다. 칸 지도가 이 함수를 일꾼으로 쓰므로 먼저 고친다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/kcareer-hwpxfill.js');
const H = require('../hwpx_gen.js');

const tbl = (rows) => H.tablePara(rows, H.cols(rows[0].map(() => 1 / rows[0].length)));
const WHO = { org: '푸른노무법인', dept: '대표', title: '대표노무사',
              phoneHome: '041-556-0035', phoneWork: '041-556-0035' };

test('끝에 있는 라벨에도 값이 들어간다 — 「직위 :」가 문장 끝이어도', () => {
  const r = F.autoFill(tbl([['현 근무처', '기관명 :        부서명 :        직위 :']]), { fields: WHO });
  assert.ok(r.xml.indexOf('대표노무사') > 0, '직위가 빠지면 안 됩니다');
});

test('사이 공백이 좁아도 셋 다 들어간다 — 서식마다 공백 수가 다르다', () => {
  const r = F.autoFill(tbl([['현 근무처', '기관명 : 부서명 : 직위 :']]), { fields: WHO });
  ['푸른노무법인', '대표', '대표노무사'].forEach((v) =>
    assert.ok(r.xml.indexOf(v) > 0, v + ' 이(가) 들어가야 합니다'));
});

test('넣은 값과 다음 라벨이 붙지 않는다 — 「푸른노무법인부서명」이 되면 안 된다', () => {
  const r = F.autoFill(tbl([['현 근무처', '기관명 : 부서명 : 직위 :']]), { fields: WHO });
  assert.doesNotMatch(r.xml, /푸른노무법인부서명/);
});

test('이미 값이 있는 라벨은 덮지 않는다 — 끝 허용이 문을 열어서는 안 된다', () => {
  const r = F.autoFill(tbl([['현 근무처', '기관명 : 한국공인노무사회   직위 :']]), { fields: WHO });
  assert.ok(r.xml.indexOf('한국공인노무사회') > 0, '원래 값이 남아야 합니다');
  assert.equal(r.xml.indexOf('푸른노무법인'), -1, '이미 찬 칸을 덮으면 안 됩니다');
});

test('밑줄 자리는 지금처럼 그대로 채운다 — 고치다 부수지 않았는지', () => {
  const r = F.autoFill(tbl([['전화번호', '자택:_________  직장:_________']]), { fields: WHO });
  assert.ok(r.xml.indexOf('041-556-0035') > 0);
});

test('조각 함수를 내보낸다 — 칸 지도가 같은 자를 쓴다(따로 만들면 어긋난다)', () => {
  ['splitRows', 'splitCells', 'eachTable', 'normLabel'].forEach((n) =>
    assert.equal(typeof F[n], 'function', n + ' 을(를) 내보내야 합니다'));
  const t = tbl([['가', '나']]);
  assert.equal(F.splitRows(t).length, 1);
  assert.equal(F.splitCells(F.splitRows(t)[0]).length, 2);
  assert.equal(F.normLabel('성 명 *'), '성명');
});

test('밑줄은 «값 자리»라 삼켜서 바꾼다 — 남기면 「041-556-0035_______」처럼 줄이 넘친다', () => {
  const r = F.autoFill(tbl([['전화번호', '자택:_________  직장:_________']]), { fields: WHO });
  const txt = (r.xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [])
    .map((x) => x.replace(/<[^>]*>/g, '')).join(' ');
  assert.doesNotMatch(txt, /041-556-0035_/, '값 뒤에 밑줄이 남으면 안 됩니다');
});
