'use strict';
/* 백업에서 «없어진 것만» 골라 되살리기 (대표 지시 2026-09-03 「찾아서 되살려라」)

   ■ 왜 새로 만들었나
   이미 있던 kcRecoverOpen 은 «스냅숏 전체»를 덮어쓴다. 5건을 되살리려고 누르면
   그 백업 뒤에 한 일이 통째로 사라진다 — 지운 뒤에 하신 작업까지. 그래서
   «더하기만 하는» 길을 따로 두었다.

   ■ 이 검사가 지키는 규칙
   ① 되살리기가 «지우지 않는다» — 지금 있는 레코드를 하나도 건드리지 않는다
   ② 이미 있는 것·휴지통에 있는 것은 «없어진 것»으로 세지 않는다
   ③ 백업 본문을 통째로 받지 않는다(수 MB) — 보관함마다 그 칸만 콕 집어 읽는다
   ④ 훑는 백업 수에 뚜껑이 있다 — 백업이 쌓여도 읽는 양이 안 늘어난다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
const bare = stripComments(raw);

test('없어진 것을 찾는 자리와 되살리는 자리가 있다', () => {
  assert.ok(cutFn(bare, 'async function kcMissingOpen('), 'kcMissingOpen 이 없다');
  assert.ok(cutFn(bare, 'function kcMissingRun('), 'kcMissingRun 이 없다');
  assert.ok(/onclick="kcMissingOpen\(\)"/.test(bare), '누를 단추가 없다');
});

test('되살리기는 «더하기만» 한다 — 지금 자료를 지우지 않는다', () => {
  const fn = cutFn(bare, 'function kcMissingRun(');
  assert.ok(/unshift/.test(fn), '되살린 것을 목록에 넣지 않는다');
  assert.ok(!/\bdeleteFile\s*\(/.test(fn),
    '되살리는 자리가 파일을 지운다 — 되살리기가 «지우는 일»이 되면 안 된다');
  /* ⚠ 「.filter 를 아예 쓰지 마라」로 잡으면 안 된다 — «고른 것만 추리는» 데에도
     쓰이고 그것은 옳다. 막아야 할 것은 «걸러 낸 것을 보관함에 써 넣는» 일이다.
     그때 지금 있는 레코드가 조용히 빠진다. */
  assert.ok(!/set\([^)]*\.filter/.test(fn),
    '걸러 낸 목록을 보관함에 써 넣는다 — 지금 있는 자료가 조용히 빠진다.\n' +
    '    이 길은 «더하기만» 해야 한다(통째로 덮어쓰는 길은 kcRecoverRun 이 따로 있다)');
  /* 보관함에 쓸 때는 «넣은 것이 든» 목록을 그대로 써야 한다 */
  assert.match(fn, /set\(\s*st\s*,\s*arr\s*\)/,
    '되살린 것을 담은 목록을 그대로 저장하지 않는다');
  assert.ok(/kcFreeId\s*\(/.test(fn),
    '번호가 겹쳤을 때 덮어쓰면 지금 쓰는 자료가 사라진다');
});

test('통째로 덮어쓰는 길과 «섞이지» 않는다', () => {
  const run = cutFn(bare, 'function kcMissingRun(');
  assert.ok(!/ref\(\)\.update|fbDb\.ref\(\)\.update/.test(run),
    '없어진 것 되살리기가 클라우드를 통째로 되돌린다 — 그것은 kcRecoverRun 의 일이다');
  /* 옛 길이 그대로 남아 있는지도 본다 — 통째로 되돌리기가 필요한 때가 따로 있다 */
  assert.ok(cutFn(bare, 'async function kcRecoverRun('),
    '통째로 되돌리는 길(kcRecoverRun)이 사라졌다 — 둘 다 있어야 한다');
});

test('이미 있는 것·휴지통에 있는 것은 «없어진 것»이 아니다', () => {
  const fn = cutFn(bare, 'async function kcMissingOpen(');
  assert.ok(/kcTrashList\s*\(/.test(fn),
    '휴지통에 든 것을 «없어졌다»고 하면 같은 것이 두 번 들어온다 — 거기서 되살리면 된다');
  assert.ok(/지금\[st\]\[r\.id\]|현재|already/.test(fn) || /\[st\]\[r\.id\]/.test(fn),
    '지금 목록에 있는 것을 걸러 내지 않는다 — 있는 것이 또 들어온다');
});

test('백업 본문을 통째로 받지 않는다 (수 MB)', () => {
  const fn = cutFn(bare, 'function _kcMissRead(');
  assert.ok(fn, '_kcMissRead 가 없다');
  assert.ok(/paths\/0\/value\/ls\//.test(fn),
    '보관함 칸만 콕 집어 읽어야 한다 — 백업 본문 전체를 받으면 요금과 시간이 함께 튄다');
  const open = cutFn(bare, 'async function kcMissingOpen(');
  assert.ok(!/_kcBkBody\([^)]*\)\)\.once/.test(open),
    '찾는 쪽이 백업 본문을 통째로 받는다');
});

test('훑는 백업 수에 뚜껑이 있다', () => {
  assert.match(bare, /KC_MISS_SCAN\s*=\s*\d+/, '훑을 백업 수를 정해 두지 않았다');
  const fn = cutFn(bare, 'async function kcMissingOpen(');
  assert.ok(/slice\s*\(\s*0\s*,\s*KC_MISS_SCAN\s*\)/.test(fn),
    '백업이 수십 개 쌓이면 읽는 양이 그만큼 늘어난다 — 뚜껑을 씌울 것');
});

test('보관함 목록은 CAREER_CFG 에서 뽑는다 (화면이 늘면 함께 늘게)', () => {
  const fn = cutFn(bare, 'function kcMissStores(');
  assert.ok(fn, 'kcMissStores 가 없다');
  assert.ok(/CAREER_CFG/.test(fn),
    '보관함 이름을 손으로 적어 두면, 새 화면이 생겼을 때 조용히 빠진다');
  assert.ok(/indexOf\(st\)\s*<\s*0/.test(fn),
    '한 보관함을 두 화면이 함께 쓴다(위촉장·표창) — 두 번 읽지 않게 걸러야 한다');
});

test('알림은 «보여 줄 시간»을 받아들인다', () => {
  /* 아홉 자리가 toast(글, 5000~6000) 으로 부르는데 함수가 그 값을 버리고 있었다 —
     긴 안내를 천천히 읽게 하려는 것인데 늘 1.8초에 사라졌다. */
  const fn = cutFn(bare, 'function toast(');
  assert.ok(fn, 'toast 가 없다');
  assert.match(fn, /function toast\(\s*msg\s*,\s*\w+/,
    'toast 가 둘째 값(보여 줄 시간)을 안 받는다');
  assert.ok(/Number\(\s*\w+\s*\)/.test(fn),
    '받은 값을 숫자로 확인하지 않으면 엉뚱한 값에 알림이 안 사라진다');
  /* 부르는 자리가 실제로 있다 — 없으면 이 규칙 자체가 쓸모없다 */
  const 긴알림 = (bare.match(/toast\([^;]*,\s*[0-9]{3,}\)/g) || []).length;
  assert.ok(긴알림 >= 5,
    '길게 보여 달라고 부르는 자리가 ' + 긴알림 + '곳뿐이다 — 이 규칙을 다시 볼 것');
});
