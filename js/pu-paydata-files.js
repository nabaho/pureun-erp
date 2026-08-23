/* 급여데이터함 — 사진이 아닌 자료를 글자로 뽑는다 (대표 결정 2026-08-23)
 *
 * 왜 이 파일이 있나: 판독기는 여태 **사진(jpeg)만** AI 에 보냈다. 그런데 급여
 * 자료 대부분은 엑셀(근태표·급여대장)이다. 엑셀을 화면 찍어 보내면 1↔7·4↔9 를
 * 잘못 읽는다 — 그런데 엑셀 파일 자체를 열면 칸 값이 **글자 그대로** 나온다.
 * 오독이 있을 수가 없다.
 *
 * 그래서 「파일에서 글자를 뽑아 → 그 글자를 AI 에 보낸다」로 간다.
 * AI 가 하는 일은 읽기가 아니라 **어느 칸이 무엇인가 판단**뿐이다.
 *
 * ⚠ 여기는 **뽑기만** 한다. AI 에 보내는 것은 판독 층(pu-doc-read.js)이고,
 *   값으로 만드는 것은 저장 층이다 — 섞으면 검사할 수 없다.
 * 의존: SheetJS(vendor/xlsx.full.min.js). 한글·PDF 는 hwp_extract.js 가 맡는다.
 */
(function (global) {
  'use strict';

  /* AI 에 한 번에 보낼 줄 수 — 넘으면 잘라 내고 그렇다고 적는다.
     통째로 보내면 답이 중간에 잘리거나(모델 한도) 돈이 튄다. */
  var MAX_LINES = 400;
  var MAX_CELLS_PER_LINE = 40;

  var SHEET_EXT = ['xlsx', 'xlsm', 'xls', 'csv', 'tsv'];
  var DOC_EXT = ['hwp', 'hwpx', 'docx', 'doc', 'odt', 'rtf'];
  var IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif'];
  /* 글자 파일 — 메일 본문을 .txt 로 담는다(2026-08-23). 카톡·문자를 내보낸
     것도 같은 길로 들어온다. 뽑을 것이 없다, 이미 글자다. */
  var TEXT_EXT = ['txt', 'text', 'md', 'log'];

  function extOf(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  /* 이 파일을 어떻게 읽을지 — 확장자로 가른다.
     sheet = 칸을 그대로 · doc = 글자를 뽑아서 · pdf = 글자가 있으면 글자,
     없으면(스캔) 쪽을 그림으로 · image = 지금 쓰는 사진 판독 그대로. */
  function fileKind(name) {
    var e = extOf(name);
    if (SHEET_EXT.indexOf(e) >= 0) return 'sheet';
    if (DOC_EXT.indexOf(e) >= 0) return 'doc';
    if (e === 'pdf') return 'pdf';
    if (TEXT_EXT.indexOf(e) >= 0) return 'text';
    if (IMG_EXT.indexOf(e) >= 0) return 'image';
    return 'other';
  }

  function lib() {
    var X = global.XLSX;
    if (!X || !X.read) throw new Error('엑셀 읽기 도구가 없습니다 — 화면을 새로 고쳐 주세요');
    return X;
  }

  function book(arrayBuffer) {
    var X = lib();
    try {
      /* cellDates:false — 날짜를 자바스크립트 날짜로 바꾸면 「2026-08-01」이
         「Fri Aug 01 2026...」로 뒤바뀐다. 엑셀에 보이는 글자를 그대로 쓴다. */
      return X.read(arrayBuffer, { type: 'array', cellDates: false, cellText: true });
    } catch (e) {
      throw new Error('엑셀을 읽지 못했습니다 — 파일이 깨졌거나 엑셀 파일이 아닙니다');
    }
  }

  function sheetNames(arrayBuffer) {
    return book(arrayBuffer).SheetNames.slice();
  }

  /* 시트 하나를 탭으로 이은 글자로. 엑셀은 아래·옆으로 빈 칸이 천 줄씩 있으므로
     빈 줄과 빈 칸을 걷어낸다 — 안 걷으면 AI 에 보내는 것의 대부분이 빈칸이다. */
  function sheetText(arrayBuffer, sheetName) {
    var X = lib();
    var wb = book(arrayBuffer);
    var name = sheetName || wb.SheetNames[0];
    if (wb.SheetNames.indexOf(name) < 0) return '';   // 엉뚱한 시트를 대신 읽지 않는다
    var ws = wb.Sheets[name];
    if (!ws) return '';

    var aoa = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
    var lines = [];
    var cut = false;
    for (var i = 0; i < aoa.length; i++) {
      var row = (aoa[i] || []).slice(0, MAX_CELLS_PER_LINE)
        .map(function (c) {
          /* 탭·줄바꿈은 칸 나누기를 망가뜨리고, 제어문자는 엑셀이 아닌 파일을
             억지로 읽었을 때 들어온다 — AI 프롬프트에 그런 쓰레기를 보내지 않는다. */
          return String(c == null ? '' : c)
            .replace(/[\t\r\n]+/g, ' ')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim();
        });
      /* 오른쪽 빈 칸을 떼어 낸다 — 「김철수\t22\t\t\t\t」 같은 꼬리가 남으면
         AI 가 빈 항목을 있는 것으로 읽는다. */
      while (row.length && row[row.length - 1] === '') row.pop();
      if (!row.length) continue;                        // 통째로 빈 줄
      if (lines.length >= MAX_LINES) { cut = true; break; }
      lines.push(row.join('\t'));
    }
    if (!lines.length) return '';
    var out = lines.join('\n');
    if (cut) out += '\n… 줄이 너무 많아 여기서 잘랐습니다(' + MAX_LINES + '줄까지).';
    return out;
  }

  global.PuPaydataFiles = {
    MAX_LINES: MAX_LINES,
    extOf: extOf,
    fileKind: fileKind,
    sheetNames: sheetNames,
    sheetText: sheetText
  };
})(typeof window !== 'undefined' ? window : globalThis);
