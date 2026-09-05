"use strict";
/* 판례 — 「제목과 링크」가 아니라 «판시사항·판결요지»까지 싣는다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-09-05: 「정리해서 첨부자료에 있어야된다.」

   ★ 판결문은 «저작권 대상이 아니다» — 저작권법 제7조 제4호(법원의 판결·결정·명령).
     그래서 기사와 달리 «내용을 그대로» 실을 수 있다. 실어야 한다.
     받으신 원본(8월 5주차)의 판례 칸이 그랬다:
       갈색 상자 안에 판시 요지 한 덩이, 그 아래 「* 사건 / * 원고 / * 피고 /
       * 원심판결 / * 판결선고」가 줄줄이. 링크 한 줄이 아니었다.

   ★ 어디서 오는가 — 법제처 «국가법령정보 공동활용»(DRF) 판례 API.
     news-brief 가 법령을 읽는 그 문이다(OC=test).
       목록: /DRF/lawSearch.do?target=prec
       한 건: /DRF/lawService.do?target=prec&ID=…

   ★ 이 파일은 «글자를 다루는 일»만 한다 — 바깥을 두드리는 것은 index.js.

   ⚠ 판시사항이 없으면 «싣지 않는다». 사건명만 있는 판례는
     「단체교섭청구의소」 같은 한 낱말이라, 상자에 넣으면 무슨 말인지 알 수 없다. */

var 밑 = "https://www.law.go.kr";

function 목록주소(낱말, 몇개) {
  return 밑 + "/DRF/lawSearch.do?OC=test&target=prec&type=XML&sort=ddes&search=2"
    + "&display=" + (Number(몇개) || 5)
    + "&query=" + encodeURIComponent(String(낱말 || ""));
}
function 한건주소(일련번호) {
  return 밑 + "/DRF/lawService.do?OC=test&target=prec&type=XML&ID="
    + encodeURIComponent(String(일련번호 || ""));
}
/* 사람이 눌러 볼 자리 — 서식 있는 쪽 */
function 보는주소(일련번호) {
  return 밑 + "/DRF/lawService.do?OC=test&target=prec&type=HTML&ID="
    + encodeURIComponent(String(일련번호 || ""));
}

