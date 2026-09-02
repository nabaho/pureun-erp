/* 계약 카드(칸반)를 «다섯 줄에서 두 줄»로 (대표 지시 2026-08-31)
 *
 *   「계약이나 번호 등을 한줄로 좀 해라 이중으로 되어 있어 셀의 길이를
 *    자꾸 길게하지 말고, 캡쳐2도 셀안에 2줄로 줄여봐라.
 *    같은 위치에 반복되면 줄을 늘여놓을 필요가 없다.」
 *
 * ■ 무슨 일이었나
 *   종류배지 · 회사명 · 담당자+금액 · 메모 · 버튼 — 다섯 줄이 세로로 쌓였다.
 *   그 카드는 «항상 같은 자리»에 같은 것을 반복해 그리므로, 한 줄에 같이
 *   세워도 헷갈리지 않는다.
 * ★ 줄1 = 종류·회사명·번호(무엇에 관한 계약인가)
 *   줄2 = 담당·금액·버튼(할 일) — 매 카드 반복되는 자리라 한 줄로 합쳤다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const SRC = bare(ERP);

function skipStr(s, k) { const q = s[k]; for (k++; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === q) break; } return k; }
function matchParen(s, from) {
  let d = 0;
  for (let k = s.indexOf('(', from); k < s.length; k++) {
    const c = s[k];
    if (c === "'" || c === '"' || c === '`') { k = skipStr(s, k); continue; }
    if (c === '(') d++; else if (c === ')') { d--; if (d === 0) return k; }
  }
  return -1;
}

/* ⚠ 이 컴포넌트엔 목록형·폰형·기본(칸반) 세 카드가 있다. 「기본 카드」에서만
   쓰는 arvBadge(c, 'contracts', refreshContracts) 를 표식 삼아, 그것을 담은
   h('div', {...}, …) 통째를 중괄호 짝으로 잘라낸다 — 줄 번호는 코드가 늘면
   밀리지만, 이 표식과 짝 맞추기는 안 밀린다. */
const MARK = "arvBadge(c, 'contracts', refreshContracts)";
const markAt = SRC.indexOf(MARK);
assert.ok(markAt > 0, '기본 카드 표식을 못 찾음');
const startAt = SRC.lastIndexOf("return h('div', { key:c.id,", markAt);
assert.ok(startAt > 0, '기본 카드의 시작을 못 찾음');
const hOpen = SRC.indexOf('(', startAt);
const endAt = matchParen(SRC, startAt + 6); // "return " 다음 h( 의 여는 괄호부터
assert.ok(endAt > markAt, '기본 카드의 끝을 못 찾음');
const CARD = SRC.slice(startAt, endAt + 1);

test('★★ 회사명·계약번호·담당자·금액·버튼이 모두 이 카드 안에 있다', () => {
  assert.match(CARD, /c\.companyName/);
  assert.match(CARD, /c\.contractNo/);
  assert.match(CARD, /managerMain/);
  assert.match(CARD, /totalAmount > 0/);
  assert.match(CARD, /doClose\(c\.id\)/);
  assert.match(CARD, /doCancel\(c\.id\)/);
});

test('★★ 담당자·금액·버튼이 «한 줄»에 함께 선다 — 따로 줄을 만들지 않는다', () => {
  // 담당자를 그리는 자리와 종료 버튼을 그리는 자리 사이에 «새 줄(div)»이 없어야 한다.
  const mgrAt = CARD.indexOf('managerMain');
  const closeAt = CARD.indexOf('doClose(c.id)');
  assert.ok(mgrAt > 0 && closeAt > mgrAt, '순서를 못 찾음');
  const between = CARD.slice(mgrAt, closeAt);
  /* ⚠ 「같은 줄 안에서 밀어 주는 spacer」( flex:1 만 있는 div )는 줄이 아니다 —
     그것까지 0개로 못 박으면 정작 «가로 정렬」에 쓰는 정상적인 div 를 오판한다.
     못 박을 것은 «다른 줄을 여는 div»(marginTop·다른 fontSize 블록)가 없다는 것. */
  const divs = between.match(/h\('div', \{[^}]*\}[^)]*\)/g) || [];
  const notSpacer = divs.filter((d) => !/flex:1, minWidth:'4px'/.test(d));
  assert.strictEqual(notSpacer.length, 0,
    '★★ 담당자와 종료 버튼 사이에 spacer 가 아닌 div 가 있다 — 옛 「메모 줄·버튼 줄」이 되살아났다 '
    + '(' + notSpacer.length + '개: ' + notSpacer.join(' | ') + ')');
});

test('★★ 옛 넷째·다섯째 줄(메모 전용 줄 · 계약서/보관함/이관 버튼 줄)이 남아 있지 않다', () => {
  assert.ok(!/'📄 계약서'\)/.test(CARD), '★ 옛 버튼 글자(두 줄 시절 문구)가 남아 있다 — 카드서/보관함 줄이 되살아났다');
  assert.ok(!/'➡ 이관 \(' \+ kindsArr\.length \+ '개\)'\)/.test(CARD), '★ 옛 이관 버튼 문구가 남아 있다');
  // 「종료 버튼만 있는」 두 갈래(signed/!signed) 옛 블록이 통째로 남아 있으면 안 된다
  const closeCount = (CARD.match(/doClose\(c\.id\)/g) || []).length;
  assert.strictEqual(closeCount, 1,
    '★★ 종료 버튼이 ' + closeCount + '번 그려진다 — 옛 두 갈래(계약확정/그 외)가 안 지워지고 새 줄과 함께 남았다');
});

test('★ 회사명이 길면 자르고(…) title 로 전문을 남긴다 — 접혀서 두 줄이 되면 안 된다', () => {
  const at = CARD.indexOf('c.companyName');
  const around = CARD.slice(Math.max(0, at - 260), at + 20);
  assert.ok(/overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'/.test(around),
    '★ 회사명 칸에 자르기가 없다 — 길면 카드 폭이 늘어나거나 줄바꿈된다');
  assert.ok(/title:c\.companyName/.test(around), '★ 잘렸을 때 전문을 볼 길이 없다');
});

test('★ 세부 사업명(같은 종류라도 다른 사업)을 회사명 옆에 붙인다', () => {
  assert.match(CARD, /kindSubLabel\(c, kv\)/);
});

test('★ 메모는 있을 때만 «아이콘 하나»로 — 따로 줄을 안 쓴다', () => {
  assert.match(CARD, /c\.note && h\('span', \{ title:c\.note,/);
});
