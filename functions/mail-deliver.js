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
const SG = require('./mail-sign');

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

/* ── 💻 내 PC 파일이 창고를 거쳐 온다 (대표 물음 2026-08-31) ──
   "용량이 너무 작은 것 아닌가"

   ★ 예전에는 파일을 «글자로 바꿔 요청에 실어» 보냈다. 그런데 이 함수는 1세대라
     요청 한 번에 10MB 까지만 받고, 글자로 바꾸면 크기가 1.33배로 분다 —
     그래서 8MB 라 적어 두고도 7.5MB 언저리부터 조용히 실패할 수 있었다.
   ★ 이제 브라우저가 파일을 창고에 먼저 올리고, 요청에는 «자리(path)»만 실어 보낸다.
     여기서 창고에서 꺼내 붙인다 — 10MB 한도와 무관해져 다음메일의 18MB 를 다 쓴다.

   ⚠ 자리를 «그대로 믿지 않는다» — 보낸 사람 제 자리(mailout/<uid>/…)만 꺼낸다.
     안 막으면 주소만 바꿔 «남의 파일»을 첨부로 빼낼 수 있다.
   ⚠ 예전 길(dataUrl)도 그대로 받는다 — 창고 규칙이 아직 안 올라갔거나 막혔을 때
     브라우저가 그리로 되돌아간다. 한쪽만 남기면 그때 붙이기가 통째로 죽는다. */
const MAILOUT_MAX = 20 * 1024 * 1024;
/* ⚠ pu-cards.html 의 storageBucket 과 «같은 이름»이어야 한다 — 다르면 브라우저가 올린
   자리를 서버가 못 찾아, 첨부가 조용히 빠진 채 메일이 나간다. */
const CARDS_BUCKET = 'pureun-erp-photos';
function mailOutPathOk(path, uid) {
  const p = String(path || '');
  if (!uid) return false;
  if (p.indexOf('..') >= 0) return false;
  return p.indexOf('pucards/mailout/' + uid + '/') === 0;
}
async function readMailOut(deps, path) {
  const file = deps.getStorage().bucket(CARDS_BUCKET).file(String(path));
  const [meta] = await file.getMetadata();
  if (Number(meta.size || 0) > MAILOUT_MAX) throw new Error('첨부가 너무 큽니다');
  const [buf] = await file.download();
  return buf;
}
/* 보낸 뒤 치운다 — 안 치우면 창고에 임시 파일이 영영 쌓인다(요금이 붙는다).
   ⚠ 못 치워도 «보내기는 성공»이다 — 치우다 실패해서 보낸 메일이 실패로 보이면 안 된다. */
async function sweepMailOut(deps, paths) {
  for (const p of (paths || [])) {
    try { await deps.getStorage().bucket(CARDS_BUCKET).file(String(p)).delete(); }
    catch (e) { console.warn('mailout 치우기 실패:', p, String((e && e.message) || e)); }
  }
}

/* 첨부 모으기 — 자료함 자료(번호만 받아 서버가 읽는다) + 이번 편지에만 붙일 파일 */
async function collectAttachments(db, body, deps, uid) {
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
  const used = [];          /* 창고에서 꺼내 쓴 자리 — 보낸 뒤 치운다 */
  for (const f of extras) {
    if (!f || typeof f !== 'object') continue;
    let att = null;
    if (f.path) {
      if (!deps || !uid) { console.warn('mailout 을 읽을 길이 없다 — 건너뛴다'); continue; }
      /* 창고 길 — 자리가 «제 자리»인지 먼저 본다(머리글의 까닭) */
      if (!mailOutPathOk(f.path, uid)) {
        console.warn('mailout 남의 자리 요청:', String(f.path));
        continue;
      }
      try {
        const buf = await readMailOut(deps, f.path);
        att = { filename: String(f.name || '첨부'), content: buf };
        used.push(String(f.path));
      } catch (e) {
        console.warn('mailout 읽기 실패:', String(f.path), String((e && e.message) || e));
        continue;
      }
    } else {
      att = MS.toAttachment({ fileName: f.name }, f.dataUrl);   /* 예전 길 */
    }
    if (!att) continue;
    attachments.push(att);
    names.push(String(f.name || '첨부'));
  }
  return {
    attachments, names, extras, used,
    wanted: matIds.length,
    missing: matIds.length - found,
    noneFound: !!(matIds.length && !found),
  };
}

/* 실제 발송 + 기록.
   돌려주는 것: { ok:true, ... } 또는 { ok:false, status, error } */
