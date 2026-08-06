/* 푸른사진첩 — 사진 저장 층
   사진을 어디에 어떤 경로로 담을지 정하는 유일한 파일이다.
   '파일 창고(Firebase Storage)'와 '실시간DB' 두 방식을 모두 알고 있고,
   어느 쪽을 쓸지는 이 파일 안에서 정한다. 화면 코드는 방식을 모른다.
   → 1단계 창고 점검 결과로 방식이 바뀌어도 화면은 손대지 않는다.

   나중에 당겨오기 창(컨설팅·급여·기금에서 사진을 가져가는 창)도 이 파일을 쓴다.
   그래서 앱 안이 아니라 js/ 공용 파일로 둔다. */
(function (global) {
  'use strict';

  var DB_ROOT = 'puphotos';       // 실시간DB 루트 — 기존 앱 루트와 겹치지 않게 새로 판다
  var BUCKET_ROOT = 'pu_photos';  // 파일 창고 루트 — 기금 서류(fund_erp)와 분리

  /* ⚠ 두 루트 모두 아직 파이어베이스 콘솔 규칙에 없다(2026-08-02 확인).
     `docs/firebase-rules-현재적용본.json` 최상위에 puphotos 가 없고 기본은 거부다.
     그래서 "창고가 막히면 실시간DB로 가면 된다"는 말은 사실이 아니다 —
     어느 쪽을 택해도 대표님이 콘솔에서 규칙을 한 번 넣어 주셔야 첫 쓰기가 된다.
     A단계는 쓰기가 없어서 지금은 문제되지 않고, B단계 첫 쓰기에서 막힌다. */

  /* 촬영 시각(ms) → 보관 연도.
     연도별로 나눠 담아야 평소에 올해 것만 불러온다(해마다 느려지는 것 방지).
     카톡으로 받은 사진은 촬영 시각이 지워져 있다 — 버리지 않고 'unknown'에 모은다. */
  function yearOf(ts) {
    var n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return 'unknown';
    return String(new Date(n).getFullYear());
  }

  /* ── 사람별 자리 ──
     직원은 자기 사진만, 총괄 관리자만 전체를 본다(2026-08-03 대표 지시).
     **실시간DB는 규칙으로 목록을 걸러 주지 못한다** — 어떤 노드를 읽을 수 있으면
     그 아래가 전부 열린다. 그래서 사진을 사람별 자리로 나눠 담는 것 말고는
     방법이 없다. 화면에서 가리는 것은 보호가 아니다.

     owner 를 안 넘기면 지금 로그인한 사람 자리. 남의 자리를 읽는 것은
     관리자만 규칙이 허락한다(코드가 아니라 서버가 막는다). */
  function base(owner) {
    var who = owner || deps.uid;
    if (!who) throw new Error('사진을 담을 계정을 알 수 없습니다 — 로그인을 확인해 주세요');
    return DB_ROOT + '/u/' + who;
  }

  /* 사진 한 장의 정보(올린 사람·회사·설명 등)가 들어가는 실시간DB 경로 */
  function metaPath(year, id, owner) { return base(owner) + '/items/' + year + '/' + id; }

  /* 실시간DB 방식에서 사진 본문(base64)이 들어가는 경로.
     정보와 반드시 갈라 둔다 — 목록만 읽을 때 사진까지 내려받으면 앱이 느려진다. */
  function blobPath(year, id, owner) { return base(owner) + '/blobs/' + year + '/' + id; }

  /* 격자용 작은 미리보기(240px) 경로. 본문(1600px)과도 갈라 둔다 —
     격자가 본문까지 받으면 사진 수십 장에 수십 MB를 내려받게 된다. */
  function thumbPath(year, id, owner) { return base(owner) + '/thumbs/' + year + '/' + id; }

  /* 사진첩을 쓰는 사람 명단 — 관리자가 사람을 훑는 용도로만 쓰는 가벼운 칸.
     여기에 사진을 담지 않는다(관리자가 전 직원 사진 본문을 통째로 받는 일 방지). */
  function ownerPath(uid) { return DB_ROOT + '/owners/' + uid; }

  /* 촬영 시각 결정 — EXIF → 파일 날짜 → 업로드 시각 순서.
     카톡을 거친 사진은 EXIF가 지워져 있어 파일 날짜로, 그것도 없으면 올린 때로 간다. */
  function pickTakenAt(exifTs, fileTs, uploadTs) {
    var e = Number(exifTs), f = Number(fileTs);
    if (Number.isFinite(e) && e > 0) return e;
    if (Number.isFinite(f) && f > 0) return f;
    return Number(uploadTs);
  }

  /* ── 올릴 크기 ──
     서류(명함·사업자등록증·중소기업확인서 등)는 **글씨를 읽어야 하는 물건**이라
     일반 현장사진과 기준이 다르다(2026-08-03 대표 지시). 서류는 2560px·고품질,
     사진은 1600px. 격자용 미리보기는 종류와 무관하게 240px로 같다.
     크기 판단을 화면이 아니라 여기 두는 이유: 폰·PC·당겨오기 창이 같은 값을 써야 한다. */
  /* ── 한 번에 올릴 수 있는 장수 ──
     30장으로 잡은 근거는 **판독 속도**다. AI 무료 등급은 분당 10회까지 부를 수 있고
     한 장씩 차례로 부르므로 30장이면 판독이 3분쯤 걸린다. 그보다 많이 받으면
     판독이 줄줄이 막히고 '확인 필요'만 쌓인다(사람이 할 일이 늘어난다).
     용량도 같이 본다 — 서류는 장당 1MB 가까이라 30장이면 30MB다.
     화면마다 숫자를 박으면 폰·PC가 서로 다른 상한을 갖게 되므로 여기 한 곳에 둔다. */
  var UPLOAD_MAX = 30;

  function uploadSpec(isDoc) {
    return isDoc
      ? { maxEdge: 2560, quality: 0.92, thumbEdge: 240 }
      : { maxEdge: 1600, quality: 0.85, thumbEdge: 240 };
  }

  /* ── EXIF 촬영 시각 판독 ──
     JPEG 안의 EXIF에서 촬영 시각(DateTimeOriginal, 없으면 DateTime)을 읽는다.
     어떤 입력이 와도 예외를 밖으로 던지지 않는다 — 못 읽으면 null (파일 날짜로 넘어감). */
  function exifTakenAt(buf) {
    try {
      var v = new DataView(buf);
      if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null; // JPEG 아님
      var off = 2;
      while (off + 4 <= v.byteLength) {
        var marker = v.getUint16(off);
        if ((marker & 0xFF00) !== 0xFF00) return null; // 마커가 깨졌다
        var size = v.getUint16(off + 2);
        if (marker === 0xFFE1) {
          var got = exifFromApp1(v, off + 4, size - 2);
          if (got) return got;
        }
        if (marker === 0xFFDA) return null; // 압축 데이터 시작 — 더 볼 것 없다
        off += 2 + size;
      }
    } catch (e) { /* 깨진 파일 — 아래에서 null */ }
    return null;
  }

  /* APP1 조각에서 촬영 시각을 꺼낸다. TIFF 구조: 엔디안 표시 → IFD0 →
     ExifIFD(0x8769) 안의 DateTimeOriginal(0x9003). IFD0의 DateTime(0x0132)은 예비. */
  function exifFromApp1(v, start, len) {
    if (len < 14) return null;
    if (v.getUint32(start) !== 0x45786966 || v.getUint16(start + 4) !== 0) return null; // 'Exif\0\0'
    var t = start + 6; // TIFF 머리 시작
    var mark = v.getUint16(t);
    var le = mark === 0x4949; // 'II' 리틀엔디안 / 'MM' 빅엔디안
    if (!le && mark !== 0x4D4D) return null;
    if (v.getUint16(t + 2, le) !== 0x2A) return null;
    var ifd0 = t + v.getUint32(t + 4, le);
    var exifIfd = null, fallback = null;
    var n = v.getUint16(ifd0, le);
    for (var i = 0; i < n; i++) {
      var e = ifd0 + 2 + i * 12;
      var tag = v.getUint16(e, le);
      if (tag === 0x8769) exifIfd = t + v.getUint32(e + 8, le);
      if (tag === 0x0132) fallback = exifAscii(v, t, e, le);
    }
    var main = null;
    if (exifIfd) {
      var m = v.getUint16(exifIfd, le);
      for (var j = 0; j < m; j++) {
        var e2 = exifIfd + 2 + j * 12;
        if (v.getUint16(e2, le) === 0x9003) { main = exifAscii(v, t, e2, le); break; }
      }
    }
    return exifDateMs(main || fallback);
  }

  /* IFD 항목에서 ASCII 문자열을 꺼낸다. 4바이트가 넘으면 값 자리에 위치가 들어 있다. */
  function exifAscii(v, tiffStart, entry, le) {
    var count = v.getUint32(entry + 4, le);
    var off = count <= 4 ? entry + 8 : tiffStart + v.getUint32(entry + 8, le);
    var s = '';
    for (var i = 0; i < count && off + i < v.byteLength; i++) {
      var c = v.getUint8(off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  /* "YYYY:MM:DD HH:MM:SS" → 로컬 시각 ms. 깨진 값·전부 0인 값은 null. */
  function exifDateMs(s) {
    if (!s) return null;
    var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
    if (!m) return null;
    if (m[1] === '0000') return null; // 일부 사진기가 넣는 빈 값
    var ts = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  }

  /* 파일 창고 방식의 파일 경로.
     kind: 'full' = 긴 변 1600px 축소본 / 'thumb' = 격자용 작은 미리보기

     모르는 kind는 곧바로 예외를 던진다. 예전에는 'thumb'이 아닌 모든 값을 축소본으로
     처리했는데, 그러면 'thumbnail' 같은 오타 한 번으로 격자용 미리보기가 원본 축소본을
     덮어쓴다. 사진은 증빙 자료라 덮어쓰면 되돌릴 수 없다 —
     오타가 조용히 사고로 이어지는 것보다 즉시 터지는 게 낫다. */
  function filePath(year, id, kind) {
    if (kind !== 'full' && kind !== 'thumb') {
      throw new Error('파일 종류는 full 또는 thumb만 가능합니다: ' + kind);
    }
    return BUCKET_ROOT + '/' + year + '/' + id + (kind === 'thumb' ? '_t' : '') + '.jpg';
  }

  /* ── 저장 방식 ──
     아래 한 줄이 이 저장소 전체의 '확정된 저장 방식'이다.
     지금은 'rtdb'(실시간DB) — 이미 명함첩·푸른카메라가 쓰고 있는 검증된 길이다.
     창고 점검을 통과해서 'storage'(파일 창고)로 옮기기로 정해지면,
     사진첩·컨설팅·급여·기금 어느 앱도 손대지 않고 **여기 한 곳만** 고친다.
     앱들이 각자 방식을 정하지 않는 것이 이 파일이 존재하는 이유다. */
  var mode = 'rtdb';
  var deps = { db: null, storage: null, uid: '', isAdmin: false, name: '' };

  /* 파이어베이스 객체를 받아 저장 층을 준비한다.

     o.mode 는 시험·진단용 임시 덮어쓰기다. 평소 앱이 넘기는 값이 아니다.
     앱마다 mode 를 넘기게 하면 앱 수만큼 같은 값을 되풀이해 적게 되고,
     한 앱이 빠지면 그 앱만 조용히 다른 저장소를 보게 된다(방식이 갈린다).
     확정된 방식은 위의 var mode 선언 한 곳에만 둔다. */
  function init(o) {
    o = o || {};
    deps.db = o.db || null;
    deps.storage = o.storage || null;
    deps.uid = o.uid || '';
    deps.isAdmin = !!o.isAdmin;
    if (o.name) deps.name = o.name;
    if (o.mode) setMode(o.mode);
    return mode;
  }

  function getMode() { return mode; }

  function setMode(m) {
    if (m !== 'storage' && m !== 'rtdb') {
      throw new Error('저장 방식은 storage 또는 rtdb만 가능합니다: ' + m);
    }
    mode = m;
    return mode;
  }

  /* ── 실시간DB 저장·읽기 ──
     확정된 방식(2026-08-02, 창고는 요금제 문제로 막힘 → 실시간DB).
     파일 창고 방식 저장은 아직 없다 — 만들 일이 생기면 여기(저장 층)에만 더한다. */

  /* 새 사진 id. 파이어베이스 push 키는 시간순으로 정렬되는 문자열이라
     최신순 정렬이 공짜다. db가 없을 때(단위 검사)만 임시 키. */
  function newId() {
    if (deps.db) return deps.db.ref(DB_ROOT + '/items').push().key;
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* 사진 한 장 저장 — 정보·본문·미리보기를 다중 경로 update 한 번에 담는다.
     반드시 이 모양이어야 한다: 상위 노드를 set 으로 통째로 쓰면 남의 사진이
     지워진다(2026-07 실데이터 사고). update 는 적은 경로만 만들고 나머지는 안 건드린다. */
  function savePhoto(p) {
    if (mode === 'storage') {
      return Promise.reject(new Error('파일 창고 저장은 아직 준비되지 않았습니다'));
    }
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var year = yearOf(p.takenAt);
    var u = {};
    u[metaPath(year, p.id)] = p.meta;
    u[blobPath(year, p.id)] = p.full;
    u[thumbPath(year, p.id)] = p.thumb;
    return deps.db.ref().update(u).then(function () { return { year: year, id: p.id }; });
  }

  /* 사진 한 장 지우기 — 정보·본문·미리보기 세 곳을 한 번에.
     연도나 루트를 지우면 그 해 사진이 전부 사라지므로, 반드시 사진 하나의
     세 경로만 null 로 쓴다. 번호가 없으면 아예 시작하지 않는다
     (빈 값이 경로에 들어가면 상위 노드를 가리키게 된다). */
  /* ── 지우기 = 휴지통으로 (30일) ──
     곧바로 없애지 않는다. 잘못 지운 것을 되살릴 수 있어야 한다.
     **담고 나서 지운다** — 순서가 바뀌거나 중간에 끊기면 사진을 잃는다.
     그래서 읽기를 먼저 다 하고, 담기와 비우기를 **한 번의 update** 로 한다. */
  var TRASH_DAYS = 30;

  function trashPath(year, id, owner) { return base(owner) + '/trash/' + year + '/' + id; }
  function logPath(id, owner) { return base(owner) + '/dellog/' + id; }

  /* 지운 기록에 남길 한 줄 — 무엇이었는지 사람이 알아볼 수 있게. */
  function whatOf(meta) {
    var m = meta || {};
    var r = m.read || {};
    var kind = { card: '명함', bizreg: '사업자등록증', sme: '중소기업확인서', meeting: '회의·현장 사진' }[r.kind];
    var who = (r.fields && (r.fields.company || r.fields.name)) || '';
    var base2 = kind || (m.kind === 'doc' ? '서류' : '사진');
    return who ? (base2 + ' · ' + who) : base2;
  }

  /* why: 왜 지웠는지 한 줄(없으면 사람이 지운 것이다).
     스스로 지우는 경우(중복 등)에 이것이 없으면 기록만 보고는
     '누가 왜 지웠는지' 알 수 없어 지운 기록이 반쪽이 된다. */
  function deletePhoto(year, id, why) {
    if (!year || !id) return Promise.reject(new Error('지울 사진을 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    /* 새 자리와 옛 자리 어디에 있든 찾아 담는다. */
    return Promise.all([
      readOnce(metaPath(year, id)).catch(function () { return null; }),
      readOnce(legacyRoot('items') + '/' + year + '/' + id).catch(function () { return null; }),
      loadFull(year, id).catch(function () { return null; }),
      loadThumb(year, id).catch(function () { return null; })
    ]).then(function (r) {
      var meta = r[0] || r[1];
      if (!meta && !r[2] && !r[3]) {
        throw new Error('사진을 읽지 못해 지우지 않았습니다 — 잠시 뒤 다시 시도해 주세요');
      }
      var u = {};
      var now = Date.now();
      u[trashPath(year, id)] = {
        meta: meta || {}, full: r[2] || '', thumb: r[3] || '', delAt: now
      };
      /* 지운 기록은 휴지통과 따로 남는다 — 휴지통을 완전히 비운 뒤에도
         '무엇을 언제 누가 지웠는지'에 답할 수 있어야 한다(증빙 자료를 다루는 앱이다). */
      u[logPath(id)] = {
        year: year, what: whatOf(meta), delAt: now,
        by: deps.uid || '', byName: deps.name || '',
        why: why || ''
      };
      u[metaPath(year, id)] = null;
      u[blobPath(year, id)] = null;
      u[thumbPath(year, id)] = null;
      /* 옛 자리도 함께 비운다 — 안 비우면 지운 사진이 다시 나타난다. */
      u[legacyRoot('items') + '/' + year + '/' + id] = null;
      u[legacyRoot('blobs') + '/' + year + '/' + id] = null;
      u[legacyRoot('thumbs') + '/' + year + '/' + id] = null;
      return deps.db.ref().update(u);
    });
  }

  /* 휴지통 목록 — 남은 날을 함께 준다(사람이 급한지 알아야 한다). */
  function listTrash(year, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(base(owner) + '/trash/' + year).once('value').then(function (s) {
      var raw = s.val() || {};
      var out = {};
      Object.keys(raw).forEach(function (id) {
        var t = raw[id] || {};
        var used = t.delAt ? Math.floor((Date.now() - t.delAt) / 86400000) : 0;
        out[id] = {
          meta: t.meta || {}, thumb: t.thumb || '', delAt: t.delAt || 0,
          daysLeft: Math.max(0, TRASH_DAYS - used)
        };
      });
      return out;
    });
  }

  /* 되살리기 — 휴지통에서 꺼내 원래 자리로. */
  function restorePhoto(year, id) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return readOnce(trashPath(year, id)).then(function (t) {
      if (!t) throw new Error('휴지통에 그 사진이 없습니다');
      var u = {};
      u[metaPath(year, id)] = t.meta || {};
      if (t.full) u[blobPath(year, id)] = t.full;
      if (t.thumb) u[thumbPath(year, id)] = t.thumb;
      u[trashPath(year, id)] = null;
      return deps.db.ref().update(u);
    });
  }

  /* 30일 지난 것만 완전히 지운다. 지운 때가 없는 것은 건드리지 않는다
     (언제 지웠는지 모르는 것을 없애면 되돌릴 길이 사라진다). */
  function purgeOldTrash(year, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(base(owner) + '/trash/' + year).once('value').then(function (s) {
      var raw = s.val() || {};
      var u = {}, n = 0;
      var cut = Date.now() - TRASH_DAYS * 86400000;
      Object.keys(raw).forEach(function (id) {
        var t = raw[id] || {};
        if (t.delAt && t.delAt < cut) { u[trashPath(year, id, owner)] = null; n++; }
      });
      if (!n) return 0;
      return deps.db.ref().update(u).then(function () { return n; });
    });
  }

  /* 휴지통에서 한 장만 완전히 지운다. */
  function purgeOne(year, id) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[trashPath(year, id)] = null;
    /* 기록은 지우지 않는다 — 완전히 지운 때만 덧붙인다. */
    u[logPath(id) + '/purgedAt'] = Date.now();
    return deps.db.ref().update(u);
  }

  /* 지운 기록 목록 — 최근 것이 먼저. */
  function listDelLog(owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(base(owner) + '/dellog').once('value').then(function (s) {
      var raw = s.val() || {};
      return Object.keys(raw)
        .map(function (id) { return Object.assign({ id: id }, raw[id]); })
        .sort(function (a, b) { return (b.delAt || 0) - (a.delAt || 0); });
    });
  }

  /* 서류 판독 결과를 사진 정보 아래 'read' 칸에만 적는다.
     items/{id} 를 통째로 쓰면 촬영 시각·올린 사람이 지워진다 — 반드시 하위 경로만. */
  function saveRead(year, id, read) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[metaPath(year, id) + '/read'] = read;
    return deps.db.ref().update(u);
  }

  /* 한 연도의 사진 목록(정보만). 본문·미리보기는 안 딸려 온다 — 경로가 갈라져 있어서.
     owner 를 넘기면 그 사람 것을 읽는다(관리자만 규칙이 허락한다). */
  function listYear(year, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var who = owner || deps.uid;
    return Promise.all([
      deps.db.ref(base(owner) + '/items/' + year).once('value'),
      /* 옛 자리도 함께 읽는다 — 옮기기 전에 사진이 사라져 보이면 그것만으로도 사고다.
         (실사용 보고 2026-08-03: 자리를 바꾸자 올린 사진이 모두 사라져 보였다)
         옛 자리를 지운 뒤에는 여기서 아무것도 안 나오므로 그대로 두어도 된다. */
      deps.db.ref(legacyRoot('items') + '/' + year).once('value')
        .catch(function () { return { val: function () { return null; } }; })
    ]).then(function (snaps) {
      var mine = snaps[0].val() || {};
      var old = snaps[1].val() || {};
      var out = {};
      Object.keys(old).forEach(function (id) {
        var m = old[id] || {};
        /* 남의 옛 사진을 내 목록에 섞지 않는다. 올린 사람을 모르는 것(by 없음)은
           관리자에게만 보인다 — 누구 것인지 정해야 넘길 수 있다. */
        var ok = m.by ? (m.by === who) : deps.isAdmin;
        if (ok) out[id] = m;
      });
      /* 이미 옮긴 사진은 새 자리 값이 이기고, 새 자리에 없는 값(촬영 시각 등)은
         옛 것으로 채운다 — 판독 결과만 새 자리에 적힌 경우에도 시각이 살아야 한다. */
      Object.keys(mine).forEach(function (id) {
        out[id] = Object.assign({}, out[id] || {}, mine[id] || {});
      });
      return out;
    });
  }

  /* ── 어느 해에 사진이 있는가 ──
     연도별로 나눠 담았기 때문에, 화면이 올해만 읽으면 해가 바뀌는 순간
     작년 사진이 통째로 사라져 보인다. 그래서 연도 목록이 필요하다.

     실시간DB 클라이언트에는 "자식 이름만 달라"는 요청(REST의 shallow)이 없다.
     대신 해마다 **한 장만** 꺼내 보는 가벼운 요청으로 있는지 확인한다.
     옛 자리(사람별 분리 전)는 규칙이 이미 막았고 대표가 비웠으므로 보지 않는다. */
  var YEAR_SPAN = 8; // 올해부터 몇 해 거슬러 볼지

  function candidateYears() {
    var y = new Date().getFullYear(), out = [];
    for (var i = 0; i < YEAR_SPAN; i++) out.push(String(y - i));
    out.push('unknown'); // 촬영 시각을 끝내 못 구한 사진 자리
    return out;
  }

  function hasAny(ref) {
    return ref.limitToFirst(1).once('value')
      .then(function (s) { return s.exists(); })
      .catch(function () { return false; }); // 규칙이 막으면 없는 것으로 본다
  }

  function listYears(owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var ys = candidateYears();
    return Promise.all(ys.map(function (y) {
      return hasAny(deps.db.ref(base(owner) + '/items/' + y))
        .then(function (yes) { return yes ? y : null; });
    })).then(function (r) {
      var got = r.filter(Boolean);
      /* 올해는 사진이 없어도 늘 고를 수 있어야 한다 — 없으면 고를 것이 없어진다. */
      var now = String(new Date().getFullYear());
      if (got.indexOf(now) < 0) got.unshift(now);
      return got;
    });
  }

  /* ── 담긴 양 ──
     사진 하나하나에 적어 둔 크기(meta.size)를 더한다. 본문을 내려받지 않고
     정보만 읽으므로 가볍다. 미리보기(240px)와 정보 몫은 여기 안 들어가므로
     실제 저장량은 이보다 조금 많다 — 화면에 '대략'이라고 적을 것. */
  function usage(years, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var ys = (years && years.length) ? years : candidateYears();
    return Promise.all(ys.map(function (y) {
      return deps.db.ref(base(owner) + '/items/' + y).once('value')
        .then(function (s) {
          var raw = s.val() || {}, bytes = 0, n = 0;
          Object.keys(raw).forEach(function (id) {
            var m = raw[id] || {};
            bytes += Number(m.size) || 0;
            n++;
          });
          return { year: y, bytes: bytes, count: n };
        })
        .catch(function () { return { year: y, bytes: 0, count: 0 }; });
    })).then(function (rows) {
      var keep = rows.filter(function (r) { return r.count > 0; });
      return {
        rows: keep,
        bytes: keep.reduce(function (a, r) { return a + r.bytes; }, 0),
        count: keep.reduce(function (a, r) { return a + r.count; }, 0)
      };
    });
  }

  /* ── 연말 백업 기록 ──
     서버가 없어 12월 31일에 저절로 도는 것은 만들 수 없다. 대신 해가 바뀌고
     앱을 열었을 때 "아직 안 했다"를 알려 주려면 기록이 남아야 한다.
     기기가 바뀌어도 유지되도록 내 자리에 적는다(localStorage 아님). */
  function backupPath(year, owner) { return base(owner) + '/backups/' + year; }

  function getBackups(owner) {
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref(base(owner) + '/backups').once('value')
      .then(function (s) { return s.val() || {}; })
      .catch(function () { return {}; });
  }

  function markBackup(year, count, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[backupPath(year, owner)] = { at: Date.now(), count: Number(count) || 0 };
    return deps.db.ref().update(u);
  }

  /* 미리보기·본문은 볼 때만 한 장씩 받아온다.
     새 자리에 없으면 옛 자리에서 찾는다(옮기기 전에도 사진이 보여야 한다). */
  function loadThumb(year, id, owner) {
    return withLegacy(thumbPath(year, id, owner), legacyRoot('thumbs') + '/' + year + '/' + id);
  }
  function loadFull(year, id, owner) {
    return withLegacy(blobPath(year, id, owner), legacyRoot('blobs') + '/' + year + '/' + id);
  }

  function withLegacy(newPath, oldPath) {
    return readOnce(newPath).then(function (v) {
      if (v) return v;
      return readOnce(oldPath).catch(function () { return null; });
    });
  }

  /* ── 사람 명단 ──
     내 칸만 갱신한다. 훑는 것은 관리자만 — 규칙도 그렇게 막지만, 화면이
     헛되게 두드려 오류를 만들 이유도 없다. */
  function touchOwner(name) {
    if (!deps.db || !deps.uid) return Promise.resolve();
    var u = {};
    u[ownerPath(deps.uid)] = { name: name || '', lastAt: Date.now() };
    return deps.db.ref().update(u);
  }

  /* ── 로그인한 사람 ──
     계정을 알려주고, **관리자인지는 서버가 아는 값(uid_roles)을 물어본다** —
     화면에서 짐작하지 않는다. 이 값으로 남의 사진을 볼 수 있는지가 갈리므로
     짐작하면 안 된다(어차피 규칙이 한 번 더 막지만 이중으로 잠근다).
     경로에 계정이 필요하므로 **이것이 끝난 뒤에 사진을 읽어야 한다.** */
  function signIn(uid, email, fallbackName) {
    deps.uid = uid || '';
    deps.isAdmin = false;
    deps.name = fallbackName || email || '';
    if (!deps.db || !deps.uid) return Promise.resolve({ isAdmin: false, name: deps.name });
    return deps.db.ref('uid_roles/' + deps.uid + '/isAdmin').once('value')
      .then(function (s) { deps.isAdmin = s.val() === true; })
      .catch(function () { deps.isAdmin = false; })
      .then(function () { return lookupName(email); })
      .then(function (found) { if (found) deps.name = found; })
      .then(function () { return touchOwner(deps.name); })
      .catch(function () { /* 명단 갱신 실패가 로그인을 막지 않는다 */ })
      .then(function () { return { isAdmin: deps.isAdmin, name: deps.name }; });
  }

  /* ── 로그인한 사람의 이름 ──
     화면에 `p001@pureun.kr` 같은 주소가 아니라 사람 이름이 떠야 한다.
     포털(enter.html)이 쓰는 길을 그대로 쓴다: **공개 명부 `data/user_dir` 를 먼저** 보고,
     막히면 `data/user_accounts`(재무권한자만 읽힌다) → 이 기기에 남은 명부 순서.
     사번을 이메일로 바꾸는 규칙(`p-001` → `p001@pureun.kr`)도 포털과 같아야 한다 —
     다르면 같은 사람을 못 찾는다. */
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

  function localRoster() {
    try {
      var ls = global.localStorage;
      return ls ? JSON.parse(ls.getItem('pureun_v6_user_accounts') || 'null') : null;
    } catch (e) { return null; }
  }

  function lookupName(email) {
    if (!email || !deps.db) return Promise.resolve('');
    return readRoster('data/user_dir').then(function (dir) {
      var got = pickFromRoster(dir, email);
      if (got) return got;
      /* 공개 명부에 없으면 관리자 명부를 본다 — 일반 직원은 규칙이 막으므로 조용히 넘어간다. */
      return readRoster('data/user_accounts')
        .then(function (l) { return pickFromRoster(l, email); })
        .catch(function () { return ''; });
    }).catch(function () {
      return readRoster('data/user_accounts')
        .then(function (l) { return pickFromRoster(l, email); })
        .catch(function () { return ''; });
    }).then(function (got) {
      return got || pickFromRoster(localRoster(), email);
    });
  }

  function amAdmin() { return deps.isAdmin; }
  function myUid() { return deps.uid; }
  function myName() { return deps.name; }

  function listOwners() {
    if (!deps.isAdmin || !deps.db) return Promise.resolve({});
    return deps.db.ref(DB_ROOT + '/owners').once('value')
      .then(function (s) { return s.val() || {}; });
  }
  function readOnce(path) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(path).once('value').then(function (s) { return s.val(); });
  }

  /* ── 옛 자리에서 사람별 자리로 이사 ──
     2026-08-03 전에 올린 사진은 `puphotos/items|blobs|thumbs/{연도}/{id}` 에 모두
     섞여 있다. 사람별 자리로 옮겨야 분리가 완성된다.

     여기서 실수하면 사진을 잃는다. 그래서 규칙 하나: **복사가 끝날 때까지 옛 것을
     지우지 않는다.** 지우기(dropLegacy)는 복사 완료 표시가 있을 때만 동작한다.
     올린 사람을 모르는 사진(`by` 없음)은 조용히 버리지 않고 관리자 자리로 옮기고
     그 수를 알린다. */
  var legacyDone = false;

  function legacyRoot(kind) { return DB_ROOT + '/' + kind; }

  function migrateLegacy(onStep) {
    if (!deps.isAdmin) {
      return Promise.reject(new Error('사진 옮기기는 총괄 관리자만 할 수 있습니다'));
    }
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));

    var out = { copied: 0, unknown: 0, failed: 0 };
    return Promise.all([
      deps.db.ref(legacyRoot('items')).once('value'),
      deps.db.ref(legacyRoot('blobs')).once('value'),
      deps.db.ref(legacyRoot('thumbs')).once('value')
    ]).then(function (snaps) {
      var items = snaps[0].val() || {};
      var blobs = snaps[1].val() || {};
      var thumbs = snaps[2].val() || {};

      /* 옮길 것을 먼저 목록으로 뽑는다 — 도는 중에 무엇이 남았는지 알 수 있어야 한다. */
      var jobs = [];
      Object.keys(items).forEach(function (year) {
        Object.keys(items[year] || {}).forEach(function (id) {
          var meta = items[year][id] || {};
          var owner = meta.by;
          if (!owner) { owner = deps.uid; out.unknown++; }
          jobs.push({ year: year, id: id, owner: owner, meta: meta,
            full: (blobs[year] || {})[id], thumb: (thumbs[year] || {})[id] });
        });
      });

      var chain = Promise.resolve();
      jobs.forEach(function (j, i) {
        chain = chain.then(function () {
          var u = {};
          u[DB_ROOT + '/u/' + j.owner + '/items/' + j.year + '/' + j.id] = j.meta;
          if (j.full !== undefined && j.full !== null) {
            u[DB_ROOT + '/u/' + j.owner + '/blobs/' + j.year + '/' + j.id] = j.full;
          }
          if (j.thumb !== undefined && j.thumb !== null) {
            u[DB_ROOT + '/u/' + j.owner + '/thumbs/' + j.year + '/' + j.id] = j.thumb;
          }
          return deps.db.ref().update(u).then(function () {
            out.copied++;
            if (onStep) onStep(i + 1, jobs.length);
          }).catch(function (e) {
            /* 한 장이 실패해도 나머지를 옮긴다 — 다 멈추면 아무것도 못 옮긴다. */
            console.warn('[이사]', j.year, j.id, e);
            out.failed++;
          });
        });
      });
      return chain.then(function () {
        /* 실패가 하나라도 있으면 '끝났다'고 표시하지 않는다 → 옛 자리를 못 지운다. */
        legacyDone = jobs.length > 0 && out.failed === 0;
        return out;
      });
    });
  }

  /* 옛 자리 지우기 — 복사가 끝났다는 표시가 있을 때만. */
  function dropLegacy() {
    if (!deps.isAdmin) {
      return Promise.reject(new Error('옛 자리 지우기는 총괄 관리자만 할 수 있습니다'));
    }
    if (!legacyDone) {
      return Promise.reject(new Error('먼저 사진을 옮겨 주세요 — 옮기기가 모두 성공한 뒤에만 지울 수 있습니다'));
    }
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[legacyRoot('items')] = null;
    u[legacyRoot('blobs')] = null;
    u[legacyRoot('thumbs')] = null;
    return deps.db.ref().update(u).then(function () { legacyDone = false; });
  }

  /* ── 창고 점검 ──
     파일 창고를 이 저장소에서 실제로 써본 적이 없다. 그래서 사진을 담기 전에
     작은 파일 하나로 올리기·주소받기·지우기를 확인한다.
     실사진 경로가 아니라 전용 점검 경로만 쓴다 — 실데이터를 덮어쓰지 않는다. */
  function probePath(stamp) { return BUCKET_ROOT + '/_probe/' + stamp + '.txt'; }

  function probe(stamp) {
    if (!deps.storage) {
      return Promise.resolve({ ok: false, step: 'init', message: '파일 창고가 연결되지 않았습니다' });
    }
    var ref;
    try {
      ref = deps.storage.ref(probePath(stamp));
    } catch (e) {
      return Promise.resolve({ ok: false, step: 'ref', message: (e && e.message) || String(e) });
    }
    return ref.putString('pu-photos probe')
      .then(function () {
        // getDownloadURL 실패는 여기서 바로 갈라 잡는다 — 뒤의 .catch(업로드 실패용)로
        // 흘려보내면 "올리기는 됐는데 실패했다고 보고하는" 거짓 결과가 나온다.
        return ref.getDownloadURL().then(
          function (url) {
            // 지우기가 막혀도 사진은 담을 수 있다. 통과로 보되 규칙을 손보라고 알린다.
            return ref.delete()
              .then(function () { return { ok: true, step: 'done', url: url }; })
              .catch(function (e) {
                return {
                  ok: true, step: 'delete', url: url,
                  message: '올리기는 됐지만 지우기가 막혔습니다 — ' + ((e && e.message) || e)
                };
              });
          },
          function (e) {
            var message = (e && e.message) || String(e);
            // 주소받기는 실패했지만 파일은 이미 창고에 올라가 있다 — 점검 흔적을
            // 남기지 않도록 지우기를 시도한다. 이 지우기가 또 실패해도(권한 등)
            // 무시하고 원래의 'url' 실패 결과를 그대로 돌려준다(예외를 밖으로 던지지 않는다).
            return ref.delete().then(function () {}, function () {}).then(function () {
              return { ok: false, step: 'url', message: message };
            });
          }
        );
      })
      .catch(function (e) {
        return { ok: false, step: 'upload', message: (e && e.message) || String(e) };
      });
  }

  /* ── 창고 점검 결과 → 화면 문구 ──
     probe()의 결과를 사람이 읽을 한국어 문자열로 바꾼다. 화면 코드가 이 갈래를
     직접 갖지 않게 하려고 여기로 옮겼다 — 순수 함수라 테스트로 문구를 보증할 수 있다.

     이 단계의 핵심 산출물은 '점검이 어디서 막혔는지 정확히 알려주는 것'이다.
     대표님이 이 문구만 보고 콘솔에서 손을 쓰시기 때문에, 엉뚱한 곳을 짚으면
     엉뚱한 규칙을 고치게 된다. 그래서 여섯 갈래를 절대 뭉치지 않는다.

       done   통과. 창고를 쓰면 된다
       delete 올리기·주소 받기는 됐다. 지우기 권한만 확인
       init   창고가 준비 안 됨 → 설정 문제. 콘솔에서 하실 일이 없다
       ref    창고 설정 문제 → 위와 같다
       upload 올릴 권한이 없다 → 콘솔에서 쓰기 규칙을 넣어야 한다
       url    올리기는 됐다(=쓰기 규칙은 이미 있다) → 읽기 권한만 없다

     지켜야 할 것:
     - init·ref 에는 '규칙'이라는 말을 쓰지 않는다. 설정 문제인데 규칙 문제로
       안내하면 대표님이 있지도 않은 규칙을 고치신다.
     - url 에는 '규칙이 없다'고 하지 않는다. 쓰기가 성공했으니 규칙은 이미 있다.
       실제로 없는 것은 읽기 권한뿐이다.
     - 영어 내부 단계 이름(init·ref·upload·url)을 문구에 노출하지 않는다.
     - result.message(파이어베이스가 준 영어 오류문)는 진단에 필요하니 계속 담되,
       영어라서 먼저 읽히면 안 되므로 한국어 안내 뒤에 '원인:'으로 붙인다. */
  function probeMessage(result) {
    result = result || {};

    // 영어 오류문은 반드시 한국어 안내 뒤에 온다.
    var cause = result.message ? '\n원인: ' + result.message : '';

    // 설정 문제(init·ref)는 대표님이 콘솔에서 하실 일이 없다 — 안내가 같아야 한다.
    var setupHint =
      '\n창고 권한을 손봐도 풀리지 않는 문제입니다. 이 화면을 개발자에게 알려 주세요.' +
      '\n창고를 못 쓰면 실시간DB로 담습니다. 그때도 콘솔에서 권한을 한 번 열어 주셔야 합니다.';

    switch (result.step) {
      case 'done':
        return '통과 — 파일 창고를 쓸 수 있습니다.' +
          '\n올리기 · 주소 받기 · 지우기 모두 됩니다.' +
          '\n따로 하실 일은 없습니다.';

      case 'delete':
        return '거의 통과 — 사진은 담을 수 있습니다.' +
          '\n올리기와 주소 받기는 됐고, 지우기만 막혔습니다.' +
          '\n콘솔의 창고 규칙에서 지우기 권한만 확인해 주세요.' +
          cause;

      case 'init':
        return '막혔습니다 — 파일 창고가 아직 연결되지 않았습니다.' +
          setupHint + cause;

      case 'ref':
        return '막혔습니다 — 파일 창고 설정에 문제가 있습니다.' +
          setupHint + cause;

      case 'upload':
        return '막혔습니다 — 사진을 올릴 권한이 없습니다.' +
          '\n콘솔에서 창고에 쓰기 권한을 주는 규칙을 넣어 주세요.' +
          '\n창고를 안 쓰기로 하면 실시간DB로 담습니다. 그때도 콘솔에서 권한을 한 번 열어 주셔야 합니다.' +
          cause;

      case 'url':
        return '거의 다 왔습니다 — 사진을 올리는 것은 됐습니다.' +
          '\n올린 사진을 읽을 권한만 없습니다.' +
          '\n쓰기 규칙은 이미 들어가 있으니, 콘솔에서 읽기 권한만 더해 주세요.' +
          cause;

      default:
        // 모르는 결과 — 빈 문자열이나 undefined를 내보내면 화면이 아무 말도 못 한다.
        return '점검 결과를 알 수 없습니다.' +
          '\n한 번 더 점검해 보시고, 같은 화면이 계속 나오면 개발자에게 알려 주세요.' +
          cause;
    }
  }

  global.PuPhotoStore = {
    DB_ROOT: DB_ROOT,
    BUCKET_ROOT: BUCKET_ROOT,
    yearOf: yearOf,
    metaPath: metaPath,
    blobPath: blobPath,
    thumbPath: thumbPath,
    filePath: filePath,
    pickTakenAt: pickTakenAt,
    uploadSpec: uploadSpec,
    UPLOAD_MAX: UPLOAD_MAX,
    exifTakenAt: exifTakenAt,
    newId: newId,
    savePhoto: savePhoto,
    saveRead: saveRead,
    deletePhoto: deletePhoto,
    listTrash: listTrash,
    restorePhoto: restorePhoto,
    purgeOldTrash: purgeOldTrash,
    purgeOne: purgeOne,
    listYears: listYears,
    usage: usage,
    getBackups: getBackups,
    markBackup: markBackup,
    listDelLog: listDelLog,
    TRASH_DAYS: TRASH_DAYS,
    signIn: signIn,
    amAdmin: amAdmin,
    myUid: myUid,
    myName: myName,
    lookupName: lookupName,
    touchOwner: touchOwner,
    listOwners: listOwners,
    migrateLegacy: migrateLegacy,
    dropLegacy: dropLegacy,
    listYear: listYear,
    loadThumb: loadThumb,
    loadFull: loadFull,
    init: init,
    getMode: getMode,
    setMode: setMode,
    probePath: probePath,
    probe: probe,
    probeMessage: probeMessage
  };
})(typeof window !== 'undefined' ? window : globalThis);
