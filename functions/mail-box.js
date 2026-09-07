/* 다음메일함 통째 동기화 — 순수 판단 층
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: "다음 370-6@daum.net 에 있는 메일을 모두 동기화 시켜달라."

   ★ 지금까지와 무엇이 다른가
   기존 receivePaydataMail 은 **「급여자료」 폴더 하나만**, **안 읽은 것만**, **아는
   주소에서 온 것만** 보고 첨부만 담았다. 그것은 급여자료를 줍는 기계다.
   여기는 다르다 — **메일함 자체**를 앱에서 보려는 것이다. 폴더 전부, 읽은 것까지,
   보낸 것까지 목록을 그대로 가져온다.

   ⚠ 절대 규칙 넷 — 이 층이 지켜야 하는 것
   1. **읽기만 한다.** 메일함은 다음메일이 진짜다. 읽음 표시도, 삭제도, 이동도 하지
      않는다(IMAP 을 readOnly 로 연다). 앱에서 지운 것이 다음메일에 남고 그 반대도
      되면 어느 쪽이 맞는지 아무도 모른다.
   2. **본문은 담지 않는다.** 목록(보낸이·제목·시각·첨부 개수)만 실시간DB에 둔다.
      본문은 볼 때 그 자리에서 가져온다. 몇 년치 본문을 DB에 쌓으면 요금이 뛰고,
      백업 한도(16MB)도 그 자리에서 넘는다.
   3. **한 회차에 다 하지 않는다.** 몇 년치 메일을 한 번에 끌면 함수가 시간 초과로
      죽고 아무것도 안 남는다. 새것은 위에서, 옛것은 아래에서 조금씩 — 회차를
      거듭하며 만난다(pickToFetch).
   4. **폴더 이름을 못 박지 않는다.** 다음메일의 폴더 이름·차림은 계정마다 다르고
      언젠가 바뀐다. IMAP 이 알려 주는 특수용도표시(\Sent 등)를 먼저 믿고, 이름은
      거들기만 한다. 이름을 못 박으면 이름이 바뀐 날 조용히 아무것도 안 온다. */
'use strict';

/* ── 실시간DB 열쇠로 쓸 수 없는 글자 ──
   RTDB 열쇠에는 . # $ / [ ] 를 못 쓴다. 다음메일 폴더 경로는 「INBOX.1.자문사답변」
   처럼 **점이 들어간다** — 그대로 쓰면 저장이 통째로 실패한다.
   그래서 안전한 글자로 바꾸고, 바뀐 뒤에 서로 겹치지 않도록 짧은 지문을 붙인다.
   (「a.b」와 「a_b」가 둘 다 「a_b」가 되면 두 폴더가 한 자리를 다툰다.) */
