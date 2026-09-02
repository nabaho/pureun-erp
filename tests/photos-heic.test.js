/* 아이폰 사진(HEIC) — «안내»가 아니라 «바꿔서» 담는다
   대표 지시 2026-08-30: 「개선 해라」 (화면에 뜬 알림 갈무리와 함께)

   여태 화면은 이렇게 말했다:
     「설정 → 카메라 → 포맷 → 「높은 호환성」으로 바꾼 뒤 다시 찍어 주세요」
   ⚠ 이미 찍힌 사진에게 「다시 찍어라」는 안내가 아니다 — 회의는 이미 끝났다.
     카톡으로 받은 남의 아이폰 사진이면 손쓸 길이 아예 없다.
   TIF 때 적어 둔 그 말이 여기에도 맞는다 — 엉뚱한 안내는 안내가 없는 것보다 나쁘다.

   실제 브라우저(크로미움)에서 재어 확인한 것(2026-08-30):
     · HEIC 를 <img> 로는 못 연다
     · heic2any 로 바꾸면 640×480 한 장에 0.4~0.7초, 결과는 진짜 JPEG (640x480 로 열림)
     · 이름을 1000019899.heic → 1000019899.jpg 로 바꾸고 찍은 시각을 그대로 물려준다

   지키는 규칙:
     ① 떠넘기지 않는다 — 올리는 길에서 스스로 바꾼다
     ② 「다시 찍어 주세요」는 HEIC 안내에 다시 오면 안 된다
     ③ 이름만 heic 인 것도 가려낸다 (안드로이드는 type 을 안 채워 준다)
     ④ 도구는 쓸 때만 받는다 · 우리 사본 먼저
     ⑤ 장마다 alert 를 띄우지 않는다 — 한 번만, 이름과 까닭을 대고
   실행: node --test tests/photos-heic.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');

/* ③ 가려내는 규칙은 진짜 함수를 떼어 돌린다 */
function 가려내기() {
  const at = src.indexOf('function isHeic(');
  assert.ok(at > 0, 'HEIC 를 가려내는 함수가 없습니다');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(at, src.indexOf('\n}', at) + 2), ctx);
  return ctx.isHeic;
}

test('★ 이름만 heic 인 것도 가려낸다 — 안드로이드는 형식을 안 채워 준다', () => {
  const isHeic = 가려내기();
  assert.equal(isHeic({ name: '1000019899.heic', type: '' }), true,
    '★ 형식이 비어 오면 놓칩니다 — 대표 화면에 뜬 파일이 바로 이것입니다');
  assert.equal(isHeic({ name: 'IMG_0001.HEIC', type: '' }), true, '대문자를 놓칩니다');
  assert.equal(isHeic({ name: 'a.heif', type: '' }), true, 'heif 를 놓칩니다');
  assert.equal(isHeic({ name: 'x', type: 'image/heic' }), true, '형식으로도 가려야 합니다');
  assert.equal(isHeic({ name: 'b.jpg', type: 'image/jpeg' }), false, 'JPG 를 건드립니다');
  assert.equal(isHeic({ name: 'c.pdf', type: 'application/pdf' }), false, 'PDF 를 건드립니다');
});

