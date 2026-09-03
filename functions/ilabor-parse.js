"use strict";
/* 한국공인노무사회 자료사이트(ilabor.co.kr) 읽개 — «글자만» 다룬다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-09-03: 「여기에서 자료와 데이터를 찾아서 가지고 와라. 정보도 첨부하고
   첨부자료도 넣어야 한다. 비번아이디를 연결해서 자동으로 되게 처리해달라.」

   ★ 이 파일은 바깥을 «두드리지 않는다» — 인터넷도 파이어베이스도 모른다.
     그래야 검사가 인터넷 없이 돌고, 실제 자료로 확인한 규칙이 굳는다.
     (functions/news-brief.js 와 같은 짜임)

   ★ 실측 2026-09-03 — 재 보고 알아낸 것만 적는다(짐작 아님)
     ① 목록(sub09_01.php)은 «로그인 없이» 보인다.
        한 줄 = 고유번호 · 제목 · 기관 · 날짜, 그리고 주소 안에 내부 번호 sid.
        ⚠ 고유번호(3430)와 sid(4156)는 «다른 수»다. 화면에 보이는 것은 고유번호,
          상세로 갈 때 쓰는 것은 sid — 헷갈리면 엉뚱한 자료를 연다.
     ② 상세(sub09_01_01.php?sid=…)는 «로그인 뒤에만» 열린다.
        로그인 없이 부르면 1,420바이트짜리 「로그인 후 이용가능합니다」만 온다.
     ③ ⚠ 로그인은 ilabor 가 «아니다». 공인노무사회 홈페이지(www.kcplaa.or.kr)에서
        하고 /sso/ilabor 로 넘겨받는다 — 아래 회원사이트 대목 참고.
        (처음에 ilabor 의 죽은 로그인 칸을 두드려 「로그인 정보가 존재하지 않습니다」를 받았다.)
     ④ 사이트가 «프로그램 접속을 막는다» — 브라우저 표시(User-Agent)가 없으면
        보안장비 오류쪽(se-cu.com)으로 302 로 튕겨 낸다.
        대표께 이 사실을 알리고 「나」(로그인해서 첨부까지)로 정하셨다.

   ⚠ 상세·첨부 읽개는 «로그인한 화면을 못 보고» 쓴 것이다.
     그래서 넉넉하게(여러 모양을 받아들이게) 짰고, 첫 회에는 엿보기로
     원본을 남겨 눈으로 맞추게 했다. 못 읽으면 «조용히 넘기지 않고» 말한다. */

const 벽 = "http://ilabor.co.kr";
const 사이트 = 벽 + "/main/";
/* ★ 로그인은 «여기»서 한다 — ilabor 가 아니라 공인노무사회 홈페이지다.
   ═══════════════════════════════════════════════════════════════════════════
   대표께서 화면으로 알려 주셨다(2026-09-03): 「공인노무사회에서 로그인 하면
   ilabor 로 들어갈 수 있고 여기서 자료를 찾을 수 있게 만들어져 있다.」

   ⚠ 처음에는 ilabor 의 로그인 칸(login_proc.php)에 아이디·비밀번호를 보냈다.
     그것은 «죽은 칸»이다 — 계정이 거기 없어서 사이트가
     「로그인 정보가 존재하지 않습니다」라고 답했다. 아이디가 틀린 것이 아니었다.
     (ilabor 로그인 쪽에도 「홈페이지 아이디/비밀번호로 통합되었으며」라고 적혀 있다.)

   ⚠ 반드시 «www.» 를 쓴다. www 없는 주소는 깨진 리다이렉트를 준다 —
     서버가 host 와 path 를 슬래시 없이 붙여 `www.kcplaa.or.krlogin` 으로 보낸다.
     그 주소는 이름 풀이가 안 되어 조용히 실패한다(2026-09-03 실측).

   ★ 세 걸음이다
     ① GET  회원사이트/login          — 세션 쿠키를 받는다
     ② POST 회원사이트/login/chk      — login_id · login_pass (칸 이름이 다르다!)
     ③ GET  회원사이트/sso/ilabor     — 답이 ilabor 로 갈 «주소»를 준다
        (쿠키는 도메인이 달라 못 건너간다. 그래서 주소로 넘겨준다.) */