function safeKey(s) {
  return String(s == null ? '' : s).replace(/[.#$/[\]]/g, '_');
}

/* 경로 지문 — 같은 경로면 늘 같은 값이어야 한다(회차마다 바뀌면 폴더가 매번 새로 생긴다).
   암호용이 아니다. 짧고 고르게 흩어지면 된다. */
function hash8(s) {
  const str = String(s == null ? '' : s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

function slugOf(path) {
  const base = safeKey(path).slice(0, 60);
  return base + '-' + hash8(path);
}

/* ── 이 폴더는 어떤 칸인가 ──
   IMAP 의 특수용도표시를 먼저 본다. 없으면 이름으로 짚는다(다음메일은 한글 이름을
   쓰고, 계정에 따라 영문 이름도 있다). 아무것도 안 맞으면 'custom' — 대표가 손으로
   만든 「내 메일함」의 폴더다. */
const KIND_BY_USE = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'spam',
  '\\Archive': 'archive',
};
/* ⚠ 이름을 여기 적을 때는 «그 계정에 실제로 있는 이름»을 넣는다.
   실측 2026-08-25 (370-6@daum.net): 다음메일이 만들어 둔 칸은 「스팸편지함」·
   「내게쓴편지함」·「예약편지함」이다. 예전 목록에는 「스팸함」만 있어서, 400통이 든
   내게쓴편지함이 「내 메일함」 밑 잡폴더로 밀려나 있었고 화면의 「내게쓴메일함」은
   가짜 거르개라 거의 늘 비어 있었다. */
const KIND_BY_NAME = [
  ['inbox', ['inbox', '받은메일함', '받은편지함']],
  ['sent', ['sent', 'sent messages', 'sent items', '보낸메일함', '보낸편지함']],
  ['drafts', ['drafts', 'draft', '임시보관함', '임시저장']],
  ['trash', ['trash', 'deleted messages', '휴지통', '지운메일함']],
  ['spam', ['junk', 'spam', '스팸함', '스팸메일함', '스팸편지함']],
  ['archive', ['archive', '보관메일함', '보관함']],
  ['tome', ['내게쓴메일함', '내게쓴편지함']],
  ['sched', ['예약메일함', '예약편지함']],
];

function folderKind(box) {
  const b = box || {};
  const use = String(b.specialUse || '');
  if (KIND_BY_USE[use]) return KIND_BY_USE[use];
  const name = String(b.name || '').trim().toLowerCase();
  const path = String(b.path || '').trim().toLowerCase();
  for (let i = 0; i < KIND_BY_NAME.length; i++) {
    const list = KIND_BY_NAME[i][1];
    for (let j = 0; j < list.length; j++) {
      if (name === list[j] || path === list[j]) return KIND_BY_NAME[i][0];
    }
  }
  return 'custom';
}

/* 화면에 보일 차례. 다음메일 왼쪽 차림새와 같은 순서다 —
   받은 → 보낸 → 임시 → 보관 → 스팸 → 휴지통 → 손으로 만든 폴더.
   손으로 만든 폴더는 이름순이다(대표 폴더가 「1.자문사답변 … 9.자율점검」이라 이름순이 곧 번호순). */
const KIND_ORDER = { inbox: 1, tome: 2, sent: 3, drafts: 4, sched: 5, archive: 6,
  custom: 7, spam: 8, trash: 9 };

function folderOrder(kind) {
  const n = KIND_ORDER[kind];
  return n === undefined ? 5 : n;
}

/* 목록에 보일 폴더인가 — IMAP 이 「고를 수 없다」고 한 것(\Noselect)은 껍데기다.
   가짜 뿌리 폴더(예: 「INBOX」 아래를 묶기만 하는 자리)를 세면 늘 0통으로 남는다. */
function isSyncable(box) {
  const b = box || {};
  if (b.listed === false && b.subscribed === false) return false;
  const flags = b.flags;
  const has = (f) => {
    if (!flags) return false;
    if (typeof flags.has === 'function') return flags.has(f);
    if (Array.isArray(flags)) return flags.indexOf(f) >= 0;
    return false;
  };
  if (has('\\Noselect') || has('\\NonExistent')) return false;
  return true;
}

/* ── 가져올 «까닭이 있는» 칸인가 (대표 지시 2026-08-26) ──
   "메일함에 스팸함은 연결시켜서 가지고 올 필요없다. 그런데 왜 가지고 있나"
   ⚠ 지금까지는 폴더를 «가리지 않고» 다 가져왔다. 스팸함이 든 것은 필요해서가 아니라
     아무도 빼지 않아서다. 광고 수백 통이 DB 를 채우고, 동기화 예산(460초)을 나눠 쓰고,
     「전체메일」에 섞여 든다.
   ⚠ 스팸함 하나만 뺀다. 휴지통은 남긴다 — 잘못 지운 것을 찾는 자리라 사람이 실제로
     본다(대표가 지목한 것도 스팸함뿐이다).
   ⚠ 이 목록은 앱과 «맞춰야» 한다. 여기서 빼 놓고 앱이 그 칸을 그리면 늘 0통으로 남는다. */
const SKIP_KINDS = ['spam'];

function isWanted(box) {
  return SKIP_KINDS.indexOf(folderKind(box)) < 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   휴지통 — 폴더는 남기고 «메일만» 안 가져온다 (대표 지시 2026-08-29)
   ══════════════════════════════════════════════════════════════════════════
   "다음메일에서 삭제한 부분이 있는경우 푸른메일함에 당겨올 필요없다"

   ⚠ 스팸함처럼 «통째로» 빼면 안 된다. 우리 앱의 [삭제]는 다음메일 휴지통으로 옮기는데,
     옮길 자리 이름을 폴더 목록에서 찾는다(mbFolderOf('trash')). 폴더가 없으면
     「휴지통 폴더를 찾지 못했습니다」가 떠서 삭제 자체가 막힌다.
   ★ 그래서 폴더 «기록»은 남기고 그 안의 메일만 안 가져온다. 앱은 nomsg 를 보고
     「다음메일에서 보십시오」라고 알려 준다 — 빈 칸만 보이면 고장으로 읽힌다.
   ⚠ 이 목록도 앱과 «맞춰야» 한다. 서버만 고치고 앱이 그대로면 늘 0통인 칸이 남는다. */
const NO_MSG_KINDS = ['trash'];

function wantsMsgs(box) {
  return NO_MSG_KINDS.indexOf(folderKind(box)) < 0;
}

/* 폴더 하나를 실시간DB에 적을 모양으로 — 앱 왼쪽 목록이 이것만 보고 그린다.
   ⚠ 구분자(delim)와 어버이(parent)를 함께 적는다. 하위 폴더를 만들려면 «이 서버가
     쓰는 구분자»를 알아야 하는데, 그것은 IMAP 이 폴더마다 알려 준다(서버마다 다르다:
     / 인 곳도, . 인 곳도 있다). 못 박아 두면 다른 계정에서 엉뚱한 폴더가 생긴다. */
function folderRecord(box, status) {
  const b = box || {};
  const st = status || {};
  const kind = folderKind(b);
  const path = String(b.path || '');
  const delim = String(b.delimiter || '');
  const at = delim ? path.lastIndexOf(delim) : -1;
  const rec = {
    path: path,
    name: String(b.name || path || ''),
    kind: kind,
    order: folderOrder(kind),
    total: Number(st.messages || 0),
    unseen: Number(st.unseen || 0),
    delim: delim,
    parent: at > 0 ? path.slice(0, at) : '',
    depth: (at > 0 && delim) ? path.split(delim).length - 1 : 0,
  };
  /* 「메일은 안 가져오는 칸」이라고 «적어» 둔다 — 앱이 이 표를 보고 「다음메일에서
     보십시오」라고 알려 준다. 안 적으면 앱은 빈 칸을 보고 고장으로 읽는다. */
  if (NO_MSG_KINDS.indexOf(kind) >= 0) rec.nomsg = 1;
  return rec;
}

/* ── 폴더 이름으로 쓸 수 있는가 ──
   ⚠ 구분자가 든 이름은 막는다. 「가/나」로 만들면 IMAP 은 그것을 «두 층»으로 읽어
     엉뚱한 자리에 폴더가 생긴다. 사람은 이름 하나를 지었다고 생각한다.
   ⚠ 앞뒤 빈칸도 막는다 — 눈에 안 보이는데 다른 폴더가 된다. */
function folderNameBad(name, delim) {
  const s = String(name == null ? '' : name);
  if (!s.trim()) return '이름을 적어 주세요';
  if (s !== s.trim()) return '이름 앞뒤의 빈칸을 지워 주세요';
  if (s.length > 60) return '이름이 너무 깁니다 (60자까지)';
  if (delim && s.indexOf(delim) >= 0) return '이름에 「' + delim + '」 는 쓸 수 없습니다 — 폴더를 가르는 글자입니다';
  if (/[\r\n\t"%*]/.test(s)) return '이름에 쓸 수 없는 글자가 있습니다';
  return '';
}

/* 새 폴더의 «전체 경로». 어버이가 있으면 그 아래로 붙인다. */
function childPath(parentPath, name, delim) {
  const p = String(parentPath || '');
  const d = String(delim || '');
  if (!p) return String(name);
  if (!d) return String(name);          // 구분자를 모르면 층을 못 만든다 — 맨 위에 만든다
  return p + d + String(name);
}

/* 이름만 바꾼 경로 — 어버이는 그대로 두고 마지막 마디만 간다.
   ⚠ 어버이째 옮기면 그 아래 하위 폴더가 통째로 딸려 가 사라진 것처럼 보인다. */
function renamedPath(path, name, delim) {
  const p = String(path || '');
  const d = String(delim || '');
  const at = d ? p.lastIndexOf(d) : -1;
  return at > 0 ? p.slice(0, at + d.length) + String(name) : String(name);
}

/* ── 첨부가 몇 개인가 ──
   본문을 내려받지 않고 **구조만** 보고 센다. 본문에 박힌 그림(서명 로고 등)은
   첨부가 아니다 — 그것까지 세면 거의 모든 메일에 📎 가 붙어 표시가 뜻을 잃는다. */
function attCount(node, depth) {
  const n = node;
  if (!n || (depth || 0) > 8) return 0;
  const disp = String(n.disposition || '').toLowerCase();
  const type = String(n.type || '').toLowerCase();
  const named = !!(n.dispositionParameters && n.dispositionParameters.filename) ||
                !!(n.parameters && n.parameters.name);
  /* ⚠ 첨부인지 «먼저» 본다 — 안으로 파고들기 전에.
     전달된 메일이 통째로 첨부된 것(message/rfc822)은 그 «안에» 또 조각이 들어 있다.
     먼저 파고들면 사람이 보는 첨부 한 개(전달된메일.eml) 대신 그 안의 것들이 세어져
     📎 개수가 엉뚱해진다. 사람 눈에 그것은 «파일 하나»다.
     (예전 차례로는 첨부인지 보기 전에 childNodes 부터 훑었다 — 2026-08-27 실측) */
  if (disp === 'attachment') return 1;
  /* 이름이 붙은 inline 은 사람이 「첨부」로 여긴다 — 단, cid 로 본문에 박힌 것은 뺀다 */
  if (disp === 'inline' && named && !n.id) return 1;
  /* disposition 이 아예 없는 옛 메일 — 본문(text/*) 이 아니고 이름이 있으면 첨부다 */
  if (!disp && named && type.indexOf('text/') !== 0) return 1;
  let sum = 0;
  const kids = n.childNodes || n.children;
  if (Array.isArray(kids)) {
    for (let i = 0; i < kids.length; i++) sum += attCount(kids[i], (depth || 0) + 1);
  }
  return sum;
}

/* ── 미리보기에 쓸 «본문 조각» 은 어디 있나 ──
   구조를 보고 글이 든 부분 하나를 고른다. text/plain 이 있으면 그것이 먼저다 —
   html 은 꼬리표를 걷어내야 해서 더 지저분해진다.
   ⚠ 첨부는 건드리지 않는다. 첨부의 앞 800바이트를 미리보기로 적으면 목록이 깨진 글자로 찬다. */
function textPartOf(node, depth) {
  if (!node || (depth || 0) > 8) return null;
  const kids = node.childNodes || node.children;
  if (Array.isArray(kids)) {
    let html = null;
    for (let i = 0; i < kids.length; i++) {
      const got = textPartOf(kids[i], (depth || 0) + 1);
      if (!got) continue;
      if (!got.html) return got;      // text/plain — 더 볼 것 없다
      if (!html) html = got;
    }
    return html;
  }
  const type = String(node.type || '').toLowerCase();
  const disp = String(node.disposition || '').toLowerCase();
  if (disp === 'attachment') return null;
  if (type !== 'text/plain' && type !== 'text/html') return null;
  const part = String(node.part || '1');
  return {
    part: part,
    enc: String(node.encoding || '').toLowerCase(),
    cs: String((node.parameters && node.parameters.charset) || '').toLowerCase(),
    html: type === 'text/html',
  };
}

/* ── 받아 온 조각을 사람이 읽을 한 줄로 ──
   ⚠ 앞부분만 잘라 받으므로 «끝이 잘려 있다». base64 는 4글자 묶음이라 남는 것을 버리고,
     따옴표인용(=XX)은 잘린 자리를 지운다. 안 그러면 마지막 글자가 깨져 나온다. */
function decodePart(buf, enc) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'utf8');
  if (enc === 'base64') {
    let t = b.toString('ascii').replace(/[^A-Za-z0-9+/=]/g, '');
    t = t.slice(0, t.length - (t.length % 4));     // 잘린 묶음은 버린다
    try { return Buffer.from(t, 'base64'); } catch (e) { return Buffer.alloc(0); }
  }
  if (enc === 'quoted-printable') {
    const t = b.toString('latin1')
      .replace(/=\r?\n/g, '')                      // 줄 잇기
      .replace(/=[0-9A-Fa-f]?$/, '');              // 잘린 =X 는 버린다
    const out = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '=' && i + 2 < t.length) {
        const n = parseInt(t.substr(i + 1, 2), 16);
        if (!isNaN(n)) { out.push(n); i += 2; continue; }
      }
      out.push(t.charCodeAt(i) & 0xff);
    }
    return Buffer.from(out);
  }
  return b;
}

/* ── 바이트가 «올바른 UTF-8» 인가 ──
   ⚠ 미리보기는 앞부분만 잘라 받으므로 «끝이 잘려» 있다. 마지막 글자가 중간에서
     끊기면 그것 하나 때문에 「UTF-8 이 아니다」로 읽힌다 — 꼬리 3바이트까지 떼어 보고
     되면 UTF-8 로 본다(한 글자는 최대 4바이트다). */
function looksUtf8(buf) {
  const b = Buffer.isBuffer(buf) ? buf : null;
  if (!b || !b.length) return false;
  let hi = false;
  for (let i = 0; i < b.length; i++) { if (b[i] >= 0x80) { hi = true; break; } }
  if (!hi) return false;            /* 순 ASCII — 어느 글자표로 읽어도 같다 */
  for (let cut = 0; cut <= 3 && cut < b.length; cut++) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, b.length - cut)); return true; }
    catch (e) { /* 꼬리를 한 바이트 더 떼고 다시 */ }
  }
  return false;
}

