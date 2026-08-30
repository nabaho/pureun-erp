'use strict';
/* 엑셀을 칸 그대로 읽고, 글자로 판독한다 (대표 결정 2026-08-23 「순서대로 모두」)
   실행: node --test tests/*.test.js

   왜 이렇게 하나: 판독기는 여태 **사진(jpeg)만** AI에 보냈다. 엑셀을 화면 찍어
   보내면 1↔7·4↔9 를 잘못 읽는다. 그런데 엑셀 파일 자체를 열면 칸 값이 **글자
   그대로** 나온다 — 오독이 있을 수가 없다.
   그래서 「파일에서 글자를 뽑아 → 그 글자를 AI에 보낸다」로 간다.
   AI 가 하는 일은 읽기가 아니라 **어느 칸이 무엇인가 판단**뿐이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const XLSX = require(path.join(R, 'vendor', 'xlsx.full.min.js'));

function loadFiles() {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-paydata-files.js'), 'utf8');
  // 브라우저에서는 <script src=xlsx…> 가 window.XLSX 를 만든다 — 그 모양대로 둔다
  const sandbox = { window: { XLSX: XLSX }, console, XLSX: XLSX };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'files.js' }).runInContext(sandbox);
  return sandbox.window.PuPaydataFiles;
}

/* 근태표 흉내 엑셀을 만든다 — 읽기를 검사하려면 진짜 xlsx 가 있어야 한다 */
function makeBook(rows, sheetName, extra) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName || 'Sheet1');
  if (extra) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(extra.rows), extra.name);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

const ROWS = [
  ['성명', '근무일수', '연장', '야간'],
  ['김철수', 22, 12, 4],
  ['이영희', 21, 0, 0]
];

/* ══════ 어떤 파일인가 ══════ */

test('★ 파일 종류를 가른다 — 사진·엑셀·문서·PDF', () => {
  const F = loadFiles();
  assert.equal(F.fileKind('근태표.xlsx'), 'sheet');
  assert.equal(F.fileKind('근태표.XLSX'), 'sheet', '대문자로 와도 같다');
  assert.equal(F.fileKind('명단.xls'), 'sheet');
  assert.equal(F.fileKind('자료.csv'), 'sheet');
  assert.equal(F.fileKind('계약서.hwp'), 'doc');
  assert.equal(F.fileKind('계약서.hwpx'), 'doc');
  assert.equal(F.fileKind('공문.docx'), 'doc');
  assert.equal(F.fileKind('대장.pdf'), 'pdf');
  assert.equal(F.fileKind('근태.jpg'), 'image');
  assert.equal(F.fileKind('근태.png'), 'image');
  assert.equal(F.fileKind('모름.zip'), 'other');
  assert.equal(F.fileKind(''), 'other');
});

/* ══════ 엑셀 — 칸 그대로 ══════ */

test('★ 시트 이름을 알려 준다 — 여러 장이면 사람이 고른다', () => {
  const F = loadFiles();
  const ab = makeBook(ROWS, '8월근태', { name: '집계', rows: [['합계', 43]] });
  assert.deepEqual(F.sheetNames(ab), ['8월근태', '집계']);
});

test('★ 칸을 탭으로 이어 글자를 만든다 — 값이 그대로 나온다', () => {
  const F = loadFiles();
  const t = F.sheetText(makeBook(ROWS), 'Sheet1');
  const lines = t.split('\n');
  assert.equal(lines[0], '성명\t근무일수\t연장\t야간');
  assert.equal(lines[1], '김철수\t22\t12\t4');
  assert.ok(t.indexOf('21') >= 0, '값이 빠졌습니다');
});

test('★ 숫자를 사람이 보는 그대로 담는다 — 1↔7 오독이 있을 수 없다', () => {
  const F = loadFiles();
  const t = F.sheetText(makeBook([['성명', '기본급'], ['김철수', 2400000]]), 'Sheet1');
  assert.ok(t.indexOf('2400000') >= 0);
});

