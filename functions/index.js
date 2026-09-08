// 푸른노무법인 — 급여명세서 메일 발송 함수
// Resend API 키는 functions/.env 의 RESEND_API_KEY 에서 읽습니다 (코드에 직접 넣지 않음).

const functions = require("firebase-functions/v1");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase: getRawDatabase } = require("firebase-admin/database");
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
const 브리핑부품 = require("./news-brief");
const NoticeLib = require("./notice-lib");
const { MAX_BYTES, MAX_IMAGE_BYTES, SITE_REPO, 홈페이지자리,
        올릴자리인가, 올릴그림자리인가, 사연, 올리기 } = require("./site-publish");
const { homepageUrl } = require("./homepage-fetch");
const HanaMessage = require("./hana-message");
const OntologyServerWrite = require("./ontology-write-server");

if (!getApps().length) initializeApp();

/* 관리자 SDK는 보안규칙을 건너뛴다. 자동수집·메일 함수도 빠짐없이 관찰 관문을
   지나게 getDatabase 자체를 감싼다. 기존 자료는 아직 막지 않고 위반 위치만 남긴다. */
function getDatabase() {
  return OntologyServerWrite.wrapDatabase(getRawDatabase(), { program: "functions" });
}

const RESEND_KEY = process.env.RESEND_API_KEY || "";

/* ══════════════════════════════════════════════════════════════════════════
   급여명세서가 «어디서» 나가고 «어디로» 답장이 오나 — 2026-09-05 대표 지시로 손봄
   ══════════════════════════════════════════════════════════════════════════
   ⚠ 여기는 원래 「PoC 설정 — 도메인 인증 전까지는」이라 적힌 임시 자리였다.
     그 임시가 굳어서, 근로자 메일함에는 푸른이 아닌 fairrunlabor.com 이 뜬다.

   ★ 보내는 주소를 푸른 것으로 바꾸려면 «먼저» Resend 에서 그 도메인 인증을
     마쳐야 한다(DNS 에 몇 줄 넣는 일). 인증 안 된 도메인을 넣으면 Resend 가
     메일을 통째로 거절한다 — 그래서 여기서 혼자 바꿀 수가 없다.
     인증이 끝나면 아래 한 줄만 고치고 sendPayslip 을 다시 올리면 된다.

   ★ 회신 주소(Reply-To)가 아예 없었다. 본문에는 「문의사항은 사무실로 연락
     주세요」라 써 놓고, 근로자가 회신 단추를 누르면 아무도 안 보는 곳으로 갔다.
     이것은 도메인 인증과 상관없이 지금 고칠 수 있다 — 자료 발송이 쓰는
     공용함(370-6@daum.net)으로 오게 한다. */
const FROM = process.env.PAYSLIP_FROM || "푸른노무법인 <payroll@fairrunlabor.com>";
const REPLY_TO = process.env.PAYSLIP_REPLY_TO || "370-6@daum.net";

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
  // 미리 묻기(OPTIONS)를 한 시간 담아 둔다 — 메일 한 통 열 때마다 서울까지 왕복이
  // «두 번»이었다(실측 2026-09-05: 미리 묻기 86ms + 본 요청). 브라우저 기본은 5초라
  // 조금만 쉬었다 열어도 매번 다시 묻는다. 담는 것은 「무엇을 허용하는가」뿐이고
  // 본문·토큰은 담기지 않는다(아래 Cache-Control:no-store 는 그대로 둔다).
  res.set("Access-Control-Max-Age", "3600");
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

/* ⚠⚠ 열쇠가 «이 PC 의 파일»에만 있었다 — 저장소 어디에도 functions/.env 가 없다.
     그 상태로 sendPayslip 을 다시 올리면 RESEND_API_KEY 가 지워져
     급여명세서 발송이 «통째로» 멎는다. 지뢰다.
     그래서 파이어베이스 비밀값으로 옮긴다 — 계정·PC 가 바뀌어도 살아 있다.
     대표님이 한 번만: firebase functions:secrets:set RESEND_API_KEY --project pureun-erp
     (이알피 아이디·비밀번호를 넣으신 것과 같은 방법이다.) */
