'use strict';
/* 퇴직정산 머리 — 다섯 덩이를 두 줄로 (2026-09-05 대표 지시)

   ■ 무엇이 문제였나
   표가 나오기까지 세로로 다섯 덩이를 지났다 —
   KPI 상자 · 안내 띠(3줄) · 탭 · 확대축소(전용 줄) · 엑셀 드롭존(2줄 상자).
   화면 위 절반을 머리가 먹었다.

   ■ 못 박는 것 — 「몇 px」이 아니라 「무엇이 한 줄에 있는가」이다
     ① 숫자·안내·확대축소가 «한 줄»에 있다
     ② 탭과 엑셀 가져오기가 «한 줄»에 있다
     ③ 한 번 읽으면 되는 글(자동적립 안내·엑셀 양식)은 접혀 있다 — 올리면 나온다
     ④ 줄이면서 «잃으면 안 되는 것» — 미가입 빨강 · 끌어다 놓기 · 네 숫자 전부
   글자 크기·색 코드·여백은 박지 않는다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
/* 화면 전체를 뒤지면 다른 화면의 글자에 걸려 통과해 버린다 — 이 컴포넌트만 본다 */
const FN = cutFn(stripComments(src), 'function RetirementSettlement(');

/* ★ 「가까이 있다」로는 부족하다 — 줄을 도로 갈라놓아도 글자 사이 거리는 그대로다.
     그래서 «괄호 깊이»를 세어 두 글자가 정말 같은 줄에 있는지 본다.
     (2026-09-05: 거리만 보던 검사가 되돌림 검사에서 넷이나 빠져나갔다) */
function depthAt(i) {
  let d = 0;
  for (let n = 0; n < i; n++) {
    const c = FN[n];
    if (c === '(') d++;
    else if (c === ')') d--;
  }
  return d;
}

/* 화면의 «맨 위 덩이»가 놓이는 깊이 — 그 깊이의 자식 하나가 곧 한 줄이다 */
const PAGE_AT = FN.indexOf("h('div', { className:'page' },");
assert.ok(PAGE_AT > 0, '퇴직정산 화면의 뿌리를 찾지 못했습니다');
const PAGE_DEPTH = depthAt(PAGE_AT) + 1;

/* a 와 b 가 같은 줄(맨 위 덩이 하나) 안에 있는가 —
   사이에서 깊이가 맨 위로 돌아오면 둘은 다른 줄이다. */
function sameRow(a, b) {
  const i = FN.indexOf(a);
  const j = FN.indexOf(b);
  assert.ok(i >= 0, '「' + a + '」 를 찾지 못했습니다');
  assert.ok(j >= 0, '「' + b + '」 를 찾지 못했습니다');
  const lo = Math.min(i, j), hi = Math.max(i, j);
  let d = depthAt(lo);
  for (let n = lo; n < hi; n++) {
    const c = FN[n];
    if (c === '(') d++;
    else if (c === ')') { d--; if (d <= PAGE_DEPTH) return false; }   // 줄이 닫혔다
  }
  return true;
}

test('① 숫자 넷·안내·확대축소가 한 줄에 있다', () => {
  ['🏦 DC', '🏛️ DB', '⚠️ 미가입', '💰 적립금'].forEach((k) => {
    assert.ok(FN.indexOf(k) >= 0, '숫자 「' + k + '」 가 사라졌습니다 — 줄이는 것이지 지우는 것이 아닙니다');
  });
  assert.ok(sameRow('🏦 DC', '💡 자동 적립 안내'), '안내가 숫자와 같은 줄에 없습니다');
  assert.ok(sameRow('🏦 DC', 'zoomControl(retZoom'),
    '확대축소가 숫자와 같은 줄에 없습니다 — 자기만의 줄을 다시 차지했습니다');
  assert.strictEqual((FN.match(/zoomControl\(retZoom/g) || []).length, 1,
    '확대축소가 두 군데 그려집니다 — 줄이 다시 늘어납니다');
});

test('② 탭과 엑셀 가져오기가 한 줄에 있다', () => {
  assert.ok(sameRow('💰 적립금 현황', '📥 적립금 엑셀'),
    '엑셀 가져오기가 탭과 같은 줄에 없습니다');
  /* 네 탭은 그대로 — 가장 많이 쓰는 것이라 줄이지 않았다.
     ★ 이름표는 다른 곳(그 탭의 제목)에도 나오므로 «탭 목록»에서 찾는다 */
  [['balance', '💰 적립금 현황'], ['monthly', '📅 월별 누계'],
   ['calc', '🧮 퇴직금 계산'], ['settle', '💼 퇴사자 정산']].forEach((t) => {
    assert.ok(FN.indexOf("{ v:'" + t[0] + "'") >= 0, '탭 「' + t[1] + '」 가 목록에서 사라졌습니다');
  });
});

test('③ 한 번 읽으면 되는 글은 접혀 있다 (올리면 나온다)', () => {
  /* ★ 「title:」 앞에 경계를 둔다 — 안 두면 xtitle·mytitle 도 통과한다 */
  assert.ok(/[\s{,]title:'DC 가입자는 월별급여 일괄확정/.test(FN),
    '자동적립 안내가 «올리면 나오는» 자리에 없습니다');
  assert.ok(!/h\('strong', null, '💡 퇴직연금 자동 적립/.test(FN),
    '안내 띠가 다시 세 줄을 차지합니다');
  assert.ok(/[\s{,]title:'양식: 1행 헤더/.test(FN),
    '엑셀 양식 설명이 «올리면 나오는» 자리에 없습니다');
  assert.ok(!/h\('div', \{ style:\{ fontSize:'10\.5px', color:'#64748b', marginTop:'4px' \} \}, '양식: 1행 헤더/.test(FN),
    '엑셀 양식 설명이 다시 한 줄을 차지합니다');
});

test('④ 줄이면서 잃으면 안 되는 것 — 미가입 빨강·끌어다 놓기', () => {
  const at = FN.indexOf('⚠️ 미가입');
  const chip = FN.slice(Math.max(0, at - 220), at + 60);
  assert.ok(/#dc2626/.test(chip),
    '미가입이 빨강이 아닙니다 — 줄이더라도 눈에 띄어야 하는 숫자입니다');

  const dz = FN.indexOf('📥 적립금 엑셀');
  const box = FN.slice(Math.max(0, dz - 900), dz + 60);
  assert.ok(/onDrop:/.test(box) && /onDragOver:/.test(box),
    '끌어다 놓기가 없어졌습니다 — 상자만 줄이기로 했습니다');
  assert.ok(/pickDCFile\(/.test(box), '고른 파일을 읽는 길이 끊겼습니다');
});

test('④ 파일을 고르면 미리보기는 그대로 뜬다', () => {
  assert.ok(/📋 가져오기 미리보기/.test(FN), '미리보기가 사라졌습니다');
  assert.ok(/commitDCImport/.test(FN), '「반영」 단추가 사라졌습니다');
  /* 띠와 미리보기가 «동시에» 뜨면 줄이 늘어난다 — 파일을 고른 뒤엔 띠를 감춘다 */
  assert.ok(/tab === 'balance' && !dcImp/.test(FN),
    '파일을 고른 뒤에도 가져오기 띠가 남아 줄이 늘어납니다');
});
