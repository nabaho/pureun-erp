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

test('current Firebase rules isolate fault creation and reserve alert reads for managers', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'firebase-rules-현재적용본.json'), 'utf8')).rules;
  assert.match(rules.systemAlerts['.read'], /isAdmin/);
  assert.match(rules.systemAlerts['.read'], /isSubAdmin/);
  const alertRule = rules.systemAlerts.$uid.$id;
  assert.match(alertRule['.write'], /auth\.uid === \$uid/);
  assert.match(alertRule['.write'], /!data\.exists\(\)/);
  assert.match(alertRule.status['.validate'], /new\|resolved/);
});
