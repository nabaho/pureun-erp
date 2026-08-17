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
};

const LABELS = {
  total: "전체",
  storage: "사진 창고",
  database: "실시간DB",
  functions: "서버 · 메일",
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

module.exports = { BUDGET_KEYS, LABELS, parseAlert, shouldApply, historyEntry };