test('★ 빈 줄과 빈 칸은 걷어낸다 — 엑셀은 아래로 천 줄이 비어 있다', () => {
  const F = loadFiles();
  const rows = [['성명', '근무일수'], ['김철수', 22], [], [], ['', ''], ['이영희', 21]];
  const t = F.sheetText(makeBook(rows), 'Sheet1');
  const lines = t.split('\n');
  assert.equal(lines.length, 3, '빈 줄이 남아 있습니다: ' + JSON.stringify(lines));
});

test('★ 두 번째 시트도 골라 읽는다', () => {
  const F = loadFiles();
  const ab = makeBook(ROWS, '8월근태', { name: '집계', rows: [['항목', '값'], ['합계', 43]] });
  const t = F.sheetText(ab, '집계');
  assert.ok(t.indexOf('합계') >= 0);
  assert.equal(t.indexOf('김철수'), -1, '엉뚱한 시트를 읽었습니다');
});

test('시트 이름을 안 주면 첫 시트를 읽는다', () => {
  const F = loadFiles();
  const t = F.sheetText(makeBook(ROWS, '8월근태'), '');
  assert.ok(t.indexOf('김철수') >= 0);
});

test('없는 시트를 달라고 하면 빈 글자다 — 엉뚱한 시트를 대신 읽지 않는다', () => {
  const F = loadFiles();
  assert.equal(F.sheetText(makeBook(ROWS), '없는시트'), '');
});

test('★ 너무 큰 시트는 잘라 낸다 — AI 에 통째로 보내면 잘리거나 돈이 튄다', () => {
  const F = loadFiles();
  const rows = [['성명', '값']];
  for (let i = 0; i < 900; i++) rows.push(['사람' + i, i]);
  const t = F.sheetText(makeBook(rows), 'Sheet1');
  const lines = t.split('\n');
  assert.ok(lines.length <= F.MAX_LINES + 1, '줄 수를 안 잘랐습니다: ' + lines.length);
  assert.match(t, /줄 더|잘랐/, '잘랐다는 말이 없으면 사람이 다 읽힌 줄 압니다');
});

test('★ 엑셀이 아닌 것을 주면 빈 글자다 — 쓰레기를 AI 에 보내지 않는다', () => {
  /* SheetJS 는 모르는 바이트를 CSV 로 여겨 그냥 읽는다(안 튕긴다). 그래서
     제어문자만 남은 칸이 프롬프트에 실릴 수 있었다 — 걷어내고 빈 글자로 둔다.
     그러면 판독 층이 「읽을 글자가 없습니다」로 사람에게 알린다. */
  const F = loadFiles();
  assert.equal(F.sheetText(new Uint8Array([1, 2, 3]).buffer, ''), '');
});

/* ══════ 글자로 판독 ══════ */

function loadRead(env) {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
  const sandbox = Object.assign({ window: {}, console }, env || {});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  /* 실제 화면과 **같이** 싣는다 — 판독 층은 주민번호 지우개가 없으면 글자 판독을
     막는다(2026-08-17). 여기서 안 실으면 진짜 화면과 다른 조건으로 시험하는 셈이다. */
  new vm.Script(fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask.js'), 'utf8'),
    { filename: 'pu-rrn-mask.js' }).runInContext(sandbox);
  new vm.Script(src, { filename: 'pu-doc-read.js' }).runInContext(sandbox);
  return sandbox.window.PuDocRead;
}

function fakeFetch(reply) {
  const calls = [];
  const fn = function (url, init) {
    calls.push({ url: url, body: JSON.parse(init.body) });
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: reply }] } }] })
    });
  };
  fn.calls = calls;
  return fn;
}

const REPLY = JSON.stringify({
  company: '화담원', period: '2026-08', docName: '근태표',
  rows: [{ name: '김철수', pairs: [{ item: '근무일수', value: '22' }] }]
});

