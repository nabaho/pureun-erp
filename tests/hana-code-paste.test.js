'use strict';
/* 연결번호를 붙여넣기로 끝낸다 + 앱을 열면 인사한다 (대표 지시 2026-08-31)

   「연결되었는지 확인하고 숫자도 복사 붙여넣기 바로 할 수 있게해라 계속 헤깔린다」

   ⚠★ 조용한 함정이 하나 있었다.
     화면에는 연결번호가 「1234 5678」로 «띄어» 크게 적혀 있다. 길게 눌러 복사하면
     띄어쓰기까지 딸려 간다. 그런데 폰 앱 입력칸은 여덟 «글자» 한도였다 —
     아홉 글자를 붙여넣으면 앞 여덟 자만 남아 「1234 567」, 숫자로는 일곱이다.
     연결이 안 되는데 왜 안 되는지 알 길이 없다. 「계속 헤깔린다」가 이것이다.

   두 쪽을 다 고친다 —
     · 화면: 눌러서 «숫자만» 복사 (보이는 띄어쓰기는 읽기 좋으라고 둔 것)
     · 폰: 붙여넣은 글에서 숫자만 골라 여덟 자까지 (띄어쓰기·붙임표 섞여도)
   한쪽만 고치면 다른 길로 또 샌다.

   ★ 그리고 앱을 열면 서버에 «인사»한다. 2026-08-31 에 새 앱을 깔았는데 서버
     기록은 옛 판 그대로였다 — 여는 것만으로는 아무 말도 안 했기 때문이다.
     ⚠ 인사에 «문자함 이야기를 넣으면 안 된다». 0통·못 읽음으로 적히면 화면이
       「폰이 문자함을 읽지 못했습니다」라고 거짓말한다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const JAVA = path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const erp = read(path.join(R, 'pu-erp.html'));
const main = bare(read(path.join(JAVA, 'MainActivity.java')));
const fn = bare(read(path.join(R, 'functions', 'index.js')));

/* ══════ ① 화면 — 숫자만 복사 ══════ */

const ctx = { window: {}, navigator: {}, document: {}, showToast: () => {} };
vm.createContext(ctx);
vm.runInContext(cutFn(erp, 'function hanaCopyCode(') + '\nthis.copy = hanaCopyCode;', ctx);

test('★★ 복사되는 것은 «숫자만»이다 — 띄어쓰기가 딸려 가면 연결이 안 된다', () => {
  let got = null;
  ctx.navigator.clipboard = { writeText: (t) => { got = t; return { then: (ok) => ok() }; } };
  ctx.copy('1234 5678');
  assert.equal(got, '12345678',
    '★★ 띄어쓰기가 섞여 나가면 폰 입력칸 여덟 자 한도에 걸려 숫자 일곱만 들어갑니다');
  ctx.copy('1234-5678');
  assert.equal(got, '12345678', '★ 붙임표가 섞여도 숫자만 나가야 합니다');
});

test('★ 번호가 없으면 조용히 빈 것을 복사하지 않는다', () => {
  let got = 'x';
  ctx.navigator.clipboard = { writeText: (t) => { got = t; return { then: (ok) => ok() }; } };
  ctx.copy('');
  assert.equal(got, 'x', '★ 빈 값을 복사하면 붙여넣어도 아무 일이 없어 더 헷갈립니다');
});

test('★★ 번호 칸 자체가 단추다 — 작은 글자를 겨눠 누르지 않아도 된다', () => {
  const at = erp.indexOf("hanaCopyCode(hanaPair.code)");
  assert.ok(at > 0, '★★ 화면에서 복사할 길이 없으면 손으로 옮겨 적게 됩니다');
  /* 큰 번호 칸과 별도 단추, 둘 다 복사로 이어져야 한다 */
  const n = erp.split('hanaCopyCode(hanaPair.code)').length - 1;
  assert.ok(n >= 2, '★ 번호 칸과 「복사」 단추 둘 다에서 되어야 합니다 (지금 ' + n + '군데)');
  assert.match(erp, /'📋 번호 복사'/, '★ 눌러도 되는 줄 모르면 안 누릅니다');
});

/* ══════ ② 폰 — 붙여넣기를 받아 준다 ══════ */

