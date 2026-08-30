/* 못 보낸 것을 «이어졌을 때» 다시 보내는가 (2026-08-30)
 *
 * ■ 무슨 구멍이었나
 *   저장이 서버로 못 갈 때 앱은 그 칸을 «못 보낸 것»으로 적어 둔다(_fbPendingKeys).
 *   그런데 다시 보내는 일꾼(_flushPendingLocalNewer)은 «부팅 때 딱 한 번»만 돌았다.
 *   부팅 그 순간 못 보낸 목록은 아직 비어 있다 — 그래서 일하는 중에 잠깐 끊겨
 *   못 보낸 것은 영영 안 올라갔다. 이 기기에만 남고 남들은 모른다.
 *
 * ★ 그러면서 사람에게는 「이 기기에 저장됨」이라고 알렸다 —
 *   틀린 말은 아니지만, 「나중에 알아서 올라간다」로 읽힌다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ── 실제로 돌려 본다 — 연결이 끊겼다 이어지면 다시 보내는가 ── */
function runConnHandler(states) {
  const src = bare(ERP);
  const i = src.indexOf(".ref('.info/connected').on('value', function(snap){");
  assert.ok(i >= 0, '연결 감시가 없다');
  const open = src.indexOf('function(snap){', i);
  let d = 0, end = -1;
  for (let k = src.indexOf('{', open); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { end = k + 1; break; } }
  }
  const body = src.slice(open, end);

  const calls = [];
  const ctx = {
    fbConnected: false,
    window: {
      _fbFlushPending: function () { calls.push('flush'); },
      dispatchEvent: function () {},
      _erpErrLog: function () {},
    },
    CustomEvent: function () {},
    console,
  };
  vm.createContext(ctx);
  vm.runInContext('var handler = (' + body + ');', ctx);
  states.forEach(function (v) {
    ctx.handler({ val: function () { return v; } });
  });
  return { calls: calls, connected: ctx.fbConnected };
}

test('★★ 끊겼다 «이어지면» 못 보낸 것을 다시 보낸다', () => {
  /* 첫 연결 → 끊김 → 이어짐 */
  const r = runConnHandler([true, false, true]);
  assert.ok(r.calls.length >= 2,
    '★★ 이어졌는데 다시 보내지 않는다 — 못 보낸 자료가 이 기기에만 영영 남는다');
});

test('★★ 이어진 «채로» 여러 번 알려 와도 되풀이해 밀지 않는다', () => {
  const r = runConnHandler([true, true, true, true]);
  assert.strictEqual(r.calls.length, 1,
    '★★ 넘어가는 순간이 아니라 매번 밀면, 실패한 것을 끝없이 다시 밀어 댄다');
});

test('★ 끊긴 채로는 «밀지 않는다»', () => {
  const r = runConnHandler([false, false]);
  assert.strictEqual(r.calls.length, 0, '★ 끊겼는데 미는 것은 헛일이다');
  assert.strictEqual(r.connected, false, '★ 연결 상태를 잘못 적는다');
});

test('★ 연결 상태를 그대로 적는다 (다른 화면이 이 값을 본다)', () => {
  assert.strictEqual(runConnHandler([true]).connected, true);
  assert.strictEqual(runConnHandler([true, false]).connected, false);
});

/* ── 초기 동기화 전에는 밀지 않는가 ── */
test('★★ 초기 동기화 «전»에는 밀지 않는다 — 옛 자료가 서버를 덮는다', () => {
  const src = bare(ERP);
  const i = src.indexOf('window._fbFlushPending = function(){');
  assert.ok(i >= 0, '★ 바깥에서 부를 수 있게 내놓지 않았다');
  const fn = src.slice(i, src.indexOf('};', i));
  assert.ok(/if\(!_fbSynced\) return;/.test(fn),
    '★★ 서버 최신을 받기 «전»에 이 기기 값을 밀면 자료가 과거로 되돌아간다');
  assert.ok(fn.indexOf('_flushPendingLocalNewer()') >= 0, '★ 일꾼을 안 부른다');
});

/* ── 다시 보내기가 «보호로직을 거치는가» ── */
test('★★ 다시 보낼 때도 모든 보호를 거친다 (dbSet 으로)', () => {
  const fn = cutFn(bare(ERP), 'function _flushPendingLocalNewer(');
  assert.ok(/dbSet\(k, val\)/.test(fn),
    '★★ 서버로 곧장 쓰면 되돌림방지·급감차단을 건너뛴다 — 사고의 씨앗이다');
  assert.ok(/if\(!fbShouldSync\(k\)\) return;/.test(fn),
    '★ 서버에 안 올리는 칸까지 민다');
  assert.ok(/window\._fbPendingKeys = \{\};/.test(fn),
    '★ 목록을 안 비우면 같은 것을 되풀이해 민다');
});
