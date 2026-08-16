'use strict';
/* 푸른이알피 — 탭 복귀 재동기화가 「짧게 벗어남」과 「오래 벗어남」을 가른다
   (비용 조사 2026-08-13: 8/1~8/11 실시간DB 내려받기 ₩28,833 — 청구서의 93%)

   fbInitialSync() 는 data 노드(회사·사건·급여·근태 등 전체 사업 데이터)를
   통째로 once('value') 로 받는다. 예전에는 focus·visibilitychange 마다
   4초 디바운스 하나로 이것을 다시 받았다 — 이메일 확인하러 다른 창을 잠깐
   보고 돌아오는 것만으로도 전체 데이터셋이 다시 내려갔다.

   ⚠ 실시간 협업 리스너(.on('child_added'/'child_changed'), pu-erp.html:7843
   근처)는 이 작업의 대상이 아니다 — 다른 직원 변경을 화면에 반영하는 의도된
   설계라 손대지 않는다. 여기서 고치는 것은 그 옆의 "복귀 재동기화"뿐이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

/* pu-erp.html 은 한 파일 7만 줄이라 통째로 실행할 수 없다. 복귀 재동기화
   토막만 떼어 가짜 저장소·가짜 시계와 함께 돌린다(같은 기법: tests/erp-conflict-wiring.test.js). */
function loadResync(opts) {
  opts = opts || {};
  const from = app.indexOf('// ── 근본 해결: 기기 전환·재연결 시 최신 자동 수신 ──');
  const onlineAt = app.indexOf("_resyncLatest(true); });", from);
  assert.ok(from > 0 && onlineAt > from, '복귀 재동기화 토막을 찾을 수 없습니다');
  const catchAt = app.indexOf('} catch(e){}', onlineAt);
  assert.ok(catchAt > onlineAt, '토막의 끝(try/catch)을 찾을 수 없습니다');
  const to = catchAt + '} catch(e){}'.length;
  const src = app.slice(from, to);
  const calls = { fbInitialSync: 0, dbCacheClear: 0, events: [] };
  const listeners = { document: {}, window: {} };
  const sandbox = {
    console: { log() {}, warn() {} },
    fbDb: opts.fbDb !== undefined ? opts.fbDb : { ref() { return {}; } },
    _fbSynced: opts.fbSynced !== undefined ? opts.fbSynced : true,
    fbInitialSync() { calls.fbInitialSync++; return Promise.resolve(opts.pulled || 0); },
    _dbCacheClear() { calls.dbCacheClear++; },
    Date: { now: () => opts.clock ? opts.clock() : Date.now() },
    CustomEvent: function (name, detail) { this.name = name; this.detail = detail; },
    document: {
      hidden: false,
      addEventListener(ev, fn) { listeners.document[ev] = fn; }
    },
    window: {
      addEventListener(ev, fn) { listeners.window[ev] = fn; },
      dispatchEvent(e) { calls.events.push(e.name); }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'erp-resync.js' }).runInContext(sandbox);
  return { sandbox, calls, listeners };
}

/* 시계를 손으로 돌린다 — setTimeout 이 아니라 clock() 이 리턴하는 값을 바꾼다.
   실제로 몇 초·몇 분이 지났는지 흉내 내는 것이 이 검사의 핵심이다. */
function makeClock(start) {
  let t = start;
  const clock = () => t;
  clock.advance = (ms) => { t += ms; };
  return clock;
}

test('★ 짧게 벗어났다 돌아오면 다시 받지 않는다 — 이것이 새던 자리다', () => {
  const clock = makeClock(1000000);
  const { calls, listeners } = loadResync({ clock });
  listeners.window.blur();               // 창 초점을 잃음
  clock.advance(5000);                   // 5초 뒤 — 이메일 확인 정도
  listeners.window.focus();
  assert.equal(calls.fbInitialSync, 0,
    '★ 5초 벗어난 것만으로 전체 사업 데이터를 다시 받습니다');
});

