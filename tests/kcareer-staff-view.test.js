/* 경력관리 — 직원에게 «경력관리만» 보기 전용으로 (대표 지시 2026-09-02, 방식 「나」)
   「경력관리 이부분만 다른 직원들이 볼 수 있게 해줄 수 있나? 파이어베이스를 수정안하고」
   → 파이어베이스를 안 건드리면 자료가 안 따라온다고 알렸고(경력 기록은 kcareer/{uid} 에
     사람마다 따로 담긴다), 규칙 한 줄을 더하는 두 길 중 «나»를 고르셨다:
     대표가 «경력관리 세 통만» 골라 올린 사본을 두고, 직원은 그것만 읽는다.

   ★ 왜 사본인가 — 대표 칸을 직원에게 열면 실적·비용·개인정보·신분증까지 «같은 칸»이라
     함께 열린다. 사본이면 무엇이 나가는지 코드에 적혀 있고, 내릴 수도 있다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const rulesSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'make-firebase-rules.js'), 'utf8');
const rules = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8')).rules;

/* ── ★ 규칙: 읽기는 직원, 쓰기는 관리자만 ── */

test('★★ 사본은 «재직 직원»이 읽고, 쓰기는 «관리자»만 — 남이 대표 경력을 고치면 안 된다', () => {
  const r = rules.kcareer_pub;
  assert.ok(r, '★ kcareer_pub 규칙이 없습니다');
  assert.match(r['.read'], /uid_roles.*sid.*exists/s, '읽기는 사번이 있는 사람만');
  assert.match(r['.read'], /status.*active/s, '재직자만 — 퇴사자는 못 봐야 합니다');
  assert.match(r['.write'], /isAdmin/, '★ 쓰기가 관리자로 좁혀지지 않았습니다');
  assert.doesNotMatch(r['.write'], /sid.*exists/s, '★ 직원이 쓸 수 있으면 기록을 남이 고칩니다');
});

test('★ 규칙은 «만들개»에서 고친다 — JSON 을 손으로 고치면 다음에 조용히 사라진다', () => {
  assert.match(rulesSrc, /rules\.kcareer_pub\s*=/);
});

test('★ 대표 칸(kcareer/{uid})은 여전히 «본인만» — 사본 때문에 열지 않았다', () => {
  const r = rules.kcareer.$uid;
  assert.match(r['.read'], /auth\.uid === \$uid/);
  assert.match(r['.write'], /auth\.uid === \$uid/);
});

/* ── ★ 무엇이 나가는가 ── */

test('★★ 올리는 것은 «경력관리 세 통»뿐이다 — 개인정보·계좌·비용이 섞이면 안 된다', () => {
  const m = bare.match(/var KC_PUB_STORES=\[([^\]]*)\]/);
  assert.ok(m, '★ 올릴 통 목록이 없습니다');
  assert.deepEqual(m[1].replace(/'/g, '').split(',').map((s) => s.trim()),
    ['wiccok', 'cert', 'edu']);
  const fn = cutFn(bare, 'async function kcPubPush(');
  ['personal', 'account', 'id_docs', 'meetfee', 'etcfee', 'consult', 'case', 'fund', 'profile']
    .forEach((k) => assert.equal(fn.indexOf("'" + k + "'"), -1, k + ' 이(가) 올라가면 안 됩니다'));
  assert.match(fn, /KC_PUB_STORES\.forEach/, '목록 한 곳에서 골라야 합니다');
});

