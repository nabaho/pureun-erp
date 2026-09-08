#!/usr/bin/env node
'use strict';
/* 창고(Storage) 규칙 올리개 — 안전장치 딸림 (2026-09-08)
 *
 * ★★ 왜 만들었나 — 실시간DB 규칙은 `scripts/rules-deploy.js` 가 «살아 있는 콘솔»을
 *   읽어 견주고 사라질 규칙이 있으면 멈춘다. 그런데 «창고 규칙에는 그것이 아예 없었다».
 *   그래서 여태 사람이 콘솔에 붙여넣게 했고, 그 붙여넣기가 밀려 서고 원본·메일 첨부가
 *   담기지 못한 채 남았다.
 *
 * ⚠⚠ 창고 규칙은 «CLI 로 읽을 수 없다». `firebase deploy --only storage` 는 있는데
 *   「지금 규칙 보기」가 없다(실시간DB 의 `database:get /.settings/rules` 같은 것이 없다).
 *   그래서 기준은 «대표님이 콘솔에서 옮겨 주신 파일»이다 —
 *   docs/firebase-storage-콘솔원문-YYYY-MM-DD.txt 중 가장 최신 것.
 *   ★ 이것이 실시간DB 쪽보다 약한 안전장치임을 «숨기지 않는다» — 화면에 그대로 적는다.
 *
 * 안전장치 둘:
 *   ① 기준에 있던 «칸·허락·보조함수»가 하나라도 사라지면 멈춘다(종료코드 2)
 *   ② 앱이 실제로 쓰는 창고 자리가 «덮이지 않으면» 멈춘다
 *      — 누가 파일을 손보다 pu_photos 를 빠뜨리면 사진첩이 통째로 멎는다
 *
 * ⚠ 루트 firebase.json 에 storage 를 «넣지 말 것» — 넣으면 다른 세션이 그냥
 *   `firebase deploy` 할 때 창고 규칙이 함께 나간다(CLAUDE.md 가 database 로 이미 겪었다).
 *   그래서 이 스크립트는 «임시 설정 파일»을 만들어 --config 로 넘긴다.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const 올릴것 = path.join(ROOT, 'docs', 'firebase-storage-전체(붙여넣기용).txt');

/* 규칙을 넣어야 하는 창고들 — 앱마다 창고가 다르다.
   ⚠ 이름을 «코드에서 확인한 것»으로 둔다(pu-photos.html · pu-cards.html · pu-paydata.html
     의 storageBucket). 여기가 틀리면 엉뚱한 창고에 규칙이 나간다. */
const BUCKETS = [
  { name: 'pureun-erp-hrphotos', 쓰는곳: '사진첩 · 서고 원본 · 자문 증빙' },
  { name: 'pureun-erp-photos', 쓰는곳: '기업정보함(명함) · 메일 첨부' },
  { name: 'pureun-erp.firebasestorage.app', 쓰는곳: '급여데이터함' }
];

/* 앱이 실제로 쓰는 창고 자리 — 덮이지 않으면 그 기능이 통째로 멎는다.
 *
 * ⚠⚠ «앞토막»(pu_photos/u/)으로 적지 말 것. 처음에 그렇게 했더니 좁은 규칙이
 *   넓은 자리를 덮는 것으로 세어졌다 — `pu_photos/u/{uid}/origs/**` 하나가 남아 있으면
 *   사진 담는 칸(`…/blobs/…`)을 빼도 「덮였다」로 통과했다. 사진첩이 통째로 멎는데.
 * ★ 그래서 «실제로 쓰는 한 길»을 그대로 적고, 규칙이 그 길에 맞는지 본다.
 *   여기 적은 것은 코드에서 확인한 모양이다 — 새 자리를 쓰는 기능을 붙이면 여기도 적는다. */
const 쓰는자리 = [
  ['pu_photos/u/UID/blobs/2026/K.jpg', '사진첩 사진 담기 (js/pu-photo-store.js BUCKET_ROOT)'],
  ['pu_photos/u/UID/thumbs/2026/K.jpg', '사진첩 미리보기'],
  ['pu_photos/u/UID/origs/2026/K.hwp', '사진첩 한글 원본'],
  ['pu_photos/_probe/1757000000.txt', '사진첩 쓰기 확인 (probePath)'],
  ['pucards/photos/PID', '기업정보함 명함'],
  ['pucards/mailout/UID/F.pdf', '메일에 붙일 내 PC 파일'],
  ['pu_paydata/UID/202608/F.pdf', '급여데이터함'],
  ['casebook/site_X/2019/after.hwp', '취업규칙 서고 원본'],
  ['gov_evidence/SID/F.png', '자문관리 증빙']
];

