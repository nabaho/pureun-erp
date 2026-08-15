'use strict';
// App Check 스위치가 안전하게 걸려 있는지 (pu-cards.html) — node --test tests/cards-appcheck.test.js
//
// 왜 껐나: 자동화 브라우저로 이 화면을 테스트할 때마다 reCAPTCHA 검증이 실패했고,
// 반복되자 구글이 사이트키 자체를 잠시 막아 사무실 사용자까지 로그인이 안 되는
// 사고로 이어졌다(2026-08-14). 대표가 Firebase 콘솔에서 직접 확인한 결과 Realtime
// Database·Storage·Authentication 의 App Check 는 전부 «모니터링»(강제 아님)
// 상태였다 — 강제였다면 토큰 없는 읽기가 PERMISSION_DENIED 로 막혔을 것이다.
// 즉 지금의 reCAPTCHA 호출은 지키는 것 없이 실패·잠금 위험만 만들고 있었다.
// pu-erp.html 이 이미 쓰는 FB_APPCHECK_ON 스위치와 같은 방식으로 pu-cards.html 도 끈다.
//
// ⚠ 위험한 것은 «콘솔에서 강제를 켰는데 이 스위치를 안 되돌리는» 경우다.
//    그러면 모든 읽기·쓰기가 막힌다. 그래서 되돌리는 길을 코드에 남겨 둔다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('스위치가 하나로 모여 있다', () => {
  assert.match(app, /var FB_APPCHECK_ON = (true|false);/);
});

test('스위치가 꺼져 있으면 reCAPTCHA 를 아예 부르지 않는다', () => {
  assert.match(app, /if \(FB_APPCHECK_ON && FB_APPCHECK_KEY && firebase\.appCheck\)/);
});

test('사이트키는 지우지 않고 남겨 둔다 (되돌릴 때 다시 발급받지 않게)', () => {
  assert.match(app, /const FB_APPCHECK_KEY = '[^']+';/);
});

test('왜 껐는지와 되돌리는 법이 코드에 적혀 있다', () => {
  const i = app.indexOf('var FB_APPCHECK_ON');
  assert.ok(i > 0, '스위치를 찾지 못했습니다');
  const around = app.slice(Math.max(0, i - 1200), i);
  assert.ok(around.includes('모니터링'), '모니터링(강제 아님) 상태였다는 근거가 적혀 있어야 한다');
  assert.ok(around.includes('true 로 되돌려'), '되돌리는 법이 적혀 있어야 한다');
});

test('권한 거부가 나면 App Check 를 의심하라고 알려 준다', () => {
  assert.match(app, /if\(!FB_APPCHECK_ON && isDenied\(e\)\) console\.error\('\[App Check\]/);
  assert.match(app, /FB_APPCHECK_ON 을 true 로 되돌려야 합니다/);
});

test('Rules 의 auth != null 은 그대로다 (App Check 를 껐다고 자료가 열리지 않는다)', () => {
  const i = app.indexOf('var FB_APPCHECK_ON');
  const around = app.slice(Math.max(0, i - 1200), i);
  assert.ok(around.includes('auth != null'), 'Rules 의 auth != null 은 그대로라는 설명이 적혀 있어야 한다');
});
