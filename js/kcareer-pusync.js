'use strict';
// 푸른노무법인 경력관리 — pu-erp 실적 동기화 순수 모듈
// (브라우저 window.KcareerPuSync / Node module.exports 겸용, DOM·Firebase 미사용)
// 설계서: docs/superpowers/specs/2026-08-01-kcareer-실적동기화-design.md
(function (root) {

  /* ===== 종료 판별 =====
     pu-erp 상태값은 closed·done·완료가 혼재하고 UI 상태(active·saving)와 필드명이 같다.
     ⚠ endDate만 있는 건은 예정일일 수 있으므로 미종료로 본다(기존 화면의 "(예정)" 해석과 동일). */
  var CLOSED_STATUS = ['closed', 'done', '완료', '종료'];
  function isClosed(c) {
    if (!c) return false;
    if (c.closedDate) return true;
    var s = String(c.status || '').toLowerCase();
    return CLOSED_STATUS.indexOf(s) >= 0;
  }

  /* 주담당 sid: managerMain → workers의 isPrimary → 첫 번째 (kcareer._puMainMgr와 동일 규칙) */
  function mainSid(c) {
    var sid = c.managerMain || '';
    if (!sid && Array.isArray(c.workers)) {
      var w = c.workers.find(function (x) { return x && x.isPrimary; }) || c.workers[0];
      if (w) sid = w.sid || '';
    }
    return String(sid || '');
  }

  /* ===== 필드 매핑 (설계서 §4 표) ===== */
  var COLL_MAP = {
    cases:          { store: 'case',    type: ['caseType'],                        proj: ['title', 'caseNo'] },
    consultings:    { store: 'consult', type: ['consultingType', 'programName'],   proj: ['title', 'programName'] },
    funds:          { store: 'fund',    type: ['fundType', 'programName'],         proj: ['title'] },
    other_projects: { store: 'etc',     type: ['programName', 'projectType'],      proj: ['title'] }
  };
  function pick(c, keys) { for (var i = 0; i < keys.length; i++) { if (c[keys[i]]) return c[keys[i]]; } return ''; }

  function mapRecord(coll, key, c, userMap) {
    var m = COLL_MAP[coll];
    if (!m || !c) return null;
    var sid = mainSid(c);
    var dateRaw = c.closedDate || c.endDate || '';
    return {
      store: m.store,
      rec: {
        type: pick(c, m.type),
        org: c.companyName || c.payee || '',
        project: pick(c, m.proj),
        year: String(dateRaw).slice(0, 4),
        main: (userMap && userMap[sid]) || sid,
        status: '완료',
        puRef: coll + '/' + key
      }
    };
  }

  /* ===== 병합 계획 =====
     추가만 계획한다. 기존 레코드는 건드리지 않고(수동 수정 보존),
     existingRefs에 있는 puRef는 배제된 것이라도 다시 들어오지 않는다. */
  function buildSyncPlan(collData, existingRefs, userMap) {
    var known = (existingRefs instanceof Set) ? existingRefs : new Set(existingRefs || []);
    var plan = { adds: [], counts: { case: 0, consult: 0, fund: 0, etc: 0 }, skippedOpen: 0, skippedKnown: 0 };
    Object.keys(COLL_MAP).forEach(function (coll) {
      var v = collData ? collData[coll] : null;
      if (!v) return;
      Object.keys(v).forEach(function (key) {
        var c = v[key];
        if (!c) return;                                       /* Firebase 배열형의 null 구멍 */
        if (!isClosed(c)) { plan.skippedOpen++; return; }
        var ref = coll + '/' + key;
        if (known.has(ref)) { plan.skippedKnown++; return; }
        var m = mapRecord(coll, key, c, userMap);
        if (!m) return;
        plan.adds.push(m);
        plan.counts[m.store]++;
      });
    });
    return plan;
  }

  var api = { isClosed: isClosed, mapRecord: mapRecord, buildSyncPlan: buildSyncPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerPuSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
