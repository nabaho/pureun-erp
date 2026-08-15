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
function sharedPendingRecord(o) {
  o = o || {};
  const from = String(o.mailFrom || '');
  const subject = String(o.mailSubject || '').replace(/[\r\n]+/g, ' ').trim();
  const note = ('메일 ' + from + (subject ? ' · ' + subject : '')).slice(0, 300);
  return {
    filename: String(o.filename || ''),
    file: String(o.file || ''),
    mime: String(o.mime || ''),
    bytes: Number(o.bytes || 0),
    at: Number(o.at || 0),
    by: '',                    // 서버가 담았다 — 사람이 아니다
    companyId: '', companyName: '', month: '', kind: '',
    from: 'mail',
    note: note
  };
}

module.exports = {
  UPLOAD_MAX, BAD_EXT,
  normEmail, senderOf, collectEmails, sidToEmail,
  buildKnownList, isKnownSender,
  extOf, okAttachment, sharedPendingRecord
};
