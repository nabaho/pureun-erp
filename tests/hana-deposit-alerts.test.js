const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const fn = fs.readFileSync('functions/index.js', 'utf8');
const erp = fs.readFileSync('pu-erp.html', 'utf8');
const portal = fs.readFileSync('enter.html', 'utf8');

test('입금 수신은 총괄관리자용 최소 알림을 만든다', () => {
  assert.match(fn, /async function requireTotalAdmin\(req\)/);
  assert.match(fn, /uid_roles\/\$\{decoded\.uid\}\/isAdmin/);
  assert.match(fn, /if \(tx\.type === "income"\)/);
  assert.match(fn, /updates\[`adminAlerts\/\$\{alertKey\}`\]/);
  assert.match(fn, /status:\s*"new"/);
  assert.match(fn, /officeStatus:\s*"unknown"/);

  const start = fn.indexOf('updates[`adminAlerts/${alertKey}`]');
  const end = fn.indexOf('await db.ref("hanaSmsBridge").update(updates)', start);
  assert.ok(start >= 0 && end > start, '관리자 알림 저장 구간을 찾을 수 있어야 한다');
  const alertBlock = fn.slice(start, end);
  assert.doesNotMatch(alertBlock, /rawText|rawHash|balance\s*:|note\s*:/,
    '관리자 알림에 문자 원문·잔액·메모 원문을 복사하지 않는다');
});

test('총괄관리자만 미처리 입금 알림을 읽고 완료한다', () => {
  assert.match(fn, /if \(action === "adminAlerts"\)[\s\S]*?await requireTotalAdmin\(req\)/);
  assert.match(fn, /db\.ref\("hanaSmsBridge\/adminAlerts"\)[\s\S]*?limitToLast\(100\)/);
  assert.match(fn, /filter\(\(x\) => x && x\.status !== "resolved"\)/);
  assert.match(fn, /if \(action === "adminResolve"\)[\s\S]*?await requireTotalAdmin\(req\)/);
});

test('ERP는 입금 사업장과 사무관리 확인 상태를 연결한다', () => {
  assert.match(erp, /hanaSmsCall\('review',\{items:reviewItems\}\)/);
  assert.match(erp, /officeStatus:ms\.length===1\?'matched':\(ms\.length\?'ambiguous':'missing'\)/);
  assert.match(erp, /입금 사업장 확인/);
  assert.match(erp, /사무관리에서 내용을 입력 또는 확인해야 합니다/);
  assert.match(erp, /navigateTo\('biz\/contract'\)/);
  assert.match(erp, /hanaSmsCall\('adminResolve'/);
  assert.match(erp, /setInterval\(poll,180000\)/);
});

test('통합포털 관리자 알림은 거래내역으로 바로 연결된다', () => {
  assert.match(portal, /function initPortalHanaAlerts\(role\)/);
  assert.match(portal, /if\(role!=='admin'\) return/);
  assert.match(portal, /body:JSON\.stringify\(\{action:'adminAlerts'\}\)/);
  assert.match(portal, /hanaAlert=1/);
  assert.match(portal, /#menu=fin\/ledger/);
  assert.match(portal, /setInterval\(function\(\)\{ pollPortalHanaAlerts\(true\); \},180000\)/);
});

test('주기 갱신은 사용자가 읽고 있는 입금 알림창을 닫지 않는다', () => {
  const start = portal.indexOf('function renderPortalHanaAlerts');
  const end = portal.indexOf('function pollPortalHanaAlerts', start);
  assert.ok(start >= 0 && end > start, '포털 입금 알림 렌더링 구간을 찾을 수 있어야 한다');
  const block = portal.slice(start, end);
  assert.match(block, /modalWasOpen/);
  assert.match(block, /portalHanaRemoveChip\(\)/);
  assert.doesNotMatch(block, /portalHanaRemoveUi\(\)/);
  assert.match(block, /if\(modalWasOpen\)\{\s*showPortalHanaModal\(items\)/);
});
