/* 보낸 사본을 다음메일 「보낸메일함」에도 남기는 층
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-23: "다음메일의 보낸함에는 안보이는데 이건 왜 이런거냐?"

   까닭은 오류가 아니라 **안 하고 있던 일**이었다. 메일에는 길이 둘이다.
     · 보내는 길(SMTP)  — 「이 편지를 상대에게 전해 줘」. 우체통에 넣는 것.
     · 보관하는 길(IMAP) — 「내 보낸함에 사본 한 장 넣어 줘」. 서류철에 복사.
   웹메일·아웃룩은 보낼 때 둘 다 한다. 우리는 첫째만 했다. 그래서 상대는
   정상으로 받았는데 다음메일 보낸함에는 한 통도 안 남았다.

   ⚠ 여기는 «배달이 이미 끝난 뒤»에만 불린다. 여기서 무슨 일이 나도 배달 결과를
     바꾸지 않는다 — 실패를 되돌려 주면 대표가 「안 나갔다」고 오해해 같은 메일을
     두 번 보낸다. 그래서 이 파일의 모든 길은 **던지지 않고 값으로 알려 준다.**

   ⚠ 무거운 짐(imapflow·nodemailer)은 맨 위에서 부르지 않는다. 검사 기기에는
     그 짐이 없어서, 맨 위에서 부르면 파일 자체를 못 읽는다. */
'use strict';

const IMAP_HOST = 'imap.daum.net';
const IMAP_PORT = 993;

/* 한 번에 넣는 통 수 상한. 한명씩 발송이면 통 수만큼 올려야 하는데, 다 올리면
   응답이 늦어진다. 늦어지면 **배달은 끝났는데 화면은 「안 나갔다」**가 된다. */
const ARCHIVE_MAX = 20;

/* 첨부가 이보다 크면 사본을 건너뛴다. 18MB 첨부는 base64 로 24MB 가 되고, 그걸
   IMAP 으로 다시 올리는 동안 함수 시간을 넘긴다. 배달은 이미 끝난 뒤라 메일은
   나가지만, 응답이 끊기면 화면에는 실패로 보인다. 사본보다 그게 더 나쁘다. */
const ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;

/* 기다리는 시간 상한 — 안 박으면 대답 없는 서버에 하염없이 매달린다. */
const ARCHIVE_TIMEOUT_MS = 20000;

/* 절대 넣지 않을 폴더. 임시보관함에 넣으면 「안 보낸 편지」로 뜨고, 받은메일함에
   넣으면 내가 보낸 것이 받은 메일처럼 쌓이고, 휴지통에 넣으면 그대로 버려진다. */
const SENT_NEVER = /임시|초안|보관|휴지통|스팸|정크|받은|Draft|Trash|Junk|Spam|Deleted|Archive|INBOX/i;

/* 폴더 이름 — 서버가 name 을 안 주면 path 의 마지막 토막을 쓴다
   (다음메일은 「INBOX.Sent」처럼 점으로 이어 주는 계정도 있다). */
function boxName(b) {
  if (!b) return '';
  const p = String(b.path || '');
  return String(b.name || p.split(/[./]/).pop() || '');
}

/* 이 이름이 보낸함으로 보이나 — 「보낸」이 들어가거나 Sent 로 시작하면 그렇다.
   못 넣을 폴더 규칙이 **먼저** 이긴다(임시보관함에도 「보관」이 들어간다). */
function looksSent(n) {
  const s = String(n || '');
  if (!s) return false;
  if (SENT_NEVER.test(s)) return false;
  return s.indexOf('보낸') >= 0 || /^sent/i.test(s);
}

/* 서버가 알려 준 표시(RFC 6154)를 이름보다 믿는다 — 계정마다 이름이 다르다.
   imapflow 는 specialUse 에 넣어 주는데, flags 로 오는 서버도 있어 둘 다 본다. */
function isSentFlagged(b) {
  if (!b) return false;
  if (String(b.specialUse || '') === '\\Sent') return true;
  const f = b.flags;
  if (f && typeof f.has === 'function') return f.has('\\Sent');
  if (Array.isArray(f)) return f.indexOf('\\Sent') >= 0;
  return false;
}