exports.sendPayslip = functions
  .runWith({ secrets: ["RESEND_API_KEY"] })
  .https.onRequest(async (req, res) => {
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

  /* ★ 열쇠는 «부를 때» 읽는다. 파일 맨 위에서 한 번만 읽으면, 비밀값이 나중에
       붙은 판에서는 영영 빈 채로 남는다. */
  const 열쇠 = process.env.RESEND_API_KEY || RESEND_KEY;
  if (!열쇠) {
    res.status(500).json({ ok: false, error:
      "메일 열쇠가 서버에 없습니다. 대표님이 한 번만 넣어 주세요:\n" +
      "firebase functions:secrets:set RESEND_API_KEY --project pureun-erp\n" +
      "그다음: firebase deploy --only functions:sendPayslip --project pureun-erp" });
    return;
  }

  const resend = new Resend(열쇠);

  // 입력: POST 본문이 있으면 사용, 없으면(브라우저로 URL 접속 = 테스트) 샘플 발송
  const b = (req.body && typeof req.body === "object") ? req.body : {};
  /* ★ 받는 주소가 비면 «박아 둔 지메일»로 갔다 — 근로자 급여명세서가 남의 메일함으로
       갈 수 있는 길이었다. 화면에는 울타리가 있었지만 서버에는 없었다.
       울타리는 «둘 다»에 있어야 한다. 이제 없으면 안 보낸다. */
  const to = String(b.to || "").trim();
  if (!to || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) {
    res.status(400).json({ ok: false, error: "받는 사람 메일 주소가 없거나 올바르지 않습니다: " + (to || "(비어 있음)") });
    return;
  }
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
    /* 근로자가 «회신»을 누르면 우리 공용함으로 오게 한다 — 본문에 「연락 주세요」라고
       써 놓고 답장 갈 곳이 없으면 그 말이 거짓말이 된다. */
    if (REPLY_TO) payload.reply_to = REPLY_TO;
    if (atts && atts.length) payload.attachments = atts;
    const r = await resend.emails.send(payload);
    if (r && r.error) {
      res.status(500).json({ ok: false, error: r.error });
      return;
    }
    /* 보낸 사람·나간 주소·회신 주소를 함께 돌려준다 — 화면이 «교부 기록»을
       남길 때 쓴다. 임금명세서 교부는 근기법 §48② 의무인데, 기록이 없으면
       나중에 「안 받았다」는 말에 내놓을 것이 없다. */
    res.status(200).json({ ok: true, id: (r && r.data && r.data.id) || null, to: to,
                           by: (sender && sender.email) || "",
                           from: FROM, replyTo: REPLY_TO });
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
/* 보내는 주소에 맞는 열쇠를 준다 (2026-09-05).
   ⚠ 주소를 «안 주면» 다음메일 것이다 — 메일을 «받는» 길(IMAP)은 다음메일뿐이라
     그쪽은 예전 그대로 부른다. 보내는 쪽만 주소를 보고 고른다. */
function mailPass(from) {
  if (from) {
    const 이름 = MD.우체국고르기(from).열쇠이름;
    return String(process.env[이름] || "");
  }
  return String(process.env.DAUM_MAIL_PASSWORD || "");
}

// ★ 서울(asia-northeast3)에서 돈다. 다른 함수는 미국(us-central1)에 있지만 메일만 옮겼다.
//   다음메일이 **해외에서 오는 로그인을 막는** 경우가 있어서다. 비밀번호가 맞아도
//   미국에서 붙으면 「535 authentication failed」로 거절당한다.
//   덤으로 국내에서 쓰는 도구라 응답도 빠르다.
//   ⚠ 리전을 바꾸면 주소가 바뀐다 — pu-cards.html 의 MAIL_FN_URL 도 함께 고쳐야 한다.
const MAIL_REGION = "asia-northeast3";
exports.sendMaterialMail = functions
  .region(MAIL_REGION)
  .runWith({ secrets: ["DAUM_MAIL_PASSWORD", "GOOGLE_MAIL_PASSWORD"], timeoutSeconds: 120, memory: "512MB" })
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
      db: db, body: body, from: from, pass: mailPass(from),
      envId: process.env.DAUM_MAIL_ID, byEmail: sender.email || "",
      /* 💻 내 PC 파일이 창고를 거쳐 온다 (2026-08-31) — 창고를 열 길(deps)과
         「누구 자리인가」(uid)가 있어야 꺼낸다. 빠뜨리면 큰 첨부가 조용히 빠진다. */
      deps: { getStorage: getStorage }, uid: sender.uid || "",
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
  .runWith({ secrets: ["DAUM_MAIL_PASSWORD", "GOOGLE_MAIL_PASSWORD"], timeoutSeconds: 540, memory: "512MB" })
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
        /* 통이 «다른 주소로 나가고 싶다»고 적어 두었으면 그것을 쓴다 — 뉴스레터가
           원본과 같은 주소(370-6@hanmail.net)에서 나가게 하려고 붙였다.
           ⚠ 조이는 것은 여기서 한다 — 사서함 이름이 계정과 같고 도메인이
             daum.net/hanmail.net 인 것만 통과한다. 아니면 조용히 계정 주소로 보낸다.
             화면이 담은 값을 그대로 믿으면 남의 이름으로 보내는 길이 된다. */
        const 이통from = MB.보내는주소고르기(row.fromWish, from);
        const r = await MD.deliver({
          db: db,
          body: Object.assign({}, row.payload || {}, { wasScheduled: true }),
          from: 이통from, pass: mailPass(이통from),
          envId: process.env.DAUM_MAIL_ID,
          byEmail: row.by || "",
          /* ★ 창고를 열 길 — 없으면 첨부가 «조용히 빠진 채로» 나간다
               (대표 결정 2026-09-06 「첨부도 붙인다」).
             ⚠ uid 는 안 넘긴다. 예약 발송은 사람이 없는 자리에서 도므로
               「내 자리(mailout)」라는 것이 없다 — 서버가 받아 둔 자료(ilabor)만
               붙는다. 그것이 맞다: 임시 파일은 그 사람 화면의 것이다. */
          deps: { getStorage: getStorage },
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
  /* 푸른이알피 계약·컨설팅·사건도 함께 읽는다 (대표 결정 2026-09-06) —
     업체관리에 없는 업체 담당자 주소가 그쪽에 있다. 받은메일함을 켜도
     그 주소들이 「모르는 사람」이면 켠 보람이 없다.
     ⚠ 못 읽어도 그냥 지나간다(null) — 명단이 좁아질 뿐 메일 받기가 멈추지 않는다. */
  const [coSnap, dirSnap, ctSnap, csSnap, caSnap] = await Promise.all([
    db.ref("data/companies").once("value").catch(() => null),
    db.ref("data/user_dir").once("value").catch(() => null),
    db.ref("data/contracts/v").once("value").catch(() => null),
    db.ref("data/consultings/v").once("value").catch(() => null),
    db.ref("data/cases/v").once("value").catch(() => null),
  ]);
  const cos = coSnap && coSnap.val();
  const erp = [ctSnap && ctSnap.val(), csSnap && csSnap.val(), caSnap && caSnap.val()];
  const list = MR.buildKnownList(cos, dirSnap && dirSnap.val(), erp);
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
      /* 폴더마다 제 몫 — 앞 폴더가 다 먹으면 뒤 폴더는 열리지도 않는다 */
      const share = MR.boxShare(PAYMAIL_MAX_PER_RUN, boxes.length);
      for (const box of boxes) {
        const room = Math.min(share, PAYMAIL_MAX_PER_RUN - inbox.length);
        if (room <= 0) break;
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
          /* ★ 번호만 먼저 받아 «뒤에서» 몫만큼 고른다 (2026-09-06).
             바로 fetch 하면 오래된 것부터 와서, 이미 처리한 옛 메일이 몫을
             다 먹고 새 메일에 영영 닿지 못한다 — 8/26 뒤로 한 통도 안 들어온
             까닭이 이것이었다. 번호만 받는 것은 본문을 안 끌어서 가볍다. */
          let uids = [];
          try {
            uids = await client.search({ since: since }, { uid: true });
          } catch (e) {
            console.warn("receivePaydataMail: 「" + box + "」 목록을 못 받았습니다",
              String((e && e.message) || e));
          }
          const want = MR.newestUids(uids, room);
          if (want.length) {
            for await (const msg of client.fetch(want,
              { uid: true, source: true, envelope: true }, { uid: true })) {
              inbox.push({ uid: msg.uid, source: msg.source, box: box,
                messageId: (msg.envelope && msg.envelope.messageId) || "" });
              if (inbox.length >= PAYMAIL_MAX_PER_RUN) break;
            }
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
        /* ── 어느 사업장 것인가 (대표 목표 2026-08-30) ──
           세 갈래 **모두**에 붙인다. 「지난 회차」·「모르는 주소」 갈래는 배달을
           안 타므로, 여기서 안 붙이면 그 메일들만 사업장 없이 남는다 —
           사업장별로 모아 볼 때 통째로 빠진다.
           ⚠ 배달과 **같은 함수**(companyOf)를 쓴다. */
        const pick = MR.companyOf(
          { from: who, subject: subject },
          payMailKnownCache.index, payMailKnownCache.cos);
        const co = pick.co || null;
        return {
          key: mkey,
          soft: m.soft === true,
          rec: MR.mailLogRecord({
            from: who, subject: subject, body: MR.bodyTextOf(parsed),
            box: item.box, at: parsed.date ? +new Date(parsed.date) : Date.now(),
            atts: Array.isArray(parsed.attachments) ? parsed.attachments.length : 0,
            took: m.took || 0, seatName: m.seatName || '',
            shared: m.shared === true, why: m.why || '', old: m.old === true,
            companyId: co ? co.id : '', companyName: co ? co.name : ''
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
    // ⑤ 한 번 불렀다 — 세어 둔다(대표 물음 2026-09-08). 숫자만 담는다.
    await bumpReadTally(v.app, r.ok ? "n" : (DR.dailyQuotaGone(r.why) ? "quota" : "n"));
    if (!r.ok) {
      /* ⚠ 상태를 **그대로** 돌려준다. 브라우저의 재시도·모델 갈아타기 판단이
         이 숫자를 보고 움직인다(429 면 잠시 뒤, 403 이면 곧바로 포기). */
      res.status(r.status && r.status >= 400 ? r.status : 502)
        .json({ ok: false, error: r.why || "AI가 응답하지 않습니다.", status: r.status || 0 });
      return;
    }
    res.json({ ok: true, reply: r.json });
  });

/* ⑤ 판독을 몇 번 불렀나 — 앱별로 센다 (대표 물음 2026-09-08 「판독 한도 어떻게 해결할까」).
   여태 세는 곳이 «아예 없어» 「사진첩이 다 썼나 경력관리가 다 썼나」를 알 수 없었다.
   ⚠ **판독을 막지 않는다.** 세다 실패해도 그냥 넘어간다 — 세는 일 때문에 읽기가
     멈추면 그것이 훨씬 큰 손해다. 그래서 await 하되 catch 로 삼킨다.
   ⚠ 담는 것은 **숫자뿐**이다. 사진·글·사람 이름은 한 글자도 안 담는다. */
async function bumpReadTally(app, kind, howMany) {
  /* ⚠ 몇을 더할지 받는다 — Vision 은 «장 수»로 값을 받으므로 한 번에 여러 장이면
       그만큼 더해야 한다. 안 받으면 1 이다(Gemini 는 요청 수로 센다). */
  const 더할것 = Math.max(1, Math.round(Number(howMany) || 1));
  try {
    const db = getDatabase();
    /* ⚠⚠ «admin 을 거치는» ServerValue.increment 를 쓰지 말 것 — **이 파일에 admin
         변수가 없다.** 이 저장소는 firebase-admin 을 낱개로 불러 쓴다(getDatabase 등).
         2026-09-03 뉴스레터 열람 셈이 바로 그것으로 매번 터졌고, catch 가 조용히
         삼켜 «기록만 안 남았다» — 화면으로는 알 수 없었다.
       ★ 그래서 «거래»로 올린다. 불러올 것이 없고, 넷이 같은 때 불러도 안 어긋난다. */
    await Promise.all(DR.tallyPaths(app, null, kind).map(function (p) {
      return db.ref(p).transaction(function (cur) { return (Number(cur) || 0) + 더할것; });
    }));
  } catch (e) {
    console.warn("판독 셈 적기 실패(판독은 계속):", String((e && e.message) || e));
  }
}

// ══════════ 글자만 뽑는 판독 — Google Cloud Vision (2026-09-08) ══════════
// 대표 물음 「OCR 을 무료로 쓸 수 있는 곳이 더 있나」
//
// ★★ Vision 의 무료 몫은 «달마다 1,000장»이고 Gemini 의 하루 몫과 «따로»다.
//   그래서 Gemini 가 하루 몫을 다 쓴 날에도 이쪽은 살아 있다.
//   pu-erp.html 에 부르는 코드가 «이미» 있었는데 열쇠가 없어 한 번도 안 돌았다.
//
// ★★★ 왜 서버가 열쇠를 드나 — 브라우저에 두면 «누구나 복사할 수 있다».
//   그 설정 칸은 열쇠를 공용 DB(data/vision_api_key)에 담게 되어 있었고,
//   그 자리는 재직 직원 누구나 읽는다. enter.html 이 스스로 「유료 키는 여기 두지
//   않습니다」라고 적어 두고도 그 칸이 남아 있었다 — 2026-09-08 에 닫았다.
//   ⚠ 열쇠를 브라우저로 «돌려주지 않는다». 여기서 쓰고 여기서 버린다.
//
// ⚠ Vision 은 «글자만» 준다. 「이 열 자리가 사업자번호다」는 우리 파서가 한다.
//   그래서 Gemini 를 대신하는 것이 아니라 «글자 뽑기»만 대신한다.
const VR = require("./vision-read");

/* 열쇠는 금고(Secret Manager)에서만 온다 — 실시간DB 갈래를 «만들지 않는다».
   ⚠ Gemini 쪽에는 옛 다리(RTDB)가 남아 있지만, 그것은 옮기는 동안의 임시였다.
     같은 실수를 새로 하지 않는다 — DB 에 둔 열쇠는 직원 누구나 읽는다.
   ⚠ 자리 채우개('unset' 등)를 «없는 것»으로 본다. 금고에 비밀이 있어야 함수가
     배포되므로 자리만 먼저 만들어 두는데, 그 값으로 구글을 부르면 403 만 받는다. */
function readVisionKey() {
  const k = String(process.env.VISION_KEY || "").trim();
  if (!k || k === "unset" || k.length < 20) return "";
  return k;
}

exports.readVision = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: ["VISION_KEY"] })
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

    const v = VR.validate((req.body && typeof req.body === "object") ? req.body : {});
    if (!v.ok) { res.status(400).json({ ok: false, error: v.error }); return; }

    /* ★★ 열쇠 «없이» 부르는 것이 본길이다 (2026-09-08).
         이 서버에는 «자기 신분증»이 있다(App Engine 기본 서비스 계정) — 그것으로
         부르면 만들 열쇠도, 넣을 열쇠도, 새어 나갈 열쇠도 없다.
         그래서 대표님이 하실 일이 «API 켜기 한 번»으로 줄어든다.
       ⚠ 열쇠가 금고에 «들어 있으면» 그것을 먼저 쓴다 — 신분증 길이 막히는 자리가
         있을 수 있고, 그때 통째로 멎으면 안 된다. */
    let auth = null;
    const key = readVisionKey();
    if (key) auth = { key: key };
    else {
      try {
        auth = { token: await VR.fetchSaToken(fetch) };
      } catch (e) {
        /* ⚠ 「고장」이 아니라 «무엇이 안 됐는지»로 말한다 — 부르는 쪽은 이 말을 보고
             브라우저 판독(Tesseract)으로 물러선다. 고장으로 말하면 그 길을 못 찾는다. */
        console.warn("Vision 신분증 실패:", String((e && e.message) || e));
        res.status(503).json({ ok: false,
          error: "Vision 을 부를 자격을 얻지 못했습니다 — 브라우저 판독으로 대신합니다." });
        return;
      }
    }

    const r = await VR.callVision(fetch, auth, v.images, null);
    /* ⑤ 세어 둔다 — Gemini 와 «갈라» 센다(몫이 다른 곳이다).
       ⚠⚠ Vision 은 «장 수»로 값을 받는다(요청 수가 아니다). 그래서 한 번에 1을
         더하면 여러 장 보낸 날의 셈이 실제보다 적게 나오고, 「달 몫 1,000장 가운데
         얼마 남았나」가 틀린다 — 읽어낸 «쪽 수»만큼 더한다.
       ⚠ 실패는 «안 센다» — API 가 안 켜졌거나 자격이 없어 막힌 것은 몫을 안 먹는다.
         Gemini 쪽이 실패까지 세는 것은 그쪽 429 가 «실제로 몫을 먹기» 때문이다. */
    if (r.ok) await bumpReadTally(v.app, "vision", r.pages || 1);
    if (!r.ok) {
      res.status(r.status && r.status >= 400 ? r.status : 502)
        .json({ ok: false, error: r.why || "Vision이 응답하지 않습니다.", status: r.status || 0 });
      return;
    }
    /* ⚠ 글«만» 돌려준다 — 좌표·낱글자까지 돌려주면 수 MB 가 되고, 쓰는 곳도 없다. */
    res.json({ ok: true, text: r.text, pages: r.pages });
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
  const ok = PV.decide(item);
  if (!ok.ok) return ok;
  /* ⚠ 자격(as)과 사진 정보(item)를 «함께» 돌려준다 — 열람 기록에 「무슨 자격으로
     무슨 서류를 봤나」를 적어야 하는데, 여기서 버리면 밖에서 다시 읽어야 한다.
     같은 것을 두 번 읽는 셈이고, 그 사이에 값이 달라질 수도 있다. */
  return { ok: true, as: seen.as, item: item };
}

/* 열람 기록 한 줄 — 민감 서류 원본을 «실제로 내준 뒤에» 적는다.
   ⚠ 내주기 «전»에 적으면 창고에 원본이 없어 실패한 것까지 「봤다」로 남는다.
   ⚠ 적기가 실패해도 **사진은 이미 나갔다.** 여기서 throw 하면 안 된다 —
     기록 때문에 일이 막히는 것이 기록이 없는 것보다 나쁘다. 대신 서버 기록에 남긴다. */
async function photoNoteView(decoded, v, gate) {
  try {
    const item = (gate && gate.item) || {};
    const read = item.read || {};
    const fields = read.fields || {};
    const row = PV.logRow({
      byUid: decoded.uid,
      byName: decoded.name || decoded.email || "",
      as: gate && gate.as,
      owner: v.owner, year: v.year, id: v.id,
      kind: read.kind || "",
      who: fields.name || ""
    });
    await getDatabase().ref(PV.logPath(String(Date.now()) + "_" + v.id)).set(row);
  } catch (e) {
    console.error("photoView log", e && e.message);
  }
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
      /* 내준 «뒤에» 적는다 — 기다리지 않는다(사람은 이미 사진을 받았다) */
      photoNoteView(decoded, v, gate);
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
// ════════════════════════════════════════════════════════════════════════════
// 뉴스레터 열람·클릭 추적 — newsOpen · newsClick
// ════════════════════════════════════════════════════════════════════════════
// 대표 지시 2026-09-03: 「상대방에게 발송이 된것 과 수신이된것 열람 미열람을 정확하게
// 확인하고 3회이상 미열람일 경우 … 미열람 사업장 제외하는 시스템이 필요하다」
// 대표 결정: 「최근5회중3회, 후보올리기」
//
// ★ 이 둘은 «누구나 부를 수 있다» — 로그인이 없다. 받는 쪽 메일 프로그램이 부르는
//   자리이기 때문이다. 그래서 «할 수 있는 일을 아주 작게» 만든다:
//     · newsOpen  — 열람 표를 하나 켜고 1×1 그림을 내준다. 그 밖에 아무것도 안 한다.
//     · newsClick — 클릭 표를 켜고, «회차에 적어 둔 목록»의 번호로 찾은 곳으로 보낸다.
//
// ⚠ 열린 리다이렉트를 막는다. 목적지를 주소로 받지 않고 «번호»로 받는다.
//   목록에 없는 번호면 어디로도 보내지 않는다(우리 홈페이지로 돌린다).
//   목적지를 그대로 받으면 누구나 우리 도메인으로 남을 속이는 링크를 만들 수 있고,
//   우리 주소라 받는 쪽이 «더 잘 믿는다»는 점이 더 나쁘다.
//
// ⚠ 아무 값이나 들어와도 «에러를 내지 않는다». 메일 프로그램이 주소를 조금씩 바꿔
//   부르는 일이 있고, 그때 500 을 내면 편지가 깨진 것처럼 보인다. 조용히 그림만 준다.
//
// ⚠ 캐시를 막는다. 캐시되면 두 번째 열람이 우리 서버에 오지 않는다.
//
// ⚠ 열람은 «완벽하지 않다» — 아웃룩·회사 메일 서버가 그림을 기본으로 막는다.
//   그래서 클릭도 함께 본다(js/pu-news-core.js 미열람판단).
const NT = require("./news-track");

/* 표를 하나 켠다.
   ⚠ 2026-09-03 여기서 크게 헤맸다. 처음에 «admin 을 거치는» ServerValue.increment 를
     썼는데 «이 파일에 admin 변수가 없다» — 이 저장소는 firebase-admin 을 낱개로
     불러 쓴다(getDatabase 등). 그래서 매번 터졌고, 아래 catch 가 조용히 삼켰다.
     그림은 200 으로 잘 나가고 «기록만 안 남았다» — 화면으로는 알 수 없었다.
     서버에 실제로 찍혔는지 물어봐서야 알았다.
   ★ 그래서 셈은 «거래»로 올린다 — 불러올 것이 없고, 두 사람이 같은 때 열어도 안 어긋난다.
   ★ 첫 때는 «처음 것만» 지킨다 — 언제 처음 열었는지가 알고 싶은 것이다.
     마지막 때는 따로 적는다. */
/* 편지에 실린 «번호»로 누구인지 찾는다.
   ★ 2026-09-03 부터 편지에는 메일 주소가 아니라 뜻 없는 번호가 실린다.
     회차마다 「번호 → 주소」 대장이 있고, 여기서 그것을 본다.
   ★ 대장에 없으면 «옛 편지»일 수 있다(번호를 쓰기 전에 나간 것).
     그때는 받은 값을 주소로 보되, «그 회차에 실제로 보낸 주소»일 때만 받는다.
     ⚠ 이 조건이 곧 위조 막이다 — 예전에는 주소만 알면 남의 표를 켤 수 있었고,
       아무 값이나 넣어 빈 줄을 끝없이 만들 수도 있었다. */
async function 누구인가(db, 회차, 받은값) {
  const 대장 = await db.ref(NT.받는이자리(회차, 받은값)).once("value");
  const 주소 = 대장.val();
  if (주소 && typeof 주소 === "string") return NT.주소열쇠(주소);
  /* 옛 편지 — 보낸 적 있는 주소만 받는다 */
  const 보냄 = await db.ref(NT.보냄표(회차, 받은값)).once("value");
  return 보냄.val() === true ? NT.주소열쇠(받은값) : "";
}

async function 추적표켜기(회차, 주소, 무엇) {
  const db = getDatabase();
  const 자리 = NT.적을자리(회차, 주소);
  const 이제 = Date.now();
  await db.ref(자리).child(무엇 + "수").transaction((cur) => (Number(cur) || 0) + 1);
  const upd = {};
  upd[무엇] = true;
  upd[무엇 + "끝때"] = 이제;
  await db.ref(자리).update(upd);
  // 첫 때는 «없을 때만» 적는다 — 처음 열었을 때를 지킨다
  await db.ref(자리).child(무엇 + "첫때").transaction((cur) => (cur == null ? 이제 : undefined));
}

exports.newsOpen = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 15, memory: "128MB" })
  .https.onRequest(async (req, res) => {
    // 캐시를 막지 않으면 두 번째 열람이 안 온다
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Content-Type", "image/gif");
    const q = NT.읽기(req.query);
    if (q.ok) {
      try {
        const 주소 = await 누구인가(getDatabase(), q.회차, q.주소);
        /* 우리가 낸 번호도 아니고 보낸 적도 없으면 «아무 일도 안 한다» */
        if (주소) await 추적표켜기(q.회차, 주소, "열람");
      } catch (e) { console.warn("newsOpen", (e && e.message) || e); }
    }
    // 무슨 일이 있어도 그림은 준다 — 깨진 그림이 보이면 편지가 이상해 보인다
    res.status(200).send(NT.빈그림);
  });

exports.newsClick = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 15, memory: "128MB" })
  .https.onRequest(async (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    const q = NT.읽기(req.query);
    let 갈곳 = "";
    if (q.ok) {
      try {
        const db = getDatabase();
        const 주소 = await 누구인가(db, q.회차, q.주소);
        /* ★ 누구인지 몰라도 «가던 길»은 보내 준다 — 표만 안 켠다.
             링크가 죽으면 받는 쪽에는 우리 잘못이 아니라 편지가 깨진 것으로 보인다. */
        if (주소) await 추적표켜기(q.회차, 주소, "클릭");
        // ★ 목적지는 «회차에 적어 둔 목록»에서 번호로 찾는다 — 주소로 받지 않는다
        const s = await db.ref("newsletter/issues/" + q.회차 + "/링크들").once("value");
        갈곳 = NT.링크찾기(s.val(), q.번호);
      } catch (e) { console.warn("newsClick", (e && e.message) || e); }
    }
    // 못 찾으면 우리 홈페이지로 — «아무 데도 안 보내는 것»이 안전한 쪽이다
    /* ⚠ 모르는 번호일 때 튕겨 보내는 자리다. 예전에는 «/pureunall/» 로 보냈는데
         그 자리에는 index 파일이 없어서 깃허브의 영어 404 가 떴다 —
         2026-09-05 에 대표께서 미리보기에서 링크를 눌러 실제로 그 화면을 보셨다.
         받는 분이 눌러도 같은 일이 난다. 문(enter.html)으로 보낸다. */
    res.redirect(302, 갈곳 || "https://nabaho.github.io/pureunall/enter.html");
  });
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

const companyWebsiteMatch = require("./company-website-match");

/* 업체 홈페이지 자동 찾기 (대표 지시 2026-09-02) — 업체관리에 홈페이지 URL이 없을 때
   회사명으로 검색해 찾아 준다. 회사명·주소가 함께 맞는 것이 있으면 자동으로 확정해
   채우고, 없으면 후보만 돌려줘 사람이 고르게 한다.
   ⚠ 검색 1등 결과를 그냥 등록하면 동명 회사·블로그·뉴스기사가 걸릴 수 있다 —
     주소까지 맞아야만 자동 확정한다(안전 쪽으로 기운 판정).

   ■ 2026-09-03 구글 → 네이버 (대표 결정 「네이버로 하자」)
     구글 Custom Search JSON API 는 신규 고객에게 닫혀 있어(공식 문서) 키가 맞아도 403.
     네이버 검색 API 두 갈래를 차례로 쓴다:
       ① 지역(업체) 검색 local — 업체명·주소·홈페이지가 «칸으로» 온다.
          우리 주소의 시/군/구가 네이버 주소 칸에 있고 홈페이지 링크가 있으면 확정.
       ② 웹문서 검색 webkr — ①이 못 찾을 때만. 제목+요약에 회사명·주소가 함께
          나오면 확정, 아니면 후보로만 보여준다. (①이 맞으면 ②는 안 부른다 —
          검색 API 합쳐 월 775,000건 한도를 아낀다. 업체 206곳을 다 돌려도 몇백 건이라
          넉넉하지만, 안 불러도 되는 것을 부르지 않는 것이 맞다.)
   ⚠★ 2026-08-31: 네이버가 검색 API 를 «옮겼다». developers.naver.com 에서는
      2026-07-31 부로 신규 신청이 끝났고(그날 쇼핑·책·전문자료 검색은 아예 종료),
      지금은 네이버 클라우드의 «NAVER API HUB» 에서 받는다.
      대표가 개발자센터에서 등록하려다 「사용 API」 목록에 «검색»이 아예 없어 막혔다.
        옛것: openapi.naver.com/v1/search/local.json  · X-Naver-Client-Id / -Secret
        새것: naverapihub.apigw.ntruss.com/search/v1/local · X-NCP-APIGW-API-KEY-ID / -KEY
      우리가 쓰는 지역·웹문서 둘은 그대로 살아 있고, 응답 칸 이름도 같다
      (그래서 company-website-match.js 는 한 줄도 안 바뀌었다).
      옛 방식은 기존 신청자에 한해 2027-06-30 까지만 돈다 — 우리는 열쇠가 없어 못 쓴다.
      공식: guide.ncloud-docs.com/docs/apihub-migration

   총괄관리자만 부를 수 있다. 열쇠 둘은 비밀값(secrets)으로만 읽는다 —
   설정: `firebase functions:secrets:set NAVER_SEARCH_CLIENT_ID` /
        `firebase functions:secrets:set NAVER_SEARCH_CLIENT_SECRET`
   (네이버 클라우드 콘솔 → All Services → Application Services → NAVER API HUB → 신청하기.
    ⚠ 이름은 그대로 두었다 — 값이 바뀌었다고 이름까지 바꾸면 등록 절차가 늘어난다) */
/* 네이버 검색이 사는 곳. 한 자리에만 적는다 — 두 곳에 적으면 한쪽만 고치는 날이 온다. */
const NAVER_HUB = "https://naverapihub.apigw.ntruss.com";

exports.findCompanyWebsite = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB", secrets: ["NAVER_SEARCH_CLIENT_ID", "NAVER_SEARCH_CLIENT_SECRET"] })
  .https.onRequest(async (req, res) => {
    setAutomationCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 허용됩니다." }); return; }

    try {
      const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!match) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
      const decoded = await getAuth().verifyIdToken(match[1], true);
      const roleSnapshot = await getDatabase().ref(`uid_roles/${decoded.uid}`).once("value");
      const role = roleSnapshot.val() || {};
      if (role.isAdmin !== true) {
        res.status(403).json({ error: "총괄관리자만 홈페이지를 검색할 수 있습니다." });
        return;
      }

      const name = String((req.body && req.body.name) || "").trim();
      if (!name) { res.status(400).json({ error: "업체명이 없습니다." }); return; }
      const address = String((req.body && req.body.address) || "").trim();

      const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
      const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        res.status(500).json({
          error: "검색 도구가 아직 설정되지 않았습니다 — NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 를 먼저 등록해 주세요.",
        });
        return;
      }

      /* 네이버 검색 한 갈래를 부른다. 실패는 상태코드째로 던져 아래 catch 가 502 로 돌려준다.
         ⚠ display 5 — 지역 검색의 최대값이 5 다(웹문서는 100 까지 되지만 맞춰 둔다).
           넘겨 보내면 지역 쪽이 400 으로 떨어진다. */
      async function naverSearch(kind, query) {
        const qs = new URLSearchParams({ query: query, display: "5" });
        const resp = await fetch(NAVER_HUB + "/search/v1/" + kind + "?" + qs.toString(), {
          headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret },
        });
        if (!resp.ok) {
          const body = await resp.text();
          console.error("[findCompanyWebsite] naver " + kind + " error", resp.status, body.slice(0, 300));
          const e = new Error("검색 서비스에서 응답을 받지 못했습니다 (" + resp.status + ")");
          e.status = 502;
          throw e;
        }
        const data = await resp.json();
        return Array.isArray(data.items) ? data.items : [];
      }

      /* ① 지역(업체) 검색 — 주소·홈페이지가 칸으로 온다 */
      const localCands = companyWebsiteMatch.naverLocalToCandidates(await naverSearch("local", name));
      let matched = companyWebsiteMatch.findLocalMatch(localCands, name, address);

      /* ② 못 찾았을 때만 웹문서 검색 */
      let webCands = [];
      if (!matched) {
        webCands = companyWebsiteMatch.naverWebToCandidates(await naverSearch("webkr", name));
        matched = companyWebsiteMatch.findMatch(webCands, name, address);
      }

      const candidates = companyWebsiteMatch.uniqueByLink(
        localCands.filter((c) => c.link).concat(webCands)
      ).map((c) => ({ title: c.title, link: c.link, snippet: c.snippet }));

      res.json({ matched: !!matched, url: matched ? matched.link : null, candidates: candidates });
    } catch (err) {
      console.error("[findCompanyWebsite]", err);
      res.status(err.status || 500).json({ error: err.message || "검색하지 못했습니다." });
    }
  });

