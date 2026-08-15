// 푸른노무법인 — 급여명세서 메일 발송 함수
// Resend API 키는 functions/.env 의 RESEND_API_KEY 에서 읽습니다 (코드에 직접 넣지 않음).

const functions = require("firebase-functions/v1");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
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
// 명함첩 자료 메일 보내기 — 다음메일(smtp.daum.net)로 대신 보낸다
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

// 보내는 주소. 비밀이 아니므로 **명함첩 화면(자료함 → 메일 본문)에서 넣는다** —
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
// 예약해 둔 메일 보내기 — 5분마다 서버가 스스로 깨어난다
// ════════════════════════════════════════════════════════════════════════════
// 예전에는 화면(브라우저)이 때를 재고 있었다. 창을 닫으면 안 나갔다 —
// 「예약했는데 안 갔다」가 되는 자리라 서버로 옮긴다(대표 지시 2026-08-10).
//
// ⚠ 5분마다 도므로 정확히 그 분에 나가지는 않는다. 최대 5분 늦는다.
//   1분마다 돌리면 그만큼 요금이 붙고, 메일은 5분 늦어도 탈이 없다.
// ⚠ 꺼낼 때 먼저 「보내는 중」으로 찜하고 보낸다. 안 그러면 앞 회차가 아직
//   보내는 중인데 다음 회차가 같은 것을 또 집어 두 통이 나간다.
// ═══ 여러 곳에 「한 통씩」 보내기 (2026-08-15, 대표 지시: 300곳 미만) ═══
// ⚠ 여기서는 **보내지 않는다.** 받는 곳마다 예약 한 건씩을 자리에 담아 두기만 하고,
//   실제 발송은 이미 돌고 있는 sendScheduledMail 이 5분마다 20통씩 빼 간다.
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
  .pubsub.schedule("every 5 minutes")
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
  };
  return photoDb;
}

// photos-migrate.js 가 기대하는 bucket 모양으로 실제 Storage 를 얇게 감싼다.
// ⚠ 되읽어 확인(exists)은 메타데이터만 본다 — 전체를 다시 내려받지 않는다.
//   (클라이언트 쪽은 getDownloadURL+fetch 로 전체를 다시 받는다 — 서버는 그럴
//   필요가 없다, 대역폭을 아낀다. 설계서 5절 참고.)
function realPhotoBucket() {
  // 창고 이름은 PR #192 에서 만든 것과 반드시 같아야 한다 — pu-photos.html 이 보는 창고.
  const bucket = getStorage().bucket("pureun-erp-hrphotos");
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
      ok: true, moved: result.moved, skipped: result.skipped,
      failed: result.failed, done: result.done, ownersCount: db.ownersCount,
    });
  } catch (error) {
    console.error("migratePhotosToStorage", error && error.stack || error);
    res.status(error.status || 500).json({
      ok: false, error: String((error && error.message) || error || "사진 이사 실패"),
    });
  }
});

/* ══════════ 급여자료 메일 자동수신 (급여데이터함 5차) ══════════
   대표 결정 2026-08-14 — 「전용 자리 + 10분마다 확인」.

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

   ⚠ 담기는 자리는 공용 대기 칸(pending_shared)이다. 서버는 「누구 자리」가
     없기 때문이다. 담당자가 집어가면 자기 자리로 내려간다(앱에 이미 있는 기능). */
const MR = require("./mail-receive");

const PAYDATA_ROOT = "paydata";
const PAYDATA_BUCKET_ROOT = "pu_paydata";
const PAYDATA_BUCKET = "pureun-erp.firebasestorage.app";  // 앱(pu-paydata.html)과 같은 창고
const PAYMAIL_BOX = "급여자료";      // 다음메일에서 규칙으로 모아 두는 폴더
const PAYMAIL_UPLOADER = "_mail";    // 창고 자리 — 사람이 아니라 서버가 담았다는 표시
const PAYMAIL_MAX_PER_RUN = 30;      // 한 회차에 처리할 메일 수 — 오래 붙어 있지 않게

