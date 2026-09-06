'use strict';
/* 편집 창 툴바 — 열세 단추를 뜻으로 묶는다 (설계서 §6)

   지금은 보기·되돌리기·개정방식·용지가 한 줄에 «평평하게» 놓여 무엇이 무엇인지
   안 갈린다. 열세 개가 같은 크기, 같은 색, 같은 간격으로 늘어서 있다.

   묶음 셋 — 보기 / 고치기 / 문서.
   ⚠ 없애는 것이 아니다(설계서 §0). 단추는 다 남고 «사이»가 생길 뿐이다.
   ⚠ ⋯ 더보기 서랍은 그대로 둔다 — 이미 접혀 있고 자주 쓰지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

/* 툴바 한 덩어리만 잘라 본다 */
function toolbar() {
  const a = src.indexOf('id="daejo-tools"');
  assert.ok(a >= 0, 'daejo-tools 를 찾지 못했습니다');
  const open = src.lastIndexOf('<div', a);
  let d = 0, end = src.length;
  for (let i = open; i < src.length; i++) {
    if (src.startsWith('<div', i)) d++;
    else if (src.startsWith('</div>', i)) { d--; if (d === 0) { end = i + 6; break; } }
  }
  return src.slice(open, end);
}

/* 툴바에 실제로 놓인 단추 id 를 차례대로 */
function ids() {
  return [...toolbar().matchAll(/id="([a-z0-9-]+)"/g)].map(m => m[1])
    .filter(x => x !== 'daejo-tools');
}

const ALL = ['wd-on', 'edit-undo', 'edit-redo', 'mode-partial', 'mode-full',
  'pg-auto', 'pg-portrait', 'pg-landscape', 'tb-more', 'add-ins'];

test('★ 단추가 하나도 사라지지 않았다 (설계서 §0)', () => {
  const have = ids();
  const gone = ALL.filter(id => !have.includes(id));
  assert.deepEqual(gone, [], '툴바에서 사라진 단추: ' + gone.join(', '));
});

test('★ 묶음이 셋 있다 — 보기 · 고치기 · 문서', () => {
  const t = toolbar();
  ['tg-view', 'tg-edit', 'tg-doc'].forEach(g =>
    assert.ok(t.includes('id="' + g + '"'), g + ' 묶음이 없습니다'));
});

test('★ 보기 묶음에 「바뀐 낱말」이 든다', () => {
  const t = toolbar();
  const a = t.indexOf('id="tg-view"');
  const b = t.indexOf('id="tg-edit"');
  assert.ok(a >= 0 && b > a, '묶음 차례가 보기 → 고치기 여야 합니다');
  assert.ok(t.slice(a, b).includes('id="wd-on"'), '「바뀐 낱말」이 보기 묶음에 없습니다');
});

test('★ 고치기 묶음에 되돌리기·다시실행·신설이 든다', () => {
  const t = toolbar();
  const a = t.indexOf('id="tg-edit"');
  const b = t.indexOf('id="tg-doc"');
  assert.ok(a >= 0 && b > a, '묶음 차례가 고치기 → 문서 여야 합니다');
  const seg = t.slice(a, b);
  ['edit-undo', 'edit-redo', 'add-ins'].forEach(id =>
    assert.ok(seg.includes('id="' + id + '"'), id + ' 가 고치기 묶음에 없습니다'));
});

test('★ 문서 묶음에 개정방식·용지가 든다 — 둘 다 «나올 문서»를 정하는 것이다', () => {
  const t = toolbar();
  const a = t.indexOf('id="tg-doc"');
  assert.ok(a >= 0);
  const seg = t.slice(a);
  ['mode-partial', 'mode-full', 'pg-auto', 'pg-portrait', 'pg-landscape'].forEach(id =>
    assert.ok(seg.includes('id="' + id + '"'), id + ' 가 문서 묶음에 없습니다'));
});

test('★ 묶음마다 이름표가 붙는다 — 이름이 없으면 그냥 간격일 뿐이다', () => {
  const t = toolbar();
  ['보기', '고치기', '문서'].forEach(w =>
    assert.ok(t.includes('>' + w + '</span>') || t.includes('>' + w + '<'),
      '「' + w + '」 이름표가 없습니다'));
});

test('★ ⋯ 더보기 서랍은 그대로다 — 이미 접혀 있고 자주 안 쓴다', () => {
  assert.match(src, /id="tb-more"/);
  assert.match(src, /id="tb-drawer"/);
  ['inc-note', 'rz-none', 'rz-reset'].forEach(id =>
    assert.match(src, new RegExp('id="' + id + '"'), id + ' 가 서랍에서 사라졌습니다'));
});

test('★ 단추가 하는 일은 그대로다 — 처리기가 살아 있다', () => {
  ALL.filter(id => id !== 'tb-more' && id !== 'add-ins').forEach(id =>
    assert.match(src, new RegExp('\\$\\("' + id + '"\\)'), id + ' 의 처리기가 사라졌습니다'));
});

test('묶음 CSS 가 있다 — 사이를 벌리고 이름표를 작게', () => {
  assert.match(src, /\.tgroup\b/, '묶음 모양을 정한 곳이 없습니다');
  assert.match(src, /\.tglbl\b/, '이름표 모양을 정한 곳이 없습니다');
});

test('★ 툴바는 여전히 한 줄이다 — 넘치면 좌우로 민다', () => {
  const t = toolbar();
  const head = t.slice(0, t.indexOf('>') + 1);
  assert.match(head, /overflow-x:\s*auto/,
    '넘칠 때 좌우로 밀지 않으면 편집 창이 세로로 늘어납니다');
});
