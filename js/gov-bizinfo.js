'use strict';
/* 푸른노무법인 정부사업신청 — 기업마당(중기부) 지원사업 공고 받아오기
   (브라우저 window.GovBizinfo / Node module.exports 겸용, DOM·통신 없음 — 주소와 글자만 다룬다)

   대표 지시 2026-09-05 「지자체도 연결」 → 검토 끝에 순서를 바꿨다(대표 승인 「순서로」):
   개별 기관 홈페이지를 긁기 «전에» 이미 열려 있는 API 부터 붙인다.
   실측(12년치 274건)에서 최다 지원처가 «소상공인진흥공단 11건»이고 중진공·충북중기청까지
   중기부 계열이라, 이 API 하나가 상위 기관의 상당 부분을 덮는다.

   ── 실측으로 확인한 것 (2026-09-05) ──
   ⚠ CORS 가 «열려 있다» — Access-Control-Allow-Origin 에 우리 주소를 그대로 돌려주고
     Access-Control-Allow-Methods: GET, POST, PUT, DELETE 를 준다. 프록시가 필요 없다.
   ⚠ 인증키는 «기업마당 자체 발급»이다(공공데이터포털 키가 아니다). 파라미터 이름도
     serviceKey 가 아니라 crtfcKey 다. 이걸 헷갈리면 「존재하지 않는 인증키」만 계속 온다.
   ⚠ 나라장터와 «다른 집»이다 — 열쇠도 따로, 주소도 따로.

   명세: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi (2025-10-22 개정판 기준) */
(function (root) {

  var BASE = 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';

  /* 지원분야 대분류 — 대표는 «인력·경영»이 본업이다.
     ⚠ 전부 켜면 금융·수출·창업 공고가 쏟아진다. 좁게 시작한다. */
  var FIELDS = { '01': '금융', '02': '기술', '03': '인력', '04': '수출',
                 '05': '내수', '06': '창업', '07': '경영', '09': '기타' };
  var FIELDS_DEFAULT = ['03', '07'];              /* 인력 · 경영 */

  /* 해시태그로 지역을 좁힌다 — 실측상 대표 지원처가 충남·세종·대전·충북에 몰려 있다.
     ⚠ 비워 두면 전국이 온다. 그것도 쓸모가 있으므로 «끌 수 있게» 둔다. */
  var REGIONS_DEFAULT = ['충남', '세종', '대전', '충북'];

  function s(v) { return v == null ? '' : String(v).trim(); }

  function buildUrl(o) {
    o = o || {};
    var q = ['crtfcKey=' + encodeURIComponent(s(o.key)), 'dataType=json'];
    var cnt = (o.count == null) ? 200 : o.count;
    if (cnt) q.push('searchCnt=' + cnt);
    /* ⚠ 분야는 한 번에 하나만 받는다(searchLclasId 는 단수다) — 부르는 쪽이 돌려 가며 부른다 */
    if (o.field) q.push('searchLclasId=' + encodeURIComponent(s(o.field)));
    var tags = o.regions;
    if (tags && tags.length) q.push('hashtags=' + encodeURIComponent(tags.join(',')));
    return BASE + '?' + q.join('&');
  }

  /* ── 신청기간 풀기 ──
     '20220727 ~ 20220930' 꼴로 온다. 끝날이 마감이다.
     ⚠ 한쪽만 있거나 아예 없는 것도 있다(상시 접수) — 없으면 «모른다»로 둔다. */
  function period(reqstDt) {
    var t = s(reqstDt);
    var m = t.match(/(\d{8})/g);
    function fmt(v) { return v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8); }
    if (!m || !m.length) return { start: '', end: '' };
    if (m.length === 1) return { start: fmt(m[0]), end: '' };
    return { start: fmt(m[0]), end: fmt(m[1]) };
  }

  /* ── 응답 풀기 ──
     잘 되면 { jsonArray: [ …items… } 또는 RSS 를 JSON 으로 옮긴 모양으로 온다.
     ⚠ 판이 여러 가지라 «아는 자리를 차례로» 본다. 못 찾으면 지어내지 않고 실패로 돌린다. */
  function parse(json) {
    if (!json) return { ok: false, err: '빈 응답', rows: [] };
    if (json.reqErr) return { ok: false, err: s(json.reqErr), rows: [] };
    var items = json.jsonArray || json.items || json.item ||
                (json.rss && json.rss.channel && json.rss.channel.item) ||
                (json.channel && json.channel.item);
    if (!items) return { ok: false, err: '공고 목록을 찾지 못했습니다', rows: [] };
    if (!Array.isArray(items)) items = [items];
    return { ok: true, err: '', rows: items.map(norm).filter(function (x) { return !!x.no; }) };
  }

  function norm(it) {
    it = it || {};
    var p = period(it.reqstDt);
    return {
      src: '기업마당',
      no: s(it.seq) || s(it.pblancId),
      nm: s(it.title),
      inst: s(it.excInsttNm) || s(it.author),      /* 수행기관을 먼저 — 실제로 서류를 받는 곳 */
      ntce: s(it.author),                          /* 소관기관 */
      openDt: s(it.pubDate).slice(0, 10),
      closeDt: p.end,
      startDt: p.start,
      field: s(it.lcategory),
      target: s(it.trgetNm),
      prc: 0,                                      /* 지원사업에는 추정가격이 없다 */
      mthd: '',
      url: s(it.link),
      memo: s(it.description).slice(0, 200)
    };
  }

  var api = { BASE: BASE, FIELDS: FIELDS, FIELDS_DEFAULT: FIELDS_DEFAULT,
              REGIONS_DEFAULT: REGIONS_DEFAULT,
              buildUrl: buildUrl, parse: parse, period: period };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GovBizinfo = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
