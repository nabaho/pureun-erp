# 집단체불 계약서 전자송부(전자위임장) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 임금체불 집단사건에서 근로자가 카톡 링크로 접속해 휴대폰에서 인적사항 입력·손서명하면, E2E 암호화로 제출되고 노무사가 관리화면에서 취합·검토·서류(위임장 PDF/연명부·체불정리 XLSX/동의서 PDF)를 일괄 생성하는 모듈.

**Architecture:** 정적 HTML 2페이지(`sign.html` 근로자용 익명인증, `docs-esign.html` 관리자용 로그인) + 공용 JS 모듈 2개(`js/esign-crypto.js`, `js/esign-docs.js`) + Firebase RTDB `esign/` 노드. 개인정보는 브라우저에서 RSA-OAEP+AES-GCM 하이브리드 암호화 후 암호문만 저장(서버에 평문 없음). 사건 개인키는 노무사의 사건 비밀번호(PBKDF2 150k)로 보호.

**Tech Stack:** 바닐라 JS(전역 함수), Firebase compat SDK(auth+database), Web Crypto API, html2canvas 1.4.1 + jsPDF 2.5.1(PDF), SheetJS 0.18.5(XLSX), qrcodejs(QR), Tesseract.js 4(온디바이스 OCR). 모두 CDN.

**설계 문서:** `docs/superpowers/specs/2026-07-21-group-arrears-esign-design.md` (v2)

## Global Constraints

- 한국어 주석. 노무 도메인 용어: 직원→근로자, 급여→임금 (CLAUDE.md).
- push 전 반드시 `git pull --rebase origin main`.
- 실데이터(주민번호 등) 저장소 커밋 금지. 테스트는 가짜 데이터만 사용 (예: `홍길동 / 790101-1234567`).
- Firebase 설정은 각 페이지 인라인 (기존 컨벤션):
  `{ apiKey:'AIzaSyDkZz5QlKSoqMOYByp5YGeMNLNDrIghliA', databaseURL:'https://pureun-erp-default-rtdb.asia-southeast1.firebasedatabase.app', projectId:'pureun-erp', appId:'1:936817166182:web:9bd31f70d0afdf5fca2aa7', messagingSenderId:'936817166182' }`
