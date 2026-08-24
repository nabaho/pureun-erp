/* 다음메일함 동기화 — «한 회차를 실제로 돌려 본다».
   ═══════════════════════════════════════════════════════════════════════════
   가짜 메일함과 가짜 실시간DB를 끼워 runSync 를 돌린다. 실제 메일함에는 붙지 않는다.
   (tests/mail-run-scope.test.js 가 급여자료 회차에 쓰는 것과 같은 방식이다.)

   ⚠ 왜 글자만 보는 검사로는 모자라나 — 여기서 틀리는 것은 «창이 움직이는 방식»이다.
     문법은 멀쩡하고, 한 회차 로그도 「ok: true」로 남는다. 그런데 몇 회차 뒤에 보면
     가운데 구간 250통이 조용히 빠져 있다. 그것을 잡으려면 돌려 봐야 한다.
     2026-08-24 에 실제로 그런 구멍이 있었다(옛것 방향이 중간에 끊기면 못 받은 위쪽을
     이미 본 것으로 표시했다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const MS = require('../functions/mail-sync.js');
const MB = require('../functions/mail-box.js');

/* ── 가짜 실시간DB ──
   층을 «실제처럼» 만든다. 납작하게 담으면 mailbox/msgs/<폴더> 를 읽어도 아래에 적은
   것이 안 보여, 검사가 조용히 헛것이 된다(이 저장소에서 한 번 겪었다). */
function fakeDb() {
  const data = {};
  const get = (path) => (path ? String(path).split('/').reduce((o, k) => (o == null ? null : o[k]), data) : data);
  const put = (path, v) => {
    const ks = String(path).split('/');
    let o = data;
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
      o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v === null) delete o[last]; else o[last] = v;
  };
  const reads = [];          // once() 로 읽은 자리 — «폴더 전체를 읽었나»를 세려고 둔다
  function ref(path) {
    const p = path === undefined ? '' : String(path);
    return {
      once: async () => { reads.push(p); return { val: () => get(p) }; },
      update: async (obj) => { Object.keys(obj).forEach((k) => put(p ? p + '/' + k : k, obj[k])); },
      set: async (v) => put(p, v),
      remove: async () => put(p, null),
      child: (c) => ref(p ? p + '/' + c : c),
    };
  }
  return { ref, __data: data, __get: get, __reads: reads };
}

/* ── 가짜 메일함 ──
   IMAP 은 번호가 «작은 것부터» 온다 — 그 차례를 지켜야 「중간에 끊기면 아래쪽이
   손에 남는다」는 것이 검사에서도 재현된다. */
function fakeMail(folders, hooks) {
  const h = hooks || {};
  let opened = null;
  let fetches = 0;
  const api = {
    __fetches: () => fetches,
    async list() {
      return Object.keys(folders).map((p) => ({
        path: p, name: folders[p].name || p, flags: new Set(),
        specialUse: folders[p].specialUse || '',
      }));
    },
    async status(p) {
      const uids = Object.keys(folders[p].msgs).map(Number);
      return {
        messages: uids.length, unseen: 0,
        uidNext: (uids.length ? Math.max.apply(null, uids) : 0) + 1,
        uidValidity: folders[p].uv || 1,
      };
    },
    async getMailboxLock(p) { opened = p; return { release() {} }; },
    async *fetch(range) {
      fetches++;
      /* 「10,20,30」(낱개) 과 「10:30」(구간) 둘 다 받는다 — 실제 IMAP 과 같게 */
      const want = {};
      String(range).split(',').forEach((part) => {
        if (part.indexOf(':') >= 0) {
          const [a, b] = part.split(':').map(Number);
          for (const k of Object.keys(folders[opened].msgs)) {
            const u = Number(k);
            if (u >= a && u <= b) want[u] = 1;
          }
        } else if (part) { want[Number(part)] = 1; }
      });
      const uids = Object.keys(folders[opened].msgs).map(Number)
        .filter((u) => want[u]).sort((a, b) => a - b);
      let i = 0;
      for (const u of uids) {
        i++;
        if (h.breakAt && h.breakAt(fetches, i)) throw new Error('가짜 끊김');
        yield { uid: u, flags: new Set(), size: 1000, envelope: folders[opened].msgs[u] };
      }
    },
    async search() { return Object.keys(folders[opened].msgs).map(Number); },
    async messageFlagsAdd() {},
    async logout() {},
  };
  return api;
}

function envelope(i) {
  return { from: [{ name: '보낸이' + i, address: 's' + i + '@x.com' }],
           to: [{ address: '370-6@daum.net' }], subject: '제목 ' + i,
           date: new Date(1756000000000 + i * 1000).toISOString() };
}
function box(n, first) {
  const msgs = {};
  const start = first || 1;
  for (let i = 0; i < n; i++) msgs[String(start + i)] = envelope(start + i);
  return { msgs: msgs };
}
/* 실제 대표 계정처럼 «흩어진» 번호 — 계정 전체에서 하나씩 매겨져 17만번대까지 가 있고
   폴더 하나에는 그 가운데 몇백 개만 있다(실측 2026-08-24). */
