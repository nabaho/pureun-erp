"use strict";
/* 업체 홈페이지 자동 찾기의 순수 로직만 여기 둔다(대표 지시 2026-09-02).
   firebase-admin·fetch 없이 검사에서 바로 돌려 보려고 findCompanyWebsite 에서 떼어냈다
   — hana-message.js 와 같은 이유다(index.js 는 초기화가 무거워 검사에서 그대로 못 부른다).

   ■ 2026-09-03 구글 → 네이버로 갈아탔다.
     구글 Custom Search JSON API 가 «신규 고객에게 닫혀» 있었다(공식 문서: closed to new
     customers, 기존 고객도 2027-01-01 까지 이전). 키를 맞게 넣어도 403 이 났다.
     네이버 검색 API 는 ① 지역(업체) 검색이 «주소·홈페이지를 구조화된 값»으로 주고
     ② 웹문서 검색이 그 뒤를 받친다 — 한국 회사 홈페이지 찾기엔 오히려 낫다.
   ⚠ 네이버는 제목·요약에 <b>…</b> 를 끼워 준다 — 그대로 비교하면 「<b>크레오</b>에스지」
     가 「크레오에스지」와 다르게 보인다. 반드시 stripTags 를 거친다. */

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

/* 네이버가 끼운 <b> 같은 태그와 &amp; 류 글자를 걷어 «사람이 읽는 글자»로 돌려놓는다. */
function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/* 회사 이름을 «비교용»으로 다듬는다 — (주)·주식회사·띄어쓰기·점 따위를 걷는다.
   네이버 지역검색 제목은 「크레오에스지」처럼 (주) 를 빼고 나오는 일이 많아,
   글자 그대로 견주면 우리 「(주)크레오에스지」와 영영 안 맞는다. */
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\((주|유|사|재|합)\)|㈜|㈔|㈜/g, "")
    .replace(/주식회사|유한회사|유한책임회사|사단법인|재단법인|합자회사|합명회사/g, "")
    .replace(/[\s.·,\-_'"“”‘’()\[\]]/g, "");
}

function squash(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }

/* 회사 이름이 «들어 있나» — 다듬은 제목이 다듬은 회사명을 품어야 한다.
   거꾸로(제목이 회사명 안에 있다)는 안 본다 — 「크레오」 같은 짧은 제목이
   「크레오에스지」에 걸려 남의 회사를 붙일 수 있다. */
function nameIn(text, name) {
  const nn = normName(name);
  if (nn.length < 2) return false;
  return normName(text).indexOf(nn) >= 0;
}

function addrIn(text, address) {
  const token = addressToken(address);
  if (!token) return false;
  return squash(text).indexOf(squash(token)) >= 0;
}

/* 웹문서 후보 — 회사명과 주소 핵심 조각이 «제목+요약»에 함께 나오는 첫 후보.
   둘 다 맞아야 확정한다 — 이름만 보면 동명 회사·블로그·뉴스기사가 걸릴 수 있다. */
function findMatch(candidates, name, address) {
  if (normName(name).length < 2) return null;
  return (
    (candidates || []).find((c) => {
      if (!c || !c.link) return false;
      const hay = ((c.title || "") + " " + (c.snippet || ""));
      return nameIn(hay, name) && addrIn(hay, address);
    }) || null
  );
}

/* 지역(업체) 검색 후보 — 제목(업체명)에 회사명이 들어 있고, 네이버가 준 «주소 칸»에
   우리 주소의 시/군/구가 들어 있으며, 홈페이지 링크가 «있는» 첫 후보.
   ⚠ 링크가 빈 업체(네이버 플레이스에 홈페이지를 안 적은 곳)는 맞아도 못 쓴다. */
function findLocalMatch(candidates, name, address) {
  if (normName(name).length < 2) return null;
  return (
    (candidates || []).find((c) => {
      if (!c || !c.link || !/^https?:\/\//i.test(c.link)) return false;
      const addrText = (c.roadAddress || "") + " " + (c.address || "");
      return nameIn(c.title || "", name) && addrIn(addrText, address);
    }) || null
  );
}

/* 네이버 응답 → 화면이 아는 후보 꼴 {title, link, snippet} */
function naverLocalToCandidates(items) {
  return (Array.isArray(items) ? items : []).map((it) => ({
    title: stripTags(it && it.title),
    link: String((it && it.link) || "").trim(),
    snippet: stripTags((it && (it.roadAddress || it.address)) || ""),
    address: stripTags(it && it.address),
    roadAddress: stripTags(it && it.roadAddress),
    source: "local",
  }));
}

function naverWebToCandidates(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      title: stripTags(it && it.title),
      link: String((it && it.link) || "").trim(),
      snippet: stripTags(it && it.description),
      source: "web",
    }))
    .filter((c) => c.link);
}

/* 같은 링크는 한 번만 — 지역·웹 두 갈래에서 같은 홈페이지가 겹쳐 나온다. */
function uniqueByLink(candidates) {
  const seen = new Set();
  const out = [];
  (candidates || []).forEach((c) => {
    if (!c || !c.link) return;
    const key = c.link.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  });
  return out;
}

module.exports = {
  addressToken, stripTags, normName, findMatch, findLocalMatch,
  naverLocalToCandidates, naverWebToCandidates, uniqueByLink,
};
