'use strict';
/* 규정관리 단계 막대 — 흐름을 넷으로 (설계서 §3·§4)

   핵심 흐름은 「넣기 → 비교 → 고치기 → 내보내기」 넷인데 화면 어디에도 그 순서가
   없었다. 「취업규칙 검토 ▶」와 「문안 은행」이 같은 줄 같은 무게로 놓여 있었다.

   ⚠ 설정 줄(사업장·업로드·근로자·기준일)은 «① 넣기의 펼친 모습»이다.
     상태 줄이 이미 사업장·규모·기준일을 보이므로, ②로 가면 설정 줄을 접어도
     잃는 것이 없다. ①을 누르면 다시 펼친다.

   ⚠ 못 가는 단계는 «막지 않는다»(설계서 §4). 흐리게 두되 누르면 왜 아직인지
     말해 준다 — 못 누르게만 하면 왜 안 되는지 모른다. */
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
function ctx(extra) {
  const c = vm.createContext({ String, Number, Array, Object, Boolean });
  /* stepStateOf 는 함수 밖의 FLOW 를 본다 — 함수만 실으면 ReferenceError 가 난다 */
  /* stepStateOf 는 함수 밖의 FLOW 를 본다 — 함수만 실으면 ReferenceError 가 난다.
     정규식 대신 «줄 찾기»로 꺼낸다: 탈출문자가 한 겹 먹히면 조용히 아무것도 안 맞는다. */
  const flowLine = src.split('\n').find(l => l.startsWith('const FLOW='));
  assert.ok(flowLine, 'const FLOW= 줄을 찾지 못했습니다');
  vm.runInContext(flowLine.replace(/^const /, 'var '), c);
  vm.runInContext(fn('stepStateOf'), c);
  (extra || []).forEach(n => vm.runInContext(fn(n), c));
  return c;
}
const cans = (s) => s.map(x => !!x.can);

/* vm 안에서 만든 배열은 원형(prototype)이 달라 deepEqual 이 걸린다 — 값으로 견준다.
   이 저장소의 다른 검사도 같은 이유로 JSON 으로 견준다. */
const eqArr = (got, want, msg) =>
  assert.equal(JSON.stringify(Array.from(got || [])), JSON.stringify(want), msg);

test('★ 아무것도 없으면 ①만 갈 수 있다 — 나머지는 흐리게', () => {
  const s = ctx().stepStateOf({});
  assert.equal(s.length, 4);
  eqArr(cans(s), [true, false, false, false]);
  assert.equal(s[0].now, true, '처음에는 ①에 있다');
});

test('★ 파일을 넣으면 ②로 갈 수 있다', () => {
  eqArr(cans(ctx().stepStateOf({ hasFile: true })), [true, true, false, false]);
});

test('★ 검토를 돌리면 ③으로 갈 수 있다', () => {
  eqArr(cans(ctx().stepStateOf({ hasFile: true, hasResult: true })),
    [true, true, true, false]);
});

test('★ 고칠 것이 생기면 ④로 갈 수 있다', () => {
  eqArr(cans(ctx().stepStateOf({ hasFile: true, hasResult: true, hasItems: true })),
    [true, true, true, true]);
});

test('★ 못 가는 단계는 «왜»를 말한다 — 막기만 하면 까닭을 모른다', () => {
  const s = ctx().stepStateOf({});
  assert.ok(s[1].why && s[1].why.length > 4, '②의 까닭이 없습니다: ' + s[1].why);
  assert.match(s[1].why, /파일|넣/, '무엇을 해야 하는지 말해야 합니다: ' + s[1].why);
  assert.match(s[2].why, /검토/, s[2].why);
  assert.equal(s[0].why, '', '갈 수 있는 단계는 까닭이 없다');
});

test('★ 지금 어느 단계인지 하나만 켜진다', () => {
  const s = ctx().stepStateOf({ hasFile: true, hasResult: true, now: 2 });
  eqArr(s.map(x => !!x.now), [false, true, false, false]);
});

test('갈 수 없는 단계에 있다고 하면 갈 수 있는 마지막 단계로 물러난다', () => {
  const s = ctx().stepStateOf({ now: 4 });
  assert.equal(s[0].now, true, '①만 갈 수 있는데 ④에 서 있을 수는 없다');
});

test('★ 이름이 흐름을 말한다', () => {
  eqArr(ctx().stepStateOf({}).map(x => x.label),
    ['넣기', '비교', '고치기', '내보내기']);
});

