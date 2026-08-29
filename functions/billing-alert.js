/* 파이어베이스 사용액 알림 받기 — 값 다루는 부분만 (서버)
   구글 클라우드 「예산(Budget)」이 금액이 바뀔 때마다 Pub/Sub 로 쏘는 쪽지를
   읽어 실시간DB 에 적을 한 줄로 바꾼다. 여기서는 네트워크를 타지 않는다
   (그래야 검사에서 실제 쪽지 모양 그대로 넣어 볼 수 있다).

   ⚠ 왜 예산을 넷으로 나눴나 —
   구글이 쏘는 쪽지에는 **총액 하나뿐**이고 「사진 창고에 얼마, 실시간DB 에 얼마」
   같은 쪼갠 값이 없다. 쪼갠 값을 보려면 서비스별로 예산을 따로 걸어야 하고,
   그러면 예산마다 제 쪽지를 쏜다. 그 쪽지들을 이름으로 갈라 담는다.
   (쪼개기를 포기하면 예산 하나로 끝나지만, 총액만 보면 늘어나도 손을 쓸 수가 없다.) */
"use strict";

// 예산 이름 → 실시간DB 에 담길 자리. 대표님이 만드실 예산 이름과 **글자 그대로** 같아야 한다.
const BUDGET_KEYS = {
  "pu-total": "total",
  "pu-storage": "storage",
  "pu-database": "database",
  "pu-functions": "functions",
  /* AI(제미나이) — 서류 판독과 사진 지우개가 부른다 (2026-08-29 추가).
     ⚠ 예산을 안 걸면 이 몫이 「그 밖」에 섞여 **얼마나 쓰는지 볼 수가 없다.**
       지우개는 «그림을 만드는» 부르기라 판독보다 훨씬 비싸고, 이제 막 켰다. */
  "pu-ai": "ai",
};

const LABELS = {
  total: "전체",
  storage: "사진 창고",
  database: "실시간DB",
  functions: "서버 · 메일",
  ai: "AI 판독·지우개",
};

/* ⚠ `Number(null)` 은 0 이고 `Number("")` 도 0 이다. 그냥 Number 로 바꾸면
   **없는 금액이 0원으로 둔갑해 담기고**, 화면은 그걸 「안 썼다」로 그린다.
   없는 값과 0원을 섞지 않는 것이 이 파일의 핵심이라 여기서 막는다. */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* 쪽지 한 통 → 담을 한 줄.
   못 알아보는 쪽지는 **버린다**. 반쪽짜리를 담으면 화면에 0원이 뜨는데,
   0원은 「안 썼다」로 읽혀서 없는 것보다 나쁘다. */
function parseAlert(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, why: "쪽지가 비었습니다" };

  const name = String(raw.budgetDisplayName || "").trim().toLowerCase();
  const key = BUDGET_KEYS[name];
  if (!key) return { ok: false, why: `모르는 예산 이름입니다: ${name || "(없음)"}` };

  // costAmount 는 0 일 수 있다(달이 막 바뀌었을 때). 0 과 없음을 구분해야 한다.
  const cost = num(raw.costAmount);
  if (cost === null || cost < 0) return { ok: false, why: "금액이 없습니다" };

  const startMs = Date.parse(raw.costIntervalStart || "");
  if (!Number.isFinite(startMs)) return { ok: false, why: "집계 시작일이 없습니다" };

  // budgetAmount 는 눈금일 뿐이다. 없거나 0 이면 눈금 없이 금액만 보여 준다
  // (대표 결정 2026-08-15: 첫 달은 실제 사용액을 모르니 눈금을 안 잡는다).
  const budget = num(raw.budgetAmount);

  return {
    ok: true,
    key,
    row: {
      label: LABELS[key],
      cost,
      budget: budget !== null && budget > 0 ? budget : null,
      currency: String(raw.currencyCode || "KRW"),
      intervalStart: startMs,
      // 임계값을 넘겨야만 붙는다 — 안 넘겼을 때 0 이 아니라 없음이다.
      threshold: num(raw.alertThresholdExceeded),
    },
  };
}

