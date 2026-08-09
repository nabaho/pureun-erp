'use strict';
// 거래내역 «묶어서 처리» — node --test tests/erp-ledger-group-match.test.js
//
// 왜: 비즈사업비처럼 한 건 값이 통장에 두 번 나뉘어 들어오면, 행마다 따로 보는 한
//     어느 후보와도 안 맞는다. 그래서 2,100,000 옆에 2,090,000 같은 «애매한 금액»이 뜨고
//     210,000 옆에는 220,000 처럼 전혀 맞지 않는 금액이 뜬다. 묶으면 합계가 맞는다.
//
// 설계: 새 창을 만들지 않고 지금의 ⊞ 나눠담기 창을 넓혔다.
//       통장 1행 = 나누기(종전 그대로), N행 = 합치기. 개념이 하나로 유지된다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const FL = app.slice(app.indexOf('function FinanceLedger(){'), app.indexOf('function FinanceIncome'));
const MODAL = FL.slice(FL.indexOf('spOpen && spRow && (function(){'), FL.indexOf('// ── CMS 일괄이체 매칭 모달'));
// 배분 고리만 — 뒤의 「초과분 기타입금」은 종전부터 있던 딴 길이라 넣지 않는다
const CONFIRM = MODAL.slice(MODAL.indexOf('var _pool=rowsIn.map('),
                            MODAL.indexOf("if(diff<-1100 && spGm==='other')"));

/* ── 창을 여는 길 ── */
test('통장 행을 두 개 이상 골라야 단추가 나온다', () => {
  // (2026-08-09) 단추 글자를 「묶어 한 항목에 확정」으로 바꿨다 (무엇이 되는지가 글자에 있어야 한다)
  assert.match(FL, /⊞ 묶어 한 항목에 확정 '\+_gk\.length\+'행/);
  assert.match(FL, /if\(_gk\.length<2\) return null;/, '한 행이면 종전 ⊞ 나눠담기가 맞다');
});

test('짝이 겹친 행(_dup)은 묶지 않는다', () => {
  assert.match(FL, /var _gk=Object\.keys\(incChk\)\.filter\(function\(k\)\{ var r=incByK\[k\]; return r && !r\._dup; \}\);/);
});

test('이미 있는 체크박스를 그대로 쓴다 (박스를 새로 만들지 않았다)', () => {
  const _from = FL.indexOf('var _gk=Object.keys(incChk)');
  const btn = FL.slice(_from, FL.indexOf('h(\'button\',{onClick:function(){setConfHistOpen', _from));
  assert.ok(btn.length > 0, '묶기 단추를 못 찾았다');
  assert.ok(btn.indexOf('useState') < 0, '고르는 상태를 새로 두면 줄 체크와 어긋난다');
});

test('단추가 합계를 미리 보여준다', () => {
  assert.match(FL, /var _gsum=_grows\.reduce\(function\(s,r\)\{ return s\+\(r\.amount\|\|0\); \},0\);/);
});

test('행 하나짜리 ⊞ 나눠담기는 묶음을 푼다', () => {
  // 묶어서 열었다가 한 행짜리를 열면, 안 푸는 한 지난 묶음이 그대로 따라온다
  assert.match(FL, /setSpQ\(''\); setSpRows\(null\); setSpRow\(row\); setSpOpen\(row\._k\);/);
});

/* ── 창 안의 셈 ── */
test('한 행이면 예전과 똑같다', () => {
  assert.match(MODAL, /var rowsIn=\(spRows&&spRows\.length\)\?spRows:\[row\];/);
  assert.match(MODAL, /var manyIn=rowsIn\.length>1;/);
});

test('차액은 통장 «합계» 기준으로 센다', () => {
  assert.match(MODAL, /var amountIn=rowsIn\.reduce\(function\(s,r\)\{return s\+\(r\.amount\|\|0\);\},0\);/);
  assert.match(MODAL, /var diff=total-amountIn;/);
  assert.ok(MODAL.indexOf('total-row.amount') < 0, '한 행 금액으로 재면 묶었을 때 늘 안 맞는다');
});

test('후보 정렬·차액 표시도 합계 기준이다', () => {
  assert.match(MODAL, /var da=Math\.abs\(\(a\.expect\|\|a\.amount\)-amountIn\);/);
  assert.match(MODAL, /var _dd=ea-amountIn;/);
  assert.ok(!/[^.]\brow\.amount\b/.test(MODAL.replace(/slot\.row\./g, 'slotrow.')),
    '창 안에 한 행 금액이 남아 있으면 안 된다');
});

test('묶은 행 중 하나라도 현장클리닉 적요면 클리닉 건을 위로 올린다', () => {
  assert.match(MODAL, /var _clinic = rowsIn\.some\(function\(r\)\{ return erpIsClinicPayer\(r\.memo\|\|r\.note\|\|''\); \}\);/);
});

