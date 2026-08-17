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
