// 푸른노무법인 — 급여명세서 메일 발송 함수
// Resend API 키는 functions/.env 의 RESEND_API_KEY 에서 읽습니다 (코드에 직접 넣지 않음).

const functions = require("firebase-functions/v1");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
const crypto = require("crypto");   // 내려받기 토큰 발급용 (downloadUrl)
const { Resend } = require("resend");
const {
  REPO,
  cleanText,
  buildIssue,
  validateExecute,
  normalizeImageIndexes,
  createRollbackCode,
  hashRollbackCode,
  safeGithubNumber,
  githubRequest,
} = require("./dev-automation");
const { homepageUrl } = require("./homepage-fetch");
const HanaMessage = require("./hana-message");

if (!getApps().length) initializeApp();

const RESEND_KEY = process.env.RESEND_API_KEY || "";

// PoC 설정 — 도메인 인증 전까지는 Resend 테스트 발신주소를 쓰고,
// 테스트 발신은 Resend 계정 주소(본인 메일)로만 발송됩니다.
const FROM = "푸른노무법인 <payroll@fairrunlabor.com>";
const TEST_TO = "babylawyer11111@gmail.com";

// 발송 창구는 우리 포털에서만 연다. 예전에는 "*" 라서 주소만 알면
// 전 세계 누구나 푸른노무법인 이름으로 메일을 보낼 수 있었다.
const MAIL_ORIGIN = "https://nabaho.github.io";