/* ── 어느 단계에서 무엇이 보이나 ── */
test('★ ①에서는 설정 줄과 사업장 줄이 보인다', () => {
  const v = ctx(['stepShowsOf']).stepShowsOf(1);
  assert.equal(v.setup, true, '넣는 단계인데 설정 줄이 없으면 넣을 수가 없다');
  assert.equal(v.dash, true);
});

test('★ ②에서는 설정 줄을 접는다 — 상태 줄이 이미 그 값을 말한다', () => {
  const v = ctx(['stepShowsOf']).stepShowsOf(2);
  assert.equal(v.setup, false);
  assert.equal(v.grid, true, '견주는 단계인데 두 판이 없으면 안 된다');
});

test('두 판은 ①②에서 늘 보인다 — 넣으면서 원본을 봐야 한다', () => {
  const c = ctx(['stepShowsOf']);
  assert.equal(c.stepShowsOf(1).grid, true);
  assert.equal(c.stepShowsOf(2).grid, true);
});

/* ── 배선 ── */
test('★ 단계 막대가 머리줄에 있다', () => {
  const h = src.slice(src.indexOf('<header>'), src.indexOf('</header>'));
  assert.match(h, /id="stepbar"/, '흐름이 안 보이면 정리한 뜻이 없습니다');
});

test('★ 설정 줄이 머리줄 밖으로 나왔다', () => {
  const h = src.slice(src.indexOf('<header>'), src.indexOf('</header>'));
  assert.ok(!h.includes('id="site"'), '사업장 고르기가 아직 머리줄에 있습니다');
  assert.ok(!h.includes('id="asof"'), '기준일이 아직 머리줄에 있습니다');
  assert.match(src, /id="setup"/, '설정 줄을 담을 자리가 필요합니다');
});

test('★ 설정 줄의 여섯 가지가 하나도 사라지지 않았다 (설계서 §0)', () => {
  ['site', 'upBtn', 'upload-input', 'size', 'asof', 'run']
    .forEach(id => assert.match(src, new RegExp('id="' + id + '"'), id + ' 가 없어졌습니다'));
});

test('★ 업로드는 이제 한 자리 — ① 넣기가 맡는다 (2단계에서 미뤘던 것)', () => {
  const a = src.indexOf('id="setup"');
  assert.ok(a >= 0, '설정 줄이 없습니다');
  assert.ok(src.slice(a, a + 1400).includes('id="upBtn"'),
    '업로드가 설정 줄 안에 있어야 ①을 눌러 언제든 닿습니다');
  assert.ok(!src.includes('id="dash-upload"'),
    '사업장 줄의 업로드는 이제 겹칩니다 — ①이 늘 닿으므로 걷어냅니다');
});

test('★ 흐름 단계를 옮기는 함수가 있다 — 편집 창의 goStep 과 이름이 겹치지 않는다', () => {
  assert.match(fn('goFlowStep'), /stepStateOf\(|stepShowsOf\(/,
    '값 판단과 그리기가 이어져 있어야 합니다');
  assert.match(src, /function goStep\(/,
    '편집 창의 goStep 을 덮어쓰면 신구대조·변경결과 오가기가 깨집니다');
});

test('★ 편집 창 내비에서 번호를 뗐다 — 두 번째 4단계로 안 읽히게 (설계서 §3)', () => {
  /* 내비 자리(.stepnav)는 비어 있는 자리표다. 번호는 renderStepNav 가 NUM4 로 붙인다. */
  const r = fn('renderStepNav');
  assert.ok(!/NUM4/.test(r),
    '내비가 아직 ①②③④ 를 붙입니다 — 머리줄 단계와 둘이 되어 「어느 4단계인지」가 됩니다');
});

test('편집 창 내비의 네 갈래는 그대로 있다 (설계서 §0)', () => {
  /* 갈래 이름은 STEPS 배열이 갖고 있다 — 마크업이 아니다 */
  const i = src.indexOf('const STEPS=');
  assert.ok(i >= 0, 'STEPS 를 찾지 못했습니다');
  const steps = src.slice(i, i + 900);
  ['신구대조', '변경 결과', '최종 확인', '제출 서류']
    .forEach(w => assert.ok(steps.includes(w), w + ' 갈래가 사라졌습니다'));
  assert.match(src, /function goStep\(/, '갈래를 오가는 길도 그대로여야 합니다');
});
