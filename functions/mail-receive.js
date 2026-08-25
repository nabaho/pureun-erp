/* 급여자료 메일 자동수신 — 순수 판단 층
   ═══════════════════════════════════════════════════════════════════════════
   메일함에 붙는 일(IMAP)은 index.js 가 한다. 여기는 **값만** 다룬다 —
   그래야 실제 메일함에 붙지 않고도 검사할 수 있다. (mail-send.js 와 같은 원리)

   ⚠ 이 층이 막아야 하는 것 넷
   1. 모르는 곳에서 온 것 — 대표 결정 2026-08-14: **아는 주소에서 온 것만** 받는다.
      업체관리·직원 명부에 있는 주소만 통과시킨다. 모르는 것은 **지우지 않고 그냥
      둔다**(지우면 사람이 나중에 확인할 길이 없다).
   2. 위험한 파일 — 실행파일·스크립트는 담지 않는다(화면 올리기와 같은 목록).
   3. 서명 그림 — 메일 끝에 붙는 회사 로고가 자료로 쌓이면 대기 칸이 못 쓰게 된다.
   4. 너무 큰 것 — 창고 한 건 상한을 서버도 똑같이 지킨다.

   ⚠ 담기는 자리는 **공용 대기 칸**이다. 서버는 「누구 자리」가 없기 때문이다.
     담당자가 집어가면 자기 자리로 내려간다(그 기능은 이미 앱에 있다).
   ⚠ 집어갈 때 앱이 아는 칸만 남기고 나머지는 버린다. 그래서 보낸사람·제목은
     **note 에 적어 둔다** — 따로 칸을 만들면 집어가는 순간 사라진다. */
'use strict';

/* 화면(js/pu-paydata-store.js)과 **같은 값**이어야 한다. 한쪽만 고치면
   메일로는 들어오는데 손으로는 못 올리는(또는 그 반대) 일이 생긴다. */
const UPLOAD_MAX = 25 * 1024 * 1024;
const BAD_EXT = ['exe', 'js', 'html', 'htm', 'bat', 'cmd', 'sh', 'com', 'scr', 'vbs', 'jar'];

const EMAIL_RE = /[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}/;

function normEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

/* 「이름 <a@b.com>」·「a@b.com」 어느 쪽이든 주소만 꺼낸다.
   못 알아보면 빈 문자열 — 부르는 쪽이 「모르는 사람」으로 다룬다. */
function senderOf(fromHeader) {
  const s = String(fromHeader == null ? '' : fromHeader);
  const m = s.match(EMAIL_RE);
  return m ? normEmail(m[0]) : '';
}

/* 아무 자료 덩어리에서 메일 주소처럼 생긴 것을 다 긁어모은다.
   ⚠ 업체관리의 담당자 메일 칸 이름이 앱마다·시기마다 달라서(email·이메일·
     담당자메일…) 칸 이름을 못 박지 않는다. 이름을 못 박으면 이름이 바뀐 날
     조용히 아무도 통과하지 못한다. */
function collectEmails(node, out, depth) {
  out = out || [];
  depth = depth || 0;
  if (node == null || depth > 4) return out;
  if (typeof node === 'string') {
    const m = node.match(EMAIL_RE);
    if (m) out.push(normEmail(m[0]));
    return out;
  }
  if (typeof node !== 'object') return out;
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) collectEmails(node[keys[i]], out, depth + 1);
  return out;
}

/* 사번을 이메일로 — 포털·명함첩·급여데이터함이 쓰는 규칙과 **같아야** 한다.
   다르면 같은 사람을 못 찾아 직원이 보낸 메일이 막힌다. */
function sidToEmail(sid) {
  return String(sid || '').toLowerCase().replace(/-/g, '') + '@pureun.kr';
}

/* 통과시킬 주소 명단을 만든다 — 업체관리(고객사) + 직원 명부.
   돌려주는 것은 소문자 주소 배열이고, 중복은 없앤다. */
function buildKnownList(companies, roster) {
  const out = [];
  const seen = {};
  function push(e) {
    const v = normEmail(e);
    if (!v || seen[v]) return;
    seen[v] = 1; out.push(v);
  }

  const box = (companies && typeof companies === 'object' && companies.v !== undefined)
    ? companies.v : companies;
  collectEmails(box).forEach(push);

  let list = (roster && typeof roster === 'object' && roster.v !== undefined) ? roster.v : roster;
  if (list && !Array.isArray(list) && typeof list === 'object') {
    list = Object.keys(list).map(function (k) { return list[k]; });
  }
  if (Array.isArray(list)) {
    list.forEach(function (x) {
      if (!x) return;
      if (x.email) push(x.email);
      if (x.sid) push(sidToEmail(x.sid));
    });
  }
  return out;
}

