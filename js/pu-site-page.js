/* 새 홈페이지의 «쪽 본문»을 우리 자료로 고친다 — 마크업은 한 글자도 안 건드린다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 홈페이지를 새로 만들고 푸른ERP 에서 고친다.

   ★ 구성원은 카드를 «찍어 내면» 됐다. 쪽은 다르다 — 본문 안에 지도 위젯·지사 탭·표·
     구획이 들어 있어, 통째로 갈아 끼우면 그것들이 통째로 사라진다.
     그래서 여기서도 «바뀐 줄의 글자만» 제자리에서 갈아 끼운다.
     (그 일은 이미 검증된 부품이 한다 — PuHomeFill.applyLineEdits.
      실제 홈페이지 열두 쪽으로 「태그가 한 글자도 안 바뀐다」를 증명해 둔 그것이다.)

   ★ 여기서 더 하는 일은 하나뿐: «본문 자리만» 골라 준다.
     쪽 전체에 대고 갈아 끼우면 머리띠·발·상담문의 띠의 글자까지 후보가 된다.
     이를테면 전화번호는 발에도 있어, 본문의 전화번호를 고치려다 «두 군데라 못 한다»고
     건너뛰게 된다. 본문만 떼어 주면 그런 헛걸림이 사라진다. */
(function (global) {
  'use strict';

  /* 본문이 시작하고 끝나는 «자리»(글자 번호)를 돌려준다.
     ★ PuHomeParse.pageBodyHtml 은 script·style 을 걷어낸 «다른 글»에서 자른다 —
       거기서 나온 자리 번호를 원문에 쓰면 어긋난다. 그래서 원문에서 다시 잰다. */
  function 본문자리(html) {
    var s = String(html == null ? '' : html);
    var i = s.indexOf('bh_page_widget_inner');
    if (i < 0) return null;
    var 시작 = s.indexOf('>', i);
    if (시작 < 0) return null;
    시작 += 1;
    var m = /<footer/i.exec(s.slice(시작));
    var 끝 = m ? 시작 + m.index : s.length;
    return { 시작: 시작, 끝: 끝 };
  }

  /* 쪽 하나를 고친다. 고칠 것은 [{before, after}] 목록이다.
     돌려주는 것: { html, done, skipped } — 부품이 돌려주는 그대로에 쪽 글자만 얹는다. */
  function 쪽고치기(html, edits, applyLineEdits) {
    var 자리 = 본문자리(html);
    if (!자리) {
      return { html: html, done: [],
               skipped: (edits || []).map(function (e) {
                 return { before: e.before, why: '이 쪽에서 «본문 자리»를 찾지 못했습니다' };
               }) };
    }
    var 앞 = html.slice(0, 자리.시작);
    var 본문 = html.slice(자리.시작, 자리.끝);
    var 뒤 = html.slice(자리.끝);
    var out = applyLineEdits(본문, edits || []);
    return { html: 앞 + out.html + 뒤, done: out.done, skipped: out.skipped };
  }

  /* 화면이 고쳐 둔 것({원래글: 고친글})을 부품이 먹는 모양으로 바꾼다.
     ★ 바뀐 것이 없는 줄은 빼고 보낸다 — 헛일을 시키지 않는다. */
  function 고칠줄(fix) {
    var out = [];
    Object.keys(fix || {}).forEach(function (k) {
      var v = String(fix[k] == null ? '' : fix[k]);
      if (!v.trim() || v === k) return;
      out.push({ before: k, after: v });
    });
    return out;
  }

  global.PuSitePage = {
    본문자리: 본문자리,
    쪽고치기: 쪽고치기,
    고칠줄: 고칠줄
  };
})(typeof window !== 'undefined' ? window : globalThis);
