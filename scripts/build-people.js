/* 구성원 쪽을 «자료로» 그린다 — 마크업은 지금 것을 그대로 쓴다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 홈페이지를 새로 만들고 푸른ERP 에서 고친다.

   ■ 어떻게
     굳힌 쪽(site/people/index.html)의 «첫 카드»를 본으로 삼아, 사람 수만큼 찍어 낸다.
     마크업을 새로 쓰지 않으므로 화면이 달라질 자리가 없다.

   ■ 왜 이 방식인가
     ① 자료를 바꾸면 «그 자리만» 바뀐다 — 지도·표·띠·발은 손도 안 댄다.
     ② 만든 결과가 지금 화면과 같은지 «돌려서» 확인할 수 있다:
        지금 쪽에서 자료를 읽어 다시 그리면 «똑같아야» 한다(tests/homepage-people.test.js).
     ③ 홈페이지 반죽(스킨)이 바뀌어도 본을 다시 뜨면 그만이다.

   쓰는 법
     node scripts/build-people.js                 (지금 쪽에서 읽어 → 다시 그리기: 확인용)
     node scripts/build-people.js --data 사람.json (자료로 그리기)

   자료 모양: [{ srl, 이름, 직책1, 직책2, 사진, 경력: [...] }, …]  */
'use strict';
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'site', 'people', 'index.html');

/* ── 아주 작은 마크업 도구 ── */

/* 여는 태그 자리에서 시작해 «짝이 맞는» 닫는 태그까지의 조각을 돌려준다.
   ★ 정규식으로 <div>…</div> 를 잡으면 안쪽 div 에서 먼저 끊긴다. 깊이를 센다. */
function 덩어리(html, 시작, 태그) {
  const 열기 = new RegExp('<' + 태그 + '\\b', 'gi');
  const 닫기 = new RegExp('</' + 태그 + '\\s*>', 'gi');
  let i = 시작, 깊이 = 0;
  while (i < html.length) {
    열기.lastIndex = i; 닫기.lastIndex = i;
    const a = 열기.exec(html);
    const b = 닫기.exec(html);
    if (!b) return null;
    if (a && a.index < b.index) { 깊이++; i = a.index + 1; continue; }
    깊이--;
    i = b.index + b[0].length;
    if (깊이 === 0) return html.slice(시작, i);
  }
  return null;
}

function 사이글자(조각, 여는표시) {
  const i = 조각.indexOf(여는표시);
  if (i < 0) return '';
  const j = 조각.indexOf('>', i);
  const 안 = 덩어리(조각, i, 여는표시.replace(/^<(\w+).*/, '$1'));
  if (!안) return '';
  return 안.slice(안.indexOf('>', 0) + 1, 안.lastIndexOf('<'));
}

