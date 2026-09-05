'use strict';
/* 푸른노무법인 정부사업신청 — 나라장터(조달청) 용역 입찰공고 받아오기
   (브라우저 window.GovG2b / Node module.exports 겸용, DOM·통신 없음 — 주소와 글자만 다룬다)

   대표 지시 2026-09-05 「나라장터에 나오는 사업등도 연결해서 한번에 정리」.

   ── 실측으로 확인한 것 (2026-09-05) ──
   ⚠★ 주소에 «/ad/» 가 들어간다. 없으면 「해당 오픈API 서비스가 없거나 폐기됨」이 온다.
        ○ apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc
        ✗ apis.data.go.kr/1230000/BidPublicInfoService/...      ← 흔히 도는 옛 주소
   ⚠ CORS 는 «열려 있다» — 응답이 Access-Control-Allow-Origin 에 우리 주소를 그대로 돌려주고
     사전요청(OPTIONS)도 200 을 준다. 그래서 프록시 서버가 필요 없다. 다시 만들지 말 것.
   ⚠ HTTPS 로 붙는다(HSTS 있음). http 로 적으면 github.io 에서 혼합콘텐츠로 막힌다.
   ⚠ 하루 1,000회(개발계정) — 화면을 열 때마다 부르면 안 된다. 하루 한 번 + 손으로 누를 때만. */
