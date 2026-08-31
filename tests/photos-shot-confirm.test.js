'use strict';
/* 📷 찍은 것을 «한 번 정리해» 보여 준다 (대표 지시 2026-08-30)

   "명함사진 찍으면 리멤버에서는 명함사진이 화면과 같이 한 번 정리된다.
    사진첩도 이 기능 넣어라"

   ■ 없던 것은 «자르기»가 아니라 «보여 주기»였다
   사진첩은 이미 명함만 잘라내고 비뚤어진 것을 바로 세운다(findCardRect·cropRotated).
   그런데 그 결과를 아무 데서도 안 보여 줘서, 잘못 잘려도 그 자리에서는 몰랐다 —
   나중에 작은 미리보기에서야 알고 다시 찾아가 지우고 다시 찍어야 했다.

   ■ 가장 위험한 자리
   ① **못 잘랐을 때를 말해야 한다.** 테두리를 못 찾으면 안 자른다(잘못 잘라 글자를
      날리느니 낫다). 조용히 담으면 「왜 이건 안 잘렸지」가 된다.
   ② **뜨는 자리를 좁혀야 한다**(대표 결정): 명함·서류 모드 + 손으로 누른 셔터만.
      「저절로 찍기」에 물으면 저절로 찍는 뜻이 없어진다.
   ③ **재촬영은 방금 한 장만** 무른다. 주소를 안 놓으면 찍을 때마다 기억이 샌다.
   ④ **카메라를 닫으면 반드시 내린다** — 안 내리면 검은 화면이 덮인 채 남는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function ctx(over) {
  const el = {};
  const calls = { revoked: [], strip: 0, ask: [] };
  const c = Object.assign({
    URL: { revokeObjectURL: function (u) { calls.revoked.push(u); } },
    camShots: [], camPairWith: 3, camCardStage: 'back',
    frameOn: function () { return true; },
    setCamAsk: function (v) { calls.ask.push(v); },
    renderCamStrip: function () { calls.strip++; },
    $: function (id) {
      return el[id] || (el[id] = { style: {}, className: '', textContent: '', src: '',
        removeAttribute: function (k) { delete this[k]; } });
    },
    _el: el, _calls: calls
  }, over || {});
  vm.createContext(c);
  ['function shouldConfirmShot(', 'function showShotConfirm(', 'function hideShotConfirm(',
    'function camShotKeep(', 'function camShotRedo(']
    .forEach(function (f) { vm.runInContext(cutFn(app, f), c); });
  vm.runInContext('var _shotAskBack = false;', c);
  return c;
}

/* ══════ ① 언제 뜨는가 ══════ */

test('★★ 명함·서류 모드에서 «손으로 누른» 셔터에만 뜬다', () => {
  const c = ctx();
  assert.equal(c.shouldConfirmShot(undefined), true, '손 셔터에 안 뜹니다');
  assert.equal(c.shouldConfirmShot({}), true);
  assert.equal(c.shouldConfirmShot({ settled: true }), false,
    '★★ 「저절로 찍기」에 물으면 저절로 찍는 뜻이 없어집니다 (대표 결정 2026-08-30)');
});

test('★★ 일반 현장사진에는 «안 뜬다» — 여러 장을 빠르게 찍는 일이다', () => {
  const c = ctx({ frameOn: function () { return false; } });
  assert.equal(c.shouldConfirmShot(undefined), false);
  assert.equal(c.shouldConfirmShot({ settled: true }), false);
});

/* ══════ ② 잘랐는지 «말한다» ══════ */

test('★ 잘라냈으면 잘라냈다고 한다', () => {
  const c = ctx();
  assert.equal(c.showShotConfirm({ url: 'U', cropped: true }, false), true);
  assert.equal(c._el.camOk.style.display, 'flex');
  assert.equal(c._el.camOkImg.src, 'U');
  assert.match(c._el.camOkNote.textContent, /잘라내고 바로 세웠습니다/);
  assert.ok(c._el.camOkNote.className.indexOf('warn') < 0, '잘 된 것을 경고색으로 칠하면 안 됩니다');
});

test('★★ «못 잘랐으면» 그것을 말한다 — 조용히 담으면 「왜 이건 안 잘렸지」가 된다', () => {
  const c = ctx();
  c.showShotConfirm({ url: 'U', cropped: false }, false);
  assert.match(c._el.camOkNote.textContent, /못 찾아/,
    '★★ 못 잘랐다는 것을 안 알려 주면 사람이 알 길이 없습니다');
  assert.match(c._el.camOkNote.textContent, /자르지 않고/);
  assert.match(c._el.camOkNote.className, /warn/, '★ 눈에 띄어야 다시 찍습니다');
});

test('★ 찍은 것이 없으면 «안 띄운다» — 빈 화면이 덮이면 카메라를 못 쓴다', () => {
  const c = ctx();
  assert.equal(c.showShotConfirm(null, false), false);
  assert.notEqual(c._el.camOk && c._el.camOk.style.display, 'flex');
});

/* ══════ ③ 확인 · 재촬영 ══════ */

