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

test("후보가 비어 있으면 null", () => {
  assert.equal(CWM.findMatch([], "아무회사", "서울"), null);
  assert.equal(CWM.findMatch(null, "아무회사", "서울"), null);
});
