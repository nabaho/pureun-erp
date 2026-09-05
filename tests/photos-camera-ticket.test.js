'use strict';
/* 📷 「사진첩이 계속 튕겨서 포털 화면이 나온다」 — 뿌리 (대표 보고 2026-09-05)

   ■ 앞서 두 번 고친 것은 «가지»였다
   2026-09-03 에 돌아갈 곳(camReturnTo)을 카메라 한 번으로 끝냈고, 되살아난 옛 포털
   촬영이 돌아가지 못하게 표를 달았다. 그런데도 계속 튕겼다.

   ■ 뿌리 — «촬영 요청 쪽지»가 안 없어졌다
   포털의 📷 는 sessionStorage 에 「카메라 열어 달라」는 쪽지를 적고 사진첩으로 보낸다
   (주소의 ?cam=1 이 로그인·업데이트를 지나며 사라져도 촬영이 열리게 하는 옳은 장치다).
   그런데 그 쪽지를 지우는 곳이 **카메라가 실제로 열린 뒤**뿐이었다. 그래서
     · PC 처럼 카메라가 없거나 권한을 안 주면 쪽지가 그대로 남고
     · sessionStorage 는 **그 탭이 살아 있는 내내** 남는다(새로고침해도 그대로).
   남은 쪽지는 사진첩을 열 때마다 카메라를 또 켜고, **camReturnTo 를 'enter.html' 로
   다시 무장한다.** 그 뒤로는 사진첩 안에서 그냥 한 장 찍어 올리기만 해도
   「다 했으니 온 곳으로」가 걸려 포털로 나간다 — 사람은 까닭을 알 수가 없다.

   ■ 이 검사가 지키는 것
   ① 쪽지는 **읽는 그 자리에서** 버린다 — 카메라가 열리든 말든
   ② **묵은 쪽지는 안 본다**(5분)
   ③ 주소의 ?cam=1 은 «지금 이 걸음»이라 그대로 연다
   ④ 카메라가 못 열렸거나 그만두면 «돌아갈 곳»도 함께 버린다(2026-09-03 규칙 유지)

   실행: node --test tests/photos-camera-ticket.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const portal = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');

/* 쪽지 집어 들기를 «실제로» 돌린다 — 글자만 보면 「지우긴 하는데 언제」를 못 잡는다 */
function rig(raw) {
  const log = [];
  const store = { v: raw };
  const c = {
    Number, String, Object, JSON, Date,
    sessionStorage: {
      getItem: function (k) { log.push('get:' + k); return store.v; },
      removeItem: function (k) { log.push('remove:' + k); store.v = null; }
    }
  };
  vm.createContext(c);
  vm.runInContext([
    (app.match(/^const CAM_TICKET_MAX_AGE = [^\n]*;/m) || [''])[0].replace('const ', 'var '),
    cutFn(app, 'function clearCameraIntent('),
    cutFn(app, 'function camTicketUsable('),
    cutFn(app, 'function takeCameraIntent(')
  ].join('\n'), c);
  return { c: c, log: log, store: store };
}

/* ══════ ① 읽었으면 «그 자리에서» 버린다 ══════ */

test('★★★ 쪽지는 «읽는 그 자리에서» 버린다 — 카메라가 열리든 말든', () => {
  const r = rig(JSON.stringify({ mode: 'photo', quick: true, from: 'portal', at: Date.now() }));
  const t = r.c.takeCameraIntent();
  assert.ok(t, '쪽지를 읽긴 해야 합니다');
  assert.ok(r.log.indexOf('remove:pu_open_camera') >= 0,
    '★★★ 안 버리면 그 탭이 사는 내내 남아, 사진첩을 열 때마다 카메라를 켜고\n' +
    '  camReturnTo 를 포털로 다시 무장합니다 — 그것이 「계속 튕긴다」의 정체입니다');
  assert.equal(r.store.v, null, '★★★ 실제로 지워져야 합니다');
});

test('★★★ 못 쓰는 쪽지도 «버린다» — 안 버리면 영영 남아 매번 걸린다', () => {
  [['묵은 것', JSON.stringify({ from: 'portal', at: Date.now() - 60 * 60 * 1000 })],
   ['깨진 것', '{이건 JSON 이 아니다']].forEach(function (p) {
    const r = rig(p[1]);
    const t = r.c.takeCameraIntent();
    assert.equal(t, null, '★ ' + p[0] + ' 은 안 씁니다');
    assert.equal(r.store.v, null,
      '★★★ ' + p[0] + ' 을 버리지 않으면 사진첩을 열 때마다 같은 자리에 걸립니다');
  });
});

test('★ 쪽지가 없으면 조용히 없다고 한다', () => {
  const r = rig(null);
  assert.equal(r.c.takeCameraIntent(), null);
});

