/* 사진첩 — 사람이 직접 적는 정보 (대표 지시 2026-08-08)
   설계서 9항에 있었는데 안 만들어져 있던 것들이다.
     · 촬영일 고치기 — 카톡을 거친 사진은 날짜가 지워져 엉뚱한 날로 들어간다
     · 업체 적기    — 회의·현장 사진에는 업체가 안 붙어 나중에 이름으로 못 찾는다
     · 설명 적기    — 한 줄 적어 두면 검색에 걸린다
     · 사진 돌리기  — 누우면 글씨를 못 읽는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

function fnFrom(src, name, ctx, indent) {
  const close = '\\n' + (indent || '') + '\\}';
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?' + close));
  assert.ok(m, name + ' 를 찾지 못했습니다.');
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  return ctx[name];
}

/* ── 촬영일: 해가 바뀌면 사진까지 옮겨야 한다 (가장 위험한 곳) ── */
test('★ 같은 해 안에서 고치면 정보 한 줄만 바꾼다', async () => {
  const wrote = [];
  const ctx = {
    Number, Promise, String,
    yearOf: (ts) => String(new Date(ts).getFullYear()),
    metaPath: (y, id) => 'm/' + y + '/' + id,
    blobPath: (y, id) => 'b/' + y + '/' + id,
    thumbPath: (y, id) => 't/' + y + '/' + id,
    readOnce: () => Promise.resolve({ takenAt: 1 }),
    loadFull: () => Promise.resolve('FULL'),
    loadThumb: () => Promise.resolve('THUMB'),
    deps: { db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } }
  };
  const setTakenAt = fnFrom(store, 'setTakenAt', ctx, '  ');
  const ts = new Date(2026, 4, 3, 10, 0, 0).getTime();
  await setTakenAt('2026', 'p1', ts);
  assert.equal(wrote.length, 1);
  assert.deepEqual(Object.keys(wrote[0]), ['m/2026/p1/takenAt'],
    '같은 해면 사진을 옮길 필요가 없습니다.');
});

test('★ 해가 바뀌면 사진·미리보기까지 함께 옮기고 옛 자리는 지운다', async () => {
  const wrote = [];
  const ctx = {
    Number, Promise, String,
    yearOf: (ts) => String(new Date(ts).getFullYear()),
    metaPath: (y, id) => 'm/' + y + '/' + id,
    blobPath: (y, id) => 'b/' + y + '/' + id,
    thumbPath: (y, id) => 't/' + y + '/' + id,
    readOnce: () => Promise.resolve({ takenAt: 1, byName: '홍길동' }),
    loadFull: () => Promise.resolve('FULL'),
    loadThumb: () => Promise.resolve('THUMB'),
    deps: { db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } }
  };
  const setTakenAt = fnFrom(store, 'setTakenAt', ctx, '  ');
  const ts = new Date(2025, 11, 20, 9, 0, 0).getTime();
  const to = await setTakenAt('2026', 'p1', ts);
  assert.equal(to, '2025', '옮겨간 해를 알려 줘야 화면이 그 해로 옮겨 갑니다.');
  assert.equal(wrote.length, 1, '★ 한 묶음으로 넣고 지워야 합니다 — 나눠서 하다 끊기면 사진을 잃습니다.');
  const u = wrote[0];
  assert.equal(u['m/2025/p1'].takenAt, ts, '새 자리에 고친 날짜가 들어가야 합니다.');
  assert.equal(u['m/2025/p1'].byName, '홍길동', '나머지 정보도 따라가야 합니다.');
  assert.equal(u['b/2025/p1'], 'FULL');
  assert.equal(u['t/2025/p1'], 'THUMB');
  assert.equal(u['m/2026/p1'], null);
  assert.equal(u['b/2026/p1'], null, '옛 자리 사진을 안 지우면 용량이 두 배가 됩니다.');
  assert.equal(u['t/2026/p1'], null);
});

test('이상한 날짜는 받지 않는다', async () => {
  const ctx = { Number, Promise, String, yearOf: () => '2026', metaPath: () => 'm',
    blobPath: () => 'b', thumbPath: () => 't', readOnce: () => Promise.resolve({}),
    loadFull: () => Promise.resolve(''), loadThumb: () => Promise.resolve(''),
    deps: { db: { ref: () => ({ update: () => Promise.resolve() }) } } };
  const setTakenAt = fnFrom(store, 'setTakenAt', ctx, '  ');
  await assert.rejects(() => setTakenAt('2026', 'p1', NaN));
  await assert.rejects(() => setTakenAt('2026', 'p1', 0));
});

test('사진 정보를 못 찾으면 옛 자리를 안 지운다', async () => {
  const wrote = [];
  const ctx = { Number, Promise, String,
    yearOf: () => '2025', metaPath: (y, id) => 'm/' + y, blobPath: (y) => 'b/' + y,
    thumbPath: (y) => 't/' + y, readOnce: () => Promise.resolve(null),
    loadFull: () => Promise.resolve('F'), loadThumb: () => Promise.resolve('T'),
    deps: { db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } } };
  const setTakenAt = fnFrom(store, 'setTakenAt', ctx, '  ');
  await assert.rejects(() => setTakenAt('2026', 'p1', Date.now()));
  assert.equal(wrote.length, 0, '★ 못 읽었는데 옛 자리를 지우면 사진이 사라집니다.');
});

