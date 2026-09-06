'use strict';
/* 계약서에서 계약정보 당겨오기 — 대표 지시 2026-08-31

   업체관리의 계약정보(유형·기간·자문료·부가세)는 계약관리에서 «이관»될 때 한 번
   채워진다. 그런데 세 경우에 어긋난 채로 남는다 —
     · 이관 전에 업체를 손으로 먼저 만든 경우
     · 이관 뒤에 계약서가 고쳐진 경우
     · 이관이 「빈 칸만 채우기」라 그때 비어 있지 않아 건너뛴 칸
   그때 사람이 계약서를 열어 놓고 손으로 다시 친다. 그 손을 없앤다.

   ⚠ 저절로 덮어쓰지 않는다. 사람이 «누를 때»만, 그것도 «빈 칸만».
     업체관리에서 고쳐 둔 값을 계약서 값으로 조용히 되돌리면 그게 더 나쁘다.

   이 검사가 못 박는 것 —
     ① 계약서를 네 가지 열쇠로 찾는다 (계약번호 → 업체번호 → 사업자번호 → 이름)
     ② 여럿이면 «가장 최근에 맺은» 것
     ③ 종료일이 비었으면 이관과 «같은 규칙»(계약일 + 1년)으로 셈한다
     ④ 빈 칸만 채우고, 채운 것·그냥 둔 것을 말해 준다
     ⑤ 「비었다」의 뜻이 칸마다 다르다 — 자문료는 0, 부가세는 미확정

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const ctx = {
  window: {},
  /* 이관 코드가 쓰는 날짜 찍개 — 같은 것을 쓴다 */
  localYMD: (d) => d.getFullYear() + '-'
    + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2),
  Date,
};
vm.createContext(ctx);
vm.runInContext(
  cutFn(src, 'function erpContractForCompany(') + '\n'
  + cutFn(src, 'function erpContractToCoFields(') + '\n'
  + 'this.find = erpContractForCompany; this.toFields = erpContractToCoFields;', ctx);
const { find, toFields } = ctx;

const CT = (o) => Object.assign({ contractNo: 'C-1', signDate: '2026-07-20',
  companyName: '미소신협', bizNo: '123-45-67890' }, o);

/* ══════ ① 네 가지 열쇠 ══════ */

test('★★ 계약번호가 적혀 있으면 그것이 가장 확실하다', () => {
  const got = find({ sourceContractNo: 'C-9', name: '딴이름' },
    [CT({ contractNo: 'C-1' }), CT({ contractNo: 'C-9', companyName: '딴회사' })]);
  assert.equal(got.contractNo, 'C-9',
    '★★ 적어 둔 계약번호를 안 보면, 이름이 바뀐 업체가 엉뚱한 계약을 물어옵니다');
});

test('★ 사업자번호가 같으면 이름이 달라도 같은 회사다', () => {
  const got = find({ name: '(주)미소신협 천안점', bizNo: '1234567890' },
    [CT({ contractNo: 'C-7', companyName: '미소신협' })]);
  assert.equal(got.contractNo, 'C-7',
    '★ 이름 표기가 조금만 달라도 못 찾으면, 결국 손으로 칩니다');
});

test('★ 이름은 띄어쓰기·대소문자를 무시하고 맞춘다', () => {
  const got = find({ name: ' 미소 신협 ' }, [CT({ bizNo: '' })]);
  assert.ok(got, '★ 띄어쓰기 하나로 못 찾으면 안 됩니다');
});

test('★★ 남의 계약서를 물어오지 않는다', () => {
  assert.equal(find({ name: '없는회사' }, [CT({})]), null,
    '★★ 아무거나 물어오면, 남의 계약 금액이 이 업체에 들어갑니다');
});

test('★★ 여럿이면 «가장 최근에 맺은» 것', () => {
  const got = find({ name: '미소신협' },
    [CT({ contractNo: 'C-옛', signDate: '2024-01-01' }),
      CT({ contractNo: 'C-새', signDate: '2026-07-20' })]);
  assert.equal(got.contractNo, 'C-새',
    '★★ 옛 계약으로 채우면, 지난해 자문료가 올해 값으로 들어갑니다');
});

/* ══════ ②③ 값 뽑기 ══════ */

test('★ 업체계약 금액을 쓴다 — 종류별로 나뉘어 있다', () => {
  const v = toFields(CT({ amounts: { company: 165000, case: 3000000 } }));
  assert.equal(v.monthlyAdvisoryFee, 165000,
    '★ 사건 금액을 월 자문료로 넣으면 매달 300만원이 잡힙니다');
});

test('★★ 종료일이 없으면 이관과 «같은 규칙»으로 셈한다 (계약일 + 1년)', () => {
  const v = toFields(CT({ signDate: '2026-07-20' }));
  assert.equal(v.contractEndDate, '2027-07-20',
    '★★ 규칙이 두 곳에서 다르면, 같은 계약이 화면마다 다른 날로 보입니다');
  /* 계약서에 적힌 종료일이 있으면 그것이 먼저다 */
  assert.equal(toFields(CT({ contractEndDate: '2028-01-01' })).contractEndDate, '2028-01-01');
});

test('★ 부가세는 계약서에 없으면 「별도」 — 이관 때와 같은 값', () => {
  assert.equal(toFields(CT({})).vatType, 'separate');
  assert.equal(toFields(CT({ vatType: 'inclusive' })).vatType, 'inclusive');
});

/* ══════ ④⑤ 채우는 규칙 ══════ */