test('★★ 「확인」 뒤에야 «뒷면도?»를 묻는다 — 두 물음이 겹치면 안 된다', () => {
  const c = ctx();
  c.showShotConfirm({ url: 'U', cropped: true }, true);
  assert.deepEqual(c._calls.ask, [], '★★ 정리 화면과 뒷면 물음이 함께 떴습니다');
  c.camShotKeep();
  assert.equal(c._el.camOk.style.display, 'none');
  assert.deepEqual(c._calls.ask, [true], '★ 확인한 뒤 뒷면을 안 묻습니다');
});

test('★ 앞면이 아니면 확인해도 «뒷면을 안 묻는다» — 한 장에 뒷면은 하나다', () => {
  const c = ctx();
  c.showShotConfirm({ url: 'U', cropped: true }, false);
  c.camShotKeep();
  assert.deepEqual(c._calls.ask, []);
});

test('★★ 「재촬영」은 «방금 한 장만» 무르고 주소를 놓아 준다', () => {
  const c = ctx();
  c.camShots = [{ url: 'A' }, { url: 'B' }, { url: 'C' }];
  c.showShotConfirm({ url: 'C', cropped: true }, true);
  c.camShotRedo();
  assert.equal(c.camShots.length, 2, '★★ 앞서 찍은 것까지 지웠습니다');
  assert.equal(c.camShots[1].url, 'B');
  assert.deepEqual(c._calls.revoked, ['C'],
    '★ 주소를 안 놓으면 다시 찍을 때마다 기억이 샙니다');
  assert.equal(c._el.camOk.style.display, 'none');
  assert.equal(c._calls.strip, 1, '★ 아래 줄의 장수가 안 줄어듭니다');
});

test('★★ 재촬영하면 «뒷면 고리»도 푼다 — 없는 앞면을 가리키면 짝이 어긋난다', () => {
  const c = ctx();
  c.camShots = [{ url: 'A' }];
  c.showShotConfirm({ url: 'A', cropped: true }, true);
  c.camShotRedo();
  assert.equal(c.camPairWith, -1, '★★ 지운 앞면을 아직 가리킵니다');
  assert.equal(c.camCardStage, 'front');
  assert.deepEqual(c._calls.ask, [], '★ 무른 뒤에 뒷면을 물으면 안 됩니다');
});

test('★ 찍은 것이 없는데 재촬영을 눌러도 «안 터진다»', () => {
  const c = ctx();
  assert.doesNotThrow(function () { c.camShotRedo(); });
  assert.equal(c._el.camOk.style.display, 'none');
});

/* ══════ ④ 카메라를 닫으면 내린다 ══════ */

test('★★ 카메라를 닫으면 «반드시» 내린다 — 안 내리면 검은 화면이 덮인 채 남는다', () => {
  const fn = cutFn(app, 'function camStop(');
  assert.match(fn, /hideShotConfirm\(\)/,
    '★★ 카메라를 닫아도 정리 화면이 덮여 있어 사진첩으로 못 돌아갑니다');
  assert.match(fn, /_shotAskBack = false/, '★ 미뤄 둔 뒷면 물음도 함께 풀어야 합니다');
});

test('★ 내릴 때 «옛 그림을 지운다» — 다음 장에서 앞 사진이 스친다', () => {
  const fn = cutFn(app, 'function hideShotConfirm(');
  assert.match(fn, /removeAttribute\('src'\)/);
});

/* ══════ ⑤ 촬영 흐름에 «실제로» 걸려 있다 ══════ */

test('★★ 셔터가 이 화면을 부른다 — 부르지 않으면 만든 것이 없는 것과 같다', () => {
  const fn = cutFn(app, 'async function camShoot(');
  assert.match(fn, /shouldConfirmShot\(opts\)/, '★ 뜰 자리를 안 가립니다');
  assert.match(fn, /showShotConfirm\(camShots\[camShots\.length - 1\]/,
    '★★ 방금 찍은 장을 보여 줘야 합니다');
  /* 정리 화면이 떴으면 뒷면 물음은 «미룬다» — 둘이 겹치면 안 된다 */
  const i = fn.indexOf('showShotConfirm(');
  const j = fn.lastIndexOf('setCamAsk(true)');
  assert.ok(i > 0 && j > i, '★★ 뒷면 물음이 정리 화면보다 먼저 뜹니다');
  assert.match(fn, /if \(shouldConfirmShot\(opts\) && showShotConfirm\([\s\S]{0,80}\) return;/,
    '★ 정리 화면을 띄운 뒤에도 뒷면을 바로 물으면 겹칩니다');
});

test('★ 화면이 촬영 화면 «위»에 있다 — 아래 두면 카메라가 덮는다', () => {
  const camOv = /#camOv\{[^}]*z-index:(\d+)/.exec(app);
  const camOk = /#camOk\{[^}]*z-index:(\d+)/.exec(app);
  assert.ok(camOv && camOk, '층 번호를 못 찾았습니다');
  assert.ok(Number(camOk[1]) > Number(camOv[1]),
    '★★ 정리 화면이 카메라 아래에 있어 아무것도 안 보입니다');
});
