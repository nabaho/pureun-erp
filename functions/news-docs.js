"use strict";
/* 발간자료 — 「법제처 링크」가 아니라 «자료 그 자체»를 가져온다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-09-05: 「자료가 법제처에서 나오면 안된다. 정리해서 첨부자료에
   있어야된다. … 시스템을 자동으로 찾아오고 데이터를 다운받아서 확인할 수 있게
   만들어라.」

   ★ 무엇이 달라지나
     예전: 「근로기준법 시행령 … 〈법제처에서 보기〉」 — 손님이 눌러 법전으로 간다.
     이제: 「사업주와 인사담당자를 위한 난임치료휴가 및 급여제도 활용가이드
            · 고용노동부 · 목차 · 〈내려받기 756KB〉」 — 자료를 바로 받는다.

   ★ 어디서 오는가 — 고용노동부 «정책자료실»이다.
     받으신 원본(8월 5주차)의 「고용·노동정책」에 실린 두 건이
     그대로 여기에 있다(2026-09-05 실측):
       · 사업주와 인사담당자를 위한 난임치료휴가 및 급여제도 활용가이드 (08-24)
       · 마트배송 직종 표준계약서 및 활용가이드 (08-26)
     짐작이 아니라 «맞춰 본 것»이다.

   ★ 이 파일은 «글자를 다루는 일»만 한다. 바깥을 두드리는 것은 index.js 가 한다 —
     그래야 검사가 인터넷 없이 돈다. (news-brief.js 와 같은 규칙)

   ⚠ 남의 집 화면을 읽는 일이라 «언젠가 반드시 모양이 바뀐다».
     그래서 못 읽으면 «빈손을 돌려준다» — 절대로 반쯤 읽은 것을 돌려주지 않는다.
     반쯤 읽은 자료가 뉴스레터로 나가면 제목만 있고 파일이 없는 칸이 된다. */

var 밑 = "https://www.moel.go.kr";

/* 목록·상세 주소 — 한 곳에만 적는다. 주소가 바뀌면 여기만 고친다. */
function 목록주소(쪽) {
  var p = Math.max(1, Number(쪽) || 1);
  return 밑 + "/policy/policydata/list.do?pageIndex=" + p;
}
function 상세주소(일련번호) {
  return 밑 + "/policy/policydata/view.do?bbs_seq=" + encodeURIComponent(String(일련번호 || ""));
}

/* ── 글자 다듬기 ────────────────────────────────────────────────────── */

function 풀기(s) {
  return String(s == null ? "" : s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&");
}

function 태그벗기기(s) {
  return 풀기(String(s == null ? "" : s).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* 2026.09.03 · 2026-09-03 · 20260903 → 2026-09-03 */
function 날짜꼴(s) {
  var t = String(s == null ? "" : s).replace(/\D/g, "");
  return t.length === 8 ? t.slice(0, 4) + "-" + t.slice(4, 6) + "-" + t.slice(6) : "";
}

/* 774447 → 「756KB」. 사람이 «누르기 전에» 얼마짜리인지 알아야 한다. */
function 크기글(바이트) {
  var n = Number(바이트);
  if (!isFinite(n) || n <= 0) return "";
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + "KB";
  return (Math.round(n / (1024 * 1024) * 10) / 10) + "MB";
}

/* ── ① 목록 한 쪽 읽기 ─────────────────────────────────────────────────
   한 줄(<tr>)이 자료 하나다. 줄 안에서 «세 가지»를 찾는다:
     · 일련번호 (bbs_seq)  · 제목 (a 태그의 title)  · 등록일 (aria-label)
   ⚠ 줄째로 자른다. 표 전체에 정규식을 걸면 다음 줄의 날짜를 앞 줄이 집어 간다. */
function 칸값(줄, 이름) {
  var m = new RegExp('aria-label="' + 이름 + '"[^>]*>([\\s\\S]*?)<\\/td>', "i").exec(String(줄 || ""));
  return m ? 태그벗기기(m[1]) : "";
}

function 목록읽기(html) {
  var 줄들 = String(html == null ? "" : html).split(/<tr[\s>]/i).slice(1);
  var out = [];
  줄들.forEach(function (r) {
    var a = /<a\s[^>]*href="[^"]*bbs_seq=(\d+)[^"]*"[^>]*>/i.exec(r);
    if (!a) return;
    var 일련 = a[1];
    var t = /\stitle="([^"]*)"/i.exec(a[0]);
    var 제목 = t ? 풀기(t[1]).replace(/\s+/g, " ").trim() : "";
    if (!제목) {
      /* title 이 없으면 링크 «속 글자»로 — 화면이 바뀌어도 한 겹 더 버틴다 */
      var inner = new RegExp('<a\\s[^>]*bbs_seq=' + 일련 + '[\\s\\S]*?>([\\s\\S]*?)<\\/a>', "i").exec(r);
      제목 = inner ? 태그벗기기(inner[1]).replace(/\s+/g, " ").trim() : "";
    }
    if (!제목) return;
    out.push({
      일련번호: 일련,
      제목: 제목,
      부서: 칸값(r, "담당부서"),
      등록일: 날짜꼴(칸값(r, "등록일")),
      링크: 상세주소(일련)
    });
  });
  return out;
}

/* ── ② 상세 한 쪽 읽기 ───────────────────────────────────────────────── */

/* <dt>등록일</dt><dd>2026-08-24</dd> 에서 dd 를 꺼낸다 */
function 적힌값(html, 이름) {
  var m = new RegExp("<dt>\\s*" + 이름 + "\\s*<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>", "i")
    .exec(String(html == null ? "" : html));
  return m ? 태그벗기기(m[1]) : "";
}

/* 첨부 목록.
   ⚠ 한 <li> 안에 내려받기 링크가 «둘» 있다(파일이름 링크 + 「다운로드」 단추).
     주소가 같으니 <li> 마다 하나만 집는다. 안 그러면 첨부가 두 배로 보인다. */
function 첨부읽기(html) {
  var s = String(html == null ? "" : html);
  var 덩이 = /<div class="file">([\s\S]*?)<\/div>/i.exec(s);
  if (!덩이) return [];
  var 칸들 = 덩이[1].split(/<li[\s>]/i).slice(1);
  var out = [];
  var 본것 = {};
  칸들.forEach(function (li) {
    var a = /href="([^"]*downloadFile\.do\?[^"]*)"/i.exec(li);
    if (!a) return;
    var 주소 = 풀기(a[1]);
    if (본것[주소]) return;
    본것[주소] = 1;
    var t = /\stitle="([^"]*)"/i.exec(li);
    var 이름 = t ? 풀기(t[1]).replace(/\s*다운로드\s*$/, "").trim() : "";
    if (!이름) {
      var inner = /<a[^>]*downloadFile\.do[\s\S]*?>([\s\S]*?)<\/a>/i.exec(li);
      이름 = inner ? 태그벗기기(inner[1]) : "";
    }
    var e = /file_ext=([a-z0-9]+)/i.exec(주소);
    var 확장자 = e ? e[1].toLowerCase() : (/\.([a-z0-9]{2,5})$/i.exec(이름) || [, ""])[1].toLowerCase();
    out.push({
      이름: 이름 || ("첨부." + (확장자 || "bin")),
      주소: /^https?:\/\//i.test(주소) ? 주소 : (밑 + 주소),
      확장자: 확장자
    });
  });
  return out;
}

