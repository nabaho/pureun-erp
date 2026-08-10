/* 명함틀 크기 = 찍는 거리 · 촬영 화면 정리 · 방금 찍은 것 버리기
   대표 보고 2026-08-10: "화질이 모두 안좋다 … 여전히 화질이 많이 안좋다"
                        "찍은사진도 삭제기능도 만들어 달라"
                        "사진찍는기능에서 불필요한기능이 너무 많다"

   ★ 화질의 마지막 원인은 **틀 크기**였다.
   예전 틀은 화면 폭의 88%(left/right 6%). 9cm 명함으로 그걸 채우려면 폰을 8cm
   까지 붙여야 하는데, 폰 카메라는 대개 10~15cm 보다 가까우면 초점을 못 잡는다.
   **물리적으로 불가능한 거리**를 요구하고 있었다 — 해상도를 아무리 올려도 흐리다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('★ 명함틀이 초점 잡히는 거리로 줄었다', () => {
  const m = html.match(/#camFrame\{[^}]*\}/);
  assert.ok(m, '#camFrame 을 찾지 못했습니다.');
  const left = Number((m[0].match(/left:(\d+)%/) || [])[1]);
  assert.ok(!isNaN(left), '틀 너비를 못 읽었습니다: ' + m[0]);
  const width = 100 - left * 2;
  assert.ok(width <= 60,
    '틀이 화면 폭의 ' + width + '% 입니다 — 이만큼 채우려면 폰을 너무 가까이 대야 해서 ' +
    '초점이 안 잡힙니다(대표 화면에서 실제로 그랬습니다).');
  assert.ok(width >= 35,
    '틀이 ' + width + '% 로 너무 작습니다 — 명함에 남는 화소가 모자라 글씨를 못 읽습니다.');
});

test('★ 흐릴 때 「가까워서 그렇다」고 알려 준다', () => {
  assert.ok(/너무 가까우면 초점이 안 잡힙니다/.test(html),
    '「화면을 눌러 초점을 잡으라」고만 하면, 초점이 안 잡히는 거리에서는 아무 소용이 없습니다.');
  assert.ok(/20cm/.test(html), '얼마나 떨어져야 하는지 숫자로 말해야 따라 할 수 있습니다.');
});

/* ── 촬영 화면 정리 ── */
test('★ 촬영 중 스위치를 둘로 줄였다', () => {
  const m = html.match(/<div id="camCtl">[\s\S]*?<div class="row">/);
  assert.ok(m, 'camCtl 을 찾지 못했습니다.');
  const boxes = (m[0].match(/<input type="checkbox"/g) || []).length;
  assert.ok(boxes <= 1, '촬영 중 체크칸이 ' + boxes + '개입니다 — 찍는 데 필요한 것만 남겨야 합니다.');
  assert.ok(/id="camAuto"/.test(m[0]), '저절로 찍기는 흔들림을 줄여 주므로 남깁니다.');
  assert.ok(/id="camFrameBtn"/.test(m[0]), '명함틀은 찍는 중에 바꿔야 합니다.');
});

test('★ 잘라내기는 명함틀을 따라간다 (스위치를 합쳤다)', () => {
  assert.ok(/function cropPref\(\) \{ return frameOn\(\); \}/.test(html),
    '둘 다 「명함만 담기」인데 따로 켜야 하면 헷갈립니다.');
  assert.ok(!/id="camCrop"/.test(html), '없앤 칸이 남아 있습니다.');
});

test('★ 없앤 칸을 아무도 안 부른다 (하얀 화면 되풀이 방지)', () => {
  for (const gone of ['camSave', 'camCrop']) {
    assert.ok(!new RegExp("\\$\\('" + gone + "'\\)").test(html),
      '없앤 칸을 부르고 있습니다: ' + gone + ' — 맨 위 오류 하나에 화면이 통째로 빕니다.');
  }
  assert.ok(!/setCropPref/.test(html), '부를 곳이 없어진 함수가 남아 있습니다.');
});

test('내 폰에도 저장은 검토 화면에 남아 있다', () => {
  assert.ok(/id="camRevSave"/.test(html),
    '올릴 때 정하는 것이라 검토 화면에는 있어야 합니다 — 아예 없애면 안 됩니다.');
});

/* ── 방금 찍은 것 버리기 ── */
test('★ 방금 찍은 사진을 그 자리에서 버린다', () => {
  assert.ok(/id="camUndo"/.test(html), '버리는 단추가 없습니다.');
  const m = html.match(/function camDropLast\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'camDropLast 를 찾지 못했습니다.');
  assert.ok(/camShots\.pop\(\)/.test(m[0]), '마지막 장을 빼야 합니다.');
  assert.ok(/revokeObjectURL/.test(m[0]), '미리보기 주소를 안 놓으면 기억이 샙니다.');
});

test('★ 버릴 때 앞뒤 묶기 고리도 되돌린다', () => {
  const m = html.match(/function camDropLast\(\)[\s\S]*?\n\}/);
  assert.ok(/camPairWith = s\.pairWith/.test(m[0]),
    '뒷면을 버리고 고리를 안 되돌리면, 다시 찍은 뒷면이 앞면에 안 붙습니다.');
});

test('찍은 것이 없으면 버리기가 안 보인다', () => {
  const m = html.match(/function renderCamStrip\(\)[\s\S]*?\n\}/);
  assert.ok(/undo\.style\.display = n \? 'flex' : 'none'/.test(m[0]),
    '버릴 것이 없는데 단추가 있으면 눌러도 아무 일이 없습니다.');
});
