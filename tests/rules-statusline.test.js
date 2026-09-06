'use strict';
/* 규정관리 상태 한 줄 — 배너 세 겹을 한 줄로 (설계서 §5)

   지금은 원본 미리보기 위에 색 다른 띠 셋이 쌓인다:
     ① 💾 자동 저장됨 — 씨티에스㈜ (…pdf) · 편집 36건 · 20:55 기준 · 보관함에도 자동 반영 (…)
     ② ↺ 이전 작업이 복원되었습니다 — …
     ③ 🏢 ERP 업체관리에서 '씨티에스㈜'을(를) 찾지 못했습니다 — …
   셋 다 「지금 상태」 한 가지를 말하는데 세 목소리다. 첫 화면의 큰 자리를 먹는다.

   ⚠ 없애는 것이 아니다(설계서 §0). 세 가지 정보는 다 남고 자리와 크기만 바뀐다.
     ②는 복원된 그때 한 번만 잠깐 뜨고 사라진다 — 계속 붙어 있을 말이 아니다. */
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

/* vm 안에서 만든 배열은 원형(prototype)이 달라 deepEqual 이 걸린다 — 값으로 견준다.
   이 저장소의 다른 검사도 같은 이유로 JSON 으로 견준다. */
const eqArr = (got, want, msg) =>
  assert.equal(JSON.stringify(Array.from(got || [])), JSON.stringify(want), msg);

function ctx() {
  const c = vm.createContext({ String, Number, Array, Object, Date, isNaN });
  vm.runInContext(fn('statusLineOf'), c);
  return c;
}

const FULL = {
  site: '씨티에스㈜', size: '10~29인', asof: '2026-07-21',
  arts: 101, savedAt: '2026-09-05T20:55:00', erp: 'miss', erpName: '씨티에스㈜'
};

test('★ 한 줄에 여섯 가지가 차례대로 담긴다', () => {
  const s = ctx().statusLineOf(FULL);
  eqArr(s.parts, ['씨티에스㈜', '10~29인', '2026-07-21', '101조', '20:55 저장']);
  assert.equal(s.erp.kind, 'warn');
});

test('★ 파일을 안 넣었으면 설정만 — 빈 칸을 만들지 않는다', () => {
  const s = ctx().statusLineOf({ size: '10~29인', asof: '2026-07-21' });
  eqArr(s.parts, ['10~29인', '2026-07-21']);
  assert.equal(s.erp.kind, 'none', 'ERP 를 아직 안 읽었으면 아무 말도 안 한다');
});

test('아무것도 없으면 빈 줄', () => {
  const s = ctx().statusLineOf({});
  eqArr(s.parts, []);
  assert.equal(s.erp.kind, 'none');
});

test('★ 저장 시각은 시:분만 — 「20:55 기준 · 보관함에도 자동 반영(…)」 은 너무 길다', () => {
  const s = ctx().statusLineOf({ savedAt: '2026-09-05T09:07:00' });
  eqArr(s.parts, ['09:07 저장']);
});

test('저장한 적이 없으면 저장 칸이 아예 없다', () => {
  eqArr(ctx().statusLineOf({ site: '가나', savedAt: '' }).parts, ['가나']);
  eqArr(ctx().statusLineOf({ site: '가나', savedAt: 'x' }).parts, ['가나'], '못 읽는 시각은 조용히 뺀다');
});

test('★ 조문 수는 0 이면 안 적는다 — 「0조」는 아무 말도 아니다', () => {
  eqArr(ctx().statusLineOf({ site: '가나', arts: 0 }).parts, ['가나']);
  eqArr(ctx().statusLineOf({ site: '가나', arts: 101 }).parts, ['가나', '101조']);
});

/* ── ERP 상태 — 세 갈래 ── */
test('★ ERP 를 찾았으면 업체 이름을 보인다', () => {
  const e = ctx().statusLineOf({ erp: 'ok', erpName: '씨티에스 주식회사' }).erp;
  assert.equal(e.kind, 'ok');
  assert.ok(e.text.length <= 20, '칩은 상태 줄에 들어갈 길이여야 합니다: ' + e.text);
  assert.match(e.title, /씨티에스 주식회사/, '어느 업체와 이어졌는지는 귀띔으로 확인할 수 있어야 합니다');
});

test('★ 못 찾았으면 왜인지 알 수 있게 짧게 — 신고서에 영향이 있다', () => {
  const e = ctx().statusLineOf({ erp: 'miss', erpName: '씨티에스㈜' }).erp;
  assert.equal(e.kind, 'warn');
  assert.match(e.text, /ERP/);
  assert.ok(e.text.length <= 20, '상태 줄에 들어갈 길이여야 합니다: ' + e.text.length + '자 — ' + e.text);
  assert.ok(e.title && e.title.length > e.text.length, '자세한 말은 귀띔(title)으로 남긴다');
});

test('ERP 를 아직 안 읽었으면 아무 말도 안 한다', () => {
  assert.equal(ctx().statusLineOf({ erp: '' }).erp.kind, 'none');
  assert.equal(ctx().statusLineOf({ erp: 'none' }).erp.kind, 'none');
});

/* ── 배선 ── */
test('★ 상태 줄 자리가 화면에 있다', () => {
  assert.match(src, /id="statusbar"/, '한 줄을 놓을 자리가 없으면 배너가 그대로 남습니다');
});

test('★ 상태 줄을 그리는 곳이 statusLineOf 를 쓴다', () => {
  const r = fn('renderStatusBar');
  assert.match(r, /statusLineOf\(/, '값 만들기와 그리기가 갈라져 있어야 검사할 수 있습니다');
  assert.match(r, /statusbar/);
});

test('★ 자동 저장 배너는 더 이상 큰 띠로 뜨지 않는다', () => {
  const b = fn('updateWorkBadge');
  assert.match(b, /renderStatusBar\(/, '자동 저장 상태가 상태 줄로 흘러가야 합니다');
});

test('★ 「다른 취업규칙 시작」·「임시저장 지우기」는 사라지지 않았다 (설계서 §0)', () => {
  assert.match(src, /id="work-new"/);
  assert.match(src, /id="work-clear"/);
});

test('★ 복원 알림은 잠깐 뜨고 스스로 사라진다', () => {
  const a = fn('applyWorkObject');
  assert.match(a, /setTimeout\([\s\S]{0,80}?note\.remove/,
    '계속 붙어 있으면 첫 화면 한 줄을 영영 먹습니다');
});
