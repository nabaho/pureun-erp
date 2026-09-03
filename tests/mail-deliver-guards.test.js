'use strict';
/* 자료 메일 보내기 — 세 가지 지킴이 (2026-09-03 검토)
   ═══════════════════════════════════════════════════════════════════════════
   ⚠ 셋 다 «주석에는 적혀 있는데 실제로는 안 지켜지던» 것이다. 글자로 보는 검사로는
     그런 것을 못 잡는다 — 그래서 여기서는 deliver 를 «실제로 돌린다».

   ① 첨부 합계 한도가 «창고를 거쳐 온 파일»에도 걸리는가
      2026-08-31 에 큰 파일을 창고로 우회하는 길을 냈는데 저울을 안 달았다.
      collectAttachments 가 bytes 를 안 붙여, 합계가 0 으로 보였다
      (실측: 15MB 두 개가 18MB 한도를 그대로 통과했다).

   ② 「한명씩 발송」 도중 자격 오류가 나면 앞의 것을 다시 보내는가
      실측: 3명 중 두 번째에서 535 가 나자 다음 아이디로 «처음부터» 다시 돌아
      앞의 두 명이 편지를 두 번 받았다. 그런데 앱은 「3통 보냈다」로 알렸다.

   ③ 보내기가 실패하면 창고 임시 파일이 남는가
      치우는 줄이 성공한 길에만 있었다. 실패로 빠지는 길 넷이 다 안 치웠다.
      ⚠ 그렇다고 «실패하자마자» 치우면 안 된다 — 화면은 다시 보낼 때 같은 자리를
        그대로 쓴다. 그래서 «하루 지난 것»만 치우는지까지 본다.

   ⚠ nodemailer 는 CI 에 없다(functions 의 짐을 설치하지 않는다).
     그래서 가짜 발송기를 opts.nodemailer 로 꽂는다 — 그 자리가 없으면
     이 검사는 한 줄도 못 돈다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const F = path.join(__dirname, '..', 'functions');
const MD = require(path.join(F, 'mail-deliver.js'));
const MS = require(path.join(F, 'mail-send.js'));

const MB = 1024 * 1024;
const 하루 = 24 * 60 * 60 * 1000;

/* ── 가짜 창고 ── 크기를 묻고, 내려받고, 훑고, 지운다. 무엇이 불렸는지 다 센다. */
function 창고(파일들) {
  const 기록 = { 내려받음: [], 지움: [], 훑음: 0 };
  const 만들기 = (name) => {
    const it = 파일들[name] || {};
    return {
      name: name,
      metadata: it.meta || {},
      getMetadata: async () => [it.meta || {}],
      download: async () => { 기록.내려받음.push(name); return [Buffer.alloc(it.size || 0)]; },
      delete: async () => { 기록.지움.push(name); },
    };
  };
  const deps = { getStorage: () => ({ bucket: () => ({
    file: (p) => 만들기(String(p)),
    getFiles: async () => { 기록.훑음++; return [Object.keys(파일들).map(만들기)]; },
  }) }) };
  return { 기록, deps };
}

const db = { ref: () => ({ once: async () => ({ val: () => null }), push: async () => ({}) }) };
const 때 = (전) => new Date(Date.now() - 전).toISOString();

/* 가짜 발송기. 던지면 «안 나간 것»이다 — 시도와 배달을 갈라 센다.
   ⚠ 이 둘을 뭉개면 「누가 두 번 받았나」를 못 읽는다. */
function 발송기(터질때) {
  const 시도 = [], 나감 = [];
  const nodemailer = { createTransport: (cfg) => ({
    sendMail: async (m) => {
      const 줄 = cfg.auth.user + ' → ' + m.to;
      시도.push(줄);
      const e = 터질때 && 터질때(cfg.auth.user, 시도);
      if (e) throw e;
      나감.push(줄);
    },
  }) };
  return { 시도, 나감, nodemailer };
}
function 몇번씩(목록) {
  const c = {};
  목록.forEach((x) => { const t = x.split(' → ')[1]; c[t] = (c[t] || 0) + 1; });
  return c;
}
/* archiveSent 는 CI 에서 mail-composer 를 못 찾아 경고를 낸다 — 검사 눈에 거슬려 삼킨다 */
async function 조용히(fn) {
  const w = console.warn; console.warn = () => {};
  try { return await fn(); } finally { console.warn = w; }
}

