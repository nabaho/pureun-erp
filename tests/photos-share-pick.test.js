/* 👥 같이 볼 사람 — 한 창으로 + 되전달 (대표 지시 2026-08-30)

   "특정인과 공유하려고 할때 어떻게해야 가장 쉽게 하는가
    다른 사람들 끼리도 서로 공유를 쉽게 해야된다"  → ㉮ 허용 · 「목업대로 전부」

   ■ ① 같은 일인데 화면이 둘이었다
   여러 장 고르고 공유하면 체크박스 창이 떴는데, **한 장을 크게 보고 공유하면**
   `prompt('번호를 적어 주세요')` 였다 — 이름을 «타자»로 치고, 한 번에 한 명이고,
   누가 이미 보고 있는지도 담당이 누구인지도 안 보였다.
   ⚠ 좋은 창은 이미 있었다. 새로 만들 일이 아니라 **두 길을 하나로 합치는** 일이었다.

   ■ ② 「다른 사람들끼리도 서로」 — 되전달이 막혀 있었다
   권한이 「내가 올린 사진 || 총괄관리자」였다. 그래서 받은 사진을 동료에게 넘기려면
   올린 사람에게 다시 부탁해야 했다. 걸음이 하나 더 끼는 만큼 **실제로는 카톡으로
   보내고 만다** — 그게 훨씬 위험하다. 그래서 열되, 셋을 함께 두었다:
     ㉠ 누가 넘겼는지 남긴다   ㉡ 넘긴 사람은 «더하기»만   ㉢ 민감은 안 넘어간다
   ⚠⚠ ㉡·㉢ 은 **서버 규칙이 실제로 막아야** 한다. 화면만 막으면 뚫린 채로 있고,
     화면만 열면 눌러도 조용히 안 된다 — 둘을 함께 본다. */

