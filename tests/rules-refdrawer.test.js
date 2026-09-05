'use strict';
/* 규정관리 머리줄 — 참고 도구 넷을 한 단추 뒤로 (설계서 §4)

   표준규칙 · 문안 은행 · 보관함 · 조문 검색 넷은 «매일 쓰는 것»이 아닌데
   「취업규칙 검토 ▶」와 같은 줄, 같은 무게로 머리줄을 차지하고 있었다.
   넷을 [⋯ 참고] 하나 뒤로 접는다.

   ⚠ 없애는 것이 아니다(설계서 §0) — 넷은 그대로 있고 한 번 더 눌러 간다.
   ⚠ 보관함은 쓰임이 잦다(설계서 §10). 그래서 서랍을 «안 열어도» 개수가 보이게
     서랍 단추에 그 수를 그대로 띄운다 — 접었다고 「몇 건 있는지」까지 감추면
     접기 전보다 나빠진다.

   ⚠ 업로드 중복(머리줄 #upBtn ↔ 사업장 줄 #dash-upload)은 여기서 걷지 않는다.
     사업장 줄을 접으면(showDash(false)) #dash-upload 가 사라져 업로드 단추가
     하나도 안 남는다. 「① 넣기」가 업로드를 맡는 3단계에서 함께 정리한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

const REF = ['open-std', 'open-bank', 'open-arch', 'open-arts'];

/* 머리줄에서 «서랍 밖»에 남은 부분만 잘라 본다 */
function headOutsideDrawer() {
  const h = src.slice(src.indexOf('<header>'), src.indexOf('</header>'));
  const s = h.indexOf('id="ref-drawer"');
  if (s < 0) return h;                       // 서랍이 아직 없으면 머리줄 전체
  const open = h.lastIndexOf('<div', s);
  let d = 0, end = h.length;
  for (let i = open; i < h.length; i++) {
    if (h.startsWith('<div', i)) d++;
    else if (h.startsWith('</div>', i)) { d--; if (d === 0) { end = i + 6; break; } }
  }
  return h.slice(0, open) + h.slice(end);
}

test('★ 참고 넷이 사라지지 않았다 (설계서 §0)', () => {
  REF.forEach(id => assert.match(src, new RegExp('id="' + id + '"'), id + ' 가 없어졌습니다'));
});

test('★ 넷이 서랍 «안»에 들어갔다 — 머리줄 겉에 남아 있지 않다', () => {
  const out = headOutsideDrawer();
  const left = REF.filter(id => out.includes('id="' + id + '"'));
  assert.deepEqual(left, [], '아직 머리줄 겉에 있습니다: ' + left.join(', '));
});

test('★ 서랍 여닫는 단추가 있다', () => {
  assert.match(src, /id="ref-toggle"/);
  const h = src.slice(src.indexOf('<header>'), src.indexOf('</header>'));
  assert.match(h, /id="ref-toggle"/, '서랍 단추는 머리줄에 있어야 합니다');
});

test('★ 보관함 개수는 서랍을 «안 열어도» 보인다 (설계서 §10)', () => {
  const r = fn('updateArchCnt');
  assert.match(r, /ref-cnt/,
    '접었다고 「몇 건 있는지」까지 감추면 접기 전보다 나빠집니다');
  assert.match(src, /id="ref-cnt"/);
  const h = src.slice(src.indexOf('<header>'), src.indexOf('</header>'));
  assert.match(h, /id="ref-cnt"/, '개수는 머리줄에서 바로 보여야 합니다');
});

test('보관함 개수 칸은 그대로 남는다 — 서랍 안 목록에서도 쓴다', () => {
  assert.match(src, /id="arch-cnt"/);
});

test('★ 로그인·타이머·포털로는 서랍에 들어가지 않는다', () => {
  const out = headOutsideDrawer();
  ['id="who"', 'enter.html', 'logoutTimer'].forEach(k =>
    assert.ok(out.includes(k), k + ' 가 서랍 안으로 들어갔습니다 — 늘 보여야 합니다'));
});

test('★ 네 단추의 하는 일은 그대로다 — 처리기가 살아 있다', () => {
  REF.forEach(id => assert.match(src, new RegExp('\\$\\("' + id + '"\\)\\.addEventListener'),
    id + ' 의 처리기가 사라졌습니다'));
});

test('★ 업로드 중복은 «아직» 걷지 않는다 — 3단계 몫 (사업장 줄을 접으면 하나도 안 남는다)', () => {
  assert.match(src, /id="upBtn"/,
    '사업장 줄을 접으면 #dash-upload 가 사라져 업로드할 길이 없어집니다');
  assert.match(src, /id="dash-upload"/);
});

test('서랍을 여닫는 함수가 있다', () => {
  const t = fn('toggleRefDrawer');
  assert.match(t, /ref-drawer/);
});

test('★ 바깥을 누르면 서랍이 닫힌다 — 열어 둔 채 잊지 않게', () => {
  assert.match(src, /ref-drawer[\s\S]{0,600}?document\.addEventListener\(["']click|document\.addEventListener\(["']click[\s\S]{0,400}?ref-drawer/,
    '바깥 클릭으로 닫히지 않으면 화면을 가린 채 남습니다');
});
