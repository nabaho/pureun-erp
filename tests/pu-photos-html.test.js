'use strict';
// pu-photos.html · 매니페스트 · 포털 등록 정적 검사 — 실행: node --test tests/*.test.js
//   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

test('인라인 스크립트가 문법 오류 없이 파싱된다', () => {
  // 단일 파일 앱이라 문법 오류 하나로 앱 전체가 뜨지 않는다. 실행하지 않고 파싱만 검사한다.
  const blocks = [...app.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, '인라인 스크립트를 찾을 수 없습니다');
  blocks.forEach((m, i) => {
    const code = m[1];
    if (!code.trim()) return;
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: 'pu-photos.html:inline-' + i }),
      '인라인 스크립트 ' + i + '번에 문법 오류가 있습니다'
    );
  });
});

test('저장 층을 외부 파일로 불러온다', () => {
  // 저장 방식을 앱 안에 복사해 넣으면 당겨오기 창과 어긋난다.
  assert.match(app, /<script src="js\/pu-photo-store\.js"><\/script>/);
});

test('저장소 공용 파일 3개를 불러온다', () => {
  assert.match(app, /<script src="js\/pu-resilience\.js"><\/script>/);
  assert.match(app, /<script src="js\/pu-health\.js"><\/script>/);
  assert.match(app, /<script src="js\/pu-version\.js"><\/script>/);
});

