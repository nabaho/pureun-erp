/* 주소로 사진 하나 열기 — 기업정보에서 「원본 보기」를 눌렀을 때 그 서류를 띄우는 통로.
   ⚠ openViewer 는 gridItems 안에 있는 사진만 연다. 그래서 연도를 먼저 맞추고
     목록을 불러온 **다음에야** 열 수 있다. 그 차례가 이 기능의 전부다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const cards  = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('주소에서 사진 번호·연도·주인을 읽는다', () => {
  assert.match(photos, /function readAskedPhoto/);
  assert.match(photos, /q\.get\('photo'\)/);
  assert.match(photos, /q\.get\('year'\)/);
  assert.match(photos, /q\.get\('owner'\)/);
});

test('연도를 먼저 맞춘 다음 목록을 부른다', () => {
  /* 뒤바뀌면 엉뚱한 해의 목록에서 찾다가 「없다」고 한다 */
  /* ⚠ 'startUploadWatch();' 로 잡으면 함수 **정의**가 먼저 걸린다 — 부르는 자리를 곧바로 잡는다 */
  const ask = photos.indexOf('goPhotoIfAsked();');
  assert.ok(ask > 0, 'goPhotoIfAsked 를 부르는 자리를 찾지 못했습니다');
  const boot = photos.indexOf('const finishPhotoBoot', ask);
  const load = photos.indexOf('loadGrid();', ask);
  assert.ok(load > ask, '연도를 맞추기 전에 목록을 부른다');
  /* 계정이 바뀌거나 로그아웃된 뒤 느린 응답이 돌아오는 경우를 막기 위해 이제
     목록 읽기는 finishPhotoBoot 안에서 계정 세대 검사를 거친다. 글자 수로 거리를
     제한하지 말고, 주소 적용 → 안전한 부팅 → 목록 읽기 순서를 직접 확인한다. */
  assert.ok(boot > ask && load > boot,
    '주소 적용 뒤 안전한 부팅을 거쳐 목록을 읽는 순서가 아니다');
});

test('목록이 실린 뒤에 연다', () => {
  const at = photos.indexOf('function loadGrid()');
  const fn = photos.slice(at, at + 1400);
  const grid = fn.indexOf('renderGrid();');
  const open = fn.indexOf('openAskedPhoto();');
  assert.ok(grid > 0 && open > grid, '목록을 그리기 전에 열려고 한다');
});

test('한 번 열면 지운다', () => {
  /* 안 지우면 다른 해로 옮길 때마다 그 사진이 다시 튀어나온다 */
  const at = photos.indexOf('function openAskedPhoto');
  const fn = photos.slice(at, at + 900);
  assert.equal((fn.match(/_askedPhoto = null/g) || []).length, 2,
    '못 찾았을 때와 열었을 때 둘 다 지워야 한다');
});

test('못 찾으면 조용히 넘기지 않는다', () => {
  /* 지웠거나 볼 권한이 없을 수 있다 — 말 안 하면 「고장」으로 읽는다 */
  assert.match(photos, /그 서류 사진을 찾지 못했습니다/);
});

test('기업정보에서 새 창으로 연다', () => {
  /* 지금 창을 갈아타면 보던 회사와 고르던 것이 다 날아간다 */
  assert.match(cards, /function openCoDoc/);
  assert.match(cards, /window\.open\('pu-photos\.html\?' \+ q, '_blank'\)/);
  assert.match(cards, /onclick="openCoDoc\(/);
});

test('주소에 넣는 값은 인코딩한다', () => {
  /* 사진 번호에 &·= 가 들어가면 주소가 갈라진다 */
  const at = cards.indexOf('function openCoDoc');
  const fn = cards.slice(at, at + 600);
  assert.equal((fn.match(/encodeURIComponent/g) || []).length, 3);
});

test('사진 번호가 없는 옛 기록은 까닭을 말한다', () => {
  assert.match(cards, /예전 방식으로 보낸 서류입니다/);
});

test('주인도 맞춘 다음 목록을 부른다', () => {
  /* 연도만 맞추고 주인을 그대로 두면 **내 사진 목록**을 불러오므로 남이 올린 서류는
     아무리 찾아도 없다 — 「원본 보기가 안 된다」의 진짜 까닭이었다(2026-08-13). */
  const at = photos.indexOf('function goPhotoIfAsked');
  const fn = photos.slice(at, photos.indexOf('function openCamIfAsked', at));
  assert.match(fn, /gridOwner = \(who === me\.uid\) \? null : who/, '주인을 안 맞춘다');
  assert.match(fn, /who === me\.uid/, '내 사진인데도 남의 자리로 바꾸면 안 된다');
});