/* ══════ ② 묵은 쪽지 ══════ */

test('★★ 묵은 쪽지는 «안 본다» — 눌러 놓고 딴 데 갔다 온 것이지 지금 찍겠다는 뜻이 아니다', () => {
  const { c } = rig(null);
  const now = 1_700_000_000_000;
  assert.equal(c.camTicketUsable({ from: 'portal', at: now - 1000 }, now), true, '방금 것은 씁니다');
  assert.equal(c.camTicketUsable({ from: 'portal', at: now - 4 * 60 * 1000 }, now), true, '4분은 씁니다');
  assert.equal(c.camTicketUsable({ from: 'portal', at: now - 10 * 60 * 1000 }, now), false,
    '★★ 10분 전 쪽지로 카메라가 열리면 「내가 안 눌렀는데」가 됩니다');
});

test('★★ 때가 «없는» 옛 쪽지는 받아 준다 — 막으면 옛 포털에서 촬영이 통째로 죽는다', () => {
  const { c } = rig(null);
  assert.equal(c.camTicketUsable({ from: 'portal' }, Date.now()), true);
  assert.equal(c.camTicketUsable(null, Date.now()), false);
  assert.equal(c.camTicketUsable('quick', Date.now()), false, '★ 객체가 아니면 안 씁니다');
});

test('★ 옛 「quick」 쪽지도 그대로 알아본다 — 옛 포털이 적어 둔 꼴이다', () => {
  const r = rig('quick');
  const t = r.c.takeCameraIntent();
  assert.ok(t && t.quick === true && t.from === 'portal', '★ 옛 꼴을 못 읽으면 그 포털에서 촬영이 안 됩니다');
  assert.equal(r.store.v, null, '★★ 옛 꼴도 한 번 쓰고 버립니다');
});

/* ══════ ③ 화면이 실제로 그 길을 쓰는가 ══════ */

test('★★★ 카메라를 여는 자리가 «쪽지를 집어 든다» — 직접 읽으면 안 버린 채 지나간다', () => {
  const fn = cutFn(app, 'function openCamIfAsked(');
  assert.match(fn, /takeCameraIntent\(\)/,
    '★★★ sessionStorage 를 직접 읽으면 버리는 걸음이 빠집니다 — 그것이 이 버그였습니다');
  assert.ok(fn.indexOf("sessionStorage.getItem") < 0,
    '★★★ 여는 자리에서 쪽지를 직접 읽고 있습니다 — 집어 드는 길 하나로 모으세요');
});

test('★★ 주소의 ?cam=1 은 그대로 연다 — 그것은 «지금 이 걸음»이다', () => {
  const fn = cutFn(app, 'function openCamIfAsked(');
  assert.match(fn, /q\.get\('cam'\) === '1' \|\| !!remembered/,
    '★★ 주소로 온 촬영까지 막으면 포털 📷 가 아예 안 열립니다');
});

/* ══════ ④ 돌아갈 곳은 «그 한 번»뿐 (2026-09-03 규칙 유지) ══════ */

test('★★★ 카메라가 못 열리면 «돌아갈 곳»도 버린다 — PC 에서 특히 그렇다', () => {
  assert.match(cutFn(app, 'function camFail('), /camReturnTo = '';/,
    '★★★ 권한 거부로 안 열렸는데 주소가 남으면, 한참 뒤 찍은 한 장이 사람을 포털로 내보냅니다');
});

test('★★ 그만두고 닫을 때도 «돌아갈 곳»을 버린다', () => {
  assert.match(cutFn(app, 'function closeCam('), /camReturnTo = '';/,
    '★★ 닫았는데 남아 있으면 다음에 찍을 때 튕깁니다');
});

test('★★ 돌아가는 것은 «할 일을 마쳤을 때»뿐이다 — 닫기로는 안 돌아간다', () => {
  const close = cutFn(app, 'function closeCam(');
  assert.ok(close.indexOf('camGoBack') < 0,
    '★★ 뒤로가기로 닫았는데 또 옮기면 한 번 눌렀는데 두 번 움직입니다');
});

/* ══════ ⑤ 포털 쪽 — 쪽지에 «때»를 적어 보내는가 ══════ */

test('★★ 포털이 쪽지에 «때»를 적는다 — 없으면 묵은 것을 가릴 수가 없다', () => {
  const i = portal.indexOf("sessionStorage.setItem('pu_open_camera'");
  assert.ok(i > 0, '포털이 쪽지를 적는 자리를 못 찾았습니다');
  assert.match(portal.slice(i, i + 260), /at:\s*Date\.now\(\)/,
    '★★ 때가 없으면 열 시간 전 쪽지도 「지금 찍겠다」로 읽힙니다');
});
