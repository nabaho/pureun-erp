'use strict';
/* 메일로 온 것 — 공용 대기 칸 (대표 지시 2026-08-17)
   실행: node --test tests/*.test.js · 목업 docs/mockups/paydata-mailbox.html */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');
const mailSrv = require(path.join(R, 'functions', 'mail-receive.js'));

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

const COS = [
  { id: 'co_1', name: '화담원', typeCode: '급여', managerMain: 'p-001', managerSubs: [],
    담당자메일: 'hr@hwadam.co.kr' },
  { id: 'co_2', name: '늘봄반찬(배방점)', typeCode: '급여', managerMain: 'p-002', managerSubs: [],
    email: 'acct@nbb.kr' }
];
const DIR = [{ sid: 'p-001', name: '김보람' }, { sid: 'p-002', name: '박은비' }];
const OWNERS = { U1: { name: '김보람', email: 'p001@pureun.kr' } };

function load(app) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      screen: 'mail', mail: {}, companies: COS, allCompanies: COS, dir: DIR, owners: OWNERS,
      pick: {}, viewingUid: '', viewingDeputy: false
    }, app)) + ';',
    'App.render = function(){};',
    cut('esc'), cut('jsq'), cut('canWrite'), cut('guessTag'),
    cut('mailRows'), cut('mailCtx'), cut('mailBarHtml'), cut('fmtBytes'), cut('fmtWhen'),
    'window.App = App; window.S = S; window.mailRows = mailRows; window.mailCtx = mailCtx;',
    'window.mailBarHtml = mailBarHtml; window.fmtWhen = fmtWhen; window.fmtBytes = fmtBytes;',
    'window.canWrite = canWrite;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* 서버가 만든 그 모양 그대로를 화면이 풀어 읽어야 한다. */
function mailRec(o) {
  return mailSrv.sharedPendingRecord(Object.assign(
    { filename: 'a.jpg', file: 'x', mime: 'image/jpeg', bytes: 1000, at: Date.now() }, o));
}

/* ══════ 보낸 사람·제목을 도로 풀어 읽는다 ══════ */

/* 서버는 보낸사람·제목을 **note 한 줄**에 적는다 — 따로 칸을 만들면 집어가는
   순간 앱이 모르는 칸이라 버려지기 때문이다. 그래서 모양이 맞아야 한다. */
test('★ 서버가 적은 그 줄을 화면이 그대로 풀어 읽는다', () => {
  const S = load().S;
  const rec = mailRec({ mailFrom: 'hr@hwadam.co.kr', mailSubject: '8월 근태 보내드립니다' });
  const n = S.mailNote(rec.note);
  assert.equal(n.from, 'hr@hwadam.co.kr');
  assert.equal(n.subject, '8월 근태 보내드립니다');
});

test('제목이 없어도 보낸 사람은 읽힌다', () => {
  const S = load().S;
  assert.equal(S.mailNote(mailSrv.sharedPendingRecord({ mailFrom: 'a@b.kr' }).note).from, 'a@b.kr');
  assert.equal(S.mailNote('').from, '');
});

/* ══════ 보낸 주소로 업체를 찾는다 — 이 길이 이름 짐작보다 정확하다 ══════ */

/* 업체관리의 메일 칸 이름이 앱마다·시기마다 다르다(email·이메일·담당자메일…).
   칸 이름을 못 박으면 이름이 바뀐 날 조용히 아무도 안 걸린다. */
test('★ 칸 이름이 무엇이든 주소를 찾아낸다', () => {
  const S = load().S;
  assert.equal(S.companyByEmail('hr@hwadam.co.kr', COS).id, 'co_1', '「담당자메일」 칸을 못 읽습니다');
  assert.equal(S.companyByEmail('acct@nbb.kr', COS).id, 'co_2', '「email」 칸을 못 읽습니다');
  assert.equal(S.companyByEmail('HR@HwaDam.co.kr', COS).id, 'co_1', '대소문자로 갈리면 안 됩니다');
  assert.equal(S.companyByEmail('nobody@x.kr', COS), null);
  assert.equal(S.companyByEmail('', COS), null);
});

/* 파일 이름이 IMG_2841.jpg 여도 **누가 보냈는지는 늘 안다.** */
test('★ 파일 이름을 못 알아봐도 보낸 주소로 업체를 안다', () => {
  const W = load({ mail: { m1: mailRec({ filename: 'IMG_2841.jpg', mailFrom: 'hr@hwadam.co.kr' }) } });
  const r = W.mailRows(W.App.mail, W.mailCtx())[0];
  assert.equal(r.companyName, '화담원');
  assert.equal(r.sure, true, '주소로 찾은 것은 확실합니다');
});

