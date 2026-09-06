'use strict';
/* 규정관리 — 위쪽을 «왼쪽으로 몰고», 일하는 판을 «위로» 끌어올린다.

   화면이 1900px 로 넓어지면서 위쪽 세 줄이 저마다 양 끝으로 벌어졌다. 가운데가
   텅 비고, 눈이 왼쪽 끝과 오른쪽 끝을 오가야 한 줄을 읽는다.
   벌린 것은 «보이지 않는 여백 셋»이다:
     · 상태 줄       — ERP 배지 앞의 flex:1
     · 사업장 줄     — 칩 띠의 flex:1 (단추 셋을 오른쪽 끝으로 민다)
     · 결과 바닥 줄  — 개정방식과 [신구대조표 생성…] 사이의 flex:1

   그리고 그 세 줄이 세로를 먹어 정작 «일하는 판»(자동 검토 결과)이 아래로 밀렸다.
   설정 줄은 이름표가 «위»에 놓여 한 줄을 더 먹는다 — 옆으로 돌리면 그만큼 올라온다.

   ⚠ 없애는 것이 아니다. 단추도 값도 그대로다 — «자리»만 바뀐다.
   실행: node --test tests/rules-left-packed.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

function fn(name) {
  const marker = 'function ' + name + '(';
  let start = src.indexOf(marker);
  if (start < 0) throw new Error('함수 못찾음: ' + name);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let pd = 0, pEnd = -1;
  for (let i = start + marker.length - 1; i < src.length; i++) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { pEnd = i; break; } }
  }
  const bodyStart = src.indexOf('{', pEnd + 1);
  let d = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('함수 끝 못찾음: ' + name);
}

/* 한 덩어리(여는 태그부터 짝이 맞는 닫는 태그까지)를 잘라 온다 */
function block(anchor, tag) {
  const a = src.indexOf(anchor);
  assert.ok(a >= 0, anchor + ' 를 찾지 못했습니다');
  const open = src.lastIndexOf('<' + tag, a);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src.startsWith('<' + tag, i)) d++;
    else if (src.startsWith('</' + tag + '>', i)) { d--; if (d === 0) return src.slice(open, i + tag.length + 3); }
  }
  throw new Error('덩어리 끝 못찾음: ' + anchor);
}

/* CSS 규칙 한 줄에서 값 하나를 숫자로 */
function cssNum(selector, prop) {
  const at = src.indexOf('\n' + selector + '{');
  assert.ok(at >= 0, selector + ' 규칙이 없습니다');
  const body = src.slice(at + 1, src.indexOf('}', at));
  const m = new RegExp(prop + '\\s*:\\s*([^;}]+)').exec(body);
  assert.ok(m, selector + ' 에 ' + prop + ' 가 없습니다: ' + body);
  const n = /(-?[0-9.]+)px/.exec(m[1]);
  assert.ok(n, selector + ' 의 ' + prop + ' 이 px 가 아닙니다: ' + m[1]);
  return parseFloat(n[1]);
}

/* ── ① 왼쪽으로 몰기 — 오른쪽 끝으로 미는 여백을 걷는다 ── */

test('★ 상태 줄이 ERP 배지를 오른쪽 끝으로 밀지 않는다', () => {
  const r = fn('renderStatusBar');
  assert.ok(!/flex:\s*1/.test(r),
    '상태 줄에 아직 늘어나는 여백이 있습니다 — 글과 배지가 화면 양 끝으로 갈립니다');
});

test('★ 사업장 줄의 칩 띠가 늘어나지 않는다 — 단추 셋이 칩 바로 뒤에 붙는다', () => {
  const b = block('id="dash-list"', 'div');
  const list = /<div id="dash-list"[^>]*>/.exec(b);
  assert.ok(list, 'dash-list 를 찾지 못했습니다');
  assert.ok(!/flex:\s*1[^-]/.test(list[0]),
    '칩 띠가 아직 남는 자리를 다 차지합니다: ' + list[0]);
  assert.match(list[0], /overflow-x:\s*auto|class="dstrip"/,
    '늘리기를 뗀 대신 칩이 많을 때 좌우로 밀 수 있어야 합니다');
});

test('★ 결과 바닥 줄이 단추 셋을 오른쪽 끝으로 밀지 않는다', () => {
  const b = block('id="mk-daejo"', 'div');
  assert.ok(!/<span style="flex:1"><\/span>/.test(b),
    '개정방식과 [신구대조표 생성] 사이가 아직 벌어져 있습니다');
});

test('★ 왼쪽으로 몰았다고 단추가 사라지지는 않았다', () => {
  ['dash-all', 'dash-new', 'dash-hide', 'mk-daejo', 'save', 'save-done',
    'rv-partial', 'rv-full', 'rv-renum'].forEach((id) =>
    assert.match(src, new RegExp('id="' + id + '"'), id + ' 가 없어졌습니다'));
});

test('★ 개정방식 무리와 내보내기 무리는 여전히 갈린다 — 붙였다고 한 덩어리로 보이면 안 된다', () => {
  const b = block('id="mk-daejo"', 'div');
  const 사이 = b.slice(b.indexOf('id="rv-renum"'), b.indexOf('id="mk-daejo"'));
  assert.match(사이, /margin-left|class="rb-gap"|<span/,
    '두 무리 사이에 아무 사이도 없으면 아홉 단추가 한 줄로 뭉칩니다');
});

/* ── ② 위로 끌어올리기 ── */

test('★ 설정 줄의 이름표가 «옆»으로 간다 — 위에 두면 한 줄을 더 먹는다', () => {
  const at = src.indexOf('\n#setup .fld{');
  assert.ok(at >= 0, '#setup 안의 .fld 규칙이 없습니다 — 이름표가 아직 위에 있습니다');
  const body = src.slice(at + 1, src.indexOf('}', at));
  assert.match(body, /flex-direction:\s*row/, '이름표가 아직 위에 있습니다: ' + body);
});

test('★ 일하는 판이 위로 올라온다 — 바깥 여백과 판 사이가 줄었다', () => {
  assert.ok(cssNum('.wrap', 'margin') <= 14,
    '바깥 위 여백이 아직 큽니다: ' + cssNum('.wrap', 'margin') + 'px');
  assert.ok(cssNum('.grid', 'margin-top') <= 12,
    '판 위 여백이 아직 큽니다: ' + cssNum('.grid', 'margin-top') + 'px');
});

test('설정 줄·사업장 줄은 그대로 있다 — 올렸다고 없앤 것이 아니다', () => {
  ['setup', 'dash', 'statusbar', 'grid'].forEach((id) =>
    assert.match(src, new RegExp('id="' + id + '"'), id + ' 이 없어졌습니다'));
  ['site', 'upBtn', 'size', 'asof', 'run'].forEach((id) =>
    assert.match(src, new RegExp('id="' + id + '"'), id + ' 이 없어졌습니다'));
});
