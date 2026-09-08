'use strict';
/* 글자만 뽑는 판독 대리인 — Google Cloud Vision (2026-09-08)
 *
 * ★★ 왜 만들었나 (대표 물음 「OCR 을 무료로 쓸 수 있는 곳이 더 있나」) —
 *   Vision 의 무료 몫은 «달마다 1,000장»이고 Gemini 의 하루 몫과 «따로»다.
 *   그래서 Gemini 가 하루 몫을 다 쓴 날에도 Vision 은 살아 있다.
 *   `pu-erp.html` 에 부르는 코드가 «이미» 있었는데 열쇠가 없어 한 번도 안 돌았다.
 *
 * ★★★ 왜 서버가 들고 있나 — 그 열쇠를 브라우저에 두면 «누구나 복사할 수 있다».
 *   실제로 `pu-erp.html` 의 설정 화면은 열쇠를 «공용 DB(data/vision_api_key)»에
 *   담게 되어 있었다 — 그 자리는 재직 직원 누구나 읽는다(rules-data-other-open).
 *   enter.html 이 스스로 「유료 키는 여기 두지 않습니다」라고 적어 두고도
 *   그 칸이 남아 있었다. 2026-09-08 에 그 길을 닫고 이 대리인으로 옮겼다.
 *   ⚠ 열쇠를 브라우저로 «돌려주지 않는다». 여기서 쓰고 여기서 버린다.
 *
 * ★ Vision 은 «글자만» 준다 — 「이 열 자리가 사업자번호다」는 우리 파서
 *   (parseBizLicense 등)가 한다. 칸을 알아서 채우는 것은 Gemini 쪽 일이다.
 *   그래서 이것은 Gemini 를 «대신»하는 것이 아니라 «글자 뽑기»만 대신한다.
 *
 * ⚠ 여기에 화면도 Firebase 도 없다 — 그래야 검사가 돈다(doc-read.js 와 같은 얼개).
 */

/* 한 번에 받을 수 있는 크기 — 사진 한 장이 대략 1~2MB.
   ⚠ 무한정 받지 않는다. 받는 만큼 메모리를 쓰고 그것이 곧 요금이다. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/* Vision 은 한 번에 여러 장을 받는다. 그래도 상한을 둔다 —
   ⚠ 몫은 «장 수»로 센다(요청 수가 아니다). 열 장을 한 번에 보내면 몫도 열 장이다.
     그래서 「한 번에 많이 보내면 아낀다」가 «아니다». 사람이 그렇게 오해하지 않게
     상한을 낮게 둔다. */
const MAX_IMAGES = 10;

function isTransient(status) {
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

/* 열쇠가 오류 글에 섞여 나오는 것을 막는다 — 그대로 화면에 찍히면 그것이 유출이다.
   ⚠ doc-read.js 의 safeReason 과 같은 규칙이다. 한쪽만 고치면 다른 쪽으로 샌다. */
function safeReason(json, key) {
  let s = '';
  try { s = String((json && json.error && json.error.message) || ''); } catch (_) { s = ''; }
  if (key) s = s.split(key).join('(열쇠)');
  return s.replace(/AIza[A-Za-z0-9_\-]{20,}/g, '(열쇠)');
}

/* 받은 것을 «걸러서» 돌려준다. 여기서 막지 않으면 부르는 쪽이 마음대로 키운다. */
function validate(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: '요청이 비었습니다' };
  const raw = body.images;
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: '보낼 사진이 없습니다' };
  if (raw.length > MAX_IMAGES) {
    return { ok: false, error: '한 번에 ' + MAX_IMAGES + '장까지입니다 — 나눠 보내 주세요' };
  }
  const images = [];
  for (const one of raw) {
    if (typeof one !== 'string' || !one) return { ok: false, error: '사진을 읽을 수 없습니다' };
    /* dataURL 로 와도 받는다 — 부르는 쪽마다 다르게 자르면 한 곳은 반드시 틀린다 */
    const pure = (one.indexOf(',') >= 0 && /^data:/i.test(one)) ? one.slice(one.indexOf(',') + 1) : one;
    if (!pure) return { ok: false, error: '사진을 읽을 수 없습니다' };
    images.push(pure);
  }
  const size = Buffer.byteLength(JSON.stringify(body), 'utf8');
  if (size > MAX_BODY_BYTES) {
    return { ok: false, error: '사진이 너무 큽니다 — 장수를 나눠 보내 주세요' };
  }
  return { ok: true, images: images, app: body.app };
}

