/* 민감 서류 보기 대리인 — 값 다루는 부분만 (네트워크·창고는 index.js 가 붙인다).
   그래야 검사에서 가짜 창고·가짜 DB 를 끼워 **실제로 돌려** 볼 수 있다.

   ⚠ **왜 만드나** (사진첩 보안 3건 계획 2단계, 대표 지시 2026-08-17):
     사진 정보에 창고 **토큰 주소**가 그대로 적혀 있다.

       만료      : 없다
       로그인    : 필요 없다
       공유를 풀면: **그래도 열린다** — 주소를 이미 받았다

     계약서·근태표에는 주민번호가 있다. 그 주소가 한 번 밖으로 나가면
     되돌릴 방법이 없다(토큰을 새로 발급하는 콘솔 작업 말고는).

   ⚠ **토큰 주소를 전면 폐지하지 않는다.** 창고 규칙은 실시간DB(`uid_roles`)를
     못 읽어 「자기 사진만」으로 잠겨 있다. 그래서 관리자·공유받은 사람의 창고
     요청이 403 이 됐고(2026-08-17: 남의 회의사진 46장 전부 회색, 403 832건),
     그것을 푸는 방법으로 토큰 주소를 택했다. 되돌리면 그 사태가 되풀이된다.
     **민감한 것만 골라낸다.**

   ── 정한 것 셋 (계획서에 없던 갈림길) ────────────────────────────────

   ① **민감 여부는 「판독 뒤」에 정해진다.**
      올릴 때는 서류인지(`kind:'doc'`)까지만 안다. 계약서인지는 판독이 정한다
      (`read.kind`). 그래서 계획서의 「올릴 때 주소를 안 적는다」로는 못 막는다.
      → **판독 결과를 쓸 때** 민감하면 그 자리에서 `fullUrl` 을 지운다.
        이미 적혀 있는 옛 사진은 훑어 지우는 도구(scan/clear)로 따로 치운다.

   ② **서명 주소(signed URL)가 아니라 서버가 «내용»을 넘겨준다.**
      서명 주소는 서비스 계정에 `iam.serviceAccountTokenCreator` 를 붙여야 돌고,
      그건 대표님 콘솔 작업이라 **또 사람을 기다리는 일**이 된다.
      민감 서류는 계약서 18장·근태표 10장 정도이고 보는 일도 드물다 —
      서버가 내용을 넘겨도 요금은 사실상 0 이다. 기다릴 것이 없는 쪽을 골랐다.

   ③ **미리보기(240px)는 그대로 둔다.**
      막는 것은 **원본**(`fullUrl`)이다. 격자 미리보기는 240px 로 글씨를 못 읽고,
      그것까지 서버로 돌리면 격자가 통째로 느려진다(2026-08-15 에 주소를 쓰게 바꿔
      고친 바로 그 느림이다). 읽히는 것을 지키고 안 읽히는 것은 놔둔다. */
"use strict";

/* 민감한 서류 종류 — **여기 한 곳**에만 적는다.
   ⚠ 화면(js/pu-photo-store.js)도 같은 목록을 본다. 두 벌이 되면 한쪽만 고쳐진다.
   · contract  계약서   — 근로계약서에 주민번호가 있다
   · timesheet 근태표   — 이름·주민번호가 함께 있다
   · payslip   급여서류 — 사진첩에 두지 않기로 한 것이지만(「지워 주세요」),
                          남아 있는 동안은 가장 민감하다 */
const SENSITIVE_KINDS = { contract: 1, timesheet: 1, payslip: 1 };

function isSensitiveKind(kind) {
  return !!SENSITIVE_KINDS[String(kind || "")];
}
/* 사진 정보 하나가 민감한가. 판독 전(read 없음)이면 **아니다** —
   ⚠ 판독 전에 민감으로 보면 회의사진 수백 장이 죄다 서버를 거치게 된다. */
function isSensitiveItem(item) {
  return !!(item && item.read && isSensitiveKind(item.read.kind));
}

/* 창고 파일 경로 — js/pu-photo-store.js 의 filePath 와 **반드시 같아야 한다**.
   어긋나면 서버가 없는 파일을 찾아 「원본이 없습니다」가 된다. */
const BUCKET_ROOT = "pu_photos";
function storagePath(owner, year, id, kind) {
  return BUCKET_ROOT + "/u/" + owner + "/" + (kind === "thumb" ? "thumbs" : "blobs") +
    "/" + year + "/" + id + ".jpg";
}