/* 홈페이지 쪽을 «저장소에 올린다» — 대표가 단추를 눌렀을 때만 (대표 결정 2026-08-31).
   ★ 저절로 올라가지 않는다. 고치다 만 내용이 실수로 홈페이지에 나가지 않게,
     사람이 「지금 올린다」를 알고 누른다.
   ★ 무엇을 올릴지는 «화면»이 만든다. 서버는 올려 주기만 한다 —
     화면과 명령줄이 같은 부품(js/pu-site-people.js)을 써서 미리 본 것과 올라가는 것이 같다.
   ★ site/ 아래 .html 만 받는다. 그 규칙 하나로 앱 코드·검사·보안규칙·워크플로가 다 막힌다. */
/* ══════ «주간 노동 브리핑»을 공지사항에 올린다 ══════
   대표 결정 2026-08-31: 「노동뉴스 + 법령 완전자동」.
   대표 지시 2026-09-02: 「공지사항은 뉴스레터와 같이 1주일에 1개씩」.

   ★ 일이 «둘»로 갈려 있다 — 왜 그런지가 중요하다:
     ① dailyNewsCollect  날마다 아침 7:00, 제목·링크만 모아 둔다 (안 올린다)
     ② weeklyNewsBrief   월요일 아침 7:30, 모아 둔 한 주치로 한 장을 낸다
     신문사 RSS 는 최근 50개만 주는데 그것이 «이틀치»뿐이다
     (2026-09-02 실측: 50개 = 8/30~9/1). 주 1회만 읽으면 「주간」이라 이름 붙이고
     이틀치만 싣게 된다. 그래서 모으는 일과 내는 일을 갈랐다.

   ★ 기사 «본문»은 옮기지 않는다 — 제목과 원문 링크까지다(저작권).
   ★ 자동이라 사람이 못 막는다. 그래서 «안 하는 쪽»으로 기운다:
     · 못 읽으면 아무것도 안 올린다(그 주 것을 건너뛴다. 빈 공지를 올리지 않는다)
     · 이번 주 것이 이미 있으면 두 번 올리지 않는다(lastWeek)
     · 자료에 스위치를 둔다(homepage/newsBrief/off = true 면 둘 다 안 돈다)
   ★ 「사람이 보는 홈페이지」에 먼저, 우리 사본에 나중에 — publishSite 와 같은 차례다. */
