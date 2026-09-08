/* tools/rc-open.js · 멈춘방-열기.bat — 「두 번 누르면 방이 되살아나고 폰에 붙는다」
 *
 * ⚠ CLAUDE.md 규칙: «지금 값»을 박지 않는다. 「4곳」 같은 수도, 화면 문장도 글자로 안 박는다.
 *
 * ★ 2026-09-07 고장넣기에서 15개 중 9개가 «안 물었다». 까닭이 셋이었고 셋 다 여기서 메웠다:
 *   ㉠ **주석 안의 글자를 맞춰 통과했다** — `chcp 65001` 이 설명 주석에도 있어,
 *      진짜 명령을 지워도 검사가 통과했다. → 주석을 «걷어낸 뒤» 본다.
 *   ㉡ **낱말이 옆 줄에도 있어 통과했다** — 「없습니다」가 다음 줄 안내문에도 있어,
 *      「열 것이 없다」는 말을 지워도 통과했다. → 그 줄을 짚어 본다.
 *   ㉢ **윈도우 길을 리눅스에서 밟을 수 없었다** — 「묻지 않고 연다」·「--dry 무시」·
 *      「창이 아닌데 예로 본다」를 넣어도 안 물었다. CI 는 리눅스다.
 *      → 결정을 순수 함수 `결정()` 으로 떼어냈고, 그것을 «어느 컴퓨터에서나» 직접 본다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'rc-open.js');
const SCAN = path.join(ROOT, 'tools', 'leftover-scan.js');
const BAT = path.join(ROOT, '멈춘방-열기.bat');

const GCFG = ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false'];
function g(dir, args) {
  return execFileSync('git', GCFG.concat(args),
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/* ㉠ 주석을 «자리는 남기고» 걷어낸다 — 설명에 적어 둔 글자를 코드로 읽지 않게.
   tools/dead-code.js 가 「주석에 적어 둔 함수」를 진짜 선언으로 읽고 데인 자리와 같은 까닭. */
function 주석빼기(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
    .replace(/(^|[^:])\/\/[^\n]*/g, function (m) { return m.replace(/[^\n]/g, ' '); });
}
function batRem빼기(src) {   /* .bat 의 주석은 rem 이다 */
  return src.split('\n').filter(function (l) { return !/^\s*rem\b/i.test(l); }).join('\n');
}

let BASE = null;
const 이름 = { 깨끗: 'ga-clean', 손댐: 'na-dirty' };

function 밭갈기() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rcopen-'));
  const origin = path.join(base, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);

  const 하나 = function (name) {
    const d = path.join(base, name);
    fs.mkdirSync(d, { recursive: true });
    g(d, ['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(d, 'a.txt'), 'first\n');
    g(d, ['add', '.']); g(d, ['commit', '-qm', 'first']);
    g(d, ['remote', 'add', 'origin', origin]);
    return d;
  };

  const 깨끗 = 하나(이름.깨끗);
  g(깨끗, ['push', '-q', '-u', 'origin', 'main']);

  const 손댐 = 하나(이름.손댐);
  g(손댐, ['fetch', '-q', 'origin']);
  g(손댐, ['branch', '--set-upstream-to=origin/main', 'main']);
  fs.writeFileSync(path.join(손댐, 'a.txt'), 'changed\n');

  return base;
}

/* ⚠ stdin 을 파이프로 준다 — 창(TTY)이 아니므로 연장은 «묻지 않고 아니오»로 가야 한다.
     이 검사가 창을 스무 개 띄우면 그 자체가 사고다. */
function 돌리기(args) {
  return execFileSync(process.execPath, [TOOL].concat(args),
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).replace(/\r\n/g, '\n');
}

const 두곳 = [{ dir: '/x/one' }, { dir: '/x/two' }];
function 결정(뜻) {
  const rc = require(TOOL);
  return rc.결정(뜻.빈곳 ? [] : 두곳, {
    마른것: !!뜻.마른것, 바로: !!뜻.바로, 윈도우: !!뜻.윈도우,
    /* 창인가는 «없으면 창»으로 본다 — 물음 갈래를 보려는 검사가 대부분이라서다.
       창이 아닌 자리를 볼 때만 일부러 false 를 준다. */
    창인가: 뜻.창인가 === undefined ? true : !!뜻.창인가,
    물기: function () { 결정.물었나 = true; return !!뜻.답; },
  });
}

test.before(function () { BASE = 밭갈기(); });
test.after(function () {
  if (BASE) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch (e) { /* 검사는 끝났다 */ } }
});

