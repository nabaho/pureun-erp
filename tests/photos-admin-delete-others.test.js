/* 총괄 관리자가 남의 사진을 지운다 — 대표 지시 2026-08-10
   "전체관리자 권형하는 사진을 삭제할 권한이 있다. 삭제하려는데 안된다."

   막혀 있던 이유는 권한이 아니라 **저장 층이 주인을 안 받아서**였다.
   deletePhoto 가 owner 를 안 받으면 남의 사진을 지울 때 내 자리를 두드려
   조용히 끝난다 — 화면에서만 사라지고 실제 사진은 그대로 남는다.
   그래서 잠금을 푸는 것과 주인을 태우는 것은 **함께** 가야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'pu-photo-store.js'), 'utf8');
const rules = fs.readFileSync(
  path.join(root, 'docs', 'firebase-rules-현재적용본.json'), 'utf8');

const del = store.match(/function deletePhoto\([\s\S]*?\n  \}/);

test('★ 저장 층이 주인을 받는다', () => {
  assert.ok(del, 'deletePhoto 를 찾지 못했습니다.');
  assert.match(del[0], /function deletePhoto\(year, id, why, owner\)/,
    '주인을 안 받으면 남의 사진을 지울 때 내 자리를 두드립니다.');
});

test('★ 지우는 모든 자리에 주인을 태운다 — 한 곳만 빠져도 반만 지워진다', () => {
  /* 묶음 쓰기(update)는 전부 아니면 전무다. 한 자리라도 내 것을 가리키면
     엉뚱한 곳을 지우거나 규칙에 걸려 통째로 실패한다. */
  ['metaPath(year, id, owner)', 'blobPath(year, id, owner)',
    'thumbPath(year, id, owner)', 'trashPath(year, id, owner)',
    'logPath(id, owner)'].forEach(function (p) {
      assert.ok(del[0].indexOf(p) > -1, p + ' 에 주인이 안 실렸습니다.');
    });
});

test('★ 지우기 전에 읽는 것도 주인 자리에서 읽는다', () => {
  /* 내 자리에서 읽으면 아무것도 없으니 "사진을 읽지 못해 지우지 않았습니다"로
     끝난다 — 관리자는 눌러도 아무 일이 없다고 느낀다. */
  ['readOnce(metaPath(year, id, owner))', 'loadFull(year, id, owner)',
    'loadThumb(year, id, owner)'].forEach(function (p) {
      assert.ok(del[0].indexOf(p) > -1, p + ' 이 내 자리를 읽습니다.');
    });
});

test('★ 휴지통은 주인 자리에 남는다', () => {
  /* 관리자 휴지통에 담으면 주인은 자기 사진이 어디로 갔는지 찾을 길이 없다.
     누가 지웠는지는 지운 기록(by·byName)에 남는다. */
  assert.ok(/u\[trashPath\(year, id, owner\)\]/.test(del[0]),
    '남의 사진이 관리자 휴지통으로 가면 주인이 되살릴 수 없습니다.');
  assert.ok(/by: deps\.uid/.test(del[0]) && /byName: deps\.name/.test(del[0]),
    '누가 지웠는지 안 남기면 "이건 왜 없어졌나"에 답할 수 없습니다.');
});

test('★ 부르는 쪽이 주인을 실제로 넘긴다 — 안 넘기면 아무것도 안 바뀐다', () => {
  /* ⚠ 줄 단위로 본다 — 인자 안에 photoOwner(id) 처럼 괄호가 또 들어가서
     [^)]* 로 자르면 넘긴 것까지 안 넘긴 것으로 읽힌다. */
  const calls = app.split(/\r?\n/).filter(function (l) {
    return l.indexOf('PuPhotoStore.deletePhoto(') > -1;
  });
  assert.ok(calls.length >= 4, '지우는 곳을 다 찾지 못했습니다 (' + calls.length + '곳).');
  const bare = calls.filter(function (c) { return !/photoOwner\(/.test(c); });
  /* 스스로 치우는 중복 정리 한 곳만 예외다 — 거기는 내 사진만 다룬다
     (dropRedundant 가 isMinePhoto 로 먼저 거른다). */
  assert.ok(bare.length <= 1,
    '주인을 안 넘기는 곳이 ' + bare.length + '곳 있습니다: ' + bare.join(' / '));
});

test('★ 판독 결과도 주인 자리에 쓴다', () => {
  /* 내 자리에 쓰면 주인 화면에는 「아직 안 읽음」으로 남아 같은 일을 또 한다. */
  const calls = app.split(/\r?\n/).filter(function (l) {
    return l.indexOf('PuPhotoStore.saveRead(') > -1;
  });
  assert.ok(calls.length >= 5, '판독 결과를 쓰는 곳을 다 찾지 못했습니다.');
  const bare = calls.filter(function (c) {
    return !/photoOwner\(|, owner\)/.test(c);
  });
  assert.ok(bare.length <= 1,
    '주인을 안 넘기는 곳이 ' + bare.length + '곳 있습니다: ' + bare.join(' / '));
});

test('★ 주인 자리를 고를 때 표(__all__)를 넘기지 않는다', () => {
  /* gridOwner 에는 사람 아이디가 아닌 표가 들어올 수 있다. 그대로 넘기면
     puphotos/u/__all__ 같은 없는 자리를 두드린다. */
  const fn = app.match(/function photoOwner\(id\)[\s\S]*?\n\}/);
  assert.ok(fn, 'photoOwner 를 찾지 못했습니다.');
  assert.ok(/__ownerUid/.test(fn[0]), '사진에 적힌 주인을 안 봅니다.');
  assert.ok(/gridOwner !== ALL_OWNERS && gridOwner !== SHARED_OWNER/.test(fn[0]),
    '표를 걸러내지 않으면 없는 자리를 두드립니다.');
});

test('★ 서버 규칙도 관리자 쓰기를 허락한다', () => {
  /* 코드만 열고 규칙이 막으면 눌러도 아무 일이 없다 — 화면에서만 사라진다.
     규칙의 진짜 원본은 콘솔이지만, 저장소 사본이 어긋나 있으면 다음 사람이
     이 사본을 그대로 올려 기능을 도로 막는다. */
  const j = JSON.parse(rules);
  const w = j.rules.puphotos.u.$uid['.write'];
  assert.ok(/isAdmin/.test(w),
    '규칙이 관리자 쓰기를 안 허락하면 지우기가 서버에서 거부됩니다.');
  assert.ok(/auth\.uid === \$uid/.test(w), '본인 쓰기까지 막으면 안 됩니다.');
});