/* ⚠ 짐작을 확정처럼 두면, 사업장 목록에서 고친 그 거짓말을 여기서 되풀이한다. */
test('★ 주소로 찾은 것과 이름으로 캔 것을 갈라 둔다', () => {
  const W = load({ mail: {
    m1: mailRec({ filename: 'a.jpg', mailFrom: 'hr@hwadam.co.kr' }),          // 주소로 = 확실
    m2: mailRec({ filename: '화담원 근태.jpg', mailFrom: 'someone@else.kr' })  // 이름으로 = 짐작
  } });
  const rows = W.mailRows(W.App.mail, W.mailCtx());
  const by = {}; rows.forEach(r => { by[r.id] = r; });
  assert.equal(by.m1.sure, true);
  assert.equal(by.m2.companyName, '화담원', '이름으로라도 알아내야 합니다');
  assert.equal(by.m2.sure, false, '★ 짐작을 확실로 세면 안 됩니다');
});

test('★ 달·종류는 파일 이름과 제목에서 캔다', () => {
  const W = load({ mail: { m1: mailRec({
    filename: '근태표.jpg', mailFrom: 'hr@hwadam.co.kr', mailSubject: '2026-08 자료' }) } });
  const r = W.mailRows(W.App.mail, W.mailCtx())[0];
  assert.equal(r.month, '2026-08', '제목의 달을 못 읽었습니다');
  assert.equal(r.kind, 'attend');
});

/* 누가 맡을지 여기서 바로 알아야 한다 — 아직 이 함에 안 들어온 사람이면
   기다려도 안 맡으므로 그것도 함께 적는다. */
test('★ 그 업체 담당자가 누구인지 함께 나온다', () => {
  const W = load({ mail: {
    m1: mailRec({ mailFrom: 'hr@hwadam.co.kr' }),   // 담당 김보람 — 들어와 있다
    m2: mailRec({ mailFrom: 'acct@nbb.kr' })        // 담당 박은비 — 아직 안 들어옴
  } });
  const by = {}; W.mailRows(W.App.mail, W.mailCtx()).forEach(r => { by[r.id] = r; });
  assert.equal(by.m1.ownerName, '김보람');
  assert.equal(by.m1.ownerAway, false);
  assert.equal(by.m2.ownerName, '박은비');
  assert.equal(by.m2.ownerAway, true, '기다려도 안 맡는 사람은 그렇다고 알려야 합니다');
});

test('늦게 온 것이 위로 온다 — 오래 묵은 것은 그렇다고 표시한다', () => {
  const now = Date.now();
  const W = load({ mail: {
    old: mailRec({ filename: '오래된.jpg', at: now - 6 * 86400000 }),
    fresh: mailRec({ filename: '새것.jpg', at: now })
  } });
  const rows = W.mailRows(W.App.mail, W.mailCtx());
  assert.equal(rows[0].id, 'fresh', '새것이 위여야 합니다');
  assert.equal(rows[1].stale, true, '묵은 것을 안 짚으면 영영 그대로입니다');
});

test('언제 왔는지를 사람 말로 적는다', () => {
  const W = load();
  const now = new Date(2026, 7, 17, 15, 0).getTime();
  assert.match(W.fmtWhen(new Date(2026, 7, 17, 9, 12).getTime(), now), /^오늘 09:12$/);
  assert.match(W.fmtWhen(new Date(2026, 7, 16, 17, 40).getTime(), now), /^어제 17:40$/);
  assert.match(W.fmtWhen(new Date(2026, 7, 11, 14, 20).getTime(), now), /^6일 전 14:20$/);
  assert.equal(W.fmtWhen(0, now), '');
});

/* ══════ 첫 화면 띠 ══════ */

/* 아무도 안 맡으면 영영 그대로다 — 그래서 0건이 아니면 모두에게 보인다. */
test('★ 온 것이 있으면 첫 화면에 띠가 뜨고, 없으면 안 뜬다', () => {
  assert.equal(load({ mail: {} }).mailBarHtml(), '');
  const h = load({ mail: { m1: mailRec({}), m2: mailRec({}) } }).mailBarHtml();
  assert.match(h, /메일로 온 것 2건/);
  assert.match(h, /App\.go\('mail'\)/, '눌러서 갈 데가 없으면 알려도 소용없습니다');
});

test('★ 첫 화면이 「미정」보다 먼저 메일 띠를 그린다', () => {
  const s = cut('screenSites');
  assert.ok(s.indexOf('mailBarHtml()') >= 0, '첫 화면에 메일 띠가 없습니다');
  assert.ok(s.indexOf('mailBarHtml()') < s.indexOf('m.pendingCount'),
    '메일함은 아직 임자가 없는 것이라 내 미정보다 먼저 봐야 합니다');
});

/* 아직 안 읽은 것을 「없습니다」로 단정하면, 늦게 오는 답을 기다리지 않고
   빈 화면을 사실처럼 보여 준다. */
test('★ 아직 안 읽은 것과 읽었는데 빈 것을 가른다', () => {
  assert.match(html, /mail: null/, 'null 로 시작하지 않으면 둘을 못 가릅니다');
  assert.match(cut('screenMail'), /App\.mail === null/, '읽는 중이라는 말이 없습니다');
});

/* 첫 화면을 열 때 함께 읽어야 띠가 뜬다 — 메일 화면에 들어가야만 읽으면
   들어가기 전에는 온 줄을 모른다. */
test('★ 첫 화면 자료를 읽을 때 메일함도 함께 읽는다', () => {
  assert.match(cut('loadSites'), /listSharedPending\(\)/, '띠가 영영 안 뜹니다');
});

