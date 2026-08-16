/* 주민등록번호 가림 — 계산 층
   AI 판독기로 보내기 **전에** 사진에서 주민번호 자리를 까맣게 덮는다.
   설계서: docs/superpowers/specs/2026-08-15-주민번호-가림-design.md
   계획서: docs/superpowers/plans/2026-08-15-주민번호-가림.md

   ⚠ 왜 화면에서 떼어 놓았나
   좌표를 잘못 환산하면 **엉뚱한 자리가 덮이고 주민번호는 그대로 나간다.**
   화면 없이 숫자로 검사할 수 있어야 그 실수를 잡는다.

   ⚠ 사각형은 픽셀이 아니라 **비율(0~1)** 로 담는다
   폰을 돌리거나 창을 줄이면 사진이 보이는 크기가 달라진다. 픽셀로 담으면
   그때마다 가린 자리가 어긋난다. */
(function (global) {
  'use strict';

  function clamp01(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    return n < 0 ? 0 : (n > 1 ? 1 : n);
  }

  /* 손이 떨려 점만 찍힌 것은 사각형으로 치지 않는다 — 눈에 보이지도 않는 칸이
     목록에 쌓이면 「3군데 가림」이 거짓말이 된다. */
  var MIN_SIDE = 0.005;

  /* 드래그한 두 점(화면 픽셀) → 사각형 하나(비율). 못 만들면 null. */
  function rectFromDrag(x0, y0, x1, y1, viewW, viewH) {
    if (!(viewW > 0) || !(viewH > 0)) return null;
    var left = clamp01(Math.min(x0, x1) / viewW);
    var top = clamp01(Math.min(y0, y1) / viewH);
    var right = clamp01(Math.max(x0, x1) / viewW);
    var bottom = clamp01(Math.max(y0, y1) / viewH);
    var box = { x: left, y: top, w: right - left, h: bottom - top };
    if (box.w < MIN_SIDE || box.h < MIN_SIDE) return null;
    return box;
  }

  /* 비율 사각형 → **원본 크기** 픽셀. 사진 밖으로 넘치면 사진 안에서 끝낸다. */
  function toPixels(box, imgW, imgH) {
    var x = clamp01(box && box.x);
    var y = clamp01(box && box.y);
    var w = Math.min(1 - x, Math.max(0, Number((box && box.w) || 0)));
    var h = Math.min(1 - y, Math.max(0, Number((box && box.h) || 0)));
    return {
      x: Math.round(x * imgW), y: Math.round(y * imgH),
      w: Math.round(w * imgW), h: Math.round(h * imgH)
    };
  }

  global.PuRrnMask = {
    rectFromDrag: rectFromDrag,
    toPixels: toPixels
  };
})(typeof window !== 'undefined' ? window : globalThis);
