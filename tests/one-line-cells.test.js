/* 표의 한 칸은 «한 줄»이다 (대표 지시 2026-08-30)
 *
 *   「한줄로 정리해라 빈공간이 많다 넓을경우 2줄로 절대 만들지마라
 *    데이터 정보넣을때 줄의 공간이 넓으면 2줄로 만들지 마라」
 *
 * ■ 무슨 일이 있었나
 *   거래내역 적요 아래에 「0」만 적힌 둘째 줄이 322줄 내내 붙어 있었다.
 *   엑셀에서 딸려온 잔액인데 값이 없다 — 아무것도 안 알려 주면서
 *   표 높이만 두 배로 만들었다. 오른쪽에는 빈 자리가 넉넉한데도
 *   칸을 maxWidth:140px 로 조여 두고 세로로 쌓고 있었다.
 *
 * ★ 한 줄만 두 줄이 되어도 «표 전체»가 그만큼 길어진다.
 *   화면 한 장에 보이던 것이 반으로 줄고, 같은 것을 보려고 두 배로 스크롤한다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

/* ⚠ 주석을 걷는다 — 이 규칙을 설명하는 주석이 규칙 자체로 읽히면 안 된다. */
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutFn(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + head);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + head);
}

/* ── 「말을 하는 값인가」를 실제로 돌려 본다 ── */
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(ERP.slice(ERP.indexOf('var ERP_EMPTY_NOTE ='),
  ERP.indexOf('try { window.erpNoteWorth')), ctx);
const worth = ctx.erpNoteWorth;

test('★★ 「0」처럼 아무것도 안 알려 주는 값은 «안 그린다»', () => {
  ['0', ' 0 ', '0.0', '-', '--', '', '   ', '0 / 0', '·', '—'].forEach(function (v) {
    assert.strictEqual(worth(v), false,
      '★★ 「' + v + '」 는 아무것도 안 알려 주는데 자리는 차지한다 — 322줄이면 322줄이 두 배가 된다');
  });
  assert.strictEqual(worth(null), false);
  assert.strictEqual(worth(undefined), false);
});

test('★★ 말을 하는 값은 «반드시 그린다» — 넓게 잡아 진짜 정보를 지우면 안 된다', () => {
  ['계좌번호 680******45904', '교보01-047', '0원 이체', '10', '0건 접수',
   '2026-08-30', '나이스빌 CMS'].forEach(function (v) {
    assert.strictEqual(worth(v), true,
      '★★ 「' + v + '」 는 사람이 봐야 하는 값인데 지운다 — 빈 값 걷기가 넓으면 장부가 사라진다');
  });
});

test('★ 숫자 0 을 «금액 칸»에서 지우는 데는 쓰지 않는다', () => {
  /* 0원·잔액 0원은 진짜 정보다. 이 잣대는 «곁들이 글»에만 쓴다 —
     그래서 숫자 칸에서 부르고 있으면 안 된다. */
  const src = bare(ERP);
  assert.ok(!/erpNoteWorth\(row\.amount\)|erpNoteWorth\(r\.amount\)|erpNoteWorth\(row\.balance\)/.test(src),
    '★★ 금액·잔액에 이 잣대를 대면 「0원」이 화면에서 사라진다 — 그것은 진짜 값이다');
});

/* ── 거래내역 적요 칸이 한 줄인가 ── */
function expenseMemoCell() {
  const src = bare(ERP);
  const i = src.indexOf("maxWidth:'360px'");
  assert.ok(i >= 0, '★ 적요 칸을 못 찾음 — 좁은 채로 되돌아갔을 수 있다');
  /* 그 td 하나만 자른다 */
  const start = src.lastIndexOf("h('td'", i);
  let d = 0;
  for (let k = src.indexOf('(', start); k < src.length; k++) {
    if (src[k] === '(') d++;
    else if (src[k] === ')') { d--; if (d === 0) return src.slice(start, k + 1); }
  }
  throw new Error('적요 칸의 끝을 못 찾음');
}

test('★★ 적요 칸은 «한 줄»로 선다 — 세로로 쌓지 않는다', () => {
  const cell = expenseMemoCell();
  assert.ok(/display:'flex',alignItems:'center',gap:'5px',\s*whiteSpace:'nowrap'/.test(cell),
    '★★ 세로로 쌓으면 그 줄만 키가 커져 표 전체가 성글어진다');
  /* 곁들이 표들이 «줄을 내리려고» 넣던 것이 남아 있으면 안 된다 */
  assert.ok(!/marginTop:'2px'/.test(cell),
    '★★ marginTop 이 남아 있으면 그 표만 다음 줄로 내려가 다시 두 줄이 된다');
});

test('★★ 적요가 길면 «자르고» 전문은 title 에 둔다 — 접어서 두 줄로 만들지 않는다', () => {
  const cell = expenseMemoCell();
  assert.ok(/textOverflow:'ellipsis'/.test(cell),
    '★★ 안 자르면 긴 적요가 접혀서 결국 두 줄이 된다');
  assert.ok(/title:row\.memo/.test(cell),
    '★★ 자르기만 하고 전문을 안 남기면, 잘린 가게 이름을 확인할 길이 없어진다');
});

test('★★ 빈 값(「0」)을 «자리만 채워» 그리지 않는다', () => {
  const cell = expenseMemoCell();
  assert.ok(/erpNoteWorth\(row\.note\)/.test(cell),
    '★★ 값이 있는지만 보면 「0」도 그린다 — 그것이 322줄을 두 배로 만든 원인이다');
});

/* ── 다른 표들도 같은 규칙인가 ── */
test('★★ 이름 아래에 «작은 글씨를 얹는» 옛 버릇이 남아 있지 않다', () => {
  const src = bare(ERP);
  /* 이 모양이 바로 두 줄을 만든다 — h('div',{작은 회색 글씨}) 를 형제로 두는 것 */
  const bad = src.match(/h\('div',\{style:\{fontSize:'10px',color:'#94a3b8'\}\}/g) || [];
  assert.strictEqual(bad.length, 0,
    '★★ 칸 안에 div 를 형제로 두면 세로로 쌓인다 — span 으로 바꾸고 flex 한 줄에 세운다 '
    + '(남은 곳 ' + bad.length + ')');
});
