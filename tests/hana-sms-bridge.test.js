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
  /* ⚠ 단추 «글자»를 못 박고 있었다. 2026-08-30 에 손잡이 셋을 「📱 하나문자 ▾」
       차림표 하나로 묶으면서(대표: 「2줄 1줄로 줄여라」) 글자가 나뉘어 깨졌다 —
       코드는 멀쩡했다. 지킬 것은 모양이 아니라 «그 일을 할 수 있는가» 다. */
  assert.match(erp, /휴대폰 연결/, '휴대폰을 잇는 길이 화면에 없습니다');
  assert.match(erp, /문자 가져오기/, '문자를 가져오는 길이 화면에 없습니다');
  assert.match(erp, /startHanaSmsPair\(\)/, '연결을 시작하는 자리가 없습니다');
  assert.match(erp, /importHanaSms\(\)/, '가져오기를 부르는 자리가 없습니다');
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

test('Android 앱은 평소에 알림만 쓰고, 문자를 가로채지 않는다', () => {
  /* ⚠ 2026-08-29 에 이 줄이 「READ_SMS 도 없어야 한다」였고, 대표 지시로 바뀌었다.
       「이미 문자로 온 거 확인할 수 없나, 최근 1개월」 — 알림은 지나가면 사라져서
       앱을 깔기 «전»에 온 문자는 문자함에서 끌어오는 수밖에 없다.
     ★ 그래도 «가로채기»(RECEIVE_SMS)는 여전히 안 된다. 둘은 아주 다르다:
       READ_SMS  = 대표가 단추를 누를 때 문자함을 «들여다본다»
       RECEIVE_SMS = 문자가 올 때마다 앱이 «먼저 받는다» (평소에 늘 깨어 있다)
       뒤엣것을 넣으면 이 앱은 문자 감시기가 된다 — 넣을 까닭이 없다.
     지난 문자 가져오기 자체는 tests/hana-sms-history.test.js 가 지킨다. */
  assert.doesNotMatch(manifest, /RECEIVE_SMS/,
    '★ 문자를 가로채는 권한입니다 — 지난 문자 가져오기에는 필요 없습니다');
  assert.doesNotMatch(manifest, /SMS_DELIVER|BROADCAST_SMS/,
    '★ 문자를 먼저 받는 자리에 끼어들고 있습니다');
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
