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
  assert.match(erp, /officeStatus:ms\.length\?'ambiguous':'missing'/,
    '6-3B: 금액 일치만으로 업무 ID를 확정하지 않는다');
  assert.match(erp, /입금 사업장 확인/);
  assert.match(erp, /사무관리에서 내용을 입력 또는 확인해야 합니다/);
  assert.match(erp, /navigateTo\('biz\/contract'\)/);
  assert.match(erp, /hanaSmsCall\('adminResolve'/);
  assert.match(erp, /setInterval\(poll,180000\)/);
});

test('ERP는 총괄관리자 권한이 화면보다 늦게 준비돼도 입금 알림을 다시 확인한다', () => {
  const marker = erp.indexOf("get('hanaAlert')==='1'");
  const start = erp.lastIndexOf('useEffect(function(){', marker);
  const end = erp.indexOf('},[]);', marker);
  assert.ok(start >= 0 && end > marker, '입금 알림 초기화 구간을 찾을 수 있어야 한다');
  const block = erp.slice(start, end);
  assert.doesNotMatch(block, /useEffect\(function\(\)\{\s*if\(!_meNow\(\)\.isAdmin\) return/,
    '첫 렌더 순간의 미완성 권한만 보고 알림 감시를 영구 종료하면 안 된다');
  assert.match(block, /if\(!_meNow\(\)\.isAdmin\)\{[\s\S]*?retryTimer=setTimeout\(poll,500\)/,
    '총괄관리자 권한이 준비될 때까지 제한적으로 재확인해야 한다');
  assert.match(block, /visibilitychange[\s\S]*?onVisible/,
    '휴대폰 화면으로 돌아올 때도 관리자 권한과 새 입금을 다시 확인해야 한다');
});

test('통합포털 관리자 알림은 거래내역으로 바로 연결된다', () => {
  assert.match(portal, /function initPortalHanaAlerts\(role\)/);
  assert.match(portal, /if\(role!=='admin'\) return/);
  assert.match(portal, /body:JSON\.stringify\(\{action:'adminAlerts'\}\)/);
  assert.match(portal, /hanaAlert=1/);
  assert.match(portal, /#menu=fin\/ledger/);
  /* 3분마다 다시 본다. 몇 초인지가 규칙이지 «괄호 안에 무엇을 넣는가»가 아니다 —
     2026-08-24 에 저절로 뜨는 창을 없애면서 allowPopup 인자가 사라졌다. */
  assert.match(portal, /setInterval\([\s\S]{0,80}?pollPortalHanaAlerts\([\s\S]{0,20}?\},\s*180000\)/);
});

/* ★ 로그인하자마자 확인 창이 저절로 뜨지 않는다 (대표 지시 2026-08-24)
   푸른이알피 타일에 「입금 N」 표시가 붙으므로, 볼지 말지는 사람이 정한다.
   하던 일을 가로막고 뜨는 창은 그것대로 일을 끊는다. */
test('★ 로그인할 때 확인 창이 저절로 뜨지 않는다', () => {
  const start = portal.indexOf('function renderPortalHanaAlerts');
  const end = portal.indexOf('function pollPortalHanaAlerts', start);
  const block = portal.slice(start, end);
  /* 창을 여는 곳은 «읽던 창을 이어서 그리는» 한 군데뿐이어야 한다.
     두 군데가 되면 그중 하나가 저절로 뜨는 길이다. */
  const opens = (block.match(/showPortalHanaModal\(/g) || []).length;
  assert.strictEqual(opens, 1, '확인 창을 여는 곳이 하나여야 한다 (읽던 창 이어 그리기)');
  assert.doesNotMatch(block, /allowPopup/, '저절로 띄우는 스위치가 남아 있으면 안 된다');
  assert.doesNotMatch(portal, /pu_portal_hana_seen/,
    '「이미 본 것」 기억은 저절로 띄울 때만 쓰던 것이다 — 함께 사라져야 한다');
});

test('주기 갱신은 사용자가 읽고 있는 입금 알림창을 닫지 않는다', () => {
  const start = portal.indexOf('function renderPortalHanaAlerts');
  const end = portal.indexOf('function pollPortalHanaAlerts', start);
  assert.ok(start >= 0 && end > start, '포털 입금 알림 렌더링 구간을 찾을 수 있어야 한다');
  const block = portal.slice(start, end);
  assert.match(block, /modalWasOpen/);
  /* 갱신할 때 «표시만» 다시 그린다. 2026-08-24 에 구석 알약을 걷고 푸른이알피 타일의
     표시로 옮기면서 이름이 portalHanaRemoveChip → portalHanaPaintBadge 로 바뀌었다.
     지키려는 것은 이름이 아니라 «읽고 있는 창은 안 건드린다» 이다 — 아래 두 줄이 그것을 본다. */
  assert.match(block, /portalHanaPaintBadge\(\)/);
  assert.doesNotMatch(block, /portalHanaRemoveUi\(\)/);
  assert.match(block, /if\(modalWasOpen\)\s*\{?\s*showPortalHanaModal\(items\)/);
});
