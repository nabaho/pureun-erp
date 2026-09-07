/* tools/leftover-scan.js — 「멈춘 방이 남긴 일」 훑기
 *
 * ⚠ CLAUDE.md 규칙: «지금 값»을 박지 않는다. 「손볼 곳 4곳」 같은 수를 글자로 못 박으면
 *   폴더가 하나 늘 때마다 기능이 멀쩡한데도 검사가 깨진다.
 *   그래서 여기서 보는 것은 «규칙»이다 —
 *     · 남은 일이 있는 폴더가 «뜨는가»
 *     · 깨끗한 폴더가 «안 뜨는가»
 *     · 한 폴더가 «한 줄인가»
 *     · 조용히 빠지는 폴더가 «없는가»
 *
 * ★ 진짜 저장소를 만들어 대고 본다. 글자만 훑으면 「셈이 맞는가」를 못 본다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'leftover-scan.js');

/* 커밋에 필요한 최소 설정만 준다 — 이 PC 의 설정에 기대지 않는다 */
const GCFG = ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false'];
function g(dir, args) {
  return execFileSync('git', GCFG.concat(args),
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/* ── 다섯 가지 폴더를 만든다 — 넷은 남은 일이 있고 하나는 깨끗하다 ── */
let BASE = null;
const 이름 = {
  깨끗: 'ga-clean', 손댐: 'na-dirty', 안올림: 'da-ahead',
  치움: 'ra-stash', 올린적없음: 'ma-no-origin',
};

function 저장소하나(base, name) {
  const d = path.join(base, name);
  fs.mkdirSync(d, { recursive: true });
  g(d, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(d, 'a.txt'), 'first\n');
  g(d, ['add', '.']);
  g(d, ['commit', '-qm', 'first']);
  return d;
}

function 밭갈기() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-'));
  const origin = path.join(base, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);

  const 위붙이기 = function (d) {
    g(d, ['remote', 'add', 'origin', origin]);
    g(d, ['fetch', '-q', 'origin']);
    g(d, ['branch', '--set-upstream-to=origin/main', 'main']);
  };

  const 깨끗 = 저장소하나(base, 이름.깨끗);
  g(깨끗, ['remote', 'add', 'origin', origin]);
  g(깨끗, ['push', '-q', '-u', 'origin', 'main']);

  const 손댐 = 저장소하나(base, 이름.손댐);
  위붙이기(손댐);
  fs.writeFileSync(path.join(손댐, 'a.txt'), 'changed\n');
  fs.writeFileSync(path.join(손댐, 'new.txt'), 'brand new\n');

  const 안올림 = 저장소하나(base, 이름.안올림);
  위붙이기(안올림);
  fs.writeFileSync(path.join(안올림, 'b.txt'), 'work\n');
  g(안올림, ['add', '.']);
  g(안올림, ['commit', '-qm', 'not pushed']);

  const 치움 = 저장소하나(base, 이름.치움);
  위붙이기(치움);
  fs.writeFileSync(path.join(치움, 'a.txt'), 'stashed\n');
  g(치움, ['stash', '-q']);

  저장소하나(base, 이름.올린적없음);   /* origin 을 안 붙인다 */
  return base;
}

function 돌리기(args) {
  return execFileSync(process.execPath, [TOOL].concat(args), { encoding: 'utf8' })
    .replace(/\r\n/g, '\n');            /* 줄끝은 읽을 때 한 번 고른다 */
}

/* 그 폴더가 적힌 줄을 찾는다 */
function 줄찾기(out, name) {
  return out.split('\n').filter(function (l) { return l.indexOf('/' + name) >= 0; });
}

test.before(function () { BASE = 밭갈기(); });
test.after(function () {
  if (BASE) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch (e) { /* 지워지지 않아도 검사는 끝났다 */ } }
});

test('연장이 있고, 돌다가 죽지 않는다', function () {
  assert.ok(fs.existsSync(TOOL), 'tools/leftover-scan.js 가 없습니다');
  const out = 돌리기([BASE]);
  assert.ok(out.trim().length > 0, '아무것도 안 찍었습니다');
});

