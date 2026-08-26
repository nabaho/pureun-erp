/* 포털에서 「PC 화면 ↔ 폰 화면」 (대표 지시 2026-08-26 「폰에서 피시화면과 폰화면으로
   전환 가능하게 해달라」)

   ★ 푸른이알피에는 있는데(🖥/📱) 포털에는 없었다. 그래서 포털만 폰 화면에 갇혀,
     한 화면에 안 들어오는 것을 보려면 브라우저 설정을 뒤져야 했다.

   ★ 열쇠는 푸른이알피와 «같은 것»(pu_force_desktop)을 쓴다 — 한 번 고르면 프로그램을
     옮겨도 그대로다. 두 벌로 두면 포털은 PC, 이알피는 폰이 되어 오히려 헷갈린다.

   ⚠ 되돌아올 길을 반드시 남긴다. PC 화면으로 바꾸면 글자가 작아지는데 그때 이 단추까지
     작아져 못 찾으면 «갇힌다». 그래서 늘 같은 자리(머리줄)에 두고 글자만 바꾼다.
   ⚠ 화면이 그려지기 «전» 에 자리를 잡아야 한다 — 나중에 바꾸면 폰 크기로 한 번
     그려졌다가 PC 로 튀어 눈에 띄게 흔들린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');

test('★ 포털 머리줄에 PC/폰 전환 단추가 있다', () => {
  assert.match(enter, /id="pcViewBtn"/, '★ 단추가 없습니다.');
  /* 머리줄(.pbar) 안에 있어야 한다 — 본문에 두면 스크롤에 묻힌다 */
  const bar = enter.slice(enter.indexOf('<div class="pbar">'), enter.indexOf('</div>', enter.indexOf('<div class="pmeta">')));
  assert.ok(bar.indexOf('pcViewBtn') > 0, '★ 단추가 머리줄 밖에 있습니다 — 스크롤하면 안 보입니다.');
});

test('★ 열쇠가 푸른이알피와 «한 벌» 이다 — 프로그램마다 다르면 헷갈린다', () => {
  assert.match(enter, /pu_force_desktop/, '포털이 그 열쇠를 안 씁니다.');
  assert.match(erp, /pu_force_desktop/, '이알피가 그 열쇠를 안 씁니다.');
  /* 두 곳이 같은 값을 같은 뜻으로 써야 한다 — '1' 이면 PC 화면 */
  assert.match(enter, /localStorage\.setItem\('pu_force_desktop', next \? '1' : '0'\)/);
  assert.match(erp, /localStorage\.setItem\('pu_force_desktop', next\?'1':'0'\)/);
});

test('★ 화면이 그려지기 «전» 에 자리를 잡는다 — 안 그러면 한 번 튄다', () => {
  const head = enter.slice(0, enter.indexOf('</head>'));
  assert.ok(head.indexOf('pu_force_desktop') > 0,
    '★ <head> 밖에서 바꾸면 폰 크기로 한 번 그려졌다가 PC 로 튑니다.');
  assert.match(head, /width=1280/, '★ PC 화면 폭을 안 정하면 아무 일도 안 일어납니다.');
});

test('★ 단추 배선이 «앱이 죽어도» 산다 — 되돌아올 유일한 길이기 때문이다', () => {
  /* 처음에는 본문 스크립트 깊숙이 배선했다. 재어 보니 파이어베이스가 안 닿는 날에는
     그 아래가 통째로 안 돌아 «단추가 아예 안 떴다». PC 화면으로 바꿔 둔 사람에게는
     그것이 갇히는 것이다. 그래서 <head> 로 옮겼다. */
  const head = enter.slice(0, enter.indexOf('</head>'));
  assert.ok(head.indexOf("getElementById('pcViewBtn')") > 0,
    '★ 배선이 <head> 밖에 있으면, 앱이 죽는 날 되돌아올 길도 함께 죽습니다.');
  assert.match(head, /DOMContentLoaded/, '★ 아직 없는 단추에 붙일 수는 없습니다.');
});

test('★ 되돌아올 길이 있다 — PC 화면에서도 같은 자리에서 되돌린다', () => {
  assert.match(enter, /btn\.textContent = on \? '📱 폰 화면' : '🖥 PC 화면'/,
    '★ 글자가 안 바뀌면 지금 어느 화면인지도, 어떻게 되돌리는지도 모릅니다.');
  /* 단추를 없애 버리면 PC 화면에 갇힌다 — 상태에 따라 «감추지» 않는다 */
  const at = enter.indexOf("function wire(){");
  const fn = enter.slice(at, at + 1600);
  assert.ok(fn.indexOf('btn.hidden = true') < 0,
    '★ PC 화면일 때 단추를 감추면 폰으로 돌아올 길이 없습니다.');
});

test('★ PC 에서는 아예 안 낸다 — 거기서는 누를 까닭이 없다', () => {
  const at = enter.indexOf("function wire(){");
  const fn = enter.slice(at, at + 1600);
  assert.match(fn, /if\(!phone\) return;/, '★ PC 에도 뜻 없는 단추가 생깁니다.');
  assert.match(fn, /window\.innerWidth <= 820/, '폰인지 재는 기준이 없습니다.');
});
