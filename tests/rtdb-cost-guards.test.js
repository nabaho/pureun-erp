const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('업무관리 큰 목록은 항목 단위로 구독한다', () => {
  const app = read('work.html');
  for (const key of ['items', 'leaving', 'pesync', 'kb', 'steps', 'tpl']) {
    assert.doesNotMatch(
      app,
      new RegExp("ref\\(NS\\+'\\/" + key + "'\\)\\.on\\('value'"),
      key + ' 전체 value 구독은 한 건 수정 때 전체 목록을 다시 받는다'
    );
  }
  assert.match(app, /function watchMapChildren\(/);
  assert.match(app, /\.on\('child_changed'/);
  assert.match(app, /\.on\('child_removed'/);
});

test('명함첩 본문과 ERP 명함색인은 전체 value 구독을 하지 않는다', () => {
  const cards = read('pu-cards.html');
  const erp = read('pu-erp.html');
  assert.doesNotMatch(cards, /ref\(DB_ROOT\+'\/items'\)\.on\('value'/);
  assert.doesNotMatch(erp, /ref\('pucards\/idx'\)\.on\('value'/);
  assert.match(cards, /watchCardMap\(this\.db\.ref\(DB_ROOT\+'\/items'/);
  assert.match(erp, /watchPucardsIndexByChild\(/);
});

test('사진첩 부팅은 휴지통 원본을 자동 스캔하지 않는다', () => {
  const app = read('pu-photos.html');
  const boot = app.slice(app.indexOf('function finishPhotoBoot'), app.indexOf('function finishPhotoBoot') + 6000);
  assert.doesNotMatch(boot, /purgeOldTrash\(/);
  assert.doesNotMatch(boot, /listTrash\(/);
});

test('장애 알림은 전체 루트 실시간 value 구독을 하지 않는다', () => {
  const health = read('js/pu-health.js');
  assert.doesNotMatch(health, /ref\('systemAlerts'\)\.on\('value'/);
  assert.match(health, /function showAdminPanel[\s\S]*ref\('systemAlerts'\)\.once\('value'/);
});

test('접속자 현황은 항목 단위로 받고 백그라운드 하트비트를 멈춘다', () => {
  const erp = read('pu-erp.html');
  assert.doesNotMatch(erp, /ref\('presence'\)\.on\('value'/);
  assert.match(erp, /_presenceRootRef\.on\('child_added'/);
  assert.match(erp, /_presenceRootRef\.on\('child_changed'/);
  assert.match(erp, /if\(!document\.hidden\) _writePresence\(\)/);
  assert.match(erp, /120 \* 1000/);
});

test('급여메일은 새 메일이 있을 때만 업체·직원 명부를 읽는다', () => {
  const fn = read('functions/index.js');
  const receive = fn.slice(fn.indexOf('exports.receivePaydataMail'), fn.indexOf('/* 지문·간편 로그인'));
  assert.ok(receive.indexOf('if (!inbox.length) return null') < receive.indexOf('payMailKnownList(db)'));
  assert.match(fn, /payMailKnownCache/);
});

test('자동백업은 서버의 하루 1회 실행권을 얻은 기기만 원본을 읽는다', () => {
  const backup = read('js/pu-backup.js');
  const daily = backup.slice(backup.indexOf('function runDailySnapshot'), backup.indexOf('function runDailySnapshot') + 2600);
  assert.match(daily, /_dailyClaim/);
  assert.ok(daily.indexOf('.transaction(') < daily.indexOf('createSnapshot('));
});

test('메일 예약 작업은 과도하게 자주 깨우지 않는다', () => {
  const fn = read('functions/index.js');
  const send = fn.slice(fn.indexOf('exports.sendScheduledMail'), fn.indexOf('exports.sendScheduledMail') + 450);
  const receive = fn.slice(fn.indexOf('exports.receivePaydataMail'), fn.indexOf('exports.receivePaydataMail') + 450);
  assert.match(send, /schedule\("every 15 minutes"\)/);
  assert.match(receive, /schedule\("every 30 minutes"\)/);
});
