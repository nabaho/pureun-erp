'use strict';
/* 참고 캡처를 «올리는 그 자리»에서 판독해 기업 상세로 보낸다 (대표 지시 2026-08-24)

   "비즈니스지원단 현장클리닉과 기술보호컨설팅 사업장데이터 OCR 하는 경우 자동으로
    기업정보함 기업상세에 데이터가 저장되게 해라."

   ■ 지금까지: 캡처를 붙이면 사진첩에 올라가기만 하고 **누가 사진첩을 열 때까지 안
     읽혔다.** 읽힌 뒤에야 사업자번호로 기업 상세에 모이므로, 컨설팅 담당자는 그 사이를
     알 수 없었다.
   ■ 고침: 올리는 자리에서 읽는다. 그림이 **이 기기 메모리에 있으므로** 창고에서 다시
     내려받지 않는다(한 쪽 830KB). 그 답을 사진에 남기니 사진첩이 또 읽지도 않는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'gov-consulting.html'), 'utf8');

/* 판독 층을 진짜처럼 흉내 내고 **실제로 돌린다** — 모양만 보면 「검산한 것만 보낸다」를
   증명할 수 없다. */
function load(opts) {
  const o = opts || {};
  const got = { read: [], saved: [], sent: [], toast: [], warn: [] };
  const ctx = {
    Object, Array, String, Number, Boolean, Math, JSON, Date,
    console: { warn(){ got.warn.push([].slice.call(arguments).join(' ')); } },
    Promise,
    toast: m => got.toast.push(m),
    firebase: { database: () => ({ __db: 1 }), auth: () => ({ __auth: 1 }) },
    window: {},
    _refReadReady: false,
    PuDocRead: {
      READ_VERSION: 11, PROMPT_VERSION: 10,
      init(d) { got.init = d; got.inits = (got.inits || 0) + 1; },
      keysFrom: (db, opt) => ({ readDocUrl: 'u', getToken: () => 'T', _db: db, _auth: opt && opt.auth }),
      read(dataUrl) { got.read.push(dataUrl); return Promise.resolve(o.r || {}); },
      autoOk: () => ({ auto: true, why: '' })
    },
    PuDocFile: {
      init(d) { got.fileInit = d; },
      sendToCoInfo(x) {
        got.sent.push(x);
        if (o.sendFails) return Promise.reject(new Error('보내기 실패'));
        return Promise.resolve({ ok: true, filled: o.filled || ['company', 'sales'], message: '' });
      }
    },
    PuPhotoStore: {
      saveRead(year, id, read, owner) {
        got.saved.push({ year, id, read: JSON.parse(JSON.stringify(read)), owner });
        return o.saveFails ? Promise.reject(new Error('저장 실패')) : Promise.resolve();
      }
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.fetch = function () {};
  vm.createContext(ctx);
  vm.runInContext([cutFn(app, 'function refReadInit('), cutFn(app, 'function refCapRead(')].join('\n'), ctx);
  ctx._got = got;
  return ctx;
}

const OK_READ = { kind: 'form', fields: { bizno: '312-81-49225', company: '(주) 대명크라샤',
                  sales: '4821000000', workers: '37', docName: '사업장 정보' },
                  bizNoOk: true, ntsChecked: true, ntsState: '계속사업자', via: 'image' };

/* ══════ ① 실린다 ══════ */

test('★ 컨설팅 창이 판독 층과 등록 층을 싣는다 — 안 실으면 이 길이 아예 없다', () => {
  assert.match(app, /<script src="js\/pu-doc-read\.js\?v=\d+">/, '판독기를 안 싣습니다');
  assert.match(app, /<script src="js\/pu-doc-file\.js\?v=\d+">/, '기업 상세로 보내는 층을 안 싣습니다');
});

test('★ 판독기 판(?v=)이 사진첩과 같다 — 갈리면 같은 캡처가 앱마다 다른 답을 낸다', () => {
  const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
  const one = s => {
    const m = s.match(/js\/pu-doc-read\.js\?v=(\d+)/);
    assert.ok(m, 'pu-doc-read.js 를 싣는 줄을 찾지 못했습니다');
    return m[1];
  };
  assert.equal(one(app), one(photos),
    '★ 한쪽만 올리면 이 앱만 옛 판으로 읽습니다');
  const two = s => (s.match(/js\/pu-doc-file\.js\?v=(\d+)/) || [])[1];
  assert.equal(two(app), two(photos), '★ 등록 층 판이 갈렸습니다');
});

test('★ 열쇠는 서버가 든다 — auth 를 안 넘기면 브라우저가 열쇠를 들고 직접 부르는 옛 길로 간다', () => {
  const c = load();
  c.refReadInit();
  assert.ok(c._got.init, '판독 층을 준비하지 않았습니다');
  assert.ok(c._got.init.readDocUrl, '★ 서버 대리인 주소가 없습니다');
  assert.ok(c._got.init._auth, '★ auth 를 안 넘겼습니다');
  assert.ok(c._got.fileInit && c._got.fileInit.db, '등록 층에 실시간DB 를 안 넘겼습니다');
});

test('준비는 한 번만 한다 — 캡처마다 다시 준비하면 헛일이다', () => {
  const c = load();
  c.refReadInit(); c.refReadInit(); c.refReadInit();
  /* ⚠ 부른 횟수를 센다. 「_auth 가 있나」만 보면 세 번 준비해도 통과한다(실제로 그랬다). */
  assert.equal(c._got.inits, 1, '★ 준비를 ' + c._got.inits + '번 했습니다');
  assert.equal(c._refReadReady, true);
});

test('판독 층이 아직 안 실렸으면 조용히 물러난다 — 캡처 붙이기가 막히면 안 된다', async () => {
  const c = load();
  c.PuDocRead = null;
  assert.equal(c.refReadInit(), false);
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,X');
  assert.equal(c._got.read.length, 0);
});

/* ══════ ② 손에 든 그림으로 읽는다 ══════ */

test('★ 손에 든 그림을 그대로 읽힌다 — 창고에서 다시 내려받지 않는다(한 쪽 830KB)', async () => {
  const c = load({ r: OK_READ });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.equal(c._got.read.length, 1, '판독을 안 걸었습니다');
  assert.equal(c._got.read[0], 'data:image/jpeg;base64,CAP',
    '★ 손에 든 그림이 아닌 것을 읽히면 창고 왕복이 그대로 남습니다');
});

test('그림이 없으면 아무것도 안 한다', async () => {
  const c = load({ r: OK_READ });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', '');
  assert.equal(c._got.read.length, 0);
});

test('★ 판독 결과를 그 사진에 남긴다 — 안 남기면 사진첩이 원본을 내려받아 또 읽는다', async () => {
  const c = load({ r: OK_READ });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.ok(c._got.saved.length >= 1, '판독 결과를 안 저장했습니다');
  const s = c._got.saved[0];
  assert.equal(s.year, '2026', '★ 저장 층이 알려 준 해에 써야 합니다 — 짐작하면 못 찾습니다');
  assert.equal(s.id, 'p1');
  assert.equal(s.owner, 'u1', '★ 주인 자리에 안 쓰면 주인 화면에는 「안 읽음」으로 남습니다');
  assert.equal(s.read.kind, 'form');
  assert.equal(s.read.fields.sales, '4821000000');
});

test('★ 어느 판으로 읽었는지 함께 남긴다 — 없으면 판 번호를 올릴 때마다 다시 읽힌다', async () => {
  const c = load({ r: OK_READ });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  const read = c._got.saved[0].read;
  assert.equal(read.rv, 11, 'rv(판독기 판)가 없습니다');
  assert.equal(read.pv, 10, '★ pv(물음 판)가 없으면 574장 파도가 다시 일어납니다');
  assert.equal(read.via, 'image', 'via(어느 길로 읽었나)가 없습니다');
});

/* ══════ ③ 기업 상세로 ══════ */

test('★ 사업자번호를 «기계가 검산한 것만» 스스로 보낸다', async () => {
  const c = load({ r: OK_READ });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.equal(c._got.sent.length, 1, '검산을 통과했는데 안 보냈습니다');
  assert.equal(c._got.sent[0].fields.bizno, '312-81-49225');
  assert.equal(c._got.sent[0].byName, '김혜민', '누가 보낸 것인지 안 남깁니다');
  assert.equal(c._got.sent[0].photo.id, 'p1',
    '★ 어느 서류에서 온 값인지 안 남기면 「이 숫자 어디서 봤더라」에 답할 수 없습니다');
  assert.equal(c._got.sent[0].photo.year, '2026');
  assert.equal(c._got.sent[0].photo.owner, 'u1');
});

test('★ 검산에 걸린 번호는 안 보낸다 — AI 가 흐린 자리를 메운 번호가 남의 회사 칸에 든다', async () => {
  for (const bad of [false, null, undefined]) {
    const c = load({ r: Object.assign({}, OK_READ, { bizNoOk: bad }) });
    await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
    assert.equal(c._got.sent.length, 0, '★ bizNoOk=' + String(bad) + ' 인데 보냈습니다');
    assert.equal(c._got.saved.length, 1, '보내지 않더라도 판독 결과는 남겨야 합니다');
  }
});

test('★ 보낸 표를 남긴다 — 안 남기면 사진첩이 같은 캡처를 또 보낸다', async () => {
  const c = load({ r: OK_READ, filled: ['company', 'sales', 'workers'] });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.equal(c._got.saved.length, 2, '보낸 뒤 다시 저장하지 않았습니다');
  const last = c._got.saved[1].read;
  assert.ok(last.filedInfo && last.filedInfo.at, '★ filedInfo 가 없으면 또 보냅니다');
  assert.equal(last.filedInfo.n, 3, '몇 칸을 채웠는지 안 남깁니다');
  assert.equal(last.filedInfo.by, '김혜민');
});

test('★ 판독 결과를 «먼저» 저장한다 — 보내기가 실패해도 읽은 것은 잃지 않는다', async () => {
  const c = load({ r: OK_READ, sendFails: true });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.equal(c._got.saved.length, 1, '★ 보내기가 터져 판독 결과가 통째로 사라졌습니다');
  assert.equal(c._got.saved[0].read.kind, 'form');
});

test('몇 칸을 채웠는지 사람에게 말해 준다', async () => {
  const c = load({ r: OK_READ, filled: ['company', 'sales'] });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.ok(c._got.toast.some(t => /2칸/.test(t)), '무슨 일이 있었는지 안 알려 줍니다: ' + c._got.toast);
});

test('이미 있는 값이면 그렇게 말한다 — 「0칸을 채웠습니다」는 실패로 읽힌다', async () => {
  const c = load({ r: OK_READ, filled: [] });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.ok(c._got.toast.some(t => /이미 있는/.test(t)), c._got.toast.join('/'));
});

/* ══════ ④ 실패해도 캡처는 붙어 있다 ══════ */

test('★ 판독이 실패해도 조용히 넘어간다 — 캡처 붙이기가 판독 때문에 막히면 안 된다', async () => {
  const c = load({ r: { kind: 'other', fields: {}, error: 'AI 가 바쁩니다' } });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.equal(c._got.saved.length, 0,
    '★ 못 읽은 것을 「읽었다」로 남기면 사진첩이 다시 읽지 않아 영영 안 읽힙니다');
  assert.equal(c._got.sent.length, 0);
  assert.ok(c._got.warn.length > 0, '무엇이 틀어졌는지 기록은 남겨야 합니다');
});

test('저장이 실패해도 터지지 않는다', async () => {
  const c = load({ r: OK_READ, saveFails: true });
  await c.refCapRead('2026', 'p1', 'u1', '김혜민', 'data:image/jpeg;base64,CAP');
  assert.equal(c._got.sent.length, 0, '판독 결과를 못 남겼으면 보내지도 않습니다');
});

/* ══════ ⑤ 배선 ══════ */

test('★ 캡처를 «붙인 뒤에» 판독을 시작한다 — 판독이 늦어도 캡처는 이미 붙어 있어야 한다', () => {
  const fn = cutFn(app, 'function uploadRefCap(');
  const add = fn.indexOf('addRefCaps(sid,');
  const read = fn.indexOf('refCapRead(');
  assert.ok(add > 0 && read > add,
    '★ 판독을 먼저 걸면 판독이 실패했을 때 캡처가 안 붙을 수 있습니다');
});

test('★ 판독을 기다리지 않는다 — 몇 초 동안 창을 붙잡으면 다음 캡처를 못 붙인다', () => {
  const fn = cutFn(app, 'function uploadRefCap(');
  const i = fn.indexOf('refCapRead(');
  const line = fn.slice(fn.lastIndexOf('\n', i) + 1, fn.indexOf('\n', i));
  assert.ok(line.trim().indexOf('return') !== 0 && line.indexOf('await') < 0,
    '★ 판독을 기다리고 있습니다: ' + line.trim());
});

test('★ 저장 층이 알려 준 해·번호를 넘긴다 — 화면의 해로 짐작하면 못 찾는다', () => {
  const fn = cutFn(app, 'function uploadRefCap(');
  assert.match(fn, /refCapRead\(y, pid, u\.uid, me, full\.dataUrl\)/,
    '★ 짐작한 해나 새로 만든 번호를 넘기면 엉뚱한 자리에 씁니다');
});

test('가림 없이 원본이 나가는 것을 코드에 밝혀 둔다 — 계약서를 이 길로 보내지 않게', () => {
  const fn = cutFn(app, 'function refCapRead(');
  const head = app.slice(Math.max(0, app.indexOf('function refCapRead(') - 2200),
                         app.indexOf('function refCapRead('));
  assert.match(head + fn, /가림 없이 원본이/,
    '감수 결정을 안 적어 두면 다음 사람이 계약서를 이 길로 보냅니다');
});