/* ── 업체·설명 ── */
test('★ 빈 값은 지운다 (빈 글자를 남기지 않는다)', async () => {
  const wrote = [];
  const ctx = { String, Object, Promise,
    metaPath: () => 'm/p1',
    deps: { db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } } };
  const saveNote = fnFrom(store, 'saveNote', ctx, '  ');
  await saveNote('2026', 'p1', { company: '  ', note: '현장' });
  assert.equal(wrote[0]['m/p1/company'], null, '빈 값을 남기면 「적었는데 비었음」과 구분이 안 됩니다.');
  assert.equal(wrote[0]['m/p1/note'], '현장');
});

test('안 넘긴 칸은 건드리지 않는다', async () => {
  const wrote = [];
  const ctx = { String, Object, Promise, metaPath: () => 'm/p1',
    deps: { db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } } };
  const saveNote = fnFrom(store, 'saveNote', ctx, '  ');
  await saveNote('2026', 'p1', { note: 'x' });
  assert.deepEqual(Object.keys(wrote[0]), ['m/p1/note'], '업체를 안 넘겼는데 지우면 안 됩니다.');
});

/* ── 돌리기 ── */
test('★ 사진과 미리보기를 함께 바꾼다', async () => {
  const wrote = [];
  const ctx = { Promise, blobPath: (y, id) => 'b/' + id, thumbPath: (y, id) => 't/' + id,
    deps: { db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } } };
  const replaceImage = fnFrom(store, 'replaceImage', ctx, '  ');
  await replaceImage('2026', 'p1', 'F2', 'T2');
  /* vm 안에서 만든 객체는 프로토타입이 달라 그냥은 안 맞는다 — 값만 본다 */
  assert.deepEqual(JSON.parse(JSON.stringify(wrote[0])), { 'b/p1': 'F2', 't/p1': 'T2' },
    '하나만 바꾸면 목록과 크게 보기가 서로 다르게 보입니다.');
  await assert.rejects(() => replaceImage('2026', 'p1', '', 'T2'), '빈 사진으로 덮으면 안 됩니다.');
});

test('돌리기는 되돌릴 수 없으므로 한 번 묻는다', () => {
  const m = html.match(/async function rotateOne\(deg\)[\s\S]*?\n\}/);
  assert.ok(m, 'rotateOne 이 없습니다.');
  assert.ok(/confirm\(/.test(m[0]) && /되돌릴 수 없습니다/.test(m[0]));
  assert.ok(/viewingOther\(\)/.test(m[0]), '남의 사진은 고칠 수 없습니다.');
  assert.ok(/shrinkDataUrl\(turned/.test(m[0]),
    '미리보기는 돌린 사진에서 다시 만들어야 합니다 — 옛 것을 돌리면 화질이 두 번 깎입니다.');
});

test('돌릴 때 가로세로가 바뀐다', () => {
  const m = html.match(/function rotateDataUrl\(src, deg\)[\s\S]*?\n\}/);
  assert.ok(/deg % 180/.test(m[0]) && /swap \? img\.height : img\.width/.test(m[0]),
    '90도 돌리면 폭과 높이가 뒤바뀝니다 — 안 바꾸면 잘립니다.');
});

/* ── 화면 배선 ── */
test('★ 남의 사진은 고칠 수 없다', () => {
  const m = html.match(/function myNoteBox\(it\)[\s\S]*?\n\}/);
  assert.ok(m && /viewingOther\(\)/.test(m[0]), '보기만 가능해야 합니다(2026-08-03 대표 지시).');
  const s = html.match(/async function saveMyNote\(\)[\s\S]*?\n\}/);
  assert.ok(/viewingOther\(\)/.test(s[0]), '화면만 숨기고 기능이 열려 있으면 막은 것이 아닙니다.');
});

test('★ 적은 업체·설명이 검색에 걸린다', () => {
  const m = html.match(/function hayOf\(it\)[\s\S]*?\n\}/);
  assert.ok(/m\.company \|\| ''/.test(m[0]) && /m\.note \|\| ''/.test(m[0]),
    '적어 놓고 못 찾으면 적을 이유가 없습니다.');
});

test('날짜만 고치고 시각은 지킨다', () => {
  const m = html.match(/async function saveMyNote\(\)[\s\S]*?\n\}/);
  assert.ok(/old\.getHours\(\)/.test(m[0]),
    '시각까지 0시로 밀면 그 날 사진 순서가 뒤집힙니다.');
});

test('해가 바뀌면 그 해 목록으로 데려간다', () => {
  const m = html.match(/async function saveMyNote\(\)[\s\S]*?\n\}/);
  assert.ok(/movedTo !== String\(gridYear\)/.test(m[0]) && /loadGrid\(\)/.test(m[0]),
    '옮겨 놓고 그대로 두면 사진이 사라진 것처럼 보입니다.');
  assert.ok(/refreshYears\(\)/.test(m[0]), '새로 생긴 해가 해 고르개에 나와야 합니다.');
});

test('이미 쓴 업체 이름을 골라 쓸 수 있다', () => {
  const m = html.match(/function companyChoices\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'companyChoices 가 없습니다.');
  assert.ok(/f\.company/.test(m[0]), 'AI가 읽은 업체도 후보에 넣어야 합니다.');
  assert.ok(/datalist/.test(html), '고를 수 있게 목록을 붙여야 같은 회사가 갈리지 않습니다.');
});

test('돌리기 단추가 사진 위에 있고 클릭이 위로 안 샌다', () => {
  assert.ok(/id="rotBar"/.test(html));
  assert.ok(/event\.stopPropagation\(\);rotateOne\(-90\)/.test(html)
         && /event\.stopPropagation\(\);rotateOne\(90\)/.test(html),
    '사진을 누르면 원본 크기로 열립니다 — 돌리기 단추 클릭이 위로 새면 안 됩니다.');
});