const 회원사이트 = "https://www.kcplaa.or.kr";
const 로그인보내는곳 = 회원사이트 + "/login/chk";
const SSO주소 = 회원사이트 + "/sso/ilabor";
/* 사이트가 프로그램 접속을 막으므로 브라우저 표시를 붙인다(위 ④).
   ⚠ 이 값을 지우면 자료가 «하나도» 안 온다 — 오류도 안 나고 오류쪽 HTML 만 온다. */
const 브라우저표시 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/* ── 글자 다루기 ───────────────────────────────────────────────────────── */
function 풀기(s) {
  return String(s == null ? "" : s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");          /* & 를 맨 나중에 — 먼저 풀면 두 번 풀린다 */
}
function 글자만(s) {
  return 풀기(String(s == null ? "" : s).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

/* ── ① 막혔나 ──────────────────────────────────────────────────────────
   ★ «막힘»과 «내용 없음»을 가른다. 안 가르면 로그인이 풀린 것을
     「오늘은 자료가 없네」로 읽고 조용히 아무것도 안 가져온다. */
function 막혔나(html) {
  const s = String(html == null ? "" : html);
  /* ⚠ <script> 를 «먼저 걷는다». 멀쩡한 목록 쪽에도 「로그인 후 이용가능합니다」가
       스크립트 안에 들어 있다(누를 때 띄우는 말이다) — 안 걷으면 정상 쪽을
       막힘으로 보고 «자료를 하나도 못 가져온다». 검사가 이것을 잡았다(2026-09-03). */
  const 본문 = s.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  if (/로그인\s*후\s*이용/.test(본문)) return true;
  if (/login01\.php/.test(s) && s.length < 4000) return true;
  /* 보안장비가 튕겨 낸 것도 «막힘»이다 — 브라우저 표시를 빠뜨리면 이것이 온다 */
  if (/se-cu\.com|302\s*Found/.test(s) && s.length < 2000) return true;
  return false;
}

/* ── ② 로그인이 됐나 ──────────────────────────────────────────────────
   /login/chk 는 화면이 아니라 «틀(iframe)»에 답을 준다. 성공·실패를 글자로
   알려 주므로 그것을 본다.
   ⚠ 모르면 «실패로 본다» — 모르는 것을 성공으로 치면 그 뒤 모든 자료가
     「막힘」인데 까닭을 못 짚는다.
   ⚠ alert(...) 안의 말이 곧 까닭이다. 그것을 그대로 사람에게 보여 준다 —
     실제로 그 덕에 「엉뚱한 문을 두드리고 있었다」는 것을 알았다
     (ilabor 쪽이 「로그인 정보가 존재하지 않습니다」라고 답했다). */
const 실패말 = ["일치하지", "존재하지", "없는", "탈퇴", "정지", "확인해", "다시",
  "실패", "오류", "잘못"];

function 로그인됐나(html) {
  const 원 = String(html == null ? "" : html);
  /* alert('…') 안의 말을 먼저 캐낸다 — 거기에 까닭이 있다 */
  const a = /alert\s*\(\s*["']([\s\S]*?)["']\s*\)/.exec(원);
  const 말 = a ? 글자만(a[1]) : 글자만(원);
  if (a) return { ok: false, 까닭: 말.slice(0, 160) };
  if (실패말.some(function (w) { return 말.indexOf(w) >= 0; })) {
    return { ok: false, 까닭: 말.slice(0, 160) };
  }
  /* 어디론가 보내면 성공이다 */
  if (/location\s*\.\s*(href|replace)|top\.|parent\./.test(원)) return { ok: true, 까닭: "" };
  if (!말) return { ok: true, 까닭: "" };        /* 빈 답 = 조용한 성공 */
  return { ok: false, 까닭: 말.slice(0, 160) };
}

/* ── ②-1 SSO 답에서 «ilabor 로 갈 주소»를 뽑는다 ──────────────────────
   답이 `location.href='https://ilabor.co.kr…';` 꼴로 온다.
   ★ 로그인 «안 한» 채로 부르면 맨 주소(https://ilabor.co.kr)만 준다 — 실측.
     로그인한 뒤에는 열쇠가 붙은 주소가 올 것으로 본다. 그래서 «주소를 그대로 쓴다» —
     열쇠 이름을 짐작해 짜맞추지 않는다.
   ⚠ ilabor 주소가 아니면 안 받는다. 남이 이 답을 바꿔치기해도 엉뚱한 곳을
     우리 아이디로 열지 않게 한다. */
function sso주소뽑기(답) {
  const s = String(답 == null ? "" : 답);
  const m = /location\s*\.\s*(?:href|replace)\s*(?:=|\(\s*)\s*["']([^"']+)["']/.exec(s);
  let u = m ? 풀기(m[1]).trim() : "";
  if (!u) {
    /* 그냥 주소만 오는 경우도 받는다 */
    const m2 = /https?:\/\/[^\s"'<>]*ilabor\.co\.kr[^\s"'<>]*/i.exec(s);
    u = m2 ? m2[0] : "";
  }
  if (!u) return { ok: false, 까닭: "SSO 답에서 주소를 못 찾았다" };
  if (!/^https?:\/\/([a-z0-9-]+\.)*ilabor\.co\.kr(\/|$|\?)/i.test(u)) {
    return { ok: false, 까닭: "ilabor 주소가 아니다: " + u.slice(0, 120) };
  }
  /* 맨 주소면 «열쇠가 안 붙었다»는 뜻이다 — 로그인이 안 된 채로 부른 것이다.
     그대로 열면 손님으로 들어가 상세가 막힌다. 그 사실을 말해 준다. */
  const 열쇠붙음 = /[?&]/.test(u);
  return { ok: true, 주소: u, 열쇠붙음: 열쇠붙음 };
}

/* ── ③ 목록 읽기 ──────────────────────────────────────────────────────
   실제 줄 모양(2026-09-03 실측):
     <td …>3430</td>
     <td …><a href="sub09_01_01.php?sid=4156&…"><b>제목</b></a></td>
     <td …>재정경제부</td>
     <td …>2026-08-27</td>
   ⚠ 표가 여러 겹으로 싸여 있어 «tr 째로» 집으면 안 된다 — 안쪽 표까지 삼킨다.
     그래서 «a 태그를 열쇠로» 삼아, 그 앞뒤의 td 넷을 읽는다. */
function 목록읽기(html) {
  const s = String(html == null ? "" : html);
  const 것 = [];
  const 본것 = {};
  const re = /<td[^>]*>\s*(\d{1,7})\s*<\/td>\s*<td[^>]*>\s*<a\s+href="([^"]*sid=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/gi;
  let m;
  while ((m = re.exec(s))) {
    const sid = m[3];
    if (본것[sid]) continue;
    본것[sid] = 1;
    것.push({
      고유번호: m[1],
      sid: sid,
      제목: 글자만(m[4]),
      기관: 글자만(m[5]),
      날짜: m[6],
      주소: 사이트 + 풀기(m[2]).replace(/^\.\//, "")
    });
  }
  return 것;
}

/* 몇 쪽까지 있나 — 안 보면 첫 쪽만 가져오고 「자료가 이것뿐」이라 여긴다 */
function 쪽수(html) {
  const n = [...String(html == null ? "" : html).matchAll(/page=(\d+)/g)]
    .map((m) => Number(m[1])).filter((x) => x > 0 && x < 2000);
  return n.length ? Math.max.apply(null, n) : 1;
}

/* ── ④ 상세 읽기 ──────────────────────────────────────────────────────
   ⚠ 로그인한 화면을 «못 보고» 쓴 것이다. 그래서
     · 여러 모양을 받아들이고
     · 못 읽었으면 «못 읽었다고 말한다»(빈 값을 성공으로 돌려주지 않는다)
   맞추는 일은 첫 회 엿보기(원본 남기기)로 한다. */
const 첨부꼴 = /\.(pdf|hwp|hwpx|docx?|xlsx?|pptx?|zip|jpg|jpeg|png|gif|txt|csv)$/i;

function 첨부읽기(html) {
  const s = String(html == null ? "" : html);
  const 것 = [];
  const 본것 = {};
  const re = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(s))) {
    const 속 = m[1];
    const 글 = 글자만(m[2]);
    const h = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(속);
    if (!h) continue;
    let 주소 = 풀기(h[1] !== undefined ? h[1] : h[2]).trim();
    if (!주소 || /^(#|javascript:|mailto:)/i.test(주소)) continue;
    /* «내려받는 것»으로 보이는 두 가지: 내려받기 스크립트이거나, 파일 이름꼴이거나 */
    const 내려받기 = /down|file|attach|upload/i.test(주소);
    const 파일꼴 = 첨부꼴.test(주소.split("?")[0]) || 첨부꼴.test(글);
    if (!내려받기 && !파일꼴) continue;
    /* 화면 꾸밈 그림은 첨부가 아니다 */
    if (/\/(img|images|css|js|skin)\//i.test(주소)) continue;
    const 온주소 = /^https?:\/\//i.test(주소) ? 주소
      : (주소.charAt(0) === "/" ? 벽 + 주소 : 사이트 + 주소.replace(/^\.\//, ""));
    if (본것[온주소]) continue;
    본것[온주소] = 1;
    것.push({ 이름: 글 || 파일이름(온주소), 주소: 온주소 });
  }
  return 것;
}

function 파일이름(주소) {
  const t = String(주소 || "").split("?")[0].split("/").pop();
  return t ? decodeURIComponent(t) : "자료";
}

function 상세읽기(html) {
  const s = String(html == null ? "" : html);
  if (막혔나(s)) return { ok: false, 까닭: "막혔다 — 로그인이 풀렸거나 브라우저 표시가 없다" };

  const 제목 = 글자만((/<title>([\s\S]*?)<\/title>/i.exec(s) || [])[1] || "")
    .replace(/\s*-\s*한국공인노무사회.*$/, "").trim();
  const 날짜 = (/(\d{4}-\d{2}-\d{2})/.exec(글자만(s)) || [])[1] || "";
  const 첨부 = 첨부읽기(s);

  /* 본문은 «글자로만» 담는다 — 남의 서식·그림을 우리 자리로 옮기지 않는다.
     길이를 자른다: 자료 하나가 수십 KB 면 자리가 금방 부푼다. */
  const 본문 = 글자만(
    s.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
  ).slice(0, 4000);

  /* 아무것도 못 건졌으면 «성공이라 하지 않는다» */
  if (!제목 && !첨부.length && 본문.length < 40) {
    return { ok: false, 까닭: "읽을 것이 없다 — 상세 쪽 모양이 바뀐 듯하다(엿보기로 확인할 것)" };
  }
  return { ok: true, 제목: 제목, 날짜: 날짜, 본문: 본문, 첨부: 첨부 };
}

/* ── ⑤ 무엇을 새로 가져올까 ───────────────────────────────────────────
   ★ 이미 가진 것은 다시 안 부른다. 남의 서버를 하루에 몇백 번 두드릴 일이 아니다.
   ★ 한 번에 가져오는 수에 «상한»을 둔다 — 상한이 없으면 첫 회에 3,430건을 부른다. */
function 새것고르기(목록, 가진것, 상한) {
  const 있 = 가진것 || {};
  const n = (상한 && 상한 > 0) ? 상한 : 20;
  return (목록 || [])
    .filter(function (x) { return x && x.sid && !있[x.sid]; })
    .slice(0, n);
}

/* 첨부를 내려받을까 — 크기·개수에 울타리를 둔다.
   ⚠ 창고는 무료 한도가 없다. 울타리가 없으면 요금이 조용히 늘어난다. */
const 첨부최대바이트 = 20 * 1024 * 1024;      /* 한 파일 20MB */
const 첨부최대개수 = 5;                        /* 자료 하나에 5개까지 */

function 첨부거르기(첨부들) {
  return (첨부들 || []).slice(0, 첨부최대개수);
}
function 너무크나(바이트) {
  const n = Number(바이트);
  return isFinite(n) && n > 첨부최대바이트;
}

/* 창고에 담을 자리 이름 — 파이어베이스가 못 쓰는 글자를 없앤다 */
function 창고자리(sid, 이름) {
  const 깨끗 = String(이름 || "자료").replace(/[\\/:*?"<>|\r\n#[\]]/g, "_").slice(0, 120);
  return "ilabor/" + String(sid || "0").replace(/\D/g, "") + "/" + 깨끗;
}

module.exports = {
  벽, 사이트, 브라우저표시,
  회원사이트, 로그인보내는곳, SSO주소,
  풀기, 글자만, 파일이름,
  막혔나, 로그인됐나, sso주소뽑기, 목록읽기, 쪽수, 첨부읽기, 상세읽기,
  새것고르기, 첨부거르기, 너무크나, 창고자리,
  첨부최대바이트, 첨부최대개수
};