/* 규칙 한 칸이 «이 길»에 맞나 — 창고 규칙의 짝짓기를 그대로 흉내낸다.
     {이름}         한 토막에 맞는다
     {이름=**}      남은 토막 «전부»에 맞는다(한 토막 이상)
     그 밖          글자 그대로 같아야 한다
   ⚠ 맨 아래 `/{allPaths=**}`(다 막는 칸)는 «덮는 것으로 세지 않는다» —
     그것은 `allow read, write: if false` 라서, 세면 모든 길이 덮인 것이 된다. */
function 칸이맞나(칸길, 길) {
  const r = String(칸길).replace(/^\//, '').split('/');
  const p = String(길).split('/');
  let i = 0;
  for (; i < r.length; i++) {
    const 토막 = r[i];
    if (/^\{[^}]*=\*\*\}$/.test(토막)) return p.length > i;   // 남은 것 전부(하나 이상)
    if (i >= p.length) return false;
    if (/^\{[^}]*\}$/.test(토막)) continue;                    // 한 토막
    if (토막 !== p[i]) return false;
  }
  return i === p.length;
}

function 최신기준() {
  const dir = path.join(ROOT, 'docs');
  const 것들 = fs.readdirSync(dir)
    .filter(function (f) { return /^firebase-storage-콘솔원문-\d{4}-\d{2}-\d{2}\.txt$/.test(f); })
    .sort();
  if (!것들.length) return null;
  return path.join(dir, 것들[것들.length - 1]);
}

/* 주석을 걷는다 — 주석 안의 글귀가 「규칙이 있다」로 읽히면 안 된다
   (저장소 규칙: 소스를 글자로 보는 검사는 주석을 먼저 걷는다). */
