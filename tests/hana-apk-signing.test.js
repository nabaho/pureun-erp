'use strict';
/* 폰 앱 서명키 — 고정하되 «저장소에는 두지 않는다» (대표 결정 2026-08-29 「안전하게」)
 *
 * 왜: 안드로이드는 «같은 도장으로 서명된 앱»만 덮어쓰기를 허락한다.
 * 여태 CI 는 러너가 그때그때 만든 임시 debug 키를 썼다 — 빌드마다 도장이 달라
 * 판을 올릴 때마다 «지웠다 다시 깔아야» 했고, 그때마다 폰 안의 연결정보가 사라져
 * 8자리 연결번호를 다시 넣어야 했다(대표: 「연결번호 계속 요청들어온다」).
 *
 * ★ 여기서 지키는 것 둘 —
 *   ① 키가 «저장소에 들어오지 않는다» (대표가 고른 길이다)
 *   ② 키가 없을 때 «조용히» 옛날처럼 서명되지 않는다 (그러면 또 모르고 당한다)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const GRADLE = fs.readFileSync(
  path.join(R, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts'), 'utf8');
const FLOW = fs.readFileSync(
  path.join(R, '.github', 'workflows', 'build-hana-sms-bridge.yml'), 'utf8');

/* 주석을 걷는다 — 잘 쓴 주석이 검사를 통과시키면 안 된다. */
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const G = bare(GRADLE);

test('★★ 키 파일이 저장소에 «없다»', () => {
  const hits = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jks|keystore|p12|pfx)$/i.test(e.name)) hits.push(path.relative(R, p));
    }
  })(R);
  assert.deepEqual(hits, [],
    '★ 서명키가 저장소에 들어왔습니다: ' + hits.join(', ') +
    ' — 대표가 고른 길은 «금고(GitHub Secret)»입니다. 지우고 금고로 옮기세요.');
});

test('★★ 키는 «환경변수»로만 들어온다 (파일 경로를 적어 넣지 않는다)', () => {
  assert.match(G, /System\.getenv\("HANA_KEYSTORE_FILE"\)/,
    '★ 키 경로를 환경변수에서 안 읽습니다');
  ['HANA_KEYSTORE_PASSWORD', 'HANA_KEY_ALIAS', 'HANA_KEY_PASSWORD'].forEach((k) => {
    assert.ok(G.includes('System.getenv("' + k + '")'), k + ' 를 환경변수에서 안 읽습니다');
  });
  /* 비밀번호가 «글자로» 박혀 있으면 안 된다 — 금고에 넣은 뜻이 없어진다. */
  assert.ok(!/storePassword\s*=\s*"/.test(G) && !/keyPassword\s*=\s*"/.test(G),
    '★ 비밀번호가 파일에 글자로 박혀 있습니다 — 금고에 넣은 뜻이 없어집니다');
});

