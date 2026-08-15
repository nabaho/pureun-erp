'use strict';
/* 규정관리(rules.html) 자동 백업이 읽는 자리 — 실행: node --test tests/*.test.js
   왜 이 검사가 있나: 백업이 rules_mgmt 를 **통째로** 읽으려 했다. 콘솔 규칙은
   .read 를 아랫칸마다 따로 열어 두어서(done·orig·archive·decisions·matchfix 는
   직원 전체, wip·worksession 은 본인만) 통째 읽기는 언제나 permission_denied 였고,
   그때마다 관리자 화면에 「장애 알림」이 떴다(2026-08 한 달에 68건).
   다시 통째로 되돌아가면 같은 알림이 또 쏟아진다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-backup.js'), 'utf8');

/* 진짜 pu-backup.js 를 돌려서 설정을 받아 온다 — 글자만 견주면 나중에 모양이
   바뀌었을 때 검사가 헛돈다. firebase 가 없으면 install() 은 조용히 물러난다. */
function loadBackup(pageName) {
  const window = {
    document: {},
    location: { pathname: '/' + pageName },
    navigator: {},
    addEventListener() {}
  };
  const sandbox = { window: window, console: console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return window.PUBackup;
}

test('규정관리 백업은 rules_mgmt 를 통째로 읽지 않는다 — 언제나 권한 거부였다', () => {
  const paths = loadBackup('rules.html')._config({ uid: 'U1' }).paths;
  assert.ok(!paths.includes('rules_mgmt'), '통째 읽기가 되살아났습니다: ' + JSON.stringify(paths));
});

test('규칙이 전 직원에게 열어 둔 칸은 모두 담는다', () => {
  const paths = loadBackup('rules.html')._config({ uid: 'U1' }).paths;
  ['done', 'archive', 'orig', 'decisions', 'matchfix'].forEach(k => {
    assert.ok(paths.includes('rules_mgmt/' + k), 'rules_mgmt/' + k + ' 가 빠졌습니다');
  });
});

test('사람마다 따로인 칸은 백업하는 본인 것만 담는다 — 남의 칸은 읽을 수 없다', () => {
  const paths = loadBackup('rules.html')._config({ uid: 'U1' }).paths;
  assert.ok(paths.includes('rules_mgmt/wip/U1'), '내 작업중 칸이 빠졌습니다');
  assert.ok(paths.includes('rules_mgmt/worksession/U1'), '내 작업보관 칸이 빠졌습니다');
  assert.ok(!paths.includes('rules_mgmt/wip'), '남의 작업중 칸까지 읽으려 합니다');
  assert.ok(!paths.includes('rules_mgmt/worksession'), '남의 작업보관 칸까지 읽으려 합니다');
});

test('다른 앱 설정은 건드리지 않았다', () => {
  // vm 안에서 만든 배열이라 deepEqual 은 원형이 달라 걸린다 — 값으로 견준다.
  const paths = page => JSON.stringify(loadBackup(page)._config({ uid: 'U1' }).paths);
  assert.equal(paths('work.html'), JSON.stringify(['work_erp']));
  assert.equal(paths('kcareer.html'), JSON.stringify(['kcareer/U1']));
});
