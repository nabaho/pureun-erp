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
     `docs/firebase-rules-전체-적용본.json` 최상위에 puphotos 가 없고 기본은 거부다.
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

  /* ── 사진이 담기는 자리(연도)는 「올린 때」가 정한다 (대표 지시 2026-08-13) ──
     "폰에서 한 번에 입력했는데 업로드된 것은 폰의 저장시간에 따라 저장되었다.
      그럴 경우 추후에 언제 사진을 찍었는지 모두 확인해야 한다. … 지금 올린 시간과
      순서대로 사진첩에 저장되고 기업정보함에 내용이 저장되게 해라. 그래야 찾기가 쉬워진다."

     전에는 **촬영 시각**이 자리를 정했다. 그래서 2019년에 찍힌 사진을 오늘 올리면
     2019년 칸으로 들어가 오늘 화면에서는 아예 안 보였다(해를 바꿔야 나온다).
     카톡을 거쳐 날짜가 지워진 사진은 「1월 1일」 같은 엉뚱한 날로도 갔다.
     **올린 때로 담으면 방금 올린 것은 언제나 지금 화면에 있다.**
     ⚠ 촬영일(takenAt)은 지우지 않는다 — 화면에 그대로 보여 주고, 보유기간도
       여전히 촬영일로 센다(docs/사진-개인정보-보유기준.md 5번). 자리만 바뀐다.
     ⚠ 옛 사진은 옮기지 않는다. 이미 촬영 연도 칸에 있는 것을 옮기려면 사진 본문을
       통째로 나르는 일이라, 새로 올리는 것부터 적용한다. */
  function photoYear(meta) {
    var m = meta || {};
    return yearOf(m.upAt || m.takenAt);
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

  /* PDF 안에 이미 있던 «글자» 경로 (대표 결정 2026-08-24 「글자 있는 PDF 는 글자로」).
     ⚠ 정보(items)에 담지 «않는다». 목록을 부를 때 items 를 통째로 내려받으므로,
       거기에 쪽마다 수천 자를 넣으면 사진첩을 열 때마다 그 글자를 다 내려받는다 —
       줄이려던 비용이 오히려 늘어난다. 판독할 때만 이 자리를 읽는다.
     ⚠ 본문·미리보기와 나란히 둔 까닭도 같다: 목록 읽기와 갈라 두어야 한다. */
  function textPath(year, id, owner) { return base(owner) + '/texts/' + year + '/' + id; }

  /* 사진첩을 쓰는 사람 명단 — 관리자가 사람을 훑는 용도로만 쓰는 가벼운 칸.
     여기에 사진을 담지 않는다(관리자가 전 직원 사진 본문을 통째로 받는 일 방지). */
  function ownerPath(uid) { return DB_ROOT + '/owners/' + uid; }

  /* 직접 만드는 분류(대표 지시 2026-08-06: "종류를 추가할 수 있는 기능").
     AI 자동 분류(card/bizreg/... )와 달리 코드 수정 없이 화면에서 아무 때나
     만든다. 이름표는 전 직원이 함께 봐야 하니 공용 자리에 둔다 — 사진 본문은
     지금처럼 사람별로 그대로 갈려 있다. */
  function customKindsPath() { return DB_ROOT + '/customKinds'; }
  /* 보유기준 점검 담당자 — 전 직원이 읽고, 담당자와 총괄 관리자만 쓴다.
     ⚠ 이 칸은 **규칙에 따로 적어야** 한다(`puphotos` 최상위는 열려 있지 않다).
        안 적으면 조용히 거부된다 — 건의함이 그래서 통째로 막혔다(2026-08-07). */
  function retentionPath() { return DB_ROOT + '/retention'; }

  /* ── 같이 볼 사람 (대표 지시 2026-08-08) ──
     사진은 사람별 자리에 갈려 있고 **서버가** 남의 자리를 막는다. 그래서 공유는
     화면에서 보여 주는 문제가 아니라 **규칙이 열어 줘야 하는** 문제다.
     두 곳에 적는다:
       ① 사진 옆   `…/items/{해}/{id}/shareWith/{받는사람}` = true
          → 규칙이 이걸 보고 그 **한 장만** 읽게 열어 준다.
       ② 받는 사람 자리 `puphotos/sharedTo/{받는사람}/{id}` = {owner, year, at}
          → 받은 사람이 **목록을 훑을** 길. ①만 있으면 남의 자리를 못 훑어서
            공유받은 사진이 있는지조차 알 수 없다. */
  function sharedToPath(uid, id) {
    return DB_ROOT + '/sharedTo/' + uid + (id ? '/' + id : '');
  }

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
     일반 현장사진과 기준이 다르다(2026-08-03 대표 지시). 서류는 2000px·고품질,
     사진은 1600px. 격자용 미리보기는 종류와 무관하게 240px로 같다.
     크기 판단을 화면이 아니라 여기 두는 이유: 폰·PC·당겨오기 창이 같은 값을 써야 한다.

     ── 3200 → 2000 으로 낮춘 까닭 (대표 결정 2026-08-13, 비용 조사) ──
     사진은 실시간DB 안에 base64 로 들어 있고, **판독할 때마다 원본을 통째로
     내려받는다.** 8/1~8/11 실시간DB 내려받기가 ₩28,833(전체 ₩31,045 의 93%)이었다.
     · 3200px q0.95 는 장당 2~4MB. 2000px 면 **넓이가 40% 로 줄어** 장당 1MB 안팎이다.

     ── 2000 → 2600 으로 «되올린» 까닭 (대표 결정 2026-08-30) ──
     위 까닭이 **없어졌다.** 2026-08-17 에 사진을 전부 파일 창고로 옮겼고
     (실시간DB 에 본문이 남은 사람 0명), 8월 요금을 갈라 보니
     **실시간DB ₩70,030 · 사진 창고 ₩0.12** 였다 — 창고는 사실상 공짜다.
     대표 지적은 「근무표처럼 칸이 촘촘한 표가 흐리다」였다.
     A4 를 2000px 로 담으면 약 170dpi, 2600px 면 약 220dpi 다.
     ⚠ **판독에 보내는 크기는 안 올랐다.** AI 는 그림을 768px 조각으로 나눠 세어
       값을 매기므로, 2600px 를 그대로 보내면 A4 한 장이 6조각 → 12조각이 되어
       **판독 한 번 값이 두 배**가 된다. 그래서 보낼 때만 2000px 로 줄인다
       (js/pu-doc-read.js 의 AI_SEND_EDGE). **담는 크기와 보내는 크기는 다른 물건이다.**
     ⚠ 일반사진(1600)은 안 올렸다 — 글씨를 읽는 물건이 아니다.
     ⚠ **이미 올라간 사진은 안 건드린다**(대표 지시). 여기 값은 **새로 올리는 것**에만
       걸린다. 옛 사진을 다시 줄이려면 전부 내려받아 다시 올려야 하는데,
       그 자체가 지금 줄이려는 바로 그 비용이다.
     ⚠ 이보다 더 낮추지 말 것 — 사진첩이 「원본이 작습니다」로 경고하는 문턱이
       계약서·서식·근태표 1600px 이다(pu-photos.html 의 MIN_READ_EDGE).
       2000 이면 A4 원본 한 장이 그 문턱을 넘는다. 1600 이하로 내리면 **새로 올린
       서류가 죄다 「작습니다」 경고를 달고 할 일로 쌓인다.** */
  /* ── 한 번에 올릴 수 있는 장수 ──
     30장으로 잡은 근거는 **판독 속도**다. AI 무료 등급은 분당 10회까지 부를 수 있고
     한 장씩 차례로 부르므로 30장이면 판독이 3분쯤 걸린다. 그보다 많이 받으면
     판독이 줄줄이 막히고 '확인 필요'만 쌓인다(사람이 할 일이 늘어난다).
     용량도 같이 본다 — 서류는 장당 1MB 가까이라 30장이면 30MB다.
     화면마다 숫자를 박으면 폰·PC가 서로 다른 상한을 갖게 되므로 여기 한 곳에 둔다. */
  var UPLOAD_MAX = 30;

  function uploadSpec(isDoc) {
    return isDoc
      ? { maxEdge: 2600, quality: 0.92, thumbEdge: 240 }
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
     kind: 'full' = 축소본 / 'thumb' = 격자용 작은 미리보기

     모르는 kind는 곧바로 예외를 던진다. 예전에는 'thumb'이 아닌 모든 값을 축소본으로
     처리했는데, 그러면 'thumbnail' 같은 오타 한 번으로 격자용 미리보기가 원본 축소본을
     덮어쓴다. 사진은 증빙 자료라 덮어쓰면 되돌릴 수 없다 —
     오타가 조용히 사고로 이어지는 것보다 즉시 터지는 게 낫다.

     ── 사람별 자리 (2026-08-13 비용 조사 뒤 대표 선택: "구별을 둔다") ──
     ⚠ 처음 만들 때는 경로에 주인이 없었다(`pu_photos/{연도}/{번호}.jpg`). 실시간DB는
       사람마다 자리(u/{나}/...)가 갈려 있어 서버가 남의 자리를 막는데(위 base() 주석),
       창고 경로에는 그 벽이 아예 없어 번호만 알면 아무나 남의 사진을 겨눌 수 있었다.
       사업자등록증·명함·계약서가 들어 있는 자리라 실시간DB와 같은 벽이 필요하다.
       그래서 실시간DB와 **같은 모양**으로 판다(u/{주인}/{blobs|thumbs}/{연도}/{번호}) —
       콘솔 규칙도 실시간DB에 이미 있는 것과 같은 문장으로 하나만 더 쓰면 된다. */
  function filePath(year, id, kind, owner) {
    if (kind !== 'full' && kind !== 'thumb') {
      throw new Error('파일 종류는 full 또는 thumb만 가능합니다: ' + kind);
    }
    var who = owner || deps.uid;
    if (!who) throw new Error('사진을 담을 계정을 알 수 없습니다 — 로그인을 확인해 주세요');
    return BUCKET_ROOT + '/u/' + who + '/' + (kind === 'thumb' ? 'thumbs' : 'blobs') +
      '/' + year + '/' + id + '.jpg';
  }

  /* ── 원본 파일 자리 (대표 지시 2026-09-05 「보관」) ──
     한글(.hwp/.hwpx)은 글자를 뽑아 «쪽 그림»으로 담는다. 그러면 표 줄·도장 같은
     서식이 사라지므로 **원본 파일도 함께** 창고에 둔다 — 나중에 한글로 연다.
     ⚠ 열쇠는 사진 id 가 아니라 «문서 묶음» 하나다. 쪽마다 올리면 같은 파일이
       쪽수만큼 쌓인다(6쪽짜리면 여섯 벌).
     ⚠ 확장자를 안 붙인다 — 지울 때 이름을 다시 알아낼 필요가 없어야 한다.
       진짜 파일 이름은 사진 정보(meta.doc.orig.name)에 적는다. */
  function origPath(year, key, owner) {
    var who = owner || deps.uid;
    if (!who) throw new Error('원본을 담을 계정을 알 수 없습니다 — 로그인을 확인해 주세요');
    if (!key) throw new Error('원본 열쇠가 없습니다');
    return BUCKET_ROOT + '/u/' + who + '/origs/' + year + '/' + key;
  }

  /* 원본 파일 하나를 창고에 올리고 «토큰 주소»를 돌려준다.
     ⚠ 주소를 정보에 적어 두는 까닭은 사진 본문(fullUrl)과 같다 — 창고 규칙은
       「자기 것만」이라 관리자·공유받은 사람은 창고에 직접 못 묻는다.
     ⚠ 실패하면 **던진다.** 부르는 쪽이 「원본은 못 담았다」고 말할 수 있어야 한다 —
       조용히 넘어가면 서식이 사라진 줄 모르고 원본을 지우게 된다.
     ⚠ 담긴 «해»를 함께 돌려준다 — 지울 때 이 해로 자리를 찾는다. 사진의 해로
       찾으면 자정을 넘겨 올린 것이 영영 안 지워진다. */
  function putOriginal(key, year, blob, name) {
    if (!deps.storage) return Promise.reject(new Error('파일 창고가 연결되지 않았습니다'));
    var path = origPath(year, key);
    var ref = deps.storage.ref(path);
    return ref.put(blob, {
      contentType: (blob && blob.type) || 'application/octet-stream',
      /* 받을 때 «원래 이름»으로 저장되게 한다 — 안 적으면 뜻 없는 열쇠로 받아진다 */
      contentDisposition: "attachment; filename*=UTF-8''" + encodeURIComponent(name || 'original')
    }).then(function () { return ref.getDownloadURL(); })
      .then(function (url) {
        return { key: key, year: year, url: url,
          name: name || '', size: (blob && blob.size) || 0 };
      });
  }

  /* ── 파일 창고에 실제로 올리고 받는다 (2026-08-13, 비용 조사 뒤 실행) ──
     같은 방식을 기업정보함이 먼저 검증했다(pu-cards.html 의 `_photoRef`·
     `_fetchFromBucket`·`_putToBucket`). data:URL ↔ 창고 파일을 그대로 오간다 —
     화면도 다시 판독기도 data:URL 을 기대하므로 그 모양을 그대로 맞춘다. */
  function putToBucket(path, dataUrl) {
    return deps.storage.ref(path).putString(String(dataUrl), 'data_url');
  }
  function deleteFromBucket(path) {
    return deps.storage.ref(path).delete();
  }
  /* 주소(URL) 하나를 base64 로 받아온다 — 판독(AI)·내려받기는 data: 가 필요하다.
     ⚠ 토큰이 붙은 주소는 창고 규칙과 무관하게 열린다 — 관리자·공유가 사진을
       보는 길이 이것뿐이다(규칙은 「자기 사진만」이고 실시간DB 를 못 읽는다). */
  function urlToDataUrl(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('창고 응답 ' + res.status);
      return res.blob();
    }).then(function (blob) {
      return new Promise(function (ok, no) {
        var r = new FileReader();
        r.onload = function () { ok(String(r.result || '')); };
        r.onerror = function () { no(r.error); };
        r.readAsDataURL(blob);
      });
    });
  }

  function fetchFromBucket(path) {
    return deps.storage.ref(path).getDownloadURL().then(urlToDataUrl);
  }

  /* 읽기 순서 — **창고 먼저, 안 되면 실시간DB**(기업정보함과 같은 순서, 2026-08-09 결정을
     그대로 물려받는다). 옮기다 만 것이 있어도, 창고에 없으면 조용히 실시간DB로
     물러난다 — 한쪽만 보면 사진이 사라진 것처럼 보이는 일이 없다.
     ⚠ deps.storage 가 없으면(아직 안 이어 준 화면) 곧바로 rtdbFallback — 이 파일을
       쓰는 화면이 전부 창고를 넘겨줄 때까지 기다리지 않아도 된다. */
  /* 창고에 직접 물어도 되는 사진인가 — **내 사진일 때만**이다.
     ⚠ 창고 규칙은 「자기 사진만」이라, 남의 사진은 물으면 **반드시 403** 이다.
       그런데도 물으면 콘솔이 403 으로 도배되고(대표 화면 2026-08-17: 그림 옆
       빨간 줄 수십 개) 헛 요청만 나간다 — 답을 아는 물음은 하지 않는다.
       남의 사진은 정보에 적힌 주소(토큰 URL)나 옛 자리(실시간DB)로 본다. */
  function storageMine(owner) {
    return !owner || owner === deps.uid;
  }

  function withStorage(pathFn, rtdbFallback, owner) {
    if (!deps.storage) return rtdbFallback();
    if (!storageMine(owner)) return rtdbFallback();
    var path;
    try { path = pathFn(); } catch (e) { return rtdbFallback(); }
    return fetchFromBucket(path).then(function (v) {
      return v || rtdbFallback();
    }).catch(function () { return rtdbFallback(); });
  }

  /* ── 저장 방식 ──
     아래 한 줄이 이 저장소 전체의 '확정된 저장 방식'이다.
     2026-08-15: 새 창고(pureun-erp-hrphotos, 서울 리전)를 만들고 규칙을 넣은 뒤
     probe() 점검을 통과해 'storage'(파일 창고)로 정했다(대표 승인, 비용 조사
     2026-08-13 뒤 후속). 사진첩·컨설팅·급여·기금 어느 앱도 손대지 않고
     **여기 한 곳만** 고친다 — 앱들이 각자 방식을 정하지 않는 것이 이 파일이
     존재하는 이유다. 되돌리려면(장애 등) 이 줄만 'rtdb'로 되돌리면 된다 —
     이미 창고로 옮겨진 사진은 loc:'storage' 표시 덕에 읽기(loadFull/loadThumb)가
     창고를 먼저 보므로 rtdb로 되돌려도 계속 보인다. */
  var mode = 'storage';
  /* ── 민감 서류 (사진첩 보안 3건 계획 2단계, 대표 지시 2026-08-17) ──
     계약서·근태표의 **원본 주소를 사진 정보에 남기지 않는다.**

     ⚠ 지금 적혀 있는 토큰 주소는 만료가 없고 로그인도 필요 없다 —
       **공유를 풀어도 그대로 열린다.** 근로계약서에는 주민번호가 있다.
     ⚠ 목록은 `functions/photo-view.js` 의 SENSITIVE_KINDS 와 **반드시 같아야 한다.**
       두 벌이 되면 한쪽만 고쳐져, 화면은 안 적는데 서버는 「민감 아니다」로 막는다.
     ⚠ 미리보기(thumbUrl)는 그대로 둔다 — 240px 로는 글씨를 못 읽고, 그것까지
       서버로 돌리면 격자가 통째로 느려진다(2026-08-15 에 고친 바로 그 느림이다). */
  /* ⚠ cms 를 넣는다(대표 지시 2026-08-28) — CMS 자동이체 신청서에는 **은행 계좌번호**와
     예금주 주민번호가 적혀 있다. 근로계약서에 주민번호가 있어 막아 둔 것과 같은 까닭이다.
     계좌번호는 기업정보함에 «온전히» 담기로 했지만(CMS 자동입력에 쓰려고), 그것과
     **사진 원본 주소를 만료 없이 뿌리는 것**은 다른 이야기다. */
  /* ⚠ bankbook 을 넣는다(대표 지시 2026-08-31 「통장이나 계좌도 OCR」) — 통장 사본·
     계좌확인서에는 **계좌번호가 그대로** 담긴다. cms 와 똑같은 까닭이다.
     ⚠ 이 줄을 고치면 `functions/photo-view.js` 도 함께 고치고 **그 함수를 다시 올려야**
       한다. 안 올리면 화면은 원본 주소를 안 적는데 서버는 「민감 아니다」로 물러나
       통장 사진이 «안 열린다». 검사가 두 목록이 같은지 못박는다. */
  /* ⚠ 근로자 서류 넷을 넣는다(대표 지시 2026-09-01 「근로자 신분증·주민등록등본·
     푸른계약서·CMS계약서·위임장·개인정보동의서를 스캔해서 보관」).
     넷이 빠져 있으면 **「민감 아님」으로 떨어져 원본 주소가 사진에 그대로 적힌다** —
     그 주소는 만료가 없고 로그인도 필요 없다. 신분증에 그것은 안 된다.
     ⚠ 여기를 고쳤으면 `functions/photo-view.js` 도 함께 고치고 **그 함수를 다시
       올려야** 한다. 안 올리면 화면은 원본 주소를 안 적는데 서버는 「민감 아니다」로
       물러나 그 사진이 «아예 안 열린다». 검사가 두 목록이 같은지 못박는다. */
  var SENSITIVE_KINDS = { contract: 1, wcontract: 1, timesheet: 1, payslip: 1, cms: 1, bankbook: 1,
    idcard: 1, resident: 1, mandate: 1, consent: 1 };
  /* 판독 전(read 없음)이면 **민감이 아니다** — 그렇게 안 하면 회의사진 수백 장이
     죄다 서버를 거치게 된다. 민감 여부는 판독이 정한다. */
  function isSensitiveRead(read) {
    return !!(read && SENSITIVE_KINDS[String(read.kind || '')]);
  }

  var PHOTO_VIEW_URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/photoView';

  var deps = { db: null, storage: null, uid: '', isAdmin: false, name: '', auth: null };
  /* 같은 탭에서 로그아웃하거나 다른 계정으로 바뀌는 동안, 먼저 시작한 명부 조회가
     늦게 끝나 새 계정의 이름·권한을 덮지 못하게 로그인 세대를 센다. */
  var identityGeneration = 0;

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
    /* 민감 서류 원본을 서버에서 받아올 때 로그인 증명이 필요하다.
       ⚠ 안 넘기면 계약서·근태표 원본이 «남의 것일 때» 안 열린다(내 것은 창고에서
         곧바로 되므로 증상이 나중에, 관리자 화면에서만 드러난다). */
    if (o.auth) deps.auth = o.auth;
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

  /* 사진 한 장 저장.
     실시간DB 방식은 정보·본문·미리보기를 다중 경로 update 한 번에 담는다.
     반드시 이 모양이어야 한다: 상위 노드를 set 으로 통째로 쓰면 남의 사진이
     지워진다(2026-07 실데이터 사고). update 는 적은 경로만 만들고 나머지는 안 건드린다.

     ⚠ 창고 방식(mode==='storage')은 본문·미리보기를 **창고에 먼저** 올리고,
       **둘 다 성공한 뒤에야** 실시간DB에 정보만 적는다(meta.loc:'storage' 표시와
       함께) — 본문 없이 정보만 있는 사진이 생기면 안 된다.
     ⚠ 창고 올리기가 실패하면(권한·요금제 등) **실시간DB 방식으로 물러난다**
       (기업정보함 putPhoto 와 같은 원칙 — "사진을 잃는 것보다 낫다"). 그래서 창고가
       막혀도 올리기 자체는 항상 끝까지 된다. */
  function savePhoto(p) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    /* 자리는 **올린 때**가 정한다(2026-08-13) — photoYear 참고.
       화면도 같은 함수를 쓰므로 담는 자리와 찾는 자리가 어긋나지 않는다. */
    var year = photoYear(p.meta);
    if (mode === 'storage' && deps.storage) {
      return putToBucket(filePath(year, p.id, 'full'), p.full)
        .then(function () { return putToBucket(filePath(year, p.id, 'thumb'), p.thumb); })
        /* 주소(토큰 URL)를 지금 받아 정보에 함께 적는다(2026-08-17) —
           창고 규칙은 「자기 사진만」이라, 주인이 아닌 사람(관리자·공유)은 창고에
           직접 주소를 못 청한다(403 — 대표 화면에서 남의 회의사진이 전부 회색이었다).
           주소는 규칙과 무관하게 열리므로, **정보를 읽을 수 있으면 사진도 보인다**
           — 실시간DB 시절과 같은 접근 범위가 된다.
           ⚠ 주소받기 실패가 저장을 뒤집으면 안 된다 — 사진은 이미 창고에 안전하다.
             그때는 주소 없이 저장하고, 서버 「주소 채우기」가 나중에 채운다. */
        .then(function () {
          return Promise.all([
            deps.storage.ref(filePath(year, p.id, 'full')).getDownloadURL().catch(function () { return null; }),
            deps.storage.ref(filePath(year, p.id, 'thumb')).getDownloadURL().catch(function () { return null; })
          ]);
        })
        .then(function (urls) { return saveMetaOnly(p, year, urls[0], urls[1]); })
        .catch(function (e) {
          console.warn('[사진첩] 창고 저장 실패 — 실시간DB로 보관합니다', e && e.message);
          return saveToRtdb(p, year);
        });
    }
    return saveToRtdb(p, year);
  }

  /* 창고 저장 성공 뒤 — 실시간DB에는 **정보만** 남긴다(본문·미리보기는 창고에 있다).
     ⚠ loc:'storage' 를 반드시 적는다. 안 적으면 지우기·복원·용량 계산이
       본문이 실시간DB에 있는 줄 알고 없는 자리를 헤맨다. */
  function saveMetaOnly(p, year, fullUrl, thumbUrl) {
    var extra = { loc: 'storage' };
    if (fullUrl) extra.fullUrl = fullUrl;
    if (thumbUrl) extra.thumbUrl = thumbUrl;
    var u = {};
    u[metaPath(year, p.id)] = Object.assign({}, p.meta, extra);
    /* PDF 안에 있던 글자는 «정보와 갈라» 담는다 — 까닭은 textPath 에 적었다.
       ⚠ 빈 글자는 아예 안 적는다. 실시간DB 는 빈 값을 안 적으므로 헛 경로만 남는다. */
    if (p.text) u[textPath(year, p.id)] = String(p.text);
    u[ownerPath(deps.uid)] = {
      name: deps.name || (p.meta && p.meta.byName) || '',
      lastAt: Date.now()
    };
    return deps.db.ref().update(u).then(function () { return { year: year, id: p.id }; });
  }

  function saveToRtdb(p, year) {
    var u = {};
    u[metaPath(year, p.id)] = p.meta;
    u[blobPath(year, p.id)] = p.full;
    u[thumbPath(year, p.id)] = p.thumb;
    /* 창고가 막혀 실시간DB 로 물러난 길에서도 글자를 함께 담는다 — 한쪽만 담으면
       「창고일 때는 글자로 읽고 실시간DB일 때는 그림으로 읽는」 두 동작이 된다. */
    if (p.text) u[textPath(year, p.id)] = String(p.text);
    /* 업로드 성공과 사용자 색인을 한 번에 저장한다. 로그인 때 touchOwner가
       일시적으로 실패해도 이 색인이 남아야 다른 휴대폰·PC의 「전체 근로자」
       화면에서 방금 올린 사진을 빠뜨리지 않고 찾을 수 있다. */
    u[ownerPath(deps.uid)] = {
      name: deps.name || (p.meta && p.meta.byName) || '',
      lastAt: Date.now()
    };
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
    var kind = { card: '명함', bizreg: '사업자등록증', sme: '중소기업확인서',
      payslip: '급여서류', meeting: '회의·현장 사진' }[r.kind];
    var who = (r.fields && (r.fields.company || r.fields.name)) || '';
    var base2 = kind || (m.kind === 'doc' ? '서류' : '사진');
    return who ? (base2 + ' · ' + who) : base2;
  }

  /* why: 왜 지웠는지 한 줄(없으면 사람이 지운 것이다).
     스스로 지우는 경우(중복 등)에 이것이 없으면 기록만 보고는
     '누가 왜 지웠는지' 알 수 없어 지운 기록이 반쪽이 된다. */
  /* owner: 누구 자리의 사진인가. 안 넘기면 지금 로그인한 사람 자리다.
     ⚠ 총괄 관리자가 남의 사진을 지울 때 이것을 안 넘기면, **자기 자리에 대고**
       지우는 시늉만 하고 조용히 끝난다 — 화면에서는 사라진 것처럼 보이지만
       실제 사진은 그대로 남는다. 막는 것보다 나쁘다(대표 보고 2026-08-10).
     ⚠ 휴지통·지운 기록도 **주인 자리**에 남는다. 남의 사진을 관리자가 지웠다고
       관리자 휴지통에 담으면, 주인은 자기 사진이 어디로 갔는지 찾을 길이 없다.
       누가 지웠는지는 dellog 의 by·byName 에 남는다. */
  function deletePhoto(year, id, why, owner) {
    if (!year || !id) return Promise.reject(new Error('지울 사진을 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    /* ⚠ 옛 자리(puphotos/items 등)는 읽지도 쓰지도 않는다.
       2026-08-04 사람별 분리 마지막 단계로 옛 자리 규칙을 지웠다 — 그 뒤로
       옛 자리 쓰기는 거부되고, 묶음 쓰기(update)는 전부 아니면 전무라서
       옛 자리 null 한 줄 때문에 **모든 지우기가 통째로 실패**했다
       (2026-08-06 대표 보고: "자꾸 에러 난다"). 옛 자리는 이미 비워서
       옮겼으므로 여기서 함께 비울 것도 없다. */
    /* ⚠ 창고 사진(meta.loc==='storage')은 본문을 트래시에 **복사하지 않는다**
       (2026-08-13, 비용 조사). 기업정보함 휴지통이 원본을 통째로 복사해 두었다가
       열 때마다 30일치를 다시 내려받던 것과 같은 실수를 사진첩에서 미리 막는다.
       본문은 창고의 **원래 자리에 그대로 둔다** — 영구삭제(purgeOne/
       purgeOldTrash) 때에야 창고에서 지운다. */
    return readOnce(metaPath(year, id, owner))
      .catch(function () {
        throw new Error('사진을 읽지 못해 지우지 않았습니다 — 잠시 뒤 다시 시도해 주세요');
      })
      .then(function (meta) {
        /* 창고 사진은 본문을 안 만지므로, 정보만 읽히면 그것으로 충분하다 —
           본문이 실제로 창고에 있는지까지 여기서 확인할 필요가 없다(안 건드리니까). */
        if (meta && meta.loc === 'storage') return deleteStorageMeta(year, id, owner, meta, why);
        return deleteRtdbBody(year, id, owner, why);
      });
  }

  function deleteStorageMeta(year, id, owner, meta, why) {
    var u = {};
    var now = Date.now();
    u[trashPath(year, id, owner)] = { meta: meta, delAt: now, loc: 'storage' };
    u[logPath(id, owner)] = {
      year: year, what: whatOf(meta), delAt: now,
      by: deps.uid || '', byName: deps.name || '',
      why: why || ''
    };
    u[metaPath(year, id, owner)] = null;
    Object.keys((meta && meta.shareWith) || {}).forEach(function (who) {
      u[sharedToPath(who, id)] = null;
    });
    return deps.db.ref().update(u);
  }

  /* 옛 방식(본문이 실시간DB에 있음) — 지우기 전의 동작을 그대로 지킨다.
     ⚠ 「못 읽었다」와 「원래 없다」를 갈라야 한다.
       둘 다 null 로 뭉뚱그리면, 통신이 잠깐 끊긴 사이에 지우기를 누른 것만으로
       휴지통에는 빈 껍데기('')가 들어가고 원본은 지워진다 — 되살려도 본문이 없다.
       실제로 2026-08-09 용량 초과로 읽기가 막혔을 때 이런 사진이 생겼다
       (검은 화면 + 「사진 본문을 불러오지 못했습니다」).
       읽기가 «실패» 하면 아예 지우지 않는다. 원래 없는 것은 그대로 지울 수 있다. */
  function deleteRtdbBody(year, id, owner, why) {
    var FAIL = {};
    return Promise.all([
      readOnce(metaPath(year, id, owner)).catch(function () { return FAIL; }),
      loadFull(year, id, owner).catch(function () { return FAIL; }),
      loadThumb(year, id, owner).catch(function () { return FAIL; })
    ]).then(function (r) {
      if (r[0] === FAIL || r[1] === FAIL || r[2] === FAIL) {
        throw new Error('사진을 읽지 못해 지우지 않았습니다 — 잠시 뒤 다시 시도해 주세요');
      }
      var meta = r[0];
      if (!meta && !r[1] && !r[2]) {
        throw new Error('사진을 읽지 못해 지우지 않았습니다 — 잠시 뒤 다시 시도해 주세요');
      }
      var u = {};
      var now = Date.now();
      u[trashPath(year, id, owner)] = {
        meta: meta || {}, full: r[1] || '', thumb: r[2] || '', delAt: now
      };
      /* 지운 기록은 휴지통과 따로 남는다 — 휴지통을 완전히 비운 뒤에도
         '무엇을 언제 누가 지웠는지'에 답할 수 있어야 한다(증빙 자료를 다루는 앱이다). */
      u[logPath(id, owner)] = {
        year: year, what: whatOf(meta), delAt: now,
        by: deps.uid || '', byName: deps.name || '',
        why: why || ''
      };
      u[metaPath(year, id, owner)] = null;
      u[blobPath(year, id, owner)] = null;
      u[thumbPath(year, id, owner)] = null;
      /* PDF 에서 뽑아 둔 글자도 함께 비운다 — 안 비우면 사진은 없는데 글자만 남아
         용량을 먹고, 그 글자에 사업장 정보가 그대로 들어 있다. */
      u[textPath(year, id, owner)] = null;
      /* 같이 보던 사람의 목록에서도 뺀다 — 안 빼면 원본이 없는 유령이 남아
         「나와 공유된 사진」이 열리지 않는 사진으로 채워진다. */
      Object.keys((meta && meta.shareWith) || {}).forEach(function (who) {
        u[sharedToPath(who, id)] = null;
      });
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

  /* 되살리기 — 휴지통에서 꺼내 원래 자리로.
     ⚠ 창고 사진(t.loc==='storage')은 본문을 안 옮긴다 — 지울 때 애초에 창고의
       원래 자리에 그대로 뒀으므로 되살릴 것이 없다. 정보만 되돌리면 끝이다. */
  function restorePhoto(year, id) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return readOnce(trashPath(year, id)).then(function (t) {
      if (!t) throw new Error('휴지통에 그 사진이 없습니다');
      var u = {};
      u[metaPath(year, id)] = t.meta || {};
      if (t.loc !== 'storage') {
        if (t.full) u[blobPath(year, id)] = t.full;
        if (t.thumb) u[thumbPath(year, id)] = t.thumb;
      }
      u[trashPath(year, id)] = null;
      return deps.db.ref().update(u);
    });
  }

  /* 창고 사진은 지울 때 본문을 안 건드렸다(트래시에 loc 만 적어 뒀다) — 그래서
     **영구삭제 때에야** 창고 본문을 지운다. 기업정보함 hardDel 과 같은 순서다:
     지울 때는 안 지우고, 완전히 지울 때 지운다.
     ⚠ 창고 지우기가 실패해도(권한·이미 없음 등) 넘어간다 — 실시간DB의 트래시
       기록은 지워야 한다. 창고에 파일이 하나 남는 것이 트래시가 안 지워지는 것보다 낫다. */
  function purgeStorageBody(year, id, owner, meta) {
    if (!deps.storage) return Promise.resolve();
    var jobs = [
      deleteFromBucket(filePath(year, id, 'full', owner)).catch(function () {}),
      deleteFromBucket(filePath(year, id, 'thumb', owner)).catch(function () {})
    ];
    /* ── 한글 원본도 «함께» 지운다 (2026-09-05) ──
       안 지우면 사진은 없는데 원본만 창고에 남는다 — 요금을 계속 먹고, 그 안에는
       사업장·근로자 정보가 그대로 들어 있다. 「지웠다」고 말해 놓고 남기면 안 된다.
       ⚠ 한 문서의 여러 쪽이 «같은» 원본을 가리킨다. 쪽은 함께 지워지므로 먼저
         지워지는 쪽에서 없앤다 — 두 번째부터는 조용히 실패한다(catch).
       ⚠ 해는 «원본이 담긴 해»를 쓴다. 사진의 해로 찾으면 자정을 넘겨 올린 것이
         영영 안 지워진다(orig.year 를 남겨 두는 까닭). */
    var o = meta && meta.doc && meta.doc.orig;
    if (o && o.key) {
      try {
        jobs.push(deleteFromBucket(origPath(o.year || year, o.key, owner)).catch(function () {}));
      } catch (e) {
        /* 열쇠가 이상해도 사진 본문 지우기는 계속한다 — 남는 쪽이 더 나쁘다 */
        console.warn('[사진첩] 한글 원본 자리를 못 찾았습니다', e && e.message);
      }
    }
    return Promise.all(jobs);
  }

  /* 30일 지난 것만 완전히 지운다. 지운 때가 없는 것은 건드리지 않는다
     (언제 지웠는지 모르는 것을 없애면 되돌릴 길이 사라진다). */
  function purgeOldTrash(year, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(base(owner) + '/trash/' + year).once('value').then(function (s) {
      var raw = s.val() || {};
      var cut = Date.now() - TRASH_DAYS * 86400000;
      var due = Object.keys(raw).filter(function (id) {
        var t = raw[id] || {};
        return t.delAt && t.delAt < cut;
      });
      if (!due.length) return 0;
      /* 창고 본문부터 지운다 — 한 장이 실패해도 나머지는 계속 지운다. */
      return Promise.all(due.map(function (id) {
        return (raw[id].loc === 'storage')
          ? purgeStorageBody(year, id, owner, raw[id].meta) : Promise.resolve();
      })).then(function () {
        var u = {};
        due.forEach(function (id) { u[trashPath(year, id, owner)] = null; });
        return deps.db.ref().update(u).then(function () { return due.length; });
      });
    });
  }

  /* 휴지통에서 한 장만 완전히 지운다. */
  function purgeOne(year, id) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return readOnce(trashPath(year, id)).then(function (t) {
      var finish = function () {
        var u = {};
        u[trashPath(year, id)] = null;
        /* 기록은 지우지 않는다 — 완전히 지운 때만 덧붙인다. */
        u[logPath(id) + '/purgedAt'] = Date.now();
        return deps.db.ref().update(u);
      };
      if (t && t.loc === 'storage') return purgeStorageBody(year, id, null, t.meta).then(finish);
      return finish();
    });
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
  /* ── 사람이 직접 적는 정보 (2026-08-08 대표 지시) ──
     AI 가 읽은 것(read)과 **따로** 둔다. 다시 판독해도 사람이 적은 것은 안 지워진다.
     빈 값은 null 로 지운다 — 빈 문자열을 남기면 「적었는데 비어 있음」과 구분이 안 된다. */
  function saveNote(year, id, patch, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var base = metaPath(year, id, owner), u = {};
    ['note', 'company'].forEach(function (k) {
      if (!(k in patch)) return;
      var v = String(patch[k] == null ? '' : patch[k]).trim();
      u[base + '/' + k] = v || null;
    });
    if (!Object.keys(u).length) return Promise.resolve();
    return deps.db.ref().update(u);
  }

  /* ── 촬영일 고치기 ──
     ⚠ 2026-08-13 부터 **자리는 촬영일이 안 정한다**(photoYear — 올린 때가 정한다).
        그래서 촬영일을 아무 날로 고쳐도 사진을 옮기지 않는다. 정보 한 줄만 바꾼다.
        전에는 해가 바뀌면 사진·미리보기를 통째로 날랐다 — 큰 일이었고, 옮기는
        도중에 끊기면 사진을 잃을 위험이 있는 유일한 자리였다. 그 위험이 사라졌다.
     ⚠ 촬영일은 여전히 **보유기간을 센다**(docs/사진-개인정보-보유기준.md 5번).
        그래서 지우는 것이 아니라 그대로 담아 둔다. */
  function setTakenAt(year, id, ts, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return Promise.reject(new Error('날짜가 올바르지 않습니다'));
    var u = {};
    u[metaPath(year, id, owner) + '/takenAt'] = n;
    return deps.db.ref().update(u).then(function () { return String(year); });
  }

  /* ── 돌린 사진 저장 · 본문 다시 올리기 ──
     사진과 미리보기를 **같이** 바꾼다. 하나만 바꾸면 목록과 크게 보기가 서로 다르게 보인다.
     돌리기(rotateOne)와 "본문이 없는 사진에 새로 올리기"(2026-08-15, showNoBody) 둘 다 이 함수를 쓴다.

     ⚠ 창고 방식(mode==='storage')이면 savePhoto 와 같은 순서를 지킨다 — 올리고
       → 되읽어 확인하고 → 그제야 정보에 loc:'storage' 를 적고 실시간DB 옛 자리를
       비운다. 확인 전에 정보를 고치면, 못 올라간 사진인데 "창고에 있다"고
       거짓 표시가 남아 다음에 읽을 때 빈손이 된다.
     ⚠ 창고 올리기가 실패하면 실시간DB로 물러난다(savePhoto 와 같은 이유 —
       "사진을 잃는 것보다 낫다"). */
  function replaceImage(year, id, full, thumb, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    if (!full || !thumb) return Promise.reject(new Error('바꿀 사진이 없습니다'));
    if (mode === 'storage' && deps.storage) {
      var fp = filePath(year, id, 'full', owner);
      return putToBucket(fp, full)
        .then(function () { return putToBucket(filePath(year, id, 'thumb', owner), thumb); })
        .then(function () { return fetchFromBucket(fp); })
        .then(function (back) {
          if (!back) throw new Error('올린 사진을 다시 확인하지 못했습니다');
          /* 새 본문의 주소도 같이 적는다(2026-08-17) — 안 적으면 옛 주소(돌리기 전
             그림)가 남아, 남들 눈에는 안 돌린 사진이 계속 보인다. */
          return Promise.all([
            deps.storage.ref(fp).getDownloadURL().catch(function () { return null; }),
            deps.storage.ref(filePath(year, id, 'thumb', owner)).getDownloadURL().catch(function () { return null; })
          ]);
        })
        .then(function (urls) {
          /* ⚠ 민감 서류면 **원본 주소를 다시 적지 않는다**(보안 3건 계획 2단계).
             이 갈래를 빠뜨리면 사진을 한 번 돌리는 것만으로 지워 둔 주소가
             되살아난다 — 판독 때 지운 것이 조용히 무효가 된다.
             한 번 더 읽는 값이지만 돌리기는 드문 일이라 값이 싸다. */
          return readOnce(metaPath(year, id, owner) + '/read').catch(function () { return null; })
            .then(function (read) {
              var u = {};
              u[metaPath(year, id, owner) + '/loc'] = 'storage';
              u[metaPath(year, id, owner) + '/fullUrl'] = isSensitiveRead(read) ? null : (urls[0] || null);
              u[metaPath(year, id, owner) + '/thumbUrl'] = urls[1] || null;
              u[blobPath(year, id, owner)] = null;
              u[thumbPath(year, id, owner)] = null;
              return deps.db.ref().update(u);
            });
        })
        .catch(function (e) {
          console.warn('[사진첩] 본문 다시 올리기 — 창고 실패, 실시간DB로 보관합니다', e && e.message);
          return replaceImageRtdb(year, id, full, thumb, owner);
        });
    }
    return replaceImageRtdb(year, id, full, thumb, owner);
  }

  function replaceImageRtdb(year, id, full, thumb, owner) {
    var u = {};
    u[blobPath(year, id, owner)] = full;
    u[thumbPath(year, id, owner)] = thumb;
    return deps.db.ref().update(u);
  }

  /* ── 「손댄 사진」 자국 (대표 지시 2026-08-29 AI 지우개) ──
     사진첩은 정부사업·컨설팅 **증빙**으로 쓰는 사진이 많다. AI 가 없던 배경을 그려
     메운 사진에 아무 자국이 없으면, 나중에 「이 사진 손댔나」에 아무도 답할 수 없다.
     ⚠ 까맣게·모자이크에는 안 단다 — 그것은 «덮은 것»이라 보면 안다. 자국이 필요한 것은
       **눈으로 안 보이는 고침**뿐이다.
     ⚠ 이 표가 실패해도 사진 고치기를 되돌리지 않는다 — 자국이 없을 뿐이다. */
  function markEdited(year, id, how, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[metaPath(year, id, owner) + '/edited'] = {
      at: Date.now(), by: deps.name || '', how: String(how || 'ai').slice(0, 20)
    };
    return deps.db.ref().update(u);
  }

  /* 같이 볼 사람을 정한다 — 넘긴 목록이 그대로 최종본이다(빠진 사람은 풀린다).
     ⚠ 사진 옆과 받는 사람 자리를 **한 묶음**으로 적는다. 나눠서 하다 끊기면
     「사진에는 공유 표시가 있는데 목록에는 안 뜨는」 반쪽 상태가 남는다.

     ⚠ **주인을 받는다**(2026-08-29). 안 받던 동안 이 함수는 언제나 «내 자리»에 대고
       썼다. 총괄관리자가 「전체 근로자」 화면에서 남의 사진을 열어 주면
       ① 있지도 않은 내 사진 밑에 shareWith 만 있는 유령이 생기고
       ② 받는 사람 목록에는 그 유령을 가리키는 줄이 놓여
       ③ 받는 쪽에서는 «빈 사진 한 장»이 뜬다 — 화면은 「공유했습니다」라고 말한다.
       addShare·saveNote·markUsed 가 모두 주인을 받게 된 뒤에도 여기만 남아 있었다. */
  function setShare(year, id, uids, before, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    if (!deps.uid) return Promise.reject(new Error('로그인을 확인해 주세요'));
    var who0 = owner || deps.uid;
    var now = Object.create(null), was = Object.create(null);
    (uids || []).forEach(function (u) { if (u && u !== who0) now[u] = 1; });
    (before || []).forEach(function (u) { if (u && u !== who0) was[u] = 1; });
    var u = {}, base = metaPath(year, id, who0);
    Object.keys(now).forEach(function (who) {
      u[base + '/shareWith/' + who] = true;
      u[sharedToPath(who, id)] = { owner: who0, year: String(year), at: Date.now() };
    });
    /* 뺀 사람은 두 곳에서 다 지운다 — 한 곳만 지우면 목록에 유령이 남는다.
       ⚠ 「왜 열렸는지」(shareBy)도 함께 지운다(2026-08-28). 안 지우면 뺀 사람의 설명이
         남아, 다음에 그 사람을 손으로 넣었을 때 「계약 담당」이라고 잘못 적힌다. */
    Object.keys(was).forEach(function (who) {
      if (now[who]) return;
      u[base + '/shareWith/' + who] = null;
      u[base + '/shareBy/' + who] = null;
      u[sharedToPath(who, id)] = null;
    });
    if (!Object.keys(u).length) return Promise.resolve();
    return deps.db.ref().update(u);
  }

  /* ── 일하는 사람들에게 «더해 주기»만 한다 (대표 지시 2026-08-28) ──
     "푸른이알피에서 주담당 부담당으로 업무처리하는 경우 공동으로 사진을 보고
      공유할 수 있게 해달라."

     setShare 와 셋이 다르다.
     ① **더하기만 한다.** 넘긴 목록에 없는 사람은 건드리지 않는다 — 손으로 넣어 둔
        공유가 업무 저장 한 번에 조용히 끊기면 안 된다(대표 결정 2026-08-28: 「그대로 둔다」).
     ② **남의 사진에도 걸 수 있다**(owner 를 받는다). 계약서 사진은 대개 남이 올린 것이라
        내 자리에 쓰면 아무 일도 안 일어난다.
        ⚠ 규칙이 허락하는 사람은 **사진 주인과 총괄관리자**뿐이다. 아니면 여기서
          거절당한다 — 부르는 쪽이 그 사실을 사람에게 말해 줘야 한다(조용히 넘기면
          「분명 저장했는데 저쪽은 못 본다」가 된다).
     ③ **왜 열렸는지 남긴다**(shareBy). 사진첩이 「계약 담당」이라고 적어 주려는 것이다 —
        손으로 넣은 사람과 구분되어야 ✕ 로 뺄 때 망설이지 않는다.
        ⚠ 권한을 가르는 것은 여전히 shareWith 하나다(규칙이 그것만 본다). shareBy 는
          설명일 뿐이라, 없어도 보이는 데는 지장이 없다. */
  function addShare(year, id, uids, owner, why) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    if (!year || !id) return Promise.reject(new Error('사진을 알 수 없습니다'));
    var who = owner || deps.uid;
    if (!who) return Promise.reject(new Error('사진 주인을 알 수 없습니다'));
    var base = metaPath(year, id, who);
    var u = {}, added = [];
    (uids || []).forEach(function (x) {
      /* 주인 자신은 넣지 않는다 — 자기 사진은 원래 보인다(넣으면 「같이 볼 사람」에
         자기 이름이 뜬다). */
      if (!x || x === who) return;
      if (u[base + '/shareWith/' + x]) return;      // 같은 사람이 두 번 온 경우
      u[base + '/shareWith/' + x] = true;
      /* ⚠ 까닭이 빈 값이면 **표를 안 단다**(2026-08-28). 사람이 손으로 고른 사람에게
         「업무」라고 적어 두면, 사진첩에서 ✕ 로 뺄 때 무엇이 자동인지 갈리지 않는다. */
      u[base + '/shareBy/' + x] = String(why || '').trim().slice(0, 60) || null;
      u[sharedToPath(x, id)] = { owner: who, year: String(year), at: Date.now() };
      added.push(x);
    });
    if (!added.length) return Promise.resolve([]);
    return deps.db.ref().update(u).then(function () { return added; });
  }

  /* ── 사번(sid) → 계정(uid) 대조표 (대표 지시 2026-08-28) ──
     업체·계약의 담당자는 «사번»으로 적혀 있고, 사진 권한은 «계정»으로 건다. 그 사이를
     잇는 것이 uid_roles 다(로그인할 때 그 사람 계정 밑에 사번이 적힌다).

     ⚠ **화면이 아니라 여기**에 둔다. 사진첩 화면은 실시간DB를 직접 만지지 않는 것이
       규칙이고(tests/pu-photos-html.test.js 가 셋으로 못박는다), 처음에 화면에
       두었다가 그 셋에 걸렸다 — 울타리가 옳았다.
     ⚠ 한 번도 로그인한 적 없는 사람은 계정이 없어 **안 나온다.** 부르는 쪽이 그 사실을
       사람에게 말해 줘야 한다 — 조용히 빠뜨리면 「왜 저 사람만 못 보지」가 된다.
     ⚠ 한 사람이 계정을 여럿 만들었으면 **가장 최근 것**을 쓴다.
     ⚠ 한 번 읽고 쥐고 있는다 — 스무 장에 담당자를 걸 때마다 읽으면 그만큼 돈이 든다. */
  var _uidBySid = null;
  function uidBySid() {
    if (_uidBySid) return Promise.resolve(_uidBySid);
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref('uid_roles').once('value').then(function (s) {
      var v = s.val() || {}, best = {};
      Object.keys(v).forEach(function (uid) {
        var r = v[uid];
        if (!r || !r.sid) return;
        var t = r.updatedAt || 0;
        if (!best[r.sid] || t > best[r.sid].t) best[r.sid] = { uid: uid, t: t };
      });
      var out = {};
      Object.keys(best).forEach(function (sid) { out[sid] = best[sid].uid; });
      _uidBySid = out;
      return out;
    }).catch(function () { return {}; });
  }

  /* 나에게 공유된 사진 목록 — 받는 사람 자리를 훑고 그 한 장씩 읽어 온다.
     ⚠ 한 장을 못 읽어도 나머지는 보여야 한다(공유가 풀렸거나 원본이 지워진 경우). */
  function listSharedToMe() {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    if (!deps.uid) return Promise.resolve({});
    return readOnce(sharedToPath(deps.uid)).then(function (idx) {
      var ids = Object.keys(idx || {});
      if (!ids.length) return {};
      return Promise.all(ids.map(function (id) {
        var r = idx[id] || {};
        if (!r.owner || !r.year) return null;
        return readOnce(metaPath(r.year, id, r.owner)).then(function (meta) {
          if (!meta) return null;   // 원본이 지워졌다 — 목록에서 그냥 뺀다
          /* __year 도 함께 새긴다 — 화면이 본문·미리보기를 찾을 때 쓰는 값이다.
             __sharedYear 는 예전부터 있었지만 아무도 안 읽어, 받은 사진이
             늘 «올해» 자리에서 찾히다 통째로 까맣게 나왔다 (2026-08-13 김보람 제보). */
          return { id: id, meta: Object.assign({}, meta, {
            __ownerUid: r.owner, __sharedYear: String(r.year), __year: String(r.year)
          }) };
        }).catch(function () { return null; });
      })).then(function (rows) {
        var out = {};
        rows.forEach(function (x) { if (x) out[x.id] = x.meta; });
        return out;
      });
    });
  }

  /* ── 나에게 몇 장이 와 있나 (대표 보고 2026-08-29) ──
     "권형하가 공유했는데 전혀 공유가 안되었다."

     보낸 쪽은 초록 알림을 받는데 **받는 쪽에는 아무 신호가 없었다.** 받은 사진으로
     가는 길은 「누구 사진」 고르개 안의 한 줄뿐이라, 말해 주지 않으면 평생 안 연다.
     그래서 화면이 «장수»를 먼저 알 수 있어야 한다 — 0장이면 아무것도 안 그린다.

     ⚠ 목록(listSharedToMe)과 달리 **사진을 한 장도 안 읽는다.** 색인 한 칸만 세므로
       사진첩을 열 때마다 불러도 부담이 없다. 사진까지 읽어 세면 그 순간 「받은 사진」을
       늘 통째로 불러오는 셈이 된다.
     ⚠ **once 가 아니라 구독이다.** 첫 값이 곧 「지금 몇 장」이고, 그 뒤 누가 나에게
       열어 주면 화면을 새로 고치지 않아도 숫자가 는다. once 로 읽고 다시 on 을 걸면
       같은 자리를 두 번 받는다(요금이 두 배). 첫 값을 초기값으로 쓴다. */
  function watchSharedCount(cb) {
    if (!deps.db || !deps.uid) { cb(0); return function () {}; }
    var ref = deps.db.ref(sharedToPath(deps.uid));
    var handler = function (s) { cb(s.numChildren ? s.numChildren() : 0); };
    /* 못 읽어도 화면은 살아 있어야 한다 — 그냥 0장으로 둔다(칸이 안 그려질 뿐이다) */
    ref.on('value', handler, function () { cb(0); });
    return function () { ref.off('value', handler); };
  }

  /* 공유받은 사람 이름을 붙여 준다 — uid 만 보이면 누구인지 모른다 */
  function fillSharedNames(items) {
    return listOwners().then(function (owners) {
      Object.keys(items).forEach(function (id) {
        var uid = items[id].__ownerUid;
        items[id].__ownerName = (owners[uid] && owners[uid].name) || uid;
      });
      return items;
    }).catch(function () { return items; });
  }

  /* owner 를 넘기면 **그 사람 자리**에 쓴다.
     ⚠ 이 인자가 없던 동안, 관리자가 남의 사진을 판독하면 결과가 자기 자리의
       없는 사진 밑으로 들어갔다. 그래서 화면이 판독 자체를 잠갔고, 결국 다른
       직원이 찍은 명함은 그 직원이 자기 화면을 열 때만 기업정보함에 들어갔다
       (대표 지시 2026-08-10로 바로잡음).
     ⚠ 쓰기 전에 그 사진 정보가 **아직 있는지** 먼저 본다(2026-08-15 발견).
       판독(AI 호출)은 몇 초 걸린다 — 그 사이 사람이 사진을 지우면, 이 함수는
       (지워진) items/{연도}/{id} 아래 read 한 칸만 부분 경로로 쓴다. 실시간DB는
       없는 자리에 부분 경로를 쓰면 **그 자리를 새로 만든다** — 그러면 사진도
       정보도 없이 read 만 있는 유령 항목이 생긴다(실데이터에서 여러 건 발견,
       "기업정보함에 새로 넣었습니다" 같은 표시까지 남아 있어 기업정보함에도 헛짚힐 수
       있었다). 지워졌으면 조용히 아무것도 안 쓴다 — 되살릴 것이 없다. */
  /* ⚠ 판독이 **계약서·근태표로 가리면 그 자리에서 원본 주소를 지운다**
     (보안 3건 계획 2단계, 2026-08-17). 민감 여부는 올릴 때가 아니라 **판독 뒤**에
     정해지므로, 「올릴 때 안 적는다」로는 못 막는다 — 올릴 때는 서류인지까지만 안다.
     주소를 남겨 두면 만료도 없고 로그인도 필요 없는 링크가 그대로 남아,
     공유를 풀어도 열린다. */
  function saveRead(year, id, read, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var path = metaPath(year, id, owner);
    return readOnce(path).then(function (meta) {
      if (!meta) return null;
      var u = {};
      u[path + '/read'] = read;
      if (isSensitiveRead(read)) u[path + '/fullUrl'] = null;
      return deps.db.ref().update(u);
    });
  }

  /* 고정 분류로 옮길 때 판독 종류와 직접분류 해제를 한 번에 저장한다.
     둘을 따로 쓰면 첫 저장 뒤 연결이 끊겼을 때 두 분류에 동시에 남는다. */
  function setPrimaryKind(year, id, read, customKind, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    var p = metaPath(year, id, owner);
    u[p + '/read'] = read;
    u[p + '/customKind'] = customKind || null;
    /* ⚠ 여기도 지운다. saveRead 한 곳만 고치면, 사람이 「계약서」로 손수 옮긴 사진의
       주소는 그대로 남는다 — 손으로 옮기는 쪽이 오히려 정확한 분류다. */
    if (isSensitiveRead(read)) u[p + '/fullUrl'] = null;
    return deps.db.ref().update(u);
  }

  /* ── 직접 만드는 분류 ──
     AI 자동 분류를 코드로 늘리려면 프롬프트를 고치고 배포해야 한다 —
     '아무 때나 새 분류를 만든다'는 지시와 안 맞는다. 그래서 사람이 직접
     이름을 짓고, 사람이 직접 사진에 붙인다. */

  function listCustomKinds() {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(customKindsPath()).once('value').then(function (s) { return s.val() || {}; });
  }

  /* ── 고정 분류 손보기 (대표 지시 2026-08-17, 두 번 요청) ──
     "탭 수정 변경 삭제 가능하게 해달라."

     고정 분류(명함·사업자등록증·계약서…)는 **판독 AI 가 판정하는 갈래 그 자체**라
     갈래를 없앨 수는 없다 — 없애면 AI 가 「계약서」로 판정한 사진이 담길 칸이
     사라져 통째로 기타서류로 쏟아진다. 그래서 두 가지만 연다:
       · 이름 고치기 → **보이는 이름표만** 바꾼다(갈래·판독·사진은 그대로).
       · 탭 숨기기   → 탭 줄에서만 감춘다. 그 사진들은 기타서류에서 계속 보이고,
                       되살리면 그대로 돌아온다. **사진은 한 장도 안 지워진다.**
     둘 다 전 직원이 함께 보는 공용이라 총괄 관리자만 쓴다(customKinds 와 같은 규칙).
     ⚠ 「전체사진」은 어느 쪽도 안 된다 — 돌아갈 자리는 늘 같은 곳에 있어야 한다. */
  function kindLabelsPath() { return DB_ROOT + '/kindLabels'; }
  function kindHiddenPath() { return DB_ROOT + '/kindHidden'; }

  function listKindLabels() {
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref(kindLabelsPath()).once('value')
      .then(function (s) { return s.val() || {}; })
      .catch(function () { return {}; });
  }
  function listHiddenKinds() {
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref(kindHiddenPath()).once('value')
      .then(function (s) { return s.val() || {}; })
      .catch(function () { return {}; });
  }

  function renameFixedKind(key, name) {
    if (!deps.isAdmin) return Promise.reject(new Error('분류 이름 변경은 총괄 관리자만 할 수 있습니다'));
    if (!key || key === 'all') return Promise.reject(new Error('「전체사진」은 고칠 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var clean = String(name || '').trim();
    var u = {};
    /* 빈 이름으로 고치면 «원래 이름으로 되돌리기» 다 — 덮어쓴 이름표를 지운다. */
    u[kindLabelsPath() + '/' + key] = clean || null;
    return deps.db.ref().update(u).then(function () { return { key: key, name: clean }; });
  }

  function setKindHidden(key, hidden) {
    if (!deps.isAdmin) return Promise.reject(new Error('분류 숨기기는 총괄 관리자만 할 수 있습니다'));
    if (!key || key === 'all') return Promise.reject(new Error('「전체사진」은 숨길 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[kindHiddenPath() + '/' + key] = hidden ? true : null;
    return deps.db.ref().update(u);
  }

  /* ── 보유기준 점검 담당자 ──
     기준(증빙 5년·나머지 1년)은 있는데 지우는 일이 아무에게도 안 걸려 있었다.
     자동 삭제는 일부러 만들지 않았으므로(사람 확인이 필수) 누가 언제 볼지를 정해 둔다.
     화면은 실시간DB를 직접 만지지 않는다 — 쓰기는 이 층만 한다. */
  function getRetention() {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(retentionPath()).once('value').then(function (s) { return s.val() || {}; });
  }

  function setRetentionOwner(uid, name) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    if (!uid) return Promise.reject(new Error('담당자를 고르지 않았습니다'));
    /* 담당자가 바뀌면 **앞사람의 점검 기록은 지운다** — 앞사람이 본 것을 뒷사람이
       본 것으로 칠 수 없다. 새 담당자에게는 곧바로 알림이 뜬다.
       ⚠ set 이 아니라 **update** 다(2026-09-01). set 으로 통째로 덮으면 같은 자리에
         있는 **서류별 보유기한(months)이 함께 날아간다** — 담당자를 바꿨을 뿐인데
         신분증 3개월이 조용히 사라지는 셈이다. 비울 것만 콕 집어 비운다. */
    return deps.db.ref(retentionPath()).update({
      uid: uid, name: name || '', lastAt: 0, lastBy: '', setAt: Date.now()
    });
  }

  /* ── 서류별 보유기한(달) (대표 지시 2026-09-01) ──
     「증빙 5년 / 나머지 1년」 둘로는 근로자 서류를 못 담는다 —
     신분증·등본은 가장 짧게, 개인정보 동의서는 가장 길게 두어야 한다.
     ⚠ 처음 값은 화면(KEEP_MONTHS_BY_KIND)이 들고 있다. 여기 담기는 것은
       «고친 것»뿐이라, 비워 두면 처음 값 그대로 돈다. */
  function setKeepMonths(map) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var clean = {};
    Object.keys(map || {}).forEach(function (k) {
      var n = Number(map[k]);
      /* ⚠ 말 안 되는 값은 안 담는다 — 글자·음수·터무니없이 긴 것(100년 넘게).
         한 글자만 잘못 들어가도 사진이 통째로 「지난 것」이 되거나 영영 안 지워진다. */
      if (!/^[a-z]+$/.test(k) || !isFinite(n) || n < 0 || n > 1200) return;
      clean[k] = Math.round(n);
    });
    return deps.db.ref(retentionPath() + '/months').set(clean);
  }

  function markRetentionChecked(name) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(retentionPath()).update({ lastAt: Date.now(), lastBy: name || '' });
  }

  /* 이름이 같은 분류를 두 번 만들지 않는다(대소문자·앞뒤 공백 무시) —
     안 그러면 "자문등계약서"와 "자문등계약서 " 가 따로 쌓여 사람이 헷갈린다. */
  /* 분류 이름 고치기.
     ⚠ 사진은 이름이 아니라 **번호(id)** 로 분류를 가리킨다. 그래서 이름만 갈면 되고
       사진은 한 장도 안 건드린다 — 잘못 만든 이름("자문등계약서")을 고쳐도
       그 분류에 든 사진은 그대로 남는다.
     이름이 겹치는 것은 만들 때와 같은 규칙으로 막는다. 안 막으면 같은 이름이 둘이 되어
     어느 쪽에 넣었는지 사람이 못 가린다. */
  function renameCustomKind(id, name) {
    /* ⚠ 총괄 관리자만(대표 지시 2026-08-15) — 분류 이름표는 전 직원이 함께 보는
       공용이라, 누구나 고칠 수 있으면 오타 분류가 쌓여도 못 막는다.
       사진에 분류를 「지정」하는 addCustomKind 는 다르다 — 그건 안 막는다. */
    if (!deps.isAdmin) return Promise.reject(new Error('분류 이름 변경은 총괄 관리자만 할 수 있습니다'));
    var clean = String(name || '').trim();
    if (!id) return Promise.reject(new Error('어떤 분류인지 알 수 없습니다'));
    if (!clean) return Promise.reject(new Error('분류 이름을 입력해 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return listCustomKinds().then(function (existing) {
      if (!existing[id]) throw new Error('이미 지워진 분류입니다');
      var norm = clean.toLowerCase();
      var dupId = Object.keys(existing).find(function (k) {
        return k !== id && String((existing[k] || {}).name || '').trim().toLowerCase() === norm;
      });
      if (dupId) throw new Error('「' + clean + '」은 이미 있는 분류입니다');
      if (String(existing[id].name || '').trim() === clean) return { id: id, changed: false };
      return deps.db.ref(customKindsPath() + '/' + id)
        .update({ name: clean, renamedAt: Date.now() })
        .then(function () { return { id: id, changed: true }; });
    });
  }

  /* 분류 지우기 (대표 지시 2026-08-13: "분류 한 것에 이름을 변경하거나 삭제할 수 있게").
     ⚠ **사진은 한 장도 안 지운다.** 이름표만 없앤다 — 폴더 지우기와 같은 원칙이다.
        직접분류는 "더하는 것이지 기타서류에서 빼앗지 않는" 자리라, 이름표가 사라져도
        사진은 원래 있던 탭(회의사진·기타서류 등)에 그대로 남는다.
     ⚠ 사진에 남은 customKind 값은 **안 건드린다**(대표 선택 2026-08-13).
        건드리려면 사진을 전부 훑어야 하는데, 규칙상 내가 볼 수 있는 것은 내 사진뿐이라
        다른 직원 사진에는 표시가 남아 반쪽이 된다. 가리키는 분류가 없으면 화면이
        그냥 안 보여 주므로(tabsOf 가 CUSTOM_KINDS 에 있는지 본다) 해가 없다.
     ⚠ 그래서 **되돌릴 수 없다** — 같은 이름으로 다시 만들어도 번호가 달라
        옛 사진이 저절로 돌아오지 않는다. 화면이 지우기 전에 이 말을 해야 한다. */
  function deleteCustomKind(id) {
    /* ⚠ 총괄 관리자만(대표 지시 2026-08-15) — renameCustomKind 와 같은 이유. */
    if (!deps.isAdmin) return Promise.reject(new Error('분류 삭제는 총괄 관리자만 할 수 있습니다'));
    if (!id) return Promise.reject(new Error('어떤 분류인지 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[customKindsPath() + '/' + id] = null;
    return deps.db.ref().update(u);
  }

  function addCustomKind(name) {
    var clean = String(name || '').trim();
    if (!clean) return Promise.reject(new Error('분류 이름을 입력해 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return listCustomKinds().then(function (existing) {
      var norm = clean.toLowerCase();
      var dupId = Object.keys(existing).find(function (id) {
        return String((existing[id] || {}).name || '').trim().toLowerCase() === norm;
      });
      if (dupId) return { id: dupId, created: false };
      var id = deps.db.ref(customKindsPath()).push().key;
      var rec = { name: clean, createdAt: Date.now(), createdBy: deps.name || '' };
      var u = {};
      u[customKindsPath() + '/' + id] = rec;
      return deps.db.ref().update(u).then(function () { return { id: id, created: true }; });
    });
  }

  /* ══════ 내 폴더 (대표 지시 2026-08-09) ══════
     "개인마다 사진들을 종류별로 업무별로 분류해야할 경우가 있다"
     "폴더는 나만 수정하는것이다. 회의사진처럼 같이 공유하는 부분은 공유로 하면된다"

     분류 탭과 **다른 축**이다 — 분류는 「무엇인가」(명함·회의사진), 폴더는
     「어느 일인가」(㈜가야 실태조사·8월 교육). 그래서 한 사진이 둘 다에 든다.

     ⚠ **내 자리 안에 둔다**(u/{내uid}/folders). 그래서 규칙을 새로 안 짜도
        「본인과 관리자만」이 이미 걸려 있다. 공용 자리(customKinds)와 다른 점이다 —
        분류 이름표는 전 직원이 함께 보지만, 폴더는 내 정리 방식이라 나만 본다.
     ⚠ 공유와 아무 상관이 없다. 남에게 보여주는 일은 「같이 볼 사람」(shareWith)이
        따로 맡는다. 내가 어떻게 묶든 남이 보는 것에는 영향이 없다. */
  function foldersPath(owner) { return base(owner) + '/folders'; }

  function listFolders(owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(foldersPath(owner)).once('value').then(function (s) { return s.val() || {}; });
  }

  /* parentId 를 주면 그 폴더의 **하위폴더**가 된다 (대표 지시 2026-08-10).
     ⚠ 한 단계까지만 — 하위폴더 밑에 또 만들려 하면 그 위(상위)에 붙인다.
        좁은 칸에서 계속 파고들면 「어디 뒀더라」가 된다(대표 승인 목업). */
  function addFolder(name, parentId) {
    var clean = String(name || '').trim();
    if (!clean) return Promise.reject(new Error('폴더 이름을 입력해 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return listFolders().then(function (existing) {
      /* 하위폴더의 하위폴더는 만들지 않는다 — 한 단계 위로 끌어올린다 */
      var parent = parentId || null;
      if (parent && existing[parent] && existing[parent].parent) parent = existing[parent].parent;
      /* 같은 이름을 또 만들지 않는다 — 대소문자·앞뒤 공백을 무시하고 견준다.
         ⚠ **같은 어버이 안에서만** 견준다. 다른 일 밑에 같은 이름의 하위폴더를 두는 것은
            자연스럽다(㈜가야 ↳ 현장사진 · 8월 교육 ↳ 현장사진). */
      var norm = clean.toLowerCase();
      var dupId = Object.keys(existing).find(function (id) {
        var f = existing[id] || {};
        return (f.parent || null) === parent
          && String(f.name || '').trim().toLowerCase() === norm;
      });
      if (dupId) return { id: dupId, created: false };
      var id = deps.db.ref(foldersPath()).push().key;
      var u = {};
      u[foldersPath() + '/' + id] = { name: clean, createdAt: Date.now(), parent: parent };
      return deps.db.ref().update(u).then(function () { return { id: id, created: true, parent: parent }; });
    });
  }

  function renameFolder(folderId, name) {
    var clean = String(name || '').trim();
    if (!folderId) return Promise.reject(new Error('어느 폴더인지 알 수 없습니다'));
    if (!clean) return Promise.reject(new Error('폴더 이름을 입력해 주세요'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[foldersPath() + '/' + folderId + '/name'] = clean;
    return deps.db.ref().update(u);
  }

  /* ⚠ 폴더를 지워도 **사진은 안 지운다.** 폴더 이름표만 없앤다 —
     사진은 「전체」에 그대로 남는다. 폴더 지웠다가 사진까지 사라지면 큰일이다.
     사진에 남은 folder 값은 가리키는 폴더가 없으므로 화면이 「전체」로만 본다
     (사진마다 지우러 다니지 않는다 — 수천 장이면 그 자체가 사고 위험이다). */
  /* ⚠ 하위폴더가 있으면 **함께 지운다.** 어버이만 지우면 하위폴더가 없는 어버이를
     가리켜 어느 목록에도 안 나온다(고아). 부르는 쪽이 먼저 물어보고 온다. */
  function deleteFolder(folderId) {
    if (!folderId) return Promise.reject(new Error('어느 폴더인지 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return listFolders().then(function (existing) {
      var u = {};
      u[foldersPath() + '/' + folderId] = null;
      Object.keys(existing).forEach(function (id) {
        if ((existing[id] || {}).parent === folderId) u[foldersPath() + '/' + id] = null;
      });
      return deps.db.ref().update(u).then(function () { return { removed: Object.keys(u).length }; });
    });
  }

  /* 하위폴더만 지울 때 그 안 사진을 **어버이로 올린다**(사라지지 않게).
     어버이가 없으면(맨 위 폴더였으면) 폴더에서 빼기만 한다 — 「전체」에 남는다. */
  function moveFolderPhotos(year, ids, toFolderId, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    if (!ids || !ids.length) return Promise.resolve(0);
    var u = {};
    ids.forEach(function (id) {
      u[metaPath(year, id, owner) + '/folder'] = toFolderId || null;
    });
    return deps.db.ref().update(u).then(function () { return ids.length; });
  }

  /* 사진 하나를 폴더에 넣거나(folderId) 뺀다(folderId 없이 호출).
     ⚠ 한 사진은 폴더 하나에만 — 여러 곳에 겹치면 「어디에 뒀더라」가 된다. */
  function setFolder(year, id, folderId, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[metaPath(year, id, owner) + '/folder'] = folderId || null;
    return deps.db.ref().update(u);
  }

  /* 사진 하나에 분류를 붙이거나(kindId) 뗀다(kindId 없이 호출).
     AI 종류(read.kind)와 별도 칸에 둔다 — "더하는 것이지 기타서류에서
     빼앗지 않는다"(대표 승인 목업)를 지키려면 서로 안 건드려야 한다. */
  function setCustomKind(year, id, kindId, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[metaPath(year, id, owner) + '/customKind'] = kindId || null;
    return deps.db.ref().update(u);
  }

  /* ── 문서 묶음 고치기 (대표 지시 2026-08-13) ──
     여러 쪽짜리 문서는 meta.doc = {name,page,total,taken,group} 로 묶여 있다.
     사람이 「쪽마다 따로 읽기」·「이 쪽만 떼어내기」·「한 문서로 묶기」를 할 때
     그 칸을 고쳐 준다. doc 이 null 이면 묶음에서 빠져 홑장이 된다.

     ⚠ **한 묶음(update)으로 한 번에 쓴다.** 나눠 쓰다 중간에 끊기면 어떤 쪽은
        묶여 있고 어떤 쪽은 풀린 반쪽 상태가 되어, 판독이 문서를 못 모은다.
     ⚠ 사진 본문·미리보기는 건드리지 않는다 — 묶는 방식만 바뀔 뿐 사진은 그대로다. */
  function setDocs(year, entries, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var list = entries || [];
    if (!list.length) return Promise.resolve();
    var u = {};
    list.forEach(function (e) {
      if (!e || !e.id) return;      // 번호가 없으면 상위 노드를 가리키게 된다
      u[metaPath(year, e.id, owner) + '/doc'] = e.doc || null;
    });
    if (!Object.keys(u).length) return Promise.resolve();
    return deps.db.ref().update(u);
  }

  /* 한 연도의 사진 목록(정보만). 본문·미리보기는 안 딸려 온다 — 경로가 갈라져 있어서.
     owner 를 넘기면 그 사람 것을 읽는다(관리자만 규칙이 허락한다). */
  /* ── 옛 자리는 «한 해에 한 번만» 읽는다 (대표 지시 2026-08-31) ──
     "쓸데없이 창을 연 것만으로 비용이 나가면 사용 의미가 없다."

     옛 자리(2026-08-03 사람별로 가르기 전 자리)는 **사람마다 다르지 않고 모두 한 곳**이다.
     그런데 「전체 근로자」로 열면 아홉 사람 몫으로 **같은 것을 아홉 번** 읽고 있었다.
     ⚠ 지우지는 않는다 — 옛 사진이 하나라도 남아 있는데 안 읽으면 «사진이 사라져 보인다»
       (2026-08-03 에 실제로 겪었다). 값만 한 번으로 줄인다.
     ⚠ 한 번 읽은 것은 이 화면이 열려 있는 동안만 들고 있다 — 새로고침하면 다시 읽는다.
       옛 자리는 이제 아무도 안 쓰므로 그 사이에 바뀔 일이 없다. */
  var _legacyYear = {};
  function legacyYear(year) {
    var k = String(year);
    if (!_legacyYear[k]) {
      _legacyYear[k] = deps.db.ref(legacyRoot('items') + '/' + k).once('value')
        .then(function (s) { return s.val() || {}; })
        .catch(function () { return {}; });
    }
    return _legacyYear[k];
  }

  function listYear(year, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var who = owner || deps.uid;
    return Promise.all([
      deps.db.ref(base(owner) + '/items/' + year).once('value'),
      legacyYear(year)
    ]).then(function (snaps) {
      var mine = snaps[0].val() || {};
      var old = snaps[1] || {};
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
      /* 어느 해 자리에서 꺼냈는지 사진에 새겨 준다 — 본문·미리보기를 찾을 때 쓴다.
         화면의 해(gridYear)로 두드리면 다른 해 사진은 통째로 못 찾는다. */
      Object.keys(out).forEach(function (id) { out[id].__year = String(year); });
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

  /* ── 어디에 썼는지 표시 ──
     보유기준(2026-08-06)이 증빙 5년·나머지 1년으로 갈리므로, **증빙으로 썼는지**를
     알아야 한다. 컨설팅이 사진을 가져갈 때 여기에 한 줄 남긴다.

     사진 정보 아래 한 칸(used)만 건드린다 — 사진 자체나 판독 결과는 손대지 않는다.
     남의 사진을 쓸 때(관리자)는 그 사람 자리에 적히므로 owner 를 함께 넘긴다. */
  function markUsed(year, id, where, owner) {
    if (!year || !id) return Promise.reject(new Error('표시할 사진을 알 수 없습니다'));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var u = {};
    u[metaPath(year, id, owner) + '/used'] = {
      at: Date.now(),
      where: String(where || '').slice(0, 120),
      by: deps.uid || ''
    };
    return deps.db.ref().update(u);
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
            /* ⚠ 창고 사진은 실시간DB 용량에 안 넣는다(2026-08-13) — 본문이 창고에
               있으니 실시간DB 1GB 한도를 안 먹는다. 넣으면 옮겨도 계기판이
               안 줄어 "옮긴 보람이 없다"로 보인다. 장수(n)는 그대로 센다 —
               사진이 준 게 아니라 자리만 바뀐 것이다. */
            if (m.loc !== 'storage') bytes += Number(m.size) || 0;
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
  /* ⚠ 창고를 먼저 본다(withStorage) — 옮긴 사진은 거기 있다. 없으면(아직 안
     옮겼거나, 이 화면이 창고를 안 이어 줬으면) 실시간DB 옛 길로 물러난다. */
  /* ── 적어 둔 주소 먼저 (2026-08-17, 대표 보고 「사진이 안 뜬다·너무 늦다」) ──
     창고 규칙은 「자기 사진만」이라, 관리자가 남의 사진을·직원이 공유받은 사진을
     창고에 직접 청하면 403 이다 — 남의 사진이 회색 칸이 되고, 크게 보기에서는
     「원본이 없습니다」로 둔갑했다(창고 실패 → 실시간DB 로 물러나는데 거기는 비었다).
     정보에 적어 둔 주소(토큰 URL)는 규칙과 무관하게 열린다. 그래서 **주소부터**
     쓰고, 죽은 주소(토큰 재발급 등)면 지운 뒤 옛 길로 물러난다.
     ⚠ 주소가 없는 옛 사진은 서버 「주소 채우기」(migratePhotosToStorage)가 채운다. */
  function loadVia(urlKey, year, id, owner, direct) {
    return readOnce(metaPath(year, id, owner) + '/' + urlKey).then(function (u) {
      /* 주소는 반드시 https 문자열이어야 한다 — 그 자리에 엉뚱한 값이 앉아 있어도
         (옛 기록·손상) 보기가 통째로 죽으면 안 된다. 그때는 옛 길로 간다. */
      if (typeof u !== 'string' || u.indexOf('https://') !== 0) return direct();
      return urlToDataUrl(u).catch(function () {
        var del = {};
        del[metaPath(year, id, owner) + '/' + urlKey] = null;
        try { deps.db.ref().update(del); } catch (_) { }
        return direct();
      });
    });
  }
  /* loc = 부르는 쪽이 이미 아는 보관 자리(meta.loc). 'storage' 가 **아니라고 알면**
     창고를 두드리지 않는다 — 그 사진은 창고에 없어 404 만 돌아온다.
     ⚠ 안 넘기면(모르면) 예전처럼 창고부터 본다. 값이 틀려서 사진을 못 보는 것보다
       헛 요청 한 번이 낫기 때문이다. */
  function loadThumb(year, id, owner, loc) {
    return loadVia('thumbUrl', year, id, owner, function () {
      var legacy = function () {
        return withLegacy(thumbPath(year, id, owner), legacyRoot('thumbs') + '/' + year + '/' + id);
      };
      if (loc && loc !== 'storage') return legacy();
      return withStorage(function () { return filePath(year, id, 'thumb', owner); }, legacy, owner);
    });
  }

  /* PDF 안에 있던 글자를 읽어 온다 (대표 결정 2026-08-24 「글자 있는 PDF 는 글자로」).
     ⚠ 없으면 **빈 문자열**을 준다 — 던지지 않는다. 부르는 쪽이 「글자가 없으면
       그림으로」 물러날 수 있어야 한다. 휴지통에서 되살린 사진은 글자가 없을 수도
       있는데(휴지통은 정보·본문·미리보기만 담는다), 그때도 판독이 멈추면 안 된다. */
  function loadText(year, id, owner) {
    if (!deps.db) return Promise.resolve('');
    return readOnce(textPath(year, id, owner))
      .then(function (t) { return (typeof t === 'string') ? t : ''; })
      .catch(function () { return ''; });
  }
  /* 민감 서류 원본을 **서버에서** 받아온다 — 주소를 안 남기기로 했으므로 이 길이 있어야
     관리자·공유받은 사람이 계약서를 볼 수 있다(창고 규칙은 「자기 사진만」이라 403 이다).
     ⚠ 실패하면 **조용히 넘기지 않는다.** 왜 안 보이는지 말해 줘야 「고장」으로 안 읽는다. */
  function fullFromServer(year, id, owner, mark) {
    var note = mark || function () {};
    var f = (typeof fetch === 'function') ? fetch : null;
    if (!f) { note('nofetch', '이 브라우저에서는 서버에 청할 수 없습니다'); return Promise.resolve(''); }
    if (!deps.auth) {
      /* ⚠ 이 한 줄이 계약서 31장을 세 앱에서 통째로 안 보이게 했다(2026-08-26).
         화면이 저장 층을 세우면서 열쇠를 안 넘긴 것인데, 예전에는 그냥 빈손이라
         「원본이 없습니다」로 보여 아무도 까닭을 몰랐다. 이제 그대로 말한다. */
      note('nokey', '이 화면이 서버에 내밀 열쇠를 안 넘겼습니다 — 관리자에게 알려 주세요');
      return Promise.resolve('');
    }
    var user = null;
    try { user = deps.auth.currentUser; } catch (_) { user = null; }
    if (!user) { note('nologin', '로그인이 풀렸습니다 — 새로고침 뒤 다시 열어 주세요'); return Promise.resolve(''); }
    return user.getIdToken().then(function (t) {
      return f(PHOTO_VIEW_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ owner: owner || deps.uid, year: String(year), id: id })
      });
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.ok && j && j.ok && j.dataUrl) return j.dataUrl;
        /* 400 = 「민감 서류가 아니다」 — 부르는 쪽이 헛짚은 것이니 조용히 물러난다.
           그 밖(403·404·502)은 사람이 알아야 하는 상태다. */
        if (r.status === 400) {
          note('notsensitive', '이 사진은 서버를 거치는 서류가 아닙니다 — 원본이 어디에도 없습니다');
          return '';
        }
        var e = new Error((j && j.error) || ('원본을 받아오지 못했습니다 (오류 ' + r.status + ')'));
        e.status = r.status;
        throw e;
      });
    });
  }

  /* ── 원본 받아오기 : **빈손이면 까닭을 함께 돌려준다** (대표 지시 2026-08-27) ──

     2026-08-26~27 에 찾은 고장 셋이 늦게 발견된 까닭이 하나였다 —
     **조용히 빈손으로 «성공»했다.** 오류가 안 나니 아무도 안 물어봤고,
     화면은 「원본을 불러오는 중…」에서 영영 멎거나 그냥 빈칸으로 보였다.

     그래서 이 길 하나만 둔다: 빈손이면 **왜 빈손인지**를 함께 준다.
     · loadFull 은 이것을 얇게 감싼 것이라 **두 벌이 되지 않는다** —
       두 벌로 두면 그것 자체가 오늘 잡으려는 「한쪽만 고쳐진 것」이 된다.
     · 403·404·502 처럼 «사람이 알아야 하는» 상태는 여전히 던진다(빈손이 아니다). */
  function loadFullDetail(year, id, owner) {
    var d = { code: '', why: '' };
    var mark = function (code, why) { if (!d.code) { d.code = code; d.why = why; } };
    return loadVia('fullUrl', year, id, owner, function () {
      return withStorage(function () { return filePath(year, id, 'full', owner); }, function () {
        return withLegacy(blobPath(year, id, owner), legacyRoot('blobs') + '/' + year + '/' + id);
      }, owner).then(function (v) {
        /* 창고에도 옛 자리에도 없다 — **민감 서류라 주소를 안 남긴 것**일 수 있다.
           그때는 서버에 청한다. 이 갈래가 없으면 계약서가 「원본이 없습니다」로 보인다. */
        if (v) return v;
        return fullFromServer(year, id, owner, mark);
      });
    }).then(function (src) {
      if (src) return { src: src, code: '', why: '' };
      if (!d.code) mark('none', '사진첩에 원본이 없습니다 — 지워졌거나 아직 다 안 올라갔을 수 있습니다');
      return { src: '', code: d.code, why: d.why };
    });
  }

  function loadFull(year, id, owner) {
    return loadFullDetail(year, id, owner).then(function (r) { return r.src; });
  }

  /* ── 한 해의 미리보기를 **한 번에** 받아온다 (대표 보고 2026-08-10) ──
     "로그인하면 사진 나오는데 너무 시간이 많이 걸린다."

     원인은 데이터 양이 아니라 **오간 횟수**였다. 화면이 미리보기를 한 장씩,
     그것도 앞 장이 끝나야 다음 장을 청하는 식으로 받았다. 99장이면 99번을
     차례로 오간다. 폰에서 한 번 오가는 데 0.2초면 그것만으로 20초다.
     받는 양(240px 짜리 99장 ≈ 1.7MB)은 몇 초면 끝나는 크기다.

     그래서 한 해 치를 한 묶음으로 청한다 — 오가는 횟수가 99번에서 한 번이 된다.
     ⚠ 규칙이 이것을 허락하는 자리라야 한다. 내 사진(u/{나}) 과 관리자가 보는
        남의 사진은 윗칸에 읽기 권한이 있어 묶음으로 받아진다. 공유받은 사진은
        **사진 한 장마다** 권한을 따지므로 묶음이 막힌다 — 화면이 그때는
        한 장씩 받는 옛 길로 물러선다. */
  /* ── 미리보기 **주소만** 받아온다 (대표 보고 2026-08-15: 느리다·비용) ──
     loadThumb 은 주소를 받은 뒤 파일을 내려받아 data: 로 바꿔 준다. 그러면
     ①오가는 횟수가 두 배고 ②**브라우저가 캐시를 못 한다**(data: 는 주소가 아니라
     내용이라 캐시 열쇠가 없다) — 사진첩을 열 때마다 302장을 새로 받는다.
     주소를 그대로 <img src> 에 꽂으면 두 번째부터는 브라우저가 캐시에서 꺼낸다.
     ⚠ 판독(OCR)은 여전히 loadFull 로 **내용**을 받아야 한다 — 거기는 안 바꾼다.
     ⚠ 창고에 없는 옛 사진(실시간DB 보관)은 null 을 준다 — 부르는 쪽이 옛 길로 간다. */
  function thumbUrl(year, id, owner) {
    if (!deps.storage) return Promise.resolve(null);
    /* ⚠ 남의 사진은 묻지 않는다 — 창고 규칙(자기 사진만)이 반드시 403 을 준다.
       남의 사진 주소는 서버 「주소 채우기」가 정보에 적어 준다(migratePhotosToStorage). */
    if (!storageMine(owner)) return Promise.resolve(null);
    var path;
    try { path = filePath(year, id, 'thumb', owner); } catch (e) { return Promise.resolve(null); }
    return deps.storage.ref(path).getDownloadURL().catch(function () { return null; });
  }

  /* 받아 둔 주소를 사진 정보에 적어 둔다 — 다음에 열 때는 주소받기조차 건너뛴다.
     ⚠ 실패해도 조용히 넘긴다. 주소는 언제든 다시 받을 수 있으니, 이걸 못 적었다고
        사진이 안 보이면 안 된다. */
  function rememberThumbUrl(year, id, url, owner) {
    if (!deps.db || !url) return Promise.resolve();
    var u = {};
    u[metaPath(year, id, owner) + '/thumbUrl'] = url;
    return deps.db.ref().update(u).catch(function () { });
  }

  /* 적어 둔 주소가 못 쓰게 됐을 때(토큰을 새로 발급한 경우 등) 지운다 —
     안 지우면 다음에도 같은 죽은 주소를 그대로 쓴다. */
  function forgetThumbUrl(year, id, owner) {
    if (!deps.db) return Promise.resolve();
    var u = {};
    u[metaPath(year, id, owner) + '/thumbUrl'] = null;
    return deps.db.ref().update(u).catch(function () { });
  }

  function loadThumbsYear(year, owner) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(base(owner) + '/thumbs/' + year).once('value')
      .then(function (s) { return s.val() || {}; });
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
  function touchOwnerFor(name, uid, activeDb) {
    if (!activeDb || !uid) return Promise.resolve();
    var u = {};
    u[ownerPath(uid)] = { name: name || '', lastAt: Date.now() };
    return activeDb.ref().update(u);
  }

  function touchOwner(name) {
    return touchOwnerFor(name, deps.uid, deps.db);
  }

  function clearIdentity() {
    identityGeneration++;
    deps.uid = '';
    deps.isAdmin = false;
    deps.name = '';
  }

  /* ── 로그인한 사람 ──
     계정을 알려주고, **관리자인지는 서버가 아는 값(uid_roles)을 물어본다** —
     화면에서 짐작하지 않는다. 이 값으로 남의 사진을 볼 수 있는지가 갈리므로
     짐작하면 안 된다(어차피 규칙이 한 번 더 막지만 이중으로 잠근다).
     경로에 계정이 필요하므로 **이것이 끝난 뒤에 사진을 읽어야 한다.** */
  function signIn(uid, email, fallbackName) {
    var generation = ++identityGeneration;
    var signedUid = uid || '';
    var signedDb = deps.db;
    var signedName = fallbackName || email || '';
    deps.uid = signedUid;
    deps.isAdmin = false;
    deps.name = signedName;
    if (!deps.db || !deps.uid) return Promise.resolve({ isAdmin: false, name: deps.name });

    /* 권한 확인과 이름 찾기는 서로 의존하지 않는다. 예전에는 권한 응답을 받은
       뒤에야 이름을 찾기 시작해 휴대폰에서 서버 왕복을 두 번 연달아 기다렸다.
       두 요청을 함께 시작하면 느린 한 번의 왕복만 기다리면 된다. */
    var roleRead = signedDb.ref('uid_roles/' + signedUid + '/isAdmin').once('value')
      .then(function (s) { return s.val() === true; })
      .catch(function () { return false; });
    var nameRead = lookupName(email, signedDb).catch(function () { return ''; });

    return Promise.all([roleRead, nameRead]).then(function (read) {
      var signedAdmin = read[0];
      if (read[1]) signedName = read[1];

      /* 로그아웃·계정 전환 뒤 도착한 예전 응답은 화면도 owners 색인도 건드리지 않는다. */
      if (generation !== identityGeneration || deps.uid !== signedUid) {
        var stale = new Error('이미 바뀐 로그인 응답입니다');
        stale.code = 'auth/stale-session';
        throw stale;
      }
      deps.isAdmin = signedAdmin;
      deps.name = signedName;

      /* owners 색인은 다음 로그인 때 사람 목록을 빠르게 찾기 위한 보조 기록이다.
         이 쓰기가 느리거나 잠시 막혀도 현재 사용자의 로그인과 사진 열기를
         기다리게 해서는 안 된다. 시작만 하고 결과는 조용히 처리한다. */
      try {
        Promise.resolve(touchOwnerFor(signedName, signedUid, signedDb)).catch(function () {
          /* 명단 갱신 실패가 로그인을 막지 않는다 */
        });
      } catch (e) {
        /* 동기 예외도 보조 기록 실패일 뿐 로그인 실패로 바꾸지 않는다 */
      }

      return { isAdmin: signedAdmin, name: signedName, uid: signedUid };
    });
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

  function readRoster(path, activeDb) {
    return (activeDb || deps.db).ref(path).once('value').then(function (s) {
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

  function lookupName(email, activeDb) {
    var nameDb = activeDb || deps.db;
    if (!email || !nameDb) return Promise.resolve('');
    return readRoster('data/user_dir', nameDb).then(function (dir) {
      var got = pickFromRoster(dir, email);
      if (got) return got;
      /* 공개 명부에 없으면 관리자 명부를 본다 — 일반 직원은 규칙이 막으므로 조용히 넘어간다. */
      return readRoster('data/user_accounts', nameDb)
        .then(function (l) { return pickFromRoster(l, email); })
        .catch(function () { return ''; });
    }).catch(function () {
      return readRoster('data/user_accounts', nameDb)
        .then(function (l) { return pickFromRoster(l, email); })
        .catch(function () { return ''; });
    }).then(function (got) {
      return got || pickFromRoster(localRoster(), email);
    });
  }

  /* ⑤ 오늘 판독을 몇 번 불렀나 — 서버가 앱별로 세어 둔 것을 읽어 온다(대표 물음 2026-09-08).
     ⚠ 화면이 db.ref 를 «직접» 부르면 안 된다 — 상위 노드 set 같은 사고 길이 다시
       열린다(2026-07 실데이터 사고). 그래서 읽기도 이 층을 지난다.
     ⚠ 여기는 «읽기만» 한다. 셈을 올리는 것은 서버(관리자 SDK)뿐이고, 서버 규칙도
       이 자리를 아무도 못 쓰게(.write:false) 막았다 — 브라우저가 숫자를 부풀려
       「많이 썼다」로 꾸미지 못한다.
     ⚠ 담긴 것은 숫자뿐이다 — 사진·글·사람 이름은 한 글자도 없다. */
  function readTally(ymd) {
    if (!deps.db) return Promise.resolve(null);
    return deps.db.ref('ai_read_tally/' + ymd).once('value')
      .then(function (s) { return s.val() || null; });
  }

  function amAdmin() { return deps.isAdmin; }
  function myUid() { return deps.uid; }
  function myName() { return deps.name; }

  /* ── 전체 근로자 사진 (관리자 전용) ──
     대표 지시(2026-08-06): "관리자인 권형하는 전체 근로자의 사진을 모두 볼 수
     있게". 명단(owners)을 훑어 사람마다 listYear/listYears 를 그대로 부르고
     합친다 — 새 경로를 만들지 않고 이미 있는 걸 재사용한다.

     한 사람 읽기가 실패해도(권한·네트워크) 나머지는 보여야 한다 — 그래서
     사람별로 개별 catch 를 둔다. 한 명 때문에 전체가 안 보이면 안 된다.

     각 항목에 __ownerUid·__ownerName 을 붙인다 — 화면이 "누구 것인지" 표시하고,
     사진 본문을 받을 때(loadFull 등) 그 사람 자리로 정확히 찾아가는 데 쓴다. */
  function listYearAll(year) {
    if (!deps.isAdmin) return Promise.reject(new Error('관리자만 전체 근로자 사진을 볼 수 있습니다'));
    return listOwners().then(function (owners) {
      var uids = Object.keys(owners);
      if (uids.indexOf(deps.uid) < 0) uids.push(deps.uid);   // 나 자신도 포함한다
      return Promise.all(uids.map(function (uid) {
        var name = (owners[uid] && owners[uid].name) || (uid === deps.uid ? deps.name : uid);
        return listYear(year, uid).then(function (items) {
          var out = {};
          Object.keys(items).forEach(function (id) {
            out[id] = Object.assign({}, items[id], { __ownerUid: uid, __ownerName: name });
          });
          return out;
        }).catch(function () { return {}; });   // 이 사람만 실패 — 나머지는 그대로 보인다
      })).then(function (results) {
        var merged = {};
        results.forEach(function (r) { Object.assign(merged, r); });
        return merged;
      });
    });
  }

  function listYearsAll() {
    if (!deps.isAdmin) return Promise.reject(new Error('관리자만 전체 근로자 사진을 볼 수 있습니다'));
    return listOwners().then(function (owners) {
      var uids = Object.keys(owners);
      if (uids.indexOf(deps.uid) < 0) uids.push(deps.uid);
      return Promise.all(uids.map(function (uid) { return listYears(uid).catch(function () { return []; }); }));
    }).then(function (lists) {
      var set = {};
      lists.forEach(function (ys) { ys.forEach(function (y) { set[y] = 1; }); });
      set[String(new Date().getFullYear())] = 1;   // 올해는 늘 고를 수 있어야 한다
      return Object.keys(set).sort().reverse();
    });
  }

  /* ── 사람 명단 (대표 지시 2026-08-29 「직원끼리도 공유하게 해라」) ──
     담긴 것은 **이름과 마지막 올린 때**뿐이다 — 사진은 여기 없다(그것이 이 칸을 따로
     둔 까닭이다). 그래서 전 직원이 읽어도 열리는 것은 «누가 사진첩을 쓰는가»뿐이다.

     ⚠ 종전에는 관리자만 읽었다. 그 바람에 **직원은 공유할 사람을 고를 수가 없었다** —
       고르개가 비어 「고를 사람이 없습니다」만 떴다. 받는 것은 되는데 보내는 것이
       막혀 있어서, 「직원끼리 주고받는 것이 목적」이라는 설계와 어긋나 있었다.
     ⚠ **남의 사진이 열리는 것이 아니다.** 사진은 `u/{주인}` 이고 그 자물쇠는 그대로다 —
       주인과 총괄관리자만 본다. 여기서 얻는 것은 이름표뿐이다.
     ⚠ 「전체 근로자」로 훑는 길(listYearAll·listYearsAll·migrateToStorage)은 저마다
       제 isAdmin 을 그대로 들고 있다 — 이 문을 연다고 그 길이 열리지 않는다. */
  function listOwners() {
    if (!deps.db) return Promise.resolve({});
    return deps.db.ref(DB_ROOT + '/owners').once('value')
      .then(function (s) { return s.val() || {}; });
  }

  /* ── 고를 수 있는 «직원 전부» (건의 2026-09-07 김동현 노무사) ────────────────
     「공유자 목록에 김혜민 노무사님이 없습니다」 — 고장이 아니라 **명단이 틀린 자리**였다.
     종전 공유 대상은 위의 owners 였는데, 그 자리는 «사진첩을 한 번이라도 연 사람»만
     들어간다(사진을 올릴 때 이름표가 적힌다). 사진을 **받을** 사람이 왜 사진첩을
     먼저 열었어야 하나 — 열지 않았기 때문에 열어 줄 수가 없는, 뒤집힌 문이었다.

     ⚠ 화면 주석은 「골라 줄 uid 자체가 없다」고 적어 두었으나 **그 전제가 틀렸다.**
       로그인한 사람은 모두 uid_roles 에 있고(사번·재직 여부까지), 이름은 공개 명부
       data/user_dir 에 있다. 둘 다 이미 전 직원이 읽을 수 있는 자리다.
     ⚠ **재직자만** 낸다 — 퇴직한 사람에게 사진을 열어 주면 안 된다.
     ⚠ 한 번도 로그인한 적 없는 사람은 여전히 안 나온다(계정이 없다). 그때는 부르는
       쪽이 사번을 적어 사람에게 말해 준다 — 조용히 빠뜨리면 이 건의가 되풀이된다.
     ⚠ 한 사람이 계정을 여럿이면 **가장 최근 것**을 쓴다(uidBySid 와 같은 잣대).
     ⚠ 이름표만 얻는다 — 남의 사진이 열리는 것이 아니다. 사진 자물쇠(u/{주인})는 그대로다. */
  function normSid(sid) { return String(sid == null ? '' : sid).toLowerCase().replace(/-/g, ''); }

  function sidNameMap(list) {
    var arr = list, out = {};
    if (!Array.isArray(arr) && arr && typeof arr === 'object') {
      arr = Object.keys(arr).map(function (k) { return arr[k]; });
    }
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i];
      if (x && x.sid && x.name) out[normSid(x.sid)] = x.name;
    }
    return out;
  }

  function listStaff() {
    if (!deps.db) return Promise.resolve({});
    var roles = deps.db.ref('uid_roles').once('value')
      .then(function (s) { return s.val() || {}; })
      .catch(function () { return {}; });
    /* 이름을 못 읽어도 사람은 나와야 한다 — 이름 없이 사번으로라도 고를 수 있다 */
    var dir = readRoster('data/user_dir', deps.db).catch(function () { return null; });
    return Promise.all([roles, dir]).then(function (r) {
      var v = r[0] || {}, names = sidNameMap(r[1]), best = {}, out = {};
      Object.keys(v).forEach(function (uid) {
        var x = v[uid];
        if (!x || !x.sid) return;
        if (x.status && x.status !== 'active') return;      // 퇴직자는 뺀다
        var key = normSid(x.sid), t = x.updatedAt || 0;
        if (!best[key] || t > best[key].t) best[key] = { uid: uid, t: t, sid: x.sid };
      });
      Object.keys(best).forEach(function (key) {
        out[best[key].uid] = { sid: best[key].sid, name: names[key] || '' };
      });
      return out;
    }).catch(function () { return {}; });
  }

  /* 사진첩을 켜 둔 동안 다른 휴대폰에서 올리면 owners/{uid}.lastAt 이 함께 바뀐다.
     큰 사진 목록 전체를 감시하지 않고 이 **작은 색인**만 감시해 다시 읽을 때를 알려 준다.
     첫 value 는 구독 직후의 현재값이므로 넘긴다.

     ⚠ ★ **직원에게도 신호가 가야 한다** (직원 민원 2026-08-31 「사진이 안 올라간다」).
       예전에는 총괄관리자만 받았다. 그동안은 «창을 다시 볼 때마다 통째로 다시 읽는 길»이
       그 빈자리를 메우고 있었는데, 요금 때문에 그 길을 없애자(2026-08-31)
       직원에게는 **새로고침 길이 하나도 안 남아** 폰에서 올린 사진이 PC 화면에
       영영 안 나타났다 — 그것이 「안 올라간다」로 보였다.
     ⚠ 직원은 «제 자리»만 본다(owners/{내 uid}) — 남의 올림까지 알 까닭이 없고,
       그 작은 칸 하나는 값이 사실상 0 이다. 관리자는 「전체 근로자」 화면을 보므로
       모두의 자리를 본다.
     ⚠ 못 붙어도(권한·연결) 조용히 넘어간다 — 그때는 새로고침이 남는다. */
  function watchUploadIndex(changed) {
    if (!deps.db || typeof changed !== 'function') return function () {};
    var ref = deps.isAdmin ? deps.db.ref(DB_ROOT + '/owners')
                           : deps.db.ref(ownerPath(deps.uid));
    var first = true;
    function handler() {
      if (first) { first = false; return; }
      changed();
    }
    function failed() { /* 실시간 알림이 막혀도 새로고침은 남는다 */ }
    ref.on('value', handler, failed);
    return function () { ref.off('value', handler); };
  }
  function readOnce(path) {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(path).once('value').then(function (s) { return s.val(); });
  }

  /* 옛 자리(2026-08-03 전 사람별 분리 전 흔적) 경로 — 그 자리를 옮기고 지우는
     도구(migrateLegacy/dropLegacy)는 이사가 끝나 2026-08-15 지웠다. 이 함수만
     남기는 이유: listYear·loadFull·loadThumb 가 지금도 옛 자리를 물러날 곳으로
     함께 읽는다(그 자리는 이미 비어 있어 그냥 빈 값만 돌아온다 — 남겨 둬도
     비용이 들지 않는다). */
  function legacyRoot(kind) { return DB_ROOT + '/' + kind; }

  /* ── 실시간DB → 창고 이사 (2026-08-13, 비용 조사 뒤 실행) ──
     "비용을 최소화할 수 있는 방향 검토해 달라" — 8/1~8/11 실시간DB 내려받기가
     청구서(₩31,045)의 93%였다. 사진 본문을 창고로 옮기면 내려받기 값이
     실시간DB 요금의 8분의 1 안팎으로 떨어진다(기업정보함 이전 때 확인된 값).

     기업정보함이 먼저 검증한 순서를 그대로 따른다(pu-cards.html
     pucardsMovePhotosToStorage): **올리고 → 되읽어 확인하고 → 그제야
     실시간DB에서 지운다.** 순서를 바꾸면(먼저 지우고 나중에 올리면) 중간에
     끊길 때 사진을 통째로 잃는다.

     ⚠ 이미 옮긴 사진(meta.loc==='storage')은 건너뛴다 — **되풀이해도
       안전하다**(resumable). 한 번에 다 못 옮겨도, 다시 부르면 남은 것만 본다.
     ⚠ 한 장이 실패해도 나머지를 옮긴다 — migrateLegacy 와 같은 원칙이다.
     ⚠ 총괄 관리자만 — 전 직원의 모든 자리를 훑는 일이다. */
  function migrateToStorage(onStep) {
    if (!deps.isAdmin) {
      return Promise.reject(new Error('사진 옮기기는 총괄 관리자만 할 수 있습니다'));
    }
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    if (!deps.storage) return Promise.reject(new Error('파일 창고가 연결되지 않았습니다'));

    var out = { moved: 0, skipped: 0, failed: 0 };
    return listOwners().then(function (owners) {
      var uids = Object.keys(owners);
      if (uids.indexOf(deps.uid) < 0) uids.push(deps.uid);   // 나 자신도 포함한다
      return uids.reduce(function (chain, uid) {
        return chain.then(function () { return migrateOwnerToStorage(uid, out, onStep); });
      }, Promise.resolve());
    }).then(function () { return out; });
  }

  function migrateOwnerToStorage(uid, out, onStep) {
    return listYears(uid).then(function (years) {
      return years.reduce(function (chain, year) {
        return chain.then(function () { return migrateYearToStorage(uid, year, out, onStep); });
      }, Promise.resolve());
    }).catch(function (e) {
      console.warn('[사진 이사]', uid, e && e.message);   // 이 사람만 실패 — 나머지는 계속한다
    });
  }

  function migrateYearToStorage(uid, year, out, onStep) {
    return listYear(year, uid).then(function (items) {
      var ids = Object.keys(items);
      return ids.reduce(function (chain, id) {
        return chain.then(function () { return migrateOneToStorage(uid, year, id, items[id], out, onStep); });
      }, Promise.resolve());
    });
  }

  function migrateOneToStorage(uid, year, id, meta, out, onStep) {
    if (meta && meta.loc === 'storage') {
      out.skipped++;
      if (onStep) onStep(out);
      return Promise.resolve();
    }
    return Promise.all([loadFull(year, id, uid), loadThumb(year, id, uid)])
      .then(function (r) {
        var full = r[0], thumb = r[1];
        /* 본문이 없는 사진(2026-08-13 알림: "화면이 전혀 안 나오는 경우")은
           옮길 것이 없다 — 건너뛴다. 실패로 세면 관리자가 헛되이 다시 시도한다. */
        if (!full) { out.skipped++; if (onStep) onStep(out); return; }
        return putToBucket(filePath(year, id, 'full', uid), full)
          .then(function () { return thumb ? putToBucket(filePath(year, id, 'thumb', uid), thumb) : null; })
          /* 올리고 나서 실제로 되읽어 본다 — "올렸다고 답했는데 실은 못 올라간" 것을
             잡는다. 이것을 안 하고 지우면, 지운 뒤에야 못 올라간 것을 안다 —
             그때는 사진을 잃은 뒤다. */
          .then(function () { return fetchFromBucket(filePath(year, id, 'full', uid)); })
          .then(function (back) {
            if (!back) throw new Error('올린 사진을 다시 못 읽었습니다');
            var u = {};
            u[metaPath(year, id, uid) + '/loc'] = 'storage';
            u[blobPath(year, id, uid)] = null;
            u[thumbPath(year, id, uid)] = null;
            return deps.db.ref().update(u);
          })
          .then(function () { out.moved++; if (onStep) onStep(out); });
      })
      .catch(function (e) {
        console.warn('[사진 이사]', uid, year, id, e && e.message);
        out.failed++;
        if (onStep) onStep(out);
      });
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
  /* 요금제 한도로 막힌 것인가 — 권한 문제와 대처가 정반대라 반드시 갈라야 한다.
     파이어베이스가 주는 코드(storage/quota-exceeded)와 영어 문구 양쪽을 본다:
     코드만 보면 문구로만 오는 경우를 놓치고, 문구만 보면 말이 바뀌면 놓친다. */
  function isQuota(msg) {
    return /quota[ _-]?exceeded|quota for bucket|exceeded[^\n]*quota/i.test(String(msg || ''));
  }

  function probeMessage(result) {
    result = result || {};

    // 영어 오류문은 반드시 한국어 안내 뒤에 온다.
    var cause = result.message ? '\n원인: ' + result.message : '';

    // 설정 문제(init·ref)는 대표님이 콘솔에서 하실 일이 없다 — 안내가 같아야 한다.
    var setupHint =
      '\n창고 권한을 손봐도 풀리지 않는 문제입니다. 이 화면을 개발자에게 알려 주세요.' +
      '\n창고를 못 쓰면 실시간DB로 담습니다. 그때도 콘솔에서 권한을 한 번 열어 주셔야 합니다.';

    /* 요금제 문제는 어느 단계에서 걸리든 대처가 같다 — 단계별 안내보다 먼저 가른다.
       (기기·시점에 따라 init/ref/upload 어디서든 이 오류가 나온다) */
    if (!result.ok && isQuota(result.message)) {
      return '창고를 쓸 수 없습니다 — 파이어베이스 요금제 때문입니다.' +
        '\n권한·규칙 문제가 아닙니다. 콘솔에서 규칙을 고쳐도 풀리지 않습니다.' +
        '\n사진은 지금처럼 실시간DB에 잘 담기고 있습니다 — 그대로 쓰시면 됩니다.' +
        '\n창고가 꼭 필요해지면 그때 유료 요금제를 켜는 것을 의논하시면 됩니다.' +
        cause;
    }

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
        /* ⚠ 올리기가 막히는 이유가 **둘**이고 대처가 정반대다.
           요금제 한도(quota-exceeded)를 권한 문제로 안내하면 대표님이 콘솔에서
           규칙을 아무리 고쳐도 안 풀린다 — 실제로 그 안내가 나갔다(2026-08-06).
           신규 버킷은 유료 요금제(Blaze)에서만 열리는데 이 계정은 체험판이라
           **규칙과 무관하게** 막힌다. */
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
    /* 한글 원본 보관 (대표 지시 2026-09-05) — 사진첩이 올릴 때 쓴다 */
    putOriginal: putOriginal,
    origPath: origPath,
    photoYear: photoYear,
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
    setPrimaryKind: setPrimaryKind,
    setShare: setShare,
    addShare: addShare,
    uidBySid: uidBySid,
    listSharedToMe: listSharedToMe,
    watchSharedCount: watchSharedCount,
    fillSharedNames: fillSharedNames,
    sharedToPath: sharedToPath,
    saveNote: saveNote,
    setTakenAt: setTakenAt,
    replaceImage: replaceImage,
    listFolders: listFolders,
    addFolder: addFolder,
    renameFolder: renameFolder,
    deleteFolder: deleteFolder,
    setFolder: setFolder,
    moveFolderPhotos: moveFolderPhotos,
    listCustomKinds: listCustomKinds,
    /* 민감 서류 판정 — 화면도 같은 목록을 봐야 한다(경고 문구·자동 판독 제외 등).
       ⚠ 화면이 저마다 목록을 적으면 두 벌이 되어 한쪽만 고쳐진다. */
    SENSITIVE_KINDS: SENSITIVE_KINDS,
    isSensitiveRead: isSensitiveRead,
    listKindLabels: listKindLabels,
    listHiddenKinds: listHiddenKinds,
    renameFixedKind: renameFixedKind,
    setKindHidden: setKindHidden,
    getRetention: getRetention,
    setRetentionOwner: setRetentionOwner,
    setKeepMonths: setKeepMonths,
    markRetentionChecked: markRetentionChecked,
    retentionPath: retentionPath,
    addCustomKind: addCustomKind,
    renameCustomKind: renameCustomKind,
    deleteCustomKind: deleteCustomKind,
    setCustomKind: setCustomKind,
    setDocs: setDocs,
    deletePhoto: deletePhoto,
    listTrash: listTrash,
    restorePhoto: restorePhoto,
    purgeOldTrash: purgeOldTrash,
    purgeOne: purgeOne,
    listYears: listYears,
    markUsed: markUsed,
    usage: usage,
    getBackups: getBackups,
    markBackup: markBackup,
    listDelLog: listDelLog,
    TRASH_DAYS: TRASH_DAYS,
    signIn: signIn,
    clearIdentity: clearIdentity,
    amAdmin: amAdmin,
    myUid: myUid,
    myName: myName,
    readTally: readTally,      /* ⑤ 오늘 판독 셈 읽기 (2026-09-08) */
    lookupName: lookupName,
    touchOwner: touchOwner,
    listOwners: listOwners,
    listStaff: listStaff,
    watchUploadIndex: watchUploadIndex,
    listYearAll: listYearAll,
    listYearsAll: listYearsAll,
    migrateToStorage: migrateToStorage,
    listYear: listYear,
    loadThumb: loadThumb,
    loadThumbsYear: loadThumbsYear,
    thumbUrl: thumbUrl,
    markEdited: markEdited,
    rememberThumbUrl: rememberThumbUrl,
    forgetThumbUrl: forgetThumbUrl,
    loadFull: loadFull,
    /* 원본을 «까닭과 함께» — 화면에 사진을 띄우는 곳은 이것을 쓴다.
       빈손일 때 아무 말도 못 하면 사람은 「고장」인지 「원래 없는 것」인지 모른다. */
    loadFullDetail: loadFullDetail,
    loadText: loadText,
    init: init,
    getMode: getMode,
    setMode: setMode,
    probePath: probePath,
    probe: probe,
    probeMessage: probeMessage
  };
})(typeof window !== 'undefined' ? window : globalThis);
