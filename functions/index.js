// 푸른노무법인 — 급여명세서 메일 발송 함수
// Resend API 키는 functions/.env 의 RESEND_API_KEY 에서 읽습니다 (코드에 직접 넣지 않음).

const functions = require("firebase-functions/v1");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");
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

exports.developmentAutomation = functions
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

// ══════════ 새 건의 → 관리자 폰 알림 (웹푸시 · FCM) ══════════
//  건의가 등록되면 포털이 suggestions_meta_private/{id} 에 경량 메타를 함께 적는다.
//  그 시점을 잡아 uid_roles 에서 관리자를 찾고, 그 사람들이 [🔔 폰 알림]으로 등록해 둔
//  기기 토큰(fcm_tokens/{uid}/{token})으로 알림을 보낸다.
//
//  ⚠ data 전용 메시지를 보낸다. notification 필드를 함께 실으면 브라우저가 자체 알림을
//    띄우고 firebase-messaging-sw.js 도 띄워 알림이 두 번 뜬다.
const SG_CAT_NAME = {
  erp: "푸른이알피", consult: "컨설팅 일정", cards: "명함첩",
  portal: "포털", work: "업무관리", rules: "취업규칙", etc: "기타",
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
const MS = require("./mail-send");

const DAUM_HOST = "smtp.daum.net";
const DAUM_PORT = 465;
const CARDS_ROOT = "pucards";

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

// 보내는 사람 표시 이름. 주소만 나가면 스팸으로 걸리기 쉽다.
function fromLine(u) {
  return u ? '푸른노무법인 <' + u + '>' : "";
}

// ★ 서울(asia-northeast3)에서 돈다. 다른 함수는 미국(us-central1)에 있지만 이것만 옮겼다.
//   다음메일이 **해외에서 오는 로그인을 막는** 경우가 있어서다. 비밀번호가 맞아도
//   미국에서 붙으면 「535 authentication failed」로 거절당한다.
//   덤으로 국내에서 쓰는 도구라 응답도 빠르다.
//   ⚠ 리전을 바꾸면 주소가 바뀐다 — pu-cards.html 의 MAIL_FN_URL 도 함께 고쳐야 한다.
exports.sendMaterialMail = functions
  .region("asia-northeast3")
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

    const from = await mailUserAsync();
    if (!from || !mailPass()) {
      res.status(500).json({
        ok: false,
        error: !from
          ? "보내는 주소가 비어 있습니다.\n명함첩 → 자료함 → ✉️ 메일 본문에서 「보내는 주소」를 넣어 주세요."
          : "메일 비밀번호가 아직 없습니다.\nDAUM_MAIL_PASSWORD(앱 비밀번호)를 넣고 다시 배포하세요.",
      });
      return;
    }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const db = getDatabase();

    // 첨부 — 자료 번호만 받아 서버가 직접 읽는다
    const matIds = Array.isArray(body.matIds) ? body.matIds.slice(0, 10) : [];
    const attachments = [];
    const names = [];
    for (const id of matIds) {
      if (!id || typeof id !== "string") continue;
      const [metaSnap, fileSnap] = await Promise.all([
        db.ref(CARDS_ROOT + "/materials/" + id).once("value"),
        db.ref(CARDS_ROOT + "/materialFiles/" + id).once("value"),
      ]);
      const meta = metaSnap.val();
      if (!meta) continue;                       // 지워진 자료 — 조용히 건너뛰지 않고 아래에서 알린다
      const att = MS.toAttachment(meta, fileSnap.val());
      if (!att) continue;
      attachments.push(att);
      names.push(String(meta.name || meta.fileName || "자료"));
    }
    if (matIds.length && !attachments.length) {
      res.status(400).json({ ok: false, error: "붙일 자료를 찾지 못했습니다. 자료함에서 파일을 다시 올려 주세요." });
      return;
    }
    // 고른 것 중 일부만 찾았다면 그 사실을 알린다 — 조용히 덜 보내면 다 보낸 줄 안다
    const missing = matIds.length - attachments.length;

    // ── 이번 편지에만 붙이는 파일 (내 PC 에서 고른 것) ──
    // 자료함에 없는 파일이라 화면이 내용을 함께 보낸다. 한글에서 조항을 고친
    // 계약서처럼 **이번 한 번만** 쓰는 파일이 여기로 온다.
    // ⚠ 자료함에 저장하지 않는다. 저장하면 매번 고친 사본이 자료함에 쌓인다.
    const extras = Array.isArray(body.files) ? body.files.slice(0, 10) : [];
    for (const f of extras) {
      if (!f || typeof f !== "object") continue;
      const att = MS.toAttachment({ fileName: f.name }, f.dataUrl);
      if (!att) continue;
      attachments.push(att);
      names.push(String(f.name || "첨부"));
    }

    const v = MS.validateSend({
      to: body.to, cc: body.cc, subject: body.subject, body: body.body, attachments: attachments,
    });
    if (!v.ok) { res.status(400).json({ ok: false, error: v.error }); return; }

    let nodemailer;
    try { nodemailer = require("nodemailer"); }
    catch (e) { res.status(500).json({ ok: false, error: "메일 도구를 불러오지 못했습니다: " + String(e.message || e) }); return; }

    // ★ 접속 아이디는 보내는 주소와 **다르다.**
    //   다음메일 설정 화면이 「아이디: 370-6 (접속 시 아이디)」라고 알려 준다 —
    //   @ 앞부분이다. 주소 전체로도 되는 계정이 있어, 앞부분으로 먼저 붙어 보고
    //   자격 문제로 막히면 주소 전체로 한 번 더 해 본다. 어느 쪽인지 알아내려고
    //   사람이 시험 삼아 보내 볼 일을 없앤다.
    const ids = [];
    const envId = String(process.env.DAUM_MAIL_ID || "").trim();
    if (envId) ids.push(envId);
    const local = String(from).split("@")[0].trim();
    if (local && ids.indexOf(local) < 0) ids.push(local);
    if (ids.indexOf(from) < 0) ids.push(from);

    const mail = {
      from: fromLine(from),
      // 답장은 보낸 직원에게 가게 한다 — 회사 대표주소로만 오면 누구 건인지 모른다
      replyTo: sender.email || undefined,
      to: v.to.join(", "),
      cc: v.cc.length ? v.cc.join(", ") : undefined,
      subject: v.subject,
      text: v.body,
      attachments: v.attachments.map((a) => ({
        filename: a.filename, content: a.content, encoding: a.encoding,
      })),
    };

    let lastErr = null, usedId = "";
    for (const id of ids) {
      try {
        const tx = nodemailer.createTransport({
          host: DAUM_HOST, port: DAUM_PORT, secure: true,
          auth: { user: id, pass: mailPass() },
        });
        await tx.sendMail(mail);
        usedId = id;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        // 자격 문제(EAUTH)일 때만 다른 아이디로 다시 해 본다.
        // 첨부가 크다거나 받는 주소가 틀린 것은 아이디를 바꿔도 똑같다 —
        // 그런데도 되풀이하면 같은 메일이 여러 통 나갈 수 있다.
        if (String((e && e.code) || "") !== "EAUTH") break;
      }
    }
    if (lastErr) {
      console.error("sendMaterialMail", lastErr && lastErr.message);
      // 무엇이 잘못됐는지에 따라 다음 걸음이 완전히 다르다. 뭉뚱그리면 엉뚱한 곳을 고치게 된다.
      //   EAUTH / 535 → 우리가 로그인을 못 한 것 (앱 비밀번호)
      //   550 5.1.1   → 로그인은 됐고 **받는 주소가 없는 것** (오타·없는 계정)
      //   그 밖       → 연결 문제
      const msg = String((lastErr && lastErr.message) || lastErr);
      const auth = String((lastErr && lastErr.code) || "") === "EAUTH" || /\b535\b/.test(msg);
      const noSuchUser = /\b550\b/.test(msg) || /does not exist|NoSuchUser|Recipient address rejected/i.test(msg);
      let hint;
      if (noSuchUser) {
        hint = "\n\n받는 사람 주소가 없는 주소입니다. 오타가 없는지 확인해 주세요."
             + "\n(로그인 계정 주소가 실제 메일함이 아닐 수 있습니다 — 회사 메일 주소로 보내 보세요)";
      } else if (auth) {
        hint = "\n\n비밀번호가 맞지 않습니다. 다음메일 설정 → IMAP/POP3 → 「비밀번호 확인하기」에서"
             + " 앱 비밀번호를 새로 받아 다시 넣어 주세요. (평소 로그인 비밀번호로는 안 됩니다)";
      } else {
        hint = "\n\n다음메일에서 IMAP/SMTP 사용이 켜져 있는지 확인해 주세요.";
      }
      res.status(502).json({ ok: false, error: "메일 서버가 받지 않았습니다: " + msg + hint });
      return;
    }

    // ★ 보낸 기록은 **실제로 나간 뒤** 서버가 남긴다.
    //   화면이 남기면 '보냈다는데 안 왔다'를 가릴 수 없다.
    //   개인 폴더 명함은 남기지 않는다 — 이 자리는 직원 누구나 읽는다.
    const cardId = String(body.cardId || "");
    if (cardId && !/[.#$/\[\]]/.test(cardId)) {
      try {
        await db.ref(CARDS_ROOT + "/sendLog/" + cardId).push(MS.sentLogRec({
          at: Date.now(), by: sender.email || "", to: v.to, names: names, set: body.set || "",
        }));
      } catch (e) { console.warn("sendLog", e && e.message); }
    }

    res.json({
      ok: true, sent: v.to.length, files: attachments.length, missing: missing,
      bytes: v.bytes, from: from, id: usedId,
    });
  });
