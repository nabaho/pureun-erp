#!/usr/bin/env node
/* 「멈춘 방 다시 열고 폰에 붙이기」 — 두 번 누르면 끝나게 (대표 지시 2026-09-07 「아주쉽게 준비」)
 *
 * ■ 무엇을 대신하나
 *   대표가 손으로 하시려면 폴더마다 이렇게 해야 한다:
 *       그 폴더로 들어가서  →  claude --continue  →  방이 뜨면  /rc
 *   폴더가 스무 개면 예순 번이다. 그것을 «두 번 누르기»로 줄인다.
 *
 * ■ 어떻게 쉬워지나
 *   ① 저장소 맨 위의 «멈춘방-열기.bat» 을 두 번 누른다 (윈도우)
 *   ② 남은 일이 있는 폴더만 목록으로 보이고 「엽니까?」를 묻는다
 *   ③ y 를 누르면 그 폴더마다 창을 하나씩 띄우고 «리모트에 붙은 채로» 방을 되살린다
 *
 * ■ ★ 셈은 tools/leftover-scan.js 에서 «빌려 쓴다»
 *   여기서 다시 세면 「훑기는 3곳이라는데 열기는 5곳을 연다」가 된다.
 *   ⚠ 훑는 잣대를 고칠 일이 생기면 leftover-scan.js «한 곳»만 고친다.
 *
 * ■ 일부러 그렇게 한 것
 *   · **묻고 나서 연다.** 창 스무 개가 갑자기 뜨면 그것이 사고다.
 *     `--go` 를 주면 안 묻는다(스스로 돌릴 때). 아무것도 안 주면 «묻는다».
 *   · **--dry 는 열지 않고 «열 명령만» 보인다.** 무엇이 돌지 미리 보는 자리이고,
 *     검사가 이 길로 확인한다(검사가 창 스무 개를 띄우면 안 된다).
 *   · **`claude --continue --rc` 한 줄로 끝낸다.** 방을 되살리는 것과 리모트에 붙이는 것을
 *     한 번에 한다 — 사람이 방 안에서 다시 /rc 를 칠 일이 없다.
 *   · **윈도우가 아니면 창을 못 띄운다** — 그때는 «돌릴 명령»을 찍고 끝낸다.
 *     띄운 척하지 않는다.
 *
 * 쓰기:  node tools/rc-open.js            묻고 나서 연다
 *        node tools/rc-open.js --dry      열지 않고 «열 명령»만 보인다
 *        node tools/rc-open.js --go       안 묻고 바로 연다
 *        node tools/rc-open.js D:\code    그 폴더를 훑는다
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const 훑기 = require('./leftover-scan.js');

const ROOT = path.resolve(__dirname, '..');
const 윈도우 = process.platform === 'win32';

/* 한 폴더를 되살리고 리모트에 붙이는 «그 한 줄» — 이름을 여기 하나로 둔다 */
function 여는명령(dir) {
  return 'cd /d "' + dir + '" && claude --continue --rc';
}

/* ── ★ 결정을 «화면·플랫폼»에서 떼어낸다 ──
   무엇을 열지, 열어도 되는지를 정하는 곳. 창을 띄우거나 찍는 일은 안 한다.

   ⚠ 왜 떼어냈나 — 이 결정을 main 안에 두었더니 **리눅스에서 검사할 길이 없었다.**
     윈도우가 아니면 그 앞에서 되돌아 나가므로, 「묻지 않고 연다」·「--dry 를 무시한다」·
     「창이 아닌데 예로 본다」 같은 고장을 넣어도 검사가 안 물었다(2026-09-07 고장넣기 실측).
     CI 는 리눅스다 — 거기서 못 보는 자리는 «검사가 없는» 자리다.

   물기(): 사람에게 묻는 일. 필요한 갈래에서만 부른다 —
     ⚠ --dry 나 윈도우 아닌 곳에서 물으면 «묻지 말아야 할 때 묻는» 것이 된다. */
function 결정(손볼것, 뜻) {
  const 명령들 = 손볼것.map(function (r) { return 여는명령(r.dir); });
  if (!손볼것.length) return { 무엇: '없음', 명령들: [] };
  if (뜻.마른것) return { 무엇: '보이기만', 명령들: 명령들 };
  if (!뜻.윈도우) return { 무엇: '손으로', 명령들: 명령들 };
  if (!뜻.바로) {
    /* ⚠ 창(TTY)이 아니면 «물을 수가 없다» — 그때는 아니오다.
       이 판단을 물음 함수 안에 두면 윈도우 아닌 곳에서 검사할 길이 없다.
       여기로 올려 두면 어느 컴퓨터에서나 이 규칙을 잰다. */
    if (!뜻.창인가) return { 무엇: '안엶', 명령들: 명령들 };
    if (!뜻.물기()) return { 무엇: '안엶', 명령들: 명령들 };
  }
  return { 무엇: '엶', 명령들: 명령들 };
}

/* 물음 하나를 받는다. 창이 아닌 곳(파이프)에서는 묻지 않고 «아니오»로 본다 —
   ⚠ 물음에 답이 없는데 여는 쪽으로 기울면, 검사나 자동 실행이 창을 스무 개 띄운다. */
