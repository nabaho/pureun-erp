'use strict';
/* 서고에 «무엇을 올릴지» 가르기 (설계서 §4 결정 2 · §7)

   여기서 정하는 것은 셋이다.
     ① 확인 필요분은 «빼고» 먼저 올린다 — 17건 때문에 325건이 막히면 안 된다
     ② 같은 파일을 두 번 안 올린다 — sha
     ③ 끊긴 것은 «이어» 올린다 — 새 회차를 만들지 않는다

   ③ 이 이 판의 핵심이다. 넷 중 셋을 올리고 브라우저를 닫았을 때 나머지 하나가
   「2022-2」라는 유령 회차로 혼자 앉으면, 서고 목록에 회차가 둘로 보이고 어느 쪽이
   진짜인지 아무도 모른다. 설계서 §7 이 「고아를 만들지 않는다」고 적은 자리다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

function row(o) {
  return Object.assign({ site: '한빛산업', bizno: '1234567890', year: '2022',
    role: 'after', sha: 'aa', name: 'x.hwp', need: false, why: [] }, o);
}

test('★ 확인 필요분은 올릴 목록에 «안 들어간다» — 나머지는 그대로 올라간다', () => {
  const p = CB.uploadPlan([
    row({ sha: 'a1' }),
    row({ sha: 'a2', role: 'daejo' }),
    row({ sha: 'a3', role: null, need: true, why: ['서류종류'] })
  ], {});
  assert.equal(p.need.length, 1);
  assert.equal(p.revs.length, 1);
  assert.equal(p.revs[0].docs.length, 2, '확인 필요 하나가 나머지를 막으면 안 됩니다');
});

test('★ 이미 서고에 있는 파일은 sha 로 건너뛴다 — 같은 폴더를 다시 떨어뜨려도 안전하다', () => {
  const sk = CB.siteKeyOf('1234567890', '한빛산업');
  const st = { existing: {} };
  st.existing[sk] = [{ revId: '2022', year: '2022', shas: ['a1', 'a2'] }];
  const p = CB.uploadPlan([row({ sha: 'a1' }), row({ sha: 'a2', role: 'daejo' })], st);
  assert.equal(p.skip.length, 2);
  assert.equal(p.revs.length, 0, '전부 이미 있으면 새로 만들 회차가 없습니다');
});

test('★★ 끊긴 것을 «이어» 올린다 — 같은 해 회차가 이 묶음을 들고 있으면 그 회차로 간다', () => {
  const sk = CB.siteKeyOf('1234567890', '한빛산업');
  const st = { existing: {} };
  st.existing[sk] = [{ revId: '2022', year: '2022', shas: ['a1'] }];
  const p = CB.uploadPlan([
    row({ sha: 'a1' }),                       /* 이미 올라간 것 */
    row({ sha: 'a9', role: 'daejo' })         /* 끊겨서 못 올라간 것 */
  ], st);
  assert.equal(p.skip.length, 1);
  assert.equal(p.revs.length, 1);
  assert.equal(p.revs[0].revId, '2022', '유령 회차 2022-2 를 만들면 안 됩니다');
  assert.equal(p.revs[0].isNew, false);
});

test('겹치는 파일이 하나도 없으면 «새 회차»다 — 같은 해라도 2022-2', () => {
  const sk = CB.siteKeyOf('1234567890', '한빛산업');
  const st = { existing: {} };
  st.existing[sk] = [{ revId: '2022', year: '2022', shas: ['zz'] }];
  const p = CB.uploadPlan([row({ sha: 'a9' })], st);
  assert.equal(p.revs[0].revId, '2022-2');
  assert.equal(p.revs[0].isNew, true);
});

test('★ 같은 사업장·같은 해의 서류 여러 벌은 «한 회차»로 모인다', () => {
  const p = CB.uploadPlan([
    row({ sha: 'a1', role: 'before' }), row({ sha: 'a2', role: 'after' }),
    row({ sha: 'a3', role: 'daejo' }),  row({ sha: 'a4', role: 'report' })
  ], {});
  assert.equal(p.revs.length, 1);
  assert.equal(p.revs[0].docs.length, 4);
});

test('★ 같은 회차에 같은 역할이 둘이면 «확인 필요»다 — 어느 쪽이 진짜인지 못 고른다', () => {
  const p = CB.uploadPlan([row({ sha: 'a1' }), row({ sha: 'a2' })], {});
  assert.equal(p.revs[0].docs.length, 1);
  assert.equal(p.need.length, 1);
  assert.ok(p.need[0].why.join(' ').indexOf('둘') >= 0, '왜 넘겼는지 적어야 합니다');
});

test('사업장·연도가 다르면 회차가 갈린다', () => {
  const p = CB.uploadPlan([
    row({ sha: 'a1' }), row({ sha: 'a2', year: '2023' }),
    row({ sha: 'a3', site: '다른상사', bizno: '9998887770' })
  ], {});
  assert.equal(p.revs.length, 3);
});

test('★ 쓰는 순서를 함께 돌려준다 — 무거운 것부터, 색인이 마지막', () => {
  const p = CB.uploadPlan([row({})], {});
  assert.deepEqual(Array.from(p.order), ['file', 'text', 'rev', 'index']);
});

/* ── 색인 낱말 ─────────────────────────────────────────────────── */

test('★ 색인은 «개정본만» 만든다 — 옛 문구가 검색에 섞이면 안 된다', () => {
  const t = '연차유급휴가 연차유급휴가 육아휴직 육아휴직';
  assert.ok(CB.idxKeysOf('after', t).length > 0);
  assert.equal(CB.idxKeysOf('before', t).length, 0);
  assert.equal(CB.idxKeysOf('daejo', t).length, 0);
});

test('한 번만 나온 낱말은 색인에 안 넣는다 — 오탈자가 검색어가 되면 안 된다', () => {
  const k = CB.idxKeysOf('after', '연차휴가 연차휴가 오타낱말');
  assert.ok(k.indexOf('연차휴가') >= 0);
  assert.ok(k.indexOf('오타낱말') < 0);
});

test('★ 색인 낱말에 «한도»가 있다 — 전문을 통째로 색인하면 색인이 본문보다 무거워진다', () => {
  let t = '';
  for (let i = 0; i < 300; i++) t += ('낱' + i + '가나 ').repeat(3);
  const k = CB.idxKeysOf('after', t);
  assert.ok(k.length <= CB.IDX_MAX);
  assert.ok(CB.IDX_MAX > 0);
});

test('아무 데나 나오는 흔한 말은 색인에서 뺀다 — 전부 걸리면 검색이 아니다', () => {
  const k = CB.idxKeysOf('after', '취업규칙 취업규칙 근로자 근로자 연차휴가 연차휴가');
  assert.ok(k.indexOf('취업규칙') < 0);
  assert.ok(k.indexOf('근로자') < 0);
  assert.ok(k.indexOf('연차휴가') >= 0);
});
