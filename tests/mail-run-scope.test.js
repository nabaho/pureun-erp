'use strict';
/* 메일 한 회차가 **끝까지 터지지 않는다** — 실행: node --test tests/*.test.js

   2026-08-24 로그에서 잡힌 것: 자료를 2건 담고 요약까지 찍은 **뒤에**
   `ReferenceError: boxes is not defined` 로 터졌다. try 안에서 만든 boxes·inbox 를
   try 를 나온 뒤 return 에서 썼기 때문이다.

   피해: 자료는 들어갔는데 함수가 실패로 끝나, 「지금 가져오기」가 500 을 받아
   사람에게 **「가져오지 못했습니다」로 보였다.** 30분 예약도 매 회차 error 로 남았다.

   ⚠ 글자만 보는 검사로는 이런 것을 못 잡는다(문법은 멀쩡하다). 그래서 여기서는
   **가짜 메일 서버·가짜 DB 를 끼워 본체를 실제로 돌린다.** */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* runPaydataMailOnce 만 떼어 온다 — 함수 하나가 통째로 필요하다 */
function cutRun() {
  const i = FN.indexOf('async function runPaydataMailOnce');
  assert.ok(i > 0, 'runPaydataMailOnce 를 찾을 수 없습니다');
  const j = FN.indexOf('exports.receivePaydataMail');
  assert.ok(j > i, '함수 끝을 찾을 수 없습니다');
  return FN.slice(i, j);
}

/* 도우미들도 함께 떼어 온다 — 본체가 부른다 */
function cutFn(name) {
  const i = FN.indexOf('async function ' + name);
  assert.ok(i > 0, name + ' 을 찾을 수 없습니다');
  /* 다음 최상위 선언까지 */
  const rest = FN.slice(i + 10);
  const nx = rest.search(/\n(?:async function |function |exports\.|const |let )/);
  return FN.slice(i, i + 10 + (nx > 0 ? nx : 2000));
}

/* 가짜 메일 서버 — 폴더 하나에 첨부 없는 메일 한 통.
   boxes 를 주면 그 폴더만 있는 것으로 한다 — 「급여」가 이름에 없는 폴더에서만
   일어나는 갈래(모르는 주소는 안 담는다)를 시험할 길이 없었다. */
function fakeImap(mails, boxes) {
  const rows = (boxes || ['INBOX', '2.급여+사무대행']).map(v => ({ path: v, name: v }));
  return {
    connect: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    list: () => Promise.resolve(rows),
    getMailboxLock: () => Promise.resolve({ release() {} }),
    /* 실제 IMAP 은 원문을 source 로 준다. 그 원문을 simpleParser 가 풀어 준다 —
       여기서는 이미 풀린 것을 source 에 넣고 파서는 그대로 돌려준다. */
    fetch: function* () {
      for (const m of mails) yield { uid: m.uid, envelope: m.envelope, source: m };
    }
  };
}

/* 가짜 실시간DB — **층을 만든다.** 납작하게 담으면 「paydata/mailseen」을 읽어도
   아래에 적어 둔 것이 안 보여, 처리 목록이 늘 빈 것으로 읽힌다(실제와 다르다). */
function fakeDb() {
  const root = {};
  function get(p) {
    const parts = String(p).split('/').filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[parts[i]];
    }
    return cur === undefined ? null : cur;
  }
  function set(p, v) {
    const parts = String(p).split('/').filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    if (v === null) delete cur[leaf]; else cur[leaf] = v;
  }
  return {
    root: root, get: get, set: set,
    ref(p) {
      if (p === undefined) {
        return { update(map) { Object.keys(map).forEach(k => set(k, map[k])); return Promise.resolve(); } };
      }
      return {
        once: () => Promise.resolve({ val: () => get(p) }),
        set: (v) => { set(p, v); return Promise.resolve(); },
        update: (map) => { Object.keys(map).forEach(k => set(p + '/' + k, map[k])); return Promise.resolve(); }
      };
    }
  };
}

