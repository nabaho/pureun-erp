'use strict';
// 거래내역 표 높이 재기 · 직접 찾아 고르기 — node --test tests/erp-ledger-fit-pick.test.js
//
// 왜: ① 표 높이를 calc(100vh - 330px) 로 못 박았더니 위 도구줄 높이가 그때그때 달라
//        (⏳ 추천 계산 중·자문료 n건·미매칭 n건 이름표가 줄을 늘린다) 아래가 한참 남거나 표가 잘렸다.
//     ② 추천이 열두 건 뜨는데 죄다 같은 금액(220,000)·같은 점수(92%)면 골라 봐야 소용이 없다.
//        후보가 아예 없는 행은 종전에 아무것도 안 보여 손을 놓을 수밖에 없었다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const FL = app.slice(app.indexOf('function FinanceLedger(){'), app.indexOf('function FinanceIncome'));
const POP = FL.slice(FL.indexOf('sugPopK && (function(){'), FL.indexOf('// ── 1-1 입금 상세 팝업'));

/* ── ① 표 높이를 재서 정한다 ── */
test('상자의 화면상 위치를 재어 창 바닥까지 채운다', () => {
  assert.match(FL, /var top = el\.getBoundingClientRect\(\)\.top;/);
  assert.match(FL, /var want = Math\.max\(240, Math\.round\(window\.innerHeight - top - 16\)\);/);
});

test('재는 고리가 끝없이 돌지 않는다', () => {
  // 고침 → 다시 그림 → 고침 … 이 되면 화면이 멈춘다. 8px 안쪽은 그대로 둔다.
  assert.match(FL, /return Math\.abs\(prev - want\) < 8 \? prev : want;/);
});

test('그릴 때마다 다시 잰다 (도구줄 높이가 변한다)', () => {
  assert.match(FL, /useEffect\(function\(\)\{ _ldFit\(\); \}\);/);
});

test('창 크기를 바꾸면 따라가고, 떠날 때 청취기를 걷는다', () => {
  assert.match(FL, /window\.addEventListener\('resize', _ldFit\);/);
  assert.match(FL, /window\.removeEventListener\('resize', _ldFit\);/);
});

test('타이머로 재지 않는다', () => {
  // setInterval 로 재면 느린 타이머 이름표(🐌)에 걸리고 쓸데없이 일을 한다
  const fit = FL.slice(FL.indexOf('var _ldBoxRef = useRef(null);'), FL.indexOf('var _ldBox={overflow'));
  assert.ok(fit.indexOf('setInterval') < 0);
  assert.ok(fit.indexOf('setTimeout') < 0);
});

test('못 쟀을 때를 대비한 높이가 있다', () => {
  assert.match(FL, /maxHeight:\(_ldH \? _ldH\+'px' : 'calc\(100vh - 330px\)'\)/);
  assert.match(FL, /minHeight:'240px'/, '너무 납작해지지 않게');
});

test('maxHeight 로 둔다 (목록이 짧으면 빈 상자가 크게 남는다)', () => {
  const box = FL.slice(FL.indexOf('var _ldBox={overflow'), FL.indexOf('var _ldBox={overflow') + 200);
  assert.ok(box.indexOf("height:(_ldH") < 0 || box.indexOf('maxHeight:(_ldH') >= 0);
});

/* ── ② 직접 찾아 고르기 ── */
test('후보가 아예 없어도 길이 있다', () => {
  // 종전에는 return null 이라 화면에 아무것도 안 나왔다
  assert.match(FL, /🔍 직접 찾아 고르기/);
  assert.ok(FL.indexOf('if(!sugs.length) return null;') < 0, '아무것도 안 보여주면 손을 놓게 된다');
});

test('창에서 미입금 목록 «전체» 를 뒤진다 (추천 안에서만 찾지 않는다)', () => {
  assert.match(POP, /var _rows = _pq\s*\n?\s*\? pending\.filter\(function\(p\)\{/);
  assert.match(POP, /hay\.indexOf\(_pq\)>=0;/);
});

test('업체명·건명·관리번호·담당으로 찾는다', () => {
  assert.match(POP, /\(p\.companyName\|\|''\)\+' '\+\(p\.label\|\|''\)\+' '\s*\n?\s*\+\(\(p\.item&&\(p\.item\.caseNo\|\|p\.item\.no\)\)\|\|''\)\+' '\+_pendStaff\(p\)/);
});

test('추천에 있던 건은 그 점수를 그대로 달고 나온다', () => {
  // 같은 건이 목록에 따라 다른 말을 하면 안 된다
  assert.match(POP, /for\(var i=0;i<_sg\.length;i\+\+\)\{ if\(_sg\[i\]\.cand\.id===p\.id\)\{ _hit=_sg\[i\]; break; \} \}/);
  assert.match(POP, /return _hit \|\| \{ cand:p, score:null, reasons:\['직접 찾음'\] \};/);
});

test('직접 찾아 나온 건에는 점수를 지어내지 않는다', () => {
  assert.match(POP, /\+\(s\.score===null\?'':' · '\+s\.score\+'%'\)/);
});

test('한 번에 너무 많이 그리지 않는다', () => {
  assert.match(POP, /\.slice\(0,200\)/);
});

test('후보가 죄다 같은 금액이면 그렇다고 말해 준다', () => {
  assert.match(POP, /var _amb = _sg\.length>=3 && _sg\.every\(function\(s\)\{/);
  assert.match(POP, /원입니다 — 금액으로는 못 고릅니다/);
});

test('표에서도 미리 알려 준다 (열어보고 나서 알면 늦다)', () => {
  assert.match(FL, /\? ' · 모두 같은 금액' : ''/);
});

test('추천으로 되돌아올 수 있다', () => {
  assert.match(POP, /추천으로 돌아가기/);
  assert.match(POP, /: _sg;/, '찾기말이 없으면 종전 그대로 추천을 보여준다');
});

test('찾은 게 없을 때와 후보가 없을 때를 갈라 말한다', () => {
  assert.match(POP, /_pq \? '찾는 건이 없습니다' : '맞는 후보가 없습니다 — 위에서 이름으로 찾으세요'/);
});

test('창을 열면 바로 칠 수 있다', () => {
  assert.match(POP, /autoFocus:true/);
});

test('여기서 확정하지는 않는다 (돈은 표의 확정 단추로만)', () => {
  // 직접 찾기가 붙었다고 확정 경로가 둘이 되면 안 된다
  assert.ok(POP.indexOf('erpMarkBankRowProcessed') < 0);
  assert.ok(POP.indexOf('saveIncome(') < 0);
  assert.match(POP, /확정은 표의 \[확정\] 단추로 합니다/);
});

test('고른 것은 표와 똑같이 기억한다', () => {
  assert.match(POP, /erpLearnPayerAlias\(_memo, _c\)/);
  assert.match(POP, /if\(inMatch\[sugPopK\] !== pid\)\{/, '같은 것을 다시 골라도 두 번 세지 않는다');
});
