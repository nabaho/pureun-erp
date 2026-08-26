'use strict';
// 급여데이터함 앱 껍데기 — 실행: node --test tests/*.test.js
//   깨지면 자료를 잃거나 권한이 새는 것만 못 박는다.
//   화면 문구·탭 개수 같은 모양은 못 박지 않는다 — 한 줄 고치다 모든 앱 배포가 멈춘다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');

test('★ 같은 파이어베이스 프로젝트를 본다', () => {
  assert.match(html, /projectId:\s*'pureun-erp'/);
  assert.match(html, /pureun-erp-default-rtdb\.asia-southeast1/);
});

test('★ 서울 창고를 본다', () => {
  // 미국 기본 창고(appspot.com)를 보면 파일이 다른 곳에 쌓인다.
  const m = html.match(/storageBucket:\s*'([^']+)'/);
  assert.ok(m, 'storageBucket 설정이 없습니다');
  assert.equal(m[1], 'pureun-erp.firebasestorage.app');
});

test('★ 저장 층을 불러온다', () => {
  assert.match(html, /js\/pu-paydata-store\.js/);
});

test('★ 앱 안에서 실시간DB·창고 경로를 직접 만들지 않는다', () => {
  // 경로가 화면에 흩어지면 자리를 옮길 때 한 곳만 고치고 지나간다.
  // 경로를 아는 곳은 js/pu-paydata-store.js 한 군데뿐이다.
  assert.equal(/['"]paydata\/u\//.test(html), false, '앱 안에 실시간DB 사람 자리 경로가 박혀 있습니다');
  assert.equal(/['"]pu_paydata\//.test(html), false, '앱 안에 창고 경로가 박혀 있습니다');
  assert.equal(/['"]paydata\/arrivals/.test(html), false, '앱 안에 도착 칸 경로가 박혀 있습니다');
});

test('★ 다른 앱의 자리를 건드리지 않는다', () => {
  // pucards(기업정보함)·puphotos(사진첩)·payroll_os(급여관리) 실데이터를 건드리면 안 된다.
  ['pucards', 'puphotos', 'payroll_os', 'fund_erp'].forEach(root => {
    assert.equal(new RegExp("['\"]" + root + "/").test(html), false, root + ' 자리를 건드립니다');
  });
});

test('앱바를 불러온다 — 오갈 수 없는 섬이 되지 않는다', () => {
  assert.match(html, /js\/pu-appbar\.js/);
});

test('로그인은 포털 한 곳에서 한다', () => {
  // 앱마다 로그인 화면을 두면 계정 문제를 앱 수만큼 겪는다.
  assert.match(html, /enter\.html/);
});

test('App Check 을 켠다', () => {
  assert.match(html, /appCheck/);
});

test('★ 바깥에서 온 글자를 화면에 넣기 전에 이스케이프한다', () => {
  // 파일 이름·업체명은 사람이 지은 것이라 <script> 가 들어올 수 있다.
  assert.match(html, /function esc\s*\(/);
});

test('포털 타일에 등록돼 있다', () => {
  const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
  assert.match(enter, /key:\s*'paydata'/);
  assert.match(enter, /pu-paydata\.html/);
});

test('★ 건의함 분류를 함부로 늘리지 않는다 — 규칙이 막는다', () => {
  const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
  const at = enter.indexOf('var SG_CATS');
  assert.ok(at > 0, 'SG_CATS 를 찾을 수 없습니다');
  const cats = enter.slice(at, at + 1600);
  /* 콘솔 규칙이 suggestions_private/$id/cat 을 정해진 낱말만 받도록 검사한다
     (erp|consult|work|fund|rules|payroll|cards|docs|portal|bizwork|policy|edu|office|hrwelf|etc).
     여기에 새 분류를 적어 두면 **서버가 거절해** 건의가 아예 안 써진다.
     사진첩(photos)도 같은 이유로 분류에 없다 — 급여데이터함도 같이 간다.
     분류를 늘리려면 콘솔 규칙의 낱말 목록을 먼저 고쳐야 한다. */
  assert.equal(/key:\s*'paydata'/.test(cats), false,
    '건의 분류에 paydata 를 넣으려면 콘솔 규칙의 cat 낱말 목록부터 고쳐야 합니다');
});