/* ── 글자표를 골라 읽는다 ──
   ★★ 머리글이 «틀릴» 수 있다 — 그래서 바이트를 먼저 믿는다 (대표 제보 2026-09-07).

   ⚠ 무슨 일이었나: 충남경제진흥원에서 온 메일을 열면 본문이 통째로
     「異⑸④꼍吏μ 蹂寃쎌」 처럼 깨졌다. 그런데 «목록의 미리보기는 멀쩡했다».
     까닭은 두 길이 서로 «다른 조각»을 고르기 때문이다 —
       · 미리보기(textPartOf)는 text/plain 을 먼저 고른다  → 그 조각은 글자표가 맞았다
       · 열 때(pickParts)는 text/html 을 먼저 고른다        → 보낸 쪽이 그 조각에
         charset=euc-kr 이라 적어 두었는데 «실제 바이트는 UTF-8» 이었다
     재현 확인: 멀쩡한 글을 UTF-8 로 담아 euc-kr 로 읽으니 화면과 «같은 글자»가 나왔다.

   ★ 그래서 규칙을 넷으로 못 박는다.
     ① 순 ASCII 면 머리글 그대로 (어느 쪽으로 읽어도 같다)
     ② 바이트가 올바른 UTF-8 이면 «머리글이 뭐라 하든» UTF-8
     ③ 머리글은 utf-8 이라는데 바이트가 아니면 → euc-kr (한글 메일에 흔한 반대 잘못)
     ④ 그 밖에는 머리글대로, 못 읽는 글자표면 utf-8 로 되돌린다
   ⚠ ②가 진짜 euc-kr 글을 잘못 데려갈 걱정 — 실측 2026-09-07 로 한글 글 325개를
     euc-kr 로 담아 보니 «우연히 올바른 UTF-8» 인 것이 **0개**였다. euc-kr 은 0xA1~0xFE
     를 앞바이트로 쓰는데 그 짝이 UTF-8 이음바이트 규칙과 거의 안 맞는다. */
