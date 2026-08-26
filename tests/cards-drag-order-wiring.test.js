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
/* 기업 상세의 ＃탭 줄 — 2026-08-17 대표 지시로 옆줄에서 «윗줄 탭 칩»으로 옮겼다.
   그래서 ＃탭의 드래그 배선도 옆줄(sideBlock)이 아니라 여기서 본다. */
function coTabsBlock(){
  /* 2026-08-26: ＃탭 칩이 coFTabChipsHtml 로 갈라져 나왔다(도구줄을 「전체」에서도
     보이게 하면서). 끌어서 차례 바꾸기는 칩에 걸리므로 그 함수를 본다. */
  const at = source.indexOf('function coFTabChipsHtml');
  const end = source.indexOf('\nfunction ', at + 20);
  assert.ok(at > 0 && end > at, 'coFTabChipsHtml 을 찾지 못했습니다 — ＃탭 칩이 사라졌다');
  return source.slice(at, end);
}

test('명함·사업자 폴더 줄이 순서 드래그를 건다', () => {
  const s = sideBlock();
  assert.match(s, /onOrdDragStart\(event,\s*'group'/, '폴더 줄에 onOrdDragStart 가 없다');
  assert.match(s, /onOrdDrop\(event,\s*'group'/, '폴더 줄에 onOrdDrop 이 없다');
});

/* 그 줄의 draggable 이 «대표인지»로 갈리는지 줄마다 따로 본다.
   ⚠ 예전 검사는 renderPCSide 어디든 한 군데만 맞으면 통과였다. 그런데 옆줄에는 끌 수 있는
     줄이 셋(기업 상세 폴더·＃탭·명함 폴더)이라, 한 줄을 'true' 로 되돌려 놔도 나머지 둘
     덕분에 초록이 나왔다 — 하필 그 명함 폴더 줄이 직원도 명함을 떨어뜨리는 자리다.
     그래서 그 줄만의 표식(onOrdDragStart 호출)을 기준 삼아 «바로 앞의» draggable 을 본다. */
function draggableOfRow(block, marker, label){
  const at = block.indexOf(marker);
  assert.ok(at > 0, label + ' 줄을 찾지 못했습니다: '+marker);
  const dAt = block.lastIndexOf('draggable=', at);
  assert.ok(dAt >= 0, label + ' 줄 앞에 draggable 이 없습니다');
  const nl = block.indexOf('\n', dAt);
  return block.slice(dAt, nl < 0 ? block.length : nl);
}
const ADMIN_GATE = /draggable="\$\{state\.isAdmin \? 'true' : 'false'\}"/;

test('★ 대표가 아니면 명함·사업자 폴더 줄에 draggable 이 안 붙는다', () => {
  assert.match(draggableOfRow(sideBlock(), "onOrdDragStart(event,'group'", '명함·사업자 폴더'),
    ADMIN_GATE, '명함 폴더 줄의 draggable 이 state.isAdmin 으로 갈리지 않는다');
});

test('★ 대표가 아니면 기업 상세 폴더 줄에 draggable 이 안 붙는다', () => {
  assert.match(draggableOfRow(sideBlock(), "onOrdDragStart(event,'cofolder'", '기업 상세 폴더'),
    ADMIN_GATE, '기업 상세 폴더 줄의 draggable 이 state.isAdmin 으로 갈리지 않는다');
});

test('★ 대표가 아니면 폴더 안 ＃탭 칩에 draggable 이 안 붙는다', () => {
  assert.match(draggableOfRow(coTabsBlock(), "onOrdDragStart(event,'coftab'", '＃탭'),
    ADMIN_GATE, '＃탭 칩의 draggable 이 state.isAdmin 으로 갈리지 않는다');
});

test('★ 옆줄에서 끌 수 있는 줄은 둘뿐이고 둘 다 대표로 갈린다', () => {
  /* 줄이 하나 더 늘면 여기서 걸린다 — 새 줄도 게이트를 못 박으라는 뜻이다.
     ⚠ 2026-08-17 전에는 셋이었다(＃탭이 옆줄에 있었다). ＃탭이 윗줄로 옮겨 가
       옆줄에 남은 것은 명함·사업자 폴더와 기업 상세 폴더 둘뿐이다. */
  const s = sideBlock();
  const all = s.match(/draggable=[^\n]*/g) || [];
  assert.equal(all.length, 2, '옆줄의 draggable 줄 수가 둘이 아니다: '+all.length);
  all.forEach(line => assert.match(line, ADMIN_GATE, '대표로 안 갈리는 줄이 있다: '+line));
  assert.ok(s.indexOf("onOrdDragStart(event,'coftab'") < 0,
    '＃탭이 옆줄에 되살아났다 — 탭은 윗줄(#pcErpTabs)에 있어야 한다(대표 지시 2026-08-17)');
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
  /* 옆줄과 같은 방식으로 «그 칩 줄의» draggable 을 본다 */
  assert.match(draggableOfRow(s, "onOrdDragStart(event,'view'", '메인 탭 칩'),
    ADMIN_GATE, '메인 탭 칩의 draggable 이 state.isAdmin 으로 갈리지 않는다');
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

test('폴더 안 ＃탭 칩이 순서 드래그를 건다 — 부모 폴더를 scope 로 넘긴다', () => {
  const s = coTabsBlock();
  assert.match(s, /onOrdDragStart\(event,\s*'coftab'/, '＃탭에 onOrdDragStart 가 없다');
  assert.match(s, /onOrdDrop\(event,\s*'coftab'/, '＃탭에 onOrdDrop 이 없다');
  /* scope 를 안 넘기면 다른 폴더의 탭끼리 섞인다 */
  assert.match(s, /onOrdDragStart\(event,'coftab','\$\{t\.id\}','\$\{f\.id\}'\)/,
    '＃탭 드래그에 부모 폴더(scope)가 안 넘어간다');
});

test('＃탭의 「＃ 전체」 칩은 끌 수 없다 — 저장된 탭이 아니다', () => {
  const s = coTabsBlock();
  const allAt = s.indexOf("pickCoFTab('')");
  assert.ok(allAt >= 0, '＃ 전체 칩을 찾지 못했습니다');
  /* 「＃ 전체」 칩부터 탭 목록이 시작되는 자리까지가 그 칩의 몫이다 */
  const mapAt = s.indexOf('coFTabList(f).map');
  assert.ok(mapAt > allAt, '탭 목록을 찾지 못했습니다');
  assert.ok(s.slice(allAt, mapAt).indexOf('onOrdDragStart') < 0,
    '＃ 전체 칩에 드래그가 붙었다 — 저장할 자리가 없어 순서를 바꿀 수 없다');
});
