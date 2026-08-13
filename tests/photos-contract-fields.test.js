/* 계약서 — 위임사무·부가세·상대 연락처까지 읽는다 (대표 지시 2026-08-13)
   "위임계약서에 위임사무 등도 읽어야 되고 보수도 부가세 포함인지 별도인지도
    읽어야 한다. 그리고 대표자 주소 연락처 사업체도 읽어야 추후 계약관리에
    연동할 수 있다."

   ⚠ 실제 오독(대표 화면 2026-08-13): 서명란의 **우리 쪽(을)** 을 상대로 담아
     상호에 「푸른노무법인」, 대표자에 「권형하」가 들어왔다. 계약서에는 갑·을이
     함께 적혀 있어서, 어느 쪽을 담을지 말해 주지 않으면 뒤엣것을 담는다.
     이 검사가 지키는 가장 중요한 것이 그 한 줄이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'js', 'pu-doc-read.js'), 'utf8');

function fnOf(src, name, indent) {
  const pad = indent || '';
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n' + pad + '\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* 계약서 프롬프트 줄만 잘라 본다 */
const contractLine = (function () {
  const m = lib.match(/'\\nkind=contract 이면 키:[\s\S]*?' \+/);
  assert.ok(m, '계약서 프롬프트를 찾을 수 없습니다');
  return m[0];
})();

test('★ 우리 쪽이 아니라 상대 업체를 담으라고 못 박는다', () => {
  /* 이 한 줄이 없으면 서명란의 푸른노무법인이 상호로 들어온다 — 실제로 그랬다 */
  assert.match(lib, /company·ceo·address·companyTel 에는 \*\*상대 업체\(갑\) 쪽\*\*을 담으세요/,
    '갑·을 중 어느 쪽인지 안 알려 주면 우리 사무소가 상대 업체로 들어옵니다');
  assert.match(lib, /푸른노무법인 쪽 정보를 담으면 안 됩니다/,
    '무엇을 담으면 안 되는지까지 적어야 확실합니다');
});

test('★ 위임사무(맡은 일)를 읽는다', () => {
  assert.match(contractLine, /scope\(위임사무·업무 범위/,
    '무슨 일을 맡았는지가 없으면 계약서가 「돈과 날짜」만 남습니다');
});

test('★ 보수의 부가세 포함·별도를 읽는다', () => {
  assert.match(contractLine, /vat\(부가세 — 별도\/포함/,
    '부가세를 모르면 500,000원이 실제로 얼마인지 알 수 없습니다');
  assert.match(contractLine, /표기가 없으면 빈 문자열/,
    '안 적힌 것을 「별도」로 지어내면 청구액이 틀어집니다');
});

test('★ 계약관리로 잇는 데 필요한 상대 정보를 읽는다', () => {
  /* 대표 지시: "대표자 주소 연락처 사업체도 읽어야 추후 계약관리에 연동" */
  for (const k of ['company(상대 업체 상호)', 'ceo(상대 업체 대표자)',
                   'address(상대 업체 주소)', 'companyTel(상대 업체 연락처)',
                   'bizno(상대 사업자등록번호']) {
    assert.ok(contractLine.indexOf(k) >= 0, '계약관리 연동에 쓸 ' + k + ' 가 없습니다');
  }
});

test('★ 판 번호가 올랐다 — 이미 읽힌 계약서가 다시 읽힌다', () => {
  const v = lib.match(/var READ_VERSION = (\d+);/);
  assert.ok(v && +v[1] >= 7,
    '판 번호를 안 올리면 위임사무·부가세 없이 읽힌 계약서가 그대로 굳습니다: ' + (v && v[1]));
});

test('★ 새 칸들이 화면에 이름표를 갖는다', () => {
  /* 이름표가 없는 항목은 패널에 아예 안 나와서 「안 읽혔다」로 보인다 */
  const rows = app.match(/const READ_ROWS = \[[\s\S]*?\n\];/)[0];
  assert.match(rows, /\['scope', '위임사무'\]/);
  assert.match(rows, /\['vat', '부가세'\]/);
  assert.match(rows, /\['address', '소재지'\]/, '상대 주소를 보여 줄 자리가 없습니다');
  assert.match(rows, /\['companyTel', '대표번호'\]/, '상대 연락처를 보여 줄 자리가 없습니다');
});

test('★ 계약서도 판이 화면 절반을 쓴다 — 실제로 돌려 본다', () => {
  /* 칸이 열 개를 넘어 440px 에서는 한 줄이 두 줄로 접힌다 */
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'wideKind'), ctx);
  assert.equal(ctx.wideKind({ kind: 'contract' }), true, '계약서가 안 넓혀집니다');
  assert.equal(ctx.wideKind({ kind: 'timesheet' }), true);
  assert.equal(ctx.wideKind({ kind: 'form' }), true);
  assert.equal(ctx.wideKind({ kind: 'card' }), false, '명함까지 넓히면 사진이 좁아집니다');
});

test('★ 계약서 판독이 상대 업체를 담는지 — 실제로 돌려 본다', async () => {
  const ctx = { Promise, Object, String };
  vm.createContext(ctx);
  vm.runInContext(lib.match(/var KINDS = \{[^\n]*/)[0], ctx);
  vm.runInContext('var deps = {};', ctx);
  ['bizNoDigits', 'bizNoValid', 'fmtBizNo', 'afterRead'].forEach(function (n) {
    vm.runInContext(fnOf(lib, n, '  '), ctx);
  });
  /* 대표 화면의 위임계약서를 그대로 흉내 낸다 */
  const out = await ctx.afterRead({
    kind: 'contract', company: '㈜맥스텍', ceo: '양명헌',
    address: '충남 천안시 서북구 2공단 2로 95, 402호 508호', companyTel: '041-557-7600',
    docName: '위임계약서', scope: '인사노무진단(RBA 점검)',
    signDate: '2026-07-16', startDate: '2026-07-16', endDate: '2026-07-31',
    fee: '500,000원', vat: '별도'
  });
  assert.equal(out.kind, 'contract');
  assert.equal(out.fields.company, '㈜맥스텍', '상대 업체가 아니라 우리 사무소가 담겼습니다');
  assert.equal(out.fields.ceo, '양명헌');
  assert.equal(out.fields.scope, '인사노무진단(RBA 점검)');
  assert.equal(out.fields.vat, '별도');
  assert.equal(out.fields.companyTel, '041-557-7600');
  assert.equal(out.bizNoOk, null,
    '계약서에 사업자번호가 없으면 검증 대상이 아닙니다 — false 면 「검증 실패」로 오해합니다');
});
