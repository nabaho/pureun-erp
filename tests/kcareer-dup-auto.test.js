/* 경력관리 — 중복 자동 정리 (대표 지시 2026-09-02 「중복 자동 정리」)

   ■ 기존 중복관리로는 한 묶음도 못 잡았다
     dupKey 는 기관 10자 + 이름 6자 + 날짜가 «완전히 같아야» 중복으로 본다. 그런데 실제로
     겹친 줄들은 이름이 조금씩 다르다 —
       「NCS 기업활용 컨설팅 교육 수료」 ↔ 「2024년 NCS 기업활용 컨설팅 교육 (2024-1기)(수료)」
     이름 6자가 'ncs기업활' vs '2024년n' 이라 남남으로 봤다.

   ■ 안전 장치 (지우는 일이므로 느슨하게 고치지 말 것)
     ⑴ 원본이 «없는» 줄만 지운다 → 파일은 하나도 잃을 수 없다.
     ⑵ 해가 같아야 한다. ⑶ 이름 낱말이 6할(기관 같을 때)·10할(기관 다를 때) 겹쳐야 한다.
     ⑷ 미리보기 → 확인 → 되돌리기. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

test('★★ 원본이 «없는» 줄만 지운다 — 그래서 파일을 잃을 수 없다', () => {
  const fn = cutFn(source, 'function dupAutoFind(');
  assert.match(fn, /if\(hasOriginal\(r\)\) return;/,
    '원본이 있는 줄을 지우려 들면 되돌릴 수 없는 손실이 납니다');
  assert.match(fn, /var haves = db\.filter\(hasOriginal\)/,
    '남길 쪽은 반드시 원본이 있는 줄이어야 합니다');
});

test('★★ 해가 다르면 별개 문서 — 손대지 않는다', () => {
  const fn = cutFn(source, 'function dupAutoFind(');
  assert.ok(fn.indexOf('if(!/^\\d{4}$/.test(y)) return;') > 0, '해를 모르면 판단하지 않습니다');
  assert.match(fn, /if\(hy !== y\) return;/);
});

test('★★ 문턱을 낮추지 말 것 — 기관 같으면 6할, 기관 다르면 10할', () => {
  const fn = cutFn(source, 'function dupAutoFind(');
  assert.match(fn, /\(bestSameOrg && pct >= 0\.6\) \|\| \(pct === 1 && t\.length >= 3\)/,
    '문턱을 낮추면 남남인 줄이 지워집니다');
  assert.match(fn, /if\(t\.length < 2\) return;/, '이름이 너무 짧으면 믿을 수 없습니다');
});

test('★ 기관 이름이 달라도 같은 과정일 수 있다 — 그 경우만 10할', () => {
  const fn = cutFn(source, 'function dupAutoFind(');
  assert.match(fn, /HRDCONTENTS/,
    '실측 사례(주관 vs 위탁)를 주석으로 남겨 두어야 문턱의 까닭이 전해집니다');
  assert.match(cutFn(source, 'function dupAutoPreview('), /기관 다름/,
    '기관이 다른 짝은 화면에서 드러내야 사람이 걸러낼 수 있습니다');
});

test('★★ 남길 줄의 «빈 칸»만 채운다 — 차 있는 값을 덮으면 안 된다', () => {
  const fn = cutFn(source, 'function dupAutoRun(');
  assert.match(fn, /if\(!keep\[k\] && drop\[k\]\) keep\[k\] = drop\[k\]/);
  assert.match(fn, /var SKIP = \{id:1, savedAt:1, fname:1, src:1, relPath:1/,
    '원본을 가리키는 칸을 옮기면 남는 줄의 원본이 어긋납니다');
});

test('★★ 지운 줄을 담아 두고 되돌릴 수 있다', () => {
  assert.match(cutFn(source, 'function dupAutoRun('), /_dupAutoStash\(stash\)/);
  const un = cutFn(source, 'function dupAutoUndo(');
  assert.match(un, /unshift\(it\.rec\)/);
  assert.match(un, /some\(function\(r\)\{ return r\.id === it\.rec\.id; \}\)\) return;/,
    '두 번 되돌려도 늘어나지 않아야 합니다');
});

test('★ 지우기 전에 미리보기와 확인을 거친다 — 말없이 지우지 않는다', () => {
  const fn = cutFn(source, 'function dupAutoRun(');
  assert.match(fn, /if\(!confirm\(/);
  assert.match(fn, /파일은 잃지 않습니다/, '무엇이 안전한지 밝혀야 합니다');
});

test('★ 입구는 중복관리 창 머리 — 빈 목록일 때도 보인다', () => {
  assert.match(source, /function _dupAutoBar\(/);
  const r = cutFn(source, 'function renderDup(');
  assert.equal((r.match(/_dupAutoBar\(\)/g) || []).length, 2,
    '중복이 없을 때도 자동 정리 단추가 보여야 합니다 — 없으면 들어갈 길이 없습니다');
});
