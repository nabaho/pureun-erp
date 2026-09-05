/* 경력관리 — 외부기관 실적도 원본을 «오른쪽에서» 본다
   (대표 지시 2026-09-05 「외부기관실적도 pdf 또는 기타 원본 있으면 찾아서
     경력관리와 같이 오른쪽화면에 볼수 있게 해달라」)

   ■ 전에는 어땠나
     외부기관 실적 줄(.pa-row)은 «보여 주기만» 했다 — 눌러도 아무 일이 없고,
     원본이 붙어 있어도 열 단추가 없었다. 마지막 칸에는 pu 딱지뿐이었다.
     경력관리(위촉장 등)는 줄을 누르면 왼쪽 원본 + 오른쪽 입력칸으로 열리는데,
     같은 자료인데 화면마다 달랐다.

   ■ 어떻게 했나
     줄을 누르면 그 기록의 편집창을 연다. 편집창(openForm)이 «스스로»
     원본이 있는지 보고 좌우로 펴므로(as-drawer), 경력관리와 같은 모양이 된다.
     ⚠ 줄이 어느 통에서 왔는지는 _store 에 붙어 있다 — 그것이 편집창 이름이다.
     ⚠ 「자문·고문」처럼 제 통이 없는 갈래는 편집창이 없으니 열지 않는다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('★★ 줄을 누르면 그 기록의 편집창이 열린다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /onclick="openForm\(/, '경력관리와 같은 길(openForm)을 써야 모양이 같아집니다');
  assert.match(fn, /var _pg = FORM_DEFS\[r\._store\] \? r\._store : ''/,
    '★ 줄이 어느 통에서 왔는지는 _store 가 안다 — 여기서 다시 짐작하면 어긋납니다');
});

test('★★ 편집창이 없는 갈래는 열지 않는다 — 눌러도 아무 일이 없으면 고장으로 읽힌다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /\(_pg \? ' pa-open' : ''\)/,
    '열 수 있는 줄에만 표시가 붙어야 합니다');
  assert.match(fn, /_pg \? ' onclick="openForm/,
    '★ 편집창이 없는 갈래(자문·고문)에 onclick 을 달면 눌러도 아무 일이 없습니다');
});

test('★★ 원본이 있으면 줄에서 바로 연다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /var _has = hasOriginal\(r\)/,
    'base64 첨부와 폴더 경로를 «둘 다» 봐야 합니다 — fileExists 만 보면 폴더 것을 놓칩니다');
  assert.match(fn, /_has \? '<button class="btn sm"[\s\S]{0,200}openOriginal\(/);
  assert.match(fn, /onclick="event\.stopPropagation\(\)"/,
    '★ 원본 단추를 누를 때 줄 열기가 함께 터지면 안 됩니다');
});

test('★ 눌러서 열 수 있는 줄임이 보인다', () => {
  assert.match(source, /\.pa-row\.pa-open\{cursor:pointer\}/);
  assert.match(source, /\.pa-row\.pa-open:hover\{background:var\(--soft\)\}/);
});

test('★ pu 딱지는 그대로 남는다 — 어디서 온 기록인지 알아야 한다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /r\.src==='pu' \? '<span class="tag"/);
});