test('무엇을 묶었는지 창에 그대로 보여준다', () => {
  // 합계만 보이면 어느 행을 묶었는지 알 수 없어 되돌릴 수도 없다
  assert.match(MODAL, /manyIn\s*\n?\s*\? h\('div',\{style:\{marginTop:'8px'/);
  assert.match(MODAL, /rowsIn\.map\(function\(r,_i\)\{/);
});

/* ── 돈이 움직이는 자리 ── */
test('통장 행을 앞에서부터 헐어 채운다', () => {
  assert.match(CONFIRM, /var _pool=rowsIn\.map\(function\(r\)\{return \{row:r,left:\(r\.amount\|\|0\)\};\}\);/);
  assert.match(CONFIRM, /var take=Math\.min\(slot\.left,need\);/);
  assert.match(CONFIRM, /slot\.left-=take; need-=take; got\+=take;/);
});

test('한 건이 두 행에 걸치면 기록도 둘로 나뉜다', () => {
  // 실제로 두 번 들어온 돈이므로 통장 행마다 따로 남겨야 대사가 맞는다
  assert.match(CONFIRM, /saveIncome\(Object\.assign\(\{\},slot\.row,\{amount:take\}\),p,/);
});

test('다 채우지 못한 조각만 일부입금으로 남긴다', () => {
  // 조각 하나만 보고 재면, 두 조각으로 완납한 건도 계속 «덜 받음»으로 남는다
  assert.match(CONFIRM, /\(got\+take\)<ea\?\{partial:true\}:\{\}/);
});

test('적요→업체 학습은 그 돈이 나온 행으로 한다', () => {
  assert.match(CONFIRM, /erpLearnPayerAlias\(slot\.row\.memo\|\|slot\.row\.note\|\|'',p\)/);
});

test('한 푼도 못 채운 건은 성공으로 세지 않는다', () => {
  assert.match(CONFIRM, /if\(bad\|\|!got\) ng\+\+; else ok\+\+;/);
});

test('묶은 통장 행을 하나도 빠짐없이 처리 표시하고 뺀다', () => {
  // 하나라도 남으면 다음에 또 후보로 떠서 두 번 반영할 위험이 있다
  assert.match(MODAL, /rowsIn\.forEach\(function\(r\)\{\s*\n\s*if\(ok\) erpMarkBankRowProcessed\(r,'income',_tag\);\s*\n\s*removeRow\(r\._k,'inc'\);/);
});

test('처리한 행의 체크는 풀어 준다', () => {
  assert.match(MODAL, /if\(manyIn\)\{ var _nc=Object\.assign\(\{\},incChk\); rowsIn\.forEach\(function\(r\)\{delete _nc\[r\._k\];\}\); setIncChk\(_nc\); \}/);
});

test('수수료 차액은 날짜가 있는 통장 행에 붙인다', () => {
  assert.match(CONFIRM, /var _feeRow=\(_pool\.filter\(function\(s\)\{return s\.left>0;\}\)\[0\]\|\|_pool\[0\]\)\.row;/);
});

test('확정 전에 무엇을 하는지 묻는다', () => {
  assert.match(MODAL, /통장 '\+rowsIn\.length\+'행 합계 '\+amountIn\.toLocaleString\(\)\+'원을 '/);
  assert.match(MODAL, /if\(!\(await popConfirm\(msg\)\)\) return;/);
});

test('창을 닫으면 묶음도 푼다', () => {
  assert.match(MODAL, /function closeModal\(\)\{setSpOpen\(null\);setSpRow\(null\);setSpRows\(null\);/);
});

/* ── 지켜야 할 것 ── */
test('종전 나눠담기 길이 그대로 남아 있다', () => {
  // (2026-08-09) 나눠담기는 이제 줄을 펼쳤을 때 손잡이 줄에 있다
  assert.match(FL, /style:_expBtn\},'⊞ 나눠담기'\)/);
  assert.match(FL, /setSpRow\(row\); setSpOpen\(row\._k\);/);
  assert.match(MODAL, /'↔️ 나눠담기 · '\+amountIn\.toLocaleString\(\)\+'원 — 좌우 대조'/);
});

test('저장 경로를 새로 만들지 않았다', () => {
  // 돈이 들어가는 길이 둘이 되면 한쪽만 고쳐지는 사고가 난다
  assert.ok(CONFIRM.indexOf("dbUpsert('finance_income'") < 0, '배분은 saveIncome 만 거쳐야 한다');
  assert.equal((CONFIRM.match(/saveIncome\(/g) || []).length, 1, '부르는 자리도 한 곳');
  // 창 전체에서 finance_income 을 직접 쓰는 곳은 종전의 「초과분 기타입금」 한 곳뿐이어야 한다
  assert.equal((MODAL.match(/dbUpsert\('finance_income'/g) || []).length, 1);
  assert.match(MODAL, /kind:'기타입금'/);
});