function toText(buf, charset) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'utf8');
  let cs = String(charset || 'utf-8').toLowerCase()
    .replace('ks_c_5601-1987', 'euc-kr').replace('ksc5601', 'euc-kr');
  const utf8Said = /^utf-?8$/.test(cs);
  if (looksUtf8(b)) cs = 'utf-8';                 /* ② 바이트가 이긴다 */
  else if (utf8Said) cs = 'euc-kr';               /* ③ 머리글이 거짓말했다 */
  try { return new TextDecoder(cs, { fatal: false }).decode(b); } catch (e) { /* 모르는 글자표 */ }
  try { return new TextDecoder('utf-8', { fatal: false }).decode(b); } catch (e) { return ''; }
}

const PREVIEW_MAX = 140;

/* &#44048; · &#xAC00; 같은 «숫자 문자»를 글자로. 한글 메일에 아주 흔하다 —
   안 풀면 「감사합니다」가 「&#44048;&#49324;&#54633;&#45768;&#45796;」로 보인다. */
function unentity(s) {
  return String(s || '')
    .replace(/&#(\d{1,7});/g, (m, d) => {
      const n = Number(d);
      try { return (n > 0 && n <= 0x10ffff) ? String.fromCodePoint(n) : ' '; } catch (e) { return ' '; }
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => {
      const n = parseInt(h, 16);
      try { return (n > 0 && n <= 0x10ffff) ? String.fromCodePoint(n) : ' '; } catch (e) { return ' '; }
    })
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

/* 메일 머리줄인가 — 전달·답장 본문 맨 앞에 붙는 것들. 글이 아니다. */
const HEAD_LINE = /^\s*(-{2,}\s*)?(original message|원본\s*메시지|from|to|cc|bcc|sent|date|subject|보낸사람|받는사람|보낸날짜|제목)\s*[:：]/i;
function isHeadLine(ln) {
  const t = String(ln || '').trim();
  if (!t) return true;
  if (/^-{3,}.*-{3,}$/.test(t)) return true;      // ----- 원본 메시지 -----
  return HEAD_LINE.test(t);
}

function previewFrom(buf, tp) {
  const t = tp || {};
  let s = toText(decodePart(buf, t.enc), t.cs);
  if (t.html) {
    /* ① 닫힌 script·style·head 는 통째로 버린다 */
    s = s.replace(/<\s*(script|style|head)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
    /* ② ⚠ 앞부분만 잘라 받으므로 «닫히지 않은» script·style 이 남는다. 그러면 여는
       꼬리표만 지워지고 그 «안의 CSS 가 글처럼» 남는다 — 실제로 목록에
       「.color_fix span {color:#888 !i」 같은 것이 나왔다(2026-08-24 대표 화면).
       닫히지 않은 것은 거기서부터 «끝까지» 버린다. */
    s = s.replace(/<\s*(script|style|head)\b[\s\S]*$/i, ' ');
    /* 줄바꿈 꼬리표는 빈칸이 아니라 «줄»로 바꾼다 — 아래에서 머리줄을 줄 단위로 걷는다 */
    s = s.replace(/<\s*br\b[^>]*>/gi, '\n').replace(/<\s*\/\s*(p|div|tr|li)\s*>/gi, '\n');
    s = s.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/, ' ');
  }
  s = unentity(s);
  /* ③ CSS 조각(선택자 { … })은 글이 아니다.
     ⚠ html 뿐 아니라 «글(text/plain)» 조각에도 실려 온다 — html 을 글로 바꿔 보내는
       메일 프로그램이 style 을 그대로 흘려 넣는다. 실제로 목록에
       「… 감사합니다. p{margin-top:0;margin-bo」 가 남았다(2026-08-24 실측).
       그래서 html 여부를 가리지 않고 걷는다. */
  s = s.replace(/[^\s{}]+\s*\{[^{}]*\}?/g, ' ');
  /* 보이지 않는 글자를 걷어내고 빈칸을 하나로 */
  const clean = (x) => x.replace(/[\u0000-\u001f\u007f\u00ad\u200b-\u200f\ufeff]/g, ' ')
                        .replace(/\s+/g, ' ').trim();
  /* ④ 인용줄(> …)과 메일 머리줄을 걷어낸다 — 답장·전달은 그것으로 시작한다.
     ⚠ 다 걷어내고 «아무것도 안 남으면» 걷지 않은 것을 보여 준다. 셋째 줄이 비면 사람은
       「본문이 없는 메일」로 읽는데, 실은 인용·머리줄만 있는 답장이다. */
  const lines = s.split(/\r?\n/);
  const body = clean(lines.filter((ln) => !/^\s*>/.test(ln) && !isHeadLine(ln)).join(' '));
  const out = body || clean(s.replace(/^\s*>+/gm, ' '));
  return out.slice(0, PREVIEW_MAX);
}

/* ── 줄 모양이 바뀌면 다시 가져와야 한다 ──
   미리보기(p)를 더한 것처럼 «줄에 담는 것»이 바뀌면, 이미 가져온 줄에는 그 칸이 없다.
   표시(hi·lo)가 다 찼다고 되어 있어 다시 가져오지도 않는다 — 그러면 옛 줄은 영원히
   반쪽이다. 그래서 번호를 붙여 두고, 번호가 다르면 그 폴더만 처음부터 다시 훑는다.
   ⚠ 줄에 칸을 더할 때마다 이 번호를 올린다. 안 올리면 새 칸은 «새 메일에만» 붙는다. */
const ROW_VER = 5;   /* 4→5: 글 조각에 실려 온 CSS 도 걷는다 */

function needsRefetch(sync) {
  return Number((sync || {}).ver || 0) !== ROW_VER;
}

/* 이 폴더는 «정말» 다 됐나 — 회차 기록의 ready/waiting 이 이것으로 갈린다.
   ⚠ done 만 보면 안 된다. 줄 판이 옛것이면 지난 회차의 done 이 그대로 남아 있어도
     새 칸(미리보기)이 아직 없다 — 다시 훑어야 한다. 그것까지 ready 로 세면
     「서른셋 다 됐다」고 해 놓고 화면에는 셋째 줄이 없는 줄이 남는다
     (2026-08-24 실측: 일곱 폴더만 새 판인데 ready 가 33 이었다). */
function folderDone(sync) {
  return !!(sync && sync.done) && !needsRefetch(sync);
}

/* 주소 하나를 「이름」과 「주소」로. 이름이 없으면 주소를 이름 자리에도 쓴다 —
   목록에서 보낸이 칸이 비면 무엇이 왔는지 알 수 없다. */
function oneAddr(a) {
  const x = a || {};
  const addr = String(x.address || '').trim();
  const name = String(x.name || '').trim();
  return { n: name || addr, e: addr.toLowerCase() };
}

function addrList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(oneAddr).filter((x) => x.n || x.e);
}

