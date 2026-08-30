/* 목록 표의 «열 짝짓기»를 AI에게 묻는다 (대표 결정 2026-08-30 「을로」)
   ─────────────────────────────────────────────────────────────────
   왜: 인적사항(성명·생년월일·주소)은 사전으로 잘 되는데, 목록 표(학력·경력·자격증)는
       열 이름이 서식마다 달라 사전으로 끝이 안 난다. 실측된 사고들 —
       「자격증 표에 경력이 박힘」·「기간 칸에 기관명」·「학과명과 학위에 같은 값 두 번」
       은 전부 목록 표였다.

   ★ AI에게 «값»을 만들라고 하지 않는다. 값은 우리가 갖고 있다.
     모르는 것은 «어느 열에 넣을지»뿐이라 «머리행 글자만» 보낸다 —
     개인정보가 한 글자도 안 나가고, 싸고, 서식마다 한 번만 물으면 된다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/kcareer-colmap-ai.js');

const HEAD = ['기간(근무년수)', '직장명', '직 위', '담당업무(구체적)', '비 고'];

test('★ 보내는 것은 «머리행 글자»뿐이다 — 개인정보가 나가면 안 된다', () => {
  const p = A.buildPrompt(HEAD);
  HEAD.forEach((h) => assert.ok(p.indexOf(h) >= 0, h + ' 이(가) 물음에 있어야 합니다'));
  /* 값이 새어 들어갈 자리가 없다 — 프롬프트를 머리행만으로 만든다 */
  ['권형하', '1975', '@', '충남'].forEach((x) =>
    assert.equal(p.indexOf(x), -1, '값이 물음에 섞이면 안 됩니다: ' + x));
});

test('고를 수 있는 열쇠를 «물음 안에» 적는다 — 아무 말이나 돌려주면 못 쓴다', () => {
  const p = A.buildPrompt(HEAD);
  ['period', 'org', 'role', 'school', 'major', 'none'].forEach((k) =>
    assert.ok(p.indexOf(k) >= 0, k + ' 을(를) 골라 쓸 수 있다고 알려야 합니다'));
});

test('답을 읽어 열 짝짓기로 만든다', () => {
  const got = A.parseReply('["period","org","role","none","none"]', HEAD.length);
  assert.deepEqual(got, ['period', 'org', 'role', 'none', 'none']);
});

test('말이 섞여 와도 «대괄호 안»만 읽는다 — AI는 설명을 덧붙인다', () => {
  const got = A.parseReply('네, 다음과 같습니다.\n["period","org","role","none","none"]\n감사합니다',
    HEAD.length);
  assert.deepEqual(got, ['period', 'org', 'role', 'none', 'none']);
});

test('★ 개수가 안 맞으면 «버린다» — 한 칸만 밀려도 값이 엉뚱한 자리에 박힌다', () => {
  assert.equal(A.parseReply('["period","org"]', 5), null);
  assert.equal(A.parseReply('["a","b","c","d","e","f"]', 5), null);
});

test('★ 모르는 열쇠가 오면 «버린다» — 지어낸 말을 그대로 쓰면 안 된다', () => {
  assert.equal(A.parseReply('["period","회사","role","none","none"]', 5), null);
});

test('답이 아니면 버린다 — 조용히 이상한 것을 쓰지 않는다', () => {
  ['', '모르겠습니다', '{}', 'null', '[]'].forEach((x) =>
    assert.equal(A.parseReply(x, 5), null, JSON.stringify(x)));
});

test('★ 같은 열쇠가 두 번 오면 «첫 자리만» 남긴다 — 값이 두 칸에 들어간다', () => {
  const got = A.parseReply('["period","org","role","role","none"]', 5);
  assert.deepEqual(got, ['period', 'org', 'role', 'none', 'none']);
});

test('머리행 이름표는 «글자만» 보고 만든다 — 같은 서식이면 다시 안 묻는다', () => {
  assert.equal(A.headerKey(['기 간', '학교명']), A.headerKey(['기간', '학 교 명']),
    '공백 차이로 다시 묻게 하면 안 됩니다');
  assert.notEqual(A.headerKey(['기간', '학교명']), A.headerKey(['기간', '직장명']));
});

