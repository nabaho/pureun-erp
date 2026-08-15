/* 여러 곳에 「한 통씩」 보내기 — 나눠 담는 층
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-15: "한 번에 기업들에게 대량으로(300곳 미만) 보내야 할 때".

   ⚠ 한꺼번에 쏟지 않는다. 다음메일은 대량 발송용 계정이 아니라, 몰아 보내면
     계정이 막힌다. 계정이 막히면 **평소 자료 발송까지 멈춘다** — 그게 가장 나쁘다.
     그래서 받는 곳마다 **예약 한 건씩**을 만들어 시간을 벌려 둔다. 실제 발송은
     이미 돌고 있는 sendScheduledMail(5분마다 20통)이 맡는다 — 새 발송기를 만들지 않는다.

   ⚠ 한 통에 한 곳만 넣는다. 그래서
     · 받는 사람들끼리 서로의 주소가 보이지 않고
     · 받는 사람 5명 상한(mail-send.js MAX_TO)을 건드릴 일이 없고
     · 한 곳이 실패해도 나머지는 그대로 나간다. */

'use strict';

/* 한 번에 걸 수 있는 최대 — 대표 지시(300곳 미만)보다 조금 넉넉하게.
   상한이 없으면 실수로 6천 곳을 걸어 계정이 막힌다. */
const MAX_BULK = 400;
/* 통 사이 기본 간격(초). 15초 ≈ 시간당 240통 — 지금 예약 발송기가 빼 가는 속도와 같다.
   며칠 돌려 탈이 없으면 줄여도 된다. 늘리는 것은 언제든 안전하다. */
const DEFAULT_SPACING_SEC = 15;
const MIN_SPACING_SEC = 5;
const MAX_SPACING_SEC = 600;

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
    subject: subject, body: text, matIds: matIds,
    gapMs: spacingMs(body.spacingSec),
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
                   name: t.name, company: t.company, title: t.title };
    return {
      at: t0 + (i + 1) * v.gapMs,
      by: String(by || ''),
      madeAt: t0,
      state: 'waiting',
      bulk: String(batchId || ''),
      bulkNo: i + 1,
      bulkOf: v.targets.length,
      payload: {
        to: t.email,
        toName: t.name || t.company || '',
        cardCompany: t.company || '',
        subject: fill(v.subject, vals),
        body: fill(v.body, vals),
        matIds: v.matIds,
      },
    };
  });
}

/* 언제 다 나가는지 사람 말로 — 「22분」을 보고 눌러야 한다 */
function etaText(n, gapMs) {
  const min = Math.max(1, Math.round((n * gapMs) / 60000));
  if (min < 60) return '약 ' + min + '분';
  const h = Math.floor(min / 60), m = min % 60;
  return '약 ' + h + '시간' + (m ? ' ' + m + '분' : '');
}

module.exports = {
  MAX_BULK, DEFAULT_SPACING_SEC, MIN_SPACING_SEC, MAX_SPACING_SEC,
  fill, cleanTargets, spacingMs, validateBulk, buildQueue, etaText,
};
