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
    amAdmin: amAdmin
  };
})(typeof window !== 'undefined' ? window : globalThis);