function run(mails, boxes) {
  const MR = require(path.join(R, 'functions', 'mail-receive.js'));
  const db = fakeDb();
  const saved = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Date, Buffer, JSON, Object, Array, String, Number, Math, Promise,
    // 브라우저가 아니라 서버 코드다 — 노드에 있는 것들을 넣어 준다
    process: { env: {} }, TextDecoder, TextEncoder, Error, RangeError, TypeError,
    MR: MR,
    PAYDATA_ROOT: 'paydata',
    PAYDATA_BUCKET_ROOT: 'pu_paydata',
    PAYDATA_BUCKET: 'bucket',
    PAYMAIL_UPLOADER: '_mail',
    PAYMAIL_MAX_PER_RUN: 30,
    PAYMAIL_LOOK_DAYS: 14,
    MAIL_DONE_KEEP: 3000,
    MAIL_LOG_KEEP: 500,
    MAIL_DONE_DAYS: 120,
    MD: { loginIds: () => ['id@daum.net'] },
    ImapFlow: function () { return fakeImap(mails, boxes); },
    getDatabase: () => db,
    getStorage: () => ({ bucket: () => ({ file: (w) => ({ save: (b) => { saved.push(w); return Promise.resolve(); } }) }) }),
    mailUserAsync: () => Promise.resolve('id@daum.net'),
    mailPass: () => 'pw',
    payMailId: () => 'm' + saved.length,
    payMailKnownCache: { at: 0, list: [], index: {}, owners: {} },
    payMailKnownList: () => Promise.resolve([]),
    simpleParser: (src) => Promise.resolve(src),
    require: (m) => {
      if (m === 'imapflow') return { ImapFlow: sandbox.ImapFlow };
      if (m === 'mailparser') return { simpleParser: sandbox.simpleParser };
      return require(m);
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    cutFn('payMailDoneKeys'), cutFn('payMailMarkDone'), cutFn('payMailWriteLog'),
    cutFn('payMailStoreBody'), cutFn('payMailStoreOne'),
    cutRun(),
    'globalThis.__run = runPaydataMailOnce;'
  ].join('\n'), { filename: 'run.js' }).runInContext(sandbox);
  return { go: sandbox.__run, db: db, saved: saved };
}

const MAIL_BODY_ONLY = {
  uid: 11,
  envelope: { messageId: '<abc123@daum.net>' },
  from: { text: '보낸이 <someone@naver.com>' },
  subject: '8월 근태자료입니다',
  text: '김철수 22일\n이영희 21일\n박민수 19일',
  attachments: [],
  date: new Date(1700000000000)
};

test('★ 자료를 담은 회차가 끝까지 안 터진다 — 예전에는 요약 뒤에 터졌다', async () => {
  const { go } = run([MAIL_BODY_ONLY]);
  const out = await go();     // 터지면 여기서 던진다
  assert.ok(out, '셈을 안 돌려줍니다');
  assert.equal(out.looked, 1);
  assert.equal(out.took, 1, '본문 한 줄을 담아야 합니다');
});

test('★ 돌려주는 셈에 어느 폴더를 봤는지가 들어 있다', async () => {
  const { go } = run([MAIL_BODY_ONLY]);
  const out = await go();
  assert.ok(Array.isArray(out.boxes), '폴더 목록이 없습니다');
  assert.ok(out.boxes.indexOf('2.급여+사무대행') >= 0);
});

test('★ 빈 메일함이어도 셈을 돌려준다 — 「0통」과 「못 봤음」을 갈라야 한다', async () => {
  const { go } = run([]);
  const out = await go();
  assert.ok(out);
  assert.equal(out.looked, 0);
  assert.equal(out.took, 0);
  assert.ok(out.boxes.length, '본 폴더는 알려 줘야 합니다');
});

test('★ 처리한 메일을 적어 둔다 — 다음 회차에 또 담지 않는다', async () => {
  const { go, db } = run([MAIL_BODY_ONLY]);
  await go();
  const box = db.get('paydata/mailseen') || {};
  assert.ok(Object.keys(box).length, '처리 목록을 안 적었습니다');
});

test('★ 이미 처리한 메일은 다시 안 담는다', async () => {
  const first = run([MAIL_BODY_ONLY]);
  await first.go();
  /* 같은 메일을 다시 넣고, 앞서 적어 둔 처리 목록을 그대로 물려준다 */
  const second = run([MAIL_BODY_ONLY]);
  /* 앞 회차가 적어 둔 처리 목록을 그대로 물려준다 */
  const done = first.db.get('paydata/mailseen') || {};
  Object.keys(done).forEach(k => second.db.set('paydata/mailseen/' + k, done[k]));
  const out = await second.go();
  assert.equal(out.took, 0, '같은 메일을 두 번 담았습니다');
});

test('★ 본문을 창고에 담는다', async () => {
  const { go, saved } = run([MAIL_BODY_ONLY]);
  await go();
  assert.equal(saved.length, 1, '창고에 안 담았습니다');
  assert.match(saved[0], /\.txt$/);
});

test('★ 푸른 메일 「받은 메일」 목록에도 한 줄 적는다', async () => {
  const { go, db } = run([MAIL_BODY_ONLY]);
  await go();
  const box = db.get('paydata/maillog') || {};
  const rows = Object.keys(box).map(k => box[k]);
  assert.equal(rows.length, 1, '목록을 안 적었습니다');
  assert.match(rows[0].subject, /8월 근태자료/);
  assert.equal(rows[0].took, 1, '몇 건 담았는지가 틀렸습니다');
  assert.match(rows[0].preview, /김철수 22일/, '미리보기가 없습니다');
});