/* 목차 — 본문 설명 안에 「1. …」처럼 적혀 있으면 뽑는다.
   ★ 원본 뉴스레터의 자료 칸은 «제목 아래 목차 두세 줄»이 있어야 자료 같아 보인다.
   ⚠ 없는 것이 보통이다. 그때는 빈 배열이다 — 화면에서 대표가 채우신다.
     지어내지 않는다. 자료 목차를 기계가 지어내면 «없는 내용»이 뉴스레터에 실린다. */
var 번호꼴 = /^\s*(?:\d{1,2}\s*[.)]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.)]?|[①-⑩]|[가-하]\s*[.)]|[-·•▪]\s*)\s*(.+)$/;
function 목차뽑기(글, 몇개) {
  var 줄들 = 태그벗기기(글).split(/\n+/);
  var out = [];
  줄들.forEach(function (l) {
    var m = 번호꼴.exec(l);
    if (!m) return;
    var t = String(m[1] || "").trim();
    if (t.length < 2 || t.length > 90) return;
    out.push(t);
  });
  return out.slice(0, 몇개 || 4);
}

function 상세읽기(html, 일련번호) {
  var s = String(html == null ? "" : html);
  var 제목 = 적힌값(s, "제목");
  if (!제목) return null;                       /* ⚠ 못 읽으면 빈손 — 반쯤 읽지 않는다 */
  var 설명 = "";
  var b = /<div class="b_content">([\s\S]*?)<\/div>/i.exec(s);
  if (b) 설명 = 태그벗기기(b[1]);
  return {
    일련번호: String(일련번호 || ""),
    제목: 제목.replace(/\s+/g, " ").trim(),
    등록일: 날짜꼴(적힌값(s, "등록일")),
    부서: 적힌값(s, "담당부서").replace(/\s+/g, " ").trim(),
    담당자: 적힌값(s, "담당자").replace(/\s+/g, " ").trim(),
    전화: 적힌값(s, "전화번호").replace(/\s+/g, " ").trim(),
    설명: 설명,
    파일들: 첨부읽기(s)
  };
}

/* ── ③ 실을 만한 자료인가 ──────────────────────────────────────────────
   고용노동부 정책자료실이라 대부분이 노무 자료다. 그래서 «거르기»보다
   «값어치 매기기»가 맞다 — 좋은 것을 위로 올리고, 나쁜 것만 뺀다.

   ★ 「가이드·매뉴얼·안내·지침」이 붙은 것이 사업장에 바로 쓸모가 있다.
     원본 뉴스레터에 실린 두 건이 모두 「활용가이드」였다. */