test('손댄 파일이 있는 폴더가 «뜬다» — 그리고 손댄 수가 0 이 아니다', function () {
  const 줄 = 줄찾기(돌리기([BASE]), 이름.손댐);
  assert.equal(줄.length, 1, '손댄 파일이 있는 폴더가 한 줄로 떠야 합니다');
  /* 몇 개인지는 박지 않는다 — «0 이 아닌 수가 적혀 있는가»만 본다 */
  assert.match(줄[0], /\s[1-9][0-9]*\s/, '손댄 수가 안 적혔습니다');
});

test('커밋만 하고 안 올린 폴더가 «뜬다»', function () {
  const 줄 = 줄찾기(돌리기([BASE]), 이름.안올림);
  assert.equal(줄.length, 1, '안 올린 커밋이 있는 폴더가 떠야 합니다');
  assert.match(줄[0], /\s[1-9][0-9]*\s/, '안 올린 커밋 수가 안 적혔습니다');
});

test('★ 치워 둔 것(stash)만 있어도 «뜬다» — 가장 잘 잊히는 자리다', function () {
  /* 손댄 파일도 없고 커밋도 위와 같으니, stash 를 안 보면 이 폴더는 «사라진다».
     사람은 그것을 「끝났다」로 읽고, 며칠 뒤에 잃는다. */
  const 줄 = 줄찾기(돌리기([BASE]), 이름.치움);
  assert.equal(줄.length, 1, 'stash 만 남은 폴더가 떠야 합니다');
});

test('★ 한 번도 올린 적 없는 폴더는 «조용히 빠지지 않고» 까닭이 적힌다', function () {
  /* 견줄 origin 이 없으면 「안 올린 커밋 0」으로 보인다 — 그대로 두면
     가장 위험한 폴더(어디에도 사본이 없는 폴더)가 목록에서 사라진다. */
  const 줄 = 줄찾기(돌리기([BASE]), 이름.올린적없음);
  assert.equal(줄.length, 1, 'origin 없는 폴더가 떠야 합니다');
  assert.match(줄[0], /⚠/, '까닭을 적어야 합니다 — 수만 0 으로 두면 안 됩니다');
});

test('깨끗한 폴더는 기본으로 «안 뜨고», --all 에는 «뜬다»', function () {
  /* 이 연장의 값은 「열어 볼 폴더만 남기는 것」이다. 깨끗한 것이 섞이면 뜻이 없다. */
  assert.equal(줄찾기(돌리기([BASE]), 이름.깨끗).length, 0, '깨끗한 폴더가 기본 목록에 떴습니다');
  assert.equal(줄찾기(돌리기([BASE, '--all']), 이름.깨끗).length, 1, '--all 에서도 안 보입니다');
});

test('한 폴더는 «한 줄»이다 (대표 지시 2026-08-30)', function () {
  const out = 돌리기([BASE, '--all']);
  Object.keys(이름).forEach(function (k) {
    assert.equal(줄찾기(out, 이름[k]).length, 1, 이름[k] + ' 가 한 줄이 아닙니다');
  });
});

