'use strict';
/* 「15분 훑기」가 «돌지 않는다»는 것을 폰이 크게 알린다 — 2026-08-30

   대표: 「핸드폰과 계속 연결 안 된다, 문자 안 온다」.
   연결은 멀쩡했다. 훑기가 «문자 읽기 권한이 없어» 돌지 않고 있었고,
   그 사실이 어디에도 안 보였다. 화면 아래 안내는 「15분마다 훑습니다」라고
   적혀 있었으니 오히려 거짓말을 하고 있었다.

   ★ 이 검사가 지키는 것 — 「조용한 실패를 만들지 않는다」
     ① 훑기는 권한이 있어야만 돈다(코드 사실). 그러니
     ② 권한이 없으면 화면이 그 말을 «해야» 하고,
     ③ 안내문이 「무조건 훑는다」로 되돌아가면 안 된다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const J = (n) => fs.readFileSync(path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge', n), 'utf8').split('\r\n').join('\n');

/* ⚠ 주석을 걷고 본다 — 안 걷으면 「예전에는 …라고 적혀 있었다」는 설명이
     코드로 읽혀 검사가 헛통과한다(이 저장소에서 여러 번 났다). */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const MAIN = bare(J('MainActivity.java'));
const SWEEP = bare(J('HanaSweepWorker.java'));

test('★ 훑기는 문자 읽기 권한이 있어야만 돈다 — 이 검사의 전제', () => {
  /* 전제가 바뀌면(권한 없이도 돌게 되면) 아래 경고는 필요 없어진다.
     그때는 이 검사부터 지우라고 알려 주기 위해 전제를 먼저 못 박는다. */
  assert.match(SWEEP, /checkSelfPermission\(Manifest\.permission\.READ_SMS\)/,
    '훑기가 권한을 안 봅니다 — 전제가 바뀌었으면 이 검사를 고치세요');
  assert.match(SWEEP, /if\s*\(canRead\)/,
    '권한이 없을 때 훑기가 무엇을 하는지 알 수 없습니다');
});

/* refresh 의 몸통만 — 괄호를 세어 끝까지 본다(고정 폭 자르기 금지) */
function refreshBody() {
  const at = MAIN.indexOf('private void refresh()');
  assert.ok(at > 0, 'refresh 를 못 찾았습니다');
  let d = 0, j = MAIN.indexOf('{', at);
  for (;; j++) { if (MAIN[j] === '{') d++; else if (MAIN[j] === '}') { d--; if (!d) { j++; break; } } }
  return MAIN.slice(at, j);
}

test('★★ 권한이 없으면 «화면이 그 말을 한다» — 없으면 「연결됨」만 보고 안심한다', () => {
  /* ⚠ 2026-08-30 에 방식이 바뀌었다 (대표: 「불필요한 설명 모두 없애라」).
       예전에는 showSweepWarning 이 경고문만 띄웠다. 지금은 refresh 가 그 상태에서
       «다른 것을 다 감추고» 「문자 읽기 켜기」 한 단추만 남긴다 — 오히려 더 세다.
     지킬 것은 함수 이름이 아니라 «그 상태를 사람이 알고 고칠 수 있는가» 다. */
  assert.match(refreshBody(), /canRead/, '★ refresh 가 문자 읽기 권한을 안 봅니다');
  assert.match(MAIN, /문자 읽기가 꺼져 있어/, '★ 무엇이 막혔는지 말해 주지 않습니다');
  assert.match(MAIN, /문자 읽기 켜기/, '★ 켜는 단추가 없습니다');
});

test('★★ 권한이 없을 때는 «그 단추만» 남는다 — 여럿이 함께 뜨면 무엇부터인지 모른다', () => {
  const b = refreshBody();
  const at = b.indexOf('if (!canRead)');
  assert.ok(at > 0, '★ 권한 없는 갈래가 없습니다');
  const branch = b.slice(at, b.indexOf('return;', at));
  assert.match(branch, /show\(grantSms,\s*true\)/, '★ 켜기 단추를 안 보여 줍니다');
  assert.match(branch, /show\(history,\s*false\)/, '★ 다른 단추가 함께 떠 있습니다');
});

test('★ 허용되면 그 단추가 사라진다 — 늘 떠 있으면 아무도 안 읽는다', () => {
  const b = refreshBody();
  const tail = b.slice(b.lastIndexOf('show(sweepWarn, false)'));
  assert.match(tail, /show\(grantSms,\s*false\)/, '★ 권한이 있어도 켜기 단추가 남습니다');
  assert.match(tail, /show\(history,\s*true\)/, '★ 다 된 뒤 쓸 단추가 안 나옵니다');
});

test('★★ 안내문이 「무조건 훑는다」로 되돌아가지 않는다 — 화면이 거짓말하면 안 하느니만 못하다', () => {
  /* 예전 안내: 「알림을 엿보고, 15분마다 문자함의 최근 2일치도 훑습니다」
     — 권한이 없을 때는 «거짓»이다. 조건을 함께 적어야 한다. */
  assert.ok(!/알림을 엿보고,\s*"?\s*\+?\s*\w*\s*\+?\s*"?분마다/.test(MAIN),
    '★ 조건 없이 「엿보고 …분마다 훑습니다」로 적혀 있습니다');
  assert.match(MAIN, /켜면[\s\S]{0,160}훑습니다[\s\S]{0,80}안 훑습니다/,
    '★ 「켜야 훑는다」는 조건이 안내에 없습니다');
});

test('★ 판 번호를 올렸다 — 안 올리면 새로 깔았는지 폰에서 못 가린다', () => {
  const g = fs.readFileSync(path.join(R, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts'), 'utf8');
  const code = Number((g.match(/versionCode\s*=\s*(\d+)/) || [])[1]);
  assert.ok(code >= 8, '★ versionCode 가 ' + code + ' 입니다 — 앱을 고쳤으면 올려야 합니다');
});
