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
  /* ── 조각이 «너무 작아도» 안 된다 (2026-08-29 이어 만들기) ──
     ⚠ 둘레만 비율로 떠 오면, 작은 것을 지울 때 조각이 통째로 100px 남짓이 된다.
       벽시계 하나를 지우려는데 모델에게 보이는 것이 손톱만 한 그림이면
       **메울 배경이 무엇인지 알 길이 없다** — 대표가 「시원찮다」고 하실 자리가 여기다.
     ⚠ 넓게 떠도 **보내는 양은 안 는다.** 어차피 긴 변을 MAX_EDGE 로 줄여 보내므로,
       넓게 뜨면 같은 요금으로 배경을 더 보여 주는 셈이다.
     ⚠ 사진보다 크면 사진 전체까지만. */
  var MIN_CROP = 512;
  /* ── 돌아온 조각에서 «되붙일 자리» ──
     지운 네모 둘레로 이만큼만 더 붙인다(이음매를 감출 만큼만).
     ⚠ 둘레(PAD)까지 통째로 되붙이면 **지운 자리보다 다섯 배 넓은 자리가 흐려진다** —
       줄여 보낸 조각을 다시 늘려 붙이기 때문이다. 그 흐린 네모가 곧 자국이다. */
  var BACK_PAD_RATIO = 0.06;
  var BACK_MIN_PAD = 8;
  var MARK = '#FF00FF';  // 서버의 물음과 **같은 색**이어야 한다(functions/photo-edit.js)

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* [a,b) 를 want 만큼으로 넓힌다 — 가운데를 붙잡고 양쪽으로, 사진(0~max) 안에서.
     ⚠ 한쪽 끝에 닿으면 **모자란 만큼을 반대쪽에서** 받아 온다. 안 그러면
       가장자리에 있는 것을 지울 때만 조각이 반쪽이 된다(그때가 제일 어렵다). */
  function growTo(a, b, want, max) {
    if (want <= b - a) return [a, b];
    /* ⚠ 「사진보다 넓게 원할 때」를 따로 다루지 않는다 — 아래 두 번의 밀기와
       마지막 자르기가 그 경우까지 [0, max] 로 끝낸다. 따로 재면 두 곳이 같은 일을 한다. */
    var half = (want - (b - a)) / 2;
    var lo = Math.round(a - half), hi = Math.round(b + half);
    if (lo < 0) { hi -= lo; lo = 0; }
    if (hi > max) { lo -= (hi - max); hi = max; }
    return [Math.max(0, lo), Math.min(max, hi)];
  }

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
    /* 너무 작으면 넓힌다 — 네모 «가운데»를 붙잡고 양쪽으로 편 뒤 사진 안으로 민다.
       ⚠ 가장자리에서는 한쪽으로만 밀어야 한다. 그냥 자르면 조각이 다시 작아진다. */
    /* ⚠ 사진보다 크게 뜰 걱정은 안 한다 — growTo 가 「원하는 만큼이 사진보다 넓으면
       사진 전체」로 끝낸다. 여기서 또 재면 두 곳이 같은 일을 하고, 언젠가 한쪽만 바뀐다. */
    var want = opts.minCrop || MIN_CROP;
    var grown = growTo(sx, ex, want, imgW);
    sx = grown[0]; ex = grown[1];
    grown = growTo(sy, ey, want, imgH);
    sy = grown[0]; ey = grown[1];
    var sw = ex - sx, sh = ey - sy;
    if (sw <= 0 || sh <= 0) return null;

    /* 줄이기 — 긴 변을 maxEdge 로. **키우지는 않는다**(작은 조각을 늘려 봐야
       없던 그림이 생기지 않고 보내는 양만 는다). */
    var scale = Math.min(1, maxEdge / Math.max(sw, sh));
    /* 되붙일 자리 — 지운 네모 둘레로 조금만. **원본 픽셀**이고 조각 안에 있어야 한다. */
    var bp = Math.max(BACK_MIN_PAD, Math.round(Math.max(pw, ph) * BACK_PAD_RATIO));
    var bx = clamp(Math.round(px - bp), sx, sx + sw);
    var by = clamp(Math.round(py - bp), sy, sy + sh);
    var bex = clamp(Math.round(px + pw + bp), sx, sx + sw);
    var bey = clamp(Math.round(py + ph + bp), sy, sy + sh);
    return {
      sx: sx, sy: sy, sw: sw, sh: sh,
      /* 조각 안에서 «지울 네모»가 어디인가 — 마젠타를 칠할 자리다 */
      mx: Math.round(px - sx), my: Math.round(py - sy),
      mw: Math.round(pw), mh: Math.round(ph),
      /* 돌아온 조각에서 «이만큼만» 되붙인다(원본 픽셀 자리) */
      bx: bx, by: by, bw: Math.max(1, bex - bx), bh: Math.max(1, bey - by),
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
    /* ── 칠한 «모양 그대로» 표시한다 (대표 지시 2026-08-29 「자유롭게 편집」) ──
       opts.shape 는 사진과 같은 크기의 그림이고, 칠한 자리에만 색이 있다.
       ⚠ 네모로 덮으면 지울 것 둘레의 **멀쩡한 배경까지 지우라고 시키는** 셈이다.
         의자에 걸린 옷 하나를 지우려는데 네모 안의 벽·바닥까지 새로 그려진다.
       ⚠ source-in — 「칠한 자리에만 마젠타」를 만드는 길이다. 모양을 먼저 그리고
         그 위에 색을 덮되 **겹치는 곳만** 남긴다. */
    if (opts.shape) {
      var m = make(spec.outW, spec.outH);
      var mc = m.getContext('2d');
      mc.drawImage(opts.shape, spec.sx, spec.sy, spec.sw, spec.sh, 0, 0, spec.outW, spec.outH);
      mc.globalCompositeOperation = 'source-in';
      mc.fillStyle = MARK;
      mc.fillRect(0, 0, spec.outW, spec.outH);
      ctx.drawImage(m, 0, 0);
    } else {
      ctx.fillRect(Math.round(spec.mx * spec.scale), Math.round(spec.my * spec.scale),
        Math.max(1, Math.round(spec.mw * spec.scale)), Math.max(1, Math.round(spec.mh * spec.scale)));
    }
    return { spec: spec, dataUrl: canvas.toDataURL('image/jpeg', opts.quality || 0.9) };
  }

  /* ── 돌아온 조각을 «제자리에» 붙인다 ──
     ⚠ 원본을 통째로 다시 그리고 **지운 네모 둘레만** 덮는다.
       사진 전체를 AI 에게 받으면 나머지도 미세하게 바뀌고, 그것이 증빙 사진에서는
       「손댄 사진」이 된다.
     ⚠ 조각 «전체»(둘레 포함)를 되붙이지 않는다 — 줄여 보낸 것을 다시 늘려 붙이므로
       지운 자리보다 다섯 배 넓은 자리가 흐려진다. **그 흐린 네모가 곧 자국이다.**
       둘레를 넓게 뜬 것은 모델에게 «보여 주기» 위한 것이지 되붙이기 위한 것이 아니다.
     ⚠ 대신 이음매가 생길 수 있다 — 그래서 네모보다 조금(BACK_PAD) 넓게 붙인다.
       모델이 틀을 옮기지 않는다는 전제이고, 물음이 그것을 못박고 있다.
     ⚠ **사진 전체가 다시 구워지는 것은 어쩔 수 없다**(JPEG 이다). 그림은 그대로지만
       화소 값은 미세하게 달라진다 — 「하나도 안 바뀐다」고 말하지 않는다. */
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
    /* 돌아온 조각의 «실제» 크기로 잰다 — 모델이 보낸 크기가 보낸 크기와 다를 수 있다.
       그래서 자리를 픽셀이 아니라 **비율**로 옮긴다. */
    var pw = (patchImg && (patchImg.naturalWidth || patchImg.width)) || spec.outW;
    var ph = (patchImg && (patchImg.naturalHeight || patchImg.height)) || spec.outH;
    /* 되붙일 자리 — 없으면 조각 전체(옛 자국이 남은 사진을 다시 손볼 때) */
    var bx = spec.bx === undefined ? spec.sx : spec.bx;
    var by = spec.by === undefined ? spec.sy : spec.by;
    var bw = spec.bw === undefined ? spec.sw : spec.bw;
    var bh = spec.bh === undefined ? spec.sh : spec.bh;
    var u = (bx - spec.sx) / spec.sw, v = (by - spec.sy) / spec.sh;
    ctx.drawImage(patchImg,
      Math.round(u * pw), Math.round(v * ph),
      Math.max(1, Math.round(bw / spec.sw * pw)), Math.max(1, Math.round(bh / spec.sh * ph)),
      bx, by, bw, bh);
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
  /* ⚠ want — 사람이 한글로 적은 «무엇을 할까» (대표 지시 2026-08-29
     "한글을 입력해서 이해하고 고칠 수 있게 해달라"). 안 적으면 하던 대로 지우고 메운다.
     ⚠ **틀은 서버가 쥔다** — 「칠한 자리 안에서만」·「나머지는 하나도 안 바꾼다」는
       사람이 못 지운다(functions/photo-edit.js promptFor).
     ⚠ 돌아온 «무엇을 시켰나»(want)를 그대로 올려 보낸다 — 화면이 사진에 기록으로
       남긴다. 증빙 사진에서 「이 사진 손댔나」에 답하려면 그것까지 있어야 한다. */
  function callEdit(deps, dataUrl, want) {
    var fetchFn = deps && deps.fetch;
    var getToken = deps && deps.getToken;
    if (!fetchFn || !getToken) return Promise.reject(new Error('로그인 정보를 확인할 수 없습니다'));
    var img = splitDataUrl(dataUrl);
    return getToken().then(function (tok) {
      if (!tok) throw new Error('로그인 후 이용해 주세요');
      return fetchFn(deps.url || EDIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ image: img, want: String(want == null ? '' : want) })
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j || !j.ok) {
          throw new Error((j && j.error) || ('AI 가 응답하지 않습니다 (' + (r.status || 0) + ')'));
        }
        if (!j.image || !j.image.data) throw new Error('AI 가 고친 사진을 돌려주지 않았습니다');
        return {
          src: 'data:' + (j.image.mimeType || 'image/png') + ';base64,' + j.image.data,
          want: String(j.want || '')
        };
      });
    });
  }

  /* ── 얼마나 «또렷하게» 돌아왔나 (대표 지시 2026-08-30 「1번부터」) ──
     남은 일이 「실사진으로 해 보고 시원찮으면 조각 크기(MAX_EDGE·MIN_CROP)를 맞춘다」
     였는데, **잴 눈금이 없었다.** 결과가 흐린지 아닌지를 눈대중으로만 말하면
     조율값을 어느 쪽으로 얼마나 옮길지 영영 못 정한다.

     ★ 재는 것은 하나다 — **원본 1픽셀을 조각 몇 픽셀이 그리고 있나.**
       되붙일 때 조각에서 (bw/sw × 돌아온너비) 만큼을 떠서 원본 bw 픽셀에 그린다.
       그러니 배수 = 돌아온너비 ÷ 자른너비(sw). 이 값이
         1 이상 → 줄여 붙인다. 또렷하다.
         1 미만 → **늘려 붙인다. 그 자리가 흐려지고, 그 흐린 자국이 곧 「시원찮다」다.**
     ⚠ 보낸 크기(outW)가 아니라 **자른 크기(sw)** 로 잰다 — 되붙는 곳이 원본이라서다.
       크게 칠할수록 sw 가 커지고, 모델이 돌려주는 크기는 대개 정해져 있어
       «넓게 칠할수록 흐려진다». 그 관계를 숫자로 보여 주려는 것이다. */
  function fitOf(spec, patchImg) {
    if (!spec) return null;
    var pw = (patchImg && (patchImg.naturalWidth || patchImg.width)) || 0;
    var ph = (patchImg && (patchImg.naturalHeight || patchImg.height)) || 0;
    if (!pw || !ph) return null;
    return {
      cut: spec.sw + '×' + spec.sh,          // 원본에서 떠낸 조각
      sent: spec.outW + '×' + spec.outH,     // 줄여서 보낸 것
      back: pw + '×' + ph,                   // 돌아온 것
      /* 소수 둘째 자리까지 — 0.68 과 0.7 은 눈에 다르게 보인다 */
      per: Math.round((pw / spec.sw) * 100) / 100
    };
  }

  global.PuPhotoEdit = {
    EDIT_URL: EDIT_URL, MAX_EDGE: MAX_EDGE, PAD_RATIO: PAD_RATIO, MARK: MARK,
    MIN_CROP: MIN_CROP,
    cropSpec: cropSpec, buildCrop: buildCrop, pasteBack: pasteBack, fitOf: fitOf,
    splitDataUrl: splitDataUrl, callEdit: callEdit
  };
})(typeof window !== 'undefined' ? window : globalThis);
