'use strict';
/* 한글·워드·PDF 에서 글자를 뽑아 판독한다 (대표 결정 2026-08-23 ②③)
   실행: node --test tests/*.test.js

   추출기(hwp_extract.js)는 취업규칙(rules.html)에서 **이미 돌고 있는** 것을 그대로
   쓴다 — HWP 5.0·HWPX·DOCX·ODT·RTF·PDF 를 한 함수(extractDocText)로 가려 읽는다.
   여기서 검사하는 것은 「급여데이터함이 그 추출기를 제대로 이어 붙였나」다.

   ⚠ 스캔한 종이 PDF 는 글자가 없다 — 그때는 뽑을 것이 없다고 **바로 말해야** 한다.
   빈 글자를 AI 에 보내면 「아무것도 못 읽었다」만 돌아오고 돈만 나간다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');

function cut(name) {
  const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

/* ══════ 추출기 자체 — 진짜 파일로 확인한다 ══════ */

test('★ 추출기가 HWPX·DOCX·PDF 를 한 함수로 가려 읽는다', () => {
  const src = fs.readFileSync(path.join(R, 'hwp_extract.js'), 'utf8');
  // 브라우저에는 늘 있는 것들 — 모래상자에도 넣어 준다
  const sandbox = { console, require, module: { exports: {} }, TextDecoder, TextEncoder, Uint8Array, DataView };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'hwp.js' }).runInContext(sandbox);
  const api = sandbox.module.exports;
  assert.equal(typeof api.extractDocText, 'function');
  assert.equal(typeof api.extractHwpText, 'function', 'HWP 5.0');
  assert.equal(typeof api.extractHwpxText, 'function', 'HWPX');
  assert.equal(typeof api.extractPdfText, 'function', 'PDF');
});

test('★ 진짜 DOCX 에서 글자가 나온다 — 이어 붙인 것이 실제로 도는지 본다', async () => {
  /* 글자를 뽑는 길이 살아 있는지 **한 번은 진짜 파일로** 확인해야 한다.
     DOCX 는 ZIP+XML 이라 검사 안에서 만들 수 있다(HWP 5.0 은 못 만든다). */
  const XLSX = require(path.join(R, 'vendor', 'xlsx.full.min.js'));
  const pako = require(path.join(R, 'vendor', 'pako.min.js'));
  const src = fs.readFileSync(path.join(R, 'hwp_extract.js'), 'utf8');
  // 브라우저에는 늘 있는 것들 — 모래상자에도 넣어 준다
  const sandbox = { console, require, module: { exports: {} }, TextDecoder, TextEncoder, Uint8Array, DataView };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'hwp.js' }).runInContext(sandbox);
  const api = sandbox.module.exports;

  const body = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>'
    + '<w:p><w:r><w:t>근로계약서(변경)</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>근로자: 김철수</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>기본급: 2,400,000원</w:t></w:r></w:p>'
    + '</w:body></w:document>';
  const zip = makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'word/document.xml', data: body }
  ]);
  const text = await api.extractDocText(zip, XLSX, pako, null);
  assert.match(text, /김철수/, '이름이 안 나왔습니다');
  assert.match(text, /2,400,000/, '금액이 안 나왔습니다');
});

/* 압축 없는(stored) ZIP 을 손으로 만든다 — 라이브러리 없이도 만들 수 있다 */
function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const crcTable = (function () {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 255, (v >> 8) & 255]; }
  function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }

  files.forEach(f => {
    const nameB = enc.encode(f.name);
    const dataB = enc.encode(f.data);
    const crc = crc32(dataB);
    const local = [].concat([0x50, 0x4b, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(dataB.length), u32(dataB.length), u16(nameB.length), u16(0));
    parts.push(new Uint8Array(local), nameB, dataB);
    central.push({ name: nameB, crc: crc, size: dataB.length, offset: offset });
    offset += local.length + nameB.length + dataB.length;
  });

  const cenStart = offset;
  central.forEach(c => {
    const rec = [].concat([0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(c.offset));
    parts.push(new Uint8Array(rec), c.name);
    offset += rec.length + c.name.length;
  });
  const end = [].concat([0x50, 0x4b, 0x05, 0x06], u16(0), u16(0),
    u16(central.length), u16(central.length), u32(offset - cenStart), u32(cenStart), u16(0));
  parts.push(new Uint8Array(end));

  let total = 0;
  parts.forEach(p => { total += p.length; });
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach(p => { out.set(p, at); at += p.length; });
  return out.buffer;
}

/* ══════ 화면 배선 ══════ */

test('★ 한글·PDF 도 글자로 읽는 갈래에 든다', () => {
  const m = HTML.match(/const READ_TEXT_KINDS = \[[^\]]*\];/);
  assert.ok(m, 'READ_TEXT_KINDS 를 찾을 수 없습니다');
  assert.match(m[0], /'sheet'/);
  assert.match(m[0], /'doc'/);
  assert.match(m[0], /'pdf'/);
});

test('★ 한글·PDF 를 열면 글자 뽑기로 간다', () => {
  assert.match(HTML, /startDocRead\(/, '글자 뽑기로 가는 길이 없습니다');
  assert.match(cut('startDocRead'), /extractDocText\(/, '추출기를 안 부릅니다');
});

test('★ 도구를 그 파일을 열 때만 내려받는다 — 폰 첫 화면이 느려지면 안 된다', () => {
  const src = cut('needDocLib');
  ['xlsx.full.min.js', 'pako.min.js', 'pdf.min.js', 'hwp_extract.js'].forEach(f => {
    assert.ok(src.indexOf(f) >= 0, f + ' 를 안 챙깁니다');
  });
  /* 이 넷은 머리(<head>)에 미리 싣지 않는다 — 합쳐서 2MB 가 넘는다.
     vendor/ 를 아예 안 쓰는 것이 아니라 「필요할 때」 쓰는 것이 요점이다. */
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  assert.equal(/src="vendor\/xlsx/.test(head), false, '엑셀 도구를 머리에 실었습니다');
  assert.equal(/src="hwp_extract/.test(head), false, '추출기를 머리에 실었습니다');
});

test('★ 스캔 PDF(글자 없음)는 바로 그렇다고 말한다 — AI 를 안 부른다', () => {
  const src = cut('startDocRead');
  assert.match(src, /글자가 없는/, '왜 안 되는지 한국어로 말해야 합니다');
  assert.match(src, /사진으로 찍어/, '무엇을 하면 되는지 알려 줘야 합니다');
});

test('★ 뽑은 글자에서도 주민번호를 지운다', () => {
  assert.match(cut('startDocRead'), /maskRrnInText/, '한글 문서에는 주민번호가 흔합니다');
});

test('★ 늦게 온 답이 다른 서류에 얹히지 않는다', () => {
  // 큰 파일을 뽑는 사이 다른 서류를 열 수 있다 — 그때 답이 오면 엉뚱한 곳에 붙는다
  const src = cut('startDocRead');
  assert.match(src, /const forId = App\.viewerId/);
  assert.match(src, /App\.viewerId !== forId/);
});
