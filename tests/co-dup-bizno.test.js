'use strict';
/* 사업자번호가 같으면 이름이 달라도 중복으로 본다 (대표 결정 2026-08-27)
   실행: node --test tests/*.test.js

   ── 무슨 일이 있었나 ────────────────────────────────────────
   중복 정리는 **이름으로만** 묶고 있었다. 그래서 사무대행 명단을 가져올 때
   같은 사업장이 다른 이름으로 한 줄 더 생긴 것을 **한 묶음도 못 잡았다** —
   실제 자료에서 25묶음이었다.
     「해찬솔에프쓰리」 ↔ 「해찬솔F3」
     「청아미즈산부인과」 ↔ 「청아미즈산부인과의원」
     「주식회사씨지아이」 ↔ 「주식회사씨지아이(CGI)」
   그중 둘은 **살아 있는 쪽에 담당이 없고 담당 붙은 쪽이 닫혀 있어**,
   그 사업장 자료가 어느 쪽으로도 못 가고 있었다.

   ⚠ 종사업장번호(사업자번호 뒤 한 자리)가 다르면 **다른 사업장**이다.
   합치면 두 사업장 자료가 한 곳에 섞인다 — 실제로 더존앤테크·성지정보통신이
   그런 사이였다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

function cut(name) {
  const m = ERP.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* 업체 명단을 갈아 끼워 가며 돌린다 — 실제 화면과 같은 함수를 그대로 쓴다 */
function run(cos, skip) {
  const sandbox = { console, JSON, Object, String, Number, Array, Math, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'var CO_MERGE_SKIP = "co_merge_skip";',
    'var _COS = ' + JSON.stringify(cos) + ';',
    'var _SKIP = ' + JSON.stringify(skip || {}) + ';',
    'function dbGet(k, d){ return k === "companies" ? _COS : (k === CO_MERGE_SKIP ? _SKIP : d); }',
    'function coIsAuto(c){ return !!(c && c.auto); }',
    'function coHead(a){ return String(a||"").slice(0, 10); }',
    ERP.match(/var CompanyRef = \{[\s\S]*?\n\};/)[0],
    cut('coGroupScore'), cut('coSubNo'), cut('coDupGroups'),
    'globalThis.__out = coDupGroups();'
  ].join('\n'), { filename: 'dup.js' }).runInContext(sandbox);
  return sandbox.__out;
}

const HAECHAN = [
  { id: 'a', name: '해찬솔에프쓰리', bizNo: '172-11-01009', status: 'closed', managerMain: 'A-003', createdAt: '2020-01-01' },
  { id: 'b', name: '해찬솔F3', bizNo: '172-11-01009-0', status: 'active', managerMain: '', createdAt: '2026-06-01' }
];

test('★ 이름이 달라도 사업자번호가 같으면 잡는다 — 여태 한 묶음도 못 잡았다', () => {
  const out = run(HAECHAN);
  assert.equal(out.length, 1, '못 잡았습니다');
  assert.equal(out[0].list.length, 2);
  assert.ok(out[0].why.some(w => /사업자번호가 같음/.test(w)), '왜 묶였는지 안 적었습니다');
});

test('★ 꼬리가 없는 것과 -0 은 같은 본사업장이다', () => {
  assert.equal(run(HAECHAN).length, 1);
});

test('★ 종사업장번호가 다르면 안 묶는다 — 합치면 두 사업장 자료가 섞인다', () => {
  const out = run([
    { id: 'a', name: '더존앤테크', bizNo: '312-81-83145', status: 'active', managerMain: 'P-007' },
    { id: 'b', name: '더존앤테크(일괄)', bizNo: '312-81-83145-6', status: 'suboffice', managerMain: '' }
  ]);
  assert.equal(out.length, 0, '본사업장과 다른 사업장을 합치려 합니다');
});

test('본사업장 둘 + 다른 사업장 하나면, 본사업장 둘만 묶는다', () => {
  const out = run([
    { id: 'a', name: '성지정보통신', bizNo: '312-81-95374', status: 'active', managerMain: 'A-003' },
    { id: 'b', name: '성지정보통신(본사)', bizNo: '312-81-95374-0', status: 'suboffice', managerMain: '' },
    { id: 'c', name: '성지정보통신(현장)', bizNo: '312-81-95374-6', status: 'suboffice', managerMain: '' }
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].list.map(c => c.id).sort().join(','), 'a,b');
});

/* ══════ 어느 쪽을 남기나 ══════ */

test('★ 살아 있는 쪽을 남긴다 — 닫힌 업체로 합치면 사업장이 사라진다', () => {
  const out = run(HAECHAN);
  assert.equal(out[0].keepId, 'b', '닫힌 「해찬솔에프쓰리」로 합치려 합니다');
});

test('★ 둘 다 살아 있으면 담당이 있는 쪽을 남긴다', () => {
  const out = run([
    { id: 'a', name: '가나', bizNo: '111-11-11111', status: 'active', managerMain: '' },
    { id: 'b', name: '가나다', bizNo: '111-11-11111-0', status: 'active', managerMain: 'A-001' }
  ]);
  assert.equal(out[0].keepId, 'b');
});

/* ══════ 예전 것을 안 건드린다 ══════ */

test('★ 이름으로 잡던 것은 그대로 잡는다', () => {
  const out = run([
    { id: 'a', name: '㈜가나', bizNo: '', status: 'active' },
    { id: 'b', name: '주식회사 가나', bizNo: '', status: 'active' }
  ]);
  assert.equal(out.length, 1);
});

test('★ 이름으로도 번호로도 걸리면 한 번만 나온다 — 두 줄이면 같은 것을 두 번 합친다', () => {
  const out = run([
    { id: 'a', name: '가나', bizNo: '111-11-11111', status: 'active' },
    { id: 'b', name: '가나', bizNo: '111-11-11111-0', status: 'active' }
  ]);
  assert.equal(out.length, 1);
});

test('★ 「이건 아니다」로 넘겨 둔 이름 묶음은 되살아나지 않는다', () => {
  /* 열쇠가 바뀌면 넘겨 둔 것이 전부 되살아난다 — 예전 열쇠 그대로여야 한다 */
  const cos = [
    { id: 'a', name: '㈜가나', bizNo: '', status: 'active' },
    { id: 'b', name: '주식회사 가나', bizNo: '', status: 'active' }
  ];
  const key = run(cos)[0].key;
  assert.match(key, /^가나\|a\|b$/, '이름 묶음의 열쇠가 바뀌었습니다: ' + key);
  assert.equal(run(cos, { [key]: 1 }).length, 0, '넘겨 둔 것이 되살아났습니다');
});

test('사업자번호 묶음도 넘겨 둘 수 있다', () => {
  const key = run(HAECHAN)[0].key;
  assert.match(key, /^biz:/);
  assert.equal(run(HAECHAN, { [key]: 1 }).length, 0);
});

test('사업자번호가 없는 업체는 번호로 안 묶는다', () => {
  const out = run([
    { id: 'a', name: '가', bizNo: '', status: 'active' },
    { id: 'b', name: '나', bizNo: '', status: 'active' }
  ]);
  assert.equal(out.length, 0);
});
