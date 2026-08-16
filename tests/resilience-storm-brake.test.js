/* 저장 실패 폭주가 스스로 꺼지게 — 되풀이 고리 두 개를 끊는다.
   실행: node --test tests/*.test.js

   대표 콘솔 2026-08-16: 파이어베이스 오류가 «몇 시간 동안 초당 7건» 꾸준히 쌓였다
   (ErrorId 1,171,152 → 1,241,960, 두 시간 사십오 분). 한 번의 폭주가 아니라 고리다:

   고리 ① 다시 시도 곱하기 — 저장 수만 건이 실패하면 건마다 두 번씩 다시 시도가
     붙어 실패가 «세 배»로 는다. 방금 수십 건이 실패했으면 지금 또 보내 봐야
     같이 실패한다.
   고리 ② 재연결 무한 되풀이 — 대기줄 다시 보내기가 «연결될 때마다» 나갔다.
     서버가 폭주 탓에 연결을 끊으면 SDK 는 몇 초 만에 다시 붙는다 → 또 보냄 →
     또 끊김. 이 고리에는 끝이 없었다.

   여기서 못 박는 것: 폭주 중에는 다시 시도를 건너뛴다 · 다시 보내기는 30초에
   한 번뿐이다 · 그래도 «보내기는 반드시 한다»(늦출 뿐 버리지 않는다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-resilience.js'), 'utf8');
const resilience = require('../js/pu-resilience.js');

/* ══════ 고리 ① — 실패 폭주 중에는 다시 시도를 건너뛴다 ══════ */

test('폭주 감지가 있고, 걸리면 다시 시도 없이 바로 대기줄로 간다', () => {
  const at = src.indexOf('function callWithRetry(');
  assert.ok(at > 0);
  const fn = src.slice(at, src.indexOf('function availableApps', at));
  assert.match(fn, /inFailBurst\(/, '폭주를 안 본다 — 실패가 세 배로 는다');
  assert.match(fn, /attempt = RETRY_DELAYS\.length/, '폭주 중에도 또 시도한다');
});

test('폭주 기준이 어이없이 낮지 않다 — 평소 한두 건 실패로 발동하면 안 된다', () => {
  const limit = src.match(/FAIL_BURST_LIMIT = (\d+)/);
  const win = src.match(/FAIL_BURST_WINDOW_MS = (\d+)/);
  assert.ok(limit && win, '기준 숫자를 못 찾음');
  assert.ok(Number(limit[1]) >= 10, '너무 낮으면 정상 재시도까지 꺼진다');
  assert.ok(Number(win[1]) >= 3000, '창이 너무 짧으면 폭주를 못 잡는다');
});

test('실패 기록이 무한히 쌓이지 않는다 — 몇 시간 폭주에도 메모리가 안 는다', () => {
  const at = src.indexOf('function noteFail(');
  const fn = src.slice(at, at + 300);
  assert.match(fn, /splice|shift|slice/, '기록을 안 자르면 폭주가 길수록 느려진다');
});

/* ══════ 고리 ② — 다시 보내기는 30초에 한 번 ══════ */

test('다시 보내기 사이 최소 간격이 있다', () => {
  const gap = src.match(/REPLAY_MIN_GAP_MS = (\d+)/);
  assert.ok(gap, '간격이 없다 — 연결이 오르내릴 때마다 무한 되풀이');
  assert.ok(Number(gap[1]) >= 10000, '10초는 넘어야 흔들리는 연결에서 고리가 끊긴다');
});

test('replayQueue 가 간격 안에 다시 불리면 그냥 돌아간다', () => {
  const at = src.indexOf('function replayQueue(');
  const head = src.slice(at, at + 600);
  assert.match(head, /lastReplayAt/, '지난번 언제 보냈는지 안 본다');
  assert.match(head, /REPLAY_MIN_GAP_MS/, '간격을 안 지킨다');
});

test('간격 확인이 «먼저»다 — 대기줄을 읽기 전에 돌아가야 헛일이 없다', () => {
  const at = src.indexOf('function replayQueue(');
  const fn = src.slice(at, src.indexOf('function replayAll', at));
  const gapAt = fn.indexOf('REPLAY_MIN_GAP_MS');
  const readAt = fn.indexOf('readQueue(context.project)');
  assert.ok(gapAt > 0 && readAt > 0);
  assert.ok(gapAt < readAt, '대기줄부터 읽으면 30초마다 읽기 헛일을 한다');
});

/* ══════ 늦출 뿐 버리지 않는다 ══════ */

test('연결·로그인 신호에는 여전히 다시 보내기가 걸려 있다', () => {
  /* 고리를 끊는다고 신호 자체를 떼면, 오프라인에서 돌아와도 밀린 저장이 안 나간다. */
  const at = src.indexOf('function bindApp(');
  const fn = src.slice(at, at + 500);
  assert.match(fn, /onAuthStateChanged/, '로그인 때 다시 보내기가 없어졌다');
  assert.match(fn, /\.info\/connected/, '재연결 때 다시 보내기가 없어졌다');
});

test('폭주 감지가 걸려도 저장은 대기줄에 남는다 — 버려지지 않는다', () => {
  /* 폭주 = attempt 를 끝까지 올린다 = 다음 분기에서 queueWrite 로 간다. */
  const at = src.indexOf('function callWithRetry(');
  const fn = src.slice(at, src.indexOf('function availableApps', at));
  assert.match(fn, /queueWrite\(ref, method, value\)/, '대기줄로 안 가면 저장이 사라진다');
});

/* ══════ 이미 있던 안전장치가 그대로인가 ══════ */

test('다섯 번 실패하면 세워 두는 것(parked)은 그대로다', () => {
  assert.equal(typeof resilience.MAX_REPLAY_ATTEMPTS, 'number');
  assert.match(src, /parked = true/);
});

test('일시적이지 않은 오류(권한 등)는 폭주와 상관없이 바로 실패로 알린다', () => {
  assert.equal(resilience.isTransientError({ code: 'PERMISSION_DENIED' }), false);
});
