/* 자동 백업 — 기업정보함 창고를 통째로 백업하다 종일 오류를 만들던 것.
   실행: node --test tests/*.test.js

   대표 화면 2026-08-16: 콘솔에 파이어베이스 서버 오류가 종일, 수만 건.
   근원은 pu-backup.js 의 설정 한 줄이었다:
       'pu-cards.html': { paths: ['pucards'] }
   pucards 안에는 명함 사진 원본(photos)·썸네일(thumbs)·첨부 원본(materialFiles)이
   들어 있어 수백 MB 다. 실시간DB 는 한 번의 쓰기를 16MB 까지만 받아 준다 —
   이 백업 쓰기는 «영원히 성공할 수 없다». 그리고 실패하니 「오늘 했음」 표시가
   안 남아, 관리자 탭을 열 때마다 전체 읽기(과금)와 실패 쓰기를 처음부터 되풀이했다.

   여기서 못 박는 것:
     ① 기업정보함 백업은 무거운 원본 칸을 담지 않는다
     ② 그래도 커지면 큰 칸을 건너뛰고 «기록»한다 — 통은 반드시 들어간다
     ③ 실패하면 6시간 쉰다 — 열 때마다 다시 하지 않는다
     ④ 옛 통째 백업도, 건너뛴 칸이 있는 새 백업도 안전하게 복원된다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-backup.js'), 'utf8');

function loadBackup(pageName){
  const window = {
    document: {},
    location: { pathname: '/' + pageName },
    navigator: {},
    localStorage: (function(){ const m={}; return {
      getItem: k => (k in m ? m[k] : null),
      setItem: (k,v) => { m[k]=String(v); },
      removeItem: k => { delete m[k]; } }; })(),
    addEventListener() {}
  };
  const sandbox = { window, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return window.PUBackup;
}

/* ══════ ① 무거운 원본 칸을 담지 않는다 ══════ */

test("기업정보함 백업이 'pucards' 통째 읽기로 되돌아가지 않았다", () => {
  const paths = loadBackup('pu-cards.html')._config({ uid: 'U1' }).paths;
  assert.ok(!paths.includes('pucards'), '통째 백업이 되살아났다: ' + JSON.stringify(paths));
});

test('사진·썸네일·첨부 원본·휴지통·발송기록·색인은 담지 않는다', () => {
  const paths = loadBackup('pu-cards.html')._config({ uid: 'U1' }).paths;
  ['photos', 'thumbs', 'materialFiles', 'trash', 'sentBox', 'sendLog', 'scheduled', 'idx', 'bykey']
    .forEach(k => {
      assert.ok(!paths.includes('pucards/' + k), 'pucards/' + k + ' 가 백업에 들어 있다');
    });
});

test('사람이 손으로 넣은 되살릴 수 없는 자료는 담는다', () => {
  const paths = loadBackup('pu-cards.html')._config({ uid: 'U1' }).paths;
  ['items', 'groups', 'views', 'classifyRules', 'coInfo', 'coFolders', 'materials', 'matSets']
    .forEach(k => {
      assert.ok(paths.includes('pucards/' + k), 'pucards/' + k + ' 가 빠졌다');
    });
});

test('옛 명함 본문에 박힌 사진 칸은 벗겨 담는다', () => {
  const B = loadBackup('pu-cards.html');
  const cfg = B._config({ uid: 'U1' });
  assert.ok(cfg.strip && cfg.strip['pucards/items'], 'items 벗기기 설정이 없다');
  const got = B._strip({ c1: { name: '홍길동', thumb: 'x'.repeat(100), photo: 'y'.repeat(100) } },
                       cfg.strip['pucards/items']);
  assert.equal(got.c1.name, '홍길동', '남길 칸은 남아야 한다');
  assert.ok(!('thumb' in got.c1) && !('photo' in got.c1), '사진 칸이 그대로 담겼다');
});

test('벗기기는 사본에서 한다 — 화면이 쓰는 원본이 망가지면 안 된다', () => {
  const B = loadBackup('pu-cards.html');
  const orig = { c1: { name: '홍길동', thumb: 'T' } };
  B._strip(orig, ['thumb']);
  assert.equal(orig.c1.thumb, 'T', '원본에서 사진이 지워졌다');
});

/* ══════ ② 크기 지킴이 ══════ */

