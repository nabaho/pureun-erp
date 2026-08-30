/* 포털 머리줄의 「🖥 PC 화면」 단추 — 없앴다 (대표 지시 2026-08-30 「상단 박스 피시화면 셀 없애라」)

   2026-08-26 에 「폰에서 피시화면과 폰화면으로 전환 가능하게 해달라」로 만든 단추다.
   넉 달이 아니라 나흘 만에 뜻이 바뀐 것이 아니라, 머리줄이 다섯 칸으로 붐볐다 —
   로그아웃·PC 화면·앱으로 깔기·건의하기·이번 달 사용액. 폰에서 두 줄로 접혔다.
   하루에 한 번도 안 누르는 단추가 그 자리를 차지할 까닭이 없다.

   ★ 그러나 «설정 자체는 살아 있다». 열쇠(pu_force_desktop)는 푸른이알피와 한 벌이라,
     이알피에서 고르면 포털도 따라가고, 되돌아올 길도 이알피에 그대로 있다.
     포털에서 그 값을 무시해 버리면 두 프로그램이 서로 다른 화면이 되어 더 헷갈린다.

   ⚠ 이 검사가 지키는 것은 «단추가 없다» 가 아니라 «갇히지 않는다» 이다.
     단추를 없애면서 되돌아올 길까지 없애면 PC 화면에 갇힌다 — 그것을 막는다.
   실행: node --test tests/portal-pc-view-toggle.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');

test('포털 머리줄에서 PC/폰 전환 단추를 걷어냈다', () => {
  assert.ok(enter.indexOf('pcViewBtn') < 0,
    '단추가 아직 남아 있습니다 — 대표 지시 2026-08-30 으로 없앤 자리입니다.');
});

test('머리줄에 남은 단추는 «가끔 쓰는 것»뿐이다', () => {
  const bar = enter.slice(enter.indexOf('<div class="pbar">'), enter.indexOf('<div class="pmeta">'));
  /* 늘 쓰는 것(로그아웃·건의하기)과, 한 번 하면 사라지는 것(앱으로 깔기)만 남긴다 */
  assert.ok(bar.indexOf('logoutBtn') > 0, '로그아웃이 사라졌습니다');
  assert.ok(bar.indexOf('sgFab') > 0, '건의하기가 사라졌습니다');
  assert.ok(bar.indexOf('pcViewBtn') < 0, 'PC 화면 단추가 머리줄에 다시 붙었습니다');
});

test('★ 갇히지 않는다 — 되돌아올 길이 푸른이알피에 그대로 있다', () => {
  /* 포털에서 단추를 없앴으므로, PC 화면으로 바꿔 둔 사람은 이알피에서만 되돌릴 수 있다.
     그 길까지 없어지면 폰이 1280px 에 갇힌다 — 이 검사가 그것을 막는다. */
  assert.match(erp, /pu_force_desktop/, '★ 이알피에도 전환이 없으면 PC 화면에 갇힙니다.');
  assert.match(erp, /localStorage\.setItem\('pu_force_desktop', next\?'1':'0'\)/,
    '★ 이알피의 전환이 같은 열쇠를 안 씁니다 — 포털이 따라가지 못합니다.');
});

test('★ 이알피에서 고른 설정을 포털이 그대로 따른다', () => {
  const head = enter.slice(0, enter.indexOf('</head>'));
  assert.ok(head.indexOf('pu_force_desktop') > 0,
    '★ 포털이 설정을 안 읽으면, 이알피는 PC 인데 포털만 폰이 됩니다.');
  assert.match(head, /width=1280/, '★ PC 화면 폭을 안 정하면 설정을 읽어도 아무 일이 없습니다.');
});

test('★ 화면이 그려지기 «전» 에 자리를 잡는다 — 안 그러면 한 번 튄다', () => {
  const head = enter.slice(0, enter.indexOf('</head>'));
  const 적용 = head.indexOf('apply(get())');
  assert.ok(적용 > 0, '★ 설정을 실제로 적용하는 곳이 없습니다.');
  /* 본문보다 앞, 즉 <head> 안에서 이미 끝나 있어야 한다 */
  assert.ok(적용 < head.length, '★ <head> 밖에서 바꾸면 폰 크기로 그려졌다가 PC 로 튑니다.');
});

test('없앤 단추의 흔적(빈 배선·죽은 CSS)이 남아 있지 않다', () => {
  assert.ok(enter.indexOf('function wire(){') < 0, '빈 배선 함수가 남았습니다');
  assert.ok(enter.indexOf('.pcview.on{') < 0, '누른 모양(.on) CSS 가 남았습니다 — 이제 아무도 안 씁니다');
  /* .pcview 자체는 「앱으로 깔기」가 아직 쓴다 — 지우면 그 단추가 깨진다 */
  assert.match(enter, /class="pcview appinst"/, '앱으로 깔기 단추가 그 모양을 잃었습니다');
  assert.match(enter, /\.pcview\{/, '앱으로 깔기가 쓰는 모양까지 지웠습니다');
});
