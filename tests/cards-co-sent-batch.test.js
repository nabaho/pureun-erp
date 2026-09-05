/* 📤 전 사업장 배포 기록 — 3걸음 (대표 지시 2026-09-03)
   「취업규칙 이후에 근로계약서와 연차 관련 기타 서류 등 모든 사업장에 송부되었던 서류를
    한번에 데이터함에 보관하려고 한다」

   ★ 이것은 «보내는» 도구가 아니라 «기록하는» 도구다 — 대표 지시의 말이 «보관»이었다.
     없는 발송 사실을 만들어 내지 않는다.

   ★ 이 걸음이 지켜야 하는 것
     ① 한 장씩 쓰지 않는다 — 312곳이면 쓰기가 312번이다(2026-08-16 오류 5,000건).
     ② 묶음 줄을 «먼저» 쓴다 — 중간에 끊겨도 되돌릴 수 있어야 한다.
     ③ 계약이 끝난 곳은 «기본으로 뺀다» — 뺀 것은 세어서 말한다.
     ④ 되돌릴 수 있다.

     node --test tests/cards-co-sent-batch.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

function load() {
  const ctx = {
    console, DB_ROOT: 'pucards', BULK_PATCH_CHUNK: 200,
    /* ⚠ 갈래 다듬개는 «진짜»를 싣는다 — 대역을 두면 아무 글자나 기록에 들어가도 모른다 */
    SENT_KINDS: null, sentKindOf: null
  };
  vm.createContext(ctx);
  const a = SRC.indexOf('const SENT_KINDS = [');
  const end = SRC.indexOf('\n}', SRC.indexOf('function sentKindOf(v){', a)) + 2;
  vm.runInContext(SRC.slice(a, end).replace(/^const /, 'var '), ctx);
  vm.runInContext(fnBody('coSentBatchPlan') + '\n' + fnBody('coSentBatchRec') + '\n'
    + fnBody('coSentBatchWrites') + '\n' + fnBody('coSentBatchUndoWrites'), ctx);
  return ctx;
}

const co = (key, left) => ({ key, name: key, erp: left ? { left: true } : null });

/* ── ③ 누구에게 남기나 ── */

test('★ 계약이 끝난 곳(🚪)은 «기본으로» 뺀다 — 끝난 곳이 받은 것으로 잡히면 안 된다', () => {
  const c = load();
  const p = c.coSentBatchPlan([co('a'), co('b', true), co('c')]);
  /* ⚠ vm 안에서 만든 배열은 deepEqual 이 «구조는 같은데 다른 realm»이라며 물린다 */
  assert.equal(p.hits.map(o => o.key).join(','), 'a,c');
  assert.equal(p.해지.length, 1);
});

test('★ 회사를 못 가린 곳도 뺀다 — 열쇠가 없으면 어디에 남길지 알 수 없다', () => {
  const c = load();
  const p = c.coSentBatchPlan([co('a'), { name: '열쇠없음' }, null]);
  assert.equal(p.hits.map(o => o.key).join(','), 'a');
  assert.equal(p.열쇠없음.length, 1);
});

test('★★ 뺀 곳을 «세어서» 말한다 — 조용히 빼면 「다 보낸 줄」 안다', () => {
  const open = fnBody('openCoSentBatch');
  assert.match(open, /plan\.해지\.length/, '계약해지 몇 곳을 뺐는지 안 말한다');
  assert.match(open, /plan\.열쇠없음\.length/, '회사를 못 가린 곳을 안 말한다');
  assert.match(open, /skipTxt/, '화면에 적을 자리가 없다');
});

/* ── 묶음 한 줄 ── */