/* ══════ 맡기 ══════ */

function loadStore(shared, opt) {
  opt = opt || {};
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  const box = Object.assign({}, shared);
  const writes = [];
  const db = {
    ref(p) {
      return {
        transaction(fn) {
          const id = String(p).split('/').pop();
          const cur = Object.prototype.hasOwnProperty.call(box, id) ? box[id] : null;
          const next = fn(cur);
          const committed = next !== undefined;
          if (committed) { if (next === null) delete box[id]; else box[id] = next; }
          return Promise.resolve({ committed: committed, snapshot: { val: () => box[id] || null } });
        },
        set(v) { box[String(p).split('/').pop()] = v; return Promise.resolve(); },
        update(up) {
          if (opt.failWrite) return Promise.reject(new Error('쓰기 실패'));
          writes.push(up); return Promise.resolve();
        }
      };
    }
  };
  db.ref.update = null;
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1', db: { ref: p => (p === undefined ? { update: up => { if (opt.failWrite) return Promise.reject(new Error('쓰기 실패')); writes.push(up); return Promise.resolve(); } } : db.ref(p)) } });
  return { S, box, writes };
}

/* ⚠ 둘이 같은 것을 동시에 누르면, 그냥 쓰면 둘 다 성공해 **한 자료가 두 사람
   자리에** 생긴다. 한 사람만 이겨야 한다. */
test('★ 맡으면 공용 칸에서 빠지고 내 대기 칸으로 간다', async () => {
  const { S, box, writes } = loadStore({ m1: { filename: 'a.jpg', file: 'x', at: 1 } });
  assert.equal(await S.claimSharedSafe('m1'), true);
  assert.equal(box.m1, undefined, '공용 칸에 그대로 남으면 남도 또 맡습니다');
  const up = writes[writes.length - 1];
  const key = Object.keys(up)[0];
  assert.match(key, /\/pending\/m1$/, '내 대기 칸에 안 들어갔습니다');
  assert.equal(up[key].claimedBy, 'U1', '누가 맡았는지 안 남으면 아무도 책임지지 않습니다');
});

test('★ 남이 먼저 맡았으면 졌다고 알려 준다 — 조용히 성공하지 않는다', async () => {
  const { S, writes } = loadStore({});          // 이미 없다
  assert.equal(await S.claimSharedSafe('m1'), false);
  assert.equal(writes.length, 0, '★ 없는 것을 내 대기 칸에 만들면 안 됩니다');
});

/* ⚠ 빼고 나서 넣기가 실패하면 자료가 **어디에도 없게 된다** — 사라지느니
   두 번 보이는 편이 낫다. */
test('★ 내 자리에 넣다 실패하면 공용 칸에 도로 넣는다', async () => {
  const rec = { filename: 'a.jpg', file: 'x', at: 1 };
  const { S, box } = loadStore({ m1: rec }, { failWrite: true });
  await assert.rejects(() => S.claimSharedSafe('m1'));
  assert.ok(box.m1, '★ 자료가 어디에도 없이 사라졌습니다');
});

/* 한 묶음으로 쓰면 그중 하나를 남이 먼저 맡았을 때 나머지까지 통째로 안 들어온다. */
test('★ 여럿 맡을 때 하나를 놓쳐도 나머지는 가져온다', () => {
  const src = cut('bulkClaimMail');
  assert.equal(/db\.ref\(\)\.update/.test(src), false, '한 묶음으로 쓰면 하나가 막으면 다 막힙니다');
  assert.match(src, /lost/, '놓친 것을 세지 않으면 몇 건 왔는지 거짓말이 됩니다');
});

/* ⚠ 받자마자 AI로 보내면 주민번호 가림을 통째로 건너뛴다(끌어다 놓기와 같은 원칙). */
test('★ 메일로 온 것을 자동으로 판독하지 않는다', () => {
  ['screenMail', 'claimMail', 'bulkClaimMail'].forEach(fn => {
    assert.equal(/startMask\(|runRead\(|PuDocRead\./.test(cut(fn)), false,
      '★ ' + fn + ' 에서 자동 판독하면 주민번호가 그대로 나갑니다');
  });
});

/* 「보냈다는데 안 보인다」의 답은 늘 같다 — 업체관리에 그 주소가 없는 것이다. */
test('★ 안 보이는 까닭을 화면이 미리 말해 준다', () => {
  assert.match(cut('screenMail'), /업체관리/, '왜 안 오는지 모르면 서버를 의심하게 됩니다');
});

/* 남의 자리를 보는 중에는 맡을 수 없다 — 맡으면 그 사람 대기 칸이 아니라
   내 대기 칸으로 가는데, 화면은 남의 자리라고 적혀 있어 어긋난다. */
test('★ 남의 자리를 보는 중에는 맡기 단추가 없다', () => {
  const W = load({ viewingUid: 'U9', viewingDeputy: false });
  assert.equal(W.canWrite(), false);
  ['claimMail', 'bulkClaimMail'].forEach(fn =>
    assert.match(cut(fn), /canWrite\(\)/, fn + ' 이 자리를 안 봅니다'));
});
