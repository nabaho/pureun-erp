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

  /* 촬영 시각(ms) → 보관 연도.
     연도별로 나눠 담아야 평소에 올해 것만 불러온다(해마다 느려지는 것 방지).
     카톡으로 받은 사진은 촬영 시각이 지워져 있다 — 버리지 않고 'unknown'에 모은다. */
  function yearOf(ts) {
    var n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return 'unknown';
    return String(new Date(n).getFullYear());
  }

  /* 사진 한 장의 정보(올린 사람·회사·설명 등)가 들어가는 실시간DB 경로 */
  function metaPath(year, id) { return DB_ROOT + '/items/' + year + '/' + id; }

  /* 실시간DB 방식에서 사진 본문(base64)이 들어가는 경로.
     정보와 반드시 갈라 둔다 — 목록만 읽을 때 사진까지 내려받으면 앱이 느려진다. */
  function blobPath(year, id) { return DB_ROOT + '/blobs/' + year + '/' + id; }

  /* 파일 창고 방식의 파일 경로.
     kind: 'full' = 긴 변 1600px 축소본 / 'thumb' = 격자용 작은 미리보기 */
  function filePath(year, id, kind) {
    return BUCKET_ROOT + '/' + year + '/' + id + (kind === 'thumb' ? '_t' : '') + '.jpg';
  }

  /* ── 저장 방식 ──
     기본은 'rtdb'(실시간DB). 이미 명함첩·푸른카메라가 쓰고 있는 검증된 길이다.
     창고 점검을 통과한 뒤에만 'storage'(파일 창고)로 올린다. */
  var mode = 'rtdb';
  var deps = { db: null, storage: null };

  function init(o) {
    o = o || {};
    deps.db = o.db || null;
    deps.storage = o.storage || null;
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

  global.PuPhotoStore = {
    DB_ROOT: DB_ROOT,
    BUCKET_ROOT: BUCKET_ROOT,
    yearOf: yearOf,
    metaPath: metaPath,
    blobPath: blobPath,
    filePath: filePath,
    init: init,
    getMode: getMode,
    setMode: setMode,
    probePath: probePath,
    probe: probe
  };
})(typeof window !== 'undefined' ? window : globalThis);
