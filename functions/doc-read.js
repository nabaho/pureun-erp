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
     정하는(autoOk) 것은 `js/pu-doc-read.js` 에 있고 **사진첩·기업정보함·급여데이터함이
     함께 쓴다.** 서버로 옮기면 두 벌이 되어 한쪽만 고쳐진다.
     서버가 맡는 것은 **「열쇠를 들고 구글을 부르는 일」 하나뿐**이다. */
"use strict";

/* 브라우저의 MODELS 와 **같은 순서**여야 한다(js/pu-doc-read.js).
   ⚠ 두 곳에 적히는 것이 마음에 걸리지만, 브라우저는 이제 모델을 안 고르므로
     실제로 쓰이는 것은 여기 하나다. 브라우저 쪽은 옛 길(직접 부르기)이 남아 있는
     동안만 쓰이고, 다 옮기면 지운다. */
/* ⚠ 몫은 «모델마다 따로»다 — 그래서 이 목록의 길이가 곧 하루에 읽을 수 있는 양이다.
   2026-09-08 에 하나를 더 세웠다(대표 물음 「판독 한도 어떻게 해결할까」).
   ★ 없는 이름은 «위험이 없다» — 404 가 오면 callGemini 가 다음 모델로 넘어간다.
     그래서 쓸 만한 것을 세워 두는 편이 비워 두는 것보다 낫다.
   ⚠ 이것은 «아껴 쓰기»이지 해결이 아니다. 근본은 열쇠를 유료 등급으로 올리는 것이다
     — 무료 등급이라 free_tier_requests 로 걸린다(dailyQuotaGone 참고). */
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"];

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

  let imgs = 0, chars = 0;
  for (const p of parts) {
    if (!p || typeof p !== "object") return { ok: false, error: "보낼 내용의 모양이 맞지 않습니다" };
    if (p.inline_data) {
      const d = p.inline_data.data;
      if (typeof d !== "string" || !d) return { ok: false, error: "사진을 읽을 수 없습니다" };
      imgs++;
    } else if (typeof p.text !== "string") {
      return { ok: false, error: "보낼 내용의 모양이 맞지 않습니다" };
    } else {
      chars += p.text.trim().length;
    }
  }
  /* ⚠ **글자만 보내는 것도 옳은 길이다** (2026-08-26 고침).
     예전에는 「사진이 한 장도 없으면 돌려보낸다」였다. 2026-08-17 에 이 대리인을
     만들 때는 판독이 늘 그림이었으니 맞는 말이었다. 그런데 2026-08-24 에
     「글자 있는 PDF 는 글자로 읽는다」가 들어오면서(사진첩 readDocText),
     **글자만 담은 요청**이 생겼다 — 그것을 여기서 「사진이 없습니다」로 되돌려보내
     그 길이 한 번도 성공한 적이 없었다(대표 보고 2026-08-26: 사업자등록증명 PDF
     가 계속 판독 실패. 운영 데이터에서 글자로 읽는 사진은 그 한 장뿐이었고,
     그 한 장이 바로 이 오류였다).
     ⚠ 그림도 글자도 없으면 그대로 돌려보낸다 — 부르는 만큼이 요금이다. */
  if (!imgs && !chars) return { ok: false, error: "보낼 내용이 없습니다" };

  const size = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (size > MAX_BODY_BYTES) {
    return { ok: false, error: imgs
      ? "사진이 너무 큽니다 — 장수를 나눠 판독해 주세요"
      : "글자가 너무 많습니다 — 나눠서 판독해 주세요" };
  }
  return { ok: true, parts: parts, cfg: body.generationConfig, app: appOf(body.app) };
}

/* ══ ⑤ 어느 앱이 몫을 썼나 (대표 물음 2026-09-08 「판독 한도 어떻게 해결할까」) ══
   여태 세는 곳이 «아예 없어» 「사진첩이 다 썼나 경력관리가 다 썼나」를 알 수 없었다.
   열쇠 하나를 넷이 나눠 쓰는데, 어디가 태우는지 모르면 어디를 손볼지도 모른다.

   ⚠ 부르는 쪽이 «스스로 밝히는» 이름이다 — 그러니 아무 글자나 올 수 있다고 보고
     아는 이름만 받는다. 모르면 'other' 다. 여기 걸러 두지 않으면 실시간DB 열쇠에
     못 쓰는 글자(. # $ / [ ])가 들어가 그 자리가 통째로 안 써진다.
   ⚠ 이름만 센다 — 사진·글·사람 이름은 «한 글자도» 안 담는다. 숫자뿐이다. */
const APPS = ["photos", "cards", "kcareer", "payroll", "rules", "fund", "erp"];
function appOf(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return APPS.indexOf(s) >= 0 ? s : "other";
}

/* 오늘 날짜 — «한국 날짜»여야 한다. UTC 로 세면 아침 9시 전이 어제로 들어가고,
   구글의 하루 몫은 그것과 또 다르게 끊긴다(billing-spike 검사가 같은 자리를 지킨다). */
