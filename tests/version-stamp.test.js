/* 「피시에서는 업데이트되었는데 폰에서는 안 된다」 (대표 보고 2026-08-17)

   ★ 무엇이 잘못이었나 — 화면이 «자기가 무슨 판인지» 몰랐다.
     예전에는 sessionStorage 만 봤는데 **새 탭은 그게 비어 있다.** 그러면
     pu-version.js 는 서버가 말하는 판을 그대로 「내 판」으로 적어 버렸다.
     그래서 폰 브라우저가 캐시에 있던 «옛 화면»을 열어도 단추는 「최신」이라
     답했다 — 옛 코드를 돌리면서 최신이라고 적힌 화면이 그것이다.
   ★ 고친 방향: 배포할 때 <meta name="pu-release"> 를 찍어 두고, 화면은 그것을
     먼저 믿는다. 실제 브라우저로 네 경우를 돌려 확인했다:
       ① 옛 화면+새 서버판 → 「새 버전 있음 · 누르기」  ② 진짜 최신 → 「최신」
       ③ 갈아탔는데도 옛 코드 → 다시 안 연다(무한 고리 방지)  ④ 로컬 → 예전대로 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const writer = fs.readFileSync(path.join(R, 'scripts/write-version.js'), 'utf8');
const watcher = fs.readFileSync(path.join(R, 'js/pu-version.js'), 'utf8');

test('배포할 때 화면마다 지금 판을 찍는다', () => {
  assert.match(writer, /meta name="pu-release"/);
  assert.match(writer, /readdirSync\(root\)/, '최상위 화면 전부에 찍어야 합니다');
  // 이미 찍혀 있으면 덮어쓴다 — 두 번 돌아도 meta 가 늘어나면 안 된다
  assert.match(writer, /if \(\/<meta name="pu-release"\/\.test\(html\)\)/);
});

test('화면은 찍힌 판을 먼저 믿는다 — sessionStorage 가 비어도 속지 않는다', () => {
  assert.match(watcher, /function docRelease\(\)/);
  assert.match(watcher, /meta\[name="pu-release"\]/);
  /* ★ 이 순서가 핵심이다. 찍힌 것을 보기 «전에» sessionStorage 로 넘어가면
     새 탭에서 다시 서버 판을 제 판으로 적어 버린다(그게 원래 버그였다). */
  assert.ok(watcher.indexOf('var stamped = docRelease();')
          < watcher.indexOf("loaded = window.sessionStorage.getItem(SESSION_KEY)"),
    '★ 찍힌 판을 먼저 봐야 합니다');
  // 'local'(로컬 개발값)은 판으로 치지 않는다
  assert.match(watcher, /v !== 'local'/);
});

test('갈아탔는데도 옛 코드가 오면 되풀이해 새로 열지 않는다', () => {
  /* 브라우저·CDN 이 옛 파일을 계속 주는 경우가 있다.
     그때 계속 새로 열면 **무한 고리**가 된다 — 멎어 있는 화면보다 훨씬 나쁘다. */
  assert.match(watcher, /var APPLIED_KEY = 'pu_applied_release_v1';/);
  assert.match(watcher, /if \(applied === version\.sha\) \{ pendingVersion = version; return true; \}/);
  assert.match(watcher, /sessionStorage\.setItem\(APPLIED_KEY, version\.sha\)/);
});

/* ── 이력관리 pu-erp 실적 동기화 팝업 (대표 보고 2026-08-17
     "위촉장 관련 팝업 계속 나오는 것 안 나오게 정리") ── */
const kcareer = fs.readFileSync(path.join(R, 'kcareer.html'), 'utf8');

test('실적 동기화 미리보기는 하루 한 번만 묻는다', () => {
  /* 예전에는 미리보기를 띄우고 **아무것도 안 적고** 돌아갔다. 등록을 누르기
     전에는 `pu_sync_last_id` 가 영영 비어 있으니, 화면을 열 때마다 다시 떴다. */
  const fn = kcareer.match(/async function puSyncAuto\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(fn, /LS\.set\(NS \+ 'pu_sync_last', new Date\(\)\.toISOString\(\)\);\s*\n\s*_puSyncCtx = ctx; renderPuSyncPreview\(\)/,
    '★ 띄우는 순간 적지 않으면 열 때마다 다시 뜹니다');
  // 「오늘 이미 물어봤다」를 보는 문턱은 그대로 있어야 한다
  assert.match(fn, /if\(last === today\) return;/);
});

test('닫기 단추가 무슨 뜻인지 적혀 있다', () => {
  // 「저장 안 함」만 적혀 있으면 또 뜰까 봐 불안하다
  assert.match(kcareer, /닫기 \(오늘은 그만\)/);
});
