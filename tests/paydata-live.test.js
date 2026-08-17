'use strict';
/* 다섯이 같이 쓸 때 — 지켜보기와 부분 갱신 (대표 지시 2026-08-17)
   실행: node --test tests/*.test.js · 목업 docs/mockups/paydata-cowork.html

   ⚠ 여기가 틀리면 둘 중 하나다: 남이 담은 것이 영영 안 뜨거나(지켜보기가 안 걸림),
     한 번 담을 때 112곳 × 열두 달을 통째로 다시 받는다(요금·느려짐). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

/* ══════ 저장 층 — 그 자리만 읽고 지켜본다 ══════ */

function loadStore() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  const seen = { paths: [], ons: [], offs: [] };
  const subs = {};
  S.init({
    uid: 'U1',
    db: { ref: p => ({
      once: () => { seen.paths.push(p); return Promise.resolve({ val: () => ({ attend: { a: 1 } }) }); },
      on: (ev, cb) => { seen.ons.push(p); subs[p] = cb; return cb; },
      off: (ev, cb) => { seen.offs.push(p); if (subs[p] === cb) delete subs[p]; }
    }) }
  });
  return { S, seen, subs };
}

test('★ 한 자리만 읽을 때는 그 자리 길만 부른다 — 전체를 안 받는다', async () => {
  const { S, seen } = loadStore();
  await S.listArrivalOne('co_1', '202608');
  assert.equal(seen.paths.length, 1);
  assert.equal(seen.paths[0], 'paydata/arrivals/co_1/202608',
    '★ 통째로 받으면 다섯이 각자 112곳을 반복합니다: ' + seen.paths[0]);
});

test('업체나 달을 모르면 아무것도 안 읽는다', async () => {
  const { S, seen } = loadStore();
  assert.equal(await S.listArrivalOne('', '202608'), null);
  assert.equal(await S.listArrivalOne('co_1', ''), null);
  assert.equal(seen.paths.length, 0);
});

/* ⚠ once() 로 먼저 읽고 on() 을 또 걸면 **같은 값을 두 번 받는다.** */
test('★ 지켜보기는 on 하나만 쓴다 — once 로 먼저 읽지 않는다', () => {
  const { S, seen } = loadStore();
  S.watchArrival('co_1', '202608', () => {});
  assert.equal(seen.ons.length, 1);
  assert.equal(seen.paths.length, 0, '★ once 와 on 을 겹치면 같은 값을 두 번 받습니다');
});

test('★ 끊으면 실제로 끊긴다 — 안 끊으면 지켜보기가 쌓인다', () => {
  const { S, seen } = loadStore();
  const off = S.watchArrival('co_1', '202608', () => {});
  off();
  assert.equal(seen.offs.length, 1);
  assert.equal(seen.offs[0], 'paydata/arrivals/co_1/202608');
});

test('바뀐 값이 그대로 넘어온다', () => {
  const { S, subs } = loadStore();
  let got = null;
  S.watchArrival('co_1', '202608', v => { got = v; });
  subs['paydata/arrivals/co_1/202608']({ val: () => ({ attend: { a: 1, b: 1 } }) });
  assert.equal(Object.keys(got.attend).length, 2);
  subs['paydata/arrivals/co_1/202608']({ val: () => null });
  assert.equal(got, null, '다 버려서 빈 것도 알려 줘야 숫자가 내려갑니다');
});

test('업체를 모르면 지켜보지 않고, 끊기는 그래도 안전하다', () => {
  const { S, seen } = loadStore();
  const off = S.watchArrival('', '202608', () => {});
  assert.equal(seen.ons.length, 0);
  assert.doesNotThrow(() => off());
});

/* ══════ 화면 — 손에 든 도착 칸에 끼워 넣기 ══════ */

function loadApp(app) {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'const App = ' + JSON.stringify(Object.assign({ arrivals: {} }, app)) + ';',
    cut('putArrival'),
    'window.App = App; window.putArrival = putArrival;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 한 자리를 끼워 넣어도 다른 자리는 그대로다', () => {
  const W = loadApp({ arrivals: {
    co_1: { 202607: { attend: { old: 1 } } },
    co_2: { 202608: { ledger: { z: 1 } } }
  } });
  W.putArrival('co_1', '202608', { attend: { a: 1 } });
  assert.ok(W.App.arrivals.co_1[202607], '★ 다른 달이 사라졌습니다');
  assert.ok(W.App.arrivals.co_2[202608], '★ 다른 업체가 사라졌습니다');
  assert.equal(Object.keys(W.App.arrivals.co_1['202608'].attend).length, 1);
});

