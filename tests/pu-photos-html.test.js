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
  /* classList.add/remove/toggle 같은 화면 조작은 DB 쓰기가 아니다 —
     그것까지 막으면 검사가 엉뚱한 곳에서 걸려 신뢰를 잃는다. 먼저 걷어낸 뒤 본다. */
  const noDom = app
    .replace(/classList\.(add|remove|toggle)\(/g, 'CLASSLIST(')
    .replace(/selected\.(add|delete|clear|has)\(/g, 'SET(')
    .replace(/PuDrag\.set\(/g, 'DRAG(')        // 끌어놓기 데이터 담기 — DB 쓰기가 아니다
    .replace(/dataTransfer\.setData\(/g, 'DRAG(');
  for (const call of ['.set(', '.update(', '.remove(']) {
    assert.ok(!noDom.includes(call), '화면이 클라우드에 직접 쓰고 있습니다: ' + call);
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

test('올릴 크기는 저장 층이 정한다 — 화면이 숫자를 갖지 않는다', () => {
  // 서류 2560 / 사진 1600. 폰·PC·당겨오기 창이 같은 값을 써야 하므로
  // 숫자는 PuPhotoStore.uploadSpec 한 곳에만 있어야 한다.
  assert.match(app, /PuPhotoStore\.uploadSpec\(/);
  assert.match(app, /shrink\(f, spec\.maxEdge, spec\.quality\)/);
  assert.match(app, /shrink\(f, spec\.thumbEdge/);
  assert.ok(!/shrink\(f,\s*\d/.test(app), '화면에 축소 크기 숫자가 박혀 있습니다');
  // 카메라 원본이 그대로 클라우드로 가는 길이 없어야 한다 —
  // 파일→dataURL 직행(readAsDataURL)을 금지하고 축소(shrink)만 허용한다.
  assert.ok(!/readAsDataURL/.test(app), '원본을 그대로 올릴 수 있는 경로가 있습니다');
});

test('서류 고르기 버튼이 따로 있고 서류로 표시된다', () => {
  // 서류(명함·사업자등록증·중소기업확인서)는 글씨를 읽어야 하므로 고화질로 담고,
  // 나중에 서류만 골라 보거나 명함첩으로 넘길 수 있게 종류를 남긴다.
  assert.match(app, /id="docBtn"/);
  assert.match(app, /id="docInput"/);
  assert.match(app, /addFiles\(this\.files, true\)/);
  assert.match(app, /kind: isDoc \? 'doc' : 'photo'/);
});

test('미리보기를 끼워 넣을 때 서류 딱지를 지우지 않는다', () => {
  // 칸 내용을 innerHTML 로 통째로 바꾸면 딱지가 사라진다.
  const fill = app.match(/function fillThumbs\(\)[\s\S]*?\n\}/);
  assert.ok(fill, 'fillThumbs 본문을 찾을 수 없습니다');
  assert.ok(!/cell\.innerHTML\s*=/.test(fill[0]), '칸 내용을 통째로 바꿔 딱지가 지워집니다');
  assert.match(fill[0], /insertBefore/);
});

/* ── 휴지통 · 설정 화면 · 3분류 ── */

test('지운 사진은 휴지통으로 가고 되살릴 수 있다', () => {
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

test('설정 단추는 대시보드 맨 아래에 고정된다', () => {
  const rule = app.match(/#gearBtn\{([^}]*)\}/);
  assert.ok(rule, '#gearBtn 규칙을 찾을 수 없습니다');
  assert.match(rule[1], /margin-top:auto/, '맨 아래로 밀어내지 않습니다');
  // 밀어내려면 대시보드가 세로 flex 여야 한다
  const side = app.match(/#side\{([^}]*)\}/);
  assert.match(side[1], /flex-direction:column/);
});

test('명함·서류·회의사진 세 가지를 가린다', () => {
  assert.match(app, /meeting: '회의·현장 사진'/);
  // 회의사진은 명함첩에 넣을 것이 없으니 '확인 필요'로 잡지 않는다
  const fn = app.match(/function needsCheck\([\s\S]*?\n\}/);
  assert.match(fn[0], /kind === 'meeting'\) return false/);
});

/* ── 다른 앱으로 끌어다 놓기 ── */

test('사진을 끌 수 있다 — 공용 규약을 쓴다', () => {
  assert.match(app, /<script src="js\/pu-drag\.js"><\/script>/);
  assert.match(app, /draggable="true"/);
  assert.match(app, /addEventListener\('dragstart'/);
  assert.match(app, /PuDrag\.set\(/);
});

test('끌 때 사진 자체가 아니라 표만 넘긴다', () => {
  // base64 를 넘기면 크기 제한에 걸리고 창을 넘길 때 깨진다.
  const fn = app.match(/addEventListener\('dragstart'[\s\S]*?\n\}\);/);
  assert.ok(fn, 'dragstart 본문을 찾을 수 없습니다');
  assert.ok(!/it\.thumb|loadFull|blob/.test(fn[0]), '사진 데이터를 넘기고 있습니다');
  // 어디 있는 무엇인지가 다 들어가야 받는 쪽이 가져올 수 있다
  for (const k of ['year:', 'owner:', 'id:']) {
    assert.ok(fn[0].indexOf(k) >= 0, '표에 ' + k + ' 가 없습니다');
  }
});

test('컨설팅이 사진첩 사진을 받는다', () => {
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  assert.match(gov, /<script src="js\/pu-drag\.js"><\/script>/);
  assert.match(gov, /<script src="js\/pu-photo-store\.js"><\/script>/);
  assert.match(gov, /PuDrag\.read\(/);
  assert.match(gov, /function dropFromAlbum\(/);
  // 파일을 놓는 기존 길이 살아 있어야 한다(사진첩만 되면 퇴보다)
  const drop = gov.match(/async function dropExtraPhoto\([\s\S]*?\n\}/);
  assert.ok(drop, 'dropExtraPhoto 본문을 찾을 수 없습니다');
  assert.match(drop[0], /dataTransfer\.files/, '파일 놓기가 사라졌습니다');
});

test('컨설팅은 사진첩에서 원판을 받아 자기 사본을 만든다', () => {
  // 사진첩 원본은 그대로 남아야 한다(설계서 원칙).
  const gov = fs.readFileSync(path.join(root, 'gov-consulting.html'), 'utf8');
  const fn = gov.match(/async function dropFromAlbum\([\s\S]*?\n\}/);
  assert.ok(fn, 'dropFromAlbum 본문을 찾을 수 없습니다');
  assert.match(fn[0], /PuPhotoStore\.loadFull\(/);
  assert.match(fn[0], /simpleStampFile\(/, '기존 사진 처리 길을 타지 않습니다');
  assert.ok(!/deletePhoto|saveRead/.test(fn[0]), '사진첩 원본을 건드리고 있습니다');
  // 남의 사진은 규칙이 막는다 → 왜 안 되는지 알려줘야 한다
  assert.match(fn[0], /내가 올린 사진만/);
});

/* ── 사람별 분리 ── */

test('계정을 등록한 뒤에 사진을 읽는다', () => {
  // 사진 자리가 사람별로 갈려 있어 계정을 모르면 경로를 만들 수 없다.
  // 순서가 어긋나면 앱이 뜨는 순간 사진이 안 보인다(실제로 그런 사고가 있었다).
  assert.match(app, /PuPhotoStore\.signIn\(u\.uid/);
  const blk = app.match(/PuPhotoStore\.signIn\(u\.uid[\s\S]{0,300}/);
  assert.ok(blk, 'signIn 호출을 찾을 수 없습니다');
  assert.match(blk[0], /loadGrid\(\)/, '계정 등록이 끝나기 전에 사진을 읽습니다');
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
  assert.ok(!/uid_roles/.test(app), '화면이 권한 경로를 직접 읽습니다');
  assert.match(app, /PuPhotoStore\.amAdmin\(\)/);
});

test('직원에게는 남의 사진을 볼 길이 화면에도 없다', () => {
  const fn = app.match(/function renderOwnerPick\([\s\S]*?\n\}/);
  assert.ok(fn, 'renderOwnerPick 본문을 찾을 수 없습니다');
  assert.match(fn[0], /if \(!PuPhotoStore\.amAdmin\(\)\)/, '관리자 확인 없이 사람 고르기를 보여줍니다');
});

test('남의 사진은 보기만 된다 — 올리기·지우기·판독이 잠긴다', () => {
  assert.match(app, /function viewingOther\(/);
  assert.match(app, /function blockedIfOther\(/);
  for (const fname of ['deleteOne', 'deleteSelected', 'readAgain', 'readSelected']) {
    const fn = app.match(new RegExp('function ' + fname + '\\([\\s\\S]{0,160}'));
    assert.ok(fn, fname + ' 를 찾을 수 없습니다');
    assert.match(fn[0], /blockedIfOther\(\)/, fname + ' 이 남의 사진에도 동작합니다');
  }
  // 올리기 단추도 잠근다
  assert.match(app, /\['pickBtn', 'docBtn', 'camBtn'\][\s\S]{0,120}viewingOther\(\)/);
});

test('예전 사진 옮기기는 관리자에게만 보이고 확인을 받는다', () => {
  assert.match(app, /function runMigrate\(/);
  assert.match(app, /function runDropLegacy\(/);
  const mig = app.match(/function runMigrate\([\s\S]*?\n\}/);
  assert.match(mig[0], /confirm\(/);
  assert.match(mig[0], /원본은 지우지 않고/, '원본을 지우지 않는다는 안내가 없습니다');
  // 옛 자리 지우기 단추는 옮기기가 모두 성공한 뒤에만 나타난다
  assert.match(mig[0], /r\.failed[\s\S]{0,240}dropBtn.*display = 'block'|dropBtn'\)\.style\.display = 'block'/);
  const drop = app.match(/function runDropLegacy\([\s\S]*?\n\}/);
  assert.match(drop[0], /되돌릴 수 없/);
});

/* ── 확인 필요 모아보기 · 여러 장 판독 ── */

test('다시 판독해도 검증 통과분은 자동으로 명함첩에 간다', () => {
  // 예전에는 올릴 때만 자동이고 다시 판독하면 단추를 한 번 더 눌러야 했다.
  const fn = app.match(/function readPhoto\([\s\S]*?\n\}/);
  assert.ok(fn, 'readPhoto 본문을 찾을 수 없습니다');
  assert.match(fn[0], /read\.auto && canSend\(read\)/, '다시 판독 후 자동 등록이 없습니다');
  // 판독하는 길이 하나여야 두 길이 어긋나지 않는다
  assert.match(app, /function readAgain\(\)[\s\S]{0,400}readPhoto\(id\)/);
});

test('확인이 필요한 것만 모아 볼 수 있다', () => {
  assert.match(app, /function needsCheck\(/);
  assert.match(app, /id="needBox"/);
  assert.match(app, /function toggleNeed\(/);
  assert.match(app, /확인 필요/);
});

test('확인 필요 판정에 아직 판독 안 한 것과 서류 아닌 것은 안 든다', () => {
  // 안 한 일과 어긋난 일은 다르다. 서류가 아닌 사진은 읽을 것이 없다.
  const fn = app.match(/function needsCheck\([\s\S]*?\n\}/);
  assert.ok(fn, 'needsCheck 본문을 찾을 수 없습니다');
  assert.match(fn[0], /if \(!r\) return false/);
  assert.match(fn[0], /kind === 'other'\) return false/);
  // 판독 실패·검증 걸림·아직 안 보낸 것은 든다
  assert.match(fn[0], /r\.error\) return true/);
  assert.match(fn[0], /!r\.auto\) return true/);
  assert.match(fn[0], /filed && r\.filed\.id\)\) return true/);
});

test('확인 필요 표시가 격자 칸에 바로 보인다', () => {
  assert.match(app, /needsCheck\(it\) \? '<span class="wn">/);
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

test('지우기는 되돌릴 수 없으니 반드시 확인을 받는다', () => {
  for (const fname of ['deleteOne', 'deleteSelected']) {
    const fn = app.match(new RegExp('function ' + fname + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(fn, fname + ' 본문을 찾을 수 없습니다');
    assert.match(fn[0], /confirm\(/, fname + ' 이 확인 없이 지웁니다');
    assert.match(fn[0], /되돌릴 수 없/, fname + ' 이 되돌릴 수 없다는 말을 안 합니다');
  }
});

test('명함첩에 보낸 사진을 지울 때는 그 기록이 남는다고 알린다', () => {
  // 사진첩 사진과 명함첩 레코드는 다른 물건이다 — 같이 지워지는 줄 알면 안 된다
  assert.match(app, /명함첩 기록은 그대로 남습니다/);
});

test('체크는 늘 사진 오른쪽 위에 있고, 거기를 누르면 고른다', () => {
  // 「고르기」 단계를 먼저 밟지 않아도 바로 고를 수 있어야 한다(대표 지시).
  // 체크를 누르면 고르고, 사진의 다른 곳을 누르면 열린다.
  assert.match(app, /ev\.target\.closest\('\.ck'\)\) \{ toggleOne\(id\); return; \}/);
  // 체크가 숨어 있지 않아야 한다 — display:none 이면 누를 자리가 없다
  const rule = app.match(/#grid \.cell \.ck\{([^}]*)\}/);
  assert.ok(rule, '체크 규칙을 찾을 수 없습니다');
  assert.ok(!/display:none/.test(rule[1]), '체크가 숨어 있습니다: ' + rule[1]);
  assert.match(rule[1], /right:|top:/, '체크가 오른쪽 위에 없습니다: ' + rule[1]);
});

test('고른 것에 쓰는 단추는 왼쪽 끝에 있다', () => {
  // 대표 지시 — 판독·지우기·취소를 왼쪽에서 고를 수 있게.
  const bar = app.match(/<div id="gridBar">([\s\S]*?)<\/div>/);
  assert.ok(bar, 'gridBar 를 찾을 수 없습니다');
  const iBtn = bar[1].indexOf('readSelBtn');
  const iCount = bar[1].indexOf('gridCount');
  assert.ok(iBtn >= 0 && iCount >= 0, '단추나 장수 표시가 없습니다');
  assert.ok(iBtn < iCount, '단추가 장수 표시보다 뒤에 있습니다 — 왼쪽 끝이 아닙니다');
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
  // 명함첩과 같은 판(pdf.js 3.11.174)을 쓴다 — 앱마다 다르면 캐시가 두 벌 된다
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
  assert.match(app, /addFiles\([^)]*,\s*true\s*\)/);
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

test('서류 판독 층을 불러오고, 판독은 서류에만 돌린다', () => {
  assert.match(app, /<script src="js\/pu-doc-read\.js"><\/script>/);
  assert.match(app, /PuDocRead\.read\(/);
  // 현장사진에는 읽을 것이 없다 — 전부 판독하면 AI 호출이 헛돈다
  assert.match(app, /j\.kind === 'doc'.*startRead|kind === 'doc'\)\s*startRead/);
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
  assert.match(app, /esc\(read\.fields\[/);
});

/* ── 명함첩으로 보내기 ── */

test('등록 층을 불러오고, 명함첩 구조는 화면이 모른다', () => {
  assert.match(app, /<script src="js\/pu-doc-file\.js"><\/script>/);
  assert.match(app, /PuDocFile\.sendToCards\(/);
  // 화면에 명함첩 루트 이름이 들어오면 실데이터 가드가 깨지고,
  // 명함첩 구조가 두 곳에 흩어져 한쪽만 고쳐진다
  assert.ok(!/pucards/.test(app), '화면이 명함첩 루트를 직접 알고 있습니다');
});

test('검증을 통과한 것만 자동으로 보낸다', () => {
  const fn = app.match(/function startRead\([\s\S]*?\n\}/);
  assert.ok(fn, 'startRead 본문을 찾을 수 없습니다');
  assert.match(fn[0], /read\.auto && canSend\(read\)/,
    '검증 결과를 보지 않고 보내고 있습니다');
});

test('명함과 사업자등록증만 명함첩으로 보낸다', () => {
  // 중소기업확인서는 명함첩에 들어갈 물건이 아니다(사업장 정보로 간다)
  assert.match(app, /CARD_KINDS = \{ card: 1, bizreg: 1 \}/);
  assert.match(app, /function canSend\(/);
});

test('같은 사진을 두 번 보내지 않는다', () => {
  const fn = app.match(/function canSend\([\s\S]*?\n\}/);
  assert.ok(fn, 'canSend 본문을 찾을 수 없습니다');
  assert.match(fn[0], /read\.filed/, '보낸 표시를 확인하지 않습니다');
});

test('보낼 때 사진 원판을 함께 보낸다', () => {
  // 명함첩이 자기 사본을 가져야 사진첩을 정리해도 기록이 온전하다
  const fn = app.match(/function sendCards\([\s\S]*?\n\}/);
  assert.ok(fn, 'sendCards 본문을 찾을 수 없습니다');
  assert.match(fn[0], /loadFull\(/);
  assert.match(fn[0], /safeSrc\(/, '사진 값을 검사 없이 넘기고 있습니다');
});

test('걸린 것은 사람이 보낼 수 있게 단추를 준다', () => {
  assert.match(app, /function sendCardsNow\(/);
  assert.match(app, /명함첩으로 보내기/);
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

test('설정은 대시보드 가장 아래에 있고, 로그인 뒤에만 닿는다', () => {
  // 대표 지시로 위쪽 톱니바퀴에서 대시보드 맨 아래로 옮겼다.
  // 대시보드(#side)는 #home 안에 있고 #home 은 로그인 뒤에만 뜨므로
  // **구조로** 막힌다 — 숨기는 규칙에 의존하지 않는다.
  assert.match(app, /<button id="gearBtn"[^>]*onclick="openSettings\(\)"/);
  const side = app.match(/<aside id="side">([\s\S]*?)<\/aside>/);
  assert.ok(side, '대시보드(#side)를 찾을 수 없습니다');
  assert.match(side[1], /id="gearBtn"/, '설정이 대시보드 안에 없습니다');
  // 대시보드 안에서 가장 아래여야 한다
  const iGear = side[1].indexOf('id="gearBtn"');
  const iUp = side[1].indexOf('id="upWrap"');
  assert.ok(iUp >= 0 && iGear > iUp, '설정이 대시보드 맨 아래가 아닙니다');
  // 위쪽 상단바에는 더 이상 톱니바퀴가 없다
  const top = app.match(/<div id="top">([\s\S]*?)<\/div>/);
  assert.ok(top && !/openSettings/.test(top[1]), '상단바에 설정이 남아 있습니다');
  // #home 은 기본이 숨김이어야 한다(로그인 전에 대시보드가 보이면 안 된다)
  const home = app.match(/#home\{([^}]*)\}/);
  assert.match(home[1], /display:none/, '#home 이 로그인 전에도 보입니다');
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
