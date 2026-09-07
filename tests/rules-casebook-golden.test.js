'use strict';
/* 골든셋 — 실제 파일명 표로 판정을 통째로 견준다 (spec §9)

   사무소 이름 규칙이 바뀌면 fixtures 의 표만 고친다. 판정 함수 쪽 검사를
   하나하나 손대지 않아도 되게, 「무엇이 정답인가」를 한 파일에 모아 둔다.

   ⚠ role 이 null 인 줄은 «일부러» 확인 필요로 두는 것들이다. 여기에 억지로
     답을 채우려고 판정을 넓히면 수백 건이 틀린 자리에 들어간다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'casebook-filenames.json'), 'utf8'));
const nameOf = (p) => p.split('/').pop();

test('★ 골든셋의 서류종류가 전부 맞는다', () => {
  const bad = [];
  for (const c of G.cases) {
    const got = CB.roleOf(nameOf(c.path));
    if (got !== c.role) bad.push(c.path + ' → ' + JSON.stringify(got) + ' (기대 ' + JSON.stringify(c.role) + ')');
  }
  assert.deepEqual(bad, []);
});

test('★ 골든셋의 사업자번호가 전부 맞는다', () => {
  const bad = [];
  for (const c of G.cases) {
    const got = CB.siteOf({ path: c.path, name: nameOf(c.path) }, G.erp).bizno;
    if (got !== c.bizno) bad.push(c.path + ' → ' + JSON.stringify(got) + ' (기대 ' + JSON.stringify(c.bizno) + ')');
  }
  assert.deepEqual(bad, []);
});

test('★ 확인 필요로 둔 줄이 실제로 있다 — 표가 너그러워지면 여기서 걸린다', () => {
  const n = G.cases.filter(c => c.role === null).length;
  assert.ok(n >= 3, '확인 필요 예시가 ' + n + '건뿐입니다 — 판정을 넓히다 예시를 지운 것이 아닌지 보세요');
});

test('한 사업장의 같은 해 여러 서류가 한 회차로 모인다', () => {
  const same = G.cases.filter(c => c.path.startsWith('한빛산업/2022/'));
  assert.equal(same.length, 6);
  const rev = CB.revIdOf('2022', []);
  assert.equal(rev, '2022', '같은 해 서류들은 회차 하나에 담깁니다');
});

test('골든셋이 여섯 역할을 모두 덮는다', () => {
  const roles = new Set(G.cases.map(c => c.role).filter(Boolean));
  for (const r of ['before', 'after', 'daejo', 'report', 'opinion', 'consent']) {
    assert.ok(roles.has(r), r + ' 예시가 없습니다');
  }
});
