#!/usr/bin/env node
/* 「멈춘 방이 남긴 일」 훑기 — 방을 스무 개 열어 보지 않고 «어느 폴더에» 일이 남았나 본다
 *
 * ■ 왜 이 연장이 필요한가 (대표 물음 2026-09-07)
 *   「피시데스크탑 코드에서 진행하다가 멈춘게 많다」
 *
 *   ★ GitHub 을 보는 것으로는 «못 찾는다».
 *     클라우드 방에서 「열린 PR + PR 이 한 번도 없던 가지」로 세면 올라간 것만 보인다.
 *     커밋을 안 했거나, 커밋만 하고 push 를 안 한 일은 **그 PC 디스크 안에만** 있어
 *     아무 데서도 안 보인다. 이 저장소는 작업트리를 스무 개 넘게 쓰므로 그 자리가 스무 곳이다.
 *     (2026-09-07 에 클라우드에서 「남은 일 없다」고 답했는데, 대표 PC 에는 멈춘 방이 많았다.
 *      틀린 답이 아니라 «못 보는 자리»를 안 밝힌 답이었다 — 그 구멍을 메우는 연장이다.)
 *
 *   ★ 그래서 «디스크»를 본다. 그리고 사람이 열어야 할 폴더만 남긴다 —
 *     아무것도 안 남은 폴더는 아예 안 찍는다. 스무 줄이 세 줄이 된다.
 *
 * ■ 무엇을 「남은 일」로 보나 — 넷
 *     손댄 파일     git status  — 저장만 하고 커밋을 안 한 것
 *     안 올린 커밋   커밋은 했는데 위(upstream·origin/main)에 없는 것
 *     넣어둔 것     git stash   — 「잠깐 치워 둔」 것. 이것이 가장 잘 잊힌다
 *     못 읽음       git 이 화내는 폴더. 조용히 빼면 그것이 곧 놓친 일이 된다
 *
 *   ⚠ 넉넉한 쪽으로 틀린다 — 다 끝났는데 자동 생성물만 남은 폴더도 뜬다.
 *     **남은 일을 놓치는 것보다 한 줄 더 보는 편이 싸다.**
 *
 * ■ 윈도우에서 돌아야 한다 (STATUS.md 「CI 는 초록인데 내 컴퓨터는 빨갛다」)
 *   · bash 를 안 쓴다 — execFileSync('git', […]). PowerShell 창에 bash 가 없다
 *   · 경로는 찍기 전에 한 곳에서 '/' 로 고른다 — 역슬래시가 섞이면 눈이 아프다
 *   · 줄끝은 읽을 때 한 번 고른다 — CRLF 로 내려오는 저장소다
 *   · 작업트리의 `.git` 은 폴더가 아니라 «파일»이다. 둘 다 받는다
 *
 * ■ 한 폴더는 «한 줄» (대표 지시 2026-08-30)
 *   자리가 넓어도 두 줄로 만들지 않는다. 폴더 스무 개가 마흔 줄이 되면
 *   한 화면에 안 들어오고, 그러면 이 연장을 만든 뜻이 없어진다.
 *
 * 쓰기:  node tools/leftover-scan.js              이 저장소의 «윗 폴더»를 훑는다
 *        node tools/leftover-scan.js D:\code      그 폴더를 훑는다
 *        node tools/leftover-scan.js --all        깨끗한 폴더까지 다 찍는다
 *        node tools/leftover-scan.js --depth 3    더 깊이 찾는다 (기본 2)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/* 한 곳에서 '/' 로 고른다 — tools/dead-code.js 가 역슬래시로 데인 자리와 같은 까닭 */
function 곧은길(p) { return String(p).split(path.sep).join('/'); }

/* 줄끝을 읽을 때 한 번 고른다 — 정규식마다 \r? 를 붙이는 것보다 한 곳이 낫다 */
function 줄들(s) {
  return String(s).replace(/\r\n/g, '\n').split('\n').filter(function (l) { return l !== ''; });
}

/* git 을 부른다. 화내면 null — 부르는 쪽이 「못 읽음」으로 다룬다.
   ⚠ shell 을 안 쓴다. 윈도우에서 git 은 git.exe 라 그대로 불린다. */
