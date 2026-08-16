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

  function parsePageText(html) {
    const src = String(html || '');
    const inner = src.match(/<div class="content_inner clearfix">([\s\S]*?)<footer/);
    const body = inner ? inner[1] : src;
    return tidy(body.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, ''));
  }

  global.PuHomeParse = {
    tidy: tidy,
    parseMembers: parseMembers,
    parsePageText: parsePageText
  };
})(typeof window !== 'undefined' ? window : globalThis);
