/* 경력관리 — 화면에서 «직접 고치기» (대표 지시 2026-09-05 「여기화면에서 직접 수정이 가능하도록」)

   ■ 무엇이 문제였나
     「✨ 내 정보로 채우기」가 값을 «문서에 구워 넣고» 그 결과를 _rhDoc 으로 바꿨다.
     그러면 채워진 칸은 더는 «빈 칸»이 아니라 입력판이 그 자리에 입력칸을 안 만든다
     — 자동으로 들어간 주소·전화·기관명을 화면에서 «고칠 수가 없었다».
     실측(대표 화면): 노란 칸이 「(한자)」·「자택:」 두 곳만 남아 있었다.

   ■ 왜 한글 편집기로 안 풀었나 (실측 2026-09-05)
     rhwp 편집기는 뜬다(리본·눈금자·A4 다 보인다). 그러나 getSelectionContext 가
     «editable: false» 를 준다 — 읽기 «전용» 뷰어다. 실제로 눌러 쳐 봐도 changeSeq 가 0 이다.
     그래서 고치는 길은 입력판(겹치기 입력칸)뿐이다.

   ■ 어떻게 고쳤나
     _rhBase(처음 올린 원본)와 _rhDoc(보여 주는 문서)을 갈랐다.
     입력판과 되돌려 넣기는 «원본»을, 화면·PDF·저장은 채워진 문서를 쓴다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('★★ 입력판은 «원본»을 그린다 — 채워진 문서를 그리면 고칠 칸이 사라진다', () => {
  const fn = cutFn(bare, 'async function rhBuildInput(');
  assert.match(fn, /var _b=_rhBase\|\|_rhDoc;/);
  assert.match(fn, /_rhToHwpx\(_b\.bytes,_b\.name\)/);
  assert.doesNotMatch(fn, /_rhToHwpx\(_rhDoc\.bytes/, '★ 채워진 문서를 그리면 안 됩니다');
});

test('★★ 되돌려 넣기도 «원본» 위에서 — 두 번 넣으면 「권형하권형하」가 된다', () => {
  const fn = cutFn(bare, 'async function rhComposeBytes(');
  assert.match(fn, /var base=_rhBase\|\|_rhDoc;/);
  assert.match(fn, /_rhToHwpx\(base\.bytes,base\.name\)/);
});

test('★★ 목록 표(학력·경력) 계획을 남겨 되돌려 넣을 때 함께 적용한다', () => {
  /* 목록은 여러 줄이라 겹치기 입력칸으로 담을 수 없다. 계획을 안 남기면
     「원본 한글에 넣기」를 누르는 순간 학력·경력 줄이 통째로 사라진다. */
  assert.match(cutFn(bare, 'async function rhFillByMap('), /_rhListPlan\[n\]=wantLists/);
  assert.match(cutFn(bare, 'async function rhComposeBytes('),
    /_rhListPlan&&_rhListPlan\[n\][\s\S]{0,200}lists:lists/);
});

test('★★ 채운 결과를 올릴 때 바탕을 바꾸지 않는다', () => {
  /* 바꾸면 「이미 채워진 것」이 바탕이 되어 되돌려 넣을 때 값이 두 번 들어간다. */
  const fill = cutFn(bare, 'async function rhFillByMap(');
  assert.match(fill, /_rhKeepBase=true;[\s\S]{0,200}mountEditor/);
  assert.match(fill, /finally\{ _rhKeepBase=false; \}/, '★ 던져도 반드시 되돌려야 합니다');
  const mount = cutFn(bare, 'async function mountEditor(');
  assert.match(mount, /if\(!_rhKeepBase\)\{ _rhBase=/);
});

test('★ 새 서식을 올리면 바탕·값·목록 계획을 모두 새로 시작한다', () => {
  const mount = cutFn(bare, 'async function mountEditor(');
  assert.match(mount, /_rhListPlan=null; _rhVals=\{\}/);
});

test('★ 칸 지도를 못 만든 예비 길은 «채운 것»이 바탕이다', () => {
  /* 그 길은 값을 _rhVals 에 담지 않는다 — 원본을 바탕으로 두면 채운 내용이 저장에서 사라진다. */
  const fn = cutFn(bare, 'async function rhAutoFillDoc_사전(');
  assert.match(fn, /_rhBase=\{ name:_rhDoc\.name, ext:'hwpx', bytes:filled \}/);
});

test('★ 치우면 바탕도 비운다 — 다음 서식에 앞 값이 따라붙으면 안 된다', () => {
  assert.match(cutFn(bare, 'function rhCloseDoc('), /_rhBase=null; _rhListPlan=null; _rhVals=\{\}/);
});