/* 요청이 말이 되는지. 못 알아보면 창고를 뒤지기 전에 돌려보낸다.
   ⚠ 경로에 쓰이는 값이라 **`/` 와 `..` 를 막는다** — 안 막으면 남의 자리·바깥
     자리를 가리키게 만들 수 있다(경로 타고 오르기). */
function badPart(v) {
  var s = String(v == null ? "" : v);
  return !s || s.length > 128 || /[/.\\#$[\]]/.test(s);
}
function validate(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "요청이 비었습니다" };
  if (badPart(body.owner)) return { ok: false, error: "사진 주인을 알 수 없습니다" };
  if (badPart(body.id)) return { ok: false, error: "사진 번호가 올바르지 않습니다" };
  var year = String(body.year == null ? "" : body.year);
  if (!/^\d{4}$/.test(year)) return { ok: false, error: "연도가 올바르지 않습니다" };
  return { ok: true, owner: String(body.owner), id: String(body.id), year: year };
}

/* 볼 수 있는 사람인가 — **실시간DB 규칙과 같은 기준**이다.
     · 주인          — 자기 사진
     · 총괄관리자    — 남의 사진도 본다
     · 공유받은 사람 — 그 **한 장만**(items/…/shareWith/{나})
   ⚠ 규칙과 다른 기준을 쓰면, 화면에서는 보이는데 여기서 막히거나(고장으로 보인다)
     여기서만 열려(구멍) 둘 중 하나가 된다. */
function canSee(o) {
  var viewer = String((o && o.viewerUid) || "");
  if (!viewer) return { ok: false, why: "로그인을 확인해 주세요", status: 401 };
  if (viewer === String((o && o.owner) || "")) return { ok: true, as: "owner" };
  if (o && o.role && o.role.isAdmin === true) return { ok: true, as: "admin" };
  var share = (o && o.item && o.item.shareWith) || {};
  if (share[viewer] === true) return { ok: true, as: "shared" };
  return { ok: false, why: "이 사진을 볼 권한이 없습니다", status: 403 };
}

/* 민감하지 않은 사진은 **여기서 다루지 않는다** — 적힌 토큰 주소로 그냥 보면 된다.
   서버를 거치게 하면 격자가 느려지고 요금만 는다.
   ⚠ 다만 정보가 아예 없으면(지워졌다) 404 다. */
function decide(item) {
  if (!item) return { ok: false, why: "사진 정보를 찾을 수 없습니다 — 지워졌을 수 있습니다", status: 404 };
  if (!isSensitiveItem(item)) {
    return { ok: false, why: "민감 서류가 아닙니다 — 적힌 주소로 보십시오", status: 400 };
  }
  return { ok: true };
}

/* ── 옛 사진 훑기 (계획서 Task4 Step3) ──
   이미 `fullUrl` 이 적힌 민감 서류를 찾는다.
   ⚠ **세어 대표님께 알린 다음에 지운다.** 지우면 그 사진들은 반드시 서버를
     거쳐야 보이므로, 함수가 죽으면 안 보인다. 몇 장인지 모르고 지우면 안 된다. */
function sweep(tree) {
  var hits = [];
  var owners = (tree && tree.u) || {};
  Object.keys(owners).forEach(function (uid) {
    var years = (owners[uid] && owners[uid].items) || {};
    Object.keys(years).forEach(function (year) {
      var items = years[year] || {};
      Object.keys(items).forEach(function (id) {
        var it = items[id];
        if (!isSensitiveItem(it)) return;
        if (typeof it.fullUrl !== "string" || !it.fullUrl) return;
        hits.push({ owner: uid, year: String(year), id: id, kind: it.read.kind });
      });
    });
  });
  return hits;
}
/* 지울 자리들 — `fullUrl` 만 지운다.
   ⚠ thumbUrl 은 남긴다(위 ③). 함께 지우면 격자가 통째로 느려진다. */
function clearPaths(hits, dbRoot) {
  var u = {};
  hits.forEach(function (h) {
    u[dbRoot + "/u/" + h.owner + "/items/" + h.year + "/" + h.id + "/fullUrl"] = null;
  });
  return u;
}

module.exports = {
  SENSITIVE_KINDS, BUCKET_ROOT,
  isSensitiveKind, isSensitiveItem,
  storagePath, badPart, validate, canSee, decide, sweep, clearPaths
};
