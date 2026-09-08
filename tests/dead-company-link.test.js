'use strict';
/* 「계약과 회사정보의 업체 ID가 다릅니다」가 자꾸 뜨던 것   2026-09-08

   대표 지적: 「자꾸 업체연결이 안된다고 나온다 … 벌써 여러 사업장이 문제가 발생했다」

   ■ 무엇이 문제였나
   업체 ID 가 «두 자리»에 있다 — 계약의 companyId 와 company.companyId.
   실측(계약 129건): 회사정보 쪽 39건이 «명부에 없는» 옛 열쇠였다
   (co-adv-050 · co-c69 · co-s51 … 심지어 계약 id(ct-…)·기금 id(fd-…)까지).
   위쪽 companyId 는 그 39건 «전부» 살아 있다 — 회사정보 쪽이 낡은 사본이다.
   그 낡은 사본 하나 때문에 저장이 막히고 창에 빨간 글이 떴다.

   ■ 이 검사가 지키는 것
     ① 죽은 ID 는 «없는 것»으로 본다 — 살아 있는 위쪽으로 통과한다
     ② 둘 «다 살아 있는데 다른» 경우는 그대로 막는다 (사람이 골라야 한다)
     ③ 살아 있는 값을 함부로 지우지 않는다
     ④ 저장 문과 화면 알림이 «같은 눈»으로 본다 */

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
  sb.exports = sb.module.exports; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-ontology.js'), 'utf8'), sb);
  return sb.window.PuOntology || sb.module.exports;
}
function realm() {
  const ctx = { console: console, window: {} };
  vm.createContext(ctx);
  vm.runInContext(cutFn(src, 'function erpDropDeadCoLink('), ctx);
  return ctx;
}
const drop = (form, cos) => {
  const ctx = realm();
  return vm.runInContext('erpDropDeadCoLink(' + JSON.stringify(form) + ',' + JSON.stringify(cos) + ')', ctx);
};

const LIVE_A = { id: 'co-real-097', name: '삼화케미칼㈜' };
const LIVE_B = { id: 'co-s73', name: '㈜유원에프앤비' };

test('① 죽은 ID 는 «없는 것»으로 본다 — 살아 있는 위쪽만 남는다', function () {
  /* 실제로 있던 꼴: 위 co-real-097(살아 있음) · 회사정보 co-adv-050(명부에 없음) */
  const f = { companyId: 'co-real-097', company: { companyId: 'co-adv-050', name: '삼화케미칼㈜' } };
  const out = drop(f, [LIVE_A]);
  assert.equal(out.company.companyId, '', '★ 죽은 ID 가 남아 있어 계속 막힙니다');
  assert.equal(out.companyId, 'co-real-097', '★ 살아 있는 위쪽을 건드렸습니다');
  assert.equal(out.company.name, '삼화케미칼㈜', '다른 칸은 그대로');
});

test('② ★ 둘 다 살아 있으면 «그대로 막는다» — 그때는 사람이 골라야 한다', function () {
  /* 계약-2026-087: ㈜유원에프앤비 vs ㈜유원에프앤비(본점) — 둘 다 명부에 있다 */
  const other = { id: 'co-imp-52', name: '㈜유원에프앤비(본점)' };
  const f = { companyId: 'co-s73', company: { companyId: 'co-imp-52' } };
  const out = drop(f, [LIVE_B, other]);
  assert.equal(out.company.companyId, 'co-imp-52', '★ 살아 있는 값을 지웠습니다 — 잘못 이어질 수 있습니다');
  const O = ontology();
  assert.equal(O.validateCompanyLink(out, [LIVE_B, other]).code, 'conflicting_company_ids',
    '★ 사람이 골라야 하는 자리인데 통과시켰습니다');
});

test('③ ★ 고친 뒤 실제로 «통과»하는가 — 온톨로지 검증을 함께 돌린다', function () {
  const O = ontology();
  const f = { companyId: 'co-real-097', companyName: '삼화케미칼㈜',
              company: { companyId: 'co-adv-050', name: '삼화케미칼㈜' } };
  assert.equal(O.validateCompanyLink(f, [LIVE_A]).code, 'conflicting_company_ids', '고치기 전에는 막힌다');
  const r = O.validateCompanyLink(drop(f, [LIVE_A]), [LIVE_A]);
  assert.equal(r.ok, true, '★ 고친 뒤에도 막힙니다');
  assert.equal(r.companyId, 'co-real-097');
});

test('④ 위쪽이 비고 회사정보 쪽만 죽었으면 — 「업체를 고르세요」로 간다', function () {
  const O = ontology();
  const f = { companyId: '', company: { companyId: 'ct-mpb4pg2kf5l' } };   // 계약 id 가 들어가 있던 실제 꼴
  const r = O.validateCompanyLink(drop(f, [LIVE_A]), [LIVE_A]);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'company_selection_required',
    '★ 「ID가 없거나 중복되어」 대신 무엇을 하라는 말이 나와야 합니다');
});

test('⑤ 지울 것이 없으면 손대지 않는다', function () {
  const same = { companyId: 'co-real-097', company: { companyId: 'co-real-097' } };
  assert.equal(drop(same, [LIVE_A]).company.companyId, 'co-real-097');
  assert.equal(drop({ companyId: 'co-real-097' }, [LIVE_A]).company, undefined, '없던 칸을 만들지 않습니다');
  assert.equal(drop({}, [LIVE_A]).companyId, undefined);
  assert.equal(drop(null, []).company, undefined, '빈 값에도 안 터집니다');
});

test('⑥ 지워진 업체(_deleted)는 «죽은 것»으로 본다', function () {
  const gone = { id: 'co-gone', name: '지워진 곳', _deleted: true };
  const f = { companyId: 'co-real-097', company: { companyId: 'co-gone' } };
  assert.equal(drop(f, [LIVE_A, gone]).company.companyId, '',
    '★ 지워진 업체를 살아 있다고 보고 있습니다');
});

/* ── 붙어 있는가 ──────────────────────────────────────────────────────── */

test('⑦ ★ 저장 문이 이 눈으로 본다', function () {
  const v = stripComments('<script>' + cutFn(src, 'function erpValidateContractCompany(') + '</script>');
  assert.match(v, /form=erpDropDeadCoLink\(form,_cos\);/, '★ 저장할 때 여전히 막힙니다');
  const at = v.indexOf('erpDropDeadCoLink');
  const ok = v.indexOf('validateCompanyLink(form');
  assert.ok(at > 0 && ok > at, '★ 검증한 «뒤»에 걷고 있습니다 — 순서가 거꾸로입니다');
});

test('⑧ ★ 화면 알림도 «같은 눈»으로 본다 — 저장은 되는데 빨간 글이 남으면 안 된다', function () {
  assert.match(bare, /validateCompanyLink\(erpDropDeadCoLink\(f,dbGet\('companies',\[\]\)\)/,
    '★ 창의 경고가 옛 눈으로 보고 있습니다');
});

test('⑨ 죽은 ID 를 «지우지» 않는다 — 못 본 척할 뿐이다', function () {
  const f = stripComments('<script>' + cutFn(src, 'function erpDropDeadCoLink(') + '</script>');
  assert.ok(!/dbUpsert|dbPatch|dbSet/.test(f),
    '★ 검증하는 자리에서 자료를 고치고 있습니다 — 읽기만 해야 합니다');
  assert.match(f, /Object\.assign\(\{\}, f/, '★ 원본을 그 자리에서 고치고 있습니다');
});
