/* 외부기관 실적 — 종류별로 고르기 (대표 지시 2026-08-30)
   「기관 실적 종류별로 선택할 수 있게 하고 …」

   ⚠ OCR 올리기는 다른 세션이 이미 만들어 두었다(bindPuAgencyOcr·extperf).
     여기서 더하는 것은 «종류 고르기»와, 고른 종류를 OCR 이 따르게 잇는 것뿐이다.

   ★ 고른 종류는 두 가지 일을 한다: ① 목록을 거른다 ② 올린 문서를 어느 통에 넣을지 정한다.
     사람이 「컨설팅」을 골라 두고 올렸는데 AI 짐작으로 사건에 들어가면 나중에 찾을 수가 없다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const css = bare.slice(bare.indexOf('<style'), bare.lastIndexOf('</style>'));

test('★ 종류를 고를 수 있다 — 전체·사건·컨설팅·기금·기타', () => {
  assert.match(source, /id="puagKinds"/);
  const list = cutFn(bare, 'var PUAG_KINDS=[').replace(/^var PUAG_KINDS=/, '');
  [['', '전체'], ['case', '사건'], ['consult', '컨설팅'], ['fund', '기금'], ['etc', '기타']]
    .forEach(([k, label]) => assert.ok(list.indexOf("'" + label + "'") > 0, label + ' 이(가) 있어야 합니다'));
  assert.match(bare, /function puagKind\(/);
  assert.match(bare, /function renderPuagKinds\(/);
});

test('★ 고른 종류로 목록을 «거른다»', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /if\(_puagKind && k !== _puagKind\) return;/);
  assert.match(fn, /renderPuagKinds\(\)/, '단추도 다시 그려야 고른 표시가 맞습니다');
});

test('★ 연도 목록은 «거르기 전»에 모은다 — 아니면 종류를 고를 때마다 연도가 사라진다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  const iYear = fn.indexOf('years[r.year] = 1');
  const iKind = fn.indexOf('_puagKind && k !== _puagKind');
  assert.ok(iYear > 0 && iKind > 0, '두 줄을 찾지 못했습니다');
  assert.ok(iYear < iKind, '연도를 모으는 줄이 거르는 줄보다 앞이어야 합니다');
});

test('★★ 사람이 고른 종류가 «AI 짐작을 이긴다»', () => {
  const fn = cutFn(bare, 'async function saveOCRRecord(');
  const at = fn.indexOf("page==='extperf'");
  assert.ok(at > 0, 'extperf 갈래를 찾지 못했습니다');
  const seg = fn.slice(at, at + 900);
  const iPick = seg.indexOf('_puagKind');
  const iAi = seg.indexOf('_KM[String(parsed.kind');
  assert.ok(iPick > 0, '고른 종류를 봐야 합니다');
  assert.ok(iPick < iAi, '고른 종류가 «먼저» 와야 이깁니다');
});

test('「전체」로 두었으면 OCR 이 읽은 종류를 따른다 — 고르지 않았으면 짐작이 낫다', () => {
  const fn = cutFn(bare, 'async function saveOCRRecord(');
  const at = fn.indexOf("page==='extperf'");
  assert.match(fn.slice(at, at + 900), /_KM\[String\(parsed\.kind\|\|''\)\.trim\(\)\]\s*\|\|\s*'consult'/,
    '고른 것이 없으면 읽은 kind, 그것도 없으면 컨설팅');
});

test('올리기는 «있던 길»을 그대로 쓴다 — 새로 만들어 두 길이 되면 안 된다', () => {
  const fn = cutFn(bare, 'function bindPuAgencyOcr(');
  assert.match(fn, /ocrDrop\(files,'extperf'\)/, '통 고르기는 saveOCRRecord 가 맡습니다');
  assert.match(fn, /renderPuAgency/, '올린 뒤 목록을 다시 그려야 합니다');
  assert.equal((bare.match(/function bindPuAgencyOcr\(/g) || []).length, 1);
});

test('거른 탓에 비었으면 «그렇다고» 알린다 — 「없습니다」로 끝내면 고장으로 읽힌다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /_puagKind \?[\s\S]{0,140}전체/);
});

test('고른 딱지가 «눌린 티»가 난다', () => {
  assert.match(css, /\.puag-kind\.on\{/);
  assert.match(bare, /_puagKind===p\[0\]\?' on':''/);
});

test('묶어 보기·연도 고르기를 밀어내지 않았다 — 같은 줄에 함께 있어야 한다', () => {
  const tb = source.slice(source.indexOf('id="page-puagency"'));
  const seg = tb.slice(0, tb.indexOf('</div>', tb.indexOf('tb-spacer')));
  ['id="puagBy"', 'id="puagYear"', 'id="puagKinds"', 'id="puagQ"']
    .forEach((id) => assert.ok(seg.indexOf(id) > 0, id + ' 이(가) 툴바에 있어야 합니다'));
});