/* ⚠ 남겨 두면 마지막으로 버린 자료가 계속 「1장」으로 세어져, 없는 것을 있다고 한다. */
test('★ 그 자리가 비면 지운다 — 버린 뒤에도 1장이라 하면 안 된다', () => {
  const W = loadApp({ arrivals: { co_1: { 202608: { attend: { a: 1 } } } } });
  W.putArrival('co_1', '202608', null);
  assert.equal(W.App.arrivals.co_1['202608'], undefined);
});

test('처음 보는 업체도 받는다', () => {
  const W = loadApp({ arrivals: {} });
  W.putArrival('co_9', '202608', { attend: { a: 1 } });
  assert.ok(W.App.arrivals.co_9['202608']);
});

/* ══════ 화면 — 어디서 지켜보고 어디서 끊나 ══════ */

test('★ 서랍을 열면 지켜보고, 다른 자리로 가면 끊는다', () => {
  const w = cut('watchDrawer');
  assert.match(w, /drawerWatch\.key === key/, '같은 자리를 또 걸면 두 번 그려집니다');
  assert.match(w, /drawerWatch\.off\(\)/, '★ 안 끊으면 지켜보기가 하나씩 쌓입니다');
  assert.match(w, /S\.watchArrival\(/, '지켜보지 않으면 남이 담은 것이 영영 안 뜹니다');
});

/* 서랍을 열 때마다 두 번 읽으면 지켜보기를 붙인 뜻이 줄어든다. */
test('★ 처음 오는 값으로는 서랍을 다시 안 읽는다', () => {
  assert.match(cut('watchDrawer'), /if \(first\)/, '서랍을 열 때마다 두 번 읽습니다');
});

/* 화면·달·탭이 바뀌면 지켜보는 자리도 따라가야 한다 — 안 따라가면 앞 자리를
   지켜보며 「왜 안 바뀌지」가 된다. */
test('★ 화면·달·탭이 바뀌면 지켜보는 자리도 따라간다', () => {
  const go = html.match(/go\(screen, o\) \{[\s\S]*?\n  \},/);
  assert.ok(go, 'go 를 찾을 수 없습니다');
  assert.match(go[0], /watchDrawer\(\)/, '화면을 옮겨도 앞 자리를 지켜봅니다');
  assert.match(cut('changeMonth'), /watchDrawer\(\)/, '달을 바꿔도 앞 달을 지켜봅니다');
  assert.match(cut('screenDrawer'), /watchDrawer\(\)/, '탭을 바꿔도 앞 칸을 지켜봅니다');
});

/* ⚠ 전체를 지켜보면 다섯이 각자 112곳을 계속 받는다 — 이 기능의 값이 통째로 사라진다. */
test('★ 전체를 지켜보지 않는다 — 지금 보는 그 자리만', () => {
  assert.equal(/watchArrivals\(|watchAll\(/.test(html), false,
    '★ 전체 지켜보기가 생겼습니다 — 다섯이 각자 112곳을 계속 받습니다');
  assert.match(cut('watchDrawer'), /App\.companyId/, '지켜보는 자리가 지금 업체가 아닙니다');
});

/* 여러 업체·여러 달에 걸친 것은 자리를 하나로 못 집는다 — 거기서는 전체가 맞다. */
test('한꺼번에 내려보낼 때는 전체를 읽는다 — 여러 업체에 걸치기 때문', () => {
  assert.match(cut('bulkToDrawer'), /refreshArrivals\(\);/, '여러 업체 것을 한 자리로 집을 수 없습니다');
});

/* 근로계약서는 월 없는 칸(keep)에 있다 — 지금 보고 있는 달로 읽으면 엉뚱한 자리다. */
test('★ 한 건 버릴 때는 지금 보는 달이 아니라 그 자료의 칸을 읽는다', () => {
  assert.match(cut('toTrash'), /refreshArrivals\(rec\.companyId, rec\.month\)/,
    '★ 근로계약서를 버리면 엉뚱한 자리를 읽습니다');
});
