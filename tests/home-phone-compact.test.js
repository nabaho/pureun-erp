/* 홈페이지 관리 — 폰에서 «컴팩트하게» (대표 지시 2026-09-02)
   「폰에서 좀 컴팩트하게 지금 정리 좀 해 줘 지금」

   무엇이 문제였나 — 900px 구간은 «기둥을 눕히는» 일만 했다. 눕히기만 하고 숨은
   그대로라, 폰 한 화면에 들어오는 것이 얼마 없어 세 번을 굴려야 했다.

   실측(411px 폰, 실제 크로미움 · 대표 갈무리와 같은 구성):
     전체 1237 → 1022px · 목록 한 줄 65 → 51 · 편집 단추줄 163 → 124 · 머리 띠 44 → 35

   지키는 규칙(값이 아니라 뜻):
     ① 폰 구간이 «있다» — 눕히기만 하고 끝내지 않는다
     ② PC·태블릿은 안 건드린다 (560px 아래에서만)
     ③ 글자를 줄여서 컴팩트해진 것이 «아니다» — 줄인 것은 여백과 줄 사이 숨이다
     ④ 편집 단추 여섯은 두 개씩 나란히 — 한 줄에 하나면 여섯 줄을 먹는다
     ⑤ 윗칸 단추는 묶지 않는다 — 셋뿐이라 묶으면 오히려 줄이 는다(실측 129→147)
   실행: node --test tests/home-phone-compact.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-home.html'), 'utf8');

/* 폰 구간만 떼어 온다 */
function 폰구간() {
  const at = src.indexOf('@media(max-width:560px){');
  assert.ok(at > 0, '★ 폰 구간이 없습니다 — 기둥만 눕히고 숨은 그대로입니다');
  let 깊이 = 0, i = src.indexOf('{', at);
  const 시작 = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') 깊이++;
    else if (src[i] === '}') { 깊이--; if (!깊이) break; }
  }
  return src.slice(시작 + 1, i);
}

test('★ 폰 구간이 있고, PC·태블릿은 건드리지 않는다', () => {
  const 안 = 폰구간();
  assert.ok(안.length > 200, '폰 구간이 비어 있습니다');
  /* 900px 구간(기둥 눕히기)은 그대로 살아 있어야 한다 — 이것이 없으면 폰에서 3단이 된다 */
  assert.match(src, /@media\(max-width:900px\)\{/, '기둥을 눕히는 구간이 사라졌습니다');
});

test('★ 글자를 줄여서 컴팩트해진 것이 아니다 — 줄인 것은 여백이다', () => {
  const 안 = 폰구간();
  /* 여백·줄 사이를 실제로 줄였는가 */
  assert.match(안, /line-height:1\.[0-5]/, '줄 사이 숨을 안 줄였습니다');
  assert.ok((안.match(/padding:/g) || []).length >= 10,
    '여백을 줄인 자리가 너무 적습니다 — 컴팩트해지지 않습니다');
  /* 글자를 11px 밑으로 떨어뜨리면 컴팩트한 대신 «안 읽힌다» */
  const 작은글 = [...안.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(작은글.length, '글자 크기를 하나도 안 적었습니다');
  assert.ok(Math.min(...작은글) >= 11,
    '★ 글자가 ' + Math.min(...작은글) + 'px 까지 내려갔습니다 — 컴팩트한 대신 안 읽힙니다');
});

test('★ 편집 단추 여섯은 «두 개씩» 나란히 — 한 줄에 하나면 여섯 줄이다', () => {
  const 안 = 폰구간();
  assert.match(안, /\.eft \.btn\{[^}]*flex:1 1 calc\(50%/,
    '★ 편집 단추가 한 줄에 하나씩 놓입니다');
  assert.match(안, /\.eft \.btn\{[^}]*min-width:0/,
    'min-width:0 이 없으면 긴 이름 단추가 안 줄어 옆으로 삐집니다');
});

test('★ 윗칸 단추는 묶지 않는다 — 셋뿐이라 묶으면 오히려 줄이 는다', () => {
  const 안 = 폰구간();
  const at = 안.indexOf('.appbar .btn{');
  assert.ok(at > 0, '윗칸 단추 규칙이 없습니다');
  const 규칙 = 안.slice(at, 안.indexOf('}', at));
  assert.ok(!/flex:1 1 calc\(50%/.test(규칙),
    '★ 윗칸 단추를 반씩 묶었습니다 — 실측으로 129→147px 로 늘어난 자리입니다');
});

test('줄바꿈만 만들던 빈 칸은 폰에서 감춘다', () => {
  assert.match(폰구간(), /\.eft > span\[style\]:empty\{display:none\}/,
    '빈 칸이 한 줄을 통째로 먹습니다');
});

test('목록 한 줄이 낮아졌다 — 아홉 명이면 그만큼이 곱해진다', () => {
  const 안 = 폰구간();
  const at = 안.indexOf('.list .r{');
  assert.ok(at > 0, '목록 줄 규칙이 없습니다');
  const 규칙 = 안.slice(at, 안.indexOf('}', at));
  const m = /min-height:(\d+)px/.exec(규칙);
  assert.ok(m, '줄 키를 안 정했습니다');
  /* 값이 아니라 «원래(62px)보다 낮아졌는가»를 본다 */
  assert.ok(Number(m[1]) < 62, '★ 줄 키가 예전(62px) 그대로입니다: ' + m[1] + 'px');
  assert.ok(Number(m[1]) >= 44, '★ 너무 낮아 손가락으로 누르기 어렵습니다: ' + m[1] + 'px');
});