/* ── 글자 다듬기 ────────────────────────────────────────────────────── */
function 풀기(s) {
  return String(s == null ? "" : s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&");
}

/* 판시사항·판결요지는 <br/> 로 줄을 나눈다. 태그는 벗기되 «줄은 살린다». */
function 글다듬기(s) {
  return 풀기(String(s == null ? "" : s).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function 뽑기(블록, 태그) {
  var m = new RegExp("<" + 태그 + ">(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + 태그 + ">")
    .exec(String(블록 == null ? "" : 블록));
  return m ? 글다듬기(m[1]) : "";
}

/* 2026.05.21 · 20260521 → 2026-05-21 */
function 날짜꼴(s) {
  var t = String(s == null ? "" : s).replace(/\D/g, "");
  return t.length === 8 ? t.slice(0, 4) + "-" + t.slice(4, 6) + "-" + t.slice(6) : "";
}
/* 2026-08-12 → 「2026. 8. 12.」 — 판결 인용은 이 꼴로 적는 것이 법조 관례다 */
function 선고꼴(s) {
  var d = 날짜꼴(s);
  if (!d) return "";
  var p = d.split("-");
  return p[0] + ". " + Number(p[1]) + ". " + Number(p[2]) + ".";
}

/* ── ① 목록 읽기 ───────────────────────────────────────────────────── */
function 목록읽기(xml) {
  var 덩이 = String(xml == null ? "" : xml).split(/<prec[\s>]/).slice(1);
  return 덩이.map(function (b) {
    return {
      일련번호: 뽑기(b, "판례일련번호"),
      사건명: 뽑기(b, "사건명"),
      사건번호: 뽑기(b, "사건번호"),
      선고일: 날짜꼴(뽑기(b, "선고일자")),
      법원: 뽑기(b, "법원명"),
      사건종류: 뽑기(b, "사건종류명"),
      판결유형: 뽑기(b, "판결유형"),
      출처: 뽑기(b, "데이터출처명")
    };
  }).filter(function (x) { return x.일련번호 && x.사건번호; });
}

/* ── ② 한 건 읽기 — 판시사항·판결요지까지 ───────────────────────────── */
function 한건읽기(xml) {
  var s = String(xml == null ? "" : xml);
  var 일련 = 뽑기(s, "판례정보일련번호");
  if (!일련) return null;
  return {
    일련번호: 일련,
    사건명: 뽑기(s, "사건명"),
    사건번호: 뽑기(s, "사건번호"),
    선고일: 날짜꼴(뽑기(s, "선고일자")),
    법원: 뽑기(s, "법원명"),
    사건종류: 뽑기(s, "사건종류명"),
    판결유형: 뽑기(s, "판결유형"),
    선고: 뽑기(s, "선고"),
    판시사항: 뽑기(s, "판시사항"),
    판결요지: 뽑기(s, "판결요지"),
    참조조문: 뽑기(s, "참조조문")
  };
}

/* ── ③ 노무 판례인가 ───────────────────────────────────────────────── */
var 노무말 = [
  "근로", "노동", "임금", "해고", "퇴직", "산재", "산업재해", "안전보건", "중대재해",
  "노동조합", "단체교섭", "단체협약", "파업", "쟁의", "최저임금", "통상임금", "평균임금",
  "연차", "휴업", "휴직", "징계", "전직", "전보", "부당노동행위", "노동위원회", "고용",
  "근로자", "사용자", "직장 내 괴롭힘", "직장내 괴롭힘", "성희롱", "재해보상", "요양급여"
];
/* ⚠ 낱말이 맞아도 사업장이 챙길 일이 아닌 것 — 형사 양형·조세 다툼이 섞여 온다 */
var 뺄말 = ["기타소득", "양도소득", "부가가치세", "상속", "증여", "관세"];

function 노무판례인가(한건) {
  var x = 한건 || {};
  var t = [x.사건명, x.판시사항, x.참조조문].join(" ");
  if (뺄말.some(function (w) { return t.indexOf(w) >= 0; })) return false;
  return 노무말.some(function (w) { return t.indexOf(w) >= 0; });
}

/* ── ④ 뉴스레터가 쓰는 «한 칸»으로 ─────────────────────────────────────
   ⚠ 여기서 나온 모양이 곧 편지에 그려진다(js/pu-news-tpl.js 의 판례칸).

   ★ 갈색 상자에 들어갈 «머리글»은 판시사항의 첫 덩이다.
     사건명(「단체교섭청구의소」)을 쓰면 무슨 판결인지 알 수 없다.
   ⚠ 판시사항이 없으면 «만들지 않는다» — 빈 상자가 나가는 것보다 안 싣는 것이 낫다. */
function 첫덩이(글, 길이) {
  var t = String(글 == null ? "" : 글).split("\n").filter(function (l) { return l.trim(); })[0] || "";
  /* 판시사항이 여럿이면 「[1] …」처럼 번호가 붙어 온다. 첫 덩이만 실으면서
     번호를 남기면 「[1]」로 시작하는 문장이 갈색 상자에 덩그러니 앉는다 —
     받으신 원본에는 그런 번호가 없다. */
  t = t.trim().replace(/^\[\d+\]\s*/, "");
  var 끝 = Number(길이) || 180;
  if (t.length <= 끝) return t;
  /* 문장 가운데서 자르지 않는다 — 마침표나 쉼표에서 끊는다 */
  var 자름 = t.slice(0, 끝);
  var i = Math.max(자름.lastIndexOf("."), 자름.lastIndexOf(","), 자름.lastIndexOf(" "));
  return (i > 60 ? 자름.slice(0, i) : 자름).trim() + "…";
}

function 판례로만들기(한건) {
  var x = 한건 || {};
  if (!x.일련번호 || !x.판시사항) return null;
  var 인용 = [x.법원, x.사건번호].filter(Boolean).join(" ")
    + (x.선고일 ? " (" + 선고꼴(x.선고일) + ")" : "");
  return {
    갈래: "판례",
    제목: 첫덩이(x.판시사항, 180),
    딱지: /재결|노동위원회/.test(x.사건명 || "") ? "[재결례]" : "[판례]",
    인용: 인용.trim(),
    사건명: String(x.사건명 || "").replace(/\s+/g, " ").trim(),
    사건번호: x.사건번호 || "",
    법원: x.법원 || "",
    선고일: x.선고일 || "",
    선고글: 선고꼴(x.선고일),
    사건종류: x.사건종류 || "",
    판결유형: x.판결유형 || "",
    판시사항: x.판시사항 || "",
    요지: 첫덩이(x.판결요지, 400),
    참조조문: String(x.참조조문 || "").replace(/\s+/g, " ").trim().slice(0, 200),
    링크: 보는주소(x.일련번호),
    일련번호: x.일련번호
  };
}

/* 겹치는 것 빼고 «최근 선고» 차례로 */
function 판례추리기(목록, 몇개) {
  var 본것 = {};
  return (목록 || [])
    .filter(function (x) { return x && x.일련번호; })
    .filter(function (x) { if (본것[x.일련번호]) return false; 본것[x.일련번호] = 1; return true; })
    .sort(function (a, b) { return String(b.선고일 || "").localeCompare(String(a.선고일 || "")); })
    .slice(0, 몇개 || 5);
}

/* 모으기·털기 — news-docs 와 같은 손버릇. 판례는 «90일»까지 둔다(드물게 나온다). */
function 모으기(모아둔것, 오늘판례, 오늘) {
  var 날 = String(오늘 || "").slice(0, 10);
  var 모음 = Object.assign({}, 모아둔것 || {});
  var 새로 = 0;
  (오늘판례 || []).forEach(function (x) {
    if (!x || !x.일련번호 || !x.제목) return;
    var 열쇠 = String(x.일련번호).replace(/[.#$/[\]]/g, "_");
    if (모음[열쇠]) return;
    모음[열쇠] = Object.assign({}, x, { 모은날: 날 });
    새로++;
  });
  return { 모음: 모음, 새로: 새로 };
}

function 오래된것털기(모아둔것, 오늘, 며칠) {
  var d = new Date(String(오늘 || "").slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return Object.assign({}, 모아둔것 || {});
  d.setUTCDate(d.getUTCDate() - (며칠 || 90));
  var 자른날 = d.toISOString().slice(0, 10);
  var 남길것 = {};
  Object.keys(모아둔것 || {}).forEach(function (k) {
    var v = (모아둔것 || {})[k];
    if (v && String(v.모은날 || "") >= 자른날) 남길것[k] = v;
  });
  return 남길것;
}

module.exports = {
  밑: 밑, 목록주소: 목록주소, 한건주소: 한건주소, 보는주소: 보는주소,
  풀기: 풀기, 글다듬기: 글다듬기, 뽑기: 뽑기, 날짜꼴: 날짜꼴, 선고꼴: 선고꼴,
  목록읽기: 목록읽기, 한건읽기: 한건읽기, 노무판례인가: 노무판례인가,
  첫덩이: 첫덩이, 판례로만들기: 판례로만들기, 판례추리기: 판례추리기,
  모으기: 모으기, 오래된것털기: 오래된것털기,
  노무말: 노무말, 뺄말: 뺄말
};