const 브리핑샘 = {
  뉴스: "https://www.labortoday.co.kr/rss/allArticle.xml",
  뉴스이름: "매일노동뉴스",
  법령말: ["근로", "노동", "산업안전", "고용", "임금", "퇴직급여"]
};

/* 한글이 깨지지 않게 «바이트로» 받아서 한 번에 푼다.
   ★ 글자로 이어 붙이면 여러 바이트짜리 한글이 조각 사이에서 잘려 깨진다
     (실제로 「소관부처명」이 「소관부처」로 깨져 왔다). */
async function 글자로받기(url) {
  const r = await fetch(url, { headers: { "User-Agent": "pureun-erp-news-brief" } });
  if (!r.ok) throw new Error(url + " 응답 " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString("utf8");
}

/* 법령을 «몇 건까지» 가져올지 받는다.
   ★ 여기서 5건에 자르면, 뉴스레터가 8건까지 싣겠다 해도 8건이 될 수 없다 —
     한 주치는 하루치보다 많이 실어야 하는데 여기가 목을 조른다. */
async function 브리핑거리모으기(법령몇) {
  const 몇 = 법령몇 || 5;
  let 뉴스 = [], 법령 = [];
  try {
    뉴스 = 브리핑부품.뉴스읽기(await 글자로받기(브리핑샘.뉴스), 브리핑샘.뉴스이름);
  } catch (e) { console.warn("[브리핑] 뉴스를 못 읽었습니다", e.message); }
  for (const w of 브리핑샘.법령말) {
    try {
      const xml = await 글자로받기("https://www.law.go.kr/DRF/lawSearch.do?OC=test"
        + "&target=law&type=XML&sort=ddes&display=" + 몇 + "&query=" + encodeURIComponent(w));
      법령 = 법령.concat(브리핑부품.법령읽기(xml));
    } catch (e) { console.warn("[브리핑] 법령(" + w + ")을 못 읽었습니다", e.message); }
  }
  return { 뉴스: 뉴스, 법령: 브리핑부품.법령추리기(법령, 몇) };
}

/* 새 홈페이지에서 한 쪽을 읽어 온다.
   ★ «저장소 원본»에서 읽는다 — 도메인·DNS 와 무관하고, 방금 올린 것을 바로 읽는다.
     (2026-09-02: 도메인이 붙자 github.io 가 301 로 보내고 그 끝이 403 이라 멎었다.) */
async function 새홈페이지쪽(자리) {
  const r = await fetch("https://raw.githubusercontent.com/nabaho/pureun-site/main/" + 자리
    + "?t=" + Date.now(), { headers: { "User-Agent": "pureun-erp-news-brief" } });
  if (!r.ok) throw new Error(자리 + " 응답 " + r.status);
  return await r.text();
}

/* 서울 기준 오늘 (yyyy-mm-dd) */
function 서울오늘() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/* ══════════════════════════════════════════════════════════════════════════
   ① 날마다 «모으기» — 올리지는 않는다
   ══════════════════════════════════════════════════════════════════════════
   ★ 왜 날마다 도는가 — 신문사 RSS 는 최근 50개만 준다.
     2026-09-02 실측으로 그것이 «이틀치»뿐이었다(50개 = 8/30~9/1, 노동 관련 31건).
     주 1회만 읽으면 「주간 브리핑」이라 이름 붙이고 이틀치만 싣게 된다.
     그래서 날마다 제목·링크만 모아 두었다가 월요일에 한 장으로 낸다.

   ★ 여기서는 «아무것도 올리지 않는다» — 글이 나가는 곳은 아래 한 군데뿐이다. */
exports.dailyNewsCollect = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("every day 07:00")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const 자리 = getDatabase().ref("homepage/newsBrief");
    const 설정 = (await 자리.once("value")).val() || {};
    if (설정.off === true) { console.log("[모으기] 꺼져 있습니다"); return null; }

    const 오늘 = 서울오늘();
    let 거리;
    try {
      거리 = await 브리핑거리모으기();
    } catch (e) {
      /* ★ 못 읽은 날이 있어도 그냥 넘어간다 — 모아 둔 것은 그대로 남는다 */
      console.warn("[모으기] 오늘은 못 읽었습니다", e.message);
      return null;
    }

    const 모아둔것 = (await 자리.child("모음").once("value")).val() || {};
    const 결과 = 브리핑부품.모으기(모아둔것, 거리.뉴스, 오늘);
    const 남길것 = 브리핑부품.오래된것털기(결과.모음, 오늘, 14);

    await 자리.child("모음").set(남길것);
    await 자리.update({ 모은날: 오늘, 모은수: 결과.새로, 쌓인수: Object.keys(남길것).length });
    console.log("[모으기] 새로 " + 결과.새로 + "건 · 쌓인 것 " + Object.keys(남길것).length + "건");
    return null;
  });

/* ══════════════════════════════════════════════════════════════════════════
   ①-2 발간자료·판례 모으기 — 「법제처 링크」가 아니라 «자료 그 자체»
   ══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-09-05:
     「자료가 법제처에서 나오면 안된다. 정리해서 첨부자료에 있어야된다.
      … 시스템을 자동으로 찾아오고 데이터를 다운받아서 확인할 수 있게 만들어라.」

   ★ 어디서 오는가
     · 자료 — 고용노동부 «정책자료실». 받으신 원본(8월 5주차)에 실린 두 건이
              그대로 여기 있었다(2026-09-05 실측). 짐작이 아니라 맞춰 본 것이다.
     · 판례 — 법제처 판례 API. 판결문은 저작권 대상이 아니라 «내용까지» 싣는다.

   ★ 「다운받아서 확인할 수 있게」 — 파일을 실제로 «내려받아» 본다.
     ① 크기를 재서 편지에 적는다(누르기 전에 얼마짜리인지 알게)
     ② 링크가 «살아 있는지» 확인한다. 죽은 링크가 114곳으로 나가면 되돌릴 수 없다.
     ③ 우리 저장소에 사본을 둔다. 기관이 내리면 우리 것으로 드린다.

   ⚠ 남의 집 화면을 읽는 일이라 «언젠가 반드시» 모양이 바뀐다.
     못 읽으면 «그냥 넘어간다» — 모아 둔 것은 그대로 남는다. */
const 자료부품 = require("./news-docs.js");
const 판례부품 = require("./news-prec.js");

/* 판례를 어떤 말로 찾나 — 사업장이 챙길 일이 되는 낱말들 */
const 판례찾을말 = ["부당해고", "통상임금", "산업재해", "퇴직금", "직장 내 괴롭힘", "노동조합"];
/* ⚠ 25MB 를 넘으면 «받아 보지 않는다». 함수 메모리가 터지면 그 회차 모으기가 통째로 실패한다.
     크기를 모르는 채로 두는 편이 낫다 — 링크는 그대로 나간다. */
const 자료최대바이트 = 25 * 1024 * 1024;
const 자료보관자리 = "newsdocs/";

/* 쪽 하나를 «글자»로. 한글 인코딩을 헤더와 <meta> 에서 알아본다.
   ⚠ 고용노동부는 쪽마다 인코딩이 다르다 — 정책자료실은 UTF-8 인데
     주요발간물은 EUC-KR 이다. 하나로 못 박으면 한쪽이 통째로 깨져 온다. */
