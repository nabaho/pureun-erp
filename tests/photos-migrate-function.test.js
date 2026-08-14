'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');

test('★ 사진 이사 엔드포인트가 있다', () => {
  assert.match(src, /exports\.migratePhotosToStorage\s*=\s*functions/);
});

test('★ 인증 없이는 실행하지 않는다 — 총괄관리자만', () => {
  const fn = src.match(/async function requirePhotoAdmin\([\s\S]*?\n\}/);
  assert.ok(fn, 'requirePhotoAdmin 을 찾지 못했습니다.');
  assert.match(fn[0], /verifyIdToken/);
  assert.match(fn[0], /uid_roles/);
  assert.match(fn[0], /role\.isAdmin !== true/);
});

test('기존 CORS 를 재사용한다 — 새로 만들지 않는다', () => {
  const block = src.match(/exports\.migratePhotosToStorage[\s\S]*?\n\}\);/);
  assert.ok(block, '엔드포인트 본문을 찾지 못했습니다.');
  assert.match(block[0], /setAutomationCors\(req, res\)/,
    '★ 새 CORS 함수를 또 만들면 pu-photos.html 도메인을 다시 허용 목록에 추가해야 합니다.');
});

test('★ photos-migrate.js 의 migrateBatch 를 그대로 쓴다 — 로직을 또 베끼지 않는다', () => {
  assert.match(src, /require\(["']\.\/photos-migrate["']\)/);
  const block = src.match(/exports\.migratePhotosToStorage[\s\S]*?\n\}\);/);
  assert.match(block[0], /migrateBatch\(/);
});

test('POST 가 아니면 거절한다', () => {
  const block = src.match(/exports\.migratePhotosToStorage[\s\S]*?\n\}\);/);
  assert.match(block[0], /req\.method !== ["']POST["']/);
});

test('응답은 moved·skipped·failed·done 을 그대로 돌려준다', () => {
  const block = src.match(/exports\.migratePhotosToStorage[\s\S]*?\n\}\);/);
  ['moved', 'skipped', 'failed', 'done'].forEach(function (k) {
    assert.ok(block[0].indexOf(k) > -1, k + ' 를 응답에서 못 찾았습니다.');
  });
});

test('창고는 서울 버킷(pureun-erp-hrphotos) — 사진첩 새 창고와 같아야 한다', () => {
  assert.match(src, /getStorage\(\)\.bucket\(["']pureun-erp-hrphotos["']\)/,
    'PR #192 에서 만든 창고 이름과 다릅니다 — pu-photos.html 이 보는 창고와 어긋납니다.');
});

test('firebase-admin/storage 를 실제로 불러온다', () => {
  assert.match(src, /require\(["']firebase-admin\/storage["']\)/,
    'getStorage 를 안 불러오면 실행 시(런타임)에야 터집니다 — import 를 소스에서 미리 확인합니다.');
});
