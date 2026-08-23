/* ══════════════════════════════════════════════════════════════════
   hwpx_doc.js — 공용 문서 서식 층 (한글 hwpx)

   hwpx_gen.js 는 '조립기'다: 문단·표·구역을 XML 로 만든다.
   이 파일은 그 위에 얹는 '서식'이다: 문서마다 되풀이되는 조각을 한 곳에 모은다.
     표제부 · 법정서식 머리줄 · 정보표 · 체크칸 · 금액표 · 서명란 · 다인 서명표
     · 수신처(밑줄) · 기재 여백 · 하단 규격줄 · 용지 프리셋

   왜 필요한가: 앱마다 화면(DOM)을 긁어 조립기에 넘기고 있었다. 화면에 없는 것은
   문서에 담을 수 없고, 화면 배치를 바꾸면 문서가 깨지고, 취업규칙 서식 작업에서
   얻은 능력(칸별 글자 크기·행 높이·세로 병합·테두리·구역별 여백)을 못 쓴다.
   앱은 데이터만 넘기고, 서식은 여기서 정한다.

   치수는 모두 HWPUNIT (1pt=100, 1mm≒283). 취업규칙 별지 제15호서식을 원본과
   mm 단위로 맞추며 실측한 값을 그대로 쓴다 — 근거는 reference/README.md.
   ══════════════════════════════════════════════════════════════════ */
