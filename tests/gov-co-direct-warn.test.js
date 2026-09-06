/* 「사업장을 직접 넣으려 하면 푸른이알피에 먼저 등록하라고 알린다」 (대표 지시 2026-09-06)
 *
 * ★ 왜 필요한가 — 실측(2026-09-06): 사업장 27곳 가운데 이알피 번호를 가진 곳은 3곳뿐.
 *   나머지는 사람이 직접 넣은 것이라 «이름으로만» 맞춘다. 그래서
 *     · 이알피에서 종료해도 여기는 안 닫히고
 *     · 상호가 조금만 달라도 같은 회사가 두 줄이 된다
 *   이날 합친 중복 8건이 모두 그 결과였다.
 *
 * ⚠ 막지 않는다 — 알리기만 한다. 막으면 급할 때 우회할 길이 없다.
 *
 * 못 박는 것은 «지금 값»이 아니라 규칙이다 (CLAUDE.md).
 */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');
const bare = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const CODE = bare(SRC);
const HTML = SRC.replace(/<!--[\s\S]*?-->/g, ' ');
const STYLE = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

function grab(n) {
  const i = SRC.search(new RegExp('(?:async\\s+)?function ' + n + '\\('));
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; st = true; }
    else if (SRC[j] === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}

test('★★★ 경고가 «사업장 창 안»에 있다 — 다른 데 있으면 넣기 직전에 안 보인다', () => {
  const i = HTML.indexOf('id="mbCo"');
  assert.ok(i >= 0, '사업장 창을 못 찾았다');
  const j = HTML.indexOf('id="mCoWarn"');
  assert.ok(j > i, '경고가 사업장 창 안에 없다');
  /* 사업장명 칸 «위»에 있어야 한다 — 아래면 다 치고 나서야 본다 */
  assert.ok(j < HTML.indexOf('id="mCoName"'),
    '경고가 입력칸 아래에 있다 — 다 채우고 나서야 읽는다');
});

test('★★★ 「추가」일 때만 뜨고 「수정」일 때는 안 뜬다', () => {
  const fn = bare(grab('openCoModal'));
  const flat = fn.replace(/\s+/g, '');
  assert.ok(/mCoWarn/.test(flat), '경고를 켜고 끄는 데가 없다 — 늘 뜨거나 늘 안 뜬다');
  assert.ok(/toggle\('on',!editId\)/.test(flat),
    '고치는 중에도 뜬다 — 매번 뜨면 정작 첫 순간에 안 읽는다');
});

test('★★★ 막지 «않는다» — 저장을 가로막는 줄이 없다', () => {
  /* 대표 지시는 「경고표시」다. 막으면 급할 때 우회할 길이 없다. */
  const fn = bare(grab('saveCo'));
  assert.ok(!/mCoWarn/.test(fn), '저장하는 자리가 경고를 본다 — 막고 있을 수 있다');
});

test('★★ 「어디서 하느냐」의 답을 함께 준다 — 길 없는 경고는 잔소리다', () => {
  assert.ok(/id="mCoWarnGo"/.test(HTML), '가져오기로 가는 단추가 없다');
  assert.ok(/mCoWarnGo/.test(CODE), '단추가 아무 데도 안 걸려 있다');
  const i = CODE.indexOf("q('#mCoWarnGo')");
  const near = CODE.slice(i, i + 400).replace(/\s+/g, '');
  assert.ok(/openErpAsk\(\)|openErpTab\(\)/.test(near),
    '눌러도 가져오기로 안 간다');
  assert.ok(/closeModal\('mbCo'\)/.test(near),
    '사업장 창을 안 닫고 연다 — 창이 겹친다');
});

test('★★ 왜 안 되는지까지 말한다 — 「하지 마라」만으로는 안 따른다', () => {
  const i = HTML.indexOf('id="mCoWarn"');
  const box = HTML.slice(i, i + 900);
  assert.ok(/이알피/.test(box) && /종료/.test(box),
    '이알피에서 종료해도 여기는 안 닫힌다는 것을 안 알려 준다');
  assert.ok(/두 줄/.test(box) || /중복/.test(box),
    '같은 회사가 두 줄이 된다는 것을 안 알려 준다');
});

test('★ 경고 모양(CSS)이 있고, 처음에는 숨어 있다', () => {
  assert.ok(/\.co-warn\s*\{[^}]*display:\s*none/.test(STYLE.replace(/\s+/g, (m) => (m.includes('\n') ? '\n' : ' '))),
    '처음부터 켜져 있다 — 수정 창에서도 잠깐 보인다');
  assert.ok(/\.co-warn\.on\s*\{/.test(STYLE), '켜는 자리가 없다');
});
