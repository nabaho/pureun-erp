'use strict';
// 거래내역 틀고정·후보 크게 보기 — node --test tests/erp-ledger-freeze-pop.test.js
//
// 왜: ① 표가 길어 아래로 내려가면 머리행이 사라져 어느 칸인지 알 수 없었다.
//     ② 후보 한 건이 한 줄이라 이름·건명이 잘려, 창을 옆으로 늘려 확인해야 했다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const FL = app.slice(app.indexOf('function FinanceLedger(){'), app.indexOf('function FinanceIncome'));

/* ── ① 머리행 틀고정 ── */
test('머리행이 위에 붙는다', () => {
  assert.match(FL, /var thS=\{[^}]*position:'sticky',top:0,zIndex:3/);
});

test('표만 구르는 상자 안에 있다 (페이지가 구르면 머리행이 밀려 올라간다)', () => {
  // sticky 는 «구르는 상자» 기준이라, 감싼 칸에 높이를 못 박아야 화면에 붙는다.
  // 높이는 공용 도우미(useFillHeight)가 재지만, 못 쟀을 때를 대비한 값이 늘 있어야 한다.
  assert.match(FL, /var _ldBox=\{overflow:'auto',maxHeight:\(_ldFill\.max \|\| 'calc\(100vh - 330px\)'\)/);
  const boxes = FL.match(/h\('div',\{ref:_ldFill\.ref,style:_ldBox\}/g) || [];
  // 개수를 못 박지 않는다 — 표가 늘 때마다 검사가 깨지면 안 된다. 「큰 표는 모두」가 규칙이다.
  assert.ok(boxes.length >= 3, '입금·출금·나이스빌 CMS 표 모두 (지금 ' + boxes.length + '개)');
});

test('긴 표는 모두 옛 감싸개를 쓰지 않는다', () => {
  /* (2026-08-09) 나이스빌 CMS 표를 더했다 — 대표 지시 "캡쳐부분 틀고정해줘".
     그 표만 overflowX:'auto' 라 높이가 없었고, 높이가 없으면 페이지가 구르는 상자가 되어
     sticky 가 아무 일도 못 한다: 도구줄·요약칩·머리줄이 통째로 딸려 올라갔다. */
  [{ re:/style:_ldBox\}[\s\S]{0,4000}?incList\.slice\(0,ldShow\)/,  name:'입금 표' },
   { re:/style:_ldBox\}[\s\S]{0,4000}?expList\.slice\(0,ldShow\)/,  name:'출금 표' },
   { re:/style:_ldBox\}[\s\S]{0,4000}?nbSortTh\('wdate'/,           name:'나이스빌 CMS 표' }].forEach(function(c){
    const seg = c.re.exec(FL);
    assert.ok(seg, c.name + ' 가 _ldBox 안에 있어야 한다');
    assert.ok(seg[0].indexOf("overflowX:'auto'") < 0, c.name + ' — 그대로면 머리행이 안 붙는다');
    assert.ok(seg[0].indexOf("borderCollapse:'collapse'") < 0, c.name + ' — 합치면 붙은 칸의 선이 지워진다');
  });
});

test('머리행 밑줄을 그림자로 그린다 (붙은 칸은 테두리가 지워진다)', () => {
  assert.match(FL, /boxShadow:'0 1px 0 #e2e8f0'/);
  // 테두리를 합치면(collapse) 붙은 칸의 선이 사라지므로 떼어 놓는다.
  // 개수가 아니라 «틀고정한 표 수만큼 있는가» 를 본다.
  const sep = FL.match(/borderCollapse:'separate',borderSpacing:0/g) || [];
  const boxes = FL.match(/h\('div',\{ref:_ldFill\.ref,style:_ldBox\}/g) || [];
  assert.ok(sep.length >= boxes.length, '틀고정한 표는 모두 테두리를 떼어 놓아야 한다');
});

/* ── ② 후보 크게 보기 ── */
test('행마다 크게 보기를 열 수 있다', () => {
  assert.match(FL, /setSugPopK\(row\._k\)/);
  assert.match(FL, /⤢ 크게 보기/);
});

test('팝업이 그 행의 후보를 그대로 쓴다 (다시 계산하지 않는다)', () => {
  const pop = FL.slice(FL.indexOf('sugPopK && (function(){'));
  assert.match(pop, /var _row = incByK\[sugPopK\];/);
  assert.match(pop, /var _sg = incSug\[sugPopK\] \|\| \[\];/);
  assert.ok(pop.indexOf('erpMatchTxnToPending') < 0, '팝업에서 다시 계산하면 안 된다');
});

test('고르면 표와 똑같이 기억하고 반영한다', () => {
  const pop = FL.slice(FL.indexOf('sugPopK && (function(){'));
  assert.match(pop, /setInMatch\(nm\)/);
  assert.match(pop, /erpLearnPayerAlias\(_memo, _c\)/, '적요→업체 학습도 표와 같아야 한다');
  assert.match(pop, /if\(inMatch\[sugPopK\] !== pid\)\{/, '같은 것을 다시 골라도 두 번 세지 않는다');
});

test('고르면 창이 닫히고 찾기말도 지워진다', () => {
  // 찾기말이 남으면 다음에 다른 행을 열었을 때 엉뚱한 목록이 먼저 보인다
  const pop = FL.slice(FL.indexOf('sugPopK && (function(){'));
  assert.match(pop, /setSugPopK\(''\); setSugPopQ\(''\);\s*\}/);
});

test('여기서 확정하지는 않는다 (돈은 표의 확정 단추로만)', () => {
  const pop = FL.slice(FL.indexOf('sugPopK && (function(){'), FL.indexOf('// ── 1-1 입금 상세 팝업'));
  assert.ok(pop.indexOf('erpMarkBankRowProcessed') < 0);
  assert.ok(pop.indexOf('removeRow(') < 0);
  assert.match(pop, /확정은 표의 \[확정\] 단추로 합니다/);
});

test('후보가 없으면 그렇게 말한다', () => {
  const pop = FL.slice(FL.indexOf('sugPopK && (function(){'));
  assert.match(pop, /맞는 후보가 없습니다/);
});