async function deliver(opts) {
  /* ⚠ deps·uid 는 «창고 첨부»에만 쓴다(2026-08-31). 안 넘어오면 창고 길은 조용히
     건너뛰고 예전 길(dataUrl)만 붙는다 — 부르는 곳을 하나 빠뜨려도 메일은 나간다. */
  const { db, body, from, pass, envId, byEmail, deps, uid } = opts;
  if (!from) {
    return { ok: false, status: 500,
      error: '보내는 주소가 비어 있습니다.\n기업정보함 → 자료함 → ✉️ 메일 본문에서 「보내는 주소」를 넣어 주세요.' };
  }
  if (!pass) {
    return { ok: false, status: 500,
      error: '메일 비밀번호가 아직 없습니다.\nDAUM_MAIL_PASSWORD(앱 비밀번호)를 넣고 다시 배포하세요.' };
  }

  const got = await collectAttachments(db, body, deps, uid);
  if (got.noneFound) {
    return { ok: false, status: 400, error: '붙일 자료를 찾지 못했습니다. 자료함에서 파일을 다시 올려 주세요.' };
  }

  const v = MS.validateSend({
    to: body.to, cc: body.cc, bcc: body.bcc,
    subject: body.subject, body: body.body,
    /* ★ 서식 몫 (대표 지시 2026-08-24). 이 줄을 빼면 화면에서 꾸민 것이 조용히 사라져
       도구줄이 다시 «가짜»가 된다 — 그것이 이번에 고친 문제였다. */
    html: body.html,
    attachments: got.attachments,
  });
  if (!v.ok) return { ok: false, status: 400, error: v.error };

  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (e) { return { ok: false, status: 500, error: '메일 도구를 불러오지 못했습니다: ' + String(e.message || e) }; }

  // 「내게쓰기」 — 숨은참조에 보내는 주소 자신을 더한다. 받는 사람에게는 안 보인다.
  const bcc = v.bcc.slice();
  if (body.toMe && bcc.indexOf(from) < 0 && v.to.indexOf(from) < 0) bcc.push(from);

  /* ── 내 서명 명함 사진 (대표 지시 2026-08-24) ──
     본문에 표시(cid:pusign)가 있으면, «보낸 사람 것»으로 저장된 명함의 썸네일을
     인라인 첨부로 붙인다. 표시가 없으면 한 글자도 안 건드린다.
     ⚠ 그림을 못 찾으면 표시를 «지운다» — 빈 그림 자리(❌)가 받는 화면에 뜨면 안 된다.
     ⚠ 무슨 일이 나도 메일은 나가야 한다. 서명 하나 때문에 발송이 멈추면 안 된다. */
  let signHtml = v.html || '';
  const signAtt = [];
  try {
    if (signHtml && SG.hasSignMark(signHtml)) {
      const key = SG.signKey(byEmail);
      let thumb = '';
      if (key) {
        const rec = (await db.ref(CARDS_ROOT + '/config/matMail/perUser/' + key).once('value')).val() || {};
        const cardId = String(rec.cardId || '');
        /* 열쇠에 못 쓰는 글자가 든 번호는 아예 읽지 않는다 — 경로가 어긋난다 */
        if (cardId && !/[.#$/[\]]/.test(cardId)) {
          thumb = (await db.ref(CARDS_ROOT + '/thumbs/' + cardId).once('value')).val() || '';
        }
      }
      const att = SG.signAttachment(thumb);
      if (att) signAtt.push(att);
      else signHtml = SG.stripSignMark(signHtml);   // 못 찾았다 — 표시를 지운다
    }
  } catch (e) {
    console.warn('mailSign', (e && e.message) || e);
    signHtml = SG.stripSignMark(signHtml);          // 읽다 실패했다 — 그림 없이 보낸다
  }

  const baseMail = {
    from: fromLine(from),
    // 답장은 보낸 직원에게 — 회사 대표주소로만 오면 누구 건인지 모른다
    replyTo: byEmail || undefined,
    cc: v.cc.length ? v.cc.join(', ') : undefined,
    bcc: bcc.length ? bcc.join(', ') : undefined,
    subject: v.subject,
    /* 서식과 평문을 «같이» 보낸다 (대표 지시 2026-08-24). 평문을 빼면 서식을 못 읽는
       메일 프로그램에서 빈 편지가 되고, 서식을 빼면 도구줄이 다시 가짜가 된다. */
    html: signHtml || undefined,
    text: v.body,
    /* 서명 명함 사진은 «인라인»(cid) 으로 — 첨부 파일 목록에 따로 뜨지 않게 한다 */
    attachments: v.attachments.map((a) => ({
      filename: a.filename, content: a.content, encoding: a.encoding,
    })).concat(signAtt.map((a) => ({
      filename: a.filename, content: a.content, encoding: a.encoding,
      cid: a.cid, contentDisposition: a.contentDisposition,
    }))),
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
  /* 창고에서 꺼내 쓴 임시 파일을 치운다 — 나간 «뒤»에 치운다(먼저 치우면 못 붙인다).
     ⚠ 치우다 실패해도 보내기는 성공이다 — 안에서 삼킨다(sweepMailOut). */
  if (deps && got.used && got.used.length) await sweepMailOut(deps, got.used);
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
      /* 서식 몫도 남긴다 — 없으면 「다시 쓰기」가 꾸민 것을 잃고 평문으로 돌아간다.
         ⚠ 자리를 더 쓴다. 본문은 보통 1KB 안쪽이라 값을 치를 만하다고 봤다 —
           썸네일(2.48MB)과 달리 이건 글자뿐이다. 커지면 여기부터 다시 본다. */
      html: v.html || '',
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
    /* 서식 몫 — 안 담으면 «예약한 편지만» 서식이 사라진다 (대표 지시 2026-08-24) */
    html: String(p.html || ''),
    matIds: (Array.isArray(p.matIds) ? p.matIds : []).filter((x) => typeof x === 'string').slice(0, 10),
    set: String(p.set || ''),
    toName: String(p.toName || ''),
    droppedFiles: (Array.isArray(p.files) ? p.files : [])
      .map((f) => String((f && f.name) || '')).filter(Boolean),
  };
}

module.exports = {
  deliver, collectAttachments, loginIds, errorHint, fromLine,
  mailOutPathOk, sweepMailOut, CARDS_BUCKET, MAILOUT_MAX,
  errorsBefore, slimPayload, CARDS_ROOT,
};
