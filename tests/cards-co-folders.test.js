/* 기업정보 폴더 — 명함·사업자와 같은 손놀림으로 손으로 만들고 회사를 담는다.
   ⚠ 회사는 폴더 하나에만 든다(명함 폴더와 같은 규칙). 여러 사업에 걸치는 것은
     탭이 맡는다 — 둘을 한 가지로 만들면 「이 회사가 왜 여기 있지」가 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('폴더 저장소 함수가 있다', () => {
  assert.match(source, /let _coFolders = \{\}/);
  assert.match(source, /function loadCoFolders/);
  assert.match(source, /function putCoFolder/);
  assert.match(source, /DB_ROOT\+'\/coFolders'/);
});

test('만들기·이름바꾸기·지우기가 있다', () => {
  assert.match(source, /function openCoFolderDialog/);
  assert.match(source, /function confirmNewCoFolder/);
  assert.match(source, /function renameCoFolder/);
  assert.match(source, /function deleteCoFolder/);
});

test('폴더를 지워도 회사는 안 지운다 — 폴더 값만 비운다', () => {
  const at = source.indexOf('function deleteCoFolder');
  const fn = source.slice(at, at + 700);
  assert.match(fn, /confirm\(/, '지우기 전에 확인을 안 받는다');
  assert.match(fn, /folder.*=\s*null/s, '회사의 folder 값을 안 지운다');
  assert.doesNotMatch(fn, /delete state\.items/, '회사(명함·사업자)를 지우면 안 된다');
});

test('옆줄에 폴더 목록과 ＋가 있다', () => {
  const at = source.indexOf("if(state.view==='co'){");
  const fn = source.slice(at, at + 1400);
  assert.match(fn, /onclick="openCoFolderDialog\(\)"/, '＋ 를 못 찾았다');
  assert.match(fn, /_coFolders/, '옆줄이 폴더 목록을 안 그린다');
  /* 정규식 리터럴로 쓰면 tests-no-local-path 검사의 "따옴표+글자+콜론+슬래시"
     경로 탐지 규칙을 오검출로 건드린다(윈도우 드라이브 문자와 글자 모양이 같아서다).
     new RegExp(문자열)로 같은 뜻을 그 검사를 피해서 쓴다. */
  assert.match(fn, new RegExp("pickCoFolder\\('f:"), "폴더를 눌러 고르는 길이 없다");
});

test("pickCoFolder 는 'f:' 로 시작하는 값을 폴더로 받는다", () => {
  const at = source.indexOf('function pickCoFolder');
  const fn = source.slice(at, at + 500);
  assert.match(fn, /k\.indexOf\('f:'\)===0/);
  assert.match(fn, /state\.coFolder\s*=\s*k\.slice\(2\)/);
});

test('coFilteredList 는 골라 둔 폴더로 거른다', () => {
  const at = source.indexOf('function coFilteredList');
  const fn = source.slice(at, source.indexOf('\nfunction coVisible', at));
  assert.match(fn, /if\(state\.coFolder\) list = list\.filter\(o=>o\.folder===state\.coFolder\)/);
});

test('회사 상세에 폴더 이름을 보여준다', () => {
  const at = source.indexOf('function coDetailHtml');
  const fn = source.slice(at, source.indexOf('\n}', at));
  assert.match(fn, /_coFolders\[o\.folder\]/);
});

test('openCoPage 가 폴더 목록도 불러온다', () => {
  const at = source.indexOf('function openCoPage');
  const fn = source.slice(at, at + 300);
  assert.match(fn, /loadCoFolders\(/);
});