function setCors(req, res) {
  const origin = String((req && req.headers && req.headers.origin) || "");
  if (origin === MAIL_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  // Authorization 을 허용해야 브라우저가 토큰을 붙인 요청을 보낼 수 있다.
  res.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.set("Cache-Control", "no-store");
}

// 메일 발송은 로그인한 직원이면 할 수 있다.
// 총괄관리자만으로 묶지 않는 이유: 급여명세서·사용촉진 통보는 담당 직원이 보낸다.
async function requireStaff(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (!match) {
    const error = new Error("로그인 후 이용해 주세요.");
    error.status = 401;
    throw error;
  }
  const decoded = await getAuth().verifyIdToken(match[1], true);
  if (decoded.firebase && decoded.firebase.sign_in_provider !== "password") {
    const error = new Error("이메일 로그인 계정만 메일을 보낼 수 있습니다.");
    error.status = 403;
    throw error;
  }
  return decoded;
}

exports.sendPayslip = functions.https.onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  // ★ 누가 보내는지 확인한다. 이 검사가 없으면 우리 도메인이 공개 발송기가 된다.
  let sender;
  try {
    sender = await requireStaff(req);
  } catch (e) {
    res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
    return;
  }

  // 키 미설정 시 친절한 안내 (Resend의 난해한 에러 대신)
  if (!RESEND_KEY) {
    res.status(500).send(
      "Resend API 키가 설정되지 않았습니다.\n" +
      "functions/.env 파일을 열어 RESEND_API_KEY= 뒤에 본인 키(re_로 시작)를 붙여넣고 다시 배포하세요."
    );
    return;
  }

  const resend = new Resend(RESEND_KEY);

  // 입력: POST 본문이 있으면 사용, 없으면(브라우저로 URL 접속 = 테스트) 샘플 발송
  const b = (req.body && typeof req.body === "object") ? req.body : {};
  const to = b.to || TEST_TO;
  const name = b.name || "테스트";
  const ym = b.ym || "테스트";
  const subject = b.subject || ("[푸른노무법인] " + ym + " 급여명세서 — " + name);
  const html = b.html || (
    "<div style=\"font-family:sans-serif;font-size:14px;line-height:1.7;color:#1e293b\">" +
    "<p>" + name + " 님 안녕하세요.</p>" +
    "<p>푸른노무법인입니다. (" + ym + " 급여명세서 발송 <b>테스트</b>)</p>" +
    "<p>이 메일이 보이면 발송 기능이 정상 작동하는 것입니다. ✅</p>" +
    "<hr style=\"border:none;border-top:1px solid #e5e7eb\">" +
    "<p style=\"color:#94a3b8;font-size:12px\">푸른노무법인 자동 발송 테스트</p>" +
    "</div>"
  );

  try {
    // 첨부파일(PDF 등): ERP가 base64로 보내면 Buffer로 변환해 첨부
    const atts = Array.isArray(b.attachments)
      ? b.attachments.map(function (a) { return { filename: a.filename, content: Buffer.from(a.content, "base64") }; })
      : undefined;
    const payload = { from: FROM, to: to, subject: subject, html: html };
    if (atts && atts.length) payload.attachments = atts;
    const r = await resend.emails.send(payload);
    if (r && r.error) {
      res.status(500).json({ ok: false, error: r.error });
      return;
    }
    // 보낸 사람을 함께 돌려준다 — 화면에서 발송 기록을 남길 때 쓴다.
    res.status(200).json({ ok: true, id: (r && r.data && r.data.id) || null, to: to,
                           by: (sender && sender.email) || "" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

const PORTAL_ORIGIN = "https://nabaho.github.io";

function setAutomationCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin === PORTAL_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Automation-Bridge");
  res.set("Cache-Control", "no-store");
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && require("node:crypto").timingSafeEqual(a, b);
}

async function requirePrimaryAdmin(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (!match) {
    const error = new Error("로그인 확인 정보가 없습니다.");
    error.status = 401;
    throw error;
  }
  const decoded = await getAuth().verifyIdToken(match[1], true);
  const roleSnapshot = await getDatabase().ref(`uid_roles/${decoded.uid}`).once("value");
  const role = roleSnapshot.val() || {};
  if (role.isAdmin !== true) {
    const error = new Error("총괄관리자만 자동개발을 실행할 수 있습니다.");
    error.status = 403;
    throw error;
  }
  return decoded;
}

function suggestionRef(id) {
  const safeId = cleanText(id, 120).replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeId) {
    const error = new Error("건의 ID가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
  return getDatabase().ref(`data/suggestions/${safeId}`);
}

async function getSuggestion(id) {
  const ref = suggestionRef(id);
  const snapshot = await ref.once("value");
  if (!snapshot.exists()) {
    const error = new Error("건의를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }
  return { ref, value: snapshot.val() || {} };
}

async function ensureAutomationLabels() {
  const labels = [
    ["ai-ready", "5319e7", "Representative-approved AI development"],
    ["risk-low", "0e8a16", "Low-risk automatic development"],
    ["risk-high", "d93f0b", "High-risk change requiring manual deployment approval"],
  ];
  for (const [name, color, description] of labels) {
    try {
      await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/labels`, {
        method: "POST",
        body: { name, color, description },
      });
    } catch (error) {
      if (!/^GitHub 422:/.test(String(error && error.message || error))) throw error;
    }
  }
}

async function bridgeTask(req) {
  if (!timingSafeEqual(req.headers["x-automation-bridge"], process.env.AUTOMATION_BRIDGE_KEY)) {
    const error = new Error("자동화 연결 인증에 실패했습니다.");
    error.status = 403;
    throw error;
  }
  const issueNumber = safeGithubNumber(req.body && req.body.issueNumber);
  const result = await getSuggestion(req.body && req.body.suggestionId);
  const automation = result.value.automation || {};
  if (Number(automation.issueNumber) !== issueNumber) {
    const error = new Error("건의와 GitHub 이슈가 일치하지 않습니다.");
    error.status = 403;
    throw error;
  }
  const images = Array.isArray(result.value.images) ? result.value.images : [];
  const imageIndexes = normalizeImageIndexes(automation.imageIndexes, images.length);
  return {
    suggestionId: cleanText(req.body.suggestionId, 120),
    issueNumber,
    title: cleanText(result.value.title, 140),
    content: cleanText(result.value.content, 6000),
    instruction: cleanText(automation.instruction, 6000),
    risk: cleanText(automation.risk, 20),
    autoDeploy: automation.autoDeploy === true,
    images: imageIndexes.map((index) => images[index]).filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(String(image || ""))),
  };
}

async function createDevelopmentIssue(decoded, body) {
  validateExecute(body);
  const result = await getSuggestion(body.suggestionId);
  if (result.value.automation && result.value.automation.issueNumber) {
    const error = new Error("이미 자동개발이 실행된 건의입니다.");
    error.status = 409;
    throw error;
  }
  const images = Array.isArray(result.value.images) ? result.value.images : [];
  const imageIndexes = normalizeImageIndexes(body.imageIndexes, images.length);
  const draft = buildIssue({
    suggestionId: body.suggestionId,
    title: result.value.title,
    content: result.value.content,
    instruction: body.instruction,
    risk: body.risk,
    autoDeploy: body.autoDeploy === true,
    imageIndexes,
    imageCount: images.length,
  });
  await ensureAutomationLabels();
  const issue = await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/issues`, {
    method: "POST",
    body: { title: draft.title, body: draft.body, labels: draft.labels },
  });
  const record = {
    status: "queued",
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    instruction: cleanText(body.instruction, 6000),
    risk: draft.level,
    autoDeploy: draft.autoDeploy,
    imageIndexes,
    requestedAt: Date.now(),
    requestedBy: decoded.uid,
  };
  await result.ref.child("automation").set(record);
  return record;
}

async function findPullRequest(issueNumber, rollback) {
  const comments = await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/issues/${issueNumber}/comments?per_page=100`);
  let prNumber = 0;
  for (const comment of Array.isArray(comments) ? comments : []) {
    const match = (rollback ? /<!--\s*pu-autodev-rollback-pr:(\d+)\s*-->/ : /<!--\s*pu-autodev-pr:(\d+)\s*-->/).exec(String(comment.body || ""));
    if (match) prNumber = Number(match[1]);
  }
  return prNumber;
}

async function deploymentStatus(sha) {
  const query = encodeURIComponent(sha);
  const runs = await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/actions/runs?head_sha=${query}&per_page=30`);
  const deployment = (runs.workflow_runs || []).find((run) => run.name === "Test and Deploy Pages");
  if (!deployment || deployment.status !== "completed") return { status: "pending" };
  return { status: deployment.conclusion === "success" ? "success" : "failed", url: deployment.html_url, updatedAt: deployment.updated_at };
}

async function refreshStatus(body) {
  const result = await getSuggestion(body.suggestionId);
  const automation = result.value.automation || {};
  const issueNumber = safeGithubNumber(automation.issueNumber);
  const update = { checkedAt: Date.now() };
  if (automation.status === "rollback_requested") {
    const rollbackPrNumber = Number(automation.rollbackPrNumber) || await findPullRequest(issueNumber, true);
    if (rollbackPrNumber) {
      const rollbackPr = await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/pulls/${rollbackPrNumber}`);
      update.rollbackPrNumber = rollbackPrNumber;
      update.rollbackPrUrl = rollbackPr.html_url;
      if (rollbackPr.merged && rollbackPr.merge_commit_sha) {
        const deployment = await deploymentStatus(rollbackPr.merge_commit_sha);
        update.status = deployment.status === "success" ? "rolled_back" : (deployment.status === "failed" ? "failed" : "rollback_requested");
        update.rollbackDeploymentUrl = deployment.url || null;
        if (deployment.status === "success") update.rolledBackAt = Date.parse(deployment.updatedAt) || Date.now();
      }
    }
    await result.ref.child("automation").update(update);
    return Object.assign({}, automation, update);
  }
  let prNumber = Number(automation.prNumber) || await findPullRequest(issueNumber, false);
  if (prNumber) {
    const pr = await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/pulls/${prNumber}`);
    update.prNumber = prNumber;
    update.prUrl = pr.html_url;
    update.status = pr.merged ? "deploying" : (pr.state === "open" ? "pr_ready" : "closed");
    if (pr.merged && pr.merge_commit_sha) {
      update.mergeCommitSha = pr.merge_commit_sha;
      update.mergedAt = Date.parse(pr.merged_at) || Date.now();
      const deployment = await deploymentStatus(pr.merge_commit_sha);
      if (deployment.status !== "pending") update.status = deployment.status === "success" ? "deployed" : "failed";
      update.deploymentUrl = deployment.url || null;
      if (deployment.status === "success") update.deployedAt = Date.parse(deployment.updatedAt) || Date.now();
    }
  } else {
    const issue = await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/issues/${issueNumber}`);
    const labels = (issue.labels || []).map((label) => typeof label === "string" ? label : label.name);
    update.status = labels.includes("ai-failed") ? "failed" : (labels.includes("ai-coding") ? "coding" : "queued");
  }
  await result.ref.child("automation").update(update);
  return Object.assign({}, automation, update);
}

async function approveDeployment(body) {
  const result = await getSuggestion(body.suggestionId);
  const automation = result.value.automation || {};
  const prNumber = safeGithubNumber(automation.prNumber || body.prNumber);
  await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/dispatches`, {
    method: "POST",
    body: { event_type: "approve-deploy", client_payload: { pr_number: prNumber, suggestion_id: cleanText(body.suggestionId, 120) } },
  });
  await result.ref.child("automation").update({ status: "deploy_approved", deployApprovedAt: Date.now() });
  return { status: "deploy_approved", prNumber };
}

async function prepareRollback(body) {
  const result = await getSuggestion(body.suggestionId);
  const automation = result.value.automation || {};
  if (!automation.mergeCommitSha) throw new Error("복귀할 배포 버전이 아직 확인되지 않았습니다.");
  const code = createRollbackCode();
  const salt = require("node:crypto").randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await result.ref.child("automation/rollbackChallenge").set({ hash: hashRollbackCode(code, salt), salt, expiresAt });
  return { code, expiresAt };
}

async function requestRollback(body) {
  const result = await getSuggestion(body.suggestionId);
  const automation = result.value.automation || {};
  const challenge = automation.rollbackChallenge || {};
  if (!challenge.hash || Number(challenge.expiresAt) < Date.now() || hashRollbackCode(body.code, challenge.salt) !== challenge.hash) {
    const error = new Error("복귀 키가 올바르지 않거나 만료되었습니다.");
    error.status = 403;
    throw error;
  }
  const mergeCommitSha = cleanText(automation.mergeCommitSha, 64);
  if (!/^[0-9a-f]{40}$/i.test(mergeCommitSha)) throw new Error("복귀할 배포 식별값이 올바르지 않습니다.");
  await githubRequest(process.env.GITHUB_AUTOMATION_TOKEN, `/repos/${REPO}/dispatches`, {
    method: "POST",
    body: { event_type: "rollback-release", client_payload: { merge_commit_sha: mergeCommitSha, suggestion_id: cleanText(body.suggestionId, 120), issue_number: automation.issueNumber || 0 } },
  });
  await result.ref.child("automation").update({ status: "rollback_requested", rollbackRequestedAt: Date.now(), rollbackChallenge: null });
  return { status: "rollback_requested" };
}

/* ── 🤖 자동개발 — 지금은 배포하지 않는다 (2026-08-13 대표 결정: "추후에 필요하면 한다") ──
   OpenAI 에 돈을 내고 코드를 짜게 하는 기능인데 지금은 쓰지 않는다.
   그런데도 여기서 AUTOMATION_BRIDGE_KEY 를 요구하고 있어서, 그 값이 없는 상태로는
   `firebase deploy --only functions` (전체 배포)가 검증 단계에서 통째로 멈췄다.
   메일 세 개와 건의 알림까지 못 올리게 막는 셈이라 내보내기(export)만 잠가 둔다.

   ⚠ 코드는 그대로 둔다 — 나중에 켤 때 아래 한 줄만 되살리면 된다.
   켜려면 함께 갖춰야 할 것:
     · AUTOMATION_BRIDGE_KEY  — GitHub 저장소 비밀값과 Firebase 비밀값에 «같은» 임의 문자열
     · AUTOMATION_ENDPOINT    — 배포된 이 함수 URL 을 GitHub 저장소 비밀값에
     · OPENAI_API_KEY         — codex-issue-implementation.yml 이 쓴다 (유료)
     · GITHUB_AUTOMATION_TOKEN — 이미 있음 (2026-08-13 재발급) */
const _parkedDevelopmentAutomation = functions
  .runWith({ secrets: ["GITHUB_AUTOMATION_TOKEN", "AUTOMATION_BRIDGE_KEY"] })
  .https.onRequest(async (req, res) => {
    setAutomationCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      let data;
      if (body.action === "getTask") {
        data = await bridgeTask(req);
      } else {
        const decoded = await requirePrimaryAdmin(req);
        if (body.action === "execute") data = await createDevelopmentIssue(decoded, body);
        else if (body.action === "status") data = await refreshStatus(body);
        else if (body.action === "approveDeploy") data = await approveDeployment(body);
        else if (body.action === "prepareRollback") data = await prepareRollback(body);
        else if (body.action === "rollback") data = await requestRollback(body);
        else { const error = new Error("지원하지 않는 자동개발 작업입니다."); error.status = 400; throw error; }
      }
      res.status(200).json({ ok: true, data });
    } catch (error) {
      console.error("developmentAutomation", error && error.stack || error);
      res.status(error.status || 500).json({ ok: false, error: cleanText(error && error.message || error || "자동개발 처리 실패", 500) });
    }
  });
// 켤 때 이 줄을 되살린다:  exports.developmentAutomation = _parkedDevelopmentAutomation;
void _parkedDevelopmentAutomation;   // 안 쓰는 변수 경고만 막는다

// ══════════ 새 건의 → 관리자 폰 알림 (웹푸시 · FCM) ══════════
//  건의가 등록되면 포털이 suggestions_meta_private/{id} 에 경량 메타를 함께 적는다.
//  그 시점을 잡아 uid_roles 에서 관리자를 찾고, 그 사람들이 [🔔 폰 알림]으로 등록해 둔
//  기기 토큰(fcm_tokens/{uid}/{token})으로 알림을 보낸다.
//
//  ⚠ data 전용 메시지를 보낸다. notification 필드를 함께 실으면 브라우저가 자체 알림을
//    띄우고 firebase-messaging-sw.js 도 띄워 알림이 두 번 뜬다.
//  ⚠ enter.html 의 SG_CATS 15개와 짝을 맞춘다. 여기 없는 분류는 알림에 "기타"로 찍혀
//    무슨 건의인지 폰에서 알 수 없다 (전에 8개가 빠져 있었다).
const SG_CAT_NAME = {
  // 업무지원
  erp: "푸른이알피", consult: "정부사업일정", work: "업무관리",
  cards: "기업정보함", docs: "문서·이력", portal: "포털",
  // 직접업무
  fund: "기금관리", rules: "취업규칙", payroll: "급여관리",
  // 기타 건의
  bizwork: "업무 개선", policy: "규정·제도", edu: "교육·연수",
  office: "사무환경·비품", hrwelf: "인사·복지", etc: "기타",
};

exports.notifySuggestion = functions.database
  .ref("/suggestions_meta_private/{id}")
  .onCreate(async (snap, context) => {
    const meta = snap.val() || {};
    const db = getDatabase();

    // 1) 관리자 UID 모으기
    const rolesSnap = await db.ref("uid_roles").once("value");
    const adminUids = [];
    rolesSnap.forEach((child) => {
      const v = child.val() || {};
      if (v.isAdmin === true && v.status !== "resigned") adminUids.push(child.key);
    });
    if (!adminUids.length) return null;

    // 2) 관리자들이 등록해 둔 기기 토큰 모으기 (본인이 올린 건의는 본인에게 안 보냄)
    const authorUid = String(meta.authorUid || "");
    const targets = [];
    await Promise.all(adminUids.map(async (uid) => {
      if (uid === authorUid) return;
      const ts = await db.ref(`fcm_tokens/${uid}`).once("value");
      ts.forEach((t) => { targets.push({ uid, token: t.key }); });
    }));
    if (!targets.length) {
      console.log("notifySuggestion: 등록된 관리자 기기가 없습니다", { id: context.params.id });
      return null;
    }

    // 3) 발송
    const cat = SG_CAT_NAME[meta.cat] || SG_CAT_NAME.etc;
    const payload = {
      title: `💬 새 건의 · ${cleanText(meta.author || "이름 없음", 20)}`,
      body: `[${cat}] ${cleanText(meta.title || "(제목 없음)", 90)}`,
      tag: "pu-suggestion",
      url: "/pureunall/enter.html?sg=1",
    };
    const res = await getMessaging().sendEachForMulticast({
      tokens: targets.map((t) => t.token),
      data: payload,
      webpush: { headers: { Urgency: "high", TTL: "86400" } },
    });

    // 4) 죽은 토큰 정리 — 안 지우면 기기를 바꿀 때마다 쓰레기가 쌓여 발송이 계속 실패한다
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument") {
        dead.push(`fcm_tokens/${targets[i].uid}/${targets[i].token}`);
      }
    });
    if (dead.length) {
      const updates = {};
      dead.forEach((p) => { updates[p] = null; });
      await db.ref().update(updates).catch((e) => console.warn("죽은 토큰 정리 실패", e));
    }

    console.log("notifySuggestion", {
      id: context.params.id, sent: res.successCount, failed: res.failureCount, cleaned: dead.length,
    });
    return null;
  });

// ════════════════════════════════════════════════════════════════════════════
// 기업정보함 자료 메일 보내기 — 다음메일(smtp.daum.net)로 대신 보낸다
// ════════════════════════════════════════════════════════════════════════════
// 왜 필요한가
//   지금까지는 브라우저가 mailto: 로 메일창만 열어 주었다. 브라우저는 첨부를
//   붙일 수 없어서, 자료를 내려받아 **손으로 끌어다 붙여야** 했다. 그리고 보내는
//   사람이 그 PC 에 설정된 계정이라 사람마다 달랐다.
//   이 함수가 대신 보내면 첨부가 자동으로 붙고, 늘 회사 주소로 나가고,
//   다음메일 보낸편지함에도 남는다.
//
// ⚠ 왜 Resend 가 아니라 SMTP 인가
//   Resend 같은 발송 서비스는 **우리가 가진 도메인**으로만 보낼 수 있다.
//   hanmail.net 은 카카오 것이라 인증할 수 없다. 회사 주소 그대로 보내려면
//   그 계정의 SMTP 로 직접 붙는 수밖에 없다.
//
// ⚠ 비밀번호는 코드에 넣지 않는다. Secret Manager 에 DAUM_MAIL_PASSWORD 로 두고
//   runWith({secrets:[...]}) 로만 읽는다. 다음은 2단계 인증을 켜면 일반 비밀번호가
//   막히므로 **앱 비밀번호**를 만들어 넣어야 한다.
//
// ⚠ 첨부는 브라우저가 올려 보내지 않는다. 자료는 이미 실시간DB 안에 있으므로
//   **서버가 직접 읽는다.** 8MB 짜리를 브라우저에서 다시 올리면 느리고, 도중에
//   끊기면 절반만 간다.
// 실제로 보내는 일은 mail-deliver.js 가 한다 — 「지금 보내기」와 「예약해 둔 것 보내기」가
// 같은 코드를 쓰게 하려고 떼어 두었다. 두 벌이면 한쪽만 고치고 지나간다.
const MD = require("./mail-deliver");

const CARDS_ROOT = MD.CARDS_ROOT;

// 보내는 주소. 비밀이 아니므로 **기업정보함 화면(자료함 → 메일 본문)에서 넣는다** —
// 파일에만 둘 수도 있지만, 그러면 주소 하나 바꾸려고 다시 배포해야 한다.
// 환경변수가 있으면 그것을 먼저 쓴다(예전 방식 호환).
async function mailUserAsync() {
  const env = String(process.env.DAUM_MAIL_USER || "").trim();
  if (env) return env;
  try {
    const s = await getDatabase().ref(CARDS_ROOT + "/config/matMail/from").once("value");
    return String(s.val() || "").trim();
  } catch (e) { return ""; }
}
function mailPass() { return String(process.env.DAUM_MAIL_PASSWORD || ""); }

// ★ 서울(asia-northeast3)에서 돈다. 다른 함수는 미국(us-central1)에 있지만 메일만 옮겼다.
//   다음메일이 **해외에서 오는 로그인을 막는** 경우가 있어서다. 비밀번호가 맞아도
//   미국에서 붙으면 「535 authentication failed」로 거절당한다.
//   덤으로 국내에서 쓰는 도구라 응답도 빠르다.
//   ⚠ 리전을 바꾸면 주소가 바뀐다 — pu-cards.html 의 MAIL_FN_URL 도 함께 고쳐야 한다.
const MAIL_REGION = "asia-northeast3";
exports.sendMaterialMail = functions
  .region(MAIL_REGION)
  .runWith({ secrets: ["DAUM_MAIL_PASSWORD"], timeoutSeconds: 120, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    // ★ 누가 보내는지 먼저 확인한다. 이 검사가 없으면 회사 메일이 공개 발송기가 된다.
    let sender;
    try {
      sender = await requireStaff(req);
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const db = getDatabase();
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const from = await mailUserAsync();

    // ── 예약 발송 ──
    // 보내지 않고 자리에만 담아 둔다. 때가 되면 sendScheduledMail 이 꺼내 보낸다.
    // ⚠ 담을 때 **누가 걸었는지**를 함께 적는다. 보낼 때는 사람이 없으므로
    //   그때 가서 확인할 수가 없다. 답장 받을 곳도 이 값으로 정해진다.
    const at = Number(body.scheduleAt || 0);
    if (at > 0) {
      if (at < Date.now() + 30000) {
        res.status(400).json({ ok: false, error: "예약은 지금부터 30초 뒤 이후로만 걸 수 있습니다." });
        return;
      }
      if (at > Date.now() + 1000 * 60 * 60 * 24 * 60) {
        res.status(400).json({ ok: false, error: "예약은 60일 뒤까지만 걸 수 있습니다." });
        return;
      }
      // 보내기 전에 미리 걸러 둔다 — 때가 되어서야 틀린 것을 알면 이미 늦다.
      const pre = MD.errorsBefore(body);
      if (pre) { res.status(400).json({ ok: false, error: pre }); return; }
      try {
        const ref = await db.ref(MD.CARDS_ROOT + "/scheduled").push({
          at: at,
          by: sender.email || "",
          payload: MD.slimPayload(body),
          madeAt: Date.now(),
          state: "waiting",
        });
        res.json({ ok: true, scheduled: true, at: at, id: ref.key, from: from });
      } catch (e) {
        res.status(500).json({ ok: false, error: "예약을 걸지 못했습니다: " + String((e && e.message) || e) });
      }
      return;
    }

    const r = await MD.deliver({
      db: db, body: body, from: from, pass: mailPass(),
      envId: process.env.DAUM_MAIL_ID, byEmail: sender.email || "",
    });
    if (!r.ok) { res.status(r.status || 500).json({ ok: false, error: r.error }); return; }
    res.json(r);
  });

// ════════════════════════════════════════════════════════════════════════════
// 예약해 둔 메일 보내기 — 15분마다 서버가 스스로 깨어난다
// ════════════════════════════════════════════════════════════════════════════
// 예전에는 화면(브라우저)이 때를 재고 있었다. 창을 닫으면 안 나갔다 —
// 「예약했는데 안 갔다」가 되는 자리라 서버로 옮긴다(대표 지시 2026-08-10).
//
// ⚠ 15분마다 도므로 정확히 그 분에 나가지는 않는다. 최대 15분 늦는다.
//   너무 자주 돌리면 빈 대기열만 확인하는 유휴 호출이 늘어난다.
// ⚠ 꺼낼 때 먼저 「보내는 중」으로 찜하고 보낸다. 안 그러면 앞 회차가 아직
//   보내는 중인데 다음 회차가 같은 것을 또 집어 두 통이 나간다.
// ═══ 여러 곳에 「한 통씩」 보내기 (2026-08-15, 대표 지시: 300곳 미만) ═══
// ⚠ 여기서는 **보내지 않는다.** 받는 곳마다 예약 한 건씩을 자리에 담아 두기만 하고,
//   실제 발송은 이미 돌고 있는 sendScheduledMail 이 15분마다 20통씩 빼 간다.
//   새 발송기를 만들면 두 곳에서 같은 메일을 보낼 위험이 생긴다.
// ⚠ 한꺼번에 쏟지 않는 것이 이 기능의 핵심이다 — 다음메일은 대량 발송용 계정이
//   아니라 몰아 보내면 막히고, 막히면 평소 자료 발송까지 멈춘다.
const MB = require("./mail-bulk");

exports.sendBulkMail = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    // ★ 누가 보내는지 먼저 확인한다 — 이 검사가 없으면 회사 메일이 공개 발송기가 된다.
    let sender;
    try {
      sender = await requireStaff(req);
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const v = MB.validateBulk(body);
    if (!v.ok) { res.status(400).json({ ok: false, error: v.error }); return; }

    const db = getDatabase();
    const now = Date.now();
    const batchId = "b" + now.toString(36) + Math.random().toString(36).slice(2, 6);
    const rows = MB.buildQueue(v, now, sender.email || "", batchId);

    try {
      // 한 번의 update 로 담는다 — 중간에 끊겨 «절반만 걸린» 상태가 남지 않게.
      const upd = {};
      rows.forEach((row) => {
        const key = db.ref(MD.CARDS_ROOT + "/scheduled").push().key;
        upd[key] = row;
      });
      await db.ref(MD.CARDS_ROOT + "/scheduled").update(upd);
      res.json({
        ok: true, n: rows.length, batchId: batchId,
        skipped: v.skipped,
        firstAt: rows[0].at, lastAt: rows[rows.length - 1].at,
        eta: MB.etaText(rows.length, v.gapMs),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: "예약을 걸지 못했습니다: " + String((e && e.message) || e) });
    }
  });

exports.sendScheduledMail = functions
  .region(MAIL_REGION)
  .runWith({ secrets: ["DAUM_MAIL_PASSWORD"], timeoutSeconds: 540, memory: "512MB" })
  // 빈 대기열을 하루 288번 확인할 필요가 없다. 15분 간격이어도 예약 메일은
  // 예약시각 뒤 최대 15분 안에 발송되며, 유휴 호출은 3분의 1로 줄어든다.
  .pubsub.schedule("every 15 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const db = getDatabase();
    const now = Date.now();
    const snap = await db.ref(MD.CARDS_ROOT + "/scheduled")
      .orderByChild("at").endAt(now).limitToFirst(20).once("value");
    const all = snap.val() || {};
    const ids = Object.keys(all);
    if (!ids.length) return null;

    const from = await mailUserAsync();
    let sent = 0, failed = 0;

    for (const id of ids) {
      const row = all[id] || {};
      if (row.state && row.state !== "waiting") continue;   // 이미 누가 집어 갔다

      const ref = db.ref(MD.CARDS_ROOT + "/scheduled/" + id);
      // 먼저 찜한다 — 두 번 보내지 않으려고. 이미 남이 찜했으면 건너뛴다.
      const claim = await ref.child("state").transaction((cur) =>
        (cur === "waiting" || cur === null || cur === undefined) ? "sending" : undefined);
      if (!claim.committed) continue;

      try {
        const r = await MD.deliver({
          db: db,
          body: Object.assign({}, row.payload || {}, { wasScheduled: true }),
          from: from, pass: mailPass(),
          envId: process.env.DAUM_MAIL_ID,
          byEmail: row.by || "",
        });
        if (r.ok) {
          await ref.remove();                    // 나갔으니 자리를 비운다
          sent++;
        } else {
          // ⚠ 지우지 않는다. 왜 못 갔는지 화면에서 보이고, 사람이 고쳐 다시 걸 수 있어야 한다.
          await ref.update({ state: "failed", error: String(r.error || ""), failedAt: Date.now() });
          failed++;
        }
      } catch (e) {
        await ref.update({ state: "failed", error: String((e && e.message) || e), failedAt: Date.now() });
        failed++;
      }
    }
    console.log("sendScheduledMail", { looked: ids.length, sent: sent, failed: failed });
    return null;
  });

// ═══ 사진첩 — 서버 쪽 사진 이사 (2026-08-13, PR #192 뒤) ═══
// 대표 지시: 총괄 관리자가 자기 아닌 다른 직원 사진도 창고로 옮길 수 있어야
// 한다. 창고 규칙은 실시간DB(uid_roles)를 못 읽어 "관리자인가"를 판정 못
// 하므로, 클라이언트 쪽 이사 도구(js/pu-photo-store.js 의 migrateToStorage)는
// 관리자 자기 자신의 사진만 옮길 수 있다. 이 함수는 Admin SDK 로 창고 규칙을
// 완전히 우회해 여러 사람 자리에 한꺼번에 쓴다.
const { migrateBatch } = require("./photos-migrate");

const PHOTOS_DB_ROOT = "puphotos"; // js/pu-photo-store.js 의 DB_ROOT 와 반드시 같아야 한다

async function requirePhotoAdmin(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (!match) {
    const error = new Error("로그인 확인 정보가 없습니다.");
    error.status = 401;
    throw error;
  }
  const decoded = await getAuth().verifyIdToken(match[1], true);
  const roleSnapshot = await getDatabase().ref(`uid_roles/${decoded.uid}`).once("value");
  const role = roleSnapshot.val() || {};
  if (role.isAdmin !== true) {
    const error = new Error("총괄관리자만 사진을 옮길 수 있습니다.");
    error.status = 403;
    throw error;
  }
  return decoded;
}

// functions/photos-migrate.js 가 기대하는 db 모양으로 실제 RTDB 를 얇게 감싼다.
// ⚠ ownersCount 는 photoDb 위에 얹은 관찰용 값이다(순수 함수 migrateBatch 의
//   반환 모양은 그대로 둔다) — 핸들러가 migrateBatch 를 다 부른 뒤 photoDb.ownersCount 를
//   읽어 응답에 함께 싣는다.
function realPhotoDb() {
  const db = getDatabase();
  const photoDb = {
    ownersCount: 0,
    listOwners() {
      // ⚠ owners 색인은 로그인(touchOwner) 또는 사진 올리기 때 채워진다 — 옛 자리
      // 옮기기(migrateLegacy)만으로 사진이 들어온 사람은 로그인을 한 번도 안 했으면
      // 이 색인에 없을 수 있다(최종 리뷰 2026-08-13). moved/skipped/failed 와 함께
      // ownersCount 를 응답에 실어 두므로, 실제 직원 수와 크게 다르면 알 수 있다.
      return db.ref(`${PHOTOS_DB_ROOT}/owners`).once("value")
        .then((s) => {
          const uids = Object.keys(s.val() || {});
          photoDb.ownersCount = uids.length;
          return uids;
        });
    },
    listYears(uid) {
      return db.ref(`${PHOTOS_DB_ROOT}/u/${uid}/items`).once("value")
        .then((s) => Object.keys(s.val() || {}));
    },
    listYear(uid, year) {
      return db.ref(`${PHOTOS_DB_ROOT}/u/${uid}/items/${year}`).once("value")
        .then((s) => s.val() || {});
    },
    readItem(uid, year, id) {
      return Promise.all([
        db.ref(`${PHOTOS_DB_ROOT}/u/${uid}/blobs/${year}/${id}`).once("value"),
        db.ref(`${PHOTOS_DB_ROOT}/u/${uid}/thumbs/${year}/${id}`).once("value"),
      ]).then(([f, t]) => {
        const full = f.val();
        if (!full) return null;
        return { full, thumb: t.val() || "" };
      });
    },
    writeMigrated(uid, year, id) {
      const u = {};
      u[`${PHOTOS_DB_ROOT}/u/${uid}/items/${year}/${id}/loc`] = "storage";
      u[`${PHOTOS_DB_ROOT}/u/${uid}/blobs/${year}/${id}`] = null;
      u[`${PHOTOS_DB_ROOT}/u/${uid}/thumbs/${year}/${id}`] = null;
      return db.ref().update(u);
    },
    /* 주소(내려받기 토큰이 붙은 URL)를 사진 정보에 적는다(2026-08-17).
       창고 규칙은 실시간DB(uid_roles)를 못 읽어 「자기 사진만」으로 잠겨 있고,
       그래서 관리자·공유받은 사람의 창고 요청이 403 으로 거부됐다(대표 화면:
       남의 회의사진 46장 전부 회색, 콘솔 403 832건). 주소는 규칙과 무관하게
       열리므로, 정보(실시간DB)를 읽을 수 있는 사람이 곧 사진도 볼 수 있게 된다
       — 실시간DB 시절과 같은 접근 범위다.
       ⚠ 없는 값은 안 쓴다 — 미리보기 없는 사진의 thumbUrl 을 null 로 덮지 않게. */
    writeUrls(uid, year, id, urls) {
      const u = {};
      if (urls && urls.fullUrl) u[`${PHOTOS_DB_ROOT}/u/${uid}/items/${year}/${id}/fullUrl`] = urls.fullUrl;
      if (urls && urls.thumbUrl) u[`${PHOTOS_DB_ROOT}/u/${uid}/items/${year}/${id}/thumbUrl`] = urls.thumbUrl;
      if (!Object.keys(u).length) return Promise.resolve();
      return db.ref().update(u);
    },
  };
  return photoDb;
}

// photos-migrate.js 가 기대하는 bucket 모양으로 실제 Storage 를 얇게 감싼다.
// ⚠ 되읽어 확인(exists)은 메타데이터만 본다 — 전체를 다시 내려받지 않는다.
//   (클라이언트 쪽은 getDownloadURL+fetch 로 전체를 다시 받는다 — 서버는 그럴
//   필요가 없다, 대역폭을 아낀다. 설계서 5절 참고.)
/* 사진 창고 이름 — **한 곳**에만 적는다.
   ⚠ 기본 창고가 아니다. 두 곳에 적혀 있으면 한쪽만 고쳐져, 그쪽 기능이
     조용히 「원본이 없습니다」가 된다(사진 이사·민감 서류 보기가 이 이름을 함께 쓴다). */
const PHOTO_BUCKET = "pureun-erp-hrphotos";

function realPhotoBucket() {
  // 창고 이름은 PR #192 에서 만든 것과 반드시 같아야 한다 — pu-photos.html 이 보는 창고.
  /* 창고 이름은 위 PHOTO_BUCKET 한 곳에서만 온다 — 두 곳에 적으면 한쪽만 고쳐져
     그 기능이 조용히 「원본이 없습니다」가 된다. */
  const bucket = getStorage().bucket(PHOTO_BUCKET);

  /* 내려받기 주소(토큰 URL) 하나를 만든다. 파일에 토큰이 이미 있으면 그것을 쓰고,
     없으면 하나 발급해 파일 메타데이터에 심는다(파이어베이스 표준 방식).
     ⚠ 서명 URL(getSignedUrl)을 안 쓰는 이유: 만료가 있다 — 만료되면 사진첩의
       모든 옛 사진이 어느 날 일제히 안 보이게 된다. 토큰 URL 은 안 만료된다.
     ⚠ 한 번 삐끗한 것을 「파일이 없다」로 단정하지 않는다 (2026-08-21 조사).
       한 번 돌린 뒤 세어 보니 32장이 **미리보기 주소는 있는데 원본 주소만** 없었다.
       원본이 정말 없으면 미리보기도 같이 없을 텐데 한쪽만 빈 것은, 무더기로 돌 때
       이 metadata 읽기·쓰기가 «간헐적으로» 실패했다는 뜻이다 — 예전에는 그것을
       조용히 null 로 만들어, 대표가 버튼을 여러 번 눌러야 채워졌다.
       그래서 잠깐 쉬고 스스로 다시 해 본다. 그래도 안 되면 그때 null 이다.
     ⚠ 이름 있는 함수로 둔다 — 객체 안에서 this 로 저를 다시 부르면, 부르는
       방식이 바뀌는 날(구조분해 등) 조용히 깨진다. */
  function tokenUrl(objectPath, left) {
    const file = bucket.file(objectPath);
    return file.getMetadata().then(([meta]) => {
      let tok = String((meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || "").split(",")[0];
      const ensure = tok
        ? Promise.resolve()
        : (tok = crypto.randomUUID(),
          file.setMetadata({ metadata: { firebaseStorageDownloadTokens: tok } }));
      return Promise.resolve(ensure).then(() =>
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${tok}`);
    }).catch((e) => {
      if (left <= 0) {
        console.warn("[주소 만들기] 끝내 실패", objectPath, e && e.message);
        return null;
      }
      return new Promise((ok) => setTimeout(ok, 400)).then(() => tokenUrl(objectPath, left - 1));
    });
  }

  return {
    upload(objectPath, dataUrl) {
      // ⚠ 진짜 base64 data URL 인지 확인한다(최종 리뷰 2026-08-13) — 확인 없이
      // Buffer.from 만 쓰면 이상한 값이 와도 조용히 깨진 바이트만 올리고, exists()는
      // "올라갔다"로 통과해 실시간DB 원본을 지워 버린다(되돌릴 수 없다). 종류는
      // 실린 mime 을 그대로 쓴다(전에는 image/jpeg 로 못 박았었다).
      const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ""));
      if (!m || !m[2]) {
        return Promise.reject(new Error("사진 본문이 base64 data URL 이 아닙니다"));
      }
      const buf = Buffer.from(m[3], "base64");
      return bucket.file(objectPath).save(buf, { contentType: m[1] || "image/jpeg" });
    },
    exists(objectPath) {
      return bucket.file(objectPath).exists().then((r) => !!(r && r[0]));
    },
    /* 주소 만들기는 위 tokenUrl 에 있다(왜 다시 해 보는지도 거기 적었다).
       끝내 못 만들면 null — 미리보기가 없는 사진도 있다(옛 자료). */
    downloadUrl(objectPath) { return tokenUrl(objectPath, 2); },
  };
}

// ⚠ 기본 시간제한(60초)·메모리(256MB)로는 30장 한 배치(읽기·올리기·확인·쓰기를
//   차례로 30번)를 못 끝낼 수 있다(최종 리뷰 2026-08-13) — 배치로 나눈 이유 자체가
//   시간제한 때문인데 기본값이면 그 위험이 그대로 남는다. sendMaterialMail(120초)·
//   sendScheduledMail(540초)와 같은 이유. 리전은 그대로 둔다(실시간DB도 미국에
//   있어 나머지 함수들과 맞춰 두는 쪽이 낫다 — 창고만 서울이라 올리기 구간에서
//   지연이 있을 수 있지만, 관리자가 가끔 누르는 일회성 도구라 감내한다).
exports.migratePhotosToStorage = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onRequest(async (req, res) => {
  setAutomationCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }
  try {
    await requirePhotoAdmin(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 30;
    const db = realPhotoDb();
    const result = await migrateBatch(db, realPhotoBucket(), limit);
    res.status(200).json({
      ok: true, moved: result.moved, linked: result.linked, skipped: result.skipped,
      // partial — 주소를 반만 만든 장수. 세고도 안 실으면 화면이 모른다.
      failed: result.failed, partial: result.partial, done: result.done,
      ownersCount: db.ownersCount,
    });
  } catch (error) {
    console.error("migratePhotosToStorage", error && error.stack || error);
    res.status(error.status || 500).json({
      ok: false, error: String((error && error.message) || error || "사진 이사 실패"),
    });
  }
});

/* ══════════ 급여자료 메일 자동수신 (급여데이터함 5차) ══════════
   비용 최적화 2026-08-23 — 「전용 자리 + 30분마다 확인」.

   ★ 왜 이 방식인가
   회사 도메인의 메일 배달 경로(MX)를 바꾸면 도착 즉시 받을 수 있지만, 잘못
   건드리면 **회사 메일 전체가 안 오는** 사고가 난다. 10분 빨라지자고 질 위험이
   아니다. 그래서 이미 쓰고 있는 다음메일 계정에 **IMAP 으로 붙어** 정해진
   폴더만 들여다본다 — 새 계정도, 새 비밀번호도, DNS 변경도 없다.

   ⚠ 온 메일함을 뒤지지 않는다. 대표님이 다음메일에서 규칙으로 모아 두는
     「급여자료」 폴더 **하나만** 본다. 다른 메일은 서버가 아예 열지 않는다.

   ⚠ 아는 주소에서 온 것만 받는다(대표 결정). 명단은 업체관리·직원 명부에서
     그때그때 만든다 — 사람이 따로 관리할 명단을 새로 만들지 않는다.

   ⚠ 처리한 메일은 **읽음으로만 표시**하고 지우지 않는다. 폴더에 그대로 남아
     있어야 "분명 보냈는데" 를 사람이 따라갈 수 있다.

   ⚠ 담기는 자리는 **보낸 주소로 찾은 업체의 주담당 대기 칸**이다(대표 승낙
     2026-08-21). 주소 → 업체 → 주담당 순서로 찾는다 — 파일 이름이
     IMG_2841.jpg 여도 누가 보냈는지는 늘 안다.
     못 갈랐으면 **공용 대기 칸(pending_shared)에 남긴다** — 업체를 모르거나,
     주담당이 아직 급여데이터함에 안 들어와 자리가 없을 때다. 그 자리에 넣으면
     아무도 안 열어 자료가 사라진 것과 같아진다. 왜 못 갈랐는지(why)도 적어
     관리자가 손볼 수 있게 한다. */
const MR = require("./mail-receive");

const PAYDATA_ROOT = "paydata";
const PAYDATA_BUCKET_ROOT = "pu_paydata";
const PAYDATA_BUCKET = "pureun-erp.firebasestorage.app";  // 앱(pu-paydata.html)과 같은 창고
const PAYMAIL_BOX = "급여자료";      // 다음메일에서 규칙으로 모아 두는 폴더
const PAYMAIL_UPLOADER = "_mail";    // 창고 자리 — 사람이 아니라 서버가 담았다는 표시
const PAYMAIL_MAX_PER_RUN = 30;      // 한 회차에 처리할 메일 수 — 오래 붙어 있지 않게
/* 며칠 전 것까지 훑나 — 읽음 여부를 안 보게 된 뒤로는 이 기간이 「다시 볼 범위」다.
   너무 길면 회차마다 많이 받고, 너무 짧으면 늦게 발견한 메일을 놓친다. */
const PAYMAIL_LOOK_DAYS = 14;

/* ── 처리한 메일 목록 (대표 결정 2026-08-23) ──
   여태 「읽음」을 처리 표시로 썼다 — 서버가 안 읽은 메일만 봐서, **대표가
   메일을 열어 보면 그 자료가 영영 안 들어왔다.** 사람이 읽는 것과 서버가
   처리한 것은 다른 일이라 한 칸을 같이 쓸 수 없다.

   이제 메일 고유 번호를 여기 적어 두고, 읽음 표시는 **건드리지 않는다.**
   ⚠ 끝없이 쌓이면 회차마다 그 전부를 읽는다(요금) — 오래된 것은 걷어낸다. */
const MAIL_DONE_KEEP = 3000;              // 적어 둘 기록 수
const MAIL_DONE_DAYS = 120;               // 이보다 오래된 것은 걷어낸다

/* ── 서버가 본 메일 목록 (대표 결정 2026-08-24) ──
   푸른 메일 「받은 메일」 화면이 이것을 읽는다. 처리 목록(mailseen)과 같은
   원칙으로 **적을 때 함께 걷어낸다** — 따로 도는 청소는 안 도는 청소다.
   ⚠ 목록을 못 적어도 자료 담기는 이미 끝났다. 기록 때문에 자료가 막히면 안 된다. */
const MAIL_LOG_KEEP = 500;

async function payMailWriteLog(db, rows) {
  if (!rows.length) return;
  const up = {};
  let box = {};
  /* 먼저 지금 목록을 읽는다 — 걷어낼 것을 고르는 데도, **덮지 말 것**을
     가리는 데도 쓴다. 한 번 읽어 둘 다 한다(같은 자리를 두 번 읽지 않는다). */
  let read = false;
  try {
    const snap = await db.ref(PAYDATA_ROOT + "/maillog").once("value");
    box = (snap && snap.val()) || {};
    read = true;
  } catch (e) {
    console.warn("receivePaydataMail 목록 읽기 건너뜀:", String((e && e.message) || e));
  }
  /* soft 는 「이미 있으면 그대로 두라」는 뜻 — 지난 회차에 처리한 메일은
     회차마다 같은 내용을 다시 쓰게 되고, 그것이 그대로 요금이 된다.
     ⚠ 목록을 못 읽었으면 덮어쓰지 **않는다**(있는 것을 뭉갤 수 있다). */
  rows.forEach(function (r) {
    if (!r.key) return;
    if (r.soft && (!read || box[r.key])) return;
    up[PAYDATA_ROOT + "/maillog/" + r.key] = r.rec;
  });
  if (!Object.keys(up).length) return;      // 적을 것이 없으면 손대지 않는다
  /* 적을 때 함께 걷어낸다 — 따로 도는 청소는 안 도는 청소다.
     ⚠ 세는 것은 「이번에 적는 수」가 아니라 **적은 뒤 남을 수**다.
     rows 로 세면 덮어쓰는 것까지 새것으로 세어 멀쩡한 줄을 지운다. */
  const keys = Object.keys(box).filter(function (k) { return !up[PAYDATA_ROOT + "/maillog/" + k]; });
  const after = keys.length + Object.keys(up).length;
  if (after > MAIL_LOG_KEEP) {
    keys.sort(function (a, b) { return Number((box[a] || {}).at || 0) - Number((box[b] || {}).at || 0); })
      .slice(0, after - MAIL_LOG_KEEP)
      .forEach(function (k) { up[PAYDATA_ROOT + "/maillog/" + k] = null; });
  }
  await db.ref().update(up).catch(function (e) {
    console.error("receivePaydataMail 목록 적기 실패:", String((e && e.message) || e));
  });
}

async function payMailDoneKeys(db) {
  const snap = await db.ref(PAYDATA_ROOT + "/mailseen").once("value").catch(() => null);
  return (snap && snap.val()) || {};
}

/* 처리했다고 적고, 오래된 기록은 걷어낸다 — 한 번의 update 로 함께 한다. */
async function payMailMarkDone(db, keys, done) {
  if (!keys.length) return;
  const now = Date.now();
  const up = {};
  keys.forEach(function (k) { up[PAYDATA_ROOT + "/mailseen/" + k] = now; });

  /* 걷어내기: 너무 오래된 것과, 수가 넘치면 오래된 쪽부터. */
  const old = [];
  const cut = now - MAIL_DONE_DAYS * 24 * 60 * 60 * 1000;
  Object.keys(done || {}).forEach(function (k) {
    if (Number(done[k] || 0) < cut) old.push(k);
  });
  const left = Object.keys(done || {}).filter(function (k) { return old.indexOf(k) < 0; });
  if (left.length + keys.length > MAIL_DONE_KEEP) {
    left.sort(function (a, b) { return Number(done[a] || 0) - Number(done[b] || 0); })
      .slice(0, left.length + keys.length - MAIL_DONE_KEEP)
      .forEach(function (k) { old.push(k); });
  }
  old.forEach(function (k) { up[PAYDATA_ROOT + "/mailseen/" + k] = null; });
  await db.ref().update(up).catch(function (e) {
    /* 못 적으면 다음 회차에 같은 메일을 또 담는다 — 조용히 넘기면 안 된다 */
    console.error("receivePaydataMail 처리 기록 실패:", String((e && e.message) || e));
  });
}

function payMailId() {
  return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* 아는 주소 명단은 메일이 실제로 있을 때만 만들고, 따뜻한 함수 인스턴스에서는
   6시간 재사용한다. 예전에는 빈 메일함이어도 10분마다 업체·직원 전체를 읽었다. */
let payMailKnownCache = { at: 0, list: null, index: null, owners: null, cos: null };
async function payMailKnownList(db) {
  const now = Date.now();
  if (payMailKnownCache.list && now - payMailKnownCache.at < 6 * 60 * 60 * 1000) {
    return payMailKnownCache.list;
  }
  const [coSnap, dirSnap] = await Promise.all([
    db.ref("data/companies").once("value").catch(() => null),
    db.ref("data/user_dir").once("value").catch(() => null),
  ]);
  const cos = coSnap && coSnap.val();
  const list = MR.buildKnownList(cos, dirSnap && dirSnap.val());
  /* 갈라 보내려면 주소가 **어느 업체 것인지**와 그 업체 주담당의 자리가 필요하다.
     명단과 같은 읽기로 함께 만든다 — 메일 한 통마다 다시 읽으면 요금이 된다.
     owners(급여데이터함에 들어온 사람)는 늘어나므로 같은 6시간마다 다시 읽는다. */
  const ownSnap = await db.ref(PAYDATA_ROOT + "/owners").once("value").catch(() => null);
  const index = MR.buildCompanyIndex(cos);
  const owners = (ownSnap && ownSnap.val()) || {};
  /* 업체 배열도 함께 담는다 — 주소로 못 가릴 때 **제목에서** 사업장을 찾는 데 쓴다
     (회계사무소 한 주소가 여러 사업장에 걸린다, 대표 요청 2026-08-24).
     같은 읽기로 만들어 두지 않으면 메일 한 통마다 다시 읽어 요금이 된다. */
  payMailKnownCache = { at: now, list: list, index: index, owners: owners, cos: MR.coList(cos) };
  return list;
}

/* 메일 본문을 창고에 .txt 로 담고 대기 칸에 한 줄 적는다 (대표 결정 2026-08-23).
   첨부가 **하나도 안 담긴** 메일에만 쓴다 — 첨부까지 있는 메일마다 줄을 하나 더
   만들면 대기 칸이 두 배가 된다.
   ⚠ RTDB 얇은 칸에 긴 글을 넣지 않는다. 창고에 담으면 원본 보존·뷰어·서랍·
   휴지통·보유기간이 손댈 것 없이 그대로 돈다. */
async function payMailStoreBody(db, bucket, text, mail) {
  const id = payMailId();
  const where = PAYDATA_BUCKET_ROOT + "/" + PAYMAIL_UPLOADER + "/pending/" + id + ".txt";
  const buf = Buffer.from(text, "utf8");
  await bucket.file(where).save(buf, { contentType: "text/plain; charset=utf-8", resumable: false });

  const name = MR.bodyFilename(mail.subject);
  const route = MR.routeFor(
    { from: mail.from, subject: mail.subject, filename: name },
    payMailKnownCache.index, payMailKnownCache.owners, mail.box, payMailKnownCache.cos);
  const common = {
    filename: name, file: where,
    mime: "text/plain", bytes: buf.length,
    at: Date.now(), mailFrom: mail.from, mailSubject: mail.subject, tag: route.tag,
  };
  const up = {};
  if (route.shared) {
    up[PAYDATA_ROOT + "/pending_shared/" + id] =
      MR.sharedPendingRecord(Object.assign({ why: route.why }, common));
  } else {
    up[PAYDATA_ROOT + "/u/" + route.seat + "/pending/" + id] = MR.pendingRecordFor(common);
  }
  await db.ref().update(up);
  return { id: id, seat: route.seat, shared: route.shared, why: route.why };
}

/* 첨부 하나를 창고에 담고, **임자를 찾아 그 사람 대기 칸**에 한 줄 적는다.
   못 찾으면 공용 칸에 남긴다(까닭과 함께). */
async function payMailStoreOne(db, bucket, att, mail) {
  const id = payMailId();
  const ext = MR.extOf(att.filename);
  const where = PAYDATA_BUCKET_ROOT + "/" + PAYMAIL_UPLOADER + "/pending/" + id + (ext ? "." + ext : "");
  await bucket.file(where).save(att.content, {
    contentType: att.contentType || "application/octet-stream",
    resumable: false,
  });
  const route = MR.routeFor(
    { from: mail.from, subject: mail.subject, filename: att.filename },
    payMailKnownCache.index, payMailKnownCache.owners, mail.box, payMailKnownCache.cos);

  const common = {
    filename: att.filename, file: where,
    mime: att.contentType || "", bytes: att.size || (att.content && att.content.length) || 0,
    at: Date.now(), mailFrom: mail.from, mailSubject: mail.subject, tag: route.tag,
  };
  const up = {};
  if (route.shared) {
    up[PAYDATA_ROOT + "/pending_shared/" + id] =
      MR.sharedPendingRecord(Object.assign({ why: route.why }, common));
  } else {
    up[PAYDATA_ROOT + "/u/" + route.seat + "/pending/" + id] = MR.pendingRecordFor(common);
  }
  await db.ref().update(up);
  return { id: id, seat: route.seat, shared: route.shared, why: route.why };
}

/* 메일 한 회차 — 30분마다 도는 것과 사람이 누르는 「지금 가져오기」가 **함께** 쓴다.
   두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽은 옛 길로 남는다. */
async function runPaydataMailOnce() {
  {
    const user = await mailUserAsync();
    const pass = mailPass();
    if (!user || !pass) {
      console.warn("receivePaydataMail: 메일 계정이 설정되지 않았습니다");
      return null;
    }

    const { ImapFlow } = require("imapflow");
    const { simpleParser } = require("mailparser");
    const db = getDatabase();
    const bucket = getStorage().bucket(PAYDATA_BUCKET);

    // 접속 아이디는 보내기와 **같은 후보 차례**를 쓴다(다음 계정마다 다르다).
    let client = null;
    let lastErr = null;
    for (const id of MD.loginIds(user, process.env.DAUM_MAIL_ID)) {
      const c = new ImapFlow({
        host: "imap.daum.net", port: 993, secure: true,
        auth: { user: id, pass: pass }, logger: false,
      });
      try { await c.connect(); client = c; break; } catch (e) {
        lastErr = e;
        try { await c.logout(); } catch (_) { /* 이미 끊겼다 */ }
      }
    }
    if (!client) {
      console.error("receivePaydataMail 접속 실패:", String((lastErr && lastErr.message) || lastErr));
      return null;
    }

    let took = 0, skipped = 0, unknown = 0;
    /* 갈린 것·공용에 남은 것을 따로 센다 — 「왜 아무도 안 받나」를 로그만 보고 알아야 한다. */
    let routed = 0, shared = 0;
    const whys = {};
    /* ⚠ 돌려줄 셈은 **try 밖에** 둔다. 예전에는 try 안에서 만든 boxes·inbox 를
       try 를 나온 뒤 return 에서 썼다 — 담기가 다 끝난 회차마다 반드시
       `ReferenceError: boxes is not defined` 로 터졌다(2026-08-24 로그).
       자료는 들어갔는데 함수는 실패로 끝나, 「지금 가져오기」가 500 을 받아
       사람에게 「가져오지 못했습니다」로 보였다. */
    const scanned = { boxes: [], looked: 0, took: 0, skipped: 0, unknown: 0, routed: 0, shared: 0 };
    try {
      /* 볼 폴더를 **찾아서** 고른다(대표 결정 2026-08-23). 여태 「급여자료」라는
         이름 하나만 찾아, 이미 있는 「2.급여+사무대행」 폴더를 못 보고 열흘 넘게
         「폴더가 없습니다」만 남겼다. */
      const confSnap = await db.ref(PAYDATA_ROOT + "/mailconf").once("value").catch(() => null);
      const conf = MR.mailConfOf(confSnap && confSnap.val());
      let boxList = [];
      try {
        boxList = await client.list();
      } catch (e) {
        console.warn("receivePaydataMail: 폴더 목록을 못 읽었습니다", String((e && e.message) || e));
      }
      const boxes = MR.pickMailboxes(boxList, conf);
      scanned.boxes = boxes;              // try 를 나온 뒤에도 쓸 수 있게
      if (!boxes.length) {
        /* 폴더 이름을 사람이 알 수 있게 **있는 그대로** 남긴다 — 이것이 없어서
           「무슨 이름으로 만들어야 하나」를 알 길이 없었다. */
        console.warn("receivePaydataMail: 볼 폴더를 못 찾았습니다. 이름에 「"
          + MR.MAILBOX_HINT + "」가 든 폴더가 없습니다. 지금 있는 폴더:",
          (boxList || []).map(function (b) { return b && b.path; }).filter(Boolean).join(" | "));
        return null;
      }

      // 먼저 다 받아 둔 뒤 처리한다 — 읽는 도중에 읽음 표시를 바꾸면 목록이 흔들린다.
      // 폴더마다 열고 닫으며 모은다. 한 회차 몫(PAYMAIL_MAX_PER_RUN)은 폴더를
      // 합쳐서 센다 — 폴더가 늘어난다고 한 번에 더 오래 붙어 있으면 안 된다.
      const inbox = [];
      for (const box of boxes) {
        if (inbox.length >= PAYMAIL_MAX_PER_RUN) break;
        let lock;
        try {
          lock = await client.getMailboxLock(box);
        } catch (e) {
          console.warn("receivePaydataMail: 「" + box + "」 폴더를 열지 못했습니다",
            String((e && e.message) || e));
          continue;
        }
        try {
          /* 읽음 여부를 **안 본다**(대표 결정 2026-08-23) — 대표가 열어 본 메일도
             가져와야 한다. 대신 최근 것부터 훑고, 이미 처리한 것은 아래에서 건너뛴다.
             ⚠ 폴더 전부를 매번 받으면 안 된다 — 최근 며칠 것만 본다. */
          const since = new Date(Date.now() - PAYMAIL_LOOK_DAYS * 24 * 60 * 60 * 1000);
          for await (const msg of client.fetch({ since: since },
            { uid: true, source: true, envelope: true })) {
            inbox.push({ uid: msg.uid, source: msg.source, box: box,
              messageId: (msg.envelope && msg.envelope.messageId) || "" });
            if (inbox.length >= PAYMAIL_MAX_PER_RUN) break;
          }
        } finally {
          lock.release();
        }
      }

      // 빈 메일함이면 업체·직원 명부를 내려받지 않는다. 사람이 아무것도 하지
      // 않아도 비용이 오르던 가장 불필요한 읽기를 이 지점에서 끊는다.
      /* 빈 메일함이면 여기서 끝낸다. 「지금 가져오기」가 말할 것이 있어야 하므로
         0 을 담은 셈을 돌려준다 — null 이면 화면이 「0통」인지 「못 봤는지」를 못 가린다. */
      if (!inbox.length) {
        /* 빈 폴더면 한 줄만 남긴다 — 아무 말도 안 남기면 「돌고는 있나」를
           알 수 없다. 2026-08-23에 실제로 그것 때문에 배포가 먹었는지
           로그로 확인할 수 없었다. 업체·직원 명부는 여전히 안 읽는다. */
        console.log("receivePaydataMail 새 메일 없음", { boxes: boxes });
        return scanned;                   // 셈은 모두 0 그대로다
      }
      const known = await payMailKnownList(db);
      /* 이미 처리한 메일 목록 — 읽음 표시를 안 쓰므로 이것이 유일한 기준이다. */
      const doneKeys = await payMailDoneKeys(db);
      const newlyDone = [];
      const logRows = [];               // 푸른 메일 「받은 메일」 목록에 적을 줄

      /* 목록 한 줄 만들기 — **세 갈래에서 함께 쓴다**(이미 처리·모르는 주소·이번에 담음).
         ⚠ 갈래마다 따로 만들면 한 곳만 고쳐 놓고 나머지를 잊는다.
         soft=true 는 「이미 적혀 있으면 덮지 말라」는 뜻이다. */
      const logRowOf = function (mkey, parsed, item, who, subject, more) {
        const m = more || {};
        return {
          key: mkey,
          soft: m.soft === true,
          rec: MR.mailLogRecord({
            from: who, subject: subject, body: MR.bodyTextOf(parsed),
            box: item.box, at: parsed.date ? +new Date(parsed.date) : Date.now(),
            atts: Array.isArray(parsed.attachments) ? parsed.attachments.length : 0,
            took: m.took || 0, seatName: m.seatName || '',
            shared: m.shared === true, why: m.why || '', old: m.old === true
          })
        };
      };

      for (const item of inbox) {
        let parsed;
        try {
          parsed = await simpleParser(item.source);
        } catch (e) {
          console.warn("receivePaydataMail: 메일을 읽지 못했습니다", String((e && e.message) || e));
          continue;   // 처리한 것으로 안 적는다 — 다음 회차에 다시 해 본다
        }
        /* ⚠ 파서가 **던지지 않고 빈 값**을 줄 수도 있다. 그때 그냥 나아가면
           바로 다음 줄(parsed.from)에서 터져 그 회차가 통째로 멈춘다 —
           담던 자료까지 함께 멈춘다. 한 통을 건너뛰는 것이 낫다. */
        if (!parsed) {
          skipped++;
          console.warn("receivePaydataMail: 메일 내용이 비어 건너뜀");
          continue;
        }

        const fromText = (parsed.from && parsed.from.text) || "";
        const sender = MR.senderOf(fromText);
        const subject = String(parsed.subject || "");

        /* 이미 처리한 메일이면 건너뛴다. 대표가 읽었는지는 보지 않는다. */
        const mkey = MR.mailKey(item.messageId || (parsed.messageId || ""),
          { from: sender, subject: subject, date: parsed.date ? +new Date(parsed.date) : 0 });
        if (mkey && doneKeys[mkey]) {
          /* 이미 담은 메일이다 — 자료를 또 담지는 않는다. 그래도 **목록에는
             있어야** 한다. 폴더에 있는데 화면에 없으면 「안 왔다」로 읽힌다
             (규칙을 켠 첫날 폴더의 30통이 통째로 안 보였다).
             지난 회차 결과는 알 수 없으니 그렇다고 적고, 이미 적혀 있으면
             덮지 않는다 — 안 덮으면 회차마다 같은 것을 다시 쓴다(요금). */
          if (mkey) {
            logRows.push(logRowOf(mkey, parsed, item, fromText || sender, subject,
              { old: true, why: '지난 회차에 이미 처리했습니다', soft: true }));
          }
          continue;
        }
        if (mkey) newlyDone.push(mkey);

        /* 급여 폴더에 온 것은 주소를 안 가린다(대표 결정 2026-08-23) — 대표가
           규칙으로 손수 갈라 둔 곳이라 그 안의 것은 이미 「급여 자료」다.
           받은메일함을 보게 켰을 때는 광고까지 들어오므로 그때만 가린다. */
        if (!MR.trustBox(item.box) && !MR.isKnownSender(sender, known)) {
          // 모르는 곳에서 온 것 — 담지 않는다. 지우지도 않는다(폴더에 그대로 남는다).
          unknown++;
          console.log("receivePaydataMail 모르는 주소라 건너뜀:", sender || "(주소 없음)",
            "폴더:", item.box || "(모름)");
          /* ⚠ **목록에는 남긴다.** 「보냈다는데 왜 안 보이나」가 바로 이 경우다 —
             화면에서 까닭을 봐야 업체관리에 주소를 넣을 수 있다. */
          if (mkey) {
            logRows.push(logRowOf(mkey, parsed, item, fromText || sender, subject,
              { why: '업체관리에 없는 주소라 담지 않았습니다' }));
          }
          continue;   // 처리한 것으로 적어 둔다(위에서 newlyDone 에 넣었다)
        }

        const atts = Array.isArray(parsed.attachments) ? parsed.attachments : [];
        let tookHere = 0;              // 이 메일에서 담은 첨부 수
        /* 푸른 메일 「받은 메일」 목록에 적을 것 — 이 메일이 누구 칸으로 갔고
           안 갔으면 왜 안 갔는지. 목록의 핵심 칸이다. */
        let hereSeat = '', hereShared = false, hereWhy = '';
        for (const att of atts) {
          const chk = MR.okAttachment(att);
          if (!chk.ok) {
            skipped++;
            console.log("receivePaydataMail 첨부 건너뜀:", att.filename || "(이름 없음)", chk.why);
            continue;
          }
          try {
            const r = await payMailStoreOne(db, bucket, att,
              { from: sender, subject: subject, box: item.box });
            /* 갈린 것과 공용에 남은 것을 따로 센다 — 「왜 아무도 안 받나」를
               로그만 보고 알 수 있어야 한다. */
            if (r && r.shared) { shared++; whys[r.why] = (whys[r.why] || 0) + 1; }
            else routed++;
            took++; tookHere++;
            if (r) { hereSeat = r.seat || hereSeat; hereShared = !!r.shared; hereWhy = r.why || hereWhy; }
          } catch (e) {
            // 한 건이 막혀도 나머지는 담는다. 읽음 표시는 아래에서 한다.
            skipped++;
            console.error("receivePaydataMail 담기 실패:", att.filename, String((e && e.message) || e));
          }
        }
        /* 첨부가 하나도 안 담겼으면 **본문으로** 한 줄 만든다(대표 결정 2026-08-23).
           첨부 없이 본문에 적어 보낸 메일이 통째로 버려지고 있었다. */
        if (!tookHere) {
          const bodyText = MR.bodyTextOf(parsed);
          const bchk = MR.okBody(bodyText);
          if (bchk.ok) {
            try {
              const r = await payMailStoreBody(db, bucket, bodyText,
                { from: sender, subject: subject, box: item.box });
              if (r && r.shared) { shared++; whys[r.why] = (whys[r.why] || 0) + 1; }
              else routed++;
              took++; tookHere++;
              if (r) { hereSeat = r.seat || hereSeat; hereShared = !!r.shared; hereWhy = r.why || hereWhy; }
            } catch (e) {
              skipped++;
              console.error("receivePaydataMail 본문 담기 실패:", String((e && e.message) || e));
            }
          } else {
            skipped++;
            hereWhy = bchk.why;        // 「숫자가 없어 값으로 만들 것이 없습니다」 같은 것
            console.log("receivePaydataMail 본문 건너뜀:", bchk.why);
          }
        }

        /* 목록에 한 줄 — **자료로 안 담긴 메일도 남긴다.** 문의 메일처럼 값이
           안 되는 것이 앱에서 통째로 안 보이던 것이 문제였다(대표 결정 2026-08-24). */
        if (mkey) {
          const ownRec = (payMailKnownCache.owners || {})[hereSeat] || null;
          logRows.push(logRowOf(mkey, parsed, item, fromText || sender, subject, {
            took: tookHere, seatName: ownRec ? (ownRec.name || '') : '',
            shared: hereShared, why: hereWhy
          }));
        }
      }
      /* 처리한 메일을 적어 둔다 — 안 적으면 회차마다 같은 것을 다시 담는다. */
      await payMailMarkDone(db, newlyDone, doneKeys);
      /* 푸른 메일 「받은 메일」 목록 — 자료로 안 담긴 메일도 여기에는 남는다. */
      await payMailWriteLog(db, logRows);
      scanned.looked = inbox.length;
      scanned.took = took; scanned.skipped = skipped; scanned.unknown = unknown;
      scanned.routed = routed; scanned.shared = shared;
      console.log("receivePaydataMail",
        { boxes: boxes, looked: inbox.length, took, skipped, unknown, routed, shared, whys });
      /* 앱이 「마지막에 언제·어느 폴더를 봤나」를 보여 줄 수 있게 적어 둔다 —
         이것이 없으면 자료가 안 들어올 때 사람이 확인할 데가 로그뿐이다. */
      await db.ref(PAYDATA_ROOT + "/mailconf/lastScan").set({
        at: Date.now(), boxes: boxes, looked: inbox.length,
        took: took, routed: routed, shared: shared, unknown: unknown
      }).catch(function () { /* 적지 못해도 받는 일은 이미 끝났다 */ });
    } catch (e) {
      console.error("receivePaydataMail 실패:", String((e && e.message) || e));
    } finally {
      try { await client.logout(); } catch (_) { /* 이미 끊겼다 */ }
    }
    return scanned;
  }
}

exports.receivePaydataMail = functions
  .region(MAIL_REGION)
  .runWith({ secrets: ["DAUM_MAIL_PASSWORD"], timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("every 30 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => { await runPaydataMailOnce(); return null; });

/* ── 「지금 가져오기」 (대표 결정 2026-08-23) ──
   30분을 기다리지 않고 사람이 눌러 바로 당긴다. 「보냈다는데 왜 안 보이나」를
   그 자리에서 확인할 수 있어야 한다.

   ⚠ 직원만 부를 수 있다(requireStaff) — 아니면 회사 메일함을 아무나 뒤진다.
   ⚠ 60초 안에 또 부르면 거절한다. 메일 서버에 붙는 일이라 연달아 누르면
     계정이 잠긴다. 두 번 눌리는 것을 화면에서도 막지만 여기서도 막는다. */
const PULL_COOL_MS = 60 * 1000;

exports.pullPaydataMail = functions
  .region(MAIL_REGION)
  .runWith({ secrets: ["DAUM_MAIL_PASSWORD"], timeoutSeconds: 300, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }
    try {
      await requireStaff(req);
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }
    const db = getDatabase();
    const key = PAYDATA_ROOT + "/mailconf/lastPull";
    const now = Date.now();
    try {
      const snap = await db.ref(key).once("value");
      const last = Number((snap && snap.val()) || 0);
      if (now - last < PULL_COOL_MS) {
        const wait = Math.ceil((PULL_COOL_MS - (now - last)) / 1000);
        res.status(429).json({ ok: false, error: wait + "초 뒤에 다시 눌러 주세요." });
        return;
      }
      await db.ref(key).set(now);
    } catch (e) {
      /* 시각을 못 적어도 받는 일은 해야 한다 — 다만 그때는 잠금이 없는 셈이다 */
      console.warn("pullPaydataMail 잠금 확인 실패:", String((e && e.message) || e));
    }
    try {
      const out = await runPaydataMailOnce();
      res.json(Object.assign({ ok: true }, out || {}));
    } catch (e) {
      console.error("pullPaydataMail 실패:", String((e && e.message) || e));
      res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  });


/* ══════ 공용 칸을 지금 규칙으로 다시 갈라 보내기 (대표 요청 2026-08-25) ══════
   배달은 메일을 **받을 때 한 번만** 한다. 그래서 업체관리에 주소를 나중에 넣어도
   이미 공용 칸에 떨어진 것은 영원히 그대로였다 — 52건이 「업체관리에 없는 주소」로
   쌓여 있었다.

   ⚠ 이 일은 서버만 할 수 있다. 화면에서는 **남의 자리에 못 쓴다**(콘솔 규칙이
   paydata/u/$owner 쓰기를 그 사람과 대리인에게만 준다). 그래서 함수로 둔다.
   ⚠ 총괄관리자만 — 남의 자리로 자료를 옮기는 일이다.
   ⚠ 지도(업체 주소)를 **새로 읽는다**. 6시간 캐시를 그냥 쓰면 방금 넣은 주소가
   안 보여 「아무것도 안 갈렸다」로 끝난다. */
exports.regroupPaydataShared = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }
    let me;
    try {
      me = await requireStaff(req);
      const roleSnap = await getDatabase().ref("uid_roles/" + me.uid).once("value");
      if (((roleSnap && roleSnap.val()) || {}).isAdmin !== true) {
        res.status(403).json({ ok: false, error: "총괄관리자만 다시 갈라 보낼 수 있습니다." });
        return;
      }
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const db = getDatabase();
    try {
      payMailKnownCache.at = 0;             // 방금 넣은 주소가 보이게 새로 읽는다
      await payMailKnownList(db);
      const snap = await db.ref(PAYDATA_ROOT + "/pending_shared").once("value");
      const box = (snap && snap.val()) || {};
      const ids = Object.keys(box);

      const up = {};
      let moved = 0, left = 0;
      const whys = {}, seats = {};
      ids.forEach(function (id) {
        const rec = box[id] || {};
        const r = MR.regroupOne(rec, payMailKnownCache.index,
          payMailKnownCache.owners, payMailKnownCache.cos);
        if (!r.shared && r.seat) {
          /* 사람 자리로 옮긴다 — 공용 칸에서 빼고, 이름표(사업장·귀속월·종류)도
             이번에 알아낸 것으로 갱신한다. */
          const tag = r.tag || {};
          up[PAYDATA_ROOT + "/u/" + r.seat + "/pending/" + id] = Object.assign({}, rec, {
            companyId: String(tag.companyId || rec.companyId || ""),
            companyName: String(tag.companyName || rec.companyName || ""),
            month: String(tag.month || rec.month || ""),
            kind: String(tag.kind || rec.kind || ""),
            why: "",
            routedAt: Date.now(),
            routedBy: "regroup"
          });
          up[PAYDATA_ROOT + "/pending_shared/" + id] = null;
          moved++;
          seats[r.seat] = (seats[r.seat] || 0) + 1;
        } else {
          /* 아직 못 갈랐다 — 까닭을 지금 것으로 고쳐 둔다(무엇을 손봐야 하는지) */
          left++;
          whys[r.why || "(까닭 없음)"] = (whys[r.why || "(까닭 없음)"] || 0) + 1;
          if (String(rec.why || "") !== String(r.why || "")) {
            up[PAYDATA_ROOT + "/pending_shared/" + id + "/why"] = String(r.why || "");
          }
        }
      });

      if (Object.keys(up).length) await db.ref().update(up);
      console.log("regroupPaydataShared", { looked: ids.length, moved, left, whys });
      res.json({ ok: true, looked: ids.length, moved: moved, left: left, whys: whys, seats: seats });
    } catch (e) {
      console.error("regroupPaydataShared 실패:", String((e && e.message) || e));
      res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  });


/* ══════ 잘못 온 자료를 다른 사람에게 넘기기 (대표 지시 2026-08-29) ══════
   대표: 「만약 잘못 갈라 보내면 다른 사람에게 보낼 수 있게 시스템 만들어야 한다」

   자료가 내 대기 칸에 있으면 나는 지우거나 서랍에 담을 수만 있었다.
   **남의 칸에는 못 쓴다** — 콘솔 규칙이 「자기 자리와 대리인만」으로 막는다.
   그래서 잘못 온 자료는 버리거나 그냥 떠안는 수밖에 없었다.

   ⚠ 옮기는 것은 **한 줄뿐**이다. 창고의 파일은 그대로 둔다 — 빠르고, 잘못돼도
     되돌리기 쉽다.
   ⚠ 넘길 수 있는 사람: **그 자료를 갖고 있는 사람**과 총괄관리자.
     남의 칸을 아무나 뒤지면 안 된다.
   ⚠ 아직 급여데이터함에 안 들어온 사람에게는 **못 넘긴다** — 아무도 안 여는
     자리에 두면 사라진 것과 같다(갈라 보내기와 같은 규칙).
   ⚠ 까닭을 반드시 적는다. 「왜 나한테 왔지」를 받는 사람이 알아야 한다. */
const HAND_WHY_MAX = 200;

exports.handPaydataItem = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    let me;
    try { me = await requireStaff(req); }
    catch (e) { res.status(e.status || 401).json({ ok: false, error: String(e.message || e) }); return; }

    const body = req.body || {};
    const ids = (Array.isArray(body.ids) ? body.ids : [body.id])
      .map((x) => String(x || "")).filter(Boolean);
    const from = String(body.from || "");
    const to = String(body.to || "");            // 빈칸이면 공용 칸으로 되돌린다
    const why = cleanText(body.why, HAND_WHY_MAX);
    if (!ids.length) { res.status(400).json({ ok: false, error: "넘길 자료를 고르십시오." }); return; }
    if (!from) { res.status(400).json({ ok: false, error: "어느 자리에서 넘기는지 알 수 없습니다." }); return; }
    if (!why) { res.status(400).json({ ok: false, error: "왜 넘기는지 적어 주십시오 — 받는 사람이 알아야 합니다." }); return; }
    if (to && to === from) { res.status(400).json({ ok: false, error: "같은 자리로는 넘길 수 없습니다." }); return; }

    const db = getDatabase();
    try {
      /* 갖고 있는 사람이거나 총괄관리자만 */
      if (me.uid !== from) {
        const roleSnap = await db.ref("uid_roles/" + me.uid).once("value");
        if (((roleSnap && roleSnap.val()) || {}).isAdmin !== true) {
          res.status(403).json({ ok: false, error: "그 자리의 자료는 본인이나 총괄관리자만 넘길 수 있습니다." });
          return;
        }
      }
      /* 받는 사람이 이 함에 들어와 있는가 — 안 들어온 자리에 두면 사라진 것과 같다 */
      if (to) {
        const own = await db.ref(PAYDATA_ROOT + "/owners/" + to).once("value");
        if (!own || !own.val()) {
          res.status(400).json({ ok: false, error: "그 분은 아직 급여데이터함에 들어온 적이 없습니다 — 한 번 열어야 자리가 생깁니다." });
          return;
        }
      }

      const up = {};
      const done = [];
      const now = Date.now();
      for (const id of ids) {
        const snap = await db.ref(PAYDATA_ROOT + "/u/" + from + "/pending/" + id).once("value");
        const rec = snap && snap.val();
        if (!rec) continue;                       // 그 사이 누가 처리했다
        const moved = Object.assign({}, rec, {
          handedFrom: from, handedBy: me.uid, handedAt: now, handWhy: why
        });
        if (to) {
          up[PAYDATA_ROOT + "/u/" + to + "/pending/" + id] = moved;
        } else {
          /* 임자를 모를 때는 공용 칸으로 — 아무에게나 떠넘기는 것보다 낫다 */
          up[PAYDATA_ROOT + "/pending_shared/" + id] = Object.assign({}, moved, {
            why: "사람이 되돌림 — " + why
          });
        }
        up[PAYDATA_ROOT + "/u/" + from + "/pending/" + id] = null;
        /* 누가·언제·누구에게·왜 — 자료가 돌고 돌면 어디서 어긋났는지 찾아야 한다 */
        up[PAYDATA_ROOT + "/handoff_log/" + id + "_" + now] = {
          id: id, from: from, to: to, by: me.uid, at: now, why: why,
          filename: String(rec.filename || "")
        };
        done.push(id);
      }
      if (!done.length) { res.json({ ok: true, moved: 0, note: "옮길 것이 없습니다 — 이미 처리됐을 수 있습니다." }); return; }
      await db.ref().update(up);
      console.log("handPaydataItem", { by: me.uid, from, to: to || "(공용)", n: done.length });
      res.json({ ok: true, moved: done.length, to: to });
    } catch (e) {
      console.error("handPaydataItem 실패:", String((e && e.message) || e));
      res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  });


/* 지문·간편 로그인(패스키) — 판단은 functions/passkey.js 한 곳에서만 한다.
   로그인 문을 여는 코드라 다른 함수와 섞지 않는다. */
const _passkey = require('./passkey');
exports.passkeyRegisterStart  = _passkey.passkeyRegisterStart;
exports.passkeyRegisterFinish = _passkey.passkeyRegisterFinish;
exports.passkeyLoginStart     = _passkey.passkeyLoginStart;
exports.passkeyLoginFinish    = _passkey.passkeyLoginFinish;
exports.passkeyDevices        = _passkey.passkeyDevices;


// ══════════ 파이어베이스 사용액 받아 적기 (2026-08-15, 대표 지시) ══════════
// 대표님: "결제한 금액 잔여량이 얼마인지 실시간으로 확인 가능한지, 화면에 넣을 수 있는지."
//
// ⚠ 화면(브라우저)이 구글에 직접 물어보게 만들 수 없다. 금액을 읽으려면 결제 열쇠가
//   필요한데 우리 앱은 브라우저에서 도는 공개 파일이라, 열쇠를 넣으면 누구나 열어 본다.
//   그 열쇠는 금액 조회를 넘어 결제 설정까지 닿는다. 그래서 반드시 서버를 거치고,
//   서버는 **금액이라는 숫자 하나만** 내려 준다.
//
// ⚠ 「남은 금액」은 못 만든다 — Blaze 는 후불이라 남은 돈이라는 숫자 자체가 없다.
//   이번 달 지금까지 쓴 금액만 적는다.
//
// ⚠ 완전한 실시간이 아니다. 구글은 금액이 움직일 때 쏘고 주기는 20~30분쯤이다.
//   그래서 updatedAt 을 반드시 함께 적는다 — **언제 것인지 모르는 금액이 제일 위험하다.**
const BA = require("./billing-alert");

exports.recordBillingAlert = functions
  .region(MAIL_REGION)
  .pubsub.topic("billing-alerts")
  .onPublish(async (message) => {
    let raw;
    try {
      raw = message.json;
    } catch (e) {
      console.error("recordBillingAlert: 쪽지를 읽지 못했습니다", String((e && e.message) || e));
      return null;   // 되던지면 Pub/Sub 이 같은 쪽지를 끝없이 다시 보낸다
    }

    const parsed = BA.parseAlert(raw);
    if (!parsed.ok) {
      console.log("recordBillingAlert 건너뜀:", parsed.why);
      return null;
    }

    const ref = getDatabase().ref("billing/current/" + parsed.key);

    // ⚠ 그냥 set 하지 않는다. Pub/Sub 은 순서를 지켜 주지 않아서, 늦게 도착한 옛 쪽지가
    //   최신 금액을 더 작은 값으로 되돌린다. 화면에서는 금액이 줄어든 것처럼 보이고
    //   아무도 그게 틀렸다는 걸 모른다. 트랜잭션으로 「더 큰 값만」 받는다.
    const res = await ref.transaction((prev) => {
      if (!BA.shouldApply(prev, parsed.row)) return;   // undefined = 그대로 둔다
      return Object.assign({}, parsed.row, { updatedAt: Date.now() });
    });

    /* ── 시간별 기록도 한 줄 쌓는다 (2026-08-17 대표 지시) ────────────────
       current 는 「이 순간 값」만 덮어써서 지난 값이 안 남았다 —
       「몇 시에 얼마였고 얼마 늘었나」를 알 길이 없었다.
       ★ 기록 쓰기가 실패해도 위 current 갱신은 «살린다».
         지금 값이 더 중요하다 — 기록 때문에 지금 값이 안 올라가면 손해가 크다. */
    try {
      const h = BA.historyEntry(parsed, Date.now());
      if (h) await getDatabase().ref(h.path).set(h.value);
    } catch (e) {
      console.error("recordBillingAlert: 기록 남기기 실패(지금 값은 살렸습니다)",
        String((e && e.message) || e));
    }

    /* ── 하루 폭주 판정 (2026-08-29 대표 지시) ─────────────────────────
       2026-08-16 에 백업이 폭주해 하루에 86,042원이 나갔는데 아무 알림도 없었다.
       총액 알림은 「얼마를 넘으면」이라 닿을 때쯤엔 이미 다 나간 뒤다.

       ★ 「전체」 쪽지가 왔을 때만 잰다 — 칸마다 재면 같은 일을 다섯 번 한다.
       ⚠ 기록을 **통째로 읽지 않는다.** 최근 아흐레만 잘라 읽는다 —
         사용액을 보려고 사용액을 늘리면 웃긴다.
       ⚠ 판정에 실패해도 위의 값·기록은 «살린다». */
    if (parsed.key === "total") {
      try {
        const nowMs = Date.now();
        const ym = BA.historyEntry(parsed, nowMs).path.split("/")[2];
        const since = nowMs - 9 * 86400000;
        const db = getDatabase();
        const snap = await db.ref("billing/history/" + ym + "/total")
          .orderByKey().startAt(String(Math.round(since))).once("value");
        const hit = BA.spikeCheck(snap.val() || {}, nowMs);
        const ref = db.ref("billing/spike");
        if (!hit) {
          /* 지나간 폭주 표는 치운다 — 어제 것이 오늘도 붉게 떠 있으면 아무도 안 믿는다 */
          const old = (await ref.once("value")).val();
          if (old && old.day !== BA.kstDay(nowMs)) await ref.remove();
        } else {
          /* 어느 칸에서 느는지는 **폭주일 때만** 알아본다 */
          const byKey = {};
          for (const k of ["database", "storage", "functions", "ai"]) {
            const s = await db.ref("billing/history/" + ym + "/" + k)
              .orderByKey().startAt(String(Math.round(since))).once("value");
            const v = s.val();
            if (v) byKey[k] = v;
          }
          const who = BA.spikeCulprit(byKey, nowMs);
          await ref.set(Object.assign({}, hit, who ? { key: who.key, label: who.label } : {}));
          console.warn("recordBillingAlert: 하루 폭주", hit, who || "");
        }
      } catch (e) {
        console.error("recordBillingAlert: 폭주 판정 실패(값·기록은 살렸습니다)",
          String((e && e.message) || e));
      }
    }

    console.log("recordBillingAlert", {
      key: parsed.key,
      cost: parsed.row.cost,
      applied: res.committed,
    });
    return null;
  });


// ══════════ 판독 대리인 — 열쇠를 브라우저에서 없앤다 (2026-08-17, 대표 지시) ══════════
//
// ⚠ 왜: 판독 열쇠가 실시간DB(`pucards/config/geminiKey`)에 평문으로 있고 규칙상
//   **로그인한 모든 직원이 읽는다.** 게다가 `AQ.` 로 시작하는 AI 스튜디오 열쇠라
//   구글 API 키 목록에 없어 **웹사이트 제한 같은 자물쇠를 채울 수도 없다**(확인 완료).
//   브라우저에 두는 한 반드시 샌다. 서버가 대신 부르고 열쇠는 서버만 안다.
//
// ⚠ 서버는 **구글을 부르는 일만** 한다. 어떤 서류인지 가리고 자동 입력을 정하는
//   판정(KINDS·autoOk)은 `js/pu-doc-read.js` 에 그대로 둔다 — 사진첩·기업정보함·
//   급여데이터함이 함께 쓰는 것이라 옮기면 두 벌이 되어 한쪽만 고쳐진다.
const DR = require("./doc-read");

// 판독은 **로그인한 직원이면** 할 수 있다.
// ⚠ requireStaff 를 그대로 쓰지 않는다 — 그건 비밀번호 로그인만 받아서
//   지문(패스키) 계정이 막힌다. 실시간DB 규칙과 **같은 기준**으로 맞춘다:
//   password 또는 auth.token.passkey === true.
async function requireReader(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (!match) {
    const error = new Error("로그인 후 이용해 주세요.");
    error.status = 401;
    throw error;
  }
  const decoded = await getAuth().verifyIdToken(match[1], true);
  const byPassword = decoded.firebase && decoded.firebase.sign_in_provider === "password";
  if (!byPassword && decoded.passkey !== true) {
    const error = new Error("회사 계정으로 로그인해 주세요.");
    error.status = 403;
    throw error;
  }
  return decoded;
}

/* 열쇠를 얻는다 — 서버 비밀이 먼저.
   ⚠ 실시간DB 갈래는 **옮기는 동안만** 쓰는 임시 다리다. 네 앱(사진첩·기업정보함·
     enter·경력관리)을 다 옮기고 `firebase functions:secrets:set GEMINI_KEY` 를
     넣은 뒤에는, DB 의 열쇠를 지우고 이 갈래도 지워야 완결된다.
     남겨 두면 열쇠가 DB 에 그대로 있어 지금 문제가 안 풀린다. */
async function readGeminiKey() {
  const fromSecret = String(process.env.GEMINI_KEY || "").trim();
  /* ⚠ **어디서 왔는지**를 남긴다(값은 절대 안 남긴다). 금고를 걸었는데도 옛 갈래로
     돌고 있으면, 실시간DB 의 열쇠를 지우는 순간 판독이 멈춘다 — 지우기 전에
     이 줄로 확인한다: `keySource secret` 이면 금고에서 온 것이다. */
  if (fromSecret) { console.log("keySource secret"); return fromSecret; }
  const db = getDatabase();
  const paths = ["pucards/config/geminiKey", "data/app_config/geminiKey"];
  for (const p of paths) {
    try {
      const snap = await db.ref(p).once("value");
      const v = String(snap.val() || "").trim();
      if (v) { console.log("keySource rtdb", p); return v; }
    } catch (e) { /* 다음 자리로 */ }
  }
  return "";
}

/* 2026-08-17 — 대표님이 `firebase functions:secrets:set GEMINI_KEY` 로 비밀을 넣으셨다.
   이제 열쇠는 **금고(Secret Manager)** 에서 온다.
   ⚠ 이 줄은 비밀이 **실제로 있을 때만** 걸 수 있다. 없는 비밀을 걸면 배포가 통째로
     막힌다(2026-08-17 에 실제로 막혔다: `Secret … GEMINI_KEY not found`).
   ⚠ 실시간DB 갈래(readGeminiKey 안)는 **아직 남겨 둔다.** 금고가 실제로 도는 것을
     사람이 확인하기 전에 지우면, 어긋났을 때 판독이 통째로 멈춘다.
     확인 뒤에 DB 의 열쇠와 그 갈래를 함께 지운다. */
exports.readDoc = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: ["GEMINI_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    // ★ 누가 부르는지 먼저 확인한다. 이 검사가 없으면 우리 열쇠가 공개 판독기가 된다.
    try {
      await requireReader(req);
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const v = DR.validate(body);
    if (!v.ok) { res.status(400).json({ ok: false, error: v.error }); return; }

    const key = await readGeminiKey();
    if (!key) { res.status(503).json({ ok: false, error: "AI 키가 설정되지 않았습니다 — 관리자에게 알려 주세요." }); return; }

    // cfg = 부르는 쪽이 정한 값(온도·최대 길이). 걸러진 것만 넘어온다.
    const r = await DR.callGemini(fetch, key, v.parts, null, v.cfg);
    if (!r.ok) {
      /* ⚠ 상태를 **그대로** 돌려준다. 브라우저의 재시도·모델 갈아타기 판단이
         이 숫자를 보고 움직인다(429 면 잠시 뒤, 403 이면 곧바로 포기). */
      res.status(r.status && r.status >= 400 ? r.status : 502)
        .json({ ok: false, error: r.why || "AI가 응답하지 않습니다.", status: r.status || 0 });
      return;
    }
    res.json({ ok: true, reply: r.json });
  });

// ══════════ AI 지우개 — 사진에서 표시한 곳을 지우고 배경으로 메운다 ══════════
// 대표 지시 2026-08-29: "특정부분 없어지게" · "편집기능에 최소 비용이 들게"
//
// ⚠ **요금이 이 함수의 주제다.** 그림을 만드는 모델은 판독보다 비싸다.
//   ① 브라우저가 **자른 조각만** 보낸다. 서버는 그 크기를 **직접 막는다** —
//      브라우저가 잘못 만들어 통째로 보내도 요금이 안 샌다(자물쇠는 서버에 있어야 한다).
//   ② **물음은 서버가 정한다.** 부르는 쪽이 글을 못 보낸다 — 마음대로 시키면
//      「없던 것을 만들어 넣는」 일에도 쓰이고, 그것은 증빙 사진에 있어선 안 된다.
//   ③ 열쇠는 판독 대리인과 **같은 금고**에서 온다(readGeminiKey).
const PE = require("./photo-edit");

exports.photoEdit = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: ["GEMINI_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    // ★ 누가 부르는지 먼저 — 이 검사가 없으면 우리 열쇠가 공개 지우개가 된다.
    try {
      await requireReader(req);
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const v = PE.validate((req.body && typeof req.body === "object") ? req.body : {});
    if (!v.ok) { res.status(400).json({ ok: false, error: v.error }); return; }

    const key = await readGeminiKey();
    if (!key) { res.status(503).json({ ok: false, error: "AI 키가 설정되지 않았습니다 — 관리자에게 알려 주세요." }); return; }

    // 사람이 적은 말(want)을 함께 넘긴다 — 틀(지킴말)은 photo-edit.js 가 그대로 쥔다.
    const r = await PE.callEdit(fetch, key, v.data, v.mimeType, null, v.want);
    if (!r.ok) {
      res.status(r.status && r.status >= 400 ? r.status : 502)
        .json({ ok: false, error: r.why || "AI가 응답하지 않습니다.", status: r.status || 0 });
      return;
    }
    // ★ 무엇을 시켰는지 **돌려준다** — 화면이 그것을 사진에 기록으로 남긴다.
    //   증빙 사진에서 「이 사진 손댔나」에 답하려면 «무엇을 시켰나»까지 있어야 한다.
    res.json({ ok: true, image: r.image, want: PE.wantOf(v.want) });
  });

// ═══ 민감 서류 보기 (사진첩 보안 3건 계획 2단계, 대표 지시 2026-08-17) ═══
// 계약서·근태표의 **원본 주소를 사진 정보에 안 남긴다.** 볼 때마다 여기로 와서
// 로그인·권한을 확인받고 내용을 받아 간다. 까닭과 정한 것들은 photo-view.js 머리에.
const PV = require("./photo-view");

/* 사진 한 장을 볼 자격이 있는지 따진다 — 실시간DB 규칙과 같은 기준.
   ⚠ 정보(items/…)를 **Admin SDK 로** 읽는다. 규칙을 우회하는 것이 아니라,
     규칙이 못 보는 것(uid_roles 의 관리자 여부)을 여기서 대신 따지는 것이다. */
async function photoGate(decoded, v) {
  const db = getDatabase();
  const [roleSnap, itemSnap] = await Promise.all([
    db.ref(`uid_roles/${decoded.uid}`).once("value"),
    db.ref(`${PHOTOS_DB_ROOT}/u/${v.owner}/items/${v.year}/${v.id}`).once("value"),
  ]);
  const item = itemSnap.val();
  const seen = PV.canSee({ viewerUid: decoded.uid, owner: v.owner, role: roleSnap.val() || {}, item: item });
  if (!seen.ok) return seen;
  return PV.decide(item);
}

exports.photoView = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    let decoded;
    try {
      decoded = await requireReader(req);
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const v = PV.validate(body);
    if (!v.ok) { res.status(400).json({ ok: false, error: v.error }); return; }

    let gate;
    try {
      gate = await photoGate(decoded, v);
    } catch (e) {
      console.error("photoView gate", e && e.message);
      res.status(500).json({ ok: false, error: "권한을 확인하지 못했습니다." });
      return;
    }
    if (!gate.ok) { res.status(gate.status || 403).json({ ok: false, error: gate.why }); return; }

    /* 창고에서 내용을 받아 data:URL 로 돌려준다.
       ⚠ 화면(loadFull)이 data:URL 을 기대한다 — 판독기도 그 모양을 받는다.
         여기서 모양을 바꾸면 부르는 쪽 전부를 함께 고쳐야 한다. */
    try {
      /* ⚠ 사진 창고는 **기본 창고가 아니다.** 이름을 안 적으면 엉뚱한 창고를 보고
         「원본이 없습니다」만 돌려준다. PHOTO_BUCKET 한 곳에서 온다. */
      const file = getStorage().bucket(PHOTO_BUCKET).file(PV.storagePath(v.owner, v.year, v.id, "full"));
      const [buf] = await file.download();
      res.json({ ok: true, dataUrl: "data:image/jpeg;base64," + buf.toString("base64") });
    } catch (e) {
      /* 파일이 없는 경우와 그 밖의 실패를 갈라 준다 — 「원본이 없습니다」와
         「서버가 못 줬습니다」는 사람이 해야 할 일이 다르다. */
      const missing = e && (e.code === 404 || /No such object/i.test(String(e.message || "")));
      console.error("photoView download", e && e.message);
      res.status(missing ? 404 : 502).json({
        ok: false,
        error: missing ? "창고에 원본이 없습니다 — 옛 사진일 수 있습니다" : "원본을 받아오지 못했습니다",
      });
    }
  });

/* 이미 주소가 적힌 민감 서류를 훑고, 시키면 지운다 — 총괄관리자만.
   ⚠ **세어 보고한 다음에 지운다**(mode:'scan' → 대표 확인 → mode:'clear').
     지우면 그 사진들은 반드시 photoView 를 거쳐야 보인다. 몇 장인지 모르고
     지우면, 안 보이게 됐을 때 무엇이 몇 장 영향받았는지도 알 수 없다. */
exports.photoSensitiveSweep = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    try {
      await requirePhotoAdmin(req);
    } catch (e) {
      res.status(e.status || 401).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const db = getDatabase();
    const snap = await db.ref(PHOTOS_DB_ROOT).once("value");
    const hits = PV.sweep(snap.val() || {});
    const byKind = {};
    hits.forEach(function (h) { byKind[h.kind] = (byKind[h.kind] || 0) + 1; });

    const mode = String((req.body && req.body.mode) || "scan");
    if (mode !== "clear") {
      res.json({ ok: true, mode: "scan", found: hits.length, byKind: byKind });
      return;
    }
    const u = PV.clearPaths(hits, PHOTOS_DB_ROOT);
    if (Object.keys(u).length) await db.ref().update(u);
    console.log("photoSensitiveSweep cleared", hits.length, byKind);
    res.json({ ok: true, mode: "clear", cleared: hits.length, byKind: byKind });
  });

/* 홈페이지 읽어오기 — 통합시스템이 홈페이지와 대조할 수 있게 쪽 내용을 글자로 돌려준다.
   읽기만 한다. 쓰기 경로가 없으므로 이 함수로는 홈페이지를 바꿀 수 없다.
   총괄관리자만 부를 수 있다. */
exports.readHomepage = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    setAutomationCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    try {
      const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!match) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
      const decoded = await getAuth().verifyIdToken(match[1], true);
      const roleSnapshot = await getDatabase().ref(`uid_roles/${decoded.uid}`).once("value");
      const role = roleSnapshot.val() || {};
      if (role.isAdmin !== true) {
        res.status(403).json({ error: "총괄관리자만 홈페이지를 읽어올 수 있습니다." });
        return;
      }

      const url = homepageUrl((req.body && req.body.path) || "");
      if (!url) { res.status(400).json({ error: "읽을 수 없는 쪽입니다." }); return; }

      const page = await fetch(url, { headers: { "User-Agent": "pureun-erp-homepage-check" } });
      if (!page.ok) { res.status(502).json({ error: `홈페이지 응답 ${page.status}` }); return; }
      const html = await page.text();
      res.json({ path: req.body.path, html: html, readAt: Date.now() });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || "홈페이지를 읽지 못했습니다." });
    }
  });

/* 하나은행·하나카드 거래문자 연결
   - 푸른 계정 비밀번호를 휴대폰 앱에 저장하지 않는다.
   - ERP에서 5분짜리 연결번호를 만든 뒤 휴대폰 한 대에 전용 보안키를 발급한다.
   - 원문 문자는 저장하지 않고 거래일시·금액·입출금·적요만 보관한다. */
const HANA_PAIR_TTL_MS = 5 * 60 * 1000;
const HANA_MESSAGE_PACKAGES = new Set([
  "com.samsung.android.messaging",
  "com.google.android.apps.messaging",
]);

function hanaJson(res, status, value) {
  res.status(status).json(value);
}

function hanaHash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function hanaDeviceKey(value) {
  return hanaHash(String(value || "").trim()).slice(0, 40);
}

function hanaSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function requireFinanceStaff(req) {
  const decoded = await requireStaff(req);
  const snap = await getDatabase().ref(`uid_roles/${decoded.uid}`).once("value");
  const role = snap.val() || {};
  if (role.isAdmin !== true && role.fin !== true) {
    const error = new Error("재무 담당자 또는 총괄관리자만 연결할 수 있습니다.");
    error.status = 403;
    throw error;
  }
  return decoded;
}

async function requireTotalAdmin(req) {
  const decoded = await requireStaff(req);
  const snap = await getDatabase().ref(`uid_roles/${decoded.uid}/isAdmin`).once("value");
  if (snap.val() !== true) {
    const error = new Error("총괄관리자만 입금 확인 알림을 볼 수 있습니다.");
    error.status = 403;
    throw error;
  }
  return decoded;
}

function hanaAdminAlertKey(uid, transactionId) {
  return hanaHash(`${String(uid || "")}:${String(transactionId || "")}`);
}

function hanaDeviceRef(linked) {
  return getDatabase().ref(`hanaSmsBridge/devices/${linked.uid}/${hanaDeviceKey(linked.deviceId)}`);
}

/* 휴대폰이 보냈지만 대기함에 못 들어간 문자의 «까닭»만 적어 둔다.
   원문·금액은 남기지 않는다 — 남길 이유가 없고, 남기면 지켜야 할 것이 하나 늘어난다. */
async function hanaNoteSkip(linked, reason) {
  try {
    await hanaDeviceRef(linked).child("lastSkip").set({
      reason: String(reason || "unknown").slice(0, 60),
      at: Date.now(),
    });
  } catch (err) { /* 기록에 실패해도 문자 처리를 막지 않는다 */ }
}

async function requireHanaDevice(req, body) {
  const match = /^Device\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  const uid = String(body.uid || "").trim();
  const deviceId = String(body.deviceId || "").trim();
  if (!match || !uid || !deviceId || deviceId.length > 200) {
    const error = new Error("휴대폰 연결정보가 올바르지 않습니다.");
    error.status = 401;
    throw error;
  }
  const ref = getDatabase().ref(`hanaSmsBridge/devices/${uid}/${hanaDeviceKey(deviceId)}`);
  const snap = await ref.once("value");
  const device = snap.val() || {};
  if (device.disabled === true || !device.tokenHash || !hanaSafeEqual(device.tokenHash, hanaHash(match[1]))) {
    /* ★ 폰이 «죽은 열쇠»로 말을 걸어 온 것을 적어 둔다 (2026-08-29 대표 지시로 파다 잡음).
       여태는 여기서 그냥 401 을 던지고 끝냈다 — 서버에 자국이 하나도 안 남았다.
       그래서 화면은 「연결 뒤 문자 0건」이라고만 했고, 대표는
       「앱이 지워졌나 · 알림이 꺼졌나 · 절전인가」를 셋 다 헤매야 했다.
       실은 «앱은 멀쩡히 살아 말을 걸고 있는데 연결만 끊긴» 것일 수 있다.
     ⚠ «그 폰이 실제로 등록되어 있을 때»만 적는다(tokenHash 가 있을 때).
       아무 uid 나 적게 하면 모르는 사람이 남의 칸에 글을 쓸 수 있다. */
    if (device.tokenHash) {
      ref.child("lastReject").set({ at: Date.now(), reason: device.disabled === true ? "disabled" : "bad_token" })
        .catch(() => { /* 못 적어도 거절은 그대로 한다 */ });
    }
    const error = new Error("휴대폰 연결이 만료되었거나 해제되었습니다.");
    error.status = 401;
    throw error;
  }
  /* 잘 들어왔으면 「끊김」 자국을 지운다 — 지난 자국이 남아 계속 붉으면 못 믿는 표가 된다. */
  ref.update({ lastSeenAt: Date.now(), lastReject: null }).catch(() => {});
  return { uid, deviceId, device };
}

exports.hanaMessageBridge = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { hanaJson(res, 405, { ok: false, error: "POST 요청만 허용됩니다." }); return; }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const action = String(body.action || "").trim();
    const db = getDatabase();

    try {
      if (action === "pairClaim") {
        const code = String(body.code || "").replace(/\D/g, "");
        const deviceId = String(body.deviceId || "").trim();
        const deviceName = String(body.deviceName || "권형하 휴대폰").trim().slice(0, 60);
        if (!/^\d{8}$/.test(code) || !deviceId || deviceId.length > 200) {
          hanaJson(res, 400, { ok: false, error: "8자리 연결번호와 휴대폰 정보가 필요합니다." }); return;
        }
        const pairRef = db.ref(`hanaSmsBridge/pairs/${hanaHash(code)}`);
        const pairSnap = await pairRef.once("value");
        const pair = pairSnap.val() || {};
        if (!pair.uid || Number(pair.expiresAt || 0) < Date.now()) {
          await pairRef.remove().catch(() => {});
          hanaJson(res, 410, { ok: false, error: "연결번호가 만료되었습니다. ERP에서 다시 발급해 주세요." }); return;
        }
        const currentPair = await db.ref(`hanaSmsBridge/pairByUid/${pair.uid}`).once("value");
        if (String(currentPair.val() || "") !== hanaHash(code)) {
          await pairRef.remove().catch(() => {});
          hanaJson(res, 410, { ok: false, error: "새 연결번호가 발급되었습니다. 가장 최근 번호를 입력해 주세요." }); return;
        }
        const token = crypto.randomBytes(32).toString("base64url");
        const deviceKey = hanaDeviceKey(deviceId);
        await db.ref(`hanaSmsBridge/devices/${pair.uid}`).set({
          [deviceKey]: {
            tokenHash: hanaHash(token),
            deviceName,
            pairedAt: Date.now(),
            lastSeenAt: Date.now(),
            disabled: false,
          },
        });
        await pairRef.remove();
        await db.ref(`hanaSmsBridge/pairByUid/${pair.uid}`).remove();
        hanaJson(res, 200, { ok: true, uid: pair.uid, deviceToken: token, deviceName }); return;
      }

      /* ══ 「폰이 말을 걸었다」를 남기는 한 자리 (2026-08-30) ═══════════════
         ⚠★ 여태 이 자국은 «새로 담았을 때만» 찍혔다. 그래서 이런 일이 있었다 —
            대표가 「지난 문자 가져오기」를 눌러 폰이 110건을 올렸는데,
            그것이 어제 이미 담은 것들이라 «전부 중복»으로 되돌아갔고,
            서버에는 아무 자국도 안 남았다. 화면은 그대로
            「연결 뒤 문자 0건 — 앱이 지워졌거나 알림이 꺼졌습니다」라고 했다.
            폰은 멀쩡히 말을 걸고 있었는데 화면이 «거짓말»을 한 것이다.
            대표는 그 말을 믿고 두 번이나 앱을 다시 깔았다.
         ★ 「무엇이 담겼나」와 「폰이 살아 있나」는 다른 물음이다.
           담긴 것이 없어도 말을 걸었으면 살아 있는 것이다. */
      const hanaStampAlive = async (linked, how, ver) => {
        const at = Date.now();
        const patch = { lastTalkAt: at };
        /* ★★ 판 번호는 «어느 길로 왔든» 적는다 (2026-08-30).
           여태 15분 훑기만 적었다. 그런데 훑기가 안 도는 폰 — 절전이 재웠거나
           옛 앱이거나 — 은 판 번호를 영영 안 보낸다. 실제로 20:42 에 연결한 폰이
           두 시간 가까이 판을 못 알려, 「새 앱을 깔긴 하신 건가」를 못 물었다.
           연결·지난 문자는 사람이 눌러서 도는 길이라 반드시 닿는다. */
        const v = String(ver || "").slice(0, 16);
        if (v) patch.appVersion = v;
        /* ⚠ lastOkAt 은 «알림 다리가 돈다»는 뜻이라 알림으로 온 것에만 찍는다.
           지난 문자·훑기가 대신 찍어 주면 알림이 죽은 채로 「멀쩡함」이 된다. */
        if (how === "sweep") { patch.lastSweepAt = at; patch.lastSkip = null; }
        else if (how === "history") patch.lastHistoryAt = at;
        else { patch.lastOkAt = at; patch.lastSkip = null; }
        await hanaDeviceRef(linked).update(patch).catch(() => {});
      };

      if (action === "ingest") {
        const linked = await requireHanaDevice(req, body);
        /* ══ 온 길이 둘이다 (대표 지시 2026-08-29) ══════════════════════════
           ① 알림 (source 없음) — 지금 막 도착한 문자. 예전부터 있던 길.
           ② 문자함 (source==="history") — 폰의 지난 문자를 손으로 끌어온 것.

           ★ ②에는 «알림 꾸러미 이름»이 없다. 알림을 통해 온 것이 아니라
             안드로이드 문자함(SMS)에서 직접 읽은 것이라, 어느 앱이 띄웠는지가
             아예 없다. 그래서 꾸러미 검사를 건너뛴다 — 대신 기기 열쇠로
             이미 누구인지 확인했고(requireHanaDevice), 문자함은 OS 가 지키는
             자리라 아무 앱이나 넣을 수 없다.
           ⚠ 그 밖의 것은 «하나도» 다르지 않다 — 같은 해석기, 같은 대기함,
             같은 중복막이. 여기서 갈라지면 한쪽만 조용히 막힌다(2026-08-29 사고). */
        const fromHistory = String(body.source || "") === "history";
        /* ③ 스스로 훑기 (source==="sweep") — 폰이 15분마다 문자함을 훑어 보낸 것.
           ★★ 왜 만들었나 (2026-08-30): 알림만 엿듣던 다리가 하루 내내 조용했다.
              지난 문자 가져오기는 됐으니 열쇠도 그물도 멀쩡했는데, 알림이 안 왔다.
              알림은 앱 재설치·절전·방해금지 어느 하나에만 걸려도 통째로 끊긴다.
              그래서 폰이 «스스로» 문자함을 줍는 길을 하나 더 냈다.
           ⚠ 이 길도 알림 꾸러미 이름이 없다 — 문자함에서 직접 읽은 것이라 그렇다.
              지난 문자와 같은 까닭으로 꾸러미 검사를 건너뛴다.
           ⚠ 같은 문자가 15분마다 또 와도 괜찮다 — rawHash 가 막는다.
              그 막이가 없었다면 이 방법 자체를 못 썼다. */
        const fromSweep = String(body.source || "") === "sweep";
        const howCame = fromSweep ? "sweep" : (fromHistory ? "history" : "notify");
        const packageName = String(body.packageName || "").trim();
        /* ★★ 꾸러미로 «미리» 막지 않는다 (2026-08-30 에 풀었다).
           ⚠ 여태 삼성·구글 메시지 앱 둘만 받았다. 그런데 하나 입금 알림이
             «하나원큐 앱 푸시»로 오면 문자함에도 없고 여기서도 400 으로 되돌아가,
             두 길 모두에서 사라졌다 — 화면에는 「문자 0건」으로만 보였다.
           ★ 막이는 그대로 있다 — 아래 parseHanaMessage 가 하나 거래가 아닌 것을
             모두 걸러 낸다. 꾸러미 검사는 그 위에 덧댄 «두 번째» 그물이었을 뿐인데,
             그 그물코가 진짜 물고기까지 막고 있었다.
           ⚠ 어디서 왔는지는 «반드시» 적어 둔다. 실제로 무엇이 물어다 주는지
             기록에 남아야, 나중에 좁힐 때 짐작이 아니라 기록을 보고 좁힌다. */
        if (packageName && !HANA_MESSAGE_PACKAGES.has(packageName)) {
          await hanaDeviceRef(linked).update({ lastPkg: packageName.slice(0, 64) }).catch(() => {});
        }
        const title = String(body.title || "").slice(0, 200);
        const text = String(body.text || "").slice(0, 1200);
        const parsed = HanaMessage.parseHanaMessage(`${title}\n${text}`);
        if (!parsed.ok) {
          /* ⚠ 걸러진 «까닭»만 남긴다 — 문자 원문은 여기서도 저장하지 않는다.
             까닭이 안 남으면 「문자는 왔는데 ERP에 없다」를 아무도 설명할 수 없다
             (2026-08-24 대표 물음이 바로 그것이었다). */
          await hanaNoteSkip(linked, parsed.reason);
          /* ⚠ 걸러졌어도 폰은 말을 걸었다 — 그 사실까지 지우면 안 된다. */
          await hanaDeviceRef(linked).update({ lastTalkAt: Date.now() }).catch(() => {});
          hanaJson(res, 200, { ok: true, ignored: true, reason: parsed.reason }); return;
        }
        const tx = parsed.transaction;
        const inboxRef = db.ref(`hanaSmsBridge/inbox/${linked.uid}/${tx.id}`);
        /* ★★ 원문이 같으면 «이미 담은 것»이다 (2026-08-29 에 크게 데었다).
           tx.id 는 적요를 재료로 만든다. 그래서 파서를 고쳐 적요가 바뀌면
           «같은 문자»인데도 열쇠가 달라져 새 줄로 또 들어온다 —
           실제로 「가능액」을 걷어낸 날, 카드 26건이 두 벌이 되어
           합계가 1,176,450원 부풀었다.
         ★ rawHash 는 문자 «원문»의 해시라 파서를 고쳐도 안 변한다.
           그것이 진짜 열쇠다. */
        const sameRaw = await db.ref(`hanaSmsBridge/inbox/${linked.uid}`)
          .orderByChild("rawHash").equalTo(tx.rawHash).limitToFirst(1).once("value")
          .catch(() => null);
        /* ⚠★ 중복이어도 «자국은 남긴다» — 안 남기면 화면이 「문자 0건」이라 거짓말한다. */
        if (sameRaw && sameRaw.exists()) {
          await hanaStampAlive(linked, howCame, body.appVersion);
          hanaJson(res, 200, { ok: true, duplicate: true, sameRaw: true, id: tx.id }); return;
        }
        const existing = await inboxRef.once("value");
        if (existing.exists()) {
          await hanaStampAlive(linked, howCame, body.appVersion);
          hanaJson(res, 200, { ok: true, duplicate: true, id: tx.id }); return;
        }
        const receivedAt = Date.now();
        /* 어디서 왔는지를 적어 둔다 — 「받은 때」가 실제로 쓴 때보다 한참 뒤인 줄이
           섞이면, 그것이 지난 문자를 끌어온 것인지 사람이 알 수 있어야 한다. */
        const cameFrom = String(linked.device.deviceName || "권형하 휴대폰").slice(0, 46) +
          (fromHistory ? " · 지난 문자" : "");
        const inboxValue = {
          id: tx.id,
          src: tx.src,
          type: tx.type,
          date: tx.date,
          amount: tx.amount,
          balance: tx.balance || 0,
          memo: tx.memo,
          note: tx.note,
          rawHash: tx.rawHash,
          /* ★ 카드 «취소» 표 — 여태 여기서 버려졌다(2026-08-29).
             화면은 이 표를 보고 «스스로 확정되지 않게» 손을 막는다.
             버리면 취소가 승인처럼 보이고, 카드 지출이 실제보다 많아진다. */
          cancel: tx.cancel === true,
          status: "pending",
          receivedAt,
          deviceName: cameFrom,
        };
        const updates = {};
        updates[`inbox/${linked.uid}/${tx.id}`] = inboxValue;
        if (tx.type === "income") {
          const alertKey = hanaAdminAlertKey(linked.uid, tx.id);
          updates[`adminAlerts/${alertKey}`] = {
            alertKey,
            txId: tx.id,
            linkedUid: linked.uid,
            src: tx.src,
            date: tx.date,
            amount: tx.amount,
            memo: String(tx.memo || "").slice(0, 200),
            status: "new",
            officeStatus: "unknown",
            receivedAt,
            deviceName: cameFrom,
          };
        }
        await db.ref("hanaSmsBridge").update(updates);
        /* ⚠ 지난 문자를 끌어온 것으로는 lastOkAt 을 찍지 않는다.
             lastOkAt 이 뜻하는 것은 「알림 다리가 지금 돌고 있다」이지
             「폰과 말이 통한다」가 아니다. 지난 것을 넣었다고 살아 있다고 찍으면,
             알림이 막힌 채로 「멀쩡함」이 되어 진짜 끊김을 영영 못 알아챈다.
             PC 붙여넣기도 같은 까닭으로 안 찍는다(아래). */
        if (fromSweep) {
          await hanaStampAlive(linked, "sweep", body.appVersion);
        } else if (fromHistory) {
          /* ★ 지난 문자는 lastOkAt 을 안 찍는다(위 까닭). 그렇다고 아무 자국도
             안 남기면, 화면이 「앱에서 지난 문자 가져오기를 누르세요」를 «영영»
             되풀이한다 — 방금 눌러 72건이 들어왔는데도 그랬다(2026-08-29 대표).
             그래서 «지난 문자를 받았다»는 것만 따로 적는다. 살아 있음과는 다른 말이다. */
          await hanaStampAlive(linked, "history", body.appVersion);
        } else {
          await hanaStampAlive(linked, "notify", body.appVersion);
        }
        hanaJson(res, 200, { ok: true, saved: true, id: tx.id }); return;
      }


      /* ══ PC 에서 붙여넣기 (대표 지시 2026-08-29) ══════════════════════════
         폰 앱이 막히면 거래내역이 통째로 비는데, 그때 손쓸 길이 없었다.
         문자를 PC 에서 붙여넣으면 «폰과 똑같은 길»로 들어가게 한다.

         ★ 파서·대기함·중복막이를 그대로 쓴다 — 여기서 따로 만들면 두 길이
           갈라지고, 갈라지면 이번처럼 한쪽만 조용히 막힌다.
         ⚠ 대표만 쓸 수 있다 (휴대폰 연결과 같은 규칙, 2026-08-27 결정).
         ⚠ 문자 원문은 저장하지 않는다 — 폰 길과 같다.
         ⚠ 폰의 lastOkAt 은 건드리지 않는다. 이것은 폰이 보낸 것이 아니다 —
           찍어 버리면 「폰이 살아 있다」고 잘못 읽는다. */
      if (action === "ingestPaste") {
        const admin = await requireTotalAdmin(req);
        const uid = String(admin.uid || "");
        const text = String(body.text || "");
        if (!text.trim()) { hanaJson(res, 400, { ok: false, error: "붙여넣은 글이 비어 있습니다." }); return; }
        if (text.length > 20000) { hanaJson(res, 400, { ok: false, error: "한 번에 너무 많습니다 — 나눠서 넣어 주세요." }); return; }

        /* 여러 통을 한 번에 붙여넣는다. 빈 줄로 나뉜 덩이를 한 통으로 본다 —
           문자 한 통이 여러 줄인 경우가 많아 줄 단위로 자르면 토막 난다. */
        const chunks = text.split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean);
        const blocks = chunks.length ? chunks : [text.trim()];
        if (blocks.length > 100) { hanaJson(res, 400, { ok: false, error: "한 번에 100통까지 넣을 수 있습니다." }); return; }

        const results = [];
        const updates = {};
        const seen = {};
        let saved = 0, dup = 0, skipped = 0;

        for (const block of blocks) {
          const parsed = HanaMessage.parseHanaMessage(block);
          if (!parsed.ok) {
            skipped++;
            results.push({ ok: false, reason: parsed.reason, head: block.slice(0, 40) });
            continue;
          }
          const tx = parsed.transaction;
          if (seen[tx.id]) { dup++; results.push({ ok: false, reason: "duplicate", head: block.slice(0, 40) }); continue; }
          const inboxRef = db.ref(`hanaSmsBridge/inbox/${uid}/${tx.id}`);
          const existing = await inboxRef.once("value");
          if (existing.exists()) { dup++; results.push({ ok: false, reason: "duplicate", head: block.slice(0, 40) }); continue; }
          seen[tx.id] = true;

          const receivedAt = Date.now();
          updates[`inbox/${uid}/${tx.id}`] = {
            id: tx.id, src: tx.src, type: tx.type, date: tx.date,
            amount: tx.amount, balance: tx.balance || 0,
            memo: tx.memo, note: tx.note, rawHash: tx.rawHash,
            /* 폰 길과 «같은» 표를 남긴다 — 길에 따라 다르게 들어가면 안 된다. */
            cancel: tx.cancel === true,
            status: "pending", receivedAt,
            deviceName: "PC 붙여넣기",
          };
          if (tx.type === "income") {
            const alertKey = hanaAdminAlertKey(uid, tx.id);
            updates[`adminAlerts/${alertKey}`] = {
              alertKey, txId: tx.id, linkedUid: uid,
              src: tx.src, date: tx.date, amount: tx.amount,
              memo: String(tx.memo || "").slice(0, 200),
              status: "new", officeStatus: "unknown", receivedAt,
              deviceName: "PC 붙여넣기",
            };
          }
          saved++;
          results.push({ ok: true, id: tx.id, src: tx.src, type: tx.type,
                         date: tx.date, amount: tx.amount, memo: tx.memo });
        }

        if (Object.keys(updates).length) await db.ref("hanaSmsBridge").update(updates);
        hanaJson(res, 200, { ok: true, saved, duplicate: dup, skipped, results });
        return;
      }

      if (action === "adminAlerts") {
        await requireTotalAdmin(req);
        const snap = await db.ref("hanaSmsBridge/adminAlerts")
          .orderByChild("receivedAt").limitToLast(100).once("value");
        const items = Object.values(snap.val() || {})
          .filter((x) => x && x.status !== "resolved")
          .sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0))
          .map((x) => ({
            alertKey: String(x.alertKey || ""), txId: String(x.txId || ""),
            src: x.src === "card" ? "card" : "bank", date: String(x.date || ""),
            amount: Number(x.amount || 0), memo: String(x.memo || ""),
            status: String(x.status || "new"), officeStatus: String(x.officeStatus || "unknown"),
            companyName: String(x.companyName || ""), matchedId: String(x.matchedId || ""),
            receivedAt: Number(x.receivedAt || 0), deviceName: String(x.deviceName || ""),
          }));
        hanaJson(res, 200, { ok: true, items }); return;
      }

      if (action === "adminResolve") {
        const admin = await requireTotalAdmin(req);
        const alertKey = String(body.alertKey || "");
        if (!/^[a-f0-9]{64}$/.test(alertKey)) {
          hanaJson(res, 400, { ok: false, error: "확인할 입금 알림이 올바르지 않습니다." }); return;
        }
        await db.ref(`hanaSmsBridge/adminAlerts/${alertKey}`).update({
          status: "resolved",
          resolution: String(body.resolution || "checked").slice(0, 40),
          resolvedAt: Date.now(),
          resolvedBy: admin.uid,
        });
        hanaJson(res, 200, { ok: true }); return;
      }

      const staff = await requireFinanceStaff(req);
      const base = db.ref(`hanaSmsBridge`);

      if (action === "pairStart") {
        const code = String(crypto.randomInt(10000000, 100000000));
        const expiresAt = Date.now() + HANA_PAIR_TTL_MS;
        const codeHash = hanaHash(code);
        const oldPair = await base.child(`pairByUid/${staff.uid}`).once("value");
        const oldHash = String(oldPair.val() || "");
        const updates = {};
        if (/^[a-f0-9]{64}$/.test(oldHash)) updates[`pairs/${oldHash}`] = null;
        updates[`pairs/${codeHash}`] = { uid: staff.uid, createdAt: Date.now(), expiresAt };
        updates[`pairByUid/${staff.uid}`] = codeHash;
        await base.update(updates);
        hanaJson(res, 200, { ok: true, code, expiresAt }); return;
      }

      /* ══ 훑기가 「살아 있다」고 알린다 (2026-08-30) ══════════════════════
         ⚠★ 찾은 것이 없어도 «반드시» 온다. 이것이 없으면 서버는
            「폰이 죽었다」와 「문자가 안 왔다」를 못 가른다 —
            2026-08-30 에 대표가 「문자 여전히 안 들어온다」고 했을 때
            그 둘을 못 갈라, 할 수 있는 말이 「알림 권한을 다시 보세요」뿐이었다.
         ★ requireHanaDevice 가 lastSeenAt 을 찍어 준다 — 열쇠가 살아 있다는 뜻이다.
           여기서는 «훑기가 돌았다»는 것과 «문자함을 읽을 수 있나»를 더 적는다. */
      if (action === "sweepPing") {
        const linked = await requireHanaDevice(req, body);
        /* ★★ 「폰에 문자가 있기는 한가」를 폰이 «직접» 알려 준다 (2026-08-30).
           이것이 없어서 2026-08-30 에 답을 못 했다 — 대기함이 비었을 때
           「폰이 못 보낸 것」인지 「폰에 아예 없는 것」인지 가릴 길이 없었다.
           둘은 고칠 곳이 아주 다르다(앱·권한 vs 은행 문자 자체). */
        /* ★★ 「사람이 눌러서」 온 것과 「폰이 스스로」 온 것을 가른다 (2026-08-31).
           lastSweepAt 은 «폰이 15분마다 스스로 돈다»는 뜻이다. 사람이 앱에서
           「지난 문자 가져오기」를 눌러 온 것으로 그 자국을 찍으면, 절전에 재워져
           한 번도 안 도는 폰이 화면에서 «멀쩡»해 보인다 — 그러면 절전을 영영 못 짚는다.
           나머지(판 번호·권한·본 통수)는 손으로 눌렀어도 그대로 참이라 함께 적는다. */
        const byHand = body.byHand === true;
        await hanaDeviceRef(linked).update({
          ...(byHand ? {} : { lastSweepAt: Date.now() }),
          /* 사람이 눌렀으면 「지난 문자를 끌어왔다」로 남긴다 — 찾은 것이 0통이어도
             그렇다. 안 남기면 화면이 「앱에서 눌러 주세요」를 영영 되풀이한다. */
          ...(byHand ? { lastHistoryAt: Date.now() } : {}),
          lastTalkAt: Date.now(),
          appVersion: String(body.appVersion || "").slice(0, 16),
          sweepFound: Number(body.foundCount || 0),
          sweepNewestAt: Number(body.newestAt || 0),
          /* 문자함 권한이 없으면 훑기는 돌아도 «아무것도 못 줍는다» —
             그 상태를 화면이 알아야 「권한을 주세요」라고 짚어 줄 수 있다. */
          sweepCanReadSms: body.canReadSms === true,
          /* ★★ 「문자함을 끝까지 읽었나」 (코덱스 지적 2026-08-30).
             권한이 있어도 조회가 튕길 수 있다. 그때 sweepFound 는 0 으로 오는데,
             예전 화면은 그걸 「폰에 하나 문자가 아예 없습니다」로 단정해 읽었다 —
             그 한마디에 대표는 엉뚱하게 은행 쪽을 뒤지게 된다.
             ⚠ 옛 판(1.8.0 이하)은 이 값을 안 보낸다. 안 보내면 «모름»으로 두고,
                화면은 없다고 «단정하지 않는다» (undefined 로 남긴다). */
          ...(typeof body.readOk === "boolean" ? { sweepReadOk: body.readOk } : {}),
          /* 상한에 닿았나 — 닿았으면 그보다 오래된 거래가 폰에 더 남아 있다. */
          sweepCapped: body.capped === true,
          /* ★★ 「절전이 풀렸나」를 폰이 «직접» 말한다 (2026-08-31).
             이것이 없어서 「절전 예외를 누르셨습니까」를 두 번 묻고 두 번 다 답을
             못 받았다 — 폰이 이미 아는 것을 사람에게 묻고 있었던 것이다.
             ⚠ 옛 판은 안 보낸다. 안 보내면 «모름»으로 둔다(거짓으로 치면 안 된다). */
          ...(typeof body.batteryFree === "boolean"
            ? { sweepBatteryFree: body.batteryFree } : {}),
        }).catch(() => {});
        hanaJson(res, 200, { ok: true, pong: true }); return;
      }

      if (action === "pairStatus") {
        const snap = await base.child(`devices/${staff.uid}`).once("value");
        const devices = Object.values(snap.val() || {}).map((d) => ({
          deviceName: String(d.deviceName || "휴대폰"),
          pairedAt: Number(d.pairedAt || 0),
          lastSeenAt: Number(d.lastSeenAt || 0),
          lastOkAt: Number(d.lastOkAt || 0),
          lastSkip: (d.lastSkip && d.lastSkip.reason)
            ? { reason: String(d.lastSkip.reason), at: Number(d.lastSkip.at || 0) } : null,
          /* 「열쇠가 죽어 거절했다」 — 화면이 「앱이 없다」와 가르는 데 쓴다. */
          lastReject: (d.lastReject && d.lastReject.at)
            ? { reason: String(d.lastReject.reason || "bad_token"), at: Number(d.lastReject.at || 0) } : null,
          /* 「지난 문자를 끌어온 적이 있다」 — 살아 있음(lastOkAt)과 다른 말이다.
             이걸 안 보내면 화면이 이미 한 일을 또 시킨다. */
          lastHistoryAt: Number(d.lastHistoryAt || 0),
          /* 「폰이 15분마다 스스로 훑고 있다」 — 알림이 도는 것(lastOkAt)과 다른 말이다.
             이것이 최근이면 폰은 살아 있다. 그러면 「문자가 안 온 것」이지
             「폰이 죽은 것」이 아니라고 화면이 짚어 줄 수 있다. */
          lastSweepAt: Number(d.lastSweepAt || 0),
          sweepCanReadSms: d.sweepCanReadSms === true,
          /* 「폰이 마지막으로 말을 건 때」 — 무엇이 담겼는지와 상관없다.
             중복만 잔뜩 보냈어도 이 값은 최근이다. 그것이 살아 있다는 뜻이다. */
          lastTalkAt: Number(d.lastTalkAt || 0),
          /* 폰에 깔린 «판». 이것이 없어서 「새 앱을 깔았나」를 못 물었다. */
          appVersion: String(d.appVersion || ""),
          /* 폰이 문자함에서 «본» 것 — 0 이면 폰에 하나 문자가 아예 없다는 뜻이다. */
          sweepFound: Number(d.sweepFound || 0),
          /* ★ 「끝까지 읽었나」. null 이면 «모름»이다 — 옛 판이 안 보낸 것.
               화면은 참일 때만 「폰에 문자가 없다」고 말할 수 있다. */
          sweepReadOk: typeof d.sweepReadOk === "boolean" ? d.sweepReadOk : null,
          sweepCapped: d.sweepCapped === true,
          /* ★ 「절전이 풀렸나」. null 이면 «모름»(옛 판이 안 보낸 것)이다 —
               모름을 「절전 켜짐」으로 읽으면 멀쩡한 폰에 없는 고장을 씌운다. */
          sweepBatteryFree: typeof d.sweepBatteryFree === "boolean" ? d.sweepBatteryFree : null,
          sweepNewestAt: Number(d.sweepNewestAt || 0),
          /* 메시지 앱이 «아닌» 곳에서 온 마지막 알림 — 하나원큐 같은 은행 앱 푸시.
             이 값이 채워지면 「입금이 앱 푸시로 온다」는 것이 기록으로 확인된 것이다. */
          lastPkg: String(d.lastPkg || ""),
          disabled: d.disabled === true,
        }));
        hanaJson(res, 200, { ok: true, devices }); return;
      }

      if (action === "pairReset") {
        // 휴대폰 연결만 해제한다. 아직 ERP로 가져오지 않은 거래와 이미 가져온
        // 이력은 회계자료이므로 기기 재연결 과정에서 함께 지우면 안 된다.
        const activePair = await base.child(`pairByUid/${staff.uid}`).once("value");
        const activeHash = String(activePair.val() || "");
        const updates = {};
        updates[`devices/${staff.uid}`] = null;
        updates[`pairByUid/${staff.uid}`] = null;
        if (/^[a-f0-9]{64}$/.test(activeHash)) updates[`pairs/${activeHash}`] = null;
        await base.update(updates);
        hanaJson(res, 200, { ok: true }); return;
      }

      if (action === "list") {
        /* ★★ 예전에는 «최근 200건을 먼저 자른 뒤» 대기중을 걸렀다 (코덱스 지적 2026-08-30).
             그러면 최근 200건이 모두 처리완료일 때 그보다 «오래된 대기 거래»가
             영영 안 나온다 — 서버에는 남아 있는데 화면은 「새 거래문자 없음」만 말한다.
             한 번 그 자리에 빠진 거래는 스스로 되돌아올 길이 없다.
           ★ 그래서 «거른 뒤에» 자른다. 대기중만 골라 «오래된 것부터» 200건.
           ⚠ 자르고 남은 것이 있으면 그 수를 함께 보낸다 — 안 보내면 화면이
             「다 가져왔다」고 잘못 말한다. 한 번 더 부르면 그다음 200건이 온다.
           ⚠ 통째로 읽는다 — status 로 물으려면 콘솔 규칙에 색인이 있어야 하는데 없다.
             대기함은 처리해도 지워지지 않고 imported 로 바뀔 뿐이라 계속 늘어난다.
             커지면 색인을 넣거나 오래된 imported 를 «옮긴다» — 회계기록이라 지우지 말 것. */
        const snap = await base.child(`inbox/${staff.uid}`).once("value");
        const pending = Object.values(snap.val() || {})
          .filter((x) => x && x.status === "pending")
          .sort((a, b) => Number(a.receivedAt || 0) - Number(b.receivedAt || 0));
        const LIST_MAX = 200;
        const more = Math.max(0, pending.length - LIST_MAX);
        const items = pending.slice(0, LIST_MAX)
          .map((x) => ({
            id: String(x.id || ""), src: x.src === "card" ? "card" : "bank",
            type: x.type === "expense" ? "expense" : "income", date: String(x.date || ""),
            amount: Number(x.amount || 0), balance: Number(x.balance || 0), memo: String(x.memo || ""),
            note: String(x.note || ""), receivedAt: Number(x.receivedAt || 0),
            /* 적어 두고도 안 보내면 화면의 cancel 은 늘 거짓이 된다. */
            cancel: x.cancel === true,
          }));
        hanaJson(res, 200, { ok: true, items, more }); return;
      }

      if (action === "ack") {
        const ids = Array.isArray(body.ids) ? body.ids.slice(0, 200).map(String) : [];
        const batchId = String(body.batchId || "").slice(0, 120);
        const updates = {};
        ids.forEach((id) => {
          if (/^[a-f0-9]{64}$/.test(id)) {
            updates[`${id}/status`] = "imported";
            updates[`${id}/batchId`] = batchId;
            updates[`${id}/importedAt`] = Date.now();
          }
        });
        if (Object.keys(updates).length) await base.child(`inbox/${staff.uid}`).update(updates);
        hanaJson(res, 200, { ok: true, count: ids.length }); return;
      }

      if (action === "review") {
        const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
        const updates = {};
        items.forEach((item) => {
          const id = String((item && item.id) || "");
          if (!/^[a-f0-9]{64}$/.test(id)) return;
          const alertKey = hanaAdminAlertKey(staff.uid, id);
          const officeStatus = ["matched", "missing", "ambiguous"].includes(item.officeStatus)
            ? item.officeStatus : "unknown";
          updates[`${alertKey}/officeStatus`] = officeStatus;
          updates[`${alertKey}/matchedId`] = String(item.matchedId || "").slice(0, 120);
          updates[`${alertKey}/companyName`] = String(item.companyName || "").slice(0, 160);
          updates[`${alertKey}/reviewedAt`] = Date.now();
          updates[`${alertKey}/reviewedBy`] = staff.uid;
          updates[`${alertKey}/status`] = officeStatus === "missing" ? "office_missing" : "pending_review";
        });
        if (Object.keys(updates).length) await base.child("adminAlerts").update(updates);
        hanaJson(res, 200, { ok: true, count: items.length }); return;
      }

      hanaJson(res, 400, { ok: false, error: "알 수 없는 작업입니다." });
    } catch (err) {
      console.error("hanaMessageBridge:", action || "(없음)", String((err && err.message) || err));
      hanaJson(res, err.status || 500, { ok: false, error: err.message || "문자 연결을 처리하지 못했습니다." });
    }
  });

/* ══════════ 다음메일함 통째 동기화 (대표 지시 2026-08-24) ══════════
   "다음 370-6@daum.net 에 있는 메일을 모두 동기화 시켜달라."

   ⚠ 급여자료를 줍는 receivePaydataMail 과 **다른 일**이다. 그것은 「급여자료」
     폴더 하나에서 첨부만 담는 기계고, 이것은 메일함 자체를 앱에서 보려는 것이다.
     두 기능이 같은 계정에 붙지만 서로를 건드리지 않는다 — 이쪽은 readOnly 라
     읽음 표시조차 바꾸지 않는다.

   실제 코드는 mail-sync.js 에 있다. index.js 를 더 키우지 않기 위해서다.
   총괄관리자만 볼 수 있다(함수 안에서 uid_roles 로 다시 따진다). */
const MSYNC = require("./mail-sync")({
  functions, getDatabase, getAuth, MD, MAIL_REGION,
  setCors, requireStaff, mailUserAsync, mailPass,
  /* 메일 첨부를 급여데이터함 대기 칸으로 — 서버가 «스스로 훑을 때»와 같은 길이다.
     ⚠ 여기서 새로 짓지 않는다. 갈래가 둘이 되면 한쪽만 고쳐, 손으로 넘긴 것만
       임자를 못 찾거나 창고 자리가 달라지는 일이 생긴다. */
  payMailStore: async (att, mail) => {
    const db = getDatabase();
    await payMailKnownList(db);
    return payMailStoreOne(db, getStorage().bucket(PAYDATA_BUCKET), att, mail);
  },
});
exports.syncMailbox = MSYNC.syncMailbox;
exports.pullMailbox = MSYNC.pullMailbox;
exports.readMailMessage = MSYNC.readMailMessage;
exports.readMailAttachment = MSYNC.readMailAttachment;
exports.searchMailbox = MSYNC.searchMailbox;
exports.mailAttToPaydata = MSYNC.mailAttToPaydata;
exports.moveMailMessages = MSYNC.moveMailMessages;
exports.manageMailFolder = MSYNC.manageMailFolder;
exports.flagMailMessages = MSYNC.flagMailMessages;