(function(root){
"use strict";
var H = root.HWPX || (typeof require === "function" ? require("./hwpx_gen.js") : null);
if(!H) { if(typeof console!=="undefined") console.warn("hwpx_doc: hwpx_gen.js 를 먼저 불러야 합니다"); return; }

var SZ = H.SZ, CP = H.CP, PP = H.PP, BF = H.BF;

/* ── 용지 프리셋 ──
   구역(section)마다 다른 여백을 줄 수 있다(hwpx_gen 의 build([{body,margin}])).
     gov   법정 별지 서식 — 별지 제15호서식 원본 실측(좌 5740 우 5710, 위 1424)
     rule  규칙·규정 전문 — 노동부 표준취업규칙 조문 열과 같은 줄 폭(문단 폭 40600)
     plain 일반 사무 문서 — 좌우 1인치, 위아래 표준
     wide  가로 — 대조표처럼 열이 많은 표 */
var PAGE = {
  gov:   {left:5740, right:5710, top:1424, bottom:2000, header:1500, footer:1500},
  rule:  {left:8964, right:8964, top:4167, bottom:4167, header:3033, footer:3033},
  plain: {left:7200, right:7200, top:4167, bottom:4167, header:3033, footer:3033},
  wide:  {left:5668, right:5668, top:4252, bottom:4252, header:3033, footer:3033}
};
/* 그 프리셋에서 실제 글이 놓이는 폭 — 표 열폭을 나눌 때 쓴다 */
function bodyWidth(preset, landscape){
  var m = PAGE[preset] || PAGE.plain;
  return (landscape ? 84188 : 59528) - m.left - m.right;
}
/* 문서 한 편을 시작한다 — 용지·여백을 정하고 그 폭에 맞춰 조립기를 맞춘다.
   반환한 margin 을 build([{body:…, margin:…}]) 에 그대로 넘긴다. */
function begin(preset, opt){
  opt = opt || {};
  var m = PAGE[preset] || PAGE.plain, land = !!opt.landscape;
  H.setPage({landscape:land, pageNum:!!opt.pageNum, bodyWidth:bodyWidth(preset, land)});
  return {margin:m, landscape:land, width:bodyWidth(preset, land)};
}

/* 열폭 나누기 — 비율 배열을 그 문서의 본문 폭에 맞춘 절대값으로.
   H.cols() 는 조립기의 기본 폭(대조표용)을 쓰므로 문서마다 다른 여백에서는 어긋난다. */
function cols(ratios, doc){
  var W = (doc && doc.width) || H.bodyW();
  var sum = ratios.reduce(function(a,b){return a+b;}, 0);
  var out = ratios.map(function(r){ return Math.floor(W * r / sum); });
  out[out.length-1] = W - out.slice(0,-1).reduce(function(a,b){return a+b;}, 0);
  return out;
}

/* 표 공통 옵션 — 서식 문서는 칸 여백 280(원본 실측), 표 바깥 여백 0.
   wrapSlack: 한글이 문단 condense 로 한 줄에 더 밀어 넣는 몫(줄바꿈 계산 보정). */
function tblOpt(extra){
  var o = {noHead:true, pad:280, outMargin:0, wrapSlack:0.12, tightWrap:true};
  for(var k in (extra||{})) o[k] = extra[k];
  return o;
}

/* ── 조각들 ───────────────────────────────────────────────────── */

/* 법정 서식 머리줄 — 「■ 근로기준법 시행규칙 [별지 제15호서식] <개정 2018. 6. 29.>」
   서식명은 8pt, 개정일은 9pt (원본이 그렇다). */
function formHead(law, form, revised, opt){
  var runs = [{t:"■ " + law + " [" + form + "] ", cp:CP.f8}];
  if(revised) runs.push({t:"<개정 " + revised + ">", cp:CP.f9});
  return H.paraRuns(runs, {paraPr:PP.plain, pageBreak:!!(opt&&opt.pageBreak)});
}
/* 표제 — 가운데 16pt 굵게. sub 를 주면 그 아래 작은 부제. */
function title(text, sub, opt){
  var x = H.para(text, CP.f16b, {paraPr:PP.center, pageBreak:!!(opt&&opt.pageBreak)});
  if(sub) x += H.para(sub, CP.f10, {paraPr:PP.center});
  return x;
}
/* 표제 오른쪽에 체크칸이 붙는 형태 — 「취업규칙 [ ]신고서 / [√]변경신고서」
   items = [[이름, 켜짐]…]. 이름이 여러 줄이면 줄마다 한 항목씩 놓인다. */
function titleCheck(text, items, doc){
  var W = (doc && doc.width) || H.bodyW();
  /* 제목 칸은 글자 수로 폭을 잡는다 — 비율로 두면 '사내근로복지기금' 같은 긴 제목이
     두 줄로 쪼개진다(16pt 전각 1600, 여유 1칸). */
  var mid = Math.min(Math.round(W*0.55), (dispLen(text) + 2) * 800);
  var right = Math.max.apply(null, items.map(function(it){ return (dispLen(it[0]) + 4) * 800; }));
  right = Math.min(right, W - mid);
  var w = [W - mid - right, mid, right];
  var rows = items.map(function(it, i){
    return [ {t:"", bf:BF.none},
             i===0 ? {t:text, bf:BF.none, cp:CP.f16b, sz:SZ.p16, pp:PP.t110} : {t:"", bf:BF.none},
             {t:check(it[1]) + it[0], bf:BF.none, cp:CP.f16b, sz:SZ.p16, pp:PP.t110} ];
  });
  var h = items.map(function(){ return 1770; });
  return H.tablePara(rows, w, tblOpt({sz:SZ.p16, cp:CP.f16b, rowH:h, lh:1770, padY:0, padYB:0}));
}
function check(on){ return on ? "[√]" : "[  ]"; }

/* 정보표 — 「항목 | 값」 표.
   rows: [[라벨, 값], …]  또는  [[라벨, 값, 라벨, 값], …] (한 줄에 두 쌍)
   opts.sep     라벨을 제 칸에 두고 값과 선으로 나눈다 (기본 참 — 법정 서식이 그렇다).
                거짓이면 라벨·값이 한 칸에 들어가고 공백으로 자리를 맞춘다.
   opts.head    맨 위에 회색 제목 줄 (예: '신고내용')
   opts.side    왼쪽에 세로로 병합된 칸 (예: '신고내용')
   opts.rowH    행 높이(기본 3120 = 11mm, 원본 실측)
   opts.labelW  라벨 칸 폭 — sep 이면 HWPUNIT, 아니면 반각 칸 수(기본 14) */
function infoTable(rows, doc, opts){
  opts = opts || {};
  var sep = opts.sep !== false;
  var hasSide = !!opts.side, wide = rows.some(function(r){ return r.length >= 4; });
  var W = (doc && doc.width) || H.bodyW();
  var sideW = hasSide ? Math.round(W * 0.11) : 0;
  var rest = W - sideW, w;
  if(sep){
    /* 라벨 칸 폭은 가장 긴 라벨에 맞춘다 — 비율로 두면 '근로계약기간'은 접히고
       '임금'은 헐렁하다. 10pt 전각 1000, 칸 여백 280×2 에 한 칸 여유. */
    var maxLab = 0;
    rows.forEach(function(r){
      maxLab = Math.max(maxLab, dispLen(r[0]));
      if(r.length >= 4) maxLab = Math.max(maxLab, dispLen(r[2]));
    });
    var lw = opts.labelW || Math.round(maxLab * 500) + 1360;
    lw = Math.min(lw, Math.round(rest * (wide ? 0.26 : 0.34)));
    w = wide ? [lw, Math.round(rest/2) - lw, lw, rest - lw - (Math.round(rest/2) - lw) - lw]
             : [lw, rest - lw];
    if(hasSide) w.unshift(sideW);
  } else {
    if(wide){ var a = Math.round(rest*0.53); w = [a, rest-a]; }
    else w = [rest];
    if(hasSide) w.unshift(sideW);
  }
  var nCol = w.length;
  var pad = opts.labelW || 14;   /* sep 아닐 때만 쓰는 반각 칸 수 */
  var body = rows.map(function(r, i){
    var cells = [];
    if(hasSide) cells.push(i===0 ? {t:opts.side, rowSpan:rows.length, cp:CP.f11, sz:SZ.p11, valign:"center"} : null);
    var full = nCol - (hasSide ? 1 : 0);        /* 이 행이 채워야 할 칸 수 */
    if(sep){
      cells.push({t:val(r[0]), align:"center", valign:"center"});
      if(r.length >= 4){
        cells.push({t:val(r[1]), valign:"center"});
        cells.push({t:val(r[2]), align:"center", valign:"center"});
        cells.push({t:val(r[3]), valign:"center"});
      } else {
        /* 한 쌍만 있는 행은 값 칸을 끝까지 넓힌다 — 오른쪽에 빈 칸이 남으면 서식이
           어설프고, 소재지처럼 긴 값이 좁은 칸에서 두 줄로 접힌다 */
        cells.push({t:val(r[1]), colSpan:full - 1, valign:"center"});
        for(var k=2;k<full;k++) cells.push(null);
      }
    } else if(r.length >= 4){
      cells.push(padLabel(r[0], pad) + val(r[1]));
      cells.push(padLabel(r[2], pad) + val(r[3]));
    } else if(full > 1){
      cells.push({t:padLabel(r[0], pad) + val(r[1]), colSpan:full});
      for(var j=1;j<full;j++) cells.push(null);
    } else {
      cells.push(padLabel(r[0], pad) + val(r[1]));
    }
    return cells;
  });
  var heads = [];
  if(opts.head){
    heads.push([{t:opts.head, colSpan:nCol, bf:BF.gray, align:"center", cp:CP.f10b}]
      .concat(w.slice(1).map(function(){ return null; })));
  }
  var h = heads.map(function(){ return 2380; })
    .concat(rows.map(function(r, i){ return (opts.rowH && opts.rowH[i]) || 3120; }));
  return H.tablePara(heads.concat(body), w,
    tblOpt({sz:SZ.p10, cp:CP.f10, rowH:h, rowHFixed:!!opts.fixed, padY:390}));
}
function val(v){ return (v == null || v === "") ? "" : String(v); }
/* 표시 폭 — 한글·한자는 2칸, 나머지는 1칸 */
function dispLen(s){
  var t = String(s == null ? "" : s), n = 0;
  for(var i=0;i<t.length;i++){
    var c = t.codePointAt(i);
    n += (c < 0x1100 || (c >= 0x2000 && c < 0x2500)) ? 1 : 2;
  }
  return n;
}
/* 라벨 뒤에 공백을 채워 값이 같은 자리에서 시작하게 — 원본은 라벨·값이 한 칸이다 */
function padLabel(s, units){
  var t = String(s == null ? "" : s), n = 0;
  for(var i=0;i<t.length;i++){
    var c = t.codePointAt(i);
    n += (c < 0x1100 || (c >= 0x2000 && c < 0x2500)) ? 1 : 2;
  }
  return t + new Array(Math.max(1, (units||14) - n) + 1).join(" ");
}

/* 금액표 — 숫자는 오른쪽 정렬, 합계 줄은 굵게.
   rows: [[항목, 금액], …]   total: [이름, 금액] (없으면 생략) */
function moneyTable(head, rows, total, doc, opts){
  opts = opts || {};
  var W = (doc && doc.width) || H.bodyW();
  var w = cols(opts.ratios || [0.6, 0.4], {width:W});
  var out = [];
  if(head) out.push([{t:head[0], bf:BF.gray, align:"center", cp:CP.f10b},
                     {t:head[1], bf:BF.gray, align:"center", cp:CP.f10b}]);
  /* strong: 실수령액처럼 한 줄만 두고 눈에 띄게 할 때 — 회색 배경 + 굵게 */
  rows.forEach(function(r){
    out.push(opts.strong
      ? [{t:String(r[0]), bf:BF.gray, cp:CP.f10b}, {t:won(r[1]), align:"right", bf:BF.gray, cp:CP.f10b}]
      : [String(r[0]), {t:won(r[1]), align:"right"}]);
  });
  if(total) out.push([{t:total[0], cp:CP.f10b}, {t:won(total[1]), align:"right", cp:CP.f10b}]);
  return H.tablePara(out, w, tblOpt({sz:SZ.p10, cp:CP.f10, padY:200}));
}
function won(v){
  if(v == null || v === "") return "";
  var n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? String(v) : n.toLocaleString("ko-KR");
}

/* 날짜 줄 — 오른쪽에 「2026년 8월 1일」. 값이 없으면 「   년   월   일」 빈칸. */
function dateLine(iso){
  var p = String(iso || "").split("-").map(Number);
  var s = p[0] ? (p[0] + "년 " + p[1] + "월 " + p[2] + "일") : "년        월        일";
  return H.para(s, CP.f10, {paraPr:PP.right});
}
/* 서명란 — 「신고인   홍길동            (서명 또는 인)」
   names: [[역할, 이름], …]  이름이 없으면 빈칸으로 남긴다(수기 서명 자리) */
function signBlock(names, doc){
  var W = (doc && doc.width) || H.bodyW();
  /* '(서명 또는 인)' 칸은 절대 폭으로 잡는다 — 비율로 두면 문서마다 본문 폭이 달라
     이 글이 두 줄로 접힌다(8pt 로 약 56pt 필요, 여유 두어 6000). */
  var sign = 6000, role = Math.round((W - sign) * 0.36);
  var w = [W - sign - role, role, sign];
  var x = "";
  names.forEach(function(p){
    /* 이름과 '(서명 또는 인)' 은 같은 줄에 놓인다 — 두 칸 모두 가운데 정렬로 두어야
       10pt 와 8pt 의 밑선이 어긋나 보이지 않는다 */
    x += H.tablePara([[ {t:"", bf:BF.none},
      {t:p[0] + (p[1] ? "   " + p[1] : ""), bf:BF.none, valign:"center"},
      {t:"(서명 또는 인)", bf:BF.none, cp:CP.f8, sz:SZ.p8, valign:"center"} ]],
      w, tblOpt({sz:SZ.p10, cp:CP.f10, rowH:[2930], pad:0}));
  });
  return x;
}
/* 다인 서명표 — 의견청취서·동의서처럼 여러 사람이 적는 표.
   cols: 칸 이름 배열(순번은 자동). count: 행 수. 쪽을 넘겨도 머리행이 반복된다. */
function signTable(colNames, count, doc, opts){
  opts = opts || {};
  var W = (doc && doc.width) || H.bodyW();
  var ratios = opts.ratios || defaultSignRatios(colNames.length + 1);
  var w = cols(ratios, {width:W});
  var rows = [ ["순번"].concat(colNames) ];
  for(var i=1;i<=count;i++){
    var r = [String(i)];
    for(var k=0;k<colNames.length;k++) r.push("");
    rows.push(r);
  }
  var g = []; for(var j=1;j<=count;j++) g.push(j);
  return H.tablePara(rows, w, tblOpt({sz:SZ.p10, cp:CP.f10, center:true, groupStart:g}));
}
function defaultSignRatios(n){
  var first = 0.09, rest = (1 - first) / (n - 1), out = [first];
  for(var i=1;i<n;i++) out.push(rest);
  return out;
}
/* 수신처 — 「○○지방고용노동청(지청)장 귀하」 13pt + 아래 굵은 선.
   글과 선이 한 칸에 있어야 선 위치가 정확하다(별지 제15호서식과 같은 방식). */
function receiver(text, doc, opts){
  opts = opts || {};
  var W = (doc && doc.width) || H.bodyW();
  return H.tablePara([[{ bf:BF.under, valign:"center",
    runs:[{t:text + " ", cp:CP.f13}, {t:opts.suffix || "귀하", cp:CP.f10}] }]],
    [W], tblOpt({sz:SZ.p13, cp:CP.f13, rowH:[opts.h || 1820], rowHFixed:true, pad:260}));
}
/* 기재 여백 — 수기로 적을 빈 자리(테두리 없음, 높이 지정) */
function blank(h, doc){
  var W = (doc && doc.width) || H.bodyW();
  return H.tablePara([[{t:"", bf:BF.none}]], [W],
    tblOpt({sz:SZ.p8, cp:CP.f8, rowH:[h || 3000], rowHFixed:true}));
}
/* 회색 제목 줄 — 「처 리 절 차」처럼 표 폭을 다 쓰는 구분 줄 */
function bandTitle(text, doc, opts){
  opts = opts || {};
  var W = (doc && doc.width) || H.bodyW();
  return H.tablePara([[{t:text, bf:opts.dark ? BF.gray2 : BF.gray, align:"center", valign:"center"}]],
    [W], tblOpt({sz:SZ.p10, cp:opts.bold===false?CP.f10:CP.f10b, rowH:[opts.h || 2260]}));
}
/* 첨부서류·수수료 상자 — 법정 서식 하단의 안내 영역 */
function attachBox(items, fee, doc){
  var W = (doc && doc.width) || H.bodyW();
  var w = cols([0.125, 0.719, 0.156], {width:W});
  return H.tablePara([[
    {t:"첨부서류", align:"center", valign:"center"},
    {t:items.join("\n"), cp:CP.f75, sz:SZ.p75},
    {t:"수수료\n\n" + (fee || "없음"), align:"center", valign:"center"}
  ]], w, tblOpt({sz:SZ.p8, cp:CP.f8, rowH:[6120], rowHFixed:true, padY:550}));
}
/* 하단 규격 줄 — 「210mm×297mm[일반용지 70g/㎡(재활용품)]」 오른쪽 8pt */
function paperNote(text){
  return H.para(text || "210mm×297mm[일반용지 70g/㎡(재활용품)]", CP.f8, {paraPr:PP.right});
}
/* 본문 문단 — 문서 본문 10pt 왼쪽(줄간격 165%, 왼쪽 여백 260) */
function body(text, opt){
  return H.para(text, (opt && opt.cp) || CP.f10, {paraPr:PP.form});
}
/* 작은 안내 문단 — 「※ …」 8pt */
function note(text){ return H.para(text, CP.f8, {paraPr:PP.plain}); }

/* ── 조립 도우미 ───────────────────────────────────────────────
   여러 문서를 한 파일로 묶을 때: 각 문서가 자기 구역을 갖고 자기 여백을 쓴다. */
function pack(docs){
  return docs.filter(function(d){ return d && d.body; }).map(function(d){
    return {body:d.body, landscape:!!d.landscape, margin:d.margin || PAGE.plain,
            key:d.key || "", label:d.label || ""};
  });
}

root.HWPXDOC = {
  PAGE:PAGE, begin:begin, bodyWidth:bodyWidth, cols:cols, tblOpt:tblOpt,
  formHead:formHead, title:title, titleCheck:titleCheck, check:check,
  infoTable:infoTable, padLabel:padLabel, moneyTable:moneyTable, won:won,
  dateLine:dateLine, signBlock:signBlock, signTable:signTable,
  receiver:receiver, blank:blank, bandTitle:bandTitle, attachBox:attachBox,
  paperNote:paperNote, body:body, note:note, pack:pack
};
if(typeof module !== "undefined" && module.exports) module.exports = root.HWPXDOC;
})(typeof window !== "undefined" ? window : globalThis);
