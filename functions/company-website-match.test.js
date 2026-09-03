"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const CWM = require("./company-website-match");

test("주소에서 시/군/구 조각을 뽑는다", () => {
  assert.equal(CWM.addressToken("충청남도 천안시 서북구 원두정8길 6"), "천안시 서북구");
});

test("시/군/구가 없는 주소는 첫 낱말을 쓴다", () => {
  assert.equal(CWM.addressToken("모름 어딘가"), "모름");
});

test("주소가 없으면 빈 문자열", () => {
  assert.equal(CWM.addressToken(""), "");
  assert.equal(CWM.addressToken(undefined), "");
});

/* ── 네이버 응답 다듬기 ── */
test("★ 네이버가 끼운 <b> 태그와 &amp; 를 걷는다", () => {
  assert.equal(CWM.stripTags("<b>크레오</b>에스지 &amp; 파트너"), "크레오에스지 & 파트너");
});

test("★ 회사명 비교는 (주)·주식회사·띄어쓰기를 걷고 본다", () => {
  assert.equal(CWM.normName("(주) 크레오 에스지"), CWM.normName("크레오에스지"));
  assert.equal(CWM.normName("주식회사 크레오에스지"), "크레오에스지");
  assert.equal(CWM.normName("㈜크레오에스지"), "크레오에스지");
});

/* ── 웹문서 후보 판정 ── */
test("★★ 회사명·주소가 함께 나오는 후보만 「일치」로 본다", () => {
  const candidates = [
    { title: "(주)크레오에스지 - 다른 지역", link: "https://wrong.example", snippet: "서울 강남구 소재" },
    { title: "(주)크레오에스지 공식 홈페이지", link: "https://creoesg.co.kr", snippet: "천안시 서북구에 위치한 회사입니다." },
  ];
  const m = CWM.findMatch(candidates, "(주)크레오에스지", "충청남도 천안시 서북구 원두정8길 6");
  assert.ok(m, "회사명+주소가 같이 나온 후보를 못 찾았다");
  assert.equal(m.link, "https://creoesg.co.kr");
});

test("★★ 주소만 맞고 회사명이 안 나오면 「일치」로 보지 않는다", () => {
  const candidates = [
    { title: "천안시 서북구 소재 업체 안내", link: "https://unrelated.example", snippet: "천안시 서북구에 위치한 다른 회사입니다." },
  ];
  const m = CWM.findMatch(candidates, "(주)크레오에스지", "충청남도 천안시 서북구 원두정8길 6");
  assert.equal(m, null, "회사명이 없는데 주소만 맞아 확정되면 엉뚱한 회사가 걸릴 수 있다");
});

test("★★ 이름만 맞고 주소가 다르면 「일치」로 보지 않는다 (동명 회사 오판 방지)", () => {
  const candidates = [
    { title: "(주)크레오에스지 - 다른 지역 지점", link: "https://wrong.example", snippet: "부산 해운대구 소재" },
  ];
  const m = CWM.findMatch(candidates, "(주)크레오에스지", "충청남도 천안시 서북구 원두정8길 6");
  assert.equal(m, null, "주소가 안 맞는데 자동 확정되면 동명 회사가 뒤바뀔 수 있다");
});

test("주소가 없으면(회사에 아직 주소 미입력) 이름만으로는 확정하지 않는다", () => {
  const candidates = [
    { title: "아무 블로그 글", link: "https://blog.example", snippet: "크레오에스지 관련 글입니다" },
  ];
  const m = CWM.findMatch(candidates, "크레오에스지", "");
  assert.equal(m, null, "주소 정보가 없을 때 이름만으로 확정하면 오판 위험이 크다");
});

test("★ 웹문서 제목이 「크레오에스지」(주 없음)라도 (주)크레오에스지와 맞춘다", () => {
  const candidates = [
    { title: "크레오에스지 | 회사소개", link: "https://creoesg.co.kr", snippet: "천안시 서북구 원두정8길" },
  ];
  const m = CWM.findMatch(candidates, "(주)크레오에스지", "충청남도 천안시 서북구 원두정8길 6");
  assert.ok(m && m.link === "https://creoesg.co.kr", "(주) 표기 차이 때문에 못 맞추면 자동 등록이 거의 안 된다");
});

test("후보가 비어 있으면 null", () => {
  assert.equal(CWM.findMatch([], "아무회사", "서울"), null);
  assert.equal(CWM.findMatch(null, "아무회사", "서울"), null);
});

/* ── 지역(업체) 검색 후보 판정 ── */
const LOCAL = [
  { title: "<b>크레오에스지</b> 서울지점", link: "https://seoul.example", roadAddress: "서울특별시 강남구 테헤란로 1", address: "서울특별시 강남구 역삼동 1" },
  { title: "<b>크레오에스지</b>", link: "", roadAddress: "충청남도 천안시 서북구 원두정8길 6", address: "충청남도 천안시 서북구 두정동 1" },
  { title: "<b>크레오에스지</b> 본사", link: "https://creoesg.co.kr", roadAddress: "충청남도 천안시 서북구 원두정8길 6", address: "충청남도 천안시 서북구 두정동 1" },
];

test("★★ 지역검색 — 이름·주소가 맞고 «링크가 있는» 업체만 확정한다", () => {
  const cands = CWM.naverLocalToCandidates(LOCAL);
  const m = CWM.findLocalMatch(cands, "(주)크레오에스지", "충청남도 천안시 서북구 원두정8길 6");
  assert.ok(m, "지역검색 일치를 못 찾았다");
  assert.equal(m.link, "https://creoesg.co.kr", "주소 다른 서울지점이나 링크 없는 업체가 걸렸다");
  assert.equal(m.title, "크레오에스지 본사", "<b> 태그가 안 걷혔다");
});

test("★★ 지역검색 — 주소가 다른 동명 업체는 확정하지 않는다", () => {
  const cands = CWM.naverLocalToCandidates([LOCAL[0]]);
  assert.equal(CWM.findLocalMatch(cands, "(주)크레오에스지", "충청남도 천안시 서북구 원두정8길 6"), null);
});

test("★ 지역검색 — 이름이 다른 업체는 주소가 같아도 확정하지 않는다", () => {
  const cands = CWM.naverLocalToCandidates([
    { title: "옆집식당", link: "https://food.example", roadAddress: "충청남도 천안시 서북구 원두정8길 6", address: "" },
  ]);
  assert.equal(CWM.findLocalMatch(cands, "(주)크레오에스지", "충청남도 천안시 서북구 원두정8길 6"), null);
});

test("웹문서 응답 → 후보 꼴 (태그 걷기, 링크 없는 것 버림)", () => {
  const cands = CWM.naverWebToCandidates([
    { title: "<b>크레오에스지</b>", link: "https://a.example", description: "천안 &amp; 아산" },
    { title: "링크 없음", link: "", description: "x" },
  ]);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].title, "크레오에스지");
  assert.equal(cands[0].snippet, "천안 & 아산");
});

test("같은 링크는 한 번만 (끝의 / 와 대소문자 차이는 같은 것으로)", () => {
  const out = CWM.uniqueByLink([
    { link: "https://creoesg.co.kr/" }, { link: "https://CREOESG.co.kr" }, { link: "https://other.example" }, { link: "" },
  ]);
  assert.equal(out.length, 2);
});
