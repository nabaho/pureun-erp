'use strict';
/* 업체 고유번호를 «만들 때 바로» 준다   2026-09-08

   대표 물음: 「번호가 왜 사라졌나?」
   사라진 게 아니라 «안 준» 것이었다 — 번호는 환경설정 화면에 들어가
   단추를 눌러야만 붙었다. 그때까지 목록의 번호 칸이 「—」로 남는다.

   ■ 이 검사가 지키는 것
     ① 셈은 «한 곳»(coAssignNumbers) — 환경설정·띠·이관이 모두 같은 것을 쓴다
     ② 번호통은 서버에서 잠그고 뽑는다 — 화면이 번호를 지어내지 않는다
     ③ 이미 번호가 있는 곳은 안 건드린다 (몸통은 한 번 주면 안 바꾼다)
     ④ 이관이 끝나면 «곧바로» 준다
     ⑤ 못 줘도 앞의 일(이관)을 되돌리지 않는다
     ⑥ 번호 없는 곳이 있으면 업체관리에서 «보인다» — 없으면 안 그린다 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { test } = require('node:test');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = stripComments(src);

function ontology() {
  const sb = { module: { exports: {} }, window: {}, console: console };
  sb.exports = sb.module.exports;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-ontology.js'), 'utf8'), sb);
  return sb.window.PuOntology || sb.module.exports;
}

/* 진짜 함수를 떼어 돌린다 — 서버(coNoTakeBlock)와 저장만 대신 세운다 */
function realm(opts) {
  opts = opts || {};
  const O = ontology();
  const saved = [];
  const ctx = {
    console: console, window: { PuOntology: O, CURRENT_USER: { sid: 'P-001' } },
    CURRENT_USER: { sid: 'P-001' },
    dbGet: function () { return opts.companies || []; },
    dbUpsertMany: function (k, rows) { saved.push([k, rows]); return opts.saveFails ? false : true; },
    showToast: function (m) { (ctx._toasts = ctx._toasts || []).push(m); },
    coNoTakeBlock: function (n) {
      if (opts.serverFails) return Promise.reject(new Error('번호통을 잠그지 못했습니다'));
      const first = (opts.from || 10374);
      return Promise.resolve({ first: first, last: first + n - 1 });
    }
  };
  vm.createContext(ctx);
  ['function coNoTargets(', 'function coNoHeadOf(', 'function coAssignNumbers(', 'function coAutoNumber('
  ].forEach(function (d) { vm.runInContext(cutFn(src, d), ctx); });
  ctx._saved = saved;
  return ctx;
}

const NO_NUM = { id: 'co-new', name: '주식회사 나래산업', typeCode: '자문', status: 'active' };
const HAS_NUM = { id: 'co-old', name: '이미 있는 곳', typeCode: '급여', status: 'active', puNo: 10200, puNoHead: '급여' };

test('① 번호 없는 곳만 고른다 — 있는 곳은 안 건드린다', function () {
  const ctx = realm({ companies: [NO_NUM, HAS_NUM] });
  const got = vm.runInContext('coNoTargets().map(function(c){return c.id;})', ctx);
  assert.deepEqual(Array.from(got), ['co-new'], '★ 이미 번호가 있는 곳까지 골랐습니다');
});

test('② 번호는 «서버 번호통»에서 온다 — 화면이 지어내지 않는다', function () {
  const fn = stripComments('<script>' + cutFn(src, 'function coAssignNumbers(') + '</script>');
  assert.match(fn, /coNoTakeBlock\(todo\.length\)/, '★ 서버에서 안 뽑고 있습니다');
  assert.ok(!/Math\.max|maxNo|\+\s*1\s*;/.test(fn), '★ 번호를 화면에서 셈하고 있습니다 — 둘이 겹칩니다');
});

test('③ ★ 실제로 돌려 본다 — 몸통·머리·이력이 함께 붙는다', async function () {
  const ctx = realm({ companies: [NO_NUM, HAS_NUM], from: 10374 });
  const r = await vm.runInContext('coAssignNumbers(coNoTargets())', ctx);
  assert.equal(r.count, 1);
  const rows = ctx._saved[0][1];
  assert.equal(ctx._saved[0][0], 'companies');
  assert.equal(rows.length, 1, '★ 번호 있는 곳까지 다시 저장하고 있습니다');
  assert.equal(rows[0].puNo, 10374);
  assert.equal(rows[0].puNoHead, '자문', '★ 머리를 유형에서 안 뽑았습니다');
  assert.equal(rows[0].puNoHistory.length, 1, '★ 언제 누가 줬는지 안 남겼습니다');
  assert.equal(rows[0].puNoHistory[0].by, 'P-001');
  assert.equal(rows[0].name, NO_NUM.name, '다른 칸을 건드리지 않습니다');
});

