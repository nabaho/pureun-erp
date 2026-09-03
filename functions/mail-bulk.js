/* 여러 곳에 「한 통씩」 보내기 — 나눠 담는 층
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-15: "한 번에 기업들에게 대량으로(300곳 미만) 보내야 할 때".

   ⚠ 한꺼번에 쏟지 않는다. 다음메일은 대량 발송용 계정이 아니라, 몰아 보내면
     계정이 막힌다. 계정이 막히면 **평소 자료 발송까지 멈춘다** — 그게 가장 나쁘다.
     그래서 받는 곳마다 **예약 한 건씩**을 만들어 시간을 벌려 둔다. 실제 발송은
     이미 돌고 있는 sendScheduledMail 이 맡는다 — 새 발송기를 만들지 않는다.
     ⚠ 그 발송기가 «얼마나 빨리 빼 가는가»는 아래 DRAIN_* 에 적어 둔다 — 예상 시간을
       셈하는 데 그 값이 필요하다. 예전에는 그 속도가 이 주석에만 적혀 있었고
       index.js 가 따로 정하고 있어서, 한쪽만 낡아 예상 시간이 세 배 틀렸다
       (2026-09-02). 지금은 어긋나면 검사가 걸린다 — 아래 DRAIN_* 의 ⚠ 을 볼 것.

   ⚠ 한 통에 한 곳만 넣는다. 그래서
     · 받는 사람들끼리 서로의 주소가 보이지 않고
     · 받는 사람 5명 상한(mail-send.js MAX_TO)을 건드릴 일이 없고
     · 한 곳이 실패해도 나머지는 그대로 나간다. */

'use strict';

/* 한 번에 걸 수 있는 최대 — 대표 지시(300곳 미만)보다 조금 넉넉하게.
   상한이 없으면 실수로 6천 곳을 걸어 계정이 막힌다. */
const MAX_BULK = 400;
/* 통 사이 기본 간격(초). 간격은 «언제 차례가 되는가»만 정한다 — 실제로 빼 가는
   속도는 아래 DRAIN_* 이다. 좁혀도 발송기보다 빨리 나가지는 않는다.
   며칠 돌려 탈이 없으면 줄여도 된다. 늘리는 것은 언제든 안전하다. */
const DEFAULT_SPACING_SEC = 15;
const MIN_SPACING_SEC = 5;
const MAX_SPACING_SEC = 600;

/* ★ 예약 발송기(index.js sendScheduledMail)가 빼 가는 속도를 여기에도 적어 둔다.
     15분마다 20통 = 시간당 80통.

   ⚠ 진짜 값은 index.js 에 있다 — 일정은 `schedule("every 15 minutes")`,
     한 번에 집는 수는 `limitToFirst(20)`. 그것을 여기서 «불러 쓰지 않고» 베껴 두는
     까닭은, 일정을 정하는 자리가 곧 비용을 정하는 자리이고
     tests/rtdb-cost-guards.test.js 가 그 자리를 「너무 자주 깨우지 마라」로 지켜야
     하기 때문이다. 셈을 위해 그 리터럴을 없애면 비용 지킴이가 볼 자리가 사라진다.

   ⚠ 그래서 «어긋남»은 검사가 막는다 — tests/mail-bulk-drain-truth.test.js 가
     index.js 의 두 숫자와 이 두 값을 견준다. 어느 쪽만 고쳐도 걸린다.
     2026-08-23 f315f813 이 index.js 만 15분으로 바꿔 여기가 세 배 틀어졌을 때,
     그 검사가 있었으면 그 자리에서 걸렸다. 바꿀 때는 «세 곳을 함께» 고친다 —
     index.js · 여기 · 화면 두 곳(pu-cards.html BULK_DRAIN_*, js/pu-news-core.js). */
const DRAIN_EVERY_MIN = 15;
const DRAIN_BATCH = 20;

/* 글 안의 {이름}·{회사} 를 그 곳 값으로 바꾼다.
   화면(pu-cards.html mailFill)과 **같은 규칙**이어야 한다 — 미리보기와 실제가 달라지면
   무엇이 나갈지 아무도 모른다. 값이 없으면 빈칸으로 지운다(«{회사}» 가 그대로 나가면 흉하다). */
function fill(tpl, vals) {
  return String(tpl == null ? '' : tpl).replace(/\{([^{}]{1,20})\}/g, function (_, k) {
    const v = (vals || {})[String(k).trim()];
    return (v == null) ? '' : String(v);
  });
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v == null ? '' : v).trim());
}