const 편지 = { to: 'a@x.kr', subject: '자료 보냅니다', body: '보냅니다' };
const 보냄 = { from: 'me@daum.net', pass: 'pw' };

/* ══════════ ① 첨부 합계 ══════════ */

test('★★ 창고를 거쳐 온 첨부에도 «합계» 한도가 걸린다', async () => {
  const { 기록, deps } = 창고({
    'pucards/mailout/u1/a': { size: 15 * MB, meta: { size: 15 * MB, timeCreated: 때(0) } },
    'pucards/mailout/u1/b': { size: 15 * MB, meta: { size: 15 * MB, timeCreated: 때(0) } },
  });
  const r = await 조용히(() => MD.deliver(Object.assign({ db, deps, uid: 'u1',
    body: Object.assign({}, 편지, { files: [
      { path: 'pucards/mailout/u1/a', name: 'a.pdf' },
      { path: 'pucards/mailout/u1/b', name: 'b.pdf' }] }),
    nodemailer: 발송기().nodemailer }, 보냄)));
  assert.equal(r.ok, false, '★ 30MB 가 그대로 나갔습니다 — 합계 한도가 없는 것과 같습니다');
  assert.match(r.error, /첨부가 너무 큽니다/);
  assert.match(r.error, /30\.0MB/, '★ 실제 크기를 말해 주지 않습니다');
});

test('★★ 한도를 넘는 것은 «내려받기 전»에 멈춘다 — 512MB 그릇에 다 끌어오면 늦다', async () => {
  const 파일들 = {};
  for (let i = 0; i < 10; i++) {
    파일들['pucards/mailout/u1/f' + i] = { size: 15 * MB, meta: { size: 15 * MB, timeCreated: 때(0) } };
  }
  const { 기록, deps } = 창고(파일들);
  await 조용히(() => MD.deliver(Object.assign({ db, deps, uid: 'u1',
    body: Object.assign({}, 편지, { files: Object.keys(파일들).map((p, i) => ({ path: p, name: 'f' + i })) }),
    nodemailer: 발송기().nodemailer }, 보냄)));
  /* 18MB 한도 → 15MB 한 개는 받고, 두 번째에서 멈춘다. 열 개를 다 받으면 150MB 다. */
  assert.ok(기록.내려받음.length <= 2,
    '★ 한도를 넘는데도 ' + 기록.내려받음.length + '개를 다 끌어왔습니다');
});

test('★★ 창고 첨부에 bytes 를 «단다» — 안 달면 mail-send 의 합계가 0 으로 보인다', async () => {
  const { deps } = 창고({ 'pucards/mailout/u1/a': { size: 3 * MB, meta: { size: 3 * MB } } });
  const got = await MD.collectAttachments(db,
    { files: [{ path: 'pucards/mailout/u1/a', name: 'a.pdf' }] }, deps, 'u1');
  assert.equal(got.attachments.length, 1);
  assert.equal(got.attachments[0].bytes, 3 * MB, '★ 저울이 안 달렸습니다');
  /* 그 모양 그대로 mail-send 에 넣으면 합계가 제대로 보여야 한다 */
  const v = MS.validateSend(Object.assign({}, 편지, { attachments: got.attachments }));
  assert.equal(v.bytes, 3 * MB, '★ mail-send 가 크기를 못 봅니다 — 보낸함 사본 건너뛰기도 함께 뚫립니다');
});