/* 새 쪽지를 담을까, 버릴까.
   ⚠ Pub/Sub 은 **순서를 지켜 주지 않고 같은 쪽지를 두 번 보내기도 한다.**
   그래서 그냥 덮으면 늦게 도착한 옛 쪽지가 최신 금액을 **더 작은 값으로 되돌린다** —
   화면에서 금액이 줄어드는 것처럼 보이고, 아무도 그게 틀렸다는 걸 모른다.

   한 달 안에서 쓴 돈은 줄지 않는다. 그러니
     · 집계 달이 새로 바뀌었으면 → 무조건 담는다 (달이 바뀌면 0 부터 다시 센다)
     · 같은 달인데 금액이 더 작거나 같으면 → 버린다 (늦게 온 옛 쪽지다)
   가 성립한다. */
function shouldApply(prev, next) {
  if (!prev || typeof prev !== "object") return true;

  const prevStart = num(prev.intervalStart);
  if (prevStart === null) return true;

  if (next.intervalStart > prevStart) return true;   // 달이 바뀌었다
  if (next.intervalStart < prevStart) return false;  // 지난달 쪽지가 이제 왔다

  const prevCost = num(prev.cost);
  if (prevCost === null) return true;
  return next.cost > prevCost;
}

/* ── 기록 한 줄 (2026-08-17 대표 지시) ─────────────────────────────────
   대표 지시: "몇 시에 체크 시 얼마 그리고 얼마 상승 … 각 시간별 금액을 표시".
   지금까지는 `billing/current` 에 「이 순간 값」만 덮어써서 지난 값이 안 남았다.
   그래서 알림이 올 때마다 «한 줄» 을 따로 쌓는다.

   ★ 값은 «숫자 하나»(금액)만 적는다. 한 줄이 40바이트도 안 된다 —
     사용액을 보려고 사용액을 늘리면 웃긴다. 눈금(budget)은 current 에 이미 있다.

   ★ 달은 «집계 시작일(intervalStart)» 에서 뽑는다. 도착 시각으로 뽑으면
     월말 자정 무렵 쪽지가 엉뚱한 달에 담기고, 달이 어긋나면 증가분이
     «큰 마이너스» 로 터진다(구글은 달이 바뀌면 0 부터 다시 센다).

   ★ current 는 「더 큰 값만」 받지만(늦게 온 옛 쪽지 방어) 기록은 «그 시각 값 그대로» 다.
     기록은 「그때 얼마였나」이고, 늦게 온 쪽지도 그 시각의 사실이다. */
function historyEntry(parsed, arrivedMs) {
  if (!parsed || !parsed.ok || !parsed.key || !parsed.row) return null;
  const at = num(arrivedMs);
  if (at === null) return null;
  const cost = num(parsed.row.cost);
  if (cost === null) return null;

  const startMs = num(parsed.row.intervalStart);
  if (startMs === null) return null;
  const d = new Date(startMs);
  const ym = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");

  return {
    path: "billing/history/" + ym + "/" + parsed.key + "/" + Math.round(at),
    value: cost,
  };
}

/* ══════ 하루 폭주 판정 (2026-08-29 대표 지시) ══════

   ★ 왜 필요한가 — 2026-08-16 에 백업이 폭주해 **하루에 86,042원**이 나갔는데
     **아무 알림도 없었다.** 지금 걸려 있는 알림은 「총액이 얼마를 넘으면」이라,
     그 금액에 닿을 때쯤이면 이미 다 나간 뒤다. 필요한 것은
     **「하루 증가가 평소의 몇 배면」** 이다. 그래야 그날 안에 잡는다.

   ⚠ 이것은 **막는 장치가 아니라 알리는 장치**다. Blaze 에는 자동 상한이 없어
     무엇도 멈추지 않는다. 빨리 알아채는 것이 유일한 방어다.

   ⚠ 비교할 «평소» 가 없으면 **판정하지 않는다.** 달이 막 바뀌었거나 기록이
     이틀 어치도 안 되는데 「몇 배」라고 하면 그건 거짓말이다.
   ⚠ 작은 금액은 배수가 쉽게 커진다(20원 → 100원도 5배다). 그래서 배수와 함께
     **금액 바닥**을 둔다 — 둘 다 넘어야 폭주다. */

const SPIKE_RATIO = 5;        // 평소의 몇 배부터 폭주로 볼까
const SPIKE_MIN_WON = 3000;   // 그날 늘어난 금액이 이보다 작으면 배수가 커도 잡음이다
const SPIKE_BASE_DAYS = 7;    // 「평소」를 이레로 잡는다
const SPIKE_MIN_BASE = 2;     // 평소가 이틀 어치도 없으면 판정하지 않는다

