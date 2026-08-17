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