test('★ 파일 한 개가 한 개 한도를 넘으면 «조용히 빼지 않고» 알린다', async () => {
  const 큰 = MD.MAILOUT_MAX + 1;
  const { deps } = 창고({ 'pucards/mailout/u1/a': { size: 큰, meta: { size: 큰 } } });
  const got = await MD.collectAttachments(db,
    { files: [{ path: 'pucards/mailout/u1/a', name: 'a.pdf' }] }, deps, 'u1');
  assert.ok(got.tooBig > 0, '★ 첨부가 빠진 채로 메일이 나갑니다 — 받는 쪽은 그걸 모릅니다');
  assert.equal(got.attachments.length, 0);
});

test('★ 넉넉하면 예전처럼 그대로 나간다 — 고치면서 막아 버리면 안 된다', async () => {
  const { deps } = 창고({ 'pucards/mailout/u1/a': { size: 2 * MB, meta: { size: 2 * MB, timeCreated: 때(0) } } });
  const g = 발송기();
  const r = await 조용히(() => MD.deliver(Object.assign({ db, deps, uid: 'u1',
    body: Object.assign({}, 편지, { files: [{ path: 'pucards/mailout/u1/a', name: 'a.pdf' }] }),
    nodemailer: g.nodemailer }, 보냄)));
  assert.equal(r.ok, true, '★ 멀쩡한 첨부가 막혔습니다');
  assert.equal(r.files, 1);
  assert.equal(g.나감.length, 1);
});

/* ══════════ ② 되풀이 발송 ══════════ */

test('★★ 「한명씩」 도중 자격 오류 — 앞의 사람이 «두 번 받지 않는다»', async () => {
  /* 첫 아이디로 두 번째 통을 보낼 때 535. 다음 아이디로 넘어간다. */
  const g = 발송기((id, 시도) => {
    if (id === 'me' && 시도.filter((x) => x.startsWith('me →')).length === 2) {
      const e = new Error('535 인증 실패'); e.code = 'EAUTH'; return e;
    }
    return null;
  });
  const r = await 조용히(() => MD.deliver(Object.assign({ db,
    body: { to: 'a@x.kr,b@x.kr,c@x.kr', subject: '자료', body: '보냅니다', oneByOne: true },
    nodemailer: g.nodemailer }, 보냄)));
  assert.equal(r.ok, true);
  const 셈 = 몇번씩(g.나감);
  assert.deepEqual(셈, { 'a@x.kr': 1, 'b@x.kr': 1, 'c@x.kr': 1 },
    '★ 같은 사람에게 두 번 갔습니다: ' + JSON.stringify(셈));
  assert.equal(g.나감.length, 3, '★ 세 통이어야 합니다 (실제 ' + g.나감.length + '통)');
});

test('★ 그러면서 «남은 사람은 받는다» — 멈춰 버리면 그것도 잘못이다', async () => {
  const g = 발송기((id, 시도) => {
    if (id === 'me' && 시도.length === 1) { const e = new Error('535'); e.code = 'EAUTH'; return e; }
    return null;
  });
  await 조용히(() => MD.deliver(Object.assign({ db,
    body: { to: 'a@x.kr,b@x.kr', subject: '자료', body: '보냅니다', oneByOne: true },
    nodemailer: g.nodemailer }, 보냄)));
  assert.deepEqual(몇번씩(g.나감), { 'a@x.kr': 1, 'b@x.kr': 1 });
});

test('★★ 몇 통은 나갔는데 실패로 끝나면 «그 사실을 알린다»', async () => {
  /* 자격 오류가 아닌 실패 — 다시 하지 않고 끝난다. 그때 이미 나간 것이 있다. */
  const g = 발송기((id, 시도) => {
    if (시도.length === 2) { const e = new Error('연결이 끊겼습니다'); e.code = 'ECONNRESET'; return e; }
    return null;
  });
  const r = await 조용히(() => MD.deliver(Object.assign({ db,
    body: { to: 'a@x.kr,b@x.kr,c@x.kr', subject: '자료', body: '보냅니다', oneByOne: true },
    nodemailer: g.nodemailer }, 보냄)));
  assert.equal(r.ok, false);
  assert.equal(r.sent, 1, '★ 몇 통 나갔는지 안 알려 줍니다');
  assert.match(r.error, /1통은 이미 나갔습니다/,
    '★ 그대로 다시 누르면 그분이 두 번 받는데, 그 말을 안 해 줍니다');
});

