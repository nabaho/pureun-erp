/* 급여데이터함 — 저장 층
   급여자료를 어디에 어떤 경로로 담을지 정하는 유일한 파일이다.
   화면은 경로를 모른다 — 나중에 자리를 옮겨도 화면은 손대지 않는다.
   (사진첩 js/pu-photo-store.js 와 같은 원리)

   설계서: docs/superpowers/specs/2026-08-13-급여데이터함-design.md
   콘솔 규칙: docs/firebase-rules-급여데이터함-포함(붙여넣기용).json

   ⚠ 지켜야 할 것 넷
   1. 쓰기는 반드시 다중 경로 update 한 번. 상위 노드를 set 으로 덮으면
      남의 자료가 지워진다(2026-07 실데이터 사고).
   2. 정보·미리보기·값을 가른다. 목록만 읽을 때 본문을 내려받으면 안 된다.
   3. 로그인하지 않았으면 경로를 만들지 않고 알린다 — 빈 uid 로 만든
      paydata/u//items 자리에 실데이터가 들어가면 되돌리기 어렵다.
   4. 아래 칸 이름(items·pending·values·thumbs·trash·deputy)은 **콘솔 규칙과
      한 글자도 다르면 안 된다.** 규칙이 u/$owner 아래 칸마다 쓰기를 열기 때문에,
      이름이 어긋나면 그 칸은 아무도 못 쓴다(조용히 저장이 안 된다). */
