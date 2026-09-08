/* 지문·간편 로그인(패스키) — 서버 쪽 판단
   ─────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-15): "지문으로 로그인하게 해 달라. 도메인은 나바호로 바로."

   ★ 지문·얼굴은 «휴대폰 안에서만» 확인된다. 우리 서버로 오는 것은 지문이 아니라
     「이 기기가 맞다」는 서명뿐이다. 그래서 우리는 지문을 저장하지도, 볼 수도 없다.

   ★ 왜 서버가 필요한가
     그 서명이 진짜인지는 «우리 쪽에서» 따져야 한다. 휴대폰이 「맞다고 했어요」를
     그대로 믿으면, 누구나 그 말만 흉내내어 남의 계정으로 들어온다.

   ⚠ 지켜야 할 세 가지
     ① 한 번 쓴 도전값(challenge)은 다시 못 쓴다 — 남이 가로채 되쓰는 것을 막는다.
     ② 서명 횟수(counter)가 뒤로 가면 거절한다 — 복제된 기기를 걸러 낸다.
     ③ 도전값은 «서버가» 만들어 «서버에» 둔다. 화면이 준 값을 믿으면 아무 의미가 없다.

   ⚠ 이 파일은 로그인 문을 여는 곳이다 — 고칠 때는 위 세 가지가 그대로인지 반드시 본다. */

const functions = require("firebase-functions/v1");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase: getRawDatabase } = require("firebase-admin/database");
const OntologyServerWrite = require("./ontology-write-server");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

/* 패스키는 «주소에 묶인다». 여기를 바꾸면 이미 등록한 지문이 전부 무효가 되어
   전 직원이 다시 등록해야 한다 — 그래서 대표가 도메인을 먼저 정했다(나바호). */
/* 로그인은 기다림이 바로 느껴지는 자리라 가까운 곳(서울)에 둔다.
   ⚠ 리전을 바꾸면 주소가 바뀐다 — js/pu-passkey.js 의 BASE 도 함께 고쳐야 한다. */
const REGION = "asia-northeast3";
const RP_ID = "nabaho.github.io";
const RP_NAME = "푸른통합시스템";
const ORIGIN = "https://nabaho.github.io";

const CHALLENGE_TTL_MS = 3 * 60 * 1000;   // 3분 — 넉넉하되 오래 굴러다니지 않게
const MAX_DEVICES = 5;                    // 한 사람이 등록할 수 있는 기기 수

const DB_CRED = "passkeys/creds";         // {sid}/{credId} = 등록된 기기
const DB_CHAL = "passkeys/challenges";    // {키} = 아직 안 쓴 도전값

function db() { return OntologyServerWrite.wrapDatabase(getRawDatabase(), { program: "passkey" }); }

