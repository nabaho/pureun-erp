'use strict';
// 규정관리가 브라우저 저장공간을 덜 먹는지 — node --test tests/rules-storage.test.js
//
// 왜: 같은 주소(nabaho.github.io)를 쓰는 프로그램들이 5MB 를 나눠 쓴다.
// 규정관리가 원본을 base64 로 통째 들고 있어 1.5MB 넘게 먹었고, 그 탓에
// 푸른이알피 저장이 조용히 실패하는 지경(4.25/5MB)이 됐다.
// 원본은 서버(rules_mgmt/orig)에 이미 있으므로 이 브라우저에 또 둘 이유가 없다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'rules.html'), 'utf8');
const ORIG_KEY = 'pureun_rules_orig_v1';

/* rules.html 은 통째로 돌릴 수 없다(모듈·DOM 의존). 원본 보관 토막만 떼어
   가짜 저장소·가짜 서버와 함께 돌린다. */
function load(opts) {
  opts = opts || {};
  const from = app.indexOf('function putOrig(id,orig){');
  const to = app.indexOf('async function getOrig(id){');
  assert.ok(from > 0 && to > from, '원본 보관 토막을 찾을 수 없습니다');

  const store = Object.assign({}, opts.store || {});
  const sent = [];
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  const FBDB = opts.signedIn ? { ref: () => ({ set: v => { sent.push(v); return { catch() {} }; } }) } : null;
  const FBUSER = opts.signedIn ? { uid: 'U1' } : null;
  const made = new Function(
    'FBDB', 'FBUSER', 'myUid', 'myEmail', 'loadOrigLocal', 'ORIG_KEY', 'localStorage', 'console',
    app.slice(from, to) + '\nreturn { putOrig: putOrig, trimOrigLocal: trimOrigLocal };'
  )(FBDB, FBUSER, () => 'U1', () => 'a@b.c',
    () => { try { return JSON.parse(store[ORIG_KEY]) || {}; } catch (_) { return {}; } },
    ORIG_KEY, localStorage, { log() {}, warn() {} });
  return { ...made, store, sent, map: () => JSON.parse(store[ORIG_KEY] || '{}') };
}

test('로그인 상태면 원본 덩어리를 이 브라우저에 두지 않는다', () => {
  const t = load({ signedIn: true });
  t.putOrig('r1', { name: 'a.hwp', text: '본문', b64: 'X'.repeat(50000) });
  assert.equal(t.map().r1.b64, null, '덩어리는 서버에만');
  assert.equal(t.map().r1.name, 'a.hwp', '이름은 남아야 목록이 보인다');
  assert.equal(t.map().r1.text, '본문', '텍스트는 남아야 오프라인에서도 읽는다');
});

test('덩어리는 서버로 온전히 간다 (버리는 것이 아니다)', () => {
  const t = load({ signedIn: true });
  t.putOrig('r1', { name: 'a.hwp', text: 't', b64: 'X'.repeat(50000) });
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].b64.length, 50000);
});

test('로그아웃이면 통째로 들고 있는다 (이 브라우저가 유일한 사본이다)', () => {
  const t = load({ signedIn: false });
  t.putOrig('r2', { name: 'b.hwp', text: 't', b64: 'Y'.repeat(1000) });
  assert.equal(t.map().r2.b64.length, 1000);
  assert.equal(t.map().r2.localOnly, true, '서버에 없다는 표시');
});

test('이미 쌓인 덩어리를 걷어낸다 — 서버본이 있는 것만', () => {
  const t = load({
    signedIn: true,
    store: {
      [ORIG_KEY]: JSON.stringify({
        a: { name: 'a', b64: 'A'.repeat(30000) },
        b: { name: 'b', b64: 'B'.repeat(30000), localOnly: true },
        c: { name: 'c', b64: null }
      })
    }
  });
  const n = t.trimOrigLocal();
  assert.equal(n, 1, '서버본이 있는 한 건만');
  assert.equal(t.map().a.b64, null);
  assert.equal(t.map().b.b64.length, 30000, '서버에 없는 것은 지키다');
});

test('로그아웃이면 걷어내지 않는다 (서버를 못 보는데 지우면 잃는다)', () => {
  const t = load({
    signedIn: false,
    store: { [ORIG_KEY]: JSON.stringify({ a: { name: 'a', b64: 'A'.repeat(1000) } }) }
  });
  assert.equal(t.trimOrigLocal(), 0);
  assert.equal(t.map().a.b64.length, 1000);
});

test('truncated 를 함부로 쓰지 않는다 (사용자에게 보이는 말이다)', () => {
  // truncated = «파일이 2MB 넘어 텍스트만 남겼다» 는 안내 문구용.
  // 저장공간 때문에 로컬만 비운 것과 뜻이 다르므로 localOnly 를 따로 둔다.
  const t = load({ signedIn: true });
  t.putOrig('r1', { name: 'a', text: 't', b64: 'X'.repeat(1000) });
  assert.notEqual(t.map().r1.truncated, true);
});

test('로그인하면 한 번 걷어내도록 걸려 있다', () => {
  assert.match(app, /onAuthStateChanged[\s\S]{0,600}trimOrigLocal\(\)/);
});
