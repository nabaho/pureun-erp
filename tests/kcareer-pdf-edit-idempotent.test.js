'use strict';
/* 경력관리 — PDF 서식 채우기: «저장을 두 번 눌러도 같은 결과» 를 지킨다 (2026-09-03)

   ■ 무슨 일이 있었나
   PDF 편집은 올린 문서(_pdfEditDoc) 에 글자를 곧바로 그려 넣고 그 문서를 저장했다.
   문서를 덮어쓰는 방식이라 결함이 셋 딸려 있었다 —

     ① 저장을 두 번 누르면 글자가 «두 번» 그려진다. 한글 폰트를 심게 고친 뒤로는
        2MB 폰트도 두 번 실려 파일이 눈에 띄게 커진다.
     ② 저장한 뒤에는 「되돌리기」가 안 먹는다. 목록에서만 빠지고 문서에는 남는다.
     ③ 되돌리기가 다시 그릴 때 «남은 글자들» 의 미리보기까지 통째로 사라진다.

   셋 다 한 뿌리다 — 원본을 안 지킨 것. 그래서 «원본 바이트를 붙잡아 두고, 저장할
   때마다 그 원본에서 새 문서를 짓는» 방식으로 바꿨다. 이 검사가 그것을 지킨다.

   ■ 무엇을 보나 (모양이 아니라 규칙)
   함수 이름·글줄이 바뀌어도 깨지지 않게, «누가 무엇을 읽고 쓰는가» 만 본다:
     - 저장은 원본에서 «새 문서» 를 짓는다 (편집 중인 것에 그리지 않는다)
     - 미리보기도 원본을 그린다
     - 다시 그린 뒤 넣어 둔 글자를 «다시 얹는다» */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const bare = stripComments(fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8'));

test('올린 PDF 의 원본 바이트를 붙잡아 둔다', () => {
  const fn = cutFn(bare, 'async function loadPdfForEdit(');
  assert.ok(fn, 'loadPdfForEdit 가 없다');
  assert.ok(/_pdfEditSrc\s*=/.test(fn),
    '원본을 안 붙잡아 두면 저장할 때 편집 중인 문서에 덮어 그릴 수밖에 없다');
});

test('저장은 «원본에서 새 문서» 를 지어 그린다 — 두 번 눌러도 같다', () => {
  const fn = cutFn(bare, 'async function savePdfEdited(');
  assert.ok(fn, 'savePdfEdited 가 없다');
  assert.ok(/PDFDocument\.load\s*\(\s*_pdfEditSrc/.test(fn),
    '저장할 때 원본에서 새 문서를 짓지 않는다 — 두 번 저장하면 글자가 두 번 그려지고\n' +
    '    한글 폰트(2MB)도 두 번 실린다');
  assert.ok(!/_pdfEditDoc\s*\.\s*(getPages|save|embedFont)/.test(fn),
    '편집 중인 문서에 직접 그리거나 저장하면, 저장을 누른 순간부터 되돌리기가 안 먹는다');
});

test('미리보기도 원본을 그린다 (이미 그린 글자가 겹쳐 보이지 않게)', () => {
  const fn = cutFn(bare, 'async function _renderPdfEditPage(');
  assert.ok(fn, '_renderPdfEditPage 가 없다');
  assert.ok(/_pdfEditSrc/.test(fn), '미리보기가 원본을 안 쓴다');
  assert.ok(!/_pdfEditDoc\s*\.\s*save\s*\(/.test(fn),
    '편집 중인 문서를 저장해 그리면 저장 뒤부터 글자가 겹쳐 보인다');
});

test('다시 그린 뒤 넣어 둔 글자를 «다시 얹는다»', () => {
  const fn = cutFn(bare, 'async function _renderPdfEditPage(');
  assert.ok(/_pdfEditRepaint\s*\(/.test(fn),
    '다시 얹지 않으면 되돌리기 한 번에 남은 글자들의 미리보기까지 다 사라진다');
  const rp = cutFn(bare, 'function _pdfEditRepaint(');
  assert.ok(rp, '_pdfEditRepaint 가 없다');
  assert.ok(/_pdfEditTexts/.test(rp) && /fillText/.test(rp),
    '_pdfEditRepaint 가 넣어 둔 글자를 캔버스에 그리지 않는다');
  assert.ok(/pageIdx/.test(rp),
    '쪽을 안 가리면 2쪽의 글자가 1쪽에 얹힌다');
});

test('넣을 때와 다시 얹을 때의 «자리 셈» 이 한 군데에 모여 있다', () => {
  const xy = cutFn(bare, 'function _pdfEditXY(');
  assert.ok(xy, '_pdfEditXY 가 없다 — 자리 셈이 두 곳으로 갈라지면 조용히 어긋난다');
  assert.ok(/_pdfEditScale/.test(xy) && /canvas\.height/.test(xy),
    '자리 셈에 배율과 캔버스 높이가 다 들어가야 한다');
  const rp = cutFn(bare, 'function _pdfEditRepaint(');
  assert.ok(/_pdfEditXY\s*\(/.test(rp), '다시 얹을 때 그 셈을 안 쓴다');
});

test('되돌리기는 목록에서 빼고 다시 그린다', () => {
  const fn = cutFn(bare, 'function pdfEditUndo(');
  assert.ok(fn, 'pdfEditUndo 가 없다');
  assert.ok(/_pdfEditTexts\.pop\s*\(/.test(fn), '목록에서 빼지 않는다');
  assert.ok(/_renderPdfEditPage\s*\(/.test(fn), '다시 그리지 않으면 화면이 그대로다');
});
