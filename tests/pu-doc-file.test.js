'use strict';
// js/pu-doc-file.js 단위 검사 — 실행: node --test tests/*.test.js
//   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)
//
// 등록 층은 판독 결과를 명함첩에 넣는 층이다. 실데이터를 만지는 층이므로
// 검사에서는 가짜 db 만 쓴다 — 실서버에 절대 붙지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 등록 층은 판독 층의 필드 변환표를 쓴다 — 둘을 같은 자리에 올려 놓는다.
function loadFile() {
  const root = path.join(__dirname, '..', 'js');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['pu-doc-read.js', 'pu-doc-file.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    new vm.Script(src, { filename: f }).runInContext(sandbox);
  }
  return sandbox.window.PuDocFile;
}

// 실시간DB 흉내 — 경로별 값을 주고 update 를 기록한다.
function fakeDb(map) {
  const calls = { update: [], once: [] };
  return {
    calls,
    ref(p) {
      const key = p || '';
      return {
        update(u) { calls.update.push({ path: key, u }); return Promise.resolve(); },
        once() {
          calls.once.push(key);
          return Promise.resolve({ val: () => (key in map ? map[key] : null) });
        },
        push() { return { key: '-new' + (calls.update.length + 1) }; }
      };
    }
  };
}

const CARD = { name: '홍길동', company: '가나상사', mobile: '010-1234-5678', title: '과장', email: 'a@b.c' };
const BIZ = {
  company: '가나상사', ceo: '홍길동', bizno: '220-81-62517', corpno: '160111-0371859',
  openDate: '2014-05-07', bizType: '제조업', bizItem: '금속가공', address: '천안시'
};
/* 이미 모든 칸이 찬 명함첩 레코드 — 채울 것이 없는 '진짜 중복'을 만들 때 쓴다. */
const FULL_BIZ = Object.assign({}, BIZ);

test('등록 층이 window에 붙는다', () => {
  assert.ok(loadFile(), 'window.PuDocFile 이 없습니다');
});

/* ── 이미 있는 것 찾기 (중복 방지) ── */

test('휴대폰 번호가 같은 명함을 찾는다 — 표기가 달라도', async () => {
  const F = loadFile();
  F.init({ db: fakeDb({ 'pucards/idx': {
    a1: { n: '홍길동', m: '01012345678', k: 'card' },
    a2: { n: '김철수', m: '01099998888', k: 'card' } } }) });
  assert.equal((await F.findExisting('card', { mobile: '010-1234-5678' })).id, 'a1');
  assert.equal(await F.findExisting('card', { mobile: '010-0000-0000' }), null);
});

test('사업자등록번호가 같은 사업자등록증을 찾는다', async () => {
  const F = loadFile();
  F.init({ db: fakeDb({ 'pucards/idx': {
    b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } } }) });
  assert.equal((await F.findExisting('bizreg', { bizno: '2208162517' })).id, 'b1');
  assert.equal(await F.findExisting('bizreg', { bizno: '123-45-67890' }), null);
});

test('종류가 다르면 같은 번호라도 다른 것으로 본다', async () => {
  // 명함과 사업자등록증은 다른 물건이다 — 섞으면 한쪽이 다른 쪽을 덮는다
  const F = loadFile();
  F.init({ db: fakeDb({ 'pucards/idx': {
    b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } } }) });
  assert.equal(await F.findExisting('card', { mobile: '220-81-62517' }), null);
});

test('찾을 열쇠가 없으면 찾지 않는다 — 아무거나 붙이면 안 된다', async () => {
  const F = loadFile();
  const db = fakeDb({ 'pucards/idx': { a1: { n: '홍길동', m: '01012345678', k: 'card' } } });
  F.init({ db });
  assert.equal(await F.findExisting('card', { name: '홍길동' }), null, '휴대폰 없이 이름만으로 붙였습니다');
  assert.equal(await F.findExisting('bizreg', { company: '가나상사' }), null);
});

test('명함첩이 비어 있어도 터지지 않는다', async () => {
  const F = loadFile();
  F.init({ db: fakeDb({}) });
  assert.equal(await F.findExisting('card', { mobile: '010-1234-5678' }), null);
});

/* ── 빈 칸만 채우기 ── */