(function (root) {

  var BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc';

  /* 대표가 고른 여덟 낱말(2026-09-05). 늘리기는 쉽지만 넓히면 잡음이 수백 건이다 —
     실측 예: 「교육」 하나로 급식·시설 교육까지 딸려 온다. 좁게 시작해 늘린다. */
  var KEYWORDS_DEFAULT = ['노무', '인사', '고용', '임금', '컨설팅', '일터혁신', '노사', '교육'];

  /* ── 인증키 함정 ──
     공공데이터포털은 열쇠를 «두 벌» 준다: Encoding(%2B…) 과 Decoding(+…).
     이미 인코딩된 열쇠를 또 인코딩하면 %2B → %252B 가 되어 영영 안 붙는다.
     그래서 «이미 인코딩된 것으로 보이면 그대로 쓴다». */
  function encKey(k) {
    var s = String(k || '').trim();
    if (!s) return '';
    return /%[0-9A-Fa-f]{2}/.test(s) ? s : encodeURIComponent(s);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* 조회 구간은 YYYYMMDDHHmm 열두 자리다 */
  function stamp(d, endOfDay) {
    var t = (d instanceof Date) ? d : new Date(String(d));
    return String(t.getFullYear()) + pad(t.getMonth() + 1) + pad(t.getDate()) +
           (endOfDay ? '2359' : '0000');
  }

  function buildUrl(o) {
    o = o || {};
    var q = [
      'serviceKey=' + encKey(o.key),
      'type=json',
      'inqryDiv=1',                                   /* 1 = 공고게시일시 기준 */
      'inqryBgnDt=' + stamp(o.from, false),
      'inqryEndDt=' + stamp(o.to, true),
      'pageNo=' + (o.page || 1),
      'numOfRows=' + (o.rows || 999)
    ];
    return BASE + '?' + q.join('&');
  }

  /* ── 응답 풀기 ──
     잘 되면 { response:{ header:{resultCode}, body:{ items, totalCount } } }
     틀리면 { OpenAPI_ServiceResponse:{ cmmMsgHeader:{ errMsg, returnAuthMsg } } }
     ⚠ items 는 «배열일 때도, 객체 하나일 때도, 아예 없을 때도» 있다. 셋 다 받아야 한다. */
  function parse(json) {
    if (!json) return { ok: false, err: '빈 응답', rows: [], total: 0 };
    var bad = json.OpenAPI_ServiceResponse && json.OpenAPI_ServiceResponse.cmmMsgHeader;
    if (bad) {
      return { ok: false, rows: [], total: 0,
               err: String(bad.returnAuthMsg || bad.errMsg || '알 수 없는 오류') };
    }
    var r = json.response || {};
    var code = r.header && String(r.header.resultCode || '');
    if (code && code !== '00' && code !== '0') {
      return { ok: false, rows: [], total: 0,
               err: String((r.header && r.header.resultMsg) || ('오류 코드 ' + code)) };
    }
    var body = r.body || {};
    var items = body.items;
    if (!items) items = [];
    if (!Array.isArray(items)) items = (items.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [items]);
    return { ok: true, err: '', total: Number(body.totalCount || items.length) || 0,
             rows: items.map(norm).filter(function (x) { return !!x.no; }) };
  }

  function s(v) { return v == null ? '' : String(v).trim(); }

  /* 칸 이름이 판마다 조금씩 다르다 — 아는 이름을 차례로 본다 */
  function norm(it) {
    it = it || {};
    return {
      no:    s(it.bidNtceNo) + (s(it.bidNtceOrd) ? '-' + s(it.bidNtceOrd) : ''),
      nm:    s(it.bidNtceNm),
      inst:  s(it.dminsttNm) || s(it.ntceInsttNm),      /* 수요기관을 먼저 */
      ntce:  s(it.ntceInsttNm),
      openDt: s(it.bidNtceDt),
      closeDt: s(it.bidClseDt) || s(it.opengDt),
      prc:   Number(String(it.presmptPrce || it.asignBdgtAmt || '').replace(/[^0-9]/g, '')) || 0,
      mthd:  s(it.cntrctCnclsMthdNm),
      url:   s(it.bidNtceDtlUrl)
    };
  }

  /* ── 낱말 걸러내기 ──
     공고명에서 찾는다. 띄어쓰기를 지우고 봐야 「일터 혁신」도 걸린다. */
  function matched(row, kws) {
    var nm = s(row && row.nm).replace(/\s+/g, '');
    var list = (kws && kws.length) ? kws : KEYWORDS_DEFAULT;
    return list.filter(function (k) {
      var t = String(k || '').replace(/\s+/g, '');
      return t && nm.indexOf(t) >= 0;
    });
  }

  /* 'YYYY-MM-DD HH:mm:ss' · 'YYYYMMDDHHmm' 둘 다 받는다 */
  function _t(v) {
    var t = s(v);
    if (!t) return null;
    var m = /^(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2})?:?(\d{2})?/.exec(t);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }

  /* 마감까지 며칠 — 지났으면 음수. 모르면 null(「-」로 보여 준다). */
  function dday(closeDt, today) {
    var a = _t(closeDt), b = _t(today);
    if (a == null) return null;
    if (b == null) b = Date.now();
    return Math.ceil((a - b) / 86400000);
  }

  /* ── 낱말 켜고 끄기 ──
     ⚠ 마지막 하나까지 끄지 못하게 막는다. 다 끄면 아무것도 안 걸려
       「받았는데 0건」이 되고, 사람은 API 가 고장 난 줄 안다. */
  function toggleKw(list, kw) {
    var cur = (list && list.length) ? list.slice() : KEYWORDS_DEFAULT.slice();
    var t = s(kw);
    if (!t) return { list: cur, ok: false, err: '낱말이 비어 있습니다' };
    var i = cur.indexOf(t);
    if (i < 0) { cur.push(t); return { list: cur, ok: true, err: '' }; }
    if (cur.length <= 1) return { list: cur, ok: false, err: '낱말을 모두 끌 수는 없습니다 — 하나는 남겨 주세요' };
    cur.splice(i, 1);
    return { list: cur, ok: true, err: '' };
  }

  /* ── 이미 받은 것과 합치기 ──
     ⚠ 새로 «만들기»만 한다. 이미 있는 줄은 손대지 않는다 —
       대표가 ⭐관심을 켜 두거나 메모를 적어 뒀을 수 있다. */
  function merge(existing, incoming, kws, today) {
    var have = {};
    (existing || []).forEach(function (r) { if (r && r.no) have[r.no] = 1; });
    var adds = [], skipped = 0, unmatched = 0;
    (incoming || []).forEach(function (r) {
      if (!r || !r.no) return;
      var hit = matched(r, kws);
      if (!hit.length) { unmatched++; return; }
      if (have[r.no]) { skipped++; return; }
      have[r.no] = 1;
      adds.push({
        no: r.no, nm: r.nm, org: r.inst, ntce: r.ntce,
        openDt: r.openDt, closeDt: r.closeDt, prc: r.prc, mthd: r.mthd, url: r.url,
        kw: hit.join(','),
        year: s(r.openDt).slice(0, 4),
        dday: dday(r.closeDt, today),
        type: '새 공고'                       /* 상태 — 목록 툴바의 「유형」으로 거른다 */
      });
    });
    return { adds: adds, skipped: skipped, unmatched: unmatched };
  }

  var api = { BASE: BASE, KEYWORDS_DEFAULT: KEYWORDS_DEFAULT, encKey: encKey,
              buildUrl: buildUrl, parse: parse, matched: matched, dday: dday, merge: merge,
              toggleKw: toggleKw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GovG2b = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
