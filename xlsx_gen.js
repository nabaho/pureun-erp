/* xlsx_gen.js — A4 기준 엑셀(xlsx) 생성기
   SheetJS로는 인쇄 설정(용지·1페이지 폭 맞춤·여백·머리행 반복)을 넣을 수 없어 직접 생성한다.
   · 용지 A4(paperSize 9) · 가로/세로 선택 · fitToPage(폭 1페이지) · 여백 15mm
   · 열 너비는 A4 인쇄 폭 기준 비율 배분 · 본문 자동 줄바꿈(높이는 엑셀이 계산)
   · 머리행 반복 인쇄(Print_Titles) + 화면 고정(freeze)
   외부 라이브러리 없이 STORE 방식 ZIP으로 포장. */
(function(){
"use strict";
const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
/* A4 인쇄 폭(여백 15mm 제외) ≈ 267mm(가로) / 180mm(세로). 엑셀 열너비 1 ≈ 2.0mm */
const WIDTH_UNITS={landscape:133,portrait:90};
const COL=i=>{let s="",n=i+1;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
/* 행 높이 계산 — 엑셀은 파일에 행 높이가 없으면 wrapText라도 자동 확장하지 않아 내용이 잘린다.
   글자 폭(한글 2·영숫자 1, 열너비 단위)로 줄 수를 세어 pt 높이를 직접 지정한다. */
const LINE_PT=13.5, PAD_PT=4, MAX_PT=409;   // 409pt = 엑셀 행 높이 상한
function visW(s){ let w=0; for(const ch of String(s==null?"":s)){ const c=ch.codePointAt(0);
  w += (c<0x1100||(c>=0x2000&&c<0x2500))?1:2; } return w; }
function lineCount(text,colWidth){
  const per=Math.max(4,colWidth-1.6);   // 셀 좌우 여백 감안
  let n=0;
  String(text==null?"":text).split("\n").forEach(function(seg){ n+=Math.max(1,Math.ceil(visW(seg)/per)); });
  return Math.max(1,n);
}
function rowHeight(cells,widths){
  let mx=1;
  cells.forEach(function(c,i){ const n=lineCount(c,widths[i]||10); if(n>mx)mx=n; });
  return Math.min(MAX_PT, Math.round((mx*LINE_PT+PAD_PT)*10)/10);
}

const CT=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const RELS=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WBRELS=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const FONT=n=>`<font>${n.b?"<b/>":""}<sz val="${n.sz||10}"/><color rgb="FF000000"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>`;
const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="3">${FONT({})}${FONT({b:1})}${FONT({b:1,sz:14})}</fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF9AA7BD"/></left><right style="thin"><color rgb="FF9AA7BD"/></right><top style="thin"><color rgb="FF9AA7BD"/></top><bottom style="thin"><color rgb="FF9AA7BD"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="표준" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2"/></styleSheet>`;
const S_TITLE=1, S_SUB=2, S_HEAD=3, S_BODY=4;

function workbookXml(sheetName,headRow){
  const q=esc(sheetName).replace(/'/g,"''");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${q}'!$${headRow}:$${headRow}</definedName></definedNames></workbook>`;
}
function cell(ref,style,text){
  const t=String(text==null?"":text);
  if(!t)return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>`;
}
/* opt: {sheet,title,sub,headers,rows,colRatios,landscape} */
function sheetXml(opt){
  const cols=opt.headers.length, land=opt.landscape!==false;
  const total=WIDTH_UNITS[land?"landscape":"portrait"];
  const ratios=opt.colRatios&&opt.colRatios.length===cols?opt.colRatios:opt.headers.map(()=>1);
  const sum=ratios.reduce((a,b)=>a+b,0);
  let colsXml="<cols>"; const widths=[];
  ratios.forEach((r,i)=>{ const w=Math.max(6,Math.round(total*r/sum*10)/10); widths.push(w);
    colsXml+=`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`; });
  colsXml+="</cols>";
  const last=COL(cols-1);
  let r=1, rowsXml="", merges=[];
  if(opt.title){ rowsXml+=`<row r="${r}" ht="26" customHeight="1">`+cell("A"+r,S_TITLE,opt.title)+
      Array.from({length:cols-1},(_,i)=>`<c r="${COL(i+1)}${r}" s="${S_TITLE}"/>`).join("")+`</row>`;
    merges.push(`A${r}:${last}${r}`); r++; }
  if(opt.sub){ rowsXml+=`<row r="${r}" ht="18" customHeight="1">`+cell("A"+r,S_SUB,opt.sub)+
      Array.from({length:cols-1},(_,i)=>`<c r="${COL(i+1)}${r}" s="${S_SUB}"/>`).join("")+`</row>`;
    merges.push(`A${r}:${last}${r}`); r++; }
  const headRow=r;
  rowsXml+=`<row r="${r}" ht="${rowHeight(opt.headers,widths)}" customHeight="1">`+opt.headers.map((h,i)=>cell(COL(i)+r,S_HEAD,h)).join("")+`</row>`; r++;
  (opt.rows||[]).forEach(row=>{
    // 행 높이를 내용에 맞춰 명시 — 없으면 엑셀이 한 줄로 표시해 조문이 잘린다
    rowsXml+=`<row r="${r}" ht="${rowHeight(row,widths)}" customHeight="1">`+opt.headers.map((_,i)=>cell(COL(i)+r,S_BODY,row[i])).join("")+`</row>`; r++;
  });
  const merge=merges.length?`<mergeCells count="${merges.length}">`+merges.map(m=>`<mergeCell ref="${m}"/>`).join("")+`</mergeCells>`:"";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${Math.max(1,r-1)}"/><sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"><pane ySplit="${headRow}" topLeftCell="A${headRow+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="16.5"/>${colsXml}<sheetData>${rowsXml}</sheetData>${merge}<printOptions horizontalCentered="1"/><pageMargins left="0.59" right="0.59" top="0.59" bottom="0.59" header="0.31" footer="0.31"/><pageSetup paperSize="9" orientation="${land?"landscape":"portrait"}" fitToWidth="1" fitToHeight="0" horizontalDpi="600" verticalDpi="600"/></worksheet>`;
}

/* ── ZIP(STORE) ── */
const CRC_T=(function(){const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c;}return t;})();
function crc32(u8){let c=-1;for(let i=0;i<u8.length;i++)c=CRC_T[(c^u8[i])&0xFF]^(c>>>8);return (c^(-1))>>>0;}
function zipStore(entries){
  const enc=new TextEncoder(); const parts=[],central=[]; let off=0;
  entries.forEach(function(e){
    const name=enc.encode(e.name), data=(typeof e.data==="string")?enc.encode(e.data):e.data;
    const crc=crc32(data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);
    lh.setUint16(10,0,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);
    lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);
    lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),name,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);
    ch.setUint16(12,0,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);
    ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);
    ch.setUint16(28,name.length,true);ch.setUint32(42,off,true);
    central.push(new Uint8Array(ch.buffer),name);
    off+=30+name.length+data.length;
  });
  let cdSize=0;central.forEach(u=>cdSize+=u.length);
  const end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);
  end.setUint32(12,cdSize,true);end.setUint32(16,off,true);
  const all=parts.concat(central,[new Uint8Array(end.buffer)]);
  let total=0;all.forEach(u=>total+=u.length);
  const out=new Uint8Array(total);let p=0;all.forEach(u=>{out.set(u,p);p+=u.length;});
  return out;
}
function build(opt){
  const sheet=opt.sheet||"Sheet1";
  const headRow=(opt.title?1:0)+(opt.sub?1:0)+1;
  return zipStore([
    {name:"[Content_Types].xml",data:CT},
    {name:"_rels/.rels",data:RELS},
    {name:"xl/workbook.xml",data:workbookXml(sheet,headRow)},
    {name:"xl/_rels/workbook.xml.rels",data:WBRELS},
    {name:"xl/styles.xml",data:STYLES},
    {name:"xl/worksheets/sheet1.xml",data:sheetXml(opt)}
  ]);
}
function download(opt,fname){
  const u8=build(opt);
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([u8],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  a.download=fname;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
const api={build:build,download:download,sheetXml:sheetXml};
if(typeof window!=="undefined")window.XLSXGEN=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
