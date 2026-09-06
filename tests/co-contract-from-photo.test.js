'use strict';
/* 업체 계약정보를 «계약서 사진»에서 채운다 (2026-09-06 대표 지시)

   ■ 무엇이 문제였나 — 실측
   업체 373곳 가운데 계약관리에 계약서가 있는 곳은 29곳(8%), 그중 쓸 값이 있는 곳은 9곳(2%).
   그런데 계약 종료일이 빈 업체가 189곳, 월 자문료가 빈 업체가 154곳이다.
   「계약관리에서 당겨오기」는 364곳에서 줄 것이 없는데, 화면은 늘 같은 말
   (「채울 빈 칸이 없었습니다」)만 해서 계약서에 값이 있는데 안 가져온 것처럼 들렸다.

   그리고 더 큰 것 — 계약은 기간을 startDate·endDate 에 담는데
   옮김이는 contractEndDate 를 읽고 있었다. 그 칸은 계약 129건 «전부» 비어 있다.
   그래서 계약서에 종료일이 적혀 있어도 못 읽고 늘 「계약일 + 1년」을 지어냈다.

   ■ 못 박는 것
     ① 계약서 사진의 판독값 → 업체 칸 (금액 «단위»는 짐작하지 않는다)
     ② 계약 기록에서 옮길 때 실제로 쓰는 칸 이름(startDate·endDate)을 본다
     ③ 사진첩 당겨오기 창이 계약서도 읽는다 — 창을 새로 만들지 않는다
     ④ 빈손일 때 «왜» 빈손인지 갈라서 말한다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const APP = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const bare = stripComments(src);

function realm() {
  const ctx = { Math, Date, parseInt, parseFloat, String, Number, Object, Array, isNaN, console, window: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  /* localYMD 는 이 파일이 아니라 js/ 쪽에 있다 — 여기서는 흉내만 낸다 */
  vm.runInContext('function localYMD(d){ '
    + 'var p=function(n){return (n<10?"0":"")+n;}; '
    + 'return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()); }', ctx);
  /* 이름표 표는 «소스 그대로» 싣는다 — 여기 베껴 두면 칸이 늘어도 검사가 모른다 */
  const at = src.indexOf('var ERP_CO_PULL_LABEL = {');
  assert.ok(at > 0, 'ERP_CO_PULL_LABEL 을 찾지 못했습니다');
  vm.runInContext(src.slice(at, src.indexOf('};', at) + 2), ctx);
  ['function erpVatTextToFlag(', 'function erpPhotoToCoFields(',
   'function erpCoBlank(', 'function erpCoPullShow(', 'function erpCoPullRows(',
   'function erpCoPullApply(', 'function erpContractToCoFields(']
    .forEach((d) => vm.runInContext(cutFn(src, d), ctx));
  return ctx;
}

test('① 계약서 사진의 판독값이 업체 칸으로 옮겨진다', () => {
  const c = realm();
  const r = c.erpPhotoToCoFields({
    company: '어느 업체', fee: '165,000', startDate: '2026-07-20', endDate: '2027-07-19',
    vat: '부가세 포함', ceo: '홍길동', bizno: '312-81-43008'
  });
  assert.strictEqual(r.fields.monthlyAdvisoryFee, 165000);
  assert.strictEqual(r.fields.contractStartDate, '2026-07-20');
  assert.strictEqual(r.fields.contractEndDate, '2027-07-19');
  assert.strictEqual(r.fields.vatType, 'inclusive', '업체관리의 「포함」 값은 inclusive 다');
  assert.strictEqual(r.fields.ceo, '홍길동');
  assert.strictEqual(r.fields.bizNo, '312-81-43008');
});

test('★ ① 금액의 «단위»는 짐작하지 않는다 — 만 배 틀리느니 안 채운다', () => {
  const c = realm();
  const r = c.erpPhotoToCoFields({ fee: '1,000만원' });
  assert.strictEqual(r.fields.monthlyAdvisoryFee, undefined,
    '"1,000만원" 을 1,000원으로 넣으면 만 배 틀린다 — 안 채워야 한다');
  assert.ok(r.murky.some((m) => /1,000만원/.test(m)), '못 읽었다고 «말해야» 한다');
  /* 숫자만 있으면 읽는다 */
  assert.strictEqual(c.erpPhotoToCoFields({ fee: '220000' }).fields.monthlyAdvisoryFee, 220000);
});

test('① 보수가 먼저, 없으면 계약금 · 없는 칸은 아예 안 만든다', () => {
  const c = realm();
  assert.strictEqual(c.erpPhotoToCoFields({ fee: '300000', deposit: '500000' })
    .fields.monthlyAdvisoryFee, 300000, '업체 자문계약은 «보수»가 먼저다');
  assert.strictEqual(c.erpPhotoToCoFields({ deposit: '500000' })
    .fields.monthlyAdvisoryFee, 500000);
  const empty = c.erpPhotoToCoFields({});
  assert.strictEqual(Object.keys(empty.fields).length, 0,
    '판독값이 없으면 빈 값으로 «덮어쓰지» 않는다');
});

