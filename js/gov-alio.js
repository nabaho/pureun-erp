'use strict';
/* 푸른노무법인 정부사업신청 — 알리오(공공기관) 채용·위촉 공고 받아오기
   (브라우저 window.GovAlio / Node module.exports 겸용, DOM·통신 없음 — 주소와 글자만 다룬다)

   대표 승인 2026-09-05 「순서로」. 실측 12년치에서 공공기관이 15%(41건)이고,
   폴더에 「알리오경영평가위원」이 실제로 있다 — 위촉 공고가 여기 뜬 이력이 있다.

   ── 실측으로 확인한 것 (2026-09-05) ──
   ⚠★ 주소는 apis.data.go.kr/1051000/recruitment/list 다.
        `/recruit/list`·`/recruitment_v2/list` 는 「해당 오픈API 서비스가 없거나 폐기됨」이 온다.
   ⚠ CORS 가 열려 있다(Allow-Origin 에 우리 주소를 돌려주고 preflight 200) — 프록시 불필요.
   ⚠ 열쇠는 «공공데이터포털» 것이다 — 나라장터와 «같은 열쇠»를 쓴다(기업마당만 따로다).

   ── ⚠★ 아직 확인 못 한 것 ──
   응답 칸 이름은 공개 문서로 안 나온다(신청 페이지 안에 있다).
   그래서 아래 CAND 는 «후보 목록»이고, 열쇠가 오면 probe() 로 한 번에 확인한다.
   ⚠ 후보를 하나로 줄이지 말 것 — 틀리면 목록이 통째로 빈다.
   ⚠ 못 알아본 칸을 «지어내지 않는다». 비면 화면에 '-' 로 둔다. */
(function (root) {

  var BASE = 'https://apis.data.go.kr/1051000/recruitment/list';

  function s(v) { return v == null ? '' : String(v).trim(); }

  function encKey(k) {
    var t = s(k);
    if (!t) return '';
    return /%[0-9A-Fa-f]{2}/.test(t) ? t : encodeURIComponent(t);   /* 두 번 인코딩 금지 */
  }

  function buildUrl(o) {
    o = o || {};
    var q = ['serviceKey=' + encKey(o.key), 'resultType=json',
             'pageNo=' + (o.page || 1), 'numOfRows=' + (o.rows || 100)];
    /* 공고중인 것만 — 이름이 판마다 다를 수 있어 부르는 쪽이 끌 수 있게 둔다 */
    if (o.ongoingOnly) q.push('ongoingYn=Y');
    return BASE + '?' + q.join('&');
  }

  /* ── 칸 이름 후보 ──
     왼쪽부터 차례로 보고 처음 값이 있는 것을 쓴다. */
  var CAND = {
    no:      ['recrutPblntSn', 'recrutPblntSeq', 'sn', 'id'],
    nm:      ['recrutPbancTtl', 'pbancTtl', 'title', 'recrutTtl'],
    inst:    ['instNm', 'pblntInstNm', 'orgNm', 'instName'],
    openDt:  ['pbancBgngYmd', 'pbancBgngDt', 'bgngYmd', 'startDate'],
    closeDt: ['pbancEndYmd', 'pbancEndDt', 'endYmd', 'endDate'],
    kind:    ['recrutSeNm', 'hireTypeNmLst', 'recrutSe', 'hireTypeNm'],
    region:  ['workRgnNmLst', 'workRgnNm', 'rgnNm'],
    nope:    ['recrutNope', 'nope', 'recruitCnt'],
    url:     ['srcUrl', 'pbancUrl', 'url', 'link']
  };

  function pick(it, names) {
    for (var i = 0; i < names.length; i++) {
      var v = s(it[names[i]]);
      if (v) return v;
    }
    return '';
  }

  /* 'YYYYMMDD' → 'YYYY-MM-DD'. 이미 하이픈이 있으면 그대로. */
  function ymd(v) {
    var t = s(v);
    if (/^\d{8}$/.test(t)) return t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6, 8);
    return t.slice(0, 10);
  }

  function norm(it) {
    it = it || {};
    return {
      src: '알리오',
      no: pick(it, CAND.no),
      nm: pick(it, CAND.nm),
      inst: pick(it, CAND.inst),
      ntce: pick(it, CAND.inst),
      openDt: ymd(pick(it, CAND.openDt)),
      closeDt: ymd(pick(it, CAND.closeDt)),
      kind: pick(it, CAND.kind),
      region: pick(it, CAND.region),
      nope: pick(it, CAND.nope),
      prc: 0,                                  /* 채용·위촉에는 추정가격이 없다 */
      mthd: '',
      url: pick(it, CAND.url)
    };
  }

  function parse(json) {
    if (!json) return { ok: false, err: '빈 응답', rows: [], total: 0 };
    var bad = json.OpenAPI_ServiceResponse && json.OpenAPI_ServiceResponse.cmmMsgHeader;
    if (bad) return { ok: false, rows: [], total: 0,
                      err: s(bad.returnAuthMsg || bad.errMsg || '알 수 없는 오류') };
    if (json.resultCode && String(json.resultCode) !== '200' && String(json.resultCode) !== '0') {
      return { ok: false, rows: [], total: 0, err: s(json.resultMsg) || ('오류 ' + json.resultCode) };
    }
    var r = json.response || json;
    var items = (r.body && r.body.items) || r.result || r.items || r.data;
    if (!items) return { ok: false, rows: [], total: 0, err: '공고 목록을 찾지 못했습니다' };
    if (!Array.isArray(items)) items = items.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [items];
    var total = Number((r.body && r.body.totalCount) || r.totalCount || items.length) || 0;
    return { ok: true, err: '', total: total,
             rows: items.map(norm).filter(function (x) { return !!x.no; }) };
  }

  /* ── 열쇠가 오면 한 번에 확인하는 장치 ──
     받은 줄 하나를 주면 «어느 칸을 알아봤고 어느 칸을 못 알아봤는지» 알려 준다.
     ⚠ 못 알아본 칸이 있으면 CAND 에 그 이름을 «더한다»(기존 것을 지우지 않는다). */
  function probe(rawItem) {
    var got = [], miss = [];
    Object.keys(CAND).forEach(function (k) {
      (pick(rawItem || {}, CAND[k]) ? got : miss).push(k);
    });
    return { got: got, miss: miss, keys: Object.keys(rawItem || {}) };
  }

  var api = { BASE: BASE, CAND: CAND, encKey: encKey, buildUrl: buildUrl,
              parse: parse, probe: probe, ymd: ymd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GovAlio = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
