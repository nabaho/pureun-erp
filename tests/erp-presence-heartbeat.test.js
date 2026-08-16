'use strict';
/* 접속자 심장박동이 30초마다 «기록 전체»를 다시 쓰던 것 (요금 조사 2026-08-16)

   presence 는 모든 기기가 통째로 구독한다(`ref('presence').on('value')`).
   그래서 한 기기가 자기 기록을 통째로 다시 쓰면 그 내용이 **접속 중인 모든
   기기**에게 퍼진다. 기기 D 대면 30초마다 D×D 번이 오간다 — 아무도 일을 안
   해도 계속 나가는 돈이다. 바뀌는 것은 lastSeen 하나뿐인데도 그랬다.

   ⚠ 자가복구(이름·sid 가 늦게 도착해 사번으로 찍혔던 것을 바로잡는 것)는
     반드시 살아 있어야 한다 — 그것 때문에 통째로 쓰던 것이라서다.
     그래서 이 검사는 「가볍게 쓴다」와 「달라지면 통째로 쓴다」를 **둘 다** 본다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* _writePresence 만 떼어 가짜 ref 와 함께 돌린다 — 글자 검사가 아니라
   **실제로 돌려서 set/update 횟수를 센다.** (같은 기법: erp-resync-idle.test.js) */
function load(env) {
  const i = app.indexOf('var _presenceLastFull = null;');
  assert.ok(i > 0, '_presenceLastFull 을 찾을 수 없습니다');
  const j = app.indexOf('\nfunction presenceListLive(', i);
  assert.ok(j > i, '_writePresence 토막의 끝을 찾을 수 없습니다');
  const src = app.slice(i, j);

  const calls = { set: [], update: [] };
  const sandbox = Object.assign({
    String, Object, Date,
    DEVICE_NAME: 'PC-테스트',
    CURRENT_USER: null,
    getSessionSid: () => 'P-001',
    buildCurrentUser: null,
    sidToName: () => '',
    _presencePayload: { sid: 'P-001', name: '권형하', loginAt: 1000 },
    _presenceRef: {
      set(v) { calls.set.push(v); return { catch() {} }; },
      update(v) { calls.update.push(v); return { catch() {} }; }
    }
  }, env || {});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'presence.js' }).runInContext(sandbox);
  return { sandbox, calls };
}

test('★ 달라진 게 없으면 lastSeen 한 칸만 쓴다 — 이것이 새던 자리다', () => {
  const { sandbox, calls } = load();
  sandbox._writePresence(true);          // 로그인 직후 — 통째로
  assert.equal(calls.set.length, 1);
  sandbox._writePresence();              // 30초 뒤
  sandbox._writePresence();              // 60초 뒤
  sandbox._writePresence();              // 90초 뒤
  assert.equal(calls.set.length, 1,
    '★ 심장박동마다 기록 전체를 다시 써 모든 기기로 퍼집니다');
  assert.equal(calls.update.length, 3, '가볍게 쓰기가 안 걸렸습니다');
  assert.deepEqual(Object.keys(calls.update[0]), ['lastSeen'],
    '★ lastSeen 말고 다른 칸까지 쓰면 가볍게 쓴 뜻이 없습니다');
});

test('★ 이름이 뒤늦게 잡히면 통째로 다시 쓴다 — 자가복구는 살아 있어야 한다', () => {
  /* 명부가 늦게 도착해 처음엔 사번(P-001)으로 찍혔다가 나중에 이름이 잡히는
     경우다. 여기서 통째로 안 쓰면 사번이 접속자 목록에 영원히 남는다. */
  let nm = '';
  const { sandbox, calls } = load({
    _presencePayload: { sid: 'P-001', name: '', loginAt: 1000 },
    sidToName: () => nm
  });
  sandbox._writePresence(true);
  assert.equal(calls.set.length, 1);
  assert.equal(calls.set[0].name, 'P-001', '이름이 없으면 사번으로 적힌다');

  nm = '권형하';                          // 명부가 도착했다
  sandbox._writePresence();              // 다음 심장박동
  assert.equal(calls.set.length, 2,
    '★ 이름이 바뀌었는데 가볍게만 써서 사번이 그대로 남습니다');
  assert.equal(calls.set[1].name, '권형하');

  sandbox._writePresence();              // 그 다음은 다시 가볍게
  assert.equal(calls.set.length, 2, '안 바뀌었는데 또 통째로 씁니다');
  assert.equal(calls.update.length, 1);
});

test('통째로 쓸 때도 lastSeen 은 함께 적는다 — 없으면 곧바로 낡은 것으로 숨는다', () => {
  const { sandbox, calls } = load();
  sandbox._writePresence(true);
  assert.ok(calls.set[0].lastSeen > 0, 'lastSeen 이 없으면 90초 규칙에 걸려 사라집니다');
  assert.equal(calls.set[0].sid, 'P-001');
  assert.equal(calls.set[0].device, 'PC-테스트');
});

