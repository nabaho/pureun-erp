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

  var deps = { db: null, storage: null, uid: '', isAdmin: false, isFin: false, name: '', fetch: null };

  /* 파이어베이스 객체와 계정을 받아 저장 층을 준비한다.
     이미 넣어 둔 값은 안 넘기면 그대로 둔다 — 로그인 뒤 권한만 나중에 알려 줄 수 있어야 한다. */
  function init(o) {
    o = o || {};
    if (o.db) deps.db = o.db;
    if (o.storage) deps.storage = o.storage;
    if (o.uid !== undefined) deps.uid = o.uid || '';
    if (o.isAdmin !== undefined) deps.isAdmin = !!o.isAdmin;
    if (o.isFin !== undefined) deps.isFin = !!o.isFin;
    if (o.name) deps.name = o.name;
    if (o.fetch) deps.fetch = o.fetch;
    else if (deps.fetch === null) deps.fetch = (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
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
  function valueBoxPath(slot, owner) { return base(owner) + '/values/' + slot; }
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
  /* 업체 공유 — 내 업체를 다른 담당자에게 「이거 봐 주세요」로 알린다(대표 지시
     2026-08-14). pending_shared 와 같은 열린 칸이다 — 받는 사람의 자리(u/$owner)
     안이 아니라 자리 **밖**에 두는 이유는, 자리 밖 칸이라야 상대가 자기 것이
     아닌데도 쓸 수 있기 때문이다(콘솔 규칙을 새로 열 필요가 없다). */
  function sharePath(targetUid, id) { return DB_ROOT + '/shares/' + targetUid + '/' + id; }
  function shareBoxPath(targetUid) { return DB_ROOT + '/shares/' + targetUid; }
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
  function amFin() { return deps.isFin; }
  /* 급여관리(payroll_os)로 값을 넘길 수 있는가 — 콘솔 규칙이 그 칸 쓰기를
     재무권한(fin) 또는 관리자로 이미 막아 뒀다(급여데이터함이 새로 여는 게 아니다).
     화면이 이 함수로 미리 갈라야 권한 없는 사람이 헛눌러 실패하는 일이 없다. */
  function canHandoffPayroll() { return deps.isAdmin || deps.isFin; }

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

  /* 파일 하나를 **곧장 서랍으로** 담는다 — 서랍 위에 끌어다 놓았을 때 쓴다
     (대표 지시 2026-08-17: 「놓는 자리가 곧 이름표」).
     사업장·귀속월·종류를 이미 사람이 정해 놓고 놓은 것이라 대기 칸을 거칠 이유가
     없다. 창고에 올리고(saveFile) 곧바로 서랍 묶음을 쓴다.
     ⚠ 이름표가 덜 채워졌으면 **대기 칸에 그대로 둔다.** 억지로 서랍에 넣으면
     귀속월 없는 자료가 어느 칸에도 안 걸려 사라진 것처럼 된다.
     돌려주는 것: { id, filed } — filed 가 false 면 대기 칸에 남았다는 뜻이다. */
  function saveFileToDrawer(file, tag, owner) {
    tag = tag || {};
    return saveFile(file, { at: tag.at || Date.now(), from: tag.from || 'drop', owner: owner })
      .then(function (id) {
        var rec = pendingRecord({
          filename: file.name, mime: file.type, bytes: file.size,
          at: tag.at || Date.now(), from: tag.from || 'drop'
        });
        rec.file = filePath('pending', id, extOf(file.name, file.type), deps.uid);
        var up;
        try { up = drawerUpdate(id, rec, tag, owner); }
        catch (_) { return { id: id, filed: false }; }   // 이름표가 덜 찼다 — 대기 칸에 둔다
        return deps.db.ref().update(up).then(function () { return { id: id, filed: true }; });
      });
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

  /* 대기 칸 자료를 휴지통으로 (2026-08-15 — 골라서 한꺼번에).
     ⚠ trashUpdate 를 그대로 쓰면 안 된다. 그것은 **서랍** 자료를 지우는 것이라
     items/<칸> 을 비우는데, 대기 칸 자료는 거기 있지도 않다 — pending 자리는
     그대로 남아 휴지통과 대기 칸 **양쪽에** 같은 자료가 보이게 된다.
     되살릴 때 어디로 돌려보낼지도 알아야 하므로 fromPending 표를 달아 둔다
     (사업장·귀속월이 없으니 서랍으로 돌려보낼 수가 없다). */
  function trashPendingUpdate(id, rec, owner) {
    if (!id || !rec) throw new Error('지울 자료를 찾을 수 없습니다');
    var t = {};
    Object.keys(rec).forEach(function (k) { t[k] = rec[k]; });
    t.trashedAt = Date.now();
    t.trashedBy = deps.uid || '';
    t.fromPending = true;
    var up = {};
    up[trashPath(id, owner)] = t;
    up[pendingPath(id, owner)] = null;
    return up;
  }

  function restoreUpdate(id, rec, owner) {
    if (!id || !rec) throw new Error('되살릴 자료를 찾을 수 없습니다');
    var back = {};
    Object.keys(rec).forEach(function (k) {
      if (k !== 'trashedAt' && k !== 'trashedBy' && k !== 'fromPending') back[k] = rec[k];
    });
    var up = {};
    /* 대기 칸에서 지운 것은 **대기 칸으로** 돌아간다 — 사업장·귀속월이 없어
       서랍에 넣으면 어느 칸에도 안 걸리는 유령이 된다. */
    if (rec.fromPending) {
      up[pendingPath(id, owner)] = back;
      up[trashPath(id, owner)] = null;
      return up;
    }
    var slot = String(rec.month || KEEP);
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

  /* ⚠ 맡기는 **먼저 공용 칸에서 빼고** 내 자리에 넣는다(대표 지시 2026-08-17).
     둘이 같은 것을 동시에 누를 때, 그냥 쓰면 둘 다 성공해 **한 자료가 두 사람
     자리에 생긴다.** 빼는 것을 transaction 으로 하면 한 사람만 이긴다 —
     진 사람에게는 false 를 돌려주어 화면이 「방금 다른 분이 맡았습니다」라고 한다.
     ⚠ 빼고 나서 넣기가 실패하면 자료가 **어디에도 없게 된다.** 그래서 실패하면
     공용 칸에 도로 넣고 오류를 올린다 — 사라지느니 두 번 보이는 편이 낫다. */
  function claimSharedSafe(id) {
    if (!id) return Promise.reject(new Error('자료 번호가 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var got = null;
    var ref = deps.db.ref(sharedPendingPath(id));
    return ref.transaction(function (cur) {
      if (cur === null || cur === undefined) { got = null; return; }
      got = cur;
      return null;
    }).then(function (res) {
      if (!res || !res.committed || !got) return false;
      var mine = pendingRecord(got);
      mine.by = deps.uid || '';
      mine.claimedBy = deps.uid || '';
      mine.claimedAt = Date.now();
      var up = {};
      up[pendingPath(id)] = mine;
      return deps.db.ref().update(up).then(function () { return true; })
        .catch(function (e) {
          return ref.set(got).then(function () { throw e; }, function () { throw e; });
        });
    });
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

  /* ══════ 그 업체·그 달만 (대표 지시 2026-08-17 「다섯 이상 동시 접속」) ══════
     ⚠ 자료를 한 건 담을 때마다 **도착 칸을 통째로** 다시 받고 있었다. 112곳 ×
     열두 달 × 종류별로 쌓이면 다섯이 각자 그것을 반복한다 — 느려지고 요금이 된다.
     담은 그 자리만 다시 읽으면 화면 숫자는 그대로 맞는다. */
  function listArrivalOne(companyId, slot) {
    if (!companyId || !slot) return Promise.resolve(null);
    return deps.db.ref(arrivalPath(companyId, slot)).once('value')
      .then(function (s) { return s.val() || null; });
  }

  /* 그 업체·그 달을 **지켜본다** — 남이 담으면 그 자리에 곧바로 뜬다.
     ⚠ 전체를 지켜보지 않는다. 다섯이 각자 112곳을 계속 받으면 요금이 된다.
     ⚠ once() 로 먼저 읽고 on() 을 또 걸면 **같은 값을 두 번 받는다.** 그래서
     여기서는 on() 하나만 쓰고 **첫 번째로 오는 값을 처음 값으로** 삼는다.
     ⚠ 돌려주는 함수를 반드시 불러 끊어야 한다 — 안 끊으면 서랍을 옮길 때마다
     지켜보기가 하나씩 쌓여, 한 번 담을 때 열 번 그려진다. */
  function watchArrival(companyId, slot, cb) {
    if (!companyId || !slot || typeof cb !== 'function') return function () {};
    var ref = deps.db.ref(arrivalPath(companyId, slot));
    var handler = ref.on('value', function (s) { cb(s.val() || null); },
      function (e) { console.warn('[도착 지켜보기]', e && e.code); });
    return function () { try { ref.off('value', handler); } catch (_) { /* 이미 끊겼다 */ } };
  }

  /* 내 업체를 다른 담당자에게 공유한다 — 공유는 권한을 주는 것이 아니라
     「이거 봐 주세요」 알림이다(대표 결정 2026-08-14: 보기 권한은 원래대로,
     대시보드에 표시만 뜬다). 공유사항(tags)은 최소 하나 있어야 한다 — 아무 표시
     없이 이름만 넘기면 받는 사람이 왜 왔는지 모른다. */
  function shareCompany(o) {
    o = o || {};
    var targetUid = String(o.targetUid || '');
    var tags = Array.isArray(o.tags) ? o.tags.filter(Boolean) : [];
    if (!targetUid) return Promise.reject(new Error('공유할 사람을 골라 주세요'));
    if (!o.companyId) return Promise.reject(new Error('사업장을 알 수 없습니다'));
    if (!tags.length) return Promise.reject(new Error('공유사항을 하나 이상 체크해 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var id = newId();
    var up = {};
    up[sharePath(targetUid, id)] = {
      companyId: o.companyId, companyName: String(o.companyName || ''),
      byUid: deps.uid || '', byName: deps.name || '',
      tags: tags, at: Number(o.at || Date.now())
    };
    return deps.db.ref().update(up).then(function () { return id; });
  }

  function listShares(targetUid) {
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref(shareBoxPath(targetUid)).once('value').then(function (s) { return s.val() || {}; });
  }

  /* 공용 대기 칸 목록 — 서버가 메일로 받은 것. */
  function listSharedPending() {
    return deps.db.ref(sharedPendingBoxPath()).once('value')
      .then(function (s) { return s.val() || {}; });
  }

  /* ══════ 메일로 온 것 (대표 지시 2026-08-17) ══════
     서버는 보낸사람·제목을 **note 한 줄**에 적어 둔다(functions/mail-receive.js
     sharedPendingRecord). 따로 칸을 만들면 집어가는 순간 앱이 모르는 칸이라
     버려지기 때문이다. 그래서 화면은 그 한 줄을 도로 풀어 써야 한다.
     ⚠ 모양이 「메일 <주소> · <제목>」이다 — 서버 쪽을 고치면 여기도 함께 고친다. */
  function mailNote(note) {
    var s = String(note == null ? '' : note).replace(/^메일\s*/, '');
    var at = s.indexOf(' · ');
    if (at < 0) return { from: s.trim(), subject: '' };
    return { from: s.slice(0, at).trim(), subject: s.slice(at + 3).trim() };
  }

  /* 보낸 주소로 업체를 찾는다 — **이 길이 파일 이름 짐작보다 정확하다.**
     업체관리의 메일 칸 이름이 앱마다·시기마다 달라(email·이메일·담당자메일…)
     칸 이름을 못 박지 않고 값에서 주소처럼 생긴 것을 다 훑는다(서버와 같은 방식).
     ⚠ 이름을 못 박으면 칸 이름이 바뀐 날 조용히 아무도 안 걸린다. */
  var MAIL_RE = /[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}/g;

  function emailsIn(node, out, depth) {
    out = out || []; depth = depth || 0;
    if (node == null || depth > 4) return out;
    if (typeof node === 'string') {
      var m = node.match(MAIL_RE);
      if (m) m.forEach(function (e) { out.push(e.toLowerCase()); });
      return out;
    }
    if (typeof node !== 'object') return out;
    Object.keys(node).forEach(function (k) { emailsIn(node[k], out, depth + 1); });
    return out;
  }

  function companyByEmail(email, list) {
    var want = String(email || '').trim().toLowerCase();
    if (!want) return null;
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      if (emailsIn(arr[i]).indexOf(want) >= 0) return arr[i];
    }
    return null;
  }

  /* 한 칸(귀속월 또는 keep)의 자료 목록. 본문·미리보기는 안 따라온다.
     ⚠ 이 칸에는 **모든 사업장**의 자료가 섞여 있다(itemPath 에 사업장 번호가 없다) —
     사업장별로 가르는 것은 화면이 companyId 로 걸러서 한다. */
  function listSlot(slot, owner) {
    return deps.db.ref(slotPath(slot, owner)).once('value')
      .then(function (s) { return s.val() || {}; });
  }

  /* ══════ 한 업체를 여럿이 맡을 때 (대표 지시 2026-08-17) ══════
     담기는 늘 **자기 자리**다. 그런데 서랍을 열면 자기 자리만 보여, 부담당이 그
     업체를 열면 주담당이 담아 둔 것이 안 보였다 — 목록 줄에는 「3장」인데 서랍은
     「0건」. 그 사람은 「아직 안 왔구나」 하고 업체에 다시 달라고 한다.
     그래서 그 업체를 맡은 **모든 담당자 자리**를 모아 읽는다.
     ⚠ 한 자리를 못 읽어도 나머지는 보여 준다 — 한 사람 것이 안 읽힌다고 서랍이
     통째로 비면 자료가 사라진 것으로 읽힌다.
     ⚠ 줄마다 **누가 담았는지**(_by)를 붙인다. 이것이 없으면 고칠 수 있는 것과
     없는 것을 화면이 못 가른다 — 남의 자리 자료는 규칙이 쓰기를 막는다. */
  function listSlotMany(slot, owners) {
    var seen = {};
    var list = (owners || []).filter(function (u) {
      if (!u || seen[u]) return false;
      seen[u] = 1; return true;
    });
    if (!list.length) return Promise.resolve({});
    return Promise.all(list.map(function (uid) {
      return listSlot(slot, uid).then(
        function (v) { return { uid: uid, box: v || {} }; },
        function (e) { return { uid: uid, box: {}, err: e }; });
    })).then(function (parts) {
      var out = {};
      parts.forEach(function (p) {
        Object.keys(p.box).forEach(function (id) {
          var rec = p.box[id];
          if (!rec || typeof rec !== 'object') return;
          /* 자료 번호는 시각+무작위라 자리끼리 겹칠 일이 사실상 없다. 그래도
             겹치면 **먼저 온 것을 지키고** 뒤엣것을 버리지 않도록 번호에 자리를
             덧붙인다 — 조용히 한 건이 사라지는 것이 가장 나쁘다. */
          var key = Object.prototype.hasOwnProperty.call(out, id) ? (p.uid + ':' + id) : id;
          out[key] = Object.assign({}, rec, { _by: p.uid, _id: id });
        });
      });
      return out;
    });
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

  /* 바이트 배열 → base64. btoa 가 있으면(브라우저) 그것을 쓰고, 없으면(검사 환경)
     Buffer 로 같은 계산을 한다 — 결과가 같아야 검사와 실제 화면이 같은 것을 본다. */
  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    if (typeof global.btoa === 'function') return global.btoa(bin);
    return Buffer.from(bin, 'binary').toString('base64');
  }

  /* 창고 파일(사진첩과 달리 실시간DB가 아니라 Storage 에 있다)을 AI 판독기에
     바로 실을 수 있는 data URL 로 바꾼다. 사진첩은 사진을 실시간DB 블롭으로 두어
     이 변환이 필요 없었지만, 급여데이터함은 Storage 를 쓰므로 새로 만든다. */
  function fileToDataUrl(path, mime) {
    if (!deps.fetch) return Promise.reject(new Error('파일을 불러올 수 없습니다'));
    return fileDownloadUrl(path).then(function (url) {
      return deps.fetch(url).then(function (r) {
        if (!r || !r.ok) throw new Error('파일을 불러오지 못했습니다');
        return r.arrayBuffer();
      });
    }).then(function (buf) {
      return 'data:' + (mime || 'application/octet-stream') + ';base64,' + bytesToBase64(new Uint8Array(buf));
    });
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

  /* 골라 둔 자료를 한꺼번에 옮긴다 — **쓰기는 한 번**이다.
     건마다 따로 쓰면 중간에 끊겼을 때 절반만 옮겨진 채 아무도 모른다.
     경로를 아는 곳은 이 파일 한 군데라는 원칙 때문에 화면이 아니라 여기서 만든다. */
  function setFolderMany(slot, ids, folderId, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var list = (ids || []).filter(Boolean);
    if (!list.length) return Promise.resolve(0);
    var up = {};
    list.forEach(function (id) { up[itemPath(slot, id, owner) + '/folder'] = folderId || null; });
    return deps.db.ref().update(up).then(function () { return list.length; });
  }

  /* ══════ 값 층 ══════
     원본(사진·엑셀·PDF)과 값(근로자·항목·금액)을 두 층으로 나눈다(설계서 3장).
     사진 한 장에 근로자가 열 명이면 값은 **열 줄**이다 — 사진 한 장 = 값 한 줄이 아니다.
     값 한 줄에는 반드시 **출처(원본 번호)**가 붙는다 — 없으면 몇 달 뒤 "이 수당
     어디서 나온 거냐"에 답을 못 한다. */

  /* ══════ 판독 결과 → 값 줄 (2026-08-15) ══════
     판독 결과가 서류마다 모양이 다르다. buildValueRows 가 받는
     {name, pairs:[{item,value}]} 하나로 맞춘다. 근태만 모양이 다르고
     (paid·off 가 날짜 배열) 나머지 둘은 이미 맞는 모양이라 그대로 흘린다. */

  /* 서랍 종류 → 판독 방식. null 이면 그 탭에는 판독 단추를 그리지 않는다.
     근로계약서는 값을 뽑을 것이 아니고, 우리 산출물은 우리가 만든 것이라
     다시 읽을 이유가 없다. */
  function readKindFor(kind) {
    if (kind === 'attend') return 'timesheet';
    if (kind === 'ledger') return 'wage';
    if (kind === 'etc') return 'notice';
    return null;
  }

  /* 값이 비면 그 항목을 아예 만들지 않는다 — 0 과 「없음」은 다르다.
     (월별 값 표에서 없는 항목은 0 이 아니라 「－」로 보여야 한다) */
  function pushPair(pairs, item, value) {
    var v = String(value == null ? '' : value).trim();
    if (v) pairs.push({ item: item, value: v });
  }

  /* ── 판독기가 「이 줄은 확실하지 않다」고 말한 것 ──
     근태표 프롬프트(js/pu-doc-read.js PROMPT_ALL)는 흐려서 못 읽은 숫자를 지어내지
     말고 **그 줄 note 에 「일부 판독 불확실」을 덧붙이라**고 시킨다. 그 표시를 여기서
     버리면 스무 명 중 한 명만 흐렸던 줄이 확신한 열아홉 줄과 똑같이 보인다 —
     어디를 먼저 봐야 하는지 알 길이 없다. 그래서 값 줄에 iffy 로 달아 보낸다
     (판독 패널이 그 줄을 노랗게 칠하고 「⚠ N줄은 확실하지 않습니다」로 센다). */
  function isIffyNote(v) { return /불확실/.test(String(v == null ? '' : v)); }

  function rowsFromRead(readKind, parsed) {
    var src = (parsed && parsed.rows) || [];
    var out = [];
    src.forEach(function (r) {
      var name = String((r && r.name) || '').trim();
      if (!name) return;
      var iffy = isIffyNote(r && r.note);
      var pairs = [];
      if (readKind === 'timesheet') {
        var paid = Array.isArray(r.paid) ? r.paid : [];
        var off = Array.isArray(r.off) ? r.off : [];
        if (paid.length) pushPair(pairs, '유급일수', paid.length + '일');
        if (off.length) pushPair(pairs, '휴무일수', off.length + '일');
        pushPair(pairs, '가감', r.adj);
        pushPair(pairs, '비고', r.note);
      } else if (readKind === 'wage' || readKind === 'notice') {
        (Array.isArray(r.pairs) ? r.pairs : []).forEach(function (p) {
          var item = String((p && p.item) || '').trim();
          if (item) pushPair(pairs, item, p && p.value);
        });
      } else {
        return;                       // 모르는 방식은 아무것도 만들지 않는다
      }
      if (!pairs.length) return;      // 항목이 하나도 없으면 값 줄이 아니다
      out.push({ name: name, pairs: pairs, iffy: iffy });
    });
    return out;
  }

  /* 판독 결과({company,period,docName,rows:[{name,pairs:[{item,value}]}]}) →
     값 줄 배열. 순수 함수라 AI 없이도 검사할 수 있다.
     ⚠ item·value 는 문서에 적힌 이름 그대로 담는다(판독 층의 pairs 규칙과 같다) —
     "기본급"을 "기본임금"으로 바꿔 적으면 원본과 대조할 수 없다. */
  function buildValueRows(parsed, tag) {
    tag = tag || {};
    if (!tag.sourceId) throw new Error('출처(원본 번호)가 없습니다');
    if (!tag.companyId) throw new Error('사업장을 알 수 없습니다');
    var slot = tag.slot || (tag.month ? monthKey(tag.month) : null);
    if (!slot) throw new Error('귀속월을 알 수 없습니다');
    var people = (parsed && parsed.rows) || [];
    var at = Number(tag.at || Date.now());
    return people.map(function (p) {
      return {
        id: newId(),
        sourceId: tag.sourceId,
        companyId: tag.companyId,
        companyName: String(tag.companyName || parsed.company || ''),
        month: slot,
        name: String((p && p.name) || ''),
        pairs: ((p && p.pairs) || []).map(function (pr) {
          return { item: String((pr && pr.item) || ''), value: String((pr && pr.value) || '') };
        }),
        /* 사람이 확인했는가 — **부르는 쪽이 정한다.** 화면에서 「저장」을 누른 것이
           곧 사람의 확인이다(원본을 옆에 놓고 줄을 고친 뒤 스스로 누른 것이므로).
           예전에는 여기서 false 로 못 박아, 확인이 끝난 줄까지 값 표에서 영영
           노랗게 떴다 — 설계서 3장 ②가 막으라고 한 바로 그 상태다(한 달만 지나면
           노랑을 「원래 그런 것」으로 읽어, 정말 확인 안 된 값이 그대로 더존에 들어간다).
           기계가 만들기만 하고 사람이 받아들이지 않은 값은 이 칸을 안 주면 된다 —
           그때는 그대로 false 로 남아 노랗게 뜬다.

           ⚠ 그런데 saveVals 는 서류 한 장(스무 줄)을 confirmed:true 하나로 통째로
           보낸다 — 그 안에서 AI 스스로 「일부 판독 불확실」이라 표시한 줄(p.iffy,
           rowsFromRead 머리말 참고)까지 함께 true 가 되면, 사람이 보지도 않은
           줄이 확인된 값으로 값 표에서 하얗게 뜬다. 그러니 tag.confirmed 를
           그대로 믿지 않고 그 줄 자신의 iffy 로 한 번 더 거른다 — 사람이 고치면
          (editVal) iffy 가 false 로 내려가 다시 true 로 돌아온다(설계서 §8 1↔7·
           4↔9·0↔6 같은 필체 오독을 사람이 마지막에 잡으라는 것이 §8 의 요지다). */
        confirmed: !!tag.confirmed && !p.iffy,
        by: deps.uid || '',
        at: at
      };
    });
  }

  /* 값 줄 하나 = 「근로자 × 원본 서류」 하나다. 같은 사업장·귀속월·근로자에
     **같은 출처 서류**의 값이 이미 있으면 그 자리 id 를 돌려준다 — 있으면
     「덮을까요」를 물을 수 있게. 같은 캡처는 실제로 두 번 올라온다.

     ⚠ 출처(sourceId)까지 봐야 하는 까닭 (2026-08-15)
     예전에는 사업장·월·이름 셋만 봤다. 그러면 한 근로자의 근태표를 읽어 저장한
     뒤 수당변경 카톡을 읽어 저장할 때 카톡이 「이미 있다」로 잡혔고, 동의를 받아
     그 자리에 다시 쓰면 saveValues 가 **줄을 통째로** 바꾸므로 근태표에서 나온
     유급일수·휴무일수가 함께 사라졌다. 화면에는 「－」로 보여 「아직 안 읽음」과
     구별조차 되지 않고, 되살릴 길도 없었다.
     한 근로자에게 서류가 여러 장 오는 것은 예외가 아니라 보통이다(설계서 1장).
     넷이 다 같을 때라야 **같은 서류를 다시 읽은 것**이고, 그때만 그 자리에 다시
     쓰는 것이 옳다. 서류가 다르면 중복이 아니라 제 자리를 가진 새 줄이다.

     ⚠ 출처를 열쇠에 넣으면 실제로는 맞는 줄이 하나뿐이지만, 훑는 차례는 그래도
     못 박는다 — Object.keys 차례는 실시간DB가 보장하지 않는다(값 표에서 at 로
     줄을 세운 것과 같은 까닭). 옛 자료에 이름만 같은 줄이 둘 남아 있어도 어느
     줄을 덮을지가 새로고침마다 달라지면 안 된다. */
  function findDuplicateValue(existingRows, companyId, month, name, sourceId) {
    var box = existingRows || {};
    var ids = Object.keys(box).sort();
    var want = String(sourceId == null ? '' : sourceId);
    for (var i = 0; i < ids.length; i++) {
      var r = box[ids[i]];
      if (!r) continue;
      if (r.companyId !== companyId || r.month !== month || r.name !== name) continue;
      if (String(r.sourceId == null ? '' : r.sourceId) !== want) continue;
      return ids[i];
    }
    return null;
  }

  /* 「같은 근로자의 같은 항목이 **다른 서류**에서도 들어와 있다」를 찾는다.
     겹쳐도 아무것도 지우지 않는다 — 옛 줄은 제 출처를 달고 그대로 남고, 값 표는
     그중 나중에 저장한 값을 보여줄 뿐이다(valueGridModel 의 at 오름차순).
     그래도 사람에게는 알려야 한다: 표에 보이던 금액이 방금 읽은 서류의 금액으로
     바뀌기 때문이다. 모르고 지나가면 「왜 숫자가 달라졌지」가 된다.
     돌려주는 모양: [{name, item, sourceId}] — 어느 서류와 겹쳤는지까지 알린다. */
  function findValueOverlaps(existingRows, row) {
    var box = existingRows || {};
    var out = [];
    if (!row) return out;
    var mine = {};
    ((row && row.pairs) || []).forEach(function (p) {
      var it = String((p && p.item) || '').trim();
      if (it) mine[it] = 1;
    });
    var seen = {};
    Object.keys(box).sort().forEach(function (id) {
      var r = box[id];
      if (!r) return;
      if (r.companyId !== row.companyId || r.month !== row.month || r.name !== row.name) return;
      /* 같은 서류면 겹침이 아니라 「다시 읽기」다 — 그 줄은 어차피 이 자리에 다시 쓴다 */
      if (String(r.sourceId == null ? '' : r.sourceId) === String(row.sourceId == null ? '' : row.sourceId)) return;
      (r.pairs || []).forEach(function (p) {
        var it = String((p && p.item) || '').trim();
        if (!it || !mine[it] || seen[it]) return;
        seen[it] = 1;
        out.push({ name: row.name, item: it, sourceId: r.sourceId || '' });
      });
    });
    return out;
  }

  /* ══════ 표까지 됐다는 것을 도착 칸에도 적는다 (대표 지시 2026-08-17) ══════
     「우선 데이터가 들어온 것을 정확하게 확인해야 한다」 — 그런데 사진만 온 것과
     **표까지 나온 것**이 사업장 목록에서 똑같이 「3장」으로 보였다. 다음에 할 일이
     판독인지 대조인지 가릴 수가 없다.
     ⚠ 값은 **사람 자리마다 따로** 있어(paydata/$uid/values) 남의 것을 세려면 자리를
     옮겨야 한다. 도착 칸은 **전 직원 공용**이라, 여기에 적어야 사업장 목록이 한 번의
     읽기로 안다. 값 자체가 아니라 **몇 사람분인지**만 적는다 — 이름은 안 나간다. */
  function valsPath(companyId, slot) { return arrivalPath(companyId, slot) + '/vals'; }

  /* 그 사업장 그 달 표에 이름이 몇인가. 이미 있던 줄과 이번에 저장할 줄을 함께
     센다 — 이번 것만 세면 두 번째 서류를 읽을 때 사람 수가 오히려 줄어든다. */
  function valuePeopleCount(box, companyId, extraRows) {
    var seen = {};
    var add = function (r) {
      if (!r || r.companyId !== companyId) return;
      var n = String(r.name == null ? '' : r.name).trim();
      if (n) seen[n] = 1;
    };
    Object.keys(box || {}).forEach(function (id) { add((box || {})[id]); });
    (extraRows || []).forEach(add);
    return Object.keys(seen).length;
  }

  /* 값 줄들을 한 묶음으로 쓴다 — 다 쓰거나 하나도 안 쓰거나.
     mark 를 주면 도착 칸의 「표 몇 명」도 **같은 묶음**으로 쓴다 — 따로 쓰면
     「값은 있는데 목록은 판독 전이라고 한다」가 된다. */
  function saveValues(slot, rows, owner, mark) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var up = {};
    (rows || []).forEach(function (r) { up[valuePath(slot, r.id, owner)] = r; });
    if (mark && mark.companyId && slot) up[valsPath(mark.companyId, slot)] = Number(mark.people || 0);
    return deps.db.ref().update(up).then(function () { return (rows || []).length; });
  }

  function listValues(slot, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(valueBoxPath(slot, owner)).once('value').then(function (s) { return s.val() || {}; });
  }

  /* ⚠ confirmValue(값 한 줄만 확인 처리) 는 **일부러 두지 않는다**(2026-08-15).
     만들어 두었지만 부르는 곳이 한 군데도 없었다 — 있는 것처럼 보이는 함수가
     저장 층에 남아 있으면, 다음 사람이 「확인 처리는 이미 된다」고 믿고 넘어간다.
     사람의 확인은 화면의 「저장」 하나로 들어온다(buildValueRows 의 tag.confirmed).
     줄 하나만 따로 확인 처리할 화면이 생기면 그때 다시 만든다. */

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
      /* managerMain·managerSubs 는 업체관리(푸른이알피)가 쓰는 것과 **같은 이름·같은
         자료형**(사번 문자열, 사번 배열)이다 — 대표 지시 2026-08-13 "업체는 푸른이알피에서
         당겨오기". 담당자별 대시보드는 여기서 이 두 칸을 가지고 가른다. */
      out.push({
        id: id, name: name, biz: String(row.사업자등록번호 || row.biz || ''),
        /* 유형·상태·계약중단 — 셋 다 업체관리가 쓰는 이름 그대로다.
           typeCode: '자문'|'급여'|'노조'|'기금'|'사무대행'(COMPANY_TYPE_SEED)
           status:   'active'|'closed'|'suboffice' (종료하면 closed 로 바뀐다)
           suspended: 계약 중단 체크 — status 와 **따로** 켜지는 칸이라
                      중단해도 status 는 active 그대로다. 둘 다 봐야 한다. */
        typeCode: String(row.typeCode || ''),
        status: String(row.status || ''),
        suspended: !!row.suspended,
        managerMain: String(row.managerMain || ''),
        managerSubs: Array.isArray(row.managerSubs) ? row.managerSubs.slice() : []
      });
    }
    return out;
  }

  /* 급여데이터함이 다룰 업체인가 (대표 지시 2026-08-17: "급여데이터함은 업체관리에서
     사업장을 연결해서 관리하려는 것" — 유형이 「급여」인 곳만, 계약중단은 뺀다).
     안 거르면 자문·노조·기금까지 371곳이 다 나와 내 업체를 못 찾는다.
     status==='active' 는 업체관리 목록이 쓰는 기준 그대로다(종료한 업체 제외).

     ⚠ 목록에서 감추는 것일 뿐, **이미 담긴 자료는 그대로 있다.** 유형이 급여가
     아닌 곳에 담긴 자료는 첫 화면 아래쪽에 따로 모아 보여 준다(offType) —
     감추기만 하면 자료가 사라진 줄 안다. */
  function isPayrollCompany(co) {
    if (!co) return false;
    if (co.suspended) return false;
    if (String(co.status || '') !== 'active') return false;
    return String(co.typeCode || '') === '급여';
  }

  function payrollCompanies(list) {
    return (list || []).filter(isPayrollCompany);
  }

  function listCompanies() {
    return deps.db.ref(ERP_COMPANIES).once('value').then(function (s) {
      return normalizeCompanies(s.val());
    });
  }

  /* 이 업체를 내가 담당하는가 — 사번을 이메일로 바꿔 견준다(sidToEmail 규칙이
     명함첩·포털과 같아야 같은 사람을 찾는다). 주담당·부담당 모두 「내 담당」이다. */
  function isMyCompany(co, myEmail) {
    if (!co || !myEmail) return false;
    var em = String(myEmail).toLowerCase();
    if (co.managerMain && sidToEmail(co.managerMain) === em) return true;
    var subs = co.managerSubs || [];
    for (var i = 0; i < subs.length; i++) {
      if (sidToEmail(subs[i]) === em) return true;
    }
    return false;
  }

  /* ══════ 담당자 명단을 업체관리에서 뽑는다 (대표 지시 2026-08-17) ══════
     "각 담당자를 대시보드에 넣고 사업장도 우선 배정해달라."

     예전에는 paydata/owners — **한 번이라도 급여데이터함에 로그인한 사람** — 에서
     뽑았다. 그래서 담당자 대부분이 아예 안 보이고 「아직 들어온 다른 사람이
     없습니다」만 남았다. 배정이 없는 게 아니라 명단을 잘못된 곳에서 뽑은 것이다.

     이제 급여 업체의 주담당·부담당(사번)을 모아 세운다 — **업체관리에 적힌 담당이
     곧 배정이다.** 이알피에서 담당을 바꾸면 여기도 따라 바뀌고, 따로 배정하는
     화면을 만들 필요가 없다.

     사번 → 이메일(sidToEmail) → 공개 명부(data/user_dir)에서 이름,
     paydata/owners 에서 uid. uid 를 못 찾으면 away(아직 안 들어옴)다 — 이름과
     업체는 보이되 그 사람 자리는 못 연다(아직 그 자리에 자료가 없다).

     ⚠ companies 는 **이미 급여만 걸러 온 명단**이어야 한다(payrollCompanies).
     여기서 다시 거르지 않는다 — 거르는 판단은 isPayrollCompany 한 곳에만 둔다. */
  function rosterNameMap(dirRows) {
    var map = {}, arr = dirRows;
    if (arr && typeof arr === 'object' && arr.v !== undefined) arr = arr.v;
    if (arr && !Array.isArray(arr) && typeof arr === 'object') {
      arr = Object.keys(arr).map(function (k) { return arr[k]; });
    }
    if (!Array.isArray(arr)) return map;
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i];
      if (x && x.sid && x.name) map[String(x.sid)] = String(x.name);
    }
    return map;
  }

  /* 사번의 꼴 — A-001 · P-002 · T-005 처럼 「글자 하나 + 숫자 두세 자리」다.
     여기 안 맞으면 사람 이름이나 메모가 잘못 들어간 것이다. */
  var SID_RE = /^[A-Za-z]-?\d{2,3}$/;

  /* 사번을 줄 세우기 좋은 열쇠로 바꾼다 — 하이픈은 있기도 없기도 하고(A-1 · A1),
     숫자는 자릿수가 다르다(A-9 가 A-10 보다 앞이어야 한다). 글자는 대문자로,
     숫자는 세 자리로 채워 글자순 비교 하나로 끝낸다. */
  function sidKey(sid) {
    var m = String(sid || '').match(/^([A-Za-z])-?(\d{1,4})$/);
    if (!m) return 'zz' + String(sid || '');
    return m[1].toUpperCase() + ('000' + m[2]).slice(-4);
  }

  function managerRoster(companies, dirRows, owners) {
    var names = rosterNameMap(dirRows);
    var byEmail = {};
    var ow = owners || {};
    Object.keys(ow).forEach(function (uid) {
      var o = ow[uid] || {};
      if (o.email) byEmail[String(o.email).toLowerCase()] = { uid: uid, name: String(o.name || '') };
    });

    var bySid = {}, order = [], unassigned = [];
    (companies || []).forEach(function (co) {
      var sids = [], seen = {};
      var push = function (s) {
        s = String(s || '');
        if (!s || seen[s]) return;      // 한 업체에 주·부담당으로 두 번 적혀도 한 번만
        seen[s] = 1; sids.push(s);
      };
      if (co) push(co.managerMain);
      ((co && co.managerSubs) || []).forEach(push);
      if (!sids.length) { unassigned.push(co); return; }
      sids.forEach(function (sid) {
        if (!bySid[sid]) {
          var email = sidToEmail(sid);
          var own = byEmail[email] || null;
          bySid[sid] = {
            sid: sid, email: email,
            /* 이름은 공개 명부가 먼저, 없으면 급여데이터함에 적힌 이름, 그래도
               없으면 사번. 명부 한 번 못 읽었다고 담당자가 통째로 사라지면
               그 사람 업체까지 같이 사라진다. */
            name: names[sid] || (own && own.name) || sid,
            uid: own ? own.uid : '',
            away: !own,
            /* ⚠ 담당자 칸에 **사번이 아닌 값**이 든 업체가 실제로 있다 —
               2026-08-17 확인: 「김보람(박은비)」 가 13곳의 주담당에 글자로 적혀
               있었다. 사번이 아니면 이메일을 만들 수 없어 어느 계정과도 이어지지
               못하는데, 화면에는 그냥 「아직 안 들어옴」으로 보인다. 그러면 사람이
               아직 안 들어온 것인지 자료가 잘못된 것인지 가릴 수가 없다 —
               앞은 **기다리면** 되고 뒤는 **업체관리를 고쳐야** 한다(할 일이 다르다). */
            badSid: !SID_RE.test(sid),
            companies: []
          };
          order.push(sid);
        }
        bySid[sid].companies.push(co);
      });
    });

    /* 사번 순으로 세운다(대표 지시 2026-08-17). 가나다순이면 「김보람」이 둘일 때
       어느 쪽이 진짜인지 이름만으로는 안 갈린다 — 사번이 곧 그 사람이다.
       ⚠ 사번이 아닌 값(badSid)은 **맨 아래**로 내린다. 사이에 섞여 번호를 받으면
       멀쩡한 담당자처럼 보여, 고쳐야 할 것이 목록에 묻힌다. */
    var people = order.map(function (s) { return bySid[s]; });
    people.sort(function (a, b) {
      if (a.badSid !== b.badSid) return a.badSid ? 1 : -1;
      if (a.badSid) return String(a.name).localeCompare(String(b.name), 'ko');
      return sidKey(a.sid) < sidKey(b.sid) ? -1 : (sidKey(a.sid) > sidKey(b.sid) ? 1 : 0);
    });
    return { people: people, unassigned: unassigned };
  }

  /* 공개 명부 — 포털·로그인이 쓰는 그 길(data/user_dir)을 그대로 쓴다.
     못 읽어도 빈 것으로 돌려준다(managerRoster 가 사번으로라도 세운다). */
  function listUserDir() {
    if (!deps.db) return Promise.resolve(null);
    return readRoster('data/user_dir').catch(function () { return null; });
  }

  /* 내 업체 순서(사람별 대시보드, 대표 지시 2026-08-14: "마우스로 위아래 변경").
     골라 둔 순서에 없는 업체(새로 맡거나 아직 안 옮긴 것)는 원래 자리 그대로
     뒤에 붙는다 — 순서를 안 저장했다고 업체가 안 보이면 안 된다. */
  function applyOrder(list, order) {
    var ord = Array.isArray(order) ? order : [];
    var idx = {};
    ord.forEach(function (id, i) { idx[id] = i; });
    var withKey = (list || []).map(function (c, i) {
      var k = (c && Object.prototype.hasOwnProperty.call(idx, c.id)) ? idx[c.id] : ord.length + i;
      return { c: c, k: k };
    });
    withKey.sort(function (a, b) { return a.k - b.k; });
    return withKey.map(function (w) { return w.c; });
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
  /* email 을 함께 적어 둔다 — 사람별 대시보드가 「이 사람이 어느 업체 담당인가」를
     가리려면 사번을 이메일로 바꾼 값(sidToEmail)과 견줄 이 사람의 이메일이 있어야
     한다. 이름·최근 활동만 있던 이 명단에 email 한 칸을 보태는 것뿐이라 콘솔 규칙은
     그대로다(같은 칸 안의 필드 하나 늘리는 것 — owners/$uid 는 이미 본인만 쓴다). */
  function touchOwner(name, email) {
    if (!deps.db || !deps.uid) return Promise.resolve();
    var up = {};
    var rec = { name: name || deps.uid, lastAt: Date.now() };
    if (email) rec.email = email;
    up[ownerPath(deps.uid)] = rec;
    return deps.db.ref().update(up).catch(function (e) { console.warn('[담당자 명단]', e && e.code); });
  }

  function listOwners() {
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref(ownerBoxPath()).once('value').then(function (s) { return s.val() || {}; });
  }

  /* 내 업체 순서는 내 담당자 명단 칸(owners/$uid) 밑에 둔다 — 이미 나만 쓸 수 있는
     칸이라 새 콘솔 규칙이 필요 없다. */
  function myOrderPath(uid) { return ownerPath(uid) + '/order'; }

  function saveMyCompanyOrder(order) {
    if (!deps.db || !deps.uid) return Promise.reject(new Error('로그인이 필요합니다'));
    var up = {};
    up[myOrderPath(deps.uid)] = Array.isArray(order) ? order : [];
    return deps.db.ref().update(up);
  }

  /* 로그인 마무리 — 이름을 찾고 명단에 나를 적어 둔다. 이름을 못 찾아도
     로그인은 막지 않는다(이메일이라도 보이는 것이 빈칸보다 낫다). */
  function signIn(email, fallbackName) {
    deps.name = fallbackName || email || deps.uid || '';
    return lookupName(email).then(function (found) {
      if (found) deps.name = found;
      return touchOwner(deps.name, email);
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

  /* ══════ 급여관리(payroll_os)로 넘기기 (4차) ══════
     이 저장 층이 원래 다루는 자리(paydata) 밖으로 쓰는 유일한 함수다.
     payroll_os/inbox 는 급여관리의 수신함이 이미 읽는 자리이고, 그 모양
     {ts,filename,사업장,월,종류,상태,출처} 은 급여관리 쪽 도움말에 적힌 그대로다
     (메일 서비스가 나중에 같은 자리에 쓰기로 되어 있다 — 급여데이터함도 같은 자리에
     하나 더 쓰는 것뿐이라 급여관리 화면을 손대지 않아도 된다).
     ⚠ payroll_os 쓰기는 재무권한(fin) 또는 관리자만 되도록 콘솔 규칙에 이미
     막혀 있다 — 급여데이터함이 새로 여는 권한이 아니다. 화면은 반드시
     canHandoffPayroll() 로 미리 갈라 단추를 감춰야 한다(안 그러면 눌러도
     서버가 거절해 헛수고가 된다). */
  function payrollInboxPath(id) { return 'payroll_os/inbox/' + id; }

  function handoffToPayroll(o) {
    o = o || {};
    if (!o.companyName) return Promise.reject(new Error('사업장을 알 수 없습니다'));
    if (!o.month) return Promise.reject(new Error('귀속월을 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var at = Number(o.at || Date.now());
    var inboxId = newId(), logId = newId();
    var up = {};
    up[payrollInboxPath(inboxId)] = {
      ts: at,
      filename: o.companyName + ' ' + o.month + ' 값 ' + Number(o.rowCount || 0) + '줄',
      사업장: o.companyName,
      월: o.month,
      종류: o.kindLabel || '급여데이터함 값',
      줄수: Number(o.rowCount || 0),
      상태: '대기',
      출처: '급여데이터함'
    };
    up[handoffLogPath(logId)] = {
      companyId: String(o.companyId || ''), companyName: o.companyName, month: o.month,
      byUid: deps.uid || '', byName: deps.name || '', at: at
    };
    return deps.db.ref().update(up).then(function () { return inboxId; });
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
    valsPath: valsPath,
    valuePeopleCount: valuePeopleCount,
    arrivalBoxPath: arrivalBoxPath,
    accessLogPath: accessLogPath,
    handoffLogPath: handoffLogPath,
    filePath: filePath,
    newId: newId,
    myUid: myUid,
    myName: myName,
    amAdmin: amAdmin,
    amFin: amFin,
    canHandoffPayroll: canHandoffPayroll,
    payrollInboxPath: payrollInboxPath,
    handoffToPayroll: handoffToPayroll,
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
    saveFileToDrawer: saveFileToDrawer,
    claimSharedNow: claimSharedNow,
    claimSharedSafe: claimSharedSafe,
    listMyPending: listMyPending,
    listSlotMany: listSlotMany,
    listArrivalOne: listArrivalOne,
    watchArrival: watchArrival,
    listSharedPending: listSharedPending,
    mailNote: mailNote,
    companyByEmail: companyByEmail,
    listArrivals: listArrivals,
    listSlot: listSlot,
    isExpired: isExpired,
    fileDownloadUrl: fileDownloadUrl,
    fileToDataUrl: fileToDataUrl,
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
    trashPendingUpdate: trashPendingUpdate,
    restoreUpdate: restoreUpdate,
    listTrash: listTrash,
    trashExpired: trashExpired,
    addFolder: addFolder,
    renameFolder: renameFolder,
    deleteFolder: deleteFolder,
    setFolder: setFolder,
    setFolderMany: setFolderMany,
    valueBoxPath: valueBoxPath,
    readKindFor: readKindFor,
    rowsFromRead: rowsFromRead,
    buildValueRows: buildValueRows,
    findDuplicateValue: findDuplicateValue,
    findValueOverlaps: findValueOverlaps,
    saveValues: saveValues,
    listValues: listValues,
    ERP_COMPANIES: ERP_COMPANIES,
    normalizeCompanies: normalizeCompanies,
    listCompanies: listCompanies,
    isPayrollCompany: isPayrollCompany,
    payrollCompanies: payrollCompanies,
    matchCompanyName: matchCompanyName,
    isMyCompany: isMyCompany,
    managerRoster: managerRoster,
    sidKey: sidKey,
    listUserDir: listUserDir,
    applyOrder: applyOrder,
    myOrderPath: myOrderPath,
    saveMyCompanyOrder: saveMyCompanyOrder,
    sharePath: sharePath,
    shareBoxPath: shareBoxPath,
    shareCompany: shareCompany,
    listShares: listShares
  };
})(typeof window !== 'undefined' ? window : globalThis);