/* 받는 곳 목록 다듬기 — 주소가 없거나 형식이 틀렸거나 겹치는 것을 걸러낸다.
   ⚠ 겹치는 주소를 안 걸러내면 한 곳이 같은 메일을 두 통 받는다. */
function cleanTargets(list) {
  const out = [];
  const seen = {};
  let bad = 0, dup = 0;
  (Array.isArray(list) ? list : []).forEach(function (t) {
    const o = t && typeof t === 'object' ? t : {};
    const e = String(o.email == null ? '' : o.email).trim().toLowerCase();
    if (!isEmail(e)) { bad++; return; }
    if (seen[e]) { dup++; return; }
    seen[e] = 1;
    out.push({
      email: e,
      name: String(o.name == null ? '' : o.name).slice(0, 60),
      company: String(o.company == null ? '' : o.company).slice(0, 120),
      title: String(o.title == null ? '' : o.title).slice(0, 60),
    });
  });
  return { ok: out, bad: bad, dup: dup };
}

/* 간격을 안전한 범위로 —  0 이나 음수를 넣어 한꺼번에 쏟는 일을 막는다 */
function spacingMs(sec) {
  let s = Number(sec);
  if (!isFinite(s) || s <= 0) s = DEFAULT_SPACING_SEC;
  s = Math.max(MIN_SPACING_SEC, Math.min(MAX_SPACING_SEC, Math.round(s)));
  return s * 1000;
}

/* 걸기 전에 미리 막을 것 — 때가 되어서야 알면 이미 절반이 나갔다 */
function validateBulk(p) {
  const body = p && typeof p === 'object' ? p : {};
  const t = cleanTargets(body.to);
  if (!t.ok.length) return { ok: false, error: '보낼 수 있는 주소가 없습니다.' };
  if (t.ok.length > MAX_BULK) {
    return { ok: false, error: '한 번에 ' + MAX_BULK + '곳까지 보낼 수 있습니다 (지금 ' + t.ok.length + '곳).' };
  }
  const subject = String(body.subject == null ? '' : body.subject).replace(/[\r\n]+/g, ' ').trim();
  if (!subject) return { ok: false, error: '제목이 비어 있습니다.' };
  const text = String(body.body == null ? '' : body.body).trim();
  if (!text) return { ok: false, error: '본문이 비어 있습니다.' };
  const matIds = (Array.isArray(body.matIds) ? body.matIds : [])
    .filter(function (x) { return typeof x === 'string' && x; }).slice(0, 10);
  return {
    ok: true,
    targets: t.ok, skipped: { bad: t.bad, dup: t.dup },
    subject: subject, body: text,
    /* 서식 몫 (대표 지시 2026-08-24). 씻는 일은 보내는 층(mail-send)이 한다 —
       여기서 또 씻으면 두 곳이 서로 다른 규칙을 갖게 된다. */
    html: String(body.html == null ? '' : body.html),
    matIds: matIds,
    gapMs: spacingMs(body.spacingSec),
    /* 보내는 주소 «소망». 조이기는 보낼 때 서버가 한다(보내는주소고르기) —
       화면이 담은 값을 그대로 믿으면 남의 이름으로 보내는 길이 된다. */
    fromWish: String(body.from == null ? '' : body.from).trim(),
  };
}

/* 실제로 자리에 담을 것들을 만든다 — 여기서는 **만들기만** 하고 쓰지 않는다.
   그래야 검사에서 「무엇이 담기는가」를 그대로 들여다볼 수 있다.
   ⚠ 첫 통도 곧바로 보내지 않는다(+1칸). 예약 발송기가 30초 안쪽을 집어 가면
     사람이 「아차」 하고 취소할 틈이 없다. */