function hasFlag(flags, f) {
  if (!flags) return false;
  if (typeof flags.has === 'function') return flags.has(f);
  if (Array.isArray(flags)) return flags.indexOf(f) >= 0;
  return false;
}

/* ── 목록 한 줄 ──
   칸 이름을 짧게 쓴다(u·f·e·s·d…). 몇 만 줄이 오가는 자리라 칸 이름이 그대로
   요금이 된다 — 「subject」 대신 「s」면 만 줄에서 60KB 가 준다.
   ⚠ 앱(pu-cards.html)이 읽는 칸과 **같아야** 한다. 한쪽만 고치면 목록이 빈다. */
function msgRow(msg, preview) {
  const m = msg || {};
  const env = m.envelope || {};
  const from = addrList(env.from)[0] || { n: '', e: '' };
  const to = addrList(env.to);
  const when = env.date ? new Date(env.date).getTime() : 0;
  return {
    u: Number(m.uid || 0),
    f: String(from.n || '').slice(0, 120),
    e: String(from.e || '').slice(0, 160),
    t: to.map((x) => x.e).filter(Boolean).slice(0, 8).join(','),
    tn: (to[0] && to[0].n ? String(to[0].n) : '').slice(0, 120),
    s: String(env.subject || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300),
    d: Number.isFinite(when) && when > 0 ? when : 0,
    r: hasFlag(m.flags, '\\Seen') ? 1 : 0,
    g: hasFlag(m.flags, '\\Flagged') ? 1 : 0,
    w: hasFlag(m.flags, '\\Answered') ? 1 : 0,
    a: attCount(m.bodyStructure, 0),
    z: Number(m.size || 0),
    /* 미리보기 — 폰 목록의 셋째 줄. 없으면 아예 칸을 안 만든다(빈 글자를 만 줄 적으면 그것도 값이다) */
    p: String(preview || '').slice(0, PREVIEW_MAX),
  };
}

