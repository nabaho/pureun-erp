/* Preview pipeline adapted from claw-hwp (MIT), Copyright (c) 2026 DoHyun468. */
(function (global) {
  'use strict';

  var DEFAULTS = {
    coreUrl: 'vendor/rhwp-core/rhwp.js',
    editorUrl: 'https://esm.sh/@rhwp/editor',
    maxFileBytes: 100 * 1024 * 1024,
    maxCanvasPixels: 32 * 1024 * 1024
  };
  var corePromise = null;

  function config(extra) {
    var saved = {};
    try { saved = JSON.parse(global.localStorage.getItem('pureun_hwp_config') || '{}') || {}; } catch (_) {}
    return Object.assign({}, DEFAULTS, saved, global.PUREUN_HWP_CONFIG || {}, extra || {});
  }

  function extension(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function bytesOf(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new TypeError('문서 데이터 형식을 확인할 수 없습니다.');
  }

  function detectFormat(input, fileName) {
    var bytes = bytesOf(input);
    if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
        bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1) return 'hwp';
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) return 'hwpx';
    return '';
  }

  function validate(input, fileName, extra) {
    var bytes = bytesOf(input);
    var cfg = config(extra);
    if (!bytes.length) throw new Error('빈 문서는 등록할 수 없습니다.');
    if (bytes.byteLength > cfg.maxFileBytes) throw new Error('문서가 너무 큽니다. 최대 100MB까지 등록할 수 있습니다.');
    var format = detectFormat(bytes, fileName);
    if (!format) throw new Error('정상적인 HWP 또는 HWPX 문서가 아닙니다.');
    var ext = extension(fileName);
    if (ext && ext !== format) throw new Error('파일 내용과 확장자가 일치하지 않습니다.');
    return { format: format, size: bytes.byteLength, fileName: String(fileName || ('document.' + format)) };
  }

  function setupCanvasMeasure() {
    if (typeof global.measureTextWidth === 'function' || !global.document) return;
    var ctx = null, lastFont = '';
    global.measureTextWidth = function (font, text) {
      if (!ctx) ctx = global.document.createElement('canvas').getContext('2d');
      if (font !== lastFont) { ctx.font = font; lastFont = font; }
      return ctx.measureText(text).width;
    };
  }

  function dynamicImport(url) {
    return Function('u', 'return import(u)')(url);
  }

  function loadCore(extra) {
    if (corePromise) return corePromise;
    setupCanvasMeasure();
    var cfg = config(extra);
    var url = new URL(cfg.coreUrl, global.location && global.location.href || 'http://localhost/').href;
    corePromise = dynamicImport(url).then(function (mod) {
      return mod.default().then(function () { return mod; });
    }).catch(function (err) {
      corePromise = null;
      throw err;
    });
    return corePromise;
  }

  function inspect(input, fileName, extra) {
    var meta = validate(input, fileName, extra);
    return loadCore(extra).then(function (rhwp) {
      var doc = new rhwp.HwpDocument(bytesOf(input));
      try {
        meta.pageCount = doc.pageCount();
        meta.engine = typeof rhwp.version === 'function' ? rhwp.version() : 'rhwp';
        return meta;
      } finally {
        if (doc && typeof doc.free === 'function') doc.free();
      }
    });
  }

  function renderPreview(container, input, fileName, extra) {
    if (!container || !global.document) return Promise.reject(new Error('미리보기 영역이 없습니다.'));
    validate(input, fileName, extra);
    container.innerHTML = '';
    container.style.cssText += ';overflow:auto;background:#e8edf3;padding:14px;text-align:center';
    return loadCore(extra).then(function (rhwp) {
      var doc = new rhwp.HwpDocument(bytesOf(input));
      try {
        var count = doc.pageCount();
        var geometry = [];
        for (var p = 0; p < count; p++) {
          var info = JSON.parse(doc.getPageInfo(p));
          geometry.push({ width: Number(info.width) || 0, height: Number(info.height) || 0 });
        }
        for (var i = 0; i < count; i++) {
          var size = geometry[i];
          if (!size.width || !size.height) continue;
          var available = Math.max(280, Math.min(container.clientWidth - 32 || size.width, size.width));
          var cssScale = available / size.width;
          var dpr = Math.max(1, Math.min(global.devicePixelRatio || 1,
            Math.sqrt(config(extra).maxCanvasPixels / (size.width * size.height))));
          var canvas = global.document.createElement('canvas');
          canvas.width = Math.round(size.width * dpr);
          canvas.height = Math.round(size.height * dpr);
          canvas.style.cssText = 'display:block;background:#fff;margin:0 auto 14px;box-shadow:0 2px 8px rgba(0,0,0,.2);max-width:100%;width:' +
            Math.round(size.width * cssScale) + 'px;height:' + Math.round(size.height * cssScale) + 'px';
          doc.renderPageToCanvas(i, canvas, dpr);
          try { doc.getPageTextLayout(i); } catch (_) {}
          container.appendChild(canvas);
        }
        return { pageCount: count };
      } finally {
        if (doc && typeof doc.free === 'function') doc.free();
      }
    });
  }

  function createEditor(selector, input, fileName, extra) {
    var meta = validate(input, fileName, extra);
    var cfg = config(extra);
    if (!cfg.editorUrl) return Promise.reject(new Error('고급 편집기 주소가 설정되지 않았습니다.'));
    return dynamicImport(cfg.editorUrl).then(function (mod) {
      if (!mod || typeof mod.createEditor !== 'function') throw new Error('편집기 모듈을 불러오지 못했습니다.');
      return mod.createEditor(selector);
    }).then(function (editor) {
      return Promise.resolve(editor.loadFile(input, meta.fileName)).then(function (loaded) {
        return { editor: editor, result: loaded, meta: meta };
      });
    });
  }

  function exportFrom(editor, format) {
    if (!editor) return Promise.reject(new Error('편집기가 준비되지 않았습니다.'));
    var method = format === 'hwpx' ? 'exportHwpx' : 'exportHwp';
    if (typeof editor[method] !== 'function') return Promise.reject(new Error('이 편집기는 해당 형식 저장을 지원하지 않습니다.'));
    return Promise.resolve(editor[method]());
  }

  function download(input, fileName, format) {
    var bytes = bytesOf(input);
    var fmt = format || detectFormat(bytes, fileName) || 'hwp';
    var blob = new Blob([bytes], { type: fmt === 'hwpx' ? 'application/vnd.hancom.hwpx' : 'application/x-hwp' });
    var a = global.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(fileName || ('document.' + fmt));
    global.document.body.appendChild(a);
    a.click();
    global.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  var api = {
    config: config,
    detectFormat: detectFormat,
    validate: validate,
    inspect: inspect,
    renderPreview: renderPreview,
    createEditor: createEditor,
    exportFrom: exportFrom,
    download: download
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PureunHwp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
