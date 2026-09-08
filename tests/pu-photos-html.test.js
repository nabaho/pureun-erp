'use strict';
// pu-photos.html · 매니페스트 · 포털 등록 정적 검사 — 실행: node --test tests/*.test.js
//   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)
const test = require('node:test');
const { stripComments } = require('./strip-comments');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const { cutFn } = require('./cut-fn');

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
  assert.match(app, /<script src="js\/pu-photo-store\.js(\?v=\d+)?"><\/script>/);
});

test('저장소 공용 파일 3개를 불러온다', () => {
  /* ⚠ ?v= 가 «붙어 있어도» 통과해야 한다. 지키려는 것은 「이 셋을 부르는가」이지
     「어떤 모양으로 부르는가」가 아니다. 전에는 ?v= 없는 꼴을 그대로 못 박아 두어,
     캐시에 묻히던 pu-health.js 에 ?v= 를 다는 «옳은 고침»이 이 검사에 막혔다
     (2026-08-23). 실제로 달았는지는 tests/shared-js-cache-version.test.js 가 본다. */
  assert.match(app, /<script src="js\/pu-resilience\.js(\?v=\d+)?"><\/script>/);
  assert.match(app, /<script src="js\/pu-health\.js(\?v=\d+)?"><\/script>/);
  assert.match(app, /<script src="js\/pu-version\.js(\?v=\d+)?"><\/script>/);
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
   지켜주지 못했다. 그래서 현재 적용된 규칙 파일(docs/firebase-rules-전체-적용본.json)의
   실제 최상위 루트 이름으로 다시 썼다.

   이 앱이 쓸 루트는 puphotos(실시간DB)·pu_photos(파일 창고) 두 개뿐이다. */
const FORBIDDEN_ROOTS = [
  'uid_roles', 'sid_roles', 'payroll_os', 'fund_erp', 'work_erp', 'ieum_public',
  'scal_staff', 'scal_types', 'scal_cos', 'scal_scheds', 'scal_env', 'scal_fieldState',
  'scal_conflictMatrix', 'scal_roundlog', 'scal_erpTypeMap',
  'companies', 'pucards', 'improve_requests', 'kcareer', 'esign', 'rules_mgmt', 'chwieop'
];

/* ⚠ 주석을 «먼저 걷고» 본다 (2026-08-30). 이 울타리가 막으려는 것은 **코드가** 남의 앱
   자리를 만지는 일이다. 그런데 글자로만 찾다가 「uid_roles 에 사번이 없는 경우」라고
   적어 둔 **설명 한 줄**에 걸렸다 — 코드는 아무 데도 안 만졌는데도.
   ⚠⚠ 그대로 두면 다음 사람은 「검사가 걸리니 주석을 지우자」로 간다. 검사가 기록을
     지우라고 시키는 꼴이라, 걸린 쪽이 아니라 **검사를 고치는 것이 맞다**
     (저장소 규칙: 소스를 글자로 보는 검사는 주석을 먼저 걷는다). */
const appCode = stripComments(app)
  .replace(/^[ \t]*\/\/.*$/gm, '');

test('다른 앱의 실제 클라우드 루트를 건드리지 않는다', () => {
  for (const rootName of FORBIDDEN_ROOTS) {
    // 단어 경계로 감싼다. 그냥 부분 문자열로 찾으면 이 앱이 쓰는 pu_photos 나
    // 무관한 낱말(예: esign ⊂ design) 때문에 헛걸림이 난다.
    const re = new RegExp('\\b' + rootName + '\\b');
    assert.ok(!re.test(appCode), '다른 앱의 클라우드 루트를 건드리면 안 됩니다: ' + rootName);
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
  /* classList.add/remove/toggle 같은 화면 조작은 DB 쓰기가 아니다 —
     그것까지 막으면 검사가 엉뚱한 곳에서 걸려 신뢰를 잃는다. 먼저 걷어낸 뒤 본다. */
  const noDom = app
    .replace(/classList\.(add|remove|toggle)\(/g, 'CLASSLIST(')
    .replace(/selected\.(add|delete|clear|has)\(/g, 'SET(')
    .replace(/PuDrag\.set\(/g, 'DRAG(')        // 끌어놓기 데이터 담기 — DB 쓰기가 아니다
    .replace(/dataTransfer\.setData\(/g, 'DRAG(')
    /* 밖으로 끌어낼 사진을 미리 쥐어 두는 Map — 머릿속 기억이지 클라우드가 아니다
       (2026-08-25). 이것까지 막으면 검사가 엉뚱한 곳에서 걸려 신뢰를 잃는다. */
    .replace(/warm(Urls|Data)\.set\(/g, 'MAP(')
    /* 그림 조각의 값 바꾸기·걷어내기 — 캔버스 위의 일이지 클라우드가 아니다(2026-08-29
       ✏️ 글자·도형). fabric 은 o.set('fill', …) · canvas.remove(o) 로 말한다.
       ⚠ 여기를 넓게 열면 진짜 DB 쓰기가 숨는다 — **글자 값으로 시작하는 set** 과
         edFab 이라는 이름을 콕 집는다. */
    .replace(/\bo\.set\('(fill|stroke)',/g, 'CANVAS(')
    .replace(/\bedFab\.(remove|dispose)\(/g, 'CANVAS(')
    .replace(/\ba\.remove\(\)/g, 'DOM()');     // 임시 내려받기 링크 걷어내기 — DB 쓰기가 아니다
  for (const call of ['.set(', '.update(', '.remove(']) {
    assert.ok(!noDom.includes(call), '화면이 클라우드에 직접 쓰고 있습니다: ' + call);
  }
  assert.match(app, /PuPhotoStore\.savePhoto/, '저장이 저장 층을 거치지 않습니다');
});

/* ── B단계: 올리기·대기열·격자 ── */

test('사진 고르기 — 앨범에서 여러 장', () => {
  assert.match(app, /<input[^>]*type="file"[^>]*multiple/);
  /* ⚠ 받는 형식 목록을 글자 그대로 박지 않는다 — 하나 늘 때마다(팩스 tif 등) 깨진다.
     보는 것은 «그림도 서류도 받는가»다. */
  assert.match(app, /accept="[^"]*image\/\*[^"]*"/);
  assert.match(app, /accept="[^"]*application\/pdf[^"]*"/);
});

test('카메라는 확인형 파일 입력 없이 화면 안 연속촬영만 쓴다', () => {
  assert.doesNotMatch(app, /capture="environment"|id="camInput"|id="camNative"/);
  assert.match(app, /navigator\.mediaDevices\.getUserMedia/);
});

test('업로드 대기열 파일을 불러오고 쓴다', () => {
  assert.match(app, /<script src="js\/pu-photo-queue\.js(\?v=\d+)?"><\/script>/);
  assert.match(app, /PuPhotoQueue\.create\(/);
});

test('신호가 돌아오면 기다리지 않고 바로 재시도한다', () => {
  assert.match(app, /addEventListener\('online'/);
  assert.match(app, /retryNow/);
});

test('올릴 크기는 저장 층이 정한다 — 화면이 숫자를 갖지 않는다', () => {
  // 서류 2560 / 사진 1600. 폰·PC·당겨오기 창이 같은 값을 써야 하므로
  // 숫자는 PuPhotoStore.uploadSpec 한 곳에만 있어야 한다.
  assert.match(app, /PuPhotoStore\.uploadSpec\(/);
  /* ⚠ 2026-08-11 다시 겨눔 — 같은 사진을 두 번 풀던 것을 shrinkMany 로 한 번에
     묶었다(폰에서 한 장에 1.5~2초가 통으로 멎던 자리). 지킬 것은 **숫자가 화면에
     박혀 있지 않다**이지 shrink 를 두 번 부르는 모양이 아니다. */
  assert.match(app, /maxEdge: spec\.maxEdge, quality: spec\.quality/);
  assert.match(app, /maxEdge: spec\.thumbEdge/);
  assert.ok(!/shrink(Many)?\(f,\s*\d/.test(app), '화면에 축소 크기 숫자가 박혀 있습니다');
  assert.ok(!/maxEdge:\s*\d/.test(app), '화면에 축소 크기 숫자가 박혀 있습니다');
  // 카메라 원본이 그대로 클라우드로 가는 길이 없어야 한다. 아이폰 호환을 위해
  // 읽는 단계에서 dataURL을 쓸 수는 있지만, 대기열에는 shrink 결과만 넣는다.
  assert.match(app, /full:\s*full\.dataUrl/);
  assert.match(app, /thumb:\s*thumb\.dataUrl/);
});

test('서류 고르기 버튼이 따로 있고 서류로 표시된다', () => {
  // 서류(명함·사업자등록증·중소기업확인서)는 글씨를 읽어야 하므로 고화질로 담고,
  // 나중에 서류만 골라 보거나 기업정보함으로 넘길 수 있게 종류를 남긴다.
  assert.match(app, /id="docBtn"/);
  assert.match(app, /id="docInput"/);
  /* ⚠ 2026-08-27 — 어디서 왔는지(via)를 함께 넘긴다. 인자를 통째로 못 박지 않는다. */
  assert.match(app, /addFiles\(this\.files, true[,)]/);
  /* ⚠ 2026-09-07 — 여기 `kind: isDoc ? 'doc' : 'photo'` 를 **글자 그대로** 박아 두었다가,
     갈래와 화질을 가르는 멀쩡한 고침에 깨졌다(카메라에서 고른 「일반사진」이 저장될 때
     버려지던 것을 고쳤다 — 그 값이 버려져서 현장 사진이 전부 구글 판독으로 갔다).
     지킬 것은 값이 아니라 규칙이다: **담는 갈래를 사진 정보에 남긴다.** */
  assert.match(app, /kind: (upKind|isDoc \? 'doc' : 'photo'),/,
    '담는 갈래(서류/사진)를 사진 정보에 안 남깁니다 — 남기지 않으면 「서류만 보기」도,\n' +
    '「사진은 판독 안 하기」도 근거가 없어집니다.');
});

test('미리보기를 끼워 넣을 때 서류 딱지를 지우지 않는다', () => {
  // 칸 내용을 innerHTML 로 통째로 바꾸면 딱지가 사라진다.
  // 2026-08-10 다시 겨눔 — 끼워 넣는 일이 paintThumb 한 곳으로 모였다.
  const fn = app.match(/function paintThumb\([\s\S]*?\n\}/);
  assert.ok(fn, 'paintThumb 본문을 찾을 수 없습니다');
  assert.ok(!/cell\.innerHTML\s*=/.test(fn[0]), '칸 내용을 통째로 바꿔 딱지가 지워집니다');
  assert.match(fn[0], /insertBefore/);
});

/* ══════ 미리보기를 묶음으로 받는다 (대표 보고 2026-08-10) ══════
   "로그인하면 사진 나오는데 너무 시간이 많이 걸린다."
   원인은 양이 아니라 **오간 횟수**였다 — 한 장씩, 그것도 앞 장이 끝나야
   다음 장을 청했다. 99장이면 99번을 차례로 오간다. */
test('★ 미리보기를 한 장씩 줄줄이 청하지 않는다', () => {
  const fn = app.match(/function fillThumbs\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'fillThumbs 본문을 찾을 수 없습니다');
  assert.match(fn[0], /loadThumbsYear\(/, '한 해 치를 묶음으로 청하지 않습니다');
  assert.ok(!/chain = chain\.then/.test(fn[0]),
    '앞 장이 끝나야 다음 장을 청하는 방식이 남아 있습니다 — 99장이면 99번 오갑니다');
});

test('★ 묶음이 막히면 한 장씩 받는 길로 물러선다', () => {
  /* 공유받은 사진은 규칙이 **사진 한 장마다** 권한을 따져 묶음 읽기가 막힌다.
     빠르게 하려다 사진이 아예 안 보이면 그게 더 큰 사고다. */
  const fn = app.match(/function fillThumbs\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /gridOwner === SHARED_OWNER/, '공유받은 사진에 묶음을 쓰면 아무것도 안 보입니다');
  assert.match(fn, /fillThumbsOneByOne\(/, '물러설 길이 없습니다');
  assert.match(fn, /catch\(/, '묶음이 실패하면 그대로 멈춥니다');
  const one = app.match(/function fillThumbsOneByOne\([\s\S]*?\n\}/);
  assert.ok(one, 'fillThumbsOneByOne 이 없습니다');
  assert.match(one[0], /loadThumb\(/, '한 장씩 받는 길이 실제로 받지 않습니다');
});

test('★ 묶음에서 빠진 사진은 옛 자리에서 다시 찾는다', () => {
  const fn = app.match(/function fillThumbs\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /const left = gridItems\.filter/,
    '묶음에 없던 사진(옛 자리에 남은 것)이 영영 안 보이게 됩니다');
});

test('★ 해를 바꾸면 먼저 청한 미리보기를 엉뚱한 화면에 그리지 않는다', () => {
  /* 묶음이 도착하기 전에 대표님이 다른 해를 고를 수 있다.
     ⚠ 되돌아오는 자리가 **둘**이다 — 묶음이 도착했을 때, 그리고 모든 묶음이
        끝난 뒤 빠진 것을 찾을 때. 하나만 막으면 다른 하나로 새 나간다
        (실제로 한 곳을 지워 보니 검사가 못 잡았다). */
  const fn = app.match(/function fillThumbs\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /const year = gridYear;/, '청한 해를 기억하지 않습니다');
  const guards = (fn.match(/if \(year !== gridYear\) return;/g) || []).length;
  assert.ok(guards >= 2,
    '되돌아오는 자리마다 막아야 합니다 — 지금 ' + guards + '곳뿐입니다');
  /* 한 장씩 받는 길도 마찬가지다 — 청하기 전과 받은 뒤, 두 번 다 확인해야 한다.
     한 번만 보면 청하는 사이에 해가 바뀐 것을 놓친다. */
  const one = app.match(/function fillThumbsOneByOne\([\s\S]*?\n\}/)[0];
  const g2 = (one.match(/year !== gridYear/g) || []).length;
  assert.ok(g2 >= 2, '한 장씩 받는 길이 남의 해에 그립니다 — 지금 ' + g2 + '곳뿐입니다');
});

test('★ 너무 많으면 묶지 않는다 (한 묶음이 지나치게 커진다)', () => {
  const m = app.match(/const THUMB_BULK_MAX = (\d+);/);
  assert.ok(m, 'THUMB_BULK_MAX 가 없습니다.');
  const n = +m[1];
  assert.ok(n >= 100, '너무 낮으면 묶음이 거의 안 쓰여 다시 느려집니다: ' + n);
  assert.ok(n <= 2000, '한 묶음이 지나치게 커집니다: ' + n);
});

test('★ 미리보기 묶음을 저장 층이 내준다', () => {
  const store = fs.readFileSync(path.join(root, 'js', 'pu-photo-store.js'), 'utf8');
  assert.match(store, /function loadThumbsYear\(/, 'loadThumbsYear 가 없습니다');
  assert.match(store, /loadThumbsYear: loadThumbsYear/, '밖으로 내주지 않습니다');
  const fn = store.match(/function loadThumbsYear\([\s\S]*?\n  \}/)[0];
  assert.match(fn, /'\/thumbs\/' \+ year/, '미리보기 자리가 아닌 곳을 읽습니다');
  assert.ok(!/blobs/.test(fn), '격자가 본문(1600px)까지 받으면 수십 MB가 됩니다');
});

/* ── 내려받기 ── */

test('사진 한 장을 내려받을 수 있다 — 폰에서도', () => {
  assert.match(app, /function downloadOne\(/);
  // 원판을 받아 내려준다(미리보기 240px 를 내려주면 쓸 수 없다)
  const fn = app.match(/function downloadOne\([\s\S]*?\n\}/);
  assert.ok(fn, 'downloadOne 본문을 찾을 수 없습니다');
  assert.match(fn[0], /loadFull\(/);
  // data: 주소를 그대로 a[download] 에 걸면 폰에서 막히는 브라우저가 있다 → Blob
  assert.match(app, /createObjectURL\(/);
  assert.match(app, /revokeObjectURL\(/);
});

test('파일 이름에 날짜와 회사명이 들어가고 위험한 글자는 걸러낸다', () => {
  assert.match(app, /function fileNameOf\(/);
  const fn = app.match(/function fileNameOf\([\s\S]*?\n\}/);
  assert.ok(fn, 'fileNameOf 본문을 찾을 수 없습니다');
  // 파일 이름에 쓸 수 없는 글자를 지운다
  assert.match(fn[0], /replace\(/);
});

test('여러 장은 묶어서 한 파일로 내려받는다', () => {
  // 폰에서 여러 번 내려받으면 물음창이 여러 번 뜬다 — 한 파일이 낫다.
  assert.match(app, /function downloadSelected\(/);
  assert.match(app, /jszip/i);
  // 필요할 때만 받아 쓴다(앱에 통째로 박지 않는다)
  assert.match(app, /function loadZipLib\(/);
});

test('내려받기 단추는 고른 것이 있을 때 나온다', () => {
  assert.match(app, /id="dlBtn"/);
  assert.match(app, /downloadSelected\(\)/);
});

/* ── 휴지통 · 설정 화면 · 3분류 ── */

test('지운 사진은 휴지통으로 가고 되살릴 수 있다', () => {
  /* 자리 이력: 8/5 에 화면 → 본문 맨 아래 접힌 칸으로 옮겼다가,
     8/6 에 다시 제 화면으로 되돌렸다(장수가 쌓이니 본문을 길게 밀어냈다). */
  assert.match(app, /id="viewTrash"/);
  assert.match(app, /PuPhotoStore\.listTrash\(/);
  assert.match(app, /function restoreOne\(/);
  assert.match(app, /PuPhotoStore\.restorePhoto\(/);
  // 남은 날을 보여줘야 급한지 안다
  assert.match(app, /일 남음/);
});

test('30일 지난 휴지통은 스스로 비운다 — 실패해도 앱은 돈다', () => {
  assert.match(app, /PuPhotoStore\.purgeOldTrash\(/);
  const blk = app.match(/purgeOldTrash\([\s\S]{0,200}/);
  assert.match(blk[0], /catch/, '정리 실패가 앱을 멈추게 합니다');
});

test('휴지통에서 완전히 지울 때는 확인을 받는다', () => {
  const fn = app.match(/function purgeOneNow\([\s\S]*?\n\}/);
  assert.ok(fn, 'purgeOneNow 본문을 찾을 수 없습니다');
  assert.match(fn[0], /confirm\(/);
  assert.match(fn[0], /되돌릴 수 없/);
});

test('설정은 팝업이 아니라 본문 화면이다', () => {
  // 팝업은 화면을 가리고 뒤가 어수선하다(대표 지시로 본문 화면으로 옮김).
  assert.match(app, /id="viewSettings"/);
  assert.match(app, /function showView\(/);
  assert.ok(!/id="settings"/.test(app), '옛 설정 팝업이 남아 있습니다');
  assert.ok(!/function closeSettings\(/.test(app), '팝업 닫기 함수가 남아 있습니다');
});

test('본문 위 탭은 사진 분류다 — 휴지통·설정은 그 자리를 쓰지 않는다', () => {
  /* 2026-08-05 대표 지시로 배치가 바뀌었다.
     예전: 본문 위에 「사진 · 휴지통 · 설정」 탭.
     지금: 본문 위는 **분류 탭**, 휴지통은 본문 맨 아래, 설정은 대시보드 맨 아래.
     되돌리려면 분류 탭을 어디에 둘지 먼저 정할 것 — 이 자리가 유일한 가로줄이다. */
  assert.match(app, /id="kinds"/, '분류 탭 자리가 없습니다');
  assert.ok(!/id="tabs"/.test(app), '옛 본문 탭이 남아 있습니다');
  for (const id of ['tabPhotos', 'tabTrash', 'tabSettings']) {
    assert.ok(!new RegExp('id="' + id + '"').test(app), id + ' 이 남아 있습니다');
  }
  // 들어가는 길이 둘이면 헷갈린다 — 설정은 대시보드 단추 하나로만 들어간다
  assert.match(app, /id="setBtn"[^>]*onclick="showView\('settings'\)"/,
    '대시보드 설정 단추가 없습니다');
  assert.ok(!/id="gearBtn"/.test(app), '옛 설정 단추가 남아 있습니다');
});

test('분류 탭은 여섯 가지다 — 어느 탭에도 안 드는 사진이 없어야 한다', () => {
  /* 대표 지시 8/5(A안: 다섯) + 8/6(회의사진 분리 → 여섯).
     묶는 규칙: sme 는 사업자등록증에, other·판독 안 한 사진은 기타서류에.
     ⚠ 어느 탭에도 안 잡히는 종류가 생기면 그 사진은 화면에서 사라진다. */
  const tabs = app.match(/const KIND_TABS = \[[\s\S]*?\];/);
  assert.ok(tabs, 'KIND_TABS 를 찾을 수 없습니다');
  for (const label of ['전체사진', '명함', '사업자등록증', '급여서류', '기타서류', '회의사진']) {
    assert.ok(tabs[0].indexOf(label) >= 0, label + ' 탭이 없습니다');
  }
  assert.match(tabs[0], /'sme'/, '중소기업확인서가 어느 탭에도 안 들어갑니다');
  assert.match(tabs[0], /key: 'meeting'[\s\S]*?kinds: \['meeting'\]/,
    '회의사진 탭이 meeting 을 맡지 않습니다 — 회의 사진이 기타서류에 남습니다');
  // 기타서류는 나머지 전부를 받는 그물이어야 한다(kinds: null)
  assert.match(tabs[0], /key: 'other'[\s\S]*?kinds: null/,
    '기타서류가 나머지를 받는 그물이 아닙니다 — 빠지는 사진이 생깁니다');
  // 판독을 안 한 사진도 반드시 어딘가에 든다
  // 직접 지정한 분류가 있으면 그 분류 하나만 대표 분류로 쓴다.
  // 그래야 옮긴 사진이 이전 분류에 중복으로 남지 않는다.
  const fn = app.match(/function tabsOf\([\s\S]*?\n\}/);
  assert.ok(fn, 'tabsOf 를 찾을 수 없습니다');
  assert.match(fn[0], /'other'/, '판독 안 한 사진이 갈 곳이 없습니다');
});

test('탭 순서는 끌어서 바꾸고 이 기기에 기억된다 — 전체사진은 맨 앞 고정', () => {
  /* 대표 지시 8/6: "폴더 마우스로 드래그해서 이동할 수 있게" */
  const ord = app.match(/function kindOrder\(\)[\s\S]*?\n\}/);
  assert.ok(ord, 'kindOrder 를 찾을 수 없습니다');
  assert.match(ord[0], /\['all'\]/, '전체사진이 맨 앞에 고정돼 있지 않습니다');
  /* 저장된 순서에 없는 새 탭도 반드시 나타난다 — 아니면 탭을 늘릴 때
     예전에 순서를 바꿔 둔 기기에서 새 탭이 조용히 숨는다 */
  assert.match(ord[0], /keys\.forEach[\s\S]*?out\.push\(k\)/,
    '저장 순서에 없는 새 탭이 숨습니다');
  assert.match(app, /localStorage\.setItem\(KIND_ORDER_LS/, '순서를 기억하지 않습니다');
  /* 끌 수 있는 것은 전체사진 빼고 전부 */
  const rk = app.match(/function renderKindTabs\(\)[\s\S]*?\n\}/);
  assert.match(rk[0], /k === 'all' \? '' : ' draggable="true"/,
    '전체사진까지 끌리거나, 아무것도 끌 수 없습니다');
  /* 놓는 계산이 전체사진 앞자리를 지킨다 */
  assert.match(app, /splice\(Math\.max\(1, at\)/, '끌어다 놓으면 전체사진 앞으로 들어갈 수 있습니다');
});

test('분류 탭과 「확인 필요」는 함께 걸린다', () => {
  /* 하나만 적용하면 확인 필요를 켠 채 탭을 옮겼을 때 다른 탭 사진이 섞여 나온다. */
  const fn = app.match(/function shownItemsFresh\([\s\S]*?\n\}/);
  assert.ok(fn, 'shownItems 를 찾을 수 없습니다');
  assert.match(fn[0], /kindTab/, '분류 탭을 안 봅니다');
  assert.match(fn[0], /needsCheck/, '확인 필요를 안 봅니다');
});

test('탭을 옮기면 고른 것을 비운다', () => {
  /* 안 보이는 사진이 골라진 채로 남으면 「지우기」가 엉뚱한 것을 지운다. */
  const fn = app.match(/function pickKind\([\s\S]*?\n\}/);
  assert.ok(fn, 'pickKind 를 찾을 수 없습니다');
  assert.match(fn[0], /selected\.clear\(\)/, '고른 것을 비우지 않습니다');
});

test('명함·서류·회의사진 세 가지를 가린다', () => {
  assert.match(app, /meeting: '회의·현장 사진'/);
  /* 회의사진은 기업정보함에 넣을 것이 없으니 '확인 필요'로 잡지 않는다.
     ⚠ 2026-08-15 다시 겨눔 — 판정을 KEEP_ONLY 한 곳으로 모았다(갈래마다 따로
     적다가 계약서가 빠져 영영 안 없어지는 ⚠ 가 생겼다). */
  /* ⚠ 2026-08-27 또 옮겼다 — 판정이 checkWhy 한 곳으로 모였다(needsCheck 는 그것을
     그대로 쓴다). 지킬 것은 그대로: 회의사진은 목록에 있고 할 일이 아니다. */
  const fn = app.match(/function checkWhy\([\s\S]*?\n\}/);
  assert.match(fn[0], /KEEP_ONLY\[r\.kind\]\) return ''/);
  assert.match(app, /const KEEP_ONLY = \{[^}]*meeting: 1/);
});

/* ── 다른 앱으로 끌어다 놓기 ── */

test('사진을 끌 수 있다 — 공용 규약을 쓴다', () => {
  assert.match(app, /<script src="js\/pu-drag\.js(\?v=\d+)?"><\/script>/);
  assert.match(app, /draggable="true"/);
  assert.match(app, /addEventListener\('dragstart'/);
  assert.match(app, /PuDrag\.set\(/);
});

test('끌 때 사진 자체가 아니라 표만 넘긴다', () => {
  // base64 를 넘기면 크기 제한에 걸리고 창을 넘길 때 깨진다.
  /* ⚠ 격자의 dragstart 를 콕 집는다. 그냥 첫 dragstart 를 잡으면, 재복사를
     막는 document 단위 dragstart(selfDrag)가 앞에 있어 엉뚱한 것을 검사한다. */
  const fn = app.match(/\$\('grid'\)\.addEventListener\('dragstart'[\s\S]*?\n\}\);/);
  assert.ok(fn, '격자 dragstart 본문을 찾을 수 없습니다');
  assert.ok(!/it\.thumb|loadFull|blob/.test(fn[0]), '사진 데이터를 넘기고 있습니다');
  /* 2026-08-10 다시 겨눔 — 표를 만드는 일이 dragRefOf 로 모였다.
     지켜야 할 것은 「사진이 아니라 표를 넘긴다」와 「표에 찾아갈 것이 다 들어 있다」이지
     그 코드가 어느 함수에 적혀 있느냐가 아니다. */
  const ref = app.match(/function dragRefOf\([\s\S]*?\n\}/);
  assert.ok(ref, 'dragRefOf 본문을 찾을 수 없습니다');
  assert.ok(!/it\.thumb|loadFull|blob/.test(ref[0]), '표에 사진 데이터를 담고 있습니다');
  // 어디 있는 무엇인지가 다 들어가야 받는 쪽이 가져올 수 있다
  for (const k of ['year:', 'owner:', 'id:']) {
    assert.ok(ref[0].indexOf(k) >= 0, '표에 ' + k + ' 가 없습니다');
  }
});

/* ══════ 고른 여러 장을 밖으로 (대표 지시 2026-08-10) ══════
   "체크된 서류 및 사진들 한꺼번에 화면 안과 화면 밖으로 옮길 수 있게 해줘"
   예전에는 8장을 끌어도 받는 쪽엔 1장만 도착했다 — 규약이 한 장짜리였다. */
test('★ 고른 것을 끌면 전부 함께 나간다', () => {
  const fn = app.match(/\$\('grid'\)\.addEventListener\('dragstart'[\s\S]*?\n\}\);/)[0];
  /* ⚠ setMany 라는 글자만 보면 안 된다 — 그 줄이 **닿지 않는 곳**에 있어도 통과한다
     (실제로 조건을 false 로 바꿔 봤더니 안 잡혔다). 조건까지 함께 본다. */
  assert.match(fn, /if \(refs\.length > 1\) PuDrag\.setMany\(/,
    '여러 장일 때 여러 장으로 보내지 않습니다 — 1장만 도착합니다');
  assert.match(fn, /photoDragIds\.filter/, '고른 전부를 표로 만들지 않습니다');
});

test('★ 집은 사진이 맨 앞에 간다', () => {
  /* 한 장만 읽는 옛 앱에서도 **대표님이 집은 그 사진**이 가야 한다.
     목록 첫 장이 가면 엉뚱한 것을 받은 것처럼 보인다. */
  const fn = app.match(/\$\('grid'\)\.addEventListener\('dragstart'[\s\S]*?\n\}\);/)[0];
  assert.match(fn, /const order = \[id\]\.concat\(/, '집은 사진이 맨 앞이 아닙니다');
});

test('★ 규약이 여러 장을 담되 옛 앱을 깨지 않는다', () => {
  const drag = fs.readFileSync(path.join(root, 'js', 'pu-drag.js'), 'utf8');
  const set = drag.match(/function setMany\([\s\S]*?\n  \}/);
  assert.ok(set, 'setMany 가 없습니다');
  assert.match(set[0], /head\.items = list/, '여러 장을 담지 않습니다');
  assert.match(set[0], /list\[0\]/,
    '첫 장을 맨 윗칸에 두지 않으면 한 장만 읽는 옛 앱이 빈손이 됩니다');
  const all = drag.match(/function readAll\([\s\S]*?\n  \}/);
  assert.ok(all, 'readAll 이 없습니다');
  assert.match(all[0], /return \[ref\]/, '한 장짜리로 온 것을 못 읽습니다');
  assert.match(all[0], /x\.id/, '번호 없는 표를 걸러 내지 않습니다');
  assert.match(drag, /readAll: readAll/, '밖으로 내주지 않습니다');
  assert.match(drag, /setMany: setMany/, '밖으로 내주지 않습니다');
});

test('★ 규약이 실제로 여러 장을 실어 나른다', () => {
  /* 겉모습이 아니라 진짜로 돌려 본다 — 넣은 것이 그대로 나와야 한다. */
  const drag = fs.readFileSync(path.join(root, 'js', 'pu-drag.js'), 'utf8');
  const g = {};
  vm.createContext(g);
  vm.runInContext(drag + '\n;globalThis.PuDrag = PuDrag || globalThis.PuDrag;', g);
  const PuDrag = g.PuDrag;
  assert.ok(PuDrag, 'PuDrag 를 만들지 못했습니다');

  const bag = {};
  const dt = {
    types: [],
    setData(t, v) { bag[t] = v; this.types.push(t); },
    getData(t) { return bag[t] || ''; }
  };
  const list = [
    { app: 'pu-photos', kind: 'photo', year: '2026', owner: 'u1', id: 'a', name: '가' },
    { app: 'pu-photos', kind: 'photo', year: '2026', owner: 'u1', id: 'b', name: '나' },
    { app: 'pu-photos', kind: 'photo', year: '2026', owner: 'u1', id: 'c', name: '다' }
  ];
  assert.equal(PuDrag.setMany(dt, list), true);

  const got = PuDrag.readAll(dt);
  assert.equal(got.length, 3, '세 장을 실었는데 ' + got.length + '장만 나옵니다');
  /* ⚠ vm 안에서 만든 배열은 밖의 배열과 **다른 종류**로 취급된다(deepEqual 이 튕긴다).
     알맹이만 견주려고 글자로 이어 붙인다. */
  assert.equal(got.map(x => x.id).join(','), 'a,b,c', '순서가 어긋납니다');

  /* 한 장만 읽는 옛 앱 */
  const one = PuDrag.read(dt);
  assert.equal(one.id, 'a', '옛 앱이 첫 장을 못 받습니다');

  /* 한 장짜리로 보낸 것도 배열로 읽힌다 */
  const bag2 = {};
  const dt2 = { types: [], setData(t, v) { bag2[t] = v; this.types.push(t); }, getData(t) { return bag2[t] || ''; } };
  PuDrag.set(dt2, list[0]);
  assert.equal(PuDrag.readAll(dt2).map(x => x.id).join(','), 'a', '한 장짜리를 못 읽습니다');

  assert.match(PuDrag.label({ kind: 'photo', docKind: 'doc', items: list }), /3장/,
    '몇 장인지 안 알려 줍니다');
});

test('컨설팅이 사진첩 사진을 받는다', () => {
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  assert.match(gov, /<script src="js\/pu-drag\.js(\?v=\d+)?"><\/script>/);
  assert.match(gov, /<script src="js\/pu-photo-store\.js(\?v=\d+)?"><\/script>/);
  assert.match(gov, /PuDrag\.read\(/);
  assert.match(gov, /function dropFromAlbum\(/);
  // 파일을 놓는 기존 길이 살아 있어야 한다(사진첩만 되면 퇴보다)
  const drop = gov.match(/async function dropExtraPhoto\([\s\S]*?\n\}/);
  assert.ok(drop, 'dropExtraPhoto 본문을 찾을 수 없습니다');
  assert.match(drop[0], /dataTransfer\.files/, '파일 놓기가 사라졌습니다');
});

test('컨설팅은 사진첩에서 원판을 받아 자기 사본을 만든다', () => {
  /* 사진첩 원본은 그대로 남아야 한다(설계서 원칙). insertAlbumFull 이
     끌어다 놓기·「사진첩에서 고르기」 창의 공용 마무리 단계다 — 둘 다 이걸
     거쳐야 기존 파일 처리 길(타임스탬프·중복검사)을 그대로 탄다. */
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  const drop = gov.match(/async function dropFromAlbum\([\s\S]*?\n\}/);
  assert.ok(drop, 'dropFromAlbum 본문을 찾을 수 없습니다');
  assert.match(drop[0], /PuPhotoStore\.loadFull\(/);
  assert.match(drop[0], /insertAlbumFull\(/, '공용 마무리 단계를 타지 않습니다');
  const ins = gov.match(/async function insertAlbumFull\([\s\S]*?\n\}/);
  assert.ok(ins, 'insertAlbumFull 본문을 찾을 수 없습니다');
  assert.match(ins[0], /simpleStampFile\(/, '기존 사진 처리 길을 타지 않습니다');
  assert.ok(!/deletePhoto|saveRead/.test(drop[0] + ins[0]), '사진첩 원본을 건드리고 있습니다');
  // 남의 사진은 규칙이 막는다 → 왜 안 되는지 알려줘야 한다
  assert.match(ins[0], /내가 올린 사진만/);
});

/* ── 사진첩에서 고르기 (창 하나로) ── */

test('사진 칸마다 사진첩에서 고르는 단추가 있다 — 끌어다 놓기는 그대로 둔다', () => {
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  assert.match(gov, /onclick="openAlbumPicker\('\$\{sid\}',\$\{d\.i\}\)"/);
  assert.match(gov, /ondrop="dropExtraPhoto\(event,'\$\{sid\}',\$\{d\.i\}\)"/, '끌어다 놓기가 없어졌습니다');
});

test('고르는 창은 방문일을 먼저 보여주되, 그 날 사진이 없으면 전체로 간다', () => {
  /* ⚠ 결정이 바뀐 자리다.
     2026-08-04 대표 결정: 「대부분 폰으로 찍어 그때그때 올리므로 날짜를 가려 볼
       필요가 없다」 → 방문일 필터를 두지 않았다.
     2026-08-25 변경(c6b2869b, 고르기를 수정 창 «안에서»): 방문일을 첫 화면으로
       두고, 그 날 사진이 없으면 전체로 되돌린다.
     ⚠ 뒤 변경이 앞 결정을 덮었다. 검사는 **지금 코드**를 적되, 앞 결정의 뜻
       (「빈 화면부터 보여 주면 안 된다」)은 못 박아 둔다 — 되돌리라면 이 검사와
       코드를 함께 되돌린다. */
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  /* ⚠ 2026-08-25 재조정 — 「한 번에 모두 보고 고르기」(1e86c9f9)로 함수가 갈렸다:
       openAlbumPicker 안에 있던 읽기 → pkLoadYear · loadAlbumThumbs → pkThumbs
       pickAlbumPhoto → pkPut · renderAlbumPick → pkPaintBody
     코드는 멀쩡한데 검사가 옛 이름을 붙잡아 main 이 빨간불이 되고
     «모든 앱 배포가 막혔다». 지킬 규칙은 이름이 아니라 뜻이다. */
  const fn = gov.match(/function pkLoadYear\([\s\S]*?\n\}/);
  assert.ok(fn, '연도별로 읽는 함수를 찾을 수 없습니다 (pkLoadYear)');
  assert.match(fn[0], /PuPhotoStore\.listYear\(/);
  /* 그 날 사진이 없으면 반드시 전체로 — 이것이 없으면 빈 화면만 보고 「사진첩에
     아무것도 없다」고 오해한다. */
  assert.match(fn[0], /visitOnly\s*=\s*false/, '★ 그 날 사진이 없을 때 전체로 되돌리지 않습니다');
  assert.match(fn[0], /DayKey\(/, '어느 날 사진인지 견주는 곳이 없습니다');
  /* ⚠ 2026-08-29 또 바뀌었다 — 「방문일만 켜고 열기」를 껐다. 방문일에 찍힌 것이
     명함·서류뿐인 일이 많아 «빈 화면부터» 보게 됐기 때문이다(대표 보고).
     대신 ㉮회의·현장 사진만 가져오고 ㉯방문일 묶음을 격자 맨 위에 둔다.
     지켜야 할 뜻은 처음과 같다 — 「빈 화면부터 보여 주지 않는다」. */
  const opener = gov.match(/function openAlbumPicker\([\s\S]*?\n\}/)[0];
  assert.match(opener, /PK\.visitOnly\s*=\s*false/,
    '방문일만 켜고 열면 그 날 사진이 없을 때 빈 화면부터 보게 됩니다');
  assert.match(opener, /PK\.onlyMeeting\s*=\s*!ref/,
    '증빙 칸인데 명함·서류까지 가져옵니다 — 고를 것이 묻힙니다');
});

test('사진첩이 사람별로 갈려 있다 — 내 uid 를 owner 로 넘긴다', () => {
  // 안 넘기면 저장 층이 "계정을 알 수 없습니다"로 거절한다(이 화면은 signIn 을 안 부른다).
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  const open = gov.match(/function pkLoadYear\([\s\S]*?\n\}/)[0];
  assert.match(open, /listYear\(year, albumPickOwner\)/);
  // 2026-08-26 부터 자리는 «사진마다» 정한다 — 공유받은 것은 주인 자리다(pkOwnerOf).
  // 넘긴다는 뜻은 그대로다: 계정을 안 넘기면 저장 층이 거절한다.
  /* ★ «어느 함수에서» 읽는지는 못 박지 않는다. 2026-08-27 요금 줄이기로 「보이는 것만」
     읽게 쪼개지며 loadThumb 호출이 pkThumbs → pkThumbOne 으로 옮겼고, 이 검사가 그
     함수 이름을 붙잡고 있어 저장소 전체 배포가 막혔다.
     지킬 것은 하나다: 썸네일을 읽을 때 «사진마다 주인(pkOwnerOf)»을 넘기는가. */
  assert.match(gov, /loadThumb\([^)]*pkOwnerOf\(/,
    '썸네일을 읽을 때 사진마다 주인을 안 넘깁니다 — 공유받은 사진이 안 보이게 됩니다');
  const pick = gov.match(/async function pkPut\([\s\S]*?\n\}/)[0];
  assert.match(pick, /loadFull\(s\.year, s\.id, pkOwnerOf\(it\)\|\|owner\)/, '내 계정을 안 넘깁니다');
});

test('고른 사진도 끌어다 놓기와 같은 마무리를 탄다', () => {
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  const fn = gov.match(/async function pkPut\([\s\S]*?\n\}/);
  assert.ok(fn, '고른 것을 넣는 함수를 찾을 수 없습니다 (pkPut)');
  assert.match(fn[0], /insertAlbumFull\(/, '공용 마무리 단계를 타지 않습니다');
  /* ⚠ 예전에는 창을 따로 띄우고 `closeModal('mbAlbumPick')` 로 닫았다.
     2026-08-25 변경(c6b2869b): 고르기를 **수정 창 안에서** 한다 — 창 위의 창을
     없앴다. 그래서 닫을 창이 없다.
     남은 뜻은 하나다: **고르고 나서 어디로 가는지가 분명해야 한다.**
       빈 칸이 남았으면 다음 빈 칸으로, 없으면 고르기를 접는다. */
  /* 「한 번에 모두」로 바뀌며 고른 것을 «칸 순서대로» 채운다 — 다음 빈 칸을
     따로 찾을 일이 없어졌다. 남은 뜻은 하나: 다 넣었으면 고르기를 접는다. */
  assert.match(fn[0], /PK\.targets/, '어느 칸에 넣을지를 안 정합니다');
  assert.match(fn[0], /closePickAll\(\)/, '★ 다 채웠는데 고르기 화면에 그대로 남습니다');
  assert.equal(/closeModal\('mbAlbumPick'\)/.test(fn[0]), false,
    '창 위의 창을 다시 만들었습니다 — 2026-08-25 에 없앴습니다');
});

test('사진이 없으면 왜 없는지 알려 준다', () => {
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  const fn = gov.match(/function pkPaintBody\([\s\S]*?\n\}/);
  assert.ok(fn, '고르기 목록을 그리는 함수를 찾을 수 없습니다 (pkPaintBody)');
  assert.match(fn[0], /사진첩에 올린 사진이 없습니다/);
  /* 거름 때문에 빈 것과 사진첩 자체가 빈 것은 «다른 일» 이다 — 갈라 말해야 한다 */
  assert.match(fn[0], /이 조건에 맞는 사진이 없습니다/, '거름 때문에 빈 것을 갈라 말하지 않습니다');
});

/* ── 사람별 분리 ── */

test('계정을 등록한 뒤의 성공 부팅 단계에서 사진을 읽는다', () => {
  // 사진 자리가 사람별로 갈려 있어 계정을 모르면 경로를 만들 수 없다.
  // 순서가 어긋나면 앱이 뜨는 순간 사진이 안 보인다(실제로 그런 사고가 있었다).
  /* 카메라 우선 부팅 때문에 loadGrid는 짧은 300자 안에 있지 않다. 중요한 계약은
     글자 거리가 아니라 signIn 성공 콜백의 finishPhotoBoot 안에 있다는 점이다. */
  const signAt = app.indexOf('PuPhotoStore.signIn(u.uid');
  const successAt = app.indexOf('.then(function (me)', signAt);
  const finishAt = app.indexOf('const finishPhotoBoot = function ()', successAt);
  const loadAt = app.indexOf('loadGrid();', finishAt);
  const loginCatchAt = app.indexOf("console.warn('[로그인]'", successAt);
  assert.ok(signAt >= 0, 'signIn 호출을 찾을 수 없습니다');
  assert.ok(successAt > signAt, '계정 등록 성공 콜백을 찾을 수 없습니다');
  assert.ok(finishAt > successAt && loadAt > finishAt,
    '사진 읽기는 계정 등록 성공 뒤의 부팅 단계에 있어야 합니다');
  assert.ok(loginCatchAt > loadAt,
    '사진 읽기가 계정 등록 성공 콜백 밖으로 빠졌습니다');
  assert.match(app.slice(finishAt, loadAt + 'loadGrid();'.length),
    /startUploadWatch\(\);\s*loadGrid\(\);/,
    '계정 등록 뒤 원격 갱신 감시와 사진 읽기가 함께 시작되어야 합니다');
});

test('주소가 아니라 사람 이름이 뜬다', () => {
  // 대표 지시 — p001@pureun.kr 이 아니라 본인 이름.
  // 명부에서 찾는 일은 저장 층이 한다(화면이 data/user_dir 경로를 알면 가드가 깨진다).
  assert.ok(!/user_dir/.test(app), '화면이 명부 경로를 직접 읽습니다');
  assert.match(app, /\$\('who'\)\.textContent = me\.name/);
  // 올린 사람 이름도 주소가 아니라 이름으로 남는다
  assert.match(app, /byName: PuPhotoStore\.myName\(\)/);
});

test('관리자 여부를 화면에서 짐작하지 않는다', () => {
  // uid_roles 는 서버가 아는 값이고, 화면에 그 경로가 들어오면 실데이터 가드가 깨진다
  // ⚠ 여기도 주석을 걷고 본다 — 「그 자리를 안 만진다」고 적어 둔 설명에 걸리면
  //   다음 사람이 설명을 지우게 된다(2026-08-30)
  assert.ok(!/uid_roles/.test(appCode), '화면이 권한 경로를 직접 읽습니다');
  assert.match(app, /PuPhotoStore\.amAdmin\(\)/);
});

test('직원에게는 남의 사진을 볼 길이 화면에도 없다', () => {
  const fn = app.match(/function renderOwnerPick\([\s\S]*?\n\}/);
  assert.ok(fn, 'renderOwnerPick 본문을 찾을 수 없습니다');
  assert.match(fn[0], /if \(!PuPhotoStore\.amAdmin\(\)\)/, '관리자 확인 없이 사람 고르기를 보여줍니다');
});

test('남의 사진은 지우거나 고칠 수 없다 (판독은 2026-08-10 부터 허용)', () => {
  /* ⚠ 예전에는 판독(readAgain·readSelected)도 이 목록에 있었다. 그래서 다른 직원이
     찍은 명함은 **그 직원이 자기 화면을 열고 있을 때만** 기업정보함에 들어갔다.
     대표 지시(2026-08-10): "다른 직원이 사진찍은 데이터는 입력이 되어야 한다"
     → 판독·기업정보함 보내기는 풀고, **지우기·고치기는 그대로 잠근다.** */
  assert.match(app, /function viewingOther\(/);
  assert.match(app, /function blockedIfOther\(/);
  for (const fname of ['deleteOne', 'deleteSelected']) {
    const fn = app.match(new RegExp('function ' + fname + '\\([\\s\\S]{0,160}'));
    assert.ok(fn, fname + ' 를 찾을 수 없습니다');
    assert.match(fn[0], /blockedIfOther\(/, fname + ' 이 남의 사진에도 동작합니다');
  }
  /* 올리기 단추는 **한 사람만 보는 중**일 때 잠근다.
     ⚠ 2026-08-10 다시 겨눔 — 관리자는 「전체 근로자」로 시작한다(대표 지시).
        거기서도 잠그면 앱을 열 때마다 화면을 바꿔야 올릴 수 있다.
        올리는 것은 보는 화면과 무관하게 **늘 내 자리로** 간다(savePhoto)。
        지우기·판독은 위에서 보듯 viewingOther() 그대로 — 남의 사진이 섞여 있다. */
  /* ⚠ 2026-09-03 다시 겨눔 — 목록을 «글자 그대로» 박아 두었더니, 시트의
     phUpBtn 을 걷어내고 윗줄 phUpTopBtn 을 넣는 «옳은 고침»에 검사가 걸렸다.
     지킬 것은 이름표가 아니라 「폰·PC 의 올리는 단추가 같은 기준으로 잠기는가」다. */
  const 잠금 = app.match(/\[('[\w]+',?\s*)+\]\.forEach\(function \(id\)[\s\S]{0,200}?viewingOnlyOther\(\)/);
  assert.ok(잠금, 'PC·모바일 올리기 단추를 한 기준으로 잠그는 자리가 없습니다');
  for (const id of ['docBtn', 'collectBtn', 'phCollectBtn'])
    assert.ok(잠금[0].indexOf("'" + id + "'") > 0, id + ' 이 잠금 목록에서 빠졌습니다');
  assert.match(잠금[0], /'ph[\w]*Up[\w]*'/,
    '★ 폰에서 올리는 단추가 잠금 목록에 없습니다 — 남의 사진을 보는 중에도 눌립니다');
  assert.ok(!/'camBtn'/.test(잠금[0]),
    '없앤 단추(camBtn)를 부르면 그 줄에서 멎습니다');
  assert.match(app, /function viewingOnlyOther\(\) \{ return viewingOther\(\) && gridOwner !== ALL_OWNERS; \}/,
    '「전체 근로자」만 예외여야 합니다 — 한 사람을 골라 볼 때는 여전히 잠깁니다.');
});

/* ── 담긴 양(용량) 자동으로 보이기 (대표 지시 2026-08-15) ── */

/* ⚠ 2026-08-17 다시 겨눔 — 설정 탭을 없앴다(대표 지시 「탭없앰」).
   예전에는 부르는 곳이 showView·pickSetTab **둘**이라 각각 못 박고 있었다.
   탭이 사라지면서 부르는 곳이 하나로 줄었다 — 지킬 것은 「어느 탭일 때 센다」가
   아니라 **「손으로 안 눌러도 열면 보인다」**이다. */
test('★ 설정을 열면 담긴 양이 자동으로 보인다', () => {
  const fn = app.match(/function showView\([\s\S]*?\n\}/);
  assert.ok(fn, 'showView 를 찾지 못했습니다.');
  const set = fn[0].slice(fn[0].indexOf("name === 'settings'"));
  assert.match(set, /countUsage\(\);/,
    '설정을 열어도 안 세면, 없앤 [세어 보기] 단추 대신 볼 길이 없습니다.');
});

test('★ 설정을 열면 지난 사진도 함께 센다', () => {
  /* 예전에는 [지난 사진 찾기]를 눌러야만 알 수 있어, 담당자가 몇 장 밀렸는지
     영영 모르고 지나쳤다. 그 단추를 없앴으므로 여는 김에 함께 센다. */
  const fn = app.match(/function showView\([\s\S]*?\n\}/);
  const set = fn[0].slice(fn[0].indexOf("name === 'settings'"));
  assert.match(set, /findOld\(\);/, '지난 사진을 안 세면 할 일 줄에 영영 안 나옵니다.');
});

test('겹쳐 부르기 방지가 남아 있다 — 단추가 아니라 깃발로', () => {
  /* 단추의 disabled 로 「세는 중」을 알던 것을 깃발로 바꿨다(단추를 없앴으므로).
     겹침 방지 자체는 그대로 필요하다 — 설정을 빠르게 여닫으면 두 번 겹치고,
     겹치면 늦게 끝난 쪽이 옛 값으로 화면을 덮는다. */
  const fn = app.match(/function countUsage\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'countUsage 를 찾지 못했습니다.');
  assert.match(fn[0], /if \(usageBusy\) return;/, '겹쳐 부르면 옛 값이 화면을 덮습니다.');
  assert.ok(!/btn\.disabled/.test(fn[0]), '없앤 단추를 아직 만지고 있습니다 — 터집니다.');

  const fo = app.match(/function findOld\(\)[\s\S]*?\n\}/);
  assert.ok(fo, 'findOld 를 찾지 못했습니다.');
  assert.match(fo[0], /if \(oldBusy\) return;/, 'findOld 도 겹쳐 부르면 안 됩니다.');
  assert.ok(!/btn\.disabled/.test(fo[0]), '없앤 단추를 아직 만지고 있습니다 — 터집니다.');
});

/* ── 칸 아래 띠(이유·이름·설명) 겹침 (대표 보고 2026-08-15:
   "경고표시는 이름 뒤에 묻혀서 잘 안 보인다") ── */

/* ⚠ 2026-08-16 다시 겨눔 — 이름 띠(.who)를 칸에서 뺐다(대표 지시).
   예전에는 「.wn.why ~ .who」·「.who ~ .cap」이라는 **띠 조합 하나하나**를 못 박고
   있었다. 띠 하나가 사라지자 검사 둘이 같이 깨졌는데, 정작 지켜야 할 것은
   그 조합이 아니라 **아래를 가로로 채우는 띠끼리 겹치지 않는다**는 것이다.
   그래서 「지금 있는 띠들끼리 자리가 갈려 있는가」로 바꿔 겨눈다. */
test('★ 칸 아래 띠끼리 겹치지 않는다', () => {
  // 지금 남은 가로 띠는 .wn.why(이유) · .cap(업체·설명) · .ttl(서류 제목) 셋이다.
  // 뒤에 그린 것이 앞엣것을 덮으므로, 겹칠 수 있는 짝마다 위로 올려 쌓아야 한다.
  assert.match(app, /#grid \.cell \.wn\.why ~ \.cap\{bottom:\s*\d+px\}/,
    '이유 띠(.wn.why) 뒤에 설명 띠(.cap)가 오면 이유가 덮여 안 보입니다.');
  assert.match(app, /\.cap ~ \.ttl\{bottom:\s*\d+px\}/,
    '설명 띠(.cap) 뒤에 제목 띠(.ttl)가 오면 설명이 덮여 안 보입니다.');
});

test('띠가 세 겹으로 쌓이지 않는다 — 폰에서 칸의 절반이 덮였다', () => {
  /* 대표 지시 2026-08-16: "서식·회사·담당자가 동시에 칸을 많이 차지한다".
     폰 칸이 104px 인데 20px 짜리 띠 셋이면 60px — **절반이 넘게** 덮였다.
     띠를 다시 늘리려는 변경을 여기서 막는다. */
  const three = app.match(/#grid \.cell [^{]*~[^{]*~[^{]*\{bottom:\s*(\d+)px\}/g) || [];
  const deep = three.filter(function (s) { return Number((s.match(/(\d+)px/) || [])[1]) >= 60; });
  assert.equal(deep.length, 0, '띠가 60px 이상 쌓이면 폰에서 그림이 절반도 안 남습니다: ' + deep.join(' '));
});

/* ── 본문 다시 올리기 (대표 지시 2026-08-15: "원본이 없습니다" 복구) ── */

test('★ 「원본이 없습니다」 안내에 다시 올리기 버튼이 있다', () => {
  const fn = app.match(/function showNoBody\([\s\S]*?\n\}/);
  assert.ok(fn, 'showNoBody 를 찾지 못했습니다.');
  assert.match(fn[0], /onclick="reuploadBody\(/,
    '안내 문구는 "사진만 다시 올려 주세요"라면서 실제로 누를 버튼이 없으면 할 수 있는 일이 없습니다.');
});

test('★ 다시 올리기는 addFiles(새 항목 만들기)가 아니라 replaceImage(있는 자리 채우기)를 쓴다', () => {
  const fn = app.match(/async function onReuploadFile\([\s\S]*?\n\}/);
  assert.ok(fn, 'onReuploadFile 를 찾지 못했습니다.');
  assert.match(fn[0], /PuPhotoStore\.replaceImage\(/,
    '새 id 로 항목을 새로 만들면 읽어 둔 내용(업체·설명·기업정보함 연결)을 잃습니다.');
  assert.doesNotMatch(fn[0], /queue\.enqueue\(/,
    '업로드 대기열을 타면 새 항목이 만들어져 원래 자리의 정보를 못 씁니다.');
});

test('다시 올릴 때도 서류·사진 크기 기준을 그대로 따른다', () => {
  const fn = app.match(/async function onReuploadFile\([\s\S]*?\n\}/)[0];
  assert.match(fn, /PuPhotoStore\.uploadSpec\(it\.meta\.kind === 'doc'\)/,
    '서류였던 사진을 다시 올릴 때 사진 기준(더 작은 크기)으로 줄이면 글자를 못 읽습니다.');
});

test('다시 올린 뒤에는 화면 캐시도 함께 채워 다시 열어도 빈손이 안 된다', () => {
  const fn = app.match(/async function onReuploadFile\([\s\S]*?\n\}/)[0];
  assert.match(fn, /it\.full = full/);
  assert.match(fn, /it\.thumb = thumb/);
});

/* ── 확인 필요 모아보기 · 여러 장 판독 ── */

test('다시 판독해도 검증 통과분은 자동으로 기업정보함에 간다', () => {
  // 예전에는 올릴 때만 자동이고 다시 판독하면 단추를 한 번 더 눌러야 했다.
  const fn = app.match(/function readPhoto\([\s\S]*?\n\}/);
  assert.ok(fn, 'readPhoto 본문을 찾을 수 없습니다');
  assert.match(fn[0], /read\.auto && canSend\(read\)/, '다시 판독 후 자동 등록이 없습니다');
  // 판독하는 길이 하나여야 두 길이 어긋나지 않는다
  /* ⚠ 고정 폭(400자)으로 잘랐다가 readAgain 에 「실패 셈 되돌리기」가 붙으며 창이
     못 닿았다(2026-08-24). 함수를 통째로 뽑는다 — 창 숫자를 키워 쫓아가지 않는다. */
  assert.match(cutFn(app, 'function readAgain('), /readPhoto\(id\)/,
    '「다시 판독」이 같은 길(readPhoto)을 안 씁니다');
});

test('확인이 필요한 것만 모아 볼 수 있다', () => {
  assert.match(app, /function needsCheck\(/);
  assert.match(app, /id="needBox"/);
  assert.match(app, /function toggleNeed\(/);
  assert.match(app, /확인 필요/);
});

test('확인 필요 판정에 아직 판독 안 한 것과 서류 아닌 것은 안 든다', () => {
  // 안 한 일과 어긋난 일은 다르다. 정말 서류가 아닌 사진은 읽을 것이 없다.
  /* ⚠ 2026-08-27: 판정이 checkWhy 한 곳으로 모였다(needsCheck 는 그것을 그대로 쓴다).
     「할 일이 아니다」는 이제 **빈 말을 내놓는 것**으로 나타난다. */
  const fn = app.match(/function checkWhy\([\s\S]*?\n\}/);
  assert.ok(fn, 'checkWhy 본문을 찾을 수 없습니다');
  assert.match(fn[0], /if \(!r\) return ''/);
  /* 'other' 는 **읽은 것이 있을 때만** 확인 필요다(2026-08-04 정교화).
     종류를 못 가렸어도 상호·사업자번호를 읽어낸 서류가 실제로 있고(지정서 등),
     그건 자동 등록 대상이 아니라 아무 곳에도 안 들어간 채 조용히 묻힌다.
     읽은 것이 없는 사진은 여전히 할 일이 아니다. */
  assert.match(fn[0], /kind === 'other'\) return readAnyField\(r\) \? '종류를 못 가림/);
  // 판독 실패·검증 걸림·아직 안 보낸 것은 든다
  assert.match(fn[0], /r\.error\) return readFailAdvice\(r\)/);
  assert.match(fn[0], /!r\.auto\) return '읽은 값이 미덥지 않음/);
  assert.match(fn[0], /filed && r\.filed\.id\)\) return '기업정보함에 아직 안 감/);
});

test('확인 필요 표시가 격자 칸에 바로 보인다', () => {
  /* ⚠ 2026-08-10 다시 겨눔 — 「확인 필요」만 볼 때는 ⚠ 대신 **왜 걸렸는지**를
     적는다(대표 보고: "어떻게 하라는 건가. 상황에 대한 판단이 안 선다").
     못 박을 것은 **칸에서 바로 보인다**는 것이지 글자가 ⚠ 인지가 아니다. */
  assert.match(app, /needsCheck\(it\)[\s\S]{0,240}<span class="wn/);
  assert.match(app, /<span class="wn">⚠<\/span>/, '평소에는 ⚠ 로 보여야 합니다.');
});

test('여러 장을 한꺼번에 판독할 수 있다', () => {
  assert.match(app, /function readSelected\(/);
  assert.match(app, /id="readSelBtn"/);
});

/* readSelected 안에 함수(step)가 하나 더 있어 정규식으로 끝을 잡으면 그 안쪽에서
   끊긴다. 시작 위치부터 넉넉히 잘라 본다. */
function bodyAfter(marker, len) {
  const i = app.indexOf(marker);
  assert.ok(i >= 0, marker + ' 를 찾을 수 없습니다');
  return app.slice(i, i + (len || 1600));
}

test('여러 장 판독은 한 번에 하나씩 부른다', () => {
  // AI 무료 등급은 분당 횟수가 정해져 있어 동시에 던지면 다 막힌다
  const body = bodyAfter('function readSelected(');
  assert.ok(!/Promise\.all/.test(body), '동시에 여러 장을 던지고 있습니다');
  assert.match(body, /step\(i \+ 1\)/, '차례로 부르지 않습니다');
});

test('여러 장 판독 중 한 장이 실패해도 나머지를 계속한다', () => {
  assert.match(bodyAfter('function readSelected('), /failed\+\+/);
});

/* ── 2단 화면 · 사진 지우기 ── */

/* 2026-08-10 다시 겨눔: 카메라 단추를 **없앴다**(대표 지시 "사진첩에 오른쪽
   아래 카메라 기능 전혀 필요없다. 삭제해서 제거해 달라").
   예전 검사는 「어느 기기에서 단추가 보이는가」를 못 박고 있었다 — 단추가
   없어졌으니 지킬 것도 바뀐다: **단추는 사라졌고 촬영은 남아 있어야 한다.** */
test('★ 사진첩에는 카메라 단추가 없다', () => {
  assert.ok(!/id="camBtn"/.test(app), '없애기로 한 단추가 아직 있습니다.');
  assert.ok(!/\$\('camBtn'\)/.test(app),
    '없는 단추를 부르면 그 줄에서 화면이 통째로 멎습니다(2026-08-08 흰 화면과 같은 사고).');
});

test('★ 그래도 촬영 기능은 살아 있다 — 기업정보함·포털이 불러 쓴다', () => {
  /* 단추만 없앤 것이지 촬영을 지운 것이 아니다. 지우면 명함 촬영이 통째로 죽는다. */
  assert.match(app, /function openCam\(/, '촬영을 여는 곳이 없어졌습니다.');
  assert.match(app, /function openCamIfAsked\(/, '?cam=1 로 들어오는 길이 없어졌습니다.');
  assert.match(app, /openCamIfAsked\(\);/, '들어와도 카메라를 안 켭니다.');
});

test('폰에서는 대시보드를 줄인다 — 사진이 화면 밖으로 밀리지 않게', () => {
  // 폰에서 버튼·안내가 위아래로 길게 쌓이면 사진을 보려고 스크롤해야 한다.
  assert.match(app, /@media \(max-width:899px\)/);
  const m = app.match(/@media \(max-width:899px\)\{([\s\S]*?)\n\}/);
  assert.ok(m, '폰 규칙을 찾을 수 없습니다');
  /* ⚠ 2026-08-10 다시 겨눔 — 카메라 단추를 없애면서 row2 에 「서류 고르기」만
     남았다. 두 칸으로 나누면 오른쪽이 빈 구멍이 된다(2026-08-06 에 실제로 그랬다).
     지킬 것은 「빈 칸이 생기지 않는다」이지 두 칸 규칙이 있는 것이 아니다. */
  assert.ok(!/\.row2\{display:grid;grid-template-columns:1fr 1fr/.test(m[1]),
    '단추가 하나뿐인데 두 칸으로 나누면 오른쪽이 빈 구멍이 됩니다.');
  /* ⚠ 2026-08-08 다시 겨눔 — 안내 세 덩어리(다섯 줄)를 **한 줄**로 합쳤다(대표 지시:
     "대시보드가 헷갈린다"). 그래서 폰 전용 짧은 안내(.dochint.s)와 .maxhint 가 없어졌다.
     지켜야 할 것은 「폰에서 안내가 자리를 안 먹는다」이지 특정 클래스가 있는 것이 아니다. */
  assert.match(m[1], /\.dochint[^\n]*display:none/);
  /* 상한 숫자는 스크립트가 UPLOAD_MAX 에서 채운다.
     마크업에 30을 박으면 상한을 바꿀 때 두 곳이 어긋난다.
     ⚠ 2026-08-10 다시 겨눔 — 안내가 ⓘ 팝업(openUpHelp)으로 옮겨 갔다.
        지킬 것은 **숫자를 코드에서 가져온다**이지 어느 칸에 적히는가가 아니다. */
  assert.match(app, /PuPhotoStore\.UPLOAD_MAX \+ '장/,
    '상한을 코드에서 안 가져오면 상한을 바꿀 때 안내와 실제가 어긋납니다.');
  assert.ok(!/30장/.test(app.replace(/\/\*[\s\S]*?\*\//g, '')),
    '상한 숫자가 화면에 박혀 있습니다');
  // PC 기본값은 종전대로(넓은 화면은 줄일 이유가 없다)
  assert.match(app, /#home \.row2\{display:block\}/);
  assert.match(app, /\.narrow-only\{display:none\}/);
});

test('넓은 화면은 왼쪽 대시보드 + 오른쪽 격자로 나뉜다', () => {
  assert.match(app, /<aside id="side">/);
  assert.match(app, /<main id="main">/);
  assert.match(app, /@media \(min-width:900px\)/);
  // 좁은 화면(폰)에서는 위아래로 쌓여야 한다 — 기본이 세로여야 한다
  const rule = app.match(/#home\{([^}]*)\}/);
  assert.ok(rule, '#home 규칙을 찾을 수 없습니다');
  assert.match(rule[1], /flex-direction:column/);
  // 격자 열 수는 폭에 따라 늘어난다(넓은 화면을 3칸으로 낭비하지 않는다)
  assert.match(app, /grid-template-columns:repeat\(auto-fill/);
});

test('사진을 지울 수 있다 — 한 장, 여러 장 모두', () => {
  assert.match(app, /function deleteOne\(/);
  assert.match(app, /function deleteSelected\(/);
  assert.match(app, /PuPhotoStore\.deletePhoto\(/);
});

test('지울 때는 반드시 확인을 받고 어디로 가는지 알린다', () => {
  for (const fname of ['deleteOne', 'deleteSelected']) {
    const fn = app.match(new RegExp('function ' + fname + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(fn, fname + ' 본문을 찾을 수 없습니다');
    assert.match(fn[0], /confirm\(/, fname + ' 이 확인 없이 지웁니다');
    assert.match(fn[0], /휴지통/, fname + ' 이 어디로 가는지 말하지 않습니다');
  }
});

test('기업정보함에 보낸 사진을 지울 때는 그 기록이 남는다고 알린다', () => {
  // 사진첩 사진과 기업정보함 레코드는 다른 물건이다 — 같이 지워지는 줄 알면 안 된다
  assert.match(app, /기업정보함 기록은 그대로 남습니다/);
});

test('체크는 늘 사진 오른쪽 위에 있고, 거기를 누르면 고른다', () => {
  // 「고르기」 단계를 먼저 밟지 않아도 바로 고를 수 있어야 한다(대표 지시).
  // 체크를 누르면 고르고, 사진의 다른 곳을 누르면 열린다.
  /* ⚠ 2026-08-24: Shift 를 누른 채면 범위 고르기로 간다(대표 승인 목업). 지킬 것은
     「체크를 누르면 고른다」이므로 그 갈림길까지 함께 본다. */
  const i = app.indexOf("if (ev.target.closest('.ck'))");
  assert.ok(i > 0, '체크를 누르는 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 260);
  assert.match(seg, /else toggleOne\(id\);/, '체크를 눌러도 안 골라집니다');
  assert.match(seg, /return;/, '체크를 눌렀는데 크게 보기까지 열립니다');
  // 체크가 숨어 있지 않아야 한다 — display:none 이면 누를 자리가 없다
  const rule = app.match(/#grid \.cell \.ck\{([^}]*)\}/);
  assert.ok(rule, '체크 규칙을 찾을 수 없습니다');
  assert.ok(!/display:none/.test(rule[1]), '체크가 숨어 있습니다: ' + rule[1]);
  assert.match(rule[1], /right:|top:/, '체크가 오른쪽 위에 없습니다: ' + rule[1]);
});

test('고른 것에 쓰는 단추는 왼쪽 끝에 있다', () => {
  // 대표 지시 — 판독·지우기·취소를 왼쪽에서 고를 수 있게.
  /* ⚠ 첫 </div> 까지 자르면 안 된다 — 윗줄 안에 찾기 칸(#findBar)이 들어와
     (2026-08-26) 거기서 잘려 단추가 하나도 안 잡혔다. 격자 앞까지 통으로 본다. */
  const gi = app.indexOf('<div id="gridBar">');
  const gend = app.indexOf('<div id="grid">');
  assert.ok(gi > 0 && gend > gi, 'gridBar 를 찾을 수 없습니다');
  const bar = [null, app.slice(gi, gend)];
  /* ⚠ 2026-08-28 다시 겨눔 — 고른 장수(gridCount)를 **맨 앞**으로 옮겼다(대표 승인 목업).
     읽는 차례가 「25장 고름 → 무엇을 할까」가 되게 한 것이다. 그래서 단추는 이제
     장수 «뒤»에 온다. 지킬 것은 그대로 — **고른 것에 쓰는 단추가 차례 고르개보다
     앞(왼쪽)에 있다.** */
  const iBtn = bar[1].indexOf('readSelBtn');
  const iSort = bar[1].indexOf('sortSeg');
  assert.ok(iBtn >= 0 && iSort >= 0, '단추나 차례 고르개가 없습니다');
  assert.ok(iBtn < iSort, '단추가 차례 고르개보다 뒤에 있습니다 — 왼쪽 끝이 아닙니다');
  /* 그리고 장수는 「☑ 전부」 바로 뒤·단추들보다 앞이라야 한다 */
  const iAll = bar[1].indexOf('selAllBtn');
  const iCount = bar[1].indexOf('gridCount');
  assert.ok(iAll < iCount && iCount < iBtn,
    '★ 고른 장수가 맨 앞이 아닙니다 — 무엇을 할지 먼저 보고 몇 장인지 나중에 알게 됩니다');
});

test('여러 장 지울 때 한 장이 실패해도 나머지를 지운다', () => {
  const fn = app.match(/function removeMany\([\s\S]*?\n\}/);
  assert.ok(fn, 'removeMany 본문을 찾을 수 없습니다');
  assert.match(fn[0], /catch/);
  assert.match(fn[0], /failed/);
});

/* ── 스캔·화면 캡처·끌어다 놓기 ── */

test('스캔 파일(PDF)을 받는다', () => {
  // 스캔은 대개 PDF 로 나온다. 서류 고르기에서 PDF 를 고를 수 있어야 한다.
  assert.match(app, /accept="[^"]*application\/pdf/);
  assert.match(app, /function pdfToPages\(/);
  // 기업정보함과 같은 판(pdf.js 3.11.174)을 쓴다 — 앱마다 다르면 캐시가 두 벌 된다
  assert.match(app, /pdf\.js\/3\.11\.174\/pdf\.min\.js/);
  assert.match(app, /workerSrc/);
});

test('여러 쪽 스캔은 쪽마다 한 건으로 갈라 담는다', () => {
  // 한 파일에 서류 여러 장을 스캔하는 일이 흔하다. 첫 쪽만 받으면 나머지를 잃는다.
  const fn = app.match(/function pdfToPages\([\s\S]*?\n\}/);
  assert.ok(fn, 'pdfToPages 본문을 찾을 수 없습니다');
  assert.match(fn[0], /numPages/);
  assert.match(fn[0], /PDF_MAX_PAGES/, '쪽 수 상한이 없으면 큰 파일에 앱이 멈충니다');
  // 상한을 넘겨 버릴 때 조용히 버리지 않는다
  assert.match(app, /PDF_MAX_PAGES[\s\S]{0,600}?쪽까지/);
});

test('스캔을 그릴 때 화면 갱신 신호를 기다리지 않는다', () => {
  // 기본값으로 두면 pdf.js 가 requestAnimationFrame 을 기다리는데, 그 신호는
  // **탭이 보이지 않을 때 오지 않는다** → 스캔을 올려두고 다른 탭으로 넘어가면
  // 올리기가 그대로 멈춘다. 화면에 보여줄 그림이 아니므로 print 로 그린다.
  assert.match(app, /intent: 'print'/);
});

test('마우스로 끌어다 놓을 수 있다', () => {
  assert.match(app, /addEventListener\('drop'/);
  assert.match(app, /addEventListener\('dragover'/);
  assert.match(app, /preventDefault/);
  // 끌고 오는 동안 받을 자리임을 보여준다
  assert.match(app, /id="dropzone"/);
});

test('화면을 캡처해 붙여넣을 수 있다', () => {
  assert.match(app, /addEventListener\('paste'/);
  assert.match(app, /clipboardData/);
});

test('끌어다 놓기·붙여넣기는 서류로 담는다', () => {
  // 스캔·화면 캡처가 주 용도라 글씨를 읽어야 한다 → 고화질(서류) 기준
  assert.match(app, /addFiles\([^)]*,\s*true[,)]/);
});

test('사진 열기에 예비 통로가 있다 — 브라우저마다 되는 방법이 다르다', () => {
  // 실사용 보고(2026-08-03): 폰 앱 내장 브라우저에서 "사진을 읽지 못했습니다".
  // 빠른 길(createImageBitmap)이 안 되면 <img> 로, 최신 바이트 읽기(arrayBuffer)가
  // 없으면 FileReader 로 돌아가야 한다. EXIF 읽기 실패는 올리기를 막으면 안 된다.
  assert.match(app, /function decodeViaImg\(/);
  assert.match(app, /URL\.createObjectURL\(/);
  assert.match(app, /function normalizedImageBlob\(/, '아이폰이 JPG 형식을 비워 보내면 보완해야 합니다');
  assert.match(app, /application\/octet-stream/, '일반 파일 형식으로 온 JPG도 받아야 합니다');
  assert.match(app, /readAsDataURL/, 'iOS 앱 내장 브라우저가 blob 주소를 막을 때 재시도해야 합니다');
  assert.match(app, /decodeViaObjectUrl\(file\)\.catch/, 'blob 주소 실패 뒤 data 주소로 재시도해야 합니다');
  assert.match(app, /readAsArrayBuffer/);
  assert.match(app, /readFileBytes\(f\)\.catch\(/, 'EXIF용 바이트 읽기 실패가 올리기를 막습니다');
});

test('촬영 시각은 저장 층의 우선순위 함수로 정한다', () => {
  // EXIF → 파일 날짜 → 업로드 시각. 판단이 화면에 흩어지면 앱마다 달라진다.
  assert.match(app, /PuPhotoStore\.pickTakenAt\(/);
  assert.match(app, /PuPhotoStore\.exifTakenAt\(/);
});

test('격자는 미리보기만 받는다 — 본문은 한 장 볼 때만', () => {
  assert.match(app, /PuPhotoStore\.loadThumb\(/);
  // 본문(1600~2560px)은 사진 한 장을 볼 때(크게 보기)와 다시 판독할 때만 받는다.
  // 격자 채우기(fillThumbs)나 목록 그리기(renderGrid)가 본문을 받으면
  // 사진 수십 장에 수십 MB를 내려받게 된다.
  for (const fname of ['fillThumbs', 'renderGrid']) {
    const body = app.match(new RegExp('function ' + fname + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(body, fname + ' 본문을 찾을 수 없습니다');
    assert.ok(!body[0].includes('loadFull('), fname + ' 이 사진 본문까지 받고 있습니다');
  }
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

/* ── 서류 판독 ── */

test('한 번에 올릴 장수 상한을 지키고, 넘치면 몇 장이 남았는지 알린다', () => {
  // 조용히 자르면 "왜 몇 장이 안 올라갔지"가 되고 그게 증빙 누락으로 이어진다.
  assert.match(app, /PuPhotoStore\.UPLOAD_MAX/);
  /* ⚠ 창 숫자(7200자)를 키워 쫓아가지 않는다 — addFiles 는 할 일이 늘 때마다
     길어진다. 함수를 통째로 뽑는다(tests/cut-fn.js). */
  const fn = cutFn(app, 'async function addFiles(');
  /* ⚠ 2026-08-24: 상한은 «고른 사진»에만 걸린다 — 문서에서 펼친 쪽은 「다시 골라
     주세요」가 불가능한 것이라 함께 세면 안 된다(photos-pdf-all-pages 참고).
     지킬 것은 「상한을 넘기면 받지 않고, 몇 장이 남았는지 말한다」이다. */
  assert.match(fn, /if \(shots < MAX\) \{ shots\+\+;[^}]*\} else over\+\+;/,
    '상한을 넘겨도 그대로 받습니다');
  assert.match(fn, /나머지 ' \+ over \+ '장은 다시 골라/, '남은 장수를 알리지 않습니다');
  // 안내 문구의 숫자도 저장 층에서 가져온다(두 곳에 적으면 어긋난다)
  assert.match(app, /'한 번에 ' \+ PuPhotoStore\.UPLOAD_MAX \+ '장까지/);
  assert.ok(!/한 번에 30장/.test(app), '화면에 숫자를 또 적었습니다 — 상한을 바꿀 때 어긋납니다');
});

test('올린 사진은 종류를 가리지 않고 스스로 판독한다', () => {
  // 대표 지시 — 「글자 판독하기」를 누를 일이 없어야 한다.
  // 명함인지 서류인지 회의사진인지는 AI 가 가린다.
  /* ⚠ 예전에는 ?v= 없는 모양 그대로를 봤다. 2026-08-15 판독기를 고치며 캐시
     방지 ?v= 를 붙이자 멀쩡한 코드에서 터졌다 — 볼 것은 「판독기를 싣는가」이지
     주소 뒤에 무엇이 붙었는가가 아니다.
     (?v= 와 판 번호가 어긋나지 않는지는 photos-doc-title.test.js 가 따로 지킨다) */
  assert.match(app, /<script src="js\/pu-doc-read\.js(\?v=\d+)?"><\/script>/);
  assert.match(app, /PuDocRead\.read\(/);
  /* ⚠ 2026-08-10 다시 겨눔 — 여러 쪽짜리는 마지막 쪽이 올라간 뒤 **문서마다
     한 번** 건다(대표 결정 "문서 통째로 한 번"). 지킬 것은 「사람이 단추를 누를
     일이 없다」이지 무엇을 인자로 넘기는가가 아니다. */
  assert.match(app, /queueRead\(sibs\[0\]\)/, '올린 것을 스스로 판독하지 않습니다');
  assert.ok(!/j\.kind === 'doc'\)\s*startRead/.test(app), '아직 서류만 판독합니다');
});

test('판독은 한 번에 하나씩 — 한꺼번에 던지지 않는다', () => {
  // AI 무료 등급은 분당 횟수가 정해져 있어 여러 장을 동시에 던지면 전부 막힌다.
  assert.match(app, /function pumpRead\(/);
  const fn = bodyAfter('function pumpRead(', 900);
  assert.match(fn, /if \(readBusy/, '동시에 여러 장이 돌 수 있습니다');
  assert.ok(!/Promise\.all/.test(fn), '동시에 던지고 있습니다');
});

test('이미 올라간 사진도 «눌러» 판독하되 상한을 두고 알린다', () => {
  assert.match(app, /function autoReadPending\(/);
  assert.match(app, /AUTO_READ_MAX/);
  /* ⚠ 2026-09-08 — 판독이 «누를 때만»으로 바뀌었다(대표 지시). 그래서 「남은 N장」을
       말하는 자리도 autoReadPending 에서 readWaitRun 으로 옮겼고, 문구도 달라졌다
       («다음에 열 때» → «한 번 더 눌러 주세요» — 이제 열어도 저절로 안 읽으므로
       옛 문구는 «틀린 말»이 된다).
     ★ 지켜야 할 것은 문구가 아니라 «상한에 걸려 남은 것을 조용히 버리지 않는가»다.
       그래서 「남은」과 «몇 장인지 세는 값»이 함께 있는지를 본다. */
  const 거는곳 = app.match(/function readWaitRun\([\s\S]*?\n\}/);
  assert.ok(거는곳, '★ 눌러서 거는 자리(readWaitRun)가 없습니다');
  assert.match(거는곳[0], /남은/, '★ 상한에 걸려 남은 것을 조용히 버리고 있습니다');
  assert.match(거는곳[0], /p\.rest/, '★ 「남은」이라 말만 하고 몇 장인지 안 셉니다');
  /* ⚠ 예전에는 여기서 viewingOther() 로 멈췄다. 그래서 다른 직원이 찍은 서류는
     그 직원이 자기 화면을 열 때만 읽혔다 — 대표 지시(2026-08-10)로 열었다.
     지금 무엇이 맞는지는 아래 「안 읽은 서류는 남의 사진첩에서도…」 검사가 지킨다. */
});

test('판독을 기다리는 줄은 사라지지 않는다', () => {
  // 진행이 안 보이면 멈춘 줄 안다(올리기는 3초 뒤 사라진다).
  assert.match(app, /_queuedRead \|\| j\._reading \|\| j\.state !== 'done'/);
  assert.match(app, /판독 차례 기다리는 중/);
});

test('AI 키를 화면이 직접 찾지 않는다 — 판독 층이 안다', () => {
  // 키 읽는 코드를 앱마다 복사하면 앱마다 다른 키를 보게 된다.
  // 게다가 화면에 다른 앱 루트 이름(pucards·data)이 들어오면 실데이터 가드가 깨진다.
  assert.match(app, /PuDocRead\.keysFrom\(/);
  assert.ok(!/geminiKey/.test(app), '화면이 AI 키 경로를 직접 알고 있습니다');
});

test('판독 결과는 사진 정보 아래 read 칸에만 저장한다', () => {
  assert.match(app, /PuPhotoStore\.saveRead\(/);
});

test('판독 결과를 한국어 한 줄로 만드는 함수가 하나다', () => {
  // 목록과 크게 보기가 서로 다른 문구를 쓰면 같은 서류가 두 가지로 보인다.
  assert.match(app, /function readLine\(/);
  const uses = [...app.matchAll(/readLine\(/g)];
  assert.ok(uses.length >= 3, '문구 함수를 화면 두 곳에서 함께 쓰지 않습니다');
});

test('일반 사진으로 올린 것도 판독할 수 있다', () => {
  // 실사용 보고(2026-08-03): 명함을 「사진 고르기」로 올렸더니 판독 버튼이
  // 아예 없어 읽을 방법이 없었다. 서류 버튼으로 올렸는지 여부는 화질 결정용일
  // 뿐이고, 나중에 "이거 명함이네" 하고 읽고 싶은 것은 사진 종류와 무관하다.
  const fn = app.match(/function renderReadPanel\([\s\S]*?\n\}/);
  assert.ok(fn, 'renderReadPanel 본문을 찾을 수 없습니다');
  assert.ok(!/kind !== 'doc'[\s\S]{0,80}innerHTML = ''/.test(fn[0]),
    '일반 사진에서는 판독 패널이 아예 안 나옵니다');
  assert.match(fn[0], /글자 판독하기/);
});

test('크게 보기에 판독 결과 패널과 다시 판독이 있다', () => {
  assert.match(app, /id="readPanel"/);
  assert.match(app, /function renderReadPanel\(/);
  assert.match(app, /function readAgain\(/);
  // 판독은 원판으로 읽어야 한다 — 미리보기(240px)로는 글씨가 안 보인다.
  // (다시 판독·여러 장 판독이 함께 쓰는 readPhoto 안에 있다)
  const one = app.match(/function readPhoto\([\s\S]*?\n\}/);
  assert.ok(one && one[0].includes('loadFull('), '판독이 미리보기로 읽고 있습니다');
});

test('판독 실패를 「서류로 보이지 않음」이라고 말하지 않는다', () => {
  // 실사용 보고(2026-08-03): 사업자등록증이 맞는데 AI가 답을 못 준 것을
  // '서류로 보이지 않음'으로 표시했다 — 사실이 아닌 안내였다.
  assert.match(app, /function readLabel\(/);
  const fn = app.match(/function readLabel\([\s\S]*?\n\}/);
  assert.ok(fn, 'readLabel 본문을 찾을 수 없습니다');
  assert.match(fn[0], /read\.error/, '실패 여부를 보지 않고 딱지를 정합니다');
  assert.match(fn[0], /판독 실패/);
  // 딱지 문구를 만드는 곳이 한 군데여야 한다 — 여러 곳이면 한쪽만 고쳐진다
  assert.ok(!/READ_LABEL\[read\.kind\]/.test(app.replace(/function readLabel\([\s\S]*?\n\}/, '')),
    'readLabel 밖에서 딱지 문구를 따로 만들고 있습니다');
});

test('판독 결과도 이스케이프해서 화면에 넣는다', () => {
  // AI가 돌려준 문자열을 그대로 넣으면 화면이 뚫린다
  assert.match(app, /esc\(readLine\(/);
  /* 값뿐 아니라 **이름표까지** — 2026-08-13 부터 이름표도 문서에서 읽어 온 말이다
     (「업체명」처럼 원본에 적힌 그대로). 우리가 지은 말이 아니므로 믿으면 안 된다. */
  const fn = app.match(/function renderReadPanel\([\s\S]*?\n\}/)[0];
  assert.match(fn, /esc\(r\[0\]\)/, '이름표를 안 걸렀습니다');
  assert.match(fn, /esc\(r\[1\]\)/, '값을 안 걸렀습니다');
});

/* ── 기업정보함으로 보내기 ── */

test('등록 층을 불러오고, 기업정보함 구조는 화면이 모른다', () => {
  /* ⚠ ?v= 없는 모양을 그대로 보던 검사였다 — 2026-08-17 등록 층을 고치며 캐시
     방지 ?v= 를 붙이자 멀쩡한 코드에서 터졌다(pu-doc-read 때와 같은 함정).
     볼 것은 「등록 층을 싣는가」이지 주소 뒤에 무엇이 붙었는가가 아니다. */
  assert.match(app, /<script src="js\/pu-doc-file\.js(\?v=\d+)?"><\/script>/);
  assert.match(app, /PuDocFile\.sendToCards\(/);
  // 화면에 기업정보함 루트 이름이 들어오면 실데이터 가드가 깨지고,
  // 기업정보함 구조가 두 곳에 흩어져 한쪽만 고쳐진다
  assert.ok(!/pucards/.test(app), '화면이 기업정보함 루트를 직접 알고 있습니다');
});

test('검증을 통과한 것만 자동으로 보낸다', () => {
  const fn = app.match(/function startRead\([\s\S]*?\n\}/);
  assert.ok(fn, 'startRead 본문을 찾을 수 없습니다');
  assert.match(fn[0], /read\.auto && canSend\(read\)/,
    '검증 결과를 보지 않고 보내고 있습니다');
});

test('중소기업확인서는 기업정보함 명함으로 «안» 간다 — 사업장 정보로 갈 물건이다', () => {
  /* ⚠ 예전에는 상수 전문을 글자로 박아 「card, bizreg 뿐」을 지켰다. 2026-08-31 에
     서식(form)이 늘자 깨졌다 — 서식의 «담당자»는 명함이 맞으므로 규칙이 바뀐 것이다.
     그런데 이 검사가 정말 막으려던 것은 «중소기업확인서(sme)»가 명함이 되는 일이다.
     그 뜻만 남긴다. */
  const m = app.match(/CARD_KINDS = \{[^}]*\}/);
  assert.ok(m, 'CARD_KINDS 를 찾을 수 없습니다');
  assert.ok(!/\bsme\b/.test(m[0]),
    '중소기업확인서가 명함으로 들어가면 회사 하나가 사람처럼 목록에 뜬다');
  assert.match(m[0], /card:\s*1/, '명함은 당연히 가야 한다');
  assert.match(m[0], /bizreg:\s*1/, '사업자등록증도 가야 한다');
  assert.match(app, /function canSend\(/);
});

test('같은 사진을 두 번 보내지 않는다', () => {
  const fn = app.match(/function canSend\([\s\S]*?\n\}/);
  assert.ok(fn, 'canSend 본문을 찾을 수 없습니다');
  assert.match(fn[0], /read\.filed/, '보낸 표시를 확인하지 않습니다');
});

test('보낼 때 사진 원판을 함께 보낸다', () => {
  // 기업정보함이 자기 사본을 가져야 사진첩을 정리해도 기록이 온전하다
  const fn = app.match(/function sendCards\([\s\S]*?\n\}/);
  assert.ok(fn, 'sendCards 본문을 찾을 수 없습니다');
  assert.match(fn[0], /loadFull\(/);
  assert.match(fn[0], /safeSrc\(/, '사진 값을 검사 없이 넘기고 있습니다');
});

test('걸린 것은 사람이 보낼 수 있게 단추를 준다', () => {
  assert.match(app, /function sendCardsNow\(/);
  assert.match(app, /기업정보함으로 보내기/);
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

test('휴지통 머리줄은 비어 있어도 남는다 — 숨으면 있는 줄도 모른다', () => {
  /* 본문 맨 아래로 옮겼어도 이 약속은 그대로다. 접혀 있을 뿐 늘 보여야 한다. */
  const fn = app.match(/function renderTrashBox\([\s\S]*?\n\}/);
  assert.ok(fn, 'renderTrashBox 본문을 찾을 수 없습니다');
  assert.ok(!/display\s*=/.test(fn[0]), '휴지통 머리줄을 숨기고 있습니다');
  assert.match(fn[0], /trashCount/);
  assert.match(fn[0], /비어 있습니다/, '비었을 때 그렇다고 말하지 않습니다');
  // #home 은 로그인 전에는 숨어 있어야 한다(설정·휴지통이 그 안에 있다)
  const home = app.match(/#home\{([^}]*)\}/);
  assert.match(home[1], /display:none/, '#home 이 로그인 전에도 보입니다');
});

test('휴지통은 열 때 비로소 불러온다', () => {
  /* 늘 불러오면 사진첩을 열 때마다 휴지통·지운기록까지 내려받아 첫 화면이 느려진다.
     8/6 에 접힘 → 제 화면이 되면서, 불러오는 자리도 showView 로 옮겼다. */
  const fn = app.match(/function showView\([\s\S]*?\n\}/);
  assert.ok(fn, 'showView 를 찾을 수 없습니다');
  assert.match(fn[0], /name === 'trash'[\s\S]*?loadTrash\(\)/,
    '휴지통 화면에 들어갈 때 불러오지 않습니다');
  assert.match(fn[0], /loadDelLog\(\)/, '지운 기록을 함께 불러오지 않습니다');
  // 처음에는 숨어 있어야 한다 — 사진 화면이 먼저다
  assert.match(app, /id="viewTrash" style="display:none"/, '휴지통이 열린 채 시작합니다');
});

test('휴지통은 대시보드 단추로 들어가고 장수가 늘 보인다', () => {
  /* 대표 지시(2026-08-06): 사진 화면 아래 접힘 → 제 화면.
     설정과 같은 방식이라 새로 배울 것이 없다. 장수는 **들어가 보지 않아도**
     알아야 하므로 단추에 붙는다. */
  assert.match(app, /id="trashBtn"[^>]*onclick="showView\('trash'\)"/,
    '대시보드에 휴지통 단추가 없습니다');
  assert.match(app, /id="trashCount"/);
  const fn = app.match(/function renderTrashBox\([\s\S]*?\n\}/);
  assert.ok(fn, 'renderTrashBox 를 찾을 수 없습니다');
  assert.match(fn[0], /trashCount/, '단추의 장수를 갱신하지 않습니다');
  assert.match(fn[0], /trashNote/, '화면 머리글을 갱신하지 않습니다');
  /* 비면 숫자를 지운다 — 0 이 붙어 있으면 눈에 걸린다 */
  assert.match(app, /\.setbtn \.n:empty\{display:none\}/, '빈 장수 뱃지를 숨기지 않습니다');
  /* 나가는 길이 있어야 한다 — 없으면 한 번 들어가면 못 나온다 */
  assert.match(app, /id="backBar"/);
  const sv = app.match(/function showView\([\s\S]*?\n\}/)[0];
  assert.match(sv, /backBar[\s\S]*?onPhotos \? 'none' : 'block'/,
    '휴지통에서 돌아가는 길이 안 보입니다');
});

test('지운 기록을 보여 준다 — 완전히 지운 뒤에도', () => {
  assert.match(app, /id="delLog"/);
  assert.match(app, /function loadDelLog\(/);
  assert.match(app, /PuPhotoStore\.listDelLog\(/);
  assert.match(app, /완전히 지움/);
});
/* ── 겹치는 서류 스스로 치우기 ──
   스스로 지우는 기능은 잘못 만들면 사람 자료를 없앤다. 세 가지를 못 박는다. */

test('더한 것이 없을 때만 치운다 — 빈 칸을 채웠으면 두어야 한다', () => {
  /* ⚠ 2026-09-03 — 종전에는 «파일에서 첫 .then(function (res)» 부터 훑었다.
     그 앞에 다른 .then(function (res) 가 하나 생기자(겹치는 서류 보내기) 그쪽을
     잡아 헛짚었다 — 기능은 멀쩡한데 검사만 울었다.
     **부르는 자리에서 거꾸로 짚는다** — 그 줄이 곧 이 규칙이 사는 곳이다. */
  const j = app.indexOf('dropRedundant(id, year, res)');
  assert.ok(j > 0, '중복 치우기를 부르는 곳을 찾을 수 없습니다');
  const near = app.slice(Math.max(0, j - 600), j);
  assert.match(near, /res\.redundant/, 'redundant 아닌 것도 치울 수 있습니다');
});

test('치우기 전에 판독 결과를 먼저 남긴다 — 순서가 바뀌면 고리가 끊긴다', () => {
  /* 인자 개수를 못 박지 않는다 — 주인(owner)이 붙는 등 늘어날 수 있다.
     여기서 볼 것은 **순서**뿐이다. */
  const i = app.indexOf('saveRead(year, id, read');
  const j = app.indexOf('dropRedundant(id, year, res)');
  assert.ok(i > 0 && j > i, '기록보다 치우기가 먼저입니다');
});

test('휴지통으로 보낸다 — 스스로 한 일은 되돌릴 수 있어야 한다', () => {
  const fn = app.match(/function dropRedundant\([\s\S]*?\n\}/);
  assert.ok(fn, 'dropRedundant 본문을 찾을 수 없습니다');
  assert.match(fn[0], /PuPhotoStore\.deletePhoto\(/, '휴지통을 거치지 않고 지웁니다');
  assert.match(fn[0], /중복/, '왜 치웠는지 기록에 남기지 않습니다');
  assert.match(app, /function undoDup\(/, '되살리는 길이 없습니다');
  assert.match(app, /PuPhotoStore\.restorePhoto\(/);
});

test('말없이 치우지 않는다 — 언제 겹친 것인지 화면에 남는다', () => {
  assert.match(app, /id="dupBox"/);
  assert.match(app, /function renderDupBox\(/);
  const fn = app.match(/function renderDupBox\([\s\S]*?\n\}/);
  assert.match(fn[0], /PuDocFile\.whenText\(/, '언제 저장된 것과 겹쳤는지 안 보여줍니다');
  assert.match(fn[0], /되살리기/);
});

test('지우기 확인 문구가 휴지통을 알린다 — 되돌릴 수 없다는 말은 거짓이다', () => {
  for (const fname of ['deleteOne', 'deleteSelected']) {
    const fn = app.match(new RegExp('function ' + fname + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(!/되돌릴 수 없/.test(fn[0]),
      fname + ' 이 휴지통이 있는데 되돌릴 수 없다고 말합니다');
    assert.match(fn[0], /TRASH_DAYS/, fname + ' 이 며칠 보관하는지 말하지 않습니다');
  }
  /* 반대로 **정말** 되돌릴 수 없는 두 곳(완전히 지우기·옛 자리 지우기)은
     그렇다고 말해야 한다. 여기서 겁을 덜 주면 사람이 자료를 잃는다. */
  const purge = app.match(/function purgeOneNow\([\s\S]*?\n\}/);
  assert.match(purge[0], /되돌릴 수 없/, '완전히 지우기가 위험을 알리지 않습니다');
});

test('왜 지웠는지를 지운 기록에 보여 준다', () => {
  const fn = app.match(/function loadDelLog\([\s\S]*?\n\}/);
  assert.match(fn[0], /r\.why/, '스스로 치운 이유가 기록 화면에 안 나옵니다');
});

function fnBodyOf(name) {
  const m = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 본문을 찾을 수 없습니다');
  return m[0];
}

/* ── 크게 보기: 좌우 분할 · 단추 압축 · 딱지 정직하게 (2026-08-04 대표 승인 목업) ── */

test('넓은 화면에서 사진과 판독을 좌우로 나눈다', () => {
  assert.match(app, /id="viewerBody"/);
  assert.match(app, /id="viewerPic"/);
  // 좁은 화면은 위·아래 — 좌우로 나누면 둘 다 못 본다
  const body = app.match(/#viewerBody\{[^}]*\}/)[0];
  assert.match(body, /flex-direction:column/, '기본이 좌우면 폰에서 둘 다 못 봅니다');
  /* 넓은 화면에서만 좌우로 바뀐다.
     ⚠ @media (min-width:900px) 블록이 파일에 여럿 있다(홈 배치·격자 열수 등).
     그냥 첫 블록을 잡으면 엉뚱한 곳을 검사한다 — #viewerBody 가 든 블록만 고른다. */
  const mq = (app.match(/@media \(min-width:900px\)\{[\s\S]*?\n\}/g) || [])
    .find(b => b.includes('#viewerBody'));
  assert.ok(mq, '크게 보기의 넓은 화면 규칙을 찾을 수 없습니다');
  assert.match(mq, /#viewerBody\{flex-direction:row\}/);
  assert.match(mq, /#viewerPic\{flex:1\.5/, '사진 자리가 판독보다 넓어야 합니다');
  /* 대표 지시(2026-08-06): 판독 정보가 사진 **왼쪽**에 선다.
     폰(세로 쌓임)은 사진이 먼저다 — order 는 넓은 화면 규칙 안에만 있어야 한다. */
  assert.match(mq, /#readPanel\{[^}]*order:-1/, '판독 정보가 사진 왼쪽에 있지 않습니다');
  const bodyRule = app.match(/#viewerBody\{[^}]*\}/)[0];
  assert.ok(!/order/.test(bodyRule), '기본 규칙에 order 가 섞였습니다 — 폰에서 정보가 사진 위로 온다');
});

test('판독 카드는 밝은색이다 — 어두운 화면에서 글이 잘 보여야 한다', () => {
  /* 대표 지시(2026-08-06): "밝은색 화면으로". 사진 뒤는 어두운 채로 두고
     판독 카드만 흰 바탕 — 사진은 어두운 바탕에서, 글은 밝은 바탕에서 잘 보인다. */
  assert.match(app, /#readPanel \.box\{background:#fff/, '판독 카드가 어두운 색입니다');
  assert.match(app, /#readPanel table\{[^}]*color:var\(--ink\)/, '판독 글자가 어두운 화면용 색입니다');
});

/* 2026-08-13 대표 지시로 바뀌었다 — "한 줄에 모든 셀 넣어달라".
   예전에는 두 칸 격자에 공유·지우기가 한 줄씩 통으로 차지해 석 줄이었고,
   판 아래가 길어져 정작 읽은 칸 표가 화면 밖으로 밀렸다.
   자세한 검사는 tests/photos-viewer-split.test.js 에 있다. */
test('단추는 한 줄에 모두 놓고, 지우기는 맨 끝에 틈을 두고 놓는다', () => {
  assert.match(app, /#readPanel \.acts\{position:sticky;top:0;z-index:3;display:flex/);
  const fn = app.match(/function actsRow\([\s\S]*?\n\}/);
  assert.ok(fn, 'actsRow 본문을 찾을 수 없습니다');
  // 지우기는 되돌리기 어려우니 맨 끝 + 앞에 틈 — 잘못 누르기 어렵게
  assert.match(fn[0], /class="rm"/);
  assert.ok(fn[0].indexOf('readAgain()') < fn[0].indexOf('deleteOne()'),
    '지우기가 맨 끝이 아닙니다');
  assert.match(app, /#readPanel \.acts \.rm\{[^}]*margin-left:5px/,
    '틈이 없으면 옆 단추를 누르려다 지웁니다');
});

test('공유 단추는 되는 기기에만 나온다 — PC 에 헛단추를 두지 않는다', () => {
  const fn = app.match(/function actsRow\([\s\S]*?\n\}/)[0];
  assert.match(fn, /canShareFiles\(\)/);
});

test('옛 단추 함수(dlRow)는 남겨두지 않는다', () => {
  // 둘이 함께 남으면 한쪽만 고쳐지고 화면이 갈린다.
  assert.ok(!/function dlRow\(/.test(app), 'dlRow 가 아직 남아 있습니다');
  assert.ok(!/dlRow\(\)/.test(app), 'dlRow 를 아직 부르고 있습니다');
});

/* ── 딱지 정직하게 ── */

test('읽어낸 것이 있으면 서류가 아니라고 말하지 않는다', () => {
  // 2026-08-04 대표 캡처: 상호·대표자·사업자번호를 다 읽고도 '서류로 보이지 않음'.
  const fn = app.match(/function readLabel\([\s\S]*?\n\}/);
  assert.ok(fn, 'readLabel 본문을 찾을 수 없습니다');
  assert.match(fn[0], /readAnyField\(read\) \? '기타 서류' : '서류로 보이지 않음'/);
  assert.match(app, /function readAnyField\(/);
});

test('딱지와 설명이 같은 말을 두 번 하지 않는다', () => {
  // 같은 캡처에서 '서류로 보이지 않음'이 나란히 두 번 찍혀 있었다.
  const fn = app.match(/function readTail\([\s\S]*?\n\}/);
  assert.ok(fn, 'readTail 본문을 찾을 수 없습니다');
  assert.match(fn[0], /if \(line === label\) return ''/);
  // 설명이 비면 칸 자체를 만들지 않는다(빈 딱지가 남지 않게)
  const panel = app.match(/function renderReadPanel\([\s\S]*?\n\}/)[0];
  assert.match(panel, /tail \? '<span class="msg'/);
});

test('종류를 못 가린 서류는 무엇을 하라고 알려 준다', () => {
  const fn = app.match(/function readLine\([\s\S]*?\n\}/)[0];
  assert.match(fn, /종류를 가리지 못했습니다/);
  assert.match(fn, /readAnyField\(read\)/);
});

/* ── 사진 확대 · 닫는 길 ── */

test('사진을 누르면 원본 크기, 바깥을 누르면 닫힌다', () => {
  const fn = app.match(/function picClick\([\s\S]*?\n\}/);
  assert.ok(fn, 'picClick 본문을 찾을 수 없습니다');
  assert.match(fn[0], /viewerImg/, '사진 자체를 눌렀는지 가리지 않습니다');
  /* ⚠ 「toggle('zoom') 이라고 적혀 있나」로 보지 않는다 — 2026-08-30 에 확대를
     «누른 자리로» 맞추면서 켜기와 끄기가 갈렸다. 지킬 것은 「눌러서 확대가
     켜지고 꺼진다」이지 어느 낱말로 적었는가가 아니다. */
  assert.match(fn[0], /classList\.(toggle|add)\('zoom'\)|zoomToPoint\(/,
    '눌러도 확대가 안 켜집니다');
  assert.match(fn[0], /classList\.(toggle|remove)\('zoom'\)/,
    '한 번 확대하면 «되돌릴 길»이 없습니다');
  assert.match(fn[0], /closeViewer\(\)/, '바깥을 눌러 닫는 길이 없습니다');
  assert.match(app, /#viewerPic\.zoom img\{max-width:none;max-height:none/);
});

test('닫는 길이 셋이다 — 단추·바깥 누르기·ESC', () => {
  // 사진을 눌러 닫던 길이 확대로 바뀌었으니 닫는 길을 잃으면 갇힌다.
  assert.match(app, /onclick="closeViewer\(\)">닫기/);
  assert.match(app, /onclick="picClick\(event\)"/);
  /* ⚠ 2026-08-10 다시 겨눔 — ESC 처리를 escOnce() 하나로 모았다.
     지킬 것은 「ESC 로도 닫힌다」이지 처리기가 어디에 적혀 있는가가 아니다. */
  const esc = app.match(/function escOnce\(\)[\s\S]*?\n\}/);
  assert.ok(esc && /if \(viewerId\) \{ closeViewer\(\); return; \}/.test(esc[0]),
    'ESC 로 크게 보기를 닫는 길이 없습니다.');
});

test('다음 사진을 열 때 확대가 풀려 있다', () => {
  // 확대한 채로 닫고 다른 사진을 열면 잘린 채로 보인다.
  const fn = app.match(/function closeViewer\([\s\S]*?\n\}/)[0];
  assert.match(fn, /classList\.remove\('zoom'\)/);
});

test('안내 문구가 실제 동작과 같다', () => {
  /* 예전 문구는 '누르면 닫힘'이었는데 이제 사진을 누르면 확대된다.
     ⚠ 문장을 «글자 그대로» 박지 않는다 — 손짓이 늘 때마다 문구도 늘어야 하는데,
       그때 검사가 「기능이 망가져서가 아니라」 깨진다. 세 가지 «뜻»만 본다. */
  const hint = /\$\('viewerHint'\)\.textContent = \(it && it\.meta\.w[\s\S]*?;/.exec(app);
  assert.ok(hint, '크게 보기 안내 줄을 찾을 수 없습니다');
  assert.match(hint[0], /원본 크기/, '눌러서 확대된다는 것을 안 알려 줍니다');
  assert.match(hint[0], /끌어서/,
    '★ 확대하면 한 귀퉁이만 듭니다 — 끌어서 움직일 수 있다는 것을 모르면\n' +
    '  「사진이 잘린 채로 나온다」가 됩니다 (대표 지시 2026-08-30)');
  assert.match(hint[0], /닫힘/, '닫는 길을 안 알려 줍니다');
  assert.ok(!/'누르면 닫힘'/.test(app), '옛 안내 문구가 남아 있습니다');
});

/* ── 사진첩 안에서 끈 사진이 다시 올라가던 버그 (2026-08-04 대표 보고) ── */

test('사진첩 안에서 끈 것은 받지 않는다 — 같은 사진이 또 올라가면 안 된다', () => {
  /* 격자의 사진(<img>)을 끌면 브라우저가 그 그림을 파일로도 함께 싣는다.
     그래서 'Files' 만 보고 판단하면 우리 드래그를 남의 파일로 오인해 재복사한다. */
  const fn = app.match(/function hasFiles\([\s\S]*?\n\}/);
  assert.ok(fn, 'hasFiles 본문을 찾을 수 없습니다');
  assert.match(fn[0], /PuDrag\.maybeOurs\(e\.dataTransfer\)\) return false/,
    '우리 드래그를 걸러내지 않습니다 — 재복사가 다시 생깁니다');
  // 놓는 순간에도 한 번 더 막는다(받는 자리가 안 열려도 drop 은 올 수 있다)
  const drop = app.match(/window\.addEventListener\('drop'[\s\S]*?\n\}\);/);
  assert.ok(drop, 'drop 처리기를 찾을 수 없습니다');
  assert.match(drop[0], /PuDrag\.maybeOurs/, '놓는 순간의 방어가 없습니다');
});

/* ── 지워지지 않는 「확인 필요」 (내가 PR #34 에서 만든 결함) ── */

test('사람이 확인한 것은 할 일에서 빠진다', () => {
  /* 사업자등록증인데 그 업체가 업체관리에 없으면 사진첩에서 할 수 있는 일이
     없는데도 계속 ⚠ 로 남았다. 치울 수 없는 할 일은 목록을 못 믿게 만든다. */
  /* ⚠ 2026-08-27: 판정이 checkWhy 한 곳으로 모였다 — 「빠진다」는 빈 말로 나타난다. */
  const fn = app.match(/function checkWhy\([\s\S]*?\n\}/);
  assert.ok(fn, 'checkWhy 본문을 찾을 수 없습니다');
  assert.match(fn[0], /if \(r\.ack\) return ''/, '확인해도 치워지지 않습니다');
  // 확인 표시는 판독 결과와 함께 서버에 남아야 다음에 열 때도 치워져 있다
  const ack = app.match(/function ackRead\([\s\S]*?\n\}/);
  assert.ok(ack, 'ackRead 본문을 찾을 수 없습니다');
  assert.match(ack[0], /PuPhotoStore\.saveRead\(/, '확인 표시를 저장하지 않습니다');
  assert.match(ack[0], /blockedIfOther\(/, '남의 사진에도 확인 표시를 남깁니다');
});

test('확인했음 단추는 할 일인 것에만 나온다', () => {
  // 할 일이 아닌 사진에까지 단추를 두면 무슨 뜻인지 알 수 없다.
  /* ⚠ 2026-08-29 부터 도구줄이 «사진 자체»도 봐야 한다(읽을 글자가 없는 사진에는
     판독을 안 보여 준다) — 그래서 인자가 하나 늘었다. 지키는 뜻은 그대로다:
     할 일인 것에만 ✓ 가 나온다. */
  assert.match(app, /actsRow\('다시 판독', needsCheck\(it\), it\)/);
  const fn = app.match(/function actsRow\([\s\S]*?\n\}/)[0];
  assert.match(fn, /showAck/);
  assert.match(fn, /확인했음/);
});

test('확인한 뒤에도 되돌릴 수 있다고 알려 준다', () => {
  // 되돌릴 길을 안 알리면 잘못 눌렀을 때 갇힌다.
  assert.match(app, /님이 확인해 할 일에서 치웠습니다/);
  assert.match(app, /「다시 판독」을 누르면 되돌아옵니다/);
});

/* ── 조용한 실패를 드러낸다 (2026-08-04 대표 보고: 직원이 올린 사진이 안 나온다) ── */

test('목록을 못 읽으면 그 이유를 화면에 적는다', () => {
  /* 예전엔 console.warn 만 하고 빈 화면을 보여줘서, 사진이 없는 것과
     못 읽은 것을 구별할 수 없었다 — "아직 올린 사진이 없습니다"는 거짓말이 된다. */
  const fn = app.match(/function loadGrid\([\s\S]*?\n\}/);
  assert.ok(fn, 'loadGrid 본문을 찾을 수 없습니다');
  assert.match(fn[0], /showGridError\(/, '실패 이유를 화면에 전하지 않습니다');
  const sg = app.match(/function showGridError\([\s\S]*?\n\}/);
  assert.ok(sg, 'showGridError 본문을 찾을 수 없습니다');
  // 클라우드가 준 말을 그대로 보여준다(우리 문구로 덮지 않는다)
  assert.match(sg[0], /pre\.textContent = why/);
  // 권한 문제면 무엇을 해야 하는지까지 알려준다
  assert.match(sg[0], /PERMISSION_DENIED/);
  assert.match(sg[0], /관리자에게 이 문구를 그대로/);
  // 다시 시도할 길이 있다
  assert.match(app, /id="emptyRetry"[\s\S]{0,80}onclick="loadGrid\(\)"/);
});

test('올릴 수 없는 상황이면 아무 말 없이 끝내지 않는다', () => {
  /* 사진을 골랐는데 화면에 아무 일도 없으면 사람은 올라간 줄 알고 넘어간다 —
     그게 증빙 누락이 된다. */
  const fn = app.match(/async function addFiles\([\s\S]*?\n  if \(!files\.length\) return;/);
  assert.ok(fn, 'addFiles 시작 부분을 찾을 수 없습니다');
  assert.match(fn[0], /로그인이 풀렸습니다/, '로그인 해제를 조용하게 넘깁니다');
  assert.match(fn[0], /사진 올리기를 준비하지 못했습니다/, '준비가 안 된 상태를 조용하게 넘깁니다');
  // 사진이 안 올라갔다는 것을 분명하게 말해야 다시 올린다
  assert.match(fn[0], /사진은 아직 올라가지 않았습니다/);
});

/* ── 업체관리로 보내기 ── */

test('사업자등록증·중소기업확인서는 업체관리에도 보낸다', () => {
  assert.match(app, /const CO_KINDS = \{ bizreg: 1, sme: 1 \}/);
  assert.match(app, /PuDocFile\.sendToCompany\(/, '업체관리로 보내지 않습니다');
  assert.match(app, /function sendCompanyNow\(/, '사람이 손으로 보낼 길이 없습니다');
});

test('기업정보함 보내기와 업체관리 보내기를 따로 둔다', () => {
  // 한 줄로 묶으면 한쪽이 실패할 때 다른 쪽도 못 간다.
  const s = fnBodyOf('startRead');
  assert.match(s, /canSend\(read\)/);
  assert.match(s, /canSendCo\(read\)/, '업체관리 자동 보내기가 없습니다');
});

test('중소기업확인서가 아무 곳에도 안 들어가면 확인 필요로 잡는다', () => {
  // 확인서는 기업정보함에 가지 않는다 — 이 줄이 없으면 조용히 묻힌다.
  /* ⚠ 2026-08-27 또 옮겼다 — 판정이 checkWhy 한 곳으로 모였다. */
  const fn = fnBodyOf('checkWhy');
  /* ⚠ 2026-08-11 다시 겨눔 — 판정을 coFilledOk 로 모았다(filled 가 실시간DB 에서
     사라져 화면이 멎던 사고). 지킬 것은 「업체관리 쪽 할 일을 잡는다」이지
     이 함수 안에서 filedCo 를 직접 읽는 모양이 아니다.
     ⚠ 2026-08-23 또 옮겼다 — 「업체가 아직 없다」는 기다림이라 coTodo 로 갈랐다.
       CO_KINDS 를 보는 곳도 그 안으로 들어갔다. */
  assert.match(fn, /coTodo\(r\)/, '업체관리 쪽 할 일을 안 따집니다');
  assert.match(app, /function coTodo\(read\)[\s\S]*?CO_KINDS\[read\.kind\]/,
    '갈래를 가리지 않으면 명함까지 업체관리 할 일이 됩니다');
  assert.match(app, /function coFilledOk\(read\)[\s\S]*?filedCo/, 'filedCo 를 보는 곳이 없습니다');
});

test('업체관리 결과를 기업정보함 결과와 따로 보여 준다', () => {
  const fn = fnBodyOf('renderReadPanel');
  assert.match(fn, /filedCo/, '업체관리 결과를 안 보여줍니다');
  assert.match(fn, /🏢/);
});

test('유효기간을 화면에 보여 준다 — 만료를 알 수 있어야 한다', () => {
  assert.match(app, /\['expiry', '유효기간'\]/);
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

test('포털 타일이 전 직원에게 열려 있다', () => {
  /* 2026-08-04 열었다. 그전에는 관리자만 보게 잠가 두었는데, 이유가 둘이었고
     둘 다 해소됐다.
       ① "빈 앱을 직원에게 보여주지 않는다" — 올리기·격자·크게보기·휴지통·
          설정·판독·자동등록이 모두 붙었다.
       ② 사람별 분리 전에는 서로의 사진이 보였다 — 규칙 게시·이사·최상위
          두 줄 삭제까지 끝나 이제 각자 자기 사진만 본다.
     ⚠ 다시 admin 으로 되돌리면 **직원은 앱을 찾을 길이 아예 없다**(포털
     타일이 유일한 입구다). 되돌리려면 그 대신 어떤 입구를 줄지 먼저 정할 것. */
  const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
  const line = portal.split('\n').find(l => l.includes("key:'photos'"));
  assert.ok(line, '사진첩 줄을 찾을 수 없습니다');
  assert.match(line, /roles:null/, '사진첩이 다시 관리자 전용으로 잠겼습니다');
});

/* ══════ 지우기 단추가 한 번 쓰고 죽던 버그 (2026-08-05 대표 보고) ══════ */

test('지우기 단추를 잠근 뒤 반드시 다시 풀어 준다', () => {
  /* 회귀 방지 — 2026-08-05 대표 보고: "지우기 기능 눌렀는데 안된다".
     deleteSelected() 가 delBtn.disabled = true 로 잠그는데 어디서도 풀지
     않아, 한 번 지운 뒤로는 영원히 죽은 단추가 됐다. 글자만 'N장 지우기'
     로 갱신되니 살아 있는 것처럼 보여 더 나빴다.
     형제인 downloadSelected() 는 마지막 .then 에서 disabled = false 로
     풀어 준다 — 그 짝을 맞춘다. */
  /* ⚠ 매개변수 «없는 꼴»을 못박지 않는다 — 2026-09-06 에 끌어 놓은 것을 받게 되어
     function deleteSelected(idsIn) 이 되자 이 검사가 본문을 통째로 못 찾았다.
     지키려는 것은 «잠그고 반드시 푸는가»이지 매개변수 개수가 아니다. */
  const fn = app.match(/function deleteSelected\([^)]*\)[\s\S]*?\n\}/);
  assert.ok(fn, 'deleteSelected 본문을 찾을 수 없습니다');
  assert.match(fn[0], /disabled = true/, '잠그는 줄이 없어졌습니다');
  assert.match(fn[0], /disabled = false/,
    '잠근 단추를 다시 풀어 주지 않습니다 — 한 번 지우면 죽은 단추가 됩니다');
});

test('지우기가 중간에 실패해도 단추가 풀린다', () => {
  /* 성공 경로에서만 풀어 주면, 지우다 실패했을 때 단추가 '지우는 중…' 으로
     굳는다. 되살릴 길이 없어 새로고침 말고는 방법이 없다. */
  /* ⚠ 매개변수 «없는 꼴»을 못박지 않는다 — 2026-09-06 에 끌어 놓은 것을 받게 되어
     function deleteSelected(idsIn) 이 되자 이 검사가 본문을 통째로 못 찾았다.
     지키려는 것은 «잠그고 반드시 푸는가»이지 매개변수 개수가 아니다. */
  const fn = app.match(/function deleteSelected\([^)]*\)[\s\S]*?\n\}/);
  assert.match(fn[0], /\.catch\(/,
    '지우기 뒤처리에 .catch 가 없습니다 — 실패하면 단추가 굳습니다');
});

/* ══════ 자기 사진을 다시 올리던 재복사 버그 (2026-08-05 대표 보고) ══════ */

test('앱 안의 모든 사진 그림은 끌 수 없다', () => {
  /* 회귀 방지 — 2026-08-05 대표 보고: "자꾸 자가 복제가 된다".
     창 전체(window)에 파일 받기가 걸려 있고, 우리 사진인지 가리는 유일한
     수단은 dragstart 에서 심는 표식이다. 그 dragstart 는 #grid 에만 걸려
     있어서, 격자 밖 그림(크게 보기·휴지통)을 끌면 표식이 없다.
     → 창이 '남이 준 파일'로 오해하고 그 사진을 새 번호로 다시 올린다.
       (끌어다 놓기 통로는 무조건 서류로 넣으므로 회의 사진이 「서류」 딱지를
        달고 복제됐다 — 대표 스크린샷의 증거다.)
     2026-08-04 에 격자 그림만 draggable="false" 로 막고 나머지를 놓쳤다.
     그림마다 잠그는 것을 잊지 않도록 검사로 못 박는다. */
  /* 속성이 하나라도 있는 것만 실제 그림으로 본다 — 주석 안의 <img> 같은
     글자를 잡으면 고칠 수 없는 검사가 되고, 그러면 다음 사람이 검사를 지운다. */
  /* ⚠ 2026-08-25 다시 겨눔 — **따옴표로 시작하는 <img> 는 우리 화면이 아니다.**
     밖으로 끌어낼 때 한글·워드가 읽을 「내용」으로 `'<img src="…">'` 라는 **글자**를
     만든다(dragOutImg·viewerDragOut). 저쪽 프로그램이 읽을 글이지 이 화면에 뜨는
     그림이 아니므로 draggable 을 붙일 자리가 없다 — 주석 속 글자를 안 세는 것과
     같은 까닭이다. 여기서 세면 고칠 수 없는 검사가 되고, 그러면 다음 사람이 지운다. */
  const imgs = [...app.matchAll(/(^|[^'"`])(<img\s[^>]*>)/g)].map(m => m[2]);
  assert.ok(imgs.length > 0, '<img> 를 하나도 찾지 못했습니다');
  /* ⚠ 2026-08-10 다시 겨눔 — 크게 보기 사진은 **밖으로 끌어낼 수 있어야 한다**
     (대표 지시: "다른 프로그램에 직접 넣을 수 있게"). 그래서 「아무것도 못 끈다」가
     아니라 **「끌 수 있으면 반드시 우리 표식을 심는다」** 로 바꾼다.
     재복사를 막는 것은 draggable 이 아니라 그 표식이다 — 표식이 있으면 창이
     「우리 것」으로 알아보고 파일로 받지 않는다. */
  const draggable = imgs.filter(t => !/draggable="false"/.test(t));
  const unmarked = draggable.filter(t => !/ondragstart=/.test(t));
  assert.deepEqual(unmarked, [],
    '표식 없이 끌 수 있는 그림이 남아 있습니다 — 끌면 그 사진이 다시 올라갑니다: ' + unmarked.join(' | '));
  /* 표식을 심는다고 적어 놓고 실제로 안 심으면 소용이 없다 */
  for (const t of draggable) {
    const h = (t.match(/ondragstart="([a-zA-Z0-9_$]+)\(/) || [])[1];
    assert.ok(h, '끄는 그림에 처리기 이름이 없습니다: ' + t);
    const fn = app.match(new RegExp('function ' + h + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(fn, h + ' 를 찾지 못했습니다.');
    assert.match(fn[0], /PuDrag\.set\(/,
      h + ' 가 우리 표식을 안 심습니다 — 창이 남의 파일로 오해해 다시 올립니다.');
  }
});

test('우리 화면에서 시작한 드래그는 파일로 받지 않는다', () => {
  /* 표식(MIME) 하나에만 기대면, 표식을 못 심는 자리나 표식을 지우는
     브라우저에서 재복사가 되살아난다. 그림마다 draggable="false" 를 붙이는
     것도 새 그림을 넣을 때 잊으면 끝이다.
     그래서 독립된 둘째 잠금을 둔다 — 이 화면 안에서 드래그가 시작됐다는
     사실을 기억해 두고, 그 드래그의 drop 은 파일로 받지 않는다. */
  assert.match(app, /dragstart[\s\S]{0,400}selfDrag\s*=\s*true/,
    '화면 안에서 드래그가 시작된 사실을 기억하지 않습니다');
  const drop = app.match(/addEventListener\('drop'[\s\S]*?\n\}\);/);
  assert.ok(drop, 'drop 처리부를 찾을 수 없습니다');
  assert.match(drop[0], /selfDrag/,
    'drop 이 우리 드래그인지 확인하지 않습니다 — 자기 사진을 다시 올립니다');
});

test('막힌 드래그 표시는 스스로 풀린다', () => {
  /* selfDrag 가 참으로 굳으면 **진짜 파일 놓기가 조용히 무시된다.**
     올린 줄 알고 넘어가면 증빙 누락이 되므로, 조용한 실패는 재복사보다 나쁘다.
     dragend·drop 없이 취소되는 드래그가 있으니 스스로 풀리는 길이 있어야 한다. */
  assert.match(app, /mousedown[\s\S]{0,120}selfDrag\s*=\s*false/,
    'selfDrag 가 굳으면 풀 길이 없습니다 — 파일 놓기가 조용히 막힙니다');
  assert.match(app, /dragend[\s\S]{0,120}selfDrag\s*=\s*false/,
    'dragend 에서 selfDrag 를 풀지 않습니다');
});

/* ══════ 연속촬영 (2026-08-06 대표 요청) ══════
   한 장 찍으면 닫히던 카메라를 — 셔터 연타로 모으고, 갤러리처럼 골라 한 번에 올린다. */

test('포털 카메라 진입은 앱 안 카메라만 열고 폰 확인형 카메라로 물러나지 않는다', () => {
  assert.doesNotMatch(app, /\$\('camBtn'\)/,
    '삭제된 사진첩 카메라 단추를 다시 호출하면 시작 중 오류가 납니다');
  assert.match(app, /function openCamIfAsked\(\)/,
    '포털과 기업정보함에서 카메라로 들어오는 길이 없습니다');
  const fn = app.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'openCam 을 찾을 수 없습니다');
  assert.match(fn[0], /navigator\.mediaDevices\.getUserMedia/);
  assert.doesNotMatch(fn[0], /camInput|\.click\(\)/);
});

test('카메라를 닫으면 반드시 끈다 — 안 끄면 녹화 표시가 남고 배터리를 먹는다', () => {
  const fn = app.match(/function camStop\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'camStop 을 찾을 수 없습니다');
  assert.match(fn[0], /getTracks\(\)[\s\S]*?stop\(\)/, '카메라 트랙을 멈추지 않습니다');
  const dis = app.match(/function camDiscard\(\)[\s\S]*?\n\}/);
  assert.match(dis[0], /camStop\(\)/, '닫을 때 카메라를 끄지 않습니다');
  assert.match(dis[0], /revokeObjectURL/, '미리보기 주소를 안 지워 메모리가 샙니다');
});

test('✕는 찍어 둔 사진을 말없이 버리지 않는다', () => {
  const fn = app.match(/function closeCam\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'closeCam 을 찾을 수 없습니다');
  assert.match(fn[0], /camShots\.length && !confirm/, '찍은 것이 있는데 묻지 않고 버립니다');
});

test('올리기는 addFiles 단일 통로만 탄다', () => {
  /* 여기서 따로 enqueue 하면 통로가 갈라져 다음 사람이 한쪽만 고치게 된다 —
     축소·대기열·재시도·자동 판독을 전부 기존 통로로 태운다. */
  const fn = app.match(/async function camUpload\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'camUpload 을 찾을 수 없습니다');
  /* ⚠ 2026-08-08 다시 겨눔 — 배송표를 만들면서 세 번째 인자(카메라에서 온 것 표시)가
     붙었다. 지켜야 할 것은 **addFiles 통로를 탄다**는 것이지 인자 개수가 아니다. */
  /* ⚠ 2026-08-08 또 다시 겨눔 — 카메라 사진을 **서류 화질**로 담게 되면서 둘째 인자가
     false → true 로 바뀌었다(명함 글자를 읽어야 한다). 지켜야 할 것은 **통로를 탄다**는
     것이지 인자 값이 아니다. 화질 자체는 camera-card-crop.test.js 가 따로 본다. */
  assert.match(fn[0], /addFiles\(files, (?:true|false)[,)]/, 'addFiles 통로를 타지 않습니다');
  assert.ok(!/queue\.enqueue/.test(fn[0]), '대기열에 직접 넣고 있습니다 — 통로가 갈라집니다');
});

test('폰 저장 실패가 올리기를 막지 않는다', () => {
  /* 클라우드 증빙이 먼저다 — 내려받기가 막혀도(권한·용량) 올리기는 계속돼야 한다. */
  const fn = app.match(/async function camUpload\(\)[\s\S]*?\n\}/);
  assert.match(fn[0], /try \{ saveBlob\([\s\S]*?\} catch/, '폰 저장 실패가 올리기를 끊습니다');
});

test('연속촬영도 한 번에 올리는 상한을 지킨다', () => {
  const fn = app.match(/async function camShoot\([^)]*\)[\s\S]*?\n(?:async )?function/);
  assert.ok(fn, 'camShoot 을 찾을 수 없습니다');
  assert.match(fn[0], /PuPhotoStore\.UPLOAD_MAX/, '상한 없이 무한정 찍힙니다');
});

test('검토 화면은 갤러리처럼 전부 고른 상태로 시작한다', () => {
  /* 대표 폰 화면 방식 — 기본은 다 올리고, 흐린 것만 눌러 뺀다. */
  assert.match(app, /camShots\.push\(\{[^}]*sel: true/, '찍은 사진이 기본으로 골라져 있지 않습니다');
  const fn = app.match(/function camToggle\([\s\S]*?\n\}/);
  assert.ok(fn, 'camToggle 을 찾을 수 없습니다');
});

test('카메라 영상은 아이폰에서 전체화면으로 납치되지 않는다', () => {
  assert.match(app, /<video id="camVid" autoplay playsinline muted>/,
    'playsinline·muted 가 없으면 아이폰에서 영상이 전체화면으로 열리거나 재생이 막힙니다');
});

/* ── 전체 근로자 사진 (관리자 전용, 2026-08-06 대표 지시) ── */

test('누구 사진 고르개에 전체 근로자 항목이 있다', () => {
  const fn = app.match(/function renderOwnerPick\([\s\S]*?\n\}/);
  assert.ok(fn, 'renderOwnerPick 본문을 찾을 수 없습니다');
  assert.match(fn[0], /ALL_OWNERS/, '전체 근로자 항목이 없습니다');
});

test('전체 근로자를 고르면 사람마다 모아 합치는 함수를 쓴다', () => {
  const fn = app.match(/function loadGrid\([\s\S]*?\n\}/);
  assert.ok(fn, 'loadGrid 본문을 찾을 수 없습니다');
  assert.match(fn[0], /PuPhotoStore\.listYearAll\(/, '전체 근로자용 목록 함수를 안 씁니다');
  /* 전체 근로자 화면에서는 판독 대기열을 돌리지 않는다 — 남의 사진을 자동으로 건드리면 안 된다.
     ⚠ 2026-08-08 다시 겨눔 — 「나와 공유된 사진」(SHARED_OWNER)이 생기면서 조건이
     둘로 늘었다. 지켜야 할 것은 **남의 사진에는 자동 판독을 안 돌린다**는 것이다. */
  assert.match(fn[0], /gridOwner !== ALL_OWNERS[\s\S]{0,60}autoReadPending/);
  assert.match(fn[0], /gridOwner !== SHARED_OWNER[\s\S]{0,40}autoReadPending/,
    '공유받은 사진에도 자동 판독을 돌리면 안 됩니다 — 남의 사진입니다');
});

test('누가 올렸는지 사진을 열면 나온다', () => {
  /* ⚠ 2026-08-16 다시 겨눔 — 칸의 이름 띠(.who)를 뺐다(대표 지시: 띠 셋이
     폰에서 칸의 절반을 덮었다). 그래서 「칸에 보인다」는 이제 틀린 못이다.
     지킬 것은 자리가 아니라 **누가 올렸는지 알 수 있는가**다 —
     이름은 `__ownerName` 한 곳에만 있어서, 아무 데도 안 그리면 알 길이 사라진다. */
  /* ⚠ 글자를 찾지 않고 **함수를 돌린다** — 「__ownerName 이 있나」로는 못 잡는다.
     조건만 죽여도(`m.__ownerName ?` → `false ?`) 뒤쪽 문자열에 낱말이 남아 통과한다.
     실제로 이 뮤테이션이 한 번 살아남았다. */
  const i = app.indexOf('function whenBox(');
  const body = app.slice(i, app.indexOf('\n}', i) + 2);
  const whenBox = new Function('whenText', 'dayKey', 'esc', body + '\nreturn whenBox;')(
    function () { return '때'; }, String, String);
  assert.match(whenBox({ meta: { __ownerName: '김보람', upAt: 1786000000000 } }), /김보람/,
    '사진을 열어도 올린 사람이 안 나오면 누구 것인지 알 길이 없습니다.');
});

test('전체 근로자 화면에서 사진을 받을 때 그 사람 자리로 정확히 찾아간다', () => {
  /* gridOwner 하나만 쓰면 '전체'(__all__) 자체를 계정으로 착각해 엉뚱한 경로를 읽는다.
     ⚠ 2026-08-13 다시 겨눔 — 예전에는 __ownerUid 라는 «낱말»이 있는지만 봤다.
       그래서 `it.meta.__ownerUid || gridOwner` 처럼 표를 거르지 않는 코드도 통과했고,
       실제로 방금 올린 사진(주인 없음 + 화면은 __all__)이 검은 화면으로 떴다.
       지킬 것은 「거르는 함수를 거쳤는가」다 — photoOwner()·photoYearOf(). */
  const sites = ['downloadOne', 'shareOne', 'downloadSelected', 'openViewer'];
  sites.forEach(function (name) {
    const fn = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(fn, name + ' 본문을 찾을 수 없습니다');
    assert.match(fn[0], /photoOwner\(/, name + ' 이 주인을 거르지 않고 넘깁니다 (photoOwner 를 거쳐야 합니다)');
    assert.match(fn[0], /photoYearOf\(/, name + ' 이 화면의 해로 찾습니다 (photoYearOf 를 거쳐야 합니다)');
    assert.doesNotMatch(fn[0], /\|\|\s*gridOwner/, name + ' 이 아직 gridOwner 를 그대로 씁니다');
  });
});

/* 사진이 놓인 해는 «사진의 성질»이지 화면의 성질이 아니다.
   받은 사진은 주인의 해(2025 등)에 있는데 화면은 늘 올해를 두드려
   본문도 미리보기도 못 찾아 통째로 까맣게 나왔다 (2026-08-13 김보람 제보). */
test('사진마다 제 해에서 본문을 찾는다 — 화면의 해로 두드리지 않는다', () => {
  assert.match(app, /function photoYearOf\(/, '사진의 해를 찾는 함수가 없습니다');
  const fn = fnBody('photoYearOf');
  assert.match(fn, /__year/, 'photoYearOf 가 사진에 새겨진 해를 안 봅니다');
  assert.match(fn, /__sharedYear/, 'photoYearOf 가 받은 사진의 해를 안 봅니다');
  // 미리보기도 같은 길을 타야 한다 — 본문만 고치면 칸은 여전히 비어 보인다
  assert.match(fnBody('fillThumbsOneByOne'), /photoYearOf\(/, '미리보기가 화면의 해로 찾습니다');
  // 방금 올린 사진에도 주인·해가 바로 새겨져야 한다 (새로고침 전에도)
  const add = fnBody('addToGrid');
  assert.match(add, /__ownerUid/, '방금 올린 사진에 주인이 안 붙습니다');
  assert.match(add, /__year/, '방금 올린 사진에 해가 안 붙습니다');
});

test('전체 근로자를 보는 중에는 업로드·삭제가 잠긴다 — 남의 것이라서', () => {
  const fn = app.match(/function viewingOther\([\s\S]*?\n\}/);
  assert.ok(fn, 'viewingOther 본문을 찾을 수 없습니다');
  // ALL_OWNERS 도 '내 계정'과 다르므로 이 식 하나로 자연히 막힌다
  assert.match(fn[0], /gridOwner !== PuPhotoStore\.myUid\(\)/);
});

test('전체 근로자 화면에서는 휴지통·백업·지운 기록을 볼 수 없다 — 사람별 기능이라서', () => {
  ['backupYear', 'loadTrash', 'loadDelLog'].forEach(function (name) {
    const fn = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n(?=function )'));
    assert.ok(fn, name + ' 본문을 찾을 수 없습니다');
    assert.match(fn[0], /gridOwner === ALL_OWNERS/, name + ' 이 전체 근로자 상태를 가리지 않습니다');
  });
});

/* ── 직접 만드는 분류(대표 지시 2026-08-06: "종류를 추가할 수 있는 기능") ── */

test('탭 줄에 「+ 분류 추가」가 있다', () => {
  assert.match(app, /class="add" onclick="openAddKind\(\)"/);
});

test('직접분류는 대표 분류가 되어 이전 AI 분류와 중복 표시되지 않는다', () => {
  const fn = app.match(/function tabsOf\([\s\S]*?\n\}/)[0];
  assert.match(fn, /it\.meta\.customKind/);
  assert.match(fn, /return \[customTabKey\(ck\)\]/, '직접분류 하나만 반환하지 않습니다');
  assert.doesNotMatch(fn, /out\.push\(customTabKey/, '이전 분류에 직접분류를 더해 중복 표시합니다');
});

test('직접분류 탭도 순서 목록·장수 세기에 들어간다', () => {
  const order = app.match(/function kindOrder\(\)[\s\S]*?\n\}/)[0];
  assert.match(order, /allTabKeys\(\)/, 'kindOrder 가 직접분류를 모릅니다');
  const counts = app.match(/function tabCounts\(\)[\s\S]*?\n\}/)[0];
  assert.match(counts, /allTabKeys\(\)/, 'tabCounts 가 직접분류 칸을 0으로 안 채웁니다');
  assert.match(counts, /tabsOf\(it\)\.forEach/, '대표 분류의 개수를 세지 않습니다');
});

test('새 분류 만들기 — 이름을 물어보고 만들자마자 그 탭으로 넘어간다', () => {
  const fn = app.match(/function submitAddKind\([\s\S]*?\n\}/);
  assert.ok(fn, 'submitAddKind 본문을 찾을 수 없습니다');
  assert.match(fn[0], /PuPhotoStore\.addCustomKind\(/);
  assert.match(fn[0], /pickKind\(customTabKey\(r\.id\)\)/, '만든 분류로 바로 넘어가지 않습니다');
});

test('분류 이름이 비면 거절하고 만들지 않는다', () => {
  const fn = app.match(/function submitAddKind\([\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(!name\)/);
  assert.match(fn, /showKindErr/);
});

test('분류 지정은 남의 사진(전체 근로자 포함)에는 못 한다', () => {
  const fn = app.match(/function openAssignKind\([\s\S]*?\n\}/);
  assert.ok(fn, 'openAssignKind 본문을 찾을 수 없습니다');
  assert.match(fn[0], /if \(blockedIfOther\(.*\)\) return;/);
  /* 남의 사진에서는 단추 자체가 안 보인다.
     ⚠ 2026-08-28 다시 겨눔 — 업체 지정·공유가 같은 갈래에 붙으면서 한 줄짜리가
       목록 돌리기로 바뀌었다. 지킬 것은 「남의 사진에서는 분류 지정이 안 보인다」이지
       그 줄이 어떤 글자인가가 아니다. */
  const bar = app.match(/function renderGridBar\([\s\S]*?\n\}/)[0];
  /* ⚠ 2026-08-28 또 옮겼다 — 판정이 mayTouch 한 곳으로 모였다(화면과 막는 쪽이
     같은 기준을 쓰게). 지킬 것은 「손댈 수 없으면 분류 지정이 안 보인다」이다. */
  const i = bar.indexOf('if (!touch)');
  assert.ok(i > 0, '남의 사진 갈래를 못 찾았습니다');
  assert.match(bar.slice(i, i + 300), /'tagBtn'[\s\S]{0,80}display = 'none'/,
    '★ 손댈 수 없는데도 분류 지정이 보입니다');
});

test('분류 지정은 항목별 실제 소유자 자리에 쓴다', () => {
  /* 2026-08-10 다시 겨눔 — 옮기는 일이 retagPhotos 한 곳으로 모였다.
     지켜야 할 것은 「그 사진의 진짜 주인 자리에 쓴다」이지, 어느 함수에 있느냐가
     아니다. 남의 자리에 쓰면 조용히 실패하거나 남의 사진을 건드린다. */
  const fn = app.match(/function retagPhotos\([\s\S]*?\n\}/);
  assert.ok(fn, 'retagPhotos 본문을 찾을 수 없습니다');
  /* ⚠ 2026-09-05 — 해도 주인도 «사진의 성질»이라 photoYearOf·photoOwner 로 바뀌었다.
     여기서 지키는 것은 「올린 사람 자리에 쓴다」이지 그 글자가 무엇인가가 아니다.
     gridOwner 는 '__all__' 같은 표일 수 있어 그대로 넘기면 없는 자리를 두드린다. */
  assert.match(fn[0], /setCustomKind\(photoYearOf\(id\), id, custom, photoOwner\(id\)\)/,
    '직접분류를 올린 사람 자리가 아닌 곳에 씁니다');
  assert.ok(!/gridOwner/.test(fn[0]),
    '★ gridOwner 는 사람 아이디가 아닐 수 있습니다 — 없는 자리에 씁니다');
  assert.match(fn[0], /setPrimaryKind\(photoYearOf\(id\), id, read, null, photoOwner\(id\)\)/,
    '판독 결과와 이전 직접분류 해제를 올린 사람 자리에 함께 쓰지 않습니다');
});

test('★ 눌러서 지정하는 길과 끌어다 놓는 길이 같은 한 곳을 쓴다', () => {
  /* 대표 보고(2026-08-10): 사업자등록증으로 옮길 수가 없었다. 원인이 이것이다 —
     끌기는 「종류가 하나뿐인 칸」만, 누르기는 「직접 만든 분류」만 받아서
     사업자등록증은 **양쪽 모두에서** 빠져 있었다. 두 길을 갈라 두면 또 어긋난다. */
  const fn = app.match(/function submitAssignKind\([\s\S]*?\n\}/);
  assert.ok(fn, 'submitAssignKind 본문을 찾을 수 없습니다');
  assert.match(fn[0], /retagPhotos\(ids, val\)/, '누르는 길이 제 나름대로 저장하고 있습니다');
  assert.ok(!/PuPhotoStore\.setCustomKind\(/.test(fn[0]),
    '누르는 길이 따로 저장하면 한쪽만 고쳐집니다');
});

test('크게 보기에서 분류를 뗄 수 있다 — 지정은 되돌릴 수 있어야 한다', () => {
  assert.match(app, /function customKindNote\(/);
  assert.match(app, /function removeCustomKindOne\(/);
  const fn = app.match(/function removeCustomKindOne\([\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(blockedIfOther\(.*\)\) return;/);
  assert.match(fn, /PuPhotoStore\.setCustomKind\(photoYearOf\(id\), id, null/);
});

test('찾기(검색)에 직접분류 이름도 걸린다', () => {
  const fn = app.match(/function hayOf\([\s\S]*?\n\}/)[0];
  assert.match(fn, /CUSTOM_KINDS\[m\.customKind\]/, '직접분류 이름이 찾기 대상에 없습니다');
});

test('로그인하면 분류 목록을 불러온다', () => {
  assert.match(app, /loadCustomKinds\(\);/);
  const fn = app.match(/function loadCustomKinds\([\s\S]*?\n\}/)[0];
  assert.match(fn, /PuPhotoStore\.listCustomKinds\(\)/);
});

/* ══════ 사진을 탭으로 끌어 분류 바꾸기 · 틀고정 · 다시 판독 (2026-08-06 대표 지시) ══════ */

test('사진을 탭에 끌어다 놓으면 분류가 바뀐다', () => {
  /* AI가 잘못 가린 것을 사람이 한 번에 바로잡는 길. */
  assert.match(app, /let photoDragIds = null/, '끌고 있는 사진을 기억하지 않습니다');
  const ds = app.match(/\$\('grid'\)\.addEventListener\('dragstart'[\s\S]*?\n\}\);/);
  assert.ok(ds, '격자 dragstart 를 찾을 수 없습니다');
  assert.match(ds[0], /photoDragIds =/, '격자에서 끌 때 사진 번호를 안 싣습니다');
  /* 고른 것이 있으면 한꺼번에 옮긴다 — 한 장씩 열 번 끄는 것보다 낫다 */
  assert.match(ds[0], /selected\.size && selected\.has\(id\)/, '고른 여러 장을 함께 옮기지 않습니다');
  const fn = app.match(/function retagPhotos\([\s\S]*?\n\}/);
  assert.ok(fn, 'retagPhotos 를 찾을 수 없습니다');
  assert.match(fn[0], /PuPhotoStore\.setPrimaryKind\(/, '바꾼 분류를 저장하지 않습니다');
});

test('분류를 바꿔도 읽어 둔 항목은 살린다', () => {
  /* 분류가 틀렸다고 읽은 내용(이름·전화 등)까지 틀린 것은 아니다.
     Object.assign 으로 기존 read 위에 kind 만 덮어야 한다. */
  const fn = app.match(/function retagPhotos\([\s\S]*?\n\}/)[0];
  assert.match(fn, /Object\.assign\(\{\}, it\.meta\.read/, '읽어 둔 결과를 통째로 버리고 있습니다');
  /* 사람이 정한 것이므로 「확인 필요」에서 빠지고, 다시 판독이 도로 뒤집지 않아야 한다 */
  assert.match(fn, /ack: true/, '사람이 정한 분류가 「확인 필요」에 계속 남습니다');
  assert.match(fn, /auto: false/, '사람이 정한 것을 기계가 정한 것으로 적고 있습니다');
});

/* 어느 칸에 놓을 수 있나 — 진짜로 돌려서 본다.
   ⚠ 2026-08-10 이 검사가 「kinds.length === 1」이라는 **적는 방식**을 붙들고
      있었다. 그래서 사업자등록증·기타서류가 막혀 있는 것을 「올바름」으로 지켰다.
      지켜야 할 것은 「전체사진에는 못 넣는다」이지 그 판별식이 아니다. */
function bootRetag(customKinds) {
  const ctx = {
    CUSTOM_KINDS: customKinds || {},
    KIND_TABS: null
  };
  vm.createContext(ctx);
  const tabs = app.match(/const KIND_TABS = \[[\s\S]*?\n\];/);
  assert.ok(tabs, 'KIND_TABS 를 찾을 수 없습니다');
  vm.runInContext(tabs[0].replace('const ', 'var '), ctx);
  ['isCustomTab', 'canRetag', 'kindForTab'].forEach(function (n) {
    const m = app.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\r?\\n\\}'));
    assert.ok(m, n + ' 를 찾을 수 없습니다');
    vm.runInContext(m[0], ctx);
  });
  return ctx;
}

test('★ 「전체사진」에는 못 넣는다 — 분류가 아니라 모아 보기다', () => {
  const c = bootRetag();
  assert.equal(c.canRetag('all'), false,
    '모아 보기에 「넣는다」는 말은 성립하지 않습니다.');
  assert.equal(c.kindForTab('all'), null);
});

test('★ 사업자등록증·기타서류에도 넣을 수 있다 (대표 보고 2026-08-10)', () => {
  /* 이 둘이 막혀 있어서 "분류가 안 되는 서류들을 사업자등록증으로 옮기려는데
     분류 지정이 안 된다"가 됐다. 사람이 그 칸을 고르면 그건 분명한 뜻이다. */
  const c = bootRetag();
  assert.equal(c.canRetag('bizreg'), true, '사업자등록증으로 옮길 길이 막혀 있습니다.');
  assert.equal(c.kindForTab('bizreg'), 'bizreg', '두 종류 중 어느 것으로 넣을지 안 정해 뒀습니다.');
  assert.equal(c.canRetag('other'), true, '「그냥 기타로 둬라」도 분명한 뜻입니다.');
  assert.equal(c.kindForTab('other'), 'other');
});

test('★ 「전체사진」 말고는 모든 칸이 사진을 받는다', () => {
  const c = bootRetag();
  const tabs = c.KIND_TABS.filter(function (t) { return t.key !== 'all'; });
  assert.ok(tabs.length >= 6, '칸이 너무 적습니다: ' + tabs.length);
  tabs.forEach(function (t) {
    assert.equal(c.canRetag(t.key), true, '「' + t.label + '」로 옮길 수 없습니다.');
  });
});

test('없는 직접분류에는 못 넣는다', () => {
  const c = bootRetag({ k1: { name: '자문등록계약서' } });
  assert.equal(c.canRetag('custom:k1'), true);
  assert.equal(c.canRetag('custom:없는것'), false, '지워진 분류로 옮기면 사진이 사라집니다.');
});

test('놓을 자리가 눈에 보인다', () => {
  assert.match(app, /#kinds button\.drop\{/, '놓을 자리 표시가 없습니다');
  assert.match(app, /function markDropTab\(/);
});

test('★ 「분류 지정」 목록에 놓을 수 있는 칸이 모두 나온다', () => {
  /* 대표 보고(2026-08-10): 여기에 직접 만든 분류만 나와서 사업자등록증을
     고를 수가 없었다. 화면 위 칸과 같은 목록이어야 한다. */
  const fn = app.match(/function openAssignKind\([\s\S]*?\n\}/);
  assert.ok(fn, 'openAssignKind 본문을 찾을 수 없습니다');
  assert.match(fn[0], /kindOrder\(\)\.filter\(canRetag\)/,
    '고정 칸을 빼고 직접분류만 보여 주면 사업자등록증으로 옮길 길이 없습니다');
  assert.ok(!/Object\.keys\(CUSTOM_KINDS\)/.test(fn[0]),
    '직접분류만 훑고 있습니다');
  assert.match(fn[0], /__new__/, '새 분류 만들기 길이 없어졌습니다');
});

test('분류 탭과 찾기 줄은 스크롤해도 위에 붙어 있다', () => {
  /* 사진이 수십 장이면 아래로 내려간 뒤 탭을 누르려고 다시 맨 위로 올라와야 했다. */
  /* ⚠ 붙어 있어야 하는 것은 «찾기가 들어 있는 줄»이다. 2026-08-26 에 찾기·도구·안내
     세 줄을 한 줄(#gridBar)로 합치면서 그 줄이 #findBar 에서 #gridBar 로 바뀌었다. */
  assert.match(app, /#kinds\{position:sticky;top:0/, '분류 탭이 고정되지 않습니다');
  const sticky = app.match(/#(?:findBar|gridBar)\{[^}]*position:\s*sticky[^}]*\}/g) || [];
  assert.equal(sticky.length, 1,
    '윗줄이 하나가 아닙니다(' + sticky.length + ') — 둘을 붙이면 서로 겹치거나 헛돕니다');
  const top = sticky[0];
  const id = top.match(/#(\w+)\{/)[1];
  /* ⚠ display:contents 인 칸은 «칸이 아니라» 붙지 않는다 — 규칙만 적고 아무것도 안 붙는다 */
  assert.ok(!/display:\s*contents/.test(top),
    '#' + id + ' 는 칸 노릇을 안 하는데(display:contents) 붙이라고 적었습니다 — 아무것도 안 붙습니다');
  const holder = app.match(new RegExp('<div id="' + id + '">[\\s\\S]{0,400}?id="yearSel"'));
  assert.ok(holder, '붙어 있는 줄 안에 해 고르개가 없습니다 — 엉뚱한 줄을 붙였습니다');
  /* 배경이 없으면 사진이 밑으로 비쳐 글씨를 덮는다 */
  assert.match(app, /#kinds\{position:sticky[^}]*background:var\(--bg\)/, '분류 탭이 투명합니다');
  assert.match(top, /background:var\(--bg\)/, '찾기 줄이 투명합니다');
  /* 폰에서는 🔍 를 누르기 전까지 «찾기만» 접는다 — 그 손잡이가 .hidden 이다.
     손잡이가 없어지면 첫 화면에서 찾기 칸이 한 줄을 도로 먹는다. */
  assert.match(app, /#findBar\.hidden\{display:none\}/, '폰에서 찾기를 접는 손잡이가 없습니다');
  assert.match(app, /classList\.toggle\('hidden', phone && !phoneFindOn\)/,
    '접는 손잡이를 아무도 걸지 않습니다');
  /* 찾기 줄이 붙을 자리는 탭 높이를 **실제로 재서** 채운다 — 숫자를 박으면
     탭이 두 줄이 되는 폰에서 찾기 줄이 탭을 덮는다 */
  assert.match(app, /function syncStickyTop\(\)/);
  assert.match(app, /setProperty\('--kindsH'/);
  const rk = app.match(/function renderKindTabs\(\)[\s\S]*?\n\}/);
  assert.match(rk[0], /syncStickyTop\(\)/, '탭을 다시 그린 뒤 높이를 안 잽니다');
});

test('옛 판 판독기로 읽은 사진은 스스로 다시 읽는다', () => {
  /* 회의사진·급여서류를 가르치기 전에 읽힌 사진이 'other' 로 굳어 기타서류에
     영원히 남았다(2026-08-06 대표 화면: 회의사진 0장, 기타서류 6장).
     사람이 한 장씩 「다시 판독」을 눌러야만 풀리는 것은 자동 분류가 아니다. */
  /* 2026-08-13 부터 판정이 둘로 갈렸다 — 안 읽은 것(neverRead)과 옛 판으로 읽은
     것(staleRead). 옛 판 다시 읽기는 **한 번에 몇 장만** 한다(비용).
     자세한 검사는 tests/photos-read-budget.test.js 에 있다. */
  const fn = app.match(/function staleRead\([\s\S]*?\n\}/);
  assert.ok(fn, 'staleRead 를 찾을 수 없습니다');
  /* ⚠ 2026-08-24: 판 번호가 둘로 갈렸다 — 다시 읽는 것은 «물음이 바뀐 판»만 본다
     (읽는 길만 바꿔도 읽어 둔 것 전부가 다시 읽히던 것을 막았다).
     지킬 것은 「옛 판으로 읽은 것을 스스로 다시 읽는다」이지 어느 번호를 보느냐가
     아니다. 자세한 것은 tests/photos-reread-only-when-useful.test.js. */
  assert.match(fn[0], /PuDocRead\.PROMPT_VERSION/, '판독기 판 번호를 보지 않습니다');
  assert.match(fn[0], /r\.ack/, '사람이 확인한 것까지 도로 뒤집습니다');
  const auto = app.match(/function autoReadPending\([\s\S]*?\n\}/);
  assert.match(auto[0], /filter\(staleRead\)/, '자동 판독이 옛 결과를 안 집어 옵니다');
  assert.match(auto[0], /filter\(neverRead\)/, '자동 판독이 안 읽은 사진을 안 집어 옵니다');
  // 읽을 때마다 어느 판으로 읽었는지 적어야 다음에 비교할 수 있다
  assert.match(app, /rv: PuDocRead\.READ_VERSION/, '판독 결과에 판 번호를 안 적습니다');
});

/* ══════ 카메라 초점·명함틀·장수 (2026-08-06 대표 보고: "초점이 정확하게 안 잡힌다") ══════ */

test('화면을 누르면 그 자리에 초점을 잡는다', () => {
  /* 명함처럼 평평하고 무늬가 적은 것은 자동 초점이 헤맨다 — 사람이 짚어 주는
     길이 필요하다(리멤버 방식). 푸른카메라에 있던 것을 연속촬영에도 가져왔다. */
  assert.match(app, /onclick="camTapFocus\(event\)"/, '미리보기에 초점 누르기가 없습니다');
  const fn = app.match(/async function camTapFocus\([\s\S]*?\n\}/);
  assert.ok(fn, 'camTapFocus 를 찾을 수 없습니다');
  assert.match(fn[0], /pointsOfInterest/, '누른 지점을 카메라에 넘기지 않습니다');
  assert.match(fn[0], /focusMode: 'single-shot'/);
  /* 누른 자리를 눈으로 확인시켜 준다 — 초점이 늦어도 반응은 즉시여야 한다 */
  assert.match(fn[0], /camFocus/, '누른 자리 표시가 없습니다');
});

test('못 하는 기기에는 초점·손전등을 아예 안 보여 준다', () => {
  /* 눌러도 아무 일이 없는 단추는 헛기대만 만든다. */
  const fn = app.match(/async function openCam\([\s\S]*?\n\}/)[0];
  assert.match(fn, /getCapabilities/, '기기가 무엇을 받아 주는지 안 보고 있습니다');
  assert.match(fn, /camCanTorch = !!caps\.torch/);
  assert.match(fn, /\$\('camTorch'\)\.style\.display = camCanTorch \? 'block' : 'none'/,
    '손전등을 못 켜는 기기에서도 단추가 보입니다');
  const tap = app.match(/async function camTapFocus\([\s\S]*?\n\}/)[0];
  assert.match(tap, /if \(!camTrack \|\| !camCanFocus\) return;/,
    '초점을 못 잡는 기기에서도 동그라미가 뜹니다');
});

test('명함틀을 켜면 그 안만 잘라 담는다', () => {
  /* 화면 전체를 담으면 책상·바닥까지 들어가 같은 용량에 글씨가 작아진다.
     회의·현장 사진은 넓게 담아야 하므로 켜고 끌 수 있어야 한다(대표 선택). */
  /* camShoot 은 안에 중첩 블록이 많아 첫 `\n}` 로는 끝을 못 잡는다 —
     다음 함수 선언이 나오기 전까지를 본문으로 본다. */
  const fn = app.match(/async function camShoot\([^)]*\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.ok(fn, 'camShoot 를 찾을 수 없습니다');
  /* ⚠ 2026-08-10 다시 겨눔 — 틀은 **명함이 보일 때만** 뜬다(showFrame).
     그리는 것과 자르는 것이 같은 판단을 써야 엉뚱한 데가 안 잘린다. */
  assert.match(fn[0], /if \(showFrame\(\)\)/, '틀을 쓰는지 안 봅니다');
  assert.match(fn[0], /drawImage\(src, cx, cy, cw, ch, 0, 0, cw, ch\)/, '잘라 담지 않습니다');
  /* 미리보기는 object-fit:cover 라 화면 좌표와 원본 좌표가 다르다 */
  assert.match(fn[0], /object-fit:cover|Math\.max\(e\.width \/ v\.videoWidth/,
    '화면 좌표를 원본 좌표로 옮기지 않습니다');
  /* 넘치면 검은 띠가 담긴다 */
  assert.match(fn[0], /Math\.min\(Math\.round\(fw\), sw - cx\)/, '자를 범위를 화면 안으로 가두지 않습니다');
  // 일반사진은 틀 없음, 명함·서류를 골랐을 때만 틀을 쓴다
  assert.match(app, /function frameOn\(\) \{ return camCaptureMode === 'document'; \}/);
  assert.match(app, /id="camModePhoto"[^>]*setCamCaptureMode\('photo'\)/);
  assert.match(app, /id="camModeDocument"[^>]*setCamCaptureMode\('document'\)/);
});

test('몇 장 찍었는지, 그리고 상한이 가까운지 알 수 있다', () => {
  /* ⚠ 2026-08-27 대표 지시: "캡쳐3 표시가 필요하나 … 불필요하게 있는것 같다" —
     윗줄에 늘 떠 있던 「📸 3장 찍었습니다」를 걷었다. 장수는 아래 왼쪽 사진에
     붙는 「n장」 딱지와 완료 단추가 들고 있다(tests/photos-cam-aim.test.js).
     여기서 지키는 것은 **두 가지 소식이 사라지지 않는 것**이다:
       ① 몇 장 찍었는지가 어디엔가 있다  ② 상한이 다가온다는 예고가 있다. */
  const fn = app.match(/function renderCamStrip\([\s\S]*?\n\}/)[0];
  assert.match(fn, /more\.textContent = n \+ '장'/, '장수를 아무 데서도 안 알려 줍니다');
  assert.match(fn, /\$\('camDone'\)\.innerHTML = n \?/, '완료 단추가 장수를 안 들고 있습니다');
  /* 상한이 가까우면 남은 수를 알려 준다 — 다 차고 나서 알면 늦다 */
  assert.match(fn, /장 더/, '상한이 가까울 때 남은 수를 안 알립니다');
  assert.match(fn, /다 찼습니다/);
});

test('손전등을 켜 둔 채 카메라를 끄지 않는다', () => {
  /* 기기에 따라 불이 남는다. */
  const fn = app.match(/function camStop\([\s\S]*?\n\}/)[0];
  assert.match(fn, /torch: false/, '손전등을 끄지 않고 카메라를 닫습니다');
  assert.match(fn, /camTrack = null/, '트랙 참조가 남습니다');
});

/* ══════ 다른 직원이 찍은 서류도 기업정보함으로 (2026-08-10 대표 지시) ══════
   "중복되는것은 제외하더라도 추가로 다른 직원이 사진찍은 데이터는 입력이 되어야 한다".

   그동안은 「남의 사진은 보기만」(viewingOther) 하나가 **판독까지** 막아,
   다른 직원이 찍은 명함은 그 직원이 자기 화면을 열고 있을 때만 기업정보함에 갔다.
   판독·기업정보함 보내기는 남의 사진에서도 되어야 하고, **지우기·올리기는 여전히
   막혀 있어야 한다** — 이 둘을 함께 못 박는다. */

/* 함수 본문 하나를 떠온다 — 들여쓰기 없는 function 선언만 쓴다.
   정규식으로 짜면 [\s\S] 같은 조각이 셸·편집기를 거칠 때 깨진다. 글자로 자른다. */
function fnBody(name) {
  const head = '\nfunction ' + name + '(';
  const i = app.indexOf(head);
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = app.indexOf('\n}', i);
  assert.ok(j > i, name + ' 본문의 끝을 찾을 수 없습니다');
  return app.slice(i, j + 2);
}

test('안 읽은 서류는 남의 사진첩에서도 스스로 판독된다', () => {
  const fn = fnBody('autoReadPending');
  assert.ok(!/viewingOther\(\)/.test(fn),
    '남의 사진에서 판독이 멈춰 있습니다 — 그 직원이 열 때까지 기업정보함에 안 갑니다');
});

test('「다시 판독」·「여러 장 판독」은 남의 사진에서도 눌린다', () => {
  assert.ok(!/blockedIfOther\(/.test(fnBody('readAgain')), 'readAgain 이 남의 사진을 막습니다');
  assert.ok(!/blockedIfOther\(/.test(fnBody('readSelected')), 'readSelected 가 남의 사진을 막습니다');
});

test('올리기·지우기는 특정 다른 직원의 사진 화면에서 막는다', () => {
  /* 전체 근로자 화면의 업로드는 내 자리로 저장되므로 허용한다. 특정 직원 한 명의
     화면에서는 PC·모바일 단추뿐 아니라 실제 저장 입구까지 함께 막아야 한다. */
  assert.match(fnBody('deleteSelected'), /blockedIfOther\(/, '남의 사진을 지울 수 있습니다');
  assert.match(app, /async function openCam\([\s\S]{0,360}?viewingOnlyOther\(\)/,
    '특정 직원 화면에서 카메라가 열립니다');
  assert.match(fnBody('phUpload'), /viewingOnlyOther\(\)/, '특정 직원 화면에서 모바일 올리기가 열립니다');
  assert.match(fnBody('startCollect'), /viewingOnlyOther\(\)/, '특정 직원 화면에서 문서 모으기가 열립니다');
  assert.match(app, /async function addFiles\([\s\S]{0,900}?viewingOnlyOther\(\)/,
    '파일 저장 입구에서 특정 직원 화면 업로드를 막지 않습니다');
  /* ⚠ 2026-09-03 다시 겨눔 — 목록을 «글자 그대로» 박아 두었더니, 시트의
     phUpBtn 을 걷어내고 윗줄 phUpTopBtn 을 넣는 «옳은 고침»에 검사가 걸렸다.
     지킬 것은 이름표가 아니라 「폰·PC 의 올리는 단추가 같은 기준으로 잠기는가」다. */
  const 잠금 = app.match(/\[('[\w]+',?\s*)+\]\.forEach\(function \(id\)[\s\S]{0,200}?viewingOnlyOther\(\)/);
  assert.ok(잠금, 'PC·모바일 올리기 단추를 한 기준으로 잠그는 자리가 없습니다');
  for (const id of ['docBtn', 'collectBtn', 'phCollectBtn'])
    assert.ok(잠금[0].indexOf("'" + id + "'") > 0, id + ' 이 잠금 목록에서 빠졌습니다');
  assert.match(잠금[0], /'ph[\w]*Up[\w]*'/,
    '★ 폰에서 올리는 단추가 잠금 목록에 없습니다 — 남의 사진을 보는 중에도 눌립니다');
  assert.ok(!/'camBtn'/.test(잠금[0]),
    '없앤 단추(camBtn)를 부르면 그 줄에서 멎습니다');
});

test('판독은 사진 주인 자리에서 본문을 받고 그 자리에 결과를 쓴다', () => {
  const fn = fnBody('readPhoto');
  /* ⚠ 2026-08-10 다시 겨눔 — 여러 쪽짜리는 쪽마다 주인을 따로 본다
     (photoOwner(p.id)). 지킬 것은 「주인 자리를 본다」이지 변수 이름이 아니다. */
  /* 인자 안에 괄호가 들어갈 수 있다 — loadFull(photoYearOf(id), id, photoOwner(id)).
     [^)]* 로는 첫 닫는 괄호에서 끊겨 멀쩡한 코드도 못 알아본다 (2026-08-13). */
  assert.match(fn, /loadFull\([\s\S]{0,120}?photoOwner\(/, '남의 사진 본문을 못 찾습니다 (주인을 안 넘깁니다)');
  /* ⚠ 여기도 인자 안에 괄호가 들어왔다 — saveRead(photoYearOf(id), id, read, photoOwner(id)).
     [^)]* 는 photoYearOf 의 닫는 괄호에서 끊겨 멀쩡한 코드를 못 알아본다
     (바로 위 loadFull 에서 2026-08-13 에 이미 겪은 그것이다). */
  assert.match(fn, /saveRead\([\s\S]{0,120}?photoOwner\(/, '판독 결과가 내 자리에 저장됩니다');
  assert.match(app, /function photoOwner\(/, '사진 주인을 찾는 함수가 없습니다');
  /* 「전체 근로자」·「받은 사진」 표를 사람 아이디로 넘기면 없는 자리를 두드린다 */
  assert.match(fnBody('photoOwner'), /ALL_OWNERS/, 'photoOwner 가 화면 표를 걸러내지 않습니다');
  assert.match(fnBody('photoOwner'), /SHARED_OWNER/, 'photoOwner 가 화면 표를 걸러내지 않습니다');
});

test('기업정보함 보내기도 사진 주인 자리를 본다', () => {
  const fn = fnBody('sendCards');
  assert.match(fn, /loadFull\([^)]*owner/, '남의 사진 본문을 못 받아 기업정보함에 못 보냅니다');
  assert.match(fn, /saveRead\([^)]*owner/, '보낸 표시가 내 자리에 저장됩니다');
});

test('남의 사진은 중복이어도 스스로 치우지 않는다', () => {
  /* 남의 사진을 말없이 휴지통에 넣으면 그 사람은 왜 없어졌는지 알 수 없다.
     내 사진일 때만 치운다 — 판독 잠금을 푸는 대가로 반드시 함께 있어야 한다. */
  const fn = fnBody('dropRedundant');
  assert.match(fn, /isMinePhoto\(/, '남의 사진까지 치울 수 있습니다');
  /* 걸러내기가 deletePhoto **앞**에 있어야 한다 — 뒤면 이미 지운 뒤다 */
  assert.ok(fn.indexOf('isMinePhoto(') < fn.indexOf('deletePhoto('),
    '지운 다음에 내 것인지 봅니다');
});
