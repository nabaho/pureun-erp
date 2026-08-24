/* 내 서명 — 명함 사진을 한 번 골라 두면 보낼 때마다 따라간다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「명함사진은 본인것 찾아서 선택하고 한번 저장하면
   계속 보낼수 있게 만들어 줄수 있나?」

   ■ 왜 «표시(cid)»만 본문에 두는가
     본문에 그림을 통째로 담으면(data: base64) 예약·묶음 메일이 실시간DB 에
     100KB 짜리를 며칠씩 물고 있는다 — 2026-08-23 에 줄인 비용이 되돌아온다.
     표시만 두면
       · 본문이 가볍다 (표시는 30글자쯤)
       · 서명을 바꾸면 «걸어 둔 예약 메일도» 새 서명으로 나간다
       · 그림은 명함의 썸네일을 그대로 쓴다 — 새로 담는 자리가 없다

   ■ 절대 하지 않는 것
     · 표시가 없는 메일은 한 글자도 안 건드린다
     · 그림을 못 찾으면 «표시를 지우고» 보낸다 — 깨진 그림 자리가 나가면 안 된다
     · 서명 하나 때문에 메일이 안 나가는 일은 없다 (부르는 쪽이 try 로 감싼다) */
'use strict';

/* 본문의 표시와 첨부를 잇는 이름. 바꾸면 «이미 걸어 둔 예약 메일»의 표시와 어긋나
   그림이 사라진다 — 바꿀 일이 있으면 옛 이름도 함께 알아보게 두어야 한다. */
const SIGN_CID = 'pusign';

/* 편지마다 따라가는 그림이라 무게가 쌓인다. 명함 썸네일은 보통 20~60KB 다. */
const SIGN_MAX_BYTES = 400 * 1024;

/* 실시간DB 열쇠에 못 쓰는 글자: . # $ / [ ]
   메일 주소에는 점이 늘 있으니 반드시 바꿔야 한다. 대소문자는 같은 사람으로 본다. */
function signKey(email) {
  const s = String(email == null ? '' : email).trim().toLowerCase();
  if (!s) return '';
  return s.replace(/[.#$/[\]]/g, '_');
}

/* 우리 표시가 있나. 따옴표 종류·띄어쓰기가 달라도 알아본다 —
   편집기가 태그를 다시 쓰면서 모양을 바꿀 수 있다. */
function signMarkRe() {
  return new RegExp('<\\s*img\\b[^>]*src\\s*=\\s*["\']?cid:' + SIGN_CID + '["\'\\s>][^>]*>', 'gi');
}
function hasSignMark(html) {
  return signMarkRe().test(String(html == null ? '' : html));
}

/* 표시를 지운다. 그림을 못 찾았을 때 쓴다 — 빈 <img> 를 남기면 받는 화면에
   깨진 그림 자리(❌)가 뜬다. 우리 표시만 지우고 남의 그림 태그는 건드리지 않는다. */
function stripSignMark(html) {
  return String(html == null ? '' : html).replace(signMarkRe(), '');
}

/* 썸네일(dataURL) 을 인라인 첨부 한 개로. cid 가 본문의 표시와 이어져야
   «첨부 파일»이 아니라 «본문 속 그림»으로 보인다. */
function signAttachment(dataUrl) {
  const s = String(dataUrl == null ? '' : dataUrl);
  const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;                                  // 그림이 아니면 안 붙인다
  const kind = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, '');
  if (!b64) return null;
  const pad = (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  const bytes = Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
  if (!bytes || bytes > SIGN_MAX_BYTES) return null;     // 너무 크면 안 붙인다
  return {
    filename: '명함.' + (kind === 'jpeg' ? 'jpg' : kind),
    content: b64,
    encoding: 'base64',
    cid: SIGN_CID,
    contentDisposition: 'inline',
    bytes: bytes
  };
}

module.exports = {
  SIGN_CID, SIGN_MAX_BYTES,
  signKey, hasSignMark, stripSignMark, signAttachment
};