/* ══ ㉢ 결정 — 어느 컴퓨터에서나 본다 (윈도우 길을 리눅스에서도 밟는다) ══ */

test('★★ 윈도우에서 «묻고 예라고 해야» 연다', function () {
  결정.물었나 = false;
  assert.equal(결정({ 윈도우: true, 답: true }).무엇, '엶');
  assert.equal(결정.물었나, true, '묻지 않고 열었습니다');
});

test('★★ 윈도우에서 «아니오»면 안 연다 — 창이 스무 개 뜨는 것이 사고다', function () {
  assert.equal(결정({ 윈도우: true, 답: false }).무엇, '안엶');
});

test('★ --go 를 주면 안 묻고 연다 — 그때만이다', function () {
  결정.물었나 = false;
  assert.equal(결정({ 윈도우: true, 바로: true, 답: false }).무엇, '엶');
  assert.equal(결정.물었나, false, '--go 인데 물었습니다');
});

test('★ --dry 는 «묻지도 열지도» 않는다', function () {
  결정.물었나 = false;
  const 답 = 결정({ 윈도우: true, 마른것: true, 답: true });
  assert.equal(답.무엇, '보이기만', '--dry 인데 열려 했습니다');
  assert.equal(결정.물었나, false, '--dry 인데 물었습니다 — 물을 자리가 아닙니다');
  assert.equal(답.명령들.length, 두곳.length, '열 명령을 안 보였습니다');
});

test('★ 윈도우가 아니면 «묻지도 열지도» 않고 손으로 할 것을 준다', function () {
  결정.물었나 = false;
  const 답 = 결정({ 윈도우: false, 답: true });
  assert.equal(답.무엇, '손으로');
  assert.equal(결정.물었나, false, '못 띄우는데 물었습니다');
});

test('열 것이 없으면 «없음»이고, 명령을 하나도 안 만든다', function () {
  const 답 = 결정({ 빈곳: true, 윈도우: true, 답: true });
  assert.equal(답.무엇, '없음');
  assert.equal(답.명령들.length, 0, '열 것이 없는데 명령을 만들었습니다');
});

test('★ 되살리기와 리모트 붙이기를 «한 줄»에 한다', function () {
  /* 방을 되살린 뒤 사람이 다시 /rc 를 쳐야 하면 「아주 쉽게」가 아니다.
     ⚠ 주석이 아니라 «실제로 만들어지는 명령»을 본다. */
  const 명령 = require(TOOL).여는명령('/x/one');
  assert.match(명령, /--continue/, '방을 되살리지 않습니다');
  assert.match(명령, /--rc\b|--remote-control\b/, '리모트에 붙이지 않습니다');
  assert.match(명령, /"\/x\/one"/, '폴더를 따옴표로 안 감쌌습니다 — 빈칸 있는 경로가 깨집니다');
});

test('★★ 창(TTY)이 아니면 «묻지도 열지도» 않는다 — 물을 수 없으면 아니오다', function () {
  /* 물을 길이 없는데 여는 쪽으로 기울면 자동 실행이 창을 스무 개 띄운다.
     ⚠ 이 규칙을 물음 함수 안에 두었을 때는 리눅스에서 잴 길이 없었다 —
       그래서 «결정» 안으로 올렸고, 이제 어느 컴퓨터에서나 잰다. */
  결정.물었나 = false;
  assert.equal(결정({ 윈도우: true, 창인가: false, 답: true }).무엇, '안엶',
    '창이 아닌데 열려 했습니다');
  assert.equal(결정.물었나, false, '물을 수 없는 자리에서 물었습니다');
});

