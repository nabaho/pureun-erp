/* 「새로보기」 단추 — 대표 지시 2026-08-09
   "화면에 새로보기 기능 있으면 좋겠다. 그렇게 해서 업데이트 된거 확인할 수 있게"

   자동 갈아끼우기는 원래 있었지만 대표님이 그걸 **알 수도 재촉할 수도** 없었다.
   여기서는 모양이 아니라 **동작**을 못 박는다 — 가짜 창을 만들어 실제로 돌린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-version.js'), 'utf8');

/* ── 아주 작은 가짜 창 ── */
function makeWindow(opts) {
  opts = opts || {};
  const listeners = {};
  const store = {};
  const el = () => {
    const e = {
      style: { cssText: '' }, children: [], _text: '', innerHTML: '', id: '', type: '',
      handlers: {},
      setAttribute() {}, addEventListener(n, f) { (e.handlers[n] = e.handlers[n] || []).push(f); },
      appendChild(c) { e.children.push(c); return c; },
      get textContent() { return e._text; }, set textContent(v) { e._text = v; },
      parentNode: null, removeChild() {}
    };
    return e;
  };
  const body = el();
  const win = {
    document: {
      readyState: 'complete', body,
      scripts: [{ src: 'https://x/pureunall/js/pu-version.js' }],
      createElement: el,
      addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); }
    },
    location: { href: 'https://x/pureunall/pu-photos.html', replace(u) { win._went = u; } },
    sessionStorage: {
      getItem(k) { return k in store ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; }
    },
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    setTimeout: (f) => { if (opts.runTimers) f(); return 0; },
    clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    fetch: opts.fetch,
    _listeners: listeners, _store: store
  };
  win.window = win;
  return win;
}

function run(win) {
  const ctx = { window: win, URL, Date, Math, JSON, Promise, console, Error };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return win;
}
const okFetch = (sha) => () => Promise.resolve({ ok: true, json: () => Promise.resolve({ sha, shortSha: String(sha).slice(0, 8) }) });
const fab = (win) => win.document.body.children.find(c => c.id === 'pu-version-fab');

/* ── 붙는가 ── */
test('★ 단추가 화면에 붙는다', () => {
  const win = run(makeWindow({ fetch: okFetch('aaaa1111') }));
  const b = fab(win);
  assert.ok(b, '단추가 안 붙으면 대표님이 확인할 길이 없습니다.');
  assert.ok(/position:fixed/.test(b.style.cssText), '떠 있어야 어느 화면에서나 보입니다.');
});

test('★ 아래쪽 단추들과 겹치지 않게 띄워 둔다', () => {
  const win = run(makeWindow({ fetch: okFetch('aaaa1111') }));
  const css = fab(win).style.cssText;
  const m = css.match(/bottom:(\d+)px/);
  assert.ok(m, 'bottom 이 정해져 있어야 합니다.');
  assert.ok(Number(m[1]) >= 80,
    '기업정보함 ＋ 단추·포털 📷 단추가 바닥에 붙어 있습니다 — 그 위로 올려야 안 겹칩니다.');
});

/* ── 눌렀을 때 ── */
test('★ 새 버전이 있으면 눌러서 곧바로 연다', async () => {
  const win = makeWindow({ fetch: okFetch('bbbb2222'), runTimers: false });
  win.sessionStorage.setItem('pu_loaded_release_v1', 'old00000');   // 이미 뭔가 열려 있는 상태
  run(win);
  const b = fab(win);
  /* 열 때 도는 확인이 끝나야 누를 수 있다 — 아직 도는 중이면 check() 가
     곧바로 false 를 돌려준다(겹쳐 부르기 막는 장치). 실제 브라우저에서는
     사람이 누를 때쯤이면 이미 끝나 있다. */
  for (let i = 0; i < 12; i++) await Promise.resolve();
  (b.handlers.click || []).forEach(f => f());
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.ok(win._went, '눌렀는데 새로 열리지 않습니다.');
  assert.ok(/v=bbbb2222/.test(win._went), '새 버전 표를 달고 열어야 캐시가 안 남습니다.');
});

test('★ 이미 최신이면 화면을 새로 열지 않는다', async () => {
  const win = makeWindow({ fetch: okFetch('same1234') });
  win.sessionStorage.setItem('pu_loaded_release_v1', 'same1234');
  run(win);
  const b = fab(win);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  (b.handlers.click || []).forEach(f => f());
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.ok(!win._went,
    '최신인데 새로 열면 하던 일이 날아갑니다 — 「최신입니다」라고만 알려야 합니다.');
  assert.ok(/최신/.test(b.innerHTML), '아무 반응이 없으면 고장으로 보입니다.');
});

/* ── 저장 중에는 안 바꾼다 (가장 중요) ── */
test('★ 저장 중이면 눌러도 새로 열지 않는다', async () => {
  const win = makeWindow({ fetch: okFetch('cccc3333') });
  win.sessionStorage.setItem('pu_loaded_release_v1', 'old00000');
  run(win);
  /* 저장 중 신호를 보낸다 — 앱들이 pu:save-state 로 알린다 */
  (win._listeners['pu:save-state'] || []).forEach(f => f({ detail: { state: 'saving' } }));
  const b = fab(win);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  (b.handlers.click || []).forEach(f => f());
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.ok(!win._went,
    '저장이 끝나기 전에 새로 열면 쓰던 것이 날아갑니다.');
});

/* ── 뒤에서 찾은 것도 알려준다 ── */
test('저절로 새 버전을 찾으면 단추가 알려 준다', () => {
  assert.ok(/function bgCheck\(\)/.test(SRC) && /setFab\('has'/.test(SRC),
    '「최신」이라고 적힌 채 저절로 바뀌면 무슨 일인지 알 수 없습니다.');
  assert.ok(/setInterval\(bgCheck/.test(SRC), '주기 확인도 단추에 반영돼야 합니다.');
});

/* ── 갈아끼우는 곳은 한 군데 ── */
test('기다렸다 하는 길과 눌러서 하는 길이 같은 곳을 쓴다', () => {
  assert.ok(/function doApply\(version\)/.test(SRC), '갈아끼우기가 한 곳에 모여 있어야 합니다.');
  const idle = SRC.match(/function applyWhenIdle\(\)[\s\S]*?\n  \}/);
  const now = SRC.match(/function applyNow\(\)[\s\S]*?\n  \}/);
  assert.ok(/doApply\(version\)/.test(idle[0]) && /doApply\(version\)/.test(now[0]),
    '두 길이 따로 적혀 있으면 한쪽만 고치는 사고가 납니다.');
});
