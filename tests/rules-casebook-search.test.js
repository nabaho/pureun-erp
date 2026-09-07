'use strict';
/* 서고 4단계 — 사례집 검색 (설계서 §5-③ · §3-④ 경로 색인)
   ⚠ 여기는 «화면·Firebase 없음»이다. 무엇을 읽어야 하는지 «정하는» 부분만 본다.

   왜 색인이 필요한가 — 지금 조문 검색(artsBuild)은 보관함 건마다 Firebase 읽기 1회로
   전문을 다 쌓는다. 수백 건이면 무너진다. 그래서 서고는 색인으로 «후보를 좁히고»
   본문은 고른 것만 읽는다.

   ★★ 가장 조심한 것 — 색인 낱말과 검색어의 길이 관계가 «양쪽»이다.
     색인은 본문에 나온 낱말을 «그대로» 열쇠로 쓴다(idxKeysOf: [가-힣]{2,10}, 2번 이상, 상위 60).
       · 색인 낱말이 검색어보다 «길 때»  — 「연차」로 「연차유급휴가」를 찾아야 한다  → 앞머리 훑기
       · 색인 낱말이 검색어보다 «짧을 때» — 「연차유급휴가」로 「연차」를 찾아야 한다  → 앞토막 정확히 찾기
     한 방향만 하면 「되는 것 같은데 안 나온다」가 된다.

   ⚠ 색인은 «좁히는 도구»일 뿐이다. 판정은 본문이 한다 — 그래서 후보를 넉넉히 잡고,
     실제로 맞는지는 읽어 온 글로 다시 견준다(기존 artsSearch 와 같은 방식).

   실행: node --test tests/rules-casebook-search.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

/* ── ① 무엇을 읽을지 정한다 ── */

test('★★ 색인 낱말이 검색어보다 «길 때» — 앞머리로 훑는다', () => {
  const p = CB.idxLookups('연차');
  assert.equal(p.prefix, '연차', '앞머리 훑기의 시작이 검색어여야 합니다');
  assert.ok(p.prefixEnd.startsWith('연차'), '끝은 시작 + 높은 글자여야 합니다: ' + p.prefixEnd);
  assert.ok(p.prefixEnd > p.prefix, '범위가 뒤집혀 있으면 아무것도 안 나옵니다');
});

test('★★ 색인 낱말이 검색어보다 «짧을 때» — 앞토막을 정확히 찾는다', () => {
  const p = CB.idxLookups('연차유급휴가');
  /* 「연차유급휴가」로 검색했는데 색인에는 「연차」만 있을 수 있다 */
  assert.ok(p.exact.indexOf('연차') >= 0, '앞토막 「연차」를 안 찾습니다: ' + p.exact.join(','));
  assert.ok(p.exact.indexOf('연차유급') >= 0, p.exact.join(','));
  assert.ok(p.exact.indexOf('연차유급휴가') < 0,
    '검색어 자체는 앞머리 훑기가 이미 잡습니다 — 두 번 읽을 까닭이 없습니다');
});

test('★ 앞토막은 두 글자부터 — 한 글자는 색인에 없다', () => {
  /* idxKeysOf 가 [가-힣]{2,10} 이라 한 글자 열쇠는 애초에 안 생긴다 */
  assert.deepEqual(CB.idxLookups('연차').exact, [], '두 글자 검색어는 앞토막이 없습니다');
  assert.ok(CB.idxLookups('연차유급휴가').exact.every(w => w.length >= 2));
});

test('★ 읽는 횟수에 바닥이 있다 — 열 번을 넘지 않는다', () => {
  const p = CB.idxLookups('아주긴검색어를열글자넘게');
  assert.ok(1 + p.exact.length <= 10,
    '앞머리 1회 + 앞토막 ' + p.exact.length + '회 = 색인 읽기가 너무 많습니다');
});

test('★ 띄어쓰기는 걷는다 — 기존 조문 검색과 같은 셈', () => {
  /* artsSearch 가 stripWs(질의) 로 «한 토막» 처럼 맞추므로 색인도 같아야 한다 */
  assert.equal(CB.idxLookups('연차 유급 휴가').prefix, '연차유급휴가');
});

test('두 글자보다 짧으면 아예 안 찾는다 — 색인이 없고 후보가 온 저장소가 된다', () => {
  assert.equal(CB.idxLookups('연'), null);
  assert.equal(CB.idxLookups(''), null);
  assert.equal(CB.idxLookups('  '), null);
});