test('★ 자료로 안 담긴 메일도 목록에는 남는다 — 문의 메일이 통째로 안 보이면 안 된다', async () => {
  /* 숫자가 없는 인사말 본문 — 값으로 만들 것이 없어 자료로는 안 담긴다. */
  const ask = Object.assign({}, MAIL_BODY_ONLY, {
    envelope: { messageId: '<ask@daum.net>' },
    subject: '퇴직연금 불입액 문의', text: '안녕하세요 문의드립니다 확인 부탁드립니다'
  });
  const { go, db } = run([ask]);
  const out = await go();
  assert.equal(out.took, 0, '자료로 담기면 안 됩니다');
  const box = db.get('paydata/maillog') || {};
  const rows = Object.keys(box).map(k => box[k]);
  assert.equal(rows.length, 1, '목록에 안 남았습니다');
  assert.equal(rows[0].took, 0);
  assert.match(rows[0].why, /숫자가 없어/, '왜 안 담겼는지 적어야 합니다');
});

/* ══════ 이미 처리한 메일도 목록에는 보여야 한다 (2026-08-24 규칙 켠 첫날) ══════

   대표가 콘솔 규칙을 넣은 직후 목록이 **텅 비었다.** 폴더의 30통이 모두 지난
   회차에 이미 처리돼 처리 목록(mailseen)에 있었고, 그 갈래는 목록을 적기
   전에 건너뛰고 있었다. 폴더에 있는데 화면에 없으면 「안 왔다」로 읽힌다. */

test('★ 지난 회차에 처리한 메일도 목록에는 남는다 — 규칙 켠 첫날 목록이 텅 비었다', async () => {
  const first = run([MAIL_BODY_ONLY]);
  await first.go();
  const second = run([MAIL_BODY_ONLY]);
  const done = first.db.get('paydata/mailseen') || {};
  Object.keys(done).forEach(k => second.db.set('paydata/mailseen/' + k, done[k]));
  const out = await second.go();
  assert.equal(out.took, 0, '같은 메일을 두 번 담으면 안 됩니다');
  const box = second.db.get('paydata/maillog') || {};
  const rows = Object.keys(box).map(k => box[k]);
  assert.equal(rows.length, 1, '목록에 안 남았습니다');
  assert.equal(rows[0].old, true, '지난 회차 것이라고 적어야 합니다');
});

test('★ 지난 회차 것을 「안 담김 0건」으로 적지 않는다 — 없는 문제를 쫓게 된다', async () => {
  const first = run([MAIL_BODY_ONLY]);
  await first.go();
  const second = run([MAIL_BODY_ONLY]);
  const done = first.db.get('paydata/mailseen') || {};
  Object.keys(done).forEach(k => second.db.set('paydata/mailseen/' + k, done[k]));
  await second.go();
  const row = Object.values(second.db.get('paydata/maillog') || {})[0];
  assert.equal(row.old, true);
  assert.equal(row.why, '지난 회차에 이미 처리했습니다');
});

test('★ 이미 적힌 줄은 회차마다 다시 안 쓴다 — 30분마다 같은 것을 쓰면 그게 요금이다', async () => {
  const first = run([MAIL_BODY_ONLY]);
  await first.go();
  const third = run([MAIL_BODY_ONLY]);
  const done = first.db.get('paydata/mailseen') || {};
  Object.keys(done).forEach(k => third.db.set('paydata/mailseen/' + k, done[k]));
  /* 목록에 이미 적혀 있는 상태로 시작한다 — 표를 남겨 두고 덮였는지 본다 */
  const log = first.db.get('paydata/maillog') || {};
  Object.keys(log).forEach(k => {
    third.db.set('paydata/maillog/' + k, Object.assign({}, log[k], { 표: '그대로' }));
  });
  await third.go();
  const row = Object.values(third.db.get('paydata/maillog') || {})[0];
  assert.equal(row['표'], '그대로', '이미 있는 줄을 덮어썼습니다');
});

test('★ 모르는 주소라 안 담은 메일도 목록에는 남는다 — 「왜 안 보이나」가 바로 이 경우다', async () => {
  /* 폴더 이름에 「급여」가 없으면 아는 주소만 담는다(그때만 가린다). */
  const other = Object.assign({}, MAIL_BODY_ONLY, {
    envelope: { messageId: '<ad@daum.net>' }, box: '받은메일함',
    from: { text: '광고 <ad@spam.com>' }, subject: '대출 안내'
  });
  /* 받은메일함만 있고, 그것을 보라고 켜 둔 상태 — 이때만 주소를 가린다 */
  const t = run([other], ['INBOX']);
  t.db.set('paydata/mailconf', { scanInbox: true });
  const db = t.db;
  const out = await t.go();
  assert.equal(out.took, 0, '모르는 주소를 담으면 안 됩니다');
  const rows = Object.values(db.get('paydata/maillog') || {});
  assert.equal(rows.length, 1, '목록에 안 남았습니다');
  assert.match(rows[0].why, /업체관리에 없는 주소/, '왜 안 담겼는지 적어야 합니다');
  assert.equal(rows[0].old, false, '지난 회차 것이 아닙니다');
});

