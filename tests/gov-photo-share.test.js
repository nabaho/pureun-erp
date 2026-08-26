/* 기업정보함 — 사진 공유 (대표 지시 2026-08-26)
   "원칙적으로 자기 사진은 자기만 보게 하고, 사진첩에서 공유된 경우
    공유된 사람만 같이 기업정보함에서 공유될 수 있게 해달라."

   ★ 이 검사가 지키는 것은 «두 방향»이다
     막는 쪽 — 증빙 사진은 서버로 안 나간다. 참고 캡처는 주인 자리를 읽는다.
     여는 쪽 — 공유받은 사진은 고르기 창에 «나와야» 한다(전에는 아예 못 썼다).

   ⚠ 자리를 한 값(albumPickOwner)으로 묶어 두면 공유받은 사진만 통째로 안 보인다.
     그 되돌림을 잡는 것이 이 파일의 절반이다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const GOV = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');

/* 순수 로직만 떠서 돌린다 — 화면(DOM)이 없어도 되는 부분이다.
   ⚠ 길이를 못 박아 자르지 않는다(주석 한 줄 늘면 깨진다). 표식 사이를 벤다. */
function sandbox() {
  const from = GOV.indexOf('function pkSharedRows(');
  const to = GOV.indexOf('function pkLoadYear(');
  assert.ok(from > 0 && to > from, '공유 로직 표식을 못 찾았다');
  const ctx = { albumPickOwner: 'ME' };
  vm.createContext(ctx);
  new vm.Script(GOV.slice(from, to)).runInContext(ctx);
  return ctx;
}

/* refCapWhy 도 따로 뜬다 (같은 방식) */
function whyFn() {
  const from = GOV.indexOf('function refCapWhy(');
  const to = GOV.indexOf('function refCapBlocked(');
  assert.ok(from > 0 && to > from, 'refCapWhy 표식을 못 찾았다');
  const ctx = {};
  vm.createContext(ctx);
  new vm.Script(GOV.slice(from, to)).runInContext(ctx);
  return ctx.refCapWhy;
}

/* ── 여는 쪽: 공유받은 사진이 고르기 창에 들어온다 ── */

test('사진첩이 준 「나에게 공유된 것」을 고르기 창 모양으로 바꾼다', () => {
  const { pkSharedRows } = sandbox();
  const rows = pkSharedRows({
    p1: { __year: '2026', __ownerUid: 'U9', __ownerName: '김노무', takenAt: 5 },
  });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, 'p1');
  assert.strictEqual(rows[0].year, '2026');
  assert.strictEqual(rows[0].shared, true, '공유받은 것이라는 표가 있어야 한다');
  assert.strictEqual(rows[0].owner, 'U9', '주인 자리를 알아야 읽을 수 있다');
  assert.strictEqual(rows[0].ownerName, '김노무', '누가 준 것인지 보여 줘야 한다');
});

test('주인이나 해를 모르는 것은 버린다 — 읽을 자리를 못 찾는다', () => {
  const { pkSharedRows } = sandbox();
  const rows = pkSharedRows({
    ok:     { __year: '2026', __ownerUid: 'U1' },
    noYear: { __ownerUid: 'U1' },
    noOwn:  { __year: '2026' },
  });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, 'ok');
});

test('__sharedYear 만 있어도 읽는다', () => {
  const { pkSharedRows } = sandbox();
  const rows = pkSharedRows({ p: { __sharedYear: '2025', __ownerUid: 'U2' } });
  assert.strictEqual(rows[0].year, '2025');
});

test('빈 목록·없는 목록에도 안 넘어진다', () => {
  const { pkSharedRows } = sandbox();
  assert.strictEqual(pkSharedRows({}).length, 0);
  assert.strictEqual(pkSharedRows(null).length, 0);
});

/* ── 자리: 공유받은 것은 «주인 자리»에서 읽는다 ── */