function 주석걷기(s) {
  return String(s || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/* 규칙 글을 «칸 → 허락 줄» 로 읽는다. 여기에 화면도 Firebase 도 없다 — 검사가 돈다.
 *
 * ⚠⚠ 정규식 하나로 `match … { … }` 를 잡으려 하지 «말 것». 처음에 그렇게 했다가
 *   겉 칸(`/b/{bucket}/o {`)이 게으른 짝짓기로 «첫 안쪽 칸을 통째로 삼켰다» —
 *   그래서 pucards/photos 가 없는 것으로 읽혔고, 안전장치가 «멀쩡한 파일»을 물었다.
 *   중괄호를 세어야 한다. 규칙은 중첩되므로 이것 말고는 길이 없다.
 * ⚠ 칸 이름에 `{uid}` 같은 것이 들어 있어 `{` 로 끊어도 안 된다 —
 *   여는 중괄호는 «줄 끝의 것»이다.
 */
function 뜯기(src) {
  const s = 주석걷기(src);
  const 줄 = s.split(/\r?\n/);
  const 칸 = {};
  const 함수 = {};
  const 쌓임 = [];            // 지금 열려 있는 칸 이름들(겉에서 안으로)
  let 깊이 = 0;
  let 함수이름 = null, 함수몸 = [], 함수깊이 = -1;

  줄.forEach(function (l) {
    const 여는것 = /^\s*match\s+(.+?)\s*\{\s*$/.exec(l);
    const 함수여는것 = /^\s*function\s+([a-zA-Z_$][\w$]*)\s*\(\)\s*\{\s*$/.exec(l);

    if (여는것) { 쌓임.push({ 길: 여는것[1], 깊이: 깊이 }); }
    else if (함수여는것) { 함수이름 = 함수여는것[1]; 함수몸 = []; 함수깊이 = 깊이; }
    else if (함수이름 !== null && !/\}/.test(l)) { 함수몸.push(l.trim()); }
    else if (쌓임.length) {
      /* ⚠ 허락 한 줄을 «줄 단위로» 읽으면 안 된다 — 여러 줄로 쓴 것이 흔하다
           (origs·casebook·mailout 이 그렇다). 줄에서 바로 뽑으면 그것들이 통째로
           빠지고, 기준이 여러 줄로 바뀐 날 «헛멈춤»이 난다. 헛멈춤은 다음 사람이
           --force 를 만들게 하므로, 없는 것보다 나쁘다.
         ★ 그래서 «가장 안쪽 열린 칸»에 줄을 쌓아 두고, 닫힐 때 한꺼번에 뽑는다. */
      const 안쪽 = 쌓임[쌓임.length - 1];
      (안쪽.몸 || (안쪽.몸 = [])).push(l);
    }

    /* 중괄호를 센다 — 여는 것을 먼저 세면 같은 줄에서 열고 닫는 것이 어긋난다 */
    const 열림 = (l.match(/\{/g) || []).length;
    const 닫힘 = (l.match(/\}/g) || []).length;
    깊이 += 열림 - 닫힘;

    if (함수이름 !== null && 깊이 <= 함수깊이) {
      함수[함수이름] = 함수몸.join(' ').replace(/\s+/g, ' ').trim();
      함수이름 = null; 함수몸 = []; 함수깊이 = -1;
    }
    while (쌓임.length && 깊이 <= 쌓임[쌓임.length - 1].깊이) {
      const 닫힌것 = 쌓임.pop();
      const 몸글 = (닫힌것.몸 || []).join('\n');
      const 허락 = (몸글.match(/allow[^;]*;/g) || [])
        .map(function (x) { return x.replace(/\s+/g, ' ').trim(); });
      /* 같은 칸이 두 번 나오면 «합친다» — 나중 것이 앞것을 지우지 않는다 */
      if (허락.length) 칸[닫힌것.길] = (칸[닫힌것.길] || []).concat(허락);
      else if (!칸[닫힌것.길]) 칸[닫힌것.길] = [];
    }
  });
  return { 칸: 칸, 함수: 함수 };
}

function main() {
  const argv = process.argv.slice(2);
  const 올린다 = argv.indexOf('--deploy') >= 0;

  if (!fs.existsSync(올릴것)) {
    console.error('올릴 규칙 파일이 없습니다: ' + 올릴것);
    process.exit(1);
  }
  const 새것글 = fs.readFileSync(올릴것, 'utf8');
  const 새것 = 뜯기(새것글);

  const 기준길 = 최신기준();
  console.log('');
  if (기준길) {
    console.log('기준: ' + path.basename(기준길) + ' (대표님이 콘솔에서 옮겨 주신 것)');
  } else {
    console.log('⚠ 기준 파일이 없습니다 — 사라지는 규칙을 «가려낼 수가 없습니다».');
  }
  console.log('⚠ 창고 규칙은 CLI 로 읽을 수 없어, 실시간DB 쪽보다 «약한» 안전장치입니다.');
  console.log('');

  const 멈출까 = [];

  /* ── 안전장치 ① 기준에 있던 것이 사라지지 않는가 ───────────────── */
  if (기준길) {
    const 기준 = 뜯기(fs.readFileSync(기준길, 'utf8'));
    const 사라진칸 = Object.keys(기준.칸).filter(function (k) { return !새것.칸[k]; });
    사라진칸.forEach(function (k) { 멈출까.push('칸이 사라집니다: ' + k); });

    Object.keys(기준.칸).forEach(function (k) {
      if (!새것.칸[k]) return;
      기준.칸[k].forEach(function (a) {
        if (새것.칸[k].indexOf(a) < 0) 멈출까.push('허락이 사라집니다: ' + k + ' — ' + a);
      });
    });

    Object.keys(기준.함수).forEach(function (f) {
      if (새것.함수[f] === undefined) { 멈출까.push('보조 함수가 사라집니다: ' + f + '()'); return; }
      if (새것.함수[f] !== 기준.함수[f]) {
        멈출까.push('보조 함수가 «달라집니다»: ' + f + '()\n'
          + '      기준: ' + 기준.함수[f] + '\n      새것: ' + 새것.함수[f]);
      }
    });

    const 새칸 = Object.keys(새것.칸).filter(function (k) { return !기준.칸[k]; });
    console.log('■ 새로 생기는 칸 ' + 새칸.length + '개');
    새칸.forEach(function (k) { console.log('   + ' + k); });
    console.log('■ 사라지는 것 ' + 멈출까.length + '개');
  }

  /* ── 안전장치 ② 앱이 쓰는 자리가 덮이는가 ─────────────────────── */
  const 안덮인것 = 쓰는자리.filter(function (쌍) {
    return !Object.keys(새것.칸).some(function (k) {
      if (k === '/{allPaths=**}' || k === '/b/{bucket}/o') return false;   // 다 막는 칸·겉 칸
      return 칸이맞나(k, 쌍[0]);
    });
  });
  안덮인것.forEach(function (쌍) {
    멈출까.push('앱이 쓰는 자리가 안 덮입니다: ' + 쌍[0] + '  (' + 쌍[1] + ')');
  });
  console.log('■ 앱이 쓰는 자리 ' + 쓰는자리.length + '곳 가운데 안 덮인 것 ' + 안덮인것.length + '곳');
  console.log('');

  if (멈출까.length) {
    console.error('✖ 멈췄습니다 — 올리지 않았습니다.');
    멈출까.forEach(function (x) { console.error('   · ' + x); });
    console.error('');
    console.error('  고칠 곳은 docs/firebase-storage-전체(붙여넣기용).txt 하나입니다.');
    console.error('  기준에 있던 것을 «지우지 말고» 더하세요 — 창고 규칙은 통째로 갈아 끼웁니다.');
    console.error('  ⚠ --force 같은 길을 만들지 마세요. 이 멈춤 하나가 안전장치 전부입니다.');
    process.exit(2);
  }

  if (!올린다) {
    console.log('여기까지가 «보여만 주는» 단계입니다. 올리려면:');
    console.log('   node scripts/storage-rules-deploy.js --deploy');
    console.log('올릴 창고 ' + BUCKETS.length + '곳:');
    BUCKETS.forEach(function (b) { console.log('   · ' + b.name + '  (' + b.쓰는곳 + ')'); });
    return;
  }

  /* ── 올린다 ─────────────────────────────────────────────────────
     ⚠ 창고마다 «따로» 올린다. 한 곳이 실패해도 나머지는 올라가야 하고,
       무엇이 올라가고 무엇이 안 올라갔는지 «그대로» 말해야 한다. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-storage-'));
  const 규칙사본 = path.join(tmp, 'storage.rules');
  fs.writeFileSync(규칙사본, 새것글, 'utf8');

  const 결과 = [];
  BUCKETS.forEach(function (b) {
    const cfg = path.join(tmp, 'firebase-' + b.name.replace(/[^\w.-]/g, '_') + '.json');
    fs.writeFileSync(cfg, JSON.stringify({
      storage: [{ bucket: b.name, rules: 규칙사본 }]
    }, null, 2), 'utf8');
    console.log('⏳ ' + b.name + ' 에 올리는 중…');
    const r = cp.spawnSync('npx', ['firebase-tools@latest', 'deploy', '--only', 'storage',
      '--project', 'pureun-erp', '--config', cfg, '--non-interactive'],
      { cwd: ROOT, encoding: 'utf8', shell: true, timeout: 600000 });
    const 됐나 = r.status === 0;
    결과.push({ name: b.name, 됐나: 됐나, 말: String((r.stderr || '') + (r.stdout || '')).slice(-600) });
    console.log(됐나 ? '   ✅ 올렸습니다' : '   ✖ 실패했습니다');
  });

  console.log('');
  const 성공 = 결과.filter(function (x) { return x.됐나; });
  console.log('창고 ' + 성공.length + ' / ' + 결과.length + ' 곳에 올렸습니다.');
  결과.filter(function (x) { return !x.됐나; }).forEach(function (x) {
    console.log('');
    console.log('✖ ' + x.name + ' — 올리지 못했습니다:');
    console.log(x.말);
  });
  if (성공.length !== 결과.length) {
    console.log('');
    console.log('⚠ 일부만 올라갔습니다. «어느 창고가 안 올라갔는지» 위에 그대로 적혀 있습니다 —');
    console.log('  그 창고를 쓰는 기능만 옛 규칙으로 돕니다.');
    process.exitCode = 1;
    return;
  }
  console.log('');
  console.log('✅ 다 올렸습니다. 콘솔에서 눈으로 한 번 확인해 주세요: Storage › 창고 › 규칙');
  console.log('⚠ 다음에 콘솔 규칙을 손으로 고치시면 그 내용을');
  console.log('   docs/firebase-storage-콘솔원문-<날짜>.txt 로 남겨 주세요 — 그것이 다음 기준입니다.');
}

if (require.main === module) main();
module.exports = { 뜯기: 뜯기, 주석걷기: 주석걷기, 칸이맞나: 칸이맞나, BUCKETS: BUCKETS, 쓰는자리: 쓰는자리, 최신기준: 최신기준 };