test('★★ 빈 칸만 채운다 — 적어 둔 값을 계약서로 되돌리지 않는다', () => {
  const body = bare(cutFn(src, '  function fillFromContract('));
  /* 2026-09-06: 「비었다」 판정을 coFieldBlank 로 빼냈다 — 사진첩 길과 «같은 자»를 쓰려고.
     글자가 아니라 «빈 칸이 아니면 그냥 둔다»는 규칙을 본다. */
  assert.match(body, /if\(!coFieldBlank\([\s\S]{0,40}?\)\)\{ kept\.push/,
    '★★ 이미 적어 둔 칸을 덮어쓰면, 업체관리에서 고쳐 둔 것이 말없이 사라집니다');
  assert.match(body, /got\.push\(LABEL\[k\]\)/, '★ 무엇을 채웠는지 안 세면 알려 줄 수 없습니다');
  assert.match(body, /showToast\(/, '★ 말없이 채우면 무엇이 바뀐지 모릅니다');
  assert.match(body, /kept\.length\s*\?/,
    '★ 「그냥 둔 칸」을 안 알리면, 계약서와 다른 채로 남은 것을 모릅니다');
});

test('★★ 「비었다」의 뜻이 칸마다 다르다 — 자문료는 0, 부가세는 미확정', () => {
  /* 판정은 coFieldBlank 한 곳에 있다 — 계약관리 길과 사진첩 길이 «같은 자»를 써야
     두 단추가 서로 다른 말을 하지 않는다 (2026-09-06) */
  const body = bare(cutFn(src, '  function coFieldBlank('));
  assert.match(body, /monthlyAdvisoryFee'\)[\s\S]{0,40}parseInt\(now, 10\) > 0/,
    '★★ 자문료 0 을 「적어 둔 값」으로 보면, 0원짜리 업체가 영영 안 채워집니다');
  assert.match(body, /vatType'\)[\s\S]{0,40}'unspecified'/,
    '★★ 「⚠️ 미확정」을 «적어 둔 값»으로 보면, 미확정인 채로 굳습니다');
  /* 그 자를 «실제로» 쓰는지도 본다 — 함수만 있고 안 부르면 아무것도 안 지킨다 */
  assert.match(bare(cutFn(src, '  function fillFromContract(')), /coFieldBlank\(/,
    '★ 계약관리 길이 그 자를 안 씁니다');
});

test('★ 못 찾으면 «왜» 못 찾았는지 말한다', () => {
  const body = bare(cutFn(src, '  function fillFromContract('));
  assert.match(body, /못 찾았습니다/, '★ 아무 말 없이 끝나면 눌렀는지도 모릅니다');
  assert.match(body, /업체명·사업자번호가 다릅니다/,
    '★ 무엇을 고치면 되는지 안 적으면 거기서 길이 끊깁니다');
});

test('★ 어느 계약서에서 왔는지 남긴다', () => {
  const body = bare(cutFn(src, '  function fillFromContract('));
  assert.match(body, /nx\.sourceContractNo = v\.contractNo/,
    '★ 안 남기면 나중에 「이 값 어디서 왔나」를 물을 데가 없습니다');
});

/* ══════ 화면 ══════ */

test('★ 계약정보 칸에 당겨오는 단추가 있다', () => {
  const modal = src.slice(src.indexOf('function CompanyEditModal(props){'),
    src.indexOf('function CompanyEditModal(props){') + 70000);
  /* 2026-09-06 이름을 바로잡았다 — 이것은 «계약관리 기록»에서 가져온다.
     「계약서에서」라고 하면 스캔한 계약서를 읽는 줄 알게 된다(대표 지적). */
  assert.match(modal, /'📄 계약관리에서 당겨오기'/, '★ 단추가 없으면 쓸 길이 없습니다');
  assert.match(modal, /onClick:fillFromContract/, '★ 눌러도 아무 일이 없습니다');
  /* 무엇을 가져오고 무엇은 안 건드리는지 미리 알린다 */
  assert.match(modal, /이미 적어 둔 칸은 그대로 둡니다/,
    '★ 덮어쓸까 봐 못 누르면, 만든 뜻이 없습니다');
});

test('★★ 「자문료가 바뀐 이력」 이름표가 한 줄로 편다 (대표 2026-08-31)', () => {
  /* 이름표 칸이 110px 이라 긴 설명이 넉 줄로 접혔다. 이 칸만 한 칸 그리드로 편다.
     ⚠ 못 박는 것은 «몇 px» 이 아니라 «한 줄로 펴지는가» 다. */
  /* ⚠ 주석에도 같은 말이 있다 — «따옴표에 싸인 글»(화면에 그리는 이름표)을 찾는다 */
  const at = src.indexOf("'자문료가 바뀐 이력 '");
  assert.ok(at > 0, '그 이름표를 못 찾았습니다');
  const head = src.slice(at - 900, at + 200);
  assert.match(head, /gridTemplateColumns:'1fr'/,
    '★★ 두 칸 그리드 그대로면 110px 이름표에 긴 글이 접혀 넉 줄이 됩니다');
  assert.match(head, /whiteSpace:'nowrap'/, '★ 그래도 접히면 한 줄이 아닙니다');
  /* 긴 설명은 지우지 말고 마우스 위로 옮긴다 — 지우면 왜 적는 칸인지 모른다 */
  assert.match(head, /title:'자동이체가 익월/,
    '★ 설명을 통째로 지우면, 이 칸이 무엇인지 아무도 모릅니다');
});