test('공유받은 사진은 주인 자리, 내 사진은 내 자리', () => {
  const { pkOwnerOf } = sandbox();
  assert.strictEqual(pkOwnerOf({ shared: true, owner: 'U9' }), 'U9');
  assert.strictEqual(pkOwnerOf({ id: 'x' }), 'ME', '내 것은 albumPickOwner');
  assert.strictEqual(pkOwnerOf(null), 'ME');
});

test('주인이 안 적힌 공유 사진은 내 자리로 떨어진다 — 못 읽고 끝난다(조용히 남의 것을 열지 않는다)', () => {
  const { pkOwnerOf } = sandbox();
  assert.strictEqual(pkOwnerOf({ shared: true, owner: '' }), 'ME');
});

test('미리보기·원본·표를 한 값이 아니라 사진마다 정한 자리에서 읽는다', () => {
  /* ⚠ 되돌림 방지: owner 하나로 묶으면 공유받은 사진이 통째로 안 보인다 */
  assert.ok(GOV.includes('PuPhotoStore.loadThumb(it.year, it.id, pkOwnerOf(it))'),
    '미리보기가 사진마다 자리를 정해야 한다');
  assert.ok(GOV.includes('PuPhotoStore.loadFull(s.year, s.id, pkOwnerOf(it)||owner)'),
    '원본도 사진마다 자리를 정해야 한다');
  assert.ok(GOV.includes('owner:pkOwnerOf(it)||owner'),
    '참고 캡처 표에 주인을 적어야 나중에 그 자리를 읽는다');
});

/* ── 겹치지 않게 ── */

test('내 것으로도 있고 공유로도 온 사진은 한 번만 나온다', () => {
  const { pkMergeItems } = sandbox();
  const out = pkMergeItems(
    [{ id: 'a', meta: { takenAt: 2 } }],
    [{ id: 'a', meta: { takenAt: 2 }, shared: true }, { id: 'b', meta: { takenAt: 9 } }]
  );
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out.filter(r => r.id === 'a').length, 1);
});

test('겹칠 때 «내 것»이 남는다 — 내 자리로 읽는 쪽이 확실하다', () => {
  const { pkMergeItems } = sandbox();
  const out = pkMergeItems([{ id: 'a', meta: {} }], [{ id: 'a', meta: {}, shared: true }]);
  assert.strictEqual(out[0].shared, undefined);
});

test('찍은 때 내림차순으로 섞인다 — 공유받은 것이 뒤에 몰리지 않는다', () => {
  const { pkMergeItems } = sandbox();
  const out = pkMergeItems(
    [{ id: 'old', meta: { takenAt: 1 } }],
    [{ id: 'new', meta: { takenAt: 100 }, shared: true }]
  );
  assert.strictEqual(out[0].id, 'new');
});

/* ── 창을 열 때마다 다시 받는다 ── */

test('창을 열 때마다 공유 목록을 다시 받는다 — 풀린 공유가 남아 보이면 안 된다', () => {
  /* ⚠ 주석 안에 있는 글자에 속지 않게 «줄 통째로» 본다.
       /* PK.sharedDone=false; *​/ 로 막아 놔도 통과하던 검사였다. */
  assert.ok(/^\s*PK\.sharedDone\s*=\s*false;\s*$/m.test(GOV),
    'openAlbumPicker 에서 되돌려야 한다 (주석 처리도 안 된다)');
  assert.ok(GOV.includes('sharedDone:false'), 'PK 에 칸이 있어야 한다');
  assert.ok(GOV.includes('if(first && !PK.sharedDone)'), '한 창에서 한 번만 받는다');
});

