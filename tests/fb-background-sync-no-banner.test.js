/* 다른 사용자의 Firebase 변경은 이미 로컬 저장소에 실시간 적용된다.
   전역 새로고침 띠를 다시 만들면 모든 변경마다 사용자가 눌러야 하고,
   입력 중인 화면을 통째로 재시작할 위험도 있으므로 표시하지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

test('다른 사용자 변경 안내 띠와 수동 새로고침 상태가 없다', () => {
  assert.doesNotMatch(app, /다른 사용자가 데이터를 변경했습니다/);
  assert.doesNotMatch(app, /fbHasUpdate|setFbHasUpdate/);
});

test('알림만 없애고 Firebase 실시간 수신과 화면별 자동 반영은 유지한다', () => {
  assert.match(app, /function _scheduleFbChanged\(k\)/);
  assert.match(app, /dispatchEvent\(new CustomEvent\('fb_data_changed'/);
  assert.match(app, /window\.addEventListener\('fb_data_changed', again\)/);
});