test('★★ 키가 있을 때 «실제로 그 키로» 서명한다', () => {
  /* 「읽기만 하고 안 쓰는」 것을 막는다 — 읽는 줄만 있으면 통과하는 검사는 헛것이다. */
  assert.match(G, /storeFile\s*=\s*file\(hanaStore/,
    '★ 키를 읽어 놓고 서명에 안 씁니다');
  assert.match(G, /signingConfigs\s*\{[\s\S]*getByName\("debug"\)/,
    '★ debug 서명 설정을 안 바꿉니다 — CI 는 assembleDebug 로 만듭니다');
  /* ⚠ 「hanaFixedKey 라는 글자가 있다」로 겨누면 안 된다 — 위 println 에도 있어서,
     정작 서명 설정에서 조건을 떼어 내도 통과한다. «그 덩이 안»을 본다. */
  const sc = G.slice(G.indexOf('signingConfigs'), G.indexOf('namespace'));
  assert.match(sc, /if\s*\(hanaFixedKey\)/,
    '★ 키가 없을 때도 쓰려 듭니다 — 그러면 키 없는 빌드가 통째로 깨집니다');
});

test('★★ 키가 없으면 «조용히» 넘어가지 않는다', () => {
  assert.ok(/println\(/.test(G) && /고정 서명키가 없습니다/.test(GRADLE),
    '★ 임시 키로 서명되는데 아무 말이 없으면, 또 모르고 깔았다가 연결이 지워집니다');
  /* ★ 「없다」고만 하면 다음 사람이 또 헤맨다 — «무엇을 넣어야 하는지»까지 적는다.
     이 실타래 내내 되풀이된 잘못이 바로 그것이었다(까닭만 말하고 할 일을 안 줌). */
  assert.match(GRADLE, /HANA_KEYSTORE_B64/,
    '★ 무엇을 넣어야 하는지(금고 이름)를 안 알려 줍니다 — 「없다」만 알면 또 헤맵니다');
  assert.match(FLOW, /::warning::/,
    '★ 일감이 조용히 넘어갑니다 — 초록불만 보고 「잘 됐네」 하게 됩니다');
});

test('★★ 일감이 금고에서 키를 «꺼내 파일로» 푼다', () => {
  /* ⚠★ 2026-08-30: 이 줄이 «틀린 이름을 지켜 주고» 있었다.
     금고에 있는 것은 HANA_RELEASE_* 인데 여기서 HANA_KEYSTORE_B64 를 못 박아,
     엉뚱한 이름을 부르는 워크플로가 이 검사를 통과했다 — 그 사이 몇 주를 잃었다.
     못 박을 것은 «어느 이름이냐»가 아니라 «금고에서 가져오느냐»다.
     이름이 금고와 맞는지는 아래 「금고에 있는 이름을 부른다」 검사가 따로 본다. */
  assert.match(FLOW, /HANA_KEYSTORE_B64:\s*\$\{\{\s*secrets\./, '★ 금고에서 키를 안 가져옵니다');
  assert.match(FLOW, /base64\s+-d/, '★ 꺼낸 값을 파일로 안 풉니다');
  assert.match(FLOW, /HANA_KEYSTORE_FILE=.*>>\s*"?\$GITHUB_ENV/,
    '★ 푼 파일의 자리를 빌드에 안 알려 줍니다');
  /* 푸는 걸음이 «APK 만들기보다 먼저» 와야 한다. */
  assert.ok(FLOW.indexOf('base64 -d') < FLOW.indexOf('assembleDebug'),
    '★ APK 를 만든 «뒤에» 키를 풉니다 — 아무 소용이 없습니다');
});

test('★ 금고가 비어 있어도 빌드는 «돌아간다»', () => {
  /* 남의 갈래(포크)에서 온 PR 에는 금고가 안 열린다. 거기서 빌드가 죽으면
     서명과 상관없는 고침까지 막힌다. */
  assert.match(FLOW, /if\s+\[\s+-n\s+"\$HANA_KEYSTORE_B64"\s+\]/,
    '★ 금고가 비어 있을 때를 안 가릅니다 — 포크 PR 빌드가 죽습니다');
  assert.ok(!/exit\s+1/.test(FLOW.slice(FLOW.indexOf('HANA_KEYSTORE_B64'))),
    '★ 금고가 비었다고 빌드를 죽입니다');
});

/* ══ 금고에 «있는» 이름을 부르는가 (2026-08-30) ═══════════════════════════
   ⚠★ 이것이 「하나 문자가 안 들어온다」의 진짜 까닭이었다.
      2026-08-23 에 서명키 넷이 HANA_RELEASE_* 이름으로 금고에 들어갔는데,
      2026-08-29 에 워크플로를 새로 쓰면서 «있는지 보지 않고»
      HANA_KEYSTORE_* 라는 다른 이름을 불렀다.
      금고는 차 있는데 빌드는 「비었다」로 읽어 임시 키로 서명했고,
      대표 폰은 덮어쓰기 설치가 막혀 새 앱이 «한 번도» 안 깔렸다.
   ★ 금고가 비어도 빌드는 조용히 성공한다 — 그래서 아무도 못 알아챈다.
     그러니 이름이 맞는지는 «검사»가 봐야 한다.
   ⚠ 실제 금고를 여기서 볼 수는 없다. 대신 2026-08-23 에 등록된 이름을
     여기 적어 두고, 워크플로가 그 이름을 부르는지 본다.
     금고에 새 이름을 넣었다면 여기도 함께 고친다 — 그때는 손이 한 번 더 가는 편이
     낫다. 잘못 부르면 «몇 주» 를 잃는다는 것을 이미 겪었다. */
const VAULT = [
  'HANA_RELEASE_KEYSTORE_BASE64',
  'HANA_RELEASE_STORE_PASSWORD',
  'HANA_RELEASE_KEY_ALIAS',
  'HANA_RELEASE_KEY_PASSWORD',
];

test('★★ 워크플로가 «금고에 있는» 서명키 이름을 부른다', () => {
  const wf = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'build-hana-sms-bridge.yml'), 'utf8');
  const called = (wf.match(/secrets\.([A-Z0-9_]+)/g) || []).map((s) => s.replace('secrets.', ''));
  const signing = called.filter((n) => /KEYSTORE|KEY_|STORE_/.test(n));
  assert.ok(signing.length >= 4, '★ 서명키를 넷 다 안 부른다 (지금 ' + signing.length + '개)');
  signing.forEach((n) => {
    assert.ok(VAULT.indexOf(n) >= 0,
      '★★ 금고에 없는 이름 「' + n + '」 을 부릅니다 — 빌드는 조용히 성공하고 '
      + '임시 키로 서명되어 «덮어쓰기 설치가 안 되는» APK 가 나옵니다.\n'
      + '   금고에 있는 이름: ' + VAULT.join(' · '));
  });
  VAULT.forEach((n) => {
    assert.ok(called.indexOf(n) >= 0, '★ 금고에 있는 「' + n + '」 을 안 부릅니다');
  });
});
