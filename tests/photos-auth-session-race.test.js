'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('계정이 바뀌면 이전 사진첩 부팅 예약과 로그인 응답을 무효화한다', () => {
  const authStart = html.indexOf('firebase.auth().onAuthStateChanged');
  const authEnd = html.indexOf('/* ══════ 카톡·갤러리에서 공유 받기', authStart);
  const block = html.slice(authStart, authEnd);
  assert.ok(authStart >= 0 && authEnd > authStart);
  assert.match(block, /const authGeneration = \+\+photoAuthGeneration/);
  assert.match(block, /clearTimeout\(photoBootTimer\)/);
  assert.match(block, /PuPhotoStore\.clearIdentity/);
  assert.match(block, /authGeneration !== photoAuthGeneration/);
  assert.match(block, /active\.uid !== u\.uid/);
  assert.match(block, /auth\/stale-session/);
});

test('로그아웃하면 카메라와 원격 사진 감시를 함께 정리한다', () => {
  const start = html.indexOf('if (!signedIn) {');
  const end = html.indexOf('return;', start);
  const block = html.slice(start, end);
  assert.match(block, /stopUploadWatch\(\)/);
  assert.match(block, /clearTimeout\(remoteRefreshTimer\)/);
  assert.match(block, /camStop\(\)/);
  assert.match(block, /clearIdentity/);
});
