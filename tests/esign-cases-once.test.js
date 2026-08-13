'use strict';
/* 전자서명(docs-esign.html) 사건 목록 — 통째 실시간 구독을 once + 로컬 캐시 고침으로
   (비용 조사 2026-08-13: 8/1~8/11 실시간DB 내려받기 ₩28,833 — 청구서의 93%)

   ⚠ .on('value') 로 esign/cases 를 구독하면 그 아래 모든 사건의 모든 제출
     (암호문 + 서명 그림)까지 실시간DB 가 실어 보낸다. 화면은 그중 meta 와
     제출 개수만 쓴다 — 아무 관계 없는 사건의 제출 하나만 늘어도 구독 중인
     모든 탭에 전체가 다시 내려갔다.

   ⚠ 가장 위험한 것은 「once 로 바꿨더니 내가 방금 한 일이 화면에 안 보이는 것」
     이다(사건 생성·마감·파기는 이제 서버에 다시 안 묻는다). 그래서 이 검사는
     세 가지 쓰기 뒤에 casesCache 가 실제로 바뀌고 다시 그려지는지를 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'docs-esign.html'), 'utf8');

/* 사건 목록·생성·마감·파기 토막만 떼어 가짜 db·화면과 함께 돌린다
   (같은 기법: tests/erp-conflict-wiring.test.js). */
function loadWiring(opts) {
  opts = opts || {};
  const from = app.indexOf('// ── 사건 목록 ──');
  const listEnd = app.indexOf('// ── 링크·QR 공유 ──');
  assert.ok(from > 0 && listEnd > from, '사건 목록 토막을 찾을 수 없습니다');
  /* closeCase·purgeCase 는 훨씬 뒤(상세 화면 쪽)에 있다 — 마감·파기 뒤에도
     목록 캐시가 맞는지 보려면 그 둘도 함께 가져와야 한다. */
  const purgeAt = app.indexOf('function purgeCase()');
  const purgeEnd = app.indexOf('async function openArrears()');
  assert.ok(purgeAt > listEnd && purgeEnd > purgeAt, '마감·파기 토막을 찾을 수 없습니다');
  const src = app.slice(from, listEnd) + '\n' + app.slice(app.indexOf('function closeCase()'), purgeEnd);

  const calls = { once: 0, sets: [], toasts: [] };
  /* ⚠ 실제 DOM 을 만들지 않는다 — 아이디로 여닫는 "요소"를 하나씩 만들어 둔다.
     새 사건 창이 innerHTML 로 넣는 input 들(#ncTitle 등)도 이 자리에 그냥
     미리 있는 것으로 친다. 화면 생김새가 아니라 **로직**을 본다. */
  const el = {};
  function elFor(id) {
    if (!el[id]) el[id] = { value: '', textContent: '', innerHTML: '', disabled: false, className: '', style: {}, onclick: null };
    return el[id];
  }

  function makeRef(path) {
    return {
      push() { return makeRef(path + '/-x'); },
      child(p) { return makeRef(path + '/' + p); },
      set(v) { calls.sets.push({ path: path, v: v }); return Promise.resolve(); },
      remove() { calls.sets.push({ path: path, v: null }); return Promise.resolve(); },
      once(kind) {
        calls.once++;
        assert.equal(kind, 'value', '사건 목록은 value 로만 받아야 합니다');
        assert.equal(path, 'esign/cases', '목록은 esign/cases 통째를 봐야 합니다');
        return Promise.resolve({
          val() { return opts.serverCases !== undefined ? opts.serverCases : {}; }
        });
      },
      on() { throw new Error('★ .on() 을 불렀습니다 — 통째 실시간 구독으로 되돌아갔습니다'); },
      get key() { return opts.newId || 'NEWID'; }
    };
  }

  const sandbox = {
    /* 실제 파일에서는 이 슬라이스보다 앞에서 var casesCache = {}; 로 이미
       선언돼 있다 — 슬라이스만 돌리므로 여기서 같은 값으로 미리 채운다. */
    casesCache: {},
    db: { ref(p) { return makeRef(p); } },
    EsignDocs: { esc(s) { return String(s); } },
    EsignCrypto: {
      generateCaseKeys() { return Promise.resolve({ privKeyJwk: 'PRIV', pubKeyJwk: 'PUB' }); },
      protectPrivKey() { return Promise.resolve('PROTECTED'); },
      randomToken() { return 'TOKEN123'; }
    },
    curUser: { email: 'kwon@pureunall.com' },
    firebase: { database: { ServerValue: { TIMESTAMP: 'SERVER_TS' } } },
    localYMD(d) { return d.toISOString().slice(0, 10); },
    showToast(m) { calls.toasts.push(m); },
    renderDetail() {},
    closeDetail() {},
    trackedWrite(p) { return p; },
    customConfirm(msg, onYes) { onYes(); },  // 늘 「예」— 물음 자체는 다른 검사가 본다
    document: {
      createElement() { return { className: '', innerHTML: '', remove() {} }; },
      body: { appendChild() {} }
    },
    $: elFor
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'esign-cases.js' }).runInContext(sandbox);
  sandbox._calls = calls;
  sandbox._el = el;
  sandbox._cells = { get caseRows() { return el.caseRows.innerHTML; } };
  sandbox._btn = { get btnRefreshCases() { return el.btnRefreshCases.onclick; } };
  return sandbox;
}

/* [+ 새 사건] 을 실제로 눌러 창을 띄우고, 입력을 채우고, [사건 생성] 을
   실제로 눌러 본다 — casesCache 를 흉내로 채우는 것이 아니라 **진짜 코드
   경로**로 지나가야 「손대지 않고 두면 이 검사가 잡는다」는 뜻이 있다. */
