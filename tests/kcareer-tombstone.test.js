/* 경력관리 — 되살리기가 「지운 것」을 데려오지 못하게 (대표 지시 2026-09-03)
   「중복되거나 문제가 많다. 계속 되살리기 하면 중복이고 중복이면 삭제한다.
     이거 왜 자꾸 이런지 근본적 해결을 해라」

   ■ 실측으로 재현한 고리 (하네스 _loop.html)
     ① 클라우드에 중복 섞인 스냅샷 15건.
     ② 사람이 이 기기에서 12건을 지운다 → 3건.
     ③ 그 삭제가 클라우드로 «못 올라간다» — fbAutoPush 가 「클라우드가 더 새롭다」며 멈춘다
        (실측: 올렸나 false).
     ④ fbCheckLoss 가 「3건뿐인데 클라우드에는 15건 … 자료가 지워졌을 수 있습니다」라고 외친다.
     ⑤ 되살리기를 누르면 3 → 15. 지운 중복이 전부 돌아온다(실측).
     ⑥ 다시 ②로. 영원히 돈다.

   ■ 뿌리와 해법
     앱이 «자료가 사라진 것»과 «사람이 지운 것»을 가릴 수 없었다 — 둘 다 「적다」로만 보였다.
     그래서 지운 id 를 기억한다(자리표). 이 기억이 그 둘을 정확히 가른다:
       · 브라우저가 지워진 경우 → 자리표도 함께 사라짐 → 되살리기가 전부 복구(그대로 동작)
       · 사람이 지운 경우      → 자리표가 남음      → 되살리기가 그 id 를 버림

   ⚠ 이 검사들을 느슨하게 고치면 고리가 그대로 돌아온다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('★★ 삭제는 «set() 한 곳»에서 잡는다 — 경로마다 적으면 새 경로에서 빠진다', () => {
  const fn = cutFn(bare, 'function set(key,arr)');
  assert.match(fn, /_tombDiff\(key, get\(key\), arr\)/,
    '삭제하는 코드가 일곱 곳에 흩어져 있습니다 — set() 에서 잡아야 빠지지 않습니다');
  assert.match(fn, /if\(key===TOMB_KEY\)\{ tombSave\(arr\); return; \}/,
    '자리표 자신을 견주면 끝없이 돌아갑니다');
});

test('★★ 사라진 id 는 적고, 다시 나타난 id 는 뗀다 — 재등록·되돌리기가 저절로 반영된다', () => {
  const fn = cutFn(bare, 'function _tombDiff(');
  assert.match(fn, /t\[id\] = now; changed = true;/, '사라짐 → 적는다');
  assert.match(fn, /nks\.forEach\(function\(id\)\{ if\(t\[id\]\)\{ delete t\[id\]/,
    '다시 나타남 → 뗀다. 안 떼면 재등록한 것이 되살리기에서 버려집니다');
});

test('★★ 다른 통에 살아 있으면 지운 것이 아니다 — 옮긴 기록을 버리면 안 된다', () => {
  const fn = cutFn(bare, 'function _tombDiff(');
  assert.match(fn, /aliveIds\(\)\[id\]\) return;/,
    '_tplMerge 는 옛 보관함을 set(k,[]) 로 비우고 새 곳으로 옮깁니다 — 그것은 삭제가 아닙니다');
  assert.match(fn, /bare\.indexOf\('pf_'\) === 0/, '첨부 조각까지 훑으면 느려집니다');
});

/* ⚠ 셈법이 fbPull 안에서 kcApplyRestore 로 «옮겨졌다»(2026-09-03 검토).
   까닭: 되살리는 문이 셋인데 각자 localStorage 에 써서 갈라졌다 —
   fbPull 만 자리표를 지키고 kcRecoverRun 은 자리표를 덮어 지운 중복을 되살려 놓았다.
   규칙은 그대로다. 겨누는 자리만 옮기고, 대신 «세 문 모두»를 고정한다. */

