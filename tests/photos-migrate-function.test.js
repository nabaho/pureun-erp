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

/* 2026-08-13 최종 리뷰 뒤 보강 — 세 가지를 새로 못 박는다. */

test('★ 권한 확인이 사진을 옮기기 전에 실제로 불린다 — 순서가 바뀌면 아무나 남의 사진을 옮깁니다', () => {
  const block = src.match(/exports\.migratePhotosToStorage[\s\S]*?\n\}\);/)[0];
  assert.match(block, /await requirePhotoAdmin\(req\)[\s\S]*migrateBatch\(/,
    '★ requirePhotoAdmin 이 migrateBatch 보다 앞에서, await 로 불려야 합니다.');
});

test('★ 시간제한·메모리를 기본값보다 올린다 — 30장 배치가 기본 60초에 못 끝날 수 있습니다', () => {
  const block = src.match(/exports\.migratePhotosToStorage[\s\S]*?\n\}\);/)[0];
  const rw = block.match(/\.runWith\(\{[\s\S]*?\}\)/);
  assert.ok(rw, 'runWith 설정을 찾지 못했습니다 — 기본 60초·256MB 로는 한 배치를 못 끝낼 수 있습니다.');
  assert.match(rw[0], /timeoutSeconds:\s*\d{2,}/);
});

test('응답에 ownersCount 를 실어 실제 직원 수와 비교할 수 있게 한다', () => {
  const block = src.match(/exports\.migratePhotosToStorage[\s\S]*?\n\}\);/)[0];
  assert.match(block, /ownersCount/,
    'owners 색인이 실제보다 적을 수 있다(옛 자리 옮기기만 한 사람은 로그인 전에는 색인에 없다) — ' +
    '응답에 인원수를 실어야 관리자가 "끝났습니다"를 그대로 믿지 않고 확인할 수 있습니다.');
});

test('★ 창고에 올리기 전에 실제 base64 data URL 인지 확인한다 — 안 하면 깨진 값도 "올라갔다"로 통과해 원본을 지웁니다', () => {
  const fn = src.match(/function realPhotoBucket\([\s\S]*?\n\}/)[0];
  assert.match(fn, /exec\(String\(dataUrl \|\| ["']["']\)\)/,
    'base64 data URL 형태를 확인하는 정규식을 찾지 못했습니다.');
  assert.match(fn, /Promise\.reject/,
    'data URL 이 아닐 때 거절할 방법이 없으면, Buffer.from 이 조용히 깨진 바이트를 올리고 ' +
    'exists() 는 여전히 참을 돌려줘 실시간DB 원본이 지워집니다.');
});
