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

/* ══════════════════════════════════════════════════════════════════════════
   📬 열람 확인 — 재는 데 쓰는 것 (대표 결정 2026-09-06)
   ══════════════════════════════════════════════════════════════════════════
   ⚠ 적는 자리는 mailbox 밑이다 — 서버만 쓰고 직원은 읽기만 하는 자리다.
   ⚠ 이 파일에는 «상대의 IP·기기»를 읽는 줄이 없다. 여는 함수에도 없다. 그것이 약속이다. */
const TRACK_ROOT = 'mailbox/track/opens';
const PIXEL_URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/mailOpenPixel';

/* ── 끄고 켜는 스위치 (대표 지시 2026-09-07) ─────────────────────────────────
   ★ 왜 «서버»가 읽는가 — 그림을 붙이는 것이 서버다. 화면에만 스위치를 두면
     대표께서 끄셔도 그림은 그대로 붙는다. 끈 것처럼 보이는데 안 꺼진 것이
     제일 나쁘다.
   ★ 왜 config/matMail «안»인가 — 이미 있는 자리다. 새 칸을 만들면 콘솔 규칙을
     한 줄 더 얹어야 하고, 화면도 한 번 더 읽어야 한다. 여기는 화면이 이미
     읽고 있고(loadMaterials) 서버도 이미 읽고 있다(perUser).
   ⚠ 아무것도 안 적혀 있으면 «켠 것»이다 — 2026-09-06 부터 켠 채로 돌고 있었다.
     안 적혔다고 꺼 버리면 어제까지 되던 것이 오늘 조용히 멈춘다.
   ⚠ 못 읽으면 «안 붙인다»(아래 try 가 삼킨다). 열람 확인은 있으면 좋은 것이고,
     메일은 그대로 나간다. */
const MT_PATH = CARDS_ROOT + '/config/matMail/track';
const MT_DEFAULT = true;
async function mailTrackOn(db) {
  const v = (await db.ref(MT_PATH).once('value')).val();
  return (v === null || v === undefined) ? MT_DEFAULT : v !== false;
}

function nowMs() { return Date.now(); }
/* 못 알아맞히게 — 짧으면 남이 눌러 셈을 부풀릴 수 있다 */
function trackToken() {
  return require('node:crypto').randomBytes(16).toString('hex');
}
/* 보낸메일함 «줄»과 이어 붙일 열쇠 — 받는이 + 분 + 제목.
   ⚠ 화면(pu-cards.html mbTrackFp)과 «글자까지 같아야» 한다. 한쪽만 고치면 확인 시각이
     영영 안 붙는다 — 그런데 오류도 안 난다(그냥 늘 빈칸이다). 검사가 둘을 견준다.
   ⚠ 초는 안 본다. 우리가 보낸 시각과 다음이 적는 시각이 몇 초씩 어긋난다.
   ⚠ 실시간DB 열쇠에 못 쓰는 글자를 턴다. */
