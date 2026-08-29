/* AI 지우개 — 브라우저 쪽 «계산 층» (대표 지시 2026-08-29 「지우개 모두 만들어라」)

   ■ 이 층이 있는 까닭
   ① **요금**이 이 기능의 전부다. 사진 한 장(2000×1500)을 통째로 보내면 같은 일에
      몇 배가 든다. 그래서 **지울 자리만 잘라** 작게 줄여 보낸다. 그 «자르고 줄이는»
      셈이 여기 있고, 검사에서 그대로 돌려 볼 수 있어야 한다.
   ② 화면(pu-photos.html)에 두면 12,000 줄 안에 묻혀 아무도 못 돌려 본다.

   ■ 어떻게 지우나
   지울 네모를 **마젠타로 칠한 조각**을 보내고 「마젠타로 덮인 곳을 지우고 배경으로
   메워라」라고 시킨다. 좌표를 글로 알려 주는 방법은 모델이 자주 빗나간다 —
   색으로 표시하면 어디를 지울지 다툴 여지가 없다.

   ■ 되돌아온 조각은 «제자리에» 붙인다
   사진 전체를 다시 받지 않는다(그것도 요금이고, 나머지가 미세하게 바뀐다).
   조각만 받아 원래 크기로 늘려 그 자리에 덮는다 — **나머지 화소는 원본 그대로다.**

   ⚠ 캔버스를 만드는 일은 주입받는다(makeCanvas) — 노드에서 가짜로 갈아끼워 검사한다. */
