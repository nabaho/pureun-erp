/* 경력관리 — 멈춤을 «앱이 스스로 적는다» (대표 제보 2026-09-05 「여전히 멈춘다」)

   ■ 왜 만들었나
     대표 화면은 멈추는데 여기서는 재현되지 않았다. 재어 본 것마다 빨랐다 —
     자문 373행 그리기 300~500ms(→표시 50건으로 줄여 144ms), localStorage 4MB 로
     fbGatherLS 0ms·직렬화 15ms. 만든 사람이 못 보는 것을 추측으로 고치면
     엉뚱한 데를 고친다. 그래서 앱이 «무엇이 몇 ms 멈췄는지» 스스로 적게 했다.

   ■ 무엇을 적나
     ⑴ 브라우저가 알려 주는 긴 작업(longtask)
     ⑵ 우리 코드의 «이름»(renderCareer·nav_to·fbAutoPush …)
        — longtask 만으로는 무엇이 멈췄는지 알 수 없다. 이름이 있어야 고친다.

   ⚠ 기록이 무겁거나 커지면 그 자체가 짐이 된다 — 300ms 넘는 것만, 최근 40개만.
   ⚠ 개인정보를 적지 않는다 — 이름표와 숫자뿐이다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('★★ 300ms 넘는 것만 적는다 — 기록이 짐이 되면 안 된다', () => {
  assert.match(source, /KC_PERF_KEY='_perflog', KC_PERF_MAX=40, KC_PERF_SLOW=300, KC_PERF_SHOUT=1500/);
  const fn = cutFn(bare, 'function kcPerfLog(');
  assert.match(fn, /if\(ms < KC_PERF_SLOW\) return;/);
  assert.match(fn, /while\(a\.length>KC_PERF_MAX\) a\.shift\(\)/, '끝없이 쌓이면 안 됩니다');
});

test('★★ «이름»을 남긴다 — longtask 만으로는 무엇이 멈췄는지 모른다', () => {
  const w = cutFn(bare, 'function kcPerfWrap(');
  assert.match(w, /kcPerfLog\(name, performance\.now\(\)-a\)/);
  assert.match(w, /finally\{/, '★ 던져도 기록은 남아야 합니다');
  assert.match(w, /f\.__kcperf/, '두 번 감싸면 시간이 겹쳐 세어집니다');
  /* 오래 걸릴 만한 것들이 실제로 감싸여 있는가 */
  ['renderCareer', 'nav_to', 'renderPuAgency', 'fbAutoPush', 'fbGatherLS', 'kcApplyRestore']
    .forEach((n) => assert.ok(source.indexOf("'" + n + "'") > 0, n + ' 을 감싸야 합니다'));
});

test('★ 브라우저가 알려 주는 긴 작업도 함께 적는다', () => {
  assert.match(bare, /new PerformanceObserver\(function\(list\)\{[\s\S]*?kcPerfLog\('\(브라우저\)긴작업'/);
  assert.match(bare, /entryTypes:\['longtask'\]/);
});

test('★★ 오래 멈추면 «그 자리에서» 알린다 — 나중에 물으면 기억하지 못한다', () => {
  assert.match(source, /id="kcPerfBar"/);
  assert.match(cutFn(bare, 'function kcPerfShout('), /초 멈췄습니다/);
  assert.match(cutFn(bare, 'function kcPerfLog('), /if\(ms >= KC_PERF_SHOUT\) kcPerfShout\(ms\)/);
});

test('★★ 개발자도구 없이도 볼 수 있다 — 이름별로 묶어 보여 준다', () => {
  const fn = cutFn(bare, 'function kcPerfOpen(');
  assert.match(fn, /가장 오래/, '무엇을 고쳐야 하는지는 «가장 오래»가 알려 줍니다');
  assert.match(fn, /<textarea readonly/, '그대로 복사해 알려 줄 수 있어야 합니다');
  assert.match(fn, /이 기기 저장공간/, '큰 것이 있으면 그것이 값입니다');
  assert.match(source, /onclick="kcPerfOpen\(\)"/, '들어갈 길이 있어야 합니다');
});

test('★ 개인정보를 적지 않는다 — 이름표와 숫자뿐', () => {
  const fn = cutFn(bare, 'function kcPerfLog(');
  assert.match(fn, /w:String\(what\)\.slice\(0,40\)/);
  assert.doesNotMatch(fn, /\.org|\.name|titleVal/, '★ 기관명·사람 이름을 기록에 넣지 마세요');
});
