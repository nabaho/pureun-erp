/* 창고(Storage) 규칙 올리개의 안전장치 — 2026-09-08
 *
 * ★★ 왜 이것이 필요한가 — 실시간DB 규칙은 «살아 있는 콘솔»을 읽어 견주는데,
 *   창고 규칙은 «CLI 로 읽을 수 없다». 그래서 2026-09-08 까지 창고에는
 *   안전장치가 «아예 없었고», 사람이 콘솔에 붙여넣게 했다. 그 붙여넣기가 밀려
 *   서고 원본·메일 첨부가 담기지 못한 채 남았다.
 *
 * 이 검사가 지키는 것:
 *   ① 기준(대표님이 옮겨 주신 콘솔 원문)에 있던 것이 사라지면 «멈춘다»
 *   ② 앱이 실제로 쓰는 창고 자리가 안 덮이면 «멈춘다»
 *   ③ 뜯기(파서)가 중첩된 match 를 제대로 읽는다 — 여기서 한 번 크게 틀렸다
 *   ④ 루트 firebase.json 에 storage 를 넣지 않는다
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'scripts', 'storage-rules-deploy.js'));
const 올릴것 = path.join(ROOT, 'docs', 'firebase-storage-전체(붙여넣기용).txt');

/* ══════ ③ 뜯기가 중첩을 제대로 읽는가 ═══════════════════════════════
   ⚠⚠ 처음에 정규식 하나로 잡았더니 겉 칸(`/b/{bucket}/o {`)이 게으른 짝짓기로
     «첫 안쪽 칸을 통째로 삼켰다». 그래서 pucards/photos 가 없는 것으로 읽혔고,
     안전장치가 «멀쩡한 파일»을 물었다. 헛멈춤은 다음 사람이 --force 를 만들게 하므로
     없는 것보다 나쁘다 — 그 자리를 못 박는다. */

test('★★ 겉 칸이 «첫 안쪽 칸을 삼키지» 않는다 — 여기서 한 번 크게 틀렸다', () => {
  const 글 = [
    "service firebase.storage {",
    "  match /b/{bucket}/o {",
    "    match /가/{id} {",
    "      allow read: if a();",
    "    }",
    "    match /나/{id} {",
    "      allow write: if b();",
    "    }",
    "  }",
    "}"
  ].join('\n');
  const r = S.뜯기(글);
  assert.ok(r.칸['/가/{id}'], '★★ 첫 안쪽 칸이 겉 칸에 삼켜졌습니다');
  assert.ok(r.칸['/나/{id}'], '둘째 칸을 못 읽었습니다');
  assert.deepEqual(r.칸['/가/{id}'], ['allow read: if a();']);
});

test('★★ 여러 줄로 쓴 허락도 읽는다 — 실제 파일이 그렇게 쓰여 있다', () => {
  const 글 = [
    "  match /b/{bucket}/o {",
    "    match /다/{id} {",
    "      allow write:  if signedIn()",
    "                    && request.resource != null",
    "                    && request.resource.size < 20 * 1024 * 1024;",
    "    }",
    "  }"
  ].join('\n');
  const r = S.뜯기(글);
  assert.equal((r.칸['/다/{id}'] || []).length, 1,
    '★★ 여러 줄 허락을 못 읽습니다 — 기준이 여러 줄로 바뀐 날 «헛멈춤»이 납니다');
  assert.match(r.칸['/다/{id}'][0], /request\.resource\.size/, '이어 붙인 글이 잘렸습니다');
});

test('★ 주석 속 글귀를 «규칙으로 읽지» 않는다', () => {
  const 글 = [
    "  match /b/{bucket}/o {",
    "    // match /가짜/{id} { allow read: if true; }",
    "    /* match /가짜2/{id} { allow write: if true; } */",
    "    match /진짜/{id} {",
    "      allow read: if a();",
    "    }",
    "  }"
  ].join('\n');
  const r = S.뜯기(글);
  assert.ok(!r.칸['/가짜/{id}'], '★ 주석에 적어 둔 것을 규칙으로 읽었습니다');
  assert.ok(!r.칸['/가짜2/{id}'], '★ 여러 줄 주석을 안 걷었습니다');
  assert.ok(r.칸['/진짜/{id}'], '진짜 칸을 못 읽었습니다');
});