/* 그 나라 시간(KST)으로 며칠인가 — 서버는 UTC 로 도는데 사람은 한국 날짜로 본다.
   ⚠ UTC 로 자르면 아침 아홉 시 전에 쓴 돈이 «전날»에 붙는다. */
function kstDay(ms) {
  const d = new Date(num(ms) + 9 * 3600000);
  return d.getUTCFullYear() + "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(d.getUTCDate()).padStart(2, "0");
}

/* 기록({시각: 누적금액}) → 날짜별 «그날 늘어난 금액».
   ⚠ 기록은 «누적» 이라 그대로 더하면 안 된다. 날마다 마지막 값을 잡고 그 차를 낸다.
   ⚠ 첫날은 «그 전날 값을 모르므로» 증가분을 낼 수 없다 — 0 이 아니라 «없음» 이다.
     0 으로 두면 「그날은 안 썼다」로 읽혀, 그 다음 날이 통째로 폭주로 잡힌다. */
function dailyIncreases(history) {
  if (!history || typeof history !== "object") return [];
  const lastOfDay = {};
  Object.keys(history).forEach((ts) => {
    const t = num(ts);
    const v = num(history[ts] && history[ts].cost !== undefined ? history[ts].cost : history[ts]);
    if (t === null || v === null) return;
    const day = kstDay(t);
    if (!lastOfDay[day] || t > lastOfDay[day].t) lastOfDay[day] = { t, v };
  });
  const days = Object.keys(lastOfDay).sort();
  const out = [];
  for (let i = 1; i < days.length; i++) {
    const inc = lastOfDay[days[i]].v - lastOfDay[days[i - 1]].v;
    /* 달이 바뀌면 구글은 0 부터 다시 센다 — 그때 나오는 «큰 마이너스» 는 증가가 아니다 */
    if (inc < 0) continue;
    out.push({ day: days[i], inc });
  }
  return out;
}

/* 오늘이 평소보다 몇 배인가. 폭주면 알릴 한 줄, 아니면 null. */
function spikeCheck(history, nowMs) {
  const rows = dailyIncreases(history);
  if (!rows.length) return null;
  const today = kstDay(nowMs);
  const cur = rows[rows.length - 1];
  if (cur.day !== today) return null;          // 오늘 자료가 아직 없다
  /* 「평소」는 오늘 앞의 이레. ⚠ 관문은 **여기 하나뿐**이다 —
     예전에는 위에 `rows.length < 3` 을 하나 더 뒀는데, 그것이 이 줄을 가려
     **죽은 관문**이 됐다(검사를 지워도 안 걸렸다). 짝이 되는 관문 둘을 두면
     하나가 죽고, 죽은 줄은 지켜 주는 것이 없으면서 지켜 주는 척한다. */
  const base = rows.slice(-1 - SPIKE_BASE_DAYS, -1);
  if (base.length < SPIKE_MIN_BASE) return null;
  const avg = base.reduce((s, r) => s + r.inc, 0) / base.length;
  if (avg <= 0) return null;                   // 견줄 평소가 없다
  const ratio = cur.inc / avg;
  if (cur.inc < SPIKE_MIN_WON || ratio < SPIKE_RATIO) return null;
  return {
    day: today,
    inc: Math.round(cur.inc),
    avg: Math.round(avg),
    ratio: Math.round(ratio * 10) / 10,
    baseDays: base.length,
    at: Math.round(num(nowMs)),
  };
}

/* 어느 칸에서 늘고 있나 — 폭주일 때만 부른다(평소에는 셈할 이유가 없다).
   가장 많이 는 칸 하나만 돌려준다. 「실시간DB 에서 늘고 있습니다」 한 줄이면 충분하다. */
function spikeCulprit(historyByKey, nowMs) {
  const today = kstDay(nowMs);
  let best = null;
  Object.keys(historyByKey || {}).forEach((k) => {
    if (k === "total") return;
    const rows = dailyIncreases(historyByKey[k]);
    const cur = rows.length ? rows[rows.length - 1] : null;
    if (!cur || cur.day !== today) return;
    if (!best || cur.inc > best.inc) best = { key: k, label: LABELS[k] || k, inc: Math.round(cur.inc) };
  });
  return best;
}

module.exports = {
  BUDGET_KEYS, LABELS, parseAlert, shouldApply, historyEntry,
  SPIKE_RATIO, SPIKE_MIN_WON, SPIKE_BASE_DAYS, SPIKE_MIN_BASE,
  kstDay, dailyIncreases, spikeCheck, spikeCulprit,
};