test('★ --go 는 창이 아니어도 연다 — 스스로 돌릴 때 쓰는 길이다', function () {
  결정.물었나 = false;
  assert.equal(결정({ 윈도우: true, 창인가: false, 바로: true, 답: false }).무엇, '엶');
  assert.equal(결정.물었나, false, '--go 인데 물었습니다');
});

test('★ 창(TTY)이 아니면 «묻지 않고 아니오»다 — 답 없는 물음이 여는 쪽으로 기울면 사고다', function () {
  /* 앞선 고장넣기에서 이 한 자리만 안 물었다 — 검사가 이 함수를 아예 안 부르고 있었다.
     ⚠ 창인가를 넘겨줘 «읽지 않고» 판정만 본다. 안 넘기면 진짜 창에서 돌 때 여기서 멈춘다. */
  const rc = require(TOOL);
  assert.equal(rc.예인가물음('물어볼 일 없음 ', false), false,
    '창이 아닌데 «예»로 봤습니다 — 검사나 자동 실행이 창을 스무 개 띄웁니다');
});

/* ══ 실제로 돌려 본다 ══ */

test('연장이 있고, 돌다가 죽지 않는다', function () {
  assert.ok(fs.existsSync(TOOL), 'tools/rc-open.js 가 없습니다');
  assert.ok(돌리기([BASE, '--dry']).trim().length > 0, '아무것도 안 찍었습니다');
});

test('남은 일이 있는 폴더«만» 열려 한다 — 깨끗한 폴더는 안 든다', function () {
  const out = 돌리기([BASE, '--dry']);
  assert.ok(out.indexOf(이름.손댐) >= 0, '손댄 파일이 있는 폴더가 목록에 없습니다');
  assert.equal(out.indexOf(이름.깨끗), -1, '깨끗한 폴더를 열려 하고 있습니다');
});

test('묻지 않은 채로는 «창을 열지 않는다» (창이 아닌 곳에서 돌려도)', function () {
  assert.equal(돌리기([BASE]).indexOf('열었습니다'), -1, '묻지도 않고 창을 열었습니다');
});

test('㉡ 열 것이 없으면 «그 말을 하는 줄»이 있다', function () {
  /* ⚠ 「없습니다」라는 낱말만 찾으면 다음 줄 안내문에도 있어 헛통과한다.
       «열어 볼 방이 없다»를 말하는 줄이 있는지, 그리고 열 명령이 없는지 함께 본다. */
  const 빈곳 = fs.mkdtempSync(path.join(os.tmpdir(), 'rcopen-empty-'));
  try {
    const 줄들 = 돌리기([빈곳, '--dry']).split('\n');
    const 말한줄 = 줄들.filter(function (l) { return /방|열/.test(l) && /없/.test(l); });
    assert.ok(말한줄.length >= 1, '열어 볼 방이 없다고 말하는 줄이 없습니다');
    assert.equal(줄들.some(function (l) { return /claude --continue/.test(l); }), false,
      '열 것이 없는데 명령을 찍었습니다');
  } finally { fs.rmSync(빈곳, { recursive: true, force: true }); }
});

test('없는 폴더를 주면 까닭을 말한다', function () {
  const 없는곳 = path.join(os.tmpdir(), 'rcopen-nope-' + Date.now());
  let out = '';
  try { out = 돌리기([없는곳]); } catch (e) { out = String(e.stdout || ''); }
  assert.match(out, /그런 폴더가 없습니다/, '없는 폴더라고 말해야 합니다');
});

/* ══ 짜임 ══ */

