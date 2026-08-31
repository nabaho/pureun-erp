"use strict";
/* 홈페이지 쪽을 «저장소에 올려» 준다 — 대표가 단추를 눌렀을 때만.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 「나」 — 저절로 올라가지 않고 «단추를 누를 때만» 올린다.
   고치다 만 내용이 실수로 홈페이지에 나가지 않게, 사람이 「지금 올린다」를 알고 누른다.

   ★ 이 파일이 하는 일은 «올려 주기» 하나뿐이다.
     무엇을 올릴지(구성원 카드를 어떻게 그릴지)는 화면이 정한다 — 화면과 명령줄이
     같은 부품(js/pu-site-people.js)을 쓰므로, 미리 본 것과 올라가는 것이 같다.

   ★ 아무 파일이나 올릴 수 없다
     site/ 아래 .html 만. 이 규칙 하나로 앱 코드·검사·보안규칙·워크플로가 모두 막힌다.
     느슨하게 하면(폴더를 늘리거나 확장자를 열면) 그 통로가 그대로 열린다. */

/* 올려도 되는 자리 — site/ 아래 .html 만.
   ‥(상위 이동)·빗금 두 개·물음표·역슬래시·인코딩된 빗금은 규칙 자체가 걸러 낸다. */
const PATH_RE = /^site\/(?:[a-z0-9_-]+\/){0,3}[a-z0-9_-]+\.html$/;

/* 한 번에 올릴 수 있는 크기. 굳힌 쪽 하나가 20~50KB 라 넉넉하다.
   한도가 없으면 실수 한 번으로 저장소에 수십 MB 가 들어간다. */
const MAX_BYTES = 2 * 1024 * 1024;

function 올릴자리인가(p) {
  const s = String(p == null ? "" : p);
  if (s.length > 200) return false;
  if (s.indexOf("..") >= 0 || s.indexOf("//") >= 0 || s.indexOf("\\") >= 0) return false;
  return PATH_RE.test(s);
}

/* 올리는 사연 — 저장소 이력에 «누가 왜» 가 남아야 한다.
   나중에 「이 줄이 왜 이렇게 됐나」를 되짚는 유일한 실마리다. */
function 사연(who, path, note) {
  const 누가 = String(who == null ? "" : who).replace(/[\r\n]/g, " ").slice(0, 60) || "(누구인지 모름)";
  const 무엇 = String(note == null ? "" : note).replace(/[\r\n]/g, " ").slice(0, 120);
  return [
    "chore(홈페이지): " + path + " 올림" + (무엇 ? " — " + 무엇 : ""),
    "",
    "푸른ERP 홈페이지 관리 화면에서 «홈페이지에 올리기»를 눌러 올렸습니다.",
    "올린 사람: " + 누가,
    "",
    "이 파일은 손으로 고치지 마십시오 — 다음에 올릴 때 덮어씁니다."
  ].join("\n");
}

/* 저장소에 파일 하나를 올린다(있으면 갈아 끼운다).
   ★ 지금 있는 것의 sha 를 먼저 읽어서 함께 보낸다 — 안 보내면 깃허브가 거절한다.
     그리고 그 sha 가 «내가 본 그것»이라, 그 사이 다른 사람이 고쳤으면 충돌로 걸린다. */
async function 올리기(githubRequest, token, repo, path, content, message) {
  let sha = null;
  try {
    const 지금 = await githubRequest(token, `/repos/${repo}/contents/${path}`);
    sha = 지금 && 지금.sha ? 지금.sha : null;
  } catch (e) {
    sha = null;   // 처음 올리는 파일이면 없는 것이 맞다
  }
  const body = {
    message: message,
    content: Buffer.from(String(content), "utf8").toString("base64")
  };
  if (sha) body.sha = sha;
  return githubRequest(token, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

module.exports = { PATH_RE, MAX_BYTES, 올릴자리인가, 사연, 올리기 };