function isKnownSender(addr, known) {
  const a = normEmail(addr);
  if (!a) return false;
  return (known || []).indexOf(a) >= 0;
}

/* 파일 이름 끝의 확장자(소문자). 없으면 빈 문자열. */
function extOf(name) {
  const s = String(name == null ? '' : name);
  const i = s.lastIndexOf('.');
  if (i < 0 || i === s.length - 1) return '';
  return s.slice(i + 1).toLowerCase();
}

/* 첨부 하나를 담을 것인가. 담지 않을 때는 **왜인지**를 함께 돌려준다 —
   기록에 남겨야 "분명 보냈는데 없다"를 따라갈 수 있다. */
function okAttachment(att) {
  const a = att || {};
  const name = String(a.filename || '');
  const size = Number(a.size || 0);

  /* 메일 본문에 박힌 그림(서명 로고 등)은 자료가 아니다. 받는 순간부터
     대기 칸이 로고로 가득 차 못 쓰게 된다. */
  if (a.contentDisposition === 'inline' && a.cid) return { ok: false, why: '본문에 박힌 그림(서명 등)' };
  if (!name) return { ok: false, why: '이름 없는 첨부' };
  if (!size) return { ok: false, why: '빈 파일' };
  if (size > UPLOAD_MAX) return { ok: false, why: '너무 큽니다(25MB 넘음)' };
  if (BAD_EXT.indexOf(extOf(name)) >= 0) return { ok: false, why: '받지 않는 종류(' + extOf(name) + ')' };
  return { ok: true, why: '' };
}

/* 사람이 대기 칸에서 보게 될 한 줄. 앱의 pendingRecord 와 **같은 칸**이어야 한다 —
   집어갈 때 앱이 아는 칸만 남기므로, 없는 칸을 만들면 그 순간 사라진다. */
/* ══════ 어느 폴더를 볼지 (대표 결정 2026-08-23) ══════
   여태 「급여자료」라는 **이름 하나만** 찾았다. 그런데 다음메일에는 이미
   「2.급여+사무대행」 폴더가 있었다 — 이름이 달라 못 찾고, 로그에 열흘 넘게
   「폴더가 없습니다. 만들어 주세요」만 남겼다. 폴더를 새로 만들 일이 아니라
   **있는 폴더를 찾게** 할 일이었다.

   차례: 이름을 못 박아 줬으면 그것만 → 아니면 이름에 「급여」가 든 폴더 전부
   → 스위치(scanInbox)가 켜져 있으면 받은메일함을 뒤에 붙인다.
   ⚠ 보낸메일함·임시보관함·휴지통·스팸은 절대 안 본다 — 우리가 보낸 것을
   되받아 담으면 자료가 두 벌이 되고, 휴지통을 뒤지면 버린 것이 되살아난다. */
const MAILBOX_HINT = '급여';
const MAILBOX_NEVER = /보낸|임시|초안|휴지통|스팸|정크|Sent|Draft|Trash|Junk|Spam|Deleted/i;

function mailConfOf(raw) {
  const o = (raw && typeof raw === "object") ? raw : {};
  return {
    /* 참이라고 **확실할 때만** 켠다 — 받은메일함 전부 보기는 켜는 쪽이 위험하다
       (자문·산재 메일까지 서버가 연다). */
    scanInbox: o.scanInbox === true,
    folder: (typeof o.folder === 'string') ? o.folder : ''
  };
}

function pickMailboxes(list, conf) {
  const c = mailConfOf(conf);
  const rows = Array.isArray(list) ? list : [];
  const out = [], seen = {};
  const push = function (v) {
    if (!v || seen[v]) return;
    seen[v] = 1; out.push(v);
  };

  if (c.folder) {
    /* 이름을 못 박아 줬으면 그것만 — 없으면 **아무것도 안 본다.**
       엉뚱한 폴더를 대신 열면 남의 메일을 담는다. */
    const hit = rows.filter(function (b) { return b && b.path === c.folder; })[0];
    if (hit) push(hit.path);
  } else {
    rows.forEach(function (b) {
      if (!b || !b.path) return;
      const nm = String(b.name || b.path);
      if (MAILBOX_NEVER.test(nm) || MAILBOX_NEVER.test(b.path)) return;
      if (nm.indexOf(MAILBOX_HINT) >= 0) push(b.path);
    });
  }

  /* 받은메일함은 **뒤에** 붙인다 — 확실한 급여 폴더를 먼저 다 보고 남은 몫으로
     본다(한 회차에 처리할 수가 정해져 있다). */
  if (c.scanInbox) {
    const inbox = rows.filter(function (b) { return b && /^INBOX$/i.test(String(b.path)); })[0];
    if (inbox) push(inbox.path);
  }
  return out;
}

