/* 떠 있는 「백업·복구」 알약이 옆줄 맨 아래 줄을 «덮던» 것 (대표 화면 2026-09-06)
   「백업복구로 글자가 가려졌다 이부분 어떻게 해결하나」

   ★ 그 알약은 js/pu-backup.js 가 left:12px · bottom:58px 에 붙박아 둔다. 메일 창의
     옆줄 맨 아래 줄(‹ 기업정보함으로 · 🔒 개인 폴더 열기 · ⚙ 환경설정)이 바로 거기다.
     「‹ 기업정보함으로」가 「…으로」로 잘려 보였다.
   ⚠ 덮는 것은 곧 «못 누르는 것»이다 — 손가락이 알약을 먼저 만난다.
     2026-08-21 에 「전체 비우기」가 같은 알약에 가려 「…체 비우기」로 보였던 것과 같은 일.

   지키는 것.
   ① 메일 창에서는 알약을 비켜 둔다
   ② 그러면서 «길을 없애지 않는다» — 같은 창으로 가는 줄을 옆줄에 넣는다
   ③ 창을 두 벌로 짓지 않는다 — 알약을 그대로 누른다
   ④ 알약이 없는 사람에게는 그 줄도 안 그린다
   ⑤ 메일 창에서만이다 — 기업정보함·포털에서는 알약이 그대로 있어야 한다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
const bottom = sliceFn(app, 'function pcSideBottomHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');

test('★★ 메일 창에서는 알약을 «비켜 둔다» — 안 비키면 맨 아래 줄을 못 누른다', () => {
  assert.match(bare, /body\.mailview #pu-backup-admin-button\{display:none!important\}/,
    '알약이 메일 창에서도 그대로 떠 있습니다 — 옆줄 맨 아래 줄을 덮습니다');
});

test('★★ 그러면서 «길을 없애지 않는다» — 옆줄에 같은 창으로 가는 줄이 있다', () => {
  assert.match(bottom, /mbBackupOpen\(\)/,
    '알약만 감추고 갈 길을 안 냈습니다 — 메일 창에서 백업·복구로 갈 수가 없습니다');
  assert.match(bottom, /백업·복구/, '무엇으로 가는 줄인지 안 적혀 있습니다');
});

test('★★ 창을 «두 벌로» 짓지 않는다 — 알약을 그대로 누른다', () => {
  const f = sliceFn(app, 'function mbBackupOpen(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /getElementById\('pu-backup-admin-button'\)/, '알약을 안 찾습니다');
  assert.match(f, /\.click\(\)/, '알약을 안 누릅니다 — 창을 새로 지으면 언젠가 한쪽만 고칩니다');
  assert.ok(!/innerHTML|showPanel|createElement/.test(f),
    '백업 창을 여기서 새로 짓습니다: ' + f);
});

test('★★ 알약이 없으면 «알려 주고» 끝난다 — 눌러도 아무 일 없으면 고장으로 읽힌다', () => {
  const f = sliceFn(app, 'function mbBackupOpen(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /if\(!b\) return toast\(/, '알약이 없을 때 조용히 지나갑니다');
});

test('★★ 그 줄은 «메일 창 · 대표»일 때만 그린다', () => {
  assert.match(bottom, /onMailNow && state\.isAdmin/,
    '기업정보함에도 그리거나, 알약이 없는 직원에게도 그립니다');
});

/* ══════ 진짜로 그려 본다 ══════ */
function draw(view, isAdmin){
  const ctx = { Object, String, Number, Array,
    state: { view: view, groups: {}, isAdmin: !!isAdmin, privOpen: false } };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function pcSideBottomHtml('), ctx);
  return ctx.pcSideBottomHtml();
}

test('★★ 메일 창에서 «나가는 길»과 «백업 길»이 함께 있다', () => {
  const h = draw('mail', true);
  assert.match(h, /기업정보함으로/, '메일 창에 갇힙니다');
  assert.match(h, /환경설정/, '설정으로 갈 길이 없습니다');
  assert.match(h, /백업·복구/, '백업·복구로 갈 길이 없습니다');
});

test('★★ 기업정보함에서는 «백업 줄을 안 그린다» — 거기서는 알약이 그대로 뜬다', () => {
  const h = draw('list', true);
  assert.ok(h.indexOf('백업·복구') < 0,
    '기업정보함에도 그립니다 — 알약과 나란히 둘이 되어 한 가지 일에 문이 둘입니다');
});

test('★★ 알약이 없는 직원에게는 «안 그린다»', () => {
  const h = draw('mail', false);
  assert.ok(h.indexOf('백업·복구') < 0, '눌러도 막히는 줄을 보여 줍니다');
  assert.match(h, /기업정보함으로/, '직원이 메일 창에 갇힙니다');
});
