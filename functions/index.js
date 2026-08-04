// 푸른노무법인 — 급여명세서 메일 발송 함수
// Resend API 키는 functions/.env 의 RESEND_API_KEY 에서 읽습니다 (코드에 직접 넣지 않음).

const functions = require("firebase-functions/v1");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
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

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

exports.sendPayslip = functions.https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

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
    res.status(200).json({ ok: true, id: (r && r.data && r.data.id) || null, to: to });
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
