'use strict';
/* 최초 자료 만들기 — 백업 파일에서 뽑아낸다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildInitial } = require('../scripts/homepage-import');

const BK = path.join(__dirname, '..', 'docs', 'homepage-backup', '2026-08-16');
const readFile = (name) => fs.readFileSync(path.join(BK, name), 'utf8');

test('구성원 9명을 자료로 만든다', () => {
  const data = buildInitial(readFile);
  assert.equal(Object.keys(data.members).length, 9);
  assert.equal(data.members['190'].name, '권형하');
  assert.ok(data.members['190'].careers.length > 10);
});

test('관리 대상 쪽을 모두 담는다', () => {
  const data = buildInitial(readFile);
  ['work1', 'work2', 'work3', 'work4', 'work5a', 'work5b', 'inquiry', 'greeting']
    .forEach(mid => assert.ok(data.pages[mid], mid + ' 가 빠졌다'));
});

test('찌꺼기 태그는 자료에 담지 않는다', () => {
  const data = buildInitial(readFile);
  Object.values(data.members).forEach(m =>
    m.careers.forEach(line => assert.ok(!/[<>]/.test(line), line)));
});

// === 안전장치: 백업이 비었거나 구성원/본문이 부족할 때 예외 ===

test('백업이 비었을 때 예외를 던진다', () => {
  const mockReadFile = (name) => '';
  assert.throws(
    () => buildInitial(mockReadFile),
    /구성원을.*기대했/,
    '빈 백업에서는 예외가 나야 한다'
  );
});

test('구성원이 예상보다 적을 때 예외를 던진다', () => {
  // 실제 people.html을 읽되, 마지막 bh_modal 블록을 제거해서 8명만 반환
  const realPeopleHtml = fs.readFileSync(path.join(BK, 'people.html'), 'utf8');
  // 마지막의 id="bh_modal_322" 블록과 그 이후 내용을 제거
  const truncatedPeople = realPeopleHtml.replace(/<div id="bh_modal_322"[\s\S]*$/, '');

  const mockReadFile = (name) => {
    if (name === 'people.html') return truncatedPeople;
    return fs.readFileSync(path.join(BK, name), 'utf8');
  };

  assert.throws(
    () => buildInitial(mockReadFile),
    /9명 기대.*8명/,
    '구성원이 예상보다 적으면 예외가 나야 한다'
  );
});

test('쪽의 본문이 비었을 때 예외를 던진다', () => {
  // work1.html이 content_inner는 있지만 안이 비어있는 HTML을 반환
  const emptyWork1 = '<html><body><div class="content_inner clearfix">   </div><footer></footer></body></html>';

  const mockReadFile = (name) => {
    if (name === 'work1.html') return emptyWork1;
    return fs.readFileSync(path.join(BK, name), 'utf8');
  };

  assert.throws(
    () => buildInitial(mockReadFile),
    /work1.*본문.*비었/,
    'work1의 본문이 비어있으면 예외가 나야 한다'
  );
});
