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

  /* 쪼갠 칸이 전체보다 얼마나 낡으면 「그 밖」을 못 믿는 값으로 볼까 — 10분.
     구글 예산 알림은 칸마다 따로 오고 20~30분씩 어긋나기도 한다. 전체만 새로 오고
     실시간DB 칸이 낡아 있으면, 실시간DB가 오른 몫이 뺄셈에서 「그 밖」으로 새어
     들어간다 — 2026-08-16 밤 실제로 그랬다(그 밖이 ₩3,725인데 ₩6,379로 보였고,
     대표가 엉뚱한 칸을 의심하셨다). */
  var PART_LAG_MS = 10 * 60 * 1000;

  /* 화면이 쓸 한 덩어리로 묶는다.
     ⚠ 쪼갠 항목을 더한 값이 전체와 같지 않다 — 예산을 안 건 서비스가 남기 때문이다.
       모자란 만큼을 「그 밖」으로 내놓는다. 안 그러면 쪼갠 것을 더해 보신 대표님이
       전체와 안 맞는 것을 발견하시고, 그때부터 이 화면 전체를 못 믿게 된다.
     ⚠ 그런데 그 뺄셈은 **칸들이 같은 시각일 때만** 맞다. 어느 칸이 전체보다
       10분 넘게 낡았으면 「그 밖」에 approx 표시를 얹고, 어느 칸을 기다리는
       중인지(etcNote) 함께 내놓는다 — 화면이 ≈와 안내를 그릴 수 있게. */
  function summarize(current, now) {
    var cur = (current && typeof current === 'object') ? current : {};
    var total = cur.total || null;
    var totalUpd = total ? num(total.updatedAt) : null;

    var parts = [];
    var sum = 0;
    var lagged = [];   // 전체보다 10분 넘게 낡은 칸들의 이름표
    for (var i = 0; i < PARTS.length; i++) {
      var row = cur[PARTS[i]];
      if (!row || num(row.cost) === null) continue;
      var label = row.label || PARTS[i];
      parts.push({ key: PARTS[i], label: label, cost: num(row.cost) });
      sum += num(row.cost);
      var pu = num(row.updatedAt);
      /* ⚠ 금액이 사실상 0원인 칸은 낡아도 의심하지 않는다(2026-08-17 아침 실사례).
         구글은 금액이 움직일 때만 알림을 쏘므로 ₩0 칸은 영영 「낡은」 채다 —
         그걸 매일 「갱신 대기 중」이라 하면 경고가 상시등이 되어 아무도 안 본다.
         0원이 움직이기 시작하면 30분 안에 제 알림이 오고, 그때부터는 잡힌다. */
      if (totalUpd !== null && num(row.cost) >= 100
          && (pu === null || totalUpd - pu > PART_LAG_MS)) lagged.push(label);
    }

    var totalCost = total ? num(total.cost) : null;
    var etcNote = null;
    if (totalCost !== null && parts.length) {
      var rest = totalCost - sum;
      // 1원 단위 반올림 차이로 「그 밖 3원」이 뜨는 것은 잡음이다.
      if (rest > 1) {
        var etc = { key: 'etc', label: '그 밖', cost: rest };
        if (lagged.length) {
          etc.approx = true;
          etcNote = lagged.join('·') + ' 갱신 대기 중 — 그 몫이 「그 밖」에 섞여 보일 수 있습니다';
        }
        parts.push(etc);
      }
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
      etcNote: etcNote,
      projected: projectMonthEnd(total, now),
      updatedAt: upd,
      ago: agoText(upd, now),
      stale: isStale(upd, now),
    };
  }

  /* 금액을 지켜본다 — **읽기만 한다.**
     ⚠ 화면이 `db.ref(...)` 를 직접 부르지 못하게 막혀 있다(2026-07 실데이터 사고 뒤로,
       tests/pu-photos-html.test.js 가 지킨다). 읽기라고 예외를 두면 그 자리가 다시
       열리므로 부르는 길을 여기 하나로 모은다 — 이 파일에는 set·update·remove 가 없다.
     ⚠ 실패 콜백을 반드시 받아 넘긴다. 빠뜨리면 규칙에 막혔을 때 콘솔에 빨간 오류만
       남고 화면은 영영 빈 채로 있는다. */
  function watch(db, onValue, onError) {
    if (!db || typeof db.ref !== 'function') return function () { };
    var ref = db.ref(ROOT);
    var cb = ref.on('value', function (snap) { onValue(snap.val()); },
      function (e) { if (onError) onError(e); });
    return function () { try { ref.off('value', cb); } catch (e) { /* 이미 끊겼다 */ } };
  }

  /* ══ 시간별 기록 (2026-08-17 대표 지시) ═══════════════════════════════
     대표 지시: "몇 시에 체크 시 얼마 그리고 얼마 상승 … 각 항목마다 시간당 얼마씩".

     ★ 왜 «한 시간 칸» 으로 묶나 —
       구글은 「금액이 움직일 때만」 쏜다. 어떤 때는 2분 만에, 어떤 때는 4시간 만에 온다.
       그 간격으로 시간당을 내면 2분짜리 기록에서 «30배로 부풀어» 보이고,
       그 숫자를 보고 놀라게 된다. 한 시간 칸으로 묶으면
       「17시에 3,640원 늘었다」가 곧 「그 시간에 시간당 3,640원」이라 셈이 필요 없다.

     ★ 왜 «0 과 「모른다」를 가르나» —
       쪽지가 없는 시간은 「안 썼다」가 아니라 「구글이 안 쏴서 모른다」다.
       0 으로 적으면 「그 시간엔 공짜였다」로 읽힌다. 이 저장소에서 없는 값을
       0 으로 둔갑시켜 여러 번 당했다(위 num() 이 그것 때문에 있다). */

  // 그 시각이 속한 시간 칸 이름. tz 는 시간대 옮김(분) — 검사는 0 으로 고정해 흔들리지 않게 한다.
  function hourKey(ms, tzMin) {
    var d = new Date(num(ms) + (num(tzMin) || 0) * 60000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
      + '-' + String(d.getUTCDate()).padStart(2, '0') + 'T' + String(d.getUTCHours()).padStart(2, '0');
  }

  /* 항목별 시계열({ts:금액}) → 한 시간 칸별 증가분.
     history: { total:{…}, storage:{…}, database:{…}, functions:{…} } */
  function hourBuckets(history, opts) {
    if (!history || typeof history !== 'object') return [];
    var tz = (opts && num(opts.tz) !== null) ? num(opts.tz) : -new Date().getTimezoneOffset();
    var KEYS = ['total'].concat(PARTS);

    // ① 항목마다 「그 칸의 마지막 값」을 모은다
    var last = {};        // last[key][hour] = 금액
    var hours = {};
    KEYS.forEach(function (k) {
      last[k] = {};
      var series = history[k];
      if (!series || typeof series !== 'object') return;
      Object.keys(series).forEach(function (ts) {
        var v = num(series[ts]);
        if (v === null) return;
        var h = hourKey(ts, tz);
        hours[h] = 1;
        // 같은 칸에 여러 쪽지 → 나중 것이 이긴다 (ts 가 클수록 나중)
        var prev = last[k][h];
        if (!prev || num(ts) >= prev.ts) last[k][h] = { ts: num(ts), v: v };
      });
    });

    var have = Object.keys(hours).sort();
    if (!have.length) return [];

    /* 쪽지가 온 시간만 늘어놓으면 «소식 없던 시간이 화면에서 사라진다».
       그러면 「13시엔 아무 일도 없었나?」를 알 수 없고, 시간당 평균도 부풀어 보인다.
       ★ 처음과 끝 사이의 «모든 시간 칸» 을 채우고, 쪽지 없는 칸은 「모른다」로 남긴다. */
    var order = [];
    (function () {
      var toMs = function (h) { return Date.parse(h.slice(0, 10) + 'T' + h.slice(11) + ':00:00Z'); };
      var a = toMs(have[0]), b = toMs(have[have.length - 1]);
      for (var t = a; t <= b; t += 3600000) order.push(hourKey(t - (num(tz) || 0) * 60000, tz));
    })();

    /* ② 칸마다 「앞서 알던 값」과 견줘 증가분을 낸다.
       ⚠ 앞이 없으면(첫 칸) 증가분을 «모른다» — 0 이 아니다. */
    var seen = {};        // seen[key] = 마지막으로 알던 금액
    var out = [];
    order.forEach(function (h) {
      var row = { hour: h, total: null, cum: null, cumKnown: false, parts: {}, known: {} };
      KEYS.forEach(function (k) {
        var cur = last[k][h];
        if (!cur) { row.known[k] = false; if (k !== 'total') row.parts[k] = null; return; }
        /* 「몇 시에 «얼마»」 — 그 시각의 누적 전체액.
           ⚠ 증가분(row.total)과 «다른 것» 이다. 증가분은 앞 칸을 알아야 나오지만
             누적액은 쪽지 하나로 알 수 있다 — 그래서 «첫 칸에도» 뜬다.
           ⚠ 쪽지 없는 칸은 앞 값을 끌어다 쓰지 않는다. 「그 시각에 그랬다」가 아니라
             「그 뒤로 소식이 없다」일 뿐이고, 실제로는 그 이상일 수 있다. */
        if (k === 'total') { row.cum = cur.v; row.cumKnown = true; }
        var was = seen[k];
        if (was === undefined) { row.known[k] = false; if (k !== 'total') row.parts[k] = null; }
        else {
          var d = cur.v - was;
          row.known[k] = true;
          if (k === 'total') row.total = d; else row.parts[k] = d;
        }
        seen[k] = cur.v;
      });
      /* 「그 밖」 = 전체 − (쪼갠 것 합).
         ⚠ 음수면 0 으로 깎는다 — 낡은 칸 몫이 새어 마이너스로 보이던 일이 있었다
           (2026-08-16 「그 밖 착시」). 마이너스 지출은 사람이 이해할 수 없다. */
      if (row.known.total) {
        var s = 0, anyPart = false;
        PARTS.forEach(function (k) { if (row.known[k]) { s += row.parts[k] || 0; anyPart = true; } });
        row.parts.etc = Math.max(0, row.total - s);
        row.known.etc = anyPart || s === 0;
      } else {
        row.parts.etc = null; row.known.etc = false;
      }
      out.push(row);
    });
    return out;
  }

  /* 항목별 시간당 평균.
     ⚠ 나누는 것은 «아는 칸 수» 다. 소식 없는 칸을 0 으로 치고 나누면
       시간당이 실제보다 «낮게» 나와 안심하게 된다. */
  function hourlyRates(buckets) {
    var res = { total: null, parts: {}, hours: 0 };
    if (!buckets || !buckets.length) return res;
    var KEYS = ['total'].concat(PARTS).concat(['etc']);
    var sum = {}, cnt = {};
    KEYS.forEach(function (k) { sum[k] = 0; cnt[k] = 0; });
    buckets.forEach(function (b) {
      if (!b || !b.known) return;
      KEYS.forEach(function (k) {
        if (!b.known[k]) return;
        var v = (k === 'total') ? b.total : (b.parts || {})[k];
        if (num(v) === null) return;
        sum[k] += num(v); cnt[k]++;
      });
    });
    res.hours = cnt.total;
    res.total = cnt.total ? Math.round(sum.total / cnt.total) : null;
    PARTS.concat(['etc']).forEach(function (k) {
      res.parts[k] = cnt[k] ? Math.round(sum[k] / cnt[k]) : null;
    });
    return res;
  }

  global.PuBilling = {
    ROOT: ROOT,
    HISTORY_ROOT: 'billing/history',
    watch: watch,
    PARTS: PARTS,
    STALE_MS: STALE_MS,
    PART_LAG_MS: PART_LAG_MS,
    fmtWon: fmtWon,
    ratio: ratio,
    tone: tone,
    agoText: agoText,
    isStale: isStale,
    projectMonthEnd: projectMonthEnd,
    summarize: summarize,
    hourKey: hourKey,
    hourBuckets: hourBuckets,
    hourlyRates: hourlyRates,
  };
})(typeof window !== 'undefined' ? window : globalThis);