'use strict';
const test = require('node:test');
const { stripComments } = require('./strip-comments');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const RULES = JSON.parse(
  fs.readFileSync(path.join(R, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8')).rules;

/* 권한 판정을 «돌려서» 본다 — 글자로 찾으면 몸통을 바꿔도 통과한다 */
function perm(over) {
  const o = over || {};
  const ctx = Object.assign({
    Object: Object, Array: Array, String: String, Boolean: Boolean,
    gridItems: o.items || [],
    gridOwner: o.gridOwner || null,
    ALL_OWNERS: '__all__', SHARED_OWNER: '__shared__',
    PuPhotoStore: { myUid: function () { return o.me || 'me'; },
      amAdmin: function () { return !!o.admin; },
      isSensitiveRead: function (r) { return !!(r && r.sensitive); } }
  }, o.ctx || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['function isMinePhoto(', 'function viewingOther(', 'function mayTouch(',
   'function maskForced(', 'function sharedToMe(', 'function mayShare(',
   'function shareNoWhy('].forEach(function (n) { vm.runInContext(cutFn(APP, n), ctx); });
  return ctx;
}
const mine = function (id) { return { id: id, meta: { __ownerUid: 'me' } }; };
const got = function (id, extra) {
  return { id: id, meta: Object.assign({ __ownerUid: 'other', shareWith: { me: true } }, extra || {}) };
};

/* ── ① 한 창으로 ── */

test('★★ 한 장 볼 때도 «같은 창»을 연다 — 「번호를 적으세요」는 없앴다', () => {
  const fn = cutFn(APP, 'function openSharePick(');
  assert.match(fn, /openSharePeople\(\[viewerId\]\)/,
    '★★ 한 장 볼 때가 아직 딴 길입니다 — 갈라 두면 한쪽만 좋아집니다');
  /* ⚠ 주석에 「걷었다」고 적는 것은 괜찮다 — 코드에 남으면 안 된다 */
  const code = stripComments(APP);
  assert.ok(code.indexOf('번호를 적어 주세요') < 0,
    '★★ 번호를 타자로 치는 상자가 아직 살아 있습니다');
  /* ⚠ prompt 를 앱 전체에서 찾으면 안 된다 — 「문서 이름 적기」처럼 그 자리가 맞는
     쓰임이 따로 있다. **공유 길에** 남았는지만 본다. */
  ['function openSharePick(', 'function openSharePeople(', 'function sharePeopleHtml(',
   'function submitSharePeople('].forEach(function (n) {
    assert.ok(!/[^a-zA-Z_$.]prompt\s*\(/.test(cutFn(APP, n)),
      '★★ 공유 길에 prompt 가 남아 있습니다: ' + n);
  });
  /* 여러 장 길도 «같은 고르개»를 쓴다.
     ⚠ 어느 칸에 그리는지(둘째 값)는 2026-08-30 에 늘었고, 넘길 목록은 2026-09-03 에
       «넘길 수 있는 것»으로 좁아졌다 — 보는 것은 「같은 함수를 부르는가」이지
       인자가 무엇인가가 아니다. 인자를 박아 두었다가 두 번 다 깨졌다. */
  assert.match(cutFn(APP, 'function openShareMany('),
    /openSharePeople\(/, '★★ 여러 장 길이 딴 고르개를 씁니다');
});

test('★★ 사람을 «무리로» 나눠 늘어놓는다 — 아홉 줄을 그냥 쌓으면 훑을 곳이 없다', () => {
  const fn = cutFn(APP, 'function sharePeopleHtml(');
  ['이미 보고 있는 사람', '자주 함께 보는 사람', '그 밖 직원'].forEach(function (g) {
    assert.ok(fn.indexOf(g) > 0, '★ 무리 「' + g + '」가 없습니다');
  });
  assert.match(fn, /담당자/, '★ 담당자 무리가 없습니다');
  /* 같은 사람이 두 무리에 겹쳐 나오면 두 번 고르게 된다 */
  assert.match(fn, /if \(seen\[u\]\) return ''/,
    '★★ 같은 사람이 여러 무리에 겹쳐 나옵니다');
  /* 찾기 칸 */
  assert.match(fn, /id="sharePickFind"/, '★ 이름 찾기 칸이 없습니다');
  const ff = cutFn(APP, 'function sharePickFilter(');
  assert.match(ff, /data-nm.*indexOf\(s\) >= 0/s, '★ 이름으로 안 거릅니다');
  assert.match(ff, /\.pgrp[\s\S]*?display = s \? 'none'/,
    '★ 거를 때 빈 무리 이름표가 줄줄이 남습니다');
});

test('★★ 「이미 보고 있는 사람」은 «모두에게» 열린 사람만 센다', () => {
  /* 열 장 중 한 장에만 열린 사람을 「보는 중」이라 적으면, 체크를 풀었을 때
     나머지 아홉에서도 빠진 줄 아신다 — 실제로는 그대로 열려 있다. */
  const fn = cutFn(APP, 'function openSharePeople(');
  assert.match(fn, /shared\.every\(function \(s\) \{ return s\.indexOf\(u\) >= 0; \}\)/,
    '★★ 한 장에만 열린 사람도 「보는 중」으로 셉니다');
});

test('★★ 체크를 풀면 «그 자리에서» 거둔다 — 거두는 자리가 딴 데 있으면 두 화면을 오간다', () => {
  /* ⚠ 2026-08-30: 더할 사람·거둘 사람을 세는 곳이 sharePickChanges 한 곳으로 모였다
     (단추에 적는 말과 실제로 하는 일이 같은 셈에서 나와야 한다). 지키는 뜻은 그대로. */
  assert.match(cutFn(APP, 'function sharePickChanges('),
    /p\.mayDrop \? p\.has\.filter/, '★★ 체크를 풀어도 아무 일이 없습니다');
  const fn = cutFn(APP, 'function submitSharePeople(');
  assert.match(fn, /const c = sharePickChanges\(\)/, '★★ 단추 말과 하는 일이 딴 셈에서 나옵니다');
  assert.match(fn, /PuPhotoStore\.setShare\(/, '★ 거두는 일을 저장 층에 안 시킵니다');
  /* ⚠ 「더하거나 뺄 사람을 골라 주세요」는 걷었다(대표 지시 2026-08-30 「필요없다」) —
     이제 바뀐 것이 없으면 **단추가 아예 안 눌린다.** 꾸짖을 일이 없다. */
  assert.match(cutFn(APP, 'function sharePickTouched('), /go\.disabled = !n/,
    '★★ 바뀐 것이 없는데도 단추가 눌립니다');
});

test('★ 자주 함께 보는 사람은 «이 기기에만» 남긴다 — 서버에 기록을 또 쌓지 않는다', () => {
  const fn = cutFn(APP, 'function noteShareOften(');
  assert.match(fn, /localStorage\.setItem/, '★ 안 남깁니다');
  assert.ok(!/db\.ref\(|PuPhotoStore\./.test(fn), '★ 서버에 또 씁니다');
  assert.match(fn, /try \{/, '★ 사생활 모드에서 통째로 터집니다');
  assert.match(cutFn(APP, 'function shareOften('), /catch \(_\) \{ return \[\]; \}/,
    '★ 값이 깨져 있으면 창이 안 열립니다');
  assert.match(cutFn(APP, 'function submitSharePeople('), /noteShareOften\(add\)/,
    '★ 실제로 안 쌓으면 이 무리가 늘 빕니다');
});

/* ── ② 되전달 ── */

test('★★ 공유받은 사진을 «또» 넘길 수 있다 — 여기가 「서로 공유」의 정체다', () => {
  const c = perm({ items: [got('a')], gridOwner: 'other' });
  assert.equal(c.mayTouch('a'), false, '받은 사진을 고칠 수는 없어야 합니다');
  assert.equal(c.mayShare('a'), true,
    '★★ 받은 사진을 동료에게 못 넘깁니다 — 올린 분에게 다시 부탁하게 되고,\n' +
    '  실제로는 카톡으로 보내고 맙니다(대표 지시 2026-08-30 ㉮).');
});

test('★★ 민감으로 판독된 것은 «안 넘어간다» — ㉮의 안전장치 ③', () => {
  const c = perm({ items: [got('a', { read: { sensitive: true } })], gridOwner: 'other' });
  assert.equal(c.mayShare('a'), false, '★★ 계약서·주민번호가 든 사진이 한 다리 건너 퍼집니다');
  assert.match(c.shareNoWhy('a'), /민감/, '★ 왜 막혔는지 안 말하면 고장으로 읽힙니다');
  assert.match(c.shareNoWhy('a'), /올린 분에게/, '★ 그럼 어떻게 하라는 것인지 안 말합니다');
  /* 내가 올린 것이면 민감이어도 내 마음대로 열 수 있다 — 내 사진이다 */
  const mineSens = perm({ items: [{ id: 'b', meta: { __ownerUid: 'me', read: { sensitive: true } } }] });
  assert.equal(mineSens.mayShare('b'), true, '★ 내 사진까지 막으면 열 길이 없어집니다');
});

test('★★ 나에게 «열려 있지도 않은» 사진은 못 넘긴다', () => {
  const c = perm({ items: [{ id: 'a', meta: { __ownerUid: 'other' } }], gridOwner: 'other' });
  assert.equal(c.mayShare('a'), false, '★★ 아무 사진이나 남에게 열어 줄 수 있습니다');
  assert.ok(!/민감/.test(c.shareNoWhy('a')), '★ 까닭이 뒤바뀌었습니다');
});

test('★★ 누가 넘겼는지 «남긴다» — ㉮의 안전장치 ①', () => {
  const fn = cutFn(APP, 'function submitSharePeople(');
  assert.match(fn, /!mayTouch\(id\) && meName \? \(meName \+ '님이 열어 줌'\) : ''/,
    '★★ 넘긴 사람을 안 적습니다 — 한 다리 건너 퍼지면 자취가 없습니다');
  /* 적어 놓고 «안 보내면» 아무 데도 안 남는다 — 손으로 고른 사람 쪽으로 실제로 간다 */
  assert.match(fn, /addShare\(photoYearOf\(id\), id, hand, photoOwner\(id\), fwd\)/,
    '★ 적어 놓고 안 보냅니다');
  /* 담당자 쪽도 마찬가지 — 넘긴 것이면 「담당」보다 「누가 넘겼는지」가 먼저다 */
  assert.match(fn, /fwd \|\| where/, '★ 담당자에게 넘길 때는 자취가 안 남습니다');
});

test('★★ 넘긴 사람은 «더하기»만 — 빼는 것은 올린 분·총괄관리자만 (안전장치 ②)', () => {
  /* 화면: 뺄 수 없는 사람에게는 ✕ 를 아예 안 낸다(눌러도 안 되는 단추는 고장으로 읽힌다) */
  const box = cutFn(APP, 'function shareBox(');
  assert.match(box, /const mine = mayTouch\(it\.id\)/, '★ 뺄 수 있는지 안 가립니다');
  assert.match(box, /mine \? '<button onclick="unshareOne/,
    '★★ 넘긴 사람에게도 ✕ 를 내줍니다 — 눌러도 서버가 막습니다');
  /* 창: 이미 보는 사람의 체크를 못 풀게 잠근다 */
  const html = cutFn(APP, 'function sharePeopleHtml(');
  assert.match(html, /lock: !p\.mayDrop/, '★ 체크를 풀 수 있게 두면 헛일이 됩니다');
  assert.match(html, /o\.lock \? ' disabled' : ''/, '★ 잠금이 실제로 안 걸립니다');
});

/* ── ③ 서버 규칙이 «실제로» 그렇게 막는가 ── */

test('★★ 규칙: 받은 사람이 명단에 «더할» 수 있다 — 안 열면 눌러도 조용히 막힌다', () => {
  const w = RULES.puphotos.u.$uid.items.$year.$id.shareWith.$who['.write'];
  assert.ok(w, '★★ 되전달 규칙이 없습니다 — 화면만 고쳐서는 아무 일도 안 됩니다');
  assert.match(w, /shareWith'\)\.child\(auth\.uid\)\.exists\(\)/,
    '★★ 「내가 보고 있는 사진인가」를 안 봅니다 — 아무 사진에나 명단을 붙일 수 있습니다');
  /* 받는 사람 쪽 표도 함께 열려야 한다 — 한쪽만 열면 「공유했습니다」 해 놓고 안 뜬다 */
  const s = RULES.puphotos.sharedTo.$uid.$pid['.write'];
  assert.match(s, /newData\.child\('owner'\)\.val\(\)\)\.child\('items'\)/,
    '★★ 받는 사람 쪽 표가 안 열립니다 — 화면은 「공유했습니다」라 하고 목록엔 안 뜹니다');
});

test('★★ 규칙: «더하기만» 된다 — 한 직원이 남의 사진을 동료에게서 거둬 갈 수 없다', () => {
  const w = RULES.puphotos.u.$uid.items.$year.$id.shareWith.$who['.write'];
  assert.match(w, /newData\.val\(\) === true/,
    '★★ 지우는 것까지 열렸습니다 — 받은 사람이 남을 빼 버릴 수 있습니다');
});

test('★★ 규칙: 열린 것은 «명단 칸 둘»뿐이다 — 사진·글·분류는 못 건드린다', () => {
  const id = RULES.puphotos.u.$uid.items.$year.$id;
  const opened = Object.keys(id).filter(function (k) { return k.charAt(0) !== '.'; });
  assert.deepEqual(opened.sort(), ['shareBy', 'shareWith'],
    '★★ 명단 말고 다른 칸까지 열렸습니다: ' + opened.join(', '));
  /* 남기는 글이 무한정 길면 그 자리가 딴 창고가 된다 */
  assert.match(id.shareBy.$who['.write'], /length <= 60/,
    '★ 「누가 넘겼는지」 칸에 아무 글이나 담깁니다');
});
