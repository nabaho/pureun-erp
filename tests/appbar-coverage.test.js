/* 즐겨찾기(공용 앱바) — 어느 앱도 섬이 되면 안 된다 (대표 보고 2026-08-13)
   "문서관리에는 왜 즐겨찾기 안 나오나 — 오른쪽 옆"

   원인이 둘 다였다: ① docs-esign.html·payroll-os.html 이 pu-appbar.js 를 안 실었고
   ② 앱바의 프로그램 목록에도 그 둘이 없었다. 부품 머리말이 "새 프로그램을 만들 때
   반드시 지킬 것"이라 적어 두고도 사람이 잊었다 — 사람이 잊는 것은 검사가 지킨다.

   ⚠ 이름(name·desc)은 붙들지 않는다 — 보이는 이름을 못 박은 검사가 2026-08-11 에
     모든 배포를 막았다. 여기서 지키는 것은 **주소(url)의 짝**뿐이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
const appbar = fs.readFileSync(path.join(root, 'js', 'pu-appbar.js'), 'utf8');

/* 포털 타일 목록에서 앱 파일 이름을 뽑는다 */
function urlsOf(src, blockRe) {
  const block = src.match(blockRe);
  assert.ok(block, '앱 목록 덩어리를 찾지 못했습니다');
  return [...block[0].matchAll(/url:\s*'([^']+\.html)'/g)].map(m => m[1]);
}

const portalUrls = urlsOf(portal, /var APPS = \[[\s\S]*?\n  \];/);
const appbarUrls = urlsOf(appbar, /var APPS = \[[\s\S]*?\n  \];/);

test('★ 포털에 타일이 있는 앱은 즐겨찾기 목록에도 있다', () => {
  const missing = portalUrls.filter(u => appbarUrls.indexOf(u) < 0);
  assert.deepEqual(missing, [],
    '이 앱들은 즐겨찾기 목록에 없어 다른 앱에서 건너갈 수 없습니다: ' + missing.join(', '));
});

test('즐겨찾기 목록에 포털에 없는 유령 앱이 없다', () => {
  const ghost = appbarUrls.filter(u => portalUrls.indexOf(u) < 0);
  assert.deepEqual(ghost, [],
    '포털에 타일이 없는 앱이 목록에 있으면 눌러도 갈 수 없는 줄이 생깁니다: ' + ghost.join(', '));
});

test('★ 포털의 모든 앱이 즐겨찾기 부품(pu-appbar.js)을 싣는다', () => {
  const missing = portalUrls.filter(function (u) {
    const p = path.join(root, u);
    if (!fs.existsSync(p)) return false;   // 파일이 없으면 포털 쪽 검사가 잡을 일이다
    return !/pu-appbar\.js/.test(fs.readFileSync(p, 'utf8'));
  });
  assert.deepEqual(missing, [],
    '이 앱들에는 오른쪽 「즐겨찾기」 손잡이가 아예 안 뜹니다: ' + missing.join(', ') +
    ' — <script src="js/pu-appbar.js?v=1"></script> 한 줄이면 됩니다');
});

test('앱이 열 개는 된다 — 목록을 통째로 지우면 이 검사가 헛돈다', () => {
  assert.ok(portalUrls.length >= 10, '포털 타일이 ' + portalUrls.length + '개뿐입니다');
  assert.ok(appbarUrls.length >= 10, '즐겨찾기 목록이 ' + appbarUrls.length + '개뿐입니다');
});