/* 보낼 몸통. DOCUMENT_TEXT_DETECTION 은 «서류용»이다 —
   ⚠ TEXT_DETECTION 으로 바꾸지 말 것. 그것은 간판·표지판용이라 서류에서 줄이 뒤섞인다. */
function visionBody(images) {
  return {
    requests: images.map(function (content) {
      return {
        image: { content: content },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['ko', 'en'] }
      };
    })
  };
}

/* ★★ 열쇠 없이 부르는 길이 «본길»이다 (2026-09-08).
     이 코드는 클라우드 함수 «안»에서 도는데, 그 서버에는 «자기 신분증»이 있다
     (App Engine 기본 서비스 계정). 그 신분증으로 부르면 —
       · 만들 열쇠가 없다      → 만들다 새거나 잃어버릴 일이 없다
       · 넣을 열쇠가 없다      → 대표님이 하실 일이 「API 켜기」 한 번으로 줄어든다
       · 새어 나갈 열쇠가 없다 → 브라우저는 물론 금고에도 둘 것이 없다
     ⚠ 그래도 열쇠 길을 «남겨 둔다» — 신분증 길이 막히는 자리가 있을 수 있고,
       그때 통째로 멎으면 안 된다. 열쇠가 있으면 그것을 먼저 쓴다. */
function visionUrl(key) {
  const base = 'https://vision.googleapis.com/v1/images:annotate';
  return key ? (base + '?key=' + encodeURIComponent(key)) : base;
}

/* 서버가 «자기 신분증»을 얻는 자리 — 구글이 서버 «안»에만 열어 둔다.
   ⚠ 바깥에서는 부를 수 없다(그것이 이 길이 안전한 까닭이다).
   ⚠ 라이브러리를 새로 안 쓴다 — 딸린 것이 늘면 배포가 무거워지고,
     간접으로 딸려 온 것(google-auth-library)에 기대면 어느 날 조용히 사라진다. */
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

async function fetchSaToken(fetchFn) {
  const r = await fetchFn(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r || !r.ok) throw new Error('서버 신분증을 얻지 못했습니다 (HTTP ' + ((r && r.status) || 0) + ')');
  const j = await r.json();
  const t = String((j && j.access_token) || '');
  if (!t) throw new Error('서버 신분증이 비어 있습니다');
  return t;
}

/* 「API 를 아직 안 켰다」인가 — 그렇다면 몇 번을 불러도 같은 답이고,
   사람이 콘솔에서 «한 번 누르면» 끝이다. 그 말을 그대로 해 줘야 한다.
   ⚠ 이것을 「고장」으로 뭉개면 대표님은 열쇠·권한·코드를 차례로 뒤지게 된다. */
function apiNotEnabled(why) {
  return /has not been used in project|is disabled|SERVICE_DISABLED|accessNotConfigured/i
    .test(String(why || ''));
}
const ENABLE_URL =
  'https://console.cloud.google.com/apis/library/vision.googleapis.com?project=pureun-erp';

/* 답에서 «글»만 꺼낸다. 여러 장이면 쪽 사이를 줄바꿈으로 잇는다.
   ⚠ 장 하나가 빈 글이어도 «자리를 지운다». 빈 쪽을 남기면 쪽 번호가 어긋나
     「몇 쪽에서 나온 글인가」를 못 짚는다. */
