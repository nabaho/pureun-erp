/* 대시보드 정리 + PDF 화질 — 대표 지시 2026-08-10
   "캡쳐 데시보드 간략하게 정리좀 해달라. 폴더는 계속 만들어 질 수 있기 때문에
    크기 좀 작게 줄여 달라. 확인필요는 총괄관리인에게는 모든 확인이 나타나나
    담당자는 자기확인만 나타나면 된다."
   "pdf 사진 인식율이 낮은건가" */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ── 폴더 칸 ── */
test('★ 폴더가 늘어도 아래 것들이 안 밀린다', () => {
  /* 상한이 없으면 폴더를 만들수록 확인 필요·휴지통·설정이 화면 밖으로 나간다.
     폴더는 계속 만들어지므로 이것이 「작게」의 진짜 답이다. */
  const css = app.match(/#foldList\{[^}]*\}/);
  assert.ok(css, '#foldList 규칙이 없습니다.');
  assert.ok(/max-height:/.test(css[0]), '높이 상한이 없으면 폴더가 늘수록 아래가 밀립니다.');
  assert.ok(/overflow-y:auto/.test(css[0]), '넘치는 만큼 굴릴 수 없으면 폴더를 못 봅니다.');
});

test('★ 폴더 줄이 낮아졌다', () => {
  const css = app.match(/#foldList \.fold\{[^}]*\}/);
  assert.ok(css, '#foldList .fold 규칙이 없습니다.');
  const pad = css[0].match(/padding:(\d+(?:\.\d+)?)px/);
  const font = css[0].match(/font-size:(\d+(?:\.\d+)?)px/);
  assert.ok(pad && Number(pad[1]) <= 6, '위아래 여백이 6px 이하여야 줄이 낮아집니다.');
  assert.ok(font && Number(font[1]) <= 12, '글자가 12px 이하여야 줄이 낮아집니다.');
});

/* ── 빈 줄 걷어내기 ── */
test('「보기」 제목 줄을 뺐다 — 아래 이름표가 이미 말해 준다', () => {
  assert.ok(!/<p class="sect">보기<\/p>/.test(app),
    '같은 말을 두 번 하는 줄입니다.');
});

test('★ 그래도 구역을 나누는 줄은 남는다', () => {
  /* 줄까지 없애면 올리기와 보기가 한 덩어리로 붙어, 2026-08-08 에 구역을
     지은 뜻이 사라진다. */
  /* ⚠ 줄머리에 붙은 것만 본다 — 폰 구간의 «#kinds,…,#ownerPick{display:none}» 이
     먼저 걸리면 엉뚱한 규칙을 보게 된다. */
  const css = app.match(/^#ownerPick\{[^}]*\}/m);
  assert.ok(css, '#ownerPick 자리 규칙이 없습니다.');
  assert.ok(/border-top:/.test(css[0]), '나누는 줄이 없으면 올리기와 보기가 붙어 보입니다.');
});

test('★ 「누구 사진」 이름표는 그대로 있다', () => {
  /* 2026-08-08 에 이 이름표를 뺐다가, 대표님이 기능 자체를 못 찾으셨다.
     줄 하나를 아끼려다 기능 하나를 숨긴 셈 — 다시는 빼지 않는다. */
  assert.ok(/id="ownerCap">누구 사진/.test(app),
    '이 칸이 무엇을 고르는 칸인지 알 수 없게 됩니다.');
});

test('ⓘ 안내는 사라지지 않고 자리만 옮겼다', () => {
  assert.ok(/openUpHelp\(\)/.test(app), '안내로 가는 길이 없어졌습니다.');
  const cap = app.match(/id="ownerCap">[\s\S]{0,200}?<\/p>/);
  assert.ok(cap && /openUpHelp/.test(cap[0]),
    '제 줄을 쓰던 것을 이름표 줄로 옮겨야 한 줄이 빕니다.');
});

/* ── 확인 필요는 누구 것인가 ── */
test('★ 전 직원을 볼 때는 누구 것인지 꼬리표가 붙는다', () => {
  /* 세는 규칙은 이미 맞다 — 담당자는 「누구 사진」에 남을 고를 줄이 아예 없고,
     총괄 관리자만 전 직원을 볼 수 있다. 다만 글자만 봐서는 내 것 3장인지
     전 직원 3장인지 구분이 안 됐다. */
  const fn = app.match(/function renderNeedBox\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'renderNeedBox 를 찾지 못했습니다.');
  assert.ok(/gridOwner === ALL_OWNERS/.test(fn[0]),
    '전 직원을 보는 중인지 안 가리면 꼬리표가 늘 붙거나 늘 안 붙습니다.');
  assert.ok(/전 직원/.test(fn[0]), '꼬리표 글자가 없습니다.');
});

test('담당자는 남의 확인 필요를 볼 길이 없다', () => {
  /* 관리자가 아니면 고르개가 「내 사진」과 「나와 공유된 사진」 두 줄뿐이다 —
     전 직원을 고를 수 없으니 셀 것도 내 것뿐이다. */
  const fn = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'renderOwnerPick 을 찾지 못했습니다.');
  const at = fn[0].indexOf('amAdmin()');
  const back = fn[0].indexOf('return;', at);
  assert.ok(at > 0 && back > at, '관리자가 아닐 때 되돌아가는 곳이 없습니다.');
  const notAdmin = fn[0].slice(at, back);
  assert.ok(!notAdmin.includes('ALL_OWNERS'),
    '직원에게 「전체 근로자」를 주면 남의 확인 필요까지 보게 됩니다.');
  assert.ok(/SHARED_OWNER/.test(notAdmin),
    '공유받은 사진은 직원도 볼 수 있어야 합니다 — 함께 지우면 안 됩니다.');
});

/* ── PDF 화질 ── */
test('★ PDF를 200dpi 넘게 담는다', () => {
  /* 배율 2 는 A4 가 1190×1683 — 144dpi 다. 큰 글씨는 읽히지만 특약처럼
     작은 글씨는 여유가 없다(대표 보고 2026-08-10). */
  const fn = app.match(/async function pdfToPages\([\s\S]*?\n\}/);
  assert.ok(fn, 'pdfToPages 를 찾지 못했습니다.');
  const m = fn[0].match(/getViewport\(\{ scale: (\d+(?:\.\d+)?) \}\)/);
  assert.ok(m, '배율을 정하는 곳이 없습니다.');
  assert.ok(Number(m[1]) >= 2.8,
    '배율 ' + m[1] + ' 는 200dpi 에 못 미칩니다 — 작은 글씨가 안 읽힙니다.');
});

test('키운 PDF가 저장 층 상한에 걸려 도로 줄지 않는다', () => {
  /* A4 를 배율 3 으로 그리면 긴 쪽이 2525px 이다. 서류 상한(3200)보다 작아야
     키운 보람이 있다 — 상한을 넘으면 저장하면서 도로 줄여 버린다. */
  const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-store.js'), 'utf8');
  const spec = store.match(/function uploadSpec\([\s\S]*?\n  \}/);
  assert.ok(spec, 'uploadSpec 을 찾지 못했습니다.');
  const doc = spec[0].match(/maxEdge: (\d+), quality: [\d.]+, thumbEdge: \d+ \}\s*:/);
  assert.ok(doc, '서류 쪽 상한을 찾지 못했습니다.');
  const scale = Number(app.match(/getViewport\(\{ scale: (\d+(?:\.\d+)?) \}\)/)[1]);
  assert.ok(842 * scale <= Number(doc[1]),
    'A4 긴 쪽 ' + Math.round(842 * scale) + 'px 이 상한 ' + doc[1] + 'px 을 넘어 도로 줄어듭니다.');
});
