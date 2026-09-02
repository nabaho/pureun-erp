'use strict';
/* 낡은 연결을 끊을 때 «기다리지 않는다» (2026-09-02 검토)
   ═══════════════════════════════════════════════════════════════════════════
   ★ 왜 — warmConnect 에서 낡은 연결을 버리는 줄은 «연결이 낡았을 때»만 지나간다.
     곧 이 함수가 느려지는 바로 그 경우다. 그런데 거기서 logout 을 기다리고 있었다.
     반쯤 끊긴 소켓(4분을 놀리면 흔하다 — 방화벽이 조용히 버린다)에 LOGOUT 을
     보내면 답이 안 오고, TCP 가 포기할 때까지 «몇 분» 멈출 수 있다.
     빠르게 하려고 만든 길에서 가장 오래 멈추는 셈이 된다.

   ★ 그래서 여기서 못 박는 것 — logout 이 «영원히 안 끝나도» 일이 된다.
     이것은 글자로는 못 지킨다. 돌려 봐야 한다.

   ⚠ 붙어 둔 것은 모듈 자리(_warm)에 산다 — 회마다 require 를 새로 해서
     깨끗한 자리에서 시작한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MS_PATH = path.join(__dirname, '..', 'functions', 'mail-sync.js');
function 새로불러오기() {
  delete require.cache[require.resolve(MS_PATH)];
  return require(MS_PATH);
}

/* 낡은 뒤에 끊으려 하면 «영원히 안 끝나는» 가짜 — 반쯤 끊긴 소켓이 이렇게 굴다 */
function 자리() {
  const 기록 = { 붙음: 0, 끊자고함: 0, 끊김끝남: 0, 연다: 0 };
  const deps = {
    getDatabase: () => ({ ref: () => ({ once: async () => ({ val: () => 'INBOX' }) }) }),
    mailUserAsync: async () => '370-6',
    mailPass: () => 'pw',
    MD: { loginIds: () => ['370-6'] },
    imapConnect: async () => {
      기록.붙음++;
      return {
        usable: true,
        async getMailboxLock() { 기록.연다++; return { release() {} }; },
        logout() {
          기록.끊자고함++;
          /* ★ 영원히 안 끝난다 — 기다리면 여기서 멈춘다 */
          return new Promise(function () { /* 아무것도 안 한다 */ });
        },
      };
    },
  };
  return { 기록, deps };
}

test('★★ 낡은 연결의 끊기가 «영원히 안 끝나도» 일이 된다 — 기다리면 여기서 멈춘다', async () => {
  const MS = 새로불러오기();
  const { 기록, deps } = 자리();

  await MS.withFolder(deps, 'inbox', async () => 1);       /* 붙여서 살려 둔다 */
  assert.equal(기록.붙음, 1);

  /* 십 분을 놀린 것으로 꾸민다 → 낡아서 버리는 길로 간다 */
  const 진짜 = Date.now;
  let 끝났나 = false;
  try {
    Date.now = () => 진짜() + 10 * 60 * 1000;
    const 일 = MS.withFolder(deps, 'inbox', async () => 'ㄴ').then((v) => { 끝났나 = true; return v; });
    /* ⚠ 여기서 «기다림»을 재지 않는다 — 검사가 시간에 매달리면 느린 기계에서 흔들린다.
         대신 「끝났는가」로 본다: 기다리는 코드라면 영원히 안 끝나므로 실패한다. */
    const r = await 일;
    assert.equal(r, 'ㄴ');
    assert.equal(끝났나, true);
  } finally { Date.now = 진짜; }

  assert.equal(기록.끊자고함, 1, '★ 낡은 연결을 안 버렸습니다');
  assert.equal(기록.붙음, 2, '★ 새로 붙지 않았습니다');
});

test('★ 끊기가 «터져도» 일이 된다 — 부르는 것조차 실패할 수 있다', async () => {
  const MS = 새로불러오기();
  const 기록 = { 붙음: 0 };
  const deps = {
    getDatabase: () => ({ ref: () => ({ once: async () => ({ val: () => 'INBOX' }) }) }),
    mailUserAsync: async () => '370-6',
    mailPass: () => 'pw',
    MD: { loginIds: () => ['370-6'] },
    imapConnect: async () => {
      기록.붙음++;
      return {
        usable: true,
        async getMailboxLock() { return { release() {} }; },
        logout() { throw new Error('부르는 것조차 터졌다'); },
      };
    },
  };
  await MS.withFolder(deps, 'inbox', async () => 1);
  const 진짜 = Date.now;
  try {
    Date.now = () => 진짜() + 10 * 60 * 1000;
    assert.equal(await MS.withFolder(deps, 'inbox', async () => 'ㄷ'), 'ㄷ',
      '★ 끊기가 터지자 일까지 못 했습니다');
  } finally { Date.now = 진짜; }
  assert.equal(기록.붙음, 2);
});

