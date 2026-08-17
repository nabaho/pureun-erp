/* 판독 대리인 — 브라우저 대신 서버가 AI(Gemini)를 부른다.
   값 다루는 부분만 여기 둔다(네트워크는 index.js 가 붙인다) — 그래야 검사에서
   가짜 fetch 를 끼워 실제로 돌려 볼 수 있다.

   ⚠ **왜 만드나** (2026-08-17 사진첩 점검):
     판독 열쇠가 실시간DB(`pucards/config/geminiKey`)에 평문으로 있고, 규칙상
     **로그인한 모든 직원이 읽는다.** 꺼내 개인 용도로 써도 요금은 회사에 붙는다.
     이 열쇠는 `AQ.` 로 시작하는 **AI 스튜디오 열쇠**라 구글 API 키 목록에 없고,
     그래서 **웹사이트 제한 같은 자물쇠를 채울 방법이 없다**(2026-08-17 확인).
     브라우저에 두는 한 반드시 샌다 — 서버로 옮기는 것만이 답이다.

   ⚠ **판정 로직은 여기 안 옮긴다.** 어떤 서류인지 가리고(KINDS) 자동 입력 여부를
     정하는(autoOk) 것은 `js/pu-doc-read.js` 에 있고 **사진첩·명함첩·급여데이터함이
     함께 쓴다.** 서버로 옮기면 두 벌이 되어 한쪽만 고쳐진다.
     서버가 맡는 것은 **「열쇠를 들고 구글을 부르는 일」 하나뿐**이다. */
"use strict";

/* 브라우저의 MODELS 와 **같은 순서**여야 한다(js/pu-doc-read.js).
   ⚠ 두 곳에 적히는 것이 마음에 걸리지만, 브라우저는 이제 모델을 안 고르므로
     실제로 쓰이는 것은 여기 하나다. 브라우저 쪽은 옛 길(직접 부르기)이 남아 있는
     동안만 쓰이고, 다 옮기면 지운다. */
const MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite"];

/* 사진 한 장이 대략 1~2MB. 여러 쪽을 한 번에 보내는 계약서까지 생각해 넉넉히 잡되,
   무한정 받지는 않는다 — 받는 만큼 메모리를 쓰고, 그것이 곧 요금이다. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function isTransient(status) {
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

/* 요청이 말이 되는지 본다. 못 알아보면 **부르기 전에** 돌려보낸다 —
   구글을 부르고 나서 실패하면 그만큼이 그대로 요금이다. */
function validate(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "요청이 비었습니다" };
  const parts = body.parts;
  if (!Array.isArray(parts) || !parts.length) return { ok: false, error: "보낼 내용이 없습니다" };

  let imgs = 0;
  for (const p of parts) {
    if (!p || typeof p !== "object") return { ok: false, error: "보낼 내용의 모양이 맞지 않습니다" };
    if (p.inline_data) {
      const d = p.inline_data.data;
      if (typeof d !== "string" || !d) return { ok: false, error: "사진을 읽을 수 없습니다" };
      imgs++;
    } else if (typeof p.text !== "string") {
      return { ok: false, error: "보낼 내용의 모양이 맞지 않습니다" };
    }
  }
  if (!imgs) return { ok: false, error: "사진이 없습니다" };

  const size = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (size > MAX_BODY_BYTES) {
    return { ok: false, error: "사진이 너무 큽니다 — 장수를 나눠 판독해 주세요" };
  }
  return { ok: true, parts: parts };
}

/* 구글에 보낼 몸통. 브라우저가 만들던 것과 **글자 그대로 같아야** 한다 —
   temperature 0 이 빠지면 같은 사진에 다른 답이 나온다. */
function geminiBody(parts) {
  return { contents: [{ parts: parts }], generationConfig: { temperature: 0 } };
}

function modelUrl(model, key) {
  return "https://generativelanguage.googleapis.com/v1beta/models/" +
    model + ":generateContent?key=" + encodeURIComponent(key);
}

/* 밖으로 내보낼 오류 글. ⚠ **열쇠가 섞여 나가면 안 된다** — 구글이 준 설명에
   열쇠가 담겨 오는 경우가 있어(주소를 그대로 되돌려 주는 오류), 통째로 넘기지 않고
   `error.message` 만 꺼낸 뒤 열쇠꼴 글자를 지운다. */
function safeReason(json, key) {
  let why = (json && json.error && json.error.message) || "";
  if (!why) return "";
  if (key) why = why.split(key).join("(열쇠)");
  return why.replace(/AQ\.[A-Za-z0-9_\-]{10,}/g, "(열쇠)")
    .replace(/AIza[A-Za-z0-9_\-]{20,}/g, "(열쇠)");
}

/* 모델을 차례로 시도한다 — 브라우저가 하던 것과 같은 규칙.
   404(모델이 없어짐)·429(그 모델 한도 없음)면 다음 모델로,
   401·403(열쇠 문제)은 모델을 바꿔도 같으므로 곧바로 포기한다. */
async function callGemini(fetchFn, key, parts, waits) {
  const body = JSON.stringify(geminiBody(parts));
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
        break;   // 그물이 끊겼다 — 다음 모델로
      }
      if (r && r.ok) return { ok: true, json: await r.json() };

      const status = (r && r.status) || 0;
      let why = "";
      try { why = safeReason(await r.json(), key); } catch (_) { /* 본문이 없을 수 있다 */ }
      last = { status: status, why: why };

      if (isTransient(status) && attempt < pauses.length) {
        await new Promise(function (res) { setTimeout(res, pauses[attempt]); });
        continue;   // 같은 모델로 다시
      }
      if (status === 401 || status === 403) {
        return { ok: false, status: status, why: why };   // 열쇠 문제 — 곧바로 포기
      }
      break;   // 다음 모델로
    }
  }
  return { ok: false, status: last.status, why: last.why };
}

module.exports = { MODELS, MAX_BODY_BYTES, isTransient, validate, geminiBody, modelUrl, safeReason, callGemini };
