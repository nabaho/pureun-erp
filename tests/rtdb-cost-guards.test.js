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

test('기업정보함 본문과 ERP 명함색인은 전체 value 구독을 하지 않는다', () => {
  const cards = read('pu-cards.html');
  const erp = read('pu-erp.html');
  assert.doesNotMatch(cards, /ref\(DB_ROOT\+'\/items'\)\.on\('value'/);
  assert.doesNotMatch(erp, /ref\('pucards\/idx'\)\.on\('value'/);
  assert.match(cards, /watchCardMap\(this\.db\.ref\(DB_ROOT\+'\/items'/);
  assert.match(erp, /watchPucardsIndexByChild\(/);
});

test('★ 기업정보함 회사정보(coInfo)도 항목 단위로 구독한다', () => {
  /* coInfo 에는 회사가 최대 4,000곳 담긴다(cards 소스 주석). 통째로 구독하면
     누가 «폴더를 하나 옮길 때마다» 그 4,000곳이 켜 둔 모든 기기로 다시 내려간다.
     폴더·탭 배정은 한 번에 여러 건을 고치므로 더 자주 터진다.
     items 를 항목 단위로 바꾼 것과 같은 이유다(대표 지시 2026-08-23). */
  const cards = read('pu-cards.html');
  assert.doesNotMatch(cards, /ref\(DB_ROOT\+'\/coInfo'\)\.on\('value'/,
    '★ 폴더 하나 옮길 때마다 회사 4,000곳이 모두에게 다시 내려갑니다.');
  assert.match(cards, /watchCardMap\(Store\.db\.ref\(DB_ROOT\+'\/coInfo'/);
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
  /* 본체가 runPaydataMailOnce 로 옮겨 갔다(2026-08-23, 「지금 가져오기」와 함께
     쓰려고). 지키는 것은 그대로다 — 빈 메일함이면 명부를 안 읽는다. */
  const fn = read('functions/index.js');
  const body = fn.slice(fn.indexOf('async function runPaydataMailOnce'), fn.indexOf('exports.receivePaydataMail'));
  assert.ok(body.indexOf('if (!inbox.length)') > 0, '빈 메일함 갈래가 없습니다');
  assert.ok(body.indexOf('if (!inbox.length)') < body.indexOf('payMailKnownList(db)'),
    '빈 메일함인데도 업체·직원 명부를 먼저 읽습니다');
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