test('★ 묶음에 «어디에 남겼는지»(keys)를 담는다 — 없으면 되돌릴 길이 없다', () => {
  const c = load();
  const r = c.coSentBatchRec({ at: 100, day: '2026-09-03', by: 'na@pureun.kr',
                               kind: '근로계약서', name: '2026년 서식', keys: ['a', 'b', ''] });
  assert.equal(r.keys.join(','), 'a,b', '빈 열쇠는 걸러야 한다');
  assert.equal(r.n, 2, '센 수와 담은 열쇠 수가 어긋나면 안 된다');
  assert.equal(r.kind, '근로계약서');
  assert.equal(r.day, '2026-09-03');
});

test('모르는 갈래는 「그 밖」으로 — 아무 글자나 들어가면 나중에 셀 수가 없다', () => {
  const c = load();
  assert.equal(c.coSentBatchRec({ kind: '아무거나', keys: [] }).kind, '그 밖');
  assert.equal(c.coSentBatchRec({ kind: '연차', keys: [] }).kind, '연차');
});

/* ── ① 모아서 쓴다 ── */

test('★★ 한 장씩 쓰지 않는다 — 312곳이 통 두 개로 나간다', () => {
  const c = load();
  const keys = [];
  for (let i = 0; i < 312; i++) keys.push('k' + i);
  const rec = c.coSentBatchRec({ at: 1, keys: keys, kind: '연차', name: 'x' });
  const plans = c.coSentBatchWrites('B1', rec, 200);
  assert.equal(plans.length, 3, '묶음 1 + 회사 200 + 회사 112 = 통 세 개여야 한다');
  const 자리수 = plans.reduce((a, u) => a + Object.keys(u).length, 0);
  assert.equal(자리수, 313, '남기는 자리는 312곳 + 묶음 한 줄이다');
});

test('★★ 묶음 줄을 «먼저» 쓴다 — 중간에 끊겨도 되돌릴 수 있어야 한다', () => {
  const c = load();
  const rec = c.coSentBatchRec({ at: 1, keys: ['a', 'b'], kind: '자료', name: 'x' });
  const plans = c.coSentBatchWrites('B1', rec, 200);
  assert.deepEqual(Object.keys(plans[0]), ['pucards/sentBatch/B1'],
    '★ 첫 통이 묶음이 아니다 — 회사 줄만 남고 묶음이 없으면 되찾을 길이 없다');
});

test('★ 회사별 줄의 «열쇠»가 묶음 번호다 — 두 번 눌러도 줄이 두 개가 안 된다', () => {
  const c = load();
  const rec = c.coSentBatchRec({ at: 7, day: '2026-09-03', by: 'na@pureun.kr',
                                 keys: ['a'], kind: '연차', name: '연차 안내' });
  const one = c.coSentBatchWrites('B1', rec, 200);
  const two = c.coSentBatchWrites('B1', rec, 200);
  assert.deepEqual(Object.keys(one[1]), ['pucards/sentDocs/a/B1']);
  assert.deepEqual(Object.keys(two[1]), Object.keys(one[1]), '두 번 써도 같은 자리다');
  const v = one[1]['pucards/sentDocs/a/B1'];
  assert.equal(v.kind, '연차');
  assert.equal(v.name, '연차 안내');
  assert.equal(v.day, '2026-09-03');
  assert.equal(v.batch, 'B1', '어느 묶음에서 왔는지 — 되돌릴 때 이것으로 찾는다');
});

test('회사별 줄에 «열쇠 목록»을 베끼지 않는다 — 312곳에 312개씩이면 안 된다', () => {
  const c = load();
  const rec = c.coSentBatchRec({ at: 1, keys: ['a', 'b', 'c'], kind: '자료', name: 'x' });
  const plans = c.coSentBatchWrites('B1', rec, 200);
  const v = plans[1]['pucards/sentDocs/a/B1'];
  assert.equal(v.keys, undefined, '★ 회사마다 열쇠 목록을 통째로 베꼈다: ' + JSON.stringify(v));
  assert.equal(v.n, undefined);
});

/* ── ④ 되돌리기 ── */

