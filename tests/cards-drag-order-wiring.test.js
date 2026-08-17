'use strict';
/* 네 목록이 실제로 배선됐는지 — 손놀림 함수를 만들어 놓고 화면에 안 붙이면 아무 일도 안 난다.
   ⚠ 대표가 아닐 때 draggable 이 안 붙는지도 여기서 본다(실수 방지의 첫 관문). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function sideBlock(){
  const at = source.indexOf('function renderPCSide');
  const end = source.indexOf('\nfunction ', at + 20);
  assert.ok(at > 0 && end > at, 'renderPCSide 를 찾지 못했습니다');
  return source.slice(at, end);
}

test('명함·사업자 폴더 줄이 순서 드래그를 건다', () => {
  const s = sideBlock();
  assert.match(s, /onOrdDragStart\(event,\s*'group'/, '폴더 줄에 onOrdDragStart 가 없다');
  assert.match(s, /onOrdDrop\(event,\s*'group'/, '폴더 줄에 onOrdDrop 이 없다');
});

test('★ 대표가 아니면 폴더에 draggable 이 안 붙는다', () => {
  const s = sideBlock();
  assert.match(s, /draggable="\$\{state\.isAdmin \? 'true' : 'false'\}"/,
    'draggable 이 state.isAdmin 으로 갈리지 않는다');
});

test('명함을 폴더로 끌어 넣는 기존 기능이 그대로다', () => {
  const at = source.indexOf('function onFolderOrCardDrop');
  const end = source.indexOf('\n}', at) + 2;
  const fn = source.slice(at, end);
  assert.match(fn, /it\.group\s*=\s*targetGid/, '명함을 폴더로 옮기는 길이 사라졌다');
  assert.match(fn, /Store\.put\(it\)/);
});

test('폴더 순서 드래그 중일 때는 명함 드롭 처리로 안 넘어간다', () => {
  const at = source.indexOf('function onFolderOrCardDrop');
  const end = source.indexOf('\n}', at) + 2;
  const fn = source.slice(at, end);
  assert.match(fn, /_dragOrd/, '순서 드래그 중인지 확인하지 않는다 — 순서를 바꾸려다 명함이 옮겨진다');
});

test('기업 상세 폴더 줄이 순서 드래그를 건다', () => {
  const s = sideBlock();
  assert.match(s, /onOrdDragStart\(event,\s*'cofolder'/, '기업 상세 폴더에 onOrdDragStart 가 없다');
  assert.match(s, /onOrdDrop\(event,\s*'cofolder'/, '기업 상세 폴더에 onOrdDrop 이 없다');
});

test('메인 탭 칩이 순서 드래그를 건다', () => {
  const at = source.indexOf('function renderMyTabsHtml');
  const end = source.indexOf('\nfunction ', at + 20);
  assert.ok(at > 0 && end > at, 'renderMyTabsHtml 을 찾지 못했습니다');
  const s = source.slice(at, end);
  assert.match(s, /onOrdDragStart\(event,\s*'view'/, '메인 탭에 onOrdDragStart 가 없다');
  assert.match(s, /onOrdDrop\(event,\s*'view'/, '메인 탭에 onOrdDrop 이 없다');
  assert.match(s, /draggable="\$\{state\.isAdmin \? 'true' : 'false'\}"/, '대표 갈림이 없다');
});

test('「📋 전체」 칩은 끌 수 없다 — 저장된 탭이 아니라 늘 맨 앞이다', () => {
  const at = source.indexOf('function renderMyTabsHtml');
  const end = source.indexOf('\nfunction ', at + 20);
  const s = source.slice(at, end);
  const allAt = s.indexOf('showAllInFolder()');
  const mapAt = s.indexOf('h+=vs.map');
  assert.ok(allAt >= 0 && mapAt > allAt, '전체 칩과 탭 목록을 찾지 못했습니다');
  assert.ok(s.slice(allAt, mapAt).indexOf('onOrdDragStart') < 0,
    '전체 칩에 드래그가 붙었다 — 저장할 자리가 없어 순서를 바꿀 수 없다');
});

test('폴더 안 ＃탭이 순서 드래그를 건다 — 부모 폴더를 scope 로 넘긴다', () => {
  const s = sideBlock();
  assert.match(s, /onOrdDragStart\(event,\s*'coftab'/, '＃탭에 onOrdDragStart 가 없다');
  assert.match(s, /onOrdDrop\(event,\s*'coftab'/, '＃탭에 onOrdDrop 이 없다');
  /* scope 를 안 넘기면 다른 폴더의 탭끼리 섞인다 */
  assert.match(s, /onOrdDragStart\(event,'coftab','\$\{t\.id\}','\$\{f\.id\}'\)/,
    '＃탭 드래그에 부모 폴더(scope)가 안 넘어간다');
});

test('＃탭의 「＃ 전체」 줄은 끌 수 없다 — 저장된 탭이 아니다', () => {
  const s = sideBlock();
  const allAt = s.indexOf("pickCoFTab('')");
  assert.ok(allAt >= 0, '＃ 전체 줄을 찾지 못했습니다');
  const lineEnd = s.indexOf('`;', allAt);
  assert.ok(s.slice(allAt, lineEnd).indexOf('onOrdDragStart') < 0,
    '＃ 전체 줄에 드래그가 붙었다');
});
