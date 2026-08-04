"use strict";

const crypto = require("node:crypto");

const REPO = "nabaho/pureunall";
const MAX_TEXT = 6000;
const HIGH_RISK = /(firebase|보안\s*규칙|권한|로그인|인증|급여|성과급|삭제|복원|백업|잠금|결제|메일|개인정보|주민|계좌|database|rules|auth)/i;

function cleanText(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength || MAX_TEXT);
}

function redactSensitive(value) {
  return cleanText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 삭제]")
    .replace(/\b\d{6}\s*[- ]?\s*[1-4]\d{6}\b/g, "[주민번호 삭제]")
    .replace(/\b(?:01[016789]|02|0[3-6][1-5])[- .]?\d{3,4}[- .]?\d{4}\b/g, "[전화번호 삭제]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[금융번호 삭제]");
}

function riskLevel(input) {
  const requested = cleanText(input && input.risk, 20).toLowerCase();
  if (requested === "high") return "high";
  if (requested === "low") return HIGH_RISK.test(`${input.title || ""}\n${input.content || ""}\n${input.instruction || ""}`) ? "high" : "low";
  return HIGH_RISK.test(`${input.title || ""}\n${input.content || ""}\n${input.instruction || ""}`) ? "high" : "low";
}

function normalizeImageIndexes(value, imageCount) {
  const max = Math.max(0, Number(imageCount) || 0);
  return [...new Set((Array.isArray(value) ? value : [])
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < max))]
    .slice(0, 3);
}

function buildIssue(input) {
  const level = riskLevel(input);
  const title = redactSensitive(input.title || "개선 요청").slice(0, 140);
  const content = redactSensitive(input.content);
  const instruction = redactSensitive(input.instruction);
  const suggestionId = cleanText(input.suggestionId, 120).replace(/[^A-Za-z0-9_-]/g, "");
  const selectedCount = normalizeImageIndexes(input.imageIndexes, input.imageCount).length;
  const autoDeploy = level === "low" && input.autoDeploy === true;
  const body = [
    "## 대표 승인형 자동개발",
    "",
    `- 건의 ID: \`${suggestionId}\``,
    `- 위험도: \`${level}\``,
    `- 검사 통과 후 자동배포: \`${autoDeploy ? "yes" : "no"}\``,
    `- 비공개 참고 캡처: \`${selectedCount}개\``,
    "",
    "### 사용자 건의",
    content || "(내용 없음)",
    "",
    "### 대표 개발 지시",
    instruction || "(추가 지시 없음)",
    "",
    "---",
    "이 이슈는 총괄관리자가 개인정보 공개 여부를 확인한 뒤 등록했습니다.",
    "선택한 캡처는 GitHub에 공개하지 않고, 보호된 자동화 연결을 통해 실행 중에만 전달합니다.",
  ].join("\n");
  return {
    title: `[자동개발] ${title}`,
    body,
    labels: ["ai-ready", level === "high" ? "risk-high" : "risk-low"],
    level,
    autoDeploy,
    suggestionId,
  };
}

function validateExecute(input) {
  if (!input || input.privacyConfirmed !== true) throw new Error("개인정보 공개 여부 확인이 필요합니다.");
  if (!cleanText(input.suggestionId, 120)) throw new Error("건의 ID가 없습니다.");
  if (!cleanText(input.title, 140)) throw new Error("건의 제목이 없습니다.");
  if (!cleanText(input.instruction, MAX_TEXT)) throw new Error("대표 개발 지시를 입력해 주세요.");
  return true;
}

function createRollbackCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashRollbackCode(code, salt) {
  return crypto.createHash("sha256").update(`${salt}:${String(code || "")}`).digest("hex");
}

function safeGithubNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error("GitHub 번호가 올바르지 않습니다.");
  return number;
}

async function githubRequest(token, route, options) {
  if (!token) throw new Error("GITHUB_AUTOMATION_TOKEN 비밀값이 없습니다.");
  const response = await fetch(`https://api.github.com${route}`, {
    method: (options && options.method) || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pureunall-development-automation",
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { message: text }; }
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${(data && data.message) || "요청 실패"}`);
  return data;
}

module.exports = {
  REPO,
  cleanText,
  redactSensitive,
  riskLevel,
  normalizeImageIndexes,
  buildIssue,
  validateExecute,
  createRollbackCode,
  hashRollbackCode,
  safeGithubNumber,
  githubRequest,
};
