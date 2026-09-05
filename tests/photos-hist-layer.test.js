'use strict';
/* 「계속 튕겨서 초기화면으로 간다」 — 뒤로가기 칸 (대표 보고 2026-09-05)

   ■ 무엇이었나 — 쌓아 두고 «안 놓은» 칸이 남았다
   카메라·크게 보기는 열 때 뒤로가기 칸을 하나 쌓는다(폰 뒤로가기로 닫히게).
   그런데 두 자리에서 그 칸이 새고 있었다.
     ① 「찍은 것 고르기」로 넘어가면 camOv 를 감춘다. 그때 뒤로가기를 누르면
        popstate 가 **「화면이 안 보인다」는 이유로 그냥 되돌아갔다** —
        칸은 이미 빠졌는데 camPushed 는 true 로 남는다.
     ② 「올리기」로 끝나는 길은 camDiscard 만 부르고 **칸을 안 놓았다.**
   그래서 헛칸이 남고, 다음 뒤로가기가 그 헛칸을 먹고(아무 일 없음),
   그다음 뒤로가기가 **사진첩을 통째로 나간다.** 포털에서 들어왔으니 바로 초기화면이다.

   ■ 고친 규칙 둘
   ① 판단은 «우리가 쌓았는가»로만 한다 — 화면이 지금 어떻게 보이는지로 묻지 않는다.
   ② 놓는 곳은 **한 곳**이다 — 두 곳에서 놓으면 한 번에 두 칸이 빠지고, 그것이 곧 튕김이다.

   실행: node --test tests/photos-hist-layer.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const app = stripComments(raw);

/* popstate 손잡이 둘을 각각 떼어 온다 */
function popHandlers() {
  const out = [];
  const re = /window\.addEventListener\('popstate', function \(\) \{([\s\S]*?)\n\}\);/g;
  let m;
  while ((m = re.exec(app))) out.push(m[1]);
  return out;
}

test('★★ popstate 가 «화면이 보이나»로 묻지 않는다 — 감춘 사이에 눌리면 칸만 샌다', () => {
  const hs = popHandlers();
  assert.ok(hs.length >= 2, '★ popstate 손잡이를 못 찾았습니다 (' + hs.length + ')');
  hs.forEach(function (h, i) {
    assert.ok(!/style\.display !== 'flex'/.test(h),
      '★★ ' + (i + 1) + '번째 손잡이가 화면 상태로 판단합니다.\n' +
      '  「찍은 것 고르기」에서는 camOv 가 감춰져 있어 그냥 되돌아갑니다 —\n' +
      '  칸은 이미 빠졌는데 camPushed 는 true 로 남아 **헛칸**이 됩니다.\n' +
      '  그 헛칸 때문에 다음 뒤로가기가 사진첩을 통째로 나갑니다.');
  });
});

test('★★ popstate 는 «우리가 쌓았는가»로 판단한다', () => {
  const hs = popHandlers();
  const guards = hs.map(function (h) { return (h.split('\n')[1] || '') + (h.split('\n')[2] || ''); });
  const joined = hs.join('\n');
  assert.match(joined, /if \(!camPushed\) return;/,
    '★★ 카메라 손잡이가 camPushed 로 안 묻습니다');
  assert.match(joined, /if \(!viewerPushed\) return;/,
    '★★ 크게 보기 손잡이가 viewerPushed 로 안 묻습니다');
  assert.ok(!/if \(!viewerId\) return;/.test(joined),
    '★ 옛 기준(viewerId)이 남아 있습니다 — 화면이 먼저 닫히면 칸만 샙니다');
  assert.ok(guards.length >= 2);
});

/* ══════ 놓는 곳은 «한 곳» ══════ */

test('★★ 카메라 칸을 놓는 곳은 하나다 — 두 곳이면 한 번에 두 칸이 빠진다', () => {
  const backs = (app.match(/history\.back\(\)/g) || []).length;
  assert.equal(backs, 2,
    '★★ history.back() 이 ' + backs + '곳입니다. 카메라 한 곳·크게 보기 한 곳이라야 합니다 —\n' +
    '  한 층을 두 곳에서 놓으면 **한 번에 두 칸이 빠져 사진첩 밖으로 나갑니다.**');
  const drop = stripComments(cutFn(raw, 'function camHistDrop('));
  assert.match(drop, /history\.back\(\)/, '★ 놓는 함수가 실제로 안 놓습니다');
  const close = stripComments(cutFn(raw, 'function closeCam('));
  assert.ok(!/history\.back\(\)/.test(close),
    '★★ 닫기가 제 손으로도 놓고 있습니다 — camDiscard 가 이미 놓았습니다.');
});

test('★★ 어떤 길로 접히든 칸을 놓는다 — 「올리기」로 끝나는 길이 그것이다', () => {
  const fn = stripComments(cutFn(raw, 'function camDiscard('));
  assert.match(fn, /camHistDrop\(\)/,
    '★★ camDiscard 가 칸을 안 놓으면, 「올리기」로 끝난 뒤 헛칸이 남습니다.\n' +
    '  그 뒤 뒤로가기 두 번이면 사진첩 밖입니다.');
});

test('★ 안 쌓았으면 놓지 않는다 — 없는 칸을 빼면 그것이 곧 사진첩을 나가는 걸음이다', () => {
  const drop = stripComments(cutFn(raw, 'function camHistDrop('));
  assert.match(drop, /if \(!camPushed\) return false;/,
    '★★ 쌓았는지 안 보고 빼면, 칸이 없을 때 «진짜 뒤로»가 되어 화면을 나갑니다.');
  assert.match(drop, /camPushed = false;/, '★ 놓고 나서 표를 안 내리면 두 번 뺍니다');
});

test('★ [취소] 하면 칸을 다시 쌓는다 — 안 쌓으면 다음 뒤로가기가 그냥 나간다', () => {
  const hs = popHandlers().join('\n');
  assert.match(hs, /if \(closeCam\(\) === false\) camHistPush\(\);/,
    '★ 찍어 둔 것을 버릴지 물었을 때 [취소]를 누르면 카메라는 그대로입니다 —\n' +
    '  칸도 그대로 있어야 다음 뒤로가기가 카메라를 닫습니다.');
});
