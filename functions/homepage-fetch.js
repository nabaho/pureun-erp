"use strict";
// 홈페이지에서 읽어도 되는 쪽만 가린다. 이 파일은 읽기 대상을 정하는 유일한 자리다.

const ORIGIN = "https://xn--o80bs5mdnbm0bf80anms.kr";

/* ★ 관리 대상 «목록»은 이제 자료(homepage/config/pages)에 있다.
   목록을 이 파일에 박아 두면 홈페이지에 쪽을 새로 만들 때마다 함수를 다시 배포해야 했다.
   그래서 여기서는 «이름 규칙»으로 가린다 — 목록을 여는 것이지 아무 주소나 여는 것이 아니다.
   아래 ALLOWED 는 통합시스템이 처음부터 관리해 온 기본 8쪽(+people)이다. 이제 허용 판정에는
   쓰지 않지만, 자료가 비어 있을 때 화면이 보여주는 기본값과 같아야 해서 근거로 남긴다. */
const ALLOWED = [
  "people",   // 구성원 소개
  "greeting", // 인사말
  "inquiry",  // 오시는길
  "work1", "work2", "work3", "work4", "work5a", "work5b" // 주요업무
];

/* 쪽 이름 규칙 — 영문 소문자·숫자·밑줄 30자까지.
   이 규칙 하나로 다른 서버 주소(`https://…`)·상위 이동(`../`)·빗금(`//`)·물음표·인코딩(`%2f`)이
   모두 걸러진다. 규칙을 느슨하게 하면(점·빗금·대문자 허용) 그 통로가 다시 열린다. */
const NAME_RE = /^[a-z0-9_]{1,30}$/;

/* ★ 이름 규칙만으로는 «관리자 주소»가 통과한다(admin 은 영문 소문자다).
   관리자·설치·자료 폴더는 이름 규칙과 무관하게 막는다. 읽기 전용 함수라도 관리자 화면을
   서버가 대신 두드리게 만들 이유가 없다. */
const BLOCKED = [
  "admin", "administrator", "rhymix", "index",
  "install", "config", "files", "common", "modules", "addons", "layouts", "widgets",
  "login", "logout", "member"
];

function homepageUrl(path) {
  if (typeof path !== "string") return null;
  const key = path.replace(/^\/+/, "");
  if (!NAME_RE.test(key)) return null;
  if (BLOCKED.includes(key)) return null;
  return ORIGIN + "/" + key;
}

module.exports = { ORIGIN, ALLOWED, BLOCKED, NAME_RE, homepageUrl };