function ymdKST(now) {
  const t = (now == null ? Date.now() : now) + 9 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/* 셀 자리 — 앱별·합계. 세 가지를 «갈라» 센다:
     n       Gemini 판독을 몇 번 불렀나
     quota   그 가운데 하루 몫에 막힌 수
     vision  Google Vision 으로 «글자만» 뽑은 수 (2026-09-08)
   ⚠ n 과 quota 를 합치면 「많이 썼다」와 「막혔다」가 섞여, 아껴 쓴 날과 걸린 날이
     같아 보인다.
   ⚠ vision 을 n 에 합치면 «몫이 다른 곳»이 한 숫자에 섞인다 — Gemini 는 하루 몫이고
     Vision 은 «달마다» 1,000장이다. 합치면 어느 쪽이 남았는지 알 수가 없다. */
const TALLY_KINDS = ["n", "quota", "vision"];
function tallyPaths(app, ymd, kind) {
  const k = TALLY_KINDS.indexOf(kind) >= 0 ? kind : "n";
  const d = ymd || ymdKST();
  return ["ai_read_tally/" + d + "/" + appOf(app) + "/" + k,
          "ai_read_tally/" + d + "/_all/" + k];
}

/* 부르는 쪽이 정할 수 있는 값 — **여기 적힌 것만** 받는다.
   ⚠ 통째로 넘기면 부르는 쪽이 마음대로 값을 키울 수 있고 그것이 곧 요금이다.
     특히 maxOutputTokens 는 낸 만큼 돈이라 위를 막는다. */
const MAX_OUTPUT_TOKENS = 8192;

/* 구글에 보낼 몸통.
   ⚠ temperature 는 **0 이 기본**이다 — 빠지면 같은 사진에 다른 답이 나온다.
   ⚠ maxOutputTokens 는 부르는 쪽이 정할 수 있다 — 경력관리가 1500 을 쓴다.
     안 받으면 긴 문서에서 답이 잘린다. */
function geminiBody(parts, cfg) {
  const g = { temperature: 0 };
  const c = (cfg && typeof cfg === "object") ? cfg : {};
  if (typeof c.temperature === "number" && c.temperature >= 0 && c.temperature <= 2) {
    g.temperature = c.temperature;
  }
  const mot = Number(c.maxOutputTokens);
  if (Number.isFinite(mot) && mot > 0) g.maxOutputTokens = Math.min(Math.round(mot), MAX_OUTPUT_TOKENS);
  return { contents: [{ parts: parts }], generationConfig: g };
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

/* 이 429 가 「하루 몫을 다 썼다」인가 — 그렇다면 기다려도 같은 답이다.
   ⚠ 구글이 준 **설명글**로 가린다. 코드가 따로 오지 않아 이것밖에 없다.
   ⚠ 확실하지 않으면 **기다리는 쪽**으로 둔다 — 분당 한도는 정말 기다리면 풀리므로
     잘못 가려도 한 번 더 부르는 것으로 끝난다. 반대로 하루 몫을 「기다리면 된다」로
     읽으면 한 장마다 여섯 번을 두드린다. */
function dailyQuotaGone(why) {
  return /free_tier_requests|PerDay|per day|RequestsPerDay/i.test(String(why || ""));
}

/* 모델을 차례로 시도한다 — 브라우저가 하던 것과 같은 규칙.
   404(모델이 없어짐)·429(그 모델 한도 없음)면 다음 모델로,
   401·403(열쇠 문제)은 모델을 바꿔도 같으므로 곧바로 포기한다. */
async function callGemini(fetchFn, key, parts, waits, cfg) {
  const body = JSON.stringify(geminiBody(parts, cfg));
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

      /* ⚠ **하루 몫이 없는 429 는 기다려도 같다** (대표 지시 2026-09-07).
         429 에는 두 가지가 섞여 있다 — 「분당 너무 빨리 불렀다」(조금 기다리면 된다)와
         「하루 몫을 다 썼다」(자정까지 같은 답이다). 여태 둘을 똑같이 세 번씩 다시 불러
         한 장마다 **모델 둘 × 세 번 = 여섯 번**을 두드렸다. 2026-09-07 에 23장이
         한도에 걸렸으니 그 뒤로만 백 번이 넘는다.
         하루 몫이면 다시 부르지 않고 **다음 모델로** 넘어간다(모델마다 몫이 따로다). */
      if (isTransient(status) && attempt < pauses.length &&
          !(status === 429 && dailyQuotaGone(why))) {
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

module.exports = {
  MODELS, MAX_BODY_BYTES, MAX_OUTPUT_TOKENS,
  isTransient, validate, geminiBody, modelUrl, safeReason, callGemini, dailyQuotaGone,
  APPS, appOf, ymdKST, tallyPaths, TALLY_KINDS
};
