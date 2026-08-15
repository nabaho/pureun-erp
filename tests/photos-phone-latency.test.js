/* 폰에서 「터치 후 기다리는 시간」을 줄인다 — 대표 보고 2026-08-11
   "폰에서 사진첩 들어가면 카메라나 사진첩 모두 터치하면 상당히 화면 넘어가거나
    데이터 입력, 사진 업로드를 위한 터치 후 기다리는 시간이 상당히 길다"

   눌린 티가 안 나면 사람은 눌리지 않은 줄 알고 또 누른다. 그래서 고친 곳은
   모두 「먼저 보여 주고, 무거운 일은 뒤에서」 한 가지 규칙을 따른다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ── ① 카메라: 준비되기 전에 화면부터 ── */
test('★ 카메라는 준비를 기다리지 않고 화면부터 띄운다', () => {
  /* getUserMedia → 최대 해상도로 applyConstraints(파이프라인 재시작) →
     loadPhotoBest 는 폰에서 1~3초다. 예전에는 이게 다 끝난 뒤에야 화면이 떴다. */
  const fn = app.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'openCam 을 찾지 못했습니다.');
  const show = fn[0].indexOf("$('camOv').style.display = 'flex'");
  const wait = fn[0].indexOf('await navigator.mediaDevices.getUserMedia');
  assert.ok(show > 0, '카메라 화면을 띄우는 곳이 없습니다.');
  assert.ok(wait > 0, 'getUserMedia 를 찾지 못했습니다.');
  assert.ok(show < wait,
    '기다린 뒤에 띄우면 1~3초 동안 아무 일도 안 일어난 것처럼 보입니다.');
});

test('★ 준비하다 물러나면 띄운 화면을 도로 닫는다', () => {
  /* 먼저 띄웠으니, 권한 거부·미지원으로 물러날 때 안 닫으면 검은 화면만 남는다 */
  assert.match(app, /function camFail\(\)/, '물러날 때 닫는 곳이 없습니다.');
  const fn = app.match(/async function openCam\(\)[\s\S]*?\n\}/)[0];
  const backOut = fn.slice(fn.indexOf('catch (e2)'), fn.indexOf('camTrack = camStream'));
  const calls = (backOut.match(/camFail\(\)/g) || []).length;
  assert.ok(calls >= 1,
    '물러나는 길이 ' + calls + '곳만 닫습니다 — 하나라도 빠지면 검은 화면이 남습니다.');
});

/* ── ② 올리기: 같은 사진을 두 번 풀지 않는다 ── */
test('★ 사진 한 장을 한 번만 푼다 — 두 번 풀면 폰이 1~2초 멎는다', () => {
  assert.match(app, /function shrinkMany\(file, sizes\)/, 'shrinkMany 가 없습니다.');
  const fn = app.match(/function shrinkMany\([\s\S]*?\n\}/)[0];
  assert.equal((fn.match(/decodeImage\(/g) || []).length, 1,
    '푸는 일이 두 번이면 12메가 사진을 두 번 푸는 것입니다.');
  assert.ok(/sizes\.map\(/.test(fn), '한 번 푼 그림으로 여러 크기를 안 만듭니다.');
  /* ⚠ 다 만든 뒤에 닫아야 한다 — 첫 크기에서 닫으면 둘째가 빈 그림을 그린다 */
  const draw = fn.indexOf('sizes.map'), close = fn.indexOf('im.close');
  assert.ok(close > draw, '먼저 닫으면 둘째 크기가 빈 그림이 됩니다.');
});

test('★ 올리는 길이 실제로 한 번만 푼다', () => {
  const up = app.match(/const sized = await shrinkMany\([\s\S]{0,240}/);
  assert.ok(up, '올리는 길이 shrinkMany 를 안 씁니다.');
  assert.ok(/const full = sized\[0\], thumb = sized\[1\]/.test(up[0]),
    '축소본과 미리보기를 한 번에 안 받습니다.');
});

/* ── ③ 격자: 화면 밖 사진까지 그 자리에서 풀지 않는다 ── */
test('★ 미리보기는 화면에 들어올 때 푼다', () => {
  /* 칸마다 base64 그림이 통째로 박혀 있다. 이것이 없으면 80장이면 80장을
     전부 그 자리에서 풀어 그린다 — 폰에서 몇 백 밀리초가 통으로 멎는다. */
  assert.match(app, /loading="lazy" decoding="async"/,
    '격자 그림이 미루지도 갈라 놓지도 않습니다.');
  const paint = app.match(/function paintThumb\([\s\S]*?\n\}/);
  assert.ok(paint, 'paintThumb 을 찾지 못했습니다.');
  assert.ok(/img\.loading = 'lazy'/.test(paint[0]) && /img\.decoding = 'async'/.test(paint[0]),
    '나중에 끼우는 그림에도 같은 규칙을 줘야 합니다 — 한쪽만 하면 반만 빨라집니다.');
});

/* ── ④ 거른 결과를 예닐곱 번 다시 세지 않는다 ── */
test('★ 한 번 거른 결과를 그 순간 안에서 다시 쓴다', () => {
  const fn = app.match(/function shownItems\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, 'shownItems 를 찾지 못했습니다.');
  assert.ok(/if \(_shownCache\) return _shownCache;/.test(fn[0]), '기억해 두지 않습니다.');
  assert.ok(/shownItemsFresh\(\)/.test(fn[0]), '거르는 규칙을 안 부릅니다.');
});

test('★ 기억은 그 순간까지만 — 다음 순간에는 저절로 버린다', () => {
  /* 더 오래 들고 있으면 사진을 지운 뒤에도 옛 목록을 그려
     「지웠는데 그대로 있다」가 된다. 사람이 무효로 만드는 것을 챙기면 빠뜨린다. */
  const fn = app.match(/function shownItems\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/Promise\.resolve\(\)\.then\(function \(\) \{ _shownCache = null; \}\)/.test(fn),
    '저절로 버리지 않으면 지운 사진이 화면에 남습니다.');
});

/* ── ⑤ 휴지통: 훑기를 기다리지 않고 먼저 그린다 ── */
test('★ 휴지통은 아홉 해를 훑기 전에 먼저 그린다', () => {
  const at = app.indexOf("if (name === 'trash')");
  assert.ok(at > 0, '휴지통 여는 곳을 찾지 못했습니다.');
  const blk = app.slice(at, at + 700);
  const draw = blk.indexOf('loadTrash();');
  const purge = blk.indexOf('purgeEveryYearTrash()');
  assert.ok(draw > 0 && purge > 0, '그리기·훑기를 찾지 못했습니다.');
  assert.ok(draw < purge,
    '아홉 해를 다 훑은 뒤에 그리면 1~4초 동안 화면이 텅 빕니다.');
  assert.ok(/if \(view === 'trash'\) loadTrash\(\)/.test(blk),
    '훑는 사이 나갔는데 그리면 남의 화면을 덮어씁니다.');
});
