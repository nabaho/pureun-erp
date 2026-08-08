'use strict';
// 새 버전 확인이 본문을 받지 않는지 — node --test tests/erp-version-check.test.js
//
// 예전에는 이 파일(4MB+)을 통째로 받아 길이를 쟀다. 내려받기보다 그 다음이
// 문제였다 — 4MB 문자열에 정규식을 돌리는 동안 화면이 멈춘다(탭 복귀 7.7초).
// 이제 머리(HEAD)만 받아 ETag 를 본다. 되돌아가면 여기서 걸린다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
// 파일은 CRLF 다. 자를 자리를 찾을 때 줄바꿈 모양에 걸리지 않게 LF 로 맞춰 본다.
const app = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

/* pu-erp.html 은 한 파일 7만 줄이라 통째로 실행할 수 없다. 버전 확인 토막만
   떼어 가짜 fetch·가짜 sessionStorage 와 함께 돌린다. */
function load(opts) {
  opts = opts || {};
  const from = app.indexOf('var _vgLastFetch = 0;');
  // _vgCheckHtml 이 닫히는 곳까지 — 그 뒤 try 블록(호출 배선)은 떼어 낸다
  const to = app.indexOf('\ntry {\n  setTimeout(function(){ _vgCheckHtml(true); }, 4000);');
  assert.ok(from > 0 && to > from, '버전 확인 토막을 찾을 수 없습니다');

  const calls = [];                       // 무엇을 어떻게 불렀나
  const store = Object.assign({}, opts.session || {});
  let reloads = 0;
  const sandbox = {
    console: { warn() {}, log() {} },
    ERP_BUILD: '2026-08-07',
    _vgPending: !!opts.pending,
    _vgScheduleReload() { reloads++; },
    location: { protocol: opts.protocol || 'https:', pathname: '/pureunall/pu-erp.html' },
    sessionStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); }
    },
    fetch(url, init) {
      calls.push({ url, method: (init && init.method) || 'GET', cache: init && init.cache });
      const r = opts.reply ? opts.reply(url, init) : { ok: true, headers: { etag: '"a"' } };
      if (r === null) return Promise.reject(new Error('네트워크 실패'));
      return Promise.resolve({
        ok: r.ok !== false,
        headers: { get(h) { const v = r.headers && r.headers[String(h).toLowerCase()]; return v == null ? null : v; } },
        text() { return Promise.resolve(r.body || ''); }
      });
    },
    Date
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(app.slice(from, to), sandbox);
  return { sandbox, calls, store, reloads: () => reloads };
}
const flush = () => new Promise(r => setImmediate(() => setImmediate(r)));

test('본문을 받지 않는다 — 머리만 (이것이 멈춤의 원인이었다)', async () => {
  const t = load();
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].method, 'HEAD');
  assert.equal(t.calls[0].cache, 'no-store');
});

test('처음 본 표식은 기준으로만 적어 둔다 (켜자마자 새로고침하지 않게)', async () => {
  const t = load();
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.reloads(), 0);
  assert.equal(t.store['pureun_v6_html_sig'], '"a"');
});

test('표식이 그대로면 아무 일도 없다', async () => {
  const t = load({ session: { pureun_v6_html_sig: '"a"' } });
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.reloads(), 0);
});

test('표식이 바뀌면 새로고침을 예약한다', async () => {
  const t = load({ session: { pureun_v6_html_sig: '"old"' } });
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.reloads(), 1);
  assert.equal(t.store['pureun_v6_html_sig'], '"a"');
});

test('같은 표식으로 두 번 새로고침하지 않는다 (루프 방지)', async () => {
  const t = load({ session: { pureun_v6_html_sig: '"old"', pureun_v6_au_to: '"a"' } });
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.reloads(), 0);
});

test('ETag 가 없으면 수정시각, 그것도 없으면 길이를 쓴다', async () => {
  const lm = load({
    session: { pureun_v6_html_sig: 'x' },
    reply: () => ({ ok: true, headers: { 'last-modified': 'Fri, 08 Aug 2026 00:00:00 GMT' } })
  });
  lm.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(lm.store['pureun_v6_html_sig'], 'Fri, 08 Aug 2026 00:00:00 GMT');

  const cl = load({
    session: { pureun_v6_html_sig: 'x' },
    reply: () => ({ ok: true, headers: { 'content-length': '4276123' } })
  });
  cl.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(cl.store['pureun_v6_html_sig'], '4276123');
});

test('머리에 표식이 하나도 없으면 옛 방식으로 넘어간다 (검사가 죽지 않게)', async () => {
  const t = load({
    session: { pureun_v6_html_sig: '2026-08-07' },   // 기준이 있어야 달라진 것을 안다
    reply: (url, init) => (init && init.method === 'HEAD')
      ? { ok: true, headers: {} }
      : { ok: true, body: "var ERP_BUILD = '2026-08-08'" }
  });
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].method, 'GET');
  assert.equal(t.reloads(), 1);
});

test('HEAD 가 막힌 서버에서는 다음부터 머리를 묻지 않는다', async () => {
  const t = load({
    reply: (url, init) => (init && init.method === 'HEAD')
      ? { ok: false, headers: {} }
      : { ok: true, body: 'x' }
  });
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.calls.filter(c => c.method === 'HEAD').length, 1);
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.calls.filter(c => c.method === 'HEAD').length, 1, '두 번째는 HEAD 를 다시 묻지 않아야 한다');
});

test('5분 안에는 다시 묻지 않는다', async () => {
  const t = load();
  t.sandbox._vgCheckHtml(true);
  await flush();
  t.sandbox._vgCheckHtml(false);
  await flush();
  assert.equal(t.calls.length, 1);
});

test('새로고침이 이미 예약됐으면 묻지 않는다', async () => {
  const t = load({ pending: true });
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.calls.length, 0);
});

test('파일로 열었을 때는 아무것도 하지 않는다', async () => {
  const t = load({ protocol: 'file:' });
  t.sandbox._vgCheckHtml(true);
  await flush();
  assert.equal(t.calls.length, 0);
});

test('탭 복귀 때 부르는 자리가 남아 있다', () => {
  assert.match(app, /visibilitychange[\s\S]{0,120}_vgCheckHtml\(false\)/);
});