test('열이 둘 미만이면 «묻지 않는다» — 목록 표가 아니다', () => {
  assert.equal(A.buildPrompt(['비고']), null);
  assert.equal(A.buildPrompt([]), null);
});

test('none 만 돌아오면 «목록 표가 아니다»로 본다 — 억지로 채우지 않는다', () => {
  const got = A.parseReply('["none","none","none"]', 3);
  assert.equal(got, null, '쓸 열이 하나도 없으면 채울 것이 없습니다');
});

test('짝지은 것을 hwpxfill 이 쓰는 모양으로 바꾼다', () => {
  const kind = A.kindOf(['period', 'school', 'major']);
  assert.equal(kind, 'edu');
  assert.equal(A.kindOf(['period', 'org', 'role']), 'career');
  assert.equal(A.kindOf(['period', 'none', 'none']), '', '한 열만으로는 무슨 표인지 모릅니다');
});

/* ── 화면 연결 ── */
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('열 짝짓기 모듈과 AI 부르는 길을 함께 읽어 들인다', () => {
  assert.match(source, /js\/kcareer-colmap-ai\.js\?v=\d+/);
  assert.match(source, /js\/pu-ai-call\.js/, 'AI 부르는 길이 있어야 합니다');
});

test('★ AI에게 «머리행만» 보낸다 — 값을 보내면 개인정보가 나간다', () => {
  const at = bare.indexOf('async function rhColMap');
  const fn = bare.slice(at, at + 2600);
  assert.match(fn, /buildPrompt\(q\.cells\)/, '머리행 글자로만 물음을 만들어야 합니다');
  assert.doesNotMatch(fn, /_cvFillData\(\)/, '내 정보를 물음에 섞으면 안 됩니다');
});

test('★ 사전이 이미 알아본 머리행은 «묻지 않는다» — 돈과 시간을 아낀다', () => {
  const at = bare.indexOf('async function rhColMap');
  assert.match(bare.slice(at, at + 2600), /if\(hit>=2\) return;/);
});

test('★ 한 번 물으면 기억한다 — 같은 서식을 두 번 묻지 않는다', () => {
  assert.match(bare, /col_maps/);
  const at = bare.indexOf('async function rhColMap');
  const fn = bare.slice(at, at + 2600);
  assert.match(fn, /if\(out\[key\]\|\|all\[key\]\) return;/, '이미 아는 머리행은 건너뛰어야 합니다');
  assert.match(fn, /_rhColSave\(all\)/);
});

test('★ AI를 못 불러도 «그냥 간다» — 사전으로 돌아갈 뿐 멈추지 않는다', () => {
  const at = bare.indexOf('async function rhColMap');
  const fn = bare.slice(at, at + 2600);
  assert.match(fn, /if\(!window\.KcareerColMapAi \|\| !window\.PuAiCall\) return null;/);
  assert.match(fn, /catch\(e\)\{ console\.warn\('\[열짝짓기\]/, '고장나면 조용히 사전으로 가야 합니다');
});

test('★ 이상한 답은 버린다 — 지어낸 짝짓기를 쓰면 엉뚱한 자리에 박힌다', () => {
  const at = bare.indexOf('async function rhColMap');
  assert.match(bare.slice(at, at + 2600), /if\(!cols\) continue;/);
});

test('★ 채우기 전을 담아 두고 «되돌릴 수» 있다 — 잘못 들어가도 손해가 없어야 한다', () => {
  assert.match(bare, /function rhUndoFill/);
  assert.match(bare, /_rhUndo=\{ name:_rhDoc\.name/, '채우기 전 원본을 담아야 합니다');
  assert.match(source, /id="rhUndoBtn"/);
  const at = bare.indexOf('async function rhFillByMap');
  assert.ok(bare.slice(at, at + 900).indexOf('_rhUndo=') > 0, '채우기 «전»에 담아야 합니다');
});

test('되돌리기 단추는 채운 뒤에만 뜬다 — 늘 떠 있으면 무엇을 되돌리는지 모른다', () => {
  assert.match(source, /id="rhUndoBtn"[^>]*style="display:none"/);
  assert.match(bare, /function rhUndoBtn\(\)/);
});
