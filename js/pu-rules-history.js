/* ══════════════════════════════════════════════════════════════════
   pu-rules-history.js — 취업규칙 이력 읽개 (공용)

   「언제 · 누가 · 어떤 내용으로 취업규칙을 만들거나 고쳤는가」를 한 곳에서 읽는다.
   기업정보함(pu-cards)·취업규칙 이력 화면(rules) 이 같이 부른다 — 목록을 그리는
   코드가 한 벌이라 화면마다 따로 낡지 않는다.

   ── 왜 index 를 따로 읽나 ──
   회차 원본(rules_mgmt/done/…)에는 신구대조표 «전문»이 들어 있다. 기업정보함에서
   회사 하나 보자고 그걸 통째로 받으면 안 된다(기업정보함이 카드 전체 대신 경량 색인
   pucards/idx 를 쓰는 것과 같은 까닭). 규정관리가 회차를 확정할 때 요약만 담은
   가벼운 색인을 나란히 적어 두고, 다른 화면은 그 색인만 읽는다.

     rules_mgmt/index/{사업장키}/{회차} = {
       site, bizno, asof(시행일), kind(제정|전부개정|일부개정),
       changed(바뀐 조 수), arts[](바뀐 조 제목 몇 개), artsMore,
       savedAt, savedBy, doneAt, doneBy, ownerName, from(rules|chwieop)
     }

   ── 회사를 맞추는 순서 ──
   사업자번호 › 상호명. 기업정보함 ErpMatch 와 같은 규칙으로 다듬는다 —
   다듬는 법이 다르면 같은 회사를 서로 다르게 찾아 화면마다 답이 달라진다.
   ══════════════════════════════════════════════════════════════════ */