function trackFp(to, ms, subject) {
  const t = String(to || '').trim().toLowerCase();
  const m = Math.floor(Number(ms || 0) / 60000);
  const s = String(subject || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return (t + '|' + m + '|' + s).replace(/[.$#[\]/]/g, '_').slice(0, 300);
}
/* 보이지 않는 1×1 — 본문 «맨 끝»에 붙인다 */
function trackPixel(tok) {
  return '<img src="' + PIXEL_URL + '?t=' + encodeURIComponent(tok)
    + '" width="1" height="1" alt="" style="width:1px;height:1px;border:0;display:block">';
}

/* ══════════════════════════════════════════════════════════════════════════
   보내는 주소를 보고 «어느 우체국»으로 갈지 고른다 (대표 지시 2026-09-05)
   ══════════════════════════════════════════════════════════════════════════
   대표 지시: 「fairrunlabor.com 이것으로 모두 진행하자 … 뉴스레터」

   지금까지는 다음메일 한 곳뿐이었다. 그런데 뉴스레터를 푸른 도메인
   (`@fairrunlabor.com`)으로 보내려면 다음메일로는 «안 된다» —
   다음은 자기 손님 주소로만 보내 준다. 남의 도메인을 달면 거절하거나 고쳐 버린다.

   ★ 왜 Resend 가 아니라 구글인가 (2026-09-05 재 봄)
     Resend 무료는 하루 100통인데 뉴스레터 받는 곳이 114 곳이다 — 한 회차가
     다 안 나간다. 유료는 월 $20.
     그런데 대표님은 `fairrun01@fairrunlabor.com` 구글 워크스페이스를 이미
     쓰고 계시고, 그쪽은 하루 2,000통이며 «돈이 더 안 든다».

   ⚠ 구글은 아이디가 «주소 전체»여야 한다. 다음은 앞부분(370-6)으로도 되지만
     구글에 로컬파트만 주면 그 자리에서 535 가 난다 — 그래서 우체국마다
     아이디 만드는 법을 따로 들고 있다.
   ⚠ 여기 없는 도메인은 «다음»으로 간다. 지금 돌고 있는 자료 발송
     (370-6@daum.net)이 조용히 길을 잃으면 안 된다. */
const 우체국들 = [
  {
    이름: '구글',
    도메인: ['fairrunlabor.com'],   /* 우리 구글 워크스페이스 도메인 */
    host: 'smtp.gmail.com', port: 465,
    아이디는주소전체: true,
    열쇠이름: 'GOOGLE_MAIL_PASSWORD',
    /* 구글 앱 비밀번호는 «띄어쓰기 넣어» 보여 준다(abcd efgh ijkl mnop).
       그대로 붙여넣으면 535 가 난다 — 여기서 걷어 준다. */
    열쇠다듬기: (p) => String(p || '').replace(/\s+/g, ''),
    안내: '구글 앱 비밀번호(GOOGLE_MAIL_PASSWORD)가 아직 없습니다.\n'
        + 'myaccount.google.com → 보안 → 앱 비밀번호 에서 만든 뒤\n'
        + 'firebase functions:secrets:set GOOGLE_MAIL_PASSWORD 로 넣어 주세요.'
  },
  {
    이름: '다음',
    도메인: ['daum.net', 'hanmail.net', 'kakao.com'],
    host: DAUM_HOST, port: DAUM_PORT,
    아이디는주소전체: false,
    열쇠이름: 'DAUM_MAIL_PASSWORD',
    열쇠다듬기: (p) => String(p || ''),
    안내: '메일 비밀번호가 아직 없습니다.\nDAUM_MAIL_PASSWORD(앱 비밀번호)를 넣고 다시 배포하세요.'
  }
];

/* ★ 「아직 안 넣었다」는 표 (2026-09-05)
   ═══════════════════════════════════════════════════════════════════════════
   파이어베이스는 «값이 없는» 비밀값을 달고 함수를 올리지 못한다 —
   GOOGLE_MAIL_PASSWORD 를 선언만 해 두면 그날부터 메일 함수 배포가 통째로
   막힌다. 남의 세션이 급한 것을 고치려다 여기서 걸리면 애먼 곳을 뒤진다.

   그래서 자리만 잡아 두는 «표»를 넣어 둔다. 이것이 들어 있으면 «없는 것»으로
   본다 — 아니면 이 표로 로그인하려다 535 를 받고, 사람은 「비밀번호가 틀렸나」를
   의심하며 엉뚱한 곳을 헤맨다.
   ⚠ 진짜 열쇠가 들어오면 이 표는 덮어써져 저절로 사라진다. */
const 아직안넣은표 = 'AAA-NOT-SET-YET';
function 아직안넣음(열쇠) {
  return String(열쇠 || '').trim() === 아직안넣은표;
}

function 도메인만(주소) {
  const m = /@([^@>\s]+)\s*>?\s*$/.exec(String(주소 || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/* 어느 우체국인가 — 못 알아보면 «다음»(지금 돌고 있는 길)으로 둔다 */
function 우체국고르기(from) {
  const d = 도메인만(from);
  for (const p of 우체국들) {
    if (d && p.도메인.indexOf(d) >= 0) return p;
  }
  return 우체국들[우체국들.length - 1];
}

/* 보내는 사람 표시 이름. 주소만 나가면 스팸으로 걸리기 쉽다. */
function fromLine(u) { return u ? '푸른노무법인 <' + u + '>' : ''; }

/* 접속 아이디 후보 — @ 앞부분 먼저, 그다음 주소 전체.
   다음메일 설정 화면이 「아이디: 370-6」이라고 알려 주지만, 주소 전체로도 되는
   계정이 있어 둘 다 해 본다(자격 문제일 때만 다음 것으로 넘어간다). */
function loginIds(from, envId, 우체국) {
  /* ⚠ 구글은 «주소 전체»만 받는다. 앞부분(fairrun01)만 주면 그 자리에서 535 다.
       여러 아이디를 돌려 보는 짓도 하지 않는다 — 구글은 틀린 아이디로 몇 번
       두드리면 계정을 잠근다. 한 번만, 맞는 것으로 두드린다. */
  const p = 우체국 || 우체국고르기(from);
  if (p && p.아이디는주소전체) {
    const full = String(from || '').trim();
    const m = /<([^>]+)>/.exec(full);          /* 「푸른노무법인 <a@b>」 꼴도 받는다 */
    return [(m ? m[1] : full).trim()].filter(Boolean);
  }
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
/* 크기만 먼저 묻는다 — 내려받기 «전»에 재려면 이 걸음이 따로 있어야 한다.
   ⚠ 20MB 짜리 열 개를 다 끌어온 뒤에 「너무 큽니다」 하면 이미 늦다.
     이 함수는 512MB 그릇에서 돈다. */
/* ★ 첨부를 꺼낼 수 있는 «자리»인가 — 창고가 둘이다 (대표 결정 2026-09-06 「첨부도 붙인다」)
   ═══════════════════════════════════════════════════════════════════════════
   ① pucards/mailout/{uid}/…  내 PC 에서 올린 임시 파일 — 제 자리만
   ② ilabor/{sid}/…           노무사회에서 서버가 받아 둔 자료
                              (ilaborPull 이 «기본 창고»에 담는다 — 다른 통이다)
   ⚠ 자리를 그대로 믿지 않는다. 안 막으면 자리만 바꿔 «남의 파일»을 첨부로 빼낼 수 있다.
   ⚠ 여기 없는 자리는 «건너뛴다». 새 자리를 열 때는 이 함수를 고친다 — 한 곳이다. */
function 첨부자리허용(path, uid) {
  const p = String(path || '');
  if (!p || p.indexOf('..') >= 0) return null;
  if (uid && mailOutPathOk(p, uid)) return { bucket: CARDS_BUCKET };
  /* 노무사회 자료 — 서버만 담고(규칙 .write:false), 총괄관리자만 보낸다 */
  if (/^ilabor\/\d+\/[^/]+$/.test(p)) return { bucket: '' };   /* '' = 기본 창고 */
  return null;
}

function 첨부통(deps, 통이름) {
  const st = deps.getStorage();
  return 통이름 ? st.bucket(통이름) : st.bucket();
}

async function statMailOut(deps, path, 통이름) {
  const file = 첨부통(deps, 통이름 === undefined ? CARDS_BUCKET : 통이름).file(String(path));
  const [meta] = await file.getMetadata();
  return { file: file, size: Number((meta && meta.size) || 0) };
}
async function readMailOut(deps, path) {
  const got = await statMailOut(deps, path);
  if (got.size > MAILOUT_MAX) throw new Error('첨부가 너무 큽니다');
  const [buf] = await got.file.download();
  return buf;
}

/* ── 묵은 임시 파일 치우기 (2026-09-03) ──
   ★ 왜 «실패하자마자»가 아니라 «묵은 것»인가 —
     보내기가 실패하면 대표는 고쳐서 다시 누른다. 그때 화면은 «같은 자리»를 그대로
     다시 보낸다(pu-cards.html addLocalFiles 는 붙일 때 한 번만 올리고 path 를 들고 있다).
     그러니 실패한 자리에서 곧바로 치우면 **다시 보낼 때 첨부가 조용히 빠진다.**
     하루가 지난 것만 치우면 다시 보내기는 안전하고 버려진 것은 사라진다.
   ⚠ 한 번에 치우는 수를 못 박는다 — 많이 쌓인 사람에게서 배달이 늦어지면 안 된다. */
const MAILOUT_STALE_MS = 24 * 60 * 60 * 1000;
const MAILOUT_SWEEP_MAX = 20;
async function sweepStaleMailOut(deps, uid, now) {
  if (!deps || !uid) return 0;
  const t0 = Number(now) || Date.now();
  let n = 0;
  try {
    const [files] = await deps.getStorage().bucket(CARDS_BUCKET)
      .getFiles({ prefix: 'pucards/mailout/' + uid + '/' });
    for (const f of (files || [])) {
      if (n >= MAILOUT_SWEEP_MAX) break;
      const m = (f && f.metadata) || {};
      const at = Date.parse(m.timeCreated || m.updated || '');
      /* 언제 만든 것인지 모르면 «건드리지 않는다» — 지금 쓰고 있는 것일 수 있다 */
      if (!Number.isFinite(at) || (t0 - at) < MAILOUT_STALE_MS) continue;
      try { await f.delete(); n++; } catch (e) {
        console.warn('mailout 묵은 것 못 치움:', f.name, String((e && e.message) || e));
      }
    }
  } catch (e) {
    console.warn('mailout 묵은 것 훑기 실패:', String((e && e.message) || e));
  }
  return n;
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
  /* ★ 여기까지 붙은 바이트. 창고에서 꺼낼 때 «내려받기 전»에 이 값으로 미리 잰다.
     ⚠ 2026-09-03 이전에는 창고 첨부에 bytes 를 안 달아, mail-send 의 합계 한도가
       0 으로 보여 통째로 없는 것과 같았다(30MB 두 개가 그대로 통과했다). */
  let total = 0;
  attachments.forEach(function (a) { total += Number((a && a.bytes) || 0); });
  let tooBig = 0;           /* 넘었으면 «넘긴 합계» — 부르는 쪽이 그대로 알린다 */
  for (const f of extras) {
    if (!f || typeof f !== 'object') continue;
    let att = null;
    if (f.path) {
      if (!deps) { console.warn('창고를 읽을 길이 없다 — 건너뛴다'); continue; }
      /* 창고 길 — 자리가 «꺼내도 되는 자리»인지 먼저 본다(첨부자리허용 머리글 참고) */
      const 허 = 첨부자리허용(f.path, uid);
      if (!허) {
        console.warn('첨부: 꺼낼 수 없는 자리:', String(f.path));
        continue;
      }
      try {
        const info = await statMailOut(deps, f.path, 허.bucket);
        /* 한 개 한도 · 합계 한도 — 둘 다 «내려받기 전»에 본다.
           ⚠ 여기서 조용히 건너뛰면 「첨부가 빠진 채로 메일이 나간다」가 된다.
             그래서 넘으면 멈추고 «왜 못 보내는지» 알린다. */
        if (info.size > MAILOUT_MAX || total + info.size > MS.MAX_TOTAL_BYTES) {
          tooBig = total + info.size;
          break;
        }
        const [buf] = await info.file.download();
        att = { filename: String(f.name || '첨부'), content: buf, bytes: buf.length };
        /* ⚠⚠ «치울 것»에 넣는 자리다 — 보낸 뒤 이 자리의 파일을 «지운다».
             내 PC 에서 올린 임시 파일(mailout)만 치워야 한다.
             노무사회 자료(ilabor)를 여기 넣으면 한 번 보내는 순간 원본이 사라지고,
             편지 속 «내려받기» 단추도 받는 분 손에서 404 가 된다.
             ★ 보관해 둔 자료는 «임시 파일이 아니다». */
        if (허.bucket === CARDS_BUCKET) used.push(String(f.path));
      } catch (e) {
        console.warn('mailout 읽기 실패:', String(f.path), String((e && e.message) || e));
        continue;
      }
    } else {
      att = MS.toAttachment({ fileName: f.name }, f.dataUrl);   /* 예전 길 */
    }
    if (!att) continue;
    total += Number(att.bytes || 0);
    attachments.push(att);
    names.push(String(f.name || '첨부'));
  }
  return {
    attachments, names, extras, used, bytes: total, tooBig,
    wanted: matIds.length,
    missing: matIds.length - found,
    noneFound: !!(matIds.length && !found),
  };
}

/* 실제 발송 + 기록.
   돌려주는 것: { ok:true, ... } 또는 { ok:false, status, error }

   ⚠ 여기는 «껍데기»다. 실제 일은 deliverOnce 가 하고, 여기서는 어떤 길로 끝나든
     묵은 임시 파일을 치운다. 나가는 길이 다섯인데(주소 없음·비밀번호 없음·자료 못 찾음·
     첨부 너무 큼·메일 서버가 안 받음) 성공한 길에만 치우는 줄이 있어, 실패하면
     창고에 영영 남았다(2026-09-03 실측). */
async function deliver(opts) {
  try {
    return await deliverOnce(opts);
  } finally {
    /* ⚠ 배달 결과를 «절대» 바꾸지 않는다 — 안에서 다 삼킨다(sweepStaleMailOut) */
    try { await sweepStaleMailOut(opts && opts.deps, opts && opts.uid, Date.now()); }
    catch (_) { /* 치우기가 배달을 막지 않는다 */ }
  }
}

async function deliverOnce(opts) {
  /* ⚠ deps·uid 는 «창고 첨부»에만 쓴다(2026-08-31). 안 넘어오면 창고 길은 조용히
     건너뛰고 예전 길(dataUrl)만 붙는다 — 부르는 곳을 하나 빠뜨려도 메일은 나간다. */
  const { db, body, from, pass, envId, byEmail, deps, uid } = opts;
  if (!from) {
    return { ok: false, status: 500,
      error: '보내는 주소가 비어 있습니다.\n기업정보함 → 자료함 → ✉️ 메일 본문에서 「보내는 주소」를 넣어 주세요.' };
  }
  if (!pass || 아직안넣음(pass)) {
    /* ⚠ 우체국이 둘이므로 «어느 열쇠»가 없는지 말해 준다.
         「메일 비밀번호가 없습니다」 한 줄만 주면 다음메일 열쇠를 다시 넣어 보다가
         시간을 버린다 — 정작 없는 것은 구글 것인데. */
    return { ok: false, status: 500, error: 우체국고르기(from).안내 };
  }

  const got = await collectAttachments(db, body, deps, uid);
  if (got.noneFound) {
    return { ok: false, status: 400, error: '붙일 자료를 찾지 못했습니다. 자료함에서 파일을 다시 올려 주세요.' };
  }
  /* 창고에서 꺼내다 한도를 넘었다 — 다 끌어오기 «전»에 멈춘 것이다.
     ⚠ 조용히 빼고 보내지 않는다. 첨부가 빠진 채 나가면 받는 쪽은 그걸 모른다. */
  if (got.tooBig) return { ok: false, status: 400, error: MS.sizeError(got.tooBig) };

  const v = MS.validateSend({
    to: body.to, cc: body.cc, bcc: body.bcc,
    subject: body.subject, body: body.body,
    /* ★ 서식 몫 (대표 지시 2026-08-24). 이 줄을 빼면 화면에서 꾸민 것이 조용히 사라져
       도구줄이 다시 «가짜»가 된다 — 그것이 이번에 고친 문제였다. */
    html: body.html,
    attachments: got.attachments,
  });
  if (!v.ok) return { ok: false, status: 400, error: v.error };

  /* ⚠ 검사가 «가짜 발송기»를 꽂을 자리. 없으면 진짜를 부른다.
     이 자리가 없으면 「자격 오류가 나면 어떻게 되는가」를 돌려 볼 길이 아예 없다 —
     실제로 그래서 되풀이 발송(2026-09-03)을 아무도 못 잡고 있었다.
     ⚠ 검사 기기에는 nodemailer 가 없을 수도 있다. 꽂아 주면 부르지 않는다. */
  let nodemailer = opts.nodemailer || null;
  if (!nodemailer) {
    try { nodemailer = require('nodemailer'); }
    catch (e) { return { ok: false, status: 500, error: '메일 도구를 불러오지 못했습니다: ' + String(e.message || e) }; }
  }

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

  /* ══════════════════════════════════════════════════════════════════════
     📬 열람 확인 — 상대가 «언제 열었나» (대표 결정 2026-09-06)
     ══════════════════════════════════════════════════════════════════════
     "보낸메일함에 수신도 동시에 볼 수 있게 만들어 달라. 내가 보낸 시간과 상대방이
      보고 확인한 시간이 분리 안 되고 같이 보면 관리가 편하다"

     ★ 다음메일의 수신확인 값은 «우리 쪽으로 안 온다» — 다음메일 웹 화면에만 있는
       기능이라 메일 규약(IMAP·POP3)으로는 전달되지 않는다. 그래서 우리가 따로 잰다.
     ★ 재는 법 — 본문 끝에 «보이지 않는 1×1 그림» 한 장을 넣는다. 상대가 메일을 열어
       그 그림을 부르면 그 시각을 적는다. 대표께서 두 길 가운데 이쪽을 고르셨다
       (다른 하나는 「읽음 확인 요청」 — 상대가 수락해야 오는 방식).

     ⚠★ 적는 것은 «시각과 횟수»뿐이다. 상대의 IP·기기·위치는 «일부러 안 적는다» —
       셀 필요가 없고, 남겨 두면 그 자체가 다른 문제가 된다. 여는 함수도 그 값을
       읽지 않는다(functions/index.js mailOpenPixel).
     ⚠ 「안 열었다」는 «안 열었다는 뜻이 아니다». 지메일·네이버가 그림을 대신 받아 두면
       열지 않아도 찍히고, 그림을 막아 두면 열어도 안 찍힌다. 화면에 그 말을 적어 둔다.
     ⚠ 서식(html)이 없는 편지에는 «안 넣는다» — 넣으려고 평문을 서식으로 바꾸면
       받는 쪽 화면이 통째로 달라진다. 그것은 이 일이 건드릴 자리가 아니다.
     ⚠ 무슨 일이 나도 «메일은 나간다». 열람 확인 하나 때문에 발송이 멈추면 안 된다
       (바로 위 서명 그림과 같은 약속). */
  let trackTok = '';
  try {
    if (signHtml && body.track !== false && v.to.length && await mailTrackOn(db)) {
      trackTok = trackToken();
      const fp = trackFp(v.to[0], nowMs(), v.subject);
      await db.ref(TRACK_ROOT + '/' + trackTok).set({
        fp: fp, at: nowMs(), n: 0,
        to: String(v.to[0] || '').slice(0, 160),
        s: String(v.subject || '').slice(0, 160),
      });
      signHtml += trackPixel(trackTok);
    }
  } catch (e) {
    console.warn('mailTrack', (e && e.message) || e);   /* 못 달아도 메일은 나간다 */
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

  /* ★ done — «이미 나간» 통 수. 이것이 있어야 다시 할 때 앞의 것을 또 보내지 않는다.
     ⚠ 2026-09-03 실측: 「한명씩 발송」 3명 중 두 번째에서 자격 오류가 나자,
       다음 아이디로 batches 를 «처음부터» 다시 돌아 앞의 두 명이 편지를 두 번 받았다
       (실제로 나간 통수 5, 그런데 앱은 「3통 보냈다」로 알렸다).
       주석은 그 위험을 적어 두었는데 막는 것은 자격 오류가 «아닐» 때뿐이었다. */
  let lastErr = null, usedId = '', done = 0;
  const 우체국 = 우체국고르기(from);
  const 열쇠 = 우체국.열쇠다듬기(pass);
  for (const id of loginIds(from, envId, 우체국)) {
    try {
      const tx = nodemailer.createTransport({
        host: 우체국.host, port: 우체국.port, secure: true,
        // 기다리는 시간을 못 박는다. 안 박으면 대답 없는 서버에 하염없이 매달린다.
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 90000,
        auth: { user: id, pass: 열쇠 },
      });
      /* 이미 나간 것 다음부터 이어서 보낸다 — 처음부터 다시 돌지 않는다 */
      for (let i = done; i < batches.length; i++) { await tx.sendMail(batches[i]); done++; }
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
    let error = errorHint(lastErr);
    /* ⚠ 몇 통은 이미 나갔다는 것을 «반드시» 알린다. 안 알리면 대표가 그대로 다시
       누르고, 그분들은 같은 편지를 두 번 받는다. */
    if (done > 0) {
      error += '\n\n⚠ ' + batches.length + '통 가운데 ' + done + '통은 이미 나갔습니다.'
             + '\n그대로 다시 보내면 그분들이 두 번 받습니다 — 남은 곳만 골라 보내 주세요.';
    }
    return { ok: false, status: 502, error: error, sent: done };
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
  /* 검사가 밖에서 견줄 수 있게 내놓는다 — 안 내놓으면 「묵은 것만 치우는가」를
     글자로밖에 못 보고, 글자로 보는 검사는 이빨이 없다. */
  statMailOut, sweepStaleMailOut, MAILOUT_STALE_MS, MAILOUT_SWEEP_MAX,
  /* 📬 열람 확인 — 화면과 «같은 열쇠»를 쓰는지 검사가 견준다 */
  trackFp, trackPixel, trackToken, TRACK_ROOT, PIXEL_URL,
  /* 스위치도 내놓는다 — 화면이 쓰는 자리와 «같은 길»인지 검사가 견준다 */
  mailTrackOn, MT_PATH, MT_DEFAULT,
  /* 우체국 고르기도 내놓는다 — 부르는 쪽(index.js)이 «어느 열쇠»를 줘야 하는지
     알아야 하고, 검사도 실제로 골라 보게 해야 이빨이 생긴다. */
  우체국들, 우체국고르기, 도메인만, 아직안넣음, 아직안넣은표,
  첨부자리허용,
};
