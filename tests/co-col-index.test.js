'use strict';
/* 업체관리 «칸 감추기»의 자리번호가 실제 표와 맞는가 (2026-09-05)

   ■ 무엇이 일어났나
   「번호」 칸이 3번째로 끼어들었는데 감추기 등록부(CO_COLS_FULL/SUB)의 자리번호를
   안 고쳤다. 감추기는 nth-child 로 자리를 세므로, 그날부터 «한 칸씩 왼쪽»이 감춰졌다.
   대표 화면에서는 업체명 칸이 한 글자씩 세로로 쪼개져 나왔다.

   소스에는 이미 「컬럼 추가·이동 시 아래 idx도 함께 갱신할 것」이라 적혀 있었다.
   ★ 주석은 아무것도 막지 못한다. 그래서 검사가 «머리글을 직접 세어» 맞대어 본다.

   ■ 못 박는 것 — 「지금 번호가 5다」가 아니라 「등록부와 표가 같다」이다.
     칸을 더하든 옮기든, 둘이 어긋나면 그 자리에서 걸린다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = stripComments(src);

/* 표 머리 배열을 오려 «그려지는 순서대로» 이름표를 뽑는다.
   h('th', …, '이름') 과 thF('이름', …) 두 꼴이 섞여 있다. */
function headerLabels(startKey, endKey) {
  const a = bare.indexOf("key:'" + startKey + "'");
  assert.ok(a > 0, startKey + ' 머리글을 찾지 못했습니다');
  const b = bare.indexOf("key:'" + endKey + "'", a);
  assert.ok(b > a, endKey + ' 머리글을 찾지 못했습니다');
  const seg = bare.slice(a - 20, bare.indexOf(']', b));
  const out = [];
  const re = /h\('th',\s*\{[^]*?\}\s*,\s*'([^']*)'|thF\('([^']*)'/g;
  let m;
  while ((m = re.exec(seg))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

/* 등록부를 읽는다 — {k, label, idx} */
function registry(name) {
  const a = bare.indexOf('var ' + name + ' = [');
  assert.ok(a > 0, name + ' 를 찾지 못했습니다');
  const seg = bare.slice(a, bare.indexOf('];', a));
  const out = [];
  const re = /\{k:'([^']+)',label:'([^']+)',idx:(\d+)/g;
  let m;
  while ((m = re.exec(seg))) out.push({ k: m[1], label: m[2], idx: +m[3] });
  return out;
}

/* 머리글과 등록부의 이름표가 «글자 그대로» 같지는 않다 —
   머리글은 '세금계산서 발급일'·'🏦CMS', 등록부는 '세금계산서발급일'·'CMS'.
   띄어쓰기와 그림글자를 걷고 견준다 (검사가 «자리»를 보게 하려는 것이지
   이름표 띄어쓰기를 못 박으려는 것이 아니다). */
const norm = (s) => String(s == null ? '' : s).replace(/[^0-9A-Za-z가-힣]/g, '');

/* 첫 칸(체크상자)은 이름표가 없다 — 자리 세기에는 들어가므로 1을 더해 맞춘다 */
function checkTable(startKey, endKey, regName, human) {
  const labels = headerLabels(startKey, endKey);
  assert.ok(labels.length >= 10, human + ' 머리글을 제대로 못 읽었습니다 (' + labels.length + '개)');
  const reg = registry(regName);
  assert.ok(reg.length >= 10, regName + ' 를 제대로 못 읽었습니다');

  /* 이름표가 있는 첫 칸은 '#'. 체크상자가 그 앞 1번이므로 '#' 은 2번이다. */
  assert.strictEqual(labels[0], '#', human + ' 의 두 번째 칸이 「#」이 아닙니다');
  const pos = {};
  labels.forEach((lab, i) => { const n = norm(lab); if (n && !(n in pos)) pos[n] = i + 2; });   // +2 = 체크상자 + 0기준

  reg.forEach((c) => {
    const want = pos[norm(c.label)];
    assert.ok(want !== undefined,
      human + ' 표에 「' + c.label + '」 칸이 없는데 감추기 등록부에는 있습니다');
    assert.strictEqual(c.idx, want,
      human + ' 「' + c.label + '」 의 자리가 어긋났습니다 — 등록부 ' + c.idx
      + ', 실제 ' + want + ' (칸을 더했으면 등록부의 idx 도 함께 옮겨야 합니다)');
  });
}

test('전체 표 — 감추기 자리번호가 실제 칸 자리와 같다', () => {
  checkTable('a1', 'a19', 'CO_COLS_FULL', '전체');
});

test('사무대행 표 — 감추기 자리번호가 실제 칸 자리와 같다', () => {
  checkTable('h1', 'h8', 'CO_COLS_SUB', '사무대행');
});

/* 2026-09-05 대표 지적: 「번호 옆에 빈공간 너무 많다」.
   표가 화면을 꽉 채우면(.dt{width:100%}) 남는 너비가 «너비를 안 정한» 칸들에 퍼진다.
   「자문-10193」 은 60px 이면 되는데 200px 가까이 벌어져 있었다.
   ★ 같은 표를 그대로 만들어 픽셀을 재 봤다 —
     width:1%(내용만큼)는 «아무 효과가 없었고», 못 박은 너비만 그대로 지켜졌다
     (90px → 106px, 다른 칸은 합쳐 7px 양보). 그래서 「못 박혀 있는가」를 본다. */
test('번호 칸은 남는 너비를 빨아들이지 않는다 (너비가 못 박혀 있다)', () => {
  ["key:'a1n'", "key:'h1n'"].forEach((k) => {
    const at = bare.indexOf(k);
    assert.ok(at > 0, k + ' 를 찾지 못했습니다');
    const seg = bare.slice(at, at + 200);
    assert.ok(/번호/.test(seg), k + ' 가 번호 칸이 아닙니다');
    const w = /width\s*:\s*'(\d+)px'/.exec(seg);
    assert.ok(w, '번호 칸에 너비가 없습니다 (' + k + ')');
    /* ★ 「적게 적어야 적게 받는다」 — 표가 남는 너비를 «바라는 너비에 비례해» 나눠 주므로
       보기 좋은 수(88px 등)를 적으면 그만큼 더 받아 도로 벌어진다.
       실측: 88px → 200px 로 벌어졌고, 1px → 글자 너비(76px)에 붙었다.
       글자는 nowrap 이라 이 수가 작아도 찌그러지지 않는다. */
    assert.ok(+w[1] <= 10,
      '번호 칸 너비가 ' + w[1] + 'px 입니다 — 크게 적을수록 남는 너비를 더 받아 도로 벌어집니다 ('
      + k + '). 작게 적고 nowrap 으로 글자를 지키세요.');
    assert.ok(/whiteSpace\s*:\s*'nowrap'/.test(seg),
      '번호가 두 줄로 접히면 안 됩니다 (' + k + ')');
  });
});

test('업체명 칸은 세로로 쪼개지지 않는다 (가장 좁아져도 최소 너비가 있다)', () => {
  ["key:'a2'", "key:'h2'"].forEach((k) => {
    const at = bare.indexOf(k);
    assert.ok(at > 0, k + ' 를 찾지 못했습니다');
    const seg = bare.slice(at, at + 400);
    assert.ok(/업체명/.test(seg), k + ' 가 업체명 칸이 아닙니다');
    assert.ok(/minWidth\s*:\s*'\d+px'/.test(seg),
      '업체명 칸에 최소 너비가 없습니다 — 칸이 좁아지면 한 글자씩 세로로 흐릅니다 (' + k + ')');
  });
});

/* ★★ 머리글의 최소 너비만으로는 못 막았다 (대표 2026-09-05: 「업체명 너무 짤린다」).
   칸이 눌리면 브라우저가 한글을 «글자마다» 끊어 「(주)크레/컴, 스마/이오)」 처럼
   석 줄로 흘렸다 — 표 높이는 배로 늘고 정작 이름은 못 읽는다.
   몸통 칸이 스스로 «한 줄»을 지켜야 한다. 자르되 감추지는 않는다(온이름은 말풍선에). */
test('★★ 업체명 몸통 칸은 한 줄로 자르고 온이름을 말풍선에 남긴다', () => {
  const cells = [];
  const re = /h\('td',\s*\{[^]{0,300}?title:co\.name[^]{0,80}?\}\s*,/g;
  let m;
  while ((m = re.exec(bare))) cells.push(m[0]);
  assert.strictEqual(cells.length, 2,
    '업체명 몸통 칸이 두 표(전체·사무대행)에 있어야 합니다 — 찾은 것 ' + cells.length + '개');
  cells.forEach((cell, i) => {
    assert.match(cell, /whiteSpace\s*:\s*'nowrap'/,
      (i + 1) + '번째 업체명 칸이 줄바꿈을 막지 않습니다 — 좁아지면 세로로 쪼개집니다');
    assert.match(cell, /textOverflow\s*:\s*'ellipsis'/,
      (i + 1) + '번째 업체명 칸에 … 처리가 없습니다 — 잘린 줄도 모르게 됩니다');
    assert.match(cell, /overflow\s*:\s*'hidden'/, (i + 1) + '번째 업체명 칸에 overflow 가 없습니다');
    assert.match(cell, /maxWidth\s*:\s*'\d+px'/,
      (i + 1) + '번째 업체명 칸에 최대 너비가 없습니다 — 없으면 … 가 안 걸립니다');
  });
});