(function (window) {
  'use strict';
  if (!window || window.PuRulesHistory) return;

  var PATH = 'rules_mgmt/index';
  var cache = null;          // [{siteKey, rev, …}] — 읽어 둔 색인
  var loading = null;        // 진행 중인 읽기 (여러 번 불러도 한 번만 읽는다)
  var waiters = [];

  /* 상호명 다듬기 — 법인격 표기와 띄어쓰기·기호를 걷어낸다 (기업정보함 ErpMatch 와 같은 규칙) */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/㈜|\(주\)|주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인|의료법인|\(재\)|\(사\)/g, '')
      .replace(/[\s\-_.,·・()[\]{}'"]/g, '');
  }
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }

  /* 회차 하나를 화면이 쓰기 좋은 모양으로 — 옛 기록에 빠진 칸은 여기서 메운다 */
  function shape(siteKey, rev, v) {
    v = v || {};
    var arts = Array.isArray(v.arts) ? v.arts.filter(Boolean) : [];
    return {
      id: siteKey + '@' + rev,
      siteKey: siteKey,
      rev: rev,
      site: String(v.site || ''),
      bizno: String(v.bizno || ''),
      asof: String(v.asof || ''),
      kind: v.kind || kindOf(v),
      changed: (v.changed == null ? null : Number(v.changed)),
      arts: arts,
      artsMore: Number(v.artsMore || 0),
      savedAt: String(v.savedAt || ''),
      savedBy: String(v.savedBy || ''),
      doneAt: String(v.doneAt || ''),
      doneBy: String(v.doneBy || ''),
      ownerName: String(v.ownerName || ''),
      from: v.from || 'rules'
    };
  }
  /* 구분 — 색인에 kind 가 없던 옛 기록은 mode 로 되짚는다 */
  function kindOf(v) {
    if (!v) return '일부개정';
    if (v.kind) return v.kind;
    if (v.from === 'chwieop' || v.enacted) return '제정';
    return v.mode === 'full' ? '전부개정' : '일부개정';
  }

  /* 색인 한 번 읽기 — 두 번째부터는 받아 둔 것을 그대로 준다.
     못 읽어도(권한·네트워크) 조용히 빈 목록을 준다 — 그 줄만 빠지고 화면은 그대로 뜬다. */
  function load(db, cb) {
    if (cache) { if (cb) cb(cache); return Promise.resolve(cache); }
    if (cb) waiters.push(cb);
    if (loading) return loading;
    if (!db || !db.ref) { cache = []; flush(); return Promise.resolve(cache); }
    loading = db.ref(PATH).once('value').then(function (s) {
      var v = s.val() || {}, out = [];
      Object.keys(v).forEach(function (sk) {
        var revs = v[sk] || {};
        Object.keys(revs).forEach(function (rv) {
          if (revs[rv]) out.push(shape(sk, rv, revs[rv]));
        });
      });
      cache = sortNewest(out);
      flush();
      return cache;
    })['catch'](function (e) {
      if (window.console) console.warn('[취업규칙 이력] 색인을 못 읽었습니다:', (e && e.message) || e);
      cache = [];
      flush();
      return cache;
    });
    return loading;
  }
  function flush() {
    var ws = waiters; waiters = [];
    ws.forEach(function (f) { try { f(cache); } catch (e) {} });
  }
  /* 다시 읽기 — 규정관리에서 회차를 확정한 직후처럼 «방금 바뀐» 때만 쓴다 */
  function reload(db, cb) { cache = null; loading = null; return load(db, cb); }

  /* 시행일 최신순, 같으면 완료 시각 최신순 */
  function sortNewest(list) {
    return list.slice().sort(function (a, b) {
      return String(b.asof || '').localeCompare(String(a.asof || ''))
        || String(b.doneAt || b.savedAt || '').localeCompare(String(a.doneAt || a.savedAt || ''));
    });
  }

  /* 이 회사의 회차만 — 사업자번호 › 상호명 */
  function forCompany(co, list) {
    list = list || cache || [];
    if (!co) return [];
    var b = digits(co.bizno || co.bizNo || co.biz_no);
    if (b.length >= 10) {
      var hit = list.filter(function (r) { return digits(r.bizno) === b; });
      if (hit.length) return sortNewest(hit);
    }
    var n = norm(co.company || co.name || co.site);
    if (n.length < 2) return [];
    return sortNewest(list.filter(function (r) { return norm(r.site) === n; }));
  }

  /* 한 줄 요약 — 「2026-08-01 시행 · 일부개정 3개 조 · 나바호 완료(08-23)」 */
  function lineOf(r) {
    var p = [];
    if (r.asof) p.push(r.asof + ' 시행');
    var k = r.kind + (r.kind === '일부개정' && r.changed ? ' ' + r.changed + '개 조' : '');
    p.push(k);
    var who = r.doneBy || r.savedBy || r.ownerName;
    if (who) p.push(who + (r.doneAt ? ' 완료(' + shortDate(r.doneAt) + ')' : ''));
    return p.join(' · ');
  }
  /* 「2026-08-23 14:20」 → 「08-23」 */
  function shortDate(s) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? m[2] + '-' + m[3] : String(s || '').slice(0, 10);
  }
  /* 바뀐 조 제목 — 「제12조(연차유급휴가) · 제31조(육아휴직) 외 1개」 */
  function artsOf(r) {
    if (!r.arts.length) return '';
    var s = r.arts.join(' · ');
    return r.artsMore > 0 ? s + ' 외 ' + r.artsMore + '개' : s;
  }

  /* 규정관리에서 그 회차 열기 — 대조표는 규정관리 한 곳에서만 그린다 */
  function openUrl(r) {
    return 'rules.html?sso=1#rev=' + encodeURIComponent(r.id);
  }

  /* ── 서버 한도에 맞춰 자르기 ──
     서버 규칙은 색인의 칸마다 길이를 잰다. 한 칸이라도 길면 «그 회차 저장이
     통째로» 물리쳐지고, 화면에는 아무 말도 안 뜬 채 이력만 조용히 안 쌓인다.
     표준 조 제목은 22자쯤이라 여유가 있지만, 규정관리는 사업장이 올린 «실제»
     취업규칙을 읽으므로 회사가 길게 쓴 제목·긴 사업장명이 들어올 수 있다.
     한도는 여기 한 곳에만 두고 규정관리·작성기가 같이 쓴다
     (docs/firebase-rules-…json 의 index 규칙과 같은 값 — 검사가 대조한다). */
  var LIMIT = { site: 120, bizno: 20, asof: 10, savedAt: 20, doneAt: 20,
                savedBy: 40, doneBy: 40, ownerName: 40, art: 60,
                arts: 4, changed: 1000 };
  function cut(v, n) { return String(v == null ? '' : v).slice(0, n); }
  function fit(o) {
    o = o || {};
    var n = Number(o.changed);
    if (!isFinite(n) || n < 0) n = 0;
    return {
      site: cut(o.site, LIMIT.site),
      bizno: cut(o.bizno, LIMIT.bizno),
      asof: cut(o.asof, LIMIT.asof),
      kind: kindOf(o),
      changed: Math.min(Math.round(n), LIMIT.changed),
      arts: (Array.isArray(o.arts) ? o.arts : []).filter(Boolean)
              .slice(0, LIMIT.arts).map(function (t) { return cut(t, LIMIT.art); }),
      artsMore: Math.max(0, Math.round(Number(o.artsMore) || 0)),
      savedAt: cut(o.savedAt, LIMIT.savedAt),
      savedBy: cut(o.savedBy, LIMIT.savedBy),
      doneAt: cut(o.doneAt, LIMIT.doneAt),
      doneBy: cut(o.doneBy, LIMIT.doneBy),
      ownerUid: String(o.ownerUid || ''),
      ownerName: cut(o.ownerName, LIMIT.ownerName),
      from: (o.from === 'chwieop' ? 'chwieop' : 'rules')
    };
  }

  window.PuRulesHistory = {
    PATH: PATH, LIMIT: LIMIT,
    load: load, reload: reload,
    forCompany: forCompany, fit: fit,
    kindOf: kindOf, lineOf: lineOf, artsOf: artsOf, shortDate: shortDate,
    openUrl: openUrl, sortNewest: sortNewest,
    _norm: norm, _digits: digits, _shape: shape,
    /* 검사·다른 화면에서 미리 채워 넣을 때 (서버 없이 시험) */
    _seed: function (list) { cache = sortNewest(list || []); loading = null; return cache; },
    _cache: function () { return cache; }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

/* node 검사에서도 그대로 부를 수 있게 — 브라우저에서는 window, node 에서는 globalThis 에 붙는다 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).PuRulesHistory;
}