function buildQueue(v, now, by, batchId) {
  const t0 = Number(now) || 0;
  return v.targets.map(function (t, i) {
    const vals = { 이름: t.name, 회사: t.company, 직책: t.title,
                   name: t.name, company: t.company, title: t.title,
                   /* ★ 열람·클릭 추적 열쇠 — 편지 몸통의 {추적열쇠} 가 통마다 이 값으로 바뀐다.
                        안 채우면 «모두가 같은 사람»으로 찍혀 누가 열었는지 알 수 없다.
                      ⚠ 파이어베이스 열쇠에 못 쓰는 글자(.#$/[])를 씻는다 —
                        functions/news-track.js 주소열쇠() 와 «같은 잣대»여야 한다.
                        두 곳이 다르면 적는 자리와 세는 자리가 어긋난다. */
                   추적열쇠: String(t.email || '').trim().toLowerCase()
                     .replace(/[.#$/[\]]/g, '_') };
    return {
      at: t0 + (i + 1) * v.gapMs,
      by: String(by || ''),
      madeAt: t0,
      state: 'waiting',
      bulk: String(batchId || ''),
      bulkNo: i + 1,
      bulkOf: v.targets.length,
      /* 15분 뒤 예약 발송기가 보낼 때 «이 통이 어느 주소에서 나갈지»를 알 길은 여기뿐이다 */
      fromWish: v.fromWish || '',
      payload: {
        to: t.email,
        toName: t.name || t.company || '',
        cardCompany: t.company || '',
        subject: fill(v.subject, vals),
        body: fill(v.body, vals),
        /* 서식에도 이름·회사를 채운다 — 평문만 채우면 두 몫이 다른 이름을 부른다 */
        html: v.html ? fill(v.html, vals) : '',
        matIds: v.matIds,
      },
    };
  });
}

/* 보내는 주소를 고른다 — 뉴스레터가 «원본과 같은 주소»에서 나가게.
   대표 지시 2026-09-03: 「뉴스레터 발송시에는 370-6@hanmail.net 주소로 송부되어야 한다」

   ★ hanmail.net 과 daum.net 은 «같은 사서함»이다(다음 별칭). 원본 뉴스레터가 실제로
     hanmail 쪽에서 나갔다 — 거래처가 눈에 익은 주소다.
   ⚠ 보내는 주소는 자료 발송·예약 발송이 함께 쓰는 한 곳에 있다
     (pucards/config/matMail/from). 그래서 «거기를 바꾸지 않고» 뉴스레터만 달리 보낸다.
   ⚠ 화면이 아무 주소나 넣게 두면 남의 이름으로 보내는 길이 된다. 그래서 여기서 조인다 —
     앞부분(사서함 이름)이 로그인 계정과 «같아야» 하고, 도메인은 그 둘만 허용한다.
     어긋나면 «조용히 계정 주소로» 보낸다(막지 않는다 — 뉴스레터가 안 나가는 것이 더 나쁘다). */
var 같은사서함도메인 = ['daum.net', 'hanmail.net'];

function 보내는주소고르기(원하는것, 계정주소) {
  var 계정 = String(계정주소 == null ? '' : 계정주소).trim();
  var 원 = String(원하는것 == null ? '' : 원하는것).trim().toLowerCase();
  if (!원 || !계정) return 계정;

  var a = 원.split('@'), b = 계정.toLowerCase().split('@');
  if (a.length !== 2 || b.length !== 2) return 계정;
  if (a[0] !== b[0]) return 계정;                                  /* 사서함 이름이 다르다 */
  if (같은사서함도메인.indexOf(a[1]) < 0) return 계정;              /* 같은 사서함이 아니다 */
  if (같은사서함도메인.indexOf(b[1]) < 0) return 계정;              /* 계정이 다음 사서함이 아니다 */
  return a[0] + '@' + a[1];
}

/* 언제 다 나가는지 사람 말로 — 이 숫자를 보고 «되돌릴 수 없는» 단추를 누른다.

   ★ 두 가지가 함께 정하고, «늦은 쪽»이 답이다.
     ① 예약 간격 — 마지막 통의 차례가 오는 때        (곳 수 × 간격)
     ② 발송기 속도 — 한 바퀴에 DRAIN_BATCH 통씩      (ceil(곳 수 ÷ 20) × 15분)
   ⚠ 간격만 보면 안 된다. 간격을 좁혀도 발송기보다 빨리 나갈 수는 없다.
     2026-09-02 까지 ①만 보고 있어서 300곳이면 「1시간 15분」이라 해 놓고
     실제로는 3시간 45분이 걸렸다. 자세한 까닭은 tests/mail-bulk.test.js 에. */
function etaText(n, gapMs) {
  const cnt = Math.max(0, Number(n) || 0);
  const bySpacing = Math.round((cnt * (Number(gapMs) || 0)) / 60000);
  const byDrain = Math.ceil(cnt / DRAIN_BATCH) * DRAIN_EVERY_MIN;
  const min = Math.max(1, bySpacing, byDrain);
  if (min < 60) return '약 ' + min + '분';
  const h = Math.floor(min / 60), m = min % 60;
  return '약 ' + h + '시간' + (m ? ' ' + m + '분' : '');
}

module.exports = {
  MAX_BULK, DEFAULT_SPACING_SEC, MIN_SPACING_SEC, MAX_SPACING_SEC,
  DRAIN_EVERY_MIN, DRAIN_BATCH, 같은사서함도메인,
  fill, cleanTargets, spacingMs, validateBulk, buildQueue, etaText, 보내는주소고르기,
};
