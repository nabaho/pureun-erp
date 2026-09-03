/* 사진첩에서 카메라 단추를 없앤다 — 대표 지시 2026-08-10
   "사진첩에 오른쪽 아래 카메라 기능 전혀 필요없다. 삭제해서 제거해 달라."

   ⚠ 단추만 없앤 것이지 촬영을 지운 것이 아니다. 기업정보함과 포털이 ?cam=1 로
     이 화면의 카메라를 불러 쓴다 — 지우면 명함 촬영이 통째로 죽는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const cards = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');

test('★ 단추가 자취 없이 사라졌다 — 마크업·꾸밈·배선 모두', () => {
  /* 하나라도 남으면 화면에 빈 칸이 생기거나, 없는 단추를 부르다 멎는다.
     2026-08-08 에 없앤 칸을 부르다 흰 화면이 된 적이 있다. */
  assert.ok(!/id="camBtn"/.test(app), '마크업이 남아 있습니다.');
  assert.ok(!/#camBtn/.test(app), '꾸밈 규칙이 남아 있습니다.');
  assert.ok(!/\$\('camBtn'\)/.test(app), '없는 단추를 부르면 그 줄에서 화면이 멎습니다.');
  assert.ok(!/camBtn/.test(app), 'camBtn 이 아직 어딘가에 남아 있습니다.');
});

test('★ 촬영 기능은 그대로 살아 있다', () => {
  /* 기업정보함·포털이 이 화면의 카메라를 불러 쓴다 */
  assert.match(app, /async function openCam\(/, '촬영을 여는 곳이 없어졌습니다.');
  assert.match(app, /function openCamIfAsked\(/, '?cam=1 로 들어오는 길이 없어졌습니다.');
  assert.match(app, /openCamIfAsked\(\);/, '들어와도 카메라를 안 켭니다.');
  assert.match(app, /id="camOv"/, '카메라 화면이 없어졌습니다.');
});

test('★ 기업정보함이 부르는 주소가 그대로다', () => {
  /* 기업정보함의 촬영은 이 화면으로 넘어와서 이뤄진다 — 주소가 어긋나면
     명함을 찍을 길이 사라진다. */
  assert.match(cards, /pu-photos\.html\?cam=1/, '기업정보함이 카메라를 못 부릅니다.');
  const m = cards.match(/pu-photos\.html\?cam=1[^'"]*/);
  assert.ok(/mode=card/.test(m[0]), '명함 모드로 안 넘기면 명함틀이 안 켜집니다.');
});

/* ⚠ 2026-08-10 다시 겨눔 — 대표 지시로 폰의 **아래 줄 자체를 없앴다**
   ("분류 기능 없애고 업로드 기능만"). 이 검사가 지키던 것은 「없는 단추를
   옮기려 들지 않는다」이고, 그건 그대로 지킨다. 아래 줄이 있느냐는
   그때의 생김새였을 뿐이다 — 생김새를 못 박으면 다음 개편이 또 막힌다. */
test('없는 단추를 옮기려 들지 않는다', () => {
  const fn = app.match(/function placeForWidth\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'placeForWidth 를 찾지 못했습니다.');
  assert.ok(!/cam/.test(fn[0]), '없는 단추를 옮기려 하면 그 줄에서 멎습니다.');
  /* 폰에서 올릴 길은 반드시 하나 남아 있어야 한다 — 없으면 사진을 못 올린다.
     ⚠ 2026-09-03 다시 겨눔 — 「어느 단추냐」가 아니라 「길이 있느냐」다.
       시트의 phUpBtn 을 걷어냈는데(윗줄과 겹쳐서) 이 검사가 그 이름을 박고 있었다.
       올리는 길이 시트에 있든 윗줄에 있든 지킬 것은 «하나는 남아 있는가»뿐이다. */
  assert.match(app, /<button [^>]*onclick="phUpload\(\)"/,
    '폰에서 사진을 올릴 길이 사라졌습니다.');
});

test('가려지는 높이도 함께 줄었다', () => {
  /* 58px 동그라미가 사라졌는데 자리를 그대로 비워 두면, 마지막 사진 아래에
     쓸데없는 빈 칸이 남는다. */
  const m = app.match(/#main\{padding-bottom:(\d+)px\}/);
  assert.ok(m, '아래 여백 규칙을 찾지 못했습니다.');
  assert.ok(Number(m[1]) < 78,
    '카메라 동그라미를 뺐는데 여백이 그대로면 빈 칸이 남습니다.');
});

test('서류 고르기 옆에 빈 구멍이 생기지 않는다', () => {
  /* 짝이던 카메라가 사라졌으므로 두 칸 규칙이 남으면 오른쪽이 빈 구멍이 된다
     — 2026-08-06 대표 화면에서 실제로 그랬다. */
  assert.ok(!/\.row2\{display:grid;grid-template-columns:1fr 1fr/.test(app),
    '단추가 하나뿐인데 두 칸으로 나누면 오른쪽이 빕니다.');
});