async function createCase(w, fields) {
  w.$('btnNewCase').onclick();   // 창을 연다 — $('ncOk').onclick 을 이어 준다
  w.$('ncTitle').value = fields.title;
  w.$('ncCompany').value = fields.company;
  w.$('ncResp').value = fields.resp || '';
  w.$('ncPw').value = fields.pw || '123456';
  w.$('ncPw2').value = fields.pw || '123456';
  const ok = w.$('ncOk');
  await ok.onclick.call(ok);      // this.textContent 등을 건드리므로 this 를 넘긴다
}

test('★ loadCases 가 프라미스를 돌려준다 — 안 돌려주면 아무도 완료를 못 기다린다', () => {
  const w = loadWiring({ serverCases: {} });
  const r = w.loadCases();
  assert.equal(typeof (r && r.then), 'function', 'loadCases() 가 await 할 수 없는 값을 돌려줍니다');
});

test('★ 사건 목록은 once 로만 받는다 — .on() 이면 안 된다', async () => {
  const w = loadWiring({ serverCases: { c1: { meta: { title: '가야', company: '가야엔지니어링' } } } });
  await w.loadCases();
  assert.equal(w._calls.once, 1);
  assert.match(w._cells.caseRows, /가야엔지니어링/);
});

test('제출 개수는 세지만 제출 내용은 화면에 안 낸다', async () => {
  const w = loadWiring({
    serverCases: {
      c1: {
        meta: { title: '가야', company: '가야엔지니어링' },
        submissions: { s1: { enc: 'SECRET_BLOB_1' }, s2: { enc: 'SECRET_BLOB_2' } }
      }
    }
  });
  await w.loadCases();
  assert.match(w._cells.caseRows, />2<\/b>명/, '제출 개수(2명)가 안 보입니다');
  assert.ok(!/SECRET_BLOB/.test(w._cells.caseRows), '제출 내용이 화면 글자로 새어 나갔습니다');
});

test('★ [🔄 새로고침] 단추가 loadCases 를 다시 부른다', () => {
  const w = loadWiring({ serverCases: {} });
  assert.equal(typeof w._btn.btnRefreshCases, 'function', '새로고침 단추가 안 이어져 있습니다');
  assert.equal(w._btn.btnRefreshCases, w.loadCases);
});

test('★ 사건을 만들면 새로고침 없이 목록에 곧바로 보인다 — 실제 [사건 생성] 단추로', async () => {
  const w = loadWiring({ serverCases: {}, newId: 'CASE9' });
  await w.loadCases();               // 처음엔 빈 목록
  assert.match(w._cells.caseRows, /사건이 없습니다/);

  await createCase(w, { title: '새사건', company: '새회사' });

  assert.ok(w.casesCache['CASE9'], '★ 서버에는 썼는데 캐시에 안 넣었습니다');
  assert.equal(w.casesCache['CASE9'].meta.title, '새사건');
  assert.match(w._cells.caseRows, /새사건/,
    '★ 캐시를 고쳤는데 화면이 그대로면, once 로 바꾼 뒤 사람이 [새로고침]을 눌러야만 보입니다');
  // 서버에도 실제로 썼는지 — meta 와 비밀키 둘 다
  assert.ok(w._calls.sets.some(function (s) { return /meta$/.test(s.path) && s.v.title === '새사건'; }));
  assert.ok(w._calls.sets.some(function (s) { return /secret\/encPrivKey$/.test(s.path); }));
});

test('빈 사건명이면 만들지 않는다 — 서버에도, 캐시에도', async () => {
  const w = loadWiring({ serverCases: {} });
  await createCase(w, { title: '', company: '' });
  assert.equal(Object.keys(w.casesCache).length, 0);
  assert.equal(w._calls.sets.length, 0);
  assert.ok(w._calls.toasts.some(function (t) { return /입력하세요/.test(t); }));
});

/* trackedWrite(...).then(...) 이 도는 데 몇 틱 걸린다(purgeCase 는 Promise.all
   이라 한 틱 더) — 넉넉히 몇 번 흘려보낸다. */
async function flush() {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

test('★ 사건을 마감하면 캐시의 status 가 바뀌고 다시 그려진다', async () => {
  const w = loadWiring({ serverCases: {} });
  w.casesCache['c1'] = { meta: { title: '가야', status: 'active' } };
  w.curCaseId = 'c1';
  w.closeCase();
  await flush();
  assert.equal(w.casesCache['c1'].meta.status, 'closed',
    '★ 캐시를 안 고치면 once 로 받은 뒤라 목록에 여전히 진행중으로 보입니다');
  assert.match(w._cells.caseRows, /closed/);
});

test('★ 사건을 파기하면 제출·체불내역이 캐시에서도 사라진다', async () => {
  const w = loadWiring({ serverCases: {} });
  w.casesCache['c1'] = {
    meta: { title: '가야', status: 'active' },
    submissions: { s1: {} }, arrears: { a1: {} }
  };
  w.curCaseId = 'c1';
  w.purgeCase();
  await flush();
  assert.equal(w.casesCache['c1'].meta.status, 'purged');
  assert.equal(w.casesCache['c1'].submissions, undefined,
    '★ 지웠는데 캐시에 제출이 남아 목록의 제출 수가 그대로입니다');
  assert.equal(w.casesCache['c1'].arrears, undefined);
});

test('사건 목록을 못 받으면 이유를 화면에 그대로 적는다', async () => {
  const w = loadWiring({});
  w.db.ref = function () {
    return { once() { return Promise.reject(new Error('오프라인')); } };
  };
  await w.loadCases();   // loadCases 자체가 .catch 를 물고 있어 되돌아온 프라미스는 안 던진다
  assert.match(w._cells.caseRows, /오프라인/);
});