/* ── 이번 바퀴에 «어느 번호»를 가져올까 ──
   메일함이 알려 준 **실제 번호 목록**(IMAP SEARCH ALL)을 보고 고른다.

   ⚠ 왜 목록을 받아서 고르나 — 처음에는 번호를 300씩 «훑어 내려갔다». 그런데 이 계정의
     번호는 폴더별이 아니라 **계정 전체에서 하나씩** 매겨져 2026-08-24 현재 171,876
     번까지 가 있고, 폴더 하나에는 그 가운데 400개만 들어 있다. 그래서 훑어 내려가면
     거의 언제나 **빈 구간**을 열게 되어, 400통 폴더 하나를 채우는 데 430바퀴가
     걸렸다(실측: 33개 폴더 한 회차에 345통). 목록을 받아 고르면 **두 바퀴**다.

   두 방향은 그대로다.
   ① 새것 — 지난번에 본 가장 큰 번호(hi) 위쪽. 늘 이것이 먼저다. 대표가 기다리는 것은
      방금 온 메일이다. 보통 몇 통뿐이라 뭉치로 자르지 않는다.
   ② 옛것 — 지난번에 본 가장 작은 번호(lo) 아래쪽에서 **큰 것부터** 한 뭉치.
      새 것에 가까운 쪽부터 채워야 사람이 먼저 볼 것이 먼저 찬다.

   done 은 옛것이 더 없다는 뜻 — 이 폴더는 이제 새것만 보면 된다.

   ⚠ 이 함수가 지키는 것 하나: [lo … hi] 사이는 **빈틈이 없다.** 늘 위에서부터 이어
     붙여 가져오기 때문이다. 그래서 「어디까지 했나」를 번호 두 개로 적어 둘 수 있다
     (가져온 번호를 다 적어 두면 폴더마다 수만 자가 된다). */
