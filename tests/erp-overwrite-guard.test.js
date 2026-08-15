'use strict';
// 덮어쓰기 방어가 그대로 있는가 — node --test tests/erp-overwrite-guard.test.js
//
// 2026-08-15 감사 결과를 못박아 둔다.
// dbSet 은 여러 겹으로 자료를 지킨다. 그 겹이 하나라도 빠지면 예전 사고가 되살아난다.
// ★ 핵심: 「모든 항목에 id 가 있는 배열」만 트랜잭션으로 «병합»된다.
//   id 가 없으면 통째로 덮어써서, 그 사이 남이 넣은 줄이 사라진다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const dbSet = (function(){
  const i = app.indexOf('function dbSet(k, v){');
  let d = 0, j = i;
  for(;;j++){ if(app[j] === '{') d++; else if(app[j] === '}'){ d--; if(!d){ j++; break; } } }
  return app.slice(i, j);
})();

/* ── 겹겹의 방어가 그대로 있나 ── */
test('초기 동기화 끝나기 전에는 서버에 쓰지 않는다', () => {
  // 새 기기의 «옛 localStorage» 가 서버를 과거로 되돌리던 길
  assert.match(dbSet, /if\(!_fbSynced\)\{/);
  assert.match(dbSet, /초기 동기화 완료 전 — '\+k\+' 서버 쓰기 보류/);
});

test('있던 것이 0건이 되면 서버 푸시를 막는다', () => {
  assert.match(dbSet, /if\(Array\.isArray\(v\) && v\.length === 0 && Array\.isArray\(prev\) && prev\.length > 0\)\{/);
});

test('절반 이하로 급감하면 막는다 (일부러면 erpAllowBulk)', () => {
  assert.match(dbSet, /prev\.length >= 10 && v\.length < prev\.length \* 0\.5/);
  assert.match(dbSet, /window\._bulkDeleteIntent/);
});

test('서버가 나보다 훨씬 많으면 «옛 자료»로 보고 막는다', () => {
  assert.match(dbSet, /srvN >= 10 && v\.length < srvN \* 0\.5/);
});

test('서버 상태를 못 확인하면 보류한다 (확인 불가 = 덮어쓸 권리 아님)', () => {
  assert.match(dbSet, /if\(attempt < 1\)\{ setTimeout\(function\(\)\{ _pushWithSrvCheck\(attempt\+1\); \}, 800\); return; \}/);
  assert.match(dbSet, /서버 상태 확인 실패 — 푸시 보류/);
});

test('★ id 있는 배열은 트랜잭션으로 병합한다 (통째 덮어쓰기 금지)', () => {
  assert.match(dbSet, /_srvArr\.every\(function\(x\)\{ return x && x\.id; \}\)/);
  assert.match(dbSet, /fbDb\.ref\('data\/'\+k\)\.transaction\(function\(cur\)\{/);
  // 병합 안에서도 0건·급감을 다시 본다 (읽기~쓰기 사이 상황이 바뀔 수 있다)
  assert.match(dbSet, /if\(merged\.length === 0 && curArr\.length > 0\)\{ _guardMsg = '0건'; return; \}/);
});

test('묶음표(객체)도 통째로 덮지 않고 바뀐 열쇠만 얹는다', () => {
  assert.match(dbSet, /erpObjIsMap\(v\)/);
  assert.match(dbSet, /erpObjMerge\(cur && cur\.v, _md\)/);
});

test('실패하면 meta 를 되돌리고 다시 보낼 것으로 표시한다', () => {
  assert.match(dbSet, /var _metaRollback = function\(\)/);
  assert.match(dbSet, /var _markPending = function\(\)/);
});

test('비밀번호가 기본값으로 되돌려지면 막는다', () => {
  assert.match(dbSet, /if\(k==='user_accounts' && Array\.isArray\(v\) && Array\.isArray\(prev\)\)\{/);
  assert.match(dbSet, /비번이 기본값으로 되돌려짐 — Firebase 푸시 차단/);
});

/* ── 새로 id 없는 배열이 생기면 걸린다 ── */
test('★ 업무 자료 배열은 모든 항목에 id 가 있어야 한다', () => {
  /* 감사(2026-08-15) 때 동기화되는 배열 51개를 훑었다.
     id 가 없어 병합을 못 타는 것은 아래뿐이고, 그럴 «까닭»이 있는 것들이다.
     여기 없는 새 배열이 id 없이 들어오면 이 검사가 걸린다 — 그때 id 를 붙일지 판단할 것. */
  const 예외 = [
    // 성질상 id 를 못 붙인다 — 달 이름만 든 배열 ['2026-06', …]
    'locked_payroll_months', 'locked_expense_months', 'locked_contract_months',
    'locked_income_months', 'locked_irregular_months', 'locked_attend_months',
    // 설정표 — 대표 혼자 고치고, 통째로 바꾸는 것이 정상이다
    'holidays', 'pay_items', 'biz_case_types', 'biz_company_types',
    // 기록·결과 — 다시 만들면 된다
    'backup_history', 'error_log', 'payroll_audit_log', 'integrity_results',
  ];
  // 연차대장은 2026-08-15 에 id 를 붙였다 — 예외에서 빠져 있어야 한다
  assert.ok(예외.indexOf('leave_ledger') < 0);
  assert.match(app, /function leaveLedgerWithIds\(rows\)\{/);
  assert.match(app, /'ll-' \+ String\(r\.name==null\?'':r\.name\) \+ '\|' \+ String\(r\.year==null\?'':r\.year\)/);
});

test('겹치는 열쇠를 만들지 않는다 (dbSet 이 중복 id 를 지운다)', () => {
  // ⚠ 같은 id 를 두 줄에 주면 dbSet 의 중복제거가 한 줄을 «지운다» — 자료가 사라진다
  assert.match(dbSet, /console\.warn\('\[데이터보호\] ' \+ k \+ ': 중복 id '/);
  assert.match(app, /var id = n \? \(base \+ '#' \+ \(n\+1\)\) : base;/);
});

/* ── 화면 쪽 ── */
test('★ 낡은 배열을 통째로 되쓰는 화면이 없다 (연차대장 사례)', () => {
  const tab = app.slice(app.indexOf('function LeaveLedgerTab(){'), app.indexOf('function numInput(r, field){'));
  assert.ok(tab.indexOf('function persist(next){ setLedger(next); dbSet(\'leave_ledger\', next); }') < 0,
    '들고 있던 것을 그대로 되쓰면 그 사이 남이 넣은 줄이 사라진다');
  assert.match(tab, /var cur = leaveLedgerWithIds\(dbGet\('leave_ledger', \[\]\)\)\.rows;/);
});
