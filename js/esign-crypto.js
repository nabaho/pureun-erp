'use strict';
// 푸른노무법인 — 전자위임장 E2E 암호화 모듈 (브라우저 window.EsignCrypto / Node module.exports 겸용)
// 방식: 하이브리드 암호 — 제출 데이터는 랜덤 AES-GCM 키로, AES 키는 사건 RSA-OAEP 공개키로 봉인.
// 사건 개인키는 노무사의 사건 비밀번호(PBKDF2-SHA256 150,000회 — kcareer 신분증보관함과 동일 강도)로 보호.
(function (root) {
  var subtle = root.crypto.subtle;
  var te = new TextEncoder();
  var td = new TextDecoder();

  // ArrayBuffer/TypedArray → base64
  function b64(buf) {
    var u = new Uint8Array(buf.buffer || buf), s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return (typeof btoa !== 'undefined') ? btoa(s) : Buffer.from(u).toString('base64');
  }
  // base64 → ArrayBuffer
  function unb64(s) {
    if (typeof atob !== 'undefined') {
      var bin = atob(s), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    }
    var b = Buffer.from(s, 'base64');
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }

  // 링크 추측 방지 토큰 — 128bit hex
  function randomToken() {
    var u = new Uint8Array(16);
    root.crypto.getRandomValues(u);
    return Array.from(u).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  // 사건 키쌍 생성 (RSA-OAEP 2048)
  async function generateCaseKeys() {
    var kp = await subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['encrypt', 'decrypt']);
    return {
      pubKeyJwk: await subtle.exportKey('jwk', kp.publicKey),
      privKeyJwk: await subtle.exportKey('jwk', kp.privateKey)
    };
  }

  // 비밀번호 → AES 키 파생
  async function deriveKey(password, saltBuf) {
    var km = await subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuf, iterations: 150000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // 사건 개인키를 사건 비밀번호로 암호화 (RTDB 보관용)
  async function protectPrivKey(privKeyJwk, password) {
    var salt = root.crypto.getRandomValues(new Uint8Array(16));
    var iv = root.crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt);
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, te.encode(JSON.stringify(privKeyJwk)));
    return { data: b64(ct), salt: b64(salt), iv: b64(iv) };
  }

  // 사건 비밀번호로 개인키 복원 (비번 오류 시 AES-GCM 무결성 검증 실패로 reject)
  async function unprotectPrivKey(protObj, password) {
    var key = await deriveKey(password, unb64(protObj.salt));
    var pt = await subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(unb64(protObj.iv)) }, key, unb64(protObj.data));
    return JSON.parse(td.decode(pt));
  }

  // 근로자 제출 데이터 암호화 (sign.html에서 사용)
  async function encryptSubmission(obj, pubKeyJwk) {
    var pub = await subtle.importKey('jwk', pubKeyJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    var aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    var iv = root.crypto.getRandomValues(new Uint8Array(12));
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, aes, te.encode(JSON.stringify(obj)));
    var raw = await subtle.exportKey('raw', aes);
    var wrapped = await subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
    return { enc: b64(ct), encKey: b64(wrapped), iv: b64(iv) };
  }

  // 제출 데이터 복호화 (docs-esign.html에서 사용)
  async function decryptSubmission(sub, privKeyJwk) {
    var priv = await subtle.importKey('jwk', privKeyJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    var raw = await subtle.decrypt({ name: 'RSA-OAEP' }, priv, unb64(sub.encKey));
    var aes = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    var pt = await subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(unb64(sub.iv)) }, aes, unb64(sub.enc));
    return JSON.parse(td.decode(pt));
  }

  var api = {
    randomToken: randomToken,
    generateCaseKeys: generateCaseKeys,
    protectPrivKey: protectPrivKey,
    unprotectPrivKey: unprotectPrivKey,
    encryptSubmission: encryptSubmission,
    decryptSubmission: decryptSubmission
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EsignCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
