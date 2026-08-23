const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'build-hana-sms-bridge.yml'),
  'utf8'
);
const gradle = fs.readFileSync(
  path.join(root, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts'),
  'utf8'
);

test('하나문자 앱은 정식 서명 release APK만 배포한다', () => {
  assert.match(workflow, /assembleRelease/);
  assert.doesNotMatch(workflow, /assembleDebug/);
  assert.match(workflow, /apksigner" verify --verbose --print-certs/);
  assert.match(workflow, /pureun-hana-message-s25-v3\.apk/);
  assert.match(workflow, /secrets\.HANA_RELEASE_KEYSTORE_BASE64/);
  assert.match(workflow, /secrets\.HANA_RELEASE_STORE_PASSWORD/);
  assert.match(workflow, /secrets\.HANA_RELEASE_KEY_ALIAS/);
  assert.match(workflow, /secrets\.HANA_RELEASE_KEY_PASSWORD/);
});

test('앱 버전과 정식 서명 환경변수 구성이 일치한다', () => {
  assert.match(gradle, /versionCode\s*=\s*3/);
  assert.match(gradle, /versionName\s*=\s*"1\.0\.2"/);
  assert.match(gradle, /create\("hanaRelease"\)/);
  assert.match(gradle, /HANA_RELEASE_KEYSTORE_PATH/);
  assert.match(gradle, /HANA_RELEASE_STORE_PASSWORD/);
  assert.match(gradle, /HANA_RELEASE_KEY_ALIAS/);
  assert.match(gradle, /HANA_RELEASE_KEY_PASSWORD/);
});
