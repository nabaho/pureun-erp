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

test('★★ 권한이 없으면 «화면이 그 말을 한다» — 없으면 「연결됨」만 보고 안심한다', () => {
  /* ⚠ 「showSweepWarning()」로 찾으면 «함수 정의»에도 걸린다 — 부르는 줄을 지워도
       통과한다(일부러 지워 보고 잡았다). 세미콜론까지 봐야 «부르는 자리»다. */
  assert.match(MAIN, /showSweepWarning\(\);/, '★ 알리는 자리를 아무도 안 부릅니다');
  assert.match(MAIN, /문자 읽기가 꺼져 있습니다/,
    '★ 사람이 읽고 무엇을 해야 할지 아는 말이 없습니다');
  /* 무엇을 누르면 되는지까지 적어야 한다 — 「꺼져 있다」만으로는 손 쓸 데가 없다.
     ⚠ 파일 전체에서 찾으면 «단추 이름»에 걸려 헛통과한다 — 실제로 그랬다
       (경고문에서 그 말을 지워도 검사가 안 물었다). 경고문 «안»만 본다. */
  const at = MAIN.indexOf('private void showSweepWarning()');
  assert.ok(at > 0, 'showSweepWarning 을 못 찾았습니다');
  assert.match(MAIN.slice(at, at + 1200), /「지난 문자 가져오기」/,
    '★ 경고문이 어디를 눌러 켜는지 안 알려 줍니다');
});

test('★ 화면을 새로 그릴 때마다 다시 본다 — 한 번만 보면 허용한 뒤에도 경고가 남는다', () => {
  const at = MAIN.indexOf('private void refresh()');
  assert.ok(at > 0, 'refresh 를 못 찾았습니다');
  /* ⚠ 창을 넉넉히 잡았더니 «바로 뒤에 있는 함수 정의»까지 넘겨봐서, 부르는 줄을
       지워도 통과했다. refresh 의 «닫는 괄호까지»만 본다. */
  const end = MAIN.indexOf('\n    }', at);
  assert.ok(end > at, 'refresh 의 끝을 못 찾았습니다');
  assert.match(MAIN.slice(at, end), /showSweepWarning\(\);/,
    '★ refresh 에서 안 부르면 권한을 허용해도 경고가 안 사라집니다');
});

test('★ 허용돼 있으면 경고를 숨긴다 — 늘 떠 있으면 아무도 안 읽는다', () => {
  const at = MAIN.indexOf('private void showSweepWarning()');
  assert.ok(at > 0, 'showSweepWarning 을 못 찾았습니다');
  const fn = MAIN.slice(at, at + 900);
  assert.match(fn, /if\s*\(canRead\)[\s\S]{0,120}GONE/,
    '★ 권한이 있어도 경고가 계속 뜹니다');
});

test('★★ 안내문이 「무조건 훑는다」로 되돌아가지 않는다 — 화면이 거짓말하면 안 하느니만 못하다', () => {
  /* 예전 안내: 「알림을 엿보고, 15분마다 문자함의 최근 2일치도 훑습니다」
     — 권한이 없을 때는 «거짓»이다. 조건을 함께 적어야 한다. */
  assert.ok(!/알림을 엿보고,\s*"?\s*\+?\s*\w*\s*\+?\s*"?분마다/.test(MAIN),
    '★ 조건 없이 「엿보고 …분마다 훑습니다」로 적혀 있습니다');
  assert.match(MAIN, /허용하시면[\s\S]{0,120}훑습니다/,
    '★ 「허용해야 훑는다」는 조건이 안내에 없습니다');
});

test('★ 판 번호를 올렸다 — 안 올리면 새로 깔았는지 폰에서 못 가린다', () => {
  const g = fs.readFileSync(path.join(R, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts'), 'utf8');
  const code = Number((g.match(/versionCode\s*=\s*(\d+)/) || [])[1]);
  assert.ok(code >= 6, '★ versionCode 가 ' + code + ' 입니다 — 앱을 고쳤으면 올려야 합니다');
});
