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
      거듭하며 만난다(backfillWindow).
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
const KIND_BY_NAME = [
  ['inbox', ['inbox', '받은메일함', '받은편지함']],
  ['sent', ['sent', 'sent messages', 'sent items', '보낸메일함', '보낸편지함']],
  ['drafts', ['drafts', 'draft', '임시보관함', '임시저장']],
  ['trash', ['trash', 'deleted messages', '휴지통', '지운메일함']],
  ['spam', ['junk', 'spam', '스팸함', '스팸메일함']],
  ['archive', ['archive', '보관메일함', '보관함']],
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
const KIND_ORDER = { inbox: 1, sent: 2, drafts: 3, archive: 4, spam: 8, trash: 9, custom: 5 };

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

/* 폴더 하나를 실시간DB에 적을 모양으로 — 앱 왼쪽 목록이 이것만 보고 그린다. */
function folderRecord(box, status) {
  const b = box || {};
  const st = status || {};
  const kind = folderKind(b);
  return {
    path: String(b.path || ''),
    name: String(b.name || b.path || ''),
    kind: kind,
    order: folderOrder(kind),
    total: Number(st.messages || 0),
    unseen: Number(st.unseen || 0),
  };
}

/* ── 첨부가 몇 개인가 ──
   본문을 내려받지 않고 **구조만** 보고 센다. 본문에 박힌 그림(서명 로고 등)은
   첨부가 아니다 — 그것까지 세면 거의 모든 메일에 📎 가 붙어 표시가 뜻을 잃는다. */
function attCount(node, depth) {
  const n = node;
  if (!n || (depth || 0) > 8) return 0;
  let sum = 0;
  const kids = n.childNodes || n.children;
  if (Array.isArray(kids)) {
    for (let i = 0; i < kids.length; i++) sum += attCount(kids[i], (depth || 0) + 1);
    return sum;
  }
  const disp = String(n.disposition || '').toLowerCase();
  const type = String(n.type || '').toLowerCase();
  const named = !!(n.dispositionParameters && n.dispositionParameters.filename) ||
                !!(n.parameters && n.parameters.name);
  if (disp === 'attachment') return 1;
  /* 이름이 붙은 inline 은 사람이 「첨부」로 여긴다 — 단, cid 로 본문에 박힌 것은 뺀다 */
  if (disp === 'inline' && named && !n.id) return 1;
  /* disposition 이 아예 없는 옛 메일 — 본문(text/*) 이 아니고 이름이 있으면 첨부다 */
  if (!disp && named && type.indexOf('text/') !== 0) return 1;
  return sum;
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
function msgRow(msg) {
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
  };
}

/* ── 이번 회차에 어디를 가져올까 ──
   두 방향으로 움직인다.
   ① 새것 — 지난번에 본 마지막 번호(hi) 위쪽. 늘 이것이 먼저다. 대표가 기다리는 것은
      방금 온 메일이다.
   ② 옛것 — 지난번에 본 첫 번호(lo) 아래쪽으로 한 뭉치씩. 몇 회차 지나면 1번까지 닿는다.
      이 방식이라 「모두 동기화」가 한 번에 안 끝나도 **매 회차마다 눈에 보이게** 늘어난다.

   uidNext 는 「다음에 올 메일이 받을 번호」다. 그러니 지금 있는 것 중 가장 큰 번호는
   uidNext-1 이다.
   done 은 옛것 방향이 1번까지 닿았다는 뜻 — 이 폴더는 이제 새것만 보면 된다. */
function backfillWindow(sync, uidNext, chunk) {
  const s = sync || {};
  const next = Math.max(1, Number(uidNext || 1));
  const top = next - 1;                       // 지금 가장 큰 번호
  const size = Math.max(1, Number(chunk || 300));
  const hi = Number(s.hi || 0);               // 지난번까지 본 가장 큰 번호
  const lo = Number(s.lo || 0);               // 지난번까지 본 가장 작은 번호

  const out = { fresh: null, back: null, done: false };
  if (top < 1) { out.done = true; return out; }   // 빈 폴더

  /* 처음이면 — 맨 위에서 한 뭉치. 옛것은 다음 회차부터. */
  if (!hi || !lo) {
    const from = Math.max(1, top - size + 1);
    out.fresh = { from: from, to: top };
    out.done = from <= 1;
    return out;
  }

  if (top > hi) out.fresh = { from: hi + 1, to: top };
  if (lo > 1) {
    const from = Math.max(1, lo - size);
    out.back = { from: from, to: lo - 1 };
    out.done = from <= 1;
  } else {
    out.done = true;
  }
  return out;
}

/* 회차가 끝난 뒤 적어 둘 표시. 번호가 뒤로 가는 일은 없어야 한다 —
   uidValidity 가 바뀌면(서버가 번호를 다시 매겼다) 처음부터 다시 해야 한다. */
function nextSync(sync, seen, uidValidity, done) {
  const s = sync || {};
  const nums = (seen || []).map(Number).filter((n) => n > 0);
  const old = Number(s.uv || 0);
  const uv = Number(uidValidity || 0);
  if (uv && old && uv !== old) {
    /* 번호가 갈렸다 — 지난 표시는 못 믿는다. 이번에 본 것만으로 다시 시작한다. */
    return {
      uv: uv,
      hi: nums.length ? Math.max.apply(null, nums) : 0,
      lo: nums.length ? Math.min.apply(null, nums) : 0,
      done: false,
    };
  }
  const hi = Number(s.hi || 0);
  const lo = Number(s.lo || 0);
  return {
    uv: uv || old || 0,
    hi: nums.length ? Math.max(hi, Math.max.apply(null, nums)) : hi,
    lo: nums.length ? (lo ? Math.min(lo, Math.min.apply(null, nums)) : Math.min.apply(null, nums)) : lo,
    done: !!done,
  };
}

/* 새로 매겨졌으면 지난 목록은 버려야 한다 — 같은 번호가 다른 메일을 가리킨다. */
function uidReset(sync, uidValidity) {
  const old = Number((sync || {}).uv || 0);
  const uv = Number(uidValidity || 0);
  return !!(uv && old && uv !== old);
}

module.exports = {
  safeKey, hash8, slugOf,
  folderKind, folderOrder, isSyncable, folderRecord,
  attCount, oneAddr, addrList, hasFlag, msgRow,
  backfillWindow, nextSync, uidReset,
};