async function 쪽받기(url) {
  const r = await fetch(url, { headers: { "User-Agent": "pureun-erp-news-docs" } });
  if (!r.ok) throw new Error(url + " 응답 " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const 헤더 = String(r.headers.get("content-type") || "");
  let 이름 = (/charset=([\w-]+)/i.exec(헤더) || [, ""])[1].toLowerCase();
  if (!이름) {
    /* 앞 2KB 만 라틴으로 훑어 <meta charset> 을 본다 — 여기까지는 어느 인코딩이든 ASCII 다 */
    const 머리 = buf.slice(0, 2048).toString("latin1");
    이름 = (/charset\s*=\s*["']?([\w-]+)/i.exec(머리) || [, "utf-8"])[1].toLowerCase();
  }
  if (이름 === "utf8") 이름 = "utf-8";
  try { return new TextDecoder(이름).decode(buf); }
  catch (e) { return buf.toString("utf8"); }
}

/* 고용노동부 정책자료실에서 «쓸 만한 것»을 골라 상세까지 읽는다 */
/* 샘마다 «제 몫»을 가져온다 (대표 지시 2026-09-06 「다양하게 좋은자료를 만들고 싶다」).
   ★ 샘이 셋이다 — 고용노동부 정책자료실 · 고용노동부 보도자료 · 한국노동연구원.
     어느 꼭지에 넣을지는 «샘이 정한다»(news-docs.js 의 샘들). 여기서는 나르기만 한다.
   ★ 몇개는 «샘마다»다. 셋을 한 통에 넣고 자르면 값어치 높은 샘이 밀려난다 —
     보도자료가 날마다 열 건씩 올라오니 그것만으로 다 채워질 수 있다.
   ⚠ 한 샘이 죽어도 나머지는 가져온다. 남의 집 화면이라 한 곳은 언제든 바뀐다. */
async function 자료거리모으기(몇개) {
  const 몇 = Math.max(1, Math.min(12, Number(몇개) || 6));
  /* 샘 하나가 가져올 몫 — 셋이라 둘씩이면 여섯이다. 적어도 둘은 준다. */
  const 샘몫 = Math.max(2, Math.ceil(몇 / 자료부품.샘들.length));
  const out = [];
  for (const S of 자료부품.샘들) {
    try {
      const 목록 = 자료부품.자료추리기(
        자료부품.목록읽기(await 쪽받기(자료부품.목록주소(1, S)), S), 샘몫);
      let 담은것 = 0;
      for (const m of 목록) {
        try {
          const 상세 = 자료부품.상세읽기(
            await 쪽받기(자료부품.상세주소(m.일련번호, S)), m.일련번호, S);
          /* ★ 목록에 적힌 제목을 앞세운다 — KLI 는 상세 큰 글씨가 «칸 이름»이라
               어느 달 것이든 「국내노동동향」으로 같다(2026-09-07 실측). */
          const it = 자료부품.자료로만들기(상세, { 목록제목: m.제목 });
          /* ⚠ 첨부가 없으면 «자료가 아니다» — 내려받을 것이 없는 칸은 목록일 뿐이다 */
          if (it && it.파일) { out.push(it); 담은것++; }
        } catch (e) {
          console.warn("[자료] " + S.키 + " " + m.일련번호 + " 를 못 읽었습니다: " + e.message);
        }
      }
      console.log("[자료] " + S.이름 + " — " + 담은것 + "건");
    } catch (e) {
      console.warn("[자료] " + S.이름 + " 목록을 못 읽었습니다: " + e.message);
    }
  }
  return out;
}

/* 행정해석(법령해석례) — 꼭지 이름에 있는데 «비어 있던» 그것.
   ⚠ 판례와 «같은 모양»으로 돌려준다(갈래:'판례', 딱지:'[행정해석]') —
     편지 짓는 층을 안 고쳐도 되고, 한 꼭지에 섞여 나란히 실린다. */
const 해석찾을말 = ["근로기준법", "근로자퇴직급여", "산업안전보건법", "노동조합"];

async function 해석거리모으기(몇개) {
  const 몇 = Math.max(1, Math.min(6, Number(몇개) || 2));
  let 다 = [];
  for (const w of 해석찾을말) {
    try { 다 = 다.concat(판례부품.해석목록읽기(await 쪽받기(판례부품.해석목록주소(w, 5)))); }
    catch (e) { console.warn("[해석] " + w + " 를 못 읽었습니다: " + e.message); }
  }
  const out = [];
  for (const c of 판례부품.해석추리기(다, 몇 * 3)) {
    if (out.length >= 몇) break;
    try {
      const one = 판례부품.해석한건읽기(await 쪽받기(판례부품.해석한건주소(c.일련번호)));
      if (!one || !판례부품.노무해석인가(one)) continue;
      const it = 판례부품.해석으로만들기(one);
      if (it) out.push(it);
    } catch (e) {
      console.warn("[해석] " + c.일련번호 + " 를 못 읽었습니다: " + e.message);
    }
  }
  console.log("[해석] " + out.length + "건");
  return out;
}

/* 법제처에서 노무 판례를 모은다 — 판시사항이 있는 것만 */
async function 판례거리모으기(몇개) {
  const 몇 = Math.max(1, Math.min(8, Number(몇개) || 4));
  let 다 = [];
  for (const w of 판례찾을말) {
    try { 다 = 다.concat(판례부품.목록읽기(await 쪽받기(판례부품.목록주소(w, 5)))); }
    catch (e) { console.warn("[판례] " + w + " 를 못 읽었습니다: " + e.message); }
  }
  const out = [];
  for (const c of 판례부품.판례추리기(다, 몇 * 3)) {
    if (out.length >= 몇) break;
    try {
      const one = 판례부품.한건읽기(await 쪽받기(판례부품.한건주소(c.일련번호)));
      if (!one || !판례부품.노무판례인가(one)) continue;
      const it = 판례부품.판례로만들기(one);
      if (it) out.push(it);
    } catch (e) {
      console.warn("[판례] " + c.일련번호 + " 를 못 읽었습니다: " + e.message);
    }
  }
  return out;
}

/* 첨부를 «실제로 내려받아» 크기를 재고 사본을 둔다.
   ★ 여기가 대표 지시의 「다운받아서 확인할 수 있게」다.
   ⚠ 실패해도 자료를 버리지 않는다 — 크기만 모른 채 링크는 그대로 나간다.
     기관 서버가 잠깐 느린 것으로 그 주 자료를 통째로 잃으면 안 된다. */
async function 파일받아보기(자료) {
  const 것 = Object.assign({}, 자료 || {});
  if (!것.파일) return 것;
  try {
    const r = await fetch(것.파일, { headers: { "User-Agent": "pureun-erp-news-docs" } });
    if (!r.ok) throw new Error("응답 " + r.status);
    const 미리크기 = Number(r.headers.get("content-length") || 0);
    if (미리크기 > 자료최대바이트) {
      것.파일크기 = 미리크기;
      것.확인 = "큼";                       /* 받아 보진 않았지만 크기는 안다 */
      return 것;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    것.파일크기 = buf.length;
    것.확인 = "받음";
    것.확인때 = Date.now();

    /* 우리 사본 — 기관이 내려도 우리 것으로 드릴 수 있게.
       ⚠ 파일 이름에 / 나 .. 가 들어오면 저장 자리를 벗어난다. 이름을 «우리가» 짓는다.
       ⚠ 주소는 «토큰 방식»이다 — 서명 주소는 만료된다. 사진에서 그것 때문에 옛것이
         일제히 안 보인 적이 있고, 그 규칙을 tests/photos-url-retry.test.js 가 지킨다.
         자료 사본도 회차에 적어 두고 몇 달 뒤에 다시 열 수 있어야 하니 같은 잣대로 둔다.
       ⚠ 이 글에 그 함수 «이름»을 적지 말 것 — 글자로 보는 검사가 주석에 걸려 운다
         (functions/index.js 는 .js 라 걷개가 주석을 못 걷는다). */
    const 확장 = (것.확장자 || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const 자리 = 자료보관자리 + String(것.일련번호 || Date.now()).replace(/[^0-9A-Za-z_-]/g, "")
      + "." + 확장;
    const 통 = getStorage().bucket();
    const 표 = crypto.randomUUID();
    await 통.file(자리).save(buf, {
      metadata: {
        contentType: r.headers.get("content-type") || "application/octet-stream",
        metadata: {
          firebaseStorageDownloadTokens: 표,
          제목: String(것.제목 || "").slice(0, 200), 발행처: String(것.발행처 || "")
        }
      }
    });
    것.사본 = 자리;
    것.사본주소 = "https://firebasestorage.googleapis.com/v0/b/" + 통.name
      + "/o/" + encodeURIComponent(자리) + "?alt=media&token=" + 표;
  } catch (e) {
    것.확인 = "못받음";
    것.확인말 = String(e.message || e).slice(0, 120);
    console.warn("[자료] 첨부를 못 받았습니다 — " + 것.제목 + " : " + 것.확인말);
  }
  return 것;
}

/* 모아서 자리에 담는다. 스케줄과 「지금 가져오기」가 «함께» 쓴다 —
   두 벌로 두면 한쪽만 낡는다(브리핑에서 이미 겪었다). */
async function 자료판례모아담기(옵션) {
  const O = 옵션 || {};
  const 오늘 = 서울오늘();
  const db = getDatabase();
  const 셈 = { 오늘: 오늘, 자료새로: 0, 판례새로: 0, 자료쌓임: 0, 판례쌓임: 0, 받은것: 0 };

  /* ── 자료 ── */
  try {
    let 것들 = await 자료거리모으기(O.자료몇 || 6);
    if (O.내려받기 !== false) {
      const 받은것 = [];
      for (const x of 것들) 받은것.push(await 파일받아보기(x));
      것들 = 받은것;
      셈.받은것 = 것들.filter(function (x) { return x.확인 === "받음"; }).length;
    }
    const 자리 = db.ref("homepage/newsDocs");
    const 모아둔것 = (await 자리.child("모음").once("value")).val() || {};
    const 결과 = 자료부품.모으기(모아둔것, 것들, 오늘);
    const 남길것 = 자료부품.오래된것털기(결과.모음, 오늘, 60);
    await 자리.child("모음").set(남길것);
    await 자리.update({ 모은날: 오늘, 모은수: 결과.새로, 쌓인수: Object.keys(남길것).length });
    셈.자료새로 = 결과.새로;
    셈.자료쌓임 = Object.keys(남길것).length;
  } catch (e) {
    console.warn("[자료] 오늘은 못 모았습니다: " + e.message);
    셈.자료탈 = String(e.message || e).slice(0, 160);
  }

  /* ── 판례 «그리고» 행정해석 ──
     ★ 한 자리(newsPrec)에 함께 담는다 — 꼭지가 「판례·재결례·행정해석」 하나이고,
       모양도 같다(갈래:'판례'). 자리를 갈라 두면 화면이 두 곳을 읽어야 한다.
     ⚠ 해석을 먼저 담지 않는다 — 판례가 그 꼭지의 주인이다. 해석은 «보태는» 것이다. */
  try {
    const 판 = await 판례거리모으기(O.판례몇 || 4);
    let 해 = [];
    try { 해 = await 해석거리모으기(O.해석몇 || 2); }
    catch (e) { console.warn("[해석] 오늘은 못 모았습니다: " + e.message); }
    const 것들 = 판.concat(해);
    const 자리 = db.ref("homepage/newsPrec");
    const 모아둔것 = (await 자리.child("모음").once("value")).val() || {};
    const 결과 = 판례부품.모으기(모아둔것, 것들, 오늘);
    const 남길것 = 판례부품.오래된것털기(결과.모음, 오늘, 90);
    await 자리.child("모음").set(남길것);
    await 자리.update({ 모은날: 오늘, 모은수: 결과.새로, 쌓인수: Object.keys(남길것).length });
    셈.판례새로 = 결과.새로;
    셈.판례쌓임 = Object.keys(남길것).length;
  } catch (e) {
    console.warn("[판례] 오늘은 못 모았습니다: " + e.message);
    셈.판례탈 = String(e.message || e).slice(0, 160);
  }

  return 셈;
}

/* 날마다 아침 7:10 — 뉴스 모으기(07:00) 바로 뒤.
   ⚠ 같은 시각에 두 개를 돌리면 둘 다 느려진다. 십 분 띄운다.

   ★★ 서울에서 돌린다 (2026-09-07 로그를 열어 보고 알았다)
     첫 자동 모으기(2026-09-07 07:10)가 «일곱 번 다 fetch failed» 였다 —
     고용노동부·법제처 어느 쪽도 열리지 않았다. 같은 지역에서 십 분 전에 돈
     매일노동뉴스 모으기는 멀쩡했다(새로 9건). 남의 집 사정이 아니라 «어디서 두드리나»다.
     정부 사이트는 바깥 지역에서 막히는 일이 흔하다 — 메일 함수들과 같은 서울로 옮긴다.
   ⚠ 지역을 바꾸면 예전 것(us-central1)은 지워지고 새로 만들어진다.
     담아 둔 자료는 실시간DB·창고에 있어 그대로다.
   ⚠ 「지금 가져오기」(newsDocsPull)는 처음부터 서울이었다 — 그래서 손으로 누르면 됐고,
     아침에는 조용히 아무것도 안 담겼다. 둘이 같은 지역이어야 시험이 시험이 된다. */
exports.dailyDocsCollect = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("every day 07:10")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const 설정 = (await getDatabase().ref("homepage/newsDocs").once("value")).val() || {};
    if (설정.off === true) { console.log("[자료모으기] 꺼져 있습니다"); return null; }
    const 셈 = await 자료판례모아담기({});
    console.log("[자료모으기] 자료 새로 " + 셈.자료새로 + "(받음 " + 셈.받은것 + ")"
      + " · 판례 새로 " + 셈.판례새로);
    return null;
  });

/* 「지금 가져오기」 — 대표가 화면에서 누르는 것.
   ⚠ 총괄관리자만. 남의 서버를 여러 번 두드리는 일이라 아무나 못 누르게 한다. */
exports.newsDocsPull = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    let sender;
    try { sender = await requireStaff(req); }
    catch (e) { res.status(e.status || 401).json({ ok: false, error: String(e.message || e) }); return; }

    const db = getDatabase();
    const 권 = (await db.ref("uid_roles/" + sender.uid).once("value")).val() || {};
    if (권.isAdmin !== true) { res.status(403).json({ ok: false, error: "총괄관리자만 쓸 수 있습니다." }); return; }

    const 몸 = (req.body && typeof req.body === "object") ? req.body : {};

    /* ★ 사본 주소는 «담을 때» 함께 적어 둔다(homepage/newsDocs/모음/…/사본주소).
         따로 받아 가는 문을 두지 않는다 — 문이 하나면 새는 곳도 하나다. */
    try {
      const 셈 = await 자료판례모아담기({
        자료몇: Math.max(1, Math.min(12, Number(몸.자료몇) || 6)),
        판례몇: Math.max(1, Math.min(8, Number(몸.판례몇) || 4)),
        해석몇: Math.max(0, Math.min(6, Number(몸.해석몇) == null ? 2 : Number(몸.해석몇))),
        내려받기: 몸.내려받기 !== false
      });
      res.json(Object.assign({ ok: true }, 셈));
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

/* ══════════════════════════════════════════════════════════════════════════
   ② 월요일 아침 «뉴스레터 한 장» (대표 지시 2026-09-02 「1주일에 1개씩」)
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════
   🧾 반출 기록 정리 — 2년이 지난 줄만 (대표 결정 2026-09-02: 「2년 · 서버가 달마다」)
   ══════════════════════════════════════════════════════════════════════════

   ■ 왜 서버가 하나
   반출 기록(exportLog)은 규칙이 `!data.exists()` 다 — **새로 만드는 것만** 된다.
   고치기·지우기는 대표도 못 한다. 일부러 그렇게 두었다: 자기 기록을 지울 수 있으면
   기록이 아무 뜻이 없다. 그래서 정리는 앱 «밖»에서만 되고, 관리자 권한으로 도는
   여기가 그 자리다. **앱의 「아무도 못 지운다」는 그대로 남는다.**

   ■ ⚠⚠ 감사 기록을 지우는 일이다 — 조심하는 자리는 순수 로직에 못박아 두었다
   (functions/export-log-tidy.js · 검사 functions/export-log-tidy.test.js)
     ① 날짜를 못 읽는 줄은 안 지운다   ② 앞날 날짜도 안 지운다
     ③ 자르는 날이 이상하면 아무것도 안 지운다   ④ 한 번에 500개 상한
     ⑤ 오래된 것부터   ⑥ 지운 셈을 exportLog «밖»에 남긴다

   ■ 끄는 자리
   exportLogTidy/off = true 로 두면 안 돈다. 감사 기록을 지우는 일은
   언제든 멈출 수 있어야 한다.

   ⚠ 배포는 «이름을 찍어서» — firebase deploy --only functions:monthlyExportLogTidy
     (이 저장소는 functions 통째 배포가 막혀 있다) */
const 반출정리 = require("./export-log-tidy.js");

exports.monthlyExportLogTidy = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  /* 달마다 1일 새벽 4시 — 사람이 안 쓰는 때다. 유닉스 cron 으로 적는다(달마다는 이 꼴이 또렷하다) */
  .pubsub.schedule("0 4 1 * *")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const 셈자리 = getDatabase().ref("exportLogTidy");
    const 설정 = (await 셈자리.once("value")).val() || {};
    /* ⚠ 끄면 «아무것도» 하지 않는다 — 세지도 않는다 */
    if (설정.off === true) { console.log("[반출정리] 꺼져 있습니다"); return null; }

    const 지금 = Date.now();
    const 뿌리 = getDatabase().ref("exportLog");
    const rows = (await 뿌리.once("value")).val() || {};

    /* ⚠ 지울 것을 «순수 로직»이 고른다. 여기서 직접 고르면 규칙이 두 벌이 되고,
       그 두 벌 중 하나는 검사가 안 지킨다. */
    const 결과 = 반출정리.고르기(rows, 지금);
    const 셈 = 반출정리.셈기록(결과, 지금);

    if (결과.멈춤) {
      /* 멈춘 까닭도 남긴다 — 왜 안 지워졌는지 아무도 모르면 안 된다 */
      await 셈자리.child(서울달(지금)).set(셈);
      console.warn("[반출정리] 멈춤 — " + 결과.멈춤);
      return null;
    }
    if (!결과.지울것.length) {
      await 셈자리.child(서울달(지금)).set(셈);
      console.log("[반출정리] 지울 것 없음 — 남김 " + 셈.남김 + " · 못본것 " + 셈.못본것);
      return null;
    }

    /* 지우는 자리표도 순수 로직이 만든다 — 빈 열쇠가 뿌리를 지우는 일을 그쪽이 막는다 */
    const 자리표 = 반출정리.지울자리(결과.지울것, "exportLog");
    await getDatabase().ref().update(자리표);
    await 셈자리.child(서울달(지금)).set(셈);
    console.log("[반출정리] 지움 " + 셈.지움 + " · 남김 " + 셈.남김
      + " · 못본것 " + 셈.못본것 + " · 다음 달로 " + 셈.남은것);
    return null;
  });

/* 셈을 남길 자리 이름 — 「2026-09」. 달마다 한 줄이라 덮어써도 잃을 것이 없다. */
function 서울달(ms) {
  const d = new Date(Number(ms) + 9 * 60 * 60 * 1000);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

exports.weeklyNewsBrief = functions
  .runWith({ timeoutSeconds: 300, memory: "256MB", secrets: ["GITHUB_AUTOMATION_TOKEN"] })
  .pubsub.schedule("every monday 07:30")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const 자리 = getDatabase().ref("homepage/newsBrief");
    const 설정 = (await 자리.once("value")).val() || {};
    if (설정.off === true) { console.log("[브리핑] 꺼져 있습니다"); return null; }

    const 오늘 = 서울오늘();
    /* ★ 같은 주에 두 번 올리지 않는다 — 다시 돌면 같은 글이 두 번 실린다.
       이레의 첫날을 «그 주의 이름»으로 삼는다. */
    const 이번주 = 브리핑부품.며칠전(오늘, 6);
    if (설정.lastWeek === 이번주) { console.log("[브리핑] 이번 주 것은 이미 올렸습니다"); return null; }

    /* 뉴스는 «모아 둔 것»에서, 법령은 지금 읽는다
       (법제처는 공포일순으로 주므로 주 1회로도 한 주치가 다 들어온다) */
    const 모아둔것 = (await 자리.child("모음").once("value")).val() || {};
    const 주간뉴스 = 브리핑부품.주간뉴스고르기(모아둔것, 오늘, 7);
    let 법령 = [];
    try {
      법령 = (await 브리핑거리모으기(8)).법령;   /* 한 주치라 하루치(5건)보다 넉넉히 */
    } catch (e) { console.warn("[브리핑] 법령을 못 읽었습니다", e.message); }

    const 글 = 브리핑부품.주간브리핑(주간뉴스, 법령, 오늘, 7);
    if (!글) { console.warn("[브리핑] 실을 것이 없어 건너뜁니다"); return null; }

    /* 공지 목록과 «본으로 쓸» 글 쪽을 읽는다 */
    const 목록쪽 = await 새홈페이지쪽("notice/index.html");
    const 있던글 = NoticeLib.글읽기(목록쪽);
    if (!있던글.length) { console.warn("[브리핑] 공지 목록을 못 읽어 건너뜁니다"); return null; }
    const 본쪽 = await 새홈페이지쪽("notice/" + 있던글[0].번호 + "/index.html");

    /* 글 번호는 «있던 것 가운데 가장 큰 수 + 1» — 겹치면 서로 덮어쓴다 */
    const 새번호 = String(있던글.reduce((a, g) => Math.max(a, Number(g.번호) || 0), 0) + 1);
    const 새글 = {
      번호: 새번호, 제목: 글.제목, 요약: 글.요약, 본문: 글.본문,
      날짜: 오늘.replace(/-/g, ".") + " 07:30"
    };

    const 글쪽 = NoticeLib.글쪽만들기(본쪽, 새글);
    const 새목록 = NoticeLib.목록그리기(목록쪽, [{
      번호: 새번호, 제목: 글.제목, 날짜: 오늘 + " 07:30:00"
    }].concat(있던글));

    const 토큰 = process.env.GITHUB_AUTOMATION_TOKEN;
    const 사연글 = 사연("푸른ERP 자동 브리핑", "notice", 글.제목);
    /* 글 쪽을 «먼저» 올린다 — 목록에 먼저 실으면 «누르면 없는 쪽»이 잠깐 뜬다 */
    for (const [자리이름, 내용] of [
      ["site/notice/" + 새번호 + "/index.html", 글쪽],
      ["site/notice/index.html", 새목록]
    ]) {
      await 올리기(githubRequest, 토큰, SITE_REPO, 홈페이지자리(자리이름), 내용, 사연글);
      try {
        await 올리기(githubRequest, 토큰, REPO, 자리이름, 내용, 사연글);
      } catch (e) { console.warn("[브리핑] 사본 올리기 실패", e.message); }
    }

    await 자리.update({ lastWeek: 이번주, lastDate: 오늘, lastNo: 새번호, lastTitle: 글.제목,
                        뉴스수: 주간뉴스.length, 법령수: 법령.length });
    console.log("[브리핑] 올렸습니다 — " + 글.제목);
    return null;
  });


// ════════════════════════════════════════════════════════════════════════════
// 한국공인노무사회 자료 가져오기 (대표 지시 2026-09-03)
// ════════════════════════════════════════════════════════════════════════════
// 「여기에서 자료와 데이터를 찾아서 가지고 와라. 정보도 첨부하고 첨부자료도 넣어야 한다.
//   비번아이디를 연결해서 자동으로 되게 처리해달라.」 → 방식 「나」(로그인해서 첨부까지) 승인.
//
// ★ 아이디·비밀번호는 «서버 비밀값»으로만 온다 — 저장소에 적지 않는다.
//   대표께서 직접 넣으시고, 코드는 값을 못 본다(다음메일 암호와 같은 방식).
//     firebase functions:secrets:set ILABOR_ID
//     firebase functions:secrets:set ILABOR_PW
//
// ★ 글자 다루는 일은 전부 functions/ilabor-parse.js 가 한다. 여기는 «바깥을 두드리는» 일만.
//   그래야 읽개를 인터넷 없이 검사할 수 있다(news-brief 와 같은 짜임).
//
// ⚠ 남의 서버다 — 예의를 지킨다.
//   · 이미 가진 것은 다시 안 부른다 · 한 번에 가져오는 수에 상한을 둔다
//   · 부를 때마다 잠깐 쉰다 · 실패하면 그 자리에서 멈추고 말한다
// ⚠ 사이트가 «프로그램 접속을 막는다» — 브라우저 표시가 없으면 보안장비로 튕겨 낸다.
//   대표께 이 사실을 알리고 진행 결정을 받았다.
// ⚠ 창고(Storage)는 무료 한도가 없다. 첨부는 한 파일 20MB · 자료당 5개까지만 담는다.
const 노무사회 = require("./ilabor-parse");

/* 쿠키를 손으로 든다 — 세션이 없으면 로그인 뒤에도 계속 「막힘」이 온다.
   ⚠ 그릇을 «도메인마다» 따로 둔다. 한 그릇으로 두면 공인노무사회 세션이
     ilabor 로, ilabor 세션이 공인노무사회로 함께 나간다 — 남의 사이트에
     엉뚱한 쿠키를 보내는 일이고, 어느 세션이 살아 있는지도 알 수 없게 된다. */
function 쿠키그릇() {
  const 통 = {};
  return {
    담기(res) {
      const 것 = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
        .concat(res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
      것.forEach((줄) => {
        const m = /^\s*([^=;]+)=([^;]*)/.exec(String(줄 || ""));
        if (m) 통[m[1].trim()] = m[2];
      });
    },
    글자() { return Object.keys(통).map((k) => k + "=" + 통[k]).join("; "); },
    있나() { return Object.keys(통).length > 0; },
    이름들() { return Object.keys(통); }
  };
}

/* 주소를 보고 그릇을 고른다 — 도메인이 섞이지 않게 */
function 그릇고르기(주소, 그릇들) {
  return /kcplaa\.or\.kr/i.test(String(주소)) ? 그릇들.회원 : 그릇들.자료;
}

async function 노무사회부르기(주소, 그릇들, 더할것) {
  const 그릇 = 그릇고르기(주소, 그릇들);
  const 옵 = Object.assign({
    redirect: "manual",
    headers: Object.assign({
      "User-Agent": 노무사회.브라우저표시,
      "Accept": "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "ko-KR,ko;q=0.9"
    }, 그릇.있나() ? { Cookie: 그릇.글자() } : {})
  }, 더할것 || {});
  /* ⚠ fetch 가 «바깥으로 못 나갈» 때 undici 는 「fetch failed」 한 줄만 던진다.
       어느 주소인지도, 왜인지도 안 알려 준다 — 2026-09-04 에 그 한 줄만 보고
       하루를 헤맬 뻔했다. 그래서 여기서 «주소와 속뜻»을 붙여 다시 던진다.
     ★ e.cause.code 가 진짜 까닭이다 (ECONNREFUSED·ETIMEDOUT·ENOTFOUND·
       CERT_HAS_EXPIRED·UNABLE_TO_VERIFY_LEAF_SIGNATURE …). 이것이 있으면
       「우리 잘못이 아니라 상대가 막았다」를 그 자리에서 알 수 있다. */
  /* ★ 줄이 끊긴 것뿐이면 다시 건다 — 왜 그러는지는 ilabor-parse.js「다시걸까」 참고.
       (더운 서버가 이미 끊긴 줄을 물려받아 「other side closed」가 난다.
        2026-09-05 대표께서 「상세+첨부」를 누르셨을 때 실제로 이것에 막혔다.) */
  let res, 마지막탈 = null;
  for (let 번째 = 1; 번째 <= 노무사회.다시걸기; 번째++) {
    try {
      res = await fetch(주소, 옵);
      마지막탈 = null;
      break;
    } catch (e) {
      const 속 = e && e.cause;
      const 코드 = (속 && (속.code || 속.errno)) || '';
      const 말 = (속 && 속.message) || (e && e.message) || '';
      마지막탈 = { 코드: String(코드 || ''), 말: String(말 || '') };
      if (번째 >= 노무사회.다시걸기 || !노무사회.다시걸까(코드, 말)) break;
      await 잠깐(노무사회.다시걸기쉼(번째));
    }
  }
  if (마지막탈) {
    const 코드 = 마지막탈.코드, 말 = 마지막탈.말;
    const 다시했나 = 노무사회.다시걸까(코드, 말);
    const err = new Error('부르지 못했다 — ' + 주소
      + (코드 ? ' (' + 코드 + ')' : '') + (말 ? ' ' + 말 : '')
      + (다시했나 ? ' · ' + 노무사회.다시걸기 + '번 다시 걸어도 안 됐다' : ''));
    err.주소 = 주소; err.코드 = String(코드 || ''); err.속말 = String(말 || '');
    err.다시걸었나 = 다시했나;
    throw err;
  }
  그릇.담기(res);
  return res;
}
const 잠깐 = (ms) => new Promise((ok) => setTimeout(ok, ms));

/* 넘겨주는 주소(302)를 따라간다 — 최대 다섯 번.
   ⚠ 끝없이 따라가지 않는다. 서로 떠넘기는 고리에 걸리면 함수가 시간 초과로 죽는다. */
async function 따라가며부르기(주소, 그릇들, 더할것, 남은) {
  let u = 주소, 몇 = (남은 == null ? 5 : 남은), 마지막 = null;
  for (let i = 0; i <= 몇; i++) {
    마지막 = await 노무사회부르기(u, 그릇들, i === 0 ? 더할것 : undefined);
    const 곳 = 마지막.headers.get("location");
    if (마지막.status >= 300 && 마지막.status < 400 && 곳) {
      u = /^https?:\/\//i.test(곳) ? 곳 : new URL(곳, u).toString();
      continue;
    }
    break;
  }
  return { res: 마지막, 주소: u };
}

/* ══════════════════════════════════════════════════════════════════════════
   로그인 — 세 걸음이다 (대표께서 화면으로 알려 주신 구조, 2026-09-03)
   ══════════════════════════════════════════════════════════════════════════
   ① 공인노무사회 로그인 쪽을 열어 세션을 받는다
   ② login_id·login_pass 를 /login/chk 로 보낸다
   ③ /sso/ilabor 가 주는 «주소»로 ilabor 에 들어간다 (쿠키는 도메인을 못 건넌다)

   ⚠ 처음에는 ilabor 의 로그인 칸에 바로 보냈다 — 그것은 죽은 칸이고
     「로그인 정보가 존재하지 않습니다」가 돌아왔다. 아이디가 틀린 게 아니었다.
   ⚠ 걸음마다 «무엇을 받았는지» 적어 돌려준다. 실패했을 때 어느 걸음에서
     막혔는지 모르면 고칠 수가 없다(실제로 그것 때문에 하루를 썼다). */
async function 노무사회로그인(아이디, 암호) {
  const 그릇들 = { 회원: 쿠키그릇(), 자료: 쿠키그릇() };
  const 걸음 = [];

  /* ① 세션 받기 */
  const a = await 노무사회부르기(노무사회.회원사이트 + "/login", 그릇들);
  걸음.push({ 걸음: "① 로그인 쪽 열기", 상태: a.status, 쿠키: 그릇들.회원.이름들() });

  /* ② 아이디·비밀번호 보내기 */
  const 몸 = new URLSearchParams({
    login_id: String(아이디 || ""), login_pass: String(암호 || ""), return_url: ""
  });
  const b = await 노무사회부르기(노무사회.로그인보내는곳, 그릇들, {
    method: "POST",
    body: 몸.toString(),
    headers: {
      "User-Agent": 노무사회.브라우저표시,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": 노무사회.회원사이트 + "/login",
      Cookie: 그릇들.회원.글자()
    }
  });
  const b답 = await b.text();
  const 판정 = 노무사회.로그인됐나(b답);
  걸음.push({ 걸음: "② 로그인", 상태: b.status, 됐나: 판정.ok, 까닭: 판정.까닭,
              답조각: b답.slice(0, 300) });
  if (!판정.ok) {
    const e = new Error("로그인 실패: " + (판정.까닭 || "까닭을 모른다"));
    e.걸음 = 걸음;
    throw e;
  }

  /* ③ ilabor 로 넘겨받기 */
  const c = await 노무사회부르기(노무사회.SSO주소, 그릇들);
  const c답 = await c.text();
  const 넘김 = 노무사회.sso주소뽑기(c답);
  걸음.push({ 걸음: "③ SSO", 상태: c.status, ok: 넘김.ok, 까닭: 넘김.까닭 || "",
              열쇠붙음: 넘김.열쇠붙음, 주소: 넘김.주소 || "", 답조각: c답.slice(0, 300) });
  if (!넘김.ok) {
    const e = new Error("ilabor 로 넘어가지 못했다: " + 넘김.까닭);
    e.걸음 = 걸음;
    throw e;
  }

  /* 그 주소를 열어 ilabor 세션을 받는다 */
  const d = await 따라가며부르기(넘김.주소, 그릇들);
  const d답 = await d.res.text();
  걸음.push({ 걸음: "④ ilabor 들어가기", 상태: d.res.status, 마지막주소: d.주소,
              쿠키: 그릇들.자료.이름들(), 막혔나: 노무사회.막혔나(d답), 크기: d답.length });

  return { 그릇들: 그릇들, 걸음: 걸음 };
}

exports.ilaborPull = functions
  .region(MAIL_REGION)
  .runWith({ secrets: ["ILABOR_ID", "ILABOR_PW"], timeoutSeconds: 540, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." }); return; }

    let sender;
    try { sender = await requireStaff(req); }
    catch (e) { res.status(e.status || 401).json({ ok: false, error: String(e.message || e) }); return; }

    const db = getDatabase();
    /* ⚠ 총괄관리자만 — 회원 계정으로 남의 사이트에 들어가는 일이다 */
    const 권 = (await db.ref("uid_roles/" + sender.uid).once("value")).val() || {};
    if (권.isAdmin !== true) { res.status(403).json({ ok: false, error: "총괄관리자만 쓸 수 있습니다." }); return; }

    const 몸 = (req.body && typeof req.body === "object") ? req.body : {};
    /* peek = 첫 자료 하나만 열어 «원본을 남긴다»(상세 모양 맞추기용)
       list = 목록만 담는다 (첨부 안 내려받음)
       full = 새 자료의 상세와 첨부까지 */
    const 방식 = ["peek", "list", "full"].indexOf(String(몸.mode || "list")) >= 0 ? String(몸.mode || "list") : "list";
    const 상한 = Math.max(1, Math.min(30, Number(몸.limit) || 10));
    const 아이디 = process.env.ILABOR_ID, 암호 = process.env.ILABOR_PW;
    if (!아이디 || !암호) {
      res.status(400).json({ ok: false, error:
        "아이디·비밀번호가 서버에 없습니다. 대표님이 한 번만 넣어 주세요:\n" +
        "firebase functions:secrets:set ILABOR_ID\nfirebase functions:secrets:set ILABOR_PW" });
      return;
    }

    try {
      const 든것 = await 노무사회로그인(아이디, 암호);
      const 그릇 = 든것.그릇들;
      const 로그인걸음 = 든것.걸음;
      /* ⚠ 열쇠가 안 붙은 주소로 들어갔으면 «손님»이다 — 목록은 보이지만 상세가 막힌다.
           그 사실을 조용히 넘기지 않고 답에 실어 사람에게 보여 준다. */
      const 손님인가 = !(로그인걸음.find(x=>/③/.test(x.걸음)) || {}).열쇠붙음;

      /* ── 목록 ── */
      const 목록쪽 = await (await 노무사회부르기(노무사회.사이트 + "sub09_01.php?cate1=100&page=1", 그릇)).text();
      if (노무사회.막혔나(목록쪽)) throw new Error("목록이 막혔다 — 로그인이 풀렸다");
      const 목록 = 노무사회.목록읽기(목록쪽);
      if (!목록.length) throw new Error("목록에서 한 줄도 못 읽었다 — 쪽 모양이 바뀐 듯하다");

      const 가진것 = (await db.ref("ilabor/items").once("value")).val() || {};
      const 새것 = 노무사회.새것고르기(목록, 가진것, 상한);

      /* ── 엿보기: 상세 원본을 남겨 사람이 눈으로 맞춘다 ── */
      if (방식 === "peek") {
        const 하나 = 새것[0] || 목록[0];
        const 원본 = await (await 노무사회부르기(하나.주소, 그릇)).text();
        const 읽음 = 노무사회.상세읽기(원본);
        await db.ref("ilabor/peek").set({
          sid: 하나.sid, 제목: 하나.제목, 주소: 하나.주소,
          크기: 원본.length, 막혔나: 노무사회.막혔나(원본),
          읽음: 읽음, 원본조각: 원본.slice(0, 12000),
          로그인걸음: 로그인걸음, 손님인가: 손님인가,
          본때: Date.now(), 본이: sender.email || ""
        });
        /* ⚠ 걸음을 함께 준다 — 로그인이 «어디까지» 갔는지 보여야 고칠 수 있다.
             처음에는 이것이 없어 「로그인 실패」 한 줄만 보고 엉뚱한 문을
             두드리고 있다는 것을 몰랐다(2026-09-03). */
        res.json({ ok: true, mode: "peek", sid: 하나.sid, 크기: 원본.length,
          읽음: 읽음, 목록수: 목록.length, 쪽수: 노무사회.쪽수(목록쪽),
          로그인걸음: 로그인걸음, 손님인가: 손님인가 });
        return;
      }

      /* ── 목록만 ── */
      const 담기 = {};
      목록.forEach((x) => {
        담기[x.sid] = Object.assign({}, 가진것[x.sid] || {}, {
          고유번호: x.고유번호, sid: x.sid, 제목: x.제목, 기관: x.기관, 날짜: x.날짜,
          주소: x.주소, 본때: Date.now()
        });
      });
      await db.ref("ilabor/items").update(담기);

      if (방식 === "list") {
        await db.ref("ilabor/meta").update({ 마지막: Date.now(), 마지막이: sender.email || "",
          쪽수: 노무사회.쪽수(목록쪽), 목록수: 목록.length });
        res.json({ ok: true, mode: "list", 목록수: 목록.length, 새것: 새것.length,
          쪽수: 노무사회.쪽수(목록쪽), 손님인가: 손님인가 });
        return;
      }

      /* ── 상세 + 첨부 ── */
      const bucket = getStorage().bucket();
      const 결과 = [];
      for (const 하나 of 새것) {
        await 잠깐(700);                       /* 남의 서버를 몰아치지 않는다 */
        const 원본 = await (await 노무사회부르기(하나.주소, 그릇)).text();
        const 읽음 = 노무사회.상세읽기(원본);
        if (!읽음.ok) { 결과.push({ sid: 하나.sid, ok: false, 까닭: 읽음.까닭 }); continue; }

        const 담은첨부 = [];
        for (const 첨 of 노무사회.첨부거르기(읽음.첨부)) {
          try {
            await 잠깐(400);
            const r = await 노무사회부르기(첨.주소, 그릇);
            const 길이 = Number(r.headers.get("content-length") || 0);
            if (노무사회.너무크나(길이)) { 담은첨부.push({ 이름: 첨.이름, 건너뜀: "너무 크다(" + 길이 + "B)" }); continue; }
            const buf = Buffer.from(await r.arrayBuffer());
            if (노무사회.너무크나(buf.length)) { 담은첨부.push({ 이름: 첨.이름, 건너뜀: "너무 크다" }); continue; }
            const 자리 = 노무사회.창고자리(하나.sid, 첨.이름 || 노무사회.파일이름(첨.주소));
            const 파일 = bucket.file(자리);
            const 토큰 = crypto.randomUUID();
            await 파일.save(buf, { metadata: {
              contentType: r.headers.get("content-type") || "application/octet-stream",
              metadata: { firebaseStorageDownloadTokens: 토큰 }
            } });
            담은첨부.push({ 이름: 첨.이름, 크기: buf.length, 자리: 자리,
              주소: "https://firebasestorage.googleapis.com/v0/b/" + bucket.name
                + "/o/" + encodeURIComponent(자리) + "?alt=media&token=" + 토큰 });
          } catch (e) {
            담은첨부.push({ 이름: 첨.이름, 건너뜀: String((e && e.message) || e).slice(0, 120) });
          }
        }

        await db.ref("ilabor/items/" + 하나.sid).update({
          본문: 읽음.본문 || "", 첨부: 담은첨부, 가져온때: Date.now()
        });
        결과.push({ sid: 하나.sid, ok: true, 제목: 하나.제목, 첨부: 담은첨부.length });
      }

      await db.ref("ilabor/meta").update({ 마지막: Date.now(), 마지막이: sender.email || "",
        쪽수: 노무사회.쪽수(목록쪽), 목록수: 목록.length });
      res.json({ ok: true, mode: "full", 목록수: 목록.length, 가져온것: 결과, 손님인가: 손님인가 });
    } catch (e) {
      /* ⚠ 조용히 넘기지 않는다 — 왜 아무것도 안 왔는지 말해 준다 */
      /* ⚠ 「fetch failed」 한 줄만 돌려주면 사람이 고칠 수가 없다.
           어느 걸음까지 갔는지 · 어느 주소에서 · 무슨 까닭으로 막혔는지를 함께 준다.
           ★ 2026-09-04 에 실제로 이것이 없어 헤맸다. */
      console.warn("[노무사회]", e && e.message, (e && e.코드) || "");
      res.status(500).json({
        ok: false,
        error: String((e && e.message) || e),
        막힌주소: (e && e.주소) || "",
        까닭코드: (e && e.코드) || "",
        다시걸었나: (e && e.다시걸었나) === true,
        로그인걸음: (e && e.걸음) || null
      });
    }
  });

exports.publishSite = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB", secrets: ["GITHUB_AUTOMATION_TOKEN"] })
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
        res.status(403).json({ error: "총괄관리자만 홈페이지를 올릴 수 있습니다." });
        return;
      }

      const path = (req.body && req.body.path) || "";
      const content = (req.body && req.body.content) || "";
      /* ★ 그림(base64)인지 쪽(글자)인지에 따라 «자리도 한도도» 다르다.
         그림은 site/files/logo/ 아래만, 700KB 까지. 한 규칙으로 뭉뚱그리면
         쪽 자리에 그림을, 그림 자리에 쪽을 넣을 수 있게 된다. */
      const 그림인가 = (req.body && req.body.image) === true;
      if (그림인가 ? !올릴그림자리인가(path) : !올릴자리인가(path)) {
        res.status(400).json({ error: "올릴 수 없는 자리입니다: " + String(path).slice(0, 80) });
        return;
      }
      if (그림인가 && !/^[A-Za-z0-9+/=]+$/.test(String(content))) {
        res.status(400).json({ error: "그림이 base64 모양이 아닙니다." });
        return;
      }
      const bytes = 그림인가
        ? Math.floor(String(content).length * 3 / 4)      // base64 는 4글자가 3바이트다
        : Buffer.byteLength(String(content), "utf8");
      if (!bytes) { res.status(400).json({ error: "올릴 내용이 비어 있습니다." }); return; }
      const 한도 = 그림인가 ? MAX_IMAGE_BYTES : MAX_BYTES;
      if (bytes > 한도) {
        res.status(413).json({ error: "너무 큽니다(" + Math.round(bytes / 1024) + "KB). "
          + "한도는 " + Math.round(한도 / 1024) + "KB 입니다." });
        return;
      }

      const 누가 = decoded.name || decoded.email || decoded.uid;
      const 사연글 = 사연(누가, path, (req.body && req.body.note) || "");
      const 토큰 = process.env.GITHUB_AUTOMATION_TOKEN;

      /* ★ «사람이 보는 홈페이지»부터 올린다. 우리 사본이 실패해도 홈페이지는 이미 바뀐다 —
         거꾸로 하면 사본만 바뀌고 홈페이지는 그대로인, 가장 헷갈리는 상태가 된다. */
      const 답 = await 올리기(githubRequest, 토큰, SITE_REPO,
        홈페이지자리(path), content, 사연글, 그림인가);

      /* 우리 쪽 사본 — 검사가 이것을 잣대로 삼는다. 실패해도 «알리기만» 하고 멈추지 않는다. */
      let 사본 = "";
      try {
        await 올리기(githubRequest, 토큰, REPO, path, content, 사연글, 그림인가);
      } catch (e) {
        사본 = (e && e.message) || "사본을 올리지 못했습니다";
        console.warn("[publishSite] 사본 올리기 실패", 사본);
      }

      res.json({
        ok: true,
        path: 홈페이지자리(path),
        bytes: bytes,
        commit: (답 && 답.commit && 답.commit.sha) ? 답.commit.sha.slice(0, 7) : "",
        copyError: 사본,
        publishedAt: Date.now()
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || "홈페이지를 올리지 못했습니다." });
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
        /* ★★ 「나 여기 있다」만 하는 인사 — 앱을 열면 온다 (2026-08-31).
           ⚠ 인사에는 «문자함 이야기가 없다». 그런데도 sweepFound 0 · sweepReadOk false 를
             적으면 화면이 「폰이 문자함을 읽지 못했습니다」라고 거짓말한다 —
             열어 봤을 뿐인데 고장 났다고 하는 꼴이다.
           ⚠ 「지난 문자를 끌어왔다」로도 적지 않는다. 연 것과 끌어온 것은 다르다 —
             적으면 화면이 「이미 가져오셨네요」로 읽어 안내를 그만둔다. */
        const hello = body.hello === true;
        await hanaDeviceRef(linked).update({
          ...(byHand ? {} : { lastSweepAt: Date.now() }),
          /* 사람이 눌렀으면 「지난 문자를 끌어왔다」로 남긴다 — 찾은 것이 0통이어도
             그렇다. 안 남기면 화면이 「앱에서 눌러 주세요」를 영영 되풀이한다. */
          ...(byHand && !hello ? { lastHistoryAt: Date.now() } : {}),
          lastTalkAt: Date.now(),
          appVersion: String(body.appVersion || "").slice(0, 16),
          ...(hello ? {} : {
            sweepFound: Number(body.foundCount || 0),
            sweepNewestAt: Number(body.newestAt || 0),
          }),
          /* 문자함 권한이 없으면 훑기는 돌아도 «아무것도 못 줍는다» —
             그 상태를 화면이 알아야 「권한을 주세요」라고 짚어 줄 수 있다. */
          sweepCanReadSms: body.canReadSms === true,
          /* ★★ 「문자함을 끝까지 읽었나」 (코덱스 지적 2026-08-30).
             권한이 있어도 조회가 튕길 수 있다. 그때 sweepFound 는 0 으로 오는데,
             예전 화면은 그걸 「폰에 하나 문자가 아예 없습니다」로 단정해 읽었다 —
             그 한마디에 대표는 엉뚱하게 은행 쪽을 뒤지게 된다.
             ⚠ 옛 판(1.8.0 이하)은 이 값을 안 보낸다. 안 보내면 «모름»으로 두고,
                화면은 없다고 «단정하지 않는다» (undefined 로 남긴다). */
          ...(!hello && typeof body.readOk === "boolean" ? { sweepReadOk: body.readOk } : {}),
          /* 상한에 닿았나 — 닿았으면 그보다 오래된 거래가 폰에 더 남아 있다. */
          ...(hello ? {} : { sweepCapped: body.capped === true }),
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
/* POP3 로 «몇 통이 있는지»만 묻는 진단 — 지난 메일을 채울 수 있나를 재는 자리.
   ⚠ 여기 한 줄을 빠뜨리면 함수가 아예 안 올라간다("No function matches the filter") —
     mail-sync.js 에 적는 것만으로는 밖에서 안 보인다. */
exports.probeMailPop = MSYNC.probeMailPop;
/* 📦 지난 메일 채우기 — POP3 로 머리글만 끌어온다(대표만) */
exports.backfillMailbox = MSYNC.backfillMailbox;
/* 📦 지난 메일 한 통 열기 — 그 자리에서 POP3 로 (직원 누구나, 메일함과 같은 문) */
exports.readOldMail = MSYNC.readOldMail;

/* ══════════════════════════════════════════════════════════════════════════
   📬 열람 확인 — 보낸 메일의 «보이지 않는 1×1 그림»이 불리는 자리 (대표 결정 2026-09-06)
   ══════════════════════════════════════════════════════════════════════════
   ⚠★ 여기서 «적는 것은 시각과 횟수뿐»이다.
     req.ip · User-Agent · Referer 를 «읽지 않는다». 필요한 것은 「언제」 하나이고,
     그 밖을 적기 시작하면 이것은 «다른 물건»이 된다 — 시각 하나가 새는 것과
     사람의 자취가 새는 것은 무게가 다르다. 지우기도 그만큼 어려워진다.
     이 함수에 그 값을 읽는 줄이 «하나도 없다»는 것을 검사가 지킨다.
   ⚠ 여기 한때 「우리는 받는 메일에서 바로 이런 그림을 막고 있다」가 까닭으로 적혀
     있었다. 2026-09-06 저녁에 대표 지시로 «늘 보여주기»가 되어(b4aa6eb7) 그 말이
     사실과 어긋났다 — 규칙은 그대로 옳지만 까닭이 낡았다. 틀린 까닭을 남겨 두면
     다음 사람이 「막는 걸 다시 켰으니 이제 적어도 되겠네」로 읽는다. 그래서 고쳤다.
   ⚠ 로그인 없이 열린다 — 상대의 메일 프로그램이 부르는 자리이므로 그럴 수밖에 없다.
     그래서 열쇠(t)는 못 알아맞히게 32자리다. 알아맞혀도 할 수 있는 일은 «셈을
     늘리는 것»뿐이고, 메일 내용은 이 자리에 없다.
   ⚠ 무슨 일이 나도 «그림은 돌려준다». 여기서 오류를 내면 받는 사람 화면에 깨진
     그림표가 뜬다 — 그것이 곧 「이 메일은 당신을 훔쳐본다」는 표가 된다.
   ⚠ 담아 두지 말라고 이른다(no-store) — 담기면 두 번째부터 우리에게 안 온다. */
const OPEN_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
exports.mailOpenPixel = functions
  .region(MAIL_REGION)
  .runWith({ timeoutSeconds: 30, memory: "128MB" })
  .https.onRequest(async (req, res) => {
    const send = () => {
      res.set("Content-Type", "image/gif");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      res.status(200).end(OPEN_PIXEL);
    };
    try {
      const t = String((req.query && req.query.t) || "");
      if (!/^[0-9a-f]{32}$/.test(t)) { send(); return; }
      const ref = getDatabase().ref(MD.TRACK_ROOT + "/" + t);
      const now = Date.now();
      await ref.transaction((cur) => {
        if (!cur) return cur;                 /* 우리가 만든 적 없는 열쇠 — 아무것도 안 만든다 */
        cur.n = Number(cur.n || 0) + 1;
        if (!cur.first) cur.first = now;      /* «처음 연 때»는 안 덮는다 */
        cur.last = now;
        return cur;
      });
    } catch (e) {
      console.warn("mailOpenPixel", (e && e.message) || e);
    }
    send();
  });
