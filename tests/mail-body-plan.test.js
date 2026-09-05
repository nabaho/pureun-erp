/* 본문을 «통째로» 받을까, «조각만» 받을까 (대표 지시 2026-09-05)
   「내용 가지고 오기 시간 너무 많이 걸린다」

   ★ 뿌리 — 지금까지 «메일 크기»만 봤다(2MB 아래면 통째로). 그런데 1.2MB PDF 가 붙은
     메일은 통째로 1.7MB 를 받아 놓고 글 세 줄을 보여 준다. 첨부는 누르기 «전»에는
     아무도 안 본다 — 그 1.7MB 가 그대로 기다림이 된다.
     (실측 2026-09-05 로그: 한 통 여는 데 3,563ms · 이웃 미리 받기까지 세 번)

   지키는 것.
   ① 첨부가 무거우면 «조각만» 받는다 — 크기만 보고 정하지 않는다
   ② 첨부가 없으면 옛길 그대로 — 통째로 받아도 더 받는 것이 없다
   ③ 미리 받기(peek)는 첨부가 «조금이라도» 있으면 조각만 — 열지도 않은 통이다
   ④ 본문 조각을 «모르면» 통째로 — 조각만 받으면 본문이 통째로 빈다
   ⑤ 큰 메일은 예전처럼 조각만 — 되돌아가지 않는다
   ⑥ 잣대는 «한 자리»다 — 여는 자리에서 따로 세지 않는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const MS = require(path.join(root, 'functions', 'mail-sync.js'));
const src = fs.readFileSync(path.join(root, 'functions', 'mail-sync.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

const { bodyPlan, BODY_PART_ATT, BODY_FULL_MAX } = MS;
const P = (atts, hasHtml) => ({ html: hasHtml === false ? null : '1.2', text: null, atts: atts || [] });
const MB = 1024 * 1024;

/* ══════ ① 첨부가 무거우면 조각만 ══════ */

test('★★ 첨부가 무거우면 «조각만» 받는다 — 크기만 보고 정하지 않는다', () => {
  /* 대표 화면에 있던 그 메일이다 — 1.2MB PDF 한 장, 메일 통째로는 1.7MB */
  assert.equal(bodyPlan(P([{ size: 1.2 * MB }]), 1.7 * MB, false), 'part',
    '1.2MB PDF 를 글 세 줄 보려고 통째로 받습니다 — 이것이 「너무 오래 걸린다」의 뿌리였습니다');
});

test('★★ 무겁다는 잣대가 «있다» — 없으면 작은 첨부까지 갈아타 이상한 구조에서 본문이 빈다', () => {
  assert.ok(BODY_PART_ATT > 0, '첨부 무게 문턱이 없습니다');
  assert.ok(BODY_PART_ATT < BODY_FULL_MAX,
    '문턱이 메일 크기 한도보다 큽니다 — 그러면 아무것도 안 걸러집니다');
  /* 문턱 «바로 위»는 조각, «바로 아래»는 통째 — 잣대가 실제로 쓰이는지 본다 */
  assert.equal(bodyPlan(P([{ size: BODY_PART_ATT + 1 }]), 300 * 1024, false), 'part');
  assert.equal(bodyPlan(P([{ size: BODY_PART_ATT - 1 }]), 300 * 1024, false), 'full');
});

test('★★ 첨부 여럿이면 «합쳐서» 센다 — 한 장씩 보면 열 장이 다 통과한다', () => {
  const many = [];
  for (let i = 0; i < 10; i++) many.push({ size: Math.floor(BODY_PART_ATT / 3) });
  assert.equal(bodyPlan(P(many), 1.5 * MB, false), 'part',
    '작은 첨부 열 장(합쳐서 문턱의 세 배)을 통째로 받습니다');
});

/* ══════ ② 첨부가 없으면 옛길 ══════ */

test('★★ 첨부가 «없으면» 옛길 그대로 — 통째로 받아도 더 받는 것이 없다', () => {
  assert.equal(bodyPlan(P([]), 40 * 1024, false), 'full',
    '첨부도 없는 작은 메일까지 조각으로 돌립니다 — 얻는 것 없이 길만 바꿉니다');
  assert.equal(bodyPlan(P([]), 40 * 1024, true), 'full',
    '미리 받기라고 첨부도 없는 메일의 길을 바꿉니다');
});