test('④ 줄 것이 없으면 서버를 두드리지 않는다', async function () {
  const ctx = realm({ companies: [HAS_NUM] });
  const r = await vm.runInContext('coAssignNumbers(coNoTargets())', ctx);
  assert.equal(r.count, 0);
  assert.equal(ctx._saved.length, 0, '★ 줄 것이 없는데 저장했습니다');
});

test('⑤ ★ 서버가 안 되면 «앞의 일을 되돌리지 않고» 알리기만 한다', async function () {
  const ctx = realm({ companies: [NO_NUM], serverFails: true });
  const n = await vm.runInContext("coAutoNumber(['co-new'])", ctx);
  assert.equal(n, 0);
  assert.equal(ctx._saved.length, 0);
  const said = (ctx._toasts || []).join(' ');
  assert.match(said, /못 주었습니다/, '★ 못 줬는데 아무 말이 없습니다');
  assert.match(said, /띠에서 다시/, '★ 어디서 다시 하는지 안 알려 줍니다');
});

test('⑥ 저장이 거절되면 조용히 넘어가지 않는다', async function () {
  const ctx = realm({ companies: [NO_NUM], saveFails: true });
  const n = await vm.runInContext("coAutoNumber(['co-new'])", ctx);
  assert.equal(n, 0);
  assert.match((ctx._toasts || []).join(' '), /못 주었습니다/);
});

test('⑦ 고른 것만 준다 — 남의 업체까지 건드리지 않는다', async function () {
  const other = { id: 'co-other', name: '남의 곳', typeCode: '자문', status: 'active' };
  const ctx = realm({ companies: [NO_NUM, other] });
  const n = await vm.runInContext("coAutoNumber(['co-new'])", ctx);
  assert.equal(n, 1);
  assert.deepEqual(ctx._saved[0][1].map(function (c) { return c.id; }), ['co-new'],
    '★ 지목하지 않은 업체에도 번호를 줬습니다');
});

/* ── 붙어 있는가 ──────────────────────────────────────────────────────── */

test('⑧ ★ 이관이 끝나면 «곧바로» 준다', function () {
  const doT = stripComments('<script>' + cutFn(src, 'async function doTransfer(') + '</script>');
  assert.match(doT, /coAutoNumber\(\[_arrivedCo\.id\]\)/, '★ 이관 뒤 번호를 안 줍니다');
  /* ⚠ 기다리면 이관 완료 알림이 서버 왕복만큼 늦는다 — await 를 붙이지 않는다 */
  assert.ok(!/await coAutoNumber\(/.test(doT), '★ 번호통을 기다리느라 이관 알림이 늦습니다');
  const at = doT.indexOf('coAutoNumber([_arrivedCo.id])');
  const ok = doT.indexOf('transferContract(ct)');
  assert.ok(at > ok, '★ 업체가 생기기도 전에 번호를 주려 합니다');
});

test('⑨ ★ 환경설정도 «같은 함수»를 쓴다 — 두 벌이면 규칙이 갈라진다', function () {
  const panel = stripComments('<script>' + cutFn(src, 'function CoNumberPanel(') + '</script>');
  assert.match(panel, /coAssignNumbers\(todo\)/, '★ 환경설정이 번호를 따로 셈하고 있습니다');
  assert.ok(!/puNoHistory:\s*\[\{/.test(panel), '★ 이력 만들기가 두 벌입니다');
});

test('⑩ ★ 업체관리에 «번호 없는 곳»이 보인다 — 없으면 안 그린다', function () {
  assert.match(bare, /var noNo = coNoTargets\(companies\);/, '★ 업체관리가 번호 빈 곳을 안 셉니다');
  assert.match(bare, /if\(!noNo\.length\) return null;/, '★ 없을 때도 단추가 나옵니다');
  assert.match(bare, /번호 없는 업체 ' \+ noNo\.length \+ '곳/, '★ 몇 곳인지 안 말해 줍니다');
  /* 누르면 실제로 주고, 준 뒤 목록을 다시 그린다 */
  assert.match(bare, /coAutoNumber\(noNo\.map\(function\(c\)\{ return c\.id; \}\), function\(\)\{/,
    '★ 단추가 번호를 안 줍니다');
  assert.match(bare, /setCoNoBusy\(false\); refreshCompanies\(\);/, '★ 주고 나서 목록이 그대로입니다');
});
