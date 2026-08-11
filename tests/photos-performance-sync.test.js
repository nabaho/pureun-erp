const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'pu-photo-store.js'), 'utf8');

test('전체사진은 촬영시각, 업로드시각, 사진번호 순으로 안정되게 정렬한다', () => {
  const ctx = {};
  vm.createContext(ctx);
  for (const name of ['photoTime', 'comparePhotosNewest']) {
    const m = html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수가 없습니다.');
    vm.runInContext(m[0], ctx);
  }
  const list = [
    { id: 'old', meta: { takenAt: 10, upAt: 100 } },
    { id: 'fallback', meta: { upAt: 200 } },
    { id: 'new', meta: { takenAt: 300, upAt: 50 } }
  ];
  list.sort(ctx.comparePhotosNewest);
  assert.deepEqual(list.map(x => x.id), ['new', 'fallback', 'old']);
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
  const fn = store.match(/function savePhoto\([\s\S]*?\n  \}/)[0];
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
  assert.match(html, /if \(r\.kind === 'meeting'\) return false/);
});