test('★★ 되살리기는 자리표에 있는 id 를 «버린다»', () => {
  const fn = cutFn(bare, 'function kcApplyRestore(');
  assert.match(fn, /tb\[String\(r\.id\)\]/, '자리표에 있는 기록은 데려오지 않아야 합니다');
  assert.match(fn, /dropped\+=\(a\.length-keep\.length\)/, '몇 건을 버렸는지 세어야 합니다');
  assert.match(cutFn(bare, 'function fbPull()'), /_r\.dropped/,
    '몇 건을 버렸는지 사람에게 말해야 합니다');
});

test('★★ 되살리기는 자리표를 «덮지 않고 합친다» — 덮으면 다음 번에 또 부활한다', () => {
  const fn = cutFn(bare, 'function kcApplyRestore(');
  assert.match(fn, /if\(bare===TOMB_KEY\) return;/,
    '★ 자리표를 클라우드 것으로 덮으면 기억이 날아가 고리가 그대로 돌아옵니다');
  assert.match(fn, /Object\.keys\(ct\)\.forEach\(function\(id\)\{ if\(!tb\[id\]\) tb\[id\]=ct\[id\]; \}\)/,
    '이 기기 것과 클라우드 것을 합쳐야 합니다');
  assert.match(fn, /tombSave\(tombPrune\(tb\)\)/);
});

test('★★ 되살리는 문 «셋 모두» 한 곳(kcApplyRestore)을 지난다', () => {
  /* ⚠ 새 되살리기 길을 만들면서 localStorage 에 직접 쓰면 자리표를 우회한다 —
     실제로 그렇게 갈라져 지운 중복이 되살아났다(2026-09-03). */
  assert.match(cutFn(bare, 'function fbPull()'), /kcApplyRestore\(v\.ls, 'pull'\)/);
  assert.match(cutFn(bare, 'async function kcRecoverRun('), /kcApplyRestore\(v\.ls, 'rollback'\)/);
  /* 자리표를 아는 곳 밖에서 ls 를 통째로 쓰는 코드가 남아 있으면 안 된다 */
  const strays = bare.split('localStorage.setItem(NS+bare').length - 1;
  assert.equal(strays, 1,
    '★ ls 를 이 기기에 쓰는 곳은 kcApplyRestore 하나여야 합니다 (지금 ' + strays + '곳)');
});

test('★★ 「그 시점으로 되돌리기」는 그때 살아 있던 것의 자리표를 «뗀다»', () => {
  /* 되살려 놓고 「지웠다」고 기억하면 다음 불러오기가 또 버린다 — 앞뒤가 어긋난다. */
  const fn = cutFn(bare, 'function kcApplyRestore(');
  assert.match(fn, /if\(mode==='rollback'\)/);
  assert.match(fn, /delete tb\[k\]; freed\+\+;/);
});