test('★ 올리기 전에 «무엇이 나가는지» 알리고 묻는다', () => {
  const fn = cutFn(bare, 'async function kcPubPush(');
  assert.match(fn, /confirm\(/);
  assert.match(fn, /개인정보·계좌·신분증·비용은 올라가지 않습니다/);
});

test('★ 대표만 올린다 — 앱에서도 한 번 더 막는다', () => {
  ['async function kcPubPush(', 'async function kcPubClear('].forEach((d) =>
    assert.match(cutFn(bare, d), /kcOwnerState\(\)!=='owner'/, d + ' 가 대표를 안 확인합니다'));
});

test('★ 내릴 수 있다 — 내릴 수 없으면 «공개»가 아니라 «유출»이다', () => {
  assert.match(bare, /async function kcPubClear/);
  assert.match(cutFn(bare, 'async function kcPubClear('), /\.remove\(\)/);
  assert.match(source, /onclick="kcPubClear\(\)"/);
});

/* ── ★ 직원 화면 ── */

test('★★ 직원은 «경력관리 다섯 화면»만 — 나머지로 못 나간다', () => {
  const m = bare.match(/var KC_PUB_PAGES=\[([^\]]*)\]/);
  assert.ok(m, '★ 열어 줄 화면 목록이 없습니다');
  const list = m[1].replace(/'/g, '').split(',').map((s) => s.trim());
  assert.deepEqual(list,
    ['page-wiccok', 'page-license', 'page-complete', 'page-award', 'page-edu']);
  /* 문지기가 그 목록으로 막는가 — 홈 타일·전체검색으로도 들어오므로 nav_to 에서 막아야 한다 */
  const nt = cutFn(bare, 'function nav_to(');
  assert.match(nt, /_lk==='staff' && KC_PUB_PAGES\.indexOf\(id\)<0/,
    '★ 여기를 안 막으면 타일·검색으로 실적·비용·개인정보에 그대로 들어갑니다');
});

test('★★ 직원 칸으로 «올리지 않는다» — 올리면 대표가 사본을 내려도 안 사라진다', () => {
  assert.match(bare, /function kcNoPush\(\)/);
  ['function fbScheduleAuto(', 'function fbAutoPush('].forEach((d) =>
    assert.match(cutFn(bare, d), /if\(kcNoPush\(\)\) return;/,
      d + ' 를 안 막으면 다른 길로 새 나갑니다'));
  const pull = cutFn(bare, 'async function kcPubPull(');
  assert.doesNotMatch(pull, /fbScheduleAuto|_fbDoPush/, '★ 읽어 온 것을 되올리면 안 됩니다');
});

test('★ 직원은 고치거나 지우지 못한다 — 그 손잡이만 감춘다', () => {
  ['[data-act="new"]', '[data-act="csv"]', '.row-chk']
    .forEach((sel) => assert.ok(source.indexOf('body.kc-staff ' + sel) > 0,
      sel + ' 를 감추지 않았습니다'));
});

test('★★ 직원도 PDF 를 «올려 등록 신쓰»할 수 있다 (대표 지시 2026-09-03)', () => {
  /* 「고치거나 지울수 없어도 pdf 위촉장을 업로드해서 등록할 수 있게」
     ⚠ .ocr-zone 을 다시 감추지 말 것 — 그러면 올릴 길이 사라진다. */
  assert.equal(source.indexOf('body.kc-staff .ocr-zone{display:none'), -1,
    '올리기를 감추면 대표 지시와 어긋납니다');
  const fn = cutFn(bare, 'async function saveOCRRecord(');
  assert.match(fn, /if\(kcIsStaff\(\)\)\{/,
    '직원이 올린 것이 대표 기록에 바로 들어가면 안 됩니다');
  assert.match(fn, /kcInboxSubmit\(page, parsed, file, ext, b64\)/);
  assert.ok(fn.indexOf('kcIsStaff()') < fn.indexOf('const db=get(store)'),
    '★ 분기는 내 기록을 읽기 «전»에 와야 합니다');
  assert.match(cutFn(bare, 'async function kcInboxSubmit('), /kcareer_inbox/,
    '직원은 받은 함에만 쓴다');
  assert.match(cutFn(bare, 'async function kcInboxSubmit('), /\+ uid \+/,
    '자기 uid 자리에만 쓴다');
});

test('★★ 관리 칸은 «원본 보기» 하나만 — 칸을 통째 감추면 열 길이 없다', () => {
  assert.equal(source.indexOf('body.kc-staff .dt th:last-child'), -1,
    '관리 칸을 통째 감추면 원본을 보여 준다는 대표 지시와 어긋납니다');
  const fn = cutFn(bare, 'function rowActions(');
  const at = fn.indexOf('if(kcIsStaff()){');
  assert.ok(at > 0, '직원용으로 갈라 그려야 합니다');
  const staff = fn.slice(at, fn.indexOf('display:inline-flex', at));   /* 직원 갈래만 잘라 본다 */
  assert.match(staff, /원본 보기/);
  [/openEditDrawer/, /delRec/, /deleteAttach/, /attachRec/, /downloadToFolder/].forEach((re) =>
    assert.doesNotMatch(staff, re, '직원 칸에 고치거나 지우는 손잡이가 있습니다'));
  assert.match(staff, /대표 PC/,
    '⚠ 여기 원본이 없는 까닭을 적지 않으면 번 칸이 고장으로 읽힙니다');
});

test('★ 대표는 받은 함을 보고 «들이기»로 한다 — 중복 방지는 이미 있는 길을 쓴다', () => {
  assert.match(source, /onclick="openInboxMgr\(\)"/, '들어갈 길이 있어야 합니다');
  const fn = cutFn(bare, 'async function inboxTake(');
  assert.match(fn, /saveOCRRecord\(x\.page/,
    '새로 짜지 않고 saveOCRRecord 를 쓴다 — 중복 방지·원본 붙이기가 그 안에 있다');
  assert.match(fn, /x\._uid/, '들인 뒤에는 받은 함에서 뻐니다');
});

test('★ 받은 함은 파일 크기를 말한다 — RTDB 에 담는 것이다', () => {
  assert.match(source, /var KC_INBOX_MAX = 4 \* 1024 \* 1024/);
  const fn = cutFn(bare, 'async function kcInboxSubmit(');
  assert.match(fn, /> KC_INBOX_MAX/, '크기를 재지 않으면 큼 파일 하나가 다 말아맕니다');
  assert.match(fn, /permission\|PERMISSION/,
    '⚠ 권한 문제를 「실패」로만 알리면 어떻게 고칠지 알 수 없습니다');
});

test('★ 「왜 못 고치나」를 화면에 적는다 — 단추만 없으면 고장으로 읽힌다', () => {
  const fn = cutFn(bare, 'async function kcStaffEnter(');
  assert.match(fn, /kc-staff-note/);
  assert.match(source, /보기 전용입니다/);
  assert.match(cutFn(bare, 'async function kcPubPull('), /kc-pub-at/,
    '언제 올린 사본인지 적어야 「최신인가」를 알 수 있습니다');
});

test('★ 잠금창 대신 직원 화면 — 재직자인 것이 확인됐을 때만', () => {
  const fn = cutFn(bare, 'function kcStaffView(');
  assert.match(fn, /kcOwnerState\(\)==='locked'/);
  assert.match(fn, /_me\.resolved/, '★ 확인 중에 열어 주면 안 됩니다');
  assert.match(fn, /_me\.sid/, '★ 사번이 없는 사람(외부인)에게 열면 안 됩니다');
  assert.match(cutFn(bare, 'function kcApplyLock('), /kcStaffView\(\)[\s\S]{0,120}kcStaffEnter/);
});

test('★ 대표는 아무것도 달라지지 않는다 — 직원 표시가 붙지 않는다', () => {
  const fn = cutFn(bare, 'function kcApplyLock(');
  assert.match(fn, /st==='owner'[\s\S]{0,160}classList\.remove\('kc-staff'\)/,
    '★ 대표로 돌아왔을 때 직원 표시를 안 걷으면 대표도 못 고칩니다');
});

test('★ 사본을 읽은 «뒤»에 옆줄을 다시 그린다 — 먼저 그리면 건수가 0 으로 남는다', () => {
  const fn = cutFn(bare, 'async function kcStaffEnter(');
  const iPull = fn.indexOf('await kcPubPull()');
  const iNav = fn.indexOf('_safe(buildNav)', iPull);
  assert.ok(iPull > 0 && iNav > iPull, '★ 건수가 0 으로 남습니다(실측 2026-09-02)');
});

/* ── ★ 받은 함 규칙 (대표 지시 2026-09-03) ── */

test('★★ 받은 함 — 직원은 «자기 자리»에만 쓰고, 지우는 것은 관리자만', () => {
  const r = rules.kcareer_inbox;
  assert.ok(r, '★ kcareer_inbox 규칙이 없습니다 — 직원이 올릴 수 없습니다');
  assert.match(r['.read'], /isAdmin/, '대표는 모든 직원이 올린 것을 봐야 들일 수 있습니다');
  const u = r.$uid;
  assert.match(u['.write'], /auth\.uid === \$uid/,
    '★ 남의 자리에 쓸 수 있으면 다른 직원 이름으로 올릴 수 있습니다');
  assert.match(u['.write'], /newData\.exists\(\) \|\|/,
    '★ 지울 수 있으면 올렸던 것을 없애 「난 올렸다」를 다툴 수 없습니다');
  assert.match(u['.write'], /status.*active/s, '재직자만 올립니다');
});

test('★ 규칙은 «만들개»에서 고친다 — 받은 함도 마찬가지', () => {
  assert.match(rulesSrc, /rules\.kcareer_inbox\s*=/);
});

test('★★ 사본(kcareer_pub)은 여전히 직원이 못 쓴다 — 받은 함을 만든 까닭이다', () => {
  assert.doesNotMatch(rules.kcareer_pub['.write'], /sid.*exists/s,
    '★ 여기가 열리면 직원이 대표 기록을 바로 고칠 수 있습니다');
});