test('파이어베이스 SDK 버전이 다른 앱과 같다', () => {
  // 앱마다 버전이 갈리면 캐시가 두 벌로 늘고 동작이 미묘하게 달라진다.
  const versions = new Set([...app.matchAll(/firebasejs\/([\d.]+)\//g)].map(m => m[1]));
  assert.deepEqual([...versions], ['10.12.0']);
});

test('파일 창고 SDK를 불러온다', () => {
  assert.match(app, /firebase-storage-compat\.js/);
});

/* ── 실데이터 가드 ──
   예전 검사는 p_cos·p_scheds 를 금지했는데, 그건 컨설팅 앱의 '브라우저 로컬 저장 키'이고
   실제 클라우드 루트가 아니었다(gov-consulting.html 의 FB_NODES 가 p_cos → scal_cos,
   p_scheds → scal_scheds 로 바꿔 쓴다). 엉뚱한 이름을 막고 있었으니 실데이터를
   지켜주지 못했다. 그래서 현재 적용된 규칙 파일(docs/firebase-rules-현재적용본.json)의
   실제 최상위 루트 이름으로 다시 썼다.

   이 앱이 쓸 루트는 puphotos(실시간DB)·pu_photos(파일 창고) 두 개뿐이다. */
const FORBIDDEN_ROOTS = [
  'uid_roles', 'sid_roles', 'payroll_os', 'fund_erp', 'work_erp', 'ieum_public',
  'scal_staff', 'scal_types', 'scal_cos', 'scal_scheds', 'scal_env', 'scal_fieldState',
  'scal_conflictMatrix', 'scal_roundlog', 'scal_erpTypeMap',
  'companies', 'pucards', 'improve_requests', 'kcareer', 'esign', 'rules_mgmt', 'chwieop'
];

test('다른 앱의 실제 클라우드 루트를 건드리지 않는다', () => {
  for (const rootName of FORBIDDEN_ROOTS) {
    // 단어 경계로 감싼다. 그냥 부분 문자열로 찾으면 이 앱이 쓰는 pu_photos 나
    // 무관한 낱말(예: esign ⊂ design) 때문에 헛걸림이 난다.
    const re = new RegExp('\\b' + rootName + '\\b');
    assert.ok(!re.test(app), '다른 앱의 클라우드 루트를 건드리면 안 됩니다: ' + rootName);
  }
});

test('포털 공용 루트(data)를 경로로 쓰지 않는다', () => {
  // data 는 너무 흔한 낱말이라 그대로 금지하면 무관한 곳에서 걸린다(database 등).
  // 실시간DB 경로로 쓰이는 꼴 — 인용부호 안에서 data 로 시작하는 경로 — 만 잡는다.
  assert.ok(!/['"`]data(\/|['"`])/.test(app), '포털 공용 루트(data)를 경로로 쓰면 안 됩니다');
});

test('이 앱이 쓸 루트는 사진첩 전용 두 개뿐이다', () => {
  // 가드가 헛돌지 않는다는 확인: 앱/저장 층이 실제로 사진첩 루트만 쓴다.
  const store = fs.readFileSync(path.join(root, 'js', 'pu-photo-store.js'), 'utf8');
  assert.match(store, /'puphotos'/);
  assert.match(store, /'pu_photos'/);
});

test('화면은 실시간DB에 직접 쓰지 않는다 — 쓰기는 저장 층·대기열만', () => {
  // B단계부터 앱은 사진을 저장하지만, 그 쓰기는 반드시 PuPhotoStore.savePhoto
  // (다중 경로 update 한 번)를 통해서만 나간다. 화면이 db.ref 를 직접 만지기
  // 시작하면 상위 노드 set 같은 사고 경로(2026-07 실데이터 사고)가 다시 열린다.
  assert.ok(!app.includes('db.ref('), '화면이 db.ref 를 직접 부릅니다');
  for (const call of ['.set(', '.update(', '.remove(']) {
    assert.ok(!app.includes(call), '화면이 클라우드에 직접 쓰고 있습니다: ' + call);
  }
  assert.match(app, /PuPhotoStore\.savePhoto/, '저장이 저장 층을 거치지 않습니다');
});

/* ── B단계: 올리기·대기열·격자 ── */

test('사진 고르기 — 앨범에서 여러 장', () => {
  assert.match(app, /<input[^>]*type="file"[^>]*multiple/);
  assert.match(app, /accept="image\/\*"/);
});

test('카메라 즉석 촬영 입력이 있다', () => {
  assert.match(app, /capture="environment"/);
});

test('업로드 대기열 파일을 불러오고 쓴다', () => {
  assert.match(app, /<script src="js\/pu-photo-queue\.js"><\/script>/);
  assert.match(app, /PuPhotoQueue\.create\(/);
});

test('신호가 돌아오면 기다리지 않고 바로 재시도한다', () => {
  assert.match(app, /addEventListener\('online'/);
  assert.match(app, /retryNow/);
});

test('올릴 때 긴 변 1600px 축소본과 240px 미리보기를 만든다', () => {
  assert.match(app, /shrink\(f, 1600\)/);
  assert.match(app, /shrink\(f, 240\)/);
  // 카메라 원본이 그대로 클라우드로 가는 길이 없어야 한다 —
  // 파일→dataURL 직행(readAsDataURL)을 금지하고 축소(shrink)만 허용한다.
  assert.ok(!/readAsDataURL/.test(app), '원본을 그대로 올릴 수 있는 경로가 있습니다');
});

test('사진 열기에 예비 통로가 있다 — 브라우저마다 되는 방법이 다르다', () => {
  // 실사용 보고(2026-08-03): 폰 앱 내장 브라우저에서 "사진을 읽지 못했습니다".
  // 빠른 길(createImageBitmap)이 안 되면 <img> 로, 최신 바이트 읽기(arrayBuffer)가
  // 없으면 FileReader 로 돌아가야 한다. EXIF 읽기 실패는 올리기를 막으면 안 된다.
  assert.match(app, /function decodeViaImg\(/);
  assert.match(app, /URL\.createObjectURL\(/);
  assert.match(app, /readAsArrayBuffer/);
  assert.match(app, /readFileBytes\(f\)\.catch\(/, 'EXIF용 바이트 읽기 실패가 올리기를 막습니다');
});

test('촬영 시각은 저장 층의 우선순위 함수로 정한다', () => {
  // EXIF → 파일 날짜 → 업로드 시각. 판단이 화면에 흩어지면 앱마다 달라진다.
  assert.match(app, /PuPhotoStore\.pickTakenAt\(/);
  assert.match(app, /PuPhotoStore\.exifTakenAt\(/);
});

test('격자는 미리보기만 받는다 — 본문은 크게 보기에서만', () => {
  assert.match(app, /PuPhotoStore\.loadThumb\(/);
  // 본문(1600px)은 크게 보기(openViewer) 안에서만 한 장씩 받는다.
  // 격자 채우기(fillThumbs)나 목록(renderGrid)이 본문을 받으면
  // 사진 수십 장에 수십 MB를 내려받게 된다.
  const uses = [...app.matchAll(/PuPhotoStore\.loadFull\(/g)];
  assert.equal(uses.length, 1, '본문 받기가 한 곳(크게 보기)에만 있어야 합니다');
  const viewerBody = app.match(/function openViewer\([\s\S]*?\nfunction closeViewer/);
  assert.ok(viewerBody && viewerBody[0].includes('PuPhotoStore.loadFull('),
    '본문 받기가 크게 보기 밖에 있습니다');
});

test('크게 보기가 있다 — 격자를 누르면 저장본 원판을 보여준다', () => {
  // 실사용 보고(2026-08-03): 격자의 240px 미리보기를 보고 "화질이 나쁘다"고
  // 판단하게 된다. 저장된 1600px 원판을 볼 길이 있어야 한다.
  assert.match(app, /id="viewer"/);
  assert.match(app, /function openViewer\(/);
  assert.match(app, /function closeViewer\(/);
});

test('격자에 넣는 미리보기는 data:image 로 시작하는 것만 허용한다', () => {
  // DB에서 온 문자열을 그대로 img src 에 꽂으면 값이 오염됐을 때 화면이 뚫린다.
  assert.match(app, /function safeSrc\(/);
  assert.match(app, /data:image\\?\//);
});

test('파일 이름 등 바깥 문자열은 이스케이프해서 화면에 넣는다', () => {
  assert.match(app, /function esc\(/);
  assert.match(app, /esc\(j\.name/);
});

test('권한 거절은 재시도가 아니라 막힘으로 표시하고 원인을 보여준다', () => {
  // 실사용 보고(2026-08-03): 규칙 문제인데 "신호 약함 — 자동 재시도"만 계속 나왔다.
  assert.match(app, /isFatal/);
  assert.match(app, /permission\[ _-\]\?denied/i);
  assert.match(app, /fail: '막힘/);
  assert.match(app, /esc\(j\.error\)/, '오류 원인을 화면에 보여주지 않습니다');
});

/* ── 로그아웃 상태 보호 ──
   ⚙️(설정·창고 점검)가 로그아웃 상태에서 눌리면 권한 거부가 나고, 화면은
   "규칙이 없을 수 있다"고 오보고한다. 규칙이 정상인데 대표님이 콘솔에서
   규칙을 고치게 만드는 경로다 — 반드시 로그인 뒤에만 보여야 한다. */

test('⚙️ 버튼의 CSS 초기값은 숨김이다', () => {
  // 초기값이 보임이면 앱이 뜨는 순간(로그인 확인 전) 잠깐 눌릴 수 있다.
  const rule = app.match(/#top\s+\.ico\s*\{([^}]*)\}/);
  assert.ok(rule, '#top .ico 규칙을 찾을 수 없습니다');
  assert.match(rule[1], /display\s*:\s*none/, '⚙️ 버튼의 CSS 초기값이 숨김이 아닙니다: ' + rule[1]);
});

test('⚙️ 버튼 표시가 로그인 여부에 묶여 있다', () => {
  assert.match(app, /<button[^>]*id="gear"/, '⚙️ 버튼에 id가 없습니다');
  const blocks = [...app.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  const inlineCode = blocks.map(m => m[1]).join('\n');
  const authBody = inlineCode.match(/onAuthStateChanged\(([\s\S]*?)\n\}\);/);
  assert.ok(authBody, 'onAuthStateChanged 본문을 찾을 수 없습니다');
  assert.match(authBody[1], /\$\('gear'\)\.style\.display\s*=\s*signedIn\s*\?/,
    '로그인 여부로 ⚙️ 버튼 표시를 갈라놓지 않았습니다');
});

test('저장 방식을 앱이 직접 정하지 않는다', () => {
  // 방식 판단은 저장 층 한 곳에만 있어야 한다.
  assert.ok(!/BUCKET_ROOT\s*=/.test(app), '창고 경로를 앱에서 다시 정의하면 안 됩니다');
  assert.match(app, /PuPhotoStore\.init\(/);
});

test('점검 결과를 화면에 보여주는 함수가 있다', () => {
  assert.match(app, /function runProbe\(\)/);
  assert.match(app, /PuPhotoStore\.probe\(/);
});

test('앱은 점검 결과 문구 분기를 직접 갖지 않고 PuPhotoStore.probeMessage를 쓴다', () => {
  // 문구 분기가 앱 안에 인라인으로 있으면 테스트로 보증할 수 없고(과거 지적 사항),
  // 당겨오기 창 등 다른 화면이 같은 문구를 재사용할 수도 없다.
  // 문구를 만드는 일은 js/pu-photo-store.js의 순수 함수 하나로만 존재해야 한다.
  assert.match(app, /PuPhotoStore\.probeMessage\(/, 'runProbe가 PuPhotoStore.probeMessage를 쓰지 않습니다');

  const blocks = [...app.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  const inlineCode = blocks.map(m => m[1]).join('\n');
  const runProbeBody = inlineCode.match(/function runProbe\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(runProbeBody, 'runProbe 함수 본문을 찾을 수 없습니다');
  // '통과했습니다'는 어느 문구에도 없는 죽은 항목이라 지웠다 — 실제 문구만 막는다.
  assert.ok(!/막혔습니다|일부 통과|거의 통과|거의 다 왔습니다/.test(runProbeBody[1]),
    'runProbe 안에 문구 분기가 남아 있습니다 — probeMessage로 옮겨야 합니다');
});

test('매니페스트를 연결한다', () => {
  assert.match(app, /<link rel="manifest" href="pu-photos-manifest\.json">/);
});

test('매니페스트가 올바른 JSON이고 이 앱을 가리킨다', () => {
  const raw = fs.readFileSync(path.join(root, 'pu-photos-manifest.json'), 'utf8');
  const m = JSON.parse(raw);
  assert.equal(m.start_url, './pu-photos.html');
  assert.equal(m.name, '푸른사진첩');
  assert.ok(Array.isArray(m.icons) && m.icons.length > 0, '아이콘이 없습니다');
});

test('포털 앱 목록에 사진첩이 있다', () => {
  const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
  assert.match(portal, /key:'photos'/);
  assert.match(portal, /url:'pu-photos\.html'/);
});

test('완성 전까지 포털 타일은 관리자만 본다', () => {
  // 사진 올리기가 붙기 전(B·C단계)에 전 직원에게 빈 앱을 보여주지 않는다.
  const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
  const line = portal.split('\n').find(l => l.includes("key:'photos'"));
  assert.ok(line, '사진첩 줄을 찾을 수 없습니다');
  assert.match(line, /roles:\['admin'\]/);
});
