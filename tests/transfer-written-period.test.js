'use strict';
/* 이관은 «사람이 적어 둔 계약기간»을 쓴다   (2026-09-08 대표 지시)

   ■ 무슨 일이 있었나
   「계약정보는 자문으로 하였다. 수정한것이기 때문에 이부분 반영하여야 한다」 —
   계약-2026-121 의 계약기간을 2026-09-01~2027-08-31 로 적어 두셨는데,
   이관은 그것을 «아예 안 보고» signDate(서명일)로 「계약일 + 1년」을 지어냈다.
   그 계약은 서명일이 비어 있어 **빈 칸**이 들어갈 참이었다.

   ■ 이미 넉 곳이 틀렸다 (2026-09-08 실측)
     아산우리신협 · 미소신협 · 행복신협  적힌 것 2026-07-01 → 들어간 것 2026-06-09
     평택시민의료생협                     적힌 것 2026-08-01 → 들어간 것 2026-07-04

   ■ 이 검사가 지키는 것 — 규칙이지 지금 값이 아니다
     ① 적어 둔 개시일·종료일이 있으면 «그것»이 들어간다
     ② 없을 때만 서명일 + 1년을 지어낸다
     ③ 부가세도 계약서에 적힌 것을 쓴다 (없으면 「별도」)
     ④ 이관과 「당겨오기」는 «같은 함수»로 셈한다 — 두 벌이면 화면마다 날짜가 갈린다 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { test } = require('node:test');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

/* 진짜 함수를 떼어 돌린다 — localYMD 만 대신 세운다(날짜를 글자로 만드는 일일 뿐) */
function fields(ct) {
  const ctx = {
    console: console,
    localYMD: function (d) {
      const p = (n) => (n < 10 ? '0' : '') + n;
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(src, 'function erpContractToCoFields('), ctx);
  return vm.runInContext('erpContractToCoFields(' + JSON.stringify(ct) + ')', ctx);
}

test('① 적어 둔 계약기간이 그대로 들어간다 — 나래(계약-2026-121)가 겪은 것', function () {
  const f = fields({ contractNo: '계약-2026-121', signDate: '',
    startDate: '2026-09-01', endDate: '2027-08-31',
    typeCodes: { company: '자문' }, amounts: { company: 300000 } });
  assert.equal(f.contractStartDate, '2026-09-01', '★ 적어 둔 개시일이 안 들어갑니다');
  assert.equal(f.contractEndDate, '2027-08-31', '★ 적어 둔 종료일이 안 들어갑니다');
  assert.equal(f.typeCode, '자문');
  assert.equal(f.monthlyAdvisoryFee, 300000);
});

test('② 서명일과 개시일이 «다르면» 개시일이 이긴다 — 신협 셋이 겪은 것', function () {
  const f = fields({ signDate: '2026-06-09', startDate: '2026-07-01', endDate: '' });
  assert.equal(f.contractStartDate, '2026-07-01', '★ 서명일이 개시일을 덮고 있습니다');
  /* 종료일이 안 적혔으면 지어낸다 — 그때만 서명일을 쓴다 */
  assert.equal(f.contractEndDate, '2027-06-09', '종료일이 없을 때는 서명일 + 1년');
});

test('③ 아무것도 안 적혔으면 서명일 + 1년을 지어낸다 (옛 행동 그대로)', function () {
  const f = fields({ signDate: '2026-05-11' });
  assert.equal(f.contractStartDate, '2026-05-11');
  assert.equal(f.contractEndDate, '2027-05-11');
});

test('④ 날짜가 하나도 없으면 빈 칸 — 없는 날짜를 지어내지 않는다', function () {
  const f = fields({ contractNo: 'x' });
  assert.equal(f.contractStartDate, '');
  assert.equal(f.contractEndDate, '');
});

test('⑤ 옛 이름(contractStartDate·contractEndDate)도 계속 읽는다', function () {
  const f = fields({ contractStartDate: '2025-01-01', contractEndDate: '2025-12-31' });
  assert.equal(f.contractStartDate, '2025-01-01');
  assert.equal(f.contractEndDate, '2025-12-31');
});

test('⑥ 부가세는 계약서에 적힌 것을 쓴다 — 없을 때만 「별도」', function () {
  assert.equal(fields({ vatType: 'inclusive' }).vatType, 'inclusive', '★ 계약서의 부가세를 무시합니다');
  assert.equal(fields({}).vatType, 'separate');
});

/* ── 여기부터는 «이관이 실제로 그 함수를 쓰는가» ─────────────────────────── */
const XFER = stripComments('<script>' + cutFn(src, 'function transferContract(') + '</script>');
const COMPANY = XFER.slice(XFER.indexOf("if(kindV === 'company')"), XFER.indexOf("if(kindV === 'case')"));

test('⑦ ★ 이관이 「당겨오기」와 «같은 함수»로 셈한다 — 두 벌이면 화면마다 날짜가 갈린다', function () {
  assert.match(COMPANY, /erpContractToCoFields\(contract\)/,
    '★ 이관이 계약기간을 따로 셈하고 있습니다 — 당겨오기와 갈라집니다');
});

test('⑧ ★ 이관이 서명일을 계약기간에 «곧바로» 넣지 않는다', function () {
  assert.ok(!/contractStartDate:\s*contract\.signDate/.test(COMPANY),
    '★ 적어 둔 개시일을 건너뛰고 서명일을 넣고 있습니다');
  assert.match(COMPANY, /contractStartDate:\s*_coFields\.contractStartDate/,
    '★ 한 곳에서 뽑은 값을 써야 합니다');
});

test('⑨ ★ 부가세를 「별도」로 못 박지 않는다 — 계약서에 적힌 것이 있다', function () {
  assert.ok(!/vatType:\s*'separate'/.test(COMPANY),
    '★ 부가세가 못 박혀 있어 계약서의 「포함」이 버려집니다');
  assert.match(COMPANY, /vatType:\s*_coFields\.vatType/);
});

test('⑩ 지어내는 규칙은 «한 곳»에만 있다 — 이관 쪽에 다시 생기면 갈라진다', function () {
  assert.ok(!/setFullYear\(\s*d\.getFullYear\(\)\s*\+\s*1\s*\)/.test(COMPANY),
    '★ 이관이 「+1년」을 다시 셈하고 있습니다 — erpContractToCoFields 한 곳에만 두세요');
});