(function (global) {
  'use strict';

  var DB_ROOT = 'paydata';        // 실시간DB 루트 — 다른 앱 루트와 겹치지 않게 새로 판다
  var BUCKET_ROOT = 'pu_paydata'; // 파일 창고 루트 — 사진첩(pu_photos)·기금과 분리

  var KEEP = 'keep';              // 월 무관 자료(근로계약서)가 들어가는 칸
  var PENDING_STALE_DAYS = 3;     // 대기 칸에 이만큼 묵으면 표시가 뜬다
  var TRASH_DAYS = 30;            // 휴지통 보관
  var KEEP_YEARS = 3;             // 보유기간 — 지나면 「지난 것」 표시만. 지우는 코드는 없다

  /* 종류(서랍 안의 탭). keep:true 면 귀속월과 무관하게 KEEP 칸으로 간다. */
  var KINDS = [
    { key: 'contract', label: '근로계약서', keep: true },
    { key: 'attend',   label: '근태' },
    { key: 'ledger',   label: '급여대장' },
    { key: 'output',   label: '우리 산출물' },
    { key: 'etc',      label: '기타' }
  ];

  var deps = { db: null, storage: null, uid: '', isAdmin: false, name: '' };

  /* 파이어베이스 객체와 계정을 받아 저장 층을 준비한다.
     이미 넣어 둔 값은 안 넘기면 그대로 둔다 — 로그인 뒤 권한만 나중에 알려 줄 수 있어야 한다. */
  function init(o) {
    o = o || {};
    if (o.db) deps.db = o.db;
    if (o.storage) deps.storage = o.storage;
    if (o.uid !== undefined) deps.uid = o.uid || '';
    if (o.isAdmin !== undefined) deps.isAdmin = !!o.isAdmin;
    if (o.name) deps.name = o.name;
    return DB_ROOT;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ── 귀속월 열쇠 ──
     '2026-08' · '202608' · '2026-8' · 시각(ms) 을 모두 '202608' 로 만든다.
     사람이 손으로 적는 칸이라 표기가 갈린다 — 한 곳에서 받아 준다.
     못 알아보면 null 이다(0 이나 '' 로 돌려주면 엉뚱한 칸에 담긴다). */
  function monthKey(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v) && v > 0) {
      var d = new Date(v);
      return String(d.getFullYear()) + pad2(d.getMonth() + 1);
    }
    var m = String(v).trim().match(/^(\d{4})\D?(\d{1,2})$/);
    if (!m) return null;
    var mo = parseInt(m[2], 10);
    if (!(mo >= 1 && mo <= 12)) return null;
    return m[1] + pad2(mo);
  }

  function isKeepKind(kind) {
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].key === kind) return !!KINDS[i].keep;
    }
    return false;
  }

  function kindLabel(kind) {
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].key === kind) return KINDS[i].label;
    }
    return kind || '';
  }

  /* 이 자료가 들어갈 칸 — KEEP 이거나 'YYYYMM'. 모르면 null(= 대기 칸에 머문다). */
  function slotOf(kind, month) {
    if (isKeepKind(kind)) return KEEP;
    return monthKey(month);
  }

  /* ── 사람별 자리 ──
     권한 경계가 사람이므로 담기는 자리도 사람이다. 실시간DB 규칙은 목록을
     걸러 주지 못한다 — 어떤 노드를 읽을 수 있으면 그 아래가 전부 열린다.
     화면에서 가리는 것은 보호가 아니다. */
  function base(owner) {
    var who = owner || deps.uid;
    if (!who) throw new Error('자료를 담을 계정을 알 수 없습니다 — 로그인을 확인해 주세요');
    return DB_ROOT + '/u/' + who;
  }

  function itemPath(slot, id, owner) { return base(owner) + '/items/' + slot + '/' + id; }
  function thumbPath(slot, id, owner) { return base(owner) + '/thumbs/' + slot + '/' + id; }
  function valuePath(slot, rowId, owner) { return base(owner) + '/values/' + slot + '/' + rowId; }
  function pendingPath(id, owner) { return base(owner) + '/pending/' + id; }
  function deputyPath(deputyUid, owner) { return base(owner) + '/deputy/' + deputyUid; }
  function trashPath(id, owner) { return base(owner) + '/trash/' + id; }

  /* 한 칸(귀속월 또는 keep) 안의 목록 자리 — 본문·미리보기는 따라오지 않는다. */
  function slotPath(slot, owner) { return base(owner) + '/items/' + slot; }
  function pendingBoxPath(owner) { return base(owner) + '/pending'; }
  function trashBoxPath(owner) { return base(owner) + '/trash'; }

  /* 공용 대기 칸 — 서버가 메일로 받은 것. 서버는 사람이 아니라 자리가 없다.
     누구든 집어서 자기 자리로 내려보낸다(집은 사람이 기록에 남는다). */
  function sharedPendingPath(id) { return DB_ROOT + '/pending_shared/' + id; }
  function sharedPendingBoxPath() { return DB_ROOT + '/pending_shared'; }

  /* 사람 자리 **밖**의 칸들 — 전 직원이 읽어야 하는 것만 여기 둔다. */
  function ownerPath(uid) { return DB_ROOT + '/owners/' + uid; }
  function ownerBoxPath() { return DB_ROOT + '/owners'; }
  function arrivalPath(companyId, slot) { return DB_ROOT + '/arrivals/' + companyId + '/' + slot; }
  function arrivalBoxPath() { return DB_ROOT + '/arrivals'; }
  function accessLogPath(id) { return DB_ROOT + '/access_log/' + id; }
  function handoffLogPath(id) { return DB_ROOT + '/handoff_log/' + id; }

  /* 창고 파일 자리 — **올린 사람** 자리다(주인 자리가 아니다).
     창고 규칙은 실시간DB를 볼 수 없어 대리인 판정을 창고에서 못 한다.
     소속은 실시간DB 정보가 정한다. */
  function filePath(slot, id, ext, uploader) {
    var who = uploader || deps.uid;
    if (!who) throw new Error('파일을 담을 계정을 알 수 없습니다 — 로그인을 확인해 주세요');
    return BUCKET_ROOT + '/' + who + '/' + slot + '/' + id + (ext ? '.' + ext : '');
  }

  /* 시간 순으로 늘어나는 번호 — 목록을 시각 순으로 훑을 수 있어야 한다.
     같은 밀리초에 여러 장이 들어와도 겹치지 않게 순번을 붙인다. */
  var lastStamp = 0, sameCount = 0;
  function newId() {
    var t = Date.now();
    if (t === lastStamp) { sameCount++; } else { lastStamp = t; sameCount = 0; }
    return String(t) + '_' + pad2(sameCount % 100) + Math.random().toString(36).slice(2, 6);
  }

  function myUid() { return deps.uid; }
  function myName() { return deps.name; }
  function amAdmin() { return deps.isAdmin; }

  /* ══════ 자료 한 건 ══════
     대기 칸 자료와 서랍 자료는 **같은 것**이다. 다른 점은 사업장·귀속월·종류를
     아는가뿐이다. 그래서 모양을 하나로 두고 칸만 옮긴다 — 두 모양으로 두면
     내려보낼 때 옮겨 담다 칸을 빠뜨린다. */
  function pendingRecord(o) {
    o = o || {};
    return {
      filename: String(o.filename || ''),
      file: String(o.file || ''),          // 창고 자리. 내려보낼 때 **바뀌지 않는다**
      mime: String(o.mime || ''),
      bytes: Number(o.bytes || 0),
      at: Number(o.at || 0),               // 올린 시각
      by: String(o.by || deps.uid || ''),  // 담은 사람
      companyId: String(o.companyId || ''),
      companyName: String(o.companyName || ''),
      month: String(o.month || ''),
      kind: String(o.kind || ''),
      from: String(o.from || 'upload'),    // upload · camera · photos · mail · share
      note: String(o.note || '')
    };
  }

  /* 대기 칸 자료 + 사람이 채운 이름표 → 서랍 자료.
     담은 사람(by)은 그대로 두고 내려보낸 사람(filedBy)을 따로 남긴다 —
     휴가 대리로 남이 손댄 자료를 나중에 구분할 수 있어야 한다. */
  function itemRecord(rec, tag) {
    tag = tag || {};
    var out = pendingRecord(rec);
    out.companyId = String(tag.companyId || '');
    out.companyName = String(tag.companyName || out.companyName || '');
    out.month = slotOf(tag.kind, tag.month) || '';
    out.kind = String(tag.kind || '');
    out.filedAt = Number(tag.at || 0);       // 서랍으로 내려간 시각
    out.filedBy = String(deps.uid || '');    // 내려보낸 사람(대리인일 수 있다)
    return out;
  }

  /* ══════ 도착 표시 ══════
     자료마다 한 자리를 만든다. 다중 경로 update 는 숫자를 늘릴 수 없고(트랜잭션이
     필요하다), 자리 수로 세면 같은 자료를 두 번 담아도 장수가 어긋나지 않는다.

     ⚠ 여기에는 **숫자(시각)만** 넣는다. 도착 칸은 전 직원이 읽는다 —
     파일 이름에는 근로자 성명이 흔히 들어 있다. */
  function arrivalMarks(companyId, slot, kind, id, at) {
    var out = {};
    if (!companyId || !slot || !kind || !id) return out;
    out[arrivalPath(companyId, slot) + '/' + kind + '/' + id] = Number(at || 0);
    out[arrivalPath(companyId, slot) + '/last'] = Number(at || 0);
    return out;
  }

  /* 그 업체·그 달에 그 종류가 몇 장 왔나 — 자리 수를 센다. */
  function arrivalCount(node, kind) {
    if (!node || !kind || !node[kind] || typeof node[kind] !== 'object') return 0;
    return Object.keys(node[kind]).length;
  }

  /* ══════ 대기 칸 → 서랍 ══════
     다중 경로 묶음을 만드는 **순수 함수**다(파이어베이스 없이 검사할 수 있다).
     자료 생기기 · 대기 칸에서 지우기 · 도착 표시를 **한 묶음**으로 만든다 —
     따로 쓰면 「자료는 있는데 도착 표시가 없다」가 된다. */
  function drawerUpdate(id, rec, tag, owner) {
    tag = tag || {};
    if (!id) throw new Error('자료 번호가 없습니다');
    if (!tag.companyId) throw new Error('사업장을 골라 주세요');
    if (!tag.kind) throw new Error('종류를 골라 주세요');
    var slot = slotOf(tag.kind, tag.month);
    if (!slot) throw new Error('귀속월을 적어 주세요 (예: 2026-08)');

    var up = {};
    up[itemPath(slot, id, owner)] = itemRecord(rec, tag);
    up[pendingPath(id, owner)] = null;
    var marks = arrivalMarks(tag.companyId, slot, tag.kind, id, tag.at);
    Object.keys(marks).forEach(function (k) { up[k] = marks[k]; });
    return up;
  }

  /* 공용 대기 칸에서 집어 내 자리로. 집은 사람을 남긴다 —
     서버가 받은 것이라 「누가 맡았는지」가 아니면 아무도 책임지지 않는다. */
  function claimShared(id, rec) {
    if (!id) throw new Error('자료 번호가 없습니다');
    var mine = pendingRecord(rec);
    mine.by = deps.uid || '';
    mine.claimedBy = deps.uid || '';
    mine.claimedAt = Date.now();
    var up = {};
    up[pendingPath(id)] = mine;
    up[sharedPendingPath(id)] = null;
    return up;
  }

  /* 대기 칸에 오래 묵었는가. 시각이 없으면 오래된 것으로 본다 —
     안 보이면 영원히 남는다. */
  function isStalePending(rec, now) {
    var at = Number((rec && rec.at) || 0);
    if (!at) return true;
    return (Number(now || Date.now()) - at) > PENDING_STALE_DAYS * 86400000;
  }

  /* ══════ 실제로 쓰는 층 (얇게) ══════
     묶음을 만드는 것은 위의 순수 함수가 하고, 여기는 보내기만 한다.
     ⚠ ref() 를 인자 없이 부르고 update 한다 — 다중 경로 쓰기의 유일한 방법이다. */
  function savePending(o) {
    var id = (o && o.id) || newId();
    var up = {};
    up[pendingPath(id)] = pendingRecord(o);
    return deps.db.ref().update(up).then(function () { return id; });
  }

  function moveToDrawer(id, tag, rec, owner) {
    return deps.db.ref().update(drawerUpdate(id, rec, tag, owner)).then(function () { return true; });
  }

  function claimSharedNow(id, rec) {
    return deps.db.ref().update(claimShared(id, rec)).then(function () { return true; });
  }

  /* 내 대기 칸 목록 — 본문은 창고에 있으므로 여기 담긴 것은 정보뿐이다. */
  function listMyPending(owner) {
    return deps.db.ref(pendingBoxPath(owner)).once('value')
      .then(function (s) { return s.val() || {}; });
  }

  /* 도착 칸 전체 — 업체·귀속월·종류·장수만 담긴 얇은 칸이라 통째로 읽어도 가볍다.
     이 칸이 있어서 남의 자리를 열지 않고도 「어느 업체가 자료를 보냈나」를 안다. */
  function listArrivals() {
    return deps.db.ref(arrivalBoxPath()).once('value')
      .then(function (s) { return s.val() || {}; });
  }

  /* 공용 대기 칸 목록 — 서버가 메일로 받은 것(5차에 채워진다). */
  function listSharedPending() {
    return deps.db.ref(sharedPendingBoxPath()).once('value')
      .then(function (s) { return s.val() || {}; });
  }

  /* 한 칸(귀속월 또는 keep)의 자료 목록. 본문·미리보기는 안 따라온다.
     ⚠ 이 칸에는 **모든 사업장**의 자료가 섞여 있다(itemPath 에 사업장 번호가 없다) —
     사업장별로 가르는 것은 화면이 companyId 로 걸러서 한다. */
  function listSlot(slot, owner) {
    return deps.db.ref(slotPath(slot, owner)).once('value')
      .then(function (s) { return s.val() || {}; });
  }

  /* 보유기간(3년)이 지났는가 — 표시만 한다. 지우는 코드는 어디에도 없다.
     귀속월이 있는 자료는 그 달 말일부터, keep 자료(근로계약서 등)는 담은 날부터 센다. */
  function isExpired(rec, now) {
    var slot = String((rec && rec.month) || '');
    var at;
    if (slot === KEEP || !/^\d{6}$/.test(slot)) {
      at = Number((rec && rec.filedAt) || (rec && rec.at) || 0);
    } else {
      var y = parseInt(slot.slice(0, 4), 10), mo = parseInt(slot.slice(4), 10);
      at = new Date(y, mo, 0, 23, 59, 59).getTime();   // 귀속월 말일
    }
    if (!at) return false;
    return (Number(now || Date.now()) - at) > KEEP_YEARS * 365 * 86400000;
  }

  /* 창고 파일의 내려받기 주소 — 「확대」 보기·다운로드 링크에 쓴다.
     사진첩과 달리 여기는 엑셀·PDF도 섞여 있어 항상 <img> 로 보여줄 수 없다 —
     부르는 쪽이 mime 을 보고 그림인지 아닌지 가른다. */
  function fileDownloadUrl(path) {
    if (!deps.storage) return Promise.reject(new Error('창고가 연결되지 않았습니다'));
    if (!path) return Promise.reject(new Error('파일 자리를 알 수 없습니다'));
    return deps.storage.ref(path).getDownloadURL();
  }

  /* ══════ 업체관리 명단 ══════
     사업장 서랍의 기준은 푸른이알피 업체관리다(대표 결정 2026-08-13).
     데이터함이 제 명단을 만들면 이름 글자 맞추기 어긋남이 늘어난다.

     ⚠ 자리 모양이 두 가지다 — data/companies = {v: 목록, u: 갱신시각} 이고
     목록은 **배열**이거나 **번호 맵**이다(푸른이알피가 둘 다 쓴다).
     한쪽만 읽으면 명단이 통째로 빈다. 벗기는 곳은 여기 한 군데뿐이다.

     ⚠ 콘솔 규칙에는 최상위 `companies` 열쇠도 있지만 **어느 파일도 그 자리를
     쓰지 않는다**(2026-08-13 확인). 실데이터는 data/companies 에 있다. */
  var ERP_COMPANIES = 'data/companies';
  var NAME_KEYS = ['업체명', 'name', '사업장', '회사명'];

  function pickName(o) {
    for (var i = 0; i < NAME_KEYS.length; i++) {
      var v = o && o[NAME_KEYS[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  function normalizeCompanies(raw) {
    var box = (raw && typeof raw === 'object' && raw.v !== undefined) ? raw.v : raw;
    if (!box || typeof box !== 'object') return [];
    var out = [], keys = Object.keys(box);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], row = box[k];
      if (!row || typeof row !== 'object') continue;
      var name = pickName(row);
      if (!name) continue;                                  // 이름 없으면 그릴 수 없다
      var id = String(row.id || row.companyId || (Array.isArray(box) ? '' : k) || '');
      out.push({ id: id, name: name, biz: String(row.사업자등록번호 || row.biz || '') });
    }
    return out;
  }

  function listCompanies() {
    return deps.db.ref(ERP_COMPANIES).once('value').then(function (s) {
      return normalizeCompanies(s.val());
    });
  }

  /* 이름으로 업체 맞추기 — 급여관리 설정카드는 「화담원 아산점」처럼 적혀 있어
     글자가 똑같지 않다. 앞가지(주식회사·㈜)와 괄호·빈칸을 떼고 견준다.
     **긴 이름부터** 봐서 「화담원」이 「화담원산업」을 가로채지 않게 한다. */
  function coreName(s) {
    return String(s || '').replace(/\(.*?\)|㈜|주식회사|유한회사|\s/g, '');
  }

  function matchCompanyName(text, list) {
    var want = coreName(text);
    if (!want) return null;
    var sorted = (list || []).slice().sort(function (a, b) {
      return coreName(b.name).length - coreName(a.name).length;
    });
    for (var i = 0; i < sorted.length; i++) {
      var c = coreName(sorted[i].name);
      if (!c) continue;
      if (c === want || want.indexOf(c) >= 0 || c.indexOf(want) >= 0) return sorted[i];
    }
    return null;
  }

  global.PuPaydataStore = {
    DB_ROOT: DB_ROOT,
    BUCKET_ROOT: BUCKET_ROOT,
    KEEP: KEEP,
    KINDS: KINDS,
    PENDING_STALE_DAYS: PENDING_STALE_DAYS,
    TRASH_DAYS: TRASH_DAYS,
    KEEP_YEARS: KEEP_YEARS,
    init: init,
    monthKey: monthKey,
    isKeepKind: isKeepKind,
    kindLabel: kindLabel,
    slotOf: slotOf,
    itemPath: itemPath,
    thumbPath: thumbPath,
    valuePath: valuePath,
    pendingPath: pendingPath,
    deputyPath: deputyPath,
    trashPath: trashPath,
    slotPath: slotPath,
    pendingBoxPath: pendingBoxPath,
    trashBoxPath: trashBoxPath,
    sharedPendingPath: sharedPendingPath,
    sharedPendingBoxPath: sharedPendingBoxPath,
    ownerPath: ownerPath,
    ownerBoxPath: ownerBoxPath,
    arrivalPath: arrivalPath,
    arrivalBoxPath: arrivalBoxPath,
    accessLogPath: accessLogPath,
    handoffLogPath: handoffLogPath,
    filePath: filePath,
    newId: newId,
    myUid: myUid,
    myName: myName,
    amAdmin: amAdmin,
    pendingRecord: pendingRecord,
    itemRecord: itemRecord,
    arrivalMarks: arrivalMarks,
    arrivalCount: arrivalCount,
    drawerUpdate: drawerUpdate,
    claimShared: claimShared,
    isStalePending: isStalePending,
    savePending: savePending,
    moveToDrawer: moveToDrawer,
    claimSharedNow: claimSharedNow,
    listMyPending: listMyPending,
    listSharedPending: listSharedPending,
    listArrivals: listArrivals,
    listSlot: listSlot,
    isExpired: isExpired,
    fileDownloadUrl: fileDownloadUrl,
    ERP_COMPANIES: ERP_COMPANIES,
    normalizeCompanies: normalizeCompanies,
    listCompanies: listCompanies,
    matchCompanyName: matchCompanyName
  };
})(typeof window !== 'undefined' ? window : globalThis);
