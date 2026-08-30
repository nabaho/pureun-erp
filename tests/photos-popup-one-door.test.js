'use strict';
/* 창을 여는 문은 «하나»다 — 그리고 걷어낸 「옮기는 창」이 조용히 돌아오지 않게

   ■ 이 파일의 내력
   2026-08-30 오전, 대표 지시 「팝업창 마우스로 움직이게 / 단추바로옆 / 기억하게」로
   공유 창을 「고른 N장 공유하기」 단추 옆에 붙이고, 끌어 옮기고, 옮긴 자리를 기억하게
   만들었다(검사 25개짜리 `photos-share-popup-move.test.js`).

   같은 날 오후, 대표 지시가 한 걸음 더 갔다 —
     "공유하기 클릭하면 캡쳐3셀에 사람을 선택할 수 있게 해달라"
   그래서 격자에서는 창을 아예 안 띄우고 **왼쪽 칸(대시보드) 안에서** 고르게 했다.
   창이 가리는 문제를 «창을 없애서» 푼 셈이라, 옮길 이유 자체가 사라졌다.
   손잡이를 달아 여는 곳이 0군데가 되어 그 70줄이 통째로 죽은 코드였다 →
   대표 결정 ㉮ 로 걷어냈다(PR 참조. 되살릴 일이 생기면 그 커밋을 되돌리면 된다).

   ■ 그래서 여기 남은 것은 둘뿐이다
     ① 창을 여는 문이 하나다 — 이건 옮기기와 상관없이 늘 옳다
     ② 걷어낸 기계장치가 «조용히» 돌아오지 않는다 — 돌아오려면 이 검사를 보게 된다

   ⚠ ②를 왜 검사로 두나: 죽은 코드를 걷어낸 자리에는 다음 사람이 「예전에 있었으니
     다시 넣자」로 되돌리기 쉽다. 되돌리는 것 자체는 괜찮다 — 다만 **왜 걷었는지 읽고**
     되돌려야 한다. 이 검사가 그 한 걸음을 만든다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const { stripComments } = require('./strip-comments');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
/* 글로 견주는 검사는 **주석을 먼저 걷는다** — 잘 쓴 주석이 검사를 통과시킨다 */
const bare = stripComments(app);

test('★★ 창을 여는 자리가 저마다 display 를 안 켠다 — 한 문으로만 연다', () => {
  /* 이 창 하나를 예닐곱 가지 일에 돌려 쓴다(분류·폴더·업체·여러 쪽 서류·공유…).
     여는 자리마다 저마다 켜면 **지난 일의 자취가 남은 창**이 뜨는 날이 온다 —
     같은 병으로 「지우기」 단추가 남았던 적이 있어 closeKindPopup 이 그것을 끈다. */
  const raw = (bare.match(/\$\('kindPopup'\)\.style\.display\s*=\s*'flex'/g) || []).length;
  assert.equal(raw, 1,
    '★★ 여는 자리가 ' + raw + '군데입니다 — showKindPopup() 한 문으로만 여십시오.\n' +
    '  (그 한 군데는 showKindPopup 자신입니다)');
  assert.match(cutFn(app, 'function showKindPopup('), /\$\('kindPopup'\)\.style\.display = 'flex'/,
    '★★ 그 한 군데가 showKindPopup 이 아닙니다');
  const doors = (bare.match(/showKindPopup\(/g) || []).length;
  assert.ok(doors >= 9, '여는 자리가 모자랍니다 (지금 ' + doors + ') — 어딘가 직접 켜고 있습니다');
});

test('★★ 걷어낸 «옮기는 창»이 조용히 돌아오지 않는다 (대표 결정 2026-08-30 ㉮)', () => {
  /* ⚠ 되돌리지 말라는 뜻이 «아니다». 되돌릴 때 이 검사를 보고 위 내력을 읽으라는 뜻이다.
     그때 함께 물어야 할 것: 「왼쪽 칸에서 고르는 길은 어떻게 되나」 —
     둘을 함께 두면 같은 일을 하는 화면이 다시 둘이 된다. 그것이 애초의 병이었다. */
  ['popAnchor', 'popPlace', 'popSavePos', 'popSavedPos', 'popGrab', 'popMove', 'popDrop']
    .forEach(function (n) {
      assert.ok(!new RegExp('\\b' + n + '\\s*\\(').test(bare),
        '★★ 걷어낸 「창 옮기기」가 돌아왔습니다: ' + n + '\n' +
        '  걷은 까닭은 tests/photos-popup-one-door.test.js 머리말에 있습니다 —\n' +
        '  왼쪽 칸에서 고르는 길과 «둘 다» 두면 같은 일을 하는 화면이 또 둘이 됩니다.');
    });
  assert.ok(!/classList\.(add|remove|contains)\('move'\)/.test(bare),
    '★★ 「옮길 수 있는 창」 표시(.move)가 돌아왔습니다');
  assert.ok(!/#kindPopup\.move/.test(app), '★★ 「옮길 수 있는 창」 꾸밈이 돌아왔습니다');
  assert.ok(!/showKindPopup\(\s*'/.test(bare),
    '★★ 손잡이를 달아 여는 자리가 생겼습니다 — 지금은 붙일 단추가 없습니다');
});

test('★ 창은 예전처럼 «바깥을 눌러도» 닫힌다 — 크게 보기와 같은 손짓', () => {
  /* 옮길 수 있던 동안에는 바깥 클릭을 막아 두었다(끌다가 체크가 날아가서).
     이제 옮기지 않으므로 그 예외도 함께 걷었다 — 새로 배울 손짓을 남기지 않는다. */
  const tag = /<div id="kindPopup"[^>]*onclick="([^"]*)"/.exec(app);
  assert.ok(tag, '★ 바깥 클릭을 받는 자리가 없습니다');
  assert.match(tag[1], /closeKindPopup\(\)/);
  assert.ok(!/classList\.contains\('move'\)/.test(tag[1]),
    '★ 걷어낸 .move 를 아직 보고 있습니다');
});

test('★ 눈에 보이는 닫는 길(✕)은 남겨 둔다 — 바깥 클릭·ESC 를 모르는 분에게', () => {
  assert.match(app, /id="kindPopupX"[^>]*onclick="closeKindPopup\(\)"/,
    '★ ✕ 가 없어졌습니다');
  /* ⚠ 꾸밈만 보면 안 된다 — 마크업에만 되살려 놓아도 화면에는 손잡이가 나온다
     (돌연변이에서 살아남던 자리다). 이름이 «어디에도» 없어야 한다. */
  assert.ok(!/kindPopupGrip/.test(bare),
    '★ 끄는 손잡이(⠿)가 남아 있습니다 — 안 움직이는 창에 손잡이가 있으면 「왜 안 되지」가 됩니다');
});
