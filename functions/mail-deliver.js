/* 자료 메일 — 실제로 보내는 층
   ═══════════════════════════════════════════════════════════════════════════
   HTTP 로 「지금 보내기」를 부를 때와, 예약한 때가 되어 서버가 스스로 보낼 때가
   **같은 코드**를 쓰게 하려고 떼어 냈다.
   두 벌로 두면 한쪽만 고치고 지나간다 — 실제로 그렇게 어긋난 적이 있다.

   ⚠ 여기는 「누가 부르는가」를 묻지 않는다. 부르는 쪽(index.js)이 이미 확인한다.
     예약 발송은 사람이 없는 자리에서 도므로, 예약을 **걸 때** 확인한 사람을
     그대로 들고 온다(byEmail). */
'use strict';

const MS = require('./mail-send');
const MA = require('./mail-archive');

const DAUM_HOST = 'smtp.daum.net';
const DAUM_PORT = 465;
const CARDS_ROOT = 'pucards';

/* 보내는 사람 표시 이름. 주소만 나가면 스팸으로 걸리기 쉽다. */
function fromLine(u) { return u ? '푸른노무법인 <' + u + '>' : ''; }

/* 접속 아이디 후보 — @ 앞부분 먼저, 그다음 주소 전체.
   다음메일 설정 화면이 「아이디: 370-6」이라고 알려 주지만, 주소 전체로도 되는
   계정이 있어 둘 다 해 본다(자격 문제일 때만 다음 것으로 넘어간다). */
function loginIds(from, envId) {
  const out = [];
  const e = String(envId || '').trim();
  if (e) out.push(e);
  const local = String(from || '').split('@')[0].trim();
  if (local && out.indexOf(local) < 0) out.push(local);
  if (from && out.indexOf(from) < 0) out.push(from);
  return out;
}

/* 실패한 까닭에 따라 다음 걸음이 완전히 다르다. 뭉뚱그리면 엉뚱한 곳을 고치게 된다. */
function errorHint(err) {
  const msg = String((err && err.message) || err);
  const auth = String((err && err.code) || '') === 'EAUTH' || /\b535\b/.test(msg);
  const noUser = /\b550\b/.test(msg) || /does not exist|NoSuchUser|Recipient address rejected/i.test(msg);
  let hint;
  if (noUser) {
    hint = '\n\n받는 사람 주소가 없는 주소입니다. 오타가 없는지 확인해 주세요.'
         + '\n(로그인 계정 주소가 실제 메일함이 아닐 수 있습니다 — 회사 메일 주소로 보내 보세요)';
  } else if (auth) {
    hint = '\n\n비밀번호가 맞지 않습니다. 다음메일 설정 → IMAP/POP3 → 「비밀번호 확인하기」에서'
         + ' 앱 비밀번호를 새로 받아 다시 넣어 주세요. (평소 로그인 비밀번호로는 안 됩니다)';
  } else {
    hint = '\n\n다음메일에서 IMAP/SMTP 사용이 켜져 있는지 확인해 주세요.';
  }
  return '메일 서버가 받지 않았습니다: ' + msg + hint;
}

/* 첨부 모으기 — 자료함 자료(번호만 받아 서버가 읽는다) + 이번 편지에만 붙일 파일 */
async function collectAttachments(db, body) {
  const matIds = Array.isArray(body.matIds) ? body.matIds.slice(0, 10) : [];
  const attachments = [], names = [];
  for (const id of matIds) {
    if (!id || typeof id !== 'string') continue;
    const [metaSnap, fileSnap] = await Promise.all([
      db.ref(CARDS_ROOT + '/materials/' + id).once('value'),
      db.ref(CARDS_ROOT + '/materialFiles/' + id).once('value'),
    ]);
    const meta = metaSnap.val();
    if (!meta) continue;
    const att = MS.toAttachment(meta, fileSnap.val());
    if (!att) continue;
    attachments.push(att);
    names.push(String(meta.name || meta.fileName || '자료'));
  }
  const found = attachments.length;
  // ⚠ 자료함에 저장하지 않는다. 저장하면 매번 고친 사본이 자료함에 쌓인다.
  const extras = Array.isArray(body.files) ? body.files.slice(0, 10) : [];
  for (const f of extras) {
    if (!f || typeof f !== 'object') continue;
    const att = MS.toAttachment({ fileName: f.name }, f.dataUrl);
    if (!att) continue;
    attachments.push(att);
    names.push(String(f.name || '첨부'));
  }
  return {
    attachments, names, extras,
    wanted: matIds.length,
    missing: matIds.length - found,
    noneFound: !!(matIds.length && !found),
  };
}