/* 어느 폴더에 넣을까 — 순수 로직(검사 대상).
   못 찾으면 빈 값. **아무 폴더나 고르지 않는다** — 엉뚱한 곳에 넣는 것이
   안 넣는 것보다 나쁘다. */
function pickSentBox(list) {
  const rows = Array.isArray(list) ? list : [];
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    if (b && b.path && isSentFlagged(b)) return String(b.path);
  }
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    if (b && b.path && looksSent(boxName(b))) return String(b.path);
  }
  return '';
}

/* 편지 한 통을 실제 바이트로 굽는다 — IMAP 은 완성된 편지만 받는다.
   보내기에 쓴 것과 **같은 재료**로 굽는다(제목·본문·첨부가 어긋나면 사본이 거짓이 된다). */
async function buildRaw(mail) {
  const MailComposer = require('nodemailer/lib/mail-composer');
  return await new MailComposer(mail).compile().build();
}

/* 실제 IMAP 접속. 아이디 후보를 차례로 해 본다 — 보내기와 같은 차례를 쓴다
   (다음메일은 계정마다 「370-6」이 되기도, 주소 전체가 되기도 한다). */
async function openImap(opt) {
  const ImapFlow = require('imapflow').ImapFlow;
  const ids = (Array.isArray(opt.loginIds) && opt.loginIds.length)
    ? opt.loginIds : [String(opt.user || '')];
  let last = null;
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i] || '');
    if (!id) continue;
    const c = new ImapFlow({
      host: IMAP_HOST, port: IMAP_PORT, secure: true,
      auth: { user: id, pass: opt.pass }, logger: false,
      socketTimeout: ARCHIVE_TIMEOUT_MS,
    });
    try { await c.connect(); return c; } catch (e) {
      last = e;
      try { await c.logout(); } catch (_) { /* 이미 끊겼다 */ }
    }
  }
  throw last || new Error('접속할 아이디가 없습니다');
}

/* 사본 넣기. **절대 던지지 않는다** — 무슨 일이 나도 값으로 알려 준다.
   돌려주는 것: { ok, put, dropped, box, why } */
async function archiveSent(o) {
  const opt = o || {};
  const all = (Array.isArray(opt.raws) ? opt.raws : []).filter(Boolean);
  const raws = all.slice(0, ARCHIVE_MAX);
  const dropped = all.length - raws.length;
  const none = { ok: true, put: 0, dropped: 0, box: '', why: '' };

  if (!raws.length) return none;
  /* 끄는 스위치 — 사고가 나면 배포를 기다리지 않고 환경변수로 멈춘다 */
  if (String(process.env.MAIL_ARCHIVE_OFF || '') === '1') {
    return { ok: true, put: 0, dropped: dropped, box: '', why: '스위치가 꺼져 있습니다' };
  }
  const bytes = Number(opt.bytes || 0);
  if (bytes > ARCHIVE_MAX_BYTES) {
    return { ok: false, put: 0, dropped: dropped, box: '',
      why: '첨부가 커서(' + Math.round(bytes / 1024 / 1024) + 'MB) 사본은 건너뛰었습니다' };
  }

  let client = null, put = 0, box = '', why = '';
  try {
    client = await (opt.openClient || openImap)(opt);
    box = pickSentBox(await client.list());
    if (!box) {
      why = '보낸메일함을 찾지 못했습니다';
    } else {
      /* 「읽음」으로 넣는다 — 내가 보낸 것이 안 읽음으로 뜨면 숫자가 거짓이 된다 */
      for (let i = 0; i < raws.length; i++) {
        await client.append(box, raws[i], ['\\Seen']);
        put++;
      }
    }
  } catch (e) {
    why = String((e && e.message) || e);
  } finally {
    /* 연결을 안 닫으면 함수가 안 끝나고 그동안 요금이 샌다 */
    if (client) {
      try { await client.logout(); } catch (_) {
        try { client.close(); } catch (__) { /* 이미 끊겼다 */ }
      }
    }
  }
  return { ok: !!put && !why, put: put, dropped: dropped, box: box, why: why };
}

module.exports = {
  archiveSent, buildRaw, pickSentBox, looksSent, boxName,
  ARCHIVE_MAX, ARCHIVE_MAX_BYTES, ARCHIVE_TIMEOUT_MS, IMAP_HOST,
};
