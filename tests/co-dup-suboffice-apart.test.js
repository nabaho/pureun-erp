'use strict';
/* 사무대행과 업체관리는 «다른 곳»이다 — 합치기 후보로 올리지 않는다 (대표 지시 2026-08-31)

   중복 업체 정리가 성지정보통신 두 줄을 합치라고 내밀었다 —
     왼쪽: ㈜성지정보통신          312-81-95374    급여   담당 김보람
     오른쪽: (주)성지정보통신(본사) 312-81-95374-0  자문   🏛 사무대행
   대표: 「사무대행과 업체관리는 다른 곳이다 이부분은 구분하고
          추후 사무대행 처리방법 정리해야한다」

   ⚠ 왜 종사업장 막이(coSubNo)로는 못 막나:
     「312-81-95374」 는 열 자리라 종사업장을 '0' 으로 치고,
     「312-81-95374-0」 도 끝자리가 '0' 이다 — 둘 다 «본사업장»이라 같은 번호로 읽힌다.
     막이는 -6 같은 «다른» 사업장을 위한 것이고, 이 경우는 통과한다. 맞는 동작이다.
     갈라야 하는 까닭이 «번호»가 아니라 «쓰임»이기 때문이다.

   이 검사가 못 박는 것 —
     ① 사무대행과 일반이 «섞인» 묶음은 후보에서 뺀다
     ② 둘 다 사무대행이거나 둘 다 일반이면 그대로 합친다 (막는 것은 섞인 것뿐)
     ③ 뺀 수를 알려 준다 — 조용히 사라지면 사람이 제 실수를 찾는다
     ④ 화면이 그 수를 말한다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* ── coDupGroups 를 실제로 돌린다 ── */
let store = {};
const ctx = {
  window: {},
  CO_MERGE_SKIP: '_skip',
  dbGet: (k, d) => (k in store ? store[k] : d),
  CompanyRef: {
    _norm: (s) => String(s || '').replace(/[\s()㈜（）]|\(주\)|주식회사/g, '').toLowerCase(),
    _normBiz: (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(0, 10) : ''; },
  },
  /* 점수·자동등록 판정은 이 검사의 관심사가 아니다 — 가장 단순한 것으로 세운다 */
  coGroupScore: () => ({ score: 1, conflict: false, why: [] }),
  coIsAuto: () => false,
};
vm.createContext(ctx);
vm.runInContext(
  cutFn(src, 'function coSubNo(') + '\n'
  + cutFn(src, 'function coIsSub(') + '\n'
  + cutFn(src, 'function coDupGroups(') + '\n'
  + 'this.groups = coDupGroups; this.isSub = coIsSub; this.subNo = coSubNo;', ctx);
const { groups, isSub, subNo } = ctx;

const CO = (o) => Object.assign({ id: 'x', name: '성지정보통신', bizNo: '312-81-95374',
  status: 'active', createdAt: '2024-01-01' }, o);
const run = (list) => { store = { companies: list, _skip: {} }; return groups(); };

/* ══════ 막이가 왜 안 통했는지부터 못 박는다 ══════ */

test('★ 「312-81-95374」 와 「-0」 은 둘 다 본사업장이다 — 번호로는 못 가른다', () => {
  assert.equal(subNo({ bizNo: '312-81-95374' }), '0');
  assert.equal(subNo({ bizNo: '312-81-95374-0' }), '0',
    '★ 이 둘이 다르게 읽히면, 진짜 같은 사업장이 영영 안 묶입니다');
});

/* ══════ ①② 섞인 것만 뺀다 ══════ */

test('★★ 사무대행과 업체관리가 섞이면 합치기 후보에서 뺀다', () => {
  const out = run([
    CO({ id: 'a', name: '㈜성지정보통신', bizNo: '312-81-95374', typeCode: '급여', managerMain: 'u1' }),
    CO({ id: 'b', name: '(주)성지정보통신(본사)', bizNo: '312-81-95374-0', typeCode: '자문', status: 'suboffice' }),
  ]);
  assert.equal(out.length, 0,
    '★★ 사무대행과 업체관리는 다른 곳입니다 — 합치면 한 줄이 두 곳에 걸칩니다');
  assert.equal(out.subMixed, 1, '★ 뺀 수를 안 세면 화면이 «왜 없는지» 말할 수 없습니다');
});

test('★★ 자문 겸업 표시(isSuboffice)로 붙은 것도 같다', () => {
  /* 사무대행은 전용 등록(status)만 있는 것이 아니다 — 겸업 표시로도 붙는다 */
  const out = run([
    CO({ id: 'a', name: '가나상사' }),
    CO({ id: 'b', name: '가나상사', isSuboffice: true }),
  ]);
  assert.equal(out.length, 0, '★★ 겸업 표시를 안 보면 절반은 그대로 새어 나갑니다');
});

test('★★ 둘 다 사무대행이면 그대로 합친다 — 막는 것은 «섞인 것»뿐', () => {
  const out = run([
    CO({ id: 'a', name: '가나상사', status: 'suboffice' }),
    CO({ id: 'b', name: '가나상사', status: 'suboffice' }),
  ]);
  assert.equal(out.length, 1,
    '★★ 사무대행끼리 겹친 것까지 막으면, 사무대행 쪽 중복을 영영 못 지웁니다');
  assert.equal(out.subMixed, 0);
});

test('★ 둘 다 업체관리면 예전 그대로 합친다', () => {
  const out = run([CO({ id: 'a', name: '가나상사' }), CO({ id: 'b', name: '가나상사' })]);
  assert.equal(out.length, 1, '★ 멀쩡히 되던 것이 막히면 안 됩니다');
});

test('★ 셋 중 하나만 사무대행이어도 그 묶음은 뺀다', () => {
  const out = run([
    CO({ id: 'a', name: '가나상사' }), CO({ id: 'b', name: '가나상사' }),
    CO({ id: 'c', name: '가나상사', status: 'suboffice' }),
  ]);
  assert.equal(out.length, 0,
    '★ 섞인 채로 합치면, 사무대행 한 줄이 업체관리로 빨려 들어갑니다');
});

/* ══════ ③④ 조용히 사라지지 않는다 ══════ */

test('★★ 뺀 수를 화면이 말한다 — 조용히 줄면 사람이 제 실수를 찾는다', () => {
  const at = src.indexOf('groups.subMixed > 0');
  assert.ok(at > 0, '★★ 화면이 뺀 수를 아예 안 봅니다 — 26건이 22건이 되는데 까닭이 없습니다');
  const box = bare(src.slice(at, at + 800));
  assert.match(box, /사무대행과 겹치는/, '★ 무엇이 빠졌는지 안 적으면 알 수 없습니다');
  assert.match(box, /다른 곳/, '★★ «왜» 안 합치는지 안 적으면, 고장으로 읽힙니다');
  /* 아직 안 정한 것은 «안 정했다»고 적는다 — 다음 사람이 마음대로 정하지 않게 */
  assert.match(box, /따로 정하기로 했습니다/,
    '★ 보류를 안 적으면, 다음 사람이 임의로 처리 방식을 만들어 버립니다');
});

test('★ 사무대행끼리 합칠 때 쓰던 이어받기는 «그대로» 둔다', () => {
  /* coSubRoleFill 은 둘 다 사무대행일 때 지점·관리번호를 잇는다 —
     섞인 것을 막는다고 이것까지 없애면, 사무대행끼리 합치기가 반쪽이 된다. */
  assert.ok(src.indexOf('function coSubRoleFill(') > 0,
    '★ 사무대행 값 이어받기를 지우면, 사무대행끼리 합칠 때 지점 번호가 사라집니다');
});