function textOf(json) {
  const rs = (json && json.responses) || [];
  const 쪽 = rs.map(function (r) {
    if (r && r.error) return '';
    return String((r && r.fullTextAnnotation && r.fullTextAnnotation.text) || '');
  }).filter(function (t) { return t.trim(); });
  return { text: 쪽.join('\n'), pages: 쪽.length, total: rs.length };
}

/* 한 번 부른다. 잠깐 바쁜 것(429·5xx)은 조금 기다렸다 다시 —
   ⚠ Vision 의 몫은 «달마다»라 하루 몫처럼 「자정까지 같은 답」이 아니다.
     그래서 doc-read 처럼 「하루 몫 가려내기」를 두지 않는다. 대신 상태를 그대로 올린다. */
/* auth — 둘 중 하나다:
     { token: '…' }  서버 «자기 신분증»으로 부른다 (본길 · 열쇠가 없다)
     { key:   '…' }  열쇠로 부른다 (남겨 둔 길)
   ⚠ 옛 모양(글자 하나만 넘기던 것)도 받는다 — 부르는 곳이 하나라 지금은 안 쓰지만,
     검사와 다음 사람이 헷갈리지 않게 «둘 다» 받는다. */
function authOf(auth) {
  if (auth && typeof auth === 'object') {
    if (auth.token) return { token: String(auth.token), key: '' };
    if (auth.key) return { token: '', key: String(auth.key) };
    return { token: '', key: '' };
  }
  return { token: '', key: String(auth || '') };
}

async function callVision(fetchFn, auth, images, waits) {
  const a = authOf(auth);
  const key = a.key;
  const body = JSON.stringify(visionBody(images));
  const headers = { 'Content-Type': 'application/json' };
  /* ⚠ 신분증은 «머리글»로 간다 — 주소에 붙이면 기록·로그에 그대로 남는다 */
  if (a.token) headers.Authorization = 'Bearer ' + a.token;
  const init = { method: 'POST', headers: headers, body: body };
  const pauses = waits || [2000, 5000];
  let last = { status: 0, why: '' };
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetchFn(visionUrl(key), init);
    } catch (e) {
      last = { status: 0, why: String((e && e.message) || e) };
      break;
    }
    if (r && r.ok) {
      const json = await r.json();
      /* ⚠ 200 인데 안에 오류가 든 경우가 있다 — 그때 「읽었다」로 넘기면
           빈 글이 조용히 담긴다. 장 «전부»가 오류면 실패로 본다. */
      const t = textOf(json);
      if (!t.pages && t.total) {
        return { ok: false, status: 502, why: safeReason(json.responses && json.responses[0], key)
          || '사진에서 글자를 못 찾았습니다' };
      }
      return { ok: true, json: json, text: t.text, pages: t.pages };
    }
    const status = (r && r.status) || 0;
    let why = '';
    try { why = safeReason(await r.json(), key); } catch (_) { /* 본문이 없을 수 있다 */ }
    last = { status: status, why: why };
    if (isTransient(status) && attempt < pauses.length) {
      await new Promise(function (res) { setTimeout(res, pauses[attempt]); });
      continue;
    }
    break;
  }
  /* ★ 「API 를 안 켰다」면 «무엇을 누르면 되는지»까지 말해 준다 —
       그 한 줄이 없으면 열쇠·권한·코드를 차례로 뒤지게 된다. */
  if (apiNotEnabled(last.why)) {
    return { ok: false, status: last.status, notEnabled: true,
      why: 'Google Vision API 가 아직 켜져 있지 않습니다 — 콘솔에서 한 번 켜 주시면 됩니다:\n'
        + ENABLE_URL };
  }
  return { ok: false, status: last.status, why: last.why };
}

module.exports = {
  MAX_BODY_BYTES, MAX_IMAGES,
  isTransient, safeReason, validate, visionBody, visionUrl, textOf, callVision,
  fetchSaToken, authOf, apiNotEnabled, ENABLE_URL, METADATA_TOKEN_URL
};
