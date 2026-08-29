/* 한글 서식에 도장 그림 넣기 — 2026-08-29 브라우저에서 실제로 찍어 확인한 값을 규칙으로 못 박는다.
   세 번 만에 맞췄다: ① 너무 커서 종이 밖 ② 잘림 ③ 제자리.
   ①②의 까닭이 아래 별표(★) 검사들이다. 이걸 지우면 같은 실수를 다시 한다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/kcareer-hwpstamp.js');

test('그림 본래 크기는 px 를 HWPUNIT 으로 — 96dpi 기준', () => {
  /* 검사고정-허용: 1인치 = 7200 HWPUNIT 은 한글 파일 형식의 규칙이다(값 자체가 규칙) */
  assert.equal(S.PX_TO_HU(96), 7200);
  assert.equal(S.PX_TO_HU(300), 22500);
});

test('★ 본래 크기(orgSz)와 찍을 크기(curSz)가 달라야 한다 — 같으면 그림이 잘린다', () => {
  const xml = S.picXml({ id: 'image1', orgPx: 300, showHU: 3400 });
  const org = /<hp:orgSz width="(\d+)"/.exec(xml)[1];
  const cur = /<hp:curSz width="(\d+)"/.exec(xml)[1];
  assert.notEqual(org, cur, '둘을 같게 두면 조각만 그려진다(2026-08-29 실측)');
  assert.equal(org, String(S.PX_TO_HU(300)));
  assert.equal(cur, '3400');
});

test('★ imgRect·imgClip·imgDim 은 «본래 크기» 기준이다 — 찍을 크기로 적으면 잘린다', () => {
  const xml = S.picXml({ id: 'image1', orgPx: 300, showHU: 3400 });
  const org = String(S.PX_TO_HU(300));
  assert.ok(xml.indexOf('<hp:imgClip left="0" right="' + org + '"') > 0);
  assert.ok(xml.indexOf('<hc:pt1 x="' + org + '"') > 0);
  assert.ok(xml.indexOf('<hp:imgDim dimwidth="' + org + '"') > 0);
});

test('★ 글자처럼 붙이지 않는다(treatAsChar=0) — 1이면 뒤로 밀려 종이 밖으로 나간다', () => {
  const xml = S.picXml({ id: 'image1', orgPx: 300, showHU: 3400 });
  assert.match(xml, /treatAsChar="0"/);
  assert.match(xml, /allowOverlap="1"/);
  assert.match(xml, /textWrap="IN_FRONT_OF_TEXT"/);
});

test('그림 이름표를 가리킨다 — BinData 의 파일과 이어져야 그려진다', () => {
  assert.match(S.picXml({ id: 'image7', orgPx: 300, showHU: 3400 }), /binaryItemIDRef="image7"/);
});

test('도장 자리를 찾는다 — (인)·（인）·(서명)·서명 또는 인·印', () => {
  ['(인)', '（인）', '(서명)', '서명 또는 인', '印'].forEach((mark) => {
    const xml = '<hp:p><hp:run><hp:t>성명 : 권형하   ' + mark + '</hp:t></hp:run></hp:p>';
    assert.ok(S.findSpot(xml), mark + ' 을(를) 도장 자리로 알아봐야 합니다');
  });
});

test('도장 자리가 없으면 «없다»고 한다 — 아무 데나 찍지 않는다', () => {
  assert.equal(S.findSpot('<hp:p><hp:run><hp:t>제출서류 1부</hp:t></hp:run></hp:p>'), null);
});

test('그림을 그 자리 문단 안에 넣는다 — 문서가 깨지지 않게 run 으로 감싼다', () => {
  const xml = '<hp:p><hp:run><hp:t>성명 : 권형하   (인)</hp:t></hp:run></hp:p>';
  const out = S.insertPic(xml, '<hp:pic/>', S.findSpot(xml));
  assert.match(out, /<hp:run[^>]*><hp:pic\/><\/hp:run>/);
  assert.ok(out.indexOf('(인)') > 0, '원래 글자는 남아야 합니다 — 도장은 «덮는» 것이지 «지우는» 것이 아니다');
});

test('자리가 없으면 문서를 그대로 돌려준다 — 조용히 망가뜨리지 않는다', () => {
  const xml = '<hp:p><hp:run><hp:t>제출서류</hp:t></hp:run></hp:p>';
  assert.equal(S.insertPic(xml, '<hp:pic/>', null), xml);
});

test('목록(hpf)에 그림 항목을 더한다 — 목록에 없으면 한글이 그림을 못 찾는다', () => {
  const hpf = '<opf:manifest><opf:item id="header"/></opf:manifest>';
  const out = S.addToManifest(hpf, 'pustamp', 'BinData/pustamp.png');
  assert.match(out, /id="pustamp"/);
  assert.match(out, /href="BinData\/pustamp\.png"/);
  assert.match(out, /isEmbeded="1"/);
  assert.ok(out.indexOf('id="header"') > 0, '있던 항목이 사라지면 안 됩니다');
});

test('같은 그림을 두 번 더하지 않는다 — 도장을 두 번 찍어도 목록이 부풀지 않게', () => {
  const hpf = '<opf:manifest><opf:item id="header"/></opf:manifest>';
  const once = S.addToManifest(hpf, 'pustamp', 'BinData/pustamp.png');
  assert.equal(S.addToManifest(once, 'pustamp', 'BinData/pustamp.png'), once);
});

test('★ 그림 이름표는 image+숫자여야 한다 — 엔진이 «이름 규칙»으로 찾는다', () => {
  /* 검사고정-허용: 실측 규칙이다. pustamp 로 두면 목록에 href 를 적어 줘도
     엔진이 못 찾아 «깨진 상자»가 그려진다(붉은 알갱이 19 vs image1 은 379). */
  assert.equal(S.nextImageId([]), 'image1');
  assert.equal(S.nextImageId(['BinData/image1.png']), 'image2');
  assert.equal(S.nextImageId(['BinData/image1.png', 'BinData/image2.png']), 'image3');
  assert.match(S.nextImageId(['BinData/logo.png']), /^image\d+$/, '뜻이 담긴 이름은 셈에서 뺀다');
});

test('★ 도장은 문단(칸)의 «오른쪽 끝»에 붙인다 — 왼쪽 기준 고정 거리는 좁은 칸에서 밖으로 나간다', () => {
  assert.match(S.picXml({ id: 'image1', orgPx: 300, showHU: 3400 }), /horzAlign="RIGHT"/);
});