/* ══════ 서버가 본 메일 목록 (대표 결정 2026-08-24) ══════
   푸른 메일에는 **보내는 쪽만** 있었다(쓰기·보낸·예약·자료함). 받은 메일은
   급여데이터함 안에서만, 그것도 **자료로 담긴 것만** 보였다 — 문의 메일처럼
   자료가 안 되는 것은 앱에서 통째로 안 보였다.

   ⚠ **사본을 만드는 것이 아니다.** 답장·삭제·읽음은 여전히 다음메일이 진짜다.
   여기 적는 것은 「서버가 무엇을 보고 무엇을 담았나」는 기록이라, 본문 전문을
   넣지 않는다 — 목록만 읽어도 그 글이 다 따라오면 느리고 요금이 된다. */
var MAIL_PREVIEW = 160;
var MAIL_SUBJECT_MAX = 200;

function mailLogRecord(o) {
  o = o || {};
  var subject = String(o.subject == null ? '' : o.subject).replace(/[\r\n]+/g, ' ').trim();
  if (subject.length > MAIL_SUBJECT_MAX) subject = subject.slice(0, MAIL_SUBJECT_MAX);
  /* 미리보기 — 줄바꿈을 한 칸으로 눌러 담는다(목록은 한 줄로 보인다) */
  var preview = String(o.body == null ? '' : o.body)
    .replace(/\s+/g, ' ').trim().slice(0, MAIL_PREVIEW);
  return {
    from: String(o.from == null ? '' : o.from).replace(/[\r\n]+/g, ' ').trim().slice(0, 200),
    subject: subject,
    preview: preview,
    box: String(o.box == null ? '' : o.box),
    at: Number(o.at || 0),
    atts: Number(o.atts || 0),
    /* 담긴 결과 — 이 화면의 핵심이다. 몇 건이 자료로 갔고, 누구 칸으로 갔고,
       안 갔으면 왜 안 갔는지. */
    took: Number(o.took || 0),
    seatName: String(o.seatName == null ? '' : o.seatName),
    shared: o.shared === true,
    why: String(o.why == null ? '' : o.why),
    /* 지난 회차에 이미 처리한 메일 — 담긴 결과를 알 수 없다.
       0건이라고 적으면 화면에 「안 담김」으로 보여 거짓말이 된다. */
    old: o.old === true
  };
}

/* ══════ 처리한 메일 기억하기 (대표 결정 2026-08-23) ══════
   여태 「읽음」을 처리 표시로 썼다 — 서버가 **안 읽은 메일만** 봤다.
   그래서 **대표가 다음메일에서 그 메일을 열어 보면 급여데이터함에 영영 안
   들어왔다.** 메일이 오면 확인하려고 여는 것이 당연한데 그 순간 자료가 사라졌다.

   사람이 읽는 것과 서버가 처리한 것은 **다른 일**이다. 한 칸을 같이 쓰면 안 된다.
   그래서 메일마다 있는 고유 번호(Message-ID)를 서버가 따로 적어 둔다.
   ⚠ 읽음 표시는 이제 서버가 **건드리지 않는다** — 대표의 읽음·안읽음은 대표 것이다. */

/* Message-ID → 실시간DB 열쇠. 못 쓰는 글자( . $ # [ ] / )와 꺾쇠·빈칸을 걷어낸다.
   ⚠ 고유 번호를 안 붙이는 메일도 있다. 그때는 보낸이·제목·시각으로 만든다 —
   같은 메일이면 같은 값이 나와야 두 번 안 담는다. */
