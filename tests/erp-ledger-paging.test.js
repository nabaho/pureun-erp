'use strict';
// 거래내역이 한 번에 그리는 행 수를 줄였는지 — node --test tests/erp-ledger-paging.test.js
//
// 왜: 통장 506행 × 후보 12개를 한꺼번에 그리면 그리기만 800ms 를 넘는다.
// 추천 계산을 캐시해도(#90) 다시 그릴 때마다 이 비용은 그대로라, 30초
// 하트비트마다 화면이 멈췄다(대표님 콘솔: 7:44:51 부터 30초 간격 ~850ms).
// 위에서부터 80행만 그리고 나머지는 [더 보기]로 잇는다.
//
// ⚠ 무서운 되돌아감은 «자료까지 잘라 버리는» 것이다 — 합계·미처리 건수·
//   자동 매칭·자동 정리가 80행만 보게 되면 돈 계산이 틀린다. 그래서
//   «화면만 자르고 계산은 전체» 를 하나씩 못박는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const FL = app.slice(app.indexOf('function FinanceLedger(){'), app.indexOf('function FinanceIncome'));

test('입금 표는 그릴 때만 자른다', () => {
  assert.match(FL, /h\('tbody',null,incList\.slice\(0,ldShow\)\.map\(/);
});

test('출금 표도 같은 방식', () => {
  assert.match(FL, /h\('tbody',null,expList\.slice\(0,ldShow\)\.map\(/);
});

test('합계·건수는 전체로 계산한다 (화면만 잘랐지 자료를 자른 게 아니다)', () => {
  assert.match(FL, /var incSum = _sumAmt\(incList\);/);
  assert.match(FL, /var expSum = _sumAmt\(expList\);/);
  // 합계 줄의 건수도 전체 길이를 쓴다
  assert.match(FL, /incList\.length\+'건'/);
});

test('추천·자동정리 계산도 전체(incAll)로 돈다 — 잘린 목록이 아니다', () => {
  assert.match(FL, /erpSugSig\(incAll, pending/);
  // 자동정리 관문 반복도 incAll
  assert.match(FL, /if\(_sug\) incAll\.forEach\(/);
  assert.ok(!/erpSugSig\(incList/.test(FL), '잘린 목록으로 계산하면 안 된다');
});

test('달·탭·숨기기를 바꾸면 처음(80행)부터 다시 센다', () => {
  assert.match(FL, /useEffect\(function\(\)\{ setLdShow\(80\); \}, \[incMon, ldTab, hideDup\]\)/);
});

test('더 보기는 200행씩 잇고, 남은 건수를 보여 준다', () => {
  assert.match(FL, /setLdShow\(ldShow\+200\)/);
  assert.match(FL, /나머지 '\+\(incList\.length-ldShow\)\.toLocaleString\(\)\+'건 더 보기/);
  assert.match(FL, /나머지 '\+\(expList\.length-ldShow\)\.toLocaleString\(\)\+'건 더 보기/);
});

test('모두 펼치기도 있다 (다 봐야 할 때 길을 막지 않는다)', () => {
  assert.match(FL, /setLdShow\(incList\.length\)/);
  assert.match(FL, /setLdShow\(expList\.length\)/);
});

test('80행 이하면 더 보기 줄 자체가 없다', () => {
  assert.match(FL, /incList\.length>ldShow && h\('tr'/);
  assert.match(FL, /expList\.length>ldShow && h\('tr'/);
});

test('더 보기 줄이 표의 칸을 다 덮는다 (밀리면 줄이 어긋난다)', () => {
  /* (2026-08-09) 입금 표는 다섯 칸(체크·신호등·입금·짝·처리), 출금 표는 그대로 여섯 칸이다.
     칸 수를 못 박기보다 «각 표의 머리 칸 수와 더보기 줄의 colSpan 이 같은가» 를 본다. */
  const rows = FL.match(/colSpan:(\d+),style:\{padding:'8px',textAlign:'center'/g) || [];
  assert.equal(rows.length, 2, '입금·출금 각각 하나');
  /* (2026-08-09) 입금 표를 열 칸으로 나눴다(체크·번호·신호등·금액·날짜·적요·업체·현황·담당·처리).
     출금 표는 여섯 칸 그대로다. 칸 수를 바깥에서 못 박기보다, 더보기 줄의 colSpan 이
     «그 표의 머리 칸 수와 같은가» 를 본다 — 어긋나면 줄이 밀린다. */
  // 더보기 줄마다 «바로 앞에 있는 표 머리» 를 찾아 그 칸 수와 맞는지 본다
  const spans = [];
  let at = 0;
  rows.forEach(r => {
    const iRow = FL.indexOf(r, at);
    at = iRow + r.length;
    const iHead = FL.lastIndexOf("h('thead',null,h('tr',null,", iRow);
    assert.ok(iHead > 0, '더보기 줄 앞에 표 머리가 없다');
    const head = FL.slice(iHead, FL.indexOf("h('tbody'", iHead));
    /* (2026-08-09) 거를 수 있는 열은 colFilterTh/nbFilterTh 가 머리칸을 만든다 —
       h('th' 만 세면 그 칸들이 빠져 colSpan 과 어긋난 것처럼 보인다. 둘 다 센다. */
    const th = (head.match(/h\('th'/g) || []).length
             + (head.match(/(?:col|nb)FilterTh\(/g) || []).length;
    const span = parseInt(/colSpan:(\d+)/.exec(r)[1], 10);
    assert.equal(span, th, '표 머리 ' + th + '칸인데 더보기 줄은 ' + span + '칸이다');
    spans.push(span);
  });
  assert.ok(spans.indexOf(10) >= 0, '입금 표는 열 칸이 되었다');
  assert.ok(spans.indexOf(6) >= 0, '출금 표는 여섯 칸 그대로다');
});
