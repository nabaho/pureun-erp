const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('급여관리는 모바일 단일열 배치와 저장 상태를 제공한다', () => {
  const src = read('payroll-os.html');
  assert.match(src, /@media\s*\(max-width:760px\)/);
  assert.match(src, /\.cards\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(src, /id="saveState"[^>]*aria-live="polite"/);
  assert.match(src, /setSaveState\('saving','저장 중…'\)/);
  assert.match(src, /setSaveState\('failed','저장 실패'\)/);
});

test('문서관리는 좁은 화면에서 표를 카드 안에서 스크롤하고 저장 상태를 제공한다', () => {
  const src = read('docs-esign.html');
  assert.match(src, /@media\(max-width:700px\)/);
  assert.match(src, /\.card\{padding:13px;overflow-x:auto\}/);
  assert.match(src, /table\{min-width:640px\}/);
  assert.match(src, /function trackedWrite\(promise\)/);
  assert.match(src, /id="saveState"[^>]*aria-live="polite"/);
  assert.match(src, /EsignDocs\.esc\(m\.title \|\| '\(제목 없음\)'\)/);
  assert.match(src, /EsignDocs\.esc\(m\.company \|\| ''\)/);
  assert.match(src, /사건 생성에 실패했습니다/);
});

test('기금관리는 모든 Firebase 쓰기를 공통 저장 상태로 감시한다', () => {
  const src = read('fund.html');
  assert.match(src, /function installWriteStatus\(\)/);
  assert.match(src, /\['set','update','remove'\]\.forEach/);
  assert.match(src, /id="saveState"[^>]*aria-live="polite"/);
});

test('컨설팅 포털 인증 대기는 1.5초를 넘기지 않는다', () => {
  const src = read('gov-consulting.html');
  const waits = [...src.matchAll(/classList\.remove\('sso-wait'\)[\s\S]{0,40}?(\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(waits.length >= 2);
  assert.ok(waits.every((ms) => ms <= 1500));
});

test('취업규칙 헤더 도구는 휴대폰에서 두 열로 재배치된다', () => {
  const src = read('rules.html');
  assert.match(src, /@media\(max-width:700px\)/);
  assert.match(src, /header \.toolbar\{order:3;width:100%;display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(src, /#daejo-tools\{flex-wrap:wrap!important;overflow-x:visible!important\}/);
});

test('government consulting keeps mobile header tools and calendar navigation in view', () => {
  const src = read('gov-consulting.html');
  assert.match(src, /\.hdr\{height:auto;max-height:none;flex-wrap:wrap;overflow-x:hidden/);
  assert.match(src, /\.hdr-r\{width:100%;margin-left:0;[\s\S]*?flex-wrap:wrap;overflow:visible/);
  assert.match(src, /\.summary-nav\{flex:1 1 100%/);
  assert.match(src, /class="summary-nav"/);
  assert.match(src, /class="summary-date"/);
});

test('career management keeps essential mobile topbar controls visible', () => {
  const src = read('kcareer.html');
  assert.match(src, /\.topbar\{overflow-x:hidden;gap:5px;padding:0 8px\}/);
  assert.match(src, /\.topbar \.crumb,#searchBtn,#printBtn\{display:none!important\}/);
  assert.match(src, /#fbLogoutBtn::before\{content:'🚪'/);
});

test('government consulting requires a live server lock before editing', () => {
  const src = read('gov-consulting.html');
  assert.match(src, /async function acquireCompanyEditLock\(coId\)[\s\S]*?if\(!FB_READY\|\|!_fbDB\)[\s\S]*?return false/);
  assert.match(src, /ref\.onDisconnect\(\)\.remove\(\)/);
  assert.match(src, /async function verifyCompanyEditLock\(coId\)/);
  /* 2026-08-17 재조정 — 여기서 «버그의 모양» 을 못 박고 있었다.
     옛 검사: /cur&&cur.tabId===EDIT_TAB_ID&&_editLockFresh\(cur\)/
     그 식이 바로 「내 잠금이 낡거나 사라지면 저장을 막는」 고장이었는데,
     검사가 그 모양을 요구해서 «고치면 검사가 깨지는» 상태였다.
     지킬 규칙은 「저장 전에도 서버 잠금을 다시 확인한다」이지, 그 식이 아니다.
     자세한 규칙(누구를 막고 누구를 통과시키나)은 tests/gov-edit-lock.test.js 가 본다. */
  assert.match(src, /verifyCompanyEditLock[\s\S]*?_editLockRef\.transaction\(/);
  assert.match(src, /if\(_editLockCo===coId\)return verifyCompanyEditLock\(coId\)/);
});

test('government consulting rechecks lock ownership immediately before modal saves', () => {
  const src = read('gov-consulting.html');
  assert.match(src, /async function saveSingle\(\)[\s\S]*?verifyCompanyEditLock\(single\.coId\)/);
  assert.match(src, /async function saveMultiSingle\(\)[\s\S]*?verifyCompanyEditLock\(single\.coId\)/);
  assert.match(src, /async function saveEdit\(\)[\s\S]*?verifyCompanyEditLock\(lockedSc\.coId\)/);
  assert.match(src, /async function saveCo\(\)[\s\S]*?verifyCompanyEditLock\(co_editId\)/);
});

test('different consulting companies are merged by record instead of replacing whole arrays', () => {
  const src = read('gov-consulting.html');
  assert.match(src, /function fbPushRecordDelta\(lsKey,beforeValue,afterValue\)/);
  assert.match(src, /_fbDB\.ref\(node\)\.transaction\(current=>/);
  assert.match(src, /changed\.forEach\(\(row,id\)=>merged\.set\(id,row\)\)/);
  assert.match(src, /fbPushRecordDelta\('p_cos',old,v\)/);
  assert.match(src, /fbPushRecordDelta\('p_scheds',old,v\)/);
});