/* ══════ ③ 미리 받기 ══════ */

test('★★ 미리 받기는 첨부가 «조금이라도» 있으면 조각만 — 열어 보지도 않은 통이다', () => {
  const small = [{ size: Math.floor(BODY_PART_ATT / 4) }];
  assert.equal(bodyPlan(P(small), 300 * 1024, true), 'part',
    '이웃 두 통을 미리 받느라 첨부까지 받아 둡니다 — 기다림도 요금도 헛됩니다');
  /* 사람이 «직접 열 때»는 그 작은 첨부쯤은 통째로 받아도 된다 */
  assert.equal(bodyPlan(P(small), 300 * 1024, false), 'full',
    '사람이 여는 길까지 함께 바꾸면 안 됩니다 — 잣대가 서로 달라야 하는 자리입니다');
});

/* ══════ ④⑤ 넘지 말아야 할 선 ══════ */

test('★★ 본문 조각을 «모르면» 통째로 받는다 — 조각만 받으면 본문이 통째로 빈다', () => {
  const noBody = { html: null, text: null, atts: [{ size: 5 * MB }] };
  assert.equal(bodyPlan(noBody, 6 * MB, false), 'full',
    '어디서 받을지도 모르면서 조각만 받습니다 — 화면에 「본문이 없습니다」가 뜹니다');
  assert.equal(bodyPlan(noBody, 6 * MB, true), 'full');
});

test('★★ 큰 메일은 예전처럼 조각만 — 되돌아가지 않는다', () => {
  assert.equal(bodyPlan(P([]), BODY_FULL_MAX + 1, false), 'part',
    '2MB 넘는 메일을 통째로 받습니다 — 예전에 그래서 느렸습니다');
});

test('★ 글(text/plain)뿐인 메일도 조각을 안다', () => {
  const onlyText = { html: null, text: '1', atts: [{ size: 1.2 * MB }] };
  assert.equal(bodyPlan(onlyText, 1.5 * MB, false), 'part',
    'html 이 없으면 조각을 모르는 것으로 봅니다 — 글만 있는 메일이 통째로 받아집니다');
});

test('★ 크기를 «모르는» 메일도 무너지지 않는다', () => {
  assert.equal(bodyPlan(P([]), 0, false), 'part');
  assert.equal(bodyPlan(P([]), undefined, false), 'part');
  assert.equal(bodyPlan(null, 100, false), 'full', '구조가 없으면 통째로 — 그것이 안전한 쪽입니다');
});

/* ══════ ⑥ 잣대가 한 자리인가 ══════ */

test('★★ 여는 자리가 «제 나름대로» 세지 않는다 — 두 곳이 어긋나면 아무도 못 찾는다', () => {
  const i = src.indexOf('readMailMessage:');
  assert.ok(i > 0, 'readMailMessage 를 못 찾았습니다');
  const body = src.slice(i, i + 3000);
  assert.match(body, /bodyPlan\(parts,\s*size,\s*peek\)/, '여는 자리가 잣대를 안 씁니다');
  assert.ok(!/size\s*<=\s*BODY_FULL_MAX/.test(body),
    '여는 자리에 옛 잣대(크기만 보기)가 그대로 남아 있습니다');
});

test('★★ 미리 묻기(OPTIONS)를 담아 둔다 — 메일 한 통에 서울 왕복이 두 번이었다', () => {
  const idx = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8')
    .replace(/\/\/[^\n]*/g, ' ');
  const m = idx.match(/Access-Control-Max-Age"?,\s*"(\d+)"/);
  assert.ok(m, '미리 묻기를 담아 두지 않습니다 — 브라우저 기본은 5초라 매번 다시 묻습니다');
  assert.ok(Number(m[1]) >= 600, '담아 두는 시간이 ' + m[1] + '초뿐입니다');
  /* ⚠ 본문·토큰까지 담으면 안 된다 — 담는 것은 「무엇을 허용하는가」뿐이다 */
  assert.match(idx, /Cache-Control"?,\s*"no-store"/,
    '응답 자체를 담지 말라는 표시가 사라졌습니다 — 메일 본문이 브라우저에 남습니다');
});
