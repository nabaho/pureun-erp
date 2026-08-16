const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resilience = require('../js/pu-resilience.js');
const root = path.resolve(__dirname, '..');

test('transient connection failures are retried', () => {
  for (const code of ['NETWORK_ERROR', 'database/disconnected', 'unavailable', 'fetch failed', 'timeout']) {
    assert.equal(resilience.isTransientError({ code }), true, code);
  }
});

test('permission and validation failures are never queued as successful writes', () => {
  for (const code of ['PERMISSION_DENIED', 'auth/invalid-user', 'validation failed']) {
    assert.equal(resilience.isTransientError({ code }), false, code);
  }
});

test('locks and presence records are excluded from delayed replay', () => {
  for (const dbPath of ['data/activeWriter', 'users/u1/presence', '.info/connected', 'connections/u1']) {
    assert.equal(resilience.isExcludedPath(dbPath), true, dbPath);
  }
  assert.equal(resilience.isExcludedPath('data/scal_cos/customer-1'), false);
});

test('every Firebase HTML entry loads resilience and health runtimes in safe order', () => {
  const entries = [
    'chwieop.html', 'docs-esign.html', 'enter.html', 'fund-poc.html', 'fund.html',
    'gov-consulting.html', 'ieum-view.html', 'kcareer.html', 'payroll-os.html',
    /* ⚠ 2026-08-08 pu-camera.html 을 뺐다 — 촬영 코드를 사진첩 하나로 합치면서
       문패만 남는 넘김 페이지가 됐다(pu-photos.html?cam=1 로 replace).
       Firebase 를 싣지 않으므로 이 목록의 대상이 아니다. 아이콘이 깨지지 않게
       파일과 manifest 는 그대로 둔다. */
    'pu-cards.html', 'pu-erp.html', 'pu-photos.html', 'rules.html', 'sign.html',
    'work.html', 'app/payroll_app_fb.html', 'reference/payroll_mvp.html'
  ];
  for (const entry of entries) {
    const html = fs.readFileSync(path.join(root, entry), 'utf8');
    const databaseAt = html.search(/firebase-database(?:-compat)?\.js/);
    const runtimeAt = html.indexOf('pu-resilience.js');
    const healthAt = html.indexOf('pu-health.js');
    const versionAt = html.indexOf('pu-version.js');
    assert.ok(databaseAt >= 0, `${entry}: Firebase Database script missing`);
    assert.ok(runtimeAt > databaseAt, `${entry}: resilience runtime must load after Firebase Database`);
    assert.ok(healthAt > runtimeAt, `${entry}: health runtime must load after resilience runtime`);
    assert.ok(versionAt > healthAt, `${entry}: version watcher must load after health runtime`);
  }
});

test('mapped operational systems expose automatic backup and point-in-time restore runtime', () => {
  const entries = [
    'enter.html', 'chwieop.html', 'docs-esign.html', 'fund.html', 'gov-consulting.html',
    'kcareer.html', 'payroll-os.html', 'pu-cards.html', 'rules.html', 'work.html'
  ];
  for (const entry of entries) {
    const html = fs.readFileSync(path.join(root, entry), 'utf8');
    assert.match(html, /pu-backup\.js/, entry);
  }
});

test('current Firebase rules isolate fault creation and reserve alert reads for the primary administrator', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'firebase-rules-현재적용본.json'), 'utf8')).rules;
  assert.match(rules.systemAlerts['.read'], /isAdmin/);
  assert.doesNotMatch(rules.systemAlerts['.read'], /isSubAdmin/);
  const alertRule = rules.systemAlerts.$uid.$id;
  assert.doesNotMatch(alertRule['.write'], /isSubAdmin/);
  assert.match(alertRule['.write'], /auth\.uid === \$uid/);
  assert.match(alertRule['.write'], /!data\.exists\(\)/);
  assert.match(alertRule.status['.validate'], /new\|resolved/);
});

test('health alert badge is shown only to the primary administrator', () => {
  const runtime = fs.readFileSync(path.join(root, 'js', 'pu-health.js'), 'utf8');
  const monitor = runtime.slice(runtime.indexOf('function monitorAdmin'), runtime.indexOf('function bindApp'));
  assert.match(monitor, /role\.isAdmin/);
  assert.doesNotMatch(monitor, /role\.isSubAdmin/);
});

/* ══════ 낫지 않는 저장을 영원히 다시 보내지 않는다 (2026-08-16) ══════
   대표 화면: 기업 상세에서 파이어베이스 오류가 1,000건 넘게 쏟아졌다.
   원인 구조 — 서버가 'internal' 로 거절한 저장은 isTransientError 가 «일시적»으로
   보고 다시 보낸다. 두 번 더 해 보고 안 되면 복구 대기줄에 넣는데, 그 줄은 연결될
   때마다·로그인할 때마다·인터넷이 붙을 때마다 통째로 다시 나갔다. attempts 칸을
   0으로 적어 두고 «아무도 올리지 않아» 7일 동안 되풀이가 끝나지 않았다.
   ⚠ 그렇다고 지우면 안 된다 — 대표가 저장한 것을 조용히 버리는 셈이다. 세워만 둔다. */

test('replay attempts are capped so a poison write cannot loop forever', () => {
  assert.equal(typeof resilience.MAX_REPLAY_ATTEMPTS, 'number');
  assert.ok(resilience.MAX_REPLAY_ATTEMPTS >= 1 && resilience.MAX_REPLAY_ATTEMPTS <= 20,
    '너무 크면 되풀이가 길어지고, 0이면 한 번도 안 해 본다');
});

test('the replay loop counts attempts and parks a write that keeps failing', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'pu-resilience.js'), 'utf8');
  const at = src.indexOf('function replayQueue(');
  assert.ok(at > 0, 'replayQueue 를 못 찾음');
  const fn = src.slice(at, src.indexOf('function replayAll', at));
  assert.match(fn, /attempts = Number\(/, '몇 번 해 봤는지 안 올린다 — 영원히 다시 나간다');
  assert.match(fn, /MAX_REPLAY_ATTEMPTS/, '멈출 지점이 없다');
  assert.match(fn, /parked = true/, '더 안 보내고 세워 두는 표시가 없다');
  assert.doesNotMatch(fn, /\.splice\(/, '실패한 저장을 지워 없애면 안 된다');
});

test('parked writes are skipped by later replays but kept on disk', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'pu-resilience.js'), 'utf8');
  const at = src.indexOf('function replayQueue(');
  const head = src.slice(at, at + 400);
  assert.match(head, /!item\.parked/, '세워 둔 것을 또 보내면 되풀이가 그대로다');
});

test('the pending/parked counts can be read, so a stall can name its cause', () => {
  assert.equal(typeof resilience.stats, 'function');
  const s = resilience.stats('nonexistent-project');
  assert.equal(s.pending, 0);
  assert.equal(s.parked, 0);
  assert.ok(Array.isArray(s.worst));
});