/* 실제 발송 + 기록.
   돌려주는 것: { ok:true, ... } 또는 { ok:false, status, error } */
async function deliver(opts) {
  const { db, body, from, pass, envId, byEmail } = opts;
  if (!from) {
    return { ok: false, status: 500,
      error: '보내는 주소가 비어 있습니다.\n명함첩 → 자료함 → ✉️ 메일 본문에서 「보내는 주소」를 넣어 주세요.' };
  }
  if (!pass) {
    return { ok: false, status: 500,
      error: '메일 비밀번호가 아직 없습니다.\nDAUM_MAIL_PASSWORD(앱 비밀번호)를 넣고 다시 배포하세요.' };
  }

  const got = await collectAttachments(db, body);
  if (got.noneFound) {
    return { ok: false, status: 400, error: '붙일 자료를 찾지 못했습니다. 자료함에서 파일을 다시 올려 주세요.' };
  }

  const v = MS.validateSend({
    to: body.to, cc: body.cc, bcc: body.bcc,
    subject: body.subject, body: body.body, attachments: got.attachments,
  });
  if (!v.ok) return { ok: false, status: 400, error: v.error };

  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (e) { return { ok: false, status: 500, error: '메일 도구를 불러오지 못했습니다: ' + String(e.message || e) }; }

  // 「내게쓰기」 — 숨은참조에 보내는 주소 자신을 더한다. 받는 사람에게는 안 보인다.
  const bcc = v.bcc.slice();
  if (body.toMe && bcc.indexOf(from) < 0 && v.to.indexOf(from) < 0) bcc.push(from);

  const baseMail = {
    from: fromLine(from),
    // 답장은 보낸 직원에게 — 회사 대표주소로만 오면 누구 건인지 모른다
    replyTo: byEmail || undefined,
    cc: v.cc.length ? v.cc.join(', ') : undefined,
    bcc: bcc.length ? bcc.join(', ') : undefined,
    subject: v.subject,
    text: v.body,
    attachments: v.attachments.map((a) => ({
      filename: a.filename, content: a.content, encoding: a.encoding,
    })),
  };

  // 「한명씩 발송」 — 참조·숨은참조는 첫 통에만. 매 통에 붙이면 참조받는 사람이
  // 같은 메일을 사람 수만큼 받는다.
  const oneByOne = !!body.oneByOne && v.to.length > 1;
  const batches = oneByOne
    ? v.to.map((t, i) => Object.assign({}, baseMail, {
        to: t,
        cc: i === 0 ? baseMail.cc : undefined,
        bcc: i === 0 ? baseMail.bcc : undefined,
      }))
    : [Object.assign({}, baseMail, { to: v.to.join(', ') })];

  let lastErr = null, usedId = '';
  for (const id of loginIds(from, envId)) {
    try {
      const tx = nodemailer.createTransport({
        host: DAUM_HOST, port: DAUM_PORT, secure: true,
        // 기다리는 시간을 못 박는다. 안 박으면 대답 없는 서버에 하염없이 매달린다.
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 90000,
        auth: { user: id, pass: pass },
      });
      for (const m of batches) await tx.sendMail(m);
      usedId = id; lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      // 자격 문제일 때만 다른 아이디로. 첨부가 크거나 주소가 틀린 것은 아이디를
      // 바꿔도 똑같은데, 되풀이하면 같은 메일이 여러 통 나간다.
      if (String((e && e.code) || '') !== 'EAUTH') break;
    }
  }
  if (lastErr) {
    console.error('deliver', lastErr && lastErr.message);
    return { ok: false, status: 502, error: errorHint(lastErr) };
  }

  // ★ 기록은 **실제로 나간 뒤**. 화면이 남기면 '보냈다는데 안 왔다'를 가릴 수 없다.
  const at = Date.now();

  /* ★ 다음메일 「보낸메일함」에도 사본을 남긴다 (대표 지시 2026-08-23).
     SMTP 는 「전해 줘」만 한다 — 보낸함에 사본을 넣는 일은 IMAP 이 따로 하는데
     그동안 우리는 그 일을 안 했다. 그래서 앱에서 보낸 메일이 다음메일 보낸함에
     한 통도 없었다(상대는 정상으로 받았다).
     ⚠ 배달은 «이미 끝났다». 여기서 무슨 일이 나도 배달 결과를 바꾸지 않는다 —
       실패를 되돌려 주면 대표가 「안 나갔다」고 오해해 같은 메일을 두 번 보낸다. */
  try {
    const raws = [];
    for (const m of batches) raws.push(await MA.buildRaw(m));
    const kept = await MA.archiveSent({
      user: usedId, loginIds: loginIds(from, envId), pass: pass,
      raws: raws, bytes: v.bytes,
    });
    if (!kept.ok) console.warn('archiveSent 못 남김:', kept.why, kept.box);
    else if (kept.dropped) console.warn('archiveSent 상한 초과 —', kept.dropped, '통은 사본 없음');
  } catch (e) { console.warn('archiveSent', (e && e.message) || e); }
  const cardId = String(body.cardId || '');
  if (cardId && !/[.#$/\[\]]/.test(cardId)) {
    try {
      await db.ref(CARDS_ROOT + '/sendLog/' + cardId).push(MS.sentLogRec({
        at: at, by: byEmail || '', to: v.to, names: got.names, set: body.set || '',
      }));
    } catch (e) { console.warn('sendLog', e && e.message); }
  }
  try {
    await db.ref(CARDS_ROOT + '/sentBox').push({
      at: at,
      by: byEmail || '',
      to: v.to.join(', '),
      toName: String(body.toName || ''),
      cc: v.cc.join(', '),
      subject: v.subject,
      body: v.body,
      ids: (Array.isArray(body.matIds) ? body.matIds : []).filter((x) => typeof x === 'string'),
      names: got.names,
      localNames: got.extras.map((f) => String((f && f.name) || '')).filter(Boolean),
      set: String(body.set || ''),
      cardId: cardId,
      from: from,
      scheduled: !!body.wasScheduled,      /* 예약해 두었다가 나간 것인지 */
    });
  } catch (e) { console.warn('sentBox', e && e.message); }

  return {
    ok: true, sent: v.to.length, files: got.attachments.length,
    missing: got.missing, bytes: v.bytes, from: from, id: usedId,
  };
}

/* ── 예약을 걸기 전 미리 걸러 내기 ──
   때가 되어서야 「받는 사람이 없다」를 알면 이미 늦다. 걸 때 바로 알려 준다.
   ⚠ 첨부 크기는 여기서 못 잰다(자료를 아직 안 읽었다). 그건 보낼 때 걸러진다. */
function errorsBefore(body) {
  const p = body || {};
  const v = MS.validateSend({
    to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, body: p.body, attachments: [],
  });
  return v.ok ? '' : v.error;
}

/* 예약 자리에 담을 값만 추린다.
   ⚠ 💻 내 PC 파일(files)은 담지 않는다. 8MB 짜리를 실시간DB 에 며칠씩 재워 두면
     용량을 먹고, 전 직원이 읽는 자리에 남의 파일이 놓인다. 이름만 남겨
     「그 파일은 빠진다」를 화면이 미리 알리게 한다. */
function slimPayload(body) {
  const p = body || {};
  return {
    cardId: String(p.cardId || ''),
    to: String(p.to || ''),
    cc: String(p.cc || ''),
    bcc: String(p.bcc || ''),
    toMe: !!p.toMe,
    oneByOne: !!p.oneByOne,
    subject: String(p.subject || ''),
    body: String(p.body || ''),
    matIds: (Array.isArray(p.matIds) ? p.matIds : []).filter((x) => typeof x === 'string').slice(0, 10),
    set: String(p.set || ''),
    toName: String(p.toName || ''),
    droppedFiles: (Array.isArray(p.files) ? p.files : [])
      .map((f) => String((f && f.name) || '')).filter(Boolean),
  };
}

module.exports = {
  deliver, collectAttachments, loginIds, errorHint, fromLine,
  errorsBefore, slimPayload, CARDS_ROOT,
};