test('공유 목록을 못 받아도 내 사진은 보인다', () => {
  const at = GOV.indexOf('PuPhotoStore.listSharedToMe()');
  assert.ok(at > 0, '공유 목록을 받아야 한다');
  const near = GOV.slice(at, at + 700);
  assert.ok(/catch\(function\(e\)\s*\{\s*console\.warn/.test(near),
    '공유 목록 실패가 창 전체를 비우면 안 된다');
});

/* ── 남의 자리에 쓰지 않는다 ── */

test('공유받은 사진에는 「쓴 것」을 적지 않는다 — 막힐 줄 알면서 보내지 않는다', () => {
  assert.ok(GOV.includes('if(!(it&&it.shared)) markAlbumUsed('),
    '남의 자리 쓰기는 서버가 막는다 — 오류만 쌓인다');
});

test('공유받은 사진을 내 자리로 옮기지 않는다', () => {
  /* 옮기면 주인이 공유를 풀어도 내 자리에 남아 «풀 수 없는 사진»이 된다 */
  const from = GOV.indexOf('function pkSharedRows(');
  const to = GOV.indexOf('function pkLoadYear(');
  const body = GOV.slice(from, to);
  assert.ok(!/save|upload|put\(|copyTo/i.test(body), '공유받은 것은 주인 자리에 둔다');
});

/* ── 막는 쪽: 못 읽은 참고 캡처가 까닭을 말한다 ── */

test('공유받지 않은 캡처는 「공유받지 않은 사진입니다」라고 적는다', () => {
  const why = whyFn();
  assert.strictEqual(why({ code: 'PERMISSION_DENIED' }), '공유받지 않은 사진입니다');
  assert.strictEqual(why(new Error('permission_denied at /puphotos')), '공유받지 않은 사진입니다');
  assert.strictEqual(why({ message: 'Unauthorized' }), '공유받지 않은 사진입니다');
});

test('자리는 읽혔는데 그림이 없으면 「지워진 사진」이다', () => {
  const why = whyFn();
  assert.strictEqual(why(null), '사진첩에서 지워진 사진입니다');
});

test('까닭을 모르면 아는 척하지 않는다', () => {
  const why = whyFn();
  assert.strictEqual(why(new Error('network timeout')), '사진을 불러오지 못했습니다');
});

test('못 읽은 캡처를 조용히 넘기지 않는다 — 빈 catch 로 되돌리면 안 된다', () => {
  const at = GOV.indexOf('function loadRefCapThumbs(');
  assert.ok(at > 0);
  const body = GOV.slice(at, at + 900);
  assert.ok(!/\.catch\(function\(\)\{\}\)/.test(body), '조용한 실패로 되돌리면 안 된다');
  /* ⚠ 못 읽는 길은 «둘»이다 — 서버가 막았을 때(catch)와 그림이 없을 때(!t).
       한 쪽만 세면 다른 쪽을 조용히 되돌려도 검사가 통과한다. */
  assert.strictEqual(body.split('refCapBlocked(r').length - 1, 2,
    '막혔을 때와 지워졌을 때 둘 다 까닭을 적어야 한다');
  assert.ok(/catch\(function\(err\)\{[\s\S]*?refCapBlocked\(r, err\)/.test(body),
    '서버가 막은 경우를 그냥 넘기면 안 된다');
});

/* ── 증빙 사진은 서버로 나가지 않는다 ── */

test('증빙 사진은 이 PC 안(IndexedDB)에만 남는다 — 서버로 올리지 않는다', () => {
  /* 조사 결과(2026-08-26): savePhotoToDB 는 IndexedDB 에만 쓴다.
     ⚠ 여기에 Storage 올리기를 붙이면 일정을 보는 모든 직원에게 사진이 퍼진다.
       그러면 「자기 사진은 자기만」이 깨진다. */
  const at = GOV.indexOf('function savePhotoToDB(');
  assert.ok(at > 0, 'savePhotoToDB 를 못 찾았다');
  const body = GOV.slice(at, at + 900);
  assert.ok(!/firebase\.storage|photoStorage\(|putString|uploadBytes/.test(body),
    '증빙 사진을 서버에 올리면 안 된다');
});

/* ── 화면에 티가 난다 ── */

test('공유받은 사진에 「공유받음」 딱지와 준 사람 이름이 붙는다', () => {
  assert.ok(GOV.includes('class="pka-share">공유받음<'), '딱지가 있어야 한다');
  assert.ok(GOV.includes('.pka-share{'), '딱지 모양이 있어야 한다');
  assert.ok(GOV.includes("it.shared?(it.ownerName||'공유해 준 사람')"),
    '누가 준 것인지 이름이 보여야 한다');
});