/* ══════════ ③ 묵은 임시 파일 ══════════ */

test('★★ 보내기가 실패해도 묵은 임시 파일을 치운다 — 성공한 길에만 있었다', async () => {
  const { 기록, deps } = 창고({
    'pucards/mailout/u1/old': { size: 10, meta: { size: 10, timeCreated: 때(하루 + 60000) } },
  });
  const r = await 조용히(() => MD.deliver(Object.assign({ db, deps, uid: 'u1',
    body: { to: 'a@x.kr', subject: '', body: '보냅니다' },   /* 제목이 비어 막힌다 */
    nodemailer: 발송기().nodemailer }, 보냄)));
  assert.equal(r.ok, false);
  assert.deepEqual(기록.지움, ['pucards/mailout/u1/old'], '★ 실패하면 그대로 남습니다');
});

test('★★ «지금 쓰는» 파일은 안 건드린다 — 치우면 다시 보낼 때 첨부가 빠진다', async () => {
  const { 기록, deps } = 창고({
    'pucards/mailout/u1/now': { size: 10, meta: { size: 10, timeCreated: 때(60000) } },
    'pucards/mailout/u1/old': { size: 10, meta: { size: 10, timeCreated: 때(하루 + 60000) } },
  });
  await 조용히(() => MD.deliver(Object.assign({ db, deps, uid: 'u1',
    body: { to: 'a@x.kr', subject: '', body: '보냅니다',
      files: [{ path: 'pucards/mailout/u1/now', name: 'now.pdf' }] },
    nodemailer: 발송기().nodemailer }, 보냄)));
  assert.ok(기록.지움.indexOf('pucards/mailout/u1/now') < 0,
    '★ 방금 올린 것을 지웠습니다 — 다시 보내면 첨부가 조용히 빠집니다');
});

test('★ 언제 만든 것인지 모르면 «건드리지 않는다»', async () => {
  const { 기록, deps } = 창고({ 'pucards/mailout/u1/x': { size: 10, meta: { size: 10 } } });
  assert.equal(await MD.sweepStaleMailOut(deps, 'u1', Date.now()), 0);
  assert.deepEqual(기록.지움, []);
});

test('★ 한 번에 치우는 수를 못 박는다 — 많이 쌓인 사람의 배달이 늦으면 안 된다', async () => {
  const 파일들 = {};
  for (let i = 0; i < MD.MAILOUT_SWEEP_MAX + 15; i++) {
    파일들['pucards/mailout/u1/o' + i] = { size: 10, meta: { size: 10, timeCreated: 때(하루 * 3) } };
  }
  const { 기록, deps } = 창고(파일들);
  const n = await MD.sweepStaleMailOut(deps, 'u1', Date.now());
  assert.equal(n, MD.MAILOUT_SWEEP_MAX);
  assert.equal(기록.지움.length, MD.MAILOUT_SWEEP_MAX);
});

test('★ 창고가 통째로 안 되어도 배달을 막지 않는다', async () => {
  const deps = { getStorage: () => ({ bucket: () => ({
    file: () => { throw new Error('창고가 막혔다'); },
    getFiles: async () => { throw new Error('창고가 막혔다'); },
  }) }) };
  const g = 발송기();
  const r = await 조용히(() => MD.deliver(Object.assign({ db, deps, uid: 'u1',
    body: 편지, nodemailer: g.nodemailer }, 보냄)));
  assert.equal(r.ok, true, '★ 치우기가 실패했다고 메일이 안 나갔습니다');
  assert.equal(g.나감.length, 1);
});
