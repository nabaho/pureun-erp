const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const work = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');

function phone760() {
  const at = work.indexOf('/* ── 폰 : 왼쪽 메뉴는 «서랍» 이다 ──');
  assert.ok(at >= 0, '폰 서랍 블록을 찾지 못했습니다.');
  const open = work.indexOf('{', work.indexOf('@media', at));
  let depth = 0, i = open;
  for (; i < work.length; i++) {
    if (work[i] === '{') depth++;
    else if (work[i] === '}' && --depth === 0) break;
  }
  return work.slice(at, i + 1);
}

test('폰에서도 팀 전체·업무량·지식·인수인계·종료로 갈 길이 있다', () => {
  /* ★ 예전에는 @media(max-width:760px){#side{display:none}} 이었다 — 폰은 「내 업무」에
     갇혀 다른 화면으로 갈 길이 **하나도 없었다**(대표 지시 2026-08-20
     "다른 직원들 업무도 모두 확인하고 싶다"). 다시 감추면 여기서 걸린다. */
  const b = phone760();
  assert.doesNotMatch(b, /#side\{display:none/,
    '★ 폰에서 메뉴를 감추면 「내 업무」 밖으로 나갈 길이 사라집니다.');
  assert.match(b, /body\.sideopen #side\{transform:none\}/);
  assert.match(b, /#menubtn\{display:inline-flex/);
  assert.match(work, /id="menubtn" onclick="sideDrawer\(\)"/);
  assert.match(work, /id="sideveil" onclick="sideDrawer\(false\)"/,
    '서랍 밖을 눌러 닫는 길이 없으면 갇힙니다.');
});

test('메뉴는 PC 것을 그대로 쓴다 — 폰용 메뉴를 따로 만들지 않는다', () => {
  /* 따로 만들면 메뉴 하나를 더할 때마다 두 곳을 고쳐야 하고, 언젠가 한쪽만 고친다. */
  const shell = work.slice(work.indexOf('function shell(){'), work.indexOf("+'<div id=\"sideOn\""));
  ['nav-my', 'nav-team', 'nav-stats', 'nav-kb', 'nav-ho', 'nav-archive'].forEach(function (id) {
    assert.ok(shell.includes(id), id + ' 가 메뉴에 없습니다.');
  });
  assert.equal((work.match(/id="nav-team"/g) || []).length, 1,
    '★ 「팀 전체」가 두 곳에 적혀 있습니다 — 폰용 메뉴를 따로 만든 흔적입니다.');
});

test('메뉴를 고르면 서랍이 닫힌다', () => {
  const fn = work.match(/function go\(v\)\{[\s\S]*?\n\}/)[0];
  assert.match(fn, /sideDrawer\(false\)/,
    '안 닫으면 고른 화면이 서랍에 가려 보이지 않습니다.');
});

test('팀 전체 화면은 폰에서 줄이 세로로 쌓이지 않는다', () => {
  const at = work.indexOf('@media (max-width:520px)');
  const b = work.slice(at, work.indexOf('@media', at + 10) > 0 ? work.length : work.length);
  /* ★ 열이 예닐곱인 표를 412px 에 우겨 넣으면 「주식/회사/나래/산업」처럼 칸마다
     글자가 세로로 쌓여 한 줄이 79px 이 된다 — 표에 제 너비를 줘야 한다. */
  assert.match(b, /\.panel\.tbl table\{min-width:\d+px\}/,
    '★ 표에 제 너비가 없으면 폰에서 칸마다 글자가 세로로 쌓입니다.');
  /* 깔때기 줄도 접지 말고 옆으로 민다 — 다만 쪽을 넓히지는 않아야 한다 */
  assert.match(b, /\.fbar\{[^}]*flex-wrap:nowrap!important/);
  assert.match(b, /\.fbar\{[^}]*min-width:0/);
  assert.match(b, /\.fbar\{[^}]*max-width:100%/,
    'nowrap 인 줄에 max-width 가 없으면 쪽 자체가 좌우로 넓어집니다.');
});
