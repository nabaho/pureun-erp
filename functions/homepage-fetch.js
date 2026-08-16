"use strict";
// 홈페이지에서 읽어도 되는 쪽만 가린다. 이 파일은 읽기 대상을 정하는 유일한 자리다.

const ORIGIN = "https://xn--o80bs5mdnbm0bf80anms.kr";

// 관리 대상인 쪽만 적는다. 여기 없는 주소는 읽지 않는다.
const ALLOWED = [
  "people",   // 구성원 소개
  "greeting", // 인사말
  "inquiry",  // 오시는길
  "work1", "work2", "work3", "work4", "work5a", "work5b" // 주요업무
];

function homepageUrl(path) {
  if (typeof path !== "string") return null;
  const key = path.replace(/^\/+/, "");
  if (!ALLOWED.includes(key)) return null;
  return ORIGIN + "/" + key;
}

module.exports = { ORIGIN, ALLOWED, homepageUrl };