test('자리가 없으면 아무것도 안 쓴다', () => {
  const { sandbox, calls } = load({ _presenceRef: null });
  sandbox._writePresence(true);
  assert.equal(calls.set.length, 0);
});

/* ── 유령 접속자 (실데이터에서 2건 발견) ── */
test('★ 심장박동 타이머가 _writePresence 를 맨손으로 부른다', () => {
  /* setInterval(_writePresence, ...) 로 넘기면 타이머가 주는 인자가 full 로
     들어가 「통째로 쓰기」가 켜질 수 있다 — 고친 것이 조용히 되돌아간다. */
  assert.match(app, /setInterval\(function\(\)\{ _writePresence\(\); \}, 30 \* 1000\)/,
    '★ 타이머가 _writePresence 를 그대로 넘깁니다');
});

test('처음 기록은 반드시 통째로 쓴다', () => {
  assert.match(app, /_writePresence\(true\);\s*\/\/ 즉시 1회/,
    '처음부터 가볍게 쓰면 기록이 아예 안 생깁니다');
});

/* ══════ 유령 접속자 치우기 (실데이터: 10건 중 9건이 9~43일 된 유령) ══════ */

/* 구독 콜백만 떼어 실제로 돌린다 — 무엇을 지우는지 「지운 자리 목록」으로 센다. */
function loadPrune(entries, opts) {
  opts = opts || {};
  const i = app.indexOf("fbDb.ref('presence').on('value', function(snap){");
  assert.ok(i > 0, 'presence 구독을 찾을 수 없습니다');
  const j = app.indexOf('\n      });', i);
  assert.ok(j > i, '구독 토막의 끝을 찾을 수 없습니다');
  const src = app.slice(i, j + '\n      });'.length);

  const removed = [];
  const NOW = 1000000000;
  const sandbox = {
    Object, Date: { now: () => NOW },
    console: { log() {} },
    PRESENCE_STALE_MS: 90 * 1000,
    PRESENCE_DEAD_MS: 24 * 60 * 60 * 1000,
    _presencePruned: opts.pruned || false,
    _presenceKey: 'me__P-001',
    _presenceList: [], _presenceAnnounced: {},
    showToast() {},
    window: { dispatchEvent() {} },
    CustomEvent: function () {},
    fbDb: {
      ref(p) {
        return {
          on(_ev, cb) { cb({ val: () => entries }); },
          remove() { removed.push(p); return { catch() {} }; }
        };
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'presence-sub.js' }).runInContext(sandbox);
  return { removed, sandbox, NOW };
}

test('★ 하루 넘게 조용한 유령만 치운다 — 산 자리·내 자리는 안 건드린다', () => {
  const NOW = 1000000000;
  const { removed } = loadPrune({
    'me__P-001':    { sid: 'P-001', name: '나',   lastSeen: NOW },                    // 내 자리
    'live__P-003':  { sid: 'P-003', name: '동료', lastSeen: NOW - 30 * 1000 },        // 살아 있음
    'blip__P-004':  { sid: 'P-004', name: '깜빡', lastSeen: NOW - 10 * 60 * 1000 },   // 10분 — 잠깐 끊김
    'ghost__P-007': { sid: 'P-007', name: '유령', lastSeen: NOW - 9 * 86400000 },     // 9일
    'ghost2__':     { sid: '',      name: '유령2' }                                    // lastSeen 아예 없음
  });
  assert.deepEqual(removed.sort(), ['presence/ghost2__', 'presence/ghost__P-007'].sort(),
    '★ 산 자리나 내 자리를 지우면 접속자 목록이 서로를 지우며 깜빡입니다');
});

test('★ 세션당 한 번만 치운다 — 볼 때마다 지우면 기기끼리 쓰기를 퍼붓는다', () => {
  const NOW = 1000000000;
  const { removed } = loadPrune({
    'ghost__P-007': { sid: 'P-007', name: '유령', lastSeen: NOW - 9 * 86400000 }
  }, { pruned: true });
  assert.equal(removed.length, 0, '★ 이미 치웠는데 또 치웁니다');
});

test('죽음 문턱은 낡음 문턱보다 훨씬 멀다', () => {
  /* 90초로 지우면 잠깐 끊긴 멀쩡한 기기를 남이 지운다 */
  const m = app.match(/var PRESENCE_DEAD_MS = ([^;]+);/);
  assert.ok(m, 'PRESENCE_DEAD_MS 가 없습니다');
  const dead = Function('return ' + m[1])();
  assert.ok(dead >= 60 * 60 * 1000,
    '★ 죽음 문턱이 너무 짧으면 살아 있는 기기를 지웁니다');
});
