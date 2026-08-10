/* 한글 자료(hwp·hwpx) 글 고치기 — 번호 붙은 줄 목록
   ═══════════════════════════════════════════════════════════════════════════
   자료함에 올린 제안서·계약서를 **내려받지 않고 그 자리에서** 고치려고 만들었다
   (대표 지시 2026-08-10). 오른쪽 칸에 줄마다 번호를 붙여 보여주고, 고친 줄만
   문서에 되돌려 넣는다.

   ⚠ 원본 서식은 그대로 남는다. 새로 만드는 것이 아니라 **있는 문서의 글자만**
     바꿔 넣고 다시 저장하기 때문이다(vendor/rhwp-core 엔진의 replaceText).
     그래서 글꼴·표·도장 자리가 흐트러지지 않는다.

   ⚠ 못 하는 것 — 화면에도 적어 둔다. 모르고 쓰면 「왜 안 되나」로 시간을 버린다.
     · 줄을 새로 만들거나 지우기 (글자만 바꾼다)
     · 표의 칸을 늘리기·합치기
     · 글꼴·크기 바꾸기
     이런 건 한글에서 해야 한다.

   엔진(doc)은 겉모습만 맞으면 되므로 여기 함수들은 검사에서 가짜 doc 으로
   그대로 돌려볼 수 있다 — 7MB WASM 없이 검사한다. */
