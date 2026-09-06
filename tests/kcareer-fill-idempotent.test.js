'use strict';
/* 「내 정보로 채우기」를 두 번 눌러도 «같은 결과» (대표 제보 2026-09-06)
   「2중으로 잘못 입력된것 어떻게 삭제 정리하나 계속 반복되지 않고 한번에 처리하고」

   ■ 뿌리
   채우기가 «지금 보고 있는 문서»(_rhDoc)에서 시작했다. 그 문서는 이미 채워진 것이라,
   누를 때마다 채운 위에 또 채웠다. 파일 이름이 그대로 증거였다:
       …지원서류_채움_채움_채움_채움_날인_채움_날인_채움_날인….hwpx

   ■ 고침
   언제나 «원본»(_rhBase)에서 새로 짓는다. 원본 + 고른 값 + 직접 친 값 = 늘 같은 결과.
   PDF 편집에서 똑같은 결함을 하루 먼저 고쳤다(2026-09-05) — 같은 원리다.

   ■ 이 검사가 지키는 것
     ① 채우기가 원본에서 시작한다
     ② 이름에 «_채움»·«_날인»이 쌓이지 않는다
     ③ 채우는 셈 자체가 «두 번 돌려도 같다» — 실제로 두 번 돌려서 견준다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const bare = stripComments(fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8'));
const M = require(path.join(ROOT, 'js', 'kcareer-formmap.js'));
const X = require(path.join(ROOT, 'js', 'kcareer-hwpxfill.js'));

test('★★ 채우기는 «원본»에서 새로 짓는다 — 보고 있는 문서에서 시작하지 않는다', () => {
  const fn = cutFn(bare, 'async function rhFillByMap(');
  assert.ok(fn, 'rhFillByMap 을 못 찾았다');
  assert.match(fn, /_rhBase\s*\|\|\s*_rhDoc/,
    '원본(_rhBase)에서 시작하지 않는다 — 이미 채워진 문서 위에 또 채우면 값이 겹친다');
  assert.ok(!/_rhToHwpx\(_rhDoc\.bytes/.test(fn),
    '보고 있는 문서를 바탕으로 삼는다 — 두 번 누르면 값이 두 번 들어간다');
});

test('★ 이름에 «_채움»·«_날인»이 쌓이지 않는다', () => {
  const fn = cutFn(bare, 'function rhCleanName(');
  assert.ok(fn, 'rhCleanName 이 없다');
  assert.match(fn, /_채움\|_날인/, '쌓인 꼬리를 걷어내지 않는다');
  /* 실제로 돌려 본다 — 규칙을 글자로만 보면 헛돈다 */
  const ctx = {};
  const run = new Function(cutFn(bare, 'function rhCleanName(') + '\nreturn rhCleanName;')();
  assert.equal(run('지원서류.hwpx', '_채움'), '지원서류_채움.hwpx');
  assert.equal(run('지원서류_채움_채움_날인.hwpx', '_채움'), '지원서류_채움.hwpx',
    '쌓인 꼬리를 안 걷어냈다');
  assert.equal(run('지원서류_채움.hwpx', '_채움_날인'), '지원서류_채움_날인.hwpx');
  assert.ok(!/(_채움){2}/.test(run(run('a.hwpx', '_채움'), '_채움')),
    '두 번 불러도 꼬리가 두 번 붙으면 안 된다');
});

/* ── 채우는 셈 자체가 두 번 돌려도 같은가 — 실제로 두 번 돌려 견준다 ── */
const t = (x) => (x ? '<hp:t>' + x + '</hp:t>' : '<hp:t/>');
const tc = (x) => '<hp:tc><hp:subList><hp:p><hp:run charPrIDRef="0">' + t(x) + '</hp:run></hp:p></hp:subList></hp:tc>';
const tr = (cs) => '<hp:tr>' + cs.map(tc).join('') + '</hp:tr>';
const tbl = (rs) => '<hp:tbl>' + rs.map(tr).join('') + '</hp:tbl>';
function 글자(xml) {
  return (xml.match(/<hp:tbl>[\s\S]*?<\/hp:tbl>/g) || []).map((T) =>
    X.splitRows(T).map((r) => X.splitCells(r).map((c) => X.cellText(c)).join('|')).join('//')).join('##');
}
const 나 = {
  fields: { name: '권형하', nameHanja: '權炯夏', birth: '1975.01.07', addr: '충남 천안시 용곡4길 20' },
  edu: [{ period: '1996.03 ~ 1999.02', school: '천안고등학교', major: '인문계' }],
  career: [{ period: '2016.01 ~ 현재', org: '푸른노무법인', title: '대표노무사' }]
};
function 한번(xml) {
  const map = M.guess(M.scan(xml), 나);
  const picks = {}, lists = {};
  map.slots.forEach((s) => { if (s.guess) picks[s.id] = s.guess; });
  map.lists.forEach((l) => { lists[l.id] = l.guess || l.kind; });
  return M.apply(xml, { picks: picks, lists: lists, data: 나 }).xml;
}

test('★★ «원본»에서 두 번 채우면 결과가 같다', () => {
  const 원본 = tbl([['성   명', '[한글]'], ['주   소', '']])
    + tbl([['학력', '기   간', '학교명'], ['', '년  월 ~  년  월', '고등학교']]);
  const 첫번 = 한번(원본);
  const 두번 = 한번(원본);          /* 늘 원본에서 시작한다 */
  assert.equal(글자(두번), 글자(첫번),
    '같은 원본에서 두 번 채웠는데 결과가 다르다 — 채우는 셈이 그때그때 다르다');
  assert.match(글자(첫번), /권형하/, '아예 안 채워졌다');
});

test('★★ 채운 결과에 «또» 채워도 값이 겹치지 않는다 (마지막 방패)', () => {
  /* 이것이 대표가 겪은 증상이다 — 「권형하권형하」·「1975.01.071975.01.07」.
     ⚠ 코드는 이제 원본에서 시작하므로 이 길로 오지 않는다. 그래도 «혹시»
       채운 것에 다시 채우게 되더라도 값이 두 번 박히면 안 된다. */
  const 원본 = tbl([['성   명', '[한글]'], ['주   소', '']]);
  const 한번친 = 한번(원본);
  const 두번친 = 한번(한번친);
  assert.ok(!/권형하권형하/.test(글자(두번친)),
    '값이 두 번 박혔다: ' + 글자(두번친));
  assert.ok(!/(충남 천안시 용곡4길 20){2}/.test(글자(두번친)),
    '주소가 두 번 박혔다: ' + 글자(두번친));
});

test('직접 친 값도 «함께» 다시 얹힌다 — 한 번에 완성된다', () => {
  /* 원본에서 새로 짓기 때문에, 직접 친 값을 따로 다시 넣을 필요가 없어야 한다 */
  const fn = cutFn(bare, 'async function rhFillByMap(');
  assert.match(fn, /_rhVals/,
    '직접 친 값을 안 실으면, 원본에서 새로 지을 때 사람이 친 것이 사라진다');
});
