/* 칸에 설명 보이기 + 크게 보기 사진 끌어내기 — 대표 지시 2026-08-10
   "승진텍라인 등 내용을 넣고 저장하면 사진 아래에 간략하게 설명내용이 나왔으면 좋겠다"
   "전체화면도 마우스 드래그해서 이동 가능하게. 이동해서 다른 프로그램에 직접 넣을 수 있게" */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ── 칸에 적어 둔 업체·설명 ── */
test('★ 업체·설명을 칸에 한 줄로 보여 준다', () => {
  assert.match(app, /it\.meta\.company, it\.meta\.note/,
    '저장한 업체·설명을 칸에서 못 보면 열어 봐야만 압니다.');
  assert.match(app, /#grid \.cell \.cap\{/, '설명 줄을 담을 자리가 없습니다.');
});

test('★ 「확인 필요」를 볼 때는 할 일이 설명보다 앞선다', () => {
  assert.match(app, /!\(needOnly && needsCheck\(it\)\)/,
    '자리가 겹칩니다 — 할 일이 남은 사진에는 할 일을 보여 줘야 합니다.');
});

test('적어 둔 것이 없으면 빈 줄을 그리지 않는다', () => {
  assert.match(app, /capTxt &&/, '빈 띠가 사진을 가립니다.');
});

/* ── 크게 보기에서 끌어내기 ── */
test('★ 크게 보기 사진은 끌 수 있다', () => {
  const m = app.match(/<img id="viewerImg"[^>]*>/);
  assert.ok(m, 'viewerImg 를 찾지 못했습니다.');
  assert.match(m[0], /draggable="true"/, '못 끌면 다른 프로그램에 넣을 수 없습니다.');
  assert.match(m[0], /ondragstart="viewerDragOut\(/, '끌 때 할 일이 붙어 있어야 합니다.');
});

test('★ 끌 때 우리 표식을 심는다 (재복사 방지)', () => {
  const m = app.match(/function viewerDragOut\(e\)[\s\S]*?\n\}/);
  assert.ok(m, 'viewerDragOut 을 찾지 못했습니다.');
  assert.match(m[0], /PuDrag\.set\(/,
    '표식이 없으면 창이 남의 파일로 오해해 같은 사진을 다시 올립니다.');
});

test('★ 다른 프로그램이 알아듣는 모양으로 넘긴다', () => {
  const m = app.match(/function viewerDragOut\(e\)[\s\S]*?\n\}/);
  assert.match(m[0], /setData\('DownloadURL', 'image\/jpeg:'/,
    'DownloadURL 이라야 한글·워드·메일이 파일로 받습니다.');
  assert.match(m[0], /dataUrlToBlobUrl/, 'data: 주소로는 잘 안 됩니다 — blob: 으로 바꿔야 합니다.');
});

test('만든 주소를 놓아 준다 (기억이 새지 않게)', () => {
  const m = app.match(/function viewerDragOut\(e\)[\s\S]*?\n\}/);
  assert.match(m[0], /revokeObjectURL/, '만들기만 하고 안 놓으면 기억이 샙니다.');
});

test('파일 이름에 못 쓰는 글자를 걷어낸다', () => {
  const m = app.match(/function viewerDragOut\(e\)[\s\S]*?\n\}/);
  assert.match(m[0], /replace\(\/\[\\\\\/:\*\?"<>\|\]\/g, ''\)/,
    '못 쓰는 글자가 남으면 저장이 통째로 실패합니다.');
});

/* ── 실제로 바꿔 본다 ── */
test('★ data: 주소를 blob: 으로 바꾼다', () => {
  const src = app.match(/function dataUrlToBlobUrl\(src\)[\s\S]*?\n\}/)[0];
  const made = [];
  const ctx = {
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    Uint8Array, Blob: function (parts, o) { this.parts = parts; this.type = o && o.type; },
    URL: { createObjectURL: (b) => { made.push(b); return 'blob:fake/1'; } },
    TextEncoder, decodeURIComponent
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const f = vm.runInContext('dataUrlToBlobUrl', ctx);
  const out = f('data:image/jpeg;base64,' + Buffer.from('hello').toString('base64'));
  assert.equal(out, 'blob:fake/1');
  assert.equal(made.length, 1);
  assert.equal(made[0].type, 'image/jpeg', '종류를 잘못 적으면 받는 쪽이 못 엽니다.');
});

test('못 바꿔도 터지지 않는다', () => {
  const src = app.match(/function dataUrlToBlobUrl\(src\)[\s\S]*?\n\}/)[0];
  const ctx = { atob: () => { throw new Error('bad'); }, Uint8Array, Blob: function () {}, URL: {}, TextEncoder };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(vm.runInContext('dataUrlToBlobUrl', ctx)('그림이 아님'), null,
    '여기서 터지면 드래그 자체가 막힙니다.');
});