test('한 칸이 한도를 넘으면 그 칸만 건너뛰고 통은 들어간다', () => {
  const B = loadBackup('pu-cards.html');
  const big = { path: 'pucards/items', exists: true, value: 'x'.repeat(B._limits.entry + 10) };
  const small = { path: 'pucards/groups', exists: true, value: { g1: '폴더' } };
  const r = B._trim([big, small]);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].path, 'pucards/items');
  const kept = r.paths.find(e => e.path === 'pucards/items');
  assert.equal(kept.skipped, 'too-big', '건너뛴 것을 기록해야 한다');
  assert.ok(!('value' in kept), '값이 남아 있으면 통이 그대로 크다');
  assert.deepEqual(r.paths.find(e => e.path === 'pucards/groups').value, { g1: '폴더' },
    '작은 칸은 그대로 담겨야 한다');
});

test('다 합쳐 한도를 넘으면 큰 칸부터 뺀다 — 작은 칸이라도 살린다', () => {
  const B = loadBackup('pu-cards.html');
  const third = Math.floor(B._limits.total / 3) + 100;
  const entries = ['a', 'b', 'c', 'd'].map((p, i) => ({
    path: 'x/' + p, exists: true, value: 'x'.repeat(i === 0 ? third * 2 : third)
  }));
  const r = B._trim(entries);
  assert.ok(r.skipped.length >= 1, '아무것도 안 뺐다');
  assert.equal(r.skipped[0].path, 'x/a', '제일 큰 칸부터 빼야 한다');
  const totalLeft = r.paths.reduce((s, e) => s + (e.value ? String(e.value).length : 0), 0);
  assert.ok(totalLeft <= B._limits.total, '자르고도 한도를 넘는다');
});

test('넘치는 것이 없으면 아무것도 건너뛰지 않는다', () => {
  const B = loadBackup('pu-cards.html');
  const r = B._trim([{ path: 'a', exists: true, value: { x: 1 } }]);
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.paths[0].value, { x: 1 });
});

test('한도가 서버 한도(16MB)보다 확실히 작다 — 한글 바이트 오차를 덮는다', () => {
  const B = loadBackup('pu-cards.html');
  assert.ok(B._limits.entry <= 8 * 1024 * 1024);
  assert.ok(B._limits.total <= 12 * 1024 * 1024);
  assert.ok(B._limits.total < 16 * 1024 * 1024 * 0.8);
});

/* ══════ ③ 실패하면 쉰다 ══════ */

test('매일 백업이 실패 뒤 식힘 시간을 둔다 — 열 때마다 다시 하면 그게 폭주다', () => {
  assert.match(src, /inCooldown\(config\.id\)/, '식힘 시간을 안 본다');
  assert.match(src, /noteFail\(config\.id\)/, '실패를 안 적는다');
  const cd = loadBackup('pu-cards.html')._limits.cooldown;
  assert.ok(cd >= 60 * 60 * 1000, '1시간은 쉬어야 한다');
});

test('성공하면 실패 기록을 지운다 — 안 지우면 성공하고도 다음날 아침까지 쉰다', () => {
  assert.match(src, /clearFail\(config\.id\)/);
});

/* ══════ ④ 복원 ══════ */

test('복원은 백업에 담긴 칸만 쓴다 — 옛 통째 백업도 안전하다', () => {
  const B = loadBackup('pu-cards.html');
  /* 옛 백업: pucards 통째 한 칸 */
  const old = { paths: [{ path: 'pucards', exists: true, value: { items: { a: 1 } } }] };
  const plan = B._restorePlan(old);
  assert.deepEqual(Object.keys(plan), ['pucards']);
  /* 예전 방식이었다면 지금 설정의 낱칸들이 백업에 「없다」고 보여 null 로 지워졌다 */
  assert.ok(!('pucards/items' in plan), '백업에 없는 칸을 지우려 한다');
});

test('크기 때문에 건너뛴 칸은 복원 때 건드리지 않는다 — 값도 없는데 지우면 안 된다', () => {
  const B = loadBackup('pu-cards.html');
  const rec = { paths: [
    { path: 'pucards/items', exists: true, skipped: 'too-big', chars: 99 },
    { path: 'pucards/groups', exists: true, value: { g: 1 } }
  ] };
  const plan = B._restorePlan(rec);
  assert.ok(!('pucards/items' in plan), '건너뛴 칸을 지우려 한다');
  assert.deepEqual(plan['pucards/groups'], { g: 1 });
});

test('백업 당시 비어 있던 칸은 복원 때도 비운다', () => {
  const B = loadBackup('pu-cards.html');
  const plan = B._restorePlan({ paths: [{ path: 'x/a', exists: false }] });
  assert.equal(plan['x/a'], null);
});

test('다른 앱 설정은 건드리지 않았다', () => {
  const paths = page => JSON.stringify(loadBackup(page)._config({ uid: 'U1' }).paths);
  assert.equal(paths('work.html'), JSON.stringify(['work_erp']));
  assert.equal(paths('fund.html'), JSON.stringify(['fund_erp']));
});