test('★★ 버릴 연결의 실패를 «붙잡아 둔다» — 안 붙잡으면 그릇이 통째로 죽는다', () => {
  /* Node 에서 아무도 안 붙잡은 실패(unhandled rejection)는 그릇을 죽인다.
     버릴 연결이라 결과를 안 보지만, 실패는 «반드시» 삼켜야 한다. */
  const src = require('node:fs').readFileSync(MS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = src.indexOf('async function warmConnect');
  const seg = src.slice(i, src.indexOf('function warmDone', i));
  assert.ok(seg.indexOf('await w.client.logout()') < 0,
    '★ 아직 낡은 연결의 끊기를 «기다립니다»');
  assert.match(seg, /\.catch\(/,
    '★ 버릴 연결의 실패를 안 붙잡습니다 — 나중에 터지면 그릇이 죽습니다');
});

/* ═══ 일이 «실패해서» 연결을 버릴 때도 같다 (warmDone) ═════════════════════
   ★ 위쪽 warmConnect 를 고치고 나서 한 자리가 더 있는 것을 봤다.
     일이 실패하면 warmDone(client, false) 이 그 연결을 버리는데, 거기서도
     끊기를 기다리지 않는다 — 좋다. 그런데 «되돌아온 실패»를 안 붙잡았다.
   ⚠ try/catch 로는 못 막는다 — 그것은 «던져진 것»만 잡는다.
     logout 이 실패한 약속을 돌려주면 그냥 새어 나가고, 아무도 안 붙잡은
     실패는 그릇을 통째로 죽인다(Node 18+ 기본값). */

function 실패하는자리(logout) {
  const 기록 = { 붙음: 0 };
  const deps = {
    getDatabase: () => ({ ref: () => ({ once: async () => ({ val: () => 'INBOX' }) }) }),
    mailUserAsync: async () => '370-6',
    mailPass: () => 'pw',
    MD: { loginIds: () => ['370-6'] },
    imapConnect: async () => {
      기록.붙음++;
      return {
        usable: true,
        async getMailboxLock() { return { release() {} }; },
        logout: logout,
      };
    },
  };
  return { 기록, deps };
}

test('★★ 일이 실패해 연결을 버릴 때, 끊기가 «영원히 안 끝나도» 실패가 곧 올라온다', async () => {
  const MS = 새로불러오기();
  const { deps } = 실패하는자리(function () {
    return new Promise(function () { /* 영원히 안 끝난다 */ });
  });
  await assert.rejects(
    MS.withFolder(deps, 'inbox', async () => { throw new Error('일이 터졌다'); }),
    /일이 터졌다/,
    '★ 버릴 연결의 끊기를 기다리다 실패조차 못 올렸습니다');
});

test('★★ 그때 «아무도 안 붙잡은 실패»를 남기지 않는다 — 남기면 그릇이 죽는다', async () => {
  const MS = 새로불러오기();
  const 샌것 = [];
  const 지킴 = (e) => 샌것.push(e);
  process.on('unhandledRejection', 지킴);
  try {
    const { deps } = 실패하는자리(function () {
      return Promise.reject(new Error('끊다가 터졌다'));
    });
    await assert.rejects(
      MS.withFolder(deps, 'inbox', async () => { throw new Error('일이 터졌다'); }),
      /일이 터졌다/);
    /* ⚠ 안 붙잡은 실패는 «다음 차례»에 알려진다 — 두 번 넘겨 기다린다. */
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  } finally { process.off('unhandledRejection', 지킴); }
  assert.deepEqual(샌것.map((e) => String((e && e.message) || e)), [],
    '★ 버릴 연결의 실패가 새어 나갔습니다 — 이대로면 그릇이 통째로 죽습니다');
});

test('★ 그래도 «버린다» — 다음 일은 새로 붙는다', async () => {
  const MS = 새로불러오기();
  const { 기록, deps } = 실패하는자리(function () {
    return Promise.reject(new Error('끊다가 터졌다'));
  });
  await assert.rejects(MS.withFolder(deps, 'inbox', async () => { throw new Error('ㅁ'); }));
  await MS.withFolder(deps, 'inbox', async () => 1);
  assert.equal(기록.붙음, 2, '★ 못 쓰게 된 연결을 그대로 물려줬습니다');
});

test('★★ warmDone 도 «되돌아온 실패»를 붙잡는다 — try/catch 만으로는 못 막는다', () => {
  const src = require('node:fs').readFileSync(MS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = src.indexOf('function warmDone');
  const seg = src.slice(i, src.indexOf('async function withFolder', i));
  assert.match(seg, /\.catch\(/,
    '★ warmDone 이 버릴 연결의 실패를 안 붙잡습니다');
  assert.ok(seg.indexOf('await') < 0,
    '★ warmDone 이 끊기를 기다립니다 — 반쯤 끊긴 소켓에서 몇 분 멈춥니다');
});
