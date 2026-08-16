'use strict';
// 초기 동기화가 화면을 통째로 멈추던 것 — node --test tests/erp-sync-yield.test.js
//
// 왜: 「🐢 화면 멈춤 581ms」가 떴는데 「🐌 느린 화면」도 「🐌 느린 타이머」도 없었다.
//     둘 다 이름표를 붙여 뒀는데 아무것도 안 걸렸다 → 화면 그리기도 타이머도 아니다.
//     초기 동기화가 열두 열쇠(4MB 가까이)를 «쉼 없이» 한 번에 적용하고 있었다.
//     추측이 아니라 코드에서 확인한 구조다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const SYNC = (function(){
  /* ⚠ 2026-08-16 부팅이 열쇠별 받기로 갈라지며 이 숨돌리기 고리는
     _fbInitialSyncFull(통째 읽기 예비 경로)로 이름이 바뀌었다 — 행동은 그대로다.
     이 검사가 지키는 것은 「쉼 없이 적용해 화면이 멎는 것」이지 함수 이름이 아니다. */
  const i = app.indexOf('function _fbInitialSyncFull(_isRetry){');
  assert.ok(i >= 0, '_fbInitialSyncFull 을 찾지 못했다 — 통째 읽기 예비 경로가 사라졌는가?');
  let d = 0, j = i;
  for(;;j++){ if(app[j] === '{') d++; else if(app[j] === '}'){ d--; if(!d){ j++; break; } } }
  return app.slice(i, j);
})();

/* 적용 고리만 떼어 실제로 돌린다 */
function runLoop(keyCost){
  const keys = Object.keys(keyCost);
  const box = {
    setTimeout, Promise, Object, console:{ log(){} },
    window:{ performance:{ now:() => box._t } },
    _t: 0, applied: [], yields: 0,
    _fbApplyRecord(k){ box._t += keyCost[k]; box.applied.push(k); return true; },
    remote: keys.reduce((o,k) => (o[k]=1, o), {}),
  };
  box.performance = box.window.performance;
  vm.createContext(box);
  const from = SYNC.indexOf('return new Promise(function(done){');
  const to   = SYNC.indexOf('});', SYNC.indexOf('step();')) + 3;
  vm.runInContext(
    'var keys = Object.keys(remote); var pulled = 0;\n' +
    'var _origST = setTimeout; setTimeout = function(f){ yields++; return _origST(f, 0); };\n' +
    'this.p = (function(){ ' + SYNC.slice(from, to) + ' })();', box);
  return box;
}

test('★ 한 프레임(16ms)을 넘기면 숨을 돌린다', async () => {
  // 8ms 짜리 열쇠 열둘 → 16ms 마다 끊기므로 여러 번 나눠 돈다
  const cost = {}; for(let i = 0; i < 12; i++) cost['k' + i] = 8;
  const box = runLoop(cost);
  await box.p;
  assert.equal(box.applied.length, 12, '열두 개 다 적용된다');
  assert.ok(box.yields >= 3, '중간에 숨을 돌려야 한다 (실제 ' + box.yields + '번)');
});

test('가벼우면 한 번에 끝낸다 (쓸데없이 늦추지 않는다)', async () => {
  const cost = { a:1, b:1, c:1 };
  const box = runLoop(cost);
  await box.p;
  assert.equal(box.applied.length, 3);
  assert.equal(box.yields, 0, '16ms 안에 끝나면 안 끊는다');
});

test('★ 열쇠 하나가 오래 걸려도 그 열쇠는 통째로 적용한다', () => {
  // 열쇠 안을 쪼갤 수는 없다 — 그건 이름표가 이름을 알려 준다
  assert.match(SYNC, /if\(_now\(\) - t0 >= 16\) break;/);
  const i = SYNC.indexOf('_fbApplyRecord(k, remote[k]');
  const j = SYNC.indexOf('if(_now() - t0 >= 16) break;');
  assert.ok(i < j, '적용을 «끝내고» 나서 시간을 본다 — 중간에 끊으면 반쪽 적용이 된다');
});

test('빈 자료여도 끝난다', async () => {
  const box = runLoop({});
  assert.equal(await box.p, 0);
});

test('센 개수를 그대로 돌려준다', async () => {
  const box = runLoop({ a:1, b:1 });
  assert.equal(await box.p, 2);
});

/* ── 뒤따르는 차례가 지켜지나 ── */
test('★ 다 끝난 뒤에 promise 를 푼다', () => {
  // 먼저 풀면 _drainShrinkQueue·_fbSynced 가 «적용 중» 에 돌아 버린다
  const stepEnd = SYNC.indexOf('done(pulled);');
  const contin  = SYNC.indexOf('if(i < keys.length){ setTimeout(step, 0); return; }');
  assert.ok(contin < stepEnd, '남았으면 다음 차례로 넘기고, 다 했을 때만 푼다');
  assert.match(SYNC, /return new Promise\(function\(done\)\{/);
});

test('급감 보류 처리와 재시도 길은 그대로', () => {
  assert.match(SYNC, /_drainShrinkQueue\(\)/);
  assert.match(SYNC, /return _fbInitialSyncPerKey\(\);/, '권한 없을 때 키별 폴백');
  assert.match(SYNC, /selfHeal:true, deferGate:true/, '적용 옵션은 그대로');
});

test('시간을 못 재는 브라우저도 돈다', () => {
  assert.match(SYNC, /window\.performance && performance\.now/);
  assert.match(SYNC, /function\(\)\{ return Date\.now\(\); \}/);
});

/* ── 왜 이걸 고쳤는지 ── */
test('이름표 두 개가 이미 있는데도 안 걸렸다는 사실을 적어 둔다', () => {
  // 다음 사람이 「왜 여기를 쪼갰나」를 알 수 있어야 한다
  assert.match(SYNC, /화면 그리기도 타이머도 아니었던 까닭/);
  assert.match(app, /function pageSkin\(Comp, name\)/, '화면 이름표');
  assert.match(app, /🐌 느린 '\+kind\+'\('\+ms\+'ms 주기\)/, '타이머 이름표');
  assert.match(app, /window\.erpBlameMark = function\(name, t0\)/, '무거운 일 이름표');
});
