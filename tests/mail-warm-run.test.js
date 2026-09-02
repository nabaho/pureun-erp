'use strict';
/* 붙어 둔 IMAP 연결 다시 쓰기 — «글자가 아니라 돌려 본다»
   ═══════════════════════════════════════════════════════════════════════════
   tests/mail-warm-conn.test.js 는 소스를 글자로 본다. 그것으로는 모자란다는 것이
   2026-09-02 검토에서 드러났다 — 코드를 일부러 망가뜨려 보니 일곱 가운데 둘이
   «아무것도 안 잡았다».

     · busy 를 «영원히 안 풀게» 바꿔도 → 일곱 다 통과
     · 낡음 한도(WARM_IDLE_MS)를 «아홉 시간»으로 바꿔도 → 일곱 다 통과

   둘 다 «조용히» 망가지는 종류다. 오류가 안 난다 —
     busy 가 안 풀리면 메일 한 통을 연 뒤로 다시 쓰기가 «영원히» 안 되고,
     한도가 길면 죽은 연결을 다음 사람에게 물려준다.
   이 기능이 막으려던 것이 바로 그 둘이다. 그래서 여기서는 돌려 본다.

   ⚠ 붙어 둔 것은 모듈 자리(_warm)에 산다 — 회마다 require 를 새로 해서
     깨끗한 자리에서 시작한다(안 그러면 앞 검사가 남긴 연결을 물려받는다).
   ⚠ 진짜 다음메일에는 안 붙는다 — deps.imapConnect 로 가짜를 끼운다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MS_PATH = path.join(__dirname, '..', 'functions', 'mail-sync.js');

/* 회마다 깨끗한 자리 */
function 새로불러오기() {
  delete require.cache[require.resolve(MS_PATH)];
  return require(MS_PATH);
}

/* 가짜 메일함 하나 — 살아 있나(usable), 폴더 열기, 끊기만 있으면 된다 */
function 가짜(기록, 옵션) {
  const o = 옵션 || {};
  return {
    usable: true,
    _id: ++기록.붙음,
    async getMailboxLock() {
      기록.연다++;
      if (o.잠금실패) throw new Error('가짜 폴더 열기 실패');
      return { release() { 기록.놓는다++; } };
    },
    async logout() { 기록.끊음++; this.usable = false; },
  };
}

function 자리(옵션) {
  const 기록 = { 붙음: 0, 끊음: 0, 연다: 0, 놓는다: 0 };
  const deps = {
    getDatabase: () => ({ ref: () => ({ once: async () => ({ val: () => 'INBOX' }) }) }),
    mailUserAsync: async () => '370-6',
    mailPass: () => 'pw',
    MD: { loginIds: () => ['370-6'] },
    imapConnect: async () => 가짜(기록, 옵션 || {}),
  };
  return { 기록, deps };
}

/* ══════ ① 다시 쓴다 ══════ */
test('★★ 두 번 열면 «한 번만» 붙는다 — 이 기능의 전부다', async () => {
  const MS = 새로불러오기();
  const { 기록, deps } = 자리();
  const a = await MS.withFolder(deps, 'inbox', async () => 'ㄱ');
  const b = await MS.withFolder(deps, 'inbox', async () => 'ㄴ');
  assert.equal(a, 'ㄱ');
  assert.equal(b, 'ㄴ');
  assert.equal(기록.붙음, 1,
    '★ ' + 기록.붙음 + '번 붙었습니다 — 붙어 둔 것을 안 물려줍니다(이 기능이 죽었습니다)');
  assert.equal(기록.연다, 2, '폴더는 두 번 열어야 합니다');
  assert.equal(기록.놓는다, 2, '★ 폴더 잠금을 안 놓았습니다 — 다음 사람이 막힙니다');
  assert.equal(기록.끊음, 0, '★ 살려 둘 것을 끊었습니다 — 다시 쓸 것이 없어집니다');
});

/* ══════ ② busy 를 «푼다» — 되돌리기에서 안 잡히던 자리 ══════ */
test('★★ 일이 끝나면 «쓰는 중» 표시를 푼다 — 안 풀면 다시 쓰기가 영원히 죽는다', async () => {
  /* ⚠ 이것이 글자 검사가 못 잡던 바로 그 결이다. busy 가 남으면 둘째 부름이
       빌려 쓰지 못하고 새로 붙는다 — 오류는 안 나고 느려지기만 한다.
       위 ①이 이미 그것을 잡지만, «왜» 그런지를 여기서 한 번 더 못 박는다:
       세 번을 이어 열어도 한 번만 붙어야 한다. */
  const MS = 새로불러오기();
  const { 기록, deps } = 자리();
  for (let k = 0; k < 3; k++) await MS.withFolder(deps, 'inbox', async () => k);
  assert.equal(기록.붙음, 1,
    '★ 세 번 열었더니 ' + 기록.붙음 + '번 붙었습니다 — 쓰는 중 표시가 안 풀립니다');
});

/* ══════ ③ 오래 놀린 것은 버린다 — 되돌리기에서 안 잡히던 자리 ══════ */
test('★★ «오래 놀린» 연결은 버리고 새로 붙는다 — 죽은 것을 물려주면 더 나쁘다', async () => {
  /* ⚠ 한도를 아홉 시간으로 바꿔도 글자 검사는 통과했다. 시간을 꾸며 돌려 본다. */
  const MS = 새로불러오기();
  const { 기록, deps } = 자리();
  await MS.withFolder(deps, 'inbox', async () => 1);
  assert.equal(기록.붙음, 1);

  const 진짜 = Date.now;
  try {
    Date.now = () => 진짜() + 10 * 60 * 1000;      /* 십 분 뒤 */
    await MS.withFolder(deps, 'inbox', async () => 2);
  } finally { Date.now = 진짜; }

  assert.equal(기록.붙음, 2,
    '★ 십 분을 놀린 연결을 그대로 물려줍니다 — 다음메일이 조용히 끊어 두어도 모릅니다');
  assert.equal(기록.끊음, 1, '★ 버릴 것을 안 끊었습니다 — 연결이 새 나갑니다');
});

