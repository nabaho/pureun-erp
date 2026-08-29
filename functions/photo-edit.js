/* AI 지우개 대리인 — 사진에서 «표시한 곳»을 지우고 배경으로 메운다.
   (대표 지시 2026-08-29: "특정부분 없어지게하거나 만들고 싶은데" ·
    "편집기능에 최소 비용이 들게 만들어야한다")

   ⚠ **왜 서버인가** — 열쇠는 서버만 안다(2026-08-17 판독 대리인과 같은 까닭).
     브라우저에 두면 반드시 샌다.

   ⚠ **요금이 이 파일의 주제다.** 그림을 만드는 모델은 판독보다 비싸다. 그래서:
     ① **자른 조각만** 받는다. 2000×1500 통째로 보내면 같은 일에 몇 배가 든다.
        서버가 크기를 **직접 막는다** — 브라우저가 잘못 만들어 보내도 요금이 안 샌다.
     ② **한 번에 한 군데.** 여러 군데를 한 요청에 담으면 조각이 커진다.
     ③ **물음은 서버가 정한다.** 부르는 쪽이 글을 못 보낸다 — 마음대로 시키면
        「없던 것을 만들어 넣는」 일에도 쓰이고, 그것은 증빙 사진에 있어선 안 된다.
        이 대리인이 하는 일은 **지우고 메우기 하나**다.

   ⚠ 값 다루는 부분만 여기 둔다(네트워크는 index.js 가 붙인다) — 검사에서 가짜
     fetch 를 끼워 실제로 돌려 볼 수 있어야 한다. */
"use strict";

/* 그림을 고치는 모델. ⚠ 판독과 **다른 모델**이다(글자 모델은 그림을 못 만든다).
   ⚠ 하나만 박아 두면 구글이 내릴 때 조용히 멈춘다 — 차례로 시도한다
     (2026-06-01 에 gemini-2.0-flash 가 내려가며 실제로 겪었다). */
const MODELS = ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"];

/* ── 크기 자물쇠 — 이것이 요금 자물쇠다 ──
   조각 하나가 이보다 크면 **부르기 전에** 돌려보낸다. 구글을 부르고 나서
   「너무 큽니다」 하면 그만큼이 이미 요금이다. */
const MAX_IMAGE_BYTES = 1200 * 1024;   // 자른 조각 하나 ≈ 768px 언저리
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/* 표시 색 — 브라우저가 지울 자리를 이 색으로 칠해 보낸다.
   ⚠ 사진에 잘 없는 색이라야 모델이 헷갈리지 않는다. */
const MARK_COLOR = "#FF00FF";

/* ══════ 물음 — 「무엇을 할까」는 사람이, 「무엇을 지킬까」는 서버가 ══════

   ⚠ 2026-08-29 까지는 **물음을 통째로 서버가 정했다**(부르는 쪽이 글을 못 보냈다).
     까닭은 「없던 것을 만들어 넣는」 데 쓰이면 증빙 사진에서 문제가 되기 때문이었다.
   ⚠ 대표 지시로 그 문을 연다: "한글을 입력해서 이해하고 고칠 수 있게 해달라."
     앞선 지시에도 이미 "특정부분 없어지게하거나 **만들고** 싶은데" 가 있었다.

   ★ 그래서 **글은 받되 «틀»은 서버가 그대로 쥔다.** 사람이 적은 말은 «가운데»에만
     들어가고, 앞뒤의 지킴말은 사람이 못 지운다:
       ① 칠한 자리 «안에서만» 고친다
       ② 나머지 부분은 색·밝기·질감까지 **하나도 안 바꾼다**
       ③ 사진만 돌려준다(글로 답하지 않는다)
     ②가 이 기능의 안전장치다 — 이것이 있어야 «고친 자리»가 어디인지 사람이 안다.
   ⚠ 무엇을 시켰는지는 **사진에 기록으로 남긴다**(meta.edited.what) — 증빙 사진에서
     「이 사진 손댔나」에 답하려면 «무엇을 시켰나»까지 있어야 한다. */

/* 아무 말도 안 적으면 하던 대로 — 지우고 배경으로 메운다 */
const DEFAULT_WANT = "지우고, 그 자리를 주변 배경으로 자연스럽게 메워 주세요";
/* 사람이 적을 수 있는 길이. 길면 모델이 딴 데로 새고 요금도 는다. */
const MAX_WANT = 200;

function wantOf(text) {
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, MAX_WANT) : DEFAULT_WANT;
}

function promptFor(text) {
  return "이 사진에서 마젠타(" + MARK_COLOR + ") 로 덮인 부분에 대해 다음을 해 주세요: " +
    wantOf(text) +
    " ⚠ 고치는 것은 **마젠타로 덮인 자리 안에서만** 입니다." +
    " 나머지 부분은 색·밝기·질감을 포함해 **하나도 바꾸지 마세요.**" +
    " 사진만 돌려주세요(글로 답하지 마세요).";
}

/* 옛 이름 — 아무 말도 안 적었을 때의 물음이다(부르는 자리가 아직 쓴다) */
const PROMPT = promptFor("");

