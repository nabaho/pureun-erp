'use strict';
// 푸른노무법인 경력관리 — 한글 SVG 쪽의 «글자 되붙이기»
// (브라우저 window.KcareerSvgText / Node module.exports 겸용, DOM 미사용 — 문자열만 다룬다)
//
// ■ 왜 필요한가
//   지금까지 PDF는 캔버스 «그림»이었다 — 글자 복사도 검색도 안 되고 용량도 크다.
//   한글 엔진(rhwp)의 renderPageSvg 는 그림이 아니라 진짜 <text> 를 준다
//   (실측 2026-09-05: text 100개 · path 0개 · image 0개). 이것을 인쇄하면
//   브라우저가 «글자가 살아 있는» PDF를 만든다.
//
// ■ 그런데 한 글자에 <text> 하나다
//   엔진은 낱글자마다 자리를 잡아 준다. 그대로 두면 PDF 뷰어가 낱글자를 이어 붙여
//   읽어야 해서 「권형하」 검색이 빗나갈 수 있다. 그래서 같은 줄·같은 서식의
//   낱글자를 한 덩어리로 되붙인다. 자리는 x 목록으로 «글자마다 그대로» 지킨다
//   (SVG 의 x="1 2 3" 은 글자별 위치다) — 그래서 모양은 한 픽셀도 안 움직인다.
//
// ⚠ 띄어쓰기는 SVG 에 «없다» — 엔진이 공백을 자리 간격으로만 남긴다(실측).
//   앞 글자 너비보다 많이 벌어져 있으면 그 자리에 공백을 되살린다.
//   ⚠ 너비를 실제보다 «넉넉히» 잡는다 — 없는 공백을 만드는 쪽이 더 나쁘다.
(function (root) {

  /* 한중일 글자는 네모칸 하나(글자크기)를 차지한다. 나머지는 절반쯤으로 넉넉히 본다. */
  function isWide(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x1100 && c <= 0x11FF) || (c >= 0x2E80 && c <= 0xA4CF) ||
           (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0xF900 && c <= 0xFAFF) ||
           (c >= 0xFE30 && c <= 0xFE4F) || (c >= 0xFF00 && c <= 0xFF60);
  }
  function advanceOf(ch, fs) { return isWide(ch) ? fs : fs * 0.5; }

  function attrsOf(s) {
    var o = {}, re = /([a-zA-Z:-]+)="([^"]*)"/g, m;
    while ((m = re.exec(s))) o[m[1]] = m[2];
    return o;
  }
  /* 서식이 같아야 한 덩어리로 묶는다 — 자리와 낱글자 너비는 빼고 나머지를 견준다.
     ⚠ textLength/lengthAdjust 는 «낱글자마다» 다르다(엔진이 글자 하나의 정확한 너비를
       적어 준다). 서식으로 치면 숫자·영문이 한 글자씩 따로 놀아 되붙지 않는다
       (실측 2026-09-05: 100자가 37덩어리에서 멈췄다 — 「E」「ng」「li」「s」「h」). */
  var SKIP_ATTR = { x: 1, y: 1, textLength: 1, lengthAdjust: 1 };
  function styleKey(a) {
    var out = [];
    Object.keys(a).sort().forEach(function (k) {
      if (SKIP_ATTR[k]) return;
      out.push(k + '=' + a[k]);
    });
    return out.join('|');
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function unesc(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  /* 자리 숫자는 소수 둘째 자리까지 — 원본이 106.13333333333334 처럼 길어 파일만 불어난다 */
  function num(v) { return String(Math.round(v * 100) / 100); }

  /* ===== 띄어쓰기의 «정답» =====
     ⚠ 자리 간격으로 공백을 짐작하면 틀린다 — 실측 2026-09-05: 「1970- 01- 01」,
       「041- 000- 0000」. 붙임표(-)는 textLength 가 없는데 실제 너비가 넓어서
       짐작한 너비(글자크기의 절반)보다 많이 벌어져 보인다. 마침표(.)와 붙임표(-)의
       벌어짐이 10.55 대 11.1 로 거의 같은데 한쪽만 공백이라 «간격으로는 못 가른다».
     그런데 엔진이 정답을 갖고 있다 — getPageTextLayout 은 띄어쓰기가 들어 있는
     원문과 글자마다의 x(charX)를 함께 준다. 거기서 «공백 바로 뒤 글자의 자리»만 뽑는다. */
  function spaceStops(layout) {
    var o = layout;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return []; } }
    var runs = (o && o.runs) || [], stops = [];
    /* ⚠ charX 는 «줄 왼쪽 끝(run.x)에서부터의 거리»다 — 그대로 쓰면 한 글자도 안 맞는다.
       실측 2026-09-05: 첫 run 이 x:96.0 인데 charX:[0.0] 이었다. run.x 를 더해야 한다. */
    runs.forEach(function (r, k) {
      var t = String(r.text || ''), cx = r.charX || [], base = Number(r.x) || 0;
      if (!t || cx.length < t.length) return;
      for (var i = 0; i < t.length; i++) {
        if (!/\s/.test(t[i])) continue;
        var j = i; while (j < t.length && /\s/.test(t[j])) j++;
        if (j < t.length) stops.push(base + cx[j]);
      }
      /* ⚠ 공백이 «토막 끝»에 놓이면 그 토막 안에는 뒤따르는 글자가 없다 —
         글꼴이 바뀌는 자리에서 토막이 갈리기 때문이다(실측: 「…동의합니다. 」 / 「English…」).
         이 경우를 안 보면 그 공백이 통째로 사라진다. 같은 줄의 다음 토막 첫 글자를 짚는다. */
      if (!/\s$/.test(t)) return;
      var nx = runs[k + 1];
      if (!nx || !nx.text) return;
      if (Math.abs((Number(nx.y) || 0) - (Number(r.y) || 0)) > 0.5) return;   // 다음 줄이면 남의 자리
      stops.push((Number(nx.x) || 0) + ((nx.charX || [0])[0] || 0));
    });
    return stops;
  }

  /* ===== 낱글자 <text> 를 줄 단위로 되붙인다 =====
     opts.spaceBefore : spaceStops() 가 준 «공백 뒤 글자» 자리 목록(있으면 이것이 정답).
                        없으면 자리 간격으로 짐작한다(엔진 없이 쓸 때의 뒷길). */
  function mergeGlyphs(svg, opts) {
    if (!svg || svg.indexOf('<text') < 0) return svg;
    var stops = (opts && opts.spaceBefore) || null;
    /* 자리는 소수 한 자리까지만 맞으면 같은 자리로 본다 — 배치표는 반올림해 온다
       (실측: 배치표 532.9 ↔ SVG 532.93). 글자 사이는 3.88 이상이라 헷갈리지 않는다. */
    function isSpaceBefore(x) {
      for (var i = 0; i < stops.length; i++) if (Math.abs(stops[i] - x) < 0.15) return true;
      return false;
    }
    var RE = /<text\b([^>]*)>([^<]*)<\/text>/g, m, items = [];
    while ((m = RE.exec(svg))) {
      items.push({ raw: m[0], attr: m[1], text: unesc(m[2]), s: m.index, e: m.index + m[0].length });
    }
    if (items.length < 2) return svg;

    var out = '', pos = 0, i = 0;
    while (i < items.length) {
      var a = attrsOf(items[i].attr);
      var fs = parseFloat(a['font-size']) || 0;
      var group = [items[i]], key = styleKey(a), y = a.y;
      var j = i + 1;
      /* ⚠ 사이에 다른 태그가 끼면(칸이 바뀌면) 거기서 끊는다 — 남의 칸 글자를 붙이면 안 된다 */
      while (j < items.length && items[j].text.length === 1 && items[i].text.length === 1) {
        if (svg.slice(items[j - 1].e, items[j].s).trim() !== '') break;
        var b = attrsOf(items[j].attr);
        if (b.y !== y || styleKey(b) !== key) break;
        group.push(items[j]); j++;
      }
      if (group.length < 2 || !fs) { i++; continue; }

      /* 자리와 글자를 모은다 — 벌어진 자리에는 없어진 공백을 되살린다 */
      var xs = [], chars = [], prevX = null, prevCh = null;
      for (var g = 0; g < group.length; g++) {
        var gx = parseFloat(attrsOf(group[g].attr).x), gc = group[g].text;
        if (prevX != null) {
          var adv = advanceOf(prevCh, fs);
          var gap = stops ? isSpaceBefore(gx) : ((gx - prevX) - adv > fs * 0.22);
          if (gap) { xs.push(prevX + adv); chars.push(' '); }
        }
        xs.push(gx); chars.push(gc);
        prevX = gx; prevCh = gc;
      }
      /* ★⚠ 묶은 덩어리에 textLength 를 남기면 «한 글자 너비» 안에 줄 전체를 밀어 넣으려 들어
         글자가 찌그러진다(실측 2026-09-05: 숫자 「1」의 너비가 7.77 → 1.94).
         떼어도 자리는 x 목록으로 글자마다 박아 두므로 밀리지 않는다(실측: 자리 어긋남 0자).
         다만 바탕글꼴이 없는 기기에서 영문·숫자 너비가 5% 안팎 달라질 수 있다 —
         한글은 네모칸이라 그대로다. */
      var attr = items[i].attr
        .replace(/\sx="[^"]*"/, ' x="' + xs.map(num).join(' ') + '"')
        .replace(/\stextLength="[^"]*"/g, '')
        .replace(/\slengthAdjust="[^"]*"/g, '');
      out += svg.slice(pos, group[0].s) + '<text' + attr + '>' + esc(chars.join('')) + '</text>';
      pos = group[group.length - 1].e;
      i = j;
    }
    return out + svg.slice(pos);
  }

  /* ===== 인쇄용 한 장짜리 문서 ===== */
  /* ⚠ @page 여백은 0 — SVG 자체가 이미 A4 한 장(793.7×1122.5px = 210×297mm @96dpi)이다.
     여백을 주면 쪽이 줄어들어 두 장으로 넘친다. */
  function printHtml(svgs, title) {
    var body = (svgs || []).map(function (s, i) {
      return '<div class="pg"' + (i === (svgs.length - 1) ? ' style="page-break-after:auto"' : '') + '>' + s + '</div>';
    }).join('\n');
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title || '문서') + '</title>'
      + '<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}'
      + '.pg{page-break-after:always;break-after:page}'
      + '.pg svg{display:block;width:100%;height:auto}</style></head><body>' + body + '</body></html>';
  }

  var api = { mergeGlyphs: mergeGlyphs, spaceStops: spaceStops, printHtml: printHtml, isWide: isWide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerSvgText = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
