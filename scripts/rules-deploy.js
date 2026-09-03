#!/usr/bin/env node
/* 파이어베이스 «규칙 배포» — 손으로 붙여넣지 않는다 (대표 지시 2026-09-03)
   「파이어베이스에 매번 내가 이렇게 반복하는것 너무 귀찮은데
     니가 연결하고 내가 확인해서 승인하는 방식을 만들 수 없나?」

   ■ 쓰는 법
       node scripts/rules-deploy.js            보여만 준다 (아무것도 안 바꾼다)
       node scripts/rules-deploy.js --deploy   실제로 올린다

   ■ 무엇을 지키나
     ⚠ 규칙은 «한 번 잘못 올리면 전부가 바뀐다». 그래서 올리기 전에 반드시
       «마지막으로 콘솔에서 확인한 규칙»과 견주어, 사라질 것이 하나라도 있으면 «멈춘다».
       다른 세션이나 다른 사람이 콘솔에서 직접 더한 규칙을 내 파일이 모른 채 덮는 것이
       가장 위험하다 — 그것 하나를 막기 위해 이 조심이 있다.
     ⚠ 기준 파일은 docs/firebase-rules-콘솔원문-YYYY-MM-DD.json 중 «가장 최근» 것이다.
       올리기가 끝나면 올린 내용으로 새 기준을 남긴다 — 다음 번 견줄 자리가 된다.
     ⚠ 콘솔에서 «손으로» 규칙을 고쳤다면 그 내용을 새 기준 파일로 저장해 두어야 한다.
       안 그러면 다음 배포가 그 손질을 덮는다(그때 이 스크립트가 멈추고 알려 준다).

   ■ 왜 루트 firebase.json 을 안 건드리나
     거기에 database 를 넣으면 다른 세션이 `firebase deploy` 를 할 때 규칙까지 함께 나간다.
     그래서 규칙 전용 설정(firebase.database.json)을 따로 두고 --config 로 가리킨다. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'scripts', 'make-firebase-rules.js');
const OUT = path.join(ROOT, 'docs', 'rules-paste.json');
const ALT = path.join(ROOT, 'docs', 'firebase-rules-전체-적용본.json');
const DOCS = path.join(ROOT, 'docs');
const PROJECT = 'pureun-erp';
const DEPLOY = process.argv.indexOf('--deploy') >= 0;

/* ── 기준: 마지막으로 콘솔에서 확인한 규칙 ── */
function latestSnapshot() {
  const re = /^firebase-rules-콘솔원문-(\d{4}-\d{2}-\d{2})\.json$/;
  const hits = fs.readdirSync(DOCS)
    .map((f) => ({ f: f, m: re.exec(f) }))
    .filter((x) => x.m)
    .sort((a, b) => (a.m[1] < b.m[1] ? 1 : -1));
  return hits.length ? { file: path.join(DOCS, hits[0].f), date: hits[0].m[1] } : null;
}

/* ── 구조 차이 ── */
function walk(a, b, p, out) {
  const ka = a && typeof a === 'object' ? Object.keys(a) : [];
  const kb = b && typeof b === 'object' ? Object.keys(b) : [];
  ka.filter((k) => kb.indexOf(k) < 0).sort().forEach((k) => out.gone.push(p + '/' + k));
  kb.filter((k) => ka.indexOf(k) < 0).sort().forEach((k) => out.added.push(p + '/' + k));
  ka.filter((k) => kb.indexOf(k) >= 0).sort().forEach((k) => {
    const va = a[k], vb = b[k];
    if (va && vb && typeof va === 'object' && typeof vb === 'object') walk(va, vb, p + '/' + k, out);
    else if (JSON.stringify(va) !== JSON.stringify(vb)) out.changed.push({ p: p + '/' + k, a: va, b: vb });
  });
}

function main() {
  /* 1) 만들개를 돌려 새 규칙을 만든다 — 손으로 고친 JSON 은 쓰지 않는다 */
  const fresh = execFileSync(process.execPath, [GEN], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const parsed = JSON.parse(fresh);                       /* 깨진 JSON 을 올리지 않는다 */
  fs.writeFileSync(OUT, fresh, 'utf8');
  fs.writeFileSync(ALT, fresh, 'utf8');

  const snap = latestSnapshot();
  if (!snap) {
    console.log('⚠ 기준으로 삼을 콘솔 원문 파일이 없습니다.');
    console.log('   콘솔의 지금 규칙을 docs/firebase-rules-콘솔원문-YYYY-MM-DD.json 로 먼저 저장하세요.');
    process.exit(1);
  }

  const base = JSON.parse(fs.readFileSync(snap.file, 'utf8')).rules;
  const out = { gone: [], added: [], changed: [] };
  walk(base, parsed.rules, '', out);

  console.log('기준: docs/' + path.basename(snap.file) + '  (콘솔에서 확인한 날 ' + snap.date + ')');
  console.log('');
  console.log('■ 새로 생기는 규칙 ' + out.added.length + '개');
  out.added.forEach((p) => console.log('   + ' + p));
  console.log('■ 값이 바뀌는 규칙 ' + out.changed.length + '개');
  out.changed.forEach((c) => {
    console.log('   ~ ' + c.p);
    console.log('       전: ' + String(JSON.stringify(c.a)).slice(0, 150));
    console.log('       후: ' + String(JSON.stringify(c.b)).slice(0, 150));
  });
  console.log('■ 사라지는 규칙 ' + out.gone.length + '개');
  out.gone.forEach((p) => console.log('   - ' + p));
  console.log('');

  /* 2) ⚠ 사라질 것이 하나라도 있으면 «올리지 않는다» */
  if (out.gone.length) {
    console.log('✋ 멈췄습니다 — 위 ' + out.gone.length + '개가 사라집니다.');
    console.log('   콘솔에서 손으로 더한 규칙일 수 있습니다. 만들개(scripts/make-firebase-rules.js)에');
    console.log('   그 규칙을 넣은 뒤 다시 돌리세요. 덮어써도 된다고 판단했다면 콘솔의 지금 규칙을');
    console.log('   새 기준 파일로 저장한 뒤 다시 돌리세요.');
    process.exit(2);
  }

  if (!out.added.length && !out.changed.length) {
    console.log('✅ 바뀔 것이 없습니다 — 올릴 필요가 없습니다.');
    return;
  }

  if (!DEPLOY) {
    console.log('여기까지가 «보여만 주는» 단계입니다. 올리려면:');
    console.log('   node scripts/rules-deploy.js --deploy');
    return;
  }

  /* 3) 올린다 */
  console.log('⏳ 올리는 중… (firebase deploy --only database)');
  execFileSync('firebase',
    ['deploy', '--only', 'database', '--project', PROJECT, '--config', 'firebase.database.json'],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });

  /* 4) 올린 내용을 «새 기준»으로 남긴다 — 다음 번에 견줄 자리다 */
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(DOCS, 'firebase-rules-콘솔원문-' + today + '.json'), fresh, 'utf8');
  console.log('');
  console.log('✅ 올렸습니다. 새 기준을 남겼습니다 — docs/firebase-rules-콘솔원문-' + today + '.json');
  console.log('   콘솔에서 눈으로 한 번 확인해 주세요: Realtime Database › 규칙');
}

main();
