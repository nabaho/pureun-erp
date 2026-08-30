/* pu-form-fill.js — 사업장 «원본 서식» 을 그대로 두고 칸만 채운다.
   ------------------------------------------------------------------
   지금까지 푸른은 한글 문서를 «처음부터 새로 그려서» 만들었다(hwpx_gen.js).
   그래서 고용노동부·공단 서식처럼 «칸과 줄이 정해진 원본» 은 만들 수가 없었다 —
   표 하나만 어긋나도 접수처에서 되돌아온다.

   이 층은 반대로 간다. 원본 .hwpx 를 열어 «글자만» 바꾸고 그대로 다시 묶는다.
   서식·표·글꼴·도장 자리는 원본 그대로 남는다.

   왜 브라우저에서 하나 — 주민등록번호가 서버로 안 가야 하기 때문이다.
   (대표 지시 2026-08-29: 「푸른화면에서는 주민번호가 보여야한다 … 백업시 암호화」)
   채우는 일이 폰·PC 안에서 끝나면 애초에 나갈 일이 없다.

   쓰는 법:
     var 채운것 = await PuFormFill.fillHwpx(원본바이트, function(글){
       return fillContractVars(글, contract);   // 이미 있는 {{토큰}} 치환기를 그대로 쓴다
     });
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  /* 한글은 한 문단 안에서도 글꼴·굵기가 바뀌면 <hp:t> 를 쪼갠다.
     「{{회사명}}」이 「{{회」 + 「사명}}」 으로 갈라져 있을 수 있다는 뜻이다.
     그래서 문단 하나의 글자를 «모두 이어 붙여» 바꾼 뒤, 첫 칸에 되돌려 놓는다. */
  var P_RE = /<hp:p\b[\s\S]*?<\/hp:p>/g;
  var T_RE = /<hp:t(\s[^>]*)?>([\s\S]*?)<\/hp:t>/g;

  function unesc(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 글자만 든 칸인가 — 안에 다른 태그(탭·형광펜·쪽번호)가 있으면 건드리지 않는다.
     섣불리 합쳤다가 그 태그를 지우면 원본이 망가진다. */
  function pureText(inner) {
    return inner.indexOf('<') < 0;
  }

  /* 문단 하나를 채운다. 바뀐 게 없으면 원문 그대로 돌려준다(불필요한 재조립을 안 한다). */
  function fillParagraph(p, replace) {
    var runs = [];
    var m;
    T_RE.lastIndex = 0;
    while ((m = T_RE.exec(p))) runs.push({ all: m[0], attr: m[1] || '', inner: m[2], at: m.index });
    if (!runs.length) return p;
    if (!runs.every(function (r) { return pureText(r.inner); })) return p;

    var joined = runs.map(function (r) { return unesc(r.inner); }).join('');
    var out = replace(joined);
    if (out === joined) return p;

    /* 바뀐 글은 첫 칸에 모아 넣고 나머지 칸은 비운다.
       ⚠ 칸 자체를 지우지는 않는다 — 런이 사라지면 한글이 글자모양을 잃는다. */
    var built = '';
    var cursor = 0;
    runs.forEach(function (r, i) {
      built += p.slice(cursor, r.at);
      built += '<hp:t' + r.attr + '>' + (i === 0 ? esc(out) : '') + '</hp:t>';
      cursor = r.at + r.all.length;
    });
    return built + p.slice(cursor);
  }

  /* section0.xml 한 장을 채운다 */
  function fillSectionXml(xml, replace) {
    if (typeof replace !== 'function') throw new Error('바꿀 방법(함수)이 없습니다');
    return String(xml).replace(P_RE, function (p) { return fillParagraph(p, replace); });
  }

  /* 남아 있는 토큰을 찾아 준다 — 「채웠는데 왜 {{성명}} 이 그대로냐」를 미리 잡는다 */
  function leftoverTokens(xml) {
    var found = {};
    String(xml).replace(T_RE, function (_, __, inner) {
      unesc(inner).replace(/\{\{[^{}]{1,40}\}\}/g, function (t) { found[t] = 1; return t; });
      return _;
    });
    return Object.keys(found);
  }

  /* 서식이 어떤 토큰을 쓰는지 미리 본다 — 서식을 등록할 때 쓴다 */
  function tokensInSection(xml) {
    var found = {};
    String(xml).replace(P_RE, function (p) {
      var runs = [];
      T_RE.lastIndex = 0;
      var m;
      while ((m = T_RE.exec(p))) runs.push(unesc(m[2]));
      runs.join('').replace(/\{\{[^{}]{1,40}\}\}/g, function (t) { found[t] = 1; return t; });
      return p;
    });
    return Object.keys(found);
  }

  function zipLib(opts) {
    var Z = (opts && opts.JSZip) || global.JSZip;
    if (!Z) throw new Error('한글 서식 기능을 불러오지 못했습니다(JSZip). 새로고침 후 다시 시도해 주세요.');
    return Z;
  }

  /* 원본 .hwpx 바이트를 받아 채운 .hwpx 바이트를 돌려준다.
     ⚠ mimetype 은 «압축하지 않고(STORE) 맨 앞에» 있어야 한다.
       2026-08-30, 이 층을 처음 만들었을 때 그냥 다시 묶었더니 스킬의 검사기가
       「mimetype should use ZIP_STORED, got compress_type=8」로 걸렀다 —
       한글도 같은 자리를 본다. 그래서 새 묶음을 만들어 mimetype 부터 넣는다. */
  function fillHwpx(bytes, replace, opts) {
    var Z = zipLib(opts);
    var 남은 = [];
    return Z.loadAsync(bytes).then(function (zip) {
      var 이름들 = [];
      zip.forEach(function (name, f) { if (!f.dir) 이름들.push(name); });
      var 본문 = 이름들.filter(function (n) { return /^Contents\/section\d+\.xml$/i.test(n); });
      if (!본문.length) return Promise.reject(new Error('한글 서식(.hwpx)이 아닌 것 같습니다 — 본문(section)을 못 찾았습니다'));

      return Promise.all(이름들.map(function (n) {
        var 글자 = /\.(xml|rdf|hpf|txt)$/i.test(n) || n === 'mimetype' || n === 'version.xml';
        return zip.file(n).async(글자 ? 'string' : 'uint8array').then(function (data) {
          if (본문.indexOf(n) >= 0) {
            data = fillSectionXml(data, replace);
            leftoverTokens(data).forEach(function (t) { if (남은.indexOf(t) < 0) 남은.push(t); });
          }
          return { name: n, data: data };
        });
      })).then(function (파일들) {
        var out = new Z();
        var mt = 파일들.filter(function (f) { return f.name === 'mimetype'; })[0];
        if (mt) out.file('mimetype', mt.data, { compression: 'STORE' });
        파일들.forEach(function (f) {
          if (f.name === 'mimetype') return;
          out.file(f.name, f.data, { compression: 'DEFLATE', compressionOptions: { level: 6 } });
        });
        return out.generateAsync({ type: (opts && opts.type) || 'uint8array' });
      }).then(function (out) {
        return { bytes: out, leftover: 남은 };
      });
    });
  }

  var api = {
    fillHwpx: fillHwpx,
    fillSectionXml: fillSectionXml,
    fillParagraph: fillParagraph,
    tokensInSection: tokensInSection,
    leftoverTokens: leftoverTokens
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PuFormFill = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