function payMailId() {
  return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* 아는 주소 명단을 그때그때 만든다 — 한쪽을 못 읽어도 나머지로 계속한다. */
async function payMailKnownList(db) {
  const [coSnap, dirSnap] = await Promise.all([
    db.ref("data/companies").once("value").catch(() => null),
    db.ref("data/user_dir").once("value").catch(() => null),
  ]);
  return MR.buildKnownList(coSnap && coSnap.val(), dirSnap && dirSnap.val());
}

/* 첨부 하나를 창고에 담고 공용 대기 칸에 한 줄 적는다. */
async function payMailStoreOne(db, bucket, att, mail) {
  const id = payMailId();
  const ext = MR.extOf(att.filename);
  const where = PAYDATA_BUCKET_ROOT + "/" + PAYMAIL_UPLOADER + "/pending/" + id + (ext ? "." + ext : "");
  await bucket.file(where).save(att.content, {
    contentType: att.contentType || "application/octet-stream",
    resumable: false,
  });
  const rec = MR.sharedPendingRecord({
    filename: att.filename, file: where,
    mime: att.contentType || "", bytes: att.size || (att.content && att.content.length) || 0,
    at: Date.now(), mailFrom: mail.from, mailSubject: mail.subject,
  });
  const up = {};
  up[PAYDATA_ROOT + "/pending_shared/" + id] = rec;
  await db.ref().update(up);
  return id;
}

exports.receivePaydataMail = functions
  .region(MAIL_REGION)
  .runWith({ secrets: ["DAUM_MAIL_PASSWORD"], timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("every 10 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
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
    const known = await payMailKnownList(db);

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
    try {
      let lock;
      try {
        lock = await client.getMailboxLock(PAYMAIL_BOX);
      } catch (e) {
        console.warn("receivePaydataMail: 「" + PAYMAIL_BOX + "」 폴더가 없습니다. 다음메일에서 만들어 주세요.");
        return null;
      }

      // 먼저 다 받아 둔 뒤 처리한다 — 읽는 도중에 읽음 표시를 바꾸면 목록이 흔들린다.
      const inbox = [];
      try {
        for await (const msg of client.fetch({ seen: false }, { uid: true, source: true })) {
          inbox.push({ uid: msg.uid, source: msg.source });
          if (inbox.length >= PAYMAIL_MAX_PER_RUN) break;
        }
      } finally {
        lock.release();
      }

      for (const item of inbox) {
        let parsed;
        try {
          parsed = await simpleParser(item.source);
        } catch (e) {
          console.warn("receivePaydataMail: 메일을 읽지 못했습니다", String((e && e.message) || e));
          continue;   // 읽음 표시도 하지 않는다 — 다음 회차에 다시 해 본다
        }

        const fromText = (parsed.from && parsed.from.text) || "";
        const sender = MR.senderOf(fromText);
        const subject = String(parsed.subject || "");

        if (!MR.isKnownSender(sender, known)) {
          // 모르는 곳에서 온 것 — 담지 않는다. 지우지도 않는다(폴더에 그대로 남는다).
          unknown++;
          console.log("receivePaydataMail 모르는 주소라 건너뜀:", sender || "(주소 없음)");
          await client.messageFlagsAdd({ uid: String(item.uid) }, ["\\Seen"], { uid: true });
          continue;
        }

        const atts = Array.isArray(parsed.attachments) ? parsed.attachments : [];
        for (const att of atts) {
          const chk = MR.okAttachment(att);
          if (!chk.ok) {
            skipped++;
            console.log("receivePaydataMail 첨부 건너뜀:", att.filename || "(이름 없음)", chk.why);
            continue;
          }
          try {
            await payMailStoreOne(db, bucket, att, { from: sender, subject: subject });
            took++;
          } catch (e) {
            // 한 건이 막혀도 나머지는 담는다. 읽음 표시는 아래에서 한다.
            skipped++;
            console.error("receivePaydataMail 담기 실패:", att.filename, String((e && e.message) || e));
          }
        }
        await client.messageFlagsAdd({ uid: String(item.uid) }, ["\\Seen"], { uid: true });
      }
      console.log("receivePaydataMail", { looked: inbox.length, took, skipped, unknown });
    } catch (e) {
      console.error("receivePaydataMail 실패:", String((e && e.message) || e));
    } finally {
      try { await client.logout(); } catch (_) { /* 이미 끊겼다 */ }
    }
    return null;
  });