test('★ 오래 벗어났다 돌아오면 다시 받는다 — 실시간 구독이 끊겼을 수 있다', async () => {
  const clock = makeClock(1000000);
  const { calls, listeners } = loadResync({ clock, pulled: 3 });
  listeners.window.blur();
  clock.advance(90000);                  // 1분 30초 — 폰을 배경에 오래 뒀다 왔다
  listeners.window.focus();
  assert.equal(calls.fbInitialSync, 1, '오래 벗어났는데도 다시 안 받습니다');
  await Promise.resolve();               // fbInitialSync().then(...) 이 다 돌 때까지
  assert.equal(calls.dbCacheClear, 1, '받은 것을 캐시에 반영하지 않습니다');
});

test('visibilitychange 도 같은 기준으로 가른다', () => {
  const clock = makeClock(100000);
  const short = loadResync({ clock });
  short.sandbox.document.hidden = true;
  short.listeners.document.visibilitychange();
  clock.advance(2000);
  short.sandbox.document.hidden = false;
  short.listeners.document.visibilitychange();
  assert.equal(short.calls.fbInitialSync, 0);

  const clock2 = makeClock(100000);
  const long = loadResync({ clock: clock2 });
  long.sandbox.document.hidden = true;
  long.listeners.document.visibilitychange();
  clock2.advance(70000);
  long.sandbox.document.hidden = false;
  long.listeners.document.visibilitychange();
  assert.equal(long.calls.fbInitialSync, 1);
});

test('★ online 은 벗어난 시간과 무관하게 늘 다시 받는다 — 네트워크가 실제로 끊긴 신호다', () => {
  const clock = makeClock(100000);
  const { calls, listeners } = loadResync({ clock });
  // 벗어난 적이 없어도(_awaySince = null) online 은 받아야 한다
  listeners.window.online();
  assert.equal(calls.fbInitialSync, 1,
    '★ 네트워크 재연결인데도 안 받으면 끊긴 동안의 변경을 놓칩니다');
});

test('벗어난 적이 없으면 focus 만으로는 안 받는다', () => {
  /* 창을 한 번도 안 벗어났는데(다른 이유로) focus 가 울리면 헛되이 전체를 받으면 안 된다 */
  const { calls, listeners } = loadResync({ clock: makeClock(100000) });
  listeners.window.focus();
  assert.equal(calls.fbInitialSync, 0);
});

test('짧은 디바운스(4초)는 그대로 있다 — 이벤트가 겹쳐 울려도 두 번 안 받는다', () => {
  const clock = makeClock(100000);
  const { calls, listeners } = loadResync({ clock });
  listeners.window.blur();
  clock.advance(90000);
  listeners.window.focus();          // 1번째 — 오래 벗어났으니 받는다
  listeners.window.online(true);     // 거의 동시에 online 도 울림
  assert.equal(calls.fbInitialSync, 1, '디바운스가 깨져 같은 순간에 두 번 받습니다');
});

test('fbDb 나 아직 동기화 전이면 아무것도 안 한다', () => {
  const { calls, listeners } = loadResync({ fbDb: null, clock: makeClock(100000) });
  listeners.window.blur();
  listeners.window.focus();
  assert.equal(calls.fbInitialSync, 0);

  const { calls: c2, listeners: l2 } = loadResync({ fbSynced: false, clock: makeClock(100000) });
  l2.window.blur();
  l2.window.focus();
  assert.equal(c2.fbInitialSync, 0);
});

test('★ 벗어난 시각이 정확히 0 이어도 "안 벗어남"으로 잘못 읽지 않는다', () => {
  /* 0 을 "안 벗어남" 표시로 쓰면 Date.now() 가 정확히 0 인 순간(가짜 시계·
     드문 경계값)과 겹쳐 "방금 벗어났다"를 "안 벗어났다"로 잘못 읽는다.
     그러면 그 직후 짧게 돌아와도 다시 받고, 오래 벗어나도 안 받는 등 판단이
     뒤집힌다. null 로 가른다(_awaySince == null). */
  const clock = makeClock(0);   // Date.now() 가 0 인 경계
  const { calls, listeners } = loadResync({ clock });
  listeners.window.blur();       // _awaySince 가 0 이 된다(구현이 null 로 가른다)
  clock.advance(70000);
  listeners.window.focus();
  assert.equal(calls.fbInitialSync, 1,
    '★ 벗어난 시각이 0 이라 "안 벗어남"으로 읽혀 다시 안 받습니다');
});

