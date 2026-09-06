'use strict';
/* 공용 한글 엔진이 어디서 rhwp 를 가져오는가

   왜: 판 번호를 0.8.4 로 올렸지만 js/pu-hwp-engine.js 는 저장소 사본
   (vendor/rhwp-core, 0.7.x 계열)만 읽었다. 그래서 이 엔진을 쓰는 앱들
   (fund·pu-cards·gov-consulting·kcareer·payroll-os·chwieop·docs-esign)은
   여전히 가운뎃점(·)을 흘렸다. rules.html 은 이미 CDN 우선 + 사본 폴백이라
   0.8.4 를 받고 있었다 — 같은 방식을 공용 엔진에도 준다.

   저장소 사본은 «지우지 않는다». CDN 이 막힌 사내망·오프라인에서 마지막 보루다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'js', 'pu-hwp-engine.js');
const srcText = fs.readFileSync(enginePath, 'utf8');

/* 스텁은 «단언하는 동안 그대로 둔다» — activeVersion 은 require 시점이 아니라
   부를 때 localStorage 를 읽는다. 미리 지우면 늘 기본 판이 나와 검사가 헛돈다.
   키별로 정확히 답한다 — 아무 키에나 판 번호를 돌려주면 config() 까지 오염된다. */
function freshEngine(storedVer) {
  delete require.cache[require.resolve(enginePath)];
  delete global.PureunHwp;
  if (storedVer === undefined) {
    delete global.localStorage;
  } else {
    global.localStorage = {
      getItem: (k) => (k === 'pureun_v6_rhwp_ver' ? storedVer : null),
      setItem: () => {}
    };
  }
  return require(enginePath);
}
test.afterEach(() => { delete global.localStorage; delete global.PureunHwp; });

test('★ CDN 을 먼저, 저장소 사본을 나중에 — 순서가 뒤바뀌면 옛 판을 계속 쓴다', () => {
  const c = freshEngine().coreCandidates();
  assert.equal(c.length, 2);
  assert.match(c[0], /cdn\.jsdelivr\.net\/npm\/@rhwp\/core@0\.8\.4\/rhwp\.js$/);
  assert.match(c[1], /vendor\/rhwp-core\/rhwp\.js$/);
});

test('★ 저장소 사본은 언제나 마지막에 남는다 — 오프라인의 마지막 보루다', () => {
  const c = freshEngine().coreCandidates();
  assert.match(c[c.length - 1], /vendor\/rhwp-core\/rhwp\.js$/);
});

test('★ 브라우저에 더 새 판이 적혀 있으면 그 판을 CDN 에서 받는다', () => {
  const c = freshEngine('0.9.2').coreCandidates();
  assert.match(c[0], /@rhwp\/core@0\.9\.2\//);
});

test('★ 브라우저에 옛 판이 적혀 있어도 기본 판을 받는다 — pickVer 와 같은 규칙', () => {
  const c = freshEngine('0.7.19').coreCandidates();
  assert.match(c[0], /@rhwp\/core@0\.8\.4\//);
});

test('★ CDN 을 끄면 저장소 사본만 쓴다 — CDN 이 응답을 물고 늘어지는 망을 위한 탈출구', () => {
  const c = freshEngine().coreCandidates({ cdnBase: '' });
  assert.equal(c.length, 1);
  assert.match(c[0], /vendor\/rhwp-core\/rhwp\.js$/);
});

test('CDN 주소를 갈아끼울 수 있다', () => {
  const c = freshEngine().coreCandidates({ cdnBase: 'https://unpkg.com/@rhwp/core' });
  assert.match(c[0], /^https:\/\/unpkg\.com\/@rhwp\/core@0\.8\.4\/rhwp\.js$/);
});

test('★ 쓰는 판을 물어볼 수 있다 — 화면에 무엇으로 그렸는지 밝힐 수 있어야 한다', () => {
  assert.equal(freshEngine().activeVersion(), '0.8.4');
  assert.equal(freshEngine('0.9.2').activeVersion(), '0.9.2');
  assert.equal(freshEngine('0.7.19').activeVersion(), '0.8.4');
});

/* ── 배선 ── */
test('★ loadCore 가 후보를 순서대로 시도한다', () => {
  const m = srcText.match(/function loadCore\([\s\S]*?\n  \}/);
  assert.ok(m, 'loadCore 를 못 찾았습니다');
  assert.match(m[0], /coreCandidates\(/, '후보 목록을 쓰지 않으면 순서가 코드 두 곳으로 갈라집니다');
});

test('★ 다 실패하면 다시 시도할 수 있게 물린 것을 놓는다', () => {
  const m = srcText.match(/function loadCore\([\s\S]*?\n  \}/);
  assert.match(m[0], /corePromise = null/,
    '실패한 약속을 붙들고 있으면 망이 돌아와도 영영 안 됩니다');
});

test('DEFAULTS 에 CDN 밑동이 있다', () => {
  assert.match(srcText, /cdnBase:\s*'https:\/\/cdn\.jsdelivr\.net\/npm\/@rhwp\/core'/);
});

test('저장소 사본 경로는 그대로 남아 있다', () => {
  assert.match(srcText, /coreUrl:\s*'vendor\/rhwp-core\/rhwp\.js'/);
});
