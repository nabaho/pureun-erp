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

  /* 네이버·카카오톡 앱 «안에서» 연 화면인가.
     ⚠ 이 브라우저들에는 지문 기능(WebAuthn)이 아예 없다. 그래서 단추를 감추면
       「기능이 없다」로 보인다 — 실제로는 «여기서만» 안 되는 것이다.
       왜 안 되는지 말해 주고 크롬으로 가는 길을 열어 준다. */
  function inApp() {
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    return /NAVER\(inapp|KAKAOTALK|Instagram|FBAN|FBAV|Line\/|DaumApps|; wv\)/i.test(ua);
  }

  /* 크롬으로 다시 열기. 안드로이드는 intent 로 바로 넘어가고,
     아이폰 등 안 되는 곳은 주소를 복사해 준다(붙여넣기만 하면 된다). */
  function openInChrome() {
    var url = global.location.href.split('#')[0];
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    if (/Android/i.test(ua)) {
      var bare = url.replace(/^https?:\/\//, '');
      try {
        global.location.href = 'intent://' + bare + '#Intent;scheme=https;package=com.android.chrome;end';
        return 'chrome';
      } catch (e) { /* 아래 복사로 내려간다 */ }
    }
    try {
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(url);
        return 'copied';
      }
    } catch (e) { /* 복사도 막힌 브라우저가 있다 */ }
    return 'manual';
  }

  /* 서버가 «JSON 이 아닌» 답을 보냈을 때 — 왜 그런지 말해 준다.
     ─────────────────────────────────────────────────────────────────────
     ⚠ 예전에는 그냥 「서버 응답을 읽지 못했습니다」 한 줄이었다(2026-08-26 대표 지적
       「지문인식 왜 안 되나」). 그 한 줄로는 고칠 수가 없다 — 답이 안 온 것인지,
       기능이 안 올라간 것인지, 권한에 막힌 것인지, 서버가 터진 것인지가
       «전부 같은 문장» 이었기 때문이다. 상태 번호를 삼키지 않고 말한다.
     ⚠ 대괄호 안(경로·번호·서버가 보낸 첫 줄)은 «신고용 손잡이» 다.
       화면에 그대로 보여야 캡처 한 장으로 어디가 막혔는지 알 수 있다. */
  function whyNotJson(path, st, text) {
    var head = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    var why =
      st === 404 ? '서버에 이 기능이 아직 올라가지 않았습니다 (배포가 필요합니다)' :
      st === 403 ? '서버가 요청을 막았습니다 (함수 공개 권한을 확인해 주세요)' :
      st === 401 ? '서버가 로그인을 요구했습니다 (함수 공개 권한을 확인해 주세요)' :
      (st >= 500) ? '서버에서 오류가 났습니다' :
      st === 0 ? '서버에 닿지 못했습니다' :
      '서버가 알 수 없는 답을 보냈습니다';
    return why + ' [' + path + ' ' + (st || '연결실패') + (head ? ' · ' + head : '') + ']';
  }

  function post(path, body, idToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (idToken) headers.Authorization = 'Bearer ' + idToken;
    var st = 0;
    return fetch(BASE + '/' + path, {
      method: 'POST', headers: headers, body: JSON.stringify(body || {})
    }).catch(function (e) {
      /* 여기로 오면 «답 자체가 없다» — 인터넷이 끊겼거나 CORS 에 막혔거나
         주소가 없다. 상태 번호가 없으므로 0 으로 알린다. */
      throw new Error(whyNotJson(path, 0, (e && e.message) || ''));
    }).then(function (r) {
      st = r.status;
      /* ⚠ r.json() 을 바로 부르지 않는다 — 실패하면 «서버가 뭐라고 했는지» 까지
         함께 잃는다. 글자로 받아 우리가 풀어 본다. */
      return r.text();
    }).then(function (t) {
      var j = null;
      try { j = JSON.parse(t); } catch (e) { /* 아래에서 까닭을 말한다 */ }
      if (!j) throw new Error(whyNotJson(path, st, t));
      if (!j.ok) throw new Error(j.error || '실패했습니다');
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
    inApp: inApp,
    openInChrome: openInChrome,
    register: register,
    login: login,
    devices: devices,
    removeDevice: removeDevice,
    _b64uToBytes: b64uToBytes,
    _bytesToB64u: bytesToB64u
  };
})(typeof window !== 'undefined' ? window : globalThis);
