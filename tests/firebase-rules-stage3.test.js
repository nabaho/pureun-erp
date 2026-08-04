const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rulesPath = path.join(__dirname, '..', 'docs', 'firebase-rules-3순위-포털권한.json');
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8')).rules;

test('개인 포털 설정은 UID 소유자만 읽고 쓴다', () => {
  const node = rules.data.portal_prefs_uid.$uid;
  assert.match(node['.read'], /auth\.uid === \$uid/);
  assert.match(node['.write'], /auth\.uid === \$uid/);
});

test('건의 수정과 답변은 관리자만 가능하고 신규 작성자는 UID를 남긴다', () => {
  assert.match(rules.suggestions_private['.read'], /isAdmin/);
  assert.match(rules.suggestions_meta_private['.read'], /isAdmin/);
  const write = rules.suggestions_private.$id['.write'];
  assert.match(write, /isAdmin/);
  assert.match(write, /!data\.exists\(\)/);
  assert.match(write, /authorUid/);
  assert.match(write, /auth\.uid/);
});

test('구 이메일 기반 해결 알림도 관리자만 읽는다', () => {
  assert.match(rules.data.sg_resolved['.write'], /isAdmin/);
  assert.match(rules.data.suggestions['.write'], /isAdmin/);
});

test('해결 알림은 대상 UID와 관리자만 접근한다', () => {
  const node = rules.suggestions_resolved_private.$uid;
  assert.match(node['.read'], /auth\.uid === \$uid/);
  assert.match(node['.read'], /isAdmin/);
  assert.match(node['.write'], /auth\.uid === \$uid/);
  assert.match(node['.write'], /isAdmin/);
});

test('서버 백업 네 경로는 관리자 또는 위임관리인만 접근한다', () => {
  for (const key of [
    'serverBackups',
    'serverBackupsIndex',
    'serverBackupsRecent',
    'serverBackupsRecentIndex',
  ]) {
    assert.match(rules[key]['.read'], /isAdmin/);
    assert.match(rules[key]['.read'], /isSubAdmin/);
    assert.match(rules[key]['.write'], /isAdmin/);
    assert.match(rules[key]['.write'], /isSubAdmin/);
  }
});

test('모든 권한성 uid_roles 필드의 자가부여를 제한한다', () => {
  for (const key of ['fin', 'hr', 'isAdmin', 'isSubAdmin', 'isFullViewer']) {
    const validation = rules.uid_roles.$uid[key]['.validate'];
    assert.match(validation, /isAdmin/);
    assert.match(validation, /newData\.val\(\) === false/);
  }
  for (const key of ['sid', 'role', 'status']) {
    assert.match(rules.uid_roles.$uid[key]['.validate'], /data\.exists/);
  }
});