function pickToFetch(uids, sync, chunk) {
  const s = sync || {};
  const all = (uids || []).map(Number).filter((n) => n > 0).sort((a, b) => b - a);  // 큰 것부터
  const size = Math.max(1, Number(chunk || 400));
  const hi = Number(s.hi || 0);
  const lo = Number(s.lo || 0);
  const out = { fresh: [], back: [], done: false, total: all.length };

  if (!all.length) { out.done = true; return out; }

  /* 처음이면 — 맨 위에서 한 뭉치. 옛것은 다음 바퀴부터. */
  if (!hi || !lo) {
    out.back = all.slice(0, size);
    out.done = out.back.length >= all.length;
    return out;
  }

  out.fresh = all.filter((u) => u > hi);
  const older = all.filter((u) => u < lo);
  out.back = older.slice(0, size);
  out.done = older.length <= out.back.length;
  return out;
}

/* 번호 여럿을 IMAP 에 넘길 글자로. 「5,9,12」처럼 낱개로 적는다 —
   구간(9:12)으로 줄이면 그 사이 없는 번호까지 달라고 하는 셈이라, 서버마다 답이 다르다. */
function uidSet(uids) {
  return (uids || []).map(Number).filter((n) => n > 0).sort((a, b) => a - b).join(',');
}

/* 회차가 끝난 뒤 적어 둘 표시. 번호가 뒤로 가는 일은 없어야 한다 —
   uidValidity 가 바뀌면(서버가 번호를 다시 매겼다) 처음부터 다시 해야 한다.

   ⚠ 지난 회차가 적어 둔 것들(셈 n · 마지막 정리 때 prunedAt · 그때 살아 있던 통수 lastN)을
     **그대로 이어 준다.** 여기서 새 객체를 만들며 떨어뜨리면 정리 판정이 통째로 망가진다 —
     n 을 떨어뜨리면 「통수가 다르다」가 늘 참이 되어 폴더를 회차마다 헛되게 읽고(요금),
     lastN 을 떨어뜨리면 그 반대로 «지운 것이 있어도 못 알아챈다». 둘 다 겪었다(2026-08-24).
   ⚠ 칸을 새로 더할 때 이 자리에 함께 적어야 한다. 안 적으면 그 칸은 조용히 사라진다. */
