/* 지문·간편 로그인(패스키) — 화면 쪽
   ─────────────────────────────────────────────────────────────────────────
   ★ 여기서 하는 일은 «심부름» 뿐이다. 진짜 판단은 서버(functions/passkey.js)가 한다.
     화면이 「맞다」고 해도 서버가 서명을 다시 따진다 — 화면 코드는 못 믿는 것이 원칙이다.

   ★ 지문·얼굴은 휴대폰 안에서만 확인된다. 이 파일도, 우리 서버도 지문을 보지 못한다.

   ⚠ 「지문」이라고만 적지 않는다
     휴대폰 설정에 따라 얼굴이나 잠금번호가 뜬다. 기술적으로 지문만 강제할 수 없으므로
     화면 문구는 「지문·간편 로그인」으로 적는다 — 지문만 된다고 적으면 거짓말이 된다. */
(function (global) {
  'use strict';

  var BASE = 'https://asia-northeast3-pureun-erp.cloudfunctions.net';

  /* 브라우저와 서버는 서로 다른 모양으로 값을 주고받는다.
     서버는 글자(base64url), 브라우저는 바이트다 — 오갈 때마다 바꿔 준다. */
  function b64uToBytes(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64u(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* 이 기기에서 쓸 수 있는가. 안 되는 기기에 단추를 보여 주면
     눌러 보고 안 된 뒤에야 알게 된다 — 그 전에 감춘다. */
  function supported() {
    return !!(global.PublicKeyCredential && global.navigator &&
      global.navigator.credentials && global.navigator.credentials.create);
  }

  function post(path, body, idToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (idToken) headers.Authorization = 'Bearer ' + idToken;
    return fetch(BASE + '/' + path, {
      method: 'POST', headers: headers, body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: '서버 응답을 읽지 못했습니다' }; });
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || '실패했습니다');
      return j;
    });
  }

  /* ── 등록 — 이미 비밀번호로 들어온 사람만 할 수 있다(서버가 확인한다) ── */
  function register(sid, name, label, idToken) {
    if (!supported()) return Promise.reject(new Error('이 기기는 지문 로그인을 지원하지 않습니다'));
    return post('passkeyRegisterStart', { sid: sid, name: name }, idToken).then(function (j) {
      var o = j.options;
      var pk = {
        challenge: b64uToBytes(o.challenge),
        rp: o.rp,
        user: { id: b64uToBytes(o.user.id), name: o.user.name, displayName: o.user.displayName },
        pubKeyCredParams: o.pubKeyCredParams,
        timeout: o.timeout,
        attestation: o.attestation,
        authenticatorSelection: o.authenticatorSelection,
        excludeCredentials: (o.excludeCredentials || []).map(function (c) {
          return { id: b64uToBytes(c.id), type: 'public-key' };
        })
      };
      return navigator.credentials.create({ publicKey: pk });
    }).then(function (cred) {
      if (!cred) throw new Error('등록이 취소되었습니다');
      var r = cred.response;
      return post('passkeyRegisterFinish', {
        sid: sid, label: label,
        response: {
          id: cred.id, rawId: bytesToB64u(cred.rawId), type: cred.type,
          clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
          response: {
            clientDataJSON: bytesToB64u(r.clientDataJSON),
            attestationObject: bytesToB64u(r.attestationObject),
            transports: r.getTransports ? r.getTransports() : []
          }
        }
      }, idToken);
    });
  }

  /* ── 로그인 — 통과하면 서버가 「그 사람 계정」 표(custom token)를 준다 ── */
  function login(sid) {
    if (!supported()) return Promise.reject(new Error('이 기기는 지문 로그인을 지원하지 않습니다'));
    return post('passkeyLoginStart', { sid: sid }).then(function (j) {
      var o = j.options;
      var pk = {
        challenge: b64uToBytes(o.challenge),
        rpId: o.rpId,
        timeout: o.timeout,
        userVerification: o.userVerification,
        allowCredentials: (o.allowCredentials || []).map(function (c) {
          return { id: b64uToBytes(c.id), type: 'public-key' };
        })
      };
      return navigator.credentials.get({ publicKey: pk });
    }).then(function (cred) {
      if (!cred) throw new Error('취소되었습니다');
      var r = cred.response;
      return post('passkeyLoginFinish', {
        sid: sid,
        response: {
          id: cred.id, rawId: bytesToB64u(cred.rawId), type: cred.type,
          clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
          response: {
            clientDataJSON: bytesToB64u(r.clientDataJSON),
            authenticatorData: bytesToB64u(r.authenticatorData),
            signature: bytesToB64u(r.signature),
            userHandle: r.userHandle ? bytesToB64u(r.userHandle) : null
          }
        }
      });
    }).then(function (j) { return j.token; });
  }

  function devices(sid, idToken) {
    return post('passkeyDevices', { sid: sid }, idToken).then(function (j) { return j.devices || []; });
  }
  function removeDevice(sid, credId, idToken) {
    return post('passkeyDevices', { sid: sid, remove: credId }, idToken);
  }

  global.PuPasskey = {
    supported: supported,
    register: register,
    login: login,
    devices: devices,
    removeDevice: removeDevice,
    _b64uToBytes: b64uToBytes,
    _bytesToB64u: bytesToB64u
  };
})(typeof window !== 'undefined' ? window : globalThis);