test('★ 올리는 길에서 스스로 바꾼다 — 사람에게 떠넘기지 않는다', () => {
  assert.match(src, /async function heicToJpeg\(/, '바꾸는 함수가 없습니다');
  /* 바꾸는 함수를 «올리는 고리 안»에서 불러야 뜻이 있다 — 만들어만 두면 없는 것이다 */
  const at = src.indexOf('for (let fi = 0; fi < files.length; fi++)');
  assert.ok(at > 0, '올리는 고리를 못 찾았습니다');
  const 고리 = src.slice(at, at + 900);
  assert.match(고리, /await heicToJpeg\(/,
    '★ 바꾸는 함수를 올리는 길에서 부르지 않습니다 — 만들어만 두면 없는 것과 같습니다');
});

test('★ 「다시 찍어 주세요」는 HEIC 안내에 다시 오면 안 된다', () => {
  const at = src.indexOf('function cantOpenWhy(');
  assert.ok(at > 0, '까닭을 말하는 함수가 사라졌습니다');
  const fn = src.slice(at, src.indexOf('\nfunction decodeViaDataUrl', at));
  /* ⚠ 주석은 뺀다 — 여기서 보려는 것은 «사람에게 보이는 말»이지 코드의 메모가 아니다.
     (「다시 찍어라로 되돌리지 말 것」이라는 경고 주석이 이 검사에 걸리면 안 된다) */
  const 보이는말 = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const heic칸 = 보이는말.slice(보이는말.indexOf('hei[cf]'));
  assert.ok(heic칸.indexOf('다시 찍어') < 0,
    '★ 이미 찍힌 사진에게 「다시 찍어라」라고 말하고 있습니다');
  assert.ok(heic칸.indexOf('높은 호환성') < 0,
    '★ 남이 보낸 사진에는 그 설정을 바꿀 길이 없습니다');
});

test('도구는 쓸 때만 받는다 — 안 쓰는 날에는 1.3MB 를 안 받는다', () => {
  assert.ok(!/<script[^>]+heic2any/.test(src),
    'heic2any 를 처음부터 싣고 있습니다 — 아이폰 사진을 안 올리는 날에도 받습니다');
  assert.match(src, /loadScriptOnce\(HEIC_LIB_HERE\)/, '쓸 때 받는 길이 없습니다');
});

test('우리 사본을 먼저 본다 — 인터넷이 없어도 바뀐다', () => {
  const at = src.indexOf('async function loadHeicLib(');
  assert.ok(at > 0);
  const fn = src.slice(at, src.indexOf('\n}', at));
  const 사본 = fn.indexOf('HEIC_LIB_HERE'), 바깥 = fn.indexOf('HEIC_LIB_CDN');
  assert.ok(사본 > 0 && 바깥 > 사본, '바깥을 먼저 보고 있습니다');
  assert.match(src, /HEIC_LIB_HERE = 'vendor\//, '사본이 vendor 에 있지 않습니다');
});

test('사본과 라이선스가 실제로 저장소에 있다', () => {
  const lib = path.join(ROOT, 'vendor/heic2any.min.js');
  assert.ok(fs.existsSync(lib), '사본이 없습니다 — 인터넷이 끊기면 아무것도 못 바꿉니다');
  assert.ok(fs.statSync(lib).size > 100000, '사본이 너무 작습니다 — 제대로 안 받아졌습니다');
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor/heic2any-LICENSE.md')),
    'MIT 라이선스 고지를 함께 두어야 합니다');
});

test('★ 장마다 alert 를 띄우지 않는다 — 열 장이 막히면 열 번 눌러야 했다', () => {
  assert.ok(src.indexOf("alert('사진 하나를 읽지 못했습니다") < 0,
    '★ 장마다 알림이 뜹니다 — 대표 화면에서 실제로 겪은 자리입니다');
  /* 그러나 조용히 넘기지도 않는다 — 사진이 소리 없이 빠지면 다음 달에야 안다 */
  assert.match(src, /failed\.push\(/, '못 담은 것을 모으지 않습니다');
  assert.match(src, /failed\.length \+ '장을 담지 못했습니다/,
    '못 담은 것을 화면에 말하지 않습니다');
  assert.match(src, /failed\.slice\(0, 5\)[\s\S]{0,200}x\.name/,
    '무엇이 안 됐는지 이름을 대지 않습니다');
});

test('찍은 시각을 물려준다 — 오래된 사진이 「오늘 것」이 되면 차례가 뒤엉킨다', () => {
  const at = src.indexOf('async function heicToJpeg(');
  const fn = src.slice(at, src.indexOf('\n}', at));
  assert.match(fn, /lastModified: f\.lastModified/,
    '찍은 시각을 안 물려주면 올린 목록 차례가 뒤엉킵니다');
  assert.match(fn, /\.jpg/, '이름의 .heic 를 안 바꾸면 내려받은 사람이 또 못 엽니다');
});