var 좋은말 = ["가이드", "매뉴얼", "안내서", "해설", "길잡이", "편람", "사례집",
  "표준계약서", "취업규칙", "Q&A", "질의회시", "지침", "안내", "제도"];
var 뺄말 = ["입찰", "공고", "채용", "청렴", "인사발령", "시무식", "축사", "부고",
  "위원 위촉", "정기간행물 등록", "오픈채팅방"];

function 뺄자료인가(제목) {
  var t = String(제목 == null ? "" : 제목);
  return 뺄말.some(function (w) { return t.indexOf(w) >= 0; });
}

function 자료값어치(제목) {
  var t = String(제목 == null ? "" : 제목);
  if (뺄자료인가(t)) return -1;
  var 점 = 0;
  좋은말.forEach(function (w, i) {
    if (t.indexOf(w) >= 0) 점 += (i < 7 ? 3 : 1);      /* 앞쪽 말이 더 값어치 있다 */
  });
  return 점;
}

/* 값어치 높은 것 → 최근 것 차례로. 겹치는 일련번호는 하나만. */
function 자료추리기(목록, 몇개) {
  var 본것 = {};
  return (목록 || [])
    .filter(function (x) { return x && x.제목 && !뺄자료인가(x.제목); })
    .filter(function (x) { if (본것[x.일련번호]) return false; 본것[x.일련번호] = 1; return true; })
    .sort(function (a, b) {
      var d = 자료값어치(b.제목) - 자료값어치(a.제목);
      if (d) return d;
      return String(b.등록일 || "").localeCompare(String(a.등록일 || ""));
    })
    .slice(0, 몇개 || 6);
}

/* ── ④ 뉴스레터가 쓰는 «한 칸»으로 ─────────────────────────────────────
   ⚠ 여기서 나온 모양이 곧 편지에 그려진다(js/pu-news-tpl.js 의 자료칸).
     칸 이름을 바꾸면 «두 곳»을 함께 고친다. */
function 자료로만들기(상세, 옵션) {
  var d = 상세 || {};
  if (!d.제목) return null;
  var O = 옵션 || {};
  var 첫파일 = (d.파일들 || [])[0] || null;
  return {
    갈래: "자료",
    제목: d.제목,
    발행처: O.발행처 || "고용노동부",
    부서: d.부서 || "",
    발행일: d.등록일 || "",
    설명: (d.설명 || "").slice(0, 300),
    목차: 목차뽑기(d.설명, 4),
    표지: "",                                    /* 그림은 나중에 — 없으면 글자 표지 */
    파일: 첫파일 ? 첫파일.주소 : "",
    파일이름: 첫파일 ? 첫파일.이름 : "",
    확장자: 첫파일 ? 첫파일.확장자 : "",
    파일크기: 0,                                 /* 내려받아 본 뒤에 채운다 */
    링크: 상세주소(d.일련번호),
    일련번호: String(d.일련번호 || "")
  };
}

/* 모아 둔 것에 오늘 읽은 것을 얹는다 — news-brief 의 모으기 와 같은 손버릇.
   ★ 열쇠는 일련번호다. 같은 자료가 여러 날 목록 맨 위에 남아 있다. */
function 모으기(모아둔것, 오늘자료, 오늘) {
  var 날 = String(오늘 || "").slice(0, 10);
  var 모음 = Object.assign({}, 모아둔것 || {});
  var 새로 = 0;
  (오늘자료 || []).forEach(function (x) {
    if (!x || !x.일련번호 || !x.제목) return;
    var 열쇠 = String(x.일련번호).replace(/[.#$/[\]]/g, "_");
    if (모음[열쇠]) return;
    모음[열쇠] = Object.assign({}, x, { 모은날: 날 });
    새로++;
  });
  return { 모음: 모음, 새로: 새로 };
}

/* 오래된 것 털기 — 자료는 뉴스보다 오래 쓸모가 있어 «60일»까지 둔다 */
function 오래된것털기(모아둔것, 오늘, 며칠) {
  var d = new Date(String(오늘 || "").slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return Object.assign({}, 모아둔것 || {});
  d.setUTCDate(d.getUTCDate() - (며칠 || 60));
  var 자른날 = d.toISOString().slice(0, 10);
  var 남길것 = {};
  Object.keys(모아둔것 || {}).forEach(function (k) {
    var v = (모아둔것 || {})[k];
    if (v && String(v.모은날 || "") >= 자른날) 남길것[k] = v;
  });
  return 남길것;
}

module.exports = {
  밑: 밑, 목록주소: 목록주소, 상세주소: 상세주소,
  풀기: 풀기, 태그벗기기: 태그벗기기, 날짜꼴: 날짜꼴, 크기글: 크기글,
  목록읽기: 목록읽기, 상세읽기: 상세읽기, 첨부읽기: 첨부읽기, 목차뽑기: 목차뽑기,
  뺄자료인가: 뺄자료인가, 자료값어치: 자료값어치, 자료추리기: 자료추리기,
  자료로만들기: 자료로만들기, 모으기: 모으기, 오래된것털기: 오래된것털기,
  좋은말: 좋은말, 뺄말: 뺄말
};