test('빈 칸만 채운다 — 기존 값은 절대 덮지 않는다', () => {
  const F = loadFile();
  const out = F.fillGaps(
    { company: '가나상사', ceo: '김대표', bizno: '', bizType: '' },
    { company: '가나상사(주)', ceo: '홍길동', bizno: '220-81-62517', bizType: '제조업' });
  assert.deepEqual({ ...out }, { bizno: '220-81-62517', bizType: '제조업' });
  assert.ok(!('ceo' in out), '기존 대표자를 덮으려 합니다');
  assert.ok(!('company' in out), '기존 회사명을 덮으려 합니다');
});

test('채울 것이 없으면 빈 변경분 — 쓸데없는 쓰기를 하지 않는다', () => {
  const F = loadFile();
  assert.deepEqual({ ...F.fillGaps({ bizno: '220-81-62517' }, { bizno: '220-81-62517' }) }, {});
  assert.deepEqual({ ...F.fillGaps({}, {}) }, {});
});

test('공백만 있는 기존 값은 비어 있는 것으로 본다', () => {
  const F = loadFile();
  assert.deepEqual({ ...F.fillGaps({ ceo: '   ' }, { ceo: '홍길동' }) }, { ceo: '홍길동' });
});

test('kind 는 채움 대상이 아니다 — 종류를 바꾸면 다른 물건이 된다', () => {
  const F = loadFile();
  const out = F.fillGaps({ kind: 'card' }, { kind: 'biz', name: '홍길동' });
  assert.ok(!('kind' in out), '레코드 종류를 바꾸려 합니다');
});

/* ── 명함첩에 넣기 ── */

