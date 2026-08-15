/* 이알피 컨설팅·사건 기록을 사업 유형별로 묶어 보여주고, 하나를 고르면 그 사업을
   한 회사 전부를 한꺼번에 폴더에 담는다(대표 지시 2026-08-14).
   ⚠ 이알피 원본은 안 건드린다 — coInfo/<열쇠>/folder 만 쓴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadImportBlock(items){
  const digitsAt = source.indexOf('const digits = s =>');
  const digitsEnd = source.indexOf('\n', digitsAt);
  const nameAt = source.indexOf('function erpConsTypeName');
  const nameEnd = source.indexOf('\n}', nameAt) + 2;
  const at = source.indexOf('function coErpFolderCandidates');
  assert.ok(at > 0, 'coErpFolderCandidates 를 찾지 못했습니다');
  const end = source.indexOf('\nfunction ', source.indexOf('function coImportFolderFromType', at) + 10);
  const code = source.slice(digitsAt, digitsEnd) + '\n' + source.slice(nameAt, nameEnd) + '\n' + source.slice(at, end);

  const writes = []; const sets = [];
  const ctx = {
    _erpConsTypes: [{ code:'cons-ilteo', name:'일터상생혁신' }],
    loadErpCaseCons: cb => cb(ctx._erpFixture),
    _erpFixture: { byBiz: {} },
    coList: () => items.slice(),
    _coFolders: {},
    uid: () => 'uid_' + Math.random().toString(36).slice(2,8),
    toast: () => {},
    state: { view:'co' },
    renderPC: () => {},
    DB_ROOT: 'pucards',
    Store: { mode:'firebase', db: { ref: p => ({
      update: v => { writes.push({ path:p, v }); return Promise.resolve(); },
      set: v => { sets.push(v); return Promise.resolve(); }
    }) } },
    putCoFolder: f => { ctx._coFolders[f.id] = f; sets.push(f); }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._writes = writes; ctx._sets = sets;
  return ctx;
}

test('coErpFolderCandidates 는 사업 유형별로 묶어 개수와 함께 준다', () => {
  const c = loadImportBlock([]);
  c._erpFixture = { byBiz: {
    '3128149225':[{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }],
    '3128100002':[{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-00002' }],
    '3040703332':[{ _kind:'case', typeName:'부당해고', bizNo:'304-07-03332' }]
  } };
  let got = null;
  c.coErpFolderCandidates(list => { got = list; });
  assert.equal(got.length, 2);
  const ilteo = got.find(x=>x.label.indexOf('일터상생혁신')>=0);
  assert.equal(ilteo.n, 2);
  assert.equal(ilteo.kind, 'consulting');
  const dismiss = got.find(x=>x.label.indexOf('부당해고')>=0);
  assert.equal(dismiss.n, 1);
  assert.equal(dismiss.kind, 'case');
});

test('coImportFolderFromType 은 새 폴더를 만들고 매칭되는 회사를 담는다', async () => {
  const items = [
    { key:'3128149225', name:'대명크라샤', bizno:'312-81-49225' },
    { key:'n엉뚱회사', name:'엉뚱회사', bizno:'' }
  ];
  const c = loadImportBlock(items);
  const recs = [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }];
  await c.coImportFolderFromType('컨설팅·일터상생혁신', recs);
  assert.equal(Object.keys(c._coFolders).length, 1);
  const folder = Object.values(c._coFolders)[0];
  assert.equal(folder.name, '일터상생혁신');
  const upd = c._writes[0].v;
  assert.equal(upd['coInfo/3128149225/folder'], folder.id);
});

test('이미 같은 이름의 폴더가 있으면 새로 안 만들고 이어 담는다', async () => {
  const items = [{ key:'3128149225', name:'대명크라샤', bizno:'312-81-49225' }];
  const c = loadImportBlock(items);
  c._coFolders = { f9:{ id:'f9', name:'일터상생혁신' } };
  await c.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }]);
  assert.equal(Object.keys(c._coFolders).length, 1, '새 폴더를 또 만들면 안 된다');
  assert.equal(c._writes[0].v['coInfo/3128149225/folder'], 'f9');
});

test('사업자번호로 못 찾은 회사는 건너뛴다', async () => {
  const items = [{ key:'3128149225', name:'대명크라샤', bizno:'312-81-49225' }];
  const c = loadImportBlock(items);
  const recs = [
    { _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' },
    { _kind:'consulting', typeCode:'cons-ilteo', bizNo:'999-99-99999' }
  ];
  await c.coImportFolderFromType('컨설팅·일터상생혁신', recs);
  const upd = c._writes[0].v;
  assert.equal(Object.keys(upd).length, 1, '매칭 안 된 회사까지 upd 에 끼면 안 된다');
});

test('하나도 못 찾으면 update 를 안 부른다', async () => {
  const c = loadImportBlock([]);
  await c.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'999-99-99999' }]);
  assert.equal(c._writes.length, 0);
});

/* 최종 전체 리뷰 2026-08-14: 아래부터 리뷰가 찾은 것을 증명하는 검사 */

