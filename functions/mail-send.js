/* 자료 메일 보내기 — 순수 로직
   ═══════════════════════════════════════════════════════════════════════════
   보내는 일 자체(SMTP)는 index.js 가 한다. 여기는 **값만** 다룬다 —
   그래야 실제로 메일을 쏘지 않고도 검사할 수 있다.

   ⚠ 이 층이 막아야 하는 것 네 가지
   1. 아무 데나 보내기 — 받는 주소를 검사하고 개수를 막는다. 로그인한 직원만
      부를 수 있지만, 그래도 우리 계정이 공개 발송기가 되면 안 된다.
   2. 너무 큰 첨부 — 메일 서버가 통째로 거절하면 '보냈다'고 나오고 실제로는
      아무 데도 안 간다. 보내기 전에 우리가 먼저 막는다.
   3. 헤더 끼워넣기 — 제목에 줄바꿈이 들어가면 받는사람·참조를 몰래 더할 수 있다.
   4. 빈 껍데기 — 받는 주소나 제목이 없으면 아예 부르지 않는다. */
'use strict';

/* 다음메일 기준. 25MB 라고 적혀 있지만 base64 로 부풀면 더 커지므로 여유를 둔다. */
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const MAX_TO = 5;
const MAX_SUBJECT = 200;

/* 주소 하나가 쓸 만한가. 완벽한 검사가 아니라 '눈에 띄는 잘못'을 거른다 —
   진짜 판정은 메일 서버가 한다. */
function isEmail(v) {
  const s = String(v == null ? '' : v).trim();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(s);
}

/* 쉼표·세미콜론으로 여러 개 올 수 있다. 다듬어 중복을 없애고 개수를 막는다. */
function parseRecipients(v) {
  const raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;]/);
  const out = [];
  raw.forEach(function (x) {
    const s = String(x == null ? '' : x).trim();
    if (!s || !isEmail(s) || out.indexOf(s) >= 0) return;
    out.push(s);
  });
  return out;
}

/* 제목의 줄바꿈을 없앤다 — 남겨 두면 그 뒤에 Bcc: 한 줄을 붙여
   우리 몰래 다른 곳으로도 보낼 수 있다(헤더 끼워넣기). */
function cleanSubject(v) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_SUBJECT);
}

/* base64 dataURL 이 실제로 몇 바이트인가. 문자열 길이로 재면 3분의 1을 더 크게 본다. */
function dataUrlBytes(dataUrl) {
  const s = String(dataUrl == null ? '' : dataUrl);
  const i = s.indexOf(',');
  if (i < 0) return 0;
  const b64 = s.slice(i + 1);
  const pad = (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

/* 자료 하나를 첨부 한 개로. 파일 내용이 없으면 null — 부르는 쪽이 걸러낸다.
   ⚠ 이름이 없으면 '자료.dat' 로 둔다. 이름 없는 첨부는 받는 쪽에서 열리지 않는다. */
function toAttachment(meta, dataUrl) {
  const url = String(dataUrl == null ? '' : dataUrl);
  const i = url.indexOf(',');
  if (i < 0 || !url.slice(i + 1)) return null;
  const m = (meta || {});
  const name = String(m.fileName || m.name || '자료.dat').replace(/[\\/:*?"<>|\r\n]/g, '_');
  return {
    filename: name,
    content: url.slice(i + 1),
    encoding: 'base64',
    bytes: dataUrlBytes(url)
  };
}

/* 보내도 되는 요청인가. 되면 {ok:true, ...정리된 값}, 아니면 {ok:false, error}.
   ⚠ 첨부 크기는 **합계**로 본다. 한 개씩만 보면 8MB 세 개가 통과한다. */
function validateSend(o) {
  const p = o || {};
  const to = parseRecipients(p.to);
  if (!to.length) return { ok: false, error: '받는 사람 주소가 없거나 형식이 맞지 않습니다.' };
  if (to.length > MAX_TO) return { ok: false, error: '받는 사람은 한 번에 ' + MAX_TO + '명까지입니다.' };

  const cc = parseRecipients(p.cc).filter(function (a) { return to.indexOf(a) < 0; });
  if (cc.length > MAX_TO) return { ok: false, error: '참조는 한 번에 ' + MAX_TO + '명까지입니다.' };

  /* 숨은참조 — 받는사람·참조에 이미 있으면 뺀다. 그대로 두면 같은 사람에게 두 통 간다. */
  const bcc = parseRecipients(p.bcc).filter(function (a) {
    return to.indexOf(a) < 0 && cc.indexOf(a) < 0;
  });
  if (bcc.length > MAX_TO) return { ok: false, error: '숨은참조는 한 번에 ' + MAX_TO + '명까지입니다.' };

  const subject = cleanSubject(p.subject);
  if (!subject) return { ok: false, error: '제목이 비어 있습니다.' };

  const body = String(p.body == null ? '' : p.body);
  if (!body.trim()) return { ok: false, error: '본문이 비어 있습니다.' };

  const files = (p.attachments || []).filter(Boolean);
  let total = 0;
  files.forEach(function (f) { total += (f.bytes || 0); });
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: '첨부가 너무 큽니다 (' + (total / 1024 / 1024).toFixed(1) + 'MB). '
           + (MAX_TOTAL_BYTES / 1024 / 1024) + 'MB 아래로 줄여 주세요.'
    };
  }
  return { ok: true, to: to, cc: cc, bcc: bcc, subject: subject, body: body, attachments: files, bytes: total };
}

/* 보낸 기록 — 화면이 아니라 **서버가** 남긴다. 실제로 나간 것만 남아야
   '보냈다는데 안 왔다'를 가릴 수 있다. 명함첩 화면이 쓰는 모양과 같아야 한다. */
function sentLogRec(o) {
  const p = o || {};
  return {
    at: p.at || 0,
    by: String(p.by || ''),
    to: (p.to || []).join(', '),
    names: (p.names || []).map(function (v) { return String(v || ''); }).filter(Boolean),
    set: String(p.set || ''),
    auto: true                 /* 자동 발송으로 나갔다는 표시 — 손으로 보낸 것과 구분 */
  };
}

module.exports = {
  MAX_TOTAL_BYTES, MAX_TO, MAX_SUBJECT,
  isEmail, parseRecipients, cleanSubject, dataUrlBytes,
  toAttachment, validateSend, sentLogRec
};
