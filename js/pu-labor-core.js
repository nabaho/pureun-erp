/* ══════════════════════════════════════════════════════════════════════
   노동법 계산 코어 (pu-labor-core.js)  — 급여 아웃소싱 엔진의 법률 두뇌
   ──────────────────────────────────────────────────────────────────────
   무엇인가: 근태 → 법정수당 → 급여 → 연차·휴가 → 퇴직금·퇴직연금까지
   근로기준법·퇴직급여보장법 규칙을 **순수 함수**로만 담은 층이다.

   왜 순수 함수인가: 화면(DOM)·서버(Firebase)를 모르기 때문에 노트북에서
   `node tests/labor-core.test.js` 로 **혼자 검산**할 수 있다. 급여는 법적
   책임 행위라 "화면에서 눌러 봤더니 맞더라"로는 못 믿는다.

   사업장 110곳이 제각각이므로 **모든 기준은 policy(설정 카드)로 주입**한다.
   코어에 사업장 이름이 등장하면 그 순간 유지보수가 무너진다 — 담당자는
   코드가 아니라 설정 카드만 고친다(설계 원칙).

   법 근거(주석에 남긴다 — 몇 년 뒤 "왜 이 숫자냐"에 답해야 한다):
     근기법 50조   1주 40시간·1일 8시간
     근기법 53조   연장근로 1주 12시간 한도
     근기법 55조   주휴일(1주 소정근로일 개근 → 유급휴일) ※5인 미만도 적용
     근기법 56조   연장·야간 50% 가산, 휴일 8h이내 50%·8h초과 100% 가산
                   ※5인 미만 사업장은 적용 제외
     근기법 60조   연차(1년 80%↑ 출근 15일, 3년↑부터 2년마다 1일 가산·한도 25일,
                   1년 미만 1개월 개근당 1일) ※5인 미만 적용 제외
     근기법 61조   연차사용촉진(6개월 전 1차, 2개월 전 2차)
     근기법 2조    평균임금 = 산정 사유 발생일 이전 3개월 임금총액 ÷ 총일수
                   (평균임금 < 통상임금이면 통상임금을 평균임금으로 한다)
     퇴직급여법 8조 계속근로 1년 이상 → 30일분 평균임금 × (재직일수/365)
     퇴직급여법 20조 DC형 부담금 = 연간 임금총액의 1/12 이상
   ══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── 기본 설정(사업장 설정 카드가 덮어쓴다) ──
     여기 값은 "가장 흔한 사업장"이고 정답이 아니다. 카드에 값이 있으면
     반드시 카드가 이긴다. */
  var DEFAULT_POLICY = {
    weeklyContractHours: 40,   // 1주 소정근로시간
    dailyContractHours: 8,     // 1일 소정근로시간
    workDaysPerWeek: 5,        // 1주 소정근로일
    monthlyStdHours: 209,      // 월 소정근로시간(주40h + 주휴 = 209h 관행)
    fiveOrMore: true,          // 상시 5인 이상? (가산수당·연차 적용 여부가 갈린다)
    nightStart: 22,            // 야간근로 시작(시)
    nightEnd: 6,               // 야간근로 끝(시)
    weeklyOvertimeCap: 12,     // 연장근로 주 한도(근기법 53조)
    annualBase: 15,            // 1년 이상 기본 연차일수
    annualCap: 25,             // 연차 한도
    annualUnder1Cap: 11,       // 1년 미만 최대 발생(개월 개근당 1일)
    annualBasis: 'hire',       // 'hire'=입사일 기준 · 'fiscal'=회계연도 기준
    fiscalStartMonth: 1,       // 회계연도 시작월
    rounding: 'floor',         // 원 단위 단수처리: floor·ceil·round (사업장마다 다름 — 실측 확인)
    pensionType: 'NONE',       // 'DC'·'DB'·'NONE'
    holidayPaidWeekly: true    // 주휴 유급 여부
  };

  function policyOf(p) {
    var out = {}, k;
    for (k in DEFAULT_POLICY) if (Object.prototype.hasOwnProperty.call(DEFAULT_POLICY, k)) out[k] = DEFAULT_POLICY[k];
    if (p) for (k in p) if (Object.prototype.hasOwnProperty.call(p, k) && p[k] != null) out[k] = p[k];
    return out;
  }

  /* ── 숫자·단수처리 ──
     ⚠ 사업장 엑셀 실측에서 절사/올림/반올림이 전원 불일치했다(33명 중 절사22·올림19·반올림28).
     그래서 단수처리는 코어가 정하지 않고 **사업장 설정**으로 받는다. */
  function num(v) {
    if (v == null || v === '') return 0;
    var n = Number(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : 0;
  }
  function roundBy(v, mode) {
    if (!isFinite(v)) return 0;
    if (mode === 'ceil') return Math.ceil(v);
    if (mode === 'round') return Math.round(v);
    return Math.floor(v);           // 기본 절사
  }
  /* 10원 절사 — 지방소득세 실측 규칙(31명 전원 일치) */
  function floor10(v) { return Math.floor(num(v) / 10) * 10; }

  /* ── 날짜 유틸 (문자열 'YYYY-MM-DD' 기준 · 시간대 사고를 피한다) ──
     ⚠ new Date('2026-03-01') 은 UTC 로 읽혀 한국에서 하루 밀린다.
     그래서 날짜 계산은 **문자열을 쪼개** UTC 로 못 박고 쓴다. */
  function ymd(s) {
    if (s instanceof Date) {
      return [s.getFullYear(), s.getMonth() + 1, s.getDate()];
    }
    var m = String(s || '').trim().match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  function toUTC(s) {
    var a = ymd(s);
    if (!a) return null;
    return Date.UTC(a[0], a[1] - 1, a[2]);
  }
  function fmt(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  var DAY = 86400000;

  /* 두 날짜 사이 일수(양끝 포함) — 재직일수·평균임금 기간에 쓴다 */
  function daysInclusive(from, to) {
    var a = toUTC(from), b = toUTC(to);
    if (a == null || b == null) return 0;
    return Math.floor((b - a) / DAY) + 1;
  }
  /* 요일: 0=일 … 6=토 */
  function dow(s) {
    var t = toUTC(s);
    return t == null ? -1 : new Date(t).getUTCDay();
  }
  /* 그 주의 월요일 (주 단위 연장·주휴 판정의 기준) */
  function weekStart(s) {
    var t = toUTC(s);
    if (t == null) return null;
    var d = new Date(t).getUTCDay();          // 0=일
    var back = (d === 0 ? 6 : d - 1);         // 월요일까지 되감기
    return fmt(t - back * DAY);
  }

  /* ── 통상임금 시급 ──
     통상임금 = 소정근로에 대해 정기·일률·고정적으로 지급되는 임금.
     시급 = 월 통상임금 ÷ 월 소정근로시간(209h 관행).
     ⚠ 209 는 법에 적힌 숫자가 아니라 주40h+주휴를 월로 환산한 관행값이다.
       단시간·격일제는 policy.monthlyStdHours 를 반드시 따로 준다. */
  function hourlyOrdinary(monthlyOrdinaryPay, policy) {
    var P = policyOf(policy);
    var h = num(P.monthlyStdHours);
    if (h <= 0) return 0;
    return num(monthlyOrdinaryPay) / h;
  }

  /* 월 소정근로시간 자동 산출 — 주 소정근로시간에서 만든다.
     (주 소정 + 주휴 8h 상당) × (365/7/12).  주40h → 208.6 ≈ 209 */
  function monthlyStdHoursFrom(weeklyHours, policy) {
    var P = policyOf(policy);
    var w = num(weeklyHours || P.weeklyContractHours);
    var weeklyPaid = w + weeklyHolidayHours(w, P);      // 주휴 유급시간 포함
    return Math.round(weeklyPaid * 365 / 7 / 12 * 10) / 10;
  }

  /* 주휴 유급시간 — 주 15시간 미만은 주휴 없음(근기법 18조3항).
     단시간은 통상근로자에 비례: (주 소정근로시간 / 40) × 8 */
  function weeklyHolidayHours(weeklyHours, policy) {
    var P = policyOf(policy);
    var w = num(weeklyHours);
    if (w < 15) return 0;                       // 초단시간 → 주휴·연차 없음
    if (!P.holidayPaidWeekly) return 0;
    var full = num(P.weeklyContractHours) || 40;
    var daily = num(P.dailyContractHours) || 8;
    if (w >= full) return daily;
    return Math.round((w / full) * daily * 100) / 100;
  }


  /* ══════════════════════════════════════════════════════════════════
     A. 근태 집계 — 출퇴근 기록 → 법이 세는 시간
     ══════════════════════════════════════════════════════════════════
     들어오는 하루 기록(record):
       { date:'2026-03-02', in:'09:00', out:'19:30', breakMin:60,
         type:'work'|'holiday'|'annual'|'half'|'absent'|'paid'|'unpaid',
         breakNightMin:0, note:'' }
     type 뜻: work=근로 · holiday=휴일근로 · annual=연차 · half=반차
              absent=결근 · paid=유급휴가 · unpaid=무급휴가·휴직 */

  function hm(v) {                     // 'HH:MM' → 분. 'HH:MM:SS'·'9:5' 도 받는다
    var m = String(v == null ? '' : v).trim().match(/^(\d{1,2})\D(\d{1,2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  /* 야간근로 겹침(분) — 22:00~06:00. 자정을 넘긴 근무도 맞게 센다.
     원리: 출근~퇴근 구간을 분 단위 절대선(당일 0시=0)에 놓고,
     야간대 [22:00~30:00) = 22시~다음날 6시 구간과 겹치는 길이를 잰다.
     퇴근이 다음날 오전이면 그 다음 야간대(46:00~54:00)도 함께 본다. */
  function nightMinutes(inMin, outMin, policy) {
    var P = policyOf(policy);
    var ns = num(P.nightStart) * 60, ne = num(P.nightEnd) * 60;   // 22*60, 6*60
    if (inMin == null || outMin == null) return 0;
    var end = outMin <= inMin ? outMin + 1440 : outMin;           // 철야 보정
    var total = 0, base;
    for (base = -1440; base <= 2880; base += 1440) {              // 전날·당일·다음날 야간대
      var a = base + ns, b = base + 1440 + ne;                    // 22:00 ~ (다음날)06:00
      var lo = Math.max(inMin, a), hi = Math.min(end, b);
      if (hi > lo) total += (hi - lo);
    }
    return total;
  }

  /* 하루 실근로시간(시간 단위) — 휴게 제외 */
  function dayWorkedHours(rec) {
    var i = hm(rec && rec.in), o = hm(rec && rec.out);
    if (i == null || o == null) {
      return num(rec && rec.hours);        // 시각이 없으면 hours 를 그대로 믿는다(사업장 엑셀엔 흔하다)
    }
    var end = o <= i ? o + 1440 : o;
    var mins = end - i - num(rec.breakMin);
    return Math.max(0, mins) / 60;
  }

  var LEAVE_TYPES = { annual: 1, half: 0.5, paid: 1, unpaid: 0, absent: 0 };

  /* 월 근태 집계.
     holidays = ['2026-03-01', …] 공휴일·약정휴일. 주휴일(기본 일요일)은 자동. */
  function summarizeAttendance(records, opt) {
    opt = opt || {};
    var P = policyOf(opt.policy);
    var holi = {};
    (opt.holidays || []).forEach(function (d) { var k = ymd(d); if (k) holi[fmt(toUTC(d))] = 1; });
    var weeklyOffDow = (opt.weeklyOffDow == null) ? 0 : Number(opt.weeklyOffDow);   // 0=일요일

    var byWeek = {};       // 주 단위(월~일)로 모은다 — 연장·주휴 판정 기준
    var sum = {
      실근로: 0, 소정내: 0, 연장: 0, 야간: 0, 휴일8이내: 0, 휴일8초과: 0,
      근로일수: 0, 결근일수: 0, 연차사용: 0, 유급휴가일수: 0, 무급휴가일수: 0, 휴일근로일수: 0
    };

    (records || []).forEach(function (r) {
      if (!r || !r.date) return;
      var key = fmt(toUTC(r.date));
      if (!key) return;
      var t = r.type || 'work';
      var wk = weekStart(key);
      if (!byWeek[wk]) byWeek[wk] = { 주시작: wk, 실근로: 0, 일연장: 0, 소정근로일: 0, 개근: true, 결근: 0, 휴일근로: 0 };
      var W = byWeek[wk];

      // 휴가·결근은 시간이 아니라 일수로 센다
      if (t === 'annual') { sum.연차사용 += 1; return; }
      if (t === 'half') { sum.연차사용 += 0.5; }
      if (t === 'absent') { sum.결근일수 += 1; W.결근 += 1; W.개근 = false; return; }
      if (t === 'paid') { sum.유급휴가일수 += 1; return; }
      if (t === 'unpaid') { sum.무급휴가일수 += 1; W.개근 = false; return; }

      var worked = dayWorkedHours(r);
      if (worked <= 0) return;
      sum.실근로 += worked;

      var isHoliday = (t === 'holiday') || holi[key] || (dow(key) === weeklyOffDow);
      if (isHoliday) {
        /* 휴일근로(근기법 56조2항): 8시간 이내 50% 가산, 8시간 초과분 100% 가산.
           ⚠ 휴일근로시간은 연장근로 계산에 다시 넣지 않는다(중복 가산 금지). */
        var in8 = Math.min(worked, num(P.dailyContractHours));
        sum.휴일8이내 += in8;
        sum.휴일8초과 += Math.max(0, worked - in8);
        sum.휴일근로일수 += 1;
        W.휴일근로 += worked;
      } else {
        sum.근로일수 += 1;
        W.소정근로일 += 1;
        W.실근로 += worked;
        var over = Math.max(0, worked - num(P.dailyContractHours));   // 1일 8h 초과 = 연장
        W.일연장 += over;
      }

      // 야간가산(근기법 56조3항) — 연장·휴일과 별도로 50% 더 붙는다
      var i = hm(r.in), o = hm(r.out);
      if (i != null && o != null) {
        var nm = nightMinutes(i, o, P) - num(r.breakNightMin);
        if (nm > 0) sum.야간 += nm / 60;
      } else if (r.nightHours != null) {
        sum.야간 += num(r.nightHours);
      }
    });

    /* 주 단위 마무리 — 1주 40시간 초과분도 연장이다.
       ⚠ 이미 1일 8h 초과로 잡은 연장을 빼고 나서 40h 와 견준다(중복 금지). */
    var weeks = [];
    Object.keys(byWeek).sort().forEach(function (k) {
      var W = byWeek[k];
      var 소정내 = Math.max(0, W.실근로 - W.일연장);
      var 주연장추가 = Math.max(0, 소정내 - num(P.weeklyContractHours));
      W.주연장추가 = 주연장추가;
      W.연장 = W.일연장 + 주연장추가;
      W.소정내 = 소정내 - 주연장추가;
      /* 주휴(근기법 55조): 1주 소정근로일을 개근하면 유급휴일 1일.
         결근이 있거나 소정근로시간이 주 15h 미만이면 없다. */
      W.주휴시간 = (W.개근 && W.소정내 > 0) ? weeklyHolidayHours(Math.min(W.소정내, num(P.weeklyContractHours)), P) : 0;
      /* 연장 한도(근기법 53조) 위반 표시 — 막지 않고 알린다(확정은 사람) */
      W.연장초과 = W.연장 > num(P.weeklyOvertimeCap);
      sum.연장 += W.연장;
      sum.소정내 += W.소정내;
      weeks.push(W);
    });

    var 주휴시간 = weeks.reduce(function (a, w) { return a + num(w.주휴시간); }, 0);
    return {
      합계: sum, 주별: weeks, 주휴시간: 주휴시간,
      주휴발생주수: weeks.filter(function (w) { return num(w.주휴시간) > 0; }).length,
      연장한도초과주: weeks.filter(function (w) { return w.연장초과; }).map(function (w) { return w.주시작; })
    };
  }


  /* ══════════════════════════════════════════════════════════════════
     B. 법정수당 — 근기법 56조 가산
     ══════════════════════════════════════════════════════════════════
     ⚠ 상시 5인 미만 사업장은 가산수당(56조)이 **적용 제외**다. 이때 연장·야간·
       휴일근로도 가산 없이 1.0배(실근로에 대한 임금만) 지급한다. 주휴(55조)는
       5인 미만에도 적용된다 — 이 갈림을 코어가 스스로 판단해선 안 되고
       policy.fiveOrMore 로 받는다(상시 근로자 수 판정은 노무사 몫). */

  var MUL = {
    연장: 1.5,        // 통상임금의 50% 가산 → 1.5배
    야간: 0.5,        // 가산분만(실근로 임금은 연장/소정에서 이미 계산)
    휴일8이내: 1.5,
    휴일8초과: 2.0
  };

  /* 법정수당 한 벌 계산.
     att = summarizeAttendance() 결과 · hourly = 통상임금 시급
     payType: 'monthly'(월급제) · 'hourly'(시급제) · 'daily'(일급제)
       ⚠ 월급제는 월급에 소정근로·주휴가 이미 들어 있다. 그래서 주휴수당을
         또 주면 이중지급이다. 시급·일급제만 주휴를 따로 얹는다. */
  function statutoryAllowances(att, hourly, opt) {
    opt = opt || {};
    var P = policyOf(opt.policy);
    var h = num(hourly);
    var A = (att && att.합계) || {};
    var five = !!P.fiveOrMore;
    var payType = opt.payType || 'monthly';
    var r = function (v) { return roundBy(v, P.rounding); };

    var 연장배 = five ? MUL.연장 : 1.0;
    var 야간배 = five ? MUL.야간 : 0.0;
    var 휴일내배 = five ? MUL.휴일8이내 : 1.0;
    var 휴일초배 = five ? MUL.휴일8초과 : 1.0;

    var 연장수당 = r(h * num(A.연장) * 연장배);
    var 야간수당 = r(h * num(A.야간) * 야간배);
    var 휴일수당 = r(h * num(A.휴일8이내) * 휴일내배 + h * num(A.휴일8초과) * 휴일초배);
    var 주휴수당 = (payType === 'monthly') ? 0 : r(h * num(att && att.주휴시간));

    return {
      시급: Math.round(h * 100) / 100,
      연장수당: 연장수당, 야간수당: 야간수당, 휴일수당: 휴일수당, 주휴수당: 주휴수당,
      법정수당합계: 연장수당 + 야간수당 + 휴일수당 + 주휴수당,
      근거: {
        연장: num(A.연장) + 'h × ' + 연장배 + '배',
        야간: num(A.야간) + 'h × ' + 야간배 + '배(가산분)',
        휴일: num(A.휴일8이내) + 'h×' + 휴일내배 + ' + ' + num(A.휴일8초과) + 'h×' + 휴일초배,
        주휴: (payType === 'monthly') ? '월급에 포함(별도 미지급)' : num(att && att.주휴시간) + 'h',
        가산적용: five ? '5인 이상 — 가산 적용' : '5인 미만 — 가산 미적용(근기법 56조 제외)'
      }
    };
  }

  /* 포괄임금제(고정 연장수당) 차액 검증.
     실무에서 가장 자주 터지는 임금체불이다 — 고정으로 준 연장수당이 실제
     법정 연장수당보다 적으면 **차액을 더 줘야 한다**(약정이 법을 못 이긴다).
     반대로 많으면 그대로 두고 알리지 않는다(근로자에게 유리). */
  function checkFixedOT(fixedPaid, statutory) {
    var paid = num(fixedPaid);
    var due = num(statutory && statutory.법정수당합계);
    var 부족 = Math.max(0, due - paid);
    return {
      고정지급: paid, 법정필요: due, 부족액: 부족,
      판정: 부족 > 0 ? 'short' : 'ok',
      메시지: 부족 > 0
        ? '고정 연장수당이 법정 금액보다 ' + 부족.toLocaleString() + '원 부족 — 차액 지급 필요(임금체불 위험)'
        : '고정 연장수당이 법정 금액 이상 — 추가 지급 없음'
    };
  }

  /* ── 최저임금 위반 검증 (최저임금법) ──
     비교 대상 = 최저임금 산입 임금 ÷ 소정근로시간(+주휴시간).
     ⚠ 연장·야간·휴일 가산수당은 최저임금 산입에서 제외한다 — 넣으면
       위반인데 통과로 보인다(실제 감독에서 가장 흔한 오판).
     ⚠ 상여·복리후생비의 산입 범위는 연도별로 달라 policy 로 받는다. */
  function checkMinWage(o) {
    o = o || {};
    var P = policyOf(o.policy);
    var 산입임금 = num(o.산입임금);                       // 기본급 + 산입되는 고정수당
    var 시간 = num(o.소정근로시간) + num(o.주휴시간);      // 유급으로 인정되는 시간
    var 최저 = num(o.minWageHourly);
    if (시간 <= 0 || 최저 <= 0) return { 판정: 'unknown', 메시지: '소정근로시간 또는 최저임금 값이 없어 검증 불가' };
    var 환산시급 = 산입임금 / 시간;
    var 미달 = 환산시급 < 최저;
    return {
      환산시급: Math.round(환산시급),
      최저임금: 최저,
      판정: 미달 ? 'violation' : 'ok',
      부족액: 미달 ? roundBy((최저 - 환산시급) * 시간, 'ceil') : 0,
      메시지: 미달
        ? '최저임금 미달 — 환산시급 ' + Math.round(환산시급).toLocaleString() + '원 < ' + 최저.toLocaleString() + '원'
        : '최저임금 충족 (환산시급 ' + Math.round(환산시급).toLocaleString() + '원)'
    };
  }


  /* ══════════════════════════════════════════════════════════════════
     C. 연차유급휴가 — 근기법 60조 · 61조
     ══════════════════════════════════════════════════════════════════ */

  /* 근속 만년수(입사일 기준) — 3년·5년 가산 판정에 쓴다 */
  function fullYearsBetween(hireDate, asOf) {
    var a = ymd(hireDate), b = ymd(asOf);
    if (!a || !b) return 0;
    var y = b[0] - a[0];
    if (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2])) y -= 1;
    return Math.max(0, y);
  }
  /* 근속 만개월수 — 1년 미만 월단위 연차에 쓴다 */
  function fullMonthsBetween(hireDate, asOf) {
    var a = ymd(hireDate), b = ymd(asOf);
    if (!a || !b) return 0;
    var m = (b[0] - a[0]) * 12 + (b[1] - a[1]);
    if (b[2] < a[2]) m -= 1;
    return Math.max(0, m);
  }

  /* 연차 발생일수 (근기법 60조).
     opt = { hireDate, asOf, policy, attendanceRate(0~1), perfectMonths }
       (1) 1년 미만 → 1개월 개근당 1일, 한도 11일
       (2) 1년 이상 + 출근율 80% 이상 → 기본 15일
       (3) 출근율 80% 미만 → 개근한 월수만큼 1일 (60조 2항)
       (4) 계속근로 3년 이상 → 최초 1년 초과 매 2년마다 1일 가산, 한도 25일
     주의: 5인 미만 사업장은 연차가 없다(60조 적용 제외). 상시 근로자 수
           판정은 노무사 몫이라 policy.fiveOrMore 로 받는다. */
  function accrueAnnual(opt) {
    opt = opt || {};
    var P = policyOf(opt.policy);
    if (!P.fiveOrMore) {
      return { 발생일수: 0, 가산: 0, 구분: 'exempt',
        근거: '5인 미만 사업장 — 연차 미발생(근기법 60조 적용 제외)' };
    }
    var asOf = opt.asOf || opt.leaveDate;
    var years = fullYearsBetween(opt.hireDate, asOf);
    var months = fullMonthsBetween(opt.hireDate, asOf);
    var rate = (opt.attendanceRate == null) ? 1 : num(opt.attendanceRate);

    if (years < 1) {
      var perfect = (opt.perfectMonths == null) ? months : num(opt.perfectMonths);
      var d1 = Math.min(perfect, num(P.annualUnder1Cap));
      return { 발생일수: d1, 가산: 0, 구분: 'under1',
        근거: '1년 미만 — 1개월 개근당 1일 (개근 ' + perfect + '개월, 한도 ' + P.annualUnder1Cap + '일)' };
    }
    if (rate < 0.8) {
      var perfect2 = (opt.perfectMonths == null) ? 0 : num(opt.perfectMonths);
      return { 발생일수: Math.min(perfect2, num(P.annualBase)), 가산: 0, 구분: 'lowRate',
        근거: '출근율 ' + Math.round(rate * 100) + '% (80% 미만) — 개근 ' + perfect2 + '개월만큼 발생(근기법 60조 2항)' };
    }
    var bonus = Math.floor((years - 1) / 2);
    var total = Math.min(num(P.annualBase) + bonus, num(P.annualCap));
    return { 발생일수: total, 가산: bonus, 구분: 'over1', 근속년수: years,
      근거: years + '년차 — 기본 ' + P.annualBase + '일 + 가산 ' + bonus + '일 (한도 ' + P.annualCap + '일)' };
  }

  /* 회계연도 기준 첫해 비례 발생 — 첫해를 회계연도로 끊는 사업장용.
     비례 = 기본일수 × (입사일~회계연도말 일수 / 365)  ※고용노동부 행정해석 관행 */
  function accrueAnnualFiscalFirstYear(hireDate, policy) {
    var P = policyOf(policy);
    var a = ymd(hireDate);
    if (!a) return { 발생일수: 0, 근거: '입사일 없음' };
    var fs = num(P.fiscalStartMonth) || 1;
    var endYear = (a[1] >= fs) ? a[0] + 1 : a[0];
    var end = fmt(toUTC(endYear + '-' + pad2(fs) + '-01') - DAY);
    var d = daysInclusive(hireDate, end);
    var days = Math.round(num(P.annualBase) * d / 365 * 10) / 10;
    return { 발생일수: days, 기간말: end,
      근거: '회계연도 기준 첫해 비례 — ' + P.annualBase + '일 × ' + d + '/365' };
  }

  /* 연차 대장 — 발생·이월·사용·잔여. 이월 정책은 사업장마다 다르다. */
  function annualLedger(o) {
    o = o || {};
    var 발생 = num(o.발생일수), 사용 = num(o.사용일수), 이월 = num(o.이월일수);
    var 총한도 = 발생 + 이월;
    var 잔여 = 총한도 - 사용;
    return {
      발생일수: 발생, 이월일수: 이월, 사용일수: 사용, 총한도: 총한도,
      잔여일수: Math.round(잔여 * 100) / 100,
      초과사용: 잔여 < 0 ? Math.round(-잔여 * 100) / 100 : 0,
      경고: 잔여 < 0 ? '초과 사용 ' + Math.round(-잔여 * 10) / 10 + '일 — 급여 공제 또는 무급 처리 검토' : ''
    };
  }

  /* 연차 미사용수당 = 1일 통상임금 × 미사용일수.
     주의: 사용촉진을 적법하게 이행했으면 미사용 연차는 소멸하고 수당 지급
           의무가 없다(근기법 61조). 그래서 촉진 이행 여부를 함께 받는다. */
  function annualUnusedPay(o) {
    o = o || {};
    var P = policyOf(o.policy);
    var days = Math.max(0, num(o.미사용일수));
    var 일당 = num(o.시급) * num(P.dailyContractHours);
    if (o.촉진적법 === true) {
      return { 금액: 0, 일수: days, 지급의무: false,
        근거: '사용촉진 적법 이행 — 미사용 연차 소멸, 수당 지급의무 없음(근기법 61조)' };
    }
    return {
      금액: roundBy(일당 * days, P.rounding), 일수: days, 지급의무: days > 0,
      일당: roundBy(일당, P.rounding),
      근거: '미사용 ' + days + '일 × 1일 통상임금(' + roundBy(일당, P.rounding).toLocaleString() + '원)'
        + (o.촉진적법 === false ? ' — 촉진 미이행이라 수당 지급 의무 있음' : '')
    };
  }

  /* 연차사용촉진 일정(근기법 61조) — 언제 무엇을 서면으로 보내야 하는가.
     1년 이상: 소멸 6개월 전 1차(사용시기 지정 요구) → 근로자 10일 내 통보
               → 미통보 시 소멸 2개월 전 2차(사용자가 시기 지정 통보)
     1년 미만: 소멸 3개월 전 1차 → 소멸 1개월 전 2차
     주의: 1차·2차를 모두 서면으로 이행해야 소멸한다. 하나라도 빠지면
           수당 지급 의무가 그대로 살아난다 — 그래서 기한을 못 박아 알린다. */
  function promotionSchedule(expireDate, kind) {
    var e = toUTC(expireDate);
    if (e == null) return null;
    var under1 = (kind === 'under1');
    var first = under1 ? 3 : 6, second = under1 ? 1 : 2;
    /* 달을 되감을 때 그 달에 없는 날짜(예: 12/31 의 6개월 전 = 6/31)는
       다음 달로 밀려 버린다. 촉진 기한이 하루 밀리면 소멸 요건이 깨질 수 있어
       그 달의 마지막 날로 맞춘다. */
    var minus = function (months) {
      var d = new Date(e);
      var y = d.getUTCFullYear(), mo = d.getUTCMonth() - months, day = d.getUTCDate();
      var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      return fmt(Date.UTC(y, mo, Math.min(day, last)));
    };
    return {
      소멸일: fmt(e), 구분: under1 ? '1년 미만 연차' : '1년 이상 연차',
      '1차촉진기한': minus(first),
      근로자통보기한: '1차 촉진일로부터 10일 내',
      '2차촉진기한': minus(second),
      요건: '서면 통보 필수 — 1차·2차 모두 이행해야 미사용 연차가 소멸(하나라도 빠지면 수당 지급 의무 유지)'
    };
  }

  /* ── 법정휴가·휴직 종류표 ──
     급여 반영 방식이 서로 달라 한 곳에 모은다. paid=유급, wageBase=임금 산정 기초 */
  var LEAVE_KINDS = [
    { key: 'annual', label: '연차유급휴가', paid: true, wageBase: '통상임금', law: '근기법 60조' },
    { key: 'comp', label: '보상휴가', paid: true, wageBase: '통상임금', law: '근기법 57조',
      note: '연장·야간·휴일 근로시간을 가산 포함으로 환산해 휴가로 준다' },
    { key: 'maternity', label: '출산전후휴가', paid: true, days: 90, daysMulti: 120,
      wageBase: '통상임금(최초 60일)+고용보험', law: '근기법 74조',
      note: '다태아 120일. 출산 후 45일(다태아 60일) 이상 확보 필수' },
    { key: 'spouse', label: '배우자 출산휴가', paid: true, days: 20, wageBase: '통상임금',
      law: '남녀고용평등법 18조의2' },
    { key: 'miscarriage', label: '유산·사산휴가', paid: true, wageBase: '통상임금',
      law: '근기법 74조 3항', note: '임신기간에 따라 5~90일' },
    { key: 'childcare', label: '육아휴직', paid: false, wageBase: '고용보험 육아휴직급여',
      law: '남녀고용평등법 19조', note: '자녀 1명당 최대 1년(부모 각각)' },
    { key: 'childtime', label: '육아기 근로시간 단축', paid: false, wageBase: '고용보험',
      law: '남녀고용평등법 19조의2' },
    { key: 'family', label: '가족돌봄휴가', paid: false, days: 10, law: '남녀고용평등법 22조의2' },
    { key: 'menstrual', label: '생리휴가', paid: false, days: 1, law: '근기법 73조',
      note: '월 1일 무급(청구 시)' },
    { key: 'fertility', label: '난임치료휴가', paid: true, days: 3, law: '남녀고용평등법 18조의3',
      note: '연 3일(최초 2일 유급)' },
    { key: 'event', label: '경조사휴가', paid: true, wageBase: '약정', law: '약정(취업규칙)',
      note: '법정 아님 — 취업규칙·단체협약을 따른다' },
    { key: 'sick', label: '병가', paid: false, wageBase: '약정', law: '약정',
      note: '법정 아님(업무상 재해는 산재보험)' }
  ];
  function leaveKind(key) {
    for (var i = 0; i < LEAVE_KINDS.length; i++) if (LEAVE_KINDS[i].key === key) return LEAVE_KINDS[i];
    return null;
  }

  /* 보상휴가 환산(근기법 57조) — 가산 포함 시간으로 환산해야 한다.
     예: 연장 3.5h → 3.5 × 1.5 = 5.25h 의 휴가 */
  function compLeaveHours(att, policy) {
    var P = policyOf(policy);
    var A = (att && att.합계) || {};
    var five = !!P.fiveOrMore;
    var h = num(A.연장) * (five ? MUL.연장 : 1)
          + num(A.야간) * (five ? MUL.야간 : 0)
          + num(A.휴일8이내) * (five ? MUL.휴일8이내 : 1)
          + num(A.휴일8초과) * (five ? MUL.휴일8초과 : 1);
    return {
      휴가시간: Math.round(h * 100) / 100,
      휴가일수: Math.round(h / (num(P.dailyContractHours) || 8) * 100) / 100,
      근거: '연장·야간·휴일 근로를 가산 포함으로 환산(근기법 57조)'
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     D. 퇴직금 · 퇴직연금 — 퇴직급여보장법
     ══════════════════════════════════════════════════════════════════ */

  /* 평균임금(근기법 2조 1항 6호)
       = 산정사유 발생일 이전 3개월간 임금총액 ÷ 그 기간의 총일수
     산입: 상여금은 1년 지급액 × 3/12, 연차수당은 전년도 지급액 × 3/12
     주의: 평균임금이 통상임금보다 적으면 **통상임금을 평균임금으로 한다**
           (근기법 2조 2항) — 실무에서 가장 자주 놓치는 지점이다.
     주의: 수습기간·업무상 부상·출산휴가·육아휴직·쟁의행위 기간은 기간과
           임금을 **모두 제외**하고 계산한다(근기법 시행령 2조). */
  function averageWage(o) {
    o = o || {};
    var 임금총액 = num(o.기간임금총액);
    var 일수 = num(o.기간일수);
    var 상여산입 = num(o.연간상여) * 3 / 12;
    var 연차산입 = num(o.연간연차수당) * 3 / 12;
    if (일수 <= 0) return { 일평균임금: 0, 근거: '기간일수가 0 — 산정 불가', 판정: 'unknown' };
    var raw = (임금총액 + 상여산입 + 연차산입) / 일수;
    var 통상일급 = num(o.통상일급);
    var 통상적용 = 통상일급 > raw;
    return {
      일평균임금: Math.round((통상적용 ? 통상일급 : raw) * 100) / 100,
      산정평균임금: Math.round(raw * 100) / 100,
      통상일급: 통상일급,
      통상임금적용: 통상적용,
      상여산입액: Math.round(상여산입),
      연차산입액: Math.round(연차산입),
      근거: '3개월 임금총액 ' + Math.round(임금총액).toLocaleString() + '원 + 상여 3/12 + 연차 3/12 ÷ ' + 일수 + '일'
        + (통상적용 ? ' → 통상일급이 더 커서 통상임금 적용(근기법 2조 2항)' : '')
    };
  }

  /* 법정 퇴직금(퇴직급여법 8조) = 1일 평균임금 × 30일 × (재직일수 / 365)
     주의: 계속근로 1년 미만은 지급 의무가 없다(4주 평균 주 15시간 미만도 제외). */
  function severancePay(o) {
    o = o || {};
    var P = policyOf(o.policy);
    var 일평균 = num(o.일평균임금);
    var 재직일수 = o.재직일수 != null ? num(o.재직일수) : daysInclusive(o.입사일, o.퇴사일);
    var years = 재직일수 / 365;
    if (o.주소정근로시간 != null && num(o.주소정근로시간) < 15) {
      return { 금액: 0, 재직일수: 재직일수, 지급의무: false,
        근거: '4주 평균 1주 소정근로시간 15시간 미만 — 퇴직금 지급 대상 아님' };
    }
    if (재직일수 < 365) {
      return { 금액: 0, 재직일수: 재직일수, 지급의무: false,
        근거: '계속근로 1년 미만(' + 재직일수 + '일) — 퇴직금 지급 의무 없음(퇴직급여법 4조)' };
    }
    var 금액 = roundBy(일평균 * 30 * (재직일수 / 365), P.rounding);
    return {
      금액: 금액, 재직일수: 재직일수, 근속년수: Math.round(years * 100) / 100, 지급의무: true,
      근거: '1일 평균임금 ' + Math.round(일평균).toLocaleString() + '원 × 30일 × ' + 재직일수 + '/365'
    };
  }

  /* DC형 퇴직연금 부담금(퇴직급여법 20조) = 연간 임금총액의 1/12 이상.
     매월 납입하는 사업장은 그 달 임금총액 ÷ 12 로 본다. */
  function dcContribution(o) {
    o = o || {};
    var P = policyOf(o.policy);
    var 연간 = num(o.연간임금총액);
    var 최소 = roundBy(연간 / 12, P.rounding);
    var 실제 = num(o.실제납입액);
    return {
      최소부담금: 최소, 실제납입액: 실제,
      부족액: Math.max(0, 최소 - 실제),
      판정: (실제 > 0 && 실제 < 최소) ? 'short' : 'ok',
      근거: '연간 임금총액 ' + Math.round(연간).toLocaleString() + '원 × 1/12 (퇴직급여법 20조 — 이상 납입)'
    };
  }

  /* DB형은 급여 산정이 법정 퇴직금과 같다 — 적립 부족(최소적립비율)은 별도 관리 */
  function dbBenefit(o) { return severancePay(o); }

  /* ── 퇴직소득세(소득세법 55조·48조) ──
     ① 퇴직소득금액 = 퇴직급여 − 비과세
     ② 근속연수공제
     ③ 환산급여 = (퇴직소득금액 − 근속연수공제) ÷ 근속연수 × 12
     ④ 환산급여공제 → 과세표준
     ⑤ 환산산출세액(기본세율) ÷ 12 × 근속연수 = 산출세액
     ⑥ 지방소득세 = 산출세액 × 10%
     주의: 근속연수는 1년 미만 端수를 1년으로 올린다. */
  var BASIC_TAX_BRACKETS = [
    { upto: 14000000, rate: 0.06, deduct: 0 },
    { upto: 50000000, rate: 0.15, deduct: 1260000 },
    { upto: 88000000, rate: 0.24, deduct: 5760000 },
    { upto: 150000000, rate: 0.35, deduct: 15440000 },
    { upto: 300000000, rate: 0.38, deduct: 19940000 },
    { upto: 500000000, rate: 0.40, deduct: 25940000 },
    { upto: 1000000000, rate: 0.42, deduct: 35940000 },
    { upto: Infinity, rate: 0.45, deduct: 65940000 }
  ];
  function basicTax(base) {
    var b = Math.max(0, num(base));
    for (var i = 0; i < BASIC_TAX_BRACKETS.length; i++) {
      if (b <= BASIC_TAX_BRACKETS[i].upto) {
        return Math.max(0, b * BASIC_TAX_BRACKETS[i].rate - BASIC_TAX_BRACKETS[i].deduct);
      }
    }
    return 0;
  }
  function serviceYearDeduction(years) {
    var y = Math.max(1, Math.ceil(num(years)));
    if (y <= 5) return 1000000 * y;
    if (y <= 10) return 5000000 + 2000000 * (y - 5);
    if (y <= 20) return 15000000 + 2500000 * (y - 10);
    return 40000000 + 3000000 * (y - 20);
  }
  function convertedDeduction(c) {
    var v = Math.max(0, num(c));
    if (v <= 8000000) return v;
    if (v <= 70000000) return 8000000 + (v - 8000000) * 0.6;
    if (v <= 100000000) return 45200000 + (v - 70000000) * 0.55;
    if (v <= 300000000) return 61700000 + (v - 100000000) * 0.45;
    return 151700000 + (v - 300000000) * 0.35;
  }
  function retirementIncomeTax(o) {
    o = o || {};
    var 퇴직급여 = num(o.퇴직급여) - num(o.비과세);
    var years = Math.max(1, Math.ceil(num(o.근속년수)));
    if (퇴직급여 <= 0) return { 소득세: 0, 지방소득세: 0, 합계: 0, 근거: '퇴직급여 없음' };
    var 근속공제 = serviceYearDeduction(years);
    var 환산급여 = Math.max(0, (퇴직급여 - 근속공제)) / years * 12;
    var 환산공제 = convertedDeduction(환산급여);
    var 과세표준 = Math.max(0, 환산급여 - 환산공제);
    var 환산산출 = basicTax(과세표준);
    var 소득세 = Math.floor(환산산출 / 12 * years / 10) * 10;   // 10원 절사
    var 지방 = floor10(소득세 * 0.1);
    return {
      퇴직소득금액: Math.round(퇴직급여), 근속년수: years,
      근속연수공제: Math.round(근속공제), 환산급여: Math.round(환산급여),
      환산급여공제: Math.round(환산공제), 과세표준: Math.round(과세표준),
      소득세: 소득세, 지방소득세: 지방, 합계: 소득세 + 지방,
      세후수령액: Math.round(퇴직급여) - (소득세 + 지방),
      근거: '소득세법 48조·55조 — 근속연수공제 → 환산급여 → 환산급여공제 → 기본세율 → ÷12×근속',
      주의: 'IRP 이전 시 과세이연(퇴직소득세 원천징수 없음) — 이전 여부를 반드시 확인'
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     E. 4대보험 · 월 급여 통합
     ══════════════════════════════════════════════════════════════════ */

  /* 4대보험 근로자 부담.
     주의: 국민연금·건강보험은 **공단 고지액**이 진실이다(실측 확인 —
           급여가 출렁여도 연금은 3개월 고정, 건보는 정산달만 변동).
           그래서 고지액이 주어지면 계산값을 버리고 고지액을 쓴다. */
  function insuranceEmployee(o) {
    o = o || {};
    var P = policyOf(o.policy);
    var 과세 = num(o.과세총액);
    var R = o.rates || {};
    var pick = function (m, y, dft) {
      if (!m) return dft;
      if (m[y] != null) return m[y];
      if (m['default'] != null) return m['default'];
      return dft;
    };
    var year = String(o.연도 || new Date().getUTCFullYear());
    var 연금율 = pick(R.pensionEE, year, 0.045);
    var 건보율 = pick(R.healthEE, year, 0.03545);
    var 장기율 = pick(R.longtermRate, year, 0.1281);
    var 고용율 = pick(R.empInsEE, year, 0.009);

    var 연금 = (o.고지_국민연금 != null) ? num(o.고지_국민연금) : roundBy(과세 * 연금율, P.rounding);
    var 건보 = (o.고지_건강보험 != null) ? num(o.고지_건강보험) : roundBy(과세 * 건보율, P.rounding);
    var 장기 = (o.고지_장기요양 != null) ? num(o.고지_장기요양) : roundBy(건보 * 장기율, P.rounding);
    var 고용 = (o.고지_고용보험 != null) ? num(o.고지_고용보험) : roundBy(과세 * 고용율, P.rounding);
    return {
      국민연금: 연금, 건강보험: 건보, 장기요양: 장기, 고용보험: 고용,
      합계: 연금 + 건보 + 장기 + 고용,
      모드: (o.고지_국민연금 != null || o.고지_건강보험 != null) ? '고지액' : '요율계산',
      근거: '연금 ' + (연금율 * 100).toFixed(2) + '% · 건보 ' + (건보율 * 100).toFixed(3)
        + '% · 장기 건보×' + (장기율 * 100).toFixed(2) + '% · 고용 ' + (고용율 * 100).toFixed(1) + '%'
    };
  }

  /* 지방소득세 = 소득세 × 10% → 10원 절사 (실측 31명 전원 일치) */
  function localIncomeTax(incomeTax) { return floor10(num(incomeTax) * 0.1); }

  /* 월 급여 한 사람 통합 계산 — 근태부터 실수령까지 한 줄로 잇는다.
     소득세는 간이세액표가 있어야 정확해서, 표(또는 값)를 주지 않으면
     '표 필요'로 표시하고 0 으로 둔다 — 조용히 틀린 값을 만들지 않는다. */
  function monthlyPayroll(o) {
    o = o || {};
    var P = policyOf(o.policy);
    var att = o.근태집계 || (o.근태기록 ? summarizeAttendance(o.근태기록, { policy: P, holidays: o.공휴일, weeklyOffDow: o.주휴요일 }) : null);
    var 통상월액 = num(o.통상임금월액 != null ? o.통상임금월액 : o.기본급);
    var 시급 = num(o.시급 != null ? o.시급 : hourlyOrdinary(통상월액, P));
    var al = statutoryAllowances(att, 시급, { policy: P, payType: o.급여형태 || 'monthly' });

    var 기본급 = num(o.기본급);
    var 고정수당 = num(o.고정수당);
    var 비과세 = num(o.비과세);
    var 지급총액 = 기본급 + 고정수당 + al.법정수당합계 + num(o.기타지급) + 비과세;
    var 과세총액 = Math.max(0, 지급총액 - 비과세);

    var ins = insuranceEmployee({
      과세총액: 과세총액, policy: P, rates: o.rates, 연도: o.연도,
      고지_국민연금: o.고지_국민연금, 고지_건강보험: o.고지_건강보험,
      고지_장기요양: o.고지_장기요양, 고지_고용보험: o.고지_고용보험
    });

    var 소득세 = (o.소득세 != null) ? num(o.소득세)
      : (typeof o.간이세액 === 'function' ? num(o.간이세액(과세총액, o.부양가족수 || 1)) : 0);
    var 소득세미정 = (o.소득세 == null && typeof o.간이세액 !== 'function');
    var 지방세 = localIncomeTax(소득세);

    var 공제총액 = ins.합계 + 소득세 + 지방세 + num(o.기타공제);
    var 실수령 = 지급총액 - 공제총액;

    // 최저임금 검증 — 가산수당은 산입 제외
    var mw = null;
    if (o.최저임금시급 != null) {
      mw = checkMinWage({
        산입임금: 기본급 + 고정수당 - num(o.최저임금미산입),
        소정근로시간: num(o.월소정근로시간 != null ? o.월소정근로시간 : P.monthlyStdHours),
        주휴시간: 0,
        minWageHourly: o.최저임금시급, policy: P
      });
    }

    return {
      지급: {
        기본급: 기본급, 고정수당: 고정수당,
        연장수당: al.연장수당, 야간수당: al.야간수당, 휴일수당: al.휴일수당, 주휴수당: al.주휴수당,
        기타지급: num(o.기타지급), 비과세: 비과세,
        지급총액: 지급총액, 과세총액: 과세총액
      },
      공제: {
        국민연금: ins.국민연금, 건강보험: ins.건강보험, 장기요양: ins.장기요양,
        고용보험: ins.고용보험, 소득세: 소득세, 지방세: 지방세,
        기타공제: num(o.기타공제), 공제총액: 공제총액
      },
      실수령: 실수령,
      근태: att, 시급: al.시급, 보험모드: ins.모드,
      검증: {
        최저임금: mw,
        소득세미정: 소득세미정,
        연장한도초과주: att ? att.연장한도초과주 : [],
        신호: (mw && mw.판정 === 'violation') ? 'red'
          : (소득세미정 || (att && att.연장한도초과주 && att.연장한도초과주.length)) ? 'orange' : 'green'
      },
      근거: { 수당: al.근거, 보험: ins.근거 }
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     내보내기
     ══════════════════════════════════════════════════════════════════ */
  var API = {
    VERSION: '1.0.0',
    DEFAULT_POLICY: DEFAULT_POLICY, LEAVE_KINDS: LEAVE_KINDS, MUL: MUL,
    policyOf: policyOf,
    // 유틸
    num: num, roundBy: roundBy, floor10: floor10,
    ymd: ymd, fmt: fmt, daysInclusive: daysInclusive, dow: dow, weekStart: weekStart,
    fullYearsBetween: fullYearsBetween, fullMonthsBetween: fullMonthsBetween,
    // 통상임금
    hourlyOrdinary: hourlyOrdinary, monthlyStdHoursFrom: monthlyStdHoursFrom,
    weeklyHolidayHours: weeklyHolidayHours,
    // 근태·수당
    hm: hm, nightMinutes: nightMinutes, dayWorkedHours: dayWorkedHours,
    summarizeAttendance: summarizeAttendance,
    statutoryAllowances: statutoryAllowances, checkFixedOT: checkFixedOT, checkMinWage: checkMinWage,
    // 연차·휴가
    accrueAnnual: accrueAnnual, accrueAnnualFiscalFirstYear: accrueAnnualFiscalFirstYear,
    annualLedger: annualLedger, annualUnusedPay: annualUnusedPay,
    promotionSchedule: promotionSchedule, leaveKind: leaveKind, compLeaveHours: compLeaveHours,
    // 퇴직
    averageWage: averageWage, severancePay: severancePay,
    dcContribution: dcContribution, dbBenefit: dbBenefit,
    retirementIncomeTax: retirementIncomeTax, basicTax: basicTax,
    // 급여
    insuranceEmployee: insuranceEmployee, localIncomeTax: localIncomeTax,
    monthlyPayroll: monthlyPayroll
  };

  global.PuLaborCore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
