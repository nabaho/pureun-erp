const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = require('../functions/dev-automation.js');
const client = require('../js/pu-dev-automation.js');

test('공개 GitHub 내용에서 이메일·전화번호·주민번호·금융번호를 가린다', () => {
  const text = server.redactSensitive('p001@pureun.kr 010-1234-5678 900101-1234567 1234-5678-9012-3456');
  assert.doesNotMatch(text, /p001@/);
  assert.doesNotMatch(text, /010-1234/);
  assert.doesNotMatch(text, /900101-1234567/);
  assert.doesNotMatch(text, /1234-5678/);
});

test('권한·급여·Firebase 변경은 중요 변경으로 자동 분류한다', () => {
  for (const instruction of ['Firebase 규칙 수정', '급여 계산 변경', '로그인 권한 변경']) {
    assert.equal(server.riskLevel({ instruction }), 'high');
  }
  assert.equal(server.riskLevel({ instruction: '버튼 문구와 여백 조정' }), 'low');
});

test('중요 변경은 사용자가 체크해도 자동배포하지 않는다', () => {
  const issue = server.buildIssue({
    suggestionId: 'abc_123', title: '권한 수정', content: '관리자 권한', instruction: 'Firebase 규칙 변경',
    risk: 'auto', autoDeploy: true, imageIndexes: [0, 1], imageCount: 2,
  });
  assert.equal(issue.level, 'high');
  assert.equal(issue.autoDeploy, false);
  assert.match(issue.body, /비공개 참고 캡처: `2개`/);
});

test('대표 개인정보 확인과 개발 지시 없이는 실행하지 않는다', () => {
  assert.throws(() => server.validateExecute({ suggestionId: 'a', title: 't', instruction: 'i' }), /개인정보/);
  assert.throws(() => server.validateExecute({ suggestionId: 'a', title: 't', instruction: '', privacyConfirmed: true }), /개발 지시/);
  assert.equal(server.validateExecute({ suggestionId: 'a', title: 't', instruction: '고쳐주세요', privacyConfirmed: true }), true);
});

test('복귀 키는 원문이 아니라 소금값을 포함한 해시로 확인한다', () => {
  const code = server.createRollbackCode();
  assert.match(code, /^\d{6}$/);
  assert.equal(server.hashRollbackCode(code, 'salt'), server.hashRollbackCode(code, 'salt'));
  assert.notEqual(server.hashRollbackCode(code, 'salt'), server.hashRollbackCode(code, 'other'));
});

test('캡처 선택은 중복을 없애고 최대 3장으로 제한한다', () => {
  assert.deepEqual(server.normalizeImageIndexes([2, 2, 1, 5, 0, 3], 4), [2, 1, 0]);
});

test('포털에는 대표 승인·배포 승인·비밀번호 복귀 UI가 있다', () => {
  const html = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
  assert.match(html, /대표 승인형 자동개발/);
  assert.match(html, /sgDevInstruction/);
  assert.match(html, /sgApproveDeploy/);
  assert.match(html, /sgRollbackPassword/);
  assert.match(html, /1회용 복귀 키/);
  assert.match(html, /pu-dev-automation\.js/);
});

test('클라이언트 상태 문구는 개발·배포·복귀를 구분한다', () => {
  assert.equal(client.statusText('coding'), 'AI 개발 중');
  assert.equal(client.statusText('deployed'), '운영 배포 완료');
  assert.equal(client.statusText('rolled_back'), '직전 버전 복귀 완료');
});

test('자동개발 워크플로는 Codex·전체검사·승인 병합·복귀 검사를 포함한다', () => {
  const implementation = fs.readFileSync(path.join(root, '.github/workflows/codex-issue-implementation.yml'), 'utf8');
  const merge = fs.readFileSync(path.join(root, '.github/workflows/autodev-auto-merge.yml'), 'utf8');
  const control = fs.readFileSync(path.join(root, '.github/workflows/autodev-control.yml'), 'utf8');
  assert.match(implementation, /openai\/codex-action@v1/);
  assert.match(implementation, /node --test tests\/\*\.test\.js/);
  assert.match(implementation, /persist-credentials: false/);
  const codexStep = implementation.match(/- name: Run Codex implementation[\s\S]*?- name: Remove protected task material/)[0];
  assert.doesNotMatch(codexStep, /GH_TOKEN|AUTOMATION_BRIDGE_KEY/);
  assert.match(merge, /auto-deploy-approved/);
  assert.match(control, /gh pr checks/);
  assert.match(control, /git revert -m 1/);
  assert.match(control, /node --test tests\/\*\.test\.js/);
  const functionSource = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
  assert.match(functionSource, /run\.name === "Test and Deploy Pages"/);
  assert.match(control, /pu-autodev-rollback-pr/);
});

test('자동개발 작업 파일과 참고 캡처는 커밋 대상에서 제외한다', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.codex-task\.md$/m);
  assert.match(ignore, /^\.codex-input\/$/m);
});
