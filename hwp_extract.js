/* HWP 5.0 텍스트 추출 — 브라우저/Node 공용.
 * Python extractors(olefile+zlib) 로직의 JS 이식.
 * 의존: SheetJS의 CFB 파서(XLSX.CFB), pako(inflateRaw — HWP 스트림의 여분 바이트에 관대)
 * 주의: 브라우저 표준 DecompressionStream은 HWP의 트레일링 바이트를 거부하므로 pako 사용.
 */
(function (global) {
  "use strict";

  const EXT_CTRL = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]); // 확장 제어문자(16바이트)

  function getPako(pakoLib) {
    const p = pakoLib || global.pako || (typeof require !== "undefined" ? require("./vendor/pako.min.js") : null);
    if (!p) throw new Error("pako 라이브러리가 필요합니다.");
    return p;
  }

  function inflateRaw(u8, pakoLib) {
    return getPako(pakoLib).inflateRaw(u8);
  }

  /** ArrayBuffer(.hwp) → 본문 전체 텍스트. 표 셀 문단 포함(같은 스트림의 PARA_TEXT 레코드). */
  async function extractHwpText(arrayBuffer, XLSXlib, pakoLib) {
    const X = XLSXlib || global.XLSX;
    if (!X || !X.CFB) throw new Error("XLSX.CFB 파서가 필요합니다.");
    const cfb = X.CFB.read(new Uint8Array(arrayBuffer), { type: "array" });

    const fhIdx = cfb.FullPaths.findIndex((p) => /(^|\/)FileHeader$/.test(p));
    if (fhIdx < 0) throw new Error("HWP 형식이 아닙니다(FileHeader 없음).");
    const fh = cfb.FileIndex[fhIdx].content;
    const sig = String.fromCharCode.apply(null, Array.from(fh.slice(0, 17)));
    if (!sig.startsWith("HWP Document File")) throw new Error("HWP 5.0 형식이 아닙니다.");
    const flags = fh[36];
    if (flags & 2) throw new Error("암호화된 HWP 파일입니다. 암호를 해제한 후 업로드하세요.");
    const compressed = !!(flags & 1);

    const secs = cfb.FullPaths
      .map((p, i) => ({ p, i }))
      .filter((x) => /BodyText\/Section\d+$/.test(x.p))
      .sort((a, b) => +a.p.match(/(\d+)$/)[1] - +b.p.match(/(\d+)$/)[1]);
    if (!secs.length) throw new Error("본문(BodyText)을 찾을 수 없습니다.");

    const lines = [];
    for (const s of secs) {
      let data = new Uint8Array(cfb.FileIndex[s.i].content);
      if (compressed) data = inflateRaw(data, pakoLib);
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let pos = 0;
      while (pos + 4 <= data.length) {
        const hdr = dv.getUint32(pos, true);
        const tag = hdr & 0x3ff;
        let size = (hdr >>> 20) & 0xfff;
        pos += 4;
        if (size === 0xfff) { size = dv.getUint32(pos, true); pos += 4; }
        if (tag === 67) { // HWPTAG_PARA_TEXT
          const end = Math.min(pos + size, data.length);
          const buf = [];
          let i = pos;
          while (i + 1 < end) {
            const ch = dv.getUint16(i, true);
            if (ch === 10 || ch === 13) { buf.push("\n"); i += 2; }
            else if (ch < 32) { i += EXT_CTRL.has(ch) ? 16 : 2; }
            else { buf.push(String.fromCharCode(ch)); i += 2; }
          }
          lines.push(buf.join(""));
        }
        pos += size;
      }
    }
    return lines.join("\n");
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { extractHwpText };
  else global.extractHwpText = extractHwpText;
})(typeof globalThis !== "undefined" ? globalThis : this);
