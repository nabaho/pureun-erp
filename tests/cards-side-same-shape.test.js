/* 기업정보함 옆줄 — 사업자와 기업 상세의 폴더 자리를 «같게» 맞춘다.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-18: "사업자와 기업상세 같은 폴더 위치와 하위 폴더 위치 만들어달라
   조금 다르다 차이 구분하고"

   ★ 실제로 무엇이 달랐나 (코드에서 확인한 것)
     ① 「전체」 자리 — 사업자는 「폴더 ＋」 머리 «다음», 기업 상세는 머리 «위»였다.
        같은 앱인데 두 화면의 차례가 거꾸로였다.
     ② 폴더 줄 들여쓰기 — 사업자 폴더 줄에는 13px 빈 칸이 앞에 있어 이름이 밀려 있고,
        기업 상세에는 없어 폴더 이름이 살짝 왼쪽에 붙었다.
     ③ 폴더 목록 칸 — 사업자는 #pcFolderList 안에 담겨 폴더가 늘어나도 그 칸만 구른다.
        기업 상세는 그냥 이어 붙여, 폴더가 늘면 아래 「서류 탭」이 화면 밖으로 밀렸다.

   ★ 재 본 값 (창 1400×900, 실제로 그려서 잰 것)
     둘 다 — 폴더 머리 왼쪽 18px · 「전체」 줄 14px · 폴더 이름 45px */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 기업 상세 옆줄 토막 — 이름 있는 표식으로 자른다(길이로 자르면 근처가 길어질 때 터진다) */
function coSide(){
  const i = src.indexOf("if(state.view==='co'){");
  assert.ok(i > 0, '기업 상세 옆줄을 못찾음');
  const j = src.indexOf('innerHTML = h; return;', i);
  assert.ok(j > i, '기업 상세 옆줄 끝을 못찾음');
  return src.slice(i, j);
}
/* 명함·사업자 옆줄의 폴더 부분 */
function listSide(){
  const i = src.indexOf('const folderRow = (g) =>');
  assert.ok(i > 0, '명함 폴더 줄을 못찾음');
  return src.slice(src.lastIndexOf("h += `<div class=\"pcsec\"", i) - 400, src.indexOf('담당자별 (직원)', i));
}

/* ══════ ① 「전체」가 폴더 머리 다음이다 ══════ */

test('기업 상세도 「폴더 ＋」 머리 다음에 「전체」가 온다', () => {
  const s = coSide();
  const head = s.indexOf('>폴더');
  const all = s.indexOf("'📋 전체'");
  assert.ok(head > 0, '폴더 머리가 없다');
  assert.ok(all > 0, '「전체」 줄이 없다');
  assert.ok(all > head, '「전체」가 아직 폴더 머리보다 위에 있다');
});

test('사업자도 같은 차례다 — 두 화면이 어긋나지 않는다', () => {
  const s = listSide();
  const head = s.indexOf('>폴더');
  const all = s.indexOf("'📋 전체'");
  assert.ok(head > 0 && all > head, '명함·사업자 쪽 차례가 바뀌었다');
});

/* ══════ ② 폴더 줄 들여쓰기가 같다 ══════ */

test('기업 상세 폴더 줄에도 13px 들여쓰기 빈 칸이 있다', () => {
  /* 이것이 없으면 폴더 이름이 사업자 쪽보다 왼쪽에 붙어 두 화면이 미묘하게 다르다. */
  const s = coSide();
  const i = s.indexOf("pickCoFolder('f:${f.id}')");
  assert.ok(i > 0, '폴더 줄을 못찾음');
  const before = s.slice(Math.max(0, i - 260), i);
  assert.match(before, /width:13px;display:inline-block/, '들여쓰기 빈 칸이 없다');
});

test('사업자 폴더 줄도 같은 빈 칸을 쓴다', () => {
  const s = listSide();
  assert.match(s, /width:13px;display:inline-block/);
});

test('폴더 줄 안쪽 여백(padding-left)도 두 화면이 같다', () => {
  assert.match(coSide(), /class="pcitem folderrow \$\{on\?'on':''\}" style="padding-left:11px"/);
  assert.match(listSide(), /class="pcitem folderrow \$\{on\?'on':''\}" style="padding-left:11px"/);
});

/* ══════ ③ 폴더 목록이 따로 구르는 칸에 담긴다 ══════ */

test('기업 상세 폴더도 #pcFolderList 안에 담긴다', () => {
  /* 폴더가 늘어나도 아래 「서류 탭」이 화면 밖으로 밀리지 않아야 한다. */
  const s = coSide();
  assert.match(s, /h \+= `<div id="pcFolderList">`/, '스크롤 칸을 안 쓴다');
  assert.ok(s.indexOf('h += `</div>`') > s.indexOf('h += `<div id="pcFolderList">`'), '칸을 안 닫는다');
});

test('여는 것과 닫는 것이 한 짝이다 — 안 닫으면 아래 칸들이 그 안에 갇힌다', () => {
  const s = coSide();
  const open = (s.match(/<div id="pcFolderList">/g) || []).length;
  assert.equal(open, 1, '스크롤 칸이 여러 번 열린다');
});

test('폴더가 하나도 없을 때도 칸 안에서 안내가 나온다', () => {
  const s = coSide();
  const open = s.indexOf('<div id="pcFolderList">');
  const hint = s.indexOf('＋ 를 눌러 폴더를 만들면');
  const close = s.indexOf('h += `</div>`', open);
  assert.ok(open < hint && hint < close, '안내문이 스크롤 칸 밖에 있다');
});

/* ══════ ④ 남은 «참된» 차이는 그대로 둔다 ══════ */

test('「담당자별」은 명함·사업자에만 있다 — 회사에는 담당자 갈래가 없다', () => {
  /* 이건 모양 차이가 아니라 «있는 자료»의 차이다. 억지로 맞추면 빈 칸만 생긴다. */
  assert.match(listSide() + src.slice(src.indexOf('담당자별 (직원)'), src.indexOf('담당자별 (직원)') + 40), /담당자별/);
  assert.ok(!/담당자별/.test(coSide()), '기업 상세에 없는 갈래를 억지로 넣었다');
});

test('「서류 탭」은 기업 상세에만 있다 — 사진첩 서식에서 저절로 생기는 것이다', () => {
  assert.match(coSide(), /서류 탭/);
});