test('하나도 못 찾으면 빈 폴더도 안 만든다', async () => {
  const c = loadImportBlock([]);
  await c.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'999-99-99999' }]);
  assert.equal(Object.keys(c._coFolders).length, 0, '담을 회사가 없으면 폴더 자체를 만들면 안 된다');
  assert.equal(c._sets.length, 0);
});

test('이미 다른 폴더에 있던 회사를 옮기면 몇 곳을 옮겼는지 안내한다', async () => {
  const items = [{ key:'3128149225', name:'대명크라샤', bizno:'312-81-49225', folder:'f-old' }];
  const c = loadImportBlock(items);
  c._coFolders = { 'f-old': { id:'f-old', name:'예전 폴더' } };
  const toasts = [];
  c.toast = msg => toasts.push(msg);
  await c.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }]);
  assert.match(toasts[0], /1곳은 다른 폴더에서 옮겨졌습니다/, '기존 폴더에서 조용히 옮기면 안 된다 — 몇 곳인지 알려야 한다');
});

test('폴더가 없던 회사를 담을 때는 옮겼다는 안내를 안 한다', async () => {
  const items = [{ key:'3128149225', name:'대명크라샤', bizno:'312-81-49225' }];
  const c = loadImportBlock(items);
  const toasts = [];
  c.toast = msg => toasts.push(msg);
  await c.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }]);
  assert.doesNotMatch(toasts[0], /옮겨졌습니다/);
});

test('새로 만든 폴더인지 이미 있는 폴더에 이어 담은 것인지 안내 문구로 구분한다', async () => {
  const items = [{ key:'3128149225', name:'대명크라샤', bizno:'312-81-49225' }];

  const cNew = loadImportBlock(items);
  const toastsNew = []; cNew.toast = msg => toastsNew.push(msg);
  await cNew.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }]);
  assert.doesNotMatch(toastsNew[0], /이어/, '새로 만들 땐 "이어"라는 말이 없어야 한다');

  const cMerge = loadImportBlock(items);
  cMerge._coFolders = { f9:{ id:'f9', name:'일터상생혁신' } };
  const toastsMerge = []; cMerge.toast = msg => toastsMerge.push(msg);
  await cMerge.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }]);
  assert.match(toastsMerge[0], /이어 담았습니다/, '이미 있는 폴더에 담을 땐 구분되는 문구여야 한다');
});

test('클라우드 모드가 아니면 안내만 하고 아무 것도 안 쓴다', async () => {
  const c = loadImportBlock([{ key:'3128149225', name:'대명크라샤', bizno:'312-81-49225' }]);
  c.Store.mode = 'demo';
  await c.coImportFolderFromType('컨설팅·일터상생혁신', [{ _kind:'consulting', typeCode:'cons-ilteo', bizNo:'312-81-49225' }]);
  assert.equal(c._writes.length, 0);
  assert.equal(c._sets.length, 0);
});
