#!/usr/bin/env node
/* 캐시 버전 점검 — 고친 .js 를 쓰는 쪽의 ?v= 를 안 올렸으면 알린다.
 *
 * 왜 필요한가: 이 저장소는 빌드 단계가 없어 브라우저가 `hwpx_gen.js?v=12` 를 그대로 캐시한다.
 * 파일을 고쳐도 v 를 안 올리면 사용자는 옛 파일을 계속 쓴다. 2026-08-01 에 실제로 겪었다 —
 * 서식을 다섯 커밋에 걸쳐 고쳤는데 v=12 그대로여서 고친 내용이 화면에 반영된 적이 없었다.
 *
 * 쓰는 법
 *   node scripts/check-cache-version.js            커밋에 올린 것(staged)만 본다
 *   node scripts/check-cache-version.js --all      작업트리 전체를 본다
 * git 훅으로 자동 실행하려면 한 번만:
 *   git config core.hooksPath .githooks
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const ALL = process.argv.includes("--all");

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: "utf8" }); } catch (e) { return ""; }
}

/* 바뀐 파일 목록 — 훅에서는 staged, --all 이면 작업트리 전체 */
const changed = new Set(
  sh(ALL ? "git diff --name-only HEAD" : "git diff --cached --name-only")
    .split("\n").map(s => s.trim()).filter(Boolean));
if (!changed.size) process.exit(0);

/* ?v= 를 붙여 부르는 쪽(html)을 모두 훑어 참조표를 만든다 */
const pages = sh("git ls-files *.html */*.html").split("\n").map(s => s.trim()).filter(Boolean);
const refs = [];   // {page, file, ver}
for (const pg of pages) {
  const p = path.join(ROOT, pg);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, "utf8");
  const re = /(?:src|href)="([\w./-]+\.(?:js|css))\?v=(\d+)"/g;
  let m;
  while ((m = re.exec(s))) {
    const file = path.posix.normalize(path.posix.join(path.posix.dirname(pg), m[1]));
    refs.push({ page: pg, file: fs.existsSync(path.join(ROOT, file)) ? file : m[1], ver: m[2] });
  }
}

const bad = [];
for (const r of refs) {
  if (!changed.has(r.file)) continue;          // 이번에 안 고친 파일은 볼 것 없다
  if (changed.has(r.page)) {                   // 부르는 쪽도 같이 고쳤다면 v 가 바뀌었는지 본다
    const diff = sh(`git diff ${ALL ? "HEAD" : "--cached"} -- "${r.page}"`);
    const re = new RegExp("^[+-].*" + r.file.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
      .replace(/^.*\//, "[\\w./-]*") + "\\?v=", "m");
    if (re.test(diff)) continue;               // v 줄이 바뀌었다 → 통과
  }
  bad.push(r);
}

if (!bad.length) process.exit(0);
console.error("\n⚠ 캐시 버전을 안 올렸습니다 — 고친 파일이 브라우저에 반영되지 않습니다.\n");
for (const r of bad) console.error(`   ${r.file}  를 고쳤는데  ${r.page}  의 ?v=${r.ver} 가 그대로입니다`);
console.error("\n   고치는 법: 위 쪽(html)에서 ?v= 숫자를 1 올리세요."
  + "\n   (일부러 그대로 두려면  git commit --no-verify )\n");
process.exit(1);