test('★★ 「없어진 것만 되살리기」는 «내가 지운 것»을 켜 두지 않는다', () => {
  /* ⚠ 다른 방에서 같은 날 만든 기능이라 자리표를 몰랐다. 전부 켜진 채로 나와서
     한 번 누르면 지운 중복이 통째로 돌아왔다(2026-09-03 검토에서 찾음). */
  const fn = cutFn(bare, 'async function kcMissingOpen(');
  assert.match(fn, /deleted:tombHas\(r\.id\)/, '자리표를 함께 봐야 가릴 수 있습니다');
  assert.match(fn, /\(f\.deleted\?'':' checked'\)/,
    '★ 자리표에 있는 것은 켜 두면 안 됩니다');
  assert.match(fn, /내가 지운 것/, '무엇인지 화면에 밝혀야 합니다');
  const run = cutFn(bare, 'function kcMissingRun(');
  assert.match(run, /지운것\.length && !confirm\(/, '되살리기 전에 한 번 묻습니다');
});

test('★★ 손실 판정에서 «내가 지운 것»을 뺀다 — 거짓 경보가 고리를 돌렸다', () => {
  const fn = cutFn(bare, 'function fbCheckLoss()');
  assert.match(fn, /var del=tombCount\(\)/);
  assert.match(fn, /cloud\.total - del <= here\.total \+ 5/,
    '★ 이 줄이 없으면 중복을 지울 때마다 「자료가 지워졌을 수 있습니다」가 뜹니다');
});

test('★★ 낡은 클라우드에는 «되살리기»가 아니라 «올리기»를 권한다', () => {
  const at = source.indexOf('id="fbStaleNotice"');
  assert.ok(at > 0, '클라우드가 낡았다고 알리는 띠가 있어야 합니다');
  const band = source.slice(at, at + 900);
  assert.match(band, /onclick="fbStaleFix\(\);return false"/);
  assert.doesNotMatch(band, /fbPull\(\)/,
    '★ 여기에 되살리기를 두면 지운 중복을 되살려 놓던 길이 그대로 살아납니다');
  assert.match(cutFn(bare, 'function fbStaleFix()'), /fbPush\(\)/);
});

test('★ 자리표는 클라우드로 올라간다 — 다른 기기도 존중해야 한다', () => {
  const m = source.match(/var FB_SKIP=\[([^\]]*)\]/);
  assert.ok(m, 'FB_SKIP 을 찾지 못했습니다');
  assert.equal(m[1].indexOf('_tomb'), -1,
    '★ FB_SKIP 에 넣으면 자리표가 이 기기에만 남아 다른 기기가 중복을 되살려 놓습니다');
});

test('★ 자리표가 자료보다 커지지 않는다', () => {
  assert.match(source, /var TOMB_KEY='_tomb', TOMB_MAX=3000, TOMB_DAYS=400;/);
  const fn = cutFn(bare, 'function tombPrune(');
  assert.match(fn, /TOMB_DAYS\*86400000/, '오래된 것은 버립니다');
  assert.match(fn, /ks\.slice\(0,TOMB_MAX\)/, '너무 많으면 새것만 남깁니다');
});

test('★★ 「진짜로 지워진 경우」는 그대로 복구된다 — 이 길을 막으면 안 된다', () => {
  /* 브라우저 자료가 지워지면 자리표(cm3__tomb)도 함께 사라진다. 그러면 걸러 낼 것이 없어
     되살리기가 전부 복구한다. 실측(_loop2.html): 자리표 0 · 손실 띠 뜸 · 되살리기 15/15.
     ⚠ 자리표를 localStorage 밖(예: 쿠키·IndexedDB)에 두면 이 성질이 깨진다. */
  assert.match(cutFn(bare, 'function tombSave('), /LS\.set\(NS\+TOMB_KEY/,
    '★ 자리표는 반드시 기록과 «같은 곳»(localStorage)에 있어야 합니다 — 함께 지워져야 복구가 됩니다');
  assert.match(cutFn(bare, 'function tombLoad('), /LS\.get\(NS\+TOMB_KEY\)/);
});

test('★★ 손실 띠에도 «이 기기 것이 맞다»(올리기) 길이 있어야 한다', () => {
  /* 자리표가 생기기 «전»에 지운 것은 앱이 알 수 없다. 그럴 때 되살리기만 권하면
     지운 중복이 그대로 돌아온다 — 사람이 고를 수 있어야 한다(대표 제보 2026-09-03). */
  const at = source.indexOf('id="fbLossNotice"');
  const band = source.slice(at, at + 1400);
  assert.match(band, /onclick="fbPull\(\);return false"/, '진짜 유실일 때의 길');
  assert.match(band, /onclick="fbStaleFix\(\);return false"/, '내가 지운 것일 때의 길');
  assert.match(cutFn(bare, 'function fbCheckLoss()'), /이 기기 것이 맞다/,
    '어느 쪽을 눌러야 하는지 띠 글에 적어야 합니다');
});