function setCors(req, res) {
  const origin = String((req && req.headers && req.headers.origin) || "");
  if (origin === ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

/* Firebase 경로에 못 쓰는 글자를 바꾼다. credId 는 base64url 이라 대개 안전하지만,
   바깥에서 온 값이므로 그대로 경로에 넣지 않는다. */
function pathSafe(s) {
  return String(s || "").replace(/[.#$/[\]]/g, "_").slice(0, 200);
}
function normSid(s) {
  return String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

/* 도전값을 서버에 둔다. 열쇠는 «누구 것인지 + 무엇을 하려는지» 로 나눈다 —
   등록용 도전값으로 로그인을 통과시키면 안 된다. */
async function putChallenge(kind, who, challenge) {
  const key = pathSafe(kind + ":" + who);
  await db().ref(DB_CHAL + "/" + key).set({ challenge, at: Date.now() });
}
/* 꺼내면서 «지운다» — 한 번 쓴 값은 다시 못 쓴다(재사용 공격 차단). */
async function takeChallenge(kind, who) {
  const key = pathSafe(kind + ":" + who);
  const ref = db().ref(DB_CHAL + "/" + key);
  const snap = await ref.once("value");
  const v = snap.val();
  await ref.remove();
  if (!v || !v.challenge) return null;
  if (Date.now() - (v.at || 0) > CHALLENGE_TTL_MS) return null;   // 너무 오래된 것도 거절
  return v.challenge;
}

/* 로그인한 사람인지 확인한다 — 등록은 «이미 비밀번호로 들어온 사람» 만 할 수 있다.
   그래야 남이 내 계정에 자기 지문을 붙이지 못한다. */
async function requireUser(req) {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return await getAuth().verifyIdToken(m[1]); } catch (e) { return null; }
}

async function listCreds(sid) {
  const snap = await db().ref(DB_CRED + "/" + pathSafe(sid)).once("value");
  const v = snap.val() || {};
  return Object.keys(v).map((k) => Object.assign({ _key: k }, v[k]));
}

function bad(res, code, msg) { res.status(code).json({ ok: false, error: msg }); }

/* ── ① 등록 시작 — 휴대폰에 보여 줄 「무엇에 서명할지」를 만든다 ───────────── */
exports.passkeyRegisterStart = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return bad(res, 405, "POST 만 받습니다");
  const user = await requireUser(req);
  if (!user) return bad(res, 401, "먼저 아이디·비밀번호로 로그인해 주세요");

  const sid = normSid((req.body && req.body.sid) || "");
  if (!sid) return bad(res, 400, "사번이 없습니다");

  const have = await listCreds(sid);
  if (have.length >= MAX_DEVICES) {
    return bad(res, 400, "등록할 수 있는 기기는 " + MAX_DEVICES + "대까지입니다. 쓰지 않는 기기를 먼저 지워 주세요");
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: sid,
    userDisplayName: String((req.body && req.body.name) || sid),
    attestationType: "none",                       // 기기 제조사 증명서는 받지 않는다 — 필요 없고, 개인정보만 는다
    // 이미 등록한 기기를 또 등록하지 않게 알려 준다
    excludeCredentials: have.map((c) => ({ id: c.credId })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",                // ★ 지문·얼굴·PIN 중 «무엇이든» 반드시 본인 확인을 거치게
    },
  });
  await putChallenge("reg", sid, options.challenge);
  res.json({ ok: true, options });
});

/* ── ② 등록 마무리 — 휴대폰이 보낸 서명을 «우리가» 따져 본다 ───────────────── */
exports.passkeyRegisterFinish = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return bad(res, 405, "POST 만 받습니다");
  const user = await requireUser(req);
  if (!user) return bad(res, 401, "먼저 아이디·비밀번호로 로그인해 주세요");

  const sid = normSid((req.body && req.body.sid) || "");
  const resp = req.body && req.body.response;
  if (!sid || !resp) return bad(res, 400, "보낸 값이 모자랍니다");

  const expected = await takeChallenge("reg", sid);
  if (!expected) return bad(res, 400, "등록 시간이 지났습니다. 다시 시도해 주세요");

  let v;
  try {
    v = await verifyRegistrationResponse({
      response: resp,
      expectedChallenge: expected,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (e) {
    return bad(res, 400, "기기 확인에 실패했습니다: " + (e && e.message ? e.message : "알 수 없음"));
  }
  if (!v.verified || !v.registrationInfo) return bad(res, 400, "기기 확인에 실패했습니다");

  const info = v.registrationInfo;
  const cred = info.credential || {};
  const credId = String(cred.id || "");
  if (!credId) return bad(res, 400, "기기 번호를 읽지 못했습니다");

  await db().ref(DB_CRED + "/" + pathSafe(sid) + "/" + pathSafe(credId)).set({
    credId,
    publicKey: Buffer.from(cred.publicKey).toString("base64url"),
    counter: cred.counter || 0,
    uid: user.uid,                                  // 이 기기가 어느 계정 것인지 못 박는다
    label: String((req.body && req.body.label) || "휴대폰").slice(0, 40),
    at: Date.now(),
  });
  res.json({ ok: true, credId });
});

/* ── ③ 로그인 시작 ─────────────────────────────────────────────────────── */
exports.passkeyLoginStart = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return bad(res, 405, "POST 만 받습니다");

  const sid = normSid((req.body && req.body.sid) || "");
  if (!sid) return bad(res, 400, "사번을 입력해 주세요");
  const have = await listCreds(sid);
  /* ⚠ 「등록된 기기가 없다」와 「그런 사번이 없다」를 구분해 말하지 않는다 —
     구분해 주면 남의 사번이 있는지 없는지를 알아내는 데 쓰인다. */
  if (!have.length) return bad(res, 400, "이 사번으로 등록된 기기가 없습니다");

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: have.map((c) => ({ id: c.credId })),
    userVerification: "required",
  });
  await putChallenge("login", sid, options.challenge);
  res.json({ ok: true, options });
});

