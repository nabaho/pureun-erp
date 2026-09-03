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

  /* ===== 업체(자문·고문) 종료 판별 =====
     ⚠ 사업(사건·컨설팅)과 잣대가 «다르다». 업체관리는 해지하면 status 를 active 에서 바꾸고
       closedDate·closedReason(계약만료/계약해지/폐업/법인전환…)을 남긴다.
       사업 쪽 isClosed 를 그대로 쓰면 해지된 업체가 영원히 「진행」으로 남는다. */
  function isCoClosed(c) {
    if (!c) return false;
    if (c.closedDate) return true;
    return String(c.status || 'active') !== 'active';
  }

  /* ===== 필드 매핑 (설계서 §4 표) =====
     ⚠★ `contracts` 를 여기에 넣지 말 것 — 그것은 「상담접수 → 계약협의 → 계약확정」
       파이프라인이고, 계약이 확정되면 업체관리(companies)로 «이관»된다.
       contracts 를 가져오면 아직 계약도 안 된 곳이 자문 실적으로 센다(회귀검사 있음).
       노무법인이 «수행한» 자문·고문의 실체는 companies 다. */
  var COLL_MAP = {
    cases:          { store: 'case',    type: ['caseType'],                        proj: ['title', 'caseNo'] },
    consultings:    { store: 'consult', type: ['consultingType', 'programName'],   proj: ['title', 'programName'] },
    funds:          { store: 'fund',    type: ['fundType', 'programName'],         proj: ['title'] },
    other_projects: { store: 'etc',     type: ['programName', 'projectType'],      proj: ['title'] },
    companies:      { store: 'advisory', type: [], proj: [], kind: 'company' }
  };

  /* 컬렉션마다 종료 잣대가 다르다 — 업체만 isCoClosed 를 쓴다 */
  function collClosed(coll, c) {
    return (COLL_MAP[coll] && COLL_MAP[coll].kind === 'company') ? isCoClosed(c) : isClosed(c);
  }
  function pick(c, keys) { for (var i = 0; i < keys.length; i++) { if (c[keys[i]]) return c[keys[i]]; } return ''; }

  /* 사건번호에서 유형·연도를 뽑는다.
     pu-erp 사건은 caseType이 비어 있고 진행중이면 종료일도 없는데,
     사건번호가 '부해등-2026-003' 꼴이라 둘 다 여기 들어 있다(실사용에서 확인). */
  var CASENO_RE = /^\s*([^\-\s][^\-]*?)\s*-\s*(20\d{2})\s*-\s*\d+/;
  function fromCaseNo(no) {
    var m = CASENO_RE.exec(String(no || ''));
    return m ? { type: m[1].trim(), year: m[2] } : null;
  }

  /* ===== 유형 코드표 =====
     pu-erp는 유형을 코드로 저장하고(c.typeCodes.consulting 또는 c.typeCode),
     코드표(biz_cons_types 등)에 이름과 수행기관이 함께 있다.
     예) cons-job-neung → 산업일자리 / 한국능률협회 (실사용에서 확인).
     수행기관이 채워지면 kcareer가 그 건을 외부기관 실적으로 분류한다. */
  var TYPEMAP_KEY = { cases: 'case', consultings: 'consulting', funds: 'fund', other_projects: 'other',
                      companies: 'company' };
  function typeCodeOf(coll, c) {
    var k = TYPEMAP_KEY[coll];
    if (c.typeCodes && k && c.typeCodes[k]) return String(c.typeCodes[k]);
    return String(c.typeCode || '');
  }
  function lookupType(coll, c, typeMap) {
    var k = TYPEMAP_KEY[coll];
    var list = (typeMap && k && typeMap[k]) || null;
    if (!list || !list.length) return null;
    var code = typeCodeOf(coll, c);
    if (!code) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].code) === code) return list[i];
    }
    return null;
  }

  /* ===== 업체관리 한 줄 → 자문·고문 실적 =====
     ⚠★ 월 자문료(monthlyAdvisoryFee)를 «절대 담지 않는다». pu-erp 자신도 canSeeAmount()로
       가리는 값이고, 공모 지원에 쓸 일이 없다. 담으면 유출 위험만 늘어난다(회귀검사 있음).
     ⚠ 연도는 «자문을 시작한 해»(contractStartDate)다. 해지연도로 바꾸면 「언제부터
       자문해 왔는가」를 잃는다 — 그것이 공모 평가에서 보는 값이다. */
  function mapCompany(key, c, userMap, typeMap) {
    var sid = mainSid(c);
    var t = lookupType('companies', c, typeMap);
    var start = String(c.contractStartDate || '').trim();
    var closed = isCoClosed(c);
    var endRaw = String(c.closedDate || c.contractEndDate || '').trim();
    return {
      store: 'advisory',
      rec: {
        /* 유형은 코드표(biz_company_types)에서만 온다 — 모르면 비워 둔다 */
        type: (t && t.name) || '',
        org: c.name || '',
        /* 고객사 이름 없이 실적을 세기 위한 칸 — 업태·종목·규모·근로자 수 */
        bizType: c.bizType || '',
        bizCategory: c.bizCategory || '',
        size: c.companySize || '',
        insured: Number(c.employmentInsuredCount) || 0,
        year: start.slice(0, 4),
        /* 화면에 보일 글자와 «셈에 쓸 날짜»를 함께 담는다 —
           평균 자문기간을 세려면 period 문자열이 아니라 날짜가 필요하다 */
        start: start,
        end: (closed && endRaw) ? endRaw : '',
        period: start ? (start + ' ~ ' + ((closed && endRaw) ? endRaw : '현재')) : '',
        main: (userMap && userMap[sid]) || sid,
        status: closed ? '종료' : '진행',
        closedReason: c.closedReason || '',
        puRef: 'companies/' + key
      }
    };
  }

  function mapRecord(coll, key, c, userMap, typeMap) {
    var m = COLL_MAP[coll];
    if (!m || !c) return null;
    if (m.kind === 'company') return mapCompany(key, c, userMap, typeMap);
    var sid = mainSid(c);
    var dateRaw = c.closedDate || c.endDate || '';
    var proj = pick(c, m.proj);
    var cn = fromCaseNo(c.caseNo || proj);
    var t = lookupType(coll, c, typeMap);
    return {
      store: m.store,
      rec: {
        type: pick(c, m.type) || (t ? (t.name || '') : '') || (cn ? cn.type : ''),
        /* 수행기관은 코드표에서만 온다 — 비면 푸른 자체 실적(내부 탭) */
        agency: (t && t.agency) || '',
        org: c.companyName || c.payee || '',
        project: proj,
        year: String(dateRaw).slice(0, 4) || (cn ? cn.year : ''),
        main: (userMap && userMap[sid]) || sid,
        /* 진행중도 가져온다(실사용: 사건 13건 중 11건이 진행중이었다).
           상태를 그대로 옮겨 두고, 증명서 발급은 '완료' 건만 고르게 한다. */
        status: isClosed(c) ? '완료' : '진행',
        puRef: coll + '/' + key
      }
    };
  }

  /* ===== pu-erp 저장 봉투 벗기기 =====
     pu-erp는 data/{키} = { v:실제값, u:갱신시각 } 형태로 저장하고 자신은 data/{키}/v 로 읽는다.
     봉투를 안 벗기면 컬렉션마다 v·u 두 개가 레코드로 세어져 유령 8건이 생긴다(실사용에서 발견). */
  function unwrap(val) {
    if (val && typeof val === 'object' && !Array.isArray(val) &&
        Object.prototype.hasOwnProperty.call(val, 'v')) return val.v;
    return val;
  }

  /* 같은 실적인지 — 기관·연도·유형으로 판단(시드에는 puRef가 없어 이름밖에 열쇠가 없다) */
  function _norm(s) { return String(s || '').replace(/[\s\(\)（）\-·,㈜]/g, '').toLowerCase(); }
  function _sameWork(rec, r) {
    if (!r || r.puRef) return false;                 /* 이미 pu와 이어진 건은 대상 아님 */
    if (r.store && r.store !== rec._store) return false;
    var a = _norm(rec.org), b = _norm(r.org);
    if (!a || !b || a !== b) return false;           /* 기관(고객사)이 다르면 다른 건 */
    if (rec.year && r.year && rec.year !== r.year) return false;
    return true;
  }

  /* ===== 병합 계획 =====
     추가만 계획한다. 다만 puRef 없는 기존 실적(시드 등)이 같은 건이면
     새로 만들지 않고 puRef만 붙인다(중복 방지 — 실사용에서 컨설팅 17건이 겹쳤다). */
  function buildSyncPlan(collData, existingRefs, userMap, typeMap, existingRecords) {
    var known = (existingRefs instanceof Set) ? existingRefs : new Set(existingRefs || []);
    var pool = (existingRecords || []).slice();
    var plan = { adds: [], links: [], counts: { case: 0, consult: 0, fund: 0, etc: 0, advisory: 0 },
                 skippedOpen: 0, skippedKnown: 0, closedCount: 0, openCount: 0 };
    Object.keys(COLL_MAP).forEach(function (coll) {
      var v = unwrap(collData ? collData[coll] : null);
      if (!v || typeof v !== 'object') return;
      Object.keys(v).forEach(function (key) {
        var c = v[key];
        if (!c) return;                                       /* Firebase 배열형의 null 구멍 */
        var ref = coll + '/' + key;
        if (known.has(ref)) { plan.skippedKnown++; return; }
        var m = mapRecord(coll, key, c, userMap, typeMap);
        if (!m) return;
        /* 기존 실적과 같은 건이면 puRef만 붙이고 넘어간다 */
        m.rec._store = m.store;
        var hitIdx = -1;
        for (var i = 0; i < pool.length; i++) { if (_sameWork(m.rec, pool[i])) { hitIdx = i; break; } }
        delete m.rec._store;
        if (hitIdx >= 0) {
          var h = pool.splice(hitIdx, 1)[0];                  /* 한 건에 두 번 붙지 않게 뺀다 */
          plan.links.push({ id: h.id, store: h.store, puRef: m.rec.puRef,
                            agency: m.rec.agency || '', type: m.rec.type || '',
                            main: m.rec.main || '', status: m.rec.status || '' });
          return;
        }
        /* 진행중도 담는다 — 종료만 받으면 실적이 영원히 안 들어온다(실사용) */
        if (collClosed(coll, c)) plan.closedCount++; else plan.openCount++;
        plan.adds.push(m);
        plan.counts[m.store]++;
      });
    });
    return plan;
  }

  /* ===== 상태 맞추기 =====
     진행중으로 가져온 건이 pu-erp에서 종료되면 상태·연도만 맞춘다.
     다른 필드는 손대지 않는다 — 사람이 고친 내용을 덮어쓰지 않기 위해서다. */
  function buildStatusUpdates(collData, existingRecords) {
    var byRef = {};
    Object.keys(COLL_MAP).forEach(function (coll) {
      var v = unwrap(collData ? collData[coll] : null);
      if (!v || typeof v !== 'object') return;
      Object.keys(v).forEach(function (key) {
        if (v[key]) byRef[coll + '/' + key] = { coll: coll, c: v[key] };
      });
    });
    var out = [];
    (existingRecords || []).forEach(function (r) {
      if (!r || !r.puRef) return;                      /* 손으로 등록한 건은 건드리지 않는다 */
      var hit = byRef[r.puRef];
      if (!hit) return;                                /* pu-erp에서 사라진 건 */
      var c = hit.c;
      var isCo = (COLL_MAP[hit.coll] || {}).kind === 'company';
      if (isCo) {
        /* 자문·고문이 해지됐다 — 상태만 「종료」로 바꾼다.
           ⚠ 연도는 손대지 않는다. 자문 실적의 연도는 «시작한 해»이고,
             해지연도로 덮으면 「언제부터 자문해 왔는가」를 잃는다. */
        if (isCoClosed(c) && r.status !== '종료') {
          out.push({ puRef: r.puRef, status: '종료', year: r.year || '' });
        }
        return;
      }
      if (isClosed(c) && r.status !== '완료') {
        var d = c.closedDate || c.endDate || '';
        out.push({ puRef: r.puRef, status: '완료', year: String(d).slice(0, 4) || r.year || '' });
      }
    });
    return out;
  }

  var api = { isClosed: isClosed, isCoClosed: isCoClosed, mapRecord: mapRecord, buildSyncPlan: buildSyncPlan,
              buildStatusUpdates: buildStatusUpdates, unwrap: unwrap, fromCaseNo: fromCaseNo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerPuSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