test('★★ 되돌리면 «회사별 줄을 먼저» 지우고 묶음을 마지막에 지운다', () => {
  const c = load();
  const plans = c.coSentBatchUndoWrites('B1', ['a', 'b'], 200);
  assert.equal(plans.length, 2);
  assert.equal(JSON.stringify(plans[0]),
    JSON.stringify({ 'pucards/sentDocs/a/B1': null, 'pucards/sentDocs/b/B1': null }));
  assert.equal(JSON.stringify(plans[1]), JSON.stringify({ 'pucards/sentBatch/B1': null }),
    '★ 묶음을 먼저 지우면 중간에 끊겼을 때 어디를 지울지 알 길이 없다');
});

test('★ 되돌리기도 «모아서» 한다', () => {
  const c = load();
  const keys = [];
  for (let i = 0; i < 250; i++) keys.push('k' + i);
  const plans = c.coSentBatchUndoWrites('B1', keys, 200);
  assert.equal(plans.length, 3, '200 + 50 + 묶음 = 통 세 개');
});

/* ── 화면에서 켜는 길 ── */

test('★ 켜는 길이 «둘» 있다 — PC 설정과 폰 메뉴', () => {
  assert.match(SRC, /btn\('openCoSentBatch\(\)'/, 'PC 설정에 단추가 없다');
  assert.match(SRC, /openCoSentBatch\(\)">📤 서류 배포 기록/, '폰 메뉴에 단추가 없다');
});

test('★ 서류 이름 없이는 안 남긴다 — 나중에 무엇을 보냈는지 알 수 없다', () => {
  const go = fnBody('coSentBatchGo');
  assert.match(go, /if\(!name\) return toast\(/, '이름이 비어도 그냥 남긴다');
  /* ⚠ 「이름을 확인한다」가 «쓰기보다 앞»에 있어야 한다 */
  assert.ok(go.indexOf('if(!name)') < go.indexOf('.update('), '★ 이름 검사가 쓰기 뒤에 있다');
});

test('★ 지난 날짜로 남겨도 하루가 안 밀린다 — 낮 12시로 못 박는다', () => {
  const go = fnBody('coSentBatchGo');
  assert.match(go, /T12:00:00/, '★ 자정으로 두면 시간대에 따라 하루가 밀린다');
});

test('★ 남긴 뒤에는 받아 둔 회사 기록을 버린다 — 안 버리면 방금 남긴 것이 안 보인다', () => {
  const go = fnBody('coSentBatchGo');
  assert.match(go, /delete _coSent\[k\]/);
  const undo = fnBody('coSentBatchUndo');
  assert.match(undo, /delete _coSent\[k\]/, '되돌린 뒤에도 버려야 한다');
});

/* ── 읽는 쪽이 배포 기록을 알아본다 ── */

test('★ 배포 기록도 같은 줄기로 읽힌다 — 이름·갈래·날짜', () => {
  const ctx = { console };
  vm.createContext(ctx);
  const a = SRC.indexOf('const CO_SENT_MAX_CARDS = 30;');
  vm.runInContext(fnBody('sendLogList') + '\n'
    + SRC.slice(a, SRC.indexOf('/* ══════ 📤 전 사업장 배포 기록')).replace(/^const /, 'var '), ctx);
  const rows = ctx.coSentList([], {}, {
    B1: { at: 100, day: '2026-08-01', kind: '근로계약서', name: '2026년 서식', batch: 'B1' }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].what, '2026년 서식', '★ 배포 기록은 names 가 없다 — name 을 봐야 한다');
  assert.equal(rows[0].kind, '근로계약서');
  assert.equal(rows[0].day, '2026-08-01', '★ 적어 둔 날이 있으면 그것을 쓴다');
});

test('★ 갈래가 「자료」가 아니면 줄에 «적어» 보인다 — 무엇을 보냈는지가 갈래다', () => {
  const html = fnBody('coSentHtml');
  assert.match(html, /r\.kind && r\.kind!=='자료'/,
    '근로계약서인지 연차인지 화면에 안 나오면 셀 수가 없다');
});
