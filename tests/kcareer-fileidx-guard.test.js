/* 경력관리 — 「원본이 있나」를 모르는 동안에는 지우거나 덮지 않는다 (대표 지시 2026-09-02 「고쳐」)

   ■ 무엇이 위험했나
   「중복 자동 정리」와 「한꺼번에 채우기」는 둘 다 hasOriginal(r) 에 기댄다. 그것은
   파일 목차(_fileIdSet)를 «동기»로 본다. 그런데 목차는 앱을 켠 «뒤» 채워지고,
   전에는 실패해도 조용했다(catch(e){} 로 삼켰다).

   실측(2026-09-02) — 목차가 «반만» 채워진 순간:
     · 자동 정리가 원본이 «있는» 줄을 「없음」으로 보고 「겹침 100%」로 지우려 했다
     · 한꺼번에 채우기는 그 줄을 후보로 올려, 붙이는 순간 이미 있는 원본을 덮는다
       (폴더로 잇는 쪽은 되돌리기가 있지만, 파일을 골라 붙이는 쪽은 «없다»)

   ★ 확인 창에는 「원본이 없어 파일은 잃지 않습니다」라고 적혀 있었다 —
     그 약속을 못 지키는 상태였다. 지우거나 덮는 일은 «알 때만» 한다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* 문지기를 «실제로 태워» 본다 — 글자만 보면 「함수는 있는데 안 부른다」를 못 잡는다 */
function 태우기(state) {
  const ctx = { console, _fileIdxState: state, _safe() { }, loadFileIndex() { }, _alerts: [] };
  ctx.alert = function (m) { ctx._alerts.push(String(m)); };
  vm.createContext(ctx);
  ['function fileIdxReady(', 'function fileIdxWhy(', 'function fileIdxGuard(']
    .forEach((d) => vm.runInContext(cutFn(source.replace(/\r\n/g, '\n'), d), ctx));
  return ctx;
}

/* ── ★ 문지기가 판정한다 ── */

test('★★ 목차를 읽는 중에는 «막는다» — 그때가 잘못 지우던 순간이다', () => {
  const c = 태우기('loading');
  assert.equal(c.fileIdxGuard(), false, '★ 통과시키면 원본 있는 줄을 지웁니다');
  assert.match(c._alerts[0], /아직 읽는 중/);
  assert.match(c._alerts[0], /원본이 있는 서류를/, '왜 막는지 알려야 합니다');
});

test('★★ 저장소를 «못 열었으면» 막는다 — 빈 목차와 「파일 없음」은 다르다', () => {
  const c = 태우기('failed');
  assert.equal(c.fileIdxGuard(), false);
  assert.match(c._alerts[0], /열지 못했습니다/);
  assert.match(c._alerts[0], /알 수 없어 손대지 않습니다/, '무엇을 안 하는지 적어야 합니다');
  assert.match(c._alerts[0], /비공개|시크릿/, '어떻게 하면 되는지까지 적어야 합니다');
});

test('★ 목차가 준비됐으면 «통과»한다 — 늘 막으면 기능이 죽는다', () => {
  const c = 태우기('ready');
  assert.equal(c.fileIdxGuard(), true);
  assert.deepEqual(c._alerts, []);
});

test('★ 막힌 뒤에 «다시 읽어» 본다 — 한 번 실패했다고 영영 막히면 안 된다', () => {
  const fn = cutFn(bare, 'function fileIdxGuard(');
  assert.match(fn, /loadFileIndex/);
});

/* ── ★ 실패를 삼키지 않는다 ── */

test('★★ 목차 읽기가 실패하면 «실패라고» 적는다 — 삼키면 빈 목차와 구별이 안 된다', () => {
  const fn = cutFn(bare, 'async function loadFileIndex(');
  assert.match(fn, /_fileIdxState\s*=\s*ok\s*\?\s*'ready'\s*:\s*'failed'/);
  assert.match(fn, /ok=false/, '실패를 표시해야 합니다');
  assert.match(fn, /console\.warn/, '왜 실패했는지 남겨야 고칠 수 있습니다');
});

test('★★ getAllFileIdsFromIDB 가 실패를 «빈 목록»으로 돌려주지 않는다', () => {
  /* 빈 목록으로 돌려주면 「파일이 하나도 없다」와 똑같이 보인다 — 그것이 이 사고의 뿌리다 */
  const fn = cutFn(bare, 'async function getAllFileIdsFromIDB(');
  assert.doesNotMatch(fn, /catch\s*\(e\)\s*\{\s*return \[\]/, '★ 실패를 삼키면 안 됩니다');
  assert.match(fn, /rej\(/, 'onerror 는 던져야 합니다');
});

/* ── ★ 손대는 자리마다 문지기를 지난다 ── */

test('★★ 중복 자동 정리 — 미리보기와 «지우기» 둘 다 지난다', () => {
  assert.match(cutFn(bare, 'function dupAutoPreview('), /if\(!fileIdxGuard\(\)\) return;/,
    '★ 미리보기 자체가 거짓이 됩니다');
  assert.match(cutFn(bare, 'function dupAutoRun('), /if\(!fileIdxGuard\(\)\) return;/,
    '★ 미리보기 뒤에 목차가 어긋날 수도 있습니다 — 지우기 바로 앞에서 한 번 더');
});

test('★★ 한꺼번에 채우기 — 후보 고르기와 «붙이기» 둘 다 지난다', () => {
  assert.match(cutFn(bare, 'function openBulkMatch('), /if\(!fileIdxGuard\(\)\) return;/,
    '★ 원본 있는 줄이 후보가 되면 붙이는 순간 덮습니다');
  assert.match(cutFn(bare, 'async function bulkSaveMatched('), /if\(!fileIdxGuard\(\)\) return;/,
    '★ 파일을 골라 붙이는 쪽은 되돌리기가 없습니다');
});

test('★ 문지기는 «네 자리 모두»에 있다 — 한 곳만 빠지면 그 길로 샌다', () => {
  assert.ok((bare.match(/fileIdxGuard\(\)/g) || []).length >= 5,
    '네 자리 + 함수 안 자기 호출 = 다섯 번 이상 나와야 합니다');
});

test('★ 보기·첨부 판정 자체는 «막지 않는다» — 화면이 통째로 멈추면 안 된다', () => {
  /* 목차가 어긋나면 badge 가 잠깐 틀릴 뿐이고, _refreshAttachUI 가 다시 그린다.
     막아야 하는 것은 «지우거나 덮는» 일뿐이다. */
  assert.doesNotMatch(cutFn(bare, 'function hasOriginal('), /fileIdxGuard/,
    '★ 여기서 막으면 목록이 그려지지 않습니다');
  assert.match(cutFn(bare, 'async function loadFileIndex('), /_refreshAttachUI\(\)/);
});