test('★ 셈을 두 벌로 만들지 않았다 — leftover-scan 을 빌려 쓴다', function () {
  /* 여기서 다시 세면 「훑기는 3곳이라는데 열기는 5곳을 연다」가 된다. */
  const src = 주석빼기(fs.readFileSync(TOOL, 'utf8'));
  assert.match(src, /require\(['"]\.\/leftover-scan(\.js)?['"]\)/, 'leftover-scan 을 안 빌려 씁니다');
  assert.equal(/function\s+재기\s*\(/.test(src), false, '재기() 를 여기서 또 만들었습니다');
  assert.equal(/function\s+남은일있나\s*\(/.test(src), false, '남은일있나() 를 여기서 또 만들었습니다');
});

test('★ 훑기 연장은 «불러 써도» 표를 두 번 찍지 않는다', function () {
  const 훑기 = require(SCAN);
  ['찾기', '재기', '남은일있나', '곧은길'].forEach(function (k) {
    assert.equal(typeof 훑기[k], 'function', 'leftover-scan 이 ' + k + ' 를 안 엽니다');
  });
  /* ㉠ 주석을 걷어낸 뒤 본다 — 설명에 적어 둔 글자를 코드로 읽지 않게 */
  const src = 주석빼기(fs.readFileSync(SCAN, 'utf8'));
  assert.match(src, /if\s*\(\s*require\.main === module\s*\)/,
    '직접 돌릴 때와 불릴 때를 안 갈랐습니다 — 부르는 쪽 화면에 표가 두 번 찍힙니다');
});

test('bash 를 안 부른다 (윈도우 PowerShell 창에는 bash 가 없다)', function () {
  const src = 주석빼기(fs.readFileSync(TOOL, 'utf8'));
  assert.equal(/['"]bash['"]/.test(src), false, 'bash 를 부르고 있습니다');
  assert.equal(/\bexecSync\s*\(/.test(src), false, 'execSync 는 shell 을 거칩니다');
});

/* ══ 두 번 눌러 쓰는 파일 ══ */

test('★ 두 번 눌러 쓰는 파일이 «읽을 수 있게» 되어 있다', function () {
  assert.ok(fs.existsSync(BAT), '멈춘방-열기.bat 이 없습니다');
  /* ㉠ rem 주석을 걷어낸 뒤 본다 — 설명에 적어 둔 chcp 를 명령으로 읽지 않게 */
  const 몸 = batRem빼기(fs.readFileSync(BAT, 'utf8'));

  /* ⚠ chcp 65001 이 없으면 node 가 찍는 한글이 깨져 대표가 못 읽는다 */
  assert.match(몸, /^\s*chcp\s+65001/m, '한글이 깨집니다 — chcp 65001 이 없습니다');
  /* ⚠ 마지막이 pause 가 아니면 창이 순식간에 닫혀 «아무것도 못 본다».
       중간의 pause(node 없을 때)로는 이 자리를 대신할 수 없다. */
  const 끝줄들 = 몸.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  assert.equal(끝줄들[끝줄들.length - 1], 'pause',
    '마지막이 pause 가 아닙니다 — 창이 바로 닫혀 결과를 못 봅니다');
  assert.match(몸, /cd \/d "%~dp0"/, '눌린 자리로 안 옮깁니다');
  assert.match(몸, /rc-open\.js/, 'rc-open.js 를 안 부릅니다');
  assert.match(몸, /where node/, 'node 가 없을 때를 안 봅니다');

  /* ⚠ .bat 안의 한글은 cmd 코드페이지에 따라 깨진다 — 화면 글은 node 가 찍는다.
       그래서 명령 줄(rem 아닌 줄)에는 한글이 «하나도» 없어야 한다. */
  const 한글줄 = 몸.split('\n').filter(function (l) { return /[가-힣]/.test(l); });
  assert.equal(한글줄.length, 0,
    '.bat 명령 줄에 한글이 있습니다 — cmd 코드페이지에서 깨집니다: ' + 한글줄.join(' / '));
});

test('★ 윈도우가 아니면 «띄운 척하지 않는다»', function () {
  const src = 주석빼기(fs.readFileSync(TOOL, 'utf8'));
  assert.match(src, /process\.platform === 'win32'/, '윈도우인지 안 봅니다');
  if (process.platform !== 'win32') {
    const out = 돌리기([BASE]);
    assert.match(out, /윈도우가 아닙니다/, '창을 못 띄운다고 말해야 합니다');
    assert.equal(out.indexOf('열었습니다'), -1, '못 띄우는데 열었다고 말했습니다');
  }
});