function 텍스트(s) {
  return String(s == null ? '' : s).replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function 감싸기(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── 카드 찾기 ── */
const 카드시작 = /<div class="bh bh_item item item\d+/g;

function 카드들(html) {
  const out = [];
  카드시작.lastIndex = 0;
  let m;
  while ((m = 카드시작.exec(html))) {
    const blk = 덩어리(html, m.index, 'div');
    if (!blk) break;
    out.push({ at: m.index, html: blk });
    카드시작.lastIndex = m.index + blk.length;
  }
  return out;
}

/* ── 읽기: 지금 쪽 → 자료 ── */
function 사람읽기(html) {
  return 카드들(html).map(c => {
    const h = c.html;
    const srl = (/data-srl="(\d+)"/.exec(h) || [, ''])[1];
    const 사진 = (/<img[^>]+src="([^"]+)"/.exec(h) || [, ''])[1];
    /* 모달 안의 제목이 이름과 직책1 을 갈라 준다 */
    const 모달 = h.slice(h.indexOf('bh_modal_header'));
    const 제목 = 사이글자(모달.slice(모달.indexOf('<div class="bh_title">')), '<div class="bh_title">');
    const 직책1 = 텍스트((/<span class="pl-5">([\s\S]*?)<\/span>/.exec(제목) || [, ''])[1]);
    /* ★ 직책2(<div class="position">)가 제목 «안»에 들어 있다 — 먼저 걷어내지 않으면
       이름이 「권형하 공인노무사」가 된다. 실제로 여기서 한 번 틀렸다. */
    const 이름 = 텍스트(제목.replace(/<div class="position">[\s\S]*?<\/div>/, '')
                          .replace(/<span class="pl-5">[\s\S]*?<\/span>/, ''));
    const 직책2 = 텍스트((/<div class="position">([\s\S]*?)<\/div>/.exec(모달) || [, ''])[1]);
    const desc = (/<div class="desc">([\s\S]*?)<\/div>\s*<\/div>/.exec(h) || [, ''])[1] || '';
    const 경력 = desc.split(/<br\s*\/?>/i).map(텍스트).filter(Boolean);
    return { srl: srl, 이름: 이름, 직책1: 직책1, 직책2: 직책2, 사진: 사진, 경력: 경력 };
  });
}

/* ── 그리기: 자료 → 쪽 ── */
function 카드그리기(본, 사람, 자리) {
  let h = 본;

  /* 몇 번째 카드인지 — 홈페이지 반죽이 item1·item2… 로 세므로 그대로 이어 준다.
     ★ 나타나는 짬(data-anim-delay)은 «건드리지 않는다». 지금 홈페이지가 정한 값이 있고,
       우리가 멋대로 정하면 카드가 하나씩 늦게 뜨는 등 화면 결이 달라진다. */
  h = h.replace(/(<div class="bh bh_item item item)\d+/, '$1' + (자리 + 1));

  /* 글 번호 — 창을 여닫는 열쇠라 세 자리를 다 갈아 끼운다 */
  h = h.replace(/data-srl="\d+"/g, 'data-srl="' + 사람.srl + '"');
  h = h.replace(/id="bh_modal_\d+"/, 'id="bh_modal_' + 사람.srl + '"');

  /* 얼굴 사진 */
  h = h.replace(/(<img[^>]+src=")[^"]*(")/, '$1' + 사람.사진 + '$2');

  /* 카드에 보이는 이름 — 홈페이지는 «이름+직책1» 을 붙여 찍는다 */
  h = h.replace(/(<div class="bh_title">\s*<a[^>]*>\s*<span class="bh">)[\s\S]*?(<\/span>)/,
    '$1' + 감싸기(사람.이름 + (사람.직책1 || '')) + '$2');

  /* 직책2 — 카드와 창에 한 번씩 */
  h = h.replace(/(<div class="position">)[\s\S]*?(<\/div>)/g, '$1' + 감싸기(사람.직책2) + '$2');

  /* 창 안의 제목 — 이름과 직책1 을 갈라 적는다 */
  h = h.replace(/(<div class="bh_title">\s*<span>)[\s\S]*?(<\/span>\s*<div class="position">)/,
    /* ★ 직책1 이 없어도 빈 칸(<span class="pl-5"></span>)을 그대로 둔다.
       지금 홈페이지가 그렇게 찍는다 — 빼면 «우리가 만든 것»과 «지금 것»이 갈라져,
       똑같은지 견주는 검사가 쓸모없어진다. */
    '$1' + 감싸기(사람.이름)
    + '<span class="pl-5">' + 감싸기(사람.직책1 || '') + '</span>$2');

  /* 경력사항 — 짝을 세어 «그 칸 안쪽»만 갈아 끼운다.
     ★ 정규식으로 …</div></div> 까지 잡으면 안쪽 div 에서 끊겨 닫는 표시가 하나 늘어난다
       (실제로 그렇게 틀렸다 — 늘어난 </div> 하나가 그 아래 화면을 통째로 밀어낸다). */
  const 경력자리 = h.indexOf('<div class="desc">');
  if (경력자리 >= 0) {
    const 칸 = 덩어리(h, 경력자리, 'div');
    if (칸) {
      const 새칸 = '<div class="desc"><div>'
        + 사람.경력.map(감싸기).join('<br />\n') + '</div></div>';
      h = h.slice(0, 경력자리) + 새칸 + h.slice(경력자리 + 칸.length);
    }
  }

  return h;
}

function 쪽그리기(html, 사람들) {
  const 카드 = 카드들(html);
  if (!카드.length) throw new Error('본으로 삼을 카드를 찾지 못했습니다');
  const 본 = 카드[0].html;
  const 새것 = 사람들.map((p, i) => 카드그리기(본, p, i)).join('\n\t\t\t\t\t');
  const 처음 = 카드[0].at;
  const 끝 = 카드[카드.length - 1].at + 카드[카드.length - 1].html.length;
  return html.slice(0, 처음) + 새것 + html.slice(끝);
}

module.exports = { 사람읽기, 쪽그리기, 카드들, 덩어리 };

/* ── 손으로 돌릴 때 ── */
if (require.main === module) {
  const html = fs.readFileSync(PAGE, 'utf8');
  const i = process.argv.indexOf('--data');
  const 사람들 = i > 0 ? JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')) : 사람읽기(html);
  const 새쪽 = 쪽그리기(html, 사람들);
  fs.writeFileSync(PAGE, 새쪽, 'utf8');
  console.log('구성원 ' + 사람들.length + '명으로 다시 그렸습니다 → ' + PAGE);
  사람들.forEach(p => console.log('  · ' + p.이름 + (p.직책1 ? ' ' + p.직책1 : '')
    + ' · ' + p.직책2 + ' · 경력 ' + p.경력.length + '줄'));
}
