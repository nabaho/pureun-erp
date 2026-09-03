'use strict';
/* 푸른노무법인 경력관리 — 자문·고문 실적을 «고객사 이름 없이» 세어 문장으로 만든다
   (브라우저 window.KcareerAdvSummary / Node module.exports 겸용, DOM 미사용 — 셈과 글자만)

   대표 결정 2026-09-03 「목록 보이고 내보낼 때 가림」.
   ── 왜 가리나 ──
   자문 실적에는 고객사 이름이 붙어 있다. 안에서 일할 때는 이름이 보여야 실무가 되지만,
   지원서·CSV 로 «밖으로» 나가는 순간 그 회사가 「우리는 노무 자문을 받는다」는 사실을
   남에게 알리게 된다. 노무사 비밀유지의무에 걸린다.
   그래서 목록은 그대로 두고, 내보내는 자리에서만 이름을 가린다.

   ⚠★ 심사위원이 보는 것은 «어느 회사냐»가 아니라 «우리와 비슷한 업종·규모를 다뤄 봤나»다.
     그래서 이름을 가려도 답안의 값은 줄지 않는다 — 오히려 업태·규모·근로자 수로
     세어 주는 것이 평가 항목에 정확히 맞는다.

   ⚠ 없는 것을 지어내지 않는다. 「300인 이상 자문 경험」 같은 문장은 실제로 그런 곳이
     있을 때만 붙인다. 지원서의 허위기재는 위촉취소 사유다. */
(function (root) {

  /* ── 업태에서 가린 이름을 만든다 ──
     '제조업' → '○○제조사'. 꼬리의 '업'을 떼고 '사'를 붙인다.
     같은 업태가 여럿이면 번호를 붙여 서로 구분되게 한다(CSV 는 줄이 여럿이다). */
  function maskName(bizType, seq) {
    var b = String(bizType || '').trim().replace(/업$/, '');
    var base = b ? ('○○' + b + '사') : '○○사';
    return (seq && seq > 1) ? (base + seq) : base;
  }

  /* 내보낼 줄 — 고객사 이름을 가린 «사본»을 준다(원본 배열은 건드리지 않는다).
     ⚠ 사업자번호·주소 같은 칸이 나중에 늘어나면 여기서도 함께 가려야 한다. */
  function maskRows(rows) {
    var seen = {};
    return (rows || []).map(function (r) {
      var bt = (r && r.bizType) || '';
      seen[bt] = (seen[bt] || 0) + 1;
      var out = {};
      Object.keys(r || {}).forEach(function (k) { out[k] = r[k]; });
      out.org = maskName(bt, seen[bt]);
      return out;
    });
  }

  function ymd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /* ── 세기 ──
     today 를 인자로 받는다 — 기기 시계에 매달리면 검사가 날마다 달라진다. */
  function summarize(rows, today) {
    var list = (rows || []).filter(function (r) { return r && !r.excluded; });
    var now = ymd(today) != null ? ymd(today) : Date.now();
    var live = list.filter(function (r) { return r.status === '진행'; });
    function sum(a) { return a.reduce(function (s, r) { return s + (Number(r.insured) || 0); }, 0); }
    function tally(key) {
      var m = {};
      list.forEach(function (r) { var v = String(r[key] || '').trim(); if (v) m[v] = (m[v] || 0) + 1; });
      return m;
    }
    var spans = [];
    list.forEach(function (r) {
      var a = ymd(r.start); if (a == null) return;
      var b = ymd(r.end); if (b == null) b = now;
      if (b < a) return;                                  /* 날짜가 뒤집힌 줄은 셈에서 뺀다 */
      spans.push((b - a) / (365.25 * 24 * 3600 * 1000));
    });
    var avg = spans.length ? (spans.reduce(function (s, x) { return s + x; }, 0) / spans.length) : 0;
    var maxIns = list.reduce(function (m, r) { return Math.max(m, Number(r.insured) || 0); }, 0);
    return {
      liveCount: live.length,
      allCount: list.length,
      sumLive: sum(live),
      sumAll: sum(list),
      byBiz: tally('bizType'),
      bySize: tally('size'),
      avgYears: Math.round(avg * 10) / 10,
      maxInsured: maxIns
    };
  }

  function n(x) { return Number(x || 0).toLocaleString('ko-KR'); }

  /* 많은 것부터 「제조업 2곳, 도소매업 2곳」 꼴로 */
  function _list(m) {
    return Object.keys(m).sort(function (a, b) {
      return (m[b] - m[a]) || a.localeCompare(b, 'ko');
    }).map(function (k) { return k + ' ' + m[k] + '곳'; }).join(', ');
  }

  /* ── 문장 만들기 ──
     targetBiz: 이 공모 기관의 사업 업태들(예 ['도소매업','운수업']). 주면 대응 문장을 한 줄 더 붙인다.
     ⚠ 겹치는 곳이 «없으면» 그 문장을 붙이지 않는다 — 없는 대응을 있다고 쓰면 허위다. */
  function sentence(sum, targetBiz) {
    if (!sum || !sum.allCount) return '';
    var out = [];
    out.push('푸른노무법인은 현재 ' + sum.liveCount + '개 사업장(근로자 합계 ' + n(sum.sumLive) +
             '명)에 월 단위 노무자문을 수행하고 있습니다.');
    if (sum.allCount > sum.liveCount) {
      out.push('종료된 곳을 포함하면 ' + sum.allCount + '개 사업장·누적 ' + n(sum.sumAll) + '명입니다.');
    }
    var bz = _list(sum.byBiz);
    if (bz) out.push('업태별로는 ' + bz + '입니다.');
    var tb = (targetBiz || []).filter(function (b) { return sum.byBiz[b]; });
    if (tb.length) {
      var k = tb.reduce(function (s, b) { return s + sum.byBiz[b]; }, 0);
      out.push('이 중 ' + tb.join('·') + ' 분야가 ' + k + '곳으로 귀 기관의 사업 영역과 직접 대응합니다.');
    }
    var sz = _list(sum.bySize);
    if (sz) out.push('규모별로는 ' + sz + '입니다.');
    if (sum.avgYears >= 1) out.push('평균 자문기간은 ' + sum.avgYears + '년입니다.');
    /* 실제로 그런 곳이 있을 때만 쓴다 */
    if (sum.maxInsured >= 300) {
      out.push('근로자 300인 이상 사업장 자문 경험을 보유하고 있습니다.');
    }
    return out.join(' ');
  }

  var api = { maskName: maskName, maskRows: maskRows, summarize: summarize, sentence: sentence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerAdvSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