(function (global) {
  'use strict';

  /* 서버 대리인 주소 — 판독 대리인과 같은 프로젝트·지역.
     ⚠ 앱마다 적으면 한쪽만 고쳐진다. 여기 한 곳에만 둔다. */
  var EDIT_URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/photoEdit';

  /* ── 요금 자물쇠 ──
     ⚠ 조각의 긴 변을 이만큼으로 줄여 보낸다. 크게 보낼수록 그대로 요금이다.
       768 은 「글자가 아닌 것을 지우는」 데는 넉넉하고, 사진 한 장 값의 몇 분의 일이다. */
  var MAX_EDGE = 768;
  /* 네모 둘레를 이만큼 더 떠서 보낸다 — 메울 배경을 모델이 봐야 자연스럽다.
     ⚠ 너무 넓으면 조각이 커져 요금이 오르고, 지울 곳이 조각 안에서 작아져 잘 안 지워진다. */
  var PAD_RATIO = 0.6;
  var MIN_PAD = 24;      // 아주 작은 네모도 둘레는 봐야 한다(픽셀)
  var MARK = '#FF00FF';  // 서버의 물음과 **같은 색**이어야 한다(functions/photo-edit.js)

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ── 어디를 잘라 보낼까 ──
     box 는 «비율»(0~1)이고 돌려주는 것은 **원본 픽셀**이다.
     ⚠ 사진 밖으로 넘치면 사진 안에서 끝낸다 — 넘긴 채로 그리면 빈 자리가 검게 담겨
       모델이 그 검정까지 배경으로 여긴다. */
  function cropSpec(box, imgW, imgH, opts) {
    opts = opts || {};
    var maxEdge = opts.maxEdge || MAX_EDGE;
    var bx = clamp(Number(box && box.x) || 0, 0, 1);
    var by = clamp(Number(box && box.y) || 0, 0, 1);
    var bw = clamp(Number(box && box.w) || 0, 0, 1 - bx);
    var bh = clamp(Number(box && box.h) || 0, 0, 1 - by);
    var px = bx * imgW, py = by * imgH, pw = bw * imgW, ph = bh * imgH;
    if (pw <= 0 || ph <= 0) return null;

    var pad = Math.max(MIN_PAD, Math.round(Math.max(pw, ph) * PAD_RATIO));
    var sx = clamp(Math.round(px - pad), 0, imgW);
    var sy = clamp(Math.round(py - pad), 0, imgH);
    var ex = clamp(Math.round(px + pw + pad), 0, imgW);
    var ey = clamp(Math.round(py + ph + pad), 0, imgH);
    var sw = ex - sx, sh = ey - sy;
    if (sw <= 0 || sh <= 0) return null;

    /* 줄이기 — 긴 변을 maxEdge 로. **키우지는 않는다**(작은 조각을 늘려 봐야
       없던 그림이 생기지 않고 보내는 양만 는다). */
    var scale = Math.min(1, maxEdge / Math.max(sw, sh));
    return {
      sx: sx, sy: sy, sw: sw, sh: sh,
      /* 조각 안에서 «지울 네모»가 어디인가 — 마젠타를 칠할 자리다 */
      mx: Math.round(px - sx), my: Math.round(py - sy),
      mw: Math.round(pw), mh: Math.round(ph),
      scale: scale,
      outW: Math.max(1, Math.round(sw * scale)),
      outH: Math.max(1, Math.round(sh * scale))
    };
  }

  /* ── 보낼 조각을 만든다 ──
     자르고 → 줄이고 → **지울 자리를 마젠타로 덮는다.**
     ⚠ 마젠타는 «줄인 뒤»에 칠한다. 줄이기 전에 칠하면 가장자리가 다른 색과 섞여
       옅어지고, 모델이 그 흐린 테두리를 지울 곳으로 안 본다. */
  function buildCrop(img, box, opts) {
    opts = opts || {};
    var w = (img && (img.naturalWidth || img.width)) || 0;
    var h = (img && (img.naturalHeight || img.height)) || 0;
    if (!w || !h) throw new Error('사진 크기를 알 수 없습니다 — 다시 열어 주세요');
    var spec = cropSpec(box, w, h, opts);
    if (!spec) throw new Error('지울 자리가 너무 작습니다 — 조금 넓게 그어 주세요');
    var make = opts.makeCanvas || function (cw, ch) {
      var c = global.document.createElement('canvas');
      c.width = cw; c.height = ch; return c;
    };
    var canvas = make(spec.outW, spec.outH);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, spec.sx, spec.sy, spec.sw, spec.sh, 0, 0, spec.outW, spec.outH);
    ctx.fillStyle = MARK;
    ctx.fillRect(Math.round(spec.mx * spec.scale), Math.round(spec.my * spec.scale),
      Math.max(1, Math.round(spec.mw * spec.scale)), Math.max(1, Math.round(spec.mh * spec.scale)));
    return { spec: spec, dataUrl: canvas.toDataURL('image/jpeg', opts.quality || 0.9) };
  }

  /* ── 돌아온 조각을 «제자리에» 붙인다 ──
     ⚠ 원본을 통째로 다시 그리고 그 자리만 덮는다 — 나머지 화소는 **원본 그대로**다.
       사진 전체를 AI 에게 받으면 나머지도 미세하게 바뀌고, 그것이 증빙 사진에서는
       「손댄 사진」이 된다. */
  function pasteBack(img, spec, patchImg, opts) {
    opts = opts || {};
    var w = (img && (img.naturalWidth || img.width)) || 0;
    var h = (img && (img.naturalHeight || img.height)) || 0;
    if (!w || !h) throw new Error('사진 크기를 알 수 없습니다 — 다시 열어 주세요');
    var make = opts.makeCanvas || function (cw, ch) {
      var c = global.document.createElement('canvas');
      c.width = cw; c.height = ch; return c;
    };
    var canvas = make(w, h);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    ctx.drawImage(patchImg, 0, 0,
      (patchImg && (patchImg.naturalWidth || patchImg.width)) || spec.outW,
      (patchImg && (patchImg.naturalHeight || patchImg.height)) || spec.outH,
      spec.sx, spec.sy, spec.sw, spec.sh);
    return canvas.toDataURL('image/jpeg', opts.quality || 0.92);
  }

  /* data URL → 서버가 받는 꼴 */
  function splitDataUrl(u) {
    var m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(u || ''));
    if (!m) throw new Error('사진을 읽을 수 없습니다');
    return { mimeType: m[1], data: m[2] };
  }

  /* ── 서버에 한 번 묻는다 ──
     ⚠ **다시 시도하지 않는다.** 판독과 다르다 — 그림을 만드는 부르기는 한 번이 곧
       요금이라, 조용히 두 번 부르면 사람이 모르는 새 두 배가 나간다.
       서버 안에서는 잠깐 바쁠 때(429·5xx)만 기다렸다 다시 부른다. */
  function callEdit(deps, dataUrl) {
    var fetchFn = deps && deps.fetch;
    var getToken = deps && deps.getToken;
    if (!fetchFn || !getToken) return Promise.reject(new Error('로그인 정보를 확인할 수 없습니다'));
    var img = splitDataUrl(dataUrl);
    return getToken().then(function (tok) {
      if (!tok) throw new Error('로그인 후 이용해 주세요');
      return fetchFn(deps.url || EDIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ image: img })
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j || !j.ok) {
          throw new Error((j && j.error) || ('AI 가 응답하지 않습니다 (' + (r.status || 0) + ')'));
        }
        if (!j.image || !j.image.data) throw new Error('AI 가 고친 사진을 돌려주지 않았습니다');
        return 'data:' + (j.image.mimeType || 'image/png') + ';base64,' + j.image.data;
      });
    });
  }

  global.PuPhotoEdit = {
    EDIT_URL: EDIT_URL, MAX_EDGE: MAX_EDGE, PAD_RATIO: PAD_RATIO, MARK: MARK,
    cropSpec: cropSpec, buildCrop: buildCrop, pasteBack: pasteBack,
    splitDataUrl: splitDataUrl, callEdit: callEdit
  };
})(typeof window !== 'undefined' ? window : globalThis);