test('한글이 아닌 검색어는 색인으로 못 찾는다 — 그렇다고 말해야 한다', () => {
  /* 색인 낱말이 [가-힣] 뿐이다. 영문·숫자 검색은 색인에 걸릴 것이 없다 */
  assert.equal(CB.idxLookups('abc'), null);
  assert.equal(CB.idxLookups('2026'), null);
});

/* ── ② 색인이 준 것을 후보로 정리한다 ── */

test('★ 색인 열쇠를 사업장·회차로 되돌린다', () => {
  const got = CB.idxRefs({
    연차유급휴가: { 'site_1234__2022': 1, 'site_9999__2019': 1 },
    연차: { 'site_1234__2022': 1 },
  });
  assert.equal(got.length, 2, '같은 회차가 두 낱말에 걸려도 한 번만 세야 합니다');
  const one = got.find(x => x.siteKey === 'site_1234');
  assert.ok(one, JSON.stringify(got));
  assert.equal(one.revId, '2022');
  assert.equal(one.hits, 2, '몇 낱말에 걸렸는지 세면 나중에 줄세우기에 쓸 수 있습니다');
});

test('★ 많이 걸린 회차를 앞에 둔다 — 상한에 걸릴 때 버릴 것을 고르려면', () => {
  const got = CB.idxRefs({
    가나: { 'a__1': 1, 'b__1': 1 },
    다라: { 'b__1': 1 },
    마바: { 'b__1': 1 },
  });
  assert.equal(got[0].siteKey, 'b', '세 낱말에 걸린 b 가 앞이어야 합니다');
});

test('★★ 후보에 상한이 있다 — 없으면 본문 수백 개를 읽어 지금과 같아진다', () => {
  const big = {};
  for (let i = 0; i < 200; i++) big['site_' + i + '__2022'] = 1;
  const got = CB.idxRefs({ 가나: big });
  assert.ok(got.length <= CB.IDX_PICK,
    '후보가 ' + got.length + '개입니다 — 상한(' + CB.IDX_PICK + ')이 안 걸렸습니다');
  assert.ok(CB.IDX_PICK >= 10 && CB.IDX_PICK <= 80,
    '상한이 너무 작으면 못 찾고, 너무 크면 지금처럼 무너집니다: ' + CB.IDX_PICK);
});

test('망가진 열쇠는 조용히 버린다 — 화면이 죽는 것보다 낫다', () => {
  const got = CB.idxRefs({ 가나: { 'nosep': 1, '__2022': 1, 'site_1__': 1, 'ok__2022': 1 } });
  assert.deepEqual(got.map(x => x.siteKey), ['ok']);
});

test('빈 색인·이상한 값이 와도 터지지 않는다', () => {
  assert.deepEqual(CB.idxRefs(null), []);
  assert.deepEqual(CB.idxRefs({}), []);
  assert.deepEqual(CB.idxRefs({ 가나: null }), []);
  assert.deepEqual(CB.idxRefs({ 가나: 7 }), []);
});

test('★ 색인 뿌리 경로가 있다 — 앞머리 훑기는 «낱말 위» 층을 읽어야 한다', () => {
  const root = CB.paths.idxK();
  assert.match(root, /\/idx\/k$/, '낱말 하나가 아니라 낱말들이 모인 층이어야 합니다: ' + root);
  /* 낱말 하나 경로가 그 뿌리 아래여야 한다 — 둘이 어긋나면 조용히 아무것도 안 나온다 */
  assert.ok(CB.paths.idx('연차', 'site_1', '2022').indexOf(root + '/연차/') === 0,
    CB.paths.idx('연차', 'site_1', '2022') + ' 가 ' + root + ' 아래가 아닙니다');
});

/* ── ③ 못 찾는 것을 «말해 준다» ── */

test('★★ 색인의 한계를 문장으로 내놓는다 — 안 적으면 「검색했는데 없네」로 읽힌다', () => {
  const s = CB.searchCaveat({ indexed: 12, picked: 12, capped: false });
  assert.match(s, /2번|두 번/, '「2번 이상 나온 낱말만」이 빠지면 한계를 모릅니다: ' + s);
  assert.match(s, /60|상위/, s);
});

test('★ 상한에 걸렸으면 그것도 말한다 — 조용히 자르면 안 된다', () => {
  const s = CB.searchCaveat({ indexed: 200, picked: 40, capped: true });
  assert.match(s, /200/, '몇 곳이 걸렸는지: ' + s);
  assert.match(s, /40/, '몇 곳만 읽었는지: ' + s);
});

test('한글이 아닌 검색어면 색인을 못 쓴다고 말한다', () => {
  const s = CB.searchCaveat({ noIndex: true });
  assert.match(s, /한글/, s);
});
