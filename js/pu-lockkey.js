/* 푸른통합시스템 — 개인 폴더 「지문」 층
   ═══════════════════════════════════════════════════════════════════════════
   ★ 왜 있나
   대표님이 개인 폴더로 옮긴 명함은 공유 검색목록(pucards/idx)에서 빠진다.
   그래야 직원 화면·푸른이알피가 그 명함을 당겨오지 못한다. 그런데 그 때문에
   **사진첩이 "이미 있는 명함인가"를 물으면 없다고 답한다.** 결과는 이렇다.

     개인 폴더에 감춰 둔 사람의 명함을 사진첩으로 다시 찍는다
       → 못 찾는다 → 공용 목록에 새로 만든다
       → 감추려던 사람이 전 직원에게 다시 보인다

   감추는 장치가 스스로를 무너뜨린다. 그래서 「있다/없다」만 답하는 자리를
   따로 둔다.

   ★ 무엇을 남기나 — 지문 하나뿐
   pucards/lockkeys/{지문} = 1
   지문은 **휴대폰 번호(사업자등록증은 사업자번호)를 되돌릴 수 없게 뭉갠 값**이다.
   이름·회사·폴더 이름·잠근 때는 하나도 담지 않는다. 이 목록을 통째로 들여다봐도
   누가 개인 폴더에 있는지 알 수 없다.

   ⚠ 이것은 「직원이 DB를 열어 봐도 명단을 읽을 수 없게」 하는 장치다.
     번호를 하나하나 넣어 맞혀 보는 것까지 막지는 못한다(번호는 경우의 수가
     적다). 그래서 되돌리기 어렵게 만드는 데 PBKDF2 를 쓰되, 폴더를 잠글 때
     명함 수백 장을 한꺼번에 뭉개야 하므로 횟수는 1만 번으로 둔다
     (비밀번호는 10만 번 — 그쪽은 한 번만 계산하면 된다).

   ⚠ 소금(salt)은 숨기는 값이 아니다. 양쪽(기업정보함·사진첩)이 같은 지문을
     만들어야 하므로 코드에 그대로 적는다. 소금의 몫은 「우리 앱 전용으로
     미리 계산해 두기 어렵게」 하는 것이지 비밀이 아니다. */
(function (global) {
  'use strict';

  var SALT_TEXT = 'pureun-cards-lockkey-v1';
  var ITER = 10000;

  /* 실시간DB 열쇠에 못 쓰는 글자가 있다(. $ # [ ] /).
     base64 의 + / = 를 -  _ 로 바꾸고 = 는 뗀다 → 영문·숫자·-·_ 만 남는다. */
  function b64url(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    var raw = (typeof btoa === 'function')
      ? btoa(s)
      : Buffer.from(new Uint8Array(buf)).toString('base64');
    return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function subtle() {
    var c = global.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    return c && c.subtle ? c.subtle : null;
  }

  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* 무엇으로 같은 사람인지 가리나 — 기업정보함·사진첩이 쓰는 기준과 **같아야** 한다.
     기준이 어긋나면 한쪽은 있다 하고 한쪽은 없다 해서 중복이 그대로 쌓인다.
       명함        → 휴대폰 숫자
       사업자등록증 → 사업자번호 숫자
     열쇠가 없으면(휴대폰 없는 명함 등) 빈 값 — 지문을 만들지 않는다. */
  function keyOf(kind, fields) {
    var f = fields || {};
    if (kind === 'card') return digits(f.mobile);
    if (kind === 'biz' || kind === 'bizreg') return digits(f.bizno);
    return '';
  }

  /* 기업정보함 레코드에서 바로 뽑는다(kind 가 'card' / 'biz' 로 들어 있다) */
  function keyOfItem(it) {
    if (!it) return '';
    return keyOf(it.kind === 'biz' ? 'biz' : 'card', it);
  }

  /* 지문 만들기 — 열쇠가 없으면 null 을 돌려준다(빈 지문을 쓰면 서로 다른
     명함이 한 칸을 같이 쓰게 된다). */
  function fingerprint(key) {
    var k = digits(key);
    if (!k) return Promise.resolve(null);
    var sub = subtle();
    if (!sub) return Promise.reject(new Error('이 브라우저는 암호 기능을 쓸 수 없습니다'));
    var enc = new TextEncoder();
    return sub.importKey('raw', enc.encode(k), 'PBKDF2', false, ['deriveBits'])
      .then(function (ck) {
        return sub.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(SALT_TEXT), iterations: ITER, hash: 'SHA-256' },
          ck, 256);
      })
      .then(b64url);
  }

  function pathOf(fp) { return 'pucards/lockkeys/' + fp; }

  global.PuLockKey = {
    SALT_TEXT: SALT_TEXT,
    ITER: ITER,
    keyOf: keyOf,
    keyOfItem: keyOfItem,
    fingerprint: fingerprint,
    pathOf: pathOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
