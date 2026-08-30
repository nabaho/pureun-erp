/* 푸른통합시스템 — 홈페이지 화면 읽어내기 층
   서버가 가져온 홈페이지 HTML 에서 구성원과 쪽 본문을 뽑는다.
   읽기만 한다. 저장도 판단도 하지 않는다 — 그래서 이 파일이 자료를 망칠 길이 없다. */
(function (global) {
  'use strict';

  /* 태그를 걷어내고 겹공백을 하나로 만든다. 대조할 때 눈에 안 보이는 공백 차이로
     「다름」이 쏟아지는 것을 막는 유일한 자리다. */
  function tidy(s) {
    return String(s || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseMembers(html) {
    const src = String(html || '');
    const out = [];
    const blocks = src.split(/<div id="bh_modal_(\d+)"/);
    // blocks[0] 은 첫 덩어리 앞부분이라 버린다. 이후 [번호, 내용] 이 짝으로 온다.
    for (let i = 1; i < blocks.length; i += 2) {
      const srl = blocks[i];
      const body = blocks[i + 1] || '';

      const head = body.match(/<div class="bh_title">([\s\S]*?)<div class="position">([\s\S]*?)<\/div>/);
      if (!head) continue;

      const nameCell = head[1];
      const sub = nameCell.match(/<span class="pl-5">([\s\S]*?)<\/span>/);
      const position1 = sub ? tidy(sub[1]) : '';
      const position2 = tidy(head[2]);
      const name = tidy(nameCell.replace(/<span class="pl-5">[\s\S]*?<\/span>/, ''));

      const desc = body.match(/<div class="desc">([\s\S]*?)<\/div>\s*<\/div>/);
      const careers = desc
        ? desc[1].split(/<br\s*\/?>/i).map(tidy).filter(Boolean)
        : [];

      out.push({ srl: srl, name: name, position1: position1, position2: position2, careers: careers });
    }
    return out;
  }

  /* ★ 여기서 나온 글자는 «대조 전용»이다. 홈페이지에 되붙일 수 «없다».
     태그를 걷고 줄을 뭉치므로 지도 위젯·지사 탭·표·구획·스크립트가 전부 사라진 뒤
     한 줄이 된다(오시는길은 275자 한 줄, 노동사건대리는 2412자 한 줄).
     이 글자를 「붙여넣을 본문」으로 내주면 홈페이지가 부서지고, 부서진 쪽을 다시 읽으면
     같은 글자가 나와 「같음」이 뜬다 — 조용히 틀린다. 붙여넣기용으로 쓰지 말 것. */
  function parsePageText(html) {
    const src = String(html || '');
    const inner = src.match(/<div class="content_inner clearfix">([\s\S]*?)<footer/);
    const body = inner ? inner[1] : src;
    return tidy(body.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, ''));
  }

  /* ★ 여기서 나온 글자는 «보는 전용»이다 — 홈페이지 화면과 같은 순서·같은 줄로 돌려준다.
     parsePageText 처럼 뭉치지 않고 줄을 살려서, 사람이 몇 번째 줄을 고쳐야 하는지
     눈으로 가릴 수 있게 한다. «대조»는 여전히 parsePageText(tidy 로 뭉친 글자)로 한다 —
     대조 규칙은 이 함수와 무관하게 하나도 안 바꾼다.

     만드는 방법:
     1) <script>·<style> 덩어리와 주석(<!-- -->)을 먼저 통째로 걷어낸다.
        ★ 주석을 줄로 쪼갠 «뒤에» 걷으면 <!--·--> 짝이 서로 다른 줄로 갈라져
          한쪽만 남는다(예전에 --> 찌꺼기가 본문에 남은 사고와 같은 원인이다).
          반드시 «쪼개기 전에» 통째로 없앤다.
     2) 본문은 bh_page_widget_inner 부터 <footer 앞까지만 쓴다 — 머리말·메뉴·CSS 를 막는다.
        ★ 표시 글자를 찾은 자리에서 바로 자르면 첫 줄에 'bh_page_widget_inner">' 같은
          찌꺼기가 남는다. 그 div 의 여는 태그가 끝나는 '>' 뒤부터 잘라야 한다.
        marker 를 못 찾으면(이 위젯이 없는 쪽 — 예: 게시판형 공지사항) 머리말·메뉴가
        고스란히 섞이므로, 안전하게 빈 목록을 돌려준다(틀린 줄을 조용히 내주지 않는다).
     3) 덩어리 태그의 닫는 표시(div p li h1~h6 td tr section article)와 <br> 을
        줄바꿈으로 바꾼다. 원문에 이미 있던 줄바꿈은 그대로 둔다 — 홈페이지가 원래
        보여주는 줄 모양을 지운 뒤 다시 지어내지 않는다.
     4) 각 줄을 tidy() 로 다듬는다 — 남은 태그를 걷고, 개체표기를 풀고, 겹공백을 하나로
        만들고, 앞뒤를 다듬는다. 빈 줄은 버린다. */
  /* 쪽에서 «본문 자리»만 잘라 낸다 (위 1)2) 를 그대로 한다).
     ★ 따로 빼 둔 까닭: «보여줄 줄»과 «고칠 줄»이 반드시 같은 자리에서 나와야 한다.
       자리가 어긋나면 머리띠·메뉴 글자가 고칠 줄로 잡히고, 사람이 고친 줄은
       조용히 안 채워진다. 한 군데서만 자른다. */
  function pageBodyHtml(html) {
    const src = String(html || '');
    const noScript = src
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    const markerIdx = noScript.indexOf('bh_page_widget_inner');
    if (markerIdx === -1) return '';
    const gt = noScript.indexOf('>', markerIdx);
    if (gt === -1) return '';
    let body = noScript.slice(gt + 1);

    const footerIdx = body.search(/<footer/i);
    if (footerIdx !== -1) body = body.slice(0, footerIdx);
    return body;
  }

  function parsePageLines(html) {
    const body = pageBodyHtml(html);
    if (!body) return [];

    const withBreaks = body
      .replace(/<\/(div|p|li|h[1-6]|td|tr|section|article)\s*>/gi, '\n')
      .replace(/<br[^>]*>/gi, '\n');

    return withBreaks.split('\n').map(tidy).filter(Boolean);
  }

  global.PuHomeParse = {
    tidy: tidy,
    parseMembers: parseMembers,
    parsePageText: parsePageText,
    parsePageLines: parsePageLines,
    pageBodyHtml: pageBodyHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
