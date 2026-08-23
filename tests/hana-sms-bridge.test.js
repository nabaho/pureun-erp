const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const erp = fs.readFileSync('pu-erp.html', 'utf8');
const fn = fs.readFileSync('functions/index.js', 'utf8');
const manifest = fs.readFileSync('android/hana-sms-bridge/app/src/main/AndroidManifest.xml', 'utf8');
const listener = fs.readFileSync('android/hana-sms-bridge/app/src/main/java/kr/pureun/hanabridge/HanaNotificationListener.java', 'utf8');
const filter = fs.readFileSync('android/hana-sms-bridge/app/src/main/java/kr/pureun/hanabridge/HanaMessageFilter.java', 'utf8');
const secure = fs.readFileSync('android/hana-sms-bridge/app/src/main/java/kr/pureun/hanabridge/SecureStore.java', 'utf8');

test('ERP에 휴대폰 연결과 문자 가져오기 동작이 있다', () => {
  assert.match(erp, /🔗 휴대폰 연결/);
  assert.match(erp, /📱 문자 가져오기/);
  assert.match(erp, /hanaSmsCall\('list'\)/);
  assert.match(erp, /hanaSmsCall\('ack'/);
  assert.match(erp, /erpBankMergeDraft/);
  assert.match(erp, /erpUploadSummary/);
  /* ⚠ 못 박는 것은 «몇 ms 뒤에 어떤 글자로 부르는가» 가 아니라 규칙이다 —
     ① 화면을 열면 스스로 한 번 가져온다 ② 그 한 번은 «조용히» 부른다.
     예전에는 호출문을 글자 그대로 박아 두어, 자동 실행에 상태 확인을 덧붙인 것만으로
     검사가 깨졌다. 기능이 아니라 «모양» 이 바뀐 것이었다. */
  assert.match(erp, /useEffect\(function\(\)\{[\s\S]{0,400}?importHanaSms\(true\)/,
    '★ 화면을 열 때 스스로 한 번 가져오지 않으면, 늘 손으로 눌러야 합니다.');
  assert.match(erp, /hanaAutoOnce/, '★ 한 번만 돌아야 합니다 — 다시 그릴 때마다 부르면 안 됩니다.');
});

test('서버는 연결번호·기기키·중복차단·최소 거래정보만 다룬다', () => {
  assert.match(fn, /exports\.hanaMessageBridge/);
  assert.match(fn, /randomInt\(10000000, 100000000\)/);
  assert.match(fn, /Authorization|authorization/);
  assert.match(fn, /existing\.exists\(\)/);
  assert.match(fn, /status:\s*"pending"/);
  assert.doesNotMatch(fn, /rawText\s*:/);
});

test('Android 앱은 SMS 권한 없이 알림 접근만 사용한다', () => {
  assert.doesNotMatch(manifest, /READ_SMS|RECEIVE_SMS/);
  assert.match(manifest, /BIND_NOTIFICATION_LISTENER_SERVICE/);
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(listener, /NotificationListenerService/);
});

test('휴대폰은 메시지 앱을 제한하고 금융 보안문자를 거부한다', () => {
  assert.match(filter, /SAMSUNG_MESSAGES/);
  assert.match(filter, /GOOGLE_MESSAGES/);
  assert.match(filter, /인증번호/);
  assert.match(filter, /otp/i);
  assert.match(filter, /보안카드/);
  assert.match(filter, /MONEY\.matcher/);
  assert.match(filter, /DATE\.matcher/);
});

test('휴대폰 연결키는 Android Keystore로 암호화한다', () => {
  assert.match(secure, /AndroidKeyStore/);
  assert.match(secure, /AES\/GCM\/NoPadding/);
  assert.doesNotMatch(secure, /putString\(KEY_TOKEN,\s*token\)/);
});
