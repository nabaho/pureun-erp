"use strict";
/* 노동 뉴스·법령 브리핑을 만든다 — 매일 아침 공지사항에 저절로 올라간다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 「노동뉴스 + 법령 완전자동」.

   ★ 기사 «본문»은 옮기지 않는다 — 남의 글이다.
     제목과 날짜, 그리고 «원문으로 가는 링크»까지가 우리가 실을 수 있는 것이다.
     읽으실 분은 그 신문사로 간다. 이건 취향이 아니라 저작권이다.
     (법령은 저작권 대상이 아니라 그대로 실어도 된다.)

   ★ 이 파일은 «글자를 다루는 일»만 한다. 바깥을 두드리는 것은 index.js 가 한다 —
     그래야 검사가 인터넷 없이 돈다.

   ★ 자동이라서 더 조심할 것
     ① 못 읽으면 «아무것도 안 올린다». 빈 브리핑을 올리면 그날 공지가 빈 껍데기가 된다.
     ② 노동과 무관한 기사를 거른다(신문사 RSS 에 다른 매체 글이 섞여 온다 — 실제로 봤다).
     ③ 같은 날 두 번 올리지 않는다(날짜가 열쇠다). */

/* ── 남이 준 XML 에서 글자 뽑기 ── */
function 뽑기(블록, 태그) {
  const m = new RegExp("<" + 태그 + "[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + 태그 + ">")
    .exec(String(블록 == null ? "" : 블록));
  return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function 감싸기(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── ① 노동 뉴스 (RSS) ── */

/* 노동과 «상관있는» 글만 남긴다.
   ★ 신문사 RSS 에는 다른 매체 글이 섞여 온다(실제로 「파인데일리 - 정치」가 왔다).
     자동으로 올라가는 자리라, 걸러 내지 않으면 엉뚱한 기사 제목이 법인 이름으로 나간다. */
const 노동말 = [
  "노동", "근로", "임금", "해고", "산재", "산업재해", "안전보건", "중대재해",
  "노조", "노동조합", "단체교섭", "파업", "최저임금", "고용", "실업", "퇴직",
  "연차", "휴가", "근무", "직장", "노무", "노동위원회", "고용노동부", "산업안전"
];
function 노동글인가(제목) {
  const t = String(제목 == null ? "" : 제목);
  return 노동말.some(function (w) { return t.indexOf(w) >= 0; });
}

function 뉴스읽기(xml, 언론사) {
  const 글 = String(xml == null ? "" : xml).split(/<item[^>]*>/).slice(1);
  return 글.map(function (b) {
    return {
      제목: 뽑기(b, "title"),
      링크: 뽑기(b, "link"),
      날짜: 뽑기(b, "pubDate"),
      언론사: 언론사 || ""
    };
  }).filter(function (x) {
    return x.제목 && /^https?:\/\//.test(x.링크) && 노동글인가(x.제목);
  });
}

/* ── ② 법령 (법제처 공동활용) ── */
function 법령읽기(xml) {
  const 덩이 = String(xml == null ? "" : xml).split(/<law[^>]*>/).slice(1);
  return 덩이.map(function (b) {
    return {
      이름: 뽑기(b, "법령명한글"),
      구분: 뽑기(b, "법령구분명"),
      고친결: 뽑기(b, "제개정구분명"),
      공포일: 뽑기(b, "공포일자"),
      시행일: 뽑기(b, "시행일자"),
      부처: 뽑기(b, "소관부처명"),
      링크: 뽑기(b, "법령상세링크")
    };
  }).filter(function (x) { return x.이름; });
}

/* 20260825 → 2026-08-25 */
function 날짜꼴(s) {
  const t = String(s == null ? "" : s).replace(/\D/g, "");
  return t.length === 8 ? t.slice(0, 4) + "-" + t.slice(4, 6) + "-" + t.slice(6) : t;
}

/* 겹치는 법령을 하나로 모으고, «공포일이 가까운 것»부터 */
function 법령추리기(목록, 몇개) {
  const 본것 = {};
  return (목록 || [])
    .filter(function (x) { if (본것[x.이름]) return false; 본것[x.이름] = 1; return true; })
    .sort(function (a, b) { return String(b.공포일).localeCompare(String(a.공포일)); })
    .slice(0, 몇개 || 5);
}

/* ── ③ 브리핑 한 장 만들기 ── */
function 브리핑(뉴스, 법령, 오늘) {
  const 날 = String(오늘 || "").slice(0, 10);
  const 뉴스목록 = (뉴스 || []).slice(0, 7);
  const 법령목록 = (법령 || []).slice(0, 5);

  /* ★ 둘 다 비면 «만들지 않는다». 빈 브리핑을 올리면 그날 공지가 빈 껍데기가 된다. */
  if (!뉴스목록.length && !법령목록.length) return null;

  const 줄 = [];
  줄.push('<p>' + 감싸기(날) + ' 기준, 인사·노무 관련 소식을 모았습니다.</p>');

  if (법령목록.length) {
    줄.push('<h3>법령 소식</h3>');
    줄.push('<ul>');
    법령목록.forEach(function (x) {
      줄.push('<li><strong>' + 감싸기(x.이름) + '</strong>'
        + (x.구분 ? ' (' + 감싸기(x.구분) + ')' : '')
        + (x.고친결 ? ' — ' + 감싸기(x.고친결) : '')
        + '<br><span>공포 ' + 감싸기(날짜꼴(x.공포일))
        + ' · 시행 ' + 감싸기(날짜꼴(x.시행일))
        + (x.부처 ? ' · ' + 감싸기(x.부처) : '') + '</span>'
        + (x.링크 ? ' <a href="https://www.law.go.kr' + 감싸기(x.링크)
            + '" target="_blank" rel="noopener">법제처에서 보기</a>' : '')
        + '</li>');
    });
    줄.push('</ul>');
  }

  if (뉴스목록.length) {
    줄.push('<h3>노동 뉴스</h3>');
    /* ★ 제목과 링크만 싣는다 — 기사 본문은 남의 글이다 */
    줄.push('<ul>');
    뉴스목록.forEach(function (x) {
      줄.push('<li><a href="' + 감싸기(x.링크) + '" target="_blank" rel="noopener">'
        + 감싸기(x.제목) + '</a>'
        + (x.언론사 ? ' <span>· ' + 감싸기(x.언론사) + '</span>' : '') + '</li>');
    });
    줄.push('</ul>');
    줄.push('<p><span>기사 제목과 링크만 싣습니다. 본문은 각 언론사 홈페이지에서 보실 수 있습니다.</span></p>');
  }

  줄.push('<p><span>이 글은 푸른ERP 가 매일 아침 자동으로 올립니다.</span></p>');

  return {
    제목: '노동 뉴스·법령 브리핑 (' + 날 + ')',
    본문: 줄.join("\n"),
    요약: '인사·노무 관련 법령 ' + 법령목록.length + '건, 노동 뉴스 ' + 뉴스목록.length + '건',
    날짜: 날
  };
}

module.exports = {
  뽑기, 감싸기, 노동글인가, 뉴스읽기, 법령읽기, 날짜꼴, 법령추리기, 브리핑
};