test('★ 보조 함수를 몸통까지 읽는다 — 몸통이 «달라지는 것»을 잡아야 한다', () => {
  const 글 = [
    "  match /b/{bucket}/o {",
    "    function okImage() {",
    "      return request.resource != null",
    "          && request.resource.size < 10 * 1024 * 1024;",
    "    }",
    "  }"
  ].join('\n');
  const r = S.뜯기(글);
  assert.ok(r.함수.okImage, '★ 보조 함수를 못 읽습니다 — 조용히 느슨해져도 모릅니다');
  assert.match(r.함수.okImage, /size < 10/, '몸통이 잘렸습니다');
});

/* ══════ ① 실제 파일이 기준을 «하나도 안 빼는가» ═══════════════════ */

test('★★★ 올릴 파일이 기준(콘솔 원문)의 칸·허락·함수를 «하나도 안 뺀다»', () => {
  const 기준길 = S.최신기준();
  assert.ok(기준길, '★★ 기준 파일이 없습니다 — 사라지는 규칙을 가려낼 수가 없습니다');
  const 기준 = S.뜯기(fs.readFileSync(기준길, 'utf8'));
  const 새것 = S.뜯기(fs.readFileSync(올릴것, 'utf8'));

  Object.keys(기준.칸).forEach(function (k) {
    assert.ok(새것.칸[k], '★★★ 칸이 사라집니다: ' + k
      + ' — 창고 규칙은 통째로 갈아 끼우므로 빠진 칸은 그대로 없어집니다');
    기준.칸[k].forEach(function (a) {
      assert.ok(새것.칸[k].indexOf(a) >= 0, '★★★ 허락이 사라집니다: ' + k + ' — ' + a);
    });
  });
  Object.keys(기준.함수).forEach(function (f) {
    assert.equal(새것.함수[f], 기준.함수[f],
      '★★★ 보조 함수가 사라지거나 달라집니다: ' + f + '()'
      + ' — 조이면 급여데이터함·명함첩이 막힐 수 있습니다');
  });
});

/* ══════ ② 앱이 쓰는 자리가 덮이는가 ═════════════════════════════ */

test('★★★ 앱이 실제로 쓰는 창고 자리가 «전부» 덮인다', () => {
  const 새것 = S.뜯기(fs.readFileSync(올릴것, 'utf8'));
  const 칸들 = Object.keys(새것.칸);
  S.쓰는자리.forEach(function (쌍) {
    const 덮나 = 칸들.some(function (k) {
      const 알맹이 = k.replace(/^\//, '');
      return 알맹이.indexOf(쌍[0]) === 0 || 쌍[0].indexOf(알맹이.split('{')[0]) === 0;
    });
    assert.ok(덮나, '★★★ ' + 쌍[0] + ' 이 안 덮입니다 (' + 쌍[1] + ') — 그 기능이 통째로 멎습니다');
  });
});

test('★ 「쓰는 자리」 목록이 코드와 어긋나지 않았다 — 사진첩 뿌리는 코드에서 온다', () => {
  const store = fs.readFileSync(path.join(ROOT, 'js', 'pu-photo-store.js'), 'utf8');
  const m = /var BUCKET_ROOT = '([^']+)'/.exec(store);
  assert.ok(m, '사진첩 창고 뿌리를 코드에서 못 찾았습니다');
  assert.ok(S.쓰는자리.some(function (쌍) { return 쌍[0].indexOf(m[1] + '/') === 0; }),
    '★★ 코드의 창고 뿌리(' + m[1] + ')가 「쓰는 자리」 목록에 없습니다 —'
    + ' 밑줄 하나가 달라도 사진첩 올리기가 통째로 막힙니다');
});

test('★ 창고 이름이 앱이 고른 것과 같다 — 엉뚱한 창고에 올리면 안 된다', () => {
  const 짝 = [['pu-photos.html', 'pureun-erp-hrphotos'],
              ['pu-cards.html', 'pureun-erp-photos'],
              ['pu-paydata.html', 'pureun-erp.firebasestorage.app']];
  const 이름들 = S.BUCKETS.map(function (b) { return b.name; });
  짝.forEach(function ([f, b]) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src, new RegExp("storageBucket:\\s*'" + b.replace(/\./g, '\\.') + "'"),
      f + ' 이 ' + b + ' 를 안 씁니다 — 목록이 낡았습니다');
    assert.ok(이름들.indexOf(b) >= 0, '★ 올릴 창고 목록에 ' + b + ' 가 없습니다');
  });
});