function nextSync(sync, seen, uidValidity, done) {
  const s = sync || {};
  const nums = (seen || []).map(Number).filter((n) => n > 0);
  const old = Number(s.uv || 0);
  const uv = Number(uidValidity || 0);
  if (uv && old && uv !== old) {
    /* 번호가 갈렸다 — 지난 표시는 못 믿는다. 이번에 본 것만으로 다시 시작한다.
       셈도 정리 때도 버린다(다른 메일을 세어 둔 값이다). */
    return {
      uv: uv,
      hi: nums.length ? Math.max.apply(null, nums) : 0,
      lo: nums.length ? Math.min.apply(null, nums) : 0,
      done: false,
      n: 0,
      prunedAt: 0,
      lastN: 0,
    };
  }
  const hi = Number(s.hi || 0);
  const lo = Number(s.lo || 0);
  return {
    uv: uv || old || 0,
    hi: nums.length ? Math.max(hi, Math.max.apply(null, nums)) : hi,
    lo: nums.length ? (lo ? Math.min(lo, Math.min.apply(null, nums)) : Math.min.apply(null, nums)) : lo,
    done: !!done,
    n: Number(s.n || 0),
    prunedAt: Number(s.prunedAt || 0),
    lastN: Number(s.lastN || 0),
    /* ⚠ 표시 맞추기가 적어 둔 값도 «그대로 이어 준다» (2026-08-30).
         여기서 떨어뜨리면 다음 회차에 «처음»으로 보여, 폴더를 회차마다 통째로 읽는다 —
         셈(n)·prunedAt 을 이어 주는 것과 같은 까닭이다. */
    unread: Number.isFinite(Number(s.unread)) ? Number(s.unread) : -1,
    sweptAt: Number(s.sweptAt || 0),
    /* ⚠ 이 칸이 «언제부터 언제까지»인가도 그대로 이어 준다 (2026-09-06).
         적는 자리(runSync)에서 세어 넣는 값이라, 여기서 떨어뜨리면 회차마다 지워져
         화면의 「지난 메일」 표가 늘 비어 보인다 — 바로 위 unread·sweptAt 과 같은 까닭이다. */
    oldest: Number(s.oldest || 0),
    newest: Number(s.newest || 0),
  };
}

/* ── 지운 것인가, 「창 밖」으로 밀려난 것인가 (대표 지시 2026-08-28) ──
   "왜 400 으로 했나 불필요한것 같다 제한이 필요없을 것 같다."

   ★ 400 은 우리 한도가 아니다 — 다음메일 IMAP 이 폴더당 그만큼만 보여 준다
     (실측: 13개 폴더가 나란히 400 에서 멈춘다). 우리는 이미 그보다 많이 담고 있었다
     (실측 2026-08-28: Sent 421 · INBOX 411 · 1.자문사답변 406).

   ⚠ 그런데 «정리»가 그것을 도로 깎았다. 예전 규칙은 「지금 목록에 없으면 지운다」였다.
     새 메일이 한 통 오면 가장 옛것이 그 400 창 밖으로 밀리는데, 지운 것이 아닌데도
     목록에서 사라진다. 그래서 우리 거울이 «영영 400 을 못 넘었다» — 대표가 지우지도
     않은 메일을 우리가 스스로 지우고 있었다.

   ★ 가를 수 있다. IMAP 번호(uid)는 «늘 커지기만» 한다. 그러니 지금 보이는 것 가운데
     «가장 작은 번호»(floor)보다 작으면 그것은 창 밖이지 지워진 것이 아니다.
     floor 보다 크면서 목록에 없으면 — 그 구간은 서버가 다 보여 주고 있으므로 —
     정말 지워졌거나 다른 폴더로 옮겨진 것이다.

   ⚠ 창 밖으로 밀려난 «뒤에» 지운 것은 영영 못 알아챈다. 그 값과 「지우지도 않은 메일이
     사라진다」를 견주면 남기는 쪽이 낫다(대표 지시).
   ⚠ 목록이 비어 있으면 «아무것도 지우지 않는다». 예전에는 이때 폴더가 통째로 지워졌다 —
     번호 목록을 못 받으면(SEARCH 실패) p.uids 가 빈 배열이 되는데, 그러면 「살아 있는
     것이 하나도 없다」로 읽혀 담아 둔 줄이 전부 날아간다. 한 번의 접속 실패로 몇 년치가
     사라지는 길이라 여기서 막는다. */
function goneKeys(haveKeys, uids) {
  const list = (uids || []).map(Number).filter((n) => n > 0);
  if (!list.length) return [];
  const alive = {};
  let floor = Infinity;
  for (let i = 0; i < list.length; i++) {
    alive[String(list[i])] = 1;
    if (list[i] < floor) floor = list[i];
  }
  return (haveKeys || []).filter((k) => {
    const n = Number(k);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (alive[String(n)]) return false;
    return n > floor;
  });
}

/* 새로 매겨졌으면 지난 목록은 버려야 한다 — 같은 번호가 다른 메일을 가리킨다. */
function uidReset(sync, uidValidity) {
  const old = Number((sync || {}).uv || 0);
  const uv = Number(uidValidity || 0);
  return !!(uv && old && uv !== old);
}

module.exports = {
  safeKey, hash8, slugOf,
  folderKind, folderOrder, isSyncable, isWanted, SKIP_KINDS, folderRecord,
  wantsMsgs, NO_MSG_KINDS,
  attCount, oneAddr, addrList, hasFlag, msgRow,
  folderNameBad, childPath, renamedPath,
  textPartOf, decodePart, toText, looksUtf8, previewFrom, unentity, isHeadLine, PREVIEW_MAX,
  ROW_VER, needsRefetch, folderDone,
  pickToFetch, uidSet, nextSync, uidReset, goneKeys,
};
