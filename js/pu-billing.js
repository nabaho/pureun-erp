/* 파이어베이스 사용액 보기 — 값 다루는 부분만 (화면)
   실시간DB `billing/current` 에 서버가 적어 둔 금액을, 화면에 그대로 쓸 모양으로
   바꾼다. 여기서는 그리지 않는다 — 그려야 확인되는 코드는 검사를 못 한다.

   ⚠ 이 값은 **어림수**다. 확정 청구액은 월말에 정산된다.
   ⚠ 「남은 금액」은 만들 수 없다. Blaze 는 미리 넣고 까먹는 방식이 아니라
     쓴 만큼 다음 달에 청구되는 후불이라, 구글 쪽에 남은 돈이라는 숫자가 없다.
     그래서 이 파일은 **이번 달 지금까지 쓴 금액**만 다룬다. */
(function (global) {
  'use strict';

  var ROOT = 'billing/current';
  var PARTS = ['storage', 'database', 'functions'];  // 쪼개 보여 줄 항목 (전체는 따로)

  /* 얼마나 지나야 「갱신이 멈춘 것 같다」고 말할까 — 26시간.
     ⚠ 3시간으로 잡았다가 늘렸다. 구글은 **금액이 움직일 때만** 쏘기 때문에
       밤새 아무도 안 쓰면 몇 시간씩 조용한 것이 정상이다. 3시간이면 거의 매일 아침
       거짓 경고가 뜨고, 매일 뜨는 경고는 곧 아무도 안 본다.
       하루를 통째로 넘겨도 소식이 없으면 그때는 진짜 멈춘 것이다. */
  var STALE_MS = 26 * 60 * 60 * 1000;

  /* ⚠ `Number(null)` 은 0 이고 `Number('')` 도 0 이다. 그냥 Number 로 바꾸면
     **없는 금액이 ₩0 으로 둔갑한다** — 그리고 ₩0 은 「안 썼다」로 읽힌다.
     이 화면에서 없는 값과 0 원을 섞는 것이 가장 나쁜 실수라, 여기서 막는다. */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function fmtWon(v) {
    var n = num(v);
    if (n === null) return '—';
    return '₩' + Math.round(n).toLocaleString('ko-KR');
  }

  /* 눈금 대비 얼마나 찼나. 눈금이 없으면 null — 막대를 아예 안 그린다.
     ⚠ 0 을 돌려주면 「하나도 안 썼다」로 그려진다. 없는 것과 0 은 다르다. */
  function ratio(row) {
    if (!row) return null;
    var b = num(row.budget), c = num(row.cost);
    if (b === null || b <= 0 || c === null) return null;
    return c / b;
  }

  function tone(r) {
    if (r === null || r === undefined) return 'none';
    if (r >= 1) return 'over';
    if (r >= 0.8) return 'warn';
    return 'ok';
  }

  function agoText(updatedAt, now) {
    var t = num(updatedAt);
    if (t === null) return '갱신 기록 없음';
    var d = Math.max(0, num(now) - t);
    var m = Math.floor(d / 60000);
    if (m < 1) return '방금 전';
    if (m < 60) return m + '분 전';
    var h = Math.floor(m / 60);
    if (h < 24) return h + '시간 전';
    return Math.floor(h / 24) + '일 전';
  }

  /* 소식이 끊겼나. 끊겼는데 조용히 두면 **옛 금액이 최신인 척** 남는다 —
     이게 이 화면에서 제일 나쁜 상태라, 모를 때는 모른다고 밝힌다. */
  function isStale(updatedAt, now) {
    var t = num(updatedAt);
    if (t === null) return true;
    return (num(now) - t) > STALE_MS;
  }

  /* 이 추세면 월말에 얼마쯤. **참고용이다** — 지금까지 속도가 그대로 간다는 가정이라
     월말에 몰아 쓰면 어긋난다. 달이 막 시작해 잰 시간이 너무 짧으면 아예 안 내놓는다
     (첫날 몇 시간으로 한 달을 점치면 터무니없는 숫자가 나온다). */
  function projectMonthEnd(row, now) {
    if (!row) return null;
    var cost = num(row.cost), start = num(row.intervalStart), t = num(now);
    if (cost === null || start === null || t === null) return null;

    var elapsed = t - start;
    var DAY = 86400000;
    if (elapsed < DAY) return null;           // 하루는 지나야 추세라 부를 수 있다

    var d = new Date(start);
    var days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var whole = days * DAY;
    if (elapsed >= whole) return cost;        // 이미 달을 다 채웠다
    return Math.round(cost / elapsed * whole);
  }

  /* 화면이 쓸 한 덩어리로 묶는다.
     ⚠ 쪼갠 항목을 더한 값이 전체와 같지 않다 — 예산을 안 건 서비스가 남기 때문이다.
       모자란 만큼을 「그 밖」으로 내놓는다. 안 그러면 쪼갠 것을 더해 보신 대표님이
       전체와 안 맞는 것을 발견하시고, 그때부터 이 화면 전체를 못 믿게 된다. */
  function summarize(current, now) {
    var cur = (current && typeof current === 'object') ? current : {};
    var total = cur.total || null;

    var parts = [];
    var sum = 0;
    for (var i = 0; i < PARTS.length; i++) {
      var row = cur[PARTS[i]];
      if (!row || num(row.cost) === null) continue;
      parts.push({ key: PARTS[i], label: row.label || PARTS[i], cost: num(row.cost) });
      sum += num(row.cost);
    }

    var totalCost = total ? num(total.cost) : null;
    if (totalCost !== null && parts.length) {
      var rest = totalCost - sum;
      // 1원 단위 반올림 차이로 「그 밖 3원」이 뜨는 것은 잡음이다.
      if (rest > 1) parts.push({ key: 'etc', label: '그 밖', cost: rest });
    }

    /* ⚠ 눈금은 **구글 예산액이 아니다.**
       구글 예산은 「이 금액을 넘으면 알려 달라」는 알림 방아쇠일 뿐이라 실제로는
       넉넉히 잡아 둔다. 그 숫자를 눈금으로 그리면 대표님은 늘 「2% 썼다」만 보게 된다.
       화면 눈금은 대표님이 따로 정하시는 `billing/limit` 하나뿐이고, 안 정하셨으면
       막대를 안 그린다(대표 결정 2026-08-15: 첫 달은 한 달 지켜보고 정한다). */
    var limit = num(cur.limit);
    var upd = total ? num(total.updatedAt) : null;
    var r = ratio({ cost: totalCost, budget: limit });

    return {
      has: totalCost !== null,
      cost: totalCost,
      budget: limit,
      ratio: r,
      tone: tone(r),
      parts: parts,
      projected: projectMonthEnd(total, now),
      updatedAt: upd,
      ago: agoText(upd, now),
      stale: isStale(upd, now),
    };
  }

  global.PuBilling = {
    ROOT: ROOT,
    PARTS: PARTS,
    STALE_MS: STALE_MS,
    fmtWon: fmtWon,
    ratio: ratio,
    tone: tone,
    agoText: agoText,
    isStale: isStale,
    projectMonthEnd: projectMonthEnd,
    summarize: summarize,
  };
})(typeof window !== 'undefined' ? window : globalThis);
