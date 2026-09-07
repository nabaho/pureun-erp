/* 백업에 담기는 주민등록번호를 잠근다 (대표 지시 2026-08-29)
   ─────────────────────────────────────────────────────────────────────────
   「푸른 화면에서는 주민번호가 보여야 한다. 그렇게 해야 업무 작업이 가능하다.
     하지만 백업 시 주번 암호화해야 된다.」

   ★ 그래서 이 파일은 «화면» 을 건드리지 않는다. 화면과 실시간DB 의 살아 있는
     자료는 지금 그대로다 — 노무 업무는 주민번호를 봐야 돌아간다.
     잠그는 것은 **백업으로 떠 나가는 사본** 하나뿐이다.

   ★ 왜 백업만인가
     백업은 «오래 남고, 옮겨 다니고, 아무도 안 본다». 스무 벌이 쌓여 있고,
     내려받아 파일로도 나가고, 몇 달 뒤에 열린다. 살아 있는 자료보다 새기 쉽다.

   ⚠ 무엇을 막고 무엇을 못 막나 — 정직하게
     막는 것 : 백업 덩어리가 «밖으로» 나갔을 때(파일·내보내기·규칙 실수로
               권한 없는 사람이 그 칸을 읽었을 때) 주민번호가 안 읽힌다.
     못 막는 것 : 열쇠(`backup_key/v1`)를 읽을 수 있는 사람은 풀 수 있다.
               그래서 그 칸은 **보안규칙에서 관리자만** 읽게 막아야 한다.
               규칙을 안 걸면 이 잠금은 «밖으로 나간 사본» 만 지킨다.

   ⚠ 되돌리기(복원)는 반드시 unseal 을 거쳐야 한다. 안 거치면 화면에
     `enc:v1:…` 이 주민번호 자리에 그대로 들어간다 — 자료가 깨진 것처럼 보인다.

   ⚠ 값의 «모양» 으로도 찾는다(13자리). 이름을 모르는 칸에 주민번호가 들어 있어도
     잡기 위해서다. 법인등록번호처럼 모양이 같은 값이 함께 잠길 수 있는데,
     되돌릴 때 그대로 풀리므로 해가 없다 — 놓치는 것보다 낫다. */