/* ── ④ 로그인 마무리 — 통과하면 «그 사람 계정» 으로 들어갈 표를 준다 ───────── */
exports.passkeyLoginFinish = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return bad(res, 405, "POST 만 받습니다");

  const sid = normSid((req.body && req.body.sid) || "");
  const resp = req.body && req.body.response;
  if (!sid || !resp) return bad(res, 400, "보낸 값이 모자랍니다");

  const expected = await takeChallenge("login", sid);
  if (!expected) return bad(res, 400, "시간이 지났습니다. 다시 시도해 주세요");

  const have = await listCreds(sid);
  const hit = have.find((c) => c.credId === String(resp.id || ""));
  if (!hit) return bad(res, 400, "등록되지 않은 기기입니다");

  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: resp,
      expectedChallenge: expected,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: hit.credId,
        publicKey: Buffer.from(hit.publicKey, "base64url"),
        counter: hit.counter || 0,
      },
    });
  } catch (e) {
    return bad(res, 401, "확인에 실패했습니다: " + (e && e.message ? e.message : "알 수 없음"));
  }
  if (!v.verified) return bad(res, 401, "확인에 실패했습니다");

  /* ★ 서명 횟수는 «앞으로만» 간다. 뒤로 갔다면 복제된 기기다 — 막고 알린다.
     (0 을 계속 보내는 기기도 있어서, 0 이면 이 검사를 건너뛴다 — 규격이 그렇게 허용한다) */
  const next = (v.authenticationInfo && v.authenticationInfo.newCounter) || 0;
  if (next > 0 && next <= (hit.counter || 0)) {
    return bad(res, 401, "기기 확인 값이 이상합니다. 관리자에게 알려 주세요");
  }
  await db().ref(DB_CRED + "/" + pathSafe(sid) + "/" + hit._key + "/counter").set(next);
  await db().ref(DB_CRED + "/" + pathSafe(sid) + "/" + hit._key + "/lastAt").set(Date.now());

  /* ★ passkey:true 를 표에 적어 둔다. 데이터베이스 규칙이 「비밀번호로 들어온 사람」만
     받도록 되어 있으므로, 규칙에 이 조건을 «더해» 주어야 자료가 열린다.
     (더하는 것이라 기존 비밀번호 로그인은 그대로 — 아무도 막히지 않는다) */
  const token = await getAuth().createCustomToken(hit.uid, { passkey: true, sid });
  res.json({ ok: true, token });
});

/* ── ⑤ 등록한 기기 목록·삭제 (잃어버렸을 때) ──────────────────────────────── */
exports.passkeyDevices = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return bad(res, 405, "POST 만 받습니다");
  const user = await requireUser(req);
  if (!user) return bad(res, 401, "로그인이 필요합니다");

  const sid = normSid((req.body && req.body.sid) || "");
  if (!sid) return bad(res, 400, "사번이 없습니다");
  const have = await listCreds(sid);
  /* ★ 남의 기기 목록을 보거나 지우지 못하게 — 이 사번의 기기가 «내 계정» 것인지 본다.
     (등록된 기기가 아직 없으면 볼 것도 없으므로 빈 목록을 돌려준다) */
  if (have.length && !have.every((c) => c.uid === user.uid)) return bad(res, 403, "다른 사람의 기기입니다");

  const del = String((req.body && req.body.remove) || "");
  if (del) {
    const tgt = have.find((c) => c.credId === del);
    if (!tgt) return bad(res, 404, "그 기기를 찾을 수 없습니다");
    await db().ref(DB_CRED + "/" + pathSafe(sid) + "/" + tgt._key).remove();
    return res.json({ ok: true, removed: del });
  }
  res.json({
    ok: true,
    devices: have.map((c) => ({ credId: c.credId, label: c.label, at: c.at, lastAt: c.lastAt || 0 })),
  });
});

// 검사에서 쓰기 위해 내놓는다 (순수 함수만)
exports._internal = { pathSafe, normSid, RP_ID, ORIGIN, MAX_DEVICES, CHALLENGE_TTL_MS };