function isTransient(status) {
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

/* 요청이 말이 되는지 본다 — **부르기 전에** 막는 것이 요금을 지킨다. */
function validate(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "요청이 비었습니다" };
  const img = body.image;
  if (!img || typeof img !== "object") return { ok: false, error: "고칠 사진이 없습니다" };
  const data = img.data;
  const mime = String(img.mimeType || img.mime_type || "");
  if (typeof data !== "string" || !data) return { ok: false, error: "사진을 읽을 수 없습니다" };
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return { ok: false, error: "사진 형식이 맞지 않습니다" };

  /* base64 는 원래 크기의 약 4/3 이다 — 실제 바이트로 견준다. */
  const bytes = Math.floor(data.length * 3 / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: "고칠 조각이 너무 큽니다 — 지울 자리를 좁게 그어 주세요" };
  }
  const size = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (size > MAX_BODY_BYTES) return { ok: false, error: "요청이 너무 큽니다" };
  /* 사람이 적은 말 — 없어도 된다(그러면 하던 대로 지우고 메운다).
     ⚠ 글이 아닌 것이 오면 **없는 것으로 친다** — 여기서 던지면 사진까지 못 고친다. */
  const want = typeof body.want === "string" ? body.want : "";
  return { ok: true, data: data, mimeType: mime, want: want };
}

/* 구글에 보낼 몸통 — **틀은 여기서** 붙인다. 사람이 적은 말은 가운데에만 들어간다. */
function editBody(data, mimeType, want) {
  return {
    contents: [{
      parts: [
        { text: promptFor(want) },
        { inline_data: { mime_type: mimeType, data: data } }
      ]
    }],
    generationConfig: { temperature: 0 }
  };
}

function modelUrl(model, key) {
  return "https://generativelanguage.googleapis.com/v1beta/models/" +
    model + ":generateContent?key=" + encodeURIComponent(key);
}

/* 열쇠가 섞여 나가지 않게 — 판독 대리인과 같은 규칙. */
function safeReason(json, key) {
  let why = (json && json.error && json.error.message) || "";
  if (!why) return "";
  if (key) why = why.split(key).join("(열쇠)");
  return why.replace(/AQ\.[A-Za-z0-9_\-]{10,}/g, "(열쇠)")
    .replace(/AIza[A-Za-z0-9_\-]{20,}/g, "(열쇠)");
}

/* 답에서 **그림 한 장**을 꺼낸다.
   ⚠ 모델이 글로만 답할 때가 있다(「할 수 없습니다」). 그때 그림이 없다고
     조용히 원본을 돌려주면 **안 고쳐진 사진을 고쳤다고 믿게 된다.** 없으면 없다고 한다. */
function pickImage(json) {
  const cands = (json && json.candidates) || [];
  for (const c of cands) {
    const parts = (c && c.content && c.content.parts) || [];
    for (const p of parts) {
      const d = p && (p.inline_data || p.inlineData);
      if (d && typeof d.data === "string" && d.data) {
        return { data: d.data, mimeType: String(d.mime_type || d.mimeType || "image/png") };
      }
    }
  }
  return null;
}

/* 모델을 차례로 시도한다 — 판독 대리인과 같은 규칙.
   404·429 면 다음 모델로, 401·403(열쇠 문제)은 곧바로 포기. */
async function callEdit(fetchFn, key, data, mimeType, waits, want) {
  const body = JSON.stringify(editBody(data, mimeType, want));
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: body };
  const pauses = waits || [2000, 5000];
  let last = { status: 0, why: "" };

  for (const model of MODELS) {
    for (let attempt = 0; ; attempt++) {
      let r;
      try {
        r = await fetchFn(modelUrl(model, key), init);
      } catch (e) {
        last = { status: 0, why: String((e && e.message) || e) };
        break;
      }
      if (r && r.ok) {
        const json = await r.json();
        const img = pickImage(json);
        if (img) return { ok: true, image: img };
        /* 그림이 없다 — 다른 모델이 그려 줄 수도 있으니 넘어간다 */
        last = { status: 200, why: "AI가 고친 사진을 돌려주지 않았습니다" };
        break;
      }
      const status = (r && r.status) || 0;
      let why = "";
      try { why = safeReason(await r.json(), key); } catch (_) { /* 본문이 없을 수 있다 */ }
      last = { status: status, why: why };

      if (isTransient(status) && attempt < pauses.length) {
        await new Promise(function (res) { setTimeout(res, pauses[attempt]); });
        continue;
      }
      if (status === 401 || status === 403) return { ok: false, status: status, why: why };
      break;
    }
  }
  return { ok: false, status: last.status, why: last.why };
}

module.exports = {
  MODELS, MAX_IMAGE_BYTES, MAX_BODY_BYTES, MARK_COLOR, PROMPT,
  DEFAULT_WANT, MAX_WANT, wantOf, promptFor,
  isTransient, validate, editBody, modelUrl, safeReason, pickImage, callEdit
};
