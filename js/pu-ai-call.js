/* AI 판독 호출기 — 브라우저는 열쇠를 모른다.
   서버(readDoc)가 열쇠를 들고 구글을 부르고, 여기서는 사진과 프롬프트만 보낸다.

   ⚠ **왜 만드나** (2026-08-17):
     판독 열쇠가 실시간DB 에 평문으로 있고 규칙상 **로그인한 모든 직원이 읽는다.**
     게다가 `AQ.` 로 시작하는 AI 스튜디오 열쇠라 구글 API 키 목록에 없어
     **웹사이트 제한 같은 자물쇠를 채울 방법도 없다**(확인 완료).
     브라우저에 두는 한 반드시 샌다.

   ⚠ **왜 파일을 따로 만드나**
     사진첩·급여데이터함은 `js/pu-doc-read.js`(판정까지 하는 큰 층)를 쓰지만,
     기업정보함·경력관리는 **제 프롬프트와 제 결과 다루기**를 갖고 있다.
     그 큰 층을 통째로 싣게 하면 프롬프트가 두 벌이 되고 한쪽만 고쳐진다.
     그래서 「서버를 부르는 일」만 떼어 낸 작은 파일을 둘이 나눠 쓴다.

   ⚠ 주소는 **여기 한 곳**에만 적는다. 앱마다 적으면 한쪽만 고쳐진다. */
(function (global) {
  'use strict';

  var URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/readDoc';

  /* 로그인 증명을 얻는다. 없으면 빈 문자열 —
     ⚠ 그때는 **부르지 않는다.** 토큰 없이 부르면 서버가 401 로 막아
       「판독이 안 된다」로만 보이고 원인을 못 짚는다. */
  function token(auth) {
    try {
      var u = auth && auth.currentUser;
      if (!u) return Promise.resolve('');
      return u.getIdToken().catch(function () { return ''; });
    } catch (e) { return Promise.resolve(''); }
  }

  /* 서버에 판독을 맡긴다.
       parts : [{ inline_data:{mime_type,data} } | { text }]  — 구글이 받는 그 모양
       opts  : { auth, fetch, generationConfig }
     돌려주는 것은 **구글 응답 그대로**다 — 부르는 쪽이 제 방식으로 뜯어 쓴다.
     ⚠ 실패하면 status 를 담아 던진다. 429(잠시 바쁨)·403(열쇠 문제)에 따라
       부르는 쪽의 대응이 갈리므로 숫자를 뭉개면 안 된다. */
  function ask(parts, opts) {
    opts = opts || {};
    var f = opts.fetch || (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (!f) return Promise.reject(new Error('이 브라우저에서는 판독을 쓸 수 없습니다'));
    if (!parts || !parts.length) return Promise.reject(new Error('보낼 내용이 없습니다'));

    return token(opts.auth).then(function (t) {
      if (!t) throw new Error('로그인을 확인해 주세요');
      var body = { parts: parts };
      if (opts.generationConfig) body.generationConfig = opts.generationConfig;
      return f(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify(body)
      });
    }).then(function (r) {
      return (r && r.json ? r.json() : Promise.resolve(null)).catch(function () { return null; })
        .then(function (j) {
          if (r && r.ok && j && j.ok) return j.reply;
          var status = (j && j.status) || (r && r.status) || 0;
          var e = new Error((j && j.error) || ('AI가 응답하지 않습니다 (오류 ' + status + ')'));
          e.status = status;
          throw e;
        });
    });
  }

  /* 구글 응답에서 글자만 꺼낸다 — ```json 껍데기는 벗긴다.
     세 앱이 저마다 똑같은 줄을 갖고 있어 여기로 모은다. */
  function textOf(reply) {
    var parts = (reply && reply.candidates && reply.candidates[0]
      && reply.candidates[0].content && reply.candidates[0].content.parts) || [];
    return parts.map(function (p) { return (p && p.text) || ''; }).join('')
      .replace(/```json|```/g, '').trim();
  }

  global.PuAiCall = { URL: URL, ask: ask, textOf: textOf };
})(typeof window !== 'undefined' ? window : globalThis);