- 근로자 개인정보 평문은 RTDB에 절대 저장하지 않는다 — 반드시 `EsignCrypto.encryptSubmission` 통과 후 저장.
- 신분증 사진은 어떤 외부 서버로도 전송 금지 (Tesseract 온디바이스만), 인식 후 즉시 폐기.
- 로컬 테스트 서버: 저장소 루트에서 `python -m http.server 8080` → `http://localhost:8080/...`
  (file:// 프로토콜에서는 Firebase 인증이 실패하므로 반드시 http로).
- Node 18+ 필요 (crypto 모듈 단위테스트 `node --test`). 없으면 https://nodejs.org LTS 설치.
- 작업 저장소: `C:\Users\fair0\pureunall` (main 브랜치, GitHub Pages 자동 배포 — 미완성 페이지는
  포털 타일 추가(마지막 태스크) 전까지 링크 노출되지 않음).

---

### Task 1: E2E 암호화 모듈 `js/esign-crypto.js` (+ Node 단위테스트)

**Files:**
- Create: `js/esign-crypto.js`
- Test: `tests/esign-crypto.test.js`

**Interfaces:**
- Consumes: 없음 (Web Crypto만 사용, 브라우저/Node 겸용)
- Produces (이후 모든 태스크가 사용):
  - `EsignCrypto.randomToken() → string` (hex 32자, 128bit)
  - `EsignCrypto.generateCaseKeys() → Promise<{pubKeyJwk, privKeyJwk}>`
  - `EsignCrypto.protectPrivKey(privKeyJwk, password) → Promise<{data, salt, iv}>` (모두 base64 문자열)
  - `EsignCrypto.unprotectPrivKey(protObj, password) → Promise<privKeyJwk>` (비번 오류 시 reject)
  - `EsignCrypto.encryptSubmission(obj, pubKeyJwk) → Promise<{enc, encKey, iv}>` (base64)
  - `EsignCrypto.decryptSubmission({enc,encKey,iv}, privKeyJwk) → Promise<obj>`
  - 브라우저: `window.EsignCrypto` / Node: `module.exports`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/esign-crypto.test.js`

```js
'use strict';
// 전자위임장 암호화 모듈 단위테스트 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const EC = require('../js/esign-crypto.js');

test('randomToken: 32자 hex, 매번 다름', () => {
  const a = EC.randomToken(), b = EC.randomToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(a, b);
});

test('제출 암호화 라운드트립: 원본과 복호화 결과 일치', async () => {
  const keys = await EC.generateCaseKeys();
  const data = { name: '홍길동', idNo: '790101-1234567', phone: '010-1234-5678', sigPng: 'data:image/png;base64,AAAA' };
  const sealed = await EC.encryptSubmission(data, keys.pubKeyJwk);
  assert.ok(sealed.enc && sealed.encKey && sealed.iv);
  // 암호문에 평문이 노출되지 않아야 함
  assert.ok(!JSON.stringify(sealed).includes('홍길동'));
  const opened = await EC.decryptSubmission(sealed, keys.privKeyJwk);
  assert.deepStrictEqual(opened, data);
});

test('개인키 비밀번호 보호 라운드트립', async () => {
  const keys = await EC.generateCaseKeys();
  const prot = await EC.protectPrivKey(keys.privKeyJwk, '사건비번1234');
  assert.ok(prot.data && prot.salt && prot.iv);
  const restored = await EC.unprotectPrivKey(prot, '사건비번1234');
  assert.deepStrictEqual(restored, keys.privKeyJwk);
});

test('개인키 비밀번호 오입력 시 실패', async () => {
  const keys = await EC.generateCaseKeys();
  const prot = await EC.protectPrivKey(keys.privKeyJwk, '올바른비번');
  await assert.rejects(EC.unprotectPrivKey(prot, '틀린비번'));
});

test('다른 사건 키로는 복호화 불가', async () => {
  const k1 = await EC.generateCaseKeys();
  const k2 = await EC.generateCaseKeys();
  const sealed = await EC.encryptSubmission({ name: '홍길동' }, k1.pubKeyJwk);
  await assert.rejects(EC.decryptSubmission(sealed, k2.privKeyJwk));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /c/Users/fair0/pureunall && node --test tests/`
Expected: FAIL — `Cannot find module '../js/esign-crypto.js'`

- [ ] **Step 3: 모듈 구현** — `js/esign-crypto.js`

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /c/Users/fair0/pureunall && node --test tests/`
Expected: `# pass 5` / `# fail 0`

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/fair0/pureunall
git add js/esign-crypto.js tests/esign-crypto.test.js
git commit -m "feat(문서관리): 전자위임장 E2E 암호화 모듈 + 단위테스트"
```

---

### Task 2: 데이터 유틸·양식 문구 모듈 `js/esign-docs.js` 1부 — 순수 함수 (+ 테스트)

**Files:**
- Create: `js/esign-docs.js`
- Test: `tests/esign-docs.test.js`
- 참고(읽기만): `C:\Users\fair0\pureunall\pu-erp.html:19946-19971` (`CASE_CHEDANG_FORMS`), `pu-erp.html:863-871` (`maskRRN`)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `EsignDocs.validateIdNo(v) → {ok:boolean, msg:string}` — 주민/외국인등록번호 13자리 형식 검증
  - `EsignDocs.fmtIdNo(v) → string` — 숫자만 추출해 `000000-0000000` 형식으로
  - `EsignDocs.maskIdNo(v) → string` — `790101-1******` 마스킹
  - `EsignDocs.ESIGN_FORMS` — `{ delegationAgreement, delegation, privacyConsent }` 각각 `{title, body}` (body는 `{{이름}}`, `{{주민등록번호}}`, `{{주소}}`, `{{회사명}}`, `{{작성일}}` 플레이스홀더 포함 문자열)
  - `EsignDocs.fillVars(text, map) → string` — `{{키}}` 치환
  - 브라우저: `window.EsignDocs` / Node: `module.exports` (DOM 필요 함수는 Task 8에서 추가, 브라우저 전용 가드)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/esign-docs.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ED = require('../js/esign-docs.js');

test('fmtIdNo: 숫자만 뽑아 하이픈 형식으로', () => {
  assert.strictEqual(ED.fmtIdNo('7901011234567'), '790101-1234567');
  assert.strictEqual(ED.fmtIdNo('790101 - 1234567'), '790101-1234567');
});

test('validateIdNo: 정상 형식 통과', () => {
  assert.strictEqual(ED.validateIdNo('790101-1234567').ok, true);   // 내국인
  assert.strictEqual(ED.validateIdNo('900215-5234567').ok, true);   // 외국인등록번호(5~8)
});

test('validateIdNo: 불량 형식 거부', () => {
  assert.strictEqual(ED.validateIdNo('79010-1234567').ok, false);    // 자릿수 부족
  assert.strictEqual(ED.validateIdNo('791301-1234567').ok, false);   // 13월
  assert.strictEqual(ED.validateIdNo('790132-1234567').ok, false);   // 32일
  assert.strictEqual(ED.validateIdNo('790101-0234567').ok, false);   // 성별코드 0
  assert.strictEqual(ED.validateIdNo('').ok, false);
});

test('maskIdNo: 뒤 6자리 마스킹', () => {
  assert.strictEqual(ED.maskIdNo('790101-1234567'), '790101-1******');
});

test('fillVars: 플레이스홀더 치환', () => {
  assert.strictEqual(ED.fillVars('성명: {{이름}} ({{주민등록번호}})', { '이름': '홍길동', '주민등록번호': '790101-1234567' }),
    '성명: 홍길동 (790101-1234567)');
});

test('ESIGN_FORMS: 3종 양식 존재, 플레이스홀더 포함', () => {
  ['delegationAgreement', 'delegation', 'privacyConsent'].forEach(function (k) {
    assert.ok(ED.ESIGN_FORMS[k] && ED.ESIGN_FORMS[k].title && ED.ESIGN_FORMS[k].body.length > 100, k);
  });
  assert.ok(ED.ESIGN_FORMS.delegation.body.includes('{{이름}}'));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/esign-docs.test.js`
Expected: FAIL — `Cannot find module '../js/esign-docs.js'`

- [ ] **Step 3: 기존 양식 문구 추출**

`pu-erp.html`에서 체당금 사건 양식 3종의 본문 텍스트를 읽는다:

```bash
sed -n '19946,19971p' /c/Users/fair0/pureunall/pu-erp.html
```

`CASE_CHEDANG_FORMS` 배열에서 다음 3개 양식의 `body`(본문 문자열)를 복사한다
(효성CMS 신청서는 이번 범위 제외):
- 위임약정서(임금체불) → `delegationAgreement`
- 위임장 → `delegation`
- 개인정보제공동의서 → `privacyConsent`

본문 안의 당사자 표기 자리(이름·주민번호·주소 등 수기 기입란)를 `{{이름}}`, `{{주민등록번호}}`,
`{{주소}}`, `{{회사명}}`, `{{작성일}}` 플레이스홀더로 바꾼다. 원문 조항 문구 자체는 수정하지 않는다
(법적 문구 — 노무사 검토 대상이므로 그대로).

- [ ] **Step 4: 모듈 구현** — `js/esign-docs.js` (1부: 순수 함수)

```js
'use strict';
// 푸른노무법인 — 전자위임장 서류/데이터 유틸 (브라우저 window.EsignDocs / Node 겸용)
// 1부: 순수 함수(검증·포맷·양식 문구) — Node 테스트 대상
// 2부: PDF/XLSX 생성(브라우저 전용) — Task 8에서 추가
(function (root) {

  // ── 주민/외국인등록번호 ──
  // 검증은 형식만 수행 — 2020.10 이후 발급분은 검증공식(체크섬)이 폐지되어
  // 체크섬 검사 시 정상 번호를 거부할 수 있음. 형식: 생년월일 6 + 성별코드(1-8) + 6자리.
  function fmtIdNo(v) {
    var d = String(v || '').replace(/[^0-9]/g, '');
    if (d.length !== 13) return String(v || '').trim();
    return d.slice(0, 6) + '-' + d.slice(6);
  }
  function validateIdNo(v) {
    var d = String(v || '').replace(/[^0-9]/g, '');
    if (d.length !== 13) return { ok: false, msg: '주민(외국인)등록번호 13자리를 입력해 주세요' };
    var mm = +d.slice(2, 4), dd = +d.slice(4, 6), g = +d[6];
    if (mm < 1 || mm > 12) return { ok: false, msg: '생년월일의 월이 올바르지 않습니다' };
    if (dd < 1 || dd > 31) return { ok: false, msg: '생년월일의 일이 올바르지 않습니다' };
    if (g < 1 || g > 8) return { ok: false, msg: '번호 형식이 올바르지 않습니다' };
    return { ok: true, msg: '' };
  }
  function maskIdNo(v) {
    var f = fmtIdNo(v);
    if (!/^\d{6}-\d{7}$/.test(f)) return f;
    return f.slice(0, 9) + '******';
  }

  // ── {{변수}} 치환 (pu-erp fillContractVars 패턴 준용) ──
  function fillVars(text, map) {
    var out = String(text || '');
    Object.keys(map || {}).forEach(function (k) {
      out = out.split('{{' + k + '}}').join(map[k] == null ? '' : String(map[k]));
    });
    return out;
  }

  // ── 양식 문구 (pu-erp.html CASE_CHEDANG_FORMS에서 이관 — 법적 문구 원문 유지) ──
  var ESIGN_FORMS = {
    delegationAgreement: {
      title: '위임약정서(임금체불)',
      body: '' // Step 3에서 추출한 원문 + 플레이스홀더 삽입본을 여기에 넣는다
    },
    delegation: {
      title: '위임장',
      body: '' // Step 3에서 추출한 원문
    },
    privacyConsent: {
      title: '개인정보 수집·이용·제공 동의서',
      body: '' // Step 3에서 추출한 원문
    }
  };

  var api = {
    fmtIdNo: fmtIdNo, validateIdNo: validateIdNo, maskIdNo: maskIdNo,
    fillVars: fillVars, ESIGN_FORMS: ESIGN_FORMS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EsignDocs = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

**주의:** `body: ''` 는 실제로 Step 3에서 추출한 문구로 채워 넣어야 한다. 빈 문자열로 커밋하면
테스트(`body.length > 100`)가 실패하므로 잊을 수 없다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test tests/`
Expected: 전체 PASS (esign-crypto 5 + esign-docs 6)

- [ ] **Step 6: 커밋**

```bash
git add js/esign-docs.js tests/esign-docs.test.js
git commit -m "feat(문서관리): 전자위임장 데이터 유틸·양식 문구 모듈(1부)"
```

---

### Task 3: RTDB 보안 규칙 — `esign` 노드 (콘솔 게시 + 문서화)

**Files:**
- Create: `docs/superpowers/specs/esign-rtdb-rules.md` (게시한 규칙의 기록 — 저장소에 rules 파일이 없는 기존 관례 보완)

**Interfaces:**
- Consumes: 없음
- Produces: RTDB 경로 계약 (이후 태스크가 이 경로·권한을 전제)
  - `esign/cases/{caseId}/meta` — 익명 read 가능(공개 표시 정보 + pubKey + linkToken), 쓰기는 직원만
  - `esign/cases/{caseId}/secret/encPrivKey` — 직원만 read/write
  - `esign/cases/{caseId}/submissions/{subId}` — 익명 **create만**(토큰 일치 + 크기 상한), 직원은 갱신·삭제 가능
  - `esign/cases/{caseId}/arrears` — 직원만
  - 직원 판별: 이메일/비밀번호 로그인 → `auth.token.email != null`, 익명 인증 → email 없음

- [ ] **Step 1: 규칙 문서 작성** — `docs/superpowers/specs/esign-rtdb-rules.md`

````markdown
# esign RTDB 보안 규칙 (Firebase 콘솔 게시본 기록)

게시 위치: Firebase 콘솔 → pureun-erp → Realtime Database → 규칙
**기존 규칙 JSON의 "rules" 아래에 "esign" 키를 추가**한다 (다른 노드 규칙은 절대 수정하지 않는다).

```json
"esign": {
  "cases": {
    "$caseId": {
      "meta": {
        ".read": "auth != null",
        ".write": "auth != null && auth.token.email != null"
      },
      "secret": {
        ".read": "auth != null && auth.token.email != null",
        ".write": "auth != null && auth.token.email != null"
      },
      "arrears": {
        ".read": "auth != null && auth.token.email != null",
        ".write": "auth != null && auth.token.email != null"
      },
      "submissions": {
        ".read": "auth != null && auth.token.email != null",
        "$subId": {
          ".write": "(auth != null && !data.exists() && newData.child('t').val() === root.child('esign/cases/' + $caseId + '/meta/linkToken').val() && root.child('esign/cases/' + $caseId + '/meta/status').val() === 'active') || (auth != null && auth.token.email != null)",
          ".validate": "newData.hasChildren(['enc','encKey','iv','t','submittedAt','reviewState']) || (auth != null && auth.token.email != null)",
          "enc": { ".validate": "newData.isString() && newData.val().length < 400000" },
          "encKey": { ".validate": "newData.isString() && newData.val().length < 1000" },
          "iv": { ".validate": "newData.isString() && newData.val().length < 100" }
        }
      }
    }
  }
}
```

설계 의도:
- 익명 인증 사용자는 사건 meta를 읽고(폼 표시·pubKey·linkToken), 제출을 **생성만** 할 수 있다.
  기존 제출을 읽거나(read 불가) 수정·삭제할 수 없다 → 근로자 간 개인정보 노출 원천 차단.
- 생성 시 `t`(링크 토큰)가 meta/linkToken과 일치해야 하고 사건이 active여야 한다 → 무작위 스팸 완화.
- `enc` 400KB 상한: 서명 PNG 포함 제출 데이터 크기 제한.
- 직원(이메일 계정)은 검토상태 갱신·삭제 가능.
- encPrivKey는 secret/ 하위 — 익명 사용자에게 노출되지 않음 (그 자체도 암호문이지만 심층 방어).
````

- [ ] **Step 2: Firebase 콘솔에 게시 (수동)**

1. https://console.firebase.google.com → `pureun-erp` → Realtime Database → 규칙 탭
2. 기존 JSON의 `"rules": {` 바로 아래에 위 `"esign": {...}` 블록 추가 (기존 노드 유지)
3. [게시] 클릭

- [ ] **Step 3: 규칙 동작 검증 (수동, 콘솔 시뮬레이터)**

규칙 탭 옆 [시뮬레이터]에서:
- 유형 read, 위치 `/esign/cases/test1/submissions`, 인증됨(익명) → **거부** 확인
- 유형 read, 위치 `/esign/cases/test1/meta`, 인증됨(익명) → **허용** 확인
- 유형 write, 위치 `/esign/cases/test1/secret/encPrivKey`, 인증됨(익명) → **거부** 확인

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/esign-rtdb-rules.md
git commit -m "docs(문서관리): esign RTDB 보안 규칙 게시 기록"
```

---

### Task 4: 근로자 페이지 `sign.html` 골격 — 익명 인증·사건 로드·인적사항 폼

**Files:**
- Create: `sign.html`
- 참고(읽기만): `ieum-view.html` 전체 (~300줄, 무인증 공개 페이지 모범 패턴)

**Interfaces:**
- Consumes: `esign/cases/{caseId}/meta` (RTDB read), `EsignDocs.validateIdNo/fmtIdNo`
- Produces:
  - 전역 `caseId`, `linkToken`, `caseMeta` (이후 Task 5·6이 사용)
  - `collectForm() → {ok, data?, msg?}` — 폼 값 수집·검증. data 필드: `{name, idNo, phone, addr, bank, joinDate, leaveDate}`
  - `showStep(n)` — 1:안내 → 2:입력 → 3:서명 → 4:완료 화면 전환
  - `<div id="sigWrap">` (Task 5가 canvas 삽입), `<button id="btnSubmit">` (Task 6이 핸들러 연결)

- [ ] **Step 1: sign.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#1e40af">
<title>전자위임장 제출 — 푸른노무법인</title>
<!-- 모바일 우선 근로자 제출 페이지: 카톡/문자 링크(sign.html?case=..&t=..)로 접속, 익명 인증 -->
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#f1f5f9;color:#1e293b;font-size:15px;line-height:1.6}
  .wrap{max-width:480px;margin:0 auto;min-height:100vh;background:#fff;padding:20px 18px 40px}
  .head{padding:14px 0 18px;border-bottom:2px solid #1e40af;margin-bottom:18px}
  .head h1{font-size:18px;color:#1e40af}
  .head .sub{font-size:12.5px;color:#64748b;margin-top:4px}
  .step{display:none}.step.on{display:block}
  label{display:block;font-size:13px;font-weight:700;color:#334155;margin:14px 0 5px}
  label .req{color:#dc2626}
  input[type=text],input[type=tel],input[type=date]{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px}
  input:focus{outline:none;border-color:#1e40af}
  .hint{font-size:11.5px;color:#94a3b8;margin-top:3px}
  .err{color:#dc2626;font-size:12.5px;margin-top:4px;display:none}
  .btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;margin-top:22px}
  .btn-pri{background:#1e40af;color:#fff}
  .btn-sub{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;margin-top:10px}
  .notice{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;font-size:13px;color:#1e3a8a;margin:14px 0}
  .consent{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin:12px 0;font-size:13px}
  .consent .full{max-height:120px;overflow-y:auto;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px;margin:8px 0;font-size:11.5px;color:#475569;white-space:pre-wrap}
  .consent label{display:flex;align-items:center;gap:8px;font-size:13.5px;margin:6px 0 0}
  .consent input[type=checkbox]{width:20px;height:20px}
  .done{text-align:center;padding:40px 0}
  .done .ic{font-size:52px}.done h2{font-size:19px;margin:14px 0 8px}
  .fatal{text-align:center;padding:60px 20px;color:#64748b}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>푸른노무법인 전자위임장</h1>
    <div class="sub" id="caseTitle">사건 정보를 불러오는 중…</div>
  </div>

  <!-- 1단계: 안내 -->
  <div class="step on" id="step1">
    <div class="notice" id="introText">잠시만 기다려 주세요…</div>
    <button class="btn btn-pri" id="btnStart" disabled>제출 시작하기</button>
  </div>

  <!-- 2단계: 인적사항 -->
  <div class="step" id="step2">
    <label>성명 <span class="req">*</span></label>
    <input type="text" id="fName" autocomplete="name">
    <label>주민등록번호(외국인등록번호) <span class="req">*</span></label>
    <input type="tel" id="fIdNo" placeholder="000000-0000000" maxlength="14">
    <div class="err" id="errIdNo"></div>
    <div class="hint">위임장·진정서 작성에만 사용되며 암호화되어 전송됩니다</div>
    <label>휴대전화 <span class="req">*</span></label>
    <input type="tel" id="fPhone" placeholder="010-0000-0000" autocomplete="tel">
    <label>주소 <span class="req">*</span></label>
    <input type="text" id="fAddr" autocomplete="street-address">
    <label>입금 은행/계좌번호 <span class="req">*</span></label>
    <input type="text" id="fBank" placeholder="예: 우리 1002-000-000000">
    <label>입사일</label>
    <input type="date" id="fJoin">
    <label>퇴사일 (재직 중이면 비워두세요)</label>
    <input type="date" id="fLeave">
    <div class="consent">
      <b>개인정보 수집·이용 동의</b>
      <div class="full" id="privacyFull"></div>
      <label><input type="checkbox" id="ckPrivacy"> 위 내용에 동의합니다 <span class="req">*</span></label>
    </div>
    <div class="consent">
      <b>위임 내용 확인</b>
      <div class="full" id="delegFull"></div>
      <label><input type="checkbox" id="ckDeleg"> 위임 내용을 확인하고 동의합니다 <span class="req">*</span></label>
    </div>
    <div class="err" id="errForm"></div>
    <button class="btn btn-pri" id="btnToSign">다음 — 서명하기</button>
  </div>

  <!-- 3단계: 서명 (canvas는 Task 5에서 삽입) -->
  <div class="step" id="step3">
    <div class="notice">아래 칸에 손가락으로 서명해 주세요.</div>
    <div id="sigWrap"></div>
    <button class="btn btn-pri" id="btnSubmit">제출하기</button>
    <button class="btn btn-sub" id="btnBack">← 이전으로</button>
  </div>

  <!-- 4단계: 완료 -->
  <div class="step" id="step4">
    <div class="done">
      <div class="ic">✅</div>
      <h2>제출이 완료되었습니다</h2>
      <p style="font-size:13.5px;color:#64748b">푸른노무법인이 내용을 확인한 뒤<br>진행 상황을 안내드립니다.</p>
    </div>
  </div>

  <!-- 오류 화면 -->
  <div class="step" id="stepErr"><div class="fatal" id="fatalMsg"></div></div>
</div>

<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
<script src="js/esign-crypto.js"></script>
<script src="js/esign-docs.js"></script>
<script>
'use strict';
// ── Firebase (ERP와 동일 프로젝트, 익명 인증 — ieum-view.html 패턴) ──
var FB_CONFIG = {
  apiKey: 'AIzaSyDkZz5QlKSoqMOYByp5YGeMNLNDrIghliA',
  databaseURL: 'https://pureun-erp-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'pureun-erp',
  appId: '1:936817166182:web:9bd31f70d0afdf5fca2aa7',
  messagingSenderId: '936817166182'
};
firebase.initializeApp(FB_CONFIG);
var db = firebase.database();

var $ = function (id) { return document.getElementById(id); };
var qsp = new URLSearchParams(location.search);
var caseId = qsp.get('case') || '';
var linkToken = qsp.get('t') || '';
var caseMeta = null;

function showStep(n) {
  ['step1', 'step2', 'step3', 'step4', 'stepErr'].forEach(function (s) {
    var el = $(s); if (el) el.classList.remove('on');
  });
  $(n === 'err' ? 'stepErr' : 'step' + n).classList.add('on');
  window.scrollTo(0, 0);
}
function fatal(msg) { $('fatalMsg').textContent = msg; showStep('err'); }

// ── 사건 정보 로드 ──
if (!caseId || !linkToken) {
  fatal('잘못된 접속 주소입니다. 안내받은 링크로 다시 접속해 주세요.');
} else {
  firebase.auth().signInAnonymously().then(function () {
    return db.ref('esign/cases/' + caseId + '/meta').once('value');
  }).then(function (snap) {
    var m = snap.val();
    if (!m || m.linkToken !== linkToken) { fatal('유효하지 않은 링크입니다. 담당 노무사에게 문의해 주세요.'); return; }
    if (m.status !== 'active') { fatal('접수가 마감된 사건입니다. 담당 노무사에게 문의해 주세요.'); return; }
    caseMeta = m;
    $('caseTitle').textContent = m.title;
    $('introText').innerHTML = '<b>' + m.company + '</b> 임금체불 사건의 진정·대지급금 절차 진행을 위해 '
      + '푸른노무법인에 업무를 위임하는 전자위임장입니다.<br><br>'
      + '성명·주민등록번호 등 인적사항을 입력하고 화면에 서명하시면 제출이 완료됩니다. '
      + '입력하신 정보는 <b>암호화되어</b> 담당 노무사만 열람할 수 있습니다.';
    $('privacyFull').textContent = EsignDocs.ESIGN_FORMS.privacyConsent.body;
    $('delegFull').textContent = EsignDocs.ESIGN_FORMS.delegationAgreement.body;
    $('btnStart').disabled = false;
  }).catch(function (e) {
    fatal('사건 정보를 불러올 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
  });
}

// ── 주민번호 입력 시 자동 하이픈 ──
$('fIdNo').addEventListener('input', function () {
  var d = this.value.replace(/[^0-9]/g, '').slice(0, 13);
  this.value = d.length > 6 ? d.slice(0, 6) + '-' + d.slice(6) : d;
});

// ── 폼 수집·검증 ──
function collectForm() {
  var name = $('fName').value.trim();
  var idNo = EsignDocs.fmtIdNo($('fIdNo').value);
  var phone = $('fPhone').value.trim();
  var addr = $('fAddr').value.trim();
  var bank = $('fBank').value.trim();
  if (!name) return { ok: false, msg: '성명을 입력해 주세요' };
  var vr = EsignDocs.validateIdNo(idNo);
  if (!vr.ok) return { ok: false, msg: vr.msg };
  if (!/^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/.test(phone)) return { ok: false, msg: '휴대전화 번호를 확인해 주세요' };
  if (!addr) return { ok: false, msg: '주소를 입력해 주세요' };
  if (!bank) return { ok: false, msg: '입금 은행/계좌번호를 입력해 주세요' };
  if (!$('ckPrivacy').checked) return { ok: false, msg: '개인정보 수집·이용에 동의해 주세요' };
  if (!$('ckDeleg').checked) return { ok: false, msg: '위임 내용에 동의해 주세요' };
  return { ok: true, data: { name: name, idNo: idNo, phone: phone, addr: addr, bank: bank,
    joinDate: $('fJoin').value || '', leaveDate: $('fLeave').value || '' } };
}

// ── 화면 전환 ──
$('btnStart').onclick = function () { showStep(2); };
$('btnToSign').onclick = function () {
  var r = collectForm();
  var err = $('errForm');
  if (!r.ok) { err.textContent = '⚠ ' + r.msg; err.style.display = 'block'; return; }
  err.style.display = 'none';
  showStep(3);
};
$('btnBack').onclick = function () { showStep(2); };
// btnSubmit 핸들러는 Task 6에서 연결
</script>
</body>
</html>
```

- [ ] **Step 2: 수동 검증 — 오류 경로**

```bash
cd /c/Users/fair0/pureunall && python -m http.server 8080
```

브라우저(개발자도구 모바일 모드)에서:
1. `http://localhost:8080/sign.html` → "잘못된 접속 주소입니다" 표시 확인
2. `http://localhost:8080/sign.html?case=nocase&t=xx` → "유효하지 않은 링크입니다" 표시 확인
   (사건이 아직 없으므로 meta가 null → 이 메시지가 정상)
3. 콘솔에 인증 오류가 없는지 확인. **만약 `auth/admin-restricted-operation` 오류가 나오면**:
   Firebase 콘솔 → Authentication → Sign-in method → **익명 로그인 사용 설정**을 켠다.

- [ ] **Step 3: 커밋**

```bash
git add sign.html
git commit -m "feat(문서관리): 근로자 전자위임장 페이지 골격 — 익명 인증·사건 로드·인적사항 폼"
```

---

### Task 5: `sign.html` 손서명 canvas

**Files:**
- Modify: `sign.html` (`// btnSubmit 핸들러는 Task 6에서 연결` 주석 위에 코드 추가, `#sigWrap`에 UI 삽입)

**Interfaces:**
- Consumes: `#sigWrap` div (Task 4)
- Produces:
  - `sigPad.isEmpty() → boolean` — 획이 없으면 true
  - `sigPad.toDataURL() → string` — 서명 PNG data URL (Task 6이 제출 데이터에 포함)
  - `sigPad.clear()`

- [ ] **Step 1: 서명 canvas 구현** — `sign.html`의 `// btnSubmit 핸들러는 Task 6에서 연결` 주석 바로 위에 추가

```js
// ── 손서명 canvas (터치·마우스 겸용, devicePixelRatio 대응) ──
var sigPad = (function () {
  var wrap = $('sigWrap');
  wrap.innerHTML = '<canvas id="sigCanvas" style="width:100%;height:200px;border:2px dashed #94a3b8;'
    + 'border-radius:10px;background:#fff;touch-action:none;display:block"></canvas>'
    + '<button type="button" id="sigClear" style="margin-top:8px;padding:8px 16px;border:1px solid #cbd5e1;'
    + 'border-radius:8px;background:#f8fafc;font-size:13px;cursor:pointer">지우고 다시 서명</button>';
  var cv = $('sigCanvas');
  var ctx = null, drawing = false, strokes = 0;

  function resize() {
    var r = cv.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e293b';
    strokes = 0; // 리사이즈되면 내용이 지워지므로 초기화
  }
  resize();
  window.addEventListener('resize', resize);

  function pos(e) {
    var r = cv.getBoundingClientRect();
    var p = (e.touches && e.touches[0]) || e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function start(e) { e.preventDefault(); drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { if (!drawing) return; e.preventDefault(); var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); strokes++; }
  function end() { drawing = false; }

  cv.addEventListener('touchstart', start, { passive: false });
  cv.addEventListener('touchmove', move, { passive: false });
  cv.addEventListener('touchend', end);
  cv.addEventListener('mousedown', start);
  cv.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  $('sigClear').onclick = function () { ctx.clearRect(0, 0, cv.width, cv.height); strokes = 0; };

  return {
    isEmpty: function () { return strokes < 5; }, // 점 하나 찍은 수준은 서명으로 인정하지 않음
    toDataURL: function () { return cv.toDataURL('image/png'); },
    clear: function () { $('sigClear').onclick(); }
  };
})();
```

- [ ] **Step 2: 수동 검증**

`http://localhost:8080/sign.html?case=nocase&t=xx`로는 오류 화면이라 3단계에 못 가므로,
임시로 개발자도구 콘솔에서 `showStep(3)` 실행 →
1. 마우스 드래그로 선이 그려지는지
2. 모바일 모드(터치 에뮬레이션)에서도 그려지는지, 화면이 스크롤되지 않는지(touch-action:none)
3. [지우고 다시 서명] 동작
4. 콘솔에서 `sigPad.isEmpty()` — 지운 직후 `true`, 서명 후 `false` 확인

- [ ] **Step 3: 커밋**

```bash
git add sign.html
git commit -m "feat(문서관리): 손서명 canvas — 터치·마우스, 빈 서명 감지"
```

---

### Task 6: `sign.html` 암호화 제출·완료 화면·재제출 안내

**Files:**
- Modify: `sign.html` (Task 5 코드 아래에 제출 핸들러 추가)

**Interfaces:**
- Consumes: `collectForm()`, `sigPad`, `caseMeta.pubKey`, `EsignCrypto.encryptSubmission`
- Produces: RTDB `esign/cases/{caseId}/submissions/{pushId}` = `{enc, encKey, iv, t, submittedAt, reviewState:'pending'}`
  (복호화하면 `{name, idNo, phone, addr, bank, joinDate, leaveDate, consentAt, sigPng}`)

- [ ] **Step 1: 제출 핸들러 구현** — Task 5 코드 아래에 추가

```js
// ── 암호화 제출 ──
var submitting = false;
$('btnSubmit').onclick = async function () {
  if (submitting) return;
  if (sigPad.isEmpty()) { alert('서명을 해주세요.'); return; }
  var r = collectForm();
  if (!r.ok) { alert(r.msg); showStep(2); return; }

  // 같은 기기 재제출 1차 방어 (서버는 암호문이라 중복을 알 수 없음 — 관리화면에서 2차 감지)
  try {
    if (localStorage.getItem('esign_done_' + caseId) === '1'
      && !confirm('이 기기에서 이미 제출한 기록이 있습니다. 다시 제출할까요?')) return;
  } catch (e) {}

  submitting = true;
  this.textContent = '암호화 전송 중…'; this.disabled = true;
  var btn = this;
  try {
    var data = r.data;
    data.consentAt = new Date().toISOString(); // 동의 일시 (동의서 기재용)
    data.sigPng = sigPad.toDataURL();
    var sealed = await EsignCrypto.encryptSubmission(data, caseMeta.pubKey);
    await db.ref('esign/cases/' + caseId + '/submissions').push({
      enc: sealed.enc, encKey: sealed.encKey, iv: sealed.iv,
      t: linkToken,
      submittedAt: firebase.database.ServerValue.TIMESTAMP,
      reviewState: 'pending'
    });
    try { localStorage.setItem('esign_done_' + caseId, '1'); } catch (e) {}
    showStep(4);
  } catch (e) {
    alert('전송에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.\n(' + (e && e.message || e) + ')');
    btn.textContent = '제출하기'; btn.disabled = false;
  }
  submitting = false;
};
```

- [ ] **Step 2: 통합 검증 준비 — 콘솔에서 테스트 사건 생성**

관리 페이지가 아직 없으므로, 브라우저 콘솔로 테스트 사건을 만든다.
`http://localhost:8080/sign.html` 아무 화면에서 개발자도구 콘솔 실행
(직원 계정 로그인이 필요하므로 **이 쓰기는 임시로 Firebase 콘솔 데이터 탭에서 직접 입력해도 된다**):

```js
// 순서: 키 생성 → meta 값 복사 → Firebase 콘솔 데이터 탭에 esign/cases/test1/meta 로 붙여넣기
var keys = await EsignCrypto.generateCaseKeys();
var prot = await EsignCrypto.protectPrivKey(keys.privKeyJwk, '테스트비번');
console.log(JSON.stringify({
  title: '테스트산업 임금체불(테스트)', company: '테스트산업(주)', respondent: '대표 아무개',
  ownerSid: 'test', pubKey: keys.pubKeyJwk, linkToken: 'testtoken123', createdAt: Date.now(), status: 'active'
}));
console.log('secret/encPrivKey →', JSON.stringify(prot));
console.log('privKeyJwk(로컬 보관, 검증용) →', JSON.stringify(keys.privKeyJwk));
```

Firebase 콘솔 → Realtime Database → 데이터 탭 → `esign/cases/test1/meta`에 첫 JSON,
`esign/cases/test1/secret/encPrivKey`에 둘째 JSON을 입력. `privKeyJwk`는 Step 3 검증용으로 메모장에 보관.

- [ ] **Step 3: 종단 검증 — 제출 & 복호화 라운드트립**

1. `http://localhost:8080/sign.html?case=test1&t=testtoken123` 접속 → 사건명 표시 확인
2. 가짜 데이터 입력(홍길동/790101-1234567/010-1111-2222/서울시…/우리 1002-…), 동의 체크, 서명, 제출
3. "제출이 완료되었습니다" 확인. Firebase 콘솔 데이터 탭에서 `submissions/{pushId}`에
   `enc/encKey/iv`만 있고 **평문(홍길동 등)이 어디에도 없는지** 확인
4. 콘솔에서 복호화 검증:
```js
var sub = /* Firebase 콘솔에서 복사한 {enc, encKey, iv} */;
var priv = /* Step 2에서 보관한 privKeyJwk */;
console.log(await EsignCrypto.decryptSubmission(sub, priv)); // → 입력했던 원본과 일치해야 함
```
5. 같은 페이지에서 다시 제출 시도 → "이미 제출한 기록" 확인창 확인
6. 잘못된 토큰 `?case=test1&t=wrong` → 유효하지 않은 링크 화면 확인

- [ ] **Step 4: 커밋**

```bash
git add sign.html
git commit -m "feat(문서관리): 암호화 제출·완료 화면·재제출 안내 — E2E 라운드트립 검증 완료"
```

---

### Task 7: `sign.html` 신분증 촬영 자동입력 (온디바이스 OCR, 사진 즉시 폐기)

**Files:**
- Modify: `sign.html` (2단계 폼 상단에 버튼 UI + OCR 로직)

**Interfaces:**
- Consumes: `#fName`, `#fIdNo`, `#fAddr` 입력 필드
- Produces: 없음 (폼 필드 채우기만; 사진·인식 결과는 저장하지 않음)

- [ ] **Step 1: UI 추가** — `sign.html` 2단계(`step2`) 첫 `<label>` 위에 삽입

```html
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:6px">
      <button type="button" id="btnOcr" style="width:100%;padding:11px;border:1px solid #d97706;border-radius:8px;
        background:#fff;color:#b45309;font-size:14px;font-weight:700;cursor:pointer">📷 신분증 촬영으로 자동 입력 (선택)</button>
      <div style="font-size:11.5px;color:#92400e;margin-top:6px">
        인식은 휴대폰 안에서만 처리되며 <b>사진은 저장·전송되지 않습니다.</b> 인식 결과를 꼭 확인·수정해 주세요.</div>
      <input type="file" id="ocrFile" accept="image/*" capture="environment" style="display:none">
      <div id="ocrStatus" style="display:none;font-size:12.5px;color:#b45309;margin-top:6px"></div>
    </div>
```

- [ ] **Step 2: OCR 로직 추가** — `sign.html` 스크립트의 제출 핸들러 아래에 추가

```js
// ── 신분증 촬영 자동입력 (온디바이스 Tesseract — 외부 서버 전송 없음, 사진 즉시 폐기) ──
var tessLoading = null;
function loadTesseract() { // 지연 로드 (~10MB 한글 데이터, 첫 사용 시)
  if (window.Tesseract) return Promise.resolve();
  if (tessLoading) return tessLoading;
  tessLoading = new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.4/dist/tesseract.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return tessLoading;
}
$('btnOcr').onclick = function () { $('ocrFile').click(); };
$('ocrFile').addEventListener('change', async function () {
  var file = this.files && this.files[0];
  this.value = ''; // input 초기화 (같은 파일 재선택 가능 + 참조 제거)
  if (!file) return;
  var st = $('ocrStatus');
  st.style.display = 'block';
  st.textContent = '인식 준비 중… (첫 사용 시 10초 정도 걸립니다)';
  var cv = null;
  try {
    await loadTesseract();
    // 다운스케일(최대 1600px) — 속도·메모리 절약
    var img = await createImageBitmap(file);
    var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    cv = document.createElement('canvas');
    cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    img.close();
    st.textContent = '신분증을 읽는 중…';
    var out = await Tesseract.recognize(cv, 'kor', {
      logger: function (m) { if (m.status === 'recognizing text') st.textContent = '신분증을 읽는 중… ' + Math.round(m.progress * 100) + '%'; }
    });
    var text = (out && out.data && out.data.text) || '';
    // 주민번호: 6-7 숫자 패턴
    var mId = text.match(/(\d{6})\s*[-–—]?\s*(\d{7})/);
    if (mId) { $('fIdNo').value = mId[1] + '-' + mId[2]; }
    // 이름: 주민번호 앞줄에서 한글 2~5자 (주민등록증 레이아웃: 이름이 번호 위)
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      if (mId && lines[i].includes(mId[1])) {
        for (var j = i - 1; j >= 0; j--) {
          var mName = lines[j].match(/[가-힣]{2,5}/);
          if (mName && !/주민등록증|운전면허|경기|서울|도지사|청장/.test(lines[j])) { $('fName').value = $('fName').value || mName[0]; break; }
        }
        // 주소: 번호 다음 줄들 중 '시|도|군|구' 포함 첫 줄
        for (var k = i + 1; k < lines.length; k++) {
          if (/[가-힣]+(시|도)\s|[가-힣]+(구|군|시)\s/.test(lines[k] + ' ')) { $('fAddr').value = $('fAddr').value || lines[k]; break; }
        }
        break;
      }
    }
    st.textContent = mId ? '✅ 인식 완료 — 내용을 확인하고 틀린 부분은 고쳐 주세요'
      : '인식하지 못했습니다. 직접 입력해 주세요.';
  } catch (e) {
    st.textContent = '인식에 실패했습니다. 직접 입력해 주세요.';
  } finally {
    // 사진 즉시 폐기 — 어디에도 저장·전송하지 않음
    if (cv) { cv.width = 1; cv.height = 1; cv = null; }
    file = null;
  }
});
```

- [ ] **Step 3: 수동 검증**

1. `http://localhost:8080/sign.html?case=test1&t=testtoken123` → 2단계 진입
2. 데스크톱: [📷] 버튼 → 파일 선택 대화상자 열림 확인. **테스트용 가짜 신분증 이미지**
   (메모장에 "홍길동 / 790101-1234567 / 서울특별시 강남구 …"를 크게 써서 캡처한 PNG)로 인식 →
   주민번호 필드 자동 입력 확인
3. 개발자도구 Network 탭: tesseract CDN(스크립트·언어데이터) 외에 **이미지 업로드 요청이 전혀 없는지** 확인
4. 인식 후 제출까지 진행해 정상 동작 확인

- [ ] **Step 4: 커밋**

```bash
git add sign.html
git commit -m "feat(문서관리): 신분증 촬영 자동입력 — 온디바이스 OCR, 사진 즉시 폐기"
```

---

### Task 8: `js/esign-docs.js` 2부 — PDF·XLSX 생성 (브라우저 전용)

**Files:**
- Modify: `js/esign-docs.js` (api 정의 위에 브라우저 전용 블록 추가)
- 참고(읽기만): `pu-erp.html:49897-49992` (`buildPayslipPdfBase64` — html2canvas→jsPDF 패턴)

**Interfaces:**
- Consumes: `ESIGN_FORMS`, `fillVars`, 전역 `html2canvas`·`jspdf`·`XLSX` (호출 페이지가 CDN 로드)
- Produces (docs-esign.html·sign.html 완료 화면이 사용):
  - `EsignDocs.buildDelegationHtml(person, caseMeta) → string` — 위임약정서+위임장 1인분 HTML (서명 이미지 포함)
  - `EsignDocs.buildConsentHtml(person, caseMeta) → string` — 개인정보동의서 1인분 HTML
  - `EsignDocs.htmlPagesToPdf(htmlArray, fileName) → Promise<void>` — HTML 배열을 1페이지씩 렌더해 단일 PDF 다운로드
  - `EsignDocs.downloadRosterXlsx(persons, caseMeta)` — 진정인 연명부 XLSX
  - `EsignDocs.downloadArrearsXlsx(persons, arrearsMap, caseMeta)` — 체불/체당금 정리 XLSX
  - `person` = 복호화된 제출 데이터 `{name, idNo, phone, addr, bank, joinDate, leaveDate, consentAt, sigPng}`, XLSX 함수는 `person._subId` 사용

- [ ] **Step 1: 구현** — `js/esign-docs.js`의 `var api = {...}` 바로 위에 추가, api에 키 5개 추가

```js
  // ══════════ 2부: 서류 생성 (브라우저 전용 — html2canvas/jsPDF/XLSX는 호출 페이지가 CDN 로드) ══════════
  var IS_BROWSER = (typeof document !== 'undefined');

  // A4 1페이지 서식 공통 래퍼 (맑은 고딕 렌더 → 래스터화라 폰트 임베드 불필요)
  function pageWrap(inner) {
    return '<div style="width:794px;min-height:1123px;padding:70px 60px;background:#fff;' +
      "font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:14px;line-height:1.9;color:#111;box-sizing:border-box\">" +
      inner + '</div>';
  }
  function personVars(person, caseMeta) {
    return {
      '이름': person.name, '주민등록번호': person.idNo, '주소': person.addr,
      '회사명': (caseMeta && caseMeta.company) || '', '작성일': (person.consentAt || '').slice(0, 10)
    };
  }
  function sigBlock(person) {
    return '<div style="margin-top:40px;text-align:right">' +
      '<span style="font-size:14px">위임인: ' + person.name + ' </span>' +
      '<img src="' + person.sigPng + '" style="height:60px;vertical-align:middle;border-bottom:1px solid #999">' +
      '<span style="font-size:12px;color:#555"> (서명)</span></div>';
  }

  // 위임약정서 + 위임장 (1인분, 1페이지)
  function buildDelegationHtml(person, caseMeta) {
    var v = personVars(person, caseMeta);
    return pageWrap(
      '<h2 style="text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:24px">위 임 장</h2>' +
      '<div style="white-space:pre-wrap">' + fillVars(ESIGN_FORMS.delegation.body, v) + '</div>' +
      '<hr style="margin:26px 0;border:none;border-top:1px dashed #999">' +
      '<h3 style="text-align:center;font-size:16px;margin-bottom:14px">' + ESIGN_FORMS.delegationAgreement.title + '</h3>' +
      '<div style="white-space:pre-wrap;font-size:12.5px;line-height:1.7">' + fillVars(ESIGN_FORMS.delegationAgreement.body, v) + '</div>' +
      sigBlock(person) +
      '<div style="margin-top:16px;font-size:12px;color:#555">작성일: ' + v['작성일'] + ' · 전자제출(푸른노무법인 전자위임 시스템)</div>'
    );
  }

  // 개인정보 수집·이용·제공 동의서 (1인분)
  function buildConsentHtml(person, caseMeta) {
    var v = personVars(person, caseMeta);
    return pageWrap(
      '<h2 style="text-align:center;font-size:20px;margin-bottom:24px">' + ESIGN_FORMS.privacyConsent.title + '</h2>' +
      '<div style="white-space:pre-wrap">' + fillVars(ESIGN_FORMS.privacyConsent.body, v) + '</div>' +
      '<div style="margin-top:24px">동의 일시: ' + String(person.consentAt || '').replace('T', ' ').slice(0, 16) + ' (전자 동의)</div>' +
      sigBlock(person)
    );
  }

  // HTML 배열 → 각 1페이지 PDF (pu-erp buildPayslipPdfBase64 패턴: 화면 밖 렌더 → html2canvas → jsPDF)
  async function htmlPagesToPdf(htmlArray, fileName) {
    if (!IS_BROWSER) throw new Error('브라우저 전용');
    var pdf = new jspdf.jsPDF({ unit: 'pt', format: 'a4' }); // 595 x 842pt
    for (var i = 0; i < htmlArray.length; i++) {
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
      host.innerHTML = htmlArray[i];
      document.body.appendChild(host);
      var canvas = await html2canvas(host.firstChild, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
      host.remove();
      var imgH = 842, imgW = Math.min(595, canvas.width / canvas.height * 842);
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', (595 - imgW) / 2, 0, imgW, imgH);
    }
    pdf.save(fileName);
  }

  // 진정인 연명부 XLSX
  function downloadRosterXlsx(persons, caseMeta) {
    var rows = persons.map(function (p, i) {
      return { '순번': i + 1, '성명': p.name, '주민등록번호': p.idNo, '연락처': p.phone,
        '주소': p.addr, '입사일': p.joinDate || '', '퇴사일': p.leaveDate || '', '입금계좌': p.bank };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:5},{wch:10},{wch:16},{wch:15},{wch:40},{wch:11},{wch:11},{wch:24}];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '진정인 연명부');
    XLSX.writeFile(wb, ((caseMeta && caseMeta.title) || '사건') + '_진정인연명부.xlsx');
  }

  // 체불/체당금 정리 XLSX — 기존 소액체당금 정리 엑셀 열 구조(개인정보 + 월별 체불 + 퇴직금 + 합계)
  function downloadArrearsXlsx(persons, arrearsMap, caseMeta) {
    var rows = persons.map(function (p, i) {
      var a = (arrearsMap && arrearsMap[p._subId]) || {};
      var m1 = +a.month1 || 0, m2 = +a.month2 || 0, m3 = +a.month3 || 0, sev = +a.severance || 0;
      return { '순번': i + 1, '성명': p.name, '주민등록번호': p.idNo, '연락처': p.phone, '주소': p.addr,
        '입사일': p.joinDate || '', '퇴사일': p.leaveDate || '', '입금계좌': p.bank,
        '체불임금(1개월차)': m1, '체불임금(2개월차)': m2, '체불임금(3개월차)': m3,
        '체불퇴직금': sev, '체불총액': m1 + m2 + m3 + sev };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '체불임금정리');
    XLSX.writeFile(wb, ((caseMeta && caseMeta.title) || '사건') + '_체불임금정리.xlsx');
  }
```

api 객체를 다음으로 교체:

```js
  var api = {
    fmtIdNo: fmtIdNo, validateIdNo: validateIdNo, maskIdNo: maskIdNo,
    fillVars: fillVars, ESIGN_FORMS: ESIGN_FORMS,
    buildDelegationHtml: buildDelegationHtml, buildConsentHtml: buildConsentHtml,
    htmlPagesToPdf: htmlPagesToPdf, downloadRosterXlsx: downloadRosterXlsx, downloadArrearsXlsx: downloadArrearsXlsx
  };
```

- [ ] **Step 2: Node 테스트 여전히 통과 확인** (브라우저 전용 코드가 Node 로드를 깨지 않는지)

Run: `node --test tests/`
Expected: 전체 PASS (모듈 로드 시점에 document 접근이 없어야 함 — IS_BROWSER 가드 확인)

- [ ] **Step 3: 커밋**

```bash
git add js/esign-docs.js
git commit -m "feat(문서관리): 서류 생성 2부 — 위임장/동의서 PDF·연명부/체불정리 XLSX"
```

---

### Task 9: 관리자 페이지 `docs-esign.html` 골격 — 로그인 가드·사건 목록·사건 생성(키·QR·공유)

**Files:**
- Create: `docs-esign.html`
- 참고(읽기만): `enter.html:380-460` (로그인·Firebase 패턴), `js/utils.js` (showToast, customConfirm, copyToClipboard, localYMD)

**Interfaces:**
- Consumes: `EsignCrypto.generateCaseKeys/protectPrivKey/randomToken`, RTDB `esign/cases`
- Produces:
  - RTDB에 사건 생성: `meta{title,company,respondent,ownerSid,pubKey,linkToken,createdAt,status:'active'}` + `secret/encPrivKey{data,salt,iv}`
  - `openCase(caseId)` — Task 10이 구현할 상세 화면 진입점 (이 태스크에서는 자리만)
  - 전역 `db`, `curUser`, `casesCache`, `shareCase(caseId)`

- [ ] **Step 1: docs-esign.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>문서관리 — 집단체불 계약서 전자송부</title>
<!-- 관리자(노무사) 페이지: 사건 관리·제출 취합·서류 생성. 로그인 필수. -->
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#f1f5f9;color:#1e293b;font-size:14px}
  .top{background:#1e293b;color:#fff;padding:12px 20px;display:flex;align-items:center;gap:12px}
  .top h1{font-size:16px;flex:1}
  .top a{color:#cbd5e1;font-size:12.5px;text-decoration:none}
  .main{max-width:1100px;margin:20px auto;padding:0 16px}
  .card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(15,23,42,.08);padding:18px;margin-bottom:14px}
  .btn{padding:9px 16px;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
  .btn-pri{background:#1e40af;color:#fff}
  .btn-sub{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1}
  .btn-danger{background:#fee2e2;color:#b91c1c;border:1px solid #fecaca}
  table{width:100%;border-collapse:collapse}
  th,td{padding:9px 10px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:13px}
  th{background:#f8fafc;color:#475569;font-size:12px}
  input,select{padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px}
  label{display:block;font-size:12.5px;font-weight:700;color:#334155;margin:12px 0 4px}
  .modal-bg{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
  .modal{background:#fff;border-radius:12px;max-width:520px;width:100%;padding:22px;max-height:90vh;overflow-y:auto}
  .badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:700}
  .b-active{background:#dcfce7;color:#166534}.b-closed{background:#f1f5f9;color:#64748b}
</style>
</head>
<body>
<div class="top">
  <h1>📄 문서관리 — 집단체불 계약서 전자송부</h1>
  <span id="whoami" style="font-size:12.5px;color:#94a3b8"></span>
  <a href="enter.html">← 포털</a>
</div>
<div class="main">
  <div class="card" id="viewList">
    <div style="display:flex;align-items:center;margin-bottom:12px">
      <b style="flex:1;font-size:15px">사건 목록</b>
      <button class="btn btn-pri" id="btnNewCase">+ 새 사건</button>
    </div>
    <table>
      <thead><tr><th>사건명</th><th>회사</th><th>제출</th><th>상태</th><th>생성일</th><th></th></tr></thead>
      <tbody id="caseRows"><tr><td colspan="6" style="color:#94a3b8">불러오는 중…</td></tr></tbody>
    </table>
  </div>
  <div id="viewDetail" style="display:none"></div> <!-- Task 10 -->
</div>

<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script src="js/utils.js"></script>
<script src="js/esign-crypto.js"></script>
<script src="js/esign-docs.js"></script>
<script>
'use strict';
var FB_CONFIG = {
  apiKey: 'AIzaSyDkZz5QlKSoqMOYByp5YGeMNLNDrIghliA',
  databaseURL: 'https://pureun-erp-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'pureun-erp',
  appId: '1:936817166182:web:9bd31f70d0afdf5fca2aa7',
  messagingSenderId: '936817166182'
};
firebase.initializeApp(FB_CONFIG);
var db = firebase.database();
var $ = function (id) { return document.getElementById(id); };
var curUser = null;
var casesCache = {};

// ── 로그인 가드 (직원 이메일 계정 필수 — 익명/미로그인은 포털로) ──
firebase.auth().onAuthStateChanged(function (u) {
  if (!u || !u.email) { location.href = 'enter.html'; return; }
  curUser = u;
  $('whoami').textContent = u.email.split('@')[0];
  loadCases();
});

// ── 사건 목록 ──
function loadCases() {
  db.ref('esign/cases').on('value', function (snap) {
    casesCache = snap.val() || {};
    var ids = Object.keys(casesCache).sort(function (a, b) {
      return ((casesCache[b].meta || {}).createdAt || 0) - ((casesCache[a].meta || {}).createdAt || 0);
    });
    var tb = $('caseRows');
    if (!ids.length) { tb.innerHTML = '<tr><td colspan="6" style="color:#94a3b8">사건이 없습니다. [+ 새 사건]으로 시작하세요.</td></tr>'; return; }
    tb.innerHTML = ids.map(function (id) {
      var c = casesCache[id], m = c.meta || {};
      var n = Object.keys(c.submissions || {}).length;
      return '<tr>'
        + '<td><a href="javascript:void(0)" onclick="openCase(\'' + id + '\')" style="color:#1e40af;font-weight:700">' + (m.title || '(제목 없음)') + '</a></td>'
        + '<td>' + (m.company || '') + '</td>'
        + '<td><b>' + n + '</b>명</td>'
        + '<td><span class="badge b-' + (m.status === 'active' ? 'active' : 'closed') + '">' + (m.status || '') + '</span></td>'
        + '<td>' + (m.createdAt ? localYMD(new Date(m.createdAt)) : '') + '</td>'
        + '<td><button class="btn btn-sub" onclick="shareCase(\'' + id + '\')">🔗 링크</button></td>'
        + '</tr>';
    }).join('');
  });
}

// ── 새 사건 생성 ──
$('btnNewCase').onclick = function () {
  var bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal">'
    + '<h3 style="margin-bottom:6px">새 사건 만들기</h3>'
    + '<label>사건명 *</label><input id="ncTitle" style="width:100%" placeholder="예: ○○산업 임금체불(2026)">'
    + '<label>회사명(피진정인) *</label><input id="ncCompany" style="width:100%">'
    + '<label>대표자/주소 등</label><input id="ncResp" style="width:100%">'
    + '<label>사건 비밀번호 * (제출 열람용)</label><input id="ncPw" type="password" style="width:100%">'
    + '<label>사건 비밀번호 확인 *</label><input id="ncPw2" type="password" style="width:100%">'
    + '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;margin-top:12px;font-size:12.5px;color:#b91c1c">'
    + '⚠ 이 비밀번호를 잊으면 <b>제출된 개인정보를 영구히 복구할 수 없습니다.</b> 안전한 곳에 별도 보관하세요.</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button class="btn btn-sub" id="ncCancel">취소</button>'
    + '<button class="btn btn-pri" id="ncOk">사건 생성</button></div></div>';
  document.body.appendChild(bg);
  $('ncCancel').onclick = function () { bg.remove(); };
  $('ncOk').onclick = async function () {
    var title = $('ncTitle').value.trim(), company = $('ncCompany').value.trim();
    var pw = $('ncPw').value, pw2 = $('ncPw2').value;
    if (!title || !company) { showToast('사건명과 회사명을 입력하세요'); return; }
    if (pw.length < 6) { showToast('비밀번호는 6자 이상으로 하세요'); return; }
    if (pw !== pw2) { showToast('비밀번호 확인이 일치하지 않습니다'); return; }
    this.textContent = '키 생성 중…'; this.disabled = true;
    var keys = await EsignCrypto.generateCaseKeys();
    var prot = await EsignCrypto.protectPrivKey(keys.privKeyJwk, pw);
    var ref = db.ref('esign/cases').push();
    await ref.child('meta').set({
      title: title, company: company, respondent: $('ncResp').value.trim(),
      ownerSid: curUser.email.split('@')[0],
      pubKey: keys.pubKeyJwk, linkToken: EsignCrypto.randomToken(),
      createdAt: firebase.database.ServerValue.TIMESTAMP, status: 'active'
    });
    await ref.child('secret/encPrivKey').set(prot);
    bg.remove();
    showToast('✅ 사건이 생성되었습니다 — [🔗 링크]로 근로자에게 공유하세요');
  };
};

// ── 링크·QR 공유 ──
function shareCase(caseId) {
  var m = (casesCache[caseId] || {}).meta || {};
  var url = location.origin + location.pathname.replace(/docs-esign\.html$/, 'sign.html')
    + '?case=' + caseId + '&t=' + (m.linkToken || '');
  var bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal" style="text-align:center">'
    + '<h3>' + (m.title || '') + '</h3>'
    + '<div id="qrBox" style="display:flex;justify-content:center;margin:16px 0"></div>'
    + '<input readonly value="' + url + '" style="width:100%;font-size:12px;color:#475569" onclick="this.select()">'
    + '<div style="display:flex;gap:8px;justify-content:center;margin-top:14px">'
    + '<button class="btn btn-pri" id="shCopy">📋 링크 복사</button>'
    + '<button class="btn btn-sub" id="shShare">📤 공유(카톡)</button>'
    + '<button class="btn btn-sub" id="shClose">닫기</button></div></div>';
  document.body.appendChild(bg);
  new QRCode($('qrBox'), { text: url, width: 180, height: 180 });
  $('shCopy').onclick = function () { copyToClipboard(url); };
  $('shShare').onclick = function () {
    if (navigator.share) navigator.share({ title: m.title, text: '푸른노무법인 전자위임장 제출 링크입니다.', url: url });
    else copyToClipboard(url);
  };
  $('shClose').onclick = function () { bg.remove(); };
}

function openCase(caseId) { showToast('사건 상세는 다음 단계에서 구현'); } // Task 10에서 교체
</script>
</body>
</html>
```

- [ ] **Step 2: 수동 검증**

1. `http://localhost:8080/docs-esign.html` → 미로그인 시 `enter.html`로 이동 확인
2. `enter.html`에서 직원 계정 로그인 후 `http://localhost:8080/docs-esign.html` 직접 접속
3. [+ 새 사건] → 비번 불일치·6자 미만 거부 확인 → 정상 생성 → 목록에 나타나는지 확인
4. [🔗 링크] → QR 표시·링크 복사 확인
5. 복사한 링크(localhost 도메인)로 시크릿 창(비로그인) 접속 → sign.html 정상 안내 확인
6. Task 6에서 만든 `test1` 사건도 목록에 보이는지 확인

- [ ] **Step 3: 커밋**

```bash
git add docs-esign.html
git commit -m "feat(문서관리): 관리자 페이지 골격 — 사건 목록·생성(E2E 키)·QR 링크 공유"
```

---

### Task 10: `docs-esign.html` 사건 상세 — 복호화 세션·제출 명단·검토·삭제

**Files:**
- Modify: `docs-esign.html` (`openCase` 교체 + `#viewDetail` 구현)

**Interfaces:**
- Consumes: `EsignCrypto.unprotectPrivKey/decryptSubmission`, `EsignDocs.maskIdNo`, `showToastUndo`(utils.js), `casesCache`, `shareCase`
- Produces:
  - 전역 `curCaseId`, `curPrivKey`(메모리만), `decrypted` — `[{_subId, _submittedAt, _reviewState, name, idNo, phone, addr, bank, joinDate, leaveDate, consentAt, sigPng}]` (Task 11·12가 사용)
  - `renderDetail()`, `closeDetail()`, `refreshSubs()` (Task 11·12가 사용)
  - `renderDetailActions()` 훅 호출 지점 (Task 11이 정의)

- [ ] **Step 1: openCase 함수 교체 + 상세 화면 구현** — 기존 `function openCase(...){...}` 한 줄을 아래로 교체

```js
// ── 사건 상세 (복호화 세션) ──
var curCaseId = null, curPrivKey = null, decrypted = [];

async function openCase(caseId) {
  var c = casesCache[caseId]; if (!c) return;
  var pw = prompt('사건 비밀번호를 입력하세요 (사건 생성 시 설정)');
  if (!pw) return;
  try {
    var protSnap = await db.ref('esign/cases/' + caseId + '/secret/encPrivKey').once('value');
    curPrivKey = await EsignCrypto.unprotectPrivKey(protSnap.val(), pw);
  } catch (e) {
    showToast('❌ 비밀번호가 올바르지 않습니다');
    return;
  }
  curCaseId = caseId;
  await refreshSubs();
  $('viewList').style.display = 'none';
  $('viewDetail').style.display = 'block';
  renderDetail();
}

// 제출 전체 복호화 (실패 건은 표시만 하고 건너뜀)
async function refreshSubs() {
  var snap = await db.ref('esign/cases/' + curCaseId + '/submissions').once('value');
  var subs = snap.val() || {};
  decrypted = [];
  for (var id in subs) {
    var s = subs[id];
    try {
      var d = await EsignCrypto.decryptSubmission({ enc: s.enc, encKey: s.encKey, iv: s.iv }, curPrivKey);
      d._subId = id; d._submittedAt = s.submittedAt || 0; d._reviewState = s.reviewState || 'pending';
      decrypted.push(d);
    } catch (e) {
      decrypted.push({ _subId: id, _submittedAt: s.submittedAt || 0, _reviewState: 'error', name: '(복호화 실패)', idNo: '', phone: '' });
    }
  }
  decrypted.sort(function (a, b) { return a._submittedAt - b._submittedAt; });
}

var RS_LABEL = { pending: '⏳ 대기', confirmed: '✅ 확인', hold: '⚠ 보류', error: '❌ 오류' };

function renderDetail() {
  var m = (casesCache[curCaseId] || {}).meta || {};
  // 중복 감지: 동일 주민번호 2건 이상
  var cnt = {};
  decrypted.forEach(function (d) { if (d.idNo) cnt[d.idNo] = (cnt[d.idNo] || 0) + 1; });
  $('viewDetail').innerHTML =
    '<div class="card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'
    + '<button class="btn btn-sub" onclick="closeDetail()">← 목록</button>'
    + '<b style="flex:1;font-size:15px">' + (m.title || '') + ' <span style="color:#64748b;font-weight:400">— 제출 '
    + decrypted.length + '명</span></b>'
    + '<button class="btn btn-sub" onclick="shareCase(curCaseId)">🔗 링크</button>'
    + '<span id="detailActions"></span>' // Task 11·12가 버튼 추가
    + '</div>'
    + '<table><thead><tr><th>#</th><th>성명</th><th>주민등록번호</th><th>연락처</th><th>제출일시</th><th>상태</th><th></th></tr></thead><tbody>'
    + decrypted.map(function (d, i) {
      var dup = d.idNo && cnt[d.idNo] > 1 ? ' <span class="badge" style="background:#fef3c7;color:#92400e">중복</span>' : '';
      return '<tr>'
        + '<td>' + (i + 1) + '</td>'
        + '<td style="font-weight:700">' + d.name + dup + '</td>'
        + '<td onclick="this.textContent=\'' + (d.idNo || '') + '\'" style="cursor:pointer" title="클릭하면 전체 표시">' + EsignDocs.maskIdNo(d.idNo) + '</td>'
        + '<td>' + (d.phone || '') + '</td>'
        + '<td>' + (d._submittedAt ? new Date(d._submittedAt).toLocaleString('ko-KR') : '') + '</td>'
        + '<td><a href="javascript:void(0)" onclick="cycleReview(\'' + d._subId + '\')">' + (RS_LABEL[d._reviewState] || d._reviewState) + '</a></td>'
        + '<td><button class="btn btn-sub" onclick="showPerson(\'' + d._subId + '\')">상세</button> '
        + '<button class="btn btn-danger" onclick="delSub(\'' + d._subId + '\')">삭제</button></td>'
        + '</tr>';
    }).join('')
    + '</tbody></table></div>';
  if (typeof renderDetailActions === 'function') renderDetailActions(); // Task 11·12
}
function closeDetail() {
  curCaseId = null; curPrivKey = null; decrypted = []; // 복호화 세션 종료 — 메모리 정리
  $('viewDetail').style.display = 'none';
  $('viewList').style.display = 'block';
}

// 검토상태 순환: pending → confirmed → hold → pending
function cycleReview(subId) {
  var d = decrypted.find(function (x) { return x._subId === subId; }); if (!d) return;
  var next = { pending: 'confirmed', confirmed: 'hold', hold: 'pending' }[d._reviewState] || 'pending';
  db.ref('esign/cases/' + curCaseId + '/submissions/' + subId + '/reviewState').set(next);
  d._reviewState = next;
  renderDetail();
}

// 개인 상세 (서명 미리보기)
function showPerson(subId) {
  var d = decrypted.find(function (x) { return x._subId === subId; }); if (!d) return;
  var bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.onclick = function (e) { if (e.target === bg) bg.remove(); };
  bg.innerHTML = '<div class="modal">'
    + '<h3 style="margin-bottom:10px">' + d.name + '</h3>'
    + '<table>'
    + '<tr><th>주민등록번호</th><td>' + d.idNo + '</td></tr>'
    + '<tr><th>연락처</th><td>' + d.phone + '</td></tr>'
    + '<tr><th>주소</th><td>' + (d.addr || '') + '</td></tr>'
    + '<tr><th>입금계좌</th><td>' + (d.bank || '') + '</td></tr>'
    + '<tr><th>입사일</th><td>' + (d.joinDate || '-') + '</td></tr>'
    + '<tr><th>퇴사일</th><td>' + (d.leaveDate || '-') + '</td></tr>'
    + '<tr><th>동의일시</th><td>' + String(d.consentAt || '').replace('T', ' ').slice(0, 16) + '</td></tr>'
    + '<tr><th>서명</th><td>' + (d.sigPng ? '<img src="' + d.sigPng + '" style="height:70px;border:1px solid #e5e7eb;border-radius:6px">' : '-') + '</td></tr>'
    + '</table>'
    + '<div style="text-align:right;margin-top:12px"><button class="btn btn-sub" onclick="this.closest(\'.modal-bg\').remove()">닫기</button></div></div>';
  document.body.appendChild(bg);
}

// 삭제 (Undo 토스트 — utils.js showToastUndo)
function delSub(subId) {
  var snapCache = null;
  db.ref('esign/cases/' + curCaseId + '/submissions/' + subId).once('value').then(function (s) {
    snapCache = s.val();
    return db.ref('esign/cases/' + curCaseId + '/submissions/' + subId).remove();
  }).then(function () {
    decrypted = decrypted.filter(function (x) { return x._subId !== subId; });
    renderDetail();
    showToastUndo('제출 1건을 삭제했습니다', function () {
      db.ref('esign/cases/' + curCaseId + '/submissions/' + subId).set(snapCache).then(refreshSubs).then(renderDetail);
    });
  });
}
```

- [ ] **Step 2: 수동 검증**

1. 직원 로그인 상태에서 `test1` 사건 클릭 → 비밀번호 `테스트비번` 입력 → Task 6에서 제출한
   가짜 데이터가 명단에 표시(이름·마스킹된 주민번호) 확인
2. 틀린 비밀번호 → "비밀번호가 올바르지 않습니다" 확인
3. 주민번호 셀 클릭 → 전체 표시 확인
4. 상태 클릭 → 대기→확인→보류 순환 확인 (RTDB에서 reviewState 변경 확인)
5. [상세] → 서명 이미지 표시 확인
6. sign.html에서 같은 주민번호로 한 건 더 제출 → 다시 사건 열면 "중복" 배지 확인
7. [삭제] → 사라짐 → 토스트 [↩ 취소] → 복원 확인
8. [← 목록] 후 다시 들어가려면 비밀번호 재입력 필요한지 확인 (세션 메모리 정리)

- [ ] **Step 3: 커밋**

```bash
git add docs-esign.html
git commit -m "feat(문서관리): 사건 상세 — 복호화 세션·명단·검토·중복감지·삭제(Undo)"
```

---

### Task 11: `docs-esign.html` 체불내역 입력 (수동 + 엑셀 붙여넣기)

**Files:**
- Modify: `docs-esign.html`

**Interfaces:**
- Consumes: `decrypted`, `parseExcelPaste`(utils.js), `showToast`(utils.js), RTDB `esign/cases/{caseId}/arrears`
- Produces:
  - RTDB `arrears/{subId}` = `{month1, month2, month3, severance}` (숫자, 원 단위)
  - `arrearsCache` 전역 — Task 12의 XLSX 생성이 사용
  - `renderDetailActions()` — 상세 화면 상단 버튼 렌더 (Task 12가 교체·확장)

- [ ] **Step 1: 구현** — Task 10 코드 아래에 추가

```js
// ── 체불내역 입력 (근로자에게 받지 않고 노무사가 입력 — 설계 §8.1) ──
var arrearsCache = {};

function renderDetailActions() {
  $('detailActions').innerHTML = '<button class="btn btn-sub" onclick="openArrears()">💰 체불내역</button>';
  // Task 12가 이 함수를 교체하며 서류 생성 버튼 추가
}

async function openArrears() {
  var snap = await db.ref('esign/cases/' + curCaseId + '/arrears').once('value');
  arrearsCache = snap.val() || {};
  var bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal" style="max-width:760px">'
    + '<h3 style="margin-bottom:4px">체불내역 입력 (원 단위)</h3>'
    + '<div style="font-size:12px;color:#64748b;margin-bottom:10px">엑셀에서 [성명·1개월차·2개월차·3개월차·퇴직금] 열을 복사해 아래 표에 붙여넣기(Ctrl+V)해도 됩니다. 성명으로 매칭합니다.</div>'
    + '<table id="arrTable"><thead><tr><th>성명</th><th>체불임금 1개월차</th><th>2개월차</th><th>3개월차</th><th>체불퇴직금</th></tr></thead><tbody>'
    + decrypted.filter(function (d) { return d._reviewState !== 'error'; }).map(function (d) {
      var a = arrearsCache[d._subId] || {};
      function cell(k) { return '<td><input data-sub="' + d._subId + '" data-k="' + k + '" type="text" inputmode="numeric" style="width:110px;text-align:right" value="' + (a[k] || '') + '"></td>'; }
      return '<tr><td style="font-weight:700">' + d.name + '</td>' + cell('month1') + cell('month2') + cell('month3') + cell('severance') + '</tr>';
    }).join('')
    + '</tbody></table>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
    + '<button class="btn btn-sub" id="arrCancel">취소</button>'
    + '<button class="btn btn-pri" id="arrSave">저장</button></div></div>';
  document.body.appendChild(bg);

  // 엑셀 붙여넣기: 첫 열 성명 매칭 (utils.js parseExcelPaste)
  bg.querySelector('#arrTable').addEventListener('paste', function (e) {
    var rows = parseExcelPaste(e.clipboardData.getData('text'));
    if (rows.length < 1 || rows[0].length < 2) return;
    e.preventDefault();
    var byName = {};
    decrypted.forEach(function (d) { byName[d.name] = d._subId; });
    var hit = 0;
    rows.forEach(function (r) {
      var sid = byName[String(r[0]).trim()];
      if (!sid) return;
      ['month1', 'month2', 'month3', 'severance'].forEach(function (k, idx) {
        var inp = bg.querySelector('input[data-sub="' + sid + '"][data-k="' + k + '"]');
        if (inp && r[idx + 1] != null) inp.value = String(r[idx + 1]).replace(/[^0-9]/g, '');
      });
      hit++;
    });
    showToast(hit + '명 매칭되었습니다');
  });

  bg.querySelector('#arrCancel').onclick = function () { bg.remove(); };
  bg.querySelector('#arrSave').onclick = async function () {
    var out = {};
    bg.querySelectorAll('#arrTable input').forEach(function (inp) {
      var sid = inp.dataset.sub, k = inp.dataset.k;
      var v = parseInt(inp.value.replace(/[^0-9]/g, ''), 10) || 0;
      if (!out[sid]) out[sid] = {};
      out[sid][k] = v;
    });
    await db.ref('esign/cases/' + curCaseId + '/arrears').set(out);
    arrearsCache = out;
    bg.remove();
    showToast('✅ 체불내역이 저장되었습니다');
  };
}
```

- [ ] **Step 2: 수동 검증**

1. 사건 상세 → [💰 체불내역] → 제출자별 행 표시 확인
2. 금액 입력 → [저장] → RTDB `arrears` 기록 확인 → 다시 열면 값 유지 확인
3. 엑셀(또는 메모장 탭 구분 텍스트 `홍길동\t2600000\t2600000\t2600000\t3000000`)을 복사해
   표에 붙여넣기 → "1명 매칭" 토스트 + 값 채워짐 확인

- [ ] **Step 3: 커밋**

```bash
git add docs-esign.html
git commit -m "feat(문서관리): 체불내역 입력 — 수동 + 엑셀 붙여넣기(성명 매칭)"
```

---

### Task 12: `docs-esign.html` 서류 일괄 생성 + 사건 마감·파기

**Files:**
- Modify: `docs-esign.html` (CDN 3개 추가 + renderDetailActions 교체 + 함수 추가)

**Interfaces:**
- Consumes: `decrypted`, `arrearsCache`, `EsignDocs.buildDelegationHtml/buildConsentHtml/htmlPagesToPdf/downloadRosterXlsx/downloadArrearsXlsx`, `customConfirm`(utils.js), `closeDetail`, `renderDetail`
- Produces: 다운로드 파일 4종, RTDB `meta/status` 갱신(closed/purged), `submissions`·`arrears` 파기

- [ ] **Step 1: CDN 추가** — `docs-esign.html`의 qrcode 스크립트 아래에

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.18.5/package/dist/xlsx.full.min.js"></script>
```

- [ ] **Step 2: renderDetailActions 교체 + 생성·파기 함수** — Task 11의 `renderDetailActions`를 아래로 교체하고 함수 추가

```js
function renderDetailActions() {
  var m = (casesCache[curCaseId] || {}).meta || {};
  $('detailActions').innerHTML =
    '<button class="btn btn-sub" onclick="openArrears()">💰 체불내역</button> '
    + '<button class="btn btn-pri" onclick="genDocs()">📑 서류 일괄 생성</button> '
    + (m.status === 'active'
      ? '<button class="btn btn-sub" onclick="closeCase()">사건 마감</button>'
      : '<button class="btn btn-danger" onclick="purgeCase()">🗑 제출 데이터 파기</button>');
}

// 서류 4종 생성 — 확인(confirmed)된 제출만 (없으면 오류 제외 전체)
async function genDocs() {
  var m = (casesCache[curCaseId] || {}).meta || {};
  var pool = decrypted.filter(function (d) { return d._reviewState === 'confirmed'; });
  if (!pool.length) pool = decrypted.filter(function (d) { return d._reviewState !== 'error'; });
  if (!pool.length) { showToast('생성할 제출이 없습니다'); return; }
  showToast('서류 생성 중… (' + pool.length + '명)');
  // 최신 체불내역 로드
  var snap = await db.ref('esign/cases/' + curCaseId + '/arrears').once('value');
  arrearsCache = snap.val() || {};
  // ① 개인별 위임장 PDF (전원 1파일, 1인 1페이지)
  await EsignDocs.htmlPagesToPdf(
    pool.map(function (d) { return EsignDocs.buildDelegationHtml(d, m); }),
    (m.title || '사건') + '_위임장.pdf');
  // ② 개인정보 동의서 PDF
  await EsignDocs.htmlPagesToPdf(
    pool.map(function (d) { return EsignDocs.buildConsentHtml(d, m); }),
    (m.title || '사건') + '_개인정보동의서.pdf');
  // ③ 진정인 연명부 XLSX
  EsignDocs.downloadRosterXlsx(pool, m);
  // ④ 체불/체당금 정리 XLSX
  EsignDocs.downloadArrearsXlsx(pool, arrearsCache, m);
  showToast('✅ 서류 4종 다운로드 완료');
}

// 사건 마감 (신규 제출 차단 — RTDB 규칙의 status==='active' 조건)
function closeCase() {
  customConfirm('사건을 마감할까요?\n마감하면 근로자 링크로 더 이상 제출할 수 없습니다.', function () {
    db.ref('esign/cases/' + curCaseId + '/meta/status').set('closed').then(function () {
      showToast('사건이 마감되었습니다'); renderDetail();
    });
  });
}

// 제출 데이터 파기 (개인정보보호법 파기 의무 — 서류 다운로드 후 실행)
function purgeCase() {
  customConfirm('제출된 개인정보(암호문 포함)를 영구 파기할까요?\n\n⚠ 되돌릴 수 없습니다. 필요한 서류를 먼저 [서류 일괄 생성]으로 내려받았는지 확인하세요.', function () {
    Promise.all([
      db.ref('esign/cases/' + curCaseId + '/submissions').remove(),
      db.ref('esign/cases/' + curCaseId + '/arrears').remove(),
      db.ref('esign/cases/' + curCaseId + '/meta/status').set('purged')
    ]).then(function () {
      showToast('제출 데이터가 파기되었습니다');
      closeDetail();
    });
  });
}
```

- [ ] **Step 3: 수동 검증**

1. `test1` 사건 상세 → [📑 서류 일괄 생성] → PDF 2개·XLSX 2개 다운로드 확인
2. 위임장 PDF 열어 확인: 사건 회사명·근로자 이름·주민번호·**서명 이미지**·법적 문구가
   한글 깨짐 없이 렌더되는지
3. 연명부 XLSX: 열 구조(순번·성명·주민등록번호·연락처·주소·입사일·퇴사일·입금계좌) 확인
4. 체불정리 XLSX: Task 11에서 입력한 금액과 체불총액 합계 일치 확인
5. [사건 마감] → sign.html 링크 접속 시 "접수가 마감된 사건입니다" 확인
6. 마감 후 [🗑 제출 데이터 파기] → RTDB에서 submissions/arrears 삭제 + status=purged 확인

- [ ] **Step 4: 커밋**

```bash
git add docs-esign.html
git commit -m "feat(문서관리): 서류 4종 일괄 생성(위임장·동의서 PDF, 연명부·체불정리 XLSX) + 사건 마감·파기"
```

---

### Task 12b: `sign.html` 완료 화면 — 본인 제출본 PDF 저장 (설계 §8.2)

**Files:**
- Modify: `sign.html` (CDN 2개 추가 + 완료 화면 버튼)

**Interfaces:**
- Consumes: `EsignDocs.buildDelegationHtml/htmlPagesToPdf` (Task 8), Task 6의 제출 데이터
- Produces: 없음 (근로자 기기에 PDF 다운로드만 — 전자계약 사본 교부 관행)

- [ ] **Step 1: CDN 추가** — `sign.html`의 esign-docs.js 스크립트 아래에

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
```

- [ ] **Step 2: 완료 화면에 버튼 추가** — `step4`의 `</p>` 아래에

```html
      <button class="btn btn-sub" id="btnMyCopy" style="max-width:280px;margin:20px auto 0">📄 내 위임장 사본 저장(PDF)</button>
```

- [ ] **Step 3: 핸들러 추가** — Task 6 제출 핸들러에서 성공 시 원본 데이터를 보관하고 연결

Task 6의 `showStep(4);` 바로 앞에 `window._myCopy = data;` 한 줄을 추가하고, 스크립트 끝에:

```js
// ── 본인 제출본 PDF 저장 (완료 화면 — 기기에만 저장, 전송 없음) ──
$('btnMyCopy').onclick = function () {
  if (!window._myCopy) return;
  EsignDocs.htmlPagesToPdf([EsignDocs.buildDelegationHtml(window._myCopy, caseMeta)], '전자위임장_' + window._myCopy.name + '.pdf')
    .catch(function () { alert('PDF 생성에 실패했습니다.'); });
};
```

- [ ] **Step 4: 수동 검증**

test1 사건으로 제출 완료 → [내 위임장 사본 저장] → PDF에 본인 정보·서명·법적 문구 확인.

- [ ] **Step 5: 커밋**

```bash
git add sign.html
git commit -m "feat(문서관리): 근로자 완료 화면 — 본인 위임장 사본 PDF 저장"
```

---

### Task 13: 포털 타일 추가 + 최종 E2E 점검 + 배포

**Files:**
- Modify: `enter.html` (APPS 배열 — `:398-405` 부근)
- Delete(정리): RTDB의 `esign/cases/test1` 테스트 데이터

**Interfaces:**
- Consumes: 완성된 `docs-esign.html`
- Produces: 포털에 '문서관리' 타일 노출 (전 직원)

- [ ] **Step 1: 타일 추가** — `enter.html`의 `APPS` 배열 마지막 항목 뒤에 (앞 항목 끝에 콤마 추가 잊지 말 것)

```js
    { key:'docs',    name:'문서관리',     desc:'계약서 전자송부',  icon:'📄', url:'docs-esign.html',     roles:null }
```

- [ ] **Step 2: 최종 E2E 시나리오 점검 (localhost)**

처음부터 끝까지 실제 업무 흐름 그대로:
1. 포털 로그인 → [문서관리] 타일 → 새 사건 생성(비밀번호 경고 확인)
2. [🔗 링크] → 링크 복사 → 시크릿 창(모바일 모드)에서 접속
3. 신분증 OCR 자동입력(가짜 이미지) → 확인·수정 → 동의 2건 체크 → 서명 → 제출
4. 관리 화면 새로고침 → 비밀번호 입력 → 명단·서명 확인 → 검토상태 '확인' → 체불내역 입력
5. [서류 일괄 생성] → 4종 파일 내용 검수
6. 사건 마감 → 링크 차단 확인
7. RTDB 데이터 탭에서 전 과정 중 **평문 개인정보가 한 번도 저장되지 않았는지** 최종 확인

- [ ] **Step 3: 테스트 데이터 정리**

Firebase 콘솔 데이터 탭에서 `esign/cases/test1` 및 E2E 점검용 사건 삭제.

- [ ] **Step 4: 커밋 + 배포**

```bash
cd /c/Users/fair0/pureunall
git add enter.html
git commit -m "feat(문서관리): 포털에 문서관리 타일 추가 — 집단체불 계약서 전자송부 오픈"
git pull --rebase origin main
git push origin main
```

GitHub Pages 배포(1~2분) 후 `https://nabaho.github.io/pureunall/enter.html`에서 타일 확인,
실제 휴대폰으로 sign.html 링크 접속해 터치 서명까지 최종 확인.

- [ ] **Step 5: (수동, 실무) 위임장 문구 노무사 최종 검토**

생성된 위임장 PDF 1부를 대표노무사가 검토 — 기존 종이 양식과 문구 대조. 수정 필요 시
`js/esign-docs.js`의 `ESIGN_FORMS` 문구만 고치면 됨(코드 변경 불필요, 재배포만).

---

## 태스크 밖 참고 — 이메일 링크 발송 (선택 기능, 요청 시 추가)

설계 §10의 이메일 발송 옵션은 기존 `sendPayslip` 함수 호출 1회로 구현 가능:

```js
fetch('https://us-central1-pureun-erp.cloudfunctions.net/sendPayslip', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ to: email, name: '근로자', ym: '',
    subject: '[푸른노무법인] 전자위임장 제출 안내',
    html: '<p>아래 링크에서 전자위임장을 제출해 주세요.</p><p><a href="' + url + '">' + url + '</a></p>' })
});
```

수요가 확인되면 shareCase 모달에 이메일 입력란 1개로 추가한다 (YAGNI — 지금은 미구현).
