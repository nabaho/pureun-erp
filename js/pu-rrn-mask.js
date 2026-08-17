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

  /* 원본을 그리고 사각형을 까맣게 칠한 뒤 JPEG data URL 로 뽑는다.
     ⚠ **원본 크기**로 그린다. 화면에 보이는 크기로 그리면 좌표가 어긋나
     엉뚱한 데가 덮이고 주민번호는 그대로 남는다.
     ⚠ 반투명이 아니라 **완전히 까맣게** 칠한다 — 옅게 덮으면 밑이 비쳐 읽힌다.
     ⚠ 사진 크기를 모르면 던진다. 조용히 원본을 돌려주면 **안 가려진 사진이 나간다.** */
  function maskToDataUrl(img, boxes, opts) {
    opts = opts || {};
    var w = (img && (img.naturalWidth || img.width)) || 0;
    var h = (img && (img.naturalHeight || img.height)) || 0;
    if (!w || !h) throw new Error('사진 크기를 알 수 없습니다 — 다시 열어 주세요');
    var make = opts.makeCanvas || function (cw, ch) {
      var c = global.document.createElement('canvas');
      c.width = cw; c.height = ch;
      return c;
    };
    var canvas = make(w, h);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    ctx.fillStyle = '#000';
    (boxes || []).forEach(function (b) {
      var p = toPixels(b, w, h);
      if (p.w > 0 && p.h > 0) ctx.fillRect(p.x, p.y, p.w, p.h);
    });
    return canvas.toDataURL('image/jpeg', opts.quality || 0.92);
  }

  /* ── 주민번호 꼴 (2차, 대표 지시 2026-08-15) ──
     세 가지를 잡는다: 900101-1234567 · 900101 - 1234567 · 9001011234567.
     ⚠ 하이픈 없는 13자리를 잡으면 계좌번호처럼 긴 숫자를 잘못 칠할 수 있다.
     그래도 잡는다(대표 결정) — **잘못 칠한 것은 사람이 지우면 되지만 못 잡은
     것은 그대로 나간다.**
     ⚠ 앞뒤가 숫자면 아니다 — 14자리 이상인 것을 13자리로 잘라 잡으면 안 된다.
     ⚠ 뒤돌아보기(lookbehind)를 쓰지 않는다 — 옛 아이폰 사파리에서 통째로 터진다. */
  function looksLikeRrn(text) {
    var t = String(text == null ? '' : text).replace(/\s+/g, '');
    if (/(^|\D)\d{6}[-–—]\d{7}(\D|$)/.test(t)) return true;
    if (/(^|\D)\d{13}(\D|$)/.test(t)) return true;
    return false;
  }

  /* 글자 가장자리가 남으면 그 한 자리로도 읽힌다 — 조금 넓게 덮는다. */
  var PAD = 0.01;

  /* 글자인식이 준 낱말들 → 가릴 사각형(비율).
     ⚠ 낱말이 「900101」 「-」 「1234567」 로 갈라져 오는 일이 흔하다. 그래서
     한 낱말씩만 보지 않고 **이어 붙인 세 낱말까지** 본다. 긴 쪽을 먼저 본다 —
     짧은 쪽부터 잡으면 뒷조각이 안 덮인 채로 끝난다. */
  function boxesFromWords(words, imgW, imgH) {
    var list = (words || []).filter(function (w) {
      return w && String(w.text == null ? '' : w.text).trim();
    });
    var out = [];
    var i = 0;
    while (i < list.length) {
      var hit = 0;
      for (var n = 3; n >= 1; n--) {
        if (i + n > list.length) continue;
        var joined = list.slice(i, i + n).map(function (g) { return String(g.text).trim(); }).join('');
        if (looksLikeRrn(joined)) { hit = n; break; }
      }
      if (!hit) { i += 1; continue; }
      var group = list.slice(i, i + hit);
      var x0 = Math.min.apply(null, group.map(function (g) { return Number(g.x0) || 0; }));
      var y0 = Math.min.apply(null, group.map(function (g) { return Number(g.y0) || 0; }));
      var x1 = Math.max.apply(null, group.map(function (g) { return Number(g.x1) || 0; }));
      var y1 = Math.max.apply(null, group.map(function (g) { return Number(g.y1) || 0; }));
      var x = clamp01(x0 / imgW - PAD);
      var y = clamp01(y0 / imgH - PAD);
      out.push({
        x: x, y: y,
        w: Math.min(1 - x, (x1 - x0) / imgW + PAD * 2),
        h: Math.min(1 - y, (y1 - y0) / imgH + PAD * 2),
        by: 'ai'
      });
      i += hit;
    }
    return out;
  }

  global.PuRrnMask = {
    rectFromDrag: rectFromDrag,
    toPixels: toPixels,
    maskToDataUrl: maskToDataUrl,
    looksLikeRrn: looksLikeRrn,
    boxesFromWords: boxesFromWords
  };
})(typeof window !== 'undefined' ? window : globalThis);