(function (global) {
  'use strict';

  var PREFIX = 'enc:v1:';
  /* 주민번호 모양 — 앞 6자리, 뒤 7자리. 붙여 썼든 줄표를 넣었든 잡는다. */
  var SHAPE = /^\s*\d{6}\s*-?\s*\d{7}\s*$/;
  /* 칸 이름으로도 찾는다 — 값이 아직 덜 채워졌거나 모양이 어긋나 있어도 잠근다. */
  var FIELD = /(rrn|jumin|주민|resident|ssn)/i;

  function isSealed(v) { return typeof v === 'string' && v.slice(0, PREFIX.length) === PREFIX; }
  function looksLikeRrn(v) { return typeof v === 'string' && SHAPE.test(v); }
  function isRrnField(k) { return FIELD.test(String(k == null ? '' : k)); }

  /* 잠글 자리인가. 빈 칸은 건드리지 않는다 — 잠가 봐야 지킬 것이 없고,
     푼 뒤 빈 문자열이 아닌 무언가가 되면 화면이 달라 보인다. */
  function shouldSeal(k, v) {
    if (typeof v !== 'string' || !v.trim() || isSealed(v)) return false;
    return looksLikeRrn(v) || isRrnField(k);
  }

  function b64(bytes) {
    var s = '', b = new Uint8Array(bytes);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(String(s || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function subtle() {
    var c = global.crypto || global.msCrypto;
    if (!c || !c.subtle) throw new Error('이 브라우저는 암호화를 지원하지 않습니다(https 로 열어 주세요)');
    return c.subtle;
  }

  /* ── 열쇠 ─────────────────────────────────────────────────────────────
     ⚠ 열쇠는 글자(base64)로 다니고, 쓸 때만 CryptoKey 로 바꾼다. */
  function newKeyB64() {
    var raw = new Uint8Array(32);
    (global.crypto || global.msCrypto).getRandomValues(raw);
    return b64(raw);
  }
  function importKey(keyB64) {
    return subtle().importKey('raw', unb64(keyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  /* ── 한 값 잠그기·풀기 ──────────────────────────────────────────────── */
  function sealOne(plain, key) {
    var iv = new Uint8Array(12);
    (global.crypto || global.msCrypto).getRandomValues(iv);
    return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(String(plain)))
      .then(function (ct) { return PREFIX + b64(iv) + ':' + b64(ct); });
  }
  function unsealOne(sealed, key) {
    var parts = String(sealed).slice(PREFIX.length).split(':');
    if (parts.length !== 2) return Promise.reject(new Error('잠긴 값의 모양이 아닙니다'));
    return subtle().decrypt({ name: 'AES-GCM', iv: unb64(parts[0]) }, key, unb64(parts[1]))
      .then(function (pt) { return new TextDecoder().decode(pt); });
  }

  /* ── 덩어리 통째로 ────────────────────────────────────────────────────
     ⚠ 원본을 «고치지 않는다». 백업을 뜨는 쪽은 같은 덩어리로 요약·id명부도
       만든다 — 그때 이미 잠겨 있으면 요약이 달라진다. 사본을 만들어 돌려준다.
     ⚠ 자리를 먼저 «모아» 두고 한꺼번에 암호화한다. 값마다 await 하면
       자료가 클수록 눈에 띄게 느려진다. */
  function walk(node, keyName, sites, pick) {
    if (Array.isArray(node)) {
      var arr = new Array(node.length);
      for (var i = 0; i < node.length; i++) arr[i] = walk(node[i], keyName, sites, pick);
      return arr;
    }
    if (node && typeof node === 'object') {
      var o = {};
      Object.keys(node).forEach(function (k) { o[k] = walk(node[k], k, sites, pick); });
      return o;
    }
    if (pick(keyName, node)) {
      var site = { v: node, box: null, name: keyName };
      sites.push(site);
      return site;                       // 자리표 — 아래에서 값으로 바꾼다
    }
    return node;
  }
  /* 자리표를 실제 값으로 바꿔 끼운다(같은 모양의 사본을 다시 걷는다) */
  function fill(node) {
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var v = node[i];
        if (v && v.box !== undefined && v.name !== undefined) node[i] = v.box;
        else fill(v);
      }
      return node;
    }
    if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        var v = node[k];
        if (v && typeof v === 'object' && v.box !== undefined && v.name !== undefined) node[k] = v.box;
        else fill(v);
      });
    }
    return node;
  }

  function mapAll(data, key, pick, one) {
    var sites = [];
    var copy = walk(data, '', sites, pick);
    if (!sites.length) return Promise.resolve(fill(copy));
    return Promise.all(sites.map(function (s) {
      return one(s.v, key).then(function (t) { s.box = t; });
    })).then(function () { return fill(copy); });
  }

  function seal(data, key) { return mapAll(data, key, shouldSeal, sealOne); }
  function unseal(data, key) {
    return mapAll(data, key, function (k, v) { return isSealed(v); }, unsealOne);
  }

  /* 몇 자리가 잠겼는지 세어 본다 — 「정말 잠겼나」를 눈으로 확인할 때 쓴다 */
  function countSealed(data) {
    var n = 0;
    (function w(x) {
      if (Array.isArray(x)) { x.forEach(w); return; }
      if (x && typeof x === 'object') { Object.keys(x).forEach(function (k) { w(x[k]); }); return; }
      if (isSealed(x)) n++;
    })(data);
    return n;
  }

  /* 잠글 «것이 있나» 를 먼저 묻는다 — 2026-09-07, 공용 백업(js/pu-backup.js)이 쓴다.
     ⚠ 없으면 열쇠를 아예 안 가져온다. 주민번호가 없는 앱(업무·전자서명 등)의 백업이
       열쇠 칸 권한 때문에 멎으면 안 된다. 값이 생기는 순간부터 열쇠가 필요해진다.
     ★ 세는 데 seal() 과 «같은 walk·같은 pick» 을 쓴다. 따로 걸으면 어긋난다 —
       셈은 0인데 seal 은 잠그거나(열쇠 없이 잠그려 들거나), 반대로 잠글 것을 놓친다. */
  function countToSeal(data) {
    var sites = [];
    walk(data, '', sites, shouldSeal);
    return sites.length;
  }

  /* ── 백업 열쇠를 얻는다 (대표 지시 2026-08-29) ────────────────────────────
     ⚠ 한 번 만들고 **절대 갈아치우지 않는다** — 갈면 옛 백업 서른 벌을 영영 못 푼다.
       그래서 「없을 때만」 넣는다. 규칙도 서버에서 `!data.exists()` 로 막고 있다.
     ⚠ 「있으면 그대로, 없으면 만들기」를 transaction 하나로 하면 «안 된다».
       transaction 은 같은 값을 돌려줘도 쓰기를 한 번 보내고, 그 쓰기가 규칙에 거부되어
       열쇠가 이미 있는 둘째 날부터 백업이 통째로 멈춘다. 그래서 «먼저 읽고» 없을 때만 만든다.
     ⚠ 두 사람이 같은 순간에 처음 켜면 한쪽은 규칙에 막힌다. 그때는 다시 읽어
       «먼저 넣은 쪽의 열쇠» 를 쓴다 — 막힌 것이 곧 남이 넣었다는 뜻이다.
     ★ pu-erp.html 의 erpBackupKey() 도 같은 자리(backup_key/v1)를 같은 방식으로 읽는다.
       코드가 둘이어도 «같은 값»을 쓰므로 서로의 백업을 풀 수 있다
       (tests/rrn-seal.test.js 가 둘이 같은 자리를 보고, 둘 다 열쇠를 덮지 않는지 지킨다). */
  function keyFor(ref) {
    var read = function () { return ref.once('value').then(function (s) { return s.val() || null; }); };
    return read().then(function (have) {
      if (have) return have;
      var made = newKeyB64();
      return ref.transaction(function (cur) { return cur || made; })
        .then(read, read);              // 넣었든 남이 먼저 넣어 막혔든 — 다시 읽는다
    }).then(function (b64) {
      if (!b64) throw new Error('백업 열쇠를 읽지 못했습니다(권한 확인)');
      return importKey(b64);
    });
  }

  global.PuRrnSeal = {
    PREFIX: PREFIX,
    isSealed: isSealed, looksLikeRrn: looksLikeRrn, isRrnField: isRrnField, shouldSeal: shouldSeal,
    newKeyB64: newKeyB64, importKey: importKey, keyFor: keyFor,
    sealOne: sealOne, unsealOne: unsealOne,
    seal: seal, unseal: unseal, countSealed: countSealed, countToSeal: countToSeal
  };
})(typeof window !== 'undefined' ? window : globalThis);
