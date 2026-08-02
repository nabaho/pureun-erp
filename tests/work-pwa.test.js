/* 업무관리 폰 홈화면 앱(PWA) — 배선과 안전장치 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');
const mfRaw = fs.readFileSync(path.join(ROOT, 'work-manifest.json'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'work-sw.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* ── manifest ── */
let mf;
try { mf = JSON.parse(mfRaw); ok('manifest 가 올바른 JSON', true); }
catch (e) { ok('manifest 가 올바른 JSON', false, e.message); process.exit(1); }

ok('이름이 있다', !!mf.name && !!mf.short_name);
ok('열면 업무관리로 간다', mf.start_url === './work.html', 'start_url=' + mf.start_url);
ok('앱처럼 뜬다 (standalone)', mf.display === 'standalone', 'display=' + mf.display);
ok('scope 가 같은 폴더', mf.scope === './', 'scope=' + mf.scope);
ok('아이콘 192·512 둘 다', ['192x192', '512x512'].every(function (s) {
  return (mf.icons || []).some(function (i) { return i.sizes === s; });
}));
ok('아이콘 파일이 실제로 있다', (mf.icons || []).every(function (i) {
  return /^data:/.test(i.src) || fs.existsSync(path.join(ROOT, i.src));
}), '없는 것: ' + (mf.icons || []).filter(function (i) {
  return !/^data:/.test(i.src) && !fs.existsSync(path.join(ROOT, i.src));
}).map(function (i) { return i.src; }).join(','));

/* pu-erp 의 manifest 는 절대경로(/pureunall/…)라 배포 위치에 묶인다.
   업무관리는 카메라·명함첩처럼 상대경로로 둔다 — 어디에 올려도 그대로 된다 */
ok('경로가 상대경로다 (배포 위치에 안 묶임)',
  mf.start_url.indexOf('/') !== 0 && mf.scope.indexOf('/') !== 0
  && (mf.icons || []).every(function (i) { return i.src.indexOf('/') !== 0; }));

/* ── work.html 배선 ── */
ok('manifest 를 연결했다', /<link[^>]+rel="manifest"[^>]+href="work-manifest\.json"/.test(html));
ok('theme-color 가 있다', /<meta[^>]+name="theme-color"/.test(html));
ok('아이폰 홈화면 아이콘', /<link[^>]+rel="apple-touch-icon"/.test(html));
ok('아이폰에서 앱처럼 뜬다', /apple-mobile-web-app-capable"[^>]+content="yes"/.test(html));
ok('아이폰 앱 이름', /apple-mobile-web-app-title"[^>]+content="업무관리"/.test(html));
ok('viewport 가 있다', /<meta[^>]+name="viewport"/.test(html));
ok('서비스워커를 등록한다', /navigator\.serviceWorker\.register\('work-sw\.js'\)/.test(html));
ok('https 에서만 등록한다 (file:// 에서 오류 안 남)',
  /location\.protocol==='https:'[\s\S]{0,120}register\('work-sw\.js'\)/.test(html));
ok('등록 실패해도 앱이 죽지 않는다', /register\('work-sw\.js'\)\.catch\(/.test(html));

/* ── 서비스워커: 캐시를 두면 안 된다 ── */
/* 캐시를 두면 pu-version.js 의 '새 버전 자동 적용'과 싸워 옛 화면이 남는다.
   그래서 fetch 는 아무것도 가로채지 않아야 한다 */
ok('caches API 를 쓰지 않는다', !/\bcaches\b/.test(sw), '캐시가 들어가면 옛 화면이 남는다');
ok('respondWith 로 가로채지 않는다', !/respondWith/.test(sw));
ok('fetch 처리기는 있다 (설치 조건)', /addEventListener\('fetch'/.test(sw));
ok('설치 즉시 활성화', /skipWaiting/.test(sw) && /clients\.claim/.test(sw));

/* ── 성과급 화면이 폰에서 열리는지 (5단계의 목적) ── */
ok('성과급 메뉴가 있다', html.indexOf('nav-perf') >= 0);
ok('성과급 화면이 본인 사번에 묶여 있다', /function pcMySid\(\)\{ return \(S\.me&&S\.me\.sid\)/.test(html));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
