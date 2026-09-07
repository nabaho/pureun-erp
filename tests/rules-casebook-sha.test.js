'use strict';
/* 파일 해시 — 끊긴 업로드를 안전하게 다시 돌리는 열쇠 (spec §7)

   수백 건은 반드시 중간에 끊긴다. 같은 파일을 또 올렸는지 이걸로 걸러야
   중복이 쌓이지 않고, 같은 폴더를 다시 떨어뜨려도 이어서 올라간다.
   crypto.subtle 은 브라우저와 Node 24 에 모두 있어 한 갈래로 쓴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

const enc = (s) => new TextEncoder().encode(s);

test('★ 알려진 값과 맞는다 — 빈 입력의 SHA-256', async () => {
  assert.equal(await CB.shaOf(enc('')),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('★ 같은 내용이면 같은 해시', async () => {
  assert.equal(await CB.shaOf(enc('취업규칙')), await CB.shaOf(enc('취업규칙')));
});

test('★ 한 글자만 달라도 다른 해시', async () => {
  assert.notEqual(await CB.shaOf(enc('취업규칙')), await CB.shaOf(enc('취업규책')));
});

test('16진수 64자를 돌려준다', async () => {
  const h = await CB.shaOf(enc('가나다'));
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('ArrayBuffer 도 받는다 — 파일에서 읽으면 이 꼴로 온다', async () => {
  const u8 = enc('취업규칙');
  assert.equal(await CB.shaOf(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)),
    await CB.shaOf(u8));
});