(function (global) {
  'use strict';

  /* 표 안을 들여다볼 때 몇 번째 물건까지 뒤져 볼지.
     표는 보통 첫 번째다. 그림이 앞에 끼면 밀리므로 몇 칸 더 본다. */
  const CTRL_PROBE = 4;

  /* ── 문서에서 번호 붙인 줄 뽑기 ──
     본문 줄 → 그 줄에 표가 붙어 있으면 표의 칸들 → 다음 본문 줄, 순서로 담는다.
     그래서 번호 순서가 문서에서 눈으로 보는 순서와 같다.
     빈 본문 줄은 뺀다(문서에는 줄 간격 벌리는 빈 줄이 많다 — 번호만 늘어난다).
     표의 빈 칸은 **남긴다** — 계약서의 「갑」 자리처럼 채워 넣을 곳이다. */
  function readRows(doc) {
    const rows = [];
    const secs = num(doc.getSectionCount());
    for (let s = 0; s < secs; s++) {
      const paras = num(doc.getParagraphCount(s));
      for (let p = 0; p < paras; p++) {
        let text = '';
        try { text = String(doc.getTextRange(s, p, 0, num(doc.getParagraphLength(s, p)))); } catch (_) { text = ''; }
        if (text.trim()) rows.push({ kind: 'body', sec: s, para: p, text: text, len: text.length });
        pushCells(doc, rows, s, p);
      }
    }
    return rows.map((r, i) => Object.assign(r, { no: i + 1 }));
  }

  function pushCells(doc, rows, s, p) {
    for (let ctrl = 0; ctrl < CTRL_PROBE; ctrl++) {
      let dim = null;
      /* 표가 아니면 던진다 — 그림·글상자일 수 있으니 멈추지 말고 다음 것을 본다 */
      try { dim = JSON.parse(doc.getTableDimensions(s, p, ctrl)); } catch (_) { continue; }
      const cells = num(dim && dim.cellCount);
      for (let c = 0; c < cells; c++) {
        let cps = 0;
        try { cps = num(doc.getCellParagraphCount(s, p, ctrl, c)); } catch (_) { continue; }
        for (let cp = 0; cp < cps; cp++) {
          let len = 0, text = '';
          try {
            len = num(doc.getCellParagraphLength(s, p, ctrl, c, cp));
            text = String(doc.getTextInCell(s, p, ctrl, c, cp, 0, len));
          } catch (_) { continue; }
          /* 한 칸에 여러 줄이면 둘째 줄부터는 빈 줄을 뺀다 — 칸마다 한 줄은 남긴다 */
          if (cp > 0 && !text.trim()) continue;
          rows.push({ kind: 'cell', sec: s, para: p, ctrl: ctrl, cell: c, cpara: cp,
                      text: text, len: text.length, rc: cellPos(dim, c) });
        }
      }
    }
  }

  /* 몇째 줄 몇째 칸인지 — 화면에 「2행 3열」로 알려 주려고 */
  function cellPos(dim, idx) {
    const cols = num(dim && dim.colCount) || 1;
    return { row: Math.floor(idx / cols) + 1, col: (idx % cols) + 1 };
  }

  /* ── 고친 줄 찾기 ──
     안 고친 줄은 건드리지 않는다. 손대는 곳이 적을수록 문서가 덜 상한다. */
  function changedRows(rows, edited) {
    const out = [];
    rows.forEach((r, i) => {
      const v = clean(edited[i] == null ? r.text : edited[i]);
      if (v !== r.text) out.push(Object.assign({}, r, { next: v }));
    });
    return out;
  }

  /* 한 줄에 줄바꿈을 넣으면 문서의 줄 수가 달라진다 — 여기서는 글자만 바꾸므로
     칸(공백)으로 바꾼다. 줄을 나눌 일이면 한글에서 해야 한다(화면에 적어 둠). */
  function clean(v) {
    return String(v == null ? '' : v).replace(/\r/g, '').replace(/\n/g, ' ');
  }

  /* ── 문서에 되돌려 넣기 ──
     한 줄을 통째로 바꾼다(0 부터 원래 길이만큼 지우고 새 글자). 줄 번호는 바뀌지
     않으므로 순서는 상관없다. 표 칸은 바꾸기가 따로 없어 지우고 넣는다.
     실패한 줄은 세어서 돌려준다 — 조용히 넘기면 「저장했다는데 안 바뀌었다」가 된다. */
  function applyRows(doc, changes) {
    let ok = 0;
    const failed = [];
    (changes || []).forEach((ch) => {
      try {
        if (ch.kind === 'cell') {
          if (ch.len > 0) doc.deleteTextInCell(ch.sec, ch.para, ch.ctrl, ch.cell, ch.cpara, 0, ch.len);
          if (ch.next) doc.insertTextInCell(ch.sec, ch.para, ch.ctrl, ch.cell, ch.cpara, 0, ch.next);
        } else {
          doc.replaceText(ch.sec, ch.para, 0, ch.len, ch.next);
        }
        ok++;
      } catch (e) {
        failed.push({ no: ch.no, why: (e && e.message) || '알 수 없는 까닭' });
      }
    });
    return { ok: ok, failed: failed };
  }

  /* 저장할 형식 — 올라온 그대로 돌려준다. hwp 로 받았으면 hwp 로.
     엔진이 둘 다 쓸 수 있으므로 굳이 바꾸지 않는다(받는 쪽이 못 열 수 있다). */
  function extOf(name) {
    return /\.hwpx$/i.test(String(name || '')) ? 'hwpx' : 'hwp';
  }
  function exportBytes(doc, name) {
    return extOf(name) === 'hwpx' ? doc.exportHwpx() : doc.exportHwp();
  }

  /* 내려받을 때 붙일 이름 — 원본과 헷갈리지 않게 (수정) 을 붙인다.
     이미 붙어 있으면 또 붙이지 않는다((수정)(수정)(수정).hwpx 가 된다). */
  function editedName(name) {
    const s = String(name || '문서.hwpx');
    const m = s.match(/^(.*?)(\.[a-z0-9]+)$/i);
    const base = m ? m[1] : s, ext = m ? m[2] : '';
    return /\(수정\)$/.test(base) ? s : base + '(수정)' + ext;
  }

  function num(v) { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; }

  const api = { readRows: readRows, changedRows: changedRows, applyRows: applyRows,
                exportBytes: exportBytes, extOf: extOf, editedName: editedName, clean: clean,
                cellPos: cellPos, CTRL_PROBE: CTRL_PROBE };
  if (typeof window !== 'undefined') window.PuHwpEdit = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
