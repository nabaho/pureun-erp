'use strict';
/* 촬영 화면의 «처음 상태» (대표 지시 2026-08-29)

   "폰에서 찍은사진 멈추면저절로 찍기는 자동체크하지말고
    저장하면리멤버로보내기는 자동으로 체크되게 해달라"

   ■ 왜 갈리나
   · **멈추면 저절로 찍기** — 켜 두면 명함을 바꿔 놓는 사이에 책상·손이 찍혀
     지울 것이 늘어난다. 사람이 원할 때만 켜는 것이 맞다.
   · **저장하면 리멤버로도 보내기** — 이 기능을 만든 까닭 자체가 「단추를 안 누르는 것」
     이었다(2026-08-27). 기본이 꺼져 있으면 폰을 바꾸거나 저장소를 비운 뒤
     **다시 켜는 것부터** 해야 하는데, 그것이 곧 단추다.

   ■ 켜 두었던 것을 어떻게 푸나
   기본값만 바꾸면 **이미 켜 둔 폰은 그대로 켜진 채**라 지시가 안 지켜진다.
   그래서 「저절로 찍기」는 **열쇠 이름을 바꿔** 한 번 풀리게 했다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function prefCtx(store) {
  const ctx = {
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(
    (app.match(/const CARD_SHARE_LS = '[^']+';/) || [''])[0].replace('const', 'var') + '\n' +
    (app.match(/const CAM_AUTO_LS = '[^']+';/) || [''])[0].replace('const', 'var') + '\n' +
    cutFn(app, 'function cardShareToPref(') + '\n' +
    cutFn(app, 'function camAutoPref('), ctx);
  return ctx;
}

/* ══════ ① 저장하면 리멤버로도 보내기 — 기본 켜짐 ══════ */

test('★★ 아무것도 안 정했으면 «켜져» 있다 — 그것이 「단추를 안 누른다」의 뜻이다', () => {
  assert.equal(prefCtx({}).cardShareToPref(), true,
    '★ 기본이 꺼져 있으면 폰을 바꿀 때마다 «켜는 것부터» 해야 합니다 — 그게 곧 단추입니다.');
});

test('★ 켠 사람은 그대로 켜져 있다', () => {
  assert.equal(prefCtx({ puphotos_card_share: '1' }).cardShareToPref(), true);
});

test('★★ 끈 사람의 뜻은 지킨다 — 「0」이 적혀 있을 때만 꺼진 것으로 본다', () => {
  assert.equal(prefCtx({ puphotos_card_share: '0' }).cardShareToPref(), false,
    '★ 일부러 끈 사람에게 다시 켜 주면, 끄는 길이 없는 것과 같습니다.');
});

/* ══════ ② 멈추면 저절로 찍기 — 기본 꺼짐, 켜 두었던 것도 한 번 풀린다 ══════ */

test('★★ 아무것도 안 정했으면 «꺼져» 있다', () => {
  assert.equal(prefCtx({}).camAutoPref(), false,
    '★ 저절로 찍히면 명함을 바꿔 놓는 사이에 책상·손이 찍혀 지울 것이 늘어납니다.');
});

test('★★ 예전에 켜 두었던 폰도 «한 번 풀린다» — 기본값만 바꾸면 지시가 안 지켜진다', () => {
  /* 옛 열쇠(auto)에 '1' 이 남아 있어도 새 열쇠를 보므로 꺼진 채로 시작한다. */
  assert.equal(prefCtx({ 'puphotos.cam.auto': '1' }).camAutoPref(), false,
    '★ 이미 켜 둔 폰이 그대로 켜져 있으면 대표 지시가 안 지켜집니다.');
});

test('★ 한 번 풀린 뒤로는 «켠 것을 기억한다» — 늘 꺼 버리면 그것대로 성가시다', () => {
  const store = {};
  const c = prefCtx(store);
  store[app.match(/const CAM_AUTO_LS = '([^']+)'/)[1]] = '1';
  assert.equal(c.camAutoPref(), true);
});

/* ══════ ③ 화면이 그 값을 그대로 쓴다 ══════ */

test('★ 촬영 화면의 두 칸이 이 판정을 그대로 켠다 — 판정만 고치고 칸이 따로 놀면 안 된다', () => {
  const fn = app.match(/function setCamCaptureMode\([\s\S]*?\n\}/)[0];
  assert.match(fn, /setCamAutoPref\(camAutoPref\(\)\)/,
    '저절로 찍기 칸이 판정을 안 봅니다');
  const seg = app.slice(app.indexOf("const rmb = $('camRmbWrap')"), app.indexOf("const rmb = $('camRmbWrap')") + 400);
  assert.match(seg, /box\.checked = cardShareToPref\(\)/,
    '리멤버 칸이 판정을 안 봅니다');
});

test('★ 리멤버로 보내는 자리도 같은 판정을 본다 — 칸만 켜지고 안 보내면 더 나쁘다', () => {
  assert.match(cutFn(app, 'function shareCardsOut('), /cardShareToPref\(\)/);
});