test('표 머리와 값의 «폴더 칸»이 같은 자리에서 시작한다', function () {
  /* 칸수를 두 곳에서 따로 세면 한글 머리글(두 칸 폭) 때문에 어긋난다.
     ⚠ 자리를 «수»로 박지 않는다 — 머리줄과 값줄을 서로 견준다. */
  const 줄들 = 돌리기([BASE, '--all']).split('\n');
  const 머리 = 줄들.find(function (l) { return l.indexOf('가지') === 0 && /폴더\s*$/.test(l); });
  assert.ok(머리, '표 머리를 못 찾았습니다');
  const 값 = 줄들.find(function (l) { return l.indexOf('/' + 이름.손댐) >= 0; });
  assert.ok(값, '값 줄을 못 찾았습니다');

  const 칸수 = function (s) {
    let w = 0;
    for (const ch of s) w += /[ᄀ-ᇿ　-〿㄰-㆏가-힯！-｠]/.test(ch) ? 2 : 1;
    return w;
  };
  /* ⚠ 값 줄에서는 «경로가 시작하는 자리»를 잡아야 한다.
     처음엔 '/na-dirty' 를 찾았는데 그것은 경로 «끝»이라 20칸이 남의 것으로 세어졌다
     (연장이 아니라 이 검사가 틀렸다). 훑은 곳의 경로로 자리를 잡는다. */
  const 밑동 = String(BASE).split(path.sep).join('/');
  const 머리자리 = 칸수(머리.slice(0, 머리.lastIndexOf('폴더')));
  const 값자리 = 칸수(값.slice(0, 값.indexOf(밑동)));
  assert.ok(Math.abs(머리자리 - 값자리) <= 1,
    '폴더 칸이 어긋났습니다 — 머리 ' + 머리자리 + '칸, 값 ' + 값자리 + '칸');
});

test('★ 윈도우에서도 돈다 — bash 를 안 부르고, 경로에 역슬래시를 안 찍는다', function () {
  /* STATUS.md 「CI 는 초록인데 내 컴퓨터는 빨갛다」: PowerShell 창에 bash 가 없어
     spawnSync bash ENOENT 로 죽은 검사가 셋 있었다. 같은 자리를 미리 막는다. */
  const src = fs.readFileSync(TOOL, 'utf8');
  assert.ok(!/['"]bash['"]/.test(src), 'bash 를 부르고 있습니다 — 윈도우에서 죽습니다');
  assert.ok(!/\bexecSync\s*\(/.test(src), 'execSync 는 shell 을 거칩니다 — execFileSync 를 쓰세요');

  const out = 돌리기([BASE, '--all']);
  const 폴더줄 = out.split('\n').filter(function (l) { return l.indexOf('leftover-') >= 0; });
  assert.ok(폴더줄.length > 0, '폴더 줄을 못 찾았습니다');
  폴더줄.forEach(function (l) {
    assert.ok(l.indexOf('\\') < 0, '경로에 역슬래시가 섞였습니다: ' + l);
  });
});

test('없는 폴더를 주면 «까닭을 말하고» 조용히 0 으로 끝내지 않는다', function () {
  const 없는곳 = path.join(os.tmpdir(), 'leftover-nope-' + Date.now());
  let out = '', code = 0;
  try {
    out = 돌리기([없는곳]);
  } catch (e) { out = String(e.stdout || ''); code = e.status; }
  assert.match(out, /없습니다/, '없는 폴더라고 말해야 합니다');
  assert.notEqual(code, undefined);
});

test('훑는 깊이를 넘겨 받는다 — 0 이면 윗 폴더 자신만 본다', function () {
  /* 깊이를 못 넘기면 폴더 짜임이 다른 PC 에서 아무것도 못 찾는다. */
  const out = 돌리기([BASE, '--depth', '0', '--all']);
  assert.equal(줄찾기(out, 이름.손댐).length, 0, '깊이 0 인데 안쪽 폴더를 봤습니다');
  const out2 = 돌리기([BASE, '--depth', '1', '--all']);
  assert.equal(줄찾기(out2, 이름.손댐).length, 1, '깊이 1 에서 안쪽 폴더를 봐야 합니다');
});

test('무엇을 봐야 하는지 «화면에서» 알려 준다', function () {
  /* 수만 찍고 끝나면 「그래서 뭘 하라는 거지」가 된다.
     ⚠ 문장을 글자로 박지 않는다 — «다음 걸음을 말하는 낱말이 있는가»만 본다. */
  const out = 돌리기([BASE]);
  assert.match(out, /claude/, '다음에 무엇을 할지 안 적혀 있습니다');
  assert.match(out, /stash/, 'stash 가 무엇인지 안 적혀 있습니다');
});