test('★ 아직 «싱싱한» 것은 안 버린다 — 너무 짧게 잡으면 이 기능이 뜻을 잃는다', async () => {
  const MS = 새로불러오기();
  const { 기록, deps } = 자리();
  await MS.withFolder(deps, 'inbox', async () => 1);
  const 진짜 = Date.now;
  try {
    Date.now = () => 진짜() + 30 * 1000;           /* 삼십 초 뒤 */
    await MS.withFolder(deps, 'inbox', async () => 2);
  } finally { Date.now = 진짜; }
  assert.equal(기록.붙음, 1, '★ 삼십 초 놀린 것까지 버립니다 — 그러면 안 만든 것과 같습니다');
});

/* ══════ ④ 죽은 것을 물려받았을 때 ══════ */
test('★★ 물려받은 것이 «죽어» 있으면 한 번 새로 붙어 다시 해서 «끝내 해낸다»', async () => {
  /* 실제로 늘 있는 일 — 다음메일이 조용히 끊어 두면 usable 은 참인 채로 남고,
     물려받아 «쓰려는 순간» 터진다. 그때 사람에게 실패를 내밀면 안 된다.
     ⚠ 첫 연결만, 그것도 «두 번째로 쓸 때» 터지게 꾸민다 — 그것이 이 상황이다. */
  const MS = 새로불러오기();
  const 기록 = { 붙음: 0, 끊음: 0, 연다: 0, 놓는다: 0 };
  const deps = {
    getDatabase: () => ({ ref: () => ({ once: async () => ({ val: () => 'INBOX' }) }) }),
    mailUserAsync: async () => '370-6',
    mailPass: () => 'pw',
    MD: { loginIds: () => ['370-6'] },
    imapConnect: async () => {
      기록.붙음++;
      const 첫연결 = (기록.붙음 === 1);
      let 쓴횟수 = 0;
      return {
        usable: true,
        async getMailboxLock() {
          기록.연다++; 쓴횟수++;
          if (첫연결 && 쓴횟수 === 2) throw new Error('물려받은 뒤 죽어 있었다');
          return { release() { 기록.놓는다++; } };
        },
        async logout() { 기록.끊음++; this.usable = false; },
      };
    },
  };
  await MS.withFolder(deps, 'inbox', async () => 1);      /* 잘 되고 살려 둔다 */
  assert.equal(기록.붙음, 1);

  const r = await MS.withFolder(deps, 'inbox', async () => 'ㄷ');
  assert.equal(r, 'ㄷ', '★ 죽은 연결 하나에 그대로 실패했습니다 — 사람에게 실패가 갑니다');
  assert.equal(기록.붙음, 2, '★ 새로 붙어 다시 해 보지 않았습니다 (붙음 ' + 기록.붙음 + ')');
  assert.equal(기록.끊음, 1, '★ 죽은 연결을 안 끊었습니다 — 연결이 새 나갑니다');
});

/* ══════ ⑤ 진짜로 실패하면 «실패로 올린다» ══════ */
test('★★ 새로 붙어서도 실패하면 «실패로 올린다» — 영원히 되풀이하지 않는다', async () => {
  const MS = 새로불러오기();
  const { 기록, deps } = 자리({ 잠금실패: true });
  await assert.rejects(
    () => MS.withFolder(deps, 'inbox', async () => 1),
    /가짜 폴더 열기 실패/,
    '★ 실패를 안 올립니다 — 부른 쪽이 잘된 줄 압니다'
  );
  assert.ok(기록.붙음 <= 2,
    '★ ' + 기록.붙음 + '번 붙었습니다 — 두 번까지만 해야 합니다(영원히 도는 것을 막는다)');
  assert.equal(기록.끊음, 기록.붙음, '★ 실패한 연결을 안 끊었습니다 — 연결이 새 나갑니다');
});

/* ══════ ⑥ 실패한 것을 다음 사람에게 물려주지 않는다 ══════ */
test('★★ 실패한 연결은 «버린다» — 다음 부름이 그것을 물려받으면 안 된다', async () => {
  const MS = 새로불러오기();
  const 기록 = { 붙음: 0, 끊음: 0, 연다: 0, 놓는다: 0 };
  const deps = {
    getDatabase: () => ({ ref: () => ({ once: async () => ({ val: () => 'INBOX' }) }) }),
    mailUserAsync: async () => '370-6',
    mailPass: () => 'pw',
    MD: { loginIds: () => ['370-6'] },
    imapConnect: async () => {
      기록.붙음++;
      return {
        usable: true,
        async getMailboxLock() { 기록.연다++; return { release() { 기록.놓는다++; } }; },
        async logout() { 기록.끊음++; this.usable = false; },
      };
    },
  };
  /* 하는 일 자체가 터진다 — 연결은 멀쩡하지만 결과는 실패다 */
  await assert.rejects(() => MS.withFolder(deps, 'inbox', async () => { throw new Error('일이 터졌다'); }));
  const 붙음1 = 기록.붙음;
  await MS.withFolder(deps, 'inbox', async () => 'ㄹ');
  assert.ok(기록.붙음 > 붙음1,
    '★ 실패한 연결을 그대로 물려줍니다 — 다음 사람이 그 위에서 또 실패합니다');
});
