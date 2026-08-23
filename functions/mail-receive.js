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

/* 보낸이·제목을 한 줄 메모로 — 나중에 「누가 보냈나」를 물을 수 있어야 한다. */
function mailNoteOf(o) {
  const from = String(o.mailFrom || '');
  const subject = String(o.mailSubject || '').replace(/[\r\n]+/g, ' ').trim();
  return ('메일 ' + from + (subject ? ' · ' + subject : '')).slice(0, 300);
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
function buildCompanyIndex(companies) {
  const box = (companies && typeof companies === 'object' && companies.v !== undefined)
    ? companies.v : companies;
  let list = box;
  if (list && !Array.isArray(list) && typeof list === 'object') {
    list = Object.keys(list).map(function (k) { return list[k]; });
  }
  const map = {};
  if (!Array.isArray(list)) return map;
  list.forEach(function (co) {
    if (!co || typeof co !== 'object') return;
    collectEmails(co).forEach(function (e) {
      if (!e || map[e]) return;          // 먼저 적힌 업체가 이긴다
      map[e] = co;
    });
  });
  return map;
}

function companyFor(fromHeader, index) {
  const a = normEmail(senderOf(fromHeader));
  if (!a) return null;
  return (index && index[a]) || null;
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

/* 이 메일 한 통을 어디로 보낼지 — 자리 하나와 까닭 한 줄. */
function routeFor(o, index, owners) {
  o = o || {};
  const co = companyFor(o.from, index);
  const tag = tagFor(o, co);
  if (!co) return { seat: '', shared: true, tag: tag, why: '업체관리에 없는 주소' };
  const seat = seatFor(co, owners);
  if (!seat) {
    const sid = String(co.managerMain || '');
    return { seat: '', shared: true, tag: tag,
      why: sid ? '주담당이 아직 급여데이터함에 들어온 적이 없음' : '업체관리에 주담당이 없음' };
  }
  return { seat: seat, shared: false, tag: tag, why: '' };
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
    note: mailNoteOf(o)
  };
}

module.exports = {
  UPLOAD_MAX, BAD_EXT,
  normEmail, senderOf, collectEmails, sidToEmail,
  buildKnownList, isKnownSender,
  buildCompanyIndex, companyFor, seatFor, tagFor, routeFor,
  mailConfOf, pickMailboxes, MAILBOX_HINT,
  extOf, okAttachment, sharedPendingRecord, pendingRecordFor, mailNoteOf
};
