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
   4. 아래 칸 이름(items·pending·values·thumbs·trash·deputy·folders)은 **콘솔
      규칙과 한 글자도 다르면 안 된다.** 규칙이 u/$owner 아래 칸마다 쓰기를 열기
      때문에, 이름이 어긋나면 그 칸은 아무도 못 쓴다(조용히 저장이 안 된다). */
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

  /* 내 폴더 — 분류 탭과 다른 축이다(사진첩과 같은 원리). 탭은 「무엇인가」
     (근태·급여대장…), 폴더는 「어느 일인가」(예: 「2026 정기감사」). 사업장마다
     따로 관리한다 — 한 사업장의 일이 다른 사업장 서랍에 섞여 보이면 안 된다. */
  function foldersPath(companyId, owner) { return base(owner) + '/folders/' + companyId; }

  /* 휴가 대리 — 내가 맡긴 사람들. 콘솔 규칙이 이 칸의 쓰기를 **주인만**으로
     막아 둔다(대리인이 자기 기간을 늘리지 못하게). */
  function deputyBoxPath(owner) { return base(owner) + '/deputy'; }

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

  /* ══════ 파일 받기 ══════
     사진첩은 이미지만 담기지만 급여자료는 엑셀·PDF·한글 파일이 섞여 있다. */
  var UPLOAD_MAX = 25 * 1024 * 1024;   // 창고 한 건 상한. 넘으면 미리 막는다
  var BAD_EXT = ['exe', 'js', 'html', 'htm', 'bat', 'cmd', 'sh', 'com', 'scr', 'vbs', 'jar'];
  var MIME_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp',
    'application/pdf': 'pdf'
  };

  function extOf(name, mime) {
    var m = String(name || '').match(/\.([A-Za-z0-9]{1,8})$/);
    if (m) return m[1].toLowerCase();
    if (mime && MIME_EXT[mime]) return MIME_EXT[mime];
    return 'bin';
  }

  /* 받을 수 있는 파일인가. **조용히 실패하지 않는다** —
     「올렸다」고 생각하고 원본을 지우는 것이 가장 나쁘다. */
  function acceptFile(file) {
    if (!file) return { ok: false, why: '파일이 없습니다' };
    var size = Number(file.size || 0);
    if (!size) return { ok: false, why: '빈 파일입니다 — 다시 골라 주세요' };
    if (size > UPLOAD_MAX) {
      return { ok: false, why: '파일이 너무 큽니다 (' + Math.round(size / 1048576) + 'MB) — 25MB 아래로 줄여 주세요' };
    }
    var ext = extOf(file.name, file.type);
    if (BAD_EXT.indexOf(ext) >= 0) return { ok: false, why: '이 종류(' + ext + ')는 담지 않습니다' };
    return { ok: true, why: '' };
  }

  /* 창고에 올리고 **그 뒤에** 대기 칸 정보를 쓴다.
     순서가 뒤집히면 파일 없는 유령 자료가 목록에 남는다. */
  /* meta.owner 를 주면 대기 칸 정보가 **그 사람 자리**에 담긴다(휴가 대리로
     맡은 자리에 올릴 때 쓴다) — 파일 자체는 **항상 올린 사람**(나) 자리에 남는다.
     창고 규칙이 실시간DB를 못 봐서 대리인 판정을 창고에서 못 하기 때문이다. */
  function saveFile(file, meta) {
    var chk = acceptFile(file);
    if (!chk.ok) return Promise.reject(new Error(chk.why));
    meta = meta || {};
    var id = meta.id || newId();
    var ext = extOf(file.name, file.type);
    var at = meta.at || Date.now();
    var where = filePath('pending', id, ext);   // 대기 칸 자료는 아직 귀속월 칸이 없다 — 항상 내 창고 자리
    return deps.storage.ref(where).put(file).then(function () {
      var rec = pendingRecord({
        filename: file.name, file: where, mime: file.type,
        bytes: file.size, at: at, from: meta.from || 'upload'
      });
      var up = {};
      up[pendingPath(id, meta.owner)] = rec;
      return deps.db.ref().update(up).then(function () { return id; });
    });
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

  /* ══════ 휴지통 ══════
     정보만 옮긴다. **창고 파일은 그 자리에 남긴다** — 함께 지우면 되살릴 수 없다.
     창고 파일 실삭제는 30일 뒤 사람이 확인해서 한다(자동 삭제 없음). */
  function trashUpdate(id, rec, owner) {
    if (!id || !rec) throw new Error('지울 자료를 찾을 수 없습니다');
    var slot = String(rec.month || KEEP);
    var t = {};
    Object.keys(rec).forEach(function (k) { t[k] = rec[k]; });
    t.trashedAt = Date.now();
    t.trashedBy = deps.uid || '';
    var up = {};
    up[trashPath(id, owner)] = t;
    up[itemPath(slot, id, owner)] = null;
    /* 도착 표시도 함께 내린다 — 안 내리면 자료가 없는데 수신함이 「도착」이라 한다. */
    if (rec.companyId && rec.kind) {
      up[arrivalPath(rec.companyId, slot) + '/' + rec.kind + '/' + id] = null;
    }
    return up;
  }

  function restoreUpdate(id, rec, owner) {
    if (!id || !rec) throw new Error('되살릴 자료를 찾을 수 없습니다');
    var slot = String(rec.month || KEEP);
    var back = {};
    Object.keys(rec).forEach(function (k) {
      if (k !== 'trashedAt' && k !== 'trashedBy') back[k] = rec[k];
    });
    var up = {};
    up[itemPath(slot, id, owner)] = back;
    up[trashPath(id, owner)] = null;
    if (rec.companyId && rec.kind) {
      var marks = arrivalMarks(rec.companyId, slot, rec.kind, id, Date.now());
      Object.keys(marks).forEach(function (k) { up[k] = marks[k]; });
    }
    return up;
  }

  function listTrash(owner) {
    return deps.db.ref(trashBoxPath(owner)).once('value')
      .then(function (s) { return s.val() || {}; });
  }

  function trashExpired(rec, now) {
    var at = Number((rec && rec.trashedAt) || 0);
    if (!at) return false;
    return (Number(now || Date.now()) - at) > TRASH_DAYS * 86400000;
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

  /* ══════ 내 폴더 (사진첩과 같은 방식, 2026-08-13 추가) ══════
     ⚠ 콘솔 규칙에 이 칸이 없으면(2026-08-13 이전에 게시한 규칙) 아래 쓰기 함수가
     전부 「권한 거부」로 실패한다 — docs/급여데이터함-규칙-붙여넣기.md 1장 참고. */
  function listFolders(companyId, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(foldersPath(companyId, owner)).once('value').then(function (s) { return s.val() || {}; });
  }

  /* parentId 를 주면 그 폴더의 하위폴더가 된다 — 한 단계까지만(사진첩과 같은 원칙,
     좁은 칸에서 계속 파고들면 「어디 뒀더라」가 된다). 하위폴더 밑에 또 만들려
     하면 그 위(상위)로 끌어올린다. 같은 어버이 안에서 이름이 겹치면 새로 안 만든다. */
  function addFolder(companyId, name, parentId, owner) {
    var clean = String(name || '').trim();
    if (!companyId) return Promise.reject(new Error('사업장을 알 수 없습니다'));
    if (!clean) return Promise.reject(new Error('폴더 이름을 입력해 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return listFolders(companyId, owner).then(function (existing) {
      var parent = parentId || null;
      if (parent && existing[parent] && existing[parent].parent) parent = existing[parent].parent;
      var norm = clean.toLowerCase();
      var dupId = Object.keys(existing).filter(function (id) {
        var f = existing[id] || {};
        return (f.parent || null) === parent && String(f.name || '').trim().toLowerCase() === norm;
      })[0];
      if (dupId) return { id: dupId, created: false, parent: parent };
      var id = deps.db.ref(foldersPath(companyId, owner)).push().key;
      var up = {};
      up[foldersPath(companyId, owner) + '/' + id] = { name: clean, createdAt: Date.now(), parent: parent };
      return deps.db.ref().update(up).then(function () { return { id: id, created: true, parent: parent }; });
    });
  }

  function renameFolder(companyId, folderId, name, owner) {
    var clean = String(name || '').trim();
    if (!folderId) return Promise.reject(new Error('어느 폴더인지 알 수 없습니다'));
    if (!clean) return Promise.reject(new Error('폴더 이름을 입력해 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var up = {};
    up[foldersPath(companyId, owner) + '/' + folderId + '/name'] = clean;
    return deps.db.ref().update(up);
  }

  /* ⚠ 폴더를 지워도 자료는 안 지운다 — 이름표만 없앤다(사진첩과 같은 원칙).
     자료에 남은 folder 값은 가리키는 폴더가 없으므로 화면이 「전체」로만 본다.
     하위폴더가 있으면 함께 지운다 — 어버이만 지우면 하위폴더가 고아가 되어
     어느 목록에도 안 나온다. */
  function deleteFolder(companyId, folderId, owner) {
    if (!folderId) return Promise.reject(new Error('어느 폴더인지 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return listFolders(companyId, owner).then(function (existing) {
      var up = {};
      up[foldersPath(companyId, owner) + '/' + folderId] = null;
      Object.keys(existing).forEach(function (id) {
        if ((existing[id] || {}).parent === folderId) up[foldersPath(companyId, owner) + '/' + id] = null;
      });
      return deps.db.ref().update(up).then(function () { return { removed: Object.keys(up).length }; });
    });
  }

  /* 자료 하나를 폴더에 넣거나(folderId) 뺀다(folderId 없이 호출). 한 자료는
     폴더 하나에만 — 여러 곳에 겹치면 「어디에 뒀더라」가 된다. */
  function setFolder(slot, id, folderId, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var up = {};
    up[itemPath(slot, id, owner) + '/folder'] = folderId || null;
    return deps.db.ref().update(up);
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

  /* ══════ 로그인한 사람 이름 (사진첩과 같은 방식) ══════
     화면에 「p001@pureun.kr」가 아니라 사람 이름이 떠야 한다. 포털(enter.html)이
     쓰는 길을 그대로 쓴다: 공개 명부 data/user_dir 를 먼저 보고, 막히면
     data/user_accounts(재무권한자만 읽힌다) 순서. 사번을 이메일로 바꾸는 규칙도
     같아야 한다 — 다르면 같은 사람을 못 찾는다. */
  function sidToEmail(sid) {
    return String(sid || '').toLowerCase().replace(/-/g, '') + '@pureun.kr';
  }

  function pickFromRoster(list, email) {
    if (!list) return '';
    var em = String(email || '').toLowerCase();
    var arr = list;
    if (!Array.isArray(arr) && typeof arr === 'object') {
      arr = Object.keys(arr).map(function (k) { return arr[k]; });
    }
    if (!Array.isArray(arr)) return '';
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i];
      if (x && x.sid && sidToEmail(x.sid) === em && x.name) return x.name;
    }
    return '';
  }

  function readRoster(path) {
    return deps.db.ref(path).once('value').then(function (s) {
      var raw = s.val();
      return (raw && raw.v !== undefined) ? raw.v : raw;
    });
  }

  function lookupName(email) {
    if (!email || !deps.db) return Promise.resolve('');
    return readRoster('data/user_dir').then(function (dir) {
      var got = pickFromRoster(dir, email);
      if (got) return got;
      return readRoster('data/user_accounts')
        .then(function (l) { return pickFromRoster(l, email); })
        .catch(function () { return ''; });
    }).catch(function () {
      return readRoster('data/user_accounts')
        .then(function (l) { return pickFromRoster(l, email); })
        .catch(function () { return ''; });
    });
  }

  /* ══════ 이름 골라 보기 — 담당자 명단 ══════
     paydata/owners 는 「이름 고르개용 얇은 명단」이다(설계서 10장) — 이름·최근
     활동만 담고 자료는 넣지 않는다. 로그인할 때마다 내 이름을 적어 둔다 —
     그래야 남이 나를 「이름으로」 고를 수 있다.

     ⚠ 사진첩의 owners 는 관리자만 읽지만, 여기는 **전 직원이 읽는다**
     (대표 결정 2026-08-13 — 남의 자리를 전 직원이 이름 골라 볼 수 있다). */
  function touchOwner(name) {
    if (!deps.db || !deps.uid) return Promise.resolve();
    var up = {};
    up[ownerPath(deps.uid)] = { name: name || deps.uid, lastAt: Date.now() };
    return deps.db.ref().update(up).catch(function (e) { console.warn('[담당자 명단]', e && e.code); });
  }

  function listOwners() {
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref(ownerBoxPath()).once('value').then(function (s) { return s.val() || {}; });
  }

  /* 로그인 마무리 — 이름을 찾고 명단에 나를 적어 둔다. 이름을 못 찾아도
     로그인은 막지 않는다(이메일이라도 보이는 것이 빈칸보다 낫다). */
  function signIn(email, fallbackName) {
    deps.name = fallbackName || email || deps.uid || '';
    return lookupName(email).then(function (found) {
      if (found) deps.name = found;
      return touchOwner(deps.name);
    }).catch(function () { /* 명단 갱신 실패가 로그인을 막지 않는다 */ })
      .then(function () { return deps.name; });
  }

  /* ══════ 열람 기록 ══════
     남의 자리를 볼 때 「왜 보는가」를 남긴다(대표 결정 2026-08-13 — 전 직원
     열람 가능 + 사유 적기). 콘솔 규칙이 관리자만 읽게 하고, 한 번 쓰면
     못 고치게 막는다(!data.exists()) — 기록을 지울 수 있으면 기록이 아니다. */
  function logAccess(o) {
    o = o || {};
    var targetUid = String(o.targetUid || '');
    var reason = String(o.reason || '').trim();
    if (!targetUid) return Promise.reject(new Error('누구 자리인지 알 수 없습니다'));
    if (!reason) return Promise.reject(new Error('사유를 적어 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var id = newId();
    var up = {};
    up[accessLogPath(id)] = {
      byUid: deps.uid || '', byName: deps.name || '',
      targetUid: targetUid, targetName: String(o.targetName || ''),
      reason: reason, at: Date.now()
    };
    return deps.db.ref().update(up).then(function () { return id; });
  }

  /* ══════ 휴가 대리 ══════
     자리를 맡기는 것은 **주인만** 할 수 있다(콘솔 규칙이 deputy 칸 쓰기를
     $owner===auth.uid 로 막는다). 기간이 지나면 규칙이 저절로 닫는다 —
     사람이 거두지 않아도 닫히는 것이 이 설계의 핵심이다. */
  function setDeputy(deputyUid, deputyName, fromMs, toMs) {
    if (!deputyUid) return Promise.reject(new Error('맡길 사람을 골라 주세요'));
    if (!(toMs > (fromMs || 0))) return Promise.reject(new Error('끝나는 날이 시작하는 날보다 뒤여야 합니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var up = {};
    up[deputyBoxPath() + '/' + deputyUid] = {
      name: deputyName || deputyUid, from: Number(fromMs || Date.now()), to: Number(toMs)
    };
    return deps.db.ref().update(up);
  }

  /* 기간 중에도 바로 거둔다 — 굳이 기다릴 필요가 없다고 말씀하시면. */
  function revokeDeputy(deputyUid) {
    if (!deputyUid) return Promise.reject(new Error('누구를 거둘지 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var up = {};
    up[deputyBoxPath() + '/' + deputyUid] = null;
    return deps.db.ref().update(up);
  }

  /* 내가 맡긴 사람들 목록 — 내 자리 설정 화면이 보여준다. */
  function listMyDeputies(owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(deputyBoxPath(owner)).once('value').then(function (s) { return s.val() || {}; });
  }

  /* 지금 이 순간 유효한 대리인가 — 콘솔 규칙과 **같은 조건**이어야 한다
     (root.child(...).val() >= now). 여기서 다르게 판정하면 화면은 "맡았다"고
     보여 주는데 서버는 거절하는 어긋남이 생긴다. */
  function isActiveDeputy(rec, now) {
    return !!(rec && Number(rec.to || 0) >= Number(now || Date.now()));
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
    UPLOAD_MAX: UPLOAD_MAX,
    extOf: extOf,
    acceptFile: acceptFile,
    saveFile: saveFile,
    savePending: savePending,
    moveToDrawer: moveToDrawer,
    claimSharedNow: claimSharedNow,
    listMyPending: listMyPending,
    listSharedPending: listSharedPending,
    listArrivals: listArrivals,
    listSlot: listSlot,
    isExpired: isExpired,
    fileDownloadUrl: fileDownloadUrl,
    foldersPath: foldersPath,
    listFolders: listFolders,
    deputyBoxPath: deputyBoxPath,
    sidToEmail: sidToEmail,
    pickFromRoster: pickFromRoster,
    readRoster: readRoster,
    lookupName: lookupName,
    touchOwner: touchOwner,
    listOwners: listOwners,
    signIn: signIn,
    logAccess: logAccess,
    setDeputy: setDeputy,
    revokeDeputy: revokeDeputy,
    listMyDeputies: listMyDeputies,
    isActiveDeputy: isActiveDeputy,
    trashUpdate: trashUpdate,
    restoreUpdate: restoreUpdate,
    listTrash: listTrash,
    trashExpired: trashExpired,
    addFolder: addFolder,
    renameFolder: renameFolder,
    deleteFolder: deleteFolder,
    setFolder: setFolder,
    ERP_COMPANIES: ERP_COMPANIES,
    normalizeCompanies: normalizeCompanies,
    listCompanies: listCompanies,
    matchCompanyName: matchCompanyName
  };
})(typeof window !== 'undefined' ? window : globalThis);