test('★ ② 계약 기록의 기간은 startDate·endDate 에 있다 (contractEndDate 는 늘 비어 있다)', () => {
  const c = realm();
  const v = c.erpContractToCoFields({
    contractNo: '계약-2026-070', signDate: '2026-07-01',
    startDate: '2026-07-20', endDate: '2027-07-19'
  });
  assert.strictEqual(v.contractEndDate, '2027-07-19',
    '계약서에 적힌 종료일을 두고 「계약일 + 1년」을 지어내면 안 된다');
  assert.strictEqual(v.contractStartDate, '2026-07-20',
    '개시일(startDate)이 있으면 서명일(signDate)보다 그것이다');
});

test('② 아무 데도 없을 때만 계약일 + 1년을 지어낸다', () => {
  const c = realm();
  const v = c.erpContractToCoFields({ signDate: '2026-07-01' });
  assert.strictEqual(v.contractStartDate, '2026-07-01');
  assert.strictEqual(v.contractEndDate, '2027-07-01');
});

test('③ 빈 칸·같음·다름을 갈라 본다 — 자문료 0 과 부가세 미확정이 «빈 것»이다', () => {
  const c = realm();
  const rows = c.erpCoPullRows(
    { monthlyAdvisoryFee: 165000, vatType: 'inclusive', ceo: '홍길동' },
    { monthlyAdvisoryFee: 0, vatType: 'unspecified', ceo: '김철수' });
  const by = {}; rows.forEach((r) => { by[r.k] = r; });
  assert.strictEqual(by.monthlyAdvisoryFee.state, 'fill', '0 원은 «빈 것»이다');
  assert.strictEqual(by.vatType.state, 'fill', '미확정은 «빈 것»이다');
  assert.strictEqual(by.ceo.state, 'diff', '값이 다르면 사람이 골라야 한다');
  assert.ok(/165,000/.test(by.monthlyAdvisoryFee.show), '금액은 쉼표를 찍어 보인다');
  assert.strictEqual(by.vatType.show, '포함', '부가세는 우리말로 보인다');
});

test('③ 같은 값이면 「같음」 — 자문료 165000 과 "165,000" 을 다르다고 하지 않는다', () => {
  const c = realm();
  const rows = c.erpCoPullRows({ monthlyAdvisoryFee: 165000 }, { monthlyAdvisoryFee: '165000' });
  assert.strictEqual(rows[0].state, 'same');
});

test('③ 사진첩 당겨오기 창이 «계약서»도 읽는다 — 창을 새로 만들지 않는다', () => {
  assert.ok(/r\.kind !== 'bizreg' && r\.kind !== 'sme' && r\.kind !== 'contract'/.test(bare),
    '계약서를 안 읽으면 계약기간·자문료의 출처가 없다');
  assert.ok(/erpPhotoToCoFields\(f\)\.fields/.test(bare),
    '계약서는 판독 칸 이름이 달라 전용 옮김이를 써야 한다');
  assert.ok(/📄 사진첩 · 계약서/.test(bare), '목록에서 무슨 서류인지 보여야 한다');
  /* 업체 수정 창에 사진첩 창이 «둘» 생기면 안 된다 */
  assert.strictEqual((bare.match(/h\(CoPullModal,/g) || []).length, 1,
    '사진첩 당겨오기 창이 둘이면 한쪽만 고치는 사고가 난다');
});

test('④ 빈손일 때 «왜» 빈손인지 갈라서 말한다', () => {
  /* ⚠ cutFn 에 여는 중괄호까지 넘기면 «그다음» 중괄호부터 세어 함수가 잘린다 */
  const fn = cutFn(bare, 'function fillFromContract(');
  assert.ok(/계약관리에서 못 찾았습니다/.test(fn), '계약 자체가 없을 때를 안 가른다');
  assert.ok(/업체명·사업자번호가 다릅니다/.test(fn),
    '무엇을 고치면 찾아지는지 안 적으면 거기서 길이 끊긴다');
  assert.ok(/금액·기간이 안 적혀 있습니다/.test(fn), '계약은 있는데 조건이 없을 때를 안 가른다');
  assert.ok(/이미 채워져 있습니다/.test(fn), '이미 차 있을 때를 안 가른다');
  /* 세 경우 모두 «다음 걸음»을 가리켜야 한다 */
  assert.ok((fn.match(/사진첩/g) || []).length >= 2,
    '빈손이면 사진첩으로 가는 길을 알려 줘야 한다');
});

test('④ 단추 이름이 «어디서» 가져오는지 말한다', () => {
  assert.ok(/'📄 계약관리에서 당겨오기'/.test(bare),
    '「계약서에서」라고 하면 스캔한 계약서를 읽는 줄 알게 된다 (대표 지적)');
  assert.ok(!/'📄 계약서에서 당겨오기'/.test(bare), '옛 이름이 남아 있다');
});