function 예인가물음(글, 창인가) {
  /* ⚠ 창인가를 «반드시 넘겨받는다» — 기본값을 두지 않는다.
     처음엔 `창인가 === undefined` 면 process.stdin.isTTY 를 보게 두었는데,
     그 기본값을 지우는 고장이 검사에 안 물었다(지워도 리눅스에서는 똑같이 돌기 때문).
     넘기게 하면 «지울 기본값 자체가 없어» 그 고장이 생길 수 없다 —
     검사로 잡는 것보다 «못 생기게» 짜는 편이 낫다. */
  if (!창인가) return false;
  process.stdout.write(글);
  const buf = Buffer.alloc(64);
  let n = 0;
  try { n = fs.readSync(0, buf, 0, 64, null); } catch (e) { return false; }
  const 답 = buf.slice(0, n).toString('utf8').trim().toLowerCase();
  return 답 === 'y' || 답 === 'yes' || 답 === 'ㅛ';
}

function main() {
  const argv = process.argv.slice(2);
  const 마른것 = argv.indexOf('--dry') >= 0;
  const 바로 = argv.indexOf('--go') >= 0;
  let 깊이 = 2;
  const di = argv.indexOf('--depth');
  if (di >= 0 && argv[di + 1] !== undefined) {
    const n = parseInt(argv[di + 1], 10);
    깊이 = Number.isNaN(n) ? 2 : Math.max(0, Math.min(6, n));
  }
  const 자리들 = argv.filter(function (a, i) {
    return a.indexOf('--') !== 0 && !(di >= 0 && i === di + 1);
  });
  const base = path.resolve(자리들[0] || path.join(ROOT, '..'));

  if (!fs.existsSync(base)) {
    console.log('그런 폴더가 없습니다: ' + 훑기.곧은길(base));
    process.exitCode = 1;
    return;
  }

  /* ★ 셈은 빌려 쓴다 — 여기서 다시 세지 않는다 */
  const 손볼것 = 훑기.찾기(base, 깊이, [], 400).map(훑기.재기).filter(훑기.남은일있나);

  console.log('훑은 곳 : ' + 훑기.곧은길(base));
  console.log('');

  if (!손볼것.length) {
    console.log('✅ 열어 볼 방이 없습니다 — 남은 일이 있는 폴더가 하나도 없습니다.');
    console.log('   (커밋도 다 됐고, 올리지 않은 것도 없고, 치워 둔 것도 없습니다.)');
    return;
  }

  console.log('■ 남은 일이 있는 폴더 ' + 손볼것.length + '곳 — 이것만 엽니다');
  손볼것.forEach(function (r, i) {
    const 짐 = [];
    if (r.손댄) 짐.push('손댄 ' + r.손댄);
    if (r.안올린) 짐.push('안올린 ' + r.안올린);
    if (r.넣어둔) 짐.push('넣어둠 ' + r.넣어둔);
    if (r.못읽음) 짐.push(r.못읽음);
    console.log('  ' + (i + 1) + '. ' + r.가지 + '   [' + 짐.join(' · ') + ']   ' + 훑기.곧은길(r.dir));
  });
  console.log('');

  /* ★ 결정은 위 함수가 한다 — 여기서는 그 결정을 «따르기만» 한다 */
  const 답 = 결정(손볼것, {
    마른것: 마른것, 바로: 바로, 윈도우: 윈도우, 창인가: !!process.stdin.isTTY,
    물기: function () {
      /* 여기 닿았다는 것은 «창이고 --go 가 아니다» — 결정이 그것을 이미 걸렀다 */
      return 예인가물음('창 ' + 손볼것.length + '개를 띄웁니다. 여시겠습니까? (y / 그 밖의 키=아니오) ', true);
    },
  });

  if (답.무엇 === '보이기만') {
    console.log('■ 돌릴 명령 (--dry 라 «열지 않았습니다»)');
    답.명령들.forEach(function (c) { console.log('  ' + c); });
    return;
  }

  if (답.무엇 === '손으로') {
    /* 창을 못 띄우는 곳에서는 띄운 척하지 않는다 */
    console.log('■ 이 컴퓨터에서는 창을 띄울 수 없습니다 (윈도우가 아닙니다).');
    console.log('   폴더마다 아래를 돌리시면 같습니다:');
    답.명령들.forEach(function (c) { console.log('  ' + c); });
    return;
  }

  if (답.무엇 === '안엶') {
    console.log('');
    console.log('안 열었습니다. 무엇이 돌지 먼저 보시려면:  node tools/rc-open.js --dry');
    return;
  }

  console.log('');
  손볼것.forEach(function (r) {
    /* start 로 «새 창»을 띄운다. /k 는 방이 끝나도 창을 남긴다 —
       ⚠ /c 로 하면 오류 메시지가 창과 함께 사라져 까닭을 못 본다. */
    const p = spawn('cmd', ['/c', 'start', '', 'cmd', '/k', 여는명령(r.dir)],
      { detached: true, stdio: 'ignore', windowsVerbatimArguments: false });
    p.unref();
    console.log('  열었습니다 : ' + 훑기.곧은길(r.dir));
  });

  console.log('');
  console.log('■ 다음');
  console.log('   창마다 방이 되살아나고 «리모트에 붙은 채로» 뜹니다.');
  console.log('   폰에서 claude.ai/code 를 열면 그 방들이 목록에 보입니다.');
  console.log('   그때 저에게 「붙었다」고 말씀하시면, 어느 방이 무엇을 하다 멈췄는지 정리해 드립니다.');
}

if (require.main === module) main();
module.exports = { 여는명령: 여는명령, 결정: 결정, 예인가물음: 예인가물음 };