test('★ 문턱이 0 이 아니다 — 0 이면 이 검사 전체가 뜻이 없다', () => {
  assert.match(app, /var RESYNC_IDLE_MS = 6\d{4};/,
    '★ 문턱을 0 이나 너무 작은 값으로 낮추면 예전과 같은 문제가 됩니다');
});

/* ══════ 대시보드 🔄 새로고침 (요금 조사 2026-08-16) ══════
   「나의 업무」·「법인 대시보드」의 🔄 가 fbInitialSync() 를 **조건 없이** 불렀다 —
   한 번에 data 통째 2.83MB(실측). 다섯 번 누르면 14MB.
   바로 옆 복귀 재동기화는 이미 막아 뒀는데 단추 쪽만 문이 없었다. */

test('★ 🔄 를 되풀이 눌러도 통째로 다시 받지 않는다 — 이것이 새던 자리다', () => {
  const clock = makeClock(1000000);
  const { sandbox, calls } = loadResync({ clock });
  assert.equal(typeof sandbox.window.erpRefreshData, 'function',
    'erpRefreshData 가 없습니다');
  assert.equal(sandbox.window.erpRefreshData(), true, '첫 번은 받아야 합니다');
  clock.advance(1000);
  sandbox.window.erpRefreshData();
  clock.advance(1000);
  sandbox.window.erpRefreshData();
  assert.equal(calls.fbInitialSync, 1,
    '★ 🔄 를 세 번 눌러 2.83MB 를 세 번 받았습니다');
});

test('★ 오래 지났으면 🔄 가 실제로 받는다 — 구독이 끊겼을 수 있다', () => {
  const clock = makeClock(1000000);
  const { sandbox, calls } = loadResync({ clock });
  sandbox.window.erpRefreshData();
  clock.advance(70000);                    // 문턱(60초) 넘김
  assert.equal(sandbox.window.erpRefreshData(), true);
  assert.equal(calls.fbInitialSync, 2, '오래 지났는데도 안 받으면 낡은 화면이 남습니다');
});

test('★ 복귀 재동기화와 시계를 함께 쓴다 — 방금 받아 놓고 단추로 또 받지 않는다', () => {
  /* 시계를 따로 두면 「탭 복귀로 막 받았는데 🔄 를 누르니 또 받는」 겹치기가
     그대로 남는다. 이 검사가 그 하나를 못박는다. */
  const clock = makeClock(1000000);
  const { sandbox, calls, listeners } = loadResync({ clock });
  listeners.window.blur();
  clock.advance(90000);
  listeners.window.focus();                // 복귀 재동기화가 받음
  assert.equal(calls.fbInitialSync, 1);
  clock.advance(1000);
  assert.equal(sandbox.window.erpRefreshData(), false,
    '★ 방금 받았는데 단추가 또 받습니다');
  assert.equal(calls.fbInitialSync, 1);
});

test('🔄 도 fbDb·동기화 전이면 아무것도 안 한다', () => {
  const a = loadResync({ fbDb: null, clock: makeClock(100000) });
  assert.equal(a.sandbox.window.erpRefreshData(), false);
  assert.equal(a.calls.fbInitialSync, 0);
  const b = loadResync({ fbSynced: false, clock: makeClock(100000) });
  assert.equal(b.sandbox.window.erpRefreshData(), false);
  assert.equal(b.calls.fbInitialSync, 0);
});

test('★ 두 대시보드가 모두 erpRefreshData 를 거친다 — 한쪽만 고치면 그쪽으로 샌다', () => {
  /* ⚠ **주석을 걷어내고** 본다. 안 걷으면 "fbInitialSync() 를 바로 부르지 않는다"라고
     적어 둔 설명 주석 자체가 「직접 부른다」로 잡힌다 — 실제로 여기서 한 번 속았다. */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const fn of ['refreshDash', 'corpRefresh']) {
    const m = app.match(new RegExp('function ' + fn + '\\(\\)\\{[\\s\\S]*?\\n  \\}'));
    assert.ok(m, fn + ' 를 찾지 못했습니다');
    const body = strip(m[0]);
    assert.match(body, /window\.erpRefreshData\(\)/, fn + ' 이 문을 안 거칩니다');
    assert.ok(!/\bfbInitialSync\s*\(/.test(body),
      '★ ' + fn + ' 이 아직 fbInitialSync 를 직접 부릅니다 — 누를 때마다 2.83MB 입니다');
  }
});