test('★★ 폰 입력칸이 «여덟 글자»가 아니라 «숫자 여덟»으로 센다', () => {
  /* 예전: new InputFilter[]{ new InputFilter.LengthFilter(8) } —
     「1234 5678」 아홉 글자에서 앞 여덟만 남아 숫자 일곱이 됐다. */
  assert.doesNotMatch(main, /new InputFilter\.LengthFilter\(8\)/,
    '★★ 글자 수로 자르면 띄어쓰기 든 붙여넣기가 조용히 잘립니다');
  const at = main.indexOf('code.setFilters(');
  assert.ok(at > 0, '거르개를 못 찾았습니다');
  const body = main.slice(at, at + 1400);
  assert.match(body, /c >= '0' && c <= '9'/,
    '★★ 숫자만 골라내지 않으면 띄어쓰기가 그대로 들어갑니다');
  assert.match(body, /8 - \(dest\.length\(\)/,
    '★ 이미 든 글자를 안 빼고 세면 여덟 자를 넘겨 받습니다');
  assert.match(body, /return null;/,
    '★ 바꿀 것이 없을 때 null 을 안 돌려주면 커서가 튑니다');
});

test('★ 붙여넣을 수 있다는 것을 «칸이 말해 준다»', () => {
  assert.match(main, /code\.setHint\("8자리 숫자 — 붙여넣기도 됩니다"\)/,
    '★ 되는 줄 모르면 손으로 옮겨 적습니다 — 그게 헷갈림의 시작입니다');
});

/* ══════ ③ 앱을 열면 인사 ══════ */

test('★★ 앱을 열면 서버에 인사한다 — 여는 것만으로는 아무 말도 안 했다', () => {
  const at = main.indexOf('protected void onResume()');
  assert.ok(at > 0, 'onResume 을 못 찾았습니다');
  const body = main.slice(at, main.indexOf('\n    }', at));
  assert.match(body, /sayHello/,
    '★★ 새 앱을 깔아도 서버가 모릅니다 — 「깔긴 깔았나」를 사람에게 되묻게 됩니다');
  assert.match(body, /!importing/,
    '★ 가져오는 중에도 인사하면 같은 말을 두 번 합니다');
  assert.match(body, /executor\.execute/,
    '★★ 화면을 막고 보내면, 서버가 느릴 때 앱이 안 열립니다');
});

test('★★ 인사는 «문자함 이야기를 하지 않는다» — 하면 화면이 거짓말한다', () => {
  const at = main.indexOf('private void sayHello(');
  assert.ok(at > 0, 'sayHello 를 못 찾았습니다');
  const body = main.slice(at, main.indexOf('\n    }', at));
  assert.match(body, /ping\.put\("hello", true\)/, '★★ 인사라고 밝히지 않으면 서버가 못 가릅니다');
  ['foundCount', 'readOk', 'capped'].forEach(function (k) {
    assert.ok(body.indexOf(k) < 0,
      '★★ 인사에 ' + k + ' 를 실으면, 열어 봤을 뿐인데 「문자함을 못 읽었다」가 됩니다');
  });
  /* 알려야 할 것 */
  assert.match(body, /canReadSms/, '★ 권한 상태를 안 보내면 무엇이 막혔는지 모릅니다');
  assert.match(body, /batteryFree/, '★ 절전 상태를 안 보내면 또 사람에게 묻게 됩니다');
  /* ⚠ 판 번호는 여기서 안 넣는다 — 보내는 자리 한 곳(HanaUploadWorker.post)이
       «모든» 말에 실어 준다. 여기서 또 넣으면 두 곳이 되고, 한쪽만 고치는 날이 온다.
       그러니 볼 것은 «그 길로 보내는가» 다. */
  assert.match(body, /HanaUploadWorker\.post\(ping/,
    '★★ 그 길로 안 보내면 판 번호가 안 실립니다 — 인사한 뜻이 절반이 됩니다');
  const up = bare(read(path.join(JAVA, 'HanaUploadWorker.java')));
  assert.match(up, /body\.put\("appVersion", BridgeConfig\.APP_VERSION\)/,
    '★★ 보내는 자리에서 판 번호를 안 실으면, 인사해도 서버는 판을 모릅니다');
});

test('★★ 서버가 인사에는 문자함 칸을 «안 적는다»', () => {
  const at = fn.indexOf('if (action === "sweepPing")');
  const body = fn.slice(at, fn.indexOf('if (action === "pairStatus")', at));
  assert.match(body, /const hello = body\.hello === true;/, '★★ 서버가 인사를 안 가릅니다');
  assert.match(body, /\.\.\.\(hello \? \{\} : \{\s*sweepFound/,
    '★★ 인사에 sweepFound 0 을 적으면 「문자함에 하나 문자가 없습니다」가 뜹니다');
  assert.match(body, /!hello && typeof body\.readOk === "boolean"/,
    '★★ 인사에 sweepReadOk 를 적으면 「문자함을 읽지 못했습니다」가 뜹니다');
  /* 연 것과 끌어온 것은 다르다 */
  assert.match(body, /byHand && !hello \? \{ lastHistoryAt/,
    '★★ 앱을 연 것을 「지난 문자를 끌어왔다」로 적으면, 화면이 안내를 그만둡니다');
});

test('★ 폰 앱 판 번호는 세 자리가 «같다»', () => {
  const v = (s, re) => { const m = s.match(re); return m && m[1]; };
  const A = path.join(R, 'android', 'hana-sms-bridge', 'app');
  const a = v(read(path.join(A, 'build.gradle.kts')), /versionName\s*=\s*"([\d.]+)"/);
  assert.equal(v(read(path.join(JAVA, 'BridgeConfig.java')), /APP_VERSION\s*=\s*"([\d.]+)"/), a);
  assert.equal(v(erp, /HANA_APK_VER\s*=\s*'([\d.]+)'/), a,
    '★ 화면이 알리는 판 번호가 앱과 다르면 「받았는데 옛것」이 됩니다');
});