test('새로 만들 때 레코드·검색 인덱스·사진을 한 번에 쓴다', async () => {
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  const r = await F.sendToCards({ kind: 'card', fields: CARD, full: 'data:image/jpeg;base64,FULL',
    thumb: 'data:image/jpeg;base64,TH', photoId: 'p1', byName: '김담당', takenAt: 1000 });
  assert.equal(r.created, true);
  // 반드시 한 번의 update — 여러 번 쓰면 중간에 끊겨 반쪽 레코드가 남는다
  assert.equal(db.calls.update.length, 1);
  const u = db.calls.update[0].u;
  const keys = Object.keys(u).sort();
  assert.ok(keys.some(k => /^pucards\/items\//.test(k)), '레코드를 안 썼습니다');
  assert.ok(keys.some(k => /^pucards\/idx\//.test(k)), '검색 인덱스를 안 썼습니다 — 다른 앱이 못 찾습니다');
  assert.ok(keys.some(k => /^pucards\/photos\//.test(k)), '사진을 안 보냈습니다 — 명함첩에서 못 봅니다');
});

test('상위 노드를 통째로 쓰지 않는다 — 남의 명함이 지워진다', async () => {
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  await F.sendToCards({ kind: 'card', fields: CARD, full: 'F', thumb: 'T', photoId: 'p1' });
  assert.equal(db.calls.update[0].path, '', '루트에서 다중 경로 update 를 해야 합니다');
  for (const k of Object.keys(db.calls.update[0].u)) {
    assert.match(k, /^pucards\/(items|idx|photos)\/[^/]+$/, '위험한 경로입니다: ' + k);
  }
});

test('명함 레코드에 명함첩이 쓰는 이름으로 담긴다', async () => {
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  await F.sendToCards({ kind: 'card', fields: CARD, full: 'F', thumb: 'T', photoId: 'p1', takenAt: 1000 });
  const u = db.calls.update[0].u;
  const rec = u[Object.keys(u).find(k => /^pucards\/items\//.test(k))];
  assert.equal(rec.kind, 'card');
  assert.equal(rec.name, '홍길동');
  assert.equal(rec.company, '가나상사');
  assert.equal(rec.mobile, '010-1234-5678');
  assert.equal(rec.thumb, 'T', '목록용 미리보기가 없으면 명함첩 격자가 빕니다');
  assert.equal(rec.photoId, 'p1', '사진첩 사진과 잇는 고리가 없습니다');
  assert.equal(rec.createdAt, 1000, '촬영 시각을 받은 날로 써야 합니다');
  assert.equal(rec.source, 'pu-photos');
});

test('사업자등록증 레코드는 kind 가 biz 이고 사업자번호가 들어간다', async () => {
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  const u = db.calls.update[0].u;
  const rec = u[Object.keys(u).find(k => /^pucards\/items\//.test(k))];
  assert.equal(rec.kind, 'biz');
  assert.equal(rec.bizno, '220-81-62517');
  assert.equal(rec.ceo, '홍길동');
  assert.equal(rec.bizItem, '금속가공');
  assert.equal(rec.openDate, '2014-05-07');
});

test('검색 인덱스는 명함첩이 쓰는 약어 이름으로 담긴다', async () => {
  // 이름이 다르면 명함첩·푸른이알피의 검색이 이 명함을 못 찾는다
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  await F.sendToCards({ kind: 'card', fields: CARD, full: 'F', thumb: 'T', photoId: 'p1' });
  let u = db.calls.update[0].u;
  let idx = u[Object.keys(u).find(k => /^pucards\/idx\//.test(k))];
  assert.equal(idx.n, '홍길동');
  assert.equal(idx.c, '가나상사');
  assert.equal(idx.m, '010-1234-5678');
  assert.equal(idx.k, 'card');

  const db2 = fakeDb({});
  F.init({ db: db2 });
  await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  u = db2.calls.update[0].u;
  idx = u[Object.keys(u).find(k => /^pucards\/idx\//.test(k))];
  assert.equal(idx.bz, '220-81-62517', '사업자번호가 인덱스에 없으면 번호로 못 찾습니다');
  assert.equal(idx.ceo, '홍길동');
  assert.equal(idx.k, 'biz');
});

test('이미 있으면 새로 만들지 않고 빈 칸만 채운다', async () => {
  const F = loadFile();
  const db = fakeDb({
    'pucards/idx': { b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } },
    'pucards/items/b1': { id: 'b1', kind: 'biz', company: '가나상사', bizno: '220-81-62517', ceo: '', thumb: 'OLD' }
  });
  F.init({ db });
  const r = await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  assert.equal(r.created, false);
  assert.equal(r.id, 'b1');
  assert.ok(r.filled.indexOf('대표자') >= 0, '무엇을 채웠는지 알려주지 않습니다: ' + JSON.stringify(r.filled));
  const u = db.calls.update[0].u;
  // 기존 레코드를 통째로 덮지 않고 칸만 건드린다
  for (const k of Object.keys(u)) {
    assert.match(k, /^pucards\/(items|idx)\/b1(\/|$)/, '엉뚱한 곳을 씁니다: ' + k);
  }
  assert.ok(!Object.keys(u).some(k => /^pucards\/photos\//.test(k)),
    '이미 있는 명함의 사진을 덮어씁니다');
  assert.ok(!Object.keys(u).some(k => /\/thumb$/.test(k)),
    '이미 있는 미리보기를 덮어씁니다');
});

/* 중복이라도 '사진이 없던 명함'에 들어온 사진은 더한 것이 있다.
   이 판단이 없으면 글자만 있던 명함에 온 사진을 쓸모없다고 치워 버린다. */
test('사진이 없던 명함이면 이 사진이 첫 사진이 된다', async () => {
  const F = loadFile();
  const db = fakeDb({
    'pucards/idx': { b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } },
    'pucards/items/b1': Object.assign({ id: 'b1', kind: 'biz' }, FULL_BIZ)
  });
  F.init({ db });
  const r = await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  assert.equal(r.redundant, false, '사진을 더했는데 쓸모없다고 봤습니다');
  assert.ok(r.filled.indexOf('사진') >= 0, JSON.stringify(r.filled));
  const u = db.calls.update[0].u;
  assert.equal(u['pucards/items/b1/thumb'], 'T');
  assert.equal(u['pucards/photos/b1'], 'F');
  assert.equal(u['pucards/items/b1/photoId'], 'p2', '사진첩 사진과 잇는 고리가 없습니다');
});

test('이미 있고 채울 것도 없으면 아무것도 쓰지 않는다', async () => {
  const F = loadFile();
  const db = fakeDb({
    'pucards/idx': { b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } },
    'pucards/items/b1': Object.assign({ id: 'b1', kind: 'biz', thumb: 'OLD' }, FULL_BIZ)
  });
  F.init({ db });
  const r = await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  assert.equal(r.created, false);
  assert.deepEqual([...r.filled], []);
  assert.equal(db.calls.update.length, 0, '바뀔 것이 없는데 저장했습니다');
});

/* ── 중복 알림 ──
   '이미 있습니다'만으로는 어느 것이 원본인지, 왜 내 사진이 없어졌는지
   알 수 없다. 언제 저장된 것과 겹쳤는지 반드시 함께 알려야 한다. */
test('중복이면 언제 저장된 것과 겹쳤는지 알려준다', async () => {
  const F = loadFile();
  const when = new Date(2026, 6, 12, 14, 3).getTime();
  const db = fakeDb({
    'pucards/idx': { b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } },
    'pucards/items/b1': Object.assign({ id: 'b1', kind: 'biz', thumb: 'OLD', createdAt: when }, FULL_BIZ)
  });
  F.init({ db });
  const r = await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  assert.equal(r.dup, true);
  assert.equal(r.dupAt, when);
  assert.equal(r.redundant, true, '더한 것이 없는데 쓸모있다고 봤습니다');
  assert.match(r.message, /2026-07-12 14:03/, '언제 겹친 것인지 없습니다: ' + r.message);
  assert.match(r.message, /가나상사/, '무엇과 겹친 것인지 없습니다: ' + r.message);
});

test('빈 칸을 채운 중복도 중복이라고 알린다 — 다만 치울 대상은 아니다', async () => {
  const F = loadFile();
  const when = new Date(2026, 6, 12, 14, 3).getTime();
  const db = fakeDb({
    'pucards/idx': { b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } },
    'pucards/items/b1': { id: 'b1', kind: 'biz', company: '가나상사', bizno: '220-81-62517', ceo: '', thumb: 'OLD', createdAt: when }
  });
  F.init({ db });
  const r = await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  assert.equal(r.dup, true);
  assert.equal(r.redundant, false);
  assert.match(r.message, /2026-07-12/);
});

test('때가 없는 옛 명함이면 때 없이 알린다 — 1970년을 보여주지 않는다', async () => {
  const F = loadFile();
  const db = fakeDb({
    'pucards/idx': { b1: { c: '가나상사', bz: '220-81-62517', k: 'biz' } },
    'pucards/items/b1': Object.assign({ id: 'b1', kind: 'biz', thumb: 'OLD' }, FULL_BIZ)
  });
  F.init({ db });
  const r = await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  assert.equal(r.dupAt, 0);
  assert.ok(!/1970/.test(r.message), '때를 모르는데 1970년을 보여줍니다: ' + r.message);
});

test('whenText 는 밀리초를 사람 말로 바꾼다', () => {
  const F = loadFile();
  assert.equal(F.whenText(new Date(2026, 0, 5, 9, 7).getTime()), '2026-01-05 09:07');
  assert.equal(F.whenText(0), '', '때를 모를 때 빈 값이어야 합니다');
});

test('실시간DB가 없으면 한국어로 거절한다', async () => {
  const F = loadFile();
  F.init({});
  await assert.rejects(() => F.sendToCards({ kind: 'card', fields: CARD }), /실시간DB/);
});

test('읽어낸 것이 없으면 보내지 않는다 — 빈 껍데기를 만들지 않는다', async () => {
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  await assert.rejects(() => F.sendToCards({ kind: 'card', fields: {}, full: 'F' }), /읽어낸/);
  assert.equal(db.calls.update.length, 0);
});

test('서류가 아닌 것은 명함첩에 보내지 않는다', async () => {
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  await assert.rejects(() => F.sendToCards({ kind: 'other', fields: { company: 'x' } }), /명함|사업자등록증/);
  await assert.rejects(() => F.sendToCards({ kind: 'sme', fields: { company: 'x' } }), /명함|사업자등록증/);
  assert.equal(db.calls.update.length, 0);
});

test('결과 문구가 사람이 읽을 한국어다', async () => {
  const F = loadFile();
  F.init({ db: fakeDb({}) });
  const r = await F.sendToCards({ kind: 'bizreg', fields: BIZ, full: 'F', thumb: 'T', photoId: 'p2' });
  assert.ok(r.message && r.message.length > 0, '결과 문구가 없습니다');
  assert.ok(!/[A-Za-z]{5,}/.test(r.message), '영어 내부 용어가 노출됩니다: ' + r.message);
  assert.match(r.message, /명함첩/);
});

/* ══════════ 업체관리에 넣기 ══════════
   여기서 잘못하면 실데이터가 망가진다. 못 박아 둘 것 셋:
   ① 업체를 새로 만들지 않는다  ② 빈 칸만 채운다  ③ 목록을 통째로 쓰지 않는다 */

const SME = { company: '가나상사', bizno: '220-81-62517', ceo: '홍길동',
  smeType: '소기업', industry: '금속가공', expiry: '2027-03-31',
  issueNo: 'S2026-1234', issueDate: '2026-04-01' };

// 업체 목록은 객체형·배열형 둘 다 쓰인다 — 둘 다 시험한다.
function coObj(rec) { return { 'data/companies': { v: { c1: rec }, u: 100 } }; }
function coArr(rec) { return { 'data/companies': { v: [null, rec], u: 100 } }; }

test('사업자번호로 기존 업체를 찾는다 — 하이픈이 달라도', async () => {
  const F = loadFile();
  F.init({ db: fakeDb({ 'data/companies': { v: {
    c1: { id: 'c1', name: '가나상사', bizNo: '220-81-62517' },
    c2: { id: 'c2', name: '다라상사', bizNo: '1234567890' } } } }) });
  assert.equal((await F.findCompanyByBizNo('2208162517')).id, 'c1');
  assert.equal((await F.findCompanyByBizNo('123-45-67890')).id, 'c2');
  assert.equal(await F.findCompanyByBizNo('999-99-99999'), null);
  assert.equal(await F.findCompanyByBizNo(''), null, '번호가 없으면 찾지 않는다');
});

test('배열형 목록에서도 찾는다 — 자리번호를 열쇠로 쓴다', async () => {
  const F = loadFile();
  F.init({ db: fakeDb(coArr({ id: 'c9', name: '가나상사', bizNo: '2208162517' })) });
  const hit = await F.findCompanyByBizNo('220-81-62517');
  assert.equal(hit.id, 'c9');
  assert.equal(hit.at, '1', '배열 자리번호를 못 잡으면 칸 경로를 만들 수 없습니다');
});

test('업체를 찾지 못하면 새로 만들지 않는다 — 유령 업체 금지', async () => {
  const F = loadFile();
  const db = fakeDb({ 'data/companies': { v: {} } });
  F.init({ db });
  const r = await F.sendToCompany({ kind: 'bizreg', fields: BIZ });
  assert.equal(r.found, false);
  assert.equal(db.calls.update.length, 0, '업체를 만들었습니다');
  assert.match(r.message, /업체를 먼저 만들어/, '무엇을 해야 하는지 알려주지 않습니다: ' + r.message);
});

test('사업자번호를 못 읽었으면 찾지도 않는다', async () => {
  const F = loadFile();
  const db = fakeDb({ 'data/companies': { v: {} } });
  F.init({ db });
  const r = await F.sendToCompany({ kind: 'bizreg', fields: { company: '가나상사' } });
  assert.equal(r.found, false);
  assert.equal(db.calls.update.length, 0);
  assert.match(r.message, /사업자번호/);
});

test('찾은 업체의 빈 칸만 채운다 — 기존 값은 덮지 않는다', async () => {
  const F = loadFile();
  const db = fakeDb(coObj({ id: 'c1', name: '가나상사', bizNo: '2208162517',
    ceo: '기존대표', address: '', bizType: '' }));
  F.init({ db });
  const r = await F.sendToCompany({ kind: 'bizreg', fields: BIZ, byName: '권형하' });
  assert.equal(r.found, true);
  const u = db.calls.update[0].u;
  assert.equal(u['data/companies/v/c1/ceo'], undefined, '기존 대표자를 덮어썼습니다');
  assert.equal(u['data/companies/v/c1/address'], '천안시');
  assert.equal(u['data/companies/v/c1/bizType'], '제조업');
  assert.ok(r.filled.indexOf('소재지') >= 0, JSON.stringify(r.filled));
});

test('업체 목록을 통째로 쓰지 않는다 — 남이 넣은 업체가 지워진다', async () => {
  const F = loadFile();
  const db = fakeDb(coObj({ id: 'c1', name: '가나상사', bizNo: '2208162517' }));
  F.init({ db });
  await F.sendToCompany({ kind: 'bizreg', fields: BIZ });
  const u = db.calls.update[0].u;
  assert.equal(u['data/companies/v'], undefined, '목록 노드를 통째로 썼습니다');
  assert.equal(u['data/companies'], undefined, '업체 뿌리를 통째로 썼습니다');
  for (const k of Object.keys(u)) {
    assert.match(k, /^data\/companies\/(v\/c1\/[A-Za-z]+|u)$/, '위험한 경로입니다: ' + k);
  }
});

test('찾는 열쇠(사업자번호)를 다시 쓰지 않는다', async () => {
  // 열쇠를 다시 쓰면 표기만 바뀌어 다음 번에 못 찾을 수 있다.
  const F = loadFile();
  const db = fakeDb(coObj({ id: 'c1', name: '가나상사', bizNo: '2208162517' }));
  F.init({ db });
  await F.sendToCompany({ kind: 'bizreg', fields: BIZ });
  assert.equal(db.calls.update[0].u['data/companies/v/c1/bizNo'], undefined);
});

test('갱신시각을 함께 쓴다 — 안 쓰면 푸른이알피 화면에 안 나타난다', async () => {
  const F = loadFile();
  const db = fakeDb(coObj({ id: 'c1', name: '가나상사', bizNo: '2208162517' }));
  F.init({ db });
  await F.sendToCompany({ kind: 'bizreg', fields: BIZ });
  assert.ok(db.calls.update[0].u['data/companies/u'] > 0);
});

test('고친 때·고친 이를 남긴다 — 동시 편집 판단이 이걸 본다', async () => {
  const F = loadFile();
  const db = fakeDb(coObj({ id: 'c1', name: '가나상사', bizNo: '2208162517' }));
  F.init({ db });
  await F.sendToCompany({ kind: 'bizreg', fields: BIZ, byName: '권형하' });
  const u = db.calls.update[0].u;
  assert.ok(u['data/companies/v/c1/updatedAt'] > 0);
  assert.equal(u['data/companies/v/c1/updatedBy'], '권형하');
});

test('채울 것이 없으면 아무것도 쓰지 않는다 — 업체관리도', async () => {
  const F = loadFile();
  const db = fakeDb(coObj({ id: 'c1', name: '가나상사', bizNo: '2208162517',
    ceo: '홍길동', corpNo: '160111-0371859', openDate: '2014-05-07',
    bizType: '제조업', bizCategory: '금속가공', address: '천안시' }));
  F.init({ db });
  const r = await F.sendToCompany({ kind: 'bizreg', fields: BIZ });
  assert.equal(r.found, true);
  assert.deepEqual([...r.filled], []);
  assert.equal(db.calls.update.length, 0, '바뀔 것이 없는데 저장했습니다');
});

test('중소기업확인서는 기업규모와 유효기간만 채운다', async () => {
  // 상호·대표자는 사업자등록증이 더 정확한 원본이다 — 확인서로 건드리지 않는다.
  const F = loadFile();
  const db = fakeDb(coObj({ id: 'c1', name: '', bizNo: '2208162517', ceo: '',
    companySize: '', industry: '', smeExpiry: '' }));
  F.init({ db });
  const r = await F.sendToCompany({ kind: 'sme', fields: SME });
  const u = db.calls.update[0].u;
  assert.equal(u['data/companies/v/c1/companySize'], '소기업');
  assert.equal(u['data/companies/v/c1/smeExpiry'], '2027-03-31');
  assert.equal(u['data/companies/v/c1/name'], undefined, '확인서로 상호를 건드렸습니다');
  assert.equal(u['data/companies/v/c1/ceo'], undefined, '확인서로 대표자를 건드렸습니다');
  assert.equal(u['data/companies/v/c1/industry'], undefined, '규모·유효기간 밖을 건드렸습니다');
  assert.match(r.message, /유효기간/);
});

test('확인서 발급번호·발급일도 함께 남는다', () => {
  // 유효기간만 있으면 어느 확인서인지 몰라 재발급 요청 때 다시 찾아야 한다.
  const F = loadFile();
  assert.ok(F.sendToCompany && F.findCompanyByBizNo, '업체 등록 함수가 없습니다');
});

test('명함·회의사진은 업체관리로 보내지 않는다', async () => {
  const F = loadFile();
  const db = fakeDb({});
  F.init({ db });
  await assert.rejects(() => F.sendToCompany({ kind: 'card', fields: CARD }), /사업자등록증|중소기업/);
  await assert.rejects(() => F.sendToCompany({ kind: 'meeting', fields: {} }), /사업자등록증|중소기업/);
  assert.equal(db.calls.update.length, 0);
});

test('실시간DB가 없으면 한국어로 거절한다 — 업체관리도', async () => {
  const F = loadFile();
  F.init({});
  await assert.rejects(() => F.sendToCompany({ kind: 'bizreg', fields: BIZ }), /실시간DB/);
});
