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

  // ── HWPX (ZIP + XML) ──
  function _entities(s) {
    return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }

  /** ZIP에서 이름이 filterRe에 맞는 항목만 압축 해제해 {name: Uint8Array} 반환 */
  function _readZip(u8, pakoLib, filterRe) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 22 - 65536; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("HWPX(ZIP) 구조가 아닙니다.");
    const cdCount = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder("utf-8");
    const out = {};
    for (let e = 0; e < cdCount && p + 46 <= u8.length; e++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const lhOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (filterRe.test(name)) {
        const lhNameLen = dv.getUint16(lhOff + 26, true);
        const lhExtraLen = dv.getUint16(lhOff + 28, true);
        const start = lhOff + 30 + lhNameLen + lhExtraLen;
        const comp = u8.subarray(start, start + compSize);
        out[name] = method === 0 ? comp : getPako(pakoLib).inflateRaw(comp);
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  /** ArrayBuffer(.hwpx) → 본문 텍스트 (Contents/sectionN.xml의 <hp:t> 문단 단위 결합) */
  function extractHwpxText(arrayBuffer, pakoLib) {
    const u8 = new Uint8Array(arrayBuffer);
    const secRe = /Contents\/section\d+\.xml$/i;
    const entries = _readZip(u8, pakoLib, secRe);
    const names = Object.keys(entries).sort(
      (a, b) => (+a.match(/section(\d+)\.xml/i)[1]) - (+b.match(/section(\d+)\.xml/i)[1]));
    if (!names.length) throw new Error("HWPX 본문(Contents/section)을 찾을 수 없습니다.");
    const dec = new TextDecoder("utf-8");
    const lines = [];
    for (const n of names) {
      const xml = dec.decode(entries[n]);
      // 문단(<hp:p …>) 단위로 나누고, 각 문단의 <hp:t> 텍스트를 결합
      const paras = xml.split(/<hp:p[\s>]/);
      for (let i = 1; i < paras.length; i++) {
        const runs = paras[i].match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [];
        const text = runs.map(r => _entities(r.replace(/<hp:t[^>]*>/, "").replace(/<\/hp:t>/, "")
                                              .replace(/<[^>]+>/g, ""))).join("");
        lines.push(text);
      }
    }
    return lines.join("\n");
  }

  /** 확장자/매직바이트로 HWP(CFB) vs HWPX(ZIP) 자동 판별 후 텍스트 추출 */
  async function extractDocText(arrayBuffer, XLSXlib, pakoLib) {
    const u8 = new Uint8Array(arrayBuffer);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return extractHwpxText(arrayBuffer, pakoLib);   // "PK" = ZIP/HWPX
    return extractHwpText(arrayBuffer, XLSXlib, pakoLib);                                  // CFB = HWP 5.0
  }

  const api = { extractHwpText, extractHwpxText, extractDocText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(global, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
