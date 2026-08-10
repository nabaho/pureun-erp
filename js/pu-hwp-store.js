(function (global) {
  'use strict';

  var DB_NAME = 'pureun_hwp_documents';
  var STORE_NAME = 'documents';
  var DB_VERSION = 1;

  function cleanPart(value) {
    var out = String(value == null ? '' : value).trim();
    if (!out) throw new Error('문서 보관 위치를 확인할 수 없습니다.');
    return out.replace(/[^a-zA-Z0-9가-힣_.:-]/g, '_').slice(0, 180);
  }

  function recordId(scope, key) {
    return cleanPart(scope) + '::' + cleanPart(key);
  }

  function exactBuffer(input) {
    var bytes;
    if (input instanceof Uint8Array) bytes = input;
    else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
    else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    else throw new TypeError('문서 데이터를 읽을 수 없습니다.');
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function openDb() {
    if (!global.indexedDB) return Promise.reject(new Error('이 브라우저에서는 기기 보관 기능을 사용할 수 없습니다.'));
    return new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('문서 보관함을 열지 못했습니다.')); };
    });
  }

  function run(mode, action) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, mode);
        var req;
        try { req = action(tx.objectStore(STORE_NAME)); }
        catch (e) { db.close(); reject(e); return; }
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('문서 보관 작업에 실패했습니다.')); };
        tx.oncomplete = function () { db.close(); };
        tx.onabort = tx.onerror = function () { db.close(); };
      });
    });
  }

  function putBytes(scope, key, input, fileName) {
    if (!global.PureunHwp || typeof global.PureunHwp.validate !== 'function') {
      return Promise.reject(new Error('한글 문서 엔진이 준비되지 않았습니다.'));
    }
    var buffer = exactBuffer(input);
    var meta = global.PureunHwp.validate(buffer, fileName);
    var now = new Date().toISOString();
    var record = {
      id: recordId(scope, key),
      scope: cleanPart(scope),
      key: cleanPart(key),
      name: meta.fileName,
      format: meta.format,
      size: meta.size,
      savedAt: now,
      bytes: buffer
    };
    return run('readwrite', function (store) { return store.put(record); }).then(function () { return record; });
  }

  function putFile(scope, key, file) {
    if (!file || typeof file.arrayBuffer !== 'function') return Promise.reject(new Error('등록할 파일을 선택해 주세요.'));
    return file.arrayBuffer().then(function (buffer) { return putBytes(scope, key, buffer, file.name); });
  }

  function get(scope, key) {
    return run('readonly', function (store) { return store.get(recordId(scope, key)); });
  }

  function remove(scope, key) {
    return run('readwrite', function (store) { return store.delete(recordId(scope, key)); });
  }

  var api = { recordId: recordId, putBytes: putBytes, putFile: putFile, get: get, remove: remove };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PureunHwpStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
