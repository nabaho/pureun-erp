"use strict";
/* 업체 홈페이지 자동 찾기의 순수 로직만 여기 둔다(대표 지시 2026-09-02).
   firebase-admin·fetch 없이 검사에서 바로 돌려 보려고 findCompanyWebsite 에서 떼어냈다
   — hana-message.js 와 같은 이유다(index.js 는 초기화가 무거워 검사에서 그대로 못 부른다). */

/* 주소에서 매칭에 쓸 «핵심 한 조각»을 뽑는다 — 시/군/구 정도.
   번지수까지 요구하면 검색결과 요약에 그대로 나오는 일이 거의 없어
   매번 「후보만」 상태가 되어, 자동 등록이 있으나 마나 해진다. */
function addressToken(address) {
  const s = String(address || "").trim();
  if (!s) return "";
  const m = s.match(/([가-힣]+(?:시|군|구))\s*([가-힣]+(?:시|군|구))?/);
  if (!m) return s.split(/\s+/)[0] || "";
  return m[2] ? m[1] + " " + m[2] : m[1];
}

/* 회사명과 주소 핵심 조각이 검색결과 «제목+요약»에 함께 나오는 첫 후보를 고른다.
   둘 다 맞아야 확정한다 — 이름만 보면 동명 회사·블로그·뉴스기사가 걸릴 수 있다. */
function findMatch(candidates, name, address) {
  const nameLower = String(name || "").trim().toLowerCase();
  const token = addressToken(address);
  const tokenLower = token.toLowerCase();
  if (!nameLower) return null;
  return (
    (candidates || []).find((c) => {
      const hay = ((c && c.title) || "").toLowerCase() + " " + ((c && c.snippet) || "").toLowerCase();
      const hasName = hay.indexOf(nameLower) >= 0;
      const hasAddr = token ? hay.indexOf(tokenLower) >= 0 : false;
      return hasName && hasAddr;
    }) || null
  );
}

module.exports = { addressToken, findMatch };