function git(dir, args) {
  try {
    return execFileSync('git', args, {
      cwd: dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) { return null; }
}

/* ── 저장소 폴더 찾기 ──
   ⚠ 작업트리·서브모듈은 `.git` 이 «파일»이다. 폴더만 찾으면 스무 곳 중 열아홉을 놓친다. */
function 저장소인가(dir) {
  try { return fs.existsSync(path.join(dir, '.git')); } catch (e) { return false; }
}

const 건너뛸이름 = /^(node_modules|\.git|\.venv|venv|__pycache__|dist|build|coverage|\.next|\.cache)$/;

function 찾기(base, 남은깊이, 모음, 한도) {
  if (모음.length >= 한도) return 모음;
  let 목록;
  try {
    목록 = fs.readdirSync(base, { withFileTypes: true });
  } catch (e) { return 모음; }

  if (저장소인가(base)) 모음.push(base);

  if (남은깊이 <= 0) return 모음;
  목록.forEach(function (d) {
    if (모음.length >= 한도) return;
    if (!d.isDirectory() || 건너뛸이름.test(d.name)) return;
    /* ⚠ 저장소 «안»에도 작업트리를 두는 사람이 있어 안쪽까지 본다.
       그래서 깊이를 기본 2 로 좁게 두었다 — 안 그러면 저장소 전체를 훑는다. */
    찾기(path.join(base, d.name), 남은깊이 - 1, 모음, 한도);
  });
  return 모음;
}

/* ── 폴더 하나를 잰다 ── */
function 재기(dir) {
  const r = { dir: dir, 가지: '', 손댄: 0, 안올린: 0, 넣어둔: 0, 마지막: '', 못읽음: '' };

  const 가지 = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (가지 === null) { r.못읽음 = 'git 이 이 폴더를 못 읽습니다'; return r; }
  r.가지 = 줄들(가지)[0] || '(가지 없음)';

  const st = git(dir, ['status', '--porcelain']);
  if (st === null) r.못읽음 = 'status 를 못 읽습니다';
  else r.손댄 = 줄들(st).length;

  /* 위(upstream)가 정해져 있으면 그것과, 없으면 origin/main 과 견준다.
     ⚠ 둘 다 없으면 «한 번도 올린 적 없는» 폴더다 — 0 으로 두지 말고 그렇다고 적는다.
       조용히 0 이라고 하면 가장 위험한 폴더가 목록에서 사라진다. */
  const 위 = git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  let 기준 = 위 !== null ? (줄들(위)[0] || '') : '';
  if (!기준 && git(dir, ['rev-parse', '--verify', 'origin/main']) !== null) 기준 = 'origin/main';
  if (기준) {
    const 앞선것 = git(dir, ['log', '--oneline', 기준 + '..HEAD']);
    if (앞선것 !== null) r.안올린 = 줄들(앞선것).length;
  } else {
    r.못읽음 = r.못읽음 || '올린 적이 없습니다 — 견줄 origin 이 없습니다';
  }

  const stash = git(dir, ['stash', 'list']);
  if (stash !== null) r.넣어둔 = 줄들(stash).length;

  const 날 = git(dir, ['log', '-1', '--format=%cd', '--date=format:%m-%d %H:%M']);
  if (날 !== null) r.마지막 = 줄들(날)[0] || '';

  return r;
}

function 남은일있나(r) {
  return r.손댄 > 0 || r.안올린 > 0 || r.넣어둔 > 0 || !!r.못읽음;
}

/* ── 한 줄로 찍는다 ──
   ⚠ 폭은 «글자 수»가 아니라 «칸 수»다 — 한글은 두 칸을 먹는다.
     이것을 두 곳에서 따로 세다가 표 머리와 값이 두 칸 어긋났다(2026-09-07 실측).
     그래서 세는 자리를 하나로 모았다 — 한쪽만 고치면 다시 어긋난다. */
function 칸수(s) {
  let w = 0;
  for (const ch of String(s == null ? '' : s)) {
    w += /[\u1100-\u11FF\u3000-\u303F\u3130-\u318F\uAC00-\uD7AF\uFF01-\uFF60]/.test(ch) ? 2 : 1;
  }
  return w;
}

/* 글은 왼쪽으로 */
function 왼칸(s, n) {
  s = String(s == null ? '' : s);
  const w = 칸수(s);
  return w >= n ? s + ' ' : s + ' '.repeat(n - w);
}

/* 숫자는 오른쪽으로 — 자릿수가 갈려도 눈이 한 줄을 따라간다 */
function 오른칸(s, n) {
  s = String(s == null ? '' : s);
  const w = 칸수(s);
  return w >= n ? s + ' ' : ' '.repeat(n - w - 1) + s + ' ';
}

function main() {
  const argv = process.argv.slice(2);
  const 다찍기 = argv.indexOf('--all') >= 0;
  let 깊이 = 2;
  const di = argv.indexOf('--depth');
  if (di >= 0 && argv[di + 1] !== undefined) {
    /* ⚠ `parseInt(…) || 2` 로 쓰면 «0 이 거짓»이라 --depth 0 이 조용히 2 로 돌아간다.
       0 은 「윗 폴더 자신만 보라」는 뜻이 있는 값이다 — 검사가 이 자리를 잡았다. */
    const n = parseInt(argv[di + 1], 10);
    깊이 = Number.isNaN(n) ? 2 : Math.max(0, Math.min(6, n));
  }
  const 자리들 = argv.filter(function (a, i) {
    return a.indexOf('--') !== 0 && !(di >= 0 && i === di + 1);
  });
  /* 기본은 «이 저장소의 윗 폴더» — 작업트리는 나란히 두는 것이 보통이다 */
  const base = path.resolve(자리들[0] || path.join(ROOT, '..'));

  if (!fs.existsSync(base)) {
    console.log('그런 폴더가 없습니다: ' + 곧은길(base));
    process.exitCode = 1;
    return;
  }

  const 폴더들 = 찾기(base, 깊이, [], 400);
  const 잰것 = 폴더들.map(재기);
  const 손볼것 = 잰것.filter(남은일있나);
  const 볼것 = 다찍기 ? 잰것 : 손볼것;

  console.log('훑은 곳 : ' + 곧은길(base) + '   (깊이 ' + 깊이 + ')');
  console.log('저장소   : ' + 폴더들.length + '곳   →   손볼 곳 ' + 손볼것.length + '곳');
  console.log('');

  if (!볼것.length) {
    console.log('✅ 남은 일이 없습니다 — 어느 방도 열어 보실 것이 없습니다.');
    console.log('   (커밋도 다 됐고, 올리지 않은 것도 없고, 치워 둔 것도 없습니다.)');
    return;
  }

  console.log(왼칸('가지', 34) + 오른칸('손댄', 8) + 오른칸('안올린', 9) + 오른칸('넣어둠', 9)
    + '  ' + 왼칸('마지막', 14) + '폴더');
  console.log('-'.repeat(112));
  /* 급한 것부터 — 남은 것이 많은 폴더가 가장 잊기 쉽다 */
  볼것.slice().sort(function (a, b) {
    return (b.손댄 + b.안올린 + b.넣어둔) - (a.손댄 + a.안올린 + a.넣어둔);
  }).forEach(function (r) {
    console.log(왼칸(r.가지, 34) + 오른칸(r.손댄 || '·', 8) + 오른칸(r.안올린 || '·', 9)
      + 오른칸(r.넣어둔 || '·', 9) + '  ' + 왼칸(r.마지막 || '·', 14) + 곧은길(r.dir)
      + (r.못읽음 ? '   ⚠ ' + r.못읽음 : ''));
  });

  console.log('');
  console.log('■ 다음에 하실 일');
  console.log('   위에 뜬 폴더에서만 방을 여시면 됩니다 :  claude --continue');
  console.log('   안 뜬 폴더는 남은 것이 없습니다 — 열어 보실 것이 없습니다.');
  console.log('');
  console.log('   손댄       저장만 하고 커밋을 안 한 파일 수');
  console.log('   안올린     커밋했는데 GitHub 에 없는 것 — PR 이 안 나갔습니다');
  console.log('   넣어둠     git stash 로 잠깐 치워 둔 것 — 가장 잘 잊힙니다');
}

main();
