/* 새 버전 자동 갈아타기 — 저장 오류 폭주와의 교착을 끊는다.
   실행: node --test tests/*.test.js

   대표 화면 2026-08-16 16:19: 옛 버전(v=7ba190ff) 탭이 «몇 시간째» 새 버전으로 못
   갈아탄 채 오류를 계속 만들고 있었다. 자동 갈아타기(applyWhenIdle)는 이미 있었는데
   왜 안 됐나 —

   ★ 교착의 모양
     갈아타기는 saveBlocked(저장 중)가 꺼져야 일어난다. 그런데 저장 오류가 폭주하면
     「다시 시도·대기줄」 신호가 쉼 없이 이어져 saveBlocked 가 영영 안 꺼진다.
     폭주를 고치는 코드는 새 버전에 있다. 즉 «오류가 업데이트를 막고, 업데이트가
     오류를 고친다» — 서로 물고 있어 사람이 손대기 전엔 안 풀렸다.

   ★ 여기서 못 박는 것
     ① 'queued'(대기줄에 넣음)는 갈아타기를 막지 않는다 — 대기줄은 localStorage 에
        있어 화면을 새로 열어도 그대로 남아 다시 나간다. 막을 이유가 애초에 없다.
     ② 'saving'/'retrying' 은 막되, 3분 넘게 이어지면 놓아 준다.
     ③ 진짜 저장 중(짧은 saving)은 여전히 막는다 — 쓰던 것이 날아가면 안 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-version.js'), 'utf8');

/* 순수 판정 두 개만 떼어 온다 */
function load(){
  const i = src.indexOf('function isBlockingState(');
  assert.ok(i >= 0, 'isBlockingState 를 못찾음');
  const j = src.indexOf('window.addEventListener(\'pu:save-state\'', i);
  assert.ok(j > i, '경계를 못찾음');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j)
    + '\nthis.isBlockingState=isBlockingState; this.blockedTooLong=blockedTooLong;', ctx);
  return ctx;
}

test("'queued' 는 갈아타기를 막지 않는다 — 대기줄은 새로 열어도 살아남는다", () => {
  const C = load();
  assert.equal(C.isBlockingState('queued'), false);
});

test('진짜 저장 중(saving·retrying)은 여전히 막는다 — 쓰던 것이 날아가면 안 된다', () => {
  const C = load();
  assert.equal(C.isBlockingState('saving'), true);
  assert.equal(C.isBlockingState('retrying'), true);
});

test('끝난 상태(saved·failed·recovered)는 안 막는다', () => {
  const C = load();
  ['saved', 'failed', 'recovered', '', undefined].forEach(s => {
    assert.equal(C.isBlockingState(s), false, String(s));
  });
});

test('3분 넘게 막혀 있으면 놓아 준다 — 그만큼 안 끝난 저장은 앞으로도 안 끝난다', () => {
  const C = load();
  const MAX = 3 * 60 * 1000;
  assert.equal(C.blockedTooLong(1000, 1000 + MAX, MAX), true);
  assert.equal(C.blockedTooLong(1000, 1000 + MAX - 1, MAX), false, '3분 전에는 놓아 주면 안 된다');
});

test('막힌 적이 없으면(0) 시간이 아무리 지나도 「너무 오래」가 아니다', () => {
  const C = load();
  assert.equal(C.blockedTooLong(0, 99999999, 1000), false);
});

test('한도가 정말 3분이다 — 너무 짧으면 진짜 저장을 끊고, 너무 길면 교착이 그대로다', () => {
  const m = src.match(/BLOCK_MAX_MS = ([0-9* ]+);/);
  assert.ok(m, 'BLOCK_MAX_MS 를 못찾음');
  const v = eval(m[1]);
  assert.ok(v >= 60000, '1분보다 짧으면 큰 첨부 저장이 끊긴다');
  assert.ok(v <= 10 * 60000, '10분보다 길면 교착이 사실상 그대로다');
});

test("실제 지킴이가 'queued' 를 더는 안 본다 — 옛 코드로 되돌아가면 교착이 재발한다", () => {
  const i = src.indexOf("window.addEventListener('pu:save-state'");
  const fn = src.slice(i, i + 700);
  assert.ok(!/state === 'queued'/.test(fn), "'queued' 가 다시 막고 있다");
  assert.match(fn, /isBlockingState\(state\)/, '판정 함수를 안 쓴다');
  assert.match(fn, /blockedTooLong\(/, '3분 놓아주기가 안 걸려 있다');
});

test('막힘이 풀리면 미뤄 둔 갈아타기를 곧바로 다시 잡는다', () => {
  const i = src.indexOf("window.addEventListener('pu:save-state'");
  const fn = src.slice(i, i + 700);
  assert.match(fn, /scheduleApply\(pendingVersion\)/, '풀려도 갈아타기를 다시 안 잡는다');
});
