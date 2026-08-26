/* 사진첩(pu-photos.html) 창고 이전 — 비용 조사 뒤 대표 결정 2026-08-13

   왜 새 창고인가: 기본 창고(pureun-erp.firebasestorage.app)는 미국(us-east1)에
   있고 위치를 못 바꾼다. 근로자 개인정보가 담긴 서류·사진이라 서울에 두기로
   했다(기업정보함과 같은 이유, 다른 창고 — 대상·규칙이 서로 달라 안 섞는다).

   gov-consulting.html 은 사진첩 사진을 "가져오기"만 한다(dropFromAlbum·
   openAlbumPicker) — 같은 창고를 봐야 사진첩이 창고로 옮긴 사진도 읽힌다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const gov = fs.readFileSync(path.join(R, 'gov-consulting.html'), 'utf8');

test('★ pu-photos.html 은 서울 창고를 본다(미국 기본 창고가 아니다)', () => {
  const m = photos.match(/storageBucket:\s*'([^']+)'/);
  assert.ok(m, 'storageBucket 설정이 없습니다.');
  assert.notEqual(m[1], 'pureun-erp.firebasestorage.app',
    '기본 창고는 미국(us-east1)이고 위치를 못 바꿉니다.');
  assert.equal(m[1], 'pureun-erp-hrphotos');
});

test('★ gov-consulting.html 도 같은 창고를 본다 — 안 맞으면 옮긴 사진을 못 가져온다', () => {
  const mp = photos.match(/storageBucket:\s*'([^']+)'/);
  const mg = gov.match(/storageBucket:\s*"([^"]+)"/);
  assert.ok(mp && mg, '두 파일 다 storageBucket 설정이 있어야 합니다.');
  assert.equal(mg[1], mp[1],
    '사진첩과 다른 창고를 보면, 사진첩이 창고로 옮긴 뒤에는 이 화면에서 그 사진을 못 읽습니다.');
});

test('★ gov-consulting.html 은 저장 층에 창고를 넘긴다', () => {
  /* ⚠ 「두 곳 모두」가 아니라 「세우는 곳마다」를 본다 — 2026-08-26 에 네 곳이
     photoStoreOn() 한 곳으로 모였다. 몇 곳인지를 못 박으면, 옳게 모았는데도
     검사가 운다(실제로 그랬다). 몇 곳이든 창고를 넘기는지만 지킨다. */
  const calls = gov.split(/\r?\n/).filter(function (l) {
    return l.indexOf('PuPhotoStore.init(') > -1;
  });
  assert.ok(calls.length >= 1, 'PuPhotoStore.init 호출을 찾지 못했습니다.');
  const bare = calls.filter(function (c) { return c.indexOf('storage:') === -1; });
  assert.equal(bare.length, 0,
    'storage 를 안 넘기면 사진첩이 창고로 옮긴 사진은 loadFull 이 실시간DB에서 ' +
    '이미 지워진 본문을 찾다가 빈손으로 돌아옵니다: ' + bare.join(' / '));
});
