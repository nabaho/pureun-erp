const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('pull requests run the full system test suite', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/quality-gate.yml'), 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /node --test tests\/\*\.test\.js/);
});

test('Pages deployment cannot run before verification and packaging succeeds', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(workflow, /verify-and-package:/);
  assert.match(workflow, /node --test tests\/\*\.test\.js/);
  assert.match(workflow, /deploy:\s*[\s\S]*needs: verify-and-package/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
});

test('deployment generates version metadata before uploading the site', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  const versionAt = workflow.indexOf('node scripts/write-version.js');
  const uploadAt = workflow.indexOf('actions/upload-pages-artifact@v5');
  assert.ok(versionAt >= 0 && uploadAt > versionAt);
});

test('new versions apply automatically and only show a one-second completion notice', () => {
  const runtime = fs.readFileSync(path.join(root, 'js/pu-version.js'), 'utf8');
  assert.match(runtime, /window\.location\.replace/);
  assert.match(runtime, /새 버전으로 업데이트되었습니다/);
  assert.match(runtime, /}, 1000\)/);
  assert.doesNotMatch(runtime, /<button/);
});

test('backup and restore data is manager-only in current Firebase rules', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'docs/firebase-rules-전체-적용본.json'), 'utf8')).rules;
  for (const key of ['systemBackups', 'systemBackupsIndex', 'systemRestoreLog']) {
    assert.match(rules[key]['.read'], /isAdmin/);
    assert.match(rules[key]['.read'], /isSubAdmin/);
    assert.equal(rules[key]['.read'], rules[key]['.write']);
  }
});