test('★ 판독 층에 글자 판독이 붙는다 — 사진 판독은 그대로다', () => {
  const D = loadRead();
  assert.equal(typeof D.readTableText, 'function');
  assert.equal(typeof D.readWageTable, 'function', '사진 판독을 건드리면 안 됩니다');
  assert.equal(typeof D.read, 'function', '사진첩·기업정보함이 쓰는 read 를 건드리면 안 됩니다');
});

test('★ 글자를 보내면 사람별 값으로 돌아온다', async () => {
  const D = loadRead();
  const f = fakeFetch(REPLY);
  D.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  const r = await D.readTableText('성명\t근무일수\n김철수\t22');
  assert.equal(r.ok, true);
  assert.equal(r.company, '화담원');
  assert.equal(r.rows[0].name, '김철수');
  assert.equal(r.rows[0].pairs[0].value, '22');
});

test('★ 사진이 아니라 글자로 보낸다 — 그림 조각이 섞이면 안 된다', async () => {
  const D = loadRead();
  const f = fakeFetch(REPLY);
  D.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  await D.readTableText('성명\t근무일수\n김철수\t22');
  const parts = f.calls[0].body.contents[0].parts;
  assert.equal(parts.filter(p => p.inline_data).length, 0, '그림으로 보냈습니다');
  const text = parts.map(p => p.text || '').join('\n');
  assert.ok(text.indexOf('김철수') >= 0, '표 글자가 안 실렸습니다');
});

test('★ 빈 글자를 보내면 AI 를 안 부른다 — 헛돈이다', async () => {
  const D = loadRead();
  const f = fakeFetch(REPLY);
  D.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  const r = await D.readTableText('   ');
  assert.equal(r.ok, false);
  assert.equal(f.calls.length, 0);
  assert.match(r.error, /글자|읽을/);
});

test('어디서 온 글자인지 함께 알려 주면 프롬프트에 실린다', async () => {
  const D = loadRead();
  const f = fakeFetch(REPLY);
  D.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  await D.readTableText('성명\t근무일수\n김철수\t22', '엑셀 · 8월근태 시트');
  const text = f.calls[0].body.contents[0].parts.map(p => p.text || '').join('\n');
  assert.ok(text.indexOf('8월근태') >= 0);
});

test('AI 가 이상한 답을 보내면 사람 말로 알려 준다', async () => {
  const D = loadRead();
  D.init({ fetch: fakeFetch('이건 JSON 이 아니다'), getKey: () => Promise.resolve('KEY') });
  const r = await D.readTableText('성명\t값\n김철수\t1');
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('★ 판독 층이 주민번호를 한 번 더 지운다 — 부르는 쪽이 잊어도 안 나간다', async () => {
  /* 사진 가림과 같은 원칙이다: 문지기가 한 곳뿐이면 그 한 곳을 빠뜨렸을 때
     그대로 나간다. 글자는 자리를 틀릴 일이 없으니 여기서도 지운다. */
  const src = fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask.js'), 'utf8');
  const box = { window: {}, console };
  box.globalThis = box;
  vm.createContext(box);
  new vm.Script(src, { filename: 'rrn.js' }).runInContext(box);

  // 브라우저에서는 pu-rrn-mask.js 가 window.PuRrnMask 를 만든다 — 그 모양대로
  const D = loadRead({ window: { PuRrnMask: box.window.PuRrnMask } });
  const f = fakeFetch(REPLY);
  D.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  await D.readTableText('김철수\t900101-1234567\t22');
  const text = f.calls[0].body.contents[0].parts.map(p => p.text || '').join('\n');
  assert.equal(text.indexOf('1234567'), -1, '주민번호가 AI 로 나갔습니다');
  assert.ok(text.indexOf('김철수') >= 0, '이름까지 지우면 안 됩니다');
});