/* ══════ ④ 루트 설정을 더럽히지 않는다 ═══════════════════════════ */

test('★★★ 루트 firebase.json 에 storage 를 넣지 않았다', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  assert.equal(j.storage, undefined,
    '★★★ 루트 설정에 storage 가 들어갔습니다 — 다른 세션이 그냥 `firebase deploy` 할 때'
    + ' 창고 규칙이 «함께» 나갑니다(database 로 이미 겪은 일입니다)');
  assert.equal(j.database, undefined, '★★★ 루트 설정에 database 가 들어갔습니다 — 같은 까닭입니다');
});

test('★ 올리개가 «임시 설정»으로 올린다 — 루트 설정을 안 건드린다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'storage-rules-deploy.js'), 'utf8');
  assert.match(src, /--config/, '★ 루트 설정으로 올리고 있습니다');
  assert.match(src, /mkdtemp/, '★ 임시 자리를 안 만듭니다');
});

/* ══════ 이빨 — 실제로 멈추는가 ═══════════════════════════════════
   ⚠ 「멈추는 코드가 있다」로 보면 안 된다. 만들어 놓고 «안 부르면» 그대로 통과한다.
     그래서 사본에서 규칙을 «실제로 빼고» 돌려 본다. */

function 사본에서돌리기(고치기) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stg-'));
  fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'js'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'storage-rules-deploy.js'),
    path.join(tmp, 'scripts', 'storage-rules-deploy.js'));
  fs.copyFileSync(path.join(ROOT, 'js', 'pu-photo-store.js'), path.join(tmp, 'js', 'pu-photo-store.js'));
  fs.readdirSync(path.join(ROOT, 'docs'))
    .filter(function (f) { return /^firebase-storage-/.test(f); })
    .forEach(function (f) {
      fs.copyFileSync(path.join(ROOT, 'docs', f), path.join(tmp, 'docs', f));
    });
  const p = path.join(tmp, 'docs', 'firebase-storage-전체(붙여넣기용).txt');
  /* ⚠ 이 저장소 파일은 CRLF 다. 줄끝을 안 맞추면 «되돌림이 아무것도 안 고치고»
       검사가 「안 멈췄다」로 실패한다 — 실은 멀쩡한 파일을 돌린 것이다.
       그래서 LF 로 맞춰 고친 뒤 그대로 둔다(올리개는 줄끝을 안 본다). */
  const 원본 = fs.readFileSync(p, 'utf8').split('\r\n').join('\n');
  const 고친것 = 고치기(원본);
  assert.notEqual(고친것.length, 원본.length,
    '★ 되돌림이 아무것도 안 고쳤습니다 — 검사가 헛돕니다(자리 글귀를 확인하세요)');
  fs.writeFileSync(p, 고친것, 'utf8');
  /* ⚠ --deploy 를 «안» 붙인다 — 검사가 진짜 창고를 건드리면 안 된다 */
  const r = cp.spawnSync(process.execPath, [path.join(tmp, 'scripts', 'storage-rules-deploy.js')],
    { cwd: tmp, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

test('★★★ 기준의 칸을 빼면 «멈춘다» — 이빨 확인', () => {
  const r = 사본에서돌리기(function (s) {
    return s.replace(/match \/pu_paydata[\s\S]*?\n    \}\n/, '');
  });
  assert.notEqual(r.code, 0, '★★★ 급여데이터함 칸을 뺐는데 그냥 올리려 합니다');
  assert.equal(r.code, 2, '멈춤은 종료코드 2 여야 합니다 (다른 실패와 갈라 보려고)');
  assert.match(r.out, /pu_paydata/, '★ 무엇이 사라지는지 안 말합니다 — 말 안 하면 못 고칩니다');
});

test('★★★ 기준의 허락 한 줄만 빼도 «멈춘다»', () => {
  const r = 사본에서돌리기(function (s) {
    /* 명함첩 칸의 「지우기」 한 줄만 뺀다 — 기준에 그대로 들어 있는 허락이다 */
    return s.replace('      allow delete: if isStaff();\n', '');
  });
  assert.notEqual(r.code, 0, '★★★ 허락 한 줄이 사라지는데 안 멈춥니다');
  assert.match(r.out, /allow delete/, '★ 어느 허락이 사라지는지 안 말합니다');
});

test('★★★ 보조 함수를 «조여도» 멈춘다 — 조용히 막히는 것이 가장 무섭다', () => {
  const r = 사본에서돌리기(function (s) {
    return s.replace('request.resource.size < 10 * 1024 * 1024', 'request.resource.size < 1024');
  });
  assert.notEqual(r.code, 0, '★★★ okImage 를 1KB 로 조였는데 그냥 올리려 합니다');
  assert.match(r.out, /okImage/, '★ 어느 함수가 달라졌는지 안 말합니다');
});

test('★★★ 앱이 쓰는 자리를 빼면 «멈춘다» — 사진첩이 통째로 멎는 자리다', () => {
  const r = 사본에서돌리기(function (s) {
    /* 사진첩 사진 칸을 통째로 뺀다 — 「앱이 쓰는 자리」 문지기가 잡아야 한다.
       ⚠ 이 칸은 기준(콘솔 원문)에 «없다» — 그래서 첫 안전장치로는 안 걸리고,
         둘째 안전장치(코드가 쓰는 자리)만이 잡는다. 그것을 재는 것이 이 검사다. */
    return s.replace('    match /pu_photos/u/{uid}/{allPaths=**} {\n'
      + '      allow read:   if signedIn() && request.auth.uid == uid;\n'
      + '      allow write:  if signedIn() && request.auth.uid == uid && okImage();\n'
      + '      allow delete: if signedIn() && request.auth.uid == uid;\n'
      + '    }\n', '');
  });
  assert.notEqual(r.code, 0, '★★★ 사진첩 자리를 뺐는데 그냥 올리려 합니다');
  assert.match(r.out, /pu_photos/, '★ 어느 자리가 안 덮이는지 안 말합니다');
});

test('★ 멀쩡한 파일은 «지나간다» — 헛멈춤은 --force 를 만들게 한다', () => {
  /* ⚠ 아무것도 안 고치는 되돌림이라 위 「고쳤나」 확인을 지나가게 한 줄을 덧붙인다 */
  const r = 사본에서돌리기(function (s) { return s + '\n'; });
  assert.equal(r.code, 0, '★★ 멀쩡한 파일인데 멈춥니다:\n' + r.out);
  assert.match(r.out, /사라지는 것 0개/, '무엇을 견줬는지 안 보여 줍니다');
  assert.match(r.out, /--deploy/, '★ 어떻게 올리는지 안 알려 줍니다');
});

test('★★ --force 같은 «빠져나가는 길»을 만들지 않았다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'storage-rules-deploy.js'), 'utf8');
  /* ⚠ 「--force 라는 글자가 있나」로 보면 안 된다 — 화면에 「--force 를 만들지 마세요」라고
       «적어 두는 것»까지 걸린다(실제로 걸렸다). 지켜야 할 것은 그 깃발을 «읽는가»다.
     ★ 깃발을 읽는 곳은 argv 를 뒤지는 자리뿐이다 — 거기만 본다. */
  const 깃발읽기 = src.match(/argv\.indexOf\([^)]*\)/g) || [];
  assert.ok(깃발읽기.length, '깃발을 읽는 자리를 못 찾았습니다');
  깃발읽기.forEach(function (x) {
    assert.match(x, /--deploy/,
      '★★ 안전장치를 건너뛰는 깃발이 생겼습니다(' + x + ')'
      + ' — 이 멈춤 하나가 창고의 안전장치 «전부»입니다');
  });
  assert.equal(깃발읽기.length, 1,
    '★★ 읽는 깃발이 ' + 깃발읽기.length + '개입니다 — --deploy 하나여야 합니다');
});

test('★★ 약한 안전장치임을 «숨기지 않는다» — 실시간DB 쪽과 다르다', () => {
  /* 아무것도 안 고치는 되돌림이라, 위 「고쳤나」 확인을 지나가게 빈 줄 하나만 덧붙인다 */
  const r = 사본에서돌리기(function (s) { return s + '\n'; });
  assert.match(r.out, /CLI 로 읽을 수 없/,
    '★★ 「살아 있는 콘솔을 읽은 것」으로 오해하게 둡니다 — 기준은 «사람이 옮겨 준 파일»입니다');
});