function sparseBox(n, top, gap) {
  const msgs = {};
  for (let i = 0; i < n; i++) msgs[String(top - i * gap)] = envelope(i);
  return { msgs: msgs };
}

function deps(db) {
  return {
    getDatabase: () => db,
    getAuth: () => ({}),
    MD: { loginIds: () => ['370-6'] },
    MAIL_REGION: 'asia-northeast3',
    setCors: () => {},
    requireStaff: async () => ({ uid: 'u' }),
    mailUserAsync: async () => '370-6@daum.net',
    mailPass: () => 'pw',
    functions: { region: () => ({ runWith: () => ({ pubsub: { schedule: () => ({ timeZone: () => ({ onRun: () => null }) }) }, https: { onRequest: () => null } }) }) },
  };
}

const uidsIn = (db, path) => Object.keys(db.__get(MS.ROOT + '/msgs/' + path) || {}).map(Number).sort((a, b) => a - b);
const slug = (p) => MB.slugOf(p);

/* ══════ 한 회차에 다 가져온다 ══════ */

test('★ 한 뭉치보다 많아도 한 회차에 다 가져온다 — 예산이 남으면 몇 바퀴 돈다', async () => {
  const folders = { INBOX: box(950) };
  const db = fakeDb();
  const r = await MS.runSync(deps(db), { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(r.ok, true, r.err);
  const got = uidsIn(db, slug('INBOX'));
  assert.equal(got.length, 950, '가져온 통수가 다르다 — 빠진 구간이 있다');
  assert.equal(got[0], 1);
  assert.equal(got[got.length - 1], 950);
  assert.ok(r.turns > 1, '한 바퀴만 돌았다 — 예산이 남는데 멈췄다');
});

test('★ 다 찬 폴더는 «끝났다»고 적는다 — 안 적으면 셈이 거짓이 되고 정리가 안 돈다', async () => {
  const folders = { INBOX: box(120) };
  const db = fakeDb();
  const r = await MS.runSync(deps(db), { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(r.ready, 1, '다 찼는데 「기다리는 폴더」로 세고 있다');
  assert.equal(r.waiting, 0);
  assert.equal(db.__get(MS.ROOT + '/sync/' + slug('INBOX')).done, true);
});

test('★ 가져올 것이 «없는» 바퀴에도 표시를 적는다 — 실제로 이 자리에서 done 이 안 적혔다', async () => {
  /* 2026-08-24 실측: INBOX 가 400/400 인데 done 이 false 로 남아 「기다리는 폴더 33개」로
     세어지고, 정리(지워진 메일 빼기)가 한 번도 돌지 않았다. 앞 회차가 다 가져온 뒤
     끝났을 때 그렇게 된다 — 다음 회차의 첫 바퀴는 «가져올 것이 없는» 바퀴다. */
  const folders = { INBOX: box(120) };
  const db = fakeDb();
  const d = deps(db);
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  /* 앞 회차가 표시를 못 적고 끝난 상태를 손으로 만든다 */
  await db.ref(MS.ROOT + '/sync/' + slug('INBOX')).update({ done: false });
  const r = await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(db.__get(MS.ROOT + '/sync/' + slug('INBOX')).done, true,
    '가져올 것이 없는 바퀴가 표시를 안 적었다 — 이 폴더는 영원히 「기다리는」 상태로 남는다');
  assert.equal(r.ready, 1);
});

test('★ 번호가 하나도 빠지지 않는다 — 가운데가 조용히 비는 것이 가장 무섭다', async () => {
  const folders = { INBOX: box(1230) };
  const db = fakeDb();
  await MS.runSync(deps(db), { client: fakeMail(folders), deadlineMs: 60000 });
  const got = uidsIn(db, slug('INBOX'));
  const missing = [];
  for (let u = 1; u <= 1230; u++) if (got.indexOf(u) < 0) missing.push(u);
  assert.deepEqual(missing, [], '빠진 번호: ' + missing.slice(0, 10).join(',') + ' …');
});

test('폴더가 여럿이면 돌려 세운다 — 앞 폴더만 채우고 뒤는 0통이면 안 된다', async () => {
  const folders = {
    INBOX: box(900),
    '보낸메일함': Object.assign(box(900), { specialUse: '\\Sent' }),
    'INBOX.1.자문사답변': box(500),
  };
  const db = fakeDb();
  const r = await MS.runSync(deps(db), { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(r.ok, true, r.err);
  assert.equal(uidsIn(db, slug('INBOX')).length, 900);
  assert.equal(uidsIn(db, slug('보낸메일함')).length, 900);
  assert.equal(uidsIn(db, slug('INBOX.1.자문사답변')).length, 500);
});

test('★ 번호가 17만번대에 흩어져 있어도 한 회차에 다 가져온다 — 실제 계정이 그렇다', () => {
  /* 2026-08-24 실측: 33개 폴더가 번호를 171,876번까지 나눠 쓰고 있었다. 훑어 내려가는
     방식으로는 폴더 하나에 430바퀴가 걸렸다(빈 구간을 계속 열었다). */
  const folders = { INBOX: sparseBox(400, 171876, 37) };
  const db = fakeDb();
  return MS.runSync(deps(db), { client: fakeMail(folders), deadlineMs: 60000 }).then((r) => {
    assert.equal(r.ok, true, r.err);
    assert.equal(uidsIn(db, slug('INBOX')).length, 400, '흩어진 번호를 다 못 가져왔다');
    assert.ok(r.turns <= 5, '바퀴가 ' + r.turns + '번이나 걸렸다 — 빈 구간을 열고 있다');
  });
});

test('★ 없는 번호를 달라고 하지 않는다 — 목록에 있는 것만 고른다', async () => {
  const folders = { INBOX: sparseBox(50, 100000, 1000) };
  const db = fakeDb();
  const asked = [];
  const client = fakeMail(folders);
  const realFetch = client.fetch;
  client.fetch = function (range, q, o) { asked.push(String(range)); return realFetch.call(client, range, q, o); };
  await MS.runSync(deps(db), { client: client, deadlineMs: 60000 });
  const live = Object.keys(folders.INBOX.msgs);
  asked.forEach((set) => {
    String(set).split(',').forEach((u) => {
      assert.ok(live.indexOf(u) >= 0, '없는 번호 ' + u + ' 를 달라고 했다');
    });
  });
  assert.ok(asked.length > 0, '아무것도 안 가져왔다');
});

/* ══════ 중간에 끊겼을 때 ══════ */

test('★ 옛것을 받다 끊기면 못 받은 위쪽을 건너뛰지 않는다 — 이 구멍을 2026-08-24 에 막았다', async () => {
  /* 첫 바퀴(새것 방향)는 온전히 받고, 둘째 fetch(옛것 방향)를 100통째에서 끊는다.
     표시를 그때 옮겨 버리면 그 구간의 «위쪽»이 영원히 안 온다. */
  const folders = { INBOX: box(1000) };
  const db = fakeDb();
  const client = fakeMail(folders, { breakAt: (call, i) => call === 2 && i === 100 });
  const r = await MS.runSync(deps(db), { client: client, deadlineMs: 60000 });
  assert.equal(r.ok, true, r.err);
  const got = uidsIn(db, slug('INBOX'));
  const missing = [];
  for (let u = 1; u <= 1000; u++) if (got.indexOf(u) < 0) missing.push(u);
  assert.deepEqual(missing, [],
    '끊긴 구간의 위쪽이 빠졌다(' + missing.length + '통) — 표시를 옮기면 안 되는 자리다');
});

/* ══════ 폴더 목록 ══════ */

test('★ 폴더 목록을 먼저 적는다 — 「아무것도 안 보인다」와 「목록만 비었다」는 다른 이야기다', async () => {
  const folders = { INBOX: box(3), '휴지통': box(2) };
  const db = fakeDb();
  await MS.runSync(deps(db), { client: fakeMail(folders), deadlineMs: 60000 });
  const rec = db.__get(MS.ROOT + '/folders/' + slug('INBOX'));
  assert.ok(rec, '폴더가 안 적혔다');
  assert.equal(rec.path, 'INBOX');
  assert.equal(rec.kind, 'inbox');
  assert.equal(rec.total, 3);
  assert.equal(db.__get(MS.ROOT + '/folders/' + slug('휴지통')).kind, 'trash');
});

test('회차 기록(meta)을 남긴다 — 언제 것인지 화면에 보여 줘야 한다', async () => {
  const db = fakeDb();
  await MS.runSync(deps(db), { client: fakeMail({ INBOX: box(5) }), deadlineMs: 60000 });
  const meta = db.__get(MS.ROOT + '/meta');
  assert.equal(meta.ok, true);
  assert.ok(meta.at > 0);
  assert.equal(meta.folders, 1);
});

/* ══════ 지워진 메일 정리 ══════ */

test('★ 다음메일에서 지운 것은 우리 목록에서도 뺀다 — 거울에 없는 것이 남으면 안 된다', async () => {
  const folders = { INBOX: box(10) };
  const db = fakeDb();
  const d = deps(db);
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(uidsIn(db, slug('INBOX')).length, 10);

  /* 다음메일에서 셋을 지웠다. 마지막 정리 때를 옛날로 돌려 놓는다(6시간 간격 규칙). */
  delete folders.INBOX.msgs['4'];
  delete folders.INBOX.msgs['5'];
  delete folders.INBOX.msgs['6'];
  await db.ref(MS.ROOT + '/sync/' + slug('INBOX')).update({ prunedAt: 0 });

  const r = await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(r.removed, 3, '지워진 것을 안 뺐다');
  assert.deepEqual(uidsIn(db, slug('INBOX')), [1, 2, 3, 7, 8, 9, 10]);
});

test('지워진 것이 없으면 폴더를 열어 보지 않는다 — 회차마다 전체를 읽으면 그것이 요금이다', async () => {
  const folders = { INBOX: box(10) };
  const db = fakeDb();
  const d = deps(db);
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  await db.ref(MS.ROOT + '/sync/' + slug('INBOX')).update({ prunedAt: 0 });
  const r = await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(r.removed, 0);
});

/* 폴더 전체를 몇 번 읽었나 — 이것이 곧 요금이다 */
const fullReads = (db, path) => db.__reads.filter((p) => p === MS.ROOT + '/msgs/' + path).length;

test('★ 통수가 그대로면 폴더를 다시 읽지 않는다 — 예전엔 회차마다 읽었다(요금)', async () => {
  /* 예전 판정은 「셈(n) != 살아 있는 통수」였다. n 은 «적은 줄 수»라 새 메일이 오고 가는
     사이 조금씩 어긋나(실측 7,379 vs 7,376) 판정이 늘 참이 되었고, 회차마다 폴더
     하나를 통째로 읽었다. */
  const folders = { INBOX: box(10) };
  const db = fakeDb();
  const d = deps(db);
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });   // 첫 회차 — 정리도 한 번 돈다
  const before = fullReads(db, slug('INBOX'));
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(fullReads(db, slug('INBOX')), before,
    '바뀐 것이 없는데 폴더를 또 읽었다 — 회차마다 이러면 그것이 요금이다');
});

test('★ 통수가 줄면 그 자리에서 정리한다 — 하루를 기다리지 않는다', async () => {
  const folders = { INBOX: box(10) };
  const db = fakeDb();
  const d = deps(db);
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  const before = fullReads(db, slug('INBOX'));
  delete folders.INBOX.msgs['5'];          // 다음메일에서 한 통 지웠다
  const r = await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.ok(fullReads(db, slug('INBOX')) > before, '통수가 줄었는데 폴더를 안 읽었다');
  assert.equal(r.removed, 1);
  assert.equal(uidsIn(db, slug('INBOX')).indexOf(5), -1, '지운 메일이 목록에 남아 있다');
});

/* ══════ 번호가 다시 매겨졌을 때 ══════ */

test('★ 서버가 번호를 다시 매기면 옛 목록을 버린다 — 같은 번호가 다른 메일을 가리킨다', async () => {
  const folders = { INBOX: box(20) };
  const db = fakeDb();
  const d = deps(db);
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.equal(uidsIn(db, slug('INBOX')).length, 20);

  folders.INBOX = box(5, 100);      // 번호가 100번대로 다시 매겨졌다
  folders.INBOX.uv = 99;
  await MS.runSync(d, { client: fakeMail(folders), deadlineMs: 60000 });
  assert.deepEqual(uidsIn(db, slug('INBOX')), [100, 101, 102, 103, 104],
    '옛 번호가 남아 있다 — 없는 메일이 목록에 보인다');
});

/* ══════ 붙지 못했을 때 ══════ */

test('메일 계정이 없으면 조용히 실패한다 — 앱에는 까닭이 간다', async () => {
  const db = fakeDb();
  const d = deps(db);
  d.mailUserAsync = async () => '';
  const r = await MS.runSync(d, { client: fakeMail({ INBOX: box(1) }), deadlineMs: 60000 });
  assert.equal(r.ok, false);
  assert.match(r.error, /메일 계정/);
});

test('한 폴더를 못 열어도 나머지는 가져온다 — 하나 때문에 회차가 통째로 죽지 않는다', async () => {
  const folders = { INBOX: box(5), '깨진폴더': box(5) };
  const db = fakeDb();
  const client = fakeMail(folders);
  const realStatus = client.status;
  client.status = async (p) => {
    if (p === '깨진폴더') throw new Error('못 엽니다');
    return realStatus(p);
  };
  const r = await MS.runSync(deps(db), { client: client, deadlineMs: 60000 });
  assert.equal(r.ok, true, r.err);
  assert.equal(r.folders, 1);
  assert.equal(uidsIn(db, slug('INBOX')).length, 5);
});
