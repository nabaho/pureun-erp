'use strict';
/* 「지금 가져오기」 (대표 결정 2026-08-23 ④) — 실행: node --test tests/*.test.js

   서버는 30분마다 메일을 본다. 「보냈다는데 왜 안 보이나」를 그 자리에서 확인할
   수 있어야 해서, 사람이 눌러 바로 당기는 길을 만들었다.

   ⚠ 30분마다 도는 것과 이 단추는 **같은 본체**(runPaydataMailOnce)를 쓴다.
   두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽은 옛 길로 남는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ══════ 서버 ══════ */

test('★ 30분마다 도는 것과 단추가 같은 본체를 쓴다', () => {
  assert.match(FN, /async function runPaydataMailOnce/, '본체를 따로 뺀 자리가 없습니다');
  // 예약 함수와 당기기 함수가 각각 그 본체를 부른다
  const calls = FN.match(/runPaydataMailOnce\(\)/g) || [];
  assert.ok(calls.length >= 3, '본체를 부르는 곳이 모자랍니다(정의 1 + 부르기 2): ' + calls.length);
  assert.match(FN, /exports\.pullPaydataMail/);
  assert.match(FN, /exports\.receivePaydataMail/);
});

test('★ 직원만 부를 수 있다 — 아니면 회사 메일함을 아무나 뒤진다', () => {
  const i = FN.indexOf('exports.pullPaydataMail');
  const body = FN.slice(i, i + 2000);
  assert.match(body, /requireStaff\(req\)/, '누가 부르는지 확인하지 않습니다');
});

test('★ 연달아 누르면 거절한다 — 메일 서버에 붙는 일이라 계정이 잠긴다', () => {
  const i = FN.indexOf('exports.pullPaydataMail');
  const body = FN.slice(i, i + 2000);
  assert.match(body, /PULL_COOL_MS/, '잠금이 없습니다');
  assert.match(body, /429/, '너무 자주 눌렀다는 것을 알려야 합니다');
  assert.match(body, /초 뒤에 다시/, '몇 초 뒤에 되는지 말해야 합니다');
});

test('★ 잠금 시각을 못 적어도 받는 일은 한다 — 잠금 때문에 자료가 안 들어오면 안 된다', () => {
  const i = FN.indexOf('exports.pullPaydataMail');
  const body = FN.slice(i, i + 2000);
  assert.match(body, /잠금 확인 실패/, '못 적었을 때 그냥 진행하는 길이 없습니다');
});

test('★ 몇 통을 보고 몇 건을 담았는지 돌려준다', () => {
  /* 「가져왔습니다」만 하면 아무 일도 없었는지 알 수 없다 — 수를 돌려줘야
     「모르는 주소라 건너뜀 2통」 같은 것을 사람에게 말할 수 있다. */
  assert.match(FN, /return \{ boxes: boxes, looked: inbox\.length/);
});

/* ══════ 저장 층 ══════ */

function loadStore(fakeFetch, user) {
  const sandbox = {
    window: {}, console, Date, fetch: fakeFetch,
    firebase: { auth: () => ({ currentUser: user }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}
const USER = { getIdToken: () => Promise.resolve('TOK') };

test('★ 로그인 표를 함께 보낸다 — 서버가 직원인지 확인한다', () => {
  const calls = [];
  const f = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, looked: 2 }) }); };
  const S = loadStore(f, USER);
  return S.pullMailNow().then(() => {
    assert.match(calls[0].init.headers.Authorization, /^Bearer TOK$/);
    assert.equal(calls[0].init.method, 'POST');
    assert.match(calls[0].url, /pullPaydataMail/);
  });
});

test('★ 로그인 안 했으면 부르지 않는다', () => {
  const S = loadStore(() => { throw new Error('불렀다'); }, null);
  return S.pullMailNow().then(
    () => { throw new Error('막지 않았습니다'); },
    e => assert.match(e.message, /로그인/));
});

test('★ 서버가 거절하면 그 까닭을 그대로 올려 준다', () => {
  const f = () => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ ok: false, error: '43초 뒤에 다시 눌러 주세요.' }) });
  const S = loadStore(f, USER);
  return S.pullMailNow().then(
    () => { throw new Error('막지 않았습니다'); },
    e => assert.match(e.message, /43초/));
});

test('서버가 이상한 답을 보내도 안 터진다', () => {
  const f = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.reject(new Error('JSON 아님')) });
  const S = loadStore(f, USER);
  return S.pullMailNow().then(
    () => { throw new Error('막지 않았습니다'); },
    e => assert.ok(e.message));
});

/* ══════ 화면 ══════ */

test('★ 메일함에 「지금 가져오기」 단추가 있다', () => {
  assert.match(HTML, /지금 가져오기/);
  assert.match(HTML, /onclick="pullMailNow\(\)"/);
});

test('★ 누른 사이 두 번 눌리지 않는다', () => {
  const m = HTML.match(/function pullMailNow[\s\S]*?\n\}/);
  assert.ok(m, 'pullMailNow 를 찾을 수 없습니다');
  assert.match(m[0], /if \(App\.mailPulling\) return;/, '두 번 눌림을 안 막습니다');
  assert.match(m[0], /App\.mailPulling = false/, '잠금을 안 풀면 새로고침 전엔 못 누릅니다');
  // 실패해도 풀어야 한다
  const fails = m[0].match(/App\.mailPulling = false/g) || [];
  assert.ok(fails.length >= 2, '실패한 길에서 잠금을 안 풉니다');
});

test('★ 끝나면 몇 통·몇 건인지 사람에게 말한다', () => {
  const m = HTML.match(/function pullMailNow[\s\S]*?\n\}/)[0];
  assert.match(m, /통을 보고/);
  assert.match(m, /건을 담았습니다/);
  /* 모르는 주소라 건너뛴 것을 안 알리면 「왜 0건인가」를 알 수 없다 —
     실제로 그것 때문에 자료가 안 들어오고 있었다(2026-08-23 로그). */
  assert.match(m, /모르는 주소/);
});

test('★ 목록도 함께 다시 읽는다 — 담았는데 화면이 그대로면 안 들어온 줄 안다', () => {
  const m = HTML.match(/function pullMailNow[\s\S]*?\n\}/)[0];
  assert.match(m, /ensureMail\(true\)/);
});