function mailKey(messageId, fallback) {
  var id = String(messageId == null ? '' : messageId).trim().replace(/^<|>$/g, '').trim();
  if (!id) {
    var f = fallback || {};
    var from = String(f.from == null ? '' : f.from).trim();
    var subject = String(f.subject == null ? '' : f.subject).trim();
    var date = Number(f.date || 0);
    if (!from && !subject && !date) return '';   // 억지로 만들지 않는다
    id = from + '|' + subject + '|' + date;
  }
  var key = id.replace(/[.$#[\]/\s]/g, '_');
  /* 실시간DB 열쇠는 768바이트까지지만, 길면 목록만 읽어도 무겁다 —
     앞을 살리고 잘라 낸다(앞부분이 메일마다 다른 곳이다). */
  if (key.length > 180) key = key.slice(0, 180);
  return key;
}

/* ══════ 메일 본문도 자료로 (대표 결정 2026-08-23) ══════
   여태 **첨부만** 담고 본문은 통째로 버렸다. 그래서 첨부 없이 본문에 적어
   보낸 메일(「이번달 김철수 22일」)이 아예 안 들어왔고, 카톡·문자를 메일로
   전달한 것도 못 썼다.

   ⚠ 본문은 **창고에 .txt 로** 담는다. RTDB 얇은 칸에 긴 글을 넣으면 목록을
   읽을 때마다 그 글이 다 따라온다(요금·속도). 창고에 담으면 원본 보존·뷰어·
   서랍·휴지통·보유기간이 손댈 것 없이 그대로 돈다. */
var BODY_MAX = 20000;          // AI 한도와 창고 씀씀이를 함께 본 값

/* 본문 글자. 글자 본문(text)이 있으면 그것을 쓰고, 없으면 HTML 에서 태그를
   걷어낸다. ⚠ 줄바꿈을 살려야 한다 — 한 줄로 뭉치면 「김철수 22 이영희 21」이
   되어 표를 못 읽는다. */
function bodyTextOf(parsed) {
  var p = parsed || {};
  var t = String(p.text == null ? '' : p.text);
  if (!t.trim() && p.html) {
    t = String(p.html)
      .replace(/<\s*(br|BR)\s*\/?\s*>/g, '\n')
      .replace(/<\s*\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
      .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }
  /* 줄마다 앞뒤 빈칸을 떼고, 빈 줄이 세 줄 넘게 이어지면 하나로 줄인다 —
     메일은 서명·인용 때문에 빈 줄이 수십 줄 붙어 온다. */
  t = t.replace(/\r/g, '')
    .split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!t) return '';
  if (t.length > BODY_MAX) {
    t = t.slice(0, BODY_MAX) + '\n… 본문이 너무 길어 여기서 잘랐습니다.';
  }
  return t;
}

/* 담을 만한 본문인가. ⚠ 「감사합니다」·「자료 보내드립니다」 같은 인사말까지
   담으면 대기 칸이 쓰레기로 찬다. **숫자가 하나도 없으면** 값이 될 것이
   없으므로 줄을 만들지 않는다(사람 이름만 있는 인사말도 그렇다). */
function okBody(text) {
  var t = String(text == null ? '' : text).trim();
  if (t.length < 10) return { ok: false, why: '본문이 너무 짧습니다' };
  if (!/[0-9]/.test(t)) return { ok: false, why: '숫자가 없어 값으로 만들 것이 없습니다' };
  return { ok: true, why: '' };
}

/* 본문 파일 이름 — 사람이 대기 칸에서 보는 이름이라 **메일 제목**을 쓴다.
   창고 자리에 못 쓰는 글자(\ / : * ? " < > |)는 걷어낸다. */
function bodyFilename(subject) {
  var s = String(subject == null ? '' : subject)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = '메일 본문';
  if (s.length > 100) s = s.slice(0, 100);
  return s + '.txt';
}

/* 보낸이·제목을 한 줄 메모로 — 나중에 「누가 보냈나」를 물을 수 있어야 한다. */
function mailNoteOf(o) {
  const from = String(o.mailFrom || '');
  const subject = String(o.mailSubject || '').replace(/[\r\n]+/g, ' ').trim();
  return ('메일 ' + from + (subject ? ' · ' + subject : '')).slice(0, 300);
}

/* ── 공용 칸 줄에서 보낸이·제목을 되찾는다 (대표 요청 2026-08-25) ──
   공용 칸에 52건이 「업체관리에 없는 주소」로 쌓여 있었다. 그 뒤에 업체관리에
   주소를 넣어도 **이미 떨어진 것은 다시 갈리지 않는다** — 배달은 받을 때 한 번만
   한다. 다시 갈라 보내려면 그 줄의 보낸이를 알아야 하는데,
   ⚠ 예전 줄에는 mailFrom 칸이 없다 — note 에 「메일 <주소> · <제목>」으로만 있다. */
function mailFromNote(note) {
  const s = String(note == null ? '' : note);
  const m = s.match(/^메일\s+(\S+?)(?:\s*·\s*([\s\S]*))?$/);
  if (!m) return { from: '', subject: '' };
  return { from: m[1], subject: String(m[2] || '').trim() };
}

/* 공용 칸 한 줄을 지금 규칙으로 다시 갈라 본다.
   보낸이는 새 칸(mailFrom)을 먼저 보고, 없으면 note 에서 되찾는다. */
function regroupOne(rec, index, owners, companies) {
  const r = rec || {};
  const got = (r.mailFrom || r.mailSubject)
    ? { from: String(r.mailFrom || ''), subject: String(r.mailSubject || '') }
    : mailFromNote(r.note);
  return routeFor({
    from: got.from, subject: got.subject, filename: String(r.filename || '')
  }, index, owners, '', companies);
}

/* ══════ 메일을 담당자 칸으로 저절로 (대표 승낙 2026-08-21) ══════
   여태 메일로 온 자료는 공용 칸에 쌓이고, 누군가 「내가 맡기」를 눌러야
   내려왔다. 화면에는 이미 누가 맡을 사람인지 적혀 있었는데 그리로
   **보내주지는** 않았다. 이제 서버가 바로 그 사람 칸에 넣는다.

   ⚠ 못 갈랐으면 **반드시 공용 칸에 남긴다**(대표 결정). 아직 급여데이터함에
   안 들어온 사람 자리에 넣으면 그 자리는 아무도 안 열어 자료가 사라진 것과
   같아진다. 왜 못 갈랐는지(why)도 함께 적어 관리자가 손볼 수 있게 한다. */

/* 주소 → 업체 지도. 업체 한 곳에 여러 주소가 적혀 있을 수 있다(대표·담당·경리).
   ⚠ buildKnownList 는 주소를 **평평하게** 모으기만 해서 어느 업체 것인지 몰랐다 —
   그래서 통과/차단에만 쓸 수 있었다. 여기서는 업체를 함께 담는다. */
/* 업체 자료를 배열로 편다 — {v:{id:업체}} 로도, 배열로도 온다.
   ⚠ 제목으로 사업장을 찾는 길(coFromText)도 이 배열이 필요해 따로 뺐다. */
function coList(companies) {
  const box = (companies && typeof companies === 'object' && companies.v !== undefined)
    ? companies.v : companies;
  let list = box;
  if (list && !Array.isArray(list) && typeof list === 'object') {
    list = Object.keys(list).map(function (k) { return list[k]; });
  }
  return Array.isArray(list) ? list : [];
}

function buildCompanyIndex(companies) {
  const list = coList(companies);
  const map = {};
  if (!Array.isArray(list)) return map;
  list.forEach(function (co) {
    if (!co || typeof co !== 'object') return;
    collectEmails(co).forEach(function (e) {
      if (!e) return;
      /* ⚠ 예전에는 「먼저 적힌 업체가 이긴다」였다. 그런데 **세무사무소 한 주소가
         여러 사업장에 걸린다**(정담회계법인 cpabong@naver.com → 7곳). 그때
         아무 한 곳을 골라 버리면, 담당이 다른 사람이면 남의 자료가 조용히
         엉뚱한 사람 칸으로 간다. 걸린 곳을 **다 담아** 두고 나중에 좁힌다. */
      const arr = (map[e] = map[e] || []);
      const id = String(co.id || '');
      for (let i = 0; i < arr.length; i++) {
        if (String(arr[i].id || '') === id) return;      // 같은 업체가 두 번
      }
      arr.push(co);
    });
  });
  return map;
}

/* 이 주소에 걸린 업체들. 예전 모양(주소 → 업체 하나)도 받아 준다. */
function companiesFor(fromHeader, index) {
  const a = normEmail(senderOf(fromHeader));
  if (!a) return [];
  const v = index && index[a];
  if (!v) return [];
  return Array.isArray(v) ? v.slice() : [v];
}

/* ── 글에서 사업장 찾기 (대표 요청 2026-08-24) ──
   회계사무소가 여러 사업장 자료를 한 주소로 보낸다. 주소만으로는 못 가리지만
   제목·파일 이름에 사업장 이름이 적혀 있는 일이 많다.
   ⚠ 짧은 이름은 아무 데나 걸린다(「계미」·「두끼」·「서브텍」) — 세 글자 아래는 안 본다.
   ⚠ 두 업체가 **같은 길이**로 걸리면 아무도 안 고른다. 한쪽을 골라 보내면
   나머지 자료가 어디 갔는지 아무도 모른다 — 공용 칸에 남기는 것이 낫다. */
function coNameKey(v) {
  return String(v == null ? '' : v)
    .replace(/[㈜]/g, '').replace(/\(주\)|\(유\)/g, '')
    .replace(/주식회사|유한회사|농업회사법인|사회복지법인|의료법인/g, '')
    .replace(/\s+/g, '').replace(/[.,·・\-–—_'"]/g, '').toLowerCase();
}

function coFromText(text, list) {
  const t = coNameKey(text);
  if (!t) return null;
  let best = null, bestLen = 0, tie = false;
  (Array.isArray(list) ? list : []).forEach(function (co) {
    const n = coNameKey(co && co.name);
    if (n.length < 3) return;
    if (t.indexOf(n) < 0) return;
    if (n.length > bestLen) { best = co; bestLen = n.length; tie = false; }
    else if (n.length === bestLen && best && String(best.id || '') !== String(co.id || '')) tie = true;
  });
  return tie ? null : best;
}

/* 이 폴더에서 온 것은 주소를 안 가려도 되나 (대표 결정 2026-08-23).
   ⚠ 2026-08-23 로그: 폴더는 제대로 찾았는데(2.급여+사무대행) 그 안의 새 메일
   2통이 **모르는 주소라 건너뛰어졌다**(unknown:2 · took:0). 대표가 규칙으로
   손수 갈라 둔 폴더인데 자료가 안 들어왔다.

   이름에 「급여」가 든 폴더 = 대표가 급여 자료로 분류해 둔 곳 → 다 받는다.
   받은메일함(INBOX) = 광고까지 들어오는 곳 → 아는 주소만 받는다.
   ⚠ 모르는 폴더는 **안 믿는다** — 나중에 다른 폴더를 보게 되어도 함부로
   담지 않는다(모르면 가리는 쪽이 안전하다). */
function trustBox(box) {
  var b = String(box == null ? '' : box);
  if (!b) return false;
  if (/^INBOX$/i.test(b)) return false;
  return b.indexOf(MAILBOX_HINT) >= 0;
}

/* 이 주소가 **한 업체만** 가리킬 때 그 업체. 여러 곳에 걸리면 null —
   골라 주지 않는다(누구 것인지 모르는 채로 고르면 남의 칸으로 간다). */
function companyFor(fromHeader, index) {
  const list = companiesFor(fromHeader, index);
  return list.length === 1 ? list[0] : null;
}

/* ── 폴더 이름에서 사람 찾기 (대표 결정 2026-08-23) ──
   다음메일에 「급여-최기운」 같은 폴더를 만들어 메일을 옮기면 그 사람에게 간다.
   지금까지는 업체관리 담당만 보고 갈라, 주소가 등록 안 된 곳이나 담당을 바꿔야
   할 건을 **사람이 바로잡을 길이 없었다.**

   ⚠ 이름이 두 사람과 걸리면 **아무도 안 고른다.** 한쪽을 골라 보내면 나머지
   사람은 그 자료가 어디 갔는지 모른다 — 공용 칸에 남기는 것이 낫다.
   ⚠ 폴더는 필요한 사람만 만들면 된다. 없으면 예전처럼 자동 배정으로 간다. */
function seatFromBox(box, owners) {
  var b = String(box == null ? '' : box);
  if (!b) return '';
  var ow = owners || {};
  var hit = [];
  Object.keys(ow).forEach(function (uid) {
    var o = ow[uid] || {};
    var nm = String(o.name || '').trim();
    if (nm && nm.length >= 2 && b.indexOf(nm) >= 0) { hit.push(uid); return; }
    /* 사번으로 적어도 찾는다 — 이름이 겹치는 사람이 있을 때 쓸 수 있어야 한다.
       p001@pureun.kr → 'p001'. 폴더에 'p-001' 로 적어도 붙게 붙임표를 뗀다. */
    var sid = String(o.email || '').split('@')[0].toLowerCase();
    if (sid && b.toLowerCase().replace(/-/g, '').indexOf(sid) >= 0) hit.push(uid);
  });
  if (hit.length !== 1) return '';       // 없거나 둘 이상이면 자동 배정에 맡긴다
  return hit[0];
}

/* 그 업체 **주담당**의 자리(uid). 부담당에게는 안 보낸다 —
   둘에게 다 보내면 같은 자료가 두 벌이 되고, 부담당에게만 보내면 주담당이 모른다.
   아직 이 함에 안 들어온 사람은 자리가 없다(빈 문자열). */
function seatFor(company, owners) {
  if (!company) return '';
  const sid = String(company.managerMain || '');
  if (!sid) return '';
  const want = sidToEmail(sid);
  const ow = owners || {};
  const keys = Object.keys(ow);
  for (let i = 0; i < keys.length; i++) {
    const o = ow[keys[i]] || {};
    if (o.email && normEmail(o.email) === want) return keys[i];
  }
  return '';
}

/* 이름표 짐작 — 사업장은 **주소로** 알고(파일 이름보다 정확하다),
   귀속월·종류는 파일 이름과 메일 제목에서 읽는다.
   ⚠ 낱말 규칙은 급여데이터함 guessTag 와 **같아야** 한다 — 다르면 같은 파일이
   서버와 화면에서 다른 종류로 잡힌다. */
function tagFor(o, company) {
  o = o || {};
  const text = String(o.filename || '') + ' ' + String(o.subject || '');

  let month = '';
  let m = text.match(/(20\d{2})\D{0,3}(\d{1,2})\s*월/);        // 2026년 8월
  if (!m) m = text.match(/(20\d{2})[.\-_](\d{1,2})(?!\d)/);      // 2026-08
  if (!m) {
    const yy = text.match(/(?:^|\D)(\d{2})\s*년\s*(\d{1,2})\s*월/); // 25년 07월
    if (yy) m = [yy[0], '20' + yy[1], yy[2]];
  }
  /* 두 자리 해 + 월 — 「26.07월_급여_본점_예정.xlsx」 (실제로 온 파일 이름).
     ⚠ 해를 20~40 으로 묶는다. 안 묶으면 「1.5월분」 같은 것이 해로 읽힌다.
     ⚠ 급여데이터함 guessTag 와 **같아야** 한다 — 다르면 같은 파일이 서버와
       화면에서 다른 달로 잡힌다. */
  if (!m) {
    const yd = text.match(/(?:^|\D)([2-3]\d)[.\-_](\d{1,2})\s*월/);
    if (yd) m = [yd[0], '20' + yd[1], yd[2]];
  }
  if (m) {
    const mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12) month = m[1] + '-' + (mo < 10 ? '0' : '') + mo;
  }

  let kind = '';
  if (/근로계약|계약서/.test(text)) kind = 'contract';
  else if (/명세서|이체|신고|취득|상실/.test(text)) kind = 'output';
  else if (/급여대장|노임|임금대장|대장/.test(text)) kind = 'ledger';
  else if (/근태|출근|출역|근무|시간/.test(text)) kind = 'attend';

  return {
    companyId: company ? String(company.id || '') : '',
    companyName: company ? String(company.name || '') : '',
    month: month, kind: kind
  };
}

/* 이 메일 한 통을 어디로 보낼지 — 자리 하나와 까닭 한 줄.
   ⚠ 차례: **폴더가 사람을 가리키면 그것이 이긴다** > 업체관리 자동 배정.
   사람이 손으로 옮긴 것이 자동보다 뒤로 밀리면 옮긴 뜻이 없다(대표 결정 2026-08-23). */
function routeFor(o, index, owners, box, companies) {
  o = o || {};
  const text = String(o.filename || '') + ' ' + String(o.subject || '');

  /* 폴더로 사람이 정해졌으면 업체를 몰라도 그 사람에게 보낸다 — 이것이
     폴더를 만드는 가장 큰 값이다(업체관리에 주소가 없어도 임자에게 간다).
     ⚠ 업체를 찾기 **전에** 답한다: 사람이 손으로 옮긴 것이 자동보다 세다. */
  const byBox = seatFromBox(box, owners);
  if (byBox) {
    const one = companiesFor(o.from, index);
    return {
      seat: byBox, shared: false, byBox: true, why: '',
      tag: tagFor(o, one.length === 1 ? one[0] : coFromText(text, one.length ? one : companies))
    };
  }

  const cands = companiesFor(o.from, index);
  let co = cands.length === 1 ? cands[0] : null;
  let found = '';

  /* 한 주소가 여러 사업장에 걸렸다(회계사무소) — 제목·파일 이름으로 좁힌다.
     대표 요청 2026-08-24: 「회계사무소 메일도 담당자 칸으로 가게 해라」 */
  if (!co && cands.length > 1) {
    co = coFromText(text, cands);
    if (co) found = '여러 사업장에 걸린 주소 — 제목에서 사업장을 찾음';
  }
  /* 아예 모르는 주소 — 그래도 제목에 사업장 이름이 있으면 임자를 알 수 있다.
     여태 이런 메일은 통째로 공용 칸에 떨어져 아무도 안 챘다. */
  if (!co && !cands.length) {
    co = coFromText(text, companies);
    if (co) found = '주소는 모르지만 제목에서 사업장을 찾음';
  }

  const tag = tagFor(o, co);

  if (!co) {
    /* 글로도 못 좁혔다. 걸린 곳들의 **주담당이 한 사람이면** 그 사람 칸으로
       보낸다 — 사업장은 본인이 고른다. 아무 데도 안 가는 것보다 낫다. */
    if (cands.length > 1) {
      const seats = {};
      cands.forEach(function (c) { seats[seatFor(c, owners) || ''] = 1; });
      const only = Object.keys(seats);
      if (only.length === 1 && only[0]) {
        return { seat: only[0], shared: false, byBox: false, tag: tag,
          why: '여러 사업장에 걸린 주소 — 담당이 한 사람이라 그 칸으로' };
      }
      return { seat: '', shared: true, byBox: false, tag: tag,
        why: '한 주소가 담당이 다른 여러 사업장에 걸려 있음' };
    }
    return { seat: '', shared: true, tag: tag, why: '업체관리에 없는 주소', byBox: false };
  }

  const seat = seatFor(co, owners);
  if (!seat) {
    const sid = String(co.managerMain || '');
    return { seat: '', shared: true, tag: tag, byBox: false,
      why: sid ? '주담당이 아직 급여데이터함에 들어온 적이 없음' : '업체관리에 주담당이 없음' };
  }
  return { seat: seat, shared: false, tag: tag, why: found, byBox: false };
}

/* 담당자 대기 칸에 넣을 줄. 사람이 담은 줄과 모양이 같아야 그 화면이 그대로 그린다 —
   다만 by 는 비워 두고(서버가 담았다) routed 를 남겨 「저절로 온 것」을 갈라 본다. */
function pendingRecordFor(o) {
  o = o || {};
  const tag = o.tag || {};
  return {
    filename: String(o.filename || ''),
    file: String(o.file || ''),
    mime: String(o.mime || ''),
    bytes: Number(o.bytes || 0),
    at: Number(o.at || 0),
    by: '',                    // 서버가 담았다 — 사람이 아니다
    companyId: String(tag.companyId || ''),
    companyName: String(tag.companyName || ''),
    month: String(tag.month || ''),
    kind: String(tag.kind || ''),
    from: 'mail',
    routed: true,              // 사람이 맡은 것이 아니라 저절로 내려온 것
    note: mailNoteOf(o)
  };
}

/* 공용 칸에 넣을 줄 — 못 갈랐을 때만 쓴다.
   알아낸 이름표는 함께 넘긴다(맡는 사람이 다시 고를 일이 없다).
   why 는 관리자가 **왜 안 갈렸는지** 보는 곳이다. */
function sharedPendingRecord(o) {
  o = o || {};
  const tag = o.tag || {};
  return {
    filename: String(o.filename || ''),
    file: String(o.file || ''),
    mime: String(o.mime || ''),
    bytes: Number(o.bytes || 0),
    at: Number(o.at || 0),
    by: '',                    // 서버가 담았다 — 사람이 아니다
    companyId: String(tag.companyId || ''),
    companyName: String(tag.companyName || ''),
    month: String(tag.month || ''),
    kind: String(tag.kind || ''),
    from: 'mail',
    why: String(o.why || ''),
    note: mailNoteOf(o),
    /* 보낸이·제목을 **칸으로도** 남긴다 (대표 요청 2026-08-25) — 나중에 다시
       갈라 보낼 때 글(note)을 되짚어 읽지 않아도 된다. */
    mailFrom: String(o.mailFrom || ''),
    mailSubject: String(o.mailSubject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  };
}

module.exports = {
  UPLOAD_MAX, BAD_EXT,
  normEmail, senderOf, collectEmails, sidToEmail,
  buildKnownList, isKnownSender,
  buildCompanyIndex, coList, companyFor, companiesFor, coFromText, seatFor, tagFor, routeFor,
  mailFromNote, regroupOne,
  mailConfOf, pickMailboxes, MAILBOX_HINT,
  trustBox,
  BODY_MAX, bodyTextOf, okBody, bodyFilename,
  seatFromBox,
  mailKey,
  mailLogRecord, MAIL_PREVIEW,
  extOf, okAttachment, sharedPendingRecord, pendingRecordFor, mailNoteOf
};
