'use strict';
/* 서고 ⑤ 원본 파일 — 붙여넣기용 Storage 규칙 한 칸 (설계서 §5-⑤ · §10-1)

   ★ 왜 검사하나 — 이 파일은 «사람이 콘솔에 붙여넣는» 글이다. 한 글자가 조용히
     바뀌어도 게시는 그냥 되고, 하필 그것이 allow 안이면 남의 서류가 열린다.
     그래서 「무엇을 열었는가」를 기계가 못 박는다.

   ⚠ 서고는 «직원 전체»가 본다(설계서 §6). 사진첩(본인만)과 다른 것은 «의도된 차이»다 —
     사례집이 목적이라 그렇게 정했다. 그래서 여기서는 isStaff() 가 맞고,
     오히려 request.auth.uid == uid 로 좁혀 놓으면 사례집이 안 된다.

   실행: node --test tests/casebook-storage-rule.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RULES = fs.readFileSync(
  path.join(ROOT, 'docs/firebase-storage-전체(붙여넣기용).txt'), 'utf8').replace(/\r\n/g, '\n');

/* 서고 칸 한 덩어리만 잘라 온다 */
function seg() {
  const i = RULES.indexOf('match /casebook/');
  assert.ok(i >= 0,
    '서고 원본 파일 칸이 없습니다 — 그러면 원본이 「전부 막는다」에 걸려 안 담깁니다');
  const j = RULES.indexOf('}', RULES.indexOf('allow delete', i));
  return RULES.slice(i, j + 1);
}

test('★ 자리가 설계서와 같다 — casebook/{사업장}/{회차}/{파일}', () => {
  assert.match(RULES, /match \/casebook\/\{siteKey\}\/\{revId\}\/\{file\}/,
    'paths.file() 이 만드는 자리와 어긋나면 조용히 다 막힙니다');
});

test('★★ 직원 전체가 읽는다 — 서고는 사례집이다(설계서 §6)', () => {
  const s = seg();
  assert.match(s, /allow read:\s*if isStaff\(\)/,
    '읽기를 본인으로 좁히면 남의 사례를 못 봅니다 — 그러면 서고를 만든 까닭이 없어집니다');
});

test('★ 쓰기·지우기도 직원 — 창고 규칙은 실시간DB(ownerUid)를 못 읽는다', () => {
  const s = seg();
  assert.match(s, /allow write:\s*if isStaff\(\)/);
  assert.match(s, /allow delete:\s*if isStaff\(\)/);
});

test('★★ 크기를 막는다 — 아니면 창고가 통째로 열린다', () => {
  const s = seg();
  const m = /request\.resource\.size\s*<\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(s);
  assert.ok(m, '크기 한도가 없습니다: ' + s);
  const mb = Number(m[1]);
  assert.ok(mb >= 10 && mb <= 30,
    '한도가 ' + mb + 'MB 입니다 — 너무 작으면 한글 원본이 막히고, 너무 크면 창고가 헐거워집니다');
  assert.match(s, /request\.resource != null/,
    'null 을 안 막으면 크기 검사가 통째로 건너뛰어집니다');
});

test('★★ 종류로는 안 묶는다 — 한글은 브라우저가 종류를 안 알려 준다', () => {
  assert.ok(!/okImage\(\)/.test(seg()),
    'okImage 를 걸면 한글·PDF 원본이 통째로 막힙니다(급여데이터함·사진첩 원본이 이미 겪은 일)');
});

test('★★ 「전부 막는다」보다 «앞»에 있다 — 뒤에 있으면 아무 일도 안 한다', () => {
  const mine = RULES.indexOf('match /casebook/');
  const deny = RULES.indexOf('match /{allPaths=**}');
  assert.ok(deny > mine,
    'catch-all 뒤에 두면 규칙이 있어도 원본이 막힙니다');
});

test('★ 남의 칸을 건드리지 않았다 — 이 파일은 «하나도 빼지 않는다»가 원칙이다', () => {
  ['match /pucards/photos/', 'match /pucards/mailout/', 'match /pu_photos/u/{uid}/',
    'match /pu_photos/u/{uid}/origs/', 'match /gov_evidence/', 'match /pu_paydata/']
    .forEach((m) => assert.ok(RULES.indexOf(m) >= 0, m + ' 이 사라졌습니다'));
  ['signedIn()', 'isStaff()', 'okImage()', 'okPayFile()']
    .forEach((f) => assert.ok(RULES.indexOf('function ' + f) >= 0, f + ' 가 사라졌습니다'));
});

test('★ 머리말이 이번에 더한 것을 말한다 — 붙여넣는 사람이 무엇이 바뀌었는지 알아야 한다', () => {
  const head = RULES.slice(0, RULES.indexOf('service firebase.storage'));
  assert.match(head, /2026-09-07/, '더한 날짜가 머리말에 없습니다');
  assert.match(head, /서고/, '무엇을 더했는지 머리말에 없습니다');
  assert.match(head, /이 칸이 없으면[\s\S]{0,80}원본만/,
    '안 넣었을 때 무엇이 안 되는지 적어야 합니다 — 붙여넣기를 미룰 수 있게');
});

test('★ 창고 이름을 말한다 — 어느 창고에 붙여넣어야 하는지', () => {
  /* 버킷은 새로 만들지 않는다(설계서 §10-1). 기존 hrphotos 를 쓴다. */
  const i = RULES.indexOf('match /casebook/');
  const before = RULES.slice(Math.max(0, i - 1500), i);
  assert.match(before, /pureun-erp-hrphotos/,
    '어느 창고인지 안 적으면 엉뚱한 창고에 붙여넣습니다');
});
