/* 관리자는 「전체 근로자」로 시작한다 — 대표 지시 2026-08-10
   "전체나온다. 권형하는 항상 전체 근로자로 기준을 잡아 달라"

   총괄책임자는 전 직원 것을 보는 것이 기본이다. 자기 것만 보려면 바꾸면 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const pick = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/)[0];

test('★ 관리자는 열자마자 전체 근로자를 본다', () => {
  assert.ok(/if \(!ownerDefaulted\)/.test(pick), '기본값을 맞추는 곳이 없습니다.');
  assert.ok(/pickOwner\(ALL_OWNERS\)/.test(pick), '전체 근로자로 안 맞춥니다.');
});

test('★ 한 번만 맞춘다 — 사람을 골라 볼 수 있어야 한다', () => {
  assert.ok(/ownerDefaulted = true;/.test(pick),
    '다시 그릴 때마다 되돌리면 한 사람을 골라 볼 수가 없습니다.');
  const set = pick.indexOf('ownerDefaulted = true;');
  const use = pick.indexOf('pickOwner(ALL_OWNERS)');
  assert.ok(set > 0 && use > set, '표식을 먼저 세워야 되풀이되지 않습니다.');
});

test('고르개 글자도 함께 맞춘다', () => {
  const at = pick.indexOf('pickOwner(ALL_OWNERS)');
  assert.ok(/ownerSel'\)\.value = ALL_OWNERS/.test(pick.slice(0, at)),
    '화면은 전 직원인데 칸에는 「내 사진」이라고 적혀 있으면 헷갈립니다.');
});

test('볼 사람이 없으면 굳이 바꾸지 않는다', () => {
  assert.ok(/if \(!gridOwner && ids\.length\)/.test(pick),
    '혼자뿐인데 「전체 근로자」로 두면 빈 화면처럼 보입니다.');
});

/* ── 올리기는 풀고, 지우기·판독은 그대로 잠근다 ── */
test('★ 전체 근로자에서도 올릴 수 있다', () => {
  assert.ok(/function viewingOnlyOther\(\) \{ return viewingOther\(\) && gridOwner !== ALL_OWNERS; \}/.test(app),
    '올리기를 잠그면 관리자가 앱을 열 때마다 화면을 바꿔야 올릴 수 있습니다.');
  /* ⚠ camBtn 은 없앴다(대표 지시 2026-08-10) — 목록에서도 빠져야 한다 */
  assert.ok(/\['docBtn'\][\s\S]{0,200}viewingOnlyOther\(\)/.test(app),
    '올리기 단추가 아직 옛 판단을 씁니다.');
});

test('★ 지우기·판독은 여전히 잠긴다 (남의 사진이 섞여 있다)', () => {
  const m = app.match(/function blockedIfOther\([^)]*\)[\s\S]*?\n\}/);
  assert.ok(m, 'blockedIfOther 를 찾지 못했습니다.');
  assert.ok(/viewingOther\(\)/.test(m[0]) && !/viewingOnlyOther/.test(m[0]),
    '전체 근로자 화면에는 남의 사진이 섞여 있어 지우기·판독은 막아야 합니다.');
});

test('한 사람을 골라 볼 때는 올리기도 잠긴다', () => {
  /* 「신욱임 사진」을 보는 중에 올리면 누구 것인지 헷갈린다 — 예전 규칙 그대로 */
  const m = app.match(/function viewingOnlyOther\(\)[^\n]*/);
  assert.ok(/viewingOther\(\) &&/.test(m[0]),
    '전체 근로자만 예외여야 합니다 — 한 사람을 볼 때까지 풀면 안 됩니다.');
});
