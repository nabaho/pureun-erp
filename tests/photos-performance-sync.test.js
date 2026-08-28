const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'pu-photo-store.js'), 'utf8');

/* 2026-08-13 대표 지시로 기준이 바뀌었다 — 촬영시각이 아니라 **올린 시각**이 먼저다.
   ("입력된 사진은 사진의 저장된 시간 날짜가 아닌 지금 올린 시간과 순서대로")
   자세한 검사는 tests/photos-upload-order.test.js 에 있다. */
test('전체사진은 올린시각, 고른차례, 촬영시각, 사진번호 순으로 안정되게 정렬한다', () => {
  const ctx = { Number, String, Math };
  vm.createContext(ctx);
  for (const name of ['photoTime', 'comparePhotosNewest']) {
    const m = html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수가 없습니다.');
    vm.runInContext(m[0], ctx);
  }
  const list = [
    { id: 'old', meta: { takenAt: 10, upAt: 100 } },
    { id: 'fallback', meta: { upAt: 200 } },
    { id: 'shotLate', meta: { takenAt: 300, upAt: 50 } }
  ];
  list.sort(ctx.comparePhotosNewest);
  // 늦게 찍혔어도 먼저 올렸으면 아래다 — 자리는 올린 때가 정한다
  assert.deepEqual(list.map(x => x.id), ['fallback', 'old', 'shotLate']);
  // 올린 시각이 같으면 고른 차례가 가른다(1번으로 고른 장이 앞)
  const batch = [
    { id: 'b', meta: { upAt: 500, seq: 1 } },
    { id: 'a', meta: { upAt: 500, seq: 0 } }
  ];
  batch.sort(ctx.comparePhotosNewest);
  assert.deepEqual(batch.map(x => x.id), ['a', 'b']);
});

test('휴대폰은 첫 60장만 먼저 그리고 아래로 갈 때 이어 그린다', () => {
  assert.match(html, /const PHONE_PHOTO_BATCH = 60/);
  assert.match(html, /items\.slice\(0, gridRenderLimit\)/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /function showMorePhotos\([\s\S]*?fillThumbs\(\)/);
});

test('묶음 미리보기가 막혀도 네 갈래까지만 동시에 받아 팝업을 오래 막지 않는다', () => {
  const fn = html.match(/function fillThumbsOneByOne\([\s\S]*?\n\}/)[0];
  assert.match(fn, /Promise\.all\(\[worker\(\), worker\(\), worker\(\), worker\(\)\]\)/);
  assert.doesNotMatch(fn, /chain = chain\.then/);
});

test('사진 저장과 사용자 색인을 한 번에 저장해 다른 기기 전체사진에서 누락되지 않는다', () => {
  /* 2026-08-13 창고 저장으로 savePhoto 는 分기만 하고, 실제 쓰기는
     saveMetaOnly(창고)·saveToRtdb(옛 방식) 두 갈래로 나뉘었다 — 어느 길로
     가도 색인 쓰기가 함께 있는지는 그 갈래들까지 봐야 한다. */
  const fn = store.match(/function savePhoto\([\s\S]*?function saveToRtdb\([\s\S]*?\n  \}/)[0];
  assert.match(fn, /u\[ownerPath\(deps\.uid\)\]/);
  assert.match(fn, /deps\.db\.ref\(\)\.update\(u\)/);
});

test('관리자 PC는 다른 휴대폰 업로드를 감지하고 자동으로 목록을 갱신한다', () => {
  assert.match(store, /function watchUploadIndex\(/);
  assert.match(store, /DB_ROOT \+ '\/owners'/);
  assert.match(store, /ref\.on\('value'/);
  assert.match(html, /watchUploadIndex\(scheduleRemotePhotoRefresh\)/);
  assert.match(html, /addEventListener\('visibilitychange'/);
});

test('회의사진은 독립 분류로 유지되고 확인필요 오류로 취급하지 않는다', () => {
  assert.match(html, /\{ key: 'meeting', label: '회의사진'/);
  /* ⚠ 2026-08-15 다시 겨눔 — 「보관만 하는 갈래」를 KEEP_ONLY 한 곳으로 모았다.
     예전에는 함수마다 갈래 이름을 따로 적었고, 그래서 계약서를 넣을 때 한쪽이
     빠져 영영 안 없어지는 ⚠ 가 생겼다. 지킬 것은 「회의사진은 할 일이 아니다」
     이지 그 판정이 어떤 글자로 적혀 있는가가 아니다. */
  assert.match(html, /const KEEP_ONLY = \{[^}]*meeting: 1/,
    '회의사진이 「보관만」 목록에서 빠졌습니다 — 확인 필요로 잡히게 됩니다');
  /* ⚠ 2026-08-27 또 옮겼다 — 판정이 checkWhy 한 곳으로 모였다(needsCheck 는 그것을
     그대로 쓴다). 「할 일이 아니다」는 이제 빈 말을 내놓는 것으로 나타난다. */
  assert.match(html, /if \(KEEP_ONLY\[r\.kind\]\) return ''/);
});
