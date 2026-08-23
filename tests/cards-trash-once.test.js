'use strict';
/* 명함첩 휴지통은 «구독하지 않는다» — 요금 조사 2026-08-18

   ■ 잰 것
   휴지통 1,888건 = **0.71MB**. `.on('value')` 로 구독하면 누가 명함을 한 장
   지우거나 되살릴 때마다 그 0.71MB 가 **명함첩을 켜 둔 모든 기기로** 다시 내려간다.
   휴지통은 평소에 들여다보는 자리가 아닌데도 그랬다.

   ■ 왜 글자로 못 박나
   구독 방식은 「무엇을 부르는가」가 전부다 — 화면은 어느 쪽이든 똑같이 돈다.
   그래서 눈으로는 못 가리고, 되돌아가도 아무도 모른다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');            // 주석에 적힌 낱말에 속지 않게

test('★ 휴지통을 구독하지 않는다 — 한 번만 읽는다', () => {
  assert.doesNotMatch(src, /ref\(DB_ROOT\+'\/trash'\)\.on\(/,
    '★ 구독으로 되돌아갔습니다 — 누가 한 장 지울 때마다 0.71MB 가 모든 기기로 갑니다.');
  assert.match(src, /ref\(DB_ROOT\+'\/trash'\)\.once\('value'\)/,
    '휴지통을 아예 안 읽으면 배지 숫자와 30일 정리가 죽습니다.');
});

test('★ 한 번 읽은 뒤 화면을 다시 그린다 — 안 그리면 배지가 0으로 남는다', () => {
  const at = src.indexOf("ref(DB_ROOT+'/trash').once('value')");
  assert.ok(at > 0);
  const arm = src.slice(at, at + 260);
  assert.match(arm, /state\.trash = s\.val\(\)\|\|\{\}/);
  assert.match(arm, /renderSoon\(\)/,
    '구독이면 저절로 다시 그려졌지만, 한 번 읽기는 직접 그려 줘야 합니다.');
});

test('★ 30일 정리는 그대로 돈다 — 안 돌면 휴지통이 영영 안 비워진다', () => {
  const at = src.indexOf("ref(DB_ROOT+'/trash').once('value')");
  assert.match(src.slice(at, at + 300), /_trashPurgeDone[\s\S]*?purgeTrash/);
});

test('★ 읽기가 실패해도 명함첩이 멎지 않는다', () => {
  /* 권한·연결 문제로 휴지통을 못 읽는다고 명함 목록까지 안 뜨면 안 된다. */
  const at = src.indexOf("ref(DB_ROOT+'/trash').once('value')");
  assert.match(src.slice(at, at + 320), /\.catch\(/);
});

test('명함 목록은 여전히 실시간이다 — 휴지통과 헷갈려 같이 끊으면 안 된다', () => {
  assert.match(src, /watchCardMap\(this\.db\.ref\(DB_ROOT\+'\/items'\)/,
    '★ 명함 목록까지 끊으면 동료가 넣은 명함이 안 보입니다.');
  assert.doesNotMatch(src, /ref\(DB_ROOT\+'\/items'\)\.on\('value'/,
    '★ 명함 한 장이 바뀌 때 전체 목록을 다시 받으면 요금이 다시 늘어납니다.');
});
